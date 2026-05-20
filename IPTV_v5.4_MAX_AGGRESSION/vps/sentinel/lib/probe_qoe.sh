#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE SENTINEL — QoE and Player Telemetry Probe
# Captures frame drops, screen buffer settings, player CPU/RAM footprint,
# and link parameters. Writes output to JSON state.
#
# Usage: probe_qoe.sh <device_ip:port>
# ══════════════════════════════════════════════════════════════════════════

set -euo pipefail

ADB_TARGET="${1:-10.200.0.3:5555}"
STATE_DIR="/opt/netshield/state"
QOE_FILE="${STATE_DIR}/sentinel_qoe.json"

mkdir -p "$STATE_DIR"

# Ensure device is active
if ! adb -s "$ADB_TARGET" get-state &>/dev/null; then
    echo "{" > "$QOE_FILE"
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"status\": \"error\","
    echo "  \"message\": \"device disconnected\""
    echo "}" >> "$QOE_FILE"
    exit 1
fi

echo "[PROBE_QOE] Commencing QoE assessment on $ADB_TARGET..."

# ── 1. Check Player Processes ──────────────────────────────────────────
PLAYER_PKG="none"
PLAYER_STATUS="stopped"
PLAYER_PID=""
PLAYER_CPU=0
PLAYER_RAM_KB=0

if adb -s "$ADB_TARGET" shell "pidof studio.scillarium.ottnavigator" &>/dev/null; then
    PLAYER_PKG="studio.scillarium.ottnavigator"
    PLAYER_STATUS="running"
elif adb -s "$ADB_TARGET" shell "pidof ar.tvplayer.tv" &>/dev/null; then
    PLAYER_PKG="ar.tvplayer.tv"
    PLAYER_STATUS="running"
fi

# Gather player performance details if active
if [ "$PLAYER_STATUS" = "running" ]; then
    PLAYER_PID=$(adb -s "$ADB_TARGET" shell "pidof $PLAYER_PKG" 2>/dev/null | tr -d '\r\n')
    
    # Process CPU usage via top (run 1 iteration, grep package, take CPU column)
    # Output format varies, but usually CPU% is in col 9 or col 5 of top. We parse safely.
    PLAYER_CPU=$(adb -s "$ADB_TARGET" shell "top -n 1 -b" 2>/dev/null | grep "$PLAYER_PKG" | awk '{print $9}' | head -1 | tr -d '\r\n' || echo "0")
    # Clean non-numeric characters (like % signs)
    PLAYER_CPU=$(echo "$PLAYER_CPU" | sed 's/[^0-9.]//g')
    [ -z "$PLAYER_CPU" ] && PLAYER_CPU=0

    # Process RAM footprint via dumpsys meminfo TOTAL
    PLAYER_RAM_KB=$(adb -s "$ADB_TARGET" shell "dumpsys meminfo $PLAYER_PKG" 2>/dev/null | grep "TOTAL" | head -1 | awk '{print $2}' | tr -d '\r\n' || echo "0")
    [ -z "$PLAYER_RAM_KB" ] && PLAYER_RAM_KB=0
fi

# ── 2. Screen & Window Configuration ───────────────────────────────────
WM_SIZE=$(adb -s "$ADB_TARGET" shell "wm size" 2>/dev/null | grep -oE '[0-9]+x[0-9]+' || echo "unknown")
WM_DENSITY=$(adb -s "$ADB_TARGET" shell "wm density" 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")

# ── 3. Frame Drops & Playback Stats ────────────────────────────────────
# Collect logcat lines from ExoPlayer or MediaCodec
LOGCAT=$(adb -s "$ADB_TARGET" shell "logcat -d -t 300 ExoPlayer:D MediaCodecLogger:I *:S" 2>/dev/null || echo "")
DROPPED_FRAMES=0
if [ -n "$LOGCAT" ]; then
    # Parse dropped frames pattern: "droppedFrames count=X" or "Dropped frames: X"
    DROPPED_FRAMES=$(echo "$LOGCAT" | grep -oP '(droppedFrames.*?count=|Dropped\s+frames:\s*)\K\d+' | tail -1 || echo "0")
fi

# ── 4. Network Metrics (from box perspective) ──────────────────────────
# Ping to VPS VPN gateway 10.200.0.1
PING_STATS=$(adb -s "$ADB_TARGET" shell "ping -c 3 -W 1 10.200.0.1 2>&1" || echo "")
PING_LOSS=$(echo "$PING_STATS" | grep -oE '[0-9]+% packet loss' | grep -oE '[0-9]+' || echo "100")
PING_AVG_MS=$(echo "$PING_STATS" | grep -E 'rtt|min/avg/max' | awk -F'/' '{print $5}' | cut -d. -f1 || echo "999")

# Write out JSON QoE state
cat <<EOF > "$QOE_FILE"
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "device": "${ADB_TARGET}",
  "screen": {
    "size": "${WM_SIZE}",
    "density_dpi": ${WM_DENSITY}
  },
  "player": {
    "package": "${PLAYER_PKG}",
    "status": "${PLAYER_STATUS}",
    "pid": "${PLAYER_PID}",
    "cpu_pct": ${PLAYER_CPU},
    "ram_kb": ${PLAYER_RAM_KB}
  },
  "metrics": {
    "dropped_frames_300s": ${DROPPED_FRAMES},
    "tunnel_ping_loss_pct": ${PING_LOSS},
    "tunnel_ping_avg_ms": ${PING_AVG_MS}
  }
}
EOF

echo "[PROBE_QOE] QoE state captured in $QOE_FILE"
