-- ═══════════════════════════════════════════════════════════════════════════
-- ARA-X · `/sync` — variante Lua SEGURA y STAGED (I3-LUA / t24 + V3-R2 / t28)
-- ═══════════════════════════════════════════════════════════════════════════
-- REPO-ONLY. NO desplegado. NO intercepta `/lists/` ni ningún path de playback.
--
-- Correcciones V3 aplicadas aquí:
--   V3-F-03: SHA-256/HMAC viven EMBEBIDOS en este módulo (código RFC 6234/4231
--            copiado del helper existente). No se carga `ape_attr`, así que su
--            auto-serve no se dispara y no contamina la respuesta.
--   V3-F-04: la política usa SOLO los campos de `sync_response.schema.json`;
--            el SoC canónico viaja en `device.soc` y en la cabecera
--            `X-ARA-Soc-Canonical` (no como campo extra del body).
--   V3-F-05: clave GLOBAL — NO es auth por dispositivo. Sigue **NO-GO** de
--            producción (ver `ara-x/vps/lua/README.md`); no se declara resuelta.
--   V3-F-07: el 429 propio lleva `Retry-After`; el `limit_req` de nginx lo
--            añade el snippet con `add_header Retry-After 30 always`.
--   V3-F-10: parser estricto: `seq`/`ts` enteros, rechazo de claves top-level
--            extra/duplicadas y `soc=unknown` exige `soc_raw`.
--   V3-F-11: `content` no se emite desde Lua (no se inyecta JSON de shared).
--
-- Contrato D3: POST /sync, body <= 16 KB, canonical
--   ARA-X-SYNC-V1 \n device_id \n seq \n ts \n nonce \n sha256_hex(raw_body)
-- Estado en `ngx.shared.ara_sync_lua` con TTL: seq por device, nonce 600 s,
-- replay exacto 120 s, rate 6/60 s -> 429 + Retry-After.
-- 8K SOLO presentación (`eight_k="presentation_only"`); nunca resolución 8K,
-- nunca un conmutador de 8K del cliente, nunca downscale.
--
-- Limitaciones honestas (staged):
--   * Clave global (F-05): producción NO-GO hasta store por dispositivo (B2/B3).
--   * Parser de sobre estricto, no validador JSON completo: la validación
--     profunda del schema sigue en el PHP staged.
--   * `luac -p` = NOT_RUN (sin Lua local). `nginx -t` = NOT_RUN (sin ventana).
--
-- Requisitos de contexto http (los añade el dueño del nginx, NO este módulo):
--   lua_shared_dict ara_sync_lua 1m;
--   limit_req_zone $binary_remote_addr zone=ara_sync_lua:1m rate=3r/m;
--   limit_req_status 429;
--   lua_package_path "/etc/nginx/lua/?.lua;;";   (ya existe en nginx.conf:22)
-- ═══════════════════════════════════════════════════════════════════════════

local M = {}

M.VERSION = "2"
M.MAX_BODY = 16384
M.REQ_PREFIX = "ARA-X-SYNC-V1"
M.RESP_PREFIX = "ARA-X-SYNC-RESP-V1"
M.SHARED = "ara_sync_lua"
M.KEY_PATH = "/etc/nginx/lua/ara_sync.key" -- 0600; separada de la clave global de /a/
M.TS_SKEW = 300
M.NONCE_TTL = 600
M.REPLAY_TTL = 120
M.RATE_WINDOW = 60
M.RATE_MAX = 6
M.RATE_RETRY_AFTER = 30

M.SOCS = { mt8696 = true, amlogic = true, s905x4 = true, s905x3 = true, unknown = true }
M.NO_WIRE_8K = { s905x4 = true, s905x3 = true, mt8696 = true, amlogic = true }

local ALLOWED_TOP = {
    v = true, type = true, device_id = true, seq = true, ts = true, nonce = true,
    client = true, ref = true, metrics = true, state = true, session = true,
    events = true, capabilities = true
}
local REQUIRED_TOP = {
    v = true, type = true, device_id = true, seq = true, ts = true, nonce = true,
    client = true, ref = true
}

