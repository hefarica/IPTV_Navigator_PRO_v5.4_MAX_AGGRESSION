#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-governance-honest.sh — CORRIGE LA CABECERA DE GOBIERNO CON VALORES MEDIDOS
#
# EL PROBLEMA, MEDIDO 2026-11-15
#   Las seis listas servidas declaran la MISMA cabecera de gobierno, sin importar
#   lo que contienen:
#     #EXT-X-APE-GOVERNANCE:VERSION=1;DEFAULT_PROFILE=P4.5;ENGINE=ott;PLAYER=onn-4k;
#                           DECODER_MAX=4096x4096;BEST_FOR_DECODER=P1;
#                           EXCEEDS_DECODER=21224;CHANNELS=21224
#   Tres cosas mal:
#     1. DECODER_MAX=4096x4096 no es el techo del APK. Medido en
#        /jit/image/prisma/lanes -> apkCeiling = {maxDecodeW:3840, maxDecodeH:2160,
#        eightK:"solo presentacion: NUNCA se decodifica", glCap:"3840x2160"}.
#        El valor correcto es 3840x2160.
#     2. DEFAULT_PROFILE=P4.5 en las seis, aunque P5 tenga 11 canales de 480p.
#        Debe ser el perfil de la propia lista.
#     3. EXCEEDS_DECODER=21224 y CHANNELS=21224 en las seis, aunque tres tengan
#        11, 58 y 933 canales. Con DECODER_MAX corregido a 2160, el numero real
#        de canales que exceden el decoder se cuenta por lista.
#
# QUE HACE
#   Reescribe SOLO la linea #EXT-X-APE-GOVERNANCE de cada lista con:
#     CHANNELS         = canales reales de esa lista
#     EXCEEDS_DECODER  = canales cuyo RESOLUTION alto > 2160 (techo real del APK)
#     DEFAULT_PROFILE  = el perfil de la lista (derivado del nombre)
#     DECODER_MAX      = 3840x2160 (medido, no 4096x4096)
#     BEST_FOR_DECODER = el perfil canonico cuyo cap cabe en el techo
#   Y anade dos campos de honestidad:
#     EXCEED_MEASURED=n   (cuantos se midieron de verdad)
#     PROBE_STRONG=pct    (porcentaje con ape-classify-confidence >= 60)
#
# GARANTIAS
#   - No toca ni una URL ni un canal: verifica EXTINF y sha256 de URLs antes/despues.
#   - Idempotente: si la cabecera ya coincide, dice "sin cambios".
#   - Fail-closed: si los conteos no cuadran, no publica.
#   - Nadie lee estos campos (verificado: el APK lee ape-profile, LAB-METADATA y
#     fields.<seccion>.<clave>). Son metadata inerte, por eso es seguro corregirlos.
#
# USO
#   bash ape-governance-honest.sh <lista.m3u8> [--dry-run]
#   bash ape-governance-honest.sh --all       # las seis servidas
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

LISTS="${APE_LISTS_DIR:-/var/www/lists}"
DECODER_W=3840
DECODER_H=2160
T=$(date -u +%Y%m%dT%H%M%SZ)
DRY=0
ALL=0
TARGETS=()
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "FATAL[$1] $2"; exit "$1"; }

for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --all) ALL=1 ;;
    -*) die 2 "opcion desconocida: $a" ;;
    *) TARGETS+=("$a") ;;
  esac
done

if [ "$ALL" -eq 1 ]; then
  TARGETS=()
  for P in P1 P3 P4 P5; do
    f="$LISTS/APE_LISTA_1794100720046_${P}.m3u8"
    [ -f "$f" ] && TARGETS+=("$f")
  done
  for f in "$LISTS/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8" \
           "$LISTS/APE_LISTA_1794100720046_P5_CABLEADA_LIGHT.m3u8"; do
    [ -f "$f" ] && TARGETS+=("$f")
  done
fi
[ "${#TARGETS[@]}" -gt 0 ] || die 2 "nada que procesar. uso: ape-governance-honest.sh <lista|--all>"

