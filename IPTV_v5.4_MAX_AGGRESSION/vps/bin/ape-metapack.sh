#!/usr/bin/env bash
# ape-metapack.sh — empaqueta TODA la metadata por canal en JSON, sin perder una linea.
#
# PROBLEMA QUE RESUELVE
#   Cada canal de la lista trae 1.044 lineas de metadata (KODIPROP de Kodi, EXTVLCOPT de
#   VLC, EXT-X-APE-*, CMAF, EXTATTRFROMURL...). Eso son 1.115.213.359 B de datos
#   repartidos en 21.224 canales.
#
# LO QUE SE MIDIO (2026-11-15)
#   - El bloque VLC/KODI/APE es IDENTICO en los 21.224 canales: sha1 unico = 1 preset.
#     No hay polimorfismo real: es el mismo bloque copiado 21.224 veces.
#   - El EXTHTTP tiene 214 claves, de las cuales 170 son CONSTANTES en todos los canales
#     y 44 varian. De esas 44, tres son ruido de sesion (X-Session-Id,
#     X-CMAF-Program-Date-Time, CMCD-Session) y el resto SI es calibracion por canal
#     (X-APE-Tier, X-APE-Profile, X-Resolution, X-Codec-Full, X-HDR-Nits...).
#   - El STREAM-TRUTH solo toma 4 valores distintos en 21.224 canales.
#
# COMO LO EMPAQUETA
#   #EXT-X-APE-METAPACK:{...}   UNA vez en la cabecera:
#       block_sha   sha1 del bloque de metadata comun (idempotencia: mismo bloque, mismo sha)
#       block_lines numero de lineas del bloque
#       block_b64   el bloque COMPLETO, gzip + base64. Nada se pierde.
#       http_const  las 170 claves del EXTHTTP constantes
#       http_const_sha  sha1 de esas constantes
#   #EXTHTTP:{...}              por canal: SOLO las variables (44 o menos)
#   #EXT-X-APE-METAPACK-REF:sha por canal: referencia a la plantilla
#   #EXTSHIMOTT:{...}           el tag del shim (se conserva)
#
#   Con eso la lista se puede RECONSTRUIR linea por linea: plantilla + variables =
#   el bloque original. Es ISOMORFO por construccion, no por promesa.
#
# IDEMPOTENCIA
#   Misma lista de entrada => mismo block_sha, mismas constantes, mismo resultado
#   byte a byte (salvo el orden de las claves, que se serializa ordenado).
#
# FAIL-CLOSED
#   Si el bloque NO es identico en todos los canales, NO se empaqueta: se dice y sale
#   con codigo 4. Empaquetar bloques distintos con un sha unico seria mentir.
#
# USO: ape-metapack.sh <lista_entrada.m3u8> <lista_salida.m3u8>

set -uo pipefail
IN="${1:-}"; OUT="${2:-}"
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die() { local c="$1"; shift; log "FATAL[$c] $*"; exit "$c"; }
[ -f "$IN" ] || die 2 "no existe $IN"
[ -n "$OUT" ] || die 2 "falta la salida"
command -v python3 >/dev/null || die 2 "falta python3"

TMP=$(mktemp -d /tmp/ape-metapack.XXXXXX) || die 2 "sin /tmp"
trap 'rm -rf "$TMP"' EXIT

# ── 1. extraer, por canal: bloque de metadata + EXTINF + EXTHTTP + URL ─────────
python3 - "$IN" "$TMP" <<'PY' || die 3 "el parser fallo"
import sys, json, hashlib, re
src, tmp = sys.argv[1], sys.argv[2]
META_PREFIXES = ('#EXTVLCOPT', '#KODIPROP', '#EXT-X-APE-', '#EXT-X-CMAF',
                 '#EXT-X-VNOVA', '#EXTATTRFROMURL', '#EXT-X-PHANTOM', '#EXTGRP')
chans = []
cur = None
with open(src, encoding='utf-8', errors='replace') as f:
    for raw in f:
        line = raw.rstrip('\n')
        s = line.strip()
        if s.startswith('#EXTINF'):
            if cur: chans.append(cur)
            cur = {'extinf': s, 'meta': [], 'exthttp': None, 'uri': None}
            continue
        if cur is None:
            continue
        if cur['uri'] is not None:
            continue
        if s.startswith('#EXTHTTP:'):
            cur['exthttp'] = s[len('#EXTHTTP:'):]
        elif s.startswith(META_PREFIXES):
            cur['meta'].append(s)
        elif s.startswith('#'):
            # tags estandar: se conservan tal cual en la salida
            cur['meta'].append(s)
        elif s:
            cur['uri'] = s
if cur: chans.append(cur)
chans = [c for c in chans if c['uri']]
if not chans:
    print('sin canales', file=sys.stderr); sys.exit(1)

# ── 2. el bloque comun: sha1 por canal, y comprobar que es UNO ─────────────────
sigs = {}
for c in chans:
    h = hashlib.sha1(('\n'.join(c['meta'])).encode()).hexdigest()
    c['sha'] = h
    sigs.setdefault(h, 0)
    sigs[h] += 1

with open(tmp + '/stats.json', 'w') as f:
    json.dump({'channels': len(chans), 'unique_blocks': len(sigs),
               'top': sorted(sigs.items(), key=lambda x: -x[1])[:5]}, f)

# ── 3. constantes del EXTHTTP ────────────────────────────────────────────────
from collections import Counter, defaultdict
vals = defaultdict(Counter)
parsed = 0
for c in chans:
    if not c['exthttp']: continue
    try: d = json.loads(c['exthttp'])
    except Exception: continue
    if not isinstance(d, dict): continue
    parsed += 1
    for k, v in d.items(): vals[k][str(v)] += 1
