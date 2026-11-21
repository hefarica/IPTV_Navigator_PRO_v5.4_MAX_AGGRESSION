<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  HDCP-Adaptive Engine — Incident Endpoint v1.0                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * POST endpoint receiving HDCP failure incidents from Conviva QoE engine.
 *
 * Triggered when Conviva detects VST > UMBRAL_VST_HDCP_FAIL_MS (3000ms)
 * during a TYPE-1 HDCP attempt on a channel. Flips channel_hdcp_profile
 * to 'NONE' for that channel, so subsequent zaps emit HDCP-LEVEL=NONE.
 *
 * REQUEST:
 *   POST /prisma/api/channel-hdcp-incident
 *   Content-Type: application/json
 *   Body: {
 *     "channel_id":    "string (required, stable channel ID)",
 *     "channel_name":  "string (required, human-readable)",
 *     "hdcp_level_attempted": "TYPE-1",
 *     "vst_ms":        3450,
 *     "decision":      "fallback_to_NONE",
 *     "ts":            1716139500000
 *   }
 *
 * RESPONSE:
 *   200 {"ok":true, "recorded":true, "channel_id":"..."}
 *   400 {"ok":false, "error":"validation_failed", "details":[...]}
 *   405 {"ok":false, "error":"method_not_allowed"}
 *   500 {"ok":false, "error":"server_error"}
 *
 * DOCTRINE:
 *   - AUTOPISTA: POST is async fire-and-forget from frontend.
 *     If endpoint slow/down → frontend doesn't block stream.
 *   - TOUCH-NOTHING: only writes to SQLite, no nginx changes.
 *   - NO PLAYER-BREAKING LIES: stores facts (VST measured),
 *     not assumptions.
 *
 * @package vps\prisma\api
 * @version 1.0.0
 */

require_once __DIR__ . '/../lib/conviva_persistence.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
header('Content-Type: application/json; charset=utf-8');
header('X-HDCP-Endpoint-Version: 1.0.0');
// CORS for browser clients (frontend running on different origin)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok'    => false,
        'error' => 'method_not_allowed',
        'allowed_methods' => ['POST', 'OPTIONS'],
    ]);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'empty_body']);
    exit;
}

$payload = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($payload)) {
    http_response_code(400);
    echo json_encode([
        'ok'    => false,
        'error' => 'invalid_json',
        'json_error' => json_last_error_msg(),
    ]);
    exit;
}

// Validation
$errors = [];
$channelId   = isset($payload['channel_id'])   ? trim((string)$payload['channel_id'])   : '';
$channelName = isset($payload['channel_name']) ? trim((string)$payload['channel_name']) : '';
$vstMs       = isset($payload['vst_ms'])       ? (int)$payload['vst_ms']                : 0;
$attempted   = isset($payload['hdcp_level_attempted']) ? (string)$payload['hdcp_level_attempted'] : '';

if ($channelId === '')          $errors[] = 'channel_id required';
if ($channelName === '')        $errors[] = 'channel_name required';
if ($vstMs <= 0 || $vstMs > 60000) $errors[] = 'vst_ms must be 1..60000';
if ($attempted !== 'TYPE-1')    $errors[] = 'hdcp_level_attempted must be TYPE-1 (only meaningful incident)';

if (!empty($errors)) {
    http_response_code(400);
    echo json_encode([
        'ok'      => false,
        'error'   => 'validation_failed',
        'details' => $errors,
    ]);
    exit;
}

// Persist
try {
    $persist = new ConvivaPersistence();
    $ok = $persist->recordHdcpIncident($channelId, $channelName, $vstMs);
    if ($ok) {
        echo json_encode([
            'ok'         => true,
            'recorded'   => true,
            'channel_id' => $channelId,
            'new_level'  => 'NONE',
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'persistence_failed']);
    }
} catch (Throwable $e) {
    error_log('[channel-hdcp-incident] error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error']);
}
