#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-6k-premium.sh — CADA PERFIL APLICA SU VARIANTE 6K COMO ALTERNATIVA PREMIUM
#
# LO QUE PIDE EL OPERADOR
#   "CADA PERFIL DEBE APLICAR SU PERFIL 6K COMO ALTERNATIVA PREMIUM INICIAL, SIEMPRE
#    Y EL FALLBACK ES EL PERFIL HABITUAL AL QUE CAERA, SI HAY ALGUN PROBLEMA EN
#    REPRODUCCION, TOMARA NOTAS EN LOS LOGS Y CONTEMPLARA MEJORAS PARA QUE EL LLM
#    LOS APLIQUE EN LA PROXIMA OPORTUNIDAD"
#
# LO QUE HABIA, MEDIDO
#   El #EXT-X-STREAM-INF de P5 ya declara RESOLUTION=5760x3240 y FRAME-RATE=60 (6K),
#   pero el perfil por canal dice P5, no P5.5:
#     #EXTINF:... ape-profile="P5" ...
#     #EXTHTTP:{"X-APE-Profile":"P5","X-APE-Tier":"T5",...}
#     #EXTSHIMOTT:{...,"mp":{"p":"P5+T5"},...}
#   O sea: la resolucion es 6K pero el perfil que lo declara es el habitual. No hay
#   marca de "premium 6K" ni de "fallback". El APK no puede saber que esto es una
#   variante premium ni a que caer si falla.
#
# LO QUE HACE
#   Por cada canal de la lista Px:
#     1) ape-profile="Px"                    -> ape-profile="Px.5"
#     2) "X-APE-Profile":"Px"                -> "X-APE-Profile":"Px.5"
#     3) anade  "X-APE-Fallback-Profile":"Px" al EXTHTTP  (el habitual, al que cae)
#     4) anade  #EXT-X-APE-PREMIUM-PROFILE:6K;FALLBACK=Px;TARGET=5760x3240;REASON=alternativa_premium_inicial
#     5) el "mp":{"p":"Px+Tn"} del EXTSHIMOTT pasa a "Px.5+Tn"
#   Y escribe un log JSONL por canal apto para que el LLM lo lea despues:
#     {ts, profile_from, profile_to, fallback, channel, ok, notes}
#
# GARANTIAS
#   - Idempotente: si el canal ya dice Px.5, no lo toca.
#   - No toca ni una URL ni el numero de canales (verificado antes/despues).
#   - Fail-closed: si los conteos no cuadran, NO publica y deja el .tmp.
#   - Reversible: guarda .bak-6k-<stamp>.
#
# USO
#   bash ape-6k-premium.sh <lista_Px.m3u8> [--dry-run]
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

LISTS="${APE_LISTS_DIR:-/var/www/lists}"
LOG="${APE_6K_LOG:-/var/lib/ape/6k-premium.jsonl}"
DRY=0
T=$(date -u +%Y%m%dT%H%M%SZ)
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "FATAL[$1] $2"; exit "$1"; }

SRC=""
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    -*) die 2 "opcion desconocida: $a" ;;
    *) SRC="$a" ;;
  esac
done
[ -n "$SRC" ] && [ -r "$SRC" ] || die 2 "uso: ape-6k-premium.sh <lista.m3u8> [--dry-run]"

# El perfil base sale del nombre: APE_LISTA_<id>_P5.m3u8 -> P5
BN=$(basename "$SRC" .m3u8)
case "$BN" in
  *_P0) BASE=P0 ;; *_P1) BASE=P1 ;; *_P2) BASE=P2 ;;
  *_P3) BASE=P3 ;; *_P4) BASE=P4 ;; *_P5) BASE=P5 ;;
  *) die 2 "el nombre no acaba en _P0.._P5: $BN" ;;
esac
PREMIUM="${BASE}.5"
log "lista: $(basename "$SRC") · perfil base $BASE -> premium $PREMIUM"

CH0=$(grep -c '^#EXTINF' "$SRC" 2>/dev/null); CH0=${CH0:-0}
UR0=$(grep -cE '^https?://' "$SRC" 2>/dev/null); UR0=${UR0:-0}
[ "$CH0" -gt 0 ] || die 3 "la lista no tiene canales"

# idempotencia: si ya esta aplicado, no se re-aplica
if grep -q "ape-profile=\"$PREMIUM\"" "$SRC" 2>/dev/null; then
  log "sin cambios: los canales ya declaran $PREMIUM"
  exit 0
fi

OUT="$SRC.6k.tmp"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

python3 - "$SRC" "$OUT" "$BASE" "$PREMIUM" "$LOG" <<'PY'
import re, sys, json, datetime

src, out, base, prem, logpath = sys.argv[1:6]
ts = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
notes = []
n_tot = n_app = n_skip = 0

# El bloque de cada canal: EXTINF, EXTHTTP, DATERANGE, STREAM-INF, EXTSHIMOTT, URL
# Se procesa en streaming porque la lista grande pesa cientos de MB.
RE_EXTINF = re.compile(r'^#EXTINF:')
RE_URL    = re.compile(r'^https?://')

def patch_extinf(line):
    return re.sub(r'ape-profile="%s"' % re.escape(base),
                  'ape-profile="%s"' % prem, line, count=1)

