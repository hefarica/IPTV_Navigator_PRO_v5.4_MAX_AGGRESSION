#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-zapping-meter.sh   (fuente: tools/ops/ape-zapping-meter.sh)
#
# MIDE EL ZAPPEO REAL del operador a partir del log del VPS, sin tocar el device.
#
# QUE MIDE
#   Por cada zapeo (una peticion GET /pulse/<id> que abre un canal), el arco:
#       t0 = manifiesto pedido
#       t1 = primer /seg/ pedido      -> "arranque de red"
#       t2 = primer /seg/ completado  -> "primer byte de video"
#   Y el regimen: cada cuanto pide segmentos el player y cuanto tarda cada uno.
#
# POR QUE DEL LOG Y NO DEL DEVICE
#   El device no expone el primer fotograma sin root, y OTT no publica MediaSession
#   (medido). Lo que SI es medible con precision es la parte del servidor: cuando el
#   player pide y cuando recibe. Eso da el tiempo de arranque reproducible; el resto
#   (decodificar y pintar) es del SoC y no se puede afirmar sin medirlo en pantalla.
#
#   HONESTIDAD: este script NO da "tap -> primer fotograma". Da
#   "peticion -> primer segmento servido". El tap y el render no estan en el log.
#   Llamarlo "tiempo de zapping del servidor" y no confundirlo con el total.
#
# USO
#   bash tools/ops/ape-zapping-meter.sh                # ultimos 30 min
#   bash tools/ops/ape-zapping-meter.sh 60             # ultimos 60 min
#   bash tools/ops/ape-zapping-meter.sh --json
#
#   Se ejecuta DESDE el VPS (lee /var/log/nginx/playlist_access.log).
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

LOG="${APE_PLAYLIST_LOG:-/var/log/nginx/playlist_access.log}"
MIN="${1:-30}"
JSON=0
[ "${1:-}" = "--json" ] && { JSON=1; MIN=30; }
case "$MIN" in ''|*[!0-9]*) MIN=30 ;; esac

if [ ! -r "$LOG" ]; then
  echo "no puedo leer $LOG" >&2
  exit 2
fi

