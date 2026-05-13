/**
 * analysis-state-manager.js
 * Saves and restores Analysis tab state including:
 * - Selected columns
 * - Source policies per field (A/S/H/P/E)
 * - Active filters and filtered channels
 * 
 * v4.8 - IIFE/Global compatible
 */

(function () {
    'use strict';

    var STORAGE_KEY = 'iptv_analysis_tab_state';
    var CHANNELS_STORAGE_KEY = 'iptv_analysis_channels';

    // ═══════════════════════════════════════════════════════════════════
    // SAVE STATE
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Save current analysis tab state
     */
    function saveAnalysisState() {
        var state = {
            timestamp: Date.now(),
            version: '4.8'
        };

        // 1. Selected columns
        state.selectedColumns = getSelectedColumns();

        // 2. Source policies per field
        state.sourcePolicies = getSourcePolicies();

        // 3. Active filters configuration
        state.filters = getActiveFilters();

        // 4. Pagination state
        state.pagination = getPaginationState();

        // 5. Filtered channels from active servers
        var channelsData = getFilteredActiveChannels();
        state.channelsCount = channelsData.length;

        // Save config to localStorage
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

            // Save channels separately (may be large)
            saveChannelsToStorage(channelsData);

            console.log('✅ Estado de Análisis guardado:', state.channelsCount, 'canales');
            showSaveNotification('✅ Guardado: ' + state.channelsCount + ' canales');
            return true;
        } catch (e) {
            console.error('❌ Error guardando estado:', e);
            showSaveNotification('❌ Error al guardar', true);
            return false;
        }
    }

    /**
     * Get filtered channels from active servers
     */
    function getFilteredActiveChannels() {
        if (!window.app) return [];

        // Use app's getFilteredChannels if available
        if (window.app.getFilteredActiveChannels) {
            return window.app.getFilteredActiveChannels();
        }

        // V4.28: SIEMPRE guardar channelsMaster (TODOS los canales), no channelsFiltered
        var channels = window.app.state.channelsMaster || [];

        // Map to essential data only (reduce storage size)
        return channels.map(function (ch) {
            return {
                id: ch.id,
                serverId: ch.serverId,
                name: ch.name || (ch.base && ch.base.name),
                base: ch.base || {},
                heuristics: ch.heuristics || {},
                tech: ch.tech || {},
                external: ch.external || {},
                meta: ch.meta || {}
            };
        });
    }

    /**
     * Save channels to storage (try IndexedDB first, fallback to localStorage)
     */
    function saveChannelsToStorage(channels) {
        // Try IndexedDB via app.db
        if (window.app && window.app.db && window.app.db.saveAppState) {
            window.app.db.saveAppState(CHANNELS_STORAGE_KEY, {
                channels: channels,
                timestamp: Date.now()
            }).catch(function (e) {
                console.warn('⚠️ IndexedDB fallback a localStorage:', e);
                saveChannelsToLocalStorage(channels);
            });
        } else {
            saveChannelsToLocalStorage(channels);
        }
    }

    /**
     * Fallback: split channels into chunks for localStorage
     */
    function saveChannelsToLocalStorage(channels) {
        try {
            // Store count and timestamp in main key
            var chunkSize = 1000;
            var chunks = Math.ceil(channels.length / chunkSize);

            localStorage.setItem(CHANNELS_STORAGE_KEY + '_meta', JSON.stringify({
                count: channels.length,
                chunks: chunks,
                timestamp: Date.now()
            }));

            // Store each chunk
            for (var i = 0; i < chunks; i++) {
                var chunk = channels.slice(i * chunkSize, (i + 1) * chunkSize);
                localStorage.setItem(CHANNELS_STORAGE_KEY + '_' + i, JSON.stringify(chunk));
            }

            console.log('💾 Canales guardados en localStorage:', channels.length);
        } catch (e) {
            console.error('❌ Error guardando canales:', e);
        }
    }

    /**
     * Get selected columns from current state
     */
    function getSelectedColumns() {
        var columns = [];

        // Try from app.state
        if (window.app && window.app.state && window.app.state.activeColumns) {
            columns = window.app.state.activeColumns.slice();
        } else {
            // Fallback: read from checkboxes
            document.querySelectorAll('#columnList input[type="checkbox"]:checked').forEach(function (cb) {
                var field = cb.id.replace('col_', '');
                if (field) columns.push(field);
            });
        }

        return columns;
    }

    /**
     * Get source policies from FieldSourcePolicy or AdvancedDataRenderer
     */
    function getSourcePolicies() {
        var policies = {};

        // Try global FieldSourcePolicy
        if (window.FieldSourcePolicy && window.FieldSourcePolicy.getAllPolicies) {
            policies = window.FieldSourcePolicy.getAllPolicies();
        }
        // Fallback to AdvancedDataRenderer
        else if (window.app && window.app.advancedDataRenderer) {
            var renderer = window.app.advancedDataRenderer;
            if (renderer.fieldSourcePolicy) {
                policies = JSON.parse(JSON.stringify(renderer.fieldSourcePolicy));
            }
        }

        return policies;
    }

    /**
     * Get active filters configuration
     */
    function getActiveFilters() {
        var filters = {
            searchText: '',
            selectedGroups: [],
            qualityFilter: 'all',
            advancedFilters: null
        };

        // Search text
        var searchInput = document.getElementById('searchChannels') || document.getElementById('searchInput');
        if (searchInput) filters.searchText = searchInput.value || '';

        // Quality filter
        var qualitySelect = document.getElementById('filterQuality') || document.getElementById('qualityFilter');
        if (qualitySelect) filters.qualityFilter = qualitySelect.value || 'all';

        // Selected groups from app state
        if (window.app && window.app.state) {
            if (window.app.state.selectedGroups) {
                filters.selectedGroups = window.app.state.selectedGroups.slice();
            }
            if (window.app.state.advancedFilters) {
                filters.advancedFilters = JSON.parse(JSON.stringify(window.app.state.advancedFilters));
            }
        }

        return filters;
    }

    /**
     * Get pagination state
     */
    function getPaginationState() {
        if (window.app && window.app.state) {
            return {
                currentPage: window.app.state.currentPage || 1,
                itemsPerPage: window.app.state.itemsPerPage || 100
            };
        }
        return { currentPage: 1, itemsPerPage: 100 };
    }

    // ═══════════════════════════════════════════════════════════════════
    // RESTORE STATE
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Restore analysis tab state from storage
     */
    function restoreAnalysisState() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) {
                console.log('ℹ️ No hay estado guardado de Análisis');
                return false;
            }

            var state = JSON.parse(saved);
            console.log('📥 Restaurando estado de Análisis:', state);

            // 1. Restore columns
            if (state.selectedColumns && state.selectedColumns.length > 0) {
                restoreColumns(state.selectedColumns);
            }

            // 2. Restore source policies
            if (state.sourcePolicies) {
                restoreSourcePolicies(state.sourcePolicies);
            }

            // 3. Restore filters
            if (state.filters) {
                restoreFilters(state.filters);
            }

            // 4. Restore pagination
            if (state.pagination) {
                restorePagination(state.pagination);
            }

            // 5. Restore channels if no current data
            if (state.channelsCount && state.channelsCount > 0) {
                restoreChannels();
            }

            console.log('✅ Estado de Análisis restaurado');
            return true;
        } catch (e) {
            console.error('❌ Error restaurando estado:', e);
            return false;
        }
    }

    /**
     * Restore channels from storage
     */
    function restoreChannels() {
        // Only restore if app has no current channels
        if (window.app && window.app.state) {
            var currentCount = (window.app.state.channelsMaster || []).length;
            if (currentCount > 0) {
                console.log('ℹ️ Ya hay canales cargados, no se restauran');
                return;
            }
        }

        // Try IndexedDB first
        if (window.app && window.app.db && window.app.db.getAppState) {
            window.app.db.getAppState(CHANNELS_STORAGE_KEY).then(function (data) {
                if (data && data.channels && data.channels.length > 0) {
                    applyRestoredChannels(data.channels);
                } else {
                    restoreChannelsFromLocalStorage();
                }
            }).catch(function () {
                restoreChannelsFromLocalStorage();
            });
        } else {
            restoreChannelsFromLocalStorage();
        }
    }

    /**
     * Restore channels from localStorage chunks
     */
    function restoreChannelsFromLocalStorage() {
        try {
            var meta = JSON.parse(localStorage.getItem(CHANNELS_STORAGE_KEY + '_meta') || 'null');
            if (!meta || !meta.chunks) return;

            var channels = [];
            for (var i = 0; i < meta.chunks; i++) {
                var chunk = JSON.parse(localStorage.getItem(CHANNELS_STORAGE_KEY + '_' + i) || '[]');
                channels = channels.concat(chunk);
            }

            if (channels.length > 0) {
                applyRestoredChannels(channels);
            }
        } catch (e) {
            console.error('❌ Error restaurando canales:', e);
        }
    }

    /**
     * Apply restored channels to app
     */
    function applyRestoredChannels(channels) {
        if (window.app && window.app.state) {
            // ✅ V4.28: Filtrar huérfanos de servidores eliminados
            var activeIds = new Set((window.app.state.activeServers || []).map(function(s) { return s.id; }));
            var filtered = channels;
            if (activeIds.size > 0) {
                filtered = channels.filter(function(ch) {
                    var sId = ch.serverId || ch._serverId;
                    if (!sId) return true; // Keep legacy without serverId
                    return activeIds.has(sId);
                });
                if (filtered.length < channels.length) {
                    console.warn('🧹 [AnalysisState] Filtrados ' + (channels.length - filtered.length) + ' canales huérfanos de servidores eliminados');
                }
            }

            window.app.state.channelsMaster = filtered;
            window.app.state.channelsFiltered = filtered.slice();

            // Trigger re-render
            if (window.app.applyFilters) {
                setTimeout(function () { window.app.applyFilters(); }, 200);
            }

            console.log('📥 Restaurados', filtered.length, 'canales (de', channels.length, 'guardados)');
        }
    }

    /**
     * Restore selected columns
     */
    function restoreColumns(columns) {
        if (!columns || !Array.isArray(columns)) return;

        if (window.app && window.app.state) {
            // 1. Update app state
            window.app.state.activeColumns = columns.slice();

            // 2. Sync with AdvancedDataRenderer if available
            if (window.app.advancedDataRenderer) {
                window.app.advancedDataRenderer.selectedFields = columns.slice();
            }

            // 3. Update checkboxes in UI (may not exist yet on initial load)
            setTimeout(function () {
                columns.forEach(function (col) {
                    var cb = document.getElementById('col_' + col);
                    if (cb) cb.checked = true;
                });

                // 4. Re-render column list UI to sync buttons
                if (window.app.renderColumnListUI) {
                    window.app.renderColumnListUI();
                }
            }, 100);

            // 5. Refresh table with new columns
            if (window.app.renderTable) {
                setTimeout(function () {
                    window.app.renderTable();
                    console.log('✅ Tabla renderizada con', columns.length, 'columnas restauradas');
                }, 200);
            }
        }
    }

    /**
     * Restore source policies
     */
    function restoreSourcePolicies(policies) {
        if (!policies || typeof policies !== 'object') return;

        // Update global FieldSourcePolicy
        if (window.FieldSourcePolicy && window.FieldSourcePolicy.setPolicy) {
            for (var field in policies) {
                if (policies.hasOwnProperty(field)) {
                    var update = {};
                    update[field] = policies[field];
                    window.FieldSourcePolicy.setPolicy(update);
                }
            }
        }

        // Update AdvancedDataRenderer
        if (window.app && window.app.advancedDataRenderer) {
            window.app.advancedDataRenderer.fieldSourcePolicy = JSON.parse(JSON.stringify(policies));
            window.app.advancedDataRenderer.saveFieldSourcePolicy();
        }

        // Refresh button states
        if (window.FieldSourceHandler && window.FieldSourceHandler.refreshAllStates) {
            window.FieldSourceHandler.refreshAllStates();
        }
    }

    /**
     * Restore filters
     */
    function restoreFilters(filters) {
        if (!filters) return;

        // Search text
        var searchInput = document.getElementById('searchChannels') || document.getElementById('searchInput');
        if (searchInput && filters.searchText) {
            searchInput.value = filters.searchText;
        }

        // Quality filter
        var qualitySelect = document.getElementById('filterQuality') || document.getElementById('qualityFilter');
        if (qualitySelect && filters.qualityFilter) {
            qualitySelect.value = filters.qualityFilter;
        }

        // App state filters
        if (window.app && window.app.state) {
            if (filters.selectedGroups) {
                window.app.state.selectedGroups = filters.selectedGroups.slice();
            }
            if (filters.advancedFilters) {
                window.app.state.advancedFilters = JSON.parse(JSON.stringify(filters.advancedFilters));
            }

            // Apply filters
            if (window.app.applyFilters) {
                setTimeout(function () { window.app.applyFilters(); }, 100);
            }
        }
    }

    /**
     * Restore pagination
     */
    function restorePagination(pagination) {
        if (!pagination) return;

        if (window.app && window.app.state) {
            window.app.state.currentPage = pagination.currentPage || 1;
            window.app.state.itemsPerPage = pagination.itemsPerPage || 100;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Clear saved state
     */
    function clearAnalysisState() {
        localStorage.removeItem(STORAGE_KEY);
        console.log('🗑️ Estado de Análisis eliminado');
    }

    /**
     * Show save notification
     */
    function showSaveNotification(message, isError) {
        var notif = document.createElement('div');
        notif.textContent = message;
        notif.style.cssText = 'position:fixed;top:20px;right:20px;padding:10px 20px;border-radius:8px;z-index:999999;font-weight:bold;' +
            'background:' + (isError ? '#ef4444' : '#10b981') + ';color:white;box-shadow:0 4px 12px rgba(0,0,0,0.3);';

        document.body.appendChild(notif);
        setTimeout(function () {
            notif.style.transition = 'opacity 0.3s';
            notif.style.opacity = '0';
            setTimeout(function () { notif.remove(); }, 300);
        }, 2000);
    }

    /**
     * Check if there's saved state
     */
    function hasSavedState() {
        return localStorage.getItem(STORAGE_KEY) !== null;
    }

    /**
     * Get saved state info
     */
    function getSavedStateInfo() {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;

        try {
            var state = JSON.parse(saved);
            return {
                timestamp: state.timestamp,
                date: new Date(state.timestamp).toLocaleString(),
                columnsCount: state.selectedColumns ? state.selectedColumns.length : 0,
                hasFilters: !!(state.filters && state.filters.searchText)
            };
        } catch (e) {
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // AUTO-RESTORE ON LOAD
    // ═══════════════════════════════════════════════════════════════════

    // Auto-restore when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(restoreAnalysisState, 1000); // Wait for app to initialize
        });
    } else {
        setTimeout(restoreAnalysisState, 1000);
    }

    // ═══════════════════════════════════════════════════════════════════
    // EXPOSE TO GLOBAL SCOPE
    // ═══════════════════════════════════════════════════════════════════

    window.AnalysisStateManager = {
        save: saveAnalysisState,
        restore: restoreAnalysisState,
        clear: clearAnalysisState,
        hasSaved: hasSavedState,
        getInfo: getSavedStateInfo
    };

    // Convenience aliases
    window.saveAnalysisState = saveAnalysisState;
    window.restoreAnalysisState = restoreAnalysisState;

    console.log('✅ AnalysisStateManager v4.8 cargado');

})();
