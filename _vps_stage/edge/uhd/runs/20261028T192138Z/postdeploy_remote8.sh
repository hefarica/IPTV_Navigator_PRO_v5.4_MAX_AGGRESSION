set -u
echo "=== HOST"; hostname; date -u +%FT%TZ
echo "=== G5 LUATEST"
L=$(curl -s --max-time 10 http://127.0.0.1:8088/_ape/luatest)
echo "tail=$(printf %s "$L" | tail -c 140)"
echo "=== G9 HEALTH"
H=$(curl -s --max-time 5 http://127.0.0.1:8088/_ape/health)
echo "tail=$(printf %s "$H" | tail -c 140)"
echo "=== UHD + G7 + 443"
U1=$(curl -s --max-time 5 http://127.0.0.1:8088/_ape/uhd); echo "uhd1=$U1"
URL=$(zcat /var/www/lists/APE_LISTA_4K.m3u8.gz | grep -m1 -oE https?://iptv-ape[^[:space:]]+/cdn/[^[:space:]]+ | head -1)
if [ -n "$URL" ]; then REST=${URL#*://iptv-ape.duckdns.org/cdn/}; echo "pub_manifest=$(curl -s -o /dev/null -w %{http_code} --max-time 12 https://iptv-ape.duckdns.org/cdn/$REST)"; TS=${REST%.m3u8}.ts; echo "pub_ts=$(curl -s -o /dev/null -w %{http_code} --max-time 12 https://iptv-ape.duckdns.org/cdn/$TS)"; M4=${REST%.m3u8}.m4s; echo "pub_m4s=$(curl -s -o /dev/null -w %{http_code} --max-time 12 https://iptv-ape.duckdns.org/cdn/$M4)"; MP=${REST%.m3u8}.mp4; echo "pub_mp4=$(curl -s -o /dev/null -w %{http_code} --max-time 12 https://iptv-ape.duckdns.org/cdn/$MP)"; fi
U2=$(curl -s --max-time 5 http://127.0.0.1:8088/_ape/uhd); echo "uhd2=$U2"
echo "uhd_443=$(curl -s -o /dev/null -w %{http_code} --max-time 8 https://iptv-ape.duckdns.org/_ape/uhd)"
echo "=== G8"
sha256sum /var/www/lists/APE_LISTA_4K.m3u8.gz /var/www/lists/APE_LISTA_1793002539897_CDN.m3u8.gz
stat -c "%n|%s|%m" /var/www/lists/APE_LISTA_4K.m3u8.gz /var/www/lists/APE_LISTA_1793002539897_CDN.m3u8.gz 2>/dev/null || stat -c "%n|%s|%y" /var/www/lists/APE_LISTA_4K.m3u8.gz /var/www/lists/APE_LISTA_1793002539897_CDN.m3u8.gz
echo "=== G11"
sysctl -n net.ipv4.tcp_congestion_control net.core.default_qdisc net.ipv4.tcp_fastopen net.ipv4.tcp_slow_start_after_idle
echo "rto_min_all_tables=$(ip route show table all | grep -c rto_min)"
echo "iptv_subnets_present=$(ip route show table all | grep -cE '91.208.115.0|149.18.45.0|172.110.220.0')"
echo "=== PARITY 10"
for f in /etc/nginx/lua/ape_header.lua /etc/nginx/lua/ape_uri_rebase.lua /etc/nginx/lua/ape_wake_on_manifest.lua /etc/nginx/lua/ape_gateway.lua /etc/nginx/lua/ape_rebase_lib.lua /etc/nginx/lua/ape_uhd.lua /etc/nginx/lua/ape_obs.lua /etc/nginx/lua/ape_lab_api.lua /etc/nginx/lua/ape_luatest.lua /etc/nginx/conf.d/50-ape-meta-plane.conf; do sha256sum "$f"; done
echo "=== NGINX"
systemctl show nginx -p MainPID -p NRestarts -p ActiveState; nginx -t 2>&1 | tail -2
echo "=== BACKUP"
ls -1dt /var/backups/ape-deploy/*/ 2>/dev/null | head -2
for d in $(ls -1dt /var/backups/ape-deploy/*/ 2>/dev/null | head -1); do echo "latest=$d files=$(find "$d" -type f | wc -l)"; done
echo "=== G10"
if [ -n "$URL" ]; then i=0; while [ $i -lt 5 ]; do OUT=$(curl -s -D - -o /dev/null -w "%{time_total}" --max-time 10 "http://127.0.0.1:8088/cdn/$REST"); TOT=$(printf %s "$OUT" | tail -c 8); UP=$(printf %s "$OUT" | grep -i "X-APE-Upstream-Ms" | tr -dc "0-9" | head -c 8); echo "sample$i total_s=$TOT upstream_ms=${UP:-na}"; i=$((i+1)); done; fi