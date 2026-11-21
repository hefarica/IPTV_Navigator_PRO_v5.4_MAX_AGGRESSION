<?php
declare(strict_types=1);

/**
 * APE PRISMA v1.3 — ADB Telemetry API
 *
 * Reads telemetry from /dev/shm/prisma_adb_telemetry.json (written by daemon)
 * and exposes it to the frontend widget.
 *
 * GET  → returns current ADB device state
 * POST ?action=resync → triggers immediate re-sync (touches signal file)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Prisma-Key');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$telemetryFile = '/dev/shm/prisma_adb_telemetry.json';
$resyncSignal  = '/dev/shm/prisma_adb_resync_signal';

// POST: trigger resync
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $action = $_GET['action'] ?? '';
    if ($action === 'resync') {
        // Touch signal file — daemon picks it up on next loop
        @touch($resyncSignal);
        echo json_encode([
            'ok'      => true,
            'message' => 'Resync signal sent. Daemon will re-apply payload within 60s.',
            'ts'      => date('c'),
        ], JSON_PRETTY_PRINT);
        exit;
    }
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Unknown action']);
    exit;
}

// GET: return telemetry
if (!is_file($telemetryFile)) {
    echo json_encode([
        'adb_connected' => false,
        'daemon_running' => false,
        'error' => 'Telemetry file not found. Daemon may not be running.',
        'ts' => date('c'),
    ], JSON_PRETTY_PRINT);
    exit;
}

$raw = @file_get_contents($telemetryFile);
if ($raw === false) {
    echo json_encode([
        'adb_connected' => false,
        'daemon_running' => false,
        'error' => 'Cannot read telemetry file.',
        'ts' => date('c'),
    ], JSON_PRETTY_PRINT);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    echo json_encode([
        'adb_connected' => false,
        'daemon_running' => false,
        'error' => 'Telemetry file contains invalid JSON.',
        'ts' => date('c'),
    ], JSON_PRETTY_PRINT);
    exit;
}

// Add daemon health check (file freshness)
$fileAge = time() - filemtime($telemetryFile);
$data['daemon_running'] = $fileAge < 120; // If file updated within 2 min, daemon is alive
$data['file_age_seconds'] = $fileAge;

echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
