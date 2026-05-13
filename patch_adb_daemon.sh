#!/bin/bash
# Patch prisma_adb_daemon.sh with 4 changes
FILE="/opt/prisma-adb/prisma_adb_daemon.sh"

# 1. SYNC_INTERVAL 1 → 10
sed -i 's/SYNC_INTERVAL=1$/SYNC_INTERVAL=10/' "$FILE"

# 2. always_hdr 1 → 0
sed -i '/always_hdr/s/"1"/"0"/' "$FILE"

# 3. hdr_conversion_mode 1 → 0
sed -i '/hdr_conversion_mode/s/"1"/"0"/' "$FILE"

# 4. display_color_mode 3 → 0
sed -i '/display_color_mode/s/"3"/"0"/' "$FILE"

# Also update telemetry to reflect new HDR mode
sed -i 's/"hdr_mode": "always"/"hdr_mode": "auto"/' "$FILE"

echo "=== VERIFY ==="
grep -n 'always_hdr\|hdr_conversion_mode\|display_color_mode\|SYNC_INTERVAL=\|hdr_mode' "$FILE"
