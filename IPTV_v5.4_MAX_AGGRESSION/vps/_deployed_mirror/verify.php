<?php
/**
 * ============================================
 * IPTV Navigator PRO - Verify Upload
 * ============================================
 * Checks if a file exists in /lists/
 * Used by gateway-m3u8-integrated.js precheck
 * ============================================
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: *');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

$fn = isset($_GET['filename']) ? basename($_GET['filename']) :
      (isset($_GET['file']) ? basename($_GET['file']) : '');

if (empty($fn)) {
    http_response_code(400);
    echo json_encode(['error' => 'No filename', 'exists' => false]);
    exit;
}

$fp = '/var/www/lists/' . $fn;

if (file_exists($fp)) {
    echo json_encode([
        'exists' => true,
        'ok' => true,
        'filename' => $fn,
        'size' => filesize($fp),
        'url' => 'https://iptv-ape.duckdns.org/lists/' . rawurlencode($fn)
    ]);
} else {
    http_response_code(404);
    echo json_encode(['exists' => false, 'ok' => false, 'filename' => $fn]);
}
