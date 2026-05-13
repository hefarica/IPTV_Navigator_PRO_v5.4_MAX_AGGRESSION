#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# APE Telemetry — Device Setup Script
# Prepares any Android device for ADB telemetry collection
# ═══════════════════════════════════════════════════════════════════════════════
# Usage: bash setup-device.sh <DEVICE_IP> [--player ott_navigator|tivimate]
#
# Prerequisites:
#   - ADB installed and in PATH
#   - Device has Developer Options + USB Debugging enabled
#   - Device connected to same network
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

DEVICE_IP="${1:-}"
PLAYER="${2:-ott_navigator}"
ADB_PORT=5555

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[APE-SETUP]${NC} $*"; }
warn() { echo -e "${YELLOW}[APE-SETUP]${NC} $*"; }
err()  { echo -e "${RED}[APE-SETUP]${NC} $*"; }

# ─── Validate input ──────────────────────────────────────────────────────────
if [[ -z "$DEVICE_IP" ]]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo " APE Telemetry — Device Setup"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo " Usage: bash setup-device.sh <DEVICE_IP> [PLAYER_TYPE]"
    echo ""
    echo " DEVICE_IP:   IP address of the Android device (e.g., 192.168.1.100)"
    echo " PLAYER_TYPE: ott_navigator (default) | tivimate"
    echo ""
    echo " Examples:"
    echo "   bash setup-device.sh 192.168.1.100"
    echo "   bash setup-device.sh 192.168.1.100 tivimate"
    echo ""
    echo " Prerequisites:"
    echo "   1. Go to Settings → About → tap 'Build Number' 7 times"
    echo "   2. Go to Settings → Developer Options → enable 'USB Debugging'"
    echo "   3. Go to Settings → Developer Options → enable 'ADB over network'"
    echo "      (on Fire TV: Settings → My Fire TV → Developer Options)"
    echo ""
    exit 1
fi

# ─── Check ADB is installed ─────────────────────────────────────────────────
if ! command -v adb &>/dev/null; then
    err "ADB not found in PATH"
    echo ""
    echo "Install Android Platform Tools:"
    echo "  Windows: https://developer.android.com/tools/releases/platform-tools"
    echo "  After download, add to PATH or run from the extracted folder."
    echo ""
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " APE Telemetry — Device Setup for ${DEVICE_IP}"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── Step 1: Connect to device ──────────────────────────────────────────────
log "[1/6] Connecting to ${DEVICE_IP}:${ADB_PORT}..."
CONNECT_OUT=$(adb connect "${DEVICE_IP}:${ADB_PORT}" 2>&1)
echo "      ${CONNECT_OUT}"

if echo "$CONNECT_OUT" | grep -qi "unable\|refused\|failed\|cannot"; then
    err "Failed to connect. Verify:"
    echo "  1. Device is powered on and on the same network"
    echo "  2. Developer Options → ADB over network is ENABLED"
    echo "  3. IP address ${DEVICE_IP} is correct"
    echo "  4. No firewall blocking port ${ADB_PORT}"
    exit 1
fi

sleep 2

# ─── Step 2: Verify device responds ─────────────────────────────────────────
log "[2/6] Verifying device responds..."
ALIVE=$(adb -s "${DEVICE_IP}:${ADB_PORT}" shell echo ALIVE 2>&1 || true)
if [[ "$ALIVE" != *"ALIVE"* ]]; then
    warn "Device connected but not responding."
    echo "  → Check if 'Allow USB debugging?' dialog appeared on the device screen"
    echo "  → Press 'Always allow' on the device, then re-run this script"
    exit 1
fi
log "      ✅ Device responding"

