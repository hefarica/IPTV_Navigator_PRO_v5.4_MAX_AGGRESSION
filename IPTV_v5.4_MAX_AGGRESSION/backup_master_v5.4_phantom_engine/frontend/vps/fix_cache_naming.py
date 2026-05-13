#!/usr/bin/env python3
"""
Fix cache filename to use list name as prefix for deterministic cleanup.
resolve.php: resolve_{listName}_{shortHash}.cache
delete_file.php: glob("resolve_{baseName}_*.cache") to purge
"""

# ═══════════════════════════════════════════════════════════════
# FIX resolve.php: cache filename = resolve_{listName}_{shortHash}.cache
# ═══════════════════════════════════════════════════════════════
with open('/var/www/html/resolve.php', 'r') as f:
    content = f.read()

old = """$listParam = isset($_GET['list']) ? preg_replace('/[^A-Za-z0-9._-]/', '', $_GET['list']) : 'default';
$cacheKey = md5($listParam . '_' . $ch . '_' . $profile . '_' . $mode);
$cacheFile = '/var/cache/iptv-ape/resolve_' . $cacheKey . '.cache';"""

new = """$listParam = isset($_GET['list']) ? preg_replace('/[^A-Za-z0-9._-]/', '', $_GET['list']) : 'default';
$cacheShort = substr(md5($ch . '_' . $profile . '_' . $mode), 0, 12);
$cacheFile = '/var/cache/iptv-ape/resolve_' . $listParam . '_' . $cacheShort . '.cache';"""

if old in content:
    content = content.replace(old, new, 1)
    with open('/var/www/html/resolve.php', 'w') as f:
        f.write(content)
    print("✅ resolve.php: cache file now uses listName prefix")
else:
    print("⚠️ resolve.php: target block not found")

# ═══════════════════════════════════════════════════════════════
# FIX delete_file.php: deterministic glob by list name
# ═══════════════════════════════════════════════════════════════
with open('/var/www/html/delete_file.php', 'r') as f:
    content = f.read()

old_cache_block = """// 2. Purge PHP file cache entries for this list
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
}"""

new_cache_block = """// 2. Purge PHP file cache entries for this list (deterministic by prefix)
$cacheDir = '/var/cache/iptv-ape/';
if (is_dir($cacheDir)) {
    $cachePattern = $cacheDir . 'resolve_' . $baseName . '_*.cache';
    $cacheFiles = glob($cachePattern);
    foreach ($cacheFiles as $cf) {
        @unlink($cf);
        $cascadeDeleted[] = basename($cf);
    }
}"""

if old_cache_block in content:
    content = content.replace(old_cache_block, new_cache_block, 1)
    with open('/var/www/html/delete_file.php', 'w') as f:
        f.write(content)
    print("✅ delete_file.php: deterministic glob by list name prefix")
else:
    print("⚠️ delete_file.php: target block not found")

# ═══════════════════════════════════════════════════════════════
# CLEANUP old cache files (they use old naming scheme)
# ═══════════════════════════════════════════════════════════════
import os, glob
old_caches = glob.glob('/var/cache/iptv-ape/resolve_*.cache')
for f in old_caches:
    os.unlink(f)
    print(f"  🗑️ Purged old cache: {os.path.basename(f)}")

# ═══════════════════════════════════════════════════════════════
# VERIFY
# ═══════════════════════════════════════════════════════════════
import subprocess
r1 = subprocess.run(['php', '-l', '/var/www/html/resolve.php'], capture_output=True, text=True)
r2 = subprocess.run(['php', '-l', '/var/www/html/delete_file.php'], capture_output=True, text=True)
print(f"resolve.php: {r1.stdout.strip()}")
print(f"delete_file.php: {r2.stdout.strip()}")
