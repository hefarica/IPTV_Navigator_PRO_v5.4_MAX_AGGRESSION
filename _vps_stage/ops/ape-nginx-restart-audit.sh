#!/bin/bash
# ape-nginx-restart-audit.sh — atribuye QUIÉN reinicia nginx
#
# Se ejecuta como ExecStartPost del servicio nginx (drop-in zz-audit-restart.conf).
# Escribe en /var/log/ape-nginx-restarts.log: hora, InvocationID, MainPID, uptime y
# las líneas de journal inmediatamente anteriores (que contienen el llamador: CRON[pid],
# systemd[1], deploy script, etc.).
#
# Diseño: NUNCA puede bloquear ni hacer fallar el arranque de nginx.
#   - todo va bajo `timeout 5` y termina en `|| true`
#   - append-only, sin locks (una línea por escritura con >>)
set -u

LOG=/var/log/ape-nginx-restarts.log
INV=$(systemctl show nginx -p InvocationID --value 2>/dev/null || echo '?')
PID=$(systemctl show nginx -p MainPID --value 2>/dev/null || echo '?')
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

{
    echo "=============================================================="
    echo "[$TS] nginx START  invocation=$INV  mainpid=$PID  host=$(hostname)"
    echo "--- contexto previo en journal (quien lo pidió) ---"
    timeout 5 journalctl --no-pager -n 18 --since '-3 min' 2>/dev/null \
        | grep -viE 'ape-nginx-restart-audit' \
        | sed 's/^/    /'
    echo "--- fin contexto ---"
} >> "$LOG" 2>&1 || true

# recorta el log si crece demasiado (2 MB -> deja 1 MB)
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 2097152 ]; then
    tail -c 1048576 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
fi

exit 0
