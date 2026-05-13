<?php
/**
 * ============================================
 * 🚀 IPTV Navigator PRO - Chunk Upload
 * ============================================
 * Recibe chunks de archivos grandes
 * Diseñado para archivos >50MB
 * ============================================
 */

set_time_limit(300);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Parámetros (headers o POST)
$uploadId = $_SERVER['HTTP_X_UPLOAD_ID'] ?? $_POST['upload_id'] ?? null;
$chunkIndex = intval($_SERVER['HTTP_X_CHUNK_INDEX'] ?? $_POST['chunk_index'] ?? -1);
$totalChunks = intval($_SERVER['HTTP_X_TOTAL_CHUNKS'] ?? $_POST['total_chunks'] ?? -1);
$expectedSha256 = $_SERVER['HTTP_X_CHUNK_SHA256'] ?? $_POST['chunk_sha256'] ?? null;
$expectedMd5 = $_SERVER['HTTP_X_CHUNK_MD5'] ?? $_POST['chunk_md5'] ?? null;

if (!$uploadId || $chunkIndex < 0 || $totalChunks < 1) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing parameters: upload_id, chunk_index, total_chunks']);
    exit;
}

// Sanitizar upload_id
$uploadId = preg_replace('/[^a-zA-Z0-9_-]/', '', $uploadId);

$baseDir = __DIR__ . '/chunks/' . $uploadId;
if (!is_dir($baseDir)) {
    mkdir($baseDir, 0755, true);
}

// Recibir chunk
$chunkData = file_get_contents('php://input');

if (empty($chunkData)) {
    http_response_code(400);
    echo json_encode(['error' => 'Empty chunk data']);
    exit;
}

// 🛡️ Verificar Integridad SHA-256 (Prioridad)
if ($expectedSha256) {
    $actualSha256 = hash('sha256', $chunkData);
    if ($actualSha256 !== $expectedSha256) {
        http_response_code(400);
        echo json_encode([
            'error' => 'SHA-256 Checksum mismatch',
            'expected' => $expectedSha256,
            'actual' => $actualSha256
        ]);
        exit;
    }
}
// Fallback: Verificar MD5 si se proporcionó
elseif ($expectedMd5) {
    $actualMd5 = md5($chunkData);
    if ($actualMd5 !== $expectedMd5) {
        http_response_code(400);
        echo json_encode([
            'error' => 'MD5 Checksum mismatch',
            'expected' => $expectedMd5,
            'actual' => $actualMd5
        ]);
        exit;
    }
}

// Guardar chunk
$chunkPath = $baseDir . '/' . str_pad($chunkIndex, 6, '0', STR_PAD_LEFT) . '.part';
$written = file_put_contents($chunkPath, $chunkData);

if ($written === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to write chunk']);
    exit;
}

// Contar chunks recibidos
$receivedChunks = count(glob($baseDir . '/*.part'));

echo json_encode([
    'success' => true,
    'upload_id' => $uploadId,
    'chunk_index' => $chunkIndex,
    'chunk_size' => $written,
    'received_chunks' => $receivedChunks,
    'total_chunks' => $totalChunks,
    'complete' => $receivedChunks >= $totalChunks
]);
