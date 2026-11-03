set -u
echo "=== SCOPE: modificados en /var/www/html/prisma desde 18:44Z (debe ser SOLO ape_mesh.php) ==="
find /var/www/html/prisma -type f -newermt '2026-10-28 18:44:00' 2>/dev/null | sort | sed 's/^/  /'
echo "=== los 2 de t42 intactos ==="
sha256sum /var/www/html/prisma/api/ape-feedforward.php /var/www/html/prisma/cli/push_pq_profile.php | sed 's/^/  /'
echo "=== hashes finales + owner del desplegado ==="
sha256sum /var/www/html/prisma/lib/ape_mesh.php | sed 's/^/  /'
stat -c '  %n|%s|%a|%U:%G|%y' /var/www/html/prisma/lib/ape_mesh.php
echo "=== nginx y php-fpm: sin reload/restart ==="
systemctl show nginx -p MainPID -p NRestarts | sed 's/^/  nginx /'
systemctl show php8.3-fpm -p MainPID -p NRestarts -p ActiveEnterTimestamp | sed 's/^/  php-fpm /'
echo "=== sanity final ==="
curl -s -m 8 -o /dev/null -w '  feedforward HTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&ch=3&hdr=0&w=3840&h=2160&codec=hvc1&ct=1&buf=30&risk=0'
curl -s -m 6 -o /dev/null -w '  luatest HTTP=%{http_code}\n' 'http://127.0.0.1:8088/_ape/luatest'
curl -sk -m 10 -o /dev/null -w '  cdn HTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'
echo "=== backup en disco ==="
ls -la /var/backups/ape-php/20261028T184337Z/ | sed 's/^/  /'
cat /var/backups/ape-php/20261028T184337Z/BEFORE.sha256 | sed 's/^/  BEFORE /'
echo "SCOPE_END"