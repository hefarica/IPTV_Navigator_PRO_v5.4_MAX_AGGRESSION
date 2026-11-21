<?php
/**
 * ============================================
 * 🚀 IPTV Navigator PRO - VPS Upload Endpoint
 * ============================================
 * Servidor: Hetzner VPS (178.156.147.234)
 * Funcion: Recibir archivos M3U8 desde el frontend
 * Version: 1.0.0
 * ============================================
 */

// ============================================
// CONFIGURACIÓN
// ============================================

$CONFIG = [
    'upload_dir' => '/var/www/lists/',
    'max_size' => 512 * 1024 * 1024, // 512MB
    'allowed_extensions' => ['m3u8', 'm3u', 'gz'],
    'base_url' => 'https://iptv-ape.duckdns.org',
    'versions_dir' => '/var/www/lists/versions/',
    'default_filename' => 'APE_ULTIMATE_v9.m3u8',
    'auth_token' => '',
];

// ============================================
// CORS HEADERS (OBLIGATORIO para browser)
// ============================================
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-File-Name, X-Upload-Token, Range');
header('Access-Control-Expose-Headers: Content-Length, Content-Range, ETag');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// ============================================
// FUNCIONES
// ============================================

function respond($success, $data = [], $error = null)
{
    echo json_encode([
        'success' => $success,
        'error' => $error,
        'timestamp' => date('c'),
        ...$data
    ]);
    exit;
}

function validateAuth($config)
{
    if (empty($config['auth_token'])) {
        return true; // Auth deshabilitado
    }

    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    return $token === $config['auth_token'];
}

function sanitizeFilename($filename)
{
    $filename = preg_replace('/[()]/', '', $filename);
    $filename = preg_replace('/\s+/', '_', $filename);
    $filename = preg_replace('/[^a-zA-Z0-9._-]/', '', $filename);
    $filename = preg_replace('/_+/', '_', $filename);

    // Asegurar extensión .m3u8 o .m3u8.gz
    if (!preg_match('/\.(m3u8\.gz|m3u8|m3u)$/i', $filename)) {
        $filename .= '.m3u8';
    }
    return $filename;
}

function generateVersionedFilename($baseFilename)
{
    $info = pathinfo($baseFilename);
    $timestamp = date('Ymd_His');
    return $info['filename'] . '_v' . $timestamp . '.' . ($info['extension'] ?? 'm3u8');
}

function countChannels($content)
{
    return preg_match_all('/#EXTINF:/i', $content);
}

function cleanOldVersions($versionsDir, $keepCount = 10)
{
    if (!is_dir($versionsDir))
        return 0;

    $files = glob($versionsDir . '*.m3u8');
    if (count($files) <= $keepCount)
        return 0;

    // Ordenar por fecha de modificación (más antiguo primero)
    usort($files, function ($a, $b) {
        return filemtime($a) - filemtime($b);
    });

    $toDelete = count($files) - $keepCount;
    $deleted = 0;

    for ($i = 0; $i < $toDelete; $i++) {
        if (unlink($files[$i])) {
            $deleted++;
        }
    }

    return $deleted;
}

// ============================================
// MAIN
// ============================================

// Solo POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    respond(false, [], 'Method not allowed. Use POST.');
}

// Validar auth
if (!validateAuth($CONFIG)) {
    http_response_code(401);
    respond(false, [], 'Unauthorized. Invalid auth token.');
}

// ============================================
// OBTENER CONTENIDO - DUAL MODE SIN FILE_GET_CONTENTS
// ============================================

$originalFilename_fromUpload = null;
$tmpPath = null;
$isRawBody = false;

