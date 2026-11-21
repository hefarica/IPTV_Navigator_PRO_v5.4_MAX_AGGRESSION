<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  APE Image Quality Bulk — Per-Channel Observed Bitrate Endpoint v1.0    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * GET endpoint returning the per-channel observed bitrate map from the nginx
 * Lua QoE observer (server_side_qoe_metrics). Used by the m3u8 generator at
 * list-build time to upgrade STREAM-INF codec/resolution declarations for
 * channels with empirical high-bandwidth evidence.
 *
 * STRICTLY IMAGE-ONLY: bw_observed (codec/resolution decision) + cascade_type
 * (verified HEVC history). ZERO timing/buffer/connection data. No VST, no
 * rebuffer_count, no error_count. These are excluded by design.
 *
 * REQUEST:
 *   GET /prisma/api/channel-image-bulk
 *
 * RESPONSE:
 *   200 {
 *     "ok": true,
 *     "channels": {
 *       "1312008": {"bw_observed": 22500000, "cascade_type": "dual-hvc1-hev1"},
 *       "5601":    {"bw_observed": 9200000,  "cascade_type": null}
 *     },
 *     "count": 2,
 *     "ts": 1717000000
 *   }
 *
 * Generator logic:
 *   bw_observed >= 22,000,000 → hvc1.2.4.L153.B0 + 3840x2160 (4K tier)
 *   bw_observed >= 12,000,000 → hvc1.2.4.L120.B0 + 1920x1080 (FHD tier)
 *   Channels NOT in map → generator keeps its own per-tier defaults (graceful).
 *
 * DOCTRINE:
 *   - AUTOPISTA: GET is read-only, no side effects.
 *   - NO MOCKS: returns empty map {} if DB is missing — caller defaults.
 *   - NO TIMING DATA: vst_proxy_avg/rebuffer/error_count excluded by design.
 *   - Frontend cache-controls: 60s TTL to reduce VPS load on repeated list gens.
 *   - Data window: last 24h only (stale data = no entry, not wrong entry).
 *
 * @package vps\prisma\api
 * @version 1.0.0
 */

require_once __DIR__ . '/../lib/conviva_persistence.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
header('Content-Type: application/json; charset=utf-8');
header('X-Image-Endpoint-Version: 1.0.0');
// CORS for browser clients (generator runs in browser)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
// Short cache: image quality data changes slowly, but we want fresh data per list gen
header('Cache-Control: public, max-age=60, must-revalidate');

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'ok'              => false,
        'error'           => 'method_not_allowed',
        'allowed_methods' => ['GET', 'OPTIONS'],
    ]);
    exit;
}

try {
    $persist  = new ConvivaPersistence();
    $channels = $persist->getImageProfileBulk();
    echo json_encode([
        'ok'       => true,
        'channels' => (object)$channels,  // emit as JSON object even if empty
        'count'    => count($channels),
        'ts'       => time(),
    ]);
} catch (Throwable $e) {
    error_log('[channel-image-bulk] error: ' . $e->getMessage());
    // Honest degradation: return empty map, never crash the frontend
    echo json_encode([
        'ok'      => true,
        'channels' => (object)[],
        'count'    => 0,
        'ts'       => time(),
        'warning'  => 'persistence_unavailable',
    ]);
}
