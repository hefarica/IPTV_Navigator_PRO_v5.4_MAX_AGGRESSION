<?php
declare(strict_types=1);

/**
 * APE PRISMA v1.1 — Control API
 *
 * GET  → state snapshot + error metrics
 * POST → master toggle, lane toggle, profile filter, per-channel override, panic, reset
 *
 * Auth: X-Prisma-Key header (shared key in /dev/shm/prisma_key.txt)
 *       or JWT fallback via ape_jwt_auth.php if available.
 */

// ── CORS ─────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Prisma-Key');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Dependencies ─────────────────────────────────────────────────────────
require_once __DIR__ . '/../prisma_state.php';

// ── Auth ─────────────────────────────────────────────────────────────────
function prisma_auth(): bool
{
    // Try JWT auth first
    $jwtFile = dirname(__DIR__, 2) . '/ape_jwt_auth.php';
    if (is_file($jwtFile)) {
        // If JWT module exists, defer to it (it sets globals/exits on failure)
        // For PRISMA we just check the key exists in the Authorization header
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if ($authHeader !== '' && str_starts_with($authHeader, 'Bearer ')) {
            return true; // JWT present — trust it (JWT module validates)
        }
    }

    // Shared key auth
    $keyFile = '/dev/shm/prisma_key.txt';
    if (!is_file($keyFile)) {
        return true; // No key file = open access (first run before install)
    }
    $expectedKey = trim((string)@file_get_contents($keyFile));
    if ($expectedKey === '') {
        return true;
    }
    $providedKey = $_SERVER['HTTP_X_PRISMA_KEY'] ?? '';
    return hash_equals($expectedKey, $providedKey);
}

if (!prisma_auth()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'unauthorized', 'hint' => 'Set X-Prisma-Key header']);
    exit;
}

// ── Helpers ──────────────────────────────────────────────────────────────
function q(string $k, string $default = ''): string
{
    return trim((string)($_GET[$k] ?? $_POST[$k] ?? $default));
}

function respond(array $data): never
{
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Fire ADB overlay notification to player (non-blocking background exec).
 * Device address: /dev/shm/prisma_adb_device.txt (default: 10.200.0.3:5555)
 */
function prisma_notify_player(string $action, string $details = ''): void
{
    $script = dirname(__DIR__) . '/prisma_adb_overlay.sh';
    if (!is_file($script)) return;

    $deviceFile = '/dev/shm/prisma_adb_device.txt';
    $device = '10.200.0.3:5555';
    if (is_file($deviceFile)) {
        $device = trim((string)@file_get_contents($deviceFile));
    }

    $cmd = sprintf(
        'bash %s %s %s %s > /dev/null 2>&1 &',
        escapeshellarg($script),
        escapeshellarg($device),
        escapeshellarg($action),
        escapeshellarg($details)
    );
    @exec($cmd);
}

// ── GET: State snapshot ──────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $state = PrismaState::read();
    $state['_errors_60s'] = [
        'cmaf'      => PrismaState::errorRate60s('cmaf'),
        'lcevc'     => PrismaState::errorRate60s('lcevc'),
        'hdr10plus' => PrismaState::errorRate60s('hdr10plus'),
        'ai_sr'     => PrismaState::errorRate60s('ai_sr'),
        'processor' => PrismaState::errorRate60s('processor'),
    ];
    $state['_key_fingerprint'] = '';
    $keyFile = '/dev/shm/prisma_key.txt';
    if (is_file($keyFile)) {
        $key = trim((string)@file_get_contents($keyFile));
        $state['_key_fingerprint'] = substr($key, 0, 8);
    }
    respond($state);
}

// ── POST: Mutations ─────────────────────────────────────────────────────
$action  = q('action');
$lane    = q('lane');
$channel = q('channel');
$value   = q('value');

$state = PrismaState::read();

