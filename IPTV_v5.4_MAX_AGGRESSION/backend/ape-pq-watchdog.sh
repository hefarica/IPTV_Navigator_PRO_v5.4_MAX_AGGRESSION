#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# APE PQ WATCHDOG — VPS-side Guardian Monitor for ONN 4K
# ═══════════════════════════════════════════════════════════════════
# Runs via cron every 5 minutes on the VPS.
# Connects to ONN 4K via Xray tunnel (ADB over network).
# If Guardian daemon is dead (e.g., after reboot), restarts it.
# Reports status to PHP heartbeat endpoint.
# ═══════════════════════════════════════════════════════════════════

# Config — update ONN_IP when Xray tunnel is configured
ONN_IP="10.200.0.28:5555"  # ONN 4K via Xray/WireGuard tunnel
VPS_HEARTBEAT="https://localhost/ape-pq-heartbeat.php"
LOG="/var/log/ape-pq-watchdog.log"
GUARDIAN_SCRIPT="/data/local/tmp/ape-pq-guardian.sh"

log() {
    echo "[$(date -Iseconds)] $1" >> "$LOG"
}

# ── Step 1: Try ADB connect ────────────────────────────────────
adb connect "$ONN_IP" > /dev/null 2>&1
sleep 1

DEVICE_STATE=$(adb -s "$ONN_IP" get-state 2>/dev/null)
if [ "$DEVICE_STATE" != "device" ]; then
    log "OFFLINE: ONN 4K not reachable at $ONN_IP (state=$DEVICE_STATE)"
    # Send offline heartbeat
    PAYLOAD='{"device":"onn4k","guardian":"offline","aisr":"?","aipq":"?","hdr":"?","ts":"'$(date -Iseconds)'"}'
    curl -sk -X POST -H 'Content-Type: application/json' -d "$PAYLOAD" "$VPS_HEARTBEAT" > /dev/null 2>&1
    exit 0
fi

# ── Step 2: Check if Guardian daemon is alive ──────────────────
LOCK_PID=$(adb -s "$ONN_IP" shell "cat /data/local/tmp/ape-pq-guardian.lock 2>/dev/null" | tr -d '\r\n')
DAEMON_ALIVE=false

if echo "$LOCK_PID" | grep -qE '^[0-9]+$'; then
    PROC_CHECK=$(adb -s "$ONN_IP" shell "kill -0 $LOCK_PID 2>/dev/null; echo \$?" | tr -d '\r\n')
    if [ "$PROC_CHECK" = "0" ]; then
        DAEMON_ALIVE=true
    fi
fi

GUARDIAN_STATUS="alive"

# ── Step 3: Resurrect if dead ──────────────────────────────────
if [ "$DAEMON_ALIVE" = false ]; then
    log "REBOOT DETECTED: Guardian dead. Restarting..."
    GUARDIAN_STATUS="resurrected"

    # Clean stale lock
    adb -s "$ONN_IP" shell "rm -f /data/local/tmp/ape-pq-guardian.lock" 2>/dev/null

    # Check script exists
    SCRIPT_EXISTS=$(adb -s "$ONN_IP" shell "test -f $GUARDIAN_SCRIPT; echo \$?" | tr -d '\r\n')
    if [ "$SCRIPT_EXISTS" != "0" ]; then
        log "CRITICAL: Guardian script missing! Re-pushing..."
        adb -s "$ONN_IP" push /opt/netshield/ape-pq-guardian.sh "$GUARDIAN_SCRIPT" 2>/dev/null
        adb -s "$ONN_IP" shell "chmod 755 $GUARDIAN_SCRIPT" 2>/dev/null
    fi

    # Start daemon
    adb -s "$ONN_IP" shell "nohup $GUARDIAN_SCRIPT daemon > /dev/null 2>&1 &" 2>/dev/null
    sleep 3

    # Verify
    NEW_PID=$(adb -s "$ONN_IP" shell "cat /data/local/tmp/ape-pq-guardian.lock 2>/dev/null" | tr -d '\r\n')
    if echo "$NEW_PID" | grep -qE '^[0-9]+$'; then
        log "RESURRECTED: Guardian started (PID $NEW_PID)"
    else
        log "FAILED: Could not start Guardian"
        GUARDIAN_STATUS="failed"
    fi
else
    log "OK: Guardian alive (PID $LOCK_PID)"
fi

# ── Step 4: Read current settings ─────────────────────────────
AISR=$(adb -s "$ONN_IP" shell "settings get global aisr_enable" | tr -d '\r\n')
AIPQ=$(adb -s "$ONN_IP" shell "settings get global aipq_enable" | tr -d '\r\n')
HDR=$(adb -s "$ONN_IP" shell "settings get global always_hdr" | tr -d '\r\n')

# ── Step 5: Send heartbeat to PHP ─────────────────────────────
PAYLOAD='{"device":"onn4k","guardian":"'"$GUARDIAN_STATUS"'","aisr":"'"$AISR"'","aipq":"'"$AIPQ"'","hdr":"'"$HDR"'","ts":"'$(date -Iseconds)'"}'
curl -sk -X POST -H 'Content-Type: application/json' -d "$PAYLOAD" "$VPS_HEARTBEAT" > /dev/null 2>&1

log "HEARTBEAT: guardian=$GUARDIAN_STATUS aisr=$AISR aipq=$AIPQ hdr=$HDR"

# Trim log to 200 lines
if [ -f "$LOG" ]; then
    LINES=$(wc -l < "$LOG")
    if [ "$LINES" -gt 500 ]; then
        tail -200 "$LOG" > "${LOG}.tmp"
        mv "${LOG}.tmp" "$LOG"
    fi
fi
