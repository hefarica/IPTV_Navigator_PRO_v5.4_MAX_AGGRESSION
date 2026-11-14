#!/usr/bin/env bash
# Hace que el worker ESPERE al canary antes de soltar el lock.
#
# CAUSA MEDIDA 2026-11-14
#   Linea 130:  "$CTL" start "$id" ... --seconds N
#   ape-canaryctl arranca ape-canary@<id>.service, que es Type=simple.
#   `systemctl start` de un Type=simple RETORNA EN CUANTO ARRANCA, no cuando
#   termina. El worker sale, su flock se libera, y el siguiente worker (9
#   tickets en cola) lanza otro canary. Resultado: 10 canaries y 10 ffmpeg
#   contra un proveedor que da UNA conexion -> 461 -> 502 para el operador.
#
# ARREGLO
#   Despues del start, esperar a que el unit deje de estar activo. El flock se
#   mantiene durante toda la espera, asi que no entra ninguno mas.
#
#   Ademas corrige el parseo de fecha del guard de prioridad del reproductor:
#   `date -d "14/Nov/2026 01:28:37"` devuelve 0 y el guard nunca actuaba.
#   Ahora se mapea el mes a numero.
set -uo pipefail

W=/opt/ape-pulse/ape-pulse-canary-worker.sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
[ -f "$W" ] || { echo "NO_ENCONTRADO: $W"; exit 1; }
cp -a "$W" "/root/ape-backups/ape-pulse-canary-worker.sh.$STAMP.wait"
echo "  backup: /root/ape-backups/ape-pulse-canary-worker.sh.$STAMP.wait"

python3 - "$W" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()

# ---- 1) Esperar al canary antes de soltar el lock ----
if 'ESPERA AL CANARY' not in s:
    m = re.search(r'^(\s*)if "\\\$CTL" start "\\\$id" .*\n', s, re.M)
    if not m:
        print("  NO_ENCONTRADO: la linea del CTL start"); raise SystemExit(1)
    espera = m.group(0) + '''\n\
# ── ESPERA AL CANARY (2026-11-14) ──────────────────────────────────────────
# Type=simple: `systemctl start` retorna al arrancar, NO al terminar. Sin esta
# espera el worker sale, suelta el flock y el siguiente ticket lanza otro
# canary. Con 9 tickets se apilaron 10 ffmpeg contra UNA conexion del proveedor.
UNIDAD="ape-canary@${id}.service"
T0=$(date -u +%s)
LIMITE=$(( SECONDS_SAMPLE + 240 ))
while systemctl is-active --quiet "$UNIDAD" 2>/dev/null; do
  [ $(( $(date -u +%s) - T0 )) -gt "$LIMITE" ] && {
    log "espera agotada tras ${LIMITE}s en $UNIDAD — sigo"
    break
  }
  sleep 3
done
log "canary $id terminado tras $(( $(date -u +%s) - T0 ))s"
'''
    s = s[:m.start()] + espera + s[m.end():]
    print("  anadida la espera al canary")
else:
    print("  ya tiene la espera")

# ---- 2) Corregir el parseo de fecha del guard de prioridad ----
viejo = re.search(r'^.*EPOCA=\$\(date -d.*\n', s, re.M)
if viejo and 'MESNUM' not in s:
    nuevo = '''\
    MES=$(printf '%s' "$ULT" | cut -d/ -f2)
    case "$MES" in
      Jan) MESNUM=01;; Feb) MESNUM=02;; Mar) MESNUM=03;; Apr) MESNUM=04;;
      May) MESNUM=05;; Jun) MESNUM=06;; Jul) MESNUM=07;; Aug) MESNUM=08;;
      Sep) MESNUM=09;; Oct) MESNUM=10;; Nov) MESNUM=11;; Dec) MESNUM=12;;
      *)   MESNUM=00;;
    esac
    FDIA=$(printf '%s' "$ULT" | cut -d/ -f1)
    FANO=$(printf '%s' "$ULT" | cut -d/ -f3 | cut -d: -f1)
    FHMS=$(printf '%s' "$ULT" | cut -d: -f2-4)
    EPOCA=$(date -u -d "$FANO-$MESNUM-$FDIA $FHMS" +%s 2>/dev/null || echo 0)
'''
    s = s[:viejo.start()] + nuevo + s[viejo.end():]
    print("  corregido el parseo de fecha")
else:
    print("  fecha: ya corregida o no encontrada")

open(p, 'w', encoding='utf-8').write(s)
PY

echo ""
echo "=== sintaxis ==="
bash -n "$W" && echo "  OK" || { echo "  ERROR"; cp -a "/root/ape-backups/ape-pulse-canary-worker.sh.$STAMP.wait" "$W"; exit 1; }

echo ""
echo "=== limpieza: cola a 0 y sin canaries ==="
systemctl list-units 'ape-canary@*' --state=active --no-legend 2>/dev/null | awk '{print $1}' | while read -r u; do systemctl stop "$u" 2>/dev/null; done
sleep 2
echo -n "  ffmpeg: "; pgrep -c ffmpeg 2>/dev/null || echo 0

echo ""
echo "=== reactivo timer y path ==="
systemctl start ape-pulse-canary.timer 2>/dev/null && echo "  timer OK"
systemctl start ape-pulse-canary.path 2>/dev/null && echo "  path OK"

echo ""
echo "=== PRUEBA: 3 disparos seguidos, debe entrar UNO y esperar ==="
for i in 1 2 3; do systemctl start ape-pulse-canary.service --no-block 2>/dev/null; sleep 1; done
sleep 20
echo -n "  canaries activos: "; systemctl list-units 'ape-canary@*' --state=active --no-legend 2>/dev/null | wc -l
echo -n "  ffmpeg: "; pgrep -c ffmpeg 2>/dev/null || echo 0
echo "  ultimas del log:"
tail -n 4 /var/log/ape-canary.log 2>/dev/null | sed 's/^/    /'
