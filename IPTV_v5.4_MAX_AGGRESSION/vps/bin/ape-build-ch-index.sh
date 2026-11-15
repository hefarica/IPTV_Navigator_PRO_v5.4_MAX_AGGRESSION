#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-build-ch-index.sh — INDICE canal_id -> URL upstream, para el probe server-side
#
# POR QUE EXISTE
#   Medido 2026-11-15: el proveedor NO manda Access-Control-Allow-Origin y el
#   navegador no puede poner User-Agent en fetch. Resultado: el probe del navegador
#   (ape-quality-prober.js, mode:'cors') falla en el 100% de los canales y por eso
#   `probe.verified` nunca es true y el clasificador cae siempre en heuristicas.
#   0 canales verificados de 21.224.
#
#   La unica forma de medir es server-side. Pero un endpoint que acepte una URL
#   arbitraria es SSRF. La solucion: el endpoint acepta un CHANNEL ID y resuelve la
#   URL contra este indice, construido SOLO con las URLs de nuestras listas.
#
# QUE HACE
#   Lee la lista servida y emite un JSON { "<id>": "<url upstream>", ... }
#   pairing #EXTSHIMOTT:{"id":"<id>"} con la siguiente linea http(s).
#   La URL upstream se saca del parametro u= de la URL /pulse/, que es la original
#   del proveedor (sin envolver).
#
# SALIDA
#   /var/lib/ape/ch-url-index.json   { "version":1, "built":"<iso>", "count":N, "urls":{...} }
#
# USO
#   bash ape-build-ch-index.sh [lista.m3u8]
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

LISTS="${APE_LISTS_DIR:-/var/www/lists}"
OUT="${APE_CH_INDEX:-/var/lib/ape/ch-url-index.json}"
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

SRC="${1:-$LISTS/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8}"
[ -r "$SRC" ] || { log "FATAL: no legible $SRC"; exit 2; }

mkdir -p "$(dirname "$OUT")" 2>/dev/null || true

python3 - "$SRC" "$OUT" <<'PY'
import sys, json, re, datetime, urllib.parse

src, out = sys.argv[1], sys.argv[2]
urls = {}
pulse = 0
direct = 0

# El bloque de cada canal: #EXTSHIMOTT:{"ver":1,"id":"<id>",...} y luego la URL.
# La URL puede ser /pulse/<id>.m3u8?u=<upstream>  o  una URL directa al proveedor.
cur_id = None
try:
    with open(src, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.rstrip('\n')
            if line.startswith('#EXTSHIMOTT:'):
                m = re.search(r'"id"\s*:\s*"([^"]+)"', line)
                cur_id = m.group(1) if m else None
                continue
            if line.startswith('http'):
                if cur_id:
                    # si es un /pulse/, sacar la u= (la URL original del proveedor)
                    if '/pulse/' in line:
                        q = urllib.parse.parse_qs(urllib.parse.urlparse(line).query)
                        u = (q.get('u') or [None])[0]
                        if u:
                            urls[cur_id] = u
                            pulse += 1
                    elif cur_id not in urls:
                        urls[cur_id] = line
                        direct += 1
                cur_id = None
except Exception as e:
    sys.stderr.write('error leyendo %s: %s\n' % (src, e))

doc = {
    'version': 1,
    'built': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    'source': src.rsplit('/', 1)[-1],
    'count': len(urls),
    'from_pulse': pulse,
    'from_direct': direct,
    'urls': urls,
}
with open(out, 'w', encoding='utf-8') as f:
    json.dump(doc, f, ensure_ascii=False)
print('%d canales (%d via pulse, %d directos) -> %s' % (len(urls), pulse, direct, out))
PY
RC=$?
[ "$RC" -eq 0 ] || { log "FATAL: el indexador fallo (rc=$RC)"; exit 4; }

chmod 644 "$OUT" 2>/dev/null || true
log "index: $(stat -c%s "$OUT" 2>/dev/null) B · $(python3 -c "import json;print(json.load(open('$OUT')).get('count',0))" 2>/dev/null) canales"
