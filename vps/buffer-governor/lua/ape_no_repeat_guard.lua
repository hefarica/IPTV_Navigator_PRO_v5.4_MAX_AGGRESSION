-- ════════════════════════════════════════════════════════════════════════════
-- ape_no_repeat_guard.lua — el GUARD ANTI-REPETICIÓN del Buffer Governor.
--
-- REGLA MADRE (no negociable):
--   «BUFFER BAJO NO SE RESUELVE REPITIENDO VIDEO VIEJO.»
--   Jerarquía: continuidad > segmento fresco > buffer>50% > calidad > procesamiento.
--
-- Este módulo se invoca DESDE el body_filter del shield-location.conf existente,
-- envuelto por el wrapper ape_shield_body_filter.lua:
--
--       require("ape_no_repeat_guard").intercept_cached_response()
--
-- RESPONSABILIDAD de M.intercept_cached_response():
--   1. Mira la RESPUESTA que el edge está a punto de entregar (manifest .m3u8 o, en
--      su defecto, el segmento .ts/.m4s vía la cabecera ya parseada en ngx.ctx).
--   2. Consulta el LEDGER no-repeat — primero el rápido `ngx.shared ape_ledger`
--      (sub-µs, sin red), y como AUTORIDAD el NoRepeatLedger en Rust (:8090) cuando
--      hace falta confirmar regresión de media_sequence / URI / hash / PDT.
--   3. Si detecta REPETICIÓN (la respuesta cacheada/stale REGRESA a algo ya servido):
--        · NO entrega el viejo,
--        · pide LIVE-EDGE (marca ngx.ctx para que el wrapper haga resync/HOLD del
--          manifest hacia el borde vivo vía /live-edge/probe del Governor),
--        · si no hay fresco todavía → HOLD (deja salir el manifest tal cual pero SIN
--          re-anclar la secuencia vieja; nunca reproduce bytes regresivos).
--   4. Bloquea duplicados ANOTÁNDOLOS en el ledger para que el siguiente tick los vea.
--
-- INVARIANTES NGINX (cardinal — autopista FREEZELESS):
--   · NUNCA ngx.exit()/ngx.redirect() en body_filter ni header_filter. Aquí jamás
--     se aborta la respuesta: a lo sumo se NEUTRALIZA un chunk regresivo del manifest
--     (se reescribe a vacío) y se señaliza al wrapper por ngx.ctx. El segmento de
--     video NUNCA se trunca (eso sí sería un freeze).
--   · NO se tocan proxy_next_upstream / proxy_read_timeout / ninguna directiva de
--     upstream desde Lua. Este guard solo LEE estado y MARCA intención en ngx.ctx.
--   · TODO va en pcall → si CUALQUIER cosa falla, PASSTHROUGH: se sirve el original
--     verbatim, byte a byte, sin tocar (SHIELDED intacto). Un guard que duda, deja pasar.
--
-- LEGALIDAD: solo lee/anota metadata de secuencia. No reescribe URLs internas de
-- canal (SHIELDED), no emite headers tóxicos, no abre circuit breaker.
-- ════════════════════════════════════════════════════════════════════════════

local M = {}

-- ── Dependencias suaves (todas opcionales; su ausencia degrada a passthrough) ──
local cjson_ok, cjson = pcall(require, "cjson.safe")
if not cjson_ok then cjson = nil end

-- ── Configuración (alineada con buffer_governor.conf y main.rs :8090) ─────────
local LEDGER_DICT_NAME   = "ape_ledger"               -- lua_shared_dict ape_ledger 10m
local GOVERNOR_HOST      = "127.0.0.1"
local GOVERNOR_PORT      = 8090                        -- NUNCA :8084 (motor vivo) ni :8091 (control http)
local PROBE_PATH         = "/live-edge/probe"          -- POST → LiveEdgeResult
local LEDGER_TTL_S       = 90                          -- una entry de secuencia vive ~ventana DVR corta
local CONNECT_TIMEOUT_MS = 60                          -- sub-ms de intención; el piso ngx es 1ms
local RW_TIMEOUT_MS      = 80                          -- presupuesto total al Governor; si excede → passthrough
local MAX_SCAN_BYTES     = 262144                      -- solo escaneamos manifests pequeños (256 KiB techo)

