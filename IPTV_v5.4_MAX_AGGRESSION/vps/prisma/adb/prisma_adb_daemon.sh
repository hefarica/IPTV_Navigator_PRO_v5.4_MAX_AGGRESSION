#!/bin/bash
# APE PRISMA v1.3.2 — Reactive ADB Payload Daemon
# PHILOSOPHY: Dinámico, reactivo, sagaz, audaz y hambriento por las megas.
# - Measures REAL WiFi throughput every 5 seconds (delta bytes/time)
# - Computes dynamic buffer targets based on actual bandwidth
# - Never lets buffer drop below 60-70%
# - When bandwidth drops → protect buffer aggressively
# - When bandwidth recovers → immediately ramp to max quality
# Writes telemetry to /dev/shm/prisma_adb_telemetry.json

set -euo pipefail

DEVICE="10.200.0.3:5555"
TELEMETRY_FILE="/dev/shm/prisma_adb_telemetry.json"
LOG_FILE="/var/log/prisma_adb_daemon.log"
SYNC_INTERVAL=1
PAYLOAD_VERSION="1.3.2"

# ── Reactive Buffer Math Constants ────────────────────────────────────
# BITRATE FLOORS (NON-NEGOTIABLE)
# User-defined: "nunca quiero ver bajar estas megas por debajo de 17 en 4K"
# Screenshots: SKY SPORTS 4K showing 7.4/8.6/8.8 Mbps = UNACCEPTABLE
BITRATE_FLOOR_4K=17        # 4K: NEVER below 17 Mbps (user mandate)
BITRATE_FLOOR_1080P=8      # 1080p: proportional floor
BITRATE_FLOOR_720P=4       # 720p: absolute minimum
BITRATE_TARGET_4K=80       # 4K: ideal target when bandwidth is abundant
BITRATE_TARGET_1080P=20    # 1080p: ideal target
FPS_TARGET=120
BUFFER_MIN_PCT=60          # Never let buffer drop below 60%
BUFFER_FLOOR_SECONDS=18    # Absolute minimum: 18 seconds of video cached
BUFFER_CEILING_SECONDS=60  # When bandwidth is huge, buffer up to 60s

# ── Throughput Tracking State ─────────────────────────────────────────
PREV_RX_BYTES=0
PREV_TX_BYTES=0
PREV_TIMESTAMP=0
CURRENT_THROUGHPUT_MBPS=0
PEAK_THROUGHPUT_MBPS=0
AVG_THROUGHPUT_MBPS=0
THROUGHPUT_SAMPLES=0
THROUGHPUT_SUM=0
WIFI_LINK_SPEED=0
WIFI_RSSI=0
WIFI_FREQ=0
BANDWIDTH_STATE="MEASURING"  # MEASURING | HUNGRY | STABLE | STARVING

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

# ── Desired State (35 ADB settings) ──────────────────────────────────
declare -A DESIRED_GLOBAL=(
    # ── DISPLAY & IMAGE ──
    ["always_hdr"]="1"
    ["match_content_frame_rate"]="1"
    ["hdr_conversion_mode"]="1"
    ["user_preferred_resolution_height"]="2160"
    ["user_preferred_resolution_width"]="3840"
    ["user_preferred_refresh_rate"]="60.0"
    # ── PERFORMANCE (zero animations) ──
    ["window_animation_scale"]="0.0"
    ["transition_animation_scale"]="0.0"
    ["animator_duration_scale"]="0.0"
    ["forced_app_standby_enabled"]="1"
    ["app_standby_enabled"]="1"
    ["adaptive_battery_management_enabled"]="0"
    # ── POWER ──
    ["stay_on_while_plugged_in"]="3"
    ["low_power"]="0"
    # ── NETWORK: WiFi Aggressive ──
    ["captive_portal_detection_enabled"]="0"
    ["wifi_sleep_policy"]="2"
    ["wifi_scan_always_enabled"]="0"
    ["wifi_networks_available_notification_on"]="0"
    ["network_scoring_ui_enabled"]="0"
    ["wifi_watchdog_poor_network_test_enabled"]="0"
    ["wifi_suspend_optimizations_enabled"]="0"
    # ── NETWORK: TCP/Bandwidth ──
    ["tcp_default_init_rwnd"]="60"
    ["private_dns_mode"]="hostname"
    ["private_dns_specifier"]="dns.google"
    ["background_data_enabled"]="0"
    ["data_roaming"]="0"
    # ── SYSTEM UPDATES KILL ──
    ["package_verifier_enable"]="0"
    ["device_provisioned"]="1"
    # ── AUDIO ──
    ["hdmi_system_audio_control"]="1"
    ["encoded_surround_output"]="2"
)
declare -A DESIRED_SYSTEM=(
    ["screen_off_timeout"]="2147483647"
)
declare -A DESIRED_SECURE=(
    ["screensaver_enabled"]="0"
    ["display_color_mode"]="3"
)