# ─── Step 3: Collect device info ─────────────────────────────────────────────
log "[3/6] Collecting device information..."
MODEL=$(adb -s "${DEVICE_IP}:${ADB_PORT}" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
BRAND=$(adb -s "${DEVICE_IP}:${ADB_PORT}" shell getprop ro.product.brand 2>/dev/null | tr -d '\r')
SDK=$(adb -s "${DEVICE_IP}:${ADB_PORT}" shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r')
ANDROID=$(adb -s "${DEVICE_IP}:${ADB_PORT}" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r')
SOC=$(adb -s "${DEVICE_IP}:${ADB_PORT}" shell getprop ro.hardware 2>/dev/null | tr -d '\r')
SERIAL=$(adb -s "${DEVICE_IP}:${ADB_PORT}" shell getprop ro.serialno 2>/dev/null | tr -d '\r')

echo ""
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │ Device Information                               │"
echo "  ├─────────────────────────────────────────────────┤"
printf "  │ Model:   %-40s│\n" "$MODEL"
printf "  │ Brand:   %-40s│\n" "$BRAND"
printf "  │ Android: %-40s│\n" "$ANDROID (SDK $SDK)"
printf "  │ SoC:     %-40s│\n" "$SOC"
printf "  │ Serial:  %-40s│\n" "$SERIAL"
printf "  │ IP:      %-40s│\n" "${DEVICE_IP}:${ADB_PORT}"
echo "  └─────────────────────────────────────────────────┘"
echo ""

# ─── Step 4: Enable MediaCodec logging ───────────────────────────────────────
log "[4/6] Enabling MediaCodecLogger for ExoPlayer telemetry..."

# Set logcat buffer size to capture more history
adb -s "${DEVICE_IP}:${ADB_PORT}" logcat -G 4M 2>/dev/null || true
log "      Buffer size set to 4MB"

# Enable MediaCodec debug output (persists across reboots on most devices)
adb -s "${DEVICE_IP}:${ADB_PORT}" shell setprop debug.stagefright.omx_debug_level 1 2>/dev/null || true
adb -s "${DEVICE_IP}:${ADB_PORT}" shell setprop debug.media.codec.log 1 2>/dev/null || true
log "      MediaCodec debug logging enabled"

# Verify ExoPlayer/MediaCodecLogger emissions are present
log "      Sampling logcat for player telemetry..."
LOGCAT_SAMPLE=$(adb -s "${DEVICE_IP}:${ADB_PORT}" shell logcat -d -t 100 -s ExoPlayer:D MediaCodecLogger:I ExoPlayerImpl:D 2>/dev/null || true)
LINE_COUNT=$(echo "$LOGCAT_SAMPLE" | grep -c -E "ExoPlayer|MediaCodec" || true)

if [[ "$LINE_COUNT" -gt 0 ]]; then
    log "      ✅ Found ${LINE_COUNT} telemetry lines — player is actively emitting"
else
    warn "     ⚠ No telemetry lines found yet."
    echo "      → This is normal if no stream is playing right now."
    echo "      → Start playing a channel on the device, then re-check with:"
    echo "        adb -s ${DEVICE_IP}:${ADB_PORT} shell logcat -d -t 50 -s ExoPlayer:D MediaCodecLogger:I"
fi

# ─── Step 5: Test network path to VPS ───────────────────────────────────────
log "[5/6] Testing network connectivity from device..."

# Check if device can reach WireGuard interface
WG_PING=$(adb -s "${DEVICE_IP}:${ADB_PORT}" shell ping -c 1 -W 3 10.200.0.1 2>/dev/null || true)
if echo "$WG_PING" | grep -q "1 received"; then
    log "      ✅ WireGuard tunnel active (device → VPS)"
else
    warn "     ⚠ WireGuard tunnel not reachable from device"
    echo "      → Ensure WireGuard is configured on the device"
    echo "      → Use the wireguard-device.conf template in this package"
fi

# ─── Step 6: Summary ────────────────────────────────────────────────────────
log "[6/6] Setup complete!"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " ✅ Device ${MODEL} (${DEVICE_IP}) is ready for telemetry"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo " Next steps:"
echo ""
echo " 1. Register this device in the VPS Guardian:"
echo "    scp add-device.sh root@178.156.147.234:/tmp/"
echo "    ssh root@178.156.147.234 \"bash /tmp/add-device.sh \\"
echo "      --name ${MODEL//[^a-zA-Z0-9]/_} \\"
echo "      --address 10.200.0.X:5555 \\"
echo "      --player ${PLAYER} \\"
echo "      --location mi_casa\""
echo ""
echo " 2. Verify telemetry flows (after 30s):"
echo "    ssh root@178.156.147.234 \"cat /dev/shm/guardian_player_state.json\""
echo ""
echo " 3. Check PRISMA receives real data:"
echo "    curl -s https://iptv-ape.duckdns.org/prisma/api/prisma-health.php | python3 -m json.tool"
echo ""
echo "═══════════════════════════════════════════════════════════════"
