/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📏 URL LENGTH VALIDATOR MODULE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Valida y controla la longitud de URLs para compatibilidad con reproductores
 * 
 * - Verifica que URLs no excedan 2000 caracteres
 * - Activa automáticamente JWT Compact si excede límite
 * - Reporta estadísticas de longitud
 * - Integración con ApeModuleManager
 * 
 * @version 1.0.0
 * @module url-length-validator
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const MODULE_ID = 'url-length-validator';
    const VERSION = '1.0.0';

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN DE LÍMITES
    // ═══════════════════════════════════════════════════════════════════════════

    const URL_LIMITS = {
        // Límites por reproductor
        OTT_NAVIGATOR: 2000,
        TIVIMATE: 2000,
        SMARTERS: 1500,
        VLC: 8000,
        KODI: 8000,
        PERFECT_PLAYER: 2000,

        // Límites generales
        SAFE: 1500,           // Seguro para todos los reproductores
        RECOMMENDED: 2000,    // Recomendado
        MAX_ABSOLUTE: 8192,   // Máximo técnico HTTP

        // Modo por defecto
        DEFAULT: 2000
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // ESTADÍSTICAS
    // ═══════════════════════════════════════════════════════════════════════════

    const stats = {
        urlsValidated: 0,
        urlsPassed: 0,
        urlsFailed: 0,
        urlsTruncated: 0,
        averageLength: 0,
        maxLengthSeen: 0,
        minLengthSeen: Infinity,
        compactJWTActivations: 0
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════════

    class URLLengthValidator {
        constructor(options = {}) {
            this.maxLength = options.maxLength || URL_LIMITS.DEFAULT;
            this.safeLength = options.safeLength || URL_LIMITS.SAFE;
            this.player = options.player || 'UNKNOWN';
            this.autoCompact = options.autoCompact !== false;
        }

        /**
         * Valida una URL y retorna resultado detallado
         * @param {string} url - URL a validar
         * @returns {Object} Resultado de validación
         */
        validate(url) {
            if (!url || typeof url !== 'string') {
                return {
                    valid: false,
                    length: 0,
                    error: 'URL inválida o vacía',
                    recommendation: 'CHECK_URL'
                };
            }

            const length = url.length;
            stats.urlsValidated++;
            stats.averageLength = ((stats.averageLength * (stats.urlsValidated - 1)) + length) / stats.urlsValidated;
            stats.maxLengthSeen = Math.max(stats.maxLengthSeen, length);
            stats.minLengthSeen = Math.min(stats.minLengthSeen, length);

            const result = {
                valid: length <= this.maxLength,
                length: length,
                maxAllowed: this.maxLength,
                exceeds: Math.max(0, length - this.maxLength),
                percentage: Math.round((length / this.maxLength) * 100),
                recommendation: this._getRecommendation(length),
                details: {
                    isSafe: length <= this.safeLength,
                    isRecommended: length <= URL_LIMITS.RECOMMENDED,
                    player: this.player,
                    timestamp: new Date().toISOString()
                }
            };

            if (result.valid) {
                stats.urlsPassed++;
            } else {
                stats.urlsFailed++;
            }

            return result;
        }

        /**
         * Obtiene recomendación basada en longitud
         */
        _getRecommendation(length) {
            if (length <= URL_LIMITS.SAFE) {
                return 'OK';
            } else if (length <= URL_LIMITS.RECOMMENDED) {
                return 'ACCEPTABLE';
            } else if (length <= URL_LIMITS.MAX_ABSOLUTE) {
                return 'USE_COMPACT_JWT';
            } else {
                return 'URL_TOO_LONG';
            }
        }

        /**
         * Valida URL y aplica JWT Compact si es necesario
         * @param {string} baseUrl - URL base sin JWT
         * @param {Object} channel - Datos del canal
         * @param {Object} profile - Perfil de calidad
         * @param {Function} fullJWTGenerator - Generador de JWT completo
         * @param {Function} compactJWTGenerator - Generador de JWT compacto
         * @returns {Object} URL final y metadata
         */
        validateAndOptimize(baseUrl, channel, profile, fullJWTGenerator, compactJWTGenerator) {
            // Primero intentar con JWT Full
            const fullJWT = fullJWTGenerator(channel, profile, 0);
            const fullUrl = `${baseUrl}?ape_jwt=${fullJWT}`;
            const fullValidation = this.validate(fullUrl);

            if (fullValidation.valid) {
                return {
                    url: fullUrl,
                    jwtMode: 'FULL',
                    jwtLength: fullJWT.length,
                    urlLength: fullUrl.length,
                    optimized: false
                };
            }

            // Si excede, usar JWT Compact
            if (this.autoCompact && compactJWTGenerator) {
                const compactJWT = compactJWTGenerator(channel, profile, 0);
                const compactUrl = `${baseUrl}?ape_jwt=${compactJWT}`;
                const compactValidation = this.validate(compactUrl);

                stats.compactJWTActivations++;

                if (compactValidation.valid) {
                    console.log(`📏 [URL-VALIDATOR] Auto-compact aplicado: ${fullUrl.length} → ${compactUrl.length} chars`);
                    return {
                        url: compactUrl,
                        jwtMode: 'COMPACT',
                        jwtLength: compactJWT.length,
                        urlLength: compactUrl.length,
                        optimized: true,
                        originalLength: fullUrl.length,
                        saved: fullUrl.length - compactUrl.length
                    };
                }
            }

            // Último recurso: URL sin JWT
            console.warn(`⚠️ [URL-VALIDATOR] URL demasiado larga incluso con Compact JWT, usando URL sin JWT`);
            stats.urlsTruncated++;
            return {
                url: baseUrl,
                jwtMode: 'NONE',
                jwtLength: 0,
                urlLength: baseUrl.length,
                optimized: true,
                warning: 'JWT omitido por longitud excesiva'
            };
        }

        /**
         * Configura límite según reproductor
         * @param {string} player - Nombre del reproductor
         */
        setPlayer(player) {
            this.player = player.toUpperCase().replace(/\s+/g, '_');
            this.maxLength = URL_LIMITS[this.player] || URL_LIMITS.DEFAULT;
            console.log(`📏 [URL-VALIDATOR] Player: ${this.player}, Max URL: ${this.maxLength}`);
        }

        /**
         * Obtiene estadísticas actuales
         */
        getStats() {
            return { ...stats };
        }

        /**
         * Resetea estadísticas
         */
        resetStats() {
            stats.urlsValidated = 0;
            stats.urlsPassed = 0;
            stats.urlsFailed = 0;
            stats.urlsTruncated = 0;
            stats.averageLength = 0;
            stats.maxLengthSeen = 0;
            stats.minLengthSeen = Infinity;
            stats.compactJWTActivations = 0;
        }

        /**
         * Genera reporte de validación para múltiples URLs
         * @param {string[]} urls - Array de URLs
         */
        batchValidate(urls) {
            const results = urls.map(url => this.validate(url));
            const passed = results.filter(r => r.valid).length;
            const failed = results.filter(r => !r.valid).length;

            return {
                total: urls.length,
                passed,
                failed,
                passRate: Math.round((passed / urls.length) * 100),
                results,
                recommendations: {
                    needsCompact: results.filter(r => r.recommendation === 'USE_COMPACT_JWT').length,
                    tooLong: results.filter(r => r.recommendation === 'URL_TOO_LONG').length
                }
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INSTANCIA SINGLETON
    // ═══════════════════════════════════════════════════════════════════════════

    const defaultValidator = new URLLengthValidator();

    // ═══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════════════════════

    const URLLengthValidatorModule = {
        MODULE_ID,
        VERSION,
        URL_LIMITS,

        // Clase para instancias personalizadas
        URLLengthValidator,

        // Métodos del singleton
        validate: (url) => defaultValidator.validate(url),
        validateAndOptimize: (...args) => defaultValidator.validateAndOptimize(...args),
        setPlayer: (player) => defaultValidator.setPlayer(player),
        getStats: () => defaultValidator.getStats(),
        resetStats: () => defaultValidator.resetStats(),
        batchValidate: (urls) => defaultValidator.batchValidate(urls),

        // Crear instancia personalizada
        create: (options) => new URLLengthValidator(options),

        // Info del módulo
        getInfo: () => ({
            id: MODULE_ID,
            version: VERSION,
            description: 'Valida longitud de URLs para compatibilidad con reproductores',
            limits: URL_LIMITS
        })
    };

    // Exponer globalmente
    window.URLLengthValidator = URLLengthValidatorModule;

    // Registrar en ApeModuleManager si existe
    if (window.ApeModuleManager && typeof window.ApeModuleManager.register === 'function') {
        window.ApeModuleManager.register({
            id: MODULE_ID,
            name: 'URL Length Validator',
            description: 'Valida URLs < 2000 chars, activa JWT Compact automáticamente',
            category: 'optimization',
            version: VERSION,
            enabled: true,
            loaded: true
        });
    }

    console.log(`%c📏 URL Length Validator v${VERSION} cargado - Límite default: ${URL_LIMITS.DEFAULT} chars`,
        'color: #3b82f6; font-weight: bold;');

})();
