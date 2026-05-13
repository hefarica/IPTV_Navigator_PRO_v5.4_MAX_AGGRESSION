/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🔧 PATCH FIX V4.12.3 - CORRECCIÓN CRÍTICA PARA IPTV NAVIGATOR PRO
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * PROBLEMAS DIAGNOSTICADOS:
 * - Error: "TypeError: this.applyFilters is not a function" en línea 5840
 * - Worker thread failures bloqueando procesamiento paralelo
 * - Pérdida de contexto 'this' en callbacks y filters
 * 
 * SOLUCIÓN IMPLEMENTADA:
 * - Binding explícito de métodos críticos
 * - Defensive programming en filter chains
 * - Enhanced error handling para Workers
 * - Fallback strategies para operaciones críticas
 * 
 * MODO DE USO:
 * 1. Cargar este script ANTES de app.js
 * 2. En el constructor de app, llamar: applyPatchV4_12_3.call(this);
 * 3. Reemplazar llamadas a this.applyFilters() con this.safeApplyFilters()
 * ═══════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════
// 1️⃣ CONTEXT PRESERVER - Binding Automático de Métodos Críticos
// ═══════════════════════════════════════════════════════════════════════

/**
 * Bind all critical methods to preserve 'this' context
 * Call this in constructor or initialization phase
 */
function bindCriticalMethods() {
    const criticalMethods = [
        'applyFilters',
        'renderTable',
        'calculateStats',
        'updateStatsUI',
        'renderServerList',
        'saveActiveServers',
        'saveChannelsList',
        'autoEnrichAllActiveSources',
        'updateMiniProgress',
        'showNotification',
        'setLoading'
    ];

    let boundCount = 0;
    criticalMethods.forEach(methodName => {
        if (typeof this[methodName] === 'function') {
            this[methodName] = this[methodName].bind(this);
            boundCount++;
        }
    });

    console.log(`✅ [Patch V4.12.3] Bound ${boundCount}/${criticalMethods.length} critical methods`);
}

// ═══════════════════════════════════════════════════════════════════════
// 2️⃣ SAFE FILTER EXECUTOR - Defensive applyFilters Wrapper
// ═══════════════════════════════════════════════════════════════════════

/**
 * Safe version of applyFilters with context preservation and error handling
 * Replace all 'this.applyFilters()' calls with 'this.safeApplyFilters()'
 */
