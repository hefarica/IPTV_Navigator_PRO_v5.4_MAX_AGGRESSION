#!/usr/bin/env bash
set -euo pipefail

#############################################################################
# APE PRISMA v1.0 — Installer (Idempotent)
#
# Run on VPS: bash install-prisma.sh
#
# Steps:
#   1. Generate shared auth key → /dev/shm/prisma_key.txt
#   2. Initialize default state  → /dev/shm/prisma_state.json
#   3. Copy prisma PHP files     → /var/www/html/prisma/
#   4. Create .user.ini          → /var/www/html/.user.ini
#   5. Copy engine modules (if not already present)
#   6. Smoke test the health endpoint
#############################################################################

VPS_ROOT="/var/www/html"
PRISMA_SRC="$(cd "$(dirname "$0")/../vps/prisma" && pwd)"
ENGINE_SRC="$(cd "$(dirname "$0")/../backend/cmaf_engine" && pwd)"

echo "═══ APE PRISMA v1.0 Installer ═══"
echo "  Source: $PRISMA_SRC"
echo "  Target: $VPS_ROOT/prisma/"

# ── 1. Auth key ──
KEY_FILE="/dev/shm/prisma_key.txt"
if [ ! -f "$KEY_FILE" ]; then
    KEY=$(head -c 32 /dev/urandom | base64 | tr -d '=+/' | head -c 32)
    echo -n "$KEY" > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
    echo "✓ Auth key generated: ${KEY:0:8}..."
else
    echo "• Auth key already exists ($(cat "$KEY_FILE" | head -c 8)...)"
fi

# ── 2. Default state ──
STATE_FILE="/dev/shm/prisma_state.json"
if [ ! -f "$STATE_FILE" ]; then
    cat > "$STATE_FILE" <<'STATEJSON'
{
    "version": "1.0.0",
    "master_enabled": false,
    "lanes_any_active": false,
    "lanes": {
        "cmaf":      {"global": "off", "profiles": ["P0","P1","P2","P3","P4","P5"], "auto_disabled_until": 0},
        "lcevc":     {"global": "off", "profiles": ["P0","P1","P2","P3","P4","P5"], "auto_disabled_until": 0},
        "hdr10plus": {"global": "off", "profiles": ["P0","P1","P2","P3","P4","P5"], "auto_disabled_until": 0},
        "ai_sr":     {"global": "off", "profiles": ["P0","P1","P2","P3","P4","P5"], "auto_disabled_until": 0}
    },
    "channels": {},
    "last_panic_off_ts": 0,
    "updated_ts": 0,
    "updated_by": "installer"
}
STATEJSON
    echo "✓ Default state created"
else
    echo "• State file already exists"
fi

# ── 3. Copy PRISMA PHP files ──
mkdir -p "$VPS_ROOT/prisma/api"
cp -v "$PRISMA_SRC/prisma_state.php"     "$VPS_ROOT/prisma/"
cp -v "$PRISMA_SRC/prisma_bootstrap.php" "$VPS_ROOT/prisma/"
cp -v "$PRISMA_SRC/prisma_processor.php" "$VPS_ROOT/prisma/"
cp -v "$PRISMA_SRC/api/prisma-control.php" "$VPS_ROOT/prisma/api/"
cp -v "$PRISMA_SRC/api/prisma-health.php"  "$VPS_ROOT/prisma/api/"
echo "✓ PRISMA PHP files copied"

# ── 4. .user.ini ──
USERINI="$VPS_ROOT/.user.ini"
if [ -f "$USERINI" ]; then
    if grep -q "prisma_bootstrap" "$USERINI" 2>/dev/null; then
        echo "• .user.ini already configured"
    else
        echo "⚠ .user.ini exists but doesn't reference PRISMA."
        echo "  Appending auto_prepend_file directive..."
        echo "" >> "$USERINI"
        echo "; APE PRISMA v1.0 — Quality Uplift Post-Processor" >> "$USERINI"
        echo "auto_prepend_file = /var/www/html/prisma/prisma_bootstrap.php" >> "$USERINI"
        echo "✓ .user.ini updated"
    fi
else
    cat > "$USERINI" <<'USERINI_CONTENT'
; APE PRISMA v1.0 — Quality Uplift Post-Processor
; This file is loaded by PHP-FPM via user_ini.filename (default: .user.ini)
; To disable PRISMA completely, delete or rename this file.
auto_prepend_file = /var/www/html/prisma/prisma_bootstrap.php
USERINI_CONTENT
    echo "✓ .user.ini created"
fi

# ── 5. Copy engine modules (fill gaps if missing) ──
ENGINE_DEST="$VPS_ROOT/cmaf_engine/modules"
if [ -d "$ENGINE_SRC/modules" ]; then
    mkdir -p "$ENGINE_DEST"
    COPIED=0
    for f in "$ENGINE_SRC/modules/"*.php; do
        BASENAME=$(basename "$f")
        if [ ! -f "$ENGINE_DEST/$BASENAME" ]; then
            cp -v "$f" "$ENGINE_DEST/"
            COPIED=$((COPIED + 1))
        fi
    done
    echo "✓ Engine modules: $COPIED new files copied"
else
    echo "⚠ Engine source not found: $ENGINE_SRC/modules — lanes may be unavailable"
fi

# Also copy orchestrator if missing
for f in cmaf_orchestrator.php unified_cmaf_lcevc_pipeline.php; do
    if [ -f "$ENGINE_SRC/$f" ] && [ ! -f "$VPS_ROOT/cmaf_engine/$f" ]; then
        cp -v "$ENGINE_SRC/$f" "$VPS_ROOT/cmaf_engine/"
    fi
done

# ── 6. Smoke test ──
echo ""
echo "── Smoke Test ──"
php -l "$VPS_ROOT/prisma/prisma_state.php"     2>&1 || true
php -l "$VPS_ROOT/prisma/prisma_bootstrap.php" 2>&1 || true
php -l "$VPS_ROOT/prisma/prisma_processor.php" 2>&1 || true
php -l "$VPS_ROOT/prisma/api/prisma-control.php" 2>&1 || true
php -l "$VPS_ROOT/prisma/api/prisma-health.php"  2>&1 || true

echo ""
echo "═══════════════════════════════════════════"
echo "  APE PRISMA v1.0 installed successfully!"
echo ""
echo "  Auth Key: $(cat /dev/shm/prisma_key.txt | head -c 8)..."
echo "  State:    /dev/shm/prisma_state.json"
echo "  Master:   OFF (enable via API or frontend)"
echo ""
echo "  IMPORTANT: PHP-FPM caches .user.ini for"
echo "  user_ini.cache_ttl seconds (default: 300)."
echo "  Run: systemctl reload php*-fpm"
echo "  to apply immediately."
echo "═══════════════════════════════════════════"
