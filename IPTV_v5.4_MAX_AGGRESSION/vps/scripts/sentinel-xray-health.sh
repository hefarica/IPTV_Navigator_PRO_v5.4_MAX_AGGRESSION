#!/bin/bash
# sentinel-xray-health.sh
set -uo pipefail
LOG="/var/log/ape-sentinel.log"
log() { echo "[$(date '+%m-%d %H:%M:%S')] SENTINEL_XRAY_HEALTH: $1" >> "$LOG"; }

log "Checking Xray status..."
if ! pgrep -x xray >/dev/null || ! ss -tlnp | grep -q ':8443'; then
    systemctl restart xray 2>/dev/null
    sleep 2
    if pgrep -x xray >/dev/null; then
        log "Xray restarted successfully"
    else
        log "Xray failed to start!"
        exit 1
    fi
else
    log "Xray is healthy"
fi
echo "OK"
