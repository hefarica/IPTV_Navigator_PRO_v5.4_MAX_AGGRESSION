#!/bin/bash
# Medicion SOSTENIDA del JIT con receta aplicada.
# Correr 30 minutos y comprobar que el ritmo se mantiene y la cola no crece.
# El informe exige margen >=1,2x tiempo real bajo carga representativa.
B=https://iptv-ape.duckdns.org
DUR=${1:-1800}          # segundos (30 min)
INTERVAL=${2:-60}       # muestreo

echo "=== MEDICION SOSTENIDA: ${DUR}s, muestreo cada ${INTERVAL}s ==="
echo "    host: $(nproc) vCPU, $(free -m | awk '/Mem:/{print $2}') MB"
date -u +"    inicio: %Y-%m-%dT%H:%M:%SZ"

# aplicar la receta recomendada y dejar un consumidor pidiendo el master
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"target":"FHD_1080","recipe":"balanced","fps":"25"}' "$B/jit/image/config" -o /dev/null
echo "    receta: FHD_1080 + balanced + 25fps"
echo ""

T0=$(date +%s)
N=0
FAIL=0
SEG_FIRST=""
SEG_LAST=""
CPU_SUM=0
MEM_MAX=0

while [ $(( $(date +%s) - T0 )) -lt "$DUR" ]; do
  N=$((N+1))
  T=$(( $(date +%s) - T0 ))

  # un consumidor: pedir el master (arranca/reanuda el job)
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 40 "$B/jit/live/2/master.m3u8")

  # estado del motor
  ST=$(curl -s --max-time 15 "$B/jit/image/state")
  SEGS=$(echo "$ST" | python3 -c 'import json,sys;d=json.load(sys.stdin);print((d.get("files") or {}).get("segments") or 0)' 2>/dev/null)
  MODE=$(echo "$ST" | python3 -c 'import json,sys;d=json.load(sys.stdin);j=d.get("job") or {};print(j.get("mode") or "-")' 2>/dev/null)
  PID=$(echo "$ST" | python3 -c 'import json,sys;d=json.load(sys.stdin);j=d.get("job") or {};print(j.get("pid") or 0)' 2>/dev/null)
  BW=$(echo "$ST" | python3 -c 'import json,sys;d=json.load(sys.stdin);b=d.get("measured_bandwidth") or {};print(round((b.get("total") or 0)/1e6,2))' 2>/dev/null)

  # carga del host y del ffmpeg
  CPU=$(top -bn1 | awk '/Cpu\(s\)/{print int(100-$8)}')
  LOAD=$(awk '{print $1}' /proc/loadavg)
  MEM=$(free -m | awk '/Mem:/{print $3}')
  FFPID=$(pgrep -f "ffmpeg.*ape-jit/2" | head -1)
  FFCPU="0"
  if [ -n "$FFPID" ]; then
    FFCPU=$(ps -p "$FFPID" -o %cpu= 2>/dev/null | tr -d ' ')
  fi

  [ "$CODE" = "200" ] || FAIL=$((FAIL+1))
  [ -z "$SEG_FIRST" ] && [ "$SEGS" != "0" ] && SEG_FIRST=$SEGS
  SEG_LAST=$SEGS
  CPU_SUM=$((CPU_SUM+CPU))
  [ "$MEM" -gt "$MEM_MAX" ] && MEM_MAX=$MEM

  printf "  t=%4ss  http=%s  modo=%-18s segs=%-4s bw=%sM  cpu=%3s%%  ffmpeg=%s%%  load=%s  mem=%sM  pid=%s\n" \
    "$T" "$CODE" "$MODE" "$SEGS" "$BW" "$CPU" "$FFCPU" "$LOAD" "$MEM" "$PID"

  sleep "$INTERVAL"
done

TEND=$(date +%s)
ELAPSED=$((TEND-T0))
echo ""
echo "=== RESULTADO ==="
echo "  muestras            : $N en ${ELAPSED}s"
echo "  fallos HTTP         : $FAIL"
echo "  segmentos iniciales : $SEG_FIRST"
echo "  segmentos finales   : $SEG_LAST"
echo "  CPU media           : $((CPU_SUM/N))%"
echo "  MEM maxima          : ${MEM_MAX} MB"
if [ -n "$SEG_FIRST" ] && [ -n "$SEG_LAST" ]; then
  echo "  cola: $SEG_FIRST -> $SEG_LAST (ventana fija de 40 segmentos = estable si no crece)"
fi
echo "  fin: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
