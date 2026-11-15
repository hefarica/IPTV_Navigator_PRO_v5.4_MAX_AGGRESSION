#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-real-resolution-6k.sh — RESOLUTION REAL + UPSCALE 6K POR MULTIPLICADOR
#
# DECISION DEL OPERADOR (2026-11-15, textual)
#   "declarar la resolución real medida y dejar que el display escale para llegar y
#    mantener 6K simulado (upscale), que aplique varias técnicas diferentes
#    dependiendo las x que se multipliquen para que la imagen realmente se vea
#    mejorada"
#
# EL PROBLEMA QUE ARREGLA
#   Medido con ffprobe sobre segmentos reales (ape-probe-deep.sh, 31 de 37 muestras):
#     evestv/wuitf  P1  -> 544,1080,2160    P3 -> 1080    P5 -> 360,720,1080
#     tivi-ott      P1  -> 720,1080,2160    P3 -> 544,576,1080   P4 -> 720   P5 -> 576..1080
#   Y sin embargo el #EXT-X-STREAM-INF de TODOS los canales declara
#   RESOLUTION=5760x3240 (6K). Sobre una fuente de 720p eso es 4,5x la resolucion
#   real. RFC 8216 define RESOLUTION como la resolucion DE LA VARIANTE, no del
#   display: declarar 6K sobre 720p es una mentira al player.
#
# LO QUE HACE
#   1. Lee /var/lib/ape/probe-deep.json y construye la tabla (host, perfil) ->
#      {width, height, fps, codec} usando la MODA de las muestras medidas (no el
#      maximo: declarar el maximo volveria a sobre-declarar en la mayoria).
#   2. Por cada canal, reescribe RESOLUTION= del STREAM-INF a la resolucion REAL
#      de su grupo, y deja el target 6K como lo que es: un objetivo de display.
#   3. Anade, por canal, un tag honesto con la tecnica de upscale elegida por el
#      multiplicador real:
#        #EXT-X-APE-UPSCALE:TARGET=5760x3240;SOURCE=<w>x<h>;MULTIPLIER=x.x;
#                          TECH=<cadena>;EVIDENCE=host_profile_estimate;SAMPLES=n
#
#   ESCALERA DE TECNICAS (por multiplicador hacia 3240 px de alto)
#     x < 1.25        none                          ya esta ahi
#     1.25 <= x < 2   lanczos+cas+unsharp           escala pequeña: no hace falta mas
#     2 <= x < 3.5    lanczos+cas+unsharp+rife      FHD->6K: nitidez + temporal
#     3.5 <= x < 5    ngu-sharp+lanczos+cas+car_denoise       HD->6K
#     5 <= x < 7      esrgan+lanczos+cas+car_denoise+unsharp  SD->6K
#     x >= 7          esrgan_x4+rife+lanczos+cas+car_denoise  SD->6K extremo
#   La regla: a MAS multiplicador, MAS denoise previo (amplificar ruido lo empeora)
#   y se sube de Lanczos a NGU/ESRGAN. Todo lo listado existe: Lanczos/CAS/unsharp
#   en el VPS; esrgan/ngu/rife/car_denoise son TFLite+GLSL del APK
#   (assets: sr_unsharp_f32 / car_denoise_f32 / rife_blend_f32).
#
# GARANTIAS
#   - No toca URLs ni EXTINF ni el numero de canales (verificado antes/despues).
#   - Idempotente: si ya esta aplicado, "sin cambios".
#   - Fail-closed: si no hay medicion para un grupo, NO toca ese canal y lo reporta.
#   - Backup .bak-realres-<stamp>.
#
# USO
#   bash ape-real-resolution-6k.sh <lista.m3u8> [--dry-run]
#   bash ape-real-resolution-6k.sh --all [--dry-run]
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

LISTS="${APE_LISTS_DIR:-/var/www/lists}"
PROBE="${APE_PROBE_DEEP:-/var/lib/ape/probe-deep.json}"
TARGET_H=3240
TARGET_W=5760
T=$(date -u +%Y%m%dT%H%M%SZ)
DRY=0
ALL=0
TARGETS=()
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "FATAL[$1] $2"; exit "$1"; }

