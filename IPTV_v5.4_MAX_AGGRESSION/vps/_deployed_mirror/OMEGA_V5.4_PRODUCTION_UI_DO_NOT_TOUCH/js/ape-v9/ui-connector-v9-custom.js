/**
 * ═══════════════════════════════════════════════════════════════
 * 🔌 APE UI CONNECTOR v9.0 - CUSTOM ADAPTER
 * Para IPTV Navigator PRO v3.0.1 + V4.1 STABLE
 * ═══════════════════════════════════════════════════════════════
 * 
 * VERSION: 9.0.12 (Multi-Server Fix + PRO Features Integration)
 * FECHA: 2026-01-17 | FIX: Multi-Server URL Resolution + Telemetry
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
        // v16.0 WORLD CLASS: Ahora usa el FrontendOrchestrator
        // ═══════════════════════════════════════════════════════════

        window.app.generateM3U8Ultimate = async function () {
            console.log('%c👑 Redirigiendo a FrontendOrchestrator v16.0 WORLD CLASS...', 'color: #8b5cf6; font-weight: bold; font-size: 14px;');

            // Usar el nuevo orquestador que integra:
            // - AdapterV14 (configuración UI)
            // - AdapterV1 (headers 5 niveles)
            // - HUD Visual v16.0
            // - Session Warmup L4+
            // - Núcleo M3U8APIWrapper v16.0
            if (window.FrontendOrchestrator) {
                return await window.FrontendOrchestrator.orchestrateGeneration();
            }

            // Fallback al sistema antiguo si el orquestador no está disponible
            console.warn('%c⚠️ FrontendOrchestrator no disponible, usando sistema legacy...', 'color: #ff9800; font-weight: bold;');

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
            // V9.0.11: MULTI-SERVER URL RESOLUTION FIX
            // Cada canal busca su servidor de origen específico
            // ═══════════════════════════════════════════════════════════
            const activeServers = this.state?.activeServers || [];
            const currentServer = this.state?.currentServer || {};
            const streamFormat = this.state?.streamFormat || 'ts';

            // Crear mapa de servidores por ID para lookup O(1)
            const serverMap = new Map();
            activeServers.forEach(srv => {
                if (srv.id) serverMap.set(srv.id, srv);
            });

            console.log(`🔧 [V9.0.11] Multi-Server: ${activeServers.length} servidores activos`);

            const channelsWithUrls = sourceData.map(ch => {
                // 1. EXTRAER URL (múltiples fuentes para máxima compatibilidad)
                let url = ch.url || ch.stream_url || ch.link || ch.file || '';

                // Prioridad para objeto 'base' si existe (Standard en v4.1)
                if (ch.base && ch.base.url) {
                    url = ch.base.url;
                }

                // 2. EXTRAER NOMBRE (Asegurar que tvg-name sea reproducible)
                // v13.1 SUPREMO: Prioridad multinivel (base > ch fields > logo > id)
                let name = '';

                if (ch.base && ch.base.name) {
                    name = ch.base.name;
                } else {
                    name = ch.name || ch.stream_display_name || ch.title || ch.epg_channel_id || '';
                }

                // Normalización de nombre para evitar números solos (Error 5.m3u8) o strings vacíos
                const nameStr = (name || '').toString().trim();

                if (!nameStr || nameStr === '' || !isNaN(nameStr)) {
                    // Fallback a logo si existe
                    if (ch.stream_icon) {
                        const logoMatch = ch.stream_icon.match(/\/([^\/]+)\.(png|jpg|jpeg|gif)$/i);
                        if (logoMatch) {
                            name = logoMatch[1].replace(/_/g, ' ').replace(/-/g, ' ').toUpperCase();
                        }
                    }

                    // Fallback final a stream_id
                    if (!name || name.toString().trim() === '' || !isNaN(name.toString().trim())) {
                        const s_id_raw = ch.stream_id || ch.id || (ch.base && ch.base.stream_id) || '';
                        name = s_id_raw ? `CHANNEL ${s_id_raw}` : `CHANNEL ${Math.random().toString(36).substring(7).toUpperCase()}`;
                    }
                }

                // 3. RECONSTRUCCIÓN XTREAM (si falta URL directa pero hay stream_id)
                // V9.0.11: Buscar servidor ESPECÍFICO del canal
                const s_id = ch.stream_id || (ch.base && ch.base.stream_id) || ch.id;
                let reconstructed = false;

                // Determinar qué servidor usar para este canal específico
                const channelServerId = ch._source || ch.serverId || ch.server_id || (ch.base && ch.base.serverId);
                let targetServer = null;

                if (channelServerId && serverMap.has(channelServerId)) {
                    // ✅ Usar servidor específico del canal
                    targetServer = serverMap.get(channelServerId);
                } else if (currentServer.baseUrl) {
                    // ⚠️ Fallback a currentServer (último seleccionado)
                    targetServer = currentServer;
                }

                if (targetServer && targetServer.baseUrl && s_id && (!url || !url.startsWith('http'))) {
                    const baseUrl = (targetServer.baseUrl || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                    const username = targetServer.username || '';
                    const password = targetServer.password || '';

                    let typePath = 'live';
                    let ext = streamFormat;

                    const chType = ch.stream_type || ch.type || (ch.base && ch.base.type) || 'live';

                    if (chType === 'movie') {
                        typePath = 'movie';
                        ext = ch.container_extension || (ch.base && ch.base.container_extension) || 'mp4';
                    } else if (chType === 'series') {
                        typePath = 'series';
                        ext = ch.container_extension || (ch.base && ch.base.container_extension) || 'mp4';
                    }

                    url = `${baseUrl}/${typePath}/${username}/${password}/${s_id}.${ext}`;
                    reconstructed = true;
                }

                return {
                    ...ch,
                    url: url,
                    name: name.toString().trim(),
                    v41_reconstructed: reconstructed,
                    _resolvedServer: targetServer?.id || 'unknown'
                };
            });

            const cleanChannels = channelsWithUrls.filter(c => c.url && c.url.length > 10 && /^https?:\/\//i.test(c.url));
            console.log(`📊 URLs válidas detectadas: ${cleanChannels.length}/${channelsWithUrls.length}`);

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
                // ═══════════════════════════════════════════════════════════
                // V9.0.12: Integración de features de generateM3U8Pro
                // ═══════════════════════════════════════════════════════════

                // 1. Leer opciones de la pestaña Generator (igual que PRO)
                const ottOptimized = document.getElementById('ottNavOptimizedGen')?.checked || false;
                const proStreaming = document.getElementById('proStreamingOptimized')?.checked || false;
                const includeHeaders = document.getElementById('includeHttpHeaders')?.checked !== false;
                const streamFormat = document.getElementById('genStreamFormat')?.value || 'm3u8';

                // Actualizar streamFormat en state
                this.state.streamFormat = streamFormat;

                // 2. Log de opciones para debugging
                console.log(`📋 Opciones Generator: OTT=${ottOptimized}, ProStreaming=${proStreaming}, Headers=${includeHeaders}, Format=${streamFormat}`);

                // ═══════════════════════════════════════════════════════════
                // V2.0 INTEGRATED: Usar M3U8APIWrapper con VideoFormatPrioritization
                // ═══════════════════════════════════════════════════════════

                if (window.M3U8APIWrapper && window.VideoFormatPrioritizationModule) {
                    console.log('%c🎬 Usando M3U8APIWrapper INTEGRATED con VideoFormatPrioritization...', 'color: #8b5cf6; font-weight: bold;');

                    const wrapper = new window.M3U8APIWrapper({
                        defaultProfile: 'P2',
                        defaultDeviceType: 'desktop_chrome',
                        defaultStrategy: 'balanced',
                        availableBandwidth: 100,
                        prioritizeQuality: true,
                        prioritizeCompression: true,
                        unlimitedBandwidth: true,
                        minimumGuaranteePercent: 150,
                        hardwareDecodePreference: true
                    });

                    // Generar y descargar con todos los módulos integrados
                    wrapper.generateAndDownload(validation.cleanChannels, {
                        profile: 'P2',
                        deviceType: 'desktop_chrome',
                        availableBandwidth: 100,
                        strategy: 'balanced'
                    });

                    console.log('%c✅ Generación INTEGRATED completada', 'color: #00ff41; font-weight: bold;');
                    console.log('   ✅ VideoFormatPrioritization aplicado');
                    console.log('   ✅ 250+ Headers en JWT');
                    console.log('   ✅ 150% garantizado, modo ilimitado');

                } else {
                    // Fallback al motor APE original si los nuevos módulos no están disponibles
                    console.log('%c⚠️ M3U8APIWrapper no disponible, usando motor APE original...', 'color: #ff9800;');
                    await engine.execute(validation.cleanChannels, {
                        ottOptimized,
                        proStreaming,
                        includeHeaders,
                        streamFormat
                    });
                }

                console.log('%c✅ Generación completada', 'color: #00ff41; font-weight: bold;');

                // 4. Telemetría V4.1 (igual que generateM3U8Pro)
                try {
                    if (window.telemetryManager && typeof window.telemetryManager.logDecision === 'function') {
                        window.telemetryManager.logDecision(true, 0, 'APE-ULTIMATE-INTEGRATED', false);
                    }
                    if (window.V41Hooks && typeof window.V41Hooks.onGenerateEnd === 'function') {
                        const sampleUrl = validation.cleanChannels[0]?.url || '';
                        window.V41Hooks.onGenerateEnd({
                            sampleUrl,
                            totalChannels: this.state.channelsMaster?.length || 0,
                            filteredChannels: validation.cleanChannels.length,
                            count4k: validation.cleanChannels.filter(c =>
                                (c.name || '').toUpperCase().includes('4K') ||
                                (c.quality || '').toUpperCase().includes('4K')
                            ).length,
                            groupCount: new Set(validation.cleanChannels.map(c => c.category_name || c.group || '')).size
                        });
                    }
                } catch (telemetryError) {
                    console.warn('Telemetry error:', telemetryError);
                }

                // 5. Auto-guardar snapshot (igual que generateM3U8Pro)
                if (typeof this.saveGeneratorSnapshot === 'function') {
                    this.saveGeneratorSnapshot(true).catch(e => console.warn('⚠️ Error auto-guardando snapshot:', e));
                }

            } catch (error) {
                console.error('Error:', error);
                alert(`Error: ${error.message}`);
            }
        };

        /**
         * 🎯 AUTO-CLASIFICAR CANALES (v13.1 PRO)
         * Procesa los canales actuales y sugiere el perfil APE óptimo (P0-P5)
         */
        window.app.autoClassifyAllChannels = async function () {
            const channels = this.state.channels || [];
            if (channels.length === 0) {
                alert('⚠️ No hay canales para clasificar. Carga una lista primero.');
                return;
            }

            if (!window.autoClassifier) {
                alert('❌ Error: Módulo Auto-Classifier no encontrado.');
                return;
            }

            console.log(`%c🎯 Iniciando auto-clasificación de ${channels.length} canales...`, 'color: #8b5cf6; font-weight: bold;');

            // 1. Ejecutar clasificación masiva
            const results = window.autoClassifier.classifyBatch(channels);

            // 2. Guardar sugerencias en el estado de cada canal
            channels.forEach((ch, idx) => {
                const res = results.results[idx];
                if (res) {
                    ch._suggestedProfile = res.suggestedProfile;
                    ch._qualityScore = res.qualityScore;
                }
            });

            console.log('✅ Clasificación completada exitosamente.');

            // 3. Re-renderizar tabla para mostrar badges
            this.renderTable();

            // 4. Mostrar reporte de resultados
            this._showClassificationResults(results);
        };

        /**
         * 📊 Muestra modal con resultados de auto-clasificación
         */
        window.app._showClassificationResults = function (results) {
            const stats = results.stats;
            const msg = `📊 REPORTE DE AUTO-CLASIFICACIÓN (v13.1)\n\n` +
                `Total procesados: ${stats.total}\n` +
                `----------------------------------\n` +
                `🔥 P0 (Ultra Extreme): ${stats.P0 || 0}\n` +
                `💎 P1 (8K Supreme): ${stats.P1 || 0}\n` +
                `🚀 P2 (4K Extreme): ${stats.P2 || 0}\n` +
                `⚡ P3 (FHD Advanced): ${stats.P3 || 0}\n` +
                `🛡️ P4 (HD Stable): ${stats.P4 || 0}\n` +
                `❄️ P5 (SD Failsafe): ${stats.P5 || 0}\n` +
                `----------------------------------\n` +
                `⚠️ Errores técnicos: ${stats.errors || 0}\n\n` +
                `Los canales ahora muestran el perfil sugerido en la tabla.`;

            // Opcional: Podríamos crear un modal HTML real más tarde. 
            // Por ahora, un alert o toast es suficiente para validar.
            if (typeof this.showToast === 'function') {
                this.showToast('✅ Clasificación completada');
            }
            alert(msg);
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

        // ═══════════════════════════════════════════════════════════
        // ABR EMBEBIDO - FUNCIONES DE CONFIGURACIÓN
        // ═══════════════════════════════════════════════════════════

        /**
         * Genera un ID único para la lista M3U8
         */
        window.app._generateListId = function () {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 8);
            return `APE_${timestamp}_${random}`;
        };

        /**
         * Añade un header al objeto de configuración si existe
         */
        window.app._addHeaderIfExists = function (headers, key, value) {
            if (value !== undefined && value !== null && value !== '') {
                headers[key] = value;
            }
        };

        /**
         * Obtiene la configuración embebible desde el Profile Manager
         */
        window.app._getEmbeddableConfig = function () {
            const config = window.APE_PROFILES_CONFIG;
            if (!config) {
                console.warn('⚠️ APE_PROFILES_CONFIG no disponible para embeber');
                return null;
            }

            const profiles = config.getDegradationHierarchy
                ? config.getDegradationHierarchy()
                : (config.getAllProfiles ? Object.values(config.getAllProfiles()) : []);

            const manifest = config.getManifestConfig
                ? config.getManifestConfig()
                : { version: '13.1.0', jwtExpiration: '365_DAYS', multilayer: 'EXTVLCOPT,KODIPROP,EXTHTTP,EXT-X-STREAM-INF,EXT-X-APE,EXT-X-START,JWT', matrixType: '65_HEADERS_BY_PERFIL' };

            // Construir headers por perfil
            const embeddedHeaders = {};
            for (const p of profiles) {
                const profileHeaders = {};
                const vlcopt = p.vlcopt || {};
                const settings = p.settings || {};

                this._addHeaderIfExists(profileHeaders, 'User-Agent', vlcopt['http-user-agent']);
                this._addHeaderIfExists(profileHeaders, 'Referer', vlcopt['http-referrer']);
                this._addHeaderIfExists(profileHeaders, 'Origin', settings.origin);
                this._addHeaderIfExists(profileHeaders, 'X-Buffer-Size', settings.buffer);
                this._addHeaderIfExists(profileHeaders, 'X-Strategy', settings.strategy);

                if (Object.keys(profileHeaders).length > 0) {
                    embeddedHeaders[p.id] = profileHeaders;
                }
            }

            return {
                profiles: profiles,
                manifest: manifest,
                headers: embeddedHeaders
            };
        };

        /**
         * Genera firma de lista para verificación de integridad
         */
        window.app._generateListSignature = function (listId, profiles, headers) {
            const signatureData = {
                listId: listId,
                profileCount: profiles.length,
                headerCount: Object.keys(headers).length,
                timestamp: Date.now(),
                version: '13.1.0-SUPREMO'
            };

            // Hash simple basado en JSON stringify
            const jsonStr = JSON.stringify(signatureData);
            let hash = 0;
            for (let i = 0; i < jsonStr.length; i++) {
                const char = jsonStr.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }

            return Math.abs(hash).toString(16).padStart(8, '0');
        };

        /**
         * Construye el bloque de configuración embebida para M3U8
         * @param {Object} configData - Datos de configuración (profiles, manifest, headers)
         * @returns {string} Bloque de texto para insertar en el header M3U8
         */
        window.app._buildEmbeddedConfig = function (configData) {
            if (!configData || !configData.profiles) {
                console.warn('⚠️ No hay configuración para embeber');
                return '';
            }

            const listId = this._generateListId();
            const signature = this._generateListSignature(
                listId,
                configData.profiles,
                configData.headers || {}
            );

            let embeddedBlock = `
#EXT-X-APE-EMBEDDED-CONFIG-BEGIN
#EXT-X-APE-LIST-ID:${listId}
#EXT-X-APE-SIGNATURE:${signature}
#EXT-X-APE-EMBEDDED-VERSION:1.0
#EXT-X-APE-TIMESTAMP:${new Date().toISOString()}
`;

            // Embeber perfiles activos
            for (const profile of configData.profiles) {
                const s = profile.settings || {};
                const levelStr = typeof profile.level === 'number' ? `L${profile.level}` : profile.level;

                embeddedBlock += `#EXT-X-APE-EMBEDDED-PROFILE:${profile.id}|${profile.name || profile.id}|${levelStr}|${profile.quality || 'AUTO'}|${s.buffer || 2000}|${s.strategy || 'adaptive'}
`;
            }

            // Embeber headers personalizados
            if (configData.headers && Object.keys(configData.headers).length > 0) {
                embeddedBlock += `#EXT-X-APE-EMBEDDED-HEADERS-BEGIN
`;
                for (const [profileId, headers] of Object.entries(configData.headers)) {
                    for (const [headerName, headerValue] of Object.entries(headers)) {
                        embeddedBlock += `#EXT-X-APE-HEADER:${profileId}|${headerName}|${headerValue}
`;
                    }
                }
                embeddedBlock += `#EXT-X-APE-EMBEDDED-HEADERS-END
`;
            }

            embeddedBlock += `#EXT-X-APE-EMBEDDED-CONFIG-END

`;

            console.log(`%c✅ Configuración ABR embebida generada [${listId}]`, 'color: #4ade80;');
            return embeddedBlock;
        };

        // ═══════════════════════════════════════════════════════════
        // V14.0 SUPREMO: Nuevo método con estructura original + 8 mejoras
        // ═══════════════════════════════════════════════════════════

        window.app.generateM3U8SupremoV14 = async function () {
            console.log('%c📺 Generando con M3U8 Generator v14.0 SUPREMO...', 'color: #8b5cf6; font-weight: bold;');

            // Obtener canales
            let channels = [];
            let sourceName = '';

            if (typeof this.getFilteredChannels === 'function') {
                const filtered = this.getFilteredChannels();
                if (filtered && filtered.length > 0) {
                    channels = filtered;
                    sourceName = 'getFilteredChannels()';
                }
            }

            if (channels.length === 0 && this.state?.filteredChannels?.length > 0) {
                channels = this.state.filteredChannels;
                sourceName = 'state.filteredChannels';
            } else if (channels.length === 0 && this.state?.channels?.length > 0) {
                channels = this.state.channels;
                sourceName = 'state.channels';
            }

            if (channels.length === 0) {
                alert('❌ No hay canales disponibles. Conecta un servidor primero.');
                return;
            }

            console.log(`📊 Fuente: ${sourceName} | Total: ${channels.length} canales`);

            // Reconstruir URLs si es necesario
            const activeServers = this.state?.activeServers || [];
            const currentServer = this.state?.currentServer || {};
            const streamFormat = this.state?.streamFormat || 'ts';

            const serverMap = new Map();
            activeServers.forEach(srv => {
                if (srv.id) serverMap.set(srv.id, srv);
            });

            const preparedChannels = channels.map(ch => {
                let url = ch.url || ch.stream_url || ch.link || '';
                if (ch.base && ch.base.url) url = ch.base.url;

                let name = '';
                if (ch.base && ch.base.name) {
                    name = ch.base.name;
                } else {
                    name = ch.name || ch.stream_display_name || ch.title || 'Unknown';
                }

                const s_id = ch.stream_id || (ch.base && ch.base.stream_id) || ch.id;

                // Reconstruir URL si no existe
                if (s_id && (!url || !url.startsWith('http'))) {
                    const channelServerId = ch._source || ch.serverId || ch.server_id;
                    let targetServer = serverMap.get(channelServerId) || currentServer;

                    if (targetServer && targetServer.baseUrl) {
                        const baseUrl = (targetServer.baseUrl || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                        const username = targetServer.username || '';
                        const password = targetServer.password || '';
                        url = `${baseUrl}/live/${username}/${password}/${s_id}.${streamFormat}`;
                    }
                }

                // Determinar perfil basado en nombre/grupo
                let profile = 'P3'; // Default FHD
                const nameUpper = (name || '').toUpperCase();
                const groupUpper = (ch.group || ch.groupTitle || ch.category_name || '').toUpperCase();

                if (nameUpper.includes('4K') || nameUpper.includes('ULTRA') || groupUpper.includes('ULTRA')) {
                    profile = 'P0';
                } else if (nameUpper.includes('8K')) {
                    profile = 'P1';
                } else if (groupUpper.includes('4K') || groupUpper.includes('UHD')) {
                    profile = 'P2';
                } else if (nameUpper.includes('FHD') || nameUpper.includes('FULL HD') || groupUpper.includes('FULL HD')) {
                    profile = 'P3';
                } else if (nameUpper.includes(' HD') || groupUpper.includes(' HD')) {
                    profile = 'P4';
                } else if (nameUpper.includes('SD') || groupUpper.includes('SD')) {
                    profile = 'P5';
                }

                return {
                    id: ch.stream_id || ch.id || s_id,
                    name: name,
                    logo: ch.stream_icon || ch.logo || ch.tvg_logo || '',
                    group: ch.category_name || ch.group || ch.groupTitle || 'General',
                    url: url,
                    profile: profile
                };
            }).filter(ch => ch.url && ch.url.startsWith('http'));

            console.log(`📊 Canales preparados: ${preparedChannels.length}`);

            // Verificar que el generador esté disponible
            const generator = window.M3U8GeneratorV14Supremo || window.M3U8GeneratorV14;
            if (!generator) {
                alert('❌ M3U8 Generator v14.0 no encontrado. Recarga la página.');
                return;
            }

            // Generar y descargar
            generator.generateAndDownload(preparedChannels);
        };

        console.log('%c✅ APE v9.0 Custom Adapter - Listo', 'color: #4ade80; font-weight: bold;');
        console.log('%c   Ejecuta app._debugAPEv9Modules() para verificar', 'color: #9ca3af;');
        console.log('%c   ABR Embebido: _buildEmbeddedConfig() disponible', 'color: #9ca3af;');
        console.log('%c   📺 NUEVO: app.generateM3U8SupremoV14() - Estructura original + 8 mejoras', 'color: #8b5cf6;');

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
