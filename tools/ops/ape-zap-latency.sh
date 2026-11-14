#!/usr/bin/env bash
# Mide el TIEMPO DE ZAPPING real desde playlist_access.log (ahora con rt=).
#
# Que mide:
#   rt  = tiempo total que el VPS tarda en servir /pulse (genera el manifest
#         o lo saca de cache). Es lo que el player espera ANTES de tener la URL.
#   urt = tiempo de respuesta del proveedor en ese mismo hit.
#
# Lo que NO mide (declarado): el tiempo hasta el primer frame. Eso depende de
# la red del device y del decoder del player, no del VPS.
set -uo pipefail
L=/var/log/nginx/playlist_access.log
[ -f "$L" ] || { echo "NO_COMPUTADO: $L no existe"; exit 1; }

echo "=============================================================="
echo " TIEMPO DE ZAPPING — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=============================================================="

N=$(grep -c 'rt=' "$L" 2>/dev/null || echo 0)
echo "  hits con rt= en el log: $N"
if [ "$N" = "0" ]; then
  echo "  NO_COMPUTADO: aun no hay hits con rt= (el formato entro hace poco)."
  echo "  Zapea y vuelve a ejecutar."
  exit 0
fi

echo ""
echo "=== 1. Zaps servidos (/pulse/) — solo los que traen rt= ==="
awk '/\/pulse\// && /rt=/ {
  match($0, /rt=[0-9.]+/);   rt  = substr($0, RSTART+3, RLENGTH-3)
  match($0, /urt=[0-9.-]+/); urt_raw = substr($0, RSTART+4, RLENGTH-4)
  match($0, /" [0-9]{3} /);  st  = substr($0, RSTART+2, 3)
  printf "%s %s %.3f %.3f\n", st, rt, rt, (urt_raw=="-"?-1:urt_raw)
}' "$L" | head -n 500 > /tmp/zaps.$$

TOT=$(wc -l < /tmp/zaps.$$ | tr -d ' ')
if [ "$TOT" = "0" ]; then
  echo "  NO_COMPUTADO: cero zaps con rt= todavia."
  rm -f /tmp/zaps.$$
  exit 0
fi
echo "  zaps medidos: $TOT"
echo ""

echo "=== 2. Latencia rt (segundos) — el numero que importa ==="
awk '{print $2}' /tmp/zaps.$$ | sort -n | awk '
  {a[NR]=$1; s+=$1}
  END{
    n=NR
    if(n==0){print "    sin datos"; exit}
    printf "    min    : %.3f s\n", a[1]
    printf "    p50    : %.3f s\n", a[int(n*0.50)+ (n%2==0?0:1)]
    printf "    p90    : %.3f s\n", a[int(n*0.90)+ (n%10==0?0:1)]
    printf "    p99    : %.3f s\n", a[int(n*0.99)+ (n%100==0?0:1)]
    printf "    max    : %.3f s\n", a[n]
    printf "    media  : %.3f s\n", s/n
  }'

echo ""
echo "=== 3. Upstream urt (cuanto tarda el proveedor) ==="
awk '$3>=0 {print $3}' /tmp/zaps.$$ | sort -n | awk '
  {a[NR]=$1; s+=$1}
  END{
    n=NR
    if(n==0){print "    NO_COMPUTADO: ningun hit con urt valido"; exit}
    printf "    p50    : %.3f s\n", a[int(n*0.50)+ (n%2==0?0:1)]
    printf "    p90    : %.3f s\n", a[int(n*0.90)+ (n%10==0?0:1)]
    printf "    max    : %.3f s\n", a[n]
    printf "    media  : %.3f s\n", s/n
  }'

echo ""
echo "=== 4. Reparto por estado HTTP ==="
awk '{print $1}' /tmp/zaps.$$ | sort | uniq -c | sort -rn | sed 's/^/    /'

echo ""
echo "=== 5. Cuanto del rt es NUESTRO y cuanto es del proveedor ==="
awk '{if($3>=0){r+=$2; u+=$3; n++}} END{
  if(n==0){print "    NO_COMPUTADO"; exit}
  printf "    rt medio total     : %.3f s\n", r/n
  printf "    del cual upstream  : %.3f s (%.0f %%)\n", u/n, (u/r)*100
  printf "    overhead nuestro   : %.3f s (%.0f %%)\n", (r-u)/n, ((r-u)/r)*100
}' /tmp/zaps.$$

echo ""
echo "=== 6. Los 5 zaps mas lentos ==="
sort -k2 -rn /tmp/zaps.$$ | head -n 5 | awk '{printf "    %s  rt=%ss  urt=%ss\n", $1, $2, $3}'

echo ""
echo "=== 7. Zaps lentos (>1 s) — cuantos y de que estado ==="
awk '$2>1 {print $1}' /tmp/zaps.$$ | sort | uniq -c | sed 's/^/    /'
awk '$2>1' /tmp/zaps.$$ | wc -l | awk '{printf "    total >1 s: %s de %s\n", $1, '"$TOT"'}'

echo ""
echo "=============================================================="
echo " NOTA HONESTA: rt mide el manifest, NO el primer frame."
echo " El tiempo hasta la imagen depende de la red del device y del"
echo " decoder del player. Eso no se puede medir desde el VPS."
echo "=============================================================="
rm -f /tmp/zaps.$$
