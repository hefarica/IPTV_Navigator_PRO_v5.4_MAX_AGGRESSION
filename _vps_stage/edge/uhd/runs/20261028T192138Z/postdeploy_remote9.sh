set -u
echo "=== G8 mtime exacto"
stat -c "%n|%s|%a|%U:%G|%y" /var/www/lists/APE_LISTA_4K.m3u8.gz /var/www/lists/APE_LISTA_1793002539897_CDN.m3u8.gz
echo "=== G6bis modulo desplegado (allow_8k=true)"
lua5.1 -e '
local uhd = dofile("/etc/nginx/lua/ape_uhd.lua")
local function mk(res, codec)
  return "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION="..res..",CODECS=\""..codec.."\"\nseg.m3u8\n"
end
local cases = {
 {"4K_L183", mk("3840x2160","hvc1.2.4.L183.B0,mp4a.40.2")},
 {"4K_L153", mk("3840x2160","hvc1.2.4.L153.B0,mp4a.40.2")},
 {"8K_L183", mk("7680x4320","hvc1.2.4.L183.B0,mp4a.40.2")},
 {"8K_L153", mk("7680x4320","hvc1.2.4.L153.B0,mp4a.40.2")},
 {"1080_AVC", mk("1920x1080","avc1.640028,mp4a.40.2")}
}
for _,c in ipairs(cases) do
  local out, n, mode, can8k = uhd.declare_auto(c[2], {allow_8k=true})
  print(string.format("%s | n=%s mode=%s can8k=%s | %s | %s", c[1], tostring(n), tostring(mode), tostring(can8k), tostring(out:match("#EXT%-X%-STREAM%-INF:[^\n]*")), tostring(out:match("#EXT%-X%-APE%-UPSCALE:[^\n]*"))))
end
'
echo "=== G6bis flag off"
lua5.1 -e '
local uhd = dofile("/etc/nginx/lua/ape_uhd.lua")
local b = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=3840x2160,CODECS=\"hvc1.2.4.L183.B0,mp4a.40.2\"\nseg.m3u8\n"
local out, n, mode, can8k = uhd.declare_auto(b, {allow_8k=false})
print(string.format("4K_L183_allow_false | mode=%s can8k=%s | %s", tostring(mode), tostring(can8k), tostring(out:match("#EXT%-X%-APE%-UPSCALE:[^\n]*"))))
'