#!/bin/bash
# Adapter: Roku — CONTROL_PLANE=roku_ecp | network_only
# VERDAD TÉCNICA: Roku NO tiene ADB ni `settings put`. NO se instala sentinel.
# Solo: descubrimiento ECP, app/channel detection, health/ping, manifest/stream hints.
# NUNCA promete control de sistema ni MEMC interno (Roku no expone esa API).
: "${APE_ENH_VERSION:=2026.06-universal-1}"
_roku_ip() { echo "${1%%:*}"; }

detect_platform() { echo "roku"; }
detect_capabilities() {  # <target>
    local T="$1" ip; ip="$(_roku_ip "$T")"
    local active=""
    command -v curl >/dev/null 2>&1 && active="$(curl -s -m 3 "http://${ip}:8060/query/active-app" 2>/dev/null | tr -d '\r\n')"
    cat <<EOF
{"device_id":"$T","platform_family":"roku","control_plane":"roku_ecp","soc_family":"unknown","player":"roku_channel","can_apply_system_settings":false,"can_apply_memc":false,"can_install_sentinel":false,"can_apply_manifest_hints":true,"can_apply_stream_profile":true,"risk_level":"low","enh_version":"$APE_ENH_VERSION","active_app":"$(printf '%s' "$active" | sed 's/"/'"'"'/g' | cut -c1-120)"}
EOF
}
can_install_sentinel()     { return 1; }   # NO ADB
can_apply_system_settings(){ return 1; }   # NO settings put
can_apply_memc()           { return 1; }   # Roku no expone MEMC
can_apply_player_hints()   { return 0; }   # vía manifest/stream
apply_visual_profile() {  # <target>
    echo "system_settings=NOT_SUPPORTED memc_status=NOT_SUPPORTED"
    echo "visual=manifest_only (selección de variante/codec compatible vía lista/stream server-side)"
    return 0
}
apply_antibuffer_profile() {  # <target>  → solo server-side: ladder seguro, ABR conservador
    echo "antibuffer=server_side (codec compatible + ABR conservador + evitar fake-4K que cause rebuffer)"
    return 0
}
verify_profile() {  # <target> → ping ECP
    local ip; ip="$(_roku_ip "$1")"
    if command -v curl >/dev/null 2>&1 && curl -s -m 3 "http://${ip}:8060/query/device-info" >/dev/null 2>&1; then
        echo "verify=OK ecp_reachable=true"
    else
        echo "verify=PENDING ecp_reachable=false"
    fi
}
rollback_profile() { echo "rollback=noop (Roku no recibe cambios de sistema)"; return 0; }