-- ── bit ops puras (Lua 5.1/LuaJIT sin require) ─────────────────────────────
local BAND, BXOR = {}, {}
for i = 0, 15 do
    BAND[i], BXOR[i] = {}, {}
    for j = 0, 15 do
        local a, b, r, r2, p = i, j, 0, 0, 1
        for _ = 1, 4 do
            if a % 2 == 1 and b % 2 == 1 then r = r + p end
            if (a % 2) ~= (b % 2) then r2 = r2 + p end
            a = (a - a % 2) / 2
            b = (b - b % 2) / 2
            p = p * 2
        end
        BAND[i][j], BXOR[i][j] = r, r2
    end
end
local function nib(fn, a, b)
    local r, m = 0, 1
    for _ = 1, 8 do
        local na, nb = a % 16, b % 16
        r = r + fn[na][nb] * m
        a = (a - na) / 16
        b = (b - nb) / 16
        m = m * 16
    end
    return r
end
local function band(a, b) return nib(BAND, a, b) end
local function bxor(a, b) return nib(BXOR, a, b) end
local function bnot(a) return 4294967295 - a end
local function lshift(a, n) return (a * 2 ^ n) % 4294967296 end
local function rshift(a, n) return math.floor(a / 2 ^ n) % 4294967296 end

-- ── SHA-256 + HMAC-SHA256 (RFC 6234/4231; copiado del helper existente) ───
local K = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
}

local function ror(x, n) return bxor(rshift(x, n), lshift(x, 32 - n)) % 4294967296 end
local function add(...)
    local s = 0
    for _, v in ipairs({ ... }) do s = s + v end
    return s % 4294967296
end

