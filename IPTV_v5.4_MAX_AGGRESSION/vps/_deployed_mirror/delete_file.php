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

// Security: only allow m3u8/m3u/gz files
// pathinfo('file.m3u8.gz') returns 'gz', so we also check the full name
$ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
$isGzM3u8 = (bool) preg_match('/\.m3u8\.gz$/i', $filename);
if (!in_array($ext, ['m3u8', 'm3u', 'gz']) && !$isGzM3u8) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Only .m3u8/.m3u/.gz files can be deleted']);
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

// ══════════════════════════════════════════════════════════════
// 🔗 AUTO-CLEANUP: Companion files (.gz ↔ .m3u8 + channels_map)
// ══════════════════════════════════════════════════════════════
$companionDeleted = [];
$totalFreed = $size;
$fileDir = dirname($filePath) . '/';

// Si borré un .m3u8, eliminar también su .m3u8.gz compañero
if (preg_match('/\.m3u8$/i', $filename)) {
    $gzCompanion = $filePath . '.gz';
    if (file_exists($gzCompanion)) {
        $gzSize = filesize($gzCompanion);
        if (unlink($gzCompanion)) {
            $totalFreed += $gzSize;
            $companionDeleted[] = basename($gzCompanion) . ' (' . round($gzSize / 1024 / 1024, 1) . ' MB)';
        }
    }
}

// Si borré un .m3u8.gz, eliminar también su .m3u8 raw compañero
if ($isGzM3u8) {
    $rawCompanion = preg_replace('/\.gz$/i', '', $filePath);
    if (file_exists($rawCompanion)) {
        $rawSize = filesize($rawCompanion);
        if (unlink($rawCompanion)) {
            $totalFreed += $rawSize;
            $companionDeleted[] = basename($rawCompanion) . ' (' . round($rawSize / 1024 / 1024, 1) . ' MB)';
        }
    }
}

// 🗺️ Limpiar channels_map.json asociado
$basename = preg_replace('/\.(m3u8\.gz|m3u8|m3u|gz)$/i', '', $filename);
$mapFilename = $basename . '.channels_map.json';
$mapPath = $fileDir . $mapFilename;

$mapDeleted = false;
if (file_exists($mapPath)) {
    $mapDeleted = unlink($mapPath);
}

$totalFreedMB = round($totalFreed / 1024 / 1024, 1);
$msg = "Deleted {$filename} ({$sizeMB} MB)";
if (!empty($companionDeleted)) {
    $msg .= " + companions: " . implode(', ', $companionDeleted);
}
if ($mapDeleted) {
    $msg .= " + channels map";
}
$msg .= ". Total freed: {$totalFreedMB} MB.";

echo json_encode([
    'ok' => true,
    'filename' => $filename,
    'size_freed' => $totalFreed,
    'size_freed_mb' => $totalFreedMB,
    'companion_deleted' => $companionDeleted,
    'map_deleted' => $mapDeleted,
    'message' => $msg
]);