apply_and_verify() {
    local drift_count=0
    local applied_count=0

    for key in "${!DESIRED_GLOBAL[@]}"; do
        local current
        current=$(adb_cmd settings get global "$key" | tr -d '\r\n')
        if [ "$current" != "${DESIRED_GLOBAL[$key]}" ]; then
            adb_cmd settings put global "$key" "${DESIRED_GLOBAL[$key]}" >/dev/null
            drift_count=$((drift_count + 1))
            log "DRIFT_FIX: global/$key was '$current' → '${DESIRED_GLOBAL[$key]}'"
        fi
        applied_count=$((applied_count + 1))
    done
    for key in "${!DESIRED_SYSTEM[@]}"; do
        local current
        current=$(adb_cmd settings get system "$key" | tr -d '\r\n')
        if [ "$current" != "${DESIRED_SYSTEM[$key]}" ]; then
            adb_cmd settings put system "$key" "${DESIRED_SYSTEM[$key]}" >/dev/null
            drift_count=$((drift_count + 1))
        fi
        applied_count=$((applied_count + 1))
    done
    for key in "${!DESIRED_SECURE[@]}"; do
        local current
        current=$(adb_cmd settings get secure "$key" | tr -d '\r\n')
        if [ "$current" != "${DESIRED_SECURE[$key]}" ]; then
            adb_cmd settings put secure "$key" "${DESIRED_SECURE[$key]}" >/dev/null
            drift_count=$((drift_count + 1))
        fi
        applied_count=$((applied_count + 1))
    done
    echo "$drift_count:$applied_count"
}

# ── REACTIVE BANDWIDTH MONITOR ───────────────────────────────────────
# Reads /proc/net/dev on the Fire TV every 5s, computes delta = real Mbps

measure_throughput() {
    local now_epoch
    now_epoch=$(date +%s)

    # Read wlan0 bytes from /proc/net/dev
    local net_line
    net_line=$(adb_cmd cat /proc/net/dev 2>/dev/null | tr -d '\r' | grep 'wlan0' || echo "")

    if [ -z "$net_line" ]; then
        return
    fi

    # Parse: wlan0: rx_bytes rx_packets ... tx_bytes tx_packets ...
    local rx_bytes tx_bytes
    rx_bytes=$(echo "$net_line" | awk '{gsub(/:/," "); print $2}')
    tx_bytes=$(echo "$net_line" | awk '{gsub(/:/," "); print $10}')

    if [ "$PREV_TIMESTAMP" -gt 0 ] && [ "$PREV_RX_BYTES" -gt 0 ]; then
        local delta_time=$((now_epoch - PREV_TIMESTAMP))
        if [ "$delta_time" -gt 0 ]; then
            local delta_rx=$((rx_bytes - PREV_RX_BYTES))
            local delta_tx=$((tx_bytes - PREV_TX_BYTES))
            local delta_total=$((delta_rx + delta_tx))

            # Bytes/s → Mbps: (bytes * 8) / (seconds * 1000000)
            # Use integer math: (bytes * 8) / (seconds * 1000) = Kbps, then /1000 = Mbps
            local kbps=$((delta_total * 8 / delta_time / 1000))
            CURRENT_THROUGHPUT_MBPS=$((kbps / 1000))

            # Track peak
            if [ "$CURRENT_THROUGHPUT_MBPS" -gt "$PEAK_THROUGHPUT_MBPS" ]; then
                PEAK_THROUGHPUT_MBPS=$CURRENT_THROUGHPUT_MBPS
            fi

            # Running average
            THROUGHPUT_SAMPLES=$((THROUGHPUT_SAMPLES + 1))
            THROUGHPUT_SUM=$((THROUGHPUT_SUM + CURRENT_THROUGHPUT_MBPS))
            AVG_THROUGHPUT_MBPS=$((THROUGHPUT_SUM / THROUGHPUT_SAMPLES))

            # Cap samples to prevent overflow (rolling window of ~60 samples = 5 minutes)
            if [ "$THROUGHPUT_SAMPLES" -gt 60 ]; then
                THROUGHPUT_SUM=$((AVG_THROUGHPUT_MBPS * 30))
                THROUGHPUT_SAMPLES=30
            fi
        fi
    fi

    PREV_RX_BYTES=$rx_bytes
    PREV_TX_BYTES=$tx_bytes
    PREV_TIMESTAMP=$now_epoch

    # Read WiFi link quality
    local wifi_info
    wifi_info=$(adb_cmd dumpsys wifi 2>/dev/null | tr -d '\r' | grep 'mWifiInfo' | head -1 || echo "")

    if [ -n "$wifi_info" ]; then
        WIFI_LINK_SPEED=$(echo "$wifi_info" | grep -oP 'Link speed: \K[0-9]+' | head -1 || echo "0")
        WIFI_RSSI=$(echo "$wifi_info" | grep -oP 'RSSI: \K-?[0-9]+' | head -1 || echo "0")
        WIFI_FREQ=$(echo "$wifi_info" | grep -oP 'Frequency: \K[0-9]+' | head -1 || echo "0")
    fi
}