for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --all) ALL=1 ;;
    -*) die 2 "opcion desconocida: $a" ;;
    *) TARGETS+=("$a") ;;
  esac
done

if [ "$ALL" -eq 1 ]; then
  TARGETS=()
  for P in P1 P3 P4 P5; do
    f="$LISTS/APE_LISTA_1794100720046_${P}.m3u8"; [ -f "$f" ] && TARGETS+=("$f")
  done
  for f in "$LISTS/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8" \
           "$LISTS/APE_LISTA_1794100720046_P5_CABLEADA_LIGHT.m3u8"; do
    [ -f "$f" ] && TARGETS+=("$f")
  done
fi
[ "${#TARGETS[@]}" -gt 0 ] || die 2 "nada que procesar"
[ -r "$PROBE" ] || die 3 "no existe la medicion $PROBE (correr ape-probe-deep.sh)"

# Tabla (host, perfil) -> resolucion, por MODA. Se genera una vez.
TABLE=$(mktemp)
trap 'rm -f "$TABLE" "$OUT" 2>/dev/null' EXIT
python3 - "$PROBE" > "$TABLE" <<'PY'
import json, sys, collections
d = json.load(open(sys.argv[1]))
for g in d.get('groups', []):
    meas = [s for s in (g.get('samples') or []) if s.get('ok')]
    if not meas:
        # Sin datos: se emite NO_DATA para que el aplicador se abstenga.
        print('%s\t%s\tNO_DATA\t0\t0\t0\t0' % (g['host'], g['profile']))
        continue
    # MODA de altura (no el maximo: el maximo sobre-declararia a la mayoria)
    hs = collections.Counter(s.get('height') for s in meas if s.get('height'))
    ws = collections.Counter(s.get('width') for s in meas if s.get('width'))
    fps = collections.Counter(round(s.get('fps') or 0) for s in meas if s.get('fps'))
    codes = collections.Counter(s.get('codec') for s in meas if s.get('codec'))
    h = hs.most_common(1)[0][0] if hs else 0
    # El ancho se toma de una muestra que tenga esa altura (no se inventa 16:9)
    w = 0
    for s in meas:
        if s.get('height') == h and s.get('width'):
            w = s['width']; break
    if not w:
        w = ws.most_common(1)[0][0] if ws else 0
    f = fps.most_common(1)[0][0] if fps else 0
    c = codes.most_common(1)[0][0] if codes else '?'
    print('%s\t%s\t%s\t%d\t%d\t%d\t%s' % (g['host'], g['profile'], 'OK', w, h, f, c))
PY
log "tabla de resolucion real:"
awk -F'\t' '{printf "  %-30s %-7s %-8s %sx%s @%sfps %s\n",$1,$2,$3,$4,$5,$6,$7}' "$TABLE" >&2

# tecnica por multiplicador
tecnica() {
  awk -v h="$1" -v th="$TARGET_H" 'BEGIN{
    if (h <= 0) { print "none"; exit }
    x = th / h
    if (x < 1.25)      print "none";
    else if (x < 2)    print "lanczos+cas+unsharp";
    else if (x < 3.5)  print "lanczos+cas+unsharp+rife";
    else if (x < 5)    print "ngu-sharp+lanczos+cas+car_denoise";
    else if (x < 7)    print "esrgan+lanczos+cas+car_denoise+unsharp";
    else               print "esrgan_x4+rife+lanczos+cas+car_denoise";
  }'
}

