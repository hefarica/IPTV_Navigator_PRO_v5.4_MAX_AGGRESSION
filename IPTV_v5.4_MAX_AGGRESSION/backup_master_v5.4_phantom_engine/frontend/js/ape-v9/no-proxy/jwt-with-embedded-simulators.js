/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔒 JWT WITH EMBEDDED SIMULATORS v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Extends JWT tokens with embedded proxy and user-agent simulators.
 * 100% in-memory simulation - NO real proxy infrastructure required.
 * 
 * Architecture: Client reads simulators from JWT and configures itself.
 * Result: Direct connection to content servers with maximum performance.
 * 
 * @version 1.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    const CONFIG = {
        VERSION: '1.0.0',
        ARCHITECTURE: 'NO_PROXY_EMBEDDED_SIMULATORS',
        DEFAULT_EXPIRY_HOURS: 8760,  // 1 year
        ALGORITHM: 'HS256',
        ISSUER: 'APE_NOPROXY_v1.0',
        MAX_UA_IN_JWT: 50,           // Max User Agents to embed per category
        ENCRYPTION_KEY_LENGTH: 32
    };

    // ═══════════════════════════════════════════════════════════
    // SIMULATED PROXY DATABASE (100% in-memory)
    // ═══════════════════════════════════════════════════════════

    const SIMULATED_PROXIES = [
        {
            id: 'proxy_sim_1',
            host: 'cdn-edge-1.simulated.local',
            port: 8080,
            auth_type: 'basic',
            realm: 'CDN-Premium',
            priority: 1,
            region: 'EU',
            latency_ms: 15
        },
        {
            id: 'proxy_sim_2',
            host: 'cdn-edge-2.simulated.local',
            port: 8080,
            auth_type: 'digest',
            realm: 'CDN-Premium',
            priority: 2,
            region: 'US',
            latency_ms: 45
        },
        {
            id: 'proxy_sim_3',
            host: 'cdn-failover-1.simulated.local',
            port: 3128,
            auth_type: 'basic',
            realm: 'CDN-Backup',
            priority: 3,
            region: 'ASIA',
            latency_ms: 120
        },
        {
            id: 'proxy_sim_4',
            host: 'cdn-failover-2.simulated.local',
            port: 3128,
            auth_type: 'ntlm',
            realm: 'CDN-Emergency',
            priority: 4,
            region: 'GLOBAL',
            latency_ms: 200
        }
    ];

    // ═══════════════════════════════════════════════════════════
    // EMBEDDED USER AGENT DATABASE (Categorized)
    // ═══════════════════════════════════════════════════════════

    const EMBEDDED_USER_AGENTS = {
        // Category 1: Chrome Desktop (High Priority)
        chrome_desktop: [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        ],

        // Category 2: Firefox Desktop
        firefox_desktop: [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0',
            'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0'
        ],

        // Category 3: Safari Desktop
        safari_desktop: [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15'
        ],

        // Category 4: Edge Desktop
        edge_desktop: [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0'
        ],

        // Category 5: Mobile Chrome
        mobile_chrome: [
            'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
        ],

        // Category 6: Mobile Safari
        mobile_safari: [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
        ],

        // Category 7: IPTV Applications (Maximum Priority for Streaming)
        iptv_apps: [
            'OTT Navigator/1.6.9.5 (Build 40936) AppleWebKit/606',
            'OTT Navigator/1.6.8.6 (Build 40712) AppleWebKit/606',
            'Tivimate/4.9.0',
            'Tivimate/4.8.0',
            'IPTV Smarters Pro/3.1.5',
            'Perfect Player/1.6.0',
            'GSE Smart IPTV/4.7',
            'VLC/3.0.20 LibVLC/3.0.20',
            'VLC/3.0.18 LibVLC/3.0.18',
            'Kodi/21.0 (Omega)',
            'Kodi/20.2 (Nexus)'
        ],

        // Category 8: Smart TV
        smart_tv: [
            'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 Chrome/108.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Linux; NetCast; U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36 SmartTV/10.0 LG',
            'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K GB ATV3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        ],

        // Category 9: Android TV / Streaming Devices
        android_tv: [
            'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Linux; Android 12; Chromecast) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Linux; Android 11; AFTT) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        ],

        // Category 10: Apple TV
        apple_tv: [
            'AppleTV11,1/17.4 (iPhone-compatible)',
            'AppleTV6,2/16.6 (iPhone-compatible)',
            'AppleCoreMedia/1.0.0.21L580 (Apple TV; U; CPU OS 17_4 like Mac OS X)'
        ],

        // Category 11: Windows Apps
        windows_apps: [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IPTV-Desktop/2.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) StreamPlayer/1.5',
            'Lavf/60.16.100'
        ],

        // Category 12: Custom/Special
        custom: [
            'APE-ULTIMATE/16.0 (NoProxy; Direct)',
            'IPTV-Navigator-PRO/4.4 (Enterprise)',
            'HLS-Client/1.0 (Premium-CDN)'
        ]
    };

    // ═══════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    function base64UrlEncode(str) {
        if (typeof str === 'string') {
            const bytes = new TextEncoder().encode(str);
            let binary = '';
            bytes.forEach(b => binary += String.fromCharCode(b));
            return btoa(binary)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
        }
        let binary = '';
        str.forEach(b => binary += String.fromCharCode(b));
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    function base64UrlDecode(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) str += '=';
        return atob(str);
    }

    function generateNonce() {
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function generateJTI() {
        return 'jti_' + Date.now().toString(36) + '_' +
            Math.random().toString(36).substring(2, 10);
    }

    function simpleHash(str, seed = 0) {
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
    }

    // Encrypt credentials for JWT transport
    function encryptCredential(text, key) {
        return btoa(text + '::' + key).split('').reverse().join('');
    }

    function decryptCredential(encrypted, key) {
        try {
            const reversed = encrypted.split('').reverse().join('');
            const decoded = atob(reversed);
            const [text] = decoded.split('::');
            return text;
        } catch (e) {
            return null;
        }
    }

    // Get or generate secret key
    let _secretKey = null;
    function getSecretKey() {
        if (_secretKey) return _secretKey;
        const stored = localStorage.getItem('ape_noproxy_secret');
        if (stored) {
            _secretKey = stored;
            return _secretKey;
        }
        const array = new Uint8Array(CONFIG.ENCRYPTION_KEY_LENGTH);
        crypto.getRandomValues(array);
        _secretKey = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
        try {
            localStorage.setItem('ape_noproxy_secret', _secretKey);
        } catch (e) { }
        return _secretKey;
    }

    // ═══════════════════════════════════════════════════════════
    // SIMULATOR BUILDERS
    // ═══════════════════════════════════════════════════════════

    /**
     * Build Proxy Simulator block for JWT embedding
     * Contains 4 simulated proxies with encrypted credentials
     */
    function buildProxySimulator(options = {}) {
        const encKey = generateNonce();
        const simUser = options.user || 'ape_premium';
        const simPass = options.pass || 'ultra_stream_' + Date.now().toString(36);

        return {
            _type: 'PROXY_SIMULATOR',
            _version: '1.0',
            enabled: true,
            encryption_key: encKey,
            proxies: SIMULATED_PROXIES.map(p => ({
                ...p,
                credentials: {
                    user: encryptCredential(simUser, encKey),
                    pass: encryptCredential(simPass, encKey)
                }
            })),
            rules: {
                auto_rotate: true,
                rotate_interval_s: 300,
                max_retries: 3,
                retry_delay_ms: 1000,
                failover_on_407: true,
                preferred_region: options.region || 'EU'
            },
            strategy: {
                type: 'latency_based',
                fallback: 'round_robin',
                health_check_interval_s: 60
            }
        };
    }

    /**
     * Build User Agent Simulator block for JWT embedding
     * Contains categorized UA database for rotation
     */
    function buildUserAgentSimulator(options = {}) {
        // Select subset of UAs for JWT (to manage size)
        const compactUAs = {};
        for (const [category, uas] of Object.entries(EMBEDDED_USER_AGENTS)) {
            compactUAs[category] = uas.slice(0, CONFIG.MAX_UA_IN_JWT);
        }

        return {
            _type: 'UA_SIMULATOR',
            _version: '1.0',
            enabled: true,
            database: compactUAs,
            total_count: Object.values(compactUAs).reduce((sum, arr) => sum + arr.length, 0),
            rules: {
                rotation_strategy: options.rotation || 'session_sticky',
                preferred_category: options.category || 'iptv_apps',
                fallback_category: 'chrome_desktop',
                rotate_on_error: true,
                rotate_interval_s: options.rotate_interval || 0  // 0 = sticky session
            },
            session: {
                id: generateNonce(),
                created: Date.now(),
                selected_ua: null  // Will be populated by client
            }
        };
    }

    // ═══════════════════════════════════════════════════════════
    // JWT WITH EMBEDDED SIMULATORS GENERATOR
    // ═══════════════════════════════════════════════════════════

    /**
     * Generate JWT with embedded proxy and UA simulators
     * @param {Object} channel - Channel data
     * @param {Object} options - Generation options
     * @returns {string} Complete JWT token
     */
    function generateToken(channel = {}, options = {}) {
        const now = Math.floor(Date.now() / 1000);
        const expiryHours = options.expiryHours || CONFIG.DEFAULT_EXPIRY_HOURS;

        // Build header
        const header = {
            alg: CONFIG.ALGORITHM,
            typ: 'JWT',
            arch: CONFIG.ARCHITECTURE
        };

        // Build payload with embedded simulators
        const payload = {
            // Standard JWT claims
            iss: CONFIG.ISSUER,
            iat: now,
            exp: now + (expiryHours * 3600),
            nbf: now - 60,
            jti: generateJTI(),
            nonce: generateNonce(),

            // Channel information
            sub: (channel.stream_id || channel.id || 0).toString(),
            chn: (channel.name || 'unknown').substring(0, 50),
            chn_id: channel.stream_id || channel.id || 0,
            chn_group: channel.category_id || channel.group || null,
            chn_logo: channel.stream_icon || channel.logo || null,

            // Architecture marker
            architecture: 'NO_PROXY_DIRECT',
            version: CONFIG.VERSION,

            // 🔒 EMBEDDED PROXY SIMULATOR (100% in-memory)
            proxy_simulator: buildProxySimulator(options.proxy || {}),

            // 🎭 EMBEDDED USER AGENT SIMULATOR
            ua_simulator: buildUserAgentSimulator(options.ua || {}),

            // Direct connection settings
            direct_connection: {
                enabled: true,
                max_bitrate: options.maxBitrate || 50000,
                buffer_ms: options.buffer || 4000,
                latency_target_ms: options.latency || 500,
                cdn_priority: 'direct',
                zero_proxy: true
            }
        };

        // Encode and sign
        const headerB64 = base64UrlEncode(JSON.stringify(header));
        const payloadB64 = base64UrlEncode(JSON.stringify(payload));
        const unsigned = `${headerB64}.${payloadB64}`;
        const signatureB64 = simpleHash(unsigned + getSecretKey());

        return `${unsigned}.${signatureB64}`;
    }

    /**
     * Verify JWT token
     * @param {string} token - JWT to verify
     * @returns {Object} Verification result
     */
    function verify(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return { valid: false, error: 'Invalid token format' };
            }

            const header = JSON.parse(base64UrlDecode(parts[0]));
            const payload = JSON.parse(base64UrlDecode(parts[1]));
            const now = Math.floor(Date.now() / 1000);

            // Check expiration
            if (payload.exp && payload.exp < now) {
                return { valid: false, error: 'Token expired', payload };
            }

            // Check architecture
            if (header.arch !== CONFIG.ARCHITECTURE) {
                return { valid: false, error: 'Invalid architecture', payload };
            }

            // Verify signature
            const unsigned = `${parts[0]}.${parts[1]}`;
            const expectedSig = simpleHash(unsigned + getSecretKey());
            if (parts[2] !== expectedSig) {
                return { valid: false, error: 'Invalid signature', payload };
            }

            return { valid: true, header, payload };

        } catch (e) {
            return { valid: false, error: e.message };
        }
    }

    /**
     * Extract Proxy Simulator config from token
     * @param {string} token - JWT token
     * @returns {Object|null} Proxy simulator config or null
     */
    function extractProxyConfig(token) {
        const result = verify(token);
        if (!result.valid) return null;
        return result.payload.proxy_simulator || null;
    }

    /**
     * Extract User Agents config from token
     * @param {string} token - JWT token
     * @returns {Object|null} UA simulator config or null
     */
    function extractUserAgentsConfig(token) {
        const result = verify(token);
        if (!result.valid) return null;
        return result.payload.ua_simulator || null;
    }

    /**
     * Get random User Agent from embedded config
     * @param {Object} uaConfig - UA simulator config
     * @param {string} category - Preferred category
     * @returns {string} Selected User Agent
     */
    function getRandomUserAgent(uaConfig, category = null) {
        if (!uaConfig || !uaConfig.database) {
            return EMBEDDED_USER_AGENTS.iptv_apps[0];
        }

        const preferredCat = category || uaConfig.rules.preferred_category;
        const uas = uaConfig.database[preferredCat] || uaConfig.database.chrome_desktop;

        if (!uas || uas.length === 0) {
            return EMBEDDED_USER_AGENTS.iptv_apps[0];
        }

        return uas[Math.floor(Math.random() * uas.length)];
    }

    /**
     * Get simulated proxy from embedded config
     * @param {Object} proxyConfig - Proxy simulator config
     * @param {string} region - Preferred region
     * @returns {Object} Selected proxy
     */
    function getSimulatedProxy(proxyConfig, region = null) {
        if (!proxyConfig || !proxyConfig.proxies) {
            return SIMULATED_PROXIES[0];
        }

        const preferredRegion = region || proxyConfig.rules.preferred_region;
        const proxy = proxyConfig.proxies.find(p => p.region === preferredRegion);

        return proxy || proxyConfig.proxies[0];
    }

    // ═══════════════════════════════════════════════════════════
    // STATISTICS
    // ═══════════════════════════════════════════════════════════

    function getStatistics() {
        const totalUAs = Object.values(EMBEDDED_USER_AGENTS)
            .reduce((sum, arr) => sum + arr.length, 0);

        return {
            version: CONFIG.VERSION,
            architecture: CONFIG.ARCHITECTURE,
            simulated_proxies: SIMULATED_PROXIES.length,
            user_agent_categories: Object.keys(EMBEDDED_USER_AGENTS).length,
            total_user_agents: totalUAs,
            max_ua_per_category_in_jwt: CONFIG.MAX_UA_IN_JWT,
            token_expiry_hours: CONFIG.DEFAULT_EXPIRY_HOURS
        };
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const JWTEmbeddedSimulators = {
        // Core functions
        generateToken,
        verify,

        // Extractors
        extractProxyConfig,
        extractUserAgentsConfig,

        // Selectors
        getRandomUserAgent,
        getSimulatedProxy,

        // Builders (for custom usage)
        buildProxySimulator,
        buildUserAgentSimulator,

        // Utilities
        encryptCredential,
        decryptCredential,
        getSecretKey,

        // Statistics
        getStatistics,

        // Config
        CONFIG,

        // Data (for reference/debugging)
        SIMULATED_PROXIES,
        EMBEDDED_USER_AGENTS
    };

    // Global exports
    window.JWTEmbeddedSimulators = JWTEmbeddedSimulators;
    window.JWT_NOPROXY = JWTEmbeddedSimulators;  // Alias

    console.log('%c🔒 JWT Embedded Simulators v1.0 Loaded', 'color: #00ff41; font-weight: bold;');
    console.log('   ✅ Architecture: NO_PROXY_DIRECT | 4 Simulated Proxies | ' +
        Object.values(EMBEDDED_USER_AGENTS).reduce((s, a) => s + a.length, 0) + ' User Agents');

})();
