-- APE PRISMA v2.0 — Bandwidth Reactor + TELESCOPE L1 Engine (Lua)
-- RUNS: log_by_lua_file (after each response, ZERO impact on request)
-- SPEED: < 1ms per execution (shared dict operations are sub-microsecond)
-- PHILOSOPHY: CBR constant → instant VBR switch when floor breached → aggressive prefetch
--
-- TELESCOPE v2.1: Adds TTFB tracking, jitter estimation, L1 ring buffer (12 samples),
--   network trend analysis, and snapshot persistence for decision_engine.lua
--
-- PASSTHROUGH: This module NEVER blocks, NEVER returns errors, NEVER interferes.
-- It only MEASURES and COMPUTES. (AUTOPISTA SOP compliant)

local ok, err = pcall(function()

-- ═══ CONSTANTS ═══════════════════════════════════════════════════════════
local FLOOR_4K_BPS    = 13000000   -- 13 Mbps floor (user mandate)
local FLOOR_1080P_BPS = 8000000    -- 8 Mbps 1080p floor
local TARGET_4K_BPS   = 80000000   -- 80 Mbps ideal target
local PREFETCH_SEGMENTS = 4        -- Prefetch 4 segments ahead in playback order
local SEGMENT_DURATION  = 6        -- Typical HLS segment duration (seconds)
local EWMA_ALPHA       = 0.3       -- Exponential weighted moving average factor (reactive)
local L1_RING_SIZE     = 12        -- 12 samples ≈ 1.2s at ~100ms HLS segment cadence
local JITTER_EWMA_ALPHA = 0.2      -- Smoother alpha for jitter (less noisy)

-- Shared dict for cross-request state (defined in iptv-lua-circuit.conf)
local reactor = ngx.shared.circuit_metrics

if not reactor then
    return  -- No shared dict available, skip silently
end

-- ── MEASURE: Actual throughput + TTFB of THIS response ───────────────
local request_time  = tonumber(ngx.var.request_time) or 0
local bytes_sent    = tonumber(ngx.var.bytes_sent) or 0
local upstream_time = tonumber(ngx.var.upstream_response_time) or request_time
local header_time   = tonumber(ngx.var.upstream_header_time) or upstream_time
local status        = tonumber(ngx.var.status) or 0
local now           = ngx.now()

-- Only measure successful video/manifest responses
if status < 200 or status >= 400 or bytes_sent < 1024 then
    return
end

-- Calculate throughput in bits per second
local throughput_bps = 0
if upstream_time > 0.001 then  -- Avoid division by near-zero
    throughput_bps = math.floor((bytes_sent * 8) / upstream_time)
end

-- TTFB in milliseconds (time to first byte from upstream)
local ttfb_ms = math.floor(header_time * 1000)

-- ── EWMA: Smooth throughput ──────────────────────────────────────────
local prev_ewma = tonumber(reactor:get("bw_ewma_bps")) or throughput_bps
local ewma_bps  = math.floor(EWMA_ALPHA * throughput_bps + (1 - EWMA_ALPHA) * prev_ewma)

-- ── TTFB EWMA ────────────────────────────────────────────────────────
local prev_ttfb_ewma = tonumber(reactor:get("tl_ttfb_ewma_ms")) or ttfb_ms
local ttfb_ewma_ms   = math.floor(EWMA_ALPHA * ttfb_ms + (1 - EWMA_ALPHA) * prev_ttfb_ewma)

-- ── JITTER: Deviation of TTFB from its EWMA (RFC 3550 inspired) ─────
-- jitter = |current_ttfb - ttfb_ewma| smoothed with EWMA
local jitter_instant = math.abs(ttfb_ms - ttfb_ewma_ms)
local prev_jitter    = tonumber(reactor:get("tl_jitter_ewma_ms")) or 0
local jitter_ewma_ms = math.floor(JITTER_EWMA_ALPHA * jitter_instant + (1 - JITTER_EWMA_ALPHA) * prev_jitter)

-- ── L1 RING BUFFER (12 samples, ~1.2s window) ───────────────────────
-- Store as individual keys tl_l1_N_* for simplicity (shared dict doesn't support tables)
local l1_idx = (tonumber(reactor:get("tl_l1_idx")) or 0) % L1_RING_SIZE
reactor:set("tl_l1_" .. l1_idx .. "_ts",       now)
reactor:set("tl_l1_" .. l1_idx .. "_tp",       throughput_bps)
reactor:set("tl_l1_" .. l1_idx .. "_ttfb",     ttfb_ms)
reactor:set("tl_l1_" .. l1_idx .. "_jitter",   jitter_instant)
reactor:set("tl_l1_" .. l1_idx .. "_bytes",    bytes_sent)
reactor:set("tl_l1_" .. l1_idx .. "_status",   status)
reactor:set("tl_l1_idx", l1_idx + 1)

local l1_count = tonumber(reactor:get("tl_l1_count")) or 0
if l1_count < L1_RING_SIZE then
    reactor:set("tl_l1_count", l1_count + 1)
end

-- ── TREND: Linear regression slope over L1 window ────────────────────
-- Slope > 0 = throughput improving, < 0 = degrading (used by decision_engine)
local current_l1_count = tonumber(reactor:get("tl_l1_count")) or 0
local slope_bps_per_sample = 0
if current_l1_count >= 4 then
    -- Simple linear regression: slope = Σ((xi - x̄)(yi - ȳ)) / Σ((xi - x̄)²)
    local sum_x, sum_y, sum_xy, sum_x2 = 0, 0, 0, 0
    local n = current_l1_count
    for i = 0, n - 1 do
        local tp = tonumber(reactor:get("tl_l1_" .. i .. "_tp")) or 0
        sum_x  = sum_x + i
        sum_y  = sum_y + tp
        sum_xy = sum_xy + (i * tp)
        sum_x2 = sum_x2 + (i * i)
    end
    local denom = n * sum_x2 - sum_x * sum_x
    if denom ~= 0 then
        slope_bps_per_sample = (n * sum_xy - sum_x * sum_y) / denom
    end
end

-- ── TTFB TREND: Rising TTFB = upstream degrading ─────────────────────
local ttfb_slope = 0
if current_l1_count >= 4 then
    local sum_x, sum_y, sum_xy, sum_x2 = 0, 0, 0, 0
    local n = current_l1_count
    for i = 0, n - 1 do
        local tf = tonumber(reactor:get("tl_l1_" .. i .. "_ttfb")) or 0
        sum_x  = sum_x + i
        sum_y  = sum_y + tf
        sum_xy = sum_xy + (i * tf)
        sum_x2 = sum_x2 + (i * i)
    end
    local denom = n * sum_x2 - sum_x * sum_x
    if denom ~= 0 then
        ttfb_slope = (n * sum_xy - sum_x * sum_y) / denom
    end
end

-- ── PACKET LOSS ESTIMATION (from error responses in window) ──────────
local total_requests = (tonumber(reactor:get("tl_total_requests")) or 0) + 1
local error_requests = tonumber(reactor:get("tl_error_requests")) or 0
-- Count 5xx as "loss equivalent" (server-side failure)
if status >= 500 then
    error_requests = error_requests + 1
end
local packet_loss_pct = 0
if total_requests > 10 then
    packet_loss_pct = (error_requests / total_requests) * 100
end
reactor:set("tl_total_requests", total_requests)
reactor:set("tl_error_requests", error_requests)

-- Reset counters every 60 seconds to keep window fresh
local last_reset = tonumber(reactor:get("tl_counter_reset_ts")) or now
if now - last_reset > 60 then
    reactor:set("tl_total_requests", 1)
    reactor:set("tl_error_requests", 0)
    reactor:set("tl_counter_reset_ts", now)
end

-- ── STATE MACHINE: CBR vs VBR ────────────────────────────────────────
local prev_state = reactor:get("bw_state") or "CBR"
local new_state  = "CBR"
local computed_request_bps = TARGET_4K_BPS  -- Default: ask for maximum
local prefetch_bytes = 0
local prefetch_segments = 0

if ewma_bps >= FLOOR_4K_BPS then
    -- ✅ ABOVE FLOOR: Stay CBR, request maximum constant
    new_state = "CBR"
    computed_request_bps = TARGET_4K_BPS

elseif ewma_bps >= FLOOR_1080P_BPS then
    -- ⚠ BELOW 4K FLOOR: Switch to VBR — but request MUCH MORE, not less
    -- PHILOSOPHY: Provider delivered less? DEMAND MORE. Push harder.
    new_state = "VBR_OVERDRIVE"

    -- Formula: request 2x the target (aggressive recovery push)
    computed_request_bps = TARGET_4K_BPS * 2  -- 160 Mbps request

    -- PREFETCH: Fill 4 segments ahead simultaneously in playback order
    prefetch_segments = PREFETCH_SEGMENTS
    prefetch_bytes = math.floor(prefetch_segments * SEGMENT_DURATION * TARGET_4K_BPS / 8)

else
    -- 🔴 CRITICAL: Below 1080p floor — MAXIMUM AGGRESSION
    new_state = "VBR_NUCLEAR"

    -- Formula: request 3x target (nuclear push — force provider to burst)
    computed_request_bps = TARGET_4K_BPS * 3  -- 240 Mbps request

    -- Nuclear prefetch: fill 6 segments ahead
    prefetch_segments = 6
    prefetch_bytes = math.floor(prefetch_segments * SEGMENT_DURATION * TARGET_4K_BPS / 8)
end

-- ── PEAK TRACKING ────────────────────────────────────────────────────
local peak_bps = tonumber(reactor:get("bw_peak_bps")) or 0
if throughput_bps > peak_bps then
    peak_bps = throughput_bps
end

-- ── SAMPLE COUNTER ───────────────────────────────────────────────────
local samples = (tonumber(reactor:get("bw_samples")) or 0) + 1

-- ── TELESCOPE: Trend direction enum ──────────────────────────────────
local trend = "stable"
if slope_bps_per_sample > 500000 then
    trend = "improving"
elseif slope_bps_per_sample < -500000 then
    trend = "degrading"
end

-- ── TELESCOPE: Predict floor breach (seconds until EWMA hits floor) ─
-- If degrading, estimate when EWMA will cross FLOOR_4K_BPS
local breach_in_seconds = -1  -- -1 = no breach predicted
if slope_bps_per_sample < -100000 and ewma_bps > FLOOR_4K_BPS then
    -- slope is per-sample, not per-second. Estimate ~10 samples/sec for HLS
    local samples_per_sec = 10  -- approximate
    local bps_remaining = ewma_bps - FLOOR_4K_BPS
    local samples_until = bps_remaining / math.abs(slope_bps_per_sample)
    breach_in_seconds = samples_until / samples_per_sec
    if breach_in_seconds > 30 then
        breach_in_seconds = -1  -- too far to predict reliably
    end
end

-- ── PERSIST ALL STATE (sub-microsecond shared dict writes) ───────────
reactor:set("bw_ewma_bps", ewma_bps)
reactor:set("bw_instant_bps", throughput_bps)
reactor:set("bw_peak_bps", peak_bps)
reactor:set("bw_state", new_state)
reactor:set("bw_computed_request_bps", computed_request_bps)
reactor:set("bw_prefetch_bytes", prefetch_bytes)
reactor:set("bw_prefetch_segments", prefetch_segments)
reactor:set("bw_samples", samples)
reactor:set("bw_last_bytes", bytes_sent)
reactor:set("bw_last_time", upstream_time)
reactor:set("bw_last_status", status)
reactor:set("bw_ts", now)

-- TELESCOPE state
reactor:set("tl_ttfb_ms", ttfb_ms)
reactor:set("tl_ttfb_ewma_ms", ttfb_ewma_ms)
reactor:set("tl_jitter_ewma_ms", jitter_ewma_ms)
reactor:set("tl_throughput_slope", slope_bps_per_sample)
reactor:set("tl_ttfb_slope", ttfb_slope)
reactor:set("tl_trend", trend)
reactor:set("tl_breach_in_s", breach_in_seconds)
reactor:set("tl_packet_loss_pct", packet_loss_pct)
reactor:set("tl_ts", now)

-- ── LOG STATE TRANSITIONS ────────────────────────────────────────────
if new_state ~= prev_state then
    ngx.log(ngx.WARN, string.format(
        "PRISMA_REACTOR: %s→%s | ewma=%.1fMbps instant=%.1fMbps | request=%.1fMbps | prefetch=%dMB/%dseg | ttfb=%dms jitter=%dms trend=%s",
        prev_state, new_state,
        ewma_bps / 1000000, throughput_bps / 1000000,
        computed_request_bps / 1000000,
        prefetch_bytes / 1048576, prefetch_segments,
        ttfb_ms, jitter_ewma_ms, trend
    ))
end

-- Log predictive warnings
if breach_in_seconds > 0 and breach_in_seconds < 5 then
    ngx.log(ngx.WARN, string.format(
        "TELESCOPE_PREDICT: Floor breach in %.1fs | ewma=%.1fMbps slope=%.0f bps/sample | trend=%s",
        breach_in_seconds, ewma_bps / 1000000, slope_bps_per_sample, trend
    ))
end

end) -- pcall end

if not ok then
    -- Silent fail — NEVER break the pipeline
    ngx.log(ngx.ERR, "PRISMA_REACTOR_ERROR: " .. tostring(err))
end
