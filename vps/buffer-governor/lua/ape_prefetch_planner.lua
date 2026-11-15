-- ═══════════════════════════════════════════════════════════════════════════
--  ape_prefetch_planner.lua — Planificador de prefetch para nginx/OpenResty (LuaJIT)
--  APE Buffer Governor v2.0
-- ═══════════════════════════════════════════════════════════════════════════
--
--  RESPONSABILIDAD
--    M.plan(state) decide cuántos segmentos FRESCOS prefetchar hacia el live-edge
--    según el estado del buffer que el Governor (Rust) ya clasificó:
--
--        GREEN  → N+3       (cómodo: adelanto mínimo, no malgastar upstream)
--        YELLOW → N+6       (precaución: más colchón)
--        ORANGE → N+10      (riesgo: colchón agresivo)
--        RED    → N+15      (casi vacío: colchón máximo hacia el borde vivo)
--        BLACK  → 0         (upstream muerto: NO se prefetcha, lo resuelve el resync)
--
--    El plan se traduce en N tareas `PrefetchTask` que se ENCOLAN en el Rust
--    Governor vía POST /prefetch/enqueue (loopback), de forma DIFERIDA con
--    ngx.timer.at — JAMÁS en el camino crítico del request.
--
--    Regla madre (CLAUDE.md): BUFFER BAJO NO SE RESUELVE REPITIENDO VIDEO VIEJO.
--    Por eso los segmentos a prefetchar se DERIVAN del aprendiz de patrones
--    (ape_segment_pattern_learner.infer_next), que NUNCA inventa: si el patrón es
--    incierto devuelve nil y la cadena se corta ahí (el live-edge probe del
--    Governor se encarga del resto). Nunca se prefetcha un segmento "hacia atrás".
--
--  CONTROL DE CONCURRENCIA (anti-tormenta)
--    Un contador global en el shared dict `ape_prefetch_ctrl` limita cuántas
--    tareas de prefetch hay "en vuelo" simultáneamente en toda la caja. Antes de
--    encolar se RESERVA un slot (incr con TTL); si no hay slots libres, ese
--    segmento NO se encola (se evita la tormenta de prefetch que ahogaría el
--    upstream y rompería FREEZELESS). El slot se libera cuando el timer termina
--    el POST (o por expiración del TTL si el timer muriera).
--    Además, un cooldown por canal (`pf:cool:<channel>`) evita que dos requests
--    casi simultáneos del mismo canal disparen planes solapados.
--
--  INVARIANTES NGINX (INVIOLABLES — ver CLAUDE.md "VPS NET SHIELD AUTOPISTA"):
--    · NUNCA se llama ngx.exit() en header_filter/body_filter/log (este módulo
--      se invoca desde rewrite_by_lua del wrapper del shield y SOLO observa+encola).
--    · NO se tocan proxy_next_upstream / proxy_read_timeout desde Lua.
--    · TODO va dentro de pcall: cualquier fallo → PASSTHROUGH (se sirve el
--      original, la reproducción NUNCA se interrumpe).
--    · El encolado a Rust es fire-and-forget: si :8091/:8090 está caído o lento,
--      el player NO se entera (timer en background, socket con timeout corto).
--    · FREEZELESS: ante la duda, no se prefetcha y se sigue como si nada.
--
--  CONTRATO RUST (POST /prefetch/enqueue → PrefetchTask en lib.rs):
--      { "segment_uri": <str>,  "media_sequence": <u64>,  "priority": <u32>,
--        "channel_id": <str>,   "variant_id": <str>,      "provider": <str> }
--    Respuesta: 202 ACCEPTED { "queued": <depth> } — no nos importa el cuerpo.
--
--  Este módulo es `local M = {}` … `return M`. Sin estado global mutable.
-- ═══════════════════════════════════════════════════════════════════════════

local M = {}

-- ── Referencias locales (perf LuaJIT: evita lookups globales repetidos) ───────
local ngx        = ngx
local pcall      = pcall
local require    = require
local tonumber   = tonumber
local tostring   = tostring
local math_floor = math.floor
local str_match  = string.match
local str_lower  = string.lower
local tbl_concat = table.concat

