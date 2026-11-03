-- ═════════════════════════════════════════════════════════════════════════════
-- APE SESSION COORDINATOR — coordinador Lua de sesiones media-fanout
-- ═════════════════════════════════════════════════════════════════════════════
-- Ruta:      _vps_stage/lua/ape_session.lua   (staging; NO toca /etc/nginx prod)
-- Nginx:     1.24.0 (Ubuntu) + ngx_http_lua 0.10.26  (NO es OpenResty)
-- Depende:   SOLO ngx.* core (shared dict, timer, socket, var, sleep, log).
--            PROHIBIDO require "resty.lock" / "resty.http" / "resty.string":
--            NO están instalados en el VPS (medido en W1 §2). Este módulo no
--            usa cjson tampoco: serializa con formato propio y JSON a mano.
--
-- QUÉ ES
--   El plano de CONTROL del fan-out. Mantiene en lua_shared_dict el registro de
--   sesiones (por proveedor|canal), un lock single-flight, el fencing por
--   generación, el contador atómico de espectadores, el TTL linger y las
--   métricas. Enruta /mf/<key>/<gen>/... hacia la ventana deslizante del worker
--   (ficheros ya producidos por FFmpeg), sin tocar un solo byte de vídeo.
--
-- QUÉ NO ES (contrato duro)
--   * NO procesa vídeo: no remuxea, no escala, no decodifica, no toca píxeles.
--   * NO spawnea FFmpeg ni hace fork/exec: habla con el SUPERVISOR por Unix
--     socket (W1 §6: el supervisor es la ÚNICA autoridad de lifecycle).
--   * NO crea una ingesta por perfil: la clave de idempotencia es
--     hash(proveedor|canal) y el perfil de salida queda FUERA de la clave. Los
--     perfiles original (remux) y 4K (escalado, gated) comparten la MISMA
--     ingesta y la MISMA generación base.
--   * NO bloquea indefinidamente: toda espera es acotada (spawn_wait_ms,
--     manifest_wait_ms) y devuelve 503 con motivo + Retry-After.
--
-- CONTRATO → IMPLEMENTACIÓN (trazabilidad de aceptación)
--   1) single-flight por hash(provider|channel) con dict:add y TTL
--        → key_of() · acquire_lock()/release_lock() · claim()
--   2) registro de espectadores con contador atómico add/remove + linger
--        → add_viewer()/remove_viewer()/touch() · sweep() · close_session()
--   3) generation/fencing: publicación con token viejo → rechazada y contada
--        → publish()/heartbeat()/release() · fence_reject()
--   4) CERO vídeo: sin io.popen/os.execute/ffmpeg en el fichero
--        → sup_call() únicamente habla el protocolo del supervisor
--   5) métricas + health sin hosts internos
--        → metrics_text()/health_json() · STATIC_REASONS · sanitize
--   6) límites: MAX_SESSIONS / viewers → 503 con motivo, sin tocar a los vivos
--        → enforce_capacity() · deny() (nunca expulsa sesiones existentes)
--
-- RUTAS
--   GET /mf/health                      → JSON sanitizado (público)
--   GET /mf/metrics                     → Prometheus (solo loopback)
--   GET/POST /mf/ctl?op=...             → API de control del worker (loopback)
--        op=claim|heartbeat|publish|seed|release|sweep|stats|inspect|register|leave
--   GET /mf/<key16>/live.m3u8           → manifest de la sesión (la crea si no hay)
--   GET /mf/<key16>/<gen>/live.m3u8     → idem, con fencing de generación
--   GET /mf/<key16>/<gen>/segNNN.ts     → segmento de la ventana (sin bloquear)
--   GET /mf/<key16>/<gen>/4k/index.m3u8 → variante 4K (gateada; misma ingesta)
--   GET /mf/src/<proveedor>/<canal>/live.m3u8 → alias → 302 a la forma canónica
--
-- SUPERVISOR (protocolo de línea, UDS, timeout 250 ms)
--   → "OPEN <key> [<proveedor>|<canal>]\n"
--                          ← "OK gen=<n> state=<s> seq=<n> caps=<n>"
--   → "PING -\n"           ← "PONG"
--                          ← "ERR code=<c> reason=<r>"
--   caps: 0=desconocido 1=gpu ok y encode>=1.5x 2=gpu no 3=gpu ok pero lento
--   El supervisor es idempotente para OPEN y dueño del gen (W1 §6.3/§6.4).
--   El idem se aprende del alias /mf/src/<proveedor>/<canal>/... o de
--   `ctl op=register`; con URL canónica sola, OPEN va sin idem y el supervisor
--   DEBE resolverlo desde su estado persistido. En ningún caso el coordinador
--   abre URLs del proveedor: sólo habla el protocolo con el supervisor.
--
-- INVARIANTES
--   I1  Una sola sesión por key: el lock sólo optimiza; el supervisor garantiza.
--   I2  gen monótono por key (nunca retrocede, sobrevive al cierre de sesión).
--   I3  Un publish/heartbeat/release con gen != gen actual se rechaza y cuenta.
--   I4  Nunca se sirve un segmento de generación muerta: 302 jump-to-live.
--   I5  Los límites nunca expulsan a un espectador ya conectado.
--   I6  Metrics/health jamás contienen proveedor, canal, host, IP, ruta o socket.
--   I7  El módulo no toca vídeo ni lanza procesos.
-- ═════════════════════════════════════════════════════════════════════════════

local _M = { _VERSION = "1.0.0" }

-- ── nombres de diccionarios (declarados en media-fanout.conf) ────────────────
local DICT_STATE = "mf_sessions"   -- 16m: registros + marcas de espectador
local DICT_LOCKS = "mf_locks"      -- 4m : single-flight + rate-limit de sweep
local DICT_STATS = "mf_stats"      -- 4m : contadores, índice, gauges

-- ── espacios de clave ────────────────────────────────────────────────────────
local K_SESS = "s:"      -- s:<key>            → registro de sesión
local K_GEN  = "g:"      -- g:<key>            → última generación vista
local K_VIEW = "vw:"     -- vw:<key>           → contador atómico de espectadores
local K_MARK = "v:"      -- v:<key>:<cid>      → marca por cliente (TTL 30 s)
local K_SF   = "sf:"     -- sf:<key>           → lock single-flight (en mf_locks)
local K_IDX  = "sidx:"   -- sidx:<key>         → índice de sesiones (en mf_stats)
local K_IDEM = "m:"      -- m:<key>            → idem proveedor|canal (para OPEN)
local K_CAPS = "caps:full" -- caps del supervisor (cache corta)

-- ── estados válidos de sesión (W1 §6.4 + "seed" de t10) ─────────────────────
local VALID_STATE = {
    seed      = true,   -- pre-registro del supervisor (sin OPEN ni spawn)
    resolving = true, starting = true, live = true,
    draining  = true, stopping = true, backoff = true, failed = true,
}

-- ── límites por defecto (W1 §6.6). Sobreescribibles por variables nginx
--    `set $mf_<nombre> "<valor>";` (staging puede usar 6–8 sesiones). ────────
local DEF = {
    max_sessions            = 12,    -- techo medido 16; recomendado 12
    max_viewers_per_session = 24,
    max_total_viewers       = 120,
    linger_ttl              = 25,    -- s tras el último espectador
    linger_max              = 90,    -- tope duro de linger (evita sesiones zombis)
    lock_ttl                = 8,     -- s; backstop si el worker muere con el lock
    session_ttl             = 180,   -- s; el worker refresca con heartbeat/publish
    viewer_ttl              = 30,    -- s; marca por cliente (W1 §6.5)
    gen_ttl                 = 3600,  -- s; el gen sobrevive al cierre (fencing I2)
    spawn_wait_ms           = 2000,  -- espera acotada del perdedor del lock
    manifest_wait_ms        = 2500,  -- espera acotada a que el manifest esté LIVE
    poll_ms                 = 50,
    spawn_timeout           = 15,    -- s sin pasar de STARTING → sesión estancada
    sweep_interval          = 10,    -- s (rate-limit del sweep perezoso)
    sup_timeout_ms          = 250,   -- W1 §6.1: UDS con timeout 250 ms
    caps_ttl                = 10,    -- s de cache del probe de hardware
    max_reap_truncated      = 0,     -- 0 = permitir reconciliación si get_keys corta
}

-- ── motivos de denegación conocidos (etiquetas estables para Prometheus) ────
local STATIC_REASONS = {
    "max_sessions", "max_viewers", "max_total_viewers",
    "spawn_wait_timeout", "supervisor_unavailable", "supervisor_bad_reply",
    "session_failed", "manifest_not_ready", "stale_generation",
    "seq_regression", "key_collision", "bad_route", "bad_request",
    "no_session", "dict_unavailable", "ctl_forbidden", "gpu_unavailable",
    "encode_slow", "device_unsupported", "publish_rejected", "bad_state",
    "lock_timeout", "gen_mismatch",
}

-- ── hooks de test (sólo los usa el harness; nil = comportamiento real) ──────
--   now()        → número (segundos)
--   sleep(s)     → duerme s (en el harness: coroutine.yield)
--   log(level,m) → registra
--   supervisor(op, key, extra) → tabla de respuesta o nil,err
--   _M._cfg      → overrides de configuración (evita depender de ngx.var)
_M._hooks = {}
_M._cfg   = {}

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. utilidades base (sin dependencias, Lua 5.1 / LuaJIT compatibles)
-- ═══════════════════════════════════════════════════════════════════════════

local function now()
    local h = _M._hooks.now
    if h then return h() end
    if ngx and ngx.now then return ngx.now() end
    return os.time()
end

local function sleep(sec)
    local h = _M._hooks.sleep
    if h then return h(sec) end
    if ngx and ngx.sleep then return ngx.sleep(sec) end
end

local function log(level, msg)
    local h = _M._hooks.log
    if h then return h(level, msg) end
    if ngx and ngx.log then ngx.log(level, "mf_session: ", msg) end
end

-- Configuración: en fase de petición se leen las variables $mf_*; en contextos
-- SIN request (timers de mantenimiento/log) ngx.var no está disponible, así que
-- se usa una FOTO tomada en la primera petición del worker. Sin esto, el timer
-- aplicaría los defaults (p.ej. linger 25) ignorando la config del server.
local SNAP_EXTRA = { sup_endpoint = true, key_salt = true }

local function take_snapshot()
    if _M._snap then return _M._snap end
    if not (ngx and ngx.var) then return nil end
    local snap, n = {}, 0
    for name in pairs(DEF) do
        local v
        pcall(function() v = ngx.var["mf_" .. name] end)
        if v ~= nil and v ~= "" then snap[name] = v; n = n + 1 end
    end
    for name in pairs(SNAP_EXTRA) do
        local v
        pcall(function() v = ngx.var["mf_" .. name] end)
        if v ~= nil then snap[name] = v; n = n + 1 end
    end
    if n > 0 then _M._snap = snap end
    return _M._snap
