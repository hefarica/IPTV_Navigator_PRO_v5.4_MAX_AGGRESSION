#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# NET SHIELD — SurfShark Route Persistence (tabla 100 → Miami)
# Garantiza que el tráfico IPTV SIEMPRE salga por wg-surfshark
# Se ejecuta al boot y cada vez que WireGuard se reinicia
# ═══════════════════════════════════════════════════════════════

IFACE="wg-surfshark"
TABLE=100
LOG="/var/log/surfshark-route.log"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$LOG"; }

# Esperar a que la interfaz exista (max 60s)
for i in $(seq 1 60); do
    ip link show "$IFACE" &>/dev/null && break
    sleep 1
done

if ! ip link show "$IFACE" &>/dev/null; then
    log "FATAL: $IFACE not found after 60s"
    exit 1
fi

# Aplicar ruta default → Miami
ip route replace default dev "$IFACE" table "$TABLE"
log "Route applied: default dev $IFACE table $TABLE"

# Verificar
CURRENT=$(ip route show table "$TABLE" | grep default | awk '{print $3}')
if [ "$CURRENT" = "$IFACE" ]; then
    log "VERIFIED: table $TABLE default → $IFACE"
else
    log "WARNING: table $TABLE default → $CURRENT (expected $IFACE)"
fi

# Preservar ruta WireGuard para FireStick 4K
ip route replace 10.200.0.0/24 dev wg0 table "$TABLE" 2>/dev/null
log "WG0 peer route preserved: 10.200.0.0/24 dev wg0 table $TABLE"

# Actualizar state file
cat > /opt/netshield/state/surfshark_routing_state.json << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "active_vpn": "miami",
    "table_100_default": "$IFACE",
    "action": "persist-script"
}
EOF
log "State file updated"
