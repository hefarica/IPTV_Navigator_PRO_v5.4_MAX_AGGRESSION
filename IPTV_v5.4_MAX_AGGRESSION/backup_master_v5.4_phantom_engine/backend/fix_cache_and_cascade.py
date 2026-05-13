#!/usr/bin/env python3
"""
Fix 1: Include list name in PHP file cache key (resolve.php)
Fix 2: Cascade delete channels_map + cache files (delete_file.php)
"""

# ═══════════════════════════════════════════════════════════════
# FIX 1: resolve.php — cache key includes list parameter
# ═══════════════════════════════════════════════════════════════
with open('/var/www/html/resolve.php', 'r') as f:
    resolve = f.read()

# The current cache key line
old_cache = "$cacheKey = md5($ch . '_' . $profile . '_' . $mode);"
new_cache = """$listParam = isset($_GET['list']) ? preg_replace('/[^A-Za-z0-9._-]/', '', $_GET['list']) : 'default';
$cacheKey = md5($listParam . '_' . $ch . '_' . $profile . '_' . $mode);"""

if old_cache in resolve:
    resolve = resolve.replace(old_cache, new_cache, 1)
    with open('/var/www/html/resolve.php', 'w') as f:
        f.write(resolve)
    print("✅ resolve.php: cache key now includes list name")
else:
    print("⚠️ resolve.php: cache key line not found (may already be patched)")

# ═══════════════════════════════════════════════════════════════
# FIX 2: delete_file.php — cascade delete channels_map + cache
# ═══════════════════════════════════════════════════════════════
with open('/var/www/html/delete_file.php', 'r') as f:
    delete_php = f.read()

# Find the success response and add cascade cleanup before it
old_success = """echo json_encode([
    'ok' => true,
    'filename' => $filename,
    'size_freed' => $size,
    'size_freed_mb' => $sizeMB,
    'message' => "Deleted {$filename} ({$sizeMB} MB freed)"
]);"""

new_success = """// ═══ CASCADE CLEANUP: Delete associated channel_map and cache files ═══
$cascadeDeleted = [];
$baseName = pathinfo($filename, PATHINFO_FILENAME);

// 1. Delete channels_map.json (mirrors the M3U8 list)
foreach ($searchDirs as $dir) {
    $mapFile = $dir . $baseName . '.channels_map.json';
    if (file_exists($mapFile)) {
        @unlink($mapFile);
        $cascadeDeleted[] = basename($mapFile);
    }
}
// Also check /var/www/html/ root for channel maps
$rootMap = '/var/www/html/' . $baseName . '.channels_map.json';
if (file_exists($rootMap)) {
    @unlink($rootMap);
    $cascadeDeleted[] = basename($rootMap);
}

// 2. Purge PHP file cache entries for this list
$cacheDir = '/var/cache/iptv-ape/';
if (is_dir($cacheDir)) {
    $cacheFiles = glob($cacheDir . 'resolve_*.cache');
    foreach ($cacheFiles as $cf) {
        // All cache files are keyed by list name, so check content
        $content = @file_get_contents($cf);
        if ($content !== false && strpos($content, $baseName) !== false) {
            @unlink($cf);
            $cascadeDeleted[] = basename($cf);
        }
    }
}

// 3. Purge Nginx fastcgi_cache (nuclear but safe)
@exec('rm -rf /var/cache/nginx/resolver/* 2>/dev/null');

echo json_encode([
    'ok' => true,
    'filename' => $filename,
    'size_freed' => $size,
    'size_freed_mb' => $sizeMB,
    'cascade_deleted' => $cascadeDeleted,
    'message' => "Deleted {$filename} ({$sizeMB} MB freed)" . (count($cascadeDeleted) > 0 ? " + " . count($cascadeDeleted) . " mirror(s)" : "")
]);"""

if old_success in delete_php:
    delete_php = delete_php.replace(old_success, new_success, 1)

    # Also allow .json files to be deleted (for manual cleanup)
    delete_php = delete_php.replace(
        "if (!in_array($ext, ['m3u8', 'm3u'])) {",
        "if (!in_array($ext, ['m3u8', 'm3u', 'json'])) {"
    )

    with open('/var/www/html/delete_file.php', 'w') as f:
        f.write(delete_php)
    print("✅ delete_file.php: cascade cleanup for channels_map + cache added")
else:
    print("⚠️ delete_file.php: success block not found")

# ═══════════════════════════════════════════════════════════════
# VERIFY
# ═══════════════════════════════════════════════════════════════
import subprocess
r1 = subprocess.run(['php', '-l', '/var/www/html/resolve.php'], capture_output=True, text=True)
r2 = subprocess.run(['php', '-l', '/var/www/html/delete_file.php'], capture_output=True, text=True)
print(f"resolve.php syntax: {r1.stdout.strip()}")
print(f"delete_file.php syntax: {r2.stdout.strip()}")
