<?php
/**
 * ============================================
 * 🏥 IPTV Navigator PRO - Health Check
 * ============================================
 * Endpoint para verificar estado del VPS
 * ============================================
 */

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Verificar que el directorio de uploads existe y es escribible
$uploadDir = '/var/www/m3u8/';
$uploadsWritable = is_dir($uploadDir) && is_writable($uploadDir);

// Verificar espacio en disco
$freeSpace = disk_free_space('/var/www/');
$freeSpaceGB = round($freeSpace / 1024 / 1024 / 1024, 2);

// Verificar límites PHP
$maxUpload = ini_get('upload_max_filesize');
$maxPost = ini_get('post_max_size');
$memoryLimit = ini_get('memory_limit');

// Verificar versión PHP
$phpVersion = PHP_VERSION;

// Calcular límite real de upload
function parseSize($size) {
    $unit = strtoupper(substr($size, -1));
    $value = (int) $size;
    switch ($unit) {
        case 'G': return $value * 1024 * 1024 * 1024;
        case 'M': return $value * 1024 * 1024;
        case 'K': return $value * 1024;
        default: return $value;
    }
}

$maxUploadBytes = min(
    parseSize($maxUpload),
    parseSize($maxPost),
    parseSize($memoryLimit)
);
$maxUploadMB = round($maxUploadBytes / 1024 / 1024);

echo json_encode([
    'status' => 'ok',
    'service' => 'IPTV Navigator PRO VPS',
    'version' => '1.0.0',
    'php' => $phpVersion,
    'upload' => $maxUploadMB . 'MB',
    'upload_max' => $maxUpload,
    'post_max' => $maxPost,
    'memory' => $memoryLimit,
    'disk_free' => $freeSpaceGB . 'GB',
    'uploads_writable' => $uploadsWritable,
    'timestamp' => date('c'),
    'features' => [
        'direct_upload' => true,
        'chunked_upload' => true,
        'cors' => true,
        'versions' => true
    ]
]);
