-- ═══════════════════════════════════════════════════════════════════════════
-- APE URI REBASE — metadata-only edge (F0)
-- ═══════════════════════════════════════════════════════════════════════════
-- Convierte TODA URI relativa de una playlist HLS en absoluta hacia el ORIGEN
-- DEL PROVEEDOR, para que el reproductor NUNCA pida segmentos al VPS.
--
-- Por qué existe: `vps/cmaf_worker.php` usa `-c:v copy` (remux) y
-- `combined_body_filter.lua` no rebasa URIs. Si la playlist sale del VPS, el
-- player resuelve los segmentos relativos contra el VPS y el video termina
-- pasando por él (location \.(ts|m4s)$ con caché de 10 min). Este filtro cierra
-- ese agujero: el VPS sirve SOLO texto de playlist.
--
-- SEMÁNTICA CORRECTA de `body_filter_by_lua_file` (verificado empíricamente en
-- el VPS, nginx 1.24 + libnginx-mod-http-lua 0.10.26): el archivo NO define una
-- función; el archivo completo se ejecuta COMO handler por cada chunk del
-- cuerpo. Además el "global write guard" de OpenResty BLOQUEA escribir globales
-- (definir `function body_filter()` no funciona: el write se descarta).
-- Por eso todo aquí es `local` y el handler va a nivel de chunk.
--
-- Contrato:
--   - Solo actúa sobre playlists (Content-Type mpegurl/m3u8 o body con #EXTM3U).
--   - Reescribe líneas URI sueltas (variantes y segmentos).
--   - Reescribe URI="..." dentro de tags (#EXT-X-KEY, MAP, PART, PRELOAD-HINT,
--     MEDIA, I-FRAME-STREAM-INF, SESSION-KEY).
--   - Acumula chunks en ngx.ctx hasta eof (las playlists son pequeñas).
--   - Nunca escribe en disco; acota el buffer a MAX_BODY.
--
-- Uso en nginx:
--     set $ape_upstream_origin "http://host-proveedor";
--     header_filter_by_lua_block { ngx.header["Content-Length"] = nil }
--     body_filter_by_lua_file /etc/nginx/lua/ape_uri_rebase.lua;
-- ═══════════════════════════════════════════════════════════════════════════

local MAX_BODY = 4 * 1024 * 1024  -- 4 MB: ninguna playlist real se acerca

local function origin_of()
    local o = ngx.var.ape_upstream_origin
    if (not o or o == "") and ngx.var.ape_host then
        o = "http://" .. ngx.var.ape_host
    end
    if not o or o == "" then return nil end
    return (o:gsub("/+$", ""))
end

-- Devuelve la URI absoluta, o nil si no hay que tocarla.
local function absolutize(uri, origin)
    if not uri or uri == "" then return nil end
    if uri:match("^%a[%w+.-]*://") then return nil end   -- ya es absoluta
    if uri:match("^//") then return nil end              -- esquema-relativa
    if uri:match("^data:") or uri:match("^blob:") then return nil end
    if uri:sub(1, 1) == "/" then
        return origin .. uri
    end
    return origin .. "/" .. uri                          -- relativa al directorio
end

local function rebase_uri_attrs(line, origin)
    line = line:gsub('(URI=")([^"]+)(")', function(pre, uri, post)
        local abs = absolutize(uri, origin)
        if abs then return pre .. abs .. post end
        return pre .. uri .. post
    end)
    line = line:gsub("(URI=)([^,%s]+)", function(pre, uri)
        if uri:sub(1, 1) == '"' then return pre .. uri end
        local abs = absolutize(uri, origin)
        if abs then return pre .. abs end
        return pre .. uri
    end)
    return line
end

local function rebase_body(body, origin)
    local out = {}
    local n_uri, n_attr = 0, 0
    for line in (body .. "\n"):gmatch("(.-)\r?\n") do
        if line == "" then
            -- línea vacía: se descarta (solo puede ser la falsa del final)
        elseif line:sub(1, 1) == "#" then
            local before = line
            line = rebase_uri_attrs(line, origin)
            if line ~= before then n_attr = n_attr + 1 end
            out[#out + 1] = line
        else
            local abs = absolutize(line, origin)
            if abs then
                out[#out + 1] = abs
                n_uri = n_uri + 1
            else
                out[#out + 1] = line
            end
        end
    end
    return table.concat(out, "\n") .. "\n", n_uri, n_attr
end

-- ═══════════════════════════════════════════════════════════════════════════
-- VÍA B — FUSIBLE EN CALIENTE: rewrite del SUELO declarado
-- ───────────────────────────────────────────────────────────────────────────
-- Lo pide `ape_header.lua` (header_filter) vía ngx.ctx; aquí sólo se APLICA,
-- sobre el cuerpo completo ya buffereado al eof (nunca sobre chunks sueltos).
--
-- Qué se toca: EXCLUSIVAMENTE el suelo declarado del manifiesto.
--     #EXTVLCOPT:adaptive-minbitrate=<n>          -> <fuse_bps>
--     #KODIPROP:inputstream.adaptive.min_bandwidth=<n> -> <fuse_bps>
--
-- Qué NO se toca nunca (prohibido por contrato):
--     CODECS= · BANDWIDTH= · AVERAGE-BANDWIDTH= · RESOLUTION= · FRAME-RATE=
--     (el fusible no declara códecs ni resoluciones: no puede crear FZ-01)
--
-- GUARDA DE FRONTERA `%f[%w_]` (factoría propia, no cosmética): sin ella, el
-- patrón `min_bandwidth=` también casaría dentro de `prefetch_min_bandwidth=`,
-- que es un PRESUPUESTO DE PREFETCH y no el suelo del canal. La frontera exige
-- que el nombre del campo NO venga precedido de carácter alfanumérico ni `_`,
-- así que `...adaptive.min_bandwidth=` (precedido de `.`) SÍ casa y
-- `prefetch_min_bandwidth=` (precedido de `_`) NO. Sin esta guarda el fusible
-- tocaría un segundo campo y rompería "el único campo tocado es el suelo".
--
-- Se usa la forma de reemplazo del contrato (`"%1" .. tostring(bps)`). Es
-- inequívoca: en las cadenas de reemplazo de Lua, `%n` consume UN solo dígito,
-- así que `"%1" .. "18000000"` = grupo 1 + literal "18000000".
-- ═══════════════════════════════════════════════════════════════════════════

-- Devuelve (cuerpo_reescrito, nº_de_sustituciones). 0 ⇒ cuerpo intacto.
-- Defensa en profundidad: el caller ya exige fuse_bps > 0, pero aquí se vuelve
-- a rechazar 0/negativo/ausente para que jamás se declare un suelo inválido
-- (`adaptive-minbitrate=-1`) aunque el contrato cambie de sitio.
local function apply_fuse(body, fuse_bps)
    local floor_bps = tonumber(fuse_bps)
    if not floor_bps then return body, 0 end
    floor_bps = math.floor(floor_bps)
    if floor_bps <= 0 then return body, 0 end   -- 0 o negativo: no se toca
    local bps = tostring(floor_bps)

    local n = 0
    local hits = 0

    body, n = body:gsub("%f[%w_](adaptive%-minbitrate=)(%d+)", "%1" .. bps)
    hits = hits + n

    body, n = body:gsub("%f[%w_](min_bandwidth=)(%d+)", "%1" .. bps)
    hits = hits + n

    return body, hits
end

-- ═══════════════════════════════════════════════════════════════════════════
-- HANDLER — se ejecuta por cada chunk del cuerpo de la respuesta
-- ═══════════════════════════════════════════════════════════════════════════
local chunk = ngx.arg[1]
local eof   = ngx.arg[2]

ngx.ctx.ape_buf = (ngx.ctx.ape_buf or "") .. (chunk or "")

if not eof then
    ngx.arg[1] = nil            -- retenemos hasta tener el cuerpo completo
    return
end

local body = ngx.ctx.ape_buf or ""
ngx.ctx.ape_buf = nil

if #body > MAX_BODY then
    ngx.log(ngx.ERR, "[ape-rebase] body demasiado grande (", #body, "), pasa sin tocar")
    ngx.arg[1] = body
    return
end

local ctype = ngx.var.sent_http_content_type or ""
ctype = ctype:lower()
local looks_hls = ctype:find("mpegurl", 1, true) ~= nil
    or ctype:find("m3u8", 1, true) ~= nil
    or body:find("#EXTM3U", 1, true) ~= nil

if not looks_hls then
    ngx.arg[1] = body
    return
end

local origin = origin_of()
if not origin then
    ngx.log(ngx.WARN, "[ape-rebase] sin origen de upstream: cuerpo intacto")
    ngx.arg[1] = body
    return
end

local rebased, n_uri, n_attr = rebase_body(body, origin)

-- ── VÍA B: fusible en caliente, DESPUÉS del rebase y sobre el cuerpo completo ──
-- Si no hay fusible, `out` es exactamente `rebased` ⇒ byte-idéntico al
-- comportamiento anterior (criterio de fallback total).
local out = rebased
local n_fuse = 0
if ngx.ctx.ape_fuse == true then
    local fuse_bps = tonumber(ngx.ctx.ape_fuse_bps)
    if fuse_bps and fuse_bps > 0 then
        out, n_fuse = apply_fuse(out, fuse_bps)
    else
        -- Cabecera presente pero sin perfil resoluble: no se inventa el suelo.
        ngx.log(ngx.WARN, "[ape-rebase] fuse activo sin suelo resoluble: cuerpo intacto")
    end
end

ngx.arg[1] = out

-- Telemetría: contador de manifiestos realmente fusionados. Nil-safe y a prueba
-- de un dict ausente o de un valor no numérico (pcall con argumentos, sin closure).
if n_fuse > 0 then
    local qoe = ngx.shared.ape_qoe
    if qoe then
        pcall(qoe.incr, qoe, "fuse_hits", 1, 0)
    end
end

ngx.log(ngx.INFO, "[ape-rebase] ok uri=", n_uri, " attrs=", n_attr,
        " fuse=", n_fuse, " origin=", origin)
