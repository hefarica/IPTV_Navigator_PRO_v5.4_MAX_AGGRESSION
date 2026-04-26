#!/usr/bin/env bash
# ============================================================================
# NET SHIELD Fase 3 — Rollback completo del server WireGuard.
# CUIDADO: borra claves y peers.  Requiere confirmación explícita.
# ============================================================================
set -euo pipefail

[[ "${1:-}" != "--yes-wipe" ]] && {
    echo "Uso: $0 --yes-wipe"
    echo "Esto detendrá wg0, borrará /etc/wireguard/* y revertirá UFW."
    exit 1
}

systemctl disable --now wg-quick@wg0 2>/dev/null || true

if command -v ufw >/dev/null; then
    ufw delete allow 51820/udp 2>/dev/null || true
fi

rm -rf /etc/wireguard/wg0.conf /etc/wireguard/keys /etc/wireguard/clients

echo "[✓] WireGuard removido. Paquete 'wireguard' NO se desinstaló (apt remove si se desea)."
