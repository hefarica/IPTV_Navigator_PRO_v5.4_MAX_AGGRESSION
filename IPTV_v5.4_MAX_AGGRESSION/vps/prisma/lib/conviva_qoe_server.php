<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ConvivaQoEServer v1.0 — Phase 1 Stub (in-memory + log only)            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Server-side equivalent of frontend/js/conviva-qoe-engine.js for receiving
 * playback telemetry via the /prisma/api/conviva-event endpoint.
 *
 * PHASE 1 (this file): minimal stub with validation + dispatch + log only.
 * PHASE 2 (next session): SQLite persistence + circular buffer /dev/shm.
 * PHASE 3 (later):       WebSocket bridge to frontend dashboard.
 *
 * GATE 1 CABLEADO:
 *   - ConvivaQoEServer::validateEvent() called by api/conviva-event.php
 *   - ConvivaQoEServer::dispatch() called by api/conviva-event.php
 *
 * GATE 3 SANDBOX:
 *   - No file writes outside of error_log
 *   - No persistence (in-memory only)
 *   - No external HTTP calls
 *   - Class load alone has zero side effects
 *
 * @see ARTIFACT_CONVIVA_ADB_PUSH_DESIGN.md §6
 * @see frontend/js/conviva-qoe-engine.js (paridad de comportamiento)
 */

class ConvivaQoEServer
{
    public const VERSION = '1.0.0-phase1-stub';

    // Threshold constants — paridad con conviva-qoe-engine.js
    public const RBR_SURVIVAL_THRESHOLD   = 0.02;   // 2%
    public const QOE_DEGRADE_THRESHOLD    = 50;
    public const FDR_REDUCE_LOAD_THRESHOLD = 5;     // frames/s
    public const VST_PRELOAD_THRESHOLD_MS = 3000;
    public const QOE_PROMOTE_THRESHOLD    = 80;
    public const QOE_PROMOTE_SUSTAINED_S  = 15;

    // ─── Allowed event types ─────────────────────────────────────────────────
    private const VALID_EVENT_TYPES = [
        'first_frame',
        'rebuffer_start',
        'rebuffer_end',
        'bitrate_change',
        'frame_drop',
        'quality_change',
        'error',
        'end_session',
    ];

    // ─── Allowed player enum ─────────────────────────────────────────────────
    private const VALID_PLAYERS = [
        'OTT_Navigator', 'TiviMate', 'IPTV_Smarters', 'VLC', 'Kodi',
        'ExoPlayer', 'AVPlayer', 'hls_js', 'Shaka', 'unknown',
    ];

    /**
     * Minimal schema validation (Phase 1: required fields + enums only).
     * Phase 2 will use full JSON Schema Draft 2020-12 validator.
     *
     * @param array $event Parsed JSON event
     * @return array       Empty if valid; otherwise list of error strings
     */
    public static function validateEvent(array $event): array
    {
        $errors = [];

        // Required top-level fields
        $required = ['version', 'session_id', 'device_id', 'player', 'channel', 'event_type', 'timestamp_ms'];
        foreach ($required as $key) {
            if (!array_key_exists($key, $event)) {
                $errors[] = "missing_required:$key";
            }
        }
        if (!empty($errors)) return $errors;

        // Version
        if (($event['version'] ?? '') !== '1.0') {
            $errors[] = 'version_unsupported:expected_1.0';
        }

        // session_id format
        if (!is_string($event['session_id']) ||
            strlen($event['session_id']) < 8 || strlen($event['session_id']) > 64 ||
            !preg_match('/^[a-zA-Z0-9_-]+$/', $event['session_id'])) {
            $errors[] = 'session_id_invalid_format';
        }

        // device_id format
        if (!is_string($event['device_id']) ||
            strlen($event['device_id']) < 1 || strlen($event['device_id']) > 64 ||
            !preg_match('/^[a-zA-Z0-9_.-]+$/', $event['device_id'])) {
            $errors[] = 'device_id_invalid_format';
        }

        // player enum
        if (!in_array($event['player'] ?? '', self::VALID_PLAYERS, true)) {
            $errors[] = 'player_not_in_enum';
        }

        // channel structure
        if (!is_array($event['channel']) ||
            empty($event['channel']['id']) ||
            empty($event['channel']['name'])) {
            $errors[] = 'channel_invalid';
        }

        // event_type enum
        if (!in_array($event['event_type'] ?? '', self::VALID_EVENT_TYPES, true)) {
            $errors[] = 'event_type_not_in_enum';
        }

        // timestamp_ms sanity
        $ts = $event['timestamp_ms'] ?? 0;
        if (!is_int($ts) || $ts < 1700000000000) {
            $errors[] = 'timestamp_ms_too_old_or_invalid';
        }

        return $errors;
    }

