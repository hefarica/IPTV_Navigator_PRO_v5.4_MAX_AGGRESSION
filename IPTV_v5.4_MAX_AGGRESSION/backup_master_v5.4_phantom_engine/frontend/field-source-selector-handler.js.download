/**
 * field-source-selector-handler.js
 * Activates A/S/H/P/E buttons in column selector and syncs with FieldSourcePolicy
 * 
 * v4.8 - IIFE/Global compatible
 */

(function () {
    'use strict';

    // Source code to internal source mapping
    var SOURCE_MAP = {
        'auto': 'auto',
        'A': 'auto',
        'server': 'base',
        'S': 'base',
        'heuristics': 'heuristics',
        'H': 'heuristics',
        'probe': 'tech',
        'P': 'tech',
        'external': 'external',
        'E': 'external'
    };

    // Active colors for each source
    var SOURCE_COLORS = {
        'auto': '#60a5fa',      // Blue
        'base': '#4ade80',      // Green
        'heuristics': '#fbbf24', // Yellow
        'tech': '#f472b6',      // Pink
        'external': '#a78bfa'   // Purple
    };

    // Storage key for config persistence
    var CONFIG_STORAGE_KEY = 'iptv_field_source_config';

    /**
     * Initialize all source selector buttons
     * Called after column list UI is rendered
     */
    function initSourceSelectors() {
        var buttons = document.querySelectorAll('button[data-field][data-source]');

        if (!buttons.length) {
            console.log('[FieldSourceHandler] No se encontraron botones de fuente');
            return;
        }

        buttons.forEach(function (btn) {
            // Remove any existing listeners to prevent duplicates
            var clone = btn.cloneNode(true);
            btn.parentNode.replaceChild(clone, btn);

            clone.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                var field = clone.dataset.field;
                var source = clone.dataset.source;

                if (!field || !source) return;

                handleSourceClick(field, source, clone);
            });
        });

        // ✅ V4.8.2: Apply saved visual state after buttons are ready
        applySavedVisualState();

        console.log('✅ FieldSourceSelectorHandler: ' + buttons.length + ' botones inicializados');
    }

    /**
     * Apply saved configuration to visual elements (buttons and checkboxes)
     */
    function applySavedVisualState() {
        try {
            var saved = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (!saved) return;

            var config = JSON.parse(saved);
            console.log('🔄 [FieldSource] Aplicando estado visual guardado');

            // 1. Apply source button visual states
            if (config.sourcePolicies) {
                for (var field in config.sourcePolicies) {
                    if (config.sourcePolicies.hasOwnProperty(field)) {
                        var policyArray = config.sourcePolicies[field];
                        var primarySource = Array.isArray(policyArray) ? policyArray[0] : policyArray;
                        updateButtonStates(field, primarySource);
                    }
                }

                // Sync with FieldSourcePolicy global
                if (window.FieldSourcePolicy && window.FieldSourcePolicy.setPolicy) {
                    for (var f in config.sourcePolicies) {
                        if (config.sourcePolicies.hasOwnProperty(f)) {
                            var update = {};
                            update[f] = config.sourcePolicies[f];
                            window.FieldSourcePolicy.setPolicy(update);
                        }
                    }
                }
            }

            // 2. Apply checkbox states for selected columns
            if (config.selectedColumns && Array.isArray(config.selectedColumns)) {
                config.selectedColumns.forEach(function (colId) {
                    var checkbox = document.getElementById('col_' + colId);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                });

                // Update app state
                if (window.app && window.app.state) {
                    window.app.state.activeColumns = config.selectedColumns.slice();

                    // Also sync with AdvancedDataRenderer
                    if (window.app.advancedDataRenderer) {
                        window.app.advancedDataRenderer.selectedFields = config.selectedColumns.slice();
                    }

                    // Force table refresh with new columns
                    setTimeout(function () {
                        if (window.app.renderTable) {
                            window.app.renderTable();
                            console.log('✅ [FieldSource] Tabla actualizada con', config.selectedColumns.length, 'columnas');
                        }
                    }, 100);
                }
            }

        } catch (e) {
            console.warn('⚠️ [FieldSource] Error aplicando estado visual:', e);
        }
    }

    /**
     * Handle source button click
     */
    function handleSourceClick(field, source, buttonElement) {
        var normalizedSource = SOURCE_MAP[source] || source;

        console.log('🔧 Cambiando fuente: ' + field + ' → ' + normalizedSource);

        // Update FieldSourcePolicy if available
        if (window.FieldSourcePolicy && window.FieldSourcePolicy.setPolicy) {
            var update = {};
            if (normalizedSource === 'auto') {
                // Reset to default
                update[field] = window.FieldSourcePolicy.defaults[field] || ['tech', 'base', 'heuristics', 'external'];
            } else {
                // Set as primary source
                var current = window.FieldSourcePolicy.getPolicy(field) || ['tech', 'base', 'heuristics', 'external'];
                // Move selected source to front
                var newOrder = [normalizedSource];
                current.forEach(function (s) {
                    if (s !== normalizedSource && newOrder.indexOf(s) === -1) {
                        newOrder.push(s);
                    }
                });
                update[field] = newOrder;
            }
            window.FieldSourcePolicy.setPolicy(update);
        }

        // Update AdvancedDataRenderer if available
        if (window.app && window.app.advancedDataRenderer) {
            window.app.advancedDataRenderer.setFieldSource(field, normalizedSource);
        }

        // Update button visual states
        updateButtonStates(field, normalizedSource);

        // Refresh table
        if (window.app && window.app.applyFilters) {
            window.app.applyFilters();
        }
    }

    /**
     * Update visual state of source buttons for a field
     */
    function updateButtonStates(field, activeSource) {
        var buttons = document.querySelectorAll('button[data-field="' + field + '"][data-source]');

        buttons.forEach(function (btn) {
            var btnSource = SOURCE_MAP[btn.dataset.source] || btn.dataset.source;
            var isActive = (btnSource === activeSource);

            btn.style.background = isActive ? (SOURCE_COLORS[btnSource] || '#60a5fa') : '#334155';
            btn.style.color = isActive ? '#000' : '#94a3b8';
        });
    }

    /**
     * Refresh all button states from current policy
     */
    function refreshAllButtonStates() {
        if (!window.FieldSourcePolicy) return;

        var policies = window.FieldSourcePolicy.getAllPolicies();
        for (var field in policies) {
            if (policies.hasOwnProperty(field) && policies[field].length > 0) {
                updateButtonStates(field, policies[field][0]);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // SAVE/RESTORE CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Save current field source configuration
     */
    function saveFieldSourceConfig() {
        var config = {
            timestamp: Date.now(),
            version: '4.8'
        };

        // Get source policies
        if (window.FieldSourcePolicy && window.FieldSourcePolicy.getAllPolicies) {
            config.sourcePolicies = window.FieldSourcePolicy.getAllPolicies();
        } else if (window.app && window.app.advancedDataRenderer) {
            config.sourcePolicies = window.app.advancedDataRenderer.fieldSourcePolicy || {};
        }

        // Get selected columns
        if (window.app && window.app.state && window.app.state.activeColumns) {
            config.selectedColumns = window.app.state.activeColumns.slice();
        }

        try {
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
            console.log('💾 [FieldSource] Configuración guardada:', config);
            showConfigNotification('✅ Selección guardada');
            return true;
        } catch (e) {
            console.error('❌ [FieldSource] Error guardando:', e);
            showConfigNotification('❌ Error al guardar', true);
            return false;
        }
    }

    /**
     * Restore field source configuration from storage
     */
    function restoreFieldSourceConfig() {
        try {
            var saved = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (!saved) return false;

            var config = JSON.parse(saved);
            console.log('📥 [FieldSource] Restaurando configuración:', config);

            // Restore source policies
            if (config.sourcePolicies && window.FieldSourcePolicy) {
                for (var field in config.sourcePolicies) {
                    if (config.sourcePolicies.hasOwnProperty(field)) {
                        var update = {};
                        update[field] = config.sourcePolicies[field];
                        window.FieldSourcePolicy.setPolicy(update);
                    }
                }
            }

            // Restore to AdvancedDataRenderer too
            if (config.sourcePolicies && window.app && window.app.advancedDataRenderer) {
                window.app.advancedDataRenderer.fieldSourcePolicy = JSON.parse(JSON.stringify(config.sourcePolicies));
            }

            // Restore selected columns
            if (config.selectedColumns && window.app && window.app.state) {
                window.app.state.activeColumns = config.selectedColumns.slice();
            }

            console.log('✅ [FieldSource] Configuración restaurada');
            return true;
        } catch (e) {
            console.error('❌ [FieldSource] Error restaurando:', e);
            return false;
        }
    }

    /**
     * Show notification for config save
     */
    function showConfigNotification(message, isError) {
        var notif = document.createElement('div');
        notif.textContent = message;
        notif.style.cssText = 'position:fixed;top:60px;right:20px;padding:8px 16px;border-radius:6px;z-index:999999;font-size:0.9rem;font-weight:500;' +
            'background:' + (isError ? '#ef4444' : '#10b981') + ';color:white;box-shadow:0 4px 12px rgba(0,0,0,0.3);';

        document.body.appendChild(notif);
        setTimeout(function () {
            notif.style.transition = 'opacity 0.3s';
            notif.style.opacity = '0';
            setTimeout(function () { notif.remove(); }, 300);
        }, 1500);
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(function () {
                restoreFieldSourceConfig(); // Restore first
                initSourceSelectors();
            }, 500);
        });
    } else {
        setTimeout(function () {
            restoreFieldSourceConfig(); // Restore first
            initSourceSelectors();
        }, 500);
    }

    // Expose functions globally
    window.FieldSourceHandler = {
        init: initSourceSelectors,
        updateButtonStates: updateButtonStates,
        refreshAllStates: refreshAllButtonStates,
        save: saveFieldSourceConfig,
        restore: restoreFieldSourceConfig
    };

    // Convenience aliases
    window.saveFieldSourceConfig = saveFieldSourceConfig;
    window.restoreFieldSourceConfig = restoreFieldSourceConfig;

    console.log('✅ FieldSourceSelectorHandler v4.8.1 cargado (con save/restore)');

})();

