#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-list-project.sh   (fuente: vps/bin/ape-list-project.sh)
#
# PROYECTA la lista cableada a dos formas, desde el MISMO fichero.
# Es la "ruta polimorfica / isomorfica" que pidio el operador: una lista, dos
# proyecciones, sin tocar la fuente ni una sola URL de canal.
#
# POR QUE (medido el 2026-11-15)
#   La lista completa de 21.224 canales pesa 1.298.222.092 B (1,3 GB) y su .gz
#   352.804.883 B (353 MB). Desglose real por familia:
#       #EXT-X-APE-   14.316.139 lineas  734.550.274 B  (56,6%)
#       #EXTVLCOPT     2.907.692 lineas  111.071.055 B  ( 8,6%)
#       #EXTINF           21.224 lineas   10.157.879 B  ( 0,8%)
#       URLs              21.224 lineas    4.392.831 B  ( 0,3%)
#   OTT Navigator cumple RFC 8216: los tags que no conoce los IGNORA, y #EXTVLCOPT
#   son opciones de VLC. O sea: ~65% del fichero es metadata que OTT no usa, pero
#   que SI tiene que descargar antes de mostrar el catalogo.
#   A 20 Mbps, 353 MB son 141 s de espera. 14 MB son 5 s.
#
# LAS DOS PROYECCIONES
#   <nombre>_FULL.m3u8   todo tal cual (para VLC/Kodi, que si usan el recetario)
#   <nombre>_OTT.m3u8    #EXTINF + #EXTHTTP + URL (lo que OTT necesita)
#
# QUE CONSERVA LA PROYECCION OTT
#   · #EXTINF completo (tvg-id, tvg-name, tvg-logo, group-title) -> EPG y caratulas
#   · #EXTHTTP (headers por canal): OTT puede usarlos, y sin ellos algunos canales
#     devuelven 403. Se conserva.
#   · #EXTM3U y las directivas de cabecera de la lista
#   · la URL de cada canal, VERBATIM. No se transforma nada.
#
# QUE QUITA
#   · #EXT-X-APE-*   (tags propietarios que RFC 8216 manda ignorar)
#   · #EXTVLCOPT*    (opciones de VLC)
#   · #EXTGRP, #KODIPROP (equivalentes de otros players; se van con el bloque APE)
#
# USO
#   bash ape-list-project.sh                        # la _CABLEADA mas reciente
#   bash ape-list-project.sh /ruta/lista.m3u8
#   APE_LISTS_DIR=/var/www/html/lists bash ...
#
# IDEMPOTENTE: reescribe .tmp y hace mv atomico. Re-ejecutar da el mismo resultado.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

LISTS="${APE_LISTS_DIR:-/var/www/html/lists}"
SRC="${1:-}"
if [ -z "$SRC" ]; then
  SRC=$(ls "$LISTS"/APE_LISTA_*_CABLEADA.m3u8 2>/dev/null \
        | sed -E 's#(.*/APE_LISTA_([0-9]+)_CABLEADA\.m3u8)#\2 \1#' \
        | sort -rn | head -1 | cut -d' ' -f2-)
fi
if [ -z "$SRC" ] || [ ! -r "$SRC" ]; then
  echo "no encuentro la lista cableada en $LISTS" >&2
  exit 2
fi

base="${SRC%_CABLEADA.m3u8}"
OUT_FULL="${base}_CABLEADA_FULL.m3u8"
OUT_OTT="${base}_CABLEADA_OTT.m3u8"

echo "origen: $(basename "$SRC") ($(stat -c%s "$SRC" 2>/dev/null) B)" >&2

# ── Proyeccion OTT: cabecera + EXTINF + EXTHTTP + URL ────────────────────────
# Una sola pasada de awk sobre 1,3 GB. Se queda con:
#   · la cabecera #EXTM3U y los #EXT-X-* de PLAYLIST (VERSION, MEDIA-SEQUENCE...)
#     que no sean de la familia APE
#   · cada #EXTINF
#   · el #EXTHTTP de cada canal (si existe)
#   · la primera URL que sigue
# Todo lo demas se descarta.
awk '
  BEGIN { emitido = 0 }
  /^#EXTM3U/                 { print; next }
  /^#EXT-X-(VERSION|TARGETDURATION|MEDIA-SEQUENCE|PLAYLIST-TYPE|INDEPENDENT-SEGMENTS|ALLOW-CACHE)/ { print; next }
  /^#EXTINF/                 { print; next }
  /^#EXTHTTP/                { print; next }
  /^https?:\/\//             { print; next }
  /^#EXT-X-APE-/             { next }   # 56,6% del fichero: OTT los ignora
  /^#EXTVLCOPT/              { next }   # opciones de VLC
  /^#KODIPROP/               { next }   # opciones de Kodi
  /^#EXTGRP/                 { next }   # agrupacion de VLC
  /^#EXT-X-(MEDIA|I-FRAME-STREAM-INF|STREAM-INF)/ { next }  # no aplican en lista de canales
  { next }                               # cualquier otra cosa: fuera
' "$SRC" > "${OUT_OTT}.tmp" 2>/dev/null

# ── La proyeccion FULL ya EXISTE: es la propia _CABLEADA ───────────────────
# No se copia. Copiar 1,3 GB para tener DOS ficheros identicos es tirar disco, y
# el disco ya estuvo al 91%. La _CABLEADA original es la proyeccion FULL.
ok=1
if [ -s "${OUT_OTT}.tmp" ]; then
  mv -f "${OUT_OTT}.tmp" "$OUT_OTT"
  chown www-data:www-data "$OUT_OTT" 2>/dev/null || true
  chmod 644 "$OUT_OTT" 2>/dev/null || true
else
  echo "fallo generando ${OUT_OTT}.tmp" >&2; rm -f "${OUT_OTT}.tmp"; ok=0
fi

# ── gzip (gzip_static ya esta activo en nginx) ─────────────────────────────
[ -s "$OUT_OTT" ] && gzip -9 -c "$OUT_OTT" > "${OUT_OTT}.gz" 2>/dev/null \
  && chmod 644 "${OUT_OTT}.gz" 2>/dev/null || true

# ── Verificacion: la proyeccion OTT no puede perder canales ────────────────
n_full=$(grep -c '^#EXTINF' "$SRC" 2>/dev/null || echo 0)
n_ott=$(grep -c '^#EXTINF' "$OUT_OTT" 2>/dev/null || echo 0)
n_url=$(grep -cE '^https?://' "$OUT_OTT" 2>/dev/null || echo 0)
echo "" >&2
echo "  FULL : $(stat -c%s "$SRC" 2>/dev/null) B · $n_full canales (la original)" >&2
echo "  OTT  : $(stat -c%s "$OUT_OTT" 2>/dev/null) B · $n_ott canales · $n_url URLs" >&2
echo "  .gz  : $(stat -c%s "$OUT_OTT.gz" 2>/dev/null) B" >&2
if [ "$n_full" -ne "$n_ott" ]; then
  echo "  ALERTA: la proyeccion OTT perdio canales ($n_full -> $n_ott). NO se publica." >&2
  rm -f "$OUT_OTT" "$OUT_OTT.gz"
  exit 3
fi
if [ "$n_ott" -ne "$n_url" ]; then
  echo "  ALERTA: $n_ott canales pero $n_url URLs: cada canal debe tener EXACTAMENTE 1 URL." >&2
  exit 4
fi
echo "  OK: mismos canales, una URL por canal" >&2
[ "$ok" -eq 1 ] && exit 0 || exit 5
