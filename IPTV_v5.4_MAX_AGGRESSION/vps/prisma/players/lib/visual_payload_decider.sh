#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — Visual Payload Decider (Visual Decision Plane)
# Cruza los 4 planos (Device + TV + Player + Network/Stream) → "carga visual"
# que el VPS entrega para que el device/player/TV hagan el trabajo. SIN reproceso.
# VERDAD TÉCNICA: no fake 4K/HDR/codec, MEMC evita judder, no rompe continuidad.
#
# Entradas (env, set por los probes): CAP_* TV_* TEL_* NET_* MV_*
# Salida (echo + globals VP_*): visual_profile selected_variant preferred_codec
#   preferred_resolution fps_policy hdr_policy memc_policy super_resolution_policy
#   color_policy sharpness_policy anti_rebuffer_policy reason risk confidence
# ══════════════════════════════════════════════════════════════════════════
: "${DROPPED_THRESHOLD:=30}"

visual_payload_decider() {
    # Plano player
    local codec="${TEL_CODEC_VIDEO:-unknown}" hw="${TEL_HW_DECODE:-unknown}" buf="${TEL_BUFFER:-unknown}"
    local dropped="${TEL_DROPPED:-0}" judder="${TEL_JUDDER:-false}" phdr="${TEL_HDR:-unknown}" fg="${TEL_FG_PKG:-unknown}"
    # Plano device/TV
    local soc="${CAP_SOC_FAMILY:-generic}" can_memc="${CAP_CAN_MEMC:-false}"
    local tv_res="${TV_RES_MAX:-unknown}" tv_up="${TV_UPSCALER:-unknown}" tv_sr="${TV_SR:-unknown}" tv_memc="${TV_MEMC:-unknown}"
    # Plano network/stream
    local net="${NET_SCORE:-unknown}" zap="${NET_ZAPPING:-false}" prov="${NET_PROVIDER:-stable}"
    local has4k="${MV_HAS_4K:-false}" hashevc="${MV_HAS_HEVC:-false}" hashdr="${MV_HAS_HDR:-false}"
    local v_best="${MV_BEST_VISUAL:-}" v_safe="${MV_SAFEST:-}" v_anti="${MV_ANTIREBUFFER:-}"

    # Defaults truthful
    VP_PROFILE=TRUTHFUL_SOURCE_SAFE; VP_VARIANT="${v_safe:-source}"; VP_CODEC=source
    VP_RES=source; VP_FPS=source; VP_HDR=disable_fake_hdr
    VP_MEMC=$( [ "$can_memc" = true ] && echo enable || echo not_supported )
    VP_SR=$( [ "$tv_sr" = available ] && echo enable || echo not_supported )
    VP_COLOR=source_safe; VP_SHARP=adaptive_safe; VP_ANTIREBUFFER=balanced
    VP_REASON=""; VP_RISK=low; VP_CONF=0.5

    # HDR: solo si fuente Y player/TV lo soportan probado
    if [ "$hashdr" = true ] && { [ "$phdr" = hdr10 ] || [ "$phdr" = hlg ] || [ "$phdr" = dolby_vision ]; }; then
        VP_HDR=hdr_if_proven
    else
        VP_HDR=disable_fake_hdr
    fi

    # ── TRUTHFUL: telemetría incompleta / no foreground / manifest pobre / codec unknown ──
    if [ "$codec" = unknown ] || [ "$fg" = unknown ] || [ "${MV_STATUS:-FAILED}" = FAILED ]; then
        VP_PROFILE=TRUTHFUL_SOURCE_SAFE; VP_CODEC=source; VP_VARIANT="${v_safe:-source}"
        VP_MEMC=disable; VP_REASON="codec/foreground/manifest desconocido → source-safe (no fake)"; VP_RISK=low
        _emit_vp; return 0
    fi

    # ── LOW_LATENCY: zapping frecuente / provider inestable / red baja ──
    if [ "$zap" = true ] || [ "$prov" = unstable ] || [ "$net" = low ]; then
        VP_PROFILE=LOW_LATENCY_SAFE; VP_VARIANT="${v_anti:-$v_safe}"; VP_CODEC=source
        VP_RES=source; VP_MEMC=disable; VP_ANTIREBUFFER=aggressive
        VP_REASON="zapping/provider inestable/buffer bajo → baja latencia + anti-rebuffer agresivo"; VP_RISK=medium
        _emit_vp; return 0
    fi

    # ── judder → evitar MEMC, sin fps fake ──
    if [ "$judder" = true ]; then VP_MEMC=avoid_due_to_judder; VP_FPS=source; fi

    # ── dropped altos → STABLE downgrade + MEMC off ──
    if [ "${dropped:-0}" -gt "$DROPPED_THRESHOLD" ] 2>/dev/null; then
        VP_PROFILE=STABLE_1080P_PREMIUM; VP_VARIANT="${v_anti:-$v_safe}"
        VP_CODEC=$( [ "$hashevc" = true ] && echo hevc || echo h264 ); VP_RES=1080p
        VP_MEMC=disable; VP_ANTIREBUFFER=balanced
        VP_REASON="dropped=$dropped>$DROPPED_THRESHOLD → 1080p estable + MEMC off"; VP_RISK=medium
        _emit_vp; return 0
    fi

    # ── HEVC software-decode / rebuffer / buffer bajo → STABLE ──
    if { [ "$codec" = hevc ] && [ "$hw" = false ]; } || [ "$buf" = rebuffer ] || [ "$buf" = low ]; then
        VP_PROFILE=STABLE_1080P_PREMIUM; VP_VARIANT="${v_anti:-$v_safe}"; VP_CODEC=h264; VP_RES=1080p
        VP_ANTIREBUFFER=balanced
        VP_REASON="HEVC sw-decode / rebuffer → H264 1080p estable"; VP_RISK=medium
        _emit_vp; return 0
    fi

    # ── CRYSTAL_UHD_EXTREME: todo alineado al máximo ──
    local tv_h; tv_h="$(printf '%s' "$tv_res" | grep -oE 'x[0-9]+' | tr -d x)"; tv_h="${tv_h:-0}"
    if [ "$has4k" = true ] && [ "$hw" = true ] && [ "$buf" = ok ] && [ "${dropped:-0}" -eq 0 ] \
       && [ "$judder" = false ] && [ "$net" = high ] && [ "${tv_h:-0}" -ge 2160 ] 2>/dev/null; then
        VP_PROFILE=CRYSTAL_UHD_EXTREME; VP_VARIANT="${v_best:-source}"
        VP_CODEC=$( [ "$hashevc" = true ] && echo hevc || echo "$codec" ); VP_RES=2160p; VP_FPS=match_display
        VP_MEMC=$( [ "$tv_memc" = available ] && [ "$judder" = false ] && echo enable || echo "$VP_MEMC" )
        VP_SR=$( [ "$tv_sr" = available ] && echo enable || echo "$VP_SR" )
        VP_COLOR=oled_vivid_safe; VP_ANTIREBUFFER=visual_priority; VP_RISK=low; VP_CONF=0.9
        VP_REASON="4K real + HW decode + buffer OK + 0 dropped + sin judder + red alta + TV>=2160 → CRYSTAL UHD EXTREME"
        _emit_vp; return 0
    fi

    # ── CRYSTAL_UHD_SAFE: HEVC/AV1 HW estable ──
    if { [ "$codec" = hevc ] || [ "$codec" = av1 ]; } && [ "$hw" = true ] && { [ "$buf" = ok ] || [ "$buf" = unknown ]; }; then
        VP_PROFILE=CRYSTAL_UHD_SAFE; VP_VARIANT="${v_best:-source}"; VP_CODEC="$codec"
        VP_RES=$( [ "$has4k" = true ] && [ "${tv_h:-0}" -ge 2160 ] 2>/dev/null && echo 2160p || echo source )
        VP_ANTIREBUFFER=visual_priority; VP_COLOR=oled_vivid_safe; VP_CONF=0.8
        VP_REASON="HEVC/AV1 HW decode estable → CRYSTAL UHD SAFE"; VP_RISK=low
        _emit_vp; return 0
    fi

    # ── PERCEPTUAL_4K_BALANCED: fuente HD/FHD + TV upscaler estable ──
    if { [ "$tv_up" = true ] || [ "$tv_up" = likely ] || [ "$tv_sr" = available ]; } && [ "$buf" != rebuffer ] && [ "$net" != low ]; then
        VP_PROFILE=PERCEPTUAL_4K_BALANCED; VP_VARIANT="${v_best:-$v_anti}"; VP_CODEC="$codec"; VP_RES=source
        VP_SR=$( [ "$tv_sr" = available ] && echo enable || echo "$VP_SR" )
        VP_COLOR=oled_vivid_safe; VP_CONF=0.7
        VP_REASON="fuente HD/FHD + upscaler/SR del TV estable → perceptual 4K balanced"; VP_RISK=low
        _emit_vp; return 0
    fi

    VP_REASON="condiciones no concluyentes → source-safe"; _emit_vp
}
_emit_vp() {
    cat <<EOF
VP_PROFILE=$VP_PROFILE
VP_VARIANT=$VP_VARIANT
VP_CODEC=$VP_CODEC
VP_RES=$VP_RES
VP_FPS=$VP_FPS
VP_HDR=$VP_HDR
VP_MEMC=$VP_MEMC
VP_SR=$VP_SR
VP_COLOR=$VP_COLOR
VP_SHARP=$VP_SHARP
VP_ANTIREBUFFER=$VP_ANTIREBUFFER
VP_REASON=$VP_REASON
VP_RISK=$VP_RISK
VP_CONF=$VP_CONF
EOF
}
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ]; then visual_payload_decider; fi
