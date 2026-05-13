/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🌊 FIELD SOURCE CASCADE SYSTEM - WATERFALL AUTOMÁTICO
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Sistema de cascada automática para fuentes de datos con visualización
 * de cobertura y priorización configurable.
 * 
 * FUENTES:
 * A = API/Automático (datos del servidor original)
 * S = Server/Source (metadatos del proveedor)
 * H = Heurísticas (inferencia basada en patrones)
 * P = Probe (análisis en tiempo real del stream)
 * E = External (enriquecimiento desde APIs externas)
 */

class FieldSourceCascadeManager {
    constructor() {
        // Definición de todas las fuentes disponibles
        this.sources = {
            A: { name: 'API', color: '#3b82f6', priority: 1 },      // Azul - Datos originales
            S: { name: 'Server', color: '#22c55e', priority: 2 },   // Verde - Metadatos
            H: { name: 'Heuristics', color: '#eab308', priority: 3 }, // Amarillo - Inferencia
            P: { name: 'Probe', color: '#ec4899', priority: 4 },    // Rosa - Análisis
            E: { name: 'External', color: '#8b5cf6', priority: 5 }  // Púrpura - APIs
        };

        // Configuración de cascade por campo
        // Define el orden de prioridad para cada campo
        this.fieldCascade = {
            // Identidad (prioridad a datos originales)
            id: ['A', 'S'],
            name: ['A', 'S', 'H'],
            tvgId: ['A', 'S', 'E'],
            tvgName: ['A', 'S', 'E'],

            // Categorización (combinar múltiples fuentes)
            group: ['S', 'A', 'H'],
            category: ['S', 'A', 'H'],
            country: ['S', 'H', 'E'],
            language: ['S', 'H', 'E'],

            // Calidad técnica (prioridad a análisis real)
            resolution: ['P', 'A', 'S', 'H'],
            bitrate: ['P', 'A', 'S', 'H'],
            codec: ['P', 'A', 'S', 'H'],
            codecFamily: ['P', 'A', 'S', 'H'],
            fps: ['P', 'A', 'S', 'H'],

            // Calidad inferida (heurísticas y scoring)
            quality: ['H', 'P', 'S'],
            qualityTags: ['H', 'P', 'S'],
            qualityScore: ['H', 'P'],
            tier: ['H', 'S'],

            // URLs y recursos
            url: ['A', 'S'],
            logo: ['S', 'A', 'E', 'H'],
            epgUrl: ['S', 'A', 'E'],

            // Metadatos adicionales
            website: ['E', 'S', 'A'],
            year: ['E', 'A', 'S', 'H'],
            plot: ['E', 'A', 'S'],
            cast: ['E', 'A', 'S'],

            // Servidor
            serverUrl: ['A'],
            serverProtocol: ['A', 'S'],
            allowedFormats: ['A', 'S']
        };

        // Tracking de cobertura por fuente
        this.coverageStats = {
            A: { fields: new Set(), count: 0, percentage: 0 },
            S: { fields: new Set(), count: 0, percentage: 0 },
            H: { fields: new Set(), count: 0, percentage: 0 },
            P: { fields: new Set(), count: 0, percentage: 0 },
            E: { fields: new Set(), count: 0, percentage: 0 }
        };
    }