end

local function raw_cfg(name)
    if _M._cfg and _M._cfg[name] ~= nil then return _M._cfg[name] end
    local s = take_snapshot()
    if s and s[name] ~= nil and s[name] ~= "" then return s[name] end
    local v
    if ngx and ngx.var then pcall(function() v = ngx.var["mf_" .. name] end) end
    if v ~= nil and v ~= "" then return v end
    return nil
end

local function cfgn(name, default)
    local v = raw_cfg(name)
    if type(v) == "number" then return v end
    if type(v) == "string" then
        local n = tonumber(v)
        if n then return n end
    end
    if default ~= nil then return default end
    return DEF[name]
end

local function cfgs(name, default)
    local v = raw_cfg(name)
    if type(v) == "string" then return v end
    return default or ""
end

local function sha_i(n)
    -- entero sin signo de 32 bits → 8 hex (Lua 5.1: sin bitops, sólo aritmética)
    return string.format("%08x", n % 4294967296)
end

-- Hash polinómico determinista sin dependencias externas. Dos carriles
-- independientes → clave de 62 bits. Suficiente para ≤16 sesiones y, al no
-- depender de un secreto, el helper de test y el plano real coinciden.
local MOD_H = 2147483647
local function hash_lane(str, seed, prime)
    local h = seed % MOD_H
    for i = 1, #str do
        h = (h * prime + str:byte(i)) % MOD_H
    end
    return h
end

local function normalize_pair(provider, channel)
    local p = tostring(provider or ""):lower()
    p = p:gsub("^%s+", ""):gsub("%s+$", "")
    p = p:gsub("^[a-z][a-z0-9+.-]*://", "")
    p = p:gsub("/.*$", "")
    p = p:gsub("^([^:]+):80$", "%1")
    p = p:gsub("^([^:]+):443$", "%1")
    p = p:gsub("%.$", "")

    local c = tostring(channel or "")
    c = c:gsub("%s+", "")
    c = c:gsub("[?#].*$", "")
    if c:find("/") then c = c:match("([^/]+)$") or c end
    c = c:gsub("%.[mM]3[uU]8$", ""):gsub("%.[tT][sS]$", "")

    if p == "" or c == "" then return nil, nil end
    -- Allowlist de charset: el idem viaja por una línea del protocolo UDS, así
    -- que se prohíbe cualquier espacio/control que pudiera inyectar tokens.
    if #p > 190 or #c > 64 then return nil, nil end
    if not p:match("^[%w%-%._:]+$") then return nil, nil end
    if not c:match("^[%w%-%._]+$") then return nil, nil end
    return p, c
end

local function key_of(provider, channel, salt)
    -- normaliza y compone el idem: proveedor|canal (SIN perfil, SIN credencial)
    local p, c = normalize_pair(provider, channel)
    if not p then return nil, "bad_request" end
    local idem = p .. "|" .. c
    local s = cfgs("key_salt", "") .. "\0" .. idem
    return sha_i(hash_lane(s, 2166136261, 131)) ..
           sha_i(hash_lane(s, 2246822519, 65599)), "ok"
end

local function fp_of(provider, channel, salt)
    local idem = tostring(provider or "") .. "|" .. tostring(channel or "")
    local s = cfgs("key_salt", "") .. "\1" .. idem
    return sha_i(hash_lane(s, 97, 1000003))
end

local function valid_key(key)
    return type(key) == "string" and key:match("^%x+$") ~= nil and #key == 16
end

local worker_seq = 0
local function token()
    worker_seq = worker_seq + 1
    local pid = 0
    if ngx and ngx.worker and ngx.worker.pid then pcall(function() pid = ngx.worker.pid() end) end
    local t = math.floor(now() * 1000)
    return sha_i(t + pid * 7919 + worker_seq * 104729)
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. diccionarios y contadores
-- ═══════════════════════════════════════════════════════════════════════════

local function sdict() return ngx and ngx.shared and ngx.shared[DICT_STATE] or nil end
local function ldict() return ngx and ngx.shared and ngx.shared[DICT_LOCKS] or nil end
local function tdict() return ngx and ngx.shared and ngx.shared[DICT_STATS] or nil end

local function bump(name, n)
    local d = tdict()
    n = n or 1
    if not d then return 0 end
    local v = d:incr(name, n, 0)
    if not v then
        d:set(name, n)
        return n
    end
    return v
end

local function stat(name)
    local d = tdict()
    if not d then return 0 end
    return tonumber(d:get(name)) or 0
end

local function bump_deny(reason)
    bump("deny:" .. tostring(reason))
end

local function set_gauge(name, v)
    local d = tdict()
    if d then d:set(name, v) end
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. registro de sesión (formato v1, sin cjson)
--    "1|gen|state|creator|last|linger|seq|started|caps|fp"
--    Todos los campos son numéricos o [a-z_]/hex → '|' es separador seguro.
-- ═══════════════════════════════════════════════════════════════════════════

local function rec_encode(r)
    return table.concat({
        "1", tostring(r.gen or 0), r.state or "starting", r.creator or "",
        tostring(math.floor(r.last or 0)), tostring(math.floor(r.linger or 0)),
        tostring(math.floor(r.seq or 0)), tostring(math.floor(r.started or 0)),
        tostring(math.floor(r.caps or 0)), r.fp or "",
    }, "|")
end

local function rec_decode(raw)
    if type(raw) ~= "string" then return nil end
    local ver, gen, state, creator, last, linger, seq, started, caps, fp =
        raw:match("^(%d+)|(%d+)|([a-z_]+)|([0-9a-f]*)|(%d+)|(%d+)|(%d+)|(%d+)|(%d+)|([0-9a-f]*)$")
    if not ver or tonumber(ver) ~= 1 then return nil end
    if not VALID_STATE[state] then return nil end
    return {
        gen = tonumber(gen), state = state, creator = creator,
        last = tonumber(last), linger = tonumber(linger),
        seq = tonumber(seq), started = tonumber(started),
        caps = tonumber(caps), fp = fp,
    }
end

local function get_session(key)
    local d = sdict()
    if not d then return nil end
    return rec_decode(d:get(K_SESS .. key))
end

-- ── mapa key → idem (proveedor|canal) ───────────────────────────────────────
-- La URL canónica sólo lleva el hash. El supervisor necesita el idem para
-- resolver el canal; se aprende del alias /mf/src/<proveedor>/<canal>/... o de
-- `ctl op=register` y sobrevive al cierre de la sesión (TTL gen_ttl). Si no se
-- conoce, OPEN va sin idem y el supervisor decide (debe tener su propio mapa
-- persistido y validar allowlist: NUNCA debe abrir URLs arbitrarias).
local function idem_set(key, provider, channel)
    local p, c = normalize_pair(provider, channel)
    if not p then return nil end
    local d = sdict()
    if not d then return nil end
    local idem = p .. "|" .. c
    d:set(K_IDEM .. key, idem, cfgn("gen_ttl"))
    return idem
end

local function idem_get(key)
    local d = sdict()
    if not d then return nil end
    return d:get(K_IDEM .. key)
end

local function put_session(key, rec, ttl)
    local d = sdict()
    if not d then return false, "dict_unavailable" end
    local ok, err = d:set(K_SESS .. key, rec_encode(rec), ttl or cfgn("session_ttl"))
    local t = tdict()
    if ok and t then t:set(K_IDX .. key, 1, ttl or cfgn("session_ttl")) end
    return ok, err
end

local function touch_session(key, rec)
    rec.last = now()
    return put_session(key, rec)
end

local function get_viewers(key)
    local d = sdict()
    if not d then return 0 end
    local n = tonumber(d:get(K_VIEW .. key)) or 0
    if n < 0 then n = 0 end
    return n
end

local function total_viewers()
    -- Contador global mantenido por add/remove y RE-SINCRONIZADO a la cuenta
    -- autoritativa en cada sweep (markers TTL). No se usa el gauge aquí.
    local n = stat("viewers_total")
    if n < 0 then n = 0 end
    return n
end

local function count_active_sessions()
    local t = tdict()
    if not t then return 0 end
    local keys = t:get_keys(0) or {}
    local n = 0
    for i = 1, #keys do
        local k = keys[i]
        if k:sub(1, 5) == K_IDX then
            local key = k:sub(6)
            local rec = get_session(key)
            if rec and rec.state ~= "failed" and rec.state ~= "stopping" then
                n = n + 1
            else
                t:delete(k)
            end
        end
    end
    return n
end

local function list_sessions()
    local t = tdict()
    if not t then return {} end
    local out = {}
    local keys = t:get_keys(0) or {}
    for i = 1, #keys do
        local k = keys[i]
        if k:sub(1, 5) == K_IDX then
            local key = k:sub(6)
            local rec = get_session(key)
            if rec then
                out[#out + 1] = {
                    key = key, gen = rec.gen, state = rec.state,
                    viewers = get_viewers(key), last = rec.last,
                    linger = rec.linger, seq = rec.seq, caps = rec.caps,
                }
            else
                t:delete(k)
            end
        end
    end
    return out
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. cliente del SUPERVISOR (UDS; el coordinador nunca ejecuta FFmpeg)
-- ═══════════════════════════════════════════════════════════════════════════

local function sup_endpoint()
    local ep = cfgs("sup_endpoint", "")
    if ep == "" then ep = os.getenv("MF_SUP_ENDPOINT") or "unix:/run/mediafanout/supervisor.sock" end
    return ep
end

local function parse_sup(resp)
    if type(resp) ~= "string" then return nil, "sup_bad_reply" end
    resp = resp:gsub("[\r\n]+$", "")
    if resp == "PONG" then return { op = "pong" } end
    if resp:sub(1, 2) == "OK" then
        local gen = resp:match("gen=(%d+)")
        local state = resp:match("state=([a-z_]+)")
        local seq = resp:match("seq=(%d+)")
        local caps = resp:match("caps=(%d+)")
        if not gen or not state then return nil, "sup_bad_reply" end
        if not VALID_STATE[state] then return nil, "sup_bad_reply" end
        return {
            op = "ok", gen = tonumber(gen), state = state,
            seq = tonumber(seq or 0), caps = tonumber(caps or 0),
        }
    end
    if resp:sub(1, 3) == "ERR" then
        local code = resp:match("code=([%w_%-]+)") or "unknown"
        return nil, "sup_err:" .. code
    end
    return nil, "sup_bad_reply"
end

