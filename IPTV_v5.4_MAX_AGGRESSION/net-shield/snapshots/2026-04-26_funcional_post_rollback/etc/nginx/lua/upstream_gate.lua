-- ════════════════════════════════════════════════════════════════════════════
-- NET SHIELD — Fase 3.5 Capa 4 (PHASE 2: OpenResty/Lua circuit breaker gate)
-- ────────────────────────────────────────────────────────────────────────────
-- Hook: access_by_lua_file (PRE-fetch, antes de proxy_pass)
-- Función: si el upstream está en cooldown → return 503 inmediato sin hit upstream
-- ────────────────────────────────────────────────────────────────────────────
-- KEYING: por upstream IPTV host (nfqdeuxu.x1megaott.online, line.tivi-ott.net,
-- ky-tv.cc, tivigo.cc), nunca por host del cliente. La var $shield_host queda
-- seteada en shield-location.conf via "set $shield_host $2;" (regex capture).
-- ════════════════════════════════════════════════════════════════════════════

local dict = ngx.shared.upstream_state

-- Solo aplica a paths /shield/{owner}/{host}/... — fuera de eso skip
local host = ngx.var.shield_host
if not host or host == "" then
    return
end

local function now_ms()
    return ngx.now() * 1000
end

local key_cd = host .. ":cooldownUntil"
local cooldown_until = tonumber(dict:get(key_cd) or 0)
local now = now_ms()

if cooldown_until > now then
    ngx.header["X-APE-Circuit"]  = "cooldown"
    ngx.header["X-APE-Upstream"] = host
    return ngx.exit(503)
end
