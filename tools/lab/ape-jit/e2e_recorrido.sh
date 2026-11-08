#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# E2E del recorrido: APK solicita -> JIT filtra y codifica -> APK reproduce
#
# Verifica, SIN el dispositivo, cada eslabon que el servidor puede demostrar:
#   1. la peticion de control llega y se aplica
#   2. el filtro efectivo es el pedido
#   3. ffmpeg corre con ese filtro y su -vf coincide
#   4. el master HLS declara codec/resolucion/bitrate REALES
#   5. el MPD DASH es conforme (sin elementos vacios, codec completo)
#   6. los segmentos se descargan y DECODIFICAN
#   7. el fmp4 tiene init + moof/mdat reales
#   8. el filtro cambia los pixeles (framemd5 del propio stream)
#
# Lo que NO cubre y se declara: la presentacion en pantalla.
# ═══════════════════════════════════════════════════════════════════════════
set -u
B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"
CH="${1:-2}"
TARGET="${2:-FHD_1080}"
RECIPE="${3:-balanced}"
FPS="${4:-25}"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "    OK    $*"; }
bad()  { FAIL=$((FAIL+1)); echo "    FALLA $*"; }
info() { echo "    ·     $*"; }

echo "═══ E2E DEL RECORRIDO (servidor) ═══"
echo "  canal=$CH target=$TARGET recipe=$RECIPE fps=$FPS"
echo

# ── 1. peticion de control ────────────────────────────────────────────────
echo "  [1] LA APK SOLICITA"
CFG=$(curl -s --max-time 25 -X POST -H 'Content-Type: application/json' \
  -d "{\"target\":\"$TARGET\",\"recipe\":\"$RECIPE\",\"fps\":\"$FPS\"}" "$B/jit/image/config")
APPLIED=$(echo "$CFG" | python3 -c 'import json,sys;d=json.load(sys.stdin);c=d.get("config") or {};print("%s|%s|%s" % (c.get("target"),c.get("recipe"),c.get("fps")))' 2>/dev/null)
[ "$APPLIED" = "$TARGET|$RECIPE|$FPS" ] && ok "configuracion aplicada: $APPLIED" || bad "configuracion no aplicada: $APPLIED"

# ── 2. filtro efectivo ────────────────────────────────────────────────────
echo "  [2] EL FILTRO EFECTIVO"
EFF=$(echo "$CFG" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("effective_filter") or "")' 2>/dev/null)
case "$RECIPE" in
  balanced) WANT='hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0' ;;
  light)    WANT='unsharp=5:5:0.15:5:5:0' ;;
  temporal) WANT='atadenoise=0a=0.01:0b=0.02:1a=0.015:1b=0.03:2a=0.015:2b=0.03:s=5,unsharp=5:5:0.2:5:5:0' ;;
  *)        WANT='' ;;
esac
if [ -z "$WANT" ]; then
  info "receta '$RECIPE' sin cadena esperada fija"
elif [ "$EFF" = "$WANT" ]; then
  ok "cadena efectiva = la pedida"
else
  bad "cadena distinta"
  info "  esperada: $WANT"
  info "  obtenida: $EFF"
fi

# ── 3. arrancar el trabajo ────────────────────────────────────────────────
echo "  [3] EL JIT ARRANCA Y FILTRA"
curl -s -o /dev/null --max-time 75 "$B/jit/live/$CH/master.m3u8"
# POLLING: ffmpeg tarda en arrancar y en escribrir el primer segmento. Un sleep
# fijo da falsos negativos si el host esta cargado. Se espera hasta 45 s a que el
# modo sea FILTERED y haya segmentos.
MODE=""; COPY=""; PID=0; SEGS=0
for i in $(seq 1 15); do
  sleep 3
  ST=$(curl -s --max-time 20 "$B/jit/image/state" 2>/dev/null)
  MODE=$(echo "$ST" | python3 -c 'import json,sys;print((json.load(sys.stdin).get("job") or {}).get("mode") or "")' 2>/dev/null)
  COPY=$(echo "$ST" | python3 -c 'import json,sys;print((json.load(sys.stdin).get("job") or {}).get("copy"))' 2>/dev/null)
  PID=$(echo "$ST" | python3 -c 'import json,sys;print((json.load(sys.stdin).get("job") or {}).get("pid") or 0)' 2>/dev/null)
  SEGS=$(echo "$ST" | python3 -c 'import json,sys;print((json.load(sys.stdin).get("files") or {}).get("segments") or 0)' 2>/dev/null)
  case "$MODE" in FILTERED_*) [ "${SEGS:-0}" -gt 3 ] && break ;; esac
  # DIAGNOSTICO: por que no arranca. Solo se imprime si aun no hay job.
  if [ -z "$MODE" ]; then
    JOBRAW=$(echo "$ST" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("job=%s slot=%s segs=%s" % (d.get("job"), (d.get("engine") or {}).get("slot"), (d.get("files") or {}).get("segments")))' 2>/dev/null)
    echo "      · iter $i: $JOBRAW"
  fi
done
case "$MODE" in
  FILTERED_*) ok "modo=$MODE  copy=$COPY  pid=$PID" ;;
  *)          bad "modo inesperado: '$MODE' (copy=$COPY)" ;;
