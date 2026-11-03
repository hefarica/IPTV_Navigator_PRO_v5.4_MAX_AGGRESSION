-- ═══════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ ANTES DE TOCAR: lee docs/edge/EDGE_EGRESS_RESOLVER.md
--
-- Este fichero participa en el EGRESS del edge. El proveedor EXIGE egress/auth:
-- el `/cdn/` crudo devuelve 407 (reason=http_407, all_upstreams_failed) porque
-- le falta el `srv`/`ctx` que aporta el resolver. NO cambies la logica de
-- egress/host sin leer ese documento y sin actualizar su pin sha256.
-- _vps_stage/tests/edge_doctrine_assert.js falla si este aviso desaparece.
-- ═══════════════════════════════════════════════════════════════════════════
-- APE REBASE LIB — funciones PURAS (sin ngx) reutilizables por los handlers
-- ═══════════════════════════════════════════════════════════════════════════
-- Una sola fuente de verdad para:
--   * rebase de URIs (variantes, segmentos, URI="..." de tags)
--   * inyección de #EXT-X-SERVER-CONTROL para fuentes que YA traen partes
--     (LL-HLS real: solo si hay #EXT-X-PART / #EXT-X-PRELOAD-HINT)
--   * detección de tipo de playlist
-- Es pura a propósito: se puede ejercitar desde /_ape/luatest con asserts.
-- ═══════════════════════════════════════════════════════════════════════════
local M = {}

local MAX_BODY = 4 * 1024 * 1024

function M.is_too_big(n) return n > MAX_BODY end

-- URI absoluta del origen, o nil si no hay que tocarla.
function M.absolutize(uri, origin)
    origin = M.normalize_origin(origin)          -- [t110] nunca :80 dos veces
    if not uri or uri == "" then return nil end
    if uri:match("^%a[%w+.-]*://") then return nil end
    if uri:match("^//") then return nil end
    if uri:match("^data:") or uri:match("^blob:") then return nil end
    if uri:sub(1, 1) == "/" then return origin .. uri end
    return origin .. "/" .. uri
end

-- ── [t110] NORMALIZACIÓN DE HOST:PUERTO — el puerto NUNCA se duplica ───────
-- Causa medida (log 2026-10-27): `origin`/`srv` llegan como `nov202gg.xyz:80`
-- (y `System.Management.Automation...:80`, `185.227.34.184:80`) y el ensamblado
-- volvía a añadir el puerto ⇒ `host:80:80` ⇒ 33 fallos `host:80` en 5 h.
-- Reglas:
--   · colapsa puertos repetidos:  "h:80:80" -> "h:80" -> "h" (80 es default http)
--   · quita :80 en http y :443 en https (son el puerto por defecto del esquema)
--   · deja intactos los puertos NO por defecto (CDN Xtream "1.2.3.4:8080")
function M.dedup_port(hostport)
    if type(hostport) ~= "string" or hostport == "" then return hostport end
    -- [t111] BUCLE hasta estable: en Lua `%1+` NO repite una retro-referencia
    -- (el `+` se aplica a un item de patrón, no a un capture), así que
    -- "a:80:80" no colapsaba. Se itera quitando UN puerto por pasada.
    local h, prev = hostport, nil
    repeat
        prev = h
        h = h:gsub("(:%d+)(:%d+)$", "%1")
    until h == prev
    local base, port = h:match("^([^:]+):(%d+)$")
    if base then
        if port == "80" then return base end          -- :80 es el default de http
        -- 443 se conserva solo si el esquema es https; en la práctica el origen
        -- de estos CDN es http, así que 443 también se cae (ver normalize_origin)
    end
    return h
end

-- "http://h:80" -> "http://h"   ·   "https://h:443" -> "https://h"
function M.normalize_origin(origin)
    if type(origin) ~= "string" or origin == "" then return origin end
    local scheme, host = origin:match("^(%a[%w+.-]*)://([^/]+)")
    if not scheme then return M.dedup_port(origin) end
    local rest = origin:sub(#scheme + 4 + #host)
    local h = M.dedup_port(host)
    local b, port = host:match("^([^:]+):(%d+)$")
    if b then
        if (scheme == "https" and port == "443") or (scheme ~= "https" and port == "80") then h = b end
    end
    return scheme .. "://" .. h .. rest
end

-- ── [t96] REBASE DE ABSOLUTAS CON IPv4 (:puerto opcional) ──────────────────
-- http(s)://<IPv4>(:<puerto>)?/<ruta>  ->  /cdn/<IPv4>(:<puerto>)/<ruta>
-- Devuelve nil si la URI no es una absoluta con IPv4 (los hosts con nombre
-- los sigue rebasando el flujo existente con `origin`).
-- Conserva la query string: el token del CDN suele ir ahi.
function M.to_cdn_path(uri)
    if not uri or uri == "" then return nil end
    -- [t111] admite IPv4 **y** host con nombre: antes solo IPv4, así que
    -- http://nov202gg.xyz:80/x.ts devolvía nil y el fallback no rebasaba.
    local host, port, rest = uri:match("^https?://([%w%.%-]+)(:%d+)?(/.*)$")
    if not host then return nil end
    if not host:match("%.") then return nil end        -- "localhost" no: eso no es un host público
    local hp = host .. (port or "")
    hp = M.dedup_port(hp)                              -- nunca /cdn/host:80:80/...
    return "/cdn/" .. hp .. rest
end

local function rebase_attrs(line, origin)
    line = line:gsub('(URI=")([^"]+)(")', function(pre, uri, post)
        local abs = M.to_cdn_path(uri) or M.absolutize(uri, origin)
        if abs then return pre .. abs .. post end
        return pre .. uri .. post
    end)
    line = line:gsub("(URI=)([^,%s]+)", function(pre, uri)
        if uri:sub(1, 1) == '"' then return pre .. uri end
        local abs = M.to_cdn_path(uri) or M.absolutize(uri, origin)
        if abs then return pre .. abs end
        return pre .. uri
    end)
    return line
end

-- Devuelve new_body, n_uri_rebasadas, n_attrs_rebasados
function M.rebase_body(body, origin)
    if not origin or origin == "" then return body, 0, 0 end
    local out, n_uri, n_attr = {}, 0, 0
    for line in (body .. "\n"):gmatch("(.-)\r?\n") do
        if line ~= "" then
            if line:sub(1, 1) == "#" then
                local before = line
                line = rebase_attrs(line, origin)
                if line ~= before then n_attr = n_attr + 1 end
                out[#out + 1] = line
            else
                local abs = M.to_cdn_path(line) or M.absolutize(line, origin)
                if abs then
                    out[#out + 1] = abs
                    n_uri = n_uri + 1
                else
                    out[#out + 1] = line
                end
            end
        end
    end
    return table.concat(out, "\n") .. "\n", n_uri, n_attr
end

function M.is_master(body) return body:find("#EXT-X-STREAM-INF", 1, true) ~= nil end
function M.has_parts(body)
    return body:find("#EXT-X-PART", 1, true) ~= nil
        or body:find("#EXT-X-PRELOAD-HINT", 1, true) ~= nil
end

-- LL-HLS: si la fuente YA trae partes, declara que soportamos blocking reload.
-- NO inventa partes (eso requeriría empaquetar en tiempo real, imposible en este VPS).
-- Devuelve body, changed
function M.inject_server_control(body)
    if not M.has_parts(body) then return body, false end
    if body:find("#EXT-X-SERVER-CONTROL", 1, true) then return body, false end
    local pt = body:match("#EXT%-X%-PART%-INF:PART%-TARGET=([%d%.]+)")
    local hold = 3.0 * (tonumber(pt) or 1.0)          -- recomendación RFC 8216 §4.4.3.8 (>= 3x PART-TARGET)
    local sc = string.format(
        "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,CAN-SKIP-UNTIL=%.3f,PART-HOLD-BACK=%.3f",
        hold * 6.0, hold)
    local out, n = body:gsub("(#EXTM3U[^\n]*\n)", "%1" .. sc .. "\n", 1)
    if n == 0 then return body, false end
    return out, true
end

-- Inyecta el hint de presentación (tag de vendor INERTE, RFC 8216 §6.3.1).
-- NO cambia RESOLUTION ni CODECS: no miente al decoder.
function M.inject_presentation_hint(body, target, fps)
    if body:find("#EXT-X-APE-PRESENTATION-TARGET", 1, true) then return body, false end
    local tag = string.format("#EXT-X-APE-PRESENTATION-TARGET:%s,FRAME-RATE=%d,HONEST=1\n",
        target or "2160p", math.min(tonumber(fps) or 60, 60))
    local out, n = body:gsub("(#EXTM3U[^\n]*\n)", "%1" .. tag, 1)
    if n == 0 then return body, false end
    return out, true
end

return M
