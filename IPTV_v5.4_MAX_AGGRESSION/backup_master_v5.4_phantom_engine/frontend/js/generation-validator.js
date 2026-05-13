/**
 * ═══════════════════════════════════════════════════════════════════
 * ✅ GENERATION VALIDATOR V1.0
 * Validador de integridad para archivos M3U8 generados
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Verifica:
 * - Estructura mínima M3U8 válida
 * - Proporciones correctas de líneas EXTINF vs URLs
 * - Headers APE correctamente formados
 * - Detección de anomalías y corrupción
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // ✅ GENERATION VALIDATOR
    // ═══════════════════════════════════════════════════════════════════

    const GenerationValidator = {
        version: '1.0.0',

        // ═══════════════════════════════════════════════════════════════
        // 🔍 VALIDATION METHODS
        // ═══════════════════════════════════════════════════════════════

        /**
         * Validar contenido M3U8 completo
         * @param {string} content - Contenido del archivo M3U8
         * @returns {Object} Resultado de validación
         */
        validate(content) {
            const result = {
                valid: true,
                errors: [],
                warnings: [],
                stats: {}
            };

            if (!content || typeof content !== 'string') {
                result.valid = false;
                result.errors.push('Contenido vacío o no es string');
                return result;
            }

            // 1. Verificar header M3U
            if (!this._validateHeader(content)) {
                result.valid = false;
                result.errors.push('Falta header #EXTM3U');
            }

            // 2. Analizar estructura
            const structure = this._analyzeStructure(content);
            result.stats = structure;

            // 3. Verificar proporciones
            const proportionCheck = this._validateProportions(structure);
            if (!proportionCheck.valid) {
                result.warnings.push(...proportionCheck.warnings);
            }

            // 4. Verificar EXTINF
            const extinfCheck = this._validateExtinf(content);
            if (!extinfCheck.valid) {
                result.warnings.push(...extinfCheck.warnings);
            }

            // 5. Verificar URLs
            const urlCheck = this._validateUrls(content);
            if (!urlCheck.valid) {
                result.warnings.push(...urlCheck.warnings);
            }

            // 6. Verificar headers APE
            const apeCheck = this._validateApeHeaders(content);
            result.stats.apeHeaders = apeCheck.stats;
            if (!apeCheck.valid) {
                result.warnings.push(...apeCheck.warnings);
            }

            return result;
        },

        /**
         * Validación rápida (solo estructura básica)
         * @param {string} content - Contenido M3U8
         * @returns {boolean} Si es válido
         */
        quickValidate(content) {
            if (!content || typeof content !== 'string') return false;
            if (!content.trim().startsWith('#EXTM3U')) return false;
            if (!content.includes('#EXTINF:')) return false;
            if (!content.includes('http')) return false;
            return true;
        },

        // ═══════════════════════════════════════════════════════════════
        // 🔧 INTERNAL VALIDATORS
        // ═══════════════════════════════════════════════════════════════

        _validateHeader(content) {
            const firstLine = content.trim().split('\n')[0];
            return firstLine.startsWith('#EXTM3U');
        },

        _analyzeStructure(content) {
            const lines = content.split('\n');
            const stats = {
                totalLines: lines.length,
                extinfCount: 0,
                urlCount: 0,
                extHttpCount: 0,
                extVlcOptCount: 0,
                kodiPropCount: 0,
                emptyLines: 0,
                commentLines: 0
            };

            lines.forEach(line => {
                const trimmed = line.trim();

                if (!trimmed) {
                    stats.emptyLines++;
                } else if (trimmed.startsWith('#EXTINF:')) {
                    stats.extinfCount++;
                } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                    stats.urlCount++;
                } else if (trimmed.startsWith('#EXTHTTP:')) {
                    stats.extHttpCount++;
                } else if (trimmed.startsWith('#EXTVLCOPT:')) {
                    stats.extVlcOptCount++;
                } else if (trimmed.startsWith('#KODIPROP:')) {
                    stats.kodiPropCount++;
                } else if (trimmed.startsWith('#')) {
                    stats.commentLines++;
                }
            });

            stats.estimatedChannels = Math.max(stats.extinfCount, stats.urlCount);

            return stats;
        },

        _validateProportions(stats) {
            const result = { valid: true, warnings: [] };

            // EXTINF y URLs deben ser iguales
            if (stats.extinfCount !== stats.urlCount) {
                result.warnings.push(
                    `Desbalance EXTINF/URL: ${stats.extinfCount} EXTINF vs ${stats.urlCount} URLs`
                );
            }

            // Verificar que hay contenido
            if (stats.extinfCount === 0) {
                result.valid = false;
                result.warnings.push('No se encontraron entradas EXTINF');
            }

            return result;
        },

        _validateExtinf(content) {
            const result = { valid: true, warnings: [] };
            const extinfLines = content.match(/#EXTINF:[^\n]+/g) || [];

            let malformed = 0;
            extinfLines.forEach((line, index) => {
                // Verificar formato básico: #EXTINF:-1 ... ,nombre
                if (!line.includes(',')) {
                    malformed++;
                }
            });

            if (malformed > 0) {
                result.warnings.push(`${malformed} líneas EXTINF malformadas (sin coma)`);
            }

            return result;
        },

        _validateUrls(content) {
            const result = { valid: true, warnings: [] };
            const lines = content.split('\n');

            let invalidUrls = 0;
            let emptyUrlsAfterExtinf = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (line.startsWith('#EXTINF:')) {
                    // Buscar la siguiente línea no-comentario
                    let nextLineIndex = i + 1;
                    while (nextLineIndex < lines.length &&
                        lines[nextLineIndex].trim().startsWith('#')) {
                        nextLineIndex++;
                    }

                    if (nextLineIndex < lines.length) {
                        const urlLine = lines[nextLineIndex].trim();
                        if (!urlLine.startsWith('http')) {
                            invalidUrls++;
                        }
                    } else {
                        emptyUrlsAfterExtinf++;
                    }
                }
            }

            if (invalidUrls > 0) {
                result.warnings.push(`${invalidUrls} URLs no válidas encontradas`);
            }
            if (emptyUrlsAfterExtinf > 0) {
                result.warnings.push(`${emptyUrlsAfterExtinf} entradas EXTINF sin URL posterior`);
            }

            return result;
        },

        _validateApeHeaders(content) {
            const result = { valid: true, warnings: [], stats: {} };

            // Contar #EXTHTTP
            const extHttpMatches = content.match(/#EXTHTTP:\{[^\n]+\}/g) || [];
            result.stats.extHttpCount = extHttpMatches.length;

            // Verificar JSON válido en EXTHTTP
            let invalidJson = 0;
            extHttpMatches.forEach(match => {
                try {
                    const jsonPart = match.replace('#EXTHTTP:', '');
                    JSON.parse(jsonPart);
                } catch (e) {
                    invalidJson++;
                }
            });

            if (invalidJson > 0) {
                result.warnings.push(`${invalidJson} entradas #EXTHTTP con JSON inválido`);
            }

            // Contar niveles APE usados (basado en headers)
            const levelEstimates = {
                level1: 0, // Solo User-Agent
                level4plus: 0 // Tiene Sec-CH-*
            };

            extHttpMatches.forEach(match => {
                if (match.includes('Sec-CH-UA')) {
                    levelEstimates.level4plus++;
                } else {
                    levelEstimates.level1++;
                }
            });

            result.stats.levelDistribution = levelEstimates;

            return result;
        },

        // ═══════════════════════════════════════════════════════════════
        // 📊 REPORTING
        // ═══════════════════════════════════════════════════════════════

        /**
         * Generar reporte de validación legible
         * @param {string} content - Contenido M3U8
         * @returns {string} Reporte formateado
         */
        generateReport(content) {
            const validation = this.validate(content);

            let report = `═══════════════════════════════════════════════════════════\n`;
            report += `📋 REPORTE DE VALIDACIÓN M3U8\n`;
            report += `═══════════════════════════════════════════════════════════\n\n`;

            report += `Estado: ${validation.valid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}\n\n`;

            report += `📊 ESTADÍSTICAS:\n`;
            report += `   • Total líneas: ${validation.stats.totalLines}\n`;
            report += `   • Canales estimados: ${validation.stats.estimatedChannels}\n`;
            report += `   • Entradas EXTINF: ${validation.stats.extinfCount}\n`;
            report += `   • URLs: ${validation.stats.urlCount}\n`;
            report += `   • Headers EXTHTTP: ${validation.stats.extHttpCount}\n`;
            report += `   • Tags EXTVLCOPT: ${validation.stats.extVlcOptCount}\n`;
            report += `   • Tags KODIPROP: ${validation.stats.kodiPropCount}\n\n`;

            if (validation.stats.apeHeaders) {
                const ld = validation.stats.apeHeaders.levelDistribution;
                report += `🧠 DISTRIBUCIÓN APE:\n`;
                report += `   • Nivel 1-3 (básico): ${ld.level1}\n`;
                report += `   • Nivel 4-5 (Client Hints): ${ld.level4plus}\n\n`;
            }

            if (validation.errors.length > 0) {
                report += `❌ ERRORES (${validation.errors.length}):\n`;
                validation.errors.forEach(e => { report += `   • ${e}\n`; });
                report += '\n';
            }

            if (validation.warnings.length > 0) {
                report += `⚠️ ADVERTENCIAS (${validation.warnings.length}):\n`;
                validation.warnings.forEach(w => { report += `   • ${w}\n`; });
                report += '\n';
            }

            report += `═══════════════════════════════════════════════════════════\n`;

            return report;
        },

        /**
         * Imprimir reporte en consola
         * @param {string} content - Contenido M3U8
         */
        printReport(content) {
            console.log(this.generateReport(content));
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 🌐 GLOBAL EXPORT
    // ═══════════════════════════════════════════════════════════════════

    window.GenerationValidator = GenerationValidator;
    window.validator = GenerationValidator; // Alias corto

    console.log(`[Validator] ✅ v${GenerationValidator.version} cargado`);

})();
