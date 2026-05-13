#!/usr/bin/env bash
# LAB-SYNC v2.0 · Smoke LS5 — detect drift entre LAB Excel JSON local vs VPS
# USAGE: bash LS5_drift_detection.sh
# Compara SHA-256 de cada JSON local (post-exportPrismaConfig) vs VPS

set -uo pipefail

VPS_HOST="${VPS_HOST:-root@178.156.147.234}"
LOCAL_DIR="$(dirname "$0")/../../vps/prisma/config"

echo "════════════════════════════════════════════════════════════════"
echo "  LAB-SYNC v2.0 · Smoke LS5 · Drift detection LAB ↔ VPS"
echo "════════════════════════════════════════════════════════════════"
echo "Local: $LOCAL_DIR"
echo "VPS:   $VPS_HOST:/var/www/html/prisma/config/"
echo

JSONS=(
    "floor_lock_config.json"
    "profile_boost_multipliers.json"
    "channels_prisma_dna.json"
    "sentinel_providers_map.json"
    "telescope_thresholds.json"
    "enterprise_doctrine_manifest.json"
)

DRIFT=0
SYNC=0

for f in "${JSONS[@]}"; do
    if [[ ! -f "$LOCAL_DIR/$f" ]]; then
        echo "[--] $f · LOCAL missing"
        continue
    fi

    LOCAL_SHA=$(sha256sum "$LOCAL_DIR/$f" 2>/dev/null | awk '{print $1}')
    VPS_SHA=$(ssh -o ConnectTimeout=5 "$VPS_HOST" "sha256sum /var/www/html/prisma/config/$f 2>/dev/null | awk '{print \$1}'")

    if [[ -z "$VPS_SHA" ]]; then
        echo "[❌] $f · VPS missing"
        DRIFT=$((DRIFT+1))
    elif [[ "$LOCAL_SHA" == "$VPS_SHA" ]]; then
        echo "[✅] $f · sync · ${LOCAL_SHA:0:12}"
        SYNC=$((SYNC+1))
    else
        echo "[🔴] $f · DRIFT"
        echo "     local: ${LOCAL_SHA:0:16}"
        echo "     vps:   ${VPS_SHA:0:16}"
        DRIFT=$((DRIFT+1))
    fi
done

echo
echo "Result: $SYNC in sync · $DRIFT drift"
if [[ $DRIFT -eq 0 ]]; then
    echo "[✅ PASS] LAB ↔ VPS perfect sync"
    exit 0
else
    echo "[🔴 FAIL] Drift detected · re-run scp local→VPS"
    echo "Suggested fix: scp $LOCAL_DIR/*.json $VPS_HOST:/var/www/html/prisma/config/"
    echo "Then: ssh $VPS_HOST 'chmod 644 /var/www/html/prisma/config/*.json'"
    exit 1
fi
