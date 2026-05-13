/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📊 LOGGER DIAGNÓSTICO IPTV v1.0
 * Sistema de Logging Profesional para el Toolkit de Generación de Listas M3U8
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Este módulo registra todos los eventos críticos del proceso de generación:
 * - Decisiones del motor heurístico APE (niveles 1-5)
 * - Generación/resolución de URLs (directas vs Xtream)
 * - Asignación de headers
 * - Payload enviado al Worker
 * - Errores y warnings
 * 
 * Propósito: Facilitar la depuración total del flujo de generación sin
 * interferir con la lógica de generación (solo observar y registrar).
 * 
 * Modos: verbose (detallado) | compact (resumido)
 * 
 * @version 1.0.0
 * @author IPTV Navigator PRO - Generator Supremacy
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // 📊 LOGGER DIAGNÓSTICO IPTV - CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════════

    class LoggerDiagnosticoIPTV {

        constructor() {
            this.version = '1.0.0';
            this.mode = 'compact'; // 'verbose' | 'compact'
            this.enabled = true;
            this.sessionId = null;
            this.startTime = null;

            // Almacenamiento de logs
            this.logs = {
                sistema: [],
                canales: [],
                errores: [],
                warnings: []
            };

            // Contadores para reporte final
            this.stats = {
                totalCanales: 0,
                procesados: 0,
                exitosos: 0,
                conErrores: 0,
                urlDirecta: 0,
                urlConstruida: 0,
                nivelesAPE: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                headersValidos: 0,
                headersIncompletos: 0,
                sanitizadosOK: 0,
                sanitizadosFail: 0,
                enviadosWorker: 0
            };

            // Tipos de error conocidos
            this.errorTypes = {
                MISSING_DATA: 'missing_data',
                INVALID_URL: 'invalid_url',
                UNSAFE_HEADERS: 'unsafe_headers',
                OVERSIZED_PAYLOAD: 'oversized_payload',
                SANITIZE_FAIL: 'sanitize_fail',
                WORKER_ERROR: 'worker_error',
                CONFIG_ERROR: 'config_error',
                XTREAM_BUILD_FAIL: 'xtream_build_fail'
            };

            // Riesgos de compatibilidad
            this.compatibilityRisks = {
                VLC: ['Sec-CH-UA', 'Priority', 'Sec-Fetch-'],
                KODI: ['Sec-CH-', 'Priority'],
                TIVIMATE: [],
                OTTNAVIGATOR: ['Priority']
            };
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 🔧 INITIALIZATION
        // ═══════════════════════════════════════════════════════════════════════

        /**
         * Inicializa contexto de logging para una nueva sesión
         * @param {Object} options - Opciones de configuración
         */
        init(options = {}) {
            this.sessionId = this._generateSessionId();
            this.startTime = Date.now();
            this.mode = options.mode || 'compact';
            this.enabled = options.enabled !== false;

            // Reset logs y stats
            this.logs = { sistema: [], canales: [], errores: [], warnings: [] };
            this._resetStats();

            if (this.enabled) {
                console.group(`📊 [LoggerIPTV] Sesión iniciada: ${this.sessionId}`);
                console.log(`⏰ Timestamp: ${this._formatTimestamp(this.startTime)}`);
                console.log(`🔧 Modo: ${this.mode.toUpperCase()}`);
                console.groupEnd();

                this.logSistema('Logger inicializado', { mode: this.mode, session: this.sessionId });
            }

            return this;
        }

        _generateSessionId() {
            return `LOG_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        }

        _resetStats() {
            this.stats = {
                totalCanales: 0,
                procesados: 0,
                exitosos: 0,
                conErrores: 0,
                urlDirecta: 0,
                urlConstruida: 0,
                nivelesAPE: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                headersValidos: 0,
                headersIncompletos: 0,
                sanitizadosOK: 0,
                sanitizadosFail: 0,
                enviadosWorker: 0
            };
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 📺 LOGGING POR CANAL
        // ═══════════════════════════════════════════════════════════════════════

        /**
         * Log detallado por canal
         * @param {Object} canal - Datos del canal
         * @param {Object} contexto - Contexto de procesamiento
         */
        logCanal(canal, contexto = {}) {
            if (!this.enabled) return;

            const timestamp = Date.now();
            this.stats.totalCanales++;

            // Extraer información del canal
            const canalId = canal.stream_id || canal.id || `ch_${this.stats.totalCanales}`;
            const nombre = canal.name || canal.base?.name || 'Sin Nombre';

            // Determinar tipo de URL
            const tieneUrlDirecta = !!(canal.url || canal.base?.url);
            const necesitaConstruir = !tieneUrlDirecta && !!canal.stream_id;

            if (tieneUrlDirecta) {
                this.stats.urlDirecta++;
            } else if (necesitaConstruir) {
                this.stats.urlConstruida++;
            }

            // Nivel APE
            const nivelAPE = contexto.nivelAPE || contexto.level || 1;
            if (nivelAPE >= 1 && nivelAPE <= 5) {
                this.stats.nivelesAPE[nivelAPE]++;
            }

            // Verificar headers
            const headers = contexto.headers || {};
            const tieneUserAgent = !!headers['User-Agent'];
            const tieneReferer = !!headers['Referer'];
            const headersCompletos = tieneUserAgent && (nivelAPE < 2 || tieneReferer);

            if (headersCompletos) {
                this.stats.headersValidos++;
            } else {
                this.stats.headersIncompletos++;
            }

            // Verificar riesgos de compatibilidad
            const riesgos = this._detectarRiesgosCompatibilidad(headers);

            // Verificar sanitización
            const sanitizadoOK = contexto.sanitizado !== false;
            if (sanitizadoOK) {
                this.stats.sanitizadosOK++;
            } else {
                this.stats.sanitizadosFail++;
            }

            // Crear entrada de log
            const logEntry = {
                timestamp: this._formatTimestamp(timestamp),
                canalId,
                nombre,
                urlTipo: tieneUrlDirecta ? 'DIRECTA' : (necesitaConstruir ? 'XTREAM' : 'FALTANTE'),
                urlFinal: contexto.urlFinal || canal.url || '#',
                nivelAPE,
                headers: {
                    userAgent: tieneUserAgent,
                    referer: tieneReferer,
                    completos: headersCompletos
                },
                riesgosCompatibilidad: riesgos,
                sanitizado: sanitizadoOK,
                enviadoWorker: contexto.enviadoWorker || false,
                errores: contexto.errores || []
            };

            this.logs.canales.push(logEntry);

            // Log a consola según modo
            if (this.mode === 'verbose') {
                this._logCanalVerbose(logEntry);
            } else if (contexto.errores && contexto.errores.length > 0) {
                // En modo compact, solo mostrar si hay errores
                this._logCanalCompact(logEntry);
            }

            this.stats.procesados++;

            return logEntry;
        }

        _logCanalVerbose(entry) {
            const statusIcon = entry.errores.length > 0 ? '❌' : '✅';

            console.group(`${statusIcon} [Canal] ${entry.nombre} (${entry.canalId})`);
            console.log(`📍 URL: ${entry.urlTipo} → ${entry.urlFinal.substring(0, 60)}...`);
            console.log(`🎚️ Nivel APE: ${entry.nivelAPE}`);
            console.log(`📋 Headers: UA=${entry.headers.userAgent ? '✓' : '✗'}, Ref=${entry.headers.referer ? '✓' : '✗'}`);

            if (entry.riesgosCompatibilidad.length > 0) {
                console.warn(`⚠️ Riesgos: ${entry.riesgosCompatibilidad.join(', ')}`);
            }

            if (entry.errores.length > 0) {
                console.error(`❌ Errores:`, entry.errores);
            }

            console.groupEnd();
        }

        _logCanalCompact(entry) {
            const errStr = entry.errores.map(e => e.tipo || e).join(', ');
            console.warn(`[Canal] ${entry.canalId}: ${entry.nombre} | Errores: ${errStr}`);
        }

        _detectarRiesgosCompatibilidad(headers) {
            const riesgos = [];
            const headerKeys = Object.keys(headers);

            for (const [player, headersRiesgosos] of Object.entries(this.compatibilityRisks)) {
                for (const riskHeader of headersRiesgosos) {
                    if (headerKeys.some(k => k.includes(riskHeader))) {
                        riesgos.push(`${player}:${riskHeader}`);
                    }
                }
            }

            return riesgos;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 🖥️ LOGGING DE SISTEMA
        // ═══════════════════════════════════════════════════════════════════════

        /**
         * Log de sistema general
         * @param {string} mensaje - Mensaje a registrar
         * @param {Object} datos - Datos adicionales
         */
        logSistema(mensaje, datos = {}) {
            if (!this.enabled) return;

            const entry = {
                timestamp: this._formatTimestamp(Date.now()),
                tipo: 'SISTEMA',
                mensaje,
                datos
            };

            this.logs.sistema.push(entry);

            if (this.mode === 'verbose') {
                console.log(`📊 [Sistema] ${mensaje}`, datos);
            }

            return entry;
        }

        /**
         * Log de configuración cargada
         * @param {Object} config - Configuración del generador
         */
        logConfig(config) {
            return this.logSistema('Configuración cargada', {
                modo: config.mode,
                nivelManual: config.manualLevel,
                autoReferer: config.autoReferer,
                includeBuffer: config.includeBuffer,
                userAgent: config.userAgent ? 'CUSTOM' : 'DEFAULT'
            });
        }

        /**
         * Log de payload al Worker
         * @param {number} cantidad - Cantidad de canales
         * @param {number} tamano - Tamaño estimado en bytes
         */
        logPayloadWorker(cantidad, tamano) {
            this.stats.enviadosWorker = cantidad;

            const tamanioMB = (tamano / 1024 / 1024).toFixed(2);
            const esGrande = tamano > 10 * 1024 * 1024; // > 10MB

            const entry = this.logSistema('Payload enviado al Worker', {
                canales: cantidad,
                tamanio: `${tamanioMB} MB`,
                riesgoOversized: esGrande
            });

            if (esGrande) {
                this.logWarning('Payload grande detectado', {
                    tipo: this.errorTypes.OVERSIZED_PAYLOAD,
                    tamanio: `${tamanioMB} MB`
                });
            }

            return entry;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // ⚠️ LOGGING DE ERRORES Y WARNINGS
        // ═══════════════════════════════════════════════════════════════════════

        /**
         * Registro de errores por canal
         * @param {Object} canal - Canal con error
         * @param {Object} error - Información del error
         */
        logError(canal, error) {
            if (!this.enabled) return;

            this.stats.conErrores++;

            const canalId = canal?.stream_id || canal?.id || 'UNKNOWN';
            const nombre = canal?.name || 'Sin Nombre';

            const entry = {
                timestamp: this._formatTimestamp(Date.now()),
                tipo: 'ERROR',
                canalId,
                nombre,
                error: {
                    tipo: error.tipo || error.type || this.errorTypes.MISSING_DATA,
                    mensaje: error.mensaje || error.message || String(error),
                    stack: error.stack || null
                }
            };

            this.logs.errores.push(entry);

            console.error(`❌ [Error] ${canalId}: ${entry.error.tipo} - ${entry.error.mensaje}`);

            return entry;
        }

        /**
         * Registro de warnings
         * @param {string} mensaje - Mensaje de warning
         * @param {Object} datos - Datos adicionales
         */
        logWarning(mensaje, datos = {}) {
            if (!this.enabled) return;

            const entry = {
                timestamp: this._formatTimestamp(Date.now()),
                tipo: 'WARNING',
                mensaje,
                datos
            };

            this.logs.warnings.push(entry);

            console.warn(`⚠️ [Warning] ${mensaje}`, datos);

            return entry;
        }

        /**
         * Log de error de URL inválida
         * @param {Object} canal - Canal con URL inválida
         * @param {string} urlIntentada - URL que falló
         */
        logUrlInvalida(canal, urlIntentada) {
            return this.logError(canal, {
                tipo: this.errorTypes.INVALID_URL,
                mensaje: `URL inválida o vacía: ${urlIntentada || 'N/A'}`
            });
        }

        /**
         * Log de fallo en construcción Xtream
         * @param {Object} canal - Canal afectado
         * @param {string} razon - Razón del fallo
         */
        logXtreamFail(canal, razon) {
            return this.logError(canal, {
                tipo: this.errorTypes.XTREAM_BUILD_FAIL,
                mensaje: `No se pudo construir URL Xtream: ${razon}`
            });
        }

        /**
         * Log de headers inseguros
         * @param {Object} canal - Canal afectado
         * @param {Array} headersRiesgosos - Lista de headers problemáticos
         */
        logHeadersInseguros(canal, headersRiesgosos) {
            return this.logWarning(`Headers potencialmente incompatibles en canal`, {
                canalId: canal?.stream_id || 'N/A',
                headers: headersRiesgosos,
                tipo: this.errorTypes.UNSAFE_HEADERS
            });
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 📈 REPORTE FINAL
        // ═══════════════════════════════════════════════════════════════════════

        /**
         * Genera y muestra reporte final del proceso
         * @returns {Object} Reporte completo
         */
        finalReport() {
            if (!this.enabled) return null;

            const endTime = Date.now();
            const duracion = endTime - this.startTime;

            const reporte = {
                sesion: this.sessionId,
                duracion: `${(duracion / 1000).toFixed(2)}s`,
                timestamp: {
                    inicio: this._formatTimestamp(this.startTime),
                    fin: this._formatTimestamp(endTime)
                },
                resumen: {
                    totalCanales: this.stats.totalCanales,
                    procesados: this.stats.procesados,
                    exitosos: this.stats.procesados - this.stats.conErrores,
                    conErrores: this.stats.conErrores,
                    tasaExito: this.stats.totalCanales > 0
                        ? `${((this.stats.exitosos / this.stats.totalCanales) * 100).toFixed(1)}%`
                        : 'N/A'
                },
                urls: {
                    directas: this.stats.urlDirecta,
                    construidas: this.stats.urlConstruida,
                    faltantes: this.stats.totalCanales - this.stats.urlDirecta - this.stats.urlConstruida
                },
                nivelesAPE: { ...this.stats.nivelesAPE },
                headers: {
                    validos: this.stats.headersValidos,
                    incompletos: this.stats.headersIncompletos
                },
                sanitizacion: {
                    exitosos: this.stats.sanitizadosOK,
                    fallidos: this.stats.sanitizadosFail
                },
                worker: {
                    canalesEnviados: this.stats.enviadosWorker
                },
                errores: {
                    total: this.logs.errores.length,
                    detalle: this.logs.errores.slice(0, 10) // Primeros 10
                },
                warnings: {
                    total: this.logs.warnings.length
                }
            };

            // Mostrar reporte en consola
            console.group(`📊 ═══════════ REPORTE FINAL [${this.sessionId}] ═══════════`);

            console.log(`⏱️ Duración: ${reporte.duracion}`);
            console.log(`📺 Canales: ${reporte.resumen.procesados}/${reporte.resumen.totalCanales}`);
            console.log(`✅ Exitosos: ${reporte.resumen.exitosos} (${reporte.resumen.tasaExito})`);
            console.log(`❌ Con errores: ${reporte.resumen.conErrores}`);

            console.group('📍 URLs');
            console.log(`Directas: ${reporte.urls.directas}`);
            console.log(`Construidas (Xtream): ${reporte.urls.construidas}`);
            console.log(`Faltantes: ${reporte.urls.faltantes}`);
            console.groupEnd();

            console.group('🎚️ Niveles APE');
            for (let i = 1; i <= 5; i++) {
                const count = reporte.nivelesAPE[i];
                const bar = '█'.repeat(Math.min(20, Math.round((count / this.stats.totalCanales) * 20)));
                console.log(`Nivel ${i}: ${count} ${bar}`);
            }
            console.groupEnd();

            if (reporte.errores.total > 0) {
                console.group(`❌ Errores (${reporte.errores.total})`);
                reporte.errores.detalle.forEach(e => {
                    console.log(`  • ${e.canalId}: ${e.error.tipo}`);
                });
                if (reporte.errores.total > 10) {
                    console.log(`  ... y ${reporte.errores.total - 10} más`);
                }
                console.groupEnd();
            }

            console.groupEnd();

            return reporte;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 💾 EXPORT
        // ═══════════════════════════════════════════════════════════════════════

        /**
         * Exportar todos los logs como JSON
         * @returns {string} JSON stringificado
         */
        exportJSON() {
            const exportData = {
                version: this.version,
                sesion: this.sessionId,
                exportedAt: this._formatTimestamp(Date.now()),
                stats: this.stats,
                logs: this.logs
            };

            return JSON.stringify(exportData, null, 2);
        }

        /**
         * Descargar logs como archivo JSON
         */
        downloadLogs() {
            const json = this.exportJSON();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');

            a.href = url;
            a.download = `iptv_log_${this.sessionId}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(`📥 Logs exportados: iptv_log_${this.sessionId}.json`);
        }

        /**
         * Obtener logs de errores filtrados por tipo
         * @param {string} tipo - Tipo de error a filtrar
         * @returns {Array} Errores filtrados
         */
        getErrorsByType(tipo) {
            return this.logs.errores.filter(e => e.error.tipo === tipo);
        }

        /**
         * Obtener canales con errores
         * @returns {Array} Canales problemáticos
         */
        getCanalesConErrores() {
            return this.logs.canales.filter(c => c.errores && c.errores.length > 0);
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 🔧 UTILITIES
        // ═══════════════════════════════════════════════════════════════════════

        _formatTimestamp(ms) {
            return new Date(ms).toISOString();
        }

        /**
         * Cambiar modo de logging
         * @param {string} nuevoModo - 'verbose' o 'compact'
         */
        setMode(nuevoModo) {
            if (['verbose', 'compact'].includes(nuevoModo)) {
                this.mode = nuevoModo;
                console.log(`📊 [LoggerIPTV] Modo cambiado a: ${nuevoModo.toUpperCase()}`);
            }
        }

        /**
         * Habilitar/deshabilitar logging
         * @param {boolean} estado - true para habilitar
         */
        setEnabled(estado) {
            this.enabled = !!estado;
            console.log(`📊 [LoggerIPTV] Logging ${this.enabled ? 'HABILITADO' : 'DESHABILITADO'}`);
        }

        /**
         * Limpiar todos los logs
         */
        clear() {
            this.logs = { sistema: [], canales: [], errores: [], warnings: [] };
            this._resetStats();
            console.log('📊 [LoggerIPTV] Logs limpiados');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🌐 SINGLETON GLOBAL
    // ═══════════════════════════════════════════════════════════════════════════

    // Crear instancia singleton
    const loggerInstance = new LoggerDiagnosticoIPTV();

    // Exportar globalmente
    window.LoggerDiagnosticoIPTV = LoggerDiagnosticoIPTV;
    window.loggerIPTV = loggerInstance;

    // Alias cortos
    window.iptv_log = loggerInstance;

    console.log(`📊 [LoggerIPTV] v${loggerInstance.version} cargado`);

})();
