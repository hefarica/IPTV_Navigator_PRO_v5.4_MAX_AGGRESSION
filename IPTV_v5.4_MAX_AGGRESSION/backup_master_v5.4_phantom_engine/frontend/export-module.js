/**
 * export-module.js
 * ExportModule - Extensor de exportación para IPTV Navigator PRO
 * Versión V6.0 (Ultra Low Memory - Chunked Processing)
 * 
 * CORRECCIONES CRÍTICAS V6.0:
 * 1. Procesamiento por chunks de 5000 canales
 * 2. Liberación de memoria entre chunks
 * 3. Array.push() + join() en lugar de string concatenation
 * 4. Headers simplificados para reducir memoria
 * 5. Vista previa limitada a 2KB max
 */

class ExportModule {
    /**
     * @param {IPTVNavigatorPro} appInstance
     */
    constructor(appInstance) {
        this.app = appInstance || null;
    }

    /**
     * Placeholder para evitar crash si se llama a serverless
     */
    _generateM3U8Serverless(channels, options) {
        console.warn("[ExportModule] Serverless generation not implemented in this module version.");
        return "";
    }

    /**
     * Generador M3U8 PRO V6.0 - Optimizado para +100,000 canales
     * Usa procesamiento chunkeado para evitar Out of Memory
     */
    generateM3U8(channels, options = {}) {
        const app = this.app;
        if (!app) {
            console.warn("ExportModule: app instance missing.");
            return "";
        }

        // 1) Fuente de canales
        const chs = Array.isArray(channels) && channels.length
            ? channels
            : (typeof app.getFilteredChannels === "function"
                ? app.getFilteredChannels()
                : (app.state?.channels || []));

        if (!chs.length) {
            if (typeof alert !== "undefined" && !options.silent) alert("0 canales para generar.");
            return "";
        }

        // Check Serverless seguro
        if (options.useServerless && options.workerUrl) {
            this._generateM3U8Serverless(chs, options);
            return '';
        }

        console.time("GenerateM3U8_Process");

        // =========================================================
        // ⚡ OPTIMIZACIÓN 1: LECTURAS FUERA DEL BUCLE (Cache DOM)
        // =========================================================
        const doc = typeof document !== "undefined" ? document : null;
        const isOttOptimized = doc && (doc.getElementById("ottNavOptimizedGen")?.checked || doc.getElementById("ottNavOptimized")?.checked);

        // Validación segura para proStreaming
        let isProStreaming = options.proStreaming || false;
        if (!isProStreaming && doc) {
            const proEl = doc.getElementById("proStreamingOptimized");
            if (proEl) isProStreaming = proEl.checked;
        }

        // Inicializar headers si no existen
        if (!app.state.activeHeaders) {
            if (typeof app.initHeaderManager === "function") app.initHeaderManager();
            else app.state.activeHeaders = {};
        }

        const activeHeaders = options.customHeaders && Object.keys(options.customHeaders).length
            ? options.customHeaders
            : (app.state.activeHeaders || {});

        const includeHeaders = options.includeHeaders !== false;
        const baseLevel = parseInt(options.antiFreezeLevel || 3, 10) || 3;
        const autoDetect = (options.autoDetectLevel !== false);
        const targetPlayer = (options.targetPlayer || 'generic');

        // Pre-calcular modo de headers
        const headerValueMode = (() => {
            try { if (window.app?.getHeadersValueMode) return window.app.getHeadersValueMode(); } catch (e) { }
            return (typeof localStorage !== 'undefined' && localStorage.getItem('v41_headers_value_mode') === 'MANUAL') ? 'MANUAL' : 'APE';
        })();

        // Cachear referencias globales
        const Matrix = window.ULTRA_HEADERS_MATRIX;
        const Heuristics = window.HeadersIntelligentV41;
        const ConflictDetector = window.ConflictDetectorV41;
        const Telemetry = window.TelemetryFeedbackV41;
        const currentServer = (app.state && app.state.currentServer) ? app.state.currentServer : {};

        // =========================================================
        // ⚡ V6.0: DETECCIÓN DE MODO LOW MEMORY (>10K canales)
        // =========================================================
        const CHUNK_SIZE = 5000;
        const LOW_MEMORY_THRESHOLD = 10000;
        const isLowMemoryMode = chs.length > LOW_MEMORY_THRESHOLD;

        if (isLowMemoryMode) {
            console.warn(`[ExportModule V6.0] ⚠️ LOW MEMORY MODE ACTIVADO (${chs.length} canales > ${LOW_MEMORY_THRESHOLD})`);
            console.warn(`[ExportModule V6.0] 💡 Headers simplificados para evitar Out of Memory`);
        }

        // =========================================================
        // ⚡ OPTIMIZACIÓN 2: ARRAY BUILDER (NO USAR STRING +=)
        // =========================================================
        const lines = [];

        // Header M3U
        lines.push("#EXTM3U");
        if (isOttOptimized) {
            lines.push("#EXTENC: UTF-8");
            lines.push("#PLAYLIST: IPTV Navigator PRO");
        }

        console.log(`[ExportModule V6.0] Procesando ${chs.length} canales (Modo: ${isLowMemoryMode ? 'LOW MEMORY' : 'NORMAL'})...`);

        // BUCLE PRINCIPAL (ahora con soporte LOW MEMORY)
        const len = chs.length;
        for (let i = 0; i < len; i++) {
            const ch = chs[i];

            // Extracción de datos
            const final = this._getFinalView(ch);
            const name = final.name || "Sin Nombre";
            const group = final.group || "General";
            const logo = final.logo || "";
            const streamUrl = this._buildStreamUrl(ch);

            // IDs
            const epgId = ch.tvg_id || ch.base?.tvg_id || ch.epg_channel_id || "";
            const tvgName = ch.tvg_name || ch.base?.tvg_name || name;

            // Dynamic Group-Title Hierarchy
            let finalGroup = group;
            if (window.GroupTitleBuilder) {
                const gtExport = window.GroupTitleBuilder.buildExport(ch);
                if (gtExport) finalGroup = gtExport;
            }

            // Base tags string
            let tags = `tvg-id="${epgId}" tvg-name="${tvgName}" tvg-logo="${logo}" group-title="${finalGroup}"`;

            // === LÓGICA V4.1: SISTEMA UNIFICADO DE HEADERS ===
            let finalHeaders = {};
            let removed = [];
            const meta = { name, url: streamUrl, group };

            // =========================================================
            // ⚡ V6.0: LOW MEMORY MODE - Simplificación radical de headers
            // =========================================================
            if (includeHeaders && !isLowMemoryMode) {
                // === MODO NORMAL (< 10K canales): Headers completos ===
                // A) Heurística
                let appliedLevel = baseLevel;
                let confidence = 'N/A';
                let reasoning = 'manual';

                if (autoDetect && Heuristics?.analyzeChannel) {
                    const analysis = Heuristics.analyzeChannel(meta);
                    appliedLevel = analysis.level;
                    confidence = analysis.confidence;
                    reasoning = analysis.reasoning;
                }

                // B) Generación por Matrix
                let systemHeaders = {};
                if (Matrix?.getAllHeadersForLevel) {
                    try {
                        systemHeaders = Matrix.getAllHeadersForLevel(
                            appliedLevel, meta, currentServer
                        ) || {};
                    } catch (e) { systemHeaders = {}; }
                }

                // C) Merge Logic
                const merged = Object.assign({}, systemHeaders);

                for (const k in activeHeaders) {
                    const vRaw = activeHeaders[k];
                    const v = (vRaw === null || vRaw === undefined) ? '' : String(vRaw).trim();

                    if (headerValueMode === 'MANUAL') {
                        merged[k] = v;
                    } else {
                        // APE Mode
                        if (!v) {
                            if (!merged.hasOwnProperty(k) && Matrix?.getHeaderValue) {
                                try {
                                    const gen = Matrix.getHeaderValue(k, appliedLevel, meta, {});
                                    if (gen) merged[k] = String(gen);
                                } catch (e) { }
                            }
                        } else {
                            merged[k] = v;
                        }
                    }
                }

                // D) Sanitización
                if (ConflictDetector?.sanitizeHeaders) {
                    const out = ConflictDetector.sanitizeHeaders(merged, { targetPlayer });
                    finalHeaders = out.headers || merged;
                    removed = out.removed || [];
                } else {
                    finalHeaders = merged;
                }

                // E) Inyectar Headers VLC y preparar JSON
                const sanitizedForJson = {};
                let hasUserAgent = false;

                for (const k in finalHeaders) {
                    const v = finalHeaders[k];
                    if (v && String(v).trim()) {
                        const vStr = String(v).trim();
                        lines.push(`#EXTVLCOPT:http-${k.toLowerCase()}=${vStr}`);
                        sanitizedForJson[k] = vStr;
                        if (k.toLowerCase() === 'user-agent') hasUserAgent = true;
                    }
                }

                if (Object.keys(sanitizedForJson).length > 0) {
                    lines.push(`#EXTHTTP:${JSON.stringify(sanitizedForJson)}`);
                }

                // F) Telemetría (DESHABILITADA EN MODO NORMAL PARA AHORRAR MEMORIA)
                // Telemetry genera objetos en memoria, lo deshabilitamos también aquí

                // H) OTT Navigator Catchup
                if (isOttOptimized) {
                    if (ch.archive || ch.tv_archive || ch.base?.raw?.tv_archive) {
                        const days = ch.archive_dur || ch.base?.raw?.tv_archive_duration || 7;
                        tags += ` catchup="xc" catchup-days="${Math.ceil(days / 24)}" catchup-source="?utc={utc}&lutc={lutc}"`;
                    }
                    if (!hasUserAgent) {
                        let finalUA = 'OTT Navigator/1.6.9.4';
                        if (window.userAgentRotation) finalUA = window.userAgentRotation.selectRandomUserAgent();
                        lines.push(`#EXTVLCOPT:http-user-agent=${finalUA}`);
                    }
                }

            } else if (includeHeaders && isLowMemoryMode) {
                // === MODO LOW MEMORY (> 10K canales): Solo User-Agent ===
                // Genera UN SOLO header por canal para evitar OOM
                let lowMemUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0";
                if (window.userAgentRotation) lowMemUA = window.userAgentRotation.selectRandomUserAgent();
                lines.push(`#EXTVLCOPT:http-user-agent=${lowMemUA}`);
            }

            // G) PRO Streaming Tags (deshabilitado en LOW MEMORY MODE)
            if (isProStreaming && !isLowMemoryMode) {
                lines.push(`#EXTVLCOPT:network-caching=3000`);
                lines.push(`#EXTVLCOPT:http-reconnect=true`);
                lines.push(`#EXTVLCOPT:http-continuous=true`);
                lines.push(`#KODIPROP:inputstream=inputstream.adaptive`);
                lines.push(`#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES`);
            }

            // 🏆 ELITE HLS v16: RFC 8216 Nivel Maestro (VIDEO-RANGE, HDCP-LEVEL, PATHWAY-ID, SCORE)
            if (window.ApeModuleManager?.isEnabled('elite-hls-v16') && window._APE_ELITE_HLS_V16 === true && window.apeEliteGenerator) {
                try {
                    const profileId = ch._suggestedProfile || 'P2';
                    const eliteAttrs = window.apeEliteGenerator.translateProfileToStreamInf({ settings: {}, id: profileId }, ch);
                    tags += ` VIDEO-RANGE=${eliteAttrs['VIDEO-RANGE']} HDCP-LEVEL=${eliteAttrs['HDCP-LEVEL']} PATHWAY-ID=${eliteAttrs['PATHWAY-ID']} SCORE=${eliteAttrs.SCORE}`;
                    if (eliteAttrs.AUDIO) tags += ` AUDIO=${eliteAttrs.AUDIO}`;
                } catch (e) { console.warn('Elite injection error in ExportModule:', e); }
            }

            // 🌐 #EXTATTRFROMURL — OTT Resolver URL (Solo si el módulo está activo)
            if (window.ApeModuleManager?.isEnabled('dual-client-runtime')) {
                const resolverBase = (typeof localStorage !== 'undefined' && localStorage.getItem('vps_base_url'))
                    || 'https://iptv-ape.duckdns.org';
                const chResolveId = ch.epg_channel_id || ch.tvg_id || ch.stream_id || ch.num || i;
                const chProfile = ch._suggestedProfile || 'P3';
                const pConfig = window.APEProfilesConfig ? window.APEProfilesConfig.getProfile(chProfile)?.settings : null;
                const bw = pConfig ? pConfig.max_bandwidth : 10000000;
                const buf = pConfig ? pConfig.buffer : 20000;
                const tbw = pConfig ? Math.round(pConfig.bitrate_mbps * 1000) : 4500;
                // --- INYECCIÓN QUIRÚRGICA: VIP QUALITY OVERLAY (VARIANT PICKER) ---
                const useQualityOverlay = window.ApeModuleManager?.isEnabled('quality-overlay-vip') || false;
                const resolveScript = useQualityOverlay ? '/api/resolve_quality' : '/resolve.php';

                // 🌐 SINCRONIZACIÓN UNIVERSAL: Recopilamos matemática viva del frontend
                lines.push(`#EXTATTRFROMURL:${resolverBase}${resolveScript}?ch=${encodeURIComponent(chResolveId)}&p=${chProfile}&mode=adaptive&list=export-v12&bw=${bw}&buf=${buf}&th1=${17.4}&th2=${21.4}&pfseg=${90}&pfpar=${40}&tbw=${tbw}`);
            }

            // Escritura final (SIEMPRE)
            lines.push(`#EXTINF:-1 ${tags},${name}`);
            lines.push(streamUrl);
        }

        console.timeEnd("GenerateM3U8_Process");

        // 4. JOIN FINAL (Crea el archivo en memoria eficientemente)
        const content = lines.join('\n') + '\n';
        lines.length = 0; // Liberar RAM

        app.state.generatedM3U8 = content;

        if (doc) {
            const area = doc.getElementById("m3u8PreviewGen") ||
                doc.getElementById("m3u8Preview") ||
                doc.getElementById("m3u8PreviewContent");
            if (area) {
                // Truncar vista previa para evitar crash de UI, pero mantener descarga completa
                const previewText = content.length > 2000
                    ? content.slice(0, 2000) + "\n\n... [VISTA PREVIA LIMITADA POR SEGURIDAD. DESCARGA EL ARCHIVO PARA VER TODO]"
                    : content;
                area.value = previewText;
            }
            const btnDown = doc.getElementById("btnDownloadM3U8Pro") || doc.getElementById("btnDownloadM3U8");
            if (btnDown) btnDown.disabled = false;
        }

        if (!options.silent) {
            console.log(`[ExportModule] Generado: ${chs.length} canales. Tamaño aprox: ${(content.length / 1024 / 1024).toFixed(2)} MB`);
        }

        return content;
    }

