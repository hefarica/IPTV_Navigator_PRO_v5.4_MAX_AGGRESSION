/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔒 APE TOKEN MANAGER (CORE SECURITY LAYER)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Centralized Token Management for APE v15.1
 * - Fetches valid JWT from backend (/token/generate)
 * - Caches token with safety margin
 * - Validates JWT structure (3 parts) strictly
 * - Prevents manual/legacy token usage
 * 
 * @layer 1 (Security Core)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const CONFIG = {
        STORAGE_KEY_TOKEN: 'APE_AUTH_TOKEN_CACHE',
        STORAGE_KEY_EXPIRY: 'APE_AUTH_TOKEN_EXPIRY',
        STORAGE_KEY_WORKER: 'gateway_worker_url', // Shared with GatewayManager
        DEFAULT_WORKER: 'https://ape-redirect-api-m3u8-native.beticosa1.workers.dev',
        SAFETY_MARGIN_SEC: 60, // Renew 60s before expiry
    };

    class TokenManager {
        constructor() {
            this._token = null;
            this._expiry = 0;
            this._loadFromStorage();
        }

        /**
         * Get a valid JWT token.
         * Auto-refreshes if expired or missing.
         * @returns {Promise<string>} Valid 3-part JWT
         */
        async getToken() {
            if (this._isValid()) {
                return this._token;
            }
            return await this._fetchNewToken();
        }

        /**
         * Validates JWT structure (Header.Payload.Signature)
         * @param {string} token 
         * @returns {boolean}
         */
        validateStructure(token) {
            if (!token || typeof token !== 'string') return false;
            const parts = token.split('.');
            return parts.length === 3;
        }

        /**
         * Private: Load cached token
         */
        _loadFromStorage() {
            const cachedToken = localStorage.getItem(CONFIG.STORAGE_KEY_TOKEN);
            const cachedExpiry = localStorage.getItem(CONFIG.STORAGE_KEY_EXPIRY);

            if (cachedToken && cachedExpiry) {
                const exp = parseInt(cachedExpiry, 10);
                if (Date.now() < exp) {
                    this._token = cachedToken;
                    this._expiry = exp;
                }
            }
        }

        /**
         * Private: Fetch new token from Backend
         */
        async _fetchNewToken() {
            const workerUrl = localStorage.getItem(CONFIG.STORAGE_KEY_WORKER) || CONFIG.DEFAULT_WORKER;
            const endpoint = `${workerUrl}/token/generate?user_id=toolkit_frontend&expires_in=21600`; // 6h

            try {
                const response = await fetch(endpoint);
                if (!response.ok) {
                    throw new Error(`Token fetch failed: ${response.status}`);
                }

                const data = await response.json();
                if (!data.token) {
                    throw new Error('Invalid response from token endpoint');
                }

                // LAYER 3 FAIL-FAST: Validate structure immediately
                if (!this.validateStructure(data.token)) {
                    throw new Error('Backend returned malformed JWT (not 3 parts)');
                }

                this._saveToken(data.token, data.expires_in || 21600);
                return data.token;

            } catch (error) {
                console.error('🔐 TokenManager Error:', error);
                throw new Error('CRITICAL: Could not obtain valid auth token. ' + error.message);
            }
        }

        /**
         * Private: Store token
         */
        _saveToken(token, expiresInSec) {
            this._token = token;
            // Calculate expiry with safety margin
            this._expiry = Date.now() + ((expiresInSec - CONFIG.SAFETY_MARGIN_SEC) * 1000);

            localStorage.setItem(CONFIG.STORAGE_KEY_TOKEN, token);
            localStorage.setItem(CONFIG.STORAGE_KEY_EXPIRY, this._expiry.toString());
            console.log('%c🔐 TokenManager: Token refreshed & cached', 'color: #8be9fd');
        }

        /**
         * Private: Check validity
         */
        _isValid() {
            if (!this._token) return false;
            if (Date.now() >= this._expiry) return false;
            return this.validateStructure(this._token);
        }

        /**
         * Set JWT expiration hours (configurable from UI)
         * @param {number} hours - Expiration in hours (4-8760)
         */
        setExpirationHours(hours) {
            const clampedHours = Math.max(4, Math.min(8760, hours));
            this._expirationHours = clampedHours;
            localStorage.setItem('APE_JWT_EXPIRATION_HOURS', clampedHours.toString());
            console.log(`%c🔐 JWT Expiration set to ${clampedHours} hours`, 'color: #8be9fd');
        }

        /**
         * Get configured JWT expiration hours
         * @returns {number} Hours (default 8760 = 1 year)
         */
        getExpirationHours() {
            if (!this._expirationHours) {
                const stored = localStorage.getItem('APE_JWT_EXPIRATION_HOURS');
                this._expirationHours = stored ? parseInt(stored, 10) : 8760;
            }
            return this._expirationHours;
        }

        // Debug/Admin methods
        forceRefresh() {
            this._token = null;
            this._expiry = 0;
            localStorage.removeItem(CONFIG.STORAGE_KEY_TOKEN);
            localStorage.removeItem(CONFIG.STORAGE_KEY_EXPIRY);
        }
    }

    // Expose Global Instance
    window.APE_TOKEN_MANAGER = new TokenManager();
    console.log('%c🔐 APE Token Manager v1.0 (Core Security) Initialized', 'color: #50fa7b; font-weight: bold;');

})();
