#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# APE Telemetry — Enable MediaCodec Logging on Player Device
# Forces ExoPlayer and MediaCodec to emit detailed telemetry via logcat
# ═══════════════════════════════════════════════════════════════════════════════
# Usage: bash enable-mediacodec-log.sh <DEVICE_ADDRESS>
#   DEVICE_ADDRESS: ADB address (e.g., 192.168.1.100:5555 or 10.200.0.3:5555)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

DEVICE="${1:-}"

if [[ -z "$DEVICE" ]]; then
    echo "Usage: bash enable-mediacodec-log.sh <DEVICE_ADDRESS>"
    echo "  e.g.: bash enable-mediacodec-log.sh 192.168.1.100:5555"
    exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo " Enabling MediaCodec & ExoPlayer Logging on $DEVICE"
echo "═══════════════════════════════════════════════════════════════"

# Verify connection
adb -s "$DEVICE" shell echo "CONNECTED" || { echo "ERROR: Cannot reach $DEVICE"; exit 1; }

echo ""
echo "[1/5] Setting logcat buffer to 4MB..."
adb -s "$DEVICE" logcat -G 4M 2>/dev/null || true

echo "[2/5] Enabling MediaCodec debug output..."
adb -s "$DEVICE" shell setprop debug.stagefright.omx_debug_level 1
adb -s "$DEVICE" shell setprop debug.media.codec.log 1

echo "[3/5] Enabling ExoPlayer verbose logging..."
# These properties enable more detailed output from ExoPlayer internals
adb -s "$DEVICE" shell setprop log.tag.ExoPlayer D
adb -s "$DEVICE" shell setprop log.tag.ExoPlayerImpl D
adb -s "$DEVICE" shell setprop log.tag.MediaCodecLogger I
adb -s "$DEVICE" shell setprop log.tag.MediaCodecVideoRenderer D
adb -s "$DEVICE" shell setprop log.tag.MediaCodecAudioRenderer D

echo "[4/5] Clearing old logcat buffer..."
adb -s "$DEVICE" logcat -c 2>/dev/null || true

echo "[5/5] Verifying — sampling logcat (10 seconds)..."
echo "      Start playing a channel now if not already playing..."
echo ""

# Sample for 10 seconds with relevant tags
timeout 10 adb -s "$DEVICE" shell logcat -s \
    ExoPlayer:D \
    ExoPlayerImpl:D \
    MediaCodecLogger:I \
    MediaCodecVideoRenderer:D \
    MediaCodecAudioRenderer:D \
    2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " ✅ MediaCodec logging enabled on $DEVICE"
echo ""
echo " The Guardian daemon will now capture:"
echo "   - Codec type (AVC/HEVC)"
echo "   - Resolution (SD/HD/FHD/4K)"
echo "   - Bitrate (Kbps)"
echo "   - Decoder type (HW/SW)"
echo "   - Dropped frames count"
echo "   - Buffer duration (μs)"
echo "   - Audio underruns"
echo ""
echo " Note: These settings persist until device reboot."
echo "       Re-run this script after each reboot."
echo "═══════════════════════════════════════════════════════════════"
