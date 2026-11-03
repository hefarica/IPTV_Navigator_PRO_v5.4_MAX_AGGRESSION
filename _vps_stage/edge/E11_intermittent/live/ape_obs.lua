-- ═══════════════════════════════════════════════════════════════════════════
-- APE OBS — observabilidad del plano de metadata (telemetría QoE + health)
-- ═══════════════════════════════════════════════════════════════════════════
-- Sirve dos endpoints (solo loopback, ver conf):
--   /_ape/qoe     → métricas del plano (contadores reales del shared dict)
--   /_ape/health  → estado 24/7: nginx vivo, flags, hosts castigados, QoE
--
-- Honestidad de las métricas: son del PLANO DE METADATA (peticiones de playlist,
-- latencia de upstream, failovers). NO son rebuffer del player, que solo puede
-- medir el reproductor o el observador de segmentos (no desplegado aquí porque
-- este vps no sirve video).
--
-- `get_keys` puede bloquear en dicts grandes: se usa con tope y bajo pcall.
-- ═══════════════════════════════════════════════════════════════════════════
local cjson = require "cjson.safe"

local Q = ngx.shared.ape_qoe
local H = ngx.shared.ape_hosts
local F = ngx.shared.ape_flags

local METRICS = {
    "req", "bytes", "failovers", "all_failed", "auth_denied",
    "rebase_ok", "llhls_sc", "hint_injected", "last_ms", "last_host", "last_ts",
}

local function safe_keys(dict, max)
    if not dict then return {} end
    local ok, keys = pcall(dict.get_keys, dict, max or 200)
    if ok and type(keys) == "table" then return keys end
    return {}
end

local function qoe()
    local snap = { metrics = {}, hosts_down = {}, flags = {} }
    if Q then
        for _, k in ipairs(METRICS) do snap.metrics[k] = Q:get(k) end
        for _, k in ipairs(safe_keys(Q, 500)) do
            if k:sub(1, 5) == "host_" then snap.metrics[k] = Q:get(k) end
        end
    end
    if H then
        for _, k in ipairs(safe_keys(H, 200)) do
            if k:sub(1, 5) == "down:" then snap.hosts_down[k:sub(6)] = H:get(k) end
        end
    end
    if F then
        for _, k in ipairs({ "rebase", "enrich", "virtual4k", "wake", "sentinel", "auth", "hint" }) do
            snap.flags[k] = F:get(k)
        end
    end
    snap.plane = "meta/v3"
    snap.ts = ngx.time()
    return snap
end

local function health()
    local snap = qoe()
    local n_down = 0
    for _ in pairs(snap.hosts_down) do n_down = n_down + 1 end
    local req = tonumber(snap.metrics.req) or 0
    local failed = tonumber(snap.metrics.all_failed) or 0
    local err_ratio = req > 0 and (failed / req) or 0
    ngx.status = 200
    return {
        ok = true,
        plane = "meta/v3",
        ts = snap.ts,
        checks = {
            nginx = true,                       -- si responde, nginx vive
            shared_dicts = (Q ~= nil and H ~= nil and F ~= nil),
            upstreams_down = n_down,
            requests = req,
            error_ratio = tonumber(string.format("%.4f", err_ratio)),
            last_latency_ms = snap.metrics.last_ms,
            last_host = snap.metrics.last_host,
        },
        qoe = snap.metrics,
    }
end

local uri = ngx.var.uri or ""
ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"

if uri == "/_ape/health" then
    -- interno (loopback): completo
    ngx.say(cjson.encode(health()))
elseif uri == "/ape/health" then
    -- público: mínimo, sin métricas internas ni hosts
    local snap = qoe()
    ngx.say(cjson.encode({
        ok = true,
        plane = snap.plane,
        ts = snap.ts,
        upstreams_down = (function()
            local n = 0
            for _ in pairs(snap.hosts_down) do n = n + 1 end
            return n
        end)(),
    }))
else
    ngx.say(cjson.encode(qoe()))
end
