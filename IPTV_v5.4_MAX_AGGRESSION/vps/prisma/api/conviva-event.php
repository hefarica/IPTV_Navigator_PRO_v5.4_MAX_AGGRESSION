<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Conviva QoE Event Endpoint v1.0 — Phase 1 Stub                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * POST endpoint receiving Conviva QoE telemetry events from Android TV /
 * Fire TV clients via ADB push (see vps/scripts/conviva_adb_push.sh).
 *
 * REQUEST:
 *   POST /prisma/api/conviva-event
 *   Content-Type: application/json
 *   Authorization: Basic <prisma_conviva:token>  (Phase 2)
 *   Body: JSON event per conviva_event_schema.json v1.0
 *
 * RESPONSE:
 *   200 {"ok":true, "decision":"NO_ACTION|FORCE_SURVIVAL_MODE|DEGRADE_QUALITY|..."}
 *   400 {"ok":false, "error":"validation_failed", "details":["..."]}
 *   405 {"ok":false, "error":"method_not_allowed"}
 *   500 {"ok":false, "error":"server_error"}
 *
 * GATE 1 CABLEADO (per feedback_cableado_y_sandbox_doctrine):
 *   - Invoked by HTTP POST from vps/scripts/conviva_adb_push.sh (Phase 2 caller)
 *   - Wired to ConvivaQoEServer::dispatch() (same commit)
 *
 * GATE 3 SANDBOX:
 *   - No persistence yet (in-memory only)
 *   - No external dependencies (no composer libs)
 *   - Class load alone has zero side effects
 *   - Safe to deploy: returns 405 for non-POST, ignores unknown clients
 *
 * @package vps\prisma\api
 * @version 1.0.0-phase1-stub
 * @see ARTIFACT_CONVIVA_ADB_PUSH_DESIGN.md §4
 */

require_once __DIR__ . '/../lib/conviva_qoe_server.php';

// Method guard
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
header('Content-Type: application/json; charset=utf-8');
header('X-Conviva-Endpoint-Version: ' . ConvivaQoEServer::VERSION);

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok'    => false,
        'error' => 'method_not_allowed',
        'allowed_methods' => ['POST'],
    ]);
    exit;
}

// Read body
$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'empty_body']);
    exit;
}

// Parse JSON
$event = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($event)) {
    http_response_code(400);
    echo json_encode([
        'ok'    => false,
        'error' => 'invalid_json',
        'json_error' => json_last_error_msg(),
    ]);
    exit;
}

// Validate against schema (Phase 1: minimal validator; Phase 2: full JSON Schema)
$errors = ConvivaQoEServer::validateEvent($event);
if (!empty($errors)) {
    http_response_code(400);
    echo json_encode([
        'ok'      => false,
        'error'   => 'validation_failed',
        'details' => $errors,
    ]);
    exit;
}

// Dispatch
try {
    $result = ConvivaQoEServer::dispatch($event['session_id'], $event);
    echo json_encode([
        'ok'        => true,
        'session_id'=> $result['session_id'],
        'event_type'=> $result['event_type'],
        'qoe_score' => $result['qoe_score'],
        'decision'  => $result['decision'],
    ]);
} catch (Throwable $e) {
    // Log to error_log only (do not leak details to client)
    error_log('[conviva-event] dispatch error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error']);
}
