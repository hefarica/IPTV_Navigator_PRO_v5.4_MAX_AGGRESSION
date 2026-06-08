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

TEL_SH="${SCRIPT_DIR}/adb/collect_player_telemetry.sh"
DECIDER_SH="${SCRIPT_DIR}/lib/playback_profile_decider.sh"
TV_PROBE_SH="${SCRIPT_DIR}/lib/tv_capability_probe.sh"
MV_SH="${SCRIPT_DIR}/lib/m3u8_variant_analyzer.sh"
VP_DECIDER_SH="${SCRIPT_DIR}/lib/visual_payload_decider.sh"
VP_APPLY_SH="${SCRIPT_DIR}/lib/visual_payload_apply.sh"
REGISTER_URL="${APE_REGISTER_URL:-http://127.0.0.1/prisma/api/device-register.php}"

# Reporta capabilities + telemetry + decisión al VPS (backward-compat; nunca rompe el loop)
report_to_vps() {  # <target>
    command -v curl >/dev/null 2>&1 || return 0
    curl -s -m 4 -X POST "$REGISTER_URL" -H 'Content-Type: application/json' -d "{
\"device_id\":\"$1\",\"device_ip\":\"$1\",\"platform\":\"${PLATFORM_FAMILY:-unknown}\",
\"player\":\"${TEL_PLAYER:-${PLAYER:-unknown}}\",\"settings_applied\":1,
\"playback_profile_json\":\"{\\\"codec_video\\\":\\\"${TEL_CODEC_VIDEO:-unknown}\\\",\\\"decoder_name\\\":\\\"${TEL_DECODER:-unknown}\\\",\\\"resolution\\\":\\\"${TEL_RES:-unknown}\\\",\\\"fps\\\":\\\"${TEL_FPS:-unknown}\\\",\\\"buffer_state\\\":\\\"${TEL_BUFFER:-unknown}\\\",\\\"dropped_frames\\\":\\\"${TEL_DROPPED:-0}\\\",\\\"judder\\\":\\\"${TEL_JUDDER:-false}\\\",\\\"recommended_profile\\\":\\\"${REC_PROFILE:-}\\\",\\\"recommended_codec\\\":\\\"${REC_CODEC:-}\\\",\\\"recommended_resolution\\\":\\\"${REC_RESOLUTION:-}\\\",\\\"memc_policy\\\":\\\"${MEMC_POLICY:-}\\\",\\\"hdr_policy\\\":\\\"${HDR_POLICY:-}\\\",\\\"control_plane\\\":\\\"${CONTROL_PLANE:-}\\\",\\\"soc_family\\\":\\\"${SOC_FAMILY:-}\\\"}\",
\"notes\":\"enh=$APE_ENH_VERSION profile=${REC_PROFILE:-} risk=${RISK:-}\"}" >/dev/null 2>&1 || true
}

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

    # ── 4-PLANE VISUAL PIPELINE (solo ADB): TV + player + stream → carga visual ──
    # Roku/AppleTV/web NO tienen telemetry ADB → decisión por capabilities + QoE server-side.
    if [ "$CONTROL_PLANE" = adb ] && [ -f "$TEL_SH" ] && [ -f "$VP_DECIDER_SH" ]; then
        # Plano 2: player playback (telemetría software real)
        # shellcheck source=/dev/null
        . "$TEL_SH"; collect_player_telemetry "$T" >/dev/null 2>&1 || true
        # Plano 1: device/TV capabilities
        [ -f "$TV_PROBE_SH" ] && { . "$TV_PROBE_SH"; tv_capability_probe "$T" >/dev/null 2>&1 || true; }
        CAP_SOC_FAMILY="${SOC_FAMILY:-generic}"
        CAP_CAN_MEMC="$( can_apply_memc 2>/dev/null && echo true || echo false )"
        # Plano 3: stream/manifest (variantes, sin descargar video) — si hay URL del canal
        if [ -n "${APE_CHANNEL_M3U8:-}" ] && [ -f "$MV_SH" ]; then
            # shellcheck source=/dev/null
            . "$MV_SH"; analyze_m3u8 "$APE_CHANNEL_M3U8" >/dev/null 2>&1 || true
        fi
        # Plano 4: decisión visual (cruza los 4 planos)
        # shellcheck source=/dev/null
        . "$VP_DECIDER_SH"; visual_payload_decider >/dev/null 2>&1 || true   # setea VP_*
        log "  telemetry: codec=${TEL_CODEC_VIDEO:-?} hw=${TEL_HW_DECODE:-?} res=${TEL_RES:-?} fps=${TEL_FPS:-?} buf=${TEL_BUFFER:-?} dropped=${TEL_DROPPED:-0} judder=${TEL_JUDDER:-?}"
        log "  tv: res_max=${TV_RES_MAX:-?} hdr=${TV_HDR:-?} memc=${TV_MEMC:-?} sr=${TV_SR:-?} up=${TV_UPSCALER:-?}"
        log "  stream: variants=${MV_VARIANTS:-?} 4k=${MV_HAS_4K:-?} hevc=${MV_HAS_HEVC:-?} hdr=${MV_HAS_HDR:-?}"
        log "  VISUAL: profile=${VP_PROFILE:-?} variant=${VP_VARIANT:-?} codec=${VP_CODEC:-?} res=${VP_RES:-?} memc=${VP_MEMC:-?} sr=${VP_SR:-?} hdr=${VP_HDR:-?} risk=${VP_RISK:-?} reason=${VP_REASON:-}"
        # Plano 4b: aplicar carga visual por el canal correcto (ADB policy-driven)
        [ -f "$VP_APPLY_SH" ] && { . "$VP_APPLY_SH"; visual_payload_apply "$T" 2>&1 | sed 's/^/  apply: /' | tee -a "$LOG" >/dev/null 2>&1 || true; }
        # Alias REC_* ← VP_* para report_to_vps (compat)
        REC_PROFILE="$VP_PROFILE"; REC_CODEC="$VP_CODEC"; REC_RESOLUTION="$VP_RES"; MEMC_POLICY="$VP_MEMC"; HDR_POLICY="$VP_HDR"; RISK="$VP_RISK"; REASON="$VP_REASON"
        report_to_vps "$T"
    fi

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
