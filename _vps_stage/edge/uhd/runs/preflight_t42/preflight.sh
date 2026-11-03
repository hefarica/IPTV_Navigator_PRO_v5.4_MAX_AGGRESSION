set -u
echo "=== PRE-FLIGHT READ-ONLY $(date -u +%FT%TZ) host=$(hostname) ==="
echo "--- 1. hashes + stat de los 3 desplegados"
for f in /var/www/html/prisma/lib/ape_mesh.php /var/www/html/prisma/api/ape-feedforward.php /var/www/html/prisma/cli/push_pq_profile.php; do
  if [ -f "$f" ]; then sha256sum "$f"; stat -c '   %n|%s|%a|%U:%G|%y' "$f"; else echo "AUSENTE $f"; fi
done
echo "--- 2. php + opcache"
php -v 2>&1 | head -n 1
php -r 'echo "validate_timestamps=", ini_get("opcache.validate_timestamps"), " revalidate_freq=", ini_get("opcache.revalidate_freq"), " enable=", ini_get("opcache.enable"), "\n";' 2>&1
echo "--- 3. php-fpm activo (solo lectura)"
systemctl is-active php8.3-fpm 2>/dev/null || systemctl is-active php-fpm 2>/dev/null || echo "php-fpm unit ?"
echo "--- 4. dirs destino"
ls -la /var/www/html/prisma/lib/ape_mesh.php /var/www/html/prisma/api/ape-feedforward.php /var/www/html/prisma/cli/push_pq_profile.php 2>&1
echo "--- 5. sqlite candidates"
ls -la /var/www/html/prisma/db 2>/dev/null | head -n 12
command -v sqlite3 && sqlite3 --version || echo "sqlite3 NO"
echo "--- 6. luatest 88/88 ?"
curl -s -m 5 http://127.0.0.1:8088/_ape/luatest 2>&1 | tail -c 400
echo
echo "--- 7. feedforward BEFORE (device=test-device)"
curl -s -m 8 -w '\nHTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&ch=3&hdr=0&w=1920&h=1080&codec=avc1&ct=1&buf=30&risk=0' 2>&1 | tail -c 900
echo "--- 8. feedforward BEFORE (file=x passthrough)"
curl -s -m 8 -w '\nHTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&file=x' 2>&1 | tail -c 400
echo "PREFLIGHT_END"