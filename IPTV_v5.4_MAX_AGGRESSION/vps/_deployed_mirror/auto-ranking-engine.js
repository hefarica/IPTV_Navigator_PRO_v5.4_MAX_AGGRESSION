/**
 * AUTO RANKING ENGINE v1.1 - IPTV Navigator PRO v3.2.1
 * 
 * 🎯 OBJETIVO:
 * Motor automático universal de ranking que aplica scoring de calidad a TODOS
 * los canales (300,000+) sin límites, integrándose en 6 puntos críticos.
 * 
 * 🚀 OPTIMIZADO PARA 300K+ CANALES:
 * - Procesamiento por lotes (batch processing)
 * - Ejecución asíncrona para no bloquear UI
 * - Memory-efficient con chunks
 * - Progress reporting opcional
 * 
 * PUNTOS DE INTEGRACIÓN:
 * 1. processChannels - Procesar canales nuevos
 * 2. connectServer - Conectar servidor inicial
 * 3. applyAdvancedFilters - Aplicar filtros
 * 4. connectFromLibrary - Conectar desde biblioteca
 * 5. addServerToConnections - Añadir servidor multi-source
 * 6. probeAllChannelsBackend - Análisis de calidad manual
 */

class AutoRankingEngine {
    constructor() {
        this.enabled = true;
        this.debugMode = true;

        // ✅ CONFIGURACIÓN PARA 300K+ CANALES
        this.config = {
            batchSize: 5000,           // Canales por lote (optimizado para memoria)
            yieldInterval: 50,         // ms entre lotes para no bloquear UI
            maxChannels: Infinity,     // Sin límite de canales
            enableProgressLog: true,   // Log de progreso cada X lotes
            progressLogInterval: 5     // Cada 5 lotes (25,000 canales)
        };

        this.stats = {
            totalChannelsRanked: 0,
            executionTimes: [],
            lastExecution: null,
            activationPoints: {},
            largestBatch: 0
        };

        console.log('🚀 AutoRankingEngine v1.1 inicializado (300K+ optimizado)');
        console.log(`   📦 Batch size: ${this.config.batchSize.toLocaleString()} canales`);
    }

