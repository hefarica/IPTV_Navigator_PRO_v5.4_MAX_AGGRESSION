#!/bin/bash
# sentinel-qoe-snapshot.sh
set -uo pipefail
LOG="/var/log/ape-sentinel.log"
log() { echo "[$(date '+%m-%d %H:%M:%S')] SENTINEL_QOE_SNAPSHOT: $1" >> "$LOG"; }

log "Capturing QoE snapshot..."
# Collect connection count
active_conns=$(ss -tnp 2>/dev/null | grep -c ESTAB || echo 0)
cpu_usage=$(awk '{u=$2+$4;t=$2+$4+$5;if(NR==1){ou=u;ot=t}else{printf"%.0f",(u-ou)*100/(t-ot)}}' <(grep 'cpu ' /proc/stat;sleep 0.2;grep 'cpu ' /proc/stat) 2>/dev/null || echo 0)
mem_pct=$(free | awk '/Mem:/{printf "%.0f",$3/$2*100}' || echo 0)

# Build JSON snapshot
cat <<EOF > /dev/shm/prisma_qoe_snapshot.json
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "active_connections": $active_conns,
  "cpu_usage_pct": $cpu_usage,
  "mem_usage_pct": $mem_pct,
  "nginx_status": "$(pgrep -x nginx >/dev/null && echo "healthy" || echo "dead")"
}
EOF
log "Snapshot written to /dev/shm/prisma_qoe_snapshot.json"
echo "OK"
