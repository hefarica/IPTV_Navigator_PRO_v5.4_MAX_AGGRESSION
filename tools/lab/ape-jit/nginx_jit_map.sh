#!/bin/bash
# Mapa de server blocks de nginx y donde cae /jit/, para explicar el 404 intermitente.
nginx -T > /tmp/ngx.txt 2>/dev/null
echo "=== server blocks y locations relevantes (hasta L1300) ==="
awk 'NR<=1300 {
  if ($0 ~ /^[[:space:]]*server[[:space:]]*\{/) printf "%5d  [SERVER abre]  %s\n", NR, $0
  else if ($0 ~ /^[[:space:]]*listen[[:space:]]+[0-9]/) printf "%5d  %s\n", NR, $0
  else if ($0 ~ /^[[:space:]]*server_name/) printf "%5d  %s\n", NR, $0
  else if ($0 ~ /location.*jit/) printf "%5d  >>> %s\n", NR, $0
  else if ($0 ~ /include.*ape-jit/) printf "%5d  >>> %s\n", NR, $0
}' /tmp/ngx.txt

echo
echo "=== cuantos server blocks hay en total ==="
grep -c '^[[:space:]]*server[[:space:]]*{' /tmp/ngx.txt

echo
echo "=== el include de ape-jit: donde esta ==="
grep -n 'ape-jit' /tmp/ngx.txt

echo
echo "=== prueba: misma ruta, 6 veces seguidas ==="
for i in 1 2 3 4 5 6; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 12 "https://iptv-ape.duckdns.org/jit/image/state")
  printf "  intento %d -> %s\n" "$i" "$c"
  sleep 1
done

echo
echo "=== y la misma ruta sin /image (control) ==="
for i in 1 2 3; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 12 "https://iptv-ape.duckdns.org/jit/health")
  printf "  health %d -> %s\n" "$i" "$c"
  sleep 1
done
