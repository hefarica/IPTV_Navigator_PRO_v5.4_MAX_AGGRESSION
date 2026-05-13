/**
 * FilterController.js
 * V4.1 Section 3: Filtrado y Lógica
 * 
 * Manages the inclusion/exclusion state of groups and transformation rules.
 * Uses Set<string> for O(1) exclusion lookups.
 */

(function () {
    'use strict';

    window.FilterController = {
        // ------------------------------------------------------------------------
        // Internal State
        // ------------------------------------------------------------------------
        state: {
            allGroups: [],              // Array of { name: string, count: number, id: string }
            excludedGroups: new Set(),  // Set<string> for O(1) lookups
            regexExclude: null,         // RegExp | null
            prefix: "",                 // String prefix for transformation
            totalChannels: 0,           // Total channels from ingestion
            isExpanded: false
        },

        // ------------------------------------------------------------------------
        // DOM Element Cache
        // ------------------------------------------------------------------------
        ui: {
            rootPanel: null,
            listRoot: null,
            statusLabel: null,
            searchInput: null,
            regexInput: null,
            regexError: null,
            prefixInput: null,
            groupCountDisplay: null,
            channelImpactDisplay: null,
            btnSelectAll: null,
            btnSelectNone: null
        },

        // ------------------------------------------------------------------------
        // Initialization
        // ------------------------------------------------------------------------
        init() {
            // Cache DOM elements
            this.ui.rootPanel = document.getElementById('panel-filtering');
            this.ui.listRoot = document.getElementById('group-list-root');
            this.ui.statusLabel = document.getElementById('status-filtering');
            this.ui.searchInput = document.getElementById('group-search-input');
            this.ui.regexInput = document.getElementById('filter-regex-exclude');
            this.ui.regexError = document.getElementById('regex-error-msg');
            this.ui.prefixInput = document.getElementById('transform-prefix');
            this.ui.groupCountDisplay = document.getElementById('group-count-display');
            this.ui.channelImpactDisplay = document.getElementById('channel-impact-display');
            this.ui.btnSelectAll = document.getElementById('btn-select-all-groups');
            this.ui.btnSelectNone = document.getElementById('btn-select-none-groups');

            // Check if elements exist
            if (!this.ui.listRoot) {
                console.warn('[FilterController] Section 3 elements not found - skipping init');
                return;
            }

            // 1. Search Filtering
            if (this.ui.searchInput) {
                this.ui.searchInput.addEventListener('input', (e) => {
                    this.renderFilteredList(e.target.value);
                });
            }

            // 2. Regex Input with Validation (Debounced)
            if (this.ui.regexInput) {
                let regexDebounce;
                this.ui.regexInput.addEventListener('input', (e) => {
                    clearTimeout(regexDebounce);
                    regexDebounce = setTimeout(() => this.handleRegexChange(e.target.value), 300);
                });
            }

            // 3. Prefix Input
            if (this.ui.prefixInput) {
                this.ui.prefixInput.addEventListener('input', (e) => {
                    this.state.prefix = e.target.value;
                });
            }

            // 4. Bulk Actions
            if (this.ui.btnSelectAll) {
                this.ui.btnSelectAll.addEventListener('click', () => this.setAllGroups(true));
            }
            if (this.ui.btnSelectNone) {
                this.ui.btnSelectNone.addEventListener('click', () => this.setAllGroups(false));
            }

            // 5. Listen for data ingestion from Section 1/2
            window.addEventListener('APE_INGEST_COMPLETE', (e) => {
                this.loadDataFromIngest(e.detail);
            });

            // Load mock data for demo if no real data
            this.loadMockDataIfEmpty();

            console.log('[FilterController] V4.1 initialized');
        },

        // ------------------------------------------------------------------------
        // Data Loading
        // ------------------------------------------------------------------------
        loadDataFromIngest(data) {
            if (!data || !data.groups) return;

            this.state.totalChannels = data.totalChannels || 0;

            // Convert Map to Array of Objects
            this.state.allGroups = Array.from(data.groups.entries()).map(([name, count]) => ({
                name: name,
                count: count,
                id: 'grp-' + btoa(unescape(encodeURIComponent(name))).replace(/=/g, '')
            }));

            // Sort Alphabetically
            this.state.allGroups.sort((a, b) => a.name.localeCompare(b.name));

            // Reset Exclusions
            this.state.excludedGroups.clear();

            // Render
            this.renderFilteredList('');
            this.updatePreviewStats();

            if (this.ui.rootPanel) {
                this.ui.rootPanel.removeAttribute('aria-busy');
            }
        },

        loadMockDataIfEmpty() {
            // If no real data loaded after 2 seconds, load mock data for demo
            setTimeout(() => {
                if (this.state.allGroups.length === 0) {
                    const mockGroups = new Map([
                        ['🇺🇸 USA | Entertainment', 1250],
                        ['🇺🇸 USA | Sports', 890],
                        ['🇺🇸 USA | News', 340],
                        ['🇬🇧 UK | Entertainment', 780],
                        ['🇬🇧 UK | Sports', 450],
                        ['🇪🇸 Spain | General', 620],
                        ['🇫🇷 France | Movies', 890],
                        ['🇩🇪 Germany | Documentaries', 320],
                        ['🌍 International | 4K', 180],
                        ['🎬 VOD | Movies', 2500],
                        ['📺 VOD | Series', 1800],
                        ['⚽ Live | Sports', 560],
                        ['🎵 Music | Channels', 220],
                        ['👶 Kids | Cartoons', 340],
                        ['📰 News | 24/7', 180]
                    ]);

                    this.loadDataFromIngest({
                        groups: mockGroups,
                        totalChannels: 11320
                    });

                    console.log('[FilterController] Loaded mock data for demonstration');
                }
            }, 2000);
        },

        // ------------------------------------------------------------------------
        // Rendering
        // ------------------------------------------------------------------------
        renderFilteredList(filterText) {
            if (!this.ui.listRoot) return;

            const query = filterText.toLowerCase();
            const fragment = document.createDocumentFragment();

            this.ui.listRoot.innerHTML = '';

            this.state.allGroups.forEach(group => {
                // Client-side visual filtering
                if (query && !group.name.toLowerCase().includes(query)) {
                    return;
                }

                const isExcluded = this.state.excludedGroups.has(group.name);

                // Create List Item
                const li = document.createElement('div');
                li.className = 'group-item-row';
                li.setAttribute('role', 'option');
                li.setAttribute('aria-selected', !isExcluded);

                li.innerHTML = `
          <label class="custom-checkbox-wrapper">
            <input type="checkbox" 
                   class="checkbox-glass" 
                   ${!isExcluded ? 'checked' : ''} 
                   data-group-name="${this.escapeHtml(group.name)}">
            <span class="group-name">${this.escapeHtml(group.name)}</span>
          </label>
          <span class="channel-badge">${group.count.toLocaleString()}</span>
        `;

                const checkbox = li.querySelector('input');
                checkbox.addEventListener('change', (e) => {
                    this.toggleGroup(group.name, !e.target.checked);
                });

                fragment.appendChild(li);
            });

            if (fragment.children.length === 0) {
                this.ui.listRoot.innerHTML = '<div class="empty-search">No se encontraron grupos</div>';
            } else {
                this.ui.listRoot.appendChild(fragment);
            }
        },

        // ------------------------------------------------------------------------
        // State Mutation
        // ------------------------------------------------------------------------
        toggleGroup(groupName, shouldExclude) {
            if (shouldExclude) {
                this.state.excludedGroups.add(groupName);
            } else {
                this.state.excludedGroups.delete(groupName);
            }
            this.updatePreviewStats();
        },

        setAllGroups(includeAll) {
            if (includeAll) {
                this.state.excludedGroups.clear();
            } else {
                this.state.allGroups.forEach(g => this.state.excludedGroups.add(g.name));
            }
            // Re-render to update checkboxes
            const searchValue = this.ui.searchInput ? this.ui.searchInput.value : '';
            this.renderFilteredList(searchValue);
            this.updatePreviewStats();
        },

        handleRegexChange(pattern) {
            const cleanPattern = pattern.trim();

            if (!cleanPattern) {
                this.state.regexExclude = null;
                if (this.ui.regexInput) this.ui.regexInput.classList.remove('input-error');
                if (this.ui.regexError) this.ui.regexError.textContent = '';
                this.updatePreviewStats();
                return;
            }

            try {
                // Compile Regex
                this.state.regexExclude = new RegExp(cleanPattern, 'i');
                if (this.ui.regexInput) this.ui.regexInput.classList.remove('input-error');
                if (this.ui.regexError) {
                    this.ui.regexError.textContent = '✓ Regex válido';
                    this.ui.regexError.className = 'input-hint';
                    this.ui.regexError.style.color = '#4ade80';
                }
            } catch (e) {
                this.state.regexExclude = null;
                if (this.ui.regexInput) this.ui.regexInput.classList.add('input-error');
                if (this.ui.regexError) {
                    this.ui.regexError.textContent = '✗ Sintaxis Regex Inválida';
                    this.ui.regexError.className = 'input-hint error-text';
                    this.ui.regexError.style.color = '#ef4444';
                }
            }
            this.updatePreviewStats();
        },

        // ------------------------------------------------------------------------
        // Preview & Feedback
        // ------------------------------------------------------------------------
        updatePreviewStats() {
            const totalGroups = this.state.allGroups.length;
            const excludedCount = this.state.excludedGroups.size;
            const includedCount = totalGroups - excludedCount;

            // Estimate active channels
            let activeChannels = 0;
            this.state.allGroups.forEach(g => {
                if (!this.state.excludedGroups.has(g.name)) {
                    activeChannels += g.count;
                }
            });

            // Update DOM
            if (this.ui.groupCountDisplay) {
                this.ui.groupCountDisplay.textContent = `${includedCount} / ${totalGroups} Grupos Activos`;
            }
            if (this.ui.channelImpactDisplay) {
                this.ui.channelImpactDisplay.textContent = `~${activeChannels.toLocaleString()} Canales Visibles`;
            }

            // Update accordion status badge
            if (this.ui.statusLabel) {
                if (excludedCount === 0 && !this.state.regexExclude) {
                    this.ui.statusLabel.textContent = "Todo Incluido";
                    this.ui.statusLabel.classList.remove('active-filter');
                } else {
                    this.ui.statusLabel.textContent = `Filtros Activos (${excludedCount} excl.)`;
                    this.ui.statusLabel.classList.add('active-filter');
                }
            }
        },

        // ------------------------------------------------------------------------
        // Public API (For Generation Controller)
        // ------------------------------------------------------------------------
        getExportConfig() {
            return {
                excludedGroups: this.state.excludedGroups,
                regexExclude: this.state.regexExclude,
                prefix: this.state.prefix
            };
        },

        getAllGroups() {
            return this.state.allGroups;
        },

        // ------------------------------------------------------------------------
        // Utility
        // ------------------------------------------------------------------------
        escapeHtml(text) {
            if (!text) return '';
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => FilterController.init());
    } else {
        setTimeout(() => FilterController.init(), 150);
    }

})();
