#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# APE RAM GUARDIAN — VPS Auto-Deploy & Monitor Service
# ═══════════════════════════════════════════════════════════════════════════
# Purpose: Detect streaming devices via Xray/NGINX logs, auto-deploy
#          the RAM guardian daemon to any Android TV device detected.
#
# Architecture:
#   VPS monitors NGINX/Xray logs → detects device IP →
#   attempts ADB connect → pushes guardian script → starts daemon
#
# Deploy to VPS:
#   scp ape-ram-guardian-vps.sh root@VPS:/opt/netshield/
#   scp ape-ram-guardian.sh root@VPS:/opt/netshield/
#   chmod 755 /opt/netshield/ape-ram-guardian*.sh
#
# Run:  /opt/netshield/ape-ram-guardian-vps.sh
# Cron: */10 * * * * /opt/netshield/ape-ram-guardian-vps.sh cron
#
# (c) 2026 APE IPTV — NET SHIELD AUTOPISTA
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── CONFIG ───────────────────────────────────────────────────────────────
GUARDIAN_SCRIPT="/opt/netshield/ape-ram-guardian.sh"
DEVICE_STATE_DIR="/opt/netshield/state/devices"
XRAY_LOG="/var/log/xray/access.log"
NGINX_LOG="/var/log/nginx/iptv_intercept.log"
ADB_PORT=5555
ADB_TIMEOUT=5
LOG="/var/log/ape-ram-guardian-vps.log"

# Known device IPs (LAN addresses reachable via tunnels)
# Format: "PUBLIC_IP:LAN_IP" — auto-discovered or manually added
KNOWN_DEVICES_FILE="/opt/netshield/state/known_devices.conf"

# ─── FUNCTIONS ────────────────────────────────────────────────────────────

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"
}

# Discover devices from Xray access log
discover_xray_devices() {
    if [ ! -f "$XRAY_LOG" ]; then return; fi
    # Extract unique IPs that connected via VLESS in last 30 minutes
    local cutoff=$(date -u -d '30 minutes ago' '+%Y/%m/%d %H:%M' 2>/dev/null || date -u '+%Y/%m/%d %H:%M')
    grep "vless-reality" "$XRAY_LOG" 2>/dev/null | \
        awk -v cutoff="$cutoff" '$1" "$2 >= cutoff {print $4}' | \
        grep -oP '\d+\.\d+\.\d+\.\d+' | \
        sort -u
}

# Discover devices from NGINX intercept log (streaming devices)
discover_nginx_devices() {
    if [ ! -f "$NGINX_LOG" ]; then return; fi
    # Get IPs that made IPTV requests in last 30 minutes
    awk '{print $1}' "$NGINX_LOG" 2>/dev/null | \
        sort -u | \
        grep -v '127.0.0.1\|178.156.147.234'
}

# Try to connect ADB to a device
try_adb_connect() {
    local ip="$1"
    local port="${2:-$ADB_PORT}"
    local addr="${ip}:${port}"

    # Check if already connected
    if adb devices 2>/dev/null | grep -q "$addr.*device"; then
        return 0
    fi

    # Try connect with timeout
    timeout "$ADB_TIMEOUT" adb connect "$addr" 2>/dev/null | grep -q "connected" && return 0
    return 1
}

# Check if guardian is running on device
check_guardian_on_device() {
    local addr="$1"
    local pid=$(adb -s "$addr" shell "cat /data/local/tmp/ape-ram-guardian.lock 2>/dev/null" 2>/dev/null | tr -d '\r\n')
    if [ -n "$pid" ]; then
        # Verify process is alive
        local alive=$(adb -s "$addr" shell "kill -0 $pid 2>/dev/null; echo \$?" 2>/dev/null | tr -d '\r\n')
        if [ "$alive" = "0" ]; then
            return 0  # Running
        fi
    fi
    return 1  # Not running
}

