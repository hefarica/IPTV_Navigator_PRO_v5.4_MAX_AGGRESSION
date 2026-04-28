-- APE PRISMA v1.3.2 — Bandwidth Reactor Engine (Lua)
-- RUNS: log_by_lua_file (after each response, ZERO impact on request)
-- SPEED: < 1ms per execution (shared dict operations are sub-microsecond)
-- PHILOSOPHY: CBR constant → instant VBR switch when floor breached → aggressive prefetch
--
-- PASSTHROUGH: This module NEVER blocks, NEVER returns errors, NEVER interferes.
-- It only MEASURES and COMPUTES. (AUTOPISTA SOP compliant)

local FLOOR_4K_BPS    = 13000000   -- 13 Mbps floor (user mandate)
local FLOOR_1080P_BPS = 8000000    -- 8 Mbps 1080p floor
local TARGET_4K_BPS   = 80000000   -- 80 Mbps ideal target
local PREFETCH_SEGMENTS = 4        -- Prefetch 4 segments ahead in playback order
local SEGMENT_DURATION  = 6        -- Typical HLS segment duration (seconds)
local EWMA_ALPHA       = 0.3       -- Exponential weighted moving average factor (reactive)

-- Shared dict for cross-request state (defined in iptv-lua-circuit.conf)
local reactor = ngx.shared.circuit_metrics

if not reactor then
    return  -- No shared dict available, skip silently
end

-- ── MEASURE: Actual throughput of THIS response ──────────────────────
local request_time = tonumber(ngx.var.request_time) or 0
local bytes_sent   = tonumber(ngx.var.bytes_sent) or 0
local upstream_time = tonumber(ngx.var.upstream_response_time) or request_time
local status       = tonumber(ngx.var.status) or 0

-- Only measure successful video/manifest responses
if status < 200 or status >= 400 or bytes_sent < 1024 then
    return
end

-- Calculate throughput in bits per second
local throughput_bps = 0
if upstream_time > 0.001 then  -- Avoid division by near-zero
    throughput_bps = math.floor((bytes_sent * 8) / upstream_time)
end

-- ── EWMA: Smooth throughput with exponential weighted moving average ─
-- Reacts in <30ms because EWMA with alpha=0.3 converges in 3-4 samples
local prev_ewma = tonumber(reactor:get("bw_ewma_bps")) or throughput_bps
local ewma_bps  = math.floor(EWMA_ALPHA * throughput_bps + (1 - EWMA_ALPHA) * prev_ewma)

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

-- ── PERSIST STATE (sub-microsecond shared dict writes) ───────────────
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
reactor:set("bw_ts", ngx.now())

-- ── LOG STATE TRANSITIONS ────────────────────────────────────────────
if new_state ~= prev_state then
    ngx.log(ngx.WARN, string.format(
        "PRISMA_REACTOR: %s→%s | ewma=%.1fMbps instant=%.1fMbps | request=%.1fMbps | prefetch=%dMB/%dseg",
        prev_state, new_state,
        ewma_bps / 1000000, throughput_bps / 1000000,
        computed_request_bps / 1000000,
        prefetch_bytes / 1048576, prefetch_segments
    ))
end
