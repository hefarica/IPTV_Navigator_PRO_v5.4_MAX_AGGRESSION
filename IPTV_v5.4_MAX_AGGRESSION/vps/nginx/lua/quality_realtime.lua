-- ═══════════════════════════════════════════════════════════════════════
-- APE Quality Realtime v2.0 — Per-Channel Codec Tier + ADB Commands
-- Phase: content_by_lua_file
-- 2026-06-08 — v2.0: Sincronizado con toolkit completo
--
-- ENDPOINT:
--   GET /quality-realtime?ch=CHANNEL_ID&p=P0&fps=60&resolution=3840x2160&ct=dual-hvc1-hev1
--
-- MEJORAS v2.0 respecto a v1.0:
--   1. FIX P0: pcall return order corrected (v1.0: casc=true bool, nunca la tabla)
--   2. fps-aware: resolve_tier recibe fps → ape_codec_cascade ya distingue
--      T6=L120 (1080p@30) vs T7=L123 (1080p@60) — en v1.0 era dead code
--   3. cascade_type param (ct=): emite verified=true + ADB persist.ape.cascade_verified
--   4. codec_hev1 en response (hev1.* para KODIPROP/EXTVLCOPT bridge del sentinel)
--   5. resolution-aware HDMI mode: 8k120/8k60/8k, 4k120/4k60/4k, 2k60/2k, fullhd60/fullhd, hd
--   6. HDR quality granular: 0=SDR, 1=Main8bit, 2=Main10/HDR10, 3=Main12/DV
--   7. bw_hint en response — thresholds espejo del generador JS
--   8. tier.role en response (descripción legible del tier seleccionado)
--   9. guard nil width/height en tier
--  10. error enriched: incluye mensaje de causa en cascade_load_failed
--
-- ALINEADO CON EL TOOLKIT COMPLETO:
--   ape_codec_cascade.lua v2.0 — 13 tiers T1=L30→T13=L186, CORONA=T10(4K@120)
--   channel-image-bulk.php  — bw_observed + cascade_type por canal
--   m3u8-typed-arrays-ultimate.js v16.5.0 — cascade_type gate + bw_override
--   CLAUDE.md bitrate table — 4K=22Mbps avg, FHD@60=9Mbps avg
--
-- DOCTRINA AUTOPISTA: solo content, no ngx.exit(503), no blocking.
-- NO TIMING DATA: no VST, no rebuffer. SOLO codec + resolución + ADB.
-- ═══════════════════════════════════════════════════════════════════════

local cc    = require("ape_codec_cascade")
local cjson = require("cjson")

-- ── Parse args ──────────────────────────────────────────────────────────
local args         = ngx.req.get_uri_args()
local channel_id   = tostring(args.ch or args.channel_id or "unknown")
local profile_raw  = tostring(args.p or args.profile or "P2")
local profile      = profile_raw:upper()
if not profile:match("^P[0-5]$") then profile = "P2" end
local fps          = tonumber(args.fps) or 30
local resolution   = tostring(args.resolution or "1920x1080")
-- cascade_type: evidencia empírica de transmisión HEVC verificada.
-- Valores: "dual-hvc1-hev1" (nominal) | cualquier alias HEVC (legacy observers).
-- HEVC FIRST 2026-06-08: verified=true para CUALQUIER cascade_type HEVC-positivo,
-- no solo el string "dual-hvc1-hev1". Usa cc.is_hevc_family() del SSOT Lua.
local cascade_type = tostring(args.ct or args.cascade_type or "")
-- verified: "dual-hvc1-hev1" exacto O cualquier alias HEVC reconocido por cc.is_hevc_family
local verified = (cascade_type == "dual-hvc1-hev1")
                 or (cascade_type ~= "" and cc.is_hevc_family and cc.is_hevc_family(cascade_type))

-- ── Load cascade via ape_codec_cascade.lua (cached 60s, ngx.shared.lab_config) ──
-- FIX v2.0: pcall(fn) retorna (ok_bool, result_or_errmsg).
-- v1.0 tenía los vars invertidos: `casc` recibía `true` (bool ok flag),
-- `err_load` recibía la cascade table → resolve_tier(true,...) siempre fallaba
-- el type check → CORONA fallback en 100% de requests = endpoint inútil.
local ok_load, casc = pcall(function() return cc.load_cascade() end)
if not ok_load or type(casc) ~= "table" then
    ngx.header["Content-Type"]                = "application/json"
    ngx.header["Cache-Control"]              = "no-cache, no-store"
    ngx.header["Access-Control-Allow-Origin"] = "*"
    ngx.header["X-APE-Quality-Version"]      = "2.0"
    ngx.say(cjson.encode({
        ok    = false,
        error = "cascade_load_failed",
        note  = (not ok_load) and tostring(casc) or "type_mismatch",
        ts    = ngx.now()
    }))
    return
