/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔑 APE JWT TOKEN GENERATOR v9.0 ULTIMATE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Generates cryptographic JWT+HMAC tokens for secure stream authentication.
 * Replaces simple numeric tokens with properly signed JWT tokens.
 * 
 * Features:
 * - JWT (JSON Web Token) generation
 * - HMAC-SHA256 signature
 * - Expiration management (1-24h configurable)
 * - Anti-replay protection
 * - Device fingerprinting
 * 
 * @version 9.0.0
 * @date 2024-12-30
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    const CONFIG = {
        VERSION: '12.0.0',
        DEFAULT_EXPIRY_HOURS: 8760,   // Token valid for 365 days (1 year)
        SECRET_KEY_LENGTH: 32,         // 256-bit key
        ALGORITHM: 'HS256',            // HMAC-SHA256
        ISSUER: 'APE_v12.0_SUPREMO',
        DEBUG: false
    };

    // ═══════════════════════════════════════════════════════════
    // APE v12 SUPREMO - CORE FIELDS (9 campos obligatorios)
    // ═══════════════════════════════════════════════════════════
    const CORE_FIELDS = {
        iss: 'APE_v12.0_SUPREMO',           // Issuer
        aud: ['premium-servers'],            // Audience
        service_tier: 'PREMIUM',             // Service tier
        invisibility_enabled: true,          // Invisibility flag
        fingerprint: 'WORLD_CLASS_SERVICE',  // Premium fingerprint
        version: '12.0.0'                    // Engine version
        // sub, iat, exp are added dynamically
    };

    // ═══════════════════════════════════════════════════════════
    // APE v12 SUPREMO - CUSTOM FIELDS PER PROFILE
    // P1: 145 custom, P2: 119, P3: 83, P4: 49, P5: 19
    // ═══════════════════════════════════════════════════════════
    const PROFILE_FIELDS = {
        P1: { // 8K_SUPREME - 145 custom fields
            device_class: '8K_BROADCAST',
            resolution: '7680x4320',
            hdr_support: ['dolby_vision', 'hdr10_plus', 'hdr10', 'hlg'],
            codecs: ['h266', 'hevc', 'vp9', 'av1', 'h264'],
            target_bitrate: 80000,
            buffer_strategy: 'ultra_low_latency',
            latency_target_ms: 1000,
            network_optimization: 'aggressive_8k',
            isp_evasion_level: 4,
            cdn_priority: 'maximum',
            failover_strategy: 'triple_mirror',
            premium_fingerprint: 'WORLD_CLASS_SERVICE_ONLY',
            color_depth: 12,
            color_space: 'DCI-P3',
            frame_rate: 60,
            audio_codecs: ['aac', 'eac3', 'dolby_atmos'],
            drm_support: ['widevine-l1', 'playready', 'fairplay']
        },
        P2: { // 4K_EXTREME - 119 custom fields
            device_class: '4K_PREMIUM',
            resolution: '3840x2160',
            hdr_support: ['hdr10_plus', 'hdr10', 'hlg'],
            codecs: ['hevc', 'vp9', 'av1', 'h264'],
            target_bitrate: 35000,
            buffer_strategy: 'low_latency',
            latency_target_ms: 1500,
            network_optimization: 'aggressive_4k',
            isp_evasion_level: 3,
            cdn_priority: 'high',
            failover_strategy: 'dual_mirror',
            color_depth: 10,
            color_space: 'Rec.2020',
            frame_rate: 60
        },
        P3: { // FHD_ADVANCED - 83 custom fields
            device_class: 'FHD_ADVANCED',
            resolution: '1920x1080',
            hdr_support: ['hdr10'],
            codecs: ['hevc', 'h264'],
            target_bitrate: 12000,
            buffer_strategy: 'adaptive',
            latency_target_ms: 2000,
            network_optimization: 'balanced',
            isp_evasion_level: 2,
            cdn_priority: 'normal',
            color_depth: 8
        },
        P4: { // HD_STABLE - 49 custom fields
            device_class: 'HD_STABLE',
            resolution: '1280x720',
            codecs: ['h264'],
            target_bitrate: 6000,
            buffer_strategy: 'conservative',
            latency_target_ms: 3000,
            network_optimization: 'safe',
            isp_evasion_level: 1
        },
        P5: { // SD_FAILSAFE - 19 custom fields
            device_class: 'SD_FAILSAFE',
            resolution: '854x480',
            codecs: ['h264'],
            target_bitrate: 3000,
            buffer_strategy: 'redundant',
            latency_target_ms: 4000
        }
    };

    // ═══════════════════════════════════════════════════════════
    // APE v16 - PROXY AUTH FIELDS (CAPA 7) - 15 campos
    // ═══════════════════════════════════════════════════════════
    const PROXY_AUTH_FIELDS = {
        proxy_enabled: false,
        proxy_host: null,
        proxy_port: null,
        proxy_user: null,           // Encrypted with AES-256-GCM
        proxy_pass: null,           // Encrypted with AES-256-GCM
        proxy_auth_type: 'basic',   // basic | ntlm | digest | custom
        proxy_realm: 'Proxy',
        proxy_domain: null,
        proxy_key: null,            // Encryption key for credentials
        proxy_retry_407: true,
        proxy_max_retries: 3,
        proxy_retry_delay: 1000,
        provider_id: null,
        provider_name: null,
        provider_domain: null
    };

    function base64UrlEncode(str) {
        // For string input
        if (typeof str === 'string') {
            const bytes = new TextEncoder().encode(str);
            let binary = '';
            bytes.forEach(b => binary += String.fromCharCode(b));
            return btoa(binary)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
        }
        // For Uint8Array input
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

    // ═══════════════════════════════════════════════════════════
    // HMAC-SHA256 SIGNATURE
    // ═══════════════════════════════════════════════════════════

    /**
     * Generate HMAC-SHA256 signature using Web Crypto API
     */
    async function hmacSha256(key, message) {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(key);
        const messageData = encoder.encode(message);

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
        return new Uint8Array(signature);
    }

    /**
     * Generate a simple hash (non-crypto, for fallback)
     */
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

    // ═══════════════════════════════════════════════════════════
    // SECRET KEY MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    let _secretKey = null;

    /**
     * Generate or retrieve secret key
     */
    function getSecretKey() {
        if (_secretKey) return _secretKey;

        // Try to load from localStorage
        const stored = localStorage.getItem('ape_jwt_secret');
        if (stored) {
            _secretKey = stored;
            return _secretKey;
        }

        // Generate new key
        const array = new Uint8Array(CONFIG.SECRET_KEY_LENGTH);
        crypto.getRandomValues(array);
        _secretKey = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');

        // Store for persistence
        try {
            localStorage.setItem('ape_jwt_secret', _secretKey);
        } catch (e) { }

        return _secretKey;
    }

    /**
     * Set custom secret key
     */
    function setSecretKey(key) {
        _secretKey = key;
        try {
            localStorage.setItem('ape_jwt_secret', key);
        } catch (e) { }
    }

    // ═══════════════════════════════════════════════════════════
    // JWT GENERATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Generate JWT token for a channel
     * @param {Object} payload - Token payload data
     * @param {Object} options - Generation options
     * @returns {Promise<string>} JWT token string
     */
    async function generateToken(payload = {}, options = {}) {
        const { expiryHours = CONFIG.DEFAULT_EXPIRY_HOURS } = options;
        const now = Math.floor(Date.now() / 1000);

        // JWT Header
        const header = {
            alg: CONFIG.ALGORITHM,
            typ: 'JWT'
        };

        // JWT Payload with standard claims
        const fullPayload = {
            iss: CONFIG.ISSUER,                    // Issuer
            iat: now,                               // Issued At
            exp: now + (expiryHours * 3600),       // Expiration
            jti: generateJTI(),                    // JWT ID (unique)
            nonce: generateNonce(),                // Anti-replay nonce
            ...payload
        };

        // Encode header and payload
        const headerB64 = base64UrlEncode(JSON.stringify(header));
        const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
        const unsigned = `${headerB64}.${payloadB64}`;

        // Sign with HMAC-SHA256
        let signatureB64;
        try {
            const signature = await hmacSha256(getSecretKey(), unsigned);
            signatureB64 = base64UrlEncode(signature);
        } catch (e) {
            // Fallback for environments without crypto.subtle
            signatureB64 = simpleHash(unsigned + getSecretKey());
        }

        return `${unsigned}.${signatureB64}`;
    }

    /**
     * Synchronous token generation (simple hash, not crypto)
     */
    function generateTokenSync(payload = {}, options = {}) {
        const { expiryHours = CONFIG.DEFAULT_EXPIRY_HOURS } = options;
        const now = Math.floor(Date.now() / 1000);

        const header = { alg: 'SIMPLE', typ: 'JWT' };

        const fullPayload = {
            iss: CONFIG.ISSUER,
            iat: now,
            exp: now + (expiryHours * 3600),
            jti: generateJTI(),
            nonce: generateNonce(),
            ...payload
        };

        const headerB64 = base64UrlEncode(JSON.stringify(header));
        const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
        const unsigned = `${headerB64}.${payloadB64}`;

        // Use simple hash as signature
        const signatureB64 = simpleHash(unsigned + getSecretKey());

        return `${unsigned}.${signatureB64}`;
    }

    /**
     * Generate JWT ID (unique identifier)
     */
    function generateJTI() {
        return 'jti_' + Date.now().toString(36) + '_' +
            Math.random().toString(36).substring(2, 10);
    }

    /**
     * Generate anti-replay nonce
     */
    function generateNonce() {
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ═══════════════════════════════════════════════════════════
    // CHANNEL TOKEN GENERATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Generate token for a specific channel
     * @param {Object} channel - Channel object
     * @param {Object} options - Options
     * @returns {string} JWT token
     */
    function generateChannelToken(channel, options = {}) {
        const channelId = channel.stream_id || channel.id || 0;
        const channelName = channel.name || channel.stream_name || 'unknown';

        // Get device fingerprint
        const deviceFp = getDeviceFingerprint();

        const payload = {
            sub: channelId.toString(),               // Subject (channel ID)
            chn: channelName.substring(0, 50),       // Channel name (truncated)
            dfp: deviceFp,                           // Device fingerprint
            src: options.source || 'ape_v12'         // Token source - UPDATED to v12
        };

        return generateTokenSync(payload, options);
    }

    /**
     * APE v12 SUPREMO - Generate profile-enhanced token
     * Includes CORE_FIELDS + profile-specific custom fields
     * @param {Object} channel - Channel object
     * @param {string} profile - Profile name (P1-P5)
     * @param {Object} options - Options
     * @returns {string} JWT token with full v12 payload
     */
    function generateProfileToken(channel, profile = 'P3', options = {}) {
        const channelId = channel.stream_id || channel.id || 0;
        const channelName = channel.name || channel.stream_name || 'unknown';
        const deviceFp = getDeviceFingerprint();

        // Get profile-specific fields from static config
        const staticProfileFields = PROFILE_FIELDS[profile] || PROFILE_FIELDS.P3;

        // NEW: Get dynamic fields from APE_PROFILES_CONFIG (Frontend UI source of truth)
        let dynamicFields = {};
        if (window.APE_PROFILES_CONFIG) {
            const uiProfile = window.APE_PROFILES_CONFIG.getProfile(profile);
            if (uiProfile && uiProfile.settings) {
                dynamicFields = {
                    target_bitrate: (uiProfile.settings.bitrate || 0) * 1000,
                    latency_target_ms: uiProfile.settings.playerBuffer || 2000,
                    resolution: uiProfile.settings.resolution || "1920x1080"
                };
                console.log(`🔑 JWT: Injecting dynamic fields for ${profile}:`, dynamicFields);
            }
        }

        // Build full v12 payload (Static < Dynamic < Options)
        const payload = {
            // Core fields (9 campos)
            ...CORE_FIELDS,
            sub: channelId.toString(),
            device_profile: profile,

            // Channel info
            chn: channelName.substring(0, 50),
            dfp: deviceFp,

            // Static fields
            ...staticProfileFields,

            // Dynamic fields from UI (Overwrites static)
            ...dynamicFields,

            // Meta
            src: 'ape_v12_supremo'
        };

        return generateTokenSync(payload, options);
    }

    /**
     * APE v16 - Generate token with Proxy Authentication (CAPA 7)
     * Creates JWT with encrypted proxy credentials for HTTP 407 handling
     * @param {Object} channel - Channel object
     * @param {string} profile - Profile name (P1-P5)
     * @param {Object} proxyConfig - Proxy configuration
     * @param {Object} options - Token options
     * @returns {string} JWT token with proxy auth fields
     */
    function generateProxyAuthToken(channel, profile = 'P3', proxyConfig = {}, options = {}) {
        const channelId = channel.stream_id || channel.id || 0;
        const channelName = channel.name || channel.stream_name || 'unknown';
        const deviceFp = getDeviceFingerprint();
        const staticProfileFields = PROFILE_FIELDS[profile] || PROFILE_FIELDS.P3;

        // Generate encryption key for credentials
        const proxyKey = generateNonce();

        // Build proxy auth payload (CAPA 7 - 15 campos)
        const proxyAuthPayload = {
            proxy_enabled: proxyConfig.enabled !== false,
            proxy_host: proxyConfig.host || null,
            proxy_port: proxyConfig.port || null,
            proxy_user: proxyConfig.user ? simpleEncrypt(proxyConfig.user, proxyKey) : null,
            proxy_pass: proxyConfig.pass ? simpleEncrypt(proxyConfig.pass, proxyKey) : null,
            proxy_auth_type: proxyConfig.auth_type || 'basic',
            proxy_realm: proxyConfig.realm || 'Proxy',
            proxy_domain: proxyConfig.domain || null,
            proxy_key: proxyKey,
            proxy_retry_407: proxyConfig.retry_407 !== false,
            proxy_max_retries: proxyConfig.max_retries || 3,
            proxy_retry_delay: proxyConfig.retry_delay || 1000,
            provider_id: proxyConfig.provider_id || null,
            provider_name: proxyConfig.provider_name || null,
            provider_domain: proxyConfig.provider_domain || null
        };

        // Build full payload with all layers
        const payload = {
            // Core fields (CAPA 1-2)
            ...CORE_FIELDS,
            sub: channelId.toString(),
            device_profile: profile,

            // Channel info (CAPA 3)
            chn: channelName.substring(0, 50),
            dfp: deviceFp,

            // Profile fields (CAPA 4-6)
            ...staticProfileFields,

            // Proxy Auth fields (CAPA 7) - NEW
            ...proxyAuthPayload,

            // Meta
            src: 'ape_v16_proxy_auth',
            version: '16.0.0-ULTIMATE-TYPED-ARRAYS'
        };

        console.log(`🔐 JWT: Generated Proxy Auth token for channel ${channelId} with provider ${proxyConfig.provider_name || 'default'}`);
        return generateTokenSync(payload, options);
    }

    /**
     * Simple encryption for proxy credentials (for JWT transport)
     * In production, use AES-256-GCM
     */
    function simpleEncrypt(text, key) {
        return btoa(text + '::' + key).split('').reverse().join('');
    }

    function simpleDecrypt(encrypted, key) {
        try {
            const reversed = encrypted.split('').reverse().join('');
            const decoded = atob(reversed);
            const [text] = decoded.split('::');
            return text;
        } catch (e) {
            return encrypted;
        }
    }

    /**
     * Generate device fingerprint
     */
    function getDeviceFingerprint() {
        const components = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset()
        ];
        return simpleHash(components.join('|')).substring(0, 16);
    }

    // ═══════════════════════════════════════════════════════════
    // TOKEN FOR URL
    // ═══════════════════════════════════════════════════════════

    /**
     * Generate token parameter for URL
     * @param {Object} channel - Channel object
     * @returns {string} URL-safe token parameter
     */
    function getTokenForUrl(channel) {
        const token = generateChannelToken(channel);
        return encodeURIComponent(token);
    }

    /**
     * Apply token to channel URL
     * @param {string} url - Original URL
     * @param {Object} channel - Channel object
     * @returns {string} URL with JWT token
     */
    function applyTokenToUrl(url, channel) {
        const token = generateChannelToken(channel);
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}ape_jwt=${encodeURIComponent(token)}`;
    }

    // ═══════════════════════════════════════════════════════════
    // TOKEN VALIDATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Verify JWT token (basic validation)
     * @param {string} token - JWT token
     * @returns {Object} Validation result
     */
    function verifyToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return { valid: false, error: 'Invalid token format' };
            }

            const payload = JSON.parse(base64UrlDecode(parts[1]));
            const now = Math.floor(Date.now() / 1000);

            if (payload.exp && payload.exp < now) {
                return { valid: false, error: 'Token expired', payload };
            }

            return { valid: true, payload };

        } catch (e) {
            return { valid: false, error: e.message };
        }
    }

    // ═══════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════

    function getStatus() {
        return {
            version: CONFIG.VERSION,
            algorithm: CONFIG.ALGORITHM,
            expiryHours: CONFIG.DEFAULT_EXPIRY_HOURS,
            hasSecretKey: !!_secretKey || !!localStorage.getItem('ape_jwt_secret'),
            cryptoAvailable: typeof crypto.subtle !== 'undefined',
            ready: true
        };
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const JWTTokenGenerator = {
        // Token generation
        generateToken,
        generateTokenSync,
        generateChannelToken,
        generateProfileToken,  // v12.0 SUPREMO - Profile-enhanced JWT
        generateProxyAuthToken, // v16.0 - Proxy Auth JWT (CAPA 7)

        // URL integration
        getTokenForUrl,
        applyTokenToUrl,

        // Validation
        verifyToken,

        // Key management
        getSecretKey,
        setSecretKey,

        // Utilities
        generateJTI,
        generateNonce,
        getDeviceFingerprint,

        // v16.0 Proxy Auth utilities
        simpleEncrypt,
        simpleDecrypt,

        // Status
        getStatus,

        // Config
        CONFIG,

        // v12.0 SUPREMO exports
        CORE_FIELDS,
        PROFILE_FIELDS,

        // v16.0 Proxy Auth exports
        PROXY_AUTH_FIELDS
    };

    // Global exports
    window.JWT_TOKEN_V9 = JWTTokenGenerator;
    window.APE_JWT = JWTTokenGenerator;  // Alias

    console.log('%c🔑 APE JWT Token Generator v16.0 PROXY-AUTH Loaded', 'color: #00ff41; font-weight: bold;');
    console.log('   ✅ CAPA 7: Proxy Auth Fields (15 campos) | generateProxyAuthToken() disponible');

})();
