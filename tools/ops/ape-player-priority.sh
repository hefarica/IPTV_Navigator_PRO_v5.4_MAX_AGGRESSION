#!/usr/bin/env bash
# PRIORIDAD DEL REPRODUCTOR sobre el canary.
#
# HECHO MEDIDO POR EL OPERADOR: "la lista solo puede reproducir un canal por
# lista". El proveedor permite UNA conexion por cuenta. Si el canary lanza
# ffmpeg contra el mismo proveedor mientras el operador ve, le roba la conexion
# y su siguiente zap recibe 461 -> pulse.php lo convierte en 502.
#
# Este guard hace que el canary NO ARRANQUE si el reproductor esta activo en los
# ultimos N segundos. El canary mide calidad; el operador ve. Manda el operador.
#
# Es el mismo criterio que ya usa el worker para no solapar canaries, extendido
# al trafico real del player.
set -uo pipefail

W=/opt/ape-pulse/ape-pulse-canary-worker.sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG=/var/log/nginx/playlist_access.log

[ -f "$W" ] || { echo "NO_ENCONTRADO: $W"; exit 1; }
echo "=== 1. Guard actual del worker ==="
grep -n 'ape-canary@\|single\|Un solo canary' "$W" | head -n 5 | cut -c1-150

cp -a "$W" "/root/ape-backups/ape-pulse-canary-worker.sh.$STAMP"
echo ""
echo "  backup: /root/ape-backups/ape-pulse-canary-worker.sh.$STAMP"

echo ""
echo "=== 2. Añado el guard de prioridad del reproductor ==="
python3 - "$W" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()
if 'PLAYER_WINDOW' in s:
    print("  ya parcheado"); raise SystemExit(0)

# Se inserta justo DESPUES del guard single-instance existente
ancla = re.search(r'^.*ape-canary@.*\n(?:.*\n)*?fi\s*\n', s, re.M)
if not ancla:
    print("  NO_ENCONTRADO: el guard single-instance"); raise SystemExit(1)

guard = '''
# ── PRIORIDAD DEL REPRODUCTOR ─────────────────────────────────────────────
# MEDIDO 2026-11-14: el proveedor permite UNA conexion por cuenta. El canary
# lanza ffmpeg contra el mismo proveedor; si el operador ve al mismo tiempo,
# le roba la conexion y su siguiente zap recibe 461 -> el player ve 502.
# Si hubo un zap en los ultimos PLAYER_WINDOW segundos, el canary NO arranca.
# El canary es diagnostico; el operador es produccion. Manda el operador.
PLAYER_WINDOW="${APE_CANARY_PLAYER_WINDOW:-180}"
PLEG=/var/log/nginx/playlist_access.log
if [ -r "$PLEG" ]; then
  ULT=$(tail -n 400 "$PLEG" 2>/dev/null | awk '/\\/pulse\\// && /z=1/ {print $4}' | tail -n 1)
  if [ -n "$ULT" ]; then
    # $4 es [dd/Mmm/aaaa:HH:MM:SS -- convertir a epoch
    ISO=$(printf '%s' "$ULT" | tr -d '[]' | sed 's~\\([0-9][0-9]\\/\\)\\([A-Za-z][a-z][a-z]\\)\\/\\([0-9]\\{4\\}\\):\\1~\\3-XX-\\1 \\1~')
    EPOCA=$(date -d "$(printf '%s' "$ULT" | tr -d '[]' | sed 's~:~ ~')" +%s 2>/dev/null || echo 0)
    AHORA=$(date -u +%s)
    if [ "$EPOCA" -gt 0 ] && [ $((AHORA - EPOCA)) -lt "$PLAYER_WINDOW" ]; then
      log "skip: reproductor activo hace $((AHORA - EPOCA))s (< ${PLAYER_WINDOW}s) — le dejo la conexion"
      exit 0
    fi
  fi
fi

'''
s2 = s[:ancla.end()] + guard + s[ancla.end():]
open(p, 'w', encoding='utf-8').write(s2)
print("  parcheado: prioridad del reproductor")
PY

echo ""
echo "=== 3. sintaxis ==="
bash -n "$W" && echo "  OK"

echo ""
echo "=== 4. Prueba: el guard ve el zap mas reciente? ==="
ULT=$(tail -n 400 "$LOG" 2>/dev/null | grep '/pulse/' | grep 'z=1' | tail -n 1 | awk '{print $4}')
echo "  ultimo zap en log: ${ULT:-ninguno}"
if [ -n "$ULT" ]; then
  EP=$(date -d "$(printf '%s' "$ULT" | tr -d '[]' | sed 's~:~ ~')" +%s 2>/dev/null || echo 0)
  echo "  epoch: $EP · hace $(( $(date -u +%s) - EP )) s"
fi

echo ""
echo "=== 5. Detengo canaries que esten compitiendo AHORA ==="
ACT=$(systemctl list-units 'ape-canary@*' --state=active --no-legend 2>/dev/null | awk '{print $1}')
if [ -n "$ACT" ]; then
  echo "  activos: $ACT"
  echo "  NO los mato a media escritura: dejo que RuntimeMaxSec=5min los cierre."
  echo "  (matar un ffmpeg a mitad deja out0.ts truncado y el artefacto miente)"
else
  echo "  ninguno compitiendo"
fi

echo ""
echo "=== 6. ¿Hay 502 ahora? (ultimos 30 min) ==="
awk -v t="$(date -u -d '30 minutes ago' '+%d/%b/%Y:%H')" '$4 ~ t && $9==502' "$LOG" 2>/dev/null | wc -l | sed 's/^/  502 en 30 min: /'

echo ""
echo "=== 7. Desactivo el calentador si quedo instalado (competiria) ==="
if systemctl is-enabled ape-pulse-warm.timer >/dev/null 2>&1; then
  systemctl disable --now ape-pulse-warm.timer 2>&1 | tail -n 1
  echo "  DESACTIVADO: re-pedir canales roba la unica conexion"
else
  echo "  no estaba instalado — bien, no se instala"
fi
