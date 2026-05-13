/**
 * SECURITY-INTEGRATION-HOOKS.js
 * IPTV Navigator PRO - Hooks de Integración de Seguridad v1.0
 * 
 * ⚠️ PROPÓSITO:
 * - Conectar SecurityValidationModule con app.js
 * - Conectar PersistenceHardeningModule con app.js
 * - Interceptar flujos críticos para validación
 * - Inicialización automática de módulos
 * 
 * ✅ USO:
 * Este archivo debe cargarse DESPUÉS de:
 * - app.js
 * - security-validation-module.js
 * - persistence-hardening-module.js
 * 
 * Se auto-inicializa al cargar.
 */

(function () {
    'use strict';

    console.group('🔐 SECURITY INTEGRATION HOOKS');

    // Esperar a que app esté disponible
    const waitForApp = () => {
        return new Promise((resolve) => {
            if (window.app || window.IPTVNavigatorPro) {
                resolve(window.app || new window.IPTVNavigatorPro());
                return;
            }

            // Esperar hasta 5 segundos
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (window.app) {
                    clearInterval(interval);
                    resolve(window.app);
                } else if (attempts > 50) {
                    clearInterval(interval);
                    console.warn('⚠️ No se pudo encontrar instancia de app');
                    resolve(null);
                }
            }, 100);
        });
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 1. INICIALIZAR MÓDULOS
    // ═══════════════════════════════════════════════════════════════════════

    const initSecurityModules = async () => {
        const app = await waitForApp();

        if (!app) {
            console.error('❌ No se pudo inicializar seguridad - app no disponible');
            console.groupEnd();
            return;
        }

        // Inicializar SecurityValidationModule
        if (window.SecurityValidationModule) {
            app.securityModule = new window.SecurityValidationModule(app);
            console.log('✅ SecurityValidationModule conectado a app');
        } else {
            console.warn('⚠️ SecurityValidationModule no disponible');
        }

        // Inicializar PersistenceHardeningModule
        if (window.PersistenceHardeningModule) {
            app.persistenceHardening = new window.PersistenceHardeningModule(app);

            // Iniciar monitor de integridad (deshabilitado por defecto para no impactar rendimiento)
            // app.persistenceHardening.startIntegrityMonitor();

            console.log('✅ PersistenceHardeningModule conectado a app');
        } else {
            console.warn('⚠️ PersistenceHardeningModule no disponible');
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 2. WRAPPER PARA connectServer() (Validación de entrada)
        // ═══════════════════════════════════════════════════════════════════════

        if (app.securityModule && typeof app.connectServer === 'function') {
            const originalConnectServer = app.connectServer.bind(app);

            app.connectServer = async function (append = false) {
                console.log('🔒 [Security Hook] Validando conexión...');

                const urlEl = document.getElementById('baseUrl');
                const userEl = document.getElementById('username');
                const passEl = document.getElementById('password');
                const nameEl = document.getElementById('serverName');

                const connectionData = {
                    baseUrl: urlEl?.value?.trim() || '',
                    username: userEl?.value?.trim() || '',
                    password: passEl?.value || '',
                    serverName: nameEl?.value?.trim() || ''
                };

                // Validar con SecurityModule
                const validation = app.securityModule.validateConnection(connectionData);

                if (!validation.valid) {
                    const errorMessages = validation.errors.map(e => `• ${e.field}: ${e.message}`).join('\n');
                    alert(`❌ Error de validación:\n\n${errorMessages}`);
                    console.warn('🔒 Conexión bloqueada por validación:', validation.errors);
                    return;
                }

                // Sobrescribir inputs con valores sanitizados
                if (urlEl) urlEl.value = validation.data.baseUrl;
                if (userEl) userEl.value = validation.data.username;
                if (nameEl && validation.data.serverName) nameEl.value = validation.data.serverName;

                console.log('✅ Validación pasada, procediendo con conexión...');

                // Llamar método original
                return originalConnectServer(append);
            };

            console.log('✅ Hook instalado: connectServer con validación');
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 3. WRAPPER PARA processChannels() (Sanitización de datos de API)
        // ═══════════════════════════════════════════════════════════════════════

        if (app.securityModule && typeof app.processChannels === 'function') {
            const originalProcessChannels = app.processChannels.bind(app);

            app.processChannels = async function (rawChannels, serverObj, append = false) {
                console.log('🔒 [Security Hook] Sanitizando canales de API...');

                // Sanitizar canales entrantes
                const sanitizedChannels = app.securityModule.sanitizeChannelsFromApi(rawChannels || []);

                console.log(`🔒 Canales sanitizados: ${sanitizedChannels.length}/${rawChannels?.length || 0}`);

                // Llamar método original con datos sanitizados
                return originalProcessChannels(sanitizedChannels, serverObj, append);
            };

            console.log('✅ Hook instalado: processChannels con sanitización');
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 4. VERIFICACIÓN DE INTEGRIDAD AL CARGAR
        // ═══════════════════════════════════════════════════════════════════════

        if (app.persistenceHardening) {
            // Verificar integridad después de cargar datos
            setTimeout(async () => {
                console.log('🔒 [Startup] Verificando integridad inicial...');
                const integrity = await app.persistenceHardening.verifyIntegrity();

                if (!integrity.consistent) {
                    console.warn('⚠️ Problemas de integridad detectados al iniciar');

                    // Auto-reparar si hay problemas menores
                    if (integrity.issues.every(i => i.severity !== 'CRITICAL')) {
                        await app.persistenceHardening.repairInconsistencies({
                            removePhantoms: true,
                            removeOrphans: true,
                            syncFromDb: false
                        });
                    }
                }
            }, 2000); // Esperar 2s para que app cargue datos
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 5. COMANDOS DE CONSOLA PARA DEBUGGING
        // ═══════════════════════════════════════════════════════════════════════

        window.securityDiagnostics = {
            /**
             * Verificar integridad manualmente
             * Uso: securityDiagnostics.checkIntegrity()
             */
            checkIntegrity: async () => {
                if (!app.persistenceHardening) {
                    console.error('PersistenceHardeningModule no disponible');
                    return;
                }
                return await app.persistenceHardening.verifyIntegrity();
            },

            /**
             * Generar reporte de salud
             * Uso: securityDiagnostics.healthReport()
             */
            healthReport: async () => {
                if (!app.persistenceHardening) {
                    console.error('PersistenceHardeningModule no disponible');
                    return;
                }
                return await app.persistenceHardening.generateHealthReport();
            },

            /**
             * Detectar servidores fantasma
             * Uso: securityDiagnostics.findPhantoms()
             */
            findPhantoms: () => {
                if (!app.persistenceHardening) {
                    console.error('PersistenceHardeningModule no disponible');
                    return;
                }
                return app.persistenceHardening.detectPhantomServers();
            },

            /**
             * Reparar inconsistencias
             * Uso: await securityDiagnostics.repair()
             */
            repair: async () => {
                if (!app.persistenceHardening) {
                    console.error('PersistenceHardeningModule no disponible');
                    return;
                }
                return await app.persistenceHardening.repairInconsistencies();
            },

            /**
             * Validar URL antes de fetch
             * Uso: securityDiagnostics.validateUrl('http://example.com')
             */
            validateUrl: (url) => {
                if (!app.securityModule) {
                    console.error('SecurityValidationModule no disponible');
                    return;
                }
                return app.securityModule.validateFetchUrl(url);
            },

            /**
             * Iniciar/detener monitor de integridad
             */
            startMonitor: () => {
                app.persistenceHardening?.startIntegrityMonitor();
            },
            stopMonitor: () => {
                app.persistenceHardening?.stopIntegrityMonitor();
            }
        };

        console.log('✅ Comandos de diagnóstico disponibles en: window.securityDiagnostics');
        console.log('   - securityDiagnostics.checkIntegrity()');
        console.log('   - securityDiagnostics.healthReport()');
        console.log('   - securityDiagnostics.findPhantoms()');
        console.log('   - securityDiagnostics.repair()');
        console.log('   - securityDiagnostics.validateUrl(url)');

        console.groupEnd();
    };

    // Iniciar cuando DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSecurityModules);
    } else {
        // DOM ya cargado
        setTimeout(initSecurityModules, 100);
    }

})();
