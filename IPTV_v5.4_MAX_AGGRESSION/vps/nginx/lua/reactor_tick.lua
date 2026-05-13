-- ═══════════════════════════════════════════════════════════════════════
-- APE PRISMA — Reactor Tick (1 Hz cadence enforcement)
-- USER DOCTRINE 2026-05-11: "MIDA ESA VELOCIDAD CADA SEGUNDO Y SEA CONSTANTE"
--
-- Phase: init_worker_by_lua_block (worker 0 only, prevents duplicate timers)
-- Function: cada 1 segundo, re-calcula state machine usando última muestra EWMA
--   del shared dict. Esto independiza el state machine de la cadencia HLS
--   (que varía 2-10s según provider) y garantiza emisión constante de
--   X-Max-Bitrate / X-Min-Bitrate.
--
-- AUTOPISTA COMPLIANT: zero blocking, pure passthrough computation.
-- ═══════════════════════════════════════════════════════════════════════

local FLOOR_4K_BPS = 13000000          -- 13 Mbps (user mandate)
local DOUBLE_REQUEST = FLOOR_4K_BPS * 2 -- 26 Mbps (when below floor)

local function reactor_tick(premature)
    if premature then return end

    local cm = ngx.shared.circuit_metrics
    if not cm then return end

    -- Read last EWMA from shared dict (computed by bandwidth_reactor.lua in log_by_lua)
    local ewma = tonumber(cm:get("bw_ewma_bps")) or 0

    local state, req_bps
    if ewma >= FLOOR_4K_BPS then
        state, req_bps = "CBR_SUSTAIN", FLOOR_4K_BPS
    else
        state, req_bps = "DOUBLE", DOUBLE_REQUEST
    end

    -- Persist computed state. decision_engine.lua reads bw_computed_request_bps
    -- on access_by_lua_file to set X-Max-Bitrate header.
    cm:set("bw_state", state)
    cm:set("bw_computed_request_bps", req_bps)
    cm:set("bw_last_tick_ts", ngx.now())
    cm:set("bw_tick_ewma_at_tick", ewma)
end

-- Solo worker 0 corre el timer (evita 4 timers concurrentes en 4 workers)
if ngx.worker.id() == 0 then
    -- Re-arm pattern: timer.every con 1.0s
    local ok, err = ngx.timer.every(1.0, reactor_tick)
    if not ok then
        ngx.log(ngx.ERR, "reactor_tick: timer.every failed: ", err)
    end
end
