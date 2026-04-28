-- APE TELESCOPE v2.1 — Predictive Decision Engine (Lua)
-- RUNS: access_by_lua_file (BEFORE proxy_pass, adjusts headers per-request)
-- SPEED: < 0.5ms per execution (reads shared dict, sets headers, returns)
--
-- PURPOSE: Read L1 ring buffer from bandwidth_reactor.lua,
--   apply 6 predictive rules, and adjust X-Max-Bitrate header dynamically.
--   This is PASSTHROUGH — it only sets request headers, NEVER blocks.
--
-- AUTOPISTA COMPLIANT: No ngx.exit(), no return 503, no blocking.
-- If anything fails, request proceeds with default headers.

local ok, err = pcall(function()

local reactor = ngx.shared.circuit_metrics
if not reactor then
    return  -- No shared dict, proceed with defaults
end

-- ═══ READ TELESCOPE STATE ════════════════════════════════════════════
local ewma_bps       = tonumber(reactor:get("bw_ewma_bps")) or 0
local ttfb_ewma_ms   = tonumber(reactor:get("tl_ttfb_ewma_ms")) or 0
local jitter_ewma_ms = tonumber(reactor:get("tl_jitter_ewma_ms")) or 0
local tp_slope       = tonumber(reactor:get("tl_throughput_slope")) or 0
local ttfb_slope     = tonumber(reactor:get("tl_ttfb_slope")) or 0
local trend          = reactor:get("tl_trend") or "stable"
local breach_in_s    = tonumber(reactor:get("tl_breach_in_s")) or -1
local packet_loss    = tonumber(reactor:get("tl_packet_loss_pct")) or 0
local bw_state       = reactor:get("bw_state") or "CBR"
local l1_count       = tonumber(reactor:get("tl_l1_count")) or 0

-- Need at least 4 samples for reliable decisions
if l1_count < 4 then
    return  -- Not enough data yet, use defaults
end

-- ═══ CONSTANTS ═══════════════════════════════════════════════════════
local FLOOR_4K_BPS    = 13000000
local TARGET_4K_BPS   = 80000000
local THRESH_TTFB_HIGH = 500      -- ms — TTFB above this = upstream struggling
local THRESH_JITTER    = 50       -- ms — jitter above this = unstable
local THRESH_LOSS      = 2.0      -- % — packet loss above this = degraded
local THRESH_BUFFER_S  = 5        -- seconds — buffer below this = critical

-- ═══ DECISION RULES (priority order) ═════════════════════════════════
-- Each rule can set: max_bitrate, prefetch_segments, action label

local action = "NONE"
local max_bitrate_bps = TARGET_4K_BPS  -- Default CBR target
local prefetch_hint = 0

-- ── RULE 1: Predictive floor breach (MOST VALUABLE) ─────────────────
-- If slope predicts floor breach within 5 seconds, pre-activate defense
if breach_in_s > 0 and breach_in_s < 5 then
    action = "PREDICTIVE_PREFETCH"
    max_bitrate_bps = TARGET_4K_BPS * 2  -- 160 Mbps (overdrive before breach)
    prefetch_hint = 4
end

-- ── RULE 2: TTFB rising + buffer-threatening ─────────────────────────
-- If TTFB is consistently high AND rising, upstream is degrading
if ttfb_ewma_ms > THRESH_TTFB_HIGH and ttfb_slope > 50 then
    action = "TTFB_DEFENSE"
    max_bitrate_bps = TARGET_4K_BPS * 2  -- 160 Mbps
    prefetch_hint = 4
end

-- ── RULE 3: Network instability (jitter + packet loss) ──────────────
if jitter_ewma_ms > THRESH_JITTER and packet_loss > THRESH_LOSS then
    action = "NETWORK_UNSTABLE"
    max_bitrate_bps = TARGET_4K_BPS * 2  -- Push harder through instability
    prefetch_hint = 6
end

-- ── RULE 4: Already in VBR_NUCLEAR — reinforce ──────────────────────
if bw_state == "VBR_NUCLEAR" then
    action = "NUCLEAR_REINFORCE"
    max_bitrate_bps = TARGET_4K_BPS * 3  -- 240 Mbps (match reactor state)
    prefetch_hint = 6
end

-- ── RULE 5: Already in VBR_OVERDRIVE — maintain ─────────────────────
if bw_state == "VBR_OVERDRIVE" and action == "NONE" then
    action = "OVERDRIVE_MAINTAIN"
    max_bitrate_bps = TARGET_4K_BPS * 2  -- 160 Mbps
    prefetch_hint = 4
end

-- ── RULE 6: Failback — sustained recovery → ramp up gently ─────────
-- If trend is improving AND we were in degraded state, don't snap back
if trend == "improving" and (bw_state == "VBR_OVERDRIVE" or bw_state == "VBR_NUCLEAR") then
    -- Keep elevated but signal recovery
    action = "FAILBACK_RAMP"
    max_bitrate_bps = math.floor(TARGET_4K_BPS * 1.5)  -- 120 Mbps (gradual)
    prefetch_hint = 2
end

-- ═══ APPLY DECISION (set request headers — PASSTHROUGH) ═════════════
-- These headers travel to the upstream and back, but critically they
-- influence our own NGINX proxy behavior and are logged for telemetry.

if action ~= "NONE" then
    ngx.req.set_header("X-Max-Bitrate", tostring(max_bitrate_bps))
    ngx.req.set_header("X-Telescope-Action", action)
    if prefetch_hint > 0 then
        ngx.req.set_header("X-Prefetch-Segments", tostring(prefetch_hint))
    end
end

-- Always set telescope state header for telemetry (lightweight)
ngx.req.set_header("X-Telescope-Trend", trend)

-- ═══ PERSIST DECISION STATE ══════════════════════════════════════════
reactor:set("tl_decision_action", action)
reactor:set("tl_decision_max_bps", max_bitrate_bps)
reactor:set("tl_decision_prefetch", prefetch_hint)
reactor:set("tl_decision_ts", ngx.now())

-- Track action counts in 60s window
local action_key = "tl_action_count_" .. action
local count = (tonumber(reactor:get(action_key)) or 0) + 1
reactor:set(action_key, count, 60)  -- TTL 60 seconds auto-expire

end) -- pcall end

if not ok then
    -- Silent fail — request proceeds with default headers
    ngx.log(ngx.ERR, "TELESCOPE_DECISION_ERROR: " .. tostring(err))
end
