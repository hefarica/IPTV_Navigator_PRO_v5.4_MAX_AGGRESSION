-- ============================================================================
-- ape_segment_pattern_learner.lua
-- ----------------------------------------------------------------------------
-- APRENDIZ DE PATRONES DE NUMERACIÓN DE SEGMENTOS (OpenResty / LuaJIT)
--
-- RESPONSABILIDAD:
--   * Aprende la numeración de segmentos por canal observando los URIs que
--     pasan por el edge: segment_1001.ts → 1002 (+1), +2, +10, secuencias .m4s,
--     y timestamps numéricos largos (epoch / unix-like).
--   * Guarda el patrón aprendido por canal en un diccionario ngx.shared.
--   * NUNCA inventa el siguiente segmento si el patrón es incierto: en ese caso
--     devuelve nil y el llamador debe hacer un live-edge probe contra el origen.
--   * M.infer_next(uri) -> next_uri (string) o nil.
--
-- INVARIANTES NGINX (inviolables — ver CLAUDE.md "VPS NET SHIELD AUTOPISTA"):
--   * NUNCA llamar ngx.exit() en body_filter / header_filter.
--   * NUNCA modificar proxy_next_upstream / proxy_read_timeout desde Lua.
--   * TODO el trabajo va envuelto en pcall: si algo falla → passthrough
--     (devolver nil / no tocar nada → el llamador sirve el original).
--   * Operaciones sobre ngx.shared son sub-µs y no bloqueantes (autopista-safe).
--
-- DOCTRINA: este módulo SOLO OBSERVA y PREDICE metadata de numeración. No
-- reescribe URLs internas de canal (SHIELDED), no frena, no bloquea, no
-- interfiere con la reproducción. Es un acelerador de prefetch, no una barrera.
-- ============================================================================

local M = {}

-- ----------------------------------------------------------------------------
-- Diccionario compartido entre workers. Debe declararse en nginx.conf:
--   lua_shared_dict ape_segpattern 16m;
-- Si no existe, el módulo degrada a "sin memoria" (siempre incierto → nil),
-- nunca lanza error que rompa el request.
-- ----------------------------------------------------------------------------
local SHM_NAME = "ape_segpattern"
local shm = ngx.shared[SHM_NAME]

-- TTL del patrón aprendido (segundos). Un canal inactivo deja expirar su patrón
-- para no predecir sobre numeraciones obsoletas tras un reinicio del origen.
local PATTERN_TTL = 120

-- Nº de observaciones consecutivas coherentes antes de "confiar" en el patrón.
-- Mientras no se alcance, infer_next devuelve nil (incierto → live-edge probe).
local MIN_CONFIDENCE = 2

-- Delta máximo razonable entre segmentos consecutivos. Saltos mayores se
-- consideran discontinuidad (corte / SCTE-35 / reinicio) → se descarta y se
-- vuelve a aprender desde cero, nunca se extrapola un salto enorme.
local MAX_SANE_DELTA = 20

-- Longitud mínima para considerar un número como "timestamp" (epoch-like) y no
-- como índice secuencial corto. p.ej. 1700000000 (10 dígitos) o ms (13).
local TS_MIN_DIGITS = 10

-- ----------------------------------------------------------------------------
-- Utilidades internas (todas puras y baratas).
-- ----------------------------------------------------------------------------

-- Separador de clave en el blob serializado del patrón.
local SEP = "\31" -- US (unit separator), nunca aparece en una URL.

-- Serializa el patrón a un string plano para guardarlo en ngx.shared.
-- Campos: prefix | suffix | width(0=sin zero-pad) | last | delta | conf | kind
local function pack(p)
  return table.concat({
    p.prefix or "",
    p.suffix or "",
    tostring(p.width or 0),
    tostring(p.last or 0),
    tostring(p.delta or 0),
    tostring(p.conf or 0),
    p.kind or "",
  }, SEP)
end

-- Deserializa el string del patrón. Devuelve nil si está corrupto.
local function unpack_pattern(blob)
  if type(blob) ~= "string" or blob == "" then
    return nil
  end
  local parts = {}
  local i = 1
  for piece in (blob .. SEP):gmatch("(.-)" .. SEP) do
    parts[i] = piece
    i = i + 1
  end
  if i - 1 < 7 then
    return nil
  end
  return {
    prefix = parts[1],
    suffix = parts[2],
    width  = tonumber(parts[3]) or 0,
    last   = tonumber(parts[4]) or 0,
    delta  = tonumber(parts[5]) or 0,
    conf   = tonumber(parts[6]) or 0,
    kind   = parts[7],
  }
end

