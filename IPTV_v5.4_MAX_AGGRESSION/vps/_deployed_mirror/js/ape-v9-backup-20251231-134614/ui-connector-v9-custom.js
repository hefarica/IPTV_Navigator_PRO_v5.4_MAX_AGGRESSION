/**
 * ═══════════════════════════════════════════════════════════════
 * 🔌 APE UI CONNECTOR v9.0 - CUSTOM ADAPTER
 * Para IPTV Navigator PRO v3.0.1 + V4.1 STABLE
 * ═══════════════════════════════════════════════════════════════
 * 
 * VERSION: 9.0.9 (Builds URLs for Xtream channels before validation)
 * FECHA: 2024-12-29
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    console.log('%c🔌 APE v9.0 Custom Adapter - Cargando...', 'color: #03a9f4; font-weight: bold;');

    let adapterInitialized = false;

    function initializeAPEv9Adapter() {
        if (adapterInitialized) return true;
        if (typeof window.app === 'undefined') return false;

        adapterInitialized = true;
        console.log('%c🚀 APE v9.0 ULTIMATE - Adaptador Custom Cargado', 'color: #00ff41; font-weight: bold; font-size: 14px;');

        // ═══════════════════════════════════════════════════════════
        // MÉTODO PRINCIPAL: generateM3U8Ultimate
        // ═══════════════════════════════════════════════════════════

        window.app.generateM3U8Ultimate = async function () {
            console.log('%c🎯 Iniciando generación con APE v9.0 ULTIMATE...', 'color: #03a9f4; font-weight: bold;');

            // ═══════════════════════════════════════════════════════════
            // V9.0.9: Obtener canales + construir URLs (igual que export-module)
            // ═══════════════════════════════════════════════════════════
            let sourceData = [];
            let sourceName = '';

            // PRIORIDAD 1: Usar getFilteredChannels() (igual que generateM3U8Pro)
            if (typeof this.getFilteredChannels === 'function') {
                const filtered = this.getFilteredChannels();
                if (filtered && filtered.length > 0) {
                    sourceData = filtered;
                    sourceName = 'getFilteredChannels()';
                }
            }

            // FALLBACK 1: state.filteredChannels
            if (sourceData.length === 0 && this.state?.filteredChannels?.length > 0) {
                sourceData = this.state.filteredChannels;
                sourceName = 'state.filteredChannels';
            }
            // FALLBACK 2: state.channels
            else if (sourceData.length === 0 && this.state?.channels?.length > 0) {
                sourceData = this.state.channels;
                sourceName = 'state.channels';
            }
            // FALLBACK 3: state.channelsMaster
            else if (sourceData.length === 0 && this.state?.channelsMaster?.length > 0) {
                sourceData = this.state.channelsMaster;
                sourceName = 'state.channelsMaster';
            }

            if (sourceData.length === 0) {
                alert('❌ Error: No hay canales disponibles.\n\nConecta un servidor primero.');
                return;
            }

            console.log(`📊 Fuente: ${sourceName} | Total: ${sourceData.length} canales`);

            // ═══════════════════════════════════════════════════════════
            // V9.0.9: CONSTRUIR URLs para canales Xtream (sin URL directa)
            // Igual que _buildStreamUrl en export-module.js
            // ═══════════════════════════════════════════════════════════
            const currentServer = this.state?.currentServer || {};
            const streamFormat = this.state?.streamFormat || 'ts';

            const channelsWithUrls = sourceData.map(ch => {
                // Si ya tiene URL válida, usarla
                if (ch.url && ch.url.length > 10 && /^https?:\/\//i.test(ch.url)) {
                    return ch;
                }

                // Construir URL desde Xtream API
                let url = '';
                if (currentServer.baseUrl && ch.stream_id) {
                    const baseUrl = (currentServer.baseUrl || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                    const username = currentServer.username || '';
                    const password = currentServer.password || '';

                    let typePath = 'live';
                    let ext = streamFormat;

                    if (ch.stream_type === 'movie' || ch.type === 'movie') {
                        typePath = 'movie';
                        ext = ch.container_extension || 'mp4';
                    } else if (ch.stream_type === 'series' || ch.type === 'series') {
                        typePath = 'series';
                        ext = ch.container_extension || 'mp4';
                    }

                    url = `${baseUrl}/${typePath}/${username}/${password}/${ch.stream_id}.${ext}`;
                }

                return {
                    ...ch,
                    url: url || ch.url || ''
                };
            });

            console.log(`📊 URLs construidas: ${channelsWithUrls.filter(c => c.url && c.url.length > 10).length}/${channelsWithUrls.length}`);

            const validator = window.GENERATION_VALIDATOR_V9 || window.ApeValidator;
            if (!validator) {
                alert('Error: Generation Validator v9.0 no encontrado.');
                return;
            }

            const validation = validator.validateBatch(channelsWithUrls);
            if (!validation.valid) {
                console.error('APE HARD-FAIL:', validation);
                alert(`⛔ Validación fallida: ${validation.error}\n\nStats: ${JSON.stringify(validation.stats)}`);
                return;
            }

            console.log(`%c✅ Validación OK: ${validation.cleanChannels.length} canales`, 'color: #4ade80;');

            const engine = window.APE_ENGINE_V9 || window.APE_Engine;
            if (!engine) {
                alert('Error: APE Engine v9.0 no encontrado.');
                return;
            }

            try {
                await engine.execute(validation.cleanChannels);
                console.log('%c✅ Generación completada', 'color: #00ff41; font-weight: bold;');
            } catch (error) {
                console.error('Error:', error);
                alert(`Error: ${error.message}`);
            }
        };

        // ═══════════════════════════════════════════════════════════
        // FUNCIONES DE DEBUG
        // Renombrada para evitar que sea llamada por código externo
        // ═══════════════════════════════════════════════════════════

        // Función principal de debug - SOLO usar manualmente
        window.app._debugAPEv9Modules = function () {
            const modules = {
                'Headers Matrix v9.0': window.HEADERS_MATRIX_V9 || window.APE_Headers_Matrix,
                'Session Warmup v9.0': window.SESSION_WARMUP_V9 || window.APE_Warmup,
                'Generation Validator v9.0': window.GENERATION_VALIDATOR_V9 || window.ApeValidator,
                'APE Engine v9.0': window.APE_ENGINE_V9 || window.APE_Engine
            };

            let allLoaded = true;
            console.group('%c🔍 Estado de Módulos APE v9.0', 'color: #03a9f4; font-weight: bold;');
            for (const [name, module] of Object.entries(modules)) {
                const status = module ? '✅' : '❌';
                console.log(`${status} ${name}`);
                if (!module) allLoaded = false;
            }
            console.groupEnd();

            if (allLoaded) {
                console.log('%c🎉 Todos los módulos APE v9.0 cargados', 'color: #00ff41; font-weight: bold;');
            }
            return allLoaded;
        };

        // Alias silencioso - para compatibilidad con código externo
        // NUNCA muestra logs
        window.app.checkAPEv9Status = function () {
            const hasAll = !!(
                (window.HEADERS_MATRIX_V9 || window.APE_Headers_Matrix) &&
                (window.SESSION_WARMUP_V9 || window.APE_Warmup) &&
                (window.GENERATION_VALIDATOR_V9 || window.ApeValidator) &&
                (window.APE_ENGINE_V9 || window.APE_Engine)
            );
            return hasAll;
        };

        window.app.getChannelsInfo = function () {
            const info = {
                filteredChannels: (this.state?.filteredChannels || []).length,
                channels: (this.state?.channels || []).length,
                channelsMaster: (this.state?.channelsMaster || []).length
            };
            console.table(info);
            return info;
        };

        console.log('%c✅ APE v9.0 Custom Adapter - Listo', 'color: #4ade80; font-weight: bold;');
        console.log('%c   Ejecuta app._debugAPEv9Modules() para verificar', 'color: #9ca3af;');

        return true;
    }

    // Polling para esperar window.app
    let attempts = 0;
    const waitForApp = setInterval(function () {
        attempts++;
        if (initializeAPEv9Adapter()) {
            clearInterval(waitForApp);
            return;
        }
        if (attempts >= 50) {
            clearInterval(waitForApp);
            console.error('❌ APE v9.0: Timeout esperando window.app');
        }
    }, 100);

})();
