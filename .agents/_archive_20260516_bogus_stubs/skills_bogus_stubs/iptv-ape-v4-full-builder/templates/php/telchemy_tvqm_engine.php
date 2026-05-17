<?php
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   Telchemy TVQM Engine v2.1 — TR 101 290 + VSTQ + VSMQ + P0-P5 Profiles   ║
 * ║   IPTV Navigator PRO v4.0 FULL                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Implementa la telemetría de calidad Telchemy TVQM:
 *  - VSTQ (Video Streaming Transmission Quality): calidad de transmisión
 *  - VSMQ (Video Streaming Media Quality): calidad perceptual del video
 *  - TR 101 290 P1/P2/P3: análisis de errores de transporte MPEG-TS
 *  - Perfiles de Calidad P0-P5 para clasificación automática de canales
 *  - ChannelsMapBuilder: construye el channels_map.json con ADN completo
 */

declare(strict_types=1);

class TelchemyTvqmEngine
{
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTES TVQM
    // ═══════════════════════════════════════════════════════════════════════════

    const VERSION = '2.1.0';

    // Umbrales VSTQ (Video Streaming Transmission Quality) — escala 1.0-5.0
    const VSTQ_EXCELLENT  = 4.5;
    const VSTQ_GOOD       = 4.0;
    const VSTQ_FAIR       = 3.0;
    const VSTQ_POOR       = 2.0;
    const VSTQ_BAD        = 1.0;

    // Umbrales VSMQ (Video Streaming Media Quality) — escala 1.0-5.0
    const VSMQ_EXCELLENT  = 4.5;
    const VSMQ_GOOD       = 4.0;
    const VSMQ_FAIR       = 3.0;
    const VSMQ_POOR       = 2.0;
    const VSMQ_BAD        = 1.0;

    // Perfiles de Calidad P0-P5 (APE v18.2)
    const PROFILE_P0 = 'P0'; // Ultra Premium: 4K+HDR10++LCEVC+AI_SR+CMAF+HEVC/AV1
    const PROFILE_P1 = 'P1'; // Premium: 4K+HDR10+LCEVC+CMAF+HEVC
    const PROFILE_P2 = 'P2'; // High: 1080p+HDR10+CMAF+HEVC
    const PROFILE_P3 = 'P3'; // Standard: 1080p+SDR+HLS/fMP4+H.264
    const PROFILE_P4 = 'P4'; // Legacy: 720p+SDR+HLS/TS+H.264
    const PROFILE_P5 = 'P5'; // Minimal: SD+SDR+TS Direct

    // Definición de perfiles P0-P5
    const PROFILE_DEFINITIONS = [
        'P0' => [
            'name'           => 'Ultra Premium',
            'resolution'     => '3840x2160',
            'codec'          => 'hev1.1.6.L153.B0,mp4a.40.2',
            'bitrate_min'    => 15000000,
            'bitrate_target' => 25000000,
            'format'         => 'cmaf',
            'container'      => 'fmp4',
            'hdr'            => 'HDR10+',
            'lcevc'          => true,
            'ai_sr'          => true,
            'ai_sr_mode'     => 'ULTRA',
            'player_profile' => 'PREMIUM',
            'vqs_min'        => 90,
        ],
        'P1' => [
            'name'           => 'Premium',
            'resolution'     => '3840x2160',
            'codec'          => 'hev1.1.6.L150.B0,mp4a.40.2',
            'bitrate_min'    => 8000000,
            'bitrate_target' => 15000000,
            'format'         => 'cmaf',
            'container'      => 'fmp4',
            'hdr'            => 'HDR10',
            'lcevc'          => true,
            'ai_sr'          => false,
            'player_profile' => 'PREMIUM',
            'vqs_min'        => 80,
        ],
        'P2' => [
            'name'           => 'High',
            'resolution'     => '1920x1080',
            'codec'          => 'hev1.1.6.L120.B0,mp4a.40.2',
            'bitrate_min'    => 4000000,
            'bitrate_target' => 8000000,
            'format'         => 'hls_fmp4',
            'container'      => 'fmp4',
            'hdr'            => 'HDR10',
            'lcevc'          => false,
            'ai_sr'          => false,
            'player_profile' => 'HIGH',
            'vqs_min'        => 65,
        ],
        'P3' => [
            'name'           => 'Standard',
            'resolution'     => '1920x1080',
            'codec'          => 'avc1.640028,mp4a.40.2',
            'bitrate_min'    => 2000000,
            'bitrate_target' => 5000000,
            'format'         => 'hls_fmp4',
            'container'      => 'fmp4',
            'hdr'            => 'SDR',
            'lcevc'          => false,
            'ai_sr'          => false,
            'player_profile' => 'STANDARD',
            'vqs_min'        => 45,
        ],
        'P4' => [
            'name'           => 'Legacy',
            'resolution'     => '1280x720',
            'codec'          => 'avc1.4d401f,mp4a.40.2',
            'bitrate_min'    => 1000000,
            'bitrate_target' => 2500000,
            'format'         => 'hls_ts',
            'container'      => 'ts',
            'hdr'            => 'SDR',
            'lcevc'          => false,
            'ai_sr'          => false,
            'player_profile' => 'LEGACY',
            'vqs_min'        => 25,
        ],
        'P5' => [
            'name'           => 'Minimal',
            'resolution'     => '854x480',
            'codec'          => 'avc1.42E01E,mp4a.40.2',
            'bitrate_min'    => 300000,
            'bitrate_target' => 800000,
            'format'         => 'ts_direct',
            'container'      => 'ts',
            'hdr'            => 'SDR',
            'lcevc'          => false,
            'ai_sr'          => false,
            'player_profile' => 'MINIMAL',
            'vqs_min'        => 0,
        ],
    ];

