-- APE TELESCOPE v2.1 — Full Telemetry Aggregator (Lua)
-- RUNS: content_by_lua_file at /prisma/api/telemetry-full
-- RETURNS: Unified JSON with 3 layers (hardware, network, qoe) + reactor + predictions
-- SPEED: < 2ms response (all reads from shared_dict + /dev/shm files)

local ok, result = pcall(function()

local reactor = ngx.shared.circuit_metrics
if not reactor then
    ngx.status = 503
    ngx.say('{"error":"no shared dict"}')
    return
end

-- ═══ LAYER 1: HARDWARE (from /dev/shm/prisma_device_metrics.json) ════
local hw = '{"cpu_pct":0,"ram_free_mb":0,"load_1min":0,"shm_used_pct":0,"uptime_s":0}'
local f = io.open("/dev/shm/prisma_device_metrics.json", "r")
if f then
    hw = f:read("*a") or hw
    f:close()
end

-- ═══ LAYER 2: NETWORK (from shared_dict — L1 ring buffer) ═══════════
local ewma_bps       = tonumber(reactor:get("bw_ewma_bps")) or 0
local instant_bps    = tonumber(reactor:get("bw_instant_bps")) or 0
local peak_bps       = tonumber(reactor:get("bw_peak_bps")) or 0
local ttfb_ms        = tonumber(reactor:get("tl_ttfb_ms")) or 0
local ttfb_ewma_ms   = tonumber(reactor:get("tl_ttfb_ewma_ms")) or 0
local jitter_ms      = tonumber(reactor:get("tl_jitter_ewma_ms")) or 0
local tp_slope       = tonumber(reactor:get("tl_throughput_slope")) or 0
local ttfb_slope     = tonumber(reactor:get("tl_ttfb_slope")) or 0
local trend          = reactor:get("tl_trend") or "unknown"
local breach_in_s    = tonumber(reactor:get("tl_breach_in_s")) or -1
local packet_loss    = tonumber(reactor:get("tl_packet_loss_pct")) or 0
local l1_count       = tonumber(reactor:get("tl_l1_count")) or 0

-- Read L1 ring buffer samples for sparkline data
local l1_samples = {}
for i = 0, 11 do
    local ts = tonumber(reactor:get("tl_l1_" .. i .. "_ts"))
    if ts then
        l1_samples[#l1_samples + 1] = string.format(
            '{"ts":%.3f,"tp_mbps":%.2f,"ttfb_ms":%d,"jitter_ms":%d}',
            ts,
            (tonumber(reactor:get("tl_l1_" .. i .. "_tp")) or 0) / 1000000,
            tonumber(reactor:get("tl_l1_" .. i .. "_ttfb")) or 0,
            tonumber(reactor:get("tl_l1_" .. i .. "_jitter")) or 0
        )
    end
end
local l1_json = "[" .. table.concat(l1_samples, ",") .. "]"

-- ═══ LAYER 3: QoE (from /dev/shm/prisma_adb_telemetry.json) ═════════
local qoe = '{"buffer_seconds":0,"rebuffer_count_30s":0,"frame_drops_ps":0,"source":"unavailable"}'
local f2 = io.open("/dev/shm/prisma_adb_telemetry.json", "r")
if f2 then
    local raw = f2:read("*a") or ""
    f2:close()
    -- Extract key QoE fields if available (lightweight parse)
    if raw ~= "" then
        qoe = raw  -- Pass through entire ADB telemetry as QoE layer
    end
end

-- ═══ REACTOR STATE ═══════════════════════════════════════════════════
local bw_state    = reactor:get("bw_state") or "INIT"
local request_bps = tonumber(reactor:get("bw_computed_request_bps")) or 0
local prefetch    = tonumber(reactor:get("bw_prefetch_bytes")) or 0
local pf_segs     = tonumber(reactor:get("bw_prefetch_segments")) or 0
local samples     = tonumber(reactor:get("bw_samples")) or 0
local bw_ts       = tonumber(reactor:get("bw_ts")) or 0

-- ═══ DECISION ENGINE STATE ═══════════════════════════════════════════
local decision_action = reactor:get("tl_decision_action") or "NONE"
local decision_bps    = tonumber(reactor:get("tl_decision_max_bps")) or 0
local decision_ts     = tonumber(reactor:get("tl_decision_ts")) or 0

-- Action counts (60s window, auto-expired keys)
local action_names = {"PREDICTIVE_PREFETCH", "TTFB_DEFENSE", "NETWORK_UNSTABLE",
                      "NUCLEAR_REINFORCE", "OVERDRIVE_MAINTAIN", "FAILBACK_RAMP", "NONE"}
local actions_60s = {}
for _, name in ipairs(action_names) do
    local c = tonumber(reactor:get("tl_action_count_" .. name)) or 0
    if c > 0 then
        actions_60s[#actions_60s + 1] = string.format('"%s":%d', name, c)
    end
end
local actions_json = "{" .. table.concat(actions_60s, ",") .. "}"

-- ═══ QoE SCORE (simplified, 0-100) ══════════════════════════════════
-- Based on: throughput ratio (30) + TTFB (15) + jitter (10) + loss (10)
--           + reactor state (20) + trend (15)
local function clamp(v, lo, hi) return math.max(lo, math.min(hi, v)) end

local tp_ratio = clamp(ewma_bps / 13000000, 0, 2)  -- vs 13Mbps floor
local ttfb_score = clamp(1 - (ttfb_ewma_ms / 1000), 0, 1)
local jitter_score = clamp(1 - (jitter_ms / 200), 0, 1)
local loss_score = clamp(1 - (packet_loss / 5), 0, 1)
local state_score = (bw_state == "CBR") and 1.0 or (bw_state == "VBR_OVERDRIVE" and 0.5 or 0.2)
local trend_score = (trend == "improving") and 1.0 or (trend == "stable" and 0.7 or 0.3)

local qoe_score = math.floor(
    clamp(tp_ratio, 0, 1) * 30 +
    ttfb_score * 15 +
    jitter_score * 10 +
    loss_score * 10 +
    state_score * 20 +
    trend_score * 15
)

-- MOS estimation (ITU-T G.1071 inspired: QoE 0-100 → MOS 1.0-5.0)
local mos
if qoe_score >= 90 then mos = 4.5 + (qoe_score - 90) / 20
elseif qoe_score >= 70 then mos = 3.5 + (qoe_score - 70) / 20
elseif qoe_score >= 50 then mos = 2.5 + (qoe_score - 50) / 20
elseif qoe_score >= 30 then mos = 1.5 + (qoe_score - 30) / 20
else mos = 1.0 + qoe_score / 30
end

-- ═══ ASSEMBLE RESPONSE ══════════════════════════════════════════════
ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-cache"
ngx.header["X-Telescope-Version"] = "2.1"
ngx.header["X-QoE-Score"] = tostring(qoe_score)

ngx.say(string.format([[{
  "ts": %.3f,
  "source": "telescope_v2.1",
  "hardware": %s,
  "network": {
    "level1_100ms": {
      "throughput_mbps": %.2f,
      "throughput_instant_mbps": %.2f,
      "throughput_peak_mbps": %.2f,
      "ttfb_ms": %d,
      "ttfb_ewma_ms": %d,
      "jitter_ewma_ms": %d,
      "packet_loss_pct": %.2f,
      "samples_count": %d,
      "samples": %s
    },
    "level2_trends": {
      "throughput_slope_bps": %.0f,
      "ttfb_slope_ms": %.1f,
      "trend": "%s",
      "breach_floor_in_s": %.1f
    }
  },
  "qoe_device": %s,
  "reactor": {
    "state": "%s",
    "ewma_mbps": %.2f,
    "computed_request_mbps": %.2f,
    "prefetch_mb": %.1f,
    "prefetch_segments": %d,
    "samples": %d,
    "ts": %.3f
  },
  "prediction": {
    "will_breach_floor_in_s": %.1f,
    "trend_direction": "%s",
    "confidence_pct": %d,
    "action_recommended": "%s",
    "last_action_ts": %.3f,
    "actions_60s": %s
  },
  "scores": {
    "qoe_score": %d,
    "mos_estimated": %.1f,
    "tp_ratio": %.2f,
    "ttfb_health": %.2f,
    "jitter_health": %.2f,
    "loss_health": %.2f,
    "state_health": %.2f,
    "trend_health": %.2f
  }
}]],
    ngx.now(),
    hw,
    ewma_bps / 1000000, instant_bps / 1000000, peak_bps / 1000000,
    ttfb_ms, ttfb_ewma_ms, jitter_ms,
    packet_loss, l1_count, l1_json,
    tp_slope, ttfb_slope, trend, breach_in_s,
    qoe,
    bw_state, ewma_bps / 1000000, request_bps / 1000000,
    prefetch / 1048576, pf_segs, samples, bw_ts,
    breach_in_s, trend, (l1_count >= 4) and 85 or 50,
    decision_action, decision_ts, actions_json,
    qoe_score, mos, clamp(tp_ratio, 0, 1),
    ttfb_score, jitter_score, loss_score, state_score, trend_score
))

end) -- pcall end

if not ok then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"' .. tostring(result):gsub('"', '\\"') .. '"}')
end
