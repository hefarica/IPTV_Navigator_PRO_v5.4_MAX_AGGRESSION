/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎭 EVASION 407 SUPREMO v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Sistema de evasión del error 407 con teatralidad y ofuscación supremas.
 * 51 metadatos por canal organizados en 6 grupos + 8 técnicas de evasión.
 * 
 * GRUPOS DE METADATOS:
 * - GRUPO 1: Evasión de Detección (8 tags)
 * - GRUPO 2: Ofuscación de Headers (10 tags)
 * - GRUPO 3: Ofuscación de URL (9 tags)
 * - GRUPO 4: Gestión de Timing (8 tags)
 * - GRUPO 5: Detección y Recuperación (9 tags)
 * - GRUPO 6: Monitoreo y Logging (7 tags)
 * 
 * TÉCNICAS DE EVASIÓN:
 * 1. Invisibilidad de Headers
 * 2. Rotación de User-Agent
 * 3. Ofuscación de IP
 * 4. Manipulación de Conexión
 * 5. Ofuscación de Referer
 * 6. Ofuscación de Cookies
 * 7. Timing y Velocidad
 * 8. Headers Dinámicos
 * 
 * TOTAL: 51 metadatos por canal
 * 
 * AUTHOR: APE Engine Team - IPTV Navigator PRO
 * VERSION: 1.0.0
 * DATE: 2026-01-28
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // POOLS DE OFUSCACIÓN
    // ═══════════════════════════════════════════════════════════════════════

    const USER_AGENT_POOL = [
        // Chrome Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        // Firefox Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        // Safari macOS
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        // Edge Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        // Chrome Android
        'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        // VLC
        'VLC/3.0.18 LibVLC/3.0.18',
        // Kodi
        'Kodi/20.0 (Windows; U; Windows NT 10.0; en_US) UPnP/1.0 Kodi/20.0',
        // Smart TV LG
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager',
        // Smart TV Samsung
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/76.0.3809.146 TV Safari/537.36',
        // Chrome macOS
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    const REFERER_POOL = [
        'https://www.google.com/',
        'https://www.youtube.com/',
        'https://www.facebook.com/',
        'https://www.twitch.tv/',
        'https://www.netflix.com/',
        'https://www.primevideo.com/',
        'https://www.reddit.com/',
        'https://www.wikipedia.org/',
        'https://www.instagram.com/',
        'https://www.twitter.com/'
    ];

    const LANGUAGE_POOL = [
        'es-ES,es;q=0.9',
        'es-MX,es;q=0.9,en;q=0.8',
        'es-AR,es;q=0.9,en;q=0.8',
        'en-US,en;q=0.9',
        'en-GB,en;q=0.9',
        'fr-FR,fr;q=0.9,en;q=0.8',
        'de-DE,de;q=0.9,en;q=0.8',
        'pt-BR,pt;q=0.9,en;q=0.8',
        'it-IT,it;q=0.9,en;q=0.8'
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // EVASION 407 SUPREMO CLASS
    // ═══════════════════════════════════════════════════════════════════════

    class Evasion407Supremo {
        constructor() {
            this.rotationIndex = 0;
            console.log('%c🎭 Evasion 407 Supremo v1.0.0 Loaded', 'color: #ef4444; font-weight: bold;');
        }

        /**
         * Get rotating User-Agent from pool
         * @returns {string} User-Agent string
         */
        getRotatingUserAgent() {
            const ua = USER_AGENT_POOL[this.rotationIndex % USER_AGENT_POOL.length];
            return ua;
        }

        /**
         * Get rotating Referer from pool
         * @returns {string} Referer URL
         */
        getRotatingReferer() {
            const ref = REFERER_POOL[this.rotationIndex % REFERER_POOL.length];
            return ref;
        }

        /**
         * Get rotating Language from pool
         * @returns {string} Accept-Language value
         */
        getRotatingLanguage() {
            const lang = LANGUAGE_POOL[this.rotationIndex % LANGUAGE_POOL.length];
            return lang;
        }

        /**
         * Increment rotation index for next channel
         */
        incrementRotation() {
            this.rotationIndex++;
        }

        /**
         * Generate all 51 metadata tags for a channel
         * @param {number} channelIndex - Index of channel for rotation
         * @returns {string} Multi-line string with all 51 EXT-X-APE-407-* tags
         */
        generateAllMetadata(channelIndex = 0) {
            // ═══════════════════════════════════════════════════════════
            // ESTRATEGIA HÍBRIDA: idx * primo + random
            // Variación determinística por canal + aleatoriedad por solicitud
            // ═══════════════════════════════════════════════════════════
            const PRIME_UA = 7;
            const PRIME_REF = 11;
            const PRIME_LANG = 13;

            // Base determinística (por canal)
            const baseUA = (channelIndex * PRIME_UA) % USER_AGENT_POOL.length;
            const baseRef = (channelIndex * PRIME_REF) % REFERER_POOL.length;
            const baseLang = (channelIndex * PRIME_LANG) % LANGUAGE_POOL.length;

            // Variación aleatoria (por solicitud)
            const randomUA = Math.floor(Math.random() * 3);  // ±0,1,2
            const randomRef = Math.floor(Math.random() * 2); // ±0,1
            const randomLang = Math.floor(Math.random() * 2); // ±0,1

            // Combinación híbrida
            this.rotationIndex = (baseUA + randomUA) % USER_AGENT_POOL.length;
            this.refererIndex = (baseRef + randomRef) % REFERER_POOL.length;
            this.languageIndex = (baseLang + randomLang) % LANGUAGE_POOL.length;

            const tags = [];

            // ═══════════════════════════════════════════════════════════
            // GRUPO 1: EVASIÓN DE DETECCIÓN (8 metadatos)
            // ═══════════════════════════════════════════════════════════
            tags.push(`#EXT-X-APE-407-EVASION-ENABLED:true`);
            tags.push(`#EXT-X-APE-407-DETECTION-BYPASS:enabled`);
            tags.push(`#EXT-X-APE-407-HEADER-OBFUSCATION:supremo`);
            tags.push(`#EXT-X-APE-407-USER-AGENT-ROTATION:enabled`);
            tags.push(`#EXT-X-APE-407-REFERER-ROTATION:enabled`);
            tags.push(`#EXT-X-APE-407-COOKIE-MANAGEMENT:enabled`);
            tags.push(`#EXT-X-APE-407-TIMING-JITTER:enabled`);
            tags.push(`#EXT-X-APE-407-IDENTITY-ROTATION:enabled`);

            // ═══════════════════════════════════════════════════════════
            // GRUPO 2: OFUSCACIÓN DE HEADERS (10 metadatos)
            // ═══════════════════════════════════════════════════════════
            tags.push(`#EXT-X-APE-407-HEADER-POOL-SIZE:50`);
            tags.push(`#EXT-X-APE-407-HEADER-ROTATION-INTERVAL:5`);
            tags.push(`#EXT-X-APE-407-USER-AGENT-POOL:chrome,firefox,safari,edge,vlc,kodi,smarttv`);
            tags.push(`#EXT-X-APE-407-REFERER-POOL:google,youtube,facebook,twitch,netflix,hulu,reddit`);
            tags.push(`#EXT-X-APE-407-LANGUAGE-POOL:es-ES,es-MX,es-AR,en-US,en-GB,fr-FR,de-DE`);
            tags.push(`#EXT-X-APE-407-ACCEPT-ENCODING:gzip,deflate,br`);
            tags.push(`#EXT-X-APE-407-CONNECTION-TYPE:keep-alive`);
            tags.push(`#EXT-X-APE-407-DNT-ENABLED:true`);
            tags.push(`#EXT-X-APE-407-SEC-FETCH-ENABLED:true`);
            tags.push(`#EXT-X-APE-407-COOKIE-PERSISTENCE:enabled`);

            // ═══════════════════════════════════════════════════════════
            // GRUPO 3: OFUSCACIÓN DE URL (9 metadatos)
            // ═══════════════════════════════════════════════════════════
            tags.push(`#EXT-X-APE-407-URL-OBFUSCATION-LEVEL:3`);
            tags.push(`#EXT-X-APE-407-URL-PARAMETER-INJECTION:enabled`);
            tags.push(`#EXT-X-APE-407-URL-TIMESTAMP-INJECTION:enabled`);
            tags.push(`#EXT-X-APE-407-URL-REFERER-INJECTION:enabled`);
            tags.push(`#EXT-X-APE-407-URL-UA-HASH-INJECTION:enabled`);
            tags.push(`#EXT-X-APE-407-URL-NOISE-INJECTION:enabled`);
            tags.push(`#EXT-X-APE-407-TOKEN-OBFUSCATION-LEVEL:3`);
            tags.push(`#EXT-X-APE-407-TOKEN-METADATA-INJECTION:enabled`);
            tags.push(`#EXT-X-APE-407-TOKEN-ENCODING:base64`);

            // ═══════════════════════════════════════════════════════════
            // GRUPO 4: GESTIÓN DE TIMING (8 metadatos)
            // ═══════════════════════════════════════════════════════════
            tags.push(`#EXT-X-APE-407-TIMING-JITTER-MIN:50`);
            tags.push(`#EXT-X-APE-407-TIMING-JITTER-MAX:500`);
            tags.push(`#EXT-X-APE-407-REQUEST-DELAY-MIN:500`);
            tags.push(`#EXT-X-APE-407-REQUEST-DELAY-MAX:2000`);
            tags.push(`#EXT-X-APE-407-CONNECTION-POOL-SIZE:5`);
            tags.push(`#EXT-X-APE-407-CONNECTION-ROTATION-INTERVAL:10`);
            tags.push(`#EXT-X-APE-407-SESSION-TIMEOUT:3600`);
            tags.push(`#EXT-X-APE-407-RECONNECT-STRATEGY:progressive`);

            // ═══════════════════════════════════════════════════════════
            // GRUPO 5: DETECCIÓN Y RECUPERACIÓN (9 metadatos)
            // ═══════════════════════════════════════════════════════════
            tags.push(`#EXT-X-APE-407-DETECTION-ENABLED:true`);
            tags.push(`#EXT-X-APE-407-DETECTION-TIMEOUT:500`);
            tags.push(`#EXT-X-APE-407-RECOVERY-STRATEGY:aggressive`);
            tags.push(`#EXT-X-APE-407-RECOVERY-RETRY-ATTEMPTS:5`);
            tags.push(`#EXT-X-APE-407-RECOVERY-RETRY-DELAY:1000`);
            tags.push(`#EXT-X-APE-407-RECOVERY-IDENTITY-CHANGE:enabled`);
            tags.push(`#EXT-X-APE-407-RECOVERY-HEADER-RESET:enabled`);
            tags.push(`#EXT-X-APE-407-RECOVERY-COOKIE-CLEAR:enabled`);
            tags.push(`#EXT-X-APE-407-FALLBACK-STRATEGY:alternative-header-set`);

            // ═══════════════════════════════════════════════════════════
            // GRUPO 6: MONITOREO Y LOGGING (7 metadatos)
            // ═══════════════════════════════════════════════════════════
            tags.push(`#EXT-X-APE-407-MONITORING-ENABLED:true`);
            tags.push(`#EXT-X-APE-407-MONITORING-INTERVAL:1000`);
            tags.push(`#EXT-X-APE-407-LOGGING-ENABLED:false`);
            tags.push(`#EXT-X-APE-407-ERROR-REPORTING:disabled`);
            tags.push(`#EXT-X-APE-407-TELEMETRY-ENABLED:false`);
            tags.push(`#EXT-X-APE-407-DEBUG-MODE:disabled`);
            tags.push(`#EXT-X-APE-407-STEALTH-MODE:enabled`);

            return tags.join('\n');
        }

        /**
         * Build theatrical headers for URL injection
         * @param {number} channelIndex - Index for rotation
         * @returns {string} Pipe-separated headers for URL
         */
        buildTheatricalHeaders(channelIndex = 0) {
            this.rotationIndex = channelIndex;

            const ua = this.getRotatingUserAgent();
            const ref = this.getRotatingReferer();
            const lang = this.getRotatingLanguage();

            const headers = [
                `User-Agent=${encodeURIComponent(ua)}`,
                `Accept=*/*`,
                `Accept-Language=${encodeURIComponent(lang)}`,
                `Accept-Encoding=gzip, deflate, br`,
                `Connection=keep-alive`,
                `Sec-Fetch-Dest=video`,
                `Sec-Fetch-Mode=cors`,
                `Sec-Fetch-Site=cross-site`,
                `Referer=${encodeURIComponent(ref)}`,
                `Origin=${encodeURIComponent(ref.replace(/\/$/, ''))}`,
                `DNT=1`,
                `Cache-Control=no-cache`,
                `Pragma=no-cache`
            ];

            return headers.join('&');
        }

        /**
         * Build obfuscated URL parameters
         * @param {number} channelIndex - Index for rotation
         * @returns {string} URL parameters to inject
         */
        buildObfuscatedParams(channelIndex = 0) {
            const ts = Date.now();
            const ref = REFERER_POOL[channelIndex % REFERER_POOL.length].split('.')[1] || 'google';
            const ua = ['chrome', 'firefox', 'safari', 'edge', 'vlc', 'kodi'][channelIndex % 6];
            const noise = Math.random().toString(36).substring(2, 8);

            return `ts=${ts}&ref=${ref}&ua=${ua}&v=${noise}`;
        }

        /**
         * Get statistics about the evasion system
         * @returns {object} Stats
         */
        getStats() {
            return {
                version: '1.0.0',
                metadataGroups: 6,
                metadataTotal: 51,
                evasionTechniques: 8,
                userAgentPoolSize: USER_AGENT_POOL.length,
                refererPoolSize: REFERER_POOL.length,
                languagePoolSize: LANGUAGE_POOL.length,
                currentRotationIndex: this.rotationIndex
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GLOBAL EXPORT
    // ═══════════════════════════════════════════════════════════════════════

    const instance = new Evasion407Supremo();
    window.Evasion407Supremo = instance;
    window.USER_AGENT_POOL = USER_AGENT_POOL;
    window.REFERER_POOL = REFERER_POOL;

    console.log('%c✅ Evasion 407 Supremo Ready', 'color: #ef4444;');
    console.log(`   51 metadatos por canal | 8 técnicas de evasión | Pools: UA=${USER_AGENT_POOL.length}, Ref=${REFERER_POOL.length}`);

})();
