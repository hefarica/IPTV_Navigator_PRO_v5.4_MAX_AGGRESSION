-- ═══════════════════════════════════════════════════════════════════════════
-- ape_live_edge_resync.lua — Resync al BORDE VIVO (live edge) sin repetir ventanas
-- OpenResty / LuaJIT — APE Buffer Governor v2.0
-- ═══════════════════════════════════════════════════════════════════════════
--
-- RESPONSABILIDAD
--   En estado de buffer RED o BLACK (colapso/casi-vacío), M.resync(channel)
--   consulta al Rust Governor (POST 127.0.0.1:8091/live-edge/probe), obtiene el
--   borde vivo (highest_media_sequence / resync_to) y reescribe el manifest para
--   que el player SALTE a la ventana fresca, evitando ventanas viejas y SIN repetir
--   jamás un media_sequence ya servido (INVARIANTE no-repeat).
--
-- INVARIANTES NGINX (no negociables — ver buffer_governor.conf y la doctrina del repo):
--   · NUNCA se llama ngx.exit() en header_filter/body_filter (este módulo es invocado
--     desde body_filter del shield). Si algo falla → PASSTHROUGH (servir el original).
--   · NO se tocan proxy_next_upstream / proxy_read_timeout desde Lua.
--   · TODO va dentro de pcall: cualquier excepción → passthrough silencioso.
--   · El no-repeat se ancla en el shared dict `ape_ledger`: el media_sequence emitido
--     para un canal sólo puede AVANZAR (monotónico). Retroceso = repetir = PROHIBIDO.
--   · FREEZELESS: ante la duda, se devuelve el manifest original intacto.
--
-- CONTRATO RUST (POST /live-edge/probe):
--   request : { "manifest_uri": <str>, "highest_media_sequence": <u64|null> }
--   response: { "manifest_uri", "highest_media_sequence", "gap_detected",
--               "resync_to", "probed_at_ms" }
--
-- Este módulo es `local M = {}` … `return M`. Sin estado global mutable.
-- ═══════════════════════════════════════════════════════════════════════════

local M = {}

-- ── Dependencias cargadas de forma defensiva (si falta una → degradar, no romper) ──
local cjson_ok, cjson = pcall(require, "cjson.safe")
if not cjson_ok or not cjson then
    -- cjson.safe no disponible: el módulo opera en modo passthrough total.
    cjson = nil
end

local http_ok, http = pcall(require, "resty.http")
if not http_ok then
    http = nil
end

-- ── Constantes de configuración (NO se inyectan en runtime de video) ─────────
local GOVERNOR_HOST   = "127.0.0.1"   -- control loopback del Governor (buffer_governor.conf)
local GOVERNOR_PORT   = 8091          -- server de control (proxia a Rust :8090)
local PROBE_PATH      = "/live-edge/probe"
local PROBE_TIMEOUT   = 250           -- ms — corto: jamás bloquear el worker más de lo justo
local LEDGER_DICT     = "ape_ledger"  -- shared dict declarado en buffer_governor.conf
local LEDGER_TTL      = 60            -- s — ventana de vigencia del último media_sequence
local LEDGER_PREFIX   = "live_edge_seq:"  -- namespace del ledger no-repeat

-- Estados de buffer que DISPARAN resync (serde snake_case del enum Rust BufferState).
local RESYNC_STATES = { red = true, black = true }

-- ═══════════════════════════════════════════════════════════════════════════
-- Helpers internos
-- ═══════════════════════════════════════════════════════════════════════════

-- _norm_state: normaliza el estado de buffer a minúsculas y string. Nil-safe.
local function _norm_state(state)
    if type(state) ~= "string" then
        return nil
    end
    return state:lower()
end

-- _ledger: acceso seguro al shared dict ape_ledger. Devuelve nil si no existe
-- (p.ej. el dict no está declarado en este vhost) → el llamador degrada a passthrough.
local function _ledger()
    local shared = ngx and ngx.shared
    if not shared then
        return nil
    end
    return shared[LEDGER_DICT]
