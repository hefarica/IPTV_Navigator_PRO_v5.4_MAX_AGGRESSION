#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-light-sync-image-module.sh
#
# SINCRONIZA la lista LIGHT con el MODULO DE IMAGEN (JIT APE).
#
# EL PROBLEMA MEDIDO (2026-11-15)
#   Las dos superficies tienen, cada una, exactamente lo que a la otra le falta:
#
#     /jit/image/lineup (10,7 MB · 21.224 canales)
#       EXT-X-APE-GOVERNANCE x1   · EXT-X-APE-ENGINE x1
#       EXT-X-APE-PROFILE / TARGET / PROCESSING / WARNING por canal
#       EXT-X-APE-PROFILE-TEMPLATE 0        <- NO tiene la proyeccion por perfil
#       EXT-X-APE-LAB-METADATA     0        <- NO emite el plan Prisma
#
#     APE_..._CABLEADA_LIGHT.m3u8 (241 MB · 21.224 canales)
#       EXT-X-APE-PROFILE-TEMPLATE 9        <- la proyeccion por perfil
#       EXT-X-APE-PROFILE-INDEX    1
#       EXT-X-APE-GOVERNANCE       0        <- NO tiene el gobierno
#       EXT-X-APE-ENGINE           0
#       EXT-X-APE-LAB-METADATA     0
#
#   Y el plan Prisma de los 12 perfiles lo produce /jit/image/prisma/emit-all
#   (5.497 B json · 7.332 B base64 · 31 chunks), que es el MISMO payload que el
#   panel pinta. Ninguna lista lo lleva.
#
# LO QUE HACE
#   Toma la LIGHT y le INYECTA, en la cabecera, sin tocar un solo canal:
#     1) #EXT-X-APE-GOVERNANCE  (del propio JIT, no inventado)
#     2) #EXT-X-APE-ENGINE      (idem)
#     3) los 31 #EXT-X-APE-LAB-METADATA  (idem)
#   Orden final: #EXTM3U, GOVERNANCE, ENGINE, [EXT-X-* de playlist], LAB-METADATA,
#   PROFILE-INDEX, PROFILE-TEMPLATE x9, y el cuerpo intacto.
#
# GARANTIAS
#   - Idempotente: si las tres piezas ya estan, dice "sin cambios" y sale 0.
#   - No toca URLs ni canales: verifica EXTINF y URLs antes/despues.
#   - Fail-closed: si el JIT no responde o el conteo no cuadra, NO publica.
#   - Backup del fichero anterior antes de instalar.
#
# USO
#   bash ape-light-sync-image-module.sh [lista_light.m3u8]
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

LISTS="${APE_LISTS_DIR:-/var/www/lists}"
JIT="${APE_JIT_BASE:-http://127.0.0.1:3099}"
LOG="${APE_SYNC_LOG:-/var/log/ape-light-sync.log}"
T=$(date -u +%Y%m%dT%H%M%SZ)
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG" >&2; }
die() { log "FATAL[$1] $2"; exit "$1"; }

