-- APE MEMC-TOTAL-8K120 — Synchronized v22.6.0-MEMC-TOTAL-8K120
-- ═══════════════════════════════════════════════════════════════════════════
-- APE CODEC CASCADE (edge resolver) v2.0 — SSOT alineada con frontend
-- ═══════════════════════════════════════════════════════════════════════════
-- Lee la cascada de codecs dual hvc1+hev1 que el widget Quality Manifest
-- empuja al VPS (quality-manifest.json → key "codec_cascade" vía
-- prisma-adb-quality.php?action=save_manifest).
--
-- Si el JSON no está disponible, usa DEFAULT_CASCADE embebida que replica
-- exactamente HEVC_CASCADE_13TIER de ape-hevc-cascade.js (frontend SSOT):
--   T1  = mínimo absoluto (L30)  →  T13 = techo absoluto (L186 8K@120)
--   T9  = CORONA (L153 = 4K@60 UHD) — slot usado por P0/P1 y virtual_4k
--
-- REGLA DE ORO (GOLDEN RULE — CLAUDE.md):
--   tier.codec      → hvc1.* → manifest parser (STREAM-INF CODECS=)
--   tier.codec_hev1 → hev1.* → decoder runtime (KODIPROP, EXTVLCOPT)
--   NUNCA cruzar.
--
-- HONESTIDAD (NO PLAYER-BREAKING LIES):
--   El CODECS= reescrito es un HINT. NO transcodifica. NO fuerza el códec
--   físico del proveedor. NO fabrica HDR (eso lo decide el caller).
--
-- AUTOPISTA-COMPLIANT: todo en pcall vía el caller; cualquier fallo → nil →
--   el body_filter deja pasar el manifiesto original sin tocar (passthrough).
--
-- ACTIVATION (combined_body_filter.lua):
--   local cc = require("ape_codec_cascade")
--   local casc = cc.load_cascade()
--   local tier = cc.resolve_tier(casc, { profile = "P0" })
--   v4k_codec = tier and tier.codec
-- ═══════════════════════════════════════════════════════════════════════════

local _M = {}

-- Rutas en disco
local CASCADE_FILE = "/var/www/html/prisma/quality-manifest.json"

-- Cache key v2 — invalida cualquier cache de v1 (que tenía tier numbering
-- invertido: T1=L153 en lugar de T1=L30 como define el frontend SSOT).
local CACHE_KEY    = "codec_cascade_v2"
local CACHE_TTL    = 60  -- s

-- ── CORONA ────────────────────────────────────────────────────────────────
-- Tier number del slot CORONA en la tabla de 13 tiers (1-indexed ascending).
-- T9 = hvc1.2.4.L153.B0 = 4K@60 UHD — slot de referencia para P0/P1 y
-- virtual_4k. Debe coincidir con CORONA_TIER_NUMBER de ape-hevc-cascade.js.
local CORONA_TIER  = 9

