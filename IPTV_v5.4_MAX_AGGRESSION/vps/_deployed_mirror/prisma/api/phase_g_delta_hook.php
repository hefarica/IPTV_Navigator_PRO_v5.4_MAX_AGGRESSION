<?php
declare(strict_types=1);

/**
 * Hook additivo para conviva-event.php (Council-safe cherry-pick).
 * Llamar SOLO cuando Phase G decida rollback PQ/HDR Y el gate anti-flap
 * (ape_pq_should_emit_ara_rollback) lo autorice. NO se llama incondicional.
 */

require_once __DIR__ . '/../lib/ape_mesh.php';

if (!function_exists('ape_phase_g_emit_delta')) {
    function ape_phase_g_emit_delta(array $event, string $reason = 'phase_g_rollback', array $meta = array()): ?int {
        $deviceId = null;
        if (isset($event['device_id'])) {
            $deviceId = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)$event['device_id']);
        }
        $channelId = null;
        if (isset($event['channel']['id'])) {
            $channelId = ape_normalize_channel_id($event['channel']['id']);
        } elseif (isset($event['channel_id'])) {
            $channelId = ape_normalize_channel_id($event['channel_id']);
        }
        $payload = array(
            'type' => 'device-setting',
            'reason' => $reason,
            'settings' => array(
                'hdr_conversion_mode' => 0,
                'video_range' => 'SDR',
                'pq_profile' => 'SDR_FORCE',
            ),
            'risk' => array(
                'rollback' => 'PQ_TO_SDR',
                'freezeless' => true,
                'anti_flap_required' => true,
            ),
            'meta' => $meta,
        );
        return ape_insert_delta($deviceId ?: null, $channelId ?: null, 'device-setting', $payload, array(
            'priority' => 95,
            'ttl_seconds' => 1800,
            'source' => 'phase_g',
        ));
    }
}
