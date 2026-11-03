-- E10 · verificación de la matriz UHD sobre el módulo STAGED (no el vivo)
-- Carga el ape_uhd parcheado desde el stage en /tmp y comprueba:
--   · declare_auto SIEMPRE 4K (techo)
--   · can_declare_8k sólo M4 (fuente >=3840 y HEVC >= L183)
--   · CODECS no se modifica
package.path = (os.getenv("STAGE_LUA") or ".") .. "/?.lua;" .. package.path
local uhd = require "ape_uhd"

local function master(...)
    local l = { "#EXTM3U" }
    for _, v in ipairs({ ... }) do l[#l + 1] = v end
    return table.concat(l, "\n") .. "\n"
end
local CASES = {
    { n = "M1_1080_avc_L40",  b = master('#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"', "1080p/i.m3u8") },
    { n = "M2_4k_hevc_L153",  b = master('#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"', "2160p/i.m3u8") },
    { n = "M3_8k_hevc_L153",  b = master('#EXT-X-STREAM-INF:BANDWIDTH=80000000,RESOLUTION=7680x4320,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"', "4320p/i.m3u8") },
    { n = "M4_8k_hevc_L183",  b = master('#EXT-X-STREAM-INF:BANDWIDTH=80000000,RESOLUTION=7680x4320,CODECS="hvc1.2.4.L183.B0,mp4a.40.2"', "4320p/i.m3u8") },
    { n = "M5_asc_720_first", b = master('#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1280x720,CODECS="hvc1.1.6.L93.B0,mp4a.40.2"', "720p/i.m3u8",
                                          '#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"', "2160p/i.m3u8") },
}
local function resolutions(body)
    local t = {}
    for l in body:gmatch("[^\r\n]+") do
        local w, h = l:match("RESOLUTION=(%d+)x(%d+)")
        if w then t[#t + 1] = w .. "x" .. h end
    end
    return table.concat(t, " ; ")
end
local function codecs(body)
    local t = {}
    for l in body:gmatch("[^\r\n]+") do
        local c = l:match('CODECS="([^"]*)"')
        if c then t[#t + 1] = c end
    end
    return table.concat(t, " | ")
end

local FAIL = 0
local function check(name, cond, got)
    print(string.format("%-28s %s  got=%s", name, cond and "OK  " or "FAIL", tostring(got)))
    if not cond then FAIL = FAIL + 1 end
end

print("== STAGE_LUA=" .. (os.getenv("STAGE_LUA") or ".") .. " · ape_uhd=" .. tostring(uhd and "cargado") .. " ==")
print("MIN_HEVC_LEVEL_8K=" .. tostring(uhd.MIN_HEVC_LEVEL_8K))
print("")
print("== declare_auto (uhd_auto=1) — techo 4K ==")
for _, c in ipairs(CASES) do
    local o, n, m = uhd.declare_auto(c.b, {})
    local r = resolutions(o)
    print(string.format("%-16s n=%d mode=%-4s res=%s", c.n, n, tostring(m), r))
    check(c.n .. " mode==4k", m == "4k", m)
    check(c.n .. " sin 7680x4320", not o:find("RESOLUTION=7680x4320", 1, true), r)
    check(c.n .. " CODECS intacto", codecs(o) == codecs(c.b), codecs(o))
end
print("")
print("== can_declare_8k / uhd8k=1 (guardas) ==")
local WANT = { M1_1080_avc_L40 = false, M2_4k_hevc_L153 = false, M3_8k_hevc_L153 = false, M4_8k_hevc_L183 = true, M5_asc_720_first = false }
for _, c in ipairs(CASES) do
    local maxr = uhd.max_resolution(c.b)
    local lvl = uhd.level_supports_8k(c.b)
    local can = uhd.can_declare_8k(c.b)
    print(string.format("%-16s max_res=%d level8k=%-5s can8k=%-5s", c.n, maxr, tostring(lvl), tostring(can)))
    check(c.n .. " can8k==" .. tostring(WANT[c.n]), can == WANT[c.n], can)
    local target = can and uhd.TARGET_8K or uhd.TARGET_4K
    local target_mode = can and "8k" or "4k"
    local o = uhd.declare(c.b, { target = target, mode = target_mode, add_pq = true, only_top = true })
    local r = resolutions(o)
    print(string.format("                 uhd8k-> mode=%-3s res=%s", target_mode, r))
    if can then
        check(c.n .. " 8K declarado sólo si can8k", o:find("RESOLUTION=7680x4320", 1, true) ~= nil, r)
    else
        check(c.n .. " no declara 8K sin guarda", not o:find("RESOLUTION=7680x4320", 1, true), r)
    end
    check(c.n .. " CODECS intacto (8k path)", codecs(o) == codecs(c.b), codecs(o))
end
print("")
print("== golden rule / codec_truth_fields ==")
local bad = master('#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x1080,CODECS="hev1.1.6.L93.B0"', "x.m3u8")
check("hev1 en STREAM-INF detectado", uhd.codec_truth_fields(bad) == 1, uhd.codec_truth_fields(bad))
check("hvc1 no marcado", uhd.codec_truth_fields(CASES[2].b) == 0, uhd.codec_truth_fields(CASES[2].b))
print("")
print(FAIL == 0 and "RESULT=PASS" or ("RESULT=FAIL (" .. FAIL .. ")"))
os.exit(FAIL == 0 and 0 or 1)