-- ── Dependencia: aprendiz de patrones (carga defensiva) ──────────────────────
-- Si no está disponible, el planner degrada a "sin cadena de segmentos": no
-- prefetcha nada en vez de inventar URIs. Nunca rompe el request.
local learner_ok, learner = pcall(require, "ape_segment_pattern_learner")
if not learner_ok then
    learner = nil
end

-- ── Configuración (loopback only, alineada con buffer_governor.conf) ──────────
-- El server de CONTROL escucha en :8091 (allow 127.0.0.0/8) y proxia al Rust
-- Governor en :8090. Hablamos con el control, igual que ape_live_edge_resync.
local GOVERNOR_HOST   = "127.0.0.1"
local GOVERNOR_PORT   = 8091
local ENQUEUE_PATH    = "/prefetch/enqueue"

-- Timeouts AGRESIVAMENTE cortos: encolar JAMÁS debe colgar un worker/timer.
local CONNECT_TIMEOUT = 200   -- ms
local SEND_TIMEOUT    = 200   -- ms
local READ_TIMEOUT    = 200   -- ms

-- ── Shared dict de control de concurrencia (buffer_governor.conf) ─────────────
--   lua_shared_dict ape_prefetch_ctrl 5m;
-- Si no está declarado en este vhost, el planner degrada a "sin límite medible"
-- y se autolimita por el cap de tareas por plan (MAX_PER_PLAN). Nunca rompe.
local CTRL_DICT       = "ape_prefetch_ctrl"
local CTRL_KEY        = "inflight"          -- contador global de tareas en vuelo
local MAX_INFLIGHT    = 64                  -- techo global de prefetch simultáneo
local SLOT_TTL        = 5                   -- s — vida del slot reservado (auto-release)

-- Cooldown por canal: evita planes solapados de requests casi simultáneos.
local COOL_PREFIX     = "pf:cool:"
local COOL_TTL        = 2                   -- s — un plan por canal cada COOL_TTL

-- Tope duro de tareas que un solo plan puede encolar (defensa anti-tormenta
-- aunque el estado pidiera más). Coincide con el máximo de la escalera (RED=15).
local MAX_PER_PLAN    = 15

-- ── Profundidad de prefetch por estado (serde UPPERCASE del enum Rust) ────────
-- Espejo de BufferState::prefetch_depth() en lib.rs. Se usa SOLO como fallback
-- cuando bg_state.prefetch_depth no viene; la fuente de verdad es el Governor.
local DEPTH_BY_STATE = {
    GREEN  = 3,
    YELLOW = 6,
    ORANGE = 10,
    RED    = 15,
    BLACK  = 0,
}

-- Prioridad de la cola por estado (menor = se sirve antes en PrefetchQueue.sort).
-- RED/ORANGE deben adelantar a GREEN/YELLOW si coexisten en la cola del Governor.
local PRIORITY_BY_STATE = {
    RED    = 10,
    ORANGE = 30,
    YELLOW = 60,
    GREEN  = 90,
    BLACK  = 1000,
}

-- ═══════════════════════════════════════════════════════════════════════════
--  Helpers de serialización JSON-a-mano (sin dependencia dura de cjson; el
--  payload es pequeño y de forma conocida — mismo criterio que ape_buffer_sniper).
-- ═══════════════════════════════════════════════════════════════════════════

-- Escapa un valor de cadena para insertarlo seguro en un JSON construido a mano.
local function json_str(v)
    if v == nil then return "null" end
    v = tostring(v)
    v = v:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
    return '"' .. v .. '"'
end

-- Devuelve un literal numérico entero válido o el fallback dado.
local function json_int(v, fallback)
    local n = tonumber(v)
    if n == nil then return tostring(fallback or 0) end
    return tostring(math_floor(n))
end

-- ═══════════════════════════════════════════════════════════════════════════
--  Control de concurrencia sobre el shared dict (anti-tormenta)
-- ═══════════════════════════════════════════════════════════════════════════

-- _ctrl: acceso seguro al shared dict de control. nil si no está declarado.
local function _ctrl()
    return ngx.shared and ngx.shared[CTRL_DICT] or nil
end

