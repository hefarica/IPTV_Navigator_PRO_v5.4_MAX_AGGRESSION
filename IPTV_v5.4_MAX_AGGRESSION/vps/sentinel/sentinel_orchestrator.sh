#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE SENTINEL — Master Orchestrator Daemon
# Runs in a persistent loop every 30s, performing ADB validation,
# system profile hardening, and QoE metrics logging.
#
# Usage: sentinel_orchestrator.sh {start|stop|status|run-once}
# ══════════════════════════════════════════════════════════════════════════

set -euo pipefail

ADB_TARGET="10.200.0.3:5555"
STATE_DIR="/opt/netshield/state"
LOCK_FILE="${STATE_DIR}/sentinel_orchestrator.lock"
LOG_FILE="${STATE_DIR}/sentinel_orchestrator.log"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"

mkdir -p "$STATE_DIR"

# [Feature 2 2026-05-20] Structured leveled logger (Disney-style severity).
# Backward-compat: log() routes to log_info so all existing `log "..."` calls keep
# working as INFO; log_debug/log_warn/log_error become available + LOG_LEVEL filtering
# (export LOG_LEVEL=DEBUG to diagnose freezes/rebuffer). Falls back to flat log if lib missing.
if [ -f "${LIB_DIR}/log_levels.sh" ]; then
    APE_LOG_FILE="$LOG_FILE"
    # shellcheck source=/dev/null
    . "${LIB_DIR}/log_levels.sh"
    log() { log_info "$@"; }
else
    log() {
        local ts
        ts=$(date '+%Y-%m-%d %H:%M:%S')
        echo "[$ts] $1" | tee -a "$LOG_FILE"
    }
fi

# Core cycle execution
run_cycle() {
    log "=========================================================="
    log "[ORCHESTRATOR] Starting health check sequence for $ADB_TARGET..."
    
    # 1. Connection Watchdog Check
    if ! "${LIB_DIR}/adb_health.sh" "$ADB_TARGET"; then
        log "[ORCHESTRATOR] Device connection unhealthy. Skipping configuration and probe."
        return 1
    fi
    
    # 2. Detect Device Type
    log "[ORCHESTRATOR] Querying device parameters..."
    # Source the detect script to get variables directly
    DEVICE_BRAND=""
    DEVICE_MODEL=""
    DEVICE_PLATFORM="generic"
    
    source "${LIB_DIR}/detect_device.sh" "$ADB_TARGET"
    log "[ORCHESTRATOR] Detected Platform: $DEVICE_PLATFORM ($DEVICE_BRAND $DEVICE_MODEL)"
    
    # 3. Inject Optimization Directives
    log "[ORCHESTRATOR] Injecting configuration parameters..."
    if ! "${LIB_DIR}/inject_directives.sh" "$ADB_TARGET" "$DEVICE_PLATFORM"; then
        log "[ORCHESTRATOR] Directives injection failed."
    fi
    
    # 4. Probe QoE & App Performance Telemetry
    log "[ORCHESTRATOR] Probing QoE telemetry..."
    if ! "${LIB_DIR}/probe_qoe.sh" "$ADB_TARGET"; then
        log "[ORCHESTRATOR] Telemetry probe failed."
    fi
    
    log "[ORCHESTRATOR] Cycle complete."
}

start_daemon() {
    if [ -f "$LOCK_FILE" ]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log "[ORCHESTRATOR] Already running (PID=$pid)"
            exit 0
        fi
        rm -f "$LOCK_FILE"
    fi
    
    log "[ORCHESTRATOR] Starting Sentinel Orchestrator Daemon..."
    
    # Run in background
    (
        echo $$ > "$LOCK_FILE"
        trap 'rm -f "$LOCK_FILE"; log "[ORCHESTRATOR] Daemon stopped."; exit 0' SIGTERM SIGINT EXIT
        
        while true; do
            run_cycle || true
            sleep 30
        done
    ) &
    
    sleep 0.5
    local new_pid
    new_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    log "[ORCHESTRATOR] Daemon started in background (PID=$new_pid)."
}

stop_daemon() {
    if [ -f "$LOCK_FILE" ]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log "[ORCHESTRATOR] Stopping daemon (PID=$pid)..."
            kill "$pid"
            rm -f "$LOCK_FILE"
            log "[ORCHESTRATOR] Stopped."
        else
            log "[ORCHESTRATOR] No active process found for PID=$pid. Removing stale lock."
            rm -f "$LOCK_FILE"
        fi
    else
        log "[ORCHESTRATOR] Daemon is not running."
    fi
}

status_daemon() {
    if [ -f "$LOCK_FILE" ]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "Sentinel Orchestrator: RUNNING (PID=$pid)"
            echo "Recent activity:"
            tail -n 15 "$LOG_FILE"
        else
            echo "Sentinel Orchestrator: STOPPED (stale lock file present)"
        fi
    else
        echo "Sentinel Orchestrator: STOPPED"
    fi
}

case "${1:-status}" in
    start)
        start_daemon
        ;;
    stop)
        stop_daemon
        ;;
    status)
        status_daemon
        ;;
    run-once)
        run_cycle
        ;;
    *)
        echo "Usage: $0 {start|stop|status|run-once}"
        exit 1
        ;;
esac
