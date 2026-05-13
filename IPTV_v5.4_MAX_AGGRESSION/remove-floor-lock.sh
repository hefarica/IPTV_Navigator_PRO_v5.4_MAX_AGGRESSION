#!/bin/bash
set -e

echo "=== BACKUP ==="
tar czf /root/backups/pre_floor_lock_remove_$(date +%Y%m%d_%H%M%S).tar.gz \
    /etc/nginx/conf.d/iptv-intercept.conf \
    /etc/nginx/conf.d/zivovrix-intercept.conf \
    /etc/nginx/conf.d/rynivorn-intercept.conf \
    /etc/nginx/conf.d/w12s-intercept.conf \
    /etc/nginx/conf.d/autopista-trap.conf \
    /etc/nginx/snippets/shield-location.conf \
    /etc/nginx/conf.d/cmaf_mime.conf \
    /etc/nginx/snippets/audio-stream-fix.conf \
    /etc/nginx/snippets/shield-tivi-redirect.conf \
    2>/dev/null
echo "BACKUP_OK"

echo ""
echo "=== REMOVING floor_lock_filter.lua from ALL configs ==="
for f in \
    /etc/nginx/conf.d/iptv-intercept.conf \
    /etc/nginx/conf.d/zivovrix-intercept.conf \
    /etc/nginx/conf.d/rynivorn-intercept.conf \
    /etc/nginx/conf.d/w12s-intercept.conf \
    /etc/nginx/conf.d/autopista-trap.conf \
    /etc/nginx/snippets/shield-location.conf; do
    
    before=$(grep -c 'floor_lock_filter' "$f" 2>/dev/null || echo 0)
    sed -i '/floor_lock_filter/d' "$f"
    after=$(grep -c 'floor_lock_filter' "$f" 2>/dev/null || echo 0)
    echo "$f: $before -> $after references"
done

echo ""
echo "=== REMOVING dead files ==="
# cmaf_mime.conf causes 7 nginx -t warnings
mv /etc/nginx/conf.d/cmaf_mime.conf /etc/nginx/conf.d/cmaf_mime.conf.disabled 2>/dev/null && echo "cmaf_mime.conf -> DISABLED" || echo "cmaf_mime.conf not found"

echo ""
echo "=== VERIFY: no more floor_lock_filter references ==="
grep -rn 'floor_lock_filter' /etc/nginx/conf.d/*.conf /etc/nginx/snippets/*.conf 2>/dev/null || echo "ZERO references remaining - CLEAN"

echo ""
echo "=== NGINX TEST ==="
nginx -t 2>&1

echo ""
echo "=== RELOAD ==="
systemctl reload nginx && echo "NGINX_RELOADED_OK" || echo "RELOAD_FAILED"

echo ""
echo "=== POST-CHECK: warnings count ==="
nginx -t 2>&1 | grep -c 'warn' || echo "0 warnings"

echo ""
echo "=== VERIFY STREAMING STILL WORKS ==="
sleep 3
tail -5 /var/log/nginx/iptv.log
