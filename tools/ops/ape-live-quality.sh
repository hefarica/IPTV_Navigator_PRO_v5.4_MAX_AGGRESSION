#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# ape-live-quality.sh — medicion de CALIDAD EN VIVO mientras el operador zapea
#
# El operador lo pidio asi: "OLVIDATE TECNICAMENTE LO QUE DIGA EL REPO EN CALIDAD
# Y LO QUE HAYA ESTABLECIDO, EL OBJETIVO ES QUE MIDAS LA CALIDAD EN VIVO".
#
# Que mide, y de donde:
#   DEVICE (adb, sin root, sin escribir nada):
#     - estado del reproductor: active, state, position, buffered, speed
#     - buffer adelantado y su RATIO contra la posicion
#     - dataspace REAL del layer del player (no el global): es lo que se ve
#     - hdr metadata types del layer del player
#     - fps de render y frames caidos
#     - resolucion de composicion y modo HDMI activo
#   VPS (ssh, solo lectura):
#     - rt/urt por peticion: overhead propio y latencia del proveedor
#     - 502, 200 y el x-ape-pulse de cada una
#   SHIM (adb forward, solo lectura):
#     - /metrics: segments, rebuffer_count, freeze_ms, drain_ratio, buffer_ahead
#
# Lo que NO mide, y por que:
#   - PIXELES: screencap captura el buffer de composicion ANTES del VPP y del HDMI.
#     Comparar capturas para demostrar mejora seria un falso positivo (t56).
#   - El primer frame desde el VPS: ocurre en el device, despues de demux+decode.
#
# Uso:  ape-live-quality.sh [segundos] [intervalo]
#       ape-live-quality.sh 300 2
# ═══════════════════════════════════════════════════════════════════════════
set -u
DEV="${APE_DEV:-192.168.1.3:5555}"
VPS="${APE_VPS:-root@178.156.147.234}"
SSH_KEY="${APE_SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
DURACION="${1:-300}"
INTERVALO="${2:-2}"
OUT="${APE_OUT:-/tmp/ape-quality-$(date -u +%Y%m%dT%H%M%SZ).tsv}"
SHIM_PORT_FILE="/storage/emulated/0/Android/data/com.ape.crystalagent/files/port.txt"

echo "medicion: ${DURACION}s cada ${INTERVALO}s -> $OUT"
printf '%s\n' "t\tactive\tstate\tpos_ms\tbuf_ms\tahead_ms\tratio\tbuf_valid\tdataspace\thdr_types\tfps\tframes_dropped\tcomp_w\tcomp_h\tmode_id" > "$OUT"

INI=$(date -u +%s)
FIN=$((INI + DURACION))
N=0

