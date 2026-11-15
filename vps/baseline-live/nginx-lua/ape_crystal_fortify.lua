-- ═══════════════════════════════════════════════════════════════════════════
-- APE CRYSTAL FORTIFY — Capa de Fortificación Sincronizada
-- Se embebe DENTRO de cada perfil P0-P5, amplificando sus parámetros nativos.
-- NO sobreescribe el floor ni las variantes del perfil base.
-- Actúa en perfecta sincronía: lee el cfg del perfil, lo fortifica, lo devuelve.
-- Hook: llamado desde combined_body_filter.lua justo después de cargar cfg
-- ═══════════════════════════════════════════════════════════════════════════

local _M = {}

-- Tabla de amplificación Crystal por perfil.
-- Cada entrada FORTIFICA (no reemplaza) los parámetros del perfil base.
-- La clave es el nombre del perfil en visual_profiles.json.
local CRYSTAL_AMPLIFIERS = {
    -- P0: Showroom Flash 4K — ya es extremo, Crystal lo lleva al límite absoluto
    P0_SHOWROOM_FLASH_4K = {
        codec_force      = "hvc1.2.4.L153.B0",   -- Corona tier: 4K@60 UHD
        resolution_4k    = "3840x2160",
        video_range_pq   = true,                  -- LOCKED: PQ incondicional
        hdr_private_tags = {
            "#EXT-X-APE-HDR-INTENT:MODE=OLED_UHD_AGGRESSIVE",
            "#EXT-X-APE-VIRTUAL-4K:MODE=CHINA_BOX_8K",
            "#EXT-X-APE-FLOOR-LOCK:BLACK=OLED,WHITE=SPORTS_SAFE",
        },
        crystal_mode     = "SHOWROOM_ABSOLUTE",
        upscaler_hint    = "HiSilicon_AI_SR_MAX",
    },
    -- P1: Daily Extreme 4K — Crystal fortifica la cadena de codec y HDR
    P1_DAILY_EXTREME_4K = {
        codec_force      = "hvc1.2.4.L153.B0",
        resolution_4k    = "3840x2160",
        video_range_pq   = true,
        hdr_private_tags = {
            "#EXT-X-APE-HDR-INTENT:MODE=OLED_UHD_AGGRESSIVE",
            "#EXT-X-APE-VIRTUAL-4K:MODE=CHINA_BOX_8K",
            "#EXT-X-APE-FLOOR-LOCK:BLACK=OLED,WHITE=SPORTS_SAFE",
        },
        crystal_mode     = "DAILY_EXTREME_FORTIFIED",
        upscaler_hint    = "HiSilicon_AI_SR_MAX",
    },
    -- P2: Safe Compat — Crystal inyecta agresividad visual sin romper compat
    P2_SAFE_COMPAT = {
        codec_force      = "hvc1.2.4.L153.B0",
        resolution_4k    = "3840x2160",
        video_range_pq   = true,
        hdr_private_tags = {
            "#EXT-X-APE-HDR-INTENT:MODE=OLED_UHD_AGGRESSIVE",
            "#EXT-X-APE-VIRTUAL-4K:MODE=CHINA_BOX_8K",
            "#EXT-X-APE-FLOOR-LOCK:BLACK=OLED,WHITE=SPORTS_SAFE",
        },
        crystal_mode     = "SAFE_COMPAT_FORTIFIED",
        upscaler_hint    = "FSRCNNX_x4",
    },
    -- P3: HD Boost — Crystal amplifica el boost con HEVC y 4K
    P3_HD_BOOST = {
        codec_force      = "hvc1.2.4.L153.B0",
        resolution_4k    = "3840x2160",
        video_range_pq   = true,
        hdr_private_tags = {
            "#EXT-X-APE-HDR-INTENT:MODE=OLED_UHD_AGGRESSIVE",
            "#EXT-X-APE-VIRTUAL-4K:MODE=CHINA_BOX_8K",
            "#EXT-X-APE-FLOOR-LOCK:BLACK=OLED,WHITE=SPORTS_SAFE",
        },
        crystal_mode     = "HD_BOOST_FORTIFIED",
        upscaler_hint    = "FSRCNNX_x4",
    },
    -- P4: HD Lite — Crystal fortifica el tier más ligero con máxima agresividad
    P4_HD_LITE = {
        codec_force      = "hvc1.2.4.L153.B0",
        resolution_4k    = "3840x2160",
        video_range_pq   = true,
        hdr_private_tags = {
            "#EXT-X-APE-HDR-INTENT:MODE=OLED_UHD_AGGRESSIVE",
            "#EXT-X-APE-VIRTUAL-4K:MODE=CHINA_BOX_8K",
            "#EXT-X-APE-FLOOR-LOCK:BLACK=OLED,WHITE=SPORTS_SAFE",
        },
        crystal_mode     = "HD_LITE_FORTIFIED",
        upscaler_hint    = "FSRCNNX_x4",
    },
    -- P5: SD Rescue — Crystal rescata el SD con la máxima agresividad posible
    P5_SD_RESCUE = {
        codec_force      = "hvc1.2.4.L153.B0",
        resolution_4k    = "3840x2160",
        video_range_pq   = true,
        hdr_private_tags = {
            "#EXT-X-APE-HDR-INTENT:MODE=OLED_UHD_AGGRESSIVE",
            "#EXT-X-APE-VIRTUAL-4K:MODE=CHINA_BOX_8K",
            "#EXT-X-APE-FLOOR-LOCK:BLACK=OLED,WHITE=SPORTS_SAFE",
        },
        crystal_mode     = "SD_RESCUE_FORTIFIED",
        upscaler_hint    = "Lanczos_Crystal",
    },
    -- P6: China Box 8K Ultra Aggressive — Crystal nativo, sin amplificación adicional
    P6_CHINA_BOX_8K_ULTRA_AGGRESSIVE = {
        codec_force      = "hvc1.2.4.L153.B0",
        resolution_4k    = "3840x2160",
        video_range_pq   = true,
        hdr_private_tags = {
            "#EXT-X-APE-HDR-INTENT:MODE=OLED_UHD_AGGRESSIVE",
            "#EXT-X-APE-VIRTUAL-4K:MODE=CHINA_BOX_8K",
            "#EXT-X-APE-FLOOR-LOCK:BLACK=OLED,WHITE=SPORTS_SAFE",
        },
        crystal_mode     = "CHINA_BOX_8K_NATIVE",
        upscaler_hint    = "HiSilicon_AI_SR_MAX",
    },
}

