#!/bin/bash
# APE PRISMA v1.3 — ADB Payload Sync Daemon
# Runs on VPS, ensures Fire TV config never drifts from desired state.
# Writes telemetry to /dev/shm/prisma_adb_telemetry.json

set -euo pipefail

DEVICE="10.200.0.3:5555"
TELEMETRY_FILE="/dev/shm/prisma_adb_telemetry.json"
LOG_FILE="/var/log/prisma_adb_daemon.log"
SYNC_INTERVAL=60
PAYLOAD_VERSION="1.3.1"

# ── Buffer Ultraboost Math ────────────────────────────────────────────
# 4K@120fps@80Mbps = 10 MB/s
# Buffer 30s = 300 MB
# Minimum 60% = 180 MB = 18s playback insurance
# WiFi minimum sustained: 13 MB/s = 104 Mbps
BUFFER_TARGET_SECONDS=30
BITRATE_MBPS=80
BUFFER_MIN_PCT=60
FPS_TARGET=120

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >> "$LOG_FILE"
}

adb_cmd() {
    adb -s "$DEVICE" shell "$@" 2>/dev/null || echo "ADB_ERROR"
}

ensure_connected() {
    local status
    status=$(adb -s "$DEVICE" get-state 2>/dev/null || echo "offline")
    if [ "$status" != "device" ]; then
        adb connect "$DEVICE" >/dev/null 2>&1 || true
        sleep 2
        status=$(adb -s "$DEVICE" get-state 2>/dev/null || echo "offline")
    fi
    echo "$status"
}

# ── Desired State (the payload) ──────────────────────────────────────
declare -A DESIRED_GLOBAL=(
    # Display
    ["always_hdr"]="1"
    ["match_content_frame_rate"]="1"
    # Performance
    ["window_animation_scale"]="0.0"
    ["transition_animation_scale"]="0.0"
    ["animator_duration_scale"]="0.0"
    # Power
    ["stay_on_while_plugged_in"]="3"
    ["low_power"]="0"
    # Network: Buffer Ultraboost
    ["captive_portal_detection_enabled"]="0"
    ["wifi_sleep_policy"]="2"
    ["wifi_scan_always_enabled"]="0"
    ["wifi_networks_available_notification_on"]="0"
    ["network_scoring_ui_enabled"]="0"
    ["tcp_default_init_rwnd"]="60"
    ["private_dns_mode"]="hostname"
    ["private_dns_specifier"]="dns.google"
    # Bandwidth Enforcement: kill parasites, force all BW to OTT Navigator
    ["background_data_enabled"]="0"
    ["wifi_watchdog_poor_network_test_enabled"]="0"
    ["wifi_suspend_optimizations_enabled"]="0"
    ["package_verifier_enable"]="0"
    ["data_roaming"]="0"
    ["device_provisioned"]="1"
    # Audio
    ["hdmi_system_audio_control"]="1"
)
declare -A DESIRED_SYSTEM=(
    ["screen_off_timeout"]="2147483647"
)
declare -A DESIRED_SECURE=(
    ["screensaver_enabled"]="0"
)

apply_and_verify() {
    local drift_count=0
    local applied_count=0
    local verified=()

    # Global settings
    for key in "${!DESIRED_GLOBAL[@]}"; do
        local current
        current=$(adb_cmd settings get global "$key" | tr -d '\r\n')
        if [ "$current" != "${DESIRED_GLOBAL[$key]}" ]; then
            adb_cmd settings put global "$key" "${DESIRED_GLOBAL[$key]}" >/dev/null
            drift_count=$((drift_count + 1))
            log "DRIFT_FIX: global/$key was '$current', set to '${DESIRED_GLOBAL[$key]}'"
        fi
        applied_count=$((applied_count + 1))
        verified+=("\"$key\": \"$(adb_cmd settings get global "$key" | tr -d '\r\n')\"")
    done

    # System settings
    for key in "${!DESIRED_SYSTEM[@]}"; do
        local current
        current=$(adb_cmd settings get system "$key" | tr -d '\r\n')
        if [ "$current" != "${DESIRED_SYSTEM[$key]}" ]; then
            adb_cmd settings put system "$key" "${DESIRED_SYSTEM[$key]}" >/dev/null
            drift_count=$((drift_count + 1))
            log "DRIFT_FIX: system/$key was '$current', set to '${DESIRED_SYSTEM[$key]}'"
        fi
        applied_count=$((applied_count + 1))
        verified+=("\"$key\": \"$(adb_cmd settings get system "$key" | tr -d '\r\n')\"")
    done

    # Secure settings
    for key in "${!DESIRED_SECURE[@]}"; do
        local current
        current=$(adb_cmd settings get secure "$key" | tr -d '\r\n')
        if [ "$current" != "${DESIRED_SECURE[$key]}" ]; then
            adb_cmd settings put secure "$key" "${DESIRED_SECURE[$key]}" >/dev/null
            drift_count=$((drift_count + 1))
            log "DRIFT_FIX: secure/$key was '$current', set to '${DESIRED_SECURE[$key]}'"
        fi
        applied_count=$((applied_count + 1))
        verified+=("\"$key\": \"$(adb_cmd settings get secure "$key" | tr -d '\r\n')\"")
    done

    echo "$drift_count:$applied_count"
}

