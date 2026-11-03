-- ═══════════════════════════════════════════════════════════════════════════
-- APE ATTR — /a v2 · contrato `#EXTATTRFROMURL` (endpoint de atributos por canal)
-- ═══════════════════════════════════════════════════════════════════════════
-- REPO-ONLY: este módulo NO está desplegado. Diseño y contrato completos en
-- docs/rea/14_APE_A_CONTRACT.md.
--
-- GET /a/2/{c}/{s}/{p}/{payload}/{h}
--   payload = base64url( mask[125 B] .. body[2 B por bit encendido, big-endian] )
--             bit i de la máscara ⇒ slot i presente; body en orden de slot ascendente
--             valor 0xFFFF = "vacío" (slot presente pero sin valor)
--   h       = hex de los primeros 16 B de HMAC-SHA256( "2|c|s|p|payload" )
--
-- RESPUESTA: base64url SIN padding de un fragmento m3u con directivas D0..D6.
-- FAIL-OPEN SIEMPRE: clave ausente o HMAC inválido ⇒ 200 con `#EXT-X-APE-STALE:1`.
-- Nunca 4xx: un cliente con el HMAC roto debe seguir reproduciendo.
--
-- DECISIÓN: sólo lecturas de ngx.shared (ape_qoe / ape_flags). Cero disco por
-- petición (la clave HMAC se lee UNA vez y se cachea), cero SQLite, cero DNS.
-- ═══════════════════════════════════════════════════════════════════════════

local M = {}

M.VERSION      = "2"
M.SLOTS        = 1000
M.MASK_BYTES   = 125           -- 1000 bits
M.EMPTY        = 0xFFFF
M.KEY_PATH     = "/etc/nginx/lua/ape_attr.key"   -- 0600, fuera del repo
M.HMAC_BYTES   = 16
M.STALE_TAG    = "#EXT-X-APE-STALE:1"
M.MAX_FRAGMENT = 24            -- fragmentos de Capa B (n/tot)

-- ── bit ops: LuaJIT `bit` si existe; si no, aritmética pura (lua5.1) ───────
local okbit, bit = pcall(require, "bit")
local band, bxor, bnot, rshift, lshift
if okbit and bit then
    band   = bit.band
    bxor   = bit.bxor
    bnot   = bit.bnot
    rshift = bit.rshift
    lshift = bit.lshift
    M.fastpath = true
else
    M.fastpath = false
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
    band = function(a, b) return nib(BAND, a, b) end
    bxor = function(a, b) return nib(BXOR, a, b) end
    bnot = function(a) return 4294967295 - a end
    lshift = function(a, n) return (a * 2 ^ n) % 4294967296 end
    rshift = function(a, n) return math.floor(a / 2 ^ n) % 4294967296 end
end
M._bits = { band = band, bxor = bxor, bnot = bnot, rshift = rshift, lshift = lshift }

-- ── base64url (sin padding) ────────────────────────────────────────────────
local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
local B64IDX = {}
for i = 1, 64 do B64IDX[B64:sub(i, i)] = i - 1 end

