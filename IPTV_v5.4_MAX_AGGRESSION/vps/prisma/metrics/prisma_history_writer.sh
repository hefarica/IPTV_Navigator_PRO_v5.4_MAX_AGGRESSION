#!/bin/bash
# APE TELESCOPE v2.1 — History Writer (JSONL append)
# RUNS: every 10 seconds via cron or timer
# OUTPUT: /var/log/prisma/metrics_history.jsonl (append-only)
# ROTATION: logrotate handles 24h rotation (configured separately)

HISTORY_FILE="/var/log/prisma/metrics_history.jsonl"
TELEMETRY_URL="http://127.0.0.1/prisma/api/telemetry-full"

# Ensure directory exists
mkdir -p /var/log/prisma

# Fetch current telemetry snapshot (local, < 2ms)
SNAPSHOT=$(curl -s --max-time 2 "$TELEMETRY_URL" 2>/dev/null)

if [ -n "$SNAPSHOT" ] && echo "$SNAPSHOT" | grep -q '"source"'; then
    echo "$SNAPSHOT" >> "$HISTORY_FILE"
fi

# Keep file under 50MB (safety — logrotate should handle before this)
FILE_SIZE=$(stat -c%s "$HISTORY_FILE" 2>/dev/null || echo 0)
if [ "$FILE_SIZE" -gt 52428800 ]; then
    # Truncate to last 10000 lines
    tail -10000 "$HISTORY_FILE" > "${HISTORY_FILE}.tmp"
    mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"
fi