gather_device_info() {
    local model resolution ott_version ott_pid

    model=$(adb_cmd getprop ro.product.model | tr -d '\r\n')
    resolution=$(adb_cmd wm size | grep "Physical" | awk '{print $3}' | tr -d '\r\n')
    ott_version=$(adb_cmd dumpsys package studio.scillarium.ottnavigator 2>/dev/null | grep versionName | head -1 | awk -F= '{print $2}' | tr -d '\r\n ')
    ott_pid=$(adb_cmd pidof studio.scillarium.ottnavigator | tr -d '\r\n')

    echo "$model|$resolution|$ott_version|$ott_pid"
}

write_telemetry() {
    local connected="$1"
    local drift_info="$2"
    local device_info="$3"

    local drift_count="${drift_info%%:*}"
    local total_settings="${drift_info##*:}"

    IFS='|' read -r model resolution ott_version ott_pid <<< "$device_info"

    local ott_running="false"
    [ -n "$ott_pid" ] && [ "$ott_pid" != "ADB_ERROR" ] && ott_running="true"

    local ts
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    cat > "${TELEMETRY_FILE}.tmp" << EOF
{
  "adb_connected": $( [ "$connected" = "device" ] && echo "true" || echo "false" ),
  "device": {
    "model": "$model",
    "serial": "G4N2JM02434606AT",
    "chip": "mt8696",
    "android": "11",
    "fire_os": "8.0"
  },
  "display": {
    "resolution": "$resolution",
    "hdr_mode": "always",
    "hdr_types": ["HDR10", "HLG", "HDR10+"],
    "max_luminance_nits": 500,
    "animations_disabled": true,
    "match_framerate": true
  },
  "player": {
    "app": "OTT Navigator",
    "package": "studio.scillarium.ottnavigator",
    "version": "$ott_version",
    "running": $ott_running,
    "pid": "$ott_pid"
  },
  "power": {
    "stay_on": true,
    "screensaver_disabled": true,
    "screen_timeout_max": true
  },
  "network": {
    "captive_portal_disabled": true,
    "wifi_sleep_never": true,
    "wifi_scan_background": false,
    "tcp_init_rwnd": 60,
    "dns": "dns.google",
    "hdmi_cec_audio": true
  },
  "buffer_ultraboost": {
    "target_seconds": $BUFFER_TARGET_SECONDS,
    "bitrate_mbps": $BITRATE_MBPS,
    "fps": $FPS_TARGET,
    "buffer_total_mb": $(( BUFFER_TARGET_SECONDS * BITRATE_MBPS / 8 )),
    "buffer_min_pct": $BUFFER_MIN_PCT,
    "buffer_min_mb": $(( BUFFER_TARGET_SECONDS * BITRATE_MBPS / 8 * BUFFER_MIN_PCT / 100 )),
    "buffer_min_seconds": $(( BUFFER_TARGET_SECONDS * BUFFER_MIN_PCT / 100 )),
    "wifi_min_mbps": $(( BITRATE_MBPS * 130 / 100 )),
    "wifi_min_MBs": $(( BITRATE_MBPS * 130 / 100 / 8 )),
    "extvlcopt_network_caching_ms": $(( BUFFER_TARGET_SECONDS * 10000 )),
    "extvlcopt_live_caching_ms": $(( BUFFER_TARGET_SECONDS * 3000 / 10 )),
    "status": "enforced"
  },
  "sync": {
    "drift_detected": $( [ "$drift_count" -gt 0 ] && echo "true" || echo "false" ),
    "drift_fixed_count": $drift_count,
    "total_settings": $total_settings,
    "payload_version": "$PAYLOAD_VERSION",
    "last_sync_ts": "$ts"
  },
  "ts": "$ts"
}
EOF
    mv "${TELEMETRY_FILE}.tmp" "$TELEMETRY_FILE"
}

# ── Main Loop ────────────────────────────────────────────────────────
log "DAEMON_START: APE PRISMA ADB Daemon v${PAYLOAD_VERSION}"

while true; do
    connected=$(ensure_connected)

    if [ "$connected" = "device" ]; then
        drift_info=$(apply_and_verify)
        device_info=$(gather_device_info)
        write_telemetry "$connected" "$drift_info" "$device_info"

        drift_count="${drift_info%%:*}"
        if [ "$drift_count" -gt 0 ]; then
            log "SYNC: Fixed $drift_count drifted settings"
        fi
    else
        write_telemetry "offline" "0:0" "unknown|unknown|unknown|"
        log "WARN: Device offline, retry in ${SYNC_INTERVAL}s"
    fi

    sleep "$SYNC_INTERVAL"
done