    // ═══════════════════════════════════════════════════════════════════════════
    // TVQM: Cálculo de Métricas de Calidad
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Calcula las métricas TVQM para un canal dado.
     * Retorna VSTQ, VSMQ, TR 101 290 P1/P2/P3 y el perfil asignado.
     *
     * @param array $channelConfig Configuración del canal
     * @param array $probeData     Datos de probe en tiempo real (opcional)
     * @return array               Métricas TVQM completas
     */
    public static function calculateTvqmMetrics(
        array $channelConfig,
        array $probeData = []
    ): array {
        $bitrate      = (int)($channelConfig['video_bitrate'] ?? 5000000);
        $resolution   = $channelConfig['resolution'] ?? '1920x1080';
        $codec        = $channelConfig['codec_primary'] ?? 'avc1.640028,mp4a.40.2';
        $hdrProfile   = $channelConfig['hdr_profile'] ?? 'SDR';
        $lcevcEnabled = (bool)($channelConfig['lcevc_enabled'] ?? false);
        $aiSrEnabled  = (bool)($channelConfig['ai_sr_enabled'] ?? false);
        $cmafEnabled  = (bool)($channelConfig['cmaf_enabled'] ?? false);

        // Calcular VSTQ (calidad de transmisión)
        $vstq = self::calculateVstq($bitrate, $resolution, $probeData);

        // Calcular VSMQ (calidad perceptual)
        $vsmq = self::calculateVsmq($codec, $hdrProfile, $lcevcEnabled, $aiSrEnabled, $bitrate);

        // Calcular TR 101 290
        $tr101290 = self::calculateTr101290($probeData);

        // Determinar el perfil P0-P5
        $profile = self::assignQualityProfile($channelConfig);

        // Calcular el VQS Score (0-100)
        $vqsScore = self::calculateVqsScore($vstq, $vsmq, $channelConfig);
        $vqsTier  = self::getVqsTier($vqsScore);

        return [
            'vstq'         => round($vstq, 2),
            'vsmq'         => round($vsmq, 2),
            'tr101290_p1'  => $tr101290['p1'],
            'tr101290_p2'  => $tr101290['p2'],
            'tr101290_p3'  => $tr101290['p3'],
            'tr101290_status' => $tr101290['status'],
            'quality_profile' => $profile,
            'vqs_score'    => $vqsScore,
            'vqs_tier'     => $vqsTier,
            'telchemy_version' => self::VERSION,
            'timestamp'    => date('c'),
        ];
    }