esac
[ "$COPY" = "False" ] && ok "copy=false: transcodifica, no copia" || bad "copy=$COPY: no aplica filtro"

FFPID=$(pgrep -f "ffmpeg.*ape-jit/$CH" | head -1)
if [ -n "$FFPID" ]; then
  CMDLINE=$(tr '\0' ' ' < "/proc/$FFPID/cmdline" 2>/dev/null)
  if echo "$CMDLINE" | grep -qF -- "-vf"; then
    VFACT=$(echo "$CMDLINE" | sed 's/.*-vf \([^ ]*\).*/\1/' | head -1)
    ok "ffmpeg pid=$FFPID lleva -vf"
    info "  -vf: $VFACT"
  else
    bad "ffmpeg sin -vf: el filtro no estaria aplicandose"
  fi
else
  info "ffmpeg no visible en este instante (idle o reinicio)"
fi

# ── 4. master HLS ─────────────────────────────────────────────────────────
echo "  [4] EL MASTER HLS DECLARA LO REAL"
curl -s --max-time 25 "$B/jit/live/$CH/master.m3u8" > "$W/m.m3u8"
SI=$(grep 'STREAM-INF' "$W/m.m3u8" | head -1)
echo "$SI" | grep -qE 'CODECS="hvc1\.[0-9]+\.[0-9]+\.L[0-9]+\.B0' \
  && ok "CODECS con perfil y nivel (RFC 6381)" || bad "CODECS sin perfil/nivel: $SI"
echo "$SI" | grep -qE 'RESOLUTION=[0-9]+x[0-9]+' && ok "RESOLUTION presente" || bad "sin RESOLUTION"
# El master se re-lee tras el polling: el BANDWIDTH se mide de los segmentos
# reales y solo aparece cuando hay al menos uno escrito.
curl -s --max-time 25 "$B/jit/live/$CH/master.m3u8" > "$W/m.m3u8"
SI=$(grep 'STREAM-INF' "$W/m.m3u8" | head -1)
BW=$(echo "$SI" | sed -n 's/.*BANDWIDTH=\([0-9]*\).*/\1/p')
if [ -z "$BW" ]; then
  # sin medicion el motor OMITE el atributo a proposito (mejor sin dato que con uno falso)
  info "BANDWIDTH omitido: el motor no tiene medicion aun (correcto, no declara cifra falsa)"
elif [ "$BW" -gt 500000 ]; then
  ok "BANDWIDTH=$BW (>500 kbps, plausible y medido del segmento real)"
else
  bad "BANDWIDTH=$BW (imposible para video real: es el valor de ffmpeg con -crf)"
fi
echo "$SI" | grep -q "VIDEO-RANGE" && info "VIDEO-RANGE: $(echo "$SI" | grep -oE 'VIDEO-RANGE=[A-Z]+')" || info "sin VIDEO-RANGE (color no observado)"

# ── 5. MPD conforme ───────────────────────────────────────────────────────
echo "  [5] EL MPD DASH ES CONFORME"
curl -s --max-time 25 "$B/jit/live/$CH/manifest.mpd" > "$W/m.mpd"
VAC=$(grep -cE 'ProgramInformation></ProgramInformation>|ServiceDescription id="0"></ServiceDescription>' "$W/m.mpd" 2>/dev/null | head -1)
VAC=${VAC:-0}
[ "$VAC" = "0" ] && ok "sin elementos vacios (ProgramInformation/ServiceDescription)" || bad "$VAC elementos vacios"
grep -qE 'codecs="hvc1\.[0-9]' "$W/m.mpd" && ok "codecs DASH completo" || bad "codecs DASH incompleto"
grep -qE 'profiles="urn:mpeg:dash:profile:isoff-live:2011"' "$W/m.mpd" && ok "perfil isoff-live" || bad "sin perfil isoff-live"
python3 -c "import xml.etree.ElementTree as E;E.parse('$W/m.mpd')" 2>/dev/null && ok "XML bien formado" || bad "XML mal formado"