end

-- ── Resolve tier ─────────────────────────────────────────────────────────
-- fps se pasa explícitamente → ape_codec_cascade.lua::tier_for_resolution()
-- distingue T6=L120 (1080p@30) vs T7=L123 (1080p@60) per la cascada.
-- En v1.0 esto era dead code porque casc=true hacía fallar resolve_tier.
local tier = nil
local ok_resolve = pcall(function()
    tier = cc.resolve_tier(casc, {
        profile    = profile,
        resolution = resolution,
        fps        = fps,
        family     = "HEVC"
    })
end)

if not ok_resolve or not tier then
    -- Fallback autopista: CORONA tier (T10 = 4K@120 L156 en MEMC-TOTAL-8K120)
    pcall(function() tier = cc.corona_tier(casc) end)
end

-- ── Resolución segura (guard nil width/height — S6 F3 fix) ──────────────
local tier_w   = (tier and tier.width)  or 1920
local tier_h   = (tier and tier.height) or 1080
local tier_fps = (tier and tier.fps)    or fps
local tier_res = tier_w .. "x" .. tier_h

-- ── HDMI mode: resolution-aware (v2.0) ─────────────────────────────────
-- v1.0 solo emitía "4k60"/"4k" independientemente del tier.
-- v2.0 mapea cada tier a su modo HDMI correcto en el Amlogic SoC.
local hdmi_mode
if tier_w >= 7680 then
    hdmi_mode = tier_fps >= 100 and "8k120" or (tier_fps >= 50 and "8k60" or "8k")
elseif tier_w >= 3840 then
    hdmi_mode = tier_fps >= 100 and "4k120" or (tier_fps >= 50 and "4k60" or "4k")
elseif tier_w >= 2560 then
    hdmi_mode = tier_fps >= 50 and "2k60" or "2k"
elseif tier_w >= 1920 then
    hdmi_mode = fps >= 50 and "fullhd60" or "fullhd"
else
    hdmi_mode = "hd"
end

-- ── HDR rendering quality: granular por perfil codec (v2.0) ─────────────
-- v1.0 aplicaba quality=2 a Main10 y DV indiscriminadamente.
-- 0=SDR, 1=Main8bit HEVC (hw decoder on, no HDR), 2=Main10/HDR10, 3=Main12/DV
local hdr_quality = 0
if tier and tier.codec then
    local c = tier.codec
    if c:find("dvh1", 1, true) or c:find("dvhe", 1, true) then
        hdr_quality = 3  -- Dolby Vision pipeline completo
    elseif c:find("hvc1.4.", 1, true) or c:find("hev1.4.", 1, true) then
        hdr_quality = 3  -- Main12 — misma pipeline DV en Amlogic
    elseif c:find("hvc1.2.", 1, true) or c:find("hev1.2.", 1, true) then
        hdr_quality = 2  -- Main10 / HDR10+ (todos los tiers DEFAULT_CASCADE son .2.4)
    elseif c:find("hvc1.1.", 1, true) or c:find("hev1.1.", 1, true) then
        hdr_quality = 1  -- Main 8-bit HEVC (hw decoder activo, sin HDR pipeline)
    end
end

-- ── Bandwidth hint: espejo de los thresholds del generador JS (v2.0) ────
-- Permite que el sentinel valide bitrate medido ≈ bw_hint esperado.
-- Valores de CLAUDE.md tabla bitrate fallback (AVERAGE-BANDWIDTH).
local bw_hint = 0
if tier_w >= 7680 then
    bw_hint = 60000000   -- 8K AVERAGE per CLAUDE.md
elseif tier_w >= 3840 then
    bw_hint = 22000000   -- 4K AVERAGE
elseif tier_w >= 1920 then
    bw_hint = fps >= 50 and 9000000 or 6500000  -- FHD@60 vs FHD@30
elseif tier_w >= 1280 then
    bw_hint = 4000000    -- 720p
else
    bw_hint = 1800000    -- SD
end

-- ── Build ADB commands (v2.1 — HEVC FIRST) ───────────────────────────────
-- CERO timing/buffer directives. SOLO decoder + quality pipeline.
-- HEVC FIRST 2026-06-08: incluye preferred_codec con todos los aliases HEVC
-- para KODIPROP/EXTVLCOPT bridge en TiviMate/Kodi/VLC/OTT Navigator.
-- codec (hvc1.*) → STREAM-INF / manifest hint (RFC 6381).
-- codec_hev1 (hev1.*) → KODIPROP/EXTVLCOPT runtime decoder hint.
-- preferred_codec → cadena HEVC homólogos para players que no usan RFC 6381.
local adb_commands = {}

