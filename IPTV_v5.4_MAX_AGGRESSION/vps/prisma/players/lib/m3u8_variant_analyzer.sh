#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — M3U8 Variant Analyzer (Network/Stream Plane)
# Analiza un MASTER playlist (#EXT-X-STREAM-INF) SIN descargar/transcodificar video.
# Solo lee el texto del playlist (file o URL, head-limited). NO toca segmentos,
# NO modifica el stream, NO altera URLs. Si no se puede leer → FAILED (no miente).
# Uso: . m3u8_variant_analyzer.sh ; analyze_m3u8 <file|url>  → exporta MV_* + JSON
# ══════════════════════════════════════════════════════════════════════════
: "${M3U8_MAX_LINES:=4000}"

analyze_m3u8() {
    local src="$1" text=""
    MV_VARIANTS=0; MV_HAS_4K=false; MV_HAS_HEVC=false; MV_HAS_HDR=false
    MV_BEST_VISUAL=""; MV_SAFEST=""; MV_ANTIREBUFFER=""; MV_STATUS=ok
    [ -z "$src" ] && { MV_STATUS=FAILED; _emit_mv; return 1; }

    if [ -f "$src" ]; then
        text="$(head -n "$M3U8_MAX_LINES" "$src" 2>/dev/null)"
    elif printf '%s' "$src" | grep -qiE '^https?://'; then
        command -v curl >/dev/null 2>&1 || { MV_STATUS=FAILED; _emit_mv; return 1; }
        # Solo el texto del playlist (liviano), timeout corto, head-limited. NUNCA segmentos.
        text="$(curl -s -m 6 "$src" 2>/dev/null | head -n "$M3U8_MAX_LINES")"
    fi
    if ! printf '%s' "$text" | grep -q '#EXT-X-STREAM-INF'; then
        MV_STATUS=FAILED; _emit_mv; return 0   # no master / ilegible → no inventa variantes
    fi

    # Parse variantes: STREAM-INF (attrs) + siguiente línea no-comentario (URI)
    local best_score=-1 best_uri="" min_bw="" min_uri="" mid_uri=""
    local attr uri bw res codecs fr vrange score reslines=""
    while IFS= read -r line; do
        case "$line" in
            \#EXT-X-STREAM-INF:*) attr="$line"; uri="" ;;
            \#*) : ;;
            "") : ;;
            *)
                [ -z "$attr" ] && continue
                uri="$line"
                bw="$(printf '%s' "$attr" | grep -oiE 'BANDWIDTH=[0-9]+' | grep -oE '[0-9]+' | head -1)"; bw="${bw:-0}"
                res="$(printf '%s' "$attr" | grep -oiE 'RESOLUTION=[0-9]+x[0-9]+' | grep -oE '[0-9]+x[0-9]+' | head -1)"; res="${res:-unknown}"
                codecs="$(printf '%s' "$attr" | grep -oiE 'CODECS="[^"]*"' | sed 's/CODECS=//;s/"//g')"
                fr="$(printf '%s' "$attr" | grep -oiE 'FRAME-RATE=[0-9.]+' | grep -oE '[0-9.]+' | head -1)"; fr="${fr:-unknown}"
                vrange="$(printf '%s' "$attr" | grep -oiE 'VIDEO-RANGE=(PQ|HLG|SDR)' | sed 's/VIDEO-RANGE=//')"; vrange="${vrange:-unknown}"
                MV_VARIANTS=$((MV_VARIANTS+1))
                case "$res" in 3840x*|4096x*|7680x*) MV_HAS_4K=true ;; esac
                case "$codecs" in *hvc1*|*hev1*|*hevc*) MV_HAS_HEVC=true ;; esac
                case "$vrange" in PQ|HLG) MV_HAS_HDR=true ;; esac
                # Score visual: resolución (alto del res) + codec + bw + fps + hdr
                local h; h="$(printf '%s' "$res" | grep -oE 'x[0-9]+' | tr -d x)"; h="${h:-0}"
                score=$(( h/10 ))
                case "$codecs" in *hvc1*|*hev1*|*hevc*|*av01*) score=$((score+50)) ;; *avc1*) score=$((score+20)) ;; esac
                score=$((score + bw/1000000))
                case "$fr" in 5*|6*|59*) score=$((score+15)) ;; esac
                [ "$vrange" = PQ ] || [ "$vrange" = HLG ] && score=$((score+30))
                if [ "$score" -gt "$best_score" ]; then best_score="$score"; best_uri="$uri"; fi
                if [ -z "$min_bw" ] || [ "$bw" -lt "$min_bw" ]; then min_bw="$bw"; min_uri="$uri"; fi
                reslines="${reslines}${bw} ${uri}"$'\n'
                attr=""
                ;;
        esac
    done <<EOF
$text
EOF
    MV_BEST_VISUAL="$best_uri"
    MV_SAFEST="$min_uri"
    # anti-rebuffer = variante de bw medio (mediana simple)
    MV_ANTIREBUFFER="$(printf '%s' "$reslines" | grep -E '.' | sort -n | awk 'NR==int((n+1)/2)' n="$(printf '%s' "$reslines" | grep -cE '.')" | awk '{print $2}')"
    [ -z "$MV_ANTIREBUFFER" ] && MV_ANTIREBUFFER="$min_uri"
    _emit_mv
}
_emit_mv() {
    cat <<EOF
MV_STATUS='${MV_STATUS:-FAILED}'
MV_VARIANTS='${MV_VARIANTS:-0}'
MV_HAS_4K='${MV_HAS_4K:-false}'
MV_HAS_HEVC='${MV_HAS_HEVC:-false}'
MV_HAS_HDR='${MV_HAS_HDR:-false}'
MV_BEST_VISUAL='${MV_BEST_VISUAL:-}'
MV_SAFEST='${MV_SAFEST:-}'
MV_ANTIREBUFFER='${MV_ANTIREBUFFER:-}'
EOF
}
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ] && [ -n "${1:-}" ]; then analyze_m3u8 "$1"; fi