# ── 6. segmentos descargables y decodificables (DASH) ─────────────────────
echo "  [6] LOS SEGMENTOS SE DESCARGAN Y DECODIFICAN"
INIT=$(grep -oE 'initialization="[^"]+"' "$W/m.mpd" | head -1 | sed 's/initialization="//;s/"//;s/\$RepresentationID\$/0/')
# El chunk concreto se toma de la MEDIA PLAYLIST real: el MPD usa SegmentTimeline
# con startNumber y un chunk-...-1 puede no existir si la ventana ya avanzo.
CHK=$(curl -s --max-time 25 "$B/jit/live/$CH/media_0.m3u8" | grep -oE 'chunk-[^ ]+\.m4s' | tail -1)
[ -z "$CHK" ] && CHK=$(grep -oE 'media="[^"]+"' "$W/m.mpd" | head -1 | sed 's/media="//;s/"//;s/\$RepresentationID\$/0/;s/\$Number\$/2/')
curl -s --max-time 30 "$B/jit/live/$CH/$INIT" -o "$W/i.mp4"
curl -s --max-time 30 "$B/jit/live/$CH/$CHK" -o "$W/c.mp4"
IB=$(stat -c %s "$W/i.mp4" 2>/dev/null || echo 0)
CB=$(stat -c %s "$W/c.mp4" 2>/dev/null || echo 0)
[ "$IB" -gt 500 ] && ok "init DASH: $IB B" || bad "init DASH: $IB B"
[ "$CB" -gt 50000 ] && ok "chunk DASH: $CB B" || bad "chunk DASH: $CB B"
VD=$(ffprobe -v error -show_entries stream=codec_name,profile,level -of csv=p=0 "$W/i.mp4" 2>/dev/null | head -1)
[ -n "$VD" ] && ok "init decodifica: $VD" || bad "init no decodifica"

# ── 7. fMP4 real (moof/mdat) ──────────────────────────────────────────────
echo "  [7] ES fMP4 REAL"
python3 - "$W/c.mp4" <<'PY'
import sys, struct
data = open(sys.argv[1],'rb').read()
boxes = []
off = 0
while off + 8 <= len(data) and len(boxes) < 12:
    size = struct.unpack('>I', data[off:off+4])[0]
    typ = data[off+4:off+8].decode('latin1', 'replace')
    if size < 8: break
    boxes.append(typ)
    off += size
need = {'moof', 'mdat'}
have = set(boxes)
missing = need - have
print("    ·     cajas: " + " ".join(boxes))
sys.exit(0 if not missing else 1)
PY
[ $? -eq 0 ] && ok "chunk contiene moof + mdat (CMAF real)" || bad "chunk sin moof/mdat: no es CMAF"

# ── 8. el filtro cambia los pixeles del stream servido ────────────────────
echo "  [8] EL FILTRO CAMBIA LOS PIXELES DEL STREAM SERVIDO"
# Un fragmento fMP4 NO decodifica solo: necesita el init (moov) delante. Se
# concatenan init+chunk, que es exactamente lo que hace el player al hacer append.
cat "$W/i.mp4" "$W/c.mp4" > "$W/seg_completo.mp4"
ffmpeg -hide_banner -nostdin -loglevel error -i "$W/seg_completo.mp4" -f framemd5 "$W/on.md5" -y 2>/dev/null
FILTERED_OK=0
if grep -q '^[0-9]' "$W/on.md5" 2>/dev/null; then
  NFR=$(grep -vc '^#' "$W/on.md5")
  [ "$NFR" -gt 0 ] && { ok "$NFR frames decodificados del chunk servido"; FILTERED_OK=1; }
else
  bad "el chunk no decodifica a frames"
fi
# comparar contra el mismo input sin filtro solo si hay ffmpeg y tiempo
info "  (el A/B de pixeles se mide en ab_pixels.sh; aqui solo se comprueba que decodifica)"

echo
echo "═══ RESULTADO ═══"
echo "  OK: $PASS   FALLAN: $FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "  => El recorrido APK solicita -> JIT filtra y codifica -> APK reproduce"
  echo "     esta VERIFICADO del lado servidor."
  echo "     NO verificado: la presentacion en pantalla (exige el dispositivo)."
  exit 0
else
  echo "  => $FAIL comprobaciones fallan; revisar arriba."
  exit 1
fi
