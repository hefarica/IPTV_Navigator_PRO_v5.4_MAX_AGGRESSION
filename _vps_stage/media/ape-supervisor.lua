#!/usr/bin/env lua5.1
-- ═════════════════════════════════════════════════════════════════════════════
-- APE SUPERVISOR (I5) — autoridad ÚNICA de lifecycle del media-fan-out
-- ═════════════════════════════════════════════════════════════════════════════
-- Fichero: _vps_stage/media/ape-supervisor.lua  (Lua 5.1 puro; sin luarocks,
--          sin apt, sin resty-lock/http). Se lanza desde ape-supervisor.sh:
--             ./ape-supervisor.sh --serve      (socat + flock, systemd)
--             ./ape-supervisor.sh --handle     (una conexión: lee 1 línea, responde 1)
--             ./ape-supervisor.sh --selftest   (este fichero, sin red, determinista)
--
-- QUÉ ES
--   El dueño del ciclo de vida de la ingesta: decide la GENERACIÓN, resuelve
--   idem → URL con credenciales, escribe el SPEC atómico, arranca/para/reinicia
--   la instancia, aplica allowlist y límites, y es el ÚNICO que escribe el
--   estado del coordinador (seed/publish/heartbeat/close por loopback).
--   El worker FFmpeg NO habla con el coordinador: sólo con este socket.
--
-- QUÉ NO ES
--   * No procesa vídeo ni escribe segmentos (eso es el worker t4). Dentro de
--     MF_OUT el worker escribe `index.m3u8` + segmentos con nombre
--     [A-Za-z0-9][A-Za-z0-9._-]{0,63} (.ts/.m4s/.mp4/.aac), con tmp+rename y
--     SIN subdirectorios; el borde (t5) sirve /mf/<key>/<gen>/<file> y mapea
--     live/playlist.m3u8 -> index.m3u8.
--   * No sirve HTTP: el borde es nginx (t5); aquí sólo se publica estado.
--   * No expone credenciales: ni en logs, ni en argv, ni en respuestas, ni en
--     el path público. La URL con credenciales vive en /etc/mediafanout/urls.conf
--     (0640) y se escribe SÓLO en el spec (0640 mediafanout:www-data).
--
-- PROTOCOLO (una línea por conexión, LF; cliente timeout 400 ms; servidor cierra)
--   OPEN <key> [<provider>|<channel> | <provider> <channel>]
--        → OK gen=<n> state=<s> seq=<n> caps=0 path=<fs> ttl=<s>
--   PUBLISH   <key> <gen> state=<starting|live|backoff|stopping> [seq=<n>]
--   HEARTBEAT <key> <gen> [seq=<n>]
--   RESTART   <key> <gen> reason=<upstream|stall|window_overflow|eof|startup>
--   FAIL      <key> <gen> reason=<r>
--   CLOSE     <key> [gen]                       (compat. tarea; válido)
--   PING -
--        → OK gen=<n> [state=<s>] [seq=<n>] | PONG
--   STATUS -
--        → OK sessions=<n> active=<n> max=<n>
--   Errores → ERR code=<stale_generation|unsupported|bad_op|provider_not_allowed|
--                        no_upstream|limit_reached|start_failed|internal> [reason=<txt>]
--
-- ORDEN DE ARRANQUE (contrato t10/t9, medido en --selftest)
--   1) relay op=seed (pre-registra sesión+gen; sin OPEN ni spawn)
--   2) escribir el SPEC atómico (tmp+rename) 0640 mediafanout:www-data
--   3) arrancar la instancia           (systemctl start ape-ingest@<key>)
--   4) relay op=publish state=starting  (ya hay sesión registrada)
--   5) relay op=publish state=live cuando el worker publica el primer segmento
--
-- GENERACIÓN
--   gen = leído de /var/lib/mediafanout/keys/<key>/gen + 1 en CADA spawn.
--   Persistida en disco antes del spec; sobrevive al reinicio del supervisor.
--   Una publicación con gen distinto al actual → stale_generation (fencing).
--   Un RESTART rota la generación (release viejo → seed nuevo → spec → restart).
--   Backoff propio (sustituye WatchdogSec, el worker es bash): FAIL/start fallido
--   deja next_at = now + 1/2/4/8 s; hasta entonces OPEN devuelve ERR code=backoff.
--   El timeout de heartbeat (MF_STALE_AFTER, 45 s) detecta sesiones estancadas y
--   el siguiente OPEN las reemplaza con gen nuevo.
--
-- SEGURIDAD
--   * Socket canónico /run/mediafanout/mf.sock + alias supervisor.sock,
--     root:www-data 0660 (los pone socat en ape-supervisor.sh).
--   * Allowlist obligatoria /etc/mediafanout/providers.allow (host fuera → no spawn).
--   * Credenciales en /etc/mediafanout/urls.conf 0640 root:www-data; el worker
--     las recibe por spec (0640 mediafanout:www-data), nunca por argv.
--   * El log sólo registra key (hash), gen, op, estado y código HTTP.
-- ═════════════════════════════════════════════════════════════════════════════

local VERSION = "1.0.0"
local ENV = os.getenv

-- ── configuración (todo sobreescribible por entorno; tests usan lo mismo) ───
local CFG = {
    root         = ENV("MF_ROOT") or "/run/mediafanout",
    state_dir    = ENV("MF_STATE_DIR") or "/var/lib/mediafanout",
    conf_dir     = ENV("MF_CONF_DIR") or "/etc/mediafanout",
    window_root  = ENV("MF_WINDOW_ROOT") or "/dev/shm/mf",
    coord_url    = ENV("MF_COORD_URL") or "http://127.0.0.1:8090",
    max_sessions = tonumber(ENV("MF_MAX_SESSIONS") or "12") or 12,
    stale_after  = tonumber(ENV("MF_STALE_AFTER") or "45") or 45,
    backoff_base = tonumber(ENV("MF_BACKOFF_BASE") or "1") or 1,
    linger_ttl   = tonumber(ENV("MF_LINGER_TTL") or "25") or 25,
    spec_owner   = ENV("MF_SPEC_OWNER") or "mediafanout:www-data",
    spec_mode    = "0640",
    start_cmd    = ENV("MF_START_CMD") or "systemctl start ape-ingest@%s.service",
    stop_cmd     = ENV("MF_STOP_CMD") or "systemctl stop ape-ingest@%s.service",
    restart_cmd  = ENV("MF_RESTART_CMD") or "systemctl restart ape-ingest@%s.service",
    restart_support = (ENV("MF_SUPPORT_RESTART") ~= "0"),
    relay_on     = (ENV("MF_RELAY") ~= "0"),
    src_seg_dur  = ENV("MF_SRC_SEG_DUR"),
    src_audio    = ENV("MF_SRC_AUDIO_CODEC"),
}
CFG.lua_bin   = ENV("MF_LUA_BIN") or ((type(arg) == "table" and arg[-1]) or "lua5.1")
CFG.self_path = ENV("MF_SELF") or ((type(arg) == "table" and arg[0]) or "ape-supervisor.lua")
CFG.lock_file = ENV("MF_LOCK_FILE") or (CFG.root .. "/state.lock")
CFG.allowlist = ENV("MF_ALLOWLIST") or (CFG.conf_dir .. "/providers.allow")
CFG.urls      = ENV("MF_URLS") or (CFG.conf_dir .. "/urls.conf")

