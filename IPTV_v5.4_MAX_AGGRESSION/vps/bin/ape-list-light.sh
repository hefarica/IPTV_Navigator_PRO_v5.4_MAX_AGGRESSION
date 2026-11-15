#!/usr/bin/env bash
# ape-list-light.sh — proyeccion OTT con #EXTSHIMOTT, a prueba de listas grandes.
#
# POR QUE EXISTE
#   ape-pulse-sync.sh envuelve las listas de /lists/ con ape-pulse-wrap.js, pero solo
#   las de menos de MAX_MB (700 por defecto). La lista vigente pesa 1.240 MB, asi que
#   se la SALTA: nunca recibe el #EXTSHIMOTT aunque el wrap sepa emitirlo.
#
#   Este script hace el trabajo completo sobre UNA lista:
#     origen -> wrap (tag) -> filtro de tags estandar -> instala -> .gz
#
# LISTA BLANCA, NO LISTA NEGRA
#   El generador emite ~10 familias de metadata propietaria por canal (APE, VNOVA-LCEVC,
#   PHANTOM-HYDRA, CMAF, ...). Perseguirlas una a una no escala: se quitaron APE (-735 MB)
#   y VNOVA (-90 MB) y quedaban PHANTOM+CMAF (-94 MB) en la misma lista.
#   OTT Navigator solo necesita los tags que RFC 8216 define; el resto lo ignora igual.
#   Asi que se CONSERVA una lista blanca y todo lo demas cae:
#     #EXTM3U, #EXTINF, #EXTHTTP (headers que el player SI usa), #EXTSHIMOTT (el
#     contrato del shim) y los #EXT-X-<estandar> de STANDARD_TAGS.
#
# FAIL-CLOSED
#   exit 3 si el wrap trae errors>0 o no se puede leer su JSON
#   exit 4 si la proyeccion no tiene 1 tag por canal, 1 URL por canal, o le quedan APE
#   exit 5 si no hay disco para el temporal
#   En cualquiera de esos casos NO instala: la lista servida queda como estaba.
#
# USO
#   ape-list-light.sh [nombre_base_sin_extension]
#   APE_LISTS_DIR (def /var/www/html/lists) · APE_FORCE=1 · APE_KEEP_TMP=1

set -uo pipefail

LISTS="${APE_LISTS_DIR:-/var/www/html/lists}"
WRAP="${APE_WRAP:-/opt/ape-pulse/ape-pulse-wrap.js}"
BUILDER="${APE_URL_BUILDER:-/opt/ape-pulse/ape-url-builder.js}"
LOG="${APE_LIGHT_LOG:-/var/log/ape-list-light.log}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG" >&2; }
die() { local c="$1"; shift; log "FATAL[$c] $*"; exit "$c"; }

# Tags de playlist definidos por RFC 8216. Solo estos se copian de la familia #EXT-X-.
STANDARD_TAGS='EXT-X-VERSION|EXT-X-INDEPENDENT-SEGMENTS|EXT-X-TARGETDURATION|EXT-X-MEDIA-SEQUENCE|EXT-X-DISCONTINUITY-SEQUENCE|EXT-X-PLAYLIST-TYPE|EXT-X-ENDLIST|EXT-X-I-FRAMES-ONLY|EXT-X-START|EXT-X-DISCONTINUITY|EXT-X-KEY|EXT-X-MAP|EXT-X-BYTERANGE|EXT-X-PROGRAM-DATE-TIME|EXT-X-DATERANGE|EXT-X-GAP|EXT-X-BITRATE|EXT-X-STREAM-INF|EXT-X-MEDIA|EXT-X-SESSION-DATA|EXT-X-SESSION-KEY|EXT-X-SERVER-CONTROL|EXT-X-PART-INF|EXT-X-PART|EXT-X-PRELOAD-HINT|EXT-X-RENDITION-REPORT|EXT-X-SKIP|EXT-X-DEFINE|EXT-X-CONTENT-STEERING'