-- ── DEFAULT_CASCADE (13-tier ascending) ──────────────────────────────────
-- Replica exacta de HEVC_CASCADE_13TIER en ape-hevc-cascade.js (2026-05-22).
-- T1 = mínimo absoluto (L30), T13 = techo absoluto (L186 8K@120).
-- PURE HEVC Main 10 (profile .2.4 = Main10 / hvc1.2.4.Lxxx.B0).
--
-- Mandato HFRC 2026-05-22: TODOS LOS CANALES hvc1.2.4.*** MÍNIMO.
-- SIN AV1, SIN H.264, SIN HEVC 8-bit en esta tabla.
local DEFAULT_CASCADE = {
    -- { tier, codec (hvc1→STREAM-INF), codec_hev1 (hev1→KODIPROP/EXTVLCOPT), ... }
    { tier = 1,  codec = "hvc1.2.4.L30.B0",  codec_hev1 = "hev1.2.4.L30.B0",  profile = "Main 10", level = "1.0", width = 128,  height = 96,   fps = 33.7, family = "HEVC", role = "Mínimo absoluto HEVC Main 10" },
    { tier = 2,  codec = "hvc1.2.4.L60.B0",  codec_hev1 = "hev1.2.4.L60.B0",  profile = "Main 10", level = "2.0", width = 352,  height = 288,  fps = 30,   family = "HEVC", role = "CIF baseline" },
    { tier = 3,  codec = "hvc1.2.4.L63.B0",  codec_hev1 = "hev1.2.4.L63.B0",  profile = "Main 10", level = "2.1", width = 640,  height = 360,  fps = 30,   family = "HEVC", role = "360p HDR" },
    { tier = 4,  codec = "hvc1.2.4.L90.B0",  codec_hev1 = "hev1.2.4.L90.B0",  profile = "Main 10", level = "3.0", width = 960,  height = 540,  fps = 30,   family = "HEVC", role = "540p HDR ultra-fallback" },
    { tier = 5,  codec = "hvc1.2.4.L93.B0",  codec_hev1 = "hev1.2.4.L93.B0",  profile = "Main 10", level = "3.1", width = 1280, height = 720,  fps = 30,   family = "HEVC", role = "720p HDR 10-bit" },
    { tier = 6,  codec = "hvc1.2.4.L120.B0", codec_hev1 = "hev1.2.4.L120.B0", profile = "Main 10", level = "4.0", width = 1920, height = 1080, fps = 30,   family = "HEVC", role = "1080p@30 10-bit" },
    { tier = 7,  codec = "hvc1.2.4.L123.B0", codec_hev1 = "hev1.2.4.L123.B0", profile = "Main 10", level = "4.1", width = 1920, height = 1080, fps = 60,   family = "HEVC", role = "1080p@60 HDR" },
    { tier = 8,  codec = "hvc1.2.4.L150.B0", codec_hev1 = "hev1.2.4.L150.B0", profile = "Main 10", level = "5.0", width = 3840, height = 2160, fps = 30,   family = "HEVC", role = "4K@30 HDR" },
    -- T9 = CORONA — referencia para virtual_4k, perfiles P0/P1 y MAX_QUALITY
    { tier = 9,  codec = "hvc1.2.4.L153.B0", codec_hev1 = "hev1.2.4.L153.B0", profile = "Main 10", level = "5.1", width = 3840, height = 2160, fps = 60,   family = "HEVC", role = "CORONA — 4K@60 HDR" },
    { tier = 10, codec = "hvc1.2.4.L156.B0", codec_hev1 = "hev1.2.4.L156.B0", profile = "Main 10", level = "5.2", width = 3840, height = 2160, fps = 120,  family = "HEVC", role = "4K@120 HDR" },
    { tier = 11, codec = "hvc1.2.4.L180.B0", codec_hev1 = "hev1.2.4.L180.B0", profile = "Main 10", level = "6.0", width = 7680, height = 4320, fps = 30,   family = "HEVC", role = "8K@30 HDR" },
    { tier = 12, codec = "hvc1.2.4.L183.B0", codec_hev1 = "hev1.2.4.L183.B0", profile = "Main 10", level = "6.1", width = 7680, height = 4320, fps = 60,   family = "HEVC", role = "8K@60 HDR" },
    { tier = 13, codec = "hvc1.2.4.L186.B0", codec_hev1 = "hev1.2.4.L186.B0", profile = "Main 10", level = "6.2", width = 7680, height = 4320, fps = 120,  family = "HEVC", role = "8K@120 HDR techo absoluto" },
}

-- ── Carga + cache (patrón visual_profiles) ───────────────────────────────
-- Intenta leer la cascada guardada por el widget via prisma-adb-quality.php.
-- Si el JSON tiene "codec_cascade" array → lo usa (override del usuario).
-- Si no → DEFAULT_CASCADE (13-tier SSOT garantiza hvc1.2.4.*** mínimo).
function _M.load_cascade()
    local cache = ngx.shared.lab_config
    if cache then
        local cached = cache:get(CACHE_KEY)
        if cached then
            local ok, decoded = pcall(function()
                return require("cjson").decode(cached)
            end)
            if ok and type(decoded) == "table" and #decoded > 0 then
                return decoded
            end
        end
    end

    local f = io.open(CASCADE_FILE, "r")
    if not f then return DEFAULT_CASCADE end
    local content = f:read("*a")
    f:close()
    if not content or content == "" then return DEFAULT_CASCADE end

    local ok, doc = pcall(function()
        return require("cjson").decode(content)
    end)
    if not ok or type(doc) ~= "table" then return DEFAULT_CASCADE end

    -- El JSON guarda la cascada en "codec_cascade" (estructura del widget).
    -- Cada row: {tier, codec, codec_hev1, profile, level, ...}
    local cascade = doc.codec_cascade
    if type(cascade) ~= "table" or #cascade == 0 then return DEFAULT_CASCADE end

    -- Validar: mínimo 5 tiers con campos tier+codec para rechazar arrays corruptos.
    local valid_count = 0
    for _, row in ipairs(cascade) do
        if type(row) == "table" and tonumber(row.tier) and row.codec then
            valid_count = valid_count + 1
        end
    end
    if valid_count < 5 then return DEFAULT_CASCADE end

    -- Asegurar que cada row tiene codec_hev1 — puede faltar en versiones antiguas
    -- del widget que no incluían el campo. Calculamos hev1 desde hvc1 si es necesario.
    for _, row in ipairs(cascade) do
        if not row.codec_hev1 and type(row.codec) == "string" then
            if row.codec:sub(1, 4) == "hvc1" then
                row.codec_hev1 = "hev1" .. row.codec:sub(5)
            else
                row.codec_hev1 = row.codec
            end
        end
    end

    if cache then
        local enc_ok, enc = pcall(function()
            return require("cjson").encode(cascade)
        end)
        if enc_ok then cache:set(CACHE_KEY, enc, CACHE_TTL) end
    end
    return cascade
