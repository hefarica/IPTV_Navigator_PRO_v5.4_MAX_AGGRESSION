#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# APE Telemetry — Add Device to Guardian
# Registers a new Android player device in the Guardian configuration
# ═══════════════════════════════════════════════════════════════════════════════
# Usage: bash add-device.sh --name <NAME> --address <WG_IP:PORT> --player <TYPE> --location <LOC>
#        bash add-device.sh --remove --name <NAME>
#
# Run this ON THE VPS (ssh root@178.156.147.234)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

CONFIG_FILE="/etc/ape-realtime-guardian/config.yaml"
ADB_PERSIST="/opt/ape-realtime-guardian/ape_realtime_guardian/adb_persistence.py"
GUARDIAN_SERVICE="ape-realtime-guardian"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[ADD-DEVICE]${NC} $*"; }
warn() { echo -e "${YELLOW}[ADD-DEVICE]${NC} $*"; }
err()  { echo -e "${RED}[ADD-DEVICE]${NC} $*"; }

# ─── Parse arguments ─────────────────────────────────────────────────────────
NAME=""
ADDRESS=""
PLAYER="ott_navigator"
LOCATION="default"
REMOVE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name)     NAME="$2"; shift 2 ;;
        --address)  ADDRESS="$2"; shift 2 ;;
        --player)   PLAYER="$2"; shift 2 ;;
        --location) LOCATION="$2"; shift 2 ;;
        --remove)   REMOVE=true; shift ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [[ -z "$NAME" ]]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo " APE Telemetry — Register Device in Guardian"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo " Usage:"
    echo "   bash add-device.sh --name <NAME> --address <WG_IP:PORT> --player <TYPE> --location <LOC>"
    echo ""
    echo " Arguments:"
    echo "   --name      Unique device name (e.g., firestick_sala)"
    echo "   --address   WireGuard IP:port (e.g., 10.200.0.5:5555)"
    echo "   --player    Player type: ott_navigator | tivimate (default: ott_navigator)"
    echo "   --location  Physical location (e.g., sala, oficina, cuarto)"
    echo ""
    echo " Remove a device:"
    echo "   bash add-device.sh --remove --name firestick_sala"
    echo ""
    exit 1
fi

# ─── Safety: verify not breaking anything ────────────────────────────────────
[[ $EUID -eq 0 ]] || { err "Must run as root"; exit 1; }
[[ -f "$CONFIG_FILE" ]] || { err "Guardian config not found: $CONFIG_FILE"; exit 1; }

log "Backing up current config..."
cp "$CONFIG_FILE" "${CONFIG_FILE}.bak.$(date +%s)"

# ─── Remove mode ─────────────────────────────────────────────────────────────
if $REMOVE; then
    log "Removing device '$NAME' from config..."

    # Remove from YAML config (remove the device block)
    python3 -c "
import yaml, sys
with open('$CONFIG_FILE') as f:
    cfg = yaml.safe_load(f)
devices = cfg.get('probes', {}).get('devices', [])
before = len(devices)
devices = [d for d in devices if d.get('name') != '$NAME']
after = len(devices)
if before == after:
    print(f'Device $NAME not found in config')
    sys.exit(1)
cfg['probes']['devices'] = devices
with open('$CONFIG_FILE', 'w') as f:
    yaml.dump(cfg, f, default_flow_style=False, sort_keys=False)
print(f'Removed $NAME from config ({before} → {after} devices)')
"

    # Reload Guardian
    systemctl reload "$GUARDIAN_SERVICE" 2>/dev/null || systemctl restart "$GUARDIAN_SERVICE"
    log "✅ Device '$NAME' removed. Guardian reloaded."
    exit 0
fi

# ─── Add mode ────────────────────────────────────────────────────────────────
if [[ -z "$ADDRESS" ]]; then
    err "--address is required (e.g., 10.200.0.5:5555)"
    exit 1
fi

log "Adding device '$NAME' at $ADDRESS (player: $PLAYER, location: $LOCATION)..."

# Check if device already exists
EXISTING=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
    cfg = yaml.safe_load(f)
