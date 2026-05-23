-- APE MEMC-TOTAL-8K120 — Synchronized v22.6.0-MEMC-TOTAL-8K120
local _M = {}

-- rewrite_variant_to_4k(variant, opts) — FAKE 4K (resolución + codec hint).
-- opts (todos opcionales):
--   opts.codec    → codec de video a declarar (default hvc1.2.4.L153.B0 = T1 cascada)
--   opts.with_hdr → si true, añade HDR=PQ,VIDEO-RANGE=PQ. DEFAULT false: forzar PQ
--                   sobre un stream SDR = pantallazo negro HDMI (mentira HDR prohibida).
--                   El SDR→HDR real lo hace el TV (hdr_conversion_mode por ADB).
-- Sin opts → comportamiento legacy (T1 + HDR=PQ) para retrocompat de llamadas viejas.
function _M.rewrite_variant_to_4k(variant, opts)
    local legacy = (opts == nil)
    opts = opts or {}
    local vcodec = opts.codec or "hvc1.2.4.L153.B0"
    -- preservar audio existente; default AAC-LC (sin Atmos/ec-3 — doctrina audio)
    local audio = "mp4a.40.2"
    local a = (variant.codecs or ""):match("mp4a%.[%w%.]+") or (variant.codecs or ""):match("ac%-3")
    if a then audio = a end
    local new_codecs = vcodec .. "," .. audio

    variant.tag = variant.tag:gsub("RESOLUTION=%d+x%d+", "RESOLUTION=3840x2160")
    if not variant.tag:find("CODECS=", 1, true) then
        variant.tag = variant.tag .. ',CODECS="' .. new_codecs .. '"'
    else
        variant.tag = variant.tag:gsub('CODECS="[^"]+"', 'CODECS="' .. new_codecs .. '"')
    end

    if legacy or opts.with_hdr then
        if not variant.tag:find("HDR=PQ", 1, true) then
            variant.tag = variant.tag .. ",HDR=PQ,VIDEO-RANGE=PQ"
        end
        variant.is_hdr = true
    end

    variant.resolution = "3840x2160"
    variant.codecs = new_codecs
    variant.is_hevc = true
end

-- ── Cascade-driven rewrite (STAGING 2026-05-21) ─────────────────────────
-- Reescribe SOLO el codec de video al string del tier resuelto por la cascada,
-- PRESERVANDO el codec de audio. NO toca RESOLUTION ni añade HDR (honestidad:
-- HDR=PQ falso sobre stream SDR = pantallazo negro). El CODECS= es un HINT que
-- el player negocia con el bitstream real; no fuerza el códec físico.
function _M.rewrite_variant_codecs(variant, tier_codec)
    if not tier_codec or tier_codec == "" then return end
    -- preservar audio existente; default AAC-LC (sin Atmos/ec-3 — ver doctrina audio)
    local audio = "mp4a.40.2"
    local cur = variant.codecs or ""
    local a = cur:match("mp4a%.[%w%.]+") or cur:match("ac%-3")
    if a then audio = a end
    local new_codecs = tier_codec .. "," .. audio
    if not variant.tag:find("CODECS=", 1, true) then
        variant.tag = variant.tag .. ',CODECS="' .. new_codecs .. '"'
    else
        variant.tag = variant.tag:gsub('CODECS="[^"]+"', 'CODECS="' .. new_codecs .. '"')
    end
    variant.codecs = new_codecs
end

function _M.inject_client_metadata(new_lines, upscaler, hdr_intent)
    table.insert(new_lines, "#EXT-X-APE-UHDX-UPSCALER:" .. tostring(upscaler))
    table.insert(new_lines, "#EXT-X-APE-UHDX-HDR-INTENT:" .. tostring(hdr_intent))
    table.insert(new_lines, "#EXT-X-APE-UHDX-VIRTUAL-4K:ACTIVE")
end

return _M
