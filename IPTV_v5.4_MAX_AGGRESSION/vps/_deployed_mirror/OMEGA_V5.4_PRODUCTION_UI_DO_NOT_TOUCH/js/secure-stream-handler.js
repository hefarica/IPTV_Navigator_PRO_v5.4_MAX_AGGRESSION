/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔐 SECURE STREAM HANDLER v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Módulo frontend para conexión segura a streams IPTV.
 * 
 * CARACTERÍSTICAS:
 *   - JWT en header Authorization (nunca en URL)
 *   - Manejo transparente de errores de proxy
 *   - Health check periódico al gateway
 *   - Indicador visual de estado de conexión
 *   - Renovación automática de JWT
 * 
 * USO:
 *   const handler = new SecureStreamHandler({ apiBase: 'https://api.ape-tv.net' });
 *   handler.connect('stream_hash');
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN POR DEFECTO
    // ═══════════════════════════════════════════════════════════════════════

    const DEFAULT_CONFIG = {
        apiBase: 'https://api.ape-tv.net',
        healthCheckInterval: 30000,  // 30 segundos
        jwtRefreshInterval: 3600000, // 1 hora
        maxRetries: 3,
        retryDelay: 1000,
        showStatusIndicator: true
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════

    class SecureStreamHandler {
        constructor(config = {}) {
            this.config = { ...DEFAULT_CONFIG, ...config };
            this.jwtToken = null;
            this.jwtExpiry = null;
            this.proxyStatus = 'unknown'; // 'online', 'offline', 'unknown'
            this.lastLatency = null;
            this.healthCheckTimer = null;
            this.jwtRefreshTimer = null;
            this.statusIndicator = null;

            console.log('%c🔐 SecureStreamHandler v1.0.0 inicializado',
                'color: #10b981; font-weight: bold;');

            // Auto-iniciar health checks si está habilitado
            if (this.config.showStatusIndicator) {
                this._createStatusIndicator();
            }
            this._startHealthCheck();
        }

        // ═══════════════════════════════════════════════════════════════════
        // CONEXIÓN A STREAMS
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Conectar a un stream de forma segura
         * @param {string} streamHash - Hash del stream o URL completa
         * @param {Object} options - Opciones adicionales
         * @returns {Promise<Response>}
         */
        async connect(streamHash, options = {}) {
            console.log(`%c📡 Conectando a stream: ${streamHash}`, 'color: #3b82f6;');

            const url = this._buildStreamUrl(streamHash);
            const headers = this._getSecureHeaders();

            let lastError = null;

            for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
                try {
                    const startTime = performance.now();

                    const response = await fetch(url, {
                        method: 'GET',
                        headers: headers,
                        ...options
                    });

                    this.lastLatency = Math.round(performance.now() - startTime);

                    // Manejar diferentes códigos de respuesta
                    if (response.ok) {
                        this._updateStatus('online');
                        console.log(`%c✅ Stream conectado (${this.lastLatency}ms)`, 'color: #10b981;');
                        return response;
                    }

                    // 503 = El Worker ya reintentó y falló
                    if (response.status === 503) {
                        console.warn(`⚠️ Proxy exhausted, attempt ${attempt + 1}/${this.config.maxRetries}`);
                        this._updateStatus('degraded');
                        await this._delay(this.config.retryDelay * (attempt + 1));
                        continue;
                    }

                    // Otros errores
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);

                } catch (error) {
                    lastError = error;
                    console.error(`❌ Error en intento ${attempt + 1}:`, error.message);
                    await this._delay(this.config.retryDelay * (attempt + 1));
                }
            }

            this._updateStatus('offline');
            throw new Error(`Stream connection failed after ${this.config.maxRetries} attempts: ${lastError?.message}`);
        }

        // ═══════════════════════════════════════════════════════════════════
        // JWT MANAGEMENT
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Establecer JWT token
         * @param {string} token - JWT token
         * @param {number} expiryMs - Tiempo de expiración en ms (opcional)
         */
        setJWT(token, expiryMs = null) {
            this.jwtToken = token;
            this.jwtExpiry = expiryMs ? Date.now() + expiryMs : null;
            console.log('%c🔑 JWT configurado', 'color: #f59e0b;');

            // Programar renovación automática si hay expiry
            if (expiryMs) {
                this._scheduleJWTRefresh(expiryMs - 300000); // 5 min antes de expirar
            }
        }

        /**
         * Extraer JWT de una URL y almacenarlo
         * @param {string} url - URL con ape_jwt query param
         * @returns {string} - URL limpia sin JWT
         */
        extractJWTFromUrl(url) {
            try {
                const urlObj = new URL(url);
                if (urlObj.searchParams.has('ape_jwt')) {
                    const jwt = urlObj.searchParams.get('ape_jwt');
                    urlObj.searchParams.delete('ape_jwt');
                    this.setJWT(jwt);
                    console.log('%c🔐 JWT extraído de URL y movido a header', 'color: #10b981;');
                    return urlObj.toString();
                }
            } catch (e) {
                // URL inválida, retornar sin cambios
            }
            return url;
        }

        /**
         * Refrescar JWT token
         * @returns {Promise<boolean>}
         */
        async refreshJWT() {
            try {
                console.log('%c🔄 Refrescando JWT...', 'color: #3b82f6;');

                // Obtener ID de usuario o generar uno temporal
                let userId = localStorage.getItem('ape_user_id');
                if (!userId) {
                    userId = 'user_' + Math.random().toString(36).substring(2, 15);
                    localStorage.setItem('ape_user_id', userId);
                }

                const response = await fetch(`${this.config.apiBase}/token/generate?user_id=${userId}&expires_in=21600`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.token) {
                        this.setJWT(data.token, (data.expires_in || 21600) * 1000); // Convert to ms
                        console.log('%c✅ JWT refrescado exitosamente', 'color: #10b981;');
                        return true;
                    }
                }

                console.warn('⚠️ No se pudo refrescar JWT');
                return false;

            } catch (error) {
                console.error('❌ Error refrescando JWT:', error);
                return false;
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // HEALTH CHECK
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Realizar health check al gateway
         * @returns {Promise<Object>}
         */
        async healthCheck() {
            try {
                const startTime = performance.now();

                const response = await fetch(`${this.config.apiBase}/health`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                const latency = Math.round(performance.now() - startTime);

                if (response.ok) {
                    const data = await response.json();
                    this.lastLatency = latency;
                    this._updateStatus('online');
                    return { status: 'online', latency, data };
                }

                this._updateStatus('degraded');
                return { status: 'degraded', latency, error: response.statusText };

            } catch (error) {
                this._updateStatus('offline');
                return { status: 'offline', error: error.message };
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // MÉTODOS PRIVADOS
        // ═══════════════════════════════════════════════════════════════════

        _buildStreamUrl(streamHash) {
            // Si ya es una URL completa, usarla
            if (streamHash.startsWith('http')) {
                return this.extractJWTFromUrl(streamHash);
            }
            // Si es un hash, construir URL del gateway (Cloudflare Format)
            return `${this.config.apiBase}/canal/${streamHash}.m3u8`;
        }

        _getSecureHeaders() {
            const headers = {
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br'
                // NO incluir: Referer, Origin, X-Requested-With
            };

            // Añadir JWT si existe
            if (this.jwtToken) {
                headers['Authorization'] = `Bearer ${this.jwtToken}`;
            }

            return headers;
        }

        _startHealthCheck() {
            if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
            }

            // Health check inicial
            this.healthCheck();

            // Programar checks periódicos
            this.healthCheckTimer = setInterval(
                () => this.healthCheck(),
                this.config.healthCheckInterval
            );
        }

        _scheduleJWTRefresh(delayMs) {
            if (this.jwtRefreshTimer) {
                clearTimeout(this.jwtRefreshTimer);
            }

            this.jwtRefreshTimer = setTimeout(
                () => this.refreshJWT(),
                Math.max(delayMs, 60000) // Mínimo 1 minuto
            );
        }

        _updateStatus(status) {
            this.proxyStatus = status;
            this._renderStatusIndicator();
        }

        _delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // ═══════════════════════════════════════════════════════════════════
        // STATUS INDICATOR UI
        // ═══════════════════════════════════════════════════════════════════

        _createStatusIndicator() {
            if (this.statusIndicator) return;

            this.statusIndicator = document.createElement('div');
            this.statusIndicator.id = 'secure-stream-status';
            this.statusIndicator.style.cssText = `
                position: fixed;
                bottom: 10px;
                right: 10px;
                padding: 8px 12px;
                border-radius: 8px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 12px;
                font-weight: 500;
                z-index: 9999;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: all 0.3s ease;
                cursor: pointer;
                opacity: 0.9;
            `;

            this.statusIndicator.onclick = () => this.healthCheck();
            document.body.appendChild(this.statusIndicator);
            this._renderStatusIndicator();
        }

        _renderStatusIndicator() {
            if (!this.statusIndicator) return;

            const statusConfig = {
                'online': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', icon: '🟢', text: 'Gateway Online' },
                'degraded': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', icon: '🟡', text: 'Gateway Degraded' },
                'offline': { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', icon: '🔴', text: 'Gateway Offline' },
                'unknown': { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', icon: '⚪', text: 'Checking...' }
            };

            const config = statusConfig[this.proxyStatus] || statusConfig['unknown'];

            this.statusIndicator.style.background = config.bg;
            this.statusIndicator.style.border = `1px solid ${config.color}`;
            this.statusIndicator.style.color = config.color;

            const latencyText = this.lastLatency ? ` (${this.lastLatency}ms)` : '';
            this.statusIndicator.innerHTML = `${config.icon} ${config.text}${latencyText}`;
        }

        // ═══════════════════════════════════════════════════════════════════
        // CLEANUP
        // ═══════════════════════════════════════════════════════════════════

        destroy() {
            if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
            }
            if (this.jwtRefreshTimer) {
                clearTimeout(this.jwtRefreshTimer);
            }
            if (this.statusIndicator) {
                this.statusIndicator.remove();
            }
            console.log('%c🔐 SecureStreamHandler destruido', 'color: #6b7280;');
        }

        // ═══════════════════════════════════════════════════════════════════
        // ESTADÍSTICAS
        // ═══════════════════════════════════════════════════════════════════

        getStats() {
            return {
                proxyStatus: this.proxyStatus,
                lastLatency: this.lastLatency,
                hasJWT: !!this.jwtToken,
                jwtExpiry: this.jwtExpiry,
                apiBase: this.config.apiBase
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPORTAR
    // ═══════════════════════════════════════════════════════════════════════

    global.SecureStreamHandler = SecureStreamHandler;

    // Auto-instanciar si hay configuración global
    if (global.APE_STREAM_CONFIG) {
        global.apeStreamHandler = new SecureStreamHandler(global.APE_STREAM_CONFIG);
    }

})(typeof window !== 'undefined' ? window : this);
