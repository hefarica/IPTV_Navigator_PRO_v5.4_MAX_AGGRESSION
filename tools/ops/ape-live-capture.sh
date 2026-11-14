#!/usr/bin/env bash
# =====================================================================
# ape-live-capture.sh — captura EN VIVO de todos los modulos del sistema
#
# El operador pidio: "haz una captura de toda la data que cada modulo este
# generando en vivo, como funcionan los archivos .json, los php, los lua".
#
# Este script NO inventa nada: lee lo que existe y reporta lo que NO puede
# leer como NO_COMPUTADO con su motivo. Un modulo que no produce no es cero.
#
# Uso:  ape-live-capture.sh            -> captura unica a stdout
#       ape-live-capture.sh --watch 5  -> cada 5 s (para zappear y mirar)
# =====================================================================
set -uo pipefail

INTERVALO=0
[ "${1:-}" = "--watch" ] && INTERVALO="${2:-5}"

ahora() { date -u +%Y-%m-%dT%H:%M:%SZ; }
nj() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)" 2>/dev/null || echo "NO_COMPUTADO"; }
hay() { [ -e "$1" ] && [ -s "$1" ]; }

capturar() {
  echo "=============================================================="
  echo " APE LIVE CAPTURE  $(ahora)"
  echo "=============================================================="

  # ---------- 1. PULSE (el punto de entrada de cada zap) ----------
  echo ""
  echo "## 1. PULSE — cada zap entra por aqui"
  local L=/var/log/nginx/playlist_access.log
  if hay "$L"; then
    echo "   log: $L ($(wc -l < "$L" | tr -d ' ') lineas)"
    echo "   ultimos 60 s:"
    if command -v journalctl >/dev/null; then
      awk -v t="$(date -u -d '60 seconds ago' '+%d/%b/%Y:%H:%M:%S')" '$0 >= t' "$L" 2>/dev/null \
        | tail -200 | awk '{print "     " $7}' | sort | uniq -c | sort -rn | head -8
    fi
    echo "   estados en los ultimos 200 hits:"
    tail -200 "$L" | awk '{print $9}' | sort | uniq -c | sort -rn | head -6 | sed 's/^/     /'
    echo "   NOTA: este log NO tiene \$request_time -> latencia = NO_COMPUTADO"
  else
    echo "   NO_COMPUTADO: $L no existe"
  fi

  # ---------- 2. CANARY ----------
  echo ""
  echo "## 2. CANARY — prueba visual del canal"
  echo -n "   canary.enabled: "; [ -f /etc/ara/pulse/canary.enabled ] && echo "PRESENTE" || echo "AUSENTE (no se encola)"
  echo -n "   cola: "; if [ -d /var/lib/ara/canary/queue ]; then
     echo "$(ls -1 /var/lib/ara/canary/queue 2>/dev/null | wc -l | tr -d ' ') tickets"
  else echo "NO_COMPUTADO: sin directorio de cola"; fi
  echo -n "   servicio: "; systemctl is-active ape-canary@.service 2>/dev/null | head -1 || echo "?"
  local ult
  ult=$(ls -1t /var/lib/ara/canary/out 2>/dev/null | head -1)
  if [ -n "$ult" ]; then
     echo "   ultimo artefacto: $ult"
     local d=/var/lib/ara/canary/out/$ult
     [ -f "$d/out0.ts" ] && echo "     out0.ts: $(stat -c%s "$d/out0.ts" | numfmt --to=iec 2>/dev/null || stat -c%s "$d/out0.ts") B"
     [ -f "$d/meta.json" ] && { echo -n "     meta.json: "; head -c 220 "$d/meta.json"; echo; }
  else echo "   NO_COMPUTADO: sin artefactos de canary"; fi
  echo "   timer: $(systemctl is-active ape-pulse-canary.timer 2>/dev/null)"
  echo "   ultimo resultado: $(systemctl show 'ape-canary@*' -p Result --value 2>/dev/null | head -1 || echo '?')"

  # ---------- 3. JIT ----------
  echo ""
  echo "## 3. JIT — allowlist y reconciliacion"
  echo -n "   servicio: "; systemctl is-active ape-jit.service 2>/dev/null
  echo -n "   reconcile: "; systemctl show ape-jit-reconcile.service -p Result --value 2>/dev/null
  if hay /opt/ape-jit/current/meta.json; then
    echo -n "   meta.json: "; cat /opt/ape-jit/current/meta.json | head -c 240; echo
  else echo "   NO_COMPUTADO: sin meta.json"; fi
  if hay /opt/ape-jit/current/channels.json; then
    echo "   channels.json: $(nj "len(d)" < /opt/ape-jit/current/channels.json) canales"
  else echo "   NO_COMPUTADO: sin channels.json"; fi
  echo -n "   /health: "; curl -s -m 4 -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/health 2>/dev/null || echo "sin respuesta"

  # ---------- 4. APK / ARA-X-SYNC ----------
  echo ""
  echo "## 4. APK + ARA-X-SYNC — telemetria del device"
  local S=/var/lib/ara/sync
  if [ -d "$S" ]; then
    echo "   ultimos sync recibidos: $(ls -1t "$S" 2>/dev/null | head -1)"
    local f; f=$(ls -1t "$S" 2>/dev/null | head -1)
    [ -n "$f" ] && { echo -n "     "; head -c 300 "$S/$f"; echo; }
  else echo "   NO_COMPUTADO: $S no existe (el APK no ha sincronizado)"; fi
  echo -n "   eventos ARA-ZAP en logcat del VPS: "; echo "NO_COMPUTADO: el logcat vive en el device, no aqui"
  echo -n "   apk publicada: "; curl -s -m 4 -o /dev/null -w '%{http_code}' 'https://iptv-ape.duckdns.org/ara/version.json' 2>/dev/null || echo "?"

  # ---------- 5. PHP + JSON ----------
  echo ""
  echo "## 5. PHP + JSON — endpoints que producen estado"
  for u in /prisma/api/pulse.php /api/netshield-sentinel.php /prisma/api/channel-hdcp-bulk.php; do
    local c; c=$(curl -s -m 6 -o /dev/null -w '%{http_code}' "http://127.0.0.1$u" 2>/dev/null)
    echo "   $u -> $c"
  done
  echo "   logs PHP con errores (ultimas 2 h):"
  local n=0 c
  for lg in /var/log/php*.log /var/log/nginx/error.log; do
    [ -f "$lg" ] || continue
    c=$(grep -c "$(date -u +%d-%b-%Y)" "$lg" 2>/dev/null || true)
    c=${c:-0}; c=${c%%$'\n'*}
    n=$((n + c))
  done
  echo "     lineas de hoy en logs PHP/nginx-error: $n"

  # ---------- 6. LUA ----------
  echo ""
  echo "## 6. LUA — fases de nginx"
  echo -n "   modulos cargados: "; nginx -V 2>&1 | grep -o 'lua[a-z_]*' | sort -u | tr '\n' ' '; echo
  echo -n "   shared_dicts: "; grep -rhoE 'lua_shared_dict [a-z_]+' /etc/nginx 2>/dev/null | awk '{print $2}' | sort -u | tr '\n' ' '; echo
  echo -n "   archivos lua desplegados: "; find /etc/nginx -name '*.lua' 2>/dev/null | wc -l | tr -d ' '
  echo -n "   errores lua hoy: "; grep -c 'lua' /var/log/nginx/error.log 2>/dev/null || echo 0

  # ---------- 7. VPS base ----------
  echo ""
  echo "## 7. VPS — salud base"
  echo "   load: $(cut -d' ' -f1-3 /proc/loadavg)"
  echo "   cpu:  $(nproc) vCPU"
  echo "   mem:  $(free -m | awk '/^Mem:/{printf "%d/%d MB (%.0f%%)", $3,$2,($3/$2)*100}')"
  echo "   disco: $(df -h / | awk 'NR==2{printf "%s/%s (%s)", $3,$2,$5}')"
  echo "   nginx: $(systemctl is-active nginx) · restarts: $(systemctl show nginx -p NRestarts --value 2>/dev/null)"
  echo "   ffmpeg activos: $(pgrep -c ffmpeg 2>/dev/null || echo 0)"
  echo -n "   canary activos: "; pgrep -fc 'ape-canary@' 2>/dev/null || echo 0

  # ---------- 8. ERRORES 4xx/5xx ----------
  echo ""
  echo "## 8. ERRORES 4xx/5xx — ventana de 1 h"
  for L in /var/log/nginx/access.log /var/log/nginx/playlist_access.log; do
    [ -f "$L" ] || continue
    echo "   $(basename $L):"
    awk -v t="$(date -u -d '1 hour ago' '+%d/%b/%Y:%H')" '$4 ~ t' "$L" 2>/dev/null \
      | awk '{print $9}' | grep -E '^(4|5)' | sort | uniq -c | sort -rn | head -6 | sed 's/^/     /'
  done

  echo ""
  echo "=============================================================="
  echo " FIN CAPTURA $(ahora)"
  echo "=============================================================="
}

if [ "$INTERVALO" -gt 0 ]; then
  trap 'echo ""; echo "  captura detenida"; exit 0' INT
  while true; do clear 2>/dev/null || true; capturar; sleep "$INTERVALO"; done
else
  capturar
fi
