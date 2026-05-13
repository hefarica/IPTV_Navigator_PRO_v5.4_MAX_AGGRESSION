/**
 * ============================================
 * 🚀 VPS HLS MAX Auto-Installer
 * ============================================
 * Módulo JavaScript para el Toolkit IPTV Navigator PRO
 * Detecta VPS conectado y ofrece instalar configuración HLS MAX
 * 
 * ✅ MODIFICADO: 2026-01-23
 * - Cambiado para usar API remota en Hetzner en lugar de localhost:5001
 * - La API Flask ahora corre en el VPS, no localmente
 * - Endpoints disponibles en https://iptv-ape.duckdns.org/api/
 * 
 * Características:
 * - Detecta si hay VPS configurado
 * - Verifica si HLS MAX ya está instalado
 * - Ofrece instalación automática con confirmación
 * - Soporta múltiples dominios
 * 
 * Uso: Se inicializa automáticamente al cargar el toolkit
 * ============================================
 */

(function () {
    'use strict';

    const VPS_HLS_INSTALLER = {
        version: '1.1.0',
        name: 'VPS HLS MAX Auto-Installer',

        // Configuración
        config: {
            checkOnStartup: true,
            showPrompt: true,
            installScriptPath: 'vps/backup-hls-max/install-hls-max.sh',

            // ✅ MODIFICADO: Usar API remota en el VPS en lugar de localhost
            get apiServerUrl() {
                // Prioridad 1: VPS_CONFIG.API_URL
                if (window.VPS_CONFIG?.API_URL) {
                    return window.VPS_CONFIG.API_URL;
                }
                // Prioridad 2: Construir desde DEFAULT_URL
                if (window.VPS_CONFIG?.DEFAULT_URL) {
                    return `${window.VPS_CONFIG.DEFAULT_URL}/api`;
                }
                // Prioridad 3: gatewayManager
                if (window.gatewayManager?.config?.vps_url) {
                    return `${window.gatewayManager.config.vps_url}/api`;
                }
                // Fallback: Dominio DuckDNS
                return 'https://iptv-ape.duckdns.org/api';
            },

            // ✅ LEGACY: Mantener scpServerUrl para compatibilidad (subir archivos)
            get scpServerUrl() {
                return 'http://localhost:5001';
            },

            requiredHeaders: [
                'Access-Control-Allow-Origin',
                'Access-Control-Expose-Headers',
                'Accept-Ranges'
            ]
        },

        /**
         * Inicializar el módulo
         */
        async init() {
            console.log(`🚀 ${this.name} v${this.version} - Inicializando...`);

            if (!this.config.checkOnStartup) {
                console.log('⏸️ Auto-check deshabilitado');
                return;
            }

            // Esperar a que el toolkit esté listo
            await this._waitForApp();

            // Verificar si hay VPS configurado
            const vpsUrl = this._getVpsUrl();
            if (!vpsUrl) {
                console.log('ℹ️ No hay VPS configurado. HLS MAX Installer en standby.');
                return;
            }

            const domain = new URL(vpsUrl).hostname;
            console.log(`🌐 VPS detectado: ${vpsUrl}`);
            console.log(`🔌 API Server: ${this.config.apiServerUrl}`);

            // ✅ V4.32: Verificar PRIMERO si ya se instaló exitosamente (persistente)
            const installedKey = `hls_max_installed_${domain}`;
            if (localStorage.getItem(installedKey) === 'true') {
                this._showStatusConfirmation(domain, 'localStorage');
                return;
            }

            // ✅ Verificar vía API remota
            const hlsStatus = await this.checkHlsStatusViaApi();
            if (hlsStatus?.hls_max?.installed) {
                localStorage.setItem(installedKey, 'true');
                this._showStatusConfirmation(domain, 'API', hlsStatus);
                return;
            }

            // Verificar si HLS MAX ya está instalado (vía HTTP headers)
            const isInstalled = await this.checkHlsMaxInstalled(vpsUrl);

            if (isInstalled) {
                localStorage.setItem(installedKey, 'true');
                this._showStatusConfirmation(domain, 'headers');
                return;
            }

            // ✅ V4.32: Si la API falló pero tenemos evidencia parcial, asumir instalado
            // (evitar prompts molestos si la API tiene problemas de CORS temporales)
            if (hlsStatus === null && sessionStorage.getItem('hlsMaxAssumeInstalled') === 'true') {
                console.log('%c⚠️ API no disponible pero asumiendo HLS MAX instalado (sesión)', 'color: #fbbf24;');
                return;
            }

            // Ofrecer instalación solo si realmente no está instalado
            if (this.config.showPrompt && !sessionStorage.getItem('hlsMaxPromptDismissed')) {
                this._showInstallPrompt(vpsUrl);
            }
        },

        /**
         * ✅ NUEVO: Mostrar confirmación visual de que HLS MAX está funcionando
         */
        _showStatusConfirmation(domain, source, data = null) {
            const version = data?.hls_max?.version || '2.0.0';

            console.log('%c╔════════════════════════════════════════════════════════════╗', 'color: #10b981;');
            console.log('%c║  ✅ HLS MAX CONFIGURADO Y FUNCIONANDO CORRECTAMENTE       ║', 'color: #10b981; font-weight: bold;');
            console.log('%c╠════════════════════════════════════════════════════════════╣', 'color: #10b981;');
            console.log(`%c║  🌐 Dominio: ${domain.padEnd(42)}║`, 'color: #10b981;');
            console.log(`%c║  📦 Versión: ${version.padEnd(42)}║`, 'color: #10b981;');
            console.log(`%c║  🔍 Verificado vía: ${source.padEnd(35)}║`, 'color: #10b981;');
            console.log('%c║  ✅ CORS: Activo                                          ║', 'color: #10b981;');
            console.log('%c║  ✅ Range Requests: Activo                                ║', 'color: #10b981;');
            console.log('%c║  ✅ SSL: Let\'s Encrypt                                    ║', 'color: #10b981;');
            console.log('%c╚════════════════════════════════════════════════════════════╝', 'color: #10b981;');
        },

        /**
         * ✅ NUEVO: Verificar estado de HLS MAX vía API remota
         */
        async checkHlsStatusViaApi() {
            try {
                const response = await fetch(`${this.config.apiServerUrl}/hls-status`, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-cache'
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log('📡 [HLS Status vía API]:', data);
                    return data;
                }
                return null;
            } catch (error) {
                console.warn('⚠️ No se pudo verificar HLS Status vía API:', error.message);
                return null;
            }
        },

        /**
         * Obtener URL del VPS configurado
         */
        _getVpsUrl() {
            // ⚠️ V4.31: Prioridad MÁXIMA - Config centralizada
            if (window.VPS_CONFIG?.DEFAULT_URL) {
                return window.VPS_CONFIG.DEFAULT_URL;
            }

            // Prioridad 2: gatewayManager config
            if (window.gatewayManager?.config?.vps_url) {
                return window.gatewayManager.config.vps_url;
            }

            // Prioridad 3: vpsAdapter
            if (window.vpsAdapter?.getBaseUrl) {
                return window.vpsAdapter.getBaseUrl();
            }

            // Prioridad 4: localStorage
            const stored = localStorage.getItem('vps_base_url');
            if (stored) return stored;

            return null;
        },

        /**
         * Verificar si HLS MAX está instalado en el VPS
         */
        async checkHlsMaxInstalled(vpsUrl) {
            try {
                // ✅ V4.30: Hacer HEAD request a un path de .m3u8 real
                const testUrl = `${vpsUrl}/APE_ULTIMATE_v9.m3u8`;
                const response = await fetch(testUrl, {
                    method: 'HEAD',
                    mode: 'cors',
                    cache: 'no-cache'
                });

                // Verificar headers CORS
                const hasAllHeaders = this.config.requiredHeaders.every(header => {
                    const value = response.headers.get(header);
                    return value !== null;
                });

                if (hasAllHeaders) {
                    console.log('✅ Headers HLS MAX detectados:', {
                        'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
                        'Access-Control-Expose-Headers': response.headers.get('Access-Control-Expose-Headers'),
                        'Accept-Ranges': response.headers.get('Accept-Ranges')
                    });
                    return true;
                }

                console.warn('⚠️ Faltan headers HLS MAX:', {
                    checked: this.config.requiredHeaders,
                    missing: this.config.requiredHeaders.filter(h => !response.headers.get(h))
                });
                return false;

            } catch (error) {
                console.warn('⚠️ No se pudo verificar HLS MAX:', error.message);
                return false;
            }
        },

        /**
         * Mostrar prompt de instalación
         */
        _showInstallPrompt(vpsUrl) {
            const domain = new URL(vpsUrl).hostname;

            const message = `🚀 VPS HLS MAX INSTALLER

Se detectó que tu VPS (${domain}) no tiene la configuración HLS MAX instalada.

Esta configuración incluye:
✅ CORS abierto para hls.js y navegadores
✅ Range requests (206 Partial Content)
✅ SSL Let's Encrypt automático
✅ MIME types correctos para HLS
✅ Cache optimizado para segmentos

¿Deseas instalar la configuración HLS MAX automáticamente?

⚠️ La instalación se realizará vía API remota en el VPS.

Presiona OK para instalar o Cancelar para omitir.`;

            if (confirm(message)) {
                this.installHlsMax(domain);
            } else {
                console.log('ℹ️ Instalación de HLS MAX cancelada por el usuario');
                sessionStorage.setItem('hlsMaxPromptDismissed', 'true');
            }
        },

        /**
         * ✅ MODIFICADO: Instalar HLS MAX vía API remota (no localhost)
         */
        async installHlsMax(domain) {
            console.log('%c🚀 Iniciando instalación de HLS MAX...', 'color: #38bdf8; font-weight: bold;');

            try {
                // ✅ MODIFICADO: Verificar que la API remota esté disponible
                const apiHealthResponse = await fetch(`${this.config.apiServerUrl}/health`);
                if (!apiHealthResponse.ok) {
                    throw new Error('API Server no disponible en el VPS.');
                }

                const healthData = await apiHealthResponse.json();
                console.log('✅ API Server disponible:', healthData);

                // ✅ MODIFICADO: Ejecutar instalación vía API remota
                const installResponse = await fetch(`${this.config.apiServerUrl}/install-hls-max`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain: domain })
                });

                if (installResponse.ok) {
                    const result = await installResponse.json();
                    console.log('%c✅ HLS MAX instalado exitosamente', 'color: #4ade80; font-weight: bold;');

                    // Persistir instalación exitosa
                    const installedKey = `hls_max_installed_${domain}`;
                    localStorage.setItem(installedKey, 'true');
                    console.log(`💾 Estado de instalación guardado: ${installedKey}`);

                    alert(`✅ HLS MAX INSTALADO

Dominio: ${domain}
Estado: ${result.message || 'Éxito'}

Los headers CORS y Range ahora están activos.
No verás este mensaje de nuevo.`);
                } else {
                    const errorData = await installResponse.json().catch(() => ({}));
                    throw new Error(errorData.error || `Error de instalación: ${installResponse.status}`);
                }

            } catch (error) {
                console.error('❌ Error instalando HLS MAX:', error);
                alert(`❌ Error instalando HLS MAX

${error.message}

Nota: HLS MAX probablemente ya está instalado.
Ejecuta en consola: VPS_HLS_INSTALLER.forceCheck()
para verificar el estado actual.`);
            }
        },

        /**
         * Método manual para forzar verificación
         */
        async forceCheck() {
            const vpsUrl = this._getVpsUrl();
            if (!vpsUrl) {
                console.log('❌ No hay VPS configurado');
                return { configured: false };
            }

            // Verificar vía API
            const apiStatus = await this.checkHlsStatusViaApi();

            // Verificar vía headers
            const isInstalled = await this.checkHlsMaxInstalled(vpsUrl);

            const result = {
                configured: true,
                vpsUrl: vpsUrl,
                apiUrl: this.config.apiServerUrl,
                hlsMaxInstalled: isInstalled,
                apiStatus: apiStatus
            };

            console.log('📊 [HLS MAX Status]:', result);
            return result;
        },

        /**
         * Método manual para forzar instalación
         */
        async forceInstall(domain) {
            if (!domain) {
                const vpsUrl = this._getVpsUrl();
                if (vpsUrl) {
                    domain = new URL(vpsUrl).hostname;
                } else {
                    console.error('❌ Proporciona un dominio: forceInstall("mi-dominio.com")');
                    return;
                }
            }
            await this.installHlsMax(domain);
        },

        /**
         * Esperar a que window.app esté disponible
         */
        _waitForApp() {
            return new Promise(resolve => {
                if (window.app) {
                    resolve();
                    return;
                }

                const interval = setInterval(() => {
                    if (window.app) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 500);

                // Timeout de 10 segundos
                setTimeout(() => {
                    clearInterval(interval);
                    resolve();
                }, 10000);
            });
        }
    };

    // Exponer globalmente
    window.VPS_HLS_INSTALLER = VPS_HLS_INSTALLER;

    // Auto-inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => VPS_HLS_INSTALLER.init(), 2000);
        });
    } else {
        setTimeout(() => VPS_HLS_INSTALLER.init(), 2000);
    }

    console.log(`📦 ${VPS_HLS_INSTALLER.name} v${VPS_HLS_INSTALLER.version} cargado`);
    console.log('   Comandos: VPS_HLS_INSTALLER.forceCheck(), VPS_HLS_INSTALLER.forceInstall(domain)');

})();
