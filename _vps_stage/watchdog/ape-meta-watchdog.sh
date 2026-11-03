#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE META WATCHDOG — 24/7 auto-reparable del plano de metadata
# ═══════════════════════════════════════════════════════════════════════════
# Cada 60 s (systemd timer):
#   - consulta http://127.0.0.1:8088/_ape/health
#   - si falla 3 veces seguidas: valida config (nginx -t) y RECARGA nginx;
#     si la validación falla, REINICIA el servicio.
# - Siempre sale 0 (un timer que falla genera ruido sin valor).
# - Deja rastro en journal (logger -t ape-meta-watchdog).
# ═══════════════════════════════════════════════════════════════════════════
set -u

URL="http://127.0.0.1:8088/_ape/health"
STATE="/var/lib/ape-meta-watchdog.fails"
THRESHOLD=3

mkdir -p /var/lib 2>/dev/null || true

fails=0
if [ -f "$STATE" ]; then
    fails=$(tr -dc '0-9' < "$STATE" 2>/dev/null)
    [ -z "$fails" ] && fails=0
fi

if curl -fsS --max-time 5 "$URL" >/dev/null 2>&1; then
    echo 0 > "$STATE"
    exit 0
fi

fails=$((fails + 1))
echo "$fails" > "$STATE"
logger -t ape-meta-watchdog "health FAIL (${fails}/${THRESHOLD}) -> $URL"

if [ "$fails" -ge "$THRESHOLD" ]; then
    if nginx -t >/dev/null 2>&1; then
        systemctl reload nginx && logger -t ape-meta-watchdog "nginx RELOAD ok"
    else
        logger -t ape-meta-watchdog "nginx -t FALLA -> systemctl restart nginx"
        systemctl restart nginx && logger -t ape-meta-watchdog "nginx RESTART ok"
    fi
    echo 0 > "$STATE"
fi

exit 0
