<?php
/**
 * ============================================
 * 📂 IPTV Navigator PRO - List Files
 * ============================================
 * Returns JSON list of .m3u8 files in /lists/
 * ============================================
 */

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$listsDir = '/var/www/lists/';

// Fallback paths
if (!is_dir($listsDir)) {
    $listsDir = '/var/www/html/lists/';
}
if (!is_dir($listsDir)) {
    $listsDir = '/var/www/iptv-ape/lists/';
}
if (!is_dir($listsDir)) {
    echo json_encode(['ok' => false, 'error' => 'Lists directory not found', 'files' => []]);
    exit;
}

$files = [];
$entries = scandir($listsDir, SCANDIR_SORT_DESCENDING);

foreach ($entries as $entry) {
    if ($entry === '.' || $entry === '..') continue;
    
    $fullPath = $listsDir . $entry;
    if (!is_file($fullPath)) continue;
    
    // Only .m3u8, .m3u, and .m3u8.gz files
    $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
    $isGzip = (bool) preg_match('/\.m3u8\.gz$/i', $entry);
    if ($ext !== 'm3u8' && $ext !== 'm3u' && !$isGzip) continue;
    
    $size = filesize($fullPath);
    $mtime = filemtime($fullPath);
    
    $files[] = [
        'filename' => $entry,
        'size' => $size,
        'size_mb' => round($size / 1024 / 1024, 1),
        'modified' => date('c', $mtime),
        'modified_ts' => $mtime,
        'url' => 'https://' . $_SERVER['HTTP_HOST'] . '/lists/' . rawurlencode($entry)
    ];
}

// Sort by modified time descending (newest first)
usort($files, function($a, $b) {
    return $b['modified_ts'] - $a['modified_ts'];
});

echo json_encode([
    'ok' => true,
    'count' => count($files),
    'files' => $files
]);
