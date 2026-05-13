<?php
declare(strict_types=1);
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LCEVC State Engine v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implementa el modelo de 4 estados operativos para LCEVC dentro del
 * pipeline CMAF de IPTV Navigator PRO.
 *
 * Estados:
 *   OFF              → LCEVC completamente desactivado.
 *   SIGNAL_ONLY      → Solo metadata APE. No hay enhancement real.
 *   PACKAGED         → Media validado con enhancement LCEVC real.
 *   PLAYER_VALIDATED → Reproducción E2E confirmada con player compatible.
 *
 * AUTOR: Manus AI
 * VERSIÓN: 1.0.0
 * FECHA: 2026-03-15
 * ═══════════════════════════════════════════════════════════════════════════
 */

class LcevcStateEngine
{
    // ─────────────────────────────────────────────────────────────────────
    // CONSTANTES DE ESTADO
    // ─────────────────────────────────────────────────────────────────────
    const STATE_OFF              = 'OFF';
    const STATE_SIGNAL_ONLY      = 'SIGNAL_ONLY';
    const STATE_PACKAGED         = 'PACKAGED';
    const STATE_PLAYER_VALIDATED = 'PLAYER_VALIDATED';

    // ─────────────────────────────────────────────────────────────────────
    // MATRIZ DE PLAYERS CON SOPORTE LCEVC VALIDADO
    // Basado en documentación oficial de V-Nova:
    //   https://docs.v-nova.com/technologies/mpeg-5.lcevc/integrations/
    // ─────────────────────────────────────────────────────────────────────
    const PLAYER_MATRIX = [
        // Player                     | Soporte LCEVC | Estado máximo
        // ── Players with full LCEVC support (PLAYER_VALIDATED) ──────────────
        'ExoPlayer'         => ['supported' => true,  'max_state' => self::STATE_PLAYER_VALIDATED,
                                'transport' => ['sei_nal', 'mpeg_ts_pid'],
                                'l1_support' => true, 'l2_support' => true, 'parallel' => true],
        'Shaka'             => ['supported' => true,  'max_state' => self::STATE_PLAYER_VALIDATED,
                                'transport' => ['sei_nal', 'webm_metadata'],
                                'l1_support' => true, 'l2_support' => true, 'parallel' => true],
        'ExoPlayer2'        => ['supported' => true,  'max_state' => self::STATE_PLAYER_VALIDATED,
                                'transport' => ['sei_nal', 'mpeg_ts_pid'],
                                'l1_support' => true, 'l2_support' => true, 'parallel' => true],
        // ── Players with packaged LCEVC support (PACKAGED) ───────────────────
        'hls.js'            => ['supported' => true,  'max_state' => self::STATE_PACKAGED,
                                'transport' => ['sei_nal'],
                                'l1_support' => true, 'l2_support' => false, 'parallel' => false],
        'dash.js'           => ['supported' => true,  'max_state' => self::STATE_PACKAGED,
                                'transport' => ['sei_nal', 'webm_metadata'],
                                'l1_support' => true, 'l2_support' => false, 'parallel' => false],
        'Video.js'          => ['supported' => true,  'max_state' => self::STATE_PACKAGED,
                                'transport' => ['sei_nal'],
                                'l1_support' => true, 'l2_support' => false, 'parallel' => false],
        // ── Players with SIGNAL_ONLY (metadata passthrough, base codec plays) ─
        'OTT Navigator'     => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'TiviMate'          => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'VLC'               => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'Kodi'              => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'Tivimate'          => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'MX Player'         => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'Perfect Player'    => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'IPTV Smarters'     => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'GSE Smart IPTV'    => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'Plex'              => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'Infuse'            => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'Emby'              => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'Jellyfin'          => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'Stremio'           => ['supported' => false, 'max_state' => self::STATE_SIGNAL_ONLY,
                                'transport' => ['sei_nal'],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        // ── Players where LCEVC must be OFF (base codec only) ────────────────
        'Safari'            => ['supported' => false, 'max_state' => self::STATE_OFF,
                                'transport' => [],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'AVPlayer'          => ['supported' => false, 'max_state' => self::STATE_OFF,
                                'transport' => [],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
        'QuickTime'         => ['supported' => false, 'max_state' => self::STATE_OFF,
                                'transport' => [],
                                'l1_support' => false, 'l2_support' => false, 'parallel' => false],
    ];

    // ─────────────────────────────────────────────────────────────────────
    // MÉTODOS PÚBLICOS
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Determina el estado LCEVC efectivo para un canal y una petición.
     *
     * @param array  $channelConfig  Configuración del canal desde channels_map.json
     * @param string $playerName     Nombre del reproductor detectado
     * @param bool   $mediaValidated Si el media ha sido validado con ffprobe
     * @param bool   $e2eValidated   Si la reproducción E2E ha sido confirmada
     * @return string Estado LCEVC efectivo (una de las constantes STATE_*)
     */
    public static function determineState($channelConfig, $playerCapabilities = []) { return self::resolveState($channelConfig, $playerCapabilities); }
    public static function resolveState(
        array $channelConfig,
        string $playerName,
        bool $mediaValidated = false,
        bool $e2eValidated = false
    ): string {
        // 1. Si el canal no tiene LCEVC habilitado → OFF
        if (empty($channelConfig['lcevc_enabled'])) {
            return self::STATE_OFF;
        }

        // 2. Obtener el estado máximo permitido para este player
        $playerMaxState = self::getPlayerMaxState($playerName);

        // 3. Si el player no puede recibir ni señalización → OFF
        if ($playerMaxState === self::STATE_OFF) {
            return self::STATE_OFF;
        }

        // 4. Si el media no ha sido validado → SIGNAL_ONLY como máximo
        if (!$mediaValidated) {
            return self::STATE_SIGNAL_ONLY;
        }

        // 5. Si el media está validado pero el player no soporta LCEVC real
        if ($playerMaxState === self::STATE_SIGNAL_ONLY) {
            return self::STATE_SIGNAL_ONLY;
        }

        // 6. Si el media está validado y el player soporta LCEVC
        if (!$e2eValidated) {
            return self::STATE_PACKAGED;
        }

        // 7. Si todo está validado → PLAYER_VALIDATED
        if ($playerMaxState === self::STATE_PLAYER_VALIDATED) {
            return self::STATE_PLAYER_VALIDATED;
        }

        return self::STATE_PACKAGED;
    }

    /**
     * Obtiene el estado máximo que puede alcanzar un player dado.
     *
     * @param string $playerName Nombre del reproductor
     * @return string Estado máximo (STATE_*)
     */
    public static function getPlayerMaxState(string $playerName): string
    {
        foreach (self::PLAYER_MATRIX as $knownPlayer => $config) {
            if (stripos($playerName, $knownPlayer) !== false) {
                return $config['max_state'];
            }
        }
        // Player desconocido → solo señalización para no romper nada
        return self::STATE_SIGNAL_ONLY;
    }

    /**
     * Determina si se deben emitir tags LCEVC en el manifiesto M3U8.
     * Solo se emiten si el estado es SIGNAL_ONLY o superior.
     *
     * @param string $state Estado LCEVC efectivo
     * @return bool
     */
    public static function shouldEmitTags(string $state): bool
    {
        return in_array($state, [
            self::STATE_SIGNAL_ONLY,
            self::STATE_PACKAGED,
            self::STATE_PLAYER_VALIDATED,
        ], true);
    }

    /**
     * Determina si se deben emitir pistas de mejora LCEVC en los manifiestos.
     * Solo se emiten si el estado es PACKAGED o PLAYER_VALIDATED.
     *
     * @param string $state Estado LCEVC efectivo
     * @return bool
     */
    public static function shouldEmitEnhancementTrack(string $state): bool
    {
        return in_array($state, [
            self::STATE_PACKAGED,
            self::STATE_PLAYER_VALIDATED,
        ], true);
    }

    /**
     * Genera los headers HTTP X-LCEVC-* para la respuesta del backend.
     * Solo se generan si el estado es SIGNAL_ONLY o superior.
     *
     * @param string $state        Estado LCEVC efectivo
     * @param array  $channelConfig Configuración del canal
     * @return array Mapa de headers HTTP a emitir
     */
    public static function buildResponseHeaders(string $state, array $channelConfig): array
    {
        if (!self::shouldEmitTags($state)) {
            return [];
        }

        $mode     = $channelConfig['lcevc_mode']       ?? 'SEI_METADATA';
        $codec    = strtoupper($channelConfig['lcevc_base_codec'] ?? 'H264');
        $fallback = strtoupper($channelConfig['lcevc_fallback']   ?? 'BASE_ONLY');

        return [
            'X-LCEVC-State'       => $state,
            'X-LCEVC-Enabled'     => '1',
            'X-LCEVC-Mode'                  => $mode,
            'X-LCEVC-Base-Codec'            => $codec,
            'X-LCEVC-Fallback'              => $fallback,
            // Phase 1: Layer architecture
            'X-LCEVC-Base-Layer-Scale'      => $channelConfig['lcevc_base_layer_scale'] ?? '0.25',
            'X-LCEVC-Base-Bitrate-Ratio'    => $channelConfig['lcevc_base_bitrate_ratio'] ?? '0.60',
            'X-LCEVC-Enh-Bitrate-Ratio'     => $channelConfig['lcevc_enhancement_bitrate_ratio'] ?? '0.40',
            // Sublayer L-1
            'X-LCEVC-L1-Enabled'            => ($channelConfig['lcevc_l1_enabled'] ?? true) ? '1' : '0',
            'X-LCEVC-L1-Transform-Block'    => strtoupper($channelConfig['lcevc_l1_transform_block'] ?? '4x4'),
            'X-LCEVC-L1-Deblock-Filter'     => ($channelConfig['lcevc_l1_deblock_filter'] ?? true) ? '1' : '0',
            'X-LCEVC-L1-Residual-Precision' => strtoupper($channelConfig['lcevc_l1_residual_precision'] ?? '10bit'),
            'X-LCEVC-L1-Temporal-Pred'      => ($channelConfig['lcevc_l1_temporal_prediction'] ?? true) ? '1' : '0',
            // Sublayer L-2
            'X-LCEVC-L2-Enabled'            => ($channelConfig['lcevc_l2_enabled'] ?? true) ? '1' : '0',
            'X-LCEVC-L2-Transform-Block'    => strtoupper($channelConfig['lcevc_l2_transform_block'] ?? '2x2'),
            'X-LCEVC-L2-Temporal-Pred'      => ($channelConfig['lcevc_l2_temporal_prediction'] ?? true) ? '1' : '0',
            'X-LCEVC-L2-Residual-Precision' => strtoupper($channelConfig['lcevc_l2_residual_precision'] ?? '10bit'),
            'X-LCEVC-L2-Upscale-Filter'     => strtoupper($channelConfig['lcevc_l2_upscale_filter'] ?? 'LANCZOS3'),
            // Phase 2: Transport
            'X-LCEVC-Transport-Primary'     => strtoupper($channelConfig['lcevc_transport'] ?? 'SEI_NAL'),
            'X-LCEVC-Transport-Fallback-1'  => strtoupper($channelConfig['lcevc_transport_fallback_1'] ?? 'WEBM_METADATA'),
            'X-LCEVC-Transport-Fallback-2'  => strtoupper($channelConfig['lcevc_transport_fallback_2'] ?? 'MPEG_TS_PID'),
            'X-LCEVC-SEI-NAL-Type'          => $channelConfig['lcevc_sei_nal_type'] ?? '4',
            'X-LCEVC-MPEG-TS-PID'           => $channelConfig['lcevc_mpeg_ts_pid'] ?? '0x1FFF',
            'X-LCEVC-WebM-Track-ID'         => $channelConfig['lcevc_webm_track_id'] ?? '3',
            // Phase 3: Decoding & Parallelization
            'X-LCEVC-Parallel-Blocks'       => ($channelConfig['lcevc_parallel_blocks'] ?? true) ? '1' : '0',
            'X-LCEVC-Parallel-Threads'      => (string)($channelConfig['lcevc_parallel_threads'] ?? 8),
            'X-LCEVC-Decode-Order'          => strtoupper($channelConfig['lcevc_decode_order'] ?? 'L1_THEN_L2'),
            'X-LCEVC-HW-Acceleration'       => strtoupper($channelConfig['lcevc_hw_acceleration'] ?? 'PREFERRED'),
            'X-LCEVC-SW-Fallback'           => ($channelConfig['lcevc_sw_fallback'] ?? true) ? '1' : '0',
            // Compatibility guarantee
            'X-LCEVC-Compat'                => 'UNIVERSAL',
            'X-LCEVC-Graceful-Degradation'  => 'BASE_CODEC_PASSTHROUGH',
        ];
    }

    /**
     * Genera los tags APE-LCEVC para el manifiesto M3U8.
     * Solo se generan si el estado es SIGNAL_ONLY o superior.
     *
     * @param string $state        Estado LCEVC efectivo
     * @param array  $channelConfig Configuración del canal
     * @return array Líneas de tags M3U8
     */
    public static function buildM3u8Tags(string $state, array $channelConfig): array
    {
        if (!self::shouldEmitTags($state)) {
            return [];
        }

        $mode     = $channelConfig['lcevc_mode']       ?? 'SEI_METADATA';
        $codec    = strtoupper($channelConfig['lcevc_base_codec'] ?? 'H264');
        $fallback = strtoupper($channelConfig['lcevc_fallback']   ?? 'BASE_ONLY');
        $required = !empty($channelConfig['lcevc_player_required']) ? '1' : '0';

        $tags = [
            '#EXT-X-APE-LCEVC:ENABLED',
            "#EXT-X-APE-LCEVC-STATE:{$state}",
            "#EXT-X-APE-LCEVC-MODE:{$mode}",
            "#EXT-X-APE-LCEVC-BASE-CODEC:{$codec}",
            "#EXT-X-APE-LCEVC-FALLBACK:{$fallback}",
            "#EXT-X-APE-LCEVC-PLAYER-REQUIRED:{$required}",
        ];

        // Si el media tiene enhancement real, señalizarlo
        if (self::shouldEmitEnhancementTrack($state)) {
            $transport = strtoupper($channelConfig['lcevc_transport'] ?? 'EMBEDDED');
            $tags[] = "#EXT-X-APE-LCEVC-TRANSPORT:{$transport}";
            $tags[] = '#EXT-X-APE-LCEVC-ENHANCEMENT:PRESENT';
        }

        return $tags;
    }
}
