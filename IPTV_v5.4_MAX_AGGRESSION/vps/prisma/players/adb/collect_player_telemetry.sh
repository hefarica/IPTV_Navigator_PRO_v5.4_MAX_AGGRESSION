#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — ADB Player Software Telemetry Collector  (PLAYER PLAYBACK PLANE)
# Observa CÓMO el player reproduce realmente (codec/decoder/res/fps/buffer/
# dropped/judder/error) vía ADB. Best-effort · timeout-safe · NO bloqueante ·
# read-only (no settings, no kill, no logcat infinito: logcat -d -t 300).
# Compatible Android TV / Fire TV. NUNCA miente: lo que no se sabe → unknown.
#
# Uso:  . collect_player_telemetry.sh ; collect_player_telemetry <ip:port>
#       → exporta TEL_* y imprime JSON (o KEY=VALUE si no hay jq).
# ══════════════════════════════════════════════════════════════════════════

_adb() { timeout "${ADB_TO:-6}" adb -s "$T" shell "$@" 2>/dev/null | tr -d '\r'; }

collect_player_telemetry() {
    T="$1"
    [ -z "$T" ] && { echo "TEL_ERROR=no_target"; return 1; }

    # Defaults honestos
    TEL_FG_PKG=unknown; TEL_FG_ACT=unknown; TEL_PLAYER=unknown
    TEL_CODEC_VIDEO=unknown; TEL_CODEC_AUDIO=unknown; TEL_DECODER=unknown
    TEL_HW_DECODE=unknown; TEL_RES=unknown; TEL_FPS=unknown; TEL_HDR=unknown
    TEL_BUFFER=unknown; TEL_DROPPED=0; TEL_JUDDER=false; TEL_LAST_ERROR=none
    TEL_CONFIDENCE=0.0

    if ! _adb echo ok | grep -q ok; then
        TEL_ERROR=adb_unreachable; _emit_telemetry; return 0
    fi
    local conf=0

    # 1) Foreground app/activity
    local win
    win="$(_adb dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' | head -2)"
    [ -z "$win" ] && win="$(_adb dumpsys activity activities | grep -E 'ResumedActivity|topResumedActivity' | head -1)"
    TEL_FG_PKG="$(printf '%s' "$win" | grep -oE '[a-zA-Z0-9_.]+/[a-zA-Z0-9_.$]+' | head -1 | cut -d/ -f1)"
    TEL_FG_ACT="$(printf '%s' "$win" | grep -oE '[a-zA-Z0-9_.]+/[a-zA-Z0-9_.$]+' | head -1 | cut -d/ -f2)"
    [ -n "$TEL_FG_PKG" ] && conf=$((conf+20))
    case "$TEL_FG_PKG" in
        *ottnavigator*) TEL_PLAYER=ottnavigator ;;
        *ar.tvplayer.tv*) TEL_PLAYER=tivimate ;;
        *org.videolan.vlc*) TEL_PLAYER=vlc ;;
        *org.xbmc.kodi*) TEL_PLAYER=kodi ;;
        *smarters*) TEL_PLAYER=smarters ;;
        *) TEL_PLAYER=unknown ;;
    esac

    # 2) MediaCodec / codec activo / decoder
    local mc
    mc="$(_adb dumpsys media.codec | grep -iE 'video/|audio/|OMX\.|c2\.|state|fps' | head -40)"
    [ -z "$mc" ] && mc="$(_adb dumpsys media.metrics | grep -iE 'mime|codec|video/|audio/' | head -40)"
    case "$mc" in
        *video/hevc*|*video/x-hevc*) TEL_CODEC_VIDEO=hevc ;;
        *video/avc*)                 TEL_CODEC_VIDEO=h264 ;;
        *video/av01*)                TEL_CODEC_VIDEO=av1 ;;
        *video/x-vnd.on2.vp9*|*video/vp9*) TEL_CODEC_VIDEO=vp9 ;;
        *video/mpeg2*)               TEL_CODEC_VIDEO=mpeg2 ;;
    esac
    case "$mc" in
        *audio/mp4a*|*audio/aac*) TEL_CODEC_AUDIO=aac ;;
        *audio/eac3*|*audio/ec-3*) TEL_CODEC_AUDIO=eac3 ;;
        *audio/ac3*) TEL_CODEC_AUDIO=ac3 ;;
        *audio/mpeg*) TEL_CODEC_AUDIO=mp2 ;;
        *audio/opus*) TEL_CODEC_AUDIO=opus ;;
    esac
    TEL_DECODER="$(printf '%s' "$mc" | grep -oE '(OMX\.[A-Za-z0-9._]+|c2\.[A-Za-z0-9._]+)' | head -1)"
    [ -z "$TEL_DECODER" ] && TEL_DECODER=unknown
    case "$TEL_DECODER" in
        OMX.google.*|c2.android.*) TEL_HW_DECODE=false ;;   # google/android = software
        OMX.*|c2.*)                TEL_HW_DECODE=true ;;     # vendor = hardware
        *)                         TEL_HW_DECODE=unknown ;;
    esac
    [ "$TEL_CODEC_VIDEO" != unknown ] && conf=$((conf+25))

    # 3) SurfaceFlinger / display: resolución + refresh
    local sf
    sf="$(_adb dumpsys SurfaceFlinger --display-id 2>/dev/null; _adb dumpsys display | grep -iE 'mDisplayWidth|mDisplayHeight|refresh|fps|active mode|real ' | head -20)"
    TEL_RES="$(printf '%s' "$sf" | grep -oE '[0-9]{3,4} ?x ?[0-9]{3,4}' | tr -d ' ' | sort | uniq -c | sort -rn | head -1 | grep -oE '[0-9]+x[0-9]+')"
    [ -z "$TEL_RES" ] && TEL_RES=unknown
    TEL_FPS="$(printf '%s' "$sf" | grep -oiE 'fps=?[0-9.]+|[0-9.]+ ?fps|[0-9.]+Hz' | grep -oE '[0-9.]+' | head -1)"
    [ -z "$TEL_FPS" ] && TEL_FPS=unknown
    [ "$TEL_RES" != unknown ] && conf=$((conf+15))

    # 4) HDR (display capabilities, best-effort)
    local hdr
    hdr="$(_adb dumpsys display | grep -iE 'hdr|dolby|hlg|st2084|pq' | head -5)"
    case "$hdr" in
        *DOLBY_VISION*|*dolby*) TEL_HDR=dolby_vision ;;
        *HDR10*|*ST2084*|*st2084*|*PQ*) TEL_HDR=hdr10 ;;
        *HLG*|*hlg*) TEL_HDR=hlg ;;
        "") TEL_HDR=unknown ;;
        *) TEL_HDR=sdr ;;
    esac

    # 5) Logcat acotado (rebuffer/dropped/errors/judder) — -d -t 300 (no infinito)
    local lc
    lc="$(timeout "${ADB_TO:-6}" adb -s "$T" logcat -d -t 300 2>/dev/null | tr -d '\r' | grep -Ei 'ExoPlayer|MediaCodec|OMX|CCodec|buffer|rebuffer|dropped|frame|fps|decoder|error|stall|video/|audio/' | tail -120)"
    case "$lc" in *[Rr]ebuffer*|*BUFFERING*) TEL_BUFFER=rebuffer ;; *) :; esac
    case "$lc" in *[Ll]ow*buffer*|*buffer*low*) [ "$TEL_BUFFER" = unknown ] && TEL_BUFFER=low ;; esac
    [ "$TEL_BUFFER" = unknown ] && [ -n "$lc" ] && TEL_BUFFER=ok
    local dropped
    dropped="$(printf '%s' "$lc" | grep -oiE 'dropped[^0-9]*([0-9]+)|([0-9]+) dropped' | grep -oE '[0-9]+' | sort -rn | head -1)"
    [ -n "$dropped" ] && TEL_DROPPED="$dropped"
    [ "${TEL_DROPPED:-0}" -gt 30 ] 2>/dev/null && TEL_JUDDER=true
    case "$lc" in *[Jj]udder*|*frame*pacing*) TEL_JUDDER=true ;; esac
    TEL_LAST_ERROR="$(printf '%s' "$lc" | grep -iE 'error|exception|fail' | tail -1 | cut -c1-100)"
    [ -z "$TEL_LAST_ERROR" ] && TEL_LAST_ERROR=none
    [ -n "$lc" ] && conf=$((conf+20))

    # Confianza 0.0-1.0
    TEL_CONFIDENCE="$(awk "BEGIN{printf \"%.2f\", ($conf>100?100:$conf)/100}")"
    _emit_telemetry
}

