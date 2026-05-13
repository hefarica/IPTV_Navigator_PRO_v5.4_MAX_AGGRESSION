#!/bin/bash
#
# ═══════════════════════════════════════════════════════════════════════════════
# APE v15.0 ULTIMATE - Universal Installer
# Supports: Linux, Android (Termux), macOS
# ═══════════════════════════════════════════════════════════════════════════════
#
# Usage: ./install_ape_v15_ultimate.sh
#
# Features:
# - Auto-detects operating system
# - Installs Python 3.11+, Redis, dependencies
# - Creates systemd service (Linux)
# - Configures APE server
#

set -e

VERSION="15.0.0-ULTIMATE"
INSTALL_DIR="${APE_INSTALL_DIR:-$HOME/APE_v15_ULTIMATE}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_banner() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}        ${GREEN}APE v15.0 ULTIMATE - Universal Installer${NC}              ${BLUE}║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect OS
detect_os() {
    log_info "Detecting operating system..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -d "/data/data/com.termux" ]; then
            OS="android"
            log_success "Detected: Android (Termux)"
        else
            OS="linux"
            log_success "Detected: Linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        log_success "Detected: macOS"
    else
        log_error "Unsupported OS: $OSTYPE"
        exit 1
    fi
}

# Check Python version
check_python() {
    log_info "Checking Python version..."
    
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
        log_success "Python $PYTHON_VERSION found"
        
        # Check minimum version (3.9+)
        MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
        MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
        
        if [ "$MAJOR" -lt 3 ] || ([ "$MAJOR" -eq 3 ] && [ "$MINOR" -lt 9 ]); then
            log_warn "Python 3.9+ recommended (found $PYTHON_VERSION)"
        fi
    else
        log_warn "Python 3 not found, will be installed"
    fi
}

# Install dependencies based on OS
install_dependencies() {
    log_info "Installing system dependencies..."
    
    case $OS in
        linux)
            if command -v apt-get &> /dev/null; then
                # Debian/Ubuntu
                sudo apt-get update -qq
                sudo apt-get install -y python3 python3-pip python3-venv redis-server curl
            elif command -v yum &> /dev/null; then
                # CentOS/RHEL
                sudo yum install -y python3 python3-pip redis curl
            elif command -v dnf &> /dev/null; then
                # Fedora
                sudo dnf install -y python3 python3-pip redis curl
            elif command -v pacman &> /dev/null; then
                # Arch
                sudo pacman -Sy --noconfirm python python-pip redis curl
            else
                log_error "Unsupported package manager"
                exit 1
            fi
            ;;
        android)
            # Termux
            pkg update -y
            pkg install -y python redis curl
            ;;
        macos)
            if ! command -v brew &> /dev/null; then
                log_error "Homebrew required. Install from https://brew.sh"
                exit 1
            fi
            brew install python redis curl
            ;;
    esac
    
    log_success "System dependencies installed"
}

# Install Python packages
install_python_packages() {
    log_info "Installing Python packages..."
    
    pip3 install --upgrade pip --quiet
    pip3 install flask flask-cors redis requests psutil --quiet
    
    log_success "Python packages installed"
}

# Start/configure Redis
setup_redis() {
    log_info "Configuring Redis..."
    
    case $OS in
        linux)
            sudo systemctl start redis-server 2>/dev/null || sudo systemctl start redis 2>/dev/null || true
            sudo systemctl enable redis-server 2>/dev/null || sudo systemctl enable redis 2>/dev/null || true
            ;;
        android)
            log_warn "In Termux, start Redis manually: redis-server &"
            ;;
        macos)
            brew services start redis
            ;;
    esac
    
    # Test connection
    if redis-cli ping 2>/dev/null | grep -q PONG; then
        log_success "Redis is running"
    else
        log_warn "Redis may not be running. Start manually if needed."
    fi
}

# Create directory structure
create_directories() {
    log_info "Creating directory structure..."
    
    mkdir -p "$INSTALL_DIR"/{backend,config,frontend,tools,logs,m3u}
    mkdir -p "$INSTALL_DIR"/backend/utils
    
    log_success "Created: $INSTALL_DIR"
}

# Create systemd service (Linux only)
setup_systemd() {
    if [ "$OS" != "linux" ]; then
        return
    fi
    
    log_info "Creating systemd service..."
    
    SERVICE_FILE="/etc/systemd/system/ape-server-v15.service"
    
    sudo tee $SERVICE_FILE > /dev/null <<EOF
[Unit]
Description=APE v15.0 ULTIMATE Streaming Server
After=network.target redis-server.service redis.service
Wants=redis-server.service redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR/backend
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 ape_server_v15_ultimate.py
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    
    log_success "Systemd service created: ape-server-v15"
}

# Print completion message
print_complete() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}           ${GREEN}Installation Complete!${NC}                             ${GREEN}║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "📂 Installation directory: ${BLUE}$INSTALL_DIR${NC}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo ""
    echo "  1. Copy APE v15 files to: $INSTALL_DIR/backend/"
    echo ""
    echo "  2. Start the server:"
    
    if [ "$OS" == "linux" ]; then
        echo "     sudo systemctl start ape-server-v15"
        echo "     # or manually:"
        echo "     cd $INSTALL_DIR/backend && python3 ape_server_v15_ultimate.py"
    else
        echo "     cd $INSTALL_DIR/backend && python3 ape_server_v15_ultimate.py"
    fi
    
    echo ""
    echo "  3. Parametrize your M3U:"
    echo "     python3 tools/m3u_parametrizer.py your_list.m3u8"
    echo ""
    echo "  4. Open monitor dashboard:"
    echo "     $INSTALL_DIR/frontend/APE_MONITOR_v15.html"
    echo ""
    echo "  5. Load parametrized M3U in your IPTV player"
    echo ""
    echo -e "${GREEN}Documentation:${NC} $INSTALL_DIR/docs/README_v15.md"
    echo ""
}

# Main
main() {
    print_banner
    detect_os
    check_python
    install_dependencies
    install_python_packages
    setup_redis
    create_directories
    setup_systemd
    print_complete
}

main "$@"
