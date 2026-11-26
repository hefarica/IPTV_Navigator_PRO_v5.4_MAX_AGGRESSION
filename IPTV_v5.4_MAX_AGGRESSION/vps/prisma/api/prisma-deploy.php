<?php
/**
 * APE Frontend Deploy API
 * Accepts file uploads and deploys them to the correct VPS paths.
 * 
 * POST ?action=deploy  (multipart/form-data with files)
 * GET  ?action=status   (check deployed file timestamps)
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// File routing map: filename → destination on VPS
$ROUTES = [
    'index-v4.html'              => '/var/www/html/index-v4.html',
    'quality-manifest-widget.js' => '/var/www/html/prisma/js/quality-manifest-widget.js',
    'prisma-v2ray-config.php'    => '/var/www/html/prisma/api/prisma-v2ray-config.php',
    'prisma-adb-quality.php'     => '/var/www/html/prisma/api/prisma-adb-quality.php',
    'prisma-control-widget.js'   => '/var/www/html/js/prisma-control-widget.js',
    'netshield-sentinel-widget.js' => '/var/www/html/js/netshield-sentinel-widget.js',
    'v2rayng-client-config.json' => '/var/www/html/prisma/v2rayng-client-config.json',
    'gateway-manager.js'         => '/var/www/html/js/gateway-manager.js',
];

$action = $_GET['action'] ?? '';

switch ($action) {

case 'deploy':
    if (empty($_FILES)) {
        echo json_encode(['ok' => false, 'error' => 'No files uploaded']);
        exit;
    }

    $results = [];
    foreach ($_FILES as $key => $file) {
        $name = basename($file['name']);
        $dest = $ROUTES[$name] ?? null;

        if (!$dest) {
            $results[] = ['file' => $name, 'ok' => false, 'error' => 'Unknown file — not in route map'];
            continue;
        }

        if ($file['error'] !== UPLOAD_ERR_OK) {
            $results[] = ['file' => $name, 'ok' => false, 'error' => 'Upload error: ' . $file['error']];
            continue;
        }

        // Backup current
        if (file_exists($dest)) {
            $bakDir = '/var/www/html/.deploy-backups';
            if (!is_dir($bakDir)) mkdir($bakDir, 0755, true);
            copy($dest, $bakDir . '/' . $name . '.bak.' . date('Ymd_His'));
        }

        // Deploy
        $ok = move_uploaded_file($file['tmp_name'], $dest);
        if ($ok) {
            chmod($dest, 0644);
            chown($dest, 'www-data');
        }

        $results[] = [
            'file' => $name,
            'ok' => $ok,
            'dest' => $dest,
            'size' => filesize($dest),
            'deployed_at' => date('c'),
        ];
    }

    echo json_encode([
        'ok' => !empty(array_filter($results, fn($r) => $r['ok'])),
        'deployed' => count(array_filter($results, fn($r) => $r['ok'])),
        'total' => count($results),
        'results' => $results,
    ]);
    break;

case 'status':
    $status = [];
    foreach ($ROUTES as $name => $path) {
        $status[] = [
            'file' => $name,
            'exists' => file_exists($path),
            'size' => file_exists($path) ? filesize($path) : 0,
            'modified' => file_exists($path) ? date('c', filemtime($path)) : null,
        ];
    }
    echo json_encode(['ok' => true, 'files' => $status]);
    break;

default:
    echo json_encode(['ok' => false, 'error' => 'Unknown action', 'actions' => ['deploy', 'status']]);
}
