#!/bin/bash
# Adapter: generic_network — fallback network-safe para devices clasificados pero sin plano de control rico.
# Hace health/ping + registro + manifest hints. Nunca toca el device. Graceful.
: "${APE_ENH_VERSION:=2026.06-universal-1}"
detect_platform() { echo "smarttv"; }
detect_capabilities() {  # <target>
    cat <<EOF
{"device_id":"$1","platform_family":"smarttv","control_plane":"network_only","soc_family":"unknown","player":"unknown","can_apply_system_settings":false,"can_apply_memc":false,"can_install_sentinel":false,"can_apply_manifest_hints":true,"can_apply_stream_profile":true,"risk_level":"low","enh_version":"$APE_ENH_VERSION"}
EOF
}
can_install_sentinel()     { return 1; }
can_apply_system_settings(){ return 1; }
can_apply_memc()           { return 1; }
can_apply_player_hints()   { return 0; }
apply_visual_profile()     { echo "system_settings=NOT_SUPPORTED memc_status=NOT_SUPPORTED visual=manifest/network hints"; return 0; }
apply_antibuffer_profile() { echo "antibuffer=server_side (ABR conservador + codec compatible)"; return 0; }
verify_profile() {  # <target> → ping
    local ip; ip="${1%%:*}"
    if ping -c1 -W2 "$ip" >/dev/null 2>&1; then echo "verify=OK reachable=true"; else echo "verify=PENDING reachable=false"; fi
}
rollback_profile() { echo "rollback=noop"; return 0; }
