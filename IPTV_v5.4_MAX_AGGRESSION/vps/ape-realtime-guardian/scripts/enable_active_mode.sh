#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE Real-Time Bitrate Guardian — Enable Active Mode
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

CONFIG="/etc/ape-realtime-guardian/config.yaml"

echo "═══════════════════════════════════════════════════════════════"
echo "  APE Real-Time Bitrate Guardian — Enable Active Mode"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Current config:"
grep -E "dry_run|mode:" "$CONFIG" | head -5
echo ""

read -p "  Switch from dry_run to ACTIVE with shm_write? [y/N] " confirm
if [[ "$confirm" != [yY] ]]; then
    echo "  Aborted."
    exit 0
fi

# Update config
sed -i 's/dry_run: true/dry_run: false/' "$CONFIG"
sed -i 's/mode: simulated/mode: shm_write/' "$CONFIG"

echo ""
echo "  Updated config:"
grep -E "dry_run|mode:" "$CONFIG" | head -5
echo ""

# Restart service
systemctl restart ape-realtime-guardian
sleep 2

echo "  Service status:"
systemctl is-active ape-realtime-guardian

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Active mode enabled. Monitoring..."
echo "  Verify: tail -f /var/log/ape-realtime-guardian/audit.jsonl"
echo "═══════════════════════════════════════════════════════════════"
