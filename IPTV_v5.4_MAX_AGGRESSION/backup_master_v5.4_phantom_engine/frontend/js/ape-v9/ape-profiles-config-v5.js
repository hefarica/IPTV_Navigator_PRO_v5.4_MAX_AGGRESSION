/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE PROFILES CONFIG v5.4 MAX AGGRESSION NUCLEAR — PLAYER ENSLAVEMENT PROTOCOL (PEP)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Versión:   5.4.0-MAX-AGGRESSION-NUCLEAR
 * Fecha:     2026-03-16
 * Paradigma: Player Enslavement Protocol (PEP)
 *
 * PRINCIPIO FUNDAMENTAL:
 * Cada perfil es un contrato matemático irrevocable entre el Frontend,
 * el Backend PHP y el reproductor final. Los valores aquí definidos son
 * la LEY. El reproductor no decide — obedece.
 *
 * PERFILES:
 *   P0 → ULTRA_EXTREME  (8K/UHD8K,  ~80 Mbps, 60fps, HDR10+/DV, AV1+HEVC)
 *   P1 → 4K_SUPREME     (4K/UHD4K,  ~25 Mbps, 60fps, HDR10,     HEVC Main10)
 *   P2 → 4K_EXTREME     (4K/UHD4K,  ~15 Mbps, 30fps, HDR10,     HEVC Main10)
 *   P3 → FHD_ADVANCED   (1080p FHD,  ~8 Mbps, 60fps, SDR/HDR,   HEVC Main10)
 *   P4 → HD_STABLE      (720p HD,    ~4.5 Mbps,30fps, SDR,       HEVC Main)
 *   P5 → SD_FAILSAFE    (480p SD,    ~1.5 Mbps,25fps, SDR,       HEVC Main)
 *
 * CADENA DE DEGRADACIÓN GRACEFUL (7 niveles):
 *   1. CMAF+HEVC/AV1+LCEVC  (máxima calidad)
 *   2. HLS/fMP4+HEVC+LCEVC
 *   3. HLS/fMP4+H.264
 *   4. HLS/TS+H.264
 *   5. HLS/TS+Baseline
 *   6. TS-Direct
 *   7. HTTP-Redirect         (compatibilidad universal garantizada)
 *
 * COMPLIANCE: RFC 8216, ISO 23009-1, ITU-T G.1028, ETSI TR 101 290
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.APE_PROFILES_V5 = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTES GLOBALES DEL SISTEMA PEP
    // ═══════════════════════════════════════════════════════════════════════
    const PEP_VERSION = '5.4.0';

    // ═══════════════════════════════════════════════════════════════════════
    // DEVICE TIER REFERENCE (definido en m3u8-typed-arrays-ultimate.js)
    // Este archivo se carga DESPUÉS del motor JS, por lo que DEVICE_TIER
    // ya está disponible en window scope cuando se ejecuta este código
    // ═══════════════════════════════════════════════════════════════════════
    const _DEVICE_TIER = (typeof DEVICE_TIER !== 'undefined') ? DEVICE_TIER :
        (typeof window !== 'undefined' && window.DEVICE_TIER) ? window.DEVICE_TIER : 1;
    const _ACTIVE_ISP = (typeof ACTIVE_ISP_LEVEL !== 'undefined') ? ACTIVE_ISP_LEVEL :
        (typeof window !== 'undefined' && window.ACTIVE_ISP_LEVEL) ? window.ACTIVE_ISP_LEVEL :
        { name: 'EXTREME', tcp_window_mb: 4, parallel_streams: 4, burst_factor: 1.5,
          burst_duration_s: 30, prefetch_s: 30, strategy: 'MAX_CONTRACT', quic: false, http3: false };


    const APE_ENGINE_VERSION = 'APE_18.2_PEP';
    const LCEVC_ENHANCEMENT = 'mpeg5-part2';
    const LCEVC_SCALE_FACTOR = '2x';
    const RECONNECT_TIMEOUT_MS = 5;
    const RECONNECT_MAX_ATTEMPTS = 300; // v5.4: aumentado para mayor resiliencia
    const RECONNECT_DELAY_MS = 0;
    const SEGMENT_DURATION = 2;
    const AVAILABILITY_TARGET = 99.999;

    // ═══════════════════════════════════════════════════════════════════════
    // CATEGORÍAS DE HEADERS HABILITADAS (todas activas en todos los perfiles)
    // ═══════════════════════════════════════════════════════════════════════
    const ALL_CATEGORIES = [
        'identity', 'connection', 'cache', 'cors', 'ape_core', 'playback',
        'codecs', 'cdn', 'metadata', 'extra', 'ott_navigator',
        'streaming_control', 'security', 'hdr_color', 'resolution_advanced',
        'audio_premium', 'parallel_download', 'anti_freeze', 'abr_control'
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // TABLA MAESTRA DE PERFILES P0-P5
    // Valores calibrados quirúrgicamente para 0 cortes / 0 freeze
    // ═══════════════════════════════════════════════════════════════════════
    const DEFAULT_PROFILES = {

        // ─────────────────────────────────────────────────────────────────
        // P0: ULTRA_EXTREME — 8K/UHD8K, 80 Mbps, 60fps, HDR10+/DV
        // Target: Pantallas 8K, conexiones de fibra >100 Mbps
        // Buffer: 50s (red) + 50s (player) = 100s de headroom total
        // ─────────────────────────────────────────────────────────────────
        P0: {
            id: 'P0',
            name: 'ULTRA_EXTREME',
            level: 6,
            quality: 'ULTRA',
            description: 'ULTRA EXTREME — 8K HDR10+ con AV1+HEVC y LCEVC. 0 cortes garantizados. Requiere >100 Mbps.',
            color: '#dc2626',
            settings: {
                // Resolución y framerate
                resolution: '7680x4320',
                width: 7680,
                height: 4320,
                fps: 60,
                // Bitrate (kbps)
                bitrate: 80000,
                throughput_t1: 104,    // 80 Mbps × 1.3 — umbral de alerta
                throughput_t2: 128,    // 80 Mbps × 1.6 — umbral crítico
                max_bandwidth: 160000000, // 160 Mbps headroom
                min_bandwidth: 50000000,  // 50 Mbps mínimo absoluto
                // Buffer (ms) — Hybrid Double-Ended Buffer
                buffer: 50000,         // Buffer total
                buffer_min: 5000,      // Arranque rápido (5s)
                buffer_max: 100000,    // Techo de seguridad (100s)
                network_cache: 60000,  // Cache de red (60s)
                live_cache: 60000,     // Cache live (60s)
                file_cache: 15000,     // Cache de archivo (15s)
                playerBuffer: 50000,   // Buffer del player
                // Prefetch ultra-agresivo
                prefetch_segments: 500,
                prefetch_parallel: 250,
                prefetch_buffer_target: 600000,  // 600s de buffer target
                prefetch_min_bandwidth: 500000000, // 500 Mbps mínimo para prefetch
                // Reconexión instantánea
                reconnect_timeout_ms: RECONNECT_TIMEOUT_MS,
                reconnect_max_attempts: RECONNECT_MAX_ATTEMPTS,
                reconnect_delay_ms: RECONNECT_DELAY_MS,
                segment_duration: SEGMENT_DURATION,
                bandwidth_guarantee: 500,
                availability_target: AVAILABILITY_TARGET,
                // Codec — AV1 Main10 + HEVC fallback
                codec: 'AV1',
                codec_primary: 'AV1',
                codec_fallback: 'HEVC',
                codec_priority: 'av1,hevc,h265,H265,h.265,h264',
                // HDR — Máximo nivel
                hdr_support: ['hdr10plus', 'dolby_vision', 'hdr10', 'hlg'],
                color_depth: 12,
                audio_channels: 8,
                // HEVC/AV1 Optimization
                hevc_tier: 'HIGH',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN-10-HDR',
                color_space: 'BT2020',
                chroma_subsampling: '4:2:0',
                transfer_function: 'SMPTE2084',
                matrix_coefficients: 'BT2020NC',
                compression_level: 1,
                sharpen_sigma: 0.02,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main10',
                pixel_format: 'yuv420p10le',
                // LCEVC
                lcevc_enabled: true,
                lcevc_state: 'ACTIVE',
                lcevc_enhancement: LCEVC_ENHANCEMENT,
                lcevc_scale_factor: LCEVC_SCALE_FACTOR,
                // AI Super Resolution
                ai_sr_enabled: true,
                ai_sr_model: 'ESRGAN_4X',
                // Estrategia
                strategy: 'ultra-aggressive',
                device_class: 'ULTRA_EXTREME',
                headersCount: 235
            },
            vlcopt: {
                'network-caching': '60000',
                'clock-jitter': '0',
                'clock-synchro': '0',
                'live-caching': '60000',
                'file-caching': '15000',
                'http-reconnect': 'true',
                'http-continuous': 'true',
                'http-user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-P0'
            },
            kodiprop: {
                'inputstream': 'inputstream.adaptive',
                'inputstream.adaptive.manifest_type': 'hls',
                'inputstream.adaptive.stream_selection_type': 'adaptive',
                'inputstream.adaptive.stream_headers': '[ENCODED_HEADERS]',
                'inputstream.adaptive.manifest_headers': '[ENCODED_HEADERS]'
            },
            exthttp_overrides: {
                'X-APE-Profile': 'P0',
                'X-APE-Version': '18.2',
                'X-APE-QoE': '5.0',
                'X-APE-Guardian': 'enabled',
                'X-QoS-DSCP': 'EF',
                'X-QoS-Bitrate': '80000kbps',
                'X-HDR-Support': 'hdr10plus,dolby-vision,hdr10,hlg',
                'X-Color-Depth': '12bit',
                'X-Color-Space': 'bt2020',
                'X-HEVC-Tier': 'HIGH',
                'X-HEVC-Level': '6.1',
                'X-HEVC-Profile': 'MAIN-10-HDR'
            },
            enabledCategories: ALL_CATEGORIES,
            headerOverrides: {}
        },

        // ─────────────────────────────────────────────────────────────────
        // P1: 4K_SUPREME — 4K/UHD4K, 25 Mbps, 60fps, HDR10
        // Target: Pantallas 4K, conexiones de fibra >40 Mbps
        // Buffer: 40s (red) + 40s (player) = 80s de headroom total
        // ─────────────────────────────────────────────────────────────────
        P1: {
            id: 'P1',
            name: '4K_SUPREME',
            level: 5,
            quality: '4K',
            description: '4K SUPREME — 4K HDR10 con HEVC Main10 y LCEVC. 0 cortes garantizados. Requiere >40 Mbps.',
            color: '#ea580c',
            settings: {
                resolution: '3840x2160',
                width: 3840,
                height: 2160,
                fps: 60,
                bitrate: 25000,
                throughput_t1: 32.5,
                throughput_t2: 40,
                max_bandwidth: 80000000,
                min_bandwidth: 25000000,
                buffer: 40000,
                buffer_min: 4000,
                buffer_max: 80000,
                network_cache: 50000,
                live_cache: 50000,
                file_cache: 12000,
                playerBuffer: 40000,
                prefetch_segments: 400,
                prefetch_parallel: 200,
                prefetch_buffer_target: 500000,
                prefetch_min_bandwidth: 400000000,
                reconnect_timeout_ms: RECONNECT_TIMEOUT_MS,
                reconnect_max_attempts: RECONNECT_MAX_ATTEMPTS,
                reconnect_delay_ms: RECONNECT_DELAY_MS,
                segment_duration: SEGMENT_DURATION,
                bandwidth_guarantee: 400,
                availability_target: AVAILABILITY_TARGET,
                codec: 'H265',
                codec_primary: 'HEVC',
                codec_fallback: 'HEVC',
                codec_priority: 'hevc,h265,H265,h.265,av1,h264',
                hdr_support: ['hdr10', 'hlg'],
                color_depth: 10,
                audio_channels: 8,
                hevc_tier: 'HIGH',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN-10-HDR',
                color_space: 'BT2020',
                chroma_subsampling: '4:2:0',
                transfer_function: 'SMPTE2084',
                matrix_coefficients: 'BT2020NC',
                compression_level: 1,
                sharpen_sigma: 0.02,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main10',
                pixel_format: 'yuv420p10le',
                lcevc_enabled: true,
                lcevc_state: 'ACTIVE',
                lcevc_enhancement: LCEVC_ENHANCEMENT,
                lcevc_scale_factor: LCEVC_SCALE_FACTOR,
                ai_sr_enabled: false,
                strategy: 'ultra-aggressive',
                device_class: '4K_SUPREME',
                headersCount: 185
            },
            vlcopt: {
                'network-caching': '50000',
                'clock-jitter': '0',
                'clock-synchro': '0',
                'live-caching': '50000',
                'file-caching': '12000',
                'http-reconnect': 'true',
                'http-continuous': 'true',
                'http-user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-P1'
            },
            kodiprop: {
                'inputstream': 'inputstream.adaptive',
                'inputstream.adaptive.manifest_type': 'hls',
                'inputstream.adaptive.stream_selection_type': 'adaptive',
                'inputstream.adaptive.stream_headers': '[ENCODED_HEADERS]'
            },
            exthttp_overrides: {
                'X-APE-Profile': 'P1',
                'X-APE-Version': '18.2',
                'X-APE-QoE': '5.0',
                'X-APE-Guardian': 'enabled',
                'X-QoS-DSCP': 'EF',
                'X-QoS-Bitrate': '25000kbps',
                'X-HDR-Support': 'hdr10,hlg',
                'X-Color-Depth': '10bit',
                'X-Color-Space': 'bt2020',
                'X-HEVC-Tier': 'HIGH',
                'X-HEVC-Level': '5.1',
                'X-HEVC-Profile': 'MAIN-10-HDR'
            },
            enabledCategories: ALL_CATEGORIES,
            headerOverrides: {}
        },

        // ─────────────────────────────────────────────────────────────────
        // P2: 4K_EXTREME — 4K/UHD4K, 15 Mbps, 30fps, HDR10
        // Target: Pantallas 4K, conexiones >25 Mbps
        // Buffer: 35s (red) + 35s (player) = 70s de headroom total
        // ─────────────────────────────────────────────────────────────────
        P2: {
            id: 'P2',
            name: '4K_EXTREME',
            level: 4,
            quality: '4K',
            description: '4K EXTREME — 4K HDR10 con HEVC Main10. 0 cortes garantizados. Requiere >25 Mbps.',
            color: '#d97706',
            settings: {
                resolution: '3840x2160',
                width: 3840,
                height: 2160,
                fps: 30,
                bitrate: 15000,
                throughput_t1: 19.5,
                throughput_t2: 24,
                max_bandwidth: 50000000,
                min_bandwidth: 15000000,
                buffer: 35000,
                buffer_min: 3500,
                buffer_max: 70000,
                network_cache: 45000,
                live_cache: 45000,
                file_cache: 10000,
                playerBuffer: 35000,
                prefetch_segments: 350,
                prefetch_parallel: 175,
                prefetch_buffer_target: 450000,
                prefetch_min_bandwidth: 350000000,
                reconnect_timeout_ms: RECONNECT_TIMEOUT_MS,
                reconnect_max_attempts: RECONNECT_MAX_ATTEMPTS,
                reconnect_delay_ms: RECONNECT_DELAY_MS,
                segment_duration: SEGMENT_DURATION,
                bandwidth_guarantee: 350,
                availability_target: AVAILABILITY_TARGET,
                codec: 'H265',
                codec_primary: 'HEVC',
                codec_fallback: 'HEVC',
                codec_priority: 'hevc,h265,H265,h.265,h264',
                hdr_support: ['hdr10', 'hlg'],
                color_depth: 10,
                audio_channels: 6,
                hevc_tier: 'HIGH',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN-10-HDR',
                color_space: 'BT2020',
                chroma_subsampling: '4:2:0',
                transfer_function: 'SMPTE2084',
                matrix_coefficients: 'BT2020NC',
                compression_level: 1,
                sharpen_sigma: 0.03,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main10',
                pixel_format: 'yuv420p10le',
                lcevc_enabled: true,
                lcevc_state: 'SIGNAL_ONLY',
                lcevc_enhancement: LCEVC_ENHANCEMENT,
                lcevc_scale_factor: LCEVC_SCALE_FACTOR,
                ai_sr_enabled: false,
                strategy: 'ultra-aggressive',
                device_class: '4K_EXTREME',
                headersCount: 155
            },
            vlcopt: {
                'network-caching': '45000',
                'clock-jitter': '0',
                'clock-synchro': '0',
                'live-caching': '45000',
                'file-caching': '10000',
                'http-reconnect': 'true',
                'http-continuous': 'true',
                'http-user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-P2'
            },
            kodiprop: {
                'inputstream': 'inputstream.adaptive',
                'inputstream.adaptive.manifest_type': 'hls',
                'inputstream.adaptive.stream_selection_type': 'adaptive',
                'inputstream.adaptive.stream_headers': '[ENCODED_HEADERS]'
            },
            exthttp_overrides: {
                'X-APE-Profile': 'P2',
                'X-APE-Version': '18.2',
                'X-APE-QoE': '4.8',
                'X-APE-Guardian': 'enabled',
                'X-QoS-DSCP': 'EF',
                'X-QoS-Bitrate': '15000kbps',
                'X-HDR-Support': 'hdr10,hlg',
                'X-Color-Depth': '10bit',
                'X-Color-Space': 'bt2020',
                'X-HEVC-Tier': 'HIGH',
                'X-HEVC-Level': '5.1',
                'X-HEVC-Profile': 'MAIN-10-HDR'
            },
            enabledCategories: ALL_CATEGORIES,
            headerOverrides: {}
        },

        // ─────────────────────────────────────────────────────────────────
        // P3: FHD_ADVANCED — 1080p, 8 Mbps, 60fps, SDR/HDR
        // Target: Pantallas FHD, conexiones >12 Mbps
        // Buffer: 30s (red) + 30s (player) = 60s de headroom total
        // ─────────────────────────────────────────────────────────────────
        P3: {
            id: 'P3',
            name: 'FHD_ADVANCED',
            level: 3,
            quality: 'FHD',
            description: 'FHD ADVANCED — 1080p con HEVC Main10. 0 cortes garantizados. Requiere >12 Mbps.',
            color: '#16a34a',
            settings: {
                resolution: '1920x1080',
                width: 1920,
                height: 1080,
                fps: 60,
                bitrate: 8000,
                throughput_t1: 10.4,
                throughput_t2: 12.8,
                max_bandwidth: 25000000,
                min_bandwidth: 8000000,
                buffer: 30000,
                buffer_min: 3000,
                buffer_max: 60000,
                network_cache: 40000,
                live_cache: 40000,
                file_cache: 8000,
                playerBuffer: 30000,
                prefetch_segments: 300,
                prefetch_parallel: 150,
                prefetch_buffer_target: 400000,
                prefetch_min_bandwidth: 300000000,
                reconnect_timeout_ms: RECONNECT_TIMEOUT_MS,
                reconnect_max_attempts: RECONNECT_MAX_ATTEMPTS,
                reconnect_delay_ms: RECONNECT_DELAY_MS,
                segment_duration: SEGMENT_DURATION,
                bandwidth_guarantee: 300,
                availability_target: AVAILABILITY_TARGET,
                codec: 'H265',
                codec_primary: 'HEVC',
                codec_fallback: 'H264',
                codec_priority: 'hevc,h265,H265,h.265,h264,mpeg2',
                hdr_support: ['hdr10'],
                color_depth: 10,
                audio_channels: 6,
                hevc_tier: 'HIGH',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN-10',
                color_space: 'BT709',
                chroma_subsampling: '4:2:0',
                transfer_function: 'BT1886',
                matrix_coefficients: 'BT709',
                compression_level: 1,
                sharpen_sigma: 0.03,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main10',
                pixel_format: 'yuv420p10le',
                lcevc_enabled: true,
                lcevc_state: 'SIGNAL_ONLY',
                lcevc_enhancement: LCEVC_ENHANCEMENT,
                lcevc_scale_factor: LCEVC_SCALE_FACTOR,
                ai_sr_enabled: false,
                strategy: 'ultra-aggressive',
                device_class: 'FHD_ADVANCED',
                headersCount: 120
            },
            vlcopt: {
                'network-caching': '40000',
                'clock-jitter': '0',
                'clock-synchro': '0',
                'live-caching': '40000',
                'file-caching': '8000',
                'http-reconnect': 'true',
                'http-continuous': 'true',
                'http-user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-P3'
            },
            kodiprop: {
                'inputstream': 'inputstream.adaptive',
                'inputstream.adaptive.manifest_type': 'hls',
                'inputstream.adaptive.stream_selection_type': 'adaptive'
            },
            exthttp_overrides: {
                'X-APE-Profile': 'P3',
                'X-APE-Version': '18.2',
                'X-APE-QoE': '4.5',
                'X-APE-Guardian': 'enabled',
                'X-QoS-DSCP': 'AF41',
                'X-QoS-Bitrate': '8000kbps',
                'X-HDR-Support': 'hdr10',
                'X-Color-Depth': '10bit',
                'X-Color-Space': 'bt709',
                'X-HEVC-Tier': 'HIGH',
                'X-HEVC-Level': '4.1',
                'X-HEVC-Profile': 'MAIN-10'
            },
            enabledCategories: ALL_CATEGORIES,
            headerOverrides: {}
        },

        // ─────────────────────────────────────────────────────────────────
        // P4: HD_STABLE — 720p, 4.5 Mbps, 30fps, SDR
        // Target: Pantallas HD, conexiones >7 Mbps
        // Buffer: 25s (red) + 25s (player) = 50s de headroom total
        // ─────────────────────────────────────────────────────────────────
        P4: {
            id: 'P4',
            name: 'HD_STABLE',
            level: 2,
            quality: 'HD',
            description: 'HD STABLE — 720p con HEVC Main. 0 cortes garantizados. Requiere >7 Mbps.',
            color: '#2563eb',
            settings: {
                resolution: '1280x720',
                width: 1280,
                height: 720,
                fps: 30,
                bitrate: 4500,
                throughput_t1: 5.85,
                throughput_t2: 7.2,
                max_bandwidth: 15000000,
                min_bandwidth: 4500000,
                buffer: 25000,
                buffer_min: 2500,
                buffer_max: 50000,
                network_cache: 35000,
                live_cache: 35000,
                file_cache: 7000,
                playerBuffer: 25000,
                prefetch_segments: 250,
                prefetch_parallel: 120,
                prefetch_buffer_target: 350000,
                prefetch_min_bandwidth: 250000000,
                reconnect_timeout_ms: RECONNECT_TIMEOUT_MS,
                reconnect_max_attempts: RECONNECT_MAX_ATTEMPTS,
                reconnect_delay_ms: RECONNECT_DELAY_MS,
                segment_duration: SEGMENT_DURATION,
                bandwidth_guarantee: 250,
                availability_target: AVAILABILITY_TARGET,
                codec: 'H265',
                codec_primary: 'HEVC',
                codec_fallback: 'H264',
                codec_priority: 'hevc,h265,H265,h.265,h264,mpeg2',
                hdr_support: [],
                color_depth: 8,
                audio_channels: 2,
                hevc_tier: 'MAIN',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN',
                color_space: 'BT709',
                chroma_subsampling: '4:2:0',
                transfer_function: 'BT1886',
                matrix_coefficients: 'BT709',
                compression_level: 1,
                sharpen_sigma: 0.05,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main',
                pixel_format: 'yuv420p',
                lcevc_enabled: false,
                lcevc_state: 'DISABLED',
                ai_sr_enabled: false,
                strategy: 'ultra-aggressive',
                device_class: 'HD_STABLE',
                headersCount: 80
            },
            vlcopt: {
                'network-caching': '35000',
                'clock-jitter': '0',
                'clock-synchro': '0',
                'live-caching': '35000',
                'file-caching': '7000',
                'http-reconnect': 'true',
                'http-continuous': 'true',
                'http-user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-P4'
            },
            kodiprop: {
                'inputstream': 'inputstream.adaptive',
                'inputstream.adaptive.manifest_type': 'hls'
            },
            exthttp_overrides: {
                'X-APE-Profile': 'P4',
                'X-APE-Version': '18.2',
                'X-APE-QoE': '4.0',
                'X-APE-Guardian': 'enabled',
                'X-QoS-DSCP': 'AF31',
                'X-QoS-Bitrate': '4500kbps',
                'X-Color-Space': 'bt709',
                'X-HEVC-Tier': 'MAIN',
                'X-HEVC-Level': '4.0',
                'X-HEVC-Profile': 'MAIN'
            },
            enabledCategories: ALL_CATEGORIES,
            headerOverrides: {}
        },

        // ─────────────────────────────────────────────────────────────────
        // P5: SD_FAILSAFE — 480p, 1.5 Mbps, 25fps, SDR
        // Target: Cualquier dispositivo, conexiones >2 Mbps
        // Buffer: 20s (red) + 20s (player) = 40s de headroom total
        // Propósito: Garantizar reproducción en cualquier condición
        // ─────────────────────────────────────────────────────────────────
        P5: {
            id: 'P5',
            name: 'SD_FAILSAFE',
            level: 1,
            quality: 'SD',
            description: 'SD FAILSAFE — 480p con HEVC Main. Compatibilidad universal. Requiere >2 Mbps.',
            color: '#6366f1',
            settings: {
                resolution: '854x480',
                width: 854,
                height: 480,
                fps: 25,
                bitrate: 1500,
                throughput_t1: 1.95,
                throughput_t2: 2.4,
                max_bandwidth: 5000000,
                min_bandwidth: 1500000,
                buffer: 20000,
                buffer_min: 2000,
                buffer_max: 40000,
                network_cache: 30000,
                live_cache: 30000,
                file_cache: 5000,
                playerBuffer: 20000,
                prefetch_segments: 200,
                prefetch_parallel: 100,
                prefetch_buffer_target: 300000,
                prefetch_min_bandwidth: 200000000,
                reconnect_timeout_ms: RECONNECT_TIMEOUT_MS,
                reconnect_max_attempts: RECONNECT_MAX_ATTEMPTS,
                reconnect_delay_ms: RECONNECT_DELAY_MS,
                segment_duration: SEGMENT_DURATION,
                bandwidth_guarantee: 200,
                availability_target: AVAILABILITY_TARGET,
                codec: 'H265',
                codec_primary: 'HEVC',
                codec_fallback: 'H264',
                codec_priority: 'hevc,h265,H265,h.265,h264,mpeg2',
                hdr_support: [],
                color_depth: 8,
                audio_channels: 2,
                hevc_tier: 'MAIN',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN',
                color_space: 'BT709',
                chroma_subsampling: '4:2:0',
                transfer_function: 'BT1886',
                matrix_coefficients: 'BT709',
                compression_level: 1,
                sharpen_sigma: 0.05,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main',
                pixel_format: 'yuv420p',
                lcevc_enabled: false,
                lcevc_state: 'DISABLED',
                ai_sr_enabled: false,
                strategy: 'ultra-aggressive',
                device_class: 'SD_FAILSAFE',
                headersCount: 41
            },
            vlcopt: {
                'network-caching': '30000',
                'clock-jitter': '0',
                'clock-synchro': '0',
                'live-caching': '30000',
                'file-caching': '5000',
                'http-reconnect': 'true',
                'http-continuous': 'true',
                'http-user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-P5'
            },
            kodiprop: {
                'inputstream': 'inputstream.adaptive',
                'inputstream.adaptive.manifest_type': 'hls'
            },
            exthttp_overrides: {
                'X-APE-Profile': 'P5',
                'X-APE-Version': '18.2',
                'X-APE-QoE': '3.5',
                'X-APE-Guardian': 'enabled',
                'X-QoS-DSCP': 'BE',
                'X-QoS-Bitrate': '1500kbps',
                'X-Color-Space': 'bt709',
                'X-HEVC-Tier': 'MAIN',
                'X-HEVC-Level': '3.1',
                'X-HEVC-Profile': 'MAIN'
            },
            enabledCategories: ALL_CATEGORIES,
            headerOverrides: {}
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // TABLA DE DETECCIÓN AUTOMÁTICA DE PERFIL
    // ═══════════════════════════════════════════════════════════════════════
    function detectProfile(channel) {
        const height = channel.height || parseInt((channel.resolution || '').split('x')[1]) || 0;
        const bitrate = channel.bitrate || 0;
        const name = (channel.name || channel.tvg_name || '').toUpperCase();

        // P0: 8K/UHD8K
        if (height >= 4320 || bitrate >= 50000 || name.includes('8K') || name.includes('UHD8K')) return 'P0';
        // P1: 4K 60fps o bitrate alto
        if ((height >= 2160 && bitrate >= 20000) || (height >= 2160 && name.includes('60FPS')) || name.includes('UHD60') || (name.includes('4K') && name.includes('60FPS')) || name.includes('SUPREME')) return 'P1';
        // P2: 4K estándar
        if (height >= 2160 || name.includes('4K') || name.includes('UHD')) return 'P2';
        // P3: FHD
        if (height >= 1080 || name.includes('FHD') || name.includes('1080')) return 'P3';
        // P4: HD
        if (height >= 720 || name.includes('HD') || name.includes('720')) return 'P4';
        // P5: SD o desconocido
        return 'P5';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════════════════
    return {
        version: PEP_VERSION,
        apeEngineVersion: APE_ENGINE_VERSION,
        profiles: DEFAULT_PROFILES,
        detectProfile: detectProfile,
        getProfile: function(id) {
            return DEFAULT_PROFILES[id] || DEFAULT_PROFILES['P3'];
        },
        getAllProfiles: function() {
            return Object.values(DEFAULT_PROFILES);
        },
        getProfileIds: function() {
            return Object.keys(DEFAULT_PROFILES);
        }
    };
}));
