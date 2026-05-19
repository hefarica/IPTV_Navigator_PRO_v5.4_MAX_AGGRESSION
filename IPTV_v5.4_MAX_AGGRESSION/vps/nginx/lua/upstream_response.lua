-- ════════════════════════════════════════════════════════════════════════════
-- NET SHIELD — AUTOPISTA MODE: Upstream response telemetry (NEVER blocks)
-- ────────────────────────────────────────────────────────────────────────────
-- Hook: header_filter_by_lua_file (POST-response, tras upstream)
--
-- HISTORIAL:
--   v1 (2026-04-26): Circuit breaker con windowed failure counting + cooldowns
--   v2 (2026-04-26): AUTOPISTA — solo registra telemetría, NUNCA abre circuito.
--     proxy_next_upstream maneja failover entre IPs.
--     proxy_cache_use_stale maneja 403/5xx del CDN.
--     No se bloquea ningún host ni canal.
--
-- RAZÓN DEL CAMBIO:
--   El circuit breaker aplicaba por HOST (tivigo.cc), no por canal.
--   Un 403 en canal 557887 bloqueaba 15 min TODOS los canales de tivigo.cc.
--   5 x 502 en 15s (normal durante upstream pool rotation) abría el circuito
--   y bloqueaba todo por 15-30s.
-- ════════════════════════════════════════════════════════════════════════════

local metrics_dict = ngx.shared.circuit_metrics

local host = ngx.var.shield_host
if not host or host == "" then
    return
end

-- Skip si request no llegó a upstream
local ut = ngx.var.upstream_response_time
if not ut or ut == "" or ut == "-" then
    return
end

-- Skip cache hits (no representan estado real del upstream)
local cs = ngx.var.upstream_cache_status
if cs == "STALE" or cs == "HIT" then
    return
end

local status = ngx.status

-- ─── Telemetry: register status codes per host ───
if metrics_dict then
    if status >= 200 and status < 300 then
        metrics_dict:incr(host .. ":2xx", 1, 0)
    elseif status >= 300 and status < 400 then
        metrics_dict:incr(host .. ":3xx", 1, 0)
    elseif status >= 400 and status < 500 then
        metrics_dict:incr(host .. ":4xx", 1, 0)
        metrics_dict:incr(host .. ":err_" .. tostring(status), 1, 0)
    elseif status >= 500 then
        metrics_dict:incr(host .. ":5xx", 1, 0)
        metrics_dict:incr(host .. ":err_" .. tostring(status), 1, 0)
    end
end

-- ─── Log non-2xx for observability ───
if status >= 400 then
    ngx.log(ngx.WARN,
        "[APE-UPSTREAM] host=", host,
        " status=", status,
        " ut=", ut,
        " cs=", tostring(cs),
        " uri=", ngx.var.request_uri)
end

-- Headers for debugging (always set, never block)
ngx.header["X-APE-Circuit"]   = "PASSTHROUGH"
ngx.header["X-APE-Upstream"]  = host
ngx.header["X-APE-Status"]    = tostring(status)

-- ═══ PRISMA v2.0: Sentinel Auth Guard (header_filter companion) ═════
-- Tracks 401/403 from upstream, rotates UA pool, detects "hot" providers.
-- SAFETY: Entire sentinel runs inside pcall. If it fails, the response
-- continues normally with just the PASSTHROUGH headers above.
-- dofile() used because sentinel_auth_guard.lua is a standalone script,
-- not a Lua module returning a table.
local sent_ok, sent_err = pcall(dofile, "/etc/nginx/lua/sentinel_auth_guard.lua")
if not sent_ok then
    ngx.log(ngx.ERR, "SENTINEL_MERGE_ERROR: " .. tostring(sent_err))
end
-- ═══ End PRISMA v2.0 ═══════════════════════════════════════════════
