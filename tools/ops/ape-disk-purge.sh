#!/usr/bin/env bash
# Libera disco SIN tocar nada vivo. Solo backups >7 dias, logs comprimidos y
# listas APE_LISTA_* que ya no son la vigente. Muestra antes/despues.
set -uo pipefail

echo "=== ANTES ==="
df -h / | awk 'NR==2{print "  raiz: "$3"/"$2" ("$5") · libre: "$4}'
echo ""

VIGENTE=$(ls -1t /var/www/lists/pulse/APE_LISTA_*.m3u8 2>/dev/null | head -n 1)
echo "  lista vigente: $(basename "$VIGENTE") ($(( $(stat -c%s "$VIGENTE") / 1048576 )) MB)"
echo ""

echo "=== 1. backups de deploy con mas de 7 dias ==="
N1=$(find /var/backups -type f -mtime +7 2>/dev/null | wc -l)
S1=$(find /var/backups -type f -mtime +7 2>/dev/null -printf '%s\n' | awk '{s+=$1} END{printf "%d", s/1048576}')
echo "  $N1 ficheros · $S1 MB"

echo "=== 2. logs rotados comprimidos (.gz) ==="
N2=$(find /var/log -name '*.gz' -type f 2>/dev/null | wc -l)
S2=$(find /var/log -name '*.gz' -type f 2>/dev/null -printf '%s\n' | awk '{s+=$1} END{printf "%d", s/1048576}')
echo "  $N2 ficheros · $S2 MB"

echo "=== 3. listas APE_LISTA_* antiguas (no la vigente) ==="
N3=0; S3=0
while read -r f; do
  sz=$(stat -c%s "$f")
  N3=$((N3+1)); S3=$((S3 + sz/1048576))
done < <(ls -1t /var/www/lists/pulse/APE_LISTA_*.m3u8 2>/dev/null | tail -n +2)
echo "  $N3 ficheros · $S3 MB"

echo "=== 4. ficheros .new huerfanos en lists/ ==="
find /var/www/lists -maxdepth 1 -name '*.new' -type f 2>/dev/null -printf '  %s %p\n' | \
  awk '{printf "  %d MB  %s\n", $1/1048576, $2}'

echo "=== 5. /tmp viejo ==="
find /tmp -maxdepth 1 -type f -mtime +3 2>/dev/null -printf '  %s %p\n' | \
  awk '{printf "  %d MB  %s\n", $1/1048576, $2}'

echo ""
echo "TOTAL recuperable estimado: $((S1 + S2 + S3)) MB"
echo ""

read -r -p "Ejecutar la purga? (SI/no): " OK
if [ "$OK" != "SI" ]; then echo "  cancelado"; exit 0; fi

echo ""
echo "=== PURGANDO ==="
find /var/backups -type f -mtime +7 -delete 2>/dev/null && echo "  backups >7d: borrados"
find /var/log -name '*.gz' -type f -delete 2>/dev/null && echo "  logs .gz: borrados"
ls -1t /var/www/lists/pulse/APE_LISTA_*.m3u8 2>/dev/null | tail -n +2 | while read -r f; do
  rm -f "$f" && echo "  borrada: $(basename "$f")"
done
find /var/www/lists -maxdepth 1 -name '*.new' -type f -delete 2>/dev/null && echo "  .new huerfanos: borrados"
find /tmp -maxdepth 1 -type f -mtime +3 -delete 2>/dev/null && echo "  /tmp >3d: borrado"

echo ""
echo "=== DESPUES ==="
df -h / | awk 'NR==2{print "  raiz: "$3"/"$2" ("$5") · libre: "$4}'
echo ""
echo "=== La lista vigente sigue intacta? ==="
if [ -f "$VIGENTE" ]; then
  echo "  $(basename "$VIGENTE"): $(stat -c%s "$VIGENTE") B · OK"
else
  echo "  ALERTA: la lista vigente desaparecio"
fi
