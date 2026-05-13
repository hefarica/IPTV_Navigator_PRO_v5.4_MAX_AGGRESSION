#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE Real-Time Bitrate Guardian — Install Script
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

INSTALL_DIR="/opt/ape-realtime-guardian"
CONFIG_DIR="/etc/ape-realtime-guardian"
LOG_DIR="/var/log/ape-realtime-guardian"
STATE_DIR="/var/lib/ape-realtime-guardian"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "═══════════════════════════════════════════════════════════════"
echo "  APE Real-Time Bitrate Guardian — Installer"
echo "═══════════════════════════════════════════════════════════════"

# 1. Create directories
echo "[1/6] Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$STATE_DIR"

# 2. Copy application
echo "[2/6] Copying application to $INSTALL_DIR..."
cp -r "$SCRIPT_DIR/ape_realtime_guardian" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/requirements.txt" "$INSTALL_DIR/"

# 3. Setup Python venv
echo "[3/6] Setting up Python virtual environment..."
python3 -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/.venv/bin/pip" install --quiet -r "$INSTALL_DIR/requirements.txt"

# 4. Copy config (if not exists — don't overwrite user config)
if [ ! -f "$CONFIG_DIR/config.yaml" ]; then
    echo "[4/6] Installing default config..."
    cp "$SCRIPT_DIR/config/config.yaml.example" "$CONFIG_DIR/config.yaml"
else
    echo "[4/6] Config already exists — skipping (won't overwrite)"
fi

# 5. Install systemd unit
echo "[5/6] Installing systemd service..."
cp "$SCRIPT_DIR/systemd/ape-realtime-guardian.service" /etc/systemd/system/
systemctl daemon-reload

# 6. Setup logrotate
echo "[6/6] Setting up logrotate..."
cat > /etc/logrotate.d/ape-realtime-guardian <<'EOF'
/var/log/ape-realtime-guardian/*.log /var/log/ape-realtime-guardian/*.jsonl {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
    postrotate
        systemctl reload ape-realtime-guardian 2>/dev/null || true
    endscript
}
EOF

# Copy scripts for operational use
mkdir -p "$INSTALL_DIR/scripts"
cp "$SCRIPT_DIR/scripts/"*.sh "$INSTALL_DIR/scripts/" 2>/dev/null || true
chmod +x "$INSTALL_DIR/scripts/"*.sh 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Installation complete!"
echo ""
echo "  Config:    $CONFIG_DIR/config.yaml"
echo "  Logs:      $LOG_DIR/"
echo "  State:     $STATE_DIR/state.json"
echo "  Service:   systemctl start ape-realtime-guardian"
echo ""
echo "  Day-1 mode: dry_run=true, adapter=simulated"
echo "  To start:   systemctl start ape-realtime-guardian"
echo "  To enable:  systemctl enable ape-realtime-guardian"
echo "═══════════════════════════════════════════════════════════════"
