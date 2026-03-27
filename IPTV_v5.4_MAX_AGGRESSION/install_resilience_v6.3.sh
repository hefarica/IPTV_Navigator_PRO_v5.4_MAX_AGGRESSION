#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# APE Resilience Toolkit v6.3 — One-Click Installer
# Deploys the 5-motor resilience pipeline to any IPTV VPS
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="/var/www/html"
LOG_DIR="/var/log/iptv-ape"
BACKUP_DIR="/tmp/ape_backup_$(date +%Y%m%d_%H%M%S)"

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   APE Resilience Toolkit v6.3 — Installer${NC}"
echo -e "${CYAN}   Polymorphic Visual Orchestrator + Adaptive Buffer${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# ── 1. Pre-flight checks ──────────────────────────────────────────
echo -e "${YELLOW}[1/7] Pre-flight checks...${NC}"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: Must run as root (sudo ./install.sh)${NC}"
    exit 1
fi

if ! command -v php &> /dev/null; then
    echo -e "${RED}ERROR: PHP not found. Install php8.1-fpm or later.${NC}"
    exit 1
fi

PHP_VERSION=$(php -v | head -1 | grep -oP '\d+\.\d+')
echo -e "  PHP version: ${GREEN}${PHP_VERSION}${NC}"

if ! command -v nginx &> /dev/null; then
    echo -e "${RED}ERROR: Nginx not found.${NC}"
    exit 1
fi
echo -e "  Nginx: ${GREEN}OK${NC}"

if [ ! -d "$WEB_ROOT" ]; then
    echo -e "${RED}ERROR: Web root $WEB_ROOT not found.${NC}"
    exit 1
fi
echo -e "  Web root: ${GREEN}${WEB_ROOT}${NC}"
echo -e "${GREEN}  Pre-flight: PASSED${NC}"
echo ""

# ── 2. Backup existing files ──────────────────────────────────────
echo -e "${YELLOW}[2/7] Creating backup...${NC}"
mkdir -p "$BACKUP_DIR"

for f in resolve_quality.php cmaf_engine/resilience_integration_shim.php \
         cmaf_engine/modules/neuro_buffer_controller.php \
         cmaf_engine/modules/modem_priority_manager.php \
         cmaf_engine/modules/ai_super_resolution_engine.php; do
    if [ -f "$WEB_ROOT/$f" ]; then
        mkdir -p "$BACKUP_DIR/$(dirname $f)"
        cp "$WEB_ROOT/$f" "$BACKUP_DIR/$f"
        echo -e "  Backed up: $f"
    fi
done
echo -e "${GREEN}  Backup: $BACKUP_DIR${NC}"
echo ""

# ── 3. Create directory structure ─────────────────────────────────
echo -e "${YELLOW}[3/7] Creating directories...${NC}"
mkdir -p "$WEB_ROOT/cmaf_engine/modules"
mkdir -p "$LOG_DIR"
echo -e "${GREEN}  Directories: OK${NC}"
echo ""

# ── 4. Deploy engine files ────────────────────────────────────────
echo -e "${YELLOW}[4/7] Deploying engine files...${NC}"

cp "$SCRIPT_DIR/engine/resolve_quality.php" "$WEB_ROOT/resolve_quality.php"
echo -e "  ✅ resolve_quality.php (Profiles P0-P5)"

cp "$SCRIPT_DIR/engine/cmaf_engine/resilience_integration_shim.php" \
   "$WEB_ROOT/cmaf_engine/resilience_integration_shim.php"
echo -e "  ✅ resilience_integration_shim.php (5-Motor Pipeline)"

cp "$SCRIPT_DIR/engine/cmaf_engine/modules/neuro_buffer_controller.php" \
   "$WEB_ROOT/cmaf_engine/modules/neuro_buffer_controller.php"
echo -e "  ✅ neuro_buffer_controller.php (Adaptive Buffer)"

cp "$SCRIPT_DIR/engine/cmaf_engine/modules/modem_priority_manager.php" \
   "$WEB_ROOT/cmaf_engine/modules/modem_priority_manager.php"
echo -e "  ✅ modem_priority_manager.php (DSCP + Network)"

