#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE Sentinel — Structured Leveled Logger (Feature 2, 2026-05-20)
# ──────────────────────────────────────────────────────────────────────────
# Disney-style severity levels for diagnosing freezes/rebuffer on the ADB path.
# Replaces the flat log() with leveled output + threshold filtering.
#
#   TRACE=10  DEBUG=20  INFO=30  WARN=40  ERROR=50  SILENT=60
#
# Set LOG_LEVEL (name or number) to filter; default INFO. Output line format:
#   [2026-05-20 21:14:36] [WARN ] message text
#
# Robust under `set -euo pipefail`: every function returns 0 (never aborts the
# caller), tee failures are swallowed. source this file, then use log_info/etc.
# Backward-compat: define `log() { log_info "$@"; }` in the caller.
# ══════════════════════════════════════════════════════════════════════════

# Map a level name (or passthrough number) → numeric severity.
_ape_log_level_num() {
    case "$(printf '%s' "${1:-INFO}" | tr '[:lower:]' '[:upper:]')" in
        TRACE)        printf '10' ;;
        DEBUG)        printf '20' ;;
        INFO)         printf '30' ;;
        WARN|WARNING) printf '40' ;;
        ERROR|ERR)    printf '50' ;;
        SILENT|OFF)   printf '60' ;;
        ''|*[!0-9]*)  printf '30' ;;   # non-numeric junk → INFO
        *)            printf '%s' "$1" ;;  # already numeric
    esac
}

# Resolve threshold + target file once at source time.
APE_LOG_THRESHOLD="$(_ape_log_level_num "${LOG_LEVEL:-INFO}")"
APE_LOG_FILE="${APE_LOG_FILE:-${LOG_FILE:-/opt/netshield/state/sentinel_orchestrator.log}}"

_ape_log() {
    local levelname="$1"; shift || true
    local levelnum; levelnum="$(_ape_log_level_num "$levelname")"
    if [ "$levelnum" -ge "$APE_LOG_THRESHOLD" ]; then
        local ts; ts="$(date '+%Y-%m-%d %H:%M:%S')"
        printf '[%s] [%-5s] %s\n' "$ts" "$levelname" "$*" | tee -a "$APE_LOG_FILE" 2>/dev/null || true
    fi
    return 0
}

log_trace() { _ape_log TRACE "$@"; }
log_debug() { _ape_log DEBUG "$@"; }
log_info()  { _ape_log INFO  "$@"; }
log_warn()  { _ape_log WARN  "$@"; }
log_error() { _ape_log ERROR "$@"; }