_emit_telemetry() {
    local ts; ts="$(date -u +%FT%TZ 2>/dev/null || echo unknown)"
    if command -v jq >/dev/null 2>&1; then
        jq -n --arg d "$T" --arg ts "$ts" --arg fp "${TEL_FG_PKG:-unknown}" --arg fa "${TEL_FG_ACT:-unknown}" \
           --arg pl "${TEL_PLAYER:-unknown}" --arg cv "${TEL_CODEC_VIDEO:-unknown}" --arg ca "${TEL_CODEC_AUDIO:-unknown}" \
           --arg dec "${TEL_DECODER:-unknown}" --arg hw "${TEL_HW_DECODE:-unknown}" --arg res "${TEL_RES:-unknown}" \
           --arg fps "${TEL_FPS:-unknown}" --arg hdr "${TEL_HDR:-unknown}" --arg bf "${TEL_BUFFER:-unknown}" \
           --arg dr "${TEL_DROPPED:-0}" --arg ju "${TEL_JUDDER:-false}" --arg er "${TEL_LAST_ERROR:-none}" \
           --arg cf "${TEL_CONFIDENCE:-0.0}" \
           '{device:$d,timestamp:$ts,foreground_package:$fp,foreground_activity:$fa,player_family:$pl,codec_video:$cv,codec_audio:$ca,decoder_name:$dec,hardware_decode:$hw,resolution:$res,fps:$fps,hdr:$hdr,buffer_state:$bf,dropped_frames:$dr,judder:$ju,last_error:$er,confidence:$cf}' 2>/dev/null && return
    fi
    cat <<EOF
TEL_DEVICE='$T'
TEL_FG_PKG='${TEL_FG_PKG:-unknown}'
TEL_PLAYER='${TEL_PLAYER:-unknown}'
TEL_CODEC_VIDEO='${TEL_CODEC_VIDEO:-unknown}'
TEL_CODEC_AUDIO='${TEL_CODEC_AUDIO:-unknown}'
TEL_DECODER='${TEL_DECODER:-unknown}'
TEL_HW_DECODE='${TEL_HW_DECODE:-unknown}'
TEL_RES='${TEL_RES:-unknown}'
TEL_FPS='${TEL_FPS:-unknown}'
TEL_HDR='${TEL_HDR:-unknown}'
TEL_BUFFER='${TEL_BUFFER:-unknown}'
TEL_DROPPED='${TEL_DROPPED:-0}'
TEL_JUDDER='${TEL_JUDDER:-false}'
TEL_LAST_ERROR='${TEL_LAST_ERROR:-none}'
TEL_CONFIDENCE='${TEL_CONFIDENCE:-0.0}'
EOF
}

# Standalone
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ] && [ -n "${1:-}" ]; then collect_player_telemetry "$1"; fi