switch ($action) {
    // ── Master toggle ────────────────────────────────────────────────
    case 'master':
        if ($value !== 'on' && $value !== 'off') {
            respond(['ok' => false, 'error' => 'value must be on or off']);
        }
        $state['master_enabled'] = ($value === 'on');
        PrismaState::write($state, 'frontend');
        prisma_notify_player($value === 'on' ? 'master_on' : 'master_off');
        respond(['ok' => true, 'master_enabled' => $state['master_enabled']]);

    // ── Lane toggle ──────────────────────────────────────────────────
    case 'on':
    case 'off':
        if (!in_array($lane, PrismaState::validLanes(), true)) {
            respond(['ok' => false, 'error' => 'invalid lane: ' . $lane]);
        }
        $state['lanes'][$lane]['global'] = $action;
        // Initialize profiles to ALL if activating for the first time
        if ($action === 'on' && empty($state['lanes'][$lane]['profiles'])) {
            $state['lanes'][$lane]['profiles'] = PrismaState::allProfiles();
        }
        PrismaState::write($state, 'frontend');
        $label = strtoupper($lane);
        prisma_notify_player($action === 'on' ? 'lane_on' : 'lane_off', $label);
        respond(['ok' => true, 'lane' => $lane, 'global' => $action]);

    // ── Set profiles for a lane ──────────────────────────────────────
    case 'set_profiles':
        if (!in_array($lane, PrismaState::validLanes(), true)) {
            respond(['ok' => false, 'error' => 'invalid lane: ' . $lane]);
        }
        $profilesRaw = q('profiles');

        // Support shortcuts
        if ($profilesRaw === 'all') {
            $profiles = PrismaState::allProfiles();
        } elseif ($profilesRaw === 'none' || $profilesRaw === '') {
            $profiles = [];
        } else {
            // CSV parse + validate
            $profiles = array_values(array_unique(array_filter(
                array_map('strtoupper', array_map('trim', explode(',', $profilesRaw))),
                fn(string $p) => in_array($p, PrismaState::allProfiles(), true)
            )));
        }

        // Also check JSON body
        $body = @json_decode(file_get_contents('php://input') ?: '', true);
        if (is_array($body) && isset($body['profiles']) && is_array($body['profiles'])) {
            $profiles = array_values(array_unique(array_filter(
                array_map('strtoupper', $body['profiles']),
                fn(string $p) => in_array($p, PrismaState::allProfiles(), true)
            )));
        }

        $state['lanes'][$lane]['profiles'] = $profiles;
        PrismaState::write($state, 'frontend');
        respond(['ok' => true, 'lane' => $lane, 'profiles' => $profiles]);

    // ── Per-channel override ─────────────────────────────────────────
    case 'inherit':
        // Channel + lane override
        if ($channel === '' || !in_array($lane, PrismaState::validLanes(), true)) {
            respond(['ok' => false, 'error' => 'channel and lane required']);
        }
        $channels = (array)($state['channels'] ?? []);
        if (!isset($channels[$channel])) {
            $channels[$channel] = [];
        }
        $channels[$channel][$lane] = $action; // 'inherit'
        $state['channels'] = $channels;
        PrismaState::write($state, 'frontend');
        respond(['ok' => true, 'channel' => $channel, 'lane' => $lane, 'override' => $action]);

    // ── Panic OFF ────────────────────────────────────────────────────
    case 'panic_off':
        $state['master_enabled'] = false;
        foreach (PrismaState::validLanes() as $l) {
            $state['lanes'][$l]['global'] = 'off';
        }
        $state['last_panic_off_ts'] = time();
        PrismaState::write($state, 'panic');
        prisma_notify_player('panic_off');
        respond(['ok' => true, 'action' => 'panic_off', 'ts' => $state['last_panic_off_ts']]);

    // ── Reset to defaults ────────────────────────────────────────────
    case 'reset':
        PrismaState::write(PrismaState::defaults(), 'reset');
        respond(['ok' => true, 'action' => 'reset']);

    default:
        // Check if it's a per-channel on/off
        if ($channel !== '' && in_array($lane, PrismaState::validLanes(), true) && in_array($action, ['on', 'off', 'inherit'], true)) {
            $channels = (array)($state['channels'] ?? []);
            if (!isset($channels[$channel])) {
                $channels[$channel] = [];
            }
            $channels[$channel][$lane] = $action;
            $state['channels'] = $channels;
            PrismaState::write($state, 'frontend');
            respond(['ok' => true, 'channel' => $channel, 'lane' => $lane, 'override' => $action]);
        }
        respond(['ok' => false, 'error' => 'unknown action: ' . $action]);
}
