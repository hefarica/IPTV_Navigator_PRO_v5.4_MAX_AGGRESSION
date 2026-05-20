#!/bin/bash
# sentinel-wg-failover.sh
set -uo pipefail
LOG="/var/log/ape-sentinel.log"
log() { echo "[$(date '+%m-%d %H:%M:%S')] SENTINEL_WG_FAILOVER: $1" >> "$LOG"; }

log "Checking SurfShark VPN status..."
# Check Miami
if ! ip link show wg-surfshark 2>/dev/null | grep -q UP; then
    log "wg-surfshark down -> bringing up"
    wg-quick down wg-surfshark 2>/dev/null; sleep 1; wg-quick up wg-surfshark 2>/dev/null
else
    hs=$(wg show wg-surfshark latest-handshakes 2>/dev/null | awk '{print $2}')
    now=$(date +%s)
    if [ -n "$hs" ] && [ "$hs" -gt 0 ] 2>/dev/null; then
        age=$((now - hs))
        if [ "$age" -gt 180 ]; then
            log "wg-surfshark stale (${age}s) -> bouncing"
            wg-quick down wg-surfshark 2>/dev/null; sleep 1; wg-quick up wg-surfshark 2>/dev/null
        fi
    fi
fi

# Check Brazil
if ! ip link show wg-surfshark-br 2>/dev/null | grep -q UP; then
    log "wg-surfshark-br down -> bringing up"
    wg-quick down wg-surfshark-br 2>/dev/null; sleep 1; wg-quick up wg-surfshark-br 2>/dev/null
else
    hs=$(wg show wg-surfshark-br latest-handshakes 2>/dev/null | awk '{print $2}')
    now=$(date +%s)
    if [ -n "$hs" ] && [ "$hs" -gt 0 ] 2>/dev/null; then
        age=$((now - hs))
        if [ "$age" -gt 180 ]; then
            log "wg-surfshark-br stale (${age}s) -> bouncing"
            wg-quick down wg-surfshark-br 2>/dev/null; sleep 1; wg-quick up wg-surfshark-br 2>/dev/null
        fi
    fi
fi
echo "OK"
