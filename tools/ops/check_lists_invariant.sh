#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# Invariante de listas vivas — SÓLO LEE.
#
# DISEÑO DEL PRODUCTOR (leído, no inferido): `/var/www/html/finalize_upload.php` publica el `.m3u8`
# como PLACEHOLDER de 8 bytes a propósito:
#
#     // REGLA 84: SIEMPRE crear el placeholder DESPUÉS de verificar que el .gz se creó exitosamente
#     // Placeholder Trick (8 bytes) to maintain compliance while saving space
#     file_put_contents($outputPath, "#EXTM3U\n");
#
# El contenido real viaja por el `.gz`, y `gzip_static` lo sirve a quien anuncia `Accept-Encoding: gzip`.
# El placeholder ahorra ~576 MB por lista. NO es un fichero truncado.
#
# Por eso el criterio NO es una severidad única: es una MÁQUINA DE ESTADOS.
# Un placeholder es correcto SÓLO mientras el `.gz` exista, sea válido y NO sea más antiguo.
#
#   m3u8 > 1024                                 → NORMAL
#      ├─ sin cabecera #EXTM3U                  → ROTO
#      ├─ .gz presente y más nuevo que m3u8     → AVISO  (gz obsoleto enmascara al m3u8)
#      └─ resto                                 → OK
#
#   m3u8 == 8 y contenido "#EXTM3U" + salto     → PLACEHOLDER
#      ├─ .gz ausente                           → ROTO   (lista vacía servida)
#      ├─ .gz < 1024                            → ROTO
#      ├─ .gz sin magic 1f 8b                   → ROTO
#      ├─ .gz más antiguo que m3u8              → ROTO   (gzip_static puede rechazarlo e ignorarlo)
#      ├─ gzip -t falla                         → ROTO
#      └─ todo lo anterior bien                 → OK_PLACEHOLDER   ← ÉXITO, no aviso
#
# `OK_PLACEHOLDER` cuenta como éxito en el resumen. Sólo los `ROTO` hacen fallar el invariante.
# El `AVISO` informa pero no falla: es un `.gz` atrasado, no una lista rota.
#
# Uso:  check_lists_invariant.sh [DIRECTORIO]
# Exit: 0 si no hay ROTO · 1 si hay algún ROTO · 2 si el directorio no existe
# ─────────────────────────────────────────────────────────────────────────────────────────────────
set -u

DIR="${1:-/var/www/html/lists}"
SUELO=1024
CABECERA='#EXTM3U'

if [ ! -d "$DIR" ]; then
    echo "DIR_AUSENTE $DIR"
    exit 2
fi

tot=0
normal=0
placeholder_ok=0
aviso=0
roto=0

echo "=== invariante sobre $DIR (suelo ${SUELO} B) ==="

for f in "$DIR"/*.m3u8; do
    [ -e "$f" ] || continue
    tot=$((tot + 1))
    base=$(basename "$f")
    s=$(stat -c %s "$f" 2>/dev/null || echo 0)
    m=$(stat -c %Y "$f" 2>/dev/null || echo 0)
    gz="$f.gz"

    # ── rama PLACEHOLDER: 8 bytes con la cabecera del Placeholder Trick ──
    if [ "$s" -eq 8 ]; then
        if [ "$(head -c 7 "$f" 2>/dev/null)" != "$CABECERA" ]; then
            roto=$((roto + 1))
            echo "ROTO placeholder_corrupto $base"
            continue
        fi

        if [ ! -e "$gz" ]; then
            roto=$((roto + 1))
            echo "ROTO placeholder_sin_gz $base"
            continue
        fi

        gs=$(stat -c %s "$gz" 2>/dev/null || echo 0)
        gm=$(stat -c %Y "$gz" 2>/dev/null || echo 0)

        if [ "$gs" -lt "$SUELO" ]; then
            roto=$((roto + 1))
            echo "ROTO gz_bajo_suelo size=$gs $base"
            continue
        fi

        magic=$(od -An -tx1 -N2 "$gz" 2>/dev/null | tr -d ' \n')
        if [ "$magic" != "1f8b" ]; then
            roto=$((roto + 1))
            echo "ROTO gz_sin_magic magic=$magic $base"
            continue
        fi

        # El orden importa: si el .gz es más antiguo, gzip_static puede ignorarlo y servir el
        # placeholder — una lista VACÍA. Éste es el escenario que produce cero canales con todo
        # "correcto" en disco.
        if [ "$gm" -lt "$m" ]; then
            roto=$((roto + 1))
            echo "ROTO gz_mas_antiguo_que_m3u8 gz=$gm m3u8=$m $base"
            continue
        fi

        if ! gzip -t "$gz" >/dev/null 2>&1; then
            roto=$((roto + 1))
            echo "ROTO gz_corrupto $base"
            continue
        fi

        placeholder_ok=$((placeholder_ok + 1))
        echo "OK_PLACEHOLDER $base (m3u8=8 B, gz=$gs B)"
        continue
    fi

    # ── rama NORMAL ──
    if [ "$s" -lt "$SUELO" ]; then
        roto=$((roto + 1))
        echo "ROTO tamano=$s $base"
        continue
    fi

    if [ "$(head -c 7 "$f" 2>/dev/null)" != "$CABECERA" ]; then
        roto=$((roto + 1))
        echo "ROTO sin_cabecera $base"
        continue
    fi

    if [ -e "$gz" ]; then
        gm=$(stat -c %Y "$gz" 2>/dev/null || echo 0)
        if [ "$gm" -gt 0 ] && [ "$m" -gt "$gm" ]; then
            aviso=$((aviso + 1))
            echo "AVISO m3u8_mas_nuevo_que_gz (el .gz quedaria inerte) $base"
        fi
        if ! gzip -t "$gz" >/dev/null 2>&1; then
            roto=$((roto + 1))
            echo "ROTO gz_corrupto $base"
            continue
        fi
    fi
    normal=$((normal + 1))
done

echo
echo "RESUMEN listas=$tot normal=$normal placeholder_ok=$placeholder_ok aviso=$aviso roto=$roto"

if [ "$roto" -gt 0 ]; then
    echo "VEREDICTO: FALLA ($roto roto)"
    exit 1
fi
if [ "$aviso" -gt 0 ]; then
    echo "VEREDICTO: OK con $aviso aviso(s)"
    exit 0
fi
echo "VEREDICTO: OK"
exit 0
