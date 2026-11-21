<?php
declare(strict_types=1);
/**
 * /ara/enroll — auto-enrolamiento WireGuard del APK (F0).
 *
 * El APK (secreto baked) hace POST {secret, device_pubkey, device_id, model}.
 * Este endpoint corre como www-data (php-fpm) y NO puede tocar /etc/wireguard ni `wg`.
 * Patron de privilegio desacoplado: valida el secreto (hash_equals, constant-time),
 * ENCOLA la solicitud en /dev/shm/ape_enroll/req-<id>.json, y hace poll por la
 * respuesta que escribe el worker root (ape-enroll-worker.py). Devuelve el config WG.
 *
 * Doctrina: autopista (no bloquea reproduccion), honesto (no inventa), seguro
 * (secreto en env del pool php-fpm, NUNCA en el repo; rotable).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function ee_fail(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(array('ok' => false, 'error' => $msg), JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') ee_fail(405, 'POST_ONLY');

// Secreto de enrolamiento: SOLO del env del pool php-fpm. Sin el → enrol deshabilitado.
$secret = getenv('APE_ENROLL_SECRET');
if (!is_string($secret) || strlen($secret) < 16) ee_fail(503, 'ENROLL_DISABLED');

$raw = file_get_contents('php://input', false, null, 0, 8192); // cap 8 KB anti-abuso
if ($raw === false || $raw === '') ee_fail(400, 'EMPTY_BODY');
$in = json_decode($raw, true);
if (!is_array($in)) ee_fail(400, 'BAD_JSON');

$given = (string)($in['secret'] ?? '');
if (!hash_equals($secret, $given)) ee_fail(401, 'BAD_SECRET');

// PublicKey WireGuard: base64 estandar de 32 bytes => 43 chars + '='
$pub = (string)($in['device_pubkey'] ?? '');
if (!preg_match('~^[A-Za-z0-9+/]{43}=$~', $pub)) ee_fail(400, 'BAD_PUBKEY');

$deviceId = preg_replace('/[^0-9A-Za-z._-]/', '', (string)($in['device_id'] ?? 'dev'));
if ($deviceId === '') $deviceId = 'dev';
$deviceId = substr($deviceId, 0, 40);
$model = preg_replace('/[^0-9A-Za-z._ -]/', '', substr((string)($in['model'] ?? ''), 0, 64));

// ── Encolar para el worker root ──────────────────────────────────────────────
$reqDir = '/dev/shm/ape_enroll';
if (!is_dir($reqDir)) { @mkdir($reqDir, 0770, true); }
if (!is_dir($reqDir) || !is_writable($reqDir)) ee_fail(500, 'QUEUE_UNAVAILABLE');

try { $id = bin2hex(random_bytes(8)); } catch (\Throwable $e) { ee_fail(500, 'RNG_FAIL'); }
$reqFile  = $reqDir . '/req-'  . $id . '.json';
$respFile = $reqDir . '/resp-' . $id . '.json';

$payload = json_encode(array(
    'id'        => $id,
    'pubkey'    => $pub,
    'device_id' => $deviceId,
    'model'     => $model,
    'remote'    => (string)($_SERVER['REMOTE_ADDR'] ?? ''),
    'ts'        => time(),
), JSON_UNESCAPED_SLASHES);

if (file_put_contents($reqFile, $payload, LOCK_EX) === false) ee_fail(500, 'QUEUE_WRITE_FAIL');

// ── Poll por la respuesta del worker (max ~6 s; el worker es sub-segundo) ─────
$deadline = microtime(true) + 6.0;
while (microtime(true) < $deadline) {
    clearstatcache(true, $respFile);
    if (is_file($respFile)) {
        $resp = file_get_contents($respFile);
        @unlink($respFile);
        $d = json_decode((string)$resp, true);
        if (is_array($d) && ($d['ok'] ?? false) === true) {
            echo json_encode($d, JSON_UNESCAPED_SLASHES) . "\n";
            exit;
        }
        ee_fail(500, is_array($d) ? (string)($d['error'] ?? 'WORKER_ERR') : 'WORKER_ERR');
    }
    usleep(150000); // 150 ms
}
// Limpieza best-effort de la solicitud huerfana
@unlink($reqFile);
ee_fail(504, 'ENROLL_TIMEOUT');
