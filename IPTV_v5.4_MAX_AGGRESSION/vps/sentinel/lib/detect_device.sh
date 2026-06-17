#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE SENTINEL — Device Detection Helper
# Detects the device brand, model, and platform (Fire TV vs. ONN 4K vs. Generic)
# via ADB properties.
#
# Usage: source detect_device.sh <device_ip:port>
# ══════════════════════════════════════════════════════════════════════════

# If not sourced, allow running as standalone script
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    set -euo pipefail
    STANDALONE=true
else
    STANDALONE=false
fi

ADB_TARGET="${1:-10.200.0.3:5555}"

# Get system properties via ADB
get_adb_prop() {
    local prop="$1"
    # Execute adb shell getprop with timeout and strip carriage returns
    adb -s "$ADB_TARGET" shell getprop "$prop" 2>/dev/null | tr -d '\r\n' || echo ""
}

# Ensure device is connected before querying
if ! adb -s "$ADB_TARGET" get-state &>/dev/null; then
    if [ "$STANDALONE" = true ]; then
        echo '{"status":"error","message":"device disconnected"}'
        exit 1
    else
        DEVICE_BRAND="unknown"
        DEVICE_MODEL="unknown"
        DEVICE_DEVICE=""
        DEVICE_SDK=""
        DEVICE_PLATFORM="generic"
        return 0
    fi
fi

# Query properties
DEVICE_BRAND=$(get_adb_prop "ro.product.brand")
DEVICE_MODEL=$(get_adb_prop "ro.product.model")
DEVICE_DEVICE=$(get_adb_prop "ro.product.device")
DEVICE_SDK=$(get_adb_prop "ro.build.version.sdk")

# Determine platform mapping
DEVICE_PLATFORM="generic"

# Detect Amazon Fire TV Devices
if [[ "$DEVICE_BRAND" =~ [Aa]mazon ]] || [[ "$DEVICE_MODEL" =~ ^AFT ]] || [[ "$DEVICE_DEVICE" =~ ^aft ]]; then
    DEVICE_PLATFORM="firetv"
# Detect Walmart ONN 4K Box Devices
elif [[ "$DEVICE_BRAND" =~ [Oo]nn ]] || [[ "$DEVICE_MODEL" =~ [Oo]nn ]] || [[ "$DEVICE_DEVICE" =~ ^onn ]]; then
    DEVICE_PLATFORM="onn_4k"
# Fallback detections based on build fingerprint or specific hardware characteristics
elif [[ "$(get_adb_prop "ro.build.fingerprint")" =~ [Aa]mazon ]] || [[ "$(get_adb_prop "ro.build.fingerprint")" =~ [Oo]nn ]]; then
    if [[ "$(get_adb_prop "ro.build.fingerprint")" =~ [Aa]mazon ]]; then
        DEVICE_PLATFORM="firetv"
    else
        DEVICE_PLATFORM="onn_4k"
    fi
fi

# Print JSON if running standalone
if [ "$STANDALONE" = true ]; then
    echo "{"
    echo "  \"brand\": \"$DEVICE_BRAND\","
    echo "  \"model\": \"$DEVICE_MODEL\","
    echo "  \"device\": \"$DEVICE_DEVICE\","
    echo "  \"sdk\": \"$DEVICE_SDK\","
    echo "  \"platform\": \"$DEVICE_PLATFORM\""
    echo "}"
fi
