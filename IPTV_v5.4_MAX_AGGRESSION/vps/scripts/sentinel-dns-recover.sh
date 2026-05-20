#!/bin/bash
# sentinel-dns-recover.sh
set -uo pipefail
LOG="/var/log/ape-sentinel.log"
log() { echo "[$(date '+%m-%d %H:%M:%S')] SENTINEL_DNS_RECOVER: $1" >> "$LOG"; }

log "Starting DNS recovery..."
systemctl restart unbound 2>/dev/null
sleep 1
if pgrep -x unbound >/dev/null; then
    log "Unbound restarted successfully"
else
    log "Unbound failed to restart!"
    exit 1
fi
echo "OK"
