-- ════════════════════════════════════════════════════════════════════════════
-- NET SHIELD — AUTOPISTA MODE: Pass-through gate (telemetry only, NEVER blocks)
-- ────────────────────────────────────────────────────────────────────────────
-- Hook: access_by_lua_file (PRE-fetch, antes de proxy_pass)
--
-- HISTORIAL:
--   v1 (2026-04-26): Circuit breaker formal CLOSED/HALF-OPEN/OPEN
--   v2 (2026-04-26): AUTOPISTA — eliminado bloqueo. El gate SIEMPRE permite
--     pasar al upstream. Solo registra telemetría para observabilidad.
--
-- RAZÓN DEL CAMBIO:
--   El circuit breaker bloqueaba ALL CHANNELS del mismo host cuando un canal
--   daba 502/403. Para un usuario individual esto es contraproducente:
--   mata el zapping y causa freezes de 15s-15min innecesarios.
--   El proxy_next_upstream de nginx ya maneja failover entre IPs del upstream.
--   El proxy_cache_use_stale ya maneja 403/5xx del CDN.
--   No se necesita un circuit breaker adicional.
-- ════════════════════════════════════════════════════════════════════════════

local metrics_dict = ngx.shared.circuit_metrics

-- Solo aplica a paths /shield/{owner}/{host}/...
local host = ngx.var.shield_host
if not host or host == "" then
    return
end

-- Telemetría: contar requests por host
if metrics_dict then
    metrics_dict:incr(host .. ":total_requests", 1, 0)
end

-- ALWAYS pass through — el upstream decide
ngx.header["X-APE-Circuit"] = "PASSTHROUGH"

-- ═══ PRISMA v2.0: Sentinel UA Rotation (access phase companion) ═════
-- sentinel_auth_guard.lua (header_filter) stores the rotated UA in shared dict.
-- sentinel_ua_apply reads it here and sets ngx.var.sentinel_ua for proxy_set_header.
-- SAFETY: pcall + module returns silently on error → static UA used as fallback.
local ua_ok, ua_mod = pcall(require, "sentinel_ua_apply")
if ua_ok and ua_mod and ua_mod.apply then
    ua_mod.apply()
end
-- ═══ End PRISMA v2.0 ═══════════════════════════════════════════════

return
