<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Server-Side QoE Flush Endpoint v1.0                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Receives QoE metrics flush from qoe_server_side_observer.lua (periodic 60s
 * timer in nginx) and persists to server_side_qoe_metrics SQLite table.
 *
 * Also processes pending HDCP fallback markers ("hdcpneeded:<chId>") from the
 * Lua shared dict — for each one, forwards to channel-hdcp-incident.php so
 * the existing HDCP-Adaptive Engine flips the channel to NONE.
 *
 * REQUEST:
 *   POST /prisma/api/qoe-flush.php
 *   Content-Type: application/json
 *   Authorization: localhost-only (X-Forwarded-For == 127.0.0.1 or nginx loopback)
 *   Body: {
 *     "metrics": [
 *       {
 *         "channel_id":     "1312008",
 *         "vst_proxy_avg":  1850,
 *         "vst_proxy_max":  2400,
 *         "rebuffer_count": 0,
 *         "request_count":  124,
 *         "error_count":    2,
 *         "bitrate_avg_bps": 8500000
 *       },
 *       ...
 *     ],
 *     "hdcp_needed_channels": [
 *       {"channel_id": "5601", "channel_name": "CH-5601", "vst_ms": 3450}
 *     ],
 *     "bucket_5min": 5601234,
 *     "ts": 1716139500
 *   }
 *
 * DOCTRINE:
 *   - AUTOPISTA: silent fail-safe (Lua observer is fire-and-forget)
 *   - LOCALHOST-ONLY: refuses external POSTs (Lua observer calls via 127.0.0.1)
 *   - REUSE: forwards HDCP fallback to existing /channel-hdcp-incident.php
 *
 * @package vps\prisma\api
 * @version 1.0.0
 */

require_once __DIR__ . '/../lib/conviva_persistence.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
header('Content-Type: application/json; charset=utf-8');
header('X-QoE-Flush-Version: 1.0.0');

// Localhost-only guard (Lua observer always calls via 127.0.0.1)
$remote = $_SERVER['REMOTE_ADDR'] ?? '';
$allowed = ['127.0.0.1', '::1'];
if (!in_array($remote, $allowed, true)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'localhost_only']);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed', 'allowed_methods' => ['POST']]);
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
    echo json_encode(['ok' => false, 'error' => 'invalid_json']);
    exit;
}

$persist = new ConvivaPersistence();
$bucket = (int)($payload['bucket_5min'] ?? floor(time() / 300));
$metricsWritten = 0;
$hdcpForwarded = 0;

try {
    // 1. Persist server-side QoE rows
    if (isset($payload['metrics']) && is_array($payload['metrics'])) {
        foreach ($payload['metrics'] as $m) {
            if (!isset($m['channel_id'])) continue;
            $ok = $persist->recordServerSideQoE(
                (string)$m['channel_id'],
                $bucket,
                (int)($m['vst_proxy_avg'] ?? 0),
                (int)($m['vst_proxy_max'] ?? 0),
                (int)($m['rebuffer_count'] ?? 0),
                (int)($m['request_count'] ?? 0),
                (int)($m['error_count'] ?? 0),
                (int)($m['bitrate_avg_bps'] ?? 0)
            );
            if ($ok) $metricsWritten++;
        }
    }

    // 2. Forward HDCP-needed channels to existing incident endpoint
    //    (reuses Conviva-driven HDCP-Adaptive Engine — single source of decision)
    if (isset($payload['hdcp_needed_channels']) && is_array($payload['hdcp_needed_channels'])) {
        foreach ($payload['hdcp_needed_channels'] as $h) {
            $chId = (string)($h['channel_id'] ?? '');
            $chName = (string)($h['channel_name'] ?? ('CH-' . $chId));
            $vstMs = (int)($h['vst_ms'] ?? 0);
            if ($chId === '' || $vstMs <= 0) continue;
            // Direct method call (more efficient than HTTP self-loopback)
            $ok = $persist->recordHdcpIncident($chId, $chName, $vstMs);
            if ($ok) $hdcpForwarded++;
        }
    }

    echo json_encode([
        'ok'                 => true,
        'metrics_written'    => $metricsWritten,
        'hdcp_forwarded'     => $hdcpForwarded,
        'bucket_5min'        => $bucket,
        'ts'                 => time(),
    ]);
} catch (Throwable $e) {
    error_log('[qoe-flush] error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error']);
}
