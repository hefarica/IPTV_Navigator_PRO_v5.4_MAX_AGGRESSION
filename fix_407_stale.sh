#!/bin/bash
# Add http_407 to proxy_cache_use_stale for all .m3u8 locations
# This prevents 407 (connection limit) from breaking playback during zapping

FILE="/etc/nginx/conf.d/iptv-intercept.conf"

# Line 72: x1megaott .m3u8
sed -i '72s/http_504;/http_504 http_407;/' "$FILE"

# Line 180: line.tivi .m3u8  
sed -i '180s/http_504;/http_504 http_407;/' "$FILE"

# Line 289: tivigo .m3u8 (already has http_403, add http_407)
sed -i '289s/http_504;/http_504 http_407;/' "$FILE"

echo "=== VERIFY ==="
grep -n 'proxy_cache_use_stale' "$FILE"
nginx -t 2>&1 | tail -2
systemctl reload nginx
echo "=== DONE ==="
