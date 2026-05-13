/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 FRONTEND ORCHESTRATOR - Coordinador de Generación Unificada
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PROPÓSITO: Orquestar la fusión de configuración UI + estrategia de headers
 * e invocar el núcleo v16.0 WORLD CLASS para generación RFC 8216.
 * 
 * FLUJO:
 * 1. Obtiene canales desde la UI
 * 2. Lee configuración via AdapterV14
 * 3. Obtiene headers via AdapterV1
 * 4. Fusiona todo en objeto params
 * 5. Invoca M3U8APIWrapper.generateAndDownload(channels, params)
 * 
 * @version 1.0.0
 * @date 2026-01-29
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '1.0.0-ORCHESTRATOR';

    // ═══════════════════════════════════════════════════════════════
    // 📋 LOG DE GENERACIÓN
    // ═══════════════════════════════════════════════════════════════

    const generationLog = [];

    function log(level, message, data = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data
        };
        generationLog.push(entry);

        const colors = {
            info: '#03a9f4',
            success: '#4ade80',
            warning: '#f59e0b',
            error: '#ef4444'
        };

        console.log(
            `%c[Orchestrator] ${message}`,
            `color: ${colors[level] || '#888'}; font-weight: bold;`,
            data || ''
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎯 FUNCIÓN PRINCIPAL: ORQUESTAR GENERACIÓN
    // ═══════════════════════════════════════════════════════════════

    async function orchestrateGeneration(channels = null) {
        const startTime = Date.now();
        log('info', '🚀 Iniciando orquestación de generación...');

        // Stats para HUD
        const stats = { p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, headers: 0, jwt: '0 KB', speed: '0 ch/s' };

        try {
            // ═══════════════════════════════════════════════════════
            // PASO 1: Obtener canales
            // ═══════════════════════════════════════════════════════
            let channelList = channels;

            if (!channelList || channelList.length === 0) {
                channelList = getChannelsFromApp();
            }

            if (!channelList || channelList.length === 0) {
                throw new Error('No hay canales disponibles. Aplica filtros primero.');
            }

            log('success', `📺 Canales obtenidos: ${channelList.length}`);

            // ═══════════════════════════════════════════════════════
            // PASO 2: Inicializar HUD Visual (si está disponible)
            // ═══════════════════════════════════════════════════════
            const HUD = window.HUD_V16 || window.APE_HUD;
            if (HUD) {
                HUD.init(channelList.length, {
                    sessionId: crypto.randomUUID?.() || `${Date.now()}`
                });
                HUD.log('🔧 Cargando adaptadores...', '#03a9f4');
            }

            // ═══════════════════════════════════════════════════════
            // PASO 3: Obtener configuración de UI (AdapterV14)
            // ═══════════════════════════════════════════════════════
            let uiConfig = {};

            if (window.AdapterV14) {
                uiConfig = window.AdapterV14.getConfigFromUI();
                log('success', '🔧 Configuración UI obtenida', uiConfig);
                if (HUD) HUD.log('✅ AdapterV14: Configuración UI cargada', '#4ade80');
            } else {
                log('warning', '⚠️ AdapterV14 no disponible, usando defaults');
                uiConfig = getDefaultConfig();
                if (HUD) HUD.log('⚠️ AdapterV14 no disponible', '#f59e0b');
            }

            // ═══════════════════════════════════════════════════════
            // PASO 4: Obtener estrategia de headers (AdapterV1)
            // ═══════════════════════════════════════════════════════
            let headerStrategy = {};
            const optimizationLevel = uiConfig.optimizationLevel || uiConfig.motorAPE?.manualEvasionLevel || 3;

            if (window.AdapterV1) {
                headerStrategy = window.AdapterV1.getHeaderStrategy(optimizationLevel);
                log('success', `🎚️ Headers nivel ${optimizationLevel} (${headerStrategy.levelName}): ${headerStrategy.headerCount} headers`);
                stats.headers = headerStrategy.headerCount;
                if (HUD) HUD.log(`✅ AdapterV1: ${headerStrategy.headerCount} headers nivel ${headerStrategy.levelName}`, '#4ade80');
            } else {
                log('warning', '⚠️ AdapterV1 no disponible, usando headers mínimos');
                headerStrategy = { headers: { 'User-Agent': 'IPTV Navigator PRO' }, headerCount: 1 };
                if (HUD) HUD.log('⚠️ AdapterV1 no disponible', '#f59e0b');
            }

            // ═══════════════════════════════════════════════════════
            // PASO 5: Session Warmup (para canales L4+)
            // ═══════════════════════════════════════════════════════
            if (window.SESSION_WARMUP_V9 && optimizationLevel >= 4) {
                if (HUD) HUD.log('🔥 Iniciando Session Warmup para canales de alto nivel...', '#ff9800');
                try {
                    const warmupTargets = channelList
                        .filter(ch => ch.url || ch.direct_source)
                        .slice(0, 10) // Máximo 10 para no bloquear
                        .map(ch => ({ url: ch.url || ch.direct_source, level: optimizationLevel }));

                    if (warmupTargets.length > 0) {
                        await window.SESSION_WARMUP_V9.executeBatch(warmupTargets);
                        if (HUD) HUD.log(`✅ Warmup completado: ${warmupTargets.length} URLs pre-calentadas`, '#4ade80');
                    }
                } catch (e) {
                    log('warning', `⚠️ Session Warmup falló: ${e.message}`);
                    if (HUD) HUD.log(`⚠️ Warmup error: ${e.message}`, '#f59e0b');
                }
            }

            // ═══════════════════════════════════════════════════════
            // PASO 6: Procesar group-titles por canal
            // ═══════════════════════════════════════════════════════
            if (window.AdapterV14?.processGroupTitle) {
                channelList = channelList.map(channel => ({
                    ...channel,
                    _processedGroup: window.AdapterV14.processGroupTitle(channel)
                }));
                log('info', '🏷️ Group-titles procesados');
                if (HUD) HUD.log('🏷️ Group-titles procesados', '#03a9f4');
            }

            // ═══════════════════════════════════════════════════════
            // PASO 7: Fusionar configuración en params
            // ═══════════════════════════════════════════════════════
            const params = {
                // Configuración de UI
                profile: uiConfig.activeProfile || 'P3',
                format: uiConfig.generation?.streamFormat || 'm3u8',
                epgUrl: uiConfig.generation?.epgUrl || '',

                // Motor APE
                evasionLevel: optimizationLevel,
                autoDetect: uiConfig.motorAPE?.autoDetectLevel ?? true,
                targetPlayer: uiConfig.motorAPE?.targetPlayer || 'generic',

                // Headers desde AdapterV1
                headers: headerStrategy.headers,
                headerLevel: headerStrategy.level,
                headerLevelName: headerStrategy.levelName,

                // Headers personalizados desde ProfileManagerV9
                customHeaders: uiConfig.customHeaders || [],

                // Streaming optimization
                proStreaming: uiConfig.streaming?.proStreamingEnabled || false,
                ottOptimized: uiConfig.streaming?.ottNavOptimized || false,

                // Serverless
                serverless: uiConfig.serverless || { enabled: false },

                // Video format
                videoFormat: uiConfig.videoFormat,

                // Group-title config
                groupTitle: uiConfig.groupTitle,

                // HUD callback para actualizaciones
                onProgress: (current, total, channelStats) => {
                    if (HUD) {
                        HUD.update(current, total, {
                            ...stats,
                            ...channelStats,
                            speed: `${Math.round(current / ((Date.now() - startTime) / 1000))} ch/s`
                        });
                    }
                },

                // Metadata de orquestación
                _orchestrator: {
                    version: VERSION,
                    timestamp: new Date().toISOString(),
                    channelCount: channelList.length,
                    generationId: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
                }
            };

            log('success', '📦 Parámetros fusionados', {
                profile: params.profile,
                evasionLevel: params.evasionLevel,
                headerCount: Object.keys(params.headers).length,
                customHeadersCount: params.customHeaders.length
            });

            if (HUD) {
                HUD.log(`📦 Perfil: ${params.profile} | Nivel: ${params.evasionLevel} | Headers: ${stats.headers}`, '#8b5cf6');
                HUD.log('🎬 Invocando núcleo v16.0 WORLD CLASS...', '#00ff41');
            }

            // ═══════════════════════════════════════════════════════
            // PASO 8: Verificar abortado antes de procesar
            // ═══════════════════════════════════════════════════════
            if (HUD?.isAborted?.()) {
                throw new Error('Operación cancelada por el usuario');
            }

            // ═══════════════════════════════════════════════════════
            // PASO 9: Invocar núcleo v16.0
            // ═══════════════════════════════════════════════════════
            if (!window.M3U8APIWrapper) {
                throw new Error('M3U8APIWrapper (núcleo v16.0) no está cargado');
            }

            log('info', '🎬 Invocando núcleo v16.0 WORLD CLASS...');

            await (window.m3u8Wrapper || new window.M3U8APIWrapper(params)).generateAndDownload(channelList, params);

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            log('success', `✅ Generación completada en ${elapsed}s`);

            // Mostrar completado en HUD
            if (HUD) {
                HUD.complete({
                    total: channelList.length,
                    headers: stats.headers,
                    jwt: stats.jwt,
                    elapsed
                });
            }

            return {
                success: true,
                channelCount: channelList.length,
                params,
                elapsed: `${elapsed}s`
            };

        } catch (error) {
            log('error', `❌ Error: ${error.message}`, error);

            // Cerrar HUD con error
            if (window.HUD_V16 || window.APE_HUD) {
                const HUD = window.HUD_V16 || window.APE_HUD;
                HUD.log(`❌ ERROR: ${error.message}`, '#ff1744');
                setTimeout(() => HUD.close(), 2000);
            }

            // Mostrar error al usuario
            if (typeof alert !== 'undefined') {
                alert(`Error de generación:\n\n${error.message}`);
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 📺 OBTENER CANALES DESDE LA APP
    // ═══════════════════════════════════════════════════════════════

    function getChannelsFromApp() {
        if (window.app?.state) {
            const state = window.app.state;

            // Prioridad: filteredChannels > channels > channelsMaster
            if (state.filteredChannels?.length > 0) {
                return state.filteredChannels;
            }
            if (state.channels?.length > 0) {
                return state.channels;
            }
            if (state.channelsMaster?.length > 0) {
                return state.channelsMaster;
            }
        }

        return [];
    }

    // ═══════════════════════════════════════════════════════════════
    // ⚙️ CONFIGURACIÓN POR DEFECTO (fallback)
    // ═══════════════════════════════════════════════════════════════

    function getDefaultConfig() {
        return {
            generation: { exportFormat: 'm3u8', streamFormat: 'm3u8', epgUrl: '', timeShift: 0 },
            streaming: { proStreamingEnabled: false, ottNavOptimized: false, includeHttpHeaders: true },
            motorAPE: { autoDetectLevel: true, manualEvasionLevel: 3, antiFreezeLevel: 3, targetPlayer: 'generic', compatProfile: 'AUTO', headerCount: 92 },
            serverless: { enabled: false },
            groupTitle: null,
            activeProfile: 'P3',
            customHeaders: [],
            videoFormat: null,
            optimizationLevel: 3,
            timestamp: new Date().toISOString()
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // 📊 LOG Y ESTADÍSTICAS
    // ═══════════════════════════════════════════════════════════════

    function getLog() {
        return [...generationLog];
    }

    function clearLog() {
        generationLog.length = 0;
    }

    function displayLogInUI(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const html = generationLog.map(entry => {
            const colors = { info: '#03a9f4', success: '#4ade80', warning: '#f59e0b', error: '#ef4444' };
            return `<div style="color: ${colors[entry.level]}; margin: 2px 0; font-family: monospace; font-size: 12px;">
                [${entry.timestamp.split('T')[1].split('.')[0]}] ${entry.message}
            </div>`;
        }).join('');

        container.innerHTML = html;
    }

    function getStatus() {
        return {
            version: VERSION,
            adaptersLoaded: {
                v14: !!window.AdapterV14,
                v1: !!window.AdapterV1,
                core: !!window.M3U8APIWrapper
            },
            channelsAvailable: getChannelsFromApp().length,
            logEntries: generationLog.length,
            lastGeneration: generationLog.length > 0 ? generationLog[generationLog.length - 1] : null
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // 🔌 INTEGRACIÓN CON BOTONES DE LA UI
    // ═══════════════════════════════════════════════════════════════

    function bindToButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                orchestrateGeneration();
            });
            log('info', `🔌 Vinculado a botón #${buttonId}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════

    window.FrontendOrchestrator = {
        // Función principal
        orchestrateGeneration,

        // Utilidades
        getChannelsFromApp,
        getDefaultConfig,

        // Log
        getLog,
        clearLog,
        displayLogInUI,

        // Estado
        getStatus,

        // Integración UI
        bindToButton,

        version: VERSION
    };

    // Integración con window.app
    if (window.app) {
        window.app.generateUnified = orchestrateGeneration;
        window.app.orchestrator = window.FrontendOrchestrator;
    }

    console.log(`%c🎯 Frontend Orchestrator v${VERSION} Loaded`, 'color: #10b981; font-weight: bold; font-size: 14px;');
    console.log('   ✅ orchestrateGeneration() → Generación unificada');
    console.log('   ✅ getStatus() → Estado de adaptadores');
    console.log('   📞 Uso: FrontendOrchestrator.orchestrateGeneration()');

})();