-- Razones de bloqueo — ESPEJO EXACTO de BlockReason (lib.rs, snake_case serde).
local BLOCK = {
  MEDIA_SEQ_REGRESSION = "media_sequence_regression",
  URI_ALREADY_SERVED   = "uri_already_served",
  HASH_ALREADY_SERVED  = "hash_already_served",
  PDT_REGRESSION       = "program_date_time_regression",
  STALE_REPLACING_FUT  = "stale_replacing_future",
}

-- ════════════════════════════════════════════════════════════════════════════
--  Helpers internos — TODOS tolerantes a nil; ninguno puede lanzar hacia afuera.
-- ════════════════════════════════════════════════════════════════════════════

-- Acceso seguro al shared dict del ledger (nil si la zona no está declarada).
local function ledger_dict()
  return ngx.shared and ngx.shared[LEDGER_DICT_NAME] or nil
end

-- ¿Esta respuesta es un manifest HLS? (solo los manifests llevan media_sequence
-- regresiva; un .ts/.m4s nunca se trunca aquí — eso sería freeze).
local function is_manifest_ctx()
  local uri = ngx.var and ngx.var.uri or ""
  if type(uri) == "string" and (uri:find("%.m3u8$") or uri:find("%.m3u%f[%z]")) then
    return true
  end
  -- fallback por content-type ya fijado en header_filter (si el wrapper lo dejó en ctx)
  local ct = ngx.ctx and ngx.ctx.bg_content_type
  if type(ct) == "string" and ct:find("mpegurl", 1, true) then
    return true
  end
  return false
end

-- ¿El edge está sirviendo desde caché y/o stale? (X-Cache-Status lo pone proxy_cache).
-- Una repetición SOLO puede venir de un HIT/STALE; un MISS fresco no regresa.
local function cache_status()
  local s = ngx.ctx and ngx.ctx.bg_cache_status
  if not s and ngx.var then s = ngx.var.upstream_cache_status end
  return type(s) == "string" and s:upper() or "UNKNOWN"
end

-- Clave de sesión por canal/variante (espeja LedgerKey.as_string del Rust:
-- session|channel|stream|variant|device). Tomamos lo disponible en ngx.ctx/var;
-- los huecos van como "-" para mantener una clave estable y comparable.
local function ledger_key()
  local c = ngx.ctx or {}
  local function pick(a, b) return (a ~= nil and a ~= "" and a) or b or "-" end
  local session = pick(c.bg_session_id,  ngx.var and ngx.var.cookie_sid)
  local channel = pick(c.bg_channel_id,  ngx.var and ngx.var.arg_ch)
  local stream  = pick(c.bg_stream_id,   ngx.var and ngx.var.arg_stream)
  local variant = pick(c.bg_variant_id,  ngx.var and ngx.var.arg_v)
  local device  = pick(c.bg_device_id,   ngx.var and ngx.var.http_x_device_id)
  return table.concat({ session, channel, stream, variant, device }, "|")
end

