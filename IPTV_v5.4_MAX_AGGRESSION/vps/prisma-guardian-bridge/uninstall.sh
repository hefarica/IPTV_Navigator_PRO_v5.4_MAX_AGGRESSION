#!/usr/bin/env bash
# PRISMA-Guardian Bridge — Uninstaller (clean rollback)
set -euo pipefail

SERVICE_NAME="prisma-guardian-bridge.service"
INSTALL_DIR="/opt/prisma-guardian-bridge"

[[ $EUID -eq 0 ]] || { echo "ERROR: must run as root"; exit 1; }

echo "[1/4] Stopping service..."
systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
systemctl disable "${SERVICE_NAME}" 2>/dev/null || true

echo "[2/4] Removing systemd unit..."
rm -f "/etc/systemd/system/${SERVICE_NAME}"
systemctl daemon-reload

echo "[3/4] Removing install dir..."
rm -rf "${INSTALL_DIR}"

echo "[4/4] Removing SHM file (PRISMA will fall back to defaults)..."
rm -f /dev/shm/guardian_player_state.json

echo ""
echo "✓ Bridge uninstalled. PRISMA reverts to pre-bridge behavior (telemetry source=none)."
echo "  Frozen production files were NEVER modified, so no rollback needed for those."