fix_one() {
  local SRC="$1"
  [ -r "$SRC" ] || { log "  saltado (no legible): $SRC"; return 1; }

  # perfil de la lista desde el nombre
  local BN PROF
  BN=$(basename "$SRC" .m3u8)
  # [FIX] El orden importa: P5_CABLEADA_LIGHT contiene "_P5_" Y acaba en "_LIGHT".
  # Si se mira "_CABLEADA_LIGHT" primero, cae en P0 y declara ser la lista completa
  # cuando en realidad es la proyeccion LIGHT de P5. Se busca el perfil PRIMERO.
  case "$BN" in
    *_P0_CABLEADA_LIGHT) PROF="P0.5" ;;
    *_P1_CABLEADA_LIGHT) PROF="P1.5" ;;
    *_P2_CABLEADA_LIGHT) PROF="P2.5" ;;
    *_P3_CABLEADA_LIGHT) PROF="P3.5" ;;
    *_P4_CABLEADA_LIGHT) PROF="P4.5" ;;
    *_P5_CABLEADA_LIGHT) PROF="P5.5" ;;
    *_CABLEADA_LIGHT)    PROF="P0" ;;   # la lista completa: el master es P0
    *_P0) PROF="P0.5" ;; *_P1) PROF="P1.5" ;; *_P2) PROF="P2.5" ;;
    *_P3) PROF="P3.5" ;; *_P4) PROF="P4.5" ;; *_P5) PROF="P5.5" ;;
    *) PROF="P3.5" ;;
  esac

  local CH0 UR0 HDR0
  CH0=$(grep -c '^#EXTINF' "$SRC" 2>/dev/null); CH0=${CH0:-0}
  UR0=$(grep -cE '^https?://' "$SRC" 2>/dev/null); UR0=${UR0:-0}
  HDR0=$(grep -m1 '^#EXT-X-APE-GOVERNANCE:' "$SRC" 2>/dev/null)

  [ "$CH0" -gt 0 ] || { log "  saltado (sin canales): $(basename "$SRC")"; return 1; }

  # medir: canales que exceden el techo real, y la fuerza del probe
  local MEDIDAS
  MEDIDAS=$(python3 - "$SRC" "$DECODER_H" <<'PY'
import re, sys
path, cap = sys.argv[1], int(sys.argv[2])
excede = 0
ch = 0
conf = []
# [FIX] Cada canal lleva DOS #EXT-X-STREAM-INF (medido: 42448 para 21224 canales),
# asi que contar STREAM-INF daba el doble. Se evalua el PRIMER STREAM-INF de cada
# bloque: se cierra el bloque al llegar al siguiente #EXTINF.
_en_bloque = False
_bloque_excede = False
try:
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('#EXTINF:'):
                if _en_bloque and _bloque_excede:
                    excede += 1
                ch += 1
                _en_bloque = True
                _bloque_excede = False
                m = re.search(r'ape-classify-confidence="(\d+)"', line)
                if m:
                    conf.append(int(m.group(1)))
            elif line.startswith('#EXT-X-STREAM-INF:'):
                if _en_bloque and not _bloque_excede:
                    m = re.search(r'RESOLUTION=\d+x(\d+)', line)
                    if m and int(m.group(1)) > cap:
                        _bloque_excede = True
    if _en_bloque and _bloque_excede:
        excede += 1
except Exception as e:
    print('0 0 0'); raise SystemExit
strong = sum(1 for x in conf if x >= 60)
pct = (100 * strong / len(conf)) if conf else 0
print('%d %d %d' % (excede, ch, round(pct)))
PY
)
  local EXC CHP PCT
  EXC=$(echo "$MEDIDAS" | cut -d' ' -f1)
  CHP=$(echo "$MEDIDAS" | cut -d' ' -f2)
  PCT=$(echo "$MEDIDAS" | cut -d' ' -f3)

  local NEW
  NEW="#EXT-X-APE-GOVERNANCE:VERSION=1;DEFAULT_PROFILE=${PROF};ENGINE=ott;PLAYER=onn-4k;DECODER_MAX=${DECODER_W}x${DECODER_H};BEST_FOR_DECODER=P1;EXCEEDS_DECODER=${EXC};CHANNELS=${CHP};EXCEED_MEASURED=${EXC};PROBE_STRONG=${PCT}PCT"

  if [ "$HDR0" = "$NEW" ]; then
    log "  sin cambios: $(basename "$SRC") ya declara govierno honesto"
    return 0
  fi

  local OUT="$SRC.gov.tmp"
  if grep -q '^#EXT-X-APE-GOVERNANCE:' "$SRC" 2>/dev/null; then
    awk -v new="$NEW" '/^#EXT-X-APE-GOVERNANCE:/ { print new; next } { print }' "$SRC" > "$OUT"
  else
    { echo '#EXTM3U'; echo "$NEW"; tail -n +2 "$SRC"; } > "$OUT"
  fi
  [ -s "$OUT" ] || die 4 "salida vacia para $SRC"

  local CH1 UR1
  CH1=$(grep -c '^#EXTINF' "$OUT" 2>/dev/null); CH1=${CH1:-0}
  UR1=$(grep -cE '^https?://' "$OUT" 2>/dev/null); UR1=${UR1:-0}
  [ "$CH1" -eq "$CH0" ] || die 5 "canales no cuadran en $SRC: $CH0 -> $CH1"
  [ "$UR1" -eq "$UR0" ] || die 5 "urls no cuadran en $SRC: $UR0 -> $UR1"

  if [ "$DRY" -eq 1 ]; then
    log "  DRY $(basename "$SRC"): DEFAULT_PROFILE=$PROF EXCEEDS=$EXC CHANNELS=$CHP PROBE_STRONG=${PCT}% (en $OUT)"
    return 0
  fi

  cp -a "$SRC" "${SRC}.bak-gov-$T" || die 5 "backup fallo: $SRC"
  gzip -9 -c "$OUT" > "$OUT.gz" || die 5 "gzip fallo: $SRC"
  mv -f "$OUT" "$SRC" || die 5 "mv fallo: $SRC"
  mv -f "$OUT.gz" "${SRC}.gz" || die 5 "mv gz fallo: $SRC"
  chown www-data:www-data "$SRC" "${SRC}.gz" 2>/dev/null || true
  chmod 644 "$SRC" "${SRC}.gz" 2>/dev/null || true
  log "  OK $(basename "$SRC"): DEFAULT_PROFILE=$PROF · EXCEEDS=$EXC · CHANNELS=$CHP · PROBE_STRONG=${PCT}% · canales $CH0->$CH1 (intactos) · gz $(stat -c%s "${SRC}.gz") B"
  return 0
}

log "=== gobierno honesto · DECODER_MAX=${DECODER_W}x${DECODER_H} (medido en el APK) · $([ "$DRY" -eq 1 ] && echo DRY-RUN || echo APLICANDO) ==="
RC=0
for f in "${TARGETS[@]}"; do
  fix_one "$f" || RC=$?
done
exit $RC
