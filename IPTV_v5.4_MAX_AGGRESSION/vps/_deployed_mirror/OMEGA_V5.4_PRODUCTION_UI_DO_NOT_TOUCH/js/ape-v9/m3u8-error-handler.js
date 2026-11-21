/**
 * ============================================================================
 * MANEJO DE ERRORES MEJORADO - TYPED ARRAYS ULTIMATE GENERATOR v16.0.0
 * ============================================================================
 * 
 * Este módulo proporciona manejo robusto de errores con fallbacks seguros
 * para todas las funciones críticas del generador M3U8.
 * 
 * Características:
 * - Try-catch en todas las funciones críticas
 * - Fallbacks seguros para cada operación
 * - Logging detallado de errores
 * - Validación de inputs
 * - Recuperación automática
 * 
 * ============================================================================
 */

// ============================================================================
// 1. CLASE DE ERROR PERSONALIZADO
// ============================================================================

class M3U8GeneratorError extends Error {
    constructor(message, code, context = {}) {
        super(message);
        this.name = 'M3U8GeneratorError';
        this.code = code;
        this.context = context;
        this.timestamp = new Date().toISOString();
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            context: this.context,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
}

// ============================================================================
// 2. LOGGER CENTRALIZADO
// ============================================================================

class ErrorLogger {
    constructor(enableConsole = true, enableFile = false) {
        this.enableConsole = enableConsole;
        this.enableFile = enableFile;
        this.logs = [];
        this.errors = [];
    }

    log(level, message, data = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data
        };

        this.logs.push(entry);

        if (this.enableConsole) {
            const prefix = {
                'ERROR': '❌',
                'WARN': '⚠️',
                'INFO': 'ℹ️',
                'DEBUG': '🔍'
            }[level] || '📝';

            console[level.toLowerCase()](
                `${prefix} [${level}] ${message}`,
                data
            );
        }
    }

    error(message, error, context = {}) {
        this.log('ERROR', message, { error: error.message, context });
        this.errors.push({
            timestamp: new Date().toISOString(),
            message,
            error: error.message,
            stack: error.stack,
            context
        });
    }

    warn(message, data = {}) {
        this.log('WARN', message, data);
    }

    info(message, data = {}) {
        this.log('INFO', message, data);
    }

    debug(message, data = {}) {
        this.log('DEBUG', message, data);
    }

    getErrors() {
        return this.errors;
    }

    getLogs() {
        return this.logs;
    }

    clear() {
        this.logs = [];
        this.errors = [];
    }
}

const logger = new ErrorLogger(true, false);

// ============================================================================
// 3. VALIDADORES
// ============================================================================

class Validators {
    /**
     * Valida que un canal tenga los campos requeridos
     * @param {Object} channel - Canal a validar
     * @returns {boolean} True si es válido
     */
    static validateChannel(channel) {
        if (!channel || typeof channel !== 'object') {
            throw new M3U8GeneratorError(
                'Canal debe ser un objeto',
                'INVALID_CHANNEL_TYPE',
                { received: typeof channel }
            );
        }

        const required = ['id', 'name', 'url'];
        const missing = required.filter(field => !channel[field]);

        if (missing.length > 0) {
            throw new M3U8GeneratorError(
                `Campos requeridos faltantes: ${missing.join(', ')}`,
                'MISSING_REQUIRED_FIELDS',
                { channel: channel.name || 'unknown', missing }
            );
        }

        if (typeof channel.url !== 'string' || !channel.url.startsWith('http')) {
            throw new M3U8GeneratorError(
                'URL debe ser una URL HTTP válida',
                'INVALID_URL',
                { url: channel.url }
            );
        }

        return true;
    }

    /**
     * Valida que un perfil sea válido
     * @param {string} profileId - ID del perfil (P0-P5)
     * @returns {boolean} True si es válido
     */
    static validateProfile(profileId) {
        const validProfiles = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

        if (!validProfiles.includes(profileId)) {
            throw new M3U8GeneratorError(
                `Perfil inválido: ${profileId}`,
                'INVALID_PROFILE',
                { received: profileId, valid: validProfiles }
            );
        }

        return true;
    }