-- Extrae la mayor media_sequence + último URI de un cuerpo de manifest.
-- Solo lee EXT-X-MEDIA-SEQUENCE + cuenta segmentos; barato y O(n) acotado.
local function parse_manifest_head(body)
  if type(body) ~= "string" or #body == 0 or #body > MAX_SCAN_BYTES then
    return nil
  end
  local base_seq = tonumber(body:match("#EXT%-X%-MEDIA%-SEQUENCE:%s*(%d+)"))
  if not base_seq then return nil end
  -- cuenta URIs de segmento (líneas no-comentario no-vacías) para derivar el highest seq
  local seg_count = 0
  local last_uri  = nil
  for line in body:gmatch("[^\r\n]+") do
    local first = line:byte(1)
    if first and first ~= 35 then            -- 35 = '#'
      local trimmed = line:match("^%s*(.-)%s*$")
      if trimmed ~= nil and trimmed ~= "" then
        seg_count = seg_count + 1
        last_uri  = trimmed
      end
    end
  end
  if seg_count == 0 then return nil end
  local highest = base_seq + (seg_count - 1)
  local pdt = body:match("#EXT%-X%-PROGRAM%-DATE%-TIME:%s*([%w%-%:%.%+TZ]+)")
  return {
    base_seq    = base_seq,
    highest_seq = highest,
    seg_count   = seg_count,
    last_uri    = last_uri,
    pdt         = pdt,
  }
end

-- Lee del shared dict lo último servido para esta clave (nil si no hay nada).
-- Formato compacto "highest_seq|last_uri|pdt" para evitar dep de cjson en el hot-path.
local function ledger_read(key)
  local dict = ledger_dict()
  if not dict or not key then return nil end
  local raw = dict:get(key)
  if type(raw) ~= "string" then return nil end
  local seq, uri, pdt = raw:match("^(%d+)|([^|]*)|(.*)$")
  if not seq then return nil end
  return {
    highest_seq = tonumber(seq),
    last_uri    = (uri ~= "" and uri) or nil,
    pdt         = (pdt ~= "" and pdt) or nil,
  }
end

-- Anota en el shared dict lo recién servido (best-effort; un fallo no rompe nada).
local function ledger_write(key, head)
  local dict = ledger_dict()
  if not dict or not key or not head then return end
  local packed = string.format("%d|%s|%s",
    head.highest_seq or 0, head.last_uri or "", head.pdt or "")
  -- set con TTL; si la zona está llena, dict:set hace LRU eviction solo (no error)
  pcall(function() dict:set(key, packed, LEDGER_TTL_S) end)
end

-- Decide LOCALMENTE si `head` (lo que vamos a servir) REGRESA respecto a `prev`
-- (lo último servido). Devuelve nil si no hay repetición, o un BLOCK.* si la hay.
local function local_regression_reason(prev, head)
  if not prev or not head then return nil end
  -- 1) regresión dura de media_sequence (ir hacia atrás en vivo = repetir)
  if head.highest_seq ~= nil and prev.highest_seq ~= nil
     and head.highest_seq < prev.highest_seq then
    return BLOCK.MEDIA_SEQ_REGRESSION
  end
  -- 2) mismo highest_seq y mismo último URI ya servido (manifest idéntico re-emitido)
  if head.highest_seq ~= nil and prev.highest_seq ~= nil
     and head.highest_seq == prev.highest_seq
     and head.last_uri ~= nil and prev.last_uri ~= nil
     and head.last_uri == prev.last_uri then
    return BLOCK.URI_ALREADY_SERVED
  end
  -- 3) PROGRAM-DATE-TIME que retrocede (reloj de programa hacia atrás)
  if head.pdt ~= nil and prev.pdt ~= nil and head.pdt < prev.pdt then
    return BLOCK.PDT_REGRESSION
  end
  return nil
end

