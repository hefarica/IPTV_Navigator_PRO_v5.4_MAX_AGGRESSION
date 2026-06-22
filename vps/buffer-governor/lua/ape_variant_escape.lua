-- ════════════════════════════════════════════════════════════════════════════
-- ape_variant_escape.lua — VARIANT ESCAPE: degradado de master playlist por headroom.
--
-- RESPONSABILIDAD ÚNICA:
--   M.downgrade(master_playlist, headroom) → cuando el "headroom" (margen de buffer /
--   ancho de banda disponible, 0.0..1.0) está BAJO, reescribe el master HLS para que el
--   player ELIJA una variante de MENOR bitrate primero (anti-freeze), SIN inventar nada.
--
-- LO QUE HACE (y SOLO esto):
--   • Parsea los bloques #EXT-X-STREAM-INF + su URI (una variante = par tag/URI).
--   • Los ordena de MENOR a MAYOR BANDWIDTH y, según el headroom, RECORTA por arriba
--     las variantes que no caben en el margen — pero CONSERVA SIEMPRE al menos la más
--     baja (FALLBACK garantizado: jamás deja el master sin variantes).
--   • Reemite el master con las mismas líneas EXACTAS (verbatim) — solo cambia el ORDEN
--     y, si procede, OCULTA las variantes top demasiado pesadas para el headroom actual.
--
-- LO QUE *NUNCA* HACE:
--   • NO falsifica CODECS / RESOLUTION / BANDWIDTH (copia los atributos byte-a-byte).
--   • NO elimina TODAS las variantes (mínimo 1 = la más baja queda como fallback).
--   • NO toca #EXT-X-MEDIA, #EXT-X-I-FRAME-STREAM-INF, headers, ni líneas desconocidas
--     (RFC 8216 §6.3.1: lo desconocido se preserva tal cual, en su sitio).
--   • NO rompe el master: si algo falla en cualquier punto → devuelve el ORIGINAL.
--
-- INVARIANTES NGINX (FREEZELESS / AUTOPISTA):
--   • Esta función se invoca desde body_filter_by_lua sobre el cuerpo del manifest.
--   • NUNCA ngx.exit() — ni aquí ni en header/body filter (lo respeta el caller).
--   • NO modifica proxy_next_upstream / proxy_read_timeout (Lua no toca esas dirs).
--   • TODO va envuelto en pcall: ante CUALQUIER error → passthrough (servir el original).
--   • Es PURA y determinista: misma entrada → misma salida, sin estado global, sin I/O.
--
-- LEGAL: solo reordena/oculta variantes que el proveedor YA sirve. No crea streams,
-- no rota hosts, no añade auth. Es un selector de variante, no un transcodificador.
-- ════════════════════════════════════════════════════════════════════════════

local M = {}

-- ── Sintonización (umbrales de headroom → cuántas variantes top recortar) ────
-- headroom es un escalar 0.0 (sin margen, red ahogada) .. 1.0 (margen pleno).
-- A menor headroom, más agresivo el recorte de las variantes pesadas de arriba.
-- SIEMPRE conservamos como mínimo MIN_KEEP variantes (la(s) más baja(s)).
local MIN_KEEP            = 1      -- fallback inviolable: nunca menos de 1 variante
local HEADROOM_LOW        = 0.35   -- por debajo → degradar (recortar el top)
local HEADROOM_CRITICAL   = 0.15   -- por debajo → quedarnos SOLO con las más bajas
local KEEP_FRACTION_LOW   = 0.60   -- en LOW: conservar el 60% más bajo de variantes
local KEEP_FRACTION_CRIT  = 0.34   -- en CRITICAL: conservar el ~34% más bajo

-- ── Helpers de parseo (defensivos, sin patrones costosos) ────────────────────

