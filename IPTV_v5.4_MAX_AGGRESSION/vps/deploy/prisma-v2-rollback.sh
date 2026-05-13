#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# APE PRISMA v2.0 — Rollback Script
# ═══════════════════════════════════════════════════════════════════════
# Reverts all PRISMA v2.0 changes from VPS.
# Usage: bash prisma-v2-rollback.sh [TIMESTAMP]
#   TIMESTAMP = the deploy timestamp (e.g., 20260428_171500)
#   If not provided, uses the most recent backup.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

VPS="root@178.156.147.234"
TIMESTAMP="${1:-}"

echo "═══════════════════════════════════════════════════════════"
echo " APE PRISMA v2.0 — ROLLBACK"
echo "═══════════════════════════════════════════════════════════"

# Find backup dir
if [[ -z "$TIMESTAMP" ]]; then
    echo "▶ No timestamp provided, finding most recent backup..."
    BACKUP_DIR=$(ssh ${VPS} "ls -td /root/backups/prisma-v2-pre-* 2>/dev/null | head -1")
    if [[ -z "$BACKUP_DIR" ]]; then
        echo "❌ No PRISMA v2.0 backups found on VPS"
        exit 1
    fi
else
    BACKUP_DIR="/root/backups/prisma-v2-pre-${TIMESTAMP}"
fi

echo "▶ Using backup: ${BACKUP_DIR}"

# ─── STEP 1: RESTORE PASSTHROUGH FILES ──────────────────────────────
echo ""
echo "▶ Step 1: Restoring PASSTHROUGH files..."

ssh ${VPS} "
if [[ ! -d '${BACKUP_DIR}' ]]; then
    echo '❌ Backup directory not found: ${BACKUP_DIR}'
    exit 1
fi

# Restore upstream_gate.lua (original PASSTHROUGH without PRISMA merge)
if [[ -f '${BACKUP_DIR}/upstream_gate.lua.bak' ]]; then
    cp '${BACKUP_DIR}/upstream_gate.lua.bak' /etc/nginx/lua/upstream_gate.lua
    echo '  ✅ upstream_gate.lua restored'
fi

# Restore upstream_response.lua (original PASSTHROUGH without PRISMA merge)
if [[ -f '${BACKUP_DIR}/upstream_response.lua.bak' ]]; then
    cp '${BACKUP_DIR}/upstream_response.lua.bak' /etc/nginx/lua/upstream_response.lua
    echo '  ✅ upstream_response.lua restored'
fi

# Restore shield-location.conf (removes body_filter, cache bypass, sentinel_ua)
if [[ -f '${BACKUP_DIR}/shield-location.conf.bak' ]]; then
    cp '${BACKUP_DIR}/shield-location.conf.bak' /etc/nginx/snippets/shield-location.conf
    echo '  ✅ shield-location.conf restored'
fi
"

# ─── STEP 2: REMOVE NEW FILES ──────────────────────────────────────
echo ""
echo "▶ Step 2: Removing PRISMA v2.0 files..."

ssh ${VPS} "
rm -f /etc/nginx/lua/floor_lock_filter.lua
rm -f /etc/nginx/lua/sentinel_auth_guard.lua
rm -f /etc/nginx/lua/sentinel_telemetry_api.lua
rm -f /etc/nginx/lua/sentinel_ua_apply.lua
rm -f /etc/nginx/lua/prisma_telemetry_full.lua
rm -f /etc/nginx/conf.d/prisma-floor-lock.conf
rm -f /etc/nginx/conf.d/prisma-public-api.conf            # legacy hybrid (pre-BUG#8 fix)
rm -f /etc/nginx/conf.d/prisma-public-api-zone.conf       # zone (post-BUG#8 fix)
rm -f /etc/nginx/snippets/prisma-public-api-locations.conf # locations (post-BUG#8 fix)

# Restore public server config if include was auto-injected during deploy
for candidate in /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/iptv-ape /etc/nginx/sites-enabled/*.conf; do
    base=\$(basename \"\$candidate\")
    if [[ -f \"${BACKUP_DIR}/\${base}.bak\" ]]; then
        cp \"${BACKUP_DIR}/\${base}.bak\" \"\$candidate\"
        echo \"  ✅ \$candidate restored from backup\"
        break
    fi
done

echo '  ✅ PRISMA v2.0 files removed'
"

# ─── STEP 3: NGINX VALIDATE + RELOAD ────────────────────────────────
echo ""
echo "▶ Step 3: Validating + reloading..."

ssh ${VPS} "
nginx -t && echo 'NGINX_TEST_OK' || (echo '❌ NGINX_TEST_FAIL after rollback'; exit 1)
systemctl reload nginx
echo '  ✅ NGINX reloaded'
"

# ─── STEP 4: VERIFY SHA MATCHES PRE-DEPLOY ──────────────────────────
echo ""
echo "▶ Step 4: Verifying SHA matches pre-deploy..."

ssh ${VPS} "
sha256sum \
    /etc/nginx/snippets/shield-location.conf \
    /etc/nginx/lua/upstream_gate.lua \
    /etc/nginx/lua/upstream_response.lua \
    /etc/nginx/conf.d/*.conf \
    2>/dev/null > /tmp/rollback-verify.sha256

echo '=== SHA COMPARISON ==='
diff '${BACKUP_DIR}/pre-deploy.sha256' /tmp/rollback-verify.sha256 && \
    echo '  ✅ SHA MATCH — rollback complete' || \
    echo '  ⚠️  SHA MISMATCH — manual verification needed'
"

# ─── STEP 5: HEALTH CHECK ───────────────────────────────────────────
echo ""
echo "▶ Step 5: Post-rollback health check..."

ssh ${VPS} "
sleep 5
echo '=== NGINX ===' && nginx -t 2>&1 | tail -2
echo '=== LUA_BLOCKS ===' && grep -c 'ngx.exit' /etc/nginx/lua/*.lua 2>/dev/null || echo '0'
echo '=== NEW_503 ===' && grep ' 503 ' /var/log/nginx/shield_access.log | grep 'ut=-' | \
    awk -v cutoff=\$(date -u -d '-1 minute' +%Y-%m-%dT%H:%M) '{if (\$4 > cutoff) print}' | wc -l
"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " ✅ ROLLBACK COMPLETE"
echo " Backup preserved at: ${BACKUP_DIR}"
echo "═══════════════════════════════════════════════════════════"
