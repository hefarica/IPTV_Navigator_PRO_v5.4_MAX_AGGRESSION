#!/usr/bin/env bash
# Arregla el apilamiento de canaries: lock ATOMICO, no `systemctl | grep`.
#
# CAUSA MEDIDA 2026-11-14 01:21-01:26
#   8 canaries arrancaron uno por minuto:
#     01:21:44 01:22:05 01:23:44 01:24:49 01:25:30 01:26:11 01:26:15 01:26:23
#   Cada uno dura hasta 5 min (RuntimeMaxSec=300), asi que se acumularon.
#   8 ffmpeg contra el mismo proveedor. El proveedor permite UNA conexion por
#   cuenta -> el player recibia 461 -> pulse.php lo publicaba como 502.
#
#   El guard existente era:
#     if systemctl list-units --state=active | grep -q 'ape-canary@'; then exit 0
#   Eso NO es atomico: dos workers pueden evaluar el grep ANTES de que el otro
#   haya arrancado su unidad. La ventana la agravo el .path que añadi para
#   despertar con el zap (dispara en cada cambio de la cola).
#
# ARREGLO
#   flock -n sobre un lockfile. El segundo worker no espera: sale en el acto.
#   El lock se libera solo al morir el proceso (fd cerrado por el kernel).
set -uo pipefail

W=/opt/ape-pulse/ape-pulse-canary-worker.sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
[ -f "$W" ] || { echo "NO_ENCONTRADO: $W"; exit 1; }
cp -a "$W" "/root/ape-backups/ape-pulse-canary-worker.sh.$STAMP.lock"
echo "  backup: /root/ape-backups/ape-pulse-canary-worker.sh.$STAMP.lock"

python3 - "$W" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()
if 'flock -n' in s:
    print("  ya tiene flock"); raise SystemExit(0)

# Inserta el flock justo despues del shebang y del bloque de variables inicial
m = re.search(r'^(#!.*\n)', s)
if not m:
    print("  NO shebang"); raise SystemExit(1)

lock = '''
# ── LOCK ATOMICO (2026-11-14) ─────────────────────────────────────────────
# Antes: `systemctl list-units --state=active | grep -q ape-canary@` -> NO es
# atomico. Ocho workers evaluaron el grep antes de que el primero arrancase su
# unidad y se apilaron 8 ffmpeg contra un proveedor que da UNA conexion.
# Ahora: flock -n. El segundo sale en el acto, sin esperar y sin acumular.
exec 9>/run/ape-canary.lock
if ! flock -n 9; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) worker: skip (ya hay uno con el lock)" >> /var/log/ape-canary.log 2>/dev/null || true
  exit 0
fi

'''
s2 = s[:m.end()] + lock + s[m.end():]
open(p, 'w', encoding='utf-8').write(s2)
print("  flock insertado")
PY

echo ""
echo "=== sintaxis ==="
bash -n "$W" && echo "  OK"

echo ""
echo "=== reinicio el timer y el path ==="
systemctl restart ape-pulse-canary.timer 2>/dev/null && echo "  timer reiniciado"
systemctl restart ape-pulse-canary.path 2>/dev/null && echo "  path reiniciado"

echo ""
echo "=== PRUEBA: disparo concurrente (debe entrar UNO) ==="
for i in 1 2 3 4 5; do systemctl start ape-pulse-canary.service --no-block 2>/dev/null & done
wait 2>/dev/null
sleep 6
echo -n "  canaries activos tras 5 disparos: "
systemctl list-units 'ape-canary@*' --state=active --no-legend 2>/dev/null | wc -l
echo -n "  ffmpeg: "; pgrep -c ffmpeg 2>/dev/null || echo 0

echo ""
echo "=== Estado final ==="
echo -n "  timer : "; systemctl is-active ape-pulse-canary.timer
echo -n "  path  : "; systemctl is-active ape-pulse-canary.path
echo -n "  ffmpeg: "; pgrep -c ffmpeg 2>/dev/null || echo 0
