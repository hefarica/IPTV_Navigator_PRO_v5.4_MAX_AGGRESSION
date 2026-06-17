#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — Playback Profile Decider
# Une Device Capability Plane + Player Playback Plane → perfil de stream que el
# VPS debe entregar. VERDAD TÉCNICA: no fake HDR/codec/fps; MEMC evita judder.
#
# Entradas (env vars, set por collect_player_telemetry + detect_capabilities):
#   TEL_CODEC_VIDEO TEL_HW_DECODE TEL_BUFFER TEL_DROPPED TEL_JUDDER TEL_HDR
#   TEL_FPS TEL_RES TEL_PLAYER TEL_FG_PKG
#   CAP_SOC_FAMILY CAP_CAN_MEMC CAP_PLATFORM
# Salida (echo KEY=VALUE):
#   REC_PROFILE REC_CODEC REC_RESOLUTION REC_FPS HDR_POLICY MEMC_POLICY REASON RISK
# ══════════════════════════════════════════════════════════════════════════

: "${DROPPED_THRESHOLD:=30}"

playback_profile_decider() {
    local codec="${TEL_CODEC_VIDEO:-unknown}" hw="${TEL_HW_DECODE:-unknown}"
    local buf="${TEL_BUFFER:-unknown}" dropped="${TEL_DROPPED:-0}" judder="${TEL_JUDDER:-false}"
    local hdr="${TEL_HDR:-unknown}" fg="${TEL_FG_PKG:-unknown}" player="${TEL_PLAYER:-unknown}"
    local soc="${CAP_SOC_FAMILY:-generic}" can_memc="${CAP_CAN_MEMC:-false}"

    # Defaults seguros (truthful)
    REC_PROFILE=TRUTHFUL_SOURCE_SAFE; REC_CODEC=source; REC_RESOLUTION=source; REC_FPS=source
    HDR_POLICY=source; MEMC_POLICY=not_supported; REASON=""; RISK=low

    # MEMC base: solo si el SoC lo soporta
    if [ "$can_memc" = true ]; then MEMC_POLICY=enable; else MEMC_POLICY=not_supported; fi

    # R6: codec desconocido → no mentir
    if [ "$codec" = unknown ]; then
        REC_PROFILE=TRUTHFUL_SOURCE_SAFE; REC_CODEC=source; REASON="codec desconocido (no fake)"; RISK=low
        # R5/HDR: nunca fake HDR
        [ "$hdr" = unknown ] || [ "$hdr" = sdr ] && HDR_POLICY=disable_fake_hdr
        _emit_decision; return 0
    fi

    # R8: player NO en foreground → sin cambios agresivos
    if [ "$fg" = unknown ] || [ "$player" = unknown ]; then
        REC_PROFILE=TRUTHFUL_SOURCE_SAFE; REC_CODEC=source; MEMC_POLICY=disable
        REASON="player no en foreground/estable → sin cambios agresivos"; RISK=low
        _emit_decision; return 0
    fi

    # R3: dropped frames altos → bajar resolución/fps o desactivar MEMC
    if [ "${dropped:-0}" -gt "$DROPPED_THRESHOLD" ] 2>/dev/null; then
        REC_PROFILE=STABLE_1080P_PREMIUM; REC_CODEC="$( [ "$codec" = hevc ] && echo hevc || echo h264 )"
        REC_RESOLUTION=1080p; REC_FPS=source; MEMC_POLICY=disable
        REASON="dropped_frames=$dropped > $DROPPED_THRESHOLD → downgrade + MEMC off"; RISK=medium
        _emit_decision; return 0
    fi

    # R4: judder → evitar MEMC, no fake 60
    if [ "$judder" = true ]; then
        MEMC_POLICY=avoid_due_to_judder; REC_FPS=source
        REC_PROFILE=PERCEPTUAL_4K_BALANCED; REC_CODEC="$codec"
        REASON="judder detectado → MEMC evitado, sin 60fps fake"; RISK=medium
        [ "$hdr" = unknown ] || [ "$hdr" = sdr ] && HDR_POLICY=disable_fake_hdr
        _emit_decision; return 0
    fi

    # R2: HEVC en software decode o rebuffer → bajar a H264/1080p
    if { [ "$codec" = hevc ] && [ "$hw" = false ]; } || [ "$buf" = rebuffer ]; then
        REC_PROFILE=STABLE_1080P_PREMIUM; REC_CODEC=h264; REC_RESOLUTION=1080p
        MEMC_POLICY="$( [ "$can_memc" = true ] && echo enable || echo not_supported )"
        REASON="HEVC sw-decode o rebuffer → H264 1080p estable"; RISK=medium
        _emit_decision; return 0
    fi

    # R1+R7: HW decoder HEVC + buffer OK + foreground estable → calidad superior
    if [ "$codec" = hevc ] && [ "$hw" = true ] && { [ "$buf" = ok ] || [ "$buf" = unknown ]; }; then
        REC_PROFILE=CRYSTAL_UHD_SAFE; REC_CODEC=hevc; REC_RESOLUTION=2160p
        REC_FPS=source
        # HDR solo si probado
        case "$hdr" in hdr10|hlg|dolby_vision) HDR_POLICY=hdr_if_proven ;; *) HDR_POLICY=disable_fake_hdr ;; esac
        REASON="HW HEVC + buffer OK + foreground → CRYSTAL_UHD_SAFE"; RISK=low
        _emit_decision; return 0
    fi

    # HW H264/AV1/VP9 estable → perceptual balanced (sin mentir codec)
    if [ "$hw" = true ] && { [ "$buf" = ok ] || [ "$buf" = unknown ]; }; then
        REC_PROFILE=PERCEPTUAL_4K_BALANCED; REC_CODEC="$codec"; REC_RESOLUTION=source
        case "$hdr" in hdr10|hlg|dolby_vision) HDR_POLICY=hdr_if_proven ;; *) HDR_POLICY=disable_fake_hdr ;; esac
        REASON="HW decode estable ($codec) → perceptual balanced"; RISK=low
        _emit_decision; return 0
    fi

    # Fallback truthful
    REASON="condiciones no concluyentes → source-safe"; HDR_POLICY=disable_fake_hdr
    _emit_decision
}

_emit_decision() {
    cat <<EOF
REC_PROFILE=$REC_PROFILE
REC_CODEC=$REC_CODEC
REC_RESOLUTION=$REC_RESOLUTION
REC_FPS=$REC_FPS
HDR_POLICY=$HDR_POLICY
MEMC_POLICY=$MEMC_POLICY
REASON=$REASON
RISK=$RISK
EOF
}

# Standalone (para tests): toma TEL_*/CAP_* del entorno
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ]; then playback_profile_decider; fi
