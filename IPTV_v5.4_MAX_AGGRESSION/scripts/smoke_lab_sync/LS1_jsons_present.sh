#!/usr/bin/env bash
# LAB-SYNC v2.0 · Smoke LS1 — verifica que los 6 JSONs config existen en VPS con permisos correctos
# USAGE: bash LS1_jsons_present.sh
# REQUIRES: ssh root@178.156.147.234 (configured in ssh config)

set -uo pipefail

VPS_HOST="${VPS_HOST:-root@178.156.147.234}"
CONFIG_DIR="/var/www/html/prisma/config"
EXPECTED_FILES=(
  "floor_lock_config.json"
  "profile_boost_multipliers.json"
  "channels_prisma_dna.json"
  "sentinel_providers_map.json"
  "telescope_thresholds.json"
  "enterprise_doctrine_manifest.json"
)

echo "════════════════════════════════════════════════════════════════"
echo "  LAB-SYNC v2.0 · Smoke LS1 · JSONs presence + permissions"
echo "════════════════════════════════════════════════════════════════"
echo "VPS: $VPS_HOST"
echo "Config dir: $CONFIG_DIR"
echo

PASS=0
FAIL=0

for f in "${EXPECTED_FILES[@]}"; do
    PATH_F="$CONFIG_DIR/$f"
    OUT=$(ssh -o ConnectTimeout=5 "$VPS_HOST" "ls -la '$PATH_F' 2>/dev/null && echo --- && python3 -m json.tool '$PATH_F' >/dev/null 2>&1 && echo VALID_JSON || echo CORRUPT" 2>/dev/null)

    if echo "$OUT" | grep -q "rw-r--r--"; then
        PERMS_OK="✅"
    else
        PERMS_OK="❌"
    fi

    if echo "$OUT" | grep -q "VALID_JSON"; then
        VALID_OK="✅"
    elif echo "$OUT" | grep -q "CORRUPT"; then
        VALID_OK="❌ corrupt"
    else
        VALID_OK="❌ missing"
    fi

    if [[ "$PERMS_OK" == "✅" && "$VALID_OK" == "✅" ]]; then
        echo "[PASS] $f · perms=644 · valid JSON"
        PASS=$((PASS+1))
    else
        echo "[FAIL] $f · perms=$PERMS_OK · valid=$VALID_OK"
        FAIL=$((FAIL+1))
    fi
done

echo
echo "Result: $PASS PASS · $FAIL FAIL"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
