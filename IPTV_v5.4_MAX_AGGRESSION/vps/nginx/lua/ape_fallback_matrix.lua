-- APE CODEC FALLBACK MATRIX v1.0 (2026-11-01)
-- SSOT: hvc1 capacity table delivered by the owner.
-- Rule: if a real 4K exists, try 4K@120 -> 4K@60 -> 4K@30; if none of
-- those decode/play, fall to the channel's best NATIVE resolution.
-- Never declares 4K for a channel whose native ladder is below 4K.

local M = {}

local ROWS = {
    { id = "8k120", codec = "hvc1.2.4.L186.B0", hev1 = "hev1.2.4.L186.B0", width = 8192, height = 4320, fps = 120,  resolution = "8192x4320", native = "8K" },
    { id = "8k60",  codec = "hvc1.2.4.L183.B0", hev1 = "hev1.2.4.L183.B0", width = 8192, height = 4320, fps = 60,   resolution = "8192x4320", native = "8K" },
    { id = "8k30",  codec = "hvc1.2.4.L180.B0", hev1 = "hev1.2.4.L180.B0", width = 8192, height = 4320, fps = 30,   resolution = "8192x4320", native = "8K" },
    { id = "4k120", codec = "hvc1.2.4.L156.B0", hev1 = "hev1.2.4.L156.B0", width = 4096, height = 2160, fps = 120,  resolution = "4096x2160", native = "4K" },
    { id = "4k60",  codec = "hvc1.2.4.L153.B0", hev1 = "hev1.2.4.L153.B0", width = 4096, height = 2160, fps = 60,   resolution = "4096x2160", native = "4K" },
    { id = "4k30",  codec = "hvc1.2.4.L150.B0", hev1 = "hev1.2.4.L150.B0", width = 4096, height = 2160, fps = 30,   resolution = "4096x2160", native = "4K" },
    { id = "dci60", codec = "hvc1.2.4.L123.B0", hev1 = "hev1.2.4.L123.B0", width = 2048, height = 1080, fps = 60,   resolution = "2048x1080", native = "2K" },
    { id = "hd50",  codec = "hvc1.2.4.L123.B0", hev1 = "hev1.2.4.L123.B0", width = 1920, height = 1080, fps = 50,   resolution = "1920x1080", native = "FHD" },
    { id = "2k30",  codec = "hvc1.2.4.L120.B0", hev1 = "hev1.2.4.L120.B0", width = 2048, height = 1080, fps = 30,   resolution = "2048x1080", native = "2K" },
    { id = "720p60", codec = "hvc1.2.4.L93.B0", hev1 = "hev1.2.4.L93.B0", width = 1280, height = 720, fps = 60,    resolution = "1280x720", native = "HD" },
    { id = "720p33", codec = "hvc1.2.4.L93.B0", hev1 = "hev1.2.4.L93.B0", width = 1280, height = 720, fps = 33.7,  resolution = "1280x720", native = "HD" },
    { id = "480p16", codec = "hvc1.2.4.L90.B0", hev1 = "hev1.2.4.L90.B0", width = 854,  height = 480,  fps = 30,    resolution = "854x480",  native = "SD" },
    { id = "480p43", codec = "hvc1.2.4.L90.B0", hev1 = "hev1.2.4.L90.B0", width = 720,  height = 480,  fps = 30,    resolution = "720x480",  native = "SD" }
}

local CHAINS = {
    ["8k120"] = {"4k120", "4k60", "4k30", "8k60", "8k30"},
    ["8k60"]  = {"4k120", "4k60", "4k30", "8k30"},
    ["8k30"]  = {"4k120", "4k60", "4k30"},
    ["4k120"] = {"4k60", "4k30", "dci60", "hd50", "2k30", "720p60", "720p33", "480p16", "480p43"},
    ["4k60"]  = {"4k30", "dci60", "hd50", "2k30", "720p60", "720p33", "480p16", "480p43"},
    ["4k30"]  = {"dci60", "hd50", "2k30", "720p60", "720p33", "480p16", "480p43"},
    ["dci60"] = {"hd50", "2k30", "720p60", "720p33", "480p16", "480p43"},
    ["hd50"]  = {"2k30", "720p60", "720p33", "480p16", "480p43"},
    ["2k30"]  = {"720p60", "720p33", "480p16", "480p43"},
    ["720p60"] = {"720p33", "480p16", "480p43"},
    ["720p33"] = {"480p16", "480p43"},
    ["480p16"] = {"480p43"},
    ["480p43"] = {}
}

local BY_ID = {}
for _, row in ipairs(ROWS) do BY_ID[row.id] = row end

local function norm_res(value)
    local w, h = string.match(tostring(value or ""), "(%d%d%d%d?)%s*[xX]%s*(%d%d%d%d?)")
    if not w then return "" end
    return tostring(tonumber(w)) .. "x" .. tostring(tonumber(h))
end

function M.rows()
    return ROWS
end

function M.chain(codec, resolution, fps)
    local wanted = string.lower(tostring(codec or ""))
    local res = norm_res(resolution)
    local row = nil
    if wanted ~= "" then
        for _, r in ipairs(ROWS) do
            if string.lower(r.codec) == wanted and (res == "" or r.resolution == res) then
                row = r
                break
            end
        end
        if not row then
            for _, r in ipairs(ROWS) do
                if string.lower(r.codec) == wanted then row = r; break end
            end
        end
    end
    if not row and res ~= "" then
        for _, r in ipairs(ROWS) do
            if r.resolution == res then row = r; break end
        end
    end
    if not row then return { policy = "BEST_4K_THEN_NATIVE", primary = nil, chain = {} } end

    local out = {}
    for _, id in ipairs(CHAINS[row.id] or {}) do
        if BY_ID[id] then table.insert(out, BY_ID[id]) end
    end
    return { policy = "BEST_4K_THEN_NATIVE", primary = row, chain = out }
end

function M.codecs(codec, resolution, fps)
    local result = M.chain(codec, resolution, fps)
    local out = {}
    for _, row in ipairs(result.chain) do table.insert(out, row.codec) end
    return out
end

return M
