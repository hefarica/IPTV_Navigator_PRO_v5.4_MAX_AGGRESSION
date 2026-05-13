#!/usr/bin/env bash
# LAB-SYNC v2.0 · Smoke LS6 — Full smoke suite (corre LS1 + LS2 + LS3 + LS4 + LS5)
# USAGE: bash LS6_full_run.sh

set -uo pipefail

DIR="$(dirname "$0")"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   LAB-SYNC v2.0 · Smoke FULL Suite (LS1 → LS5)              ║"
echo "║   Doctrina: APE ENTERPRISE-GRADE Doctrine v1.0               ║"
echo "║   VPS:      Hetzner CPX21 · 178.156.147.234                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo

FAILED=0
PASSED=0

for test in LS1_jsons_present.sh LS2_loader_health.sh LS3_reactor_reads_floor.sh LS4_state_dna_integration.sh LS5_drift_detection.sh; do
    echo
    echo "▶ Running $test ..."
    echo "─────────────────────────────────────────────────────────────"
    if bash "$DIR/$test"; then
        PASSED=$((PASSED+1))
        echo "✅ $test PASSED"
    else
        FAILED=$((FAILED+1))
        echo "❌ $test FAILED"
    fi
done

echo
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     RESUMEN FINAL                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "PASSED: $PASSED"
echo "FAILED: $FAILED"
if [[ $FAILED -eq 0 ]]; then
    echo
    echo "🎉 LAB-SYNC v2.0 deployment validated end-to-end"
    echo "   Próximo Stage: FLOOR-LOCK (lee config desde JSONs ya alineados)"
    exit 0
else
    echo
    echo "🔴 LAB-SYNC v2.0 NOT ready · resolve $FAILED failures before proceeding"
    echo "   NO continuar a FLOOR-LOCK hasta tener LS1-LS5 todos PASS"
    exit 1
fi
