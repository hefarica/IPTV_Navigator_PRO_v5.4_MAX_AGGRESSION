#!/bin/bash
# sentinel-vps-recovery.sh
# Safely clean memory, truncate logs, and verify nginx is running.
set -uo pipefail
LOG="/var/log/ape-sentinel.log"
log() { echo "[$(date '+%m-%d %H:%M:%S')] SENTINEL_VPS_RECOVERY: $1" >> "$LOG"; }

log "Starting recovery..."
# Free memory caches
echo 3 > /proc/sys/vm/drop_caches 2>/dev/null && log "RAM caches cleared"
# Truncate logs if needed
find /var/log/nginx/ -name "*.log" -size +50M -exec truncate -s 10M {} \; 2>/dev/null && log "Logs truncated"
# Ensure Nginx is alive
if ! pgrep -x nginx >/dev/null; then
    nginx -t && systemctl start nginx || systemctl restart nginx
    log "Nginx restarted"
else
    systemctl reload nginx
    log "Nginx reloaded"
fi
echo "OK"
