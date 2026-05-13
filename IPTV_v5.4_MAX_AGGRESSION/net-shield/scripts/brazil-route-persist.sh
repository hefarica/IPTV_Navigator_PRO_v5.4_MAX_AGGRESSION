#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# brazil-route-persist.sh — Phantom interface + table 200 setup
# Aplicado 2026-05-11 Fase F L1 per usuario doctrine
#
# Crea infraestructura para failover NGINX-level per-request:
#   - dummy interface vps-br con IP 10.99.99.2 (phantom)
#   - tabla 200 con default route via wg-surfshark-br (Brasil)
#   - ip rule: tráfico desde 10.99.99.2 -> tabla 200
#   - MASQUERADE: substituye 10.99.99.2 -> IP local válida antes de wg-surfshark-br
#
# Idempotente: ejecutable múltiples veces sin efectos colaterales.
# Triggers: systemd service oneshot at boot + manual.
# ═══════════════════════════════════════════════════════════════════════════
set -e
LOG=/var/log/iptv-tcp-tuning.log
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }

# 1. Dummy interface
if ! ip link show vps-br &>/dev/null; then
    ip link add vps-br type dummy
    log "brazil-route: created dummy interface vps-br"
else
    log "brazil-route: vps-br already exists"
fi

# 2. IP en dummy
if ! ip addr show vps-br | grep -q "10.99.99.2"; then
    ip addr add 10.99.99.2/32 dev vps-br
    log "brazil-route: assigned 10.99.99.2/32 to vps-br"
fi

# 3. Activar dummy
ip link set vps-br up
log "brazil-route: vps-br up"

# 4. Tabla 200 — default por wg-surfshark-br
if ! ip route show table 200 | grep -q "default dev wg-surfshark-br"; then
    ip route flush table 200 2>/dev/null || true
    ip route add default dev wg-surfshark-br table 200
    ip route add 10.200.0.0/24 dev wg0 table 200 2>/dev/null || true
    log "brazil-route: table 200 configured (default -> wg-surfshark-br)"
fi

# 5. ip rule: from 10.99.99.2 -> table 200
if ! ip rule show | grep -q "from 10.99.99.2 lookup 200"; then
    ip rule add from 10.99.99.2 table 200 priority 200
    log "brazil-route: ip rule from 10.99.99.2 -> table 200 added"
fi

# 6. MASQUERADE: substituir 10.99.99.2 por IP válida antes de wg-surfshark-br
if ! iptables -t nat -C POSTROUTING -s 10.99.99.2 -o wg-surfshark-br -j MASQUERADE 2>/dev/null; then
    iptables -t nat -A POSTROUTING -s 10.99.99.2 -o wg-surfshark-br -j MASQUERADE
    log "brazil-route: MASQUERADE rule added for 10.99.99.2 -> wg-surfshark-br"
fi

log "brazil-route: setup complete"
exit 0
