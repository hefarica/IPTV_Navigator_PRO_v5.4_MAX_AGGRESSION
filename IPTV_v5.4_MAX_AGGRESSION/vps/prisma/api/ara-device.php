<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  APE — ARA Device Control Plane  v1.0                                        ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Plano de control GENERICO de dispositivos Android / AndroidTV / Fire OS.    ║
 * ║  Reconoce el dispositivo conectado y permite instalarlo, actualizarlo,       ║
 * ║  reinstalarlo o desinstalarlo desde la UI.                                   ║
 * ║                                                                              ║
 * ║  Cubre: ONN 4K (arm64-v8a, AndroidTV), Fire TV Stick 4K (armeabi-v7a,        ║
 * ║  Fire OS), y cualquier otro Android, porque el APK publicado es UNIVERSAL    ║
 * ║  (lib/arm64-v8a, armeabi-v7a, x86, x86_64) y la deteccion usa getprop        ║
 * ║  genericos: ro.product.model, ro.product.manufacturer,                       ║
 * ║  ro.build.version.release, ro.build.version.sdk, ro.product.cpu.abi,         ║
 * ║  ro.board.platform, ro.build.characteristics.                                ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  ACCIONES GET (solo lectura):                                                ║
 * ║    ?action=devices   -> version objetivo + control + dispositivos            ║
 * ║    ?action=version   -> vivo vs fichero, coherencia sha256/tamano            ║
 * ║    ?action=job&id=X  -> estado de un trabajo                                 ║
 * ║  ACCIONES POST (JSON {device_id}):                                           ║
 * ║    ?action=probe | install | update | reinstall | uninstall                  ║
 * ║    -> 202 {ok, job_id}; el trabajo corre asincrono.                          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  ARQUITECTURA — DESACOPLAMIENTO DE PRIVILEGIOS (idioma de ara-enroll.php)    ║
 * ║    php-fpm corre como www-data y NO ejecuta adb (su adbkey no es la         ║
 * ║    autorizada por el dispositivo). Solo ENCOLA un fichero de trabajo.        ║
 * ║    ara-device-worker.sh corre como ROOT (clave RSA ya autorizada) y drena    ║
 * ║    la cola ejecutando adb. Este fichero NUNCA invoca adb.                    ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  DOCTRINA                                                                     ║
 * ║    FAIL-HONEST: sin dispositivo alcanzable el job termina failed con el      ║
 * ║      motivo MEDIDO (p.ej. "adb connect 10.200.0.3:5555 => No route to host").║
 * ║      Jamas se reporta exito sin verificar el versionCode instalado.          ║
 * ║    GENERICO: cero hardcode de marca, SoC, IP o serial en la logica.          ║
 * ║    NO-TOUCH: no toca nginx, ni URLs de proveedor, ni la config de WireGuard. ║
 * ║    ADB no se activa remotamente: el dispositivo debe estar ya autorizado.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * @package vps\prisma\api
 * @version 1.0.0
 * @date    2026-11-07
 */

// ─────────────────────────────────────────────────────────────────────────────
// Configuracion
// ─────────────────────────────────────────────────────────────────────────────
const DEVICES_DB     = '/var/www/html/prisma/db/ape_devices.db';
const ARA_VERSION    = '/var/www/html/ara/version.json';
const ARA_APK        = '/var/www/html/ara/agent.apk';
const APK_PACKAGE    = 'com.ape.crystalagent';   // applicationId de android/ape-crystal-agent
const JOBS_DIR       = '/dev/shm/ape_device_jobs';
const WORKER_BEAT    = '/dev/shm/ape_device_jobs/.worker_heartbeat';
const JOB_TTL        = 86400;                    // 24 h
const WORKER_STALE   = 30;                       // s sin latido => worker caido
const MAX_BODY       = 4096;

const ACTIONS_MUT = ['probe', 'install', 'update', 'reinstall', 'uninstall'];

// ─────────────────────────────────────────────────────────────────────────────
// Salida
// ─────────────────────────────────────────────────────────────────────────────
function respond(array $data, int $code = 200): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    exit;
}

function fail(string $error, string $message, int $code = 400): never
{
    respond(['ok' => false, 'error' => $error, 'message' => $message], $code);
}

