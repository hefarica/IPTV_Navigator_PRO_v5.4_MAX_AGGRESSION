/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🧩 GROUP-TITLE HIERARCHICAL BUILDER v2.0 — FOLDER NAVIGATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * OTT Navigator usa "/" como separador de carpetas anidadas.
 * group-title="France/Sports" → carpeta France → subcarpeta Sports
 * 
 * v2.0: Deduplicación, navegación por carpetas, sin repetir categoría
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN POR DEFECTO
    // ═══════════════════════════════════════════════════════════════════════

    const DEFAULT_CONFIG = {
        selectedFields: ['category'],  // v2: solo category por defecto (una carpeta)
        separator: '/',                // OTT Navigator folder separator (SIN espacios)
        canonicalSeparator: ' · ',     // Separador interno (NO CAMBIAR)
        // Separadores que pueden existir DENTRO de category_name del servidor
        categoryParseSeparators: ['|', ':', ' - ', '\u2013', '\u2014', '>', '\u00BB'],
        fallbackValues: {
            region: 'OTROS',
            category: 'GENERAL',
            quality: 'HD',
            language: 'MULTI',
            country: 'GLOBAL',
            fps: '30FPS'
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════

    class GroupTitleBuilder {

        /**
         * Normaliza valores: remueve emojis, limpia espacios, UPPERCASE
         * @param {string} value - Valor a normalizar
         * @returns {string|null} - Valor normalizado o null
         */
        static normalize(value) {
            if (!value || typeof value !== 'string') return null;

            return value
                .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // Remueve emojis
                .replace(/[^\w\s\u00C0-\u017F\-]/g, '')   // Solo alfanuméricos + acentos + guión
                .replace(/\s+/g, ' ')                      // Colapsa espacios
                .trim()
                .toUpperCase();
        }

        /**
         * Parsea un category_name del servidor en segmentos de carpeta
         * Ej: "FR: Sports HD" → ["FR", "SPORTS HD"]
         *     "France | Deportes" → ["FRANCE", "DEPORTES"]
         *     "Sports" → ["SPORTS"]
         * @param {string} categoryName - Nombre de categoría del servidor
         * @returns {string[]} - Segmentos parseados y normalizados
         */
        static parseCategorySegments(categoryName) {
            if (!categoryName || typeof categoryName !== 'string') return [];

            const cfg = this.getConfig();
            const separators = cfg.categoryParseSeparators || DEFAULT_CONFIG.categoryParseSeparators;

            // Intentar split con cada separador conocido
            for (const sep of separators) {
                if (categoryName.includes(sep)) {
                    const parts = categoryName
                        .split(sep)
                        .map(p => this.normalize(p))
                        .filter(p => p && p.length > 0);

                    if (parts.length >= 2) return parts;
                }
            }

            // Sin separador: es una categoría simple
            const norm = this.normalize(categoryName);
            return norm ? [norm] : [];
        }

        /**
         * Deduplica segmentos de carpeta (elimina repetidos manteniendo orden)
         * @param {string[]} segments - Array de segmentos
         * @returns {string[]} - Array sin duplicados
         */
        static deduplicateSegments(segments) {
            const seen = new Set();
            return segments.filter(seg => {
                const key = seg.toUpperCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        /**
         * Extrae valor de un campo del canal (prioridad: directo > clasificación > fallback)
         * @param {Object} channel - Objeto del canal
         * @param {string} field - Nombre del campo a extraer
         * @returns {string|null} - Valor extraído
         */
        static extract(channel, field) {
            if (!channel) return DEFAULT_CONFIG.fallbackValues[field] || null;

            // 1. Campo directo sin emoji
            if (channel[field]) {
                return this.normalize(channel[field]);
            }

            // 2. Campo con emoji (_region, _category)
            const emojiField = `_${field}`;
            if (channel[emojiField]) {
                return this.normalize(channel[emojiField]);
            }

            // 3. Clasificación APE
            if (channel._classification?.[field]) {
                const classVal = channel._classification[field];
                if (typeof classVal === 'object') {
                    const text = classVal.group || classVal.category || classVal.quality;
                    return this.normalize(text);
                }
                return this.normalize(classVal);
            }

            // 4. Campos alternativos
            const alternativeFields = {
                region: ['_region', 'region_name', 'tvg_region'],
                category: ['_category', 'category_name', 'group', 'tvg_group'],
                quality: ['_quality', 'quality_name', 'resolution'],
                language: ['_language', 'lang', 'audio_lang'],
                country: ['_country', 'country_code', 'cc'],
                fps: ['_fps', 'framerate', 'frame_rate']
            };

            if (alternativeFields[field]) {
                for (const altField of alternativeFields[field]) {
                    if (channel[altField]) {
                        const normalized = this.normalize(channel[altField]);
                        // Para 'category': si el valor es puramente numérico (ej: "1261"),
                        // es un category_id, NO un nombre. Saltar al categoryMap.
                        if (field === 'category' && normalized && /^\d+$/.test(normalized)) {
                            continue;
                        }
                        if (normalized) return normalized;
                    }
                }
            }

            // 5. Para category: usar categoryMap global si existe
            if (field === 'category' && window.app?.state?.categoryMap) {
                const catId = String(channel.category_id || channel.raw?.category_id || '');
                const mappedName = window.app.state.categoryMap[catId];
                if (mappedName) {
                    return this.normalize(mappedName);
                }
            }

            // 6. Fallback genérico
            return DEFAULT_CONFIG.fallbackValues[field] || null;
        }

        /**
         * Construye group-title CANÓNICO (interno)
         * Formato: "LATINO · DEPORTES · FULL HD"
         */
        static buildCanonical(channel, config = null) {
            const cfg = config || this.getConfig();
            const parts = [];

            for (const field of cfg.selectedFields) {
                const val = this.extract(channel, field);
                if (val) parts.push(val);
            }

            if (!parts.length) return 'GENERAL';

            return parts.join(cfg.canonicalSeparator || DEFAULT_CONFIG.canonicalSeparator);
        }

        /**
         * Construye group-title FINAL para exportación (v2.1 — carpetas OTT Navigator)
         * 
         * Usa extract() para cada campo seleccionado (region, category, quality...)
         * con toda la lógica de fallback + categoryMap. Une con "/" y deduplica.
         * 
         * Resultado: "LATINO/DEPORTES/FULL HD" (no IDs numéricos)
         */
        static buildExport(channel, config = null) {
            const cfg = config || this.getConfig();
            const sep = cfg.separator || DEFAULT_CONFIG.separator;
            const parts = [];

            // Usar extract() para CADA campo (respeta categoryMap, fallbacks, etc.)
            for (const field of cfg.selectedFields) {
                const val = this.extract(channel, field);
                if (val) parts.push(val);
            }

            // Deduplicar (nunca repetir la misma carpeta)
            const deduped = this.deduplicateSegments(parts);

            if (!deduped.length) return 'GENERAL';

            // Unir con "/" para navegación de carpetas en OTT Navigator
            return deduped.join(sep);
        }

        /**
         * Parser inverso: extrae campos desde group-title
         */
        static parse(groupTitle, config = null) {
            if (!groupTitle) return { isValid: false };

            const cfg = config || this.getConfig();
            const separators = [
                cfg.separator,
                cfg.canonicalSeparator,
                '/', ' / ', ' | ', ' - ', ' > ', '|', '-', '>'
            ];

            for (const sep of separators) {
                if (!sep) continue;

                const parts = groupTitle.split(sep).map(p => p.trim().toUpperCase());

                if (parts.length >= 1 && parts[0].length > 0) {
                    const result = { isValid: true, separator: sep, segments: parts };

                    cfg.selectedFields.forEach((field, idx) => {
                        result[field] = parts[idx] || DEFAULT_CONFIG.fallbackValues[field];
                    });

                    return result;
                }
            }

            return { isValid: false, raw: groupTitle };
        }

        /**
         * Obtiene configuración actual desde localStorage o default
         */
        static getConfig() {
            try {
                const stored = localStorage.getItem('ape_group_title_config');
                if (stored) {
                    const config = JSON.parse(stored);
                    if (config.selectedFields && config.selectedFields.length > 0) {
                        // v2.1: Respect user's persisted separator.
                        // Note: OTT Navigator interprets "/" as folder navigation.
                        // The config-ui shows a disclaimer about this.
                        return { ...DEFAULT_CONFIG, ...config };
                    }
                }
            } catch (e) {
                console.warn('[GroupTitleBuilder] Error loading config:', e);
            }
            return DEFAULT_CONFIG;
        }

        /**
         * Obtiene configuración por defecto
         */
        static getDefaultConfig() {
            return { ...DEFAULT_CONFIG };
        }

        /**
         * Valida si un group-title cumple con el formato esperado
         */
        static validate(groupTitle) {
            const parsed = this.parse(groupTitle);

            return {
                isValid: parsed.isValid,
                hasCorrectLevels: parsed.isValid && (parsed.segments?.length >= 1),
                isNormalized: parsed.isValid && !/[a-z]/.test(groupTitle),
                hasNoEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(groupTitle),
                parsed
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPORTAR GLOBALMENTE
    // ═══════════════════════════════════════════════════════════════════════

    window.GroupTitleBuilder = GroupTitleBuilder;

    console.log('%c\uD83E\uDDE9 GroupTitleBuilder v2.0 - Folder Navigation', 'color: #10b981; font-weight: bold;');

})();
