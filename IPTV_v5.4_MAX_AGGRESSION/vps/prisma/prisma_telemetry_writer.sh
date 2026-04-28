#!/bin/bash
# APE PRISMA — ADB Telemetry Writer
# Reads player state via ADB and writes to /dev/shm for health endpoint
# Run via cron every 10s or on-demand
DEVICE="${1:-10.200.0.3:5555}"
OUT="/dev/shm/prisma_player_telemetry.json"

adb connect "$DEVICE" >/dev/null 2>&1
LOGCAT=$(adb -s "$DEVICE" shell logcat -d -t 500 MediaCodecLogger:I ExoPlayer:D '*:S' 2>/dev/null)

# Parse video line: PID.RES.HW|SW.decoder.video.CODEC.bitrateInKbps = VALUE
VIDEO_LINE=$(echo "$LOGCAT" | grep -E 'video\.\w+\.bitrateInKbps' | tail -1)

CODEC="unknown"
BITRATE=0
RESOLUTION="unknown"
DECODER="unknown"
BUFFER=0
DROPPED=0

if [ -n "$VIDEO_LINE" ]; then
    CODEC=$(echo "$VIDEO_LINE" | grep -oP '\.video\.\K\w+(?=\.bitrateInKbps)' 2>/dev/null || true)
    BITRATE=$(echo "$VIDEO_LINE" | grep -oP 'bitrateInKbps\s*=\s*\K\d+' 2>/dev/null || true)
    RESOLUTION=$(echo "$VIDEO_LINE" | grep -oP '\d+\.\K(4K|UHD|FHD|HD|SD)(?=\.)' 2>/dev/null || true)
    DECODER=$(echo "$VIDEO_LINE" | grep -oP '\d+\.\w+\.\K(HW|SW)(?=\.)' 2>/dev/null || true)
fi

BUF_RAW=$(echo "$LOGCAT" | grep -oP 'bufferedDurationUs=\K\d+' | tail -1 2>/dev/null || true)
DROP_RAW=$(echo "$LOGCAT" | grep -oP 'droppedFrames.*?count=\K\d+' | tail -1 2>/dev/null || true)

[ -n "$BUF_RAW" ] && BUFFER="$BUF_RAW"
[ -n "$DROP_RAW" ] && DROPPED="$DROP_RAW"
[ -z "$CODEC" ] && CODEC="unknown"
[ -z "$BITRATE" ] && BITRATE=0
[ -z "$RESOLUTION" ] && RESOLUTION="unknown"
[ -z "$DECODER" ] && DECODER="unknown"

BUF_MS=$((BUFFER / 1000))

TMP=$(mktemp /dev/shm/pt_XXXXXX)
cat > "$TMP" << ENDJSON
{
  "ts": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "codec": "$CODEC",
  "resolution": "$RESOLUTION",
  "bitrate_kbps": $BITRATE,
  "decoder_type": "$DECODER",
  "buffer_us": $BUFFER,
  "buffer_ms": $BUF_MS,
  "dropped_frames": $DROPPED
}
ENDJSON
mv "$TMP" "$OUT"
echo "TELEMETRY_WRITTEN: codec=$CODEC res=$RESOLUTION br=${BITRATE}Kbps dec=$DECODER buf=${BUF_MS}ms drop=$DROPPED"
