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
-- bw_signal = { state="CBR_SUSTAIN"|"DOUBLE", ewma_bps=<num>, floor_4k_bps=13e6 }
--   (en producción se arma leyendo el shared dict `reactor`:
--      ngx.shared.reactor:get("bw_state") / :get("bw_ewma_bps") — espejo de bandwidth_reactor.lua)
-- ═══════════════════════════════════════════════════════════════════════

local M = {}

M.FLOOR_4K_BPS  = 13000000  -- espejo de bandwidth_reactor.lua FLOOR_4K_BPS
M.SAFETY_MARGIN = 0.8       -- peldaño sostenible = 0.8 × ewma (margen, no al borde)

-- adaptive_floor: (floor estático del perfil, señal de bw real) → floor efectivo.
-- INVARIANTE: resultado <= static_floor_bps (solo RELAJA → cero riesgo de pérdida).
-- Devuelve: floor_bps, reason
function M.adaptive_floor(static_floor_bps, bw_signal)
    static_floor_bps = tonumber(static_floor_bps) or 0
    if type(bw_signal) ~= "table" then
        return static_floor_bps, "no_signal_static"          -- reactor frío/nil → seguro
    end
    local state   = bw_signal.state or "CBR_SUSTAIN"
    local ewma    = tonumber(bw_signal.ewma_bps) or 0
    local floor4k = tonumber(bw_signal.floor_4k_bps) or M.FLOOR_4K_BPS

    -- HEALTHY: el bw sostiene el floor 4K → floor estático (empuja alto, descarta pobre) = hoy.
    if state ~= "DOUBLE" and ewma >= floor4k then
        return static_floor_bps, "healthy_static"
    end

    -- DEGRADED: bw real por debajo del floor 4K → relaja a la tasa sostenible medida.
    local sustainable = math.floor(ewma * M.SAFETY_MARGIN)
    if sustainable < 0 then sustainable = 0 end
    if sustainable >= static_floor_bps then
        -- bajo el floor 4K pero aún >= floor del perfil: nada que relajar.
        return static_floor_bps, "degraded_above_profile_floor_static"
    end
    return sustainable, "degraded_relaxed_to_sustainable"
end

-- select_variants: ESPEJO de la keep-logic de combined_body_filter pero con floor adaptativo.
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
