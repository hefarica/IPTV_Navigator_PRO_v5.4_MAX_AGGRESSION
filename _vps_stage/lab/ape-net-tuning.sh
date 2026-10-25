#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE NET TUNING — initcwnd/initrwnd calibrados por el LAB (DNA = 400)
# ═══════════════════════════════════════════════════════════════════════════
# Estrategia SÓLO ADITIVA (no borra rutas, no puede dejar el VPS sin salida):
#   crea/reemplaza una ruta default dedicada con metric 50, que gana a la de
#   DHCP (metric 100) y sobrevive a renovaciones de lease.
#
# Por qué 400: la DNA 22.6.0 fija tcp_initcwnd_target=400. initcwnd alto llena
# la ventana inicial en menos RTT (arranque más rápido del stream). El VPS
# tenía 64 (stale pre-DNA).
#
# Reversible: `ip route del default via <gw> dev <if> metric 50`.
# ═══════════════════════════════════════════════════════════════════════════
set -u

INITCWND="${INITCWND:-400}"
INITRWND="${INITRWND:-400}"
METRIC="${METRIC:-50}"

read -r GW IFACE < <(ip route show default 2>/dev/null | awk '/default/ {print $3, $5; exit}')
if [ -z "${IFACE:-}" ] || [ -z "${GW:-}" ]; then
    logger -t ape-net-tuning "sin ruta por defecto; nada que hacer"
    exit 0
fi

if ip route replace default via "$GW" dev "$IFACE" metric "$METRIC" \
        initcwnd "$INITCWND" initrwnd "$INITRWND" 2>/dev/null; then
    logger -t ape-net-tuning "default via $GW dev $IFACE metric $METRIC -> initcwnd=$INITCWND initrwnd=$INITRWND"
else
    logger -t ape-net-tuning "WARN: no se pudo fijar la ruta metric $METRIC"
fi

# notsent_lowat (DNA: 131072) — reduce la latencia de escritura en sockets
LOWAT="$(sed -n 's/.*"tcp_notsent_lowat"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' \
        /var/www/html/prisma/config/floor_lock_config.json 2>/dev/null | head -1)"
if [ -n "${LOWAT:-}" ] && [ -w /proc/sys/net/ipv4/tcp_notsent_lowat ]; then
    echo "$LOWAT" > /proc/sys/net/ipv4/tcp_notsent_lowat 2>/dev/null \
        && logger -t ape-net-tuning "tcp_notsent_lowat=$LOWAT"
fi

exit 0
