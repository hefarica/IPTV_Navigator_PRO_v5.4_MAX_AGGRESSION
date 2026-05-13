/**
 * TabLifecycleManager - Sistema de Hibernación de Pestañas
 * Versión: V5.0 Generator Supremacy
 * Objetivo: Liberar RAM eliminando el DOM de pestañas inactivas.
 */
class TabLifecycleManager {
    constructor() {
        this.activeTab = null;
        // Pestañas consideradas "pesadas" que deben limpiarse al salir
        this.heavyTabs = [
            'analysis-section',
            'filters-section',
            'servers-section',
            'comparison-section',
            'analisis-section',      // Alias español
            'filtros-section',       // Alias español
            'servidores-section',    // Alias español
            // Formato tab-* usado en index-v4.html
            'tab-analysis',
            'tab-filters',
            'tab-servers',
            'tab-sources',
            'tab-ranking'
        ];
        this.hibernatedTabs = new Set();
        console.log('[TabLifecycle] ✅ Manager inicializado');
    }

    /**
     * Se llama cuando el usuario cambia de pestaña.
     * @param {string} newTabId - ID de la sección a mostrar (ej: 'generator-section')
     */
    switchTab(newTabId) {
        const oldTabId = this.activeTab;
        this.activeTab = newTabId;

        // 1. Hibernar la pestaña anterior (Si era pesada)
        if (oldTabId && oldTabId !== newTabId) {
            this._hibernate(oldTabId);
        }

        // 2. Despertar la nueva pestaña (Si es el Generador, preparar terreno)
        const generatorTabs = [
            'generator-section', 'exportar-section', 'generar-section',
            'tab-generator', 'tab-export'
        ];
        if (generatorTabs.includes(newTabId)) {
            this._activateGeneratorMode();
        } else {
            // Si volvemos a una pestaña normal, reactivar procesos si es necesario
            this._restoreNormalMode();
        }

        // 3. Si la pestaña estaba hibernada, marcarla para re-render
        if (this.hibernatedTabs.has(newTabId)) {
            this.hibernatedTabs.delete(newTabId);
            return { needsRerender: true, tabId: newTabId };
        }

        return { needsRerender: false, tabId: newTabId };
    }

    _hibernate(tabId) {
        if (!this.heavyTabs.includes(tabId)) return;

        const container = document.getElementById(tabId);
        if (!container) return;

        // Buscamos tablas grandes para vaciarlas
        const tbodies = container.querySelectorAll('tbody');
        let freedNodes = 0;

        tbodies.forEach(tb => {
            freedNodes += tb.childNodes.length;
            tb.innerHTML = ''; // 🔥 AQUÍ OCURRE LA MAGIA DE LIBERAR RAM
        });

        // También limpiar listas virtuales si existen
        const virtualLists = container.querySelectorAll('.virtual-list-container, .channel-list, .server-list');
        virtualLists.forEach(vl => {
            freedNodes += vl.childNodes.length;
            vl.innerHTML = '';
        });

        // Limpiar divs de contenido dinámico
        const dynamicContainers = container.querySelectorAll('[data-dynamic="true"]');
        dynamicContainers.forEach(dc => {
            freedNodes += dc.childNodes.length;
            dc.innerHTML = '';
        });

        if (freedNodes > 0) {
            this.hibernatedTabs.add(tabId);
            console.log(`[Lifecycle] 💤 Hibernando ${tabId}. Nodos liberados: ~${freedNodes}`);

            // Forzar garbage collection hint
            if (window.gc) {
                try { window.gc(); } catch (e) { }
            }
        }
    }

    _activateGeneratorMode() {
        console.log("[Lifecycle] 🚀 Modo Generador Activo: Prioridad CPU Máxima.");

        // Pausar workers de enriquecimiento si existen
        if (window.AutoEnricher && typeof window.AutoEnricher.pause === 'function') {
            window.AutoEnricher.pause();
        }

        // Pausar cualquier proceso de background
        if (window.EnrichmentModule && typeof window.EnrichmentModule.pause === 'function') {
            window.EnrichmentModule.pause();
        }

        // Limpiar todas las pestañas pesadas antes de generar
        this.heavyTabs.forEach(tabId => {
            if (tabId !== this.activeTab) {
                this._hibernate(tabId);
            }
        });
    }

    _restoreNormalMode() {
        // Reactivar procesos background si salimos del generador
        if (window.AutoEnricher && typeof window.AutoEnricher.resume === 'function') {
            window.AutoEnricher.resume();
        }
        if (window.EnrichmentModule && typeof window.EnrichmentModule.resume === 'function') {
            window.EnrichmentModule.resume();
        }
    }

    /**
     * Forzar hibernación de todas las pestañas pesadas
     * Útil antes de operaciones intensivas
     */
    hibernateAll() {
        console.log('[Lifecycle] 🧹 Hibernando TODAS las pestañas pesadas...');
        this.heavyTabs.forEach(tabId => this._hibernate(tabId));
    }

    /**
     * Obtener estadísticas de memoria aproximadas
     */
    getStats() {
        return {
            activeTab: this.activeTab,
            hibernatedCount: this.hibernatedTabs.size,
            hibernatedTabs: Array.from(this.hibernatedTabs)
        };
    }
}

// Instancia global
window.TabLifecycleManager = TabLifecycleManager;
window.tabLifecycle = new TabLifecycleManager();

console.log('[TabLifecycle] 📦 Módulo cargado correctamente');
