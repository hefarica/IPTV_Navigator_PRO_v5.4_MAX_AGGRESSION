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

// ── Correlacion per-canal por IP (plano ADB->URL-2) ──────────────────────────
// El runner ADB (adb-conviva-push.sh) no conoce el channel_id porque OTT Navigator no lo logea;
// POSTea channel.id="auto". Lo resolvemos desde device_state por REMOTE_ADDR: la IP publica del
// hogar es la MISMA que el player usa al pegar /omega/open (que escribe /dev/shm/ape_devstate_<ip>),
// asi la QoE del device se atribuye al canal REAL que reproduce. Sin device_state -> queda "auto".
if (isset($event['channel']['id'])
    && in_array(strtolower((string)$event['channel']['id']), array('auto', 'unknown', ''), true)) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if ($ip !== '' && @is_file(__DIR__ . '/../lib/ape_mesh.php')) {
        require_once __DIR__ . '/../lib/ape_mesh.php';
        if (function_exists('ape_device_state_by_ip')) {
            $st = ape_device_state_by_ip($ip);
            if (!empty($st['channel_id'])) {
                $event['channel']['id'] = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)$st['channel_id']);
                if (empty($event['channel']['name']) && !empty($st['content_type'])) {
                    $event['channel']['name'] = preg_replace('/[^0-9A-Za-z _.\-]/', '', (string)$st['content_type']);
                }
            }
        }
    }
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

    // ── OMEGA ARA URL-2: Phase G PQ->SDR rollback delta (Council-safe, GATEADO) ──
    // Additive + fire-and-forget. APE_PQ_ROLLBACK_ENABLED=0 por defecto => cero cambio.
    // Nunca afecta la respuesta ni el dispatch. Anti-flap: >=2 incidentes + cooldown.
    // El generador PQ->SDR (channel_pq_profile) y el dispatch original quedan INTACTOS.
    try {
        if (@is_file(__DIR__ . '/../lib/ape_mesh.php')) { require_once __DIR__ . '/../lib/ape_mesh.php'; }
        if (function_exists('ape_ara_rollback_enabled') && ape_ara_rollback_enabled()) {
            $chId  = isset($event['channel']['id']) ? (string)$event['channel']['id'] : '';
            $vst   = isset($event['data']['vst_ms']) ? (int)$event['data']['vst_ms'] : 0;
            $qoe   = isset($result['qoe_score']) ? (int)$result['qoe_score'] : 100;
            $etype = isset($event['event_type']) ? (string)$event['event_type'] : '';
            $damage = ($qoe <= 8) || ($vst > 8000)
                   || in_array($etype, array('error', 'decoder_error'), true)
                   || (isset($result['decision']) && stripos((string)$result['decision'], 'survival') !== false);
            if ($chId !== '' && $damage && function_exists('ape_pq_record_incident')) {
                ape_pq_record_incident($chId, $vst); // contador Phase G existente (solo con flag ON)
                if (function_exists('ape_pq_should_emit_ara_rollback') && ape_pq_should_emit_ara_rollback($chId)
                    && @is_file(__DIR__ . '/phase_g_delta_hook.php')) {
                    require_once __DIR__ . '/phase_g_delta_hook.php';
                    ape_phase_g_emit_delta($event, 'phase_g_rollback', array(
                        'reason' => 'qoe_black_screen_or_vst_or_decoder_error',
                        'qoe_score' => $qoe, 'vst_ms' => $vst, 'source' => 'conviva-event',
                    ));
                }
            }
        }
    } catch (\Throwable $eg) {
        error_log('[conviva-event] ARA phase-g delta skipped: ' . $eg->getMessage());
    }

    // ── OMEGA: tuning AI-PQ por content-type (mesh DECIDE + push por device, anti-spam) ──
    // Cuando el ARA reporta el contenido decodificado, el VPS infiere el ct (fps alto->sports) y empuja
    // el perfil PQ del VPP por hardware. Fire-and-forget; solo si el ct cambio (cache /dev/shm).
    try {
        if (function_exists('ape_pq_push_for_device') && isset($event['event_type'])
            && $event['event_type'] === 'quality_change' && !empty($event['device_id'])) {
            $ct = ape_ct_from_qoe(isset($event['data']) && is_array($event['data']) ? $event['data'] : array());
            ape_pq_push_for_device((string)$event['device_id'], $ct);
        }
    } catch (\Throwable $eq) { error_log('[conviva-event] PQ-ct push skipped: ' . $eq->getMessage()); }
} catch (Throwable $e) {
    // Log to error_log only (do not leak details to client)
    error_log('[conviva-event] dispatch error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error']);
}
