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
    if not uri or uri == "" then return nil end
    if uri:match("^%a[%w+.-]*://") then return nil end
    if uri:match("^//") then return nil end
    if uri:match("^data:") or uri:match("^blob:") then return nil end
    if uri:sub(1, 1) == "/" then return origin .. uri end
    return origin .. "/" .. uri
end

local function rebase_attrs(line, origin)
    line = line:gsub('(URI=")([^"]+)(")', function(pre, uri, post)
        local abs = M.absolutize(uri, origin)
        if abs then return pre .. abs .. post end
        return pre .. uri .. post
    end)
    line = line:gsub("(URI=)([^,%s]+)", function(pre, uri)
        if uri:sub(1, 1) == '"' then return pre .. uri end
        local abs = M.absolutize(uri, origin)
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
                local abs = M.absolutize(line, origin)
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
