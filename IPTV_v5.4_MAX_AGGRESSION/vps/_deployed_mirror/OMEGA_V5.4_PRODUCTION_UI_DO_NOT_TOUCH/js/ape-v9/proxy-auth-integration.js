/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔌 PROXY AUTH - MÓDULO DE INTEGRACIÓN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Integra ProxyAuthModule y UserAgentRotation con fetchStream()
 * FASE 3: Integración JavaScript
 * 
 * @version 16.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN
    // ══════════════════════════════════════════════════════════════════════

    const CONFIG = {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 30000,
        supportedAuthMethods: ['basic', 'ntlm', 'digest', 'custom'],
        apiEndpoints: {
            generateToken: '/api/proxy-auth/generate-token.php',
            providers: '/api/proxy-auth/providers.php',
            validateToken: '/api/proxy-auth/validate-token.php'
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    // PROXY AUTH MODULE (Si no existe ya)
    // ══════════════════════════════════════════════════════════════════════

    if (typeof window.ProxyAuthenticationModule === 'undefined') {
        window.ProxyAuthenticationModule = class ProxyAuthenticationModule {
            constructor(config = {}) {
                this.config = { ...CONFIG, ...config };
                this.statistics = {
                    totalAttempts: 0,
                    successfulAttempts: 0,
                    failedAttempts: 0,
                    lastAttempt: null
                };
                console.log('🔐 ProxyAuthenticationModule initialized');
            }

            // Detectar si la respuesta requiere autenticación de proxy
            detectProxyAuthRequired(response) {
                const requiresAuth = response.status === 407;
                let method = 'basic';
                let realm = 'Proxy';

                if (requiresAuth) {
                    const authHeader = response.headers?.get?.('Proxy-Authenticate') ||
                        response.headers?.['Proxy-Authenticate'];

                    if (authHeader) {
                        if (authHeader.toLowerCase().includes('ntlm')) {
                            method = 'ntlm';
                        } else if (authHeader.toLowerCase().includes('digest')) {
                            method = 'digest';
                        } else if (authHeader.toLowerCase().includes('basic')) {
                            method = 'basic';
                        }

                        const realmMatch = authHeader.match(/realm="([^"]+)"/);
                        if (realmMatch) {
                            realm = realmMatch[1];
                        }
                    }
                }

                return {
                    requiresAuth,
                    method,
                    realm,
                    status: response.status
                };
            }

            // Construir header de autenticación
            buildProxyAuthHeader(credentials, method = 'basic') {
                const headers = {};

                switch (method.toLowerCase()) {
                    case 'basic':
                        const encoded = btoa(`${credentials.username}:${credentials.password}`);
                        headers['Proxy-Authorization'] = `Basic ${encoded}`;
                        break;

                    case 'ntlm':
                        // NTLM es más complejo, aquí un placeholder
                        headers['Proxy-Authorization'] = `NTLM ${this._buildNtlmToken(credentials)}`;
                        break;

                    case 'digest':
                        // Digest también es complejo
                        headers['Proxy-Authorization'] = `Digest ${this._buildDigestToken(credentials)}`;
                        break;

                    case 'custom':
                        headers['X-Proxy-User'] = credentials.username;
                        headers['X-Proxy-Token'] = credentials.token || '';
                        break;
                }

                return headers;
            }

            // Reintento con autenticación
            async retryWithAuthentication(url, options, jwtToken, authRequired) {
                this.statistics.totalAttempts++;
                this.statistics.lastAttempt = new Date().toISOString();

                try {
                    // Extraer credenciales del JWT
                    const credentials = this._extractCredentialsFromJWT(jwtToken);

                    if (!credentials) {
                        throw new Error('No credentials found in JWT token');
                    }

                    // Construir headers de autenticación
                    const authHeaders = this.buildProxyAuthHeader(credentials, authRequired.method);

                    // Merge headers
                    const newOptions = {
                        ...options,
                        headers: {
                            ...options.headers,
                            ...authHeaders
                        }
                    };

                    // Reintento
                    const response = await fetch(url, newOptions);

                    if (response.ok) {
                        this.statistics.successfulAttempts++;
                        console.log(`✅ [PROXY-AUTH] Authentication successful with ${authRequired.method}`);
                        return response;
                    } else {
                        throw new Error(`HTTP ${response.status}`);
                    }

                } catch (error) {
                    this.statistics.failedAttempts++;
                    console.error(`❌ [PROXY-AUTH] Authentication failed:`, error);
                    throw error;
                }
            }

            // Extraer credenciales del JWT
            _extractCredentialsFromJWT(token) {
                try {
                    if (!token) return null;

                    const parts = token.split('.');
                    if (parts.length !== 3) return null;

                    const payload = JSON.parse(atob(parts[1]));

                    if (payload.proxy_enabled && payload.proxy_user && payload.proxy_pass) {
                        return {
                            username: this._simpleDecrypt(payload.proxy_user, payload.proxy_key || ''),
                            password: this._simpleDecrypt(payload.proxy_pass, payload.proxy_key || ''),
                            host: payload.proxy_host,
                            port: payload.proxy_port
                        };
                    }

                    return null;
                } catch (e) {
                    console.warn('⚠️ [PROXY-AUTH] Failed to extract credentials:', e);
                    return null;
                }
            }

            // Desencriptar simple (para credenciales cifradas básicamente)
            _simpleDecrypt(encrypted, key) {
                try {
                    // Si ya está en texto plano, retornar
                    if (!encrypted.includes(':')) {
                        return encrypted;
                    }
                    return atob(encrypted);
                } catch (e) {
                    return encrypted;
                }
            }

            // Placeholder para NTLM token
            _buildNtlmToken(credentials) {
                // NTLM es un proceso de 3 pasos, esto es simplificado
                return btoa(`${credentials.username}:${credentials.password}`);
            }

            // Placeholder para Digest token
            _buildDigestToken(credentials) {
                // Digest requiere nonce y otros parámetros
                return btoa(`${credentials.username}:${credentials.password}`);
            }

            // Registrar uso
            recordUsage(userAgent, success) {
                this.statistics.totalAttempts++;
                if (success) {
                    this.statistics.successfulAttempts++;
                } else {
                    this.statistics.failedAttempts++;
                }
            }

            // Obtener estadísticas
            getStatistics() {
                const total = this.statistics.totalAttempts || 1;
                return {
                    ...this.statistics,
                    successRate: ((this.statistics.successfulAttempts / total) * 100).toFixed(1) + '%'
                };
            }
        };
    }

    // ══════════════════════════════════════════════════════════════════════
    // FETCH STREAM CON PROXY AUTH
    // ══════════════════════════════════════════════════════════════════════

    // Guardar fetch original
    const originalFetch = window.fetch;

    // FetchStream con soporte para proxy auth y user agent rotation
    window.fetchStreamWithProxyAuth = async function (url, options = {}, jwtToken = null) {
        // Obtener User Agent rotado si está disponible
        if (window.userAgentRotation) {
            const ua = window.userAgentRotation.selectRandomUserAgent();
            if (!options.headers) options.headers = {};
            // Note: Browser puede no permitir modificar User-Agent, pero lo intentamos
            options.headers['X-Custom-User-Agent'] = ua;
        }

        // Primer intento
        let response = await originalFetch(url, options);

        // Detectar 407
        if (response.status === 407 && jwtToken && window.proxyAuthModule) {
            console.log('🔴 [PROXY-AUTH] HTTP 407 detected, attempting authentication...');

            const authRequired = window.proxyAuthModule.detectProxyAuthRequired(response);

            if (authRequired.requiresAuth) {
                // Intentar reintentos
                for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
                    try {
                        console.log(`🔄 [PROXY-AUTH] Retry ${attempt}/${CONFIG.maxRetries} with ${authRequired.method}`);

                        response = await window.proxyAuthModule.retryWithAuthentication(
                            url,
                            options,
                            jwtToken,
                            authRequired
                        );

                        if (response.ok) {
                            console.log(`✅ [PROXY-AUTH] Success on attempt ${attempt}`);
                            break;
                        }

                    } catch (error) {
                        console.warn(`⚠️ [PROXY-AUTH] Attempt ${attempt} failed:`, error.message);

                        if (attempt < CONFIG.maxRetries) {
                            await new Promise(r => setTimeout(r, CONFIG.retryDelay));
                        }
                    }
                }
            }
        }

        return response;
    };

    // ══════════════════════════════════════════════════════════════════════
    // INICIALIZACIÓN AUTOMÁTICA
    // ══════════════════════════════════════════════════════════════════════

    // Inicializar módulo de autenticación si no existe
    if (!window.proxyAuthModule) {
        window.proxyAuthModule = new window.ProxyAuthenticationModule(CONFIG);
    }

    // Log de carga
    console.log('%c🔌 Proxy Auth Integration Module Loaded', 'color: #00ff41; font-weight: bold;');
    console.log('   Usage: fetchStreamWithProxyAuth(url, options, jwtToken)');
    console.log('   Stats: window.proxyAuthModule.getStatistics()');

})();