end

-- _last_seq: último media_sequence emitido para este canal (o 0 si no hay registro).
-- Lectura tolerante a fallos: cualquier error → 0 (se comporta como "sin historia").
local function _last_seq(channel)
    local led = _ledger()
    if not led then
        return 0
    end
    local v = led:get(LEDGER_PREFIX .. channel)
    if type(v) == "number" then
        return v
    end
    return 0
end

-- _commit_seq: ancla monotónicamente el nuevo media_sequence en el ledger.
-- INVARIANTE: sólo escribe si new_seq > último conocido (nunca retrocede).
-- Devuelve true si el avance fue aceptado, false si sería un retroceso/repetición.
local function _commit_seq(channel, new_seq)
    if type(new_seq) ~= "number" then
        return false
    end
    local led = _ledger()
    if not led then
        -- Sin ledger no podemos garantizar no-repeat → mejor NO resync (passthrough).
        return false
    end
    local key = LEDGER_PREFIX .. channel
    local prev = _last_seq(channel)
    if new_seq <= prev then
        -- Retroceso o igualdad = repetir ventana vieja → PROHIBIDO.
        return false
    end
    -- set tolerante: si falla por falta de memoria, no rompemos el flujo.
    local ok = pcall(function()
        led:set(key, new_seq, LEDGER_TTL)
    end)
    return ok and true or false
end

-- _probe_live_edge: POST al Rust Governor pidiendo el borde vivo del manifest.
-- Devuelve la tabla de respuesta decodificada o nil ante cualquier fallo.
-- NUNCA lanza: todo error se traduce en nil → passthrough en el llamador.
local function _probe_live_edge(manifest_uri, highest_known)
    if not http or not cjson then
        return nil
    end

    local httpc = http.new()
    httpc:set_timeout(PROBE_TIMEOUT)

    local body = cjson.encode({
        manifest_uri          = manifest_uri or "",
        highest_media_sequence = highest_known,  -- puede ser nil (válido para Rust)
    })
    if not body then
        return nil
    end

    local res, err = httpc:request_uri(
        "http://" .. GOVERNOR_HOST .. ":" .. GOVERNOR_PORT .. PROBE_PATH,
        {
            method = "POST",
            body   = body,
            headers = {
                ["Content-Type"]  = "application/json",
                ["Content-Length"] = #body,
            },
            keepalive_timeout = 60000,
            keepalive_pool    = 16,
        }
    )

    if not res then
        -- Governor caído / timeout → no resync, seguimos con el original.
        if ngx and ngx.log then
            ngx.log(ngx.INFO, "[live_edge_resync] probe sin respuesta: ", err or "?")
        end
        return nil
    end

    if res.status ~= 200 or not res.body then
        return nil
    end

    local decoded = cjson.decode(res.body)
    if type(decoded) ~= "table" then
        return nil
    end
    return decoded
end

-- _scan_manifest: extrae del manifest el #EXT-X-MEDIA-SEQUENCE actual y el nº de
-- segmentos #EXTINF. Sólo lectura — no muta. Devuelve (base_seq, segment_count).
-- Tolerante: si el manifest no es VOD/LIVE válido → (nil, 0).
local function _scan_manifest(manifest)
    if type(manifest) ~= "string" then
        return nil, 0
    end
    local base = manifest:match("#EXT%-X%-MEDIA%-SEQUENCE:%s*(%d+)")
    local base_seq = base and tonumber(base) or nil

    -- contar segmentos: cada #EXTINF marca un media segment.
    local count = 0
    for _ in manifest:gmatch("#EXTINF:") do
        count = count + 1
    end
    return base_seq, count
end

