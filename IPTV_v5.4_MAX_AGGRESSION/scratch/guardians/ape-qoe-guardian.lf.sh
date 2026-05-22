#!/system/bin/sh
# ===================================================================
# APE QoE GUARDIAN v1.1 (OBSERVE) - 3rd guardian for ONN 4K
# ===================================================================
# Companion to ape-pq-guardian (picture quality) + ape-ram-guardian (RAM).
# Carries the QoE/quality loop DATA straight from the PLAYER spine, because
# the stream goes Fire TV -> Xray(freedom) -> direct, never through nginx.
# Reads REAL QoE from the active player (OTT Navigator / ExoPlayer) logcat.
#
# v1.1: judder is now TIME-NORMALIZED (events/sec + % of frames) instead of a
#       raw window count -> interpretable scale. Lock moved into the daemon path
#       so status/stop work even while the daemon runs.
#
# PHASE 1 = OBSERVE-ONLY (APPLY_MODE=0): reads + records, changes nothing.
# POSIX sh (Android). Single-instance, self-trimming log.
# ===================================================================

LOG_FILE="/data/local/tmp/ape-qoe-guardian.log"
LOCK_FILE="/data/local/tmp/ape-qoe-guardian.lock"
STATE_FILE="/data/local/tmp/ape-qoe-state.json"
PLAYER_PKG="studio.scillarium.ottnavigator"
CHECK_INTERVAL=30
APPLY_MODE=0   # Phase 2 flips to 1 (after user arms it)

log() {
    ts=$(date '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo now)
    echo "[$ts] $1" >> "$LOG_FILE" 2>/dev/null
    echo "[$ts] $1"
}

acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        OLD_PID=$(cat "$LOCK_FILE" 2>/dev/null)
        if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
            echo "QoE Guardian already running (PID $OLD_PID). Exiting."
            exit 0
        fi
        rm -f "$LOCK_FILE"
    fi
    echo $$ > "$LOCK_FILE"
    trap 'rm -f "$LOCK_FILE"; log "QoE Guardian stopped (PID $$)"; exit 0' EXIT INT TERM
}

# ===================================================================
# COLLECT - time-normalized QoE from the player logcat (observe-only)
# ===================================================================
collect_qoe() {
    fg=$(dumpsys window 2>/dev/null | grep -c "$PLAYER_PKG.*PlayerActivity")
    pid=$(pidof "$PLAYER_PKG" 2>/dev/null | awk '{print $1}')

    # epoch-stamped tracker sample -> events/sec + % of tracker lines
    sample=$(logcat -d -v epoch -t 4000 2>/dev/null | grep VideoRenderQualityTracker)
    total=$(printf '%s\n' "$sample" | grep -c .)
    jud=$(printf '%s\n' "$sample" | grep -cE "content time jumped|earlier than the next expected")
    first=$(printf '%s\n' "$sample" | head -1 | awk '{print $1}')
    last=$(printf '%s\n' "$sample" | tail -1 | awk '{print $1}')
    jps=$(awk -v j="$jud" -v f="$first" -v l="$last" 'BEGIN{s=l-f; if(s>0.5){printf "%.1f", j/s}else{print "0"}}')
    jpct=$(awk -v j="$jud" -v t="$total" 'BEGIN{if(t>0){printf "%.0f", j/t*100}else{print "0"}}')

    bsample=$(logcat -d -t 2000 2>/dev/null)
    dropped=$(printf '%s\n' "$bsample" | grep -ciE "dropped [0-9]+ (decoder|buffer|frames)|skipped [0-9]+ frames|we dropped")
    rebuf=$(printf '%s\n' "$bsample" | grep -ciE "buffering|stall|underrun")
    res=$(printf '%s\n' "$bsample" | grep -oiE "[0-9]{3,4}x[0-9]{3,4}" | tail -1)
    memavail=$(grep MemAvailable /proc/meminfo 2>/dev/null | awk '{print $2}')

    [ -z "$jps" ] && jps=0
    [ -z "$jpct" ] && jpct=0
    [ -z "$dropped" ] && dropped=0
    [ -z "$rebuf" ] && rebuf=0
    [ -z "$memavail" ] && memavail=0
    [ -z "$res" ] && res="?"

    log "QoE fg=$fg pid=${pid:-none} judder=${jps}/s (${jpct}% frames) dropped=$dropped rebuffer=$rebuf res=$res mem_kb=$memavail mode=OBSERVE"
    echo "{\"ts\":$(date +%s 2>/dev/null),\"player\":\"$PLAYER_PKG\",\"player_fg\":$fg,\"judder_per_sec\":$jps,\"judder_pct\":$jpct,\"dropped\":$dropped,\"rebuffer\":$rebuf,\"res\":\"$res\",\"mem_avail_kb\":$memavail,\"apply_mode\":$APPLY_MODE}" > "$STATE_FILE" 2>/dev/null
}

apply_mitigations() {
    [ "$APPLY_MODE" != "1" ] && return 0
    return 0   # Phase 2 only
}

run_daemon() {
    acquire_lock
    log "QoE Guardian daemon started (PID $$, interval ${CHECK_INTERVAL}s, mode=OBSERVE)"
    collect_qoe
    while true; do
        sleep "$CHECK_INTERVAL"
        collect_qoe
        apply_mitigations
        if [ -f "$LOG_FILE" ]; then
            lines=$(wc -l < "$LOG_FILE" 2>/dev/null)
            if [ "$lines" -gt 200 ] 2>/dev/null; then
                tail -100 "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null
                mv "${LOG_FILE}.tmp" "$LOG_FILE" 2>/dev/null
            fi
        fi
    done
}

print_status() {
    echo "==============================================="
    echo "  APE QoE GUARDIAN v1.1 - ONN 4K (OTT Navigator)"
    echo "==============================================="
    echo "  Last state: $(cat "$STATE_FILE" 2>/dev/null)"
    if [ -f "$LOCK_FILE" ]; then
        p=$(cat "$LOCK_FILE" 2>/dev/null)
        if kill -0 "$p" 2>/dev/null; then echo "  Daemon RUNNING (PID $p)"; else echo "  Daemon DEAD (stale lock)"; fi
    else
        echo "  Daemon NOT RUNNING"
    fi
    echo "==============================================="
}

case "${1:-status}" in
    daemon) run_daemon ;;
    apply)  collect_qoe ;;
    status) print_status ;;
    stop)
        if [ -f "$LOCK_FILE" ]; then kill "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; rm -f "$LOCK_FILE"; echo "Stopped."; else echo "Not running."; fi
        ;;
    *) echo "Usage: $0 {daemon|apply|status|stop}  (Phase 1 = OBSERVE-only, judder in events/sec)" ;;
esac
