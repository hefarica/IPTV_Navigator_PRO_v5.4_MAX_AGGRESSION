#!/usr/bin/env bash
# ============================================================================
# NET SHIELD Fase 3 — Orquestador de deployment end-to-end
# Ejecutar desde la máquina local (Windows con bash / WSL / Git Bash).
#
# Flujo:
#   1. scp server/* al VPS
#   2. ssh root@VPS "bash install.sh && bash wg-enroll.sh HFRC 2"
#   3. scp hfrc.conf de vuelta al cliente
#   4. Imprime comandos Windows para instalar el cliente
#
# Prerequisitos:
#   - Clave SSH ya autorizada en root@178.156.147.234
#   - Fase 1 (unbound DNS) ya LIVE en ese VPS
# ============================================================================
set -euo pipefail

SERVER_IP="${NET_SHIELD_VPS:-178.156.147.234}"
HOME_ID="${1:-HFRC}"
SUFFIX="${2:-2}"

HERE="$(cd "$(dirname "$0")" && pwd)"
REMOTE_DIR="/root/net-shield/wireguard"
LOCAL_OUT="${HERE}/client/_generated"
mkdir -p "${LOCAL_OUT}"

echo "══════════════════════════════════════════════════════════════"
echo " NET SHIELD Fase 3 — deploy a ${SERVER_IP}"
echo " Peer: ${HOME_ID} (10.66.0.${SUFFIX})"
echo "══════════════════════════════════════════════════════════════"

# ── 1. Copiar scripts del server ────────────────────────────────────────────
echo "[1/4] Copiando scripts server..."
ssh "root@${SERVER_IP}" "mkdir -p ${REMOTE_DIR}"
scp -q "${HERE}/server/install.sh"   "root@${SERVER_IP}:${REMOTE_DIR}/"
scp -q "${HERE}/server/wg-enroll.sh" "root@${SERVER_IP}:${REMOTE_DIR}/"
scp -q "${HERE}/server/uninstall.sh" "root@${SERVER_IP}:${REMOTE_DIR}/"
scp -q "${HERE}/server/ufw-rules.sh" "root@${SERVER_IP}:${REMOTE_DIR}/"
ssh "root@${SERVER_IP}" "chmod +x ${REMOTE_DIR}/*.sh"

# ── 2. Instalar server (idempotente) ────────────────────────────────────────
echo "[2/4] Instalando WireGuard server..."
ssh "root@${SERVER_IP}" "bash ${REMOTE_DIR}/install.sh"

# ── 3. Enrolar peer ─────────────────────────────────────────────────────────
echo "[3/4] Enrolando peer ${HOME_ID}..."
if ssh "root@${SERVER_IP}" "test -d /etc/wireguard/clients/${HOME_ID}"; then
    echo "[i] Peer ${HOME_ID} ya existe en el VPS, saltando generación."
else
    ssh "root@${SERVER_IP}" "bash ${REMOTE_DIR}/wg-enroll.sh ${HOME_ID} ${SUFFIX}"
fi

# ── 4. Traer config al cliente ──────────────────────────────────────────────
echo "[4/4] Descargando config cliente..."
scp -q "root@${SERVER_IP}:/etc/wireguard/clients/${HOME_ID}/${HOME_ID}.conf" \
       "${LOCAL_OUT}/${HOME_ID}.conf"
chmod 600 "${LOCAL_OUT}/${HOME_ID}.conf" 2>/dev/null || true

echo ""
echo "══════════════════════════════════════════════════════════════"
echo " [✓] Config cliente en: ${LOCAL_OUT}/${HOME_ID}.conf"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "Siguiente (en PowerShell Administrador desde este directorio):"
echo ""
echo "  cd $(cygpath -w "${HERE}/client" 2>/dev/null || echo "${HERE}/client")"
echo "  powershell -ExecutionPolicy Bypass -File .\\install-client.ps1 \\"
echo "    -ConfPath .\\_generated\\${HOME_ID}.conf"
echo ""
echo "Luego verificar split-tunnel:"
echo "  powershell -ExecutionPolicy Bypass -File .\\verify-splittunnel.ps1"
echo ""