-- _rewrite_to_live_edge: reescribe el manifest para anclar MEDIA-SEQUENCE al borde
-- vivo (resync_to) y opcionalmente recortar las ventanas más viejas que el target.
-- Implementación CONSERVADORA: si no se puede reescribir de forma segura, devuelve
-- el manifest original (passthrough). Nunca produce un manifest corrupto.
local function _rewrite_to_live_edge(manifest, base_seq, resync_to)
    -- Sin base de media_sequence en el manifest no reescribimos cabecera (riesgo de
    -- desalinear índices) → devolvemos original.
    if type(manifest) ~= "string" or type(base_seq) ~= "number"
        or type(resync_to) ~= "number" then
        return manifest
    end

    -- Si el borde vivo está por DELANTE del manifest servido, no podemos "inventar"
    -- segmentos que el upstream no nos dio: servimos el original (el prefetch del
    -- Governor traerá los frescos) sin mentir sobre la ventana.
    if resync_to > base_seq then
        return manifest
    end

    -- resync_to está dentro de la ventana servida: recortamos segmentos viejos
    -- (anteriores a resync_to) y reescribimos la cabecera MEDIA-SEQUENCE.
    local drop = resync_to - base_seq  -- nº de segmentos viejos a descartar (>=0)
    if drop <= 0 then
        -- El borde coincide con el inicio: sólo aseguramos la cabecera, sin recortar.
        return manifest
    end

    -- Separamos cabecera (todo hasta el primer #EXTINF) del cuerpo de segmentos.
    local header_end = manifest:find("#EXTINF:", 1, true)
    if not header_end then
        return manifest
    end
    local header = manifest:sub(1, header_end - 1)
    local segbody = manifest:sub(header_end)

    -- Reconstruimos saltando `drop` bloques #EXTINF (cada bloque = #EXTINF + URI[+tags]).
    local out = {}
    local skipped = 0
    -- Partimos por líneas y reensamblamos contando #EXTINF como frontera de segmento.
    local kept = false
    for line in (segbody .. "\n"):gmatch("(.-)\n") do
        if line:match("^#EXTINF:") then
            if skipped < drop then
                skipped = skipped + 1
                kept = false
            else
                kept = true
            end
        end
        if kept then
            out[#out + 1] = line
        end
    end

    -- Si por cualquier razón no quedó cuerpo, NO servimos un manifest vacío: passthrough.
    if #out == 0 then
        return manifest
    end

    -- Reescribimos la cabecera MEDIA-SEQUENCE al borde vivo (resync_to).
    local new_header = header:gsub(
        "(#EXT%-X%-MEDIA%-SEQUENCE:)%s*%d+",
        "%1" .. tostring(resync_to)
    )
    -- Si la cabecera no tenía el tag (raro tras _scan_manifest), lo añadimos tras #EXTM3U.
    if not new_header:find("#EXT%-X%-MEDIA%-SEQUENCE:") then
        new_header = new_header:gsub(
            "(#EXTM3U[^\n]*\n)",
            "%1#EXT-X-MEDIA-SEQUENCE:" .. tostring(resync_to) .. "\n",
            1
        )
    end

    return new_header .. table.concat(out, "\n") .. "\n"
end

-- ═══════════════════════════════════════════════════════════════════════════
-- API PÚBLICA
-- ═══════════════════════════════════════════════════════════════════════════

-- M.should_resync(state) -> bool
--   true sólo si el estado de buffer es RED o BLACK. Nil/desconocido → false.
function M.should_resync(state)
    local s = _norm_state(state)
    if not s then
        return false
    end
    return RESYNC_STATES[s] == true
end

-- M.resync(channel, opts) -> manifest_string, info_table
--   Punto de entrada principal. `channel` = id del canal; `opts` = {
--       manifest      = <string>,   -- manifest HLS original (obligatorio para reescribir)
--       manifest_uri  = <string>,   -- URI del manifest (para el probe Rust)
--       state         = <string>,   -- estado de buffer (red/black dispara; resto passthrough)
--   }
--   Devuelve SIEMPRE un manifest reproducible:
--     · si todo va bien y hay borde vivo nuevo → manifest reescrito al live edge.
--     · ante CUALQUIER fallo/duda → manifest original (PASSTHROUGH, freezeless).
--   El 2º valor es una tabla informativa (no bloqueante; útil para log_by_lua).
function M.resync(channel, opts)
    opts = opts or {}
    local original = opts.manifest

    -- Resultado por defecto = passthrough explícito.
    local function passthrough(reason)
        return original, { resynced = false, reason = reason or "passthrough", channel = channel }
    end

    -- Guardas de entrada: sin canal o sin manifest no hay nada que reescribir.
    if type(channel) ~= "string" or channel == "" then
        return passthrough("no_channel")
    end
    if type(original) ~= "string" or original == "" then
        return passthrough("no_manifest")
    end

    -- Sólo actuamos en RED/BLACK; en cualquier otro estado, passthrough puro.
    if not M.should_resync(opts.state) then
        return passthrough("state_not_red_black")
    end

    -- TODO el trabajo de red + reescritura va envuelto en pcall: si truena → original.
    local ok, manifest_out, info = pcall(function()
        -- 1) Leer el media_sequence base y el conteo de segmentos del manifest servido.
        local base_seq, seg_count = _scan_manifest(original)

        -- 2) El "highest conocido" que reportamos al Governor: base + (segmentos-1).
        --    Si no hay base, mandamos el último anclado en el ledger (o nil).
        local highest_known
        if base_seq and seg_count > 0 then
            highest_known = base_seq + (seg_count - 1)
        else
            local prev = _last_seq(channel)
            highest_known = (prev > 0) and prev or nil
        end

        -- 3) Probe al Rust Governor (loopback). Nil → no resync.
        local probe = _probe_live_edge(opts.manifest_uri, highest_known)
        if not probe then
            return original, { resynced = false, reason = "probe_nil", channel = channel }
        end

        -- 4) Determinar el target de resync: preferimos resync_to; si no, highest del probe.
        local target = probe.resync_to
        if type(target) ~= "number" then
            target = probe.highest_media_sequence
        end
        if type(target) ~= "number" then
            return original, { resynced = false, reason = "no_target", channel = channel }
        end

        -- 5) NO-REPEAT: el target debe AVANZAR respecto a lo ya servido. _commit_seq
        --    falla (false) ante retroceso/igualdad → entonces passthrough (sin repetir).
        if not _commit_seq(channel, target) then
            return original, {
                resynced = false,
                reason   = "no_repeat_guard",
                channel  = channel,
                target   = target,
                last     = _last_seq(channel),
            }
        end

        -- 6) Reescribir el manifest hacia el borde vivo (recorte de ventanas viejas
        --    + cabecera MEDIA-SEQUENCE = target). Conservador: si no puede, devuelve original.
        local rewritten = _rewrite_to_live_edge(original, base_seq, target)
        if type(rewritten) ~= "string" or rewritten == "" then
            return original, { resynced = false, reason = "rewrite_empty", channel = channel }
        end

        return rewritten, {
            resynced     = (rewritten ~= original),
            reason       = "live_edge",
            channel      = channel,
            target       = target,
            gap_detected = probe.gap_detected,
            probed_at_ms = probe.probed_at_ms,
        }
    end)

    -- Si el pcall falló (excepción) → passthrough seguro y logueamos a nivel INFO.
    if not ok then
        if ngx and ngx.log then
            ngx.log(ngx.WARN, "[live_edge_resync] excepción en resync(", tostring(channel),
                "): ", tostring(manifest_out))
        end
        return passthrough("exception")
    end

    -- pcall ok: manifest_out es el manifest (reescrito u original), info la metadata.
    return manifest_out, info or { resynced = false, reason = "unknown", channel = channel }
end

-- M.peek_last_seq(channel) -> number
--   Lectura del último media_sequence anclado (para telemetría/tests). 0 si no hay.
function M.peek_last_seq(channel)
    if type(channel) ~= "string" or channel == "" then
        return 0
    end
    return _last_seq(channel)
end

return M