    /**
     * 🎯 MÉTODO PRINCIPAL: Aplicar ranking universal con batch processing
     * Optimizado para 300,000+ canales
     * @param {Array} channels - Canales a rankear
     * @param {Object} context - Contexto de ejecución
     */
    async applyUniversalRanking(channels, context = {}) {
        if (!this.enabled || !channels || !Array.isArray(channels) || channels.length === 0) {
            return channels;
        }

        const startTime = Date.now();
        const source = context.source || 'unknown';
        const app = context.appInstance || window.app;
        const totalChannels = channels.length;

        console.group(`📊 [AutoRanking] ${source}`);
        console.log(`📺 Canales a rankear: ${totalChannels.toLocaleString()}`);

        // Track largest batch
        if (totalChannels > this.stats.largestBatch) {
            this.stats.largestBatch = totalChannels;
        }

        // Verificar que el sistema de scoring está disponible
        if (!app || !app.rankingScoreConfig || typeof app.enrichChannelWithScore !== 'function') {
            console.error('❌ Sistema de scoring no disponible');
            console.groupEnd();
            return channels;
        }

        let rankedCount = 0;
        let errorCount = 0;
        const { batchSize, yieldInterval, progressLogInterval, enableProgressLog } = this.config;

        // ═══════════════════════════════════════════════════════════════════════
        // PROCESAMIENTO POR LOTES (BATCH PROCESSING)
        // ═══════════════════════════════════════════════════════════════════════

        const totalBatches = Math.ceil(totalChannels / batchSize);
        console.log(`🔄 Procesando en ${totalBatches} lotes de ${batchSize.toLocaleString()} canales`);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * batchSize;
            const end = Math.min(start + batchSize, totalChannels);
            const batch = channels.slice(start, end);

            // Procesar lote actual
            for (let i = 0; i < batch.length; i++) {
                try {
                    app.enrichChannelWithScore(batch[i]);
                    rankedCount++;
                } catch (e) {
                    errorCount++;
                    if (this.debugMode && errorCount <= 3) {
                        console.warn(`⚠️ Error en canal ${start + i}:`, e.message);
                    }
                }
            }

            // Log de progreso periódico
            if (enableProgressLog && (batchIndex + 1) % progressLogInterval === 0) {
                const pct = Math.round(((batchIndex + 1) / totalBatches) * 100);
                console.log(`   📈 Progreso: ${pct}% (${rankedCount.toLocaleString()} / ${totalChannels.toLocaleString()})`);
            }

            // Yield al event loop para no bloquear UI (solo si hay más lotes)
            if (batchIndex < totalBatches - 1 && yieldInterval > 0) {
                await this._sleep(yieldInterval);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // APLICAR RANKING DINÁMICO (SI ESTÁ DISPONIBLE)
        // ═══════════════════════════════════════════════════════════════════════

        if (app.rankingEngine && app.state && app.state.rankingConfig) {
            try {
                console.log('🔄 Aplicando ranking dinámico...');

                // También por lotes para 300k+
                for (let i = 0; i < totalBatches; i++) {
                    const start = i * batchSize;
                    const end = Math.min(start + batchSize, totalChannels);

                    for (let j = start; j < end; j++) {
                        channels[j]._ranking = app.rankingEngine.calculateScore(
                            channels[j],
                            app.state.rankingConfig
                        );
                    }

                    // Yield cada lote
                    if (i < totalBatches - 1) {
                        await this._sleep(10);
                    }
                }

                console.log('✅ Ranking dinámico aplicado');
            } catch (e) {
                console.warn('⚠️ Error en ranking dinámico:', e.message);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // ORDENAR POR CALIDAD (OPTIMIZADO)
        // ═══════════════════════════════════════════════════════════════════════

        try {
            console.log('🔄 Ordenando canales...');
            // JavaScript's native sort is already highly optimized (Timsort)
            channels.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
            console.log('✅ Canales ordenados por qualityScore');
        } catch (e) {
            console.warn('⚠️ Error ordenando:', e.message);
        }

        const executionTime = Date.now() - startTime;
        const channelsPerSecond = Math.round((rankedCount / executionTime) * 1000);

        // Actualizar estadísticas
        this.stats.totalChannelsRanked += rankedCount;
        this.stats.executionTimes.push(executionTime);
        this.stats.lastExecution = {
            source,
            timestamp: new Date().toISOString(),
            channels: totalChannels,
            rankedCount,
            errorCount,
            executionTime,
            channelsPerSecond
        };

        if (!this.stats.activationPoints[source]) {
            this.stats.activationPoints[source] = 0;
        }
        this.stats.activationPoints[source]++;

        // Resumen final
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`✅ Ranking completado: ${rankedCount.toLocaleString()} / ${totalChannels.toLocaleString()}`);
        if (errorCount > 0) console.warn(`⚠️ Errores: ${errorCount}`);
        console.log(`⏱️ Tiempo total: ${(executionTime / 1000).toFixed(2)}s`);
        console.log(`⚡ Velocidad: ${channelsPerSecond.toLocaleString()} canales/segundo`);
        console.log('═══════════════════════════════════════════════════════════');
        console.groupEnd();

        return channels;
    }

    /**
     * Utility: Sleep para yield al event loop
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HOOKS PARA LOS 6 PUNTOS CRÍTICOS (ASYNC)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Hook 1: processChannels
     */
    hookProcessChannels(originalMethod, appInstance) {
        const self = this;
        return async function (...args) {
            const result = await originalMethod.apply(appInstance, args);
            if (appInstance.state && appInstance.state.channelsMaster) {
                await self.applyUniversalRanking(
                    appInstance.state.channelsMaster,
                    { source: 'processChannels', appInstance }
                );
            }
            return result;
        };
    }

    /**
     * Hook 2: connectServer
     */
    hookConnectServer(originalMethod, appInstance) {
        const self = this;
        return async function (...args) {
            const result = await originalMethod.apply(appInstance, args);
            if (appInstance.state && appInstance.state.channelsMaster) {
                await self.applyUniversalRanking(
                    appInstance.state.channelsMaster,
                    { source: 'connectServer', appInstance }
                );
            }
            return result;
        };
    }

    /**
     * Hook 3: applyAdvancedFilters
     */
    hookApplyAdvancedFilters(originalMethod, appInstance) {
        const self = this;
        return async function (...args) {
            const result = await originalMethod.apply(appInstance, args);
            if (appInstance.state && appInstance.state.channels) {
                await self.applyUniversalRanking(
                    appInstance.state.channels,
                    { source: 'applyAdvancedFilters', appInstance }
                );
            }
            return result;
        };
    }

    /**
     * Hook 4: connectFromLibrary
     */
    hookConnectFromLibrary(originalMethod, appInstance) {
        const self = this;
        return async function (...args) {
            const result = await originalMethod.apply(appInstance, args);
            if (appInstance.state && appInstance.state.channelsMaster) {
                await self.applyUniversalRanking(
                    appInstance.state.channelsMaster,
                    { source: 'connectFromLibrary', appInstance }
                );
            }
            return result;
        };
    }

    /**
     * Hook 5: addServerToConnections
     */
    hookAddServerToConnections(originalMethod, appInstance) {
        const self = this;
        return async function (...args) {
            const result = await originalMethod.apply(appInstance, args);
            if (appInstance.state && appInstance.state.channelsMaster) {
                await self.applyUniversalRanking(
                    appInstance.state.channelsMaster,
                    { source: 'addServerToConnections', appInstance }
                );
            }
            return result;
        };
    }

    /**
     * Hook 6: probeAllChannelsBackend
     */
    hookProbeAllChannelsBackend(originalMethod, appInstance) {
        const self = this;
        return async function (...args) {
            const result = await originalMethod.apply(appInstance, args);
            if (appInstance.state && appInstance.state.channelsMaster) {
                await self.applyUniversalRanking(
                    appInstance.state.channelsMaster,
                    { source: 'probeAllChannelsBackend', appInstance }
                );
            }
            return result;
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INSTALACIÓN DE HOOKS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * 🔧 Instalar todos los hooks en la instancia de la app
     */
    installAllHooks(appInstance) {
        if (!appInstance) {
            console.error('❌ appInstance es null');
            return false;
        }

        console.group('🔧 Instalando AutoRanking Hooks (300K+ optimizado)');

        const hooks = [
            { name: 'processChannels', method: this.hookProcessChannels },
            { name: 'connectServer', method: this.hookConnectServer },
            { name: 'applyAdvancedFilters', method: this.hookApplyAdvancedFilters },
            { name: 'connectFromLibrary', method: this.hookConnectFromLibrary },
            { name: 'addServerToConnections', method: this.hookAddServerToConnections },
            { name: 'probeAllChannelsBackend', method: this.hookProbeAllChannelsBackend }
        ];

        let installedCount = 0;

        hooks.forEach(hook => {
            const originalMethod = appInstance[hook.name];

            if (typeof originalMethod === 'function') {
                appInstance[hook.name] = hook.method.call(this, originalMethod, appInstance);
                console.log(`✅ Hook instalado: ${hook.name}`);
                installedCount++;
            } else {
                console.warn(`⚠️ Método no encontrado: ${hook.name}`);
            }
        });

        console.log(`📊 Hooks instalados: ${installedCount}/${hooks.length}`);
        console.log(`🚀 Capacidad: 300,000+ canales`);
        console.groupEnd();

        return installedCount === hooks.length;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * 🔧 Configurar tamaño de lote
     */
    setBatchSize(size) {
        this.config.batchSize = Math.max(100, Math.min(50000, size));
        console.log(`📦 Batch size: ${this.config.batchSize.toLocaleString()}`);
    }

    /**
     * 🔧 Configurar intervalo de yield
     */
    setYieldInterval(ms) {
        this.config.yieldInterval = Math.max(0, Math.min(500, ms));
        console.log(`⏱️ Yield interval: ${this.config.yieldInterval}ms`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESTADÍSTICAS Y REPORTE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * 📊 Obtener estadísticas
     */
    getStats() {
        const avgTime = this.stats.executionTimes.length > 0
            ? Math.round(this.stats.executionTimes.reduce((a, b) => a + b, 0) / this.stats.executionTimes.length)
            : 0;

        return {
            ...this.stats,
            avgExecutionTime: avgTime,
            totalExecutions: this.stats.executionTimes.length,
            config: this.config
        };
    }

    /**
     * 📊 Imprimir reporte en consola
     */
    printReport() {
        const stats = this.getStats();

        console.group('📊 AutoRanking Engine v1.1 - Reporte (300K+ optimizado)');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`🎯 Total rankeados: ${stats.totalChannelsRanked.toLocaleString()}`);
        console.log(`🔄 Ejecuciones: ${stats.totalExecutions}`);
        console.log(`⏱️ Tiempo promedio: ${(stats.avgExecutionTime / 1000).toFixed(2)}s`);
        console.log(`📦 Batch más grande: ${stats.largestBatch.toLocaleString()} canales`);
        console.log('📍 Activaciones:');
        Object.entries(stats.activationPoints).forEach(([point, count]) => {
            console.log(`   - ${point}: ${count} veces`);
        });
        if (stats.lastExecution) {
            console.log('🕐 Última ejecución:');
            console.log(`   - Fuente: ${stats.lastExecution.source}`);
            console.log(`   - Canales: ${stats.lastExecution.channels.toLocaleString()}`);
            console.log(`   - Tiempo: ${(stats.lastExecution.executionTime / 1000).toFixed(2)}s`);
            console.log(`   - Velocidad: ${stats.lastExecution.channelsPerSecond?.toLocaleString() || 'N/A'} ch/s`);
        }
        console.log('⚙️ Configuración:');
        console.log(`   - Batch size: ${this.config.batchSize.toLocaleString()}`);
        console.log(`   - Yield interval: ${this.config.yieldInterval}ms`);
        console.log('═══════════════════════════════════════════════════════════');
        console.groupEnd();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONTROL
    // ═══════════════════════════════════════════════════════════════════════

    enable() {
        this.enabled = true;
        console.log('✅ AutoRankingEngine habilitado');
    }

    disable() {
        this.enabled = false;
        console.warn('⚠️ AutoRankingEngine deshabilitado');
    }

    setDebugMode(enabled) {
        this.debugMode = enabled;
        console.log(`🔧 Debug mode: ${enabled ? 'ON' : 'OFF'}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTAR GLOBALMENTE
// ═══════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.AutoRankingEngine = AutoRankingEngine;
    console.log('✅ AutoRankingEngine v1.1 disponible globalmente (300K+ optimizado)');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AutoRankingEngine;
}
