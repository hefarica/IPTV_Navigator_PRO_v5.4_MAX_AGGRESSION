set -u
URL=$(zcat /var/www/lists/APE_LISTA_4K.m3u8.gz | grep -m1 -oE https?://iptv-ape[^[:space:]]+/cdn/[^[:space:]]+ | head -1)
if [ -n "$URL" ]; then REST=${URL#*://iptv-ape.duckdns.org/cdn/}; echo "pub_manifest=$(curl -s -o /dev/null -w %{http_code} --max-time 12 https://iptv-ape.duckdns.org/cdn/$REST)"; TS=${REST%.m3u8}.ts; echo "pub_ts=$(curl -s -o /dev/null -w %{http_code} --max-time 12 https://iptv-ape.duckdns.org/cdn/$TS)"; M4=${REST%.m3u8}.m4s; echo "pub_m4s=$(curl -s -o /dev/null -w %{http_code} --max-time 12 https://iptv-ape.duckdns.org/cdn/$M4)"; MP4=${REST%.m3u8}.mp4; echo "pub_mp4=$(curl -s -o /dev/null -w %{http_code} --max-time 12 https://iptv-ape.duckdns.org/cdn/$MP4)"; else echo NO_URL; fi
echo "=== nginx -T hash"
nginx -T 2>/dev/null | sha256sum
