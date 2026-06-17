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
VP_PAYLOAD_SH="${SCRIPT_DIR}/lib/visual_metadata_payload.sh"
PY_LAB="${SCRIPT_DIR}/lab/visual_lab_engine.py"
# Motor Rust determinista (producción) si está compilado; si no → fallback shell decider.
RUST_BIN="${APE_RUST_VISUAL_BIN:-${SCRIPT_DIR}/engines/rust-visual-engine/target/release/visual-profile-engine}"
[ -x "$RUST_BIN" ] || RUST_BIN=""
PY_BIN="$(command -v python3 || command -v python || echo '')"
REGISTER_URL="${APE_REGISTER_URL:-http://127.0.0.1/prisma/api/device-register.php}"

# Extrae "key":value (string o escalar) de un JSON plano (sin jq)
_jf() { printf '%s' "$1" | grep -oE "\"$2\":[^,}]*" | head -1 | sed -E "s/^\"$2\"://; s/^\"//; s/\"$//"; }

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
        # Plano 4: decisión visual (cruza los 4 planos) — shell decider = fallback determinista
        # shellcheck source=/dev/null
        . "$VP_DECIDER_SH"; visual_payload_decider >/dev/null 2>&1 || true   # setea VP_*

        # Motor Rust (PRODUCCIÓN determinista) si está compilado → override de VP_*; si no, queda el shell.
        if [ -n "$RUST_BIN" ]; then
            _rin="{\"platform_family\":\"$PLATFORM_FAMILY\",\"soc_family\":\"${SOC_FAMILY:-generic}\",\"tv_resolution_max\":\"${TV_RES_MAX:-unknown}\",\"hdr_support\":\"${TV_HDR:-unknown}\",\"memc_available\":$([ "${TV_MEMC:-}" = available ] && echo true || echo false),\"super_resolution_available\":$([ "${TV_SR:-}" = available ] && echo true || echo false),\"family\":\"${TEL_PLAYER:-unknown}\",\"codec_video\":\"${TEL_CODEC_VIDEO:-unknown}\",\"hardware_decode\":${TEL_HW_DECODE:-false},\"buffer_state\":\"${TEL_BUFFER:-unknown}\",\"dropped_frames\":${TEL_DROPPED:-0},\"judder\":${TEL_JUDDER:-false},\"has_4k\":${MV_HAS_4K:-false},\"has_hevc\":${MV_HAS_HEVC:-false},\"has_hdr\":${MV_HAS_HDR:-false},\"manifest_status\":\"${MV_STATUS:-ok}\",\"score\":\"${NET_SCORE:-unknown}\"}"
            _rout="$(printf '%s' "$_rin" | timeout 5 "$RUST_BIN" 2>/dev/null)"
            if [ -n "$_rout" ]; then
                VP_PROFILE="$(_jf "$_rout" visual_profile)"; VP_VARIANT_POLICY="$(_jf "$_rout" variant_policy)"
                VP_CODEC="$(_jf "$_rout" preferred_codec)"; VP_RES="$(_jf "$_rout" preferred_resolution)"
                VP_FPS="$(_jf "$_rout" fps_policy)"; VP_HDR="$(_jf "$_rout" hdr_policy)"
                VP_MEMC="$(_jf "$_rout" memc_policy)"; VP_SR="$(_jf "$_rout" super_resolution_policy)"
                VP_COLOR="$(_jf "$_rout" color_policy)"; VP_SHARP="$(_jf "$_rout" sharpness_policy)"; VP_REASON="$(_jf "$_rout" reason)"
                # variant_policy → URL real del manifest
                case "$VP_VARIANT_POLICY" in
                    best_visual)   VP_VARIANT="${MV_BEST_VISUAL:-source}" ;;
                    anti_rebuffer) VP_VARIANT="${MV_ANTIREBUFFER:-${MV_SAFEST:-source}}" ;;
                    safe_visual)   VP_VARIANT="${MV_SAFEST:-source}" ;;
                esac
                log "  rust-engine: profile=$VP_PROFILE (deterministic production)"
            fi
        fi
        # Plano lab Python (OBSERVE/calibración, no producción) — opcional, no bloquea
        if [ -n "$PY_BIN" ] && [ -f "$PY_LAB" ]; then
            _lab="{\"telemetry_json\":{\"codec_video\":\"${TEL_CODEC_VIDEO:-unknown}\",\"hardware_decode\":${TEL_HW_DECODE:-false},\"buffer_state\":\"${TEL_BUFFER:-unknown}\",\"dropped_frames\":${TEL_DROPPED:-0},\"judder\":${TEL_JUDDER:-false},\"foreground_package\":\"${TEL_FG_PKG:-}\"},\"capabilities_json\":{\"tv_resolution_max\":\"${TV_RES_MAX:-0}\",\"super_resolution_available\":$([ "${TV_SR:-}" = available ] && echo true || echo false)},\"m3u8_analysis_json\":{\"has_4k\":${MV_HAS_4K:-false},\"has_hevc\":${MV_HAS_HEVC:-false},\"has_hdr\":${MV_HAS_HDR:-false},\"status\":\"${MV_STATUS:-ok}\"},\"qoe_history_json\":{\"network_score\":\"${NET_SCORE:-unknown}\"}}"
            _labout="$(printf '%s' "$_lab" | PYTHONIOENCODING=utf-8 timeout 5 "$PY_BIN" "$PY_LAB" 2>/dev/null)"
            [ -n "$_labout" ] && log "  lab: $(printf '%s' "$_labout" | tr -d '\n' | cut -c1-200)"
        fi
        log "  telemetry: codec=${TEL_CODEC_VIDEO:-?} hw=${TEL_HW_DECODE:-?} res=${TEL_RES:-?} fps=${TEL_FPS:-?} buf=${TEL_BUFFER:-?} dropped=${TEL_DROPPED:-0} judder=${TEL_JUDDER:-?}"
        log "  tv: res_max=${TV_RES_MAX:-?} hdr=${TV_HDR:-?} memc=${TV_MEMC:-?} sr=${TV_SR:-?} up=${TV_UPSCALER:-?}"
        log "  stream: variants=${MV_VARIANTS:-?} 4k=${MV_HAS_4K:-?} hevc=${MV_HAS_HEVC:-?} hdr=${MV_HAS_HDR:-?}"
        log "  VISUAL: profile=${VP_PROFILE:-?} variant=${VP_VARIANT:-?} codec=${VP_CODEC:-?} res=${VP_RES:-?} memc=${VP_MEMC:-?} sr=${VP_SR:-?} hdr=${VP_HDR:-?} risk=${VP_RISK:-?} reason=${VP_REASON:-}"
        # Plano 4b: aplicar carga visual por el canal correcto (ADB policy-driven)
        [ -f "$VP_APPLY_SH" ] && { . "$VP_APPLY_SH"; visual_payload_apply "$T" 2>&1 | sed 's/^/  apply: /' | tee -a "$LOG" >/dev/null 2>&1 || true; }
        # Plano metadata: construir + emitir carga visual (JSON sidecar + props + algorithm_stack)
        if [ -f "$VP_PAYLOAD_SH" ]; then
            # shellcheck source=/dev/null
            . "$VP_PAYLOAD_SH"
            APE_DEVICE_ID="$T"; APE_PLAYER="${TEL_PLAYER:-${PLAYER:-unknown}}"; APE_SELECTED_VARIANT_URL="${VP_VARIANT:-source}"
            emit_visual_payload "$T" >/dev/null 2>&1 || true
            log "  metadata: payload emitted (profile=${VP_PROFILE:-?} variant=${VP_VARIANT:-?})"
        fi
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
