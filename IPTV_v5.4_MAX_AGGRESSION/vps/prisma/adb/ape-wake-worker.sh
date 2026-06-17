#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — Wake Worker (despierta el daemon on-device en ms vía ADB)
# Lee /dev/shm/ape_wake_queue (encolado por log_by_lua / ape-wake.php al reproducir),
# y para cada device manda la señal de wake al sentinel:
#   - touch del trigger file que el sentinel vigila (MANIFEST_TRIGGER)
#   - pkill -USR1 al sentinel (SIGUSR1) — el sentinel ya soporta ambos.
# Loop rápido (poll 200ms) con cooldown por device (anti-tormenta). Daemon (no timer).
# Autopista-safe: solo ADB al device; NO toca nginx/URLs/stream. NUNCA mata el player.
# ══════════════════════════════════════════════════════════════════════════
set -u
QUEUE="${APE_WAKE_QUEUE:-/dev/shm/ape_wake_queue}"
DEVICES_DB="${APE_DEVICES_DB:-/var/www/html/prisma/db/ape_devices.db}"
TRIGGER="/data/local/tmp/ape-manifest-trigger"
POLL="${APE_WAKE_POLL:-0.2}"
COOLDOWN="${APE_WAKE_COOLDOWN:-5}"     # s entre wakes del mismo device
LOG="${APE_WAKE_LOG:-/opt/netshield/state/ape-wake-worker.log}"

declare -A LAST_WAKE
log() { echo "$(date -u +%FT%TZ) $*" >>"$LOG" 2>/dev/null || true; }

resolve_target() {  # <dev>  → ip:port ADB
    local d="$1"
    case "$d" in
        *:*) echo "$d"; return ;;                       # ya es ip:port
    esac
    # ¿IP sola? → :5555
    if printf '%s' "$d" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        echo "${d}:5555"; return
    fi
    # lookup en ape_devices.db por device_id
    if [ -f "$DEVICES_DB" ] && command -v sqlite3 >/dev/null 2>&1; then
        local ip
        ip="$(sqlite3 "$DEVICES_DB" "SELECT device_ip FROM ape_devices WHERE device_id='$d' OR device_ip='$d' LIMIT 1" 2>/dev/null)"
        [ -n "$ip" ] && { case "$ip" in *:*) echo "$ip";; *) echo "${ip}:5555";; esac; return; }
    fi
    echo "$d"
}

wake_device() {  # <target> <ch>
    local T="$1" ch="${2:-}"
    # device alcanzable?
    adb connect "$T" >/dev/null 2>&1
    adb -s "$T" shell echo ok </dev/null >/dev/null 2>&1 || { log "SKIP $T (adb no responde)"; return 0; }
    # MANIFEST_TRIGGER: touch del fichero que el sentinel vigila (+ canal opcional)
    adb -s "$T" shell "echo '${ch}' > $TRIGGER" </dev/null >/dev/null 2>&1 || true
    # SIGUSR1 al sentinel (entra a cumplir su función de inmediato)
    adb -s "$T" shell "pkill -USR1 -f ape-sentinel" </dev/null >/dev/null 2>&1 || true
    log "WAKE $T ch=${ch:-none} (trigger+SIGUSR1)"
}

process_queue() {
    [ -s "$QUEUE" ] || return 0
    # Atómico: renombra y procesa (los appenders crean uno nuevo)
    local snap="${QUEUE}.proc.$$"
    mv "$QUEUE" "$snap" 2>/dev/null || return 0
    local now; now="$(date +%s 2>/dev/null || echo 0)"
    while IFS="$(printf '\t')" read -r ts dev ch list cip; do
        [ -z "${dev:-}" ] && continue
        # cooldown por device
        local last="${LAST_WAKE[$dev]:-0}"
        if [ "$((now - last))" -lt "$COOLDOWN" ]; then continue; fi
        LAST_WAKE[$dev]="$now"
        wake_device "$(resolve_target "$dev")" "${ch:-}"
    done < "$snap"
    rm -f "$snap" 2>/dev/null || true
}

main() {
    mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
    log "wake-worker iniciado (poll=${POLL}s cooldown=${COOLDOWN}s)"
    case "${1:-run}" in
        once) process_queue ;;
        run)  while true; do process_queue; sleep "$POLL"; done ;;
        *)    echo "uso: $0 {run|once}"; exit 1 ;;
    esac
}
main "$@"
