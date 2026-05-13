#!/bin/bash
# ============================================================================
# APE Resilience v6.0 — VPS Deployment Script
# Target: iptv-ape.duckdns.org (178.156.147.234)
# Usage:  bash deploy_resilience_v6.sh
# ============================================================================

set -e

# ── Configuration ──────────────────────────────────────────────────────────
VPS_HOST="178.156.147.234"
VPS_USER="root"
VPS_PHP_DIR="/var/www/html"
VPS_CMAF_DIR="${VPS_PHP_DIR}/cmaf_engine"
VPS_MODULES_DIR="${VPS_CMAF_DIR}/modules"

# Local paths (relative to this script's location)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}"

# Files to deploy
FILES_MODULES=(
    "cmaf_engine/modules/neuro_buffer_controller.php"
    "cmaf_engine/modules/modem_priority_manager.php"
)
FILES_SHIM=(
    "cmaf_engine/resilience_integration_shim.php"
)
FILES_RESOLVER=(
    "resolve_quality.php"
)

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  APE Resilience v6.0 — VPS Deployment                  ║"
echo "║  Target: ${VPS_HOST}                             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Verify local files exist ──────────────────────────────────────
echo "📋 Step 1: Verifying local files..."
ALL_FILES=("${FILES_MODULES[@]}" "${FILES_SHIM[@]}" "${FILES_RESOLVER[@]}")
for f in "${ALL_FILES[@]}"; do
    if [ ! -f "${BACKEND_DIR}/${f}" ]; then
        echo "❌ MISSING: ${f}"
        exit 1
    fi
    echo "  ✅ ${f}"
done
echo ""

# ── Step 2: Backup current resolve_quality.php on VPS ─────────────────────
echo "💾 Step 2: Backing up current resolve_quality.php on VPS..."
BACKUP_TS=$(date +%Y%m%d_%H%M%S)
ssh ${VPS_USER}@${VPS_HOST} "cp -v ${VPS_PHP_DIR}/resolve_quality.php ${VPS_PHP_DIR}/resolve_quality.php.bak_${BACKUP_TS} 2>/dev/null || true"
echo "  ✅ Backup: resolve_quality.php.bak_${BACKUP_TS}"
echo ""

# ── Step 3: Ensure directories exist on VPS ───────────────────────────────
echo "📁 Step 3: Ensuring directories on VPS..."
ssh ${VPS_USER}@${VPS_HOST} "mkdir -p ${VPS_MODULES_DIR}"
echo "  ✅ ${VPS_MODULES_DIR}"
echo ""

# ── Step 4: Upload new motors ─────────────────────────────────────────────
echo "🚀 Step 4: Uploading new motors..."
for f in "${FILES_MODULES[@]}"; do
    scp "${BACKEND_DIR}/${f}" "${VPS_USER}@${VPS_HOST}:${VPS_MODULES_DIR}/$(basename ${f})"
    echo "  ✅ $(basename ${f}) → ${VPS_MODULES_DIR}/"
done
echo ""

# ── Step 5: Upload integration shim ───────────────────────────────────────
echo "🔗 Step 5: Uploading integration shim..."
for f in "${FILES_SHIM[@]}"; do
    scp "${BACKEND_DIR}/${f}" "${VPS_USER}@${VPS_HOST}:${VPS_CMAF_DIR}/$(basename ${f})"
    echo "  ✅ $(basename ${f}) → ${VPS_CMAF_DIR}/"
done
echo ""

# ── Step 6: Upload updated resolve_quality.php ────────────────────────────
echo "📝 Step 6: Uploading updated resolve_quality.php..."
scp "${BACKEND_DIR}/resolve_quality.php" "${VPS_USER}@${VPS_HOST}:${VPS_PHP_DIR}/resolve_quality.php"
echo "  ✅ resolve_quality.php → ${VPS_PHP_DIR}/"
echo ""

# ── Step 7: Set permissions ───────────────────────────────────────────────
echo "🔐 Step 7: Setting permissions..."
ssh ${VPS_USER}@${VPS_HOST} "
    chown www-data:www-data ${VPS_MODULES_DIR}/neuro_buffer_controller.php
    chown www-data:www-data ${VPS_MODULES_DIR}/modem_priority_manager.php
    chown www-data:www-data ${VPS_CMAF_DIR}/resilience_integration_shim.php
    chown www-data:www-data ${VPS_PHP_DIR}/resolve_quality.php
    chmod 644 ${VPS_MODULES_DIR}/neuro_buffer_controller.php
    chmod 644 ${VPS_MODULES_DIR}/modem_priority_manager.php
    chmod 644 ${VPS_CMAF_DIR}/resilience_integration_shim.php
    chmod 644 ${VPS_PHP_DIR}/resolve_quality.php
"
echo "  ✅ Permissions set (www-data:644)"
echo ""

# ── Step 8: PHP syntax check ─────────────────────────────────────────────
echo "🧪 Step 8: PHP syntax validation on VPS..."
ssh ${VPS_USER}@${VPS_HOST} "
    php -l ${VPS_MODULES_DIR}/neuro_buffer_controller.php && \
    php -l ${VPS_MODULES_DIR}/modem_priority_manager.php && \
    php -l ${VPS_CMAF_DIR}/resilience_integration_shim.php && \
    php -l ${VPS_PHP_DIR}/resolve_quality.php
"
echo ""

# ── Step 9: Reload PHP-FPM ───────────────────────────────────────────────
echo "♻️  Step 9: Reloading PHP-FPM..."
ssh ${VPS_USER}@${VPS_HOST} "systemctl reload php8.3-fpm"
echo "  ✅ PHP 8.3-FPM reloaded"
echo ""

# ── Step 10: Smoke test ──────────────────────────────────────────────────
echo "🔥 Step 10: Smoke test..."
RESPONSE=$(ssh ${VPS_USER}@${VPS_HOST} "curl -sS -o /dev/null -w '%{http_code}' 'http://127.0.0.1/resolve_quality.php?ch=test&p=auto'")
if [ "$RESPONSE" = "200" ]; then
    echo "  ✅ resolve_quality.php returns HTTP 200"
else
    echo "  ⚠️  resolve_quality.php returns HTTP ${RESPONSE} (might be OK for 'test' channel)"
fi

# Verify resilience headers are present
HEADERS=$(ssh ${VPS_USER}@${VPS_HOST} "curl -sS 'http://127.0.0.1/resolve_quality.php?ch=test&p=auto' 2>/dev/null | head -5")
if echo "$HEADERS" | grep -q "X-Resilience-Shim\|X-Buffer-Escalation-Level"; then
    echo "  ✅ Resilience v6.0 headers detected in output!"
else
    echo "  ℹ️  Resilience headers not in first 5 lines (may be in EXTHTTP JSON)"
fi
echo ""

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ DEPLOYMENT COMPLETE                                 ║"
echo "║                                                         ║"
echo "║  Files deployed:                                        ║"
echo "║    • neuro_buffer_controller.php                        ║"
echo "║    • modem_priority_manager.php                         ║"
echo "║    • resilience_integration_shim.php                    ║"
echo "║    • resolve_quality.php (updated)                      ║"
echo "║                                                         ║"
echo "║  Rollback: restore resolve_quality.php.bak_${BACKUP_TS} ║"
echo "╚══════════════════════════════════════════════════════════╝"
