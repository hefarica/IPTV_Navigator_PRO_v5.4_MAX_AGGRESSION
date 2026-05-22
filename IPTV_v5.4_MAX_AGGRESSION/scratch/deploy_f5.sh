#!/bin/bash
# F5-A deploy: shadow (decision_engine) + enriched signals (observer/worker/aggregator)
# All OBSERVE-ONLY. Graceful reload (no nginx directive changed). Auto-rollback on nginx -t fail.
set -uo pipefail
TS=$(date +%Y%m%d_%H%M%S)
S=/tmp/f5stage
declare -A LIVE=(
  [decision_engine.lua]=/etc/nginx/lua/decision_engine.lua
  [qoe_server_side_observer.lua]=/etc/nginx/lua/qoe_server_side_observer.lua
  [qoe_flush_worker.lua]=/etc/nginx/lua/qoe_flush_worker.lua
  [lab_tier_qoe_aggregator.php]=/var/www/html/prisma/lib/lab_tier_qoe_aggregator.php
)
echo "=== [1] backup 4 live files (.bak_$TS) ==="
for n in "${!LIVE[@]}"; do cp -p "${LIVE[$n]}" "${LIVE[$n]}.bak_$TS" && echo "  bak: ${LIVE[$n]}.bak_$TS"; done
echo "=== [2] swap (preserve owner/perms) ==="
for n in "${!LIVE[@]}"; do cp "$S/$n" "${LIVE[$n]}" && echo "  swapped: ${LIVE[$n]}"; done
echo "=== [3] nginx -t ==="
if nginx -t 2>&1 | grep -qE "test is successful"; then
  echo "  nginx -t OK -> reload"
  nginx -s reload && echo "  reload sent"; sleep 2
  echo "  workers: $(pgrep -x nginx | wc -l)"
  echo "DEPLOY_F5_OK ts=$TS"
else
  echo "!!! nginx -t FAILED -> AUTO-ROLLBACK !!!"
  nginx -t 2>&1 | tail -3
  for n in "${!LIVE[@]}"; do cp "${LIVE[$n]}.bak_$TS" "${LIVE[$n]}" && echo "  restored: ${LIVE[$n]}"; done
  nginx -t 2>&1 | grep -qE "test is successful" && echo "  rollback verified OK (no reload)" || echo "  WARN: still failing"
  echo "DEPLOY_F5_ROLLED_BACK ts=$TS"
fi