-- hevc_aliases_csv: carga del SSOT cc.hevc_aliases_csv() con fallback inline
local hevc_aliases_val = ""
if cc.hevc_aliases_csv then
    local ok_al, al = pcall(function() return cc.hevc_aliases_csv() end)
    if ok_al and type(al) == "string" then hevc_aliases_val = al end
end
if hevc_aliases_val == "" then
    -- Fallback inline si el módulo no expone hevc_aliases_csv (versión antigua)
    hevc_aliases_val = "hvc1,hvc2,hev1,hev2,hevc,HEVC,h265,H265,h.265,H.265,x265,libx265,MPEG-H,mpeg-h,video/hevc"
end

if tier and tier.codec then
    adb_commands[#adb_commands+1] = "setprop persist.ape.codec "          .. tier.codec
    -- codec_hev1 disponible en ape_codec_cascade.lua v2.0 (campo agregado en cascada)
    if tier.codec_hev1 then
        adb_commands[#adb_commands+1] = "setprop persist.ape.codec_hev1 " .. tier.codec_hev1
    end
    adb_commands[#adb_commands+1] = "setprop persist.ape.tier "           .. tostring(tier.tier or "T10")
    adb_commands[#adb_commands+1] = "setprop persist.ape.resolution "     .. tier_res
    -- HEVC First: activa HEVC hw decoder explícitamente
    -- persist.media.codec.hevc = 1: safe para todos los streams (hw decoder habilitado)
    -- persist.media.codec.hevc.secure = 1: SOLO streams DRM/Widevine L1 (gate verified)
    -- → Un stream IPTV estándar sin DRM con .secure=1 fuerza OMX.amlogic.hevc.decoder.secure
    --   que requiere TEE session activa → DecoderInitializationException → black screen.
    adb_commands[#adb_commands+1] = "setprop persist.media.codec.hevc 1"
    adb_commands[#adb_commands+1] = "setprop persist.sys.hdmi.mode "      .. hdmi_mode
    -- HDR pipeline: solo si Main10 o superior (evita activar HDR en streams SDR)
    if hdr_quality >= 2 then
        adb_commands[#adb_commands+1] = "setprop persist.sys.video.rendering.quality " .. hdr_quality
    end
    -- cascade_type verified = HEVC confirmado empíricamente → flag hw accel extra
    if verified then
        adb_commands[#adb_commands+1] = "setprop persist.ape.cascade_verified 1"
    end
    -- HEVC FIRST: preferred_codec chain para players que leen propiedades de familia
    -- (TiviMate codec override, OTT Navigator decoder hint, ExoPlayer MediaCodec hint)
    -- Límite 200 chars (Android setprop PROP_VALUE_MAX: 92 bytes ≤Android 7, 255 en Android 8+)
    -- Safe-split: corta en el último ',' antes de char 200 (evita alias truncado a la mitad)
    local pref_chain = hevc_aliases_val
    if #pref_chain > 200 then
        local cut = 200
        while cut > 1 and pref_chain:sub(cut, cut) ~= "," do cut = cut - 1 end
        pref_chain = pref_chain:sub(1, cut > 1 and cut - 1 or 200)
    end
    adb_commands[#adb_commands+1] = "setprop persist.ape.preferred_codec " .. pref_chain
end

-- ── Emit response ────────────────────────────────────────────────────────
ngx.header["Content-Type"]                = "application/json; charset=utf-8"
ngx.header["Cache-Control"]              = "no-cache, no-store, max-age=0"
ngx.header["Access-Control-Allow-Origin"] = "*"
ngx.header["X-APE-Quality-Version"]      = "2.0"

ngx.say(cjson.encode({
    ok             = true,
    channel_id     = channel_id,
    profile        = profile,
    codec          = tier and tier.codec,
    codec_hev1     = tier and tier.codec_hev1,
    tier           = tier and tier.tier,
    tier_role      = tier and tier.role,
    resolution     = tier_res,
    fps            = fps,
    hdmi_mode      = hdmi_mode,
    hdr_quality    = hdr_quality,
    bw_hint        = bw_hint,
    cascade_type   = cascade_type ~= "" and cascade_type or cjson.null,
    verified       = verified,
    -- HEVC FIRST 2026-06-08: chain completo de aliases para el sentinel.
    -- El sentinel usa hevc_aliases para poblar KODIPROP preferred_codec /
    -- EXTVLCOPT codec-priority en TiviMate, Kodi, VLC, OTT Navigator.
    hevc_aliases   = hevc_aliases_val,
    adb_commands   = adb_commands,
    ts             = ngx.now()
}))
