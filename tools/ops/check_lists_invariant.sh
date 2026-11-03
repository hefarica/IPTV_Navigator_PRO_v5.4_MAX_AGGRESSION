#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# Invariante de listas vivas — SÓLO LEE.
#
# POR QUÉ EXISTE: el 2026-11-03 `finalize_upload.php` dejó el `.m3u8` vivo en 8 bytes porque abre con
# fopen(..., 'wb') —que trunca— antes de saber si puede terminar. El `.gz` sano quedó 8,3 s anterior y
# nginx siguió sirviendo lo bueno, así que nadie lo notó.
#
# El detector propuesto medía contra `registered_lists`, pero esa tabla NO EXISTE en el VPS
# (`/var/www/html/prisma/db/ape_lists.db` responde SIN_TABLAS). Este script mide contra el propio
# fichero, que es el invariante que sí se puede sostener hoy:
#
#   1. todo `.m3u8` del directorio pesa al menos el suelo (1 KB)
#   2. empieza por `#EXTM3U`
#   3. si tiene hermano `.gz`, ese `.gz` descomprime sin error
#   4. si tiene hermano `.gz`, el `mtime` del `.m3u8` no puede ser MÁS NUEVO que el del `.gz`
#      (esa es la firma exacta del incidente: m3u8 13:59:31, gz 13:59:22)
#
# Uso:  check_lists_invariant.sh [DIRECTORIO]
# Salida: una línea por problema y un RESUMEN. Exit 1 si hay algún problema.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
set -u

DIR="${1:-/var/www/html/lists}"
SUELO=1024

if [ ! -d "$DIR" ]; then
    echo "DIR_AUSENTE $DIR"
    exit 2
fi

tot=0
rot=0
singz=0
desc=0

echo "=== invariante sobre $DIR (suelo ${SUELO} B) ==="

# Se itera con glob y no con `find | while`, para no perder el contador en un subshell.
for f in "$DIR"/*.m3u8; do
    [ -e "$f" ] || continue
    tot=$((tot + 1))
    base=$(basename "$f")
    s=$(stat -c %s "$f" 2>/dev/null || echo 0)
    m=$(stat -c %Y "$f" 2>/dev/null || echo 0)
    gz="$f.gz"

    if [ "$s" -lt "$SUELO" ]; then
        rot=$((rot + 1))
        echo "ROTO tamano=$s $base"
        continue
    fi

    if [ "$(head -c 7 "$f" 2>/dev/null)" != "#EXTM3U" ]; then
        rot=$((rot + 1))
        echo "ROTO sin_cabecera $base"
        continue
    fi

    if [ -e "$gz" ]; then
        singz=$((singz + 1))
        gm=$(stat -c %Y "$gz" 2>/dev/null || echo 0)
        if [ "$gm" -gt 0 ] && [ "$m" -gt "$gm" ]; then
            desc=$((desc + 1))
            echo "ROTO m3u8_mas_nuevo_que_gz m3u8=$m gz=$gm $base"
        fi
        if ! gzip -t "$gz" >/dev/null 2>&1; then
            rot=$((rot + 1))
            echo "ROTO gz_corrupto $base"
        fi
    fi
done

echo
echo "RESUMEN listas=$tot rotas=$rot con_gz=$singz m3u8_mas_nuevo=$desc"

if [ "$rot" -gt 0 ] || [ "$desc" -gt 0 ]; then
    echo "VEREDICTO: FALLA"
    exit 1
fi
echo "VEREDICTO: OK"
exit 0