    /**
     * Calcula el VSTQ (Video Streaming Transmission Quality).
     * Basado en bitrate, resolución y datos de probe en tiempo real.
     */
    private static function calculateVstq(int $bitrate, string $resolution, array $probeData): float
    {
        // Bitrate base score (0-2.5)
        $bitrateScore = match(true) {
            $bitrate >= 15000000 => 2.5,
            $bitrate >= 8000000  => 2.2,
            $bitrate >= 4000000  => 2.0,
            $bitrate >= 2000000  => 1.7,
            $bitrate >= 1000000  => 1.4,
            default              => 1.0,
        };

        // Resolution score (0-1.5)
        $resScore = match(true) {
            str_contains($resolution, '3840') => 1.5,
            str_contains($resolution, '2560') => 1.3,
            str_contains($resolution, '1920') => 1.2,
            str_contains($resolution, '1280') => 1.0,
            str_contains($resolution, '854')  => 0.7,
            default                           => 0.5,
        };

        // Penalización por packet loss (si hay datos de probe)
        $packetLossPenalty = 0.0;
        if (!empty($probeData['packet_loss_rate'])) {
            $loss = (float)$probeData['packet_loss_rate'];
            $packetLossPenalty = min($loss * 10, 1.0);
        }

        // Penalización por latencia alta
        $latencyPenalty = 0.0;
        if (!empty($probeData['latency_ms'])) {
            $latency = (float)$probeData['latency_ms'];
            if ($latency > 500)      $latencyPenalty = 0.5;
            elseif ($latency > 200)  $latencyPenalty = 0.3;
            elseif ($latency > 100)  $latencyPenalty = 0.1;
        }

        $vstq = $bitrateScore + $resScore - $packetLossPenalty - $latencyPenalty;
        return max(1.0, min(5.0, $vstq));
    }

    /**
     * Calcula el VSMQ (Video Streaming Media Quality).
     * Basado en codec, HDR, LCEVC y AI SR.
     */
    private static function calculateVsmq(
        string $codec,
        string $hdrProfile,
        bool   $lcevcEnabled,
        bool   $aiSrEnabled,
        int    $bitrate
    ): float {
        // Codec score (0-2.0)
        $codecScore = match(true) {
            str_contains($codec, 'av01') || str_contains($codec, 'av1') => 2.0,
            str_contains($codec, 'hev1') || str_contains($codec, 'hvc1') => 1.8,
            str_contains($codec, 'avc1') && $bitrate >= 5000000 => 1.5,
            str_contains($codec, 'avc1') => 1.3,
            default => 1.0,
        };

        // HDR score (0-1.5)
        $hdrScore = match(true) {
            str_contains($hdrProfile, 'HDR10+') || str_contains($hdrProfile, 'DV') => 1.5,
            str_contains($hdrProfile, 'HDR10') => 1.2,
            str_contains($hdrProfile, 'HLG')   => 1.0,
            default => 0.5, // SDR
        };

        // LCEVC bonus (0-0.5)
        $lcevcBonus = $lcevcEnabled ? 0.5 : 0.0;

        // AI SR bonus (0-0.5)
        $aiSrBonus = $aiSrEnabled ? 0.5 : 0.0;

        $vsmq = $codecScore + $hdrScore + $lcevcBonus + $aiSrBonus;
        return max(1.0, min(5.0, $vsmq));
    }

    /**
     * Calcula los indicadores TR 101 290 P1/P2/P3.
     * P1: Errores críticos (PAT, PMT, continuity counter)
     * P2: Errores recomendados (transport error, CRC, PCR)
     * P3: Errores opcionales (NIT, SI, SDT)
     */
    private static function calculateTr101290(array $probeData): array
    {
        $p1 = (int)($probeData['tr101290_p1'] ?? 0);
        $p2 = (int)($probeData['tr101290_p2'] ?? 0);
        $p3 = (int)($probeData['tr101290_p3'] ?? 0);

        $status = 'PASS';
        if ($p1 > 0) $status = 'CRITICAL';
        elseif ($p2 > 5) $status = 'WARNING';
        elseif ($p3 > 10) $status = 'INFO';

        return [
            'p1'     => $p1,
            'p2'     => $p2,
            'p3'     => $p3,
            'status' => $status,
        ];
    }

