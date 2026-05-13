#!/bin/bash
set -e
echo "═══════════════════════════════════════════════════════════"
echo " EMERGENCY ROLLBACK — Restoring VPS to pre-deploy baseline"
echo "═══════════════════════════════════════════════════════════"

BACKUP="/root/backups/prisma-v2-pre-20260428_124216"

echo ""
echo "▶ Step 1: Verify backup exists"
ls -la ${BACKUP}/ | head -5

echo ""
echo "▶ Step 2: Restore sites-enabled/default (removes awk-injected includes)"
if [ -f "${BACKUP}/default.bak" ]; then
    cp "${BACKUP}/default.bak" /etc/nginx/sites-enabled/default
    echo "  ✅ default restored from backup"
else
    sed -i '/include.*prisma-public-api-locations/d' /etc/nginx/sites-enabled/default
    echo "  ⚠️ Removed injected includes via sed"
fi

echo ""
echo "▶ Step 3: Remove ALL PRISMA v2.0 files deployed"
for f in \
    /etc/nginx/snippets/prisma-public-api-locations.conf \
    /etc/nginx/conf.d/prisma-public-api-zone.conf \
    /etc/nginx/conf.d/prisma-floor-lock.conf \
    /etc/nginx/lua/sentinel_telemetry_api.lua \
    /etc/nginx/lua/sentinel_auth_guard.lua \
    /etc/nginx/lua/sentinel_ua_apply.lua \
    /etc/nginx/lua/floor_lock_filter.lua \
    /etc/nginx/lua/lab_config.lua
do
    if [ -f "$f" ]; then
        rm -f "$f"
        echo "  🗑️ Removed: $f"
    else
        echo "  ✓ Already absent: $f"
    fi
done

echo ""
echo "▶ Step 4: Restore upstream_gate.lua + upstream_response.lua (if patched)"
if [ -f "${BACKUP}/upstream_gate.lua.bak" ]; then
    cp "${BACKUP}/upstream_gate.lua.bak" /etc/nginx/lua/upstream_gate.lua
    echo "  ✅ upstream_gate.lua restored"
else
    echo "  ✓ Not patched (Stage 4B never ran)"
fi
if [ -f "${BACKUP}/upstream_response.lua.bak" ]; then
    cp "${BACKUP}/upstream_response.lua.bak" /etc/nginx/lua/upstream_response.lua
    echo "  ✅ upstream_response.lua restored"
else
    echo "  ✓ Not patched"
fi

echo ""
echo "▶ Step 5: Restore shield-location.conf (if patched)"
if [ -f "${BACKUP}/shield-location.conf.bak" ]; then
    cp "${BACKUP}/shield-location.conf.bak" /etc/nginx/snippets/shield-location.conf
    echo "  ✅ shield-location.conf restored"
else
    echo "  ✓ Not patched"
fi

echo ""
echo "▶ Step 6: Validate nginx -t"
nginx -t 2>&1 | tail -3

echo ""
echo "▶ Step 7: Verify SHA matches pre-deploy"
sha256sum /etc/nginx/snippets/shield-location.conf /etc/nginx/lua/upstream_gate.lua /etc/nginx/lua/upstream_response.lua 2>/dev/null

echo ""
echo "▶ Step 8: Leave prisma_telemetry_full.lua (pre-existing, identical SHA)"
ls -la /etc/nginx/lua/prisma_telemetry_full.lua 2>/dev/null && echo "  ✓ Preserved (pre-existing)"

echo ""
echo "▶ Step 9: Clean staging dirs"
rm -rf /tmp/prisma-v2-* 2>/dev/null
echo "  ✅ Staging cleaned"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " ROLLBACK COMPLETE"
echo "═══════════════════════════════════════════════════════════"
