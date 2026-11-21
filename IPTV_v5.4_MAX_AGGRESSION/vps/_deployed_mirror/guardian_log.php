<?php

/**
 * Guardian Engine v16 — Telemetry Reader API
 * Endpoint: /guardian_log.php?since=TIMESTAMP
 *
 * Reads events from /dev/shm/ape_guardian/events.jsonl (written by resolve.php)
 * Returns JSON: { stats: { dash, hls, ts, avg_probe_ms }, events: [...] }
 *
 * CORS-safe, zero-dependency, RAM-disk only (<1ms latency).
 */

declare(strict_types=1);

// ═══════════════════════════════════════════════════════════════════════════
// CORS — Allow frontend polling from any origin
// ═══════════════════════════════════════════════════════════════════════════
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept, Cache-Control');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Guardian-Version: 16.1.0');

// =========================================================================
// 🧬 QUANTUM GENETIC BRAIN: Auto-discovery + Always-On Telemetry
// =========================================================================
$metricsBase = '/dev/shm/ape_metrics';
$requestedSid = isset($_GET['sid']) && $_GET['sid'] !== '' ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$_GET['sid']) : '';

// AUTO-DISCOVER: Si no se pide un sid específico, encontrar el stream más reciente
if ($requestedSid === '' && is_dir($metricsBase)) {
    $latestTime = 0;
    $latestSid = '';
    foreach (scandir($metricsBase) as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $dnaPath = $metricsBase . '/' . $entry . '/target_dna.json';
        if (file_exists($dnaPath)) {
            $mtime = filemtime($dnaPath);
            if ($mtime > $latestTime) {
                $latestTime = $mtime;
                $latestSid = $entry;
            }
        }
    }
    $requestedSid = $latestSid;
}