-- ── adaptadores (el --selftest los sustituye: sin red y determinista) ───────
local AD = {}
local LOGS = {}
local OWNER_WARNED = false

local function log(msg)
    local line = os.date("!%Y-%m-%dT%H:%M:%SZ") .. " ape-supervisor: " .. tostring(msg)
    LOGS[#LOGS + 1] = line
    if AD.log then AD.log(line) else io.stderr:write(line .. "\n") end
end

local function now()
    if AD.now then return AD.now() end
    return os.time()
end

-- ── utilidades de fichero / shell ───────────────────────────────────────────
local function trim(s)
    return tostring(s or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function shq(s)
    return "'" .. tostring(s or ""):gsub("'", "'\\''") .. "'"
end

local function mkdir_p(path)
    os.execute("mkdir -p " .. shq(path) .. " 2>/dev/null")
    return path
end

local function file_read(path)
    local f = io.open(path, "r")
    if not f then return nil end
    local data = f:read("*a")
    f:close()
    return data
end

local function file_exists(path)
    local f = io.open(path, "r")
    if f then f:close(); return true end
    return false
end

local function remove(path)
    os.remove(path)
end

-- Escritura atómica (tmp + rename) con modo y owner. El contenido puede llevar
-- credenciales: NUNCA se loguea. Si el owner configurado no existe (p.ej. el
-- usuario mediafanout aún no está creado), se cae a root:www-data y se avisa
-- UNA vez (el requisito de grupo www-data se mantiene: nginx puede leer).
local function write_atomic(path, data, mode, owner)
    local tmp = path .. ".tmp"
    local f, err = io.open(tmp, "w")
    if not f then return nil, "open " .. tostring(err) end
    f:write(data)
    f:close()

    os.execute("chmod " .. tostring(mode or "0640") .. " " .. shq(tmp) .. " 2>/dev/null")
    if owner and owner ~= "" then
        local rc = os.execute("chown " .. owner .. " " .. shq(tmp) .. " 2>/dev/null")
        if rc ~= 0 then
            os.execute("chown root:www-data " .. shq(tmp) .. " 2>/dev/null")
            if not OWNER_WARNED then
                OWNER_WARNED = true
                log("owner " .. owner .. " no disponible; fallback root:www-data (crear usuario mediafanout)")
            end
        end
    end
    local ok, rerr = os.rename(tmp, path)
    if not ok then
        remove(tmp)
        return nil, "rename " .. tostring(rerr)
    end
    return true
end

-- ── normalización / validación ──────────────────────────────────────────────
local function valid_key(key)
    return type(key) == "string" and key:match("^%x+$") ~= nil and #key == 16
end

local function norm_provider(p)
    p = tostring(p or ""):lower()
    p = trim(p)
    p = p:gsub("^[a-z][a-z0-9+.-]*://", "")
    p = p:gsub("/.*$", "")
    p = p:gsub("^([^:]+):80$", "%1")
    p = p:gsub("^([^:]+):443$", "%1")
    p = p:gsub("%.$", "")
    if #p > 190 or not p:match("^[%w%-%._:]+$") then return nil end
    return p
end

local function norm_channel(c)
    c = trim(tostring(c or ""))
    c = c:gsub("[?#].*$", "")
    if c:find("/") then c = c:match("([^/]+)$") or c end
    c = c:gsub("%.[mM]3[uU]8$", ""):gsub("%.[tT][sS]$", "")
    if #c > 64 or not c:match("^[%w%-%._]+$") then return nil end
    return c
end

local function urlencode(s)
    return tostring(s or ""):gsub("([^%w%-%._~])", function(c)
        return string.format("%%%02X", string.byte(c))
    end)
end

-- ── rutas de estado ─────────────────────────────────────────────────────────
local function key_dir(key) return CFG.state_dir .. "/keys/" .. key end
local function gen_path(key) return key_dir(key) .. "/gen" end
local function state_path(key) return key_dir(key) .. "/state" end
local function spec_path(key) return CFG.root .. "/spec/" .. key .. ".env" end
local function out_dir(key, gen) return CFG.window_root .. "/" .. tostring(key) .. "/" .. tostring(gen) end

local function read_gen(key)
    local d = file_read(gen_path(key))
    if not d then return 0 end
    return tonumber(d:match("^(%d+)")) or 0
end

local function write_gen(key, gen)
    mkdir_p(key_dir(key))
    return write_atomic(gen_path(key), tostring(gen) .. "\n", "0640", CFG.spec_owner)
end

local function read_state(key)
    local d = file_read(state_path(key))
    if not d then return nil end
    local st = {}
    for line in d:gmatch("[^\n]+") do
        local k, v = line:match("^([%w_]+)=(.*)$")
        if k then st[k] = v end
    end
    if not st.gen then return nil end
    st.gen = tonumber(st.gen) or 0
    st.seq = tonumber(st.seq) or 0
    st.updated = tonumber(st.updated) or 0
    st.failures = tonumber(st.failures) or 0
    st.next_at = tonumber(st.next_at) or 0
    if not st.state then st.state = "unknown" end
    return st
end

local function write_state(key, st)
    mkdir_p(key_dir(key))
    local lines = {
        "gen=" .. tostring(st.gen),
        "state=" .. tostring(st.state),
        "seq=" .. tostring(st.seq or 0),
        "updated=" .. tostring(st.updated or now()),
        "failures=" .. tostring(st.failures or 0),
        "next_at=" .. tostring(st.next_at or 0),
        "provider=" .. tostring(st.provider or ""),
        "channel=" .. tostring(st.channel or ""),
    }
    return write_atomic(state_path(key), table.concat(lines, "\n") .. "\n", "0640", CFG.spec_owner)
end

local function is_alive(st, t)
    if not st then return false end
    local s = tostring(st.state)
    if s == "failed" or s == "closed" or s == "stopping" then return false end
    if s ~= "seed" and s ~= "starting" and s ~= "live" and s ~= "backoff" then return false end
    return (t - (tonumber(st.updated) or 0)) <= CFG.stale_after
end

local function list_keys()
    local out = {}
    local p = io.popen("ls -1 " .. shq(CFG.state_dir .. "/keys") .. " 2>/dev/null")
    if not p then return out end
    for key in p:lines() do
        if valid_key(key) then out[#out + 1] = key end
    end
    p:close()
    return out
end

local function count_alive(t)
    local n, keys = 0, list_keys()
    for i = 1, #keys do
        if is_alive(read_state(keys[i]), t) then n = n + 1 end
    end
    return n, keys
end

-- ── allowlist de proveedores ────────────────────────────────────────────────
local function load_allowlist()
    local set = {}
    local data = file_read(CFG.allowlist)
    if not data then return nil end
    for line in data:gmatch("[^\n]+") do
        line = trim(line:gsub("#.*$", ""))
        if line ~= "" then
            local p = norm_provider(line)
            if p then set[p] = true end
        end
    end
    return set
end

local function provider_allowed(provider)
    local set = load_allowlist()
    if not set then return false, "allowlist_missing" end
    if set[provider] then return true end
    return false, "host_not_listed"
end

-- ── idem → URL con credenciales (SÓLO aquí) ─────────────────────────────────
local function resolve_url(provider, channel)
    local data = file_read(CFG.urls)
    if not data then return nil end
    for line in data:gmatch("[^\n]+") do
        line = trim(line:gsub("^%s*#.*$", ""))
        if line ~= "" then
            local lhs, url = line:match("^([^=]+)=(.+)$")
            if lhs and url then
                local p, c = lhs:match("^%s*([^|]+)|([^|%s]+)%s*$")
                if p and c then
                    local np, nc = norm_provider(p), norm_channel(c)
                    if np == provider and nc == channel then
                        url = trim(url)
                        if url:match("^https?://[^%s]+$") then return url end
                    end
                end
            end
        end
    end
    return nil
end

-- ── receta de arranque (adaptadores) ────────────────────────────────────────
local function default_spawn(key)
    local rc = os.execute(string.format(CFG.start_cmd, key))
    return rc == 0
end

local function default_stop(key)
    os.execute(string.format(CFG.stop_cmd, key))
    return true
end

local function default_restart(key)
    local rc = os.execute(string.format(CFG.restart_cmd, key))
    return rc == 0
end

if not AD.spawn then AD.spawn = default_spawn end
if not AD.stop then AD.stop = default_stop end
if not AD.restart then AD.restart = default_restart end

-- ── relay al coordinador (loopback; única fuente de estado) ─────────────────
local function default_relay(op, params)
    if not CFG.relay_on then return "disabled" end
    local parts = {}
    local order = { "key", "gen", "state", "seq", "provider", "channel" }
    for i = 1, #order do
        local k = order[i]
        if params[k] ~= nil then
            parts[#parts + 1] = k .. "=" .. urlencode(params[k])
        end
    end
    local url = CFG.coord_url .. "/mf/ctl?op=" .. op .. "&" .. table.concat(parts, "&")
    local cmd = "curl -s -o /dev/null -w '%{http_code}' --max-time 1 " .. shq(url) .. " 2>/dev/null"
    local p = io.popen(cmd)
    local code = "000"
    if p then code = trim(p:read("*a") or "000"); p:close() end
    -- Sólo key/gen/op/estado/HTTP: jamás la URL ni proveedor/canal con credenciales.
    log("relay op=" .. op .. " key=" .. tostring(params.key) .. " gen=" .. tostring(params.gen)
        .. (params.state and (" state=" .. tostring(params.state)) or "") .. " http=" .. code)
    return code
end

if not AD.relay then AD.relay = default_relay end

local function relay(op, params)
    local ok, code = pcall(AD.relay, op, params)
    if not ok then
        log("relay error op=" .. op .. " key=" .. tostring(params.key) .. " err=" .. tostring(code))
        return "error"
    end
    return code
end

local function relay_seed(key, gen, provider, channel)
    return relay("seed", { key = key, gen = gen, provider = provider, channel = channel })
end
local function relay_publish(key, gen, state, seq)
    return relay("publish", { key = key, gen = gen, state = state, seq = seq })
end
local function relay_heartbeat(key, gen, seq)
    return relay("heartbeat", { key = key, gen = gen, seq = seq })
end
local function relay_close(key, gen)
    return relay("release", { key = key, gen = gen })
end

-- ── spec (formato shell, 0640, sin credenciales en argv) ────────────────────
local function build_spec(key, gen, provider, channel, url)
    local out = out_dir(key, gen) .. "/"
    local lines = {
        "# generado por ape-supervisor " .. VERSION .. " — NO editar a mano",
        "MF_KEY=" .. key,
        "MF_GEN=" .. tostring(gen),
        "MF_OUT=" .. out,
        "MF_UPSTREAM_URL=" .. shq(url),
        "MF_IDEM=" .. shq(provider .. "|" .. channel),
    }
    if CFG.src_seg_dur and CFG.src_seg_dur ~= "" then
        lines[#lines + 1] = "MF_SRC_SEG_DUR=" .. shq(CFG.src_seg_dur)
    end
    if CFG.src_audio and CFG.src_audio ~= "" then
        lines[#lines + 1] = "MF_SRC_AUDIO_CODEC=" .. shq(CFG.src_audio)
    end
    return table.concat(lines, "\n") .. "\n"
end

local function ensure_window_dir(key, gen)
    local parent = CFG.window_root .. "/" .. key
    mkdir_p(parent)
    mkdir_p(out_dir(key, gen))
    os.execute("chmod 0750 " .. shq(parent) .. " " .. shq(out_dir(key, gen)) .. " 2>/dev/null")
    local rc = os.execute("chown " .. CFG.spec_owner .. " " .. shq(parent) .. " " .. shq(out_dir(key, gen)) .. " 2>/dev/null")
    if rc ~= 0 then
        os.execute("chown root:www-data " .. shq(parent) .. " " .. shq(out_dir(key, gen)) .. " 2>/dev/null")
    end
end

-- Limpieza de generaciones viejas de la ventana (sólo directorios numéricos).
local function cleanup_old_generations(key, keep_gen)
    local base = CFG.window_root .. "/" .. key
    local p = io.popen("ls -1 " .. shq(base) .. " 2>/dev/null")
    if not p then return end
    for name in p:lines() do
        local n = tonumber(name)
        if n and n ~= keep_gen then
            os.execute("rm -rf " .. shq(base .. "/" .. name) .. " 2>/dev/null")
        end
    end
    p:close()
end

-- ── respuestas ──────────────────────────────────────────────────────────────
local function resp_ok_open(gen, state, seq, path)
    return string.format("OK gen=%d state=%s seq=%d caps=0 path=%s ttl=%d",
        gen, state, seq or 0, path, math.floor(CFG.linger_ttl))
end

local function resp_ok(gen, state, seq)
    local s = string.format("OK gen=%d", gen)
    if state then s = s .. " state=" .. state end
    if seq ~= nil then s = s .. " seq=" .. tostring(seq) end
    return s
end

local function resp_err(code, reason)
    local s = "ERR code=" .. tostring(code)
    if reason and reason ~= "" then s = s .. " reason=" .. tostring(reason):gsub("%s+", "_") end
    return s
end

-- ── operaciones de ESTADO (bajo flock CORTO; SIN red y SIN start) ───────────
-- B1 (t11): la sección crítica NUNCA cubre `systemctl start/stop/restart` ni
-- el relay HTTP. Sólo se serializa la transacción de estado (gen+spec+registro)
-- para garantizar single-flight y fencing; el resto lo hace el padre sin lock.
local VALID_PUB_STATE = { starting = true, live = true, backoff = true, stopping = true }

local function state_open(tokens)
    local key = tokens[1]
    if not valid_key(key) then return "RET " .. resp_err("bad_op", "bad_key") end
    local t = now()
    local st = read_state(key)
    if is_alive(st, t) then
        return "RET " .. resp_ok_open(st.gen, st.state, st.seq, out_dir(key, st.gen))
    end

    -- Backoff (sustituye WatchdogSec): FAIL/start fallido deja next_at.
    if st and (tonumber(st.next_at) or 0) > t then
        return "RET " .. resp_err("backoff", "retry_later")
    end

    local provider, channel
    if tokens[2] and tokens[2]:find("|") then
        provider, channel = tokens[2]:match("^([^|]+)|(.+)$")
    elseif tokens[2] and tokens[3] then
        provider, channel = tokens[2], tokens[3]
    end
    provider = provider and norm_provider(provider) or nil
    channel = channel and norm_channel(channel) or nil
    if (not provider or not channel) and st then
        provider = provider or norm_provider(st.provider)
        channel = channel or norm_channel(st.channel)
    end
    if not provider or not channel then return "RET " .. resp_err("bad_op", "missing_provider") end

    local allowed, why = provider_allowed(provider)
    if not allowed then return "RET " .. resp_err("provider_not_allowed", why) end

    local url = resolve_url(provider, channel)
    if not url then return "RET " .. resp_err("no_upstream", "idem_not_configured") end

    if count_alive(t) >= CFG.max_sessions then
        return "RET " .. resp_err("limit_reached", "max_sessions")
    end

    local stop_needed = (st ~= nil) and 1 or 0
    local gen = read_gen(key) + 1
    if not write_gen(key, gen) then return "RET " .. resp_err("internal", "gen_persist") end

    local out = out_dir(key, gen)
    ensure_window_dir(key, gen)

    local ok_spec = write_atomic(spec_path(key), build_spec(key, gen, provider, channel, url),
        CFG.spec_mode, CFG.spec_owner)
    if not ok_spec then return "RET " .. resp_err("internal", "spec_write") end

    -- Reserva de la sesión ANTES de soltar el lock: un OPEN concurrente verá
    -- state=starting y devolverá la MISMA gen/path sin esperar al start.
    write_state(key, { gen = gen, state = "starting", seq = 0, updated = t,
        failures = 0, next_at = 0, provider = provider, channel = channel })

    return string.format("SPAWN key=%s gen=%d path=%s provider=%s channel=%s stop=%d",
        key, gen, out, provider, channel, stop_needed)
end

local function state_publish(tokens)
    local key, gen, state, seq = tokens[1], tonumber(tokens[2]), tokens[3], tokens[4]
    if not valid_key(key) or not gen then return "RET " .. resp_err("bad_op", "args") end
    state = state and state:match("^state=(%w+)$") or nil
    if not state or not VALID_PUB_STATE[state] then return "RET " .. resp_err("bad_op", "state") end
    if seq then seq = tonumber(seq:match("^seq=(%d+)$") or "") end

    local st = read_state(key)
    if not st then return "RET " .. resp_err("stale_generation", "no_session") end
    if gen ~= st.gen then return "RET " .. resp_err("stale_generation", "gen_mismatch") end

    st.state = state
    st.updated = now()
    if state == "live" then st.failures, st.next_at = 0, 0 end
    if seq and seq >= (st.seq or 0) then st.seq = seq end
    write_state(key, st)
    return string.format("PUBLISH key=%s gen=%d state=%s seq=%d", key, gen, state, st.seq)
end

local function state_heartbeat(tokens)
    local key, gen = tokens[1], tonumber(tokens[2])
    if not valid_key(key) or not gen then return "RET " .. resp_err("bad_op", "args") end
    local seq = tokens[3] and tonumber(tokens[3]:match("^seq=(%d+)$") or "")
    local st = read_state(key)
    if not st then return "RET " .. resp_err("stale_generation", "no_session") end
    if gen ~= st.gen then return "RET " .. resp_err("stale_generation", "gen_mismatch") end
    st.updated = now()
    if seq and seq >= (st.seq or 0) then st.seq = seq end
    write_state(key, st)
    return string.format("HEARTBEAT key=%s gen=%d state=%s seq=%d", key, gen, st.state, st.seq)
end

local function state_restart(tokens)
    local key, gen = tokens[1], tonumber(tokens[2])
    if not valid_key(key) or not gen then return "RET " .. resp_err("bad_op", "args") end
    if not CFG.restart_support then return "RET " .. resp_err("unsupported", "restart") end
    local reason = (tokens[3] or ""):match("^reason=([%w_%-]+)") or "unknown"

    local st = read_state(key)
    if not st then return "RET " .. resp_err("stale_generation", "no_session") end
    if gen ~= st.gen then return "RET " .. resp_err("stale_generation", "gen_mismatch") end

    local provider = norm_provider(st.provider)
    local channel = norm_channel(st.channel)
    if not provider or not channel then return "RET " .. resp_err("internal", "no_idem") end
    local allowed = provider_allowed(provider)
    if not allowed then return "RET " .. resp_err("provider_not_allowed", "host_not_listed") end
    local url = resolve_url(provider, channel)
    if not url then return "RET " .. resp_err("no_upstream", "idem_not_configured") end

    local newgen = read_gen(key) + 1
    write_gen(key, newgen)
    ensure_window_dir(key, newgen)
    local ok_spec = write_atomic(spec_path(key), build_spec(key, newgen, provider, channel, url),
        CFG.spec_mode, CFG.spec_owner)
    if not ok_spec then return "RET " .. resp_err("internal", "spec_write") end
    write_state(key, { gen = newgen, state = "starting", seq = 0, updated = now(),
        failures = 0, next_at = 0, provider = provider, channel = channel })

    return string.format("RESTART key=%s old=%d new=%d provider=%s channel=%s reason=%s",
        key, gen, newgen, provider, channel, reason)
end

local function state_fail(tokens)
    local key, gen = tokens[1], tonumber(tokens[2])
    if not valid_key(key) or not gen then return "RET " .. resp_err("bad_op", "args") end
    local st = read_state(key)
    if not st then return "RET " .. resp_err("stale_generation", "no_session") end
    if gen ~= st.gen then return "RET " .. resp_err("stale_generation", "gen_mismatch") end

    st.failures = (tonumber(st.failures) or 0) + 1
    local delay = CFG.backoff_base * (2 ^ math.min(st.failures - 1, 3))
    if delay > 8 then delay = 8 end
    st.state = "failed"
    st.updated = now()
    st.next_at = now() + delay
    write_state(key, st)
    log("fail key=" .. key .. " gen=" .. tostring(gen) .. " backoff=" .. tostring(delay) .. "s")
    return string.format("FAIL key=%s gen=%d seq=%d", key, gen, st.seq)
end

local function state_close(tokens)
    local key, gen = tokens[1], tonumber(tokens[2] or "")
    if not valid_key(key) then return "RET " .. resp_err("bad_op", "bad_key") end
    local st = read_state(key)
    if not st then return "RET " .. resp_ok(gen or 0, "closed", 0) end
    if gen and gen ~= st.gen then return "RET " .. resp_err("stale_generation", "gen_mismatch") end
    st.state = "closed"
    st.updated = now()
    write_state(key, st)
    return string.format("CLOSE key=%s gen=%d seq=%d", key, st.gen, st.seq)
end

local function do_status()
    local active, keys = count_alive(now())
    return string.format("OK sessions=%d active=%d max=%d", #keys, active, CFG.max_sessions)
end

-- ── transacción de estado (la ejecuta el hijo bajo flock) ───────────────────
local function state_dispatch(line)
    line = trim(line)
    if line == "" then return "RET " .. resp_err("bad_op", "empty") end
    local op, rest = line:match("^(%u+)%s*(.*)$")
    if not op then return "RET " .. resp_err("bad_op", "syntax") end
    local tokens = {}
    for tok in rest:gmatch("%S+") do tokens[#tokens + 1] = tok end

    if op == "PING" then return "RET PONG" end
    if op == "STATUS" then return "RET " .. do_status() end
    if op == "OPEN" then return state_open(tokens) end
    if op == "PUBLISH" then return state_publish(tokens) end
    if op == "HEARTBEAT" then return state_heartbeat(tokens) end
    if op == "RESTART" then return state_restart(tokens) end
    if op == "FAIL" then return state_fail(tokens) end
    if op == "CLOSE" then return state_close(tokens) end
    return "RET " .. resp_err("bad_op", "unknown_op")
end

-- ── lock corto: flock + Lua --locked-state ─────────────────────────────────
-- Cada mutación de estado se ejecuta en un hijo con flock exclusivo. El hijo
-- SÓLO toca ficheros locales (gen/spec/state): ni start, ni stop, ni curl.
local function default_locked(line)
    mkdir_p(CFG.root)
    local id = tostring({}):gsub("[^%w]", "") .. "." .. tostring(os.time())
    local tf = CFG.root .. "/.op." .. id
    local f = io.open(tf, "w")
    if not f then return "RET " .. resp_err("internal", "lock_tmp") end
    f:write(line, "\n")
    f:close()
    local cmd = "flock -x -w 2 " .. shq(CFG.lock_file) .. " "
        .. shq(CFG.lua_bin) .. " " .. shq(CFG.self_path) .. " --locked-state < " .. shq(tf)
        .. " 2>/dev/null"
    local p = io.popen(cmd)
    local out = ""
    if p then out = trim(p:read("*a") or ""); p:close() end
    os.remove(tf)
    if out == "" then return "RET " .. resp_err("internal", "lock_timeout") end
    return out
end

if not AD.locked then AD.locked = default_locked end

local function locked(line)
    local ok, res = pcall(AD.locked, line)
    if not ok then return "RET " .. resp_err("internal", "locked") end
    return res
end

local function plan_kv(s)
    local out = {}
    for k, v in tostring(s):gmatch("(%w+)=([^%s]+)") do out[k] = v end
    return out
end

-- ── ejecución de efectos (SIN lock): relay HTTP + start/stop/restart ────────
-- Orden B1: lock → gen+spec+reserva → unlock → seed → start → publish starting.
local function execute_plan(plan)
    local kind, rest = tostring(plan):match("^(%u+)%s*(.*)$")
    if kind == "RET" then return rest end
    if kind == "ERR" then return tostring(plan) end
    local kv = plan_kv(rest)

    if kind == "SPAWN" then
        local key, gen, path = kv.key, tonumber(kv.gen), kv.path
        if not key or not gen then return resp_err("internal", "plan_spawn") end
        if kv.stop == "1" then pcall(AD.stop, key) end
        relay_seed(key, gen, kv.provider, kv.channel)
        local ok_spawn, sres = pcall(AD.spawn, key)
        local started = ok_spawn and sres and true or false
        if not started then
            locked("FAIL " .. key .. " " .. tostring(gen) .. " reason=start_failed")
            relay_publish(key, gen, "backoff", 0)
            return resp_err("start_failed", "spawn")
        end
        local st2 = read_state(key)
        local state, seq = "starting", 0
        if st2 then state, seq = st2.state, st2.seq or 0 end
        -- El worker puede haber publicado ya (starting/live) durante el start:
        -- no regresar su estado a starting si ya avanzó.
        if state ~= "live" then relay_publish(key, gen, "starting", seq) end
        cleanup_old_generations(key, gen)
        return resp_ok_open(gen, state, seq, path)
    elseif kind == "PUBLISH" then
        relay_publish(kv.key, tonumber(kv.gen), kv.state, tonumber(kv.seq))
        return resp_ok(tonumber(kv.gen), kv.state, tonumber(kv.seq))
    elseif kind == "HEARTBEAT" then
        relay_heartbeat(kv.key, tonumber(kv.gen), tonumber(kv.seq))
        return resp_ok(tonumber(kv.gen), kv.state, tonumber(kv.seq))
    elseif kind == "RESTART" then
        local key, old, new = kv.key, tonumber(kv.old), tonumber(kv.new)
        relay_close(key, old)
        relay_seed(key, new, kv.provider, kv.channel)
        local ok_r, rres = pcall(AD.restart, key)
        if not ok_r or not rres then
            locked("FAIL " .. key .. " " .. tostring(new) .. " reason=start_failed")
            relay_publish(key, new, "backoff", 0)
            return resp_err("start_failed", "restart")
        end
        relay_publish(key, new, "starting", 0)
        cleanup_old_generations(key, new)
        log("restart key=" .. key .. " gen=" .. tostring(old) .. "->" .. tostring(new)
            .. " reason=" .. tostring(kv.reason))
        return resp_ok(new, "starting", 0)
    elseif kind == "FAIL" then
        local key, gen = kv.key, tonumber(kv.gen)
        pcall(AD.stop, key)
        relay_close(key, gen)
        return resp_ok(gen, "failed", tonumber(kv.seq))
    elseif kind == "CLOSE" then
        local key, gen = kv.key, tonumber(kv.gen)
        pcall(AD.stop, key)
        relay_close(key, gen)
        return resp_ok(gen, "closed", tonumber(kv.seq))
    end
    return resp_err("internal", "plan_unknown")
end

-- ── dispatcher (proceso padre; SIN lock salvo la transacción corta) ────────
local function dispatch(line)
    line = trim(line)
    if line == "" then return resp_err("bad_op", "empty") end
    local op, rest = line:match("^(%u+)%s*(.*)$")
    if not op then return resp_err("bad_op", "syntax") end
    local tokens = {}
    for tok in rest:gmatch("%S+") do tokens[#tokens + 1] = tok end

    if op == "PING" then return "PONG" end
    if op == "STATUS" then return do_status() end

    if op == "OPEN" then
        -- Fast-path SIN lock: si la sesión está viva (incluida la reserva
        -- state=starting del ganador), devolver la MISMA gen/path de inmediato.
        -- Esto es lo que permite atender al worker mientras el hijo arranca.
        local key = tokens[1]
        if valid_key(key) then
            local st = read_state(key)
            if is_alive(st, now()) then
                return resp_ok_open(st.gen, st.state, st.seq, out_dir(key, st.gen))
            end
        end
        return execute_plan(locked(line))
    end

    return execute_plan(locked(line))
end

local function handle_line(line)
    local ok, res = pcall(dispatch, line)
    if not ok then
        log("internal error: " .. tostring(res))
        return resp_err("internal", "dispatch")
    end
    return res
end

-- ── autotest determinista (sin red; adaptadores y dirs temporales) ─────────
local function selftest()
    local pass, fail = 0, 0
    local function ok(name, cond, detail)
        if cond then
            pass = pass + 1
            io.write("SELFTEST PASS ", name, "\n")
        else
            fail = fail + 1
            io.write("SELFTEST FAIL ", name, detail and (" :: " .. tostring(detail)) or "", "\n")
        end
        return cond
    end
    local function eq(name, a, b) return ok(name, a == b, "got=" .. tostring(a) .. " want=" .. tostring(b)) end

    -- entorno temporal propio
    local base = os.tmpname()
    os.remove(base)
    mkdir_p(base)
    local saved = {}
    for k, v in pairs(CFG) do saved[k] = v end
    CFG.root = base .. "/run"
    CFG.state_dir = base .. "/state"
    CFG.conf_dir = base .. "/etc"
    CFG.window_root = base .. "/window"
    CFG.allowlist = base .. "/etc/providers.allow"
    CFG.urls = base .. "/etc/urls.conf"
    CFG.coord_url = "http://127.0.0.1:1"   -- nunca se usa: relay es adaptador
    CFG.max_sessions = 2
    CFG.stale_after = 45
    CFG.backoff_base = 1
    CFG.spec_owner = "root:www-data"
    CFG.relay_on = true
    CFG.restart_support = true
    mkdir_p(CFG.root .. "/spec")
    mkdir_p(CFG.conf_dir)
    mkdir_p(CFG.window_root)
    local SECRET = "SUPERSECRET_TOKEN_42"
    local f = assert(io.open(CFG.allowlist, "w"))
    f:write("# allowlist de prueba\nprovider.example\nprovider.two\n")
    f:close()
    f = assert(io.open(CFG.urls, "w"))
    f:write("provider.example|chan-1=https://provider.example/live/user/" .. SECRET .. "/chan-1.m3u8\n")
    f:write("provider.example|chan-2=https://provider.example/live/user/" .. SECRET .. "/chan-2.m3u8\n")
    f:close()

    local CLOCK = 1000
    local ORDER, RELAYS, SPAWNS, STOPS, RESTARTS = {}, {}, 0, 0, 0
    local SPEC_AT_START, SPEC_AT_RESTART = {}, {}
    AD.now = function() return CLOCK end
    AD.log = function(line) LOGS[#LOGS + 1] = line end
    AD.relay = function(op, p)
        ORDER[#ORDER + 1] = "relay:" .. op .. (p.state and (":" .. p.state) or "")
        RELAYS[#RELAYS + 1] = { op = op, p = p }
        return "200"
    end
    AD.spawn = function(key)
        SPAWNS = SPAWNS + 1
        ORDER[#ORDER + 1] = "start"
        SPEC_AT_START[key] = file_read(spec_path(key)) ~= nil
        return true
    end
    AD.stop = function(key) STOPS = STOPS + 1; ORDER[#ORDER + 1] = "stop"; return true end
    AD.restart = function(key)
        RESTARTS = RESTARTS + 1
        ORDER[#ORDER + 1] = "restart"
        SPEC_AT_RESTART[key] = file_read(spec_path(key)) ~= nil
        return true
    end
    -- Las mutaciones de estado se ejecutan en el hijo con flock; en el test se
    -- simulan en proceso (determinista, sin subprocesos).
    AD.locked = function(line) return state_dispatch(line) end

    local function idx(prefix)
        for i = 1, #ORDER do
            if ORDER[i]:sub(1, #prefix) == prefix then return i end
        end
        return nil
    end
    local function last_relay(op)
        for i = #RELAYS, 1, -1 do
            if RELAYS[i].op == op then return RELAYS[i] end
        end
        return nil
    end

    local key1 = "aaaaaaaaaaaaaaaa"
    local key2 = "bbbbbbbbbbbbbbbb"
    local key3 = "cccccccccccccccc"

    -- 1) PING / bad_op
    eq("PING responde PONG", dispatch("PING -"), "PONG")
    eq("op desconocida → bad_op", (dispatch("NOPE -"):find("code=bad_op", 1, true) ~= nil), true)

    -- 2) OPEN inicial: orden seed → spec → start → publish starting
    local r1 = dispatch("OPEN " .. key1 .. " provider.example|chan-1")
    ok("OPEN OK gen=1 starting", r1:find("^OK gen=1 state=starting", 1) ~= nil, r1)
    ok("OPEN devuelve path tmpfs", r1:find("path=" .. CFG.window_root .. "/" .. key1 .. "/1", 1, true) ~= nil, r1)
    ok("OPEN devuelve ttl", r1:find("ttl=" .. tostring(CFG.linger_ttl), 1, true) ~= nil, r1)
    eq("OPEN arranca UNA instancia", SPAWNS, 1)
    ok("orden seed antes del start", (idx("relay:seed") or 999) < (idx("start") or 0))
    ok("spec existe en el momento del start", SPEC_AT_START[key1] == true)
    ok("orden start antes de publish starting", (idx("start") or 999) < (idx("relay:publish:starting") or 0))
    local rs = last_relay("seed")
    ok("seed lleva provider y channel", rs and rs.p.provider == "provider.example" and rs.p.channel == "chan-1")
    local spec = file_read(spec_path(key1)) or ""
    ok("spec MF_KEY", spec:find("MF_KEY=" .. key1, 1, true) ~= nil)
    ok("spec MF_GEN=1", spec:find("MF_GEN=1", 1, true) ~= nil)
    ok("spec MF_OUT es RUTA de ficheros", spec:find("MF_OUT=" .. CFG.window_root .. "/" .. key1 .. "/1/", 1, true) ~= nil)
    ok("spec MF_UPSTREAM_URL presente", spec:find("MF_UPSTREAM_URL=", 1, true) ~= nil)
    ok("spec MF_IDEM presente", spec:find("MF_IDEM=", 1, true) ~= nil)
    ok("spec contiene la URL con credenciales", spec:find(SECRET, 1, true) ~= nil)
    ok("spec NO expone credenciales en la respuesta", r1:find(SECRET, 1, true) == nil)
    local mode = trim((io.popen("stat -c '%a' " .. shq(spec_path(key1)) .. " 2>/dev/null") or {}):read("*a") or "")
    eq("spec modo 0640", mode, "640")
    local grp = trim((io.popen("stat -c '%G' " .. shq(spec_path(key1)) .. " 2>/dev/null") or {}):read("*a") or "")
    eq("spec grupo www-data", grp, "www-data")
    local tmps = trim((io.popen("ls -1 " .. shq(CFG.root .. "/spec") .. " 2>/dev/null | grep -c '\\.tmp$'") or {}):read("*a") or "")
    eq("sin .tmp en spec (rename atómico)", tmps, "0")

    -- 3) OPEN idempotente
    local r2 = dispatch("OPEN " .. key1 .. " provider.example|chan-1")
    ok("OPEN idempotente misma gen/path", r2:find("^OK gen=1 state=starting", 1) ~= nil
        and r2:find("path=" .. CFG.window_root .. "/" .. key1 .. "/1", 1, true) ~= nil, r2)
    eq("OPEN idempotente NO spawn", SPAWNS, 1)

    -- 4) allowlist y resolución
    eq("proveedor fuera de allowlist rechazado",
        (dispatch("OPEN " .. key3 .. " blocked.example|canal"):find("code=provider_not_allowed", 1, true) ~= nil), true)
    eq("allowlist no arranca instancia", SPAWNS, 1)
    ok("canal sin URL rechazado",
        (dispatch("OPEN " .. key3 .. " provider.example|chan-x"):find("code=no_upstream", 1, true) ~= nil))
    eq("no_upstream no arranca instancia", SPAWNS, 1)

    -- 5) límites MAX_SESSIONS
    ok("segunda sesión permitida", dispatch("OPEN " .. key2 .. " provider.example|chan-2"):find("^OK gen=1", 1) ~= nil)
    eq("dos instancias", SPAWNS, 2)
    ok("tercera sesión rechazada por límite",
        (dispatch("OPEN " .. key3 .. " provider.example|chan-1"):find("code=limit_reached", 1, true) ~= nil))
    eq("límite no arranca instancia", SPAWNS, 2)

    -- 6) PUBLISH / fencing / HEARTBEAT
    ok("PUBLISH live OK", dispatch("PUBLISH " .. key1 .. " 1 state=live seq=5"):find("^OK gen=1 state=live seq=5", 1) ~= nil)
    ok("estado live persistido", (read_state(key1) or {}).state == "live")
    ok("PUBLISH gen viejo → stale_generation",
        (dispatch("PUBLISH " .. key1 .. " 0 state=live seq=6"):find("code=stale_generation", 1, true) ~= nil))
    ok("PUBLISH gen futuro → stale_generation",
        (dispatch("PUBLISH " .. key1 .. " 9 state=live seq=6"):find("code=stale_generation", 1, true) ~= nil))
    ok("PUBLISH mal formado → bad_op",
        (dispatch("PUBLISH " .. key1 .. " 1 state=wat"):find("code=bad_op", 1, true) ~= nil))
    ok("HEARTBEAT OK", dispatch("HEARTBEAT " .. key1 .. " 1 seq=6"):find("^OK gen=1", 1) ~= nil)
    ok("HEARTBEAT gen viejo rechazado",
        (dispatch("HEARTBEAT " .. key1 .. " 0"):find("code=stale_generation", 1, true) ~= nil))

    -- 7) RESTART: rota gen, spec nuevo antes del restart, invalida el viejo
    local rr = dispatch("RESTART " .. key1 .. " 1 reason=stall")
    ok("RESTART → gen=2", rr:find("^OK gen=2 state=starting", 1) ~= nil, rr)
    eq("RESTART usa restart (sin stop+start)", RESTARTS, 1)
    ok("spec nuevo escrito antes del restart", SPEC_AT_RESTART[key1] == true)
    ok("spec del RESTART lleva gen=2", (file_read(spec_path(key1)) or ""):find("MF_GEN=2", 1, true) ~= nil)
    ok("PUBLISH gen viejo tras RESTART → stale",
        (dispatch("PUBLISH " .. key1 .. " 1 state=live"):find("code=stale_generation", 1, true) ~= nil))
    local rr_unsup_saved = CFG.restart_support
    CFG.restart_support = false
    ok("RESTART sin soporte → unsupported",
        (dispatch("RESTART " .. key1 .. " 2 reason=stall"):find("code=unsupported", 1, true) ~= nil))
    CFG.restart_support = rr_unsup_saved

    -- 8) FAIL y respawn con gen nuevo (persistencia)
    ok("FAIL OK", dispatch("FAIL " .. key1 .. " 2 reason=stall"):find("^OK gen=2 state=failed", 1) ~= nil)
    eq("FAIL para la instancia", STOPS, 1)
    ok("OPEN inmediato tras FAIL → backoff",
        (dispatch("OPEN " .. key1 .. " provider.example|chan-1"):find("code=backoff", 1, true) ~= nil))
    eq("backoff no spawn", SPAWNS, 2)
    CLOCK = CLOCK + CFG.backoff_base + 1
    local r4 = dispatch("OPEN " .. key1 .. " provider.example|chan-1")
    ok("OPEN tras FAIL → gen=3", r4:find("^OK gen=3 state=starting", 1) ~= nil, r4)
    eq("gen persistido en disco", read_gen(key1), 3)
    ok("PUBLISH gen 2 tras respawn → stale",
        (dispatch("PUBLISH " .. key1 .. " 2 state=live"):find("code=stale_generation", 1, true) ~= nil))
    ok("PUBLISH gen 3 OK", dispatch("PUBLISH " .. key1 .. " 3 state=live seq=1"):find("^OK gen=3", 1) ~= nil)

    -- 9) CLOSE idempotente y status
    ok("CLOSE OK", dispatch("CLOSE " .. key1 .. " 3"):find("^OK gen=3 state=closed", 1) ~= nil)
    ok("CLOSE repetido OK", dispatch("CLOSE " .. key1):find("^OK", 1) ~= nil)
    ok("STATUS responde sesiones", dispatch("STATUS -"):find("^OK sessions=", 1) ~= nil)
    ok("CLOSE gen viejo rechazado",
        (dispatch("CLOSE " .. key2 .. " 0"):find("code=stale_generation", 1, true) ~= nil))

    -- 9b) timeout propio del supervisor (sustituye WatchdogSec del worker bash)
    CLOCK = (read_state(key2).updated or CLOCK) + CFG.stale_after + 1
    local r5 = dispatch("OPEN " .. key2 .. " provider.example|chan-2")
    ok("timeout propio: sesión estancada → OPEN con gen nuevo",
        r5:find("^OK gen=2 state=starting", 1) ~= nil, r5)
    eq("spawn tras timeout", SPAWNS, 4)
    local old = io.popen("ls -1 " .. shq(CFG.window_root .. "/" .. key1) .. " 2>/dev/null")
    local old_dirs = trim(old:read("*a") or ""); old:close()
    eq("limpieza de generaciones viejas (sólo gen 3)", old_dirs, "3")

    -- 9c) B1: OPEN concurrente con un start en curso; el worker publica en el
    -- acto y la sesión llega a live sin deadlock (el lock NO cubre el start).
    local b1key = "dddddddddddddddd"
    local before_spawns = SPAWNS
    local inner = {}
    local prev_spawn = AD.spawn
    AD.spawn = function(k)
        SPAWNS = SPAWNS + 1
        ORDER[#ORDER + 1] = "start"
        local gen = read_gen(k)
        inner.open = dispatch("OPEN " .. k .. " provider.example|chan-1")
        inner.pub = dispatch("PUBLISH " .. k .. " " .. tostring(gen) .. " state=starting seq=0")
        inner.live = dispatch("PUBLISH " .. k .. " " .. tostring(gen) .. " state=live seq=1")
        return true
    end
    local rb1 = dispatch("OPEN " .. b1key .. " provider.example|chan-1")
    AD.spawn = prev_spawn
    ok("B1 OPEN inicial OK", rb1:find("^OK gen=1", 1) ~= nil, rb1)
    ok("B1 OPEN durante start no espera (misma gen)",
        inner.open and inner.open:find("^OK gen=1", 1) ~= nil, inner.open)
    ok("B1 PUBLISH starting durante start aceptado",
        inner.pub and inner.pub:find("^OK gen=1 state=starting", 1) ~= nil, inner.pub)
    ok("B1 PUBLISH live durante start aceptado",
        inner.live and inner.live:find("^OK gen=1 state=live", 1) ~= nil, inner.live)
    eq("B1 sesión llega a live sin deadlock", (read_state(b1key) or {}).state, "live")
    eq("B1 sin spawn duplicado", SPAWNS, before_spawns + 1)

    -- 10) sin secretos en logs ni respuestas
    local leak = false
    for i = 1, #LOGS do if LOGS[i]:find(SECRET, 1, true) then leak = true end end
    ok("logs sin credenciales", not leak)
    ok("respuestas sin credenciales", not (r1 .. r2 .. r4 .. rr):find(SECRET, 1, true))

    -- 11) allowlist ausente ⇒ rechazo motivado
    local saved_allow = CFG.allowlist
    CFG.allowlist = base .. "/etc/does-not-exist.allow"
    ok("allowlist ausente rechaza", (dispatch("OPEN " .. key3 .. " provider.example|chan-1"):find("code=provider_not_allowed", 1, true) ~= nil))
    CFG.allowlist = saved_allow

    -- limpieza
    AD.now = nil
    AD.log = nil
    AD.relay = nil
    AD.locked = nil
    AD.spawn = nil
    AD.stop = nil
    AD.restart = nil
    os.execute("rm -rf " .. shq(base) .. " 2>/dev/null")
    for k, v in pairs(saved) do CFG[k] = v end

    io.write(string.format("SELFTEST pass=%d fail=%d\n", pass, fail))
    if fail == 0 then
        io.write("SUPERVISOR_SELFTEST_OK\n")
        return 0
    end
    io.write("SUPERVISOR_SELFTEST_FAILED\n")
    return 1
end

-- ── main ────────────────────────────────────────────────────────────────────
local function arg_has(flag)
    if type(arg) ~= "table" then return false end
    for i = 1, #arg do if arg[i] == flag then return true end end
    return false
end

if arg_has("--selftest") then
    os.exit(selftest())
elseif arg_has("--locked-state") then
    local line = io.read("*l")
    local res
    if line then
        local ok, r = pcall(state_dispatch, line)
        res = ok and r or ("RET " .. resp_err("internal", "state"))
    else
        res = "RET " .. resp_err("bad_op", "empty")
    end
    io.write(res, "\n")
    io.flush()
    os.exit(0)
elseif arg_has("--handle") then
    local line = io.read("*l")
    if not line then
        io.write(resp_err("bad_op", "empty"), "\n")
        io.flush()
        os.exit(0)
    end
    local res = handle_line(line)
    io.write(res, "\n")
    io.flush()
    os.exit(0)
else
    io.stderr:write("ape-supervisor: use --handle (vía ape-supervisor.sh) o --selftest\n")
    os.exit(2)
end
