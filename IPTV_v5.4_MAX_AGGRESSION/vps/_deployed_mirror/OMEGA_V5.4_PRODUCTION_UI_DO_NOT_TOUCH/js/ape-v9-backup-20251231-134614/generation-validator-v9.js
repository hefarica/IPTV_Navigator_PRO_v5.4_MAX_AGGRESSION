/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🛡️ APE GENERATION VALIDATOR v9.0
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * PROPÓSITO: Capa de seguridad y sanitización antes de la generación M3U
 * 
 * FUNCIONES:
 * 1. Protocol Enforcer: Corrige URLs sin http/https
 * 2. Validación estructural: Detecta URLs malformadas
 * 3. Hard-Fail Protection: Bloquea generación si >50% corrupto
 * 4. Deduplicación: Elimina canales duplicados
 * 5. Sanitización: Limpia caracteres peligrosos
 * 
 * AUTOR: APE Engine Team
 * VERSIÓN: 9.0.0
 * FECHA: 2024-12-29
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN
    // ═══════════════════════════════════════════════════════════════════════
    const CONFIG = {
        // Protocolo por defecto (HTTP para máxima compatibilidad IPTV)
        DEFAULT_PROTOCOL: 'http://',
        
        // Umbral de corrupción para Hard-Fail (%)
        CORRUPTION_THRESHOLD: 50,
        
        // Longitud mínima de URL válida
        MIN_URL_LENGTH: 10,
        
        // Patrones de URLs locales/inválidas
        INVALID_PATTERNS: [
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            '192.168.',
            '10.0.',
            '172.16.',
            'file://',
            'javascript:',
            'data:',
            'about:'
        ],
        
        // Extensiones de archivo no válidas para streaming
        INVALID_EXTENSIONS: [
            '.exe', '.bat', '.cmd', '.sh', '.ps1',
            '.zip', '.rar', '.7z',
            '.html', '.htm', '.php', '.asp'
        ]
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CLASE VALIDADOR
    // ═══════════════════════════════════════════════════════════════════════
    class GenerationValidator {
        constructor() {
            this.protocolRegex = /^https?:\/\//i;
            this.stats = {
                total: 0,
                valid: 0,
                repaired: 0,
                critical: 0,
                duplicates: 0,
                sanitized: 0
            };
        }

        /**
         * Valida y sanitiza un lote de canales
         * @param {Array} channels - Array de objetos canal
         * @returns {object} Resultado de validación
         */
        validateBatch(channels) {
            // Reset stats
            this.stats = {
                total: 0,
                valid: 0,
                repaired: 0,
                critical: 0,
                duplicates: 0,
                sanitized: 0
            };

            // Validación de entrada
            if (!Array.isArray(channels)) {
                return this._failResult('INVALID_INPUT', 'El input no es un array');
            }

            if (channels.length === 0) {
                return this._failResult('DATASET_EMPTY', 'El array de canales está vacío');
            }

            this.stats.total = channels.length;

            // Fase 1: Validación y reparación
            const processed = [];
            const seenUrls = new Set();

            for (const ch of channels) {
                // Validar estructura básica del objeto
                if (!ch || typeof ch !== 'object') {
                    this.stats.critical++;
                    continue;
                }

                // Procesar URL
                const urlResult = this._processUrl(ch.url);
                
                if (urlResult.critical) {
                    this.stats.critical++;
                    continue;
                }

                if (urlResult.repaired) {
                    this.stats.repaired++;
                }

                // Deduplicación
                if (seenUrls.has(urlResult.url)) {
                    this.stats.duplicates++;
                    continue;
                }
                seenUrls.add(urlResult.url);

                // Sanitizar campos de texto
                const sanitizedChannel = this._sanitizeChannel({
                    ...ch,
                    url: urlResult.url
                });

                if (sanitizedChannel.wasSanitized) {
                    this.stats.sanitized++;
                }

                processed.push(sanitizedChannel.channel);
                this.stats.valid++;
            }

            // Fase 2: Hard-Fail Check
            const corruptionRate = (this.stats.critical / this.stats.total) * 100;
            
            if (corruptionRate > CONFIG.CORRUPTION_THRESHOLD) {
                return this._failResult(
                    'CRITICAL_CORRUPTION_THRESHOLD_EXCEEDED',
                    `${corruptionRate.toFixed(1)}% de los canales son inválidos (umbral: ${CONFIG.CORRUPTION_THRESHOLD}%)`
                );
            }

            // Fase 3: Validación post-proceso
            if (processed.length === 0) {
                return this._failResult(
                    'NO_VALID_CHANNELS',
                    'No se encontraron canales válidos después de la validación'
                );
            }

            // Success
            return {
                valid: true,
                cleanChannels: processed,
                stats: this.stats,
                warnings: this._generateWarnings()
            };
        }

        /**
         * Procesa y valida una URL individual
         */
        _processUrl(url) {
            // Normalizar a string
            url = (url || '').trim();

            // Validación longitud mínima
            if (url.length < CONFIG.MIN_URL_LENGTH) {
                return { critical: true, reason: 'too_short' };
            }

            let repaired = false;

            // Protocol Enforcer: Añadir protocolo si falta
            if (!this.protocolRegex.test(url)) {
                // Limpiar barras iniciales múltiples
                url = url.replace(/^\/+/, '');
                url = CONFIG.DEFAULT_PROTOCOL + url;
                repaired = true;
            }

            // Validar patrones inválidos
            const urlLower = url.toLowerCase();
            for (const pattern of CONFIG.INVALID_PATTERNS) {
                if (urlLower.includes(pattern)) {
                    return { critical: true, reason: 'invalid_pattern', pattern };
                }
            }

            // Validar extensiones no permitidas
            for (const ext of CONFIG.INVALID_EXTENSIONS) {
                if (urlLower.endsWith(ext)) {
                    return { critical: true, reason: 'invalid_extension', ext };
                }
            }

            // Validación de formato URL básica
            try {
                new URL(url);
            } catch {
                return { critical: true, reason: 'malformed_url' };
            }

            return { critical: false, url, repaired };
        }

        /**
         * Sanitiza campos de texto de un canal
         */
        _sanitizeChannel(channel) {
            let wasSanitized = false;
            const sanitized = { ...channel };

            // Sanitizar nombre
            if (sanitized.name) {
                const original = sanitized.name;
                sanitized.name = this._sanitizeText(original);
                if (sanitized.name !== original) wasSanitized = true;
            }

            // Sanitizar grupo
            if (sanitized.group) {
                const original = sanitized.group;
                sanitized.group = this._sanitizeText(original);
                if (sanitized.group !== original) wasSanitized = true;
            }

            // Sanitizar tvg-id
            if (sanitized.id) {
                const original = sanitized.id;
                sanitized.id = this._sanitizeText(original, true);
                if (sanitized.id !== original) wasSanitized = true;
            }

            return { channel: sanitized, wasSanitized };
        }

        /**
         * Sanitiza texto (elimina caracteres peligrosos)
         */
        _sanitizeText(text, strict = false) {
            if (typeof text !== 'string') return '';

            let sanitized = text.trim();

            // Eliminar caracteres de control
            sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

            if (strict) {
                // Modo estricto: Solo alfanuméricos, guiones y underscores
                sanitized = sanitized.replace(/[^a-zA-Z0-9\-_.]/g, '_');
            } else {
                // Eliminar solo caracteres problemáticos en M3U
                sanitized = sanitized.replace(/["\r\n]/g, '');
            }

            return sanitized;
        }

        /**
         * Genera resultado de fallo
         */
        _failResult(error, message) {
            return {
                valid: false,
                error,
                message,
                stats: this.stats
            };
        }

        /**
         * Genera advertencias basadas en stats
         */
        _generateWarnings() {
            const warnings = [];

            if (this.stats.repaired > 0) {
                warnings.push({
                    type: 'info',
                    message: `${this.stats.repaired} URLs fueron reparadas automáticamente (Protocol-Enforcer)`
                });
            }

            if (this.stats.duplicates > 0) {
                warnings.push({
                    type: 'warning',
                    message: `${this.stats.duplicates} canales duplicados fueron eliminados`
                });
            }

            if (this.stats.sanitized > 0) {
                warnings.push({
                    type: 'info',
                    message: `${this.stats.sanitized} canales tuvieron campos de texto sanitizados`
                });
            }

            if (this.stats.critical > 0) {
                const criticalRate = (this.stats.critical / this.stats.total * 100).toFixed(1);
                warnings.push({
                    type: 'warning',
                    message: `${this.stats.critical} canales (${criticalRate}%) fueron descartados por errores críticos`
                });
            }

            return warnings;
        }

        /**
         * Obtiene estadísticas
         */
        getStats() {
            return { ...this.stats };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════
    const instance = new GenerationValidator();
    window.GENERATION_VALIDATOR_V9 = instance;
    window.ApeValidator = instance; // Alias para compatibilidad con v8.7

    console.log('%c🛡️ APE Generation Validator v9.0 Cargado', 'color: #2196f3; font-weight: bold; font-size: 14px;');

})();
