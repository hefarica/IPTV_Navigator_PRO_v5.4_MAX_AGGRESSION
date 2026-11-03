set -u
echo "=== G8 STAT (formato citado)"
stat -c "%n|%s|%a|%U:%G|%y" /var/www/lists/APE_LISTA_4K.m3u8.gz /var/www/lists/APE_LISTA_1793002539897_CDN.m3u8.gz
echo "=== G11 rto_min en TODAS las tablas"
echo "all_tables=$(ip route show table all | grep -c "rto_min lock 40ms")"
ip route show table all | grep "rto_min lock 40ms" | sed -E "s/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/<IP>/g" | head -5
echo "=== ROLLBACK BACKUP (arbol)"
echo "top=$(ls -1 /var/backups/ape-deploy/20261028T093843Z/ | wc -l) files=$(find /var/backups/ape-deploy/20261028T093843Z/ -type f | wc -l)"
find /var/backups/ape-deploy/20261028T093843Z/ -type f | sed "s#/var/backups/ape-deploy/20261028T093843Z/##" | sort | head -15
echo "sha256sums_lines=$(wc -l < /var/backups/ape-deploy/20261028T093843Z/SHA256SUMS 2>/dev/null || echo NA)"
echo "=== G10 TTFB (raw)"
URL=$(zcat /var/www/lists/APE_LISTA_4K.m3u8.gz | grep -m1 -oE https?://iptv-ape\.duckdns\.org/cdn/[^\"]+\.m3u8 || true)
if [ -n "$URL" ]; then REST=${URL#*://iptv-ape.duckdns.org/cdn/}; i=0; while [ $i -lt 5 ]; do OUT=$(curl -s -D - -o /dev/null -w "%{time_total}" --max-time 10 "http://127.0.0.1:8088/cdn/$REST"); TOT=$(printf %s "$OUT" | tail -c 8); UP=$(printf %s "$OUT" | grep -i "X-APE-Upstream-Ms" | tr -dc "0-9" | head -c 8); echo "ttfb_raw total_s=$TOT upstream_ms=${UP:-na}"; i=$((i+1)); done; fi
