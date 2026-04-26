#!/usr/bin/env bash
# ============================================================================
# NET SHIELD Fase 3 — WireGuard server installer
# Target: VPS Hetzner 178.156.147.234 (Ubuntu 22.04/24.04)
# Ejecutar como root.  Idempotente: reinvocable sin romper estado previo.
# ============================================================================
set -euo pipefail

SERVER_IP="178.156.147.234"
WG_PORT="51820"
WG_SUBNET="10.66.0.0/24"
WG_ADDR="10.66.0.1/24"
WAN_IF="$(ip -o -4 route show to default | awk '{print $5}' | head -n1)"

echo "[*] WAN interface detectada: ${WAN_IF}"
[[ -z "${WAN_IF}" ]] && { echo "[x] No se pudo detectar WAN_IF"; exit 1; }

# ── 1. Paquetes ─────────────────────────────────────────────────────────────
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    wireguard wireguard-tools qrencode iptables-persistent

# ── 2. IP forwarding permanente ─────────────────────────────────────────────
if ! grep -qE '^net.ipv4.ip_forward[[:space:]]*=[[:space:]]*1' /etc/sysctl.conf; then
    sed -i 's/^#\?net.ipv4.ip_forward.*/net.ipv4.ip_forward=1/' /etc/sysctl.conf
    grep -qE '^net.ipv4.ip_forward=1' /etc/sysctl.conf \
        || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
fi
sysctl -p >/dev/null

# ── 3. Keys del server ──────────────────────────────────────────────────────
install -d -m 700 /etc/wireguard/keys
install -d -m 700 /etc/wireguard/clients

if [[ ! -s /etc/wireguard/keys/server.key ]]; then
    umask 077
    wg genkey | tee /etc/wireguard/keys/server.key \
        | wg pubkey > /etc/wireguard/keys/server.pub
    echo "[✓] Server keypair generado"
else
    echo "[i] Server keypair ya existe, se conserva"
fi

SERVER_PRIV="$(cat /etc/wireguard/keys/server.key)"
SERVER_PUB="$(cat /etc/wireguard/keys/server.pub)"

# ── 4. wg0.conf base (solo si no existe) ────────────────────────────────────
if [[ ! -f /etc/wireguard/wg0.conf ]]; then
    umask 077
    cat > /etc/wireguard/wg0.conf <<EOF
# NET SHIELD Fase 3 — WireGuard server wg0
# Generado por install.sh el $(date -u +%FT%TZ)
[Interface]
Address    = ${WG_ADDR}
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIV}
SaveConfig = false

PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT
PostUp   = iptables -A FORWARD -o wg0 -j ACCEPT
PostUp   = iptables -t nat -A POSTROUTING -s ${WG_SUBNET} -o ${WAN_IF} -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -o wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s ${WG_SUBNET} -o ${WAN_IF} -j MASQUERADE
EOF
    echo "[✓] /etc/wireguard/wg0.conf creado"
else
    echo "[i] /etc/wireguard/wg0.conf ya existe, se conserva (usa wg-enroll.sh para añadir peers)"
fi

# ── 5. Firewall (UFW si activo) ─────────────────────────────────────────────
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow "${WG_PORT}/udp" comment 'WireGuard NET SHIELD' || true
    ufw route allow in on wg0 out on "${WAN_IF}" || true
    ufw reload
    echo "[✓] UFW reglas aplicadas"
else
    echo "[!] UFW no activo — asegúrate de que el Cloud Firewall de Hetzner permite UDP ${WG_PORT}"
fi

# ── 6. Arranque y persistencia ──────────────────────────────────────────────
systemctl enable wg-quick@wg0 >/dev/null
systemctl restart wg-quick@wg0

sleep 1
wg show wg0 || { echo "[x] wg0 no levantó"; journalctl -u wg-quick@wg0 --no-pager -n 50; exit 1; }

echo ""
echo "============================================================"
echo "[✓] WireGuard server LIVE en ${SERVER_IP}:${WG_PORT}/udp"
echo "[✓] Server pubkey: ${SERVER_PUB}"
echo ""
echo "Siguiente paso:"
echo "  ./wg-enroll.sh HFRC 2      # enrolar el primer peer (10.66.0.2)"
echo "============================================================"
