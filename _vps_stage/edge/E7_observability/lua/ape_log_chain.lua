-- ═════════════════════════════════════════════════════════════════════════════
-- APE LOG CHAIN — un solo `log_by_lua` que compone dos responsabilidades
-- ═════════════════════════════════════════════════════════════════════════════
-- nginx admite UNA sola directiva *_by_lua por fase en un location. El plano ya
-- usa `log_by_lua_file` en `/meta/` para el wake-on-manifest; E7 añade la
-- telemetría de borde (`e:`). Este archivo los encadena en orden:
--
--   1. ape_wake_on_manifest.lua  (comportamiento EXISTENTE, intacto)
--   2. ape_obs_http.lua          (familia `e:`: request_time/upstream/status/h1-h2)
--
-- Ambas bajo pcall y en fase log (después de responder): si una falla, la otra
-- sigue; si las dos fallan, la respuesta ya se envió y no pasa nada.
--
-- Uso (sustituye al wake suelto, una sola línea):
--     log_by_lua_file /etc/nginx/lua/ape_log_chain.lua;
--
-- El directorio de Lua se toma de `$ape_lua_dir` (definido en el server block)
-- para poder remapearlo en los tests aislados, igual que hace ape_header.lua.
-- ═════════════════════════════════════════════════════════════════════════════

local dir = ngx.var.ape_lua_dir or "/etc/nginx/lua/"
if dir:sub(-1) ~= "/" then dir = dir .. "/" end

-- 1 · wake-on-manifest (sin cambios de comportamiento; ya era no bloqueante)
local ok1, err1 = pcall(dofile, dir .. "ape_wake_on_manifest.lua")
if not ok1 then
    ngx.log(ngx.WARN, "[ape-log-chain] wake non-fatal: ", tostring(err1))
end

-- 2 · telemetría de borde
local ok2, err2 = pcall(dofile, dir .. "ape_obs_http.lua")
if not ok2 then
    ngx.log(ngx.WARN, "[ape-log-chain] obs non-fatal: ", tostring(err2))
end