function safeApplyFilters() {
    try {
        // ✅ Verificación de contexto
        if (typeof this.applyFilters !== 'function') {
            console.error('❌ [Patch V4.12.3] applyFilters not found in context');

            // 🔄 FALLBACK: Intentar renderTable directo
            if (typeof this.renderTable === 'function') {
                console.warn('⚠️ [Patch V4.12.3] Fallback to renderTable()');
                return this.renderTable();
            }

            throw new Error('Neither applyFilters nor renderTable available');
        }

        // ✅ Ejecutar con binding explícito
        const boundApplyFilters = this.applyFilters.bind(this);
        return boundApplyFilters();

    } catch (error) {
        console.error('❌ [Patch V4.12.3] safeApplyFilters failed:', error);

        // 🚨 Emergency fallback: force re-render channels
        if (Array.isArray(this.state?.channels)) {
            console.warn('🔄 [Patch V4.12.3] Emergency fallback: rendering raw channels');
            return this.renderTable?.() || console.error('No render method available');
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 3️⃣ ENHANCED WORKER MANAGER - Robust Worker Error Handling
// ═══════════════════════════════════════════════════════════════════════

/**
 * Enhanced Worker initialization with better error recovery
 * Replace the Worker setup block with this
 */
function initEnhancedWorker(workerPath = './worker-ranking.js') {
    try {
        // ✅ Verificar disponibilidad de Worker
        if (typeof Worker === 'undefined') {
            console.error('❌ [Patch V4.12.3] Web Workers not supported');
            this.workerFallbackMode = true;
            return null;
        }

        // ✅ Crear Worker con timeout de inicialización
        const workerInitTimeout = setTimeout(() => {
            console.error('❌ [Patch V4.12.3] Worker initialization timeout (10s)');
            if (this.worker) {
                this.worker.terminate();
            }
            this.workerFallbackMode = true;
        }, 10000);

        const versionedPath = workerPath + '?v=' + Date.now();
        this.worker = new Worker(versionedPath);

        // ✅ Enhanced message handler
        this.worker.onmessage = (e) => {
            clearTimeout(workerInitTimeout);

            const { action, data, error } = e.data || {};

            if (error) {
                console.error(`❌ [Patch V4.12.3] Worker reported error:`, error);
                this.updateMiniProgress?.({ status: `Error: ${error}`, state: "pause" });
                return;
            }

            console.log(`✅ [Patch V4.12.3] Worker action: ${action}`);
        };

        // ✅ Enhanced error handler
        this.worker.onerror = (e) => {
            clearTimeout(workerInitTimeout);

            console.error('❌ [Patch V4.12.3] Worker Error Details:', {
                message: e.message || 'Unknown error',
                filename: e.filename || 'Unknown file',
                lineno: e.lineno || 0,
                colno: e.colno || 0
            });

            this.updateMiniProgress?.({
                status: `Worker Error: ${e.message || 'Unknown'}`,
                state: "pause"
            });

            // 🔄 Fallback: disable worker for this session
            this.workerFallbackMode = true;
            this.worker = null;

            console.warn('⚠️ [Patch V4.12.3] Worker disabled, using fallback mode');
        };

        console.log('✅ [Patch V4.12.3] Enhanced Worker initialized');
        return this.worker;

    } catch (error) {
        console.error('❌ [Patch V4.12.3] Worker init failed:', error);
        this.workerFallbackMode = true;
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 4️⃣ SAFE ARRAY FILTER - Defensive Channel Filtering
// ═══════════════════════════════════════════════════════════════════════

/**
 * Safe array filter with context preservation
 * Use instead of: channels.filter(ch => this.someMethod(ch))
 */
function safeChannelFilter(channels, filterFn) {
    if (!Array.isArray(channels)) {
        console.error('❌ [Patch V4.12.3] Invalid channels array');
        return [];
    }

    if (typeof filterFn !== 'function') {
        console.warn('⚠️ [Patch V4.12.3] No filter function, returning all');
        return channels;
    }

    try {
        // ✅ Bind filter function to correct context
        const boundFilter = filterFn.bind(this);
        return channels.filter(ch => {
            try {
                return boundFilter(ch);
            } catch (error) {
                console.error('❌ [Patch V4.12.3] Filter error:', error);
                return false; // Exclude channels that cause errors
            }
        });
    } catch (error) {
        console.error('❌ [Patch V4.12.3] Fatal filter error:', error);
        return channels; // Return unfiltered as fallback
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 5️⃣ SAFE SERVER REMOVAL - Corrige el problema específico de eliminación
// ═══════════════════════════════════════════════════════════════════════

/**
 * Safe server removal with proper context binding
 */
function safeRemoveServer(serverId) {
    console.group(`🗑️ [Patch V4.12.3] Safe Remove Server: ${serverId}`);

    try {
        // 1. Remover de activeServers
        if (Array.isArray(this.state?.activeServers)) {
            const beforeCount = this.state.activeServers.length;
            this.state.activeServers = this.state.activeServers.filter(s => s.id !== serverId);
            console.log(`📊 Servers: ${beforeCount} → ${this.state.activeServers.length}`);
        }

        // 2. Remover canales asociados
        if (Array.isArray(this.state?.channelsMaster)) {
            const beforeCount = this.state.channelsMaster.length;
            this.state.channelsMaster = this.state.channelsMaster.filter(ch => ch.serverId !== serverId);
            console.log(`📊 Channels: ${beforeCount} → ${this.state.channelsMaster.length}`);
        }

        // 3. Actualizar channels (filtered view)
        this.state.channels = [...this.state.channelsMaster];

        // 4. Aplicar filtros de forma segura
        if (typeof this.safeApplyFilters === 'function') {
            this.safeApplyFilters();
        } else if (typeof this.applyFilters === 'function') {
            this.applyFilters.bind(this)();
        } else if (typeof this.renderTable === 'function') {
            this.renderTable();
        }

        // 5. Actualizar UI
        this.calculateStats?.();
        this.updateStatsUI?.();
        this.renderServerList?.();

        // 6. Persistir cambios
        this.saveActiveServers?.();
        this.saveChannelsList?.();

        console.log(`✅ Server ${serverId} removed successfully`);
        this.showNotification?.(`✅ Servidor eliminado`, false);

    } catch (error) {
        console.error('❌ [Patch V4.12.3] Safe remove failed:', error);
        this.showNotification?.(`❌ Error al eliminar: ${error.message}`, true);
    }

    console.groupEnd();
}

// ═══════════════════════════════════════════════════════════════════════
// 6️⃣ INTEGRATION HOOK - Aplicar Patch Automáticamente
// ═══════════════════════════════════════════════════════════════════════

/**
 * Auto-apply patch when IPTVNavigator is initialized
 * Add this at the END of your IPTVNavigator class constructor:
 * 
 * if (typeof applyPatchV4_12_3 === 'function') {
 *     applyPatchV4_12_3.call(this);
 * }
 */
function applyPatchV4_12_3() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('🔧 APPLYING PATCH V4.12.3 - Context & Worker Fixes');
    console.log('═══════════════════════════════════════════════════════════════════════');

    try {
        // 1️⃣ Bind critical methods
        this.bindCriticalMethods = bindCriticalMethods.bind(this);
        this.bindCriticalMethods();

        // 2️⃣ Add safe methods
        this.safeApplyFilters = safeApplyFilters.bind(this);
        this.safeChannelFilter = safeChannelFilter.bind(this);
        this.safeRemoveServer = safeRemoveServer.bind(this);
        this.initEnhancedWorker = initEnhancedWorker.bind(this);

        // 3️⃣ Setup fallback mode flag
        if (typeof this.workerFallbackMode === 'undefined') {
            this.workerFallbackMode = false;
        }

        // 4️⃣ Patch version info
        this.patchVersion = 'V4.12.3';
        this.patchAppliedAt = new Date().toISOString();

        console.log('');
        console.log('✅ Patch V4.12.3 Applied Successfully');
        console.log('   - bindCriticalMethods: ✅');
        console.log('   - safeApplyFilters: ✅');
        console.log('   - safeChannelFilter: ✅');
        console.log('   - safeRemoveServer: ✅');
        console.log('   - initEnhancedWorker: ✅');
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('');

        return true;

    } catch (error) {
        console.error('❌ [Patch V4.12.3] Failed to apply:', error);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 📋 EXPORT PARA USO GLOBAL
// ═══════════════════════════════════════════════════════════════════════

// Make functions available globally
window.applyPatchV4_12_3 = applyPatchV4_12_3;
window.bindCriticalMethods = bindCriticalMethods;
window.safeApplyFilters = safeApplyFilters;
window.safeChannelFilter = safeChannelFilter;
window.safeRemoveServer = safeRemoveServer;
window.initEnhancedWorker = initEnhancedWorker;

// Module export for environments that support it
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        applyPatchV4_12_3,
        bindCriticalMethods,
        safeApplyFilters,
        safeChannelFilter,
        safeRemoveServer,
        initEnhancedWorker
    };
}

console.log('');
console.log('╔═══════════════════════════════════════════════════════════════════════╗');
console.log('║ 🔧 PATCH_FIX_V4.12.3.js loaded - Ready to apply                      ║');
console.log('╠═══════════════════════════════════════════════════════════════════════╣');
console.log('║ Usage: In app constructor, add:                                      ║');
console.log('║   if (typeof applyPatchV4_12_3 === "function") {                     ║');
console.log('║       applyPatchV4_12_3.call(this);                                  ║');
console.log('║   }                                                                  ║');
console.log('╚═══════════════════════════════════════════════════════════════════════╝');
console.log('');
