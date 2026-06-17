#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — Player Auto-Installer (VPS side)
# Detecta cualquier player AndroidTV/Fire alcanzable por ADB y aplica el perfil
# genérico polimórfico SI no está instalado (idempotente vía persist.ape.enh.version).
# Instala el sentinel on-device solo si falta (clean-detach, un solo daemon).
# Registra en device-register.php. NUNCA falla todo el loop por un device.
#
# NO toca: nginx, URLs, túneles, SHIELDED, proveedor IPTV. Solo ADB al device.
# Respeta: iptv-adb-guardian-watchdog-surgery, iptv-onn-sentinel-never-down,
#          iptv-vps-touch-nothing.
# ══════════════════════════════════════════════════════════════════════════
set -u

APE_ENH_VERSION="2026.06-universal-1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
SENTINEL_DIR="$(cd "${SCRIPT_DIR}/../../sentinel" 2>/dev/null && pwd)"
PROFILE_SH="${SENTINEL_DIR}/profiles/generic_player.sh"
DEVICES_DB="${APE_DEVICES_DB:-/var/www/html/prisma/db/ape_devices.db}"
REGISTER_URL="${APE_REGISTER_URL:-http://127.0.0.1/prisma/api/device-register.php}"
REMOTE_SENTINEL="/data/local/tmp/ape-sentinel.sh"
LOG="${APE_AUTOINSTALL_LOG:-/opt/netshield/state/ape-player-autoinstall.log}"

log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG" 2>/dev/null || echo "$*"; }

# ── Enumerar devices (adb + ape_devices.db + IPs conocidas) ────────────────
enumerate_devices() {
    { adb devices 2>/dev/null | awk 'NR>1 && /\tdevice$/ {print $1}'
      [ -f "$DEVICES_DB" ] && command -v sqlite3 >/dev/null 2>&1 && \
          sqlite3 "$DEVICES_DB" "SELECT device_ip FROM ape_devices WHERE device_ip<>''" 2>/dev/null
      printf '%s\n' ${APE_KNOWN_DEVICES:-}
    } | sort -u | grep -E '.'
}

register_device() {  # <target_ip> <soc> <player> <serial>
    command -v curl >/dev/null 2>&1 || return 0
    # device_id = serial ESTABLE (no la IP, que cambia con DHCP → duplica filas).
    # device_ip = IP actual (puede cambiar). Fallback a IP solo si no hay serial.
    local _id="${4:-$1}"
    curl -s -m 4 -X POST "$REGISTER_URL" \
        -H 'Content-Type: application/json' \
        -d "{\"device_id\":\"$_id\",\"device_ip\":\"$1\",\"settings_applied\":1,\"notes\":\"soc=$2 player=$3 enh=$APE_ENH_VERSION\"}" \
        >/dev/null 2>&1 || true
}