    /**
     * 🌊 Aplicar cascade automático a un canal
     * Intenta obtener cada campo desde múltiples fuentes en orden de prioridad
     */
    applyCascade(channelData) {
        const result = {
            // Datos finales del canal
            data: {},

            // Metadata de qué fuente proporcionó cada campo
            _sourceMeta: {},

            // Estadísticas de cobertura para este canal
            _coverage: {
                A: [], S: [], H: [], P: [], E: []
            }
        };

        // Procesar cada campo configurado
        Object.entries(this.fieldCascade).forEach(([fieldName, sources]) => {
            let value = null;
            let sourceUsed = null;

            // Intentar obtener el valor de cada fuente en orden
            for (const source of sources) {
                value = this._getFieldFromSource(channelData, fieldName, source);

                if (this._isValidValue(value)) {
                    sourceUsed = source;
                    break; // Detener al encontrar valor válido
                }
            }

            // Si se encontró un valor válido, guardarlo
            if (value !== null && sourceUsed !== null) {
                result.data[fieldName] = value;
                result._sourceMeta[fieldName] = {
                    source: sourceUsed,
                    sourceName: this.sources[sourceUsed].name,
                    color: this.sources[sourceUsed].color,
                    cascadePosition: sources.indexOf(sourceUsed) + 1,
                    totalSources: sources.length,
                    fallbackUsed: sources.indexOf(sourceUsed) > 0
                };

                // Actualizar coverage tracking
                result._coverage[sourceUsed].push(fieldName);
                this.coverageStats[sourceUsed].fields.add(fieldName);
            }
        });

        // Calcular estadísticas de cobertura para este canal
        result._coverageStats = this._calculateChannelCoverage(result._coverage);

        return result;
    }

    /**
     * Obtener valor de un campo desde una fuente específica
     */
    _getFieldFromSource(channelData, fieldName, source) {
        switch (source) {
            case 'A': // API/Automático - datos originales del servidor
                return channelData.raw?.[fieldName] ||
                    channelData[fieldName] ||
                    channelData.api?.[fieldName];

            case 'S': // Server - metadatos del proveedor
                return channelData.server?.[fieldName] ||
                    channelData.metadata?.[fieldName] ||
                    channelData[`server_${fieldName}`];

            case 'H': // Heuristics - datos inferidos
                return channelData.heuristics?.[fieldName] ||
                    channelData.inferred?.[fieldName] ||
                    channelData[`heuristic_${fieldName}`];

            case 'P': // Probe - análisis en tiempo real
                return channelData.probe?.[fieldName] ||
                    channelData.analyzed?.[fieldName] ||
                    channelData.tech?.[fieldName];

            case 'E': // External - enriquecimiento externo
                return channelData.external?.[fieldName] ||
                    channelData.enriched?.[fieldName] ||
                    channelData.meta?.[fieldName];

            default:
                return null;
        }
    }

    /**
     * Validar si un valor es considerado válido (no vacío/nulo)
     */
    _isValidValue(value) {
        if (value === null || value === undefined) return false;
        if (value === '') return false;
        if (value === 'UNKNOWN' || value === 'N/A') return false;
        if (Array.isArray(value) && value.length === 0) return false;
        if (typeof value === 'object' && Object.keys(value).length === 0) return false;
        if (typeof value === 'number' && (isNaN(value) || value === 0)) return false;

        return true;
    }

    /**
     * Calcular estadísticas de cobertura para un canal
     */
    _calculateChannelCoverage(coverage) {
        const totalFields = Object.keys(this.fieldCascade).length;
        const stats = {};

        Object.keys(this.sources).forEach(source => {
            const count = coverage[source].length;
            stats[source] = {
                count: count,
                percentage: ((count / totalFields) * 100).toFixed(1),
                fields: coverage[source]
            };
        });

        return stats;
    }

    /**
     * 📊 Procesar lista completa de canales con cascade
     */
    processChannels(channels) {
        console.log('🌊 Iniciando cascade automático de fuentes...');
        console.time('Cascade processing');

        // Resetear estadísticas
        Object.keys(this.coverageStats).forEach(source => {
            this.coverageStats[source].fields.clear();
            this.coverageStats[source].count = 0;
        });

        // Procesar cada canal
        const processedChannels = channels.map(ch => {
            const cascaded = this.applyCascade(ch);

            // Copiar metadata al canal principal
            ch._fieldSources = cascaded._sourceMeta;
            ch._coverage = cascaded._coverageStats;

            // Mergear datos cascadeados al canal
            Object.assign(ch, cascaded.data);

            return ch;
        });

        // Calcular estadísticas globales
        const totalFields = Object.keys(this.fieldCascade).length;
        Object.keys(this.coverageStats).forEach(source => {
            const stat = this.coverageStats[source];
            stat.count = stat.fields.size;
            stat.percentage = ((stat.count / totalFields) * 100).toFixed(1);
        });

        console.timeEnd('Cascade processing');
        console.log('✅ Cascade completado');
        this.logCoverageReport();

        return processedChannels;
    }