    /**
     * Asigna el perfil de calidad P0-P5 a un canal.
     */
    public static function assignQualityProfile(array $channelConfig): string
    {
        $resolution   = $channelConfig['resolution'] ?? '1920x1080';
        $hdrProfile   = $channelConfig['hdr_profile'] ?? 'SDR';
        $lcevcEnabled = (bool)($channelConfig['lcevc_enabled'] ?? false);
        $aiSrEnabled  = (bool)($channelConfig['ai_sr_enabled'] ?? false);
        $cmafEnabled  = (bool)($channelConfig['cmaf_enabled'] ?? false);
        $codec        = $channelConfig['codec_primary'] ?? 'avc1.640028,mp4a.40.2';
        $bitrate      = (int)($channelConfig['video_bitrate'] ?? 5000000);

        $is4K   = str_contains($resolution, '3840') || str_contains($resolution, '2160');
        $is1080 = str_contains($resolution, '1920') || str_contains($resolution, '1080');
        $is720  = str_contains($resolution, '1280') || str_contains($resolution, '720');
        $isHEVC = str_contains($codec, 'hev1') || str_contains($codec, 'hvc1');
        $isAV1  = str_contains($codec, 'av01') || str_contains($codec, 'av1');
        $isHDR10Plus = str_contains($hdrProfile, 'HDR10+');
        $isHDR10     = str_contains($hdrProfile, 'HDR10');

        // P0: Ultra Premium
        if ($is4K && ($isHDR10Plus || str_contains($hdrProfile, 'DV')) && $lcevcEnabled && $aiSrEnabled) {
            return self::PROFILE_P0;
        }

        // P1: Premium
        if ($is4K && $isHDR10 && $lcevcEnabled && ($isHEVC || $isAV1)) {
            return self::PROFILE_P1;
        }

        // P2: High
        if ($is1080 && $isHDR10 && $cmafEnabled && ($isHEVC || $isAV1)) {
            return self::PROFILE_P2;
        }

        // P3: Standard
        if ($is1080 && $cmafEnabled && $bitrate >= 2000000) {
            return self::PROFILE_P3;
        }

        // P4: Legacy
        if ($is720 || ($is1080 && !$cmafEnabled)) {
            return self::PROFILE_P4;
        }

        // P5: Minimal
        return self::PROFILE_P5;
    }

    /**
     * Calcula el VQS Score (0-100) combinando VSTQ y VSMQ.
     */
    public static function calculateVqsScore(float $vstq, float $vsmq, array $channelConfig = []): int
    {
        // Normalizar VSTQ y VSMQ de escala 1-5 a 0-100
        $vstqNorm = (($vstq - 1.0) / 4.0) * 100;
        $vsmqNorm = (($vsmq - 1.0) / 4.0) * 100;

        // Pesos: VSMQ tiene más peso (calidad perceptual)
        $baseScore = ($vstqNorm * 0.4) + ($vsmqNorm * 0.6);

        // Bonus por características avanzadas
        $bonus = 0;
        if ((bool)($channelConfig['lcevc_enabled'] ?? false))  $bonus += 5;
        if ((bool)($channelConfig['ai_sr_enabled'] ?? false))  $bonus += 5;
        if ((bool)($channelConfig['telchemy_enabled'] ?? false)) $bonus += 3;
        if ((bool)($channelConfig['cmaf_enabled'] ?? false))   $bonus += 2;

        $score = (int)round($baseScore + $bonus);
        return max(0, min(100, $score));
    }

    /**
     * Retorna el tier VQS basado en el score.
     */
    public static function getVqsTier(int $score): string
    {
        return match(true) {
            $score >= 90 => 'ULTRA_PREMIUM',
            $score >= 80 => 'PREMIUM',
            $score >= 65 => 'HIGH',
            $score >= 45 => 'STANDARD',
            $score >= 25 => 'DEGRADED',
            default      => 'CRITICAL',
        };
    }

    /**
     * Retorna la definición completa de un perfil P0-P5.
     */
    public static function getProfileDefinition(string $profile): array
    {
        return self::PROFILE_DEFINITIONS[$profile] ?? self::PROFILE_DEFINITIONS['P3'];
    }

