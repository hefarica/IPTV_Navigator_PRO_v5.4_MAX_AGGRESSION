<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  APE Quality Manifest + Codec Cascade — VPS Persistence API v1.0            ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Endpoint principal del quality-manifest-widget.js para:                    ║
 * ║    • Persistir manifest de 51 settings ONN + cascada dual hvc1/hev1         ║
 * ║    • Exponer settings guardados al widget (Layer 2 fallback)                 ║
 * ║    • Reportar estado del guardian/sentinel daemon                            ║
 * ║    • Exponer canales MAX_QUALITY activos desde conviva.db                    ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  ACTIONS (GET/POST ?action=...):                                             ║
 * ║    get_manifest    GET    → lee quality-manifest.json guardado               ║
 * ║    save_manifest   POST   → escribe manifest + codec_cascade (widget save)   ║
 * ║    read_all        GET    → settings en formato real-time (Layer 1 del widget)║
 * ║    guardian_status GET    → alive/queued/worker_pending del daemon           ║
 * ║    restart_guardian POST  → trigger sentinel restart via flag file           ║
 * ║    stop_guardian   POST   → trigger sentinel stop via flag file              ║
 * ║    mq_channels     GET    → canales MAX_QUALITY activos (conviva.db)         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  STORAGE:                                                                    ║
 * ║    /var/www/html/prisma/quality-manifest.json  (manifest + cascade backup)  ║
 * ║    /dev/shm/sentinel_heartbeat.txt             (sentinel alive beacon)      ║
 * ║    /dev/shm/sentinel_cmd.txt                   (sentinel command channel)   ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  DOCTRINE:                                                                   ║
 * ║    AUTOPISTA: silently fails — widget cae a Layer 3 (embedded defaults)     ║
 * ║    NO-AUTH: solo desde frontend autenticado con CORS Origin check            ║
 * ║    GOLDEN RULE: codec_cascade preserva dual hvc1 (STREAM-INF) + hev1 (KP)  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * @package vps\prisma\api
 * @version 1.0.0
 * @date    2026-05-22
 */

// ── CORS ─────────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Prisma-Key');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-QM-API-Version: 1.0.0');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Paths ─────────────────────────────────────────────────────────────────────
// Manifest persistente — sobrevive reboots del servidor PHP y del nginx.
// El sentinel lo lee con fetch() en cada ciclo de 15s para mantener sync.
const MANIFEST_FILE  = '/var/www/html/prisma/quality-manifest.json';

// Heartbeat del daemon ONN (ape-uhdx-sentinel.sh escribe su PID aquí cada 30s)
const HEARTBEAT_FILE = '/dev/shm/sentinel_heartbeat.txt';

// Canal de comandos al sentinel (restart/stop — sentinel los lee y ejecuta)
const SENTINEL_CMD   = '/dev/shm/sentinel_cmd.txt';

// ── Helpers ───────────────────────────────────────────────────────────────────
function respond(array $data): never
{
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $error, int $code = 400): never
{
    http_response_code($code);
    respond(['ok' => false, 'error' => $error]);
}

/**
 * Lee y parsea quality-manifest.json. Retorna null si no existe o es inválido.
 */
function read_manifest_file(): ?array
{
    if (!is_file(MANIFEST_FILE)) return null;
    $raw = @file_get_contents(MANIFEST_FILE);
    if ($raw === false || $raw === '') return null;
    $doc = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($doc)) return null;
    return $doc;
}

/**
 * Escribe quality-manifest.json de forma atómica (temp + rename).
 * Retorna el SHA-256 del contenido escrito, o false en error.
 */
function write_manifest_file(array $doc): string|false
{
    $json = json_encode($doc, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) return false;
    $dir = dirname(MANIFEST_FILE);
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0755, true)) return false;
    }
    $tmp = MANIFEST_FILE . '.tmp_' . getmypid();
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) return false;
    if (!@rename($tmp, MANIFEST_FILE)) {
        @unlink($tmp);
        return false;
    }
    return hash('sha256', $json);
}

/**
 * Chequea si el sentinel daemon está vivo leyendo el archivo heartbeat.
 * El sentinel escribe: "<PID> <unix_ts>\n" cada 30s.
 * Consideramos "alive" si el heartbeat es de menos de ALIVE_THRESHOLD_S segundos.
 */
