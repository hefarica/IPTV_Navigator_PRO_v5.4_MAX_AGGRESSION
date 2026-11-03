set -u
echo "=== HOST"; hostname; date -u +%FT%TZ
echo "=== G5 LUATEST"
L=$(curl -s --max-time 10 http://127.0.0.1:8088/_ape/luatest)
echo "tail=$(printf %s "$L" | tail -c 180)"
echo "pass_true=$(printf %s "$L" | grep -o \"pass\":true | wc -l) pass_false=$(printf %s "$L" | grep -o \"pass\":false | wc -l)"
echo "=== G9 HEALTH"
H=$(curl -s --max-time 5 http://127.0.0.1:8088/_ape/health)
echo "health_tail=$(printf %s "$H" | tail -c 160)"
echo "uhd_obj=$(printf %s "$H" | grep -o \"uhd\":{[^}]*})"
echo "=== UHD ENDPOINT (before)"
U1=$(curl -s --max-time 5 http://127.0.0.1:8088/_ape/uhd)
echo "uhd1=$U1"
echo "=== G7 CDN (codes only, sin credenciales)"
URL=$(zcat /var/www/lists/APE_LISTA_4K.m3u8.gz | grep -m1 -oE https?://iptv-ape\.duckdns\.org/cdn/[^\"]+\.m3u8 || true)
if [ -n "$URL" ]; then REST=${URL#*://iptv-ape.duckdns.org/cdn/}; C=$(curl -s -o /dev/null -w %{http_code} --max-time 10 "http://127.0.0.1:8088/cdn/$REST"); echo "manifest_code=$C"; TS=${REST%.m3u8}.ts; T=$(curl -s -o /dev/null -w %{http_code} --max-time 10 "http://127.0.0.1:8088/cdn/$TS"); echo "ts_code=$T"; else echo "URL_NO_ENCONTRADA"; fi
echo "=== UHD ENDPOINT (after cdn)"
U2=$(curl -s --max-time 5 http://127.0.0.1:8088/_ape/uhd)
echo "uhd2=$U2"
echo "=== 443 EXPOSURE"
echo "uhd_443=$(curl -s -o /dev/null -w %{http_code} --max-time 8 https://iptv-ape.duckdns.org/_ape/uhd)"
echo "=== G8 LISTS"
sha256sum /var/www/lists/APE_LISTA_4K.m3u8.gz /var/www/lists/APE_LISTA_1793002539897_CDN.m3u8.gz
stat -c %n|%s|%a|%U:%G|%y /var/www/lists/APE_LISTA_4K.m3u8.gz /var/www/lists/APE_LISTA_1793002539897_CDN.m3u8.gz
echo "=== G11 RED"
sysctl -n net.ipv4.tcp_congestion_control net.core.default_qdisc net.ipv4.tcp_fastopen net.ipv4.tcp_slow_start_after_idle
echo "rto_min_lock_40ms_rutas=$(ip route show | grep -c "rto_min lock 40ms")"
echo "=== DEPLOY PARITY (10 destinos)"
for f in /etc/nginx/lua/ape_header.lua /etc/nginx/lua/ape_uri_rebase.lua /etc/nginx/lua/ape_wake_on_manifest.lua /etc/nginx/lua/ape_gateway.lua /etc/nginx/lua/ape_rebase_lib.lua /etc/nginx/lua/ape_uhd.lua /etc/nginx/lua/ape_obs.lua /etc/nginx/lua/ape_lab_api.lua /etc/nginx/lua/ape_luatest.lua /etc/nginx/conf.d/50-ape-meta-plane.conf; do sha256sum "$f"; done
echo "=== NGINX"
systemctl show nginx -p MainPID -p NRestarts -p ActiveState
nginx -t 2>&1 | tail -2
echo "=== ROLLBACK BACKUP"
ls -1 /var/backups/ape-deploy/20261028T093843Z/ 2>/dev/null | wc -l
ls -1 /var/backups/ape-deploy/20261028T093843Z/ 2>/dev/null | sed -n "1,12p"
echo "=== G10 TTFB (5 muestras, delta = total - upstream)"
i=0; while [ $i -lt 5 ]; do if [ -n "$URL" ]; then OUT=$(curl -s -D - -o /dev/null -w "%{time_total}" --max-time 10 "http://127.0.0.1:8088/cdn/$REST"); TOT=$(printf %s "$OUT" | tail -c 8); UP=$(printf %s "$OUT" | grep -i "X-APE-Upstream-Ms" | tr -dc "0-9"); echo "sample$i total_ms=$(awk "BEGIN{printf %.1f, $TOT*1000}") upstream_ms=${UP:-na}"; fi; i=$((i+1)); done