-- _reserve_slot: intenta reservar UN slot de prefetch en vuelo.
--   Devuelve true si quedaba presupuesto (slot reservado), false si está lleno
--   o si no hay shared dict (en cuyo caso el llamador se autolimita por
--   MAX_PER_PLAN, nunca dispara una tormenta).
local function _reserve_slot()
    local dict = _ctrl()
    if not dict then
        -- Sin dict: no podemos contar globalmente. Permitimos hasta MAX_PER_PLAN
        -- por plan (límite local) pero no contabilizamos cross-worker.
        return true, false  -- (reservado_logico, reservado_real_en_dict)
    end
    -- incr atómico con valor inicial 0 y TTL: el primero crea la clave.
    local newval, err = dict:incr(CTRL_KEY, 1, 0, SLOT_TTL)
    if not newval then
        -- En algunas versiones incr no acepta init/ttl; degradamos a add+incr.
        dict:add(CTRL_KEY, 0, SLOT_TTL)
        newval, err = dict:incr(CTRL_KEY, 1)
        if not newval then
            -- No se pudo contabilizar: tratamos como "permitido" pero sin slot
            -- real (se autolimita por MAX_PER_PLAN). Nunca rompe.
            return true, false
        end
    end
    if newval > MAX_INFLIGHT then
        -- Nos pasamos del techo: devolvemos el slot y rechazamos (anti-tormenta).
        dict:incr(CTRL_KEY, -1)
        return false, false
    end
    return true, true
end

-- _release_slot: libera un slot reservado realmente en el dict. Idempotente y
-- nil-safe. Se llama al terminar el POST (o por TTL si el timer muriera).
local function _release_slot(reserved_in_dict)
    if not reserved_in_dict then return end
    local dict = _ctrl()
    if not dict then return end
    local cur = dict:get(CTRL_KEY)
    if cur and cur > 0 then
        dict:incr(CTRL_KEY, -1)
    end
end

-- _channel_on_cooldown: true si este canal ya disparó un plan hace < COOL_TTL.
-- Marca el cooldown atómicamente con add() (solo el primero gana).
local function _channel_on_cooldown(channel_id)
    local dict = _ctrl()
    if not dict or not channel_id or channel_id == "" then
        return false
    end
    -- add() devuelve true solo si la clave NO existía → ese request "gana" y
    -- ejecuta el plan; los demás dentro de la ventana ven false → cooldown.
    local ok = dict:add(COOL_PREFIX .. channel_id, 1, COOL_TTL)
    return not ok
end

-- ═══════════════════════════════════════════════════════════════════════════
--  Tarea diferida: POST /prefetch/enqueue a Rust (background, raw cosocket)
--  Mismo patrón probado que ape_buffer_sniper.report_timer: HTTP/1.1 mínimo,
--  Connection: close, drena la línea de status, cierra. fire-and-forget.
-- ═══════════════════════════════════════════════════════════════════════════
local function enqueue_timer(premature, body, reserved_in_dict)
    -- Garantizamos liberar el slot pase lo que pase (también si premature).
    local function done()
        _release_slot(reserved_in_dict)
    end

    if premature then
        -- nginx se está apagando: no encolamos, pero soltamos el slot.
        done()
        return
    end

    local ok = pcall(function()
        local sock = ngx.socket.tcp()
        sock:settimeouts(CONNECT_TIMEOUT, SEND_TIMEOUT, READ_TIMEOUT)

        local conn_ok, conn_err = sock:connect(GOVERNOR_HOST, GOVERNOR_PORT)
        if not conn_ok then
            ngx.log(ngx.INFO, "ape_prefetch_planner: connect ", GOVERNOR_HOST, ":",
                    GOVERNOR_PORT, " failed: ", conn_err or "?")
            return
        end

        local req = tbl_concat({
            "POST ", ENQUEUE_PATH, " HTTP/1.1\r\n",
            "Host: ", GOVERNOR_HOST, "\r\n",
            "Content-Type: application/json\r\n",
            "Content-Length: ", #body, "\r\n",
            "Connection: close\r\n",
            "\r\n",
            body,
        })

        local _, send_err = sock:send(req)
        if send_err then
            ngx.log(ngx.INFO, "ape_prefetch_planner: send failed: ", send_err)
            sock:close()
            return
        end

        -- Drenamos la línea de status; el cuerpo (queued depth) no nos importa.
        sock:receive("*l")
        sock:close()
    end)

    if not ok then
        ngx.log(ngx.INFO, "ape_prefetch_planner: enqueue_timer pcall failed")
    end

    -- Slot liberado SIEMPRE (éxito o fallo) — el TTL es solo la red de seguridad.
    done()
