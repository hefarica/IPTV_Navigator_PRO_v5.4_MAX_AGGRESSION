/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔄 FALLBACK MODE HANDLER
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Detecta capacidades del reproductor y aplica JWT dinámico según contexto
 * 
 * - Detecta reproductor por User-Agent o configuración
 * - Aplica JWT FULL, COMPACT o NONE según capacidad
 * - Maneja errores de conexión con fallback automático
 * - Integración con ApeModuleManager
 * 
 * @version 1.0.0
 * @module fallback-mode
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const MODULE_ID = 'fallback-mode';
    const VERSION = '1.0.0';

    // ═══════════════════════════════════════════════════════════════════════════
    // PERFILES DE REPRODUCTORES
    // ═══════════════════════════════════════════════════════════════════════════

    const PLAYER_PROFILES = {
        'OTT_NAVIGATOR': {
            name: 'OTT Navigator',
            maxUrlLength: 2000,
            supportsJWT: true,
            jwtMode: 'compact',
            supportsKodiprop: true,
            supportsExtvlcopt: true,
            supportsExtxape: true,
            userAgentPattern: /OTT Navigator/i,
            notes: 'Requiere URLs cortas, soporta todos los headers M3U8'
        },
        'VLC': {
            name: 'VLC Media Player',
            maxUrlLength: 8000,
            supportsJWT: true,
            jwtMode: 'full',
            supportsKodiprop: false,
            supportsExtvlcopt: true,
            supportsExtxape: false,
            userAgentPattern: /VLC/i,
            notes: 'Soporta URLs largas, solo usa EXTVLCOPT'
        },
        'KODI': {
            name: 'Kodi',
            maxUrlLength: 8000,
            supportsJWT: true,
            jwtMode: 'full',
            supportsKodiprop: true,
            supportsExtvlcopt: true,
            supportsExtxape: true,
            userAgentPattern: /Kodi/i,
            notes: 'Soporte completo de todos los headers'
        },
        'TIVIMATE': {
            name: 'TiviMate',
            maxUrlLength: 2000,
            supportsJWT: true,
            jwtMode: 'compact',
            supportsKodiprop: true,
            supportsExtvlcopt: true,
            supportsExtxape: true,
            userAgentPattern: /TiviMate/i,
            notes: 'Similar a OTT Navigator'
        },
        'SMARTERS': {
            name: 'IPTV Smarters Pro',
            maxUrlLength: 1500,
            supportsJWT: false,
            jwtMode: 'none',
            supportsKodiprop: false,
            supportsExtvlcopt: true,
            supportsExtxape: false,
            userAgentPattern: /Smarters/i,
            notes: 'Soporte limitado, evitar JWT'
        },
        'PERFECT_PLAYER': {
            name: 'Perfect Player',
            maxUrlLength: 2000,
            supportsJWT: true,
            jwtMode: 'compact',
            supportsKodiprop: true,
            supportsExtvlcopt: true,
            supportsExtxape: false,
            userAgentPattern: /Perfect Player/i,
            notes: 'Buen soporte general'
        },
        'GSE_SMART': {
            name: 'GSE Smart IPTV',
            maxUrlLength: 2000,
            supportsJWT: true,
            jwtMode: 'compact',
            supportsKodiprop: false,
            supportsExtvlcopt: true,
            supportsExtxape: false,
            userAgentPattern: /GSE/i,
            notes: 'Soporte básico'
        },
        'UNKNOWN': {
            name: 'Unknown Player',
            maxUrlLength: 1500,
            supportsJWT: true,
            jwtMode: 'compact', // Seguro por defecto
            supportsKodiprop: true,
            supportsExtvlcopt: true,
            supportsExtxape: true,
            userAgentPattern: null,
            notes: 'Perfil seguro por defecto'
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // MODOS JWT
    // ═══════════════════════════════════════════════════════════════════════════

    const JWT_MODES = {
        FULL: {
            name: 'Full JWT (68 campos)',
            fields: 68,
            estimatedLength: 3000,
            description: 'JWT completo con todos los campos'
        },
        COMPACT: {
            name: 'Compact JWT (40 campos)',
            fields: 40,
            estimatedLength: 800,
            description: 'JWT optimizado con campos esenciales'
        },
        NONE: {
            name: 'Sin JWT',
            fields: 0,
            estimatedLength: 0,
            description: 'URL sin JWT, información en headers M3U8'
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════════

    class FallbackModeHandler {
        constructor() {
            this.currentPlayer = 'UNKNOWN';
            this.currentProfile = PLAYER_PROFILES.UNKNOWN;
            this.forcedMode = null;
            this.fallbackHistory = [];
        }

        /**
         * Detecta el reproductor según User-Agent
         * @param {string} userAgent - User-Agent string
         * @returns {string} Nombre del reproductor detectado
         */
        detectPlayer(userAgent = '') {
            if (!userAgent && typeof navigator !== 'undefined') {
                userAgent = navigator.userAgent || '';
            }

            for (const [playerKey, profile] of Object.entries(PLAYER_PROFILES)) {
                if (profile.userAgentPattern && profile.userAgentPattern.test(userAgent)) {
                    this.setPlayer(playerKey);
                    return playerKey;
                }
            }

            this.setPlayer('UNKNOWN');
            return 'UNKNOWN';
        }

        /**
         * Configura el reproductor manualmente
         * @param {string} playerKey - Clave del reproductor
         */
        setPlayer(playerKey) {
            const key = playerKey.toUpperCase().replace(/\s+/g, '_');
            if (PLAYER_PROFILES[key]) {
                this.currentPlayer = key;
                this.currentProfile = PLAYER_PROFILES[key];
                console.log(`🔄 [FALLBACK] Player configurado: ${this.currentProfile.name}`);
            } else {
                console.warn(`⚠️ [FALLBACK] Player desconocido: ${playerKey}, usando UNKNOWN`);
                this.currentPlayer = 'UNKNOWN';
                this.currentProfile = PLAYER_PROFILES.UNKNOWN;
            }
        }

        /**
         * Obtiene el modo JWT óptimo para el reproductor actual
         * @returns {string} 'full', 'compact', o 'none'
         */
        getOptimalJWTMode() {
            if (this.forcedMode) {
                return this.forcedMode;
            }
            return this.currentProfile.jwtMode || 'compact';
        }

        /**
         * Fuerza un modo JWT específico
         * @param {string} mode - 'full', 'compact', 'none', o null para auto
         */
        forceMode(mode) {
            if (mode === null || mode === 'auto') {
                this.forcedMode = null;
                console.log('🔄 [FALLBACK] Modo automático activado');
            } else if (['full', 'compact', 'none'].includes(mode.toLowerCase())) {
                this.forcedMode = mode.toLowerCase();
                console.log(`🔄 [FALLBACK] Modo forzado: ${this.forcedMode}`);
            }
        }

        /**
         * Genera JWT dinámico según capacidad del reproductor
         * @param {Object} channel - Datos del canal
         * @param {Object} profile - Perfil de calidad
         * @param {number} index - Índice del canal
         * @returns {Object} JWT y metadata
         */
        generateDynamicJWT(channel, profile, index) {
            const mode = this.getOptimalJWTMode();
            let jwt = null;
            let generator = null;

            switch (mode) {
                case 'full':
                    if (window.M3U8TypedArraysGenerator) {
                        jwt = window.M3U8TypedArraysGenerator.generateJWT68Fields(channel, profile, index);
                        generator = 'M3U8TypedArraysGenerator';
                    } else {
                        console.warn('⚠️ [FALLBACK] Full JWT generator no disponible, usando compact');
                        return this._fallbackToCompact(channel, profile, index);
                    }
                    break;

                case 'compact':
                    if (window.CompactJWTGenerator) {
                        jwt = window.CompactJWTGenerator.generateCompactJWT(channel, profile, index);
                        generator = 'CompactJWTGenerator';
                    } else {
                        console.warn('⚠️ [FALLBACK] Compact JWT generator no disponible, usando none');
                        return this._fallbackToNone();
                    }
                    break;

                case 'none':
                default:
                    return this._fallbackToNone();
            }

            const result = {
                jwt,
                mode,
                generator,
                length: jwt ? jwt.length : 0,
                player: this.currentPlayer,
                timestamp: new Date().toISOString()
            };

            this.fallbackHistory.push({
                ...result,
                channelId: channel.stream_id || index
            });

            return result;
        }

        /**
         * Fallback a modo compact
         */
        _fallbackToCompact(channel, profile, index) {
            if (window.CompactJWTGenerator) {
                const jwt = window.CompactJWTGenerator.generateCompactJWT(channel, profile, index);
                return {
                    jwt,
                    mode: 'compact',
                    generator: 'CompactJWTGenerator (fallback)',
                    length: jwt.length,
                    player: this.currentPlayer,
                    fallback: true
                };
            }
            return this._fallbackToNone();
        }

        /**
         * Fallback a sin JWT
         */
        _fallbackToNone() {
            return {
                jwt: null,
                mode: 'none',
                generator: null,
                length: 0,
                player: this.currentPlayer,
                fallback: true,
                warning: 'Usando URL sin JWT'
            };
        }

        /**
         * Obtiene los headers M3U8 soportados por el reproductor actual
         * @returns {Object} Headers soportados
         */
        getSupportedHeaders() {
            return {
                kodiprop: this.currentProfile.supportsKodiprop,
                extvlcopt: this.currentProfile.supportsExtvlcopt,
                extxape: this.currentProfile.supportsExtxape
            };
        }

        /**
         * Obtiene configuración de generación para el reproductor
         * @returns {Object} Configuración optimizada
         */
        getGenerationConfig() {
            return {
                player: this.currentPlayer,
                playerName: this.currentProfile.name,
                jwtMode: this.getOptimalJWTMode(),
                maxUrlLength: this.currentProfile.maxUrlLength,
                headers: this.getSupportedHeaders(),
                notes: this.currentProfile.notes
            };
        }

        /**
         * Obtiene historial de fallbacks
         */
        getHistory() {
            return [...this.fallbackHistory];
        }

        /**
         * Limpia historial
         */
        clearHistory() {
            this.fallbackHistory = [];
        }

        /**
         * Obtiene lista de reproductores soportados
         */
        static getSupportedPlayers() {
            return Object.entries(PLAYER_PROFILES).map(([key, profile]) => ({
                id: key,
                name: profile.name,
                jwtMode: profile.jwtMode,
                maxUrlLength: profile.maxUrlLength
            }));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INSTANCIA SINGLETON
    // ═══════════════════════════════════════════════════════════════════════════

    const handler = new FallbackModeHandler();

    // ═══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════════════════════

    const FallbackModeModule = {
        MODULE_ID,
        VERSION,
        PLAYER_PROFILES,
        JWT_MODES,

        // Clase para instancias personalizadas
        FallbackModeHandler,

        // Métodos del singleton
        detectPlayer: (ua) => handler.detectPlayer(ua),
        setPlayer: (player) => handler.setPlayer(player),
        getOptimalJWTMode: () => handler.getOptimalJWTMode(),
        forceMode: (mode) => handler.forceMode(mode),
        generateDynamicJWT: (...args) => handler.generateDynamicJWT(...args),
        getSupportedHeaders: () => handler.getSupportedHeaders(),
        getGenerationConfig: () => handler.getGenerationConfig(),
        getHistory: () => handler.getHistory(),
        clearHistory: () => handler.clearHistory(),

        // Estáticos
        getSupportedPlayers: FallbackModeHandler.getSupportedPlayers,

        // Info
        getInfo: () => ({
            id: MODULE_ID,
            version: VERSION,
            currentPlayer: handler.currentPlayer,
            currentMode: handler.getOptimalJWTMode(),
            description: 'Maneja fallback de JWT según capacidades del reproductor'
        })
    };

    // Exponer globalmente
    window.FallbackModeHandler = FallbackModeModule;

    // Registrar en ApeModuleManager si existe
    if (window.ApeModuleManager && typeof window.ApeModuleManager.register === 'function') {
        window.ApeModuleManager.register({
            id: MODULE_ID,
            name: 'Fallback Mode Handler',
            description: 'JWT dinámico según capacidad del reproductor',
            category: 'optimization',
            version: VERSION,
            enabled: true,
            loaded: true
        });
    }

    console.log(`%c🔄 Fallback Mode Handler v${VERSION} cargado - ${Object.keys(PLAYER_PROFILES).length} perfiles de reproductor`,
        'color: #f59e0b; font-weight: bold;');

})();