local function sha256(msg)
    local len = #msg
    local bits = len * 8
    msg = msg .. "\128" .. string.rep("\0", (55 - len) % 64)
    local hi = math.floor(bits / 4294967296) % 4294967296
    local lo = bits % 4294967296
    local be = {}
    for shift = 24, 0, -8 do be[#be + 1] = string.char(math.floor(hi / 2 ^ shift) % 256) end
    for shift = 24, 0, -8 do be[#be + 1] = string.char(math.floor(lo / 2 ^ shift) % 256) end
    msg = msg .. table.concat(be)

    local h0, h1, h2, h3 = 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a
    local h4, h5, h6, h7 = 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    local W = {}
    for chunk = 1, #msg, 64 do
        for i = 0, 15 do
            local b1, b2, b3, b4 = msg:byte(chunk + i * 4, chunk + i * 4 + 3)
            W[i] = ((b1 * 256 + b2) * 256 + b3) * 256 + b4
        end
        for i = 16, 63 do
            local s0 = bxor(bxor(ror(W[i - 15], 7), ror(W[i - 15], 18)), rshift(W[i - 15], 3))
            local s1 = bxor(bxor(ror(W[i - 2], 17), ror(W[i - 2], 19)), rshift(W[i - 2], 10))
            W[i] = add(W[i - 16], s0, W[i - 7], s1)
        end
        local a, b, c, d, e, f, g, h = h0, h1, h2, h3, h4, h5, h6, h7
        for i = 0, 63 do
            local S1 = bxor(bxor(ror(e, 6), ror(e, 11)), ror(e, 25))
            local ch = bxor(band(e, f), band(bnot(e), g))
            local t1 = add(h, S1, ch, K[i + 1], W[i])
            local S0 = bxor(bxor(ror(a, 2), ror(a, 13)), ror(a, 22))
            local mj = bxor(band(a, b), bxor(band(a, c), band(b, c)))
            local t2 = add(S0, mj)
            h, g, f, e, d, c, b, a = g, f, e, add(d, t1), c, b, a, add(t1, t2)
        end
        h0, h1 = add(h0, a), add(h1, b)
        h2, h3 = add(h2, c), add(h3, d)
        h4, h5 = add(h4, e), add(h5, f)
        h6, h7 = add(h6, g), add(h7, h)
    end
    local out = {}
    for _, v in ipairs({ h0, h1, h2, h3, h4, h5, h6, h7 }) do
        for shift = 24, 0, -8 do out[#out + 1] = string.char(math.floor(v / 2 ^ shift) % 256) end
    end
    return table.concat(out)
end

local function hmac_sha256(key, msg)
    if #key > 64 then key = sha256(key) end
    key = key .. string.rep("\0", 64 - #key)
    local ipad, opad = {}, {}
    for i = 1, 64 do
        local b = key:byte(i)
        ipad[i] = string.char(bxor(b, 0x36))
        opad[i] = string.char(bxor(b, 0x5c))
    end
    return sha256(table.concat(opad) .. sha256(table.concat(ipad) .. msg))
end

local function hex(s)
    if type(s) ~= "string" then return nil end
    local out = {}
    for i = 1, #s do out[#out + 1] = string.format("%02x", s:byte(i)) end
    return table.concat(out)
end

local cached_key
local function load_key(path)
    if cached_key ~= nil then return cached_key end
    local f = io.open(path or M.KEY_PATH, "rb")
    if not f then cached_key = ""; return "" end
    cached_key = (f:read("*a") or ""):gsub("%s+$", "")
    f:close()
    return cached_key
end

local function json_str(s)
    s = tostring(s)
    s = s:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n"):gsub("\r", "\\r")
    return '"' .. s .. '"'
end

local function now_s()
    if ngx and ngx.time then return ngx.time() end
    return os.time()
end

local function body_raw()
    local data = ngx.req.get_body_data()
    if data then return data end
    local file = ngx.req.get_body_file()
    if not file then return nil end
    local fh = io.open(file, "rb")
    if not fh then return nil end
    local content = fh:read(M.MAX_BODY + 1)
    fh:close()
    return content
end

local function jstr(body, key)
    local m = ngx.re.match(body, '"' .. key .. '"%s*:%s*"([^"\\]*)%"', "jo")
    return m and m[1] or nil
end

local function jnum(body, key)
    local m = ngx.re.match(body, '"' .. key .. '"%s*:%s*(-?%d+%.?%d*)', "jo")
    return m and tonumber(m[1]) or nil
end

-- F-10: enteros estrictos; `1.0`, `1e3` o `1.5` se rechazan.
local function jint(body, key)
    local m = ngx.re.match(body, '"' .. key .. '"%s*:%s*(-?%d+)([%.eE]?)', "jo")
    if not m then return nil, "missing" end
    if m[2] and m[2] ~= "" then return nil, "non_integer" end
    local n = tonumber(m[1])
    if not n or n ~= math.floor(n) or n < 1 or n > 2147483647 then return nil, "non_integer" end
    return n
end

-- F-10: scanner de claves top-level (rechaza extra/duplicadas/trailing junk).
local function scan_top_keys(body)
    if type(body) ~= "string" or #body < 2 or body:sub(1, 1) ~= "{" then return nil, "json" end
    local n = #body
    local i = 1
    local depth = 0
    local expect_key = false
    local keys, seen = {}, {}
    while i <= n do
        local c = body:sub(i, i)
        if c == '"' then
            local j = i + 1
            local esc = false
            local buf = {}
            while j <= n do
                local d = body:sub(j, j)
                if esc then buf[#buf + 1] = d; esc = false
                elseif d == "\\" then esc = true
                elseif d == '"' then break
                else buf[#buf + 1] = d end
                j = j + 1
            end
            if j > n then return nil, "unterminated" end
            if depth == 1 and expect_key then
                local key = table.concat(buf)
                if seen[key] then return nil, "duplicate:" .. key end
                seen[key] = true
                keys[#keys + 1] = key
                expect_key = false
            end
            i = j + 1
        elseif c == "{" or c == "[" then
            depth = depth + 1
            if depth == 1 and c ~= "{" then return nil, "root" end
            if depth == 1 then expect_key = true end
            i = i + 1
        elseif c == "}" or c == "]" then
            depth = depth - 1
            if depth < 0 then return nil, "unbalanced" end
            if depth == 0 then
                if c ~= "}" then return nil, "root" end
                if body:sub(i + 1):match("^%s*$") == nil then return nil, "trailing" end
                local count = #keys
                if count == 0 then return nil, "empty" end
                if expect_key then return nil, "trailing_comma" end
                for k in pairs(REQUIRED_TOP) do
                    if not seen[k] then return nil, "missing:" .. k end
                end
                for _, k in ipairs(keys) do
                    if not ALLOWED_TOP[k] then return nil, "extra:" .. k end
                end
                return keys
            end
            i = i + 1
        elseif c == "," then
            if depth == 1 then expect_key = true end
            i = i + 1
        else
            i = i + 1
        end
    end
    return nil, "unterminated"
end

local function thermal_status(body)
    local start = body:find('"pm_thermal_status"', 1, true)
    if not start then return nil end
    local chunk = body:sub(start, start + 160)
    local m = ngx.re.match(chunk, '"value"%s*:%s*(%d+)', "jo")
    return m and tonumber(m[1]) or nil
end

local function hmac_ok(key, canonical, presented)
    if type(key) ~= "string" or key == "" then return false, "sync_disabled" end
    if type(presented) ~= "string" then return false, "unauthorized" end
    presented = presented:lower()
    if #presented ~= 64 or presented:find("[^0-9a-f]") then return false, "unauthorized" end
    local expected = hex(hmac_sha256(key, canonical))
    if type(expected) ~= "string" or #expected ~= 64 then return false, "unavailable" end
    local diff = 0
    for i = 1, 64 do
        diff = diff + math.abs(expected:byte(i) - presented:byte(i))
    end
    if diff ~= 0 then return false, "unauthorized" end
    return true
end

local function shared_state()
    local dict = ngx.shared[M.SHARED]
    if not dict then return nil end
    return dict
end

local function policy_body(body, device_id, seq, ts, soc, artifact, generation, list_version, lab_exported, thermal)
    local no_wire = M.NO_WIRE_8K[soc] == true
    local unknown = soc == "unknown"
    local allowed = not unknown
    local min_res = (unknown or not no_wire) and "1920x1080" or "3840x2160"
    if no_wire then min_res = "3840x2160" end
    local target_fps = 30
    local declared = jnum(body, "fps")
    if declared and declared >= 50 then target_fps = 60
    elseif declared and declared >= 25 then target_fps = 30
    elseif declared then target_fps = 24 end
    local hot = type(thermal) == "number" and thermal >= 3
    local tier = hot and "minimal" or "quality"
    local reason = hot and "thermal_guard" or "nominal"
    local levers = "{}"
    if allowed then levers = '{"pq_ai_sr_enable":1,"ai_sr_level":3,"pq_hdr_enable":1}' end
    local status = thermal and tostring(thermal) or '"unknown"'
    local eight_k = unknown and '"disabled"' or '"presentation_only"'
    local etag_src = table.concat({ "ara-x-lua", soc, tostring(seq), tostring(ts), tostring(target_fps) }, "|")
    local etag = hex(sha256(etag_src))

    local parts = {
        '{"v":2,"type":"ara_x_policy"',
        ',"device_id":' .. json_str(device_id),
        ',"seq":' .. tostring(seq),
        ',"ts":' .. tostring(ts),
        ',"valid_until":' .. tostring(ts + 30),
        ',"policy_etag":"sha256:' .. etag .. '"',
        ',"profile":{"active":"P2","blend":{"P2":1},"reason":' .. json_str(reason) .. '}',
        ',"player":{"buffer_s":' .. (hot and "60" or "45") .. ',"abr_bw_factor":0.78,"reconnect_attempts":156,"live_delay_s":10,"max_bitrate_bps":25000000,"min_bitrate_bps":6000000}',
        ',"device":{"allowed":' .. tostring(allowed) .. ',"soc":' .. json_str(soc) .. ',"thermal_target_c":' .. (hot and "65" or "70") .. ',"levers":' .. levers .. '}',
        ',"display":{"mode":' .. ((unknown or not no_wire) and '"native"' or '"4k"') .. ',"wire_resolution":' .. json_str(min_res) .. ',"min_resolution":' .. json_str(min_res) .. ',"never_downscale":true,"eight_k":' .. eight_k .. ',"hdr_hint":"SDR"}',
        ',"fps":{"target":' .. tostring(target_fps) .. ',"current":' .. (declared and tostring(declared) or "null") .. ',"min":24}',
        ',"thermal":{"status":' .. status .. ',"limits":{"light_c":60,"moderate_c":66,"severe_c":72,"critical_c":78}}',
        ',"processing":{"tier":' .. json_str(tier) .. '}',
        ',"degrade":{"order":["fps","processing"]}',
        ',"controls":{"sync_next_s":30,"flags":' .. (hot and '["thermal_guard"]' or '["nominal"]') .. ',"degrade_mask":0}',
        ',"ref":{"artifact_sha256":' .. json_str(artifact) .. ',"generation_id":' .. json_str(generation or "unknown") .. ',"list_version":' .. json_str(list_version or "unknown") .. ',"lab_exported_at":' .. json_str(lab_exported or "unknown") .. '}',
        "}"
    }
    return table.concat(parts), etag
end

local function handle()
    if not ngx or not ngx.req then return { status = 503, body = '{"ok":false,"error":"unavailable"}' } end
    if ngx.req.get_method() ~= "POST" then
        return { status = 405, body = '{"ok":false,"error":"method_not_allowed"}' }
    end
    local ctype = (ngx.req.get_headers()["content-type"] or ""):lower()
    if ctype:find("application/json", 1, true) ~= 1 then
        return { status = 415, body = '{"ok":false,"error":"unsupported_media_type"}' }
    end

    local body = body_raw()
    if not body then return { status = 400, body = '{"ok":false,"error":"empty_body"}' } end
    if #body > M.MAX_BODY then return { status = 413, body = '{"ok":false,"error":"payload_too_large"}' } end

    local keys = scan_top_keys(body)
    if not keys then return { status = 400, body = '{"ok":false,"error":"invalid_json"}' } end

    local device_id = jstr(body, "device_id")
    local seq, seqErr = jint(body, "seq")
    local ts, tsErr = jint(body, "ts")
    local nonce = jstr(body, "nonce")
    local soc = jstr(body, "soc")
    local artifact = jstr(body, "artifact_sha256")
    if not device_id or not device_id:match("^[A-Za-z0-9._%-]{3,128}$") then
        return { status = 400, body = '{"ok":false,"error":"bad_device"}' }
    end
    if not seq or not ts or seqErr or tsErr then
        return { status = 400, body = '{"ok":false,"error":"bad_seq_ts"}' }
    end
    if not nonce or not nonce:match("^[a-f0-9]+$") or #nonce < 16 or #nonce > 64 then
        return { status = 400, body = '{"ok":false,"error":"bad_nonce"}' }
    end
    if not soc or not M.SOCS[soc] then
        return { status = 400, body = '{"ok":false,"error":"bad_soc"}' }
    end
    if soc == "unknown" then
        local raw = jstr(body, "soc_raw")
        if not raw or not raw:match("^[A-Za-z0-9._-]{1,64}$") then
            return { status = 400, body = '{"ok":false,"error":"soc_raw_required"}' }
        end
    end
    if not artifact or #artifact ~= 64 or artifact:find("[^0-9a-f]") then
        return { status = 400, body = '{"ok":false,"error":"bad_artifact"}' }
    end

    local key = load_key(M.KEY_PATH)
    if type(key) ~= "string" or key == "" then
        return { status = 503, body = '{"ok":false,"error":"sync_disabled"}' }
    end
    local dict = shared_state()
    if not dict then return { status = 503, body = '{"ok":false,"error":"shared_state_unavailable"}' } end

    local version = ngx.req.get_headers()["x-ara-sync-version"] or ""
    if tostring(version) ~= M.VERSION then
        return { status = 401, body = '{"ok":false,"error":"unauthorized"}' }
    end
    local now = now_s()
    if math.abs(now - ts) > M.TS_SKEW then
        return { status = 401, body = '{"ok":false,"error":"unauthorized"}' }
    end

    local body_hash = hex(sha256(body))
    local canonical = table.concat({ M.REQ_PREFIX, device_id, tostring(seq), tostring(ts), nonce, body_hash }, "\n")
    local ok, reason = hmac_ok(key, canonical, ngx.req.get_headers()["x-ara-sig"])
    if not ok then
        if reason == "sync_disabled" then return { status = 503, body = '{"ok":false,"error":"sync_disabled"}' } end
        return { status = 401, body = '{"ok":false,"error":"unauthorized"}' }
    end

    local qkey = "q:" .. device_id
    local count = dict:incr(qkey, 1, 0, M.RATE_WINDOW)
    if not count then
        count = dict:get(qkey) or 1
        dict:set(qkey, count, M.RATE_WINDOW)
    end
    if count > M.RATE_MAX then
        return {
            status = 429,
            body = '{"ok":false,"error":"rate_limited"}',
            headers = { ["Retry-After"] = tostring(M.RATE_RETRY_AFTER) }
        }
    end

    local nonce_key = "n:" .. device_id .. ":" .. hex(sha256(nonce))
    local seq_key = "s:" .. device_id
    local replay_key = "r:" .. device_id .. ":" .. tostring(seq)
    local last_seq = dict:get(seq_key)

    local cached = dict:get(replay_key)
    if cached and cached == body_hash and dict:get("rb:" .. device_id .. ":" .. tostring(seq)) then
        return {
            status = 200,
            body = dict:get("rb:" .. device_id .. ":" .. tostring(seq)),
            headers = {
                ["X-ARA-Sig"] = dict:get("rs:" .. device_id .. ":" .. tostring(seq)) or "",
                ["X-ARA-Idempotent"] = "1"
            }
        }
    end
    if dict:get(nonce_key) then
        return { status = 409, body = '{"ok":false,"error":"replay"}' }
    end
    if last_seq and seq <= last_seq then
        return { status = 409, body = '{"ok":false,"error":"replay"}' }
    end
    dict:set(nonce_key, 1, M.NONCE_TTL)

    local generation = jstr(body, "generation_id")
    local list_version = jstr(body, "list_version")
    if generation and #generation > 64 then generation = nil end
    if list_version and #list_version > 64 then list_version = nil end
    local lab_exported = dict:get("lab_exported_at")

    local response, etag = policy_body(body, device_id, seq, ts, soc, artifact, generation, list_version, lab_exported, thermal_status(body))
    local resp_hash = hex(sha256(response))
    local resp_canonical = table.concat({ M.RESP_PREFIX, device_id, tostring(seq), tostring(ts), resp_hash }, "\n")
    local resp_sig = hex(hmac_sha256(key, resp_canonical))

    dict:set(seq_key, seq, 86400)
    dict:set(replay_key, body_hash, M.REPLAY_TTL)
    dict:set("rb:" .. device_id .. ":" .. tostring(seq), response, M.REPLAY_TTL)
    dict:set("rs:" .. device_id .. ":" .. tostring(seq), resp_sig, M.REPLAY_TTL)

    return {
        status = 200,
        body = response,
        headers = {
            ["X-ARA-Sig"] = resp_sig,
            ["X-ARA-Policy-Etag"] = "sha256:" .. etag,
            ["X-ARA-Sync-Version"] = M.VERSION,
            ["X-ARA-Soc-Canonical"] = soc
        }
    }
end

local function send(result)
    ngx.status = result.status
    ngx.header["Content-Type"] = "application/json; charset=utf-8"
    ngx.header["Cache-Control"] = "no-store"
    ngx.header["Pragma"] = "no-cache"
    ngx.header["X-Content-Type-Options"] = "nosniff"
    ngx.header["X-ARA-Sync-Version"] = M.VERSION
    if result.headers then
        for k, v in pairs(result.headers) do ngx.header[k] = v end
    end
    ngx.print(result.body)
    return ngx.exit(result.status)
end

local ok, result = pcall(handle)
if not ok then
    ngx.log(ngx.ERR, "ara-x-sync lua failure: ", tostring(result))
    return send({ status = 503, body = '{"ok":false,"error":"unavailable"}' })
end
return send(result)
