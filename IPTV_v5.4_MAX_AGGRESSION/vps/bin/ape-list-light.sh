#!/usr/bin/env bash
# ape-list-light.sh — proyeccion OTT con #EXTSHIMOTT, a prueba de listas grandes.
#
# POR QUE EXISTE
#   ape-pulse-sync.sh envuelve las listas de /lists/ con ape-pulse-wrap.js, pero solo
#   las de menos de MAX_MB (700 por defecto). La lista vigente pesa 1.240 MB, asi que
#   se la SALTA: nunca recibe el #EXTSHIMOTT aunque el wrap sepa emitirlo.
#
#   Medido el 2026-11-15 sobre esa lista:
#     wrap 38,6 s · channels=21224 · shimott=21224 · errors=0
#     shimott_id_fallback=0 (ningun id inventado) · shimott_exthttp_invalid=0
#     proyeccion: 177.230.875 B · 21.224 EXTINF · 21.224 tags · 0 APE
#
#   Este script hace el trabajo completo sobre UNA lista:
#     origen -> wrap (tag) -> awk (quita lo que OTT ignora) -> instala -> .gz
#
# POR QUE NO USA ape-list-project.sh
#   El project compone el nombre de salida a partir del nombre de su origen. Cuando el
#   origen ya trae sufijos (_CABLEADA, _OTT_CABLEADA, _LIGHT...) el nombre se compone
#   y no coincide con lo esperado. Se midieron TRES intentos con nombres distintos
#   antes de verlo. Aqui la proyeccion es un awk propio: el nombre de salida lo decide
#   ESTE script y no depende de nadie.
#
# IDEMPOTENTE
#   Si la proyeccion ya existe y su origen no cambio (mtime+tamano en un .stamp), no
#   hace nada.
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

