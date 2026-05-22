<?php
// ═══════════════════════════════════════════════════════════════════
// APE UHDX — heartbeat sink (Nginx/PHP-FPM). NO ejecuta adb ni root.
// Recibe POST JSON del daemon ONN / watchdog y lo guarda como estado.
// Endurecido: solo POST, limite de tamano, valida JSON, sin shell.
// ═══════════════════════════════════════════════════════════════════
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

$raw = file_get_contents('php://input', false, null, 0, 65536); // cap 64KB
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'empty body']);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid json']);
    exit;
}

$data['received_at'] = date('c');
$data['remote_addr'] = $_SERVER['REMOTE_ADDR'] ?? '';

$dir = '/var/www/ape-uhdx';
if (!is_dir($dir)) { @mkdir($dir, 0755, true); }

// Nombre de archivo segun origen (daemon vs watchdog), sin path traversal.
$src = isset($data['daemon']) ? 'last-sentinel.json'
     : (isset($data['watchdog']) ? 'last-watchdog-hb.json' : 'last-heartbeat.json');

$out = $dir . '/' . $src;
$ok = @file_put_contents($out, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
@chmod($out, 0644);

echo json_encode(['ok' => ($ok !== false), 'stored' => $src, 'ts' => $data['received_at']]);
