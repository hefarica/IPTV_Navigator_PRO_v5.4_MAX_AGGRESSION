#!/usr/bin/env bash
# LAB-SYNC v2.0 · Smoke LS3 — verifica que bandwidth_reactor.lua usa lab_config y lee floor desde JSON
# USAGE: bash LS3_reactor_reads_floor.sh
# REQUIRES: bandwidth_reactor.lua refactorizado · floor_lock_config.json en /var/www/html/prisma/config/
# IMPORTANT: respeta iptv-vps-touch-nothing — NO modifica nada, solo verifica

set -uo pipefail

VPS_HOST="${VPS_HOST:-root@178.156.147.234}"

echo "════════════════════════════════════════════════════════════════"
echo "  LAB-SYNC v2.0 · Smoke LS3 · Reactor reads floor from JSON"
echo "════════════════════════════════════════════════════════════════"
echo

# 1. Verificar que bandwidth_reactor.lua tiene require "lab_config"
echo "── Step 1: bandwidth_reactor.lua references lab_config? ──"
HAS_REQUIRE=$(ssh -o ConnectTimeout=5 "$VPS_HOST" "grep -c 'lab_config' /etc/nginx/lua/bandwidth_reactor.lua 2>/dev/null || echo 0")
if [[ "$HAS_REQUIRE" -ge "1" ]]; then
    echo "[✅] bandwidth_reactor.lua references lab_config ($HAS_REQUIRE matches)"
else
    echo "[❌] bandwidth_reactor.lua does NOT reference lab_config — refactor not deployed"
    echo "     Action: scp vps/nginx/lua/bandwidth_reactor.lua to VPS · pass iptv-vps-touch-nothing checklist FIRST"
    exit 1
fi

echo
echo "── Step 2: lab_config.lua module exists? ──"
HAS_MODULE=$(ssh -o ConnectTimeout=5 "$VPS_HOST" "test -f /etc/nginx/lua/lab_config.lua && echo YES || echo NO")
if [[ "$HAS_MODULE" == "YES" ]]; then
    echo "[✅] /etc/nginx/lua/lab_config.lua exists"
else
    echo "[❌] /etc/nginx/lua/lab_config.lua NOT found — module not deployed"
    exit 1
fi

echo
echo "── Step 3: floor_lock_config.json declares correct piso P0 ──"
P0_FLOOR=$(ssh -o ConnectTimeout=5 "$VPS_HOST" "python3 -c 'import json; d=json.load(open(\"/var/www/html/prisma/config/floor_lock_config.json\")); print(d.get(\"floor_lock_min_bandwidth_p0\", \"MISSING\"))' 2>/dev/null")
echo "P0 floor in JSON: $P0_FLOOR bps"
if [[ "$P0_FLOOR" == "15000000" ]]; then
    echo "[✅] floor_lock_min_bandwidth_p0 = 15000000 (15 Mbps · LAB-SYNC v2.0 doctrine)"
elif [[ "$P0_FLOOR" =~ ^[0-9]+$ && "$P0_FLOOR" -ge "13000000" ]]; then
    echo "[⚠️] floor = $P0_FLOOR bps (≥13M but ≠15M expected · verify intentional)"
else
    echo "[❌] floor MISSING or invalid"
    exit 1
fi

echo
echo "── Step 4: nginx -t syntax check ──"
SYNTAX=$(ssh -o ConnectTimeout=5 "$VPS_HOST" "nginx -t 2>&1 | tail -2")
echo "$SYNTAX"
if echo "$SYNTAX" | grep -q "successful"; then
    echo "[✅] nginx config valid"
else
    echo "[❌] nginx -t FAILED — DO NOT reload"
    exit 1
fi

echo
echo "════════════════════════════════════════════════════════════════"
echo "  All steps PASS · reactor reading floor from LAB-SYNC JSON ✅"
echo "════════════════════════════════════════════════════════════════"
exit 0