# ── 0. origen ─────────────────────────────────────────────────────────────────
# El glob DEBE excluir proyecciones y residuos, o el script se come su propia salida.
# Medido: tomo _CABLEADA_OTT_CABLEADA (residuo) y _LIGHT_CABLEADA (su propia salida).
# DOS TRAMPAS MEDIDAS, las dos me costaron un intento:
#  1) `ls -1t` ordena por FECHA. La lista de 3 canales de prueba
#     (APE_PRUEBA_ORDER_OK_CABLEADA) era mas reciente que la vigente de 21.224 y el
#     script la tomo como origen. Se ordena por TAMANO: la vigente es la grande.
#  2) El filtro tiene que excluir PRUEBA, proyecciones y residuos, o se come su propia
#     salida o un artefacto de test.
ORIGIN_FILTER='_(LIGHT|SHIELDED|OTT)(_CABLEADA)?\.m3u8$|/APE_PRUEBA'
BASE="${1:-}"
if [ -z "$BASE" ]; then
  BASE=$(ls -1S "$LISTS"/*_CABLEADA.m3u8 2>/dev/null \
         | grep -vE "$ORIGIN_FILTER" \
         | head -1 | xargs -r basename -s .m3u8)
fi
[ -n "$BASE" ] || die 2 "no hay lista origen en $LISTS (filtro: !$ORIGIN_FILTER)"

SRC="$LISTS/$BASE.m3u8"
OUT="$LISTS/${BASE}_LIGHT.m3u8"
[ -f "$SRC" ]  || die 2 "no existe $SRC"
[ -f "$WRAP" ] || die 2 "no existe $WRAP"

SRC_SIZE=$(stat -c%s "$SRC"); SRC_MTIME=$(stat -c%Y "$SRC")

# ── 1. idempotencia ───────────────────────────────────────────────────────────
STAMP="$OUT.stamp"
if [ "${APE_FORCE:-0}" != "1" ] && [ -f "$OUT" ] && [ -f "$STAMP" ]; then
  read -r s_size s_mtime < "$STAMP" || true
  if [ "$s_size" = "$SRC_SIZE" ] && [ "$s_mtime" = "$SRC_MTIME" ]; then
    log "sin cambios: $OUT ya corresponde a $SRC ($SRC_SIZE B)"; exit 0
  fi
fi

# ── 2. disco ──────────────────────────────────────────────────────────────────
NEED=$(( SRC_SIZE / 1024 / 1024 + 64 ))
FREE=$(df -Pm "$LISTS" | awk 'NR==2{print $4}')
[ "${FREE:-0}" -ge "$NEED" ] || die 5 "disco insuficiente: libres=${FREE}MB necesario=${NEED}MB"

TMP=$(mktemp -d /tmp/ape-light.XXXXXX) || die 2 "sin /tmp"
trap '[ "${APE_KEEP_TMP:-0}" = "1" ] || rm -rf "$TMP"' EXIT

# ── 3. wrap: emite #EXTSHIMOTT desde #EXT-X-APE-STREAM-TRUTH y el #EXTHTTP real ─
T0=$(date +%s)
WRAP_JSON=$(APE_URL_BUILDER="$BUILDER" node "$WRAP" --in "$SRC" --out "$TMP/wrapped.m3u8" 2>>"$LOG")
WRC=$?
T1=$(date +%s)
[ "$WRC" -eq 0 ]           || die 3 "el wrap salio con codigo $WRC"
[ -f "$TMP/wrapped.m3u8" ] || die 3 "el wrap no escribio salida"

# Parseo con Python: el JSON del wrap acaba en "errors":0} SIN coma, y con sed greedy se
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
[ -n "$W_ERR" ] || die 3 "no pude leer errors del wrap. JSON: $(printf '%s' "$WRAP_JSON" | head -c 300)"
[ -n "$W_SHI" ] || die 3 "no pude leer shimott del wrap. JSON: $(printf '%s' "$WRAP_JSON" | head -c 300)"
[ "$W_ERR" -eq 0 ] || die 3 "el wrap reporto errors=$W_ERR"
log "wrap $((T1-T0))s: canales=$W_CH urls=$W_URLS shimott=$W_SHI errors=$W_ERR"

# ── 4. proyeccion: lo que OTT necesita, nada de lo que ignora ─────────────────
# Conserva: #EXTM3U, #EXT-X-<estandar>, #EXTINF, #EXTHTTP, #EXTSHIMOTT, URLs.
# Descarta: #EXT-X-APE-* (RFC 8216 ignora tags desconocidos), #EXTVLCOPT y #KODIPROP
#           (son de VLC/Kodi), #EXTGRP, y #EXT-X-I-FRAME-STREAM-INF (trick-play).
PROJ="$TMP/proj.m3u8"
awk '
  /^#EXTM3U/                   { print; next }
  /^#EXT-X-APE-/               { next }
  # #EXT-X-VNOVA-LCEVC-* son 6 tags por canal (21.224 x 6 = 127.344 lineas, 90,7 MB)
  # que declaran LCEVC Phase 4 SIN motor detras. Ni son estandar ni OTT los lee: misma
  # categoria que las #EXT-X-APE-. Medido el 2026-11-15 en la proyeccion: sin quitarlas
  # la lista pesaba 267.998.453 B; con ellas fuera baja a ~177 MB.
  /^#EXT-X-VNOVA-/             { next }
  /^#EXTVLCOPT/                { next }
  /^#KODIPROP/                 { next }
  /^#EXTGRP/                   { next }
  /^#EXT-X-I-FRAME-STREAM-INF/ { next }
  /^#EXTINF/                   { print; next }
  /^#EXTHTTP:/                 { print; next }
  /^#EXTSHIMOTT:/              { print; next }
  /^#EXT-X-/                   { print; next }
  /^#/                         { next }
  NF                           { print; next }
' "$TMP/wrapped.m3u8" > "$PROJ" || die 4 "el awk de proyeccion fallo"

# TRAMPA DE BASH: `grep -c` IMPRIME el conteo Y ADEMAS sale con codigo 1 cuando no
# encuentra nada. Con `|| echo 0` el valor queda "0\n0" y `[ "0 0" -eq 0 ]` revienta.
# Medido: el script abortaba con "FATAL[4] quedan 0" teniendo cero lineas APE.
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
cp -f "$PROJ" "$OUT.tmp"              || die 4 "no pude escribir $OUT.tmp"
gzip -9 -c "$OUT.tmp" > "$OUT.tmp.gz" || die 4 "gzip fallo"
mv -f "$OUT.tmp" "$OUT"               || die 4 "no pude mover $OUT"
mv -f "$OUT.tmp.gz" "$OUT.gz"         || die 4 "no pude mover $OUT.gz"
chown www-data:www-data "$OUT" "$OUT.gz" 2>/dev/null || true
chmod 644 "$OUT" "$OUT.gz" 2>/dev/null || true
printf '%s %s\n' "$SRC_SIZE" "$SRC_MTIME" > "$STAMP"

T2=$(date +%s)
log "OK $((T2-T0))s: $OUT $(stat -c%s "$OUT") B · $P_CH canales · $P_TAG tags · gz $(stat -c%s "$OUT.gz") B"
log "origen: $SRC ($SRC_SIZE B)"
exit 0