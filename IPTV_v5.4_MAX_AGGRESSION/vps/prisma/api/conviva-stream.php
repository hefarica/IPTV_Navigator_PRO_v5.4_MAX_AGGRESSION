<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  /prisma/api/conviva-stream — Phase 3 STUB (SSE bridge, not yet live)   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * STATUS: STUB · returns HTTP 501 with structured JSON until the full SSE loop
 *         is implemented in Phase 3.1.
 *
 * RATIONALE: We reserve the URI + define the response shape now so the routing
 *            and widget can be wired in parallel without exposing a half-baked
 *            stream that misleads clients into thinking the dashboard is live.
 *
 * GATE 1 CABLEADO:
 *   - This stub is deliberately NOT wired to nginx yet. The nginx snippet is
 *     designed in ARTIFACT_CONVIVA_PHASE3_STREAM_DESIGN.md §5 and will be
 *     deployed in Phase 3.1 once the loop is complete.
 *   - Phase 2 endpoint (/prisma/api/conviva-event) is already deployed + smoke-tested
 *     and is the producer of /dev/shm/conviva-events.log this endpoint will read.
 *
 * GATE 3 SANDBOX:
 *   - Stub never opens a long-lived stream; safe to deploy even partially.
 *   - 501 response is the canonical "endpoint defined, implementation pending".
 *
 * @see .agents/artifacts/ARTIFACT_CONVIVA_PHASE3_STREAM_DESIGN.md
 * @see vps/prisma/lib/conviva_persistence.php (buffer producer · already DEPLOYED)
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Conviva-Endpoint: stream-v1.0-phase3-stub');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode([
        'ok'       => false,
        'error'    => 'method_not_allowed',
        'expected' => 'GET',
    ]);
    exit;
}

http_response_code(501);
echo json_encode([
    'ok'              => false,
    'status'          => 'not_implemented',
    'phase'           => '3.0-stub',
    'planned_deploy'  => '3.1',
    'reason'          => 'SSE loop not yet implemented · endpoint reserved.',
    'design_doc'      => '.agents/artifacts/ARTIFACT_CONVIVA_PHASE3_STREAM_DESIGN.md',
    'when_ready'      => [
        'transport'        => 'Server-Sent Events (text/event-stream)',
        'event_type'       => 'conviva',
        'query_params'     => ['session_id', 'device_id', 'tail'],
        'keepalive_seconds'=> 25,
        'max_duration_s'   => 290,
    ],
    'producer'        => [
        'phase'        => 2,
        'endpoint'     => '/prisma/api/conviva-event',
        'status'       => 'live',
        'buffer_file'  => '/dev/shm/conviva-events.log',
        'sqlite_file'  => '/opt/netshield/data/conviva.db',
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