// ─────────────────────────────────────────────────────────────────────────────
// CORS — solo origenes propios. Nunca '*'.
// ─────────────────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
$allowOrigins = [
    'https://iptv-ape.duckdns.org',
    'http://127.0.0.1:3090',
    'http://localhost:3090',
];
$originAllowed = ($origin !== '' && in_array($origin, $allowOrigins, true));
if ($originAllowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-APE-Key');
    header('Access-Control-Max-Age: 300');
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    http_response_code($originAllowed ? 204 : 403);
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de fichero / cola
// ─────────────────────────────────────────────────────────────────────────────
function ensure_jobs_dir(): void
{
    if (!is_dir(JOBS_DIR)) {
        @mkdir(JOBS_DIR, 0775, true);
    }
}

/** Nombre de fichero estable y seguro para un device_id arbitrario. */
function dev_slug(string $deviceId): string
{
    return substr(sha1($deviceId), 0, 16);
}

function atomic_write(string $path, string $payload): bool
{
    $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $payload) === false) {
        return false;
    }
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        return false;
    }
    return true;
}

function read_json_file(string $path): ?array
{
    if (!is_file($path)) {
        return null;
    }
    $raw = @file_get_contents($path, false, null, 0, 262144);
    if ($raw === false || $raw === '') {
        return null;
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Version objetivo (lo publicado) y coherencia con el APK servido
// ─────────────────────────────────────────────────────────────────────────────
function load_version(bool $checkApk = false): array
{
    $file = read_json_file(ARA_VERSION);
    if ($file === null) {
        return [
            'ok'      => false,
            'source'  => 'file',
            'error'   => 'VERSION_FILE_MISSING',
            'version' => null,
        ];
    }

    $version = [
        'versionCode' => isset($file['versionCode']) ? (int)$file['versionCode'] : null,
        'versionName' => isset($file['versionName']) ? (string)$file['versionName'] : null,
        'sha256'      => isset($file['sha256']) ? strtolower((string)$file['sha256']) : null,
        'size'        => isset($file['size']) ? (int)$file['size'] : null,
        'apk'         => isset($file['apk']) ? (string)$file['apk'] : '/ara/agent.apk',
        'min_android' => isset($file['min_android']) ? (int)$file['min_android'] : null,
        'package'     => isset($file['package']) ? (string)$file['package'] : APK_PACKAGE,
        'abis'        => isset($file['abis']) && is_array($file['abis']) ? array_values($file['abis']) : [],
        'repo_build'  => isset($file['repo_build']) && is_array($file['repo_build']) ? $file['repo_build'] : null,
    ];

    $out = [
        'ok'      => true,
        'source'  => 'file',
        'version' => $version,
        'apk_present' => is_file(ARA_APK),
    ];

    // Coherencia real: sha256 + tamano del APK en disco contra el manifiesto.
    // Solo cuando se pide explicitamente (leer 27 MB no va en cada /devices).
    if ($checkApk && is_file(ARA_APK)) {
        $realSize = @filesize(ARA_APK);
        $realSha  = @hash_file('sha256', ARA_APK);
        $drift    = [];
        if ($realSize === false || $version['size'] === null || (int)$realSize !== $version['size']) {
            $drift[] = 'size';
        }
        if ($realSha === false || $version['sha256'] === null || !hash_equals($version['sha256'], strtolower((string)$realSha))) {
            $drift[] = 'sha256';
        }
        $out['apk_real'] = [
            'size'   => $realSize === false ? null : (int)$realSize,
            'sha256' => $realSha === false ? null : strtolower((string)$realSha),
        ];
        $out['coherent'] = ($drift === []);
        $out['drift']    = $drift;
    }

    return $out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro (SQLite3 de PHP — el VPS NO tiene el CLI sqlite3)
// ─────────────────────────────────────────────────────────────────────────────
function load_registry(): array
{
    if (!is_file(DEVICES_DB)) {
        return [];
    }
    try {
        $db = new SQLite3(DEVICES_DB, SQLITE3_OPEN_READONLY);
        $db->busyTimeout(1500);
        $res = $db->query(
            'SELECT device_id, device_ip, player, platform, android_version, model,
                    settings_applied, chisel_port, vps_tunnel, registered_at, last_seen, notes
               FROM ape_devices
           ORDER BY last_seen DESC
              LIMIT 100'
        );
        if ($res === false) {
            $db->close();
            return [];
        }
        $rows = [];
        while (($r = $res->fetchArray(SQLITE3_ASSOC)) !== false) {
            $rows[] = $r;
        }
        $db->close();
        return $rows;
    } catch (Throwable $e) {
        return [];
    }
}

/** Estado cacheado por el worker (alcanzabilidad, transport, getprops). */
function load_device_state(string $deviceId): ?array
{
    return read_json_file(JOBS_DIR . '/state-' . dev_slug($deviceId) . '.json');
}

function worker_alive(): array
{
    $mtime = @filemtime(WORKER_BEAT);
    if ($mtime === false) {
        return ['present' => false, 'active' => false, 'age_s' => null, 'last_beat_utc' => null];
    }
    $age = time() - (int)$mtime;
    return [
        'present'       => true,
        'active'        => ($age <= WORKER_STALE),
        'age_s'         => $age,
        'last_beat_utc' => gmdate('Y-m-d\TH:i:s\Z', (int)$mtime),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Cola de trabajos
// ─────────────────────────────────────────────────────────────────────────────
function job_files(string $id): array
{
    $safe = preg_match('/^[a-f0-9]{16}$/', $id) === 1 ? $id : '';
    return [
        'safe' => $safe,
        'q'    => JOBS_DIR . '/q-' . $safe . '.json',
        's'    => JOBS_DIR . '/s-' . $safe . '.json',
        'r'    => JOBS_DIR . '/r-' . $safe . '.json',
    ];
}

function pending_job_for_device(string $deviceId): ?string
{
    ensure_jobs_dir();
    $want = dev_slug($deviceId);
    foreach ((array)@glob(JOBS_DIR . '/q-*.json') as $q) {
        $j = read_json_file((string)$q);
        if ($j !== null && ($j['device_slug'] ?? '') === $want) {
            $id = (string)($j['id'] ?? '');
            // sigue pendiente solo si aun no hay resultado
            if ($id !== '' && !is_file(JOBS_DIR . '/r-' . $id . '.json')) {
                return $id;
            }
        }
    }
    return null;
}

function queue_job(string $deviceId, string $action, array $extra = []): string
{
    ensure_jobs_dir();
    $id = bin2hex(random_bytes(8));
    $job = [
        'id'            => $id,
        'device_id'     => $deviceId,
        'device_slug'   => dev_slug($deviceId),
        'action'        => $action,
        'created_at'    => gmdate('Y-m-d\TH:i:s\Z'),
        'created_ts'    => time(),
        'package'       => (string)($extra['package'] ?? APK_PACKAGE),
        'remote_ip'     => (string)($_SERVER['REMOTE_ADDR'] ?? ''),
    ];
    $files = job_files($id);
    if (!atomic_write($files['q'], json_encode($job, JSON_UNESCAPED_SLASHES) . "\n")) {
        fail('QUEUE_WRITE_FAILED', 'No se pudo encolar el trabajo (permisos del directorio de cola).', 500);
    }
    return $id;
}

function job_status(string $id): ?array
{
    $f = job_files($id);
    if ($f['safe'] === '') {
        return null;
    }
    $q = read_json_file($f['q']);
    $s = read_json_file($f['s']);
    $r = read_json_file($f['r']);
    // Si el q- ya no esta (limpieza), el trabajo sigue siendo consultable por su
    // resultado. Solo es 404 cuando no existe NADA de ese id.
    if ($q === null && $s === null && $r === null) {
        return null;
    }

    $state = 'queued';
    $steps = [];
    $result = null;
    $started = null;
    $finished = null;

    if ($s !== null) {
        $state   = (string)($s['state'] ?? $state);
        $steps   = is_array($s['steps'] ?? null) ? $s['steps'] : [];
        $started = $s['started_at'] ?? null;
    }
    if ($r !== null) {
        $state    = (string)($r['state'] ?? 'done');
        $steps    = is_array($r['steps'] ?? null) ? $r['steps'] : $steps;
        $result   = [
            'ok'      => (bool)($r['ok'] ?? false),
            'message' => (string)($r['message'] ?? ''),
        ];
        if (isset($r['installed_before'])) {
            $result['installed_before'] = $r['installed_before'];
        }
        if (isset($r['installed_after'])) {
            $result['installed_after'] = $r['installed_after'];
        }
        $finished = $r['finished_at'] ?? null;
    }

    return [
        'id'         => $id,
        'device_id'  => (string)($q['device_id'] ?? ''),
        'action'     => (string)($q['action'] ?? ''),
        'state'      => $state,
        'created_at' => $q['created_at'] ?? null,
        'started_at' => $started,
        'finished_at'=> $finished,
        'steps'      => $steps,
        'result'     => $result,
    ];
}

function gc_jobs(): void
{
    $cut = time() - JOB_TTL;
    foreach ((array)@glob(JOBS_DIR . '/[qsr]-*.json') as $p) {
        $m = @filemtime((string)$p);
        if ($m !== false && $m < $cut) {
            @unlink((string)$p);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Autorizacion de acciones que mutan el dispositivo
// ─────────────────────────────────────────────────────────────────────────────
function authorize_mutation(): void
{
    $key = getenv('APE_DEVICE_KEY');

    // Con clave configurada: se exige siempre.
    if (is_string($key) && strlen($key) >= 16) {
        $given = (string)($_SERVER['HTTP_X_APE_KEY'] ?? '');
        if (!hash_equals($key, $given)) {
            fail('BAD_KEY', 'X-APE-Key invalida o ausente.', 401);
        }
        return;
    }

    // Sin clave: solo mismo origen (allowlist) o loopback.
    global $originAllowed;
    $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $loop   = in_array($remote, ['127.0.0.1', '::1'], true);
    if (!$originAllowed && !$loop) {
        fail(
            'FORBIDDEN',
            'Accion de dispositivo no autorizada. Define APE_DEVICE_KEY y envia X-APE-Key, o llama desde el origen propio.',
            403
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────
ensure_jobs_dir();
gc_jobs();

$action = (string)($_GET['action'] ?? '');
if ($action === '') {
    fail('NO_ACTION', 'Indica ?action=devices|version|job|probe|install|update|reinstall|uninstall', 400);
}

// ── GET ──────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    switch ($action) {
        case 'version': {
            $v = load_version(true);
            respond([
                'ok'        => (bool)($v['ok'] ?? false),
                'live'      => $v['ok'] ? $v['version'] : null,
                'file'      => $v['ok'] ? $v['version'] : null,
                'apk_real'  => $v['apk_real'] ?? null,
                'coherent'  => $v['coherent'] ?? null,
                'drift'     => $v['drift'] ?? [],
                'apk_present' => $v['apk_present'] ?? false,
                'note'      => 'live y file son el mismo manifiesto servido en /ara/version.json',
            ]);
        }

        case 'devices': {
            $v = load_version(false);
            $target = $v['ok'] ? $v['version'] : null;

            $registry = load_registry();
            $devices  = [];

            foreach ($registry as $row) {
                $deviceId = (string)($row['device_id'] ?? '');
                if ($deviceId === '') {
                    continue;
                }
                $state = load_device_state($deviceId);

                $online = false;
                $transport = null;
                $reason = 'sin medicion del worker todavia';
                $installed = null;
                $serial = null;
                $abi = null;
                $manufacturer = null;
                $characteristics = null;
                $soc = null;
                $sdk = null;

                if ($state !== null) {
                    $online    = (bool)($state['online'] ?? false);
                    $transport = $state['transport'] ?? null;
                    $reason    = (string)($state['reason'] ?? $reason);
                    $installed = $state['installed'] ?? null;
                    $serial    = $state['serial'] ?? null;
                    $abi       = $state['abi'] ?? null;
                    $manufacturer = $state['manufacturer'] ?? null;
                    $characteristics = $state['characteristics'] ?? null;
                    $soc       = $state['soc'] ?? null;
                    $sdk       = $state['sdk'] ?? null;
                }

                $devices[] = [
                    'device_id'       => $deviceId,
                    'device_ip'       => (string)($row['device_ip'] ?? ''),
                    'model'           => (string)($row['model'] ?? ''),
                    'manufacturer'    => $manufacturer,
                    'platform'        => (string)($row['platform'] ?? ''),
                    'android_version' => (string)($row['android_version'] ?? ''),
                    'sdk'             => $sdk,
                    'abi'             => $abi,
                    'soc'             => $soc,
                    'characteristics' => $characteristics,
                    'last_seen'       => (string)($row['last_seen'] ?? ''),
                    'registered'      => true,
                    'online'          => $online,
                    'transport'       => $transport,
                    'serial'          => $serial,
                    'reachable_reason'=> $reason,
                    'installed'       => $installed,
                    'target'          => $target === null ? null : [
                        'versionCode' => $target['versionCode'],
                        'versionName' => $target['versionName'],
                        'sha256'      => $target['sha256'],
                    ],
                    'package'         => APK_PACKAGE,
                ];
            }

            // Dispositivos vistos por el worker pero aun no registrados en la BD.
            foreach ((array)@glob(JOBS_DIR . '/state-*.json') as $sp) {
                $st = read_json_file((string)$sp);
                if ($st === null) {
                    continue;
                }
                $did = (string)($st['device_id'] ?? '');
                if ($did === '') {
                    continue;
                }
                $known = false;
                foreach ($devices as $d) {
                    if ($d['device_id'] === $did) {
                        $known = true;
                        break;
                    }
                }
                if ($known) {
                    continue;
                }
                $devices[] = [
                    'device_id'       => $did,
                    'device_ip'       => (string)($st['ip'] ?? ''),
                    'model'           => (string)($st['model'] ?? ''),
                    'manufacturer'    => $st['manufacturer'] ?? null,
                    'platform'        => (string)($st['platform'] ?? ''),
                    'android_version' => (string)($st['android_release'] ?? ''),
                    'sdk'             => $st['sdk'] ?? null,
                    'abi'             => $st['abi'] ?? null,
                    'soc'             => $st['soc'] ?? null,
                    'characteristics' => $st['characteristics'] ?? null,
                    'last_seen'       => (string)($st['observed_at'] ?? ''),
                    'registered'      => false,
                    'online'          => (bool)($st['online'] ?? false),
                    'transport'       => $st['transport'] ?? null,
                    'serial'          => $st['serial'] ?? null,
                    'reachable_reason'=> (string)($st['reason'] ?? ''),
                    'installed'       => $st['installed'] ?? null,
                    'target'          => $target === null ? null : [
                        'versionCode' => $target['versionCode'],
                        'versionName' => $target['versionName'],
                        'sha256'      => $target['sha256'],
                    ],
                    'package'         => APK_PACKAGE,
                ];
            }

            respond([
                'ok'      => true,
                'version' => ($target === null ? null : $target + [
                    'source'    => $v['source'],
                    'coherent'  => $v['coherent'] ?? null,
                    'apk_present' => $v['apk_present'] ?? false,
                ]),
                'control' => [
                    'adb' => [
                        'present' => is_file('/usr/bin/adb'),
                        'version' => '1.0.41',
                    ],
                    'worker' => worker_alive(),
                    'queue'  => [
                        'pending' => count((array)@glob(JOBS_DIR . '/q-*.json'))
                                     - count((array)@glob(JOBS_DIR . '/r-*.json')),
                    ],
                ],
                'devices' => $devices,
                'note'    => 'online/transport provienen de la ultima medicion del worker '
                             . '(ara-device-worker.sh). Sin worker activo no hay medicion en vivo.',
            ]);
        }

        case 'job': {
            $id = (string)($_GET['id'] ?? '');
            if ($id === '') {
                fail('NO_JOB_ID', 'Falta ?id=<job_id>', 400);
            }
            $job = job_status($id);
            if ($job === null) {
                fail('JOB_NOT_FOUND', 'No existe ese trabajo (o ya expiro a las 24 h).', 404);
            }
            respond(['ok' => true, 'job' => $job]);
        }

        default:
            fail('BAD_ACTION', 'Accion GET no soportada: ' . $action, 400);
    }
}

// ── POST ─────────────────────────────────────────────────────────────────────
if ($method === 'POST') {
    if (!in_array($action, ACTIONS_MUT, true)) {
        fail('BAD_ACTION', 'Accion POST no soportada: ' . $action, 400);
    }

    authorize_mutation();

    $raw = @file_get_contents('php://input', false, null, 0, MAX_BODY);
    $in  = ($raw === false || $raw === '') ? [] : json_decode($raw, true);
    if ($in !== null && !is_array($in)) {
        fail('BAD_JSON', 'El cuerpo debe ser JSON {device_id}.', 400);
    }
    $in = $in ?? [];

    $deviceId = preg_replace('/[^0-9A-Za-z._:-]/', '', (string)($in['device_id'] ?? ''));
    $deviceId = substr((string)$deviceId, 0, 96);
    if ($deviceId === '') {
        fail('NO_DEVICE_ID', 'Falta device_id.', 400);
    }

    // Un solo trabajo por dispositivo a la vez.
    $pending = pending_job_for_device($deviceId);
    if ($pending !== null) {
        respond([
            'ok'      => false,
            'error'   => 'JOB_IN_PROGRESS',
            'message' => 'Ya hay un trabajo en curso para este dispositivo.',
            'job_id'  => $pending,
        ], 409);
    }

    $id = queue_job($deviceId, $action);
    respond(['ok' => true, 'job_id' => $id, 'action' => $action], 202);
}

fail('BAD_METHOD', 'Metodo no soportado: ' . $method, 405);
