#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# APE Telemetry — Pipeline Verification (E2E)
# Verifies the complete telemetry chain from ADB → Guardian → Bridge → PRISMA
# ═══════════════════════════════════════════════════════════════════════════════
# Usage: bash verify-pipeline.sh [VPS_HOST]
# Run from your PC or from the VPS directly.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

VPS="${1:-root@178.156.147.234}"
PASS=0
FAIL=0
WARN=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

check() {
    local name="$1"
    local result="$2"
    if [[ "$result" == "PASS" ]]; then
        echo -e "  ${GREEN}✅ PASS${NC}  $name"
        ((PASS++))
    elif [[ "$result" == "WARN" ]]; then
        echo -e "  ${YELLOW}⚠️ WARN${NC}  $name"
        ((WARN++))
    else
        echo -e "  ${RED}❌ FAIL${NC}  $name"
        ((FAIL++))
    fi
}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " APE Telemetry Pipeline — E2E Verification"
echo " VPS: $VPS"
echo " Time: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── Layer 1: Guardian daemon ────────────────────────────────────────────────
echo -e "${CYAN}── Layer 1: Guardian Daemon ──${NC}"
GUARDIAN_STATUS=$(ssh -o ConnectTimeout=5 "$VPS" "systemctl is-active ape-realtime-guardian 2>/dev/null" || echo "inactive")
[[ "$GUARDIAN_STATUS" == "active" ]] && check "Guardian daemon running" "PASS" || check "Guardian daemon running" "FAIL"

