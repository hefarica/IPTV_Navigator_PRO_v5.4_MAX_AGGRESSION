#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# NET SHIELD AUTOPISTA — SurfShark Policy Routing Setup
# ────────────────────────────────────────────────────────────────────────────
# Purpose: Establish policy routing for IPTV traffic through SurfShark VPNs
#   Primary: wg-surfshark (Miami, US) — 28ms latency
#   Fallback: wg-surfshark-br (Sao Paulo, BR) — 121ms latency
#
# Called at boot via systemd and by wg-health-monitor.sh for failover.
#
# Architecture:
#   Player → WireGuard wg0 → VPS → fwmark 0x100 → table 100 → SurfShark → Provider
#   Table 100 default dev = active SurfShark tunnel
#   SURFSHARK_MARK chain marks traffic to provider IPs with fwmark 0x100
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

LOG="/var/log/netshield-wg-health.log"
STATE_FILE="/opt/netshield/state/surfshark_routing_state.json"
ACTIVE_VPN_FILE="/opt/netshield/state/active_vpn"

TS=$(date -u +%FT%TZ)

log() { echo "$TS [routing] $1" >> "$LOG"; }


# ─── Helpers: conntrack flush + nginx HUP (F L2.3) ──────────────────────
conntrack_flush_providers() {
    # Flush conntrack para IPs de providers IPTV — fuerza reconnect via nuevo path
    for ip in 149.18.45.78 149.18.45.119 149.18.45.189               91.208.115.23 91.208.115.0/24               154.6.41.6 154.6.41.66 154.6.41.126 154.6.41.186               172.110.220.61; do
        conntrack -D --orig-dst "$ip" 2>/dev/null || true
    done
}

nginx_hup_graceful() {
    # SIGHUP a nginx: workers existentes terminan requests in-flight,
    # workers nuevos arrancan con nuevo routing
    killall -HUP nginx 2>/dev/null || true
}

ACTION="${1:-setup}"

case "$ACTION" in
    setup)
        # Ensure table 100 has default via primary SurfShark (Miami)
        ip route replace default dev wg-surfshark table 100 2>/dev/null || true
        ip route replace 10.200.0.0/24 dev wg0 table 100 2>/dev/null || true

        # Ensure MASQUERADE exists for both tunnels
        iptables -t nat -C POSTROUTING -o wg-surfshark -j MASQUERADE 2>/dev/null || \
            iptables -t nat -A POSTROUTING -o wg-surfshark -j MASQUERADE
        iptables -t nat -C POSTROUTING -o wg-surfshark-br -j MASQUERADE 2>/dev/null || \
            iptables -t nat -A POSTROUTING -o wg-surfshark-br -j MASQUERADE

        # Ensure ip rule exists for fwmark 0x100 -> table 100
        ip rule show | grep -q 'fwmark 0x100 lookup 100' || \
            ip rule add fwmark 0x100 table 100

        echo "miami" > "$ACTIVE_VPN_FILE"
        log "SETUP routing table 100 -> wg-surfshark (Miami primary)"
        ;;

    failover-brazil)
        # Switch table 100 default to Brazil
        ip route replace default dev wg-surfshark-br table 100
        ip route replace 10.200.0.0/24 dev wg0 table 100
        echo "brazil" > "$ACTIVE_VPN_FILE"
        log "FAILOVER routing table 100 -> wg-surfshark-br (Brazil)"
        # F L2.3: flush conntrack + graceful nginx HUP para reconnect inmediato
        conntrack_flush_providers
        nginx_hup_graceful
        log "FAILOVER conntrack flushed + nginx HUP signaled"
        ;;

    failover-miami)
        # Switch back to Miami (recovery)
        ip route replace default dev wg-surfshark table 100
        ip route replace 10.200.0.0/24 dev wg0 table 100
        echo "miami" > "$ACTIVE_VPN_FILE"
        log "RECOVERY routing table 100 -> wg-surfshark (Miami)"
        # F L2.3: flush conntrack + graceful nginx HUP para reconnect inmediato
        conntrack_flush_providers
        nginx_hup_graceful
        log "RECOVERY conntrack flushed + nginx HUP signaled"
        ;;

    status)
        ACTIVE=$(cat "$ACTIVE_VPN_FILE" 2>/dev/null || echo "unknown")
        ROUTE_DEV=$(ip route show table 100 | grep default | awk '{print $3}')
        echo "{\"active_vpn\": \"$ACTIVE\", \"table_100_dev\": \"$ROUTE_DEV\"}"
        exit 0
        ;;

    *)
        echo "Usage: $0 {setup|failover-brazil|failover-miami|status}"
        exit 1
        ;;
esac

# Write state JSON
ACTIVE=$(cat "$ACTIVE_VPN_FILE" 2>/dev/null || echo "unknown")
ROUTE_DEV=$(ip route show table 100 | grep default | awk '{print $3}')
cat > "$STATE_FILE" <<EOF
{
    "timestamp": "$TS",
    "active_vpn": "$ACTIVE",
    "table_100_default": "$ROUTE_DEV",
    "action": "$ACTION"
}
EOF
