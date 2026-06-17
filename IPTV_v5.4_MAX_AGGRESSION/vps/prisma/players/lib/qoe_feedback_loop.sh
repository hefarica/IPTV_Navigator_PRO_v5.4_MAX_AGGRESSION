#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — QoE Feedback Loop  (cierra el ciclo)
#   ADB/player telemetry → VPS decision → apply → RE-OBSERVE → adjust
# Sube/baja el perfil visual según lo que el player REALMENTE hace tras aplicar.
# best-effort · read-mostly (solo aplica ajustes vía visual_payload_apply).
# Uso: . qoe_feedback_loop.sh ; qoe_feedback_loop <ip:port>
# ══════════════════════════════════════════════════════════════════════════
_QFL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

# Escalera de perfiles (índice = nivel visual; mayor = más agresivo)
_profile_rank() {
    case "$1" in
        TRUTHFUL_SOURCE_SAFE) echo 0 ;;
        LOW_LATENCY_SAFE)     echo 1 ;;
        STABLE_1080P_PREMIUM) echo 2 ;;
        PERCEPTUAL_4K_BALANCED) echo 3 ;;
        CRYSTAL_UHD_SAFE)     echo 4 ;;
        CRYSTAL_UHD_EXTREME)  echo 5 ;;
        *) echo 0 ;;
    esac
}
_profile_by_rank() {
    case "$1" in
        0) echo TRUTHFUL_SOURCE_SAFE ;; 1) echo LOW_LATENCY_SAFE ;;
        2) echo STABLE_1080P_PREMIUM ;; 3) echo PERCEPTUAL_4K_BALANCED ;;
        4) echo CRYSTAL_UHD_SAFE ;; *) echo CRYSTAL_UHD_EXTREME ;;
    esac
}

qoe_feedback_loop() {
    T="$1"
    local tel decider apply
    tel="$(cd "${_QFL_DIR}/../adb" 2>/dev/null && pwd)/collect_player_telemetry.sh"
    decider="${_QFL_DIR}/visual_payload_decider.sh"
    apply="${_QFL_DIR}/visual_payload_apply.sh"
    [ -f "$tel" ] && [ -f "$decider" ] || { echo "QFL: módulos faltantes"; return 0; }

    # Re-observa
    # shellcheck source=/dev/null
    . "$tel"; collect_player_telemetry "$T" >/dev/null 2>&1 || true
    local cur_rank; cur_rank="$(_profile_rank "${VP_PROFILE:-TRUTHFUL_SOURCE_SAFE}")"
    local new_rank="$cur_rank" action=hold

    # Reglas de ajuste (post-aplicación)
    if [ "${TEL_BUFFER:-}" = rebuffer ]; then new_rank=$(( cur_rank>2 ? 2 : cur_rank-1 )); action="down(rebuffer)"
    elif [ "${TEL_DROPPED:-0}" -gt "${DROPPED_THRESHOLD:-30}" ] 2>/dev/null; then new_rank=$(( cur_rank>0 ? cur_rank-1 : 0 )); action="down(dropped)"
    elif [ "${TEL_JUDDER:-false}" = true ]; then VP_MEMC=avoid_due_to_judder; action="memc_off(judder)"
    elif [ "${QFL_STABLE_CYCLES:-0}" -ge 4 ] 2>/dev/null; then new_rank=$(( cur_rank<5 ? cur_rank+1 : 5 )); action="up(stable)"
    fi
    [ "$new_rank" -lt 0 ] 2>/dev/null && new_rank=0

    if [ "$new_rank" != "$cur_rank" ] || [ "$action" = "memc_off(judder)" ]; then
        VP_PROFILE="$(_profile_by_rank "$new_rank")"
        echo "QFL $T: $action → profile=$VP_PROFILE (rank $cur_rank→$new_rank)"
        if [ -f "$apply" ]; then
            # shellcheck source=/dev/null
            . "$apply"; visual_payload_apply "$T" >/dev/null 2>&1 || true
        fi
    else
        echo "QFL $T: hold (profile=${VP_PROFILE:-?} buf=${TEL_BUFFER:-?} dropped=${TEL_DROPPED:-0} judder=${TEL_JUDDER:-false})"
    fi
}
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ] && [ -n "${1:-}" ]; then qoe_feedback_loop "$1"; fi