local function sup_call(op, key, extra)
    local h = _M._hooks.supervisor
    if h then return h(op, key, extra) end
    if not (ngx and ngx.socket and ngx.socket.tcp) then return nil, "sup_unavailable" end

    local sock = ngx.socket.tcp()
    if not sock then return nil, "sup_unavailable" end
    local timeout = cfgn("sup_timeout_ms") / 1000
    sock:settimeout(timeout)

    local ep = sup_endpoint()
    local ok, err
    if ep:sub(1, 5) == "unix:" then
        ok, err = sock:connect(ep)
    else
        local host, port = ep:match("^(.+):(%d+)$")
        if not host then sock:close(); return nil, "sup_bad_endpoint" end
        ok, err = sock:connect(host, tonumber(port))
    end
    if not ok then
        sock:close()
        bump("supervisor_fail_total")
        log(ngx and ngx.ERR or 3, "supervisor connect failed: " .. tostring(err))
        return nil, "sup_connect_failed"
    end

    local line = op .. " " .. tostring(key) .. (extra and (" " .. tostring(extra)) or "")
    local sent = sock:send(line .. "\n")
    if not sent then sock:close(); bump("supervisor_fail_total"); return nil, "sup_send_failed" end

    local resp = sock:receive("*l")
    sock:close()
    if not resp then bump("supervisor_fail_total"); return nil, "sup_recv_failed" end

    local rep, perr = parse_sup(resp)
    if not rep then bump("supervisor_fail_total") end
    return rep, perr
end

local function sup_open(key, idem)
    -- El idem viaja al supervisor cuando se conoce (alias/register); si no,
    -- OPEN <key> y el supervisor resuelve desde su estado persistido.
    local rep, err = sup_call("OPEN", key, idem)
    if rep and rep.op == "ok" then
        local d = sdict()
        if d then d:set(K_CAPS, rep.caps or 0, cfgn("caps_ttl")) end
        local t = tdict()
        if t then t:set("sup_ok_ts", now(), 60) end
        return rep
    end
    return nil, err or "sup_unavailable"
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. límites y respuestas de error (nunca expulsan a quien ya está dentro)
-- ═══════════════════════════════════════════════════════════════════════════

local function err_body(reason, status)
    -- JSON mínimo a mano: sin cjson, sin datos internos, sin trazas
    local retry = (status == 503) and 1 or 0
    return string.format('{"error":"%s","retry_after":%d}', tostring(reason), retry)
end

local function respond(status, reason)
    ngx.status = status
    ngx.header["Content-Type"] = "application/json"
    ngx.header["Cache-Control"] = "no-store"
    ngx.header["X-MF-Reason"] = tostring(reason)
    if status == 503 then ngx.header["Retry-After"] = "1" end
    ngx.print(err_body(reason, status))
    return ngx.exit(status)
end

local function deny(reason, status)
    bump_deny(reason)
    bump("denied_total")
    log(ngx and ngx.WARN or 4, "deny reason=" .. tostring(reason))
    if ngx and ngx.header then return respond(status or 503, reason) end
    return nil, reason
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. lock single-flight (dict:add + TTL + liberación garantizada)
-- ═══════════════════════════════════════════════════════════════════════════

local function acquire_lock(key)
    local d = ldict()
    if not d then return false, "dict_unavailable" end
    local owner = token()
    local ok, err = d:add(K_SF .. key, owner, cfgn("lock_ttl"))
    if ok then return true, owner end
    return false, err or "locked"
end

local function release_lock(key, owner)
    local d = ldict()
    if not d then return false end
    -- Sólo el dueño borra su lock (ventana de carrera mínima; TTL es el backstop)
    local cur = d:get(K_SF .. key)
    if cur == nil then return true end
    if cur == owner then
        d:delete(K_SF .. key)
        return true
    end
    return false
end

local function lock_owner(key)
    local d = ldict()
    if not d then return nil end
    return d:get(K_SF .. key)
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. espectadores (contador atómico + marca TTL por cliente)
-- ═══════════════════════════════════════════════════════════════════════════

local function add_viewer(key, cid)
    local d = sdict()
    if not d then return nil, "dict_unavailable" end
    cid = tostring(cid or "anon"):gsub("[^%w%-%._]", "")
    if cid == "" then cid = "anon" end
    local mark = K_MARK .. key .. ":" .. cid
    local ttl = cfgn("viewer_ttl")

    -- ya contado: sólo refresca el TTL (idempotente, no infla el contador)
    if d:get(mark) then
        d:expire(mark, ttl)
        return get_viewers(key), true
    end

    -- límites ANTES de entrar: si está lleno se deniega al nuevo, jamás a los vivos
    local cur = get_viewers(key)
    if cur >= cfgn("max_viewers_per_session") then
        return nil, "max_viewers"
    end
    if total_viewers() >= cfgn("max_total_viewers") then
        return nil, "max_total_viewers"
    end

    local ok = d:add(mark, 1, ttl)
    if not ok then
        d:expire(mark, ttl)
        return get_viewers(key), true
    end
    local n = d:incr(K_VIEW .. key, 1, 0, cfgn("session_ttl"))
    if not n then
        d:set(K_VIEW .. key, cur + 1, cfgn("session_ttl"))
        n = cur + 1
    end
    bump("viewers_total")
    bump("viewer_join_total")
    return n, true
end

local function remove_viewer(key, cid)
    local d = sdict()
    if not d then return 0 end
    cid = tostring(cid or "anon"):gsub("[^%w%-%._]", "")
    local mark = K_MARK .. key .. ":" .. cid
    if not d:get(mark) then return get_viewers(key) end
    d:delete(mark)
    local cur = get_viewers(key)
    if cur > 0 then d:incr(K_VIEW .. key, -1, 0, cfgn("session_ttl")) end
    if stat("viewers_total") > 0 then bump("viewers_total", -1) end
    bump("viewer_leave_total")
    local rec = get_session(key)
    if rec and get_viewers(key) == 0 and rec.state == "live" then
        rec.state = "draining"
        rec.linger = now() + cfgn("linger_ttl")
        put_session(key, rec)
        bump("linger_started_total")
    end
    return get_viewers(key)
end

-- refresco de espectador para peticiones de segmento (no crea marcas nuevas)
local function touch_viewer(key, cid)
    local d = sdict()
    if not d then return nil end
    cid = tostring(cid or "anon"):gsub("[^%w%-%._]", "")
    local mark = K_MARK .. key .. ":" .. cid
    if d:get(mark) then d:expire(mark, cfgn("viewer_ttl")) end
    return true
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. cierre de sesión, fencing y sweep (linger TTL)
-- ═══════════════════════════════════════════════════════════════════════════