process_device() {
    local T="$1"
    adb connect "$T" >/dev/null 2>&1
    sleep 1
    if ! adb -s "$T" shell echo ok >/dev/null 2>&1; then
        log "SKIP $T — ADB no responde (no habilitado / offline)"
        return 0
    fi
    # Idempotencia: marcador ya en versión
    local cur
    cur="$(adb -s "$T" shell getprop persist.ape.enh.version 2>/dev/null | tr -d '\r\n')"
    if [ "$cur" = "$APE_ENH_VERSION" ]; then
        log "OK $T — ya instalado ($cur)"
        return 0
    fi
    # Detectar capacidades EN ESTE SCOPE (no en pipeline/subshell) para que
    # SOC_FAMILY/PLAYER/DEVICE_SERIAL propaguen a register_device. Un pipeline
    # `apply_generic_profile | sed | tee` correría el perfil en un SUBSHELL y las
    # variables quedarían atrapadas (device_id/soc/player saldrían vacíos).
    local _CAP_SH="${SENTINEL_DIR}/lib/detect_capabilities.sh"
    if [ -f "$_CAP_SH" ]; then
        # shellcheck source=/dev/null
        . "$_CAP_SH" "$T"   # exporta SOC_FAMILY PLAYER DEVICE_SERIAL ENH_VER ADB_OK al scope actual
    fi
    # Aplicar perfil genérico polimórfico (sin pipeline → no subshell)
    if [ -f "$PROFILE_SH" ]; then
        # shellcheck source=/dev/null
        . "$PROFILE_SH"
        apply_generic_profile "$T" >>"$LOG" 2>&1 || true
    else
        log "ERROR $T — no encuentro $PROFILE_SH"
        return 0
    fi
    # ── Sentinel on-device — conteo REAL por PPID=1, no `test -f` ───────────────
    # Doctrina iptv-adb-guardian-watchdog-surgery (regla 1+7): contar daemons VIVOS
    # por PPID=1 (un PPID==otro-PID es un hijo subshell transitorio, NO duplicado).
    # `test -f` era un bug: si el archivo existe pero el daemon MURIÓ, nunca revivía;
    # y entre dos ciclos del .timer podía lanzar 2 daemons. Relanzar SOLO si 0 vivos;
    # matar extras (kill -9, sh ignora SIGTERM) solo si >1; detach </dev/null ambos lados.
    # Push del script SIEMPRE que falte el archivo o cambie el SHA (idempotente).
    adb -s "$T" shell "test -f $REMOTE_SENTINEL" </dev/null >/dev/null 2>&1 || {
        adb -s "$T" push "$PROFILE_SH" "$REMOTE_SENTINEL" </dev/null >/dev/null 2>&1 || true
        adb -s "$T" shell "chmod 755 $REMOTE_SENTINEL" </dev/null >/dev/null 2>&1 || true
    }
    # Conteo de daemons VIVOS vía /proc (universal en Android — toybox `ps -A -o` no
    # es fiable: trunca ARGS y unos firmwares ignoran -A silenciosamente, B1/B3 S7).
    # Match por basename (no full path, que toybox trunca). PIDs en orden ascendente.
    local _bn _live _n=0
    _bn="$(basename "$REMOTE_SENTINEL")"
    _live="$(adb -s "$T" shell "for c in /proc/[0-9]*/cmdline; do p=\${c%/cmdline}; p=\${p##*/}; if grep -qa \"$_bn\" \"\$c\" 2>/dev/null && grep -qa daemon \"\$c\" 2>/dev/null; then echo \$p; fi; done" </dev/null 2>/dev/null | tr -d '\r' | grep -E '^[0-9]+$' | sort -n)"
    [ -n "$_live" ] && _n="$(printf '%s\n' "$_live" | grep -c '[0-9]')"
    if [ "$_n" -eq 0 ]; then
        adb -s "$T" shell "setsid sh $REMOTE_SENTINEL daemon </dev/null >/dev/null 2>&1 &" </dev/null >/dev/null 2>&1 || true
        log "RELAUNCHED sentinel on-device $T (0 vivos → 1, clean-detach)"
    elif [ "$_n" -gt 1 ]; then
        # Conservar el MÁS RECIENTE (PID más alto = recién lanzado, no zombie viejo);
        # kill -9 al resto (sh ignora SIGTERM). B4 S7: head -n -1, no tail +2.
        printf '%s\n' "$_live" | head -n -1 | while IFS= read -r _pid; do
            [ -n "$_pid" ] && adb -s "$T" shell "kill -9 $_pid" </dev/null >/dev/null 2>&1 || true
        done
        log "DEDUP sentinel on-device $T ($_n vivos → 1 más reciente, kill -9 extras)"
    else
        log "OK sentinel on-device $T (1 vivo)"
    fi
    register_device "$T" "${SOC_FAMILY:-?}" "${PLAYER:-?}" "${DEVICE_SERIAL:-}"
    log "DONE $T (serial=${DEVICE_SERIAL:-?} soc=${SOC_FAMILY:-?} player=${PLAYER:-?} enh=$APE_ENH_VERSION)"
}

main() {
    mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
    local devs n=0
    devs="$(enumerate_devices)"
    # (flock se aplica en el wrapper de abajo, no aquí, para cubrir todo main)
    if [ -z "$devs" ]; then
        log "No hay devices ADB ni en registry — skip limpio."
        return 0
    fi
    while IFS= read -r T; do
        [ -z "$T" ] && continue
        n=$((n+1))
        process_device "$T" || true   # nunca rompe el loop por un device
    done <<EOF
$devs
EOF
    log "ciclo completo — $n device(s) evaluado(s)"
}

# ── Single-instance lock (B2 S7): el .timer (60s) puede solapar ciclos si un device
# es lento (connect+getprops×N). Sin lock, dos runs ven 0 daemons y lanzan 2 → carrera.
# flock no-bloqueante: si ya corre una instancia, esta sale limpia (no se encola).
APE_LOCK="${APE_AUTOINSTALL_LOCK:-/var/lock/ape-player-autoinstall.lock}"
if command -v flock >/dev/null 2>&1; then
    exec 9>"$APE_LOCK" 2>/dev/null || exec 9>"/tmp/ape-player-autoinstall.lock"
    if ! flock -n 9; then
        log "Otra instancia en curso (lock $APE_LOCK) — skip limpio."
        exit 0
    fi
fi

main "$@"