    /**
     * Valida que un objeto sea un JSON válido
     * @param {Object} obj - Objeto a validar
     * @returns {boolean} True si es serializable
     */
    static validateJSON(obj) {
        try {
            JSON.stringify(obj);
            return true;
        } catch (e) {
            throw new M3U8GeneratorError(
                'Objeto no es serializable a JSON',
                'INVALID_JSON',
                { error: e.message }
            );
        }
    }
}

// ============================================================================
// 4. GENERACIÓN DE JWT CON MANEJO DE ERRORES
// ============================================================================

class JWTGenerator {
    /**
     * Genera JWT con manejo completo de errores
     * @param {Object} channel - Canal para el que generar JWT
     * @param {Object} options - Opciones adicionales
     * @returns {string} JWT válido o fallback
     */
    static generateJWT(channel, options = {}) {
        try {
            logger.debug('Generando JWT', { channelId: channel.id });

            // Validar entrada
            if (!channel || !channel.id) {
                throw new M3U8GeneratorError(
                    'Canal debe tener un ID',
                    'MISSING_CHANNEL_ID',
                    { channel }
                );
            }

            // Construir payload
            const payload = {
                iss: 'iptv-ape',
                sub: channel.id,
                aud: 'streaming',
                exp: Math.floor(Date.now() / 1000) + 3600,
                iat: Math.floor(Date.now() / 1000),
                jti: this.generateUUID(),
                ...options.customClaims
            };

            // Validar que sea serializable
            Validators.validateJSON(payload);

            // Crear JWT (simulado - en producción usar jsonwebtoken)
            const jwt = this.encodeJWT(payload);

            logger.info('JWT generado exitosamente', { channelId: channel.id });
            return jwt;

        } catch (error) {
            logger.error('Error generando JWT', error, { channelId: channel?.id });
            return this.getFallbackJWT(channel);
        }
    }

    /**
     * Codifica JWT (simulado)
     * @private
     */
    static encodeJWT(payload) {
        const header = { alg: 'HS256', typ: 'JWT' };
        const headerEncoded = btoa(JSON.stringify(header));
        const payloadEncoded = btoa(JSON.stringify(payload));
        const signature = 'simulated_signature';
        return `${headerEncoded}.${payloadEncoded}.${signature}`;
    }

    /**
     * Retorna JWT fallback seguro
     * @private
     */
    static getFallbackJWT(channel) {
        logger.warn('Usando JWT fallback', { channelId: channel?.id });
        return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    }

    /**
     * Genera UUID
     * @private
     */
    static generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

// ============================================================================
// 5. CONSTRUCCIÓN DE HEADERS CON MANEJO DE ERRORES
// ============================================================================

class HeaderBuilder {
    /**
     * Construye headers HTTP con manejo completo de errores
     * @param {string} profileId - ID del perfil
     * @param {Object} options - Opciones adicionales
     * @returns {Object} Headers válidos o fallback
     */
    static buildHeaders(profileId, options = {}) {
        try {
            logger.debug('Construyendo headers', { profileId });

            // Validar perfil
            Validators.validateProfile(profileId);

            // Obtener headers base
            const headers = this.getBaseHeaders(profileId);

            // Agregar headers personalizados
            if (options.customHeaders) {
                Validators.validateJSON(options.customHeaders);
                Object.assign(headers, options.customHeaders);
            }

            // Validar resultado
            Validators.validateJSON(headers);

            logger.info('Headers construidos exitosamente', { profileId });
            return headers;

        } catch (error) {
            logger.error('Error construyendo headers', error, { profileId });
            return this.getFallbackHeaders();
        }
    }

    /**
     * Retorna headers base para un perfil
     * @private
     */
    static getBaseHeaders(profileId) {
        const baseHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site'
        };

