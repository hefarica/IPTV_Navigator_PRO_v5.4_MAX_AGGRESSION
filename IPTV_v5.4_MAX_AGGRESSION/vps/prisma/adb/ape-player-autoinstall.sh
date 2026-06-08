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

register_device() {  # <target> <soc> <player>
    command -v curl >/dev/null 2>&1 || return 0
    curl -s -m 4 -X POST "$REGISTER_URL" \
        -H 'Content-Type: application/json' \
        -d "{\"device_id\":\"$1\",\"device_ip\":\"$1\",\"settings_applied\":1,\"notes\":\"soc=$2 player=$3 enh=$APE_ENH_VERSION\"}" \
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
    # Aplicar perfil genérico polimórfico
    if [ -f "$PROFILE_SH" ]; then
        # shellcheck source=/dev/null
        . "$PROFILE_SH"
        apply_generic_profile "$T" 2>&1 | sed 's/^/  /' | tee -a "$LOG" >/dev/null 2>&1 || true
    else
        log "ERROR $T — no encuentro $PROFILE_SH"
        return 0
    fi
    # Instalar sentinel on-device SOLO si falta (clean-detach, un daemon)
    if ! adb -s "$T" shell "test -f $REMOTE_SENTINEL" </dev/null >/dev/null 2>&1; then
        adb -s "$T" push "$PROFILE_SH" "$REMOTE_SENTINEL" </dev/null >/dev/null 2>&1 || true
        adb -s "$T" shell "chmod 755 $REMOTE_SENTINEL" </dev/null >/dev/null 2>&1 || true
        adb -s "$T" shell "setsid sh $REMOTE_SENTINEL daemon </dev/null >/dev/null 2>&1 &" </dev/null >/dev/null 2>&1 || true
        log "INSTALLED sentinel on-device $T (clean-detach)"
    fi
    register_device "$T" "${SOC_FAMILY:-?}" "${PLAYER:-?}"
    log "DONE $T (soc=${SOC_FAMILY:-?} player=${PLAYER:-?} enh=$APE_ENH_VERSION)"
}

main() {
    mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
    local devs n=0
    devs="$(enumerate_devices)"
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

main "$@"