SRC="${1:-}"
if [ -z "$SRC" ]; then
  SRC=$(ls -1S "$LISTS"/*_CABLEADA_LIGHT.m3u8 2>/dev/null | head -1)
fi
[ -n "$SRC" ] && [ -r "$SRC" ] || die 2 "no hay lista LIGHT legible en $LISTS"
BASE="${SRC%.m3u8}"
log "origen: $(basename "$SRC") ($(stat -c%s "$SRC") B)"

# ── 0. idempotencia: mira el RESULTADO, no solo la entrada ────────────────────
if grep -q '^#EXT-X-APE-GOVERNANCE:' "$SRC" 2>/dev/null \
   && grep -q '^#EXT-X-APE-LAB-METADATA:' "$SRC" 2>/dev/null; then
  log "sin cambios: ya tiene GOVERNANCE y LAB-METADATA"
  exit 0
fi

# ── 1. recoger las tres piezas del JIT ────────────────────────────────────────
GOV=$(curl -s -m 20 "$JIT/image/lineup" 2>/dev/null | head -3 | grep -m1 '^#EXT-X-APE-GOVERNANCE:')
ENG=$(curl -s -m 20 "$JIT/image/lineup" 2>/dev/null | head -4 | grep -m1 '^#EXT-X-APE-ENGINE:')
[ -n "$GOV" ] || die 3 "el JIT no devolvio GOVERNANCE ($JIT/image/lineup)"
[ -n "$ENG" ] || die 3 "el JIT no devolvio ENGINE ($JIT/image/lineup)"
log "gobierno : $(echo "$GOV" | cut -c1-90)"
log "motor    : $(echo "$ENG" | cut -c1-90)"

TMPLAB=$(mktemp)
trap 'rm -f "$TMPLAB" "$BASE".tmp 2>/dev/null' EXIT
curl -s -m 40 "$JIT/image/prisma/emit-all" 2>/dev/null > "$TMPLAB"
NLINES=$(python3 -c "
import json,sys
try:
  d=json.load(open('$TMPLAB'))
except Exception:
  print(0); raise SystemExit
lines=d.get('lines') or []
for l in lines: print(l)
" 2>/dev/null | tee "$TMPLAB.lines" | wc -l)
[ "$NLINES" -gt 0 ] || die 3 "el JIT no devolvio lineas LAB-METADATA ($JIT/image/prisma/emit-all)"
log "plan prisma: $NLINES chunks"

# ── 2. contar el cuerpo ANTES ─────────────────────────────────────────────────
CH0=$(grep -c '^#EXTINF' "$SRC" 2>/dev/null);  CH0=${CH0:-0}
UR0=$(grep -cE '^https?://' "$SRC" 2>/dev/null); UR0=${UR0:-0}
TMP0=$(grep -c '^#EXT-X-APE-PROFILE-TEMPLATE:' "$SRC" 2>/dev/null); TMP0=${TMP0:-0}
log "antes: canales=$CH0 urls=$UR0 plantillas=$TMP0"

# ── 3. construir la cabecera nueva y el cuerpo intacto ────────────────────────
OUT="$BASE.tmp"
{
  echo '#EXTM3U'
  echo "$GOV"
  echo "$ENG"
  # el resto de la cabecera original: los #EXT-X-* de playlist y los SESSION-DATA,
  # pero NO el #EXTM3U (ya escrito) ni nada que vayamos a inyectar.
  awk 'NR>1 && /^#EXT-X-/ && !/^#EXT-X-APE-PROFILE-TEMPLATE:/ && !/^#EXT-X-APE-PROFILE-INDEX:/ && !/^#EXT-X-APE-LAB-METADATA:/ && !/^#EXT-X-APE-GOVERNANCE:/ && !/^#EXT-X-APE-ENGINE:/ { print }' "$SRC"
  cat "$TMPLAB.lines"
  grep '^#EXT-X-APE-PROFILE-INDEX:' "$SRC" 2>/dev/null
  grep '^#EXT-X-APE-PROFILE-TEMPLATE:' "$SRC" 2>/dev/null
  # el cuerpo: desde el primer #EXTINF hasta el final, byte a byte
  awk 'f{print} /^#EXTINF/{if(!f){f=1; print}}' "$SRC"
} > "$OUT" 2>/dev/null

[ -s "$OUT" ] || die 4 "la salida quedo vacia"

# ── 4. contar el cuerpo DESPUES ───────────────────────────────────────────────
CH1=$(grep -c '^#EXTINF' "$OUT" 2>/dev/null);  CH1=${CH1:-0}
UR1=$(grep -cE '^https?://' "$OUT" 2>/dev/null); UR1=${UR1:-0}
TMP1=$(grep -c '^#EXT-X-APE-PROFILE-TEMPLATE:' "$OUT" 2>/dev/null); TMP1=${TMP1:-0}
LM1=$(grep -c '^#EXT-X-APE-LAB-METADATA:' "$OUT" 2>/dev/null); LM1=${LM1:-0}
log "despues: canales=$CH1 urls=$UR1 plantillas=$TMP1 labmetadata=$LM1"

[ "$CH1" -eq "$CH0" ] || die 4 "canales no cuadran: $CH0 -> $CH1"
[ "$UR1" -eq "$UR0" ] || die 4 "urls no cuadran: $UR0 -> $UR1"
[ "$TMP1" -eq "$TMP0" ] || die 4 "plantillas no cuadran: $TMP0 -> $TMP1"
[ "$LM1" -eq "$NLINES" ] || die 4 "lab-metadata incompleto: $LM1 de $NLINES"

# ── 5. instalar atomico ───────────────────────────────────────────────────────
cp -a "$SRC" "${SRC}.bak-presync-$T" || die 4 "no pude hacer backup"
gzip -9 -c "$OUT" > "$OUT.gz" || die 4 "gzip fallo"
mv -f "$OUT" "$SRC"                  || die 4 "no pude mover el .m3u8"
mv -f "$OUT.gz" "${SRC}.gz"          || die 4 "no pude mover el .gz"
chown www-data:www-data "$SRC" "${SRC}.gz" 2>/dev/null || true
chmod 644 "$SRC" "${SRC}.gz" 2>/dev/null || true

log "OK: $SRC $(stat -c%s "$SRC") B · $CH1 canales · $TMP1 plantillas · $LM1 LAB-METADATA · gz $(stat -c%s "${SRC}.gz") B"
log "backup: ${SRC}.bak-presync-$T"
exit 0
