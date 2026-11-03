<?php
declare(strict_types=1);

/**
 * ARA-X · Bitrate telemetry endpoint (staged).
 * Auth: existing /var/www/html/ape_jwt_auth.php. Fail-closed: no token -> 401.
 * Storage: JSONL append (no DB configured on this VPS); never stores IP/UA/URL.
 * Not routed in nginx until an explicit activation task.
 */
require_once __DIR__ . '/../html/ape_jwt_auth.php';

ApeJwtAuth::guardOrDie();
$deviceId = ApeJwtAuth::currentDeviceId();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 8192) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'body_too_large']);
    exit;
}
$d = json_decode($raw, true);
if (!is_array($d)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid_json']);
    exit;
}

$ch = preg_replace('/[^A-Za-z0-9_.-]/', '', (string)($d['ch'] ?? ''));
$ch = substr($ch, 0, 80);
$kbps = (int)($d['kbps'] ?? 0);
$floor = (int)($d['floor'] ?? 0);
$ceil = (int)($d['ceil'] ?? 0);
$buf = (int)($d['buf_pct'] ?? 0);
$state = preg_replace('/[^A-Z_]/', '', (string)($d['state'] ?? 'UNKNOWN'));
$state = substr($state, 0, 32);

if ($ch === '' || $kbps <= 0 || $floor <= 0 || $ceil < $floor) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'invalid_fields']);
    exit;
}
if ($kbps > 200000 || $floor > 200000 || $ceil > 200000) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'out_of_range']);
    exit;
}

$dir = '/var/lib/ara';
if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'storage_unavailable']);
    exit;
}
$line = json_encode([
    'ts' => time(),
    'device' => $deviceId,
    'ch' => $ch,
    'kbps' => $kbps,
    'floor' => $floor,
    'ceil' => $ceil,
    'buf_pct' => max(0, min(100, $buf)),
    'state' => $state,
], JSON_UNESCAPED_SLASHES);
if ($line === false || @file_put_contents($dir . '/bitrate_series.jsonl', $line . "\n", FILE_APPEND | LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'write_failed']);
    exit;
}

http_response_code(202);
echo json_encode([
    'ok' => true,
    'stored' => true,
    'floor_kbps' => $floor,
    'ceil_kbps' => $ceil,
    'sustain_pct' => 60,
    'never_stop_filling' => false, // not claimed: no real LoadControl consumer
    'prefetch' => null,
    'max_variant' => ($kbps < $floor) ? 'force_max_available' : 'normal',
]);
