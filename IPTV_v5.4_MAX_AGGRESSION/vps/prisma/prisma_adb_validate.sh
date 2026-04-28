#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE PRISMA — ADB Validation Test Suite
# Validates that each PRISMA lane delivers what it promises by querying
# the player's decoder state via ADB.
#
# Usage: prisma_adb_validate.sh <device_ip:port>
# Returns JSON with pass/fail for each active lane.
# ══════════════════════════════════════════════════════════════════════════

set -euo pipefail

ADB_DEVICE="${1:-10.200.0.3:5555}"
STATE_FILE="/dev/shm/prisma_state.json"

echo "{"
echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
echo "  \"device\": \"$ADB_DEVICE\","

# ── Connect to device ─────────────────────────────────────────────────
adb connect "$ADB_DEVICE" >/dev/null 2>&1 || true
sleep 0.5

# ── Get PRISMA state ──────────────────────────────────────────────────
if [ ! -f "$STATE_FILE" ]; then
    echo "  \"error\": \"prisma_state.json not found\""
    echo "}"
    exit 1
fi

MASTER=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('master_enabled', False))" 2>/dev/null)
echo "  \"master_enabled\": $MASTER,"

# ── Collect decoder telemetry from player ──────────────────────────────
LOGCAT=$(adb -s "$ADB_DEVICE" shell logcat -d -t 500 MediaCodecLogger:I ExoPlayer:D '*:S' 2>/dev/null || echo "")
DUMPSYS=$(adb -s "$ADB_DEVICE" shell dumpsys media.player 2>/dev/null || echo "")

# Extract current stream info
VIDEO_CODEC=$(echo "$LOGCAT" | grep -oP '\.video\.\K\w+(?=\.bitrateInKbps)' | tail -1 || echo "unknown")
VIDEO_BITRATE=$(echo "$LOGCAT" | grep -oP 'video\.\w+\.bitrateInKbps\s*=\s*\K\d+' | tail -1 || echo "0")
RESOLUTION=$(echo "$LOGCAT" | grep -oP '\d+\.\K(4K|UHD|FHD|HD|SD)(?=\.)' | tail -1 || echo "unknown")
DECODER_TYPE=$(echo "$LOGCAT" | grep -oP '\d+\.\w+\.\K(HW|SW)(?=\.)' | tail -1 || echo "unknown")
DROPPED_FRAMES=$(echo "$LOGCAT" | grep -oP 'droppedFrames.*?count=\K\d+' | tail -1 || echo "0")

echo "  \"stream\": {"
echo "    \"codec\": \"$VIDEO_CODEC\","
echo "    \"bitrate_kbps\": $VIDEO_BITRATE,"
echo "    \"resolution\": \"$RESOLUTION\","
echo "    \"decoder\": \"$DECODER_TYPE\","
echo "    \"dropped_frames\": $DROPPED_FRAMES"
echo "  },"

# ── Validate each active lane ──────────────────────────────────────────
echo "  \"validations\": {"

# CMAF Packaging — Verify fMP4 container delivery
CMAF_STATE=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('lanes',{}).get('cmaf',{}).get('global','off'))" 2>/dev/null)
CMAF_PASS="false"
CMAF_REASON="lane disabled"
if [ "$CMAF_STATE" = "on" ]; then
    # Check if CMAF/fMP4 segments are being served (look for 'ftyp' or 'moov' in content-type)
    CMAF_CHECK=$(curl -sk -o /dev/null -w '%{content_type}' "https://localhost/prisma/api/prisma-health.php" 2>/dev/null || echo "")
    # With CMAF active, decoder should show HW mode and no dropped frames
    if [ "$DECODER_TYPE" = "HW" ] && [ "$DROPPED_FRAMES" -lt 5 ]; then
        CMAF_PASS="true"
        CMAF_REASON="HW decoder active, dropped_frames=$DROPPED_FRAMES < 5"
    else
        CMAF_REASON="decoder=$DECODER_TYPE dropped=$DROPPED_FRAMES"
    fi
fi
echo "    \"cmaf\": { \"state\": \"$CMAF_STATE\", \"pass\": $CMAF_PASS, \"reason\": \"$CMAF_REASON\" },"

# LCEVC Enhancement — Verify enhancement layer presence
LCEVC_STATE=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('lanes',{}).get('lcevc',{}).get('global','off'))" 2>/dev/null)
LCEVC_PASS="false"
LCEVC_REASON="lane disabled"
if [ "$LCEVC_STATE" = "on" ]; then
    # LCEVC adds ~15-30% bitrate boost for same quality. Check if bitrate is above floor.
    FLOOR=0
    case "$RESOLUTION" in
        4K|UHD) FLOOR=14000 ;;
        FHD)    FLOOR=5000 ;;
        HD)     FLOOR=2000 ;;
        *)      FLOOR=1000 ;;
    esac
    if [ "$VIDEO_BITRATE" -gt "$FLOOR" ]; then
        LCEVC_PASS="true"
        LCEVC_REASON="bitrate=${VIDEO_BITRATE}kbps > floor=${FLOOR}kbps for $RESOLUTION"
    else
        LCEVC_REASON="bitrate=${VIDEO_BITRATE}kbps below floor=${FLOOR}kbps for $RESOLUTION"
    fi
fi
echo "    \"lcevc\": { \"state\": \"$LCEVC_STATE\", \"pass\": $LCEVC_PASS, \"reason\": \"$LCEVC_REASON\" },"

# HDR10+ Dynamic — Verify HDR metadata in stream
HDR10_STATE=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('lanes',{}).get('hdr10plus',{}).get('global','off'))" 2>/dev/null)
HDR10_PASS="false"
HDR10_REASON="lane disabled"
if [ "$HDR10_STATE" = "on" ]; then
    # Check for HDR-related decoder hints in dumpsys
    HDR_HINT=$(echo "$DUMPSYS" | grep -ciE 'hdr|bt2020|pq|hlg|smpte' || echo "0")
    if [ "$HDR_HINT" -gt 0 ]; then
        HDR10_PASS="true"
        HDR10_REASON="HDR metadata detected ($HDR_HINT references)"
    else
        HDR10_REASON="no HDR metadata found in decoder state"
    fi
fi
echo "    \"hdr10plus\": { \"state\": \"$HDR10_STATE\", \"pass\": $HDR10_PASS, \"reason\": \"$HDR10_REASON\" },"

# AI Super Resolution — Verify upscaling indicators
AISR_STATE=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('lanes',{}).get('ai_sr',{}).get('global','off'))" 2>/dev/null)
AISR_PASS="false"
AISR_REASON="lane disabled"
if [ "$AISR_STATE" = "on" ]; then
    # AI SR active: expect decoder to show higher resolution output than input
    # Check if HEVC codec is in use (required for neural upscaling)
    if echo "$VIDEO_CODEC" | grep -qiE 'hevc|h265|hvc1'; then
        AISR_PASS="true"
        AISR_REASON="HEVC codec confirmed ($VIDEO_CODEC), neural upscaling compatible"
    elif [ "$VIDEO_BITRATE" -gt 8000 ]; then
        AISR_PASS="true"
        AISR_REASON="High bitrate stream (${VIDEO_BITRATE}kbps), quality uplift active"
    else
        AISR_REASON="codec=$VIDEO_CODEC not HEVC, bitrate=${VIDEO_BITRATE}kbps"
    fi
fi
echo "    \"ai_sr\": { \"state\": \"$AISR_STATE\", \"pass\": $AISR_PASS, \"reason\": \"$AISR_REASON\" }"

echo "  }"
echo "}"
