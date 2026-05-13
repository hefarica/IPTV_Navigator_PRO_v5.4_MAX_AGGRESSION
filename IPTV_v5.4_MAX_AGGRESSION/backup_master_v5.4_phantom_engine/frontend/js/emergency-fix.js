/**
 * ═══════════════════════════════════════════════════════════════════
 * 🚑 EMERGENCY FIX V1.0 - Generator Supremacy
 * Inicialización de configuración faltante en LocalStorage
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Este script soluciona el problema de configuración vacía/faltante
 * que impide que el GeneratorBridge y APE Worker funcionen correctamente.
 * 
 * PROBLEMA DETECTADO:
 * - iptv_headers_mode_v41 está vacío
 * - APE key existe pero sin configuración
 * - Headers activos tienen User-Agent vacío
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const EmergencyFix = {

        version: '1.0.0',

        // ═══════════════════════════════════════════════════════════════
        // 🔧 DEFAULT CONFIGURATIONS
        // ═══════════════════════════════════════════════════════════════

        defaults: {
            headersMode: 'APE',

            apeConfig: {
                version: '4.1.0',
                mode: 'auto',
                manualLevel: 3,
                autoReferer: true,
                autoOrigin: true,
                autoClientHints: false,
                includeBuffer: true,
                bufferStrategy: 'drip-feeding',
                minBuffer: 20,
                maxBuffer: 20,
                networkCache: 20000,
                proStreaming: false,
                scoreWeights: {
                    resolution: 1.0,
                    cdn: 1.5,
                    auth: 1.2,
                    category: 0.8
                }
            },

            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': '',
                'Origin': '',
                'Connection': 'keep-alive',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Cache-Control': 'no-cache'
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // 🔧 FIX METHODS
        // ═══════════════════════════════════════════════════════════════

        /**
         * Aplicar todas las correcciones necesarias
         */
        fix() {
            console.group('🚑 EMERGENCY FIX - Inicializando configuración');

            let fixesApplied = 0;

            // 1. Establecer modo de headers
            fixesApplied += this._fixHeadersMode();

            // 2. Inicializar configuración APE
            fixesApplied += this._fixApeConfig();

            // 3. Establecer headers por defecto
            fixesApplied += this._fixActiveHeaders();

            // 4. Verificar GeneratorBridge
            this._reinitBridge();

            console.groupEnd();

            if (fixesApplied > 0) {
                console.log(`\n✅ ${fixesApplied} FIX(ES) APLICADO(S). Recarga la página (Ctrl+F5)`);
            } else {
                console.log('\n✅ Configuración ya estaba correcta. No se necesitaron fixes.');
            }

            return fixesApplied;
        },

        _fixHeadersMode() {
            const key = 'iptv_headers_mode_v41';
            const currentMode = localStorage.getItem(key);

            if (!currentMode || currentMode === '' || currentMode === '[]' || currentMode === 'null') {
                localStorage.setItem(key, this.defaults.headersMode);
                console.log('✅ Headers mode fijado en:', this.defaults.headersMode);
                return 1;
            }

            console.log('ℹ️ Headers mode ya existe:', currentMode);
            return 0;
        },

        _fixApeConfig() {
            const key = 'APE';
            const currentConfig = localStorage.getItem(key);

            if (!currentConfig || currentConfig === '' || currentConfig === '[]' || currentConfig === 'null') {
                localStorage.setItem(key, JSON.stringify(this.defaults.apeConfig));
                console.log('✅ APE config inicializada');
                return 1;
            }

            // Verificar que la config existente tiene los campos necesarios
            try {
                const config = JSON.parse(currentConfig);
                if (!config.version || !config.mode) {
                    // Config incompleta, reconstruir
                    const merged = { ...this.defaults.apeConfig, ...config };
                    localStorage.setItem(key, JSON.stringify(merged));
                    console.log('✅ APE config actualizada con campos faltantes');
                    return 1;
                }
                console.log('ℹ️ APE config ya existe y es válida');
            } catch (e) {
                localStorage.setItem(key, JSON.stringify(this.defaults.apeConfig));
                console.log('✅ APE config reconstruida (JSON inválido previo)');
                return 1;
            }

            return 0;
        },

        _fixActiveHeaders() {
            const key = 'iptv_headers_active_v41';
            const currentHeaders = localStorage.getItem(key);

            if (!currentHeaders || currentHeaders === '' || currentHeaders === '[]') {
                localStorage.setItem(key, JSON.stringify(this.defaults.headers));
                console.log('✅ Headers activos inicializados');
                return 1;
            }

            try {
                const headers = JSON.parse(currentHeaders);

                // Verificar que User-Agent no esté vacío
                if (!headers['User-Agent'] || headers['User-Agent'] === '') {
                    headers['User-Agent'] = this.defaults.headers['User-Agent'];
                    localStorage.setItem(key, JSON.stringify(headers));
                    console.log('✅ User-Agent fijado');
                    return 1;
                }

                console.log('ℹ️ Headers activos ya están configurados');
            } catch (e) {
                localStorage.setItem(key, JSON.stringify(this.defaults.headers));
                console.log('✅ Headers reconstruidos desde defaults');
                return 1;
            }

            return 0;
        },

        _reinitBridge() {
            if (window.generatorBridge) {
                console.log('ℹ️ GeneratorBridge detectado, forzando re-inicialización...');

                if (typeof window.generatorBridge.init === 'function') {
                    try {
                        window.generatorBridge.init();
                        console.log('✅ GeneratorBridge re-inicializado');
                    } catch (e) {
                        console.warn('⚠️ Error al re-inicializar:', e.message);
                    }
                }
            } else {
                console.warn('⚠️ GeneratorBridge no está cargado. Recarga la página.');
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // 🔍 VERIFICATION
        // ═══════════════════════════════════════════════════════════════

        /**
         * Verificar estado de la configuración
         */
        verify() {
            console.group('🔍 Verificando configuración');

            const checks = {
                'Headers Mode': {
                    key: 'iptv_headers_mode_v41',
                    required: true
                },
                'APE Config': {
                    key: 'APE',
                    required: true,
                    isJson: true
                },
                'Headers Activos': {
                    key: 'iptv_headers_active_v41',
                    required: true,
                    isJson: true
                },
                'Server Library': {
                    key: 'iptv_server_library',
                    required: false,
                    isJson: true
                }
            };

            let allOk = true;

            for (const [name, cfg] of Object.entries(checks)) {
                const value = localStorage.getItem(cfg.key);

                if (!value || value === '' || value === '[]' || value === 'null') {
                    if (cfg.required) {
                        console.error(`❌ ${name}: FALTA O VACÍO`);
                        allOk = false;
                    } else {
                        console.warn(`⚠️ ${name}: No configurado (opcional)`);
                    }
                } else {
                    if (cfg.isJson) {
                        try {
                            const parsed = JSON.parse(value);
                            const preview = JSON.stringify(parsed).substring(0, 60);
                            console.log(`✅ ${name}:`, preview + '...');
                        } catch (e) {
                            console.error(`❌ ${name}: JSON INVÁLIDO`);
                            allOk = false;
                        }
                    } else {
                        console.log(`✅ ${name}:`, value);
                    }
                }
            }

            console.groupEnd();

            if (allOk) {
                console.log('\n✅ VERIFICACIÓN COMPLETA: Toda la configuración está OK');
            } else {
                console.log('\n⚠️ VERIFICACIÓN: Hay problemas. Ejecuta EmergencyFix.fix()');
            }

            return allOk;
        },

        // ═══════════════════════════════════════════════════════════════
        // 🗑️ RESET
        // ═══════════════════════════════════════════════════════════════

        /**
         * Reset completo de configuración (para empezar de cero)
         */
        reset() {
            console.warn('⚠️ RESET COMPLETO - Borrando configuración...');

            const keysToRemove = [
                'iptv_headers_mode_v41',
                'APE',
                'iptv_headers_active_v41',
                'iptv_headers_custom_v41',
                'v41_headers_value_mode'
            ];

            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                console.log(`🗑️ Borrado: ${key}`);
            });

            console.log('✅ Reset completo. Ejecuta EmergencyFix.fix() para reinicializar.');
        },

        // ═══════════════════════════════════════════════════════════════
        // 📊 DIAGNOSTIC
        // ═══════════════════════════════════════════════════════════════

        /**
         * Diagnóstico completo del estado
         */
        diagnose() {
            console.group('📊 DIAGNÓSTICO COMPLETO');

            // 1. LocalStorage
            console.group('📦 LocalStorage');
            this.verify();
            console.groupEnd();

            // 2. Módulos cargados
            console.group('🔌 Módulos');
            const modules = {
                'app': window.app,
                'generatorBridge': window.generatorBridge,
                'tabLifecycle': window.tabLifecycle,
                'FocusFlow': window.FocusFlow,
                'PerformanceProfiler': window.PerformanceProfiler,
                'GenerationValidator': window.GenerationValidator,
                'ExportModule': window.ExportModule,
                'GenTabController': window.GenTabController
            };

            for (const [name, module] of Object.entries(modules)) {
                if (module) {
                    console.log(`✅ ${name}: Cargado`);
                } else {
                    console.warn(`⚠️ ${name}: No encontrado`);
                }
            }
            console.groupEnd();

            // 3. Estado de datos
            console.group('📊 Datos');
            if (window.app && window.app.state) {
                const state = window.app.state;
                console.log('Channels:', state.channels?.length || 0);
                console.log('ChannelsMaster:', state.channelsMaster?.length || 0);
                console.log('FilteredChannels:', state.filteredChannels?.length || 0);
                console.log('ActiveServers:', state.activeServers?.length || 0);
            } else {
                console.warn('⚠️ app.state no disponible');
            }
            console.groupEnd();

            // 4. Worker status
            console.group('🧠 Worker');
            if (window.generatorBridge) {
                const status = window.generatorBridge.getStatus();
                console.log('isProcessing:', status.isProcessing);
                console.log('workerActive:', status.workerActive);
                console.log('fallbackMode:', status.fallbackMode);
            } else {
                console.warn('⚠️ GeneratorBridge no disponible');
            }
            console.groupEnd();

            console.groupEnd();
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 🌐 GLOBAL EXPORT & AUTO-RUN
    // ═══════════════════════════════════════════════════════════════════

    window.EmergencyFix = EmergencyFix;

    // Auto-ejecutar verificación al cargar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                console.log('[EmergencyFix] 🚑 Módulo cargado. Ejecutando verificación automática...');
                const needsFix = !EmergencyFix.verify();
                if (needsFix) {
                    console.log('[EmergencyFix] ⚠️ Se detectaron problemas. Aplicando fix automático...');
                    EmergencyFix.fix();
                }
            }, 500);
        });
    } else {
        setTimeout(() => {
            console.log('[EmergencyFix] 🚑 Módulo cargado. Ejecutando verificación automática...');
            const needsFix = !EmergencyFix.verify();
            if (needsFix) {
                console.log('[EmergencyFix] ⚠️ Se detectaron problemas. Aplicando fix automático...');
                EmergencyFix.fix();
            }
        }, 500);
    }

    console.log('[EmergencyFix] 🚑 v1.0.0 cargado');

})();
