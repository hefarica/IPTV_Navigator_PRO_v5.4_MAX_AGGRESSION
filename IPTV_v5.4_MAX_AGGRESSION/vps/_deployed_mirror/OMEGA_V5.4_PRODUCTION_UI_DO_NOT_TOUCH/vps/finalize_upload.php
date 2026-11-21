<?php
/**
 * ============================================
 * 🚀 IPTV Navigator PRO - Finalize Chunked Upload
 * ============================================
 * Ensambla chunks y crea archivo final
 * ============================================
 */

set_time_limit(600);
ini_set('memory_limit', '512M');

header('Content-Type: application/json; charset=utf-8');

$input = json_decode(file_get_contents('php://input'), true);

$uploadId = $input['upload_id'] ?? $_POST['upload_id'] ?? null;
$filename = $input['filename'] ?? $_POST['filename'] ?? 'output.m3u8';
$strategy = $input['strategy'] ?? $_POST['strategy'] ?? 'replace';

if (!$uploadId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing upload_id']);
    exit;
}

// Sanitizar
$uploadId = preg_replace('/[^a-zA-Z0-9_-]/', '', $uploadId);
$filename = preg_replace('/[^a-zA-Z0-9._-]/', '_', basename($filename));
if (!preg_match('/\.(m3u8|m3u)$/i', $filename)) {
    $filename .= '.m3u8';
}

$chunkDir = __DIR__ . '/chunks/' . $uploadId;
$outputDir = __DIR__;  // Directorio principal para archivos M3U8

if (!is_dir($chunkDir)) {
    http_response_code(404);
    echo json_encode(['error' => 'Upload not found: ' . $uploadId]);
    exit;
}

// Obtener chunks ordenados
$parts = glob($chunkDir . '/*.part');
if (empty($parts)) {
    http_response_code(400);
    echo json_encode(['error' => 'No chunks found']);
    exit;
}
natsort($parts);
$parts = array_values($parts);

// Ensamblar archivo
$outputPath = $outputDir . '/' . $filename;
$out = fopen($outputPath, 'wb');

if (!$out) {
    http_response_code(500);
    echo json_encode(['error' => 'Cannot create output file']);
    exit;
}

$totalSize = 0;
foreach ($parts as $part) {
    $data = file_get_contents($part);
    if ($data === false) {
        fclose($out);
        http_response_code(500);
        echo json_encode(['error' => 'Failed to read chunk: ' . basename($part)]);
        exit;
    }
    fwrite($out, $data);
    $totalSize += strlen($data);
}
fclose($out);
chmod($outputPath, 0644);

// ✅ V4.28.6: Contar canales de forma eficiente (Streaming)
// Evita cargar archivos gigantes (>100MB) en RAM
$channels = 0;
$handle = fopen($outputPath, "r");
if ($handle) {
    while (($line = fgets($handle)) !== false) {
        if (stripos($line, '#EXTINF:') === 0) {
            $channels++;
        }
    }
    fclose($handle);
} else {
    // Fallback si falla el open
    $channels = -1;
}

// Limpiar chunks
foreach ($parts as $part) {
    unlink($part);
}
rmdir($chunkDir);

// ═══════════════════════════════════════
// 📦 AUTO-GZIP: Pre-comprimir para gzip_static
// gzip -9 comprime en streaming (no carga el archivo en RAM)
// El .gz se sirve directo por Nginx (zero CPU per request)
// ═══════════════════════════════════════
$gzipPath = $outputPath . '.gz';
$gzipSize = 0;
$gzipRatio = '0';
$gzipOk = false;

// Comprimir con gzip -9 -k -f (keep original, force overwrite)
// Ejecuta como proceso externo para NO cargar el archivo en memoria PHP
$gzipCmd = sprintf('gzip -9 -k -f %s 2>&1', escapeshellarg($outputPath));
$gzipOutput = shell_exec($gzipCmd);

if (file_exists($gzipPath)) {
    $gzipSize = filesize($gzipPath);
    $gzipRatio = round((1 - $gzipSize / $totalSize) * 100, 1);
    $gzipOk = true;
    chmod($gzipPath, 0644);
    
    // Log
    error_log(sprintf(
        '[GZIP-STATIC] %s: %s MB → %s MB (%s%% reducción)',
        $filename,
        round($totalSize / 1048576, 1),
        round($gzipSize / 1048576, 1),
        $gzipRatio
    ));
} else {
    error_log('[GZIP-STATIC] FAILED for: ' . $filename . ' - Output: ' . ($gzipOutput ?: 'none'));
}

// Crear versión si es necesario
$versionUrl = null;
$domain = 'https://iptv-ape.duckdns.org';

if ($strategy === 'both' || $strategy === 'version') {
    $versionsDir = __DIR__ . '/versions/';
    if (!is_dir($versionsDir)) {
        mkdir($versionsDir, 0755, true);
    }
    $info = pathinfo($filename);
    $versionFilename = $info['filename'] . '_v' . date('Ymd_His') . '.' . ($info['extension'] ?? 'm3u8');
    copy($outputPath, $versionsDir . $versionFilename);
    $versionUrl = $domain . '/versions/' . $versionFilename;
    
    // También comprimir la versión
    if ($gzipOk) {
        shell_exec(sprintf('gzip -9 -k -f %s', escapeshellarg($versionsDir . $versionFilename)));
    }
}

echo json_encode([
    'success' => true,
    'upload_id' => $uploadId,
    'filename' => $filename,
    'size_bytes' => $totalSize,
    'size_formatted' => round($totalSize / 1024 / 1024, 2) . ' MB',
    'channels' => $channels,
    'chunks_assembled' => count($parts),
    'public_url' => $domain . '/' . $filename,
    'version_url' => $versionUrl,
    'strategy' => $strategy,
    'assembly_mode' => 'stream_validated',
    // 📦 GZIP metadata
    'gzip' => [
        'enabled' => $gzipOk,
        'compressed_size' => $gzipSize,
        'compressed_formatted' => round($gzipSize / 1048576, 2) . ' MB',
        'ratio' => $gzipRatio . '%',
        'serving_mode' => 'gzip_static_always_with_gunzip_fallback'
    ]
]);