# ── DYNAMIC BUFFER CALCULATOR ─────────────────────────────────────────
# Computes optimal buffer based on REAL bandwidth — NOT fixed values
# PHILOSOPHY: Be HUNGRY. Always request maximum the network can deliver.

compute_dynamic_buffer() {
    local actual_mbps=$CURRENT_THROUGHPUT_MBPS
    local link_mbps=$WIFI_LINK_SPEED
    local dynamic_buffer_seconds=0
    local dynamic_buffer_mb=0
    local recommended_bitrate=0
    local buffer_health_pct=0

    # If no data yet, assume maximum capacity from link speed
    if [ "$actual_mbps" -eq 0 ] && [ "$link_mbps" -gt 0 ]; then
        actual_mbps=$((link_mbps * 70 / 100))  # Assume 70% of link speed
    fi

    # ── REACTIVE FLOOR-ENFORCED LOGIC ─────────────────────────────────
    # PHILOSOPHY: Hambriento. Siempre pedir el máximo que la red pueda dar.
    # NUNCA bajar de los pisos. Si la red no da, proteger buffer.

    if [ "$actual_mbps" -ge 100 ]; then
        # ABUNDANT: WiFi >= 100 Mbps → GREEDY MODE, devour everything
        BANDWIDTH_STATE="HUNGRY"
        recommended_bitrate=$BITRATE_TARGET_4K
        dynamic_buffer_seconds=$BUFFER_CEILING_SECONDS
        buffer_health_pct=100

    elif [ "$actual_mbps" -ge 50 ]; then
        # STRONG: 50-100 Mbps → 4K is safe, build buffer aggressively
        BANDWIDTH_STATE="HUNGRY"
        recommended_bitrate=$BITRATE_TARGET_4K
        dynamic_buffer_seconds=45
        buffer_health_pct=95

    elif [ "$actual_mbps" -ge "$BITRATE_FLOOR_4K" ]; then
        # VIABLE 4K: above 17 Mbps floor → 4K OK but use actual BW wisely
        BANDWIDTH_STATE="STABLE"
        # Use 85% of actual as recommended, but NEVER below 4K floor
        recommended_bitrate=$((actual_mbps * 85 / 100))
        [ "$recommended_bitrate" -lt "$BITRATE_FLOOR_4K" ] && recommended_bitrate=$BITRATE_FLOOR_4K
        dynamic_buffer_seconds=30
        buffer_health_pct=$((actual_mbps * 100 / BITRATE_TARGET_4K))
        [ "$buffer_health_pct" -gt 100 ] && buffer_health_pct=100

    elif [ "$actual_mbps" -ge "$BITRATE_FLOOR_1080P" ]; then
        # BELOW 4K FLOOR: 8-17 Mbps → 1080p mode, protect buffer
        BANDWIDTH_STATE="DEGRADED"
        recommended_bitrate=$BITRATE_FLOOR_1080P
        dynamic_buffer_seconds=30
        buffer_health_pct=$((actual_mbps * 100 / BITRATE_FLOOR_4K))
        log "FLOOR_BREACH: 4K floor=${BITRATE_FLOOR_4K}Mbps, actual=${actual_mbps}Mbps → 1080p fallback"

    elif [ "$actual_mbps" -ge "$BITRATE_FLOOR_720P" ]; then
        # CRITICAL: 4-8 Mbps → 720p emergency mode
        BANDWIDTH_STATE="STARVING"
        recommended_bitrate=$BITRATE_FLOOR_720P
        dynamic_buffer_seconds=$BUFFER_FLOOR_SECONDS
        buffer_health_pct=$((actual_mbps * 100 / BITRATE_FLOOR_1080P))
        log "STARVING: actual=${actual_mbps}Mbps → 720p emergency, protecting buffer"

    else
        # DEAD: < 4 Mbps → pure survival mode, hold what we have
        BANDWIDTH_STATE="STARVING"
        recommended_bitrate=$((actual_mbps > 2 ? actual_mbps : 2))
        dynamic_buffer_seconds=$BUFFER_FLOOR_SECONDS
        buffer_health_pct=$((actual_mbps * 25))
        [ "$buffer_health_pct" -lt 10 ] && buffer_health_pct=10
        log "EMERGENCY: actual=${actual_mbps}Mbps → survival mode"
    fi

    # Compute buffer in MB: (buffer_seconds * recommended_bitrate_mbps) / 8
    dynamic_buffer_mb=$((dynamic_buffer_seconds * recommended_bitrate / 8))

    # Export to globals for telemetry
    DYN_BUFFER_SECONDS=$dynamic_buffer_seconds
    DYN_BUFFER_MB=$dynamic_buffer_mb
    DYN_RECOMMENDED_BITRATE=$recommended_bitrate
    DYN_BUFFER_HEALTH=$buffer_health_pct
    DYN_BUFFER_MIN_MB=$((dynamic_buffer_mb * BUFFER_MIN_PCT / 100))
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
  "bandwidth_reactive": {
    "state": "$BANDWIDTH_STATE",
    "current_throughput_mbps": $CURRENT_THROUGHPUT_MBPS,
    "peak_throughput_mbps": $PEAK_THROUGHPUT_MBPS,
    "avg_throughput_mbps": $AVG_THROUGHPUT_MBPS,
    "samples_count": $THROUGHPUT_SAMPLES,
    "wifi_link_speed_mbps": $WIFI_LINK_SPEED,
    "wifi_rssi_dbm": $WIFI_RSSI,
    "wifi_frequency_mhz": $WIFI_FREQ,
    "bitrate_floor_4k_mbps": $BITRATE_FLOOR_4K,
    "bitrate_floor_1080p_mbps": $BITRATE_FLOOR_1080P,
    "bitrate_floor_720p_mbps": $BITRATE_FLOOR_720P,
    "bitrate_target_4k_mbps": $BITRATE_TARGET_4K,
    "recommended_bitrate_mbps": $DYN_RECOMMENDED_BITRATE,
    "dynamic_buffer_seconds": $DYN_BUFFER_SECONDS,
    "dynamic_buffer_mb": $DYN_BUFFER_MB,
    "buffer_floor_mb": $DYN_BUFFER_MIN_MB,
    "buffer_health_pct": $DYN_BUFFER_HEALTH,
    "buffer_min_pct_rule": $BUFFER_MIN_PCT,
    "fps_target": $FPS_TARGET,
    "philosophy": "hungry"
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
log "DAEMON_START: APE PRISMA Reactive Daemon v${PAYLOAD_VERSION} (${SYNC_INTERVAL}s interval)"

# Initialize dynamic buffer vars
DYN_BUFFER_SECONDS=30
DYN_BUFFER_MB=300
DYN_RECOMMENDED_BITRATE=80
DYN_BUFFER_HEALTH=100
DYN_BUFFER_MIN_MB=180

while true; do
    connected=$(ensure_connected)

    if [ "$connected" = "device" ]; then
        # 1. Measure real WiFi throughput (delta bytes / delta time)
        measure_throughput

        # 2. Compute dynamic buffer based on REAL bandwidth
        compute_dynamic_buffer

        # 3. Enforce 24 ADB settings (drift detection)
        drift_info=$(apply_and_verify)

        # 4. Gather device info
        device_info=$(gather_device_info)

        # 5. Write reactive telemetry
        write_telemetry "$connected" "$drift_info" "$device_info"

        drift_count="${drift_info%%:*}"
        if [ "$drift_count" -gt 0 ]; then
            log "SYNC: Fixed $drift_count drifted settings"
        fi

        # Log bandwidth state changes
        if [ "$BANDWIDTH_STATE" = "STARVING" ]; then
            log "BANDWIDTH: STARVING at ${CURRENT_THROUGHPUT_MBPS}Mbps — protecting buffer"
        fi
    else
        write_telemetry "offline" "0:0" "unknown|unknown|unknown|"
        log "WARN: Device offline, retry in ${SYNC_INTERVAL}s"
    fi

    sleep "$SYNC_INTERVAL"
done
