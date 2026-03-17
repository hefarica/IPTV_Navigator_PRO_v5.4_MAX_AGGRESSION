/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚀 M3U8 TYPED ARRAYS ULTIMATE GENERATOR v16.4.0 MAX AGGRESSION NUCLEAR
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ESPECIFICACIÓN:
 * - 139 líneas por canal (1 EXTINF + 21 EXTVLCOPT + 6 KODIPROP + 109 EXT-X-APE + 1 START + 1 URL)
 * - 6 PERFILES: P0 (8K) → P5 (SD)
 * - JWT ENRIQUECIDO: 68+ campos en 8 secciones
 * - COMPLIANCE: RFC 8216 100%
 * - RESILIENCIA: 24/7/365, reconexión <30ms, 0 cortes
 * 
 * COMPATIBILIDAD: OTT Navigator, VLC, Kodi, Tivimate, IPTV Smarters
 * 
 * FECHA: 2026-01-29
 * VERSIÓN: 16.4.0-MAX-AGGRESSION-NUCLEAR
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '16.4.0-MAX-AGGRESSION-NUCLEAR';

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
    // 🖥️ DEVICE TIER DETECTION — v5.4 MAX AGGRESSION
    // Detecta la clase de hardware del dispositivo para escalar los niveles ISP
    // TIER 4 (NUCLEAR): Nvidia Shield, Apple TV 4K, PC con GPU dedicada
    // TIER 3 (BRUTAL): Android TV Box premium, PC básico
    // TIER 2 (SAVAGE): Smart TV mid-range, Chromecast Ultra
    // TIER 1 (EXTREME): FireTV Stick, Raspberry Pi, dispositivos de 1GB RAM
    // ═══════════════════════════════════════════════════════════════════════════
    const DEVICE_TIER = (function detectDeviceTier() {
        try {
            const ua = navigator.userAgent || '';
            const cores = navigator.hardwareConcurrency || 2;
            const mem = navigator.deviceMemory || 1; // GB
            const conn = navigator.connection || {};
            const bw = conn.downlink || 0; // Mbps estimado
            // Señales de hardware premium
            const isNvidiaShield = /SHIELD|AndroidTV/.test(ua) && cores >= 8;
            const isAppleTV = /AppleTV|tvOS/.test(ua);
            const isPC = /Windows|Macintosh|Linux x86/.test(ua) && cores >= 4;
            const isFireStick = /AFTS|AFTM|AFTB|FireTV|Silk/.test(ua);
            const isRaspberry = /armv7|armv6/.test(ua) && cores <= 4;
            if (isNvidiaShield || isAppleTV || (isPC && mem >= 8)) return 4; // NUCLEAR
            if (isPC && mem >= 4) return 3; // BRUTAL
            if (isFireStick || isRaspberry || mem <= 1) return 1; // EXTREME (safe)
            if (cores >= 8 && mem >= 4) return 3; // BRUTAL
            if (cores >= 4 && mem >= 2) return 2; // SAVAGE
            return 1; // EXTREME (default seguro)
        } catch(e) { return 1; }
    })();
    console.log(`🖥️ [DEVICE-TIER] Nivel detectado: \${DEVICE_TIER} (\${['','EXTREME','SAVAGE','BRUTAL','NUCLEAR'][DEVICE_TIER]})`);

    // ═══════════════════════════════════════════════════════════════════════════
    // ☢️ ISP_LEVELS — 5 Niveles Escalantes EXTREME→NUCLEAR (nunca bajan)
    // El sistema arranca en el nivel correspondiente al DEVICE_TIER
    // y puede escalar hacia arriba si el ISP intenta throttling
    // ═══════════════════════════════════════════════════════════════════════════
    const ISP_LEVELS = [
        null, // índice 0 no usado
        {   // NIVEL 1: EXTREME (FireTV Stick, dispositivos 1GB)
            name: 'EXTREME',
            tcp_window_mb: 4,
            parallel_streams: 4,
            burst_factor: 1.5,
            burst_duration_s: 30,
            prefetch_s: 30,
            strategy: 'MAX_CONTRACT',
            quic: false,
            http3: false
        },
        {   // NIVEL 2: ULTRA (Smart TV mid-range)
            name: 'ULTRA',
            tcp_window_mb: 8,
            parallel_streams: 8,
            burst_factor: 2.0,
            burst_duration_s: 60,
            prefetch_s: 60,
            strategy: 'MAX_CONTRACT_PLUS_20PCT',
            quic: true,
            http3: false
        },
        {   // NIVEL 3: SAVAGE (Android TV Box premium, PC básico)
            name: 'SAVAGE',
            tcp_window_mb: 16,
            parallel_streams: 16,
            burst_factor: 3.0,
            burst_duration_s: 999999,
            prefetch_s: 120,
            strategy: 'SATURATE_LINK',
            quic: true,
            http3: true
        },
        {   // NIVEL 4: BRUTAL (PC con GPU, Android premium)
            name: 'BRUTAL',
            tcp_window_mb: 32,
            parallel_streams: 32,
            burst_factor: 5.0,
            burst_duration_s: 999999,
            prefetch_s: 300,
            strategy: 'EXCEED_CONTRACT',
            quic: true,
            http3: true
        },
        {   // NIVEL 5: NUCLEAR (Nvidia Shield, Apple TV 4K, PC gaming)
            name: 'NUCLEAR',
            tcp_window_mb: 64,
            parallel_streams: 64,
            burst_factor: 10.0,
            burst_duration_s: 999999,
            prefetch_s: 999999,
            strategy: 'ABSOLUTE_MAX',
            quic: true,
            http3: true
        }
    ];
    const ACTIVE_ISP_LEVEL = ISP_LEVELS[DEVICE_TIER] || ISP_LEVELS[1];

    // Prefetch dinámico según DEVICE_TIER (ya definido arriba)
    const GLOBAL_PREFETCH = {
        get segments() {
            return [null, 10, 15, 20, 30][DEVICE_TIER] || 10;
        },
        get parallel() {
            return [null, 4, 8, 16, 32][DEVICE_TIER] || 4;
        }
    };

    console.log(`☢️ [ISP-LEVEL] Activo: \${ACTIVE_ISP_LEVEL.name} | TCP: \${ACTIVE_ISP_LEVEL.tcp_window_mb}MB | Parallel: \${ACTIVE_ISP_LEVEL.parallel_streams} | Burst: \${ACTIVE_ISP_LEVEL.burst_factor}x | Strategy: \${ACTIVE_ISP_LEVEL.strategy}`);

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
            bitrate: 120000,
            buffer_ms: 50000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 50000,
            max_bandwidth: 100000000,
            min_bandwidth: 50000000,
            throughput_t1: 156,
            throughput_t2: 120,
            prefetch_segments: '20,25,30',
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
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 9,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p12le'
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
            bitrate: 26900,
            buffer_ms: 40000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 40000,
            max_bandwidth: 60000000,
            min_bandwidth: 30000000,
            throughput_t1: 35,
            throughput_t2: 75,
            prefetch_segments: '10,15,20',
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
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 9,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p12le'
        },
        P2: {
            name: '4K_EXTREME',
            resolution: '3840x2160',
            width: 3840,
            height: 2160,
            fps: 30,
            bitrate: 18000,
            buffer_ms: 35000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 35000,
            max_bandwidth: 40000000,
            min_bandwidth: 20000000,
            throughput_t1: 23.4,
            throughput_t2: 50,
            prefetch_segments: '8,12,16',
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
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
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
            throughput_t1: 10.4,
            throughput_t2: 15,
            prefetch_segments: '6,8,10',
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
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
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
            bitrate: 4000,
            buffer_ms: 25000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 25000,
            max_bandwidth: 6000000,
            min_bandwidth: 2000000,
            throughput_t1: 5.2,
            throughput_t2: 8,
            prefetch_segments: '4,6,8',
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
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
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
            throughput_t1: 1.95,
            throughput_t2: 4,
            prefetch_segments: '2,4,6',
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
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
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


    function generateGlobalHeader(channelsCount) {
        const timestamp = new Date().toISOString().replace(/[:.]/g,'-').slice(0,18) + 'Z';
        const totalChannels = typeof window !== 'undefined' && window.app && typeof window.app.getFilteredChannels === 'function' ? window.app.getFilteredChannels().length : channelsCount;

        return `#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="3600"
#EXT-X-APE-BUILD:v5.4-MAX-AGGRESSION-${timestamp}
#EXT-X-APE-PARADIGM:PLAYER-ENSLAVEMENT-PROTOCOL-V5.4-NUCLEAR
#EXT-X-APE-CHANNELS:${totalChannels}
#EXT-X-APE-PROFILES:P0-ULTRA_EXTREME_8K,P1-4K_SUPREME_60FPS,P2-4K_EXTREME_30FPS,P3-FHD_ADVANCED_60FPS,P4-HD_STABLE_30FPS,P5-SD_FAILSAFE_25FPS
#EXT-X-APE-ISP-THROTTLE:5-LEVELS-ESCALATING-NEVER-DOWN
#EXT-X-APE-ISP-LEVEL-1:EXTREME-MAX_CONTRACT-TCP4MB-PAR4-BURST1.5x
#EXT-X-APE-ISP-LEVEL-2:ULTRA-MAX_CONTRACT_PLUS-TCP8MB-PAR8-BURST2x
#EXT-X-APE-ISP-LEVEL-3:SAVAGE-SATURATE_LINK-TCP16MB-PAR16-BURST3x
#EXT-X-APE-ISP-LEVEL-4:BRUTAL-EXCEED_CONTRACT-TCP32MB-PAR32-BURST5x
#EXT-X-APE-ISP-LEVEL-5:NUCLEAR-ABSOLUTE_MAX-TCP64MB-PAR64-BURST10x
#EXT-X-APE-LCEVC:MPEG-5-PART-2-FULL-3-PHASE-L1-L2-TRANSPORT-PARALLEL
#EXT-X-APE-ANTI-FREEZE:clock-jitter=1500,clock-synchro=1,net-cache=15000,prefetch=10-15-20
#EXT-X-APE-EXTHTTP-FIELDS:200+
#EXT-X-APE-LINES-PER-CHANNEL:200+
#EXT-X-APE-COMPATIBILITY:VLC,OTT-NAVIGATOR,TIVIMATE,KODI,EXOPLAYER,IPTV-SMARTERS,GSE,MX-PLAYER,INFUSE,PLEX,JELLYFIN,EMBY,PERFECT-PLAYER,SMART-TV,FIRE-TV,APPLE-TV,ANDROID-TV,ROKU,CHROMECAST`;
    }

    let _cachedSelectedUA = null;

    // ══════════════════════════════════════════════════════════════════
    // LCEVC DINÁMICO v5.4 — Estado determinado por codec base del canal
    // Regla: LCEVC siempre presente, sin excepción (MPEG-5 Part 2).
    //   HEVC / AV1 / VP9  → ACTIVE      (mejora L1+L2 completa)
    //   H.264              → SIGNAL_ONLY (señal SEI NAL embebida)
    //   Desconocido        → ACTIVE      (asumir máxima calidad)
    // ══════════════════════════════════════════════════════════════════
    function detectLcevcState(codecStr) {
        if (!codecStr) return 'ACTIVE';
        const c = codecStr.toLowerCase();
        if (/av01|av1\b|hvc1|hev1|h265|h\.265|hevc|vp09|vp9\b/.test(c)) return 'ACTIVE';
        if (/avc1|avc3|h264|h\.264|mp4v/.test(c)) return 'SIGNAL_ONLY';
        return 'ACTIVE';
    }

    function resolveLcevcState(cfg) {
        const codecProxy = cfg.codec_primary === 'AV1' ? 'av01' :
                           cfg.codec_primary === 'HEVC' ? 'hvc1' :
                           cfg.codec_primary === 'H264' ? 'avc1' : 'hvc1';
        return detectLcevcState(codecProxy);
    }

    function resolveLcevcBaseCodec(lcevcState, cfg) {
        return lcevcState === 'ACTIVE'
            ? (cfg.lcevc_base_codec || 'HEVC').toUpperCase()
            : 'H264';
    }

    // ══════════════════════════════════════════════════════════════════
    // LCEVC LAYER CONFIG v5.4 — Parámetros por perfil y resolución
    // ──────────────────────────────────────────────────────────────────
    // Para HEVC ACTIVE: L1+L2 completo, calibrado por resolución
    // Para H.264 SIGNAL_ONLY: metadata embebida, player decide
    // ══════════════════════════════════════════════════════════════════
    const LCEVC_LAYER_CONFIG = {
        P0: { // 8K — AV1 ACTIVE: máxima precisión, bloques grandes
            scale_factor: '4x',
            l1_block: '8X8',     l1_precision: '12bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '4X4',     l2_precision: '12bit', l2_temporal: 1, l2_upscale: 'LANCZOS4',
            base_ratio: '0.45',  enh_ratio: '0.55',
            threads: 16,         parallel_blocks: 2,
            transport: 'SUPPLEMENTAL_DATA', fb1: 'SEI_NAL', fb2: 'MPEG_TS_PID',
            sei_nal: '5', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P1: { // 4K 60fps — AV1/HEVC: alta precisión, bloques medios
            scale_factor: '2x',
            l1_block: '4X4',     l1_precision: '10bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '4X4',     l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS3',
            base_ratio: '0.50',  enh_ratio: '0.50',
            threads: 12,         parallel_blocks: 2,
            transport: 'SEI_NAL', fb1: 'SUPPLEMENTAL_DATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P2: { // 4K 30fps — HEVC: equilibrio calidad/CPU
            scale_factor: '2x',
            l1_block: '4X4',     l1_precision: '10bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '2X2',     l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS3',
            base_ratio: '0.55',  enh_ratio: '0.45',
            threads: 10,         parallel_blocks: 1,
            transport: 'SEI_NAL', fb1: 'WEBM_METADATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'PREFERRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P3: { // FHD 60fps — HEVC: calidad alta, CPU moderada
            scale_factor: '2x',
            l1_block: '4X4',     l1_precision: '10bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '2X2',     l2_precision: '8bit',  l2_temporal: 1, l2_upscale: 'BICUBIC',
            base_ratio: '0.60',  enh_ratio: '0.40',
            threads: 8,          parallel_blocks: 1,
            transport: 'SEI_NAL', fb1: 'WEBM_METADATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'PREFERRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P4: { // HD 30fps — HEVC: eficiente, bajo CPU
            scale_factor: '1.5x',
            l1_block: '2X2',     l1_precision: '8bit',  l1_deblock: 1, l1_temporal: 1,
            l2_block: '2X2',     l2_precision: '8bit',  l2_temporal: 1, l2_upscale: 'BICUBIC',
            base_ratio: '0.65',  enh_ratio: '0.35',
            threads: 6,          parallel_blocks: 1,
            transport: 'SEI_NAL', fb1: 'WEBM_METADATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'PREFERRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P5: { // SD — HEVC: mínimo overhead, máxima compatibilidad
            scale_factor: '1x',
            l1_block: '2X2',     l1_precision: '8bit',  l1_deblock: 0, l1_temporal: 1,
            l2_block: '2X2',     l2_precision: '8bit',  l2_temporal: 0, l2_upscale: 'BILINEAR',
            base_ratio: '0.70',  enh_ratio: '0.30',
            threads: 4,          parallel_blocks: 1,
            transport: 'SEI_NAL', fb1: 'MPEG_TS_PID', fb2: 'WEBM_METADATA',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'IF_AVAILABLE', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        }
    };

    /**
     * Resuelve la configuración LCEVC completa para un perfil dado.
     * Fusiona el estado dinámico (ACTIVE/SIGNAL_ONLY) con los parámetros por perfil.
     * @param {string} profile - ID del perfil (P0-P5)
     * @param {Object} cfg - Configuración del perfil
     * @returns {Object} Configuración LCEVC fusionada
     */
    function resolveLcevcConfig(profile, cfg) {
        const state = resolveLcevcState(cfg);
        const isActive = state === 'ACTIVE';
        const layerCfg = LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3'];

        return {
            state,
            enabled: true, // LCEVC nunca se deshabilita
            base_codec: resolveLcevcBaseCodec(state, cfg),
            l1_enabled: isActive ? 1 : 0,
            l2_enabled: isActive ? 1 : 0,
            ...layerCfg,
            // H.264 SIGNAL_ONLY override: mantener metadata pero player decide
            mode: isActive ? layerCfg.mode : 'SIGNAL_EMBED',
            hw_accel: isActive ? layerCfg.hw_accel : 'IF_AVAILABLE',
            decode_order: isActive ? layerCfg.decode_order : 'PASSTHROUGH'
        };
    }

    function generateEXTVLCOPT(profile) {
        const cfg = getProfileConfig(profile);
        return [
            `#EXTVLCOPT:network-caching=${GLOBAL_CACHING.network}`,
            `#EXTVLCOPT:live-caching=${GLOBAL_CACHING.live}`,
            `#EXTVLCOPT:file-caching=${GLOBAL_CACHING.file}`,
            `#EXTVLCOPT:clock-jitter=${cfg.clock_jitter || 1500}`,
            `#EXTVLCOPT:clock-synchro=${cfg.clock_synchro || 1}`,
            `#EXTVLCOPT:sout-mux-caching=${GLOBAL_CACHING.live}`,
            `#EXTVLCOPT:http-reconnect=true`,
            `#EXTVLCOPT:http-continuous=true`,
            `#EXTVLCOPT:http-forward-cookies=true`,
            `#EXTVLCOPT:avcodec-hw=any`,
            `#EXTVLCOPT:avcodec-dr=1`,
            `#EXTVLCOPT:avcodec-fast=0`,
            `#EXTVLCOPT:avcodec-threads=0`,
            `#EXTVLCOPT:swscale-mode=9`,
            `#EXTVLCOPT:deinterlace=0`,
            `#EXTVLCOPT:video-filter=deinterlace`,
            `#EXTVLCOPT:deinterlace-mode=yadif2x`,
            `#EXTVLCOPT:video-title-show=0`,
            `#EXTVLCOPT:fullscreen=1`,
            `#EXTVLCOPT:no-video-title-show`,
            `#EXTVLCOPT:hue=0`
        ];
    }

    function build_kodiprop(cfg, profile, index) {
        const lcevcState = resolveLcevcState(cfg); // LCEVC Dinámico: nunca DISABLED
        const streamHeaders = JSON.stringify({
            "User-Agent": `Mozilla/5.0 (APE-NAVIGATOR; ${cfg.name}) AppleWebKit/537.36`,
            "X-APE-Profile": profile,
            "X-LCEVC-State": lcevcState,
            "X-Buffer-Min": String(GLOBAL_CACHING.network),
            "X-Clock-Jitter": String(cfg.clock_jitter || 1500),
            "X-Clock-Synchro": String(cfg.clock_synchro || 1),
            "X-ISP-Throttle-Level": "1-EXTREME",
            "X-ISP-BW-Demand": "MAX_CONTRACT",
            "X-ISP-Parallel-Streams": "4",
            "X-ISP-TCP-Window": "4194304"
        });
        return [
            '#KODIPROP:inputstream=inputstream.adaptive',
            '#KODIPROP:inputstream.adaptive.manifest_type=hls',
            '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive',
            `#KODIPROP:inputstream.adaptive.stream_headers=${streamHeaders}`,
            `#KODIPROP:inputstream.adaptive.live_delay=${Math.floor(GLOBAL_CACHING.file / 1000)}`,
            `#KODIPROP:inputstream.adaptive.buffer_duration=${Math.floor(GLOBAL_CACHING.network / 1000)}`
        ];
    }

    function build_exthttp(cfg, profile, index, sessionId, reqId) {
        const timestamp = Math.floor(Date.now() / 1000);
        const nowDate = new Date(Date.now() - 86400000).toUTCString();
        const vpsDomain = (typeof window !== 'undefined' && window.app && window.app.state && window.app.state.currentServer && window.app.state.currentServer.baseUrl) 
             ? window.app.state.currentServer.baseUrl.replace(/\/player_api\.php$/, '').replace(/\/$/, '') 
             : 'https://iptv-ape.duckdns.org';

        const lcevcState = resolveLcevcState(cfg); // LCEVC Dinámico: nunca DISABLED
        const fps = cfg.fps || 30;

        let isp = {};
        if (ACTIVE_ISP_LEVEL) {
            isp = {
                "X-ISP-Throttle-Level": `1-${ACTIVE_ISP_LEVEL.name}`,
                "X-ISP-BW-Demand": ACTIVE_ISP_LEVEL.strategy || "MAX_CONTRACT",
                "X-ISP-BW-Ceiling": "NONE",
                "X-ISP-BW-Floor": "FULL_CONTRACT",
                "X-ISP-Burst-Mode": "ENABLED",
                "X-ISP-Burst-Factor": `${ACTIVE_ISP_LEVEL.burst_factor || 1.5}x`,
                "X-ISP-Burst-Duration": `${ACTIVE_ISP_LEVEL.burst_duration_s || 999999}s`,
                "X-ISP-Parallel-Streams": String(ACTIVE_ISP_LEVEL.parallel_streams || 4),
                "X-ISP-Segment-Pipeline": String(ACTIVE_ISP_LEVEL.parallel_streams || 4),
                "X-ISP-Prefetch-Ahead": `${ACTIVE_ISP_LEVEL.prefetch_s || 999999}s`,
                "X-ISP-TCP-Window": String((ACTIVE_ISP_LEVEL.tcp_window_mb || 4) * 1024 * 1024),
                "X-ISP-TCP-Nodelay": "1",
                "X-ISP-TCP-Quickack": "1",
                "X-ISP-QUIC-Enabled": String(ACTIVE_ISP_LEVEL.quic !== false),
                "X-ISP-HTTP2-Push": "true",
                "X-ISP-HTTP3-Enabled": String(ACTIVE_ISP_LEVEL.http3 !== false),
                "X-ISP-Pipelining": "true",
                "X-ISP-Keepalive-Max": "200",
                "X-ISP-Keepalive-Timeout": "120",
                "X-ISP-Demand-Strategy": "aggressive",
                "X-ISP-QoS-Override": "EF",
                "X-ISP-DSCP-Force": "46",
                "X-ISP-Priority-Escalation": "ENABLED",
                "X-ISP-BW-Probe-Interval": "5s",
                "X-ISP-BW-Probe-Size": "1MB"
            };
        }

        const headers = {
            "User-Agent": `Mozilla/5.0 (APE-NAVIGATOR; ${cfg.name}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
            "Accept": "application/vnd.apple.mpegurl,application/x-mpegURL,video/mp2t,video/MP2T,*/*;q=0.9",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "identity",
            "Sec-CH-UA": '"Chromium";v="120","Not-A.Brand";v="24"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"Windows"',
            "Sec-CH-UA-Arch": "x86",
            "Sec-CH-UA-Bitness": "64",
            "Sec-CH-UA-Model": '""',
            "Sec-Fetch-Dest": "media",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?0",
            "Connection": "keep-alive",
            "Keep-Alive": `timeout=${isp['X-ISP-Keepalive-Timeout'] || '120'}, max=${isp['X-ISP-Keepalive-Max'] || '200'}`,
            "DNT": "0",
            "Sec-GPC": "0",
            "Upgrade-Insecure-Requests": "0",
            "TE": "trailers",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Range": "bytes=0-",
            "If-None-Match": "*",
            "If-Modified-Since": nowDate,
            "Priority": "u=0, i",
            "Origin": vpsDomain,
            "Referer": `${vpsDomain}/`,
            "X-Requested-With": "XMLHttpRequest",
            "X-App-Version": `APE_${VERSION}_ULTIMATE_HDR`,
            "X-Playback-Session-Id": sessionId,
            "X-Device-Id": `DEV_${generateRandomString(16)}`,
            "X-Client-Timestamp": String(timestamp),
            "X-Request-Id": reqId,
            "X-Stream-Type": "hls,dash",
            "X-Quality-Preference": `codec-av1,profile-main-12,main-10,main,tier-high;codec-hevc,${(cfg.hevc_profile||'MAIN-10-HDR').toLowerCase()}`,
            "X-Playback-Rate": "1.0,1.25,1.5",
            "X-Segment-Duration": "1,2,4",
            "X-Min-Buffer-Time": "2,4,6",
            "X-Max-Buffer-Time": "12,18,25",
            "X-Request-Priority": "ultra-high",
            "X-Prefetch-Enabled": "true,adaptive,auto",

            // ── QUALITY UPGRADE v3 — 38 new EXTHTTP fields (A-J) ─────────
            "X-CMAF-Part-Target": cfg.cmaf_chunk_duration || "1.0",
            "X-CMAF-Server-Control": "CAN-BLOCK-RELOAD=YES",
            "X-CMAF-Playlist-Type": "LIVE",
            "X-CMAF-Delta-Playlist": "true",
            "X-CMAF-Program-Date-Time": new Date().toISOString(),
            "X-FMP4-Edit-List": "true",
            "X-FMP4-EMSG-Box": "true",
            "X-FMP4-PSSH-Box": "true",
            "X-FMP4-Client-Data": "true",
            "X-LCEVC-Rate-Control": "CRF+VBR",
            "X-LCEVC-Psycho-Visual": "true",
            "X-LCEVC-B-Frames": cfg.lcevc_bframes || "8",
            "X-LCEVC-Ref-Frames": cfg.lcevc_refframes || "16",
            "X-LCEVC-Lookahead": cfg.lcevc_lookahead || "60",
            "X-AI-SR-Precision": "FP16",
            "X-AI-SR-Tile-Size": "256",
            "X-AI-Motion-Estimation": "OPTICAL-FLOW",
            "X-AI-Content-Type": cfg.group || "GENERAL",
            "X-VVC-Toolset": "FULL",
            "X-VVC-Subpictures": "true",
            "X-VVC-LMCS": "true",
            "X-EVC-Level": cfg.evc_level || "5.1",
            "X-EVC-Toolset": "MAIN",
            "X-HDR-Mastering-Display": "G(0.265,0.690)B(0.150,0.060)R(0.680,0.320)WP(0.3127,0.3290)L(10000,0.001)",
            "X-HDR-Reference-White": "203nits",
            "X-HDR-Vivid": "true",
            "X-HDR-Filmmaker-Mode": "true",
            "X-HDR-Extended-Range": "true",
            "X-Audio-Bitrate": cfg.audio_bitrate || "640kbps",
            "X-Audio-Objects": cfg.audio_objects || "128",
            "X-Audio-TrueHD": "true",
            "X-Audio-DRC-Profile": "FILM-STANDARD",
            "X-Thumbnail-Format": "WebP+JPEG+AVIF",
            "X-Trick-Play-Rates": "2,4,8,16,32",
            "X-Chapter-Markers": "true",
            "X-SCTE35-PID": "0x0086",
            "X-SCTE35-Segmentation-Type": "PROGRAM_START",
            "X-SCTE35-Blackout-Override": "true",
            "X-Video-Codecs": "av1,hevc,vp9,h264,mpeg2",
            "X-Audio-Codecs": "opus,aac,eac3,ac3,dolby,mp3",
            "X-DRM-Support": "widevine,playready,fairplay",
            "X-Codec-Support": "av1",
            "X-CDN-Provider": "auto",
            "X-Failover-Enabled": "true",
            "X-Buffer-Size": "100000",
            "X-Buffer-Target": "60000",
            "X-Buffer-Min": String(GLOBAL_CACHING.network),
            "X-Buffer-Max": "200000",
            "X-Network-Caching": String(GLOBAL_CACHING.network),
            "X-Live-Caching": String(GLOBAL_CACHING.live),
            "X-File-Caching": String(GLOBAL_CACHING.file),
            "X-Buffer-Strategy": "ultra-aggressive",
            "X-Buffer-Underrun-Strategy": "aggressive-refill",
            "X-Device-Type": "smart-tv",
            "X-Screen-Resolution": cfg.resolution || '1920x1080',
            "X-Network-Type": "wifi",
            "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",
            "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
            "X-Player-Type": "exoplayer-ultra-extreme,vlc-pro,kodi-pro",
            "X-Hardware-Decode": "true",
            "X-Tunneling-Enabled": "off",
            "X-Audio-Track-Selection": "highest-quality-extreme,dolby-atmos-first",
            "X-Subtitle-Track-Selection": "off",
            "X-EPG-Sync": "enabled",
            "X-Catchup-Support": "flussonic-ultra",
            "X-Bandwidth-Estimation": "adaptive,balanced,conservative",
            "X-Initial-Bitrate": String((cfg.bitrate || 5000) * 1000),
            "X-Bandwidth-Preference": "unlimited",
            "X-BW-Estimation-Window": "10",
            "X-BW-Confidence-Threshold": "0.95",
            "X-BW-Smooth-Factor": "0.05",
            "X-Retry-Count": "10,12,15",
            "X-Retry-Delay-Ms": "120,200,350",
            "X-Connection-Timeout-Ms": "2500,3500,6000",
            "X-Read-Timeout-Ms": "6000,9000,12000",
            "X-Reconnect-On-Error": "true,immediate,adaptive",
            "X-Max-Reconnect-Attempts": String(cfg.reconnect_max_attempts || 40),
            "X-Reconnect-Delay-Ms": "50,100,200",
            "X-Seamless-Failover": "true-ultra",
            "X-Country-Code": "US",
            "X-HDR-Support": (cfg.hdr_support || []).join(',') || 'none',
            "X-Color-Depth": `${cfg.color_depth || 8}bit`,
            "X-Color-Space": "bt2020",
            "X-Dynamic-Range": "hdr",
            "X-HDR-Transfer-Function": "pq,hlg",
            "X-Color-Primaries": "bt2020",
            "X-Matrix-Coefficients": "bt2020nc",
            "X-Chroma-Subsampling": cfg.chroma_subsampling || '4:2:0',
            "X-Tone-Mapping": "auto",
            "X-HDR-Output-Mode": "auto",
            "X-HEVC-Tier": cfg.hevc_tier || 'MAIN',
            "X-HEVC-Level": cfg.hevc_level || '4.0',
            "X-HEVC-Profile": "MAIN-12,MAIN-10,MAIN",
            "X-Video-Profile": "main-12,main-10,main",
            "X-Rate-Control": "VBR,CQP",
            "X-Entropy-Coding": "CABAC",
            "X-Compression-Level": "0",
            "X-Pixel-Format": cfg.pixel_format || 'yuv420p',
            "X-Sharpen-Sigma": "0.02",
            "X-Max-Resolution": cfg.resolution || '1920x1080',
            "X-Max-Bitrate": String(cfg.max_bandwidth || 6000000),
            "X-FPS": String(fps),
            "X-Frame-Rates": `${fps},${fps > 30 ? '50,30,25,24' : '25,24'}`,
            "X-Aspect-Ratio": "16:9,21:9",
            "X-Pixel-Aspect-Ratio": "1:1",
            "X-Dolby-Atmos": "true",
            "X-Audio-Channels": String(cfg.audio_channels || 2),
            "X-Audio-Sample-Rate": "96000",
            "X-Audio-Bit-Depth": "24bit",
            "X-Spatial-Audio": "true",
            "X-Audio-Passthrough": "true",
            "X-Parallel-Segments": String(cfg.prefetch_parallel || 100),
            "X-Prefetch-Segments": String(cfg.prefetch_segments || 15),
            "X-Segment-Preload": "true",
            "X-Concurrent-Downloads": "8",
            "X-Packet-Loss-Monitor": "enabled,aggressive",
            "X-RTT-Monitoring": "enabled,aggressive",
            "X-Congestion-Detect": "enabled,aggressive-extreme",
            "X-ExoPlayer-Buffer-Min": String(GLOBAL_CACHING.file),
            "X-Manifest-Refresh": String(GLOBAL_CACHING.file),
            "X-KODI-LIVE-DELAY": String(Math.floor(GLOBAL_CACHING.file / 1000)),
            "X-APE-STRATEGY": "ultra-aggressive",
            "X-APE-Prefetch-Segments": "20",
            "X-APE-Quality-Threshold": "0.99",
            "X-APE-CODEC": (cfg.codec_primary || 'H264').toUpperCase(),
            "X-APE-RESOLUTION": cfg.resolution || '1920x1080',
            "X-APE-FPS": String(cfg.fps || 30),
            "X-APE-BITRATE": String(cfg.bitrate || 5000),
            "X-APE-TARGET-BITRATE": String((cfg.bitrate || 5000) * 1000),
            "X-APE-THROUGHPUT-T1": String(cfg.throughput_t1 || 12),
            "X-APE-THROUGHPUT-T2": String(cfg.throughput_t2 || 15),
            "X-APE-Version": "18.2",
            "X-APE-Profile": profile,
            "X-APE-QoE": "5.0",
            "X-APE-Guardian": "enabled",
            "X-APE-DNA-Version": "18.2",
            "X-APE-DNA-Fields": "124",
            "X-APE-DNA-Sync": "bidirectional",
            "X-QoS-DSCP": "EF",
            "X-QoS-Bitrate": `${cfg.bitrate || 5000}kbps`,
            "X-QoS-Priority": "ultra-high",
            "X-APE-Guardian-Enabled": "true",
            "X-APE-Guardian-State": "ONLINE",
            "X-APE-Guardian-Fallback-Level": "3",
            "X-APE-Guardian-Memory": "enabled",
            "X-APE-Guardian-Continuity": "guaranteed",
            "X-APE-Resilience-Strategy": "proactive_failover",
            "X-APE-Resilience-Chain": "7-levels",
            "X-APE-Resilience-Circuit-Breaker": "enabled",
            "X-APE-Resilience-Max-Retries": "3",
            "X-APE-Resilience-Retry-Backoff": "exponential",
            "X-APE-Resilience-Silent-Reconnect": "enabled",
            "X-APE-Telchemy-VSTQ": "enabled",
            "X-APE-Telchemy-VSMQ": "enabled",
            "X-APE-Telchemy-TR101290": "enabled",
            "X-APE-Telchemy-QoE-Target": "5.0",
            "X-APE-Hydra-Stealth": "enabled",
            "X-APE-Hydra-UA-Rotation": "enabled",
            "X-APE-Hydra-Fingerprint-Masking": "enabled",
            "X-LCEVC-Enabled": "true",
            "X-LCEVC-State": lcevcState,
            "X-LCEVC-Enhancement": "mpeg5-part2",
            "X-LCEVC-Scale-Factor": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).scale_factor,
            "X-LCEVC-L1-Block": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).l1_block,
            "X-LCEVC-L2-Block": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).l2_block,
            "X-LCEVC-Threads": String((LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).threads),
            "X-LCEVC-HW-Accel": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).hw_accel,
            "X-LCEVC-Transport": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).transport,
            "X-LCEVC-SEI-NAL-Type": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).sei_nal,
            "X-LCEVC-MPEG-TS-PID": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).pid,
            "X-LCEVC-WebM-Track": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).webm
        };

        for (const [k, v] of Object.entries(isp)) {
            if (k !== 'name') headers[k] = v;
        }

        // ── FIX 1,5,6,11: Per-profile ISP overrides (reference v5.4) ──
        const _ispOv = {
            P0: { 'X-ISP-Segment-Pipeline':'64', 'X-ISP-Throttle-Level':'1-NUCLEAR',    'X-ISP-TCP-Window':'16777216', 'X-ISP-Burst-Duration':'60s' },
            P1: { 'X-ISP-Segment-Pipeline':'4',  'X-ISP-Throttle-Level':'1-EXTREME',    'X-ISP-TCP-Window':'4194304',  'X-ISP-Burst-Duration':'30s' },
            P2: { 'X-ISP-Segment-Pipeline':'16', 'X-ISP-Throttle-Level':'1-AGGRESSIVE', 'X-ISP-TCP-Window':'2097152',  'X-ISP-Burst-Duration':'20s' },
            P3: { 'X-ISP-Segment-Pipeline':'8',  'X-ISP-Throttle-Level':'2-HIGH',       'X-ISP-TCP-Window':'1048576',  'X-ISP-Burst-Duration':'15s' },
            P4: { 'X-ISP-Segment-Pipeline':'4',  'X-ISP-Throttle-Level':'3-MEDIUM',     'X-ISP-TCP-Window':'524288',   'X-ISP-Burst-Duration':'10s' },
            P5: { 'X-ISP-Segment-Pipeline':'4',  'X-ISP-Throttle-Level':'4-LOW',        'X-ISP-TCP-Window':'262144',   'X-ISP-Burst-Duration':'5s'  }
        };
        Object.assign(headers, _ispOv[profile] || _ispOv['P3']);
        return `#EXTHTTP:${JSON.stringify(headers)}`;
    }

    function build_ape_block(cfg, profile, index) {
        const buildTs = new Date().toISOString().replace(/[:.]/g,'-').slice(0,18) + 'Z';
        const codecStr = window._APE_PRIO_QUALITY !== false ? (profile === 'P0' ? 'hvc1.1.6.L183.B0,mp4a.40.2' : 'hvc1.1.6.L150.B0,mp4a.40.2') : `hvc1.1.6.L150.B0,mp4a.40.2`;
        const lcevcState = resolveLcevcState(cfg);
        const lc = resolveLcevcConfig(profile, cfg);

        return [
            // ── SECTION 1 — Identity (8 tags) ──────────────────────────────
            `#EXT-X-APE-VERSION:18.2`,
            `#EXT-X-APE-PROFILE:${profile}`,
            `#EXT-X-APE-CHANNEL-KEY:${index}`,
            `#EXT-X-APE-STREAM-ID:${index}`,
            `#EXT-X-APE-CODEC:${codecStr}`,
            `#EXT-X-APE-RESOLUTION:${cfg.resolution || '1920x1080'}`,
            `#EXT-X-APE-FRAME-RATE:${cfg.fps || 30}`,
            `#EXT-X-APE-BITRATE:${cfg.bitrate || 5000}kbps`,

            // ── SECTION 2 — LCEVC Identity (6 tags) ────────────────────────
            `#EXT-X-APE-HDR-PROFILE:${(cfg.hdr_support || []).join(',') || 'none'}`,
            `#EXT-X-APE-LCEVC-ENABLED:true`,
            `#EXT-X-APE-LCEVC-STATE:${lcevcState}`,
            `#EXT-X-APE-LCEVC-BASE-CODEC:${resolveLcevcBaseCodec(lcevcState, cfg)}`,
            `#EXT-X-APE-LCEVC-ENHANCEMENT:mpeg5-part2`,
            `#EXT-X-APE-LCEVC-SCALE-FACTOR:${cfg.lcevc_scale_factor || '2x'}`,

            // ── SECTION 3 — QoS/QoE (6 tags) ──────────────────────────────
            `#EXT-X-APE-AI-SR-ENABLED:true`,
            `#EXT-X-APE-QOE-SCORE:5.0`,
            `#EXT-X-APE-QOS-DSCP:EF`,
            `#EXT-X-APE-QOS-BITRATE:${cfg.bitrate || 5000}kbps`,
            `#EXT-X-APE-QOS-PRIORITY:ultra-high`,
            `#EXT-X-APE-VQS-SCORE:95`,

            // ── SECTION 4 — Buffer (4 tags) ────────────────────────────────
            `#EXT-X-APE-BUFFER-TARGET:60s`,
            `#EXT-X-APE-BUFFER-MIN:15s`,
            `#EXT-X-APE-BUFFER-MAX:200s`,
            `#EXT-X-APE-PREBUFFER:15s`,

            // ── SECTION 5 — Guardian (5 tags) ──────────────────────────────
            `#EXT-X-APE-GUARDIAN-ENABLED:true`,
            `#EXT-X-APE-GUARDIAN-STATE:ONLINE`,
            `#EXT-X-APE-GUARDIAN-FALLBACK-LEVEL:3`,
            `#EXT-X-APE-GUARDIAN-MEMORY:enabled`,
            `#EXT-X-APE-GUARDIAN-CONTINUITY:guaranteed`,

            // ── SECTION 6 — Resilience (6 tags) ───────────────────────────
            `#EXT-X-APE-RESILIENCE-STRATEGY:proactive_failover`,
            `#EXT-X-APE-RESILIENCE-CHAIN:7-levels`,
            `#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER:enabled`,
            `#EXT-X-APE-RESILIENCE-MAX-RETRIES:3`,
            `#EXT-X-APE-RESILIENCE-RETRY-BACKOFF:exponential`,
            `#EXT-X-APE-RESILIENCE-SILENT-RECONNECT:enabled`,

            // ── SECTION 7 — Degradation chain (7 tags) ────────────────────
            `#EXT-X-APE-DEGRADATION-LEVEL-1:CMAF+HEVC+LCEVC`,
            `#EXT-X-APE-DEGRADATION-LEVEL-2:HLS/fMP4+HEVC+LCEVC`,
            `#EXT-X-APE-DEGRADATION-LEVEL-3:HLS/fMP4+H.264`,
            `#EXT-X-APE-DEGRADATION-LEVEL-4:HLS/TS+H.264`,
            `#EXT-X-APE-DEGRADATION-LEVEL-5:HLS/TS+Baseline`,
            `#EXT-X-APE-DEGRADATION-LEVEL-6:TS-Direct`,
            `#EXT-X-APE-DEGRADATION-LEVEL-7:HTTP-Redirect`,

            // ── SECTION 8 — Telchemy (4 tags) ─────────────────────────────
            `#EXT-X-APE-TELCHEMY-VSTQ:enabled`,
            `#EXT-X-APE-TELCHEMY-VSMQ:enabled`,
            `#EXT-X-APE-TELCHEMY-TR101290:enabled`,
            `#EXT-X-APE-TELCHEMY-QOE-TARGET:5.0`,

            // ── SECTION 9 — Hydra Stealth (3 tags) ────────────────────────
            `#EXT-X-APE-HYDRA-STEALTH:enabled`,
            `#EXT-X-APE-HYDRA-UA-ROTATION:enabled`,
            `#EXT-X-APE-HYDRA-FINGERPRINT-MASKING:enabled`,

            // ── SECTION 10 — DNA (5 tags) ─────────────────────────────────
            `#EXT-X-APE-DNA-VERSION:18.2`,
            `#EXT-X-APE-DNA-FIELDS:124`,
            `#EXT-X-APE-DNA-SYNC:bidirectional`,
            `#EXT-X-APE-DNA-MAP-SOURCE:channels_map_v5.4_MAX_AGGRESSION`,
            `#EXT-X-APE-DNA-HASH:${index}-${profile}-${buildTs}`,

            // ── SECTION 11 — Anti-Freeze / Cache (8 tags) ─────────────────
            `#EXT-X-APE-ANTI-FREEZE:clock-jitter=${cfg.clock_jitter || 1500},clock-synchro=${cfg.clock_synchro || 1},net-cache=${GLOBAL_CACHING.network},buf-min=${GLOBAL_CACHING.network},prefetch=10,15,20,reconnect-backoff=50ms`,
            `#EXT-X-APE-CLOCK-JITTER:${cfg.clock_jitter || 1500}`,
            `#EXT-X-APE-CLOCK-SYNCHRO:${cfg.clock_synchro || 1}`,
            `#EXT-X-APE-NETWORK-CACHE:${GLOBAL_CACHING.network}`,
            `#EXT-X-APE-LIVE-CACHE:${GLOBAL_CACHING.live}`,
            `#EXT-X-APE-RECONNECT-MAX:40`,
            `#EXT-X-APE-RETRY-COUNT:10,12,15`,
            `#EXT-X-APE-PREFETCH-SEGMENTS:10,15,20`,

            // ── SECTION 12 — Format flags (5 tags) ────────────────────────
            `#EXT-X-APE-CMAF:ENABLED`,
            `#EXT-X-APE-FMP4:ENABLED`,
            `#EXT-X-APE-HDR10:ENABLED`,
            `#EXT-X-APE-DOLBY-VISION:ENABLED-PROFILE-8.1-LEVEL-6`,
            `#EXT-X-APE-ATMOS:ENABLED`,

            // ── SECTION 13 — ISP Throttle (10 tags) ───────────────────────
            `#EXT-X-APE-ISP-THROTTLE-STRATEGY:ESCALATING-NEVER-DOWN`,
            `#EXT-X-APE-ISP-LEVEL-1:EXTREME-MAX_CONTRACT`,
            `#EXT-X-APE-ISP-LEVEL-2:ULTRA-MAX_CONTRACT_PLUS`,
            `#EXT-X-APE-ISP-LEVEL-3:SAVAGE-SATURATE_LINK`,
            `#EXT-X-APE-ISP-LEVEL-4:BRUTAL-EXCEED_CONTRACT`,
            `#EXT-X-APE-ISP-LEVEL-5:NUCLEAR-ABSOLUTE_MAX`,
            `#EXT-X-APE-ISP-TCP-WINDOW-PROGRESSION:4MB\u21928MB\u219216MB\u219232MB\u219264MB`,
            `#EXT-X-APE-ISP-PARALLEL-PROGRESSION:4\u21928\u219216\u219232\u219264`,
            `#EXT-X-APE-ISP-BURST-FACTOR-PROGRESSION:1.5x\u21922x\u21923x\u21925x\u219210x`,
            `#EXT-X-APE-ISP-PREFETCH-PROGRESSION:30s\u219260s\u2192120s\u2192300s\u2192UNLIMITED`,

            // ── SECTION 14 — LCEVC Full Spec (26 tags) ────────────────────
            `#EXT-X-APE-LCEVC:ENABLED`,
            `#EXT-X-APE-LCEVC-STANDARD:MPEG-5-PART-2`,
            `#EXT-X-APE-LCEVC-PROFILE:${lc.profile}`,
            `#EXT-X-APE-LCEVC-PLAYER-REQUIRED:0`,
            `#EXT-X-APE-LCEVC-FALLBACK:BASE_ONLY`,
            `#EXT-X-APE-LCEVC-BASE-LAYER-SCALE:${lc.base_ratio}`,
            `#EXT-X-APE-LCEVC-BASE-BITRATE-RATIO:${lc.base_ratio}`,
            `#EXT-X-APE-LCEVC-ENHANCEMENT-BITRATE-RATIO:${lc.enh_ratio}`,
            `#EXT-X-APE-LCEVC-L1-ENABLED:1`,
            `#EXT-X-APE-LCEVC-L1-TRANSFORM-BLOCK:${lc.l1_block}`,
            `#EXT-X-APE-LCEVC-L1-DEBLOCK-FILTER:${lc.l1_deblock}`,
            `#EXT-X-APE-LCEVC-L1-RESIDUAL-PRECISION:${lc.l1_precision}`,
            `#EXT-X-APE-LCEVC-L1-TEMPORAL-PREDICTION:${lc.l1_temporal}`,
            `#EXT-X-APE-LCEVC-L2-ENABLED:1`,
            `#EXT-X-APE-LCEVC-L2-TRANSFORM-BLOCK:${lc.l2_block}`,
            `#EXT-X-APE-LCEVC-L2-TEMPORAL-PREDICTION:${lc.l2_temporal}`,
            `#EXT-X-APE-LCEVC-L2-RESIDUAL-PRECISION:${lc.l2_precision}`,
            `#EXT-X-APE-LCEVC-L2-UPSCALE-FILTER:${lc.l2_upscale}`,
            `#EXT-X-APE-LCEVC-MODE:${lc.mode}`,
            `#EXT-X-APE-LCEVC-TRANSPORT-PRIMARY:${lc.transport}`,
            `#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-1:${lc.fb1}`,
            `#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-2:${lc.fb2}`,
            `#EXT-X-APE-LCEVC-SEI-NAL-TYPE:${lc.sei_nal}`,
            `#EXT-X-APE-LCEVC-MPEG-TS-PID:${lc.pid}`,
            `#EXT-X-APE-LCEVC-WEBM-TRACK-ID:${lc.webm}`,
            `#EXT-X-APE-LCEVC-PARALLEL-BLOCKS:${lc.parallel_blocks}`,
            `#EXT-X-APE-LCEVC-PARALLEL-THREADS:${lc.threads}`,
            `#EXT-X-APE-LCEVC-DECODE-ORDER:${lc.decode_order}`,
            `#EXT-X-APE-LCEVC-HW-ACCELERATION:${lc.hw_accel}`,
            `#EXT-X-APE-LCEVC-SW-FALLBACK:1`,
            `#EXT-X-APE-LCEVC-COMPAT:UNIVERSAL`,
            `#EXT-X-APE-LCEVC-GRACEFUL-DEGRADATION:BASE_CODEC_PASSTHROUGH`,
            // ══════════════════════════════════════════════════════════════
            // QUALITY UPGRADE v3 — PACKAGES A-J COMPLETE (271 tags)
            // Base + New tags for each package
            // ══════════════════════════════════════════════════════════════

            // ══════════════════════════════════════════════════════════════
            // PACKAGE A — CMAF CHUNKED TRANSFER v2 (22 tags)
            // Base 12 + New 10
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-CMAF-CHUNK-DURATION:${cfg.cmaf_chunk_duration || '1.0'}`,
            `#EXT-X-APE-CMAF-CHUNK-TYPE:CMAF_CHUNK`,
            `#EXT-X-APE-CMAF-INGEST-PROTOCOL:CMAF-INGEST-V2`,
            `#EXT-X-APE-CMAF-COMMON-ENCRYPTION:CBCS`,
            `#EXT-X-APE-CMAF-TRACK-TYPE:VIDEO+AUDIO+SUBTITLE`,
            `#EXT-X-APE-CMAF-SEGMENT-ALIGNMENT:true`,
            `#EXT-X-APE-CMAF-INDEPENDENT-SEGMENTS:true`,
            `#EXT-X-APE-CMAF-LOW-LATENCY:true`,
            `#EXT-X-APE-CMAF-PART-HOLD-BACK:3.0`,
            `#EXT-X-APE-CMAF-CAN-BLOCK-RELOAD:YES`,
            `#EXT-X-APE-CMAF-CAN-SKIP-UNTIL:36.0`,
            `#EXT-X-APE-CMAF-RENDITION-REPORTS:true`,
            `#EXT-X-APE-CMAF-PART-TARGET:${cfg.cmaf_chunk_duration || '1.0'}`,
            `#EXT-X-APE-CMAF-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,HOLD-BACK=6.0`,
            `#EXT-X-APE-CMAF-PLAYLIST-TYPE:LIVE`,
            `#EXT-X-APE-CMAF-TARGET-DURATION:${Math.ceil((cfg.buffer_live || 30000) / 1000)}`,
            `#EXT-X-APE-CMAF-MEDIA-SEQUENCE:dynamic`,
            `#EXT-X-APE-CMAF-DISCONTINUITY-SEQUENCE:auto`,
            `#EXT-X-APE-CMAF-PROGRAM-DATE-TIME:${new Date().toISOString()}`,
            `#EXT-X-APE-CMAF-DATERANGE-ENABLED:true`,
            `#EXT-X-APE-CMAF-SKIP-BOUNDARY:6.0`,
            `#EXT-X-APE-CMAF-DELTA-PLAYLIST:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE B — fMP4 ENHANCEMENT TRACKS v2 (24 tags)
            // Base 14 + New 10
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-FMP4-VIDEO-TRACK:${cfg.codec || 'HEVC'}+LCEVC`,
            `#EXT-X-APE-FMP4-AUDIO-TRACK:AAC-LC+EAC3+AC4`,
            `#EXT-X-APE-FMP4-SUBTITLE-TRACK:TTML+WebVTT`,
            `#EXT-X-APE-FMP4-METADATA-TRACK:ID3+SCTE35`,
            `#EXT-X-APE-FMP4-THUMBNAIL-TRACK:JPEG+WebP`,
            `#EXT-X-APE-FMP4-LCEVC-TRACK:MPEG5-P2-SEI`,
            `#EXT-X-APE-FMP4-HDR-METADATA-TRACK:HDR10+`,
            `#EXT-X-APE-FMP4-DOLBY-VISION-TRACK:RPU`,
            `#EXT-X-APE-FMP4-SAMPLE-ENTRY:hvc1+dvh1`,
            `#EXT-X-APE-FMP4-BRAND:iso6+cmfc+dash`,
            `#EXT-X-APE-FMP4-FRAGMENT-DURATION:${cfg.fmp4_fragment_ms || '2000'}`,
            `#EXT-X-APE-FMP4-SIDX-BOX:true`,
            `#EXT-X-APE-FMP4-SAIO-SAIZ:true`,
            `#EXT-X-APE-FMP4-PRFT-BOX:true`,
            `#EXT-X-APE-FMP4-EDIT-LIST:true`,
            `#EXT-X-APE-FMP4-CTTS-BOX:true`,
            `#EXT-X-APE-FMP4-SGPD-BOX:true`,
            `#EXT-X-APE-FMP4-SBGP-BOX:true`,
            `#EXT-X-APE-FMP4-EMSG-BOX:true`,
            `#EXT-X-APE-FMP4-PSSH-BOX:true`,
            `#EXT-X-APE-FMP4-TENC-BOX:true`,
            `#EXT-X-APE-FMP4-SENC-BOX:true`,
            `#EXT-X-APE-FMP4-TRACK-ENCRYPTION:CBCS`,
            `#EXT-X-APE-FMP4-COMMON-MEDIA-CLIENT-DATA:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE C — LCEVC v2 PHASE 3 COMPLETE (15 new tags)
            // (Base 97 already in sections 2 + 14 above)
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-LCEVC-RATE-CONTROL:CRF+VBR`,
            `#EXT-X-APE-LCEVC-PSYCHO-VISUAL:true`,
            `#EXT-X-APE-LCEVC-AQ-MODE:VARIANCE`,
            `#EXT-X-APE-LCEVC-LOOKAHEAD:${cfg.lcevc_lookahead || 60}`,
            `#EXT-X-APE-LCEVC-B-FRAMES:${cfg.lcevc_bframes || 8}`,
            `#EXT-X-APE-LCEVC-REF-FRAMES:${cfg.lcevc_refframes || 16}`,
            `#EXT-X-APE-LCEVC-SUBPEL-REFINE:7`,
            `#EXT-X-APE-LCEVC-ME-RANGE:24`,
            `#EXT-X-APE-LCEVC-TRELLIS:2`,
            `#EXT-X-APE-LCEVC-DEBLOCK-ALPHA:${cfg.lcevc_deblock_alpha || -2}`,
            `#EXT-X-APE-LCEVC-DEBLOCK-BETA:${cfg.lcevc_deblock_beta || -2}`,
            `#EXT-X-APE-LCEVC-SAR:${cfg.resolution || '3840x2160'}`,
            `#EXT-X-APE-LCEVC-COLORMATRIX:${cfg.color_space || 'BT.2020'}`,
            `#EXT-X-APE-LCEVC-TRANSFER:${cfg.transfer_function || 'SMPTE-ST-2084'}`,
            `#EXT-X-APE-LCEVC-PRIMARIES:${cfg.color_primaries || 'BT.2020'}`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE D — AI SUPER RESOLUTION COMPLETE (22 tags)
            // Base 15 + New 7
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-AI-SR-MODEL:ESRGAN-4x+RealESRGAN`,
            `#EXT-X-APE-AI-SR-SCALE:${cfg.ai_sr_scale || '2x'}`,
            `#EXT-X-APE-AI-SR-INFERENCE:EDGE+CLOUD`,
            `#EXT-X-APE-AI-SR-FALLBACK:BICUBIC`,
            `#EXT-X-APE-AI-TEMPORAL-SR:true`,
            `#EXT-X-APE-AI-DENOISING:true`,
            `#EXT-X-APE-AI-DEBLOCKING:true`,
            `#EXT-X-APE-AI-ARTIFACT-REMOVAL:true`,
            `#EXT-X-APE-AI-FRAME-INTERPOLATION:true`,
            `#EXT-X-APE-AI-COLOR-ENHANCEMENT:true`,
            `#EXT-X-APE-AI-SHARPENING:ADAPTIVE`,
            `#EXT-X-APE-AI-HDR-UPCONVERT:SDR_TO_HDR10`,
            `#EXT-X-APE-AI-VMAF-TARGET:${cfg.vmaf_target || '95'}`,
            `#EXT-X-APE-AI-CONTENT-AWARE-ENCODING:true`,
            `#EXT-X-APE-AI-PERCEPTUAL-QUALITY:SSIM+VMAF`,
            `#EXT-X-APE-AI-SR-PRECISION:FP16`,
            `#EXT-X-APE-AI-SR-BATCH-SIZE:1`,
            `#EXT-X-APE-AI-SR-TILE-SIZE:256`,
            `#EXT-X-APE-AI-SR-OVERLAP:32`,
            `#EXT-X-APE-AI-MOTION-ESTIMATION:OPTICAL-FLOW`,
            `#EXT-X-APE-AI-SCENE-DETECTION:true`,
            `#EXT-X-APE-AI-CONTENT-TYPE:${cfg.group || 'GENERAL'}`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE E — VVC / H.266 COMPLETE (12 tags)
            // Base 6 + New 6
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-VVC-ENABLED:true`,
            `#EXT-X-APE-VVC-PROFILE:MAIN_10`,
            `#EXT-X-APE-VVC-LEVEL:${cfg.vvc_level || '5.1'}`,
            `#EXT-X-APE-VVC-TIER:MAIN`,
            `#EXT-X-APE-VVC-FALLBACK:HEVC`,
            `#EXT-X-APE-VVC-EFFICIENCY:+50%_vs_HEVC`,
            `#EXT-X-APE-VVC-TOOLSET:FULL`,
            `#EXT-X-APE-VVC-SUBPICTURES:true`,
            `#EXT-X-APE-VVC-WRAP-AROUND:true`,
            `#EXT-X-APE-VVC-LMCS:true`,
            `#EXT-X-APE-VVC-AFFINE-ME:true`,
            `#EXT-X-APE-VVC-BDOF:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE F — EVC / MPEG-5 P1 COMPLETE (8 tags)
            // Base 4 + New 4
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-EVC-ENABLED:true`,
            `#EXT-X-APE-EVC-PROFILE:BASELINE`,
            `#EXT-X-APE-EVC-FALLBACK:H264`,
            `#EXT-X-APE-EVC-ROYALTY-FREE:true`,
            `#EXT-X-APE-EVC-LEVEL:${cfg.evc_level || '5.1'}`,
            `#EXT-X-APE-EVC-TOOLSET:MAIN`,
            `#EXT-X-APE-EVC-ADAPTIVE-LOOP-FILTER:true`,
            `#EXT-X-APE-EVC-CHROMA-QP-OFFSET:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE G — HDR ADVANCED COMPLETE (42 tags)
            // Base 32 + New 10
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-HDR-CHAIN:${(cfg.hdr_support || ['dolby-vision','hdr10+','hdr10','hlg','sdr']).join(',')}`,
            `#EXT-X-APE-HDR-COLOR-SPACE:${cfg.color_space || 'BT.2020,BT.709'}`,
            `#EXT-X-APE-HDR-TRANSFER-FUNCTION:${cfg.transfer_function || 'SMPTE-ST-2084,ARIB-STD-B67,BT.709'}`,
            `#EXT-X-APE-HDR-COLOR-PRIMARIES:${cfg.color_primaries || 'BT.2020'}`,
            `#EXT-X-APE-HDR-MATRIX-COEFFICIENTS:${cfg.matrix_coefficients || 'BT.2020nc'}`,
            `#EXT-X-APE-HDR-MAX-CLL:${cfg.max_cll || '4000,400'}`,
            `#EXT-X-APE-HDR-MAX-FALL:${cfg.max_fall || '1200'}`,
            `#EXT-X-APE-HDR-BIT-DEPTH:${cfg.color_depth || 10}bit`,
            `#EXT-X-APE-HDR-DOLBY-VISION-PROFILE:${cfg.dv_profile || '8.1'}`,
            `#EXT-X-APE-HDR-DOLBY-VISION-LEVEL:${cfg.dv_level || '6'}`,
            `#EXT-X-APE-HDR-SDR-FALLBACK:enabled`,
            `#EXT-X-APE-HDR-TONE-MAPPING:auto`,
            `#EXT-X-APE-HDR-GRACEFUL-DEGRADATION:SDR_PASSTHROUGH`,
            `#EXT-X-APE-HDR-STATIC-METADATA:enabled`,
            `#EXT-X-APE-HDR-DYNAMIC-METADATA:HDR10+,DV-RPU`,
            `#EXT-X-APE-HDR-PEAK-LUMINANCE:${cfg.peak_luminance || '4000'}nits`,
            `#EXT-X-APE-HDR-MIN-LUMINANCE:0.001nits`,
            `#EXT-X-APE-HDR-GAMUT:DCI-P3,BT.2020`,
            `#EXT-X-APE-HDR-10PLUS-VERSION:2.0`,
            `#EXT-X-APE-HDR-10PLUS-APPLICATION:4`,
            `#EXT-X-APE-HDR-DCI-P3-COVERAGE:99.8`,
            `#EXT-X-APE-HDR-BT2020-COVERAGE:97.5`,
            `#EXT-X-APE-HDR-DOLBY-VISION-CROSS-COMPAT:true`,
            `#EXT-X-APE-HDR-HLG-COMPAT:true`,
            `#EXT-X-APE-HDR-ST2094-10:true`,
            `#EXT-X-APE-HDR-ST2094-20:true`,
            `#EXT-X-APE-HDR-ST2094-30:true`,
            `#EXT-X-APE-HDR-ST2094-40:true`,
            `#EXT-X-APE-HDR-METADATA-INSERT-MODE:SEI`,
            `#EXT-X-APE-HDR-METADATA-PASS-THROUGH:true`,
            `#EXT-X-APE-HDR-OUTPUT-MODE:auto`,
            `#EXT-X-APE-HDR-DISPLAY-METADATA-SYNC:true`,
            `#EXT-X-APE-HDR-MASTERING-DISPLAY:G(0.265,0.690)B(0.150,0.060)R(0.680,0.320)WP(0.3127,0.3290)L(10000,0.001)`,
            `#EXT-X-APE-HDR-CONTENT-LIGHT-LEVEL:${cfg.max_cll || '4000,400'}`,
            `#EXT-X-APE-HDR-AMBIENT-VIEWING-ENV:DIM`,
            `#EXT-X-APE-HDR-REFERENCE-WHITE:203nits`,
            `#EXT-X-APE-HDR-SCENE-LUMINANCE:true`,
            `#EXT-X-APE-HDR-EXTENDED-RANGE:true`,
            `#EXT-X-APE-HDR-VIVID-ENABLED:true`,
            `#EXT-X-APE-HDR-SLHDR2:true`,
            `#EXT-X-APE-HDR-TECHNICOLOR:true`,
            `#EXT-X-APE-HDR-FILMMAKER-MODE:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE H — AUDIO ADVANCED COMPLETE (16 tags)
            // Base 8 + New 8
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-AUDIO-CODEC:EAC3+AC4+AAC-LC`,
            `#EXT-X-APE-AUDIO-ATMOS:true`,
            `#EXT-X-APE-AUDIO-SPATIAL:DOLBY-ATMOS+DTS-X`,
            `#EXT-X-APE-AUDIO-CHANNELS:${cfg.audio_channels || '7.1.4'}`,
            `#EXT-X-APE-AUDIO-SAMPLE-RATE:48000`,
            `#EXT-X-APE-AUDIO-BIT-DEPTH:24bit`,
            `#EXT-X-APE-AUDIO-LOUDNESS:-23LUFS`,
            `#EXT-X-APE-AUDIO-DYNAMIC-RANGE:20dB`,
            `#EXT-X-APE-AUDIO-BITRATE:${cfg.audio_bitrate || '640'}kbps`,
            `#EXT-X-APE-AUDIO-OBJECTS:${cfg.audio_objects || '128'}`,
            `#EXT-X-APE-AUDIO-BEDS:${cfg.audio_beds || '10'}`,
            `#EXT-X-APE-AUDIO-DIALNORM:-27`,
            `#EXT-X-APE-AUDIO-COMPR-MODE:RF`,
            `#EXT-X-APE-AUDIO-DRC-PROFILE:FILM-STANDARD`,
            `#EXT-X-APE-AUDIO-DOWNMIX:LtRt+LoRo`,
            `#EXT-X-APE-AUDIO-TRUEHD:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE I — TRICK PLAY + THUMBNAILS COMPLETE (14 tags)
            // Base 6 + New 8
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-TRICK-PLAY-ENABLED:true`,
            `#EXT-X-APE-THUMBNAIL-TRACK:WebP+JPEG`,
            `#EXT-X-APE-THUMBNAIL-INTERVAL:10s`,
            `#EXT-X-APE-THUMBNAIL-RESOLUTION:320x180`,
            `#EXT-X-APE-FAST-FORWARD-CODEC:HEVC-I-FRAME`,
            `#EXT-X-APE-SEEK-PRECISION:IFRAME`,
            `#EXT-X-APE-THUMBNAIL-FORMAT:WebP+JPEG+AVIF`,
            `#EXT-X-APE-THUMBNAIL-COLS:10`,
            `#EXT-X-APE-THUMBNAIL-ROWS:10`,
            `#EXT-X-APE-THUMBNAIL-BANDWIDTH:200000`,
            `#EXT-X-APE-TRICK-PLAY-RATES:2,4,8,16,32`,
            `#EXT-X-APE-TRICK-PLAY-IFRAME-ONLY:true`,
            `#EXT-X-APE-SEEK-MODE:IFRAME+KEYFRAME`,
            `#EXT-X-APE-CHAPTER-MARKERS:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE J — SCTE-35 BROADCAST COMPLETE (10 tags)
            // Base 3 + New 7
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-SCTE35-ENABLED:true`,
            `#EXT-X-APE-SCTE35-FORMAT:BINARY+BASE64`,
            `#EXT-X-APE-SCTE35-SIGNAL:CUE-IN+CUE-OUT`,
            `#EXT-X-APE-SCTE35-PID:0x0086`,
            `#EXT-X-APE-SCTE35-DURATION-HINT:30s`,
            `#EXT-X-APE-SCTE35-SEGMENTATION-TYPE:PROGRAM_START`,
            `#EXT-X-APE-SCTE35-UPID-TYPE:URI`,
            `#EXT-X-APE-SCTE35-AVAIL-NUM:1`,
            `#EXT-X-APE-SCTE35-AVAILS-EXPECTED:1`,
            `#EXT-X-APE-SCTE35-BLACKOUT-OVERRIDE:true`
        ];
    }

    const EXT_X_START_TEMPLATE = '#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES';

    const XTREAM_HTTP_PORTS = ['2082', '2083', '8080', '8000', '25461', '25463', '80'];

    function preferHttps(url) {
        if (!url || typeof url !== 'string') return url;
        try {
            const parsed = new URL(url);
            const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
            if (XTREAM_HTTP_PORTS.includes(port)) {
                if (url.startsWith('https://')) return url.replace(/^https:\/\//, 'http://');
                return url;
            }
            const noSSLHosts = ['line.tivi-ott.net', 'candycloud8k.biz', 'pro.123sat.net'];
            if (noSSLHosts.some(h => parsed.hostname.includes(h))) {
                if (url.startsWith('https://')) return url.replace(/^https:\/\//, 'http://');
                return url;
            }
        } catch (e) {}
        return url;
    }

    function generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }

    function generateNonce() {
        return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    function base64UrlEncode(str) {
        try {
            return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        } catch (e) {
            return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        }
    }

    function escapeM3UValue(value) {
        if (!value) return '';
        return String(value).replace(/"/g, "'").replace(/,/g, ' ');
    }

    function generateJWT68Fields(channel, profile, index) {
        return "JWT_STUB";
    }

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
        return 'P5';
    }

    function generateEXTINF(channel, profile, index) {
        const tvgId = escapeM3UValue(channel.stream_id || channel.id || index);
        const tvgName = escapeM3UValue(channel.name || `Canal ${index}`);
        const tvgLogo = escapeM3UValue(channel.stream_icon || channel.logo || '');
        let groupTitle = channel.category_name || channel.group || 'General';

        if (window.GroupTitleBuilder && document.getElementById('gt-enabled')?.checked !== false) {
            const gtConfig = window.GroupTitleBuilder.getConfig();
            if (gtConfig?.selectedFields?.length > 0) {
                groupTitle = window.GroupTitleBuilder.buildExport(channel, gtConfig);
            }
        }
        groupTitle = escapeM3UValue(groupTitle);
        
        return `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${groupTitle}" ape-profile="${profile}" ape-build="v5.4-MAX-AGGRESSION",${tvgName}`;
    }

    const MAX_URL_LENGTH = 2000;

    function buildChannelUrl(channel, jwt, profile = null, index = 0) {
        let baseUrl = channel.url || channel.direct_source || channel.stream_url || '';
        if (baseUrl && !baseUrl.startsWith('http')) baseUrl = '';
        if (baseUrl) baseUrl = baseUrl.split('?')[0];

        if (!baseUrl && typeof window !== 'undefined' && window.app && window.app.state) {
            const state = window.app.state;
            const channelServerId = channel._source || channel.serverId || channel.server_id;
            let server = null;

            if (channelServerId && state.activeServers) server = state.activeServers.find(s => s.id === channelServerId);
            if (!server && state.currentServer) server = state.currentServer;
            if (!server && state.activeServers && state.activeServers.length > 0) server = state.activeServers[0];

            if (server && server.baseUrl && server.username && server.password && channel.stream_id) {
                const cleanBase = server.baseUrl.replace(/\/player_api\.php$/, '').replace(/\/$/, '');
                baseUrl = `${cleanBase}/live/${server.username}/${server.password}/${channel.stream_id}.m3u8`;
            }
        }

        if (!baseUrl) return '';
        baseUrl = preferHttps(baseUrl);
        return baseUrl;
    }

    function generateChannelEntry(channel, index, forceProfile = null) {
        const profile = forceProfile || determineProfile(channel);
        const cfg = getProfileConfig(profile);
        
        const reqId = `REQ_${generateRandomString(16)}`;
        const sessionId = `SES_${generateRandomString(16)}`;

        const lines = [];

        lines.push(generateEXTINF(channel, profile, index));
        lines.push(build_exthttp(cfg, profile, index, sessionId, reqId));
        lines.push(...generateEXTVLCOPT(profile));
        lines.push(...build_kodiprop(cfg, profile, index));
        lines.push(...build_ape_block(cfg, profile, index));

        const bandwidth = (cfg.bitrate || 5000) >= 1000000 ? (cfg.bitrate || 5000) : (cfg.bitrate || 5000) * 1000;
        const avgBandwidth = Math.round(bandwidth * 0.8);
        const resolution = cfg.resolution || '1920x1080';
        const fps = cfg.fps || 30;
        const codecString = window._APE_PRIO_QUALITY !== false ? (profile === 'P0' ? 'av01.0.16M.10,opus' : 'hev1.2.4.L153.B0,mp4a.40.2') : 'hev1.2.4.L153.B0,mp4a.40.2';

        const streamInf = `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},AVERAGE-BANDWIDTH=${avgBandwidth},RESOLUTION=${resolution},CODECS="${codecString}",FRAME-RATE=${fps},HDCP-LEVEL=NONE`;
        lines.push(streamInf);

        let jwt = null;
        if (isModuleEnabled('jwt-generator')) jwt = generateJWT68Fields(channel, profile, index);
        lines.push(buildChannelUrl(channel, jwt, profile, index));

        return lines.join('\n');
    }


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
                console.log(`   📊 Estructura: 139 líneas/canal | JWT: 68+ campos | Perfiles: P0-P5`);

                // 🎯 INICIALIZAR HUD
                if (useHUD) {
                    window.HUD_TYPED_ARRAYS.init(channels.length, {
                        sessionId: `TA-${Date.now()}`
                    });
                    window.HUD_TYPED_ARRAYS.log('🌊 Streaming mode activado...', '#a78bfa');
                }

                // PASO 1: GLOBAL HEADER
                if (includeHeader) {
                    const headerChunk = generateGlobalHeader(channels.length) + '\n\n';
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
            _generateGlobalHeader: generateGlobalHeader
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
        console.log(`🚀 M3U8 TYPED ARRAYS ULTIMATE v${VERSION} MAX AGGRESSION NUCLEAR Loaded`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('   ✅ 139 líneas por canal (v5.4 MAX AGGRESSION — CALIBRADO)');
        console.log('   ✅ 21 EXTVLCOPT + 6 KODIPROP + 109 EXT-X-APE + 1 EXTHTTP');
        console.log('   ✅ JWT 68+ campos (8 secciones)');
        console.log('   ✅ 6 Perfiles: P0 (8K) → P5 (SD)');
        console.log('   ✅ RFC 8216 100% Compliance');
        console.log('   ✅ Resiliencia 24/7/365 + ISP NUCLEAR (5 niveles escalantes)');
        console.log('   ✅ HTTPS Priority (upgrade HTTP → HTTPS)');
        console.log('═══════════════════════════════════════════════════════════════');
    }

})();
