/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🔥 APE SESSION WARMUP ENGINE v9.0
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * PROPÓSITO:
 * Pre-calentamiento de rutas CDN mediante peticiones HEAD táctiles para:
 * - Establecer TCP handshake anticipado
 * - Adquirir cookies de sesión (cf_clearance, __cf_bm, etc.)
 * - Reducir latencia de primera carga
 * - Validar disponibilidad de endpoint
 * 
 * ESTRATEGIA:
 * 1. Petición HEAD no-cors (evita errores CORS en consola)
 * 2. Timeout agresivo 1.5s (no bloqueante)
 * 3. Solo para niveles L4+ (canales críticos)
 * 4. Reintento automático con backoff exponencial
 * 
 * AUTOR: APE Engine Team
 * VERSIÓN: 9.0.0
 * FECHA: 2024-12-29
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN
    // ═══════════════════════════════════════════════════════════════════════
    const CONFIG = {
        // Timeout por petición (ms)
        TIMEOUT: 1500,

        // Máximo de reintentos en caso de fallo
        MAX_RETRIES: 2,

        // Backoff exponencial (ms)
        RETRY_DELAY_BASE: 500,

        // Nivel mínimo para activar warmup
        MIN_LEVEL: 4,

        // Máximo de warmups concurrentes
        MAX_CONCURRENT: 10,

        // Cache de warmups exitosos (minutos)
        CACHE_TTL: 30
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CACHE DE SESIONES
    // ═══════════════════════════════════════════════════════════════════════
    class WarmupCache {
        constructor() {
            this.cache = new Map();
        }

        set(url, data) {
            const domain = this._extractDomain(url);
            this.cache.set(domain, {
                timestamp: Date.now(),
                data: data
            });
        }

        get(url) {
            const domain = this._extractDomain(url);
            const entry = this.cache.get(domain);

            if (!entry) return null;

            // Verificar expiración
            const age = Date.now() - entry.timestamp;
            if (age > CONFIG.CACHE_TTL * 60 * 1000) {
                this.cache.delete(domain);
                return null;
            }

            return entry.data;
        }

        has(url) {
            return this.get(url) !== null;
        }

        _extractDomain(url) {
            try {
                return new URL(url).hostname;
            } catch {
                return url;
            }
        }

        clear() {
            this.cache.clear();
        }

        getStats() {
            return {
                entries: this.cache.size,
                domains: Array.from(this.cache.keys())
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WARMUP ENGINE
    // ═══════════════════════════════════════════════════════════════════════
    class SessionWarmupEngine {
        constructor() {
            this.cache = new WarmupCache();
            this.stats = {
                total: 0,
                success: 0,
                failed: 0,
                cached: 0,
                skipped: 0
            };
            this.queue = [];
            this.processing = false;
        }

        /**
         * Ejecuta warmup para una URL específica
         * @param {string} url - URL del stream
         * @param {number} level - Nivel APE (1-5)
         * @param {object} options - Opciones adicionales
         * @returns {Promise<object>} Resultado del warmup
         */
        async execute(url, level, options = {}) {
            this.stats.total++;

            // Validación básica
            if (!url || typeof url !== 'string') {
                this.stats.skipped++;
                return { success: false, reason: 'invalid_url', cached: false };
            }

            // Solo warmup para niveles altos
            if (level < CONFIG.MIN_LEVEL) {
                this.stats.skipped++;
                return { success: true, reason: 'level_too_low', cached: false };
            }

            // Verificar cache
            if (this.cache.has(url)) {
                this.stats.cached++;
                return { success: true, reason: 'cached', cached: true, data: this.cache.get(url) };
            }

            // Ejecutar warmup con reintentos
            const result = await this._executeWithRetry(url, options);

            if (result.success) {
                this.stats.success++;
                this.cache.set(url, result.data);
            } else {
                this.stats.failed++;
            }

            return result;
        }

        /**
         * Ejecuta warmup con lógica de reintentos
         */
        async _executeWithRetry(url, options, attempt = 0) {
            try {
                const result = await this._doWarmup(url, options);
                return result;
            } catch (error) {
                if (attempt < CONFIG.MAX_RETRIES) {
                    // Backoff exponencial
                    const delay = CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt);
                    await this._sleep(delay);
                    return this._executeWithRetry(url, options, attempt + 1);
                }

                return {
                    success: false,
                    reason: 'max_retries_exceeded',
                    error: error.message,
                    cached: false
                };
            }
        }

        /**
         * Ejecuta la petición HEAD tácica
         * Nota: Los errores de conexión (ERR_CONNECTION_RESET) son normales
         * ya que muchos servidores IPTV bloquean peticiones HEAD.
         */
        async _doWarmup(url, options) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

            try {
                const fetchOptions = {
                    method: 'HEAD',
                    mode: 'no-cors', // Evita errores CORS visibles
                    cache: 'no-cache',
                    redirect: 'follow',
                    signal: controller.signal
                };

                // Añadir headers personalizados si están disponibles
                if (options.headers) {
                    fetchOptions.headers = options.headers;
                }

                const startTime = performance.now();
                const response = await fetch(url, fetchOptions);
                const duration = performance.now() - startTime;

                return {
                    success: true,
                    reason: 'warmup_complete',
                    cached: false,
                    data: {
                        status: response.status,
                        statusText: response.statusText,
                        type: response.type,
                        duration: Math.round(duration),
                        timestamp: Date.now()
                    }
                };

            } catch (error) {
                // Suprimir errores de red esperados (ERR_CONNECTION_RESET, timeout)
                // Estos son normales cuando el servidor no soporta HEAD o bloquea requests
                if (error.name === 'AbortError') {
                    // Timeout - silencioso
                    return { success: false, reason: 'timeout', cached: false };
                }
                // Otros errores de red - devolver sin throw para evitar spam en consola
                return { success: false, reason: 'network_error', cached: false };

            } finally {
                clearTimeout(timeoutId);
            }
        }

        /**
         * Warmup batch (múltiples URLs)
         * @param {Array} urls - Array de objetos {url, level}
         * @returns {Promise<Array>} Resultados
         */
        async executeBatch(urls) {
            if (!Array.isArray(urls) || urls.length === 0) {
                return [];
            }

            // Procesar en lotes para no saturar la red
            const results = [];
            for (let i = 0; i < urls.length; i += CONFIG.MAX_CONCURRENT) {
                const batch = urls.slice(i, i + CONFIG.MAX_CONCURRENT);
                const promises = batch.map(item =>
                    this.execute(item.url, item.level, item.options || {})
                );
                const batchResults = await Promise.allSettled(promises);
                results.push(...batchResults.map((r, idx) => ({
                    url: batch[idx].url,
                    result: r.status === 'fulfilled' ? r.value : { success: false, error: r.reason }
                })));
            }

            return results;
        }

        /**
         * Limpia el cache
         */
        clearCache() {
            this.cache.clear();
        }

        /**
         * Obtiene estadísticas
         */
        getStats() {
            return {
                ...this.stats,
                cache: this.cache.getStats(),
                successRate: this.stats.total > 0 ?
                    ((this.stats.success + this.stats.cached) / this.stats.total * 100).toFixed(2) + '%' :
                    'N/A'
            };
        }

        /**
         * Resetea estadísticas
         */
        resetStats() {
            this.stats = {
                total: 0,
                success: 0,
                failed: 0,
                cached: 0,
                skipped: 0
            };
        }

        /**
         * Helper: Sleep
         */
        _sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════
    const instance = new SessionWarmupEngine();
    window.SESSION_WARMUP_V9 = instance;
    window.APE_Warmup = instance; // Alias para compatibilidad

    console.log('%c🔥 APE Session Warmup v9.0 Cargado', 'color: #ff9800; font-weight: bold; font-size: 14px;');

})();