-- ═══ FUNCIÓN PRINCIPAL: fortify_variants ═════════════════════════════════
-- Recibe las variantes ya filtradas por el floor del perfil base,
-- aplica las transformaciones Crystal embebidas en sincronía con el cfg del perfil.
-- @param kept_variants: tabla de variantes (ya con floor aplicado)
-- @param mapped_profile: string (clave del perfil en visual_profiles.json)
-- @param cfg: tabla de configuración del perfil (leída de visual_profiles.json)
-- @return fortified_variants, crystal_amp (el amplificador aplicado)
function _M.fortify_variants(kept_variants, mapped_profile, cfg)
    local amp = CRYSTAL_AMPLIFIERS[mapped_profile]
    if not amp then
        -- Perfil desconocido: no modificar, retornar intacto
        return kept_variants, nil
    end

    for _, v in ipairs(kept_variants) do
        local tag = v.tag

        -- 1. CODEC FORCING: HEVC hvc1.2.4.L153.B0 (Corona Tier)
        --    Amplifica el codec del perfil base al tier máximo.
        --    FIX 2026-06-21: parsing robusto — preserva TODOS los codecs no-video
        --    (audio/subs) sin importar el orden (audio,video o video,audio,sub).
        if amp.codec_force then
            local existing = tag:match('CODECS="([^"]+)"')
            if existing then
                -- Recolectar todos los codecs NO-video (audio/sub), conservar orden.
                local non_video = {}
                for codec in existing:gmatch("[^,]+") do
                    local c = codec:gsub("^%s+", ""):gsub("%s+$", "")
                    -- video families: avc1/avc3 (H.264), hvc1/hev1 (HEVC), vp09/vp9, av01 (AV1), dvh1/dvhe (DV)
                    local is_video = c:match("^avc[13]") or c:match("^hv[ce]1")
                        or c:match("^vp0?9") or c:match("^av01") or c:match("^dvh[1e]")
                    if not is_video and c ~= "" then
                        non_video[#non_video + 1] = c
                    end
                end
                if #non_video == 0 then non_video[1] = "mp4a.40.2" end
                tag = tag:gsub('CODECS="[^"]+"',
                    'CODECS="' .. amp.codec_force .. ',' .. table.concat(non_video, ",") .. '"')
            else
                tag = tag .. ',CODECS="' .. amp.codec_force .. ',mp4a.40.2"'
            end
        end

        -- 2. RESOLUTION OVERRIDE: 3840x2160 (Virtual 4K / China Box)
        --    Fortifica la resolución del perfil base al máximo visual
        if amp.resolution_4k then
            tag = tag:gsub("RESOLUTION=%d+x%d+", "RESOLUTION=" .. amp.resolution_4k)
        end

        -- 3. VIDEO-RANGE=PQ: Doctrina LOCKED — incondicional en todos los perfiles
        --    FIX 2026-06-21: reemplazar valor existente (SDR/HLG/...) SIN duplicar el tag.
        --    BUG previo: find() con plain=true buscaba el literal "VIDEO%-RANGE=" (con %),
        --    nunca matcheaba → siempre caía al else → tag duplicado. Usar gsub con count.
        if amp.video_range_pq then
            local n
            tag, n = tag:gsub("VIDEO%-RANGE=[^,%s]+", "VIDEO-RANGE=PQ")
            if n == 0 then
                tag = tag .. ",VIDEO-RANGE=PQ"
            end
        end

        v.tag = tag
        v.crystal_mode = amp.crystal_mode
    end

    return kept_variants, amp
end

-- ═══ FUNCIÓN: inject_crystal_metadata ════════════════════════════════════
-- Inyecta los tags privados Crystal en el manifiesto (después de #EXTM3U)
-- @param new_lines: tabla de líneas del manifiesto en construcción
-- @param mapped_profile: string
-- @param profile: string (P0-P6)
function _M.inject_crystal_metadata(new_lines, mapped_profile, profile)
    local amp = CRYSTAL_AMPLIFIERS[mapped_profile]
    if not amp then return end

    -- Tag de modo Crystal
    new_lines[#new_lines + 1] = "#EXT-X-APE-CRYSTAL-FORTIFY:ACTIVE"
    new_lines[#new_lines + 1] = "#EXT-X-APE-CRYSTAL-MODE:" .. (amp.crystal_mode or "FORTIFIED")
    new_lines[#new_lines + 1] = "#EXT-X-APE-CRYSTAL-PROFILE:" .. profile

    -- Tags privados HDR/Virtual4K/FloorLock
    if amp.hdr_private_tags then
        for _, t in ipairs(amp.hdr_private_tags) do
            new_lines[#new_lines + 1] = t
        end
    end

    -- Upscaler hint
    if amp.upscaler_hint then
        new_lines[#new_lines + 1] = "#EXT-X-APE-CRYSTAL-UPSCALER:" .. amp.upscaler_hint
    end
end

-- ═══ FUNCIÓN: get_crystal_headers ════════════════════════════════════════
-- Devuelve los headers HTTP Crystal para upstream_response.lua
-- @param mapped_profile: string
-- @param profile: string (P0-P6)
-- @return table de {header_name = value}
function _M.get_crystal_headers(mapped_profile, profile)
    local amp = CRYSTAL_AMPLIFIERS[mapped_profile]
    if not amp then
        return {
            ["X-APE-Visual-Engine"]  = "CRYSTAL-UHD-v4.0",
            ["X-APE-Crystal-Active"] = "1",
            ["X-APE-Crystal-Mode"]   = "FORTIFIED",
            ["X-APE-Color-Space"]    = "BT.2020/PQ",
            ["X-APE-HDR-Profile"]    = "HDR10+DolbyVision",
        }
    end
    return {
        ["X-APE-Visual-Engine"]  = "CRYSTAL-UHD-v4.0",
        ["X-APE-Crystal-Active"] = "1",
        ["X-APE-Crystal-Mode"]   = amp.crystal_mode or "FORTIFIED",
        ["X-APE-Color-Space"]    = "BT.2020/PQ",
        ["X-APE-HDR-Profile"]    = "HDR10+DolbyVision",
        ["X-APE-Crystal-Profile"]= profile,
    }
end

return _M
