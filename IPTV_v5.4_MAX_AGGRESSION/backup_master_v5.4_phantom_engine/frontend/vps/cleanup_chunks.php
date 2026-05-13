<?php
/**
 * ============================================
 * 🗑️ IPTV Navigator PRO - Chunk Cleanup
 * ============================================
 * Removes orphaned chunk directories older than
 * configured threshold (default: 24 hours)
 * 
 * Usage:
 *   php cleanup_chunks.php           # Normal run
 *   php cleanup_chunks.php --dry-run # Test mode
 * 
 * Cron Setup:
 *   0 2 * * * /usr/bin/php /var/www/html/vps/cleanup_chunks.php >> /var/log/iptv-chunk-cleanup.log 2>&1
 * ============================================
 */

set_time_limit(600);
error_reporting(E_ALL);

// Config
$chunkBaseDir = __DIR__ . '/chunks';
$maxAge = 24 * 3600; // 24 hours in seconds
$dryRun = in_array('--dry-run', $argv ?? []);

// Logging
function logMessage($msg)
{
    $timestamp = date('Y-m-d H:i:s');
    echo "[{$timestamp}] {$msg}\n";
}

logMessage("Starting chunk cleanup" . ($dryRun ? " (DRY-RUN MODE)" : ""));

if (!is_dir($chunkBaseDir)) {
    logMessage("❌ Chunk directory does not exist: {$chunkBaseDir}");
    exit(1);
}

$uploadDirs = glob($chunkBaseDir . '/*', GLOB_ONLYDIR);
$deletedCount = 0;
$keptCount = 0;
$totalFreedBytes = 0;

foreach ($uploadDirs as $dir) {
    // Get directory modification time (last chunk written)
    $mtime = filemtime($dir);
    $age = time() - $mtime;

    if ($age > $maxAge) {
        // Calculate size before deletion
        $dirSize = 0;
        $chunks = glob($dir . '/*.part');
        foreach ($chunks as $chunk) {
            $dirSize += filesize($chunk);
        }

        logMessage("🗑️ Deleting: " . basename($dir) . " (Age: " . round($age / 3600, 1) . "h, Size: " . number_format($dirSize / 1024 / 1024, 2) . " MB)");

        if (!$dryRun) {
            // Delete all .part files
            foreach ($chunks as $chunk) {
                unlink($chunk);
            }
            // Remove directory
            rmdir($dir);
        }

        $deletedCount++;
        $totalFreedBytes += $dirSize;
    } else {
        logMessage("✅ Keeping: " . basename($dir) . " (Age: " . round($age / 3600, 1) . "h)");
        $keptCount++;
    }
}

logMessage("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
logMessage("Summary:");
logMessage("  Deleted: {$deletedCount} directories");
logMessage("  Kept: {$keptCount} directories");
logMessage("  Freed: " . number_format($totalFreedBytes / 1024 / 1024, 2) . " MB");
if ($dryRun) {
    logMessage("⚠️ DRY-RUN: No actual deletions performed");
}
logMessage("Cleanup complete");
