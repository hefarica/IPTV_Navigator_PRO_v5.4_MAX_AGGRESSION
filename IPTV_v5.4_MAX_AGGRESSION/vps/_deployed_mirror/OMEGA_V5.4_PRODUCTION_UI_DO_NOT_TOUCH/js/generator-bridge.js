/**
 * ═══════════════════════════════════════════════════════════════════
 * 🚀 GENERATOR BRIDGE v1.0 (Generator Supremacy)
 * Conecta la UI del Generador con el APE Worker
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Este módulo actúa como puente entre:
 * - La interfaz de usuario (botones, barras de progreso)
 * - El Web Worker que ejecuta la lógica APE v4.1
 * - Los datos de canales almacenados en app.state
 * 
 * Beneficios:
 * - Generación sin congelar la UI
 * - Progreso en tiempo real
 * - Fallback automático si Worker no disponible
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // 🔧 GENERATOR FAST LANE CLASS
    // ═══════════════════════════════════════════════════════════════════

    class GeneratorFastLane {
        constructor() {
            this.worker = null;
            this.isProcessing = false;
            this.startTime = 0;
            this.fallbackMode = false;

            // UI Element Cache
            this.ui = {
                btnGenerate: null,
                progressContainer: null,
                progressBar: null,
                progressText: null,
                outputArea: null,
                btnDownload: null,
                statsContainer: null
            };
        }

        // ═══════════════════════════════════════════════════════════════
        // 📦 INITIALIZATION
        // ═══════════════════════════════════════════════════════════════

        init() {
            console.log('[GeneratorBridge] 🚀 Inicializando...');

            // 1. Cache UI elements
            this.cacheUIElements();

            // 2. Initialize Worker
            this.initWorker();

            // 3. Bind events
            this.bindEvents();

            console.log('[GeneratorBridge] ✅ Inicializado correctamente');
        }

        cacheUIElements() {
            // Múltiples IDs posibles por compatibilidad
            this.ui.btnGenerate =
                document.getElementById('btn-generate-m3u8') ||
                document.getElementById('btnGenerateM3U8Pro') ||
                document.getElementById('btn-start-generate');

            this.ui.progressContainer =
                document.getElementById('generation-progress-container') ||
                document.getElementById('feedback-container') ||
                document.getElementById('genProgressContainer');

            this.ui.progressBar =
                document.getElementById('generation-progress-bar') ||
                document.getElementById('progress-bar-fill') ||
                document.getElementById('genProgressBar');

            this.ui.progressText =
                document.getElementById('generation-progress-text') ||
                document.getElementById('progress-text') ||
                document.getElementById('genProgressText');

            this.ui.outputArea =
                document.getElementById('m3u8-output-area') ||
                document.getElementById('m3u8PreviewGen') ||
                document.getElementById('m3u8Preview');

            this.ui.btnDownload =
                document.getElementById('btnDownloadM3U8Pro') ||
                document.getElementById('btnDownloadM3U8') ||
                document.getElementById('btn-download-m3u8');

            // Log elementos encontrados
            const found = Object.entries(this.ui)
                .filter(([k, v]) => v !== null)
                .map(([k]) => k);
            console.log('[GeneratorBridge] UI Elements found:', found);
        }

        initWorker() {
            if (typeof Worker === 'undefined') {
                console.warn('[GeneratorBridge] ⚠️ Web Workers no soportados. Usando fallback.');
                this.fallbackMode = true;
                return;
            }

            try {
                // Determinar ruta del worker
                const workerPath = this.getWorkerPath();
                this.worker = new Worker(workerPath);

                this.worker.onmessage = (event) => this.handleWorkerMessage(event);
                this.worker.onerror = (error) => this.handleWorkerError(error);

                // Ping para verificar que el worker está activo
                this.worker.postMessage({ type: 'ping' });

                console.log('[GeneratorBridge] 🧠 Worker APE v4.1 creado:', workerPath);

            } catch (error) {
                console.error('[GeneratorBridge] ❌ Error creando Worker:', error);
                this.fallbackMode = true;
            }
        }

        getWorkerPath() {
            // Detectar ruta base del script actual
            const scripts = document.getElementsByTagName('script');
            for (const script of scripts) {
                if (script.src && script.src.includes('generator-bridge')) {
                    const basePath = script.src.substring(0, script.src.lastIndexOf('/'));
                    return `${basePath}/ape-worker.js`;
                }
            }
            // Fallback path
            return 'js/ape-worker.js';
        }

        bindEvents() {
            // Botón principal de generación
            if (this.ui.btnGenerate) {
                // Remover listeners previos
                const newBtn = this.ui.btnGenerate.cloneNode(true);
                this.ui.btnGenerate.parentNode.replaceChild(newBtn, this.ui.btnGenerate);
                this.ui.btnGenerate = newBtn;

                this.ui.btnGenerate.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.startProcess();
                });
                console.log('[GeneratorBridge] ✅ Botón Generar vinculado');
            }

            // Botón de descarga
            if (this.ui.btnDownload) {
                this.ui.btnDownload.addEventListener('click', () => this.downloadOutput());
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // 🎬 GENERATION PROCESS
        // ═══════════════════════════════════════════════════════════════

        startProcess() {
            if (this.isProcessing) {
                console.warn('[GeneratorBridge] ⚠️ Ya hay un proceso en curso');
                return;
            }

            console.log('[GeneratorBridge] 🚀 Iniciando proceso de generación...');

            // 📊 LOGGER: Iniciar sesión de diagnóstico
            if (window.loggerIPTV) {
                window.loggerIPTV.init({ mode: 'compact' });
            }

            // 1. Obtener configuración
            const config = this.collectConfig();
            console.log('[GeneratorBridge] Config:', config);

            // 📊 LOGGER: Registrar configuración
            if (window.loggerIPTV) {
                window.loggerIPTV.logConfig(config);
            }

            // 2. Obtener dataset
            const dataset = this.getChannelDataset();

            if (!dataset || dataset.length === 0) {
                this.showAlert('No hay canales para generar. Conecta un servidor primero.');
                return;
            }

            console.log(`[GeneratorBridge] 📊 Dataset: ${dataset.length} canales`);

            // 📊 LOGGER: Registrar dataset
            if (window.loggerIPTV) {
                window.loggerIPTV.logSistema('Dataset obtenido', { total: dataset.length });
            }

            // 3. Activar Tab Lifecycle (hibernar otras pestañas)
            if (window.tabLifecycle && typeof window.tabLifecycle.hibernateAll === 'function') {
                window.tabLifecycle.hibernateAll();
                console.log('[GeneratorBridge] 💤 Pestañas hibernadas');
            }

            // 4. Preparar UI
            this.setUIState(true);
            this.isProcessing = true;
            this.startTime = performance.now();

            // 5. Iniciar generación
            if (this.fallbackMode) {
                this.startFallbackGeneration(dataset, config);
            } else {
                this.startWorkerGeneration(dataset, config);
            }
        }

        collectConfig() {
            const config = {
                mode: 'auto',
                manualLevel: 3,
                autoReferer: true,
                includeBuffer: true,
                proStreaming: false,
                playlistName: 'IPTV Navigator PRO'
            };

            // Intentar obtener configuración de GenTabController
            if (window.GenTabController && typeof window.GenTabController.getConfig === 'function') {
                const genConfig = window.GenTabController.getConfig();
                config.mode = genConfig.apeMode || 'auto';
                config.manualLevel = genConfig.apeLevel || 3;
                config.enableClientHints = genConfig.enableClientHints;
                config.compressionProfile = genConfig.compressionProfile;
            }

            // Verificar elementos del DOM
            const modeSelect = document.getElementById('ape-mode-select') ||
                document.getElementById('ape-engine__mode-select');
            if (modeSelect) {
                config.mode = modeSelect.value;
            }

            const levelSlider = document.getElementById('ape-engine__level-slider');
            if (levelSlider && config.mode === 'manual') {
                config.manualLevel = parseInt(levelSlider.value, 10);
            }

            const autoRefererChk = document.getElementById('chk-auto-referer');
            if (autoRefererChk) {
                config.autoReferer = autoRefererChk.checked;
            }

            const proStreamingChk = document.getElementById('proStreamingOptimized');
            if (proStreamingChk) {
                config.proStreaming = proStreamingChk.checked;
            }

            // Custom User-Agent
            const customUA = document.getElementById('custom-ua') ||
                document.getElementById('customUserAgent');
            if (customUA && customUA.value.trim()) {
                config.userAgent = customUA.value.trim();
            }

            return config;
        }

        /**
         * Obtener dataset RAW de canales (sin copiar/transformar aún)
         * La sanitización se hace después para evitar doble-copia
         */
        getChannelDataset() {
            // Prioridad de fuentes de datos:
            // 1. Canales filtrados activos
            // 2. Canales en state
            // 3. GlobalState (compatibilidad GenerationController)

            if (window.app && window.app.state) {
                const state = window.app.state;

                // Intentar obtener canales filtrados
                if (typeof window.app.getFilteredChannels === 'function') {
                    const filtered = window.app.getFilteredChannels();
                    if (filtered && filtered.length > 0) {
                        return filtered; // Retornar RAW, sin normalizar
                    }
                }

                // Usar channelsMaster o channels
                if (state.channelsMaster && state.channelsMaster.length > 0) {
                    return state.channelsMaster; // RAW
                }
                if (state.channels && state.channels.length > 0) {
                    return state.channels; // RAW
                }
            }

            // GlobalState fallback
            if (window.GlobalState && window.GlobalState.sourceData) {
                return window.GlobalState.sourceData; // RAW
            }

            return [];
        }

        /**
         * 🛡️ DIET PAYLOAD - Sanitización para evitar Cloning Spike
         * Convierte objetos complejos de canal en estructuras planas y ligeras.
         * Resuelve URLs dinámicas (Xtream) ANTES de enviar al Worker.
         * @param {Array} channels - Dataset raw de canales
         * @returns {Array} Payload ligero con solo strings
         */
        _sanitizePayload(channels) {
            const app = window.app;
            const count = channels.length;
            const lightweight = new Array(count);
            const logger = window.loggerIPTV;

            console.time('SanitizePayload');
            console.log(`[GeneratorBridge] 🧹 Sanitizando ${count} canales para el Worker...`);

            for (let i = 0; i < count; i++) {
                const ch = channels[i];
                const base = ch.base || {};
                let sanitizadoOK = true;
                let urlTipo = 'directa';
                const errores = [];

                // 1. Resolver URL Final (Crítico para Xtream)
                let finalUrl = ch.url || base.url || '';

                // Construir URL Xtream si falta
                if (!finalUrl && ch.stream_id && app?.state?.currentServer?.baseUrl) {
                    urlTipo = 'xtream';
                    try {
                        const { baseUrl, username, password } = app.state.currentServer;
                        const cleanBase = baseUrl.replace(/\/player_api\.php$/, '');
                        let ext = app.state.streamFormat || 'ts';
                        let typePath = 'live';

                        if (ch.stream_type === 'movie' || ch.type === 'movie') {
                            typePath = 'movie';
                            ext = ch.container_extension || 'mp4';
                        } else if (ch.stream_type === 'series' || ch.type === 'series') {
                            typePath = 'series';
                            ext = 'mp4';
                        }

                        finalUrl = `${cleanBase}/${typePath}/${username}/${password}/${ch.stream_id}.${ext}`;
                    } catch (e) {
                        finalUrl = ch.direct_source || '#ERROR_BUILDING_URL';
                        sanitizadoOK = false;
                        errores.push({ tipo: 'xtream_build_fail', mensaje: e.message });

                        // 📊 LOGGER: Error Xtream
                        if (logger) {
                            logger.logXtreamFail(ch, e.message);
                        }
                    }
                }

                // Fallback final
                if (!finalUrl) {
                    finalUrl = ch.direct_source || '#';
                    if (finalUrl === '#') {
                        sanitizadoOK = false;
                        errores.push({ tipo: 'invalid_url', mensaje: 'URL vacía' });

                        // 📊 LOGGER: URL inválida
                        if (logger) {
                            logger.logUrlInvalida(ch, finalUrl);
                        }
                    }
                }

                // 2. Crear objeto PLANO (solo strings primitivos)
                lightweight[i] = {
                    name: String(ch.name || base.name || 'Sin Nombre'),
                    url: String(finalUrl),
                    group: String(ch.group || base.group || ch.category_name || 'General'),
                    logo: String(ch.logo || ch.stream_icon || base.logo || ''),
                    tvg_id: String(ch.tvg_id || ch.epg_channel_id || ''),
                    tvg_name: String(ch.tvg_name || ch.name || '')
                };

                // 📊 LOGGER: Log del canal (solo cada 1000 en compact, o todos en verbose)
                if (logger && (logger.mode === 'verbose' || i % 1000 === 0 || errores.length > 0)) {
                    logger.logCanal(ch, {
                        urlFinal: finalUrl,
                        urlTipo: urlTipo,
                        sanitizado: sanitizadoOK,
                        errores: errores
                    });
                }
            }

            console.timeEnd('SanitizePayload');
            console.log(`[GeneratorBridge] 📊 Payload optimizado: ${count} canales`);
            return lightweight;
        }

        startWorkerGeneration(rawChannels, config) {
            // 🛡️ DIET PAYLOAD: Sanitizar antes de enviar al Worker
            let payload;
            try {
                payload = this._sanitizePayload(rawChannels);
            } catch (e) {
                console.error('[GeneratorBridge] ❌ Error en sanitización:', e);
                this.showAlert('Error preparando datos para el generador.');
                this.setUIState(false);
                this.isProcessing = false;
                return;
            }

            // 📊 LOGGER: Registrar payload enviado al Worker
            if (window.loggerIPTV) {
                const payloadSize = JSON.stringify(payload).length;
                window.loggerIPTV.logPayloadWorker(payload.length, payloadSize);
            }

            // Enviar payload ligero al Worker
            this.worker.postMessage({
                type: 'start_generation',
                channels: payload,
                config: config
            });
        }

        startFallbackGeneration(channels, config) {
            console.log('[GeneratorBridge] 📦 Modo fallback: usando ExportModule...');

            // Usar ExportModule existente
            if (window.ExportModule && window.app) {
                try {
                    const exportModule = new window.ExportModule(window.app);
                    const content = exportModule.generateM3U8(channels, {
                        includeHeaders: true,
                        antiFreezeLevel: config.manualLevel,
                        autoDetectLevel: config.mode === 'auto',
                        proStreaming: config.proStreaming
                    });

                    this.handleGenerationComplete(content, {
                        total: channels.length,
                        time: Math.round(performance.now() - this.startTime)
                    });
                } catch (error) {
                    this.handleWorkerError(error);
                }
            } else {
                this.showAlert('Error: ExportModule no disponible para fallback.');
                this.setUIState(false);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // 📨 WORKER MESSAGE HANDLERS
        // ═══════════════════════════════════════════════════════════════

        handleWorkerMessage(event) {
            const data = event.data;

            switch (data.type) {
                case 'progress':
                    this.updateUIProgress(data.percent, data.count);
                    break;

                case 'complete':
                    this.handleGenerationComplete(data.blob, data.stats);
                    break;

                case 'error':
                    console.error('[GeneratorBridge] Worker error:', data.message);
                    this.showAlert(`Error en generación: ${data.message}`);
                    this.setUIState(false);
                    break;

                case 'pong':
                    console.log('[GeneratorBridge] Worker pong received. Version:', data.version);
                    break;

                default:
                    console.warn('[GeneratorBridge] Mensaje desconocido:', data.type);
            }
        }

        handleWorkerError(error) {
            console.error('[GeneratorBridge] ❌ Worker error:', error);
            this.isProcessing = false;
            this.setUIState(false);
            this.showAlert('Error en el proceso de generación. Revisa la consola.');
        }

        handleGenerationComplete(content, stats) {
            const duration = Math.round(performance.now() - this.startTime);

            console.log(`[GeneratorBridge] ✅ Generación completada:`);
            console.log(`   📊 Total: ${stats.total} canales`);
            console.log(`   ⏱️ Tiempo: ${duration}ms`);
            console.log(`   📦 Tamaño: ${((stats.sizeBytes || content.length) / 1024 / 1024).toFixed(2)} MB`);

            // 📊 LOGGER: Registrar finalización y mostrar reporte
            if (window.loggerIPTV) {
                window.loggerIPTV.logSistema('Generación completada', {
                    total: stats.total,
                    duracion: `${duration}ms`,
                    tamanio: stats.sizeBytes || content.length
                });

                // Mostrar reporte final
                window.loggerIPTV.finalReport();
            }

            // 1. Guardar en estado global
            if (window.app && window.app.state) {
                window.app.state.generatedM3U8 = content;
            }

            // 2. Mostrar en textarea (preview limitado)
            if (this.ui.outputArea) {
                const previewText = content.length > 3000
                    ? content.slice(0, 3000) + '\n\n... [VISTA PREVIA LIMITADA - DESCARGA EL ARCHIVO PARA VER TODO]'
                    : content;
                this.ui.outputArea.value = previewText;
            }

            // 3. Habilitar descarga
            if (this.ui.btnDownload) {
                this.ui.btnDownload.disabled = false;
            }

            // 4. Actualizar telemetría V4.1
            if (window.GenTabController && typeof window.GenTabController.setTelemetry === 'function') {
                window.GenTabController.setTelemetry({
                    success: stats.total,
                    avgLevel: stats.avgLevel || 0,
                    warnings: 0,
                    errors: 0
                });
            }

            // 5. Notificación
            this.showNotification(`¡Generación completada! ${stats.total.toLocaleString()} canales en ${(duration / 1000).toFixed(2)}s`);

            // 6. Restaurar UI
            this.setUIState(false);
            this.isProcessing = false;
        }

        // ═══════════════════════════════════════════════════════════════
        // 🎨 UI HELPERS
        // ═══════════════════════════════════════════════════════════════

        setUIState(isActive) {
            // Progress container
            if (this.ui.progressContainer) {
                this.ui.progressContainer.style.display = isActive ? 'block' : 'none';
                this.ui.progressContainer.hidden = !isActive;
            }

            // Botón generar
            if (this.ui.btnGenerate) {
                this.ui.btnGenerate.disabled = isActive;
                this.ui.btnGenerate.textContent = isActive
                    ? '⏳ Generando con APE v8.2.2...'
                    : '🚀 Generar Lista M3U8';
            }

            // Reset progress bar
            if (!isActive && this.ui.progressBar) {
                this.ui.progressBar.style.width = '0%';
            }
            if (!isActive && this.ui.progressText) {
                this.ui.progressText.textContent = '';
            }
        }

        updateUIProgress(percent, count) {
            if (this.ui.progressBar) {
                this.ui.progressBar.style.width = `${percent}%`;
            }
            if (this.ui.progressText) {
                this.ui.progressText.textContent = `${percent}% (${count.toLocaleString()} canales)`;
            }

            // También actualizar elementos alternativos
            const percentEl = document.getElementById('progress-percent');
            if (percentEl) {
                percentEl.textContent = `${percent}%`;
            }
        }

        showAlert(message) {
            if (typeof alert !== 'undefined') {
                alert(message);
            }
            console.warn('[GeneratorBridge] ALERT:', message);
        }

        showNotification(message) {
            // Intentar usar sistema de notificaciones de la app
            if (window.app && typeof window.app.showNotification === 'function') {
                window.app.showNotification(message, false);
                return;
            }

            // Toast fallback
            console.log('[GeneratorBridge] 🔔', message);
        }

        downloadOutput() {
            const content = window.app?.state?.generatedM3U8 || this.ui.outputArea?.value;

            if (!content || content.length === 0) {
                this.showAlert('No hay contenido para descargar. Genera primero.');
                return;
            }

            const blob = new Blob([content], { type: 'audio/x-mpegurl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `iptv_navigator_${new Date().toISOString().slice(0, 10)}.m3u8`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('[GeneratorBridge] 📥 Descarga iniciada');
        }

        // ═══════════════════════════════════════════════════════════════
        // 🔧 PUBLIC API
        // ═══════════════════════════════════════════════════════════════

        /**
         * Forzar regeneración con nueva configuración
         */
        regenerate(config = {}) {
            this.startProcess();
        }

        /**
         * Cancelar proceso en curso
         */
        cancel() {
            if (this.worker) {
                this.worker.terminate();
                this.initWorker(); // Recrear worker
            }
            this.isProcessing = false;
            this.setUIState(false);
            console.log('[GeneratorBridge] ⛔ Proceso cancelado');
        }

        /**
         * Obtener estado actual
         */
        getStatus() {
            return {
                isProcessing: this.isProcessing,
                workerActive: this.worker !== null,
                fallbackMode: this.fallbackMode
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🌐 GLOBAL INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════

    // Crear instancia global
    window.GeneratorFastLane = GeneratorFastLane;
    window.generatorBridge = new GeneratorFastLane();

    // Inicializar cuando DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => window.generatorBridge.init(), 100);
        });
    } else {
        // DOM ya cargado
        setTimeout(() => window.generatorBridge.init(), 100);
    }

    console.log('[GeneratorBridge] 📦 Módulo cargado');

})();
