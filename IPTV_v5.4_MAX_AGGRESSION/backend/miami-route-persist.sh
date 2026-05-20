#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# miami-route-persist.sh — table 100 setup for Miami VPN
# Idempotent route persistence.
# ═══════════════════════════════════════════════════════════════════════════
set -e
LOG=/var/log/iptv-tcp-tuning.log
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }

# 1. ip rule: fwmark 0x100 -> table 100
ip rule del fwmark 0x100 table 100 2>/dev/null || true
ip rule add fwmark 0x100 table 100 priority 100
log "miami-route: ip rule fwmark 0x100 -> table 100 applied"

# 2. Table 100 — default por wg-surfshark
ip route replace default dev wg-surfshark table 100
ip route replace 10.200.0.0/24 dev wg0 table 100 2>/dev/null || true
log "miami-route: table 100 configured (default -> wg-surfshark)"

log "miami-route: setup complete"
exit 0