# ── Extrae una linea por evento: epoch<TAB>tipo<TAB>id<TAB>bytes<TAB>rt ───────
# El log usa el formato ape_playlist: ... "GET /pulse/<id>.m3u8?... HTTP/1.1" 200 ...
# Se convierte la fecha a epoch con date (GNU coreutils en el VPS).
extraer() {
  awk -v corte="$(( $(date -u +%s) - MIN*60 ))" '
    function mes(m,   i) {
      split("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec", M, " ")
      for (i=1;i<=12;i++) if (M[i]==m) return i
      return 1
    }
    {
      # [14/Nov/2026:23:52:56 +0000]
      if (match($0, /\[[0-9]{2}\/[A-Za-z]{3}\/[0-9]{4}:[0-9]{2}:[0-9]{2}:[0-9]{2}/)) {
        ts = substr($0, RSTART+1, RLENGTH-1)
        d = substr(ts,1,2); mo = substr(ts,4,3); y = substr(ts,8,4)
        hh = substr(ts,13,2); mi = substr(ts,16,2); ss = substr(ts,19,2)
        e = mktime(y " " mes(mo) " " d " " hh " " mi " " ss)
      } else next
      if (e < corte) next

      tipo=""; id=""; bytes=""; rt=""
      if (match($0, /GET \/pulse\/[0-9]+/)) {
        tipo="pulse"; id=substr($0, RSTART+11, RLENGTH-11); id=id+0
      } else if (match($0, /GET \/seg\//)) {
        tipo="seg"
        if (match($0, /" ([0-9]{3}) ([0-9]+) /)) { bytes=substr($0,RSTART,RLENGTH); gsub(/[^0-9 ]/,"",bytes); split(bytes,B," "); bytes=B[2] }
      } else next
      if (match($0, /rt=[0-9.]+/)) rt=substr($0,RSTART+3,RLENGTH-3)
      printf "%d\t%s\t%s\t%s\t%s\n", e, tipo, (id==""?"0":id), (bytes==""?"0":bytes), (rt==""?"0":rt)
    }
  ' "$LOG"
}

E="$(extraer)"

if [ -z "$E" ]; then
  if [ "$JSON" -eq 1 ]; then echo '{"verdict":"SIN_DATOS","ventana_min":'$MIN'}'; else echo "sin actividad en los ultimos $MIN min"; fi
  exit 0
fi

# ── Estadistica ──────────────────────────────────────────────────────────────
stats() { # $1=lista de numeros (ms) ; $2=etiqueta
  printf '%s\n' "$1" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -n | awk -v lbl="$2" '
    {a[NR]=$1}
    END{
      if (NR==0) { printf "  %-28s sin muestras\n", lbl; exit }
      printf "  %-28s n=%-4d min=%-6d p50=%-6d p90=%-6d max=%-6d ms\n", lbl, NR, a[1], a[int(NR*0.5)+1], a[int(NR*0.9)+1], a[NR]
    }'
}

# Arranque de red por zapeo: del pulse al primer seg (ms)
ARR=""
# Regimen: gap entre segs consecutivos (ms)
GAP=""
SEG_MS=""
CANALES=""
prev_pulse=0; prev_seg=0; en_zapeo=0

while IFS=$'\t' read -r e tipo id bytes rt; do
  [ -z "${e:-}" ] && continue
  if [ "$tipo" = "pulse" ]; then
    CANALES="$CANALES $id"
    prev_pulse="$e"; prev_seg=0; en_zapeo=1
  else
    # primer seg tras un pulse = arranque de red
    if [ "$en_zapeo" -eq 1 ] && [ "$prev_pulse" -gt 0 ] && [ "$prev_seg" -eq 0 ]; then
      ARR="$ARR $(( (e - prev_pulse) * 1000 ))"
      en_zapeo=0
    fi
    if [ "$prev_seg" -gt 0 ]; then
      d=$(( (e - prev_seg) * 1000 ))
      [ "$d" -gt 0 ] && [ "$d" -lt 30000 ] && GAP="$GAP $d"
    fi
    prev_seg="$e"
    # rt viene en segundos con decimales
    [ "$rt" != "0" ] && SEG_MS="$SEG_MS $(awk -v r="$rt" 'BEGIN{printf "%d", r*1000}')"
  fi
done <<< "$E"

N_ZAP=$(printf '%s' "$CANALES" | wc -w)
N_SEG=$(printf '%s\n' "$E" | grep -c 'seg' || true)

if [ "$JSON" -eq 1 ]; then
  esc() { printf '%s' "$1" | awk '{a[NR]=$1} END{printf "["; for(i=1;i<=NR;i++){printf "%s%s", (i>1?",":""), a[i]}; printf "]"}'; }
  printf '{"verdict":"MEDIDO","ventana_min":%d,"zapeos":%d,"segmentos":%d,"arranque_red_ms":%s,"gap_entre_segs_ms":%s,"servicio_seg_ms":%s,"canales":"%s"}\n' \
    "$MIN" "$N_ZAP" "$N_SEG" "$(esc "$ARR")" "$(esc "$GAP")" "$(esc "$SEG_MS")" \
    "$(printf '%s' "$CANALES" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u | tr '\n' ',' | sed 's/,$//')"
  exit 0
fi

echo "── APE CRYSTAL FLOW · zapeo medido del log (ultimos $MIN min) ──"
echo "  zapeos (manifiestos /pulse/): $N_ZAP"
echo "  segmentos servidos:          $N_SEG"
echo ""
stats "$ARR"    "arranque de red (ms)"
stats "$SEG_MS" "servicio de un seg (ms)"
stats "$GAP"    "gap entre segmentos (ms)"
echo ""
echo "  NOTA HONESTA: esto mide el lado del servidor (peticion -> segmento servido)."
echo "  No incluye el tap ni el primer fotograma: eso no esta en el log ni se puede"
echo "  leer del device sin root. Llamalo 'tiempo de arranque del servidor'."
if [ -n "$(printf '%s' "$CANALES" | tr -d ' ')" ]; then
  echo ""
  echo "  canales pedidos: $(printf '%s' "$CANALES" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u | tr '\n' ' ')"
fi
