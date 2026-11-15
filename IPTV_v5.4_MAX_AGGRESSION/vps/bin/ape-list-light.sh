#!/usr/bin/env bash
# ape-list-light.sh — proyeccion OTT con #EXTSHIMOTT, a prueba de listas grandes.
#
# POR QUE EXISTE
#   ape-pulse-sync.sh envuelve las listas de /lists/ con ape-pulse-wrap.js, pero solo
#   las de menos de MAX_MB (700 por defecto). La lista vigente pesa 1.240 MB, asi que
#   se la SALTA: nunca recibe el #EXTSHIMOTT aunque el wrap sepa emitirlo.
#   Medido el 2026-11-15: el wrap sobre esa lista tarda 38,6 s, emite 21.224 tags con
#   errors:0, y la proyeccion resultante pesa 177.230.875 B (3.810.439 B con gzip).
#
#   Este script hace el trabajo completo sobre UNA lista, sin el limite de tamano:
#     origen -> wrap (tag) -> project (quita APE/EXTVLCOPT) -> instala -> .gz
#
# IDEMPOTENTE
#   Si la proyeccion ya existe y su origen no cambio (mtime + tamano), no hace nada.
#   El wrap no duplica el tag (lo comprueba el propio wrap: shimott_present).
#
# FAIL-CLOSED
#   Si el wrap devuelve errors>0, o el recuento de canales no cuadra, o la proyeccion
#   no tiene un tag por canal, NO instala nada y sale con codigo != 0. La lista servida
#   se queda como estaba: nunca se publica una lista a medias.
#
# USO
#   ape-list-light.sh [nombre_base]
#     nombre_base  sin extension; por defecto, la lista _CABLEADA mas reciente
#   Variables:
#     APE_LISTS_DIR   (def /var/www/html/lists)
#     APE_FORCE=1     ignora la cache de idempotencia
#     APE_KEEP_TMP=1  no borra el temporal (para depurar)
#
# SALIDA
#   codigo 0  = instalada o ya estaba al dia
#   codigo 2  = falta un fichero de entrada o un binario
#   codigo 3  = el wrap fallo (errors>0)
#   codigo 4  = la proyeccion no tiene un tag por canal (no se instala)
#   codigo 5  = disco insuficiente para el temporal (no se arranca)

set -uo pipefail

LISTS="${APE_LISTS_DIR:-/var/www/html/lists}"
WRAP="${APE_WRAP:-/opt/ape-pulse/ape-pulse-wrap.js}"
BUILDER="${APE_URL_BUILDER:-/opt/ape-pulse/ape-url-builder.js}"
PROJECT="${APE_PROJECT:-/opt/ape-pulse/ape-list-project.sh}"
LOG="${APE_LIGHT_LOG:-/var/log/ape-list-light.log}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG" >&2; }
die() { local c="$1"; shift; log "FATAL[$c] $*"; exit "$c"; }

