/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌐 GATEWAY M3U8 INTEGRATED MANAGER v2.0.0 (BULLETPROOF SOP)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SOP STATES:
 * - PRECHECK_FAILED
 * - UPLOAD_IN_PROGRESS
 * - UPLOAD_FINISHED_UNCONFIRMED
 * - VERIFYING
 * - SUCCESS_CONFIRMED
 * - RECOVERED_SUCCESS_CONFIRMED
 * - FAIL_CONFIRMED
 * - BACKEND_VERIFY_UNREACHABLE
 * 
 * REGLA DE ORO: HEAD /lists/{file} es la FUENTE DE VERDAD.
 * NUNCA declarar éxito sin HEAD 200/206.
 * NUNCA declarar fallo sin verificar HEAD primero.
 */

(function () {
    'use strict';

    const CONFIG = {
        vps_url: 'https://iptv-ape.duckdns.org',
        api_url: 'https://iptv-ape.duckdns.org/api',
        endpoints: {
            upload: '/upload.php',
            verify: '/upload/verify',
            health: '/health'
        }
    };

    // Backoff delays for HEAD verification (ms)
    const HEAD_RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000, 16000];

    class GatewayM3U8Integrated {
        constructor() {
            this.state = {
                file: null,
                uploadInProgress: false,
                lastResult: null,
                currentState: 'IDLE'
            };
            console.log('%c🌐 GatewayM3U8Integrated v2.0.0 (BULLETPROOF SOP)', 'color: #3b82f6; font-weight: bold;');
        }

        /**
         * ══════════════════════════════════════════════════════════════════════
         * PRECHECK - OBLIGATORIO antes de subir
         * ══════════════════════════════════════════════════════════════════════
         */
        async _precheck() {
            console.log('🔍 [PRECHECK] Iniciando verificación pre-upload (SOFT-FAIL mode)...');
            let healthOk = false;
            let verifyOk = false;

            // PRECHECK A: Health API (SOFT-FAIL)
            try {
                const healthResp = await fetch(`${CONFIG.api_url}/health`, { cache: 'no-store' });
                if (healthResp.ok) {
                    console.log('✅ [PRECHECK] Health API OK');
                    healthOk = true;
                } else {
                    console.warn('⚠️ [PRECHECK] Health API status:', healthResp.status, '(continuando...)');
                    healthOk = true; // Cualquier respuesta HTTP = servidor accesible
                }
            } catch (e) {
                console.warn('⚠️ [PRECHECK] Health API inaccesible:', e.message, '(SOFT-FAIL, continuando con upload...)');
                // SOFT-FAIL: No bloquear upload por CORS/network intermitente
            }

            // PRECHECK B: Verify endpoint (SOFT-FAIL, pero NO "OK" si es 404 o 5xx)
            try {
                const verifyUrl = `${CONFIG.api_url}${CONFIG.endpoints.verify}?filename=precheck.test`;
                const verifyResp = await fetch(verifyUrl, { cache: 'no-store' });

                // 200/204/400/405 = endpoint vivo
                // 404 = ruta no existe (NO es OK; solo info)
                // 5xx = backend roto (soft-fail)
                if (verifyResp.status === 404) {
                    console.warn('⚠️ [PRECHECK] Verify endpoint NO existe (404). Se omitirá este check.');
                    verifyOk = false;
                } else if (verifyResp.status >= 500) {
                    console.warn('⚠️ [PRECHECK] Verify devolvió 5xx:', verifyResp.status, '(SOFT-FAIL)');
                    verifyOk = false;
                } else {
                    console.log('✅ [PRECHECK] Verify endpoint vivo:', verifyResp.status);
                    verifyOk = true;
                }
            } catch (e) {
                console.warn('⚠️ [PRECHECK] Verify inaccesible:', e.message, '(SOFT-FAIL, continuando...)');
                verifyOk = false;
            }

            // Health es el único check realmente útil
            const ok = !!healthOk;
            if (ok) console.log('✅ [PRECHECK] Health OK. Continuando...');
            else console.warn('⚠️ [PRECHECK] Health no confirmado (SOFT-FAIL). Continuando...');

            return { ok: true, state: 'PRECHECK_OK', healthOk, verifyOk, softFail: !ok };
        }

        /**
         * ══════════════════════════════════════════════════════════════════════
         * VERIFY - HEAD con hinted URL del backend como primera fuente de verdad
         * ══════════════════════════════════════════════════════════════════════
         */
        async _verifyByHead(filename, hintedUrl = null) {
            const candidates = [];

            // 0) Si el backend devolvió una URL, esa es la primera verdad
            if (hintedUrl) {
                candidates.push(hintedUrl);
                console.log(`🔗 [VERIFY] Backend URL hint: ${hintedUrl}`);
            }

            // 1) Ruta principal /lists/ (filename ya sanitizado, sin % encoding)
            candidates.push(`${CONFIG.vps_url}/lists/${filename}`);

            for (const baseUrl of candidates) {
                for (let i = 0; i < HEAD_RETRY_DELAYS.length; i++) {
                    if (i > 0) {
                        console.log(`⏳ [VERIFY] Reintento ${i}/${HEAD_RETRY_DELAYS.length - 1} en ${HEAD_RETRY_DELAYS[i]}ms...`);
                        await this._sleep(HEAD_RETRY_DELAYS[i]);
                    }

                    try {
                        const resp = await fetch(baseUrl, { method: 'HEAD', cache: 'no-store' });
                        console.log(`🔍 [VERIFY] HEAD ${baseUrl} → ${resp.status}`);

                        if (resp.status === 200 || resp.status === 206) {
                            return { ok: true, status: resp.status, source: 'HEAD', url: baseUrl };
                        }

                        if (resp.status === 404) {
                            console.log(`⚠️ [VERIFY] 404 en intento ${i + 1}`);
                            continue; // Reintentar
                        }

                        console.warn(`⚠️ [VERIFY] Status inesperado: ${resp.status}`);

                    } catch (e) {
                        console.warn(`⚠️ [VERIFY] Error en HEAD (${baseUrl}):`, e.message);
                    }
                }
            }

            // Todos los reintentos fallaron
            return { ok: false, status: 404, source: 'HEAD', reason: 'All retries exhausted' };
        }

        /**
         * ══════════════════════════════════════════════════════════════════════
         * UPLOAD - Con estados estrictos del SOP
         * ══════════════════════════════════════════════════════════════════════
         */
        async upload(file) {
            if (!file) return { ok: false, state: 'FAIL_CONFIRMED', error: 'no_file' };
            if (this.state.uploadInProgress) return { ok: false, state: 'FAIL_CONFIRMED', error: 'busy' };

            const gm = window.gatewayManager;
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            const startTime = Date.now();

            console.log(`📦 [UPLOAD] Archivo: ${file.name} (${sizeMB} MB)`);
            console.log(`📦 [UPLOAD] Endpoint: ${CONFIG.api_url}/upload`);

            // ═══════════════════════════════════════════════════════════════════
            // PASO 0: PRECHECK
            // ═══════════════════════════════════════════════════════════════════
            this._setState('PRECHECK');
            if (gm) gm._updateProgress(2, '🔍 Verificando conexión...');

            const precheck = await this._precheck();
            // SOFT-FAIL: Si precheck falla, solo warning, NO bloquear
            if (!precheck.ok || precheck.softFail) {
                console.warn('⚠️ [UPLOAD] PRECHECK soft-fail, continuando con upload...');
                if (gm) gm._updateProgress(3, '⚠️ Precheck parcial, intentando upload...');
            } else {
                if (gm) gm._updateProgress(5, '✅ Precheck OK');
            }

            // ═══════════════════════════════════════════════════════════════════
            // PASO 1: UPLOAD (XHR DIRECTO A UPLOAD.PHP)
            // ═══════════════════════════════════════════════════════════════════
            this.state.uploadInProgress = true;
            this._setState('UPLOAD_IN_PROGRESS');
            if (gm) gm._updateUploadUI('start');
            if (gm) gm._updateProgress(5, '📤 Iniciando subida...');

            let xhrError = null;
            let hintedUrl = null;

            try {
                await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    const formData = new FormData();
                    // Sanitizar nombre: guiones bajos, sin espacios ni paréntesis (REGLA 1 y 2)
                    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
                    formData.append('file', file, safeName);

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const percent = Math.round((e.loaded / e.total) * 100);
                            const uploadedMB = (e.loaded / 1024 / 1024).toFixed(1);
                            if (gm) gm._updateProgress(5 + Math.round(percent * 0.75), `📤 Subiendo: ${uploadedMB}/${sizeMB} MB (${percent}%)`);
                        }
                    };

                    xhr.onload = () => {
                        console.log(`📤 [UPLOAD] XHR onload: status ${xhr.status}`);
                        if (xhr.status >= 500) xhrError = `Backend ${xhr.status}`;

                        // Intentar extraer URL del backend (si la manda)
                        try {
                            const txt = xhr.responseText || '';
                            const data = txt ? JSON.parse(txt) : null;
                            hintedUrl = data?.url || data?.file_url || data?.public_url || null;
                            if (data && data.filename) {
                                file.sanitizedName = data.filename;
                                console.log('📝 [UPLOAD] Sanitized filename:', data.filename);
                            }
                            if (hintedUrl) console.log('🔗 [UPLOAD] hintedUrl:', hintedUrl);
                        } catch (_) { }

                        resolve({ status: xhr.status, responseText: xhr.responseText });
                    };

                    xhr.onerror = () => {
                        console.warn('⚠️ [UPLOAD] XHR onerror disparado');
                        xhrError = 'Network error';
                        resolve({ status: 0, error: 'network' }); // No reject - dejamos que verify decida
                    };

                    xhr.ontimeout = () => {
                        console.warn('⚠️ [UPLOAD] XHR timeout');
                        xhrError = 'Timeout';
                        resolve({ status: 0, error: 'timeout' }); // No reject - dejamos que verify decida
                    };

                    xhr.timeout = 3600 * 1000; // 1 hora
                    xhr.open('POST', `${CONFIG.vps_url}/upload.php`, true);
                    
                    // Asegurar compatibilidad para bypassear preflights innecesarios
                    // No enviar Authorization si no hay un endpoint auth
                    
                    xhr.send(formData);
                });

            } catch (e) {
                console.warn('⚠️ [UPLOAD] Exception:', e.message);
                xhrError = e.message;
            }

            // ═══════════════════════════════════════════════════════════════════
            // PASO 2: UPLOAD_FINISHED_UNCONFIRMED
            // ═══════════════════════════════════════════════════════════════════
            this._setState('UPLOAD_FINISHED_UNCONFIRMED');
            console.log(`📤 [UPLOAD] Envío terminado (XHR error: ${xhrError || 'ninguno'})`);

            // ═══════════════════════════════════════════════════════════════════
            // PASO 3: VERIFYING - HEAD /lists/{file}
            // ═══════════════════════════════════════════════════════════════════
            this._setState('VERIFYING');
            if (gm) gm._updateProgress(82, '🔍 Verificando existencia en servidor...');

            const headName = file.sanitizedName || file.name;
            const verifyResult = await this._verifyByHead(headName, hintedUrl);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            // ═══════════════════════════════════════════════════════════════════
            // PASO 4: RESULTADO FINAL
            // ═══════════════════════════════════════════════════════════════════
            this.state.uploadInProgress = false;

            if (verifyResult.ok) {
                // ✅ SUCCESS
                const finalState = xhrError ? 'RECOVERED_SUCCESS_CONFIRMED' : 'SUCCESS_CONFIRMED';
                this._setState(finalState);

                const cleanName = file.sanitizedName || file.name;
                const finalUrl = hintedUrl || verifyResult.url || `${CONFIG.vps_url}/lists/${encodeURIComponent(cleanName)}`;

                if (gm) gm._updateProgress(100, `✅ ${finalState}`);
                console.log(`%c✅ [RESULT] ${finalState}`, 'color: #10b981; font-weight: bold;');
                console.log(`   URL: ${finalUrl}`);
                console.log(`   Tiempo: ${elapsed}s`);
                console.log(`   Tamaño: ${sizeMB} MB`);
                if (xhrError) console.log(`   XHR Error (ignorado): ${xhrError}`);

                this._showFinalDialog(finalUrl, finalState);
                if (gm) setTimeout(() => gm._updateUploadUI('end'), 2000);

                return { ok: true, state: finalState, url: finalUrl };

            } else {
                // ❌ FAIL_CONFIRMED
                this._setState('FAIL_CONFIRMED');

                const errorMsg = xhrError
                    ? `FAIL_TRANSFER: ${xhrError} + HEAD 404`
                    : `FAIL_CONFIRMED: Archivo no existe tras ${HEAD_RETRY_DELAYS.length} verificaciones`;

                if (gm) gm._updateProgress(0, `❌ FAIL_CONFIRMED`);
                console.error(`%c❌ [RESULT] FAIL_CONFIRMED`, 'color: #ef4444; font-weight: bold;');
                console.error(`   Archivo: ${file.name}`);
                console.error(`   Tamaño: ${sizeMB} MB`);
                console.error(`   XHR Error: ${xhrError || 'ninguno'}`);
                console.error(`   HEAD resultado: 404 tras todos los reintentos`);

                alert(`❌ FAIL_CONFIRMED\n\n${errorMsg}\n\nRevisa:\n- Nginx client_max_body_size\n- PHP upload_max_filesize\n- Network tab para errores`);
                if (gm) setTimeout(() => gm._updateUploadUI('end'), 2000);

                return { ok: false, state: 'FAIL_CONFIRMED', error: errorMsg };
            }
        }

        _setState(state) {
            this.state.currentState = state;
            console.log(`📊 [STATE] → ${state}`);
        }

        _sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        _showFinalDialog(url, state) {
            const emoji = state.includes('RECOVERED') ? '🚑' : '✅';
            alert(`${emoji} ${state}\n\nArchivo verificado en servidor.\n\nURL:\n${url}`);
        }

        /**
         * Auto-inject UI listener
         */
        init() {
            const uploadBtn = document.getElementById('gateway-upload-btn') || document.getElementById('btnUploadVPS');
            if (uploadBtn) {
                console.log('🔗 [GATEWAY-INT] Binding to UI button');
                uploadBtn.onclick = async () => {
                    const content = window.gatewayManager?.state?.lastM3U8Content || window.app?.state?.lastM3U8Content;

                    if (!content) {
                        const manualFile = window.gatewayManager?.state?.manualFile;
                        if (manualFile) {
                            await this.upload(manualFile);
                            return;
                        }
                        alert('⚠️ No hay contenido generado. Presiona "Generar M3U8" primero.');
                        return;
                    }

                    const filenameInput = document.getElementById('gateway-custom-filename');
                    const filename = filenameInput?.value || 'upload.m3u8';
                    const blob = new Blob([content], { type: 'application/x-mpegURL' });
                    const file = new File([blob], filename);
                    await this.upload(file);
                };
            }
        }
    }

    // Export
    window.gatewayIntegrated = new GatewayM3U8Integrated();
    document.addEventListener('DOMContentLoaded', () => window.gatewayIntegrated.init());

})();
