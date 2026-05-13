/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎨 GROUP-TITLE CONFIGURATION UI v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Panel de configuración visual con selección de campos y preview en vivo
 * Usa estilos consistentes con el tema del toolkit (--v41-*, --accent, etc.)
 * 
 * IPTV Navigator PRO - Interfaz de configuración
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════

    class GroupTitleConfigUI {

        /**
         * Renderiza el panel de configuración en el contenedor especificado
         * @param {string} containerId - ID del contenedor donde renderizar
         */
        static render(containerId) {
            const container = document.getElementById(containerId);
            if (!container) {
                console.warn('[GroupTitleConfigUI] Container not found:', containerId);
                return;
            }

            // Verificar dependencias
            if (!window.GroupTitleConfigManager || !window.GroupTitleBuilder) {
                console.error('[GroupTitleConfigUI] Dependencies not loaded');
                return;
            }

            const config = window.GroupTitleConfigManager.load();
            const fields = window.GroupTitleConfigManager.getAvailableFields();
            const separators = window.GroupTitleConfigManager.getSeparatorPresets();

            container.innerHTML = `
                <div class="group-title-config-panel" style="
                    margin-top: var(--space-20, 20px);
                    padding: var(--space-20, 20px);
                    background: linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(37,99,235,0.05) 100%);
                    border: 1px solid rgba(59,130,246,0.2);
                    border-radius: var(--radius-lg, 12px);
                    box-shadow: var(--shadow-md);
                ">
                    
                    <!-- Header -->
                    <div style="
                        margin-bottom: var(--space-16, 16px);
                        border-bottom: 1px solid var(--border-soft, rgba(148,163,184,0.25));
                        padding-bottom: var(--space-12, 12px);
                    ">
                        <h3 style="
                            margin: 0;
                            display: flex;
                            align-items: center;
                            gap: var(--space-10, 10px);
                            color: var(--text-main, #e5e7eb);
                            font-size: var(--font-size-lg, 16px);
                            font-weight: var(--font-weight-semibold, 600);
                        ">
                            <span style="font-size: 1.4rem;">🧩</span>
                            <span>Generador de <code style="
                                background: var(--accent-soft, rgba(56,189,248,0.2));
                                padding: 2px 8px;
                                border-radius: var(--radius-sm, 6px);
                                font-family: var(--font-family-mono);
                                font-size: var(--font-size-sm, 12px);
                            ">group-title</code></span>
                        </h3>
                        <p style="
                            margin: var(--space-8, 8px) 0 0 38px;
                            font-size: var(--font-size-sm, 12px);
                            color: var(--text-muted, #9ca3af);
                            line-height: var(--line-height-normal, 1.5);
                        ">
                            Define la jerarquía de clasificación para exportación M3U8
                        </p>
                    </div>

                    <!-- Config Grid -->
                    <div style="
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: var(--space-20, 20px);
                        margin-bottom: var(--space-16, 16px);
                    ">
                        
                        <!-- Left: Field Selection -->
                        <div>
                            <label style="
                                display: block;
                                color: var(--accent, #38bdf8);
                                font-size: var(--font-size-sm, 13px);
                                font-weight: var(--font-weight-semibold, 600);
                                margin-bottom: var(--space-10, 10px);
                            ">
                                📋 Campos Disponibles (máx 5)
                            </label>
                            <div id="gt-field-list" style="
                                background: var(--card, rgba(20,24,40,0.92));
                                border: 1px solid var(--border-soft, rgba(148,163,184,0.25));
                                border-radius: var(--radius-base, 8px);
                                padding: var(--space-12, 12px);
                                display: flex;
                                flex-direction: column;
                                gap: var(--space-8, 8px);
                                max-height: 220px;
                                overflow-y: auto;
                            ">
                                ${fields.map((field, idx) => `
                                    <label class="gt-field-item" data-field-id="${field.id}" draggable="true" style="
                                        display: flex;
                                        align-items: center;
                                        gap: var(--space-8, 8px);
                                        padding: var(--space-10, 10px);
                                        background: ${config.selectedFields.includes(field.id)
                    ? 'rgba(56,189,248,0.15)'
                    : 'rgba(56,189,248,0.05)'};
                                        border: 1px solid ${config.selectedFields.includes(field.id)
                    ? 'rgba(56,189,248,0.4)'
                    : 'rgba(56,189,248,0.15)'};
                                        border-radius: var(--radius-sm, 6px);
                                        cursor: grab;
                                        transition: all var(--duration-fast, 150ms) var(--ease-standard);
                                        color: var(--text-main, #e2e8f0);
                                        font-size: var(--font-size-sm, 13px);
                                    ">
                                        <span style="cursor: grab; opacity: 0.5; margin-right: 4px;">⋮⋮</span>
                                        <input 
                                            type="checkbox" 
                                            value="${field.id}" 
                                            ${config.selectedFields.includes(field.id) ? 'checked' : ''}
                                            style="
                                                width: 16px;
                                                height: 16px;
                                                cursor: pointer;
                                                accent-color: var(--accent, #38bdf8);
                                            "
                                        >
                                        <span style="flex: 1;">${field.label}</span>
                                        <span style="
                                            font-size: 10px;
                                            color: var(--text-muted, #9ca3af);
                                            max-width: 120px;
                                            overflow: hidden;
                                            text-overflow: ellipsis;
                                            white-space: nowrap;
                                        " title="${field.description}">${field.description}</span>
                                    </label>
                                `).join('')}
                            </div>
                            <p style="
                                margin: var(--space-8, 8px) 0 0 0;
                                font-size: 11px;
                                color: var(--text-muted, #9ca3af);
                            ">
                                ⋮⋮ Arrastra para reordenar jerarquía
                            </p>
                        </div>

                        <!-- Right: Separator & Options -->
                        <div>
                            <label style="
                                display: block;
                                color: var(--accent, #38bdf8);
                                font-size: var(--font-size-sm, 13px);
                                font-weight: var(--font-weight-semibold, 600);
                                margin-bottom: var(--space-10, 10px);
                            ">
                                🔗 Separador
                            </label>
                            
                            <!-- Separator Presets -->
                            <div id="gt-separator-presets" style="
                                display: flex;
                                flex-wrap: wrap;
                                gap: var(--space-6, 6px);
                                margin-bottom: var(--space-12, 12px);
                            ">
                                ${separators.map(sep => `
                                    <button 
                                        type="button"
                                        data-separator="${sep.value}"
                                        class="gt-sep-btn"
                                        style="
                                            padding: var(--space-6, 6px) var(--space-10, 10px);
                                            background: ${config.separator === sep.value
                            ? 'var(--accent, #38bdf8)'
                            : 'var(--card, rgba(20,24,40,0.92))'};
                                            color: ${config.separator === sep.value
                            ? 'var(--bg, #050816)'
                            : 'var(--text-main, #e5e7eb)'};
                                            border: 1px solid ${config.separator === sep.value
                            ? 'var(--accent, #38bdf8)'
                            : 'var(--border-soft, rgba(148,163,184,0.25))'};
                                            border-radius: var(--radius-sm, 6px);
                                            font-size: var(--font-size-xs, 11px);
                                            font-family: var(--font-family-mono);
                                            cursor: pointer;
                                            transition: all var(--duration-fast, 150ms);
                                        "
                                        title="${sep.example}"
                                    >${sep.label}</button>
                                `).join('')}
                            </div>

                            <!-- OTT Navigator Disclaimer -->
                            <div id="gt-ott-disclaimer" style="
                                margin-bottom: var(--space-8, 8px);
                                padding: var(--space-8, 8px) var(--space-10, 10px);
                                background: rgba(245,158,11,0.08);
                                border: 1px solid rgba(245,158,11,0.25);
                                border-radius: var(--radius-sm, 6px);
                                font-size: 10px;
                                color: rgba(251,191,36,0.9);
                                line-height: 1.4;
                                display: ${config.separator === '/' ? 'none' : 'block'};
                            ">
                                ⚠️ <strong>OTT Navigator</strong> usa <code style="background:rgba(245,158,11,0.15);padding:1px 3px;border-radius:2px">/</code> como navegación de carpetas.
                                Otros separadores se mostrarán como texto literal en ese player.
                            </div>

                            <!-- Custom Separator Input -->
                            <div style="margin-bottom: var(--space-16, 16px);">
                                <label style="
                                    display: block;
                                    font-size: 11px;
                                    color: var(--text-muted, #9ca3af);
                                    margin-bottom: var(--space-4, 4px);
                                ">Separador personalizado:</label>
                                <input 
                                    id="gt-separator" 
                                    type="text"
                                    value="${config.separator}"
                                    maxlength="5"
                                    placeholder=" / "
                                    style="
                                        width: 100%;
                                        background: var(--card, rgba(20,24,40,0.92));
                                        color: var(--text-main, #e5e7eb);
                                        border: 1px solid var(--border-soft, rgba(148,163,184,0.25));
                                        border-radius: var(--radius-base, 8px);
                                        padding: var(--space-10, 10px) var(--space-12, 12px);
                                        font-size: var(--font-size-base, 14px);
                                        font-family: var(--font-family-mono);
                                        box-sizing: border-box;
                                    "
                                >
                            </div>

                            <!-- Enable/Disable Toggle -->
                            <div style="
                                display: flex;
                                align-items: center;
                                gap: var(--space-10, 10px);
                                padding: var(--space-10, 10px);
                                background: var(--card, rgba(20,24,40,0.92));
                                border: 1px solid var(--border-soft, rgba(148,163,184,0.25));
                                border-radius: var(--radius-base, 8px);
                            ">
                                <input 
                                    type="checkbox" 
                                    id="gt-enabled"
                                    ${config.enabled !== false ? 'checked' : ''}
                                    style="
                                        width: 18px;
                                        height: 18px;
                                        accent-color: var(--ok, #4ade80);
                                    "
                                >
                                <label for="gt-enabled" style="
                                    font-size: var(--font-size-sm, 13px);
                                    color: var(--text-main, #e5e7eb);
                                    cursor: pointer;
                                ">
                                    Usar group-title jerárquico en exportaciones
                                </label>
                            </div>
                        </div>

                    </div>

                    <!-- Preview -->
                    <div style="margin-bottom: var(--space-16, 16px);">
                        <label style="
                            display: block;
                            color: var(--accent, #38bdf8);
                            font-size: var(--font-size-sm, 13px);
                            font-weight: var(--font-weight-semibold, 600);
                            margin-bottom: var(--space-10, 10px);
                        ">
                            👁 Vista Previa
                        </label>
                        <div id="gt-preview" style="
                            padding: var(--space-16, 16px);
                            background: var(--card, rgba(20,24,40,0.92));
                            border: 2px dashed var(--accent-soft, rgba(56,189,248,0.4));
                            border-radius: var(--radius-base, 8px);
                            color: var(--ok, #4ade80);
                            font-family: var(--font-family-mono);
                            font-size: var(--font-size-lg, 16px);
                            font-weight: var(--font-weight-bold, 600);
                            text-align: center;
                            letter-spacing: 0.5px;
                        ">
                            LATINO / DEPORTES / FULL HD
                        </div>
                        <p id="gt-preview-info" style="
                            margin: var(--space-8, 8px) 0 0 0;
                            font-size: 11px;
                            color: var(--text-muted, #9ca3af);
                            text-align: center;
                        ">
                            3 niveles · Separador: <code style="background: rgba(56,189,248,0.1); padding: 1px 4px; border-radius: 3px;">/</code>
                        </p>
                    </div>

                    <!-- Actions -->
                    <div style="
                        display: flex;
                        gap: var(--space-12, 12px);
                        justify-content: flex-end;
                        padding-top: var(--space-12, 12px);
                        border-top: 1px solid var(--border-soft, rgba(148,163,184,0.25));
                    ">
                        <button id="gt-reset" style="
                            padding: var(--space-10, 10px) var(--space-20, 20px);
                            background: rgba(239,68,68,0.1);
                            border: 1px solid rgba(239,68,68,0.3);
                            border-radius: var(--radius-base, 8px);
                            color: var(--danger, #f97373);
                            font-size: var(--font-size-sm, 13px);
                            font-weight: var(--font-weight-semibold, 600);
                            cursor: pointer;
                            transition: all var(--duration-fast, 150ms);
                        ">
                            🔄 Restaurar
                        </button>
                        <button id="gt-save" style="
                            padding: var(--space-10, 10px) var(--space-24, 24px);
                            background: linear-gradient(135deg, var(--accent, #38bdf8) 0%, var(--accent-strong, #0ea5e9) 100%);
                            border: none;
                            border-radius: var(--radius-base, 8px);
                            color: var(--bg, #050816);
                            font-size: var(--font-size-sm, 13px);
                            font-weight: var(--font-weight-bold, 600);
                            cursor: pointer;
                            transition: all var(--duration-fast, 150ms);
                            box-shadow: 0 2px 4px rgba(56,189,248,0.3);
                        ">
                            💾 Guardar Configuración
                        </button>
                    </div>

                </div>
            `;

            this.attachEventListeners();
            this.updatePreview();
        }

        /**
         * Adjunta event listeners a los elementos del panel
         */
        static attachEventListeners() {
            // Update preview on checkbox change
            document.querySelectorAll('#gt-field-list input[type="checkbox"]').forEach(el => {
                el.addEventListener('change', (e) => {
                    this.updateFieldStyle(e.target);
                    this.updatePreview();
                });
            });

            // Update preview on separator change
            document.getElementById('gt-separator')?.addEventListener('input', () => {
                this.updatePreview();
                this.updateSeparatorButtonStyles();
            });

            // Separator preset buttons
            document.querySelectorAll('.gt-sep-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const separator = e.target.dataset.separator;
                    const input = document.getElementById('gt-separator');
                    if (input) {
                        input.value = separator;
                        this.updatePreview();
                        this.updateSeparatorButtonStyles();
                    }
                });
            });

            // Enable/disable toggle
            document.getElementById('gt-enabled')?.addEventListener('change', () => {
                this.updatePreview();
            });

            // Save button
            document.getElementById('gt-save')?.addEventListener('click', () => {
                const config = this.collectConfig();

                if (window.GroupTitleConfigManager.save(config)) {
                    this.showNotification('✅ Configuración guardada correctamente', 'success');
                } else {
                    this.showNotification('❌ Error al guardar configuración', 'error');
                }
            });

            // Reset button
            document.getElementById('gt-reset')?.addEventListener('click', () => {
                if (confirm('¿Restaurar configuración por defecto?')) {
                    window.GroupTitleConfigManager.reset();
                    this.render('group-title-config-container');
                    this.showNotification('🔄 Configuración restaurada', 'info');
                }
            });

            // Hover effects for field items
            document.querySelectorAll('.gt-field-item').forEach(item => {
                item.addEventListener('mouseenter', function () {
                    this.style.transform = 'translateX(2px)';
                });
                item.addEventListener('mouseleave', function () {
                    this.style.transform = 'translateX(0)';
                });
            });

            // 🎯 DRAG AND DROP FUNCTIONALITY
            this.initDragAndDrop();
        }

        /**
         * Inicializa drag-and-drop para reordenar campos
         */
        static initDragAndDrop() {
            const fieldList = document.getElementById('gt-field-list');
            if (!fieldList) return;

            let draggedItem = null;

            fieldList.querySelectorAll('.gt-field-item').forEach(item => {
                item.addEventListener('dragstart', (e) => {
                    draggedItem = item;
                    item.style.opacity = '0.5';
                    item.style.cursor = 'grabbing';
                    e.dataTransfer.effectAllowed = 'move';
                });

                item.addEventListener('dragend', () => {
                    draggedItem.style.opacity = '1';
                    draggedItem.style.cursor = 'grab';
                    draggedItem = null;
                    fieldList.querySelectorAll('.gt-field-item').forEach(el => {
                        el.style.borderTop = '';
                        el.style.borderBottom = '';
                    });
                    this.updatePreview();
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (!draggedItem || item === draggedItem) return;

                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;

                    fieldList.querySelectorAll('.gt-field-item').forEach(el => {
                        el.style.borderTop = '';
                        el.style.borderBottom = '';
                    });

                    if (e.clientY < midY) {
                        item.style.borderTop = '2px solid var(--accent, #38bdf8)';
                    } else {
                        item.style.borderBottom = '2px solid var(--accent, #38bdf8)';
                    }
                });

                item.addEventListener('drop', (e) => {
                    e.preventDefault();
                    if (!draggedItem || item === draggedItem) return;

                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;

                    if (e.clientY < midY) {
                        fieldList.insertBefore(draggedItem, item);
                    } else {
                        fieldList.insertBefore(draggedItem, item.nextSibling);
                    }

                    item.style.borderTop = '';
                    item.style.borderBottom = '';
                });
            });
        }

        /**
         * Actualiza estilo visual de un campo según su estado
         */
        static updateFieldStyle(checkbox) {
            const label = checkbox.closest('.gt-field-item');
            if (!label) return;

            if (checkbox.checked) {
                label.style.background = 'rgba(56,189,248,0.15)';
                label.style.borderColor = 'rgba(56,189,248,0.4)';
            } else {
                label.style.background = 'rgba(56,189,248,0.05)';
                label.style.borderColor = 'rgba(56,189,248,0.15)';
            }
        }

        /**
         * Actualiza estilos de botones de separador
         */
        static updateSeparatorButtonStyles() {
            const currentSep = document.getElementById('gt-separator')?.value || '';

            document.querySelectorAll('.gt-sep-btn').forEach(btn => {
                const isActive = btn.dataset.separator === currentSep;
                btn.style.background = isActive ? 'var(--accent, #38bdf8)' : 'var(--card, rgba(20,24,40,0.92))';
                btn.style.color = isActive ? 'var(--bg, #050816)' : 'var(--text-main, #e5e7eb)';
                btn.style.borderColor = isActive ? 'var(--accent, #38bdf8)' : 'var(--border-soft, rgba(148,163,184,0.25))';
            });

            // Show/hide OTT Navigator disclaimer when separator is not '/'
            const disclaimer = document.getElementById('gt-ott-disclaimer');
            if (disclaimer) {
                disclaimer.style.display = (currentSep === '/') ? 'none' : 'block';
            }
        }

        /**
         * Recoge configuración actual del formulario
         * @returns {Object} - Configuración recolectada
         */
        static collectConfig() {
            // Recoger campos en el orden visual actual (respetando drag-and-drop)
            const selectedFields = [...document.querySelectorAll('#gt-field-list .gt-field-item')]
                .filter(item => item.querySelector('input:checked'))
                .map(item => item.dataset.fieldId);

            const separator = document.getElementById('gt-separator')?.value || ' / ';
            const enabled = document.getElementById('gt-enabled')?.checked !== false;

            return {
                selectedFields,
                separator,
                enabled,
                canonicalSeparator: ' · '
            };
        }

        /**
         * Actualiza la vista previa con la configuración actual
         */
        static updatePreview() {
            const config = this.collectConfig();

            // Mock channel para preview
            const mockChannel = {
                region: 'LATINO',
                category: 'DEPORTES',
                quality: 'FULL HD',
                language: 'ESPAÑOL',
                country: 'MEXICO',
                fps: '60FPS'
            };

            let preview = 'GENERAL';

            if (config.enabled && config.selectedFields.length > 0) {
                const parts = config.selectedFields.map(field => {
                    const fieldMap = {
                        region: 'LATINO',
                        category: 'DEPORTES',
                        quality: 'FULL HD',
                        language: 'ESPAÑOL',
                        country: 'MEXICO',
                        fps: '60FPS'
                    };
                    return fieldMap[field] || field.toUpperCase();
                });
                preview = parts.join(config.separator);
            }

            const previewEl = document.getElementById('gt-preview');
            const previewInfoEl = document.getElementById('gt-preview-info');

            if (previewEl) {
                previewEl.textContent = preview;
                previewEl.style.color = config.enabled ? 'var(--ok, #4ade80)' : 'var(--text-muted, #9ca3af)';
            }

            if (previewInfoEl) {
                const sepDisplay = config.separator.trim() || '(espacio)';
                previewInfoEl.innerHTML = `
                    ${config.selectedFields.length} nivel${config.selectedFields.length !== 1 ? 'es' : ''} · 
                    Separador: <code style="background: rgba(56,189,248,0.1); padding: 1px 4px; border-radius: 3px;">${sepDisplay}</code>
                    ${!config.enabled ? ' · <span style="color: var(--danger);">DESACTIVADO</span>' : ''}
                `;
            }
        }

        /**
         * Muestra notificación temporal
         */
        static showNotification(message, type = 'info') {
            const colors = {
                success: 'var(--ok, #4ade80)',
                error: 'var(--danger, #f97373)',
                info: 'var(--accent, #38bdf8)'
            };

            // Remover notificaciones anteriores
            document.querySelectorAll('.gt-notification').forEach(n => n.remove());

            const notification = document.createElement('div');
            notification.className = 'gt-notification';
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 14px 20px;
                background: ${colors[type]};
                color: var(--bg, #050816);
                border-radius: var(--radius-base, 8px);
                font-weight: 600;
                font-size: 13px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                animation: gtSlideIn 0.3s ease;
            `;

            // Añadir animación CSS
            if (!document.getElementById('gt-notification-styles')) {
                const style = document.createElement('style');
                style.id = 'gt-notification-styles';
                style.textContent = `
                    @keyframes gtSlideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes gtSlideOut {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'gtSlideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }

        /**
         * Inicializa el panel en el contenedor por defecto
         */
        static init() {
            // Buscar contenedor existente o crear uno
            const targetContainers = [
                'group-title-config-container',
                'telemetry-dashboard-section',
                'advanced-config-section'
            ];

            for (const containerId of targetContainers) {
                const container = document.getElementById(containerId);
                if (container) {
                    this.render(containerId);
                    return;
                }
            }

            console.warn('[GroupTitleConfigUI] No container found for rendering');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPORTAR GLOBALMENTE
    // ═══════════════════════════════════════════════════════════════════════

    window.GroupTitleConfigUI = GroupTitleConfigUI;

    // Auto-init cuando DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => GroupTitleConfigUI.init(), 500);
        });
    } else {
        setTimeout(() => GroupTitleConfigUI.init(), 500);
    }

    console.log('%c🎨 GroupTitleConfigUI v1.0 - Cargado', 'color: #8b5cf6; font-weight: bold;');

})();