    /**
     * 📈 Generar reporte de cobertura
     */
    logCoverageReport() {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📊 REPORTE DE COBERTURA POR FUENTE');
        console.log('═══════════════════════════════════════════════════════════');

        const sortedSources = Object.entries(this.coverageStats)
            .sort((a, b) => b[1].count - a[1].count);

        sortedSources.forEach(([source, stats]) => {
            const sourceName = this.sources[source].name.padEnd(12);
            const bar = '█'.repeat(Math.round(stats.percentage / 5));
            console.log(
                `${source} | ${sourceName} | ${stats.count.toString().padStart(2)}/${stats.fields.size} campos | ` +
                `${stats.percentage.padStart(5)}% | ${bar}`
            );
        });

        console.log('═══════════════════════════════════════════════════════════');

        // Log de campos cubiertos por cada fuente
        sortedSources.forEach(([source, stats]) => {
            if (stats.count > 0) {
                console.log(`\n${source} (${this.sources[source].name}) - Campos:`);
                console.log([...stats.fields].sort().join(', '));
            }
        });
    }

    /**
     * 🎨 Generar HTML para visualizar fuentes de un campo
     */
    generateFieldSourceBadge(fieldName, sourceMeta) {
        if (!sourceMeta) return '';

        const { source, sourceName, color, fallbackUsed } = sourceMeta;
        const icon = fallbackUsed ? '⚠️' : '✓';

        return `
            <span class="field-source-badge" 
                  style="background: ${color}; 
                         color: white; 
                         padding: 2px 6px; 
                         border-radius: 4px; 
                         font-size: 10px;
                         margin-left: 4px;"
                  title="Fuente: ${sourceName} ${fallbackUsed ? '(fallback)' : '(primaria)'}">
                ${icon} ${source}
            </span>
        `;
    }

    /**
     * 🎨 Generar indicador visual de cobertura para un canal
     */
    generateCoverageIndicator(channel) {
        if (!channel._coverage) return '';

        const bars = Object.entries(this.sources).map(([code, info]) => {
            const coverage = channel._coverage[code];
            const percentage = parseFloat(coverage.percentage);
            const opacity = percentage / 100;

            return `
                <div style="display: inline-block; 
                           width: 30px; 
                           height: 4px; 
                           background: ${info.color}; 
                           opacity: ${opacity};
                           margin-right: 2px;
                           border-radius: 2px;"
                     title="${info.name}: ${coverage.count} campos (${coverage.percentage}%)">
                </div>
            `;
        }).join('');

        return `<div class="coverage-indicator" style="margin-top: 4px;">${bars}</div>`;
    }

    /**
     * 📋 Exportar configuración de cascade para edición
     */
    exportCascadeConfig() {
        return JSON.stringify(this.fieldCascade, null, 2);
    }

    /**
     * 📥 Importar configuración de cascade personalizada
     */
    importCascadeConfig(configJson) {
        try {
            const config = JSON.parse(configJson);

            // Validar configuración
            Object.entries(config).forEach(([field, sources]) => {
                if (!Array.isArray(sources)) {
                    throw new Error(`Campo ${field}: sources debe ser un array`);
                }
                sources.forEach(source => {
                    if (!this.sources[source]) {
                        throw new Error(`Fuente desconocida: ${source}`);
                    }
                });
            });

            this.fieldCascade = config;
            console.log('✅ Configuración de cascade importada exitosamente');
            return true;
        } catch (error) {
            console.error('❌ Error al importar configuración:', error);
            return false;
        }
    }

    /**
     * 🔧 Modificar prioridad de cascade para un campo específico
     */
    setFieldCascade(fieldName, sourcesArray) {
        // Validar fuentes
        sourcesArray.forEach(source => {
            if (!this.sources[source]) {
                throw new Error(`Fuente desconocida: ${source}`);
            }
        });

        this.fieldCascade[fieldName] = sourcesArray;
        console.log(`✅ Cascade actualizado para ${fieldName}:`, sourcesArray);
    }

