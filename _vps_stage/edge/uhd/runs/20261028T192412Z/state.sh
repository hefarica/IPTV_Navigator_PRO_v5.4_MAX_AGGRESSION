set -u
echo "=== POST-DEPLOY READ-ONLY $(date -u +%FT%TZ) host=$(hostname) ==="
echo "--- A) 10 destinos del manifiesto (sha256 desplegado)"
for f in ape_header.lua ape_uri_rebase.lua ape_wake_on_manifest.lua ape_gateway.lua ape_rebase_lib.lua ape_uhd.lua ape_obs.lua ape_lab_api.lua ape_luatest.lua; do
  [ -f "/etc/nginx/lua/$f" ] && sha256sum "/etc/nginx/lua/$f" || echo "AUSENTE /etc/nginx/lua/$f"
done
[ -f /etc/nginx/conf.d/50-ape-meta-plane.conf ] && sha256sum /etc/nginx/conf.d/50-ape-meta-plane.conf || echo "AUSENTE conf"
echo "--- B) nginx: version, test, master"
nginx -v 2>&1
nginx -t 2>&1
systemctl show nginx -p MainPID -p NRestarts -p ActiveEnterTimestamp -p ExecMainStartTimestamp | sed 's/^/  /'
echo "--- C) /_ape/uhd (loopback 8088)"
curl -s -m 6 -o /tmp/uhd.json -w '  HTTP=%{http_code} bytes=%{size_download}\n' 'http://127.0.0.1:8088/_ape/uhd'
cat /tmp/uhd.json; echo
echo "--- D) /_ape/uhd desde 443 (NO debe ser accesible)"
curl -sk -m 8 -o /dev/null -w '  443 HTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/_ape/uhd'
echo "--- E) /_ape/health (loopback)"
curl -s -m 6 -o /tmp/health.json -w '  HTTP=%{http_code} bytes=%{size_download}\n' 'http://127.0.0.1:8088/_ape/health'
php -r '$j=json_decode(file_get_contents("/tmp/health.json"),true); if(!is_array($j)){echo "  NO_JSON\n";exit;} echo "  claves_en_orden=",implode(",",array_keys($j)),"\n  ok=",var_export($j["ok"]??null,true)," shared_dicts=",var_export($j["shared_dicts"]??null,true)," upstreams_down=",var_export($j["upstreams_down"]??null,true),"\n  uhd_presente=",(isset($j["uhd"])?"SI (ultima clave)":"NO"),"\n";'
echo "--- F) /_ape/luatest (loopback)"
curl -s -m 6 -o /tmp/lua.json -w '  HTTP=%{http_code} bytes=%{size_download}\n' 'http://127.0.0.1:8088/_ape/luatest'
php -r '$j=json_decode(file_get_contents("/tmp/lua.json"),true); if(!is_array($j)){echo "  NO_JSON\n";exit;} echo "  expected=",($j["expected"]??"?")," asserts_ok=",var_export($j["asserts_ok"]??null,true)," fail=",($j["fail"]??"?")," total_asserts=",(is_array($j["asserts"]??null)?count($j["asserts"]):"n/a"),"\n";'
echo "--- G) /cdn/ manifest + segmentos"
curl -sk -m 10 -o /dev/null -w '  m3u8 HTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'
for ext in ts m4s mp4; do
  curl -sk -m 10 -o /dev/null -w "  .$ext HTTP=%{http_code}\n" "https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.$ext"
done
echo "--- H) listas servidas vs baseline t30"
sha256sum /var/www/lists/APE_LISTA_4K.m3u8.gz /var/www/lists/APE_LISTA_1793002539897_CDN.m3u8.gz 2>&1
stat -c '  %n|%s|%y' /var/www/lists/APE_LISTA_4K.m3u8.gz /var/www/lists/APE_LISTA_1793002539897_CDN.m3u8.gz 2>&1
echo "--- I) rollback: stamps de deploy"
ls -1 /var/backups/ape-deploy/ 2>/dev/null | tail -n 5 | sed 's/^/  stamp=/'
LATEST=$(ls -1d /var/backups/ape-deploy/*/ 2>/dev/null | tail -n 1)
echo "  ultimo=$LATEST  ficheros=$(find "$LATEST" -type f 2>/dev/null | wc -l)"
echo "--- J) red (G11)"
sysctl -n net.ipv4.tcp_congestion_control net.core.default_qdisc net.ipv4.tcp_fastopen net.ipv4.tcp_slow_start_after_idle 2>&1 | sed 's/^/  /'
echo "POST_END"