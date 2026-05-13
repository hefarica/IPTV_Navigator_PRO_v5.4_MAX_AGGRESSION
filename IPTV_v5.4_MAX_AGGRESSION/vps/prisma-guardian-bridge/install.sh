#!/usr/bin/env bash
# PRISMA-Guardian Bridge — Installer
# Idempotent: re-runs are safe.
set -euo pipefail

INSTALL_DIR="/opt/prisma-guardian-bridge"
SERVICE_NAME="prisma-guardian-bridge.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
AUDIT_LOG="${1:-/var/log/ape-guardian/audit.jsonl}"

# ── Pre-flight ────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || { echo "ERROR: must run as root"; exit 1; }
command -v python3 >/dev/null || { echo "ERROR: python3 required"; exit 1; }

if [[ ! -f "${AUDIT_LOG}" ]]; then
    echo "WARN: audit log not found yet at ${AUDIT_LOG}"
    echo "      Bridge will wait/backoff until Guardian creates it."
fi

# ── Capture invariant SHA before deploy ───────────────────────────────────
echo "[1/6] Capturing pre-deploy SHA-256 of frozen production files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FROZEN_MANIFEST="${SCRIPT_DIR}/.frozen-files.sha256"
{
    sha256sum /var/www/html/prisma/api/prisma-health.php 2>/dev/null || echo "MISSING prisma-health.php"
    sha256sum /opt/ape-realtime-guardian/ape_realtime_guardian/main.py 2>/dev/null || echo "MISSING main.py"
    sha256sum /opt/ape-realtime-guardian/ape_realtime_guardian/adapters/shm_write.py 2>/dev/null || echo "MISSING shm_write.py"
} > "${FROZEN_MANIFEST}"
echo "    Manifest: ${FROZEN_MANIFEST}"
cat "${FROZEN_MANIFEST}" | sed 's/^/      /'

# ── Install files ─────────────────────────────────────────────────────────
echo "[2/6] Installing to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"
cp "${SCRIPT_DIR}/prisma_guardian_bridge.py" "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/README.md" "${INSTALL_DIR}/" 2>/dev/null || true
chmod 755 "${INSTALL_DIR}/prisma_guardian_bridge.py"
chmod 755 "${INSTALL_DIR}"

# ── Install systemd unit ──────────────────────────────────────────────────
echo "[3/6] Installing systemd unit..."
cp "${SCRIPT_DIR}/prisma-guardian-bridge.service" "${SERVICE_PATH}"
# Substitute audit log path if user passed a custom one
if [[ "${AUDIT_LOG}" != "/var/log/ape-guardian/audit.jsonl" ]]; then
    sed -i "s|/var/log/ape-guardian/audit.jsonl|${AUDIT_LOG}|g" "${SERVICE_PATH}"
fi
chmod 644 "${SERVICE_PATH}"

# ── Smoke test before enabling ────────────────────────────────────────────
echo "[4/6] Smoke test (single cycle)..."
if /usr/bin/python3 "${INSTALL_DIR}/prisma_guardian_bridge.py" \
    --audit-log "${AUDIT_LOG}" \
    --output /dev/shm/guardian_player_state.json \
    --once 2>&1; then
    echo "    ✓ Smoke test wrote a player_state file"
elif [[ -f /dev/shm/guardian_player_state.json ]]; then
    echo "    ⚠ Smoke test exit non-zero but file exists — likely no audit data yet"
else
    echo "    ⚠ Smoke test could not write yet — that's expected if Guardian has no recent ADB data"
fi

# ── Enable + start ────────────────────────────────────────────────────────
echo "[5/6] Enabling + starting service..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"
sleep 2
systemctl --no-pager status "${SERVICE_NAME}" | head -15

# ── Verify post-deploy SHA still matches ──────────────────────────────────
echo "[6/6] Verifying frozen production files NOT modified..."
{
    sha256sum /var/www/html/prisma/api/prisma-health.php 2>/dev/null || echo "MISSING prisma-health.php"
    sha256sum /opt/ape-realtime-guardian/ape_realtime_guardian/main.py 2>/dev/null || echo "MISSING main.py"
    sha256sum /opt/ape-realtime-guardian/ape_realtime_guardian/adapters/shm_write.py 2>/dev/null || echo "MISSING shm_write.py"
} > "${FROZEN_MANIFEST}.post"
if diff -q "${FROZEN_MANIFEST}" "${FROZEN_MANIFEST}.post" >/dev/null 2>&1; then
    echo "    ✓ Frozen files SHA-256 unchanged (touch-nothing doctrine respected)"
else
    echo "    ✗ DRIFT DETECTED — investigate immediately:"
    diff "${FROZEN_MANIFEST}" "${FROZEN_MANIFEST}.post" || true
    exit 2
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✓ PRISMA-Guardian Bridge installed."
echo ""
echo "  Verify in 30s:  cat /dev/shm/guardian_player_state.json | jq"
echo "  Live logs:      journalctl -u ${SERVICE_NAME} -f"
echo "  PRISMA test:    curl -s https://iptv-ape.duckdns.org/prisma/api/prisma-health.php | jq .player_telemetry"
echo "  Rollback:       bash $(dirname $0)/uninstall.sh"
echo "═══════════════════════════════════════════════════════════════"
