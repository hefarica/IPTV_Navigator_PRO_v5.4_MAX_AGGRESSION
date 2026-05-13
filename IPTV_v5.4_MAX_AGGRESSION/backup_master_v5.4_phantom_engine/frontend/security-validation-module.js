/**
 * SECURITY-VALIDATION-MODULE.js
 * IPTV Navigator PRO - Módulo de Seguridad y Validación v1.0
 * 
 * ⚠️ PROPÓSITO:
 * - Validación de entrada con esquemas Zod-like
 * - Sanitización anti-XSS para datos externos (APIs Xtream)
 * - Validación de URLs con protección SSRF
 * - Hardening de datos de canal
 * 
 * ✅ COMPLIANCE:
 * - OWASP A03:2025 (Injection)
 * - OWASP A10:2025 (Exceptional Conditions)
 * - Política de persistencia IndexedDB
 */

class SecurityValidationModule {
    constructor(appInstance) {
        this.app = appInstance;
        this.validators = this._initValidators();
        this.sanitizers = this._initSanitizers();
        this.auditEnabled = true;

        console.log('🔒 SecurityValidationModule v1.0 inicializado');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. VALIDADORES DE ESQUEMA (Zod-like)
    // ═══════════════════════════════════════════════════════════════════════

    _initValidators() {
        return {
            /**
             * Esquema de conexión de servidor Xtream
             */
            serverConnection: {
                validate: (data) => {
                    const errors = [];

                    // baseUrl: requerido, URL válida
                    if (!data.baseUrl || typeof data.baseUrl !== 'string') {
                        errors.push({ field: 'baseUrl', message: 'URL del servidor es requerida' });
                    } else if (!this._isValidUrl(data.baseUrl)) {
                        errors.push({ field: 'baseUrl', message: 'URL del servidor inválida' });
                    } else if (this._isPotentialSSRF(data.baseUrl)) {
                        errors.push({ field: 'baseUrl', message: 'URL bloqueada por política de seguridad (SSRF protection)' });
                    }

                    // username: requerido, alfanumérico
                    if (!data.username || typeof data.username !== 'string') {
                        errors.push({ field: 'username', message: 'Nombre de usuario es requerido' });
                    } else if (data.username.length > 100) {
                        errors.push({ field: 'username', message: 'Nombre de usuario excede límite (máx 100 caracteres)' });
                    } else if (!/^[a-zA-Z0-9_\-@.]+$/.test(data.username)) {
                        errors.push({ field: 'username', message: 'Nombre de usuario contiene caracteres inválidos' });
                    }

                    // password: requerido
                    if (!data.password || typeof data.password !== 'string') {
                        errors.push({ field: 'password', message: 'Contraseña es requerida' });
                    } else if (data.password.length > 200) {
                        errors.push({ field: 'password', message: 'Contraseña excede límite (máx 200 caracteres)' });
                    }

                    // serverName: opcional, string
                    if (data.serverName && typeof data.serverName !== 'string') {
                        errors.push({ field: 'serverName', message: 'Nombre de servidor debe ser texto' });
                    }

                    return {
                        valid: errors.length === 0,
                        errors,
                        data: errors.length === 0 ? this._sanitizeServerConnection(data) : null
                    };
                }
            },

            /**
             * Esquema de canal de API Xtream
             */
            channelFromApi: {
                validate: (data) => {
                    if (!data || typeof data !== 'object') {
                        return { valid: false, errors: [{ field: 'root', message: 'Canal inválido' }], data: null };
                    }

                    // Canal mínimo válido: acepta múltiples campos de identidad Xtream API
                    const hasName = data.name && typeof data.name === 'string' && data.name.trim() !== '';
                    const hasStreamId = data.stream_id != null;
                    const hasNum = data.num != null;
                    const hasTitle = data.title && typeof data.title === 'string' && data.title.trim() !== '';
                    const hasEpgId = data.epg_channel_id != null;

                    if (!hasName && !hasStreamId && !hasNum && !hasTitle && !hasEpgId) {
                        return {
                            valid: false,
                            errors: [{ field: 'identity', message: 'Canal debe tener name, stream_id, num, title o epg_channel_id' }],
                            data: null
                        };
                    }

                    // Sanitizar y retornar
                    return {
                        valid: true,
                        errors: [],
                        data: this._sanitizeChannel(data)
                    };
                }
            },

            /**
             * Esquema de configuración de filtro avanzado
             */
            filterConfig: {
                validate: (data) => {
                    const errors = [];

                    if (!data || typeof data !== 'object') {
                        return { valid: false, errors: [{ field: 'root', message: 'Configuración inválida' }], data: null };
                    }

                    // groups: debe ser array
                    if (data.groups && !Array.isArray(data.groups)) {
                        errors.push({ field: 'groups', message: 'Groups debe ser un array' });
                    }

                    // Validar cada grupo
                    if (Array.isArray(data.groups)) {
                        data.groups.forEach((group, idx) => {
                            if (!group.rules || !Array.isArray(group.rules)) {
                                errors.push({ field: `groups[${idx}].rules`, message: 'Rules debe ser un array' });
                            }
                        });
                    }

                    return {
                        valid: errors.length === 0,
                        errors,
                        data: errors.length === 0 ? data : null
                    };
                }
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. SANITIZADORES ANTI-XSS
    // ═══════════════════════════════════════════════════════════════════════

    _initSanitizers() {
        // Mapa de entidades HTML para escape
        const htmlEntities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        };

        return {
            /**
             * Escapa caracteres HTML peligrosos
             */
            escapeHtml: (str) => {
                if (typeof str !== 'string') return str;
                return str.replace(/[&<>"'`=\/]/g, char => htmlEntities[char] || char);
            },

            /**
             * Elimina scripts y tags peligrosos de strings
             */
            stripDangerousTags: (str) => {
                if (typeof str !== 'string') return str;

                // Eliminar tags de script, iframe, object, embed, etc.
                return str
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
                    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
                    .replace(/<embed\b[^>]*>/gi, '')
                    .replace(/<link\b[^>]*>/gi, '')
                    .replace(/javascript:/gi, '')
                    .replace(/data:/gi, 'data-blocked:')
                    .replace(/on\w+\s*=/gi, 'data-blocked='); // onclick=, onerror=, etc.
            },

            /**
             * Limpia URL para prevenir XSS en atributos href/src
             */
            sanitizeUrl: (url) => {
                if (typeof url !== 'string') return '';

                const trimmed = url.trim();

                // Bloquear protocolos peligrosos
                if (/^(javascript|data|vbscript):/i.test(trimmed)) {
                    console.warn('🔒 URL bloqueada por protocolo peligroso:', trimmed.substring(0, 30));
                    return '';
                }

                return trimmed;
            },

            /**
             * Sanitiza nombre de canal (para display en HTML)
             */
            sanitizeChannelName: (name) => {
                if (typeof name !== 'string') return 'Sin Nombre';
                return this.sanitizers.escapeHtml(
                    this.sanitizers.stripDangerousTags(name.trim())
                ).substring(0, 200); // Límite razonable
            },

            /**
             * Sanitiza grupo de canal
             */
            sanitizeGroup: (group) => {
                if (typeof group !== 'string') return 'General';
                return this.sanitizers.escapeHtml(
                    this.sanitizers.stripDangerousTags(group.trim())
                ).substring(0, 100);
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. PROTECCIÓN SSRF (Server-Side Request Forgery)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Detecta URLs potencialmente peligrosas (redes locales, metadata, etc.)
     * @param {string} url - URL a validar
     * @returns {boolean} true si es potencial SSRF
     */
    _isPotentialSSRF(url) {
        if (typeof url !== 'string') return true;

        const normalizedUrl = url.toLowerCase().trim();

        // Patrones bloqueados
        const blockedPatterns = [
            // Localhost
            /^https?:\/\/localhost/i,
            /^https?:\/\/127\.\d+\.\d+\.\d+/i,
            /^https?:\/\/\[::1\]/i,

            // Redes privadas
            /^https?:\/\/10\.\d+\.\d+\.\d+/i,
            /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/i,
            /^https?:\/\/192\.168\.\d+\.\d+/i,

            // Link-local
            /^https?:\/\/169\.254\.\d+\.\d+/i,

            // Metadata endpoints (cloud)
            /^https?:\/\/169\.254\.169\.254/i, // AWS/GCP metadata
            /^https?:\/\/metadata\.google/i,
            /^https?:\/\/metadata\.azure/i,

            // File protocol
            /^file:/i
        ];

        return blockedPatterns.some(pattern => pattern.test(normalizedUrl));
    }

    /**
     * Valida si una URL es válida y accesible
     */
    _isValidUrl(url) {
        if (typeof url !== 'string') return false;

        try {
            // Asegurar protocolo
            let normalizedUrl = url.trim();
            if (!/^https?:\/\//i.test(normalizedUrl)) {
                normalizedUrl = 'http://' + normalizedUrl;
            }

            const parsed = new URL(normalizedUrl);
            return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. SANITIZADORES DE DATOS ESTRUCTURADOS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Sanitiza datos de conexión de servidor
     */
    _sanitizeServerConnection(data) {
        return {
            baseUrl: this._normalizeServerUrl(data.baseUrl),
            username: (data.username || '').trim().substring(0, 100),
            password: (data.password || '').substring(0, 200),
            serverName: data.serverName
                ? this.sanitizers.escapeHtml(data.serverName.trim()).substring(0, 100)
                : ''
        };
    }

    /**
     * Normaliza URL de servidor Xtream
     */
    _normalizeServerUrl(url) {
        let normalized = (url || '').trim();

        // Asegurar protocolo
        if (!/^https?:\/\//i.test(normalized)) {
            normalized = 'http://' + normalized;
        }

        // Quitar barras finales
        normalized = normalized.replace(/\/+$/, '');

        // Quitar player_api.php si existe
        normalized = normalized.replace(/\/player_api\.php$/i, '');

        return normalized;
    }

    /**
     * Sanitiza un canal completo de la API
     */
    _sanitizeChannel(channel) {
        if (!channel || typeof channel !== 'object') return null;

        const sanitized = {
            // Identidad (preservar originales para lógica interna)
            stream_id: channel.stream_id ?? channel.id ?? null,
            id: channel.id ?? channel.stream_id ?? null,

            // Campos de display (sanitizados para HTML) - con fallbacks robustos
            name: this.sanitizers.sanitizeChannelName(channel.name || channel.title || `Canal ${channel.stream_id || channel.num || 'Sin nombre'}`),
            group: this.sanitizers.sanitizeGroup(channel.category_name || channel.group_title || channel.group),

            // URLs (sanitizadas)
            logo: this.sanitizers.sanitizeUrl(channel.stream_icon || channel.logo || ''),
            stream_icon: this.sanitizers.sanitizeUrl(channel.stream_icon || channel.logo || ''),

            // Metadatos técnicos (valores primitivos, sin riesgo XSS)
            tvg_id: this._sanitizeString(channel.tvg_id || channel.epg_channel_id, 100),
            tvg_name: this.sanitizers.sanitizeChannelName(channel.tvg_name || channel.name),
            category_name: this.sanitizers.sanitizeGroup(channel.category_name),
            category_id: this._sanitizeNumber(channel.category_id),

            // Datos técnicos (números y strings simples)
            stream_type: this._sanitizeString(channel.stream_type, 20),
            type: this._sanitizeString(channel.type, 20),
            num: this._sanitizeNumber(channel.num),

            // Preservar raw para lógica interna (pero sanitizado)
            _raw_original: channel // Referencia para debugging
        };

        return sanitized;
    }

    /**
     * Sanitiza un string simple
     */
    _sanitizeString(value, maxLength = 500) {
        if (value === null || value === undefined) return '';
        return String(value).substring(0, maxLength);
    }

    /**
     * Sanitiza un número
     */
    _sanitizeNumber(value) {
        const num = Number(value);
        return isNaN(num) ? 0 : num;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. API PÚBLICA (Integración con app.js)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Valida datos de conexión antes de conectar a servidor
     * @param {object} connectionData - {baseUrl, username, password, serverName?}
     * @returns {object} {valid, errors, data}
     */
    validateConnection(connectionData) {
        const result = this.validators.serverConnection.validate(connectionData);

        if (!result.valid && this.auditEnabled) {
            this._logSecurityEvent('VALIDATION_FAILED', 'serverConnection', result.errors);
        }

        return result;
    }

    /**
     * Sanitiza un array de canales de la API
     * @param {array} channels - Array de canales crudos de API Xtream
     * @returns {array} Canales sanitizados
     */
    sanitizeChannelsFromApi(channels) {
        if (!Array.isArray(channels)) {
            console.warn('🔒 sanitizeChannelsFromApi: entrada no es array');
            return [];
        }

        const sanitized = [];
        let skipped = 0;

        channels.forEach((ch, idx) => {
            const result = this.validators.channelFromApi.validate(ch);

            if (result.valid) {
                sanitized.push(result.data);
            } else {
                skipped++;
                if (skipped <= 5) { // Log primeros 5 errores
                    console.warn(`🔒 Canal #${idx} inválido:`, result.errors[0]?.message);
                }
            }
        });

        if (skipped > 0) {
            console.log(`🔒 Sanitización completada: ${sanitized.length} válidos, ${skipped} omitidos`);
        }

        return sanitized;
    }

    /**
     * Sanitiza un valor para display seguro en HTML
     * @param {any} value - Valor a sanitizar
     * @returns {string} Valor escapado para HTML
     */
    escapeForHtml(value) {
        return this.sanitizers.escapeHtml(String(value ?? ''));
    }

    /**
     * Valida URL antes de hacer fetch
     * @param {string} url - URL a validar
     * @returns {object} {valid, error?}
     */
    validateFetchUrl(url) {
        if (!this._isValidUrl(url)) {
            return { valid: false, error: 'URL inválida' };
        }

        if (this._isPotentialSSRF(url)) {
            return { valid: false, error: 'URL bloqueada por política de seguridad' };
        }

        return { valid: true };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. AUDITORÍA DE SEGURIDAD
    // ═══════════════════════════════════════════════════════════════════════

    _logSecurityEvent(eventType, context, details) {
        const event = {
            timestamp: new Date().toISOString(),
            type: eventType,
            context,
            details,
            userAgent: navigator?.userAgent?.substring(0, 100) || 'unknown'
        };

        console.warn('🔒 SECURITY_EVENT:', event);

        // Si app tiene logAuditEvent, usar también
        if (this.app && typeof this.app.logAuditEvent === 'function') {
            this.app.logAuditEvent('SECURITY_' + eventType, JSON.stringify(details));
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTAR GLOBALMENTE
// ═══════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.SecurityValidationModule = SecurityValidationModule;
    console.log('🔒 SecurityValidationModule disponible en window.SecurityValidationModule');
}
