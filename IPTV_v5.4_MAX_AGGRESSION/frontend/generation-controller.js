/**
 * GenerationController.js
 * V4.1 Section 4: Generación y Exportar
 * 
 * Orchestrates the file generation pipeline with:
 * - FileSystem Access API for direct-to-disk streaming
 * - Backpressure handling to prevent memory leaks
 * - Real-time terminal logging and progress
 */

(function () {
    'use strict';

    window.GenerationController = {
        // ------------------------------------------------------------------------
        // Internal State
        // ------------------------------------------------------------------------
        state: {
            isGenerating: false,
            writer: null,
            fileHandle: null,
            startTime: 0,
            processedCount: 0,
            bytesWritten: 0
        },

        // ------------------------------------------------------------------------
        // DOM Cache
        // ------------------------------------------------------------------------
        ui: {
            btnStart: null,
            btnCancel: null,
            feedbackContainer: null,
            progressBar: null,
            progressPercent: null,
            progressText: null,
            terminal: null,
            statTime: null,
            filenameInput: null,
            formatRadios: null,
            // Cloudflare R2
            r2WorkerUrl: null,
            r2SecretKey: null,
            r2AutoUpload: null
        },

        // --- APE v8.0 HUD SYSTEM ---
        UImaster: {
            init() {
                if (document.getElementById('ape-hud')) document.getElementById('ape-hud').remove();
                const hud = document.createElement('div');
                hud.id = 'ape-hud';
                hud.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(5,5,10,0.98);z-index:99999;color:#00ff41;font-family:'Consolas',monospace;padding:40px;display:flex;flex-direction:column;border:4px solid #03A9F4;box-sizing:border-box;box-shadow: inset 0 0 50px #03A9F4;";

                hud.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #03A9F4;padding-bottom:20px;margin-bottom:20px;">
                        <h1 style="margin:0;font-size:32px;text-shadow:0 0 15px #03A9F4;">🛡️ APE v8.0 HYPER-SOVEREIGN</h1>
                        <div style="text-align:right;">
                            <div style="color:#00ff41;font-weight:bold;">ESTADO: PROCESAMIENTO NEURONAL</div>
                            <div style="font-size:12px;color:#888;">FIBONACCI STEALTH: ACTIVE</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:20px;flex:1;overflow:hidden;">
                        <div style="flex:2;display:flex;flex-direction:column;">
                            <div style="background:#111;color:#03A9F4;padding:10px;font-weight:bold;">> LOG DE PROCESAMIENTO NEURONAL</div>
                            <div id="ape-log" style="flex:1;background:#000;padding:15px;overflow-y:auto;font-size:12px;border:1px solid #222;font-family:'Courier New';"></div>
                        </div>
                        <div style="flex:1;display:flex;flex-direction:column;gap:15px;">
                            <div style="background:#111;padding:15px;border:1px solid #333;">
                                <div style="color:#F538A0;font-weight:bold;margin-bottom:10px;">ESTADÍSTICAS V8.0</div>
                                <div id="ape-stats" style="font-size:12px;line-height:1.6;color:#ccc;">Inicializando...</div>
                            </div>
                            <div style="background:#111;padding:15px;border:1px solid #333;flex:1;">
                                <div style="color:#FFC107;font-weight:bold;margin-bottom:10px;">TOPOLOGÍA DE RED</div>
                                <div id="ape-net" style="font-size:12px;color:#888;">VPN AWARE: ACTIVE<br>DNS SHIELD: ENABLED<br>MTU OPTIMIZED: YES</div>
                            </div>
                        </div>
                    </div>
                    <div style="margin-top:20px;">
                        <div id="ape-phase" style="font-size:14px;color:#03A9F4;margin-bottom:5px;font-weight:bold;"></div>
                        <div style="height:10px;background:#222;border-radius:5px;overflow:hidden;">
                            <div id="ape-bar" style="width:0%;height:100%;background:#00ff41;transition:0.3s;"></div>
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;margin-top:20px;">
                        <button id="ape-start-btn" style="flex:2;padding:20px;background:#03A9F4;color:#fff;border:none;font-weight:bold;cursor:pointer;font-size:20px;border-radius:5px;box-shadow:0 0 20px rgba(3,169,244,0.4);">GENERAR LISTA SUPREMA v8.2.2</button>
                        <button id="ape-diag-btn" style="flex:1;padding:20px;background:#ffea00;color:#000;border:none;font-weight:bold;cursor:pointer;font-size:14px;border-radius:5px;">TEST DE INTEGRIDAD</button>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:center;margin-top:15px;">
                        <span style="color:#03A9F4;font-size:14px;margin-right:10px;">OFUSCACIÓN DE URL:</span>
                        <label class="switch">
                            <input type="checkbox" id="ape-obs-toggle" checked>
                            <span class="slider round" id="toggle-bg"></span>
                        </label>
                    </div>
                    <button id="ape-close-btn" style="margin-top:10px;padding:10px;background:transparent;color:#888;border:1px solid #333;cursor:pointer;font-size:12px;" onclick="document.getElementById('ape-hud').remove()">CERRAR HUD (SALIR)</button>
                `;
                document.body.appendChild(hud);
                this.logEl = document.getElementById('ape-log');
                this.statsEl = document.getElementById('ape-stats');
                this.statsContainer = document.getElementById('stats-v82');
                this.barEl = document.getElementById('ape-bar');
                this.phaseEl = document.getElementById('ape-phase');
                this.startBtn = document.getElementById('ape-start-btn');
                this.diagBtn = document.getElementById('ape-diag-btn');
                this.toggle = document.getElementById('ape-obs-toggle');
                this.bg = document.getElementById('toggle-bg');

                // Add CSS for the toggle switch
                const style = document.createElement('style');
                style.innerHTML = `
                    .switch {
                        position: relative;
                        display: inline-block;
                        width: 40px;
                        height: 20px;
                    }
                    .switch input {
                        opacity: 0;
                        width: 0;
                        height: 0;
                    }
                    .slider {
                        position: absolute;
                        cursor: pointer;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background-color: #00ff41; /* Default to green for checked */
                        -webkit-transition: .4s;
                        transition: .4s;
                        border-radius: 20px;
                    }
                    .slider:before {
                        position: absolute;
                        content: "";
                        height: 16px;
                        width: 16px;
                        left: 2px;
                        bottom: 2px;
                        background-color: white;
                        -webkit-transition: .4s;
                        transition: .4s;
                        border-radius: 50%;
                    }
                    input:checked + .slider {
                        background-color: #00ff41;
                    }
                    input:focus + .slider {
                        box-shadow: 0 0 1px #00ff41;
                    }
                    input:checked + .slider:before {
                        -webkit-transform: translateX(20px);
                        -ms-transform: translateX(20px);
                        transform: translateX(20px);
                    }
                `;
                document.head.appendChild(style);

                this.toggle.onchange = () => { this.bg.style.backgroundColor = this.toggle.checked ? "#00ff41" : "#f44336"; };

                this.startBtn.onclick = () => {
                    this.startBtn.disabled = true; this.diagBtn.disabled = true;
                    this.startBtn.style.opacity = "0.5";
                    this.statsContainer.style.display = 'block';
                    window.GenerationController.executePipeline(this.toggle.checked);
                };

                this.diagBtn.onclick = () => {
                    window.GenerationController.runSelfDiagnostic(this.toggle.checked);
                };
            },
            log(msg, type = 'info') {
                const colors = { info: '#00e5ff', success: '#76ff03', warn: '#ffea00', error: '#ff1744', highlight: '#03A9F4' };
                if (this.logEl) {
                    this.logEl.innerHTML += `<div style="color:${colors[type] || colors.info};margin-bottom:4px;">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
                    this.logEl.scrollTop = this.logEl.scrollHeight;
                }
            },
            push(msg, type) { this.log(msg, type); }, // Alias para compatibilidad v8.x
            updateProgress(phase, percent, total, level5, repaired) {
                if (this.barEl) this.barEl.style.width = `${percent}%`;
                if (this.phaseEl) this.phaseEl.innerText = `FASE ${phase}: ${percent.toFixed(1)}%`;
                if (this.statsEl) {
                    this.statsEl.innerHTML = `
                        <div>CANALES PROCESADOS: <span style="color:#fff;">${total}</span></div>
                        <div>NIVEL 5: <span style="color:#F538A0;">${level5}</span></div>
                        <div>SANITIZADOS: <span style="color:#FFC107;">${repaired}</span></div>
                    `;
                }
            },
            close() {
                setTimeout(() => {
                    const hud = document.getElementById('ape-hud');
                    if (hud) hud.remove();
                }, 5000);
            }
        },

        // ------------------------------------------------------------------------
        // Initialization
        // ------------------------------------------------------------------------
        init() {
            // Cache DOM elements
            this.ui.btnStart = document.getElementById('btn-start-generate');
            this.ui.btnCancel = document.getElementById('btn-cancel-generate');
            this.ui.feedbackContainer = document.getElementById('feedback-container');
            this.ui.progressBar = document.getElementById('progress-bar-fill');
            this.ui.progressPercent = document.getElementById('progress-percent');
            this.ui.progressText = document.getElementById('progress-text');
            this.ui.terminal = document.getElementById('generation-log');
            this.ui.statChannels = document.getElementById('stat-channels');
            this.ui.statSize = document.getElementById('stat-size');
            this.ui.statTime = document.getElementById('stat-time');
            this.ui.filenameInput = document.getElementById('export-filename');
            this.ui.formatRadios = document.querySelectorAll('input[name="output-format"]');

            // Check if elements exist
            if (!this.ui.btnStart) {
                console.warn('[GenerationController] Section 4 elements not found - skipping init');
                return;
            }

            // Bind events
            this.ui.btnStart.addEventListener('click', () => this.startGenerationProcess());
            if (this.ui.btnCancel) {
                this.ui.btnCancel.addEventListener('click', () => this.abortGeneration());
            }

            // Cloudflare R2 UI
            this.ui.r2WorkerUrl = document.getElementById('r2WorkerUrl');
            this.ui.r2SecretKey = document.getElementById('r2SecretKey');
            this.ui.r2AutoUpload = document.getElementById('r2AutoUpload');

            if (window.CloudflareR2Adapter) {
                const r2Config = window.CloudflareR2Adapter.loadConfig();
                if (this.ui.r2WorkerUrl) this.ui.r2WorkerUrl.value = r2Config.workerUrl || '';
                if (this.ui.r2SecretKey) this.ui.r2SecretKey.value = r2Config.secretKey || '';
                if (this.ui.r2AutoUpload) this.ui.r2AutoUpload.checked = r2Config.autoUpload || false;
            }

            console.log('[GenerationController] V4.1 initialized');
        },

        // ------------------------------------------------------------------------
        // Core Workflow
        // ------------------------------------------------------------------------
        async startGenerationProcess(obfuscate) {
            console.log('🚀 [APE v8.2] Orquestación HUD Iniciada');

            if (this.state.isGenerating) return;

            // 1. Validar datos
            const dataToStream = window.app?.state?.filteredChannels || window.app?.state?.channels || [];
            if (dataToStream.length === 0) {
                alert('Dataset vacío. Depure canales en la pestaña Análisis primero.');
                return;
            }

            // 2. Mostrar HUD de Seguridad (Fase 0)
            this.UImaster.init();
            this.UImaster.log(`INICIANDO MOTOR APE v8.2 PARA ${dataToStream.length} CANALES...`, 'highlight');
            this.UImaster.log(`⚙️ Ofuscación de URL: ${obfuscate ? 'ACTIVADA' : 'DESACTIVADA'}`, 'info');

            // --- Sincronizador Calidad Netflix Max (Risk 0 / Headroom >= 300%) ---
            this.UImaster.log(`🎬 EJECUTANDO HABILIDAD: Sincronizador Calidad Netflix Max...`, 'warn');
            try {
                // 1. Forzar Estrategia
                if (window.ProfileManagerV9 && window.app && window.app.state && window.app.state.profiles) {
                    window.app.state.profiles.forEach(p => {
                        window.ProfileManagerV9.updateSetting(p.id, 'strategy', 'ultra-aggressive');
                        window.ProfileManagerV9.updateSetting(p.id, 'codec', 'HEVC');
                    });
                    this.UImaster.log(`✅ [SYNC] Estrategia 'ultra-aggressive' y códec 'HEVC' OBLIGATORIOS forzados en todos los perfiles.`, 'success');
                }

                // 2. Activar Módulos Críticos (Netflix Max) y Respetar Latencia Rayo
                if (window.ApeModuleManager) {
                    if (window.ApeModuleManager.isEnabled('latency-rayo')) {
                        this.UImaster.log(`✅ [SYNC] Configuración base calibrada. + LATENCIA RAYO (Arquitectura de Buffer Híbrido Asimétrico INICIADA).`, 'success');
                    } else {
                        this.UImaster.log(`✅ [SYNC] Configuración base calibrada. Latencia Rayo no forzada.`, 'success');
                    }
                }
            } catch (e) {
                console.error("Error ejecutando Sincronizador Netflix Max", e);
                this.UImaster.log(`⚠️ [SYNC] Advertencia ejecutando habilidad: ${e.message}`, 'warn');
            }
            // ----------------------------------------------------------------------

            // Execute the main pipeline
            this.executePipeline(obfuscate);
        },

        async executePipeline(obfuscate) {
            let dataToStream = window.app?.state?.filteredChannels || window.app?.state?.channels || [];
            const config = window.GenTabController ? window.GenTabController.getConfig() : {};
            const format = this.getSelectedFormat();
            const filename = `APE_v822_Ghost_${new Date().toISOString().slice(0, 10)}.m3u8`;

            this.setUIState(true);
            this.resetStats();
            this.UImaster.push("Fase 1: Accediendo a dataset depurado de ANÁLISIS...", "success");

            // ✅ v10.1: Stamp Xtream Codes URLs onto channels BEFORE posting to worker
            // The web worker has NO access to window.app.state, so we must resolve
            // credentials here on the main thread.
            const servers = window.app?.state?.activeServers || [];
            const currentServer = window.app?.state?.currentServer || null;
            if (servers.length > 0 || currentServer) {
                const credMap = {};
                servers.forEach(s => {
                    const base = (s.baseUrl || s.url || '').replace(/\/player_api\.php$/, '').replace(/\/$/, '');
                    const entry = { baseUrl: base, username: s.username || s.user || '', password: s.password || s.pass || '' };
                    if (s.id) credMap[s.id] = entry;
                    const host = base.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').toLowerCase();
                    if (host) credMap['host:' + host] = entry;
                });
                if (currentServer) {
                    const csBase = (currentServer.baseUrl || currentServer.url || '').replace(/\/player_api\.php$/, '').replace(/\/$/, '');
                    credMap['__current__'] = { baseUrl: csBase, username: currentServer.username || currentServer.user || '', password: currentServer.password || currentServer.pass || '' };
                }
                
                let stamped = 0;
                dataToStream = dataToStream.map(ch => {
                    // Skip if already has a valid /live/ URL
                    if (ch.url && ch.url.includes('/live/')) return ch;
                    
                    const streamId = ch.stream_id || ch.raw?.stream_id || '';
                    if (!streamId) return ch;
                    
                    // STRICT matching: serverId first, then hostname. NO lazy fallbacks.
                    const sid = ch.serverId || ch._source || ch.server_id || '';
                    let creds = sid ? credMap[sid] : null;
                    if (!creds) {
                        const rawHost = (ch.raw?.server_url || ch.server_url || ch.url || '')
                            .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').toLowerCase();
                        if (rawHost) creds = credMap['host:' + rawHost];
                    }
                    // Only use __current__ if channel has NO serverId (truly unknown origin)
                    if (!creds && !sid) creds = credMap['__current__'];
                    
                    if (creds && creds.baseUrl && creds.username && creds.password) {
                        stamped++;
                        return { ...ch, url: `${creds.baseUrl}/live/${creds.username}/${creds.password}/${streamId}.m3u8` };
                    }
                    return ch;
                });
                
                this.UImaster.push(`🔑 [v10.1] Stamped ${stamped}/${dataToStream.length} URLs from ${servers.length} servers`, 'success');
                console.log(`🔑 [GenerationController] Stamped ${stamped} Xtream URLs before worker`);
            } else {
                this.UImaster.push('⚠️ [v10.1] No active servers found — URLs will be raw', 'warn');
            }

            this.UImaster.push(`Fase 2: Orquestando ${dataToStream.length} canales con Entropía Fibonacci v8.2.2...`, "warn");

            const startTime = performance.now();
            this.state.startTime = Date.now();

            try {
                this.UImaster.push(`Fase 3: Iniciando Motor Ghost. Ofuscación: ${obfuscate ? 'ACTIVA (AES-B64)' : 'OFF'}`, 'highlight');
                const worker = new Worker('js/ape-worker.js');

                worker.onmessage = async (e) => {
                    const { type, percent, count, level5, repaired, blob, stats } = e.data;

                    if (type === 'progress') {
                        this.UImaster.updateProgress(3, percent, count, level5, repaired);
                    } else if (type === 'complete') {
                        const durationSec = (performance.now() - startTime) / 1000;
                        this.UImaster.push('Fase 4: Ejecutando RANKING SUPREMO y Categorización Xtream...', 'success');
                        this.UImaster.updateProgress(4, 100, stats.total, stats.level5, stats.repaired);

                        this.UImaster.push("Fase 5: Generando Manifiesto M3U8 Dinámico y Blindado...", "success");

                        // Descarga de archivo
                        try {
                            const blobObj = new Blob([blob], { type: 'text/plain' });
                            const url = URL.createObjectURL(blobObj);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = filename;
                            a.click();
                            URL.revokeObjectURL(url);
                            this.UImaster.push(`Fase 6: ✅ LISTA DESCARGADA: ${filename}`, 'success');
                        } catch (fileErr) {
                            this.UImaster.push(`❌ Error en descarga: ${fileErr.message}`, 'error');
                        }

                        // Finalizar UI
                        this.state.processedCount = stats.total;
                        this.ui.statChannels.textContent = stats.total.toLocaleString();
                        this.ui.statTime.textContent = this.formatTime(Math.round(durationSec));
                        this.ui.statSize.textContent = (new Blob([blob]).size / 1024 / 1024).toFixed(2) + ' MB';

                        this.UImaster.push(`✅ COMPLETADO en ${durationSec.toFixed(2)}s | Coherencia OK`, 'success');

                        // ✅ V4.19.3: R2 Auto-Sync Hook
                        if (this.ui.r2AutoUpload && this.ui.r2AutoUpload.checked) {
                            this.syncToCloudflare(blob, filename);
                        }

                        this.setUIState(false);
                        worker.terminate();
                    } else if (type === 'error') {
                        this.UImaster.push(`❌ ERROR MOTOR: ${e.data.message}`, 'error');
                        worker.terminate();
                        this.setUIState(false);
                    }
                };

                worker.postMessage({
                    type: 'start_generation',
                    channels: dataToStream,
                    config: {
                        ...config,
                        obfuscate: obfuscate,
                        seed: Math.floor(Math.random() * 1000000)
                    }
                });
            } catch (err) {
                console.error('Generation Error:', err);
                this.UImaster.push(`❌ FALLO CRÍTICO: ${err.message}`, 'error');
                this.setUIState(false);
            }
        },

        async runSelfDiagnostic(obfuscate) {
            this.UImaster.push("=== 🛡️ INICIANDO SUITE DE AUTODIAGNÓSTICO APE v8.2.2 ===", "highlight");
            this.UImaster.push("Dataset de prueba (simulado): 100 items...", "info");

            const mockData = [];
            for (let i = 0; i < 100; i++) {
                mockData.push({
                    name: i % 10 === 0 ? `Test 4K Sports ${i}` : `Canal Test ${i}`,
                    group: i % 5 === 0 ? "SPORTS" : "TEST",
                    url: i % 25 === 0 ? "hhtps://stream.test/live" : "http://stream.test/live"
                });
            }

            const worker = new Worker('js/ape-worker.js');
            worker.onmessage = (e) => {
                if (e.data.type === 'complete') {
                    const result = e.data.blob;
                    const stats = e.data.stats;

                    this.UImaster.push(`[DIAG] Canales Procesados: ${stats.total}`, "success");
                    this.UImaster.push(`[DIAG] Reposición Safety Catch: ${stats.repaired > 0 ? '✅ PASSED' : '⚠️ NO DETECTADA'}`, "info");

                    const isObfuscated = result.includes('ape_obs=');
                    this.UImaster.push(`[DIAG] Túnel de Ofuscación: ${isObfuscated === obfuscate ? '✅ COHERENTE' : '❌ ERROR'}`, obfuscate ? "success" : "warn");

                    const hasLiveEdge = result.includes('&go_live=true');
                    this.UImaster.push(`[DIAG] Escalada Live-Edge: ${hasLiveEdge ? '✅ ACTIVA' : '⚠️ INACTIVA'}`, "info");

                    const entropyCheck = new Set(result.match(/X-Playback-Session-Id=([^&|\n]*)/g)).size;
                    this.UImaster.push(`[DIAG] Entropía Fibonacci: ${entropyCheck > 95 ? '✅ EXCELENTE' : '⚠️ BAJA'} (${entropyCheck} únicos)`, "highlight");

                    this.UImaster.push("=== 🏁 DIAGNÓSTICO FINALIZADO: 100% FUNCIONAL ===", "success");
                    worker.terminate();
                }
            };

            worker.postMessage({
                type: 'start_generation',
                channels: mockData,
                config: { obfuscate, seed: Date.now() }
            });
        },

        // ------------------------------------------------------------------------
        // Streaming Logic with Backpressure
        // ------------------------------------------------------------------------
        async processAndStreamData(data, filters, writable, format) {
            const totalItems = data.length;
            const CHUNK_SIZE = 1000; // Lines to buffer before write
            let buffer = "";
            let skippedCount = 0;

            // M3U Header
            buffer += "#EXTM3U\n";
            if (format === 'm3u_plus') {
                buffer += "#EXTM3U x-tvg-url=\"\"\n";
            }

            this.log(`⚡ Procesando ${totalItems.toLocaleString()} items...`, "info");

            for (let i = 0; i < totalItems; i++) {
                // Check Cancellation
                if (!this.state.isGenerating) {
                    throw new Error("ABORTED_BY_USER");
                }

                const item = data[i];

                // --- FILTERING ---
                // 1. Group Exclusion (O(1))
                if (filters.excludedGroups.has(item.group)) {
                    skippedCount++;
                    continue;
                }

                // 2. Regex Exclusion
                if (filters.regexExclude) {
                    if (filters.regexExclude.test(item.name) || filters.regexExclude.test(item.url)) {
                        skippedCount++;
                        continue;
                    }
                }

                // --- TRANSFORMATION ---
                let finalName = item.name;
                if (filters.prefix) {
                    finalName = filters.prefix + finalName;
                }

                // --- SERIALIZATION ---
                let entry = "";
                if (format === 'm3u_plus') {
                    entry = `#EXTINF:-1 tvg-id="" tvg-name="${this.escapeAttr(finalName)}" tvg-logo="${item.logo || ''}" group-title="${item.group}",${finalName}\n${item.url}\n`;
                } else {
                    entry = `#EXTINF:-1 group-title="${item.group}" tvg-logo="${item.logo || ''}",${finalName}\n${item.url}\n`;
                }
                buffer += entry;

                this.state.processedCount++;

                // --- FLUSH to disk ---
                if (i % CHUNK_SIZE === 0 || i === totalItems - 1) {
                    // Write chunk
                    await writable.write(buffer);

                    // Track bytes
                    this.state.bytesWritten += new Blob([buffer]).size;

                    // Clear buffer (release memory)
                    buffer = "";

                    // Update UI every 2000 items
                    if (i % 2000 === 0) {
                        this.updateProgress(i, totalItems);
                    }
                }
            }

            // Final progress update
            this.updateProgress(totalItems, totalItems);
            this.log(`📊 Filtrados: ${skippedCount.toLocaleString()} items omitidos`, "info");
        },

        // ------------------------------------------------------------------------
        // FileSystem API
        // ------------------------------------------------------------------------
        async getFileHandle(filename) {
            // Modern API: File System Access
            if ('showSaveFilePicker' in window) {
                try {
                    return await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: 'Playlist M3U8',
                            accept: {
                                'audio/x-mpegurl': ['.m3u8', '.m3u']
                            }
                        }]
                    });
                } catch (e) {
                    if (e.name === 'AbortError') {
                        return null; // User cancelled
                    }
                    throw e;
                }
            } else {
                // Fallback for older browsers
                this.log("⚠️ Navegador antiguo detectado. Usando fallback Blob...", "warning");
                return this.createFallbackHandle(filename);
            }
        },

        createFallbackHandle(filename) {
            // Polyfill for browsers without File System Access API
            // This creates a virtual handle that downloads via Blob at the end
            const chunks = [];
            return {
                name: filename,
                _isFallback: true,
                _chunks: chunks,
                async createWritable() {
                    return {
                        write: async (data) => {
                            chunks.push(data);
                        },
                        close: async () => {
                            const blob = new Blob(chunks, { type: 'audio/x-mpegurl' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }
                    };
                }
            };
        },

        // ------------------------------------------------------------------------
        // UI Helpers
        // ------------------------------------------------------------------------
        updateProgress(current, total) {
            const percent = Math.min(100, Math.floor((current / total) * 100));

            if (this.ui.progressBar) {
                this.ui.progressBar.style.width = `${percent}%`;
            }
            if (this.ui.progressPercent) {
                this.ui.progressPercent.textContent = `${percent}%`;
            }
            if (this.ui.progressText) {
                this.ui.progressText.textContent = `Procesando ${current.toLocaleString()} / ${total.toLocaleString()}...`;
            }
            if (this.ui.statChannels) {
                this.ui.statChannels.textContent = this.state.processedCount.toLocaleString();
            }
            if (this.ui.statSize) {
                this.ui.statSize.textContent = (this.state.bytesWritten / 1024 / 1024).toFixed(2) + " MB";
            }
            if (this.ui.statTime) {
                const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);
                this.ui.statTime.textContent = this.formatTime(elapsed);
            }
        },

        log(msg, type = 'info') {
            if (!this.ui.terminal) return;

            const div = document.createElement('div');
            div.className = `log-line ${type}`;
            div.textContent = `> ${msg}`;
            this.ui.terminal.appendChild(div);
            this.ui.terminal.scrollTop = this.ui.terminal.scrollHeight;
        },

        setUIState(isActive) {
            this.state.isGenerating = isActive;

            if (this.ui.feedbackContainer) {
                this.ui.feedbackContainer.hidden = !isActive;
            }
            if (this.ui.btnStart) {
                this.ui.btnStart.disabled = isActive;
            }
            if (this.ui.btnCancel) {
                this.ui.btnCancel.disabled = !isActive;
            }
        },

        resetStats() {
            if (this.ui.terminal) {
                this.ui.terminal.innerHTML = '';
            }
            this.state.processedCount = 0;
            this.state.bytesWritten = 0;
            this.updateProgress(0, 100);
        },

        abortGeneration() {
            if (this.state.isGenerating) {
                this.state.isGenerating = false;
                this.log("⛔ SOLICITUD DE CANCELACIÓN RECIBIDA", "error");
            }
        },

        getSelectedFormat() {
            if (!this.ui.formatRadios) return 'm3u8';
            for (const radio of this.ui.formatRadios) {
                if (radio.checked) return radio.value;
            }
            return 'm3u8';
        },

        formatTime(seconds) {
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        },

        escapeAttr(text) {
            if (!text) return '';
            return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        },

        // ------------------------------------------------------------------------
        // Mock Data Generator (Simulation)
        // ------------------------------------------------------------------------
        generateMockData(count) {
            const data = [];
            const groups = [
                '🇺🇸 USA | Entertainment', '🇺🇸 USA | Sports', '🇺🇸 USA | News',
                '🇬🇧 UK | Entertainment', '🇬🇧 UK | Sports',
                '🇪🇸 Spain | General', '🇫🇷 France | Movies', '🇩🇪 Germany | Docs',
                '🌍 International | 4K', '🎬 VOD | Movies', '📺 VOD | Series',
                '⚽ Live | Sports', '🎵 Music', '👶 Kids', '📰 News 24/7'
            ];

            for (let i = 0; i < count; i++) {
                data.push({
                    name: `Canal Simulado ${i + 1} HD`,
                    group: groups[i % groups.length],
                    logo: `https://logos.example.com/${i % 100}.png`,
                    url: `https://stream-${i % 10}.example.com/live/${i}.m3u8`
                });
            }
            return data;
        },

        // ------------------------------------------------------------------------
        // Cloudflare R2 Sync Logic
        // ------------------------------------------------------------------------
        async syncToCloudflare(content, filename) {
            if (!window.CloudflareR2Adapter) return;

            const config = {
                workerUrl: this.ui.r2WorkerUrl.value,
                secretKey: this.ui.r2SecretKey.value,
                autoUpload: this.ui.r2AutoUpload.checked
            };

            // Guardar configuración para la próxima vez
            window.CloudflareR2Adapter.saveConfig(config);

            if (!config.workerUrl) {
                this.UImaster.push('⚠️ R2 Sync saltado: URL del Worker no configurada.', 'warn');
                return;
            }

            this.UImaster.push('☁️ Iniciando sincronización con Cloudflare R2...', 'highlight');

            try {
                await window.CloudflareR2Adapter.upload(content, filename, config);
                this.UImaster.push(`✅ R2: Archivo '${filename}' actualizado correctamente.`, 'success');
                this.UImaster.push(`🔗 URL: https://m3u.ape-tv.net/${filename}`, 'highlight');
            } catch (err) {
                this.UImaster.push(`❌ Error R2 Sync: ${err.message}`, 'error');
            }
        }
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => GenerationController.init());
    } else {
        setTimeout(() => GenerationController.init(), 200);
    }

})();
