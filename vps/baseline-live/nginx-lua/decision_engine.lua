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

-- ═══ LAB-SYNC v2.0: Read SSOT config ═══
local lab_floor, lab_boost
local lab_ok = pcall(function()
    local lab = require "lab_config"
    lab_floor = lab.floor_lock()
    lab_boost = lab.profile_boost()
end)

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
local FLOOR_4K_BPS    = (lab_floor and tonumber(lab_floor.floor_lock_min_bandwidth_p0)) or 15000000 -- 15 Mbps (piso 4K UHDX)
local TARGET_4K_BPS   = (lab_boost and lab_boost.profiles and lab_boost.profiles.P0 and tonumber(lab_boost.profiles.P0.prisma_target_bandwidth_bps)) or 80000000
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

-- USER DOCTRINE OVERRIDE 2026-05-11:
-- Override max_bitrate_bps con valor SIEMPRE FRESCO del reactor_tick.lua (1Hz).
-- Garantiza emisión constante de X-Max-Bitrate y X-Min-Bitrate
-- per orden "SEA CONSTANTE EN PEDIR ESO".
local doctrine_request_bps = tonumber(reactor:get("bw_computed_request_bps")) or FLOOR_4K_BPS
max_bitrate_bps = doctrine_request_bps  -- override las 6 RULES anteriores

-- == [F5-A QoE SHADOW 2026-05-21] OBSERVE-ONLY (phase-3.5) ==================
-- Reads the QoE feedback suggestion for this request's profile and LOGS what it
-- WOULD adjust, WITHOUT changing max_bitrate_bps. Validate stability 24-72h
-- before arming auto-apply. Emits X-APE-QoE-Suggested (observe). Throttled
-- 1/profile/60s. pcall-guarded; never affects the request path. NOT applied.
do
    local profile = ngx.var.http_x_ape_profile
    if profile and profile ~= "" then
        local sok, lab2 = pcall(require, "lab_config")
        if sok and lab2 and lab2.suggested_target_bps_for_profile then
            local gok, sug = pcall(lab2.suggested_target_bps_for_profile, profile)
            if gok and tonumber(sug) and tonumber(sug) > 0 then
                local sugN = math.floor(tonumber(sug))
                ngx.req.set_header("X-APE-QoE-Suggested", tostring(sugN))  -- observe-only header
                local sk = "qoe_shadow_ts:" .. profile
                local last = tonumber(reactor:get(sk)) or 0
                local nowt = ngx.now()
                if (nowt - last) >= 60 then
                    reactor:set(sk, nowt)
                    local applied = max_bitrate_bps
                    local dpct = (applied > 0) and math.floor((sugN - applied) / applied * 100) or 0
                    ngx.log(ngx.WARN, "[QoE-SHADOW] profile=", profile,
                            " applied_bps=", applied, " qoe_suggested_bps=", sugN,
                            " delta=", dpct, "% (SHADOW: NOT applied)")
                end
            end
        end
    end
end

-- Emisión CONSTANTE (no condicional) — siempre en cada request
ngx.req.set_header("X-Max-Bitrate", tostring(max_bitrate_bps))
ngx.req.set_header("X-Min-Bitrate", tostring(FLOOR_4K_BPS))  -- floor absoluto upstream (15 Mbps UHDX)
ngx.req.set_header("X-Telescope-Action", action)
if prefetch_hint > 0 then
    ngx.req.set_header("X-Prefetch-Segments", tostring(prefetch_hint))
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
