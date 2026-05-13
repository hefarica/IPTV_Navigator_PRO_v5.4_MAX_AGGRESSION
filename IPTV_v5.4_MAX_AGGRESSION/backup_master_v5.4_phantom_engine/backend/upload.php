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
    'upload_dir' => '/mnt/data/iptv-lists/',
    'max_size' => 512 * 1024 * 1024, // 512MB
    'allowed_extensions' => ['m3u8', 'm3u', 'gz'],
    'base_url' => 'https://iptv-ape.duckdns.org',
    'versions_dir' => '/mnt/data/iptv-lists/versions/',
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
    // Eliminar caracteres peligrosos
    $filename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
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
// OBTENER CONTENIDO - DUAL MODE
// ============================================
// Modo 1: FormData/multipart (browser XHR con FormData)
// Modo 2: Raw body (curl, fetch con body directo)
$content = null;
$originalFilename_fromUpload = null;

if (!empty($_FILES['file']['tmp_name']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
    // MODO FORMDATA: Browser envía FormData con campo 'file'
    $content = file_get_contents($_FILES['file']['tmp_name']);
    $originalFilename_fromUpload = $_FILES['file']['name'] ?? null;
} else {
    // MODO RAW BODY: curl o fetch con body directo
    $content = file_get_contents('php://input');
}

if (empty($content)) {
    http_response_code(400);
    respond(false, [], 'Empty body. Send M3U8 as FormData field "file" or raw body.');
}

// Validar tamaño
if (strlen($content) > $CONFIG['max_size']) {
    http_response_code(413);
    respond(false, [], 'File too large. Max: ' . ($CONFIG['max_size'] / 1024 / 1024) . 'MB');
}

// Validar que es M3U8 (skip para archivos gzip: primeros bytes son \x1f\x8b)
$isGzipContent = (strlen($content) >= 2 && ord($content[0]) === 0x1f && ord($content[1]) === 0x8b);
if (!$isGzipContent && strpos($content, '#EXTM3U') !== 0 && strpos($content, '#EXTINF') === false) {
    http_response_code(400);
    respond(false, [], 'Invalid M3U8 content. Must start with #EXTM3U or contain #EXTINF.');
}

// Obtener parámetros
$strategy = $_SERVER['HTTP_X_STRATEGY'] ?? 'replace';
$customFilename = $_SERVER['HTTP_X_CUSTOM_FILENAME'] ?? '';
// Prioridad: header X-Filename > nombre del archivo FormData > default
$originalFilename = $_SERVER['HTTP_X_FILENAME'] ?? $originalFilename_fromUpload ?? $CONFIG['default_filename'];

// Determinar nombre de archivo
if (!empty($customFilename)) {
    $filename = sanitizeFilename($customFilename);
} else {
    $filename = sanitizeFilename($originalFilename);
}

// Crear directorio de versiones si no existe
if (!is_dir($CONFIG['versions_dir'])) {
    mkdir($CONFIG['versions_dir'], 0755, true);
}

$results = [
    'strategy' => $strategy,
    'channels' => countChannels($content),
    'size_bytes' => strlen($content),
    'size_formatted' => round(strlen($content) / 1024 / 1024, 2) . ' MB',
];

// ============================================
// EJECUTAR ESTRATEGIA
// ============================================

try {
    switch ($strategy) {
        case 'replace':
            // Solo reemplazar archivo principal
            $mainPath = $CONFIG['upload_dir'] . $filename;
            file_put_contents($mainPath, $content);
            chmod($mainPath, 0644);

            $results['main_file'] = $filename;
            $results['public_url'] = $CONFIG['base_url'] . '/lists/' . $filename;
            break;

        case 'version':
            // Solo crear versión con timestamp
            $versionedFilename = generateVersionedFilename($filename);
            $versionPath = $CONFIG['versions_dir'] . $versionedFilename;
            file_put_contents($versionPath, $content);
            chmod($versionPath, 0644);

            $results['version_file'] = $versionedFilename;
            $results['version_url'] = $CONFIG['base_url'] . '/versions/' . $versionedFilename;
            break;

        case 'both':
            // Reemplazar principal + crear versión
            $mainPath = $CONFIG['upload_dir'] . $filename;
            file_put_contents($mainPath, $content);
            chmod($mainPath, 0644);

            $versionedFilename = generateVersionedFilename($filename);
            $versionPath = $CONFIG['versions_dir'] . $versionedFilename;
            file_put_contents($versionPath, $content);
            chmod($versionPath, 0644);

            // Limpiar versiones antiguas (mantener últimas 10)
            $cleaned = cleanOldVersions($CONFIG['versions_dir'], 10);

            $results['main_file'] = $filename;
            $results['public_url'] = $CONFIG['base_url'] . '/lists/' . $filename;
            $results['version_file'] = $versionedFilename;
            $results['version_url'] = $CONFIG['base_url'] . '/versions/' . $versionedFilename;
            $results['versions_cleaned'] = $cleaned;
            break;

        default:
            http_response_code(400);
            respond(false, [], 'Invalid strategy. Use: replace, version, or both.');
    }

    // Éxito
    http_response_code(200);
    respond(true, $results);

} catch (Exception $e) {
    http_response_code(500);
    respond(false, [], 'Server error: ' . $e->getMessage());
}
