/**
 * ══════════════════════════════════════════════════════════════════════
 *  APE MODULE MANAGER [OMEGA CRYSTAL V6] — MODULE
 * ══════════════════════════════════════════════════════════════════════
 * Arquitectura 100% Cero Errores. Orquestador de la Médula Espinal Frontend.
 * Carga e inicializa secuencial e imperativamente:
 * 1. Dual Identity Core
 * 2. Phantom Hydra Engine
 * 3. Cortex JS Resilience
 * 4. Motores OMEGA V6 (TLS JA3, VPN Bidireccional, JWT)
 * 5. El motor Supremo M3U8 Array
 * ══════════════════════════════════════════════════════════════════════
 */

(function(global) {
    'use strict';

    class ApeModuleManagerV5 {
        constructor() {
            this.version = 'v5.0.OMEGA';
            this.initialized = false;
            
            // Subsistemas Core
            this.coreModules = [
                {
                    id: 'dual-identity-core',
                    file: 'dual-identity-core.js',
                    globalVar: 'DualIdentity'
                },
                {
                    id: 'phantom-hydra',
                    file: 'phantom-hydra-engine.js',
                    globalVar: 'PhantomHydra'
                },
                {
                    id: 'cortex-js',
                    file: 'cortex-js-resilience.js',
                    globalVar: 'IPTV_SUPPORT_CORTEX'
                }
            ];

            // Motores de la Evolución OMEGA V6
            this.omegaV6Modules = [
                { id: 'heuristics-engine', file: 'ape-heuristics-engine.js', globalVar: 'ApeHeuristicsEngine' },
                { id: 'channel-classifier', file: 'ape-channel-classifier.js', globalVar: 'ApeChannelClassifier' },
                { id: 'runtime-evasion', file: 'ape-runtime-evasion-engine.js', globalVar: 'ApeRuntimeEvasion' },
                { id: 'tls-coherence', file: 'tls-coherence-engine-v9.js', globalVar: 'TlsCoherenceEngine' },
                { id: 'xtream-exploit', file: 'xtream-exploit-engine-v9.js', globalVar: 'xtreamExploitEngine' },
                { id: 'vpn-suprema', file: 'vpn-integration-supremo.js', globalVar: 'VpnIntegrationSupremo' },
                { id: 'realtime-throughput', file: 'realtime-throughput-v9.js', globalVar: 'RealtimeThroughput' },
                { id: 'dynamic-qos-buffer', file: 'dynamic-qos-buffer-v9.js', globalVar: 'DynamicQoSBuffer' },
                { id: 'smart-codec', file: 'smart-codec-prioritizer.js', globalVar: 'smartCodecPrioritizer' },
                { id: 'jwt-token-generator', file: 'jwt-token-generator-v9.js', globalVar: 'JwtTokenGenerator' }
            ];

            // Subsistemas Delegados Históricos 
            this.legacyModules = [];

            // basePath: relative to index-v4.html which lives in frontend/.
            // Live Server serves it at /IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html
            // so the scripts are at frontend/js/ape-v9/* (no '../' needed).
            // Bug 2026-04-08: previous logic prepended '../' when path included
            // '/frontend/', which produced /IPTV_v5.4_MAX_AGGRESSION/js/ape-v9/...
            // and 404'd dual-identity-core, phantom-hydra-engine, cortex-js-resilience.
            this.basePath = 'js/ape-v9/';
        }

        /**
         * Verifica si un módulo está habilitado en la arquitectura
         */
        isEnabled(moduleId) {
            // Hardcode fallbacks for critical dynamic features checked by API wrapper / generators
            const coreFlags = ['dual-client-runtime', 'quality-overlay-vip', 'elite-hls-v16', 'cortex-js', 'phantom-hydra', 'heuristics-engine', 'smart-codec', 'tls-coherence', 'vpn-suprema', 'xtream-exploit', 'latency-rayo'];
            if (coreFlags.includes(moduleId)) return true;
            
            const allModules = [...this.coreModules, ...this.omegaV6Modules, ...this.legacyModules];
            return allModules.some(m => m.id === moduleId);
        }

        /**
         * Inicializa la secuencia de ignición
         */
        async initAll() {
            if (this.initialized) return true;
            console.log(`[APE MODULE MANAGER] Iniciando Ignición OMEGA CRYSTAL V6...`);

            // 1. Cargar Core Modules (Obligatorio)
            for (const mod of this.coreModules) {
                try {
                    await this._loadScript(mod.file);
                    if (!global[mod.globalVar]) {
                        console.warn(`[APE MODULE MANAGER] Módulo Core ${mod.id} cargó pero ${mod.globalVar} no está en Global. Evaluando Fallback interno.`);
                    } else {
                        console.log(`[APE MODULE MANAGER] Núcleo ${mod.id} [OK]`);
                    }
                } catch (e) {
                    console.error(`[APE MODULE MANAGER] Error crítico cargando ${mod.id}:`, e);
                }
            }

            // 2. Cargar Módulos Secundarios (Silencioso, sin bloquear UI)
            for (const mod of this.legacyModules) {
                this._loadScript(mod.file).catch(e => { /* Silenciar errores de legacy */ });
            }

            this.initialized = true;
            console.log(`[APE MODULE MANAGER] Ignición Completa. Sistema Listo para Generación.`);
            return true;
        }

        _loadScript(filename) {
            return new Promise((resolve, reject) => {
                if (typeof document === 'undefined') return resolve(); // Node/Env sin DOM

                // Evitar recargas
                if (document.querySelector(`script[src$="${filename}"]`)) {
                    return resolve();
                }

                const script = document.createElement('script');
                script.src = this.basePath + filename;
                script.onload = () => resolve();
                script.onerror = () => {
                    console.warn(`[APE MODULE MANAGER] Fallo al cargar script: ${filename}`);
                    resolve(); // Resuelve igual para evitar bloqueos Promise (Cero Errores)
                };
                document.head.appendChild(script);
            });
        }
    }

    global.ApeModuleManager = new ApeModuleManagerV5();

    // Auto-ignición en navegadores
    if (typeof window !== 'undefined' && document.readyState === 'complete') {
        global.ApeModuleManager.initAll();
    } else if (typeof window !== 'undefined') {
        window.addEventListener('load', () => global.ApeModuleManager.initAll());
    }

})(typeof window !== 'undefined' ? window : this);