cp "$SCRIPT_DIR/engine/cmaf_engine/modules/ai_super_resolution_engine.php" \
   "$WEB_ROOT/cmaf_engine/modules/ai_super_resolution_engine.php"
echo -e "  ✅ ai_super_resolution_engine.php (Visual Orchestrator v4.0)"

echo -e "${GREEN}  Deploy: COMPLETE${NC}"
echo ""

# ── 5. Set permissions ────────────────────────────────────────────
echo -e "${YELLOW}[5/7] Setting permissions...${NC}"
chown -R www-data:www-data "$WEB_ROOT/cmaf_engine"
chown www-data:www-data "$WEB_ROOT/resolve_quality.php"
chmod 644 "$WEB_ROOT/resolve_quality.php"
chmod -R 644 "$WEB_ROOT/cmaf_engine/"
find "$WEB_ROOT/cmaf_engine/" -type d -exec chmod 755 {} \;

# Log files
touch "$LOG_DIR/neuro_telemetry.log"
touch "$LOG_DIR/bw_floor.log"
touch "$LOG_DIR/shim_operations.log"
touch "$LOG_DIR/ctx_inherit.log"
touch "$LOG_DIR/fallback.log"
chown -R www-data:www-data "$LOG_DIR"
chmod 664 "$LOG_DIR"/*.log

echo -e "${GREEN}  Permissions: OK${NC}"
echo ""

# ── 6. Syntax verification ───────────────────────────────────────
echo -e "${YELLOW}[6/7] PHP Syntax verification...${NC}"
ERRORS=0

for f in "$WEB_ROOT/resolve_quality.php" \
         "$WEB_ROOT/cmaf_engine/resilience_integration_shim.php" \
         "$WEB_ROOT/cmaf_engine/modules/neuro_buffer_controller.php" \
         "$WEB_ROOT/cmaf_engine/modules/modem_priority_manager.php" \
         "$WEB_ROOT/cmaf_engine/modules/ai_super_resolution_engine.php"; do
    if php -l "$f" > /dev/null 2>&1; then
        echo -e "  ✅ $(basename $f)"
    else
        echo -e "  ${RED}❌ $(basename $f) — SYNTAX ERROR${NC}"
        ERRORS=$((ERRORS + 1))
    fi
done

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}  CRITICAL: $ERRORS syntax errors found!${NC}"
    echo -e "${RED}  Restoring backup...${NC}"
    cp -r "$BACKUP_DIR"/* "$WEB_ROOT/" 2>/dev/null || true
    echo -e "${RED}  Backup restored. Fix errors and retry.${NC}"
    exit 1
fi
echo -e "${GREEN}  Syntax: ALL PASSED${NC}"
echo ""

# ── 7. Service restart ───────────────────────────────────────────
echo -e "${YELLOW}[7/7] Restarting services...${NC}"
systemctl reload php*-fpm 2>/dev/null || systemctl restart php*-fpm 2>/dev/null || true
systemctl reload nginx 2>/dev/null || true
echo -e "${GREEN}  Services: Reloaded${NC}"
echo ""

# ── Summary ──────────────────────────────────────────────────────
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   ✅ APE Resilience Toolkit v6.3 — INSTALLED${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Files deployed:${NC}"
echo -e "    $WEB_ROOT/resolve_quality.php"
echo -e "    $WEB_ROOT/cmaf_engine/resilience_integration_shim.php"
echo -e "    $WEB_ROOT/cmaf_engine/modules/neuro_buffer_controller.php"
echo -e "    $WEB_ROOT/cmaf_engine/modules/modem_priority_manager.php"
echo -e "    $WEB_ROOT/cmaf_engine/modules/ai_super_resolution_engine.php"
echo ""
echo -e "  ${CYAN}Logs:${NC} $LOG_DIR/"
echo -e "  ${CYAN}Backup:${NC} $BACKUP_DIR/"
echo ""
echo -e "  ${YELLOW}Monitor:${NC} tail -f $LOG_DIR/shim_operations.log"
echo -e "  ${YELLOW}Telemetry:${NC} tail -f $LOG_DIR/neuro_telemetry.log"
echo -e "  ${YELLOW}BW Floor:${NC} tail -f $LOG_DIR/bw_floor.log"
echo ""
