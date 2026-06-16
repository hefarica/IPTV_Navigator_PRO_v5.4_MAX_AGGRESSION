#!/usr/bin/env bash
# ============================================================================
# adb-conviva-push.sh — Fire TV logcat -> QoE -> POST URL-2 (conviva-event)
# ----------------------------------------------------------------------------
# LA VIA MAS DIRECTA (sin WireGuard): el host que tiene ADB al Firestick lee su
# logcat y MANDA la QoE al VPS POR URL (conviva-event.php). El VPS procesa
# (conviva_events -> D6 riskScore -> engines -> URL-2 SSE de vuelta al player).
# `adb logcat` strea­mea de forma fiable en bash (a diferencia del Popen Windows
# del agente Python), por eso esta version bash es la robusta para este setup.
#
# Uso:
#   ./adb-conviva-push.sh [device-ip:5555] [endpoint] [channel_id] [device_id]
# Env:
#   ADB_PATH   ruta a adb (default: adb en PATH, luego /c/Android/platform-tools/adb)
# Ej:
#   ./adb-conviva-push.sh 192.168.1.2:5555 \
#     https://iptv-ape.duckdns.org/prisma/api/conviva-event ADBLIVE FIRESTICK-CALI
# ============================================================================
set -u
DEV="${1:-192.168.1.2:5555}"
EP="${2:-https://iptv-ape.duckdns.org/prisma/api/conviva-event}"
CH="${3:-ADBLIVE}"
DEVID="${4:-FIRESTICK-CALI}"
ADB="${ADB_PATH:-adb}"
command -v "$ADB" >/dev/null 2>&1 || ADB="/c/Android/platform-tools/adb"
SES="adb-$(hostname 2>/dev/null || echo host)-$(date +%s)"
echo "[push] device=$DEV endpoint=$EP channel=$CH device_id=$DEVID session=$SES" >&2

post() { # $1 event_type  $2 data-json
  local ts; ts=$(( $(date +%s) * 1000 ))
  curl -s -m5 -o /dev/null -X POST -H "Content-Type: application/json" -d \
"{\"version\":\"1.0\",\"session_id\":\"$SES\",\"device_id\":\"$DEVID\",\"player\":\"OTT_Navigator\",\"channel\":{\"id\":\"$CH\",\"name\":\"$CH\",\"profile\":\"P0\"},\"event_type\":\"$1\",\"timestamp_ms\":$ts,\"data\":$2}" "$EP"
}

last=""
"$ADB" -s "$DEV" logcat -T 1 2>/dev/null | while IFS= read -r line; do
  case "$line" in
    *MediaCodecQuerier*isSupported=true*)
      cod=$(printf '%s' "$line" | grep -oE "CODECS=[A-Za-z0-9.]+" | head -1 | cut -d= -f2)
      w=$(printf '%s' "$line"   | grep -oE "WIDTH=[0-9]+"  | head -1 | cut -d= -f2)
      h=$(printf '%s' "$line"   | grep -oE "HEIGHT=[0-9]+" | head -1 | cut -d= -f2)
      br=$(printf '%s' "$line"  | grep -oE "BITRATE=[0-9]+"| head -1 | cut -d= -f2)
      [ -z "$cod" ] && continue
      sig="$cod-${w}x${h}-$br"; [ "$sig" = "$last" ] && continue; last="$sig"
      post "quality_change" "{\"codec\":\"$cod\",\"resolution\":\"${w}x${h}\",\"bitrate_bps\":${br:-0},\"hdr\":\"PQ\"}"
      echo "[push] quality_change $sig" >&2
      ;;
    *onRenderedFirstFrame*elapsed=*)
      ms=$(printf '%s' "$line" | grep -oE "elapsed=[0-9]+" | head -1 | cut -d= -f2)
      post "first_frame" "{\"startup_time_ms\":${ms:-0}}"
      echo "[push] first_frame ${ms}ms" >&2
      ;;
    *dropped*frames*)
      n=$(printf '%s' "$line" | grep -oE "dropped [0-9]+" | head -1 | grep -oE "[0-9]+")
      post "frame_drop" "{\"dropped_frames\":${n:-0}}"
      echo "[push] frame_drop ${n}" >&2
      ;;
    *ExoPlaybackException*|*PlayerError*)
      post "error" "{\"error_class\":\"ExoPlaybackException\"}"
      echo "[push] error" >&2
      ;;
  esac
done
