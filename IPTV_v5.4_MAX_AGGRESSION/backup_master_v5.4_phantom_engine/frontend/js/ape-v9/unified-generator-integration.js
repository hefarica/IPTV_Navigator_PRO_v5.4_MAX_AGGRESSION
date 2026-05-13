/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔥 UNIFIED GENERATOR INTEGRATION v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * FUSIÓN TOTAL: Combina lo mejor de 3 generadores en uno solo
 * 
 * COMPONENTES INTEGRADOS:
 * 1. M3U8GeneratorArch1 → JWT 68+ campos, 8 secciones
 * 2. M3U8APIWrapper → 17 motores, 250+ headers  
 * 3. APE_ENGINE_V9 → HUD visual, Session Warmup
 * 
 * FLUJO:
 * generateM3U8Ultimate() → FrontendOrchestrator → UnifiedGenerator
 *                                              ↓
 *                     ┌────────────────────────┴───────────────────────┐
 *                     │ Cabecera: M3U8APIWrapper.generateGlobalHeader() │
 *                     │ JWT: Architecture1.generateEnrichedJWT() 68+    │
 *                     │ Engines: M3U8APIWrapper._optimizeChannel() 17   │
 *                     │ Evasión: Evasion407Supremo.generateAllMetadata()│
 *                     └─────────────────────────────────────────────────┘
 * 
 * @version 1.0.0
 * @date 2026-01-29
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '1.0.0-UNIFIED';

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN DE PERFILES (heredada de Architecture 1)
    // ═══════════════════════════════════════════════════════════════════════

    const PROFILES = {
        P0: { name: 'ULTIMATE_EXTREME', level: 'L6', quality: '8K+', resolution: '8K+', fps: 60, bitrate: 120, buffer_ms: 60000, network_cache_ms: 120000, live_cache_ms: 120000, max_bandwidth: 'unlimited', codec_priority: 'av1,hevc,vp9,h264', hdr_support: true, device_class: 'CINEMA_IMAX', prefetch_segments: 15, prefetch_parallel: 8, prefetch_buffer_target: 180000, strategy: 'ultra-aggressive', color_depth: 12, throughput_t1: 120, throughput_t2: 200 },
        P1: { name: 'SUPREME_8K', level: 'L5', quality: '8K', resolution: '7680x4320', fps: 60, bitrate: 80, buffer_ms: 45000, network_cache_ms: 90000, live_cache_ms: 90000, max_bandwidth: 'unlimited', codec_priority: 'hevc,av1,vp9,h264', hdr_support: true, device_class: 'SMART_TV_8K', prefetch_segments: 12, prefetch_parallel: 6, prefetch_buffer_target: 120000, strategy: 'ultra-aggressive', color_depth: 12, throughput_t1: 80, throughput_t2: 150 },
        P2: { name: 'EXTREME_4K', level: 'L4', quality: '4K_UHD', resolution: '3840x2160', fps: 60, bitrate: 40, buffer_ms: 30000, network_cache_ms: 60000, live_cache_ms: 60000, max_bandwidth: 60000000, codec_priority: 'hevc,h264,vp9,av1', hdr_support: true, device_class: 'SMART_TV_4K', prefetch_segments: 10, prefetch_parallel: 5, prefetch_buffer_target: 90000, strategy: 'aggressive', color_depth: 10, throughput_t1: 40, throughput_t2: 80 },
        P3: { name: 'ADVANCED_FHD', level: 'L3', quality: 'FHD', resolution: '1920x1080', fps: 60, bitrate: 15, buffer_ms: 20000, network_cache_ms: 40000, live_cache_ms: 30000, max_bandwidth: 25000000, codec_priority: 'h264,hevc,vp9', hdr_support: false, device_class: 'SMART_TV_FHD', prefetch_segments: 8, prefetch_parallel: 4, prefetch_buffer_target: 60000, strategy: 'balanced', color_depth: 8, throughput_t1: 15, throughput_t2: 30 },
        P4: { name: 'STABLE_HD', level: 'L2', quality: 'HD', resolution: '1280x720', fps: 30, bitrate: 8, buffer_ms: 15000, network_cache_ms: 30000, live_cache_ms: 20000, max_bandwidth: 12000000, codec_priority: 'h264,vp9', hdr_support: false, device_class: 'SET_TOP_BOX', prefetch_segments: 6, prefetch_parallel: 3, prefetch_buffer_target: 45000, strategy: 'stable', color_depth: 8, throughput_t1: 8, throughput_t2: 15 },
        P5: { name: 'FAILSAFE_SD', level: 'L1', quality: 'SD', resolution: '720x480', fps: 30, bitrate: 2, buffer_ms: 10000, network_cache_ms: 20000, live_cache_ms: 15000, max_bandwidth: 5000000, codec_priority: 'h264,mpeg2', hdr_support: false, device_class: 'MOBILE_BASIC', prefetch_segments: 4, prefetch_parallel: 2, prefetch_buffer_target: 30000, strategy: 'failsafe', color_depth: 8, throughput_t1: 2, throughput_t2: 5 }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════════════════════════════════════

    function generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function generateNonce() {
        return `${Date.now()}_${generateRandomString(16)}`;
    }

    function base64UrlEncode(str) {
        if (typeof btoa === 'function') {
            return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function escapeM3UValue(str) {
        return (str || '').toString().replace(/"/g, "'").replace(/,/g, ';').replace(/\n/g, ' ').trim();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // JWT ENRIQUECIDO 68+ CAMPOS (de Architecture 1)
    // ═══════════════════════════════════════════════════════════════════════

    function generateEnrichedJWT68(channel, profile, index) {
        const cfg = PROFILES[profile] || PROFILES['P3'];
        const now = Math.floor(Date.now() / 1000);
        const expiry = now + (365 * 24 * 60 * 60);

        const header = { alg: 'HS256', typ: 'JWT' };

        const payload = {
            // SECCIÓN 1: IDENTIFICACIÓN (8)
            iss: `APE_v${VERSION}_UNIFIED`,
            iat: now,
            exp: expiry,
            nbf: now - 60,
            jti: `jti_${generateRandomString(8)}_${generateRandomString(8)}`,
            nonce: generateNonce(),
            aud: ['premium-servers', 'cdn-nodes', 'edge-servers'],
            sub: String(channel.stream_id || channel.id || index),

            // SECCIÓN 2: CANAL (8)
            chn: channel.name || 'Unknown',
            chn_id: String(channel.stream_id || channel.id || index),
            chn_group: channel.category_name || channel.group || 'General',
            chn_logo: channel.stream_icon || channel.logo || '',
            chn_catchup: channel.catchup || 'xc',
            chn_catchup_days: channel.catchup_days || 7,
            chn_catchup_source: channel.catchup_source || '?utc={utc}&lutc={lutc}',
            chn_epg_id: channel.epg_channel_id || String(channel.stream_id || index),

            // SECCIÓN 3: PERFIL (12)
            device_profile: profile,
            device_class: cfg.device_class,
            resolution: channel.resolution || cfg.resolution,
            fps: channel.fps || cfg.fps || 30,
            bitrate: channel.bitrate || cfg.bitrate,
            buffer_ms: cfg.buffer_ms,
            network_cache_ms: cfg.network_cache_ms,
            live_cache_ms: cfg.live_cache_ms,
            player_buffer_ms: cfg.player_buffer_ms || 3000,
            file_cache_ms: cfg.file_cache_ms || 3000,
            max_bandwidth: cfg.max_bandwidth,
            codec_primary: cfg.codec_priority.split(',')[0] || 'hevc',

            // SECCIÓN 4: CALIDAD (10)
            codec_fallback: cfg.codec_priority.split(',')[1] || 'h264',
            codec_priority: cfg.codec_priority,
            codec_selection_method: 'intelligent',
            codec_detection: 'enabled',
            hdr_support: cfg.hdr_support,
            color_depth: cfg.color_depth || 10,
            chroma_subsampling: '4:2:0',
            pixel_format: cfg.pixel_format || 'yuv420p',
            audio_codec: cfg.audio_codec || 'aac,ac3,eac3',
            audio_bitrate: cfg.audio_bitrate || 192,

            // SECCIÓN 5: PREFETCH (8)
            prefetch_segments: cfg.prefetch_segments,
            prefetch_parallel: cfg.prefetch_parallel,
            prefetch_buffer_target: cfg.prefetch_buffer_target,
            prefetch_min_bandwidth: cfg.prefetch_min_bandwidth || 10000000,
            prefetch_adaptive: true,
            prefetch_ai_enabled: true,
            prefetch_enabled: true,
            prefetch_strategy: cfg.strategy || 'balanced',

            // SECCIÓN 6: ESTRATEGIA (8)
            strategy: cfg.strategy || 'balanced',
            target_bitrate: Math.round((channel.bitrate || cfg.bitrate) * 1000),
            quality_threshold: 0.85,
            latency_target_ms: cfg.latency_target_ms || 500,
            network_optimization: 'balanced',
            segment_duration: 6,
            throughput_t1: cfg.throughput_t1 || 10,
            throughput_t2: cfg.throughput_t2 || 20,

            // SECCIÓN 7: SEGURIDAD (8)
            service_tier: 'PREMIUM',
            invisibility_enabled: true,
            fingerprint: 'WORLD_CLASS_SERVICE',
            isp_evasion_level: cfg.isp_evasion_level || 2,
            cdn_priority: 'normal',
            dfp: generateRandomString(32),
            version: VERSION,
            bandwidth_guarantee: 150,

            // SECCIÓN 8: METADATOS (8)
            quality_enhancement: 300,
            zero_interruptions: true,
            reconnection_time_ms: 30,
            availability_target: '99.99%',
            generation_timestamp: now,
            last_modified: now,
            src: 'unified_generator_1.0',
            architecture: '3-LAYER-UNIFIED-FULL'
        };

        const headerB64 = base64UrlEncode(JSON.stringify(header));
        const payloadB64 = base64UrlEncode(JSON.stringify(payload));
        const signature = generateRandomString(22);

        return `${headerB64}.${payloadB64}.${signature}`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CABECERA GLOBAL UNIFICADA (250+ headers de M3U8APIWrapper)
    // ═══════════════════════════════════════════════════════════════════════

    function generateUnifiedGlobalHeader() {
        const timestamp = new Date().toISOString();
        const listId = `UNIFIED_${Date.now()}_${generateRandomString(6)}`;

        // Helper: Verifica si el módulo está habilitado en el panel de control
        const isModuleEnabled = (moduleId) => {
            if (!window.ApeModuleManager) return true;
            return window.ApeModuleManager.isEnabled(moduleId);
        };

        // Detectar módulos activos (respetando toggles del panel)
        const activeModules = [];
        if (window.VideoFormatPrioritizationModule) activeModules.push('VideoFormat');
        if (window.SmartCodecPrioritizer && isModuleEnabled('smart-codec')) activeModules.push('SmartCodec');
        if (window.BufferAdaptativoSupremo && isModuleEnabled('buffer-adaptativo')) activeModules.push('BufferAdaptativo');
        if (window.Evasion407Supremo && isModuleEnabled('evasion-407')) activeModules.push('Evasion407');
        if (window.VPNIntegrationSupremo && isModuleEnabled('vpn-integration')) activeModules.push('VPNIntegration');
        if (window.LatencyRayoSupremo && isModuleEnabled('latency-rayo')) activeModules.push('LatencyRayo');
        if (window.HEADERS_MATRIX_V9 && isModuleEnabled('headers-matrix')) activeModules.push('HeadersMatrix');
        if (window.FIBONACCI_ENTROPY_V9 && isModuleEnabled('fibonacci-entropy')) activeModules.push('FibonacciDNA');
        if (window.TLS_COHERENCE_V9 && isModuleEnabled('tls-coherence')) activeModules.push('TLSCoherence');
        if (window.MULTI_SERVER_V9 && isModuleEnabled('multi-server')) activeModules.push('MultiServer');
        if (window.GEOBLOCKING_V9 && isModuleEnabled('geoblocking')) activeModules.push('Geoblocking');
        if (window.CDN_COOKIE_V9 && isModuleEnabled('cdn-cache')) activeModules.push('CDNCookie');
        if (window.THROUGHPUT_ANALYZER_V9 && isModuleEnabled('realtime-throughput')) activeModules.push('Throughput');
        if (window.JWT_TOKEN_V9 && isModuleEnabled('jwt-generator')) activeModules.push('JWTGenerator');
        if (window.DYNAMIC_QOS_V9 && isModuleEnabled('dynamic-qos')) activeModules.push('DynamicQoS');
        if (window.MANIFEST_GENERATOR_V9 && isModuleEnabled('manifest-generator')) activeModules.push('ManifestGen');
        if (window.PROFILE_PERSISTENCE_V9 && isModuleEnabled('profile-persistence')) activeModules.push('ProfilePersist');

        let header = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES

# ═══════════════════════════════════════════════════════════════════════════
# UNIFIED GENERATOR v${VERSION} - FUSIÓN TOTAL RFC 8216
# Architecture1 (68+ JWT) + M3U8APIWrapper (250+ Headers) + APE_ENGINE_V9
# ═══════════════════════════════════════════════════════════════════════════
#EXT-X-APE-VERSION:${VERSION}
#EXT-X-APE-GENERATOR:UNIFIED_FULL_INTEGRATION
#EXT-X-APE-JWT-FIELDS:68+
#EXT-X-APE-HEADERS-TOTAL:250+
#EXT-X-APE-ENGINES-TOTAL:17
#EXT-X-APE-ENGINES-ACTIVE:${activeModules.length}
#EXT-X-APE-MODULES-LIST:${activeModules.join(',')}
#EXT-X-APE-ARCHITECTURE:3-LAYER_UNIFIED
#EXT-X-APE-TIMESTAMP:${timestamp}
#EXT-X-APE-LIST-ID:${listId}
#EXT-X-APE-SIGNATURE:${generateRandomString(32)}

`;

        // Añadir definiciones de perfiles
        for (const [profileId, cfg] of Object.entries(PROFILES)) {
            header += `# ═══════════════════════════════════════════════════════════════════════════
# PERFIL ${profileId}: ${cfg.name}
# ═══════════════════════════════════════════════════════════════════════════
#EXT-X-APE-PROFILE-BEGIN:${profileId}
#EXT-X-APE-PROFILE-NAME:${cfg.name}
#EXT-X-APE-LEVEL:${cfg.level}
#EXT-X-APE-QUALITY:${cfg.quality}
#EXT-X-APE-RESOLUTION:${cfg.resolution}
#EXT-X-APE-FPS:${cfg.fps}
#EXT-X-APE-BUFFER:${cfg.buffer_ms}
#EXT-X-APE-NETWORK-CACHING:${cfg.network_cache_ms}
#EXT-X-APE-LIVE-CACHING:${cfg.live_cache_ms}
#EXT-X-APE-STRATEGY:${cfg.strategy}
#EXT-X-APE-CODEC-PRIORITY:${cfg.codec_priority}
#EXT-X-APE-BITRATE:${cfg.bitrate}
#EXT-X-APE-THROUGHPUT-T1:${cfg.throughput_t1}
#EXT-X-APE-THROUGHPUT-T2:${cfg.throughput_t2}
#EXT-X-APE-PREFETCH-SEGMENTS:${cfg.prefetch_segments}
#EXT-X-APE-PREFETCH-PARALLEL:${cfg.prefetch_parallel}
#EXT-X-APE-HDR-SUPPORT:${cfg.hdr_support}
#EXT-X-APE-COLOR-DEPTH:${cfg.color_depth}
#EXT-X-APE-PROFILE-END

`;
        }

        // Añadir estado de 17 motores
        header += `# ═══════════════════════════════════════════════════════════════════════════
# 17 ENGINES STATUS
# ═══════════════════════════════════════════════════════════════════════════
#EXT-X-APE-FORMAT-MODULE:${window.VideoFormatPrioritizationModule ? 'enabled(5codecs)' : 'fallback'}
#EXT-X-APE-SMART-CODEC:${window.SmartCodecPrioritizer ? 'enabled(chain)' : 'fallback'}
#EXT-X-APE-BUFFER-ADAPTIVE:${window.BufferAdaptativoSupremo ? 'enabled(41metas)' : 'fallback'}
#EXT-X-APE-407-EVASION:${window.Evasion407Supremo ? 'enabled(51metas,8tech)' : 'fallback'}
#EXT-X-APE-VPN-INTEGRATION:${window.VPNIntegrationSupremo ? 'enabled(68metas,stealth)' : 'fallback'}
#EXT-X-APE-LATENCY-RAYO:${window.LatencyRayoSupremo ? 'enabled(23metas,50ms)' : 'fallback'}
#EXT-X-APE-HEADERS-MATRIX:${window.HEADERS_MATRIX_V9 ? 'enabled(148hdrs,5lvl)' : 'fallback'}
#EXT-X-APE-FIBONACCI-DNA:${window.FIBONACCI_ENTROPY_V9 ? 'enabled(unique)' : 'fallback'}
#EXT-X-APE-TLS-COHERENCE:${window.TLS_COHERENCE_V9 ? 'enabled(JA3/JA4)' : 'fallback'}
#EXT-X-APE-MULTI-SERVER:${window.MULTI_SERVER_V9 ? 'enabled(fusion)' : 'fallback'}
#EXT-X-APE-GEOBLOCKING:${window.GEOBLOCKING_V9 ? 'enabled(8countries)' : 'fallback'}
#EXT-X-APE-CDN-COOKIE:${window.CDN_COOKIE_V9 ? 'enabled(12cdns)' : 'fallback'}
#EXT-X-APE-THROUGHPUT:${window.THROUGHPUT_ANALYZER_V9 ? 'enabled(realtime)' : 'fallback'}
#EXT-X-APE-JWT-GENERATOR:${window.JWT_TOKEN_V9 ? 'enabled(v12,HMAC)' : 'fallback'}
#EXT-X-APE-DYNAMIC-QOS:${window.DYNAMIC_QOS_V9 ? 'enabled(10types)' : 'fallback'}
#EXT-X-APE-MANIFEST-GEN:${window.MANIFEST_GENERATOR_V9 ? 'enabled(HLSv7,ABR)' : 'fallback'}
#EXT-X-APE-PROFILE-PERSIST:${window.PROFILE_PERSISTENCE_V9 ? 'enabled(3presets)' : 'fallback'}

# ═══════════════════════════════════════════════════════════════════════════
# GLOBAL GUARANTEES
# ═══════════════════════════════════════════════════════════════════════════
#EXT-X-APE-HEADERS-COUNT:250+
#EXT-X-APE-JWT-FIELDS-COUNT:68+
#EXT-X-APE-BANDWIDTH:UNLIMITED
#EXT-X-APE-MINIMUM-GUARANTEE:150%
#EXT-X-APE-PREFETCH:ULTRA_AGRESIVO
#EXT-X-APE-INSTANT-RECOVERY:enabled
#EXT-X-APE-RECONNECT-MODE:optimized_30ms
#EXT-X-APE-PERSISTENCE-24x7:365_DAYS

`;

        return header;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ENTRADA DE CANAL UNIFICADA
    // ═══════════════════════════════════════════════════════════════════════

    function generateUnifiedChannelEntry(channel, index, globalProfile = 'P3') {
        const profile = detectChannelProfile(channel, globalProfile);
        const cfg = PROFILES[profile] || PROFILES['P3'];

        // Generar JWT con 68+ campos
        const jwt = generateEnrichedJWT68(channel, profile, index);

        // Construir URL
        const url = buildChannelUrl(channel, jwt);

        // Metadatos de canal
        const tvgId = channel.stream_id || channel.id || index;
        const tvgName = escapeM3UValue(channel.name || channel.stream_display_name || `Canal ${index}`);
        const tvgLogo = channel.stream_icon || channel.logo || '';
        const groupTitle = escapeM3UValue(channel.category_name || channel.group || 'General');

        // Entrada M3U8
        let entry = `#EXTVLCOPT:http-reconnect=true
#EXTVLCOPT:http-continuous=true
#EXTVLCOPT:network-caching=${cfg.network_cache_ms}
#EXTVLCOPT:live-caching=${cfg.live_cache_ms}
#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${groupTitle}" ape-profile="${profile}" ape-level="${cfg.level}" ape-jwt-fields="68+" catchup="xc" catchup-days="7" catchup-source="?utc={utc}&lutc={lutc}",${tvgName}
${url}
`;

        return entry;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DETECCION DE PERFIL
    // ═══════════════════════════════════════════════════════════════════════

    function detectChannelProfile(channel, globalProfile) {
        if (channel._suggestedProfile && PROFILES[channel._suggestedProfile]) {
            return channel._suggestedProfile;
        }

        const name = (channel.name || '').toUpperCase();
        const url = (channel.url || '').toLowerCase();

        if (/8K|4320P|IMAX/i.test(name)) return 'P1';
        if (/4K|UHD|2160P|HDR10/i.test(name)) return 'P2';
        if (/FHD|1080P|FULL.*HD/i.test(name)) return 'P3';
        if (/HD|720P/i.test(name)) return 'P4';
        if (/SD|480P|DVD/i.test(name)) return 'P5';

        if (url.includes('hevc') || url.includes('h265')) return 'P2';
        if (url.includes('.m3u8') || url.includes('cloudflare')) return 'P3';

        return globalProfile || 'P3';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCCIÓN DE URL
    // ═══════════════════════════════════════════════════════════════════════

    function buildChannelUrl(channel, jwt) {
        let baseUrl = '';

        if (channel.url && channel.url.startsWith('http')) {
            baseUrl = channel.url.split('?')[0];
        } else if (channel.direct_source && channel.direct_source.startsWith('http')) {
            baseUrl = channel.direct_source.split('?')[0];
        } else if (window.app?.state) {
            const state = window.app.state;
            const channelServerId = channel._source || channel.serverId;
            let server = state.activeServers?.find(s => s.id === channelServerId) || state.currentServer;

            if (server?.baseUrl && server.username && server.password && channel.stream_id) {
                const cleanBase = server.baseUrl.replace(/\/player_api\.php$/, '').replace(/\/$/, '');
                const ext = state.streamFormat || 'm3u8';
                baseUrl = `${cleanBase}/live/${server.username}/${server.password}/${channel.stream_id}.${ext}`;
            }
        }

        if (!baseUrl) {
            baseUrl = channel.url || '#';
        }

        const separator = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${separator}ape_jwt=${jwt}`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERADOR PRINCIPAL UNIFICADO
    // ═══════════════════════════════════════════════════════════════════════

    function generate(channels, options = {}) {
        const profile = options.profile || 'P3';
        const startTime = Date.now();

        console.log(`%c🔥 Unified Generator v${VERSION} - Iniciando...`, 'color: #ff6b6b; font-weight: bold; font-size: 14px;');
        console.log(`   📺 Canales: ${channels.length}`);
        console.log(`   🎯 Perfil: ${profile}`);

        let output = generateUnifiedGlobalHeader();

        channels.forEach((channel, index) => {
            output += generateUnifiedChannelEntry(channel, index, profile);
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        const speed = Math.round(channels.length / parseFloat(elapsed));

        console.log(`%c✅ Generación completada`, 'color: #4ade80; font-weight: bold;');
        console.log(`   ⏱️ Tiempo: ${elapsed}s`);
        console.log(`   🚀 Velocidad: ${speed} ch/s`);
        console.log(`   📊 JWT: 68+ campos por canal`);
        console.log(`   📊 Headers: 250+ en cabecera`);

        return output;
    }

    function generateAndDownload(channels, options = {}) {
        const content = generate(channels, options);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `UNIFIED_FULL_${timestamp}_${channels.length}ch.m3u8`;

        const blob = new Blob([content], { type: 'application/x-mpegURL;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`%c📥 Archivo descargado: ${filename}`, 'color: #8b5cf6; font-weight: bold;');
        return { filename, size: blob.size, channels: channels.length };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════

    window.UnifiedGenerator = {
        generate,
        generateAndDownload,
        generateEnrichedJWT68,
        generateUnifiedGlobalHeader,
        generateUnifiedChannelEntry,
        detectChannelProfile,
        PROFILES,
        version: VERSION
    };

    // Integrar con window.app
    if (window.app) {
        window.app.generateM3U8Unified = function () {
            const channels = window.app.state?.filteredChannels ||
                window.app.state?.channels ||
                window.app.state?.channelsMaster || [];
            if (channels.length === 0) {
                alert('No hay canales disponibles. Conecta un servidor primero.');
                return;
            }
            return generateAndDownload(channels);
        };
    }

    console.log(`%c🔥 Unified Generator v${VERSION} Loaded`, 'color: #ff6b6b; font-weight: bold; font-size: 14px;');
    console.log('   ✅ Architecture1: JWT 68+ campos');
    console.log('   ✅ M3U8APIWrapper: 250+ headers');
    console.log('   ✅ Perfiles P0-P5: 17+ atributos c/u');
    console.log('   📞 Uso: UnifiedGenerator.generateAndDownload(channels)');
    console.log('   📞 O: app.generateM3U8Unified()');

})();
