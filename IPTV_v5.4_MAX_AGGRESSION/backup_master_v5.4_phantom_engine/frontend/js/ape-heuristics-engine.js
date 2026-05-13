/**
 * ═══════════════════════════════════════════════════════════════════
 * 🧠 APE HEURISTICS ENGINE v1.0
 * Advanced Playlist Engine - Motor Heurístico para Headers HTTP
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Este motor analiza cada canal de forma individual para determinar
 * automáticamente el nivel de configuración de headers óptimo.
 * 
 * Factores analíticos:
 * - Análisis del Proveedor/CDN (Akamai, Cloudflare, Cloudfront, etc.)
 * - Análisis de la Estructura de la URL (XUI, HLS, Stalker)
 * - Perfilado por Reproductor ("Safe Mode" para legacy players)
 * 
 * @version 1.0.0
 * @author IPTV Navigator PRO
 */

(function () {
    'use strict';

    const APE_HEURISTICS_ENGINE = {
        version: '1.0.0',

        // ═══════════════════════════════════════════════════════════
        // 🔍 CDN PATTERNS - Patrones para detección de CDN agresivos
        // ═══════════════════════════════════════════════════════════
        CDN_PATTERNS: {
            // Akamai - Nivel 4-5 recomendado (usa Bot Manager avanzado)
            akamai: {
                patterns: [
                    /akamai/i,
                    /\.akamaized\.net/i,
                    /\.akamaihd\.net/i,
                    /\.akamaitechnologies\.com/i,
                    /\.akadns\.net/i
                ],
                recommendedLevel: 5,
                description: 'Akamai Bot Manager - Requiere Client Hints + Cookies'
            },

            // Cloudflare - Nivel 4 recomendado (bot score)
            cloudflare: {
                patterns: [
                    /cloudflare/i,
                    /\.cf\./i,
                    /__cf_bm/i,
                    /\.cloudflaressl\.com/i,
                    /cdn-cgi/i
                ],
                recommendedLevel: 4,
                description: 'Cloudflare Bot Detection - Requiere Client Hints'
            },

            // Cloudfront (AWS) - Nivel 3 recomendado
            cloudfront: {
                patterns: [
                    /cloudfront\.net/i,
                    /\.cloudfront\./i,
                    /d[a-z0-9]+\.cloudfront\.net/i
                ],
                recommendedLevel: 3,
                description: 'AWS Cloudfront - Headers estándar'
            },

            // Fastly - Nivel 3 recomendado
            fastly: {
                patterns: [
                    /fastly/i,
                    /\.fastly\.net/i,
                    /\.fastlylb\.net/i
                ],
                recommendedLevel: 3,
                description: 'Fastly CDN'
            },

            // Level3/Lumen - Nivel 2 básico
            level3: {
                patterns: [
                    /level3/i,
                    /\.llnwd\.net/i,
                    /llnw\.net/i
                ],
                recommendedLevel: 2,
                description: 'Level3/Lumen CDN - Básico'
            },

            // Limelight - Nivel 2
            limelight: {
                patterns: [
                    /limelight/i,
                    /\.llnw\./i,
                    /\.lldns\.net/i
                ],
                recommendedLevel: 2,
                description: 'Limelight Networks'
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🔗 SERVER TYPE PATTERNS - Patrones de estructura de URL
        // ═══════════════════════════════════════════════════════════
        SERVER_PATTERNS: {
            // XUI/Xtream - Nivel 3 (requiere User-Agent específico)
            xui: {
                patterns: [
                    /\/live\//i,
                    /player_api\.php/i,
                    /get\.php/i,
                    /xmltv\.php/i,
                    /panel_api\.php/i,
                    /:8080\//,
                    /:8000\//,
                    /:25461\//
                ],
                recommendedLevel: 3,
                description: 'XUI/Xtream Codes - Requiere Referer/Origin'
            },

            // HLS estándar - Nivel 2
            hls: {
                patterns: [
                    /\.m3u8/i,
                    /\/hls\//i,
                    /\/playlist\//i,
                    /\.ts$/i
                ],
                recommendedLevel: 2,
                description: 'HLS Stream - Headers CORS'
            },

            // DASH - Nivel 2
            dash: {
                patterns: [
                    /\.mpd/i,
                    /\/dash\//i,
                    /manifest\.mpd/i
                ],
                recommendedLevel: 2,
                description: 'MPEG-DASH'
            },

            // Stalker/MAC - Nivel 3+
            stalker: {
                patterns: [
                    /stalker/i,
                    /\.stb\./i,
                    /mac=/i,
                    /portal\.php/i,
                    /c\/[\w]+\.js/i
                ],
                recommendedLevel: 4,
                description: 'Stalker/MAC Portal - Autenticación especial'
            },

            // M3U directo - Nivel 1
            directStream: {
                patterns: [
                    /\:[\d]+\/[\w\d]+$/,
                    /\/udp\//i,
                    /rtp:\/\//i
                ],
                recommendedLevel: 1,
                description: 'Stream directo - Mínimos headers'
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 📱 SAFE MODE - Reproductores legacy con limitaciones
        // ═══════════════════════════════════════════════════════════
        SAFE_MODE_PLAYERS: {
            // Estos reproductores tienen problemas con headers modernos
            players: [
                'smarters',
                'perfect-player',
                'xciptv',
                'gse-player',
                'iptv-smarters',
                'lazy-iptv',
                'smart-iptv'
            ],
            maxLevel: 3,
            description: 'Limitar a nivel 3 para evitar errores de parsing'
        },

        // ═══════════════════════════════════════════════════════════
        // 🎯 MAIN API: Determinar nivel óptimo
        // ═══════════════════════════════════════════════════════════

        /**
         * Determina el nivel de headers óptimo para un canal
         * @param {Object} channel - Objeto del canal con url, name, etc.
         * @param {Object} server - Objeto del servidor con baseUrl, username, etc.
         * @param {Object} options - Opciones adicionales
         * @returns {Object} { level, reason, cdnDetected, serverType, warnings }
         */
        determineLevel(channel = {}, server = {}, options = {}) {
            const url = this._extractUrl(channel, server);
            const result = {
                level: 1,
                reason: 'Default level',
                cdnDetected: null,
                serverType: null,
                warnings: [],
                analysis: {}
            };

            // 1. Detectar CDN agresivo
            const cdnAnalysis = this._detectCDN(url);
            result.analysis.cdn = cdnAnalysis;

            if (cdnAnalysis.detected) {
                result.cdnDetected = cdnAnalysis.name;
                result.level = Math.max(result.level, cdnAnalysis.recommendedLevel);
                result.reason = `CDN detectado: ${cdnAnalysis.name}`;
            }

            // 2. Detectar tipo de servidor
            const serverAnalysis = this._detectServerType(url);
            result.analysis.server = serverAnalysis;

            if (serverAnalysis.detected) {
                result.serverType = serverAnalysis.name;
                // Solo aumentar si es mayor que el nivel actual
                if (serverAnalysis.recommendedLevel > result.level) {
                    result.level = serverAnalysis.recommendedLevel;
                    result.reason = `Tipo de servidor: ${serverAnalysis.name}`;
                }
            }

            // 3. Aplicar Safe Mode si está habilitado
            if (options.safeMode || options.player) {
                const safeCheck = this._checkSafeMode(options.player);
                if (safeCheck.shouldLimit) {
                    if (result.level > safeCheck.maxLevel) {
                        result.warnings.push(`Safe Mode: Nivel reducido de ${result.level} a ${safeCheck.maxLevel} para ${options.player}`);
                        result.level = safeCheck.maxLevel;
                        result.reason = `Safe Mode activo: ${options.player}`;
                    }
                }
            }

            // 4. Override manual si se proporciona
            if (options.forceLevel && options.forceLevel >= 1 && options.forceLevel <= 5) {
                result.level = options.forceLevel;
                result.reason = `Nivel forzado manualmente: ${options.forceLevel}`;
            }

            // 5. Validar límites
            result.level = Math.max(1, Math.min(5, result.level));

            return result;
        },

        /**
         * Versión simplificada que solo retorna el nivel numérico
         */
        getLevel(channel, server, options) {
            return this.determineLevel(channel, server, options).level;
        },

        /**
         * Analiza batch de canales y retorna estadísticas
         */
        analyzeBatch(channels = [], server = {}, options = {}) {
            const stats = {
                total: channels.length,
                byLevel: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                cdnDistribution: {},
                serverTypeDistribution: {},
                averageLevel: 0,
                warnings: []
            };

            let levelSum = 0;

            channels.forEach(channel => {
                const analysis = this.determineLevel(channel, server, options);

                stats.byLevel[analysis.level]++;
                levelSum += analysis.level;

                if (analysis.cdnDetected) {
                    stats.cdnDistribution[analysis.cdnDetected] =
                        (stats.cdnDistribution[analysis.cdnDetected] || 0) + 1;
                }

                if (analysis.serverType) {
                    stats.serverTypeDistribution[analysis.serverType] =
                        (stats.serverTypeDistribution[analysis.serverType] || 0) + 1;
                }

                if (analysis.warnings.length) {
                    stats.warnings.push(...analysis.warnings);
                }
            });

            stats.averageLevel = channels.length > 0
                ? Math.round((levelSum / channels.length) * 10) / 10
                : 1;

            return stats;
        },

        // ═══════════════════════════════════════════════════════════
        // 🔧 INTERNAL METHODS
        // ═══════════════════════════════════════════════════════════

        _extractUrl(channel, server) {
            // Intentar múltiples fuentes para la URL
            return channel.url
                || channel.streamUrl
                || channel.stream
                || channel.link
                || channel.direct_source
                || (server?.baseUrl || '');
        },

        _detectCDN(url) {
            const result = {
                detected: false,
                name: null,
                recommendedLevel: 1,
                description: ''
            };

            if (!url) return result;

            for (const [cdnName, config] of Object.entries(this.CDN_PATTERNS)) {
                for (const pattern of config.patterns) {
                    if (pattern.test(url)) {
                        result.detected = true;
                        result.name = cdnName;
                        result.recommendedLevel = config.recommendedLevel;
                        result.description = config.description;
                        return result;
                    }
                }
            }

            return result;
        },

        _detectServerType(url) {
            const result = {
                detected: false,
                name: null,
                recommendedLevel: 1,
                description: ''
            };

            if (!url) return result;

            for (const [typeName, config] of Object.entries(this.SERVER_PATTERNS)) {
                for (const pattern of config.patterns) {
                    if (pattern.test(url)) {
                        result.detected = true;
                        result.name = typeName;
                        result.recommendedLevel = config.recommendedLevel;
                        result.description = config.description;
                        return result;
                    }
                }
            }

            return result;
        },

        _checkSafeMode(playerName) {
            const result = {
                shouldLimit: false,
                maxLevel: 5
            };

            if (!playerName) return result;

            const normalizedPlayer = playerName.toLowerCase().trim();
            const isLegacy = this.SAFE_MODE_PLAYERS.players.some(
                p => normalizedPlayer.includes(p)
            );

            if (isLegacy) {
                result.shouldLimit = true;
                result.maxLevel = this.SAFE_MODE_PLAYERS.maxLevel;
            }

            return result;
        },

        // ═══════════════════════════════════════════════════════════
        // 📊 UTILITY: Obtener descripción legible del nivel
        // ═══════════════════════════════════════════════════════════

        getLevelInfo(level) {
            const levels = {
                1: { name: 'NORMAL', icon: '⭐', color: '#22c55e' },
                2: { name: 'PRO', icon: '⭐⭐', color: '#3b82f6' },
                3: { name: 'ADVANCED', icon: '⭐⭐⭐', color: '#8b5cf6' },
                4: { name: 'EXTREME', icon: '⭐⭐⭐⭐', color: '#f59e0b' },
                5: { name: 'ULTRA', icon: '🔥', color: '#ef4444' }
            };
            return levels[level] || levels[1];
        }
    };

    // Export global
    window.APE_HEURISTICS_ENGINE = APE_HEURISTICS_ENGINE;

    // Alias para compatibilidad
    window.apeHeuristics = APE_HEURISTICS_ENGINE;

    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║ 🧠 APE HEURISTICS ENGINE V${APE_HEURISTICS_ENGINE.version} - CARGADO                            ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ ✅ ${Object.keys(APE_HEURISTICS_ENGINE.CDN_PATTERNS).length} CDN patterns configurados                                       ║
║ ✅ ${Object.keys(APE_HEURISTICS_ENGINE.SERVER_PATTERNS).length} Server type patterns                                          ║
║ ✅ Safe Mode para ${APE_HEURISTICS_ENGINE.SAFE_MODE_PLAYERS.players.length} reproductores legacy                             ║
╚═══════════════════════════════════════════════════════════════════════════╝
    `);

})();