end

-- ── by_number(cascade) → tabla {tier_number → row} ───────────────────────
-- Índice rápido para lookup por número de tier (1-13 ascending).
local function by_number(cascade)
    local t = {}
    for _, row in ipairs(cascade) do
        local n = tonumber(row.tier)
        if n then t[n] = row end
    end
    return t
end

-- ── tier_for_resolution(w, h, fps) → tier_number ─────────────────────────
-- Mapeo (width, height, fps) → tier number (1-13 ascending, T9=CORONA).
-- Espejo directo de resolveTierByResolution() en ape-hevc-cascade.js.
--
-- T1=L30 (mínimo), T9=L153 (CORONA 4K@60), T13=L186 (techo 8K@120).
local function tier_for_resolution(w, h, fps)
    w   = tonumber(w)   or 1920
    h   = tonumber(h)   or 1080
    fps = tonumber(fps) or 30

    -- 8K (7680×4320+)
    if w >= 7680 and h >= 4320 then
        if fps >= 100 then return 13  -- T13 = 8K@120 L186
        elseif fps >= 50  then return 12  -- T12 = 8K@60 L183
        else return 11                    -- T11 = 8K@30 L180
        end
    end
    -- 4K / UHD (3840×2160+, incluye DCI 4096)
    if w >= 3840 and h >= 2160 then
        if fps >= 100 then return 10  -- T10 = 4K@120 L156
        elseif fps >= 50  then return  9  -- T9  = CORONA 4K@60 L153
        else return  8                    -- T8  = 4K@30 L150
        end
    end
    -- QHD (2560×1440) → asimilar a 4K@30 por bandwidth
    if w >= 2560 and h >= 1440 then return 8 end
    -- FHD (1920×1080)
    if w >= 1920 and h >= 1080 then
        if fps >= 50 then return 7  -- T7 = 1080p@60 L123
        else return 6               -- T6 = 1080p@30 L120 (default más común)
        end
    end
    -- HD (1280×720)
    if w >= 1280 and h >= 720 then return 5 end  -- T5 = 720p L93
    -- 540p
    if w >= 960  and h >= 540 then return 4 end  -- T4 = 540p L90
    -- 360p
    if w >= 640  and h >= 360 then return 3 end  -- T3 = 360p L63
    -- CIF / 288p
    if w >= 352  and h >= 288 then return 2 end  -- T2 = CIF L60
    -- Default: 1080p@30 (T6 = L120 — tier más seguro y compatible)
    return 6
end

