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
    -- E7: contadores que el gateway YA escribía pero este endpoint NO publicaba
    -- (`redirects`, `cdn_denied`, `too_large`, `uhd4k`, `uhd8k`, `last_origin`).
    -- Sin esto, el 302 seguido, las denegaciones de allowlist y las omisiones
    -- de UHD eran invisibles aunque estuvieran contadas.
    "redirects", "cdn_denied", "too_large", "uhd4k", "uhd8k", "last_origin",
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
        -- E7: el dict hospeda además la familia ventaneada (m<slot>: / e<slot>:,
        -- ~330 claves). Se sube el tope de get_keys (siempre bajo pcall) para no
        -- perder ninguna clave host_* por truncación; con este tamaño no bloquea.
        for _, k in ipairs(safe_keys(Q, 1000)) do
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
    -- E7 · FIX de la fórmula (defecto D-67 del baseline E1):
    --   antes  error_ratio = all_failed / req   y `req` solo contaba ÉXITOS
    --          ⇒ 24 fallos / 91 éxitos se publicaba como 0,2637 y el 0,2087
    --          real de intentos quedaba falseado (y el acumulado seguía
    --          envenenado por las sondas de esa sesión).
    --   ahora  error_ratio = fallos / INTENTOS, con intentos = éxitos + fallos
    --          + denegados + demasiado_grande. Es el mismo universo que usa
    --          el gateway para decidir (una petición = un intento).
    local req    = tonumber(snap.metrics.req) or 0
    local failed = tonumber(snap.metrics.all_failed) or 0
    local denied = tonumber(snap.metrics.cdn_denied) or 0
    local big    = tonumber(snap.metrics.too_large) or 0
    local attempts = req + failed + denied + big
    local fails    = failed + denied + big
    local err_ratio = attempts > 0 and (fails / attempts) or 0
    local err_ratio_old = req > 0 and (failed / req) or 0   -- se publica para auditar el cambio

    -- E7 · ventana deslizante (no envenenable): si el módulo está desplegado se
    -- publica también la verdad de los últimos 5 min, que es la citable (D-67).
    local win
    local okm, MOD = pcall(require, "ape_obs_metrics")
    if okm and MOD and MOD.snapshot then
        local okd, s = pcall(MOD.snapshot, MOD.SLOT_SEC)
        if okd and s then
            win = {
                window_s = s.window and s.window.coverage_s or nil,
                attempts = s.errors and s.errors.attempts or nil,
                error_ratio = s.errors and s.errors.error_ratio or nil,
                provider_fetch_p50_ms = s.provider_fetch_ms and s.provider_fetch_ms.p50_ms or nil,
                provider_fetch_p95_ms = s.provider_fetch_ms and s.provider_fetch_ms.p95_ms or nil,
                hops_mean = s.hops and s.hops.mean or nil,
                uhd_declared_pct = s.uhd_mode and s.uhd_mode.declared_pct or nil,
                rebase_pct = s.rebase and s.rebase.rebase_pct or nil,
                endpoint = "/_ape/metrics",
            }
        end
    end

    ngx.status = 200
    return {
        ok = true,
        plane = "meta/v3",
        ts = snap.ts,
        checks = {
            nginx = true,                       -- si responde, nginx vive
            shared_dicts = (Q ~= nil and H ~= nil and F ~= nil),
            upstreams_down = n_down,
            requests = req,                     -- compat: sigue siendo #éxitos
            attempts = attempts,                -- E7: universo real de intentos
            fail_total = fails,                 -- E7
            error_ratio = tonumber(string.format("%.4f", err_ratio)),
            error_ratio_semantics = "fallos/intentos (E7; antes fallos/éxitos)",
            error_ratio_legacy = tonumber(string.format("%.4f", err_ratio_old)),
            last_latency_ms = snap.metrics.last_ms,
            last_host = snap.metrics.last_host,
        },
        window = win,                           -- E7 (nil si el módulo no está)
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
