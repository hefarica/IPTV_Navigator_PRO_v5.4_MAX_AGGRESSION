set -u
echo "=== G11 rutas con rto_min (muestra)"
echo "rto_min_any=$(ip route show table all | grep -c rto_min)"
ip route show table all | grep -o "rto_min[^ ]* [0-9]*ms" | sort | uniq -c | head -5
echo "tables=$(ip route show table all | wc -l)"
echo "=== G7 PUBLICO 443 (codes only)"
URL=$(zcat /var/www/lists/APE_LISTA_4K.m3u8.gz | grep -m1 -oE https?://iptv-ape\.duckdns\.org/cdn/[^"]+\.m3u8 || true)
if [ -n "$URL" ]; then REST=${URL#*://iptv-ape.duckdns.org/cdn/}; echo "pub_manifest=$(curl -s -o /dev/null -w %{http_code} --max-time 12 "https://iptv-ape.duckdns.org/cdn/$REST")"; TS=${REST%.m3u8}.ts; echo "pub_ts=$(curl -s -o /dev/null -w %{http_code} --max-time 12 "https://iptv-ape.duckdns.org/cdn/$TS")"; M4=${REST%.m3u8}.m4s; echo "pub_m4s=$(curl -s -o /dev/null -w %{http_code} --max-time 12 "https://iptv-ape.duckdns.org/cdn/$M4")"; fi
echo "=== nginx -T hash"
nginx -T 2>/dev/null | sha256sum
echo "=== deployed sizes"
stat -c "%n %s" /etc/nginx/lua/ape_uhd.lua /etc/nginx/lua/ape_gateway.lua /etc/nginx/lua/ape_obs.lua /etc/nginx/lua/ape_luatest.lua /etc/nginx/conf.d/50-ape-meta-plane.conf
