<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  HDCP-Adaptive Engine — Bulk Profile Endpoint v1.0                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * GET endpoint returning the complete map of channel_id → hdcp_level
 * decisions, used by the m3u8 generator at list-build time to pre-load
 * HDCP overrides. Called ONCE per list generation (not per zap).
 *
 * REQUEST:
 *   GET /prisma/api/channel-hdcp-bulk
 *
 * RESPONSE:
 *   200 {
 *     "ok": true,
 *     "default": "TYPE-1",
 *     "umbral_vst_hdcp_fail_ms": 3000,
 *     "channels": {
 *       "1312008": "NONE",
 *       "5601":    "TYPE-1",
 *       "999":     "NONE"
 *     },
 *     "count": 3,
 *     "ts": 1716139500
 *   }
 *
 * Channels NOT in the map → caller emits HDCP-LEVEL=TYPE-1 default (aggressive).
 *
 * DOCTRINE:
 *   - AUTOPISTA: GET is read-only, no side effects.
 *   - NO MOCKS: returns empty map {} if DB is missing — caller defaults.
 *   - Frontend cache-controls: 60s TTL to reduce VPS load on repeated list gens.
 *
 * @package vps\prisma\api
 * @version 1.0.0
 */

require_once __DIR__ . '/../lib/conviva_persistence.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
header('Content-Type: application/json; charset=utf-8');
header('X-HDCP-Endpoint-Version: 1.0.0');
// CORS for browser clients
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
// Short cache: HDCP decisions change rarely, but we want fresh data per list gen
header('Cache-Control: public, max-age=60, must-revalidate');

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'error' => 'method_not_allowed',
        'allowed_methods' => ['GET', 'OPTIONS'],
    ]);
    exit;
}

try {
    $persist = new ConvivaPersistence();
    $channels = $persist->getHdcpProfileBulk();
    echo json_encode([
        'ok'                       => true,
        'default'                  => 'TYPE-1',
        'umbral_vst_hdcp_fail_ms'  => 3000,
        'channels'                 => (object)$channels,  // emit as JSON object even if empty
        'count'                    => count($channels),
        'ts'                       => time(),
    ]);
} catch (Throwable $e) {
    error_log('[channel-hdcp-bulk] error: ' . $e->getMessage());
    // Honest degradation: return empty map, never crash the frontend
    echo json_encode([
        'ok'                       => true,
        'default'                  => 'TYPE-1',
        'umbral_vst_hdcp_fail_ms'  => 3000,
        'channels'                 => (object)[],
        'count'                    => 0,
        'ts'                       => time(),
        'warning'                  => 'persistence_unavailable',
    ]);
}
