local _M = {}

local resolution_weights = {
    ["3840x2160"] = 100,
    ["1920x1080"] = 80,
    ["1280x720"]  = 60,
    ["960x540"]   = 40,
    ["854x480"]   = 30,
}

local codec_weights = {
    ["hvc1"] = 50,
    ["hev1"] = 50,
    ["av01"] = 40,
    ["avc1"] = 20,
}

function _M.calculate_score(variant)
    local score = 0
    local res = variant.resolution or "1920x1080"
    score = score + (resolution_weights[res] or 50)

    local codecs = variant.codecs or ""
    local codec_matched = false
    for codec, weight in pairs(codec_weights) do
        if codecs:find(codec, 1, true) then
            score = score + weight
            codec_matched = true
            break
        end
    end
    if not codec_matched then score = score + 10 end

    local bw = variant.bw or 0
    if bw > 0 then
        score = score + math.floor(math.log(bw) * 3)
    end

    local fps = variant.fps or 30
    if fps >= 60 then score = score + 15 end
    if variant.is_hdr then score = score + 30 end

    return score
end

return _M
