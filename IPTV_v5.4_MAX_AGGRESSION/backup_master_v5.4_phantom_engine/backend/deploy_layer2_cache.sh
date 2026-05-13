#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# DEPLOY LAYER 2: PHP File Cache Failover in resolve.php
# ═══════════════════════════════════════════════════════════════
set -e

RESOLVE="/var/www/html/resolve.php"
CACHE_DIR="/var/cache/iptv-ape"

echo "═══ Layer 2: Adding try/catch + file cache to resolve.php ═══"

# Backup current resolve.php
cp "$RESOLVE" "${RESOLVE}.bak.$(date +%Y%m%d%H%M%S)"

# Create the PHP patch: wrap the output section in ob_start/ob_end + file cache
# We need to:
# 1. Add ob_start() before the output section
# 2. Capture output, write to cache file, then flush
# 3. Add a catch block that serves from cache on error

# Strategy: Replace the output section marker with a buffered version
# Find the line "// 8) OUTPUT M3U FRAGMENT" and wrap everything after it

python3 << 'PYEOF'
import re

with open("/var/www/html/resolve.php", "r") as f:
    content = f.read()

# Find the output section and wrap it
old_output = """// NO #EXTM3U header for patch fragments (fixes OTT Navigator 512)
echo '#EXTINF:-1 '"""

new_output = """// ═══════════════════════════════════════════════════════════════════════
// LAYER 2: PHP FILE CACHE FAILOVER
// ═══════════════════════════════════════════════════════════════════════
$cacheKey = md5($ch . '_' . $profile . '_' . $mode);
$cacheFile = '/var/cache/iptv-ape/resolve_' . $cacheKey . '.cache';

try {
    ob_start();

// NO #EXTM3U header for patch fragments (fixes OTT Navigator 512)
echo '#EXTINF:-1 '"""

# Replace
content = content.replace(old_output, new_output, 1)

# Find the stream URL echo and add cache write after it
old_url = """// Stream URL
echo $finalUrl . "\\n";"""

new_url = """// Stream URL
echo $finalUrl . "\\n";

    // Capture output and write to file cache
    $output = ob_get_flush();
    @file_put_contents($cacheFile, $output, LOCK_EX);
    header('X-Failover-Source: live');

} catch (\\Throwable $e) {
    // FAILOVER: Serve from file cache if available
    ob_end_clean();
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 300) {
        header('Content-Type: application/x-mpegURL; charset=utf-8');
        header('X-Failover-Source: file-cache');
        header('X-Cache-Age: ' . (time() - filemtime($cacheFile)));
        readfile($cacheFile);
    } else {
        http_response_code(503);
        header('X-Failover-Source: none');
        echo "# Service temporarily unavailable\\n";
    }
    exit;
}"""

content = content.replace(old_url, new_url, 1)

with open("/var/www/html/resolve.php", "w") as f:
    f.write(content)

print("✅ resolve.php patched with Layer 2 failover")
PYEOF

# Verify PHP syntax
php -l "$RESOLVE"

echo "═══ Layer 2 deployed successfully ═══"
