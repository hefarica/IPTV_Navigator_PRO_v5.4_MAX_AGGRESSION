#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — Universal Player Visual-Enhancement Orchestrator
# Enumera devices, detecta plataforma por el mejor plano de control disponible,
# carga el adapter correcto y aplica SOLO lo soportado (verdad técnica, sin fake).
# Reporta: applied | skipped | not_supported | failed | manual_required.
# NO falla todo el loop si un device no soporta algo. NO toca nginx/URLs/túneles.
# ══════════════════════════════════════════════════════════════════════════
set -u
APE_ENH_VERSION="2026.06-universal-1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ADAPTERS_DIR="${SCRIPT_DIR}/adapters"
SENTINEL_LIB="$(cd "${SCRIPT_DIR}/../../sentinel/lib" 2>/dev/null && pwd)"
DEVICES_DB="${APE_DEVICES_DB:-/var/www/html/prisma/db/ape_devices.db}"
LOG="${APE_ORCH_LOG:-/opt/netshield/state/ape-universal-orchestrator.log}"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG" 2>/dev/null || echo "$*"; }

enumerate_devices() {
    { adb devices 2>/dev/null | awk 'NR>1 && /\tdevice$/ {print $1}'
      [ -f "$DEVICES_DB" ] && command -v sqlite3 >/dev/null 2>&1 && \
          sqlite3 "$DEVICES_DB" "SELECT device_ip FROM ape_devices WHERE device_ip<>''" 2>/dev/null
      printf '%s\n' ${APE_KNOWN_DEVICES:-}
    } | sort -u | grep -E '.'
}

adapter_for() {  # <platform_family> <control_plane>
    case "$1" in
        androidtv) echo "android_adb.sh" ;;
        firetv)    echo "firetv_adb.sh" ;;
        roku)      echo "roku_ecp.sh" ;;
        appletv)   echo "appletv_profile.sh" ;;
        web)       echo "manifest_only.sh" ;;
        smarttv)   echo "generic_network.sh" ;;
        *)         echo "manifest_only.sh" ;;
    esac
}

process_device() {  # <target>
    local T="$1" rc adapter
    PLATFORM_FAMILY=unknown; CONTROL_PLANE=manual
    if [ -f "${SENTINEL_LIB}/detect_universal_player.sh" ]; then
        # shellcheck source=/dev/null
        . "${SENTINEL_LIB}/detect_universal_player.sh" "$T"
    fi
    adapter="${ADAPTERS_DIR}/$(adapter_for "$PLATFORM_FAMILY" "$CONTROL_PLANE")"
    if [ ! -f "$adapter" ]; then
        log "MANUAL_REQUIRED $T platform=$PLATFORM_FAMILY (sin adapter)"; return 0
    fi
    # shellcheck source=/dev/null
    . "$adapter"
    log "DEVICE $T platform=$PLATFORM_FAMILY control=$CONTROL_PLANE adapter=$(basename "$adapter")"
    log "  caps=$(detect_capabilities "$T" 2>/dev/null | tr -d '\n')"
    # Aplica solo capacidades soportadas (graceful)
    if can_apply_system_settings 2>/dev/null || [ "$CONTROL_PLANE" = adb ]; then
        out="$(apply_visual_profile "$T" 2>&1)"; rc=$?
    else
        out="$(apply_visual_profile "$T" 2>&1)"; rc=$?   # los adapters network reportan not_supported sin fallar
    fi
    log "  visual: ${out//$'\n'/ | } (rc=$rc)"
    apply_antibuffer_profile "$T" 2>&1 | sed 's/^/  antibuffer: /' | tee -a "$LOG" >/dev/null 2>&1 || true
    verify_profile "$T" 2>&1 | sed 's/^/  /' | tee -a "$LOG" >/dev/null 2>&1 || true
}

main() {
    mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
    local devs n=0
    devs="$(enumerate_devices)"
    [ -z "$devs" ] && { log "No hay devices — skip limpio."; return 0; }
    while IFS= read -r T; do
        [ -z "$T" ] && continue
        n=$((n+1))
        ( process_device "$T" ) || log "FAILED $T (aislado, loop continúa)"
    done <<EOF
$devs
EOF
    log "orquestación completa — $n device(s)"
}
main "$@"
