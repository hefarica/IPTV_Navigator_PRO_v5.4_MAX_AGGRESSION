#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-channel-index.sh   (fuente: vps/bin/ape-channel-index.sh)
#
# Genera /var/www/html/prisma/db/channel_index.json: id -> nombre de TODOS los
# canales de la lista cableada mas reciente.
#
# POR QUE EXISTE
#   /prisma/api/ape-last-channel.php traduce el id que el player pidio por /pulse/
#   al nombre del canal (para el badge de upscaling). Recorrer el .m3u8 de 1,3 GB
#   en cada peticion costaria ~10 s y bloquearia un worker de php-fpm. Con este
#   indice la consulta es leer un JSON de ~1 MB.
#
# CUANDO SE EJECUTA
#   En cada cableado nuevo (deploy-vps.yml), DESPUES de que el cableador produzca
#   la _CABLEADA. Tambien se puede correr a mano:
#       bash /opt/ape-pulse/ape-channel-index.sh
#
# ORDENA POR EL NUMERO DE LISTA MAS ALTO
#   Igual que ape-jit-latest.sh: el mtime no dice cual es la lista nueva. Se usa la
#   _CABLEADA con el numero mas alto en el nombre.
#
# IDEMPOTENTE
#   Reescribe el JSON completo cada vez. Si falla a medias, el JSON anterior queda
#   intacto (se escribe a .tmp y se hace mv atomico).
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

LISTS="${APE_LISTS_DIR:-/var/www/html/lists}"
OUT="${APE_CHANNEL_INDEX:-/var/www/html/prisma/db/channel_index.json}"
TMP="${OUT}.tmp.$$"

best=$(ls "$LISTS"/APE_LISTA_*_CABLEADA.m3u8 2>/dev/null \
       | sed -E 's#(.*/APE_LISTA_([0-9]+)_CABLEADA\.m3u8)#\2 \1#' \
       | sort -rn | head -1 | cut -d' ' -f2-)

if [ -z "$best" ] || [ ! -r "$best" ]; then
  echo "no hay ninguna *_CABLEADA legible en $LISTS" >&2
  exit 2
fi

echo "lista: $(basename "$best") ($(stat -c%s "$best" 2>/dev/null) B)" >&2

# Una sola pasada sobre el fichero. Se captura tvg-id y tvg-name de cada #EXTINF.
# No se mira la URL: los canales sin tvg-id se omiten (sin id no hay nada que
# traducir, y el endpoint devolvera name=null para ellos, que es lo correcto).
awk '
  /^#EXTINF/ {
    id = ""; nm = "";
    if (match($0, /tvg-id="[^"]*"/))   { id = substr($0, RSTART + 8,  RLENGTH - 9)  }
    if (match($0, /tvg-name="[^"]*"/)) { nm = substr($0, RSTART + 10, RLENGTH - 11) }
    if (id != "" && nm != "") printf "%s\t%s\n", id, nm
  }
' "$best" | LC_ALL=C sort -u > "${TMP}.tsv" 2>/dev/null

if [ ! -s "${TMP}.tsv" ]; then
  echo "el indice salio vacio: la lista no tiene tvg-id/tvg-name" >&2
  rm -f "${TMP}.tsv"
  exit 3
fi

python3 - "$OUT" "${TMP}.tsv" <<'PY' 2>&1 | sed 's/^/  /' >&2
import json, sys
out, tsv = sys.argv[1], sys.argv[2]
d = {}
with open(tsv, encoding='utf-8', errors='ignore') as fh:
    for line in fh:
        p = line.rstrip('\n').split('\t', 1)
        if len(p) == 2 and p[0]:
            d[p[0]] = p[1]
with open(out + '.tmp', 'w', encoding='utf-8') as fh:
    json.dump(d, fh, ensure_ascii=False, separators=(',', ':'))
print(f"{len(d)} canales")
PY

if [ -s "${OUT}.tmp" ]; then
  mv -f "${OUT}.tmp" "$OUT"
  chown www-data:www-data "$OUT" 2>/dev/null || true
  chmod 644 "$OUT" 2>/dev/null || true
  echo "publicado: $OUT ($(stat -c%s "$OUT" 2>/dev/null) B)" >&2
else
  echo "no se pudo escribir el indice; el anterior queda intacto" >&2
  rm -f "${OUT}.tmp"
  rm -f "${TMP}.tsv"
  exit 4
fi

rm -f "${TMP}.tsv"
exit 0
