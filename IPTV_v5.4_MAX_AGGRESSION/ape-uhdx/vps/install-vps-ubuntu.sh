#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# APE UHDX — Instalador VPS Ubuntu/Nginx (idempotente)
# Instala: watchdog systemd timer + daemon maestro + nginx locations + heartbeat.
# NO arranca el daemon del ONN aqui (eso lo hace el watchdog via ADB/Xray).
# Uso:  sudo bash vps/install-vps-ubuntu.sh   (correr desde la carpeta ape-uhdx/)
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"   # carpeta ape-uhdx/
echo "[*] Fuente: $SRC"

# 1. Directorios
install -d -m 755 /opt/ape-uhdx/bin /opt/ape-uhdx/onn /etc/ape-uhdx /var/www/ape-uhdx

# 2. Daemon maestro (copia que el watchdog re-pushea al ONN)
install -m 755 "$SRC/onn/ape-uhdx-sentinel.sh" /opt/ape-uhdx/onn/ape-uhdx-sentinel.sh

# 3. Watchdog
install -m 755 "$SRC/vps/bin/ape-uhdx-vps-watchdog.sh" /opt/ape-uhdx/bin/ape-uhdx-vps-watchdog.sh

# 4. Config (no sobre-escribir si ya existe)
if [ ! -f /etc/ape-uhdx/watchdog.env ]; then
    install -m 600 "$SRC/vps/etc/watchdog.env.example" /etc/ape-uhdx/watchdog.env
    echo "[!] Edita /etc/ape-uhdx/watchdog.env y pon ONN_ADDR (IP del ONN por Xray/VPN)"
fi

# 5. systemd units
install -m 644 "$SRC/vps/systemd/ape-uhdx-watchdog.service" /etc/systemd/system/ape-uhdx-watchdog.service
install -m 644 "$SRC/vps/systemd/ape-uhdx-watchdog.timer"   /etc/systemd/system/ape-uhdx-watchdog.timer

# 6. heartbeat php + estado inicial
install -m 644 "$SRC/vps/www/heartbeat.php" /var/www/ape-uhdx/heartbeat.php
[ -f /var/www/ape-uhdx/last-vps-watchdog.json ] || echo '{"watchdog":"ape-uhdx-vps","guardian":"pending","ts":""}' > /var/www/ape-uhdx/last-vps-watchdog.json
chown -R www-data:www-data /var/www/ape-uhdx 2>/dev/null || true

# 7. nginx snippet (incluir manualmente en el server 443 si no esta)
install -d -m 755 /etc/nginx/snippets
install -m 644 "$SRC/vps/nginx/ape-uhdx-location.conf" /etc/nginx/snippets/ape-uhdx-location.conf
echo "[!] Asegura el include en el server{443}:  include /etc/nginx/snippets/ape-uhdx-location.conf;"

# 8. systemd reload (NO arranca todavia: el operador decide tras editar el .env)
systemctl daemon-reload
echo ""
echo "[OK] Instalado. Siguientes pasos MANUALES (gated):"
echo "    sudo nano /etc/ape-uhdx/watchdog.env        # ONN_ADDR via Xray/VPN"
echo "    sudo nginx -t && sudo systemctl reload nginx # tras incluir el snippet"
echo "    sudo systemctl enable --now ape-uhdx-watchdog.timer"
echo "    sudo systemctl start ape-uhdx-watchdog.service"
echo "    journalctl -u ape-uhdx-watchdog.service -n 50 --no-pager"
