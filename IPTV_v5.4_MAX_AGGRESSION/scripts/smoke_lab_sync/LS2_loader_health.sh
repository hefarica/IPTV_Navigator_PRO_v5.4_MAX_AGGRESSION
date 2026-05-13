#!/usr/bin/env bash
# LAB-SYNC v2.0 · Smoke LS2 — verifica que LabConfigLoader::health() reporta 6/6 OK
# USAGE: bash LS2_loader_health.sh
# REQUIRES: vps/prisma/lib/lab_config_loader.php desplegado en /var/www/html/prisma/lib/

set -uo pipefail

VPS_HOST="${VPS_HOST:-root@178.156.147.234}"

echo "════════════════════════════════════════════════════════════════"
echo "  LAB-SYNC v2.0 · Smoke LS2 · LabConfigLoader health() check"
echo "════════════════════════════════════════════════════════════════"
echo

OUT=$(ssh -o ConnectTimeout=5 "$VPS_HOST" "php -r '
require_once \"/var/www/html/prisma/lib/lab_config_loader.php\";
\$h = LabConfigLoader::health();
\$ok = 0; \$total = count(\$h);
foreach (\$h as \$f => \$st) {
    \$status = isset(\$st[\"status\"]) ? \$st[\"status\"] : \"unknown\";
    \$age = isset(\$st[\"age_seconds\"]) ? \$st[\"age_seconds\"] : -1;
    \$fb = isset(\$st[\"using_fallback\"]) ? (\$st[\"using_fallback\"] ? \"YES\" : \"no\") : \"?\";
    if (\$status === \"ok\") \$ok++;
    echo str_pad(\$f, 38) . \" status=\" . str_pad(\$status, 8) . \" age=\" . str_pad(\$age, 6) . \"s fallback=\" . \$fb . PHP_EOL;
}
echo PHP_EOL . \"OK: \$ok / \$total\" . PHP_EOL;
'" 2>&1)

echo "$OUT"

if echo "$OUT" | grep -q "OK: 6 / 6"; then
    echo
    echo "[✅ PASS] All 6 JSONs healthy"
    exit 0
else
    echo
    echo "[❌ FAIL] Some JSONs unhealthy or missing — VPS using fallbacks"
    exit 1
fi
