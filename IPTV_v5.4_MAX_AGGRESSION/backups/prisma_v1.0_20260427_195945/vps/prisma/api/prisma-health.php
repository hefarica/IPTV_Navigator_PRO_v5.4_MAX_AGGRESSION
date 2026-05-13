<?php
declare(strict_types=1);

/**
 * APE PRISMA v1.0 — Health Probe API
 *
 * Probes: engine files exist, ramdisk writable + free space, error_rate per lane.
 * 10s TTL cache in /dev/shm/prisma_health_cache.json
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Prisma-Key');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../prisma_state.php';

// ── Cache (10s TTL) ─────────────────────────────────────────────────────
$cacheFile = '/dev/shm/prisma_health_cache.json';
$cacheTtl  = 10;

if (is_file($cacheFile)) {
    $cacheRaw = @file_get_contents($cacheFile);
    if ($cacheRaw !== false) {
        $cacheData = json_decode($cacheRaw, true);
        if (is_array($cacheData) && (time() - ($cacheData['_cache_ts'] ?? 0)) < $cacheTtl) {
            echo $cacheRaw;
            exit;
        }
    }
}

// ── Engine probes ───────────────────────────────────────────────────────
$vpsRoot = dirname(__DIR__); // /var/www/html (or local equivalent)

$engineFiles = [
    'cmaf' => [
        'cmaf_engine/cmaf_orchestrator.php',
        'cmaf_engine/modules/cmaf_packaging_engine.php',
    ],
    'lcevc' => [
        'cmaf_engine/modules/lcevc_state_engine.php',
        'cmaf_engine/modules/lcevc_player_detector.php',
        'cmaf_engine/modules/lcevc_phase4_injector.php',
    ],
    'hdr10plus' => [
        'cmaf_engine/modules/hdr10plus_dynamic_engine.php',
    ],
    'ai_sr' => [
        'cmaf_engine/modules/ai_super_resolution_engine.php',
    ],
];

$laneEngineStatus = [];
foreach ($engineFiles as $lane => $files) {
    $missing = [];
    foreach ($files as $f) {
        $fullPath = $vpsRoot . '/' . $f;
        if (!is_file($fullPath)) {
            $missing[] = $f;
        }
    }
    $laneEngineStatus[$lane] = [
        'engines_present' => count($files) - count($missing),
        'engines_total'   => count($files),
        'missing'         => $missing,
        'ready'           => empty($missing),
    ];
}

// ── RAM disk probe ──────────────────────────────────────────────────────
$ramDisk = [
    'writable'    => is_writable('/dev/shm'),
    'free_bytes'  => 0,
    'total_bytes' => 0,
    'used_pct'    => 0,
];
if (function_exists('disk_free_space') && is_dir('/dev/shm')) {
    $free  = @disk_free_space('/dev/shm') ?: 0;
    $total = @disk_total_space('/dev/shm') ?: 1;
    $ramDisk['free_bytes']  = (int)$free;
    $ramDisk['total_bytes'] = (int)$total;
    $ramDisk['used_pct']    = $total > 0 ? round(100 * (1 - $free / $total), 1) : 0;
}

// ── State & error probe ─────────────────────────────────────────────────
$state = PrismaState::read();

$lanesStatus = [];
foreach (PrismaState::validLanes() as $lane) {
    $laneCfg = $state['lanes'][$lane] ?? [];
    $errorRate = PrismaState::errorRate60s($lane);
    $autoDisabledUntil = $laneCfg['auto_disabled_until'] ?? 0;

    $status = 'disabled';
    if (($laneCfg['global'] ?? 'off') === 'on') {
        if ($autoDisabledUntil > time()) {
            $status = 'auto_disabled';
        } elseif (!($laneEngineStatus[$lane]['ready'] ?? false)) {
            $status = 'engine_missing';
        } elseif ($errorRate > 0.1) {
            $status = 'degraded';
        } else {
            $status = 'active';
        }
    }

    $lanesStatus[$lane] = [
        'global'             => $laneCfg['global'] ?? 'off',
        'status'             => $status,
        'profiles'           => $laneCfg['profiles'] ?? [],
        'errors_60s'         => round($errorRate, 4),
        'auto_disabled_until'=> $autoDisabledUntil > time() ? $autoDisabledUntil - time() : 0,
        'engine'             => $laneEngineStatus[$lane],
    ];
}

// ── Bootstrap probe ─────────────────────────────────────────────────────
$bootstrapFile = $vpsRoot . '/prisma/prisma_bootstrap.php';
$processorFile = $vpsRoot . '/prisma/prisma_processor.php';
$userIniFile   = $vpsRoot . '/.user.ini';

$bootstrapStatus = [
    'bootstrap_exists'  => is_file($bootstrapFile),
    'processor_exists'  => is_file($processorFile),
    'user_ini_exists'   => is_file($userIniFile),
    'user_ini_correct'  => false,
];

if ($bootstrapStatus['user_ini_exists']) {
    $ini = @file_get_contents($userIniFile);
    $bootstrapStatus['user_ini_correct'] = $ini !== false && str_contains($ini, 'prisma_bootstrap.php');
}

// ── Final health verdict ────────────────────────────────────────────────
$infraOk = $bootstrapStatus['bootstrap_exists']
         && $bootstrapStatus['processor_exists']
         && $ramDisk['writable'];

$anyLaneHealthy = false;
foreach ($lanesStatus as $ls) {
    if ($ls['status'] === 'active') {
        $anyLaneHealthy = true;
        break;
    }
}

$healthy = $infraOk && (!$state['master_enabled'] || $anyLaneHealthy);

$result = [
    'healthy'            => $healthy,
    'master_enabled'     => $state['master_enabled'] ?? false,
    'lanes_any_active'   => $state['lanes_any_active'] ?? false,
    'lanes_status'       => $lanesStatus,
    'ram_disk'           => $ramDisk,
    'bootstrap'          => $bootstrapStatus,
    'version'            => $state['version'] ?? '1.0.0',
    'updated_ts'         => $state['updated_ts'] ?? 0,
    'updated_by'         => $state['updated_by'] ?? 'unknown',
    'last_panic_off_ts'  => $state['last_panic_off_ts'] ?? 0,
    'ts'                 => date('c'),
    '_cache_ts'          => time(),
];

// Write to cache
$tmp = @tempnam('/dev/shm', 'ph_');
if ($tmp !== false) {
    @file_put_contents($tmp, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    @rename($tmp, $cacheFile);
}

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
