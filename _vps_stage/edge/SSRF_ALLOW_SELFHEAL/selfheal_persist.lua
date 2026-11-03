-- selfheal_persist.lua · [t95]
-- Drena la cola `selfheal_q` del shared dict `ape_hosts` y persiste cada host
-- nuevo en /etc/nginx/ape-hosts-allow.d/<host>.
--
-- SE EJECUTA EN log_by_lua: DESPUÉS de enviar la respuesta al cliente.
-- Por eso NO añade latencia a la petición ni bloquea: la petición ya terminó.
--
-- Registro en nginx.conf (NO aplicado; va en el plan de despliegue):
--   lua_shared_dict ape_hosts 10m;
--   log_by_lua_file /etc/nginx/lua/selfheal_persist.lua;

local HOSTS = ngx.shared.ape_hosts
local DIR = "/etc/nginx/ape-hosts-allow.d"

if not HOSTS then return end

-- Máximo por request: la cola nunca debe crecer sin control en un pico.
for _ = 1, 5 do
    local host = HOSTS:lpop("selfheal_q")
    if not host then break end

    -- Sanidad: nada de rutas ni separadores en el nombre del fichero.
    if host ~= "" and not host:find("[/\\%z]") and not host:find("%.%.") then
        local path = DIR .. "/" .. host
        local f = io.open(path, "r")
        if f then
            f:close()                      -- ya persistido: no se reescribe
        else
            local w, err = io.open(path, "w")
            if w then
                w:write("# auto-registrado por ape_gateway (t95)\n", host, "\n")
                w:close()
            else
                -- No se puede escribir: se devuelve a la cola y se avisa una vez.
                HOSTS:rpush("selfheal_q", host)
                ngx.log(ngx.WARN, "[ape-selfheal] no se pudo escribir ", path, ": ", tostring(err))
                break
            end
        end
    end
end