# ─── Layer 2: ADB connectivity ──────────────────────────────────────────────
echo -e "\n${CYAN}── Layer 2: ADB Device Connectivity ──${NC}"
ADB_STATE=$(ssh -o ConnectTimeout=5 "$VPS" "cat /dev/shm/adb_persistence_state.json 2>/dev/null" || echo '{}')
DEVICE_COUNT=$(echo "$ADB_STATE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    devices = d.get('devices', {})
    connected = sum(1 for v in devices.values() if v.get('status') == 'device')
    total = len(devices)
    print(f'{connected}/{total}')
except:
    print('0/0')
" 2>/dev/null || echo "0/0")

CONNECTED=$(echo "$DEVICE_COUNT" | cut -d/ -f1)
TOTAL=$(echo "$DEVICE_COUNT" | cut -d/ -f2)

if [[ "$CONNECTED" -gt 0 ]]; then
    check "ADB devices connected: $DEVICE_COUNT" "PASS"
elif [[ "$TOTAL" -gt 0 ]]; then
    check "ADB devices: 0 connected of $TOTAL configured" "WARN"
else
    check "ADB devices: none configured" "WARN"
fi

# ─── Layer 3: Audit log ─────────────────────────────────────────────────────
echo -e "\n${CYAN}── Layer 3: Guardian Audit Log ──${NC}"
AUDIT_EXISTS=$(ssh -o ConnectTimeout=5 "$VPS" "test -f /var/log/ape-realtime-guardian/audit.jsonl && echo YES || echo NO" 2>/dev/null)
if [[ "$AUDIT_EXISTS" == "YES" ]]; then
    AUDIT_LINES=$(ssh -o ConnectTimeout=5 "$VPS" "wc -l < /var/log/ape-realtime-guardian/audit.jsonl")
    AUDIT_AGE=$(ssh -o ConnectTimeout=5 "$VPS" "python3 -c \"
import os, time
stat = os.stat('/var/log/ape-realtime-guardian/audit.jsonl')
age = time.time() - stat.st_mtime
print(f'{age:.0f}s')
\"" 2>/dev/null || echo "unknown")
    check "Audit log exists: $AUDIT_LINES entries (last write: $AUDIT_AGE ago)" "PASS"
else
    check "Audit log not found — Guardian not writing ADB probe data" "WARN"
fi

# ─── Layer 4: Bridge daemon ──────────────────────────────────────────────────
echo -e "\n${CYAN}── Layer 4: PRISMA-Guardian Bridge ──${NC}"
BRIDGE_STATUS=$(ssh -o ConnectTimeout=5 "$VPS" "systemctl is-active prisma-guardian-bridge 2>/dev/null" || echo "inactive")
[[ "$BRIDGE_STATUS" == "active" ]] && check "Bridge daemon running" "PASS" || check "Bridge daemon running" "FAIL"

# ─── Layer 5: SHM player state ──────────────────────────────────────────────
echo -e "\n${CYAN}── Layer 5: SHM Player State ──${NC}"
SHM_EXISTS=$(ssh -o ConnectTimeout=5 "$VPS" "test -f /dev/shm/guardian_player_state.json && echo YES || echo NO" 2>/dev/null)
if [[ "$SHM_EXISTS" == "YES" ]]; then
    SHM_DATA=$(ssh -o ConnectTimeout=5 "$VPS" "cat /dev/shm/guardian_player_state.json" 2>/dev/null)
    BITRATE=$(echo "$SHM_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('bitrate_kbps',0))" 2>/dev/null || echo "0")
    CODEC=$(echo "$SHM_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('codec','unknown'))" 2>/dev/null || echo "unknown")
    if [[ "$BITRATE" -gt 0 ]]; then
        check "SHM player state: codec=$CODEC bitrate=${BITRATE}Kbps" "PASS"
    else
        check "SHM player state exists but bitrate=0" "WARN"
    fi
else
    check "SHM player state not created yet — bridge has no data" "WARN"
fi

# ─── Layer 6: Bitrate demand ────────────────────────────────────────────────
echo -e "\n${CYAN}── Layer 6: Bitrate Demand Engine ──${NC}"
DEMAND_EXISTS=$(ssh -o ConnectTimeout=5 "$VPS" "test -f /dev/shm/ape_bitrate_demand.json && echo YES || echo NO" 2>/dev/null)
if [[ "$DEMAND_EXISTS" == "YES" ]]; then
    DEMAND=$(ssh -o ConnectTimeout=5 "$VPS" "python3 -c \"
import json
with open('/dev/shm/ape_bitrate_demand.json') as f:
    d = json.load(f)
print(f'{d.get(\"demand_mbps\",0):.1f} Mbps')
\"" 2>/dev/null || echo "error")
    check "Bitrate demand active: $DEMAND" "PASS"
else
    check "Bitrate demand SHM not found" "FAIL"
fi

# ─── Layer 7: PRISMA health ─────────────────────────────────────────────────
echo -e "\n${CYAN}── Layer 7: PRISMA Health Endpoint ──${NC}"
PRISMA_DATA=$(ssh -o ConnectTimeout=5 "$VPS" "curl -sk https://iptv-ape.duckdns.org/prisma/api/prisma-health.php 2>/dev/null" || echo '{}')
if [[ -n "$PRISMA_DATA" && "$PRISMA_DATA" != "{}" ]]; then
    PLAYER_SOURCE=$(echo "$PRISMA_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('player_telemetry',{}).get('source','none'))" 2>/dev/null || echo "error")
    STREAM_BR=$(echo "$PRISMA_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('player_telemetry',{}).get('streamBitrate',0))" 2>/dev/null || echo "0")

    if [[ "$PLAYER_SOURCE" != "none" && "$STREAM_BR" != "0" ]]; then
        check "PRISMA reading real data: source=$PLAYER_SOURCE bitrate=$STREAM_BR" "PASS"
    elif [[ "$PLAYER_SOURCE" != "none" ]]; then
        check "PRISMA source=$PLAYER_SOURCE but bitrate=$STREAM_BR" "WARN"
    else
        check "PRISMA falling back to source=none — no player data yet" "WARN"
    fi
else
    check "PRISMA health endpoint not reachable" "FAIL"
fi

# ─── Layer 8: NGINX (no regression) ─────────────────────────────────────────
echo -e "\n${CYAN}── Layer 8: NGINX Shield (no regression) ──${NC}"
NGINX_OK=$(ssh -o ConnectTimeout=5 "$VPS" "nginx -t 2>&1 | tail -1")
[[ "$NGINX_OK" == *"successful"* ]] && check "NGINX config valid" "PASS" || check "NGINX config INVALID" "FAIL"

SELF_503=$(ssh -o ConnectTimeout=5 "$VPS" "grep ' 503 ' /var/log/nginx/shield_access.log 2>/dev/null | grep 'ut=-' | wc -l")
[[ "$SELF_503" -eq 0 ]] && check "Zero self-generated 503s" "PASS" || check "Self-generated 503s: $SELF_503" "FAIL"

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e " Results: ${GREEN}$PASS PASS${NC} | ${YELLOW}$WARN WARN${NC} | ${RED}$FAIL FAIL${NC}"
echo "═══════════════════════════════════════════════════════════════"

if [[ $FAIL -eq 0 && $WARN -eq 0 ]]; then
    echo -e " ${GREEN}🎯 PERFECT — Full telemetry pipeline operational${NC}"
elif [[ $FAIL -eq 0 ]]; then
    echo -e " ${YELLOW}⚡ PARTIAL — Pipeline works but some layers need attention${NC}"
else
    echo -e " ${RED}🔴 ISSUES — Fix failures before telemetry can flow${NC}"
fi
echo ""
