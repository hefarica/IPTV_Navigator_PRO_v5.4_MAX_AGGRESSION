-- ═════════════════════════════════════════════════════════════════════════════
-- APE OBS HTTP — familia `e:` (tiempos vistos por nginx por location)
-- ═════════════════════════════════════════════════════════════════════════════
-- Se cuelga en CUALQUIER location con `log_by_lua_file` (fase log: después de
-- enviar la respuesta ⇒ 0 coste para el cliente):
--
--   443 · location ~ ^/cdn/  → mide el borde público (proxy_pass al 8088)
--   443 · location ~ \.m3u8$ → mide la entrega de la lista (h1 vs h2, bytes)
--   8088 · /meta/            → va ENCADENADO con el wake (ape_log_chain.lua)
--
-- QUÉ APORTA
--   · request_time / upstream_response_time medios por location y ventana.
--     Comparado con la familia `m:` (decisión del gateway) cuantifica el coste
--     del doble hop 443→8088 y del handler, sin instrumentar nada más.
--   · Reparto de status y HTTP/1.1 vs HTTP/2: permite demostrar el efecto de la
--     fase 1 (HTTP/2) con el mismo muestreo, sin tocar la lista.
--
-- NO duplica la familia `m:`: aquí NO se registran métricas de la decisión.
-- pcall total; sin I/O; sin ngx.exit; nunca bloquea nada.
-- ═════════════════════════════════════════════════════════════════════════════

-- "0.001", "0.001, 0.002" (reintentos), "-", "" (sin upstream) → suma en ms
local function sum_times(v)
    if type(v) ~= "string" or v == "" or v == "-" then return nil end
    local total, seen = 0, 0
    for num in v:gmatch("(%d+%.?%d*)") do
        local n = tonumber(num)
        if n then
            total = total + n
            seen = seen + 1
        end
    end
    if seen == 0 then return nil end
    return total * 1000
end

local ok, err = pcall(function()
    local MOD = require "ape_obs_metrics"
    MOD.record_http({
        request_ms  = sum_times(ngx.var.request_time),
        upstream_ms = sum_times(ngx.var.upstream_response_time),
        status      = tonumber(ngx.status) or tonumber(ngx.var.status) or 0,
        bytes       = tonumber(ngx.var.bytes_sent),
        protocol    = ngx.var.server_protocol,
    })
end)

if not ok then
    ngx.log(ngx.WARN, "[ape-obs-http] non-fatal: ", tostring(err))
end