-- ¿Esta línea abre una variante? (#EXT-X-STREAM-INF:...)
local function is_stream_inf(line)
  return line:sub(1, 18) == "#EXT-X-STREAM-INF:"
end

-- ¿Es una línea de comentario/tag HLS (empieza por '#') o vacía?
local function is_tag_or_blank(line)
  return line == "" or line:sub(1, 1) == "#"
end

-- Extrae el BANDWIDTH (entero) de una línea #EXT-X-STREAM-INF. nil si no aparece.
-- NO inventamos: si no hay BANDWIDTH legible, la variante se trata como "sin peso"
-- y se conserva con prioridad (ordena al principio) para no perder fallback.
local function parse_bandwidth(stream_inf)
  -- BANDWIDTH es un atributo decimal sin comillas (RFC 8216 §4.3.4.2).
  local bw = stream_inf:match("[,:]BANDWIDTH=(%d+)")
            or stream_inf:match("^#EXT%-X%-STREAM%-INF:BANDWIDTH=(%d+)")
  if not bw then return nil end
  return tonumber(bw)
end

-- ── Núcleo: degradar el master según headroom ────────────────────────────────
-- Devuelve (nuevo_master:string) o (nil) si no procede / no se pudo reescribir;
-- el wrapper público traduce nil → original (passthrough).
local function do_downgrade(master, headroom)
  if type(master) ~= "string" or master == "" then return nil end

  -- Si el headroom es alto, no hay nada que degradar: passthrough explícito.
  local hr = tonumber(headroom)
  if hr == nil then return nil end          -- sin señal fiable → no tocar
  if hr >= HEADROOM_LOW then return nil end  -- margen suficiente → no tocar

  -- ¿Hay variantes? Si el cuerpo no parece un master multivariante, no tocar.
  if not master:find("#EXT-X-STREAM-INF", 1, true) then return nil end

  -- Normalizamos saltos de línea para preservar el estilo de salida (CRLF vs LF).
  local newline = master:find("\r\n", 1, true) and "\r\n" or "\n"

  -- 1) Trocear en líneas conservando el contenido EXACTO de cada una.
  local lines = {}
  do
    -- Separa por \n y limpia un \r final si lo hubiera (lo reponemos al reemitir).
    local n = 0
    for raw in (master .. "\n"):gmatch("(.-)\n") do
      n = n + 1
      lines[n] = (raw:sub(-1) == "\r") and raw:sub(1, -2) or raw
    end
  end

  -- 2) Recorrer y separar: (a) PREÁMBULO/otros tags que NO son variantes, y
  --    (b) VARIANTES (par: línea(s) #EXT-X-STREAM-INF + su URI siguiente).
  --    Todo lo que no sea una variante se preserva tal cual, EN ORDEN.
  local head      = {}   -- líneas previas/intercaladas que no pertenecen a una variante
  local variants  = {}   -- { {bw=N, lines={...}} , ... } cada una con su STREAM-INF + URI
  local i, total  = 1, #lines

  while i <= total do
    local line = lines[i]
    if is_stream_inf(line) then
      -- Una variante = la(s) línea(s) #EXT-X-STREAM-INF + la siguiente línea NO-tag (URI).
      local block = { line }
      local bw    = parse_bandwidth(line)
      local j     = i + 1
      -- Saltar posibles tags intermedios raros antes de la URI (defensivo).
      while j <= total and is_tag_or_blank(lines[j]) do
        block[#block + 1] = lines[j]
        j = j + 1
      end
      if j <= total then
        -- lines[j] es la URI de la variante.
        block[#block + 1] = lines[j]
        j = j + 1
      else
        -- STREAM-INF sin URI (master malformado): no podemos tratarlo como variante
        -- segura → abortamos el degradado y dejamos pasar el original intacto.
        return nil
      end
      variants[#variants + 1] = { bw = bw, lines = block }
      i = j
    else
      head[#head + 1] = line
      i = i + 1
    end
  end

  local nvar = #variants
  if nvar <= 1 then
    -- 0 o 1 variante: no hay nada que degradar y el fallback ya está garantizado.
    return nil
  end

  -- 3) Ordenar variantes por BANDWIDTH ASCENDENTE (las "sin peso" van primero como
  --    fallback prioritario). Orden estable: ante empate, mantener orden original.
  for idx, v in ipairs(variants) do v._ord = idx end
  table.sort(variants, function(a, b)
    local ba = a.bw or -1   -- sin BANDWIDTH legible → peso mínimo (fallback)
    local bb = b.bw or -1
    if ba == bb then return a._ord < b._ord end
    return ba < bb
  end)

  -- 4) Decidir cuántas variantes conservar según el headroom.
  local keep_fraction
  if hr < HEADROOM_CRITICAL then
    keep_fraction = KEEP_FRACTION_CRIT
  else
    keep_fraction = KEEP_FRACTION_LOW
  end

  local keep = math.floor(nvar * keep_fraction + 0.5)
  if keep < MIN_KEEP then keep = MIN_KEEP end   -- fallback inviolable
  if keep > nvar   then keep = nvar end          -- nunca más de las que hay
  -- Conservamos las `keep` variantes MÁS BAJAS (ya ordenadas ascendente).

  -- Si conservamos todas, el degradado solo reordena (low-first) sin ocultar nada.
  -- Aun así reemitimos: poner la más baja primero ayuda al player a arrancar suave.

  -- 5) Reensamblar el master:
  --    • primero el PREÁMBULO/otros tags (verbatim, en orden),
  --    • luego las variantes conservadas (low-first), cada una con su STREAM-INF+URI
  --      copiada BYTE-A-BYTE (no se reescribe BANDWIDTH/CODECS/RESOLUTION).
  local out = {}

  -- Preámbulo: respetar el orden original de las líneas no-variante.
  for _, l in ipairs(head) do
    out[#out + 1] = l
  end

  for vi = 1, keep do
    local v = variants[vi]
    for _, bl in ipairs(v.lines) do
      out[#out + 1] = bl
    end
  end

  -- 6) Reemitir con el mismo estilo de salto de línea detectado.
  local rebuilt = table.concat(out, newline)

  -- Verificación de seguridad final: el resultado debe seguir teniendo cabecera
  -- de master válida y al menos una variante. Si no, passthrough.
  if not rebuilt:find("#EXTM3U", 1, true) then return nil end
  if not rebuilt:find("#EXT-X-STREAM-INF", 1, true) then return nil end

  return rebuilt
end

-- ── API PÚBLICA ──────────────────────────────────────────────────────────────

-- M.downgrade(master_playlist, headroom)
--   master_playlist : string con el cuerpo del master HLS (#EXTM3U ...).
--   headroom        : número 0.0..1.0 (margen de buffer/BW). Bajo → degradar.
--
-- Devuelve SIEMPRE un string:
--   • el master REESCRITO (variantes low-first, top pesadas ocultas) si procede;
--   • el master ORIGINAL si no procede degradar o si algo falla (passthrough).
-- NUNCA lanza: todo el núcleo va en pcall. Apta para body_filter_by_lua.
function M.downgrade(master_playlist, headroom)
  -- Guardas de entrada: si el master no es string usable, devolver lo recibido
  -- (o cadena vacía) sin tocar — la autopista nunca se rompe por una mala entrada.
  if type(master_playlist) ~= "string" then
    return master_playlist or ""
  end

  local ok, result = pcall(do_downgrade, master_playlist, headroom)
  if not ok then
    -- Error en el núcleo → passthrough verbatim (FREEZELESS).
    return master_playlist
  end
  if type(result) ~= "string" or result == "" then
    -- No procede degradar (headroom alto, no es master, ≤1 variante, malformado…)
    -- → devolver el original intacto.
    return master_playlist
  end
  return result
end

-- M.should_downgrade(headroom) → bool
--   Helper barato para que el caller decida si vale la pena invocar downgrade
--   (p.ej. evitar parsear el cuerpo si el headroom es alto). pcall-safe.
function M.should_downgrade(headroom)
  local ok, res = pcall(function()
    local hr = tonumber(headroom)
    return hr ~= nil and hr < HEADROOM_LOW
  end)
  if not ok then return false end
  return res == true
end

return M
