#!/usr/bin/env bash
# Verifica endpoints PHP que los clientes llaman y dan 404.
set -uo pipefail
API=/var/www/html/prisma/api
L=/var/log/nginx/playlist_access.log

echo "=== 1. PHP desplegados en /prisma/api ==="
ls -1 "$API"/*.php 2>/dev/null | xargs -r -n1 basename | tr '\n' ' '
echo ""

echo ""
echo "=== 2. Los dos que dan 404 ==="
for f in conviva-event.php ape-feedforward-stream.php; do
  p="$API/$f"
  if [ -f "$p" ]; then
    echo "  $f: EXISTE ($(stat -c%s "$p") B)"
  else
    echo "  $f: NO EXISTE"
  fi
done

echo ""
echo "=== 3. ¿Existen en algun sitio del disco? ==="
find / -xdev \( -name 'conviva-event.php' -o -name 'ape-feedforward-stream.php' \) 2>/dev/null | head -n 6
echo "  (vacio = no estan en ninguna parte del VPS)"

echo ""
echo "=== 4. Quien los llama en el frontend desplegado ==="
grep -rl 'conviva-event' /var/www/html --include='*.js' --include='*.html' 2>/dev/null | head -n 5
grep -rl 'ape-feedforward' /var/www/html --include='*.js' --include='*.html' 2>/dev/null | head -n 5
echo "  (vacio = el llamador no es del frontend, es un cliente externo)"

echo ""
echo "=== 5. /pulse/368594 — distribucion de estados ==="
grep '368594' "$L" | awk '{print $9}' | sort | uniq -c

echo ""
echo "=== 6. De esos, cuantos traen z=1 ==="
grep '368594' "$L" | grep -c 'z=1' || true

echo ""
echo "=== 7. Los 404 de /pulse/ llevan z=1? ==="
awk '$9==404 && $7 ~ /\/pulse\//' "$L" | grep -c 'z=1' || true
echo "  total 404 de /pulse/:"
awk '$9==404 && $7 ~ /\/pulse\//' "$L" | wc -l

echo ""
echo "=== 8. Comparativa: los 200 de /pulse/ llevan z=1? ==="
awk '$9==200 && $7 ~ /\/pulse\//' "$L" | grep -c 'z=1' || true
echo "  total 200 de /pulse/:"
awk '$9==200 && $7 ~ /\/pulse\//' "$L" | wc -l

echo ""
echo "=== 9. Los 502 de /pulse/ — que canal y que dice nginx ==="
awk '$9==502 && $7 ~ /\/pulse\// {print $7}' "$L" | sed 's|.*/pulse/||; s|\.m3u8.*||' | sort | uniq -c | sort -rn | head -n 8
echo ""
echo "  errores de upstream en error.log (ultimos 12):"
grep -E 'upstream|timed out|502' /var/log/nginx/error.log 2>/dev/null | tail -n 12 | cut -c1-190
