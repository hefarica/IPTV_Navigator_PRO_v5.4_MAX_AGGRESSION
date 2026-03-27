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
    // v9.1: RULES ENGINE — Políticas de deduplicación EXTVLCOPT
    // ═══════════════════════════════════════════════════════════════════════
    const VLC_RULES = {
        // KEEP_HIGHEST (NEVER_DOWN): el valor numérico más alto gana
        KEEP_HIGHEST: new Set([
            'network-caching', 'live-caching', 'file-caching', 'disc-caching',
            'tcp-caching', 'sout-mux-caching', 'clock-jitter',
            'preferred-resolution', 'adaptive-maxwidth', 'adaptive-maxheight',
            'postproc-quality', 'swscale-mode', 'mtu',
            'sout-video-bitrate', 'sout-video-maxrate', 'sout-video-bufsize',
            'repeat', 'input-repeat', 'adaptive-cache-size'
        ]),
        // KEEP_LOWEST (NEVER_UP): el valor numérico más bajo gana
        KEEP_LOWEST: new Set([
            'avcodec-hurry-up', 'avcodec-fast', 'avcodec-skiploopfilter',
            'avcodec-skipframe', 'avcodec-skip-idct', 'avcodec-lowres'
        ]),
        // KEEP_FIRST (EXACT_MATCH): la primera instancia gana
        KEEP_FIRST: new Set([
            'avcodec-hw', 'clock-synchro', 'deinterlace-mode',
            'preferred-codec', 'codec-priority', 'adaptive-logic',
            'video-filter', 'deinterlace'
        ])
    };

    // ═══════════════════════════════════════════════════════════════════════
    // v9.1: PROFILE TABLE — Resolución/BW por perfil KODIPROP
    // ═══════════════════════════════════════════════════════════════════════
    const PROFILE_TABLE = {
        P0: { maxRes: '7680x4320', maxBw: 130000000, maxFps: 120 },
        P1: { maxRes: '3840x2160', maxBw:  50000000, maxFps:  60 },
        P2: { maxRes: '3840x2160', maxBw:  35000000, maxFps:  30 },
        P3: { maxRes: '1920x1080', maxBw:  15000000, maxFps:  60 },
        P4: { maxRes: '1280x720',  maxBw:   8000000, maxFps:  30 },
        P5: { maxRes: '854x480',   maxBw:   3000000, maxFps:  25 }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // v9.1: UNICODE SANITIZATION MAP
    // ═══════════════════════════════════════════════════════════════════════
    const UNICODE_SANITIZE = [
        { from: /\u2503/g, to: '|' },   // BOX DRAWINGS HEAVY VERTICAL → PIPE
        { from: /\u2502/g, to: '|' },   // BOX DRAWINGS LIGHT VERTICAL → PIPE
        { from: /\u2551/g, to: '|' },   // BOX DRAWINGS DOUBLE VERTICAL → PIPE
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // v9.1: SCHEMA TRANSLATOR — Channel → Payload Normalizer
    // ═══════════════════════════════════════════════════════════════════════
    const SchemaTranslator = {
        /**
         * Normaliza un canal crudo del frontend al formato estricto
         * que el generador necesita. Cierra el "handshake" entre
         * ape-coordinator y m3u8-typed-arrays-ultimate.
         */
        translate(channel) {
            const name = channel.name || channel.Name || channel.tvg_name || 'Sin Nombre';
            const url  = channel.url || channel.URL || channel.stream_url || '';
            const group = channel.group || channel.groupTitle || channel['group-title']
                        || channel.category_name || channel.Group || 'General';

            // Detectar perfil: directo, heurístico, o clasificación
            const profile = channel.ape_profile || channel._profile
                          || channel._classification?.quality?.quality
                          || SchemaTranslator._inferProfile(name, channel);

            // Resolución efectiva según perfil
            const profileData = PROFILE_TABLE[profile] || PROFILE_TABLE.P3;

            // Sanitizar nombre y grupo (Unicode pipes)
            let safeName = name;
            let safeGroup = group;
            for (const rule of UNICODE_SANITIZE) {
                safeName  = safeName.replace(rule.from, rule.to);
                safeGroup = safeGroup.replace(rule.from, rule.to);
            }

            return {
                // Identidad
                name: safeName,
                group: safeGroup,
                url: url,
                logo: channel.logo || channel.stream_icon || channel.tvg_logo || '',
                tvgId: channel.tvg_id || channel.epg_channel_id || channel.id || '',
                tvgName: channel.tvg_name || safeName,

                // Perfil
                profile: profile,
                maxResolution: profileData.maxRes,
                maxBandwidth: profileData.maxBw,
                maxFps: profileData.maxFps,

                // Metadata passthrough
                streamId: channel.stream_id || channel.streamId || null,
                stream_id: channel.stream_id,  // PRESERVE original for buildChannelUrl
                type: channel.type || channel.stream_type || 'live',
                archive: channel.archive || channel.tv_archive || 0,
                archiveDur: channel.archive_dur || channel.tv_archive_duration || 0,

                // ✅ v9.2 FIX: MULTI-SERVER PASSTHROUGH — preserve fields for credential resolution
                serverId: channel.serverId,
                server_id: channel.server_id,
                _source: channel._source,
                id: channel.id,
                raw: channel.raw,
                server_url: channel.server_url,
                server_port: channel.server_port,
                direct_source: channel.direct_source,
                stream_url: channel.stream_url,

                // Classification passthrough
                _classification: channel._classification || null,
                _quality: channel._quality || null,
                _region: channel._region || null,

                // Flag: validator touched this channel
                _validated: true,
                _validatedAt: Date.now()
            };
        },

        /**
         * Infiere perfil desde nombre del canal si no está explícito
         */
        _inferProfile(name, channel) {
            const n = (name || '').toUpperCase();
            const res = (channel.resolution || channel.heuristics?.resolution || '').toUpperCase();
            if (n.includes('8K') || res.includes('8K') || res.includes('4320')) return 'P0';
            if (n.includes('4K') || n.includes('UHD') || res.includes('4K') || res.includes('2160')) return 'P1';
            if (n.includes('FHD') || n.includes('1080') || res.includes('1080')) return 'P3';
            if (n.includes('HD') || n.includes('720') || res.includes('720')) return 'P4';
            if (n.includes('SD') || n.includes('480') || res.includes('480')) return 'P5';
            return 'P3'; // Default: FHD
        },

        /**
         * Deduplica EXTVLCOPT keys usando Rules Engine
         * @param {Object} vlcEntries - Map de key → value
         * @returns {Object} Deduplicado
         */
        deduplicateVLC(vlcEntries) {
            const result = {};
            for (const [key, value] of Object.entries(vlcEntries)) {
                if (result[key] === undefined) {
                    result[key] = value;
                    continue;
                }
                // Apply policy
                if (VLC_RULES.KEEP_HIGHEST.has(key)) {
                    const existing = parseFloat(result[key]) || 0;
                    const incoming = parseFloat(value) || 0;
                    if (incoming > existing) result[key] = value;
                } else if (VLC_RULES.KEEP_LOWEST.has(key)) {
                    const existing = parseFloat(result[key]) || 0;
                    const incoming = parseFloat(value) || 0;
                    if (incoming < existing) result[key] = value;
                } else if (VLC_RULES.KEEP_FIRST.has(key)) {
                    // Keep first — do nothing, already set
                }
                // Default: keep first
            }
            return result;
        }
    };

    // Expose SchemaTranslator globally for other modules
    window.APE_SchemaTranslator = SchemaTranslator;
    window.APE_VLC_RULES = VLC_RULES;
    window.APE_PROFILE_TABLE = PROFILE_TABLE;

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

            for (const ch of channels) {
                // Validar estructura básica del objeto
                if (!ch || typeof ch !== 'object') {
                    this.stats.critical++;
                    continue;
                }

                // ✅ FIX v9.2: In Xtream Codes IPTV, channels have stream_id but no pre-built URL.
                // URLs are constructed dynamically at generation time by buildChannelUrl()
                // using server credentials. Skip URL validation for such channels.
                const hasStreamId = ch.stream_id || ch.id || ch.num;
                const hasDirectSource = ch.direct_source || ch.stream_url;
                
                let processedUrl = ch.url || '';
                
                if (ch.url && ch.url.length >= CONFIG.MIN_URL_LENGTH) {
                    // Channel has a pre-built URL — validate it
                    const urlResult = this._processUrl(ch.url);
                    
                    if (urlResult.critical) {
                        // URL is invalid, but if channel has stream_id, keep it anyway
                        // (buildChannelUrl will construct the URL from server credentials)
                        if (!hasStreamId && !hasDirectSource) {
                            this.stats.critical++;
                            continue;
                        }
                        // Has stream_id, so mark as repaired and proceed
                        this.stats.repaired++;
                        processedUrl = ''; // Will be built dynamically
                    } else {
                        if (urlResult.repaired) this.stats.repaired++;
                        processedUrl = urlResult.url;
                    }
                } else if (!hasStreamId && !hasDirectSource) {
                    // No URL, no stream_id, no direct_source — truly invalid
                    this.stats.critical++;
                    continue;
                }
                // else: No URL but has stream_id — accepted (URL built at generation time)

                // ✅ v9.2: DEDUPLICATION REMOVED
                // The app already deduplicates channels at save/load time via
                // _deduplicateChannels() in app.js (serverId:stream_id key).
                // Schema Gate dedup was incorrectly using ch.id (tvg-id like "ESPN.us")
                // which collides across multiple servers, killing 99.9% of channels.
                // The generator's buildChannelUrl() handles per-server URL construction.

                // Sanitizar campos de texto
                const sanitizedChannel = this._sanitizeChannel({
                    ...ch,
                    url: processedUrl
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

            // v9.1: Unicode pipe sanitization (┃→|, │→|, ║→|)
            for (const rule of UNICODE_SANITIZE) {
                sanitized = sanitized.replace(rule.from, rule.to);
            }

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

        /**
         * v9.1: Validate + Translate batch in one call.
         * Returns validated, sanitized, profile-normalized channels.
         */
        validateAndTranslate(channels) {
            const result = this.validateBatch(channels);
            if (!result.valid) return result;

            // Apply Schema Translator to each clean channel
            result.cleanChannels = result.cleanChannels.map(ch => SchemaTranslator.translate(ch));
            result.translated = true;
            return result;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════
    const instance = new GenerationValidator();
    window.GENERATION_VALIDATOR_V9 = instance;
    window.ApeValidator = instance; // Alias para compatibilidad con v8.7

    console.log('%c🛡️ APE Generation Validator v9.1 + Schema Translator Cargado', 'color: #2196f3; font-weight: bold; font-size: 14px;');

})();
