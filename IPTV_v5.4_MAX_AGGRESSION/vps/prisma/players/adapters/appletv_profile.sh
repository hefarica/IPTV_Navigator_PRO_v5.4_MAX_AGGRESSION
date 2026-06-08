#!/bin/bash
# Adapter: Apple TV / tvOS — CONTROL_PLANE=mdm | app_config | network_only
# VERDAD TÉCNICA: tvOS NO tiene ADB ni shell. NO se modifican settings del sistema.
# Solo: app-side config (si hay app propia), MDM/config profiles (si hay administración),
# AirPlay/network discovery, manifest/profile hints, server-side stream optimization.
# NUNCA fake HDR, NUNCA forzar MEMC, NUNCA prometer control de sistema sin MDM/app.
: "${APE_ENH_VERSION:=2026.06-universal-1}"

detect_platform() { echo "appletv"; }
detect_capabilities() {  # <target>
    local T="$1"
    cat <<EOF
{"device_id":"$T","platform_family":"appletv","control_plane":"network_only","soc_family":"apple","player":"apple_tv_app","can_apply_system_settings":false,"can_apply_memc":false,"can_install_sentinel":false,"can_apply_manifest_hints":true,"can_apply_stream_profile":true,"risk_level":"low","enh_version":"$APE_ENH_VERSION"}
EOF
}
can_install_sentinel()     { return 1; }
can_apply_system_settings(){ return 1; }
can_apply_memc()           { return 1; }
can_apply_player_hints()   { return 0; }   # vía HLS profile / app config
apply_visual_profile() {
    echo "system_settings=NOT_SUPPORTED memc_status=NOT_SUPPORTED"
    echo "visual=manifest_only: HLS profile correcto + HEVC/HDR SOLO si probado (no fake HDR);"
    echo "       frame-rate matching y dynamic-range matching = RECOMENDACIÓN (app_config/MDM si existe)"
    return 0
}
apply_antibuffer_profile() {
    echo "antibuffer=server_side: ladder HLS seguro + codec compatible + ABR conservador"
    return 0
}
verify_profile() {  # <target> → AirPlay/info ping si disponible
    local ip; ip="${1%%:*}"
    if command -v curl >/dev/null 2>&1 && curl -s -m 3 "http://${ip}:7000/info" >/dev/null 2>&1; then
        echo "verify=OK airplay_reachable=true"
    else
        echo "verify=PENDING airplay_reachable=false (control real requiere app propia o MDM)"
    fi
}
rollback_profile() { echo "rollback=noop (tvOS no recibe cambios de sistema)"; return 0; }
