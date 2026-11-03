-- ═══════════════════════════════════════════════════════════════════════════
-- APE LASTGOOD — caché del ÚLTIMO MANIFIESTO BUENO (metadata, NO vídeo)
-- ═══════════════════════════════════════════════════════════════════════════
-- [t62] BUFFER INFINITO · capa donde es físicamente posible.
--
-- QUÉ ES: si todos los upstream fallan (407/5xx/timeout), el edge sirve el
-- último manifiesto VÁLIDO de esa ruta, con `#EXT-X-APE-STALE:1` y 200, en vez
-- de un 502. El player sigue viendo una lista coherente (y sus segmentos ya
-- cacheados) en lugar de un error.
--
-- QUÉ **NO** ES (y no se puede, por doctrina):
--   · NO proxea vídeo · NO sirve `.ts` · NO inventa 206 · NO promete buffer 40 %.
--   · El buffer real es del player; aquí sólo se gana tiempo de metadata.
--
-- RESTRICCIONES DE ngx.shared: sólo string/number/boolean → el body y el origen
-- van en DOS claves (`lg:` y `lgo:`), nunca en una tabla.
-- Límites: 1 body por clave, TTL corto (default 25 s), tope de bytes por entrada.
-- Sin I/O, sin bloqueo: sólo `get`/`set` del shared dict (O(1)).
-- ═══════════════════════════════════════════════════════════════════════════

local M = {}

M.PREFIX      = "lg:"          -- body
M.PREFIX_ORG  = "lgo:"         -- origen final (para auditar de dónde salió)
M.PREFIX_TS   = "lgt:"         -- epoch de la última escritura
M.STALE_TAG   = "#EXT-X-APE-STALE:1"
M.TTL_DEFAULT = 25             -- segundos (contrato: 20-30 s)
M.TTL_MAX     = 30
M.MAX_BYTES   = 262144         -- 256 KB por entrada (manifiestos; el gateway corta a 4 MiB)

function M.key(host, path)
    return tostring(host or "") .. "|" .. tostring(path or "")
end

-- ¿este resultado merece entrar en la caché como "bueno"?
-- Sólo 200 con forma de manifiesto. **Nunca** un 4xx de auth (407/403/401) y
-- nunca un JSON de error: cachearlos convertiría un fallo en un "bueno" falso.
function M.should_cache(status, body, ctype)
    if status ~= 200 then return false, "status_no_200" end
    if type(body) ~= "string" or body == "" then return false, "body_vacio" end
    if #body > M.MAX_BYTES then return false, "body_demasiado_grande" end
    if not body:find("#EXTM3U", 1, true) then return false, "no_es_manifiesto" end
    if ctype and ctype:lower():find("json", 1, true) then return false, "content_type_json" end
    return true
end

-- Guarda body + origen + epoch. Devuelve ok, motivo.
function M.put(dict, host, path, body, origin, ttl, now)
    if not dict then return false, "sin_shared_dict" end
    local okc, why = M.should_cache(200, body, nil)
    if not okc then return false, why end
    ttl = tonumber(ttl) or M.TTL_DEFAULT
    if ttl < 1 then ttl = 1 end
    if ttl > M.TTL_MAX then ttl = M.TTL_MAX end
    local k = M.key(host, path)
    local ok1 = dict:set(M.PREFIX .. k, body, ttl)
    if not ok1 then return false, "set_fallo" end
    dict:set(M.PREFIX_ORG .. k, tostring(origin or ""), ttl)
    dict:set(M.PREFIX_TS .. k, tostring(tonumber(now) or 0), ttl)
    return true
end

-- Devuelve body, origin, age_segundos (o nil si no hay entrada viva).
function M.get(dict, host, path, now)
    if not dict then return nil end
    local k = M.key(host, path)
    local body = dict:get(M.PREFIX .. k)
    if type(body) ~= "string" or body == "" then return nil end
    local origin = dict:get(M.PREFIX_ORG .. k) or ""
    local ts = tonumber(dict:get(M.PREFIX_TS .. k)) or 0
    local age = 0
    if tonumber(now) and ts > 0 and tonumber(now) >= ts then age = tonumber(now) - ts end
    return body, origin, age
end

-- Inserta el tag de stale UNA sola vez, justo después de la primera línea.
function M.with_stale_tag(body)
    if type(body) ~= "string" or body == "" then return body end
    if body:find(M.STALE_TAG, 1, true) then return body end
    local first, rest = body:match("^(#EXTM3U[^\r\n]*)(.*)$")
    if not first then return M.STALE_TAG .. "\n" .. body end
    return first .. "\n" .. M.STALE_TAG .. rest
end

-- Respuesta de stale lista para el handler: status 200 + marca + cabecera.
function M.serve_stale(dict, host, path, now, extra_headers)
    local body, origin, age = M.get(dict, host, path, now)
    if not body then return nil end
    return {
        status = 200,
        stale = true,
        body = M.with_stale_tag(body),
        origin = origin,
        age = age,
        headers = {
            ["X-APE-Stale"] = "1",
            ["X-APE-Stale-Age"] = tostring(age),
            ["X-APE-Stale-Origin"] = tostring(origin),
            ["Content-Type"] = "application/vnd.apple.mpegurl",
            ["Cache-Control"] = "no-store",
        },
    }
end

return M