end

-- ═══════════════════════════════════════════════════════════════════════════
--  Normalización del estado de entrada (BufferDecision del Governor)
-- ═══════════════════════════════════════════════════════════════════════════

-- _resolve_state: acepta (a) la tabla BufferDecision (ngx.ctx.bg_state), o
-- (b) un string de estado ("GREEN"…). Devuelve { state, depth, channel_id,
-- variant_id, provider } normalizado. nil-safe en todos los campos.
local function _resolve_state(state)
    local s = {
        state      = nil,
        depth      = 0,
        channel_id = nil,
        variant_id = "",
        provider   = "",
    }

    if type(state) == "table" then
        -- BufferDecision: state (UPPERCASE), prefetch_depth (u32), channel_id.
        s.state      = state.state and str_match(tostring(state.state), "%a+")
        if s.state then s.state = str_lower(s.state):upper() end
        s.depth      = tonumber(state.prefetch_depth)
        s.channel_id = state.channel_id
        s.variant_id = state.variant_id or state.current_variant or ""
        s.provider   = state.provider or ""
    elseif type(state) == "string" then
        s.state = str_lower(state):upper()
    end

    -- Normaliza nombre de estado a uno conocido; si no, sin prefetch.
    if s.state and not DEPTH_BY_STATE[s.state] then
        s.state = nil
    end

    -- Profundidad: la fuente de verdad es el Governor (prefetch_depth). Si no
    -- vino, se deriva del estado (espejo de lib.rs). BLACK/desconocido → 0.
    if not s.depth then
        s.depth = (s.state and DEPTH_BY_STATE[s.state]) or 0
    end

    -- Cap duro anti-tormenta + saneo de negativos/no-enteros.
    if s.depth < 0 then s.depth = 0 end
    if s.depth > MAX_PER_PLAN then s.depth = MAX_PER_PLAN end
    s.depth = math_floor(s.depth)

    return s
end

-- _current_segment: deduce el segmento N actual desde el que encadenar (N+k).
-- Preferimos el que el sniper guardó en ngx.ctx (bg_segment_uri); si no, la URI
-- cruda del request. Solo segmentos (no manifest) son válidos para encadenar.
local function _current_segment()
    local ctx = ngx.ctx or {}
    local uri = ctx.bg_segment_uri or ngx.var.uri
    if type(uri) ~= "string" or uri == "" then
        return nil
    end
    -- Encadenamos SOLO sobre segmentos numerados; un .m3u8 no porta índice.
    local lower = str_lower(uri:match("^([^?]*)") or uri)
    if lower:match("%.m3u8$") then
        return nil  -- el manifest no se prefetcha; eso es trabajo del resync.
    end
    return uri
end

-- _media_seq_of: extrae el último grupo de dígitos del path como media_sequence
-- aproximada (solo para el campo del PrefetchTask; el Governor es la autoridad).
local function _media_seq_of(uri)
    local path = uri:match("^([^?]*)") or uri
    local last
    local from = 1
    while true do
        local a, b = path:find("%d+", from)
        if not a then break end
        last = path:sub(a, b)
        from = b + 1
    end
    return tonumber(last) or 0
end

-- ═══════════════════════════════════════════════════════════════════════════
--  API PÚBLICA
-- ═══════════════════════════════════════════════════════════════════════════