function M.b64url_encode(s)
    local out, n = {}, #s
    local i = 1
    while i <= n do
        local a = s:byte(i) or 0
        local b = s:byte(i + 1)
        local c = s:byte(i + 2)
        local v = a * 65536 + (b or 0) * 256 + (c or 0)
        out[#out + 1] = B64:sub(math.floor(v / 262144) % 64 + 1, math.floor(v / 262144) % 64 + 1)
        out[#out + 1] = B64:sub(math.floor(v / 4096) % 64 + 1, math.floor(v / 4096) % 64 + 1)
        if b then out[#out + 1] = B64:sub(math.floor(v / 64) % 64 + 1, math.floor(v / 64) % 64 + 1) end
        if c then out[#out + 1] = B64:sub(v % 64 + 1, v % 64 + 1) end
        i = i + 3
    end
    return table.concat(out)
end

function M.b64url_decode(s)
    if type(s) ~= "string" or s == "" then return nil end
    s = s:gsub("%s", "")
    local out, acc, nbits = {}, 0, 0
    for i = 1, #s do
        local v = B64IDX[s:sub(i, i)]
        if not v then return nil end                      -- carácter inválido ⇒ nil
        acc = acc * 64 + v
        nbits = nbits + 6
        if nbits >= 8 then
            nbits = nbits - 8
            local byte = math.floor(acc / 2 ^ nbits) % 256
            out[#out + 1] = string.char(byte)
            acc = acc % 2 ^ nbits
        end
    end
    return table.concat(out)
end

-- ── SHA-256 + HMAC-SHA256 (puro Lua 5.1; RFC 6234 / RFC 4231) ──────────────
local K = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
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

function M.sha256(msg) return sha256(msg) end

function M.hmac_sha256(key, msg)
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

local function hex16(s)
    local out = {}
    for i = 1, M.HMAC_BYTES do out[#out + 1] = string.format("%02x", s:byte(i)) end
    return table.concat(out)
end

-- ── payload: máscara 125 B + body 2 B/slot ────────────────────────────────
-- Devuelve { slots = { [i] = valor }, count = n } o nil, motivo.
function M.parse_payload(payload)
    local raw = M.b64url_decode(payload)
    if not raw then return nil, "payload_b64_invalido" end
    if #raw < M.MASK_BYTES then return nil, "payload_corto" end

    local mask = raw:sub(1, M.MASK_BYTES)
    local body = raw:sub(M.MASK_BYTES + 1)

    -- contar bits encendidos (saturación: nunca más de 1000)
    local set, slots = 0, {}
    for slot = 0, M.SLOTS - 1 do
        local byte = mask:byte(math.floor(slot / 8) + 1)
        local isSet = math.floor(byte / 2 ^ (slot % 8)) % 2 == 1
        if isSet then
            set = set + 1
            slots[slot] = true
        end
    end
    if set > M.SLOTS then return nil, "mascara_saturada" end
    if #body ~= set * 2 then return nil, "body_longitud_incoherente" end

    local valores, cursor = {}, 1
    for slot = 0, M.SLOTS - 1 do
        if slots[slot] then
            local v = body:byte(cursor) * 256 + body:byte(cursor + 1)
            cursor = cursor + 2
            valores[slot] = v
        end
    end
    return { values = valores, count = set }
end

-- ── diccionario de slots (contrato §Diccionario de docs/rea/14) ───────────
M.SLOT = {
    URL_DELTA = 0, CODEC_ORDER = 1, VIDEO_TRACK = 2, SOURCE_FORMAT = 3,
    HTTP_UA_MODE = 4, HTTP_REFERER_MODE = 5, FLAGS = 6,
    DATA_MIN = 0, DATA_MAX = 15,          -- D0..D6 (config)
    CUSTOM_MIN = 16, CUSTOM_MAX = 895,    -- D6 namespace
    DIAG_MIN = 896, DIAG_MAX = 959,       -- diagnóstico
    CTRL_MIN = 960, CTRL_MAX = 999,       -- control (gen/ttl/stale) + diagnóstico
}
M.SOURCE_FORMAT = { [0] = "auto", [1] = "ts", [2] = "fmp4", [3] = "hls-ll" }

-- ── [t54] bits de FLAGS (slot 6) · documentados en docs/rea/22_SLOTS_ENDPOINT.md ──
-- 0x0002 = solicitar Capa B (contrato t47) · 0x0008/0x0010 = veredicto uhd4k/uhd8k
-- (medidos en t53) · 0x0004 = hdr · 0x0020 = interlace (invierte la cadena de codecs).
M.FLAG = {
    WANT_B    = 2,
    HDR       = 4,
    UHD4K     = 8,
    UHD8K     = 16,
    INTERLACE = 32,
    MASTER_HINT = 64,   -- [t62] el fragmento va a un MASTER (habilita SESSION-DATA)
}

function M.flag_set(flags, mask)
    flags = tonumber(flags) or 0
    if flags < 0 then flags = 0 end
    return math.floor(flags / mask) % 2 == 1
end

-- ── [t58] slots de CALIDAD (16..26) · 2 B BE · 0xFFFF = sin dato ──────────
-- Se emiten SÓLO si hay valor. Nunca se inventa un valor.
M.Q = {
    AUDIO_CODEC     = 16,   -- 1=AAC 2=AC3 3=EAC3 4=DTS 5=TRUEHD 6=OPUS
    AUDIO_CHANNELS  = 17,   -- nº de canales (2, 6, 8…)
    CHROMA          = 18,   -- 0=420 1=422 2=444
    GOP             = 19,   -- GOP en frames
    HDR_PROFILE     = 20,   -- 1=SDR 2=HDR10 3=HDR10+ 4=DV 5=HLG
    QUALITY_PROFILE = 21,   -- P0..P5 (índice)
    BIT_DEPTH       = 22,   -- 8/10/12
    FRAME_RATE      = 23,   -- fps × 100 (5994 = 59,94)
    SOURCE_W        = 24,
    SOURCE_H        = 25,
    TIER            = 26,   -- F0..F5 (índice)
}
M.FRAME_RATE_SCALE = 100
M.CHROMA_NAME = { [0] = "420", [1] = "422", [2] = "444" }

-- ── [t62] BUFFER INFINITO: hints de buffer por perfil (metadata, no vídeo) ──
-- `network-caching` lo honra VLC/Kodi; **OTT Navigator y TiviMate lo ignoran**.
-- `exoplayer.load_control` sólo tiene sentido en un MASTER (lo lee hls.js/ExoPlayer
-- si el integrador lo respeta); el fragmento NO es un master por sí mismo.
-- Nunca se promete que el player lo aplique: ver docs/rea/29_BUFFER_INFINITO.md.
M.BUFFER = {
    [0] = { cache = 3000, min_buf = 30000, play = 2500, rebuf = 5000 },
    [1] = { cache = 2500, min_buf = 25000, play = 2000, rebuf = 4000 },
    [2] = { cache = 2000, min_buf = 20000, play = 1500, rebuf = 3000 },
    [3] = { cache = 1500, min_buf = 15000, play = 1500, rebuf = 2500 },
    [4] = { cache = 1200, min_buf = 12000, play = 1200, rebuf = 2000 },
    [5] = { cache = 1000, min_buf = 10000, play = 1000, rebuf = 1500 },
}
function M.buffer_for(profile)
    local p = tonumber(profile)
    if p == nil or p < 0 or p > 5 then return M.BUFFER[2] end
    return M.BUFFER[p]
end

-- ── [t58] POST /a/cfg — config por sesión en ngx.shared, sin disco ni DB ──
M.CFG = {
    DICT        = "ape_attr_cfg",
    MAX_BODY    = 65536,     -- 64 KB (nginx además corta con client_max_body_size 64k)
    TTL_DEFAULT = 300,
    TTL_MAX     = 3600,
    RL_MAX      = 6,         -- 6 escrituras…
    RL_WINDOW   = 60,        -- …por ventana de 60 s y sesión
    HMAC_BYTES  = 16,
}

-- ── gate por UA ───────────────────────────────────────────────────────────
function M.detect_ua(ua)
    ua = (ua or ""):lower()
    if ua:find("ott navigator", 1, true) or ua:find("ottnavigator", 1, true)
        or ua:find("ott_navigator", 1, true) then
        return "ott"
    end
    if ua:find("tivimate", 1, true) or ua:find("tivi mate", 1, true) then return "tivimate" end
    return "other"
end

M.UA_GATE = {
    ott      = { D0 = true, D1 = true, D2 = true, D3 = true, D4 = true, D5 = true, D6 = true },
    tivimate = { D0 = true, D1 = false, D2 = false, D3 = false, D4 = false, D5 = true, D6 = false },
    other    = { D0 = true, D1 = false, D2 = false, D3 = false, D4 = false, D5 = true, D6 = false },
}

-- ── construcción del fragmento ────────────────────────────────────────────
-- @param valores  tabla slot->valor (puede ser vacía)
-- @param ua        UA crudo
-- @param ctx       { gen=, ttl=, stale=, url= }  (de ngx.shared; opcional)
function M.build_fragment(valores, ua, ctx)
    valores = valores or {}
    ctx = ctx or {}
    local kind = M.detect_ua(ua)
    local gate = M.UA_GATE[kind] or M.UA_GATE.other
    local out = {}

    local function v(slot) local x = valores[slot]; if x == M.EMPTY then return nil end return x end

    -- [t54] FLAGS (slot 6) se leen UNA vez y gobiernan D1 (interlace), Capa B (want_b)
    -- y el veredicto Q (uhd4k/uhd8k/hdr). Sin valor ⇒ 0 (comportamiento de t47 intacto).
    local flags = tonumber(valores[M.SLOT.FLAGS]) or 0
    if flags < 0 then flags = 0 end
    local function fset(mask) return M.flag_set(flags, mask) end

    -- D0: cambio de URL (por defecto se omite: URL-1 del playlist)
    if gate.D0 and v(M.SLOT.URL_DELTA) == 1 and ctx.url and ctx.url ~= "" then
        out[#out + 1] = "#EXT-X-APE-URL:" .. tostring(ctx.url)
    end
    -- D1: orden de codec. Slot 1 es el orden EXPLÍCITO (0 normal / 1 invertido);
    -- el bit INTERLACE de FLAGS sólo promociona 0 → invertido (el explícito manda).
    if gate.D1 and v(M.SLOT.CODEC_ORDER) ~= nil then
        local order = v(M.SLOT.CODEC_ORDER)
        local invert = (order == 1) or (order == 0 and fset(M.FLAG.INTERLACE))
        if invert then
            out[#out + 1] = "#EXT-X-APE-CODEC:soft_vlc,exo1,hard"
        else
            out[#out + 1] = "#EXT-X-APE-CODEC:hard,exo1,soft_vlc"
        end
    end
    -- D2: video-track
    if gate.D2 and v(M.SLOT.VIDEO_TRACK) then
        out[#out + 1] = "#EXT-X-APE-VIDEO-TRACK:" .. tostring(v(M.SLOT.VIDEO_TRACK))
    end
    -- D3: source-format
    if gate.D3 and v(M.SLOT.SOURCE_FORMAT) then
        out[#out + 1] = "#EXT-X-APE-SOURCE-FORMAT:"
            .. (M.SOURCE_FORMAT[v(M.SLOT.SOURCE_FORMAT)] or "auto")
    end
    -- D4: EXTHTTP (sólo OTT)
    if gate.D4 and (v(M.SLOT.HTTP_UA_MODE) or v(M.SLOT.HTTP_REFERER_MODE)) then
        local ua_mode = v(M.SLOT.HTTP_UA_MODE) or 0
        local ref_mode = v(M.SLOT.HTTP_REFERER_MODE) or 0
        if ua_mode ~= 0 or ref_mode ~= 0 then
            out[#out + 1] = '#EXTHTTP:{"User-Agent":"' .. (ua_mode == 2 and "VLC/3.0" or "okhttp/4.9")
                .. '","Referer":"' .. (ref_mode == 1 and "https://provider.local/" or "")
                .. '"}'
        end
    end
    -- D5: EXTVLCOPT (todos los UAs)
    if gate.D5 then
        local ua_mode = v(M.SLOT.HTTP_UA_MODE) or 0
        local ref_mode = v(M.SLOT.HTTP_REFERER_MODE) or 0
        if ua_mode ~= 0 then
            out[#out + 1] = "#EXTVLCOPT:http-user-agent=" .. (ua_mode == 2 and "VLC/3.0" or "okhttp/4.9")
        end
        if ref_mode ~= 0 then
            out[#out + 1] = "#EXTVLCOPT:http-referrer="
                .. (ref_mode == 1 and "https://provider.local/" or "https://provider.local/")
        end
    end
    -- [t62] BUFFER INFINITO: hint de buffer para el player (sólo si hay perfil).
    -- D5-class: `network-caching` (VLC/Kodi lo honran; OTT/TiviMate lo ignoran).
    local bufProf = v(M.Q.QUALITY_PROFILE)
    if bufProf ~= nil then
        local b = M.buffer_for(bufProf)
        if gate.D5 then
            out[#out + 1] = "#EXTVLCOPT:network-caching=" .. tostring(b.cache)
        end
        -- Sólo si el consumidor declara que el fragmento va a un MASTER (bit 0x0040).
        if gate.D6 and fset(M.FLAG.MASTER_HINT) then
            out[#out + 1] = '#EXT-X-SESSION-DATA:DATA-ID="exoplayer.load_control",VALUE="{'
                .. '\"minBufferMs\":' .. tostring(b.min_buf)
                .. ',\"bufferForPlaybackMs\":' .. tostring(b.play)
                .. ',\"bufferForPlaybackAfterRebufferMs\":' .. tostring(b.rebuf) .. '}"'
        end
    end

    -- D6: namespace de tags custom (sólo OTT)
    -- [t58] Los slots de CALIDAD (16..26) NO se emiten aquí: tienen su propio tag
    -- `#EXT-X-APE-AUDIO` / `#EXT-X-APE-Q`. Sin esta exclusión cada slot saldría dos veces.
    if gate.D6 then
        local slots = {}
        for s in pairs(valores) do
            if s >= M.SLOT.CUSTOM_MIN and s <= M.SLOT.CUSTOM_MAX
                and not (s >= M.Q.AUDIO_CODEC and s <= M.Q.TIER) then
                slots[#slots + 1] = s
            end
        end
        table.sort(slots)
        for _, s in ipairs(slots) do
            out[#out + 1] = "#EXT-X-APE-C" .. s .. ":" .. tostring(valores[s])
        end
    end

    -- [t58] Calidad por canal: UN tag con los campos PRESENTES (sólo OTT).
    -- Sin dato (0xFFFF o ausente) ⇒ el campo no aparece; si no hay ningún campo, no hay tag.
    if gate.D6 then
        local campos = {}
        local function add(name, slot)
            local x = v(slot)
            if x ~= nil then campos[#campos + 1] = name .. "=" .. tostring(x) end
        end
        add("codec", M.Q.AUDIO_CODEC); add("ch", M.Q.AUDIO_CHANNELS)
        local chroma = v(M.Q.CHROMA)
        if chroma ~= nil then
            campos[#campos + 1] = "chroma=" .. (M.CHROMA_NAME[chroma] or tostring(chroma))
        end
        add("gop", M.Q.GOP); add("hdr", M.Q.HDR_PROFILE)
        local pq = v(M.Q.QUALITY_PROFILE)
        if pq ~= nil then campos[#campos + 1] = "pq=P" .. tostring(pq) end
        add("depth", M.Q.BIT_DEPTH)
        local fps = v(M.Q.FRAME_RATE)
        if fps ~= nil then
            campos[#campos + 1] = string.format("fps=%.2f", fps / M.FRAME_RATE_SCALE)
        end
        add("w", M.Q.SOURCE_W); add("h", M.Q.SOURCE_H); add("tier", M.Q.TIER)
        if #campos > 0 then
            out[#out + 1] = "#EXT-X-APE-AUDIO:" .. table.concat(campos, ";")
        end
    end

    -- [t54/t58] Veredicto (informativo, sólo OTT): uhd4k/uhd8k/hdr + profile.
    -- No altera RESOLUTION/CODECS/BANDWIDTH: es un tag inerte del namespace APE.
    if gate.D6 then
        local q = {}
        if fset(M.FLAG.UHD4K) or fset(M.FLAG.UHD8K) or fset(M.FLAG.HDR) then
            q[#q + 1] = "uhd=" .. (fset(M.FLAG.UHD8K) and "8k" or (fset(M.FLAG.UHD4K) and "4k" or "off"))
            q[#q + 1] = "hdr=" .. (fset(M.FLAG.HDR) and "1" or "0")
            q[#q + 1] = "flags=" .. tostring(flags)
        end
        local qp = v(M.Q.QUALITY_PROFILE)                       -- [t58] sólo si hay dato
        if qp ~= nil then q[#q + 1] = "profile=P" .. tostring(qp) end
        if #q > 0 then out[#out + 1] = "#EXT-X-APE-Q:" .. table.concat(q, ";") end
    end

    -- control (960..999): gen/ttl/stale — siempre, cualquier UA
    local gen = tonumber(ctx.gen) or 0
    local ttl = tonumber(ctx.ttl) or 0
    local stale = (tonumber(ctx.stale) or 0) ~= 0
    if (valores[M.SLOT.CTRL_MIN] and valores[M.SLOT.CTRL_MIN] ~= M.EMPTY) or gen > 0 or ttl > 0 then
        out[#out + 1] = "#EXT-X-APE-GEN:" .. tostring(gen)
        out[#out + 1] = "#EXT-X-APE-TTL:" .. tostring(ttl)
    end
    if stale or v(999) == 1 then out[#out + 1] = "#EXT-X-APE-STALE:1" end

    -- Capa B: estado completo fragmentado (inerte para el player; lo lee el companion).
    -- OPT-IN: sólo se emite si el cliente lo pide (slot FLAGS bit 1 o ctx.want_b).
    -- Motivo medido: volcar los 1000 slots como texto produce ~40 KB por respuesta;
    -- el contrato exige respuestas pequeñas, así que el dump completo es bajo demanda.
    -- NOTA: zlib/deflate NO está disponible en este runtime ⇒ se emite b64 sin comprimir
    -- y se declara `enc=b64`. Ver docs/rea/14 §Límites (deflate = NOT_RUN).
    local flagsB = flags   -- [t54] ya calculado arriba desde el slot 6
    -- Sólo OTT (gate.D6): es el único cliente con companion que lee la Capa B.
    local wantB = gate.D6 and ((ctx.want_b and true) or fset(M.FLAG.WANT_B))
    if wantB then
        local dense = {}
        for slot = 0, M.SLOTS - 1 do
            local x = valores[slot]
            if x ~= nil then
                dense[#dense + 1] = string.format("%03d:%04x", slot, x)
            end
        end
        local capaB = table.concat(dense, ",")
        if #capaB > 0 then
            local b64 = M.b64url_encode(capaB)
            local tot = math.ceil(#b64 / M.MAX_FRAGMENT)
            if tot < 1 then tot = 1 end
            for n = 1, tot do
                local part = b64:sub((n - 1) * M.MAX_FRAGMENT + 1, n * M.MAX_FRAGMENT)
                out[#out + 1] = "#EXT-X-APE-B:" .. n .. "/" .. tot .. "/" .. part
            end
        end
    end

    if #out == 0 then return M.STALE_TAG .. "\n" end        -- sin cambios ⇒ mínimo
    return table.concat(out, "\n") .. "\n"
end

-- ── HMAC: verificación (fail-open aguas arriba) ────────────────────────────
function M.verify(key, v, c, s, p, payload, h)
    if not key or key == "" then return false, "sin_clave" end
    local esperado = hex16(M.hmac_sha256(key, tostring(v) .. "|" .. tostring(c) .. "|" ..
        tostring(s) .. "|" .. tostring(p) .. "|" .. tostring(payload)))
    if type(h) ~= "string" then return false, "hmac_ausente" end
    h = h:lower()
    if #h ~= M.HMAC_BYTES * 2 then return false, "hmac_malformado" end
    if h ~= esperado then return false, "hmac_invalido" end
    return true
end

-- ── clave: lectura ÚNICA (cacheada); no hay disco por petición ────────────
local cached_key
function M.load_key(path)
    if cached_key ~= nil then return cached_key end
    local f = io.open(path or M.KEY_PATH, "rb")
    if not f then cached_key = ""; return "" end
    local s = f:read("*a") or ""
    f:close()
    cached_key = s:gsub("%s+$", "")
    return cached_key
end
function M._reset_key() cached_key = nil end

-- ── [t58] POST /a/cfg — config por sesión (repo-only, sin disco ni DB) ────
-- Auth: cabecera `X-APE-Cfg: <hex16>` = HMAC-SHA256(clave, "cfg|<sesión>|<body>").
-- La sesión va en la cabecera `X-APE-Session`; NUNCA en la query.
-- Códigos: 204 ok · 400 body/forma/tamaño · 403 HMAC · 429 rate-limit · 405 método.
-- Nunca se devuelve el cuerpo ni la clave.

-- Extrae un entero de un JSON "plano" sin dependencias (fallback si no hay cjson).
local function json_int(body, key)
    local v = body:match('"' .. key .. '"%s*:%s*(%-?%d+)')
    return tonumber(v)
end

function M.cfg_body_ok(body)
    if type(body) ~= "string" then return false, "body_ausente" end
    if #body == 0 then return false, "body_vacio" end
    if #body > M.CFG.MAX_BODY then return false, "body_demasiado_grande" end
    local first = body:match("^%s*(.)")
    if first ~= "{" then return false, "no_es_objeto_json" end
    if not body:match("}%s*$") then return false, "json_sin_cierre" end
    return true
end

-- Aplica una escritura de config. `shared` debe exponer get/set/incr/delete.
-- Devuelve { status=204|400|403|429, reason=..., ttl=n }.
function M.cfg_apply(shared, session, body, hmac_hex, key, now)
    if type(session) ~= "string" or session == "" then return { status = 400, reason = "sin_sesion" } end
    if not shared then return { status = 400, reason = "sin_shared_dict" } end
    local okb, why = M.cfg_body_ok(body)
    if not okb then return { status = 400, reason = why } end
    if not key or key == "" then return { status = 403, reason = "sin_clave" } end
    local want = hex16(M.hmac_sha256(key, "cfg|" .. session .. "|" .. body))
    if type(hmac_hex) ~= "string" or hmac_hex == "" then return { status = 403, reason = "hmac_ausente" } end
    if hmac_hex:lower() ~= want then return { status = 403, reason = "hmac_invalido" } end

    -- rate-limit por sesión: incr con ventana
    local rl_key = "rl:" .. session
    local n
    local ok_incr, res = pcall(function() return shared:incr(rl_key, 1, 0, M.CFG.RL_WINDOW) end)
    if ok_incr and res then n = res
    else
        n = (tonumber(shared:get(rl_key)) or 0) + 1
        shared:set(rl_key, n, M.CFG.RL_WINDOW)
    end
    if n > M.CFG.RL_MAX then return { status = 429, reason = "rate_limit" } end

    local ttl = tonumber(json_int(body, "ttl")) or M.CFG.TTL_DEFAULT
    if ttl < 1 then ttl = 1 end
    if ttl > M.CFG.TTL_MAX then ttl = M.CFG.TTL_MAX end
    shared:set("cfg:" .. session, body, ttl)
    return { status = 204, reason = "ok", ttl = ttl }
end

-- Lee la config de sesión y extrae overrides numéricos (fallback si no hay cjson).
-- Devuelve tabla slot->valor o nil. Fail-open: cualquier fallo ⇒ nil.
function M.cfg_overrides(shared, session)
    if not shared or type(session) ~= "string" or session == "" then return nil end
    local body = shared:get("cfg:" .. session)
    if type(body) ~= "string" or body == "" then return nil end
    local ov = {}
    local mapa = {
        pq = M.Q.QUALITY_PROFILE, hdr = M.Q.HDR_PROFILE, ua_mode = M.SLOT.HTTP_UA_MODE,
        referer_mode = M.SLOT.HTTP_REFERER_MODE, source_format = M.SLOT.SOURCE_FORMAT,
        audio_codec = M.Q.AUDIO_CODEC, bit_depth = M.Q.BIT_DEPTH,
    }
    for k, slot in pairs(mapa) do
        local n = json_int(body, k)
        if n ~= nil then ov[slot] = n end
    end
    if next(ov) == nil then return nil end
    return ov
end

-- ── handler nginx (content_by_lua_file) ───────────────────────────────────
function M.serve()
    local uri = (ngx.var.uri or "")
    local shared_cfg = ngx.shared[M.CFG.DICT]

    -- ── [t58] POST /a/cfg ────────────────────────────────────────────────
    if uri:match("^/a/cfg") then
        local method = ngx.req.get_method()
        ngx.header["Content-Type"] = "application/json"
        ngx.header["Cache-Control"] = "no-store"
        if method ~= "POST" then
            ngx.status = 405
            ngx.print('{"ok":false,"error":"method_not_allowed"}')
            return
        end
        ngx.req.read_body()
        local body = ngx.req.get_body_data() or ""
        local session = ngx.var.http_x_ape_session or ""
        local hmac = ngx.var.http_x_ape_cfg or ""
        local res = M.cfg_apply(shared_cfg, session, body, hmac, M.load_key(), ngx.time())
        ngx.status = res.status
        if res.status ~= 204 then
            ngx.print('{"ok":false,"error":"' .. tostring(res.reason) .. '"}')
        end
        return
    end

    local body
    local ok_uri = uri:match("^/a/(%d+)/([^/]+)/([^/]*)/([^/]*)/([^/]+)/([0-9a-fA-F]+)$")
    -- fallback: parámetros por query (?v=&c=&s=&p=&payload=&h=)
    local v, c, s, p, payload, h
    if ok_uri then
        v, c, s, p, payload, h = uri:match("^/a/(%d+)/([^/]+)/([^/]*)/([^/]*)/([^/]+)/([0-9a-fA-F]+)$")
    else
        v, c, s, p, payload, h = ngx.var.arg_v, ngx.var.arg_c, ngx.var.arg_s,
            ngx.var.arg_p, ngx.var.arg_payload, ngx.var.arg_h
    end
    v = v or M.VERSION

    ngx.header["Content-Type"] = "text/plain; charset=us-ascii"
    ngx.header["Cache-Control"] = "no-store"
    ngx.status = 200                                   -- fail-open: NUNCA 4xx

    local key = M.load_key()
    local ok, motivo = M.verify(key, v, c, s, p, payload, h)
    if not ok then
        ngx.header["X-APE-A"] = "stale:" .. tostring(motivo)
        ngx.print(M.b64url_encode(M.STALE_TAG .. "\n"))
        return
    end

    local parsed, perr = M.parse_payload(payload)
    if not parsed then
        ngx.header["X-APE-A"] = "stale:" .. tostring(perr)
        ngx.print(M.b64url_encode(M.STALE_TAG .. "\n"))
        return
    end

    -- contexto: SÓLO ngx.shared (sin disco/SQLite/DNS); default seguro si falta
    local ctx = { gen = 0, ttl = 0, stale = 0, url = nil }
    local Q = ngx.shared.ape_qoe
    if Q then
        ctx.gen = tonumber(Q:get("gen")) or 0
        ctx.ttl = tonumber(Q:get("cfg_ttl")) or 0
        ctx.stale = tonumber(Q:get("stale")) or 0
    end

    -- [t58] Config de sesión: rellena HUECOS (el payload siempre gana). Fail-open.
    local ov = M.cfg_overrides(shared_cfg, ngx.var.http_x_ape_session or "")
    if ov then
        for slot, val in pairs(ov) do
            if parsed.values[slot] == nil then parsed.values[slot] = val end
        end
    end

    local frag = M.build_fragment(parsed.values, ngx.var.http_user_agent, ctx)
    ngx.header["X-APE-A"] = "ok:slots=" .. tostring(parsed.count)
    ngx.print(M.b64url_encode(frag))
end

-- ── arranque dual: handler nginx vs módulo de test ────────────────────────
-- Ejecutado como `content_by_lua_file` (ngx presente) ⇒ sirve la petición.
-- Requerido desde un harness (lua5.1 sin ngx) ⇒ NO hace nada y devuelve M.
if type(ngx) == "table" and type(ngx.var) == "table" and ngx.var.uri then
    M.serve()
end

return M
