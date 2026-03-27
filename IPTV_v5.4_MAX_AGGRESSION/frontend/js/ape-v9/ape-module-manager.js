/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🧩 APE MODULE MANAGER v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Sistema centralizado para gestionar módulos APE v9
 * Permite activar/desactivar módulos y persiste la configuración
 * 
 * Uso:
 *   window.ApeModuleManager.enable('validator');
 *   window.ApeModuleManager.disable('geoblocking');
 *   window.ApeModuleManager.isEnabled('validator'); // true
 *   window.ApeModuleManager.getStatus(); // objeto con todos los estados
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'ape_modules_config_v2'; // v2: todos los módulos ON por defecto

    // ═══════════════════════════════════════════════════════════════════════
    // REGISTRO DE MÓDULOS DISPONIBLES
    // ═══════════════════════════════════════════════════════════════════════
    const MODULE_REGISTRY = {
        // ═══════════════════════════════════════════════════════════════════
        // MÓDULOS CORE (ON por defecto)
        // ═══════════════════════════════════════════════════════════════════
        'validator': {
            id: 'validator',
            name: '🛡️ Validador de Canales',
            description: 'Valida y sanitiza URLs y nombres de canales antes de generar',
            file: 'generation-validator-v9.js',
            globalVar: 'GENERATION_VALIDATOR_V9',
            defaultEnabled: true,
            category: 'quality'
        },
        'parser-optimized': {
            id: 'parser-optimized',
            name: '⚡ Parser Optimizado',
            description: 'Descarga paralela 5x más rápida, buffer inteligente',
            file: 'ape-ultra-parser-optimized.js',
            globalVar: 'APEUltraParserOptimized',
            defaultEnabled: true,
            category: 'performance'
        },
        'tls-coherence': {
            id: 'tls-coherence',
            name: '🔒 Coherencia TLS',
            description: 'Mantiene coherencia de fingerprint TLS entre requests',
            file: 'tls-coherence-engine-v9.js',
            globalVar: 'TLS_COHERENCE_V9',
            defaultEnabled: true,
            category: 'security'
        },
        'cdn-cache': {
            id: 'cdn-cache',
            name: '💾 Caché CDN',
            description: 'Gestiona cookies y caché de CDNs para reducir 403/429',
            file: 'cdn-cookie-cache-v9.js',
            globalVar: 'CDN_COOKIE_CACHE_V9',
            defaultEnabled: true,
            category: 'network'
        },

        // ═══════════════════════════════════════════════════════════════════
        // MÓDULOS OPCIONALES DE GENERACIÓN (OFF por defecto)
        // ═══════════════════════════════════════════════════════════════════
        'buffer-adaptativo': {
            id: 'buffer-adaptativo',
            name: '🛡️ Buffer Adaptativo Supremo',
            description: '41 metadatos por canal, cero cortes, recuperación <5s',
            file: 'buffer-adaptativo-supremo.js',
            globalVar: 'BufferAdaptativoSupremo',
            defaultEnabled: false,
            category: 'quality'
        },
        'smart-codec': {
            id: 'smart-codec',
            name: '🎬 Smart Codec Prioritizer',
            description: 'Priorización inteligente: AV1 > H265 > VP9 > H264',
            file: 'smart-codec-prioritizer.js',
            globalVar: 'SmartCodecPrioritizer',
            defaultEnabled: false,
            category: 'quality'
        },
        'fibonacci-entropy': {
            id: 'fibonacci-entropy',
            name: '🧬 Fibonacci Entropy',
            description: 'DNA único por canal, evade fingerprinting CDN',
            file: 'fibonacci-entropy-engine-v9.js',
            globalVar: 'FIBONACCI_ENTROPY_V9',
            defaultEnabled: true,
            category: 'security'
        },
        'evasion-407': {
            id: 'evasion-407',
            name: '🎭 Evasión 407 Supremo',
            description: '51 metadatos, 8 técnicas de evasión proxy',
            file: 'evasion-407-supremo.js',
            globalVar: 'Evasion407Supremo',
            defaultEnabled: true,
            category: 'security'
        },

        // ═══════════════════════════════════════════════════════════════════
        // MÓDULOS DE GENERACIÓN M3U8 (controlan secciones del output)
        // ═══════════════════════════════════════════════════════════════════
        'jwt-generator': {
            id: 'jwt-generator',
            name: '🔑 JWT 68+ Campos',
            description: 'Token JWT criptográfico con 68+ campos embebido en URL',
            file: 'jwt-token-generator-v9.js',
            globalVar: 'JWTTokenGeneratorV9',
            defaultEnabled: true,
            category: 'architecture'
        },
        'headers-matrix': {
            id: 'headers-matrix',
            name: '📡 Headers Matrix',
            description: 'Headers EXT-X-APE por canal: evasión, fingerprint, ABR, failover',
            file: 'headers-matrix-v9.js',
            globalVar: 'HEADERS_MATRIX_V9',
            defaultEnabled: true,
            category: 'architecture'
        },
        'manifest-generator': {
            id: 'manifest-generator',
            name: '📺 KODIPROP/Manifest',
            description: 'Headers KODIPROP (38 líneas): inputstream.adaptive, DRM, buffer Kodi',
            file: 'manifest-generator-v9.js',
            globalVar: 'ManifestGeneratorV9',
            defaultEnabled: true,
            category: 'architecture'
        },
        'prefetch-optimizer': {
            id: 'prefetch-optimizer',
            name: '🚀 Prefetch Optimizer',
            description: 'Descarga anticipada de segmentos, IA predictiva, ultra-agresivo',
            file: 'prefetch-optimizer-v9.js',
            globalVar: 'PREFETCH_OPTIMIZER_V9',
            defaultEnabled: true,
            category: 'performance'
        },
        'vpn-integration': {
            id: 'vpn-integration',
            name: '🛡️ VPN Integration',
            description: 'Detección y optimización para conexiones VPN/proxy',
            file: 'vpn-integration.js',
            globalVar: 'VPNIntegration',
            defaultEnabled: true,
            category: 'network'
        },
        'latency-rayo': {
            id: 'latency-rayo',
            name: '⚡ Latencia Rayo',
            description: 'Ultra-baja latencia, zero-start, buffer mínimo para IPTV en vivo',
            file: 'latency-rayo.js',
            globalVar: 'LatencyRayo',
            defaultEnabled: true,
            category: 'performance'
        },

        // ═══════════════════════════════════════════════════════════════════
        // MÓDULOS DE RED Y STREAMING
        // ═══════════════════════════════════════════════════════════════════
        'geoblocking': {
            id: 'geoblocking',
            name: '🌍 Detector Geobloqueo',
            description: 'Detecta y reporta bloqueos geográficos',
            file: 'geoblocking-detector-v9.js',
            globalVar: 'GEOBLOCKING_V9',
            defaultEnabled: true,
            category: 'network'
        },
        'session-warmup': {
            id: 'session-warmup',
            name: '🔥 Session Warmup',
            description: 'Pre-calienta sesiones HTTP para reducir latencia',
            file: 'session-warmup-v9.js',
            globalVar: 'SESSION_WARMUP_V9',
            defaultEnabled: false,
            category: 'performance'
        },
        'realtime-throughput': {
            id: 'realtime-throughput',
            name: '📈 Throughput Tiempo Real',
            description: 'Monitoreo de ancho de banda en tiempo real',
            file: 'realtime-throughput-v9.js',
            globalVar: 'REALTIME_THROUGHPUT_V9',
            defaultEnabled: false,
            category: 'performance'
        },
        'dynamic-qos': {
            id: 'dynamic-qos',
            name: '🎯 QoS Dinámico',
            description: 'Ajuste dinámico de calidad según condiciones',
            file: 'dynamic-qos-buffer-v9.js',
            globalVar: 'DYNAMIC_QOS_V9',
            defaultEnabled: false,
            category: 'quality'
        },

        // ═══════════════════════════════════════════════════════════════════
        // MÓDULO DE EXPLOTACIÓN XTREAM CODES
        // ═══════════════════════════════════════════════════════════════════
        'xtream-exploit': {
            id: 'xtream-exploit',
            name: '🔓 Xtream Exploit Engine',
            description: '8 vulnerabilidades + 8 técnicas de explotación Xtream Codes, server profiling',
            file: 'xtream-exploit-engine-v9.js',
            globalVar: 'XtreamExploitEngine',
            defaultEnabled: true,
            category: 'security'
        },

        // ═══════════════════════════════════════════════════════════════════
        // MÓDULOS DE INTEGRACIÓN
        // ═══════════════════════════════════════════════════════════════════
        'multi-server': {
            id: 'multi-server',
            name: '🔀 Fusión Multi-Servidor',
            description: 'Combina canales eliminando duplicados',
            file: 'multi-server-fusion-v9.js',
            globalVar: 'MULTI_SERVER_V9',
            defaultEnabled: false,
            category: 'integration'
        },
        'proxy-auth': {
            id: 'proxy-auth',
            name: '🔐 Proxy Auth',
            description: 'Autenticación de proxy integrada',
            file: 'proxy-auth-module.js',
            globalVar: 'ProxyAuthModule',
            defaultEnabled: false,
            category: 'security'
        },

        // ═══════════════════════════════════════════════════════════════════
        // MÓDULOS DE OPTIMIZACIÓN JWT [NUEVOS]
        // ═══════════════════════════════════════════════════════════════════
        'quantum-shield-2026': {
            id: 'quantum-shield-2026',
            name: '🛡️ QUANTUM SHIELD 2026 (24/7 Zero-Drop)',
            description: 'Arquitectura exclusiva 2026: Fidelidad atómica y validador de flujos predictivos.',
            file: null,
            globalVar: null,
            defaultEnabled: false,
            category: 'architecture',
            onEnable: function () {
                window._APE_QUANTUM_SHIELD_2026 = true;
                console.log('🛡️ [QUANTUM-SHIELD-2026] Escudo Cuántico ACTIVADO');
            },
            onDisable: function () {
                window._APE_QUANTUM_SHIELD_2026 = false;
                console.log('⚪ [QUANTUM-SHIELD-2026] Escudo Cuántico DESACTIVADO');
            }
        },
        'url-length-validator': {
            id: 'url-length-validator',
            name: '📏 URL Length Validator',
            description: 'Valida URLs < 2000 chars, activa JWT Compact automáticamente',
            file: 'url-length-validator.js',
            globalVar: 'URLLengthValidator',
            defaultEnabled: true,
            category: 'optimization'
        },
        'fallback-mode': {
            id: 'fallback-mode',
            name: '🔄 Fallback Mode',
            description: 'JWT dinámico según capacidad del reproductor',
            file: 'fallback-mode-handler.js',
            globalVar: 'FallbackModeHandler',
            defaultEnabled: true,
            category: 'optimization'
        },
        'compact-jwt': {
            id: 'compact-jwt',
            name: '📦 JWT Compacto',
            description: 'JWT optimizado de 40 campos (vs 68), URLs cortas',
            file: 'jwt-token-generator-v9-compact.js',
            globalVar: 'CompactJWTGenerator',
            defaultEnabled: true,
            category: 'optimization'
        },
        'clean-url-mode': {
            id: 'clean-url-mode',
            name: '🌐 URLs Limpias',
            description: 'URLs 100% limpias sin JWT, headers redistribuidos a M3U8',
            file: null, // No tiene archivo propio, modifica comportamiento del generador
            globalVar: null,
            defaultEnabled: true,
            category: 'architecture',
            // Handler especial para sincronizar con el generador
            onEnable: function () {
                if (window.M3U8TypedArraysGenerator?.setCleanUrlMode) {
                    window.M3U8TypedArraysGenerator.setCleanUrlMode(true);
                    console.log('🌐 [CLEAN-URL] Modo activado desde panel');
                }
            },
            onDisable: function () {
                if (window.M3U8TypedArraysGenerator?.setCleanUrlMode) {
                    window.M3U8TypedArraysGenerator.setCleanUrlMode(false);
                    console.log('🔐 [JWT-MODE] Modo JWT activado desde panel');
                }
            }
        },
        'prio-quality': {
            id: 'prio-quality',
            name: '🎯 Prio. Quality',
            description: 'Priorizar codecs máxima calidad: AV1 > HEVC > H264, Opus > AAC > MP3',
            file: null,
            globalVar: null,
            defaultEnabled: true,
            category: 'architecture',
            onEnable: function () {
                window._APE_PRIO_QUALITY = true;
                console.log('🎯 [PRIO-QUALITY] Priorización de codecs ACTIVADA');
            },
            onDisable: function () {
                window._APE_PRIO_QUALITY = false;
                console.log('⚪ [PRIO-QUALITY] Priorización de codecs DESACTIVADA');
            }
        },
        'prio-http3': {
            id: 'prio-http3',
            name: '⚡ Prio. HTTP/3',
            description: 'Priorizar protocolo HTTP/3 > HTTP/2 > HTTP/1.1, 0-RTT, multiplexación',
            file: null,
            globalVar: null,
            defaultEnabled: true,
            category: 'architecture',
            onEnable: function () {
                window._APE_PRIO_HTTP3 = true;
                console.log('⚡ [PRIO-HTTP3] Priorización HTTP/3 ACTIVADA');
            },
            onDisable: function () {
                window._APE_PRIO_HTTP3 = false;
                console.log('⚪ [PRIO-HTTP3] Priorización HTTP/3 DESACTIVADA');
            }
        },
        'redundant-streams': {
            id: 'redundant-streams',
            name: '🔄 Redundant Streams',
            description: 'HLS Redundant Streams RFC 8216: failover automático HLS → TS con EXT-X-STREAM-INF',
            file: null,
            globalVar: null,
            defaultEnabled: false,
            category: 'architecture',
            onEnable: function () {
                window._APE_REDUNDANT_STREAMS = true;
                console.log('🔄 [REDUNDANT-STREAMS] Failover HLS→TS ACTIVADO (RFC 8216)');
            },
            onDisable: function () {
                window._APE_REDUNDANT_STREAMS = false;
                console.log('⚪ [REDUNDANT-STREAMS] Failover HLS→TS DESACTIVADO');
            }
        },
        'hls-advanced-directives': {
            id: 'hls-advanced-directives',
            name: '📡 Directivas HLS Avanzadas',
            description: '#EXTHTTP (23 headers HEVC), #EXT-X-SERVER-CONTROL, #EXT-X-PART, #EXT-X-PRELOAD-HINT',
            file: null,
            globalVar: null,
            defaultEnabled: true,
            category: 'architecture',
            onEnable: function () {
                window._APE_HLS_ADVANCED = true;
                console.log('📡 [HLS-ADVANCED] Directivas HLS avanzadas ACTIVADAS');
            },
            onDisable: function () {
                window._APE_HLS_ADVANCED = false;
                console.log('⚪ [HLS-ADVANCED] Directivas HLS avanzadas DESACTIVADAS');
            }
        },
        'abr-control': {
            id: 'abr-control',
            name: '📊 ABR Control Predictivo',
            description: '#EXT-X-ADAPTIVE-BITRATE-CONTROL: buffers dinámicos por calidad (8K→25s, 4K→20s, FHD→15s)',
            file: null,
            globalVar: null,
            defaultEnabled: true,
            category: 'architecture',
            onEnable: function () {
                window._APE_ABR_CONTROL = true;
                console.log('📊 [ABR-CONTROL] Control adaptativo de bitrate ACTIVADO');
            },
            onDisable: function () {
                window._APE_ABR_CONTROL = false;
                console.log('⚪ [ABR-CONTROL] Control adaptativo de bitrate DESACTIVADO');
            }
        },
        'elite-hls-v16': {
            id: 'elite-hls-v16',
            name: '🏆 Elite HLS v16',
            description: 'VIDEO-RANGE, HDCP-LEVEL, PATHWAY-ID, SCORE en #EXT-X-STREAM-INF (RFC 8216 Maestro)',
            file: 'm3u8-generator-v16-elite.js',
            globalVar: 'apeEliteGenerator',
            defaultEnabled: false,
            category: 'architecture',
            onEnable: function () {
                window._APE_ELITE_HLS_V16 = true;
                console.log('🏆 [ELITE-HLS] Generación de manifiestos Elite ACTIVADA');
            },
            onDisable: function () {
                window._APE_ELITE_HLS_V16 = false;
                console.log('⚪ [ELITE-HLS] Generación de manifiestos Elite DESACTIVADA');
            }
        },
        'ua-rotation': {
            id: 'ua-rotation',
            name: '🔄 User Agent Rotation',
            description: 'Rotación dinámica de 2500+ User Agents reales para evadir bloqueos de CDN',
            file: 'user-agent-rotation-module.js',
            globalVar: 'userAgentRotation',
            defaultEnabled: true,
            category: 'security',
            onEnable: function () {
                window._APE_UA_ROTATION = true;
                console.log('🔄 [UA-ROTATION] Rotación de User Agents ACTIVADA');
            },
            onDisable: function () {
                window._APE_UA_ROTATION = false;
                console.log('⚪ [UA-ROTATION] Rotación de User Agents DESACTIVADA');
            }
        },
        'dual-client-runtime': {
            id: 'dual-client-runtime',
            name: '🔄 Dual Client Runtime',
            description: 'EXTATTRFROMURL resolver + 22 headers W3C (Client Hints, Sec-Fetch, HLS Accept). OTT→resolver, TiviMate→URL limpia',
            file: null,
            globalVar: null,
            defaultEnabled: false,
            category: 'architecture',
            onEnable: function () {
                window._APE_DUAL_CLIENT_RUNTIME = true;
                console.log('🔄 [DUAL-CLIENT] Resolver + W3C Headers + EXTATTRFROMURL ACTIVADO');
            },
            onDisable: function () {
                window._APE_DUAL_CLIENT_RUNTIME = false;
                console.log('⚪ [DUAL-CLIENT] Resolver + W3C Headers + EXTATTRFROMURL DESACTIVADO (modo normal)');
            }
        },
        'full-static-headers': {
            id: 'full-static-headers',
            name: '📋 Headers Estáticos Completos',
            description: 'Inyecta el bloque completo de 120+ headers estáticos en el M3U8 (KODIPROP, EXTHTTP, EXT-X-APE) junto con el resolver.',
            file: null,
            globalVar: null,
            defaultEnabled: true,
            category: 'architecture',
            onEnable: function () {
                window._APE_FULL_STATIC_HEADERS = true;
                console.log('📋 [STATIC-HEADERS] Bloque completo de headers estáticos ACTIVADO');
            },
            onDisable: function () {
                window._APE_FULL_STATIC_HEADERS = false;
                console.log('⚪ [STATIC-HEADERS] Bloque completo de headers estáticos DESACTIVADO');
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // MÓDULO VIP (ADD-ONLY RULES)
        // ═══════════════════════════════════════════════════════════════════
        'quality-overlay-vip': {
            id: 'quality-overlay-vip',
            name: '👑 Quality Overlay (VIP Variant Picker)',
            description: 'Variant Picker: Fuerza HEVC-First, BWDIF y Máxima Res. Optimizado para inyectar 80% más calidad en Onn 4K, Fire Stick 4K y S905X5.',
            file: null,
            globalVar: null,
            defaultEnabled: true,
            category: 'quality',
            onEnable: function () {
                console.log('👑 [QUALITY-OVERLAY] Variant Picker ACTIVADO (Ruta /api/resolve_quality)');
            },
            onDisable: function () {
                console.log('⚪ [QUALITY-OVERLAY] Variant Picker DESACTIVADO');
            }
        }
    };



    // ═══════════════════════════════════════════════════════════════════════
    // CLASE MODULE MANAGER
    // ═══════════════════════════════════════════════════════════════════════
    class ApeModuleManager {
        constructor() {
            this.registry = MODULE_REGISTRY;
            this.config = this._loadConfig();
            this._initializeModules();
            console.log('%c🧩 APE Module Manager v1.0 Cargado', 'color: #8b5cf6; font-weight: bold;');
            this._logStatus();
        }

        /**
         * Carga configuración desde localStorage
         */
        _loadConfig() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    return JSON.parse(saved);
                }
            } catch (e) {
                console.warn('⚠️ Error cargando config de módulos:', e);
            }

            // Config por defecto
            const defaults = {};
            for (const [id, mod] of Object.entries(this.registry)) {
                defaults[id] = mod.defaultEnabled;
            }
            return defaults;
        }

        /**
         * Guarda configuración en localStorage
         */
        _saveConfig() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
                console.log('💾 Configuración de módulos guardada');
            } catch (e) {
                console.error('❌ Error guardando config:', e);
            }
        }

        /**
         * Inicializa módulos según configuración
         */
        _initializeModules() {
            for (const [id, enabled] of Object.entries(this.config)) {
                const mod = this.registry[id];
                if (mod && enabled) {
                    // Verificar si el módulo está cargado
                    if (mod.globalVar && window[mod.globalVar]) {
                        mod._instance = window[mod.globalVar];
                        mod._loaded = true;
                    } else if (!mod.globalVar && !mod.file) {
                        // Módulo sin archivo (como clean-url-mode)
                        mod._loaded = true;
                    } else {
                        mod._loaded = false;
                    }

                    // Ejecutar handler onEnable si existe y está habilitado
                    if (typeof mod.onEnable === 'function') {
                        try {
                            mod.onEnable();
                        } catch (e) {
                            console.error(`❌ Error en onEnable inicial de ${id}:`, e);
                        }
                    }
                }
            }
        }

        /**
         * Activa un módulo
         */
        enable(moduleId) {
            if (!this.registry[moduleId]) {
                console.warn(`⚠️ Módulo "${moduleId}" no existe`);
                return false;
            }

            this.config[moduleId] = true;
            this._saveConfig();

            const mod = this.registry[moduleId];
            console.log(`✅ Módulo activado: ${mod.name}`);

            // Ejecutar handler onEnable si existe
            if (typeof mod.onEnable === 'function') {
                try {
                    mod.onEnable();
                } catch (e) {
                    console.error(`❌ Error en onEnable de ${moduleId}:`, e);
                }
            }

            this._dispatchEvent('module-enabled', { moduleId, module: mod });
            return true;
        }

        /**
         * Desactiva un módulo
         */
        disable(moduleId) {
            if (!this.registry[moduleId]) {
                console.warn(`⚠️ Módulo "${moduleId}" no existe`);
                return false;
            }

            this.config[moduleId] = false;
            this._saveConfig();

            const mod = this.registry[moduleId];
            console.log(`⛔ Módulo desactivado: ${mod.name}`);

            // Ejecutar handler onDisable si existe
            if (typeof mod.onDisable === 'function') {
                try {
                    mod.onDisable();
                } catch (e) {
                    console.error(`❌ Error en onDisable de ${moduleId}:`, e);
                }
            }

            this._dispatchEvent('module-disabled', { moduleId, module: mod });
            return true;
        }

        /**
         * Toggle estado de módulo
         */
        toggle(moduleId) {
            if (this.isEnabled(moduleId)) {
                return this.disable(moduleId);
            } else {
                return this.enable(moduleId);
            }
        }

        /**
         * Verifica si un módulo está habilitado
         */
        isEnabled(moduleId) {
            return this.config[moduleId] === true;
        }

        /**
         * Verifica si un módulo está cargado (script disponible)
         */
        isLoaded(moduleId) {
            const mod = this.registry[moduleId];
            if (!mod) return false;
            return !!window[mod.globalVar];
        }

        /**
         * Verifica si un módulo está activo (habilitado + cargado)
         */
        isActive(moduleId) {
            return this.isEnabled(moduleId) && this.isLoaded(moduleId);
        }

        /**
         * Obtiene instancia de un módulo si está activo
         */
        getInstance(moduleId) {
            if (!this.isActive(moduleId)) return null;
            const mod = this.registry[moduleId];
            return window[mod.globalVar];
        }

        /**
         * Obtiene estado de todos los módulos
         */
        getStatus() {
            const status = {};
            for (const [id, mod] of Object.entries(this.registry)) {
                status[id] = {
                    id,
                    name: mod.name,
                    description: mod.description,
                    category: mod.category,
                    enabled: this.isEnabled(id),
                    loaded: this.isLoaded(id),
                    active: this.isActive(id)
                };
            }
            return status;
        }

        /**
         * Lanza un motor de exportación específico
         * @param {string} engineId - ID del motor ('typed-arrays', etc.)
         * @param {Object} options - Opciones de generación
         */
        exportEngine(engineId, options = {}) {
            console.log(`🚀 [MODULE-MANAGER] Lanzando motor de exportación: ${engineId}`);

            if (engineId === 'typed-arrays') {
                // Prioridad 1: window.M3U8TypedArraysGenerator
                if (window.M3U8TypedArraysGenerator && typeof window.M3U8TypedArraysGenerator.generateAndDownload === 'function') {
                    // Obtener canales desde app
                    const app = window.app;
                    let channels = [];
                    if (app) {
                        console.log(`🔍 [DIAG] channelsMaster count: ${app.state?.channelsMaster?.length || 'N/A'}`);
                        console.log(`🔍 [DIAG] channels count: ${app.state?.channels?.length || 'N/A'}`);
                        console.log(`🔍 [DIAG] filteredChannels count: ${app.state?.filteredChannels?.length || 'N/A'}`);
                        if (typeof app.getFilteredChannels === 'function') {
                            channels = app.getFilteredChannels() || [];
                            console.log(`🔍 [DIAG] getFilteredChannels() returned: ${channels.length} channels`);
                        } else {
                            channels = app.state?.filteredChannels || app.state?.channels || [];
                            console.log(`🔍 [DIAG] state fallback returned: ${channels.length} channels`);
                        }
                        // Log first 3 channel samples for debugging
                        if (channels.length > 0) {
                            console.log(`🔍 [DIAG] Sample channels:`, channels.slice(0, 3).map(c => ({
                                name: c.name, url: c.url, stream_id: c.stream_id,
                                serverId: c.serverId || c.server_id || c._source || 'NONE'
                            })));
                        }
                    }

                    if (channels.length === 0) {
                        alert('No hay canales filtrados para generar.');
                        return;
                    }

                    // ✅ v10.0 FIX: Inject server credentials directly into options
                    // so the generator doesn't depend on window.app.state being accessible from its IIFE
                    if (app && app.state) {
                        options._activeServers = app.state.activeServers || [];
                        options._currentServer = app.state.currentServer || null;
                        console.log(`🔑 [MODULE-MANAGER] Injecting ${options._activeServers.length} servers into generator options`);
                        options._activeServers.forEach(s => {
                            console.log(`   🔑 Server: ${s.name || s.id} | baseUrl: ${s.baseUrl} | user: ${s.username ? 'YES' : 'NO'} | pass: ${s.password ? 'YES' : 'NO'}`);
                        });
                    }
                    console.log(`🚀 [DIAG] Passing ${channels.length} channels to generateAndDownload()`);
                    return window.M3U8TypedArraysGenerator.generateAndDownload(channels, options);
                }

                // Prioridad 2: window.app.generateM3U8_TypedArrays
                if (window.app && typeof window.app.generateM3U8_TypedArrays === 'function') {
                    return window.app.generateM3U8_TypedArrays(options);
                }

                alert('El Sincronizador Maestro HLS (Typed Arrays) aún está armando los buffers. Espera un segundo.');
            } else {
                console.warn(`⚠️ Motor de exportación "${engineId}" no implementado en bridge`);
            }
        }

        /**
         * Obtiene lista de módulos activos
         */
        getActiveModules() {
            return Object.keys(this.registry).filter(id => this.isActive(id));
        }

        /**
         * Obtiene módulos por categoría
         */
        getModulesByCategory(category) {
            return Object.entries(this.registry)
                .filter(([_, mod]) => mod.category === category)
                .map(([id, mod]) => ({ id, ...mod, enabled: this.isEnabled(id) }));
        }

        /**
         * Reset a valores por defecto
         */
        resetToDefaults() {
            for (const [id, mod] of Object.entries(this.registry)) {
                this.config[id] = mod.defaultEnabled;
            }
            this._saveConfig();
            console.log('🔄 Módulos reseteados a valores por defecto');
            this._dispatchEvent('modules-reset', {});
        }

        /**
         * Log de estado actual
         */
        _logStatus() {
            console.log('📊 Estado de Módulos APE:');
            for (const [id, mod] of Object.entries(this.registry)) {
                const enabled = this.isEnabled(id);
                const loaded = this.isLoaded(id);
                const icon = enabled ? (loaded ? '✅' : '⚠️') : '⛔';
                console.log(`   ${icon} ${mod.name} - ${enabled ? 'ON' : 'OFF'}${enabled && !loaded ? ' (no cargado)' : ''}`);
            }
        }

        /**
         * Dispatch evento personalizado
         */
        _dispatchEvent(eventName, detail) {
            const event = new CustomEvent(`ape-module:${eventName}`, { detail });
            window.dispatchEvent(event);
        }

        /**
         * Genera HTML para panel de control
         */
        generateControlPanelHTML() {
            const categories = {
                architecture: { name: '🌐 Arquitectura', modules: [] },
                optimization: { name: '⚡ Optimización', modules: [] },
                quality: { name: '🛡️ Calidad', modules: [] },
                performance: { name: '🚀 Rendimiento', modules: [] },
                network: { name: '📡 Red', modules: [] },
                security: { name: '🔒 Seguridad', modules: [] },
                integration: { name: '🔀 Integración', modules: [] }
            };

            // Agrupar por categoría
            for (const [id, mod] of Object.entries(this.registry)) {
                const cat = mod.category || 'other';
                if (categories[cat]) {
                    categories[cat].modules.push({ id, ...mod });
                }
            }

            let html = '<div class="ape-modules-panel">';
            html += '<h3 style="margin:0 0 15px 0;color:#8b5cf6;">🧩 Módulos APE v9</h3>';

            for (const [catId, cat] of Object.entries(categories)) {
                if (cat.modules.length === 0) continue;

                html += `<div class="module-category" style="margin-bottom:15px;">`;
                html += `<h4 style="margin:0 0 8px 0;font-size:14px;color:#888;">${cat.name}</h4>`;

                for (const mod of cat.modules) {
                    const enabled = this.isEnabled(mod.id);
                    const loaded = this.isLoaded(mod.id);

                    html += `
                    <div class="module-toggle" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${enabled ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)'};border-radius:8px;margin-bottom:6px;">
                        <div style="flex:1;">
                            <label style="display:flex;align-items:center;cursor:pointer;gap:10px;">
                                <input type="checkbox" 
                                       id="ape-mod-${mod.id}" 
                                       ${enabled ? 'checked' : ''} 
                                       onchange="window.ApeModuleManager.toggle('${mod.id}')"
                                       style="width:18px;height:18px;accent-color:#8b5cf6;">
                                <span style="font-weight:500;">${mod.name}</span>
                            </label>
                            <p style="margin:4px 0 0 28px;font-size:11px;color:#888;">${mod.description}</p>
                        </div>
                        <span style="font-size:16px;">${enabled ? (loaded ? '✅' : '⚠️') : '⛔'}</span>
                    </div>`;
                }

                html += '</div>';
            }

            html += `
            <div style="margin-top:15px;padding-top:15px;border-top:1px solid rgba(255,255,255,0.1);">
                <button onclick="window.ApeModuleManager.resetToDefaults();location.reload();" 
                        style="padding:8px 16px;background:#374151;color:white;border:none;border-radius:6px;cursor:pointer;">
                    🔄 Restaurar Defaults
                </button>
                <span style="margin-left:10px;font-size:12px;color:#888;">
                    ${this.getActiveModules().length}/${Object.keys(this.registry).length} activos
                </span>
            </div>`;

            html += '</div>';
            return html;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INSTANCIA GLOBAL
    // ═══════════════════════════════════════════════════════════════════════
    window.ApeModuleManager = new ApeModuleManager();

})();