# ── 0. entrada ────────────────────────────────────────────────────────────────
BASE="${1:-}"
if [ -z "$BASE" ]; then
  BASE=$(ls -1t "$LISTS"/*_CABLEADA.m3u8 2>/dev/null | head -1 | xargs -r basename -s .m3u8)
  [ -n "$BASE" ] || die 2 "no hay ninguna *_CABLEADA.m3u8 en $LISTS"
fi
SRC="$LISTS/$BASE.m3u8"
OUT="$LISTS/${BASE%_CABLEADA}_LIGHT.m3u8"
[ "$BASE" = "${BASE%_CABLEADA}" ] && OUT="$LISTS/${BASE}_LIGHT.m3u8"

[ -f "$SRC" ]     || die 2 "no existe $SRC"
[ -f "$WRAP" ]    || die 2 "no existe $WRAP"
[ -f "$PROJECT" ] || die 2 "no existe $PROJECT"

SRC_SIZE=$(stat -c%s "$SRC")
SRC_MTIME=$(stat -c%Y "$SRC")

# ── 1. idempotencia ───────────────────────────────────────────────────────────
STAMP="$OUT.stamp"
if [ "${APE_FORCE:-0}" != "1" ] && [ -f "$OUT" ] && [ -f "$STAMP" ]; then
  read -r s_size s_mtime < "$STAMP" || true
  if [ "$s_size" = "$SRC_SIZE" ] && [ "$s_mtime" = "$SRC_MTIME" ]; then
    log "sin cambios: $OUT ya corresponde a $SRC ($SRC_SIZE B)"
    exit 0
  fi
fi

# ── 2. disco: el temporal pesa como el origen (el wrap reescribe linea a linea) ─
NEED=$(( SRC_SIZE / 1024 / 1024 + 64 ))
FREE=$(df -Pm "$LISTS" | awk 'NR==2{print $4}')
[ "${FREE:-0}" -ge "$NEED" ] || die 5 "disco insuficiente: libres=${FREE}MB necesario=${NEED}MB"

TMP=$(mktemp -d /tmp/ape-light.XXXXXX) || die 2 "sin /tmp"
cleanup() { [ "${APE_KEEP_TMP:-0}" = "1" ] || rm -rf "$TMP"; }
trap cleanup EXIT

# ── 3. wrap: emite #EXTSHIMOTT desde #EXT-X-APE-STREAM-TRUTH y el #EXTHTTP real ─
T0=$(date +%s)
WRAP_JSON=$(APE_URL_BUILDER="$BUILDER" node "$WRAP" --in "$SRC" --out "$TMP/$BASE.m3u8" 2>>"$LOG")
WRC=$?
T1=$(date +%s)
[ "$WRC" -eq 0 ] || die 3 "el wrap salio con codigo $WRC"
[ -f "$TMP/$BASE.m3u8" ] || die 3 "el wrap no escribio salida"

get() { printf '%s' "$WRAP_JSON" | sed -n "s/.*\"$1\":\([0-9]*\).*/\1/p"; }
W_CH=$(get channels); W_URLS=$(get urls); W_ERR=$(get errors); W_SHI=$(get shimott)
[ -n "$W_ERR" ] || die 3 "no pude leer errors del wrap: $WRAP_JSON"
[ "$W_ERR" -eq 0 ] || die 3 "el wrap reporto errors=$W_ERR"
log "wrap ${T1}s: canales=$W_CH urls=$W_URLS shimott=$W_SHI errors=$W_ERR"

# ── 4. project: quita lo que OTT ignora, CONSERVA EXTINF/EXTHTTP/#EXTSHIMOTT/URL ─
APE_LISTS_DIR="$TMP" bash "$PROJECT" 2>>"$LOG" || die 4 "el project fallo"
PROJ="$TMP/$(basename "$OUT")"
[ -f "$PROJ" ] || die 4 "el project no genero $(basename "$OUT")"

P_CH=$(grep -c '^#EXTINF' "$PROJ" 2>/dev/null || echo 0)
P_TAG=$(grep -c '^#EXTSHIMOTT:' "$PROJ" 2>/dev/null || echo 0)
P_APE=$(grep -c '^#EXT-X-APE-' "$PROJ" 2>/dev/null || echo 0)

# ── 5. fail-closed: nada se publica si no cuadra ─────────────────────────────
[ "$P_CH" -eq "$W_CH" ] || die 4 "canales no cuadran: wrap=$W_CH proyeccion=$P_CH"
[ "$P_TAG" -eq "$P_CH" ] || die 4 "faltan tags: $P_TAG para $P_CH canales (debe ser 1 por canal)"
[ "$P_APE" -eq 0 ]      || die 4 "quedan $P_APE lineas #EXT-X-APE- en la proyeccion"

# ── 6. instalar atomico ───────────────────────────────────────────────────────
cp -f "$PROJ" "$OUT.tmp" || die 4 "no pude escribir $OUT.tmp"
gzip -9 -c "$OUT.tmp" > "$OUT.tmp.gz" || die 4 "gzip fallo"
mv -f "$OUT.tmp" "$OUT" || die 4 "no pude mover $OUT"
mv -f "$OUT.tmp.gz" "$OUT.gz" || die 4 "no pude mover $OUT.gz"
chown www-data:www-data "$OUT" "$OUT.gz" 2>/dev/null || true
chmod 644 "$OUT" "$OUT.gz" 2>/dev/null || true
printf '%s %s\n' "$SRC_SIZE" "$SRC_MTIME" > "$STAMP"

T2=$(date +%s)
log "OK ${T2}s: $OUT $(stat -c%s "$OUT") B · $P_CH canales · $P_TAG tags · gz $(stat -c%s "$OUT.gz") B"
log "origen: $SRC ($SRC_SIZE B)"
exit 0
