#!/bin/bash
# FIX SOP VIOLATIONS found in E2E Audit
# P1: proxy_read_timeout 10s → 30s in .m3u8 blocks
# P2: proxy_buffer_size 64k → 128k in .m3u8 blocks
# P3: Add http_407 to proxy_cache_use_stale in line.tivi and x1megaott
# P4: Fix 127.0.0.1/8 → 127.0.0.0/8

FILE="/etc/nginx/conf.d/iptv-intercept.conf"

# P1: Fix proxy_read_timeout in .m3u8 blocks (lines 75, 182, 295)
# Only change 10s to 30s, leave 60s untouched
sed -i '/\.m3u8/,/}/{
    s/proxy_read_timeout 10s;/proxy_read_timeout 30s;/
}' "$FILE"

# P2: Fix proxy_buffer_size 64k → 128k in .m3u8 blocks
sed -i '/\.m3u8/,/}/{
    s/proxy_buffer_size 64k;/proxy_buffer_size 128k;/
}' "$FILE"

# P3: Add http_407 to stale in x1megaott and line.tivi .m3u8 blocks
# Line 72: x1megaott
sed -i 's/proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;/proxy_cache_use_stale error timeout updating http_403 http_407 http_500 http_502 http_503 http_504;/g' "$FILE"

# Line 289: tivigo (already has http_403, add http_407)
sed -i 's/proxy_cache_use_stale error timeout updating http_403 http_500 http_502 http_503 http_504;/proxy_cache_use_stale error timeout updating http_403 http_407 http_500 http_502 http_503 http_504;/g' "$FILE"

# P4: Fix 127.0.0.1/8 → 127.0.0.0/8
sed -i 's/allow 127.0.0.1\/8;/allow 127.0.0.0\/8;/g' "$FILE"

echo "=== VERIFY P1: proxy_read_timeout ==="
grep -n 'proxy_read_timeout' "$FILE"

echo "=== VERIFY P2: proxy_buffer_size in m3u8 ==="
grep -n 'proxy_buffer_size' "$FILE"

echo "=== VERIFY P3: stale rules ==="
grep -n 'proxy_cache_use_stale' "$FILE"

echo "=== VERIFY P4: allow ==="
grep -n 'allow 127' "$FILE"

echo "=== NGINX TEST ==="
nginx -t 2>&1 | tail -2
systemctl reload nginx
echo "=== FIX DEPLOYED ==="
