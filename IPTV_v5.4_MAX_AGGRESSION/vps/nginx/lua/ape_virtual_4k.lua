local _M = {}

function _M.rewrite_variant_to_4k(variant)
    variant.tag = variant.tag:gsub("RESOLUTION=%d+x%d+", "RESOLUTION=3840x2160")
    if not variant.tag:find("CODECS=", 1, true) then
        variant.tag = variant.tag .. ',CODECS="hvc1.2.4.L153.B0,mp4a.40.2"'
    else
        variant.tag = variant.tag:gsub('CODECS="[^"]+"', 'CODECS="hvc1.2.4.L153.B0,mp4a.40.2"')
    end
    
    if not variant.tag:find("HDR=PQ", 1, true) then
        variant.tag = variant.tag .. ",HDR=PQ,VIDEO-RANGE=PQ"
    end
    
    variant.resolution = "3840x2160"
    variant.codecs = "hvc1.2.4.L153.B0,mp4a.40.2"
    variant.is_hdr = true
    variant.is_hevc = true
end

function _M.inject_client_metadata(new_lines, upscaler, hdr_intent)
    table.insert(new_lines, "#EXT-X-APE-UHDX-UPSCALER:" .. tostring(upscaler))
    table.insert(new_lines, "#EXT-X-APE-UHDX-HDR-INTENT:" .. tostring(hdr_intent))
    table.insert(new_lines, "#EXT-X-APE-UHDX-VIRTUAL-4K:ACTIVE")
end

return _M
