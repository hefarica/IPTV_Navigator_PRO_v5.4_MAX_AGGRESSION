#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# /opt/ape-pulse/ape-jit-latest.sh   (fuente: vps/bin/ape-jit-latest.sh)
#
# POR QUE EXISTE
#   El menu "REA · Catalogo JIT" del agente ofrece dos URLs fijas:
#       /jit/playlist-calidad.m3u8
#       /jit/playlist-resolver.m3u8
#   y las dos daban HTTP 404 con el cuerpo
#       "catalogo de calidad no generado: node jit_quality_catalog.js --version max"
#       "catalogo con resolver no generado: jit_extattr_index.py"
#   porque /jit/ hace proxy_pass al motor 3099 y los catálogos nunca se generaron.
#   El operador lo dijo asi:
#       "que sin tanto protocolo vaya y se prenda de las .m3u8 que corresponden"
#
#   Es decir: no quiere pegar URLs a mano ni correr generadores. Quiere que la
#   ruta del menu sirva LA LISTA BUENA. Este script publica esa lista.
#
# QUE HACE
#   Busca en /var/www/html/lists la variante <lista>_CABLEADA.m3u8 cuyo NUMERO de
#   lista sea el MAS ALTO y la expone como dos enlaces estables:
#       ape_jit_latest.m3u8      -> la lista cableada (todos los canales por /pulse/)
#       ape_jit_latest.m3u8.gz   -> la misma comprimida, para gzip_static
#   nginx sirve esos enlaces en las dos rutas que muestra el menu.
#
# POR QUE ORDENA POR EL NUMERO Y NO POR mtime
#   El mtime de una _CABLEADA dice CUANDO se cableó, no cual es la lista nueva.
#   Medido hoy: al cablear de prueba la historica 1793926685925, su _CABLEADA
#   pasó a ser la mas reciente por mtime — y NO es la lista del operador.
#   El numero del nombre (APE_LISTA_1794100720046) si ordena por generacion.
#   Con mtime, el menu habria servido la lista equivocada.
#
# IDEMPOTENTE
#   ln -sfn reemplaza el enlace en cada pasada. Correrlo N veces deja lo mismo.
#
# Uso:  bash ape-jit-latest.sh [--todas]
#       --todas  muestra el ranking completo sin publicar nada
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

LISTS="${APE_LISTS_DIR:-/var/www/html/lists}"
DRY=0
[ "${1:-}" = "--todas" ] && DRY=1

[ -d "$LISTS" ] || { echo "no existe $LISTS"; exit 2; }

# Ranking por NUMERO de lista, descendente. El numero va primero para que sort -rn
# ordene por el, y la ruta queda como resto de la linea.
ranking=$(ls "$LISTS"/APE_LISTA_*_CABLEADA.m3u8 2>/dev/null \
          | sed -E 's#(.*/APE_LISTA_([0-9]+)_CABLEADA\.m3u8)#\2 \1#' \
          | sort -rn)

if [ -z "$ranking" ]; then
  echo "no hay ninguna *APE_LISTA_*_CABLEADA.m3u8 en $LISTS"
  exit 2
fi

if [ "$DRY" -eq 1 ]; then
  echo "ranking por numero de lista (el primero gana):"
  echo "$ranking" | while read -r num path; do
    printf '  %s  %s  %s B\n' "$num" "$(basename "$path")" "$(stat -c%s "$path" 2>/dev/null || echo '?')"
  done
  exit 0
fi

best_num=$(echo "$ranking" | head -1 | cut -d' ' -f1)
best=$(echo "$ranking" | head -1 | cut -d' ' -f2-)

# Publicacion atomica de los dos enlaces estables.
ln -sfn "$best" "$LISTS/ape_jit_latest.m3u8"
if [ -r "${best}.gz" ]; then
  ln -sfn "${best}.gz" "$LISTS/ape_jit_latest.m3u8.gz"
else
  rm -f "$LISTS/ape_jit_latest.m3u8.gz"
fi

canales=$(grep -c '^#EXTINF' "$best" 2>/dev/null || echo '?')
pulse=$(grep -c '/pulse/' "$best" 2>/dev/null || echo '?')
bytes=$(stat -c%s "$best" 2>/dev/null || echo '?')

echo "publicado: $(basename "$best") (lista $best_num)"
echo "  canales : $canales"
echo "  /pulse/ : $pulse"
echo "  bytes   : $bytes"
echo "  enlaces : ape_jit_latest.m3u8 -> $(readlink "$LISTS/ape_jit_latest.m3u8" 2>/dev/null | xargs -r basename)"

# Si es la lista del operador (la de numero mas alto) pero NO tiene /pulse/, avisar
# en voz alta: significa que se cableó con un motor que no envolvia y el menu
# serviria una lista que va directa al proveedor.
if [ "$pulse" != "?" ] && [ "$pulse" -eq 0 ] 2>/dev/null; then
  echo "AVISO: la lista publicada NO tiene URLs /pulse/ ($pulse de $canales)."
  echo "       El reproductor iria directo al proveedor y el menu mentiria."
  exit 3
fi

exit 0
