set -u
echo "=== SCOPE: ficheros modificados en /var/www/html/prisma desde 15:18Z ==="
find /var/www/html/prisma -type f -newermt '2026-10-28 15:18:00' 2>/dev/null | sort | sed 's/^/  /'
echo "  (deben ser EXACTAMENTE los 3)"
echo "=== SCOPE: nginx intacto (sin cambios de config) ==="
sha256sum /etc/nginx/conf.d/50-ape-meta-plane.conf /etc/nginx/sites-enabled/default 2>&1 | sed 's/^/  /'
echo "  comparar con la ventana t30: 50-ape-meta-plane 3e29b928… / default 49c162a8…"
systemctl show nginx -p MainPID -p NRestarts -p ActiveEnterTimestamp | sed 's/^/  /'
echo "=== php-fpm: sin reload (uptime del master) ==="
systemctl show php8.3-fpm -p MainPID -p NRestarts -p ActiveEnterTimestamp 2>/dev/null | sed 's/^/  /'
echo "=== sanity final ==="
curl -s -m 8 -o /dev/null -w '  feedforward HTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&ch=3&hdr=0&w=1920&h=1080&codec=avc1&ct=1&buf=30&risk=0'
curl -s -m 6 -o /dev/null -w '  luatest HTTP=%{http_code}\n' 'http://127.0.0.1:8088/_ape/luatest'
curl -sk -m 10 -o /dev/null -w '  cdn HTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'
echo "=== backup en disco ==="
ls -la /var/backups/ape-php/20261028T151836Z/ | sed 's/^/  /'
echo "SCOPE_END"