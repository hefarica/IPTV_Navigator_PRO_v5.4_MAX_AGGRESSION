#!/bin/bash
# APE TELESCOPE v2.1 — Device Metrics Collector
# RUNS: as part of prisma_adb_daemon.sh cycle (1s) or standalone
# OUTPUT: /dev/shm/prisma_device_metrics.json
# COST: < 2ms per cycle (all /proc reads)

OUTPUT="/dev/shm/prisma_device_metrics.json"

# ── CPU usage (from /proc/stat) ──────────────────────────────────────
read_cpu() {
    local line
    line=$(head -1 /proc/stat)
    echo "$line" | awk '{print $2+$3+$4, $2+$3+$4+$5+$6+$7+$8}'
}

CPU1=$(read_cpu)
BUSY1=$(echo "$CPU1" | awk '{print $1}')
TOTAL1=$(echo "$CPU1" | awk '{print $2}')
sleep 0.1
CPU2=$(read_cpu)
BUSY2=$(echo "$CPU2" | awk '{print $1}')
TOTAL2=$(echo "$CPU2" | awk '{print $2}')

DELTA_BUSY=$((BUSY2 - BUSY1))
DELTA_TOTAL=$((TOTAL2 - TOTAL1))
CPU_PCT=0
if [ "$DELTA_TOTAL" -gt 0 ]; then
    CPU_PCT=$((DELTA_BUSY * 100 / DELTA_TOTAL))
fi

# ── RAM ──────────────────────────────────────────────────────────────
MEM_TOTAL=$(awk '/^MemTotal:/ {print int($2/1024)}' /proc/meminfo)
MEM_AVAIL=$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo)
MEM_FREE=$((MEM_TOTAL - MEM_AVAIL))

# ── Load ─────────────────────────────────────────────────────────────
LOAD_1=$(awk '{print $1}' /proc/loadavg)
LOAD_5=$(awk '{print $2}' /proc/loadavg)
LOAD_15=$(awk '{print $3}' /proc/loadavg)
NPROC=$(nproc)

# ── Uptime ───────────────────────────────────────────────────────────
UPTIME_S=$(awk '{print int($1)}' /proc/uptime)

# ── /dev/shm usage ───────────────────────────────────────────────────
SHM_USED_PCT=$(df /dev/shm | awk 'NR==2 {print $5}' | tr -d '%')

# ── Write JSON atomically ────────────────────────────────────────────
TMP=$(mktemp /dev/shm/prisma_dm_XXXXXX)
chmod 644 "$TMP"
cat > "$TMP" <<EOF
{"cpu_pct":${CPU_PCT},"ram_total_mb":${MEM_TOTAL},"ram_free_mb":${MEM_AVAIL},"ram_used_mb":${MEM_FREE},"load_1min":${LOAD_1},"load_5min":${LOAD_5},"load_15min":${LOAD_15},"nproc":${NPROC},"uptime_s":${UPTIME_S},"shm_used_pct":${SHM_USED_PCT}}
EOF
mv "$TMP" "$OUTPUT"
