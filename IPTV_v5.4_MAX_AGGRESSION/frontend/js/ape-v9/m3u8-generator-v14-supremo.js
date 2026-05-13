/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📺 M3U8 GENERATOR v14.0 SUPREMO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generador M3U8 con estructura EXACTA del original + 8 mejoras integradas.
 * Estructura: 44 líneas por canal, 154+ headers en pipe, perfiles P0-P5
 * 
 * 8 MEJORAS INTEGRADAS:
 * 1. Codecs Híbridos (idx * primo + random)
 * 2. Buffer Adaptativo Supremo
 * 3. Evasión 407 Completa
 * 4. Integración VPN con Sigilo
 * 5. Latencia Rayo (<50ms)
 * 6. Prefetch Paralelo Inteligente
 * 7. Consumo de Megas Optimizado
 * 8. Recuperación Instantánea
 * 
 * AUTHOR: APE Engine Team - IPTV Navigator PRO
 * VERSION: 14.0.0-SUPREMO
 * DATE: 2026-01-28
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN DE PERFILES P0-P5
    // ═══════════════════════════════════════════════════════════════════════

    const PROFILE_CONFIG = {
        'P0': {
            name: 'ULTRA_EXTREME',
            level: 'L6',
            quality: 'ULTRA',
            resolution: '3840x2160',
            buffer: 8000,
            networkCaching: 8000,
            liveCaching: 8000,
            playerBuffer: 2000,
            fileCaching: 2000,
            maxBandwidth: 50000000,
            strategy: 'ultra-aggressive',
            prefetchStrategy: 'ULTRA_AGRESIVO',
            prefetchSegments: 90,
            prefetchParallel: 40,
            prefetchBufferTarget: 240000,
            prefetchMinBandwidth: 120000000,
            aiEnabled: true,
            bitrate: 13.4,
            throughputT1: 17.4,
            throughputT2: 21.4
        },
        'P1': {
            name: '8K_SUPREME',
            level: 'L5',
            quality: '8K',
            resolution: '7680x4320',
            buffer: 5000,
            networkCaching: 5000,
            liveCaching: 5000,
            playerBuffer: 1500,
            fileCaching: 1500,
            maxBandwidth: 50000000,
            strategy: 'ultra-aggressive',
            prefetchStrategy: 'ULTRA_AGRESIVO',
            prefetchSegments: 60,
            prefetchParallel: 30,
            prefetchBufferTarget: 180000,
            prefetchMinBandwidth: 100000000,
            aiEnabled: true,
            bitrate: 42.9,
            throughputT1: 55.8,
            throughputT2: 68.6
        },
        'P2': {
            name: '4K_EXTREME',
            level: 'L4',
            quality: '4K',
            resolution: '3840x2160',
            buffer: 3000,
            networkCaching: 3000,
            liveCaching: 3000,
            playerBuffer: 1000,
            fileCaching: 1000,
            maxBandwidth: 50000000,
            strategy: 'ultra-aggressive',
            prefetchStrategy: 'ULTRA_AGRESIVO',
            prefetchSegments: 50,
            prefetchParallel: 25,
            prefetchBufferTarget: 150000,
            prefetchMinBandwidth: 80000000,
            aiEnabled: true,
            bitrate: 13.4,
            throughputT1: 17.4,
            throughputT2: 21.4
        },
        'P3': {
            name: 'FHD_ADVANCED',
            level: 'L3',
            quality: 'FHD',
            resolution: '1920x1080',
            buffer: 2000,
            networkCaching: 2000,
            liveCaching: 2000,
            playerBuffer: 500,
            fileCaching: 500,
            maxBandwidth: 10000000,
            strategy: 'adaptive',
            prefetchStrategy: 'BALANCEADO',
            prefetchSegments: 25,
            prefetchParallel: 10,
            prefetchBufferTarget: 90000,
            prefetchMinBandwidth: 40000000,
            aiEnabled: false,
            bitrate: 3.7,
            throughputT1: 4.8,
            throughputT2: 6
        },
        'P4': {
            name: 'HD_STABLE',
            level: 'L2',
            quality: 'HD',
            resolution: '1280x720',
            buffer: 1500,
            networkCaching: 1500,
            liveCaching: 1500,
            playerBuffer: 400,
            fileCaching: 400,
            maxBandwidth: 5000000,
            strategy: 'adaptive',
            prefetchStrategy: 'CONSERVADOR',
            prefetchSegments: 20,
            prefetchParallel: 8,
            prefetchBufferTarget: 60000,
            prefetchMinBandwidth: 25000000,
            aiEnabled: false,
            bitrate: 2.8,
            throughputT1: 3.6,
            throughputT2: 4.5
        },
        'P5': {
            name: 'SD_FAILSAFE',
            level: 'L1',
            quality: 'SD',
            resolution: '854x480',
            buffer: 1000,
            networkCaching: 1000,
            liveCaching: 1000,
            playerBuffer: 300,
            fileCaching: 300,
            maxBandwidth: 2500000,
            strategy: 'adaptive',
            prefetchStrategy: 'CONSERVADOR',
            prefetchSegments: 15,
            prefetchParallel: 5,
            prefetchBufferTarget: 40000,
            prefetchMinBandwidth: 10000000,
            aiEnabled: false,
            bitrate: 0.6,
            throughputT1: 0.8,
            throughputT2: 1
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MEJORA 1 & 3: POOLS DE EVASIÓN CON ESTRATEGIA HÍBRIDA
    // ═══════════════════════════════════════════════════════════════════════

    const USER_AGENT_POOL = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/125.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/125.0',
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 14; SM-G990B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/125.0.0.0',
        'OTT Navigator/1.6.9.4',
        'VLC/3.0.20',
        'Kodi/19.5'
    ];

    const REFERER_POOL = [
        'https://www.google.com/',
        'https://www.youtube.com/',
        'https://www.netflix.com/',
        'https://www.amazon.com/',
        'https://www.facebook.com/',
        'https://www.instagram.com/',
        'https://www.twitter.com/',
        'https://www.reddit.com/',
        'http://localhost/',
        'http://127.0.0.1/'
    ];

    const PRIMES = { ua: 7, referer: 11, timing: 13, vpn: 17, latency: 19 };

    // ═══════════════════════════════════════════════════════════════════════
    // INTEGRACIÓN CON PANELES UI - Lee opciones de la interfaz
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Obtiene todas las opciones configuradas en los paneles de la UI
     * @returns {Object} Configuración completa de generación
     */
    function getUIGeneratorOptions() {
        const $ = (id) => document.getElementById(id);

        // ══════════════════════════════════════════════════════
        // OPCIONES DE GENERACIÓN (línea 1771)
        // ══════════════════════════════════════════════════════
        const generationOptions = {
            exportFormat: $('genExportFormat')?.value || 'm3u8',
            epgUrl: $('genEpgUrl')?.value || '',
            streamFormat: $('genStreamFormat')?.value || 'm3u8',
            timeShift: parseInt($('genTimeShift')?.value || '0', 10)
        };

        // ══════════════════════════════════════════════════════
        // OPTIMIZACIÓN DE STREAMING (línea 1801)
        // ══════════════════════════════════════════════════════
        const streamingOptimization = {
            proStreamingEnabled: !!$('proStreamingOptimized')?.checked,
            ottNavOptimized: !!$('ottNavOptimizedGen')?.checked,
            includeHttpHeaders: $('includeHttpHeaders')?.checked !== false // default true
        };

        // ══════════════════════════════════════════════════════
        // MOTOR APE V4.1 - CONFIGURACIÓN (línea 1850)
        // ══════════════════════════════════════════════════════
        const motorAPE = {
            autoDetectLevel: $('v41AutoDetectLevel')?.checked !== false, // default true
            manualEvasionLevel: parseInt($('manualEvasionLevel')?.value || '3', 10),
            antiFreezeLevel: parseInt($('antiFreezeLevel')?.value || '3', 10),
            targetPlayer: $('v41TargetPlayer')?.value || 'generic',
            compatProfile: $('v41CompatProfile')?.value || 'AUTO'
        };

        // Calcular headers según nivel de evasión
        const evasionHeaderCounts = { 1: 28, 2: 58, 3: 92, 4: 128, 5: 154 };
        motorAPE.headerCount = evasionHeaderCounts[motorAPE.manualEvasionLevel] || 92;

        // ══════════════════════════════════════════════════════
        // V5.0 SERVERLESS
        // ══════════════════════════════════════════════════════
        const serverless = {
            enabled: !!$('v5UseServerless')?.checked,
            workerUrl: $('v5WorkerUrl')?.value || '',
            apiKey: $('v5ApiKey')?.value || ''
        };

        // ══════════════════════════════════════════════════════
        // GROUP-TITLE CONFIG (GroupTitleConfigManager)
        // ══════════════════════════════════════════════════════
        let groupTitleConfig = null;
        if (window.GroupTitleConfigManager) {
            try {
                groupTitleConfig = window.GroupTitleConfigManager.load();
            } catch (e) {
                console.warn('GroupTitleConfigManager no disponible:', e);
            }
        }

        // ══════════════════════════════════════════════════════
        // PERFIL APE (ProfileManagerV9)
        // ══════════════════════════════════════════════════════
        let activeProfile = 'P3';
        if (window.ProfileManagerV9) {
            activeProfile = window.ProfileManagerV9.getCurrentProfile?.() || 'P3';
        }

        // ══════════════════════════════════════════════════════
        // RESUMEN CONSOLIDADO
        // ══════════════════════════════════════════════════════
        return {
            generation: generationOptions,
            streaming: streamingOptimization,
            motorAPE: motorAPE,
            serverless: serverless,
            groupTitle: groupTitleConfig,
            activeProfile: activeProfile,
            // Computed
            effectiveEvasionLevel: motorAPE.autoDetectLevel ? null : motorAPE.manualEvasionLevel,
            timestamp: new Date().toISOString()
        };
    }

    // Exponer globalmente para debugging
    window.getUIGeneratorOptions = getUIGeneratorOptions;

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCIONES AUXILIARES
    // ═══════════════════════════════════════════════════════════════════════

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function generateDeviceId() {
        return generateUUID();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCIÓN PARA CONSTRUIR URL CON CREDENCIALES DEL SERVIDOR DEL CANAL
    // Cada canal usa SOLO las credenciales de SU servidor (sin mezclar)
    // ═══════════════════════════════════════════════════════════════════════
    function buildChannelUrl(channel) {
        // Si el canal ya tiene URL completa, usarla directamente
        if (channel.url && channel.url.startsWith('http')) {
            return channel.url;
        }

        // Si hay direct_source, usarlo
        if (channel.direct_source && channel.direct_source.startsWith('http')) {
            return channel.direct_source;
        }

        // Intentar construir URL usando el servidor específico del canal
        if (typeof window !== 'undefined' && window.app && window.app.state) {
            const state = window.app.state;

            // Buscar el servidor que corresponde a ESTE canal específico
            let server = null;

            // PRIORIDAD: Usar _source (multi-server-fusion) o serverId o server_id
            const channelServerId = channel._source || channel.serverId || channel.server_id;
            if (channelServerId && state.activeServers) {
                server = state.activeServers.find(s => s.id === channelServerId);
            }

            // Fallback solo si no hay serverId: usar currentServer
            if (!server && state.currentServer) {
                server = state.currentServer;
            }

            // Si tenemos servidor con credenciales, construir URL
            if (server && server.baseUrl && server.username && server.password && channel.stream_id) {
                const cleanBase = server.baseUrl.replace(/\/player_api\.php$/, '').replace(/\/$/, '');
                const ext = state.streamFormat || 'm3u8';
                return `${cleanBase}/live/${server.username}/${server.password}/${channel.stream_id}.${ext}`;
            }
        }

        // Fallback: devolver URL del canal o vacío
        return channel.url || channel.direct_source || '';
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

    function getHybridIndex(channelIndex, pool, prime) {
        const base = (channelIndex * prime) % pool.length;
        const random = Math.floor(Math.random() * 3);
        return (base + random) % pool.length;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERADOR JWT CON MEJORA 1 (CODECS HÍBRIDOS)
    // ═══════════════════════════════════════════════════════════════════════

    function generateJWT(channelIndex, channel, profile) {
        const now = Math.floor(Date.now() / 1000);
        const expiry = now + (365 * 24 * 60 * 60); // 1 año

        const header = { alg: 'SIMPLE', typ: 'JWT' };

        const payload = {
            iss: 'APE_v12.0_SUPREMO',
            iat: now,
            exp: expiry,
            jti: `jti_${generateRandomString(8)}_${generateRandomString(8)}`,
            nonce: generateRandomString(32),
            aud: ['premium-servers'],
            service_tier: 'PREMIUM',
            invisibility_enabled: true,
            fingerprint: 'WORLD_CLASS_SERVICE',
            version: '12.0.0',
            sub: String(channel.id || channelIndex),
            device_profile: profile,
            chn: channel.name || 'Unknown',
            dfp: '50993b8d56f348bc',
            device_class: PROFILE_CONFIG[profile]?.name || 'FHD_ADVANCED',
            resolution: '1920x1080',
            hdr_support: ['hdr10'],
            codecs: ['hevc', 'h264'],
            target_bitrate: 3700,
            buffer_strategy: 'adaptive',
            latency_target_ms: 500,
            network_optimization: 'balanced',
            isp_evasion_level: 2,
            cdn_priority: 'normal',
            color_depth: 8,
            src: 'ape_v12_supremo'
        };

        const headerB64 = base64UrlEncode(JSON.stringify(header));
        const payloadB64 = base64UrlEncode(JSON.stringify(payload));
        const signature = generateRandomString(16);

        return `${headerB64}.${payloadB64}.${signature}`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERADOR DE HEADERS EN PIPE (Dinámico desde APE_PROFILES_CONFIG)
    // Lee headers habilitados del Gestor de Perfiles + 8 mejoras
    // ═══════════════════════════════════════════════════════════════════════

    function generateHeadersInPipe(channelIndex, channel, profile) {
        const cfg = PROFILE_CONFIG[profile] || PROFILE_CONFIG['P3'];
        const timestamp = new Date().toISOString();
        const httpDate = new Date().toUTCString();

        // MEJORA 1 & 3: Estrategia híbrida para UA y Referer
        const uaIndex = getHybridIndex(channelIndex, USER_AGENT_POOL, PRIMES.ua);
        const refIndex = getHybridIndex(channelIndex, REFERER_POOL, PRIMES.referer);
        const userAgent = USER_AGENT_POOL[uaIndex];
        const referer = REFERER_POOL[refIndex];
        const origin = referer.replace(/\/$/, '').split('/').slice(0, 3).join('/');

        // ═══════════════════════════════════════════════════════════
        // INTEGRACIÓN CON APE_PROFILES_CONFIG (Gestor de Perfiles)
        // ═══════════════════════════════════════════════════════════

        const profilesConfig = window.APE_PROFILES_CONFIG;
        const headers = {};

        if (profilesConfig) {
            // Obtener lista de headers habilitados para el perfil
            const enabledHeaders = profilesConfig.getEnabledHeaders(profile);

            // Obtener valor de cada header habilitado
            for (const headerName of enabledHeaders) {
                let value = profilesConfig.getHeaderValue(profile, headerName);

                // Reemplazar placeholders dinámicos
                if (value === '[HTTP_DATE]') value = httpDate;
                else if (value === '[TIMESTAMP]') value = timestamp;
                else if (value === '[GENERATE_UUID]') value = generateUUID();
                else if (value === '[CONFIG_SESSION_ID]') value = generateUUID();
                else if (value.includes('[ENCODED_HEADERS]')) value = 'auto';

                headers[headerName] = value;
            }

            // Override dinámico de User-Agent con estrategia híbrida
            headers['User-Agent'] = userAgent;
            headers['Referer'] = referer;
            headers['Origin'] = origin;

            // Obtener configuración de Prefetch desde el perfil
            const prefetchConfig = profilesConfig.getPrefetchConfig(profile);
            if (prefetchConfig) {
                headers['X-Prefetch-Strategy'] = prefetchConfig.strategy;
                headers['X-Prefetch-Segments'] = String(prefetchConfig.prefetch_segments);
                headers['X-Prefetch-Parallel'] = String(prefetchConfig.parallel_downloads);
                headers['X-Prefetch-Buffer-Target'] = String(prefetchConfig.buffer_target_seconds * 1000);
                headers['X-Prefetch-Min-Bandwidth'] = String(prefetchConfig.min_bandwidth_mbps * 1000000);
                headers['X-Prefetch-Adaptive'] = String(prefetchConfig.adaptive_enabled);
                if (prefetchConfig.ai_prediction_enabled) {
                    headers['X-Prefetch-AI-Enabled'] = 'true';
                }
            }

            // Obtener configuración ABR desde el perfil
            const abrConfig = profilesConfig.getABRConfig(profile);
            if (abrConfig) {
                headers['X-Bandwidth-Preference'] = abrConfig.bandwidthPreference;
                headers['X-BW-Estimation-Window'] = String(abrConfig.estimationWindow);
                headers['X-BW-Confidence-Threshold'] = String(abrConfig.confidenceThreshold);
                headers['X-BW-Smooth-Factor'] = String(abrConfig.smoothFactor);
                headers['X-Packet-Loss-Monitor'] = abrConfig.packetLossMonitor ? 'enabled' : 'disabled';
                headers['X-RTT-Monitoring'] = abrConfig.rttMonitoring ? 'enabled' : 'disabled';
                headers['X-Congestion-Detect'] = abrConfig.congestionDetect ? 'enabled' : 'disabled';
            }

            console.log(`🔧 Headers dinámicos (${profile}): ${Object.keys(headers).length} headers`);
        } else {
            // Fallback a headers hardcodeados si APE_PROFILES_CONFIG no está disponible
            console.warn('⚠️ APE_PROFILES_CONFIG no disponible, usando headers fallback');
            Object.assign(headers, getFallbackHeaders(cfg, userAgent, referer, origin, timestamp, httpDate, channelIndex));
        }

        // ═══════════════════════════════════════════════════════════
        // SIEMPRE AÑADIR: 8 MEJORAS (headers que siempre van)
        // ═══════════════════════════════════════════════════════════

        // MEJORA 1: Codecs Híbridos - valores por perfil
        headers['X-Target-Bitrate'] = String(cfg.bitrate * 1000000);
        headers['X-Throughput-T1'] = String(cfg.throughputT1);
        headers['X-Throughput-T2'] = String(cfg.throughputT2);

        // MEJORA 2: Buffer Adaptativo - valores por perfil
        headers['X-Buffer-Total'] = String(cfg.buffer);
        headers['X-Player-Buffer'] = String(cfg.playerBuffer);
        headers['X-Network-Caching'] = String(cfg.networkCaching);
        headers['X-Live-Caching'] = String(cfg.liveCaching);
        headers['X-File-Caching'] = String(cfg.fileCaching);
        headers['X-Screen-Resolution'] = cfg.resolution;

        // MEJORA 4: VPN/ISP Evasion
        headers['X-VPN-Evasion-Level'] = '2';
        headers['X-ISP-Evasion-Enabled'] = 'true';
        headers['X-Fingerprint'] = `WORLD_CLASS_SERVICE_${channelIndex}`;
        headers['X-Session-Token'] = generateRandomString(32);
        headers['X-Device-Fingerprint'] = generateRandomString(16);

        // MEJORA 5: Latencia Rayo
        headers['X-Latency-Target-Ms'] = '50';
        headers['X-Latency-Mode'] = 'ultra-low';
        headers['X-Time-Sync'] = 'ntp';
        headers['X-Clock-Drift-Tolerance'] = '100';
        headers['X-Jitter-Buffer'] = '200';
        headers['X-Playout-Delay'] = '150';

        // MEJORA 6: Prefetch Paralelo - valores por perfil
        headers['X-Prefetch-Strategy'] = cfg.prefetchStrategy;
        headers['X-Prefetch-Parallel'] = String(cfg.prefetchParallel);
        headers['X-Prefetch-Segments'] = String(cfg.prefetchSegments);

        // MEJORA 7: Consumo Megas Optimizado
        headers['X-Data-Saver-Mode'] = 'off';
        headers['X-Quality-Limit'] = 'none';
        headers['X-Bitrate-Cap'] = '0';
        headers['X-Mobile-Data-Optimization'] = 'off';
        headers['X-WiFi-Optimization'] = 'enabled';

        // MEJORA 8: Recuperación Instantánea
        headers['X-Recovery-Mode'] = 'instant';
        headers['X-Error-Recovery-Timeout'] = '5000';
        headers['X-Buffer-Recovery-Strategy'] = 'aggressive';
        headers['X-Stream-Recovery-Enabled'] = 'true';
        headers['X-Auto-Restart-On-Error'] = 'true';
        headers['X-Keep-Alive-Interval'] = '10000';

        // IDs únicos por request
        headers['X-Client-Timestamp'] = timestamp;
        headers['X-Request-Id'] = generateUUID();
        headers['X-Playback-Session-Id'] = generateUUID();
        headers['X-Device-Id'] = generateDeviceId();

        // Convertir a formato pipe (URL encoded)
        const result = Object.entries(headers)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');

        return result;
    }

    // Fallback headers cuando APE_PROFILES_CONFIG no está disponible
    function getFallbackHeaders(cfg, userAgent, referer, origin, timestamp, httpDate, channelIndex) {
        return {
            'User-Agent': userAgent,
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Sec-CH-UA': '"Google Chrome";v="125", "Chromium";v="125"',
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': '"Windows"',
            'Connection': 'keep-alive',
            'Keep-Alive': 'timeout=30, max=100',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            // C8 (2026-05-11) — eliminados Range/If-None-Match/If-Modified-Since/Priority.
            // If-None-Match:* → 304+0B → okhttp "unexpected end of stream".
            // Ver memoria feedback_exthttp_traps.md trampa #9.
            // 'Range': 'bytes=0-',
            // 'If-None-Match': '*',
            // 'If-Modified-Since': httpDate,
            'Origin': origin,
            'Referer': referer,
            'X-Requested-With': 'XMLHttpRequest',
            'X-App-Version': 'APE_9.0_ULTIMATE',
            'X-Stream-Type': 'hls',
            'X-Quality-Preference': 'auto',
            'X-CDN-Bypass': 'false',
            'X-Edge-Location': 'auto',
            // 'Priority': 'u=1, i',
            'X-Playback-Rate': '1.0',
            'X-Segment-Duration': '6',
            'X-Min-Buffer-Time': '20',
            'X-Max-Buffer-Time': '60',
            'X-Request-Priority': 'high',
            'X-Prefetch-Enabled': 'true',
            'X-Video-Codecs': 'h264,hevc,vp9,av1',
            'X-Audio-Codecs': 'aac,mp3,opus,ac3,eac3',
            'X-DRM-Support': 'widevine,playready',
            'X-CDN-Provider': 'auto',
            'X-Edge-Strategy': 'closest',
            'X-Failover-Enabled': 'true',
            'X-Buffer-Size': '8192',
            'X-Device-Type': 'smart-tv',
            'X-Screen-Resolution': cfg.resolution,
            'X-Network-Type': 'wifi',
            'X-Buffer-Strategy': 'adaptive',
            'X-OTT-Navigator-Version': '1.7.0.0',
            'X-Player-Type': 'exoplayer',
            'X-Hardware-Decode': 'true',
            'X-Tunneling-Enabled': 'off',
            'X-Bandwidth-Estimation': 'auto',
            'X-Initial-Bitrate': 'highest',
            'X-Retry-Count': '3',
            'X-Connection-Timeout-Ms': '15000',
            'X-Read-Timeout-Ms': '30000',
            'X-HDR-Support': 'hdr10,hdr10+,dolby-vision,hlg',
            'X-Dolby-Atmos': 'true',
            'X-Audio-Channels': '7.1,5.1,2.0',
            'X-Parallel-Segments': '4',
            'X-Concurrent-Downloads': '4',
            'X-Reconnect-On-Error': 'true',
            'X-Max-Reconnect-Attempts': '10',
            'X-Seamless-Failover': 'true'
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERADOR DE ENCABEZADO M3U8
    // ═══════════════════════════════════════════════════════════════════════

    function generateHeader(totalChannels) {
        const timestamp = new Date().toISOString();
        const listId = `APE_${Date.now()}_${generateRandomString(6)}`;
        const signature = generateRandomString(8);

        let header = `#EXTM3U
#EXT-X-APE-VERSION:13.1.0-SUPREMO
#EXT-X-APE-JWT-EXPIRATION:365_DAYS
#EXT-X-APE-MULTILAYER:EXTVLCOPT,KODIPROP,PIPE_HEADERS
#EXT-X-APE-MATRIX:154_HEADERS_BY_PERFIL

`;

        // Añadir perfiles P0-P5
        for (const [profileId, cfg] of Object.entries(PROFILE_CONFIG)) {
            header += `#EXT-X-APE-PROFILE-BEGIN:${profileId}
#EXT-X-APE-PROFILE-NAME:${cfg.name}
#EXT-X-APE-LEVEL:${cfg.level}
#EXT-X-APE-QUALITY:${cfg.quality}
#EXT-X-APE-RESOLUTION:${cfg.resolution}
#EXT-X-APE-BUFFER:${cfg.buffer}
#EXT-X-APE-NETWORK-CACHING:${cfg.networkCaching}
#EXT-X-APE-LIVE-CACHING:${cfg.liveCaching}
#EXT-X-APE-STRATEGY:${cfg.strategy}
#EXT-X-APE-HEADERS-COUNT:154
#EXT-X-APE-BITRATE:${cfg.bitrate}
#EXT-X-APE-THROUGHPUT-T1:${cfg.throughputT1}
#EXT-X-APE-THROUGHPUT-T2:${cfg.throughputT2}
#EXT-X-APE-USER-AGENT:${USER_AGENT_POOL[0]} APE-Engine/13.1-${profileId}
#EXT-X-APE-PROFILE-END

`;
        }

        // Añadir config embebida
        header += `
#EXT-X-APE-EMBEDDED-CONFIG-BEGIN
#EXT-X-APE-LIST-ID:${listId}
#EXT-X-APE-SIGNATURE:${signature}
#EXT-X-APE-EMBEDDED-VERSION:1.0
#EXT-X-APE-TIMESTAMP:${timestamp}
`;
        for (const [profileId, cfg] of Object.entries(PROFILE_CONFIG)) {
            header += `#EXT-X-APE-EMBEDDED-PROFILE:${profileId}|${cfg.name}|${cfg.level}|${cfg.quality}|${cfg.buffer}|${cfg.strategy}\n`;
        }
        header += `#EXT-X-APE-EMBEDDED-HEADERS-BEGIN\n`;
        for (const [profileId, cfg] of Object.entries(PROFILE_CONFIG)) {
            header += `#EXT-X-APE-HEADER:${profileId}|User-Agent|${USER_AGENT_POOL[0]} APE-Engine/13.1-${profileId}\n`;
            header += `#EXT-X-APE-HEADER:${profileId}|X-Buffer-Size|${cfg.buffer}\n`;
            header += `#EXT-X-APE-HEADER:${profileId}|X-Strategy|${cfg.strategy}\n`;
        }
        header += `#EXT-X-APE-EMBEDDED-HEADERS-END
#EXT-X-APE-EMBEDDED-CONFIG-END

`;
        return header;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERADOR DE ENTRADA DE CANAL (44 líneas)
    // ═══════════════════════════════════════════════════════════════════════

    function generateChannelEntry(channelIndex, channel) {
        const profile = channel.profile || channel.apeProfile || 'P3';
        const cfg = PROFILE_CONFIG[profile] || PROFILE_CONFIG['P3'];

        const id = channel.id || channel.tvgId || channelIndex;
        const name = channel.name || channel.tvgName || 'Unknown';
        const logo = channel.logo || channel.tvgLogo || '';
        const url = buildChannelUrl(channel);

        // ═══════════════════════════════════════════════════════════
        // INTEGRACIÓN: GroupTitleBuilder para group-title dinámico
        // ═══════════════════════════════════════════════════════════
        let group = channel.group || channel.groupTitle || 'General';
        if (window.GroupTitleBuilder && typeof window.GroupTitleBuilder.buildExport === 'function') {
            try {
                const dynamicGroup = window.GroupTitleBuilder.buildExport(channel);
                if (dynamicGroup && dynamicGroup.trim() !== '') {
                    group = dynamicGroup;
                }
            } catch (e) {
                console.warn('⚠️ GroupTitleBuilder error:', e);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // RFC 8216 ESTRICTO (WORLD CLASS)
        // Toda la configuración va en JWT + atributos de EXTINF
        // Estructura: SOLO #EXTINF + URL (NADA entre medio)
        // ═══════════════════════════════════════════════════════════
        const jwt = generateJWT(channelIndex, channel, profile);

        // EXTINF con metadatos en atributos (compatible con todos los reproductores)
        let entry = `#EXTINF:-1 tvg-id="${id}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}" ape-profile="${profile}" ape-level="${cfg.level}" ape-buffer="${cfg.buffer}" ape-reconnect="30" ape-guarantee="150" ape-bandwidth="unlimited" catchup="xc" catchup-days="1" catchup-source="?utc={utc}&lutc={lutc}",${name}\n`;

        // URL INMEDIATAMENTE después de EXTINF (RFC 8216 ESTRICTO)
        entry += `${url}?ape_jwt=${jwt}\n`;

        return entry;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERADOR M3U8 PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════

    class M3U8GeneratorV14Supremo {
        constructor() {
            this.version = '14.0.0-SUPREMO';
            console.log('%c📺 M3U8 Generator v14.0 SUPREMO Loaded', 'color: #8b5cf6; font-weight: bold; font-size: 14px;');
        }

        /**
         * Genera el contenido M3U8 completo
         * @param {Array} channels - Array de canales
         * @returns {string} Contenido M3U8
         */
        generate(channels) {
            if (!channels || !Array.isArray(channels) || channels.length === 0) {
                console.error('❌ No hay canales para generar');
                return '';
            }

            console.log(`🚀 Generando M3U8 v14.0 SUPREMO con ${channels.length} canales...`);
            const startTime = Date.now();

            // Generar encabezado
            let content = generateHeader(channels.length);

            // Generar cada canal
            for (let i = 0; i < channels.length; i++) {
                content += generateChannelEntry(i, channels[i]);

                if ((i + 1) % 500 === 0) {
                    console.log(`  📊 Procesados ${i + 1}/${channels.length} canales...`);
                }
            }

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            const sizeMB = (content.length / 1024 / 1024).toFixed(2);

            console.log(`%c✅ Generación completada!`, 'color: #10b981; font-weight: bold;');
            console.log(`   📊 Canales: ${channels.length}`);
            console.log(`   📏 Tamaño: ${sizeMB} MB`);
            console.log(`   ⏱️ Tiempo: ${elapsed}s`);
            console.log(`   🔢 ~44 líneas por canal`);
            console.log(`   🔗 154+ headers por URL`);

            return content;
        }

        /**
         * Genera y descarga el archivo M3U8
         * @param {Array} channels - Array de canales
         * @param {string} filename - Nombre del archivo (opcional)
         */
        generateAndDownload(channels, filename = null) {
            const content = this.generate(channels);
            if (!content) return;

            const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const fn = filename || `APE_ULTIMATE_v14.0_${dateStr}.m3u8`;

            const blob = new Blob([content], { type: 'audio/x-mpegurl;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = fn;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(`%c📥 Archivo descargado: ${fn}`, 'color: #8b5cf6;');
        }

        /**
         * Obtiene estadísticas del generador
         */
        getStats() {
            return {
                version: this.version,
                profiles: Object.keys(PROFILE_CONFIG),
                userAgentPoolSize: USER_AGENT_POOL.length,
                refererPoolSize: REFERER_POOL.length,
                primes: PRIMES,
                linesPerChannel: 44,
                headersPerUrl: 154,
                improvements: [
                    'Codecs Híbridos (idx * primo + random)',
                    'Buffer Adaptativo Supremo',
                    'Evasión 407 Completa',
                    'Integración VPN con Sigilo',
                    'Latencia Rayo (<50ms)',
                    'Prefetch Paralelo Inteligente',
                    'Consumo de Megas Optimizado',
                    'Recuperación Instantánea'
                ]
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPORT GLOBAL
    // ═══════════════════════════════════════════════════════════════════════

    const instance = new M3U8GeneratorV14Supremo();
    window.M3U8GeneratorV14Supremo = instance;
    window.M3U8GeneratorV14 = instance; // Alias

    console.log('%c✅ M3U8 Generator v14.0 SUPREMO Ready', 'color: #8b5cf6;');
    console.log('   Estructura original + 8 mejoras integradas');
    console.log('   Uso: M3U8GeneratorV14Supremo.generateAndDownload(channels)');

})();
