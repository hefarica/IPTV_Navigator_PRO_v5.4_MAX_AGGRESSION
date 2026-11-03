-- ═════════════════════════════════════════════════════════════════════════════
-- APE OBS METRICS API — `GET /_ape/metrics` (solo loopback)
-- ═════════════════════════════════════════════════════════════════════════════
-- Publica, en JSON, las métricas de la DECISIÓN medidas con ventana deslizante:
--   provider_fetch_ms (p50/p90/p95/p99 + buckets), split primer/último hop,
--   hops, uhd_mode, rebase y errors (error_ratio = fallos/intentos).
--
-- Contrato:
--   GET /_ape/metrics                     → ventana 300 s (5 min)
--   GET /_ape/metrics?window=900          → ventana 900 s (15 min)  [300..1800]
--   GET /_ape/metrics?cumulative=0        → omite el bloque de contadores viejos
--
-- El JSON va compacto (lua-cjson no indenta): el formateo humano lo hace
-- `tools/e7_obs.mjs read`, que es el consumidor previsto.
--
-- NO lleva tabla de valores esperados: eso vive en el arnés (`e7_obs.mjs expect`)
-- y en docs/edge/E7_OBSERVABILITY.md, para tener UNA sola fuente de calibración.
--
-- Coste: atiende solo loopback, ~O(330) `get` de shared dict (≈0,3 ms). La ruta
-- caliente no pasa por aquí: el registro lo hace ape_obs_rec.lua en fase log.
-- Nunca usa `get_keys` (no escanea ni bloquea el dict) y todo va bajo pcall.
-- ═════════════════════════════════════════════════════════════════════════════

local cjson = require "cjson.safe"

local function fail(status, msg)
    ngx.status = status
    ngx.header["Content-Type"] = "application/json"
    ngx.header["Cache-Control"] = "no-store"
    ngx.say(cjson.encode({ schema = "ape.obs.metrics/1", ok = false, error = msg }))
    return
end

local ok, err = pcall(function()
    ngx.header["Content-Type"] = "application/json"
    ngx.header["Cache-Control"] = "no-store"
    ngx.header["X-APE-Obs"] = "metrics/1"

    local MOD = require "ape_obs_metrics"

    local win = tonumber(ngx.var.arg_window) or MOD.SLOT_SEC
    if win < MOD.SLOT_SEC then win = MOD.SLOT_SEC end
    if win > MOD.SLOT_SEC * MOD.NSLOT then win = MOD.SLOT_SEC * MOD.NSLOT end

    local snap = MOD.snapshot(win)
    snap.ok = true
    if (ngx.var.arg_cumulative or "1") ~= "0" then
        snap.cumulative = MOD.cumulative()
    end

    local body = cjson.encode(snap)
    if not body then
        return fail(500, "json_encode_failed")
    end
    ngx.print(body)
end)

if not ok then
    ngx.log(ngx.ERR, "[ape-obs-api] ", tostring(err))
    fail(500, tostring(err))
end
