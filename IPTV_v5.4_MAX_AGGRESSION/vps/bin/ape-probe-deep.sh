#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-probe-deep.sh — MEDICION REAL de resolucion/codec/fps por ffprobe
#
# POR QUE EXISTE
#   Medido 2026-11-15:
#     1. El probe del navegador (ape-quality-prober.js, mode:'cors') falla en el
#        100% de los canales: el proveedor NO manda Access-Control-Allow-Origin y
#        el navegador no puede poner User-Agent en fetch(). Cero verificados.
#     2. Un probe server-side del MANIFEST funciona (18/20 HTTP 200), pero los
#        proveedores sirven LISTAS DE MEDIOS (#EXT-X-VERSION:3, #EXTINF:10, .ts),
#        y una lista de medios NO declara RESOLUTION. Cero verificados otra vez.
#     3. La unica forma de saber la resolucion real es medir un SEGMENTO.
#        Medido en el canal 1: 200, 1.601.760 B, ffprobe -> h264 848x480 30fps High.
#        El segmento se baja del host del REDIRECT, sin token. El host original da 401.
#
# POR QUE NO SE MIDE LOS 21.224
#   1,6 MB por canal x 21.224 = 34 GB de trafico. Inviable.
#   Pero el catalogo tiene SOLO 3 HOSTS. El prober ya sabe agrupar por
#   (host, perfil): groupChannelsByHostProfile. Se mide UNA MUESTRA por
#   (host, perfil) y el resultado se etiqueta como ESTIMACION DE HOST, no como
#   verdad por canal. Eso es honesto y suficiente para el clasificador.
#
# QUE HACE
#   Para cada grupo (host, perfil declarado):
#     1. toma N canales al azar
#     2. sigue el redirect del manifest
#     3. saca el primer segmento y lo baja del host del redirect
#     4. ffprobe: width, height, fps, codec, profile, pix_fmt, color_transfer
#     5. compara la MEDIDA con el PERFIL DECLARADO
#   Escribe /var/lib/ape/probe-deep.json con todo, y una tabla por stdout.
#
# SALIDA (por grupo)
#   { host, profile, samples, measured:[{channelId, width, height, fps, codec,
#     profileCodec, pixFmt, transfer, bytes, ms}], agreement, verdict }
#   verdict: OK (la medida cabe en el perfil) | SUBDECLARADO (la medida es menor
#            de lo que el perfil promete) | SOBREDECLARADO (la medida es mayor)
#
# USO
#   bash ape-probe-deep.sh [--samples N] [--per-group N] [--limit-groups N]
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

INDEX="${APE_CH_INDEX:-/var/lib/ape/ch-url-index.json}"
OUT="${APE_PROBE_DEEP:-/var/lib/ape/probe-deep.json}"
SAMPLES=1          # canales por grupo
LIMIT_GROUPS=0     # 0 = todos
UA='OTT Navigator/1.7.3.3'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --per-group) SAMPLES="${2:-1}"; shift 2 ;;
    --limit-groups) LIMIT_GROUPS="${2:-0}"; shift 2 ;;
    *) echo "opcion desconocida: $1" >&2; exit 2 ;;
  esac
done

[ -r "$INDEX" ] || { log "FATAL: no existe $INDEX (correr ape-build-ch-index.sh)"; exit 2; }
command -v ffprobe >/dev/null || { log "FATAL: ffprobe no instalado"; exit 2; }

# ── elegir la muestra por (host, perfil) ──────────────────────────────────────
# El perfil declarado está en la lista; el índice solo tiene id->url. Se usa el
# perfil que el propio canal declara en la lista servida: se lee de EXTINF.
log "eligiendo muestra por (host, perfil)..."

python3 - "$INDEX" "$SAMPLES" "$LIMIT_GROUPS" "$TMP/groups.json" <<'PY'
import json, sys, collections, urllib.parse, random

index_path, samples, limit_groups, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
idx = json.load(open(index_path))
urls = idx.get('urls') or {}

# El perfil declarado por canal NO está en el índice; se aproxima por la lista:
# se lee del fichero fuente si está accesible, si no se agrupa solo por host.
src = idx.get('source')
profiles = {}
try:
    path = '/var/www/lists/' + str(src)
    cur = None
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('#EXTINF:'):
                import re
                m = re.search(r'tvg-id="([^"]+)"', line)
                p = re.search(r'ape-profile="([^"]+)"', line)
                if m:
                    cur = m.group(1)
                    if p:
                        profiles[cur] = p.group(1)
except Exception as e:
    sys.stderr.write('aviso: no pude leer perfiles de %s: %s\n' % (src, e))

