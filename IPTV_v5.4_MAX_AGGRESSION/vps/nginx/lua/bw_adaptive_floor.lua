-- ═══════════════════════════════════════════════════════════════════════
-- APE LAB UHDX — SANDBOX — Adaptive Floor (lazo bitrate-reactor → manifest)
-- PURE module. Sin ngx, sin shared dict, determinista, unit-testable.
--
-- Cierra el lazo ROTO documentado en docs/LUA_ENGINES_IMAGE_MIRROR_AUDIT.md §Gaps#1:
--   bandwidth_reactor MIDE el bw real (bw_state / bw_computed_request_bps / bw_ewma_bps)
--   pero combined_body_filter usa un floor ESTÁTICO (cfg.floor_bps) → la selección de
--   variante NO reacciona al ancho de banda real. Este módulo es la función que, más
--   adelante (paso cableado, GATEADO + aprobado), combined_body_filter llamaría para
--   convertir el floor estático en un floor ADAPTATIVO al bw medido.
--
-- TRUTH-GUARDS HORNEADOS (no negociables):
--   * MAX IMAGE FIRST  : la variante de mayor score SIEMPRE se mantiene (jamás se cae).
--   * NO CHANNEL LOSS  : nunca devuelve 0 variantes; el floor adaptativo NUNCA supera al
--                        estático (monótono ↓) → jamás descarta MÁS variantes que hoy.
--   * ANTI-FREEZE (el espejo): si el bw real está BAJO el floor (estado DOUBLE), RELAJA el
--                        floor a la tasa sostenible medida → sobrevive un peldaño que el
--                        player SÍ puede sostener → sin rebuffer/freeze.
--   * AUTOPISTA        : cómputo puro, sin bloqueo; el caller envuelve en pcall (passthrough).
--
-- bw_signal = { state="CBR_SUSTAIN"|"DOUBLE", ewma_bps=<num>, floor_4k_bps=<floor REAL del perfil>,
--               age_s=<segundos desde la última muestra REAL bw_ts; nil si no hay> }
--   (en producción se arma leyendo el shared dict `circuit_metrics`:
--      ngx.shared.circuit_metrics:get("bw_state")/:get("bw_ewma_bps")/:get("bw_ts") — el dict que
--      escriben bandwidth_reactor.lua y reactor_tick.lua)
-- ═══════════════════════════════════════════════════════════════════════

local M = {}

M.FLOOR_4K_BPS  = 15000000  -- SOLO fallback de detección degradada si falta bw_state (default reactor:
                            -- floor_lock_min_bandwidth_p0 || 15M). El caller pasa el floor REAL del perfil.
M.SAFETY_MARGIN = 0.8       -- peldaño sostenible = 0.8 × ewma (margen, no al borde)
M.FRESHNESS_S   = 30        -- gate de frescura: si la última muestra REAL (bw_ts) tiene > 30s → estático.
                            -- Evita relajar con un EWMA stale que reactor_tick re-asserta a 1Hz sin tráfico.

-- adaptive_floor: (floor estático del perfil, señal de bw real) → floor efectivo.
-- INVARIANTE: resultado <= static_floor_bps (solo RELAJA → cero riesgo de pérdida).
-- Devuelve: floor_bps, reason
function M.adaptive_floor(static_floor_bps, bw_signal)
    static_floor_bps = tonumber(static_floor_bps) or 0
    if type(bw_signal) ~= "table" then
        return static_floor_bps, "no_signal_static"          -- reactor frío/nil → seguro
    end
    local state   = bw_signal.state                      -- "CBR_SUSTAIN" | "DOUBLE" | nil
    local ewma    = tonumber(bw_signal.ewma_bps) or 0
    local floor4k = tonumber(bw_signal.floor_4k_bps) or M.FLOOR_4K_BPS

    -- COLD / SIN MEDICIÓN: reactor frío (ewma 0/nil) → NO relajar por ausencia de datos.
    -- Ausencia de medición ≠ ancho de banda cero. Floor estático = comportamiento de hoy.
    if ewma <= 0 then
        return static_floor_bps, "no_measurement_static"
    end

    -- STALE: reactor_tick re-asserta bw_state a 1Hz sobre el último EWMA aunque no haya tráfico
    -- real reciente. Si la última muestra REAL (bw_ts) es vieja (> FRESHNESS_S), NO relajar:
    -- evita diluir un manifest 4K sano con un DOUBLE stale. age_s nil (sin bw_ts) → no se chequea.
    local age_s = tonumber(bw_signal.age_s)
    if age_s and age_s > M.FRESHNESS_S then
        return static_floor_bps, "stale_static"
    end

    -- Fuente de verdad = la decisión del PROPIO reactor (bw_state: pone DOUBLE cuando midió
    -- por debajo de su floor). Solo si el estado falta usamos el umbral ewma<floor4k de respaldo.
    local degraded = (state == "DOUBLE")
    if state ~= "DOUBLE" and state ~= "CBR_SUSTAIN" and ewma < floor4k then
        degraded = true
    end

    -- HEALTHY: el bw sostiene el floor → floor estático (empuja alto, descarta pobre) = hoy.
    if not degraded then
        return static_floor_bps, "healthy_static"
    end

    -- DEGRADED: bw real bajo → relaja a la tasa sostenible medida (0.8 × ewma).
    local sustainable = math.floor(ewma * M.SAFETY_MARGIN)
    if sustainable < 0 then sustainable = 0 end
    if sustainable >= static_floor_bps then
        -- degradado pero la tasa sostenible aún cubre el floor del perfil: nada que relajar.
        return static_floor_bps, "degraded_above_profile_floor_static"
    end
    return sustainable, "degraded_relaxed_to_sustainable"
end

-- select_variants: ESPEJO (lockstep MANUAL) de la keep-logic de combined_body_filter con floor
-- adaptativo. ⚠ Producción RE-IMPLEMENTA este loop inline y llama SOLO a adaptive_floor(); esta
-- función la usa SOLO el sandbox test. Si cambias el keep-loop en combined_body_filter, replica aquí.
-- variants: array de { bw=<num>, score=<num>, ... }. floor_lock: "ACTIVE" | otro.
-- Devuelve: kept[] (orden score desc), eff_floor, reason.
-- PRESERVA: mejor score siempre presente · nunca vacío · nunca descarta más que el estático.
function M.select_variants(variants, static_floor_bps, floor_lock, bw_signal)
    if type(variants) ~= "table" or #variants == 0 then return {}, static_floor_bps, "empty" end

    local eff_floor, reason = M.adaptive_floor(static_floor_bps, bw_signal)

    -- índice de mayor score → SIEMPRE se mantiene (fallback / MAX IMAGE FIRST)
    local hi_idx, hi_score = 1, -1
    for idx, v in ipairs(variants) do
        local s = tonumber(v.score) or 0
        if s > hi_score then hi_score = s; hi_idx = idx end
    end

    local kept = {}
    for idx, v in ipairs(variants) do
        local keep = false
        if idx == hi_idx then
            keep = true                                       -- mejor variante: siempre
        elseif floor_lock == "ACTIVE" then
            if (tonumber(v.bw) or 0) >= eff_floor then keep = true end
        else
            keep = true                                       -- floor_lock off → mantener todo (= hoy)
        end
        if keep then kept[#kept + 1] = v end
    end

    table.sort(kept, function(a, b)
        return (tonumber(a.score) or 0) > (tonumber(b.score) or 0)
    end)
    return kept, eff_floor, reason
end

return M
