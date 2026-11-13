-- ape_variant_select.lua — pon primero la MEJOR variante real del master playlist.
--
-- ESTADO: STAGED. NO DESPLEGADO. NO CARGADO POR NINGUN location de nginx.
--
-- ┌─ VERIFICACION PENDIENTE (declarada, no fingida) ────────────────────────────┐
-- │ En el host donde se escribio este fichero NO hay interprete Lua, asi que    │
-- │ `luac -p` NO se ha ejecutado. Antes de desplegar:                           │
-- │   1. luac -p ape_variant_select.lua        (debe salir 0)                   │
-- │   2. nginx -t                              (despues de cablear el location) │
-- │   3. desplegar SOLO a un vhost/canal de canary, nunca a produccion entera   │
-- │   4. comparar el master servido antes/despues con `curl` y diff            │
-- │   5. rollback: quitar el include y `nginx -s reload`                        │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- La logica esta probada en su implementacion de referencia Node:
--   tools/vps/variant_select.js
--   tools/quality/test_variant_select.js   -> 37/37 PASS, con control negativo
--     (al ordenar por bitrate el test baja a 34/37 y falla justo en
--      "el 720p de 9 Mbps NO sube al primer puesto")
--
-- QUE HACE: reordena los bloques #EXT-X-STREAM-INF + URI para que quede primero el de
-- mayor calidad REAL. El reproductor si consume esto, porque un master es estandar.
--
-- QUE NO HACE: no elimina variantes, no reescribe BANDWIDTH/RESOLUTION/CODECS, no toca
-- las URLs. Ordenar por bitrate pondria un 720p de 9 Mbps por delante de un 1080p de
-- 5 Mbps: eso es DEGRADAR. La resolucion manda.

local _M = {}

local CODEC_RANK = {
  { pattern = '^dvh[1e]%.', rank = 60 },   -- Dolby Vision
  { pattern = '^vvc1?%.',   rank = 55 },   -- VVC
  { pattern = '^hvc1%.',    rank = 50 },   -- HEVC
  { pattern = '^hev1%.',    rank = 50 },
  { pattern = '^av01%.',    rank = 40 },   -- AV1
  { pattern = '^avc1%.',    rank = 30 },   -- H.264
  { pattern = '^avc3%.',    rank = 30 },
  { pattern = '^vp0?9%.',   rank = 20 },
}

local function codec_rank(codecs)
  if not codecs or codecs == '' then return 0 end
  local best = 0
  for parte in string.gmatch(codecs, '[^,]+') do
    local c = parte:gsub('^%s+', ''):gsub('%s+$', '')
    for _, e in ipairs(CODEC_RANK) do
      if c:find(e.pattern) and e.rank > best then best = e.rank end
    end
  end
  return best
end

-- atributo="valor" o atributo=valor dentro de la linea STREAM-INF
local function attr(line, name)
  local pat = name .. '=("?)([^,"]*)"?'
  local _, _, _, v = line:find(pat)
  return v
end

local function area(resolution)
  if not resolution then return 0 end
  local w, h = resolution:match('^(%d+)[xX](%d+)$')
  if not w then return 0 end
  return tonumber(w) * tonumber(h)
end

local function score(inf)
  local res = attr(inf, 'RESOLUTION')
  local cdc = attr(inf, 'CODECS')
  local bw  = tonumber(attr(inf, 'BANDWIDTH') or '0') or 0
  return {
    area = area(res),
    codec = codec_rank(cdc),
    bandwidth = bw,
    resolution = res,
    codecs = cdc,
  }
end

local function mejor_que(a, b)
  if a.area ~= b.area then return a.area > b.area end
  if a.codec ~= b.codec then return a.codec > b.codec end
  return a.bandwidth > b.bandwidth
end

-- Devuelve body_out, changed, reason
-- NUNCA lanza: ante cualquier duda devuelve el body original (passthrough).
function _M.reorder(body)
  if type(body) ~= 'string' or #body == 0 then return body, false, 'empty_body' end
  if not body:find('#EXTM3U') then return body, false, 'no_extm3u' end
  if not body:find('#EXT%-X%-STREAM%-INF:') then return body, false, 'no_stream_inf' end
  -- master mezclado con segmentos: no se toca
  if body:find('#EXTINF:') then return body, false, 'mixed_master_and_media' end

  local eol = body:find('\r\n') and '\r\n' or '\n'
  local lines = {}
  for l in (body .. '\n'):gmatch('([^\n]*)\n') do lines[#lines + 1] = l end
  -- quitar la ultima vacia que anadio gmatch
  if #lines > 0 and lines[#lines] == '' then lines[#lines] = nil end

  local preambulo, bloques = {}, {}
  local i = 1
  while i <= #lines and not lines[i]:find('^#EXT%-X%-STREAM%-INF:') do
    preambulo[#preambulo + 1] = lines[i]
    i = i + 1
  end

  while i <= #lines do
    if lines[i]:find('^#EXT%-X%-STREAM%-INF:') then
      local raw = { lines[i] }
      local inf = lines[i]
      i = i + 1
      while i <= #lines do
        raw[#raw + 1] = lines[i]
        local l = lines[i]
        i = i + 1
        if l:gsub('%s+', '') ~= '' and not l:find('^#') then break end
      end
      bloques[#bloques + 1] = { raw = raw, sc = score(inf) }
    else
      -- material suelto: se conserva al final
      bloques[#bloques + 1] = { raw = { lines[i] }, suelto = true }
      i = i + 1
    end
  end

  local reales = {}
  for _, b in ipairs(bloques) do if not b.suelto then reales[#reales + 1] = b end end
  if #reales < 2 then return body, false, 'less_than_two_variants' end

  table.sort(reales, function(a, b) return mejor_que(a.sc, b.sc) end)

  local out = {}
  for _, l in ipairs(preambulo) do out[#out + 1] = l end
  for _, b in ipairs(reales) do
    for _, l in ipairs(b.raw) do out[#out + 1] = l end
  end
  for _, b in ipairs(bloques) do
    if b.suelto then for _, l in ipairs(b.raw) do out[#out + 1] = l end end
  end

  local texto = table.concat(out, eol)
  if texto == body then return body, false, 'already_ordered' end
  return texto, true, 'reordered'
end

-- Handler listo para body_filter_by_lua_file. SOLO lo activa quien cablee el include.
-- Autopista: si algo falla, se deja pasar el body original sin tocar ngx.exit.
function _M.body_filter()
  local ctx = ngx.ctx
  local chunk, eof = ngx.arg[1], ngx.arg[2]
  ctx.ape_vs = ctx.ape_vs or { buf = {} }
  if chunk and #chunk > 0 then ctx.ape_vs.buf[#ctx.ape_vs.buf + 1] = chunk end
  if not eof then
    ngx.arg[1] = nil
    return
  end
  local body = table.concat(ctx.ape_vs.buf)
  ctx.ape_vs = nil
  local ok, out = pcall(_M.reorder, body)
  if ok and out then
    ngx.arg[1] = out
    ngx.log(ngx.INFO, 'ape_variant_select: aplicado')
  else
    ngx.arg[1] = body   -- passthrough: nunca romper la reproduccion
    ngx.log(ngx.WARN, 'ape_variant_select: passthrough por error')
  end
end

return _M
