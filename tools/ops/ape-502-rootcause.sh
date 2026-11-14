#!/usr/bin/env bash
# Por que pulse.php devuelve 502. Lee las rutas del codigo y prueba el upstream.
set -uo pipefail

echo "=== 1. Las rutas que producen 502 en pulse.php ==="
awk 'NR>=420 && NR<=540 {printf "%4d  %s\n", NR, $0}' /var/www/html/prisma/api/pulse.php | \
  grep -nE '502|http_response_code|curl|upstream|retry|sleep|timeout|errno|HTTP' | head -n 30 | cut -c1-165

echo ""
echo "=== 2. El bloque completo del 502 (lineas 520-535) ==="
awk 'NR>=515 && NR<=540 {printf "%4d  %s\n", NR, $0}' /var/www/html/prisma/api/pulse.php | cut -c1-170

echo ""
echo "=== 3. Que canal fue el ultimo 502 y que dice el log de canary ==="
awk '$9==502 {print $4, $7}' /var/log/nginx/playlist_access.log | tail -n 3 | cut -c1-140

echo ""
echo "=== 4. Pruebo el upstream DIRECTAMENTE (line.tivi-ott.net) ==="
U='http://line.tivi-ott.net/live/3JHFTC/U56BDP/368594.m3u8'
for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 \
    -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' \
    "$U" 2>/dev/null)
  echo "  intento $i -> $code"
  sleep 1
done

echo ""
echo "=== 5. Pruebo un 4K que dio 502 (1100104) ==="
U2='http://line.tivi-ott.net/live/3JHFTC/U56BDP/1100104.m3u8'
for i in 1 2 3; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$U2" 2>/dev/null)
  echo "  intento $i -> $code"
  sleep 1
done

echo ""
echo "=== 6. Pruebo EVEST (el otro proveedor) ==="
U3='http://evestv.wuitf.com/live/2RHAVYWB/SDXH4MYV/3406.m3u8'
for i in 1 2 3; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$U3" 2>/dev/null)
  echo "  intento $i -> $code"
  sleep 1
done

echo ""
echo "=== 7. Los 502 por proveedor (de la lista de canales que fallaron) ==="
for id in 1100104 1100083 368594 15426 1105160 1090806 15423 15420 1174213 1100094; do
  prov=$(grep -m1 "tvg-id=\"$id\"" /var/www/lists/pulse/APE_LISTA_1794100720046.m3u8 2>/dev/null | \
         grep -oE 'https?://[^/]+' | head -1)
  echo "  $id -> ${prov:-NO_ENCONTRADO}"
done

echo ""
echo "=== 8. Cache de pulse (TTL y single-flight) ==="
grep -nE 'TTL|ttl|lock|flock|apcu|APCu|cache' /var/www/html/prisma/api/pulse.php 2>/dev/null | head -n 12 | cut -c1-150
