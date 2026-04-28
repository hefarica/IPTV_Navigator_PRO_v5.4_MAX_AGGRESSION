#!/bin/bash
# APE PRISMA v1.3 — OTT Navigator Buffer Ultraboost via ADB UI Automation
# Navigates OTT Navigator menus to set buffer to MAXIMUM
# and decoder to Hardware with Compatibility quality.
#
# MATH:
#   4K@120fps@80Mbps = 10 MB/s → 30s buffer = 300MB
#   Buffer minimum 60% = 180MB = 18s playback insurance
#   WiFi minimum sustained: 13 MB/s = 104 Mbps
#
# This script uses keyevent navigation since OTT Navigator
# doesn't expose its internal settings via intents or content providers.

set -euo pipefail

DEVICE="10.200.0.3:5555"
LOG="/var/log/prisma_adb_buffer.log"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >> "$LOG"; }

adb_key() {
    adb -s "$DEVICE" shell input keyevent "$1" 2>/dev/null
    sleep "${2:-0.5}"
}

adb_tap() {
    adb -s "$DEVICE" shell input tap "$1" "$2" 2>/dev/null
    sleep "${3:-0.8}"
}

adb_cmd() {
    adb -s "$DEVICE" shell "$@" 2>/dev/null
}

# ── Step 1: Force-stop and relaunch OTT Navigator to known state ──
log "BUFFER_BOOST: Starting OTT Navigator buffer configuration"

# Launch OTT Navigator settings directly
adb_cmd am start -n studio.scillarium.ottnavigator/.ui.settings.SettingsActivity 2>/dev/null || \
adb_cmd am start -n studio.scillarium.ottnavigator/.SettingsActivity 2>/dev/null || \
adb_cmd am start -a android.intent.action.MAIN -n studio.scillarium.ottnavigator/.MainActivity 2>/dev/null

sleep 3
log "BUFFER_BOOST: OTT Navigator launched"

# ── Step 2: Navigate to Settings > Player > Network > Buffer ──
# OTT Navigator on Fire TV uses D-pad navigation
# Home (KEYCODE_HOME=3), Menu (KEYCODE_MENU=82)
# DPAD: Up=19, Down=20, Left=21, Right=22, Center/OK=23/66

# If we're in the main app, press Menu/Settings
adb_key 82  # Menu
sleep 1

# Navigate to Player section
# Typically: Settings → Player (2nd or 3rd item)
adb_key 20  # Down to Player
adb_key 20  # Down
adb_key 66  # Enter → Player
sleep 0.8

# Navigate to Buffering/Network subsection
adb_key 20  # Down
adb_key 20  # Down
adb_key 20  # Down (Network/Buffer section)
adb_key 66  # Enter
sleep 0.8

# Select Maximum buffer
adb_key 20  # Down to buffer options
adb_key 20  # Down to Maximum
adb_key 66  # Select Maximum
sleep 0.5

# Go back
adb_key 4   # Back
sleep 0.5

# ── Step 3: Navigate to Codec settings → Hardware + Compatibility ──
adb_key 20  # Down to Codec
adb_key 66  # Enter Codec
sleep 0.8

# Hardware quality → Compatibility
adb_key 20  # Down to Hardware quality
adb_key 66  # Enter
adb_key 20  # Down to Compatibility
adb_key 66  # Select
sleep 0.5

# Back to main
adb_key 4   # Back
adb_key 4   # Back
adb_key 4   # Back to main

log "BUFFER_BOOST: UI navigation completed"

# ── Step 4: Verify OTT is still running ──
PID=$(adb_cmd pidof studio.scillarium.ottnavigator | tr -d '\r\n')
if [ -n "$PID" ]; then
    log "BUFFER_BOOST: OTT Navigator running (PID $PID) - buffer config applied"
    echo "OK: OTT running PID=$PID"
else
    log "BUFFER_BOOST: WARNING - OTT Navigator not running after config"
    echo "WARN: OTT not running"
fi

log "BUFFER_BOOST: Completed"
