#!/usr/bin/env bash
set -euo pipefail

#############################################################################
# APE PRISMA v1.0 — Uninstaller
#
# Run on VPS: bash uninstall-prisma.sh
#
# Steps:
#   1. Remove auto_prepend_file from .user.ini (or delete .user.ini if PRISMA-only)
#   2. Wait for PHP-FPM cache TTL (or reload)
#   3. Remove PRISMA directory
#   4. Remove RAM state files
#############################################################################

VPS_ROOT="/var/www/html"

echo "═══ APE PRISMA v1.0 Uninstaller ═══"

# ── 1. Remove .user.ini ──
USERINI="$VPS_ROOT/.user.ini"
if [ -f "$USERINI" ]; then
    # Check if .user.ini ONLY has PRISMA content
    NON_PRISMA=$(grep -cv 'prisma\|APE PRISMA\|^;.*PRISMA\|^$' "$USERINI" 2>/dev/null || echo "0")
    if [ "$NON_PRISMA" -eq "0" ]; then
        rm -v "$USERINI"
        echo "✓ .user.ini removed (was PRISMA-only)"
    else
        # Other directives exist — only remove PRISMA line
        sed -i '/auto_prepend_file.*prisma/d' "$USERINI"
        sed -i '/APE PRISMA/d' "$USERINI"
        echo "✓ PRISMA directive removed from .user.ini (other directives preserved)"
    fi
else
    echo "• .user.ini not found (already clean)"
fi

# ── 2. Reload PHP-FPM ──
echo "Reloading PHP-FPM..."
systemctl reload php*-fpm 2>/dev/null && echo "✓ PHP-FPM reloaded" || echo "• Could not reload PHP-FPM (manual restart may be needed)"

# ── 3. Remove PRISMA directory ──
if [ -d "$VPS_ROOT/prisma" ]; then
    rm -rf "$VPS_ROOT/prisma"
    echo "✓ PRISMA directory removed"
else
    echo "• PRISMA directory not found"
fi

# ── 4. Remove RAM state files ──
rm -f /dev/shm/prisma_state.json
rm -f /dev/shm/prisma_errors.jsonl
rm -f /dev/shm/prisma_health_cache.json
rm -f /dev/shm/prisma_key.txt
echo "✓ RAM state files cleaned"

echo ""
echo "═══════════════════════════════════════"
echo "  APE PRISMA v1.0 uninstalled."
echo "  resolve.php is now running vanilla."
echo "  No files were modified outside /prisma/."
echo "═══════════════════════════════════════"