groups = collections.defaultdict(list)
for ch, u in urls.items():
    try:
        host = urllib.parse.urlparse(u).hostname or '?'
    except Exception:
        host = '?'
    prof = profiles.get(ch, 'UNKNOWN')
    groups[(host, prof)].append(ch)

random.seed(11)
out_groups = []
keys = sorted(groups.keys())
if limit_groups > 0:
    keys = keys[:limit_groups]
for (host, prof) in keys:
    ids = groups[(host, prof)]
    pick = ids if len(ids) <= samples else random.sample(ids, samples)
    out_groups.append({'host': host, 'profile': prof, 'total': len(ids), 'sample': pick})

json.dump({'source': src, 'groups': out_groups}, open(out, 'w'), ensure_ascii=False)
sys.stderr.write('grupos: %d (de %d canales)\n' % (len(out_groups), len(urls)))
PY
RC=$?
[ "$RC" -eq 0 ] || { log "FATAL: no pude agrupar (rc=$RC)"; exit 4; }

NG=$(python3 -c "import json;print(len(json.load(open('$TMP/groups.json'))['groups']))" 2>/dev/null)
log "grupos a medir: $NG"

# ── medir cada muestra ────────────────────────────────────────────────────────
RES="$TMP/results.jsonl"
: > "$RES"

i=0
python3 -c "
import json
d=json.load(open('$TMP/groups.json'))
for g in d['groups']:
    for ch in g['sample']:
        print(g['host'], g['profile'], g['total'], ch)
