/**
 * ═══════════════════════════════════════════════════════════════
 * 🎨 PROFILE MANAGER - CUSTOM HEADERS EXTENSION
 * ═══════════════════════════════════════════════════════════════
 * 
 * Extensión del Profile Manager v9.0 para gestión de headers HTTP
 * personalizados por perfil.
 * 
 * Características:
 * - Agregar/Editar/Eliminar headers custom
 * - Validación de nombres y valores
 * - Integración con generación M3U8
 * - UI moderna y responsiva
 * 
 * @version 1.0.0
 * @date 2026-01-21
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // EXTENSIÓN DE PROFILE MANAGER
    // ═══════════════════════════════════════════════════════════

    if (!window.ProfileManagerV9) {
        console.error('❌ ProfileManagerV9 no encontrado. Cargue primero el módulo base.');
        return;
    }

    const PM = window.ProfileManagerV9;

    // ═══════════════════════════════════════════════════════════
    // MÉTODOS DE GESTIÓN DE HEADERS PERSONALIZADOS
    // ═══════════════════════════════════════════════════════════

    /**
     * Agregar header personalizado
     */
    PM.addCustomHeader = function (headerName, headerValue) {
        if (!this.currentProfile) {
            console.error('❌ No hay perfil activo');
            return false;
        }

        // Validar nombre y valor
        if (!headerName || !headerName.trim()) {
            this.showNotification('⚠️ El nombre del header no puede estar vacío', 'error');
            return false;
        }

        if (!headerValue) {
            headerValue = '';
        }

        // Normalizar nombre (capitalizar)
        headerName = headerName.trim()
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('-');

        // Inicializar array de custom headers si no existe
        if (!this.currentProfile.customHeaders) {
            this.currentProfile.customHeaders = [];
        }

        // Verificar si ya existe
        const existing = this.currentProfile.customHeaders.find(h => h.name === headerName);
        if (existing) {
            this.showNotification(`⚠️ El header "${headerName}" ya existe. Edítalo en lugar de agregarlo.`, 'warning');
            return false;
        }

        // Agregar header
        this.currentProfile.customHeaders.push({
            name: headerName,
            value: headerValue.trim(),
            enabled: true,
            id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });

        // Guardar y actualizar UI
        this.saveCurrentProfile();
        this.renderCustomHeaders();
        this.showNotification(`✅ Header "${headerName}" agregado correctamente`, 'success');

        console.log(`✅ Custom header agregado: ${headerName}: ${headerValue}`);
        return true;
    };

    /**
     * Actualizar header personalizado existente
     */
    PM.updateCustomHeader = function (headerId, headerName, headerValue) {
        if (!this.currentProfile || !this.currentProfile.customHeaders) {
            return false;
        }

        const header = this.currentProfile.customHeaders.find(h => h.id === headerId);
        if (!header) {
            console.error(`❌ Header con ID ${headerId} no encontrado`);
            return false;
        }

        header.name = headerName.trim();
        header.value = headerValue.trim();

        this.saveCurrentProfile();
        this.showNotification(`✅ Header actualizado`, 'success');
        return true;
    };

    /**
     * Eliminar header personalizado
     */
    PM.deleteCustomHeader = function (headerId) {
        if (!this.currentProfile || !this.currentProfile.customHeaders) {
            return false;
        }

        const index = this.currentProfile.customHeaders.findIndex(h => h.id === headerId);
        if (index === -1) {
            console.error(`❌ Header con ID ${headerId} no encontrado`);
            return false;
        }

        const headerName = this.currentProfile.customHeaders[index].name;
        this.currentProfile.customHeaders.splice(index, 1);

        this.saveCurrentProfile();
        this.renderCustomHeaders();
        this.showNotification(`🗑️ Header "${headerName}" eliminado`, 'success');

        console.log(`🗑️ Custom header eliminado: ${headerName}`);
        return true;
    };

    /**
     * Toggle activación de header personalizado
     */
    PM.toggleCustomHeader = function (headerId, enabled) {
        if (!this.currentProfile || !this.currentProfile.customHeaders) {
            return false;
        }

        const header = this.currentProfile.customHeaders.find(h => h.id === headerId);
        if (!header) {
            return false;
        }

        header.enabled = enabled;
        this.saveCurrentProfile();
        return true;
    };

    /**
     * Obtener headers personalizados activos
     */
    PM.getActiveCustomHeaders = function () {
        if (!this.currentProfile || !this.currentProfile.customHeaders) {
            return [];
        }

        return this.currentProfile.customHeaders.filter(h => h.enabled);
    };

    /**
     * Renderizar sección de headers personalizados
     */
    PM.renderCustomHeaders = function () {
        const container = document.getElementById('pm9_custom_headers_list');
        if (!container) {
            console.warn('⚠️ Contenedor de custom headers no encontrado');
            return;
        }

        const customHeaders = this.currentProfile?.customHeaders || [];

        if (customHeaders.length === 0) {
            container.innerHTML = `
                <div class="pm9-empty-state">
                    <span class="pm9-empty-icon">📝</span>
                    <p>No hay headers personalizados.</p>
                    <p class="pm9-empty-hint">Agrega headers HTTP adicionales para este perfil</p>
                </div>
            `;
            return;
        }

        container.innerHTML = customHeaders.map(header => `
            <div class="pm9-custom-header-row" data-header-id="${header.id}">
                <input 
                    type="checkbox" 
                    ${header.enabled ? 'checked' : ''} 
                    onchange="window.ProfileManagerV9.toggleCustomHeader('${header.id}', this.checked)"
                    title="${header.enabled ? 'Desactivar' : 'Activar'} header"
                >
                <input 
                    type="text" 
                    class="pm9-custom-header-name" 
                    value="${this.escapeHtml(header.name)}" 
                    placeholder="Nombre del header"
                    onchange="window.ProfileManagerV9.updateCustomHeader('${header.id}', this.value, this.nextElementSibling.value)"
                >
                <input 
                    type="text" 
                    class="pm9-custom-header-value" 
                    value="${this.escapeHtml(header.value)}" 
                    placeholder="Valor del header"
                    onchange="window.ProfileManagerV9.updateCustomHeader('${header.id}', this.previousElementSibling.value, this.value)"
                >
                <button 
                    class="pm9-custom-header-delete" 
                    onclick="window.ProfileManagerV9.deleteCustomHeader('${header.id}')"
                    title="Eliminar header"
                >
                    🗑️
                </button>
            </div>
        `).join('');

        // Actualizar contador
        const counter = document.getElementById('pm9_custom_headers_count');
        if (counter) {
            const activeCount = customHeaders.filter(h => h.enabled).length;
            counter.textContent = `${activeCount}/${customHeaders.length}`;
        }
    };

    /**
     * Mostrar formulario de agregar header
     */
    PM.showAddHeaderForm = function () {
        const nameInput = document.getElementById('pm9_new_header_name');
        const valueInput = document.getElementById('pm9_new_header_value');

        if (!nameInput || !valueInput) {
            console.error('❌ Inputs de nuevo header no encontrados');
            return;
        }

        const name = nameInput.value;
        const value = valueInput.value;

        if (this.addCustomHeader(name, value)) {
            // Limpiar inputs
            nameInput.value = '';
            valueInput.value = '';
            nameInput.focus();
        }
    };

    /**
     * Escape HTML para prevenir XSS
     */
    PM.escapeHtml = function (text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    /**
     * Mostrar notificación
     */
    PM.showNotification = function (message, type = 'info') {
        // Crear o actualizar área de notificaciones
        let notifArea = document.getElementById('pm9_notifications');
        if (!notifArea) {
            notifArea = document.createElement('div');
            notifArea.id = 'pm9_notifications';
            notifArea.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 100000;
                max-width: 400px;
            `;
            document.body.appendChild(notifArea);
        }

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        const notif = document.createElement('div');
        notif.className = 'pm9-notification';
        notif.style.cssText = `
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideInRight 0.3s ease;
            font-size: 14px;
            font-weight: 500;
        `;
        notif.textContent = message;

        notifArea.appendChild(notif);

        // Auto-remove después de 3 segundos
        setTimeout(() => {
            notif.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notif.remove(), 300);
        }, 3000);
    };

    // ═══════════════════════════════════════════════════════════
    // INTEGRACIÓN CON GENERACIÓN M3U8
    // ═══════════════════════════════════════════════════════════

    /**
     * Obtener headers completos para generación M3U8
     * Combina headers base del perfil + headers personalizados
     */
    PM.getCompleteHeadersForM3U8 = function () {
        const profile = this.currentProfile;
        if (!profile) {
            return [];
        }

        const allHeaders = [];

        // 1. Headers base del perfil (de las categorías)
        if (profile.headers && typeof profile.headers === 'object') {
            for (const category in profile.headers) {
                const categoryHeaders = profile.headers[category];
                if (Array.isArray(categoryHeaders)) {
                    allHeaders.push(...categoryHeaders.filter(h => h.enabled !== false));
                }
            }
        }

        // 2. Headers personalizados (solo activos)
        const customHeaders = this.getActiveCustomHeaders();
        allHeaders.push(...customHeaders.map(h => ({
            name: h.name,
            value: h.value,
            isCustom: true
        })));

        return allHeaders;
    };

    // ═══════════════════════════════════════════════════════════
    // INICIALIZACIÓN
    // ═══════════════════════════════════════════════════════════

    // Agregar animaciones CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }

        .pm9-custom-header-row {
            display: grid;
            grid-template-columns: 32px 1fr 2fr 40px;
            gap: 8px;
            align-items: center;
            padding: 8px;
            background: rgba(255,255,255,0.03);
            border-radius: 6px;
            margin-bottom: 8px;
            transition: all 0.2s ease;
        }

        .pm9-custom-header-row:hover {
            background: rgba(255,255,255,0.06);
        }

        .pm9-custom-header-name,
        .pm9-custom-header-value {
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            color: #e2e8f0;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            transition: all 0.2s ease;
        }

        .pm9-custom-header-name:focus,
        .pm9-custom-header-value:focus {
            outline: none;
            border-color: #10b981;
            background: rgba(0,0,0,0.4);
        }

        .pm9-custom-header-delete {
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #ef4444;
            border-radius: 6px;
            padding: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 16px;
        }

        .pm9-custom-header-delete:hover {
            background: rgba(239, 68, 68, 0.3);
            transform: scale(1.1);
        }

        .pm9-empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #94a3b8;
        }

        .pm9-empty-icon {
            font-size: 48px;
            display: block;
            margin-bottom: 12px;
            opacity: 0.5;
        }

        .pm9-empty-state p {
            margin: 8px 0;
            font-size: 14px;
        }

        .pm9-empty-hint {
            font-size: 12px;
            opacity: 0.7;
        }
    `;
    document.head.appendChild(style);

    console.log('%c✅ Profile Manager - Custom Headers Extension Loaded', 'color: #10b981; font-weight: bold; font-size: 14px;');
    console.log('%c📝 Usa ProfileManagerV9.addCustomHeader(name, value) para agregar headers', 'color: #3b82f6; font-size: 12px;');

})();
