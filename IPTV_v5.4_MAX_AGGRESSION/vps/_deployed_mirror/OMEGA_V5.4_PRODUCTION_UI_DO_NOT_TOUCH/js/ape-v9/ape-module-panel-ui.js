/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🧩 APE MODULE PANEL UI v1.3 - POPULATE EXISTING GRID
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * El contenedor HTML ya existe en index-v4.html
 * Este script solo popula #modules-toggle-grid con los toggles
 */

(function () {
    'use strict';

    console.log('%c🧩 Module Panel UI v1.3 - Iniciando...', 'color: #8b5cf6;');

    // Esperar DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // Esperar a ApeModuleManager (si no está, reintentar)
        if (!window.ApeModuleManager) {
            console.log('%c🧩 Esperando ApeModuleManager...', 'color: #94a3b8;');
            setTimeout(init, 200);
            return;
        }

        console.log('%c🧩 ApeModuleManager encontrado!', 'color: #4ade80;');
        populateGrid();
    }

    function populateGrid() {
        const grid = document.getElementById('modules-toggle-grid');
        if (!grid) {
            console.warn('⚠️ #modules-toggle-grid no encontrado');
            return;
        }

        // Limpiar "Cargando..."
        grid.innerHTML = '';

        // Obtener módulos
        // NOTA: window.APEv15.getStatus() fue eliminado del fallback porque su API es incompatible:
        // devuelve Promise<backend remoto:8085>, mientras aquí se espera objeto síncrono local.
        // Consumidor correcto de APEv15: Monitor Panel (ape-monitor-panel-v15.js).
        const modules = (typeof window.ApeModuleManager?.getStatus === 'function')
            ? window.ApeModuleManager.getStatus()
            : { modules: [], active: 0 };
        let activeCount = 0;

        Object.values(modules).forEach(module => {
            const toggle = createModuleToggle(module);
            grid.appendChild(toggle);
            if (module.enabled) activeCount++;
        });

        // Actualizar contador
        const countEl = document.getElementById('modulesActiveCount');
        if (countEl) countEl.textContent = `${activeCount} activos`;

        console.log(`%c✅ Module Panel UI v1.3 - ${Object.keys(modules).length} módulos cargados`, 'color: #4ade80; font-weight: bold;');
    }

    function createModuleToggle(module) {
        const wrapper = document.createElement('div');
        wrapper.className = 'module-toggle-item';
        wrapper.dataset.moduleId = module.id;
        wrapper.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            background: rgba(15,23,42,0.6);
            border: 1px solid ${module.enabled ? 'rgba(74,222,128,0.3)' : 'rgba(100,116,139,0.2)'};
            border-radius: 8px;
            transition: all 0.2s;
            cursor: pointer;
        `;

        // Status dot
        const dot = document.createElement('span');
        dot.className = 'module-status-dot';
        dot.style.cssText = `
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${getStatusColor(module)};
            flex-shrink: 0;
        `;
        wrapper.appendChild(dot);

        // Name
        const name = document.createElement('div');
        name.style.cssText = 'flex: 1; font-size: 0.72rem; font-weight: 500; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        name.textContent = module.name;
        wrapper.appendChild(name);

        // Switch
        const sw = document.createElement('div');
        sw.className = 'module-switch';
        sw.style.cssText = `
            width: 32px;
            height: 18px;
            background: ${module.enabled ? '#4ade80' : '#475569'};
            border-radius: 18px;
            position: relative;
            transition: background 0.2s;
        `;
        const knob = document.createElement('div');
        knob.className = 'module-knob';
        knob.style.cssText = `
            width: 14px;
            height: 14px;
            background: white;
            border-radius: 50%;
            position: absolute;
            top: 2px;
            left: ${module.enabled ? '16px' : '2px'};
            transition: left 0.2s;
        `;
        sw.appendChild(knob);
        wrapper.appendChild(sw);

        // Click handler
        wrapper.addEventListener('click', () => {
            if (typeof window.ApeModuleManager?.toggle === 'function') {
                window.ApeModuleManager.toggle(module.id);
            } else if (typeof window.APEv15?.toggle === 'function') {
                window.APEv15.toggle(module.id);
            }
            refreshUI();
        });

        return wrapper;
    }

    function getStatusColor(module) {
        if (!module.enabled) return '#475569';
        if (module.loaded) return '#4ade80';
        return '#fbbf24';
    }

    function refreshUI() {
        const grid = document.getElementById('modules-toggle-grid');
        if (!grid) return;

        // Fallback APEv15 eliminado por API incompatible (ver nota en populateGrid).
        const modules = (typeof window.ApeModuleManager?.getStatus === 'function')
            ? window.ApeModuleManager.getStatus()
            : { modules: [], active: 0 };
        let activeCount = 0;

        Object.values(modules).forEach(module => {
            const item = grid.querySelector(`[data-module-id="${module.id}"]`);
            if (!item) return;

            // Border
            item.style.borderColor = module.enabled ? 'rgba(74,222,128,0.3)' : 'rgba(100,116,139,0.2)';

            // Dot
            const dot = item.querySelector('.module-status-dot');
            if (dot) dot.style.background = getStatusColor(module);

            // Switch
            const sw = item.querySelector('.module-switch');
            const knob = item.querySelector('.module-knob');
            if (sw) sw.style.background = module.enabled ? '#4ade80' : '#475569';
            if (knob) knob.style.left = module.enabled ? '16px' : '2px';

            if (module.enabled) activeCount++;
        });

        // Update count
        const countEl = document.getElementById('modulesActiveCount');
        if (countEl) countEl.textContent = `${activeCount} activos`;
    }

    // Event listeners
    window.addEventListener('ape-module:module-enabled', refreshUI);
    window.addEventListener('ape-module:module-disabled', refreshUI);
    window.addEventListener('ape-module:modules-reset', populateGrid);

    window.refreshApeModulesUI = refreshUI;

})();
