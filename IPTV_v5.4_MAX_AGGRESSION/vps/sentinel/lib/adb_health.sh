#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE SENTINEL — ADB Connection Watchdog
# Tracks and repairs the ADB link over WireGuard.
# Restarts the server or retries connection if device goes offline/missing.
#
# Usage: adb_health.sh <device_ip:port>
# ══════════════════════════════════════════════════════════════════════════

set -euo pipefail

ADB_TARGET="${1:-10.200.0.3:5555}"
STATE_DIR="/opt/netshield/state"
HEALTH_FILE="${STATE_DIR}/sentinel_adb_health.json"

# Ensure state directory exists
mkdir -p "$STATE_DIR"

log_state() {
    local status="$1"
    local msg="$2"
    cat <<EOF > "$HEALTH_FILE"
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "device": "${ADB_TARGET}",
  "status": "${status}",
  "message": "${msg}"
}
EOF
}

check_device_state() {
    # Check if the device is listed and in 'device' state
    local state
    state=$(adb devices | grep "${ADB_TARGET}" | awk '{print $2}' || echo "")
    echo "$state"
}

attempt_reconnect() {
    echo "[ADB_WATCHDOG] Link dropped or offline. Running recovery sequence..."
    
    # 1. Disconnect and retry connect
    adb disconnect "$ADB_TARGET" >/dev/null 2>&1 || true
    sleep 0.5
    adb connect "$ADB_TARGET" >/dev/null 2>&1 || true
    sleep 1.0
    
    local state
    state=$(check_device_state)
    if [ "$state" = "device" ]; then
        echo "[ADB_WATCHDOG] Reconnected successfully."
        return 0
    fi
    
    # 2. Hard restart ADB Server
    echo "[ADB_WATCHDOG] Hard reset of ADB Server..."
    adb kill-server >/dev/null 2>&1 || true
    sleep 1.0
    adb start-server >/dev/null 2>&1 || true
    sleep 1.0
    adb connect "$ADB_TARGET" >/dev/null 2>&1 || true
    sleep 2.0
    
    state=$(check_device_state)
    if [ "$state" = "device" ]; then
        echo "[ADB_WATCHDOG] Reconnected after hard reset."
        return 0
    fi
    
    return 1
}

# Main Watchdog Routine
STATE=$(check_device_state)

if [ "$STATE" = "device" ]; then
    echo "[ADB_WATCHDOG] Link healthy: $ADB_TARGET is connected."
    log_state "healthy" "Device connected and active"
    exit 0
elif [ "$STATE" = "offline" ]; then
    echo "[ADB_WATCHDOG] Device is offline. Reconnecting..."
    log_state "warning" "Device offline, reconnecting..."
    if attempt_reconnect; then
        log_state "healthy" "Device recovered from offline"
        exit 0
    fi
elif [ "$STATE" = "unauthorized" ]; then
    echo "[ADB_WATCHDOG] Device unauthorized. Check ADB confirmation on device screen."
    log_state "critical" "Unauthorized device status"
    exit 1
else
    echo "[ADB_WATCHDOG] Device not found in adb devices list."
    log_state "warning" "Device not in adb list, connecting..."
    if attempt_reconnect; then
        log_state "healthy" "Device recovered from missing status"
        exit 0
    fi
fi

echo "[ADB_WATCHDOG] Failed to establish device connection."
log_state "unreachable" "Failed to connect to ADB device"
exit 1
