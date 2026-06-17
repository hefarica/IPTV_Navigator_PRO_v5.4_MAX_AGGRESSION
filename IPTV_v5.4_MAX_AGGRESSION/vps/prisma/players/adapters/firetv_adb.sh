#!/bin/bash
# Adapter: Amazon Fire TV / Fire Stick — CONTROL_PLANE=adb (hereda android_adb + Fire-safe)
# Fire-safe: NO toca servicios críticos de Amazon, NO mata launcher/player, NO rompe Prime/DRM.
: "${APE_ENH_VERSION:=2026.06-universal-1}"
_FT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=/dev/null
. "${_FT_DIR}/android_adb.sh"   # hereda contrato Android

detect_platform() { echo "firetv"; }
detect_capabilities() {  # <target>
    local T="$1"
    [ -f "$(cd "${_FT_DIR}/../../../sentinel" 2>/dev/null && pwd)/lib/detect_capabilities.sh" ] && \
        . "$(cd "${_FT_DIR}/../../../sentinel" && pwd)/lib/detect_capabilities.sh" "$T"
    cat <<EOF
{"device_id":"$T","platform_family":"firetv","control_plane":"adb","soc_family":"${SOC_FAMILY:-mediatek}","player":"${PLAYER:-unknown}","can_apply_system_settings":true,"can_apply_memc":$( can_apply_memc && echo true || echo false ),"can_install_sentinel":true,"can_apply_manifest_hints":true,"can_apply_stream_profile":true,"risk_level":"medium","enh_version":"$APE_ENH_VERSION"}
EOF
}
# Fire-safe overrides: aplica universal + SoC, pero NO toca paquetes Amazon ni MEMC obligatorio.
apply_visual_profile() {  # <target>
    local T="$1"
    local _sent; _sent="$(cd "${_FT_DIR}/../../../sentinel" 2>/dev/null && pwd)"
    [ -f "${_sent}/profiles/generic_player.sh" ] || { echo "memc_status=NOT_SUPPORTED"; return 0; }
    # shellcheck source=/dev/null
    . "${_sent}/profiles/generic_player.sh"
    # Fire-safe: no whitelisteamos paquetes de sistema Amazon; el perfil genérico ya es no-destructivo.
    apply_generic_profile "$T"
}
# can_install_sentinel/can_apply_system_settings/etc heredados de android_adb.sh