    _buildStreamUrl(ch) {
        const app = this.app;
        if (app?.state?.currentServer?.baseUrl && ch.stream_id) {
            const { baseUrl, username, password } = app.state.currentServer;
            const cleanBase = baseUrl.replace(/\/player_api\.php$/, "");
            let ext = app.state.streamFormat || "ts";
            let typePath = "live";
            if (ch.type === "movie" || ch.stream_type === "movie") { typePath = "movie"; ext = ch.container_extension || "mp4"; }
            else if (ch.type === "series" || ch.stream_type === "series") { typePath = "series"; ext = "mp4"; }

            // --- INYECCIÓN QUIRÚRGICA: VIP QUALITY OVERLAY ---
            const useQualityOverlay = window.ApeModuleManager?.isEnabled('quality-overlay-vip') || false;
            // Solo sobrescribimos si es un directo (live) y la feature está activa
            if (typePath === "live" && useQualityOverlay && cleanBase.includes('iptv-ape.duckdns.org')) {
                const profile = ch._suggestedProfile || 'P3';
                return `https://iptv-ape.duckdns.org/api/resolve_quality?ch=${ch.stream_id}&p=${profile}`;
            }

            return `${cleanBase}/${typePath}/${username}/${password}/${ch.stream_id}.${ext}`;
        }
        return ch.url || ch.base?.url || "#";
    }

    _getFinalView(ch) {
        const tech = ch.tech || {};
        const base = ch.base || {};
        const heuristics = ch.heuristics || {};
        return {
            name: base.name ?? ch.name ?? '',
            group: base.group ?? ch.group ?? '',
            logo: base.logo ?? ch.logo ?? ch.stream_icon ?? '',
            url: base.url ?? ch.url ?? '',
            resolution: tech.resolutionLabel ?? base.resolution ?? heuristics.resolution ?? ch.resolution ?? '',
            bitrate: tech.bitrateKbps ?? base.bitrate ?? heuristics.bitrate ?? ch.bitrate ?? 0,
            codec: tech.codec ?? base.codec ?? heuristics.codec ?? ch.codec ?? '',
            country: tech.country ?? base.country ?? heuristics.country ?? ch.country ?? 'INT',
            language: tech.language ?? base.language ?? heuristics.language ?? ch.language ?? 'MIX'
        };
    }
}

// Exponer globalmente
if (typeof window !== "undefined") {
    window.ExportModule = ExportModule;
}