def patch_exthttp(line):
    # anade el fallback justo despues del perfil, y cambia el perfil
    s = line.replace('"X-APE-Profile":"%s"' % base, '"X-APE-Profile":"%s"' % prem, 1)
    if '"X-APE-Fallback-Profile"' not in s:
        s = s.replace('"X-APE-Profile":"%s"' % prem,
                      '"X-APE-Profile":"%s","X-APE-Fallback-Profile":"%s"' % (prem, base), 1)
    return s

def patch_shimott(line):
    return line.replace('"p":"%s+' % base, '"p":"%s+' % prem, 1)

with open(src, 'r', encoding='utf-8', errors='replace') as fi, \
     open(out, 'w', encoding='utf-8', newline='\n') as fo:
    ch_id = None
    for line in fi:
        raw = line.rstrip('\n')
        if RE_EXTINF.match(raw):
            n_tot += 1
            m = re.search(r'tvg-id="([^"]*)"', raw)
            ch_id = m.group(1) if m else ''
            frm = base
            new = patch_extinf(raw)
            if new != raw:
                n_app += 1
            else:
                n_skip += 1
            fo.write(new + '\n')
            fo.write('#EXT-X-APE-PREMIUM-PROFILE:6K;PROFILE=%s;FALLBACK=%s;TARGET=5760x3240;'
                     'REASON=alternativa_premium_inicial\n' % (prem, base))
            notes.append({'ts': ts, 'channel': ch_id, 'profile_from': frm,
                          'profile_to': prem, 'fallback': base, 'ok': True,
                          'note': 'premium 6K declarado; si la reproduccion falla, el player '
                                  'cae a %s y el fallo debe registrarse para que el LLM lo '
                                  'aplique en la proxima pasada' % base})
            continue
        if raw.startswith('#EXTHTTP:'):
            fo.write(patch_exthttp(raw) + '\n'); continue
        if raw.startswith('#EXTSHIMOTT:'):
            fo.write(patch_shimott(raw) + '\n'); continue
        if raw.startswith('#EXT-X-APE-PREMIUM-PROFILE:'):
            continue   # ya lo escribimos arriba; no duplicar
        fo.write(raw + '\n')

try:
    with open(logpath, 'a', encoding='utf-8') as fl:
        for r in notes:
            fl.write(json.dumps(r, ensure_ascii=False) + '\n')
except Exception as e:
    sys.stderr.write('aviso: no pude escribir el log para el LLM: %s\n' % e)

print('  canales=%d aplicados=%d omitidos=%d notas_llm=%d' % (n_tot, n_app, n_skip, len(notes)))
PY
RC=$?
[ "$RC" -eq 0 ] || die 4 "el aplicador fallo (rc=$RC)"

# ── verificar el resultado ────────────────────────────────────────────────────
CH1=$(grep -c '^#EXTINF' "$OUT" 2>/dev/null); CH1=${CH1:-0}
UR1=$(grep -cE '^https?://' "$OUT" 2>/dev/null); UR1=${UR1:-0}
PR1=$(grep -c "ape-profile=\"$PREMIUM\"" "$OUT" 2>/dev/null); PR1=${PR1:-0}
FB1=$(grep -c "X-APE-Fallback-Profile\":\"$BASE\"" "$OUT" 2>/dev/null); FB1=${FB1:-0}
PM1=$(grep -c '^#EXT-X-APE-PREMIUM-PROFILE:' "$OUT" 2>/dev/null); PM1=${PM1:-0}
log "verificacion: canales $CH0->$CH1 · urls $UR0->$UR1 · premium=$PR1 · fallback=$FB1 · marca=$PM1"

[ "$CH1" -eq "$CH0" ] || die 5 "canales no cuadran: $CH0 -> $CH1"
[ "$UR1" -eq "$UR0" ] || die 5 "urls no cuadran: $UR0 -> $UR1"
[ "$PR1" -eq "$CH0" ] || die 5 "no todos los canales declaran $PREMIUM: $PR1 de $CH0"
[ "$FB1" -eq "$CH0" ] || die 5 "no todos los canales declaran el fallback $BASE: $FB1 de $CH0"
[ "$PM1" -eq "$CH0" ] || die 5 "marca PREMIUM incompleta: $PM1 de $CH0"

if [ "$DRY" -eq 1 ]; then
  log "DRY-RUN: el resultado esta en $OUT ($(stat -c%s "$OUT") B). No se publica."
  exit 0
fi

cp -a "$SRC" "${SRC}.bak-6k-$T" || die 5 "no pude hacer backup"
gzip -9 -c "$OUT" > "$OUT.gz" || die 5 "gzip fallo"
mv -f "$OUT" "$SRC"        || die 5 "no pude mover el .m3u8"
mv -f "$OUT.gz" "${SRC}.gz" || die 5 "no pude mover el .gz"
chown www-data:www-data "$SRC" "${SRC}.gz" 2>/dev/null || true
chmod 644 "$SRC" "${SRC}.gz" 2>/dev/null || true

log "OK: $SRC $(stat -c%s "$SRC") B · $CH1 canales · premium $PREMIUM con fallback $BASE · gz $(stat -c%s "${SRC}.gz") B"
log "backup: ${SRC}.bak-6k-$T · notas para el LLM en $LOG"
exit 0
