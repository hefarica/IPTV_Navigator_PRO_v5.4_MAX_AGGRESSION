#!/bin/bash
# sentinel-cache-warm.sh
set -uo pipefail
LOG="/var/log/ape-sentinel.log"
log() { echo "[$(date '+%m-%d %H:%M:%S')] SENTINEL_CACHE_WARM: $1" >> "$LOG"; }

log "Warming up Nginx RAM cache..."
# Find the last 5 requested M3U8 files from Nginx access logs
local_requests=$(tail -200 /var/log/nginx/shield_access.log 2>/dev/null | grep '\.m3u8' | awk '{print $7}' | sort -u | tail -5)
if [ -n "$local_requests" ]; then
    for path in $local_requests; do
        log "Pre-fetching: http://127.0.0.1$path"
        curl -s -o /dev/null -H "Host: iptv-ape.duckdns.org" "http://127.0.0.1$path" &
    done
    wait
    log "RAM Cache warmed up"
else
    log "No active channel requests found to warm up cache"
fi
echo "OK"
