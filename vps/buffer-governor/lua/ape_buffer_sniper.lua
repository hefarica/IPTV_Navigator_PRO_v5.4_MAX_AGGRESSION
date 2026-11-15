-- ═══════════════════════════════════════════════════════════════════════════
--  ape_buffer_sniper.lua — Sniper de buffer para nginx/OpenResty (LuaJIT)
-- ═══════════════════════════════════════════════════════════════════════════
--  RESPONSABILIDAD:
--    Intercepta el par request/response del shield y entrega telemetría de
--    buffer al APE Buffer Governor (Rust, loopback :8090). NO decide nada,
--    NO frena, NO modifica el video: solo MIDE y REPORTA.
--
--    · M.intercept_request()  → fase rewrite_by_lua del wrapper del shield.
--        Extrae channel_id / stream_id / variant_id / segment_uri de la URI
--        + querystring, y marca el instante de inicio (ngx.now) en ngx.ctx.
--    · M.intercept_response() → fase log_by_lua del wrapper del shield.
--        Calcula la latencia (ngx.now - start) y dispara un POST diferido a
--        Rust mediante ngx.timer.at (background, NUNCA en el ciclo de request).
--
--  INVARIANTES nginx (INVIOLABLES — VPS NET SHIELD AUTOPISTA):
--    · NUNCA ngx.exit() en body_filter/header_filter/log (este módulo jamás
--      llama a ngx.exit en ninguna fase — solo observa).
--    · NO se toca proxy_next_upstream ni proxy_read_timeout desde Lua.
--    · TODO va envuelto en pcall: si algo falla → passthrough silencioso
--      (se sirve el original, el stream NUNCA se interrumpe).
--    · El reporte a Rust es fire-and-forget: si :8090 está caído o lento,
--      el player no se entera (timer en background, sock con timeout corto).
--
--  CONTRATO con Rust (BufferReport en lib.rs):
--    Campos OBLIGATORIOS: channel_id, buffer_s, capacity_s,
--                         throughput_bps, variant_bps.
--    Campos OPCIONALES  : current_variant, rebuffer_count, dropped_frames,
--                         live_edge_delta_ms, playback_state.
--    El sniper SOLO conoce de forma fiable channel_id/variant + el throughput
--    REAL medido del response; buffer_s/capacity_s del lado-player no son
--    observables aquí, así que se envían como 0.0 (Rust los tolera) salvo que
--    el player los empuje por querystring/headers.
-- ═══════════════════════════════════════════════════════════════════════════

local M = {}

-- ── Configuración (loopback only, alineada con buffer_governor.conf) ─────────
local GOVERNOR_HOST   = "127.0.0.1"
local GOVERNOR_PORT   = 8090
local GOVERNOR_PATH   = "/buffer/report"
-- Timeouts AGRESIVAMENTE cortos: el reporte NUNCA debe colgar un worker.
local CONNECT_TIMEOUT = 200    -- ms
local SEND_TIMEOUT    = 200    -- ms
local READ_TIMEOUT    = 200    -- ms
-- Solo reportamos peticiones que parezcan de streaming (manifest/segmento).
-- Extensiones que disparan telemetría de buffer.
local STREAMING_EXT = {
    ["m3u8"] = true,  -- manifest HLS
    ["ts"]   = true,  -- segmento MPEG-TS
    ["m4s"]  = true,  -- segmento fMP4/CMAF
    ["mp4"]  = true,  -- init/segmento fMP4
    ["aac"]  = true,  -- segmento audio
    ["vtt"]  = true,  -- subtítulos (incluidos por completitud)
}

-- Referencias locales (perf LuaJIT: evita lookups globales repetidos).
local ngx          = ngx
local pcall        = pcall
local tonumber     = tonumber
local tostring     = tostring
local str_match    = string.match
local str_lower    = string.lower

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Deriva la extensión (en minúsculas, sin querystring) de una URI/path.
local function path_ext(path)
    if not path then return nil end
    local ext = str_match(path, "%.([%a%d]+)$")
    if ext then return str_lower(ext) end
    return nil
end

