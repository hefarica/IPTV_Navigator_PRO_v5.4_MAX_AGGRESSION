/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔧 GROUP-TITLE CONFIGURATION MANAGER v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Persistencia, validación y sincronización de configuración
 * Compatible con IndexedDB fallback y localStorage
 * 
 * IPTV Navigator PRO - Sistema de configuración persistente
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTES
    // ═══════════════════════════════════════════════════════════════════════

    const STORAGE_KEY = 'ape_group_title_config';

    const AVAILABLE_FIELDS = [
        { id: 'region', label: '🌎 Región', icon: '🌎', default: true, description: 'Zona geográfica (LATINO, USA, EUROPE...)' },
        { id: 'category', label: '📂 Categoría', icon: '📂', default: true, description: 'Tipo de contenido (DEPORTES, CINE, NOTICIAS...)' },
        { id: 'quality', label: '📺 Calidad', icon: '📺', default: true, description: 'Resolución (ULTRA HD, FULL HD, HD, SD)' },
        { id: 'language', label: '🗣 Idioma', icon: '🗣', default: false, description: 'Idioma del audio (ES, EN, PT...)' },
        { id: 'country', label: '🏳 País', icon: '🏳', default: false, description: 'País de origen (MX, AR, US...)' },
        { id: 'fps', label: '🎞 FPS', icon: '🎞', default: false, description: 'Cuadros por segundo (60FPS, 30FPS)' }
    ];

    const SEPARATOR_PRESETS = [
        { value: ' / ', label: 'Barra espaciada', example: 'LATINO / DEPORTES / HD' },
        { value: ' | ', label: 'Pipe espaciado', example: 'LATINO | DEPORTES | HD' },
        { value: ' - ', label: 'Guión espaciado', example: 'LATINO - DEPORTES - HD' },
        { value: ' > ', label: 'Mayor que', example: 'LATINO > DEPORTES > HD' },
        { value: '/', label: 'Barra simple', example: 'LATINO/DEPORTES/HD' },
        { value: '|', label: 'Pipe simple', example: 'LATINO|DEPORTES|HD' }
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════

    class GroupTitleConfigManager {

        /**
         * Obtiene configuración por defecto
         * @returns {Object} - Configuración por defecto
         */
        static getDefaultConfig() {
            return {
                selectedFields: AVAILABLE_FIELDS
                    .filter(f => f.default)
                    .map(f => f.id),
                separator: ' / ',
                canonicalSeparator: ' · ',
                enabled: true,
                version: '1.0'
            };
        }

        /**
         * Carga configuración desde localStorage
         * @returns {Object} - Configuración cargada o por defecto
         */
        static load() {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (!stored) return this.getDefaultConfig();

                const config = JSON.parse(stored);

                // Validación básica
                if (!Array.isArray(config.selectedFields) || config.selectedFields.length === 0) {
                    console.warn('[GroupTitleConfig] Invalid config, using default');
                    return this.getDefaultConfig();
                }

                // Merge con defaults para campos nuevos
                return {
                    ...this.getDefaultConfig(),
                    ...config
                };
            } catch (err) {
                console.error('[GroupTitleConfig] Error loading:', err);
                return this.getDefaultConfig();
            }
        }

        /**
         * Guarda configuración en localStorage
         * @param {Object} config - Configuración a guardar
         * @returns {boolean} - true si se guardó correctamente
         */
        static save(config) {
            try {
                // Validaciones
                if (!config.selectedFields || config.selectedFields.length === 0) {
                    throw new Error('Debe seleccionar al menos 1 campo');
                }

                if (config.selectedFields.length > 5) {
                    throw new Error('Máximo 5 campos permitidos');
                }

                if (!config.separator || config.separator.length > 5) {
                    throw new Error('Separador inválido (máx 5 caracteres)');
                }

                // Validar que los campos existan
                const validFieldIds = AVAILABLE_FIELDS.map(f => f.id);
                const invalidFields = config.selectedFields.filter(f => !validFieldIds.includes(f));
                if (invalidFields.length > 0) {
                    throw new Error(`Campos inválidos: ${invalidFields.join(', ')}`);
                }

                // Guardar
                const toSave = {
                    ...config,
                    version: '1.0',
                    lastModified: new Date().toISOString()
                };

                localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));

                // v1.1 FIX: Removed dead CustomEvent 'groupTitleConfigChanged' (zero listeners in production).
                // The next M3U8 generation reads fresh from localStorage — no event bus needed.

                console.log('%c[GroupTitleConfig] ✅ Configuración guardada', 'color: #10b981;', toSave);
                return true;
            } catch (err) {
                console.error('[GroupTitleConfig] Error saving:', err);
                return false;
            }
        }

        /**
         * Resetea la configuración a valores por defecto
         * @returns {Object} - Configuración por defecto
         */
        static reset() {
            localStorage.removeItem(STORAGE_KEY);
            const defaultConfig = this.getDefaultConfig();
            this.save(defaultConfig);
            return defaultConfig;
        }

        /**
         * Obtiene lista de campos disponibles
         * @returns {Array} - Lista de campos
         */
        static getAvailableFields() {
            return [...AVAILABLE_FIELDS];
        }

        /**
         * Obtiene presets de separadores
         * @returns {Array} - Lista de separadores
         */
        static getSeparatorPresets() {
            return [...SEPARATOR_PRESETS];
        }

        /**
         * Valida configuración sin guardar
         * @param {Object} config - Configuración a validar
         * @returns {Object} - Resultado de validación
         */
        static validate(config) {
            const errors = [];
            const warnings = [];

            if (!config.selectedFields || config.selectedFields.length === 0) {
                errors.push('Debe seleccionar al menos 1 campo');
            }

            if (config.selectedFields && config.selectedFields.length > 5) {
                errors.push('Máximo 5 campos permitidos');
            }

            if (!config.separator) {
                errors.push('Debe especificar un separador');
            }

            if (config.separator && config.separator.length > 5) {
                warnings.push('Separador muy largo, puede afectar legibilidad');
            }

            if (config.selectedFields && config.selectedFields.length === 1) {
                warnings.push('Con solo 1 campo no hay jerarquía');
            }

            return {
                isValid: errors.length === 0,
                errors,
                warnings
            };
        }

        /**
         * Exporta configuración como JSON string
         * @returns {string} - JSON de configuración
         */
        static exportConfig() {
            const config = this.load();
            return JSON.stringify(config, null, 2);
        }

        /**
         * Importa configuración desde JSON string
         * @param {string} jsonString - JSON de configuración
         * @returns {boolean} - true si se importó correctamente
         */
        static importConfig(jsonString) {
            try {
                const config = JSON.parse(jsonString);
                const validation = this.validate(config);

                if (!validation.isValid) {
                    console.error('[GroupTitleConfig] Import validation failed:', validation.errors);
                    return false;
                }

                return this.save(config);
            } catch (err) {
                console.error('[GroupTitleConfig] Import error:', err);
                return false;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPORTAR GLOBALMENTE
    // ═══════════════════════════════════════════════════════════════════════

    window.GroupTitleConfigManager = GroupTitleConfigManager;

    console.log('%c🔧 GroupTitleConfigManager v1.0 - Cargado', 'color: #3b82f6; font-weight: bold;');

})();
