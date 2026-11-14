#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# /opt/ape-pulse/ape-cablear-auto.sh   (fuente: vps/bin/ape-cablear-auto.sh)
#
# LA RUTA IDEMPOTENTE, POLIMORFICA, ISOMORFA que pidio el operador:
#   "desarrollar una ruta idempotente, polimorfica, isomorfa para que se pueda
#    reproducir TODAS las listas que genere el IPTV Navigator"
#
# QUE HACE
#   Recorre /var/www/html/lists/ buscando listas SIN su version cableada y las
#   cablea. Cuando el IPTV Navigator sube una lista nueva, en el siguiente tick
#   del timer ya tiene su <nombre>_CABLEADA.m3u8 + .gz, y el reproductor solo
#   tiene que apuntar a la variante _CABLEADA.
#
# LAS TRES PROPIEDADES, CADA UNA CON SU PRUEBA
#
#   IDEMPOTENTE
#     Correrlo dos veces no doble-envuelve. El cableador PHP detecta las URLs que
#     ya pasan por /pulse/ y las deja tal cual. Probado: segunda pasada da
#     0 envueltos y N "ya estaban".
#     Ademas este script SALTA las listas que ya tienen _CABLEADA, asi que el
#     tick del timer no rehace trabajo.
#
#   POLIMORFICA
#     La misma lista convive en varias formas sin romper el contrato:
#        <lista>.m3u8            original, directa al proveedor
#        <lista>_CABLEADA.m3u8   todos los canales por /pulse/
#        <lista>_CABLEADA.m3u8.gz  la misma, gzip_static para servir rapido
#        /url2/<id>.m3u8         metadata por canal bajo demanda
#     El reproductor elige la forma apuntando a una URL u otra. Nada se renombra
#     ni se pisa.
#
#   ISOMORFA
#     La estructura es la MISMA: mismos #EXTINF, mismos #EXTVLCOPT, mismos
#     #KODIPROP, mismos #EXTHTTP, mismos #EXT-X-STREAM-INF con VIDEO-RANGE=PQ.
#     Solo cambia la linea de URL de cada canal. Verificado en la lista de 21.224:
#     STREAM-INF 31==31, EXTHTTP 32==32, EXTVLCOPT 4377==4377, VIDEO-RANGE 31==31.
#
# GUARDIA DE DISCO (obligatoria)
#   Cablear una lista la duplica en disco (el .m3u8 cableado + su .gz). El VPS
#   estaba al 88 % tras cablear la primera. Este script NO cablea si quedan menos
#   de MIN_FREE_MB megas libres: es preferible no tener la version cableada a
#   llenar el disco y tumbar nginx. Sale con 3 y lo registra.
#
# NO toca la lista original. NO toca nginx. NO publica en /lists/ otra cosa que
# el fichero nuevo.
#
# Uso:  bash ape-cablear-auto.sh            (cablea lo que falte)
#       bash ape-cablear-auto.sh --dry-run  (dice que haria y sale)
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

LISTS="/var/www/html/lists"
CABLER="${APE_CABLER_PHP:-/opt/ape-pulse/ape-cablear-lista.php}"
LOG="/var/log/ara/cablear-auto.log"
MIN_FREE_MB="${APE_MIN_FREE_MB:-3000}"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG" 2>/dev/null || true; }

[ -d "$LISTS" ] || { log "skip: no existe $LISTS"; exit 2; }
[ -r "$CABLER" ] || { log "skip: falta $CABLER"; exit 2; }

FREE_MB=$(df -Pm "$LISTS" 2>/dev/null | awk 'NR==2 {print $4}')
[ -n "${FREE_MB:-}" ] || { log "skip: no puedo leer el espacio libre"; exit 2; }

hechos=0; saltados=0; fallos=0

# Itera las listas de canal (no las variantes que este script crea).
for src in "$LISTS"/*.m3u8; do
  [ -e "$src" ] || continue
  base=$(basename "$src")

  # POLIMORFISMO: no se toca nada que ya sea una variante.
  case "$base" in
    *_CABLEADA.m3u8|*_SHIELDED.m3u8) continue ;;
  esac

  out="${src%.m3u8}_CABLEADA.m3u8"

  # IDEMPOTENCIA: si ya existe la cableada Y es mas nueva que la fuente, nada.
  if [ -e "$out" ] && [ "$out" -nt "$src" ]; then
    saltados=$((saltados+1))
    continue
  fi

  # La fuente puede estar vacia (8 B: solo #EXTM3U). El .gz de al lado es la
  # lista de verdad en ese caso. Sin esto cableariamos un fichero de 8 bytes.
  src_use="$src"
  if [ "$(stat -c%s "$src" 2>/dev/null || echo 0)" -lt 1024 ] && [ -r "${src}.gz" ]; then
    src_use="${src}.gz"
  fi

  # TAMANO ESPERADO: el cableado crece por la URL de /pulse/ en cada canal.
  # Estimacion conservadora: el doble del tamano descomprimido.
  if [ "$src_use" != "${src}.gz" ] && [ -r "${src}.gz" ]; then
    est_bytes=$(( $(zcat "${src}.gz" 2>/dev/null | wc -c) * 2 ))
  else
    est_bytes=$(( $(stat -c%s "$src_use" 2>/dev/null || echo 0) * 2 ))
  fi
  est_mb=$(( est_bytes / 1048576 ))

  if [ "$FREE_MB" -lt "$MIN_FREE_MB" ] || [ "$est_mb" -gt "$(( FREE_MB - MIN_FREE_MB ))" ]; then
    log "skip por disco: $base necesita ~${est_mb}MB, libres ${FREE_MB}MB, minimo ${MIN_FREE_MB}MB"
    fallos=$((fallos+1))
    continue
  fi

  if [ "$DRY" -eq 1 ]; then
    echo "CABLEARIA  $base  (~${est_mb}MB)  libre=${FREE_MB}MB"
    continue
  fi

  tmp="${out}.partial.$$"
  if php "$CABLER" "$src_use" "$tmp" >>"$LOG" 2>&1; then
    mv "$tmp" "$out"
    gzip -9 -c "$out" > "${out}.gz"
    # Recalcula el espacio libre para la siguiente lista de la misma pasada.
    FREE_MB=$(df -Pm "$LISTS" 2>/dev/null | awk 'NR==2 {print $4}')
    hechos=$((hechos+1))
    log "cableada: $base -> $(basename "$out") ($(stat -c%s "$out" 2>/dev/null) B) libre=${FREE_MB}MB"
  else
    rm -f "$tmp"
    fallos=$((fallos+1))
    log "FALLO cableando: $base (ver las lineas anteriores)"
  fi
done

log "fin: hechos=$hechos saltados=$saltados fallos=$fallos libre=${FREE_MB}MB"
[ "$DRY" -eq 1 ] && echo "DRY-RUN ok"
# 0 si todo lo que habia que hacer se hizo; 3 si algo se salto por disco.
[ "$fallos" -gt 0 ] && exit 3
exit 0
