/**
 * ═══════════════════════════════════════════════════════════════
 * 🔌 APE v15 BACKEND CONNECTOR
 * IPTV Navigator PRO - Frontend-Backend Bridge
 * ═══════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Connect frontend to APE v15 backend server
 * 
 * FEATURES:
 * - Health check and status polling
 * - Real-time metrics fetching
 * - Profile management (get/set)
 * - Manual failover triggering
 * - Event-driven updates
 * 
 * VERSION: 15.0.0
 * DATE: 2026-01-03
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const APE_BACKEND_URL = 'http://localhost:8085';
    const POLL_INTERVAL_MS = 2000; // 2 seconds

    /**
     * APE v15 Backend Connector
     */
    class APEv15Connector {
        constructor() {
            this.baseUrl = APE_BACKEND_URL;
            this.connected = false;
            this.polling = false;
            this.pollTimer = null;
            this.listeners = {
                status: [],
                metrics: [],
                error: [],
                connect: [],
                disconnect: []
            };
            this.lastStatus = null;
            this.lastMetrics = null;

            console.log('%c🔌 APE v15 Backend Connector Initialized', 'color: #10b981; font-weight: bold;');
        }

        // ─────────────────────────────────────────────────────────────
        // EVENT SYSTEM
        // ─────────────────────────────────────────────────────────────

        /**
         * Subscribe to events
         * @param {string} event - Event name: 'status', 'metrics', 'error', 'connect', 'disconnect'
         * @param {Function} callback - Callback function
         */
        on(event, callback) {
            if (this.listeners[event]) {
                this.listeners[event].push(callback);
            }
        }

        /**
         * Emit event to all subscribers
         */
        _emit(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(cb => {
                    try {
                        cb(data);
                    } catch (e) {
                        console.error(`APE v15 event handler error (${event}):`, e);
                    }
                });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // CONNECTION MANAGEMENT
        // ─────────────────────────────────────────────────────────────

        /**
         * Check if backend is available
         * @returns {Promise<Object>} Health status
         */
        async checkHealth() {
            try {
                const response = await fetch(`${this.baseUrl}/health`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (!this.connected) {
                    this.connected = true;
                    this._emit('connect', data);
                    console.log('%c✅ APE v15 Backend Connected', 'color: #4ade80; font-weight: bold;', data);
                }

                return data;
            } catch (error) {
                if (this.connected) {
                    this.connected = false;
                    this._emit('disconnect', { error: error.message });
                    console.warn('%c❌ APE v15 Backend Disconnected', 'color: #ef4444; font-weight: bold;', error.message);
                }
                throw error;
            }
        }

        /**
         * Get full server status
         * @returns {Promise<Object>} Full status
         */
        async getStatus() {
            const response = await fetch(`${this.baseUrl}/api/status`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.lastStatus = data;
            this._emit('status', data);
            return data;
        }

        /**
         * Get real-time metrics
         * @returns {Promise<Object>} Metrics data
         */
        async getMetrics() {
            const response = await fetch(`${this.baseUrl}/api/metrics`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.lastMetrics = data;
            this._emit('metrics', data);
            return data;
        }

        // ─────────────────────────────────────────────────────────────
        // PROFILE MANAGEMENT
        // ─────────────────────────────────────────────────────────────

        /**
         * Get all available profiles
         * @returns {Promise<Object>} Profiles list
         */
        async getProfiles() {
            const response = await fetch(`${this.baseUrl}/api/profiles`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return response.json();
        }

        /**
         * Get current profile
         * @returns {Promise<Object>} Current profile info
         */
        async getCurrentProfile() {
            const response = await fetch(`${this.baseUrl}/api/profile`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return response.json();
        }

        /**
         * Set active profile
         * @param {string} profile - Profile ID (P0-P5)
         * @param {boolean} force - Force change bypassing hysteresis
         * @returns {Promise<Object>} Result
         */
        async setProfile(profile, force = false) {
            const response = await fetch(`${this.baseUrl}/api/profile`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ profile, force })
            });

            const data = await response.json();

            if (!response.ok && response.status !== 202) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            console.log(`%c🔄 Profile ${response.status === 202 ? 'pending' : 'changed'}: ${profile}`,
                'color: #38bdf8; font-weight: bold;', data);

            return data;
        }

        // ─────────────────────────────────────────────────────────────
        // FAILOVER CONTROL
        // ─────────────────────────────────────────────────────────────

        /**
         * Trigger manual failover
         * @param {string} targetProfile - Optional target profile
         * @returns {Promise<Object>} Result
         */
        async triggerFailover(targetProfile = null) {
            const body = targetProfile ? { target: targetProfile } : {};

            const response = await fetch(`${this.baseUrl}/api/failover`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log('%c🚨 Manual Failover Triggered', 'color: #f97316; font-weight: bold;', data);
            return data;
        }

        // ─────────────────────────────────────────────────────────────
        // POLLING
        // ─────────────────────────────────────────────────────────────

        /**
         * Start automatic polling for metrics
         * @param {number} intervalMs - Poll interval in milliseconds
         */
        startPolling(intervalMs = POLL_INTERVAL_MS) {
            if (this.polling) {
                console.warn('APE v15: Polling already active');
                return;
            }

            this.polling = true;
            console.log(`%c📡 APE v15 Polling Started (${intervalMs}ms)`, 'color: #8b5cf6;');

            const poll = async () => {
                if (!this.polling) return;

                try {
                    await this.checkHealth();
                    if (this.connected) {
                        await this.getMetrics();
                    }
                } catch (error) {
                    this._emit('error', { type: 'poll', error: error.message });
                }

                if (this.polling) {
                    this.pollTimer = setTimeout(poll, intervalMs);
                }
            };

            poll();
        }

        /**
         * Stop automatic polling
         */
        stopPolling() {
            this.polling = false;
            if (this.pollTimer) {
                clearTimeout(this.pollTimer);
                this.pollTimer = null;
            }
            console.log('%c⏹️ APE v15 Polling Stopped', 'color: #6b7280;');
        }

        /**
         * Check if currently connected
         * @returns {boolean}
         */
        isConnected() {
            return this.connected;
        }

        /**
         * Get last cached status
         * @returns {Object|null}
         */
        getLastStatus() {
            return this.lastStatus;
        }

        /**
         * Get last cached metrics
         * @returns {Object|null}
         */
        getLastMetrics() {
            return this.lastMetrics;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // GLOBAL EXPORT
    // ─────────────────────────────────────────────────────────────

    // Create singleton instance
    const connector = new APEv15Connector();

    // Export to window
    window.APEv15 = connector;
    window.APEv15Connector = APEv15Connector;

    console.log('%c🚀 APE v15 Backend Connector Ready', 'color: #10b981; font-weight: bold; font-size: 14px;');
    console.log('   Usage: await window.APEv15.getStatus()');

})();
