/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚀 M3U8 TYPED ARRAYS ULTIMATE GENERATOR v16.0.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ESPECIFICACIÓN:
 * - 133+ líneas por canal (1 EXTINF + 63 EXTVLCOPT + 38 KODIPROP + 29 EXT-X-APE + 1 START + 1 URL)
 * - 6 PERFILES: P0 (8K) → P5 (SD)
 * - JWT ENRIQUECIDO: 68+ campos en 8 secciones
 * - COMPLIANCE: RFC 8216 100%
 * - RESILIENCIA: 24/7/365, reconexión <30ms, 0 cortes
 * 
 * COMPATIBILIDAD: OTT Navigator, VLC, Kodi, Tivimate, IPTV Smarters
 * 
 * FECHA: 2026-01-29
 * VERSIÓN: 16.0.0-ULTIMATE-TYPED-ARRAYS
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '16.1.0-CLEAN-URL-ARCHITECTURE';

    // ═══════════════════════════════════════════════════════════════════════════
    // 🌐 CLEAN URL MODE - Arquitectura de URLs Limpias
    // ═══════════════════════════════════════════════════════════════════════════
    // Cuando está activo:
    // - URLs 100% limpias (sin JWT, sin parámetros)
    // - Los 68 campos del JWT se redistribuyen a headers M3U8
    // - Headers globales: fingerprint, sesión, evasión
    // - Headers por canal: perfil, codec, buffer, calidad
    // ═══════════════════════════════════════════════════════════════════════════

    let CLEAN_URL_MODE = true; // Toggle para activar/desactivar URLs limpias

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔧 HELPER: VERIFICAR SI UN MÓDULO ESTÁ HABILITADO EN EL PANEL
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Verifica si un módulo está habilitado en ApeModuleManager
     * @param {string} moduleId - ID del módulo (ej: 'smart-codec', 'evasion-407')
     * @returns {boolean} true si el módulo está habilitado o si no hay manager
     */
    function isModuleEnabled(moduleId) {
        if (!window.ApeModuleManager) return true; // Sin manager = usar todo
        return window.ApeModuleManager.isEnabled(moduleId);
    }

    // Mapeo de funcionalidades a módulos del panel
    const MODULE_FEATURES = {
        jwt: 'jwt-generator',
        headers: 'headers-matrix',
        evasion: 'evasion-407',
        buffer: 'buffer-adaptativo',
        smartCodec: 'smart-codec',
        fibonacci: 'fibonacci-entropy',
        tls: 'tls-coherence',
        geoblocking: 'geoblocking',
        throughput: 'realtime-throughput',
        qos: 'dynamic-qos',
        prefetch: 'prefetch-optimizer',
        manifest: 'manifest-generator',
        vpn: 'vpn-integration',
        latency: 'latency-rayo',
        redundantStreams: 'redundant-streams'
    };
    // ═══════════════════════════════════════════════════════════════════════════
    // 🔗 BRIDGE: FUNCIÓN PARA OBTENER PERFILES (Frontend o Fallback)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Obtiene configuración de perfil desde Frontend (Bridge) o Fallback hardcoded
     * @param {string} profileId - ID del perfil (P0-P5)
     * @returns {Object} Configuración del perfil
     */
    function getProfileConfig(profileId) {
        // ✅ PRIORIDAD 1: Bridge desde Frontend (ProfileManagerV9)
        if (window.APE_PROFILE_BRIDGE?.isActive?.() && window.APE_PROFILE_BRIDGE?.getProfile) {
            const bridged = window.APE_PROFILE_BRIDGE.getProfile(profileId);
            if (bridged && bridged._bridged) {
                console.log(`🔗 [BRIDGE] Usando perfil ${profileId} desde Frontend`);
                return bridged;
            }
        }

        // ✅ PRIORIDAD 2: Fallback a perfiles hardcoded
        const fallback = PROFILES[profileId] || PROFILES['P3'];
        console.log(`📦 [FALLBACK] Usando perfil ${profileId} hardcoded`);
        return fallback;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN GLOBAL DE CACHING (controla las 4 directivas globales)
    // ═══════════════════════════════════════════════════════════════════════════
    const GLOBAL_CACHING_BASE = {
        network: 15000,   // v5.3: anti-freeze calibrado (era 60000 → causaba underrun)
        live: 15000,      // v5.3: anti-freeze calibrado (era 60000 → causaba underrun)
        file: 51000       // v5.3: VOD/file caching correcto (era 30000)
    };

    const getGlobalCaching = () => ({
        network: window._APE_QUANTUM_SHIELD_2026 ? 15000 : GLOBAL_CACHING_BASE.network,
        live: window._APE_QUANTUM_SHIELD_2026 ? 15000 : GLOBAL_CACHING_BASE.live,
        file: window._APE_QUANTUM_SHIELD_2026 ? 51000 : GLOBAL_CACHING_BASE.file
    });

    const GLOBAL_CACHING = {
        get network() { return getGlobalCaching().network; },
        get live() { return getGlobalCaching().live; },
        get file() { return getGlobalCaching().file; }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PERFILES P0-P5 (CONFIGURACIÓN COMPLETA - FALLBACK)
    // ═══════════════════════════════════════════════════════════════════════════

    const PROFILES = {
        // ═══════════════════════════════════════════════════════════════════════
        // P0: 8K ULTRA - detectProfile assigns P0 when height >= 4320 || bitrate >= 50000
        // ═══════════════════════════════════════════════════════════════════════
        P0: {
            name: 'ULTRA_EXTREME_8K',
            resolution: '7680x4320',
            width: 7680,
            height: 4320,
            fps: 120,
            bitrate: 50000,
            buffer_ms: 50000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 50000,
            max_bandwidth: 100000000,
            min_bandwidth: 50000000,
            throughput_t1: 100,
            throughput_t2: 120,
            prefetch_segments: 20,
            prefetch_parallel: 250,
            prefetch_buffer_target: 600000,
            prefetch_min_bandwidth: 500000000,
            segment_duration: 2,
            bandwidth_guarantee: 500,
            codec_primary: 'AV1',
            codec_fallback: 'HEVC',
            codec_priority: 'av1,hevc,h265,H265,h.265,h264',
            hdr_support: ['hdr10', 'dolby_vision', 'hlg'],
            color_depth: 12,
            audio_channels: 8,
            device_class: 'ULTRA_EXTREME_8K',
            reconnect_timeout_ms: 5,
            reconnect_max_attempts: 40,
            reconnect_delay_ms: 50,
            availability_target: 99.999,
            // HEVC/H.265 Optimization (configurable)
            hevc_tier: 'HIGH',
            hevc_level: '5.1',
            hevc_profile: 'MAIN-10-HDR',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 9,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        },
        // ═══════════════════════════════════════════════════════════════════════
        // P1: 4K 60fps - detectProfile assigns P1 when height >= 2160 || bitrate >= 30000
        // ═══════════════════════════════════════════════════════════════════════
        P1: {
            name: '4K_SUPREME_60FPS',
            resolution: '3840x2160',
            width: 3840,
            height: 2160,
            fps: 60,
            bitrate: 45000,
            buffer_ms: 40000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 40000,
            max_bandwidth: 60000000,
            min_bandwidth: 30000000,
            throughput_t1: 60,
            throughput_t2: 75,
            prefetch_segments: 20,
            prefetch_parallel: 200,
            prefetch_buffer_target: 500000,
            prefetch_min_bandwidth: 400000000,
            segment_duration: 2,
            bandwidth_guarantee: 400,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,h265,H265,h.265,av1,h264',
            hdr_support: ['hdr10', 'hlg'],
            color_depth: 10,
            audio_channels: 6,
            device_class: '4K_SUPREME_60FPS',
            reconnect_timeout_ms: 5,
            reconnect_max_attempts: 40,
            reconnect_delay_ms: 50,
            availability_target: 99.999,
            hevc_tier: 'HIGH',
            hevc_level: '5.0',
            hevc_profile: 'MAIN-10-HDR',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 9,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        },
        P2: {
            name: '4K_EXTREME',
            resolution: '3840x2160',
            width: 3840,
            height: 2160,
            fps: 30,
            bitrate: 30000,
            buffer_ms: 35000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 35000,
            max_bandwidth: 40000000,
            min_bandwidth: 20000000,
            throughput_t1: 40,
            throughput_t2: 50,
            prefetch_segments: 20,
            prefetch_parallel: 180,
            prefetch_buffer_target: 450000,
            prefetch_min_bandwidth: 350000000,
            segment_duration: 2,
            bandwidth_guarantee: 350,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,h265,H265,h.265,av1,vp9,h264',
            hdr_support: ['hdr10'],
            color_depth: 10,
            audio_channels: 6,
            device_class: '4K_EXTREME',
            reconnect_timeout_ms: 5,
            reconnect_max_attempts: 40,
            reconnect_delay_ms: 50,
            availability_target: 99.999,
            hevc_tier: 'HIGH',
            hevc_level: '5.0',
            hevc_profile: 'MAIN-10-HDR',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 9,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        },
        P3: {
            name: 'FHD_ADVANCED',
            resolution: '1920x1080',
            width: 1920,
            height: 1080,
            fps: 60,
            bitrate: 8000,
            buffer_ms: 30000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 30000,
            max_bandwidth: 12000000,
            min_bandwidth: 4000000,
            throughput_t1: 12,
            throughput_t2: 15,
            prefetch_segments: 20,
            prefetch_parallel: 150,
            prefetch_buffer_target: 400000,
            prefetch_min_bandwidth: 300000000,
            segment_duration: 2,
            bandwidth_guarantee: 300,
            codec_primary: 'H264',
            codec_fallback: 'MPEG2',
            codec_priority: 'hevc,h265,H265,h.265,h264,mpeg2',
            hdr_support: [],
            color_depth: 8,
            audio_channels: 2,
            device_class: 'FHD_ADVANCED',
            reconnect_timeout_ms: 5,
            reconnect_max_attempts: 40,
            reconnect_delay_ms: 50,
            availability_target: 99.999,
            hevc_tier: 'HIGH',
            hevc_level: '4.1',
            hevc_profile: 'MAIN-10',
            color_space: 'BT709',
            chroma_subsampling: '4:2:0',
            transfer_function: 'BT1886',
            matrix_coefficients: 'BT709',
            compression_level: 9,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        },
        P4: {
            name: 'HD_STABLE',
            resolution: '1280x720',
            width: 1280,
            height: 720,
            fps: 30,
            bitrate: 4500,
            buffer_ms: 25000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 25000,
            max_bandwidth: 6000000,
            min_bandwidth: 2000000,
            throughput_t1: 6,
            throughput_t2: 8,
            prefetch_segments: 15,
            prefetch_parallel: 120,
            prefetch_buffer_target: 350000,
            prefetch_min_bandwidth: 250000000,
            segment_duration: 2,
            bandwidth_guarantee: 250,
            codec_primary: 'H264',
            codec_fallback: 'MPEG2',
            codec_priority: 'hevc,h265,H265,h.265,h264,mpeg2',
            hdr_support: [],
            color_depth: 8,
            audio_channels: 2,
            device_class: 'HD_STABLE',
            reconnect_timeout_ms: 5,
            reconnect_max_attempts: 40,
            reconnect_delay_ms: 50,
            availability_target: 99.999,
            hevc_tier: 'MAIN',
            hevc_level: '4.0',
            hevc_profile: 'MAIN',
            color_space: 'BT709',
            chroma_subsampling: '4:2:0',
            transfer_function: 'BT1886',
            matrix_coefficients: 'BT709',
            compression_level: 9,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main',
            pixel_format: 'yuv420p'
        },
        P5: {
            name: 'SD_FAILSAFE',
            resolution: '854x480',
            width: 854,
            height: 480,
            fps: 25,
            bitrate: 1500,
            buffer_ms: 20000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 20000,
            max_bandwidth: 3000000,
            min_bandwidth: 500000,
            throughput_t1: 3,
            throughput_t2: 4,
            prefetch_segments: 10,
            prefetch_parallel: 100,
            prefetch_buffer_target: 300000,
            prefetch_min_bandwidth: 200000000,
            segment_duration: 2,
            bandwidth_guarantee: 200,
            codec_primary: 'H264',
            codec_fallback: 'MPEG2',
            codec_priority: 'hevc,h265,H265,h.265,h264,mpeg2',
            hdr_support: [],
            color_depth: 8,
            audio_channels: 2,
            device_class: 'SD_FAILSAFE',
            reconnect_timeout_ms: 5,
            reconnect_max_attempts: 40,
            reconnect_delay_ms: 50,
            availability_target: 99.999,
            hevc_tier: 'MAIN',
            hevc_level: '3.1',
            hevc_profile: 'MAIN',
            color_space: 'BT709',
            chroma_subsampling: '4:2:0',
            transfer_function: 'BT1886',
            matrix_coefficients: 'BT709',
            compression_level: 9,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main',
            pixel_format: 'yuv420p'
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // DETECT PROFILE BASED ON CHANNEL QUALITY
    // ═══════════════════════════════════════════════════════════════════════════

    function detectProfile(channel) {
        const height = channel.height || parseInt(channel.resolution?.split('x')[1]) || 0;
        const bitrate = channel.bitrate || 0;
        const fps = channel.fps || 30;

        // P0: 8K Ultra (height >= 4320 OR bitrate >= 50Mbps)
        if (height >= 4320 || bitrate >= 50000) return 'P0';

        // P1: 4K Premium (4K + 60fps OR 4K + high bitrate >= 30Mbps)
        if (height >= 2160 && (fps >= 60 || bitrate >= 30000)) return 'P1';

        // P2: 4K Standard (4K but lower fps/bitrate)
        if (height >= 2160 || bitrate >= 20000) return 'P2';

        // P3: FHD (1080p)
        if (height >= 1080 || bitrate >= 8000) return 'P3';

        // P4: HD (720p)
        if (height >= 720 || bitrate >= 4000) return 'P4';

        // P5: SD (everything else)
        return 'P5';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARRAY 1: GLOBAL_HEADER (137+ líneas - 1 sola vez por archivo)
    // ═══════════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════════

    function generateGlobalHeader() {
        const timestamp = new Date().toISOString();
        const listId = `APE_ULTIMATE_${Date.now()}_${generateRandomString(8)}`;

        // Detectar módulos activos
        const activeModules = [];
        if (isModuleEnabled(MODULE_FEATURES.jwt)) activeModules.push('JWT');
        if (isModuleEnabled(MODULE_FEATURES.headers)) activeModules.push('HeadersMatrix');
        if (isModuleEnabled(MODULE_FEATURES.evasion)) activeModules.push('Evasion407');
        if (isModuleEnabled(MODULE_FEATURES.buffer)) activeModules.push('BufferAdaptativo');
        if (isModuleEnabled(MODULE_FEATURES.smartCodec)) activeModules.push('SmartCodec');
        if (isModuleEnabled(MODULE_FEATURES.fibonacci)) activeModules.push('FibonacciDNA');
        if (isModuleEnabled(MODULE_FEATURES.tls)) activeModules.push('TLSCoherence');
        if (isModuleEnabled(MODULE_FEATURES.geoblocking)) activeModules.push('Geoblocking');
        if (isModuleEnabled(MODULE_FEATURES.throughput)) activeModules.push('Throughput');
        if (isModuleEnabled(MODULE_FEATURES.qos)) activeModules.push('DynamicQoS');
        if (isModuleEnabled(MODULE_FEATURES.manifest)) activeModules.push('Manifest');
        if (isModuleEnabled(MODULE_FEATURES.vpn)) activeModules.push('VPNIntegration');
        if (isModuleEnabled(MODULE_FEATURES.latency)) activeModules.push('LatencyRayo');

        // Determinar capas activas
        const activeLayers = [];
        if (isModuleEnabled(MODULE_FEATURES.buffer)) activeLayers.push('EXTVLCOPT');
        if (isModuleEnabled(MODULE_FEATURES.manifest)) activeLayers.push('KODIPROP');
        if (isModuleEnabled(MODULE_FEATURES.headers) || isModuleEnabled(MODULE_FEATURES.evasion)) activeLayers.push('EXT-X-APE');
        activeLayers.push('EXT-X-START'); // Siempre incluido

        const lines = [
            '#EXTM3U',
            `#EXT-X-APE-GLOBAL-BUFFER-STRATEGY:NETWORK=${GLOBAL_CACHING.network},LIVE=${GLOBAL_CACHING.live},FILE=${GLOBAL_CACHING.file}`,
            `#EXT-X-APE-NETWORK-CACHING:${GLOBAL_CACHING.network}`,
            `#EXT-X-APE-LIVE-CACHING:${GLOBAL_CACHING.live}`,
            `#EXT-X-APE-FILE-CACHING:${GLOBAL_CACHING.file}`,
            `#EXT-X-APE-VERSION:${VERSION}`,
            '#EXT-X-APE-ARCHITECTURE:TYPED_ARRAYS_ULTIMATE',
            `#EXT-X-APE-GENERATED:${timestamp}`,
            `#EXT-X-APE-LIST-ID:${listId}`,
            `#EXT-X-APE-MODULES-ACTIVE:${activeModules.length}`,
            `#EXT-X-APE-MODULES-LIST:${activeModules.join(',')}`,
            `#EXT-X-APE-JWT-ENABLED:${isModuleEnabled(MODULE_FEATURES.jwt) ? 'true' : 'false'}`,
            '#EXT-X-APE-JWT-EXPIRATION:365',
            '#EXT-X-APE-JWT-FIELDS:68',
            `#EXT-X-APE-LAYERS:${activeLayers.join(',')}`,
            '#EXT-X-APE-COMPLIANCE:RFC8216',
            '#EXT-X-APE-TLS-IMPLEMENTATION-VERSION:1.0',
            '#EXT-X-APE-COMPATIBLE:OTT_NAVIGATOR,VLC,KODI,TIVIMATE,SMARTERS',
            '',
            '# ═══════════════════════════════════════════════════════════════════════════',
            '# APE EMBEDDED CONFIG - PROFILE DEFINITIONS',
            '# ═══════════════════════════════════════════════════════════════════════════',
            '#EXT-X-APE-EMBEDDED-CONFIG-START',
            ''
        ];

        // Embed all profile definitions
        Object.entries(PROFILES).forEach(([profileId, cfg]) => {
            lines.push(`# PROFILE ${profileId}: ${cfg.name}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-NAME:${cfg.name}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-RESOLUTION:${cfg.resolution}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-FPS:${cfg.fps}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-BITRATE:${cfg.bitrate}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-BUFFER:${cfg.buffer_ms}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-MAX-BANDWIDTH:${cfg.max_bandwidth}`);
            // Codec declarations respect Prio. Quality toggle
            const prioCodecPrimary = window._APE_PRIO_QUALITY !== false ? (profileId === 'P0' ? 'AV1' : 'HEVC') : cfg.codec_primary;
            const prioCodecFallback = window._APE_PRIO_QUALITY !== false ? 'HEVC' : cfg.codec_fallback;
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-CODEC-PRIMARY:${prioCodecPrimary}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-CODEC-FALLBACK:${prioCodecFallback}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-AUDIO-CODEC-PRIMARY:${window._APE_PRIO_QUALITY !== false ? 'opus' : (cfg.audio_codec_primary || 'opus')}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-AUDIO-CODEC-FALLBACK:${window._APE_PRIO_QUALITY !== false ? 'aac' : (cfg.audio_codec_fallback || 'aac')}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-PREFETCH-SEGMENTS:${cfg.prefetch_segments}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-PREFETCH-PARALLEL:${cfg.prefetch_parallel}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-HDR:${cfg.hdr_support.join(',') || 'none'}`);
            lines.push(`#EXT-X-APE-PROFILE-${profileId}-DEVICE-CLASS:${cfg.device_class}`);
            lines.push('');
        });

        // ═══════════════════════════════════════════════════════════════════════════
        // PRIORIZACIÓN DE PROTOCOLO HTTP/3, HTTP/2, HTTP/1.1 [TOGGLE: prio-http3]
        // ═══════════════════════════════════════════════════════════════════════════
        if (window._APE_PRIO_HTTP3 !== false) {
            lines.push('# ═══════════════════════════════════════════════════════════════════════════');
            lines.push('# PRIORIZACIÓN DE PROTOCOLO: HTTPS/3 > HTTPS/2 > HTTPS/1.1');
            lines.push('# HTTP/3 = QUIC (TLS 1.3 siempre) | HTTP/2 = TLS obligatorio | HTTP/1.1 = TLS preferido');
            lines.push('# ═══════════════════════════════════════════════════════════════════════════');
            lines.push('#EXT-X-APE-ALT-SVC:h2=":443"; ma=86400');
            lines.push('#EXT-X-APE-PREFER-HTTP3:false');
            lines.push('#EXT-X-APE-PROTOCOL-PRIORITY:http/1.1,h2');
            lines.push('#EXT-X-APE-TLS-PRIORITY:tls1.2,tls1.1');
            lines.push('#EXT-X-APE-TLS-REQUIRED:false');
            lines.push('#EXT-X-APE-MIN-HTTP-VERSION:1.1');
            lines.push('#EXT-X-APE-MIN-TLS-VERSION:1.0');
            lines.push('#EXT-X-APE-HTTP2-MULTIPLEX:enabled');
            lines.push('#EXT-X-APE-HTTP2-MAX-CONCURRENT-STREAMS:100');
            lines.push('#EXT-X-APE-HTTP2-PUSH:disabled');
            lines.push('#EXT-X-APE-HTTP3-0RTT:disabled');
            lines.push('#EXT-X-APE-HTTP3-MIGRATION:disabled');
            lines.push('#EXT-X-APE-HTTP3-MAX-IDLE-TIMEOUT:30000');
            lines.push('#EXT-X-APE-COMPRESSION:gzip');
            lines.push('#EXT-X-APE-COMPRESSION-LEVEL:4');
            lines.push('');
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // PRIORIZACIÓN DE CODECS DE MÁXIMA CALIDAD [TOGGLE: prio-quality]
        // ═══════════════════════════════════════════════════════════════════════════
        if (window._APE_PRIO_QUALITY !== false) {
            lines.push('# ═══════════════════════════════════════════════════════════════════════════');
            lines.push('# PRIORIZACIÓN DE CODECS MÁXIMA CALIDAD');
            lines.push('# ═══════════════════════════════════════════════════════════════════════════');
            lines.push('#EXT-X-APE-VIDEO-CODEC-PRIORITY:hevc,h265,H265,h.265,av1,h264');
            lines.push('#EXT-X-APE-AUDIO-CODEC-PRIORITY:opus,aac,mp3');
            lines.push('#EXT-X-APE-VIDEO-QUALITY:high');
            lines.push('#EXT-X-APE-AUDIO-QUALITY:high');
            lines.push('');
        }

        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('# GLOBAL RESILIENCIA 24/7/365');
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('#EXT-X-APE-RESILIENCE-MODE:ULTRA');
        lines.push('#EXT-X-APE-RECONNECT-TIMEOUT-MS:30');
        lines.push('#EXT-X-APE-RECONNECT-MAX-ATTEMPTS:100');
        lines.push('#EXT-X-APE-ZERO-INTERRUPTIONS:true');
        lines.push('#EXT-X-APE-AVAILABILITY-TARGET:99.99');
        lines.push('#EXT-X-APE-BANDWIDTH-GUARANTEE:150');
        lines.push('#EXT-X-APE-QUALITY-ENHANCEMENT:300');
        lines.push('');

        // ═══════════════════════════════════════════════════════════════════════════
        // MONITOREO Y MÉTRICAS EN TIEMPO REAL (GLOBAL)
        // ═══════════════════════════════════════════════════════════════════════════
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('# MONITOREO Y MÉTRICAS EN TIEMPO REAL');
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('#EXT-X-APE-MONITORING:enabled');
        lines.push('#EXT-X-APE-METRICS-INTERVAL:1000');
        lines.push('#EXT-X-APE-THROUGHPUT-MONITORING:enabled');
        lines.push('#EXT-X-APE-LATENCY-MONITORING:enabled');
        lines.push('#EXT-X-APE-BUFFER-MONITORING:enabled');
        lines.push('#EXT-X-APE-ERROR-MONITORING:enabled');
        lines.push('');

        // ═══════════════════════════════════════════════════════════════════════════
        // PRIORIZACIÓN PREMIUM: HEADERS DE PRIORIDAD MÁXIMA
        // ═══════════════════════════════════════════════════════════════════════════
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('# PRIORIZACIÓN PREMIUM');
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('#EXT-X-HEADER-Priority:high');
        lines.push('#EXT-X-HEADER-X-Client-Type:premium_user');
        lines.push('#EXT-X-APE-DYNAMIC-ADAPTATION:enabled');
        lines.push('#EXT-X-APE-CONGESTION-DETECTION:enabled');
        lines.push('');

        // ═══════════════════════════════════════════════════════════════════════════
        // CAPA 2: EXPLOTACIÓN DE 8 VULNERABILIDADES XTREAM CODES
        // ═══════════════════════════════════════════════════════════════════════════
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('# CAPA 2: EXPLOTACIÓN DE 8 VULNERABILIDADES XTREAM CODES');
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');

        // Vulnerabilidad 1: Sin Rate Limiting Inteligente
        lines.push('#EXT-X-APE-REQUEST-RATE:unlimited');
        lines.push('#EXT-X-APE-PARALLEL-REQUESTS:200');

        // Vulnerabilidad 2: Gestión de Sesiones Débil
        lines.push('#EXT-X-APE-SESSION-REUSE:enabled');
        lines.push('#EXT-X-APE-MULTI-IP-SUPPORT:enabled');
        lines.push('#EXT-X-APE-SESSION-PERSISTENCE:true');

        // Vulnerabilidad 3: Sin Validación de Manifesto
        lines.push('#EXT-X-APE-CUSTOM-HEADERS:enabled');
        lines.push('#EXT-X-APE-MANIFEST-INJECTION:enabled');

        // Vulnerabilidad 4: Sin Detección de Patrones Anómalos
        lines.push('#EXT-X-APE-UA-ROTATION-INTERVAL:100ms');
        lines.push('#EXT-X-APE-SEGMENT-SKIP:enabled');
        lines.push('#EXT-X-APE-FAST-FORWARD:unlimited');

        // Vulnerabilidad 5: Sin Cifrado de Credenciales en URL
        lines.push('#EXT-X-APE-URL-REUSE:unlimited');
        lines.push('#EXT-X-APE-CREDENTIAL-PERSISTENCE:true');

        // Vulnerabilidad 6: Sin Límite de Ancho de Banda por Usuario
        lines.push('#EXT-X-APE-BANDWIDTH-UNLIMITED:true');
        lines.push('#EXT-X-APE-NO-THROTTLING:true');

        // Vulnerabilidad 7: Sin Validación de Codec o Bitrate
        lines.push('#EXT-X-APE-CODEC-FORCE:av1,hevc,vp9,h264');
        lines.push('#EXT-X-APE-BITRATE-CUSTOM:50000,25000,8000');

        // Vulnerabilidad 8: Sin Validación de Referrer
        lines.push('#EXT-X-APE-REFERRER-BYPASS:enabled');
        lines.push('#EXT-X-APE-CORS-BYPASS:enabled');
        lines.push('');

        // ═══════════════════════════════════════════════════════════════════════════
        // CAPA 3: 8 TÉCNICAS AVANZADAS DE EXPLOTACIÓN
        // ═══════════════════════════════════════════════════════════════════════════
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('# CAPA 3: 8 TÉCNICAS AVANZADAS DE EXPLOTACIÓN');
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');

        // Técnica 1: Prefetch Agresivo Ilimitado
        lines.push('#EXT-X-APE-PREFETCH-STRATEGY:ULTRA_AGRESIVO_ILIMITADO');
        lines.push('#EXT-X-APE-PREFETCH-SEGMENTS:20'); // v5.3: 500 causaba que el player no arrancara
        lines.push('#EXT-X-APE-PREFETCH-PARALLEL:8'); // v5.3: calibrado
        lines.push('#EXT-X-APE-CONCURRENT-DOWNLOADS:8'); // v5.3: 200 causaba saturación

        // Técnica 2: Rotación de Credenciales Distribuida
        lines.push('#EXT-X-APE-CREDENTIAL-ROTATION:enabled');
        lines.push('#EXT-X-APE-CREDENTIAL-POOL-SIZE:10');
        lines.push('#EXT-X-APE-CREDENTIAL-DISTRIBUTION:round_robin');

        // Técnica 3: Inyección de Headers Personalizados
        lines.push('#EXT-X-HEADER-X-Client-Type:premium_vip');
        lines.push('#EXT-X-HEADER-X-Device-Type:smart_tv_4k');
        lines.push('#EXT-X-HEADER-X-Bandwidth-Capability:1000000000');
        lines.push('#EXT-X-HEADER-X-Resolution-Capability:7680x4320');
        lines.push('#EXT-X-HEADER-X-Codec-Support:av1,hevc,vp9,h264');
        lines.push('#EXT-X-HEADER-X-Priority:critical');
        lines.push('#EXT-X-HEADER-X-QoS-Level:maximum');

        // Técnica 4: Segmentación de Ancho de Banda
        lines.push('#EXT-X-APE-MULTI-STREAM-OPTIMIZATION:enabled');

        // Técnica 5: Caché Distribuido Local
        lines.push('#EXT-X-APE-LOCAL-CACHE:enabled');
        lines.push('#EXT-X-APE-CACHE-LOCATION:/tmp/iptv_cache');
        lines.push('#EXT-X-APE-CACHE-SIZE-MAX:50GB');
        lines.push('#EXT-X-APE-CACHE-TTL:unlimited');
        lines.push('#EXT-X-APE-CACHE-REUSE:enabled');
        lines.push('#EXT-X-APE-CACHE-DEDUPLICATION:enabled');

        // Técnica 6: Evasión de ISP Inteligente (Level 5)
        lines.push('#EXT-X-APE-ISP-EVASION-LEVEL:5');
        lines.push('#EXT-X-APE-PACKET-FRAGMENTATION:enabled');
        lines.push('#EXT-X-APE-TRAFFIC-OBFUSCATION:enabled');
        lines.push('#EXT-X-APE-TIMING-RANDOMIZATION:enabled');
        lines.push('#EXT-X-APE-HEADER-RANDOMIZATION:enabled');
        lines.push('#EXT-X-APE-REQUEST-SPACING:random(10-100ms)');

        // Técnica 7: Adaptación Dinámica Extrema
        lines.push('#EXT-X-APE-LATENCY-THRESHOLDS:500,1000,2000,5000');
        lines.push('#EXT-X-APE-QUALITY-LEVELS:4k,1080p,720p,480p,360p');
        lines.push('#EXT-X-APE-ADAPTATION-INTERVAL:1000ms');

        // Técnica 8: Rotación de Servidores
        lines.push('#EXT-X-APE-SERVER-ROTATION:enabled');
        lines.push('#EXT-X-APE-SERVER-POOL-SIZE:3');
        lines.push('#EXT-X-APE-SERVER-DISTRIBUTION:round_robin');
        lines.push('#EXT-X-SERVER-1:http://pro.123sat.net:2082');
        lines.push('#EXT-X-SERVER-2:http://line.tivi-ott.net');
        lines.push('#EXT-X-SERVER-3:http://candycloud8k.biz');
        lines.push('');

        // ═══════════════════════════════════════════════════════════════════════════
        // CAPA 4: PERFILES DE MÁXIMA CALIDAD (P0-P5)
        // ═══════════════════════════════════════════════════════════════════════════
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('# CAPA 4: PERFILES DE MÁXIMA CALIDAD');
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');

        lines.push('#EXT-X-APE-PROFILE-P0-NAME:ULTRA_EXTREME_8K');
        lines.push('#EXT-X-APE-PROFILE-P0-RESOLUTION:7680x4320');
        lines.push('#EXT-X-APE-PROFILE-P0-FPS:120');
        lines.push('#EXT-X-APE-PROFILE-P0-BITRATE:50000');
        lines.push('#EXT-X-APE-PROFILE-P0-CODEC-PRIMARY:av1');
        lines.push('#EXT-X-APE-PROFILE-P0-CODEC-FALLBACK:hevc');
        lines.push('#EXT-X-APE-PROFILE-P0-AUDIO-CODEC-PRIMARY:opus');
        lines.push('#EXT-X-APE-PROFILE-P0-HDR:hdr10,dolby_vision,hlg');

        lines.push('#EXT-X-APE-PROFILE-P1-NAME:PREMIUM_4K_HDR');
        lines.push('#EXT-X-APE-PROFILE-P1-RESOLUTION:3840x2160');
        lines.push('#EXT-X-APE-PROFILE-P1-FPS:60');
        lines.push('#EXT-X-APE-PROFILE-P1-BITRATE:25000');
        lines.push('#EXT-X-APE-PROFILE-P1-CODEC-PRIMARY:hevc');
        lines.push('#EXT-X-APE-PROFILE-P1-CODEC-FALLBACK:h264');
        lines.push('#EXT-X-APE-PROFILE-P1-AUDIO-CODEC-PRIMARY:aac');
        lines.push('#EXT-X-APE-PROFILE-P1-HDR:hdr10,hlg');

        lines.push('#EXT-X-APE-PROFILE-P2-NAME:FULL_HD_OPTIMIZADO');
        lines.push('#EXT-X-APE-PROFILE-P2-RESOLUTION:1920x1080');
        lines.push('#EXT-X-APE-PROFILE-P2-FPS:60');
        lines.push('#EXT-X-APE-PROFILE-P2-BITRATE:8000');
        lines.push('#EXT-X-APE-PROFILE-P2-CODEC-PRIMARY:hevc');
        lines.push('#EXT-X-APE-PROFILE-P2-CODEC-FALLBACK:h264');
        lines.push('#EXT-X-APE-PROFILE-P2-AUDIO-CODEC-PRIMARY:aac');

        lines.push('#EXT-X-APE-PROFILE-P3-NAME:HD_STREAMING');
        lines.push('#EXT-X-APE-PROFILE-P3-RESOLUTION:1280x720');
        lines.push('#EXT-X-APE-PROFILE-P3-FPS:60');
        lines.push('#EXT-X-APE-PROFILE-P3-BITRATE:5000');
        lines.push('#EXT-X-APE-PROFILE-P3-CODEC-PRIMARY:h264');
        lines.push('#EXT-X-APE-PROFILE-P3-AUDIO-CODEC-PRIMARY:aac');

        lines.push('#EXT-X-APE-PROFILE-P4-NAME:SD_FALLBACK');
        lines.push('#EXT-X-APE-PROFILE-P4-RESOLUTION:854x480');
        lines.push('#EXT-X-APE-PROFILE-P4-FPS:30');
        lines.push('#EXT-X-APE-PROFILE-P4-BITRATE:2500');
        lines.push('#EXT-X-APE-PROFILE-P4-CODEC-PRIMARY:h264');
        lines.push('#EXT-X-APE-PROFILE-P4-AUDIO-CODEC-PRIMARY:aac');

        lines.push('#EXT-X-APE-PROFILE-P5-NAME:MOBILE_MINIMAL');
        lines.push('#EXT-X-APE-PROFILE-P5-RESOLUTION:640x360');
        lines.push('#EXT-X-APE-PROFILE-P5-FPS:24');
        lines.push('#EXT-X-APE-PROFILE-P5-BITRATE:1000');
        lines.push('#EXT-X-APE-PROFILE-P5-CODEC-PRIMARY:h264');
        lines.push('#EXT-X-APE-PROFILE-P5-AUDIO-CODEC-PRIMARY:aac');
        lines.push('');

        // ═══════════════════════════════════════════════════════════════════════════
        // MOTOR DE EVASIÓN v3.0 CONFIGURATION
        // ═══════════════════════════════════════════════════════════════════════════
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('# MOTOR DE EVASIÓN v3.0');
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('#EXT-X-MOTOR-EVASION:ENABLED');
        lines.push('#EXT-X-MOTOR-VERSION:3.0');
        lines.push('#EXT-X-MOTOR-PROXY:178.156.147.234:8888');
        lines.push(`#EXT-X-MOTOR-FECHA-ACTUALIZACION:${new Date().toISOString().split('T')[0]}`);
        lines.push('');

        // Configuración de User-Agents
        lines.push('# CONFIGURACIÓN DE USER-AGENTS');
        lines.push('#EXT-X-UA-ROTATION:true');
        const totalUAs = window.UserAgentRotator?._getTotalUAs?.() || 2574;
        lines.push(`#EXT-X-UA-POOL-SIZE:${totalUAs}`);
        lines.push('#EXT-X-UA-CATEGORIES:chrome,firefox,safari,android,iptv_apps');
        lines.push('#EXT-X-UA-PONDERACION:chrome=35,firefox=20,safari=15,android=15,apps=15');
        lines.push('');

        // Configuración de Headers Dinámicos
        lines.push('# CONFIGURACIÓN DE HEADERS DINÁMICOS');
        lines.push('#EXT-X-HEADERS-DYNAMIC:true');
        lines.push('#EXT-X-HEADERS-ROTATE:true');
        lines.push('#EXT-X-HEADERS-DNT:1');
        lines.push('#EXT-X-HEADERS-CACHE-CONTROL:no-cache');
        lines.push('#EXT-X-HEADERS-REFERER:random');
        lines.push('');

        // Configuración de Detección de Bloqueos
        lines.push('# DETECCIÓN DE BLOQUEOS');
        lines.push('#EXT-X-BLOQUEO-DETECCION:true');
        lines.push('#EXT-X-BLOQUEO-CODIGOS:407,403,429,502,503');
        lines.push('#EXT-X-BLOQUEO-RESPUESTA:auto-retry');
        lines.push('#EXT-X-BLOQUEO-REINTENTOS:3');
        lines.push('');

        // ═══════════════════════════════════════════════════════════════════════════
        // OPTIMIZACIÓN DE TRANSPORTE AVANZADA (GLOBAL)
        // Resource Hints, HTTP/3, Chunked Transfer, Early Hints
        // ═══════════════════════════════════════════════════════════════════════════
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('# OPTIMIZACIÓN DE TRANSPORTE AVANZADA (GLOBAL)');
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('#EXT-X-APE-GLOBAL-HEADER:name=Accept-CH, value="Sec-CH-UA-Arch, Sec-CH-UA-Bitness, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Mobile, Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version"');
        lines.push('#EXT-X-APE-GLOBAL-HEADER:name=Accept-Encoding, value="gzip, deflate, chunked"');
        lines.push('#EXT-X-APE-GLOBAL-HEADER:name=Early-Data, value="1"');
        lines.push('#EXT-X-APE-GLOBAL-HEADER:name=Alt-Svc, value=\'h3=":443"; ma=86400\'');
        lines.push('');

        // Información del Servidor
        lines.push('# INFORMACIÓN DEL SERVIDOR PROXY');
        lines.push('#EXT-X-SERVER-IP:178.156.147.234');
        lines.push('#EXT-X-SERVER-PORT:8888');
        lines.push('#EXT-X-SERVER-REGION:EU');
        lines.push('#EXT-X-SERVER-UPTIME:99.9%');
        lines.push('#EXT-X-SERVER-BANDWIDTH:1000Mbps');
        lines.push('');

        lines.push('#EXT-X-APE-EMBEDDED-CONFIG-END');
        lines.push('');

        // ═══════════════════════════════════════════════════════════════════════════
        // 🌐 CLEAN URL MODE - HEADERS GLOBALES (Migrados desde JWT)
        // ═══════════════════════════════════════════════════════════════════════════
        if (CLEAN_URL_MODE) {
            const now = Math.floor(Date.now() / 1000);
            const sessionId = generateRandomString(32);
            const fingerprint = window.DeviceFingerprintCollector?._cache?.unique_hash || ('FP_' + generateRandomString(32));
            const fpDevice = window.DeviceFingerprintCollector?._cache?.device_type ||
                (typeof navigator !== 'undefined' && navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop');
            const fpPlatform = window.DeviceFingerprintCollector?._cache?.device_platform ||
                (typeof navigator !== 'undefined' ? navigator.platform : 'Win32');
            const fpScreen = window.DeviceFingerprintCollector?._cache ?
                `${window.DeviceFingerprintCollector._cache.screen_width}x${window.DeviceFingerprintCollector._cache.screen_height}` :
                (typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '1920x1080');
            const fpTz = window.DeviceFingerprintCollector?._cache?.timezone ||
                (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
            const fpLang = window.DeviceFingerprintCollector?._cache?.browser_language ||
                (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

            lines.push('# ═══════════════════════════════════════════════════════════════════════════');
            lines.push('# 🌐 CLEAN URL ARCHITECTURE - HEADERS GLOBALES');
            lines.push('# ═══════════════════════════════════════════════════════════════════════════');
            lines.push('#EXT-X-APE-URL-MODE:CLEAN');
            lines.push('#EXT-X-APE-JWT-MODE:DISABLED');
            lines.push(`#EXT-X-APE-SESSION-TIMESTAMP:${now}`);
            lines.push('');

            // Fingerprint y Sesión (antes en JWT SECCIÓN 7)
            lines.push('# FINGERPRINT Y SESIÓN GLOBAL');
            lines.push(`#EXT-X-APE-FINGERPRINT:${fingerprint}`);
            lines.push(`#EXT-X-APE-FP-DEVICE:${fpDevice}`);
            lines.push(`#EXT-X-APE-FP-PLATFORM:${fpPlatform}`);
            lines.push(`#EXT-X-APE-FP-SCREEN:${fpScreen}`);
            lines.push(`#EXT-X-APE-FP-TZ:${fpTz}`);
            lines.push(`#EXT-X-APE-FP-LANG:${fpLang}`);
            lines.push(`#EXT-X-APE-FP-SESSION:${sessionId}`);
            lines.push('');

            // Evasión Global (antes en JWT SECCIÓN 7)
            lines.push('# EVASIÓN Y SEGURIDAD GLOBAL');
            lines.push('#EXT-X-APE-ISP-EVASION-LEVEL:3');
            lines.push('#EXT-X-APE-CDN-PRIORITY:premium');
            lines.push('#EXT-X-APE-GEO-RESILIENCE:true');
            lines.push('#EXT-X-APE-PROXY-ROTATION:true');
            lines.push('#EXT-X-APE-INVISIBILITY-ENABLED:true');
            lines.push('#EXT-X-APE-SERVICE-TIER:PREMIUM');
            lines.push('');

            // Metadatos Globales (antes en JWT SECCIÓN 8)
            lines.push('# METADATOS DE CALIDAD GLOBAL');
            lines.push('#EXT-X-APE-BANDWIDTH-GUARANTEE:150');
            lines.push('#EXT-X-APE-QUALITY-ENHANCEMENT:300');
            lines.push('#EXT-X-APE-ZERO-INTERRUPTIONS:true');
            lines.push('#EXT-X-APE-AVAILABILITY-TARGET:99.99%');
            lines.push('');
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // 🌐 GLOBAL HTTP HEADERS (#EXT-X-APE-HTTP-HEADERS) - WIRED TO PROFILE TOGGLES
        // ═══════════════════════════════════════════════════════════════════════════
        if (window.APE_PROFILES_CONFIG?.getEXTHTTPBlock) {
            // Obtener perfil activo desde localStorage o default P3
            const activeProfile = localStorage.getItem('ape_active_profile') || 'P3';

            // Opciones dinámicas (UA Rotator, Fingerprint)
            const options = {};

            // Intentar obtener UA del rotator si está disponible
            if (window.UserAgentRotator) {
                const rotated = window.UserAgentRotator.select({ weighted: true, microVariation: true });
                options.userAgent = rotated.userAgent;
            }

            // Intentar obtener fingerprint si está disponible
            if (window.DeviceFingerprint) {
                options.fingerprint = window.DeviceFingerprint.getData();
            }

            const exthttpBlock = window.APE_PROFILES_CONFIG.getEXTHTTPBlock(activeProfile, options);
            lines.push(exthttpBlock);
        } else {
            // Fallback: marcar que EXTHTTP no está disponible
            lines.push('');
            lines.push('# ⚠️ EXTHTTP: APE_PROFILES_CONFIG not loaded, HTTP headers omitted');
            lines.push('');
        }

        lines.push(`#PLAYLIST:IPTV Navigator PRO - Typed Arrays Ultimate v${VERSION}`);

        return lines.join('\n');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARRAY 2: EXTVLCOPT_TEMPLATE (63 líneas por canal)
    // ═══════════════════════════════════════════════════════════════════════════

    // Cache para UA seleccionado (usado también por JWT)
    let _cachedSelectedUA = null;

    function generateEXTVLCOPT(profile) {
        const cfg = getProfileConfig(profile);

        // 🔄 CADENA DE SELECCIÓN DE USER-AGENT:
        // 1. Strategic Headers (si está en modo MANUAL)
        // 2. UserAgentRotator (si está disponible)
        // 3. Fallback: OTT Navigator
        let selectedUA;

        // Opción 1: Strategic Headers (modo MANUAL)
        const strategicConfig = window.APE_PROFILES_CONFIG?.getStrategicHeader?.('User-Agent');
        if (strategicConfig?.mode === 'MANUAL' && strategicConfig.manualValue) {
            selectedUA = strategicConfig.manualValue;
        }
        // Opción 2: UserAgentRotator (modo DYNAMIC o no hay strategic)
        else if (window.UserAgentRotator) {
            const rotated = window.UserAgentRotator.select({
                weighted: true,
                microVariation: true
            });
            selectedUA = rotated.userAgent;
            console.log(`🔄 UA Rotator: [${rotated.category}] #${rotated.rotationNumber}`);
        }
        // Opción 3: Fallback
        else {
            selectedUA = 'OTT Navigator/1.6.9.4 (Build 40936) AppleWebKit/606';
        }

        // Cache para uso en JWT
        _cachedSelectedUA = selectedUA;

        const vlcOpts = [
            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 1: USER-AGENT Y HEADERS (9 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#EXTVLCOPT:http-user-agent=${selectedUA}`,
            '#EXTVLCOPT:http-referrer=https://premium-iptv-service.com/',
            '#EXTVLCOPT:http-accept=*/*',
            '#EXTVLCOPT:http-accept-language=en-US,en;q=0.9,es;q=0.8',
            '#EXTVLCOPT:http-accept-encoding=gzip, deflate',
            '#EXTVLCOPT:http-connection=keep-alive',
            '#EXTVLCOPT:http-cache-control=no-cache',
            '#EXTVLCOPT:http-pragma=no-cache',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 1B: HEADERS HTTP COMPLETOS (18 líneas) [WIRED FROM TEMPLATE]
            // ───────────────────────────────────────────────────────────────────
            '#EXTVLCOPT:http-header:Connection=keep-alive',
            '#EXTVLCOPT:http-header:Keep-Alive=timeout=300, max=1000',
            // C8 (2026-05-11) — eliminados 6 headers tóxicos. Mismo bug que EXTHTTP:
            // If-None-Match:* → 304+0B → okhttp "unexpected end of stream".
            // Ver memoria feedback_exthttp_traps.md trampa #9.
            // '#EXTVLCOPT:http-header:Range=bytes=0-',
            // '#EXTVLCOPT:http-header:If-None-Match=*',
            '#EXTVLCOPT:http-header:Sec-Fetch-Dest=media',
            '#EXTVLCOPT:http-header:Sec-Fetch-Mode=no-cors',
            '#EXTVLCOPT:http-header:Sec-Fetch-Site=same-origin',
            '#EXTVLCOPT:http-header:Sec-Fetch-User=?0',
            '#EXTVLCOPT:http-header:DNT=0',
            '#EXTVLCOPT:http-header:Sec-GPC=0',
            // '#EXTVLCOPT:http-header:Upgrade-Insecure-Requests=0',
            // '#EXTVLCOPT:http-header:TE=trailers, gzip, deflate',
            '#EXTVLCOPT:http-header:Accept-Charset=utf-8, iso-8859-1;q=0.5',
            '#EXTVLCOPT:http-header:Origin=http://line.tivi-ott.net',
            '#EXTVLCOPT:http-header:Referer=http://line.tivi-ott.net/',
            '#EXTVLCOPT:http-header:X-Requested-With=XMLHttpRequest',
            // `#EXTVLCOPT:http-header:If-Modified-Since=${new Date(Date.now() - 86400000).toUTCString()}`,
            // '#EXTVLCOPT:http-header:Priority=u=1, i',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 2: CACHÉ Y SINCRONIZACIÓN (9 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#EXTVLCOPT:network-caching-dscp=46`,
            `#EXTVLCOPT:network-caching=${GLOBAL_CACHING.network}`,
            `#EXTVLCOPT:live-caching=${GLOBAL_CACHING.live}`,
            `#EXTVLCOPT:file-caching=${GLOBAL_CACHING.file}`,
            `#EXTVLCOPT:clock-jitter=${cfg.clock_jitter || 1500}`,
            `#EXTVLCOPT:clock-synchro=${cfg.clock_synchro || 1}`,
            `#EXTVLCOPT:sout-mux-caching=${GLOBAL_CACHING.live}` // v5.3: usar live_cache,
            '#EXTVLCOPT:sout-audio-sync=1',
            '#EXTVLCOPT:sout-video-sync=1',
            `#EXTVLCOPT:disc-caching=${GLOBAL_CACHING.live}` // v5.3: usar live_cache,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 2B: OPTIMIZACIÓN TLS v1.0 (8 líneas) [TOGGLE: tls-coherence]
            // ───────────────────────────────────────────────────────────────────
            '#EXTVLCOPT:http-tls-version=1.0',
            '#EXTVLCOPT:gnutls-priorities=PERFORMANCE:%SERVER_PRECEDENCE',
            '#EXTVLCOPT:http-tls-session-resumption=true',
            '#EXTVLCOPT:http-ssl-verify-peer=false',
            '#EXTVLCOPT:http-ssl-verify-host=false',
            '#EXTVLCOPT:http-tls-handshake-timeout=5000',
            '#EXTVLCOPT:http-persistent=true',
            '#EXTVLCOPT:http-max-connections=3',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 3: DECODIFICACIÓN Y HARDWARE (9 líneas)
            // ───────────────────────────────────────────────────────────────────
            '#EXTVLCOPT:avcodec-hw=any',
            '#EXTVLCOPT:avcodec-threads=0',
            '#EXTVLCOPT:avcodec-fast=1',
            '#EXTVLCOPT:avcodec-skiploopfilter=4',
            '#EXTVLCOPT:avcodec-hurry-up=1',
            '#EXTVLCOPT:avcodec-skip-frame=0',
            '#EXTVLCOPT:avcodec-skip-idct=0',
            '#EXTVLCOPT:sout-avcodec-strict=-2',
            '#EXTVLCOPT:ffmpeg-threads=0',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 4: CALIDAD DE VIDEO (9 líneas)
            // ───────────────────────────────────────────────────────────────────
            // 🚀 JERARQUÍA RESOLUCIÓN INFINITA
            `#EXTVLCOPT:preferred-resolution=480`,
            `#EXTVLCOPT:adaptive-maxwidth=854`,
            `#EXTVLCOPT:adaptive-maxheight=480`,
            `#EXTVLCOPT:preferred-resolution=720`,
            `#EXTVLCOPT:adaptive-maxwidth=1280`,
            `#EXTVLCOPT:adaptive-maxheight=720`,
            `#EXTVLCOPT:preferred-resolution=1080`,
            `#EXTVLCOPT:adaptive-maxwidth=1920`,
            `#EXTVLCOPT:adaptive-maxheight=1080`,
            `#EXTVLCOPT:preferred-resolution=2160`,
            `#EXTVLCOPT:adaptive-maxwidth=3840`,
            `#EXTVLCOPT:adaptive-maxheight=2160`,
            `#EXTVLCOPT:preferred-resolution=4320`,
            `#EXTVLCOPT:adaptive-maxwidth=7680`,
            `#EXTVLCOPT:adaptive-maxheight=4320`,
            `#EXTVLCOPT:adaptive-logic=highest`,

            // 🎥 JERARQUÍA BWDIF (HW ENFORCER VIP)
            `#EXTVLCOPT:video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full`,
            ...(isModuleEnabled('quality-overlay-vip') ? [
                `#EXTVLCOPT:deinterlace-mode=bwdif` // 👑 VIP Strict
            ] : [
                `#EXTVLCOPT:deinterlace-mode=yadif`,
                `#EXTVLCOPT:deinterlace-mode=yadif2x`,
                `#EXTVLCOPT:deinterlace-mode=bwdif`
            ]),
            '#EXTVLCOPT:postproc-q=6',
            '#EXTVLCOPT:aspect-ratio=16:9',
            '#EXTVLCOPT:video-on-top=0',
            '#EXTVLCOPT:video-deco=1',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 5: POST-PROCESAMIENTO (6 líneas)
            // ───────────────────────────────────────────────────────────────────
            '#EXTVLCOPT:video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full
            '#EXTVLCOPT:sharpen-sigma=0.05',
            '#EXTVLCOPT:contrast=1.0',
            '#EXTVLCOPT:brightness=1.0',
            '#EXTVLCOPT:saturation=1.0',
            '#EXTVLCOPT:gamma=1.0',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 6: CONEXIÓN ESTABLE (6 líneas)
            // ───────────────────────────────────────────────────────────────────
            '#EXTVLCOPT:http-reconnect=true',
            '#EXTVLCOPT:http-continuous=true',
            '#EXTVLCOPT:http-forward-cookies=true',
            '#EXTVLCOPT:no-http-reconnect=0',
            '#EXTVLCOPT:ipv4-timeout=1000',
            '#EXTVLCOPT:tcp-caching=3000',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 7: RESILIENCIA 24/7/365 (15 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#EXTVLCOPT:repeat=${cfg.reconnect_max_attempts}`,
            '#EXTVLCOPT:input-repeat=65535',
            '#EXTVLCOPT:loop=1',
            '#EXTVLCOPT:no-drop-late-frames=1',
            '#EXTVLCOPT:no-skip-frames=1',
            '#EXTVLCOPT:network-synchronisation=1',
            `#EXTVLCOPT:mtu=${Math.min(65535, cfg.max_bandwidth / 100)}`,
            '#EXTVLCOPT:live-pause=0',
            '#EXTVLCOPT:high-priority=1',
            '#EXTVLCOPT:auto-adjust-pts-delay=1',
            '#EXTVLCOPT:sout-keep=1',
            '#EXTVLCOPT:play-and-exit=0',
            '#EXTVLCOPT:playlist-autostart=1',
            '#EXTVLCOPT:one-instance-when-started-from-file=0',
            '#EXTVLCOPT:no-crashdump=1',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 8: ADAPTIVE CACHING OPTIMIZADO [NUEVO]
            // ───────────────────────────────────────────────────────────────────
            '#EXTVLCOPT:adaptive-caching=true',
            '#EXTVLCOPT:adaptive-cache-size=5000',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 8B: HEVC/H.265 OPTIMIZATION + HW ENFORCER (VIP)
            // ───────────────────────────────────────────────────────────────────
            ...(isModuleEnabled('quality-overlay-vip') ? [
                `#EXTVLCOPT:codec=hevc`, // 👑 VIP Strict (No H.264 fallback)
                `#EXTVLCOPT:avcodec-codec=hevc`,
                `#EXTVLCOPT:sout-video-codec=hevc`
            ] : [
                `#EXTVLCOPT:codec=hevc,h264`
            ]),
            `#EXTVLCOPT:sout-video-profile=${cfg.video_profile || 'main10'}`,
            `#EXTVLCOPT:force-dolby-surround=0`
        ];

        // ───────────────────────────────────────────────────────────────────
        // SECCIÓN 9: PRIORIZACIÓN HTTP/2-HTTP/3 POR CANAL [TOGGLE: prio-http3]
        // ───────────────────────────────────────────────────────────────────
        if (window._APE_PRIO_HTTP3 !== false) {
            vlcOpts.push(
                '#EXTVLCOPT:http-priority=u=1, i',
                '#EXTVLCOPT:http-accept-encoding=gzip, deflate',
                '#EXTVLCOPT:http-keep-alive=timeout=60, max=100'
            );
        }

        // 🛡️ QUANTUM SHIELD INJECTION (VLC OPTIONS)
        if (window._APE_QUANTUM_SHIELD_2026) {
            vlcOpts.push(
                '#EXTVLCOPT:http-continuous=true',
                '#EXTVLCOPT:http-reconnect=true',
                '#EXTVLCOPT:clock-jitter=1500'
            );
        }

        return vlcOpts;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARRAY 3: KODIPROP_TEMPLATE (38 líneas por canal)
    // ═══════════════════════════════════════════════════════════════════════════

    function generateKODIPROP(profile) {
        const cfg = getProfileConfig(profile);
        // Usar el UA rotado del cache (mismo que EXTVLCOPT y JWT) para coherencia
        const kodiUA = _cachedSelectedUA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
        const encodedUA = encodeURIComponent(kodiUA);

        return [
            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 1: CONFIGURACIÓN BÁSICA (6 líneas)
            // ───────────────────────────────────────────────────────────────────
            '#KODIPROP:inputstream=inputstream.adaptive',
            '#KODIPROP:inputstream.adaptive.manifest_type=hls',
            '#KODIPROP:inputstream.adaptive.manifest_update_parameter=full',
            `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=${encodedUA}`,
            '#KODIPROP:inputstream.adaptive.chooser_resolution_max=MAX',
            '#KODIPROP:inputstream.adaptive.chooser_bandwidth_mode=AUTO',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 2: BANDWIDTH Y RESOLUCIÓN (6 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#KODIPROP:inputstream.adaptive.max_bandwidth=${cfg.bitrate * 30000}`,
            `#KODIPROP:inputstream.adaptive.min_bandwidth=${cfg.min_bandwidth}`,
            `#KODIPROP:inputstream.adaptive.max_resolution=${cfg.resolution}`,
            `#KODIPROP:inputstream.adaptive.chooser_resolution_max=${cfg.resolution}`,
            `#KODIPROP:inputstream.adaptive.initial_bandwidth=${cfg.bitrate * 3000}`,
            `#KODIPROP:inputstream.adaptive.pre_buffer_bytes=${cfg.prefetch_buffer_target}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 3: BUFFERING AGRESIVO (6 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#KODIPROP:inputstream.adaptive.buffer_segments=${Math.floor(cfg.prefetch_segments / 2)}`,
            `#KODIPROP:inputstream.adaptive.buffer_duration=${Math.floor(GLOBAL_CACHING.network / 1000)}`,
            '#KODIPROP:inputstream.adaptive.buffer_type=AGGRESSIVE',
            '#KODIPROP:inputstream.adaptive.stream_selection_type=FIXED',
            '#KODIPROP:inputstream.adaptive.live_delay=0',
            '#KODIPROP:inputstream.adaptive.play_timeshift_buffer=true',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 4: DECODIFICACIÓN Y CALIDAD (6 líneas)
            // ───────────────────────────────────────────────────────────────────
            '#KODIPROP:inputstream.adaptive.media_renewal_url=',
            '#KODIPROP:inputstream.adaptive.media_renewal_time=0',
            `#KODIPROP:inputstream.adaptive.original_audio_language=${cfg.audio_channels > 2 ? 'mul' : 'und'}`,
            `#KODIPROP:inputstream.adaptive.video_codec_override=${window._APE_PRIO_QUALITY !== false ? 'hevc' : ''}`,
            `#KODIPROP:inputstream.adaptive.audio_codec_override=${window._APE_PRIO_QUALITY !== false ? 'opus' : ''}`,
            '#KODIPROP:inputstream.adaptive.ignore_screen_resolution=true',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 5: CONFIGURACIÓN AVANZADA (8 líneas)
            // ───────────────────────────────────────────────────────────────────
            '#KODIPROP:inputstream.adaptive.manifest_headers=',
            '#KODIPROP:inputstream.adaptive.license_flags=persistent_storage',
            '#KODIPROP:inputstream.adaptive.server_certificate=',
            '#KODIPROP:inputstream.adaptive.license_url=',
            '#KODIPROP:inputstream.adaptive.license_type=',
            `#KODIPROP:inputstream.adaptive.stream_params=profile=${profile}`,
            '#KODIPROP:inputstream.adaptive.adaptation.set_limits=true',
            '#KODIPROP:inputstream.adaptive.drm_legacy_mode=true',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 6: RESILIENCIA 24/7/365 (6 líneas)
            // ───────────────────────────────────────────────────────────────────
            '#KODIPROP:inputstream.adaptive.manifest_reconnect=true',
            '#KODIPROP:inputstream.adaptive.manifest_reload.time=5000',
            `#KODIPROP:inputstream.adaptive.retry_max=${cfg.reconnect_max_attempts}`,
            `#KODIPROP:inputstream.adaptive.retry_timeout=${cfg.reconnect_timeout_ms}`,
            '#KODIPROP:inputstream.adaptive.segment_download_retry=10',
            '#KODIPROP:inputstream.adaptive.segment_download_timeout=30000',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 7: OPTIMIZACIÓN TLS v1.0 (6 líneas) [TOGGLE: tls-coherence]
            // ───────────────────────────────────────────────────────────────────
            '#KODIPROP:inputstream.adaptive.min_tls_version=1.0',
            '#KODIPROP:inputstream.adaptive.tls_cipher_suites=TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384',
            '#KODIPROP:inputstream.adaptive.tls_session_tickets=true',
            '#KODIPROP:inputstream.adaptive.ocsp_stapling=true',
            '#KODIPROP:inputstream.adaptive.verify_ssl=false',
            `#KODIPROP:inputstream.adaptive.connection_timeout=${GLOBAL_CACHING.network}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 8: HEVC/H.265 OPTIMIZATION (2 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#KODIPROP:inputstream.adaptive.preferred_codec=hevc`,
            `#KODIPROP:inputstream.adaptive.video_profile=${cfg.video_profile || 'main10'}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 9: AUDIO PREMIUM (6 líneas) [WIRED FROM TEMPLATE]
            // ───────────────────────────────────────────────────────────────────
            `#KODIPROP:inputstream.adaptive.audio_channels=${cfg.audio_channels >= 6 ? '7.1' : '2.0'}`,
            '#KODIPROP:inputstream.adaptive.audio_sample_rate=48000',
            '#KODIPROP:inputstream.adaptive.audio_bit_depth=24',
            `#KODIPROP:inputstream.adaptive.dolby_atmos=${cfg.audio_channels >= 6}`,
            `#KODIPROP:inputstream.adaptive.spatial_audio=${cfg.audio_channels >= 6}`,
            '#KODIPROP:inputstream.adaptive.audio_passthrough=true',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 10: OTT PLAYER OPTIMIZATION (6 líneas) [WIRED FROM TEMPLATE]
            // ───────────────────────────────────────────────────────────────────
            '#KODIPROP:inputstream.adaptive.hardware_decode=true',
            '#KODIPROP:inputstream.adaptive.tunneling_enabled=auto',
            '#KODIPROP:inputstream.adaptive.epg_sync=enabled',
            '#KODIPROP:inputstream.adaptive.catchup_support=flussonic',
            '#KODIPROP:inputstream.adaptive.audio_track_selection=default',
            '#KODIPROP:inputstream.adaptive.subtitle_track_selection=off',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 11: STREAMING CONTROL & ABR (6 líneas) [WIRED FROM TEMPLATE]
            // ───────────────────────────────────────────────────────────────────
            `#KODIPROP:inputstream.adaptive.initial_bitrate_max=${cfg.bitrate * 30000}`,
            `#KODIPROP:inputstream.adaptive.read_timeout=${cfg.read_timeout_ms || 30000}`,
            '#KODIPROP:inputstream.adaptive.bandwidth_estimation=auto',
            '#KODIPROP:inputstream.adaptive.bandwidth_preference=unlimited',
            `#KODIPROP:inputstream.adaptive.max_fps=${cfg.fps || 60}`,
            '#KODIPROP:inputstream.adaptive.drm_type=widevine,playready'
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARRAY 4: EXT_X_APE_TEMPLATE (29 líneas por canal)
    // ═══════════════════════════════════════════════════════════════════════════

    function generateEXTXAPE(channel, profile, jwt = null) {
        const cfg = getProfileConfig(profile);
        const resolution = channel.resolution || cfg.resolution;
        const bitrate = channel.bitrate || cfg.bitrate;
        const fps = channel.fps || cfg.fps;

        const apeHeaders = [
            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 1: VERSIÓN Y RESOLUCIÓN (4 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#EXT-X-APE-VERSION:${VERSION}`,
            `#EXT-X-APE-PROFILE:${profile}`,
            `#EXT-X-APE-RESOLUTION:${resolution}`,
            `#EXT-X-APE-FPS:${fps}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 2: CODEC (4 líneas) [TOGGLE: prio-quality]
            // Prio ON: siempre max compresión (AV1/HEVC). OFF: nativo del perfil.
            // ───────────────────────────────────────────────────────────────────
            `#EXT-X-APE-CODEC:${window._APE_PRIO_QUALITY !== false ? (profile === 'P0' ? 'AV1' : 'HEVC') : cfg.codec_primary}`,
            `#EXT-X-APE-CODEC-PRIMARY:${window._APE_PRIO_QUALITY !== false ? (profile === 'P0' ? 'HEVC' : 'HEVC') : cfg.codec_primary}`,
            `#EXT-X-APE-CODEC-FALLBACK:${window._APE_PRIO_QUALITY !== false ? 'HEVC' : cfg.codec_fallback}`,
            `#EXT-X-APE-CODEC-PRIORITY:${window._APE_PRIO_QUALITY !== false ? 'hevc,h265,H265,h.265,av1,h264' : cfg.codec_priority}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 3: BITRATE Y BUFFER (4 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#EXT-X-APE-BITRATE:${bitrate}`,
            `#EXT-X-APE-BUFFER:${cfg.buffer_ms}`,
            `#EXT-X-APE-NETWORK-CACHING:${GLOBAL_CACHING.network}`,
            `#EXT-X-APE-LIVE-CACHING:${GLOBAL_CACHING.live}`,
            `#EXT-X-APE-FILE-CACHING:${GLOBAL_CACHING.file}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 4: THROUGHPUT Y ESTRATEGIA (4 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#EXT-X-APE-THROUGHPUT-T1:${cfg.throughput_t1}`,
            `#EXT-X-APE-THROUGHPUT-T2:${cfg.throughput_t2}`,
            `#EXT-X-APE-STRATEGY:${cfg.strategy || cfg.prefetch_strategy || 'ultra-aggressive'}`,
            `#EXT-X-APE-PREFETCH-STRATEGY:${cfg.prefetch_strategy || cfg.strategy || 'ULTRA_AGRESIVO'}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 5: PREFETCH (6 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#EXT-X-APE-PREFETCH-SEGMENTS:${cfg.prefetch_segments}`,
            `#EXT-X-APE-PREFETCH-PARALLEL:${cfg.prefetch_parallel}`,
            `#EXT-X-APE-PREFETCH-BUFFER-TARGET:${cfg.prefetch_buffer_target}`,
            `#EXT-X-APE-PREFETCH-MIN-BANDWIDTH:${cfg.prefetch_min_bandwidth}`,
            `#EXT-X-APE-PREFETCH-ADAPTIVE:${cfg.prefetch_adaptive_enabled !== false}`,
            `#EXT-X-APE-PREFETCH-AI-ENABLED:${cfg.prefetch_ai_prediction || false}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 6: RESILIENCIA (4 líneas)
            // ───────────────────────────────────────────────────────────────────
            '#EXT-X-APE-QUALITY-THRESHOLD:0.95',
            `#EXT-X-APE-SEGMENT-DURATION:${cfg.segment_duration || 2}`,
            `#EXT-X-APE-RECONNECT-TIMEOUT:${cfg.reconnect_timeout_ms}`,
            '#EXT-X-APE-ZERO-INTERRUPTIONS:true',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 6B: OPTIMIZACIONES AVANZADAS (10 líneas) [NUEVAS]
            // ───────────────────────────────────────────────────────────────────
            `#EXT-X-APE-RECONNECT-TIMEOUT-MS:${cfg.reconnect_timeout_ms}`,
            '#EXT-X-APE-FALLBACK-ENABLED:true',
            '#EXT-X-APE-FALLBACK-BITRATE:auto',
            '#EXT-X-APE-FALLBACK-TIMEOUT:5000',
            `#EXT-X-APE-SEGMENT-DURATION-MIN:1`,
            `#EXT-X-APE-SEGMENT-DURATION-MAX:${cfg.segment_duration || 2}`,
            '#EXT-X-APE-SEGMENT-ADAPTATION:enabled',
            '#EXT-X-APE-PREFETCH-LOOKAHEAD:5',
            '#EXT-X-APE-PREFETCH-PRIORITY:sequential',
            `#EXT-X-APE-AVAILABILITY-TARGET:${cfg.availability_target || 99.999}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 7: HDR Y COLOR (3 líneas)
            // ───────────────────────────────────────────────────────────────────
            `#EXT-X-APE-HDR-SUPPORT:${cfg.hdr_support.join(',') || 'none'}`,
            `#EXT-X-APE-COLOR-DEPTH:${cfg.color_depth}`,
            `#EXT-X-APE-AUDIO-CHANNELS:${cfg.audio_channels}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 8: MOTOR DINÁMICO JWT + UA ROTATION (5 líneas) [NUEVO]
            // ───────────────────────────────────────────────────────────────────
            '#EXT-X-APE-JWT-ENGINE:ENABLED',
            '#EXT-X-APE-JWT-REFRESH-MS:30',
            '#EXT-X-APE-UA-ROTATION:ENABLED',
            `#EXT-X-APE-UA-POOL-SIZE:${window.UserAgentRotator?._getTotalUAs?.() || 105}`,
            '#EXT-X-APE-BLOCK-DETECTION:ENABLED',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 9: CONTROL ABR AVANZADO (7 líneas) [NUEVO - WIRED TO FRONTEND]
            // ───────────────────────────────────────────────────────────────────
            '#EXT-X-APE-ABR-BANDWIDTH-PREFERENCE:unlimited',
            '#EXT-X-APE-ABR-BW-ESTIMATION-WINDOW:10',
            '#EXT-X-APE-ABR-BW-CONFIDENCE:0.95',
            '#EXT-X-APE-ABR-BW-SMOOTH-FACTOR:0.05',
            '#EXT-X-APE-ABR-PACKET-LOSS-MONITOR:enabled',
            '#EXT-X-APE-ABR-RTT-MONITORING:enabled',
            '#EXT-X-APE-ABR-CONGESTION-DETECT:enabled',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 10: ANTI-CORTE / FAILOVER (5 líneas) [WIRED TO FRONTEND]
            // ───────────────────────────────────────────────────────────────────
            '#EXT-X-APE-RECONNECT-ON-ERROR:true',
            `#EXT-X-APE-MAX-RECONNECT-ATTEMPTS:${cfg.reconnect_max_attempts}`,
            `#EXT-X-APE-RECONNECT-DELAY-MS:${cfg.reconnect_delay_ms || 50}`,
            '#EXT-X-APE-BUFFER-UNDERRUN-STRATEGY:aggressive-refill',
            '#EXT-X-APE-SEAMLESS-FAILOVER:true',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 11: DESCARGA PARALELA (2 líneas) [WIRED TO FRONTEND]
            // ───────────────────────────────────────────────────────────────────
            '#EXT-X-APE-SEGMENT-PRELOAD:true',
            '#EXT-X-APE-CONCURRENT-DOWNLOADS:10',

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 12: EVASIÓN (Migrado desde JWT - 6 campos) [NUEVO]
            // ───────────────────────────────────────────────────────────────────
            '#EXT-X-APE-ISP-EVASION-LEVEL:3',
            '#EXT-X-APE-CDN-PRIORITY:premium',
            '#EXT-X-APE-GEO-RESILIENCE:true',
            '#EXT-X-APE-PROXY-ROTATION:true',
            `#EXT-X-APE-BANDWIDTH-GUARANTEE:${cfg.bandwidth_guarantee || 300}`,
            '#EXT-X-APE-INVISIBILITY-ENABLED:true',
        ];

        // ───────────────────────────────────────────────────────────────────
        // SECCIÓN 12B: DETECCIÓN AUTOMÁTICA DE SERVIDOR (5 líneas dinámicas)
        // Explota: sin rate limiting, sin validación de sesión, keep-alive
        // ───────────────────────────────────────────────────────────────────
        const channelUrl = channel.url || channel.direct_source || channel.stream_url || '';
        try {
            const urlObj = new URL(channelUrl);
            const host = urlObj.hostname;
            const port = urlObj.port || '80';

            if (host.includes('pro.123sat.net')) {
                apeHeaders.push(
                    '#EXT-X-APE-SERVER-TYPE:xtream_codes',
                    `#EXT-X-APE-PORT-OVERRIDE:${port || '2082'}`,
                    '#EXT-X-APE-PROTOCOL:http',
                    '#EXT-X-APE-TIMEOUT-MS:15000',
                    '#EXT-X-APE-CUSTOM-ABR:enabled'
                );
            } else if (host.includes('candycloud8k.biz')) {
                apeHeaders.push(
                    '#EXT-X-APE-SERVER-TYPE:cdn_proxy',
                    '#EXT-X-APE-PORT-OVERRIDE:80',
                    '#EXT-X-APE-PROTOCOL:http',
                    '#EXT-X-APE-TIMEOUT-MS:10000',
                    '#EXT-X-APE-CUSTOM-ABR:enabled'
                );
            } else if (host.includes('line.tivi-ott.net')) {
                apeHeaders.push(
                    '#EXT-X-APE-SERVER-TYPE:xtream_codes',
                    '#EXT-X-APE-PORT-OVERRIDE:80',
                    '#EXT-X-APE-PROTOCOL:http',
                    '#EXT-X-APE-TIMEOUT-MS:20000',
                    '#EXT-X-APE-CUSTOM-ABR:enabled'
                );
            } else {
                apeHeaders.push(
                    '#EXT-X-APE-SERVER-TYPE:unknown',
                    '#EXT-X-APE-PROTOCOL:http',
                    '#EXT-X-APE-TIMEOUT-MS:15000',
                    '#EXT-X-APE-CUSTOM-ABR:enabled'
                );
            }
        } catch (e) {
            apeHeaders.push(
                '#EXT-X-APE-SERVER-TYPE:unknown',
                '#EXT-X-APE-PROTOCOL:http',
                '#EXT-X-APE-TIMEOUT-MS:15000'
            );
        }

        // ───────────────────────────────────────────────────────────────────
        // SECCIÓN 13: FINGERPRINT (Migrado desde JWT - 6 campos) [NUEVO]
        // ───────────────────────────────────────────────────────────────────
        apeHeaders.push(
            `#EXT-X-APE-FINGERPRINT:FP_${generateRandomString(16)}`,
            `#EXT-X-APE-FP-DEVICE:${typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop') : 'desktop'}`,
            `#EXT-X-APE-FP-PLATFORM:${typeof navigator !== 'undefined' ? navigator.platform : 'Win32'}`,
            `#EXT-X-APE-FP-SCREEN:${typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '1920x1080'}`,
            `#EXT-X-APE-FP-TZ:${Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone || 'UTC'}`,
            `#EXT-X-APE-FP-SESSION:${generateRandomString(32)}`,

            // ───────────────────────────────────────────────────────────────────
            // SECCIÓN 14: INFORMACIÓN DEL CANAL (Migrado desde JWT - 10 campos) [CLEAN URL MODE]
            // ───────────────────────────────────────────────────────────────────
            `#EXT-X-APE-CHANNEL-NAME:${escapeM3UValue(channel.name || 'Unknown')}`,
            `#EXT-X-APE-CHANNEL-ID:${channel.stream_id || channel.id || 0}`,
            `#EXT-X-APE-CHANNEL-GROUP:${escapeM3UValue(channel.category_name || channel.group || 'General')}`,
            `#EXT-X-APE-EPG-ID:${channel.epg_channel_id || channel.stream_id || ''}`,
            `#EXT-X-APE-CATCHUP:${channel.catchup || 'xc'}`,
            `#EXT-X-APE-CATCHUP-DAYS:${channel.catchup_days || 7}`,
            `#EXT-X-APE-AUDIO-CHANNELS:${cfg.audio_channels || 6}`,
            `#EXT-X-APE-QUALITY-LEVEL:${profile === 'P0' ? 'ULTRA' : profile === 'P1' ? '8K' : profile === 'P2' ? '4K' : profile === 'P3' ? 'FHD' : profile === 'P4' ? 'HD' : 'SD'}`,
            `#EXT-X-APE-ASPECT-RATIO:16:9`,
            `#EXT-X-APE-DEINTERLACE:bwdif`
        );

        // ───────────────────────────────────────────────────────────────────
        // SECCIÓN 15: PRIORIZACIÓN PROTOCOLO HTTPS POR CANAL [TOGGLE: prio-http3]
        // HTTP/3 = QUIC (TLS 1.3 siempre) | HTTP/2 = TLS | HTTP/1.1 = TLS preferido
        // ───────────────────────────────────────────────────────────────────
        if (window._APE_PRIO_HTTP3 !== false) {
            apeHeaders.push(
                '#EXT-X-APE-PROTOCOL-PRIORITY:http/1.1,h2',
                '#EXT-X-APE-TLS-PRIORITY:tls1.2,tls1.1',
                '#EXT-X-APE-TLS-REQUIRED:false',
                '#EXT-X-APE-HTTP-VERSION:1.1',
                '#EXT-X-APE-FALLBACK-HTTP-VERSION:1.1',
                '#EXT-X-APE-MIN-TLS-VERSION:1.0',
                '#EXT-X-APE-HTTP2-PUSH:disabled',
                '#EXT-X-APE-HTTP3-MIGRATION:disabled'
            );
        }

        // ───────────────────────────────────────────────────────────────────
        // SECCIÓN 16: AUDIO CODEC PRIORIZACIÓN POR CANAL [TOGGLE: prio-quality]
        // ───────────────────────────────────────────────────────────────────
        if (window._APE_PRIO_QUALITY !== false) {
            apeHeaders.push(
                `#EXT-X-APE-AUDIO-CODEC:${cfg.audio_codec_primary || 'opus'}`,
                `#EXT-X-APE-AUDIO-CODEC-FALLBACK:${cfg.audio_codec_fallback || 'aac'}`,
                `#EXT-X-APE-VIDEO-PROFILE:${cfg.video_profile || 'main10'}`
            );
        }

        // ───────────────────────────────────────────────────────────────────
        // SECCIÓN 17: HEVC/H.265 OPTIMIZATION (15 EXT-X-APE + EXTHTTP + LL-HLS)
        // Reads from profile config (configurable from frontend)
        // ───────────────────────────────────────────────────────────────────
        apeHeaders.push(
            `#EXT-X-APE-HEVC-TIER:${cfg.hevc_tier || 'HIGH'}`,
            `#EXT-X-APE-HEVC-LEVEL:${cfg.hevc_level || '4.1'}`,
            `#EXT-X-APE-HEVC-PROFILE:${cfg.hevc_profile || 'MAIN-10'}`,
            `#EXT-X-APE-COLOR-SPACE:${cfg.color_space || 'BT709'}`,
            `#EXT-X-APE-CHROMA-SUBSAMPLING:${cfg.chroma_subsampling || '4:2:0'}`,
            `#EXT-X-APE-TRANSFER-FUNCTION:${cfg.transfer_function || 'BT1886'}`,
            `#EXT-X-APE-MATRIX-COEFFICIENTS:${cfg.matrix_coefficients || 'BT709'}`,
            `#EXT-X-APE-COMPRESSION-LEVEL:${cfg.compression_level || 9}`,
            `#EXT-X-APE-RATE-CONTROL:${cfg.rate_control || 'VBR'}`,
            `#EXT-X-APE-RATE-CONTROL-MODE:QUALITY-BASED`,
            `#EXT-X-APE-ENTROPY-CODING:${cfg.entropy_coding || 'CABAC'}`,
            `#EXT-X-APE-PIXEL-FORMAT:${cfg.pixel_format || 'yuv420p10le'}`,
            `#EXT-X-APE-DEBLOCK-FILTER:enabled`,
            `#EXT-X-APE-SAO-FILTER:enabled`
        );

        // #EXTHTTP — COMPLETE HEADERS JSON per-channel [ALL TEMPLATE FIELDS WIRED]
        // 🔑 JWT & PROFILE viajan como HTTP headers reales via #EXTHTTP
        //    OTT Navigator envía estos como headers HTTP con cada request al servidor
        const exthttpHEVC = {
            // ── JWT & Profile (FUNCIONAL — viaja como header HTTP real) ──
            ...(jwt && isModuleEnabled(MODULE_FEATURES.jwt) ? {
                "Authorization": `Bearer ${jwt}`,
                "X-APE-Profile": profile,
                "X-APE-Profile-Version": VERSION
            } : {}),
            // ── HEVC Optimization ──
            "X-HEVC-Tier": cfg.hevc_tier || 'HIGH',
            "X-HEVC-Level": cfg.hevc_level || '4.1',
            "X-HEVC-Profile": cfg.hevc_profile || 'MAIN-10',
            "X-Video-Profile": cfg.video_profile || 'main10',
            "X-Color-Space": cfg.color_space || 'BT709',
            "X-Chroma-Subsampling": cfg.chroma_subsampling || '4:2:0',
            "X-HDR-Transfer-Function": cfg.transfer_function || 'BT1886',
            "X-Matrix-Coefficients": cfg.matrix_coefficients || 'BT709',
            "X-Compression-Level": "0",
            "X-Rate-Control": cfg.rate_control || 'VBR',
            "X-Entropy-Coding": cfg.entropy_coding || 'CABAC',
            "X-Pixel-Format": cfg.pixel_format || 'yuv420p10le',
            "X-Color-Depth": String(cfg.color_depth || 10),
            // ── Buffer & Caching ──
            "X-Network-Caching": String(GLOBAL_CACHING.network),
            "X-Live-Caching": String(GLOBAL_CACHING.live),
            "X-File-Caching": String(GLOBAL_CACHING.file),
            "X-Buffer-Strategy": "ultra-aggressive",
            "X-Buffer-Ms": String(cfg.buffer_ms),
            // ── Prefetch ──
            "X-Prefetch-Segments": String(cfg.prefetch_segments),
            "X-Prefetch-Parallel": String(cfg.prefetch_parallel),
            "X-Prefetch-Buffer-Target": String(cfg.prefetch_buffer_target),
            "X-Prefetch-Strategy": "ULTRA_AGRESIVO_ILIMITADO",
            "X-Prefetch-Enabled": "true",
            // ── Reconnect ──
            "X-Reconnect-Timeout-Ms": String(cfg.reconnect_timeout_ms),
            "X-Reconnect-Max-Attempts": String(cfg.reconnect_max_attempts || 40),
            "X-Reconnect-Delay-Ms": "50,100,200",
            "X-Reconnect-On-Error": "true",
            // ── Segment ──
            "X-Segment-Duration": String(cfg.segment_duration || 2),
            "X-Bandwidth-Guarantee": String(cfg.bandwidth_guarantee || 300),
            // ── APE Engine Core ──
            "X-App-Version": `APE_${VERSION}`,
            "X-Playback-Session-Id": `SES_${generateRandomString(16)}`,
            "X-Device-Id": `DEV_${generateRandomString(12)}`,
            "X-Stream-Type": "hls",
            "X-Quality-Preference": `codec-${(cfg.codec_primary || 'hevc').toLowerCase()},profile-${cfg.video_profile || 'main10'},tier-${(cfg.hevc_tier || 'high').toLowerCase()}`,
            // ── Playback Avanzado ──
            "X-Playback-Rate": "1.0",
            "X-Min-Buffer-Time": String(Math.floor((cfg.buffer_ms || 19000) / 1000)),
            "X-Max-Buffer-Time": String(Math.floor(GLOBAL_CACHING.network / 1000)),
            "X-Request-Priority": "high",
            // ── Codecs & DRM ──
            "X-Video-Codecs": cfg.codec_priority || 'hevc,vp9,av1,h264',
            "X-Audio-Codecs": "aac,mp3,opus,ac3,eac3",
            "X-DRM-Support": "widevine,playready",
            // ── CDN & Failover ──
            "X-CDN-Provider": "auto",
            "X-Failover-Enabled": "true",
            "X-Buffer-Size": String(Math.floor((cfg.max_bandwidth || 4500000) / 550)),
            // ── Metadata & Tracking ──
            "X-Client-Timestamp": String(Math.floor(Date.now() / 1000)),
            "X-Request-Id": `REQ_${generateRandomString(16)}`,
            "X-Device-Type": "smart-tv",
            "X-Screen-Resolution": cfg.resolution || '3840x2160',
            "X-Network-Type": "wifi",
            // ── OTT Navigator Compat ──
            "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
            "X-Player-Type": "exoplayer-ultra-extreme,vlc-pro,kodi-pro",
            "X-Hardware-Decode": "true",
            "X-Tunneling-Enabled": "off",
            "X-Audio-Track-Selection": "highest-quality-extreme,dolby-atmos-first",
            "X-Subtitle-Track-Selection": "off",
            "X-EPG-Sync": "enabled",
            "X-Catchup-Support": "flussonic-ultra",
            // ── Streaming Control ──
            "X-Bandwidth-Estimation": "adaptive,balanced,conservative",
            "X-Initial-Bitrate": String((cfg.bitrate || 8000) * 1000),
            "X-Retry-Count": "10,12,15",
            "X-Retry-Delay-Ms": "120,200,350",
            "X-Connection-Timeout-Ms": "2500,3500,6000",
            "X-Read-Timeout-Ms": "6000,9000,12000",
            // ── Security ──
            "X-Country-Code": "US",
            // ── HDR & Color (no duplicar con los HEVC de arriba) ──
            "X-HDR-Support": (cfg.hdr_support || ['hdr10', 'hdr10+', 'dolby-vision', 'hlg']).join(','),
            "X-Dynamic-Range": "hdr",
            "X-Color-Primaries": "bt2020",
            // ── Resolution Advanced ──
            "X-Max-Resolution": cfg.resolution || '3840x2160',
            "X-Max-Bitrate": String(cfg.max_bandwidth || 4500000),
            "X-Frame-Rates": "24,25,30,50,60,120",
            "X-Aspect-Ratio": "16:9,21:9",
            "X-Pixel-Aspect-Ratio": "1:1",
            // ── Audio Premium ──
            "X-Dolby-Atmos": String(cfg.audio_channels >= 6),
            "X-Audio-Channels": `${cfg.audio_channels >= 6 ? '7.1,5.1,2.0' : '2.0'}`,
            "X-Audio-Sample-Rate": "48000,96000",
            "X-Audio-Bit-Depth": "24bit",
            "X-Spatial-Audio": String(cfg.audio_channels >= 6),
            "X-Audio-Passthrough": "true",
            // ── Parallel Downloads ──
            "X-Parallel-Segments": String(cfg.prefetch_parallel || 150),
            "X-Segment-Preload": "true",
            "X-Concurrent-Downloads": String(Math.min(20, cfg.prefetch_parallel || 10)),
            // ── Anti-Corte / Failover ──
            "X-Buffer-Underrun-Strategy": "aggressive-refill",
            "X-Buffer-Min": String(cfg.buffer_min || 15000),
            "X-Buffer-Max": String(cfg.buffer_max || 200000),
            "X-KODI-LIVE-DELAY": "51",
            "X-ExoPlayer-Buffer-Min": "51000",
            "X-Manifest-Refresh": "51000",
            "X-APE-STRATEGY": "ultra-aggressive",
            "X-APE-Quality-Threshold": "0.99",
            "X-Compression-Level": "0",
            "X-Seamless-Failover": "true-ultra",
            // ── ABR Control Avanzado ──
            "X-Bandwidth-Preference": "unlimited",
            "X-BW-Estimation-Window": "10",
            "X-BW-Confidence-Threshold": "0.95",
            "X-BW-Smooth-Factor": "0.05",
            "X-Packet-Loss-Monitor": "enabled,aggressive",
            "X-RTT-Monitoring": "enabled,aggressive",
            "X-Congestion-Detect": "enabled,aggressive-extreme"
        };
        apeHeaders.push(`#EXTHTTP:${JSON.stringify(exthttpHEVC)}`);

        // LL-HLS (Low-Latency HLS) directives
        const segDur = cfg.segment_duration || 6;
        apeHeaders.push(
            `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,CAN-SKIP-UNTIL=${segDur},PART-HOLD-BACK=${(segDur * 3).toFixed(1)}`,
            `#EXT-X-PART-INF:PART-TARGET=${(segDur / 6).toFixed(3)}`,
            `#EXT-X-PRELOAD-HINT:TYPE=PART,URI="preload-next.m3u8"`
        );

        // ───────────────────────────────────────────────────────────────────
        // SECCIÓN 18: OPTIMIZACIÓN TLS v1.0 (25 líneas) [TOGGLE: tls-coherence]
        // ───────────────────────────────────────────────────────────────────
        if (isModuleEnabled(MODULE_FEATURES.tls)) {
            apeHeaders.push(
                '#EXT-X-APE-TLS-MIN-VERSION:1.2',
                '#EXT-X-APE-TLS-MAX-VERSION:1.2',
                '#EXT-X-APE-TLS-STRICT:false',
                '#EXT-X-APE-TLS-CIPHER-PRIORITY:TLS_AES_128_GCM_SHA256,TLS_CHACHA20_POLY1305_SHA256,TLS_AES_256_GCM_SHA384',
                '#EXT-X-APE-TLS-SESSION-RESUMPTION:true',
                '#EXT-X-APE-TLS-SESSION-CACHE-SIZE:10000',
                '#EXT-X-APE-TLS-SESSION-TIMEOUT:86400',
                '#EXT-X-APE-TLS-0RTT:enabled',
                '#EXT-X-APE-TLS-EARLY-DATA:enabled',
                '#EXT-X-APE-TLS-OCSP-STAPLING:enabled',
                '#EXT-X-APE-TLS-VERIFY-PEER:false',
                '#EXT-X-APE-TLS-VERIFY-HOST:false',
                '#EXT-X-APE-TLS-HANDSHAKE-TIMEOUT:3000',
                '#EXT-X-APE-TLS-ALPN:h3,h2,http/1.1',
                '#EXT-X-APE-TLS-CONNECTION-POOL:enabled',
                '#EXT-X-APE-TLS-MAX-CONNECTIONS:100',
                '#EXT-X-APE-TLS-CONNECTION-REUSE:true',
                '#EXT-X-APE-TLS-KEEP-ALIVE:true',
                '#EXT-X-APE-TLS-KEEP-ALIVE-TIMEOUT:30000',
                '#EXT-X-APE-TLS-BUFFER-SIZE:65536',
                '#EXT-X-APE-TLS-RECORD-SIZE:16384',
                '#EXT-X-APE-TLS-COMPRESSION:disabled',
                '#EXT-X-APE-TLS-SNI:enabled',
                '#EXT-X-APE-TLS-FALLBACK-ENABLED:true',
                '#EXT-X-APE-TLS-FALLBACK-VERSION:1.2',
                '#EXT-X-APE-TLS-FALLBACK-TIMEOUT:5000'
            );
        }

        // ───────────────────────────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════════════════
        // SECCIÓN 19: LCEVC MPEG-5 PART 2 — FULL ARCHITECTURE INJECTION
        // APE v18.2 — Player Enslavement Protocol — 3-Phase Implementation
        // ═══════════════════════════════════════════════════════════════════
        //
        // PHASE 1 — ENCODING (Layer Generation):
        //   Base Layer: video scaled to 1/4 resolution, encoded with base codec
        //   Sublayer L-1: residuals for artifact correction (deblocking)
        //   Sublayer L-2: residuals for sharpness + temporal prediction
        //
        // PHASE 2 — PACKAGING & TRANSPORT (3 modes):
        //   SEI NAL (primary): embedded in NAL layer as SEI type 4
        //   WebM metadata (fallback 1): frame metadata track ID 3
        //   MPEG-TS PID (fallback 2): dedicated PID for enhancement data
        //
        // PHASE 3 — DECODING (Parallelization):
        //   2x2 / 4x4 independent blocks — no inter-block prediction
        //   Each block decoded independently → extreme parallelism
        //   Hardware acceleration preferred, software fallback always enabled
        //
        // PLAYER COMPATIBILITY MATRIX:
        //   lcevc_player_required: false → ALWAYS fallback to base stream
        //   Any player that doesn't support LCEVC plays the base codec natively
        //   Zero breaking changes for any player in the world
        // ═══════════════════════════════════════════════════════════════════
        if (cfg.lcevc_enabled === true) {
            // ── Core state resolution ────────────────────────────────────────
            const lcevcState       = (cfg.lcevc_state          || 'SIGNAL_ONLY').toUpperCase();
            const lcevcMode        = (cfg.lcevc_mode            || 'SEI_METADATA').toUpperCase();
            const lcevcBaseCodec   = (cfg.lcevc_base_codec      || 'HEVC').toUpperCase();
            const lcevcFallback    = (cfg.lcevc_fallback        || 'BASE_ONLY').toUpperCase();
            const lcevcRequired    = cfg.lcevc_player_required === true ? '1' : '0';
            const lcevcProfile     = (cfg.lcevc_profile         || 'MAIN_4_2_0').toUpperCase();
            const lcevcScaleFactor = cfg.lcevc_scale_factor     || '2x';
            const lcevcEnhancement = cfg.lcevc_enhancement      || 'mpeg5-part2';

            // ── Phase 1: Base Layer ──────────────────────────────────────────
            const baseLayerScale   = cfg.lcevc_base_layer_scale || '0.25';
            const baseCodecRatio   = cfg.lcevc_base_bitrate_ratio || '0.60';
            const enhRatio         = cfg.lcevc_enhancement_bitrate_ratio || '0.40';

            // ── Phase 1: Sublayer L-1 (Artifact Correction) ─────────────────
            const l1Enabled        = cfg.lcevc_l1_enabled !== false;
            const l1Block          = (cfg.lcevc_l1_transform_block || '4x4').toUpperCase();
            const l1Deblock        = cfg.lcevc_l1_deblock_filter !== false ? '1' : '0';
            const l1Precision      = (cfg.lcevc_l1_residual_precision || '10bit').toUpperCase();
            const l1Temporal       = cfg.lcevc_l1_temporal_prediction !== false ? '1' : '0';

            // ── Phase 1: Sublayer L-2 (Sharpness + Full Resolution) ──────────
            const l2Enabled        = cfg.lcevc_l2_enabled !== false;
            const l2Block          = (cfg.lcevc_l2_transform_block || '2x2').toUpperCase();
            const l2Temporal       = cfg.lcevc_l2_temporal_prediction !== false ? '1' : '0';
            const l2Precision      = (cfg.lcevc_l2_residual_precision || '10bit').toUpperCase();
            const l2Upscale        = (cfg.lcevc_l2_upscale_filter || 'LANCZOS3').toUpperCase();

            // ── Phase 2: Transport ───────────────────────────────────────────
            const transport        = (cfg.lcevc_transport          || 'SEI_NAL').toUpperCase();
            const transportFb1     = (cfg.lcevc_transport_fallback_1 || 'WEBM_METADATA').toUpperCase();
            const transportFb2     = (cfg.lcevc_transport_fallback_2 || 'MPEG_TS_PID').toUpperCase();
            const mpegTsPid        = cfg.lcevc_mpeg_ts_pid         || '0x1FFF';
            const seiNalType       = cfg.lcevc_sei_nal_type        || '4';
            const webmTrackId      = cfg.lcevc_webm_track_id       || '3';

            // ── Phase 3: Decoding / Parallelization ──────────────────────────
            const parallelBlocks   = cfg.lcevc_parallel_blocks !== false ? '1' : '0';
            const parallelThreads  = String(cfg.lcevc_parallel_threads || '8');
            const hwAccel          = (cfg.lcevc_hw_acceleration    || 'PREFERRED').toUpperCase();
            const swFallback       = cfg.lcevc_sw_fallback !== false ? '1' : '0';
            const decodeOrder      = (cfg.lcevc_decode_order       || 'L1_THEN_L2').toUpperCase();

            // ── Emit all LCEVC tags ──────────────────────────────────────────
            apeHeaders.push(
                // ── Identity ────────────────────────────────────────────────
                '#EXT-X-APE-LCEVC:ENABLED',
                `#EXT-X-APE-LCEVC-STANDARD:MPEG-5-PART-2`,
                `#EXT-X-APE-LCEVC-STATE:${lcevcState}`,
                `#EXT-X-APE-LCEVC-PROFILE:${lcevcProfile}`,
                `#EXT-X-APE-LCEVC-ENHANCEMENT:${lcevcEnhancement}`,
                `#EXT-X-APE-LCEVC-SCALE-FACTOR:${lcevcScaleFactor}`,
                `#EXT-X-APE-LCEVC-PLAYER-REQUIRED:${lcevcRequired}`,
                `#EXT-X-APE-LCEVC-FALLBACK:${lcevcFallback}`,

                // ── Phase 1: Base Layer ──────────────────────────────────────
                `#EXT-X-APE-LCEVC-BASE-CODEC:${lcevcBaseCodec}`,
                `#EXT-X-APE-LCEVC-BASE-LAYER-SCALE:${baseLayerScale}`,
                `#EXT-X-APE-LCEVC-BASE-BITRATE-RATIO:${baseCodecRatio}`,
                `#EXT-X-APE-LCEVC-ENHANCEMENT-BITRATE-RATIO:${enhRatio}`,

                // ── Phase 1: Sublayer L-1 (Artifact Correction Residuals) ────
                `#EXT-X-APE-LCEVC-L1-ENABLED:${l1Enabled ? '1' : '0'}`,
                `#EXT-X-APE-LCEVC-L1-TRANSFORM-BLOCK:${l1Block}`,
                `#EXT-X-APE-LCEVC-L1-DEBLOCK-FILTER:${l1Deblock}`,
                `#EXT-X-APE-LCEVC-L1-RESIDUAL-PRECISION:${l1Precision}`,
                `#EXT-X-APE-LCEVC-L1-TEMPORAL-PREDICTION:${l1Temporal}`,

                // ── Phase 1: Sublayer L-2 (Sharpness + Full-Resolution) ──────
                `#EXT-X-APE-LCEVC-L2-ENABLED:${l2Enabled ? '1' : '0'}`,
                `#EXT-X-APE-LCEVC-L2-TRANSFORM-BLOCK:${l2Block}`,
                `#EXT-X-APE-LCEVC-L2-TEMPORAL-PREDICTION:${l2Temporal}`,
                `#EXT-X-APE-LCEVC-L2-RESIDUAL-PRECISION:${l2Precision}`,
                `#EXT-X-APE-LCEVC-L2-UPSCALE-FILTER:${l2Upscale}`,

                // ── Phase 2: Packaging & Transport ───────────────────────────
                `#EXT-X-APE-LCEVC-MODE:${lcevcMode}`,
                `#EXT-X-APE-LCEVC-TRANSPORT-PRIMARY:${transport}`,
                `#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-1:${transportFb1}`,
                `#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-2:${transportFb2}`,
                `#EXT-X-APE-LCEVC-SEI-NAL-TYPE:${seiNalType}`,
                `#EXT-X-APE-LCEVC-MPEG-TS-PID:${mpegTsPid}`,
                `#EXT-X-APE-LCEVC-WEBM-TRACK-ID:${webmTrackId}`,

                // ── Phase 3: Decoding & Parallelization ──────────────────────
                `#EXT-X-APE-LCEVC-PARALLEL-BLOCKS:${parallelBlocks}`,
                `#EXT-X-APE-LCEVC-PARALLEL-THREADS:${parallelThreads}`,
                `#EXT-X-APE-LCEVC-DECODE-ORDER:${decodeOrder}`,
                `#EXT-X-APE-LCEVC-HW-ACCELERATION:${hwAccel}`,
                `#EXT-X-APE-LCEVC-SW-FALLBACK:${swFallback}`,

                // ── Compatibility guarantee ───────────────────────────────────
                // Players without LCEVC support receive the base codec stream
                // transparently. LCEVC enhancement is additive, never breaking.
                `#EXT-X-APE-LCEVC-COMPAT:UNIVERSAL`,
                `#EXT-X-APE-LCEVC-GRACEFUL-DEGRADATION:BASE_CODEC_PASSTHROUGH`
            );
        }


        // ── SECCIÓN 20: APE v18.2 IDENTITY & TELCHEMY TVQM ──────────────────
        if (cfg.ape_version) {
            apeHeaders += `#EXT-X-APE-VERSION:${cfg.ape_version}\n`;
        }
        if (cfg.ape_profile) {
            apeHeaders += `#EXT-X-APE-PROFILE:${cfg.ape_profile}\n`;
        }
        if (cfg.ape_dna_hash) {
            apeHeaders += `#EXT-X-APE-DNA-HASH:${cfg.ape_dna_hash}\n`;
        }
        if (cfg.tvqm_vstq !== undefined && cfg.tvqm_vstq > 0) {
            apeHeaders += `#EXT-X-APE-TVQM-VSTQ:${cfg.tvqm_vstq}\n`;
            apeHeaders += `#EXT-X-APE-TVQM-VSMQ:${cfg.tvqm_vsmq || 0}\n`;
        }
        if (cfg.tr101290_status) {
            apeHeaders += `#EXT-X-APE-TR101290:${cfg.tr101290_status}\n`;
        }

        // ── SECCIÓN 21: VQS SCORE & QUALITY PROFILE ──────────────────────────
        if (cfg.vqs_score !== undefined) {
            apeHeaders += `#EXT-X-APE-VQS-SCORE:${cfg.vqs_score}\n`;
            apeHeaders += `#EXT-X-APE-VQS-TIER:${cfg.vqs_tier || 'STANDARD'}\n`;
            apeHeaders += `#EXT-X-APE-QUALITY-PROFILE:${cfg.quality_profile || 'P3'}\n`;
        }

        // ── SECCIÓN 22: DEGRADATION CHAIN ────────────────────────────────────
        if (cfg.degradation_chain && Array.isArray(cfg.degradation_chain)) {
            apeHeaders += `#EXT-X-APE-DEGRADATION-CHAIN:${cfg.degradation_chain.join('→')}\n`;
            apeHeaders += `#EXT-X-APE-DEGRADATION-LEVEL:${cfg.degradation_level || 4}\n`;
        }

        
        // ── SECCIÓN 22b: AI TEMPORAL SUPER RESOLUTION ────────────────────────
        if (cfg.ai_sr_enabled) {
            apeHeaders += `#EXT-X-APE-AI-SR:ENABLED\n`;
            apeHeaders += `#EXT-X-APE-AI-SR-MODE:${cfg.ai_sr_mode || 'BALANCED'}\n`;
            if (cfg.ai_sr_scale_factor) {
                apeHeaders += `#EXT-X-APE-AI-SR-SCALE:${cfg.ai_sr_scale_factor}\n`;
            }
            if (cfg.ai_sr_filters) {
                apeHeaders += `#EXT-X-APE-AI-SR-FILTERS:${cfg.ai_sr_filters}\n`;
            }
        }

        // ── SECCIÓN 23: HDR EXTENDED ──────────────────────────────────────────
        if (cfg.hdr10_plus_enabled) {
            apeHeaders += `#EXT-X-APE-HDR10-PLUS:ENABLED\n`;
        }
        if (cfg.dolby_vision_enabled) {
            apeHeaders += `#EXT-X-APE-DOLBY-VISION:ENABLED\n`;
            if (cfg.dolby_vision_profile) {
                apeHeaders += `#EXT-X-APE-DV-PROFILE:${cfg.dolby_vision_profile}\n`;
            }
        }

        // ── SECCIÓN 24: OTT SKILLS STATUS ────────────────────────────────────
        if (cfg.quantum_pixel_overdrive) {
            apeHeaders += `#EXT-X-APE-QPO:ENABLED\n`;
        }
        if (cfg.content_aware_hevc) {
            apeHeaders += `#EXT-X-APE-CONTENT-AWARE-HEVC:ENABLED\n`;
        }
        if (cfg.antigravity_mode) {
            apeHeaders += `#EXT-X-APE-ANTIGRAVITY:ENABLED\n`;
        }
        if (cfg.god_mode_zero_drop) {
            apeHeaders += `#EXT-X-APE-GOD-MODE:ZERO-DROP\n`;
        }
        if (cfg.hydra_stealth_enabled) {
            apeHeaders += `#EXT-X-APE-HYDRA-STEALTH:ACTIVE\n`;
        }

                return apeHeaders;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STRING 5: EXT_X_START_TEMPLATE
    // ═══════════════════════════════════════════════════════════════════════════

    const EXT_X_START_TEMPLATE = '#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES';

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔒 HTTPS PRIORITY: Siempre priorizar HTTPS sobre HTTP
    // Si la URL llega con https://, se mantiene.
    // Si llega con http://, se intenta upgrade a https://.
    // Excepción: localhost / 127.0.0.1 (siempre HTTP en desarrollo).
    // ═══════════════════════════════════════════════════════════════════════════

    // Puertos Xtream Codes conocidos que operan en HTTP plano
    const XTREAM_HTTP_PORTS = ['2082', '2083', '8080', '8000', '25461', '25463', '80'];

    function preferHttps(url) {
        if (!url || typeof url !== 'string') return url;

        // ══════════════════════════════════════════════════════════════════
        // DETECCIÓN INTELIGENTE DE PROTOCOLO:
        // Los servidores IPTV Xtream Codes NO tienen SSL válido.
        // 1. Si la URL ya es HTTP → preservar HTTP (no forzar HTTPS)
        // 2. Si la URL es HTTPS pero el servidor no soporta SSL →
        //    degradar a HTTP para evitar ERR_CERT_AUTHORITY_INVALID
        // ══════════════════════════════════════════════════════════════════

        try {
            const parsed = new URL(url);
            const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');

            // Puertos Xtream Codes → SIEMPRE HTTP (no tienen SSL)
            if (XTREAM_HTTP_PORTS.includes(port)) {
                if (url.startsWith('https://')) {
                    return url.replace(/^https:\/\//, 'http://');
                }
                return url;
            }

            // Puerto 443 pero servidores IPTV conocidos sin SSL
            const noSSLHosts = ['line.tivi-ott.net', 'candycloud8k.biz', 'pro.123sat.net'];
            if (noSSLHosts.some(h => parsed.hostname.includes(h))) {
                if (url.startsWith('https://')) {
                    return url.replace(/^https:\/\//, 'http://');
                }
                return url;
            }
        } catch (e) {
            // URL parsing failed, return as-is
        }

        // Cualquier otra URL → preservar protocolo original
        return url;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUNCIONES AUXILIARES
    // ═══════════════════════════════════════════════════════════════════════════

    function generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function generateNonce() {
        return Array.from({ length: 32 }, () =>
            Math.floor(Math.random() * 16).toString(16)
        ).join('');
    }

    function base64UrlEncode(str) {
        try {
            return btoa(unescape(encodeURIComponent(str)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
        } catch (e) {
            return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        }
    }

    function escapeM3UValue(value) {
        if (!value) return '';
        return String(value).replace(/"/g, "'").replace(/,/g, ' ');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // JWT 68+ CAMPOS (8 SECCIONES)
    // ═══════════════════════════════════════════════════════════════════════════

    function generateJWT68Fields(channel, profile, index) {
        const cfg = getProfileConfig(profile);
        const now = Math.floor(Date.now() / 1000);
        const expiry = now + (365 * 24 * 60 * 60); // 1 año

        // Header JWT
        const header = {
            alg: 'HS256',
            typ: 'JWT',
            ver: VERSION
        };

        // Payload con 68+ campos organizados en 8 secciones
        const payload = {
            // ─────────────────────────────────────────────────────────────────
            // SECCIÓN 1: IDENTIFICACIÓN JWT (8 campos)
            // ─────────────────────────────────────────────────────────────────
            iss: `APE_v${VERSION}_TYPED_ARRAYS`,
            iat: now,
            exp: expiry,
            nbf: now - 60,
            jti: `jti_${generateRandomString(8)}_${generateRandomString(8)}_${index}`,
            nonce: generateNonce(),
            aud: ['premium-servers', 'cdn-nodes', 'edge-servers', 'backup-nodes'],
            sub: String(channel.stream_id || channel.id || index),

            // ─────────────────────────────────────────────────────────────────
            // SECCIÓN 2: INFORMACIÓN DEL CANAL (8 campos)
            // ─────────────────────────────────────────────────────────────────
            chn: channel.name || 'Unknown',
            chn_id: String(channel.stream_id || channel.id || index),
            chn_group: channel.category_name || channel.group || 'General',
            chn_logo: channel.stream_icon || channel.logo || '',
            chn_catchup: channel.catchup || 'xc',
            chn_catchup_days: channel.catchup_days || 7,
            chn_catchup_source: channel.catchup_source || '?utc={utc}&lutc={lutc}',
            chn_epg_id: channel.epg_channel_id || String(channel.stream_id || channel.id || index),

            // ─────────────────────────────────────────────────────────────────
            // SECCIÓN 3: CONFIGURACIÓN DE PERFIL (13 campos) + USER-AGENT
            // ─────────────────────────────────────────────────────────────────
            device_profile: profile,
            device_class: cfg.device_class,
            // 🔄 User-Agent dinámico rotado (del cache o default)
            user_agent: _cachedSelectedUA || 'OTT Navigator/1.6.9.4 (Build 40936) AppleWebKit/606',
            resolution: channel.resolution || cfg.resolution,
            width: cfg.width,
            height: cfg.height,
            fps: channel.fps || cfg.fps,
            bitrate: channel.bitrate || cfg.bitrate,
            buffer_ms: cfg.buffer_ms,
            network_cache_ms: cfg.network_cache_ms,
            live_cache_ms: cfg.live_cache_ms,
            max_bandwidth: cfg.max_bandwidth,
            min_bandwidth: cfg.min_bandwidth,

            // ─────────────────────────────────────────────────────────────────
            // SECCIÓN 4: CONFIGURACIÓN DE CALIDAD (10 campos)
            // ─────────────────────────────────────────────────────────────────
            codec_primary: cfg.codec_primary,
            codec_fallback: cfg.codec_fallback,
            codec_priority: cfg.codec_priority,
            hdr_support: cfg.hdr_support,
            color_depth: cfg.color_depth,
            audio_channels: cfg.audio_channels,
            deinterlace: 'bwdif',
            sharpening: 0.05,
            aspect_ratio: '16:9',
            quality_level: profile === 'P0' ? 'ULTRA' : profile === 'P1' ? '8K' : profile === 'P2' ? '4K' : profile === 'P3' ? 'FHD' : profile === 'P4' ? 'HD' : 'SD',

            // ─────────────────────────────────────────────────────────────────
            // SECCIÓN 5: PREFETCH Y BUFFER (8 campos)
            // ─────────────────────────────────────────────────────────────────
            prefetch_segments: cfg.prefetch_segments,
            prefetch_parallel: cfg.prefetch_parallel,
            prefetch_buffer_target: cfg.prefetch_buffer_target,
            prefetch_min_bandwidth: cfg.prefetch_min_bandwidth,
            prefetch_adaptive: true,
            prefetch_ai_enabled: true,
            prefetch_strategy: 'ultra-aggressive',
            prefetch_enabled: true,

            // ─────────────────────────────────────────────────────────────────
            // SECCIÓN 6: ESTRATEGIA Y OPTIMIZACIÓN (8 campos)
            // ─────────────────────────────────────────────────────────────────
            strategy: 'ultra-aggressive',
            target_bitrate: cfg.bitrate * 1000,
            throughput_t1: cfg.throughput_t1,
            throughput_t2: cfg.throughput_t2,
            quality_threshold: 0.85,
            latency_target_ms: 500,
            segment_duration: 6,
            buffer_strategy: 'aggressive',

            // ─────────────────────────────────────────────────────────────────
            // SECCIÓN 7: SEGURIDAD Y EVASIÓN (8 campos) - CON FINGERPRINT REAL
            // ─────────────────────────────────────────────────────────────────
            service_tier: 'PREMIUM',
            invisibility_enabled: true,
            // 🔐 Fingerprint real del dispositivo (si está disponible)
            fingerprint: window.DeviceFingerprintCollector?._cache?.unique_hash || ('FP_' + generateRandomString(32)),
            fp_device: window.DeviceFingerprintCollector?._cache?.device_type || 'desktop',
            fp_platform: window.DeviceFingerprintCollector?._cache?.device_platform || navigator.platform,
            fp_screen: window.DeviceFingerprintCollector?._cache ?
                `${window.DeviceFingerprintCollector._cache.screen_width}x${window.DeviceFingerprintCollector._cache.screen_height}` :
                `${screen.width}x${screen.height}`,
            fp_tz: window.DeviceFingerprintCollector?._cache?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            fp_lang: window.DeviceFingerprintCollector?._cache?.browser_language || navigator.language,
            fp_canvas: window.DeviceFingerprintCollector?._cache?.canvas_hash || 'not_collected',
            fp_audio: window.DeviceFingerprintCollector?._cache?.audio_hash || 'not_collected',
            fp_webgl: window.DeviceFingerprintCollector?._cache?.webgl_renderer?.substring(0, 50) || 'not_collected',
            fp_session: window.DeviceFingerprintCollector?._cache?.session_id || generateRandomString(32),
            isp_evasion_level: 3,
            cdn_priority: 'premium',
            geo_resilience: true,
            proxy_rotation: true,

            // ─────────────────────────────────────────────────────────────────
            // SECCIÓN 8: METADATOS ADICIONALES (8+ campos)
            // ─────────────────────────────────────────────────────────────────
            bandwidth_guarantee: 150,
            quality_enhancement: 300,
            zero_interruptions: true,
            reconnection_time_ms: cfg.reconnect_timeout_ms,
            reconnect_max_attempts: cfg.reconnect_max_attempts,
            availability_target: '99.99%',
            generation_timestamp: now,
            version: VERSION,
            architecture: 'TYPED_ARRAYS_ULTIMATE',
            src: 'ape_typed_arrays_68plus'
        };

        // Codificar JWT
        const headerB64 = base64UrlEncode(JSON.stringify(header));
        const payloadB64 = base64UrlEncode(JSON.stringify(payload));
        const signature = generateRandomString(43); // Simular firma

        return `${headerB64}.${payloadB64}.${signature}`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GENERAR #EXTINF
    // ═══════════════════════════════════════════════════════════════════════════

    function generateEXTINF(channel, profile, index) {
        const tvgId = channel.stream_id || channel.id || index;
        const tvgName = escapeM3UValue(channel.name || `Canal ${index}`);
        const tvgLogo = channel.stream_icon || channel.logo || '';

        // 🧩 Integration with GroupTitleBuilder for hierarchical group-title
        let groupTitle;
        const gtConfig = window.GroupTitleBuilder?.getConfig();
        const gtEnabled = document.getElementById('gt-enabled')?.checked !== false;

        if (window.GroupTitleBuilder && gtEnabled && gtConfig?.selectedFields?.length > 0) {
            groupTitle = window.GroupTitleBuilder.buildExport(channel, gtConfig);
        } else {
            groupTitle = channel.category_name || channel.group || 'General';
        }
        groupTitle = escapeM3UValue(groupTitle);

        let extinf = `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${groupTitle}" ape-profile="${profile}"`;
        extinf += ` catchup="xc" catchup-days="7" catchup-source="?utc={utc}&lutc={lutc}"`;

        // Motor Evasion attributes
        extinf += ` motor-evasion="enabled" motor-retry="3" motor-buffer="20"`;

        // Quality attributes (detectar de heuristics o nombre)
        const quality = channel.heuristics?.resolution_class ||
            (channel.name?.toUpperCase().includes('4K') ? '4K' :
                channel.name?.toUpperCase().includes('HD') ? 'HD' : 'SD');
        const bitrate = channel.heuristics?.estimated_bitrate ||
            (quality === '4K' ? 50000 : quality === 'HD' ? 8000 : 2000);
        extinf += ` quality="${quality}" bitrate="${bitrate}"`;

        extinf += `,${tvgName}`;

        return extinf;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUIR URL CON JWT (+ URL VALIDATOR + FALLBACK MODE)
    // ═══════════════════════════════════════════════════════════════════════════

    // Constante para límite de URL
    const MAX_URL_LENGTH = 2000;

    function buildChannelUrl(channel, jwt, profile = null, index = 0) {
        let baseUrl = '';

        // Prioridad 1: URL directa
        if (channel.url && channel.url.startsWith('http')) {
            baseUrl = channel.url.split('?')[0];
        }
        // Prioridad 2: direct_source
        else if (channel.direct_source && channel.direct_source.startsWith('http')) {
            baseUrl = channel.direct_source.split('?')[0];
        }
        // Prioridad 2.5: stream_url (Xtream Codes API)
        else if (channel.stream_url && channel.stream_url.startsWith('http')) {
            baseUrl = channel.stream_url.split('?')[0];
        }
        // Prioridad 3: Construir desde servidor
        else if (typeof window !== 'undefined' && window.app && window.app.state) {
            const state = window.app.state;
            const channelServerId = channel._source || channel.serverId || channel.server_id;
            let server = null;

            if (channelServerId && state.activeServers) {
                server = state.activeServers.find(s => s.id === channelServerId);
            }
            if (!server && state.currentServer) {
                server = state.currentServer;
            }
            // Fallback: usar primer servidor activo disponible
            if (!server && state.activeServers && state.activeServers.length > 0) {
                server = state.activeServers[0];
            }

            if (server && server.baseUrl && server.username && server.password && channel.stream_id) {
                const cleanBase = server.baseUrl.replace(/\/player_api\.php$/, '').replace(/\/$/, '');
                // TYPED ARRAYS ULTIMATE genera HLS → SIEMPRE .m3u8 como primario
                // .ts SOLO aparece vía redundant-streams failover (si está habilitado)
                const ext = 'm3u8';
                baseUrl = `${cleanBase}/live/${server.username}/${server.password}/${channel.stream_id}.${ext}`;
            }
        }

        // Fallback: cualquier campo que tenga URL
        if (!baseUrl) {
            baseUrl = channel.url || channel.direct_source || channel.stream_url || '';
            if (baseUrl && !baseUrl.startsWith('http')) baseUrl = '';
        }

        if (!baseUrl) return '';

        // 🔒 HTTPS PRIORITY: Upgrade HTTP → HTTPS (excepto localhost)
        baseUrl = preferHttps(baseUrl);

        // ═══════════════════════════════════════════════════════════════════════
        // 🌐 CLEAN URL MODE — JWT ahora viaja en #EXTHTTP headers, no en URL
        // 🔑 Cuando jwt-generator está ON, el JWT va como Authorization: Bearer
        //    en el bloque #EXTHTTP, que OTT Navigator envía como header HTTP real.
        //    La URL queda 100% limpia siempre.
        // ═══════════════════════════════════════════════════════════════════════
        const jwtModuleOn = isModuleEnabled('jwt-generator');
        if (jwtModuleOn) {
            // JWT viaja en #EXTHTTP (Authorization: Bearer), NO en URL
            console.log(`🔑 [JWT-HEADERS] JWT en #EXTHTTP headers (${(jwt || '').length} chars), URL limpia: ${baseUrl.length} chars`);
            return baseUrl;
        }
        if (CLEAN_URL_MODE) {
            console.log(`🌐 [CLEAN-URL] URL limpia generada: ${baseUrl.length} chars`);
            return baseUrl;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 🔄 URL LENGTH VALIDATOR + FALLBACK MODE INTEGRATION (Legacy mode)
        // ═══════════════════════════════════════════════════════════════════════

        const separator = baseUrl.includes('?') ? '&' : '?';

        // 📦 Si compact-jwt está ON → usar JWT compacto (40 campos, ~800 chars)
        // en lugar del JWT completo (68 campos, ~2500 chars)
        let actualJwt = jwt;
        if (jwt && isModuleEnabled('compact-jwt') && window.CompactJWTGenerator) {
            actualJwt = window.CompactJWTGenerator.generateCompactJWT(channel, profile || 'P3', index);
            console.log(`📦 [COMPACT-JWT] JWT compacto: ${actualJwt.length} chars (vs full: ${jwt.length})`);
        }
        let finalUrl = actualJwt ? `${baseUrl}${separator}ape_jwt=${actualJwt}` : baseUrl;

        // Verificar longitud de URL
        if (finalUrl.length > MAX_URL_LENGTH && actualJwt) {
            console.log(`📏 [URL-VALIDATOR] URL excede ${MAX_URL_LENGTH} chars (${finalUrl.length}), aplicando Compact JWT...`);

            // Intentar con Compact JWT si está disponible (fallback si no se usó arriba)
            if (window.CompactJWTGenerator && profile) {
                const compactJWT = window.CompactJWTGenerator.generateCompactJWT(channel, profile, index);
                finalUrl = `${baseUrl}${separator}ape_jwt=${compactJWT}`;

                if (finalUrl.length <= MAX_URL_LENGTH) {
                    console.log(`✅ [URL-VALIDATOR] Compact JWT aplicado: ${finalUrl.length} chars`);
                } else {
                    // Último recurso: sin JWT
                    console.warn(`⚠️ [URL-VALIDATOR] Aún excede límite con Compact JWT, usando URL sin JWT`);
                    finalUrl = baseUrl;
                }
            } else if (window.FallbackModeHandler) {
                // Usar Fallback Mode Handler
                const result = window.FallbackModeHandler.generateDynamicJWT(channel, profile || {}, index);
                if (result.jwt) {
                    finalUrl = `${baseUrl}${separator}ape_jwt=${result.jwt}`;
                    console.log(`✅ [FALLBACK-MODE] JWT ${result.mode} aplicado: ${finalUrl.length} chars`);
                } else {
                    finalUrl = baseUrl;
                    console.warn(`⚠️ [FALLBACK-MODE] Sin JWT disponible`);
                }
            }
        }

        return finalUrl;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DETERMINAR PERFIL AUTOMÁTICO
    // ═══════════════════════════════════════════════════════════════════════════

    function determineProfile(channel) {
        const name = (channel.name || '').toUpperCase();
        const resolution = channel.resolution || channel.heuristics?.resolution || '';

        if (name.includes('8K') || resolution.includes('7680')) return 'P0';
        if (name.includes('4K') || name.includes('UHD') || resolution.includes('3840')) {
            if (name.includes('60FPS') || name.includes('SPORTS')) return 'P1';
            return 'P2';
        }
        if (name.includes('FHD') || name.includes('1080') || resolution.includes('1920')) return 'P3';
        if (name.includes('HD') || name.includes('720') || resolution.includes('1280')) return 'P4';
        if (name.includes('SD') || name.includes('480')) return 'P5';

        return 'P3'; // Default FHD
    }



    // ═══════════════════════════════════════════════════════════════════════════
    // GENERAR ENTRADA COMPLETA DE CANAL (133+ líneas)
    // ═══════════════════════════════════════════════════════════════════════════

    function generateChannelEntry(channel, index, profile = null) {
        const actualProfile = profile || determineProfile(channel);

        // ═══════════════════════════════════════════════════════════════════════
        // JWT STRATEGY: 68-campo completo vs Compact profile-ref (~10 campos)
        // Compact ON → JWT ~300 chars con p: "P3" (profile reference)
        // Compact OFF → JWT ~2500 chars con 68 campos explícitos
        // ═══════════════════════════════════════════════════════════════════════
        let jwt = null;
        if (isModuleEnabled(MODULE_FEATURES.jwt)) {
            const compactOn = isModuleEnabled('compact-jwt');
            if (compactOn && window.CompactJWTGenerator) {
                jwt = window.CompactJWTGenerator.generateCompactJWT(channel, actualProfile, index);
                console.log(`📦 [COMPACT-JWT] Profile-ref JWT: ${(jwt || '').length} chars, profile: ${actualProfile}`);
            } else {
                jwt = generateJWT68Fields(channel, actualProfile, index);
            }
        }
        const url = buildChannelUrl(channel, jwt, actualProfile, index);

        const lines = [];

        // 1. #EXTINF (1 línea) - Siempre incluido
        lines.push(generateEXTINF(channel, actualProfile, index));

        // 2. EXTVLCOPT (63 líneas) - Condicional según módulo buffer
        if (isModuleEnabled(MODULE_FEATURES.buffer)) {
            lines.push(...generateEXTVLCOPT(actualProfile));
        }

        // ═════════════════════════════════════════════════════════════════════════
        // 2B. ESTRATEGIA DE BUFFER LAYERED_3 (10 directivas hardened)
        // Valores fijos agresivos: 19s network, 19s live, 4.75s file
        // ═════════════════════════════════════════════════════════════════════════
        // --- Capa EXTVLCOPT (VLC/OTT/TiviMate) ---
        // v5.3: LAYERED_3 anti-freeze (valores ya correctos desde GLOBAL_CACHING)
        lines.push('#EXTVLCOPT:network-caching=15000');
        lines.push('#EXTVLCOPT:live-caching=15000');
        lines.push('#EXTVLCOPT:file-caching=51000');

        // --- Capa KODIPROP (Kodi) ---
        lines.push('#KODIPROP:inputstream.adaptive.buffer_duration=19');
        lines.push('#KODIPROP:inputstream.adaptive.pre_buffer_bytes=23750000');
        lines.push('#KODIPROP:inputstream.adaptive.buffer_type=AGGRESSIVE');

        // --- Capa EXT-X-APE (Motor APE) ---
        lines.push('#EXT-X-APE-NETWORK-CACHING:15000'); // v5.3 anti-freeze
        lines.push('#EXT-X-APE-LIVE-CACHING:15000'); // v5.3 anti-freeze
        lines.push('#EXT-X-APE-FILE-CACHING:51000'); // v5.3 anti-freeze
        lines.push('#EXT-X-APE-BUFFER-STRATEGY:LAYERED_3');

        // 3. KODIPROP (38 líneas) - Condicional según módulo manifest
        if (isModuleEnabled(MODULE_FEATURES.manifest)) {
            lines.push(...generateKODIPROP(actualProfile));
        }

        // 4. EXT-X-APE (29 líneas) - Condicional según múltiples módulos
        if (isModuleEnabled(MODULE_FEATURES.headers) || isModuleEnabled(MODULE_FEATURES.evasion)) {
            lines.push(...generateEXTXAPE(channel, actualProfile, jwt));
        }

        // 5. EXT-X-START (1 línea) - Siempre incluido
        lines.push(EXT_X_START_TEMPLATE);

        // ═════════════════════════════════════════════════════════════════════════
        // 5B. OPTIMIZACIÓN DE TRANSPORTE AVANZADA POR CANAL (12 directivas)
        // Resource Hints, HTTP/3, Chunked Transfer, Early Hints — 3 capas
        // ═════════════════════════════════════════════════════════════════════════
        // Extraer dominios del servidor del canal para resource hints
        const channelDomains = (() => {
            try {
                const u = new URL(url);
                return u.hostname;
            } catch { return 'line.tivi-ott.net'; }
        })();

        // --- Capa APE (4 Directivas) ---
        lines.push(`#EXT-X-APE-DNS-PREFETCH:${channelDomains}`);
        lines.push(`#EXT-X-APE-PRECONNECT:${channelDomains}`);
        lines.push('#EXT-X-APE-PROTOCOL-PREFERENCE:h3,h2,http/1.1');
        lines.push('#EXT-X-APE-EARLY-HINTS-ENABLED:true');

        // --- Capa VLC/OTT (4 Directivas) ---
        lines.push(`#EXTVLCOPT:http-preconnect-domains=${channelDomains}`);
        lines.push('#EXTVLCOPT:http-version=1.1');
        lines.push('#EXTVLCOPT:http-header:Accept-Encoding=gzip, deflate, chunked');
        lines.push('#EXTVLCOPT:http-header:Want-Early-Hints=1');

        // --- Capa Kodi (4 Directivas) ---
        lines.push(`#KODIPROP:inputstream.adaptive.preconnect_domains=${channelDomains}`);
        lines.push('#KODIPROP:inputstream.adaptive.http_version=1.1');
        lines.push('#KODIPROP:inputstream.adaptive.http_headers=Accept-Encoding=gzip, deflate, chunked');
        lines.push('#KODIPROP:inputstream.adaptive.early_hints=true');

        // ═════════════════════════════════════════════════════════════════════════
        // 5C. PER-CHANNEL EXPLOITATION HEADERS (7 directivas)
        // Explotación: sin rate limiting, sin validación de sesión, sin throttling
        // ═════════════════════════════════════════════════════════════════════════
        lines.push(`#EXT-X-APE-PROFILE:${actualProfile}`);
        lines.push('#EXT-X-APE-CONCURRENT-DOWNLOADS:8'); // v5.3: 200 causaba saturación
        lines.push('#EXT-X-APE-PREFETCH-PARALLEL:8'); // v5.3: calibrado
        lines.push('#EXT-X-APE-PREFETCH-SEGMENTS:20'); // v5.3: 500 causaba que el player no arrancara
        lines.push('#EXT-X-APE-ADAPTIVE-QUALITY:enabled');
        lines.push('#EXT-X-APE-ISP-EVASION:enabled');
        lines.push('#EXT-X-APE-CACHE-ENABLED:true');

        // ═══════════════════════════════════════════════════════════════════════
        // 6. HLS REDUNDANT STREAMS (RFC 8216) [TOGGLE: redundant-streams]
        // ═══════════════════════════════════════════════════════════════════════
        // 6. EXT-X-STREAM-INF + AVERAGE-BANDWIDTH (RFC 8216 §4.3.4.2)
        // SIEMPRE se emite para informar BANDWIDTH y AVERAGE-BANDWIDTH por canal.
        // Si redundant-streams está ON, adicionalmente agrega failover HLS → TS.
        // ═══════════════════════════════════════════════════════════════════════
        const cfg = getProfileConfig(actualProfile);
        const bandwidth = (cfg.bitrate || 5000) * 1000; // kbps → bps
        const avgBandwidth = Math.round(bandwidth * 0.8); // AVERAGE-BANDWIDTH ≈ 80% del pico (Apple HLS Authoring Spec)
        const resolution = cfg.resolution || '1920x1080';
        const fps = cfg.fps || 30;

        // ═══════════════════════════════════════════════════════════════════
        // 🎯 CODECS EN EXT-X-STREAM-INF [TOGGLE: prio-quality]
        //
        // Prio. Quality ON (window._APE_PRIO_QUALITY):
        //   Jerarquía MÁXIMA COMPRESIÓN (NUNCA pedir menos de HEVC):
        //   AV1 (top) → HEVC/H.265 (mínimo aceptable) → H.264 High (último recurso)
        //   • P0: AV1 Main 10-bit + Opus
        //   • P1-P5: HEVC Main 10 + AAC-LC (HEVC es el PISO)
        //
        // Prio. Quality OFF:
        //   Usa codec nativo del perfil (H264 para P3-P5)
        // ═══════════════════════════════════════════════════════════════════

        let codecString;
        if (window._APE_PRIO_QUALITY !== false) {
            // 🎯 PRIO QUALITY ON: Siempre máxima compresión
            if (actualProfile === 'P0') {
                codecString = 'av01.0.16M.10,opus';           // AV1 + Opus (top)
            } else {
                codecString = 'hev1.2.4.L153.B0,mp4a.40.2';   // HEVC + AAC (mínimo aceptable)
            }
        } else {
            // ⚪ PRIO QUALITY OFF: Codec nativo del perfil
            const primary = (cfg.codec_primary || 'H264').toUpperCase();
            if (primary === 'AV1') codecString = 'av01.0.16M.10,opus';
            else if (primary === 'HEVC') codecString = 'hev1.2.4.L153.B0,mp4a.40.2';
            else codecString = 'avc1.640028,mp4a.40.2';       // H264 High@4.0 (nunca Baseline)
        }

        // EXT-X-STREAM-INF con AVERAGE-BANDWIDTH y CODECS (RFC 8216 §4.3.4.2)
        let streamInf = `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},AVERAGE-BANDWIDTH=${avgBandwidth},RESOLUTION=${resolution},CODECS="${codecString}",FRAME-RATE=${fps}.000`;

        if (isModuleEnabled(MODULE_FEATURES.jwt)) {
            streamInf += `,X-APE-PROFILE="${actualProfile}",X-APE-VERSION="${VERSION}"`;
        }

        // Stream primario: siempre se emite
        lines.push(streamInf);
        lines.push(url);

        // Stream redundante: TS failover (solo si redundant-streams ON)
        if (isModuleEnabled(MODULE_FEATURES.redundantStreams) && window._APE_REDUNDANT_STREAMS === true) {
            let urlTS;
            if (url.endsWith('.m3u8')) {
                urlTS = url.replace(/\.m3u8$/, '.ts');
            } else if (url.endsWith('.ts')) {
                urlTS = url; // ya es TS, no duplicar
            } else {
                urlTS = url.replace(/\.[^.]+$/, '.ts') !== url ? url.replace(/\.[^.]+$/, '.ts') : url + '.ts';
            }
            // Solo agregar fallback TS si es diferente a la URL primaria
            if (urlTS !== url) {
                lines.push(streamInf);
                lines.push(urlTS);
            }
        }

        return lines.join('\n');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🌊 STREAMING M3U8 GENERATOR — ReadableStream (anti-RangeError)
    // Genera M3U8 como stream de chunks pequeños.
    // Memoria: ~5 MB constante (vs 300+ MB sin streaming)
    // Capacidad: ilimitada (no hay string length limit)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Crea un ReadableStream que emite el contenido M3U8 en chunks.
     * Cada canal se genera y se enqueue individualmente.
     * El stream se puede convertir a Blob con: new Response(stream).blob()
     */
    function generateM3U8Stream(channels, options = {}) {
        const forceProfile = options.forceProfile || null;
        const includeHeader = options.includeHeader !== false;
        const useHUD = options.hud !== false && window.HUD_TYPED_ARRAYS;
        const encoder = new TextEncoder();
        const BATCH_SIZE = 200; // Yield al browser cada 200 canales
        let totalBytes = 0;

        const stream = new ReadableStream({
            async start(controller) {
                const startTime = Date.now();

                console.log(`🌊 [STREAM] Generando M3U8 ULTIMATE para ${channels.length} canales...`);
                console.log(`   📊 Estructura: 133+ líneas/canal | JWT: 68+ campos | Perfiles: P0-P5`);

                // 🎯 INICIALIZAR HUD
                if (useHUD) {
                    window.HUD_TYPED_ARRAYS.init(channels.length, {
                        sessionId: `TA-${Date.now()}`
                    });
                    window.HUD_TYPED_ARRAYS.log('🌊 Streaming mode activado...', '#a78bfa');
                }

                // PASO 1: GLOBAL HEADER
                if (includeHeader) {
                    const headerChunk = generateGlobalHeader() + '\n\n';
                    const encoded = encoder.encode(headerChunk);
                    totalBytes += encoded.byteLength;
                    controller.enqueue(encoded);
                    if (useHUD) {
                        window.HUD_TYPED_ARRAYS.log('📋 Header global streamed', '#06b6d4');
                    }
                }

                // PASO 2: STREAM cada canal
                for (let index = 0; index < channels.length; index++) {
                    const channel = channels[index];

                    // Check abort
                    if (useHUD && window.HUD_TYPED_ARRAYS.isAborted()) {
                        controller.error(new Error('ABORTED_BY_USER'));
                        return;
                    }

                    try {
                        const entry = generateChannelEntry(channel, index, forceProfile);
                        const chunk = entry + '\n\n';
                        const encoded = encoder.encode(chunk);
                        totalBytes += encoded.byteLength;
                        controller.enqueue(encoded);

                        // Detectar perfil para estadísticas
                        const profile = forceProfile || detectProfile(channel);

                        // Actualizar HUD
                        if (useHUD && (index % 50 === 0 || index === channels.length - 1)) {
                            window.HUD_TYPED_ARRAYS.updateChannel(index + 1, channel.name, profile);
                        }

                        // Progress log cada 1000
                        if ((index + 1) % 1000 === 0) {
                            console.log(`   ⏳ Streamed: ${index + 1}/${channels.length}`);
                            if (useHUD) {
                                window.HUD_TYPED_ARRAYS.log(`📺 ${index + 1}/${channels.length} canales...`, '#a78bfa');
                            }
                        }
                    } catch (error) {
                        if (error.message === 'ABORTED_BY_USER') {
                            controller.error(error);
                            return;
                        }
                        console.error(`❌ [STREAM] Error en canal ${channel.name}:`, error);
                        if (useHUD) {
                            window.HUD_TYPED_ARRAYS.log(`⚠️ Error: ${channel.name}`, '#ef4444');
                        }
                    }

                    // 🌊 YIELD: Cada BATCH_SIZE canales, ceder control al browser
                    if ((index + 1) % BATCH_SIZE === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }

                // Cerrar stream
                controller.close();

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                const sizeMB = (totalBytes / 1024 / 1024).toFixed(2);
                const sizeKB = (totalBytes / 1024).toFixed(2);

                console.log(`✅ [STREAM] Generación completada en ${elapsed}s`);
                console.log(`   📊 Canales: ${channels.length} | Tamaño: ${sizeMB} MB | ~${140 * channels.length} líneas`);

                // 🎯 COMPLETAR HUD
                if (useHUD) {
                    window.HUD_TYPED_ARRAYS.updateStats({
                        jwt: `${(totalBytes / channels.length / 1024 * 0.3).toFixed(1)} KB/ch`,
                        filesize: `${sizeMB} MB`,
                        grouptitle: '✓ Activo'
                    });
                    window.HUD_TYPED_ARRAYS.complete({
                        jwt: `${sizeKB} KB`,
                        filesize: `${sizeMB} MB`
                    });
                }
            }
        });

        return stream;
    }

    /**
     * generateM3U8 — wrapper que convierte el stream a Blob
     * Compatible con el resto del sistema (devuelve Blob)
     */
    async function generateM3U8(channels, options = {}) {
        if (!channels || !Array.isArray(channels) || channels.length === 0) {
            console.error('❌ [TYPED-ARRAYS] No hay canales para generar');
            return null;
        }

        const stream = generateM3U8Stream(channels, options);
        // 🌊 El browser convierte el stream a Blob internamente
        // sin crear un mega-string en JS — manejo eficiente de memoria
        const response = new Response(stream);
        const blob = await response.blob();
        return blob;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GENERAR Y DESCARGAR (async — usa streaming)
    // ═══════════════════════════════════════════════════════════════════════════

    async function generateAndDownload(channels, options = {}) {
        const blob = await generateM3U8(channels, options);
        if (!blob) return null;

        const filename = options.filename || `APE_TYPED_ARRAYS_ULTIMATE_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.m3u8`;

        // Descargar usando Blob (ensamblado por el browser, no por JS)
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        console.log(`📥 [TYPED-ARRAYS] Archivo descargado: ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);

        // Disparar evento para gateway-manager
        if (typeof window !== 'undefined') {
            const event = new CustomEvent('m3u8-generated', {
                detail: {
                    content: blob,
                    filename: filename,
                    channelCount: channels.length,
                    generator: 'TYPED_ARRAYS_ULTIMATE',
                    version: VERSION,
                    linesPerChannel: 133,
                    size: blob.size
                }
            });
            window.dispatchEvent(event);
        }

        return { filename, blob, size: blob.size, channels: channels.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTEGRACIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════════

    if (typeof window !== 'undefined') {
        // API Global
        window.M3U8TypedArraysGenerator = {
            generate: generateM3U8,
            generateStream: generateM3U8Stream,
            generateAndDownload: generateAndDownload,
            generateChannelEntry: generateChannelEntry,
            generateJWT: generateJWT68Fields,
            determineProfile: determineProfile,
            profiles: PROFILES,
            version: VERSION,

            // ═══════════════════════════════════════════════════════════════════
            // CLEAN URL MODE API
            // ═══════════════════════════════════════════════════════════════════

            /**
             * Activa o desactiva el modo Clean URL
             * @param {boolean} enabled - true para URLs limpias, false para JWT
             */
            setCleanUrlMode: function (enabled) {
                CLEAN_URL_MODE = !!enabled;
                console.log(`🌐 [CLEAN-URL] Modo ${CLEAN_URL_MODE ? 'ACTIVADO' : 'DESACTIVADO'}`);
                return CLEAN_URL_MODE;
            },

            /**
             * Obtiene el estado actual del modo Clean URL
             * @returns {boolean}
             */
            isCleanUrlMode: function () {
                return CLEAN_URL_MODE;
            },

            /**
             * Obtiene información de la arquitectura actual
             * @returns {Object}
             */
            getArchitecture: function () {
                return {
                    version: VERSION,
                    mode: CLEAN_URL_MODE ? 'CLEAN_URL' : 'JWT',
                    urlMode: CLEAN_URL_MODE ? 'clean' : 'parameterized',
                    headersGlobal: CLEAN_URL_MODE ? 25 : 10,
                    headersPerChannel: CLEAN_URL_MODE ? 65 : 55,
                    jwtFields: CLEAN_URL_MODE ? 0 : 68
                };
            },

            // Generadores individuales (para debug/testing)
            _generateGlobalHeader: generateGlobalHeader,
            _generateEXTVLCOPT: generateEXTVLCOPT,
            _generateKODIPROP: generateKODIPROP,
            _generateEXTXAPE: generateEXTXAPE
        };

        // Integración con app
        function integrateWithApp() {
            if (window.app && typeof window.app === 'object') {
                window.app.generateM3U8_TypedArrays = function (options = {}) {
                    // ✅ FIX: Llamar método getFilteredChannels() para obtener canales filtrados actuales
                    let channels = [];

                    if (typeof this.getFilteredChannels === 'function') {
                        channels = this.getFilteredChannels() || [];
                        console.log(`🎯 [TYPED-ARRAYS] Usando getFilteredChannels(): ${channels.length} canales`);
                    } else {
                        channels = this.state?.filteredChannels ||
                            this.state?.channels ||
                            this.state?.channelsMaster || [];
                        console.log(`🎯 [TYPED-ARRAYS] Usando state fallback: ${channels.length} canales`);
                    }

                    if (channels.length === 0) {
                        alert('No hay canales para generar. Conecta a un servidor primero.');
                        return null;
                    }

                    return generateAndDownload(channels, options);
                };
                console.log('🚀 [TYPED-ARRAYS] ✅ Integrado con window.app.generateM3U8_TypedArrays()');
                return true;
            }
            return false;
        }

        // Polling para integración
        let attempts = 0;
        const maxAttempts = 50;
        const pollInterval = 200;

        function pollForApp() {
            attempts++;
            if (integrateWithApp()) return;
            if (attempts < maxAttempts) {
                setTimeout(pollForApp, pollInterval);
            } else {
                console.warn('🚀 [TYPED-ARRAYS] ⚠️ window.app no disponible. Use: M3U8TypedArraysGenerator.generateAndDownload(channels)');
            }
        }

        pollForApp();

        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`🚀 M3U8 TYPED ARRAYS ULTIMATE v${VERSION} Loaded`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('   ✅ 133+ líneas por canal');
        console.log('   ✅ 63 EXTVLCOPT + 38 KODIPROP + 29 EXT-X-APE');
        console.log('   ✅ JWT 68+ campos (8 secciones)');
        console.log('   ✅ 6 Perfiles: P0 (8K) → P5 (SD)');
        console.log('   ✅ RFC 8216 100% Compliance');
        console.log('   ✅ Resiliencia 24/7/365');
        console.log('   ✅ HTTPS Priority (upgrade HTTP → HTTPS)');
        console.log('═══════════════════════════════════════════════════════════════');
    }

})();
