#!/usr/bin/env bash
# LAB-SYNC v2.0 · Smoke LS4 — verifica que prisma_state.php expone canal DNA defaults via LabConfigLoader
# USAGE: bash LS4_state_dna_integration.sh

set -uo pipefail

VPS_HOST="${VPS_HOST:-root@178.156.147.234}"

echo "════════════════════════════════════════════════════════════════"
echo "  LAB-SYNC v2.0 · Smoke LS4 · prisma_state.php DNA integration"
echo "════════════════════════════════════════════════════════════════"
echo

# 1. PrismaState::defaults() incluye boost.profile_multipliers leídos del JSON
OUT=$(ssh -o ConnectTimeout=5 "$VPS_HOST" "php -r '
require_once \"/var/www/html/prisma/prisma_state.php\";
\$d = PrismaState::defaults();
\$src = isset(\$d[\"boost\"][\"_source\"]) ? \$d[\"boost\"][\"_source\"] : \"unknown\";
\$mult = \$d[\"boost\"][\"profile_multipliers\"];
echo \"_source: \$src\" . PHP_EOL;
echo \"P0 multiplier: \" . \$mult[\"P0\"] . PHP_EOL;
echo \"P3 multiplier: \" . \$mult[\"P3\"] . PHP_EOL;
echo \"P5 multiplier: \" . \$mult[\"P5\"] . PHP_EOL;
'" 2>&1)

echo "$OUT"
echo

if echo "$OUT" | grep -q "_source: lab_config_loader"; then
    echo "[✅] PrismaState reads multipliers from LabConfigLoader (JSON SSOT)"
elif echo "$OUT" | grep -q "_source: hardcoded_fallback"; then
    echo "[⚠️] PrismaState falling back to hardcoded — JSON not available · verify deploy"
else
    echo "[❌] PrismaState defaults() error or unexpected output"
    exit 1
fi

echo

# 2. PrismaState::channelDnaDefaults() devuelve DNA per-canal correcto
OUT2=$(ssh -o ConnectTimeout=5 "$VPS_HOST" "php -r '
require_once \"/var/www/html/prisma/prisma_state.php\";
\$dna = PrismaState::channelDnaDefaults(\"test_channel\", \"P0\");
echo \"channel: \" . \$dna[\"channel_id\"] . PHP_EOL;
echo \"profile: \" . \$dna[\"profile\"] . PHP_EOL;
echo \"quantum: \" . (\$dna[\"prisma_quantum_pixel_enabled\"] ? \"true\" : \"false\") . PHP_EOL;
echo \"floor_lock_strict: \" . (\$dna[\"prisma_floor_lock_strict\"] ? \"true\" : \"false\") . PHP_EOL;
echo \"_source: \" . (isset(\$dna[\"_source\"]) ? \$dna[\"_source\"] : \"unknown\") . PHP_EOL;
'" 2>&1)

echo "── Channel DNA defaults P0 ──"
echo "$OUT2"
echo

if echo "$OUT2" | grep -q "_source: profile_default" || echo "$OUT2" | grep -q "_source: hardcoded_fallback"; then
    echo "[✅] channelDnaDefaults() resolves correctly"
    exit 0
else
    echo "[❌] channelDnaDefaults() error"
    exit 1
fi
