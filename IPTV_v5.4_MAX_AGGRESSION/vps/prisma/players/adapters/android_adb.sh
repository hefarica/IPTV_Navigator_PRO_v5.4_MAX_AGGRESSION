#!/bin/bash
# Adapter: Android TV / Google TV / ONN / generic Android box — CONTROL_PLANE=adb
# Contract: detect_platform detect_capabilities can_* apply_* verify_* rollback_*
# Reutiliza el perfil polimórfico existente (generic_player.sh). No duplica.
: "${APE_ENH_VERSION:=2026.06-universal-1}"
_AA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
_AA_SENTINEL="$(cd "${_AA_DIR}/../../../sentinel" 2>/dev/null && pwd)"

detect_platform() { echo "androidtv"; }
detect_capabilities() {  # <target>
    local T="$1"
    [ -f "${_AA_SENTINEL}/lib/detect_capabilities.sh" ] && { . "${_AA_SENTINEL}/lib/detect_capabilities.sh" "$T"; }
    cat <<EOF
{"device_id":"$T","platform_family":"androidtv","control_plane":"adb","soc_family":"${SOC_FAMILY:-generic}","player":"${PLAYER:-unknown}","can_apply_system_settings":true,"can_apply_memc":$( [ "${SOC_FAMILY:-}" = amlogic ] || [ "${SOC_FAMILY:-}" = mediatek ] || [ "${SOC_FAMILY:-}" = realtek ] || [ "${SOC_FAMILY:-}" = rockchip ] && echo true || echo false),"can_install_sentinel":true,"can_apply_manifest_hints":true,"can_apply_stream_profile":true,"risk_level":"low","enh_version":"$APE_ENH_VERSION"}
EOF
}
can_install_sentinel()     { return 0; }
can_apply_system_settings(){ return 0; }
can_apply_memc()           { [ "${SOC_FAMILY:-generic}" != generic ] && [ "${SOC_FAMILY:-generic}" != qualcomm ]; }
can_apply_player_hints()   { return 0; }
apply_visual_profile() {  # <target>  → delega al perfil polimórfico idempotente
    [ -f "${_AA_SENTINEL}/profiles/generic_player.sh" ] || { echo "memc_status=NOT_SUPPORTED (no profile)"; return 0; }
    # shellcheck source=/dev/null
    . "${_AA_SENTINEL}/profiles/generic_player.sh"
    apply_generic_profile "$1"
}
apply_antibuffer_profile() {  # <target>  → whitelist anti-doze ya en apply_player; aquí refuerza buffers seguros
    local T="$1"
    adb -s "$T" shell "settings put global match_content_frame_rate 1" >/dev/null 2>&1 || true
}
verify_profile() {  # <target>
    local T="$1" v
    v="$(adb -s "$T" shell getprop persist.ape.enh.version 2>/dev/null | tr -d '\r\n')"
    [ "$v" = "$APE_ENH_VERSION" ] && echo "verify=OK enh=$v" || echo "verify=PENDING enh=${v:-none}"
}
rollback_profile() {  # <target>  → borra marcador (re-aplicación en próximo ciclo)
    adb -s "$1" shell "setprop persist.ape.enh.version ''" >/dev/null 2>&1 || true
}