# ── 0. origen ─────────────────────────────────────────────────────────────────
# DOS TRAMPAS MEDIDAS, una por intento:
#  1) `ls -1t` ordena por FECHA. La lista de 3 canales de prueba era mas reciente que
#     la vigente de 21.224 y el script tomo la de prueba. Se ordena por TAMANO.
#  2) El filtro tiene que excluir PRUEBA, proyecciones y residuos, o se come su propia
#     salida (_LIGHT_CABLEADA) o un artefacto de test.
ORIGIN_FILTER='_(LIGHT|SHIELDED|OTT)(_CABLEADA)?\.m3u8$|/APE_PRUEBA'
BASE="${1:-}"
if [ -z "$BASE" ]; then
  BASE=$(ls -1S "$LISTS"/*_CABLEADA.m3u8 2>/dev/null \
         | grep -vE "$ORIGIN_FILTER" \
         | head -1 | xargs -r basename -s .m3u8)
fi
[ -n "$BASE" ] || die 2 "no hay lista origen en $LISTS"

SRC="$LISTS/$BASE.m3u8"
OUT="$LISTS/${BASE}_LIGHT.m3u8"
[ -f "$SRC" ]  || die 2 "no existe $SRC"
[ -f "$WRAP" ] || die 2 "no existe $WRAP"

SRC_SIZE=$(stat -c%s "$SRC"); SRC_MTIME=$(stat -c%Y "$SRC")

# ── 1. idempotencia: MIRA EL RESULTADO, no solo la entrada ───────────────────
# BUG MEDIDO 2026-11-15 05:59: el .stamp comparaba solo el origen. Alguien
# (ape-cablear-auto, cada 15 min) reescribio la PROYECCION; el origen no cambio, el
# stamp seguia diciendo "sin cambios" y el timer NO la recuperaba. La lista se quedo
# en 171 MB sin tags y el timer lo daba por bueno. Una idempotencia que solo mira la
# entrada no detecta que el resultado se corrompio.
#
# Ahora, antes de salir, se comprueba el CONTENIDO de la proyeccion: un #EXTSHIMOTT por
# canal y cero lineas #EXT-X-APE-. Si no cuadra, se regenera aunque el origen no cambie.
STAMP="$OUT.stamp"
light_ok() {
  [ -f "$OUT" ] || return 1
  local ch tag ape
  ch=$(grep -c '^#EXTINF' "$OUT" 2>/dev/null); ch=${ch:-0}
  tag=$(grep -c '^#EXTSHIMOTT:' "$OUT" 2>/dev/null); tag=${tag:-0}
  ape=$(grep -c '^#EXT-X-APE-' "$OUT" 2>/dev/null); ape=${ape:-0}
  [ "$ch" -gt 0 ] || return 1
  [ "$tag" -eq "$ch" ] || return 1
  [ "$ape" -eq 0 ] || return 1
  return 0
}
if [ "${APE_FORCE:-0}" != "1" ] && [ -f "$STAMP" ] && light_ok; then
  read -r s_size s_mtime < "$STAMP" || true
  if [ "$s_size" = "$SRC_SIZE" ] && [ "$s_mtime" = "$SRC_MTIME" ]; then
    log "sin cambios: $OUT ya corresponde a $SRC ($SRC_SIZE B) y su contenido cuadra"; exit 0
  fi
fi
if [ -f "$OUT" ] && ! light_ok; then
  log "REPARAR: $OUT no cuadra (se esperaba 1 tag por canal y 0 lineas APE) -> se regenera"
fi

# ── 2. disco ──────────────────────────────────────────────────────────────────
NEED=$(( SRC_SIZE / 1024 / 1024 + 64 ))
FREE=$(df -Pm "$LISTS" | awk 'NR==2{print $4}')
[ "${FREE:-0}" -ge "$NEED" ] || die 5 "disco insuficiente: libres=${FREE}MB necesario=${NEED}MB"

TMP=$(mktemp -d /tmp/ape-light.XXXXXX) || die 2 "sin /tmp"
trap '[ "${APE_KEEP_TMP:-0}" = "1" ] || rm -rf "$TMP"' EXIT

# ── 3. wrap ───────────────────────────────────────────────────────────────────
T0=$(date +%s)
WRAP_JSON=$(APE_URL_BUILDER="$BUILDER" node "$WRAP" --in "$SRC" --out "$TMP/wrapped.m3u8" 2>>"$LOG")
WRC=$?
T1=$(date +%s)
[ "$WRC" -eq 0 ]           || die 3 "el wrap salio con codigo $WRC"
[ -f "$TMP/wrapped.m3u8" ] || die 3 "el wrap no escribio salida"

# Parseo con Python: el JSON acaba en "errors":0} SIN coma, y con sed greedy se
# capturaba "shimott_present" en vez de "shimott" (medido: reporto 0 con 21.224 tags).
get() {
  printf '%s' "$WRAP_JSON" | python3 -c 'import json,sys
try:
    v = json.load(sys.stdin).get(sys.argv[1])
    print(int(v) if isinstance(v,(int,float)) else "")
except Exception:
    print("")' "$1"
}
W_CH=$(get channels); W_URLS=$(get urls); W_ERR=$(get errors); W_SHI=$(get shimott)
[ -n "$W_ERR" ] || die 3 "no pude leer errors del wrap"
[ -n "$W_SHI" ] || die 3 "no pude leer shimott del wrap"
[ "$W_ERR" -eq 0 ] || die 3 "el wrap reporto errors=$W_ERR"
log "wrap $((T1-T0))s: canales=$W_CH urls=$W_URLS shimott=$W_SHI errors=$W_ERR"

# ── 4. proyeccion con lista blanca ────────────────────────────────────────────
PROJ="$TMP/proj.m3u8"
awk -v STD="$STANDARD_TAGS" '
  /^#EXTM3U/      { print; next }
  /^#EXTINF/      { print; next }
  /^#EXTHTTP:/    { print; next }
  /^#EXTSHIMOTT:/ { print; next }
  /^#EXT-X-/ {
      t = $0
      sub(/^#EXT-X-/, "", t)
      sub(/[:].*$/, "", t)
      if ($0 ~ ("^#EXT-X-(" STD ")([:]|$)") || ("#EXT-X-" t) ~ ("^#(" STD ")$")) { print; next }
      next
  }
  /^#/            { next }
  NF              { print; next }
' "$TMP/wrapped.m3u8" > "$PROJ"
[ -s "$PROJ" ] || die 4 "el awk de proyeccion no produjo nada"

# TRAMPA DE BASH: `grep -c` IMPRIME el conteo Y ADEMAS sale con codigo 1 si no encuentra
# nada. Con `|| echo 0` el valor queda con dos ceros y la comparacion numerica revienta.
P_CH=$(grep -c '^#EXTINF'       "$PROJ" 2>/dev/null); P_CH=${P_CH:-0}
P_TAG=$(grep -c '^#EXTSHIMOTT:' "$PROJ" 2>/dev/null); P_TAG=${P_TAG:-0}
P_APE=$(grep -c '^#EXT-X-APE-'  "$PROJ" 2>/dev/null); P_APE=${P_APE:-0}
P_URL=$(grep -cE '^https?://'   "$PROJ" 2>/dev/null); P_URL=${P_URL:-0}

# ── 5. fail-closed ────────────────────────────────────────────────────────────
[ "$P_CH" -eq "$W_CH" ]  || die 4 "canales no cuadran: wrap=$W_CH proyeccion=$P_CH"
[ "$P_URL" -eq "$P_CH" ] || die 4 "URLs no cuadran: canales=$P_CH urls=$P_URL"
[ "$P_TAG" -eq "$P_CH" ] || die 4 "tags no cuadran: $P_TAG para $P_CH canales"
[ "$P_APE" -eq 0 ]       || die 4 "quedan $P_APE lineas #EXT-X-APE-"

# ── 6. instalar atomico ───────────────────────────────────────────────────────
cp -f "$PROJ" "$OUT.tmp"               || die 4 "no pude escribir $OUT.tmp"
gzip -9 -c "$OUT.tmp" > "$OUT.tmp.gz"  || die 4 "gzip fallo"
mv -f "$OUT.tmp" "$OUT"                || die 4 "no pude mover $OUT"
mv -f "$OUT.tmp.gz" "$OUT.gz"          || die 4 "no pude mover $OUT.gz"
chown www-data:www-data "$OUT" "$OUT.gz" 2>/dev/null || true
chmod 644 "$OUT" "$OUT.gz" 2>/dev/null || true
printf '%s %s\n' "$SRC_SIZE" "$SRC_MTIME" > "$STAMP"

T2=$(date +%s)
log "OK $((T2-T0))s: $OUT $(stat -c%s "$OUT") B · $P_CH canales · $P_TAG tags · gz $(stat -c%s "$OUT.gz") B"
exit 0