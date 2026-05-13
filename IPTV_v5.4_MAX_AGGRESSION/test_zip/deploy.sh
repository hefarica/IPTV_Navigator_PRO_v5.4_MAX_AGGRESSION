#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# 🦀 IPTV Navigator PRO - Upload Server Deployment Script
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "🦀 IPTV Navigator PRO - Upload Server Deployment"
echo "================================================="

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "📦 Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source ~/.cargo/env
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p /opt/upload-server/uploads/{tmp,state,final,versions}
mkdir -p /var/www/m3u8/versions

# Build
echo "🔨 Building release binary..."
cd /opt/upload-server
RUSTFLAGS="-C target-cpu=native -C opt-level=3" cargo build --release

# Copy binary
echo "📋 Installing binary..."
cp target/release/upload-server /opt/upload-server/upload-server
chmod +x /opt/upload-server/upload-server

# Create symlink for final uploads to be served by nginx
echo "🔗 Creating symlinks..."
ln -sf /opt/upload-server/uploads/final/* /var/www/m3u8/ 2>/dev/null || true
ln -sf /opt/upload-server/uploads/versions /var/www/m3u8/versions 2>/dev/null || true

# Install systemd service
echo "⚙️ Installing systemd service..."
cp upload-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable upload-server
systemctl restart upload-server

# Check status
echo "✅ Checking service status..."
sleep 2
systemctl status upload-server --no-pager

# Test health endpoint
echo ""
echo "🧪 Testing health endpoint..."
curl -s http://localhost:8766/health | jq .

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "✅ Deployment complete!"
echo ""
echo "Endpoints:"
echo "  POST http://localhost:8766/upload/init"
echo "  POST http://localhost:8766/upload/chunk"
echo "  GET  http://localhost:8766/upload/status/:upload_id"
echo "  POST http://localhost:8766/upload/finalize"
echo "  WS   ws://localhost:8766/ws/progress/:upload_id"
echo "  GET  http://localhost:8766/metrics"
echo ""
echo "Logs: journalctl -u upload-server -f"
echo "═══════════════════════════════════════════════════════════════════════════"
