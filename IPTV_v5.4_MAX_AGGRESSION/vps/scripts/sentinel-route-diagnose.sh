#!/bin/bash
# sentinel-route-diagnose.sh
set -uo pipefail
LOG="/var/log/ape-sentinel.log"
log() { echo "[$(date '+%m-%d %H:%M:%S')] SENTINEL_ROUTE_DIAGNOSE: $1" >> "$LOG"; }

log "Diagnosing network routes..."
# Ping providers and measure round-trip times and package loss
for host in nfqdeuxu.x1megaott.online tivigo.cc; do
    ping_res=$(ping -c 3 -W 2 "$host" 2>&1 || true)
    loss=$(echo "$ping_res" | grep -oP '\d+(?=% packet loss)' || echo 100)
    rtt=$(echo "$ping_res" | grep -oP 'rtt min/avg/max/mdev = \K[0-9./]+' || echo "0/0/0/0")
    log "Host: $host | Packet Loss: $loss% | RTT Ratios: $rtt"
done
echo "OK"