-- Escapa un valor para meterlo seguro en un cuerpo JSON construido a mano.
-- (Evitamos cjson como dependencia dura; el payload es pequeño y conocido.)
local function json_str(v)
    if v == nil then return "null" end
    v = tostring(v)
    -- Escapa backslash, comillas y control chars básicos.
    v = v:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
    return '"' .. v .. '"'
end

-- Número seguro: devuelve un literal numérico válido o el fallback dado.
local function json_num(v, fallback)
    local n = tonumber(v)
    if n == nil then return tostring(fallback or 0) end
    return tostring(n)
end

-- Extrae los identificadores de la URI del shield + querystring.
-- Formato shield típico: /shield/{TOKEN}/{HOST}/{PATH...}?ch=&sid=&vid=
-- Los ids pueden venir por querystring (preferido) o inferirse del path.
local function extract_ids()
    local uri  = ngx.var.uri or ""
    local args = ngx.req.get_uri_args() or {}

    -- channel_id: ?ch= / ?channel= / ?channel_id=  (fallback: segmento del path)
    local channel_id = args.ch or args.channel or args.channel_id
    -- stream_id: ?sid= / ?stream= / ?stream_id=
    local stream_id  = args.sid or args.stream or args.stream_id
    -- variant_id: ?vid= / ?variant= / ?variant_id=
    local variant_id = args.vid or args.variant or args.variant_id

    -- Si no vino channel_id, intenta el último componente "nombrado" del path
    -- (ej. .../live/{channel}/index.m3u8). Es heurístico y SOLO informativo.
    if not channel_id then
        channel_id = str_match(uri, "/live/([^/]+)/") or str_match(uri, "/([^/]+)/[^/]+%.m3u8$")
    end

    -- segment_uri = el path crudo solicitado (sin querystring).
    local segment_uri = uri

    return {
        channel_id  = channel_id  or "unknown",
        stream_id   = stream_id   or "",
        variant_id  = variant_id  or "",
        segment_uri = segment_uri,
        ext         = path_ext(uri),
    }
end

-- ── Tarea diferida: POST a Rust (background, fuera del ciclo de request) ──────
-- Firma de ngx.timer.at: function(premature, payload, ...)
local function report_timer(premature, body)
    if premature then return end  -- nginx se está apagando: no reportamos.

    -- cosocket SOLO disponible en contexto de timer/phase no-filter → aquí OK.
    local sock = ngx.socket.tcp()
    sock:settimeouts(CONNECT_TIMEOUT, SEND_TIMEOUT, READ_TIMEOUT)

    local ok, err = sock:connect(GOVERNOR_HOST, GOVERNOR_PORT)
    if not ok then
        -- Governor caído/ocupado: fire-and-forget, el player ni se entera.
        ngx.log(ngx.INFO, "ape_buffer_sniper: connect ", GOVERNOR_HOST, ":",
                GOVERNOR_PORT, " failed: ", err or "?")
        return
    end

    -- Request HTTP/1.1 mínima, Connection: close (no contaminamos el pool).
    local req = table.concat({
        "POST ", GOVERNOR_PATH, " HTTP/1.1\r\n",
        "Host: ", GOVERNOR_HOST, "\r\n",
        "Content-Type: application/json\r\n",
        "Content-Length: ", #body, "\r\n",
        "Connection: close\r\n",
        "\r\n",
        body,
    })

    local _, send_err = sock:send(req)
    if send_err then
        ngx.log(ngx.INFO, "ape_buffer_sniper: send failed: ", send_err)
        sock:close()
        return
    end

    -- Drenamos la línea de status (no nos importa el cuerpo de la decisión:
    -- el sniper solo REPORTA; quien actúa sobre la decisión es otro path).
    sock:receive("*l")
    sock:close()
end