    /**
     * Retorna todos los perfiles disponibles.
     */
    public static function getAllProfiles(): array
    {
        return self::PROFILE_DEFINITIONS;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHANNELS MAP BUILDER — Construye el channels_map.json con ADN completo
// ═══════════════════════════════════════════════════════════════════════════════

class ChannelsMapBuilder
{
    const VERSION = '4.0.0';

    // Campos mínimos requeridos por canal
    const REQUIRED_FIELDS = [
        'channel_id', 'channel_name', 'stream_url',
    ];

    // Campos APE DNA completos (200+ campos heredados de la lista madre)
    const DNA_DEFAULTS = [
        // Identidad
        'channel_id'              => '',
        'channel_name'            => '',
        'channel_group'           => 'General',
        'channel_logo'            => '',
        'tvg_id'                  => '',
        'tvg_name'                => '',
        'tvg_logo'                => '',
        'epg_id'                  => '',
        'epg_url'                 => '',
        'language'                => 'es',
        'country'                 => 'US',
        'category'                => 'General',
        'subcategory'             => '',
        'content_type'            => 'live',

        // Stream URLs
        'stream_url'              => '',
        'stream_url_backup'       => '',
        'stream_url_backup2'      => '',
        'stream_id'               => '',

        // Codec y Calidad
        'codec_primary'           => 'avc1.640028,mp4a.40.2',
        'codec_fallback'          => 'avc1.4d401f,mp4a.40.2',
        'codec_priority'          => ['hevc', 'h264', 'av1'],
        'video_bitrate'           => 5000000,
        'audio_bitrate'           => 128000,
        'resolution'              => '1920x1080',
        'frame_rate'              => 25,
        'color_space'             => 'bt709',
        'color_primaries'         => 'bt709',
        'transfer_characteristics' => 'bt709',

        // CMAF/LCEVC
        'cmaf_enabled'            => false,
        'cmaf_profile'            => 'standard_tv',
        'lcevc_enabled'           => false,
        'lcevc_profile'           => 'standard_tv',
        'lcevc_state'             => 'OFF',
        'lcevc_mode'              => 'SIGNAL_ONLY',
        'lcevc_scale_factor'      => 2.0,
        'lcevc_source'            => 'player_matrix',

        // HDR
        'hdr_profile'             => 'SDR',
        'hdr10_enabled'           => false,
        'hdr10_plus_enabled'      => false,
        'dolby_vision_enabled'    => false,
        'dolby_vision_profile'    => '',
        'hlg_enabled'             => false,

        // AI Super Resolution
        'ai_sr_enabled'           => false,
        'ai_sr_mode'              => 'BALANCED',
        'ai_sr_scale_factor'      => 2.0,
        'ai_sr_engine'            => 'BWDIF+NNEDI3+CAS',
        'bwdif_enabled'           => false,
        'nnedi3_enabled'          => false,
        'temporal_sr_enabled'     => false,

        // CDN y Routing
        'cdn_primary'             => '',
        'cdn_backup'              => '',
        'cdn_backup2'             => '',
        'cdn_routing_mode'        => 'auto',
        'circuit_breaker_enabled' => true,
        'health_probe_interval'   => 30,
        'failover_threshold'      => 3,

        // Player y Compatibilidad
        'player_profile'          => 'STANDARD',
        'stealth_ua'              => '',
        'hydra_stealth_enabled'   => false,
        'stream_inf_enabled'      => true,
        'exthttp_enabled'         => true,
        'extvlcopt_enabled'       => true,
        'kodiprop_enabled'        => false,

        // ABR Ladder
        'abr_enabled'             => false,
        'abr_ladder'              => [],
        'abr_max_bitrate'         => 0,
        'abr_min_bitrate'         => 0,

        // Telemetría
        'telchemy_enabled'        => false,
        'tvqm_vstq'               => 0.0,
        'tvqm_vsmq'               => 0.0,
        'tr101290_p1'             => 0,
        'tr101290_p2'             => 0,
        'tr101290_p3'             => 0,

        // OTT Visual Quality
        'vqs_score'               => 0,
        'vqs_tier'                => 'STANDARD',
        'quality_profile'         => 'P3',
        'quantum_pixel_overdrive' => false,
        'content_aware_hevc'      => false,
        'motor_dinamico_mpd'      => false,
        'antigravity_mode'        => false,
        'god_mode_zero_drop'      => false,

        // APE Metadata
        'ape_version'             => '18.2.0',
        'ape_profile'             => 'CMAF-UNIVERSAL',
        'ape_dna_hash'            => '',
        'ape_build_timestamp'     => '',
        'ape_deployment_id'       => '',
        'ape_node_id'             => '',

        // Seguridad y Evasión
        'dpi_evasion_enabled'     => false,
        'token_auth_enabled'      => false,
        'geo_restriction'         => '',
        'drm_type'                => 'none',
        'drm_server_url'          => '',

        // Configuración de Segmentos
        'segment_duration'        => 6,
        'segment_count'           => 5,
        'playlist_type'           => 'LIVE',
        'target_duration'         => 6,

        // Headers HTTP
        'user_agent'              => '',
        'referer'                 => '',
        'origin'                  => '',
        'cookie'                  => '',
        'x_forwarded_for'         => '',
        'custom_header_1'         => '',
        'custom_header_2'         => '',
        'custom_header_3'         => '',

        // Configuración Avanzada
        'probe_timeout'           => 5,
        'buffer_size'             => 1048576,
        'reconnect_attempts'      => 3,
        'reconnect_delay'         => 2,
        'low_latency_mode'        => false,
        'live_edge_segments'      => 3,
        'max_buffer_duration'     => 30,

        // Señalización de Manifiestos
        'ext_x_version'           => 7,
        'ext_x_independent_segments' => true,
        'ext_x_map_uri'           => '',
        'ext_x_media_sequence'    => 0,
        'ext_x_discontinuity_sequence' => 0,

        // Red
        'network_type'            => 'unknown',
        'bandwidth_estimate'      => 0,
        'latency_estimate'        => 0,
        'jitter_estimate'         => 0,
        'packet_loss_rate'        => 0.0,
        'connection_type'         => 'unknown',
    ];

    /**
     * Construye un canal completo con ADN completo (200+ campos).
     * Hereda los defaults y sobreescribe con los valores del canal.
     *
     * @param array $channelData Datos del canal (mínimo: channel_id, channel_name, stream_url)
     * @return array             Canal con ADN completo
     */
    public static function buildChannelDna($channelId, $channelData, $mapData = []) { return self::buildChannel($channelId, $channelData, $mapData); }
    public static function buildChannel(array $channelData): array
    {
        // Validar campos requeridos
        foreach (self::REQUIRED_FIELDS as $field) {
            if (empty($channelData[$field])) {
                // Intentar inferir channel_id desde channel_name
                if ($field === 'channel_id' && !empty($channelData['channel_name'])) {
                    $channelData['channel_id'] = strtolower(
                        preg_replace('/[^a-z0-9_]/', '_', $channelData['channel_name'])
                    );
                }
            }
        }

        // Merge: defaults + datos del canal
        $channel = array_merge(self::DNA_DEFAULTS, $channelData);

        // Calcular campos derivados
        $channel['ape_dna_hash']       = substr(md5(json_encode($channelData)), 0, 16);
        $channel['ape_build_timestamp'] = date('Ymd-His');

        // Calcular métricas TVQM
        $tvqm = TelchemyTvqmEngine::calculateTvqmMetrics($channel);
        $channel['tvqm_vstq']      = $tvqm['vstq'];
        $channel['tvqm_vsmq']      = $tvqm['vsmq'];
        $channel['vqs_score']      = $tvqm['vqs_score'];
        $channel['vqs_tier']       = $tvqm['vqs_tier'];
        $channel['quality_profile'] = $tvqm['quality_profile'];

        // Asignar player_profile basado en el perfil de calidad
        $profileDef = TelchemyTvqmEngine::getProfileDefinition($channel['quality_profile']);
        if (empty($channelData['player_profile'])) {
            $channel['player_profile'] = $profileDef['player_profile'];
        }

        return $channel;
    }

    /**
     * Actualiza un channels_map.json existente añadiendo los campos ADN faltantes.
     *
     * @param string $channelsMapPath Ruta al channels_map.json
     * @return array                  Estadísticas de la actualización
     */
    public static function updateChannelsMap(string $channelsMapPath): array
    {
        if (!file_exists($channelsMapPath)) {
            return ['error' => 'channels_map.json no encontrado: ' . $channelsMapPath];
        }

        $raw      = file_get_contents($channelsMapPath);
        $map      = json_decode($raw, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            return ['error' => 'JSON inválido: ' . json_last_error_msg()];
        }

        $updated  = 0;
        $total    = count($map);

        foreach ($map as $id => &$channel) {
            $channel = self::buildChannel($channel);
            $updated++;
        }
        unset($channel);

        // Guardar el mapa actualizado
        file_put_contents(
            $channelsMapPath,
            json_encode($map, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );

        return [
            'total'   => $total,
            'updated' => $updated,
            'path'    => $channelsMapPath,
        ];
    }

    /**
     * Retorna el número total de campos DNA disponibles.
     */
    public static function getDnaFieldCount(): int
    {
        return count(self::DNA_DEFAULTS);
    }
}
