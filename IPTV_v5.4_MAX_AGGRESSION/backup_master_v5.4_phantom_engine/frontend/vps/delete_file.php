<?php
/**
 * ============================================
 * 🗑️ IPTV Navigator PRO - Delete File
 * ============================================
 * Endpoint: POST /delete_file.php
 * Body: filename=<filename>
 * Returns: { ok: bool, size_freed_mb: float }
 * ============================================
 */

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed, use POST']);
    exit;
}

$filename = isset($_POST['filename']) ? basename($_POST['filename']) : '';

if (empty($filename)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'No filename provided']);
    exit;
}

// Security: only allow m3u8/m3u files
$ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
if (!in_array($ext, ['m3u8', 'm3u'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Only .m3u8/.m3u files can be deleted']);
    exit;
}

// Search in known directories
$searchDirs = ['/var/www/lists/', '/var/www/html/lists/', '/var/www/iptv-ape/lists/'];
$found = false;
$filePath = '';

foreach ($searchDirs as $dir) {
    $candidate = $dir . $filename;
    if (file_exists($candidate) && is_file($candidate)) {
        $filePath = $candidate;
        $found = true;
        break;
    }
}

if (!$found) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'File not found', 'filename' => $filename]);
    exit;
}

$size = filesize($filePath);
$sizeMB = round($size / 1024 / 1024, 1);

if (!unlink($filePath)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to delete file', 'filename' => $filename]);
    exit;
}

// 🗺️ AUTO-CLEANUP: Delete companion channels_map.json if it exists
$basename = preg_replace('/\.m3u8$/i', '', $filename);
$mapFilename = $basename . '.channels_map.json';
$mapDir = dirname($filePath) . '/';
$mapPath = $mapDir . $mapFilename;

$mapDeleted = false;
if (file_exists($mapPath)) {
    $mapDeleted = unlink($mapPath);
}

echo json_encode([
    'ok' => true,
    'filename' => $filename,
    'size_freed' => $size,
    'size_freed_mb' => $sizeMB,
    'map_deleted' => $mapDeleted,
    'message' => "Deleted {$filename} ({$sizeMB} MB freed)" . ($mapDeleted ? " and its channels map." : ".")
]);
