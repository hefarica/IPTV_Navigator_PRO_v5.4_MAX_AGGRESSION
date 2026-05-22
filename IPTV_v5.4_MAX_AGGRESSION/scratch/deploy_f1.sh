#!/bin/bash
# F1 Conviva→LAB deploy — surgical, with auto-rollback if nginx -t fails.
# Reload (graceful) — no nginx directive changed, only .lua content + new PHP/JSON.
set -uo pipefail
TS=$(date +%Y%m%d_%H%M%S)
S=/tmp/f1stage
LUA=/etc/nginx/lua
LIB=/var/www/html/prisma/lib
API=/var/www/html/prisma/api
CFG=/var/www/html/prisma/config

# Map: staged → live (the 5 existing, overwrite-in-place preserves owner/perms)
declare -A LIVE=(
  [qoe_server_side_observer.lua]=$LUA/qoe_server_side_observer.lua
  [qoe_flush_worker.lua]=$LUA/qoe_flush_worker.lua
  [lab_config.lua]=$LUA/lab_config.lua
  [conviva_persistence.php]=$LIB/conviva_persistence.php
  [qoe-flush.php]=$API/qoe-flush.php
)

echo "=== [1] backup 5 live files (.bak_$TS) ==="
for name in "${!LIVE[@]}"; do
  cp -p "${LIVE[$name]}" "${LIVE[$name]}.bak_$TS" && echo "  bak: ${LIVE[$name]}.bak_$TS"
done

echo "=== [2] swap 5 existing (preserve owner/perms) + place 2 new ==="
for name in "${!LIVE[@]}"; do
  cp "$S/$name" "${LIVE[$name]}" && echo "  swapped: ${LIVE[$name]}"
done
# New aggregator.php → match conviva_persistence.php pattern (root:www-data 644)
cp "$S/lab_tier_qoe_aggregator.php" "$LIB/lab_tier_qoe_aggregator.php"
chown root:www-data "$LIB/lab_tier_qoe_aggregator.php"; chmod 644 "$LIB/lab_tier_qoe_aggregator.php"
echo "  new: $LIB/lab_tier_qoe_aggregator.php ($(stat -c '%U:%G %a' "$LIB/lab_tier_qoe_aggregator.php"))"
# New seed json → www-data:www-data 644 (php-fpm must rewrite it atomically)
cp "$S/lab_tier_qoe_feedback.json" "$CFG/lab_tier_qoe_feedback.json"
chown www-data:www-data "$CFG/lab_tier_qoe_feedback.json"; chmod 644 "$CFG/lab_tier_qoe_feedback.json"
echo "  new: $CFG/lab_tier_qoe_feedback.json ($(stat -c '%U:%G %a' "$CFG/lab_tier_qoe_feedback.json"))"

echo "=== [3] nginx -t (LIVE config) ==="
if nginx -t 2>&1; then
  echo "=== [4] nginx -t OK → graceful reload ==="
  nginx -s reload && echo "  reload signal sent"
  sleep 2
  echo "=== [5] post-reload health ==="
  echo "  workers: $(pgrep -x nginx | wc -l)  (1 master + N workers)"
  echo "  --- last 8 error.log lines (look for NO new lua errors) ---"
  tail -8 /var/log/nginx/error.log 2>/dev/null
  echo "DEPLOY_F1_OK ts=$TS"
else
  echo "!!! nginx -t FAILED → AUTO-ROLLBACK !!!"
  for name in "${!LIVE[@]}"; do
    cp "${LIVE[$name]}.bak_$TS" "${LIVE[$name]}" && echo "  restored: ${LIVE[$name]}"
  done
  rm -f "$LIB/lab_tier_qoe_aggregator.php" "$CFG/lab_tier_qoe_feedback.json"
  echo "  removed 2 new files"
  nginx -t >/dev/null 2>&1 && echo "  rollback verified: nginx -t OK (NO reload performed)" || echo "  WARNING: nginx -t still failing after rollback — INVESTIGATE"
  echo "DEPLOY_F1_ROLLED_BACK ts=$TS"
fi