    /**
     * Dispatches a validated event. Phase 1 logs to error_log only.
     * Returns a result struct compatible with the endpoint response schema.
     *
     * @param string $sessionId Channel session id
     * @param array  $event     Validated event payload
     * @return array            ['session_id','event_type','qoe_score','decision']
     */
    public static function dispatch(string $sessionId, array $event): array
    {
        $type = $event['event_type'];
        $data = $event['data'] ?? [];

        // Compute a placeholder QoE score until full state-tracking arrives (Phase 2)
        $qoeScore = self::computeStubQoE($type, $data);

        // Decision engine (paridad con DecisionEngine de conviva-qoe-engine.js)
        $decision = self::decide($type, $data, $qoeScore);

        // Phase 1: log only (no persistence)
        $logLine = sprintf(
            '[conviva-event] session=%s player=%s channel=%s event=%s qoe=%d decision=%s',
            $sessionId,
            $event['player'],
            $event['channel']['id'] ?? '?',
            $type,
            $qoeScore,
            $decision
        );
        error_log($logLine);

        return [
            'session_id' => $sessionId,
            'event_type' => $type,
            'qoe_score'  => $qoeScore,
            'decision'   => $decision,
        ];
    }

    /**
     * Phase 1 QoE placeholder.
     * Phase 2 will track per-session state across multiple events.
     */
    private static function computeStubQoE(string $type, array $data): int
    {
        switch ($type) {
            case 'first_frame':
                // Penalize slow startup
                $vst = (int)($data['startup_time_ms'] ?? 0);
                if ($vst > 8000) return 30;
                if ($vst > 4000) return 50;
                if ($vst > 2000) return 70;
                return 90;

            case 'rebuffer_start':
                return 40;

            case 'rebuffer_end':
                return 70;

            case 'error':
                return 25;

            case 'end_session':
                return (int)($data['final_qoe'] ?? 75);

            default:
                return 75;
        }
    }

    /**
     * Decision engine — paridad con DecisionEngine en conviva-qoe-engine.js.
     */
    private static function decide(string $type, array $data, int $qoeScore): string
    {
        $rbr = (float)($data['rebuffer_ratio'] ?? 0);
        $fdr = (int)($data['frame_drop_rate'] ?? 0);
        $vst = (int)($data['startup_time_ms'] ?? 0);

        // Order matches client side: most restrictive first
        if ($rbr > self::RBR_SURVIVAL_THRESHOLD) {
            return 'FORCE_SURVIVAL_MODE';
        }
        if ($qoeScore < self::QOE_DEGRADE_THRESHOLD) {
            return 'DEGRADE_QUALITY';
        }
        if ($fdr > self::FDR_REDUCE_LOAD_THRESHOLD) {
            return 'REDUCE_DECODER_LOAD';
        }
        if ($vst > self::VST_PRELOAD_THRESHOLD_MS) {
            return 'PRELOAD_NEXT_CHANNEL';
        }
        if ($qoeScore >= self::QOE_PROMOTE_THRESHOLD) {
            return 'PROMOTE_QUALITY';
        }
        return 'NO_ACTION';
    }
}