-- ── resolve_tier(cascade, opts) ──────────────────────────────────────────
-- Resuelve el tier correcto dado perfil + resolución + fps + familia.
--
-- opts = {
--   profile       = "P0".."P5"    (perfil APE del canal)
--   resolution    = "WxH"         (e.g. "3840x2160")
--   fps           = number
--   family        = "HEVC"/"H264"/"AV1"  (familia del bitstream real)
--   honest_family = bool           (si true: H264 real no se sube a HEVC hint)
-- }
--
-- Doctrina MAX IMAGE FIRST (CLAUDE.md): en duda → HEVC hint agresivo.
-- honest_family=true solo activo cuando cfg.codec_cascade_honest=true en
-- visual_profiles.json (conservador, no por defecto).
--
-- Retorna el row del tier (con .codec hvc1.* y .codec_hev1 hev1.*) o nil.
function _M.resolve_tier(cascade, opts)
    if type(cascade) ~= "table" or #cascade == 0 then return nil end
    opts = opts or {}
    local idx = by_number(cascade)

    -- ── Familia honesta (opt-in via cfg.codec_cascade_honest) ──────────
    if opts.honest_family then
        if opts.family == "H264" then
            -- H264 real verificado → mantener en tier FHD (no subir a HEVC hint)
            return idx[6] or idx[5]  -- T6=1080p@30 L120 o T5=720p L93
        end
        if opts.family == "AV1" then
            -- Buscar tier AV1 si existe en la cascada override del usuario
            for _, row in ipairs(cascade) do
                if type(row.codec) == "string" and row.codec:sub(1, 4) == "av01" then
                    return row
                end
            end
            -- Sin tier AV1 → CORONA como fallback agresivo (doctrine MAX IMAGE FIRST)
            return idx[CORONA_TIER] or idx[9] or idx[6]
        end
    end

    -- ── Por perfil APE ─────────────────────────────────────────────────
    local profile = tostring(opts.profile or ""):upper()

    if profile == "P0" then
        -- P0 = showroom. Nominal 8K pero limitamos a CORONA (T9=L153 4K@60)
        -- para evitar declarar 8K en canales mal taggeados.
        return idx[CORONA_TIER] or idx[9] or idx[8]
    end
    if profile == "P1" then
        -- P1 = 4K daily. CORONA L153 (4K@60). Si fps>100 → T10=L156 (4K@120).
        local fps_val = tonumber(opts.fps) or 30
        if fps_val >= 100 then return idx[10] or idx[CORONA_TIER] end
        return idx[CORONA_TIER] or idx[9] or idx[8]
    end
    if profile == "P2" then
        -- P2 = QHD 1440p. T8 (4K@30) o T7 (1080p@60) según fps.
        local fps_val = tonumber(opts.fps) or 30
        if fps_val >= 50 then return idx[8] or idx[7] else return idx[7] or idx[6] end
    end

    -- P3/P4/P5 → mapeo por resolución exacta
    local w_s, h_s
    if opts.resolution then
        w_s, h_s = tostring(opts.resolution):match("^(%d+)x(%d+)$")
    end
    local n = tier_for_resolution(w_s, h_s, opts.fps)
    return idx[n] or idx[6]  -- fallback: T6 = 1080p@30 (tier más común y seguro)
end

-- ── build_codec_chain(cascade) — cadena hvc1 para X-APE-CODEC-CHAIN ──────
-- Retorna los codec strings hvc1.* separados por comas en orden ascendente.
-- El body_filter los inyecta como #EXT-X-APE-CODEC-CHAIN: en el manifiesto.
function _M.build_codec_chain(cascade)
    if type(cascade) ~= "table" then return "" end
    local parts = {}
    for _, row in ipairs(cascade) do
        if row.codec and row.codec ~= "" then
            parts[#parts + 1] = tostring(row.codec)
        end
    end
    return table.concat(parts, ",")
end

-- ── build_hev1_chain(cascade) — cadena hev1 para KODIPROP/EXTVLCOPT ──────
-- REGLA DE ORO: hev1 NUNCA va en STREAM-INF. Solo en tags runtime APE.
function _M.build_hev1_chain(cascade)
    if type(cascade) ~= "table" then return "" end
    local parts = {}
    for _, row in ipairs(cascade) do
        local hev1 = row.codec_hev1
        if not hev1 and type(row.codec) == "string" and row.codec:sub(1, 4) == "hvc1" then
            hev1 = "hev1" .. row.codec:sub(5)
        end
        if hev1 and hev1 ~= "" then parts[#parts + 1] = tostring(hev1) end
    end
    return table.concat(parts, ",")
end

-- ── corona_tier(cascade) ─────────────────────────────────────────────────
-- Shortcut: retorna el tier CORONA (T9 = 4K@60 L153) desde la cascada activa.
-- Usado en combined_body_filter.lua para virtual_4k rewrite.
function _M.corona_tier(cascade)
    local idx = by_number(cascade or DEFAULT_CASCADE)
    return idx[CORONA_TIER] or idx[9]
end

return _M
