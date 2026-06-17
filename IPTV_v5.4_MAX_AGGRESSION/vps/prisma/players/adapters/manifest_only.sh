#!/bin/bash
# Adapter: manifest_only — cualquier device SIN control directo (web/smarttv/unknown)
# Solo aplica perfil de lista/stream (codec ladder, ABR, headers seguros) server-side.
# NO settings, NO sentinel, NO MEMC. Verdad técnica: source-safe únicamente.
: "${APE_ENH_VERSION:=2026.06-universal-1}"
detect_platform() { echo "web"; }
detect_capabilities() {  # <target>
    cat <<EOF
{"device_id":"$1","platform_family":"web","control_plane":"manifest","soc_family":"unknown","player":"unknown","can_apply_system_settings":false,"can_apply_memc":false,"can_install_sentinel":false,"can_apply_manifest_hints":true,"can_apply_stream_profile":true,"risk_level":"low","enh_version":"$APE_ENH_VERSION"}
EOF
}
can_install_sentinel()     { return 1; }
can_apply_system_settings(){ return 1; }
can_apply_memc()           { return 1; }
can_apply_player_hints()   { return 0; }
apply_visual_profile() {
    echo "system_settings=NOT_SUPPORTED memc_status=NOT_SUPPORTED"
    echo "visual=manifest_only: codec ladder HEVC-first + HDR solo si probado (no fake) + frame pacing/ABR"
    return 0
}
apply_antibuffer_profile() {
    echo "antibuffer=server_side: ladder conservador + codec compatible + evitar variantes pesadas"
    return 0
}
verify_profile()   { echo "verify=manifest_only (no device control)"; return 0; }
rollback_profile() { echo "rollback=noop (sin cambios de device)"; return 0; }