# Deploy and start guardian on device
deploy_guardian() {
    local addr="$1"
    log "DEPLOY: Pushing guardian to $addr..."

    # Push script
    adb -s "$addr" push "$GUARDIAN_SCRIPT" /data/local/tmp/ape-ram-guardian.sh 2>/dev/null
    if [ $? -ne 0 ]; then
        log "DEPLOY: FAILED to push script to $addr"
        return 1
    fi

    # Make executable
    adb -s "$addr" shell "chmod 755 /data/local/tmp/ape-ram-guardian.sh" 2>/dev/null

    # Kill old instance if any
    adb -s "$addr" shell "
        if [ -f /data/local/tmp/ape-ram-guardian.lock ]; then
            kill \$(cat /data/local/tmp/ape-ram-guardian.lock) 2>/dev/null
            rm -f /data/local/tmp/ape-ram-guardian.lock
        fi
    " 2>/dev/null

    # Start daemon
    adb -s "$addr" shell "nohup /data/local/tmp/ape-ram-guardian.sh daemon > /dev/null 2>&1 &" 2>/dev/null
    sleep 3

    # Verify
    if check_guardian_on_device "$addr"; then
        local mem=$(adb -s "$addr" shell "grep MemAvailable /proc/meminfo | awk '{print int(\$2/1024)}'" 2>/dev/null | tr -d '\r\n')
        log "DEPLOY: SUCCESS on $addr — Guardian running, MemAvail=${mem}MB"
        return 0
    else
        log "DEPLOY: FAILED to start guardian on $addr"
        return 1
    fi
}

# Get device status report
get_device_status() {
    local addr="$1"
    local model=$(adb -s "$addr" shell "getprop ro.product.model" 2>/dev/null | tr -d '\r\n')
    local mem_avail=$(adb -s "$addr" shell "grep MemAvailable /proc/meminfo | awk '{print int(\$2/1024)}'" 2>/dev/null | tr -d '\r\n')
    local mem_free=$(adb -s "$addr" shell "grep MemFree /proc/meminfo | awk '{print int(\$2/1024)}'" 2>/dev/null | tr -d '\r\n')
    local vpn=$(adb -s "$addr" shell "ip link show tun0 2>/dev/null | grep -c UP" 2>/dev/null | tr -d '\r\n')
    local guardian_status="UNKNOWN"
    check_guardian_on_device "$addr" && guardian_status="RUNNING" || guardian_status="STOPPED"

    echo "  Device: $model ($addr)"
    echo "  MemAvail: ${mem_avail}MB | MemFree: ${mem_free}MB"
    echo "  VPN tun0: $([ "$vpn" = "1" ] && echo "UP" || echo "DOWN")"
    echo "  Guardian: $guardian_status"
}

# Force RAM cleanup on device (immediate)
force_cleanup() {
    local addr="$1"
    log "FORCE_CLEANUP: Triggering on $addr..."
    adb -s "$addr" shell "/data/local/tmp/ape-ram-guardian.sh cleanup" 2>/dev/null
    local mem=$(adb -s "$addr" shell "grep MemAvailable /proc/meminfo | awk '{print int(\$2/1024)}'" 2>/dev/null | tr -d '\r\n')
    log "FORCE_CLEANUP: Done. MemAvail=${mem}MB on $addr"
}

# ─── MAIN ─────────────────────────────────────────────────────────────────