-- Descompone un URI de segmento en {prefix, numero, width, suffix, kind}.
--   prefix  = todo lo anterior al último grupo de dígitos
--   numero  = el último grupo de dígitos (el índice / timestamp que cambia)
--   width   = nº de dígitos si venía con zero-padding (ej. 00042 → width 5),
--             0 si no parece zero-padded
--   suffix  = todo lo posterior (extensión .ts/.m4s + query string)
--   kind    = "ts" | "m4s" | "seq" | nil (no es segmento reconocible)
--
-- Estrategia: localizar el ÚLTIMO grupo de dígitos del path (antes del query),
-- que es el que normalmente porta la numeración del segmento.
local function decompose(uri)
  if type(uri) ~= "string" or #uri == 0 then
    return nil
  end

  -- Separar query string para no confundir números de la query con el índice.
  local path, query = uri:match("^([^?]*)(%??.*)$")
  if not path then
    path = uri
    query = ""
  end

  -- Determinar tipo por extensión del path.
  local kind
  local lower = path:lower()
  if lower:match("%.m4s$") then
    kind = "m4s"
  elseif lower:match("%.ts$") then
    kind = "ts"
  elseif lower:match("%.mp4$") then
    kind = "m4s"
  else
    -- Sin extensión de segmento reconocible → no aprendemos numeración.
    return nil
  end

  -- Buscar el ÚLTIMO grupo de dígitos dentro del path.
  -- Recorremos con find acumulando la última coincidencia.
  local lastStart, lastEnd
  local searchFrom = 1
  while true do
    local s, e = path:find("%d+", searchFrom)
    if not s then
      break
    end
    lastStart, lastEnd = s, e
    searchFrom = e + 1
  end

  if not lastStart then
    -- No hay dígitos en el path → numeración no inferible.
    return nil
  end

  local numStr = path:sub(lastStart, lastEnd)
  local prefix = path:sub(1, lastStart - 1)
  local suffix = path:sub(lastEnd + 1) .. (query or "")

  local num = tonumber(numStr)
  if not num then
    return nil
  end

  -- Detectar zero-padding: si empieza por '0' y tiene >1 dígito, conservar width.
  local width = 0
  if #numStr > 1 and numStr:sub(1, 1) == "0" then
    width = #numStr
  end

  -- Refinar kind si el número es claramente un timestamp largo.
  if #numStr >= TS_MIN_DIGITS then
    kind = "ts_" .. kind -- p.ej. "ts_m4s" / "ts_ts": numeración por timestamp
  else
    kind = "seq_" .. kind -- numeración secuencial corta
  end

  return {
    prefix = prefix,
    suffix = suffix,
    num    = num,
    width  = width,
    kind   = kind,
  }
end

-- Reconstruye el número con el zero-padding aprendido (si lo había).
local function fmt_num(num, width)
  if width and width > 0 then
    local s = tostring(num)
    if #s < width then
      return string.rep("0", width - s) .. s
    end
    return s
  end
  return tostring(num)
end

-- Calcula la clave de canal a partir del prefix del segmento. El prefix
-- (host+path sin el índice) identifica de forma estable la "serie" del canal.
local function channel_key(prefix, suffix_ext)
  -- suffix_ext distingue series .ts vs .m4s bajo el mismo prefix.
  return prefix .. SEP .. (suffix_ext or "")
end

-- Extrae solo la extensión base del suffix (sin query) para la clave.
local function base_ext(suffix)
  local p = suffix:match("^([^?]*)")
  return p or suffix
end

-- ----------------------------------------------------------------------------
-- API PÚBLICA
-- ----------------------------------------------------------------------------

-- M.observe(uri)
--   Registra una observación de un segmento real que pasó por el edge.
--   Actualiza (o crea) el patrón del canal en ngx.shared. Aumenta la confianza
--   si el delta es coherente; la resetea si detecta discontinuidad.
--   Devuelve true si se procesó, false si el URI no era un segmento o si hubo
--   cualquier fallo (passthrough silencioso).
--
--   Pensado para llamarse desde log_by_lua / un punto NO bloqueante. NUNCA
--   llama ngx.exit ni toca el flujo del request.
function M.observe(uri)
  if not shm then
    return false
  end

  local ok, processed = pcall(function()
    local d = decompose(uri)
    if not d then
      return false
    end

    local key = channel_key(d.prefix, base_ext(d.suffix))
    local prev = unpack_pattern(shm:get(key))

    if not prev then
      -- Primera observación de esta serie: guardamos base, confianza 0.
      shm:set(key, pack({
        prefix = d.prefix,
        suffix = d.suffix,
        width  = d.width,
        last   = d.num,
        delta  = 0,
        conf   = 0,
        kind   = d.kind,
      }), PATTERN_TTL)
      return true
    end

    local delta = d.num - prev.last

    -- Reordenamiento / repetición: el player o un retry pidió un segmento ya
    -- visto o anterior. No es discontinuidad; refrescamos TTL sin tocar conf.
    if delta <= 0 then
      prev.suffix = d.suffix
      prev.width  = d.width
      shm:set(key, pack(prev), PATTERN_TTL)
      return true
    end

    -- Discontinuidad (salto enorme): reiniciar aprendizaje desde este punto.
    if delta > MAX_SANE_DELTA then
      shm:set(key, pack({
        prefix = d.prefix,
        suffix = d.suffix,
        width  = d.width,
        last   = d.num,
        delta  = 0,
        conf   = 0,
        kind   = d.kind,
      }), PATTERN_TTL)
      return true
    end

    -- Delta coherente.
    local conf
    if prev.delta == delta and prev.delta ~= 0 then
      -- Mismo delta que antes → sube confianza (cap suave).
      conf = math.min((prev.conf or 0) + 1, 1000)
    else
      -- Cambió el delta (+1 → +2, etc.): patrón aún no estable → baja confianza.
      conf = 1
    end

    shm:set(key, pack({
      prefix = d.prefix,
      suffix = d.suffix,
      width  = d.width,
      last   = d.num,
      delta  = delta,
      conf   = conf,
      kind   = d.kind,
    }), PATTERN_TTL)

    return true
  end)

  if not ok then
    -- pcall falló → passthrough total, no propagamos el error.
    return false
  end
  return processed and true or false