local function delete_markers(key)
    local d = sdict()
    if not d then return 0 end
    local keys = d:get_keys(0) or {}
    local pre = K_MARK .. key .. ":"
    local n = 0
    for i = 1, #keys do
        local k = keys[i]
        if k:sub(1, #pre) == pre then d:delete(k); n = n + 1 end
    end
    return n
end

local function close_session(key, reason)
    local d = sdict()
    if not d then return false end
    local rec = get_session(key)
    d:delete(K_SESS .. key)
    d:delete(K_VIEW .. key)
    delete_markers(key)
    local t = tdict()
    if t then t:delete(K_IDX .. key) end
    bump("sessions_closed_total")
    bump("close:" .. tostring(reason))
    -- El gen NO se borra: debe sobrevivir para que el fencing sea monótono (I2)
    log(ngx and ngx.INFO or 6, "close key=" .. tostring(key) ..
        " reason=" .. tostring(reason) .. " gen=" .. tostring(rec and rec.gen or "-"))
    return true
end

local function fence_reject(key, got, cur, op)
    bump("fence_rejects_total")
    bump_deny("stale_generation")
    bump("fence:" .. tostring(op))
    log(ngx and ngx.WARN or 4, "fence op=" .. tostring(op) ..
        " key=" .. tostring(key) .. " got=" .. tostring(got) .. " cur=" .. tostring(cur))
    return nil, "stale_generation"
end

local function markers_by_session()
    local d = sdict()
    if not d then return {}, true end
    local keys = d:get_keys(0) or {}
    local truncated = (#keys >= 1024)
    local map = {}
    for i = 1, #keys do
        local k = keys[i]
        if k:sub(1, 2) == K_MARK then
            local rest = k:sub(3)
            local sk = rest:match("^(%x+):")
            if sk then map[sk] = (map[sk] or 0) + 1 end
        end
    end
    return map, truncated
end

function _M.sweep(force)
    local d = sdict()
    if not d then return { ok = false, reason = "dict_unavailable" } end
    if not force then
        local l = ldict()
        if l and not l:add("sweep", 1, cfgn("sweep_interval")) then
            return { ok = true, skipped = true }
        end
    end

    local t = now()
    local map, truncated = markers_by_session()
    local reconcile = (not truncated) or cfgn("max_reap_truncated") ~= 0
    local linger_ttl = cfgn("linger_ttl")
    local linger_max = cfgn("linger_max")
    local spawn_timeout = cfgn("spawn_timeout")

    local keys = d:get_keys(0) or {}
    local active, viewers, gen_max = 0, 0, 0

    for i = 1, #keys do
        local k = keys[i]
        if k:sub(1, 2) == K_SESS then
            local key = k:sub(3)
            local rec = rec_decode(d:get(k))
            if not rec then
                d:delete(k)
            else
                if reconcile then
                    local live = map[key] or 0
                    if get_viewers(key) ~= live then
                        d:set(K_VIEW .. key, live, cfgn("session_ttl"))
                        bump("viewer_reconciled_total")
                    end
                end
                local vw = get_viewers(key)

                if rec.state == "live" and vw == 0 then
                    rec.state = "draining"
                    rec.linger = t + linger_ttl
                    put_session(key, rec)
                    bump("linger_started_total")
                elseif rec.state == "draining" then
                    if vw > 0 then
                        rec.state = "live"
                        rec.linger = 0
                        put_session(key, rec)
                        bump("linger_cancelled_total")
                    elseif rec.linger == 0 then
                        -- DRAINING sin deadline (publicado por el worker): lo fija el sweep
                        rec.linger = t + linger_ttl
                        put_session(key, rec)
                    elseif t >= rec.linger then
                        -- linger vencido (o tope duro) → cerrar caché; el supervisor
                        -- sigue siendo la autoridad real de stop del worker.
                        bump("linger_expired_total")
                        close_session(key, "linger_expired")
                        rec = nil
                    elseif rec.linger > 0 and (t - (rec.linger - linger_ttl)) > linger_max then
                        close_session(key, "linger_max")
                        rec = nil
                    end
                elseif rec.state == "starting" or rec.state == "resolving" then
                    if rec.started > 0 and (t - rec.started) > spawn_timeout then
                        close_session(key, "spawn_stale")
                        rec = nil
                    end
                elseif rec.state == "failed" then
                    close_session(key, "worker_failed")
                    rec = nil
                end

                if rec then
                    active = active + 1
                    viewers = viewers + get_viewers(key)
                    if rec.gen > gen_max then gen_max = rec.gen end
                end
            end
        end
    end

    set_gauge("gauge:sessions_active", active)
    set_gauge("gauge:viewers", viewers)
    set_gauge("gauge:gen_max", gen_max)
    set_gauge("gauge:last_sweep", t)
    -- El contador global de viewers se re-sincroniza con la cuenta autoritativa:
    -- si un cliente desapareció sin DELETE, sus markers caducaron y no debe
    -- seguir consumiendo presupuesto de MAX_TOTAL_VIEWERS.
    set_gauge("viewers_total", viewers)
    return { ok = true, active = active, viewers = viewers, gen_max = gen_max }
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. API de sesión: claim / attach / heartbeat / publish / release
-- ═══════════════════════════════════════════════════════════════════════════

local function attach(key, rec, cid, created)
    local n, err = add_viewer(key, cid)
    if not n then return nil, err end
    if rec.state == "draining" then
        rec.state = "live"
        rec.linger = 0
        bump("linger_cancelled_total")
    end
    touch_session(key, rec)
    return {
        ok = true, key = key, gen = rec.gen, state = rec.state,
        viewers = n, created = created or false, caps = rec.caps,
    }
end

local function wait_for_session(key, cid, deadline, depth)
    local poll = cfgn("poll_ms") / 1000
    while now() < deadline do
        local rec = get_session(key)
        if rec then
            if rec.state == "failed" then return nil, "session_failed" end
            if rec.state ~= "stopping" then return attach(key, rec, cid, false) end
        elseif not lock_owner(key) and depth < 1 then
            -- El dueño del lock murió sin crear sesión → reintento acotado
            return _M.claim(key, nil, cid, depth + 1)
        end
        sleep(poll)
    end
    -- El último sleep puede rebasar el deadline justo cuando el ganador publica:
    -- una comprobación final evita un 503 espurio (nunca bloquear, pero tampoco
    -- rechazar una sesión que ya está lista).
    local rec = get_session(key)
    if rec and rec.state ~= "failed" and rec.state ~= "stopping" then
        return attach(key, rec, cid, false)
    end
    return nil, "spawn_wait_timeout"
end

function _M.claim(key, fp, cid, depth)
    depth = depth or 0
    if not valid_key(key) then return nil, "bad_request" end
    local d = sdict()
    if not d then return nil, "dict_unavailable" end

    _M.sweep(false)

    -- fast path: sesión ya viva → attach (cancela linger si tocaba)
    local rec = get_session(key)
    if rec and rec.state ~= "failed" and rec.state ~= "stopping" then
        if rec.fp ~= "" and fp and fp ~= "" and rec.fp ~= fp then return nil, "key_collision" end
        local res, aerr = attach(key, rec, cid, false)
        if not res then
            bump_deny(aerr)
            bump("denied_total")
            return nil, aerr
        end
        return res
    end

    -- capacidad ANTES de pedir spawn (no expulsa a nadie: sólo rechaza al nuevo)
    if count_active_sessions() >= cfgn("max_sessions") then
        bump_deny("max_sessions")
        bump("denied_total")
        return nil, "max_sessions"
    end

    local got, owner = acquire_lock(key)
    if not got then
        bump("lock_contention_total")
        if owner == "dict_unavailable" then return nil, "dict_unavailable" end
        local deadline = now() + cfgn("spawn_wait_ms") / 1000
        return wait_for_session(key, cid, deadline, depth)
    end

    -- doble comprobación bajo lock (otro worker pudo crear la sesión)
    rec = get_session(key)
    if rec and rec.state ~= "failed" and rec.state ~= "stopping" then
        release_lock(key, owner)
        return attach(key, rec, cid, false)
    end
    if count_active_sessions() >= cfgn("max_sessions") then
        release_lock(key, owner)
        bump_deny("max_sessions")
        bump("denied_total")
        return nil, "max_sessions"
    end

    -- El supervisor es la autoridad: OPEN idempotente, timeout acotado.
    local rep, serr = sup_open(key, idem_get(key))
    if not rep then
        release_lock(key, owner)
        bump("sessions_failed_total")
        bump_deny("supervisor_unavailable")
        bump("denied_total")
        log(ngx and ngx.ERR or 3, "spawn failed key=" .. tostring(key) .. " err=" .. tostring(serr))
        return nil, "supervisor_unavailable"
    end
    if not rep.gen or rep.gen <= 0 then
        release_lock(key, owner)
        bump("sessions_failed_total")
        bump_deny("supervisor_bad_reply")
        bump("denied_total")
        return nil, "supervisor_bad_reply"
    end

    -- el gen NUNCA retrocede, aunque el supervisor se reinicie (I2)
    local prev = tonumber(d:get(K_GEN .. key)) or 0
    local gen = rep.gen
    if gen < prev then
        log(ngx and ngx.WARN or 4, "gen regression key=" .. tostring(key) ..
            " supervisor=" .. tostring(gen) .. " dict=" .. tostring(prev))
        gen = prev
    end
    d:set(K_GEN .. key, gen, cfgn("gen_ttl"))

    local t = now()
    local newrec = {
        gen = gen, state = rep.state or "starting", creator = owner,
        last = t, linger = 0, seq = rep.seq or 0, started = t,
        caps = rep.caps or 0, fp = fp or "",
    }
    put_session(key, newrec)
    bump("sessions_started_total")
    bump("spawn_total")
    release_lock(key, owner)   -- liberación garantizada en el camino feliz

    local res, aerr = attach(key, newrec, cid, true)
    if not res then
        -- límite de espectadores con sesión recién creada: la sesión queda viva
        -- para el resto; el rechazo es sólo para este cliente.
        bump_deny(aerr)
        bump("denied_total")
        return nil, aerr
    end
    return res
end

function _M.heartbeat(key, gen)
    if not valid_key(key) then return nil, "bad_request" end
    local rec = get_session(key)
    if not rec then
        bump("heartbeat_after_close_total")
        return nil, "no_session"
    end
    gen = tonumber(gen) or -1
    if gen ~= rec.gen then return fence_reject(key, gen, rec.gen, "heartbeat") end
    touch_session(key, rec)
    local d = sdict()
    if d then d:set(K_GEN .. key, rec.gen, cfgn("gen_ttl")) end
    bump("heartbeat_total")
    return {
        ok = true, key = key, gen = rec.gen, state = rec.state,
        viewers = get_viewers(key), seq = rec.seq,
    }
end

function _M.publish(key, gen, state, seq, caps)
    if not valid_key(key) then return nil, "bad_request" end
    local rec = get_session(key)
    gen = tonumber(gen) or -1
    if not rec then
        bump("publish_after_close_total")
        bump_deny("no_session")
        return nil, "no_session"
    end
    if gen ~= rec.gen then return fence_reject(key, gen, rec.gen, "publish") end
    if state ~= nil and state ~= "" then
        if not VALID_STATE[state] then
            bump_deny("bad_state")
            return nil, "bad_state"
        end
        rec.state = state
    end
    if seq ~= nil and seq ~= "" then
        seq = tonumber(seq)
        if not seq or seq < 0 then
            bump_deny("bad_request")
            return nil, "bad_request"
        end
        if seq < rec.seq then
            bump("seq_regression_total")
            bump_deny("seq_regression")
            log(ngx and ngx.WARN or 4, "seq regression key=" .. tostring(key) ..
                " got=" .. tostring(seq) .. " cur=" .. tostring(rec.seq))
            return nil, "seq_regression"
        end
        rec.seq = seq
    end
    if caps ~= nil and caps ~= "" then rec.caps = tonumber(caps) or rec.caps end
    rec.last = now()
    put_session(key, rec)
    local d = sdict()
    if d then d:set(K_GEN .. key, rec.gen, cfgn("gen_ttl")) end
    bump("publish_total")
    return {
        ok = true, key = key, gen = rec.gen, state = rec.state,
        seq = rec.seq, viewers = get_viewers(key),
    }
end

function _M.release(key, gen)
    if not valid_key(key) then return nil, "bad_request" end
    local rec = get_session(key)
    gen = tonumber(gen) or -1
    if not rec then
        -- idempotente: el worker puede liberar dos veces tras un crash
        return { ok = true, closed = false, gen = gen }
    end
    if gen ~= rec.gen then return fence_reject(key, gen, rec.gen, "release") end
    close_session(key, "released")
    return { ok = true, closed = true, gen = gen }
end

-- ── op=seed (t10): pre-registro de sesión+gen por el SUPERVISOR ─────────────
-- Crea el registro {key, gen, state=seed} SIN disparar OPEN ni spawn y SIN
-- contar espectador (el supervisor es el único que decide el gen y luego
-- relaya publish starting/live/heartbeat/close).
-- Reglas:
--   * mismo gen que la sesión actual → OK idempotente (no toca gen/viewers)
--   * gen MENOR que la sesión (o que el gen persistido) → stale_generation
--   * gen MAYOR que la sesión viva → gen_mismatch (el gen lo manda el supervisor)
--   * sin sesión: se acepta gen >= gen persistido (primer seed tras cierre)
--   * la sesión sin viewers caduca por el TTL normal de sesión (180 s)
function _M.seed(key, gen, provider, channel)
    if not valid_key(key) then return nil, "bad_request" end
    gen = tonumber(gen)
    if not gen or gen <= 0 or gen ~= math.floor(gen) then return nil, "bad_request" end

    -- El seed también aprenda el idem para que OPEN pueda resolverlo después.
    if (provider and provider ~= "") or (channel and channel ~= "") then
        if not provider or provider == "" or not channel or channel == "" then
            return nil, "bad_request"
        end
        if not idem_set(key, provider, channel) then return nil, "bad_request" end
    end

    local d = sdict()
    if not d then return nil, "dict_unavailable" end

    local rec = get_session(key)
    if rec then
        if gen == rec.gen then
            return { ok = true, key = key, gen = rec.gen, state = rec.state, created = false }
        elseif gen < rec.gen then
            return fence_reject(key, gen, rec.gen, "seed")
        else
            bump("seed_gen_mismatch_total")
            bump_deny("gen_mismatch")
            log(ngx and ngx.WARN or 4, "seed gen_mismatch key=" .. tostring(key) ..
                " got=" .. tostring(gen) .. " cur=" .. tostring(rec.gen))
            return nil, "gen_mismatch"
        end
    end

    local persisted = tonumber(d:get(K_GEN .. key)) or 0
    if gen < persisted then
        bump("seed_stale_total")
        bump_deny("stale_generation")
        return nil, "stale_generation"
    end

    local t = now()
    local newrec = {
        gen = gen, state = "seed", creator = token(),
        last = t, linger = 0, seq = 0, started = t, caps = 0, fp = "",
    }
    d:set(K_GEN .. key, gen, cfgn("gen_ttl"))
    put_session(key, newrec)   -- TTL normal; sin viewers NO se crea marca
    bump("seed_total")
    return { ok = true, key = key, gen = gen, state = "seed", created = true }
end

function _M.touch(key, cid)
    if not valid_key(key) then return nil, "bad_request" end
    local rec = get_session(key)
    if not rec then return nil, "no_session" end
    touch_viewer(key, cid)
    touch_session(key, rec)
    return rec, get_viewers(key)
end

-- API pública: registra el idem (proveedor|canal) de una clave ya emitida.
-- La usa el plano de control (op=register) y el alias /mf/src. Devuelve la key.
function _M.register(provider, channel, key)
    if not provider or not channel then return nil, "bad_request" end
    if not key then
        key = key_of(provider, channel)
        if not key then return nil, "bad_request" end
    end
    if not valid_key(key) then return nil, "bad_key" end
    if not idem_set(key, provider, channel) then return nil, "bad_request" end
    return key
end

-- API pública de espectadores (la usa el plano de control y los tests)
function _M.add_viewer(key, cid)
    if not valid_key(key) then return nil, "bad_request" end
    if not get_session(key) then return nil, "no_session" end
    return add_viewer(key, cid)
end

function _M.remove_viewer(key, cid)
    if not valid_key(key) then return nil, "bad_request" end
    return remove_viewer(key, cid)
end

function _M.get_session(key) return get_session(key) end
function _M.get_viewers(key) return get_viewers(key) end
function _M.current_gen(key)
    local d = sdict()
    if not d then return 0 end
    local rec = get_session(key)
    if rec then return rec.gen end
    return tonumber(d:get(K_GEN .. key)) or 0
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. gate del perfil 4K (opcional, SIEMPRE gated; misma ingesta)
-- ═══════════════════════════════════════════════════════════════════════════

local function caps_now()
    local d = sdict()
    if not d then return 0 end
    return tonumber(d:get(K_CAPS)) or 0
end

-- Devuelve true si el perfil 4K puede servirse; si no, motivo.
-- caps: 1 = gpu ok y encode ≥1.5x · 2 = gpu no · 3 = gpu ok pero <1.5x
function _M.gate_4k(device_h)
    local caps = caps_now()
    if caps == 2 or caps == 0 then return false, "gpu_unavailable" end
    if caps == 3 then return false, "encode_slow" end
    local h = tonumber(device_h) or 0
    if h < 2160 then return false, "device_unsupported" end
    return true, "ok"
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. métricas y health (sin hosts internos, sin credenciales, sin rutas)
-- ═══════════════════════════════════════════════════════════════════════════

local function sanitize_token(s)
    s = tostring(s or ""):gsub("[^%w%-%._]", "")
    if #s > 64 then s = s:sub(1, 64) end
    return s
end

function _M.metrics_text()
    _M.sweep(true)
    local lines = {}
    local function gauge(name, value, help)
        lines[#lines + 1] = "# HELP " .. name .. " " .. help
        lines[#lines + 1] = "# TYPE " .. name .. " gauge"
        lines[#lines + 1] = name .. " " .. tostring(math.floor(tonumber(value) or 0))
    end
    local function counter(name, value, help)
        lines[#lines + 1] = "# HELP " .. name .. " " .. help
        lines[#lines + 1] = "# TYPE " .. name .. " counter"
        lines[#lines + 1] = name .. " " .. tostring(math.floor(tonumber(value) or 0))
    end

    local sessions = list_sessions()
    gauge("mf_sessions_active", stat("gauge:sessions_active"),
        "Sesiones activas (una ingesta upstream por sesion)")
    gauge("mf_upstream_connections", stat("gauge:sessions_active"),
        "Conexiones upstream esperadas (= sesiones; el supervisor lo verifica)")
    gauge("mf_viewers", stat("gauge:viewers"), "Espectadores activos")
    gauge("mf_generation_max", stat("gauge:gen_max"), "Generacion maxima viva")
    gauge("mf_dict_ok", sdict() and 1 or 0, "Shared dict disponible")
    counter("mf_sessions_started_total", stat("sessions_started_total"), "Sesiones creadas")
    counter("mf_sessions_closed_total", stat("sessions_closed_total"), "Sesiones cerradas")
    counter("mf_sessions_failed_total", stat("sessions_failed_total"), "Spawns fallidos")
    counter("mf_spawn_total", stat("spawn_total"), "OPEN al supervisor")
    counter("mf_seed_total", stat("seed_total"), "Pre-registros del supervisor (op=seed)")
    counter("mf_seed_gen_mismatch_total", stat("seed_gen_mismatch_total"), "Seeds con gen mayor que la sesion")
    counter("mf_fence_rejects_total", stat("fence_rejects_total"), "Escrituras con gen viejo rechazadas")
    counter("mf_seq_regression_total", stat("seq_regression_total"), "Publicaciones con seq regresiva")
    counter("mf_jump_to_live_total", stat("jump_to_live_total"), "Clientes desviados al live")
    counter("mf_segments_served_total", stat("segments_served_total"), "Segmentos servidos")
    counter("mf_viewer_join_total", stat("viewer_join_total"), "Altas de espectador")
    counter("mf_viewer_leave_total", stat("viewer_leave_total"), "Bajas de espectador")
    counter("mf_linger_started_total", stat("linger_started_total"), "Linger iniciado")
    counter("mf_linger_expired_total", stat("linger_expired_total"), "Linger vencido")
    counter("mf_supervisor_fail_total", stat("supervisor_fail_total"), "Fallos de supervisor")
    counter("mf_lock_contention_total", stat("lock_contention_total"), "Esperas de single-flight")
    counter("mf_denied_total", stat("denied_total"), "Peticiones denegadas")

    lines[#lines + 1] = "# HELP mf_denied_by_reason_total Denegaciones por motivo"
    lines[#lines + 1] = "# TYPE mf_denied_by_reason_total counter"
    for i = 1, #STATIC_REASONS do
        local r = STATIC_REASONS[i]
        lines[#lines + 1] = string.format('mf_denied_by_reason_total{reason="%s"} %d',
            r, math.floor(stat("deny:" .. r)))
    end

    lines[#lines + 1] = "# HELP mf_session_viewers Espectadores por sesion (key = hash)"
    lines[#lines + 1] = "# TYPE mf_session_viewers gauge"
    lines[#lines + 1] = "# HELP mf_session_generation Generacion por sesion (key = hash)"
    lines[#lines + 1] = "# TYPE mf_session_generation gauge"
    for i = 1, #sessions do
        local s = sessions[i]
        local k = sanitize_token(s.key)
        if #k == 16 and k:match("^%x+$") then
            lines[#lines + 1] = string.format('mf_session_viewers{key="%s"} %d', k, math.floor(s.viewers or 0))
            lines[#lines + 1] = string.format('mf_session_generation{key="%s"} %d', k, math.floor(s.gen or 0))
        end
    end
    return table.concat(lines, "\n") .. "\n"
end

local function sup_health()
    local t = tdict()
    local ts = t and tonumber(t:get("sup_ok_ts")) or nil
    if ts and (now() - ts) < 5 then return "up" end
    if not (ngx and ngx.socket and ngx.socket.tcp) and not _M._hooks.supervisor then
        return "unknown"
    end
    local rep = sup_call("PING", "-")
    if rep and rep.op == "pong" then
        if t then t:set("sup_ok_ts", now(), 60) end
        return "up"
    end
    return "down"
end

function _M.health_json()
    _M.sweep(false)
    -- Cuenta fresca desde el índice de sesiones (no depende del gauge del sweep,
    -- que puede estar hasta sweep_interval segundos atrasado).
    local sessions = list_sessions()
    local active, viewers, gens = #sessions, 0, 0
    for i = 1, #sessions do
        viewers = viewers + (sessions[i].viewers or 0)
        if (sessions[i].gen or 0) > gens then gens = sessions[i].gen end
    end
    local sup = sup_health()
    local dict_ok = sdict() ~= nil
    local status = "ok"
    if not dict_ok then
        status = "down"
    elseif active > 0 and sup ~= "up" then
        status = "degraded"
    end
    local body = string.format(
        '{"status":"%s","version":"%s","ts":%d,'
        .. '"sessions_active":%d,"sessions_max":%d,"viewers":%d,'
        .. '"viewers_max_per_session":%d,"generation_max":%d,'
        .. '"fence_rejects":%d,"denied_total":%d,'
        .. '"linger_ttl_s":%d,"supervisor":"%s","dict":"%s"}',
        status, _M._VERSION, math.floor(now()),
        math.floor(active), math.floor(cfgn("max_sessions")),
        math.floor(viewers), math.floor(cfgn("max_viewers_per_session")),
        math.floor(gens), math.floor(stat("fence_rejects_total")),
        math.floor(stat("denied_total")), math.floor(cfgn("linger_ttl")),
        sup, dict_ok and "ok" or "unavailable")
    return body, status
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. router de sesión (manifests y segmentos)
-- ═══════════════════════════════════════════════════════════════════════════

local function client_id()
    local hdr = ngx and ngx.var and ngx.var.http_x_mf_client
    if type(hdr) == "string" and hdr:match("^[%w%-%._]+$") and #hdr >= 1 and #hdr <= 64 then
        return hdr:lower()
    end
    local ck = ngx and ngx.var and ngx.var.cookie_mf_cid
    if type(ck) == "string" and ck:match("^%x+$") and #ck >= 6 then return ck end
    local ra = tostring(ngx and ngx.var and ngx.var.remote_addr or "")
    local ua = tostring(ngx and ngx.var and ngx.var.http_user_agent or "")
    return sha_i(hash_lane(ra .. "\0" .. ua, 5381, 33))
end

local function set_window_vars(key, gen, jump)
    if not (ngx and ngx.var) then return end
    pcall(function()
        ngx.var.mf_key = key or ""
        ngx.var.mf_gen = tostring(gen or "")
        ngx.var.mf_jump = jump and "1" or ""
    end)
end

local function jump_live(key, why)
    bump("jump_to_live_total")
    if why then bump("jump:" .. tostring(why)) end
    if not (ngx and ngx.header) then return nil, "stale_generation" end
    ngx.header["Location"] = "/mf/" .. key .. "/live.m3u8"
    ngx.header["X-MF-Jump-To-Live"] = "1"
    ngx.header["Cache-Control"] = "no-store"
    ngx.header["Content-Type"] = "application/json"
    ngx.status = 302
    ngx.print('{"jump":"live"}')
    return ngx.exit(302)
end

local function serve_window(key, gen, rel)
    -- rel ya validado: sin "..", sin "/" inicial, extensión whitelisted
    local uri = "/_mfwin/" .. key .. "/" .. tostring(gen) .. "/" .. rel
    set_window_vars(key, gen, false)
    return ngx.exec(uri)
end

-- O2 (t14): ENTRADA DE PLAYER. El worker escribe la playlist con URIs relativas
-- (segNNNNN.ts) porque su directorio de trabajo es el de la generación. Un
-- player que entra por /mf/<key>/live.m3u8 NO conoce <gen>, así que se reescribe
-- cada URI a absoluta /mf/<key>/<gen>/<file> (y los atributos URI="..." de
-- EXT-X-MAP/KEY/PART). Comentarios y cabeceras quedan intactos.
local function abs_playlist(body, prefix)
    local out = {}
    for raw in (tostring(body) .. "\n"):gmatch("([^\n]*)\n") do
        local line = raw:gsub("\r$", "")
        if line == "" or line:sub(1, 1) == "#" then
            if line:find('URI="', 1, true) then
                line = line:gsub('URI="([^"]+)"', function(u)
                    if u:match("^%a[%w+.-]*://") or u:sub(1, 1) == "/" then
                        return 'URI="' .. u .. '"'
                    end
                    u = u:gsub("^%./", "")
                    return 'URI="' .. prefix .. u .. '"'
                end)
            end
            out[#out + 1] = line
        else
            local u = line:gsub("^%s+", ""):gsub("%s+$", "")
            if u:match("^%a[%w+.-]*://") or u:sub(1, 1) == "/" then
                out[#out + 1] = u
            else
                u = u:gsub("^%./", "")
                out[#out + 1] = prefix .. u
            end
        end
    end
    return table.concat(out, "\n") .. "\n"
end

-- Sirve la playlist de la sesión vigente con URIs absolutas y cabeceras O2.
-- Si el manifest aún no existe (arranque) o el gen cambió: 503 con
-- Retry-After: 1 (nunca 500).
local function serve_player_playlist(key, gen, fourk)
    local gen_s = tostring(gen)
    local root = tostring((ngx.var and ngx.var.mf_window_root) or ""):gsub("/+$", "")
    local prefix = fourk and ("/mf/" .. key .. "/" .. gen_s .. "/4k/")
        or ("/mf/" .. key .. "/" .. gen_s .. "/")
    local dirgen = fourk and ("4k/" .. gen_s) or gen_s
    -- Fichero pequeño en tmpfs: lectura directa (sin subrequest interno, que
    -- en ngx_lua puede dejar la request en estado no-activo). Root validado.
    if root == "" or root:sub(1, 1) ~= "/" or root:find("%.%.") then
        bump_deny("manifest_not_ready")
        bump("denied_total")
        return respond(503, "manifest_not_ready")
    end
    local path = root .. "/" .. key .. "/" .. dirgen .. "/index.m3u8"
    local f = io.open(path, "r")
    if not f then
        bump_deny("manifest_not_ready")
        bump("denied_total")
        return respond(503, "manifest_not_ready")
    end
    local raw = f:read("*a"); f:close()
    if not raw or raw == "" then
        bump_deny("manifest_not_ready")
        bump("denied_total")
        return respond(503, "manifest_not_ready")
    end
    local body = abs_playlist(raw, prefix)
    ngx.header["Content-Type"] = "application/vnd.apple.mpegurl"
    ngx.header["Cache-Control"] = "no-store"
    ngx.header["X-MF-Gen"] = gen_s
    ngx.header["X-MF-Key"] = key
    ngx.header["X-MF-Playlist"] = "absolute"
    ngx.header["Content-Length"] = nil
    ngx.print(body)
    return ngx.exit(200)
end

local function parse_rel(rest)
    -- devuelve: relativo dentro del dir de sesión, es_playlist, perfil_4k
    local fourk = false
    if rest:sub(1, 3) == "4k/" then
        fourk = true
        rest = rest:sub(4)
    end
    if rest == "" then return nil, false, fourk end

    if rest == "live.m3u8" or rest == "playlist.m3u8" or rest == "index.m3u8" then
        return "index.m3u8", true, fourk
    end
    -- segmento: nombre simple, extensión de media, sin traversal.
    -- (Lua no tiene alternancia en patterns: se compara la extensión aparte.)
    if not rest:match("^[%w%-%._]+$") or rest:find("%.%.") then return nil, false, fourk end
    local ext = rest:match("%.([%w]+)$")
    local ok_ext = ext and (ext == "ts" or ext == "m4s" or ext == "mp4" or ext == "aac"
        or ext == "m4v" or ext == "cmfv" or ext == "m4a")
    if not ok_ext then return nil, false, fourk end
    return rest, false, fourk
end

function _M.serve_handler()
    local uri = (ngx and ngx.var and ngx.var.uri) or ""

    -- alias legible proveedor/canal → forma canónica por hash (302, no expone el host)
    local prov, chan = uri:match("^/mf/src/([^/]+)/([^/]+)/live%.m3u8$")
    if not prov then prov, chan = uri:match("^/mf/src/([^/]+)/([^/]+)/playlist%.m3u8$") end
    if not prov then prov, chan = uri:match("^/mf/src/([^/]+)/([^/]+)/index%.m3u8$") end
    if prov and chan then
        local key = key_of(prov, chan)
        if not key then return respond(400, "bad_request") end
        -- aprende el idem para que el OPEN al supervisor pueda resolver el canal
        local idem = idem_set(key, prov, chan)
        local loc = "/mf/" .. key .. "/live.m3u8"
        -- Conserva query (p.ej. profile=4k) sólo si es un charset seguro:
        -- nunca se reenvía CR/LF ni nada que pueda partir la cabecera Location.
        local args = ngx.var.args
        if type(args) == "string" and args ~= "" and #args <= 256
                and args:match("^[%w%-%._%%&=,]+$") then
            loc = loc .. "?" .. args
        end
        ngx.header["Location"] = loc
        ngx.header["Cache-Control"] = "no-store"
        ngx.header["X-MF-Idem"] = idem and "registered" or "unknown"
        ngx.status = 302
        ngx.print('{"redirect":"canonical"}')
        return ngx.exit(302)
    end

    local key, gen, rest = uri:match("^/mf/(%x+)/(%d+)/(.+)$")
    if not key then key, rest = uri:match("^/mf/(%x+)/(.+)$") end
    if not valid_key(key) or not rest then return respond(400, "bad_route") end

    local rel, is_playlist, fourk = parse_rel(rest)
    if not rel then return respond(400, "bad_route") end

    local profile = tostring((ngx.var.arg_profile or ngx.var.arg_p) or "orig"):lower()
    if profile == "4k" then fourk = true end

    local cid = client_id()

    if is_playlist then
        -- gate 4K: perfil opcional, hardware medido, cliente declara 2160 (W1 §6.9)
        if fourk then
            local ok4k, why = _M.gate_4k(ngx.var.arg_h)
            if not ok4k then
                bump("4k_gate_total")
                bump_deny(why)
                return respond(412, why)
            end
        end
        -- fencing de lectura: un gen viejo nunca se sirve; se desvía al live
        if gen then
            local rec = get_session(key)
            if not rec or tonumber(gen) ~= rec.gen then
                return jump_live(key, rec and "gen_mismatch" or "session_closed")
            end
        end
        local res, reason = _M.claim(key, nil, cid)
        if not res then
            -- claim() ya contabilizó el motivo y denied_total: no duplicar
            return respond(503, reason)
        end
        gen = res.gen
        -- espera acotada a que el worker publique LIVE (nunca bloqueo indefinido)
        if res.state ~= "live" then
            local deadline = now() + cfgn("manifest_wait_ms") / 1000
            while now() < deadline do
                local rec = get_session(key)
                if rec and rec.gen == gen and rec.state == "live" then
                    res.state = "live"
                    break
                end
                if rec and rec.gen ~= gen then
                    return jump_live(key, "gen_changed")
                end
                sleep(cfgn("poll_ms") / 1000)
            end
            if res.state ~= "live" then
                bump_deny("manifest_not_ready")
                bump("denied_total")
                return respond(503, "manifest_not_ready")
            end
        end
        -- O2: el player entra sin conocer la generación → playlist absoluta.
        return serve_player_playlist(key, gen, fourk)
    end

    -- ── segmento ─────────────────────────────────────────────────────────────
    -- El path DEBE llevar generación (fencing I4): servir el gen actual a una
    -- URL sin gen permitiría mezclar secuencias tras un respawn.
    if not gen then return jump_live(key, "no_gen") end
    local rec = get_session(key)
    if not rec then return jump_live(key, "session_closed") end
    if tonumber(gen) ~= rec.gen then return jump_live(key, "gen_mismatch") end
    gen = rec.gen
    touch_viewer(key, cid)
    bump("segments_served_total")
    local dirgen = fourk and ("4k/" .. tostring(gen)) or tostring(gen)
    return serve_window(key, dirgen, rel)
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. endpoints de salud, métricas y control
-- ═══════════════════════════════════════════════════════════════════════════

local function is_loopback()
    local ra = tostring(ngx and ngx.var and ngx.var.remote_addr or "")
    return ra == "127.0.0.1" or ra == "::1"
end

local function ctl_authorized()
    if not is_loopback() then return false end
    local expected = os.getenv("MF_CTL_TOKEN")
    if not expected or expected == "" then return true end
    local h = {}
    pcall(function() h = ngx.req.get_headers() end)
    return tostring(h["x-mf-ctl"] or "") == expected
end

function _M.health_handler()
    local body, status = _M.health_json()
    ngx.status = (status == "down") and 503 or 200
    ngx.header["Content-Type"] = "application/json"
    ngx.header["Cache-Control"] = "no-store"
    ngx.print(body)
    return ngx.exit(ngx.status)
end

function _M.metrics_handler()
    if not is_loopback() then return respond(403, "ctl_forbidden") end
    ngx.header["Content-Type"] = "text/plain; version=0.0.4; charset=utf-8"
    ngx.header["Cache-Control"] = "no-store"
    ngx.print(_M.metrics_text())
    return ngx.exit(200)
end

local function get_args()
    local a = {}
    pcall(function() a = ngx.req.get_uri_args() or {} end)
    return a
end

local function _reply(status, text)
    ngx.status = status
    ngx.header["Content-Type"] = "text/plain; charset=utf-8"
    ngx.header["Cache-Control"] = "no-store"
    ngx.print(text .. "\n")
    return ngx.exit(status)
end

function _M.ctl_handler()
    if not ctl_authorized() then return respond(403, "ctl_forbidden") end
    local a = get_args()
    local op = tostring(a.op or "")
    if op == "" then
        local tail = tostring(ngx.var.uri or ""):match("^/mf/ctl/([%w_]+)$")
        op = tail or "stats"
    end
    local key = tostring(a.key or "")

    if op == "sweep" then
        local r = _M.sweep(true)
        return _reply(200, string.format("ok active=%d viewers=%d gen_max=%d",
            r.active or 0, r.viewers or 0, r.gen_max or 0))
    elseif op == "stats" then
        local body = _M.health_json()
        ngx.header["Content-Type"] = "application/json"
        ngx.header["Cache-Control"] = "no-store"
        ngx.print(body)
        return ngx.exit(200)
    elseif op == "claim" then
        local res, reason = _M.claim(key, tostring(a.fp or ""), tostring(a.cid or "ctl"),
            tonumber(a.gate) or 0)
        if not res then return _reply(503, "err " .. tostring(reason)) end
        return _reply(200, string.format("ok gen=%d state=%s viewers=%d created=%s",
            res.gen, res.state, res.viewers, tostring(res.created)))
    elseif op == "heartbeat" then
        local res, reason = _M.heartbeat(key, a.gen)
        if not res then return _reply(409, "err " .. tostring(reason)) end
        return _reply(200, string.format("ok gen=%d state=%s seq=%d viewers=%d",
            res.gen, res.state, res.seq, res.viewers))
    elseif op == "publish" then
        local res, reason = _M.publish(key, a.gen, a.state, a.seq, a.caps)
        if not res then return _reply(409, "err " .. tostring(reason)) end
        return _reply(200, string.format("ok gen=%d state=%s seq=%d viewers=%d",
            res.gen, res.state, res.seq, res.viewers))
    elseif op == "seed" then
        -- Pre-registro del SUPERVISOR (t10): sin OPEN, sin spawn, sin viewer.
        local res, reason = _M.seed(key, a.gen, a.provider, a.channel)
        if not res then
            if reason == "stale_generation" or reason == "gen_mismatch" then
                return _reply(409, "err " .. tostring(reason))
            end
            return _reply(400, "err " .. tostring(reason))
        end
        return _reply(200, string.format("ok key=%s gen=%d state=%s created=%s",
            key, res.gen, res.state, tostring(res.created)))
    elseif op == "release" then
        local res, reason = _M.release(key, a.gen)
        if not res then return _reply(409, "err " .. tostring(reason)) end
        return _reply(200, string.format("ok closed=%s gen=%d", tostring(res.closed), res.gen))
    elseif op == "leave" then
        local left = remove_viewer(key, tostring(a.cid or "ctl"))
        return _reply(200, string.format("ok viewers=%d", left))
    elseif op == "inspect" then
        -- Diagnóstico de staging (sólo loopback): estado de la sesión por su
        -- hash. No devuelve proveedor, host, ruta ni credencial alguna.
        local rec = get_session(key)
        if not rec then return _reply(404, "err no_session") end
        return _reply(200, string.format(
            "ok gen=%d state=%s linger=%.3f last=%.3f started=%.3f seq=%d viewers=%d now=%.3f caps=%d",
            rec.gen, rec.state, rec.linger, rec.last, rec.started, rec.seq,
            get_viewers(key), now(), rec.caps))
    elseif op == "register" then
        -- Alta del mapa key → proveedor|canal (idempotente). Sólo loopback.
        local k, err = _M.register(a.provider, a.channel, a.key ~= "" and a.key or nil)
        if not k then return _reply(400, "err " .. tostring(err)) end
        return _reply(200, "ok key=" .. k)
    end
    return respond(400, "bad_request")
end

-- ── timer de mantenimiento (linger/reconciliación) — perezoso y con guard ───
local function tick(premature)
    if premature then return end
    local ok, err = pcall(function() _M.sweep(true) end)
    if not ok then log(ngx and ngx.ERR or 3, "sweep timer: " .. tostring(err)) end
end

function _M.ensure_timer()
    local l = ldict()
    if not l then return false end
    -- Guard POR WORKER y SIN expiración: ngx.timer.every vive en el worker. Con
    -- un TTL global, al expirar se armaba un timer nuevo cada hora (fuga), y si
    -- el worker dueño moría nadie más barría. Con clave por pid, cada worker
    -- arma exactamente uno; si el pid cambia, el nuevo worker arma el suyo.
    local pid = 0
    if ngx and ngx.worker and ngx.worker.pid then pcall(function() pid = ngx.worker.pid() end) end
    local guard = "timer:armed:" .. tostring(pid)
    if not l:add(guard, 1, 0) then return true end
    if not (ngx and ngx.timer and ngx.timer.every) then return false end
    local ok, err = ngx.timer.every(cfgn("sweep_interval"), tick)
    if not ok then
        l:delete(guard)   -- permite reintentar en una petición posterior
        log(ngx and ngx.ERR or 3, "timer.every: " .. tostring(err))
        return false
    end
    return true
end

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. dispatcher (sólo cuando nginx ejecuta el fichero como handler)
--     mf_handler=1 lo pone media-fanout.conf. Al hacer require desde otro
--     módulo o desde el harness de test, mf_handler es nil y NO se despacha.
-- ═══════════════════════════════════════════════════════════════════════════

function _M.dispatch()
    pcall(function() _M.ensure_timer() end)
    local uri = (ngx and ngx.var and ngx.var.uri) or ""
    if uri == "/mf/health" then return _M.health_handler() end
    if uri == "/mf/metrics" then return _M.metrics_handler() end
    if uri == "/mf/ctl" or uri == "/mf/ctl/" or uri:match("^/mf/ctl/[%w_]+$") then
        return _M.ctl_handler()
    end
    return _M.serve_handler()
end

-- hooks de introspección para el harness de staging (no son API pública)
_M._internals = {
    key_of = key_of, fp_of = fp_of,
    rec_encode = rec_encode, rec_decode = rec_decode,
    get_session = get_session, put_session = put_session,
    close_session = close_session, fence_reject = fence_reject,
    count_active_sessions = count_active_sessions, list_sessions = list_sessions,
    add_viewer = add_viewer, remove_viewer = remove_viewer,
    markers_by_session = markers_by_session, total_viewers = total_viewers,
    client_id = client_id, parse_rel = parse_rel, sha_i = sha_i,
    abs_playlist = abs_playlist, serve_player_playlist = serve_player_playlist,
    hash_lane = hash_lane, delete_markers = delete_markers,
    idem_set = idem_set, idem_get = idem_get,
    bump = bump, stat = stat, worker_token = token,
}

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. AUTOTEST DETERMINISTA  (`lua ape_session.lua --selftest`)
--     Lua 5.1 puro; sin require de resty; sin nginx; sin red. Emula
--     ngx.shared.DICT con TTL sobre un reloj virtual y el supervisor con un
--     hook. Asevera: dict:add single-flight, rechazo de generación vieja,
--     linger 25 s y límites. Exit 0 SÓLO si todas las aserciones pasan.
-- ═══════════════════════════════════════════════════════════════════════════

function _M.run_selftest()
    local ST = { clock = 1000, pass = 0, fail = 0, opens = 0 }
    local function ok(name, cond, detail)
        if cond then
            ST.pass = ST.pass + 1
            print("SELFTEST PASS " .. name)
        else
            ST.fail = ST.fail + 1
            print("SELFTEST FAIL " .. name .. (detail and (" :: " .. tostring(detail)) or ""))
        end
        return cond
    end
    local function eq(name, a, b)
        return ok(name, a == b, "got=" .. tostring(a) .. " want=" .. tostring(b))
    end

    -- dict falso con TTL sobre el reloj virtual del test
    local function new_dict()
        local store, exp = {}, {}
        local d = {}
        local function purge(k)
            if exp[k] and exp[k] <= ST.clock then store[k], exp[k] = nil, nil end
        end
        function d:get(k) purge(k); return store[k] end
        function d:set(k, v, t)
            purge(k)
            store[k] = v
            exp[k] = (t and t > 0) and (ST.clock + t) or nil
            return true
        end
        function d:add(k, v, t)
            purge(k)
            if store[k] ~= nil then return nil, "exists" end
            return self:set(k, v, t)
        end
        function d:incr(k, val, init, init_ttl)
            purge(k)
            local cur = store[k]
            if cur == nil then
                if init == nil then return nil, "not found" end
                cur = init
                exp[k] = (init_ttl and init_ttl > 0) and (ST.clock + init_ttl) or nil
            end
            store[k] = cur + (val or 0)
            return store[k]
        end
        function d:delete(k) store[k], exp[k] = nil, nil; return true end
        function d:expire(k, t)
            purge(k)
            if store[k] == nil then return nil, "not found" end
            exp[k] = (t and t > 0) and (ST.clock + t) or nil
            return true
        end
        function d:get_keys(max)
            local out = {}
            for k in pairs(store) do
                purge(k)
                if store[k] ~= nil then out[#out + 1] = k end
            end
            table.sort(out)
            if max and max > 0 and #out > max then
                local t = {}
                for i = 1, max do t[i] = out[i] end
                return t
            end
            return out
        end
        function d:flush_all() store, exp = {}, {}; return true end
        return d
    end

    local dicts = {
        mf_sessions = new_dict(), mf_locks = new_dict(), mf_stats = new_dict(),
    }

    -- entorno ngx mínimo (sólo lo que usa el módulo)
    local saved_ngx = ngx
    ngx = {
        shared = dicts, var = {}, header = {},
        now = function() return ST.clock end,
        sleep = function(s) ST.clock = ST.clock + (s or 0) end,
        log = function() end,
        worker = { pid = function() return 4242 end },
        req = { get_uri_args = function() return {} end, get_headers = function() return {} end },
        status = 200, print = function() end, say = function() end,
        exit = function() error("ngx.exit", 2) end,
        exec = function() error("ngx.exec", 2) end,
        timer = { every = function() return true end },
    }
    _M._hooks = {
        now = function() return ST.clock end,
        sleep = function(s) ST.clock = ST.clock + (s or 0) end,
        log = function() end,
    }
    _M._snap = nil

    local function reset(cfg)
        for _, d in pairs(dicts) do d:flush_all() end
        ST.clock, ST.opens = 1000, 0
        _M._cfg = cfg or {}
        _M._hooks.supervisor = nil
        _M._snap = nil
    end

    local function install_sup()
        ST.opens = 0
        _M._hooks.supervisor = function(op)
            if op == "OPEN" then
                ST.opens = ST.opens + 1
                return { op = "ok", gen = ST.opens, state = "live", seq = 1, caps = 2 }
            end
            return { op = "pong" }
        end
    end

    -- 1) semántica de dict:add (base del single-flight)
    reset()
    local lockdict = dicts.mf_locks
    local a1 = lockdict:add("st:lock", "owner-1", 10)
    local a2 = lockdict:add("st:lock", "owner-2", 10)
    ok("dict:add primer creador gana", a1 == true and a2 == nil)
    lockdict:delete("st:lock")
    ok("dict:add tras liberación vuelve a ganar", lockdict:add("st:lock", "owner-3", 10) == true)

    -- 2) single-flight: 50 "creadores" sobre la misma clave => 1 sola ingesta
    reset({ max_viewers_per_session = 64, max_total_viewers = 500 })
    install_sup()
    local skey = key_of("PROVIDER.example:443", "0001.m3u8")
    ok("clave de idempotencia válida", type(skey) == "string" and #skey == 16)
    local first = _M.claim(skey, nil, "c0")
    ok("primer claim crea la sesión", first and first.ok and first.gen == 1)
    local attached = 0
    for i = 1, 49 do
        local r = _M.claim(skey, nil, "c" .. i)
        if r and r.ok then attached = attached + 1 end
    end
    eq("50 claimants con sesión", attached, 49)
    eq("single-flight: EXACTAMENTE 1 OPEN", ST.opens, 1)
    eq("una sola sesión activa", count_active_sessions(), 1)
    eq("contador atómico de viewers", get_viewers(skey), 50)

    -- 3) lock ocupado: espera acotada (nunca indefinida) y luego funciona
    reset()
    install_sup()
    local lkey = key_of("provider.example", "locked-1")
    lockdict:add(K_SF .. lkey, "otro-worker", 60)
    local _, e_lock = _M.claim(lkey, nil, "c1")
    eq("lock ocupado agota espera acotada", e_lock, "spawn_wait_timeout")
    eq("lock ocupado no abre ingesta", ST.opens, 0)
    lockdict:delete(K_SF .. lkey)
    local r_after = _M.claim(lkey, nil, "c1")
    ok("tras liberar el lock sí abre ingesta", r_after and r_after.ok and ST.opens == 1)

    -- 4) fencing: publicación con generación vieja rechazada y contada
    reset()
    install_sup()
    local fkey = key_of("provider.example", "fence-1")
    local fr = _M.claim(fkey, nil, "a")
    ok("claim para fencing", fr and fr.ok)
    local _, e_old = _M.publish(fkey, 0, "live", 5)
    eq("publish con gen viejo rechazado", e_old, "stale_generation")
    ok("rechazo de fencing contado", stat("fence_rejects_total") >= 1)
    local _, e_hb = _M.heartbeat(fkey, 0)
    eq("heartbeat con gen viejo rechazado", e_hb, "stale_generation")
    local _, e_rel = _M.release(fkey, 0)
    eq("release con gen viejo rechazado", e_rel, "stale_generation")
    ok("sesión intacta tras escrituras viejas", get_session(fkey) ~= nil)
    local pub = _M.publish(fkey, 1, "live", 7)
    ok("publish con gen actual aceptado", pub and pub.seq == 7)
    local _, e_seq = _M.publish(fkey, 1, "live", 6)
    eq("seq regresiva rechazada", e_seq, "seq_regression")

    -- 5) espectadores + linger 25 s + cierre
    reset()
    install_sup()
    _M._cfg.max_total_viewers = 200
    local gkey = key_of("provider.example", "linger-1")
    _M.claim(gkey, nil, "A")
    _M.claim(gkey, nil, "A")   -- idempotente
    eq("alta repetida no infla viewers", get_viewers(gkey), 1)
    _M.claim(gkey, nil, "B")
    eq("segundo espectador", get_viewers(gkey), 2)
    _M.remove_viewer(gkey, "A")
    eq("baja de espectador", get_viewers(gkey), 1)
    _M.remove_viewer(gkey, "A")
    eq("baja repetida no subdesborda", get_viewers(gkey), 1)
    _M.remove_viewer(gkey, "B")
    local grec = get_session(gkey)
    ok("estado draining a 0 viewers", grec and grec.state == "draining")
    ok("linger = now + 25 s", grec and math.abs(grec.linger - (ST.clock + 25)) < 0.001,
        grec and (grec.linger - ST.clock))
    ST.clock = ST.clock + 10
    _M.sweep(true)
    ok("sesión viva dentro del linger", get_session(gkey) ~= nil)
    ST.clock = ST.clock + 16
    _M.sweep(true)
    ok("sesión cerrada al vencer el linger", get_session(gkey) == nil)
    ok("cierre por linger contado", stat("linger_expired_total") >= 1)

    -- 6) límites: rechazo al nuevo sin expulsar a los conectados
    reset({ max_sessions = 2, max_viewers_per_session = 2, max_total_viewers = 100 })
    install_sup()
    local ka = key_of("provider.limit", "a")
    local kb = key_of("provider.limit", "b")
    local kc = key_of("provider.limit", "c")
    _M.claim(ka, nil, "a1")
    _M.claim(kb, nil, "b1")
    local _, e_sess = _M.claim(kc, nil, "c1")
    eq("MAX_SESSIONS: 3ª sesión rechazada", e_sess, "max_sessions")
    eq("las 2 sesiones existentes siguen", count_active_sessions(), 2)
    _M.claim(ka, nil, "a2")
    local _, e_view = _M.claim(ka, nil, "a3")
    eq("MAX_VIEWERS: viewer 3 rechazado", e_view, "max_viewers")
    local still = _M.claim(ka, nil, "a1")
    ok("espectador ya conectado NO se cae", still and still.ok)

    -- 7) la clave NO depende del perfil (misma ingesta para original y 4K)
    reset()
    local p1 = key_of("provider.example", "shared-channel")
    local p2 = key_of("provider.example", "shared-channel")
    eq("misma clave para todos los perfiles", p1, p2)

    -- 8) op=seed (t10): pre-registro del supervisor SIN OPEN ni spawn
    reset()
    local sup_calls = 0
    _M._hooks.supervisor = function()
        sup_calls = sup_calls + 1
        return { op = "ok", gen = 1, state = "live", seq = 0, caps = 0 }
    end
    local seedkey = key_of("provider.seed", "ch-1")
    local s1 = _M.seed(seedkey, 3, "provider.seed", "ch-1")
    ok("seed crea la sesión", s1 and s1.state == "seed" and s1.created == true)
    eq("seed NO dispara OPEN", sup_calls, 0)
    eq("seed no cuenta espectador", get_viewers(seedkey), 0)
    local s2 = _M.seed(seedkey, 3, "provider.seed", "ch-1")
    ok("seed idempotente con el mismo gen", s2 and s2.created == false and s2.gen == 3)
    local _, e_low = _M.seed(seedkey, 2, nil, nil)
    eq("seed con gen menor → stale_generation", e_low, "stale_generation")
    local _, e_high = _M.seed(seedkey, 4, nil, nil)
    eq("seed con gen mayor → gen_mismatch", e_high, "gen_mismatch")
    eq("seed conserva gen", (get_session(seedkey) or {}).gen, 3)
    eq("seed conserva viewers a 0", get_viewers(seedkey), 0)
    -- seed → publish live → serve_handler sirve el manifest
    local pl = _M.publish(seedkey, 3, "live", 1)
    ok("publish tras seed aceptado", pl and pl.state == "live")
    eq("sesión live tras publish", (get_session(seedkey) or {}).state, "live")
    local printed = ""
    local saved_print = ngx.print
    local saved_root = ngx.var.mf_window_root
    local wbase = "/tmp/ape_session_o2_" .. tostring(os.time()) .. "_" .. tostring(math.random(100000))
    local wdir = wbase .. "/" .. seedkey .. "/3"
    os.execute("mkdir -p " .. string.format("%q", wdir) .. " 2>/dev/null")
    local wf = assert(io.open(wdir .. "/index.m3u8", "w"))
    wf:write("#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:6.0,\nseg00001.ts\n#EXT-X-ENDLIST\n")
    wf:close()
    ngx.var.mf_window_root = wbase
    ngx.print = function(s) printed = printed .. tostring(s or "") end
    ngx.var.uri = "/mf/" .. seedkey .. "/live.m3u8"
    pcall(function() _M.serve_handler() end)
    ngx.print = saved_print
    ngx.var.mf_window_root = saved_root
    os.execute("rm -rf " .. string.format("%q", wbase) .. " 2>/dev/null")
    ok("O2 entrada lee la playlist del tmpfs",
        printed:find("#EXTM3U", 1, true) ~= nil, printed)
    ok("O2 entrada de player con URI absoluta con gen",
        printed:find("/mf/" .. seedkey .. "/3/seg00001.ts", 1, true) ~= nil, printed)
    ok("O2 sin URI relativa en la entrada", printed:find("\nseg00001.ts", 1, true) == nil)
    eq("O2 X-MF-Gen", ngx.header["X-MF-Gen"], "3")
    eq("O2 Content-Type", ngx.header["Content-Type"], "application/vnd.apple.mpegurl")
    eq("O2 Cache-Control", ngx.header["Cache-Control"], "no-store")
    eq("el viewer se cuenta al servir, no al seed", get_viewers(seedkey), 1)

    -- O2: reescritura de URIs de segmento y de atributos URI="..."
    local rawpl = table.concat({
        "#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-TARGETDURATION:6",
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
        "#EXTINF:6.000,", "seg00001.ts",
        '#EXT-X-PART:DURATION=1.0,URI="part1.mp4",INDEPENDENT=YES',
        "seg00002.m4s", "https://cdn.example/x.ts", "/abs/already.ts",
        "#EXT-X-ENDLIST", "",
    }, "\n")
    local pfx = "/mf/" .. seedkey .. "/9/"
    local rw = abs_playlist(rawpl, pfx)
    ok("O2 seg .ts relativo → absoluto", rw:find(pfx .. "seg00001.ts", 1, true) ~= nil)
    ok("O2 seg fMP4 relativo → absoluto", rw:find(pfx .. "seg00002.m4s", 1, true) ~= nil)
    ok("O2 EXT-X-MAP URI absoluta", rw:find('URI="' .. pfx .. 'init.mp4"', 1, true) ~= nil)
    ok("O2 EXT-X-KEY URI absoluta", rw:find('URI="' .. pfx .. 'key.bin"', 1, true) ~= nil)
    ok("O2 EXT-X-PART URI absoluta", rw:find('URI="' .. pfx .. 'part1.mp4"', 1, true) ~= nil)
    ok("O2 URI http absoluta intacta", rw:find("https://cdn.example/x.ts", 1, true) ~= nil)
    ok("O2 URI /path absoluta intacta", rw:find("/abs/already.ts", 1, true) ~= nil)
    ok("O2 cabeceras intactas", rw:find("#EXT-X-TARGETDURATION:6", 1, true) ~= nil)
    ok("O2 sin URIs relativas", rw:find("\nseg00001.ts", 1, true) == nil
        and rw:find("\nseg00002.m4s", 1, true) == nil)
    -- antes del seed, publish sigue devolviendo no_session (409 en el borde)
    local never = key_of("provider.seed", "never")
    local _, e_noseed = _M.publish(never, 1, "live", 1)
    eq("publish sin seed sigue rechazado", e_noseed, "no_session")
    -- seed sin viewers caduca por el TTL normal de sesión (180 s)
    local idle = key_of("provider.seed", "idle")
    ok("seed idle creado", (_M.seed(idle, 1, nil, nil)) ~= nil)
    ST.clock = ST.clock + 181
    ok("seed sin viewers expira por TTL normal", get_session(idle) == nil)
    ok("seed servido expira por TTL normal", get_session(seedkey) == nil)

    ngx = saved_ngx
    print(string.format("SELFTEST pass=%d fail=%d", ST.pass, ST.fail))
    if ST.fail == 0 then
        print("SELFTEST_OK")
        os.exit(0)
    end
    print("SELFTEST_FAILED")
    os.exit(1)
end

local function arg_has(flag)
    if type(arg) ~= "table" then return false end
    for i = 1, #arg do
        if arg[i] == flag then return true end
    end
    return false
end

-- Modo autotest: sólo en CLI (ngx ausente) para no interferir con nginx.
if arg_has("--selftest") and not (ngx and ngx.shared) then
    return _M.run_selftest()
end

if ngx and type(ngx) == "table" and ngx.var and ngx.var.mf_handler == "1" then
    return _M.dispatch()
end

return _M