if (!empty($_FILES['file']['tmp_name']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
    // MODO FORMDATA: Browser envía FormData
    $tmpPath = $_FILES['file']['tmp_name'];
    $originalFilename_fromUpload = $_FILES['file']['name'] ?? null;
} else {
    // MODO RAW BODY: stream a temp file
    $tmpPath = sys_get_temp_dir() . '/raw_upload_' . uniqid();
    $in = fopen('php://input', 'rb');
    $out = fopen($tmpPath, 'wb');
    stream_copy_to_stream($in, $out);
    fclose($in);
    fclose($out);
    $isRawBody = true;
}

if (!file_exists($tmpPath) || filesize($tmpPath) === 0) {
    http_response_code(400);
    respond(false, [], 'Empty body. Send M3U8 as FormData field "file" or raw body.');
}

$fileSize = filesize($tmpPath);

// Validar tamaño
if ($fileSize > $CONFIG['max_size']) {
    @unlink($tmpPath);
    http_response_code(413);
    respond(false, [], 'File too large. Max: ' . ($CONFIG['max_size'] / 1024 / 1024) . 'MB');
}

// Obtener parámetros
$strategy = $_SERVER['HTTP_X_STRATEGY'] ?? 'replace';
$customFilename = $_SERVER['HTTP_X_CUSTOM_FILENAME'] ?? '';
$originalFilename = $_SERVER['HTTP_X_FILENAME'] ?? $originalFilename_fromUpload ?? $CONFIG['default_filename'];

if (!empty($customFilename)) {
    $filename = sanitizeFilename($customFilename);
} else {
    $filename = sanitizeFilename($originalFilename);
}

// Crear directorio de versiones si no existe
if (!is_dir($CONFIG['versions_dir'])) {
    mkdir($CONFIG['versions_dir'], 0755, true);
}

// ============================================
// EJECUTAR ESTRATEGIA CON MOVE_UPLOADED_FILE
// ============================================

try {
    $mainPath = $CONFIG['upload_dir'] . $filename;
    
    // Mover archivo
    if ($isRawBody) {
        rename($tmpPath, $mainPath);
    } else {
        move_uploaded_file($tmpPath, $mainPath);
    }
    chmod($mainPath, 0644);

    // Contar canales por streaming (Regla: contar ANTES del placeholder)
    $channels = 0;
    $handle = fopen($mainPath, "r");
    if ($handle) {
        while (($line = fgets($handle)) !== false) {
            if (stripos($line, '#EXTINF:') === 0) {
                $channels++;
            }
        }
        fclose($handle);
    }

    $results = [
        'strategy' => $strategy,
        'channels' => $channels,
        'size_bytes' => $fileSize,
        'size_formatted' => round($fileSize / 1024 / 1024, 2) . ' MB',
    ];

    // GZIP STREAMING
    $gzipPath = $mainPath . '.gz';
    $gzipCmd = sprintf('gzip -9 -k -f %s 2>&1', escapeshellarg($mainPath));
    $gzipOutput = shell_exec($gzipCmd);

    $gzipOk = false;
    if (file_exists($gzipPath)) {
        $gzipSize = filesize($gzipPath);
        $gzipRatio = round((1 - $gzipSize / $fileSize) * 100, 1);
        $gzipOk = true;
        chmod($gzipPath, 0644);
        
        // REGLA 84: SIEMPRE crear el placeholder DESPUÉS de verificar que el .gz se creó exitosamente
        file_put_contents($mainPath, "#EXTM3U\n");
        
        $results['gzip'] = [
            'enabled' => true,
            'compressed_size' => $gzipSize,
            'compressed_formatted' => round($gzipSize / 1048576, 2) . ' MB',
            'ratio' => $gzipRatio . '%',
            'serving_mode' => 'gzip_static_always'
        ];
    } else {
        $results['gzip'] = ['enabled' => false, 'error' => 'Gzip failed: ' . trim($gzipOutput)];
        error_log('[GZIP-STATIC-UPLOAD] FAILED for: ' . $filename . ' | Output: ' . trim($gzipOutput));
    }

    if ($strategy === 'both' || $strategy === 'version') {
        $versionedFilename = generateVersionedFilename($filename);
        $versionPath = $CONFIG['versions_dir'] . $versionedFilename;
        copy($gzipOk ? $gzipPath : $mainPath, $versionPath . ($gzipOk ? '.gz' : ''));
        if ($gzipOk) {
            // Also copy the placeholder for the version
            file_put_contents($versionPath, "#EXTM3U\n");
        }
        
        if ($strategy === 'both') {
            cleanOldVersions($CONFIG['versions_dir'], 10);
        }
        $results['version_file'] = $versionedFilename;
        $results['version_url'] = $CONFIG['base_url'] . '/versions/' . $versionedFilename;
    }

    // ── F1.1 — matrícula de la lista al subir (aditivo, nunca rompe el upload) ──
    try {
        if (@is_file('/var/www/html/prisma/lib/list_registry.php')) {
            require_once '/var/www/html/prisma/lib/list_registry.php';
            lr_register_file($mainPath); // el .m3u8 (placeholder) — self-heal cuenta del .gz
            if (!empty($gzipOk) && @is_file($gzipPath)) { lr_register_file($gzipPath); }
            $results['registered'] = true;
        }
    } catch (\Throwable $e) {
        @error_log('[F1.1-registry] ' . $e->getMessage());
        $results['registered'] = false;
    }

    $results['main_file'] = $filename;
    $results['public_url'] = $CONFIG['base_url'] . '/lists/' . $filename;
    $results['url'] = $results['public_url']; // Compatibilidad con legacy JS

    // Éxito
    http_response_code(200);
    respond(true, $results);

} catch (Exception $e) {
    http_response_code(500);
    respond(false, [], 'Server error: ' . $e->getMessage());
}
