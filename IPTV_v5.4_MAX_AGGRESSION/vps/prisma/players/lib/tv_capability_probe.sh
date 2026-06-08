#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — TV Capability Probe (Device Capability Plane · plano TV/display)
# Infiere capacidades reales de pantalla/TV vía ADB (Android/Fire). Roku/Apple/web
# → unknown/manual (sin ADB). Best-effort · read-only · timeout-safe · NO miente.
# Uso: . tv_capability_probe.sh ; tv_capability_probe <ip:port>  → exporta TV_* + JSON
# ══════════════════════════════════════════════════════════════════════════
_tv_adb() { timeout "${ADB_TO:-6}" adb -s "$T" shell "$@" 2>/dev/null | tr -d '\r'; }

tv_capability_probe() {
    T="$1"
    TV_RES_MAX=unknown; TV_REFRESH="unknown"; TV_HDR=unknown; TV_DISPLAY_MODE=unknown
    TV_MATCH_FRAMERATE=false; TV_MATCH_RANGE=false
    TV_UPSCALER=unknown; TV_MEMC=unknown; TV_SR=unknown; TV_CONFIDENCE=0.0
    [ -z "$T" ] && { _emit_tv; return 1; }
    if ! _tv_adb echo ok | grep -q ok; then TV_PLANE=no_adb; _emit_tv; return 0; fi
    local conf=0
    local disp sf model board
    disp="$(_tv_adb dumpsys display)"
    sf="$(_tv_adb dumpsys SurfaceFlinger | grep -iE 'mode|hdr|color|width|height' | head -30)"
    model="$(_tv_adb getprop ro.product.model)"; board="$(_tv_adb getprop ro.board.platform)"

    # Resolución máxima soportada por el display
    TV_RES_MAX="$(printf '%s\n%s' "$disp" "$sf" | grep -oE '[0-9]{3,4} ?x ?[0-9]{3,4}' | tr -d ' ' | sort -t x -k1 -rn | head -1)"
    [ -z "$TV_RES_MAX" ] && TV_RES_MAX=unknown
    [ "$TV_RES_MAX" != unknown ] && conf=$((conf+25))

    # Refresh rates soportados
    TV_REFRESH="$(printf '%s' "$disp" | grep -oiE '[0-9]{2,3}\.?[0-9]* ?(fps|Hz)' | grep -oE '[0-9.]+' | sort -un | tr '\n' ',' | sed 's/,$//')"
    [ -z "$TV_REFRESH" ] && TV_REFRESH=unknown

    # HDR (solo si visible)
    case "$disp" in
        *DOLBY_VISION*|*dolby*) TV_HDR=dolby_vision; conf=$((conf+15)) ;;
        *HDR10*|*ST2084*|*PQ*)  TV_HDR=hdr10; conf=$((conf+15)) ;;
        *HLG*)                  TV_HDR=hlg; conf=$((conf+15)) ;;
        "")                     TV_HDR=unknown ;;
        *)                      TV_HDR=sdr ;;
    esac

    # Frame-rate / dynamic-range matching (settings)
    [ "$(_tv_adb settings get global match_content_frame_rate)" = "1" ] && TV_MATCH_FRAMERATE=true
    case "$disp" in *match_content_dynamic_range*1*|*hdr_conversion*) TV_MATCH_RANGE=true ;; esac

    # Upscaler / MEMC / Super-Resolution (props/keys best-effort)
    case "$board" in *amlogic*|*s905*|*s922*|*t9*) TV_UPSCALER=true; TV_SR=available; TV_MEMC=available ;; esac
    [ "$(_tv_adb getprop persist.sys.memc.enable)" != "" ] && TV_MEMC=available
    [ "$(_tv_adb getprop ro.vendor.aisr.support 2>/dev/null)" = "1" ] && TV_SR=available
    [ "$TV_UPSCALER" = unknown ] && TV_UPSCALER=$( [ "$TV_RES_MAX" != unknown ] && echo likely || echo unknown )

    TV_CONFIDENCE="$(awk "BEGIN{printf \"%.2f\", ($conf>100?100:$conf)/100}")"
    _emit_tv
}
_emit_tv() {
    cat <<EOF
TV_RES_MAX='${TV_RES_MAX:-unknown}'
TV_REFRESH='${TV_REFRESH:-unknown}'
TV_HDR='${TV_HDR:-unknown}'
TV_DISPLAY_MODE='${TV_DISPLAY_MODE:-unknown}'
TV_MATCH_FRAMERATE='${TV_MATCH_FRAMERATE:-false}'
TV_MATCH_RANGE='${TV_MATCH_RANGE:-false}'
TV_UPSCALER='${TV_UPSCALER:-unknown}'
TV_MEMC='${TV_MEMC:-unknown}'
TV_SR='${TV_SR:-unknown}'
TV_CONFIDENCE='${TV_CONFIDENCE:-0.0}'
EOF
}
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ] && [ -n "${1:-}" ]; then tv_capability_probe "$1"; fi