while [ "$(date -u +%s)" -lt "$FIN" ]; do
  T=$(( $(date -u +%s) - INI ))

  # ── media_session: estado y buffer ────────────────────────────────────
  MS=$(adb -s "$DEV" shell "dumpsys media_session 2>/dev/null" 2>/dev/null | tr -d '\r')
  ACT=$(printf '%s' "$MS" | grep -oE 'active=(true|false)' | head -1 | cut -d= -f2)
  LINE=$(printf '%s' "$MS" | grep -oE 'state=PlaybackState \{state=[A-Z]+\([0-9]+\)[^}]*' | head -1)
  ST=$(printf '%s' "$LINE" | grep -oE 'state=[A-Z]+' | head -1 | cut -d= -f2)
  POS=$(printf '%s' "$LINE" | grep -oE 'position=[0-9]+' | head -1 | cut -d= -f2)
  BUF=$(printf '%s' "$LINE" | grep -oE 'buffered position=[0-9]+' | head -1 | cut -d= -f2)
  POS=${POS:-}; BUF=${BUF:-}; ACT=${ACT:-unknown}; ST=${ST:-}
  if [ -n "$POS" ] && [ -n "$BUF" ]; then
    AHEAD=$((BUF - POS))
    [ "$AHEAD" -lt 0 ] && AHEAD=0
    if [ "$POS" -gt 0 ]; then
      RATIO=$(awk -v a="$AHEAD" -v p="$POS" 'BEGIN{ if(p>0) printf "%.3f", a/p; else print "NA" }')
    else RATIO="NA"; fi
  else AHEAD=""; RATIO="NA"; fi
  BV=$(printf '%s' "$MS" | grep -oE 'buffer_valid=(true|false)' | head -1 | cut -d= -f2)

  # ── SurfaceFlinger: el layer del player, no el global ─────────────────
  SF=$(adb -s "$DEV" shell "dumpsys SurfaceFlinger 2>/dev/null" 2>/dev/null | tr -d '\r')
  PL=$(printf '%s' "$SF" | grep -iE 'ottnavigator|scillarium|ExoPlayer|SurfaceView' | head -6)
  DS=$(printf '%s' "$PL" | grep -oE 'dataspace=[A-Za-z0-9_]+' | head -1 | cut -d= -f2)
  HDRT=$(printf '%s' "$PL" | grep -oE 'hdr metadata types=[0-9]+' | head -1 | cut -d= -f2)
  DS=${DS:-}; HDRT=${HDRT:-}

  # ── frames caidos y fps ───────────────────────────────────────────────
  GFX=$(adb -s "$DEV" shell "dumpsys gfxinfo studio.scillarium.ottnavigator 2>/dev/null" 2>/dev/null | tr -d '\r')
  FPS=$(printf '%s' "$GFX" | grep -oE 'renderFrameRate [0-9.]+' | head -1 | awk '{print $2}')
  DROP=$(printf '%s' "$GFX" | grep -oE 'Janky frames: [0-9]+' | head -1 | grep -oE '[0-9]+')

  # ── resolucion de composicion y modo HDMI ─────────────────────────────
  WH=$(adb -s "$DEV" shell "dumpsys window displays 2>/dev/null | grep -m1 'mDisplayId=0 ('" 2>/dev/null | tr -d '\r')
  CW=$(printf '%s' "$WH" | grep -oE 'cur=[0-9]+x[0-9]+' | head -1 | cut -d= -f2 | cut -dx -f1)
  CH=$(printf '%s' "$WH" | grep -oE 'cur=[0-9]+x[0-9]+' | head -1 | cut -d= -f2 | cut -dx -f2)
  MID=$(printf '%s' "$SF" | grep -oE 'id=[0-9]+, hwcId=[0-9]+, resolution=[0-9]+x[0-9]+' | head -1 | grep -oE 'id=[0-9]+' | cut -d= -f2)

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$T" "${ACT}" "${ST}" "${POS}" "${BUF}" "${AHEAD}" "${RATIO}" "${BV}" "${DS}" "${HDRT}" "${FPS}" "${DROP}" "${CW}" "${CH}" "${MID}" >> "$OUT"

  N=$((N+1))
  sleep "$INTERVALO"
done

echo "muestras: $N -> $OUT"
echo ""
echo "=== RESUMEN ==="
awk -F'\t' 'NR>1 {
  if ($2=="true") act++
  if ($9!="" && $9!="-") { ds[$9]++ }
  if ($12!="" && $12 ~ /^[0-9]+$/) { drop+=$12; dn++ }
  if ($7!="NA" && $7!="") { ratio+=$7; rn++ }
  n++
} END {
  printf "  muestras            : %d\n", n
  printf "  reproduciendo (true): %d de %d (%.0f%%)\n", act+0, n, (n>0?100*(act+0)/n:0)
  printf "  media de ratio buffer: %s\n", (rn>0? sprintf("%.3f", ratio/rn) : "NO_COMPUTADO")
  printf "  janky frames (suma) : %d\n", drop+0
  for (k in ds) printf "  dataspace=%s : %d muestras\n", k, ds[k]
}' "$OUT"