fix_one() {
  local SRC="$1"
  [ -r "$SRC" ] || return 1
  local CH0 UR0
  CH0=$(grep -c '^#EXTINF' "$SRC" 2>/dev/null); CH0=${CH0:-0}
  UR0=$(grep -cE '^https?://' "$SRC" 2>/dev/null); UR0=${UR0:-0}
  [ "$CH0" -gt 0 ] || return 1

  # perfil de la lista (para el grupo de los canales que no declaran uno)
  local BN PROF
  BN=$(basename "$SRC" .m3u8)
  case "$BN" in
    *_P0_CABLEADA_LIGHT) PROF="P0.5" ;; *_P1_CABLEADA_LIGHT) PROF="P1.5" ;;
    *_P2_CABLEADA_LIGHT) PROF="P2.5" ;; *_P3_CABLEADA_LIGHT) PROF="P3.5" ;;
    *_P4_CABLEADA_LIGHT) PROF="P4.5" ;; *_P5_CABLEADA_LIGHT) PROF="P5.5" ;;
    *_CABLEADA_LIGHT) PROF="P0" ;;
    *_P0) PROF="P0.5" ;; *_P1) PROF="P1.5" ;; *_P2) PROF="P2.5" ;;
    *_P3) PROF="P3.5" ;; *_P4) PROF="P4.5" ;; *_P5) PROF="P5.5" ;;
    *) PROF="P3.5" ;;
  esac

  local OUT="$SRC.realres.tmp"
  python3 - "$SRC" "$OUT" "$TABLE" "$PROF" "$TARGET_W" "$TARGET_H" "${APE_CH_INDEX:-/var/lib/ape/ch-url-index.json}" <<'PY'
import sys, re, json, collections

src, out, table, list_prof, TW, TH, index_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]), int(sys.argv[6]), sys.argv[7]

# ID -> host, para saber a que grupo (host, perfil) pertenece cada canal.
# Sin esto el host seria una suposicion: la lista no lo lleva.
import urllib.parse
CH_HOST = {}
try:
    _idx = json.load(open(index_path))
    for _ch, _u in (_idx.get('urls') or {}).items():
        try: CH_HOST[_ch] = urllib.parse.urlparse(_u).hostname or '?'
        except Exception: CH_HOST[_ch] = '?'
except Exception as e:
    print('aviso: sin indice de hosts: %s' % e, file=sys.stderr)

# tabla (host, perfil) -> (w,h,fps,codec)
tbl = {}
for line in open(table):
    p = line.rstrip('\n').split('\t')
    if len(p) < 7: continue
    host, prof, st, w, h, f, c = p[0], p[1], p[2], int(p[3]), int(p[4]), int(p[5]), p[6]
    tbl[(host, prof)] = (w, h, f, c, st)

def tech(h):
    if h <= 0: return 'none'
    x = TH / h
    if x < 1.25: return 'none'
    if x < 2:    return 'lanczos+cas+unsharp'
    if x < 3.5:  return 'lanczos+cas+unsharp+rife'
    if x < 5:    return 'ngu-sharp+lanczos+cas+car_denoise'
    if x < 7:    return 'esrgan+lanczos+cas+car_denoise+unsharp'
    return 'esrgan_x4+rife+lanczos+cas+car_denoise'

# perfiles canonicos: la lista X.5 declara canales X.5 pero la medicion esta por
# perfil canonico (P1..P5). Se resuelve quitando el .5.
def canon(p):
    return str(p).split('+')[0].split('.')[0]

stats = collections.Counter()
no_data = set()

RE_EXTINF = re.compile(r'^#EXTINF:')
RE_PROF   = re.compile(r'ape-profile="([^"]+)"')
RE_ID     = re.compile(r'tvg-id="([^"]+)"')
RE_RES    = re.compile(r'(RESOLUTION=)(\d+)x(\d+)')

