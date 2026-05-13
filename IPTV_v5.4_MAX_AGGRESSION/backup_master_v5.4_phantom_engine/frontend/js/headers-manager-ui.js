/**
 * ═══════════════════════════════════════════════════════════════════
 * 🎛️ HEADERS MANAGER UI v1.0 - Controlador de la UI
 * ═══════════════════════════════════════════════════════════════════
 */

class HeadersManagerUI {
    constructor() {
        this.headersMatrix = null;
        this.activeLevel = 3;
        this.selectedHeaders = new Set();
        this.customHeaders = [];
        this.currentFilter = { search: '', category: 'all' };
        this.editingHeader = null;
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🚀 INICIALIZAR
     * ═══════════════════════════════════════════════════════════════
     */
    init() {
        this.headersMatrix = window.ULTRA_HEADERS_MATRIX;

        if (!this.headersMatrix) {
            console.error('[HeadersManager] ULTRA_HEADERS_MATRIX no disponible');
            return;
        }

        // Cargar configuración guardada
        this.loadConfig();

        console.log('[HeadersManager] ✅ Inicializado');
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 📦 ABRIR MODAL
     * ═══════════════════════════════════════════════════════════════
     */
    openModal() {
        const modal = document.getElementById('headersManagerModal');
        if (!modal) {
            console.error('[HeadersManager] Modal no encontrado');
            return;
        }

        modal.style.display = 'flex';
        this.renderHeadersList();
        this.updateCounts();
    }

    closeModal() {
        const modal = document.getElementById('headersManagerModal');
        if (modal) modal.style.display = 'none';
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 RENDERIZAR LISTA DE HEADERS
     * ═══════════════════════════════════════════════════════════════
     */
    renderHeadersList() {
        const container = document.getElementById('headersList');
        if (!container || !this.headersMatrix) return;

        const headers = this.getFilteredHeaders();

        container.innerHTML = headers.map(({ name, config }) => this.renderHeaderCard(name, config)).join('');
    }

    getFilteredHeaders() {
        if (!this.headersMatrix) return [];

        return Object.entries(this.headersMatrix.headers)
            .filter(([name, config]) => {
                // Filtro por búsqueda
                if (this.currentFilter.search) {
                    const search = this.currentFilter.search.toLowerCase();
                    if (!name.toLowerCase().includes(search) &&
                        !config.description.toLowerCase().includes(search)) {
                        return false;
                    }
                }

                // Filtro por categoría
                if (this.currentFilter.category !== 'all') {
                    if (config.category !== this.currentFilter.category) {
                        return false;
                    }
                }

                return true;
            })
            .map(([name, config]) => ({ name, config }));
    }

    renderHeaderCard(name, config) {
        const isSelected = this.selectedHeaders.has(name);
        const levelConfig = config.levels[this.activeLevel];
        let currentValue = '';

        if (levelConfig) {
            if (typeof levelConfig.generator === 'function') {
                currentValue = '[Generador dinámico]';
            } else {
                currentValue = levelConfig.value || '';
            }
        }

        const categoryIcons = {
            'Identity': '🆔',
            'Auth': '🔐',
            'CORS': '🌐',
            'Caching': '💾',
            'Connection': '🔗',
            'Compression': '📦',
            'Security': '🛡️',
            'Proxy': '🌍',
            'Streaming': '📺',
            'Custom': '⚙️'
        };

        return `
            <div class="header-card ${isSelected ? 'selected' : ''}" onclick="headersManagerUI.toggleHeader('${name}')">
                <div class="header-card-header">
                    <div class="header-card-title">
                        <input type="checkbox" class="header-card-checkbox" 
                            ${isSelected ? 'checked' : ''} 
                            aria-label="Seleccionar header ${name}"
                            onclick="event.stopPropagation(); headersManagerUI.toggleHeader('${name}')"
                        >
                        <span class="header-name">${name}</span>
                    </div>
                    <span class="header-category-badge">
                        ${categoryIcons[config.category] || '⚙️'} ${config.category}
                    </span>
                </div>
                
                <div class="header-description">${config.description}</div>
                
                <div class="header-current-value" title="${currentValue}">
                    Nivel ${this.activeLevel}: ${currentValue.substring(0, 60)}${currentValue.length > 60 ? '...' : ''}
                </div>
                
                <div class="header-card-footer">
                    <span class="header-priority">Prioridad: ${config.priority}/10</span>
                    <div class="header-actions">
                        <button class="header-action-btn" onclick="event.stopPropagation(); headersManagerUI.editHeader('${name}')" title="Editar valores">
                            ✏️ Editar
                        </button>
                        <button class="header-action-btn" onclick="event.stopPropagation(); headersManagerUI.testHeader('${name}')" title="Probar header">
                            🧪 Test
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * ☑️ SELECCIÓN DE HEADERS
     * ═══════════════════════════════════════════════════════════════
     */
    toggleHeader(name) {
        if (this.selectedHeaders.has(name)) {
            this.selectedHeaders.delete(name);
        } else {
            this.selectedHeaders.add(name);
        }

        this.renderHeadersList();
        this.updateCounts();
    }

    selectAllHeaders() {
        if (!this.headersMatrix) return;

        Object.keys(this.headersMatrix.headers).forEach(name => {
            this.selectedHeaders.add(name);
        });

        this.renderHeadersList();
        this.updateCounts();
    }

    deselectAllHeaders() {
        this.selectedHeaders.clear();
        this.renderHeadersList();
        this.updateCounts();
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🔍 FILTROS
     * ═══════════════════════════════════════════════════════════════
     */
    filterHeaders(searchValue) {
        this.currentFilter.search = searchValue;
        this.renderHeadersList();
    }

    filterByCategory(category) {
        this.currentFilter.category = category;
        this.renderHeadersList();
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎚️ CAMBIO DE NIVEL
     * ═══════════════════════════════════════════════════════════════
     */
    switchActiveLevel(level) {
        this.activeLevel = parseInt(level);
        this.renderHeadersList();
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 📊 ACTUALIZAR CONTADORES
     * ═══════════════════════════════════════════════════════════════
     */
    updateCounts() {
        const selectedCount = document.getElementById('selectedHeadersCount');
        const totalCount = document.getElementById('totalHeadersCount');

        if (selectedCount) selectedCount.textContent = this.selectedHeaders.size;
        if (totalCount && this.headersMatrix) {
            totalCount.textContent = Object.keys(this.headersMatrix.headers).length;
        }
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * ✏️ EDITAR HEADER
     * ═══════════════════════════════════════════════════════════════
     */
    editHeader(name) {
        const modal = document.getElementById('editHeaderModal');
        if (!modal || !this.headersMatrix) return;

        const config = this.headersMatrix.headers[name];
        if (!config) return;

        this.editingHeader = name;

        // Llenar datos
        document.getElementById('editHeaderTitle').textContent = `✏️ Editar: ${name}`;
        document.getElementById('editHeaderName').textContent = name;
        document.getElementById('editHeaderDescription').textContent = config.description;
        document.getElementById('editHeaderCategory').textContent = config.category;
        document.getElementById('editHeaderPriority').textContent = `${config.priority}/10`;
        document.getElementById('editHeaderValidated').textContent = config.validated ? 'Sí ✅' : 'No ⚠️';

        // Generar tabla de niveles
        const tbody = document.getElementById('editHeaderLevelsBody');
        if (tbody) {
            tbody.innerHTML = [1, 2, 3, 4, 5].map(level => {
                const levelConfig = config.levels[level] || {};
                const levelNames = { 1: 'Normal', 2: 'Plus', 3: 'Pro', 4: 'Extreme', 5: 'ULTRA' };
                const levelColors = { 1: '#22c55e', 2: '#3b82f6', 3: '#8b5cf6', 4: '#f97316', 5: '#ef4444' };

                let value = '';
                let isGenerator = false;

                if (typeof levelConfig.generator === 'function') {
                    value = '[Generador dinámico]';
                    isGenerator = true;
                } else {
                    value = levelConfig.value || '';
                }

                return `
                    <tr>
                        <td>
                            <span class="level-badge" style="background: ${levelColors[level]}; color: white; padding: 4px 10px; border-radius: 6px; font-weight: 600;">
                                ${level}
                            </span>
                        </td>
                        <td style="font-weight: 500;">${levelNames[level]}</td>
                        <td>
                            <input type="text" class="edit-value-input" id="editLevel${level}Value" 
                                value="${value.replace(/"/g, '&quot;')}"
                                aria-label="Valor del header para nivel ${level}"
                                ${isGenerator ? 'disabled placeholder="Generador no editable"' : ''}
                            >
                        </td>
                        <td style="font-size: 0.75rem; color: #94a3b8;">${levelConfig.description || ''}</td>
                        <td>
                            <button class="header-action-btn" onclick="headersManagerUI.testHeaderLevel('${name}', ${level})">🧪</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        modal.style.display = 'flex';
    }

    closeEditHeaderModal() {
        const modal = document.getElementById('editHeaderModal');
        if (modal) modal.style.display = 'none';
        this.editingHeader = null;
    }

    saveHeaderEdits() {
        if (!this.editingHeader || !this.headersMatrix) return;

        const config = this.headersMatrix.headers[this.editingHeader];
        if (!config) return;

        // Guardar valores editados
        [1, 2, 3, 4, 5].forEach(level => {
            const input = document.getElementById(`editLevel${level}Value`);
            if (input && !input.disabled) {
                if (!config.levels[level]) config.levels[level] = {};
                config.levels[level].value = input.value;
            }
        });

        console.log(`[HeadersManager] ✅ Header ${this.editingHeader} actualizado`);
        this.showNotification(`✅ ${this.editingHeader} actualizado`);

        this.closeEditHeaderModal();
        this.renderHeadersList();
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🧪 PROBAR HEADER
     * ═══════════════════════════════════════════════════════════════
     */
    testHeader(name) {
        if (!this.headersMatrix) return;

        const testChannel = { stream_id: 'test_001', name: 'Canal de Prueba' };
        const testServer = { baseUrl: 'http://test-server.com:8080', username: 'test', password: 'test123' };

        console.group(`🧪 Test: ${name}`);

        [1, 2, 3, 4, 5].forEach(level => {
            const value = this.headersMatrix.getHeaderValue(name, level, testChannel, testServer);
            console.log(`Nivel ${level}: ${value || '(vacío)'}`);
        });

        console.groupEnd();

        this.showNotification(`🧪 Test de ${name} completado - ver consola (F12)`);
    }

    testHeaderLevel(name, level) {
        if (!this.headersMatrix) return;

        const testChannel = { stream_id: 'test_001', name: 'Canal de Prueba' };
        const testServer = { baseUrl: 'http://test-server.com:8080', username: 'test', password: 'test123' };

        const value = this.headersMatrix.getHeaderValue(name, level, testChannel, testServer);

        alert(`🧪 Test: ${name}\nNivel: ${level}\n\nResultado:\n${value || '(vacío)'}`);
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 💾 GUARDAR / CARGAR CONFIGURACIÓN
     * ═══════════════════════════════════════════════════════════════
     */
    saveConfig() {
        const config = {
            activeLevel: this.activeLevel,
            selectedHeaders: Array.from(this.selectedHeaders),
            customHeaders: this.customHeaders,
            version: '1.0',
            savedAt: new Date().toISOString()
        };

        localStorage.setItem('ultra_headers_config', JSON.stringify(config));

        // También actualizar el generador M3U8
        if (window.m3u8UltraGenerator) {
            window.m3u8UltraGenerator.selectedLevel = this.activeLevel;
            window.m3u8UltraGenerator.selectedHeaders = this.selectedHeaders;
        }

        console.log('[HeadersManager] ✅ Configuración guardada');
        // Cierra primero para que el aviso no quede debajo del overlay del modal.
        this.closeModal();
        setTimeout(() => {
            this.showNotification('✅ Configuración guardada');
        }, 30);
    }

    loadConfig() {
        try {
            const saved = localStorage.getItem('ultra_headers_config');
            if (saved) {
                const config = JSON.parse(saved);

                if (config.activeLevel) this.activeLevel = config.activeLevel;
                if (config.selectedHeaders) this.selectedHeaders = new Set(config.selectedHeaders);
                if (config.customHeaders) this.customHeaders = config.customHeaders;

                console.log('[HeadersManager] ✅ Configuración cargada');
            }
        } catch (e) {
            console.error('[HeadersManager] Error cargando configuración:', e);
        }
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 📥 EXPORTAR / IMPORTAR
     * ═══════════════════════════════════════════════════════════════
     */
    exportConfig() {
        const config = {
            activeLevel: this.activeLevel,
            selectedHeaders: Array.from(this.selectedHeaders),
            customHeaders: this.customHeaders,
            version: '1.0',
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `ultra-headers-config-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);

        this.showNotification('📥 Configuración exportada');
    }

    importConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const config = JSON.parse(e.target.result);

                    if (config.activeLevel) this.activeLevel = config.activeLevel;
                    if (config.selectedHeaders) this.selectedHeaders = new Set(config.selectedHeaders);
                    if (config.customHeaders) this.customHeaders = config.customHeaders;

                    this.renderHeadersList();
                    this.updateCounts();

                    this.showNotification('📤 Configuración importada');
                } catch (err) {
                    alert('❌ Error al importar: ' + err.message);
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    resetToDefaults() {
        if (!confirm('¿Restaurar configuración por defecto?\n\nEsto eliminará tus headers personalizados.')) {
            return;
        }

        this.activeLevel = 3;
        this.selectedHeaders = new Set();
        this.customHeaders = [];

        // Seleccionar headers recomendados para nivel 3
        if (this.headersMatrix) {
            const recommended = this.headersMatrix.getRecommendedHeaders(3);
            recommended.forEach(h => this.selectedHeaders.add(h));
        }

        this.renderHeadersList();
        this.updateCounts();

        this.showNotification('🔄 Restaurado a configuración por defecto');
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * ➕ AGREGAR HEADER PERSONALIZADO
     * ═══════════════════════════════════════════════════════════════
     */
    openAddHeaderModal() {
        const modal = document.getElementById('addHeaderModal');
        if (modal) modal.style.display = 'flex';
    }

    closeAddHeaderModal() {
        const modal = document.getElementById('addHeaderModal');
        if (modal) modal.style.display = 'none';
    }

    addNewHeader(event) {
        event.preventDefault();

        const name = document.getElementById('newHeaderName').value.trim();
        const description = document.getElementById('newHeaderDescription').value.trim();
        const category = document.getElementById('newHeaderCategory').value;
        const priority = parseInt(document.getElementById('newHeaderPriority').value) || 5;

        if (!name) {
            alert('El nombre del header es obligatorio');
            return;
        }

        if (this.headersMatrix && this.headersMatrix.headers[name]) {
            alert('Ya existe un header con ese nombre');
            return;
        }

        // Obtener valores por nivel
        const levels = {};
        [1, 2, 3, 4, 5].forEach(level => {
            const input = document.getElementById(`newHeaderLevel${level}`);
            if (input && input.value.trim()) {
                levels[level] = { value: input.value.trim(), description: `Nivel ${level}` };
            } else {
                levels[level] = { value: '', description: `Nivel ${level}` };
            }
        });

        // Agregar al matrix
        if (this.headersMatrix) {
            this.headersMatrix.headers[name] = {
                description: description || `Header personalizado: ${name}`,
                category: category,
                priority: priority,
                validated: false,
                sources: ['Custom'],
                levels: levels
            };
        }

        // Agregar a lista de custom
        this.customHeaders.push(name);

        // Seleccionar automáticamente
        this.selectedHeaders.add(name);

        this.closeAddHeaderModal();
        this.renderHeadersList();
        this.updateCounts();

        this.showNotification(`➕ Header ${name} agregado`);
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🔔 NOTIFICACIONES
     * ═══════════════════════════════════════════════════════════════
     */
    showNotification(message) {
        // Usar el sistema de notificaciones de la app si existe
        if (window.app && window.app.showNotification) {
            window.app.showNotification(message, false);
        } else if (window.app && window.app.showToast) {
            window.app.showToast(message);
        } else {
            console.log(`[Notification] ${message}`);
        }
    }
}

// Instancia global
window.headersManagerUI = new HeadersManagerUI();

// Funciones globales para los botones del modal
window.openHeadersManager = () => window.headersManagerUI.openModal();
window.closeHeadersManager = () => window.headersManagerUI.closeModal();
window.filterHeaders = (v) => window.headersManagerUI.filterHeaders(v);
window.filterByCategory = (v) => window.headersManagerUI.filterByCategory(v);
window.switchActiveLevel = (v) => window.headersManagerUI.switchActiveLevel(v);
window.selectAllHeaders = () => window.headersManagerUI.selectAllHeaders();
window.deselectAllHeaders = () => window.headersManagerUI.deselectAllHeaders();
window.openAddHeaderModal = () => window.headersManagerUI.openAddHeaderModal();
window.closeAddHeaderModal = () => window.headersManagerUI.closeAddHeaderModal();
window.addNewHeader = (e) => window.headersManagerUI.addNewHeader(e);
window.closeEditHeaderModal = () => window.headersManagerUI.closeEditHeaderModal();
window.saveHeaderEdits = () => window.headersManagerUI.saveHeaderEdits();
window.saveHeadersConfig = () => window.headersManagerUI.saveConfig();
window.exportHeadersConfig = () => window.headersManagerUI.exportConfig();
window.importHeadersConfig = () => window.headersManagerUI.importConfig();
window.resetToDefaults = () => window.headersManagerUI.resetToDefaults();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => window.headersManagerUI.init(), 1000);
});

console.log('✅ [HeadersManagerUI] v1.0 loaded');
