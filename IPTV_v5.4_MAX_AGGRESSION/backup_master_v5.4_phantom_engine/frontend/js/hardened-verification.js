/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🛡️ HARDENED VERIFICATION ENGINE v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Triple-fallback verification system for bulletproof upload confirmation:
 * 1. HEAD /lists/{filename} - Fast check
 * 2. GET /api/upload/verify?filename={filename} - Source of truth  
 * 3. GET /api/upload-verify?filename={filename} - Alias fallback
 * 
 * Features:
 * - Exponential backoff retry (1s, 2s, 4s, 8s, 16s)
 * - Health check pre-verification
 * - Detailed metrics tracking
 * - CORS-resilient design
 */

(function () {
    'use strict';

    const CONFIG = {
        MAX_RETRIES: 5,
        BASE_DELAY_MS: 1000,
        TIMEOUT_MS: 30000,
        HEALTH_ENDPOINT: '/api/upload-health',
        VERIFY_ENDPOINTS: [
            '/api/upload/verify',
            '/api/upload-verify'
        ]
    };

    const metrics = {
        attempts: 0,
        successes: 0,
        failures: 0,
        lastAttempt: null,
        lastSuccess: null,
        lastError: null,
        endpointStats: {}
    };

    class HardenedVerification {
        constructor(baseUrl) {
            this.baseUrl = baseUrl || window.VPS_CONFIG?.DEFAULT_URL || 'https://iptv-ape.duckdns.org';
            console.log('%c🛡️ HardenedVerification v1.0.0 Loaded', 'color: #10b981; font-weight: bold;');
            console.log(`   Base URL: ${this.baseUrl}`);
        }

        /**
         * Health check before verification
         */
        async checkHealth() {
            try {
                const res = await fetch(`${this.baseUrl}${CONFIG.HEALTH_ENDPOINT}`, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-store',
                    signal: AbortSignal.timeout(5000)
                });
                return res.ok;
            } catch (e) {
                console.warn('⚠️ [HEALTH] Check failed:', e.message);
                return false;
            }
        }

        /**
         * Verify file existence with triple fallback
         */
        async verify(filename, retries = CONFIG.MAX_RETRIES) {
            metrics.attempts++;
            metrics.lastAttempt = new Date().toISOString();

            console.log(`🔍 [VERIFY] Checking: ${filename} (attempt ${metrics.attempts})`);

            // Method 1: HEAD request to /lists/
            try {
                const headRes = await fetch(`${this.baseUrl}/lists/${encodeURIComponent(filename)}`, {
                    method: 'HEAD',
                    mode: 'cors',
                    cache: 'no-store',
                    signal: AbortSignal.timeout(CONFIG.TIMEOUT_MS)
                });

                if (headRes.ok) {
                    metrics.successes++;
                    metrics.lastSuccess = new Date().toISOString();
                    this._trackEndpoint('/lists/ HEAD', true);
                    console.log('%c✅ [VERIFY] HEAD confirmed!', 'color: #10b981; font-weight: bold;');
                    return { ok: true, method: 'HEAD', filename };
                }
            } catch (e) {
                this._trackEndpoint('/lists/ HEAD', false);
                console.warn('⚠️ [VERIFY] HEAD failed, trying API...');
            }

            // Method 2 & 3: API endpoints
            for (const endpoint of CONFIG.VERIFY_ENDPOINTS) {
                try {
                    const url = `${this.baseUrl}${endpoint}?filename=${encodeURIComponent(filename)}`;
                    const res = await fetch(url, {
                        method: 'GET',
                        mode: 'cors',
                        cache: 'no-store',
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(CONFIG.TIMEOUT_MS)
                    });

                    if (res.ok) {
                        const data = await res.json();
                        if (data.exists === true || data.ok === true) {
                            metrics.successes++;
                            metrics.lastSuccess = new Date().toISOString();
                            this._trackEndpoint(endpoint, true);
                            console.log(`%c✅ [VERIFY] ${endpoint} confirmed!`, 'color: #10b981; font-weight: bold;');
                            return { ok: true, method: endpoint, data };
                        }
                    }
                } catch (e) {
                    this._trackEndpoint(endpoint, false);
                    console.warn(`⚠️ [VERIFY] ${endpoint} failed:`, e.message);
                }
            }

            // Retry with backoff
            if (retries > 0) {
                const delay = CONFIG.BASE_DELAY_MS * Math.pow(2, CONFIG.MAX_RETRIES - retries);
                console.log(`⏳ [VERIFY] Retrying in ${delay}ms... (${retries} left)`);
                await new Promise(r => setTimeout(r, delay));
                return this.verify(filename, retries - 1);
            }

            metrics.failures++;
            metrics.lastError = `File not found after ${CONFIG.MAX_RETRIES} attempts`;
            console.error('%c❌ [VERIFY] All methods exhausted', 'color: #ef4444; font-weight: bold;');
            return { ok: false, error: 'verification_failed' };
        }

        _trackEndpoint(endpoint, success) {
            if (!metrics.endpointStats[endpoint]) {
                metrics.endpointStats[endpoint] = { success: 0, failure: 0 };
            }
            if (success) {
                metrics.endpointStats[endpoint].success++;
            } else {
                metrics.endpointStats[endpoint].failure++;
            }
        }

        static getMetrics() {
            return { ...metrics };
        }

        static printMetrics() {
            console.table(metrics);
            console.table(metrics.endpointStats);
        }
    }

    // Global export
    window.HardenedVerification = HardenedVerification;

    // Auto-initialize with default config
    window.hardenedVerifier = new HardenedVerification();

    console.log('%c🛡️ HardenedVerification ready! Use: window.hardenedVerifier.verify("filename.m3u8")', 'color: #10b981;');

})();
