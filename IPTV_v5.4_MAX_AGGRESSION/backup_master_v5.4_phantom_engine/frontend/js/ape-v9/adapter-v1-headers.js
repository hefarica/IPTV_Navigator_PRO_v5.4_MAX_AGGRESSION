/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎚️ ADAPTER v1 HEADERS - Proveedor de Estrategia de Headers
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PROPÓSITO: Gestionar la selección de headers HTTP según nivel de optimización
 * para alimentar al núcleo v16.0 WORLD CLASS.
 * 
 * FUNCIONALIDADES EXTRAÍDAS DE ultra-headers-matrix.js y m3u8-ultra-generator.js:
 * - ULTRA_HEADERS_MATRIX (33 headers × 5 niveles)
 * - Rotación de User-Agent/Referer
 * - Generadores dinámicos por canal/servidor
 * 
 * ARQUITECTURA: Este adaptador NO genera M3U8. Solo provee headers.
 * 
 * @version 1.0.0
 * @date 2026-01-29
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '1.0.0-ADAPTER';

    // ═══════════════════════════════════════════════════════════════
    // 🔄 POOLS DE ROTACIÓN
    // ═══════════════════════════════════════════════════════════════

    const USER_AGENT_POOL = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'ExoPlayer/2.19.1 (Linux; Android 13)',
        'Kodi/20.2 (Windows NT 10.0; Win64; x64)',
        'OTT Navigator/1.6.9.4',
        'TiviMate/4.5.0 (Android 13)',
        'VLC/3.0.20 LibVLC/3.0.20',
        'Lavf/60.3.100',
        'IPTV Smarters Pro/3.1.5'
    ];

    const REFERER_POOL = [
        'https://www.google.com/',
        'https://www.youtube.com/',
        'https://www.netflix.com/',
        'https://www.amazon.com/',
        'https://www.facebook.com/',
        'https://www.instagram.com/',
        'https://www.twitch.tv/',
        'https://www.reddit.com/'
    ];

    // ═══════════════════════════════════════════════════════════════
    // 🎯 ESTRATEGIAS POR NIVEL
    // ═══════════════════════════════════════════════════════════════

    const LEVEL_STRATEGIES = {
        1: {
            name: 'NORMAL',
            description: 'Compatibilidad esencial - Headers básicos',
            headerCount: 7,
            headers: ['User-Agent', 'Accept', 'Accept-Language', 'Connection']
        },
        2: {
            name: 'PRO',
            description: 'Evasión CORS básica - Referer/Origin críticos',
            headerCount: 12,
            headers: ['User-Agent', 'Accept', 'Accept-Language', 'Connection', 'Referer', 'Origin', 'Cache-Control']
        },
        3: {
            name: 'ADVANCED',
            description: 'Suplantación de dispositivo - User-Agent específico',
            headerCount: 18,
            headers: ['User-Agent', 'Accept', 'Accept-Language', 'Connection', 'Referer', 'Origin', 'Cache-Control', 'Accept-Encoding', 'Keep-Alive', 'X-Requested-With']
        },
        4: {
            name: 'EXTREME',
            description: 'Ecosistema moderno - Client Hints requeridos',
            headerCount: 28,
            headers: ['User-Agent', 'Accept', 'Accept-Language', 'Connection', 'Referer', 'Origin', 'Cache-Control', 'Accept-Encoding', 'Keep-Alive', 'X-Requested-With', 'Sec-CH-UA', 'Sec-CH-UA-Mobile', 'Sec-CH-UA-Platform', 'Sec-Fetch-Dest', 'Sec-Fetch-Mode', 'Sec-Fetch-Site']
        },
        5: {
            name: 'ULTRA',
            description: 'Evasión CDN agresiva - Rotación completa',
            headerCount: 33,
            headers: 'ALL'
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // 🔧 GENERADORES DINÁMICOS
    // ═══════════════════════════════════════════════════════════════

    function getRotatingUserAgent(index = 0) {
        // Rotación determinista basada en índice para consistencia
        return USER_AGENT_POOL[index % USER_AGENT_POOL.length];
    }

    function getRandomUserAgent() {
        return USER_AGENT_POOL[Math.floor(Math.random() * USER_AGENT_POOL.length)];
    }

    function getRotatingReferer(index = 0) {
        return REFERER_POOL[index % REFERER_POOL.length];
    }

    function getRandomReferer() {
        return REFERER_POOL[Math.floor(Math.random() * REFERER_POOL.length)];
    }

    function generateRandomIP() {
        return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
    }

    function generateSessionId() {
        return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2)}`;
    }

    function generateRequestId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎯 OBTENER ESTRATEGIA DE HEADERS POR NIVEL
    // ═══════════════════════════════════════════════════════════════

    function getHeaderStrategy(level, channel = {}, server = {}, index = 0) {
        const effectiveLevel = Math.min(Math.max(level || 3, 1), 5);
        const strategy = LEVEL_STRATEGIES[effectiveLevel];

        // Headers base siempre presentes
        const headers = {
            'User-Agent': effectiveLevel >= 4 ? getRandomUserAgent() : getRotatingUserAgent(index),
            'Accept': '*/*',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Connection': 'keep-alive'
        };

        // Nivel 2+: CORS headers
        if (effectiveLevel >= 2) {
            if (server.baseUrl) {
                try {
                    const url = new URL(server.baseUrl);
                    headers['Referer'] = url.origin + '/';
                    headers['Origin'] = url.origin;
                } catch (e) {
                    headers['Referer'] = getRotatingReferer(index);
                }
            } else {
                headers['Referer'] = getRotatingReferer(index);
            }
            headers['Cache-Control'] = 'no-cache';
        }

        // Nivel 3+: Headers avanzados
        if (effectiveLevel >= 3) {
            headers['Accept-Encoding'] = 'gzip, deflate, br';
            headers['Keep-Alive'] = 'timeout=60, max=500';
            headers['X-Requested-With'] = 'XMLHttpRequest';
            headers['Pragma'] = 'no-cache';
        }

        // Nivel 4+: Client Hints (críticos para evadir fingerprinting)
        if (effectiveLevel >= 4) {
            headers['Sec-CH-UA'] = '"Not/A)Brand";v="99", "Google Chrome";v="125", "Chromium";v="125"';
            headers['Sec-CH-UA-Mobile'] = '?0';
            headers['Sec-CH-UA-Platform'] = '"Windows"';
            headers['Sec-Fetch-Dest'] = 'video';
            headers['Sec-Fetch-Mode'] = 'cors';
            headers['Sec-Fetch-Site'] = 'cross-site';
        }

        // Nivel 5: Headers agresivos de evasión
        if (effectiveLevel >= 5) {
            headers['X-Forwarded-For'] = generateRandomIP();
            headers['X-Real-IP'] = generateRandomIP();
            headers['X-Playback-Session-Id'] = generateSessionId();
            headers['X-Request-ID'] = generateRequestId();
            headers['DNT'] = '1';
            headers['X-Buffer-Size'] = '16777216';
            headers['X-Quality-Preference'] = 'max';
            headers['X-Device-Type'] = ['stb', 'smarttv', 'android-player'][Math.floor(Math.random() * 3)];
            headers['X-Platform'] = ['android-tv', 'firetv', 'webos', 'tizen'][Math.floor(Math.random() * 4)];
        }

        return {
            level: effectiveLevel,
            levelName: strategy.name,
            description: strategy.description,
            headerCount: Object.keys(headers).length,
            headers,
            pools: {
                userAgentPoolSize: USER_AGENT_POOL.length,
                refererPoolSize: REFERER_POOL.length
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // 📊 OBTENER HEADERS PARA BATCH DE CANALES
    // ═══════════════════════════════════════════════════════════════

    function getHeadersForChannels(channels, level, server = {}) {
        return channels.map((channel, index) => ({
            channelId: channel.stream_id || channel.id || index,
            channelName: channel.name || `Canal ${index}`,
            headers: getHeaderStrategy(level, channel, server, index).headers
        }));
    }

    // ═══════════════════════════════════════════════════════════════
    // 📋 OBTENER INFORMACIÓN DE NIVELES
    // ═══════════════════════════════════════════════════════════════

    function getLevelInfo(level) {
        return LEVEL_STRATEGIES[level] || LEVEL_STRATEGIES[3];
    }

    function getAllLevels() {
        return Object.entries(LEVEL_STRATEGIES).map(([level, config]) => ({
            level: parseInt(level),
            ...config
        }));
    }

    // ═══════════════════════════════════════════════════════════════
    // 📊 ESTADÍSTICAS
    // ═══════════════════════════════════════════════════════════════

    function getStats() {
        return {
            version: VERSION,
            totalLevels: 5,
            userAgentPoolSize: USER_AGENT_POOL.length,
            refererPoolSize: REFERER_POOL.length,
            maxHeaderCount: 33,
            levels: getAllLevels()
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════

    window.AdapterV1 = {
        // Funciones principales
        getHeaderStrategy,
        getHeadersForChannels,

        // Información de niveles
        getLevelInfo,
        getAllLevels,

        // Generadores individuales
        getRotatingUserAgent,
        getRandomUserAgent,
        getRotatingReferer,
        getRandomReferer,
        generateSessionId,
        generateRequestId,

        // Estadísticas
        getStats,

        // Pools (para referencia)
        USER_AGENT_POOL,
        REFERER_POOL,

        version: VERSION
    };

    console.log(`%c🎚️ Adapter v1 Headers v${VERSION} Loaded`, 'color: #f59e0b; font-weight: bold;');
    console.log('   ✅ getHeaderStrategy(level) → Headers por nivel');
    console.log('   ✅ getHeadersForChannels(channels, level) → Batch');
    console.log(`   📊 Pools: ${USER_AGENT_POOL.length} User-Agents, ${REFERER_POOL.length} Referers`);

})();