with open(src, 'r', encoding='utf-8', errors='replace') as fi, \
     open(out, 'w', encoding='utf-8', newline='\n') as fo:
    cur_prof = None
    cur_host = None
    escrito_up = False
    for line in fi:
        raw = line.rstrip('\n')

        if RE_EXTINF.match(raw):
            m = RE_PROF.search(raw)
            cur_prof = m.group(1) if m else list_prof
            mi = RE_ID.search(raw)
            cur_host = CH_HOST.get(mi.group(1)) if mi else None
            escrito_up = False
            fo.write(raw + '\n')
            continue

        if raw.startswith('#EXT-X-STREAM-INF:'):
            cp = canon(cur_prof or list_prof)
            # El host REAL del canal sale del indice; si no se conoce, se busca el
            # unico host con ese perfil y, si hay mas de uno, se ABSTIENE.
            hit = None
            if cur_host and (cur_host, cp) in tbl and tbl[(cur_host, cp)][4] == 'OK':
                hit = (cur_host, tbl[(cur_host, cp)])
            else:
                cands = [(h, v) for (h, p), v in tbl.items() if p == cp and v[4] == 'OK']
                if len(cands) == 1:
                    hit = cands[0]
                elif len(cands) > 1:
                    stats['host_ambiguo'] += 1
            if hit is None:
                stats['sin_medicion'] += 1
                fo.write(raw + '\n')
                continue
            host, (w, h, f, c, st) = hit
            if w and h:
                new = RE_RES.sub('RESOLUTION=%dx%d' % (w, h), raw)
                if new != raw: stats['res_reescrito'] += 1
                else: stats['res_ya_correcto'] += 1
                fo.write(new + '\n')
                # tag de upscale, una vez por canal (antes del primer STREAM-INF)
                if not escrito_up:
                    x = TH / h if h else 0
                    fo.write('#EXT-X-APE-UPSCALE:TARGET=%dx%d;SOURCE=%dx%d;MULTIPLIER=x%.2f;'
                             'TECH=%s;CODEC=%s;FPS=%d;EVIDENCE=host_profile_estimate;SAMPLES=deep\n'
                             % (TW, TH, w, h, x, tech(h), c, f))
                    escrito_up = True
                    stats['upscale_tag'] += 1
            else:
                stats['sin_dimensiones'] += 1
                fo.write(raw + '\n')
            continue

        fo.write(raw + '\n')

print('reescritos=%(res_reescrito)d ya_ok=%(res_ya_correcto)d tag=%(upscale_tag)d '
      'sin_medicion=%(sin_medicion)d sin_dim=%(sin_dimensiones)d' % stats, file=sys.stderr)
PY
  local RC=$?
  [ "$RC" -eq 0 ] || die 4 "el aplicador fallo en $SRC (rc=$RC)"

  local CH1 UR1
  CH1=$(grep -c '^#EXTINF' "$OUT" 2>/dev/null); CH1=${CH1:-0}
  UR1=$(grep -cE '^https?://' "$OUT" 2>/dev/null); UR1=${UR1:-0}
  [ "$CH1" -eq "$CH0" ] || die 5 "canales no cuadran en $SRC: $CH0 -> $CH1"
  [ "$UR1" -eq "$UR0" ] || die 5 "urls no cuadran en $SRC: $UR0 -> $UR1"

  local NR
  NR=$(grep -c '^#EXT-X-APE-UPSCALE:' "$OUT" 2>/dev/null); NR=${NR:-0}

  if [ "$DRY" -eq 1 ]; then
    local S0 S1
    S0=$(grep -oE 'RESOLUTION=[0-9]+x[0-9]+' "$SRC" | sort -u | tr '\n' ' ')
    S1=$(grep -oE 'RESOLUTION=[0-9]+x[0-9]+' "$OUT" | sort -u | tr '\n' ' ')
    log "  DRY $(basename "$SRC"): RESOLUTION $S0 -> $S1 · upscale_tags=$NR · canales $CH0 (en $OUT)"
    return 0
  fi

  cp -a "$SRC" "${SRC}.bak-realres-$T" || die 5 "backup fallo"
  gzip -9 -c "$OUT" > "$OUT.gz" || die 5 "gzip fallo"
  mv -f "$OUT" "$SRC" || die 5 "mv fallo"
  mv -f "$OUT.gz" "${SRC}.gz" || die 5 "mv gz fallo"
  chown www-data:www-data "$SRC" "${SRC}.gz" 2>/dev/null || true
  chmod 644 "$SRC" "${SRC}.gz" 2>/dev/null || true
  log "  OK $(basename "$SRC"): canales $CH0->$CH1 intactos · upscale_tags=$NR · gz $(stat -c%s "${SRC}.gz") B"
}

log "=== RESOLUTION real + upscale 6K por multiplicador · $([ "$DRY" -eq 1 ] && echo DRY-RUN || echo APLICANDO) ==="
RC=0
for f in "${TARGETS[@]}"; do fix_one "$f" || RC=$?; done
exit $RC
