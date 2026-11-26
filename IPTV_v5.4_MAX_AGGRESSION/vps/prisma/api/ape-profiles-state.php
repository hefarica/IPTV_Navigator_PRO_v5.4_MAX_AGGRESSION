<?php
/**
 * APE — estado de perfiles para el VPS (contrato minimo, fail-closed).
 *
 * GET  -> devuelve {ok, v, ts, sha256, profiles} del snapshot vigente.
 * POST -> guarda el snapshot de perfiles que el panel tiene en localStorage.
 *
 * SEGURIDAD: exige X-APE-Token igual al fichero state/profiles.token (no
 * servido por la web). Sin token, sin cuerpo valido o con esquema invalido
 * responde 4xx y NO escribe nada. Escritura atomica (tmp + rename) con
 * backup del snapshot anterior.
 *
 * Limite honesto: el token viaja en la pagina del panel, asi que es defensa
 * contra escrituras sin contexto (bots/scanners/terceros), no un secreto
 * fuerte frente a alguien que ya controla el navegador del operador.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
/* [2026-11-19] CORS para que el panel funcione tambien servido en local
 * (http://127.0.0.1:5500), donde el origen es distinto. Estas rutas no
 * exponen datos sensibles: gate-status es solo lectura y profiles-state
 * exige token. */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-APE-Token');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

const STATE_DIR   = '/var/www/html/prisma/state';
const STATE_FILE  = STATE_DIR . '/profiles_state.json';
const TOKEN_FILE  = '/etc/ara/profiles/profiles.token';
const MAX_BYTES   = 4194304;   // 4 MiB
const MAX_PROFILES= 200;

function jfail(int $code, string $msg, array $extra = []): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg] + $extra, JSON_UNESCAPED_SLASHES);
    exit;
}

if (!is_dir(STATE_DIR)) { jfail(500, 'state_dir_missing'); }
$tokenFile = TOKEN_FILE;
if (!is_readable($tokenFile)) { jfail(500, 'token_missing'); }
$expected = trim((string)file_get_contents($tokenFile));

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    if (!is_file(STATE_FILE)) { jfail(404, 'no_snapshot'); }
    $raw = (string)file_get_contents(STATE_FILE);
    $j = json_decode($raw, true);
    if (!is_array($j)) { jfail(500, 'snapshot_corrupt'); }
    echo json_encode([
        'ok' => true,
        'v' => $j['v'] ?? 1,
        'ts' => $j['ts'] ?? null,
        'sha256' => hash('sha256', $raw),
        'bytes' => strlen($raw),
        'profiles' => $j['profiles'] ?? [],
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { jfail(405, 'method_not_allowed'); }

$given = (string)($_SERVER['HTTP_X_APE_TOKEN'] ?? ($_GET['token'] ?? ''));
if ($expected === '' || !hash_equals($expected, $given)) { jfail(403, 'bad_token'); }

$raw = (string)file_get_contents('php://input');
if ($raw === '' || strlen($raw) > MAX_BYTES) { jfail(413, 'body_empty_or_too_large'); }
$body = json_decode($raw, true);
if (!is_array($body) || !isset($body['profiles']) || !is_array($body['profiles'])) { jfail(400, 'invalid_json'); }
if (count($body['profiles']) === 0 || count($body['profiles']) > MAX_PROFILES) { jfail(422, 'profile_count_out_of_range'); }

$clean = [];
foreach ($body['profiles'] as $id => $p) {
    if (!is_string($id) || !preg_match('/^[A-Za-z0-9_.-]{1,32}$/', $id)) { jfail(422, 'invalid_profile_id'); }
    if (!is_array($p) || !isset($p['settings']) || !is_array($p['settings'])) { jfail(422, 'invalid_profile_payload:' . $id); }
    $clean[$id] = $p;
}

$record = [
    'v' => 1,
    'ts' => gmdate('c'),
    'source' => isset($body['source']) && is_string($body['source']) ? substr($body['source'], 0, 64) : 'panel',
    'profiles' => $clean,
];
$json = json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($json === false) { jfail(500, 'encode_failed'); }

$tmp = STATE_FILE . '.tmp.' . getmypid();
if (@file_put_contents($tmp, $json, LOCK_EX) === false) { jfail(500, 'write_failed_tmp'); }
if (is_file(STATE_FILE)) { @copy(STATE_FILE, STATE_FILE . '.bak'); }
if (!@rename($tmp, STATE_FILE)) { @unlink($tmp); jfail(500, 'rename_failed'); }
@chmod(STATE_FILE, 0640);

echo json_encode([
    'ok' => true,
    'profiles' => count($clean),
    'bytes' => strlen($json),
    'sha256' => hash('sha256', $json),
    'ts' => $record['ts'],
], JSON_UNESCAPED_SLASHES);