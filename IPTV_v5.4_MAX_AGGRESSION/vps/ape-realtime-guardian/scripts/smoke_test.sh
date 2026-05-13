#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE Real-Time Bitrate Guardian — Smoke Test
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

DURATION=${1:-300}  # Default: 5 minutes (300 seconds)
AUDIT_LOG="/var/log/ape-realtime-guardian/audit.jsonl"

echo "═══════════════════════════════════════════════════════════════"
echo "  Smoke Test — Running for ${DURATION}s..."
echo "═══════════════════════════════════════════════════════════════"

# Ensure service is running
if ! systemctl is-active --quiet ape-realtime-guardian; then
    echo "  Service not running. Starting in dry_run mode..."
    systemctl start ape-realtime-guardian
fi

# Record starting line count
START_LINES=0
if [ -f "$AUDIT_LOG" ]; then
    START_LINES=$(wc -l < "$AUDIT_LOG")
fi

echo "  Waiting ${DURATION}s for data collection..."
sleep "$DURATION"

# Check results
END_LINES=$(wc -l < "$AUDIT_LOG")
NEW_ENTRIES=$((END_LINES - START_LINES))
EXPECTED=$((DURATION * 9 / 10))  # Allow 10% tolerance

echo ""
echo "  Results:"
echo "    New audit entries: $NEW_ENTRIES"
echo "    Expected minimum: $EXPECTED"
echo "    Last 3 entries:"
tail -3 "$AUDIT_LOG" | python3 -m json.tool --compact 2>/dev/null || tail -3 "$AUDIT_LOG"

echo ""

# Check for errors in journal
ERRORS=$(journalctl -u ape-realtime-guardian --since "${DURATION}s ago" -p err --no-pager 2>/dev/null | wc -l)
echo "    Journal errors: $ERRORS"

# Verdict
if [ "$NEW_ENTRIES" -ge "$EXPECTED" ] && [ "$ERRORS" -le 5 ]; then
    echo ""
    echo "  ✅ SMOKE TEST PASSED"
    echo "═══════════════════════════════════════════════════════════════"
    exit 0
else
    echo ""
    echo "  ❌ SMOKE TEST FAILED"
    echo "    Expected >= $EXPECTED entries, got $NEW_ENTRIES"
    echo "    Errors: $ERRORS"
    echo "═══════════════════════════════════════════════════════════════"
    exit 1
fi
