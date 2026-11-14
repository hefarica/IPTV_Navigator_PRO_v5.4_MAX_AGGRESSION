#!/usr/bin/env bash
# Por que conviva-event.php y ape-feedforward-stream.php dan 404 si existen.
set -uo pipefail
API=/var/www/html/prisma/api

for f in conviva-event.php ape-feedforward-stream.php; do
  p="$API/$f"
  echo "=================================================="
  echo " $f  ($(stat -c%s "$p") B)"
  echo "=================================================="

  echo "  --- primeras lineas de codigo PHP ---"
  grep -nE 'http_response_code|header\(|REQUEST_METHOD|exit|die|404' "$p" 2>/dev/null | head -n 12 | cut -c1-150

  echo ""
  echo "  --- sintaxis ---"
  php -l "$p" 2>&1 | head -n 3

  echo ""
  echo "  --- respuesta por localhost ---"
  for m in GET POST; do
    code=$(curl -s -m 6 -o /dev/null -w '%{http_code}' -X "$m" "http://127.0.0.1/prisma/api/$f" 2>/dev/null)
    echo "    $m localhost -> $code"
  done

  echo ""
  echo "  --- respuesta por HTTPS publico ---"
  for m in GET POST; do
    code=$(curl -sk -m 8 -o /dev/null -w '%{http_code}' -X "$m" "https://iptv-ape.duckdns.org/prisma/api/$f" 2>/dev/null)
    echo "    $m publico -> $code"
  done

  echo ""
  echo "  --- hay un bloque nginx que lo intercepte? ---"
  grep -rn "$f" /etc/nginx/ 2>/dev/null | head -n 3 | cut -c1-150
  echo ""
done

echo "=================================================="
echo " Quien pide esos endpoints: UA de los 404"
echo "=================================================="
awk '$9==404 && ($7 ~ /conviva-event/ || $7 ~ /ape-feedforward/)' /var/log/nginx/playlist_access.log | \
  awk '{for(i=12;i<=NF;i++) printf "%s ", $i; print ""}' | sort | uniq -c | sort -rn | head -n 6

echo ""
echo "=================================================="
echo " Ventana: cuando empezaron esos 404"
echo "=================================================="
awk '$9==404 && $7 ~ /conviva-event/ {print substr($4,2,17)}' /var/log/nginx/playlist_access.log | tail -n 5
echo "  primer 404:"
awk '$9==404 && $7 ~ /conviva-event/ {print substr($4,2,17)}' /var/log/nginx/playlist_access.log | head -n 2