-- Construye el cuerpo JSON del BufferReport a partir de ids + métricas medidas.
local function build_report_body(ctx)
    -- throughput_bps REAL = bytes servidos / tiempo de servicio.
    local bytes   = tonumber(ngx.var.bytes_sent) or tonumber(ngx.var.body_bytes_sent) or 0
    local started = ctx.bg_start
    local elapsed = nil
    if started then
        elapsed = ngx.now() - started
    end
    local throughput_bps = 0
    if elapsed and elapsed > 0 and bytes > 0 then
        throughput_bps = (bytes * 8) / elapsed  -- bits/s
    end

    -- variant_bps: si el manifest declaró BANDWIDTH lo aprovechamos; si no, 0.
    local variant_bps = tonumber(ctx.bg_variant_bps) or 0

    -- playback_state derivado del status upstream/servido (informativo).
    local status = tonumber(ngx.var.status) or 0
    local playback_state = "ok"
    if status >= 500 then
        playback_state = "upstream_error"
    elseif status == 403 or status == 401 then
        playback_state = "auth_block"
    elseif status == 404 or status == 410 then
        playback_state = "segment_gone"
    elseif status == 0 then
        playback_state = "no_status"
    end

    -- live_edge_delta_ms: latencia de servicio en ms (proxy de cercanía al edge).
    local latency_ms = 0
    if elapsed and elapsed > 0 then
        latency_ms = elapsed * 1000
    end

    -- BufferReport JSON. buffer_s/capacity_s no son observables server-side →
    -- 0.0 (Rust los tolera vía buffer_percent()=0 cuando capacity<=0).
    local parts = {
        "{",
        '"channel_id":',        json_str(ctx.bg_channel_id),               ",",
        '"buffer_s":',          "0.0",                                     ",",
        '"capacity_s":',        "0.0",                                     ",",
        '"throughput_bps":',    json_num(math.floor(throughput_bps), 0),   ",",
        '"variant_bps":',       json_num(math.floor(variant_bps), 0),      ",",
        '"current_variant":',   json_str(ctx.bg_variant_id),               ",",
        '"rebuffer_count":',    "0",                                       ",",
        '"dropped_frames":',    "0",                                       ",",
        '"live_edge_delta_ms":',json_num(math.floor(latency_ms), 0),       ",",
        '"playback_state":',    json_str(playback_state),
        "}",
    }
    return table.concat(parts)
end

-- ── API PÚBLICA ──────────────────────────────────────────────────────────────

-- M.intercept_request() — fase rewrite_by_lua (dentro del wrapper del shield).
-- Marca el inicio y guarda ids en ngx.ctx. NO bloquea, NO sale, NO proxia.
function M.intercept_request()
    local ok = pcall(function()
        local ids = extract_ids()

        -- Solo armamos telemetría para peticiones de streaming reconocibles;
        -- el resto (favicons, control, etc.) pasa sin tocar.
        if not (ids.ext and STREAMING_EXT[ids.ext]) then
            ngx.ctx.bg_sniped = false
            return
        end

        ngx.ctx.bg_sniped      = true
        ngx.ctx.bg_start       = ngx.now()           -- marca de inicio (segundos float)
        ngx.ctx.bg_channel_id  = ids.channel_id
        ngx.ctx.bg_stream_id   = ids.stream_id
        ngx.ctx.bg_variant_id  = ids.variant_id
        ngx.ctx.bg_segment_uri = ids.segment_uri

        -- variant_bps opcional empujado por el player (?vbps=) si existe.
        local args = ngx.req.get_uri_args() or {}
        ngx.ctx.bg_variant_bps = tonumber(args.vbps or args.variant_bps)
    end)

    -- pcall falló → passthrough: el request sigue intacto, jamás interrumpido.
    if not ok then
        ngx.ctx.bg_sniped = false
    end
end

-- M.intercept_response() — fase log_by_lua (dentro del wrapper del shield).
-- Calcula latencia y dispara el reporte diferido a Rust. fire-and-forget.
-- NUNCA ngx.exit, NUNCA bloquea: ngx.timer.at corre en background.
function M.intercept_response()
    -- Guard: si el request no fue snipeado, no hay nada que reportar.
    if not (ngx.ctx and ngx.ctx.bg_sniped) then
        return
    end

    pcall(function()
        local body = build_report_body(ngx.ctx)
        -- ngx.timer.at(0, ...) → ejecuta tras finalizar el request, sin coste
        -- en el camino crítico. Si la cola de timers está llena, simplemente
        -- no se reporta (no_block); el stream ya se sirvió igual.
        local ok, err = ngx.timer.at(0, report_timer, body)
        if not ok then
            ngx.log(ngx.INFO, "ape_buffer_sniper: timer.at failed: ", err or "?")
        end
    end)
    -- Cualquier fallo en pcall NO afecta al request: ya terminó de servirse.
end

return M