if ($requestedSid !== '') {
    $telemetryDir = $metricsBase . '/' . $requestedSid;
    $telemetryFile = $telemetryDir . '/live_telemetry.jsonl';
    $dnaFile = $telemetryDir . '/target_dna.json';

    if (!file_exists($dnaFile)) {
        // En vez de hacer exit, devolvemos stats nulos pero permitimos continuar
        // para que el radar global igual se dibuje en el HUD
        $response = [
            'stats' => null,
            'biology' => null,
            'mutation' => null
        ];
        $specificStats = null;
        $biologyData = null;
        $mutationPlan = null;
    } else {

        $dna = json_decode(file_get_contents($dnaFile), true) ?: [];

        // Leer telemetría del worker si existe (streams CMAF/MPD activos)
        $avg_speed = 0;
        $lacks_history = 0;
        $current_health = 100;
        $strangle = 1.0;

        if (file_exists($telemetryFile)) {
            $lines = file($telemetryFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            $generation = array_slice($lines, -50);
            foreach ($generation as $line) {
                $gen = json_decode($line, true);
                if (!$gen) continue;
                $avg_speed += $gen['speed_kbps'] ?? 0;
                $lacks_history += $gen['micro_freezes'] ?? 0;
                $current_health = $gen['health_score'] ?? $current_health;
                $strangle = $gen['strangle_ratio'] ?? $strangle;
            }
            $gen_count = count($generation) ?: 1;
            $avg_speed = round($avg_speed / $gen_count, 2);
        }

        // Decisión Cuántica (Legacy Fallback, for UI if mutation plan missing)
        $action = 'MAINTAIN_PERFECTION';
        if ($current_health < 80) $action = 'QUANTUM_MUTATION_STRANGLE';
        if ($current_health < 50) $action = 'EMERGENCY_CDN_FAILOVER';

        // 🧬 SESSION MUTATION KERNEL EXPOSURE
        $targetKbps = (int)($dna['target_kbps'] ?? $dna['source_kbps'] ?? 5000);
        $listId = $dna['list_id'] ?? 'unknown_list';

        // Find real mutation plan from global memory
        $globalRadarPath = '/dev/shm/ape_guardian/live_telemetry_global.json';
        $realMutationPlan = null;
        if (file_exists($globalRadarPath)) {
            $parsedRadar = @json_decode(@file_get_contents($globalRadarPath), true);
            if (isset($parsedRadar[$listId][$requestedSid]['mutation_plan'])) {
                $realMutationPlan = $parsedRadar[$listId][$requestedSid]['mutation_plan'];
                $action = $realMutationPlan['action'] ?? $action;
            }
        }

        // Fallback or Active Plan
        if ($realMutationPlan) {
            $mutationPayload = $realMutationPlan;
        } else {
            // Synthesize fallback mutation plan if DNA exists but no live telemetry
            $mutationPayload = [
                'bandwidth_state' => 'UNKNOWN',
                'freeze_state'    => 'UNKNOWN',
                'protocol_hint'   => 'KEEP',
                'buffer_hint'     => ['target_ms' => 0, 'netcache_ms' => 0],
                'abr_hint'        => ['max_kbps' => $targetKbps, 'min_kbps' => $targetKbps * 0.5],
                'action'          => 'MAINTAIN_PERFECTION'
            ];
        }

        $response = [
            'stats' => [
                'avg_speed_kbps' => $avg_speed,
                'avg_fps' => $dna['source_fps'] ?? $dna['target_fps'] ?? 0,
                'avg_bitrate_kbps' => $targetKbps,
                'stream_freezes' => $lacks_history,
                'health_score' => $current_health,
                'action' => $action,
                'strangle_ratio' => $strangle
            ],
            'biology' => [
                'protocol' => $dna['protocol'] ?? 'UNKNOWN',
                'codec' => $dna['codec'] ?? 'UNKNOWN',
                'profile' => $dna['profile_id'] ?? 'AUTO',
                'stream_id' => $requestedSid
            ],
            'mutation' => $mutationPayload
        ];

        $specificStats = $response['stats'];
        $biologyData = $response['biology'];
        $mutationPlan = $response['mutation'];
    }
} else {
    $specificStats = null;
    $biologyData = null;
    $mutationPlan = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const EVENTS_FILE = '/dev/shm/ape_guardian/events.jsonl';
const MAX_EVENTS_RETURN = 50;   // Max events per poll response
const MAX_LINES_READ    = 500;  // Max lines to scan from tail of file

// ═══════════════════════════════════════════════════════════════════════════
// QUERY PARAMS
// ═══════════════════════════════════════════════════════════════════════════
$sinceTs = isset($_GET['since']) ? (float)$_GET['since'] : 0.0;

// ═══════════════════════════════════════════════════════════════════════════
// READ EVENTS — tail-read from JSONL (efficient for append-only log)
// ═══════════════════════════════════════════════════════════════════════════
$allEvents = [];

if (is_file(EVENTS_FILE) && is_readable(EVENTS_FILE)) {
    // Read last N lines efficiently using tail
    $raw = @shell_exec('tail -n ' . MAX_LINES_READ . ' ' . escapeshellarg(EVENTS_FILE) . ' 2>/dev/null');
    if ($raw !== null && $raw !== '') {
        $lines = explode("\n", trim($raw));
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') continue;
            $ev = @json_decode($line, true);
            if (!is_array($ev)) continue;
            $allEvents[] = $ev;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTE STATS — aggregate over ALL read events (last 500)
// ═══════════════════════════════════════════════════════════════════════════
$stats = [
    'dash'         => 0,
    'hls'          => 0,
    'ts'           => 0,
    'avg_probe_ms' => 0,
    'stream_freezes' => 0,
    'avg_speed_kbps' => 0,
    'avg_fps'      => 0,
    'avg_bitrate_kbps' => 0,
    'total_events' => count($allEvents),
];

$probeSum = 0.0;
$probeCount = 0;
$speedSum = 0.0;
$speedCount = 0;
$fpsSum = 0.0;
$fpsCount = 0;
$bitrateSum = 0.0;
$bitrateCount = 0;

foreach ($allEvents as $ev) {
    if (!isset($ev['event'])) continue;
    $event = $ev['event'];

    if ($event === 'serve_dash') {
        $stats['dash']++;
    } elseif ($event === 'fallback_triggered') {
        $fb = $ev['fallback_to'] ?? '';
        if ($fb === 'hls') {
            $stats['hls']++;
        } elseif ($fb === 'ts') {
            $stats['ts']++;
        }
    } elseif ($event === 'probe_codec') {
        if (isset($ev['probe_ms']) && is_numeric($ev['probe_ms'])) {
            $probeSum += (float)$ev['probe_ms'];
            $probeCount++;
        }
        if (isset($ev['fps']) && is_numeric($ev['fps']) && $ev['fps'] > 0) {
            $fpsSum += (float)$ev['fps'];
            $fpsCount++;
        }
        if (isset($ev['bitrate_kbps']) && is_numeric($ev['bitrate_kbps']) && $ev['bitrate_kbps'] > 0) {
            $bitrateSum += (float)$ev['bitrate_kbps'];
            $bitrateCount++;
        }
    } elseif ($event === 'stream_freeze_detected') {
        $stats['stream_freezes']++;
    } elseif ($event === 'worker_stream_metrics') {
        if (isset($ev['dl_speed_kbps']) && is_numeric($ev['dl_speed_kbps'])) {
            $speedSum += (float)$ev['dl_speed_kbps'];
            $speedCount++;
        }
    } elseif ($event === 'continuous_metrics_100ms') {
        if (isset($ev['speed_kbps']) && is_numeric($ev['speed_kbps'])) {
            $speedSum += (float)$ev['speed_kbps'];
            $speedCount++;
        }
        if (isset($ev['micro_freezes']) && is_numeric($ev['micro_freezes'])) {
            $stats['stream_freezes'] += (int)$ev['micro_freezes'];
        }
    }
}

if ($probeCount > 0) $stats['avg_probe_ms'] = round($probeSum / $probeCount, 1);
if ($fpsCount > 0) $stats['avg_fps'] = round($fpsSum / $fpsCount, 2);
if ($bitrateCount > 0) $stats['avg_bitrate_kbps'] = round($bitrateSum / $bitrateCount, 0);
if ($speedCount > 0) $stats['avg_speed_kbps'] = round($speedSum / $speedCount, 0);

// ═══════════════════════════════════════════════════════════════════════════
// FILTER EVENTS — only return events newer than ?since=
// ═══════════════════════════════════════════════════════════════════════════
$newEvents = [];

if ($sinceTs > 0) {
    foreach ($allEvents as $ev) {
        if (isset($ev['_ts']) && (float)$ev['_ts'] > $sinceTs) {
            $newEvents[] = $ev;
        }
    }
} else {
    // First poll — return last MAX_EVENTS_RETURN events
    $newEvents = array_slice($allEvents, -MAX_EVENTS_RETURN);
}

// Cap to prevent huge responses
if (count($newEvents) > MAX_EVENTS_RETURN) {
    $newEvents = array_slice($newEvents, -MAX_EVENTS_RETURN);
}

// ═══════════════════════════════════════════════════════════════════════════
// MERGE SPECIFIC STREAM DATA WITH GLOBAL STATS
// ═══════════════════════════════════════════════════════════════════════════
if ($specificStats !== null) {
    // Las estadísticas específicas del stream activo (Health Score, Micro-Freezes) sobrescriben
    // las globales para que el HUD muestre el estado exacto del canal en reproducción.
    $stats = array_merge($stats, $specificStats);
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE
// ═══════════════════════════════════════════════════════════════════════════
$finalResponse = [
    'status' => 'ok',
    'stats'  => $stats,
    'events' => array_values($newEvents),
    '_server_time' => microtime(true),
    '_guardian_version' => '16.1.0'
];

if (isset($biologyData) && $biologyData !== null) {
    $finalResponse['biology'] = $biologyData;
}

// 🏎️ F1-GRADE: Inject Wall of Monitors JSON
$globalRadarPath = '/dev/shm/ape_guardian/live_telemetry_global.json';
$f1_radar = [];
if (file_exists($globalRadarPath)) {
    $parsedRadar = @json_decode(@file_get_contents($globalRadarPath), true);
    if (is_array($parsedRadar)) {
        $f1_radar = $parsedRadar;
    }
}

// 🛡️ ALWAYS-ON TELEMETRY: Augment radar with recent non-CMAF streams
$metricsBase = '/dev/shm/ape_metrics';
if (is_dir($metricsBase)) {
    $now = time();
    foreach (scandir($metricsBase) as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $dnaPath = $metricsBase . '/' . $entry . '/target_dna.json';
        if (file_exists($dnaPath)) {
            $mtime = filemtime($dnaPath);
            // Si el DNA fue escrito en los ultimos 60 segundos
            if (($now - $mtime) < 60) {
                $dna = @json_decode(file_get_contents($dnaPath), true) ?: [];
                $lId = $dna['list_id'] ?? 'unknown_list';

                // Si ya existe en el radar (porque cmaf_worker lo esta reportando), nos lo saltamos
                if (!isset($f1_radar[$lId][$entry])) {
                    if (!isset($f1_radar[$lId])) {
                        $f1_radar[$lId] = [];
                    }
                    // Injectamos métricas sintéticas/mínimas para el HUD
                    $f1_radar[$lId][$entry] = [
                        'status' => 'LIVE',     // Asumimos vivo (fue tocado hace <60s)
                        'codec' => $dna['codec'] ?? 'UNKNOWN',
                        'bitrate_kbps' => $dna['target_kbps'] ?? $dna['source_kbps'] ?? 0,
                        'speed' => 1.0,         // No real speed available without worker
                        'speed_kbps' => $dna['target_kbps'] ?? $dna['source_kbps'] ?? 0,
                        'health_score' => 99.9, // Optimista
                        'micro_freezes' => 0,
                        'strangle_ratio' => 1.0,
                        'last_update_ms' => $mtime * 1000
                    ];
                }
            }
        }
    }
}

if (empty($f1_radar)) {
    $finalResponse['f1_radar'] = new stdClass(); // Empty object
} else {
    $finalResponse['f1_radar'] = $f1_radar;
}


// 🏆 GAP 4: QoE DASHBOARD SYNTHESIS (Skill #40)
// Calculate high-level Experience metrics from the raw telemetry blobs
$qoeDashboard = [
    'estimated_mos'   => 4.5, // Default Excellent
    'zapping_time_ms' => $stats['avg_probe_ms'] ?: 1200,
    'network_grade'   => 'A', // Default
    'headroom_score'  => 100, // %
    'stability_index' => 1.0,  // 1.0 = perfect
];

// Simple MOS Estimation Algorithm (2026)
// Penalty for freezes, low speed relative to bitrate, and slow connectivity
$mos = 5.0;
if ($stats['stream_freezes'] > 0) $mos -= 0.8 * $stats['stream_freezes'];
if ($stats['avg_speed_kbps'] > 0 && $stats['avg_bitrate_kbps'] > 0) {
    $ratio = $stats['avg_speed_kbps'] / $stats['avg_bitrate_kbps'];
    if ($ratio < 1.0) $mos -= (1.2 - $ratio) * 2;
}
if ($stats['avg_probe_ms'] > 1800) $mos -= 0.5;
$qoeDashboard['estimated_mos'] = max(1.0, round($mos, 1));

// Network Grade based on throughput and latency (simulated if NetworkProfiler data missing)
if ($stats['avg_speed_kbps'] >= 25000) $qoeDashboard['network_grade'] = 'A+';
elseif ($stats['avg_speed_kbps'] >= 15000) $qoeDashboard['network_grade'] = 'A';
elseif ($stats['avg_speed_kbps'] >= 8000)  $qoeDashboard['network_grade'] = 'B';
else $qoeDashboard['network_grade'] = 'C';

// Calculate Headroom
if ($stats['avg_speed_kbps'] > 0 && $stats['avg_bitrate_kbps'] > 0) {
    $qoeDashboard['headroom_score'] = round(($stats['avg_speed_kbps'] / $stats['avg_bitrate_kbps']) * 100);
}

$finalResponse['qoe_dashboard'] = $qoeDashboard;

echo json_encode($finalResponse, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
