#!/bin/bash
set -e
BACKUP="/root/backups/prisma-v2-pre-20260428_124948"
echo "Restoring from: $BACKUP"
cp "$BACKUP/default.bak" /etc/nginx/sites-enabled/default
cp "$BACKUP/upstream_gate.lua.bak" /etc/nginx/lua/upstream_gate.lua
cp "$BACKUP/upstream_response.lua.bak" /etc/nginx/lua/upstream_response.lua
cp "$BACKUP/shield-location.conf.bak" /etc/nginx/snippets/shield-location.conf
rm -f /etc/nginx/snippets/prisma-public-api-locations.conf
rm -f /etc/nginx/conf.d/prisma-public-api-zone.conf
rm -f /etc/nginx/conf.d/prisma-floor-lock.conf
rm -f /etc/nginx/lua/sentinel_telemetry_api.lua
rm -f /etc/nginx/lua/sentinel_auth_guard.lua
rm -f /etc/nginx/lua/sentinel_ua_apply.lua
rm -f /etc/nginx/lua/floor_lock_filter.lua
rm -f /etc/nginx/lua/lab_config.lua
rm -rf /tmp/prisma-v2-*
nginx -t 2>&1 | tail -2
echo "ROLLBACK_OK"