devices = cfg.get('probes', {}).get('devices', [])
for d in devices:
    if d.get('name') == '$NAME':
        print('EXISTS')
        break
" 2>/dev/null || true)

if [[ "$EXISTING" == "EXISTS" ]]; then
    warn "Device '$NAME' already exists in config — updating..."
fi

# Add/update device in YAML config
python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
    cfg = yaml.safe_load(f)

devices = cfg.setdefault('probes', {}).setdefault('devices', [])

# Remove existing with same name
devices = [d for d in devices if d.get('name') != '$NAME']

# Add new device
devices.append({
    'name': '$NAME',
    'adb_address': '$ADDRESS',
    'player': '$PLAYER',
    'poll_every_n_cycles': 2,
})

cfg['probes']['devices'] = devices

with open('$CONFIG_FILE', 'w') as f:
    yaml.dump(cfg, f, default_flow_style=False, sort_keys=False)

print(f'Config updated: {len(devices)} devices total')
for d in devices:
    print(f'  - {d[\"name\"]} @ {d[\"adb_address\"]} ({d[\"player\"]})')
"

# Also add to adb_persistence.py DEVICES list if not already there
if [[ -f "$ADB_PERSIST" ]]; then
    if ! grep -q "\"$NAME\"" "$ADB_PERSIST"; then
        log "Adding to adb_persistence.py DEVICES list..."
        # Insert before the closing bracket of DEVICES list
        python3 -c "
import re
with open('$ADB_PERSIST') as f:
    content = f.read()

new_entry = '''    {
        \"name\": \"$NAME\",
        \"address\": \"$ADDRESS\",
        \"location\": \"$LOCATION\",
    },'''

# Find DEVICES = [ ... ] and add before the closing ]
pattern = r'(DEVICES\s*=\s*\[.*?)(^\])'
replacement = r'\g<1>' + new_entry + '\n]'
content = re.sub(pattern, replacement, content, count=1, flags=re.DOTALL | re.MULTILINE)

with open('$ADB_PERSIST', 'w') as f:
    f.write(content)
print('Added to adb_persistence.py')
" 2>/dev/null || warn "Could not update adb_persistence.py (non-critical)"
    fi
fi

# ─── Test ADB connectivity ──────────────────────────────────────────────────
log "Testing ADB connectivity to $ADDRESS..."
ADB_RESULT=$(adb connect "$ADDRESS" 2>&1 || true)
echo "      $ADB_RESULT"

if echo "$ADB_RESULT" | grep -qi "connected"; then
    # Verify device is authorized
    sleep 1
    ALIVE=$(adb -s "$ADDRESS" shell echo ALIVE 2>/dev/null || true)
    if [[ "$ALIVE" == *"ALIVE"* ]]; then
        log "✅ Device is connected and authorized"

        # Grab device info
        MODEL=$(adb -s "$ADDRESS" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
        log "   Model: $MODEL"
    else
        warn "Device connected but not authorized — check device screen for 'Allow USB debugging' dialog"
    fi
else
    warn "Could not connect to $ADDRESS — verify WireGuard tunnel and ADB is enabled on device"
    echo "      The Guardian will keep retrying automatically every 15 seconds"
fi

# ─── Reload Guardian ─────────────────────────────────────────────────────────
log "Reloading Guardian daemon..."
kill -HUP $(pgrep -f "ape_realtime_guardian" | head -1) 2>/dev/null || \
    systemctl restart "$GUARDIAN_SERVICE"

sleep 2
log "Guardian status:"
systemctl --no-pager status "$GUARDIAN_SERVICE" | head -5

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " ✅ Device '$NAME' registered"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo " Verify in 30 seconds:"
echo "   cat /dev/shm/guardian_player_state.json | python3 -m json.tool"
echo ""
echo " Check PRISMA:"
echo "   curl -s https://iptv-ape.duckdns.org/prisma/api/prisma-health.php | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin).get(\"player_telemetry\",{}), indent=2))'"
echo ""
echo "═══════════════════════════════════════════════════════════════"
