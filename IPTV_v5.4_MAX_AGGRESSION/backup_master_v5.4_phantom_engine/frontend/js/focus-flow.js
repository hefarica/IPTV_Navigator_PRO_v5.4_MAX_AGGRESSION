/**
 * ═══════════════════════════════════════════════════════════════════
 * 🌊 FOCUS FLOW V5.2 - Generator Supremacy Edition
 * Gestión avanzada de flujo de foco y recursos de UI
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Este módulo complementa TabLifecycleManager con:
 * - Tracking de transiciones de pestaña
 * - Pausado inteligente de intervals/observers
 * - Pre-carga predictiva de pestañas frecuentes
 * - Estadísticas de uso de memoria estimada
 * 
 * @version 5.2.0
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // 🌊 FOCUS FLOW CONTROLLER
    // ═══════════════════════════════════════════════════════════════════

    const FocusFlow = {
        version: '5.2.0',

        // Estado interno
        state: {
            currentTab: null,
            previousTab: null,
            transitionHistory: [],
            pausedIntervals: [],
            pausedObservers: [],
            isGeneratorPriority: false
        },

        // Configuración
        config: {
            maxHistorySize: 50,
            enablePredictiveLoading: false,
            logTransitions: true,
            pauseBackgroundProcesses: true
        },

        // ═══════════════════════════════════════════════════════════════
        // 📦 INITIALIZATION
        // ═══════════════════════════════════════════════════════════════

        init() {
            console.log(`[FocusFlow] 🌊 v${this.version} inicializando...`);

            // Registrar en window para acceso global
            window.FocusFlow = this;

            // Sincronizar con TabLifecycleManager si existe
            this._syncWithTabLifecycle();

            console.log('[FocusFlow] ✅ Inicializado correctamente');
        },

        _syncWithTabLifecycle() {
            if (window.tabLifecycle) {
                // Envolver switchTab para capturar transiciones
                const originalSwitch = window.tabLifecycle.switchTab.bind(window.tabLifecycle);
                window.tabLifecycle.switchTab = (newTabId) => {
                    this.onTabChange(this.state.currentTab, newTabId);
                    return originalSwitch(newTabId);
                };
                console.log('[FocusFlow] 🔗 Enlazado con TabLifecycleManager');
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // 🔄 TAB CHANGE HANDLING
        // ═══════════════════════════════════════════════════════════════

        onTabChange(prevTab, nextTab) {
            this.state.previousTab = prevTab;
            this.state.currentTab = nextTab;

            // Registrar transición
            this._recordTransition(prevTab, nextTab);

            if (this.config.logTransitions) {
                console.log(`[FocusFlow] 🔄 Transición: ${prevTab || 'inicio'} → ${nextTab}`);
            }

            // Verificar si entramos en modo Generator Priority
            const generatorTabs = ['tab-generator', 'tab-export', 'generator-section', 'export-section'];
            if (generatorTabs.includes(nextTab)) {
                this._enterGeneratorPriority();
            } else if (this.state.isGeneratorPriority) {
                this._exitGeneratorPriority();
            }
        },

        _recordTransition(from, to) {
            this.state.transitionHistory.push({
                from: from,
                to: to,
                timestamp: Date.now()
            });

            // Limitar tamaño del historial
            if (this.state.transitionHistory.length > this.config.maxHistorySize) {
                this.state.transitionHistory.shift();
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // 🚀 GENERATOR PRIORITY MODE
        // ═══════════════════════════════════════════════════════════════

        _enterGeneratorPriority() {
            if (this.state.isGeneratorPriority) return;

            console.log('[FocusFlow] 🚀 MODO GENERATOR PRIORITY ACTIVADO');
            this.state.isGeneratorPriority = true;

            if (this.config.pauseBackgroundProcesses) {
                this._pauseBackgroundProcesses();
            }

            // Forzar garbage collection hint
            this._hintGarbageCollection();

            // Notificar a otros módulos
            this._broadcastPriorityChange(true);
        },

        _exitGeneratorPriority() {
            if (!this.state.isGeneratorPriority) return;

            console.log('[FocusFlow] 🔓 Modo Generator Priority desactivado');
            this.state.isGeneratorPriority = false;

            this._resumeBackgroundProcesses();
            this._broadcastPriorityChange(false);
        },

        _broadcastPriorityChange(isPriority) {
            // Usar CustomEvent para notificar a otros módulos
            const event = new CustomEvent('generatorPriorityChange', {
                detail: { isPriority: isPriority }
            });
            document.dispatchEvent(event);
        },

        // ═══════════════════════════════════════════════════════════════
        // ⏸️ PROCESS MANAGEMENT
        // ═══════════════════════════════════════════════════════════════

        _pauseBackgroundProcesses() {
            console.log('[FocusFlow] ⏸️ Pausando procesos de fondo...');

            // Pausar AutoEnricher si existe
            if (window.AutoEnricher && typeof window.AutoEnricher.pause === 'function') {
                window.AutoEnricher.pause();
            }

            // Pausar EnrichmentModule si existe
            if (window.EnrichmentModule && typeof window.EnrichmentModule.pause === 'function') {
                window.EnrichmentModule.pause();
            }

            // Pausar workers de enriquecimiento
            if (window.EnrichmentWorkerManager && typeof window.EnrichmentWorkerManager.pauseAll === 'function') {
                window.EnrichmentWorkerManager.pauseAll();
            }
        },

        _resumeBackgroundProcesses() {
            console.log('[FocusFlow] ▶️ Reanudando procesos de fondo...');

            if (window.AutoEnricher && typeof window.AutoEnricher.resume === 'function') {
                window.AutoEnricher.resume();
            }

            if (window.EnrichmentModule && typeof window.EnrichmentModule.resume === 'function') {
                window.EnrichmentModule.resume();
            }

            if (window.EnrichmentWorkerManager && typeof window.EnrichmentWorkerManager.resumeAll === 'function') {
                window.EnrichmentWorkerManager.resumeAll();
            }
        },

        _hintGarbageCollection() {
            // Hint para GC (solo funciona en algunos contextos)
            if (window.gc) {
                try {
                    window.gc();
                    console.log('[FocusFlow] 🧹 GC hint ejecutado');
                } catch (e) {
                    // Silenciar si no está disponible
                }
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // 📊 STATISTICS & REPORTING
        // ═══════════════════════════════════════════════════════════════

        getStats() {
            const memoryInfo = this._getMemoryEstimate();

            return {
                currentTab: this.state.currentTab,
                previousTab: this.state.previousTab,
                isGeneratorPriority: this.state.isGeneratorPriority,
                totalTransitions: this.state.transitionHistory.length,
                memory: memoryInfo,
                lastTransitions: this.state.transitionHistory.slice(-5)
            };
        },

        _getMemoryEstimate() {
            if (performance.memory) {
                return {
                    usedHeap: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
                    totalHeap: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
                    limit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB'
                };
            }
            return { available: false };
        },

        getMostFrequentTransitions() {
            const counts = {};
            this.state.transitionHistory.forEach(t => {
                const key = `${t.from || 'null'} → ${t.to}`;
                counts[key] = (counts[key] || 0) + 1;
            });

            return Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([transition, count]) => ({ transition, count }));
        },

        // ═══════════════════════════════════════════════════════════════
        // 🔧 PUBLIC API
        // ═══════════════════════════════════════════════════════════════

        /**
         * Forzar modo prioridad (útil antes de operaciones pesadas)
         */
        forceGeneratorPriority() {
            this._enterGeneratorPriority();
        },

        /**
         * Liberar modo prioridad manualmente
         */
        releaseGeneratorPriority() {
            this._exitGeneratorPriority();
        },

        /**
         * Verificar si está en modo prioridad
         */
        isInPriorityMode() {
            return this.state.isGeneratorPriority;
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 🌐 AUTO-INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => FocusFlow.init());
    } else {
        setTimeout(() => FocusFlow.init(), 50);
    }

    // Export global
    window.FocusFlow = FocusFlow;

    console.log('[FocusFlow] 📦 Módulo cargado');

})();
