<?php
declare(strict_types=1);

/**
 * Encrypted per-device token vault.
 *
 * POST /prisma/api/token-vault.php?device_id=<id>  (Bearer ARA_TOKEN)
 *   {"event_token":"...","state_token":"..."}
 * GET  /prisma/api/token-vault.php?device_id=<id>  (Bearer ARA_TOKEN)
 *
 * At rest: AES-256-GCM in /var/lib/ara/token-vault, key in
 * /etc/ara/token-vault.key. No token is written to logs.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function vault_fail(int $code, string $message): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

function vault_key(): string {
    $path = '/etc/ara/token-vault.key';
    if (!is_readable($path)) {
        vault_fail(503, 'VAULT_KEY_UNAVAILABLE');
    }
    $key = file_get_contents($path);
    if (!is_string($key) || strlen($key) !== 32) {
        vault_fail(503, 'VAULT_KEY_INVALID');
    }
    return $key;
}

function vault_decrypt(string $blob, string $key): ?array {
    $raw = base64_decode($blob, true);
    if ($raw === false || strlen($raw) < 29) {
        return null;
    }
    $iv = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $cipher = substr($raw, 28);
    $plain = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if (!is_string($plain)) {
        return null;
    }
    $data = json_decode($plain, true);
    return is_array($data) ? $data : null;
}

$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$expected = getenv('ARA_TOKEN');
if (!is_string($expected) || $expected === '') {
    vault_fail(503, 'ARA_TOKEN_REQUIRED');
}
if (!preg_match('/^Bearer\s+(.+)$/', $auth, $m) || !hash_equals($expected, $m[1])) {
    vault_fail(401, 'UNAUTHORIZED');
}

$deviceId = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)($_GET['device_id'] ?? ''));
if ($deviceId === '' || strlen($deviceId) > 128) {
    vault_fail(400, 'device_id_required');
}

$dir = '/var/lib/ara/token-vault';
if (!is_dir($dir) && !mkdir($dir, 0700, true)) {
    vault_fail(503, 'VAULT_DIR_UNAVAILABLE');
}
$file = $dir . '/' . hash('sha256', $deviceId) . '.json';
$key = vault_key();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || strlen($raw) > 8192) {
        vault_fail(413, 'BODY_TOO_LARGE');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        vault_fail(400, 'JSON_INVALID');
    }
    $event = trim((string)($data['event_token'] ?? ''));
    $state = trim((string)($data['state_token'] ?? ''));
    foreach (['event_token' => $event, 'state_token' => $state] as $name => $value) {
        if (strlen($value) < 16 || strlen($value) > 512 || preg_match('/\s/', $value)) {
            vault_fail(400, $name . '_INVALID');
        }
    }
    if ($event === $state) {
        vault_fail(400, 'TOKENS_MUST_DIFFER');
    }
    $plain = json_encode([
        'device_id' => $deviceId,
        'event_token' => $event,
        'state_token' => $state,
        'updated_at' => time(),
    ], JSON_UNESCAPED_SLASHES);
    if (!is_string($plain)) {
        vault_fail(500, 'ENCODE_FAILED');
    }
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if (!is_string($cipher)) {
        vault_fail(500, 'ENCRYPT_FAILED');
    }
    $blob = base64_encode($iv . $tag . $cipher);
    $tmp = $file . '.tmp.' . bin2hex(random_bytes(6));
    if (file_put_contents($tmp, $blob, LOCK_EX) === false) {
        vault_fail(503, 'VAULT_WRITE_FAILED');
    }
    @chmod($tmp, 0600);
    if (!rename($tmp, $file)) {
        @unlink($tmp);
        vault_fail(503, 'VAULT_COMMIT_FAILED');
    }
    @chmod($file, 0600);
    http_response_code(200);
    echo json_encode(['ok' => true, 'stored' => true], JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

if ($method === 'GET') {
    if (!is_file($file)) {
        vault_fail(404, 'NOT_FOUND');
    }
    $blob = file_get_contents($file);
    $data = is_string($blob) ? vault_decrypt($blob, $key) : null;
    if (!is_array($data)) {
        vault_fail(503, 'VAULT_DECRYPT_FAILED');
    }
    http_response_code(200);
    echo json_encode([
        'ok' => true,
        'device_id' => $data['device_id'] ?? $deviceId,
        'event_token' => $data['event_token'] ?? '',
        'state_token' => $data['state_token'] ?? '',
        'updated_at' => $data['updated_at'] ?? 0,
    ], JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

vault_fail(405, 'METHOD_NOT_ALLOWED');
