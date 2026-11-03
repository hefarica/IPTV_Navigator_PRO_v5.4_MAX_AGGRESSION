set -u
M=/var/www/html/prisma/lib/ape_mesh.php
echo "=== PREFLIGHT READ-ONLY $(date -u +%FT%TZ) host=$(hostname) ==="
echo "--- 1. desplegado actual (ape_mesh) — esperado cafe66e4… según enunciado"
sha256sum "$M"; stat -c '   %n|%s|%a|%U:%G|%y' "$M"
echo "--- 2. los otros 2 de t42 deben seguir iguales (9cd4e0fa / f0fc5e92)"
sha256sum /var/www/html/prisma/api/ape-feedforward.php /var/www/html/prisma/cli/push_pq_profile.php
echo "--- 3. php / opcache / fpm"
php -v 2>&1 | head -n 1
php -r 'echo "  validate_timestamps=",ini_get("opcache.validate_timestamps")," revalidate_freq=",ini_get("opcache.revalidate_freq"),"\n";'
systemctl show php8.3-fpm -p MainPID -p NRestarts -p ActiveEnterTimestamp 2>/dev/null | sed 's/^/  /'
echo "--- 4. nginx intacto?"
systemctl show nginx -p MainPID -p NRestarts | sed 's/^/  /'
nginx -t 2>&1 | sed 's/^/  /'
echo "--- 5. BEFORE feedforward device=test-device w=3840 h=2160 hvc1"
curl -s -m 10 -o /tmp/ff_before.json -w '  HTTP=%{http_code} bytes=%{size_download}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&ch=3&hdr=0&w=3840&h=2160&codec=hvc1&ct=1&buf=30&risk=0'
sha256sum /tmp/ff_before.json | sed 's/^/  sha=/'
echo "--- 6. BEFORE file=x (passthrough)"
curl -s -m 10 -o /tmp/ff_file_before.json -w '  HTTP=%{http_code} bytes=%{size_download}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?file=x'
sha256sum /tmp/ff_file_before.json | sed 's/^/  sha=/'
echo "--- 7. luatest / cdn / _ape/uhd"
curl -s -m 6 -o /tmp/lua_bf.json -w '  luatest HTTP=%{http_code}\n' 'http://127.0.0.1:8088/_ape/luatest'
php -r '$j=json_decode(@file_get_contents("/tmp/lua_bf.json"),true); echo "  expected=",($j["expected"]??"?")," asserts_ok=",var_export($j["asserts_ok"]??null,true)," fail=",($j["fail"]??"?"),"\n";'
curl -sk -m 10 -o /dev/null -w '  cdn HTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'
curl -s -m 6 -o /dev/null -w '  _ape/uhd HTTP=%{http_code}\n' 'http://127.0.0.1:8088/_ape/uhd'
echo "--- 8. estado del JSON BEFORE (claves y ape_vpp)"
php -r '$j=json_decode(file_get_contents("/tmp/ff_before.json"),true); echo "  claves=",implode(",",array_keys($j)),"\n  ape_vpp=",(isset($j["ape_vpp"])?"PRESENTE":"AUSENTE"),"\n  device_settings=",(is_array($j["device_settings"]??null)?count($j["device_settings"]):"n/a"),"\n  presets=",(is_array($j["presets"]??null)?count($j["presets"]):"n/a"),"\n";'
echo "--- 9. policy_deltas (PDO read-only)"
php -r 'try{$p=new PDO("sqlite:/opt/netshield/data/conviva.db");$t=$p->query("SELECT name FROM sqlite_master WHERE type=\"table\"")->fetchAll(PDO::FETCH_COLUMN);echo "  tablas=",implode(",",$t),"\n  policy_deltas=",(in_array("policy_deltas",$t,true)?$p->query("SELECT count(*) FROM policy_deltas")->fetchColumn():"sin tabla"),"\n";}catch(Throwable $e){echo "  ERR ",$e->getMessage(),"\n";}'
echo "PREFLIGHT_END"