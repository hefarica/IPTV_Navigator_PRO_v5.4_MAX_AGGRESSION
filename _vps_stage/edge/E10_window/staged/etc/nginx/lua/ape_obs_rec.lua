-- ═════════════════════════════════════════════════════════════════════════════
-- APE OBS REC — registrador de la DECISIÓN en fase log (AUTOPISTA-SAFE)
-- ═════════════════════════════════════════════════════════════════════════════
-- Se cuelga del location del gateway (/cdn/) en el plano 8088:
--
--     location ~ ^/cdn/(?<ape_host>[^/]+)(?<ape_path>/.*)$ {
--         content_by_lua_file /etc/nginx/lua/ape_gateway.lua;
--         log_by_lua_file     /etc/nginx/lua/ape_obs_rec.lua;   # ← E7
--     }
--
-- POR QUÉ AQUÍ Y NO EN EL CONTENT HANDLER
--   nginx ejecuta `log_by_lua` DESPUÉS de enviar el último byte al cliente
--   (misma fase que ape_wake_on_manifest.lua, ya en producción). Es decir: el
--   jugador NO espera por estas métricas. El content handler solo dejó una tabla
--   local en ngx.ctx.ape_dec con números que YA tenía calculados.
--
-- QUÉ HACE
--   Vuelca ngx.ctx.ape_dec en el histograma ventaneado de ape_obs_metrics.lua:
--   provider_fetch_ms (percentiles), split primer/último hop, hops, uhd_mode,
--   rebase y error_ratio por intentos.
--
-- GARANTÍAS
--   · pcall total: un fallo aquí NUNCA afecta a una respuesta ya enviada.
--   · Sin I/O, sin ngx.exit, sin ngx.say, sin timers, sin circuit breaker.
--   · Si el módulo o el dict no están, sale en silencio (no rompe nada).
-- ═════════════════════════════════════════════════════════════════════════════

local ok, err = pcall(function()
    local dec = ngx.ctx.ape_dec
    if type(dec) ~= "table" then
        -- Ruta sin decisión (p.ej. 404 del plano, o gateway antiguo sin
        -- instrumentar): no se inventa nada. La familia `e:` mide el borde.
        return
    end
    local MOD = require "ape_obs_metrics"
    MOD.record_decision(dec)
end)

if not ok then
    ngx.log(ngx.WARN, "[ape-obs-rec] non-fatal: ", tostring(err))
end