end

-- M.infer_next(uri) -> next_uri (string) o nil
--   Dada la URI de un segmento conocido, devuelve la URI PREDICHA del siguiente
--   segmento SOLO si el patrón del canal es CIERTO (confianza suficiente y delta
--   estable). Si el patrón es incierto, devuelve nil → el llamador DEBE hacer un
--   live-edge probe contra el origen (NO inventamos segmentos).
--
--   Esta función también registra la observación de `uri` (aprende mientras
--   predice), de forma que el primer paso por un canal nutre el patrón.
function M.infer_next(uri)
  if not shm then
    return nil
  end

  local ok, result = pcall(function()
    -- Aprender de esta URI primero (mantiene el patrón fresco y avanza `last`).
    M.observe(uri)

    local d = decompose(uri)
    if not d then
      return nil
    end

    local key = channel_key(d.prefix, base_ext(d.suffix))
    local p = unpack_pattern(shm:get(key))
    if not p then
      return nil
    end

    -- Patrón incierto: sin confianza suficiente o sin delta estable → nil.
    -- (No predecir = exigir live-edge probe; nunca inventar.)
    if (p.conf or 0) < MIN_CONFIDENCE then
      return nil
    end
    if not p.delta or p.delta <= 0 or p.delta > MAX_SANE_DELTA then
      return nil
    end

    -- Predicción: siguiente índice = número de ESTA uri + delta aprendido.
    -- Usamos d.num (el de la uri pedida) en vez de p.last para ser robustos
    -- ante observaciones concurrentes de otros workers.
    local nextNum = d.num + p.delta
    if nextNum <= 0 then
      return nil
    end

    -- Reconstruir manteniendo prefix/suffix/zero-padding de ESTA uri.
    local nextUri = d.prefix .. fmt_num(nextNum, d.width) .. d.suffix
    if nextUri == uri then
      -- Defensa: nunca devolver la misma uri como "siguiente".
      return nil
    end
    return nextUri
  end)

  if not ok then
    -- Cualquier fallo → incierto → nil → live-edge probe / passthrough.
    return nil
  end
  return result
end

-- M.get_pattern(uri) -> tabla del patrón o nil
--   Introspección/diagnóstico. Devuelve una copia del patrón aprendido para la
--   serie a la que pertenece `uri`. No muta nada. Útil para /watchdog-status.
function M.get_pattern(uri)
  if not shm then
    return nil
  end
  local ok, res = pcall(function()
    local d = decompose(uri)
    if not d then
      return nil
    end
    local key = channel_key(d.prefix, base_ext(d.suffix))
    local p = unpack_pattern(shm:get(key))
    if not p then
      return nil
    end
    return {
      prefix     = p.prefix,
      suffix     = p.suffix,
      width      = p.width,
      last       = p.last,
      delta      = p.delta,
      confidence = p.conf,
      kind       = p.kind,
      certain    = ((p.conf or 0) >= MIN_CONFIDENCE)
                   and (p.delta and p.delta > 0 and p.delta <= MAX_SANE_DELTA),
    }
  end)
  if not ok then
    return nil
  end
  return res
end

-- M.reset(uri)
--   Olvida el patrón de la serie a la que pertenece `uri` (p.ej. tras detectar
--   un corte deliberado). Passthrough-safe. Devuelve true si se borró algo.
function M.reset(uri)
  if not shm then
    return false
  end
  local ok, removed = pcall(function()
    local d = decompose(uri)
    if not d then
      return false
    end
    local key = channel_key(d.prefix, base_ext(d.suffix))
    shm:delete(key)
    return true
  end)
  if not ok then
    return false
  end
  return removed and true or false
end

return M