function check_sentinel_alive(): array
{
    const ALIVE_THRESHOLD_S = 120; // 2× el intervalo del sentinel (60s default)
    if (!is_file(HEARTBEAT_FILE)) {
        return ['alive' => false, 'pid' => null, 'last_beat_ago' => null];
    }
    $raw = @file_get_contents(HEARTBEAT_FILE);
    if ($raw === false || $raw === '') {
        return ['alive' => false, 'pid' => null, 'last_beat_ago' => null];
    }
    $parts = preg_split('/\s+/', trim($raw));
    $pid  = isset($parts[0]) && ctype_digit($parts[0]) ? (int)$parts[0] : null;
    $ts   = isset($parts[1]) && ctype_digit($parts[1]) ? (int)$parts[1] : null;
    $ago  = ($ts !== null) ? (time() - $ts) : null;
    $alive = ($ago !== null && $ago <= ALIVE_THRESHOLD_S);
    return ['alive' => $alive, 'pid' => $pid, 'last_beat_ago' => $ago];
}

// ── Route ─────────────────────────────────────────────────────────────────────
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = trim((string)($_GET['action'] ?? $_POST['action'] ?? ''));

// ──────────────────────────────────────────────────────────────────────────────
// ACTION: get_manifest
// Devuelve el manifest + codec_cascade guardado. Layer 2 del widget (fallback
// cuando el daemon no responde en Layer 1). Widget mapea manifest → settings[].
// ──────────────────────────────────────────────────────────────────────────────
if ($action === 'get_manifest') {
    $doc = read_manifest_file();
    if ($doc === null || empty($doc['manifest'])) {
        respond([
            'ok'       => false,
            'error'    => 'no_manifest',
            'hint'     => 'Save settings from the widget first.',
            'manifest' => [],
        ]);
    }

    // Incluir la cascada de codecs (backup para cuando localStorage se limpie).
    // El widget la puede usar para pre-poblar window.APE_HEVC_CASCADE en sesiones
    // nuevas antes de que el usuario suba el CSV manualmente.
    respond([
        'ok'                       => true,
        'manifest'                 => $doc['manifest'],
        'codec_cascade'            => $doc['codec_cascade'] ?? null,
        'codec_cascade_per_profile'=> $doc['codec_cascade_per_profile'] ?? null,
        'saved_at'                 => $doc['saved_at'] ?? null,
        'saved_by'                 => $doc['saved_by'] ?? 'widget',
        'ts'                       => $doc['ts'] ?? null,
        'total'                    => count($doc['manifest']),
    ]);
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTION: save_manifest  [POST]
// Recibe manifest + codec_cascade + codec_cascade_per_profile del widget y los
// persiste en quality-manifest.json. Es el bridge entre el widget del frontend
// y el Lua body-filter del VPS (que lee el mismo JSON via ape_codec_cascade.lua).
//
// Payload JSON:
//   {
//     "manifest": [{ns, key, value, group, label, type}, ...],
//     "codec_cascade": [{tier, codec, codec_hev1, profile, level, ...}, ...],
//     "codec_cascade_per_profile": {P0:{primary,tier,chain,...}, ...},
//     "ts": "2026-05-22T..."
//   }
// ──────────────────────────────────────────────────────────────────────────────
if ($action === 'save_manifest') {
    if ($method !== 'POST') fail('method_not_allowed', 405);

    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') fail('empty_body');

    $payload = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($payload)) fail('invalid_json');

    $manifest = $payload['manifest'] ?? null;
    if (!is_array($manifest) || count($manifest) === 0) fail('empty_manifest');

    // Validar que cada entry tiene ns + key + value (mínimo)
    $clean = [];
    foreach ($manifest as $m) {
        if (!is_array($m) || !isset($m['key'])) continue;
        $clean[] = [
            'ns'    => (string)($m['ns']    ?? 'system'),
            'key'   => (string)$m['key'],
            'value' => $m['value'] ?? '',
            'group' => (string)($m['group'] ?? 'general'),
            'label' => (string)($m['label'] ?? $m['key']),
            'type'  => (string)($m['type']  ?? 'string'),
        ];
    }
    if (count($clean) === 0) fail('no_valid_entries');

    // Construir documento a persistir
    // Incluye codec_cascade (13 tiers dual hvc1+hev1 SSOT) para que:
    //   1. ape_codec_cascade.lua la lea (via load_cascade()) en lugar del DEFAULT
    //   2. La cascada sobreviva reboots del navegador (vía get_manifest → localStorage restore)
    $doc = [
        'manifest'                  => $clean,
        'codec_cascade'             => $payload['codec_cascade'] ?? null,
        'codec_cascade_per_profile' => $payload['codec_cascade_per_profile'] ?? null,
        'saved_at'                  => date('c'),
        'saved_by'                  => $payload['saved_by'] ?? 'widget',
        'ts'                        => time(),
        'local_sync'                => (bool)($payload['local_sync'] ?? false),
    ];

    $hash = write_manifest_file($doc);
    if ($hash === false) {
        http_response_code(500);
        respond(['ok' => false, 'error' => 'write_failed', 'path' => MANIFEST_FILE]);
    }

    respond([
        'ok'            => true,
        'manifest_hash' => $hash,
        'saved_at'      => $doc['saved_at'],
        'total'         => count($clean),
        'cascade_tiers' => is_array($doc['codec_cascade']) ? count($doc['codec_cascade']) : 0,
    ]);
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTION: read_all
// Layer 1 del widget: intenta devolver settings en tiempo real del daemon.
// En el VPS no hay acceso ADB directo → sirve desde quality-manifest.json con
// status_source="vps_manifest" para que el widget lo indique en UI.
// Si no hay manifest guardado → 'ok: false' → widget cae a Layer 2 (get_manifest)
// o Layer 3 (embedded defaults).
// ──────────────────────────────────────────────────────────────────────────────
if ($action === 'read_all') {
    $doc = read_manifest_file();
    if ($doc === null || empty($doc['manifest'])) {
        // Sin manifest → widget cae a Layer 3 (embedded defaults)
        respond(['ok' => false, 'error' => 'no_manifest', 'settings' => []]);
    }

    $beat = check_sentinel_alive();

    // Mapear manifest al formato settings que el widget espera
    $settings = array_map(function ($m) {
        return [
            'ns'      => $m['ns']    ?? 'system',
            'key'     => $m['key'],
            'current' => $m['value'] ?? '',
            'expected'=> $m['value'] ?? '',
            'synced'  => true,   // desde VPS consideramos "synced" (no hay drift info)
            'group'   => $m['group'] ?? 'general',
            'label'   => $m['label'] ?? $m['key'],
            'type'    => $m['type']  ?? 'string',
            'options' => null,
        ];
    }, $doc['manifest']);

    respond([
        'ok'              => true,
        'settings'        => $settings,
        'guardian'        => ['pid' => $beat['pid'], 'alive' => $beat['alive']],
        'drift_by_group'  => [],
        'total'           => count($settings),
        'ts'              => $doc['ts'] ?? null,
        'status_source'   => 'vps_manifest',
        'last_saved_at'   => $doc['saved_at'] ?? null,
    ]);
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTION: guardian_status
// Reporta estado del daemon sentinel (ape-uhdx-sentinel.sh corriendo en el Fire TV).
// El sentinel escribe /dev/shm/sentinel_heartbeat.txt cada 30s con: "<PID> <ts>"
// El VPS puede leer este archivo si el /dev/shm está en un volume compartido
// (NFS/tmpfs, setup específico del usuario). Si no hay archivo → alive=false.
// ──────────────────────────────────────────────────────────────────────────────
if ($action === 'guardian_status') {
    $beat = check_sentinel_alive();

    // Detectar si hay comandos pendientes en la cola
    $queued = false;
    $workerPending = false;
    if (is_file(SENTINEL_CMD)) {
        $cmd = trim((string)@file_get_contents(SENTINEL_CMD));
        $queued = (preg_match('/^(restart|stop)\s+\d+$/', $cmd) === 1);
    }

    // Incluir el último diagnóstico completo del sentinel si está disponible
    $diag = null;
    $statusFile = '/dev/shm/sentinel_status.json';
    if (is_file($statusFile)) {
        $raw = @file_get_contents($statusFile);
        if ($raw !== false && $raw !== '') {
            $parsed = json_decode($raw, true);
            if (is_array($parsed)) $diag = $parsed;
        }
    }

    respond([
        'ok'            => true,
        'alive'         => $beat['alive'],
        'pid'           => $beat['pid'],
        'last_beat_ago' => $beat['last_beat_ago'],
        'queued'        => $queued,
        'worker_pending'=> $workerPending,
        'heartbeat_file'=> is_file(HEARTBEAT_FILE),
        'diagnostics'   => $diag,  // datos completos del último heartbeat
    ]);
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTION: restart_guardian  [POST]
// Escribe "restart" en SENTINEL_CMD. El sentinel lo lee y se reinicia.
// Si el sentinel no está corriendo, el flag queda como señal para el watchdog.
// ──────────────────────────────────────────────────────────────────────────────
if ($action === 'restart_guardian') {
    if ($method !== 'POST') fail('method_not_allowed', 405);

    $written = @file_put_contents(SENTINEL_CMD, 'restart ' . time() . "\n") !== false;
    respond([
        'ok'      => $written,
        'command' => 'restart',
        'queued'  => $written,
        'hint'    => $written
            ? 'restart command queued — sentinel will pick it up within 30s'
            : 'write failed — check /dev/shm permissions',
    ]);
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTION: stop_guardian  [POST]
// Escribe "stop" en SENTINEL_CMD. El sentinel lo lee y se detiene limpiamente.
// ──────────────────────────────────────────────────────────────────────────────
if ($action === 'stop_guardian') {
    if ($method !== 'POST') fail('method_not_allowed', 405);

    $written = @file_put_contents(SENTINEL_CMD, 'stop ' . time() . "\n") !== false;
    respond([
        'ok'      => $written,
        'command' => 'stop',
        'queued'  => $written,
    ]);
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTION: mq_channels
// Devuelve los canales que estuvieron en reproducción MAX_QUALITY OVERRIDE
// en la última hora (tabla max_quality_channels de conviva.db).
// Usado por el sentinel (apply_max_quality_codec_settings) para saber qué
// canales requieren ADB settings HEVC/DV adicionales en el Fire TV.
//
// Respuesta:
//   {ok:true, channels:[{channel_id, cascade_type, profile, recorded_at}]}
// ──────────────────────────────────────────────────────────────────────────────
if ($action === 'mq_channels') {
    require_once __DIR__ . '/../lib/conviva_persistence.php';
    try {
        $persist  = new ConvivaPersistence();
        $hours    = max(1, min(24, (int)($_GET['hours'] ?? 1)));
        $channels = $persist->readMaxQualityChannels($hours);
        respond([
            'ok'       => true,
            'channels' => $channels,
            'total'    => count($channels),
            'window_h' => $hours,
            'ts'       => time(),
        ]);
    } catch (Throwable $e) {
        error_log('[prisma-adb-quality] mq_channels error: ' . $e->getMessage());
        respond(['ok' => false, 'error' => 'db_error', 'channels' => []]);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTION: guardian_heartbeat  [POST]
// Recibe el beacon periódico del daemon ape-uhdx-sentinel.sh corriendo en el
// Fire TV. El sentinel lo envía cada 30-60s con datos de diagnóstico del TV:
//   {daemon, pid, mode, profile, ram_avail_mb, vpn, player, throughput_kbps,
//    packet_loss, jitter_ms, avg_rtt_ms, ai_sr_level, hdr_conversion_mode,
//    always_hdr, peak_luminance, chroma_ycbcr422, manifest_hash, uptime}
//
// Persiste los datos en HEARTBEAT_FILE (/dev/shm/sentinel_heartbeat.txt) con
// formato "<PID> <unix_ts>" para que guardian_status lo pueda leer.
// También guarda el JSON completo en un archivo de diagnóstico.
//
// RESPUESTA: incluye campo "command" (none/restart/stop) para que el sentinel
// pueda reaccionar si el usuario pulsó restart/stop en el widget.
// ──────────────────────────────────────────────────────────────────────────────
if ($action === 'guardian_heartbeat') {
    // Aceptar GET y POST (el sentinel usa POST via http_post_json)
    $raw = ($method === 'POST') ? (string)@file_get_contents('php://input') : '';
    $beat = ($raw !== '') ? (json_decode($raw, true) ?? []) : [];

    $pid   = isset($beat['pid'])   ? (int)$beat['pid']   : 0;
    $now   = time();

    // Escribir heartbeat beacon: "<PID> <ts>\n" — formato simple que
    // check_sentinel_alive() puede leer sin parsear JSON completo.
    @file_put_contents(HEARTBEAT_FILE, $pid . ' ' . $now . "\n", LOCK_EX);

    // Guardar diagnóstico completo en /dev/shm/sentinel_status.json (no es
    // persistence crítica — solo para dashboard; si falla, no es error).
    $statusFile = '/dev/shm/sentinel_status.json';
    $beat['received_at'] = $now;
    @file_put_contents($statusFile, json_encode($beat, JSON_UNESCAPED_SLASHES), LOCK_EX);
    @chmod($statusFile, 0644);

    // Verificar si hay un comando pendiente para el sentinel
    $command = 'none';
    if (is_file(SENTINEL_CMD)) {
        $cmd_raw = trim((string)@file_get_contents(SENTINEL_CMD));
        if (preg_match('/^(restart|stop)\s+(\d+)$/', $cmd_raw, $m)) {
            $cmd_time = (int)$m[2];
            // El comando es fresco (< 120s) → enviarlo al sentinel en la respuesta
            if ($now - $cmd_time < 120) {
                $command = $m[1];
                // Borrar el comando para que no se repita en el próximo heartbeat
                @file_put_contents(SENTINEL_CMD, 'none ' . $now . "\n", LOCK_EX);
            }
        }
    }

    respond([
        'ok'          => true,
        'ts'          => $now,
        'command'     => $command,  // "none" | "restart" | "stop" — sentinel lo lee
        'ack'         => true,
    ]);
}

// ──────────────────────────────────────────────────────────────────────────────
// Unknown action → 404
// ──────────────────────────────────────────────────────────────────────────────
http_response_code(404);
respond([
    'ok'             => false,
    'error'          => 'unknown_action',
    'action'         => $action,
    'valid_actions'  => [
        'get_manifest',
        'save_manifest',
        'read_all',
        'guardian_status',
        'guardian_heartbeat',
        'restart_guardian',
        'stop_guardian',
        'mq_channels',
    ],
]);
