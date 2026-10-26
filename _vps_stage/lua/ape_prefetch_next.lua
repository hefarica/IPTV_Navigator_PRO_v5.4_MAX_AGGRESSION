-- ═══════════════════════════════════════════════════════════════════════════
-- APE PREFETCH NEXT — predicción secuencial del siguiente segmento
-- Fase: body_filter_by_lua_file sobre el MANIFEST (location ^/live/index.m3u8$)
-- ═══════════════════════════════════════════════════════════════════════════
-- Qué hace: al terminar de servir el manifest, identifica el segmento del
-- BORDE VIVO (el último de la lista = el que el player pedirá a continuación) y
-- lo pide en SEGUNDO PLANO para dejarlo caliente en la cache antes de que el
-- player lo solicite. Efecto: el gap entre segmentos percibido por el cliente
-- baja a ~0 porque el objeto ya está en /dev/shm.
--
-- Por qué en `body_filter` y no en `access`: el manifest es la única respuesta
-- que conocemos ANTES de que el player pida el segmento; el body_filter nos da
-- el cuerpo completo sin coste extra de red.
--
-- POR QUÉ EL TRABAJO VA EN `ngx.timer.at` Y NO AQUÍ:
--   Los cosockets están PROHIBIDOS en body_filter (fase de filtro). Hacer I/O
--   ahí bloquearía el worker para todos los clientes. El timer lanza una light
--   thread y el cliente nunca espera: AUTOPISTA.
--
-- DEDUP: `ape_fanout:pf:<uri>` con TTL 10 s. 50 clientes sobre el mismo manifest
-- no disparan 50 prefetch: disparan uno y los demás lo ven caliente.
--
-- CONTRATO:
--   · NUNCA modifica el cuerpo (se re-emite idéntico) → byte-identidad.
--   · NUNCA bloquea, NUNCA ngx.exit, NUNCA falla hacia el cliente.
--   · Si el dict o el timer no están, no hace nada (passthrough).
-- ═══════════════════════════════════════════════════════════════════════════

local MAX_BUF   = 4 * 1024 * 1024
local DEDUP_TTL = 10

local chunk = ngx.arg[1]
local eof   = ngx.arg[2]

-- Acumulación por chunk (patrón de la casa: se emite todo al eof)
if not ngx.ctx.ape_pf_buf then
    ngx.ctx.ape_pf_buf = {}
end
if chunk and #chunk > 0 then
    ngx.ctx.ape_pf_buf[#ngx.ctx.ape_pf_buf + 1] = chunk
    ngx.arg[1] = nil
end
if not eof then
    return
end

local body = table.concat(ngx.ctx.ape_pf_buf or {})
ngx.ctx.ape_pf_buf = nil

-- Se re-emite SIEMPRE el cuerpo completo e idéntico
ngx.arg[1] = body

-- A partir de aquí: solo efectos laterales, nunca afectan a esta respuesta
if #body == 0 or #body > MAX_BUF then
    return
end
if ngx.status ~= 200 then
    return
end

local ok = pcall(function()
    -- ── Borde vivo: último segmento declarado en el manifest ───────────────
    local last_seg
    for line in body:gmatch("[^\r\n]+") do
        if line:sub(1, 1) ~= "#" then
            if line:match("%.ts$") or line:match("%.m4s$")
               or line:match("%.ts%?") or line:match("%.m4s%?") then
                last_seg = line
            end
        end
    end
    if not last_seg then
        return
    end

    -- URI relativa al directorio del manifest
    local uri = last_seg
    if uri:match("^https?://") then
        local p = uri:match("^https?://[^/]+(/.*)$")
        if not p then return end
        uri = p
    elseif uri:sub(1, 1) ~= "/" then
        local dir = ngx.var.uri:match("^(.*/)") or "/live/"
        uri = dir .. uri
    end

    local dict = ngx.shared.ape_fanout
    if not dict then
        return
    end

    -- Dedup: si ya está caliente o ya se pidió, no se repite
    local dkey = "pf:" .. uri
    if dict:get(dkey) then
        local _ = dict:incr("pf_skip", 1, 0)
        return
    end
    dict:set(dkey, 1, DEDUP_TTL)

    -- Si el objeto YA está en cache, el prefetch es innecesario
    local hits = dict:incr("pf_fired", 1, 0)

    local port = ngx.var.server_port or "8080"

    ngx.timer.at(0, function(premature)
        if premature then return end
        local sock = ngx.socket.tcp()
        sock:settimeouts(300, 1000, 2000)
        local okc = sock:connect("127.0.0.1", tonumber(port))
        if not okc then
            sock:close()
            return
        end
        local req = "GET " .. uri .. " HTTP/1.1\r\n"
                 .. "Host: 127.0.0.1:" .. port .. "\r\n"
                 .. "Connection: close\r\n"
                 .. "User-Agent: APE-Prefetch/2.0\r\n\r\n"
        local sent = sock:send(req)
        if not sent then
            sock:close()
            return
        end
        -- Leer solo las cabeceras + un trozo: suficiente para que nginx
        -- complete la escritura en cache del objeto.
        sock:receive("*l")
        for _ = 1, 30 do
            local line = sock:receive("*l")
            if not line or line == "" then break end
        end
        sock:receive(8192)
        sock:close()
        local d = ngx.shared.ape_fanout
        if d then
            d:incr("pf_done", 1, 0)
        end
    end)

    ngx.log(ngx.INFO, "[ape-prefetch] warm uri=", uri, " n=", tostring(hits))
end)

if not ok then
    ngx.log(ngx.WARN, "[ape-prefetch] non-fatal: cuerpo servido igualmente")
end
