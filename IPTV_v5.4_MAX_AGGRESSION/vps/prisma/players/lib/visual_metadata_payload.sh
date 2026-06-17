#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — Metadata Visual Payload Layer
# Traduce la decisión (VP_* del decider shell o el JSON del motor Rust) en una
# "carga visual" transmisible: JSON sidecar + props ADB + algorithm_stack (políticas,
# NO pixel-processing). NO toca video, NO inventa 4K/HDR/codec/fps (do_not_fake).
# Entrega por canal: Android/Fire (ADB), Roku/Apple/web (sidecar/manifest).
#
# Uso: . visual_metadata_payload.sh ; build_visual_payload_json ; emit_visual_payload <ip:port>
#   Requiere VP_* (decider) o vars equivalentes + APE_DEVICE_ID/APE_CHANNEL_ID/APE_PLAYER.
# ══════════════════════════════════════════════════════════════════════════
: "${APE_VISUAL_METADATA_VERSION:=2026.06-crystal-metadata-1}"

# algorithm_stack = ALGORITMOS COMO POLÍTICA/PARÁMETROS (no filtros de video en VPS).
# El device/player interpreta lo que pueda; si no, se aplica solo por manifest/variant/profile.
_algorithm_stack() {
    local memc="${VP_MEMC:-not_supported}" sr="${VP_SR:-not_supported}" sharp="${VP_SHARP:-adaptive_safe}"
    local color="${VP_COLOR:-source_safe}" anti="${VP_ANTIREBUFFER:-balanced}"
    cat <<EOF
[
{"name":"adaptive_safe_sharpness","mode":"edge_aware","strength":"${sharp}","avoid":["ringing","halo","mosquito_noise"]},
{"name":"oled_vivid_safe_color","mode":"chroma_luma_balance","saturation":"controlled","policy":"${color}","avoid":["clipping","posterization","fake_hdr"]},
{"name":"motion_crystal","mode":"frame_rate_match_or_memc","memc":"${memc}","avoid":["cadence_break","soap_opera_judder"]},
{"name":"anti_blur_texture_guard","mode":"preserve_texture","avoid":["waxy_faces","smear","over_denoise"]},
{"name":"super_resolution","mode":"device_engine","policy":"${sr}","avoid":["over_sharpen","fake_detail"]},
{"name":"anti_rebuffer_visual_guard","mode":"qoe_first","policy":"${anti}","downgrade_if":["buffer_low","dropped_frames_high","network_low"]}
]
EOF
}

build_visual_payload_json() {
    cat <<EOF
{"ape_visual_version":"${APE_VISUAL_METADATA_VERSION}",
"device_id":"${APE_DEVICE_ID:-unknown}","channel_id":"${APE_CHANNEL_ID:-unknown}","player":"${APE_PLAYER:-${PLAYER:-unknown}}",
"visual_profile":"${VP_PROFILE:-TRUTHFUL_SOURCE_SAFE}",
"selected_variant_url":"${APE_SELECTED_VARIANT_URL:-${VP_VARIANT:-source}}",
"variant_policy":"${VP_VARIANT_POLICY:-safe_visual}",
"codec_preference":"${VP_CODEC:-source}","resolution_target":"${VP_RES:-source}",
"fps_policy":"${VP_FPS:-source}","hdr_policy":"${VP_HDR:-disable_fake_hdr}",
"memc_policy":"${VP_MEMC:-not_supported}","super_resolution_policy":"${VP_SR:-not_supported}",
"sharpness_policy":"${VP_SHARP:-adaptive_safe}","color_policy":"${VP_COLOR:-source_safe}",
"anti_rebuffer_policy":"${VP_ANTIREBUFFER:-balanced}",
"codec_policy":{"preferred":"${VP_CODEC_LEVEL:-hvc1.2.4.L153.B0}","forbidden_default":"hvc1.2.4.L156.B0","allow_l156_only_if_capability_proven":true},
"do_not_fake":{"hdr":true,"4k":true,"codec":true,"fps":true},
"algorithm_stack":$(_algorithm_stack | tr -d '\n'),
"ttl_ms":${APE_PAYLOAD_TTL_MS:-30000},"issued_at":$(date +%s 2>/dev/null || echo 0),
"reason":"${VP_REASON:-}","confidence":${VP_CONF:-0.5}}
EOF
}

emit_visual_payload() {  # <ip:port>
    local T="$1" plane="${CONTROL_PLANE:-manual}"
    local payload; payload="$(build_visual_payload_json | tr -d '\n')"

    if [ "$plane" != adb ]; then
        # Roku / Apple TV / web → sidecar metadata / manifest / app config (NO device write)
        echo "$payload"
        echo "EMIT[$plane] sidecar/manifest only (device settings NOT_SUPPORTED)" >&2
        return 0
    fi

    # Android / Fire TV → props + sidecar JSON + broadcast best-effort (no rompe)
    local tmp="/data/local/tmp/ape-visual-payload.json"
    printf '%s' "$payload" | timeout 6 adb -s "$T" shell "cat > $tmp" >/dev/null 2>&1 || true
    timeout 6 adb -s "$T" shell "setprop persist.ape.visual.profile '${VP_PROFILE:-TRUTHFUL_SOURCE_SAFE}'" >/dev/null 2>&1 || true
    timeout 6 adb -s "$T" shell "setprop persist.ape.memc.policy '${VP_MEMC:-not_supported}'" >/dev/null 2>&1 || true
    timeout 6 adb -s "$T" shell "setprop persist.ape.hdr.policy '${VP_HDR:-disable_fake_hdr}'" >/dev/null 2>&1 || true
    timeout 6 adb -s "$T" shell "am broadcast -a com.ape.visual.PAYLOAD_APPLY" >/dev/null 2>&1 || true
    echo "$payload"
    echo "EMIT[adb] props+sidecar($tmp)+broadcast profile=${VP_PROFILE:-?}" >&2
}

if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ]; then
    build_visual_payload_json
fi