    /**
     * 📊 Generar tabla de cobertura HTML
     */
    generateCoverageTable() {
        const totalFields = Object.keys(this.fieldCascade).length;

        let html = `
        <div style="font-family: monospace; padding: 20px; background: #1e293b; color: #e2e8f0; border-radius: 8px;">
            <h3 style="margin-top: 0;">📊 Cobertura de Fuentes de Datos</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #475569;">
                        <th style="text-align: left; padding: 8px;">Fuente</th>
                        <th style="text-align: left; padding: 8px;">Nombre</th>
                        <th style="text-align: right; padding: 8px;">Campos</th>
                        <th style="text-align: right; padding: 8px;">%</th>
                        <th style="text-align: left; padding: 8px;">Cobertura</th>
                    </tr>
                </thead>
                <tbody>
        `;

        Object.entries(this.coverageStats)
            .sort((a, b) => b[1].count - a[1].count)
            .forEach(([source, stats]) => {
                const info = this.sources[source];
                const barWidth = stats.percentage;

                html += `
                    <tr style="border-bottom: 1px solid #334155;">
                        <td style="padding: 8px;">
                            <span style="background: ${info.color}; 
                                       color: white; 
                                       padding: 2px 8px; 
                                       border-radius: 4px; 
                                       font-weight: bold;">
                                ${source}
                            </span>
                        </td>
                        <td style="padding: 8px;">${info.name}</td>
                        <td style="padding: 8px; text-align: right;">${stats.count}/${totalFields}</td>
                        <td style="padding: 8px; text-align: right;">${stats.percentage}%</td>
                        <td style="padding: 8px;">
                            <div style="background: #334155; 
                                       border-radius: 4px; 
                                       height: 20px; 
                                       position: relative; 
                                       overflow: hidden;">
                                <div style="background: ${info.color}; 
                                           width: ${barWidth}%; 
                                           height: 100%; 
                                           transition: width 0.3s;">
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            });

        html += `
                </tbody>
            </table>
        </div>
        `;

        return html;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// INTEGRACIÓN CON IPTV NAVIGATOR PRO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Ejemplo de uso en app.js
 */

/*
// En el constructor de IPTVApp:
this.cascadeManager = new FieldSourceCascadeManager();

// Después de obtener canales del servidor (en processChannels):
async processChannels(rawChannels, serverObj, append = false) {
    console.time('Processing');
    
    // ... normalización existente ...
    const normalized = rawChannels.map((ch, idx) => this.normalizeChannel(ch, serverObj, idx));
    
    // ✅ APLICAR CASCADE AUTOMÁTICO
    const cascaded = this.cascadeManager.processChannels(normalized);
    
    // ... resto del procesamiento ...
    
    // Los canales ahora tienen:
    // - ch._fieldSources (metadata de fuentes por campo)
    // - ch._coverage (estadísticas de cobertura)
    // - Todos los campos con valores cascadeados automáticamente
    
    console.timeEnd('Processing');
}

// Para mostrar badges en la tabla:
function renderTableCell(channel, fieldName) {
    const value = channel[fieldName] || '';
    const sourceMeta = channel._fieldSources?.[fieldName];
    const badge = this.cascadeManager.generateFieldSourceBadge(fieldName, sourceMeta);
    
    return `${value} ${badge}`;
}

// Para mostrar indicador de cobertura en cada fila:
function renderTableRow(channel) {
    const row = document.createElement('tr');
    // ... crear celdas ...
    
    // Agregar indicador de cobertura
    const coverageCell = document.createElement('td');
    coverageCell.innerHTML = this.cascadeManager.generateCoverageIndicator(channel);
    row.appendChild(coverageCell);
    
    return row;
}
*/

// ═══════════════════════════════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.FieldSourceCascadeManager = FieldSourceCascadeManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldSourceCascadeManager;
}
