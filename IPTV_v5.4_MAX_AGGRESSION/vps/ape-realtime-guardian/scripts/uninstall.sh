#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE Real-Time Bitrate Guardian — Uninstall Script
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

KEEP_LOGS=false
if [[ "${1:-}" == "--keep-logs" ]]; then
    KEEP_LOGS=true
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  APE Real-Time Bitrate Guardian — Uninstaller"
echo "═══════════════════════════════════════════════════════════════"

# 1. Stop and disable service
echo "[1/5] Stopping service..."
systemctl stop ape-realtime-guardian 2>/dev/null || true
systemctl disable ape-realtime-guardian 2>/dev/null || true

# 2. Remove systemd unit
echo "[2/5] Removing systemd unit..."
rm -f /etc/systemd/system/ape-realtime-guardian.service
systemctl daemon-reload

# 3. Remove application
echo "[3/5] Removing application..."
rm -rf /opt/ape-realtime-guardian

# 4. Remove config
echo "[4/5] Removing config..."
rm -rf /etc/ape-realtime-guardian

# 5. Remove data
echo "[5/5] Cleaning up..."
rm -f /dev/shm/ape_bitrate_demand.json
rm -f /var/lib/ape-realtime-guardian/state.json
rm -rf /var/lib/ape-realtime-guardian
rm -f /etc/logrotate.d/ape-realtime-guardian

if [ "$KEEP_LOGS" = true ]; then
    echo "  Keeping logs at /var/log/ape-realtime-guardian/"
else
    rm -rf /var/log/ape-realtime-guardian
fi

# If nginx_lua adapter was used, revert the lua_shared_dict line
NGINX_LUA="/etc/nginx/conf.d/iptv-lua-circuit.conf"
if [ -f "$NGINX_LUA" ] && grep -q "ape_demand" "$NGINX_LUA"; then
    echo "  Reverting nginx lua_shared_dict ape_demand..."
    sed -i '/lua_shared_dict ape_demand/d' "$NGINX_LUA"
    nginx -t && systemctl reload nginx
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Uninstall complete. System restored."
echo "═══════════════════════════════════════════════════════════════"
