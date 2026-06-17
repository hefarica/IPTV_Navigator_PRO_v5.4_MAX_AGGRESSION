#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — Visual Payload Apply
# Aplica la "carga visual" (VP_*) por el canal correcto SEGÚN plataforma.
# Android/Fire → ADB (settings/setprop/MEMC/AISR policy-driven). Roku/Apple/web →
# manifest/stream/app hints (NO device write). Idempotente · best-effort · no rompe.
# Uso: . visual_payload_apply.sh ; visual_payload_apply <ip:port>
#   Requiere VP_* (decider) + CONTROL_PLANE + SOC_FAMILY + (helpers de generic_player).
# ══════════════════════════════════════════════════════════════════════════
_VPA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
_VPA_SENTINEL="$(cd "${_VPA_DIR}/../../../sentinel" 2>/dev/null && pwd)"

visual_payload_apply() {
    T="$1"
    local plane="${CONTROL_PLANE:-manual}"

    # ── CONTRATO DE AUTORIDAD: el daemon es reactivo, no gobernante ──
    # Carga el guard (chokepoint que bloquea am start/force-stop/input/monkey/pm).
    if [ -f "${_VPA_DIR}/daemon_authority_guard.sh" ]; then
        # shellcheck source=/dev/null
        . "${_VPA_DIR}/daemon_authority_guard.sh"
    fi
    # TTL: payload caduco → NO se aplica perfil agresivo (safe mode). Solo si viene con issued_at.
    if [ -n "${APE_PAYLOAD_ISSUED_AT:-}" ] && command -v ape_payload_fresh >/dev/null 2>&1; then
        if ! ape_payload_fresh "${APE_PAYLOAD_ISSUED_AT}" "${APE_PAYLOAD_TTL_MS:-30000}"; then
            echo "APPLY[$plane] payload CADUCO (TTL) → TRUTHFUL_SOURCE_SAFE (no agresivo)"
            VP_PROFILE=TRUTHFUL_SOURCE_SAFE; VP_MEMC=disable; VP_HDR=disable_fake_hdr; VP_SR=disable
        fi
    fi
    # Codec policy: L153 (4K@60) seguro por defecto; L156 solo si 120Hz + buffer probados.
    if command -v ape_codec_level >/dev/null 2>&1; then
        local _tv120=false; case "${TV_REFRESH:-}" in *120*) _tv120=true ;; esac
        local _bok=false; [ "${TEL_BUFFER:-}" = ok ] && _bok=true
        VP_CODEC_LEVEL="$(ape_codec_level "$_tv120" "$_bok")"
    fi

    if [ "$plane" != adb ]; then
        # Roku / Apple TV / web / unknown → solo manifest/stream/app hints (server-side)
        echo "APPLY[$plane] manifest_only: variant=${VP_VARIANT:-source} codec_pref=${VP_CODEC:-source} level=${VP_CODEC_LEVEL:-hvc1.2.4.L153.B0} res=${VP_RES:-source} hdr=${VP_HDR:-source} (device write=NOT_SUPPORTED)"
        return 0
    fi

    # ── ADB plane: usa los helpers idempotentes de generic_player ──
    if [ -f "${_VPA_SENTINEL}/profiles/generic_player.sh" ]; then
        # shellcheck source=/dev/null
        . "${_VPA_SENTINEL}/profiles/generic_player.sh"
    else
        echo "APPLY[adb] ERROR: generic_player helpers no disponibles"; return 0
    fi

    apply_universal   # base AndroidTV idempotente

    # SoC base (AIPQ/AISR/PQ) según familia
    case "${CAP_SOC_FAMILY:-${SOC_FAMILY:-generic}}" in
        amlogic)  apply_amlogic ;;   # incluye MEMC; lo ajustamos abajo por policy
        mediatek) apply_mediatek ;;
        realtek)  apply_realtek ;;
        rockchip) apply_rockchip ;;
        qualcomm) apply_qualcomm ;;
    esac

    # ── MEMC policy (override del SoC base) ──
    case "${VP_MEMC:-not_supported}" in
        enable) : ;;  # apply_amlogic ya lo prende
        disable|avoid_due_to_judder)
            put_if_diff system memc_enable 0
            put_if_diff global memc_enable 0
            setprop_if_diff persist.sys.memc.enable 0 ;;
        not_supported) : ;;
    esac

    # ── Super Resolution policy ──
    case "${VP_SR:-not_supported}" in
        enable)  put_if_diff system aisr_enable 1; put_if_diff global ai_sr_level 3 ;;
        disable) put_if_diff system aisr_enable 0 ;;
    esac

    # ── FPS policy ──
    case "${VP_FPS:-source}" in
        match_display|prefer_50_60) put_if_diff global match_content_frame_rate 1 ;;
        avoid_interpolation)        put_if_diff global match_content_frame_rate 1 ;;  # match real, no interpolar
    esac

    # ── HDR policy (nunca fake) ──
    case "${VP_HDR:-source}" in
        disable_fake_hdr|sdr_safe) put_if_diff global hdr_conversion_mode 0 ;;   # no forzar conversión HDR
        hdr_if_proven)             put_if_diff global hdr_conversion_mode 2 ;;    # passthrough/auto si probado
    esac

    # Marcador (idempotencia de la mejora base ya lo setea apply_generic_profile;
    # aquí solo registramos el perfil visual aplicado)
    setprop_if_diff persist.ape.visual.profile "${VP_PROFILE:-TRUTHFUL_SOURCE_SAFE}"
    echo "APPLY[adb] profile=${VP_PROFILE:-?} memc=${VP_MEMC:-?} sr=${VP_SR:-?} hdr=${VP_HDR:-?} fps=${VP_FPS:-?}"
}
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ] && [ -n "${1:-}" ]; then visual_payload_apply "$1"; fi