" 2>/dev/null | while read -r HOST PROF TOTAL CH; do
  i=$((i+1))
  U=$(python3 -c "
import json
d=json.load(open('$INDEX'))
print(d.get('urls',{}).get('$CH',''))
" 2>/dev/null)
  [ -n "$U" ] || continue

  # 1. manifest siguiendo redirect
  MAN="$TMP/m.m3u8"
  FINAL=$(curl -skL -m 12 -A "$UA" -o "$MAN" -w '%{url_effective}' "$U" 2>/dev/null)
  if [ ! -s "$MAN" ] || ! grep -q '#EXTM3U' "$MAN" 2>/dev/null; then
    printf '{"channelId":"%s","host":"%s","profile":"%s","groupTotal":%s,"ok":false,"error":"NO_MANIFEST"}\n' "$CH" "$HOST" "$PROF" "$TOTAL" >> "$RES"
    log "[$i/$NG] $CH ($HOST/$PROF): sin manifest"
    continue
  fi

  # 2. primer segmento
  SEG=$(tr '\r' '\n' < "$MAN" | grep -vE '^#' | grep -v '^\s*$' | head -1)
  if [ -z "$SEG" ]; then
    printf '{"channelId":"%s","host":"%s","profile":"%s","groupTotal":%s,"ok":false,"error":"NO_SEGMENT"}\n' "$CH" "$HOST" "$PROF" "$TOTAL" >> "$RES"
    log "[$i/$NG] $CH: sin segmento"
    continue
  fi
  HB=$(echo "$FINAL" | sed 's|\(https\?://[^/]*\).*|\1|')
  case "$SEG" in
    http*) SURL="$SEG" ;;
    /*)    SURL="$HB$SEG" ;;
    *)     SURL="$(echo "$FINAL" | sed 's|/[^/]*$||')/$SEG" ;;
  esac

  # 3. bajar el segmento (del host del redirect)
  T0=$(date +%s%3N)
  curl -skL -m 25 -A "$UA" -o "$TMP/seg.bin" "$SURL" 2>/dev/null
  T1=$(date +%s%3N)
  BYTES=$(stat -c%s "$TMP/seg.bin" 2>/dev/null || echo 0)
  MS=$((T1-T0))

  if [ "$BYTES" -lt 2000 ]; then
    printf '{"channelId":"%s","host":"%s","profile":"%s","groupTotal":%s,"ok":false,"error":"SEGMENT_BLOCKED","bytes":%s}\n' "$CH" "$HOST" "$PROF" "$TOTAL" "$BYTES" >> "$RES"
    log "[$i/$NG] $CH: segmento bloqueado ($BYTES B)"
    continue
  fi

  # 4. ffprobe
  P=$(ffprobe -v error -select_streams v:0 \
      -show_entries stream=width,height,r_frame_rate,codec_name,profile,level,pix_fmt,color_transfer,color_primaries \
      -of json "$TMP/seg.bin" 2>/dev/null)
  python3 - "$CH" "$HOST" "$PROF" "$TOTAL" "$BYTES" "$MS" "$P" <<'PY' >> "$RES"
import json, sys
ch, host, prof, total, byt, ms, raw = sys.argv[1:8]
rec = {'channelId': ch, 'host': host, 'profile': prof, 'groupTotal': int(total),
       'bytes': int(byt), 'ms': int(ms), 'ok': False}
try:
    d = json.loads(raw)
    ss = d.get('streams') or []
    if not ss:
        rec['error'] = 'NO_VIDEO_STREAM'
    else:
        s = ss[0]
        fr = s.get('r_frame_rate') or ''
        try:
            num, den = fr.split('/')
            fps = round(float(num) / float(den), 2) if float(den) else None
        except Exception:
            fps = None
        rec.update({
            'ok': True,
            'width': s.get('width'), 'height': s.get('height'),
            'fps': fps, 'codec': s.get('codec_name'),
            'codecProfile': s.get('profile'), 'codecLevel': s.get('level'),
            'pixFmt': s.get('pix_fmt'),
            'transfer': s.get('color_transfer'), 'primaries': s.get('color_primaries'),
        })
except Exception as e:
    rec['error'] = 'FFPROBE_PARSE_FAILED'
print(json.dumps(rec, ensure_ascii=False))
PY
  log "[$i/$NG] $CH ($HOST/$PROF): $(tail -1 "$RES" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(f'{d.get(\"width\")}x{d.get(\"height\")} {d.get(\"codec\")} {d.get(\"fps\")}fps' if d.get('ok') else d.get('error'))" 2>/dev/null)"
done

# ── consolidar ────────────────────────────────────────────────────────────────
python3 - "$RES" "$OUT" <<'PY'
import json, sys, collections
src, out = sys.argv[1], sys.argv[2]
recs = []
try:
    for line in open(src, encoding='utf-8'):
        line = line.strip()
        if line:
            try: recs.append(json.loads(line))
            except Exception: pass
except FileNotFoundError:
    pass

# altura que cada perfil PROMETE, para comparar
PROMISE = {'P0.5':3240,'P0':4320,'P1.5':3240,'P1':2160,'P2.5':3240,'P2':2160,
           'P3.5':3240,'P3':1080,'P4.5':3240,'P4':720,'P5.5':3240,'P5':480,
           'UNKNOWN':None}

by_group = collections.defaultdict(list)
for r in recs:
    by_group[(r.get('host'), r.get('profile'))].append(r)

groups = []
ok_total = 0
for (host, prof), rs in sorted(by_group.items()):
    measured = [r for r in rs if r.get('ok')]
    promise = PROMISE.get(str(prof).split('+')[0], None)
    verdict = 'NO_DATA'
    if measured:
        hs = [r.get('height') or 0 for r in measured]
        maxh = max(hs); minh = min(hs)
        if promise is None:
            verdict = 'UNKNOWN_PROFILE'
        elif maxh > promise:
            verdict = 'SOBREDECLARADO'      # la fuente da MAS de lo que el perfil promete
        elif maxh < promise:
            verdict = 'SUBDECLARADO'        # la fuente da MENOS: el perfil promete de mas
        else:
            verdict = 'OK'
        ok_total += len(measured)
    groups.append({
        'host': host, 'profile': prof,
        'groupTotal': rs[0].get('groupTotal') if rs else None,
        'sampled': len(rs), 'measured': len(measured),
        'promiseHeight': promise,
        'heights': sorted({r.get('height') for r in measured if r.get('height')}),
        'fps': sorted({r.get('fps') for r in measured if r.get('fps')}),
        'codecs': sorted({r.get('codec') for r in measured if r.get('codec')}),
        'verdict': verdict,
        'samples': measured,
    })

doc = {
    'version': 1,
    'measuredAt': __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    'note': ('Medicion real por ffprobe sobre UN segmento. La muestra es una por '
             '(host, perfil): el resultado es ESTIMACION DE HOST, no verdad por canal. '
             'Medir los 21.224 costaria ~34 GB de trafico.'),
    'groups': groups,
    'totalMeasured': ok_total,
    'totalAttempted': len(recs),
}
json.dump(doc, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

print()
print('%-34s %-8s %7s %5s %-24s %-22s %s' % ('HOST','PERFIL','GRUPO','MED','ALTURAS','CODEC/FPS','VEREDICTO'))
for g in groups:
    alt = ','.join(str(h) for h in g['heights']) or '-'
    cf = (','.join(g['codecs']) or '-') + ' ' + (','.join(str(f) for f in g['fps']) or '')
    print('%-34s %-8s %7s %5s %-24s %-22s %s' % (
        str(g['host'])[:34], str(g['profile']), g['groupTotal'], g['measured'],
        alt[:24], cf[:22], g['verdict']))
print()
print('medidos %d de %d intentos -> %s' % (ok_total, len(recs), out))
PY
log "listo: $OUT"