        // Agregar headers específicos por perfil
        const profileHeaders = {
            'P0': { 'X-Profile': 'P0-8K', 'X-Max-Resolution': '7680x4320' },
            'P1': { 'X-Profile': 'P1-4K', 'X-Max-Resolution': '3840x2160' },
            'P2': { 'X-Profile': 'P2-FHD', 'X-Max-Resolution': '1920x1080' },
            'P3': { 'X-Profile': 'P3-HD', 'X-Max-Resolution': '1280x720' },
            'P4': { 'X-Profile': 'P4-SD', 'X-Max-Resolution': '854x480' },
            'P5': { 'X-Profile': 'P5-LD', 'X-Max-Resolution': '640x360' }
        };

        return { ...baseHeaders, ...profileHeaders[profileId] };
    }

    /**
     * Retorna headers fallback seguros
     * @private
     */
    static getFallbackHeaders() {
        logger.warn('Usando headers fallback');
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        };
    }
}

// ============================================================================
// 6. VALIDACIÓN DE CANALES CON MANEJO DE ERRORES
// ============================================================================

class ChannelValidator {
    /**
     * Valida un array de canales
     * @param {Array} channels - Canales a validar
     * @returns {Object} { valid: [], invalid: [] }
     */
    static validateChannels(channels) {
        try {
            logger.debug('Validando canales', { count: channels?.length || 0 });

            if (!Array.isArray(channels)) {
                throw new M3U8GeneratorError(
                    'Canales debe ser un array',
                    'INVALID_CHANNELS_TYPE',
                    { received: typeof channels }
                );
            }

            if (channels.length === 0) {
                throw new M3U8GeneratorError(
                    'Array de canales está vacío',
                    'EMPTY_CHANNELS',
                    {}
                );
            }

            const valid = [];
            const invalid = [];

            channels.forEach((channel, index) => {
                try {
                    Validators.validateChannel(channel);
                    valid.push(channel);
                } catch (error) {
                    logger.warn(`Canal inválido en índice ${index}`, { error: error.message });
                    invalid.push({
                        index,
                        channel: channel.name || 'unknown',
                        error: error.message
                    });
                }
            });

            logger.info('Validación de canales completada', {
                valid: valid.length,
                invalid: invalid.length
            });

            return { valid, invalid };

        } catch (error) {
            logger.error('Error validando canales', error, {});
            return { valid: [], invalid: [] };
        }
    }
}

// ============================================================================
// 7. GENERACIÓN DE M3U8 CON MANEJO DE ERRORES
// ============================================================================

class M3U8Generator {
    /**
     * Genera contenido M3U8 completo con manejo de errores
     * @param {Array} channels - Canales a incluir
     * @param {string} profileId - ID del perfil
     * @returns {string} Contenido M3U8 válido
     */
    static generateM3U8(channels, profileId = 'P2') {
        try {
            logger.debug('Iniciando generación de M3U8', {
                channelCount: channels?.length || 0,
                profileId
            });

            // Validar inputs
            Validators.validateProfile(profileId);
            const { valid: validChannels, invalid: invalidChannels } =
                ChannelValidator.validateChannels(channels);

            if (validChannels.length === 0) {
                throw new M3U8GeneratorError(
                    'No hay canales válidos para generar M3U8',
                    'NO_VALID_CHANNELS',
                    { totalChannels: channels.length, invalidChannels: invalidChannels.length }
                );
            }

            // Construir M3U8
            const m3u8Lines = [];

            // Header
            try {
                m3u8Lines.push(this.generateHeader(profileId));
            } catch (error) {
                logger.error('Error generando header', error, {});
                m3u8Lines.push('#EXTM3U\n#EXT-X-VERSION:3');
            }

            // Canales
            let successCount = 0;
            let errorCount = 0;

            validChannels.forEach((channel, index) => {
                try {
                    m3u8Lines.push(this.generateChannelEntry(channel, profileId));
                    successCount++;
                } catch (error) {
                    logger.warn(`Error procesando canal ${index}`, {
                        channel: channel.name,
                        error: error.message
                    });
                    errorCount++;
                }
            });

            const m3u8Content = m3u8Lines.join('\n');

            logger.info('M3U8 generado exitosamente', {
                successCount,
                errorCount,
                totalLines: m3u8Lines.length
            });

            return m3u8Content;

        } catch (error) {
            logger.error('Error generando M3U8', error, { profileId });
            return this.getFallbackM3U8();
        }
    }

