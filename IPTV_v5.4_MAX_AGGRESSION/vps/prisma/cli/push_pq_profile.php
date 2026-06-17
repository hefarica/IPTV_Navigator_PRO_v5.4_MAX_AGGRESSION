<?php
/**
 * push_pq_profile.php — empuja un perfil AI-PQ (pipeline VPP por hardware) al ARA via URL-2.
 *
 * El device (ej. Fire TV MediaTek) expone su VPP por settings: AI super-resolution,
 * AI-PQ, denoise, sharpness, HDR-PQ. Este CLI inserta un policy_delta que el ARA aplica
 * (allowlisted, gateado a MTK) y PERSISTE (enforcer). Post-procesado REAL sobre el stream
 * decodificado, en cualquier player — sin transcode, sin tocar la URL de playback.
 *
 * Uso:  php push_pq_profile.php [perfil] [device_id] [channel_id]
 *   perfil: max_image (default) | sports | cinema | off
 *   device_id vacio  -> broadcast (todos los ARA)
 *
 * Wire sugerido: invocarlo cuando el ARA hace heartbeat (nuevo device) o por canal/ct desde el mesh.
 */
declare(strict_types=1);
require_once __DIR__ . '/../lib/ape_mesh.php';

if (!function_exists('ape_pq_profile')) {
    function ape_pq_profile(string $name): array {
        // Levers AI-PQ MediaTek (bare keys; el ARA mapea ns y allowlistea). Valores = max calidad.
        $base = array(
            'pq_ai_sr_enable' => 1, 'ai_sr_level' => 3,      // AI super-resolution
            'ai_pq_mode' => 3, 'aipq_enable' => 1,           // AI picture quality
            'pq_sharpness_enable' => 1,                       // sharpness
            'pq_ai_dnr_enable' => 1, 'pq_dnr_enable' => 1, 'pq_nr_enable' => 1, // denoise (anti ruido MPEG)
            'pq_ai_fbc_enable' => 1,                          // AI frame/block comp
            'pq_hdr_enable' => 1, 'pq_hdr_mode' => 1,         // HDR-PQ
            'match_content_frame_rate' => 1, 'hdr_conversion_mode' => 1,
        );
        switch ($name) {
            case 'off':    foreach ($base as $k => $v) { $base[$k] = ($k === 'ai_sr_level' || $k === 'ai_pq_mode') ? 0 : 0; } return $base;
            case 'sports': $base['pq_ai_dnr_enable'] = 0; $base['pq_dnr_enable'] = 0; return $base; // preserva textura en movimiento
            case 'cinema': return $base;                                                            // SR+denoise full
            case 'max_image': default: return $base;
        }
    }
}

$profile = isset($argv[1]) && $argv[1] !== '' ? preg_replace('/[^a-z_]/', '', strtolower($argv[1])) : 'max_image';
$device  = isset($argv[2]) && $argv[2] !== '' ? preg_replace('/[^0-9A-Za-z_.\-]/', '', $argv[2]) : null;
$channel = isset($argv[3]) && $argv[3] !== '' ? ape_normalize_channel_id($argv[3]) : null;

$s = ape_pq_profile($profile);
$id = ape_insert_delta($device, $channel, 'device-setting',
    array('settings' => $s, 'profile' => 'PQ_' . strtoupper($profile)),
    array('source' => 'pq-profile', 'ttl_seconds' => 1800, 'priority' => 80));

echo "pushed PQ profile '{$profile}' -> policy_delta id={$id} (" . count($s) . " levers, device=" . ($device ?: 'broadcast') . ", channel=" . ($channel ?: 'any') . ")\n";