-- Pregunta a la AUTORIDAD (NoRepeatLedger en Rust, :8090) por el live-edge real,
-- con timeout DURO y passthrough-on-timeout. NUNCA en el request path crítico de
-- video: solo para manifests, y bajo pcall. Devuelve {gap_detected, resync_to} o nil.
local function probe_live_edge(manifest_uri, highest_seq)
  if not cjson then return nil end
  local sock = ngx.socket.tcp()
  if not sock then return nil end
  sock:settimeouts(CONNECT_TIMEOUT_MS, RW_TIMEOUT_MS, RW_TIMEOUT_MS)
  local ok = sock:connect(GOVERNOR_HOST, GOVERNOR_PORT)
  if not ok then return nil end

  local payload = cjson.encode({
    manifest_uri          = manifest_uri or "",
    highest_media_sequence = highest_seq,
  })
  if not payload then sock:close(); return nil end

  local req = table.concat({
    "POST ", PROBE_PATH, " HTTP/1.1\r\n",
    "Host: ", GOVERNOR_HOST, "\r\n",
    "Content-Type: application/json\r\n",
    "Connection: keep-alive\r\n",
    "Content-Length: ", tostring(#payload), "\r\n\r\n",
    payload,
  })
  local sent = sock:send(req)
  if not sent then sock:close(); return nil end

  -- status line
  local status_line = sock:receive("*l")
  if not status_line then sock:close(); return nil end
  -- consumir headers hasta la línea en blanco, capturando Content-Length
  local clen = 0
  while true do
    local h = sock:receive("*l")
    if not h or h == "" then break end
    local n = h:match("[Cc]ontent%-[Ll]ength:%s*(%d+)")
    if n then clen = tonumber(n) or 0 end
  end
  local body = (clen > 0) and sock:receive(clen) or nil
  -- devolver al pool en vez de cerrar (loopback barato); fallo → ignorar
  sock:setkeepalive(2000, 8)

  if not body then return nil end
  local good, dec = pcall(cjson.decode, body)
  if not good or type(dec) ~= "table" then return nil end
  return {
    gap_detected = dec.gap_detected == true,
    resync_to    = tonumber(dec.resync_to),
    highest      = tonumber(dec.highest_media_sequence),
  }
end

-- Señaliza al wrapper (ape_shield_body_filter) la intención SIN abortar la respuesta.
-- El wrapper, en su siguiente fase / próximo request, materializa el resync/HOLD.
-- NUNCA hace ngx.exit; solo deja banderas en ngx.ctx.
local function signal_intent(reason, head, edge)
  ngx.ctx = ngx.ctx or {}
  ngx.ctx.bg_no_repeat_block   = reason            -- BlockReason espejo
  ngx.ctx.bg_request_live_edge = true              -- el wrapper debe pedir borde vivo
  ngx.ctx.bg_hold_manifest     = true              -- HOLD: no anclar la secuencia vieja
  if edge and edge.resync_to then
    ngx.ctx.bg_resync_to = edge.resync_to          -- destino de resync si el Governor lo dio
  elseif head and head.highest_seq then
    ngx.ctx.bg_resync_to = head.highest_seq
  end
end

-- NEUTRALIZA un chunk regresivo del MANIFEST (solo manifest, jamás video):
-- reescribe el cuerpo de ESTE chunk a vacío para no entregar la secuencia vieja,
-- preservando el EOF (last) para que el filtro de salida cierre limpio. El player
-- reintenta el manifest y recibe el fresco vía el resync del wrapper. Sin freeze:
-- un manifest vacío momentáneo NO congela; reproducir bytes regresivos SÍ rompería.
local function neutralize_manifest_chunk()
  -- arg[1]=chunk, arg[2]=eof. Vaciamos el chunk pero respetamos el eof.
  local eof = ngx.arg[2]
  ngx.arg[1] = ""
  ngx.arg[2] = eof
end

-- ════════════════════════════════════════════════════════════════════════════
--  API PÚBLICA
-- ════════════════════════════════════════════════════════════════════════════

-- intercept_cached_response — punto de entrada del body_filter.
-- Devuelve true si NEUTRALIZÓ un chunk regresivo (el wrapper debe pedir resync),
-- false si dejó pasar (passthrough). NUNCA lanza: todo el cuerpo va en pcall y
-- ante cualquier duda sirve el original.
function M.intercept_cached_response()
  local ok, neutralized = pcall(M._run_guard)
  if not ok then
    -- FALLO → PASSTHROUGH absoluto: no tocar ngx.arg, servir verbatim.
    return false
  end
  return neutralized == true
end

-- Cuerpo real del guard (siempre llamado bajo pcall por intercept_cached_response).
function M._run_guard()
  -- Solo los MANIFESTS pueden regresar; un segmento de video jamás se toca aquí.
  if not is_manifest_ctx() then
    return false
  end

  -- Una repetición SOLO puede nacer de caché (HIT/STALE); un MISS fresco no regresa.
  local cs = cache_status()
  if cs ~= "HIT" and cs ~= "STALE" and cs ~= "UPDATING" and cs ~= "EXPIRED" then
    return false
  end

  -- Acumular el cuerpo del manifest a través de los chunks del body_filter.
  ngx.ctx = ngx.ctx or {}
  local chunk = ngx.arg[1]
  local eof   = ngx.arg[2]
  if type(chunk) == "string" and #chunk > 0 then
    -- buffer acotado: si excede el techo, abandonamos el análisis (passthrough)
    local buf = ngx.ctx.bg_manifest_buf
    if buf == nil then buf = {} ; ngx.ctx.bg_manifest_buf = buf end
    local total = (ngx.ctx.bg_manifest_len or 0) + #chunk
    if total > MAX_SCAN_BYTES then
      ngx.ctx.bg_manifest_oversize = true
    elseif not ngx.ctx.bg_manifest_oversize then
      buf[#buf + 1] = chunk
      ngx.ctx.bg_manifest_len = total
    end
  end

  -- Solo decidimos al cerrar el cuerpo (eof): necesitamos el manifest completo
  -- para conocer el highest media_sequence real.
  if not eof then
    return false
  end
  if ngx.ctx.bg_manifest_oversize or not ngx.ctx.bg_manifest_buf then
    return false
  end

  local body = table.concat(ngx.ctx.bg_manifest_buf)
  local head = parse_manifest_head(body)
  if not head then
    return false                                   -- sin media_sequence parseable → passthrough
  end

  local key  = ledger_key()
  local prev = ledger_read(key)

  -- 1) Veredicto LOCAL rápido (sub-µs, sin red).
  local reason = local_regression_reason(prev, head)

  -- 2) Confirmación con la AUTORIDAD (Rust) SOLO si hay sospecha o no hay prev local
  --    (arranque en frío / warm-cache tras restart). Timeout duro + passthrough.
  local edge = nil
  if reason ~= nil then
    edge = probe_live_edge(ngx.var and ngx.var.uri or "", head.highest_seq)
    -- si el Governor confirma que NO hay gap y el resync apunta al mismo highest,
    -- puede ser un re-emit benigno del live-edge: degradamos a passthrough.
    if edge and edge.gap_detected == false
       and edge.resync_to ~= nil and edge.resync_to <= (head.highest_seq or 0)
       and reason ~= BLOCK.MEDIA_SEQ_REGRESSION then
      reason = nil
    end
  end

  if reason ~= nil then
    -- REPETICIÓN/regresión confirmada: NO entregar el viejo.
    signal_intent(reason, head, edge)
    neutralize_manifest_chunk()
    -- NO anotamos el manifest viejo como "servido": nunca debe re-anclar la secuencia.
    return true
  end

  -- No hay repetición → anotar lo servido para el próximo tick y dejar pasar.
  ledger_write(key, head)
  return false
end

-- ── Helpers públicos para el wrapper / tests (no tocan el request path) ──────

-- Permite al wrapper consultar el ledger por clave (debug/telemetría).
function M.peek_ledger(key)
  local ok, v = pcall(ledger_read, key or ledger_key())
  if not ok then return nil end
  return v
end

-- Permite resetear una entry (p.ej. tras un cambio de variante deliberado).
function M.forget(key)
  local dict = ledger_dict()
  if dict and key then pcall(function() dict:delete(key) end) end
end

-- Exponer las razones de bloqueo (espejo del Rust) para asserts de test.
M.BLOCK_REASONS = BLOCK

return M
