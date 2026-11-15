#!/usr/bin/env bash
# build_real_4k.sh — pipeline 4K medido, sin mentir.
#
# Uso:  ./build_real_4k.sh [salida.m3u]
# Requiere: curl, jq, awk. Sin red no hay paso 1.
#
# Lo que hace:
#   1. Adquiere los streams con quality == "2160p" desde api/streams.json
#      (categories/4k.m3u devuelve 404: no existe).
#   2. Deduplica por URL, una URL por bloque #EXTINF (Anti-509).
#   3. Emite M3U Plus con #EXTM3U y group-title "4K (declarado)".
#   4. Aborta si la lista no cumple los invariantes.
#
# Lo que NO hace: verificar el bitstream (eso es probe, paso 2 manual) ni inventar
# resoluciones. La etiqueta dice "declarado" porque eso es lo que es.

set -euo pipefail

OUT="${1:-real-4k.m3u}"
SRC="https://iptv-org.github.io/api/streams.json"
MIN_EXPECTED=16   # 20 medidos el 2026-11-15; ±20%
MAX_EXPECTED=24
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== 1. Adquiriendo $(basename "$SRC")"
curl -fsSL "$SRC" -o "$TMP/streams.json"

COUNT_IN="$(jq 'length' "$TMP/streams.json")"
COUNT_Q="$(jq '[.[]|select(.quality)]|length' "$TMP/streams.json")"
COUNT_4K="$(jq '[.[]|select(.quality=="2160p")]|length' "$TMP/streams.json")"
echo "   streams=$COUNT_IN  con_quality=$COUNT_Q  2160p=$COUNT_4K"

if [ "$COUNT_4K" -lt "$MIN_EXPECTED" ] || [ "$COUNT_4K" -gt "$MAX_EXPECTED" ]; then
  echo "   AVISO: el inventario 2160p se aleja >20% del medido (20). Re-medir y anotar fecha." >&2
fi

echo "== 2. Emitiendo M3U Plus (etiqueta = declarado)"
{
  printf '#EXTM3U\n'
  jq -r '.[] | select(.quality=="2160p")
         | "#EXTINF:-1 tvg-name=\"" + (.title|gsub("\"";"'")) + "\" group-title=\"4K (declarado)\"," + (.title|gsub("\"";"'")) + "\n" + .url' \
    "$TMP/streams.json"
} > "$TMP/raw.m3u"

echo "== 3. Deduplicando por URL (una URL por canal)"
awk '/^#EXTINF/{inf=$0; next} /^https?:/{ if(!seen[$0]++) print inf "\n" $0 }' \
  "$TMP/raw.m3u" > "$TMP/dedup.body"

{ printf '#EXTM3U\n'; cat "$TMP/dedup.body"; } > "$OUT"

echo "== 4. Verificando invariantes"
EXTINF="$(grep -c '^#EXTINF' "$OUT" || true)"
URLS="$(grep -cE '^https?:' "$OUT" || true)"
MASTER="$(grep -c '^#EXT-X-STREAM-INF' "$OUT" || true)"

printf '   EXTINF=%s  URLs=%s  master_tags=%s\n' "$EXTINF" "$URLS" "$MASTER"

fail=0
[ "$EXTINF" = "$URLS" ] || { echo "   FALLO: EXTINF ($EXTINF) != URLs ($URLS)" >&2; fail=1; }
[ "$(head -1 "$OUT")" = "#EXTM3U" ] || { echo "   FALLO: falta #EXTM3U" >&2; fail=1; }
[ "$MASTER" = "0" ] || { echo "   FALLO: hay #EXT-X-STREAM-INF en una lista de canales" >&2; fail=1; }
[ "$EXTINF" -gt 0 ] || { echo "   FALLO: lista vacia" >&2; fail=1; }

if [ "$fail" -ne 0 ]; then
  echo "== ABORTADO: la lista no cumple invariantes" >&2
  exit 2
fi

echo "== OK -> $OUT ($EXTINF canales, etiqueta 'declarado', sin verificacion de bitstream)"
