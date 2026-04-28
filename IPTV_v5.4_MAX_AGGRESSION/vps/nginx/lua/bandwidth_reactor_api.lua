-- APE PRISMA v1.3.2 — Bandwidth Reactor Telemetry (Lua)
-- Endpoint: /prisma/api/bandwidth-reactor
-- Returns real-time reactor state as JSON (<1ms response)

local reactor = ngx.shared.circuit_metrics
if not reactor then
    ngx.status = 503
    ngx.say('{"error":"no shared dict"}')
    return
end

local ewma     = tonumber(reactor:get("bw_ewma_bps")) or 0
local instant  = tonumber(reactor:get("bw_instant_bps")) or 0
local peak     = tonumber(reactor:get("bw_peak_bps")) or 0
local state    = reactor:get("bw_state") or "INIT"
local request  = tonumber(reactor:get("bw_computed_request_bps")) or 0
local prefetch = tonumber(reactor:get("bw_prefetch_bytes")) or 0
local pf_segs  = tonumber(reactor:get("bw_prefetch_segments")) or 0
local samples  = tonumber(reactor:get("bw_samples")) or 0
local ts       = tonumber(reactor:get("bw_ts")) or 0

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-cache"
ngx.header["X-Reactor-State"] = state

ngx.say(string.format([[{
  "reactor": {
    "state": "%s",
    "ewma_mbps": %.2f,
    "instant_mbps": %.2f,
    "peak_mbps": %.2f,
    "computed_request_mbps": %.2f,
    "prefetch_mb": %.1f,
    "prefetch_segments": %d,
    "samples": %d,
    "floor_4k_mbps": 13,
    "floor_1080p_mbps": 8,
    "target_4k_mbps": 80,
    "segment_prefetch_count": 4,
    "ewma_alpha": 0.3,
    "reaction_time_ms": "<1",
    "philosophy": "CBR_constant_then_VBR_aggressive",
    "ts": %.3f
  }
}]], state,
    ewma / 1000000, instant / 1000000, peak / 1000000,
    request / 1000000, prefetch / 1048576, pf_segs,
    samples, ts
))