    /**
     * Genera header M3U8
     * @private
     */
    static generateHeader(profileId) {
        try {
            const headers = HeaderBuilder.buildHeaders(profileId);
            const headerJson = JSON.stringify(headers);

            return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-APE-HTTP-HEADERS:${headerJson}
#EXT-X-PLAYLIST-TYPE:EVENT`;

        } catch (error) {
            logger.error('Error generando header', error, {});
            return '#EXTM3U\n#EXT-X-VERSION:3';
        }
    }

    /**
     * Genera entrada de canal
     * @private
     */
    static generateChannelEntry(channel, profileId) {
        try {
            const jwt = JWTGenerator.generateJWT(channel);
            const url = `${channel.url}?jwt=${jwt}`;

            return `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}"
${url}`;

        } catch (error) {
            logger.error('Error generando entrada de canal', error, {
                channelId: channel.id
            });
            throw error;
        }
    }

    /**
     * Retorna M3U8 fallback
     * @private
     */
    static getFallbackM3U8() {
        logger.warn('Usando M3U8 fallback');
        return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
# Error: No se pudo generar M3U8. Por favor, intente más tarde.`;
    }
}

// ============================================================================
// 8. ESCRITURA DE M3U8 CON MANEJO DE ERRORES
// ============================================================================

class M3U8Writer {
    /**
     * Escribe contenido M3U8 a archivo
     * @param {string} content - Contenido M3U8
     * @param {string} filename - Nombre del archivo
     * @returns {boolean} True si fue exitoso
     */
    static writeFile(content, filename = 'playlist.m3u8') {
        try {
            logger.debug('Escribiendo archivo M3U8', { filename });

            if (!content || typeof content !== 'string') {
                throw new M3U8GeneratorError(
                    'Contenido debe ser un string válido',
                    'INVALID_CONTENT',
                    { contentType: typeof content }
                );
            }

            if (content.length === 0) {
                throw new M3U8GeneratorError(
                    'Contenido está vacío',
                    'EMPTY_CONTENT',
                    {}
                );
            }

            // Simular escritura a archivo
            const blob = new Blob([content], { type: 'application/vnd.apple.mpegurl' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);

            logger.info('Archivo M3U8 escrito exitosamente', {
                filename,
                size: content.length
            });

            return true;

        } catch (error) {
            logger.error('Error escribiendo archivo M3U8', error, { filename });
            return false;
        }
    }

    /**
     * Retorna contenido como string
     * @param {string} content - Contenido M3U8
     * @returns {string} Contenido o fallback
     */
    static getString(content) {
        try {
            if (!content || typeof content !== 'string') {
                throw new M3U8GeneratorError(
                    'Contenido inválido',
                    'INVALID_CONTENT',
                    {}
                );
            }
            return content;
        } catch (error) {
            logger.error('Error obteniendo string', error, {});
            return '';
        }
    }
}

// ============================================================================
// 9. EXPORTAR MÓDULO (BROWSER + NODE)
// ============================================================================

// Browser export
window.M3U8ErrorHandler = {
    M3U8GeneratorError,
    ErrorLogger,
    Validators,
    JWTGenerator,
    HeaderBuilder,
    ChannelValidator,
    M3U8Generator,
    M3U8Writer,
    logger
};

// Node.js export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        M3U8GeneratorError,
        ErrorLogger,
        Validators,
        JWTGenerator,
        HeaderBuilder,
        ChannelValidator,
        M3U8Generator,
        M3U8Writer,
        logger
    };
}

console.log('%c✅ M3U8 Error Handler v16.0.0 Cargado', 'color: #10b981; font-weight: bold;');
