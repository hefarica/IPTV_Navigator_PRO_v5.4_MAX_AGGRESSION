#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE PRISMA — ADB On-Screen Overlay Notification
# Shows a 5-second notification on the Android TV player when lanes change.
# Called by prisma-control.php after state mutations.
#
# Usage: prisma_adb_overlay.sh <device_ip:port> <action> [lane_details]
# Example: prisma_adb_overlay.sh 10.200.0.3:5555 "lane_on" "CMAF Packaging"
# ══════════════════════════════════════════════════════════════════════════

set -euo pipefail

ADB_DEVICE="${1:-10.200.0.3:5555}"
ACTION="${2:-status}"
DETAILS="${3:-}"
DISMISS_DELAY=5
TAG="prisma_overlay"

# ── Ensure ADB connection ──────────────────────────────────────────────
adb connect "$ADB_DEVICE" >/dev/null 2>&1 || true
sleep 0.3

# ── Build notification text based on action ────────────────────────────
case "$ACTION" in
    master_on)
        TITLE="⚡ APE PRISMA: ACTIVO"
        TEXT="Quality Uplift Post-Processor activado.\nTodas las lanes configuradas están procesando."
        ;;
    master_off)
        TITLE="💤 APE PRISMA: STANDBY"
        TEXT="Post-Processor en modo passthrough.\nReproducción sin filtros activos."
        ;;
    lane_on)
        TITLE="✅ PRISMA: ${DETAILS} ON"
        TEXT="${DETAILS} activado.\nMejora visual aplicándose al stream en tiempo real."
        ;;
    lane_off)
        TITLE="⏸ PRISMA: ${DETAILS} OFF"
        TEXT="${DETAILS} desactivado."
        ;;
    panic_off)
        TITLE="⛔ PRISMA: PANIC OFF"
        TEXT="Todas las lanes desactivadas por seguridad.\nReproducción en modo passthrough puro."
        ;;
    status)
        # Read current state from prisma_state.json
        STATE_FILE="/dev/shm/prisma_state.json"
        if [ -f "$STATE_FILE" ]; then
            MASTER=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print('ACTIVO' if d.get('master_enabled') else 'STANDBY')" 2>/dev/null || echo "?")
            LANES=$(python3 -c "
import json
d=json.load(open('$STATE_FILE'))
lanes=d.get('lanes',{})
parts=[]
for l in ['cmaf','lcevc','hdr10plus','ai_sr']:
    s=lanes.get(l,{}).get('global','off')
    icon='✅' if s=='on' else '⏸'
    parts.append(f'{icon} {l.upper()}: {s.upper()}')
print('\\n'.join(parts))
" 2>/dev/null || echo "Error reading state")
            TITLE="🔮 APE PRISMA: ${MASTER}"
            TEXT="$LANES"
        else
            TITLE="🔮 APE PRISMA"
            TEXT="State file not found"
        fi
        ;;
    *)
        TITLE="🔮 APE PRISMA"
        TEXT="$ACTION: $DETAILS"
        ;;
esac

# ── Send notification to Android TV ────────────────────────────────────
# Method 1: cmd notification (works on Android 8+, non-root)
adb -s "$ADB_DEVICE" shell "cmd notification post -S bigtext -t '$TITLE' '$TAG' '$TEXT'" 2>/dev/null || {
    # Method 2: Fallback to am broadcast for older devices
    adb -s "$ADB_DEVICE" shell "am broadcast -a android.intent.action.MAIN --es title '$TITLE' --es text '$TEXT'" 2>/dev/null || true
}

# ── Auto-dismiss after 5 seconds (background) ─────────────────────────
(
    sleep "$DISMISS_DELAY"
    adb -s "$ADB_DEVICE" shell "cmd notification cancel '$TAG'" 2>/dev/null || true
) &

echo "OVERLAY_SENT: $TITLE"