-- M.plan(state)
--   Punto de entrada llamado desde rewrite_by_lua del wrapper del shield:
--       require("ape_prefetch_planner").plan(ngx.ctx.bg_state)
--
--   `state` = BufferDecision del Governor (tabla) o el nombre del estado (string).
--   Decide N+3/N+6/N+10/N+15/0 según el estado, encadena esa cantidad de
--   segmentos FRESCOS hacia el live-edge (vía el aprendiz de patrones, sin
--   inventar) y los encola en el Rust Governor de forma diferida y limitada por
--   concurrencia (anti-tormenta).
--
--   Devuelve el nº de tareas efectivamente programadas (≥0). NUNCA lanza, NUNCA
--   bloquea, NUNCA sale: cualquier fallo → 0 (passthrough). El request sigue
--   intacto pase lo que pase.
function M.plan(state)
    local ok, planned = pcall(function()
        local s = _resolve_state(state)

        -- BLACK / estado desconocido / depth 0 → no se prefetcha (lo resuelve el
        -- live-edge resync; prefetchar sobre upstream muerto sería tormenta inútil).
        if not s.state or s.depth <= 0 then
            return 0
        end

        -- Necesitamos un segmento N de partida para encadenar N+k.
        local seg = _current_segment()
        if not seg then
            return 0
        end

        -- Sin aprendiz de patrones no encadenamos (no inventamos URIs).
        if not learner or type(learner.infer_next) ~= "function" then
            return 0
        end

        -- Cooldown por canal: evita planes solapados de requests simultáneos.
        local channel_id = s.channel_id or (ngx.ctx and ngx.ctx.bg_channel_id) or "unknown"
        if _channel_on_cooldown(channel_id) then
            return 0
        end

        local priority = PRIORITY_BY_STATE[s.state] or 100
        local scheduled = 0
        local cursor = seg

        -- Encadena hasta `depth` segmentos frescos: N+1, N+2, … N+depth.
        -- infer_next devuelve nil en cuanto el patrón es incierto → cortamos
        -- (frontera de live-edge probe; nunca extrapolamos a ciegas).
        for _ = 1, s.depth do
            local nxt = learner.infer_next(cursor)
            if not nxt or nxt == cursor then
                break  -- patrón incierto / sin avance → fin de la cadena fresca.
            end

            -- Reserva de slot global (anti-tormenta). Si no hay presupuesto,
            -- dejamos de encolar AHORA (no insistimos: evita la avalancha).
            local allowed, reserved_in_dict = _reserve_slot()
            if not allowed then
                break
            end

            -- Construye el PrefetchTask (contrato lib.rs) por concatenación.
            local body = tbl_concat({
                "{",
                '"segment_uri":',    json_str(nxt),                       ",",
                '"media_sequence":', json_int(_media_seq_of(nxt), 0),     ",",
                '"priority":',       json_int(priority, 100),             ",",
                '"channel_id":',     json_str(channel_id),                ",",
                '"variant_id":',     json_str(s.variant_id),              ",",
                '"provider":',       json_str(s.provider),
                "}",
            })

            -- Encolado DIFERIDO: ngx.timer.at(0, …) corre tras el request, fuera
            -- del camino crítico. Si la cola de timers está llena, soltamos el
            -- slot y seguimos (no bloqueamos, no insistimos).
            local timer_ok, timer_err = ngx.timer.at(0, enqueue_timer, body, reserved_in_dict)
            if not timer_ok then
                _release_slot(reserved_in_dict)
                ngx.log(ngx.INFO, "ape_prefetch_planner: timer.at failed: ", timer_err or "?")
                break
            end

            scheduled = scheduled + 1
            cursor = nxt
        end

        return scheduled
    end)

    -- pcall falló → passthrough total: 0 tareas, request intacto.
    if not ok then
        return 0
    end
    return planned or 0
end

-- M.depth_for(state) -> número
--   Introspección/diagnóstico (p.ej. /watchdog-status): devuelve la profundidad
--   de prefetch que M.plan usaría para `state`, sin encolar nada. nil-safe.
function M.depth_for(state)
    local ok, d = pcall(function()
        return _resolve_state(state).depth
    end)
    if not ok then return 0 end
    return d or 0
end

-- M.inflight() -> número
--   Contador global de tareas de prefetch en vuelo (lectura del shared dict).
--   Diagnóstico. Devuelve 0 si el dict no está declarado. No muta nada.
function M.inflight()
    local dict = _ctrl()
    if not dict then return 0 end
    local ok, n = pcall(function()
        return dict:get(CTRL_KEY) or 0
    end)
    if not ok then return 0 end
    return n or 0
end

return M
