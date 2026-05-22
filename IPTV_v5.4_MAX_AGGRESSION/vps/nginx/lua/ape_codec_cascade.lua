-- ═══════════════════════════════════════════════════════════════════════
-- APE CODEC CASCADE (edge resolver) — STAGING 2026-05-21 (NO DEPLOYED)
--
-- Lee la cascada de codecs que el widget Quality Manifest empuja al VPS
-- (quality-manifest.json → key "codec_cascade"). Resuelve, por perfil +
-- resolución + fps, el codec string del tier que el manifiesto debe DECLARAR
-- al reescribirse en combined_body_filter.lua.
--
-- HONESTIDAD (CLAUDE.md NO PLAYER-BREAKING LIES):
--   · El CODECS= reescrito es un HINT que el player negocia con el bitstream
--     real. NO transcodifica. NO fuerza el códec físico del proveedor.
--   · NO fabrica HDR aquí (eso lo decide el caller: solo si la variante ya lo
--     traía o el perfil HDR está verificado).
--
-- AUTOPISTA-COMPLIANT: todo en pcall vía el caller; cualquier fallo → nil →
-- el body_filter deja pasar el manifiesto original sin tocar (passthrough).
-- ═══════════════════════════════════════════════════════════════════════

local _M = {}

local CASCADE_FILE = "/var/www/html/prisma/quality-manifest.json"
local CACHE_KEY    = "codec_cascade_v1"
local CACHE_TTL    = 60  -- s

-- Cascada por defecto embebida (12-tier CSV SSOT) — fallback si el JSON no
-- está disponible. DEBE coincidir con ape-hevc-cascade.js (frontend SSOT).
local DEFAULT_CASCADE = {
    { tier = 1,  codec = "hvc1.2.4.L153.B0", profile = "Main 10",     level = "5.1", family = "HEVC" },
    { tier = 2,  codec = "hvc1.2.4.L150.B0", profile = "Main 10",     level = "5.0", family = "HEVC" },
    { tier = 3,  codec = "hvc1.2.4.L123.B0", profile = "Main 10",     level = "4.1", family = "HEVC" },
    { tier = 4,  codec = "hvc1.2.4.L120.B0", profile = "Main 10",     level = "4.0", family = "HEVC" },
    { tier = 5,  codec = "hvc1.2.4.L93.B0",  profile = "Main 10",     level = "3.1", family = "HEVC" },
    { tier = 6,  codec = "hvc1.2.4.L90.B0",  profile = "Main 10",     level = "3.0", family = "HEVC" },
    { tier = 7,  codec = "hvc1.2.4.L63.B0",  profile = "Main 10",     level = "2.1", family = "HEVC" },
    { tier = 8,  codec = "av01.0.05M.10",    profile = "AV1 Main 10", level = "5.0", family = "AV1"  },
    { tier = 9,  codec = "hvc1.1.6.L120.B0", profile = "Main 8-bit",  level = "4.0", family = "HEVC" },
    { tier = 10, codec = "hvc1.1.6.L93.B0",  profile = "Main 8-bit",  level = "3.1", family = "HEVC" },
    { tier = 11, codec = "avc1.640028",      profile = "H.264 High",  level = "4.0", family = "H264" },
    { tier = 12, codec = "avc1.4d401e",      profile = "H.264 Main",  level = "3.0", family = "H264" },
}

-- ── Carga + cache (patrón visual_profiles) ──────────────────────────────
function _M.load_cascade()
    local cache = ngx.shared.lab_config
    if cache then
        local cached = cache:get(CACHE_KEY)
        if cached then
            local ok, decoded = pcall(function() return require("cjson").decode(cached) end)
            if ok and type(decoded) == "table" and #decoded > 0 then return decoded end
        end
    end

    local f = io.open(CASCADE_FILE, "r")
    if not f then return DEFAULT_CASCADE end
    local content = f:read("*a")
    f:close()
    if not content or content == "" then return DEFAULT_CASCADE end

    local ok, doc = pcall(function() return require("cjson").decode(content) end)
    if not ok or type(doc) ~= "table" then return DEFAULT_CASCADE end

    local cascade = doc.codec_cascade
    if type(cascade) ~= "table" or #cascade == 0 then return DEFAULT_CASCADE end

    if cache then
        -- guardamos solo el sub-array (más barato de decodificar en hits)
        local enc_ok, enc = pcall(function() return require("cjson").encode(cascade) end)
        if enc_ok then cache:set(CACHE_KEY, enc, CACHE_TTL) end
    end
    return cascade
end

-- ── by-number lookup ────────────────────────────────────────────────────
local function by_number(cascade)
    local t = {}
    for _, row in ipairs(cascade) do
        local n = tonumber(row.tier)
        if n then t[n] = row end
    end
    return t
end

-- ── resolución "WxH" → tier number (mirror de resolveTierByResolution JS) ──
local function tier_for_resolution(w, h, fps)
    w = tonumber(w) or 1920
    h = tonumber(h) or 1080
    fps = tonumber(fps) or 30
    if w >= 3840 and h >= 2160 then
        if fps >= 50 then return 1 else return 2 end
    end
    if w >= 2560 and h >= 1440 then return 2 end
    if w >= 1920 and h >= 1080 then
        if fps >= 50 then return 3 else return 4 end
    end
    if w >= 1280 and h >= 720 then return 5 end
    if w >= 960  and h >= 540 then return 6 end
    if w >= 640  and h >= 360 then return 7 end
    return 4
end

-- ── resolve_tier(cascade, opts) ─────────────────────────────────────────
-- opts = { profile="P0".."P5", resolution="WxH", fps=number, family="HEVC"/"H264"/"AV1" }
--   honest_family=true  → si la variante es claramente H264, devuelve el tier
--                         H264 (no sube-hinta a HEVC). Default false (agresivo
--                         HEVC-hint, consistente con doctrina F2 + virtual_4k).
-- Devuelve el row del tier o nil.
function _M.resolve_tier(cascade, opts)
    if type(cascade) ~= "table" or #cascade == 0 then return nil end
    opts = opts or {}
    local idx = by_number(cascade)

    -- familia honesta: H264 explícito se queda en su tier
    if opts.honest_family and opts.family == "H264" then
        return idx[11] or idx[12]
    end
    if opts.family == "AV1" then
        return idx[8] or nil  -- AV1 solo si la variante ya es AV1
    end

    -- floor por perfil (P0/P1 = 4K showroom/daily)
    local profile = tostring(opts.profile or ""):upper()
    if profile == "P0" then return idx[1] or idx[2] or idx[4] end
    if profile == "P1" then
        local fps = tonumber(opts.fps) or 30
        if fps >= 50 then return idx[1] or idx[2] or idx[4] else return idx[2] or idx[4] end
    end

    -- por resolución
    local w, h
    if opts.resolution then
        w, h = tostring(opts.resolution):match("^(%d+)x(%d+)$")
    end
    local n = tier_for_resolution(w, h, opts.fps)
    return idx[n] or idx[4]
end

-- ── codec chain completo (para header X-APE-Codec-Chain) ────────────────
function _M.build_codec_chain(cascade)
    if type(cascade) ~= "table" then return "" end
    local parts = {}
    for _, row in ipairs(cascade) do
        if row.codec and row.codec ~= "" then parts[#parts + 1] = row.codec end
    end
    return table.concat(parts, ",")
end

return _M
