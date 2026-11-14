#!/usr/bin/env bash
# Desglose REAL de 404 (filtrando por $9==404, no por ruta a secas).
set -uo pipefail
L=/var/log/nginx/playlist_access.log

echo "=== A. 404 REALES por ruta ==="
awk '$9==404 {print $7}' "$L" | sed 's|?.*||' | sort | uniq -c | sort -rn | head -n 15

echo ""
echo "=== B. 404 REALES por UA ==="
awk '$9==404 {for(i=12;i<=NF;i++) printf "%s ", $i; print ""}' "$L" | sort | uniq -c | sort -rn | head -n 8

echo ""
echo "=== C. Contadores por codigo (todo el log) ==="
awk '{print $9}' "$L" | grep -E '^[0-9]{3}$' | sort | uniq -c | sort -rn | head -n 10

echo ""
echo "=== D. 502 REALES por ruta ==="
awk '$9==502 {print $7}' "$L" | sed 's|.*/pulse/||; s|\.m3u8.*||' | sort | uniq -c | sort -rn | head -n 10

echo ""
echo "=== E. Los 502: que dice el error.log de nginx ==="
if [ -s /var/log/nginx/error.log ]; then
  grep -E 'error|upstream' /var/log/nginx/error.log 2>/dev/null | tail -n 10 | cut -c1-200
else
  echo "  error.log vacio -> el 502 lo genera PHP, no nginx"
fi

echo ""
echo "=== F. pulse.php: como produce el 502 ==="
grep -nE '502|BAD_GATEWAY|http_response_code\(5' /var/www/html/prisma/api/pulse.php 2>/dev/null | head -n 10 | cut -c1-160

echo ""
echo "=== G. Ventana temporal del log ==="
echo -n "  primera linea: "; head -n 1 "$L" | awk '{print $4}'
echo -n "  ultima linea:  "; tail -n 1 "$L" | awk '{print $4}'
echo -n "  total lineas:  "; wc -l < "$L"