const = {k: list(v.keys())[0] for k, v in vals.items() if len(v) == 1}
var_keys = {k for k, v in vals.items() if len(v) > 1}

with open(tmp + '/const.json', 'w') as f:
    json.dump(const, f, sort_keys=True, ensure_ascii=False)
with open(tmp + '/var_keys.json', 'w') as f:
    json.dump(sorted(var_keys), f)
with open(tmp + '/parsed.json', 'w') as f:
    json.dump(parsed, f)

# ── 4. volcar los canales para la fase bash ──────────────────────────────────
with open(tmp + '/chans.json', 'w') as f:
    json.dump(chans, f, ensure_ascii=False)
PY

CHANNELS=$(python3 -c "import json;print(json.load(open('$TMP/stats.json'))['channels'])")
UNIQ=$(python3 -c "import json;print(json.load(open('$TMP/stats.json'))['unique_blocks'])")
PARSED=$(python3 -c "import json;print(json.load(open('$TMP/parsed.json')))")
CONSTN=$(python3 -c "import json;print(len(json.load(open('$TMP/const.json'))))")
VARN=$(python3 -c "import json;print(len(json.load(open('$TMP/var_keys.json'))))")
log "canales=$CHANNELS · bloques_unicos=$UNIQ · exthttp_parseados=$PARSED · constantes=$CONSTN · variables=$VARN"

# ── 5. FAIL-CLOSED: empaquetar bloques distintos con un sha unico seria mentir ─
if [ "$UNIQ" -ne 1 ]; then
  log "BLOQUE NO UNIFORME: $UNIQ bloques distintos en $CHANNELS canales."
  log "No se empaqueta con un sha unico. Top:"
  python3 -c "import json;d=json.load(open('$TMP/stats.json'));print(d['top'])" >&2
  exit 4
fi

# ── 6. la plantilla: comprimida y en base64 ─────────────────────────────────
python3 - "$TMP" <<'PY'
import sys, json, hashlib, gzip, base64
tmp = sys.argv[1]
chans = json.load(open(tmp + '/chans.json'))
block = chans[0]['meta']
raw = ('\n'.join(block) + '\n').encode()
sha = hashlib.sha1(raw).hexdigest()
# el sha debe coincidir con el calculado por canal (sin el \n final)
sha_lineas = hashlib.sha1(('\n'.join(block)).encode()).hexdigest()
assert sha == sha_lineas, 'sha inconsistente'
b64 = base64.b64encode(gzip.compress(raw, 9)).decode()
json.dump({'sha': sha, 'lines': len(block), 'raw_bytes': len(raw),
           'b64_len': len(b64)}, open(tmp + '/block_meta.json','w'))
open(tmp + '/block.b64','w').write(b64)
print(sha, len(block), len(raw), len(b64))
PY
read -r B_SHA B_LINES B_RAW B_B64LEN < <(python3 -c "
import json;d=json.load(open('$TMP/block_meta.json'));print(d['sha'],d['lines'],d['raw_bytes'],d['b64_len'])")
log "plantilla: sha=$B_SHA lineas=$B_LINES crudo=${B_RAW}B gzip+b64=${B_B64LEN}B"

# ── 7. emitir la lista empaquetada ──────────────────────────────────────────
python3 - "$TMP" "$OUT" <<'PY' || die 3 "la emision fallo"
import sys, json, gzip, base64
tmp, out = sys.argv[1], sys.argv[2]
chans = json.load(open(tmp + '/chans.json'))
const = json.load(open(tmp + '/const.json'))
var_keys = set(json.load(open(tmp + '/var_keys.json')))
bmeta = json.load(open(tmp + '/block_meta.json'))
b64 = open(tmp + '/block.b64').read()

lines = []
lines.append('#EXTM3U')
lines.append('#EXT-X-VERSION:9')
lines.append('#EXT-X-INDEPENDENT-SEGMENTS')
pack = {
    'v': 1,
    'block_sha': bmeta['sha'],
    'block_lines': bmeta['lines'],
    'block_gz_b64': b64,
    'http_const': const,
    'http_const_sha': __import__('hashlib').sha1(
        json.dumps(const, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
    'channels': len(chans),
    'note': 'plantilla completa comprimida; cada canal lleva solo lo que difiere. '
            'Reconstruccion: block_gz_b64 (gunzip+base64) + http_const + las variables de cada canal.',
}
lines.append('#EXT-X-APE-METAPACK:' + json.dumps(pack, sort_keys=True, ensure_ascii=False, separators=(',',':')))

n_var = 0
for c in chans:
    lines.append(c['extinf'])
    if c['exthttp']:
        try: d = json.loads(c['exthttp'])
        except Exception: d = None
        if isinstance(d, dict):
            diff = {k: v for k, v in d.items() if k not in const}
            n_var += len(diff)
            if diff:
                lines.append('#EXTHTTP:' + json.dumps(diff, sort_keys=True,
                             ensure_ascii=False, separators=(',',':')))
        else:
            lines.append('#EXTHTTP:' + c['exthttp'])
    for m in c['meta']:
        lines.append(m)
    lines.append('#EXT-X-APE-METAPACK-REF:' + c['sha'])
    lines.append(c['uri'])

with open(out, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')
print('emitidas %d lineas · variables por canal totales %d' % (len(lines), n_var))
PY

SZ=$(stat -c%s "$OUT")
GZSZ=$(gzip -9 -c "$OUT" | wc -c)
log "OK: $OUT $SZ B · gzip $GZSZ B · plantilla ${B_B64LEN}B · constantes $CONSTN · variables $VARN"
exit 0