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
/**
 * Contador de registros MAX_QUALITY persistidos.
 * Mapeado al campo max_quality_recorded en la respuesta JSON para auditoría.
 * Seteado por el bloque 3 (max_quality_channels) más abajo.
 */
$maxQualityRecorded = 0;

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

        // 1b. Conviva→LAB feedback loop (Feature 1, 2026-05-20): aggregate per-profile
        //     QoE → suggestion JSON. OBSERVE-ONLY (does NOT auto-apply to decision_engine).
        //     Each metric carries a "profile" field set by the observer from X-APE-Profile.
        try {
            require_once __DIR__ . '/../lib/lab_tier_qoe_aggregator.php';
            LabTierQoeAggregator::aggregate($payload['metrics'], $bucket, $persist);
        } catch (Throwable $e) {
            error_log('[qoe-flush] tier aggregator error: ' . $e->getMessage());
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

    // ── 3. Persistir canales con MAX_QUALITY OVERRIDE activo ────────────────────────────────
    // El flush worker Lua incluye este array cuando detecta claves "mq:<channel_id>"
    // en ngx.shared.qoe_metrics — seteadas por qoe_server_side_observer.lua al capturar
    // el header X-APE-Max-Quality:1 que el generador inyecta vía EXTHTTP.
    //
    // Cada entrada del array:
    //   - channel_id   : ID numérico del canal (string)
    //   - cascade_type : "dual-hvc1-hev1" o vacío si el generador es pre-2026-05-22
    //   - profile      : "P0".."P5" (del X-APE-Profile ya capturado)
    //
    // Persistencia: ConvivaPersistence::recordMaxQualityChannel()
    //   → tabla max_quality_channels en conviva.db
    //   → auditable vía SELECT * FROM max_quality_channels ORDER BY recorded_at DESC
    //   → el daemon ONN sentinel puede consultar vía prisma-adb-quality.php?action=mq_channels
    //     para saber qué canales requieren ADB settings HEVC/DV adicionales
    //
    // AUTOPISTA: si el array está vacío o no existe, este bloque es no-op (no lanza).
    if (isset($payload['max_quality_channels']) && is_array($payload['max_quality_channels'])) {
        foreach ($payload['max_quality_channels'] as $mq) {
            $chId       = (string)($mq['channel_id']   ?? '');
            $cascType   = (string)($mq['cascade_type'] ?? 'dual-hvc1-hev1');
            $mqProfile  = (string)($mq['profile']      ?? 'unknown');
            if ($chId === '') continue;
            $ok = $persist->recordMaxQualityChannel($chId, $cascType, $mqProfile, $bucket);
            if ($ok) $maxQualityRecorded++;
        }
    }

    echo json_encode([
        'ok'                    => true,
        'metrics_written'       => $metricsWritten,
        'hdcp_forwarded'        => $hdcpForwarded,
        'max_quality_recorded'  => $maxQualityRecorded, // [MAX_QUALITY 2026-05-22]
        'bucket_5min'           => $bucket,
        'ts'                    => time(),
    ]);
} catch (Throwable $e) {
    error_log('[qoe-flush] error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error']);
}
