-- ═══════════════════════════════════════════════════════════════════════════
-- E5 · SIMULACIÓN DEL PARCHE "techo 4K" — NO es el módulo desplegado
-- ═══════════════════════════════════════════════════════════════════════════
-- Qué hace: carga el módulo VIVO (/etc/nginx/lua/ape_uhd.lua, sha f1f5eb67…) y
--   ejecuta las funciones PROPUESTAS en E5-uhd-techo4k.patch.md con una matriz
--   de fuentes. Prueba que el parche produce 4K salvo 8K legal (fuente >=4K y
--   nivel >= L183).
--
-- Qué NO hace: no escribe nada, no toca el módulo desplegado, no cambia flags,
--   no contacta al proveedor. Sólo aritmética de cadenas.
--
-- Cómo se ejecuta (desde la estación, sin subir ficheros al VPS):
--   $lua = Get-Content _vps_stage/edge/uhd/proposed/patch_sim.lua -Raw
--   $lua | ssh hetzner-iptv 'lua5.1 -'
-- ═══════════════════════════════════════════════════════════════════════════
package.path = "/etc/nginx/lua/?.lua;" .. package.path
local uhd = require "ape_uhd"

-- ═══ funciones del parche (idénticas al .patch.md) ═════════════════════════
local MIN_L8K = 183

local function max_resolution(body)
    local mx = 0
    for line in (body .. "\n"):gmatch("(.-)\r?\n") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            local w = tonumber(line:match("RESOLUTION=(%d+)x%d+") or 0) or 0
            if w > mx then mx = w end
        end
    end
    return mx
end

local function level_supports_8k(body)
    for line in (body .. "\n"):gmatch("(.-)\r?\n") do
        if line:find("#EXT-X-STREAM-INF", 1, true) then
            local codecs = line:match('CODECS="([^"]*)"') or ""
            for tok in codecs:gmatch("[^,]+") do
                local lv = tok:match("^hv[ce][1e]%.%d+%.%w+%.L(%d+)")
                if lv then return (tonumber(lv) or 0) >= MIN_L8K end
                if tok:match("^avc[13]%.") then return false end
            end
        end
    end
    return false
end

local function can_declare_8k(body)
    return max_resolution(body) >= 3840 and level_supports_8k(body)
end

-- declare_auto PARCHEADO: techo 4K, nunca 8K
local function declare_auto_v2(body, opts)
    opts = opts or {}
    if uhd.top_resolution(body) == nil then return body, 0, nil end
    local nb, n = uhd.declare(body, { target = uhd.TARGET_4K, mode = "4k",
        add_pq = opts.add_pq, only_top = true })
    return nb, n, "4k"
end

-- ═══ matriz de fuentes ════════════════════════════════════════════════════
local function master(...)
    local l = { "#EXTM3U" }
    for _, v in ipairs({ ... }) do l[#l + 1] = v end
    return table.concat(l, "\n") .. "\n"
end

local CASES = {
    { n = "M1_1080_avc_L40", b = master(
        '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"', "1080p/i.m3u8") },
    { n = "M2_4k_hevc_L153", b = master(
        '#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"', "2160p/i.m3u8") },
    { n = "M3_8k_hevc_L153", b = master(
        '#EXT-X-STREAM-INF:BANDWIDTH=80000000,RESOLUTION=7680x4320,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"', "4320p/i.m3u8") },
    { n = "M4_8k_hevc_L183", b = master(
        '#EXT-X-STREAM-INF:BANDWIDTH=80000000,RESOLUTION=7680x4320,CODECS="hvc1.2.4.L183.B0,mp4a.40.2"', "4320p/i.m3u8") },
    { n = "M5_asc_720_first", b = master(
        '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1280x720,CODECS="hvc1.1.6.L93.B0,mp4a.40.2"', "720p/i.m3u8",
        '#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"', "2160p/i.m3u8") },
}

local function res(body)
    local t = {}
    for l in body:gmatch("[^\r\n]+") do
        local w, h = l:match("RESOLUTION=(%d+)x(%d+)")
        if w then t[#t + 1] = w .. "x" .. h end
    end
    return table.concat(t, " ; ")
end

print("== tras el parche · uhd_auto=1 (techo 4K) ==")
for _, c in ipairs(CASES) do
    local o, n, m = declare_auto_v2(c.b, {})
    print(string.format("%-16s n=%d mode=%-4s res=%s", c.n, n, tostring(m), res(o)))
end

print("")
print("== tras el parche · uhd8k=1 (fuente>=4K Y nivel>=L183) ==")
for _, c in ipairs(CASES) do
    local ok8 = can_declare_8k(c.b)
    local target = ok8 and uhd.TARGET_8K or uhd.TARGET_4K
    local mode = ok8 and "8k" or "4k"
    local o, n = uhd.declare(c.b, { target = target, mode = mode, add_pq = true, only_top = true })
    print(string.format("%-16s can8k=%-5s -> mode=%-3s res=%s", c.n, tostring(ok8), mode, res(o)))
end

print("")
print("== detectores del parche ==")
for _, c in ipairs(CASES) do
    print(string.format("%-16s max_res=%d level8k=%-5s can8k=%-5s", c.n,
        max_resolution(c.b), tostring(level_supports_8k(c.b)), tostring(can_declare_8k(c.b))))
end

print("")
print("== control: el modulo VIVO sin parche (declare_auto actual) ==")
for _, c in ipairs(CASES) do
    local o, n, m = uhd.declare_auto(c.b, {})
    print(string.format("%-16s n=%d mode=%-4s res=%s", c.n, n, tostring(m), res(o)))
end