main() {
    mkdir -p "$DEVICE_STATE_DIR" 2>/dev/null
    mkdir -p "$(dirname "$KNOWN_DEVICES_FILE")" 2>/dev/null

    # Start ADB server
    adb start-server 2>/dev/null

    log "═══ APE RAM GUARDIAN VPS CONTROLLER ═══"

    # Collect all potential device addresses
    local devices=""

    # 1. From known devices file
    if [ -f "$KNOWN_DEVICES_FILE" ]; then
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            [[ "$line" == \#* ]] && continue
            devices="$devices $line"
        done < "$KNOWN_DEVICES_FILE"
    fi

    # 2. Already connected ADB devices
    local connected=$(adb devices 2>/dev/null | grep -v "List" | awk '{print $1}' | grep -v '^$')
    for d in $connected; do
        devices="$devices $d"
    done

    # Deduplicate
    devices=$(echo "$devices" | tr ' ' '\n' | sort -u | grep -v '^$')

    if [ -z "$devices" ]; then
        log "NO_DEVICES: No known or connected devices found"
        log "Add device IPs to $KNOWN_DEVICES_FILE (one per line, format: IP:PORT)"
        return 1
    fi

    for addr in $devices; do
        # Ensure port is included
        echo "$addr" | grep -q ":" || addr="${addr}:${ADB_PORT}"

        log "CHECKING: $addr..."

        # Try ADB connect
        if try_adb_connect "${addr%:*}" "${addr#*:}"; then
            log "ADB: Connected to $addr"

            # Check if guardian is running
            if check_guardian_on_device "$addr"; then
                log "GUARDIAN: Already running on $addr"
                get_device_status "$addr" | while read -r line; do log "$line"; done
            else
                log "GUARDIAN: Not running on $addr — deploying..."
                deploy_guardian "$addr"
            fi
        else
            log "ADB: Cannot reach $addr (NAT/firewall/offline)"
        fi
    done
}

# ─── CRON MODE ────────────────────────────────────────────────────────────
# Lightweight check suitable for cron (every 10 min)
cron_check() {
    adb start-server 2>/dev/null

    local connected=$(adb devices 2>/dev/null | grep "device$" | awk '{print $1}')
    for addr in $connected; do
        if ! check_guardian_on_device "$addr"; then
            log "CRON: Guardian died on $addr — redeploying"
            deploy_guardian "$addr"
        fi

        # Quick mem check
        local mem=$(adb -s "$addr" shell "grep MemAvailable /proc/meminfo | awk '{print int(\$2/1024)}'" 2>/dev/null | tr -d '\r\n')
        if [ -n "$mem" ] && [ "$mem" -lt 100 ] 2>/dev/null; then
            log "CRON: CRITICAL RAM on $addr (${mem}MB) — forcing cleanup"
            force_cleanup "$addr"
        fi
    done
}

# ─── ENTRY POINT ──────────────────────────────────────────────────────────
case "${1:-run}" in
    run)
        main
        ;;
    cron)
        cron_check
        ;;
    status)
        adb start-server 2>/dev/null
        echo "═══ APE RAM GUARDIAN — Device Status ═══"
        local connected=$(adb devices 2>/dev/null | grep "device$" | awk '{print $1}')
        for addr in $connected; do
            get_device_status "$addr"
            echo "---"
        done
        ;;
    deploy)
        addr="${2:-}"
        if [ -z "$addr" ]; then
            echo "Usage: $0 deploy IP:PORT"
            exit 1
        fi
        adb start-server 2>/dev/null
        try_adb_connect "${addr%:*}" "${addr#*:}" && deploy_guardian "$addr"
        ;;
    cleanup)
        addr="${2:-}"
        if [ -z "$addr" ]; then
            local connected=$(adb devices 2>/dev/null | grep "device$" | awk '{print $1}')
            for addr in $connected; do
                force_cleanup "$addr"
            done
        else
            force_cleanup "$addr"
        fi
        ;;
    *)
        echo "APE RAM GUARDIAN — VPS Controller"
        echo "Usage: $0 {run|cron|status|deploy IP:PORT|cleanup [IP:PORT]}"
        echo ""
        echo "  run      - Full scan: discover, connect, deploy guardians"
        echo "  cron     - Quick check: redeploy if guardian died"
        echo "  status   - Show all connected devices + memory"
        echo "  deploy   - Deploy guardian to specific device"
        echo "  cleanup  - Force RAM cleanup on all/specific device"
        ;;
esac
