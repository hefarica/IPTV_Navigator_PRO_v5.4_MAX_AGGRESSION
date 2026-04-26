#!/usr/bin/env bash
# ============================================================================
# NET SHIELD Fase 3 — Enroll un peer WireGuard en caliente
# Uso:  ./wg-enroll.sh <home_id> <ip_suffix_2_254>
# Ej:   ./wg-enroll.sh HFRC   2    -> 10.66.0.2
#       ./wg-enroll.sh OFFICE 3    -> 10.66.0.3
# ============================================================================
set -euo pipefail

HOME_ID="${1:?falta home_id (ej: HFRC)}"
SUFFIX="${2:?falta sufijo IP 2-254}"

SERVER_IP="178.156.147.234"
SERVER_PORT="51820"
SUBNET="10.66.0"
CLIENT_IP="${SUBNET}.${SUFFIX}"

# Origins IPTV matriculados (split-tunnel AllowedIPs)
IPTV_ALLOWED="172.110.220.61/32, 149.18.45.0/24, 91.208.115.23/32, ${SERVER_IP}/32"

[[ "${SUFFIX}" =~ ^([2-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4])$ ]] \
    || { echo "[x] sufijo debe ser 2..254"; exit 1; }

if [[ ! -s /etc/wireguard/keys/server.pub ]]; then
    echo "[x] Server no inicializado. Ejecuta install.sh primero."
    exit 1
fi

SERVER_PUB="$(cat /etc/wireguard/keys/server.pub)"
DIR="/etc/wireguard/clients/${HOME_ID}"

if [[ -d "${DIR}" ]]; then
    echo "[x] Peer ${HOME_ID} ya existe en ${DIR}. Borra o usa otro home_id."
    exit 1
fi

install -d -m 700 "${DIR}"
cd "${DIR}"

umask 077
wg genkey | tee client.key | wg pubkey > client.pub
CLIENT_PRIV="$(cat client.key)"
CLIENT_PUB="$(cat client.pub)"

# ── Config cliente ──────────────────────────────────────────────────────────
cat > "${HOME_ID}.conf" <<EOF
# NET SHIELD Fase 3 — cliente ${HOME_ID}
# Split-tunnel: SOLO tráfico a origins IPTV viaja por el túnel.
[Interface]
PrivateKey = ${CLIENT_PRIV}
Address    = ${CLIENT_IP}/32
DNS        = ${SERVER_IP}
MTU        = 1420

[Peer]
PublicKey  = ${SERVER_PUB}
Endpoint   = ${SERVER_IP}:${SERVER_PORT}
PersistentKeepalive = 25
AllowedIPs = ${IPTV_ALLOWED}
EOF

# ── Añadir peer al server en caliente (sin reiniciar) ──────────────────────
wg set wg0 peer "${CLIENT_PUB}" allowed-ips "${CLIENT_IP}/32" persistent-keepalive 25

# ── Persistir en wg0.conf ──────────────────────────────────────────────────
cat >> /etc/wireguard/wg0.conf <<EOF

# ─── Peer: ${HOME_ID} (añadido $(date -u +%FT%TZ)) ───
[Peer]
PublicKey  = ${CLIENT_PUB}
AllowedIPs = ${CLIENT_IP}/32
PersistentKeepalive = 25
EOF

chmod 600 "${DIR}/${HOME_ID}.conf" "${DIR}/client.key"

echo ""
echo "============================================================"
echo "[✓] Peer ${HOME_ID} enrolado como ${CLIENT_IP}"
echo "[✓] Config cliente:  ${DIR}/${HOME_ID}.conf"
echo "[✓] Client pubkey:   ${CLIENT_PUB}"
echo ""
echo "── QR para móvil WireGuard ──"
qrencode -t ansiutf8 < "${DIR}/${HOME_ID}.conf"
echo "============================================================"
echo ""
echo "Transferir al cliente Windows:"
echo "  scp root@${SERVER_IP}:${DIR}/${HOME_ID}.conf ."
