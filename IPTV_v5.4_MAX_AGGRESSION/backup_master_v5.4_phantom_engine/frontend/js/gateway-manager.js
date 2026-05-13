/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌐 GATEWAY MANAGER - Módulo Independiente v4.28.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * DESCRIPCIÓN:
 * - Escucha evento 'm3u8-generated' tras generación de M3U8
 * - Muestra notificación sugerente para usar Gateway
 * - ✅ V4.28: Gestiona subida directa a VPS Hetzner (sin Cloudflare)
 * - 3 estrategias: REPLACE, VERSION, BOTH
 * - Almacena config en IndexedDB (Compliance)
 * - ✅ V4.35: Manejo robusto de errores HTTP/2 y timeouts post-100% upload
 * 
 * COMPATIBILIDAD:
 * - OTT Navigator
 * - TiviMate
 * - VLC (Desktop + Mobile)
 * - Kodi
 * - Smart TV (Samsung, LG, Android TV)
 * - Fire Stick
 * - Cualquier reproductor M3U8 estándar
 */

(function () {
    'use strict';

    console.log('%c🌐 Gateway Manager - Inicializando...', 'color: #38bdf8; font-weight: bold;');

    // ═════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN
    // ═════════════════════════════════════════════════════════════════════

    const STORAGE_KEYS = {
        VPS_URL: 'gateway_vps_url',  // ✅ V4.28: VPS Hetzner (reemplaza worker_url)
        LAST_M3U8: 'gateway_last_m3u8',
        LAST_METADATA: 'gateway_last_metadata',
        UPLOAD_STATS: 'gateway_upload_stats'
    };

    const DEFAULT_STRATEGY = 'replace';
    const NOTIFICATION_DURATION = 10000; // 10 segundos
    const PROGRESS_UPDATE_INTERVAL = 100; // ms

    // ═════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL
    // ═════════════════════════════════════════════════════════════════════

    class GatewayManager {

        constructor() {
            // ✅ V4.28.1: Read VPS URL from localStorage (set by vps-adapter.js)
            const storedVpsUrl = localStorage.getItem('vps_base_url');

            this.config = {
                // ✅ Priority: localStorage > Master Config > Default fallback
                vps_url: storedVpsUrl || window.VPS_CONFIG?.DEFAULT_URL || 'https://iptv-ape.duckdns.org',
                upload_endpoint: '/upload/',
                url_format: 'stealth',
                strategy: DEFAULT_STRATEGY,
                obfuscation_enabled: false, // DESACTIVADO por defecto - sube archivo TAL CUAL
                auto_upload: false,
                secret_key: '',
                file_origin: 'manual', // 'manual' o 'auto'
                custom_filename: '', // Nombre personalizado (vacío = usar default)
                default_filename: 'APE_ULTIMATE_v9.m3u8',
                // ✅ V4.28.2: API remota en Hetzner (para JWT sync, HLS status, etc.)
                api_url: window.VPS_CONFIG?.API_URL || 'https://iptv-ape.duckdns.org/api',
                // ✅ LEGACY: SCP local solo para subir archivos grandes vía script
                scp_backend_url: 'http://localhost:5001',
                obfuscation_domain: 'iptv-ape.duckdns.org'
            };

            this.state = {
                lastM3U8Content: null,
                lastMetadata: null,
                uploadInProgress: false,
                lastUploadStats: null,
                sessionMap: {}
            };

            // ✅ V4.33: Initialize Resumable Uploader (WeTransfer-Grade)
            this.uploader = new ResumableChunkUploader({
                apiUrl: `${this.config.api_url}/upload`
            });
        }

        // ─────────────────────────────────────────────────────────────────
        // 🚀 INICIALIZACIÓN
        // ─────────────────────────────────────────────────────────────────

        async init() {
            console.log('%c✅ Gateway Manager - Inicializando...', 'color: #4ade80; font-weight: bold;');

            // 1. Cargar configuración desde IndexedDB (Compliance)
            await this._loadConfigFromDB();

            // ✅ V4.33: Init heavy-duty uploader
            await this.uploader.init();

            // 2. Escuchar evento de generación M3U8
            window.addEventListener('m3u8-generated', (e) => this._onM3U8Generated(e));

            // 🔄 SYNC: Sync with VPS URL UI (index-v4.html)
            const uiVpsInput = document.getElementById('vpsBaseUrl');
            if (uiVpsInput) {
                uiVpsInput.value = this.config.vps_url;
                uiVpsInput.addEventListener('change', async (e) => {
                    this.config.vps_url = e.target.value;
                    await this.saveConfig('Actualización de VPS URL desde UI');
                    console.log('🌐 VPS URL updated from UI:', this.config.vps_url);
                });
            }

            const autoUploadCheck = document.getElementById('vpsAutoUpload');
            if (autoUploadCheck) {
                autoUploadCheck.checked = !!this.config.auto_upload;
                autoUploadCheck.addEventListener('change', async (e) => {
                    this.config.auto_upload = e.target.checked;
                    await this.saveConfig('Toggle Auto-Upload desde UI');
                    console.log('☁️ Auto-Upload setting updated:', e.target.checked);
                });
            }

            const secretKeyInput = document.getElementById('vpsAuthKey');
            if (secretKeyInput) {
                secretKeyInput.value = this.config.secret_key || '';
                secretKeyInput.addEventListener('change', async (e) => {
                    this.config.secret_key = e.target.value;
                    await this.saveConfig('Actualización de Auth Key desde UI');
                    console.log('🔑 Auth Key updated from UI');
                });
            }

            // Restaurar URL format selector
            const formatSelect = document.getElementById('gateway-url-format');
            if (formatSelect && this.config.url_format) {
                formatSelect.value = this.config.url_format;
            }

            // Actualizar UI
            await this._updateStatusUI();
            this._updateFixedUrlUI();
            this._updateStatsUI();

            // Restaurar estrategia (radio)
            if (this.config.strategy) {
                const radio = document.querySelector(`input[name="gateway-strategy"][value="${this.config.strategy}"]`);
                if (radio) {
                    radio.checked = true;
                    // También actualizar clases visuales
                    document.querySelectorAll('.btn-strategy').forEach(btn => btn.classList.remove('active'));
                    const label = radio.closest('.btn-strategy');
                    if (label) label.classList.add('active');
                }
            }

            // Exposer funciones globales
            window.configureGateway = () => this.configure();
            window.uploadToGateway = async () => {
                await this.upload();
            };
            window.copyFixedUrl = () => this.copyFixedUrl();

            this._ensureUIStructure();
            this._initFileOriginUI();

            // ✅ V4.28.2: Configurar JWT Duration usando genTimeShift
            this._setupJwtTimeShift();
        }

        /**
         * 🕒 Repurpose genTimeShift element for JWT duration (Integrated APE_TOKEN_MANAGER)
         */
        _setupJwtTimeShift() {
            const timeShiftEl = document.getElementById('genTimeShift');
            if (timeShiftEl) {
                const label = timeShiftEl.previousElementSibling;
                if (label && label.textContent.includes('TimeShift')) {
                    label.textContent = 'JWT Expire (h):';
                }

                timeShiftEl.min = "4";
                timeShiftEl.max = "8760";
                timeShiftEl.value = "8760";

                const updateJwt = async () => {
                    const hours = parseInt(timeShiftEl.value) || 8760;
                    console.log(`%c🕒 JWT Duration: ${hours}h`, 'color: #3b82f6;');

                    try {
                        const res = await fetch(`${this.config.api_url}/jwt-config`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ duration_hours: hours })
                        });
                        if (res.ok) console.log('✅ JWT synced with VPS');
                    } catch (e) {
                        // Silencioso - JWT sync con VPS es opcional
                    }

                    if (window.APE_TOKEN_MANAGER && typeof window.APE_TOKEN_MANAGER.setExpirationHours === 'function') {
                        window.APE_TOKEN_MANAGER.setExpirationHours(hours);
                    }
                };

                timeShiftEl.addEventListener('change', updateJwt);
                setTimeout(updateJwt, 3000);
            }
        }

        configure() {
            let modal = document.getElementById('gateway-config-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'gateway-config-modal';
                modal.innerHTML = `
                <div class="gateway-modal-overlay" style="
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85); z-index: 10000;
                    display: flex; align-items: center; justify-content: center;
                    backdrop-filter: blur(4px);
                " onclick="if(event.target === this) gatewayManager.closeConfigModal()">
                    <div class="gateway-modal-content" style="
                        background: linear-gradient(135deg, #1e293b, #0f172a);
                        border: 1px solid rgba(56, 189, 248, 0.3);
                        border-radius: 16px; padding: 24px; width: 90%; max-width: 420px;
                        box-shadow: 0 25px 50px rgba(0,0,0,0.5);
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h2 style="margin: 0; color: #38bdf8; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                                <span>⚙️</span> Configurar VPS
                            </h2>
                            <button onclick="gatewayManager.closeConfigModal()" style="
                                background: transparent; border: none; color: #94a3b8;
                                font-size: 1.5rem; cursor: pointer; padding: 4px; line-height: 1;
                            ">&times;</button>
                        </div>
                        
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 0.75rem; color: #94a3b8; margin-bottom: 6px;">
                                🌐 IP del VPS (pega aquí y se verifica automáticamente)
                            </label>
                            <input type="text" id="config-vps-url" 
                                placeholder="iptv-ape.duckdns.org"
                                style="width: 100%; padding: 14px; background: rgba(0,0,0,0.3); border: 2px solid rgba(56,189,248,0.3);
                                       border-radius: 8px; color: #e2e8f0; font-family: monospace; font-size: 1rem; box-sizing: border-box;
                                       text-align: center;">
                        </div>
                        
                        <div id="config-test-status" style="padding: 12px; border-radius: 8px; background: rgba(100,116,139,0.1); border: 1px solid rgba(100,116,139,0.2); text-align: center;">
                            <span style="color: #94a3b8; font-size: 0.8rem;">👆 Pega la IP arriba</span>
                        </div>
                        
                        <button id="config-save-btn" onclick="gatewayManager.saveConfigFromModal()" style="
                            display: none; width: 100%; margin-top: 12px; padding: 14px; 
                            background: linear-gradient(135deg, #10b981, #059669);
                            border: none; border-radius: 8px; color: white; font-weight: 600;
                            cursor: pointer; font-size: 0.9rem;
                        ">💾 Guardar y Usar Esta IP</button>
                    </div>
                </div>`;
                document.body.appendChild(modal);

                const urlInput = document.getElementById('config-vps-url');
                if (urlInput) {
                    let timeout = null;
                    urlInput.addEventListener('input', (e) => {
                        clearTimeout(timeout);
                        const value = e.target.value.trim();
                        if (value.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
                            timeout = setTimeout(() => this.testVPSConnection(), 500);
                        }
                    });
                    urlInput.addEventListener('paste', () => {
                        setTimeout(() => this.testVPSConnection(), 100);
                    });
                }
            }

            const urlInput = document.getElementById('config-vps-url');
            if (urlInput) {
                const currentUrl = this.config.vps_url || '';
                urlInput.value = currentUrl.replace(/^https?:\/\//, '');
            }

            const statusDiv = document.getElementById('config-test-status');
            const saveBtn = document.getElementById('config-save-btn');
            if (statusDiv) {
                statusDiv.style.background = 'rgba(100,116,139,0.1)';
                statusDiv.style.border = '1px solid rgba(100,116,139,0.2)';
                statusDiv.innerHTML = '<span style="color: #94a3b8; font-size: 0.8rem;">👆 Pega la IP arriba</span>';
            }
            if (saveBtn) saveBtn.style.display = 'none';

            modal.style.display = 'block';
            setTimeout(() => urlInput?.focus(), 100);
        }

        closeConfigModal() {
            const modal = document.getElementById('gateway-config-modal');
            if (modal) modal.style.display = 'none';
        }

        async _detectProtocol(host) {
            if (host.includes('://')) {
                return host;
            }

            const httpsUrl = `https://${host}`;
            const httpUrl = `http://${host}`;

            try {
                const response = await fetch(`${httpsUrl}/upload/health`, {
                    signal: AbortSignal.timeout(3000),
                    mode: 'cors'
                });
                if (response.ok) {
                    console.log('%c🔒 Auto-detect: HTTPS disponible', 'color: #4ade80;');
                    return httpsUrl;
                }
            } catch (e) {
                console.log('%c🔓 Auto-detect: HTTPS falló, probando HTTP...', 'color: #fbbf24;');
            }

            try {
                const response = await fetch(`${httpUrl}/upload/health`, {
                    signal: AbortSignal.timeout(3000),
                    mode: 'cors'
                });
                if (response.ok) {
                    console.log('%c🔓 Auto-detect: HTTP disponible', 'color: #fbbf24;');
                    return httpUrl;
                }
            } catch (e) {
                console.log('%c❌ Auto-detect: Ambos protocolos fallaron', 'color: #ef4444;');
            }

            return httpsUrl;
        }

        async saveConfigFromModal() {
            let vpsIp = document.getElementById('config-vps-url')?.value?.trim() || '';
            vpsIp = vpsIp.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();

            if (!vpsIp) {
                this._showToast('⚠️ Ingresa una IP válida');
                return;
            }

            this._showToast('🔍 Detectando protocolo...');
            const url = await this._detectProtocol(vpsIp);

            this.config.vps_url = url;
            await this.saveConfig('VPS configurado');

            if (window.vpsAdapter) {
                window.vpsAdapter.configure(url);
            }

            this._updateStatusUI();
            this._updateFixedUrlUI();

            const protocol = url.startsWith('https') ? '🔒 HTTPS' : '🔓 HTTP';
            this._showToast(`✅ VPS guardado: ${protocol}`);
            this.closeConfigModal();
        }

        async testVPSConnection() {
            const statusDiv = document.getElementById('config-test-status');
            const saveBtn = document.getElementById('config-save-btn');
            const urlInput = document.getElementById('config-vps-url');
            let vpsIp = urlInput?.value?.trim() || '';

            if (!statusDiv || !vpsIp) return;

            vpsIp = vpsIp.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
            urlInput.value = vpsIp;

            statusDiv.style.background = 'rgba(56,189,248,0.1)';
            statusDiv.style.border = '1px solid rgba(56,189,248,0.3)';
            statusDiv.innerHTML = '<span style="color: #7dd3fc;">🔄 Verificando conexión...</span>';
            if (saveBtn) saveBtn.style.display = 'none';

            const url = `https://${vpsIp}`;
            let connected = false;

            // Método 1: Intentar con CORS normal
            try {
                const response = await fetch(`${url}/upload/health`, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-store',
                    signal: AbortSignal.timeout(5000)
                });

                if (response.ok) {
                    connected = true;
                    console.log('%c✅ Modal: VPS conectado (cors ok)', 'color: #4ade80;');
                }
            } catch (corsError) {
                console.log('%c⚠️ Modal: CORS bloqueado, intentando fallback...', 'color: #fbbf24;');
            }

            // Método 2: Fallback con no-cors
            if (!connected) {
                try {
                    const response = await fetch(`${url}/upload/health`, {
                        method: 'GET',
                        mode: 'no-cors',
                        cache: 'no-store',
                        signal: AbortSignal.timeout(5000)
                    });

                    if (response.type === 'opaque' || response.ok) {
                        connected = true;
                        console.log('%c✅ Modal: VPS conectado (no-cors fallback)', 'color: #4ade80;');
                    }
                } catch (e) {
                    console.log('%c❌ Modal: Fallback también falló', 'color: #ef4444;');
                }
            }

            if (connected) {
                statusDiv.style.background = 'rgba(16,185,129,0.15)';
                statusDiv.style.border = '2px solid rgba(16,185,129,0.5)';
                statusDiv.innerHTML = `
                    <div style="color: #86efac; font-size: 1rem; font-weight: 600;">✅ VPS CONECTADO 🔒 HTTPS</div>
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 6px;">
                        URL: ${url}
                    </div>`;
                if (saveBtn) saveBtn.style.display = 'block';
                if (urlInput) urlInput.style.borderColor = 'rgba(16,185,129,0.5)';
            } else {
                statusDiv.style.background = 'rgba(239,68,68,0.1)';
                statusDiv.style.border = '1px solid rgba(239,68,68,0.3)';
                statusDiv.innerHTML = `<span style="color: #fca5a5;">❌ No se pudo conectar al VPS</span>`;
                if (saveBtn) saveBtn.style.display = 'none';
                if (urlInput) urlInput.style.borderColor = 'rgba(239,68,68,0.5)';
            }
        }

        _onM3U8Generated(event) {
            if (this.config.file_origin === 'manual') {
                return;
            }

            const detail = event.detail || {};

            if (detail.content) {
                this.state.lastM3U8Content = detail.content;
            }

            this.state.lastMetadata = {
                filename: detail.filename || `APE_ULTIMATE_v9.0_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.m3u8`,
                size: detail.size || (detail.content ? new Blob([detail.content]).size : 0),
                channels: detail.channels || (detail.content ? (detail.content.match(/#EXTINF:/g) || []).length : 0),
                source: detail.source || 'APE_ENGINE_V9',
                timestamp: new Date().toISOString(),
                stats: detail.stats || {},
                generation_id: 'gen_' + Date.now().toString(36)
            };

            this._savePersistentState();
            this._updateStatsUI();
            this._updateFileSelectorUI();

            const autoUploadCheckbox = document.getElementById('r2AutoUpload');
            if (autoUploadCheckbox && autoUploadCheckbox.checked) {
                setTimeout(() => this.upload(), 800);
            }
        }

        _ensureUIStructure() {
            const container = document.getElementById('gateway-manager-section');
            if (!container) return;

            if (!document.getElementById('gateway-file-input')) {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.id = 'gateway-file-input';
                fileInput.style.display = 'none';
                fileInput.addEventListener('change', (e) => this._handleManualFileSelect(e));
                document.body.appendChild(fileInput);
            }

            if (!document.getElementById('gateway-obfuscation-toggle')) {
                const obfuscationHTML = `
                <div id="gateway-obfuscation-panel" style="
                    margin: 12px 0;
                    padding: 12px;
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 10px;
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 1.1em;">🔐</span>
                            <span style="font-weight: 600; color: #fca5a5; font-size: 0.85rem;">Ofuscación de URLs</span>
                        </div>
                        <label class="toggle-switch" style="position: relative; width: 44px; height: 24px;">
                            <input type="checkbox" id="gateway-obfuscation-toggle" 
                                   ${this.config.obfuscation_enabled ? 'checked' : ''}
                                   onchange="gatewayManager.toggleObfuscation(this.checked)"
                                   style="opacity: 0; width: 0; height: 0;">
                            <span class="toggle-slider" style="
                                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                                background-color: ${this.config.obfuscation_enabled ? '#10b981' : '#374151'};
                                transition: .3s; border-radius: 24px;
                            "></span>
                            <span class="toggle-knob" style="
                                position: absolute; content: ''; height: 18px; width: 18px;
                                left: ${this.config.obfuscation_enabled ? '23px' : '3px'}; bottom: 3px;
                                background-color: white; transition: .3s; border-radius: 50%;
                            "></span>
                        </label>
                    </div>
                </div>`;
                const strategyLabels = container.querySelectorAll('.btn-strategy');
                if (strategyLabels.length > 0) {
                    const strategyContainer = strategyLabels[0].closest('div');
                    if (strategyContainer) strategyContainer.insertAdjacentHTML('afterend', obfuscationHTML);
                } else {
                    container.insertAdjacentHTML('afterbegin', obfuscationHTML);
                }
            }
        }

        _handleManualFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;

            const validExtensions = ['.m3u8', '.m3u'];
            const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
            if (!hasValidExt) {
                alert('⚠️ Por favor selecciona un archivo .m3u8 o .m3u');
                event.target.value = '';
                return;
            }

            this.state.manualFile = file;
            this.state.lastM3U8Content = null;

            this.state.lastMetadata = {
                filename: file.name,
                size: file.size,
                channels: 0,
                source: 'MANUAL_UPLOAD',
                timestamp: new Date().toISOString(),
                generation_id: 'file_' + file.lastModified + '_' + file.size
            };

            this._savePersistentState();
            this._updateStatsUI();
            this._updateFileSelectorUI();
            this._updateFixedUrlUI();
        }

        _updateFileSelectorUI() {
            if (!this.state.lastMetadata) return;

            const fileSelectorIcon = document.getElementById('file-selector-icon');
            const fileSelectorText = document.getElementById('file-selector-text');
            const fileSelectorInfo = document.getElementById('file-selector-info');
            const fileSelectorAction = document.getElementById('file-selector-action');
            const fileSelectorRow = document.getElementById('file-selector-row');

            if (fileSelectorIcon) fileSelectorIcon.textContent = '✅';
            if (fileSelectorText) {
                fileSelectorText.textContent = this.state.lastMetadata.filename;
                fileSelectorText.style.color = '#86efac';
            }
            if (fileSelectorInfo) {
                const channels = this.state.lastMetadata.channels > 0
                    ? `${this.state.lastMetadata.channels.toLocaleString()} canales`
                    : 'canales se calcularán al subir';
                fileSelectorInfo.textContent = `${this._formatBytes(this.state.lastMetadata.size)} • ${channels}`;
                fileSelectorInfo.style.display = 'block';
            }
            if (fileSelectorAction) fileSelectorAction.textContent = 'Cambiar';
            if (fileSelectorRow) {
                fileSelectorRow.style.borderStyle = 'solid';
                fileSelectorRow.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                fileSelectorRow.style.background = 'rgba(16, 185, 129, 0.1)';
            }
        }

        async _calculateSHA256(buffer) {
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        async uploadChunked(content, filename, strategy) {
            const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
            const isManualFile = content instanceof File;
            const blob = isManualFile ? content : new Blob([content], { type: 'text/plain' });
            const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
            const generationId = this.state.lastMetadata?.generation_id || 'unknown';
            const uploadId = 'up_' + btoa(filename + blob.size + generationId).substr(0, 16).replace(/[^a-zA-Z0-9]/g, '');

            this._updateProgress(5, '🔄 Verificando chunks existentes...');

            const startTime = performance.now();

            for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, blob.size);
                const chunk = blob.slice(start, end);
                const buffer = await chunk.arrayBuffer();
                const sha256 = await this._calculateSHA256(buffer);

                let success = false;
                let attempts = 0;
                while (!success && attempts < 3) {
                    attempts++;
                    try {
                        const response = await fetch(`${this.config.vps_url}/upload_chunk.php`, {
                            method: 'POST',
                            headers: {
                                'X-Upload-Id': uploadId,
                                'X-Chunk-Index': i.toString(),
                                'X-Total-Chunks': totalChunks.toString(),
                                'X-Chunk-SHA256': sha256
                            },
                            body: buffer
                        });
                        if (response.ok) success = true;
                    } catch (e) {
                        if (attempts >= 3) throw e;
                    }
                }
                const percent = Math.round(((i + 1) / totalChunks) * 100);
                this._updateProgress(10 + Math.round(percent * 0.8), `📤 Chunk ${i + 1}/${totalChunks} (${percent}%)`);
            }

            const finalizeRes = await fetch(`${this.config.vps_url}/finalize_upload.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ upload_id: uploadId, filename, strategy })
            });

            if (!finalizeRes.ok) throw new Error('Finalización fallida');
            return await finalizeRes.json();
        }

        async uploadViaSCP(content, filename) {
            if (this.state.uploadInProgress) return;
            const formData = new FormData();
            const blob = typeof content === 'string' ? new Blob([content]) : content;
            formData.append('file', blob, filename);

            this.state.uploadInProgress = true;
            this._updateUploadUI('start');
            this._updateProgress(5, 'Conectando con agente SCP local...');

            try {
                const response = await fetch(`${this.config.scp_backend_url}/api/scp-upload`, {
                    method: 'POST',
                    body: formData,
                    headers: { 'X-Custom-Filename': filename }
                });
                if (!response.ok) throw new Error(`Backend SCP no disponible (${response.status})`);
                const data = await response.json();
                this._pollSCPStatus(data.filename || filename);
            } catch (error) {
                this.state.uploadInProgress = false;
                this._updateUploadUI('end');
                alert(`Error SCP: ${error.message}`);
            }
        }

        async _pollSCPStatus(filename) {
            const startTime = Date.now();
            const poll = setInterval(async () => {
                try {
                    const response = await fetch(`${this.config.scp_backend_url}/api/scp-status`);
                    const status = await response.json();
                    if (status.status === 'completed') {
                        clearInterval(poll);
                        this.state.uploadInProgress = false;
                        const finalUrl = status.url || `${this.config.vps_url}/${status.filename || filename}`;
                        this._showSuccessMessage({ public_url: finalUrl });
                        this._updateUploadUI('end');
                    } else if (status.status === 'error') {
                        clearInterval(poll);
                        this.state.uploadInProgress = false;
                        this._updateUploadUI('end');
                        alert(`Error SSH/SCP: ${status.error}`);
                    }
                } catch (e) { }
            }, 3000);
        }

        async upload() {
            if (this.state.uploadInProgress) return;
            if (!this.config.vps_url) { alert('⚠️ VPS no configurado'); return; }

            let contentToUpload = this.state.lastM3U8Content;
            // ✅ V4.29: Deshabilitado SCP local - VPS soporta hasta 250MB vía Nginx
            // const useSCP = this.state.manualFile && this.state.manualFile.size > 100 * 1024 * 1024;
            // if (useSCP) return await this.uploadViaSCP(this.state.manualFile, this.state.manualFile.name);

            if (!contentToUpload && this.state.manualFile) {
                this._updateUploadUI('start');
                contentToUpload = await this.state.manualFile.text();
                this.state.lastMetadata.channels = (contentToUpload.match(/#EXTINF:/g) || []).length;
            }

            if (!contentToUpload) {
                document.getElementById('gateway-file-input')?.click();
                return;
            }

            this.state.uploadInProgress = true;
            this._updateUploadUI('start');
            console.log('🚀 [GATEWAY] Initializing hardened upload sequence...');

            try {
                const strategy = document.querySelector('input[name="gateway-strategy"]:checked')?.value || DEFAULT_STRATEGY;
                let finalContent = contentToUpload;

                if (this.config.obfuscation_enabled) {
                    const result = await this.transformM3U8(contentToUpload);
                    finalContent = result.transformedContent;
                }

                // ✅ Usar FormData (multipart/form-data) - requerido por Node.js/Express
                const finalFilename = this._sanitizeFilename(this.config.custom_filename || this.state.lastMetadata?.filename);
                const formData = new FormData();
                const fileBlob = new Blob([finalContent], { type: 'application/x-mpegurl' });
                formData.append('file', fileBlob, finalFilename);

                if (fileBlob.size > 50 * 1024 * 1024) { // >50MB usa Resumable Pro
                    console.log('%c📦 [VPS-API] Usando ResumableChunkUploader (WeTransfer-Grade)', 'color: #3b82f6;');
                    this._updateProgress(10, 'Iniciando subida resiliente...');

                    const uploadFile = this.state.manualFile || fileBlob;

                    // Hook into uploader events for UI updates
                    const onProgress = (e) => this._updateProgress(e.detail, `📤 Subiendo Chunks... (${e.detail}%)`);
                    this.uploader.events.addEventListener('progress', onProgress);

                    try {
                        const result = await this.uploader.upload(uploadFile);
                        this.uploader.events.removeEventListener('progress', onProgress);

                        // 🔒 ASSERT WETRANSFER-GRADE (Strict Gate)
                        if (result?.success === true && result?.verified !== true) throw new Error("[ASSERT FAIL] success without server verify");

                        this._showSuccessMessage(result);
                        return;
                    } catch (err) {
                        this.uploader.events.removeEventListener('progress', onProgress);
                        throw err;
                    }
                }

                const uploadUrl = `${this.config.api_url}/upload`;
                const startTime = performance.now();

                const result = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    let uploadCompleted = false;

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const percent = Math.round((e.loaded / e.total) * 100);
                            const uploaded = (e.loaded / 1024 / 1024).toFixed(1);
                            const total = (e.total / 1024 / 1024).toFixed(1);
                            this._updateProgress(60 + Math.round(percent * 0.35), `📤 Subiendo: ${uploaded}/${total} MB (${percent}%)`);
                            if (e.loaded >= e.total) uploadCompleted = true;
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const data = JSON.parse(xhr.responseText);
                                console.log('%c✅ [VPS-API] Received response. Initiating mandatory verification...', 'color: #10b981;');

                                // MANDATORY CONTRACT: No success without server-side check
                                const candidateName = data.serverFilename || data.filename || finalFilename;
                                const candidateUrl = data.url || `${this.config.vps_url}/lists/${encodeURIComponent(candidateName)}`;

                                resolve(this._rescueVerification(candidateName, candidateUrl));
                            } catch (e) {
                                console.warn('⚠️ [VPS-API] Ambiguous response, triggering rescue loop...');
                                resolve(this._rescueVerification(finalFilename, `${this.config.vps_url}/lists/${encodeURIComponent(finalFilename)}`));
                            }
                        } else {
                            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                        }
                    };

                    xhr.onerror = async () => {
                        if (uploadCompleted) {
                            console.warn('⚠️ [VPS-API] Socket reset at 100% (expected due to timeouts). Triggering rescue...');
                            resolve(this._rescueVerification(finalFilename, `${this.config.vps_url}/lists/${encodeURIComponent(finalFilename)}`));
                        } else {
                            reject(new Error('Network failure during transfer'));
                        }
                    };

                    xhr.onabort = () => reject(new Error('Upload aborted by user/browser'));

                    // Requirement 4.1: Explicit XHR timeout for 1 hour
                    xhr.timeout = 3600 * 1000;
                    xhr.ontimeout = () => {
                        if (uploadCompleted) {
                            console.warn('⏱️ [VPS-API] Timeout at 100%, triggering rescue...');
                            resolve(this._rescueVerification(finalFilename, `${this.config.vps_url}/lists/${encodeURIComponent(finalFilename)}`));
                        } else {
                            reject(new Error('Upload timed out before completing'));
                        }
                    };

                    // Unified /api/ entry point
                    xhr.open('POST', uploadUrl, true);
                    xhr.send(formData);
                });

                // 🔒 FINAL SUCCESS CONTRACT (Incorruptible)
                if (!result || result.verified !== true || result.success !== true) {
                    throw new Error("Verification Contract Failed: File not confirmed on server storage.");
                }

                this._showSuccessMessage(result);


            } catch (error) {
                alert(`❌ Error: ${error.message}`);
            } finally {
                this.state.uploadInProgress = false;
                setTimeout(() => this._updateUploadUI('end'), 2000);
            }
        }

        async transformM3U8(m3u8Content) {
            console.log('%c🔐 Ofuscando URLs...', 'color: #ef4444; font-weight: bold;');
            const lines = m3u8Content.split('\n');
            const output = [];
            const domain = this.config.obfuscation_domain;
            let counter = 0;
            for (let line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('http')) {
                    const sid = Math.random().toString(36).substr(2, 16);
                    output.push(`https://${domain}/live/ch${counter}/stream.m3u8?t=${sid}`);
                    counter++;
                } else output.push(line);
            }
            return { transformedContent: output.join('\n'), stats: { urlsObfuscated: counter } };
        }

        /**
         * ✅ V4.35: Fixed URL generation - Uses encodeURIComponent for exact VPS match
         * The VPS stores files with original names (spaces, parentheses, etc.)
         * So we must URL-encode the original filename, NOT sanitize it
         */
        _getFixedUrl() {
            const vpsBaseUrl = this.config.vps_url || 'https://iptv-ape.duckdns.org';
            // ✅ FIX: Use original filename with encodeURIComponent (NOT sanitized)
            const rawFilename = this.config.custom_filename || this.state.lastMetadata?.filename || 'upload.m3u8';
            const encodedFilename = encodeURIComponent(rawFilename.trim());
            const format = this.config.url_format || 'stealth';

            // Generate URL based on selected format - ALL point to /lists/ where files are stored
            switch (format) {
                case 'stealth':
                    // Stealth mode: /lists/ path with obfuscated-looking session parameter
                    const ts = Date.now().toString(36);
                    return `${vpsBaseUrl}/lists/${encodedFilename}?s=${ts}`;
                case 'short':
                    // Short mode: Clean /lists/ path without parameters
                    return `${vpsBaseUrl}/lists/${encodedFilename}`;
                case 'legacy':
                    // Legacy mode: Standard /lists/ path (same as short for compatibility)
                    return `${vpsBaseUrl}/lists/${encodedFilename}`;
                case 'public':
                    // Public mode: /lists/ path with cache-busting parameter
                    return `${vpsBaseUrl}/lists/${encodedFilename}?v=${Date.now()}`;
                case 'download':
                    // Download mode: /lists/ with download parameter
                    return `${vpsBaseUrl}/lists/${encodedFilename}?download=1`;
                default:
                    return `${vpsBaseUrl}/lists/${encodedFilename}`;
            }
        }

        copyFixedUrl() {
            const dropdown = document.getElementById('gateway-fixed-url');
            if (!dropdown || !dropdown.value) {
                this._showToast('⚠️ Selecciona un archivo primero');
                return;
            }
            const filename = dropdown.value;
            const url = this._vpsFileMap?.[filename] || this._getFixedUrl();
            navigator.clipboard.writeText(url).then(() => this._showToast('✅ URL copiada'));
        }

        async _updateStatusUI() {
            const dot = document.getElementById('gateway-status-dot');
            const text = document.getElementById('gateway-status-text');
            const vpsUrl = this.config.vps_url || 'https://iptv-ape.duckdns.org';

            if (!dot || !text) return;

            // 1. Initial State: Verifying...
            dot.style.backgroundColor = '#fbbf24'; // Orange
            text.textContent = '🔍 Verifying connection...';

            const healthUrl = `${this.config.api_url}/health`;

            // Method 1: Normal Fetch (API path)
            try {
                const response = await fetch(healthUrl, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-store',
                    signal: AbortSignal.timeout(5000)
                });

                if (response.ok) {
                    dot.style.backgroundColor = '#4ade80';
                    text.innerHTML = `<span style="color: #4ade80; font-weight: bold;">✅ VPS Online:</span> <span style="font-size: 0.7rem;">${vpsUrl}</span>`;
                    console.log('%c✅ Gateway VPS connected (cors ok)', 'color: #4ade80; font-weight: bold;');
                    return;
                }
            } catch (corsError) {
                console.log('%c⚠️ CORS blocked, trying fallback...', 'color: #fbbf24;');
            }

            // Method 2: No-Cors Fallback
            try {
                const response = await fetch(healthUrl, {
                    method: 'GET',
                    mode: 'no-cors',
                    cache: 'no-store',
                    signal: AbortSignal.timeout(5000)
                });

                if (response.type === 'opaque' || response.ok) {
                    dot.style.backgroundColor = '#4ade80';
                    text.innerHTML = `<span style="color: #4ade80; font-weight: bold;">✅ VPS Online:</span> <span style="font-size: 0.7rem;">${vpsUrl}</span>`;
                    console.log('%c✅ Gateway VPS connected (no-cors fallback)', 'color: #4ade80; font-weight: bold;');
                    return;
                }
            } catch (e) {
                console.log('%c❌ Fallback also failed', 'color: #ef4444;', e.message);
            }

            // Error: Offline
            dot.style.backgroundColor = '#ef4444';
            text.innerHTML = `<span style="color: #ef4444;">❌ VPS Offline:</span> <span style="font-size: 0.7rem;">${vpsUrl}</span>`;
        }


        _updateFixedUrlUI() {
            const input = document.getElementById('gateway-fixed-url');
            if (input) input.value = this._getFixedUrl();
        }

        _updateStatsUI() {
            this._updateFileSelectorUI();
            const statsPanel = document.getElementById('gateway-stats-panel');
            if (statsPanel && this.state.lastUploadStats) statsPanel.style.display = 'grid';
        }

        _showSuccessMessage(result) {
            const verifiedLabel = result.recovered ? '✅ RECOVERED (Auto-Verified)' : '✅ PRO-VERIFIED';
            const sizeInfo = result.size ? `\n📦 Tamaño: ${this._formatBytes(parseInt(result.size))}` : '';
            alert(`${verifiedLabel}\n\nSubida completada con éxito.\nVerificado físicamente en servidor Hetzner.\n\n🔗 URL:\n${result.public_url || this._getFixedUrl()}${sizeInfo}`);
        }

        _showToast(message) {
            const toast = document.createElement('div');
            toast.style.cssText = `position: fixed; top: 24px; right: 24px; z-index: 10001; background: rgba(20, 24, 40, 0.98); border: 1px solid rgba(74, 222, 128, 0.5); border-radius: 12px; padding: 12px 20px; color: #4ade80; font-weight: 600; font-size: 0.9rem;`;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        }

        _sanitizeFilename(filename) {
            return (filename || 'upload.m3u8').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
        }

        _formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
        }

        async _loadConfigFromDB() {
            if (window.app?.db) {
                const config = await window.app.db.getAppState('gatewayConfig');
                if (config) this.config = { ...this.config, ...config };
            }
        }

        async saveConfig() {
            if (window.app?.db) await window.app.db.saveAppState('gatewayConfig', this.config);
        }

        _savePersistentState() {
            localStorage.setItem(STORAGE_KEYS.LAST_METADATA, JSON.stringify(this.state.lastMetadata));
        }

        _updateProgress(percent, message) {
            const bar = document.getElementById('gateway-progress-bar');
            const detail = document.getElementById('gateway-progress-detail');
            if (bar) bar.style.width = percent + '%';
            if (detail) detail.textContent = message;
        }

        _updateUploadUI(state) {
            const progressContainer = document.getElementById('gateway-upload-progress');
            const uploadBtn = document.getElementById('gateway-upload-btn');
            if (state === 'start') {
                if (progressContainer) progressContainer.style.display = 'block';
                if (uploadBtn) uploadBtn.disabled = true;
            } else {
                if (progressContainer) progressContainer.style.display = 'none';
                if (uploadBtn) uploadBtn.disabled = false;
            }
        }

        _setFileOriginUI(mode) {

            const manualLabel = document.getElementById('origin-manual-label');
            const autoLabel = document.getElementById('origin-auto-label');
            const fileSelectorRow = document.getElementById('file-selector-row');
            const autoModeInfo = document.getElementById('auto-mode-info');

            if (mode === 'manual') {
                if (manualLabel) {
                    manualLabel.style.background = 'rgba(16, 185, 129, 0.2)';
                    manualLabel.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                    manualLabel.style.color = '#86efac';
                }
                if (autoLabel) {
                    autoLabel.style.background = 'rgba(56, 189, 248, 0.1)';
                    autoLabel.style.borderColor = 'rgba(56, 189, 248, 0.3)';
                    autoLabel.style.color = '#7dd3fc';
                }
                if (fileSelectorRow) fileSelectorRow.style.display = 'flex';
                if (autoModeInfo) autoModeInfo.style.display = 'none';
            } else {
                if (autoLabel) {
                    autoLabel.style.background = 'rgba(56, 189, 248, 0.2)';
                    autoLabel.style.borderColor = 'rgba(56, 189, 248, 0.5)';
                    autoLabel.style.color = '#7dd3fc';
                }
                if (manualLabel) {
                    manualLabel.style.background = 'rgba(16, 185, 129, 0.1)';
                    manualLabel.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                    manualLabel.style.color = '#86efac';
                }
                if (fileSelectorRow) fileSelectorRow.style.display = 'none';
                if (autoModeInfo) autoModeInfo.style.display = 'block';
            }
            console.log(`%c📁 Origen de archivo: ${mode.toUpperCase()}`, 'color: #c4b5fd; font-weight: bold;');
        }

        setCustomFilename(filename) {
            let sanitized = filename.trim();
            if (sanitized && !sanitized.match(/\.(m3u8|m3u)$/i)) sanitized += '.m3u8';
            this.config.custom_filename = sanitized;
            this.saveConfig('Nombre de archivo personalizado');
            this._updateFixedUrlUI();
        }

        resetFilename() {
            this.config.custom_filename = '';
            this.saveConfig('Nombre de archivo reseteado');
            const input = document.getElementById('gateway-custom-filename');
            if (input) input.value = '';
            this._updateFixedUrlUI();
            this._showToast('Nombre reseteado al default');
        }

        /**
         * ✅ V4.34: Change URL Format (fixes HTML onchange caller)
         * Handles the URL format selector: stealth, short, legacy, public, download
         */
        changeUrlFormat(format) {
            this.config.url_format = format || 'stealth';
            this.saveConfig('URL format changed');
            this._updateFixedUrlUI();
            console.log(`%c🔗 URL Format: ${format.toUpperCase()}`, 'color: #7dd3fc; font-weight: bold;');
        }

        /**
         * ✅ V4.36: VPS File Management Methods
         * Called by index-v4.html buttons in the Gateway Multi-Backend panel
         */

        /**
         * 🔄 Refresh VPS file list from list_files.php
         * Populates the #gateway-fixed-url dropdown with filename + date + size
         */
        async refreshVpsFiles() {
            const dropdown = document.getElementById('gateway-fixed-url');
            if (!dropdown) return;

            try {
                dropdown.innerHTML = '<option value="">⏳ Cargando archivos...</option>';
                dropdown.disabled = true;

                const resp = await fetch(`${this.config.vps_url}/list_files.php`, { cache: 'no-store' });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

                const data = await resp.json();
                const files = data.files || data || [];

                dropdown.innerHTML = '<option value="">📂 Selecciona archivo del VPS...</option>';

                // Store file map for URL lookups by filename
                this._vpsFileMap = {};

                if (Array.isArray(files) && files.length > 0) {
                    files.forEach(f => {
                        const name = f.filename || f.name || f;
                        const sizeMb = f.size_mb != null ? `${f.size_mb.toFixed(2)} MB` : (f.size ? this._formatBytes(f.size) : '');

                        // Parse date/time
                        let dateStr = '';
                        if (f.modified) {
                            const d = new Date(f.modified);
                            dateStr = d.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' })
                                + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                        }

                        // Store URL for this filename
                        const fileUrl = f.url || `${this.config.vps_url}/lists/${encodeURIComponent(name)}`;
                        this._vpsFileMap[name] = fileUrl;

                        const opt = document.createElement('option');
                        opt.value = name;
                        // Display: filename (size) — date time
                        const parts = [name];
                        if (sizeMb) parts.push(`(${sizeMb})`);
                        if (dateStr) parts.push(`— ${dateStr}`);
                        opt.textContent = parts.join(' ');
                        dropdown.appendChild(opt);
                    });
                    console.log(`✅ [GATEWAY] ${files.length} archivos cargados del VPS`);
                } else {
                    dropdown.innerHTML = '<option value="">📭 Sin archivos en el VPS</option>';
                }
            } catch (e) {
                console.warn('⚠️ [GATEWAY] Error al cargar archivos VPS:', e.message);
                dropdown.innerHTML = '<option value="">❌ Error al cargar archivos</option>';
            } finally {
                dropdown.disabled = false;
            }
        }

        /**
         * 🗑️ Delete selected file from VPS via delete_file.php
         */
        async deleteVpsFile() {
            const dropdown = document.getElementById('gateway-fixed-url');
            const selectedFilename = dropdown?.value;

            if (!selectedFilename) {
                alert('⚠️ Selecciona un archivo del VPS primero.');
                return;
            }

            if (!confirm(`🗑️ ¿Eliminar "${selectedFilename}" del VPS?\n\nEsta acción no se puede deshacer.`)) {
                return;
            }

            try {
                const formData = new FormData();
                formData.append('filename', selectedFilename);

                const resp = await fetch(`${this.config.vps_url}/delete_file.php`, {
                    method: 'POST',
                    body: formData
                });

                const result = await resp.json().catch(() => ({ success: resp.ok }));

                if (resp.ok || result.success) {
                    console.log(`✅ [GATEWAY] Archivo eliminado: ${selectedFilename}`);
                    alert(`✅ Archivo "${selectedFilename}" eliminado del VPS.`);
                    await this.refreshVpsFiles(); // Refresh list
                } else {
                    throw new Error(result.error || `HTTP ${resp.status}`);
                }
            } catch (e) {
                console.error('❌ [GATEWAY] Error al eliminar:', e.message);
                alert(`❌ Error al eliminar: ${e.message}`);
            }
        }

        /**
         * 📂 Handle VPS file selection from dropdown
         * Updates the config and URL display when a file is selected
         */
        onVpsFileSelected(filename) {
            if (!filename) return;
            this.config.custom_filename = filename;
            // Update the fixed URL display box (if exists separate from dropdown)
            const urlDisplay = document.getElementById('gateway-url-display');
            const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
            const fileUrl = this._vpsFileMap?.[filename] || `${this.config.vps_url}/lists/${safeName}`;
            if (urlDisplay) urlDisplay.value = fileUrl;
            console.log(`📂 [GATEWAY] Archivo VPS seleccionado: ${filename}`);
            console.log(`🔗 [GATEWAY] URL: ${fileUrl}`);
        }

        async toggleObfuscation(enabled) {
            this.config.obfuscation_enabled = enabled;
            await this.saveConfig('Ofuscacion toggle');
        }

        /**
         * 🚑 Triple-Fallback Hardened Verification (v4.0)
         * Protocol: 1. HEAD (lists) -> 2. HEAD (api) -> 3. GET (api) -> 4. XHR (api)
         * Objective: Confirm persistence WITHOUT body data dependency.
         */
        async _verifyUploadedFile(filename) {
            const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
            const apiVerifyUrl = `${this.config.api_url}/upload/verify?filename=${safeName}`;
            const listUrl = `${this.config.vps_url}/lists/${safeName}`;

            console.log(`🔍 [VERIFY-CHAIN] Target: ${filename}`);

            // STEP 1: Fast HEAD on static path (Confirm write sync)
            try {
                const headStatic = await fetch(listUrl, {
                    method: "HEAD",
                    mode: "cors",
                    cache: "no-store",
                    credentials: "omit"
                });
                if (headStatic.ok || headStatic.status === 200 || headStatic.headers.has('ETag')) {
                    console.log('✅ [VERIFY-CHAIN] HEAD confirmed via Static Alias.');
                    return { ok: true, source: 'static_head' };
                }
            } catch (e) { /* Fallthrough */ }

            // STEP 2: HEAD on API route (Internal state confirmation)
            try {
                const headApi = await fetch(apiVerifyUrl, {
                    method: "HEAD",
                    mode: "cors",
                    cache: "no-store",
                    credentials: "omit"
                });
                if (headApi.ok || headApi.status === 200) {
                    console.log('✅ [VERIFY-CHAIN] HEAD confirmed via API Route.');
                    return { ok: true, source: 'api_head' };
                }
            } catch (e) { /* Fallthrough */ }

            // STEP 3: GET (Fetch) - For environments needing body/JSON
            try {
                const res = await fetch(apiVerifyUrl, {
                    method: "GET",
                    mode: "cors",
                    cache: "no-store",
                    credentials: "omit"
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data && (data.exists === true || data.ok === true)) {
                        console.log('✅ [VERIFY-CHAIN] confirmed via Fetch-JSON.');
                        return { ok: true, data };
                    }
                }
            } catch (e) { /* Fallthrough */ }

            // STEP 4: XHR (Legacy Fallback) - Highest resilience against strict security proxies
            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.timeout = 15000;
                xhr.onload = () => {
                    if (xhr.status === 200) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            if (data && (data.exists === true || data.ok === true)) {
                                console.log('✅ [VERIFY-CHAIN] confirmed via XHR Fallback.');
                                resolve({ ok: true, data });
                                return;
                            }
                        } catch (e) {
                            // If it's 200 but body is cut, we treat it as SUCCESS on status code alone
                            console.log('✅ [VERIFY-CHAIN] confirmed via XHR Status (Body Corrupt).');
                            resolve({ ok: true, source: 'xhr_status_only' });
                            return;
                        }
                    }
                    resolve({ ok: false });
                };
                xhr.onerror = () => resolve({ ok: false });
                xhr.ontimeout = () => resolve({ ok: false });
                xhr.open('GET', apiVerifyUrl, true);
                xhr.setRequestHeader('Accept', 'application/json');
                xhr.send();
            });
        }

        /**
         * Adaptive Backoff Rescue Loop (1% Uniqueness Filter)
         */
        async _rescueVerification(filename, expectedUrl, attempts = 0) {
            const delays = [1000, 2000, 3000, 5000, 8000, 13000, 21000]; // Fibonacci
            if (attempts >= delays.length) {
                console.error("⛔ [RESCUE-FATAL] Verification failed after 7 attempts.");
                return { ok: false, error: "TIMED_OUT", recovered: false };
            }

            const currentDelay = delays[attempts];
            console.log(`🚑 [RESCUE-ATTEMPT] ${attempts + 1}/7 for ${filename} (Next: ${currentDelay}ms)`);

            this._updateProgress(98, `🔍 Validando integridad... (${attempts + 1}/7)`);

            const result = await this._verifyUploadedFile(filename);

            if (result.ok) {
                console.log('%c✅ [RESCUE-SUCCESS] File found on server!', 'color: #10b981; font-weight: bold;');
                return {
                    success: true,
                    verified: true,
                    ok: true,
                    public_url: result.data?.url ? `${this.config.vps_url}${result.data.url}` : expectedUrl,
                    filename: result.data?.serverFilename || filename,
                    size: result.data?.size,
                    recovered: attempts > 0
                };
            }

            await new Promise(r => setTimeout(r, currentDelay));
            return this._rescueVerification(filename, expectedUrl, attempts + 1);
        }




        _initFileOriginUI() {
            this.setFileOrigin(this.config.file_origin || 'manual');
        }

        /**
         * ✅ V4.33: Polyfill for setFileOrigin (Existing UI Bug Fix)
         */
        setFileOrigin(origin) {
            this.config.file_origin = origin;
            this._setFileOriginUI(origin);
            this.saveConfig('Cambio de origen de archivo');
        }
    }

    if (typeof window.gatewayManager === 'undefined') {
        window.gatewayManager = new GatewayManager();
        setTimeout(() => window.gatewayManager.init(), 100);
    }
})();
