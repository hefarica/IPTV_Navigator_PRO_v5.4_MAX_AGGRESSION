<?php
/**
 * ═══════════════════════════════════════════════════════════════════
 * APE PQ HEARTBEAT — VPS Endpoint for ONN 4K Guardian Telemetry
 * ═══════════════════════════════════════════════════════════════════
 *
 * Two modes:
 *   POST /ape-pq-heartbeat.php  ← Receives heartbeat JSON from Windows watchdog
 *   GET  /ape-pq-heartbeat.php  ← Returns current status + last heartbeat
 *
 * NGINX post_action calls this when an M3U8 is served to the ONN 4K,
 * so the VPS knows the device is alive and playing.
 *
 * State file: /tmp/ape-pq-state.json
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$STATE_FILE = '/tmp/ape-pq-state.json';
$LOG_FILE   = '/var/log/nginx/ape-pq-heartbeat.log';

// Load existing state
$state = [];
if (file_exists($STATE_FILE)) {
    $state = json_decode(file_get_contents($STATE_FILE), true) ?: [];
}

// ── POST: Receive heartbeat from Windows watchdog ──────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if (!$data || !isset($data['device'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid heartbeat payload']);
        exit;
    }

    // Update state
    $state['last_heartbeat']   = date('c');
    $state['device']           = $data['device'] ?? 'unknown';
    $state['guardian_status']  = $data['guardian'] ?? 'unknown';
    $state['aisr']             = $data['aisr'] ?? 'unknown';
    $state['aipq']             = $data['aipq'] ?? 'unknown';
    $state['hdr']              = $data['hdr'] ?? 'unknown';
    $state['client_ts']        = $data['ts'] ?? '';
    $state['client_ip']        = $_SERVER['REMOTE_ADDR'] ?? '';
    $state['heartbeat_count']  = ($state['heartbeat_count'] ?? 0) + 1;

    // Track resurrections
    if (($data['guardian'] ?? '') === 'resurrected') {
        $state['last_resurrection'] = date('c');
        $state['resurrection_count'] = ($state['resurrection_count'] ?? 0) + 1;
    }

    // Save state
    file_put_contents($STATE_FILE, json_encode($state, JSON_PRETTY_PRINT));

    // Log
    $logLine = date('c') . " HEARTBEAT: " .
        "device={$state['device']} " .
        "guardian={$state['guardian_status']} " .
        "aisr={$state['aisr']} " .
        "aipq={$state['aipq']} " .
        "hdr={$state['hdr']} " .
        "from={$state['client_ip']}\n";
    @file_put_contents($LOG_FILE, $logLine, FILE_APPEND);

    echo json_encode([
        'status'  => 'ok',
        'message' => 'Heartbeat received',
        'state'   => $state
    ]);
    exit;
}

// ── GET: Return current state + health assessment ──────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Calculate health
    $health = 'unknown';
    if (isset($state['last_heartbeat'])) {
        $age = time() - strtotime($state['last_heartbeat']);
        if ($age < 600) {         // < 10 min
            $health = 'healthy';
        } elseif ($age < 1800) {  // < 30 min
            $health = 'stale';
        } else {
            $health = 'dead';
        }
        $state['heartbeat_age_seconds'] = $age;
    }
    $state['health'] = $health;

    // M3U8 fetch tracking (populated by NGINX post_action)
    $state['info'] = 'POST heartbeat JSON to update. NGINX post_action auto-tracks M3U8 reads.';

    echo json_encode($state, JSON_PRETTY_PRINT);
    exit;
}
