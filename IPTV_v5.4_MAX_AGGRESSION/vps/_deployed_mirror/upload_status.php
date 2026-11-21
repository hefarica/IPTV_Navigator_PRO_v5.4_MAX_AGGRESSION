<?php
/**
 * ============================================
 * 🚀 IPTV Navigator PRO - Upload Status
 * ============================================
 * Retorna chunks ya recibidos para resume
 * ============================================
 */

header('Content-Type: application/json; charset=utf-8');

$uploadId = $_GET['upload_id'] ?? null;

if (!$uploadId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing upload_id']);
    exit;
}

// Sanitizar
$uploadId = preg_replace('/[^a-zA-Z0-9_-]/', '', $uploadId);

$dir = __DIR__ . '/chunks/' . $uploadId;

if (!is_dir($dir)) {
    echo json_encode([
        'upload_id' => $uploadId,
        'exists' => false,
        'received' => [],
        'count' => 0
    ]);
    exit;
}

$files = glob($dir . '/*.part');
$received = [];

foreach ($files as $file) {
    $basename = basename($file, '.part');
    $received[] = intval($basename);
}

sort($received);

// Calculate metadata for enhanced UX
$totalBytes = 0;
foreach ($files as $file) {
    $totalBytes += filesize($file);
}

$dirMtime = filemtime($dir);
$ageHours = round((time() - $dirMtime) / 3600, 1);

echo json_encode([
    'upload_id' => $uploadId,
    'exists' => true,
    'received' => $received,
    'count' => count($received),
    'total_bytes' => $totalBytes,
    'age_hours' => $ageHours,
    'last_modified' => date('c', $dirMtime)
]);
