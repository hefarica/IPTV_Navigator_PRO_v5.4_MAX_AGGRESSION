#!/usr/bin/env bash
# ============================================================================
# UFW rules auxiliares para NET SHIELD Fase 3.
# install.sh ya las aplica; este script se usa si UFW se re-inicializa.
# ============================================================================
set -euo pipefail

WAN_IF="$(ip -o -4 route show to default | awk '{print $5}' | head -n1)"

ufw allow 51820/udp comment 'WireGuard NET SHIELD'
ufw route allow in on wg0 out on "${WAN_IF}"

# Permitir que el peer consulte unbound del propio VPS a través del túnel
ufw allow in on wg0 to any port 53 proto udp comment 'unbound DNS via WG'
ufw allow in on wg0 to any port 53 proto tcp comment 'unbound DNS via WG'

ufw reload
ufw status verbose
