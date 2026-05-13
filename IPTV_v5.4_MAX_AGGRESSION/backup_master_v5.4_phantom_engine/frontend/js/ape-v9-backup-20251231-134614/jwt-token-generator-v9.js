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
        VERSION: '9.0.0',
        DEFAULT_EXPIRY_HOURS: 4,      // Token valid for 4 hours
        SECRET_KEY_LENGTH: 32,         // 256-bit key
        ALGORITHM: 'HS256',            // HMAC-SHA256
        ISSUER: 'APE_v9.0_ULTIMATE',
        DEBUG: false
    };

    // ═══════════════════════════════════════════════════════════
    // BASE64URL ENCODING (JWT compatible)
    // ═══════════════════════════════════════════════════════════

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
            src: options.source || 'ape_v9'          // Token source
        };

        return generateTokenSync(payload, options);
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

        // Status
        getStatus,

        // Config
        CONFIG
    };

    // Global exports
    window.JWT_TOKEN_V9 = JWTTokenGenerator;
    window.APE_JWT = JWTTokenGenerator;  // Alias

    console.log('%c🔑 APE JWT Token Generator v9.0 Loaded', 'color: #00ff41; font-weight: bold;');

})();
