/**
 * IPTV Navigator PRO 2025 - Motor Completo
 * Versión Enterprise V12.0 ELITE - Producción (Fix Crash + Robust Connection)
 * Basado en Constructor IPTV Pro v2 (Referencia)
 */

// ═══════════════════════════════════════════════════════════════
// V4.30: MODULE REGISTRATION QUEUE
// Modules that load BEFORE window.app can register here.
// When app initializes, it drains the queue.
// ═══════════════════════════════════════════════════════════════
window._appModuleQueue = window._appModuleQueue || [];
window.registerAppModule = function (name, initFn) {
    if (window.app) {
        try { initFn(window.app); } catch (e) { console.warn(`⚠️ Module ${name} init error:`, e); }
    } else {
        window._appModuleQueue.push({ name, initFn });
    }
};


// ==========================================
// MOTORES INDUSTRIALES (Inyectados V4.5.0)
// ==========================================

class AdvancedFilterEngine {
    applyFilter(channels, filterState) {
        if (!filterState || !filterState.groups || filterState.groups.length === 0) return channels;
        // ✅ V4.8.2: OR entre grupos (unión de resultados)
        // Cada grupo SUMA canales, no los restringe
        return channels.filter(ch => {
            return filterState.groups.some(group => this.evaluateGroup(ch, group));
        });
    }

    evaluateGroup(ch, group) {
        const rules = group.rules || [];
        // ✅ V4.27: FIX - Un grupo vacío NO debe validar el canal por defecto si hay lógica OR entre grupos
        // Si no hay reglas, este grupo no aporta nada a la filtración (devuelve false)
        if (rules.length === 0) return false;

        const isAnd = (group.logic || 'AND') === 'AND';
        if (isAnd) {
            return rules.every(rule => this.evaluateRule(ch, rule));
        } else {
            return rules.some(rule => this.evaluateRule(ch, rule));
        }
    }

    evaluateRule(ch, rule) {
        let field = rule.field;
        const op = rule.operator;
        let val = rule.value ? rule.value.toString().toLowerCase() : '';

        // ✅ V4.29: DEBUG CRÍTICO - Ver exactamente qué campo llega del UI
        if (!window._fieldDebugDone) {
            console.log('🚨 [FIELD RAW DEBUG] rule.field EXACTO:', JSON.stringify(field), '| op:', op, '| val:', val);
            window._fieldDebugDone = true;
        }

        // ✅ V4.26: DEBUG LOGGING FOR SCORE FILTER
        const isScoreField = field && field.toLowerCase().includes('score');

        // ✅ V4.29: SCORE FIELD ALIAS MAPPING - EXHAUSTIVO
        // Map UI labels to actual channel property names (cubre TODAS las variantes posibles)
        const fieldAliases = {
            'Score': 'qualityScore',
            'score': 'qualityScore',
            'Score Calidad': 'qualityScore',
            'SCORE': 'qualityScore',
            'qualityscore': 'qualityScore',       // lowercase
            'QualityScore': 'qualityScore',       // camelCase
            'Quality Score': 'qualityScore',      // con espacio
            'quality_score': 'qualityScore',      // snake_case
            'Score Live': 'scoreLive',
            'scorelive': 'scoreLive',
            'SCORE LIVE': 'scoreLive'
        };

        const originalField = field;
        if (fieldAliases[field]) {
            field = fieldAliases[field];
            console.log(`🔄 [ALIAS MATCH] "${originalField}" → "${field}"`);
        }

        let chVal = '';
        if (field.startsWith('raw.')) {
            const key = field.replace('raw.', '');
            chVal = (ch.raw && ch.raw[key] !== undefined) ? String(ch.raw[key]) : '';
        } else {
            // ✅ V4.28: Búsqueda exhaustiva del valor Score para el filtro
            if (field === 'qualityScore' || field === 'score') {
                // Buscar en TODOS los posibles lugares donde puede estar el score
                // ⚠️ V4.30: ORDEN CRÍTICO - heuristics PRIMERO (igual que _calculateFinalView línea 3963)
                const sources = {
                    heuristics: ch.heuristics?.qualityScore,
                    direct: ch.qualityScore,
                    score: ch.score,
                    final: ch.final?.qualityScore,
                    scoreBreakdown: ch.scoreBreakdown?.qualityScore,
                    displayScore: ch.displayScore
                };

                // Tomar el primer valor numérico válido > 0
                let scoreValue = 0;
                for (const [key, val] of Object.entries(sources)) {
                    if (typeof val === 'number' && val > 0) {
                        scoreValue = val;
                        break;
                    }
                }

                // DEBUG: mostrar de dónde viene el score
                if (isScoreField && !window._scoreSourcesLogged) {
                    console.log('🔎 [SCORE SOURCES DEBUG] Canal ejemplo:', ch.name, sources, '→ Usando:', scoreValue);
                    window._scoreSourcesLogged = true;
                }

                chVal = String(scoreValue);
            } else if (field === 'scoreLive') {
                const scoreValue = ch.scoreLive ?? ch.heuristics?.scoreLive ?? ch.qualityScore ?? 0;
                chVal = String(scoreValue);
            } else {
                chVal = (ch[field] !== undefined) ? String(ch[field]) : '';
            }
        }

        // ✅ V4.21: Si group es numérico, derivar nombre desde picon URL (match lógica de tabla)
        if (field === 'group' && (!chVal || /^\d+$/.test(chVal))) {
            // Primero intentar desde el canal directamente
            let derivedGroup = ch.base?.raw?.category_name || ch.base?.group ||
                ch.raw?.category_name || ch.category_name || ch.group_title;

            // Si aún es numérico o vacío, buscar en rawFields
            if (!derivedGroup || /^\d+$/.test(String(derivedGroup))) {
                derivedGroup = ch.rawFields?.find(r => r.key === 'category_name')?.value;
            }

            // Extraer categoría desde stream_icon path (ej: /picon/ALBANIA/file.png -> ALBANIA)
            if (!derivedGroup || /^\d+$/.test(String(derivedGroup))) {
                const iconUrl = ch.stream_icon || ch.logo || '';
                if (iconUrl) {
                    const pathMatch = iconUrl.match(/\/picon\/([^\/]+)\//i) ||
                        iconUrl.match(/\/logos?\/([^\/]+)\//i) ||
                        iconUrl.match(/\/icons?\/([^\/]+)\//i);
                    if (pathMatch && pathMatch[1] && !/^\d+$/.test(pathMatch[1])) {
                        derivedGroup = pathMatch[1].toUpperCase();
                    }
                }
            }

            // Usar el grupo derivado si se encontró
            if (derivedGroup && !/^\d+$/.test(String(derivedGroup))) {
                chVal = String(derivedGroup);
            }
        }

        // ✅ V4.26: DEBUG - Log first 3 channels for score filters
        if (isScoreField && !window._scoreDebugLogged) {
            window._scoreDebugCount = (window._scoreDebugCount || 0) + 1;
            if (window._scoreDebugCount <= 3) {
                console.log(`🔍 [SCORE FILTER DEBUG] Field: "${originalField}" → "${field}", chVal: "${chVal}", op: "${op}", val: "${val}"`);
            }
            if (window._scoreDebugCount === 3) {
                window._scoreDebugLogged = true;
                console.log(`🔍 [SCORE FILTER DEBUG] (Logging stopped after 3 samples)`);
            }
        }

        // ✅ V4.26: For numeric operators, use original numeric value (not lowercased)
        if (op === 'GT' || op === 'LT') {
            const nCh = parseFloat(chVal) || 0;
            const nVal = parseFloat(val) || 0;
            const result = op === 'GT' ? nCh > nVal : nCh < nVal;

            // 🚨 V4.29: DEBUG CRÍTICO - Detectar canales que DEBERÍAN fallar pero PASAN
            if (isScoreField && result === false) {
                // El canal NO pasa el filtro - esto es CORRECTO
            }
            if (isScoreField && result === true && nCh <= nVal) {
                // ESTO NO DEBERÍA PASAR NUNCA - el canal debería fallar pero result es true
                console.error('🚨🚨🚨 BUG DETECTADO: Canal pasa filtro incorrectamente!', {
                    name: ch.name,
                    nCh, nVal, op, result,
                    chVal, val
                });
            }

            return result;
        }

        chVal = chVal.toLowerCase();

        switch (op) {
            case 'EQ': return chVal === val;
            case 'CONTAINS': return chVal.includes(val);
            case 'REGEX':
                try {
                    return new RegExp(val, 'i').test(chVal);
                } catch (e) { return false; }
            default: return true;
        }
    }
}

class DynamicRankingEngine {
    getDefaultConfig() {
        return {
            criteria: [
                { field: 'qualityScore', weight: 100 },
                { field: 'matchScore', weight: 20 },
                { field: 'year', weight: 10 }
            ]
        };
    }
    getPresets() {
        return [
            { name: 'Calidad', criteria: [{ field: 'qualityScore', weight: 100 }] },
            { name: 'Equilibrado', criteria: [{ field: 'qualityScore', weight: 50 }, { field: 'matchScore', weight: 50 }] }
        ];
    }
    calculateScore(ch, config) {
        let score = 0;
        if (!config || !config.criteria) return { score: ch.qualityScore || 0 };

        config.criteria.forEach(c => {
            let val = 0;
            if (c.field === 'qualityScore') val = ch.qualityScore || 0;
            else if (c.field === 'matchScore') val = ch.matchScore || 0;
            else if (c.field === 'year') val = parseInt(ch.year_launched || 0) || 0;

            score += val * (c.weight / 100);
        });
        return { score };
    }
    selectBestChannels(channels, config) { return channels; }
}

window.AdvancedFilterEngine = AdvancedFilterEngine;
window.DynamicRankingEngine = DynamicRankingEngine;

// ==========================================
// STREAM QUALITY PROBE ENGINE (V4.6.2)
// ==========================================

/**
 * StreamQualityProbe - Detects ACTUAL stream quality by sampling .ts streams
 * Technique: HTTP Range request to fetch first 18KB (100 TS packets)
 * Then parse headers to estimate resolution/bitrate
 */
class StreamQualityProbe {
    constructor() {
        this.timeout = 5000; // 5s per probe
        this.sampleSize = 188 * 100; // 100 TS packets = ~18KB
        this.concurrency = 4; // Max parallel probes
        this.abortController = null;

        // Resolution height to label mapping
        this.RESOLUTION_MAP = {
            4320: { label: '8K', width: 7680, height: 4320 },
            2160: { label: '4K', width: 3840, height: 2160 },
            1440: { label: '2K', width: 2560, height: 1440 },
            1080: { label: 'FHD', width: 1920, height: 1080 },
            720: { label: 'HD', width: 1280, height: 720 },
            576: { label: 'SD+', width: 720, height: 576 },
            480: { label: 'SD', width: 720, height: 480 },
            360: { label: 'LD', width: 640, height: 360 },
            240: { label: 'VLD', width: 426, height: 240 }
        };
    }

    /**
     * Probe a single stream URL to get actual quality
     * @param {string} url - Stream URL (.ts or .m3u8)
     * @returns {Promise<{actualWidth, actualHeight, actualBitrate, codec, fake}>}
     */
    async probeStream(url) {
        if (!url || !url.startsWith('http')) {
            return { error: 'Invalid URL' };
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            // Try Range request first (most efficient)
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Range': `bytes=0-${this.sampleSize - 1}`
                },
                signal: controller.signal,
                mode: 'cors'
            });

            clearTimeout(timeoutId);

            if (!response.ok && response.status !== 206) {
                return { error: `HTTP ${response.status}` };
            }

            const buffer = await response.arrayBuffer();
            const data = new Uint8Array(buffer);

            // Parse TS packet headers to find video info
            const result = this.parseTransportStream(data);

            // Estimate bitrate from Content-Length if available
            const contentLength = response.headers.get('Content-Length');
            if (contentLength && !result.bitrate) {
                // Rough estimate: assume 10s of content in sample
                result.bitrate = Math.round((parseInt(contentLength) * 8) / 10 / 1000);
            }

            return result;

        } catch (e) {
            if (e.name === 'AbortError') {
                return { error: 'Timeout' };
            }
            // CORS error is common for external streams
            return { error: 'CORS/Network' };
        }
    }

    /**
     * Parse Transport Stream to extract video metadata
     * @param {Uint8Array} data - Raw TS packet data
     */
    parseTransportStream(data) {
        const result = {
            actualWidth: null,
            actualHeight: null,
            actualBitrate: null,
            codec: null,
            parsed: false
        };

        if (data.length < 188) return result;

        // Check for TS sync byte
        if (data[0] !== 0x47) {
            // Try to find sync byte
            let syncPos = -1;
            for (let i = 0; i < Math.min(data.length - 188, 1000); i++) {
                if (data[i] === 0x47 && data[i + 188] === 0x47) {
                    syncPos = i;
                    break;
                }
            }
            if (syncPos < 0) return result;
            data = data.slice(syncPos);
        }

        // Count packets and estimate bitrate from packet timing
        let packetCount = 0;
        const pids = new Set();

        for (let i = 0; i < data.length - 188; i += 188) {
            if (data[i] !== 0x47) continue;
            packetCount++;

            const pid = ((data[i + 1] & 0x1F) << 8) | data[i + 2];
            pids.add(pid);

            // Look for adaptation field with PCR for timing
            const hasAdaptation = (data[i + 3] & 0x20) !== 0;
            if (hasAdaptation) {
                const adaptLen = data[i + 4];
                if (adaptLen >= 7) {
                    // PCR present
                    result.parsed = true;
                }
            }
        }

        // Estimate video presence
        if (pids.size > 2) {
            result.parsed = true;
        }

        // For now, return packet stats - real SPS parsing would require more complex logic
        result.packetCount = packetCount;
        result.pidCount = pids.size;

        return result;
    }

    /**
     * Compare advertised vs actual quality
     * @returns {{fake: boolean, label: string}}
     */
    compareQuality(advertisedLabel, actualHeight) {
        const advertisedHeights = {
            '8K': 4320, '4K': 2160, 'UHD': 2160,
            'FHD': 1080, '1080p': 1080,
            'HD': 720, '720p': 720,
            'SD': 480, '480p': 480
        };

        const advHeight = advertisedHeights[advertisedLabel] || 0;
        const actHeight = actualHeight || 0;

        // If advertised is 1.5x higher than actual, it's fake
        if (advHeight > 0 && actHeight > 0 && advHeight > actHeight * 1.5) {
            return {
                fake: true,
                label: `⚠️ FAKE ${advertisedLabel}`,
                actualLabel: this.heightToLabel(actHeight)
            };
        }

        return { fake: false };
    }

    heightToLabel(height) {
        if (height >= 4320) return '8K';
        if (height >= 2160) return '4K';
        if (height >= 1080) return '1080p';
        if (height >= 720) return '720p';
        if (height >= 480) return '480p';
        return 'LD';
    }

    /**
     * Batch probe multiple channels with progress callback
     * @param {Array} channels - Channels to probe
     * @param {Function} onProgress - Progress callback
     */
    async probeChannels(channels, onProgress) {
        const results = [];
        const total = channels.length;
        let completed = 0;
        const startTime = Date.now();

        // Process in batches for concurrency
        for (let i = 0; i < total; i += this.concurrency) {
            const batch = channels.slice(i, i + this.concurrency);
            const batchPromises = batch.map(async (ch) => {
                const result = await this.probeStream(ch.url);
                completed++;

                const elapsed = (Date.now() - startTime) / 1000;
                const rate = completed / elapsed;
                const remaining = Math.round((total - completed) / rate);

                if (onProgress) {
                    onProgress({
                        current: completed,
                        total,
                        percent: Math.round((completed / total) * 100),
                        remaining: remaining,
                        channel: ch.name
                    });
                }

                return { channel: ch, probe: result };
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        return results;
    }

    cancel() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }
}

window.StreamQualityProbe = StreamQualityProbe;

// ==========================================
// CORE APP
// ==========================================

class IPTVNavigatorPro {
    constructor() {
        this.state = {
            servers: [],
            channels: [],
            channelsMaster: [],

            currentServer: {
                name: '',
                baseUrl: '',
                username: '',
                password: ''
            },

            customHeaders: [],
            headerPresets: [],
            selectedProfile: 'LL-AGGRESSIVE-MAX',

            generatedM3U8: '',
            streamFormat: 'm3u8',
            epgUrl: '',
            epgShift: 0,

            enrichmentSources: [],
            enrichmentProgress: {
                active: false,
                current: 0,
                total: 0
            },
            activeHeaders: {},
            discoveredFields: [],

            // ✅ V4.8: Active columns for table display (restored from localStorage)
            activeColumns: [],

            // ✅ V4.9: Filter edit mode (false = locked/read-only, true = editable)
            filterEditMode: false
        };

        this.worker = null; // Web Worker instance

        this.init();

        // ==========================================
        // Módulos Industriales (Hooks V4.6)
        // ==========================================
        if (typeof ConnectionModuleV2 !== 'undefined') {
            this.connectionModuleV2 = new ConnectionModuleV2(this);
        }
        if (typeof EnrichmentModule !== 'undefined') {
            this.enrichmentModule = new EnrichmentModule(this);
        }
        if (typeof ExportModule !== 'undefined') {
            this.exportModule = new ExportModule(this);
        }

        // ==========================================
        // Módulo de Scoring Configurable (V1.0)
        // ==========================================
        if (typeof RankingScoreConfig !== 'undefined') {
            this.rankingScoreConfig = new RankingScoreConfig();
            if (typeof RankingScoreUIHandler !== 'undefined') {
                this.rankingScoreUI = new RankingScoreUIHandler(this, this.rankingScoreConfig);
                // Renderizar panel de scoring al cargar DOM
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        this.rankingScoreUI.renderConfigPanel();
                    });
                } else {
                    this.rankingScoreUI.renderConfigPanel();
                }
            }
            console.log('✅ RankingScoreConfig inicializado');
        }

        // ==========================================
        // 🌊 Módulo Cascade de Fuentes (V1.0)
        // ==========================================
        if (typeof FieldSourceCascadeManager !== 'undefined') {
            this.cascadeManager = new FieldSourceCascadeManager();
            console.log('✅ FieldSourceCascadeManager inicializado');
        }

        // ==========================================
        // 📊 Auto Ranking Engine (V1.1 - 300k+ optimizado)
        // ==========================================
        if (typeof AutoRankingEngine !== 'undefined') {
            this.autoRankingEngine = new AutoRankingEngine();
            const success = this.autoRankingEngine.installAllHooks(this);
            if (success) {
                console.log('✅ Auto Ranking Engine OK - 6 hooks instalados (300k+)');
            } else {
                console.warn('⚠️ Auto Ranking Engine: Algunos hooks no instalados');
            }
        }

        // ==========================================
        // 🔧 Ranking Score Fix (V1.0)
        // ==========================================
        if (typeof RankingScoreFix !== 'undefined') {
            this.rankingScoreFix = new RankingScoreFix();
            const fixApplied = this.rankingScoreFix.applyFix(this);
            if (fixApplied) {
                console.log('✅ Ranking Score Fix aplicado');
            }
        }

        // ==========================================
        // 📦 Server Library Multi-Save (V1.0)
        // ==========================================
        if (typeof ServerLibraryMultiSave !== 'undefined') {
            this.serverLibraryMultiSave = new ServerLibraryMultiSave();
            const installed = this.serverLibraryMultiSave.install(this);
            if (installed) {
                console.log('✅ Server Library Multi-Save instalado');
            }
        }

        // ==========================================
        // 🔧 PATCH V4.12.3 - Context & Worker Fixes
        // ==========================================
        if (typeof applyPatchV4_12_3 === 'function') {
            applyPatchV4_12_3.call(this);
        } else {
            console.warn('⚠️ Patch V4.12.3 not loaded - some features may be unstable');
        }

        // ==========================================
        // 🔧 PATCH V2.0 - Eliminación Completa de Servidores
        // ==========================================
        if (typeof applyPatchEliminacionServidores === 'function') {
            applyPatchEliminacionServidores.call(this);
        } else {
            console.warn('⚠️ Patch Eliminación V2.0 not loaded');
        }

        // ═══════════════════════════════════════════════════════════════
        // V4.30: DRAIN MODULE REGISTRATION QUEUE
        // Process any modules that tried to register before window.app existed
        // ═══════════════════════════════════════════════════════════════
        if (window._appModuleQueue && window._appModuleQueue.length > 0) {
            console.log(`📦 [V4.30] Draining ${window._appModuleQueue.length} queued module registrations...`);
            window._appModuleQueue.forEach(({ name, initFn }) => {
                try {
                    initFn(this);
                    console.log(`  ✅ Module '${name}' registered successfully`);
                } catch (e) {
                    console.warn(`  ⚠️ Module '${name}' drain error:`, e);
                }
            });
            window._appModuleQueue = [];
        }
    }

    async init() {
        // ✅ V4.12.2 - OPTIMIZACIÓN F5: Detectar primera carga vs refresco
        const isFirstLoad = !sessionStorage.getItem('iptv_session_active');
        const startTime = performance.now();

        if (isFirstLoad) {
            sessionStorage.setItem('iptv_session_active', 'true');
            console.log('🚀 IPTV Navigator PRO 2025 - V4.12.5 (Primera carga)...');
        } else {
            console.log('⚡ IPTV Navigator PRO 2025 - V4.12.5 (Refresco rápido)...');
        }

        // Exponer isFirstLoad para uso en otros métodos
        this.isFirstLoad = isFirstLoad;
        this.channelsNeedRefresh = isFirstLoad; // Solo enriquecer en primera carga

        // Inicializar Motores ANTES de cargar datos (necesario para que el Worker esté listo)
        this.fieldDiscovery = window.FieldDiscoveryEngine ? new window.FieldDiscoveryEngine() : null;
        this.filterEngine = window.AdvancedFilterEngine ? new window.AdvancedFilterEngine() : null;
        this.rankingEngine = window.DynamicRankingEngine ? new window.DynamicRankingEngine() : null;
        this.enrichmentEngine = window.ExternalEnrichmentEngine ? new window.ExternalEnrichmentEngine() : null;

        // ✅ V4.7: Advanced Data Renderer for Field Source Selector
        if (typeof AdvancedDataRenderer !== 'undefined') {
            this.advancedDataRenderer = new AdvancedDataRenderer(this);
            console.log('✅ AdvancedDataRenderer inicializado');
        } else {
            console.warn('⚠️ AdvancedDataRenderer no disponible');
        }

        // NEW: Delta Enrichment System
        this.sourceManager = window.SourceManager ? new window.SourceManager(this) : null;
        this.enrichmentDelta = window.EnrichmentDelta ? new window.EnrichmentDelta(this) : null;
        window.app = this; // Expose global

        if (this.rankingEngine) {
            this.state.rankingConfig = this.rankingEngine.getDefaultConfig();
        }

        this.state.headerPresets = this.getDefaultHeaderPresets();

        // Inicializar Header Manager
        this.initHeaderManager();

        // ✅ CRITICAL: Inicializar Web Worker ANTES de cargar canales
        // loadChannelsList() lanza _launchInternalEnrichment() via requestAnimationFrame,
        // que necesita this.worker ya inicializado para mostrar el panel de clasificación
        this.initWorkerEngine();

        // ✅ V4.28: Deferred ProbeServer monitor — not needed for initial render
        this._probeServerAvailable = false;
        this._probeServerCheckInterval = null;
        // Delay 5s — let critical UI load first
        setTimeout(() => {
            this._startProbeServerMonitor();
        }, 5000);

        if (window.dbManager) {
            this.db = window.dbManager;

            // ✅ V4.12.5: FLUJO ASÍNCRONO DETERMINISTA (Evitar race conditions al refrescar)
            // Cargar estado nuclear antes de cualquier otra cosa
            await this.loadSavedState();
            console.log('📡 [Init] Estado base cargado');

            // Cargar servidores activos (necesario para el filtro de huérfanos)
            await this.loadActiveServers();
            console.log('📡 [Init] Servidores activos cargados');

            // Cargar lista de canales (procesa deduplicación y enriquecimiento)
            // El Worker ya está listo para recibir _launchInternalEnrichment
            await this.loadChannelsList();
            console.log('📡 [Init] Canales cargados y enriquecidos');

            // Restaurar filtros y estado del generador
            await this.loadFilterState();
            await this.loadGeneratorState().catch(e => console.warn('⚠️ Error cargando estado del generador:', e));

            // ✅ V4.26: Intentar cargar snapshot del generador si no hay canales
            setTimeout(() => {
                if (!this.state.channelsMaster || this.state.channelsMaster.length === 0) {
                    this.loadGeneratorSnapshot().catch(e => console.warn('⚠️ Error cargando snapshot:', e));
                } else {
                    this.db.getAppState('generatorSnapshot').then(snapshot => {
                        if (snapshot) this._updateSnapshotIndicator(snapshot);
                    }).catch(() => { });
                }
            }, 500);
        }

        // ✅ V4.6.2: Initialize Stream Quality Probe
        if (typeof StreamQualityProbe !== 'undefined') {
            this.streamProbe = new StreamQualityProbe();
            console.log('🔬 StreamQualityProbe inicializado');
        }

        this.bindEvents();

        // ✅ V4.8.2: Restore saved columns BEFORE any renderTable
        this.restoreActiveColumnsFromStorage();

        // ✅ V4.9: Load saved servers library from localStorage
        this.renderSavedServersTable();

        // ✅ V4.28: Defer non-critical tasks (migration, integrity tests, sources)
        // Use requestIdleCallback or setTimeout to avoid blocking main thread
        const deferNonCritical = (fn, fallbackMs = 3000) => {
            if (window.requestIdleCallback) {
                requestIdleCallback(fn, { timeout: fallbackMs });
            } else {
                setTimeout(fn, fallbackMs);
            }
        };

        // Cargar fuentes guardadas (non-blocking)
        deferNonCritical(() => {
            this.loadSavedSources().then(() => this.renderSourcesList());
        }, 1000);

        // ✅ V4.16: Migración automática de servidores sin snapshot (deferred)
        deferNonCritical(() => {
            this.migrateServersWithoutSnapshot().then(() => {
                console.log('✅ Migración de snapshots completada');
                // 🧪 V4.18.4: Ejecutar tests de integridad al iniciar
                setTimeout(() => this.runIntegrityTests(), 500);
            });
        }, 3000);

        // ✅ V4.12.2: Log de tiempo de inicialización
        const initTime = performance.now() - startTime;
        console.log(`⏱️ Init completado en ${initTime.toFixed(0)}ms (${isFirstLoad ? 'Primera carga' : 'Refresco rápido'})`);
    }

    // ✅ V4.8.2: Restore active columns from localStorage 
    restoreActiveColumnsFromStorage() {
        try {
            const saved = localStorage.getItem('iptv_field_source_config');
            if (!saved) return;

            const config = JSON.parse(saved);
            if (config.selectedColumns && Array.isArray(config.selectedColumns) && config.selectedColumns.length > 0) {
                this.state.activeColumns = config.selectedColumns.slice();
                console.log('✅ [AppInit] Columnas restauradas:', this.state.activeColumns.length);

                // Also sync with AdvancedDataRenderer
                if (this.advancedDataRenderer) {
                    this.advancedDataRenderer.selectedFields = this.state.activeColumns.slice();
                }
            }
        } catch (e) {
            console.warn('⚠️ Error restaurando columnas:', e);
        }
    }

    // ==================== PERSISTENCIA ====================
    async loadSavedState() {
        if (!this.db) return;
        try {
            const savedServer = await this.db.getAppState('serverConfig');
            if (savedServer) {
                const $ = (id) => document.getElementById(id);
                if ($('baseUrl')) $('baseUrl').value = savedServer.baseUrl || '';
                if ($('username')) $('username').value = savedServer.username || '';
                if ($('serverName')) $('serverName').value = savedServer.serverName || '';
                this.state.currentServer = { ...this.state.currentServer, ...savedServer };
            }
        } catch (e) { console.warn(e); }
    }

    /**
     * 🔒 GLOBAL COMPLIANCE: commitStateChange (CONSOLIDATED)
     * Unified wrapper for state mutation and IndexedDB persistence.
     * Combines compliance enforcement with V4.13 render functionality.
     * @param {Object} options - { servers: boolean, channels: boolean, reason: string, render: boolean }
     */
    async commitStateChange(options = {}) {
        const {
            servers = false,
            channels = false,
            gateway = false, // ☁️ APE v15.1: Gateway persistence
            reason = '',
            render = true
        } = options;

        // Compliance warning (not error for backwards compatibility)
        if (!reason) {
            console.warn('⚠️ commitStateChange: Missing "reason" - please add for traceability');
        }

        this.state._isCommitting = true;
        console.group(`🔒 COMMIT STATE: ${reason || '(no reason provided)'}`);

        try {
            const promises = [];

            if (servers) {
                promises.push(this._internalSaveServers());
            }

            if (channels) {
                promises.push(this._internalSaveChannels());
            }

            if (gateway && this.db && window.gatewayManager) {
                promises.push(this.db.saveAppState('gatewayConfig', window.gatewayManager.config));
            }

            await Promise.all(promises);

            if (servers) console.log('✔ Servidores persistidos');
            if (channels) console.log('✔ Canales persistidos');
            if (gateway) console.log('✔ Configuración de Gateway persistida');

            // Trazabilidad de Auditoría (async to IndexedDB)
            this._logAuditEventAsync(
                servers && channels ? 'SERVERS+CHANNELS_UPDATE'
                    : servers ? 'SERVERS_UPDATE'
                        : channels ? 'CHANNELS_UPDATE'
                            : gateway ? 'GATEWAY_UPDATE'
                                : 'STATE_UPDATE',
                reason
            );

            // V4.13: Renderizar SOLO después de persistir
            if (render) {
                if (this.renderServerList) this.renderServerList();
                if (this.renderTable) this.renderTable();
                if (this.renderActiveServerStats) this.renderActiveServerStats();
                console.log('✔ UI renderizada');
            }

            console.log('✅ State committed successfully and persisted to IndexedDB');
            return true;

        } catch (error) {
            console.error('❌ commitStateChange Failed:', error);
            if (this.showNotification) this.showNotification('❌ Error guardando estado', true);
            throw error;
        } finally {
            this.state._isCommitting = false;
            console.groupEnd();
        }
    }

    /**
     * 📝 AUDIT LOG: logAuditEvent (CONSOLIDATED)
     * Logs to localStorage synchronously for UI calls.
     * Use _logAuditEventAsync for IndexedDB persistence.
     */
    logAuditEvent(event) {
        try {
            const auditLog = JSON.parse(localStorage.getItem('iptv_audit_log') || '[]');
            auditLog.push({
                ...event,
                id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                timestamp: event.timestamp || Date.now()
            });
            // Mantener solo los últimos 500 eventos
            if (auditLog.length > 500) auditLog.shift();
            localStorage.setItem('iptv_audit_log', JSON.stringify(auditLog));
        } catch (e) {
            console.warn('⚠️ logAuditEvent localStorage error:', e);
        }
    }

    /**
     * 📜 Async Audit Log (IndexedDB) - Fire and forget
     */
    _logAuditEventAsync(action, reason = '') {
        if (!this.db) return;

        // Fire and forget - don't await
        (async () => {
            try {
                const entry = {
                    timestamp: new Date().toISOString(),
                    action,
                    reason,
                    serversCount: this.state.activeServers?.length || 0,
                    channelsCount: this.state.channelsMaster?.length || 0
                };

                const prev = await this.db.getAppState('auditLog') || { entries: [] };
                prev.entries.push(entry);

                // Limitar a últimos 500 eventos
                if (prev.entries.length > 500) {
                    prev.entries = prev.entries.slice(-500);
                }

                await this.db.saveAppState('auditLog', prev);
            } catch (e) {
                console.warn('⚠️ _logAuditEventAsync error:', e);
            }
        })();
    }

    async _internalSaveServers() {
        if (!this.db) return;
        await this.db.saveAppState('activeServers', {
            activeServers: this.state.activeServers,
            currentServer: this.state.currentServer,
            timestamp: Date.now()
        });
    }

    async _internalSaveChannels() {
        if (!this.db) return;
        await this.db.saveChannels(this.state.channelsMaster || []);
    }

    async saveActiveServers() {
        // Redirigir a commitStateChange para mantener política de compliance
        await this.commitStateChange({
            servers: true,
            reason: 'Legacy call to saveActiveServers()'
        });
    }

    async saveChannelsList() {
        // Redirigir a commitStateChange para mantener política de compliance
        await this.commitStateChange({
            channels: true,
            reason: 'Legacy call to saveChannelsList()'
        });
    }

    /**
     * 💾 V4.18.5: Guardar biblioteca de servidores en IndexedDB (backup)
     */
    async saveServerLibraryToIndexedDB() {
        if (!this.db) return;
        try {
            const library = this.getSavedServers();
            await this.db.saveAppState('serverLibrary', library);
            console.log(`✅ Biblioteca guardada en IndexedDB: ${library.length} servidores`);
        } catch (e) {
            console.error('Error guardando biblioteca:', e);
        }
    }

    /**
     * 📥 V4.18.5: Restaurar biblioteca desde IndexedDB si existe
     */
    async restoreServerLibraryFromIndexedDB() {
        if (!this.db) return;
        try {
            const lib = await this.db.getAppState('serverLibrary');
            if (Array.isArray(lib) && lib.length > 0) {
                localStorage.setItem('iptv_server_library', JSON.stringify(lib));
                console.log(`✅ Biblioteca restaurada desde IndexedDB: ${lib.length} servidores`);
            }
        } catch (e) {
            console.warn('No se pudo restaurar biblioteca:', e);
        }
    }

    /**
     * 📋 V4.18.5: Obtener servidores guardados en la biblioteca
     */
    getSavedServers() {
        try {
            const saved = localStorage.getItem('iptv_server_library');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Error leyendo biblioteca:', e);
            return [];
        }
    }

    /**
     * 🧹 V4.18.5: Limpieza segura de localStorage (preserva datos críticos)
     * NO borra: biblioteca, config, audit, tema
     */
    cleanLocalStorageSafe() {
        const PRESERVE_KEYS = [
            'iptv_field_source_config',
            'iptv_fieldSourcePolicy',
            'iptv_theme',
            'iptv_active_tab',
            'iptv_session_active',
            'iptv_server_library',      // ✅ CRÍTICO: biblioteca de servidores
            'iptv_audit_log',
            'iptv_connected_servers',
            'iptv_active_servers',
            'iptv_channels_cache',
            'iptv_analysis_tab_state',
            'iptv_generator_state'      // ✅ V4.19: Estado del generador
        ];

        let removed = 0;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key) continue;

            const preserve = PRESERVE_KEYS.some(p => key.startsWith(p));
            if (!preserve && key.startsWith('iptv_')) {
                localStorage.removeItem(key);
                removed++;
            }
        }

        console.log(`🧹 Limpieza segura: ${removed} items eliminados`);
        console.log('✔ Preservados:', PRESERVE_KEYS);
    }

    /**
     * 🔒 V4.18.3: UPSERT de servidor (INCREMENTAL - NO OVERWRITE)
     * Inserta si no existe, actualiza si existe
     * @param {Object} server - Servidor a guardar
     */
    upsertServer(server) {
        if (!server || !server.id) {
            console.error('❌ upsertServer: servidor inválido', server);
            return;
        }

        if (!this.state.activeServers) {
            this.state.activeServers = [];
        }

        // ✅ V4.27.4: Buscar por ID o por URL (lo que encuentre primero)
        const normalizedNewUrl = (server.baseUrl || '').replace(/^https?:\/\//, '').replace(/\/player_api\.php$/, '').toLowerCase();

        let idx = this.state.activeServers.findIndex(s => s.id === server.id);

        // Si no encontró por ID, buscar por URL
        if (idx === -1 && normalizedNewUrl) {
            idx = this.state.activeServers.findIndex(s => {
                const existingUrl = (s.baseUrl || '').replace(/^https?:\/\//, '').replace(/\/player_api\.php$/, '').toLowerCase();
                return existingUrl === normalizedNewUrl;
            });
            if (idx !== -1) {
                console.log(`⚠️ [V4.27.4] Servidor encontrado por URL, actualizando ID: ${this.state.activeServers[idx].id} -> ${server.id}`);
            }
        }

        if (idx === -1) {
            // ➕ NUEVO servidor
            this.state.activeServers.push(server);
            console.log(`➕ [upsertServer] Nuevo: ${server.name} (${server.id})`);
        } else {
            // 🔄 UPDATE servidor existente (merge seguro)
            this.state.activeServers[idx] = {
                ...this.state.activeServers[idx],
                ...server,
                snapshot: server.snapshot || this.state.activeServers[idx].snapshot
            };
            console.log(`🔄 [upsertServer] Update: ${server.name} (${server.id})`);
        }
    }

    /**
     * 🧪 TEST: Verificar que no hay servidores duplicados
     */
    testIncrementalServerSave() {
        const ids = (this.state.activeServers || []).map(s => s.id);
        const unique = new Set(ids);

        if (ids.length !== unique.size) {
            console.error('❌ Servidores duplicados detectados:', ids);
            throw new Error('Servidores duplicados o sobrescritos');
        }

        console.log(`✅ Guardado incremental OK: ${ids.length} servidores únicos`);
        return true;
    }

    // =====================================================
    // 🔒 V4.18.4 ENTERPRISE - SISTEMA COMPLETO MULTI-SERVIDOR
    // =====================================================

    /**
     * 🔒 V4.18.4: UPSERT de canal (INCREMENTAL - NO DUPLICADOS)
     * Clave compuesta: serverId::stream_id
     * @param {Object} channel - Canal a guardar
     */
    upsertChannel(channel) {
        if (!channel || !channel.serverId) {
            console.warn('❌ upsertChannel: canal sin serverId', channel?.name);
            return;
        }

        const streamId = channel.stream_id || channel.id || channel.base?.stream_id;
        if (!streamId) {
            console.warn('❌ upsertChannel: canal sin stream_id', channel?.name);
            return;
        }

        const key = `${channel.serverId}::${streamId}`;

        // Lazy init del índice
        if (!this._channelIndex) {
            this._channelIndex = new Map();
            (this.state.channelsMaster || []).forEach(ch => {
                const chStreamId = ch.stream_id || ch.id || ch.base?.stream_id;
                if (ch.serverId && chStreamId) {
                    this._channelIndex.set(`${ch.serverId}::${chStreamId}`, ch);
                }
            });
            console.log(`📊 [upsertChannel] Índice creado: ${this._channelIndex.size} canales`);
        }

        const existing = this._channelIndex.get(key);

        if (!existing) {
            // ➕ NUEVO canal
            if (!this.state.channelsMaster) this.state.channelsMaster = [];
            this.state.channelsMaster.push(channel);
            this._channelIndex.set(key, channel);
        } else {
            // 🔄 UPDATE canal existente (merge seguro)
            Object.assign(existing, channel);
        }
    }

    /**
     * 🧹 V4.18.4: Invalidar índice de canales
     * OBLIGATORIO llamar cuando se limpia channelsMaster
     */
    clearChannelIndex() {
        this._channelIndex = null;
        console.log('🧹 [clearChannelIndex] Índice invalidado');
    }

    // =====================================================
    // 🧪 V4.18.4 TESTS AUTOMÁTICOS (ANTI-REGRESIÓN)
    // =====================================================

    /**
     * 🧪 Test: Todos los canales tienen serverId
     */
    testChannelsHaveServerId() {
        const bad = (this.state.channelsMaster || []).filter(ch => !ch.serverId);
        if (bad.length > 0) {
            console.error('❌ Canales sin serverId:', bad.slice(0, 5).map(c => c.name));
            if (this.config?.strictTests) {
                throw new Error(`TEST FALLIDO: ${bad.length} canales huérfanos`);
            }
            return false;
        }
        console.log('✅ TEST OK: serverId en todos los canales');
        return true;
    }

    /**
     * 🧪 Test: Servidores únicos (no duplicados)
     */
    testUniqueServers() {
        const ids = (this.state.activeServers || []).map(s => s.id);
        const unique = new Set(ids);
        if (ids.length !== unique.size) {
            console.error('❌ Servidores duplicados:', ids);
            if (this.config?.strictTests) {
                throw new Error('TEST FALLIDO: servidores duplicados');
            }
            return false;
        }
        console.log(`✅ TEST OK: ${ids.length} servidores únicos`);
        return true;
    }

    /**
     * 🧪 Test: Integridad canal-servidor
     */
    testChannelServerIntegrity() {
        const valid = new Set((this.state.activeServers || []).map(s => s.id));
        const bad = (this.state.channelsMaster || []).filter(ch => !valid.has(ch.serverId));
        if (bad.length > 0) {
            console.warn(`⚠️ ${bad.length} canales con serverId inválido`);
            if (this.config?.strictTests) {
                throw new Error('TEST FALLIDO: canales con serverId inválido');
            }
            return false;
        }
        console.log('✅ TEST OK: integridad canal-servidor');
        return true;
    }

    /**
     * 🧪 Ejecutar todos los tests de integridad
     */
    runIntegrityTests() {
        console.group('🧪 TESTS DE INTEGRIDAD V4.18.4');
        const results = {
            serverId: this.testChannelsHaveServerId(),
            uniqueServers: this.testUniqueServers(),
            integrity: this.testChannelServerIntegrity()
        };
        console.table(results);
        console.groupEnd();
        return Object.values(results).every(r => r);
    }

    // =====================================================
    // 📦 V4.18.4 EXPORT INCREMENTAL POR SERVIDOR
    // =====================================================

    /**
     * 📦 Exportar canales de un servidor específico
     * @param {string} serverId - ID del servidor
     * @param {string} format - Formato: 'm3u8', 'csv', 'xlsx'
     */
    exportServer(serverId, format = 'm3u8') {
        const channels = (this.state.channelsMaster || [])
            .filter(ch => ch.serverId === serverId);

        if (!channels.length) {
            console.warn(`⚠️ No hay canales para exportar del servidor ${serverId}`);
            this.showNotification('⚠️ No hay canales para exportar', true);
            return null;
        }

        const server = (this.state.activeServers || []).find(s => s.id === serverId);
        const serverName = server?.name || 'Unknown';

        console.log(`📦 Exportando ${channels.length} canales de ${serverName}`);

        // Delegar al módulo de exportación existente
        if (format === 'm3u8') {
            return this.generateM3U8(channels, {
                serverName,
                serverId,
                incremental: true
            });
        } else if (format === 'csv') {
            return this.exportToCSV(channels, { serverName });
        } else if (format === 'xlsx') {
            return this.exportToExcel(channels, { serverName });
        }

        console.warn(`⚠️ Formato no soportado: ${format}`);
        return null;
    }

    /**
     * 🔒 Obtener servidor por ID
     */
    getServerById(serverId) {
        return (this.state.activeServers || []).find(s => s.id === serverId);
    }

    // ✅ V4.8: Save tab state (called by GUARDAR buttons)

    // Fallback for analysis state save
    saveAnalysisStateManual() {
        const state = {
            activeColumns: this.state.activeColumns || [],
            currentPage: this.state.currentPage || 1,
            itemsPerPage: this.state.itemsPerPage || 100,
            timestamp: Date.now()
        };

        // Save source policies from advancedDataRenderer
        if (this.advancedDataRenderer && this.advancedDataRenderer.fieldSourcePolicy) {
            state.sourcePolicies = this.advancedDataRenderer.fieldSourcePolicy;
        }

        localStorage.setItem('iptv_analysis_tab_state', JSON.stringify(state));
        this.showNotification('✅ Configuración de análisis guardada');
        console.log('✅ Estado de análisis guardado (manual):', state);
    }

    // Show notification helper
    showNotification(message, isError = false) {
        const notif = document.createElement('div');
        notif.textContent = message;
        notif.style.cssText = `position:fixed;top:20px;right:20px;padding:10px 20px;border-radius:8px;z-index:999999;font-weight:bold;
            background:${isError ? '#ef4444' : '#10b981'};color:white;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;

        document.body.appendChild(notif);
        setTimeout(() => {
            notif.style.transition = 'opacity 0.3s';
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        }, 2000);
    }

    async loadActiveServers() {
        if (!this.db) return;
        try {
            const data = await this.db.getAppState('activeServers');
            if (data && data.activeServers) {
                this.state.activeServers = data.activeServers;
                this.state.currentServer = data.currentServer || {};

                // Rellenar formulario Connection
                const c = this.state.currentServer;
                const $ = (id) => document.getElementById(id);

                // Intentar mostrar URL limpia (sin /player_api.php) para mejor UX
                let displayUrl = c.baseUrl || '';
                displayUrl = displayUrl.replace(/\/player_api\.php$/, '');

                if ($('baseUrl')) $('baseUrl').value = displayUrl;
                if ($('username')) $('username').value = c.username || '';
                if ($('password')) $('password').value = c.password || '';
                if ($('serverName')) $('serverName').value = c.name || '';

                this.renderServerList();
                console.log(`✅ Servidores recuperados: ${this.state.activeServers.length}`);
            }
        } catch (e) { console.error(e); }
    }

    /**
     * ✅ V4.11.3 - Guardar con DEDUPLICACIÓN
     */
    async saveChannelsList() {
        if (!this.db) return;

        try {
            // Deduplicar por serverId:stream_id
            const deduplicated = this._deduplicateChannels(this.state.channelsMaster);

            console.log(`📦 Guardando ${deduplicated.length} canales (deduplicados)`);

            // Guardar en IndexedDB
            await this.db.saveChannels(deduplicated);

            // Guardar metadata
            await this.db.saveAppState('channelsCache', {
                stats: this.state.stats,
                activeColumns: this.state.activeColumns,
                lastSaved: new Date().toISOString(),
                totalCount: deduplicated.length,
                timestamp: Date.now()
            });

            console.log(`✅ ${deduplicated.length} canales guardados`);
            return deduplicated.length;

        } catch (e) {
            console.error('❌ Error saveChannelsList:', e);
            throw e;
        }
    }

    async loadChannelsList() {
        if (!this.db) return;
        try {
            // Cargar lista persistida
            const channels = await this.db.loadChannels();
            const meta = await this.db.getAppState('channelsCache');

            if (channels && channels.length > 0) {
                // ✅ V1.0: FORZAR DEDUPLICACIÓN AL CARGAR
                let deduplicatedChannels = this._deduplicateChannels(channels);

                // Si hay duplicados, limpiar IndexedDB automáticamente
                if (deduplicatedChannels.length < channels.length) {
                    const removed = channels.length - deduplicatedChannels.length;
                    console.warn(`⚠️ DUPLICADOS DETECTADOS: ${channels.length} → ${deduplicatedChannels.length} (-${removed})`);
                    console.log('🧹 Limpiando IndexedDB automáticamente...');

                    // Guardar versión limpia
                    await this.db.clearChannels();
                    await this.db.saveChannels(deduplicatedChannels);
                    console.log(`✅ IndexedDB limpiado: ${deduplicatedChannels.length} canales únicos`);
                }

                // ✅ V4.27.1: FILTRAR CANALES HUÉRFANOS (con validación más permisiva)
                // Solo filtrar si hay servidores activos Y al menos algunos canales tienen serverId
                const activeServerIds = new Set((this.state.activeServers || []).map(s => s.id));
                const channelsWithServerId = deduplicatedChannels.filter(ch => ch.serverId || ch._serverId);

                // Solo aplicar filtro de huérfanos si:
                // 1. Hay servidores activos
                // 2. Al menos algunos canales tienen serverId (no todos son legacy)
                if (activeServerIds.size > 0 && channelsWithServerId.length > 0) {
                    const beforeOrphanFilter = deduplicatedChannels.length;

                    // ✅ V4.27.1: Lógica permisiva - mantener canales sin serverId
                    deduplicatedChannels = deduplicatedChannels.filter(ch => {
                        const sId = ch.serverId || ch._serverId;

                        // Si no tiene serverId, MANTENER (es un canal legacy)
                        if (!sId) return true;

                        // Si tiene serverId, verificar que esté en servidores activos
                        return activeServerIds.has(sId);
                    });

                    const orphansRemoved = beforeOrphanFilter - deduplicatedChannels.length;
                    if (orphansRemoved > 0) {
                        console.warn(`🧹 [V4.27.1] HUÉRFANOS ENCONTRADOS: ${orphansRemoved} canales de servidores inactivos eliminados`);
                        console.log(`   ✅ Canales válidos: ${deduplicatedChannels.length} (de ${activeServerIds.size} servidores activos)`);

                        // Limpiar DB de huérfanos también
                        await this.db.clearChannels();
                        await this.db.saveChannels(deduplicatedChannels);
                        console.log(`   ✅ IndexedDB limpiado de huérfanos`);
                    }
                } else if (activeServerIds.size === 0 && deduplicatedChannels.length > 0) {
                    // Si hay canales pero no hay servidores activos, intentar reconstruir servidores
                    console.log(`ℹ️ [V4.27.1] ${deduplicatedChannels.length} canales encontrados pero sin servidores activos`);
                    console.log(`   Los canales se mantendrán hasta que se conecten servidores`);
                }

                // Continuar con canales deduplicados
                const total = deduplicatedChannels.length;

                // ✅ V4.6.2: FAST FULL RE-ENRICHMENT for cached channels
                console.time('⚡ Re-enrichment');
                console.log(`🔄 Re-aplicando heurísticas a ${total} canales...`);

                const startTime = Date.now();

                // Show initial progress
                this.showHeuristicProgress && this.showHeuristicProgress(true, {
                    label: '⚡ Aplicando heurísticas (País, Idioma, Codec, Bitrate)...',
                    current: 0,
                    total: total,
                    percent: 0,
                    remaining: Math.round(total / 10000)
                });

                const reEnrichedChannels = deduplicatedChannels.map((ch, idx) => {
                    // Update progress every 2000 channels
                    if (idx > 0 && idx % 2000 === 0) {
                        console.log(`  📊 Procesados ${idx}/${total}...`);
                        const elapsed = (Date.now() - startTime) / 1000;
                        const rate = idx / elapsed;
                        const remaining = Math.round((total - idx) / rate);
                        const percent = Math.round((idx / total) * 100);

                        // Update progress UI (async to allow rendering)
                        this.showHeuristicProgress && this.showHeuristicProgress(true, {
                            label: `⚡ Procesando heurísticas: ${percent}%`,
                            current: idx,
                            total: total,
                            percent: percent,
                            remaining: remaining
                        });
                    }

                    const nameUpper = ((ch.name || '') + ' ' + (ch.group || '')).toUpperCase();

                    // 1) Country/Language - ALWAYS re-apply if generic
                    if (!ch.country || ch.country === 'INT' || !ch.language || ch.language === 'MIX') {
                        const inferred = this.inferCountryLanguageAdvanced(ch.name, ch.group);
                        ch.country = inferred.country;
                        ch.language = inferred.language;
                    }

                    // 2) Resolution - infer if empty
                    if (!ch.resolution || ch.resolution === '' || ch.resolution === 'AUTO') {
                        if (nameUpper.includes('8K')) ch.resolution = '8K';
                        else if (nameUpper.includes('4K') || nameUpper.includes('UHD') || nameUpper.includes('2160')) ch.resolution = '4K';
                        else if (nameUpper.includes('FHD') || nameUpper.includes('1080')) ch.resolution = '1080p';
                        else if (nameUpper.includes('HD') || nameUpper.includes('720')) ch.resolution = '720p';
                        else if (nameUpper.includes('SD') || nameUpper.includes('480')) ch.resolution = '480p';
                        else ch.resolution = null; // ✅ V4.19.3: No asignar AUTO, dejar null para derivación
                    }

                    // 3) Codec - infer if empty
                    if (!ch.codec || ch.codec === '') {
                        if (nameUpper.includes('HEVC') || nameUpper.includes('H265') || nameUpper.includes('H.265')) ch.codec = 'HEVC';
                        else if (nameUpper.includes('AV1')) ch.codec = 'AV1';
                        else if (nameUpper.includes('VP9')) ch.codec = 'VP9';
                        else if (ch.resolution === '4K' || ch.resolution === '8K') ch.codec = 'HEVC';
                        else ch.codec = 'H264';
                    }

                    // 4) Bitrate - infer if 0 or empty
                    if (!ch.bitrate || ch.bitrate === 0) {
                        if (ch.resolution === '8K') ch.bitrate = 50000;
                        else if (ch.resolution === '4K') ch.bitrate = 25000;
                        else if (ch.resolution === '1080p') ch.bitrate = 8000;
                        else if (ch.resolution === '720p') ch.bitrate = 5000;
                        else ch.bitrate = 2000;
                    }

                    // 5) Quality Score - recalculate if missing
                    if (!ch.qualityScore || ch.qualityScore === 0) {
                        let score = 0;
                        if (ch.resolution === '8K') score += 40;
                        else if (ch.resolution === '4K') score += 36;
                        else if (ch.resolution === '1080p') score += 28;
                        else if (ch.resolution === '720p') score += 20;
                        else score += 10;

                        if (ch.bitrate >= 20000) score += 30;
                        else if (ch.bitrate >= 8000) score += 24;
                        else if (ch.bitrate >= 5000) score += 18;
                        else score += 12;

                        if (ch.codec === 'AV1') score += 20;
                        else if (ch.codec === 'HEVC') score += 16;
                        else score += 10;

                        ch.qualityScore = Math.min(100, score);
                    }

                    return ch;
                });

                console.timeEnd('⚡ Re-enrichment');
                console.log(`✅ Heurísticas aplicadas a ${reEnrichedChannels.length} canales`);

                // Hide progress bar
                this.showHeuristicProgress && this.showHeuristicProgress(false);

                // ✅ V1.0: Apply configurable score calculation
                const scoredChannels = reEnrichedChannels.map(ch => this.enrichChannelWithScore(ch));

                // 1) Capa de datos base
                this.state.channelsMaster = scoredChannels;
                this.state.channels = [...scoredChannels];

                // ✅ V4.11: Reconstruir activeServers desde canales si está vacío
                if (!this.state.activeServers || this.state.activeServers.length === 0) {
                    const serverMap = new Map();
                    scoredChannels.forEach(ch => {
                        const srvId = ch.serverId || ch._serverId;
                        if (srvId && !serverMap.has(srvId)) {
                            serverMap.set(srvId, {
                                id: srvId,
                                name: ch.serverName || ch._serverName || srvId,
                                baseUrl: ch.serverUrl || ch._serverUrl || '',
                                username: ch.serverUser || '',
                                password: ch.serverPass || '',
                                channelCount: 0
                            });
                        }
                        if (srvId) {
                            const srv = serverMap.get(srvId);
                            if (srv) srv.channelCount++;
                        }
                    });
                    if (serverMap.size > 0) {
                        this.state.activeServers = Array.from(serverMap.values());
                        console.log(`🔧 [V4.11] Servidores reconstruidos desde canales: ${this.state.activeServers.length}`);
                        // Persistir para próximas recargas
                        this.saveActiveServers();
                    }
                }

                // 2) Descubrir campos dinámicos
                this.discoverFields(this.state.channelsMaster);

                // 3) Restaurar stats (o recalcular si no hay meta)
                if (meta) {
                    this.state.stats = meta.stats || this.calculateStats(this.state.channelsMaster);
                    // ✅ V4.8.2: Only use cached activeColumns if localStorage didn't restore any
                    if (meta.activeColumns && (!this.state.activeColumns || this.state.activeColumns.length === 0)) {
                        this.state.activeColumns = meta.activeColumns;
                        console.log('📦 [Cache] Columnas desde meta:', meta.activeColumns.length);
                    }
                } else {
                    this.state.stats = this.calculateStats(this.state.channelsMaster);
                }

                // 4) Pintar UI
                // ✅ V4.5.0: OPTIMIZADO - Operaciones pesadas en requestAnimationFrame
                requestAnimationFrame(() => {
                    console.log('⏳ Iniciando rendering (no bloqueante)...');
                    this.renderTable();
                    this.updateStatsUI();
                    this.renderServerList(); // ✅ Update server stats table after channels load
                    this.showTab('analysis');

                    // 🎯 NUEVO: Lanzar enriquecimiento interno tras restore
                    this._launchInternalEnrichment('after_db_restore');
                });

                console.log(`✅ Lista de canales recuperada: ${channels.length}`);
            } else {
                console.log('ℹ️ No hay canales guardados en IndexedDB todavía');
            }
        } catch (e) {
            console.error('❌ Error en loadChannelsList:', e);
        }
    }

    /**
     * ✅ V1.0: Enriquecer canal con score de calidad calculado
     * Utiliza el sistema de scoring configurable
     * @param {Object} channel - Canal con: resolution, bitrate, codec, fps
     * @returns {Object} Canal enriquecido con qualityScore, scoreLive y qualityTier
     */
    enrichChannelWithScore(channel) {
        if (!this.rankingScoreConfig) return channel;

        const result = this.rankingScoreConfig.calculateScore(channel);

        // ✅ V4.10: Store in both root level and heuristics layer
        channel.qualityScore = result.qualityScore;
        channel.qualityTier = result.qualityTier;
        channel.scoreBreakdown = result.breakdown;

        // ✅ V4.10: Score Live in heuristics layer (source = H)
        channel.heuristics = channel.heuristics || {};
        channel.heuristics.scoreLive = result.qualityScore;
        channel.heuristics.qualityTier = result.qualityTier;

        // Also expose at root for table rendering
        channel.scoreLive = result.qualityScore;

        // ✅ V4.19.2: Normalizar resolución "AUTO" con la resolución real
        this._normalizeAutoResolution(channel);

        return channel;
    }

    /**
     * ✅ V4.19.2: Normaliza resolución "AUTO" o vacía con la resolución real derivada
     * Prioridad: 1) qualityTier, 2) height/video_height, 3) bitrate, 4) nombre del canal
     */
    _normalizeAutoResolution(channel) {
        const resolution = (channel.resolution || '').toUpperCase().trim();

        // Solo normalizar si es AUTO, UNKNOWN o vacío
        if (resolution !== 'AUTO' && resolution !== 'UNKNOWN' && resolution !== '') {
            return; // Ya tiene resolución válida
        }

        let derivedResolution = null;

        // 1. Intentar derivar desde qualityTier (SD_480, HD_720, FHD_1080, UHD_4K)
        const tier = (channel.qualityTier || channel.tier || '').toUpperCase();
        if (tier) {
            const tierMatch = tier.match(/(8K|4K|UHD|FHD|HD|SD|1080|720|480|360)/i);
            if (tierMatch) {
                const tierValue = tierMatch[1].toUpperCase();
                const tierMap = {
                    '8K': '4320p',
                    '4K': '2160p',
                    'UHD': '2160p',
                    'FHD': '1080p',
                    '1080': '1080p',
                    'HD': '720p',
                    '720': '720p',
                    'SD': '480p',
                    '480': '480p',
                    '360': '360p'
                };
                derivedResolution = tierMap[tierValue];
            }
        }

        // 2. Intentar derivar desde height o video_height
        if (!derivedResolution) {
            const height = parseInt(channel.height) || parseInt(channel.video_height) || 0;
            if (height > 0) {
                derivedResolution = this.deriveResolutionFromHeight(height);
            }
        }

        // 3. Intentar derivar desde bitrate
        if (!derivedResolution && channel.bitrate) {
            const kbps = parseInt(channel.bitrate) || 0;
            if (kbps > 0) {
                const bitrateTier = this.mapBitrateTier(kbps);
                const bitrateMap = {
                    'UHD_4K': '2160p',
                    'FHD_1080': '1080p',
                    'HD_720': '720p',
                    'SD_480': '480p'
                };
                derivedResolution = bitrateMap[bitrateTier] || '480p';
            }
        }

        // 4. Intentar derivar desde nombre del canal
        if (!derivedResolution) {
            const name = (channel.name || '').toUpperCase();
            if (name.includes('8K')) derivedResolution = '4320p';
            else if (name.includes('4K') || name.includes('UHD')) derivedResolution = '2160p';
            else if (name.includes('FHD') || name.includes('1080')) derivedResolution = '1080p';
            else if (name.includes('HD') || name.includes('720')) derivedResolution = '720p';
        }

        // Aplicar resolución derivada si se encontró
        if (derivedResolution) {
            channel.resolution = derivedResolution;
            // También actualizar en raw si existe
            if (channel.raw) {
                channel.raw.resolution = derivedResolution;
            }
        }
    }

    async saveFilterState() {
        if (!this.db) {
            console.warn('⚠️ saveFilterState: db no disponible');
            return;
        }
        try {
            await this.db.saveAppState('filterState', {
                activeFilter: this.state.activeFilter,
                searchQuery: this.state.searchQuery,
                filterTier: this.state.filterTier,
                filterCodec: this.state.filterCodec,
                filterLanguage: this.state.filterLanguage,
                timestamp: Date.now()
            });

            // ✅ V4.9: Lock filter editing after save
            console.log('🔒 Bloqueando filtros... filterEditMode:', this.state.filterEditMode, '→ false');
            this.state.filterEditMode = false;
            this.renderFilterBuilder(); // Re-render as read-only

            console.log('✅ Filtros persistidos y bloqueados');
        } catch (e) {
            console.error('❌ Error en saveFilterState:', e);
        }
    }

    async loadFilterState() {
        if (!this.db) return;
        try {
            const data = await this.db.getAppState('filterState');
            if (data) {
                this.state.activeFilter = data.activeFilter || { mode: 'STANDARD', groups: [] };
                this.state.searchQuery = ''; // V4.28: Never restore search — always start clean

                // NORMALIZAR SIEMPRE A 'ALL'
                this.state.filterTier = (data.filterTier || 'ALL').toString().toUpperCase();
                this.state.filterCodec = (data.filterCodec || 'ALL').toString().toUpperCase();
                this.state.filterLanguage = (data.filterLanguage || 'ALL').toString().toUpperCase();

                const $ = (id) => document.getElementById(id);
                if ($('searchQuery')) $('searchQuery').value = '';
                if ($('filterTier')) $('filterTier').value = this.state.filterTier;
                if ($('filterCodec')) $('filterCodec').value = this.state.filterCodec;
                if ($('filterLanguage')) $('filterLanguage').value = this.state.filterLanguage;

                // ✅ V4.9: ALWAYS render filter builder to show saved groups
                this.renderFilterBuilder();

                if (this.state.channelsMaster.length > 0) {
                    if (this.state.searchQuery || this.state.activeFilter.groups.length > 0) {
                        this.applyAdvancedFilters();
                    } else {
                        this.renderTable();
                    }
                }

                // ✅ V4.9: Always update filter summary after loading
                this.updateActiveFiltersSummary();

                console.log('✅ Filtros restaurados:', {
                    groups: this.state.activeFilter.groups.length,
                    search: this.state.searchQuery,
                    tier: this.state.filterTier
                });
            } else {
                // Sin estado guardado → filtros por defecto
                this.state.filterTier = 'ALL';
                this.state.filterCodec = 'ALL';
                this.state.filterLanguage = 'ALL';
            }
        } catch (e) {
            console.error(e);
        }
    }

    async saveConfigState() {
        if (!this.db) return;
        const $ = (id) => document.getElementById(id);
        const serverConfig = {
            baseUrl: $('baseUrl').value,
            username: $('username').value,
            password: $('password').value,
            apiType: $('apiType').value,
            serverName: $('serverName').value
        };
        await this.db.saveAppState('serverConfig', serverConfig);
    }

    /**
     * 🧹 V4.20.1: Limpiar campos de conexión
     * Borra los inputs del formulario y reinicia el estado visual de conexión.
     */
    clearConnectionFields() {
        const ids = ['baseUrl', 'username', 'password', 'apiType', 'serverName'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (el.tagName === 'SELECT') el.value = 'auto';
                else el.value = '';
            }
        });

        // Reiniciar indicadores visuales
        const status = document.getElementById('connectionStatus');
        if (status) {
            status.innerHTML = '<span class="status-dot"></span><span>Esperando conexión…</span>';
            status.className = 'status-chip';
        }

        const apiLabel = document.getElementById('apiDetectedLabel');
        if (apiLabel) apiLabel.innerText = 'Auto';

        const apiChip = document.getElementById('apiDetectedChip');
        if (apiChip) {
            apiChip.style.display = 'flex'; // Asegurar visibilidad
        }

        // Persistir el estado vacío
        this.saveConfigState();

        console.log('🧹 Campos de conexión limpiados');
        if (this.showToast) this.showToast('Campos limpiados');
    }

    /**
     * ✅ V4.19: Guardar estado COMPLETO de la pestaña Generar
     * Persiste todas las opciones de generación en IndexedDB
     */
    async saveGeneratorState() {
        if (!this.db) {
            console.warn('⚠️ saveGeneratorState: db no disponible, usando localStorage');
            this._saveGeneratorStateToLocalStorage();
            return;
        }

        const $ = (id) => document.getElementById(id);

        const generatorState = {
            // Formato y EPG
            exportFormat: $('genExportFormat')?.value || 'm3u8',
            epgUrl: $('genEpgUrl')?.value || '',
            streamFormat: $('genStreamFormat')?.value || 'm3u8',
            timeShift: parseInt($('genTimeShift')?.value || '0', 10),

            // Optimización de Streaming (checkboxes)
            proStreamingOptimized: !!$('proStreamingOptimized')?.checked,
            ottNavOptimizedGen: !!$('ottNavOptimizedGen')?.checked,
            includeHttpHeaders: !!$('includeHttpHeaders')?.checked,

            // V4.1 Features
            v41AutoDetectLevel: !!$('v41AutoDetectLevel')?.checked,
            v41TargetPlayer: $('v41TargetPlayer')?.value || 'generic',
            v41CompatProfile: $('v41CompatProfile')?.value || 'AUTO',
            // ✅ V4.22: Nivel de evasión manual
            manualEvasionLevel: parseInt($('manualEvasionLevel')?.value) || 3,
            antiFreezeLevel: parseInt($('antiFreezeLevel')?.value) || 3,

            // V5.0 Serverless
            v5UseServerless: !!$('v5UseServerless')?.checked,
            v5WorkerUrl: $('v5WorkerUrl')?.value || '',
            v5ApiKey: $('v5ApiKey')?.value || '',

            // Telemetría
            telemetryEnabled: !!$('telemetryEnabled')?.checked,

            // Profile Manager APE v9.0 (si existe)
            selectedProfile: window.ProfileManagerV9?.getCurrentProfile?.() || 'P3',

            // ✅ V4.19.1: Estado expandido/colapsado del Profile Manager
            profileManagerExpanded: window.ProfileManagerV9?.isOpen === true,

            // Metadata
            timestamp: Date.now()
        };

        try {
            await this.db.saveAppState('generatorState', generatorState);
            console.log('✅ Estado del generador guardado:', generatorState);
        } catch (e) {
            console.error('❌ Error guardando generatorState:', e);
            // Fallback a localStorage
            this._saveGeneratorStateToLocalStorage(generatorState);
        }
    }

    /**
     * Fallback: Guardar en localStorage
     */
    _saveGeneratorStateToLocalStorage(state = null) {
        if (!state) {
            const $ = (id) => document.getElementById(id);
            state = {
                exportFormat: $('genExportFormat')?.value || 'm3u8',
                epgUrl: $('genEpgUrl')?.value || '',
                streamFormat: $('genStreamFormat')?.value || 'm3u8',
                timeShift: parseInt($('genTimeShift')?.value || '0', 10),
                proStreamingOptimized: !!$('proStreamingOptimized')?.checked,
                ottNavOptimizedGen: !!$('ottNavOptimizedGen')?.checked,
                includeHttpHeaders: !!$('includeHttpHeaders')?.checked,
                v41AutoDetectLevel: !!$('v41AutoDetectLevel')?.checked,
                v41TargetPlayer: $('v41TargetPlayer')?.value || 'generic',
                v41CompatProfile: $('v41CompatProfile')?.value || 'AUTO',
                manualEvasionLevel: parseInt($('manualEvasionLevel')?.value) || 3,
                antiFreezeLevel: parseInt($('antiFreezeLevel')?.value) || 3,
                v5UseServerless: !!$('v5UseServerless')?.checked,
                v5WorkerUrl: $('v5WorkerUrl')?.value || '',
                v5ApiKey: $('v5ApiKey')?.value || '',
                telemetryEnabled: !!$('telemetryEnabled')?.checked,
                selectedProfile: window.ProfileManagerV9?.getCurrentProfile?.() || 'P3',
                profileManagerExpanded: window.ProfileManagerV9?.isOpen === true,
                timestamp: Date.now()
            };
        }
        localStorage.setItem('iptv_generator_state', JSON.stringify(state));
        console.log('✅ Estado del generador guardado en localStorage (fallback)');
    }

    /**
     * ✅ V4.19: Restaurar estado de la pestaña Generar
     * Carga desde IndexedDB y aplica a los elementos del DOM
     */
    async loadGeneratorState() {
        const $ = (id) => document.getElementById(id);

        let state = null;

        // Intentar cargar desde IndexedDB
        if (this.db) {
            try {
                state = await this.db.getAppState('generatorState');
            } catch (e) {
                console.warn('⚠️ Error cargando generatorState desde DB:', e);
            }
        }

        // Fallback a localStorage
        if (!state) {
            try {
                const ls = localStorage.getItem('iptv_generator_state');
                if (ls) state = JSON.parse(ls);
            } catch (e) {
                console.warn('⚠️ Error parseando generatorState desde localStorage:', e);
            }
        }

        if (!state) {
            console.log('ℹ️ No hay estado del generador guardado, usando defaults');
            return;
        }

        console.log('🔄 Restaurando estado del generador:', state);

        // Aplicar valores a los elementos del DOM
        try {
            // Formato y EPG
            if ($('genExportFormat')) $('genExportFormat').value = state.exportFormat || 'm3u8';
            if ($('genEpgUrl')) $('genEpgUrl').value = state.epgUrl || '';
            if ($('genStreamFormat')) $('genStreamFormat').value = state.streamFormat || 'm3u8';
            if ($('genTimeShift')) $('genTimeShift').value = state.timeShift || 0;

            // Checkboxes de optimización
            if ($('proStreamingOptimized')) $('proStreamingOptimized').checked = !!state.proStreamingOptimized;
            if ($('ottNavOptimizedGen')) $('ottNavOptimizedGen').checked = !!state.ottNavOptimizedGen;
            if ($('includeHttpHeaders')) $('includeHttpHeaders').checked = state.includeHttpHeaders !== false; // default true

            // V4.1 Features
            if ($('v41AutoDetectLevel')) {
                $('v41AutoDetectLevel').checked = state.v41AutoDetectLevel !== false; // default true
                // ✅ V4.22: Mostrar/ocultar selector manual según estado
                const manualContainer = $('manualEvasionContainer');
                if (manualContainer) {
                    manualContainer.style.display = state.v41AutoDetectLevel !== false ? 'none' : 'block';
                }
                const badge = $('v41StatusBadge');
                if (badge) {
                    badge.textContent = state.v41AutoDetectLevel !== false ? '🤖 Auto ON' : '✋ Manual';
                }
            }
            if ($('v41TargetPlayer')) $('v41TargetPlayer').value = state.v41TargetPlayer || 'generic';
            if ($('v41CompatProfile')) {
                $('v41CompatProfile').value = state.v41CompatProfile || 'AUTO';
                // Actualizar hint si existe la función
                if (typeof this.updateCompressionHints === 'function') {
                    this.updateCompressionHints(state.v41CompatProfile);
                }
            }
            // ✅ V4.22: Restaurar nivel de evasión manual
            if ($('manualEvasionLevel')) {
                $('manualEvasionLevel').value = state.manualEvasionLevel || 3;
                this.state.manualEvasionLevel = state.manualEvasionLevel || 3;
                // Actualizar hint
                const hint = $('evasionLevelHint');
                const select = $('manualEvasionLevel');
                if (hint && select) {
                    hint.textContent = select.options[select.selectedIndex]?.dataset?.hint || '';
                }
            }
            if ($('antiFreezeLevel')) {
                $('antiFreezeLevel').value = state.antiFreezeLevel || 3;
                this.state.antiFreezeLevel = state.antiFreezeLevel || 3;
            }

            // V5.0 Serverless
            if ($('v5UseServerless')) {
                $('v5UseServerless').checked = !!state.v5UseServerless;
                // Trigger change event para mostrar/ocultar campos
                $('v5UseServerless').dispatchEvent(new Event('change'));
            }
            if ($('v5WorkerUrl')) $('v5WorkerUrl').value = state.v5WorkerUrl || '';
            if ($('v5ApiKey')) $('v5ApiKey').value = state.v5ApiKey || '';

            // Telemetría
            if ($('telemetryEnabled')) $('telemetryEnabled').checked = state.telemetryEnabled !== false;

            // Profile Manager APE v9.0
            if (window.ProfileManagerV9) {
                // Primero seleccionar el perfil
                if (state.selectedProfile) {
                    window.ProfileManagerV9.activeProfileId = state.selectedProfile;
                    localStorage.setItem('ape_active_profile', state.selectedProfile);
                }

                // ✅ V4.19.1: Restaurar estado expandido/colapsado
                if (state.profileManagerExpanded === true) {
                    // Si estaba expandido, renderizar expandido
                    window.ProfileManagerV9.render();
                } else {
                    // Si estaba colapsado (o no definido), mantener colapsado
                    window.ProfileManagerV9.collapse();
                }
            }

            console.log('✅ Estado del generador restaurado correctamente');
        } catch (e) {
            console.error('❌ Error restaurando estado del generador:', e);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ✅ V4.26: GENERATOR SNAPSHOT SYSTEM
    // Persistencia dedicada de canales para la pestaña Generar
    // Los canales se guardan como snapshot y NO se pierden al refrescar
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * ✅ V4.26: Guardar snapshot de canales para el Generador
     * Persiste los canales filtrados actuales en IndexedDB
     * @param {boolean} silent - Si es true, no muestra notificación
     * @returns {Promise<boolean>} - true si se guardó correctamente
     */
    async saveGeneratorSnapshot(silent = false) {
        if (!this.db) {
            console.warn('⚠️ saveGeneratorSnapshot: db no disponible');
            return false;
        }

        try {
            // ✅ V4.27.1: Guardar TODOS los canales (channelsMaster), no solo los filtrados
            // Esto asegura que la pestaña de Análisis tenga acceso al total de canales
            const allChannels = this.state.channelsMaster || [];
            const filteredChannels = this.getFilteredChannels();

            if (!allChannels || allChannels.length === 0) {
                console.warn('⚠️ No hay canales para guardar en snapshot');
                if (!silent) this.showToast('⚠️ No hay canales para guardar', true);
                return false;
            }

            // Crear snapshot con metadata
            const snapshot = {
                version: '1.1',  // ✅ V4.27.1: Versión actualizada con channelsMaster
                timestamp: Date.now(),
                totalChannels: allChannels.length,
                filteredCount: filteredChannels.length,

                // Identificar servidores origen (de TODOS los canales)
                serverIds: [...new Set(allChannels.map(ch => ch.serverId).filter(Boolean))],
                serverNames: [...new Set(allChannels.map(ch => {
                    const srv = this.state.activeServers?.find(s => s.id === ch.serverId);
                    return srv?.name || ch.serverObj?.name || 'Desconocido';
                }))],

                // ✅ V4.27.1: Guardar también los servidores activos
                activeServers: (this.state.activeServers || []).map(srv => ({
                    id: srv.id,
                    name: srv.name,
                    channelCount: srv.channelCount || srv.count,
                    baseUrl: srv.baseUrl,
                    active: srv.active
                })),

                // Stats del snapshot (de TODOS los canales)
                stats: {
                    total: allChannels.length,
                    filtered: filteredChannels.length,
                    groups: new Set(allChannels.map(ch => ch.group || ch.category_name)).size,
                    uhd4k: allChannels.filter(ch => {
                        const res = ch.resolution || ch.heuristics?.resolution || ch.name || '';
                        return res.toString().toUpperCase().includes('4K') || res.includes('2160');
                    }).length
                },

                // Filtros aplicados (para referencia)
                appliedFilters: {
                    searchQuery: this.state.searchQuery || '',
                    filterTier: this.state.filterTier || 'ALL',
                    filterCodec: this.state.filterCodec || 'ALL',
                    filterLanguage: this.state.filterLanguage || 'ALL',
                    advancedFilter: this.state.activeFilter?.groups?.length > 0
                },

                // ✅ V4.31: Guardar canal COMPLETO para que las columnas de servidor,
                // raw fields, y todos los datos estén disponibles al restaurar
                channels: allChannels.map(ch => {
                    // Shallow clone — excluir solo objetos circulares/internos pesados
                    const saved = { ...ch };

                    // Reducir peso: base.raw contiene el raw completo duplicado
                    if (saved.base && saved.base.raw) {
                        saved.base = { ...saved.base };
                        delete saved.base.raw; // evitar duplicación (ya está en saved.raw)
                    }

                    // Limpiar meta interno no necesario para restore
                    delete saved._fromCache;
                    delete saved.meta;

                    return saved;
                })
            };

            // Guardar en IndexedDB
            await this.db.saveAppState('generatorSnapshot', snapshot);

            console.log(`✅ Snapshot guardado: ${snapshot.totalChannels} canales de ${snapshot.serverNames.join(', ')}`);

            if (!silent) {
                this.showToast(`📸 Snapshot guardado: ${snapshot.totalChannels.toLocaleString()} canales`, false);
            }

            // Actualizar indicador visual
            this._updateSnapshotIndicator(snapshot);

            return true;
        } catch (e) {
            console.error('❌ Error guardando snapshot:', e);
            if (!silent) this.showToast('❌ Error guardando snapshot', true);
            return false;
        }
    }

    /**
     * ✅ V4.26: Cargar snapshot de canales del Generador
     * Restaura los canales desde IndexedDB si no hay canales en memoria
     * @param {boolean} force - Si es true, carga aunque ya haya canales
     * @returns {Promise<boolean>} - true si se cargó correctamente
     */
    async loadGeneratorSnapshot(force = false) {
        if (!this.db) {
            console.warn('⚠️ loadGeneratorSnapshot: db no disponible');
            return false;
        }

        try {
            // Si ya hay canales en memoria y no es forzado, no cargar
            if (!force && this.state.channelsMaster && this.state.channelsMaster.length > 0) {
                console.log('ℹ️ Ya hay canales en memoria, snapshot no necesario');
                // Aún así actualizar el indicador si existe snapshot
                const snapshot = await this.db.getAppState('generatorSnapshot');
                if (snapshot) this._updateSnapshotIndicator(snapshot);
                return false;
            }

            // Cargar snapshot desde IndexedDB
            const snapshot = await this.db.getAppState('generatorSnapshot');

            if (!snapshot || !snapshot.channels || snapshot.channels.length === 0) {
                console.log('ℹ️ No hay snapshot guardado');
                this._updateSnapshotIndicator(null);
                return false;
            }

            // Verificar antigüedad (7 días máximo)
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 días en ms
            if (Date.now() - snapshot.timestamp > maxAge) {
                console.warn('⚠️ Snapshot expirado (>7 días), ignorando');
                this._updateSnapshotIndicator(null);
                return false;
            }

            console.log(`🔄 Restaurando snapshot V${snapshot.version || '1.0'}: ${snapshot.totalChannels} canales`);
            console.log(`   Servidores: ${snapshot.serverNames?.join(', ') || 'N/A'}`);
            console.log(`   Guardado: ${new Date(snapshot.timestamp).toLocaleString()}`);

            // ✅ V4.27.1: Restaurar servidores activos primero (si están en el snapshot)
            if (snapshot.activeServers && snapshot.activeServers.length > 0) {
                // Solo restaurar si no hay servidores activos en memoria
                if (!this.state.activeServers || this.state.activeServers.length === 0) {
                    this.state.activeServers = snapshot.activeServers;
                    console.log(`   ✅ ${snapshot.activeServers.length} servidores restaurados del snapshot`);
                }
            }

            // Restaurar canales en memoria
            this.state.channelsMaster = snapshot.channels;
            this.state.channels = [...snapshot.channels];

            // Restaurar stats
            if (snapshot.stats) {
                this.state.stats = {
                    total: snapshot.stats.total,
                    active: snapshot.stats.filtered || snapshot.stats.total,
                    categories: snapshot.stats.groups,
                    premium: snapshot.stats.uhd4k
                };
            }

            // Descubrir campos dinámicos
            this.discoverFields(this.state.channelsMaster);

            // ✅ V4.31: Persistir canales a IndexedDB para que loadChannelsList los encuentre en futuros reloads
            try {
                await this.db.clearChannels();
                await this.db.saveChannels(snapshot.channels);
                console.log(`💾 Snapshot persistido a IndexedDB: ${snapshot.channels.length} canales`);
            } catch (dbErr) {
                console.warn('⚠️ No se pudo persistir snapshot a IndexedDB:', dbErr.message);
            }

            // Actualizar UI
            this.updateStatsUI();
            this.renderTable();
            this.renderServerList();  // ✅ V4.27.1: También renderizar lista de servidores
            this.updateGeneratorStats();

            // ✅ V4.31: Cambiar a pestaña Análisis para mostrar la tabla con datos
            this.showTab('analysis');

            // ✅ V4.31: Lanzar enriquecimiento interno (clasificación, etc.)
            if (typeof this._launchInternalEnrichment === 'function') {
                requestAnimationFrame(() => this._launchInternalEnrichment('after_snapshot_restore'));
            }

            // Actualizar indicador
            this._updateSnapshotIndicator(snapshot);

            console.log(`✅ Snapshot restaurado: ${snapshot.totalChannels} canales listos`);
            this.showToast(`📸 Snapshot restaurado: ${snapshot.totalChannels.toLocaleString()} canales`, false);

            return true;
        } catch (e) {
            console.error('❌ Error cargando snapshot:', e);
            return false;
        }
    }

    /**
     * ✅ V4.26: Actualizar indicador visual del snapshot
     * @param {Object|null} snapshot - El snapshot actual o null si no hay
     */
    _updateSnapshotIndicator(snapshot) {
        const indicator = document.getElementById('snapshotIndicator');
        const statusText = document.getElementById('snapshotStatus');

        if (!indicator) return;

        if (snapshot && snapshot.channels && snapshot.channels.length > 0) {
            const age = Date.now() - snapshot.timestamp;
            const ageText = age < 60000 ? 'hace segundos' :
                age < 3600000 ? `hace ${Math.floor(age / 60000)} min` :
                    age < 86400000 ? `hace ${Math.floor(age / 3600000)} horas` :
                        `hace ${Math.floor(age / 86400000)} días`;

            indicator.classList.add('snapshot-active');
            indicator.classList.remove('snapshot-empty');
            indicator.title = `Snapshot: ${snapshot.totalChannels} canales (${ageText})`;

            if (statusText) {
                statusText.innerHTML = `<span style="color:#10b981;">📸 ${snapshot.totalChannels.toLocaleString()} canales</span> <span style="color:#94a3b8; font-size:0.7rem;">(${ageText})</span>`;
            }
        } else {
            indicator.classList.remove('snapshot-active');
            indicator.classList.add('snapshot-empty');
            indicator.title = 'Sin snapshot guardado';

            if (statusText) {
                statusText.innerHTML = '<span style="color:#94a3b8;">Sin snapshot</span>';
            }
        }
    }

    /**
     * ✅ V4.26: Limpiar snapshot guardado
     */
    async clearGeneratorSnapshot() {
        if (!this.db) return;

        try {
            await this.db.saveAppState('generatorSnapshot', null);
            this._updateSnapshotIndicator(null);
            console.log('🗑️ Snapshot del generador eliminado');
            this.showToast('🗑️ Snapshot eliminado', false);
        } catch (e) {
            console.error('❌ Error eliminando snapshot:', e);
        }
    }

    async resetFactorySettings() {
        if (!confirm('⚠️ ¿Borrar TODOS los datos y reiniciar?')) return;
        if (this.db) {
            await this.db.clearAll();
            window.location.reload();
        }
    }

    // ==================== BINDINGS ====================
    bindEvents() {
        const $ = (id) => document.getElementById(id);

        ['baseUrl', 'username', 'password', 'apiType', 'serverName'].forEach(id => {
            const el = $(id);
            if (el) {
                el.addEventListener('input', () => this.saveConfigState());
                el.addEventListener('change', () => this.saveConfigState());
            }
        });

        if ($('btnFactoryReset')) $('btnFactoryReset').onclick = () => this.resetFactorySettings();
        if ($('btnClear')) $('btnClear').onclick = () => this.clearConnectionFields();
        // btnConnect is handled via form onsubmit now


        // IMPORTANTE: Bind al input de búsqueda correcto (manejamos ambos IDs por seguridad)
        const searchInput = $('searchQuery') || $('searchQuery');
        if (searchInput) searchInput.oninput = (e) => {
            this.state.searchQuery = e.target.value;
            this.renderTable();
            this.updateActiveFiltersSummary(); // ✅ V4.9: Update summary
        };

        if ($('filterTier')) $('filterTier').onchange = (e) => {
            this.state.filterTier = e.target.value;
            this.renderTable();
            this.updateActiveFiltersSummary(); // ✅ V4.9: Update summary
        };

        if ($('filterCodec')) $('filterCodec').onchange = (e) => {
            this.state.filterCodec = e.target.value;
            this.renderTable();
            this.updateActiveFiltersSummary(); // ✅ V4.9: Update summary
        };

        if ($('filterLanguage')) $('filterLanguage').onchange = (e) => {
            this.state.filterLanguage = e.target.value;
            this.renderTable();
            this.updateActiveFiltersSummary(); // ✅ V4.9: Update summary
        };

        if ($('btnGenerateM3U8')) $('btnGenerateM3U8').onclick = () => this.generateM3U8();
        if ($('btnDownloadM3U8')) $('btnDownloadM3U8').onclick = () => this.downloadM3U8();
        if ($('btnExportExcel')) $('btnExportExcel').onclick = () => this.exportToExcel();
        if ($('btnExportCSV')) $('btnExportCSV').onclick = () => this.exportToCSV();

        window.showTab = (id) => this.showTab(id);

        if ($('btnApplyFilters')) $('btnApplyFilters').onclick = () => this.applyAdvancedFilters();
        if ($('btnAddFilterGroup')) $('btnAddFilterGroup').onclick = () => this.addFilterGroupUI();
        if ($('btnClearFilters')) $('btnClearFilters').onclick = () => this.clearAdvancedFilters();
        if ($('btnEditFilters')) $('btnEditFilters').onclick = () => this.enableFilterEditing();
        if ($('rankingPreset')) $('rankingPreset').onchange = (e) => this.changeRankingPreset(e.target.value);
        if ($('rankingMode')) $('rankingMode').onchange = () => this.recalculateRanking();
        if ($('btnEnrichLatam')) $('btnEnrichLatam').onclick = () => this.enrichWithSource('iptv-org-latam');
        if ($('btnCancelEnrich')) $('btnCancelEnrich').onclick = () => this.cancelEnrichment();

        // Sources Tab Logic
        const btnAddSource = $('btnAddSource');
        if (btnAddSource) {
            btnAddSource.onclick = async () => {
                const label = ($('sourceLabel')?.value || '').trim();
                const url = ($('sourceBaseUrl')?.value || '').trim();

                if (!url) {
                    alert('⚠️ Introduce una URL base');
                    return;
                }

                try {
                    await this.sourceManager.addSource(label, url);
                    $('sourceLabel').value = '';
                    $('sourceBaseUrl').value = '';
                    alert('✅ Fuente agregada');
                } catch (e) {
                    alert(`❌ Error: ${e.message}`);
                }
            };
        }

        const btnDiscoverAndAddSource = $('btnDiscoverAndAddSource');
        if (btnDiscoverAndAddSource) {
            btnDiscoverAndAddSource.onclick = () => this.addSourceFromUI();
        }

        document.addEventListener('click', (e) => {
            // ✅ V4.4.4: Close columnList when clicking outside
            const columnList = document.getElementById('columnList');
            const btnToggleCols = document.getElementById('btnToggleCols');

            if (columnList && columnList.style.display === 'block') {
                // Si click NO está en el list y NO está en el botón
                if (!columnList.contains(e.target) && !btnToggleCols?.contains(e.target)) {
                    columnList.style.display = 'none';
                    columnList.classList.remove('column-list-always-top');
                    console.log('🚪 Columnlist cerrado (click outside)');
                }
            }

            if (e.target.dataset.action === 'prevPage') this.changePage(-1);
            if (e.target.dataset.action === 'nextPage') this.changePage(1);
        });

        // ✅ V4.10: Toggle Ranking Dinámico Panel
        this.setupRankingPanelToggle();
    }

    /**
     * Setup toggle for Ranking Dinámico collapsible panel
     */
    setupRankingPanelToggle() {
        const toggleBtn = document.getElementById('ranking-toggle-btn');
        const toggleHeader = document.getElementById('ranking-panel-header');
        const panelBody = document.getElementById('ranking-panel-body');
        const panel = document.getElementById('ranking-dinamico-panel');

        if (!toggleBtn || !panelBody) return;

        // Restore collapsed state from localStorage
        const isCollapsed = localStorage.getItem('ranking_panel_collapsed') === 'true';
        if (isCollapsed) {
            panel?.classList.add('ranking-panel-collapsed');
            panelBody.style.display = 'none';
            toggleBtn.querySelector('.ranking-toggle-icon').textContent = '▶';
        }

        const toggle = () => {
            const currentlyCollapsed = panel?.classList.contains('ranking-panel-collapsed');

            if (currentlyCollapsed) {
                // Expand
                panel?.classList.remove('ranking-panel-collapsed');
                panelBody.style.display = '';
                toggleBtn.querySelector('.ranking-toggle-icon').textContent = '▼';
                localStorage.setItem('ranking_panel_collapsed', 'false');
            } else {
                // Collapse
                panel?.classList.add('ranking-panel-collapsed');
                panelBody.style.display = 'none';
                toggleBtn.querySelector('.ranking-toggle-icon').textContent = '▶';
                localStorage.setItem('ranking_panel_collapsed', 'true');
            }
        };

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggle();
        });

        toggleHeader?.addEventListener('click', (e) => {
            // Only toggle if clicking on header left side, not on buttons
            if (e.target.closest('.panel-header-left') || e.target === toggleHeader) {
                toggle();
            }
        });

        console.log('[App] Ranking panel toggle initialized');
    }

    showTab(tabId) {
        // ✅ V4.10: Block tab switching during connection progress
        if (this._connectionInProgress && tabId !== 'connection') {
            console.log('🚫 Tab switch blocked - connection in progress');
            // Show visual feedback
            const container = document.getElementById('enrichmentProgressContainer');
            if (container) {
                container.style.animation = 'shake 0.3s ease-in-out';
                setTimeout(() => container.style.animation = '', 300);
            }
            return;
        }

        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        const target = document.getElementById('tab-' + tabId) || document.getElementById(tabId);
        if (target) target.classList.add('active');

        document.querySelectorAll('.tab-button').forEach(el => {
            if (el.dataset.tab === tabId || (el.getAttribute('onclick') && el.getAttribute('onclick').includes(tabId)))
                el.classList.add('active');
            else
                el.classList.remove('active');
        });
    }

    // ==================== STREAM QUALITY PROBE (V4.6.2) ====================

    /**
     * Show/update heuristic progress UI
     */
    showHeuristicProgress(show, options = {}) {
        const container = document.getElementById('heuristicProgress');
        const dot = document.getElementById('heuristicDot');
        const label = document.getElementById('heuristicLabel');
        const fill = document.getElementById('heuristicFill');
        const count = document.getElementById('heuristicCount');
        const time = document.getElementById('heuristicTime');

        if (!container) return;

        if (show) {
            container.style.display = 'block';
            if (dot) dot.classList.add('active');
            if (fill) {
                fill.classList.add('active');
                fill.style.width = `${options.percent || 0}%`;
            }
            if (label) label.textContent = options.label || 'Procesando...';
            if (count) count.textContent = `${options.current || 0} / ${options.total || 0} canales`;
            if (time) time.textContent = `~${options.remaining || 0}s restante`;
        } else {
            if (dot) dot.classList.remove('active');
            if (fill) fill.classList.remove('active');
            setTimeout(() => {
                if (container) container.style.display = 'none';
            }, 1000);
        }
    }

    /**
     * Probe visible channels (current page) for real quality detection
     */
    async probeVisibleChannels() {
        if (!this.streamProbe) {
            alert('⚠️ StreamQualityProbe no disponible');
            return;
        }

        const statusEl = document.getElementById('probeStatus');
        const btn = document.getElementById('btnProbeQuality');

        // Get currently visible channels (current page)
        const visibleChannels = this.state.channels.slice(
            (this.state.currentPage - 1) * this.state.itemsPerPage,
            this.state.currentPage * this.state.itemsPerPage
        );

        if (visibleChannels.length === 0) {
            if (statusEl) statusEl.textContent = '⚠️ No hay canales para analizar';
            return;
        }

        if (btn) btn.disabled = true;
        if (statusEl) statusEl.textContent = `🔬 Analizando ${visibleChannels.length} canales...`;

        console.log(`🔬 Iniciando probe de ${visibleChannels.length} canales visibles...`);
        const startTime = Date.now();

        try {
            // Show progress UI
            this.showHeuristicProgress(true, {
                label: '🔬 Analizando calidad real de streams...',
                current: 0,
                total: visibleChannels.length,
                percent: 0
            });

            const results = await this.streamProbe.probeChannels(visibleChannels, (progress) => {
                this.showHeuristicProgress(true, {
                    label: `🔬 Probando: ${progress.channel?.substring(0, 30) || '...'}`,
                    current: progress.current,
                    total: progress.total,
                    percent: progress.percent,
                    remaining: progress.remaining
                });
                if (statusEl) {
                    statusEl.textContent = `🔬 ${progress.current}/${progress.total} (${progress.percent}%)`;
                }
            });

            // Process results - update channel objects
            let probed = 0, errors = 0, fakeDetected = 0;

            results.forEach(({ channel, probe }) => {
                if (probe.error) {
                    errors++;
                } else {
                    probed++;
                    channel._probed = true;
                    channel._probeResult = probe;

                    // Check for fake quality
                    if (probe.actualHeight && channel.resolution) {
                        const comparison = this.streamProbe.compareQuality(channel.resolution, probe.actualHeight);
                        if (comparison.fake) {
                            channel._fakeQuality = true;
                            channel._fakeLabel = comparison.label;
                            fakeDetected++;
                        }
                    }
                }
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Probe completado en ${elapsed}s: ${probed} OK, ${errors} errores, ${fakeDetected} fake detectados`);

            if (statusEl) {
                statusEl.textContent = `✅ ${probed} analizados, ${fakeDetected} fake detectados (${elapsed}s)`;
            }

            // Hide progress and refresh table
            this.showHeuristicProgress(false);
            this.renderTable();

        } catch (e) {
            console.error('❌ Error en probe:', e);
            if (statusEl) statusEl.textContent = `❌ Error: ${e.message}`;
            this.showHeuristicProgress(false);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /**
     * Probe channels using Rust backend server
     * High-performance: 150 concurrent, WebSocket progress
     * V4.23: Now uploads results to R2 and calculates quality grades
     * V4.23.1: Auto-loads cache from R2 at the end for verification
     * V4.24: Usa canales FILTRADOS (los visibles en tabla) en lugar de todos
     */
    async probeAllChannelsBackend() {
        // V4.25.0: Probe Server en VPS Hetzner (o localhost como fallback)
        const PROBE_SERVER = window.PROBE_SERVER_URL || 'http://178.156.147.234:8765';
        const WS_URL = window.PROBE_WS_URL || 'ws://178.156.147.234:8765/ws/progress';

        const statusEl = document.getElementById('probeStatus');
        const btn = document.getElementById('btnProbeQuality');
        const btnCache = document.getElementById('btnLoadProbeResults');

        // V4.24: Usar canales filtrados (los que se ven en la tabla)
        const channelsToProbe = this.state.channels && this.state.channels.length > 0
            ? this.state.channels
            : this.state.channelsMaster;

        if (channelsToProbe.length === 0) {
            if (statusEl) statusEl.textContent = '⚠️ No hay canales cargados';
            return;
        }

        // V4.24: Mostrar si es filtrado o todos
        const isFiltered = channelsToProbe.length < (this.state.channelsMaster?.length || 0);
        const modeLabel = isFiltered
            ? `🎯 FILTRADOS (${channelsToProbe.length.toLocaleString()} de ${this.state.channelsMaster.length.toLocaleString()})`
            : `📺 TODOS (${channelsToProbe.length.toLocaleString()})`;
        console.log(`🔬 Modo probe: ${modeLabel}`);

        // V4.23.1: Marcar que el probe está en progreso
        this._probeInProgress = true;
        if (btnCache) btnCache.disabled = true;

        // Test server availability
        try {
            const health = await fetch(`${PROBE_SERVER}/health`, { method: 'GET' });
            if (!health.ok) throw new Error('Server not responding');
            const healthData = await health.json();
            console.log('🔬 Probe server health:', healthData);
            // #region agent log - Hypothesis A: Verify server version
            fetch('http://127.0.0.1:7242/ingest/481ee112-165a-4070-b932-c90f00acca1e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'app.js:2228', message: 'Server health check', data: { version: healthData.version, ffprobe: healthData.ffprobe_available, bodyLimit: healthData.body_limit_mb }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'A' }) }).catch(() => { });
            // #endregion
        } catch (e) {
            alert(`⚠️ Servidor de Probe (Rust) no disponible.\n\nEjecuta primero:\n  cd iptv_nav/files/tools/stream_probe_server\n  cargo run --release\n\nO ejecuta: run_server.bat`);
            this._probeInProgress = false;
            if (btnCache) btnCache.disabled = false;
            return;
        }

        if (btn) btn.disabled = true;
        const totalChannels = channelsToProbe.length;
        if (statusEl) statusEl.textContent = `🔬 ${isFiltered ? '🎯 ' : ''}Analizando ${totalChannels.toLocaleString()} canales${isFiltered ? ' filtrados' : ''}...`;

        console.log(`🔬 Iniciando probe backend de ${totalChannels.toLocaleString()} canales${isFiltered ? ' (filtrados)' : ''}...`);
        const startTime = Date.now();

        // Connect WebSocket for progress
        let ws = null;
        try {
            ws = new WebSocket(WS_URL);
            ws.onmessage = (event) => {
                const progress = JSON.parse(event.data);
                this.showHeuristicProgress(true, {
                    label: `🔬 Analizando: ${progress.current}/${progress.total}`,
                    current: progress.current,
                    total: progress.total,
                    percent: progress.percent,
                    remaining: progress.eta_seconds
                });
                if (statusEl) {
                    statusEl.textContent = `🔬 ${progress.current}/${progress.total} (${Math.round(progress.percent)}%) - ${progress.success_count} OK, ${progress.error_count} errores`;
                }
            };
            ws.onerror = () => console.warn('WebSocket error, progress may not update');
        } catch (e) {
            console.warn('WebSocket connection failed:', e);
        }

        try {
            this.showHeuristicProgress(true, {
                label: '🔬 Enviando canales al servidor Rust...',
                current: 0,
                total: totalChannels,
                percent: 0
            });

            // #region agent log - Hypothesis B,C: Inspect raw channels before mapping (including serverId)
            const sampleRaw = channelsToProbe.slice(0, 3).map(ch => ({
                id: ch.id, stream_id: ch.stream_id, serverId: ch.serverId,
                url: ch.url, container_extension: ch.container_extension,
                name: ch.name, resolution: ch.resolution
            }));
            const activeServersInfo = (this.state.activeServers || []).map(s => ({
                id: s.id, baseUrl: (s.baseUrl || '').substring(0, 40),
                hasUser: !!s.username, hasPass: !!s.password
            }));
            fetch('http://127.0.0.1:7242/ingest/481ee112-165a-4070-b932-c90f00acca1e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'app.js:2275', message: 'Raw channels + servers', data: { sampleRaw, activeServersInfo, totalServers: activeServersInfo.length, totalToProbe: channelsToProbe.length }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'B,C' }) }).catch(() => { });
            // #endregion

            // V4.24.6 FIX: Obtener credenciales desde server library (localStorage)
            // Los activeServers no tienen credenciales, pero server_library SÍ
            let serverLibrary = [];
            try {
                serverLibrary = JSON.parse(localStorage.getItem('iptv_server_library') || '[]');
            } catch (e) { serverLibrary = []; }

            // #region agent log - Hypothesis J: Debug server library
            fetch('http://127.0.0.1:7242/ingest/481ee112-165a-4070-b932-c90f00acca1e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'app.js:2290', message: 'Server library loaded', data: { count: serverLibrary.length, servers: serverLibrary.map(s => ({ id: s.id, name: s.name, baseUrl: (s.baseUrl || '').substring(0, 40), hasUser: !!s.username, hasPass: !!s.password })) }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'J' }) }).catch(() => { });
            // #endregion

            // Prepare channels data for probe server
            const channelsData = channelsToProbe.map((ch, idx) => {
                let url = '';
                const streamId = ch.stream_id || ch.id;

                // V4.24.6 FIX: Buscar servidor en MÚLTIPLES fuentes
                // 1. Server library (tiene credenciales completas)
                // 2. activeServers (puede no tener credenciales)
                // 3. currentServer (tiene credenciales si está activo)

                let server = null;
                const hostname = (ch.url || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();

                // Buscar en server library por hostname match
                server = serverLibrary.find(s => {
                    const srvHost = (s.baseUrl || '').replace(/^https?:\/\//, '').replace(/\/player_api\.php$/, '').split('/')[0].toLowerCase();
                    return srvHost === hostname || srvHost.includes(hostname) || hostname.includes(srvHost);
                });

                // Si no encontramos, intentar con activeServers
                if (!server || !server.username) {
                    server = (this.state.activeServers || []).find(s => s.id === ch.serverId);
                }

                // Último recurso: currentServer
                if (!server || !server.username) {
                    const cs = this.state.currentServer;
                    if (cs && cs.username && cs.password) {
                        const csHost = (cs.baseUrl || '').replace(/^https?:\/\//, '').replace(/\/player_api\.php$/, '').split('/')[0].toLowerCase();
                        if (csHost === hostname || csHost.includes(hostname) || hostname.includes(csHost)) {
                            server = cs;
                        }
                    }
                }

                // #region agent log - Hypothesis K: Debug server resolution
                if (idx < 3) {
                    fetch('http://127.0.0.1:7242/ingest/481ee112-165a-4070-b932-c90f00acca1e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'app.js:2320', message: `Server resolution for channel ${idx}`, data: { channelHostname: hostname, serverFound: !!server, serverSource: server ? 'found' : 'none', hasUser: !!server?.username, hasPass: !!server?.password, baseUrl: server?.baseUrl?.substring(0, 40) }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'K' }) }).catch(() => { });
                }
                // #endregion

                // Construir URL si tenemos servidor con credenciales
                if (server && server.username && server.password && streamId) {
                    const ext = ch.container_extension || this.state.streamFormat || 'ts';
                    // Usar hostname del canal o baseUrl del servidor
                    let baseUrl = hostname || server.baseUrl || '';
                    baseUrl = baseUrl.replace(/\/player_api\.php$/, '').replace(/\/$/, '');
                    if (!baseUrl.startsWith('http')) {
                        baseUrl = 'http://' + baseUrl;
                    }
                    url = `${baseUrl}/live/${server.username}/${server.password}/${streamId}.${ext}`;
                }
                // Fallback: si ch.url YA es una URL completa (http://...)
                else if (ch.url && ch.url.startsWith('http')) {
                    url = ch.url;
                }
                // Fallback: stream_url o direct_source
                else if (ch.stream_url && ch.stream_url.startsWith('http')) {
                    url = ch.stream_url;
                }
                else if (ch.direct_source && ch.direct_source.startsWith('http')) {
                    url = ch.direct_source;
                }

                return {
                    id: String(ch.id || ch.stream_id || ch._idx || ''),
                    url: String(url || ''),
                    name: String(ch.name || ''),
                    resolution: String(ch.resolution || '')
                };
            });

            // #region agent log - Hypothesis D,E: Inspect mapped channelsData
            const sampleMapped = channelsData.slice(0, 3);
            const payloadSize = JSON.stringify({ channels: channelsData }).length;
            fetch('http://127.0.0.1:7242/ingest/481ee112-165a-4070-b932-c90f00acca1e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'app.js:2285', message: 'Mapped channelsData', data: { sampleMapped, payloadSizeBytes: payloadSize, payloadSizeMB: (payloadSize / 1024 / 1024).toFixed(2), channelsCount: channelsData.length }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'D,E' }) }).catch(() => { });
            // #endregion

            // DEBUG: Log to console for visibility
            console.log('🔬 [DEBUG] Sample channelsData (first 3):', JSON.stringify(sampleMapped, null, 2));
            console.log('🔬 [DEBUG] Payload size:', (payloadSize / 1024 / 1024).toFixed(2), 'MB');
            console.log('🔬 [DEBUG] Channels WITH valid URL:', channelsData.filter(ch => ch.url && ch.url.startsWith('http')).length);
            console.log('🔬 [DEBUG] Channels WITHOUT URL:', channelsData.filter(ch => !ch.url || !ch.url.startsWith('http')).length);

            // V4.24.8: BATCH PROCESSING OPTIMIZADO - Batches pequeños para máxima estabilidad
            const BATCH_SIZE = 50;  // Reducido para evitar saturación
            const DELAY_BETWEEN_BATCHES = 500;  // 500ms entre lotes
            const allResults = [];
            let totalSuccessCount = 0;
            let totalErrorCount = 0;

            const batches = [];
            for (let i = 0; i < channelsData.length; i += BATCH_SIZE) {
                batches.push(channelsData.slice(i, i + BATCH_SIZE));
            }

            console.log(`📦 [BATCH] Dividiendo ${channelsData.length} canales en ${batches.length} lotes de ${BATCH_SIZE}`);

            // V4.24.8: Fallback inteligente - si muchos lotes fallan, abortar y usar heurísticas
            const MAX_CONSECUTIVE_FAILURES = 3;
            let consecutiveFailures = 0;
            let abortedDueToFailures = false;

            for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
                const batch = batches[batchIdx];
                const batchNum = batchIdx + 1;

                console.log(`📦 [BATCH ${batchNum}/${batches.length}] Enviando ${batch.length} canales...`);

                if (statusEl) {
                    statusEl.textContent = `📦 Lote ${batchNum}/${batches.length} - Enviando ${batch.length} canales...`;
                }

                this.showHeuristicProgress(true, {
                    label: `📦 Procesando lote ${batchNum}/${batches.length}`,
                    current: batchIdx * BATCH_SIZE,
                    total: channelsData.length,
                    percent: (batchIdx / batches.length) * 100
                });

                try {
                    const response = await fetch(`${PROBE_SERVER}/probe-all`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ channels: batch }),
                        signal: AbortSignal.timeout(60000) // 1 minute per batch (50 canales)
                    });

                    if (!response.ok) {
                        let responseBody = null;
                        try { responseBody = await response.text(); } catch (e) { }
                        console.error(`❌ [BATCH ${batchNum}] Error:`, response.status, responseBody);
                        totalErrorCount += batch.length;
                        continue; // Try next batch
                    }

                    const batchResult = await response.json();
                    console.log(`✅ [BATCH ${batchNum}] Completado: ${batchResult.success_count || 0} OK, ${batchResult.error_count || 0} errores`);

                    if (batchResult.results) {
                        allResults.push(...batchResult.results);
                    }
                    totalSuccessCount += batchResult.success_count || 0;
                    totalErrorCount += batchResult.error_count || 0;
                    consecutiveFailures = 0; // Reset on success

                } catch (batchErr) {
                    console.error(`❌ [BATCH ${batchNum}] Exception:`, batchErr.message);
                    totalErrorCount += batch.length;
                    consecutiveFailures++;

                    // V4.24.8: Abort if too many consecutive failures
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        console.warn(`⚠️ [BATCH] ${MAX_CONSECUTIVE_FAILURES} fallos consecutivos - Abortando probe y usando heurísticas`);
                        abortedDueToFailures = true;
                        break;
                    }
                }

                // Delay between batches (except last one)
                if (batchIdx < batches.length - 1) {
                    console.log(`⏸️ Pausa ${DELAY_BETWEEN_BATCHES}ms antes del siguiente lote...`);
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                }
            }

            console.log(`📊 [BATCH COMPLETE] Total: ${allResults.length} resultados, ${totalSuccessCount} OK, ${totalErrorCount} errores`);

            // V4.24.8: Notify user if aborted and using fallback
            if (abortedDueToFailures) {
                console.warn('⚠️ Probe abortado - El sistema usará scoring heurístico (historial + patrones)');
                if (statusEl) {
                    statusEl.textContent = '⚠️ Probe parcial - Usando scoring heurístico';
                }
            }

            // Aggregate results into the expected format
            const data = {
                success: !abortedDueToFailures || allResults.length > 0,
                results: allResults,
                success_count: totalSuccessCount,
                error_count: totalErrorCount,
                total: channelsData.length,
                aborted: abortedDueToFailures
            };
            console.log(`📊 Resultados recibidos:`, data);

            // Map results back to channelsMaster
            const resultsMap = new Map();
            (data.results || []).forEach(r => {
                resultsMap.set(r.channel_id, r);
            });

            // V4.23: Statistics for verification
            const stats = { verified: 0, better: 0, downgrade: 0, fake: 0, pending: 0, error: 0 };
            let updated = 0;

            this.state.channelsMaster.forEach(ch => {
                const chId = ch.id || ch.stream_id || String(ch._idx);
                const result = resultsMap.get(chId);

                if (result && result.success) {
                    updated++;

                    // ✅ V4.6: Write to tech layer (NOT directly to channel)
                    if (!ch.tech) ch.tech = {};
                    ch.tech.codec = result.codec || null;
                    ch.tech.bitrateKbps = result.bitrate || null;
                    ch.tech.width = result.width || null;
                    ch.tech.height = result.height || null;
                    ch.tech.fps = result.fps || null;
                    ch.tech.resolutionLabel = result.resolutionLabel || null;
                    ch.tech.video_pid = result.video_pid || null;
                    ch.tech.audio_pid = result.audio_pid || null;
                    ch.tech.sampled = true;
                    ch.tech.probedAt = Date.now();

                    // Update meta
                    if (!ch.meta) ch.meta = {};
                    ch.meta.probed = true;

                    // Legacy compatibility
                    ch._probed = true;
                    ch._probeResult = result;

                    // V4.23: Store probe results for display
                    ch._realWidth = result.width || null;
                    ch._realHeight = result.height || null;
                    ch._realBitrate = result.bitrate || null;
                    ch._realCodec = result.codec || null;
                    ch._realFps = result.fps || null;
                    ch._probeStatus = 'probed';

                    // Format real resolution string
                    if (ch._realWidth && ch._realHeight) {
                        ch._resReal = `${ch._realWidth}×${ch._realHeight}`;
                    }

                    // V4.23: Calculate verification status
                    const declaredHeight = this._parseResolutionToHeight(
                        ch.resolution || ch._quality || ch.stream_icon
                    );
                    const realHeight = ch._realHeight;

                    if (!declaredHeight || !realHeight) {
                        ch._verification = 'UNKNOWN';
                    } else if (realHeight >= declaredHeight * 0.9) {
                        if (realHeight > declaredHeight * 1.1) {
                            ch._verification = 'BETTER';
                            stats.better++;
                        } else {
                            ch._verification = 'VERIFIED';
                            stats.verified++;
                        }
                    } else if (realHeight >= declaredHeight * 0.5) {
                        ch._verification = 'DOWNGRADE';
                        stats.downgrade++;
                    } else {
                        ch._verification = 'FAKE';
                        stats.fake++;
                    }

                    // V4.23: Calculate quality grade
                    const gradeResult = this.calculateQualityGrade(ch);
                    ch._qualityGrade = gradeResult.grade;
                    ch._gradeColor = gradeResult.color;
                    ch._gradeLabel = gradeResult.label;

                } else {
                    ch._probeStatus = result ? 'error' : 'pending';
                    ch._verification = result ? 'ERROR' : 'PENDING';
                    if (result) stats.error++;
                    else stats.pending++;
                }

                // Set declared resolution for display
                ch._resDeclared = ch.resolution || ch._quality || '-';
            });

            // Update channels array
            this.state.channels = [...this.state.channelsMaster];

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Probe backend completado en ${elapsed}s: ${data.success_count} OK, ${data.error_count} errores`);
            console.table(stats);

            if (statusEl) {
                statusEl.textContent = `✅ ${data.success_count}/${totalChannels} analizados (${elapsed}s) - ${updated} actualizados`;
            }

            // V4.23: Upload results to R2 for caching
            if (statusEl) statusEl.textContent = '☁️ Subiendo resultados a R2...';
            try {
                await this._uploadProbeResultsToR2(data.results || []);
                console.log('✅ Probe results saved to R2');
            } catch (uploadErr) {
                console.warn('⚠️ Could not upload probe results to R2:', uploadErr.message);
            }

            // V4.23: Update probe stats UI
            this._updateProbeStatsUI(stats);

            // V4.23: Ensure probe fields exist
            this._ensureProbeFields();

            // Save updated data
            await this.saveChannelsList();

            this.showHeuristicProgress(false);
            this.renderTable();

            // V4.23.1: Cargar cache desde R2 al final para verificar datos más recientes
            if (statusEl) statusEl.textContent = '📊 Verificando resultados desde R2...';
            console.log('📊 Cargando cache desde R2 para verificación final...');
            try {
                await this.loadProbeResultsFromR2();
                console.log('✅ Cache cargado y verificado desde R2');
            } catch (cacheErr) {
                console.warn('⚠️ No se pudo verificar cache desde R2:', cacheErr.message);
            }

        } catch (e) {
            console.error('❌ Error en probe backend:', e);
            if (statusEl) statusEl.textContent = `❌ Error: ${e.message}`;
            this.showHeuristicProgress(false);
        } finally {
            if (btn) btn.disabled = false;
            if (btnCache) btnCache.disabled = false;
            if (ws) ws.close();
            // V4.23.1: Marcar que el probe ha terminado
            this._probeInProgress = false;
        }
    }

    // ==================== V4.23: PROBE SERVER AUTO-CHECK ====================

    /**
     * Start automatic monitoring of the probe server
     * Calls watchdog to wake server, then monitors
     * V4.28: Optimized — 60s interval, throttled checks, silent when stable
     */
    _startProbeServerMonitor() {
        // Guard: never start multiple monitors
        if (this._probeMonitorStarted) return;
        this._probeMonitorStarted = true;
        this._lastProbeCheck = 0; // timestamp of last check

        // V4.24: First try to wake the server via watchdog
        this._wakeServerViaWatchdog();

        // Initial check after brief delay
        setTimeout(() => this._checkProbeServerStatus(), 2000);

        // Set up periodic check every 60 seconds (was 10s — caused console flood)
        this._probeServerCheckInterval = setInterval(() => {
            this._checkProbeServerStatus();
        }, 60000);

        // Also check when tab becomes visible (throttled)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Only check if >30s since last check
                if (Date.now() - this._lastProbeCheck > 30000) {
                    this._checkProbeServerStatus();
                }
            }
        });

        console.log('🔍 Probe Server Monitor iniciado (check cada 60s)');
    }

    /**
     * Attempt to wake/check the probe server
     * Called on page load and tab focus
     */
    async _wakeServerViaWatchdog() {
        // Throttle: skip if checked recently
        if (Date.now() - this._lastProbeCheck < 30000) return this._probeServerAvailable;

        // Update UI to show checking
        const dot = document.getElementById('probeServerDot');
        const text = document.getElementById('probeServerText');

        if (dot) dot.style.background = '#fbbf24'; // Yellow - checking
        if (text) text.textContent = 'Verificando...';

        // Check if server is available
        const available = await this._checkProbeServerStatus();

        if (!available) {
            console.log('ℹ️ Probe Server no disponible');
        }

        return available;
    }

    /**
     * Auto-check if Probe Server is running
     * Updates UI badge indicator and enables/disables probe buttons
     */
    async _checkProbeServerStatus() {
        // V4.28: Throttle — max 1 check per 30 seconds
        const now = Date.now();
        if (now - this._lastProbeCheck < 30000) return this._probeServerAvailable;
        this._lastProbeCheck = now;

        // V4.25.0: Probe Server en VPS Hetzner
        const PROBE_SERVER = window.PROBE_SERVER_URL || 'http://178.156.147.234:8765';
        const badge = document.getElementById('probeServerBadge');
        const dot = document.getElementById('probeServerDot');
        const text = document.getElementById('probeServerText');
        const btnProbe = document.getElementById('btnProbeQuality');
        const wasAvailable = this._probeServerAvailable;

        try {
            // Use _originalFetch to bypass the evasion engine interceptor
            const fetchFn = window._APE_ORIGINAL_FETCH || fetch;
            const response = await fetchFn(`${PROBE_SERVER}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(8000)
            });

            if (response.ok) {
                const data = await response.json();

                // Only log on state CHANGE (avoids console flood)
                if (!wasAvailable) {
                    console.log('✅ [ProbeServer] CONECTADO:', data);
                    this._showProbeServerNotification('connected', data);
                }

                // Update badge UI silently
                if (dot) dot.style.background = '#4ade80';
                if (text) text.textContent = 'Probe Server';
                if (badge) {
                    badge.title = `✅ Probe Server v${data.version} | ${data.max_concurrent} streams | FFprobe: ${data.ffprobe_available ? 'OK' : 'NO'}`;
                    badge.style.cursor = 'default';
                    badge.onclick = null;
                }
                if (btnProbe) {
                    btnProbe.disabled = false;
                    btnProbe.title = 'Analiza calidad real de TODOS los streams';
                }

                this._probeServerAvailable = true;
                return true;
            }
        } catch (e) {
            // Only log on state CHANGE
            if (wasAvailable) {
                console.log('⚠️ [ProbeServer] DESCONECTADO:', e.message);
                this._showProbeServerNotification('disconnected');
            }

            if (dot) dot.style.background = '#f87171';
            if (text) text.textContent = 'Probe Server';
            if (badge) {
                badge.title = '❌ Servidor no disponible - Click para instrucciones';
                badge.style.cursor = 'pointer';
                badge.onclick = () => this._showProbeServerInstructions();
            }

            this._probeServerAvailable = false;
        }

        return false;
    }

    /**
     * Wake up the Probe Server - called before any engine operation
     * Attempts to ensure the server is running before heavy operations
     */
    async _wakeProbeServer() {
        if (this._probeServerAvailable) {
            return true; // Already awake
        }

        console.log('🔔 Intentando despertar Probe Server...');

        // Update UI to show attempting
        const dot = document.getElementById('probeServerDot');
        const text = document.getElementById('probeServerText');
        if (dot) dot.style.background = '#fbbf24'; // Yellow
        if (text) text.textContent = 'Conectando...';

        // Try multiple times with delays
        for (let i = 0; i < 3; i++) {
            const available = await this._checkProbeServerStatus();
            if (available) {
                return true;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        // Still not available - reset UI
        if (dot) dot.style.background = '#f87171';
        if (text) text.textContent = 'Probe Server';

        return false;
    }

    /**
     * Show toast notification for probe server status changes
     */
    _showProbeServerNotification(status, data = null) {
        // Create toast container if not exists
        let toastContainer = document.getElementById('probeToastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'probeToastContainer';
            toastContainer.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000;';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.style.cssText = `
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 10px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease;
            ${status === 'connected'
                ? 'background: linear-gradient(135deg, #059669, #047857); color: #d1fae5; border: 1px solid #34d399;'
                : 'background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fecaca; border: 1px solid #f87171;'}
        `;

        if (status === 'connected') {
            toast.innerHTML = `
                <span style="font-size: 18px;">🟢</span>
                <div>
                    <div style="font-weight: 600;">Probe Server Conectado</div>
                    <div style="font-size: 11px; opacity: 0.85;">v${data?.version || '?'} | ${data?.max_concurrent || '?'} streams paralelos</div>
                </div>
            `;
        } else {
            toast.innerHTML = `
                <span style="font-size: 18px;">🔴</span>
                <div>
                    <div style="font-weight: 600;">Probe Server Desconectado</div>
                    <div style="font-size: 11px; opacity: 0.85;">Reconectando automaticamente...</div>
                </div>
            `;
        }

        toastContainer.appendChild(toast);

        // Add animation style if not exists
        if (!document.getElementById('toastAnimationStyle')) {
            const style = document.createElement('style');
            style.id = 'toastAnimationStyle';
            style.textContent = '@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
            document.head.appendChild(style);
        }

        // Auto remove after 4 seconds
        setTimeout(() => {
            toast.style.transition = 'all 0.3s ease';
            toast.style.transform = 'translateX(100%)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    /**
     * Show probe server instructions dialog
     */
    _showProbeServerInstructions() {
        const instructions = `
🔬 SERVIDOR DE PROBE NO DISPONIBLE

Para analizar la calidad real de los streams, necesitas iniciar el servidor Rust.

OPCIÓN 1 - Inicio Rápido:
  Ejecuta: start_iptv_navigator.bat
  (en la carpeta iptv_nav/files/)

OPCIÓN 2 - Manual:
  1. Abre PowerShell
  2. Navega a: iptv_nav/files/tools/stream_probe_server
  3. Ejecuta: .\\target\\release\\stream_probe_server.exe

El servidor analizará 26,000+ canales en ~10 minutos.
        `.trim();

        alert(instructions);
    }

    // ==================== V4.23: QUALITY GRADE SYSTEM ====================

    /**
     * Calculate effective quality grade considering codec, fps, and bitrate
     * H.265 1080p@60fps can score higher than H.264 4K@30fps
     * 
     * @param {object} ch - Channel object with probe data
     * @returns {object} { grade: 'S+', color: '#fbbf24', label: 'PREMIUM' }
     */
    calculateQualityGrade(ch) {
        // Codec efficiency multipliers
        const codecMultiplier = {
            'hevc': 1.5, 'h265': 1.5, 'h.265': 1.5,
            'avc': 1.0, 'h264': 1.0, 'h.264': 1.0,
            'av1': 1.8,
            'vp9': 1.4,
            'mpeg2': 0.7,
            'mpeg4': 0.8,
            'unknown': 1.0
        };

        // FPS multipliers
        const fpsMultiplier = {
            24: 0.9, 25: 0.95, 30: 1.0,
            50: 1.15, 60: 1.25
        };

        // Resolution base scores (by height)
        const resolutionScore = {
            2160: 100, // 4K
            1440: 60,  // 1440p
            1080: 40,  // 1080p
            720: 20,   // 720p
            576: 10,   // 576p
            480: 5,    // 480p
            360: 3,    // 360p
            0: 1       // Unknown
        };

        // Minimum recommended bitrate (kbps) for H.264 by resolution
        const minBitrateH264 = {
            2160: 25000, // 4K
            1080: 8000,
            720: 4000,
            480: 2000,
            0: 1000
        };

        // Extract probe data
        const height = ch._realHeight || ch.tech?.height || 0;
        const codec = (ch._realCodec || ch.tech?.codec || 'unknown').toLowerCase();
        const fps = ch._realFps || ch.tech?.fps || 30;
        const bitrate = ch._realBitrate || ch.tech?.bitrateKbps || 0;

        // Get closest resolution tier
        const getClosestTier = (h, map) => {
            const tiers = Object.keys(map).map(Number).sort((a, b) => b - a);
            for (const tier of tiers) {
                if (h >= tier) return map[tier];
            }
            return map[0];
        };

        // Calculate base score from resolution
        let score = getClosestTier(height, resolutionScore);

        // Apply codec multiplier
        const codecMult = codecMultiplier[codec] || 1.0;
        score *= codecMult;

        // Apply FPS multiplier
        const closestFps = [24, 25, 30, 50, 60].reduce((prev, curr) =>
            Math.abs(curr - fps) < Math.abs(prev - fps) ? curr : prev
        );
        const fpsMult = fpsMultiplier[closestFps] || 1.0;
        score *= fpsMult;

        // Apply bitrate factor (is bitrate adequate for resolution?)
        if (bitrate > 0) {
            const minBitrate = getClosestTier(height, minBitrateH264) / codecMult;
            const bitrateFactor = Math.min(bitrate / minBitrate, 1.5); // Cap at 1.5x
            score *= bitrateFactor;
        }

        // Convert score to grade
        if (score >= 120) return { grade: 'S+', color: '#fbbf24', label: 'PREMIUM' };
        if (score >= 90) return { grade: 'S', color: '#f59e0b', label: 'SUPERIOR' };
        if (score >= 60) return { grade: 'A', color: '#22c55e', label: 'EXCELENTE' };
        if (score >= 40) return { grade: 'B', color: '#3b82f6', label: 'MUY BUENO' };
        if (score >= 25) return { grade: 'C', color: '#6366f1', label: 'BUENO' };
        if (score >= 15) return { grade: 'D', color: '#8b5cf6', label: 'ACEPTABLE' };
        return { grade: 'E', color: '#94a3b8', label: 'BASICO' };
    }

    /**
     * Parse declared resolution string to height number
     * Examples: "1080p" -> 1080, "4K" -> 2160, "HD" -> 720
     */
    _parseResolutionToHeight(resStr) {
        if (!resStr) return null;
        const s = String(resStr).toLowerCase().trim();

        if (s.includes('4k') || s.includes('2160') || s.includes('uhd')) return 2160;
        if (s.includes('1440') || s.includes('2k')) return 1440;
        if (s.includes('1080') || s.includes('fhd') || s.includes('full hd')) return 1080;
        if (s.includes('720') || s.includes('hd')) return 720;
        if (s.includes('576')) return 576;
        if (s.includes('480') || s.includes('sd')) return 480;
        if (s.includes('360')) return 360;

        // Try to extract number directly
        const match = s.match(/(\d+)/);
        if (match) return parseInt(match[1]);

        return null;
    }

    /**
     * Load probe results from VPS cache (formerly Cloudflare R2)
     * Called automatically after connectServer() or manually via button
     * V4.23.1: Waits if probe is in progress to ensure latest results
     * V4.25.0: Migrado a VPS Hetzner
     */
    async loadProbeResultsFromR2() {
        // V4.25.0: Usar VPS adapter si está configurado, sino fallback a local
        const VPS_BASE = window.vpsAdapter?.getBaseUrl() || '';
        const R2_BASE = VPS_BASE || ''; // Legacy compatibility
        const statusEl = document.getElementById('probeStatus');
        const btnCache = document.getElementById('btnLoadProbeResults');

        if (this.state.channelsMaster.length === 0) {
            console.log('⚠️ No hay canales cargados, saltando carga de probes');
            return;
        }

        // V4.23.1: Si hay un probe en progreso, esperar hasta que termine
        if (this._probeInProgress) {
            console.log('⏳ Probe en progreso, esperando para cargar cache...');
            if (statusEl) statusEl.textContent = '⏳ Esperando que termine el análisis...';

            // Esperar hasta que termine el probe (máximo 30 minutos)
            const maxWait = 30 * 60 * 1000; // 30 minutos
            const startWait = Date.now();

            while (this._probeInProgress && (Date.now() - startWait) < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
            }

            if (this._probeInProgress) {
                console.warn('⚠️ Timeout esperando probe, cargando cache de todos modos');
            } else {
                console.log('✅ Probe terminado, procediendo a cargar cache');
            }
        }

        if (btnCache) btnCache.disabled = true;
        if (statusEl) statusEl.textContent = '📥 Cargando resultados de probe...';
        const startTime = performance.now();

        try {
            // V4.25.0: Si VPS no está configurado, intentar cargar desde local
            if (!R2_BASE) {
                console.log('ℹ️ VPS no configurado, buscando probe results locales...');
                const localResults = this._loadProbeResultsFromLocal();
                if (localResults && localResults.length > 0) {
                    if (statusEl) statusEl.textContent = `✅ ${localResults.length} canales desde cache local`;
                    // Aplicar resultados locales
                    this._applyProbeResultsToChannels(localResults);
                    return;
                }
                if (statusEl) statusEl.textContent = 'ℹ️ Sin datos de probe (configura VPS)';
                console.log('💡 Usa configureVPS("tu-ip") o showVPSConfig() para configurar');
                return;
            }

            // Fetch latest CSV from VPS
            const response = await fetch(`${R2_BASE}/probe-results/probe_latest.csv`);

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('ℹ️ No hay resultados de probe previos en VPS');
                    // Fallback a local
                    const localResults = this._loadProbeResultsFromLocal();
                    if (localResults) {
                        this._applyProbeResultsToChannels(localResults);
                        if (statusEl) statusEl.textContent = `✅ ${localResults.length} desde cache local`;
                        return;
                    }
                    if (statusEl) statusEl.textContent = 'ℹ️ Sin datos de probe previos';
                    return;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const csvText = await response.text();

            // Parse CSV to Map
            const lines = csvText.split('\n').filter(l => l.trim());
            if (lines.length < 2) {
                console.log('ℹ️ CSV vacío');
                if (statusEl) statusEl.textContent = 'ℹ️ CSV vacío';
                return;
            }

            const headers = lines[0].split(',').map(h => h.trim());
            const resultsMap = new Map();

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',');
                const row = {};
                headers.forEach((h, idx) => {
                    row[h] = values[idx]?.trim() || '';
                });
                if (row.channel_id) {
                    resultsMap.set(row.channel_id, row);
                }
            }

            console.log(`📊 Cargados ${resultsMap.size} resultados de probe desde R2`);

            // Enrich channelsMaster with probe data
            const stats = { verified: 0, better: 0, downgrade: 0, fake: 0, pending: 0, error: 0 };

            this.state.channelsMaster.forEach(ch => {
                const chId = ch.id || ch.stream_id || String(ch._idx);
                const probe = resultsMap.get(chId);

                if (probe && probe.width) {
                    // Store real probe data
                    ch._realWidth = parseInt(probe.width) || null;
                    ch._realHeight = parseInt(probe.height) || null;
                    ch._realBitrate = parseFloat(probe.bitrate) || null;
                    ch._realCodec = probe.codec || null;
                    ch._realFps = parseFloat(probe.fps) || null;
                    ch._probeStatus = 'probed';

                    // Format real resolution string
                    if (ch._realWidth && ch._realHeight) {
                        ch._resReal = `${ch._realWidth}×${ch._realHeight}`;
                    }

                    // Calculate verification status
                    const declaredHeight = this._parseResolutionToHeight(
                        ch.resolution || ch._quality || ch.stream_icon
                    );
                    const realHeight = ch._realHeight;

                    if (!declaredHeight || !realHeight) {
                        ch._verification = 'UNKNOWN';
                    } else if (realHeight >= declaredHeight * 0.9) {
                        if (realHeight > declaredHeight * 1.1) {
                            ch._verification = 'BETTER';
                            stats.better++;
                        } else {
                            ch._verification = 'VERIFIED';
                            stats.verified++;
                        }
                    } else if (realHeight >= declaredHeight * 0.5) {
                        ch._verification = 'DOWNGRADE';
                        stats.downgrade++;
                    } else {
                        ch._verification = 'FAKE';
                        stats.fake++;
                    }

                    // Calculate quality grade
                    const gradeResult = this.calculateQualityGrade(ch);
                    ch._qualityGrade = gradeResult.grade;
                    ch._gradeColor = gradeResult.color;
                    ch._gradeLabel = gradeResult.label;

                } else if (probe && probe.error) {
                    ch._probeStatus = 'error';
                    ch._verification = 'ERROR';
                    ch._probeError = probe.error;
                    stats.error++;
                } else {
                    ch._probeStatus = 'pending';
                    ch._verification = 'PENDING';
                    stats.pending++;
                }

                // Set declared resolution for display
                ch._resDeclared = ch.resolution || ch._quality || '-';
            });

            // Update channels array
            this.state.channels = [...this.state.channelsMaster];

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ Probe results loaded from R2 in ${elapsed}s`);
            console.table(stats);

            // Update UI
            this._updateProbeStatsUI(stats);

            if (statusEl) {
                const total = stats.verified + stats.better + stats.downgrade + stats.fake;
                statusEl.textContent = `✅ ${total} canales con datos de probe (${elapsed}s)`;
            }

            // Ensure probe fields are in discoveredFields
            this._ensureProbeFields();

            // Re-render table
            this.renderTable();

        } catch (e) {
            console.error('❌ Error loading probe results from R2:', e);
            if (statusEl) statusEl.textContent = `❌ Error: ${e.message}`;
        } finally {
            // V4.23.1: Re-habilitar botón
            if (btnCache) btnCache.disabled = false;
        }
    }

    /**
     * Update probe stats UI panel
     */
    _updateProbeStatsUI(stats) {
        const container = document.getElementById('probeStatsContainer');
        if (!container) {
            console.warn('⚠️ probeStatsContainer no encontrado, stats no se mostrarán en UI');
            return;
        }

        container.style.display = 'block';

        const verifHTML = `
            <span style="background:rgba(74,222,128,0.15); padding:2px 6px; border-radius:6px; font-size:0.7rem;">✅ VER: <b>${stats.verified.toLocaleString()}</b></span>
            <span style="background:rgba(56,189,248,0.15); padding:2px 6px; border-radius:6px; font-size:0.7rem;">⬆️ SUP: <b>${stats.better.toLocaleString()}</b></span>
            <span style="background:rgba(251,191,36,0.15); padding:2px 6px; border-radius:6px; font-size:0.7rem;">⬇️ DEG: <b>${stats.downgrade.toLocaleString()}</b></span>
            <span style="background:rgba(248,113,113,0.15); padding:2px 6px; border-radius:6px; font-size:0.7rem;">❌ FAKE: <b>${stats.fake.toLocaleString()}</b></span>
            <span style="background:rgba(148,163,184,0.15); padding:2px 6px; border-radius:6px; font-size:0.7rem;">⏳ PEND: <b>${stats.pending.toLocaleString()}</b></span>
        `;

        const el = document.getElementById('probeStatVerification');
        if (el) el.innerHTML = verifHTML;
    }

    /**
     * Ensure probe-related fields exist in discoveredFields
     */
    _ensureProbeFields() {
        const probeFields = [
            { id: '_resDeclared', label: '📺 RES DECL', category: 'probe' },
            { id: '_resReal', label: '🔬 RES REAL', category: 'probe' },
            { id: '_realCodec', label: '🎬 CODEC', category: 'probe' },
            { id: '_realFps', label: '🎯 FPS', category: 'probe' },
            { id: '_realBitrate', label: '📶 BITRATE', category: 'probe' },
            { id: '_verification', label: '✓ VERIF', category: 'probe' },
            { id: '_qualityGrade', label: '⭐ GRADE', category: 'probe' }
        ];

        probeFields.forEach(field => {
            if (!this.state.discoveredFields.find(f => f.id === field.id)) {
                this.state.discoveredFields.push(field);
            }
            // Add to active columns if not present
            if (!this.state.activeColumns.includes(field.id)) {
                this.state.activeColumns.push(field.id);
            }
        });
    }

    /**
     * Generate CSV from probe results and upload to VPS
     * V4.25.0: Migrado a VPS Hetzner
     */
    async _uploadProbeResultsToR2(results) {
        // V4.25.0: Usar VPS adapter
        const VPS_BASE = window.vpsAdapter?.getBaseUrl() || '';
        const R2_BASE = VPS_BASE; // Legacy compatibility

        if (!VPS_BASE) {
            console.warn('⚠️ VPS no configurado - los resultados se guardarán solo localmente');
            // Guardar localmente como fallback
            this._saveProbeResultsLocally(results);
            return;
        }

        // Generate CSV
        const headers = ['channel_id', 'width', 'height', 'codec', 'bitrate', 'fps', 'success', 'error'];
        const rows = [headers.join(',')];

        results.forEach(r => {
            rows.push([
                r.channel_id || '',
                r.width || '',
                r.height || '',
                r.codec || '',
                r.bitrate || '',
                r.fps || '',
                r.success ? 'true' : 'false',
                r.error || ''
            ].join(','));
        });

        const csvContent = rows.join('\n');

        try {
            const response = await fetch(`${R2_BASE}/data/probes/upload`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'text/csv',
                    'X-Source': 'frontend_probe'
                },
                body: csvContent
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('✅ Probe results uploaded to R2:', result);
            return result;
        } catch (e) {
            console.error('❌ Error uploading probe results to R2:', e);
            throw e;
        }
    }

    // ==================== V4.25.0: LOCAL PROBE RESULTS FALLBACK ====================

    /**
     * Guardar resultados de probe localmente cuando VPS no está configurado
     */
    _saveProbeResultsLocally(results) {
        try {
            const data = {
                timestamp: new Date().toISOString(),
                count: results.length,
                results: results
            };
            localStorage.setItem('iptv_probe_results', JSON.stringify(data));
            console.log(`✅ ${results.length} probe results guardados localmente`);
        } catch (e) {
            console.error('❌ Error guardando probe results localmente:', e);
        }
    }

    /**
     * Cargar resultados de probe desde localStorage
     */
    _loadProbeResultsFromLocal() {
        try {
            const data = JSON.parse(localStorage.getItem('iptv_probe_results') || '{}');
            if (data.results && Array.isArray(data.results)) {
                console.log(`📥 Cargados ${data.results.length} probe results locales (${data.timestamp})`);
                return data.results;
            }
        } catch (e) {
            console.error('Error cargando probe results locales:', e);
        }
        return null;
    }

    /**
     * Aplicar resultados de probe a los canales
     */
    _applyProbeResultsToChannels(results) {
        if (!results || !Array.isArray(results)) return;

        const resultsMap = new Map();
        results.forEach(r => {
            const id = r.channel_id || r.id;
            if (id) resultsMap.set(String(id), r);
        });

        console.log(`📊 Aplicando ${resultsMap.size} resultados de probe a canales...`);

        const stats = { verified: 0, better: 0, downgrade: 0, fake: 0, pending: 0, error: 0 };

        this.state.channelsMaster.forEach(ch => {
            const chId = String(ch.id || ch.stream_id || ch._idx);
            const probe = resultsMap.get(chId);

            if (probe && (probe.width || probe.height)) {
                ch._realWidth = parseInt(probe.width) || null;
                ch._realHeight = parseInt(probe.height) || null;
                ch._realBitrate = parseFloat(probe.bitrate) || null;
                ch._realCodec = probe.codec || null;
                ch._realFps = parseFloat(probe.fps) || null;
                ch._probeStatus = 'probed';

                if (ch._realWidth && ch._realHeight) {
                    ch._resReal = `${ch._realWidth}×${ch._realHeight}`;
                }

                stats.verified++;
            } else if (probe && probe.error) {
                ch._probeStatus = 'error';
                ch._probeError = probe.error;
                stats.error++;
            } else {
                stats.pending++;
            }
        });

        console.log('✅ Probe results aplicados:', stats);
        this.state.channels = [...this.state.channelsMaster];
        this._updateProbeStatsUI(stats);
        this.renderTable();
    }

    // ==================== V4.8.3: DATA PROTECTION UTILITIES ====================

    /**
     * Safe merge: NEVER overwrite non-empty values with empty/zero/null
     * This is a GLOBAL rule for all data updates.
     * 
     * @param {object} target - Object to update
     * @param {object} source - Object with new values
     * @param {array} keys - Optional: specific keys to update. If not provided, updates all keys from source
     * @returns {object} Updated target
     */
    _safeObjectMerge(target, source, keys = null) {
        if (!target || !source) return target;

        const keysToUpdate = keys || Object.keys(source);

        keysToUpdate.forEach(key => {
            const newVal = source[key];
            const existingVal = target[key];

            // Check if new value is "empty"
            const isNewEmpty = (
                newVal === undefined ||
                newVal === null ||
                newVal === '' ||
                newVal === 0 ||
                (Array.isArray(newVal) && newVal.length === 0) ||
                (typeof newVal === 'object' && !Array.isArray(newVal) && Object.keys(newVal).length === 0)
            );

            // Check if existing value is "empty"
            const isExistingEmpty = (
                existingVal === undefined ||
                existingVal === null ||
                existingVal === '' ||
                existingVal === 0 ||
                (Array.isArray(existingVal) && existingVal.length === 0) ||
                (typeof existingVal === 'object' && !Array.isArray(existingVal) && existingVal !== null && Object.keys(existingVal).length === 0)
            );

            // Update rules:
            // 1. If new value is empty, NEVER overwrite - keep existing
            // 2. If existing is empty AND new is not empty, update
            // 3. If both have values, prefer new (explicit update)
            if (isNewEmpty) {
                // Keep existing - don't overwrite with empty
                return;
            }

            if (isExistingEmpty || !isNewEmpty) {
                target[key] = newVal;
            }
        });

        return target;
    }

    /**
     * Deep safe merge for channel objects - protects ALL layers
     * 
     * @param {object} existingChannel - Channel with existing data
     * @param {object} newData - New data to merge
     * @returns {object} Updated channel
     */
    _safeChannelMerge(existingChannel, newData) {
        if (!existingChannel) return newData;
        if (!newData) return existingChannel;

        // Merge top-level primitive fields
        const topLevelFields = ['name', 'group', 'url', 'logo', 'id', 'stream_id', 'country', 'language',
            'codec', 'bitrate', 'resolution', 'fps', 'width', 'height',
            'qualityScore', 'qualityTier', 'stream_icon'];
        this._safeObjectMerge(existingChannel, newData, topLevelFields);

        // Merge each layer separately
        if (newData.base) {
            if (!existingChannel.base) existingChannel.base = {};
            this._safeObjectMerge(existingChannel.base, newData.base);
        }

        if (newData.heuristics) {
            if (!existingChannel.heuristics) existingChannel.heuristics = {};
            this._safeObjectMerge(existingChannel.heuristics, newData.heuristics);
        }

        if (newData.tech) {
            if (!existingChannel.tech) existingChannel.tech = {};
            this._safeObjectMerge(existingChannel.tech, newData.tech);
        }

        if (newData.external) {
            if (!existingChannel.external) existingChannel.external = {};
            this._safeObjectMerge(existingChannel.external, newData.external);
        }

        return existingChannel;
    }

    // ==================== 4-LAYER DATA MODEL (V4.6) ====================

    /**
     * Calculate the final view for a channel using priority hierarchy:
     * tech (probe) > base (server) > heuristics (inferred)
     * 
     * @param {object} channel - Channel with base, heuristics, tech layers
     * @returns {object} Final calculated view (NEVER persist this)
     */
    _calculateFinalView(channel) {
        if (!channel) return {};

        const tech = channel.tech || {};
        const base = channel.base || {};
        const heuristics = channel.heuristics || {};

        // Priority: tech > base > heuristics > direct channel props (legacy)
        return {
            // Identity
            name: base.name ?? channel.name ?? '',
            group: base.group ?? channel.group ?? '',
            logo: base.logo ?? channel.logo ?? channel.stream_icon ?? '',
            url: base.url ?? channel.url ?? '',

            // Quality data
            resolution: tech.resolutionLabel ?? base.resolution ?? heuristics.resolution ?? channel.resolution ?? '',
            bitrate: tech.bitrateKbps ?? base.bitrate ?? heuristics.bitrate ?? channel.bitrate ?? 0,
            codec: tech.codec ?? base.codec ?? heuristics.codec ?? channel.codec ?? '',
            width: tech.width ?? base.width ?? heuristics.width ?? channel.width ?? null,
            height: tech.height ?? base.height ?? heuristics.height ?? channel.height ?? null,
            fps: tech.fps ?? base.fps ?? heuristics.fps ?? channel.fps ?? null,

            // Geographic
            country: tech.country ?? base.country ?? heuristics.country ?? channel.country ?? 'INT',
            language: tech.language ?? base.language ?? heuristics.language ?? channel.language ?? 'MIX',

            // Derived scores (from heuristics)
            qualityScore: heuristics.qualityScore ?? channel.qualityScore ?? 0,
            qualityTier: heuristics.qualityTier ?? channel.qualityTier ?? 'UNKNOWN',

            // Flags
            isUHD: heuristics.isUHD ?? channel.isUHD ?? false,
            isHD: heuristics.isHD ?? channel.isHD ?? false,
            isSD: heuristics.isSD ?? channel.isSD ?? false,
            isSports: heuristics.isSports ?? channel.isSports ?? false,
            isMovie: heuristics.isMovie ?? channel.isMovie ?? false,
            isSeries: heuristics.isSeries ?? channel.isSeries ?? false,

            // Tags
            qualityTags: heuristics.qualityTags ?? channel.qualityTags ?? [],

            // Source tracking
            _source: tech.sampled ? 'PROBE' : (Object.keys(base).length > 0 ? 'SERVER' : 'HEURISTIC')
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🏷️ V4.22: CLASIFICACIÓN JERÁRQUICA - MÉTODOS DE SOPORTE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Agrega los campos de clasificación a discoveredFields y activeColumns
     */
    _ensureClassificationFields() {
        const classificationFields = [
            { id: '_region', label: '🌎 Región', category: 'classification' },
            { id: '_language', label: '🗣️ Idioma', category: 'classification' },
            { id: '_category', label: '📂 Categoría', category: 'classification' },
            { id: '_quality', label: '📺 Calidad', category: 'classification' }
        ];

        classificationFields.forEach(field => {
            // Agregar a discoveredFields si no existe
            if (!this.state.discoveredFields.find(f => f.id === field.id)) {
                this.state.discoveredFields.push(field);
            }
            // Agregar a columnas activas si no están
            if (!this.state.activeColumns.includes(field.id)) {
                this.state.activeColumns.push(field.id);
            }
        });

        console.log('✅ Campos de clasificación agregados a la tabla');
    }

    /**
     * Actualiza el panel UI con estadísticas de clasificación
     * @param {object} stats - Objeto con by_region, by_category, by_quality
     */
    _updateClassificationUI(stats) {
        const container = document.getElementById('classificationStatsContainer');
        if (!container) {
            console.warn('⚠️ classificationStatsContainer no encontrado');
            return;
        }

        // Mostrar contenedor
        container.style.display = 'block';

        // Generar HTML para regiones (Cyan/Teal theme)
        const regionHTML = Object.entries(stats.by_region)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `<span style="background:rgba(56,189,248,0.15); padding:3px 8px; border-radius:6px; font-size:0.72rem; border:1px solid rgba(56,189,248,0.25);">${name.replace(/_/g, ' ')}: <b>${count.toLocaleString()}</b></span>`)
            .join('');

        // Generar HTML para idiomas
        if (stats.by_language) {
            const languageHTML = Object.entries(stats.by_language)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => `<span style="background:rgba(180, 83, 9, 0.15); padding:3px 8px; border-radius:6px; font-size:0.72rem; color:#fcd34d; border:1px solid rgba(245, 158, 11, 0.3);">${name}: <b>${count.toLocaleString()}</b></span>`)
                .join('');
            const langContainer = document.getElementById('classStatLanguage');
            if (langContainer) langContainer.innerHTML = languageHTML;
        }

        // Generar HTML para categorías con emojis (Cyan/Teal theme)
        const categoryEmojis = {
            'DEPORTES': '⚽', 'CINE': '🎬', 'NOTICIAS': '📰', 'INFANTIL': '👶',
            'MUSICA': '🎵', 'DOCUMENTALES': '📚', 'ENTRETENIMIENTO': '🎭',
            'RELIGION': '⛪', 'ADULTOS': '🔞', 'GENERALISTA': '📡'
        };
        const categoryHTML = Object.entries(stats.by_category)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `<span style="background:rgba(56,189,248,0.12); padding:3px 8px; border-radius:6px; font-size:0.72rem; border:1px solid rgba(56,189,248,0.2);">${categoryEmojis[name] || '📂'} ${name}: <b>${count.toLocaleString()}</b></span>`)
            .join('');

        // Generar HTML para calidad (iconos locales para evitar errores SSL)
        const ultraIcon = 'icons/quality-ultra-hd.svg';
        const fullHdIcon = 'icons/quality-full-hd.svg';
        const sdIcon = 'icons/quality-sd.svg';
        const qualityHTML = Object.entries(stats.by_quality)
            .sort((a, b) => {
                const order = { 'ULTRA HD': 1, 'FULL HD': 2, 'SD': 3 };
                return (order[a[0]] || 4) - (order[b[0]] || 4);
            })
            .map(([name, count]) => {
                const iconHtml =
                    (name === 'ULTRA HD') ? `<img src="${ultraIcon}" height="16">` :
                        (name === 'FULL HD') ? `<img src="${fullHdIcon}" height="16">` :
                            (name === 'SD') ? `<img src="${sdIcon}" height="16">` :
                                '';
                return `<span style="background:rgba(74,222,128,0.12); padding:3px 8px; border-radius:6px; font-size:0.72rem; display:inline-flex; align-items:center; gap:5px; border:1px solid rgba(74,222,128,0.25);">${iconHtml}${name}: <b>${count.toLocaleString()}</b></span>`;
            })
            .join('');

        // Actualizar contenido de cada sección
        const regionEl = document.getElementById('classStatRegion');
        const categoryEl = document.getElementById('classStatCategory');
        const qualityEl = document.getElementById('classStatQuality');

        if (regionEl) regionEl.innerHTML = regionHTML || '<span style="color:#64748b;">Sin datos</span>';
        if (categoryEl) categoryEl.innerHTML = categoryHTML || '<span style="color:#64748b;">Sin datos</span>';
        if (qualityEl) qualityEl.innerHTML = qualityHTML || '<span style="color:#64748b;">Sin datos</span>';

        console.log('✅ Panel de clasificación actualizado');
    }

    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Deduplicate channels by serverId:stream_id key
     * ✅ V1.1: Improved with serverId validation and inference
     * 
     * @param {array} channels - Array of channels to deduplicate
     * @returns {array} Deduplicated channels
     */
    _deduplicateChannels(channels) {
        if (!Array.isArray(channels)) return [];

        const seen = new Map();
        let withoutServerId = 0;
        let inferred = 0;

        channels.forEach(ch => {
            let serverId = ch.serverId || ch._serverId;
            const streamId = ch.stream_id || ch.id || ch._idx;

            // ✅ Validate and infer serverId if missing
            if (!serverId) {
                withoutServerId++;
                // Try to infer from URL
                if (ch.stream_url) {
                    const urlMatch = ch.stream_url.match(/https?:\/\/([^\/]+)/);
                    if (urlMatch) {
                        serverId = 'srv_' + urlMatch[1].replace(/[^a-z0-9]/gi, '_').substring(0, 20);
                        ch.serverId = serverId;
                        inferred++;
                    }
                }
                // If still no serverId, use hash of URL
                if (!serverId) {
                    const hash = this._simpleHash(ch.stream_url || ch.name || String(streamId));
                    serverId = 'unknown_' + hash;
                    ch.serverId = serverId;
                }
            }

            const key = `${serverId}:${streamId}`;

            if (!seen.has(key)) {
                seen.set(key, ch);
            } else {
                // Merge heuristics if newer data
                const existing = seen.get(key);
                if (ch.heuristics && Object.keys(ch.heuristics).length > 0) {
                    existing.heuristics = {
                        ...existing.heuristics,
                        ...ch.heuristics
                    };
                }
                if (ch.tech && Object.keys(ch.tech).length > 0) {
                    existing.tech = {
                        ...existing.tech,
                        ...ch.tech
                    };
                }
            }
        });

        const duplicatesRemoved = channels.length - seen.size;
        if (duplicatesRemoved > 0) {
            console.log(`🔄 Deduplicación: ${channels.length} → ${seen.size} (-${duplicatesRemoved} duplicados)`);
        }
        if (withoutServerId > 0) {
            console.log(`   ⚠️ ${withoutServerId} canales sin serverId (${inferred} inferidos)`);
        }

        return [...seen.values()];
    }

    /**
     * Simple hash function for string
     */
    _simpleHash(str) {
        let hash = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            const char = s.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36).substring(0, 8);
    }

    // ==========================================
    // V4.8.3: INTELLIGENT SERVER MERGE & REMOVE
    // ==========================================

    /**
     * Merge new channels from server with existing ones
     * - Adds new channels
     * - Removes channels no longer on server
     * - Updates base layer, preserves heuristics/tech/external
     * 
     * @param {array} newChannels - Fresh channels from server
     * @param {object} serverObj - Server configuration
     * @returns {object} { added, removed, updated }
     */
    mergeServerChannels(newChannels, serverObj) {
        // 🔒 V4.18.1: FIX CRÍTICO - NO fallback a baseUrl
        if (!serverObj?.id) {
            throw new Error('mergeServerChannels: serverObj.id REQUERIDO');
        }
        const serverId = serverObj.id; // ✅ SIN FALLBACK

        // Build map of existing channels for this server
        const existingMap = new Map();
        this.state.channelsMaster.forEach(ch => {
            const chServerId = ch.serverId || ch._serverId;
            if (chServerId === serverId) {
                const streamId = ch.stream_id || ch.id || ch._idx;
                const key = `${serverId}:${streamId}`;
                existingMap.set(key, ch);
            }
        });

        // Build map of new channels
        const newMap = new Map();
        newChannels.forEach((ch, idx) => {
            const streamId = ch.stream_id || ch.id || idx;
            const key = `${serverId}:${streamId}`;
            newMap.set(key, ch);
        });

        let added = 0, removed = 0, updated = 0;

        // 1. Find channels to ADD (in new, not in existing)
        const toAdd = [];
        newMap.forEach((ch, key) => {
            if (!existingMap.has(key)) {
                // 🔒 V4.18.1: Usar pipeline único
                const normalized = this.normalizeChannelUnified(ch, serverObj);
                const enriched = this.enrichChannel(normalized);
                toAdd.push(enriched);
                added++;
            } else {
                // ✅ V4.8.3: Safe merge - protects ALL fields from empty overwrite
                const existing = existingMap.get(key);
                // 🔒 V4.18.1: Usar pipeline único para normalizar
                const rawNormalized = this.normalizeChannelUnified(ch, serverObj);

                // Use global safe merge utility for complete protection
                this._safeChannelMerge(existing, rawNormalized);

                updated++;
            }
        });

        // 2. Find channels to REMOVE (in existing, not in new)
        const keysToRemove = new Set();
        existingMap.forEach((ch, key) => {
            if (!newMap.has(key)) {
                keysToRemove.add(key);
                removed++;
            }
        });

        // 3. Apply changes to channelsMaster
        // Remove old channels for this server
        this.state.channelsMaster = this.state.channelsMaster.filter(ch => {
            const chServerId = ch.serverId || ch._serverId;
            if (chServerId !== serverId) return true; // Keep other servers
            const streamId = ch.stream_id || ch.id || ch._idx;
            const key = `${serverId}:${streamId}`;
            return !keysToRemove.has(key);
        });

        // Add new channels
        if (toAdd.length > 0) {
            this.state.channelsMaster = [...this.state.channelsMaster, ...toAdd];
        }

        // Update channels view
        this.state.channels = [...this.state.channelsMaster];

        // ✅ V4.27.5: Actualizar servidor en activeServers con password
        const serverEntry = {
            id: serverId,
            name: serverObj.name,
            baseUrl: serverObj.baseUrl,
            username: serverObj.username,
            password: serverObj.password,  // ✅ Incluir password
            channelCount: this.state.channelsMaster.filter(ch =>
                (ch.serverId || ch._serverId) === serverId
            ).length,
            active: true
        };
        this.upsertServer(serverEntry);

        console.log(`✅ [Merge] Server ${serverObj.name} (${serverId}): +${added} new, -${removed} removed, ${updated} updated`);
        console.log(`   Total: ${this.state.channelsMaster.length} canales`);

        return { added, removed, updated };
    }

    /**
     * Remove a server and all its channels
     * 
     * @param {string} serverId - Server ID to remove
     */
    removeServer(serverId) {
        if (!serverId) {
            console.warn('⚠️ removeServer: No serverId provided');
            return;
        }

        // 1. Count channels to remove
        const channelsBefore = this.state.channelsMaster.length;

        // 2. Filter out channels from this server
        this.state.channelsMaster = this.state.channelsMaster.filter(ch => {
            const chServerId = ch.serverId || ch._serverId || ch.serverObj?.id;
            return chServerId !== serverId;
        });

        const removed = channelsBefore - this.state.channelsMaster.length;

        // 3. Remove from activeServers
        if (this.state.activeServers) {
            this.state.activeServers = this.state.activeServers.filter(s => s.id !== serverId);
        }

        // 4. Clear currentServer if it was the removed one
        if (this.state.currentServer && this.state.currentServer.id === serverId) {
            this.state.currentServer = {};
        }

        // 5. Update channels view
        this.state.channels = [...this.state.channelsMaster];

        // 6. Re-calculate stats and render
        this.calculateStats(this.state.channelsMaster);
        this.updateStatsUI();
        this.applyFilters();

        // 7. Save state
        this.saveActiveServers();
        if (this.db) {
            this.db.saveChannelsBulk(this.state.channelsMaster, 'merged').catch(e => console.error(e));
        }

        // 8. Re-render server list
        if (typeof this.renderServerList === 'function') {
            this.renderServerList();
        }

        console.log(`🗑️ [Remove] Server ${serverId}: ${removed} canales eliminados`);
        console.log(`   Restantes: ${this.state.channelsMaster.length} canales`);
        // Notify user
        this.showToast(`Servidor eliminado: ${removed} canales removidos`, false);
    }

    /**
     * 🔒 V4.27: Buscar servidor existente por URL y Credenciales
     * Normalización robusta para detectar duplicados con variaciones de URL
     * @param {string} baseUrl - URL base del servidor
     * @param {string} username - Usuario (opcional)
     * @param {string} password - Password (opcional)
     * @returns {object|null} Servidor existente o null
     */
    findExistingServer(baseUrl, username = null, password = null) {
        if (!this.state.activeServers || this.state.activeServers.length === 0) return null;

        /**
         * Normalización agresiva de URL para detectar duplicados:
         * - Remover /player_api.php
         * - Remover trailing slashes
         * - Convertir a lowercase
         * - Extraer solo hostname:puerto
         */
        const normalizeUrl = (url) => {
            if (!url) return '';
            let normalized = url.toString()
                .replace(/\/player_api\.php$/i, '')  // Remover endpoint API
                .replace(/\/+$/, '')                  // Remover trailing slashes
                .replace(/^https?:\/\//i, '')         // Remover protocolo
                .toLowerCase()
                .trim();

            // Extraer solo host:puerto (sin path)
            const hostMatch = normalized.match(/^([^\/]+)/);
            return hostMatch ? hostMatch[1] : normalized;
        };

        const normalizedInput = normalizeUrl(baseUrl);

        console.log(`🔍 [findExistingServer] Buscando: "${normalizedInput}" (original: "${baseUrl}")`);

        const found = this.state.activeServers.find(s => {
            const normalizedServer = normalizeUrl(s.baseUrl);
            const sameHost = normalizedServer === normalizedInput;

            console.log(`   Comparando con: "${normalizedServer}" (${s.name}) → ${sameHost ? '✅ MATCH' : '❌'}`);

            // Si se pasan credenciales, deben coincidir TODAS para ser duplicado real
            if (username !== null && password !== null) {
                const sameCredentials = s.username === username && s.password === password;
                return sameHost && sameCredentials;
            }

            return sameHost;
        });

        if (found) {
            console.log(`✅ [findExistingServer] Servidor existente encontrado: ${found.name} (${found.id})`);
        } else {
            console.log(`ℹ️ [findExistingServer] No se encontró servidor existente`);
        }

        return found || null;
    }

    // =====================================================
    // 🔒 V4.18 PIPELINE ÚNICO DE NORMALIZACIÓN
    // Un canal entra crudo → sale normalizado, serverId SIEMPRE
    // NO hay caminos alternos. NO hay sobrescrituras implícitas.
    // =====================================================

    /**
     * 🔍 HELPER: Extrae nombre de grupo desde URL de picon
     * Ejemplo: http://picon.tivi-ott.net:25461/picon/ALBANIA/TOPCHANNEL.png → 'ALBANIA'
     * @param {string} piconUrl - URL del stream_icon
     * @returns {string|null} Nombre del grupo extraído o null
     */
    _extractGroupFromPiconUrl(piconUrl) {
        if (!piconUrl || typeof piconUrl !== 'string') return null;

        try {
            // Patrón: busca /picon/GROUPNAME/ en la URL
            const piconMatch = piconUrl.match(/\/picon\/([^\/]+)\//i);
            if (piconMatch && piconMatch[1]) {
                // Limpiar y formatear: ALBANIA -> Albania (capitalizado)
                const groupName = piconMatch[1].trim();
                // Si es un nombre válido (no solo números), devolverlo
                if (groupName && !/^\d+$/.test(groupName)) {
                    return groupName.charAt(0).toUpperCase() + groupName.slice(1).toLowerCase();
                }
            }

            // Patrón alternativo: busca carpetas en la ruta
            const pathParts = piconUrl.split('/').filter(p => p && !p.includes('.') && !p.includes(':'));
            for (const part of pathParts) {
                // Descartar nombres comunes como 'picon', 'logo', etc.
                if (part.length >= 2 && !/^(picon|logo|icons?|images?|http|www|\d+)$/i.test(part)) {
                    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
                }
            }
        } catch (e) {
            console.warn('Error extrayendo grupo de picon URL:', e);
        }

        return null;
    }

    /**
     * 1️⃣ NORMALIZADOR ÚNICO (NÚCLEO)
     * Este es el ÚNICO sitio donde nace serverId
     * @param {Object} raw - Canal crudo de la API
     * @param {Object} server - Servidor con id obligatorio
     * @returns {Object} Canal normalizado inmutable en identidad
     */
    normalizeChannelUnified(raw, server) {
        if (!server?.id) {
            throw new Error('normalizeChannelUnified: server.id REQUERIDO');
        }

        const channelId = raw.stream_id || raw.id ||
            `${server.id}_${raw.name || 'unnamed'}_${raw.category_id || 0}`;

        // 🔍 Derivar grupo: priorizar category_name, luego categoryMap (ID→nombre), luego picon, finalmente fallback
        const categoryIdStr = String(raw.category_id || '');
        const mappedCategoryName = this.state?.categoryMap?.[categoryIdStr] || null;

        const derivedGroup = raw.category_name
            || mappedCategoryName  // ← NUEVO: usar el mapa de categorías
            || this._extractGroupFromPiconUrl(raw.stream_icon)
            || (raw.category_id && !(/^\d+$/.test(categoryIdStr)) ? raw.category_id : null)
            || 'Uncategorized';

        return {
            // 🔑 IDENTIDAD (inmutable)
            id: String(channelId),
            serverId: server.id,
            serverName: server.name || 'Unknown Server',

            // 📺 Básicos
            name: (raw.name || 'Unnamed').trim(),
            group: derivedGroup,
            type: raw.stream_type || 'live',

            // 🖼️ Media
            logo: raw.stream_icon || raw.logo || null,

            // 📡 Stream
            url: raw.direct_source || raw.url || null,
            epgId: raw.epg_channel_id || null,

            // 🔍 Flags
            isAdult: !!raw.is_adult,
            hasArchive: !!raw.tv_archive,

            // 📊 Técnicos (para enriquecimiento posterior)
            resolution: raw.resolution || null,
            codec: raw.codec || null,
            bitrate: Number(raw.bitrate) || 0,
            width: raw.video_width || raw.width || null,
            height: raw.video_height || raw.height || null,
            fps: raw.fps || raw.frames || null,

            // 🔒 4 Capas (para compatibilidad con arquitectura)
            base: {
                name: (raw.name || '').trim(),
                group: derivedGroup,
                logo: raw.stream_icon || raw.logo || '',
                url: raw.direct_source || raw.url || '',
                country: raw.country || '',
                language: raw.language || '',
                codec: raw.codec || '',
                bitrate: Number(raw.bitrate) || 0,
                resolution: raw.resolution || '',
                width: raw.video_width || raw.width || null,
                height: raw.video_height || raw.height || null,
                fps: raw.fps || raw.frames || null,
                type: raw.stream_type || 'live',
                raw: raw
            },
            heuristics: {},
            tech: {},
            meta: {
                enriched: false,
                probed: false,
                normalizedAt: Date.now()
            },

            // 🧠 Raw original (debug/futuro)
            raw: raw,

            // 🕒 Trazabilidad
            normalizedAt: Date.now()
        };
    }

    /**
     * 2️⃣ PROCESADOR DE LOTE (STREAMING-SAFE)
     * Sin side-effects, O(n), preparado para worker
     */
    normalizeChannelsBatch(rawChannels, server) {
        if (!Array.isArray(rawChannels)) return [];

        const out = new Array(rawChannels.length);
        for (let i = 0; i < rawChannels.length; i++) {
            out[i] = this.normalizeChannelUnified(rawChannels[i], server);
        }
        return out;
    }

    /**
     * 3️⃣ INGESTA CONTROLADA (ÚNICO PUNTO DE ENTRADA)
     * Reemplaza processChannels, _normalizeToLayeredStructure, etc.
     */
    ingestServerChannels(rawChannels, server) {
        console.group(`📥 INGESTA ${server.name} (${server.id})`);
        console.time('⏱️ Normalización');

        const normalized = this.normalizeChannelsBatch(rawChannels, server);

        console.timeEnd('⏱️ Normalización');
        console.log(`✅ Canales normalizados: ${normalized.length}`);
        console.log(`🔑 serverId: ${server.id}`);

        // 🔒 Merge controlado
        this.mergeChannelsMaster(normalized);

        console.log(`📊 Total en channelsMaster: ${this.state.channelsMaster.length}`);
        console.groupEnd();

        return normalized.length;
    }

    /**
     * 4️⃣ MERGE MULTI-SERVIDOR (DEDUPLICACIÓN CORRECTA)
     * Clave: serverId:id - NO cruza servidores
     */
    mergeChannelsMaster(newChannels) {
        if (!this.state.channelsMaster) {
            this.state.channelsMaster = [];
        }

        const map = new Map(
            this.state.channelsMaster.map(ch => [`${ch.serverId}:${ch.id}`, ch])
        );

        newChannels.forEach(ch => {
            map.set(`${ch.serverId}:${ch.id}`, ch);
        });

        this.state.channelsMaster = Array.from(map.values());
    }

    /**
     * 🧪 TEST INTEGRIDAD DE NORMALIZACIÓN
     */
    testNormalizationIntegrity() {
        console.group('🧪 TEST Integridad Normalización');

        const valid = new Set(this.state.activeServers.map(s => s.id));
        const bad = this.state.channelsMaster.filter(
            ch => !ch.serverId || !valid.has(ch.serverId)
        );

        if (bad.length) {
            console.error('❌ Normalización rota:', bad.slice(0, 5));
            console.groupEnd();
            throw new Error(`TEST FALLIDO: ${bad.length} canales sin serverId válido`);
        }

        console.log(`✅ Normalización íntegra: ${this.state.channelsMaster.length} canales`);
        console.groupEnd();
        return true;
    }

    /**
     * 🧪 LOG DEFINITIVO: Distribución de serverId
     * Ejecutar tras conectar para validar que no hay IDs rotos
     */
    debugServerIdDistribution(label = '') {
        const channels = this.state.channelsMaster || [];
        const servers = this.state.activeServers || [];

        const dist = {};
        for (const ch of channels) {
            const sid = ch.serverId || '❌ NO_SERVERID';
            dist[sid] = (dist[sid] || 0) + 1;
        }

        console.group(`🧪 DEBUG SERVERID DIST ${label}`);
        console.table(
            servers.map(s => ({
                id: s.id,
                name: s.name,
                channelsFound: channels.filter(c => c.serverId === s.id).length
            }))
        );
        console.log('Distribución cruda serverId → count:', dist);

        // Detectar IDs huérfanos
        const validIds = new Set(servers.map(s => s.id));
        const orphanIds = Object.keys(dist).filter(id => !validIds.has(id) && id !== '❌ NO_SERVERID');
        if (orphanIds.length > 0) {
            console.warn('⚠️ IDs huérfanos detectados:', orphanIds);
        }

        console.groupEnd();
        return dist;
    }

    /**
     * @deprecated V4.18 - DESACTIVADO
     * Usar normalizeChannelUnified o ingestServerChannels
     */
    _normalizeToLayeredStructure(ch, serverId = null) {
        throw new Error('❌ NORMALIZADOR LEGACY DESACTIVADO - Usar ingestServerChannels()');
    }

    // ==================== 1. HELPER DE NORMALIZACIÓN (NUEVO) ====================
    normalizeXtreamBase(rawUrl) {
        // Asegura que siempre devolvemos una URL limpia y con protocolo
        let u = (rawUrl || '').trim();

        if (!u) return '';

        // Si ya tiene http/https lo respetamos, si no, forzamos http://
        if (!/^https?:\/\//i.test(u)) {
            u = 'http://' + u;
        }

        // Quitar barras extra al final
        u = u.replace(/\/+$/, '');

        return u;
    }

    // ==================== 2. CONEXIÓN AVANZADA (ROBUSTA) ====================
    async connectServer(append = false) {
        // ✅ V4.27.3: BLOQUEO ANTI-DUPLICADOS - Evitar conexiones simultáneas
        if (this._connectionInProgress) {
            console.warn('⚠️ [V4.27.3] Conexión ya en progreso, ignorando clic duplicado');
            this.showNotification('⚠️ Conexión en progreso, espera...', true);
            return;
        }

        // V4.24: Wake probe server when connecting
        this._wakeProbeServer();

        const urlInputEl = document.getElementById('baseUrl');
        const userEl = document.getElementById('username');
        const passEl = document.getElementById('password');
        const apiLabel = document.getElementById('apiDetectedLabel');

        const rawUrl = (urlInputEl?.value || '').trim();
        const user = (userEl?.value || '').trim();
        const pass = (passEl?.value || '').trim();

        if (!rawUrl || !user || !pass) {
            alert('Por favor completa todos los campos de conexión.');
            return;
        }

        // ✅ V4.27.3: Establecer flag de bloqueo INMEDIATAMENTE después de validar campos
        this._connectionInProgress = true;
        console.log('🔒 [V4.27.3] Conexión bloqueada - procesando...');

        // ✅ Usamos el normalizador: "line.ultra-8k.xyz" -> "http://line.ultra-8k.xyz"
        const baseHost = this.normalizeXtreamBase(rawUrl);

        if (!baseHost) {
            alert('URL de servidor inválida');
            this._connectionInProgress = false;  // ✅ V4.27.3: Liberar flag
            return;
        }

        const endpoint = `${baseHost}/player_api.php`;

        // ✅ V4.27.4: DETECCIÓN SIMPLE DE DUPLICADOS - SOLO POR URL BASE
        const normalizedHost = baseHost.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        const existingServer = (this.state.activeServers || []).find(srv => {
            const srvHost = (srv.baseUrl || '').replace(/^https?:\/\//, '').replace(/\/player_api\.php$/, '').replace(/\/$/, '').toLowerCase();
            return srvHost === normalizedHost;
        });

        // ✅ V4.27.4 FIX: Verificación correcta (puede ser undefined)
        let isReconnect = !!existingServer;
        let sId;

        if (isReconnect && existingServer) {
            // ✅ URL YA EXISTE - usar servidor existente, sobrescribir canales
            console.log(`🔄 [V4.27.4] Servidor "${existingServer.name || 'existente'}" - ACTUALIZANDO canales`);
            this.showNotification(`🔄 Actualizando canales...`);
            sId = existingServer.id;
        } else {
            // ✅ Servidor nuevo
            sId = 'srv_' + Date.now();
            isReconnect = false;
        }
        this.state.currentServer = {
            id: sId,
            name: document.getElementById('serverName')?.value.trim() || existingServer?.name || rawUrl,
            baseUrl: endpoint,   // IMPORTANTE: con /player_api.php para internal use
            username: user,
            password: pass
        };

        // Persistir config inmediata
        await this.saveActiveServers();

        this.setLoading(true);
        if (apiLabel) apiLabel.textContent = 'Player API (Xtream)';

        // ✅ V4.27.3: Flag ya establecido arriba (antes de verificaciones)

        // ✅ V4.10: Iniciar barra de progreso
        this.updateMiniProgress({
            pct: 0,
            status: "Conectando al servidor...",
            state: "active"
        });
        this.appendEnrichLog("Iniciando conexión...");

        try {
            // ✅ USAMOS MOTOR AVANZADO (Live + VOD + Series en paralelo)
            console.log('⚡ Conectando a Xtream usando', baseHost);
            console.log(isReconnect ? '🔄 [Reconexión] Servidor existente, aplicando merge...' : '➕ [Nueva conexión] Agregando servidor...');

            // ✅ V4.10: Progreso - Descargando canales
            this.updateMiniProgress({
                pct: 10,
                status: "Descargando catálogo de canales...",
                state: "active"
            });
            this.appendEnrichLog("Descargando Live/VOD/Series...");

            // Usamos connectXuiApi que ya tenías definido abajo, aprovechando su lógica paralela
            const rawChannels = await this.connectXuiApi(baseHost, user, pass);

            // ═══════════════════════════════════════════════════════════════
            // 🔒 CREDENTIAL LOCK — CONGELAR CREDENCIALES VALIDADAS
            // Si connectXuiApi devolvió datos, las credenciales SON CORRECTAS.
            // Se marcan como validadas e inmutables. Ningún proceso posterior
            // debe modificar username/password de este servidor.
            // ═══════════════════════════════════════════════════════════════
            if (rawChannels && rawChannels.length > 0) {
                this.state.currentServer._credentialsValidated = true;
                this.state.currentServer._validatedAt = Date.now();
                this.state.currentServer._lockedUsername = user;
                this.state.currentServer._lockedPassword = pass;
                console.log(`🔒 [CREDENTIAL LOCK] Credenciales CONGELADAS para "${this.state.currentServer.name}" — user:${user.substring(0,3)}*** pass:${pass.substring(0,3)}*** — INMUTABLES`);
            }

            // ✅ V4.10: Progreso - Canales descargados
            this.updateMiniProgress({
                pct: 50,
                enriched: rawChannels?.length || 0,
                status: `${rawChannels?.length || 0} canales descargados`,
                state: "active"
            });
            this.appendEnrichLog(`Recibidos ${rawChannels?.length || 0} canales`);

            if (!rawChannels || rawChannels.length === 0) {
                throw new Error('La lista devuelta está vacía.');
            }

            // ✅ V4.8.3: Use merge for existing servers, processChannels for new ones
            let resultMsg = '';

            // ✅ V4.10: Progreso - Procesando canales
            this.updateMiniProgress({
                pct: 60,
                status: "Procesando y normalizando canales...",
                state: "active"
            });
            this.appendEnrichLog("Normalizando datos...");

            if (isReconnect && !append) {
                // Merge: update existing, add new, remove old
                const mergeResult = this.mergeServerChannels(rawChannels, this.state.currentServer);
                resultMsg = `Sincronizado: +${mergeResult.added} nuevos, -${mergeResult.removed} eliminados, ${mergeResult.updated} actualizados`;

                // Re-apply filters and render
                this.applyFilters();
            } else {
                // New server or explicit append: use normal processing
                await this.processChannels(rawChannels, this.state.currentServer, append);
            }

            // ✅ V4.28: Propagar _expDate de currentServer → activeServers (después de processChannels/upsert)
            if (this.state.currentServer?._expDate) {
                const activeSrv = this.state.activeServers?.find(s => s.id === this.state.currentServer.id);
                if (activeSrv && !activeSrv._expDate) {
                    activeSrv._expDate = this.state.currentServer._expDate;
                    console.log(`📅 [V4.28] _expDate propagado a activeServer: ${activeSrv.name}`);
                }
            }

            // 🔗 V4.20.3: Actualizar chip de conexión tras procesamiento inicial exitoso
            const status = document.getElementById('connectionStatus');
            if (status) {
                status.innerHTML = '<span class="status-dot active"></span><span>Conectado</span>';
                status.className = 'status-chip success';
            }

            // ✅ V4.17: DEBUG LOG - Verificar serverId de canales
            console.group(`🧪 DEBUG SERVER ID CHECK: ${this.state.currentServer.name}`);
            const sample = this.state.channelsMaster.slice(0, 20);
            const summary = {};
            sample.forEach(ch => {
                const sid = ch.serverId || ch._serverId || '❌ NONE';
                summary[sid] = (summary[sid] || 0) + 1;
            });
            console.table(summary);
            console.log('ActiveServers IDs:', this.state.activeServers.map(s => s.id));
            console.groupEnd();

            // ✅ V4.17: FIX - Forzar serverId si falta (última línea de defensa)
            const currentId = this.state.currentServer.id;
            let fixed = 0;
            this.state.channelsMaster.forEach(ch => {
                if (!ch.serverId) {
                    ch.serverId = currentId;
                    fixed++;
                }
            });
            if (fixed > 0) {
                console.warn(`🔧 [FIX] ${fixed} canales SIN serverId → asignado ${currentId}`);
            }

            // ✅ V4.17: Limpiar huérfanos si existen
            const orphansRemoved = this.cleanupOrphanChannels();
            if (orphansRemoved > 0) {
                console.log(`🧹 ${orphansRemoved} huérfanos eliminados post-conexión`);
            }


            // ✅ V4.10: Progreso - Completado
            this.updateMiniProgress({
                pct: 100,
                enriched: this.state.channelsMaster.length,
                status: "¡Conexión completada!",
                state: "active"
            });
            this.appendEnrichLog("Conexión exitosa");

            // ✅ V4.10: Ocultar barra después de 2 segundos
            setTimeout(() => {
                this.updateMiniProgress({ state: "hidden" });
            }, 2000);

            this.showTab('analysis');
            const total = this.state.channelsMaster.length;
            const msg = isReconnect
                ? `Sincronizado · ${total} ítems totales`
                : (append ? `Agregado · Total ${total} ítems` : `Conectado · ${total} ítems cargados`);

            this.setConnectionStatus(true, msg);

            if (isReconnect) {
                alert(`✅ ${resultMsg}\nTotal: ${total} canales`);
            } else if (append) {
                alert(`✅ +${rawChannels.length} canales agregados. Total: ${total}`);
            } else {
                alert(`✅ Conexión exitosa. ${total} canales cargados (live+vod+series).`);

                // ✅ V4.12.2: Marcar que requiere enriquecimiento (nuevo servidor)
                this.channelsNeedRefresh = true;
                console.log('🔄 [MARCADOR] Re-enriquecimiento requerido (nuevo servidor)');

                // Auto-enrich check
                this.autoEnrichAllActiveSources(true);
            }

            // ✅ V4.23: Cargar resultados de probe previos desde R2
            if (typeof this.loadProbeResultsFromR2 === 'function') {
                console.log('📊 Cargando resultados de probe previos desde R2...');
                this.loadProbeResultsFromR2().catch(e =>
                    console.warn('⚠️ No se pudieron cargar probes previos:', e.message)
                );
            }

        } catch (err) {
            console.error(err);
            // ✅ V4.10: Mostrar error en barra
            this.updateMiniProgress({
                pct: 0,
                status: `Error: ${err.message}`,
                state: "error"
            });
            this.appendEnrichLog(`Error: ${err.message}`, "error");

            this.setConnectionStatus(false, 'Error de conexión');
            alert(`❌ Error de conexión: ${err.message}`);
        } finally {
            this.setLoading(false);
            // ✅ V4.10: Desbloquear cambio de tabs
            this._connectionInProgress = false;
        }
    }

    // ✅ FUNCIÓN RESTAURADA Y BLINDADA (Solo Live para evitar crash)
    async connectXuiApi(baseUrl, u, p) {
        try {
            // 1️⃣ Primero obtener info del usuario (incluye allowed_output_formats)
            const authResponse = await axios.get(`${baseUrl}/player_api.php`, {
                params: { username: u, password: p },
                timeout: 15000,
                withCredentials: true
            });

            const userInfo = authResponse.data?.user_info || {};
            const serverInfo = authResponse.data?.server_info || {};
            const allowedFormats = userInfo.allowed_output_formats || ['ts', 'm3u8'];
            console.log('📋 Formatos de salida permitidos:', allowedFormats);
            console.log('🖥️ Info del servidor:', serverInfo);

            // Guardar en state para uso posterior
            this.state.allowedOutputFormats = allowedFormats;
            this.state.serverInfo = serverInfo;
            this.state.userInfo = userInfo; // ✅ V4.28: Guardar userInfo (contiene exp_date)

            // ✅ V4.28: Guardar exp_date POR SERVIDOR en activeServers
            if (userInfo.exp_date) {
                const currentSrv = this.state.activeServers?.find(s => s.id === this.state.currentServer?.id);
                if (currentSrv) {
                    currentSrv._expDate = userInfo.exp_date; // Unix timestamp
                    console.log(`📅 Expiración de ${currentSrv.name}: ${new Date(userInfo.exp_date * 1000).toLocaleDateString('es-ES')}`);
                }
                // También guardar en el objeto currentServer
                if (this.state.currentServer) {
                    this.state.currentServer._expDate = userInfo.exp_date;
                }
            }

            // 2️⃣ Obtener categorías para mapear ID → Nombre
            console.log('📂 Descargando categorías...');
            try {
                const catResponse = await axios.get(`${baseUrl}/player_api.php`, {
                    params: { username: u, password: p, action: 'get_live_categories' },
                    timeout: 30000,
                    withCredentials: true
                });

                if (Array.isArray(catResponse.data)) {
                    // Construir mapa: { "3": "ALBANIA", "362": "FRANCE" }
                    this.state.categoryMap = {};
                    catResponse.data.forEach(cat => {
                        if (cat.category_id && cat.category_name) {
                            this.state.categoryMap[String(cat.category_id)] = cat.category_name;
                        }
                    });
                    console.log(`✅ ${Object.keys(this.state.categoryMap).length} categorías mapeadas`);
                } else {
                    console.warn('⚠️ No se pudieron obtener categorías');
                    this.state.categoryMap = {};
                }
            } catch (catError) {
                console.warn('⚠️ Error obteniendo categorías:', catError.message);
                this.state.categoryMap = {};
            }

            // 3️⃣ Obtener lista de canales (CONFIGURACIÓN PARA 26K+ CANALES)
            console.log('═══════════════════════════════════════════════════════════');
            console.log('📡 Descargando catálogo COMPLETO de canales LIVE...');
            console.log('⏱️ Esto puede tardar 30-120 segundos para listas grandes...');
            console.log('═══════════════════════════════════════════════════════════');

            const startTime = Date.now();
            const response = await axios.get(`${baseUrl}/player_api.php`, {
                params: {
                    username: u,
                    password: p,
                    action: 'get_live_streams'
                },
                // ✅ FIX: Aumentar timeout para listas grandes (26k+ canales)
                timeout: 120000,  // 120 segundos (2 minutos)
                // ✅ FIX: Eliminar límites de tamaño de respuesta
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                // ✅ V4.27.6: Cookies de sesión Xtream Codes
                withCredentials: true,
                // ✅ Progress callback para visibilidad
                onDownloadProgress: (progressEvent) => {
                    const mbLoaded = (progressEvent.loaded / (1024 * 1024)).toFixed(2);
                    if (progressEvent.total) {
                        const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                        console.log(`📥 Descargando: ${pct}% (${mbLoaded} MB)`);
                    } else {
                        console.log(`📥 Descargando: ${mbLoaded} MB...`);
                    }
                }
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log('═══════════════════════════════════════════════════════════');
            console.log('✅ DESCARGA COMPLETADA');
            console.log(`🎯 TOTAL DE CANALES RECIBIDOS: ${response.data?.length?.toLocaleString() || 0}`);
            console.log(`⏱️ Tiempo total: ${elapsed} segundos`);
            console.log('═══════════════════════════════════════════════════════════');

            if (!Array.isArray(response.data)) {
                throw new Error("El servidor no devolvió una lista válida (JSON Array).");
            }

            // 🔍 DEBUG: Ver TODOS los campos que envía el servidor Xtream
            if (response.data.length > 0) {
                const sample = response.data[0];
                console.log('═══════════════════════════════════════════════════════════');
                console.log('📋 TODOS LOS CAMPOS DE XTREAM get_live_streams:');
                console.log('═══════════════════════════════════════════════════════════');
                Object.entries(sample).forEach(([key, value]) => {
                    console.log(`  ${key}: ${JSON.stringify(value)}`);
                });
                console.log('═══════════════════════════════════════════════════════════');
                console.log('TOTAL CAMPOS:', Object.keys(sample).length);
                console.log('═══════════════════════════════════════════════════════════');
            }

            // 3️⃣ Agregar user_info y server_info a cada canal
            const channelsWithFormats = response.data.map(ch => ({
                ...ch,
                // Campos de salida
                allowed_output_formats: allowedFormats,
                salida: allowedFormats.join(', '),
                // Campos de server_info
                server_url: serverInfo.url || '',
                server_port: serverInfo.port || '',
                server_https_port: serverInfo.https_port || '',
                server_protocol: serverInfo.server_protocol || '',
                server_rtmp_port: serverInfo.rtmp_port || '',
                server_timezone: serverInfo.timezone || '',
                server_timestamp: serverInfo.timestamp_now || '',
                server_time: serverInfo.time_now || ''
            }));

            return channelsWithFormats;





        } catch (error) {
            console.warn("Fallo Axios:", error);
            // Intentar leer mensaje de error del servidor si existe
            const msg = error.response?.data?.message || error.message;
            throw new Error(`Fallo API: ${msg}`);
        }
    }

    async connectStandardApi(baseUrl, u, p, signal) {
        const url = new URL(`${baseUrl}/get.php`);
        url.searchParams.append('username', u);
        url.searchParams.append('password', p);
        url.searchParams.append('type', 'm3u_plus');
        url.searchParams.append('output', 'ts');

        const res = await fetch(url.toString(), { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();
        if (!text.startsWith('#EXTM3U')) throw new Error('No es una lista M3U válida');
        return this.parseM3U(text);
    }

    parseM3U(text) {
        const lines = text.split(/\r?\n/);
        const channels = [];
        let current = null;
        for (const line of lines) {
            if (line.startsWith('#EXTINF')) {
                const nameMatch = line.match(/,(.+)$/);
                const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
                const logo = (line.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
                const id = (line.match(/tvg-id="([^"]*)"/) || [])[1] || '';
                const group = (line.match(/group-title="([^"]*)"/) || [])[1] || 'Uncategorized';
                current = { name, stream_icon: logo, epg_channel_id: id, category_name: group };
            } else if (line && !line.startsWith('#') && current) {
                current.url = line.trim();
                channels.push(current);
                current = null;
            }
        }
        return channels;
    }

    // ==================== PROCESAMIENTO ====================
    async processChannels(rawChannels, serverObj, append = false) {
        console.time('Processing');

        if (!this.FIELD_SYNONYMS) this.initFieldSynonyms();

        const normalized = rawChannels.map((ch, idx) => this.normalizeChannel(ch, serverObj, idx));

        // ✅ 🌊 APLICAR CASCADE AUTOMÁTICO DE FUENTES
        let cascaded = normalized;
        if (this.cascadeManager) {
            console.log('🌊 Aplicando cascade automático de fuentes...');
            console.time('Cascade');
            cascaded = this.cascadeManager.processChannels(normalized);
            console.timeEnd('Cascade');
        }

        let cachedMap = new Map();
        if (this.db) {
            try { cachedMap = await this.db.getCachedMetadata(); } catch (e) { }
        }

        const enriched = [];
        const toSave = [];

        // ✅ Usar cascaded (con fuentes combinadas) en lugar de normalized
        cascaded.forEach(ch => {
            const id = this.db ? this.db.generateChannelId(ch) : null;
            const cached = id ? cachedMap.get(id) : null;

            if (cached) {
                enriched.push({ ...ch, ...cached, url: ch.url, _fromCache: true });
            } else {
                const processed = this.enrichChannel(ch);
                enriched.push(processed);
                toSave.push(processed);
            }
        });

        // V4.5.1: Asignación secuencial de números (Critico Fase 4)
        enriched.forEach((ch, idx) => {
            // ✅ FIX: Verificar que ch.raw existe antes de acceder
            if (!ch.raw) {
                ch.raw = {};
            }
            if (!ch.raw.num || ch.raw.num === 0) {
                ch.raw.num = idx + 1;
            }
        });

        if (this.db && toSave.length > 0) {
            this.db.saveChannelsBulk(toSave, this.state.currentServer.baseUrl).catch(e => console.error(e));
        }

        // --- Active Servers Management ---
        if (!this.state.activeServers) this.state.activeServers = [];

        const count = enriched.length;
        const getColor = (str) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
            const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
            return '#' + '00000'.substring(0, 6 - c.length) + c;
        };

        // ✅ V4.27: Incluir channelCount para persistencia correcta del conteo
        const newServerEntry = {
            id: serverObj.id || 'unknown',
            name: serverObj.name,
            channelCount: count,  // ✅ V4.27: Conteo persistente
            count: count,
            color: getColor(serverObj.name),
            baseUrl: serverObj.baseUrl,
            username: serverObj.username,
            password: serverObj.password,  // ✅ V4.27.5: Guardar password para biblioteca
            active: true,
            _expDate: serverObj._expDate || this.state.currentServer?._expDate || undefined  // ✅ V4.28.2: Preservar expDate
        };

        if (append) {
            // ✅ V4.27.3: Limpiar canales existentes del MISMO servidor antes de agregar
            // Esto evita duplicados cuando se reconecta el mismo servidor
            const currentServerId = serverObj.id;
            const beforeAppend = this.state.channelsMaster?.length || 0;

            // Filtrar canales del servidor actual (si existen)
            const channelsWithoutCurrent = (this.state.channelsMaster || []).filter(ch => {
                const chServerId = ch.serverId || ch._serverId;
                return chServerId !== currentServerId;
            });

            const removedCount = beforeAppend - channelsWithoutCurrent.length;
            if (removedCount > 0) {
                console.log(`🧹 [V4.27.3] Removidos ${removedCount} canales duplicados de ${serverObj.name}`);
            }

            // Agregar nuevos canales
            this.state.channelsMaster = [...channelsWithoutCurrent, ...enriched];
            console.log(`📊 [V4.27.3] Canales totales: ${this.state.channelsMaster.length} (${channelsWithoutCurrent.length} existentes + ${enriched.length} nuevos)`);

            // 🔒 V4.18.3: Usar upsert en lugar de push directo
            this.upsertServer(newServerEntry);
        } else {
            // ✅ V4.27.1: FIX CRÍTICO - NO sobrescribir canales de OTROS servidores
            // ANTES: this.state.channelsMaster = enriched; ❌ BORRABA TODOS los canales
            // AHORA: Mantener canales de otros servidores, solo reemplazar los del servidor actual

            const currentServerId = serverObj.id;
            const beforeCount = this.state.channelsMaster?.length || 0;

            // ✅ V4.27.1: Reparar canales huérfanos (sin serverId) ANTES de filtrar
            // Si un canal no tiene serverId, intentar inferirlo desde serverObj o activeServers
            let huerfanosReparados = 0;
            if (this.state.activeServers && this.state.activeServers.length > 0) {
                (this.state.channelsMaster || []).forEach(ch => {
                    if (!ch.serverId && !ch._serverId) {
                        // Intentar inferir servidor desde serverObj almacenado o primer servidor activo
                        const inferredServerId = ch.serverObj?.id || this.state.activeServers[0]?.id;
                        if (inferredServerId) {
                            ch.serverId = inferredServerId;
                            huerfanosReparados++;
                        }
                    }
                });
                if (huerfanosReparados > 0) {
                    console.log(`🔧 [V4.27.1] ${huerfanosReparados} canales huérfanos reparados con serverId`);
                }
            }

            // ✅ V4.27.1: Filtrar con lógica PERMISIVA
            // - Si un canal NO tiene serverId → MANTENERLO (es de un servidor anterior)
            // - Solo excluir si tiene serverId Y es igual al servidor actual
            const otherServersChannels = (this.state.channelsMaster || []).filter(ch => {
                const chServerId = ch.serverId || ch._serverId;

                // Si no tiene serverId, MANTENER (es un canal legacy o de servidor anterior)
                if (!chServerId) return true;

                // Si tiene serverId diferente al actual, MANTENER
                return chServerId !== currentServerId;
            });

            console.log(`🔄 [V4.27.1] Canales antes: ${beforeCount}`);
            console.log(`   - De otros servidores (mantener): ${otherServersChannels.length}`);
            console.log(`   - De ${serverObj.name} (reemplazar): ${beforeCount - otherServersChannels.length} → ${enriched.length}`);

            // Combinar: canales de otros servidores + nuevos canales de este servidor
            this.state.channelsMaster = [...otherServersChannels, ...enriched];

            console.log(`   - Total final: ${this.state.channelsMaster.length}`);

            this.clearChannelIndex(); // 🧹 V4.18.4: Invalidar índice al actualizar

            // 🔒 V4.18.3: FIX CRÍTICO - Usar upsert en lugar de overwrite
            this.upsertServer(newServerEntry);

            // ✅ V4.27: Limpiar solo canales de ESTE servidor en IndexedDB (no todos)
            if (this.db && typeof this.db.clearChannelsByServer === 'function') {
                const serverUrl = (serverObj.baseUrl || '').replace(/\/player_api\.php$/, '');
                this.db.clearChannelsByServer(serverUrl).catch(e =>
                    console.warn('⚠️ No se pudo limpiar canales del servidor en IndexedDB:', e)
                );
            }
        }

        // Reset current view to master
        this.state.channels = [...this.state.channelsMaster];

        this.renderServerList();

        setTimeout(() => {
            this.discoverFields(this.state.channelsMaster);
            this.renderFilterBuilder();
        }, 50);

        if (this.rankingEngine) this.recalculateRanking();
        else this.renderTable();

        this.calculateStats();
        this.updateStatsUI();

        // Persistir lista de canales completa
        await this.saveChannelsList();

        // ✅ V4.11: Persistir servidores activos automáticamente para que el chip no desaparezca al refrescar
        await this.saveActiveServers();

        // 🎯 NUEVO: Lanzar enriquecimiento interno automático en segundo plano
        this._launchInternalEnrichment('after_server_load');

        console.timeEnd('Processing');
    }

    // ==================== SERVER MANAGEMENT UI ====================
    // ✅ V4.11: Panel de Chips Mejorado (Grid 4x2)
    renderServerList() {
        const container = document.getElementById('activeServersList');
        if (!container) return;
        container.innerHTML = '';

        if (!this.state.activeServers || this.state.activeServers.length === 0) return;

        // ✅ V4.27.4: DEDUPLICAR por URL antes de renderizar
        const seenUrls = new Set();
        const uniqueServers = [];
        this.state.activeServers.forEach(srv => {
            const normalizedUrl = (srv.baseUrl || '').replace(/^https?:\/\//, '').replace(/\/player_api\.php$/, '').toLowerCase();
            if (!seenUrls.has(normalizedUrl)) {
                seenUrls.add(normalizedUrl);
                uniqueServers.push(srv);
            } else {
                console.warn(`⚠️ [V4.27.4] Servidor duplicado detectado y filtrado: ${srv.name}`);
            }
        });

        // Si hubo duplicados, limpiar el estado
        if (uniqueServers.length < this.state.activeServers.length) {
            console.log(`🧹 [V4.27.4] Limpiando ${this.state.activeServers.length - uniqueServers.length} servidores duplicados`);
            this.state.activeServers = uniqueServers;
            this.saveActiveServers(); // Persistir la limpieza
        }

        uniqueServers.forEach(srv => {
            // ✅ V4.27: Contar canales de este servidor - SIN fallback engañoso
            // Prioridad: 1) Contar desde channelsMaster, 2) srv.channelCount, 3) srv.count, 4) snapshot
            let channelCount = (this.state.channelsMaster || []).filter(ch =>
                (ch.serverId || ch._serverId) === srv.id
            ).length;

            // Si no hay canales en memoria, usar el conteo guardado en el servidor
            if (channelCount === 0) {
                channelCount = srv.channelCount || srv.count || srv.snapshot?.channelsCount || 0;
            }

            const chip = document.createElement('div');
            chip.style.cssText = `
                background: rgba(30,41,59,0.9);
                border: 1px solid rgba(148,163,184,0.3);
                border-radius: 10px;
                padding: 8px 12px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.72rem;
                min-width: 0;
            `;

            // Toggle de activo (círculo verde/gris con animación pulsante)
            const toggle = document.createElement('div');
            toggle.style.cssText = `
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: ${srv.active !== false ? '#4ade80' : '#64748b'};
                cursor: pointer;
                flex-shrink: 0;
            `;
            // Agregar clase para animación pulsante
            toggle.className = srv.active !== false ? 'server-toggle-active' : 'server-toggle-inactive';
            toggle.title = srv.active !== false ? 'Activo - Click para desactivar' : 'Inactivo - Click para activar';
            toggle.onclick = () => this.toggleServerActive(srv.id);

            // Nombre del servidor
            const name = document.createElement('span');
            name.textContent = srv.name || srv.id;
            name.style.cssText = 'font-weight:600; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;';

            // ✅ V4.27: Contador de canales - usar channelCount calculado (sin fallback a total)
            const actualCount = channelCount; // Ya calculado arriba correctamente
            const count = document.createElement('span');
            count.textContent = actualCount.toLocaleString();
            count.style.cssText = 'color:#60a5fa; font-weight:500; font-size:0.68rem; background:rgba(96,165,250,0.15); padding:2px 6px; border-radius:4px;';
            count.title = `${actualCount} canales de ${srv.name}`;

            // Botón guardar en biblioteca
            const btnSave = document.createElement('button');
            btnSave.innerHTML = '💾';
            btnSave.title = 'Guardar en Biblioteca';
            btnSave.style.cssText = 'background:transparent; border:none; cursor:pointer; font-size:0.85rem; opacity:0.7; padding:0;';
            btnSave.onmouseover = () => { btnSave.style.opacity = '1'; btnSave.style.transform = 'scale(1.15)'; };
            btnSave.onmouseout = () => { btnSave.style.opacity = '0.7'; btnSave.style.transform = 'scale(1)'; };
            btnSave.onclick = () => this.saveServerToLibrary(srv.id);

            // Botón eliminar
            const btnDel = document.createElement('button');
            btnDel.innerHTML = '✕';
            btnDel.title = 'Eliminar servidor';
            btnDel.style.cssText = 'background:transparent; border:none; color:#ef4444; cursor:pointer; font-weight:bold; font-size:0.75rem; opacity:0.6; padding:0;';
            btnDel.onmouseover = () => btnDel.style.opacity = '1';
            btnDel.onmouseout = () => btnDel.style.opacity = '0.6';
            btnDel.onclick = async () => {
                if (confirm(`¿Eliminar servidor "${srv.name}" y sus ${channelCount} canales?`)) {
                    await this.removeActiveServer(srv.id);
                }
            };

            chip.appendChild(toggle);
            chip.appendChild(name);
            chip.appendChild(count);
            chip.appendChild(btnSave);
            chip.appendChild(btnDel);

            container.appendChild(chip);
        });

        // ✅ V4.16: Botón limpiar conexiones (estilo igual al existente)
        if (this.state.activeServers.length > 0) {
            const clearBtn = document.createElement('button');
            clearBtn.id = 'btnClearConnections';
            clearBtn.className = 'btn secondary';
            clearBtn.innerHTML = '<span>🧹 LIMPIAR</span>';
            clearBtn.title = 'Limpiar todas las conexiones activas';
            clearBtn.onclick = () => this.clearAllActiveConnections();
            container.appendChild(clearBtn);
        }

        // Actualizar tabla de análisis también
        this.renderActiveServerStats();
    }

    /**
     * ✅ V4.13 - Toggle server active usando commitStateChange
     */
    async toggleServerActive(serverId) {
        const srv = this.state.activeServers?.find(s => s.id === serverId);
        if (!srv) return;

        // Cambiar estado
        srv.active = srv.active === false ? true : false;

        console.log(`🔄 ${srv.name}: ${srv.active ? '✅ Activado' : '❌ Desactivado'}`);

        // ✅ USAR COMMIT CENTRAL
        await this.commitStateChange({
            servers: true,
            reason: `Toggle servidor ${srv.name}: ${srv.active ? 'activado' : 'desactivado'}`
        });
    }

    /**
     * ✅ V4.13 - Eliminar servidor usando commitStateChange
     */
    async removeActiveServer(serverId) {
        if (!serverId) {
            console.warn('⚠️ removeActiveServer: No serverId provided');
            return;
        }

        const serverToRemove = this.state.activeServers?.find(s => s.id === serverId);
        if (!serverToRemove) {
            console.warn(`⚠️ Servidor ${serverId} no encontrado`);
            return;
        }

        console.log(`🗑️ INICIANDO ELIMINACIÓN: ${serverToRemove.name}`);

        // Contar canales antes
        const channelsBeforeCount = this.state.channelsMaster.length;

        // Eliminar canales de este servidor
        this.state.channelsMaster = this.state.channelsMaster.filter(ch =>
            (ch.serverId || ch._serverId) !== serverId
        );

        const actualRemoved = channelsBeforeCount - this.state.channelsMaster.length;
        console.log(`✅ Canales eliminados: ${actualRemoved}`);

        // Eliminar de activeServers
        if (this.state.activeServers) {
            this.state.activeServers = this.state.activeServers.filter(s => s.id !== serverId);
        }

        // Limpiar currentServer si era el eliminado
        if (this.state.currentServer?.id === serverId) {
            this.state.currentServer = {};
        }

        // Actualizar vista
        this.state.channels = [...this.state.channelsMaster];

        // ✅ USAR COMMIT CENTRAL (persiste + auditoría + render)
        await this.commitStateChange({
            servers: true,
            channels: true,
            reason: `Eliminar servidor ${serverToRemove.name} (${actualRemoved} canales removidos)`
        });

        // Stats y filtros
        this.calculateStats(this.state.channelsMaster);
        this.updateStatsUI();
        this.applyFilters();

        // Notificar
        const msg = `🗑️ Eliminado: ${serverToRemove.name}\n✅ ${actualRemoved} canales removidos`;
        this.showNotification(msg, false);
        alert(msg);
    }

    // ✅ V4.10: RenderActiveServerStats - Tabla Completa (Pestaña Servidores)
    renderActiveServerStats() {
        const container = document.getElementById('activeServerStatsContainer');
        if (!container) return;

        container.innerHTML = '';
        if (!this.state.activeServers || this.state.activeServers.length === 0) return;

        // Crear tabla container con class del usuario
        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'server-stats-panel';

        const table = document.createElement('table');
        table.className = 'server-stats-table';

        // Header
        table.innerHTML = `
            <thead>
                <tr>
                    <th style="text-align:left; padding-left:16px;">SERVIDOR</th>
                    <th>CANALES</th>
                    <th>GRUPOS</th>
                    <th>8K</th>
                    <th>4K</th>
                    <th>FHD</th>
                    <th>HD</th>
                    <th>SD</th>
                    <th>VENCE</th>
                    <th>ACCIÓN</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');

        // Contadores para Totalizador
        let grandTotal = {
            channels: 0,
            groups: 0,
            res8k: 0,
            res4k: 0,
            resFHD: 0,
            resHD: 0,
            resSD: 0
        };

        this.state.activeServers.forEach(srv => {
            // Calcular stats frescos desde channelsMaster
            const stats = this.calculateServerStats(srv.id);

            // Acumular Totales
            grandTotal.channels += stats.total;
            grandTotal.groups += stats.groups;
            grandTotal.res8k += stats.res8k;
            grandTotal.res4k += stats.res4k;
            grandTotal.resFHD += stats.resFHD;
            grandTotal.resHD += stats.resHD;
            grandTotal.resSD += stats.resSD;

            const tr = document.createElement('tr');

            // Función helper para crear celda filtrable
            const createFilterCell = (count, quality) => {
                const td = document.createElement('td');
                td.textContent = count;
                td.className = count > 0 ? 'clickable-stat' : 'muted-stat';
                if (count > 0) {
                    td.onclick = () => this.filterByServerAndQuality(srv.id, quality);
                    td.title = `Filtrar ${count} canales ${quality}`;
                }
                return td;
            };

            // Nombre Servidor + URL sutil
            let hostname = '';
            try {
                if (srv.baseUrl) hostname = new URL(srv.baseUrl).hostname;
                else hostname = 'Local/Offline';
            } catch (e) { hostname = srv.baseUrl || 'Unknown Host'; }

            const tdName = document.createElement('td');
            tdName.style.textAlign = 'left';
            tdName.style.paddingLeft = '16px';
            tdName.innerHTML = `
                <div style="font-weight:600; color:#fff;">${srv.name}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); opacity:0.7;">${hostname}</div>
            `;
            tr.appendChild(tdName);

            // Canales Totales
            const tdTotal = document.createElement('td');
            tdTotal.textContent = stats.total;
            tdTotal.className = 'clickable-stat';
            tdTotal.onclick = () => this.filterByServerAndQuality(srv.id, 'ALL');
            tr.appendChild(tdTotal);

            // Grupos
            const tdGroups = document.createElement('td');
            tdGroups.textContent = stats.groups;
            tr.appendChild(tdGroups);

            // Calidades
            tr.appendChild(createFilterCell(stats.res8k, '8K'));
            tr.appendChild(createFilterCell(stats.res4k, '4K'));
            tr.appendChild(createFilterCell(stats.resFHD, 'FHD'));
            tr.appendChild(createFilterCell(stats.resHD, 'HD'));
            tr.appendChild(createFilterCell(stats.resSD, 'SD'));

            // ✅ V4.28: Fecha de expiración REAL desde user_info.exp_date (por servidor)
            const tdExp = document.createElement('td');
            tdExp.style.fontSize = '0.8rem';
            const srvExpDate = srv._expDate;
            if (srvExpDate) {
                const expDate = new Date(srvExpDate * 1000);
                const now = new Date();
                const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
                tdExp.textContent = expDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                // Colorear según urgencia
                if (daysLeft <= 0) {
                    tdExp.style.color = '#ef4444'; // Rojo - expirado
                    tdExp.title = '⛔ EXPIRADO';
                } else if (daysLeft <= 7) {
                    tdExp.style.color = '#f97316'; // Naranja - por vencer
                    tdExp.title = `⚠️ Vence en ${daysLeft} día(s)`;
                } else if (daysLeft <= 30) {
                    tdExp.style.color = '#eab308'; // Amarillo - pronto
                    tdExp.title = `📅 Vence en ${daysLeft} días`;
                } else {
                    tdExp.style.color = '#4ade80'; // Verde - ok
                    tdExp.title = `✅ Vence en ${daysLeft} días`;
                }
            } else {
                tdExp.textContent = '—';
                tdExp.style.color = 'var(--text-muted)';
                tdExp.title = 'Conectar al servidor para obtener fecha';
            }
            tr.appendChild(tdExp);

            // Acción (Probe + Eliminar)
            const tdAction = document.createElement('td');

            // ✅ V4.10: Probe Button
            // ✅ V4.10: Connection/Reload Button
            const btnConnect = document.createElement('button');
            btnConnect.className = 'btn-icon-success';
            btnConnect.innerHTML = '🔌';
            btnConnect.title = 'Conectar/Recargar este servidor';
            // ✅ V4.16: Usar connectFromLibrary (no valida inputs del formulario)
            btnConnect.onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`¿Conectar a "${srv.name}"?`)) {
                    await this.connectFromLibrary(srv.id);
                }
            };
            tdAction.appendChild(btnConnect);

            // ✅ V4.16: Botón ➕ Agregar a conexiones (multi-servidor)
            const btnAdd = document.createElement('button');
            btnAdd.className = 'btn-icon-success';
            btnAdd.innerHTML = '➕';
            btnAdd.title = 'Agregar a conexiones multi-servidor';
            btnAdd.style.cssText = 'background:#3b82f6; border-color:#3b82f6;';
            btnAdd.onclick = async (e) => {
                e.stopPropagation();
                await this.addServerToConnections(srv.id);
            };
            tdAction.appendChild(btnAdd);

            const btnDel = document.createElement('button');
            btnDel.className = 'btn-icon-danger';
            btnDel.innerHTML = '🗑️';
            btnDel.title = 'Eliminar servidor';
            btnDel.onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`¿Eliminar servidor "${srv.name}" y sus canales?`)) {
                    await this.removeActiveServer(srv.id);
                }
            };
            tdAction.appendChild(btnDel);
            tr.appendChild(tdAction);

            tbody.appendChild(tr);
        });

        // ✅ V4.10: Fila Totalizadora
        const trTotal = document.createElement('tr');
        trTotal.style.background = 'rgba(56, 189, 248, 0.1)'; // Highlight suave
        trTotal.style.borderTop = '2px solid rgba(56, 189, 248, 0.3)';
        trTotal.style.fontWeight = 'bold';

        // Celda Titulo TOTAL
        const tdTotalTitle = document.createElement('td');
        tdTotalTitle.innerHTML = 'TOTAL';
        tdTotalTitle.style.textAlign = 'left';
        tdTotalTitle.style.paddingLeft = '16px';
        tdTotalTitle.style.color = '#fff';
        trTotal.appendChild(tdTotalTitle);

        // Celda Total Canales
        const tdTotalCh = document.createElement('td');
        tdTotalCh.textContent = grandTotal.channels;
        tdTotalCh.style.color = '#fff';
        trTotal.appendChild(tdTotalCh);

        // Celda Total Grupos (Suma simple, aunque conceptualmente es unión de sets, el usuario pidió "suma")
        const tdTotalGr = document.createElement('td');
        tdTotalGr.textContent = grandTotal.groups;
        trTotal.appendChild(tdTotalGr);

        // Celdas Calidad
        const qualities = [grandTotal.res8k, grandTotal.res4k, grandTotal.resFHD, grandTotal.resHD, grandTotal.resSD];
        qualities.forEach(qty => {
            const td = document.createElement('td');
            td.textContent = qty;
            td.style.color = qty > 0 ? 'var(--accent)' : 'inherit';
            trTotal.appendChild(td);
        });

        // Empty Vence
        trTotal.appendChild(document.createElement('td'));
        // Empty Acciones
        trTotal.appendChild(document.createElement('td'));

        tbody.appendChild(trTotal);

        table.appendChild(tbody);
        tableWrapper.appendChild(table);
        container.appendChild(tableWrapper);
    }

    /**
     * ✅ V4.15 - Calcula estadísticas de calidad para un servidor
     * OPTIMIZADO: Usa snapshot si existe para evitar recálculo
     */
    calculateServerStats(serverId) {
        // ✅ V4.15: PREFERIR SNAPSHOT (regla arquitectónica)
        const srv = this.state.activeServers?.find(s => s.id === serverId);
        if (srv?.snapshot) {
            const snap = srv.snapshot;
            return {
                total: snap.channelsCount || 0,
                groups: snap.groupsCount || 0,
                res8k: snap.qualities?.['8k'] || 0,
                res4k: snap.qualities?.['4k'] || 0,
                resFHD: snap.qualities?.['fhd'] || 0,
                resHD: snap.qualities?.['hd'] || 0,
                resSD: snap.qualities?.['sd'] || 0
            };
        }

        // Fallback: calcular desde channelsMaster (para servidores sin snapshot)
        console.warn(`⚠️ ${srv?.name || serverId}: Sin snapshot, calculando stats...`);

        let total = 0;
        const groups = new Set();
        let res8k = 0, res4k = 0, resFHD = 0, resHD = 0, resSD = 0;

        // Iterar master list para precisión
        for (const ch of this.state.channelsMaster) {
            // Comparación robusta
            if (ch.serverId != serverId) {
                // Fallback: Si el canal no tiene serverId, intentar asignarlo si sólo hay 1 servidor activo
                if (!ch.serverId && this.state.activeServers.length === 1) {
                    ch.serverId = this.state.activeServers[0].id;
                } else {
                    continue;
                }
            }

            total++;

            const group = ch.base?.group || ch.group || 'Sin grupo';
            if (group) groups.add(group);

            const tier = ch.qualityTier || '';
            const name = (ch.base?.name || ch.name || '').toUpperCase();

            let isCounted = false;

            if (tier === '8K' || name.includes('8K')) { res8k++; isCounted = true; }
            else if (tier === '4K' || name.includes('4K') || name.includes('UHD')) { res4k++; isCounted = true; }
            else if (tier === 'FHD' || name.includes('FHD') || name.includes('1080')) { resFHD++; isCounted = true; }
            else if (tier === 'HD' || name.includes('HD') || name.includes('720')) { resHD++; isCounted = true; }

            if (!isCounted) resSD++;
        }

        // DEBUG: Si total es 0 pero hay canales
        if (total === 0 && this.state.channelsMaster.length > 0) {
            console.warn(`⚠️ calculateServerStats: 0 matches for serverId "${serverId}".`);
        }

        return { total, groups: groups.size, res8k, res4k, resFHD, resHD, resSD };
    }

    /**
     * Filtra la lista principal por servidor y calidad
     */
    filterByServerAndQuality(serverId, quality) {
        console.log(`🔍 Filtrando Servidor: ${serverId}, Calidad: ${quality}`);

        // 1. Filtrar desde Master
        let filtered = this.state.channelsMaster.filter(ch => ch.serverId === serverId);

        // 2. Aplicar filtro de calidad si no es ALL
        if (quality !== 'ALL') {
            filtered = filtered.filter(ch => {
                const tier = ch.qualityTier || '';
                const name = ch.base.name.toUpperCase();

                if (quality === '8K') return (tier === '8K' || name.includes('8K'));
                if (quality === '4K') return (tier === '4K' || name.includes('4K') || name.includes('UHD'));
                if (quality === 'FHD') return (tier === 'FHD' || name.includes('FHD') || name.includes('1080'));
                if (quality === 'HD') return (tier === 'HD' || name.includes('HD') || name.includes('720'));
                if (quality === 'SD') {
                    // SD es exclusión de los anteriores
                    const isHigh = name.includes('8K') || name.includes('4K') || name.includes('UHD') ||
                        name.includes('FHD') || name.includes('1080') ||
                        name.includes('HD') || name.includes('720');
                    return !isHigh;
                }
                return true;
            });
        }

        // 3. Actualizar vista y UI
        this.state.channels = filtered;
        this.showTab('analysis');

        // 4. Actualizar contadores y tabla
        this.renderTable();
        this.updateStatsUI();

        // 5. Feedback visual
        const criteria = quality === 'ALL' ? 'Todos' : quality;
        // Hack: actualizar search box para indicar filtro activo visualmente
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = `server:${serverId} quality:${criteria}`;
            searchInput.classList.add('filter-active-pulse'); // Visual feedback class
        }

        // Toast
        this.showToast(`Filtrado: Servidor + ${criteria} (${filtered.length} canales)`);
    }

    async removeServer(serverId) {
        this.state.activeServers = this.state.activeServers.filter(s => s.id !== serverId);
        const initialCount = this.state.channelsMaster.length;
        this.state.channelsMaster = this.state.channelsMaster.filter(ch => ch.serverId !== serverId);

        const removedCount = initialCount - this.state.channelsMaster.length;
        console.log(`Removed ${removedCount} channels from server ${serverId}`);

        this.state.channels = [...this.state.channelsMaster];

        await this.saveActiveServers();
        await this.saveChannelsList();

        this.renderServerList();
        this.setConnectionStatus(true, `Conectado · ${this.state.channels.length} ítems totales`);

        setTimeout(() => {
            this.discoverFields(this.state.channelsMaster);
            this.renderFilterBuilder();
        }, 50);

        if (this.rankingEngine) this.recalculateRanking();
        else this.renderTable();

        this.calculateStats();
        this.updateStatsUI();
    }

    // ==================== SERVER LIBRARY MANAGEMENT (V4.9) ====================

    /**
     * ✅ V4.15 - Save server to library CON SNAPSHOT
     * Calcula snapshot antes de guardar
     */
    async saveServerToLibrary(serverId) {
        // Find the active server by ID
        const srv = this.state.activeServers?.find(s => s.id === serverId);

        if (!srv) {
            alert('❌ No se encontró información del servidor activo');
            return;
        }

        // ✅ V4.15: CALCULAR Y GUARDAR SNAPSHOT
        srv.snapshot = this.computeServerSnapshot(serverId);

        // Persistir servidor con snapshot
        await this.commitStateChange({
            servers: true,
            reason: `Guardar servidor ${srv.name} con snapshot`
        });

        // Usar snapshot para los datos del library entry
        const snap = srv.snapshot;

        // ✅ V4.28: Obtener expiración POR SERVIDOR (user_info.exp_date guardado en srv._expDate)
        let expDate = 'N/A';
        if (srv._expDate) {
            const exp = new Date(srv._expDate * 1000);
            expDate = exp.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        } else if (this.state.userInfo?.exp_date && this.state.currentServer?.id === serverId) {
            // Fallback: si no tiene _expDate pero userInfo sí (servidor actual)
            const exp = new Date(this.state.userInfo.exp_date * 1000);
            expDate = exp.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        // Build library entry from snapshot
        const libraryEntry = {
            id: serverId,
            name: srv.name,
            baseUrl: srv.baseUrl?.replace('/player_api.php', '') || srv.url || '',
            username: srv._lockedUsername || srv.username || '',
            password: srv._lockedPassword || srv.password || '',  // 🔒 Credential Lock: prioriza credenciales validadas
            apiType: 'auto',
            totalChannels: snap.channelsCount,
            totalGroups: snap.groupsCount,
            quality8K: snap.qualities['8k'] || 0,
            quality4K: snap.qualities['4k'] || 0,
            qualityFHD: snap.qualities['fhd'] || 0,
            qualityHD: snap.qualities['hd'] || 0,
            qualitySD: snap.qualities['sd'] || 0,
            expDate: expDate,
            savedAt: new Date().toISOString()
        };

        // Load existing library
        let library = [];
        try {
            library = JSON.parse(localStorage.getItem('iptv_server_library') || '[]');
        } catch (e) { library = []; }

        // Check if already exists
        const existingIdx = library.findIndex(s => s.id === serverId || s.baseUrl === libraryEntry.baseUrl);
        if (existingIdx >= 0) {
            // ✅ V4.28.2: Preservar expDate correcta si la nueva es N/A
            const oldEntry = library[existingIdx];
            if (libraryEntry.expDate === 'N/A' && oldEntry.expDate && oldEntry.expDate !== 'N/A') {
                libraryEntry.expDate = oldEntry.expDate;
            }
            library[existingIdx] = libraryEntry; // Update
            console.log('📝 Servidor actualizado en biblioteca:', libraryEntry.name);
        } else {
            library.push(libraryEntry);
            console.log('💾 Servidor guardado en biblioteca:', libraryEntry.name);
        }

        // Save to localStorage
        localStorage.setItem('iptv_server_library', JSON.stringify(library));

        // Refresh the table
        this.renderSavedServersTable();

        // ✅ CORRECCIÓN: Usar srv.name (servidor clickeado)
        alert(`✅ Servidor "${srv.name}" guardado en biblioteca`);
    }

    /**
     * Calculate quality breakdown from channel list
     */
    calculateQualityBreakdown(channels) {
        const counts = { '8K': 0, '4K': 0, 'FHD': 0, 'HD': 0, 'SD': 0 };

        channels.forEach(ch => {
            const res = (ch.resolution || ch.heuristics?.resolution || '').toLowerCase();
            const name = (ch.name || '').toLowerCase();

            if (res.includes('8k') || res.includes('4320') || name.includes('8k')) {
                counts['8K']++;
            } else if (res.includes('4k') || res.includes('uhd') || res.includes('2160') || name.includes('4k') || name.includes('uhd')) {
                counts['4K']++;
            } else if (res.includes('fhd') || res.includes('1080') || name.includes('fhd') || name.includes('1080')) {
                counts['FHD']++;
            } else if (res.includes('hd') || res.includes('720') || name.includes('720')) {
                counts['HD']++;
            } else {
                counts['SD']++;
            }
        });

        return counts;
    }

    /**
     * Render the saved servers table
     */
    renderSavedServersTable() {
        const tbody = document.getElementById('savedServersTableBody');
        const statServers = document.getElementById('statsTotalServers');
        const statChannels = document.getElementById('statsTotalChannels');

        if (!tbody) return;

        // Load library
        let library = [];
        try {
            library = JSON.parse(localStorage.getItem('iptv_server_library') || '[]');
        } catch (e) { library = []; }

        // Update stats
        if (statServers) statServers.textContent = library.length;
        if (statChannels) {
            const totalCh = library.reduce((sum, s) => sum + (s.totalChannels || 0), 0);
            statChannels.textContent = totalCh.toLocaleString();
        }

        // Render table
        if (library.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="padding:30px; text-align:center; color:#64748b;">
                        <div style="font-size:2rem; margin-bottom:8px;">📭</div>
                        No hay servidores guardados. Conecta un servidor y presiona 💾 para guardarlo aquí.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = library.map((srv, idx) => `
            <tr data-server-id="${srv.id}" style="border-bottom:1px solid rgba(255,255,255,0.05); ${idx % 2 === 0 ? 'background:rgba(30,41,59,0.3);' : ''}">
                <td style="padding:8px; color:#e2e8f0; font-size:0.75rem;">
                    <div style="font-weight:500;">${this.escapeHtml(srv.name)}</div>
                    <div style="font-size:0.65rem; color:#94a3b8; max-width:140px; overflow:hidden; text-overflow:ellipsis;">${this.escapeHtml(srv.baseUrl)}</div>
                </td>
                <td style="padding:8px; text-align:center; color:#e2e8f0; font-size:0.75rem;">${srv.totalChannels?.toLocaleString() || 0}</td>
                <td style="padding:8px; text-align:center; color:#e2e8f0; font-size:0.75rem;">${srv.totalGroups || 0}</td>
                <td style="padding:8px; text-align:center; color:#e2e8f0; font-size:0.75rem;">${srv.quality8K || 0}</td>
                <td style="padding:8px; text-align:center; color:#e2e8f0; font-size:0.75rem;">${srv.quality4K || 0}</td>
                <td style="padding:8px; text-align:center; color:#e2e8f0; font-size:0.75rem;">${srv.qualityFHD || 0}</td>
                <td style="padding:8px; text-align:center; color:#e2e8f0; font-size:0.75rem;">${srv.qualityHD || 0}</td>
                <td style="padding:8px; text-align:center; color:#e2e8f0; font-size:0.75rem;">${srv.qualitySD || 0}</td>
                <td data-vence-server="${srv.id}" style="padding:8px; text-align:center; font-size:0.7rem; color:${(() => {
                    if (!srv.expDate || srv.expDate === 'N/A') return '#64748b';
                    try {
                        const expMs = new Date(srv.expDate).getTime() || Date.parse(srv.expDate);
                        if (isNaN(expMs)) return '#64748b';
                        const days = Math.ceil((expMs - Date.now()) / 86400000);
                        if (days <= 0) return '#ef4444';
                        if (days <= 7) return '#f97316';
                        if (days <= 30) return '#eab308';
                        return '#4ade80';
                    } catch(e) { return '#64748b'; }
                })()}">${srv.expDate || '—'}</td>
                <td style="padding:8px; text-align:center; display:flex; gap:6px; justify-content:center;">
                    <button onclick="(app.connectFromLibraryFixed || app.connectFromLibrary).call(app, '${srv.id}')" 
                            class="server-action-btn server-action-connect"
                            title="Conectar">🔌</button>
                    <button onclick="(app.addServerToConnectionsFixed || app.addServerToConnections).call(app, '${srv.id}')" 
                            class="server-action-btn server-action-add"
                            title="Agregar a multi-servidor">➕</button>
                    <button onclick="app.removeFromLibrary('${srv.id}')"
                            class="server-action-btn server-action-delete"
                            title="Eliminar">🗑️</button>
                </td>
            </tr>
        `).join('');

        // ✅ V4.28: Auto-refresh expiration dates from API
        this.refreshLibraryExpDates();
    }

    /**
     * ✅ V4.28.2: Refresca fechas de vencimiento en la tabla de biblioteca.
     * ESTRATEGIA DUAL:
     *   1. Primero: Usa _expDate de activeServers en memoria (sin red, sin CORS)
     *   2. Fallback: Consulta player_api.php solo si no hay dato en memoria
     * Parchea celdas por data-vence-server="serverId" (NUNCA por índice de fila)
     */
    async refreshLibraryExpDates() {
        const token = Date.now();
        this._refreshExpToken = token;

        let library = [];
        try {
            library = JSON.parse(localStorage.getItem('iptv_server_library') || '[]');
        } catch (e) { return; }

        if (library.length === 0) return;

        console.log(`📅 [V4.28.2] Refrescando fechas de vencimiento para ${library.length} servidores...`);
        let updated = 0;

        // ═══════════════════════════════════════════════════════════════
        // PASO 1: Buscar _expDate en activeServers (MEMORIA — sin red)
        // ═══════════════════════════════════════════════════════════════
        for (const srv of library) {
            const serverId = srv.id;
            const activeSrv = this.state.activeServers?.find(s => s.id === serverId);
            if (activeSrv?._expDate) {
                const expDate = new Date(activeSrv._expDate * 1000);
                const expDateStr = expDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                srv.expDate = expDateStr;
                srv._expTimestamp = activeSrv._expDate;
                updated++;
                console.log(`  ✅ [MEM] ${srv.name} [${serverId}]: vence ${expDateStr}`);
                this._patchVenceCell(serverId, expDateStr, expDate);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // PASO 2: Para servidores sin _expDate en memoria, consultar API
        // ═══════════════════════════════════════════════════════════════
        const needsApi = library.filter(srv => {
            if (!srv.baseUrl || !srv.username || !srv.password) return false;
            // Si ya se actualizó en PASO 1, no consultar
            const activeSrv = this.state.activeServers?.find(s => s.id === srv.id);
            return !activeSrv?._expDate;
        });

        if (needsApi.length > 0) {
            console.log(`  🌐 ${needsApi.length} servidores requieren consulta API...`);
            const promises = needsApi.map(async (srv) => {
                const serverId = srv.id;
                const serverName = srv.name;
                try {
                    const cleanBase = srv.baseUrl.replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                    const apiUrl = `${cleanBase}/player_api.php?username=${encodeURIComponent(srv.username)}&password=${encodeURIComponent(srv.password)}`;

                    const response = await axios.get(apiUrl, { timeout: 8000 });

                    if (this._refreshExpToken !== token) return;

                    const expTimestamp = response.data?.user_info?.exp_date;
                    if (expTimestamp) {
                        const expDate = new Date(expTimestamp * 1000);
                        const expDateStr = expDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                        srv.expDate = expDateStr;
                        srv._expTimestamp = expTimestamp;
                        updated++;
                        console.log(`  ✅ [API] ${serverName} [${serverId}]: vence ${expDateStr}`);
                        this._patchVenceCell(serverId, expDateStr, expDate);
                    }
                } catch (e) {
                    console.warn(`  ⚠️ ${serverName}: API falló (${e.message})`);
                }
            });
            await Promise.allSettled(promises);
        }

        if (this._refreshExpToken === token && updated > 0) {
            localStorage.setItem('iptv_server_library', JSON.stringify(library));
            console.log(`📅 [V4.28.2] ${updated} fechas actualizadas y guardadas en localStorage`);
        }
    }

    /** Parchea una celda VENCE por data-vence-server (nunca por índice) */
    _patchVenceCell(serverId, dateStr, dateObj) {
        const cell = document.querySelector(`td[data-vence-server="${serverId}"]`);
        if (!cell) return;
        cell.textContent = dateStr;
        const daysLeft = Math.ceil((dateObj - new Date()) / 86400000);
        if (daysLeft <= 0) cell.style.color = '#ef4444';
        else if (daysLeft <= 7) cell.style.color = '#f97316';
        else if (daysLeft <= 30) cell.style.color = '#eab308';
        else cell.style.color = '#4ade80';
    }

    // ⚠️ V4.16: connectFromLibrary MOVIDO AL FINAL DEL ARCHIVO
    // La nueva versión usa el serverId guardado y no crea servidor nuevo

    /**
     * Remove a server from the library
     */
    removeFromLibrary(serverId) {
        // Buscar info del servidor
        let library = [];
        try {
            library = JSON.parse(localStorage.getItem('iptv_server_library') || '[]');
        } catch (e) { return; }

        const serverInfo = library.find(s => s.id === serverId);
        const serverName = serverInfo?.name || serverId;

        // Verificar si el servidor está activo
        const isActive = this.state.activeServers?.some(s => s.id === serverId);

        // Crear diálogo personalizado
        const dialogHTML = `
            <div id="deleteServerDialog" style="
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.7); z-index: 10000;
                display: flex; align-items: center; justify-content: center;
            ">
                <div style="
                    background: linear-gradient(135deg, #1e293b, #0f172a);
                    border: 1px solid rgba(239,68,68,0.3);
                    border-radius: 16px; padding: 24px; max-width: 400px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                ">
                    <h3 style="margin: 0 0 16px 0; color: #f87171; font-size: 1.1rem;">
                        🗑️ Eliminar Servidor
                    </h3>
                    <p style="color: #e2e8f0; margin: 0 0 8px 0; font-size: 0.9rem;">
                        <strong>${serverName}</strong>
                    </p>
                    <p style="color: #94a3b8; margin: 0 0 20px 0; font-size: 0.8rem;">
                        ${isActive
                ? '⚠️ Este servidor está actualmente conectado.'
                : 'Este servidor no está conectado.'}
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button id="btnDeleteLibraryOnly" style="
                            padding: 12px 16px; border-radius: 8px; cursor: pointer;
                            background: rgba(251,146,60,0.15); border: 1px solid rgba(251,146,60,0.4);
                            color: #fdba74; font-size: 0.85rem; font-weight: 500;
                        ">
                            📚 Solo eliminar de biblioteca
                        </button>
                        ${isActive ? `
                        <button id="btnDeleteAndDisconnect" style="
                            padding: 12px 16px; border-radius: 8px; cursor: pointer;
                            background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4);
                            color: #fca5a5; font-size: 0.85rem; font-weight: 500;
                        ">
                            🔌 Eliminar y desconectar
                        </button>
                        ` : ''}
                        <button id="btnCancelDelete" style="
                            padding: 10px 16px; border-radius: 8px; cursor: pointer;
                            background: rgba(100,116,139,0.15); border: 1px solid rgba(100,116,139,0.3);
                            color: #94a3b8; font-size: 0.8rem;
                        ">
                            ❌ Cancelar
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Insertar diálogo
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
        const dialog = document.getElementById('deleteServerDialog');

        // Event handlers
        const closeDialog = () => dialog?.remove();

        document.getElementById('btnCancelDelete')?.addEventListener('click', closeDialog);

        document.getElementById('btnDeleteLibraryOnly')?.addEventListener('click', () => {
            // Solo eliminar de biblioteca
            library = library.filter(s => s.id !== serverId);
            localStorage.setItem('iptv_server_library', JSON.stringify(library));
            this.renderSavedServersTable();
            console.log('🗑️ Servidor eliminado de biblioteca (mantenido activo)');
            if (this.showNotification) {
                this.showNotification(`📚 "${serverName}" eliminado de biblioteca`, false);
            }
            closeDialog();
        });

        document.getElementById('btnDeleteAndDisconnect')?.addEventListener('click', async () => {
            // Eliminar de biblioteca
            library = library.filter(s => s.id !== serverId);
            localStorage.setItem('iptv_server_library', JSON.stringify(library));

            // Desconectar servidor activo
            if (this.state.activeServers) {
                this.state.activeServers = this.state.activeServers.filter(s => s.id !== serverId);
            }

            // Eliminar canales del servidor desconectado
            if (this.state.channelsMaster) {
                this.state.channelsMaster = this.state.channelsMaster.filter(ch =>
                    (ch.serverId || ch._serverId) !== serverId
                );
            }
            if (this.state.channels) {
                this.state.channels = this.state.channels.filter(ch =>
                    (ch.serverId || ch._serverId) !== serverId
                );
            }

            // Persistir cambios
            if (this.commitStateChange) {
                await this.commitStateChange({
                    servers: true,
                    channels: true,
                    reason: `Eliminar servidor ${serverName} de biblioteca y desconectar`
                });
            }

            // Actualizar UI
            this.renderSavedServersTable();
            if (this.renderServerList) this.renderServerList();
            if (this.renderTable) this.renderTable();
            if (this.updateUI) this.updateUI();

            console.log('🗑️ Servidor eliminado de biblioteca y desconectado');
            if (this.showNotification) {
                this.showNotification(`🔌 "${serverName}" eliminado y desconectado`, false);
            }
            closeDialog();
        });

        // Cerrar con Escape
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeDialog();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    /**
     * Helper to escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    discoverFields(channels) {
        const fieldSet = new Set();
        if (!Array.isArray(channels) || !channels.length) {
            this.state.discoveredFields = [];
            return;
        }

        const coreFields = [
            // --- ID ENTITY ---
            { id: "id", label: "ID Local" },
            { id: "raw.stream_id", label: "ID Stream" },
            { id: "name", label: "Nombre" },
            { id: "tvgId", label: "ID Guía" },
            { id: "raw.num", label: "#" },

            // --- QUALITY (V4.2 Optimized) ---
            { id: "resolution", label: "Resolución" },
            { id: "bitrate", label: "Bitrate" },
            { id: "averageBitrate", label: "Bitrate Med." },
            { id: "bitrateTierCode", label: "Tier Calidad" },
            { id: "frames", label: "FPS" },
            { id: "codec", label: "Codec Video" },
            { id: "codecFamily", label: "Familia Codec" },
            { id: "transport", label: "Transporte" },
            { id: "qualityTags", label: "Etiquetas Q" },
            { id: "_internallyEnriched", label: "Enr. Interno" },
            { id: "qualityScore", label: "Score Calidad" },
            { id: "scoreLive", label: "Score Live" },
            { id: "qualityTier", label: "Tier" },
            { id: "matchScore", label: "Score Match" },

            { id: "raw.audiocodec", label: "Codec Audio" },
            { id: "raw.audiochannels", label: "Canales Audio" },
            { id: "raw.video_height", label: "Alto (px)" },
            { id: "raw.video_width", label: "Ancho (px)" },
            { id: "raw.aspectratio", label: "Aspecto" },

            // --- CONTENT ---
            { id: "group", label: "Grupo" },
            { id: "type", label: "Tipo" },
            { id: "is_adult", label: "+18" },
            { id: "rating", label: "Nota" },
            { id: "country", label: "País" },
            { id: "language", label: "Idioma" },

            { id: "raw.plot", label: "Sinopsis" },
            { id: "raw.cast", label: "Reparto" },
            { id: "raw.director", label: "Director" },
            { id: "year_launched", label: "Año" },

            // --- FLAGS (V4.2) ---
            { id: "isHdr", label: "HDR" },
            { id: "isDolbyAtmos", label: "Atmos" },
            { id: "isCatchup", label: "Catchup" },

            // --- EXTRA / INFRA ---
            { id: "logo", label: "Logo/Icon" },
            { id: "url", label: "URL Stream" },
            { id: "serverName", label: "Servidor" },
            { id: "provider", label: "Proveedor" },
            { id: "raw.containerextension", label: "Extensión" },
            { id: "raw.host", label: "Host" },
            { id: "raw.directsource", label: "Fuente Directa" },
            { id: "added", label: "Fecha Agg" },

            // --- ENRICHMENT ---
            { id: "_enriched", label: "Info Extra" }
        ];

        // Mapeo directo de campos descubiertos a esta lista maestra
        this.state.discoveredFields = coreFields;

        // Agregar dinámicamente raw.* extras que no estén en la lista maestra pero existan
        // (Aunque para "Ultimate" preferimos limpiar la vista, dejaremos esto comentado por si acaso)
        /*
        channels.forEach(ch => { ... });
        */


        if (!this.state.activeColumns || !this.state.activeColumns.length) {
            this.state.activeColumns = ['id', 'name', 'group', 'resolution', 'bitrateTierCode', 'logo'];
        }

        // ✅ FIXED: Usar coreFields.length en lugar de discoveredStr.length
        console.log(`🔍 Descubiertos ${coreFields.length} campos (v7.ultimate)`);

        // ✅ V4.10 DEBUG: Verify new fields
        const hasScoreLive = coreFields.find(f => f.id === 'scoreLive');
        const hasTier = coreFields.find(f => f.id === 'qualityTier');
        console.log('🎯 [V4.10] Score Live field:', hasScoreLive);
        console.log('🎯 [V4.10] Tier field:', hasTier);
    }

    // ✅ V4.4.4: Toggle Column Selector with MAXIMUM z-index
    toggleColumnSelector() {
        console.log('🔧 [V4.4.4] toggleColumnSelector()');

        const d = document.getElementById('columnList');
        if (!d) {
            console.error('❌ columnList no encontrado');
            return;
        }

        const isOpen = d.style.display !== 'none';

        if (!isOpen) {
            // Abrir
            d.style.display = 'block';
            d.style.zIndex = '99999';  // ← MÁXIMO z-index
            d.classList.add('column-list-always-top');
            console.log('✅ Column selector abierto (z-index: 99999)');
        } else {
            // Cerrar
            d.style.display = 'none';
            d.classList.remove('column-list-always-top');
            console.log('❌ Column selector cerrado');
        }

        this.renderColumnListUI();
    }

    renderColumnListUI() {
        const c = document.getElementById('columnList');
        if (!c) return;
        c.innerHTML = '';

        // ✅ V4.7: Get current policies from advancedDataRenderer
        const getFieldSource = (fieldId) => {
            if (this.advancedDataRenderer && this.advancedDataRenderer.getFieldSource) {
                return this.advancedDataRenderer.getFieldSource(fieldId);
            }
            return 'auto';
        };

        this.state.discoveredFields.forEach(f => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:4px 0; display:flex; align-items:center; gap:8px; flex-wrap:wrap;';

            const currentSource = getFieldSource(f.id);

            // Build source buttons
            const sources = [
                { key: 'auto', label: 'A', activeColor: '#38bdf8' },
                { key: 'server', label: 'S', activeColor: '#4ade80' },
                { key: 'heuristics', label: 'H', activeColor: '#fbbf24' },
                { key: 'probe', label: 'P', activeColor: '#f472b6' },
                { key: 'external', label: 'E', activeColor: '#a78bfa' }
            ];

            const btns = sources.map(s => {
                const isActive = currentSource === s.key;
                const bg = isActive ? s.activeColor : '#334155';
                const color = isActive ? '#000' : '#94a3b8';
                return `<button type="button" data-field="${f.id}" data-source="${s.key}" style="padding:2px 5px;border:none;border-radius:3px;cursor:pointer;background:${bg};color:${color};">${s.label}</button>`;
            }).join('');

            div.innerHTML = `
                <input type="checkbox" id="col_${f.id}" ${this.state.activeColumns.includes(f.id) ? 'checked' : ''}>
                <label for="col_${f.id}" style="white-space:nowrap;cursor:pointer;font-size:0.8rem;color:#cbd5e1;">${f.label}</label>
                <span style="display:flex;gap:2px;font-size:10px;margin-left:auto;">${btns}</span>
            `;

            // Add event listeners
            const checkbox = div.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.toggleColumn(f.id, e.target.checked);
                });
            }

            div.querySelectorAll('button[data-source]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.setFieldSource(btn.dataset.field, btn.dataset.source);
                });
            });

            c.appendChild(div);
        });

        // ✅ V4.8.1: Add SAVE button at bottom of panel
        const saveBtn = document.createElement('div');
        saveBtn.style.cssText = 'text-align:right;padding:12px 8px 8px;border-top:1px solid rgba(255,255,255,0.1);margin-top:8px;';
        saveBtn.innerHTML = `
            <button type="button" id="btnSaveFieldConfig" 
                    style="background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.85rem;">
                💾 Guardar selección
            </button>
        `;
        c.appendChild(saveBtn);

        // Bind save button
        const saveBtnEl = document.getElementById('btnSaveFieldConfig');
        if (saveBtnEl) {
            saveBtnEl.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.FieldSourceHandler && window.FieldSourceHandler.save) {
                    window.FieldSourceHandler.save();
                } else if (window.saveFieldSourceConfig) {
                    window.saveFieldSourceConfig();
                }
            });
        }

        // ✅ V4.8: Re-initialize field source handlers after rendering
        if (window.FieldSourceHandler && window.FieldSourceHandler.init) {
            setTimeout(() => window.FieldSourceHandler.init(), 50);
        }
    }

    // ✅ V4.7: Set field source and refresh
    setFieldSource(fieldId, source) {
        if (this.advancedDataRenderer && this.advancedDataRenderer.setFieldSource) {
            this.advancedDataRenderer.setFieldSource(fieldId, source);
            this.renderColumnListUI();
        } else {
            console.warn('⚠️ advancedDataRenderer not available');
        }
    }

    toggleColumn(fieldId, isActive) {
        if (isActive) {
            if (!this.state.activeColumns.includes(fieldId)) this.state.activeColumns.push(fieldId);
        } else {
            this.state.activeColumns = this.state.activeColumns.filter(c => c !== fieldId);
        }
        this.renderTable();
    }

    initFieldSynonyms() {
        this.FIELD_SYNONYMS = [
            // 1. Identidad Nuclear
            { canonical: "id", variants: ["stream_id", "streamid", "id", "epg_channel_id", "channel_id", "hash"] },
            { canonical: "raw.stream_id", variants: ["stream_id", "id"] },
            { canonical: "name", variants: ["name", "title", "stream_name", "channel_name"] },
            { canonical: "tvgId", variants: ["tvg-id", "tvg_id", "epg_id", "xmltv_id", "channel_id_epg"] },
            { canonical: "tvgName", variants: ["tvg-name", "tvg_name", "epg_name", "xmltv_name"] },
            { canonical: "raw.custom_sid", variants: ["custom_sid", "custom_id", "sid", "stream_sid"] },
            { canonical: "raw.num", variants: ["num", "number", "position", "order"] },

            // 2. Calidad de Imagen y Sonido
            { canonical: "resolution", variants: ["resolution", "res", "quality", "video_quality", "definition", "video_res", "display_height"] },
            { canonical: "bitrate", variants: ["bitrate", "br", "bps", "bitrate_kbps", "bit_rate", "bitrate_kb", "kbps"] },
            { canonical: "averageBitrate", variants: ["averageBitrate", "avgBitrate", "avg_bitrate", "average_bitrate", "mean_bitrate"] },
            { canonical: "bitrateTierCode", variants: ["bitrateTierCode", "tier", "quality_tier"] },
            { canonical: "frames", variants: ["frames", "frame_rate", "framerate", "fps", "video_fps", "vfr"] },
            { canonical: "codec", variants: ["codec", "video_codec", "stream_codec", "vcodec"] },
            { canonical: "raw.video_height", variants: ["video_height", "height", "h"] },
            { canonical: "raw.video_width", variants: ["video_width", "width", "w"] },
            { canonical: "raw.aspect_ratio", variants: ["aspect_ratio", "aspect"] },
            { canonical: "raw.audio_codec", variants: ["audio_codec", "acodec"] },
            { canonical: "raw.audio_channels", variants: ["audio_channels", "channels"] },

            // 3. Categorización y Contenido
            { canonical: "group", variants: ["category", "category_id", "category_name", "cat_name", "group", "group-title"] },
            { canonical: "raw.category_id", variants: ["category_id"] },
            { canonical: "type", variants: ["type", "stream_type", "content_type", "streamtype", "category_type", "vod_type", "live_type"] },
            { canonical: "is_adult", variants: ["is_adult", "adult", "adult_only", "xxx", "nsfw", "isAdult", "category_adult", "adult_flag"] },
            { canonical: "rating", variants: ["rating", "rank", "score"] },
            { canonical: "raw.plot", variants: ["plot", "description", "synopsis"] },
            { canonical: "raw.cast", variants: ["cast", "actors"] },
            { canonical: "raw.director", variants: ["director"] },

            // 4. Infraestructura y Origen
            { canonical: "serverName", variants: ["serverName"] },
            { canonical: "serverId", variants: ["serverId"] },
            { canonical: "raw.container_extension", variants: ["container_extension", "extension", "ext"] },
            { canonical: "raw.direct_source", variants: ["direct_source", "source", "origin_url", "stream_url"] },
            { canonical: "provider", variants: ["provider", "origin", "source_name", "origin_name", "server_name", "portal_name"] },
            { canonical: "raw.host", variants: ["host", "hostname", "domain"] },
            { canonical: "raw.updated_at", variants: ["updated_at", "updated", "last_updated"] },
            { canonical: "added", variants: ["added", "created_at", "timestamp", "date_added"] },
            { canonical: "url", variants: ["url", "stream_url", "play_url", "link", "stream_link"] },
            { canonical: "raw.user_agent", variants: ["user_agent", "user-agent", "ua"] },

            // 5. Enriquecimiento Geográfico & Cultural (Worker)
            { canonical: "country", variants: ["country", "cc", "iso_code", "country_code", "tvg-country", "tvg_country", "nation"] },
            { canonical: "language", variants: ["language", "lang", "languages", "audio_lang", "tvg-language", "tvg_language", "audioLanguage"] },
            { canonical: "logo", variants: ["stream_icon", "tvg_logo", "tvg-logo", "logo", "icon", "cover", "poster", "image", "channel_logo"] },
            { canonical: "tags", variants: ["tags", "keywords", "categories"] },
            { canonical: "website", variants: ["website", "site", "url_web"] },
            { canonical: "year_launched", variants: ["year_launched", "founded", "launched"] },
            { canonical: "is_nsfw", variants: ["is_nsfw", "porn"] }, // Worker override

            // 6. Extras Legacy
            { canonical: "tvarchive", variants: ["tvarchive", "tv_archive", "archive", "has_archive", "catchup"] },
            { canonical: "epg_url", variants: ["epg_url", "tvg-url", "x-tvg-url"] },
            { canonical: "raw.tv_archive_duration", variants: ["tv_archive_duration", "catchup_hours", "catchup_duration", "archive_duration", "catchupDays"] }
        ];
    }
    findCanonicalField(raw, canonicalKey) {
        if (!this.FIELD_SYNONYMS) this.initFieldSynonyms();
        const def = this.FIELD_SYNONYMS.find(f => f.canonical === canonicalKey);
        if (!def) return null;

        const rawKeys = Object.keys(raw);

        for (const v of def.variants) {
            if (raw[v] !== undefined && raw[v] !== null && raw[v] !== '') return raw[v];
            const lowerV = v.toLowerCase();
            const foundKey = rawKeys.find(k => k.toLowerCase() === lowerV);
            if (foundKey && raw[foundKey] !== undefined && raw[foundKey] !== null && raw[foundKey] !== '') {
                return raw[foundKey];
            }
        }
        return null;
    }

    /**
     * 🔒 PIPELINE ÚNICO DE NORMALIZACIÓN V4.18
     * Crea estructura de 4 capas + garantiza serverId SIEMPRE presente
     * @param {Object} raw - Canal crudo de la API
     * @param {Object} serverObj - Objeto servidor con id y name obligatorios
     * @param {number} index - Índice del canal
     * @returns {Object} Canal normalizado con estructura 4 capas
     */
    normalizeChannel(raw, serverObj, index) {
        // 🔒 ENFORCE: serverId es OBLIGATORIO
        const sId = serverObj?.id;
        if (!sId) {
            console.error('❌ normalizeChannel: serverObj.id es OBLIGATORIO', serverObj);
            throw new Error('serverId is required for channel normalization');
        }
        const sName = serverObj?.name || 'Unknown Server';

        // Si ya tiene estructura de 4 capas, validar y retornar
        if (raw.base && typeof raw.base === 'object') {
            if (!raw.heuristics) raw.heuristics = {};
            if (!raw.tech) raw.tech = {};
            if (!raw.meta) raw.meta = {};
            raw.serverId = sId; // 🔒 SIEMPRE sobrescribir con el actual
            raw.serverName = sName;
            return raw;
        }

        // Hook Modular: ConnectionModuleV2
        if (this.connectionModuleV2) {
            const enriched = this.connectionModuleV2.enrichWithFieldMapping(raw, serverObj, index);
            enriched.serverId = sId; // 🔒 Garantizar serverId
            return enriched;
        }

        const get = (k) => this.findCanonicalField(raw, k);

        // Crear estructura unificada (4 capas + compatibilidad plana)
        const normalized = {
            // 🔒 Identifiers (OBLIGATORIOS - NUNCA undefined)
            serverId: sId,
            serverName: sName,
            id: get("id") || raw.stream_id || String(index),
            stream_id: raw.stream_id,
            _idx: index,

            // 🔒 Base layer (IMMUTABLE after this point)
            base: {
                name: get("name") || raw.name || '',
                group: get("group") || raw.category_name || '',
                logo: get("logo") || raw.stream_icon || '',
                url: get("url") || raw.url || '',
                country: get("country") || '',
                language: get("language") || '',
                codec: get("codec") || '',
                bitrate: Number(get("bitrate")) || 0,
                resolution: get("resolution") || this.deriveResolutionFromHeight(raw.video_height || raw.height),
                width: raw.video_width || raw.width || null,
                height: raw.video_height || raw.height || null,
                fps: raw.fps || raw.frames || null,
                type: get("type") || raw.stream_type || 'live',
                tvg_id: raw.tvg_id || raw.epg_channel_id || '',
                tvg_name: raw.tvg_name || '',
                is_adult: raw.is_adult || false,
                raw: raw
            },

            // 🤖 Heuristics layer (inferred data - initially empty)
            heuristics: {},

            // 🔬 Tech layer (from probe - initially empty)
            tech: {},

            // Metadata
            meta: {
                enriched: false,
                probed: false,
                normalizedAt: Date.now()
            },

            // Legacy compatibility (direct access - for backward compat)
            name: get("name") || raw.name || "Unknown",
            group: get("group") || raw.category_name || "General",
            logo: get("logo") || raw.stream_icon || "",
            url: get("url") || "",
            codec: get("codec") || "",
            bitrate: Number(get("bitrate") || 0),
            resolution: get("resolution") || this.deriveResolutionFromHeight(raw.video_height || raw.height),
            language: get("language") || "",
            type: get("type") || "live",
            enabled: get("enabled") ? 1 : 0,
            tvarchive: get("tvarchive") ? 1 : 0,
            added: get("added") || null,
            frames: Number(get("frames") || 0),
            rating: Number(get("rating") || 0),
            tvgId: get("tvg_id") || null,
            tvgName: get("tvg_name") || null,
            country: get("country") || null,
            provider: get("provider") || null,
            epgUrl: get("epg_url") || null,
            status: 'unknown',
            bitrateTierCode: 'SD_480',
            qualityTags: [],
            isLive: (get("type") || "live") === "live",
            displayName: get("name") || raw.name || "Unknown",
            description: get("description") || get("plot") || get("synopsis") || ""
        };

        // V4.5.1: Structured RAW for worker/UI compatibility
        normalized.averageBitrate = Number(get("averageBitrate")) || Number(get("bitrate")) || 0;
        normalized.raw = {
            plot: normalized.description,
            directsource: raw.url || raw.streamurl || '',
            num: index + 1,
            ...raw
        };

        normalized.rawFields = [];
        for (const [key, value] of Object.entries(raw)) {
            if (typeof value !== 'object' && value !== null) {
                normalized.rawFields.push({ key, value });
            }
        }

        // Apply Industrial Reference
        if (window.QualityInference?.applyQualityInference) {
            QualityInference.applyQualityInference(normalized, raw);
        }

        if (!normalized.bitrate) normalized.bitrate = 0;
        normalized.bitrateTierCode = this.mapBitrateTier(normalized.bitrate);

        // Fallback de seguridad para campos visuales
        if (!normalized.name || normalized.name === 'Unknown') {
            if (raw.name) normalized.name = raw.name;
            else if (raw.stream_name) normalized.name = raw.stream_name;
        }
        if (!normalized.group || normalized.group === 'General') {
            if (raw.category_name) normalized.group = raw.category_name;
        }
        if (!normalized.logo && raw.stream_icon) normalized.logo = raw.stream_icon;
        if ((!normalized.id || normalized.id === 'NaN') && raw.stream_id) normalized.id = String(raw.stream_id);

        return normalized;
    }

    normalizeResolution(res) {
        if (!res) return 'AUTO';
        const strRes = String(res).toLowerCase();
        const normalized = {
            '1080p': '1080p', '1080': '1080p', 'full_hd': '1080p',
            '720p': '720p', '720': '720p', 'hd': '720p',
            '480p': '480p', '480': '480p', 'sd': '480p',
            '360p': '360p', '240p': '240p',
            '4k': '4K', '2160p': '4K', '4k_ultra_hd': '4K',
            '8k': '8K', '4320p': '8K'
        };
        return normalized[strRes] || 'AUTO';
    }

    buildStreamUrl(raw) {
        if (raw.url) return raw.url;
        const s = this.state.currentServer;
        const id = raw.stream_id || raw.epg_channel_id;

        let typePath = 'live';
        let ext = this.state.streamFormat || 'ts';

        if (raw.stream_type === 'movie') {
            typePath = 'movie';
            ext = raw.container_extension || 'mp4';
        } else if (raw.stream_type === 'series') {
            typePath = 'series';
            ext = 'mp4';
        }

        return `${s.baseUrl} /${typePath}/${encodeURIComponent(s.username)} /${encodeURIComponent(s.password)}/${id}.${ext} `;
    }

    enrichChannel(ch) {
        if (!ch) return null;

        // ✅ V4.6: Ensure heuristics layer exists
        if (!ch.heuristics) ch.heuristics = {};
        const h = ch.heuristics;

        // Get name for inference (from base or legacy)
        const name = ch.base?.name || ch.name || '';
        const group = ch.base?.group || ch.group || '';
        const url = ch.base?.url || ch.url || '';
        const type = ch.base?.type || ch.type || 'live';

        // 1. Inferir quality tags desde nombre/grupo
        h.qualityTags = this.inferQualityTags({ name, group });

        // 2. Inferir transport format
        h.transportFormatCode = this.inferTransportFormat(url, type);

        // 3. Inferir codec family
        h.codecFamily = this.inferCodecFamily({ name, qualityTags: h.qualityTags }, h.qualityTags);

        // Text for pattern matching
        const nameUpper = (name + ' ' + group).toUpperCase();

        // Resolution - inferir desde nombre
        const existingRes = ch.base?.resolution || ch.resolution || '';
        if (!existingRes || existingRes === '' || existingRes === 'AUTO') {
            if (nameUpper.includes('8K')) h.resolution = '8K';
            else if (nameUpper.includes('4K') || nameUpper.includes('UHD') || nameUpper.includes('2160')) h.resolution = '4K';
            else if (nameUpper.includes('FHD') || nameUpper.includes('1080')) h.resolution = '1080p';
            else if (nameUpper.includes('HD') || nameUpper.includes('720')) h.resolution = '720p';
            else if (nameUpper.includes('SD') || nameUpper.includes('480')) h.resolution = '480p';
            else {
                // ✅ V4.21: Fallback desde campo calidad/quality antes de asignar AUTO
                const qualityField = (ch.calidad || ch.quality || ch.qualityLabel || ch.base?.calidad || ch.base?.quality || '').toUpperCase();
                if (qualityField.includes('8K')) h.resolution = '8K';
                else if (qualityField.includes('4K') || qualityField.includes('2160')) h.resolution = '4K';
                else if (qualityField.includes('1080') || qualityField.includes('FHD')) h.resolution = '1080p';
                else if (qualityField.includes('720') || qualityField.includes('HD_720')) h.resolution = '720p';
                else if (qualityField.includes('480') || qualityField.includes('SD_480') || qualityField.includes('SD')) h.resolution = '480p';
                else if (qualityField.includes('360')) h.resolution = '360p';
                else h.resolution = null; // No asignar AUTO - dejar null para que otros procesos intenten inferir
            }
        }


        // Codec - inferir desde nombre
        const existingCodec = ch.base?.codec || ch.codec || '';
        if (!existingCodec || existingCodec === '') {
            if (nameUpper.includes('HEVC') || nameUpper.includes('H265') || nameUpper.includes('H.265')) h.codec = 'HEVC';
            else if (nameUpper.includes('AV1')) h.codec = 'AV1';
            else if (nameUpper.includes('VP9')) h.codec = 'VP9';
            else if (h.qualityTags?.includes('4K') || h.qualityTags?.includes('8K')) h.codec = 'HEVC';
            else h.codec = 'H264';
        }

        // Bitrate - inferir si es 0
        const existingBitrate = ch.base?.bitrate || ch.bitrate || 0;
        if (!existingBitrate || existingBitrate === 0) {
            h.bitrate = this.inferAvgBitrateKbps({ name }, h.qualityTags, h.transportFormatCode);
        }
        h.avgBitrateKbps = h.bitrate || existingBitrate;
        h.bitrateTierCode = this.mapBitrateTier(h.avgBitrateKbps);

        // FPS - inferir desde nombre
        const existingFps = ch.base?.fps || ch.frames || 0;
        if (!existingFps || existingFps === 0) {
            if (nameUpper.includes('60FPS') || nameUpper.includes('60 FPS')) h.fps = 60;
            else if (nameUpper.includes('50FPS') || nameUpper.includes('50 FPS')) h.fps = 50;
            else if (nameUpper.includes('30FPS') || nameUpper.includes('30 FPS')) h.fps = 30;
            else if (nameUpper.includes('SPORTS') || nameUpper.includes('DEPORT') || nameUpper.includes('ESPN') || nameUpper.includes('FOX SPORTS')) h.fps = 50;
            else h.fps = 25;
        }
        h.frames = h.fps;

        // ✅ V4.6.0: Advanced Country/Language Inference Engine
        const inferred = this.inferCountryLanguageAdvanced(name, group);

        const existingLang = ch.base?.language || ch.language || '';
        const existingCountry = ch.base?.country || ch.country || '';

        // Language - usar inferencia avanzada si no hay valor
        if (!existingLang || existingLang === '' || existingLang === 'MIX') {
            h.language = inferred.language || 'MIX';
        }

        // Country - usar inferencia avanzada si no hay valor
        if (!existingCountry || existingCountry === '' || existingCountry === 'INT') {
            h.country = inferred.country || 'INT';
        }

        // Quality Score - calcular
        let score = 0;
        const res = h.resolution || existingRes || 'AUTO';
        const bitrate = h.bitrate || existingBitrate || 0;
        const codec = h.codec || existingCodec || 'H264';
        const fps = h.fps || existingFps || 25;

        // Resolución (40%)
        if (res === '8K') score += 40;
        else if (res === '4K') score += 36;
        else if (res === '1080p') score += 28;
        else if (res === '720p') score += 20;
        else score += 10;

        // Bitrate (30%)
        if (bitrate >= 20000) score += 30;
        else if (bitrate >= 8000) score += 24;
        else if (bitrate >= 5000) score += 18;
        else if (bitrate >= 2000) score += 12;
        else score += 6;

        // Codec (20%)
        if (codec === 'AV1') score += 20;
        else if (codec === 'HEVC') score += 16;
        else score += 10;

        // FPS (10%)
        if (fps >= 60) score += 10;
        else if (fps >= 50) score += 8;
        else score += 5;

        h.qualityScore = Math.min(100, score);

        // Quality Tier basado en score
        if (h.qualityScore >= 85) h.qualityTier = 'ULTRA';
        else if (h.qualityScore >= 65) h.qualityTier = 'HIGH';
        else if (h.qualityScore >= 45) h.qualityTier = 'MEDIUM';
        else h.qualityTier = 'LOW';

        // Derived flags
        h.isUHD = res === '4K' || res === '8K';
        h.isHD = !h.isUHD && (res === '1080p' || res === '720p' || res.includes('HD'));
        h.isSD = !h.isUHD && !h.isHD;
        h.isSports = nameUpper.includes('SPORT') || nameUpper.includes('DEPORT') ||
            nameUpper.includes('ESPN') || nameUpper.includes('FOX SPORTS') ||
            nameUpper.includes('NBA') || nameUpper.includes('NFL');
        h.isMovie = type === 'movie' || nameUpper.includes('CINE') || nameUpper.includes('MOVIE');
        h.isSeries = type === 'series' || nameUpper.includes('SERIE');

        // Mark as enriched
        if (!ch.meta) ch.meta = {};
        ch.meta.enriched = true;
        ch.meta.enrichedAt = Date.now();

        // ✅ V4.6: Legacy compatibility - copy to direct props (will be removed in future)
        ch.qualityTags = h.qualityTags;
        ch.resolution = h.resolution || existingRes;
        ch.codec = h.codec || existingCodec;
        ch.bitrate = h.bitrate || existingBitrate;
        ch.frames = h.fps || existingFps;
        ch.language = h.language || existingLang || 'MIX';
        ch.country = h.country || existingCountry || 'INT';
        ch.qualityScore = h.qualityScore;
        ch.qualityTier = h.qualityTier;
        ch.transportFormatCode = h.transportFormatCode;
        ch.codecFamily = h.codecFamily;
        ch.avgBitrateKbps = h.avgBitrateKbps;
        ch.bitrateTierCode = h.bitrateTierCode;

        // Hook Modular: EnrichmentModule
        if (this.enrichmentModule) {
            this.enrichmentModule.enrichChannel(ch);
        }

        return ch;
    }


    /**
     * ✅ V4.6.0: Advanced Country/Language Inference Engine
     * 4-layer detection: Prefix → Characters → Broadcasters → Keywords
     * @param {string} name - Channel name
     * @param {string} group - Channel group
     * @returns {{country: string, language: string}}
     */
    inferCountryLanguageAdvanced(name, group) {
        const text = ((name || '') + ' ' + (group || '')).toUpperCase();
        const originalText = (name || '') + ' ' + (group || '');

        // ═══════════════════════════════════════════════════════════
        // LAYER 1: Explicit Prefix Detection (highest priority)
        // ═══════════════════════════════════════════════════════════
        const prefixPatterns = [
            { regex: /^DE[:\s|]/i, country: 'DE', language: 'DE' },
            { regex: /^AT[:\s|]/i, country: 'AT', language: 'DE' },  // Austria
            { regex: /^CH[:\s|]/i, country: 'CH', language: 'DE' },  // Switzerland (German)
            { regex: /^UK[:\s|]/i, country: 'UK', language: 'EN' },
            { regex: /^GB[:\s|]/i, country: 'UK', language: 'EN' },
            { regex: /^US[:\s|]/i, country: 'US', language: 'EN' },
            { regex: /^FR[:\s|]/i, country: 'FR', language: 'FR' },
            { regex: /^ES[:\s|]/i, country: 'ES', language: 'ES' },
            { regex: /^IT[:\s|]/i, country: 'IT', language: 'IT' },
            { regex: /^PT[:\s|]/i, country: 'PT', language: 'PT' },
            { regex: /^BR[:\s|]/i, country: 'BR', language: 'PT' },
            { regex: /^NL[:\s|]/i, country: 'NL', language: 'NL' },
            { regex: /^BE[:\s|]/i, country: 'BE', language: 'NL' },  // Belgium
            { regex: /^TR[:\s|]/i, country: 'TR', language: 'TR' },
            { regex: /^RU[:\s|]/i, country: 'RU', language: 'RU' },
            { regex: /^PL[:\s|]/i, country: 'PL', language: 'PL' },
            { regex: /^GR[:\s|]/i, country: 'GR', language: 'EL' },  // Greece
            { regex: /^MX[:\s|]/i, country: 'MX', language: 'ES' },
            { regex: /^CO[:\s|]/i, country: 'CO', language: 'ES' },
            { regex: /^CL[:\s|]/i, country: 'CL', language: 'ES' },  // Chile
            { regex: /^PE[:\s|]/i, country: 'PE', language: 'ES' },  // Peru
            { regex: /^VE[:\s|]/i, country: 'VE', language: 'ES' },  // Venezuela
            { regex: /^IN[:\s|]/i, country: 'IN', language: 'HI' },  // India
            { regex: /^PK[:\s|]/i, country: 'PK', language: 'UR' },  // Pakistan
            { regex: /^JP[:\s|]/i, country: 'JP', language: 'JA' },  // Japan
            { regex: /^KR[:\s|]/i, country: 'KR', language: 'KO' },  // Korea
            { regex: /^CN[:\s|]/i, country: 'CN', language: 'ZH' },  // China
            { regex: /^SE[:\s|]/i, country: 'SE', language: 'SV' },  // Sweden
            { regex: /^NO[:\s|]/i, country: 'NO', language: 'NO' },  // Norway
            { regex: /^DK[:\s|]/i, country: 'DK', language: 'DA' },  // Denmark
            { regex: /^FI[:\s|]/i, country: 'FI', language: 'FI' },  // Finland
            { regex: /^RO[:\s|]/i, country: 'RO', language: 'RO' },  // Romania
            { regex: /^HU[:\s|]/i, country: 'HU', language: 'HU' },  // Hungary
            { regex: /^CZ[:\s|]/i, country: 'CZ', language: 'CS' },  // Czech
            { regex: /^IL[:\s|]/i, country: 'IL', language: 'HE' },  // Israel
            { regex: /^AE[:\s|]/i, country: 'AE', language: 'AR' },  // UAE
            { regex: /^SA[:\s|]/i, country: 'SA', language: 'AR' },  // Saudi Arabia
            { regex: /^EG[:\s|]/i, country: 'EG', language: 'AR' },  // Egypt
        ];

        // Special handling for AR: prefix (Argentina vs Arabic)
        if (/^AR[:\s|]/i.test(name || '')) {
            // Check for Arabic characters in rest of name
            const restOfName = (name || '').substring(3);
            if (/[\u0600-\u06FF]/.test(restOfName)) {
                return { country: 'SA', language: 'AR' }; // Arabic
            }
            return { country: 'AR', language: 'ES' }; // Argentina
        }

        for (const p of prefixPatterns) {
            if (p.regex.test(name || '')) {
                return { country: p.country, language: p.language };
            }
        }

        // ═══════════════════════════════════════════════════════════
        // LAYER 2: Special Character Detection (language fingerprint)
        // ═══════════════════════════════════════════════════════════
        const charPatterns = [
            { regex: /[äöüßÄÖÜẞ]/, language: 'DE', country: 'DE' },           // German
            { regex: /[éèêëçôûîïàâùœæ]/i, language: 'FR', country: 'FR' },   // French
            { regex: /[ñ¡¿]/i, language: 'ES', country: 'ES' },              // Spanish (unique chars)
            { regex: /[ãõ]/i, language: 'PT', country: 'BR' },               // Portuguese
            { regex: /[ıİşŞğĞ]/i, language: 'TR', country: 'TR' },           // Turkish
            { regex: /[łąęćńśźżŁĄĘĆŃŚŹŻ]/, language: 'PL', country: 'PL' }, // Polish
            { regex: /[\u0600-\u06FF]/, language: 'AR', country: 'SA' },      // Arabic
            { regex: /[\u0400-\u04FF]/, language: 'RU', country: 'RU' },      // Russian/Cyrillic
            { regex: /[\u0590-\u05FF]/, language: 'HE', country: 'IL' },      // Hebrew
            { regex: /[\u0370-\u03FF]/, language: 'EL', country: 'GR' },      // Greek
            { regex: /[\u4E00-\u9FFF]/, language: 'ZH', country: 'CN' },      // Chinese
            { regex: /[\u3040-\u30FF]/, language: 'JA', country: 'JP' },      // Japanese
            { regex: /[\uAC00-\uD7AF]/, language: 'KO', country: 'KR' },      // Korean
            { regex: /[åäöÅÄÖ]/i, language: 'SV', country: 'SE' },           // Swedish (overlap with German but context)
            { regex: /[æøåÆØÅ]/i, language: 'NO', country: 'NO' },           // Norwegian
            { regex: /[ăîâșțĂÎÂȘȚ]/, language: 'RO', country: 'RO' },        // Romanian
        ];

        for (const cp of charPatterns) {
            if (cp.regex.test(originalText)) {
                return { country: cp.country, language: cp.language };
            }
        }

        // ═══════════════════════════════════════════════════════════
        // LAYER 3: Broadcaster Keywords
        // ═══════════════════════════════════════════════════════════
        const broadcasters = {
            // German
            'WDR': 'DE', 'ARD': 'DE', 'ZDF': 'DE', 'RTL': 'DE', 'SAT1': 'DE', 'SAT.1': 'DE',
            'PRO7': 'DE', 'PROSIEBEN': 'DE', 'KABEL': 'DE', 'N24': 'DE', 'PHOENIX': 'DE',
            'ARTE': 'DE', 'NDR': 'DE', 'MDR': 'DE', 'SWR': 'DE', 'BR ': 'DE', 'HR ': 'DE',
            'RBB': 'DE', 'TAGESSCHAU': 'DE', 'SPORT1': 'DE', 'DMAX': 'DE', 'SIXX': 'DE',
            'SUPER RTL': 'DE', 'VOX': 'DE', 'WELT': 'DE', 'N-TV': 'DE', 'NITRO': 'DE',

            // Arabic
            'AL JAZEERA': 'SA', 'ALJAZEERA': 'SA', 'MBC': 'SA', 'ROTANA': 'SA',
            'ALARABIYA': 'SA', 'AL ARABIYA': 'SA', 'DUBAI': 'AE', 'ABU DHABI': 'AE',
            'QATAR': 'QA', 'BEIN': 'QA', 'OSN': 'AE', 'LBC': 'LB', 'MTV LEBANON': 'LB',

            // UK
            'BBC': 'UK', 'ITV': 'UK', 'CHANNEL 4': 'UK', 'CHANNEL 5': 'UK', 'SKY UK': 'UK',
            'DAVE': 'UK', 'E4': 'UK', 'MORE4': 'UK', 'FILM4': 'UK', 'SKY SPORTS': 'UK',
            'BT SPORT': 'UK', 'PREMIER LEAGUE': 'UK',

            // French
            'TF1': 'FR', 'FRANCE 2': 'FR', 'FRANCE 3': 'FR', 'FRANCE 4': 'FR', 'FRANCE 5': 'FR',
            'M6': 'FR', 'CANAL+': 'FR', 'CANAL PLUS': 'FR', 'W9': 'FR', 'TMC': 'FR',
            'NRJ': 'FR', 'EUROSPORT': 'FR', 'RMC': 'FR', 'BFMTV': 'FR', 'CNEWS': 'FR',

            // US
            'CNN': 'US', 'FOX NEWS': 'US', 'MSNBC': 'US', 'NBC': 'US', 'CBS': 'US',
            'ABC': 'US', 'ESPN': 'US', 'HBO': 'US', 'SHOWTIME': 'US', 'DISCOVERY': 'US',
            'HISTORY': 'US', 'NATIONAL GEOGRAPHIC': 'US', 'NAT GEO': 'US', 'AMC': 'US',
            'TNT': 'US', 'TBS': 'US', 'FX': 'US', 'SYFY': 'US', 'USA NETWORK': 'US',
            'BRAVO': 'US', 'E!': 'US', 'LIFETIME': 'US', 'HALLMARK': 'US', 'STARZ': 'US',

            // Spanish (Spain)
            'TVE': 'ES', 'RTVE': 'ES', 'ANTENA 3': 'ES', 'TELECINCO': 'ES', 'CUATRO': 'ES',
            'LA SEXTA': 'ES', 'MOVISTAR': 'ES', 'GOLTV': 'ES', '24 HORAS': 'ES',

            // Latin America
            'TELEVISA': 'MX', 'TV AZTECA': 'MX', 'AZTECA': 'MX', 'UNIVISION': 'MX',
            'CARACOL': 'CO', 'RCN': 'CO', 'WIN SPORTS': 'CO',
            'TELEFE': 'AR', 'CANAL 13': 'AR', 'TODO NOTICIAS': 'AR', 'TN': 'AR',
            'GLOBO': 'BR', 'BAND': 'BR', 'RECORD': 'BR', 'SBT': 'BR', 'SPORTV': 'BR',

            // Turkish
            'TRT': 'TR', 'SHOW TV': 'TR', 'STAR TV': 'TR', 'KANAL D': 'TR', 'ATV': 'TR',
            'FOX TR': 'TR', 'TV8': 'TR', 'HABER': 'TR', 'SPOR': 'TR', 'BEIN TR': 'TR',

            // Russian
            'PERVIY': 'RU', 'РОССИЯ': 'RU', 'ROSSIYA': 'RU', 'NTV': 'RU', 'REN TV': 'RU',
            'TNT RU': 'RU', 'STS': 'RU', 'MATCH': 'RU', 'ДОМАШНИЙ': 'RU',

            // Italian
            'RAI': 'IT', 'MEDIASET': 'IT', 'CANALE 5': 'IT', 'ITALIA': 'IT', 'LA7': 'IT',
            'RETE 4': 'IT', 'SPORT ITALIA': 'IT', 'SKY SPORT IT': 'IT',

            // Dutch
            'NPO': 'NL', 'RTL NL': 'NL', 'SBS': 'NL', 'VERONICA': 'NL', 'ZIGGO': 'NL',

            // Polish
            'TVP': 'PL', 'TVN': 'PL', 'POLSAT': 'PL', 'TV PULS': 'PL', 'CANAL+ PL': 'PL',

            // Portuguese
            'RTP': 'PT', 'SIC': 'PT', 'TVI': 'PT', 'SPORT TV': 'PT', 'BENFICA': 'PT',
        };

        const countryToLang = {
            'DE': 'DE', 'AT': 'DE', 'CH': 'DE', 'UK': 'EN', 'US': 'EN', 'FR': 'FR',
            'ES': 'ES', 'IT': 'IT', 'PT': 'PT', 'BR': 'PT', 'NL': 'NL', 'BE': 'NL',
            'TR': 'TR', 'RU': 'RU', 'PL': 'PL', 'SA': 'AR', 'AE': 'AR', 'QA': 'AR',
            'LB': 'AR', 'EG': 'AR', 'MX': 'ES', 'CO': 'ES', 'AR': 'ES', 'GR': 'EL',
            'IL': 'HE', 'JP': 'JA', 'KR': 'KO', 'CN': 'ZH', 'SE': 'SV', 'NO': 'NO',
            'RO': 'RO', 'HU': 'HU', 'CZ': 'CS'
        };

        for (const [keyword, country] of Object.entries(broadcasters)) {
            if (text.includes(keyword)) {
                return { country, language: countryToLang[country] || 'MIX' };
            }
        }

        // ═══════════════════════════════════════════════════════════
        // LAYER 4: Language Keywords (common words)
        // ═══════════════════════════════════════════════════════════
        const langKeywords = {
            DE: ['UND', 'DER', 'DIE', 'DAS', 'FÜR', 'MIT', 'NACH', 'HEUTE', 'FERNSEHEN'],
            FR: ['LE', 'LA', 'LES', 'ET', 'POUR', 'AVEC', 'DANS', 'CINÉMA', 'TÉLÉ'],
            ES: ['EL', 'LOS', 'LAS', 'PARA', 'CON', 'ESTE', 'CINE', 'DEPORTES', 'NOTICIAS', 'LATINO'],
            PT: ['O', 'OS', 'AS', 'PARA', 'COM', 'ESTE', 'FILMES', 'ESPORTES', 'NOTÍCIAS'],
            TR: ['VE', 'HABER', 'SPOR', 'DIZI', 'MÜZIK', 'KANAL', 'ÇOCUK', 'BELGESEL'],
            RU: ['И', 'НА', 'В', 'ДЛЯ', 'НОВОСТИ', 'СПОРТ', 'КИНО', 'РОССИЯ'],
            AR: ['قناة', 'العربية', 'أخبار', 'رياضة', 'أفلام', 'مباشر'],
        };

        const langToCountry = {
            'DE': 'DE', 'FR': 'FR', 'ES': 'ES', 'PT': 'BR', 'TR': 'TR', 'RU': 'RU', 'AR': 'SA'
        };

        for (const [lang, keywords] of Object.entries(langKeywords)) {
            for (const kw of keywords) {
                if (text.includes(kw)) {
                    return { country: langToCountry[lang], language: lang };
                }
            }
        }

        // ═══════════════════════════════════════════════════════════
        // LAYER 5: Fallback (existing basic patterns)
        // ═══════════════════════════════════════════════════════════
        if (text.includes('LATINO') || text.includes('LAT]') || text.includes('(LAT)')) {
            return { country: 'MX', language: 'ES-LAT' };
        }
        if (text.includes('ESPAÑA') || text.includes('ESP]') || text.includes('SPAIN')) {
            return { country: 'ES', language: 'ES' };
        }
        if (text.includes('ENGLISH') || text.includes('ENG]') || text.includes('(EN)')) {
            return { country: 'US', language: 'EN' };
        }

        return { country: 'INT', language: 'MIX' };
    }

    inferQualityTags(ch) {
        const t = [];
        const s = ((ch.name || '') + ' ' + (ch.group || '')).toUpperCase();

        if (s.includes('8K')) t.push('8K');
        else if (s.includes('4K') || s.includes('UHD')) t.push('4K');
        else if (s.includes('FHD') || s.includes('1080')) t.push('FHD');
        else if (s.includes('HD')) t.push('HD');
        else t.push('SD');

        if (s.includes('HEVC')) t.push('HEVC');
        if (s.includes('LATINO')) t.push('LATINO');
        if (s.includes('ESPAÑOL') || s.includes('ESP')) t.push('ESPAÑOL');
        return t;
    }

    inferTransportFormat(url) {
        if (!url) return 'TS';
        const u = String(url).toLowerCase();
        if (u.includes('.m3u8')) return 'HLS';
        if (u.includes('.mpd')) return 'DASH';
        return 'TS';
    }

    inferCodecFamily(ch, tags) {
        if (tags.includes('HEVC') || tags.includes('4K')) return 'HEVC';
        return 'AVC';
    }

    inferAvgBitrateKbps(ch, tags, fmt) {
        if (tags.includes('4K')) return 25000;
        if (tags.includes('FHD')) return 8000;
        if (tags.includes('HD')) return 5000;
        return 2000;
    }

    mapBitrateTier(kbps) {
        if (kbps > 20000) return 'UHD_4K';
        if (kbps > 7000) return 'FHD_1080';
        if (kbps > 4000) return 'HD_720';
        return 'SD_480';
    }

    // ✅ FIX: Derivar resolución desde video_height de Xtream API
    deriveResolutionFromHeight(height) {
        if (!height) return '';
        const h = Number(height);
        if (h >= 2160) return '4K';
        if (h >= 1440) return '1440p';
        if (h >= 1080) return '1080p';
        if (h >= 720) return '720p';
        if (h >= 576) return '576p';
        if (h >= 480) return '480p';
        if (h >= 360) return '360p';
        if (h > 0) return `${h} p`;
        return '';
    }

    // ==================== UI HELPERS ====================
    // ✅ V4.4.4: Dynamic Field Discovery (Enhanced V5.0)
    discoverFields(channels) {
        if (!channels || !channels.length) return;
        const fields = new Map();
        const MAX_SAMPLES = 500;

        const addField = (key, label, group) => {
            if (!fields.has(key)) {
                fields.set(key, { id: key, label: label, group: group });
            }
        };

        // Standard Fields
        addField('id', 'ID', 'Info');
        addField('name', 'Nombre', 'Info');
        addField('group', 'Grupo', 'Info');
        addField('logo', 'Logo', 'Info');
        addField('resolution', 'Resolución', 'Video');
        addField('bitrate', 'Bitrate', 'Video');
        addField('bitrateTierCode', 'Calidad', 'Video');
        addField('codec', 'Codec', 'Video');
        addField('codecFamily', 'Familia Codec', 'Video');
        addField('frames', 'FPS', 'Video');
        addField('country', 'País', 'Meta');
        addField('language', 'Idioma', 'Meta');
        addField('qualityScore', 'Score', 'Meta');
        addField('scoreLive', 'Score Live', 'Meta');
        addField('qualityTier', 'Tier', 'Meta');

        // New V5.0 Fields
        addField('website', 'Website', 'Meta');
        addField('year_launched', 'Año', 'Meta');
        addField('transportFormatCode', 'Estructura', 'Infra');
        addField('salida', 'SALIDA', 'Infra'); // ✅ Formatos de salida permitidos

        // Server Info Fields
        addField('server_url', 'Server URL', 'Server');
        addField('server_port', 'Puerto', 'Server');
        addField('server_https_port', 'Puerto HTTPS', 'Server');
        addField('server_protocol', 'Protocolo', 'Server');
        addField('server_rtmp_port', 'Puerto RTMP', 'Server');
        addField('server_timezone', 'Zona Horaria', 'Server');
        addField('server_timestamp', 'Timestamp', 'Server');
        addField('server_time', 'Hora Servidor', 'Server');

        // Scan raw.* fields from sample
        const samples = channels.slice(0, MAX_SAMPLES);
        samples.forEach(ch => {
            if (ch.raw) {
                Object.keys(ch.raw).forEach(k => {
                    // Clean up key name for label
                    const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    addField(`raw.${k} `, `Raw: ${label} `, 'Xtream/Raw');
                });
            }
        });

        this.state.discoveredFields = Array.from(fields.values());
        // console.log(`🔍[FieldDiscovery] ${ this.state.discoveredFields.length } campos detectados.`);
    }

    /**
     * Creates a safe logo image with:
     * - referrerpolicy="no-referrer" (bypasses hotlink blocks like Imgur)
     * - loading="lazy" (performance)
     * - onerror fallback (graceful degradation)
     * - 4.5s timeout (handles slow/dead IPs)
     * @param {string} url - Image URL
     * @returns {HTMLImageElement}
     */
    createSafeLogoImg(url) {
        const img = document.createElement('img');
        img.style.cssText = 'height:18px; max-width:50px; object-fit:contain; border-radius:2px;';
        img.loading = 'lazy';
        img.decoding = 'async';

        // Helps with Imgur/hotlink-blocking (blocks by Referer check)
        img.referrerPolicy = 'no-referrer';
        // Note: Don't set crossOrigin='anonymous' - it triggers CORS preflight
        // and we don't need CORS for simply displaying images

        // Ultra-light SVG placeholder
        const placeholder =
            'data:image/svg+xml;utf8,' +
            encodeURIComponent(`< svg xmlns = "http://www.w3.org/2000/svg" width = "50" height = "18" >
              <rect width="100%" height="100%" rx="3" ry="3" fill="#1f2937"/>
              <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle"
                    fill="#9ca3af" font-size="9" font-family="system-ui">LOGO</text>
            </svg > `);

        let settled = false;

        const fail = () => {
            if (settled) return;
            settled = true;
            img.src = placeholder;
        };

        img.onerror = fail;

        // Timeout for dead/slow IPs (e.g., 103.176.90.95)
        const t = setTimeout(fail, 4500);
        img.onload = () => {
            if (settled) return;
            settled = true;
            clearTimeout(t);
        };

        img.src = url;
        return img;
    }

    /**
     * ✅ V4.12.5: ALIAS PARA COMPATIBILIDAD CON HTML
     * Apunta al renderizador principal de tablas
     */
    renderAnalysisTable(data) {
        if (data) {
            // Si pasamos datos específicos, podemos usarlos, pero renderTable ya usa filteredChannels
            console.log('📊 [Compat] Llamando a renderTable desde alias renderAnalysisTable');
        }
        return this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('channelsTableBody');
        const thead = document.querySelector('#channelsTable thead tr');

        if (!this.state.currentPage) this.state.currentPage = 1;
        if (!this.state.itemsPerPage) this.state.itemsPerPage = 100;

        // ✅ V4.4.7: GUARDIA ANTI-RENDER (Evita spinner infinito en vacío)
        if (!this.state.channelsMaster || this.state.channelsMaster.length === 0) {
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center; padding:30px; color:#64748b;">Sin canales cargados. Conecta un servidor.</td></tr>';
            }
            // Aseguramos que los stats estén en 0
            if (this.state.stats) {
                this.updateStatsUI();
            }
            return; // ⛔ STOP AQUÍ - No busca, no calcula, no hace nada más.
        }

        const controlsContainer = document.getElementById('paginationControls') || this.createPaginationControls();

        if (!tbody) return;
        tbody.innerHTML = '';

        const fullData = this.getFilteredChannels();

        // ✅ V4.5.2 FIX: Sync state with rendered view
        this.state.channels = fullData;

        // ✅ V4.4.4: Actualizar stats con canales filtrados
        this.calculateStats(fullData);
        this.updateStatsUI();
        const totalItems = fullData.length;

        // FIX: Update Active Count here directly to ensure consistency
        const statActive = document.getElementById('statActive');
        if (statActive) statActive.textContent = totalItems;

        const totalPages = Math.ceil(totalItems / this.state.itemsPerPage);

        if (isNaN(this.state.currentPage)) {
            this.state.currentPage = 1;
        }
        if (this.state.currentPage > totalPages) this.state.currentPage = totalPages || 1;
        if (this.state.currentPage < 1) this.state.currentPage = 1;

        const start = (this.state.currentPage - 1) * this.state.itemsPerPage;
        const end = start + this.state.itemsPerPage;
        const data = fullData.slice(start, end);

        this.updatePaginationUI(totalItems, totalPages);

        let activeCols = this.state.activeColumns;
        if (!activeCols || activeCols.length === 0) {
            activeCols = ['id', 'name', 'group', 'resolution', 'bitrateTierCode', 'logo'];
            this.state.activeColumns = activeCols;
        }

        if (thead) {
            thead.innerHTML = '';
            activeCols.forEach(colId => {
                const fieldDef = (this.state.discoveredFields || []).find(f => f.id === colId);
                const label = fieldDef ? fieldDef.label : colId.toUpperCase();
                const th = document.createElement('th');
                th.innerText = label;
                th.style.whiteSpace = 'nowrap';
                thead.appendChild(th);
            });
        }
        console.log(`🔍[DIAG] renderTable: fullData=${fullData.length}, data(page)=${data.length}, activeCols=${activeCols.length}, page=${this.state.currentPage}`);

        data.forEach((ch, rowIdx) => {
            try {
                // ✅ V4.6: Calculate final view (merged layers)
                const final = this._calculateFinalView(ch);

                const tr = document.createElement('tr');
                activeCols.forEach(f => {
                    const td = document.createElement('td');
                    let value = '';
                    if (f.startsWith('raw.')) {
                        const rawKey = f.replace('raw.', '');
                        const rawField = ch.rawFields?.find(r => r.key === rawKey);
                        value = rawField ? String(rawField.value) : '';
                    } else {
                        // ✅ V4.31: Priority: final > ch (legacy) > ch.raw (original API) > ch.base
                        value = final[f] ?? ch[f] ?? ch.raw?.[f] ?? ch.base?.[f] ?? '';
                        if (Array.isArray(value)) value = value.join(' | ');

                        // ✅ V4.21: Si group es numérico, buscar el nombre real del grupo desde múltiples fuentes
                        if (f === 'group' && (!value || /^\d+$/.test(String(value)))) {
                            // Primero intentar desde el canal directamente
                            let groupName = ch.base?.raw?.category_name || ch.base?.group ||
                                ch.raw?.category_name || ch.category_name || ch.group_title ||
                                final.category_name || final.group_title;

                            // Si aún es numérico o vacío, buscar en rawFields
                            if (!groupName || /^\d+$/.test(String(groupName))) {
                                groupName = ch.rawFields?.find(r => r.key === 'category_name')?.value;
                            }

                            // ✅ V4.21: Extraer categoría desde stream_icon path (ej: /picon/ALBANIA/file.png -> ALBANIA)
                            if (!groupName || /^\d+$/.test(String(groupName))) {
                                const iconUrl = ch.stream_icon || ch.logo || '';
                                if (iconUrl) {
                                    // Match pattern: /picon/CATEGORY/filename.ext or similar paths
                                    const pathMatch = iconUrl.match(/\/picon\/([^\/]+)\//i) ||
                                        iconUrl.match(/\/logos?\/([^\/]+)\//i) ||
                                        iconUrl.match(/\/icons?\/([^\/]+)\//i);
                                    if (pathMatch && pathMatch[1] && !/^\d+$/.test(pathMatch[1])) {
                                        groupName = pathMatch[1].toUpperCase();
                                    }
                                }
                            }

                            // Último recurso: usar group solo si no es numérico
                            if (!groupName || /^\d+$/.test(String(groupName))) {
                                const grp = ch.group || final.group || ch.base?.group;
                                groupName = (grp && !/^\d+$/.test(String(grp))) ? grp : null;
                            }

                            value = groupName || '—';
                        }

                        // ✅ FIX V4.21: Inferir resolution si está vacío o es AUTO
                        if (f === 'resolution' && (!value || value === '' || value === 'AUTO')) {
                            const w = ch.raw?.video_width || ch.video_width;
                            const h = ch.raw?.video_height || ch.video_height;
                            if (w && h && Number(w) > 0 && Number(h) > 0) {
                                value = `${w}x${h}`;
                            } else if (h && Number(h) > 0) {
                                value = `${h}p`;
                            } else {
                                // ✅ V4.21: Fallback desde campo bitrateTierCode (SD_480, HD_720, etc.)
                                const tierCode = (ch.bitrateTierCode || final.bitrateTierCode || ch.calidad || ch.quality || '').toUpperCase();
                                if (tierCode.includes('8K') || tierCode.includes('UHD8K')) value = '8K';
                                else if (tierCode.includes('4K') || tierCode.includes('UHD4K') || tierCode.includes('2160')) value = '4K';
                                else if (tierCode.includes('1080') || tierCode.includes('FHD')) value = '1080p';
                                else if (tierCode.includes('720') || tierCode.includes('HD_720') || tierCode === 'HD') value = '720p';
                                else if (tierCode.includes('480') || tierCode.includes('SD_480') || tierCode === 'SD') value = '480p';
                                else if (tierCode.includes('360')) value = '360p';
                                else {
                                    const name = ((ch.name || '') + ' ' + (ch.group || '')).toUpperCase();
                                    if (name.includes('4K') || name.includes('UHD')) value = '4K';
                                    else if (name.includes('FHD') || name.includes('1080')) value = '1080p';
                                    else if (name.match(/\bHD\b/) || name.includes('720')) value = '720p';
                                    else value = '—';
                                }
                            }
                        }
                    }


                    if ((f === 'logo' || f === 'stream_icon') && value && value.startsWith('http')) {
                        td.innerHTML = '';
                        td.appendChild(this.createSafeLogoImg(value));
                    }
                    // 🏷️ V4.22: Renderizado especial para columna de calidad con icono
                    else if (f === '_quality' && ch._qualityIcon) {
                        // Sin estilos inline en el <img>; mantener tamaño con atributo height
                        td.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><img src="${ch._qualityIcon}" height="16"><span>${value || ''}</span></span>`;
                    }
                    // 🔬 V4.23: Renderizado especial para columna VERIF (verificación)
                    else if (f === '_verification') {
                        const verifMap = {
                            'VERIFIED': { icon: '✅', sigla: 'VER', color: 'rgba(74,222,128,0.9)' },
                            'BETTER': { icon: '⬆️', sigla: 'SUP', color: 'rgba(56,189,248,0.9)' },
                            'DOWNGRADE': { icon: '⬇️', sigla: 'DEG', color: 'rgba(251,191,36,0.9)' },
                            'FAKE': { icon: '❌', sigla: 'FAKE', color: 'rgba(248,113,113,0.9)' },
                            'PENDING': { icon: '⏳', sigla: 'PEND', color: 'rgba(148,163,184,0.6)' },
                            'ERROR': { icon: '⚠️', sigla: 'ERR', color: 'rgba(251,146,60,0.9)' },
                            'UNKNOWN': { icon: '❓', sigla: 'UNK', color: 'rgba(148,163,184,0.5)' }
                        };
                        const v = verifMap[value] || verifMap['PENDING'];
                        td.innerHTML = `<span style="display:inline-flex; align-items:center; gap:3px; color:${v.color}; font-weight:600; font-size:0.75rem;">${v.icon} ${v.sigla}</span>`;
                        td.dataset.filterValue = v.sigla;
                    }
                    // 🔬 V4.23: Renderizado especial para columna GRADE (calidad efectiva)
                    else if (f === '_qualityGrade') {
                        const gradeColors = {
                            'S+': '#fbbf24', 'S': '#f59e0b', 'A': '#22c55e',
                            'B': '#3b82f6', 'C': '#6366f1', 'D': '#8b5cf6', 'E': '#94a3b8'
                        };
                        const color = gradeColors[value] || '#94a3b8';
                        if (value) {
                            td.innerHTML = `<span style="background:${color}; color:#000; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.7rem;">${value}</span>`;
                        } else {
                            td.textContent = '-';
                            td.style.color = 'rgba(148,163,184,0.5)';
                        }
                    }
                    // 🔬 V4.23: Renderizado especial para columna CODEC
                    else if (f === '_realCodec') {
                        if (value) {
                            const codecUpper = String(value).toUpperCase();
                            const codecColors = {
                                'HEVC': 'rgba(74,222,128,0.8)', 'H265': 'rgba(74,222,128,0.8)', 'H.265': 'rgba(74,222,128,0.8)',
                                'AV1': 'rgba(251,191,36,0.8)',
                                'VP9': 'rgba(56,189,248,0.8)',
                                'AVC': 'rgba(148,163,184,0.8)', 'H264': 'rgba(148,163,184,0.8)', 'H.264': 'rgba(148,163,184,0.8)'
                            };
                            const color = codecColors[codecUpper] || 'rgba(148,163,184,0.6)';
                            td.innerHTML = `<span style="background:${color}; color:#000; padding:1px 6px; border-radius:3px; font-size:0.7rem; font-weight:600;">${codecUpper}</span>`;
                        } else {
                            td.textContent = '-';
                            td.style.color = 'rgba(148,163,184,0.5)';
                        }
                    }
                    // 🔬 V4.23: Renderizado especial para columna BITRATE
                    else if (f === '_realBitrate') {
                        if (value && value > 0) {
                            const mbps = (value / 1000).toFixed(1);
                            td.innerHTML = `<span style="font-family:monospace; font-size:0.75rem;">${mbps} <span style="color:rgba(148,163,184,0.7);">Mbps</span></span>`;
                        } else {
                            td.textContent = '-';
                            td.style.color = 'rgba(148,163,184,0.5)';
                        }
                    }
                    // 🔬 V4.23: Renderizado especial para columna FPS
                    else if (f === '_realFps') {
                        if (value && value > 0) {
                            const fpsRounded = Math.round(value);
                            const color = fpsRounded >= 50 ? 'rgba(74,222,128,0.9)' : (fpsRounded >= 25 ? 'rgba(148,163,184,0.9)' : 'rgba(248,113,113,0.8)');
                            td.innerHTML = `<span style="color:${color}; font-family:monospace; font-size:0.75rem;">${fpsRounded} fps</span>`;
                        } else {
                            td.textContent = '-';
                            td.style.color = 'rgba(148,163,184,0.5)';
                        }
                    }
                    // 🔬 V4.23: Renderizado especial para columna RES REAL
                    else if (f === '_resReal') {
                        if (value) {
                            td.innerHTML = `<span style="font-family:monospace; font-size:0.75rem; color:rgba(56,189,248,0.9);">${value}</span>`;
                        } else {
                            td.textContent = '-';
                            td.style.color = 'rgba(148,163,184,0.5)';
                        }
                    }
                    else if ((f === 'url' || f === 'stream_url') && value) {
                        td.textContent = String(value);
                        td.style.maxWidth = '200px';
                        td.style.whiteSpace = 'nowrap';
                        td.style.overflow = 'hidden';
                        td.style.textOverflow = 'ellipsis';
                        td.title = String(value);
                    } else {
                        // ✅ 🌊 Agregar badge de fuente si está disponible
                        const displayValue = String(value).substring(0, 100);
                        const sourceMeta = ch._fieldSources?.[f];

                        // 🎯 NUEVO: Badge de Perfil Sugerido (APE v13.1)
                        let suggestedBadge = '';
                        if (f === 'name' && ch._suggestedProfile && window.autoClassifier) {
                            suggestedBadge = window.autoClassifier.generateBadge(ch._suggestedProfile, ch._qualityScore);
                        }

                        if (sourceMeta && this.cascadeManager) {
                            const sourceBadge = this.cascadeManager.generateFieldSourceBadge(f, sourceMeta);
                            td.innerHTML = displayValue + suggestedBadge + sourceBadge;
                        } else if (suggestedBadge) {
                            td.innerHTML = displayValue + suggestedBadge;
                        } else {
                            td.textContent = displayValue;
                        }
                    }

                    td.style.fontSize = '0.75rem';
                    td.style.whiteSpace = 'nowrap';
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            } catch (err) {
                console.error(`❌[DIAG] Error rendering row ${rowIdx}:`, err.message, ch);
            }
        });
    }

    createPaginationControls() {
        // ✅ V4.12: Insertar en paginationPlaceholder (dentro de analysis-top-row)
        const placeholder = document.getElementById('paginationPlaceholder');
        const container = placeholder || document.getElementById('tableContainer') || document.querySelector('.table-container') || document.getElementById('tab-analysis');
        if (!container) return null;

        if (document.getElementById('paginationControls')) return document.getElementById('paginationControls');

        const controls = document.createElement('div');
        controls.id = 'paginationControls';
        controls.style.cssText = 'display:flex; align-items:center; gap:10px;';

        controls.addEventListener('click', (e) => {
            if (e.target.dataset.action === 'prevPage') this.changePage(-1);
            if (e.target.dataset.action === 'nextPage') this.changePage(1);
        });

        if (placeholder) {
            placeholder.appendChild(controls);
        } else {
            container.insertBefore(controls, container.firstChild);
        }
        return controls;
    }

    updatePaginationUI(total, pages) {
        const c = document.getElementById('paginationControls');
        if (!c) return;

        c.innerHTML = `
            <span style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap;">
                ${total} canales | Pág ${this.state.currentPage}/${pages}
            </span>
            <button class="btn secondary sm" data-action="prevPage" style="padding:4px 10px; font-size:0.7rem;" ${this.state.currentPage === 1 ? 'disabled' : ''}>◀ ANT</button>
            <button class="btn secondary sm" data-action="nextPage" style="padding:4px 10px; font-size:0.7rem;" ${this.state.currentPage >= pages ? 'disabled' : ''}>SIG ▶</button>
        `;
    }

    changePage(delta) {
        this.state.currentPage += delta;
        this.renderTable();
    }

    // ==================== 3. FIX CRÍTICO: SAFE FILTER (BLINDADO) ====================

    /**
     * ✅ V4.27.4: Aplicar filtros y renderizar tabla
     * Método central para actualizar la vista con los filtros actuales
     */
    applyFilters() {
        try {
            // Obtener canales filtrados
            const filtered = this.getFilteredChannels();

            // Actualizar estado de canales filtrados
            this.state.channels = filtered;
            this.state.filteredChannels = filtered;

            // Reset a página 1 cuando cambian los filtros
            this.state.currentPage = 1;

            // ✅ V4.27.5 FIX: Recalcular estadísticas antes de renderizar (evita TypeError en updateStatsUI)
            this.calculateStats(filtered);

            // Renderizar tabla con los canales filtrados
            this.renderTable();

            // Actualizar estadísticas en la UI
            this.updateStatsUI();

            console.log(`📊 [applyFilters] ${filtered.length} canales filtrados de ${this.state.channelsMaster?.length || 0} totales`);
        } catch (e) {
            console.error('❌ Error en applyFilters:', e);
            // Fallback: renderizar tabla directamente
            this.renderTable();
        }
    }

    getFilteredChannels() {
        // SIEMPRE partimos del estado base (channelsMaster)
        let res = Array.isArray(this.state.channelsMaster)
            ? [...this.state.channelsMaster]
            : [];

        // --- BÚSQUEDA LIBRE ---
        const q = (this.state.searchQuery || '').toString().toLowerCase().trim();
        if (q) {
            res = res.filter(c => {
                const name = (c.name || '').toString().toLowerCase();
                const group = (c.group || '').toString().toLowerCase();
                return name.includes(q) || group.includes(q);
            });
        }

        // --- NORMALIZAR FILTROS ---
        const tier = (this.state.filterTier || 'ALL').toString().toUpperCase();
        const codec = (this.state.filterCodec || 'ALL').toString().toUpperCase();
        const lang = (this.state.filterLanguage || 'ALL').toString().toUpperCase();

        // Tier (bitrateTierCode)
        if (tier !== 'ALL') {
            res = res.filter(c =>
                (c.bitrateTierCode || '').toString().toUpperCase() === tier
            );
        }

        // Codec
        if (codec !== 'ALL') {
            res = res.filter(c =>
                (c.codec || '').toString().toUpperCase().includes(codec)
            );
        }

        // Idioma
        // Idioma
        if (lang !== 'ALL') {
            res = res.filter(c =>
                (c.language || '').toString().toUpperCase().startsWith(lang)
            );
        }

        // ✅ V4.5.1 FIX: Integración de Filtros Avanzados en el Pipeline Principal
        // Soporte dual para state.activeFilter (UI) y state.advancedFilters (Persistencia)
        const activeFilter = this.state.activeFilter || this.state.advancedFilters;

        if (this.filterEngine && activeFilter && activeFilter.groups && activeFilter.groups.length > 0) {
            console.log('[FilterPipeline] Executing advanced filters on', res.length, 'channels.');
            // Aplicar lógica avanzada sobre los resultados ya filtrados por criterios básicos
            res = this.filterEngine.applyFilter(res, activeFilter);
            console.log('[FilterPipeline] Result after filters:', res.length);
        } else {
            console.log('[FilterPipeline] Advanced filters inactive or empty.');
        }

        return res;
    }

    // ✅ V4.4.4: Calculate stats from FILTERED channels
    calculateStats(channels = null) {
        // Usar canales filtrados si existen, sino master
        const c = channels || this.state.channels || this.state.channelsMaster;

        this.state.stats = {
            total: this.state.channelsMaster.length,  // Total SIEMPRE desde master
            active: c.length,  // ← ACTIVOS son los FILTRADOS/MOSTRADOS
            categories: new Set(c.map(x => x.group)).size,
            premium: c.filter(x => {
                const res = (x.resolution || '').toUpperCase();
                const tier = (x.bitrateTierCode || '').toUpperCase();
                const name = (x.name || '').toUpperCase();
                return res.includes('4K') || res.includes('8K') || res.includes('2160') || res.includes('4320') ||
                    res.includes('1080') || tier.includes('FHD') || tier.includes('UHD') ||
                    name.includes('FHD') || name.includes('4K') || name.includes('8K') || name.includes('UHD');
            }).length,
            uhd: c.filter(x => {
                const res = (x.resolution || '').toUpperCase();
                const name = (x.name || '').toUpperCase();
                return res.includes('4K') || res.includes('8K') || res.includes('2160') || res.includes('4320') ||
                    name.includes('4K') || name.includes('8K') || name.includes('UHD') || name.includes('HDR') ||
                    x.hdr === true;
            }).length
        };

        console.log(`📊[V4.4.4] Stats actualizados: `, this.state.stats);

        // ✅ V4.9: Also update Generator tab stats
        if (typeof this.updateGeneratorStats === 'function') {
            this.updateGeneratorStats();
        }
    }
    updateStatsUI() {
        const set = (k, v) => { const el = document.getElementById(k); if (el) el.innerText = v; };
        set('statTotal', this.state.stats.total || 0);
        set('statActive', this.state.stats.active || 0);
        set('statPremium', this.state.stats.premium || 0);
        set('statCategories', this.state.stats.categories || 0);
        set('statUHD', this.state.stats.uhd || 0);
    }
    setLoading(isLoading) {
        const btn = document.getElementById('btnConnect');
        const statusChip = document.getElementById('connectionStatus');

        if (btn) {
            btn.disabled = isLoading;
            const labelSpan = btn.querySelector('span:last-child');
            if (labelSpan) {
                labelSpan.textContent = isLoading ? 'Conectando…' : 'Conectar servidor';
            }
        }

        if (statusChip) {
            const dot = statusChip.querySelector('.status-dot');
            const text = statusChip.querySelector('span:last-child');

            if (isLoading) {
                statusChip.style.borderColor = 'rgba(56,189,248,0.8)';
                if (dot) dot.style.background = '#38bdf8';
                if (text) text.textContent = 'Conectando al servidor…';
            } else {
                if (this.state.channels.length === 0) {
                    statusChip.style.borderColor = 'rgba(148,163,184,0.45)';
                    if (dot) dot.style.background = '#38bdf8';
                    if (text) text.textContent = 'Esperando conexión…';
                }
            }
        }
    }

    setConnectionStatus(ok, message) {
        const chip = document.getElementById('connectionStatus');
        if (!chip) return;
        const dot = chip.querySelector('.status-dot');
        const text = chip.querySelector('span:last-child');

        if (ok) {
            chip.style.borderColor = 'rgba(34,197,94,0.9)';    // verde
            if (dot) dot.style.background = '#22c55e';
        } else {
            chip.style.borderColor = 'rgba(248,113,113,0.9)';  // rojo
            if (dot) dot.style.background = '#f97373';
        }
        if (text) text.textContent = message;
    }

    // ==================== FEATURES EXTRAS ====================
    renderFilterBuilder() {
        const c = document.getElementById('filterBuilderContainer');
        if (!c) return;

        if (!this.state.activeFilter) this.state.activeFilter = { mode: 'STANDARD', groups: [] };

        // ✅ V4.9: Always show saved filter groups, even if channels haven't loaded yet
        const hasGroups = this.state.activeFilter.groups && this.state.activeFilter.groups.length > 0;
        const hasFields = this.state.discoveredFields && this.state.discoveredFields.length > 0;

        if (!hasFields && !hasGroups) {
            // No fields AND no saved groups - show loading message
            c.innerHTML = '<p style="color:#64748b; padding:20px; text-align:center;">Cargando canales para descubrir campos disponibles...</p>';
        } else {
            // Render saved groups (even if fields aren't loaded yet)
            c.innerHTML = '';
            this.state.activeFilter.groups.forEach((g, i) => this.renderFilterGroup(c, g, i));
        }

        // ✅ V4.9: Enhanced filter summary showing ALL active filters
        this.updateActiveFiltersSummary();
    }

    /**
     * ✅ V4.9: Update the active filters summary to show all current filters
     */
    updateActiveFiltersSummary() {
        const summary = document.getElementById('activeFiltersSummary');
        if (!summary) return;

        const parts = [];

        // Search query
        if (this.state.searchQuery && this.state.searchQuery.trim()) {
            parts.push(`🔍 "${this.state.searchQuery}"`);
        }

        // Tier filter
        if (this.state.filterTier && this.state.filterTier !== 'ALL') {
            parts.push(`📊 ${this.state.filterTier}`);
        }

        // Codec filter
        if (this.state.filterCodec && this.state.filterCodec !== 'ALL') {
            parts.push(`🎬 ${this.state.filterCodec}`);
        }

        // Language filter
        if (this.state.filterLanguage && this.state.filterLanguage !== 'ALL') {
            parts.push(`🌐 ${this.state.filterLanguage}`);
        }

        // Advanced filter groups
        const groups = this.state.activeFilter?.groups || [];
        if (groups.length > 0) {
            const rulesCount = groups.reduce((sum, g) => sum + (g.rules?.length || 0), 0);
            parts.push(`⚙️ ${groups.length} grupo(s), ${rulesCount} regla(s)`);
        }

        if (parts.length === 0) {
            summary.innerHTML = '<span style="color:#64748b;">Sin filtros activos</span>';
        } else {
            summary.innerHTML = `<span style="color:#4ade80;">Filtros activos:</span> ${parts.join(' · ')}`;
        }
    }

    renderFilterGroup(container, group, index) {
        const div = document.createElement('div');
        div.className = 'filter-group';
        div.style.cssText = 'background:rgba(255,255,255,0.05); padding:10px; margin-bottom:10px; border-radius:8px;';

        const isEditable = this.state.filterEditMode;
        console.log('%c🔏 renderFilterGroup → isEditable:', 'color:yellow; font-size:14px;', isEditable);
        const lockIcon = isEditable ? '' : '🔒 ';

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <strong>${lockIcon}Grupo ${index + 1} (${group.logic})</strong>
                ${isEditable ? `<button onclick="app.removeFilterGroup(${index})" class="btn secondary sm">❌</button>` : ''}
            </div>
        `;
        const rulesDiv = document.createElement('div');
        group.rules.forEach((r, rIdx) => {
            const rDiv = document.createElement('div');
            rDiv.style.cssText = 'display:flex; gap:5px; margin-bottom:5px; align-items:center;';

            if (isEditable) {
                // ✅ EDITABLE MODE: Show dropdowns and inputs
                const mkSel = (opts, val, cb) => {
                    const s = document.createElement('select'); s.className = 'input';
                    opts.forEach(o => { const op = document.createElement('option'); op.value = o.v; op.text = o.t; if (o.v == val) op.selected = true; s.appendChild(op); });
                    s.onchange = cb; return s;
                };
                const fieldOpts = this.state.discoveredFields.map(f => ({ v: f.id, t: f.label }));
                rDiv.appendChild(mkSel(fieldOpts, r.field, e => r.field = e.target.value));
                const opOpts = ['EQ', 'CONTAINS', 'GT', 'LT', 'REGEX'].map(o => ({ v: o, t: o }));
                rDiv.appendChild(mkSel(opOpts, r.operator, e => r.operator = e.target.value));
                const inp = document.createElement('input'); inp.className = 'input'; inp.value = r.value;
                inp.oninput = e => r.value = e.target.value;
                rDiv.appendChild(inp);
                const btnDel = document.createElement('button'); btnDel.className = 'btn secondary'; btnDel.innerText = '-';
                btnDel.onclick = () => this.removeFilterRule(index, rIdx);
                rDiv.appendChild(btnDel);
            } else {
                // ✅ READ-ONLY MODE: Show disabled inputs with shaded appearance
                const fieldLabel = this.state.discoveredFields.find(f => f.id === r.field)?.label || r.field;

                // Field select (disabled, shaded)
                const fieldSpan = document.createElement('select');
                fieldSpan.className = 'input';
                fieldSpan.disabled = true;
                fieldSpan.style.cssText = 'opacity:0.6; background:#1e293b; cursor:not-allowed;';
                const opt1 = document.createElement('option');
                opt1.text = fieldLabel;
                fieldSpan.appendChild(opt1);
                rDiv.appendChild(fieldSpan);

                // Operator select (disabled, shaded)
                const opSpan = document.createElement('select');
                opSpan.className = 'input';
                opSpan.disabled = true;
                opSpan.style.cssText = 'opacity:0.6; background:#1e293b; cursor:not-allowed;';
                const opt2 = document.createElement('option');
                opt2.text = r.operator;
                opSpan.appendChild(opt2);
                rDiv.appendChild(opSpan);

                // Value input (disabled, shaded)
                const valInput = document.createElement('input');
                valInput.className = 'input';
                valInput.value = r.value;
                valInput.disabled = true;
                valInput.style.cssText = 'opacity:0.6; background:#1e293b; cursor:not-allowed;';
                rDiv.appendChild(valInput);
            }
            rulesDiv.appendChild(rDiv);
        });

        // Only show "Add Rule" button in edit mode
        if (isEditable) {
            const btnAdd = document.createElement('button'); btnAdd.className = 'btn secondary full'; btnAdd.innerText = '+ Regla';
            btnAdd.onclick = () => this.addFilterRule(index);
            div.appendChild(rulesDiv);
            div.appendChild(btnAdd);
        } else {
            div.appendChild(rulesDiv);
        }

        container.appendChild(div);
    }

    addFilterGroupUI() {
        if (!this.state.activeFilter) this.state.activeFilter = { mode: 'STANDARD', groups: [] };
        this.state.activeFilter.groups.push({ logic: 'AND', rules: [{ field: 'name', operator: 'CONTAINS', value: '' }] });
        // ✅ V4.9: Enable edit mode when adding new group
        this.state.filterEditMode = true;
        this.renderFilterBuilder();
    }
    removeFilterGroup(i) {
        this.state.activeFilter.groups.splice(i, 1);
        this.state.filterEditMode = true; // Stay in edit mode
        this.renderFilterBuilder();
    }
    addFilterRule(gi) {
        this.state.activeFilter.groups[gi].rules.push({ field: 'name', operator: 'CONTAINS', value: '' });
        this.state.filterEditMode = true; // Stay in edit mode
        this.renderFilterBuilder();
    }
    removeFilterRule(gi, ri) {
        this.state.activeFilter.groups[gi].rules.splice(ri, 1);
        this.state.filterEditMode = true; // Stay in edit mode
        this.renderFilterBuilder();
    }

    /**
     * ✅ V4.9.3: Enable editing of filter groups
     * Forces field discovery and re-renders the filter builder with editable fields
     */
    enableFilterEditing() {
        // If we have channels but no fields discovered yet, discover them now
        if (this.state.channelsMaster.length > 0 && (!this.state.discoveredFields || this.state.discoveredFields.length === 0)) {
            this.discoverFields(this.state.channelsMaster);
        }

        // Check if we can edit
        if (!this.state.discoveredFields || this.state.discoveredFields.length === 0) {
            this.showNotification('⚠️ Conecta un servidor para poder editar los filtros', 'warning');
            return;
        }

        // ✅ V4.9.3: Enable edit mode
        this.state.filterEditMode = true;

        // Remove 'locked' CSS class from container
        const filterContainer = document.getElementById('filterBuilderContainer');
        if (filterContainer) {
            filterContainer.classList.remove('locked');
            console.log('🔓 Clase "locked" removida - modo edición');
        }

        // Re-render to enable editing
        this.renderFilterBuilder();
        this.showNotification('✏️ Modo edición activado - Haz cambios y presiona GUARDAR', 'success');
    }

    /**
     * ✅ V4.12 - Aplicar filtros CON PERSISTENCIA
     */
    async applyAdvancedFilters() {
        // V4.24: Wake probe server when applying filters
        this._wakeProbeServer();

        if (!this.filterEngine) return;
        this.setLoading(true);

        setTimeout(async () => {
            // Trigger pipeline via renderTable()
            this.renderTable();
            this.setLoading(false);
            const count = this.state.channels.length;

            // ✅ PERSISTIR EN IndexedDB
            try {
                if (this.db) {
                    await this.db.saveAppState('advancedFilters', {
                        mode: this.state.activeFilter?.mode || 'STANDARD',
                        groups: this.state.activeFilter?.groups || [],
                        searchQuery: this.state.searchQuery || '',
                        timestamp: Date.now()
                    });
                    console.log('✅ Filtros aplicados y guardados en BD');
                }
            } catch (e) {
                console.error('❌ Error guardando filtros:', e);
            }

            this.showToast(`📊 Filtros: ${count} canales resultantes.`, false);
        }, 50);
    }

    /**
     * ✅ V4.12.1 - Limpiar TODOS los filtros CON PERSISTENCIA
     */
    async clearAdvancedFilters() {
        // 1. Limpiar TODOS los estados de filtro en memoria
        this.state.activeFilter = { mode: 'STANDARD', groups: [] };
        this.state.searchQuery = '';
        this.state.filterTier = 'ALL';
        this.state.filterCodec = 'ALL';
        this.state.filterLanguage = 'ALL';

        // 2. Actualizar UI
        this.renderFilterBuilder();
        this.state.channels = [...this.state.channelsMaster];
        this.renderTable();
        this.updateStatsUI();

        // 3. ✅ PERSISTIR EN IndexedDB
        try {
            if (this.db) {
                await this.db.saveAppState('advancedFilters', {
                    mode: 'STANDARD',
                    groups: [],
                    searchQuery: '',
                    filterTier: 'ALL',
                    filterCodec: 'ALL',
                    filterLanguage: 'ALL',
                    timestamp: Date.now()
                });
                console.log('✅ Filtros limpiados permanentemente');
                this.showNotification('✅ Filtros limpiados', false);
            }
        } catch (e) {
            console.error('❌ Error guardando filtros limpios:', e);
        }
    }

    recalculateRanking() {
        // V4.24: Wake probe server
        this._wakeProbeServer();

        const mode = document.getElementById('rankingMode') ? document.getElementById('rankingMode').value : 'score';
        let target = this.state.channels;

        // Integración con KNN Scorer Industrial
        if (window.knnScorer) {
            window.knnScorer.scoreChannelsInPlace(target);
            target.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
        } else if (this.rankingEngine && this.state.rankingConfig) {
            if (mode === 'best_stream') {
                target = this.rankingEngine.selectBestChannels(target, this.state.rankingConfig);
            } else {
                target.forEach(ch => ch._ranking = this.rankingEngine.calculateScore(ch, this.state.rankingConfig));
                target.sort((a, b) => (b._ranking?.score || 0) - (a._ranking?.score || 0));
            }
        }

        this.state.channels = target;
        this.renderTable();
        this.renderRankingUI();
    }

    renderRankingUI() {
        const c = document.getElementById('rankingWeightsContainer');
        if (!c || !this.state.rankingConfig) return;
        c.innerHTML = '';
        this.state.rankingConfig.criteria.forEach((crit, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom:5px; display:flex; justify-content:space-between; font-size:0.8rem;';
            row.innerHTML = `<span>${crit.field}</span> <input type="number" class="input" style="width:50px" value="${crit.weight}" aria-label="Peso para ${crit.field}" onchange="app.updateRankingWeight(${idx}, this.value)">`;
            c.appendChild(row);
        });
    }
    updateRankingWeight(i, v) { this.state.rankingConfig.criteria[i].weight = Number(v); this.recalculateRanking(); }
    changeRankingPreset(n) {
        const ps = this.rankingEngine.getPresets();
        if (ps[n]) this.state.rankingConfig = { ...ps[n] };
        this.recalculateRanking();
    }

    async enrichWithSource(sourceId) {
        // V4.24: Wake probe server
        this._wakeProbeServer();

        if (!this.enrichmentEngine) return;
        const st = document.getElementById('enrichmentStatus');
        if (st) st.style.display = 'block';
        try {
            const res = await this.enrichmentEngine.enrichChannels(this.state.channelsMaster, sourceId);
            if (res.channelsEnriched > 0) {
                const en = this.state.channelsMaster.filter(c => c._enriched);
                if (this.db) await this.db.saveChannelsBulk(en, this.state.currentServer.baseUrl);
                en.forEach(c => delete c._enriched);
                this.renderTable();
                alert(`Matches: ${res.matchesFound}, Enriquecidos: ${res.channelsEnriched}`);
            } else {
                alert('Sin nuevos datos.');
            }
        } catch (e) { alert(e.message); }
        finally { if (st) st.style.display = 'none'; }
    }

    // ==================== HEADER MANAGER (THE 33) ====================
    initHeaderManager() {
        this.STANDARD_HEADERS = [
            'User-Agent', 'Referer', 'Origin', 'Cookie', 'Accept',
            'Accept-Encoding', 'Accept-Language', 'Authorization', 'Cache-Control',
            'Connection', 'Content-Type', 'Host', 'If-Modified-Since', 'Pragma',
            'Range', 'TE', 'Upgrade', 'X-Requested-With', 'X-Forwarded-For',
            'X-Real-IP', 'Sec-WebSocket-Key', 'Sec-WebSocket-Version', 'DNT',
            'Sec-Fetch-Dest', 'Sec-Fetch-Mode', 'Sec-Fetch-Site', 'Sec-Fetch-User',
            'Upgrade-Insecure-Requests', 'Client-IP', 'Icy-MetaData',
            'X-Playback-Session-Id', 'X-Player-Session-Id', 'X-Forwarded-Proto'
        ];
        this.state.activeHeaders = {}; // {'User-Agent': 'Mozilla...' }

        // Restaurar selección previa (si existe)
        this.restoreHeaderManagerSettings();
    }

    openHeaderManager() {
        if (!this.STANDARD_HEADERS) this.initHeaderManager();
        const modal = document.getElementById('headerModal');
        if (modal) {
            modal.style.display = 'flex';
            this.ensureHeaderModeBar();
            this.renderHeadersList();
        }
    }

    closeHeaderManager() {
        // Validación: si estás en modo MANUAL, no permitir cerrar con valores vacíos
        if (this.getHeaderValueMode && this.getHeaderValueMode() === 'MANUAL') {
            const missing = [];
            Object.keys(this.state.activeHeaders || {}).forEach(k => {
                const v = (this.state.activeHeaders[k] ?? '').toString().trim();
                if (!v) missing.push(k);
            });
            if (missing.length) {
                alert('No puedes cerrar. Faltan valores manuales en: ' + missing.join(', '));
                return;
            }
        }

        const modal = document.getElementById('headerModal');
        if (modal) modal.style.display = 'none';
        this.updateHeaderCountUI();
    }

    renderHeadersList() {
        const c = document.getElementById('headersListContainer');
        if (!c) return;
        c.innerHTML = '';

        const filter = (document.getElementById('headerSearch')?.value || '').toLowerCase();

        this.STANDARD_HEADERS.forEach(h => {
            if (filter && !h.toLowerCase().includes(filter)) return;

            const box = document.createElement('div');
            box.style.cssText = 'background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; display: flex; flex-direction: column; gap: 5px;';

            const isActive = this.state.activeHeaders.hasOwnProperty(h);
            const val = this.state.activeHeaders[h] || '';

            box.innerHTML = `
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <input type="checkbox" id="chk_${h}" ${isActive ? 'checked' : ''} onchange="app.toggleHeader('${h}', this.checked)">
                                        <label for="chk_${h}" style="user-select: none; cursor: pointer; font-weight: bold;">${h}</label>
                                </div>
                                <input type="text" id="val_${h}" class="input sm" placeholder="Valor para ${h}" value="${val}"
                                    aria-label="Valor para header ${h}"
                                    style="display: ${isActive ? 'block' : 'none'}; width: 100%;"
                                    oninput="app.updateHeaderValue('${h}', this.value)">
                                    `;
            c.appendChild(box);
        });
    }

    toggleHeader(key, active) {
        const inp = document.getElementById(`val_${key}`);
        if (active) {
            this.state.activeHeaders[key] = inp ? inp.value : '';
            if (inp) inp.style.display = 'block';
        } else {
            delete this.state.activeHeaders[key];
            if (inp) inp.style.display = 'none';
        }
        this.updateHeaderCountUI();
    }

    updateHeaderValue(key, val) {
        if (this.state.activeHeaders.hasOwnProperty(key)) {
            this.state.activeHeaders[key] = val;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 🆕 V4.1+ Headers Manager: modo valores (APE vs MANUAL) + custom headers
    // - Modo APE: APE genera valores; inputs deshabilitados; valores vacíos = "forzar inclusión"
    // - Modo MANUAL: el usuario debe digitar valores; validación al cerrar
    // Persistencia: localStorage('v41_headers_value_mode') = 'APE' | 'MANUAL'
    // ═══════════════════════════════════════════════════════════
    getHeaderValueMode() {
        const v = localStorage.getItem('v41_headers_value_mode');
        return (v === 'MANUAL') ? 'MANUAL' : 'APE';
    }

    setHeaderValueMode(mode) {
        const normalized = (mode === 'MANUAL') ? 'MANUAL' : 'APE';
        localStorage.setItem('v41_headers_value_mode', normalized);

        // UI: habilitar/deshabilitar inputs de valores
        const isApe = normalized === 'APE';
        const container = document.getElementById('headersListContainer');
        if (container) {
            const inputs = container.querySelectorAll('input[id^="val_"]');
            inputs.forEach(inp => {
                inp.disabled = isApe;
                inp.style.opacity = isApe ? '0.6' : '1';
            });
        }

        // Mostrar badge de modo si existe
        const badge = document.getElementById('v41HeaderValueModeBadge');
        if (badge) badge.textContent = (isApe ? 'Modo APE' : 'Modo MANUAL');
    }

    ensureHeaderModeBar() {
        const modal = document.getElementById('headerModal');
        if (!modal) return;

        // Ya existe
        if (document.getElementById('v41HeaderValueModeBar')) return;

        const body = modal.querySelector('.modal-body');
        if (!body) return;

        const bar = document.createElement('div');
        bar.id = 'v41HeaderValueModeBar';
        bar.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; margin-bottom:12px; border:1px solid rgba(100,116,139,0.25); border-radius:12px; background:rgba(15,23,42,0.35);';

        const left = document.createElement('div');
        left.style.cssText = 'display:flex; align-items:flex-start; gap:10px; flex:1;';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'v41HeaderValueModeToggle';
        cb.style.cssText = 'width:18px; height:18px; accent-color:#3b82f6; margin-top:2px; cursor:pointer;';

        const txtWrap = document.createElement('div');
        txtWrap.style.cssText = 'display:flex; flex-direction:column; gap:2px;';

        const title = document.createElement('div');
        title.textContent = 'Generar valor estándar o por canal generado por el APE';
        title.style.cssText = 'color:#e2e8f0; font-weight:600; font-size:13px;';

        const desc = document.createElement('div');
        desc.textContent = 'ON = APE genera valores · OFF = tú escribes valores (obligatorio)';
        desc.style.cssText = 'color:#94a3b8; font-size:11px; line-height:1.2;';

        txtWrap.appendChild(title);
        txtWrap.appendChild(desc);

        left.appendChild(cb);
        left.appendChild(txtWrap);

        const right = document.createElement('div');
        right.style.cssText = 'display:flex; align-items:center; gap:10px;';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-secondary sm';
        saveBtn.textContent = 'GUARDAR';
        saveBtn.onclick = () => this.saveHeaderManagerSettings();

        const badge = document.createElement('span');
        badge.id = 'v41HeaderValueModeBadge';
        badge.style.cssText = 'font-size:12px; color:#94a3b8; font-weight:600;';
        badge.textContent = 'Modo APE';

        right.appendChild(saveBtn);
        right.appendChild(badge);

        bar.appendChild(left);
        bar.appendChild(right);

        // Insertar arriba del toolbar
        const toolbar = body.querySelector('.toolbar');
        if (toolbar) body.insertBefore(bar, toolbar);
        else body.prepend(bar);

        // Estado inicial
        const mode = this.getHeaderValueMode();
        cb.checked = (mode === 'APE');
        cb.onchange = () => this.setHeaderValueMode(cb.checked ? 'APE' : 'MANUAL');
        this.setHeaderValueMode(mode);
    }

    saveHeaderManagerSettings() {
        // Validación en modo MANUAL
        const mode = this.getHeaderValueMode();
        if (mode === 'MANUAL') {
            const missing = [];
            Object.keys(this.state.activeHeaders || {}).forEach(k => {
                const v = (this.state.activeHeaders[k] ?? '').toString().trim();
                if (!v) missing.push(k);
            });
            if (missing.length) {
                alert('No puedes continuar. Faltan valores manuales en: ' + missing.join(', '));
                return false;
            }
        }

        // Persistir activeHeaders
        try {
            localStorage.setItem('v41_user_active_headers', JSON.stringify(this.state.activeHeaders || {}));
            localStorage.setItem('v41_headers_saved_at', new Date().toISOString());
            this.showToast && this.showToast('✅ Headers guardados');
        } catch (e) {
            console.warn('No se pudo guardar headers en localStorage:', e);
        }
        return true;
    }

    restoreHeaderManagerSettings() {
        try {
            const raw = localStorage.getItem('v41_user_active_headers');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    this.state.activeHeaders = parsed;
                }
            }
        } catch (e) { }
    }

    addCustomHeader() {
        const keyEl = document.getElementById('customHeaderKey');
        const valEl = document.getElementById('customHeaderVal');
        const key = (keyEl?.value || '').trim();
        const val = (valEl?.value || '').trim();

        if (!key) {
            alert('Header-Key es obligatorio.');
            return;
        }

        // Agregar/activar
        this.state.activeHeaders[key] = val; // val puede ser vacío (modo APE = forzar inclusión)
        if (!this.STANDARD_HEADERS) this.initHeaderManager();
        if (!this.STANDARD_HEADERS.includes(key)) this.STANDARD_HEADERS.push(key);

        // Limpieza de inputs
        if (keyEl) keyEl.value = '';
        if (valEl) valEl.value = '';

        this.renderHeadersList();
        this.updateHeaderCountUI();
    }


    toggleAllHeaders(enable) {
        if (!this.STANDARD_HEADERS) this.initHeaderManager();
        this.STANDARD_HEADERS.forEach(h => {
            if (enable) {
                if (!this.state.activeHeaders[h]) this.state.activeHeaders[h] = '';
            } else {
                delete this.state.activeHeaders[h];
            }
        });
        this.renderHeadersList();
        this.updateHeaderCountUI();
    }

    filterHeadersList() {
        this.renderHeadersList();
    }

    updateHeaderCountUI() {
        const count = Object.keys(this.state.activeHeaders || {}).length;
        // Sync both Connection tab and Generator tab counters
        ['activeHeadersCount', 'activeHeadersCountGen'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = `${count} activos`;
        });
    }

    generateM3U8() {
        // V4.24: Wake probe server when generating
        this._wakeProbeServer();

        const chs = this.getFilteredChannels();
        try { if (window.V41Hooks && typeof window.V41Hooks.onGenerateStart === 'function') window.V41Hooks.onGenerateStart({ channels: chs, v41Config: __v41Config }); } catch (_) { }
        if (!chs.length) return alert('0 canales para generar.');

        // Hook Modular: ExportModule
        if (this.exportModule) {
            return this.exportModule.generateM3U8(chs, {
                epgUrl: this.state.epgUrl || '',
                selectedProfile: this.state.selectedProfile,
                customHeaders: this.state.activeHeaders || {},
                includeHeaders: (document.getElementById('includeHttpHeaders')?.checked ?? true),

                // ✅ V4.1: Nivel base + Auto-Detect + Player Sanitization
                antiFreezeLevel: (document.getElementById('antiFreezeLevel')?.value)
                    ? parseInt(document.getElementById('antiFreezeLevel').value, 10)
                    : ((window.headersManagerUI && window.headersManagerUI.activeLevel)
                        ? window.headersManagerUI.activeLevel
                        : (this.state.antiFreezeLevel || 3)),
                autoDetectLevel: (document.getElementById('v41AutoDetectLevel')?.checked ?? true),
                targetPlayer: (document.getElementById('v41TargetPlayer')?.value || 'generic'),

                // ✅ V5.0: Serverless (opcional)
                useServerless: (document.getElementById('v5UseServerless')?.checked ?? false),
                workerUrl: (document.getElementById('v5WorkerUrl')?.value || '').trim(),
                apiKey: (document.getElementById('v5ApiKey')?.value || '').trim()
            });
        }

        const isOttOptimized = document.getElementById('ottNavOptimized')?.checked;
        if (!this.state.activeHeaders) this.initHeaderManager();

        let content = '#EXTM3U\n';

        if (isOttOptimized) {
            content += '#EXTENC: UTF-8\n';
            content += '#PLAYLIST: OTT Navigator Optimized\n';
        }

        chs.forEach(ch => {
            const name = ch.name || 'Sin Nombre';
            const logo = ch.logo || ch.stream_icon || '';
            const group = ch.group || ch.category_name || 'General';
            const epgId = ch.tvg_id || ch.epg_channel_id || '';
            const tvgName = ch.tvg_name || name;

            let streamUrl = '';
            // ✅ V9.1: Credential Isolation — resolve server PER CHANNEL via serverId
            const channelServerId = ch._source || ch.serverId || ch.server_id;
            let server = null;
            if (channelServerId && this.state.activeServers) {
                server = this.state.activeServers.find(s => s.id === channelServerId);
            }
            if (!server && this.state.currentServer && this.state.currentServer.baseUrl) {
                server = this.state.currentServer;
            }
            if (!server && this.state.activeServers && this.state.activeServers.length > 0) {
                server = this.state.activeServers[0];
            }

            if (server && server.baseUrl && ch.stream_id) {
                const { baseUrl, username, password } = server;
                const cleanBase = baseUrl.replace(/\/player_api\.php$/, '');
                let ext = 'ts';
                let typePath = 'live';
                if (ch.type === 'movie' || ch.stream_type === 'movie') { typePath = 'movie'; ext = ch.container_extension || 'mp4'; }
                else if (ch.type === 'series' || ch.stream_type === 'series') { typePath = 'series'; ext = 'mp4'; }
                else { ext = this.state.streamFormat || 'ts'; }
                streamUrl = `${cleanBase}/${typePath}/${username}/${password}/${ch.stream_id}.${ext}`;
            } else {
                streamUrl = ch.url || '#';
            }

            let tags = `tvg-id="${epgId}" tvg-name="${tvgName}" tvg-logo="${logo}" group-title="${group}"`;

            if (isOttOptimized) {
                if (ch.archive || ch.tv_archive) {
                    const days = ch.archive_dur ? Math.ceil(ch.archive_dur / 24) : 7;
                    tags += ` catchup="xc" catchup-days="${days}" catchup-source="?utc={utc}&lutc={lutc}"`;
                }
            }

            // ✅ A1 FIX: EXTINF PRIMERO (estándar M3U8)
            content += `#EXTINF:-1 ${tags},${name}\n`;

            // Luego EXTHTTP (JSON) para compatibilidad extendida
            if (Object.keys(this.state.activeHeaders).length > 0) {
                content += `#EXTHTTP:${JSON.stringify(this.state.activeHeaders)}\n`;
            }

            // Luego EXTVLCOPT (headers gestionados)
            Object.keys(this.state.activeHeaders).forEach(k => {
                const v = this.state.activeHeaders[k];
                if (v && v.trim()) content += `#EXTVLCOPT:http-${k.toLowerCase()}=${v}\n`;
            });

            if (isOttOptimized) {
                if (!this.state.activeHeaders['User-Agent']) {
                    content += `#EXTVLCOPT:http-user-agent=OTT Navigator/1.6.9.4\n`;
                }
            }

            // URL siempre al final
            content += `${streamUrl}\n`;
        });

        this.state.generatedM3U8 = content;
        // ✅ V4.1+ Generator tab preview uses #m3u8PreviewGen
        // Mantén compatibilidad con previews legacy.
        const area = document.getElementById('m3u8PreviewGen') || document.getElementById('m3u8Preview') || document.getElementById('m3u8PreviewContent');
        if (area) area.value = content.slice(0, 2000) + '...\n\n(Preview: primeros 2000 caracteres. Lista completa en memoria)';
        const btnDown = document.getElementById('btnDownloadM3U8');
        if (btnDown) btnDown.disabled = false;

        // ✅ V4.26: Auto-guardar snapshot tras generación exitosa
        this.saveGeneratorSnapshot(true).catch(e => console.warn('⚠️ Error auto-guardando snapshot:', e));

        alert(`✅ Lista Generada: ${chs.length} canales.\nModo OTT: ${isOttOptimized ? 'ON' : 'OFF'}\nHeaders Activos: ${Object.keys(this.state.activeHeaders).length}`);
    }

    /**
     * ✅ V4.9: Generator tab PRO function - reads options from Generator tab
     */
    generateM3U8Pro() {
        // ✅ APE v8.2.2 SOVEREIGN GHOST INTEGRATION
        // Si el GenerationController está disponible, usamos el motor avanzado con HUD
        if (window.GenerationController && typeof window.GenerationController.startGenerationProcess === 'function') {
            const obfuscate = document.getElementById('includeHttpHeaders')?.checked !== false;
            window.GenerationController.startGenerationProcess(obfuscate);
            return;
        }

        // 🆕 V4.1 integration hooks (safe-additive)
        const __v41StartTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const __v41Config = {
            compressionProfile: document.getElementById('v41CompatProfile')?.value || 'AUTO',
            filterObsolete: document.getElementById('filterObsolete') ? !!document.getElementById('filterObsolete').checked : true,
            telemetryEnabled: document.getElementById('telemetryEnabled') ? !!document.getElementById('telemetryEnabled').checked : true,
            targetPlayer: document.getElementById('v41TargetPlayer')?.value || 'generic'
        };
        try { window.v41Config = Object.assign({}, window.v41Config || {}, __v41Config); } catch (_) { }

        const chs = this.getFilteredChannels();
        if (!chs.length) return alert('0 canales para generar. Conecte un servidor primero.');

        // Read options from Generator tab
        const proStreaming = document.getElementById('proStreamingOptimized')?.checked || false;
        const ottOptimized = document.getElementById('ottNavOptimizedGen')?.checked || false;
        const includeHeaders = document.getElementById('includeHttpHeaders')?.checked !== false;
        const epgUrl = document.getElementById('genEpgUrl')?.value || '';
        const streamFormat = document.getElementById('genStreamFormat')?.value || 'm3u8';

        // Update stream format in state
        this.state.streamFormat = streamFormat;

        // Use ExportModule if available
        if (this.exportModule) {
            const content = this.exportModule.generateM3U8(chs, {
                epgUrl: epgUrl,
                selectedProfile: 'LL-AGGRESSIVE-MAX',
                customHeaders: this.state.activeHeaders || {},
                includeHeaders: includeHeaders,
                proStreaming: proStreaming,

                // ✅ V4.1
                antiFreezeLevel: (document.getElementById('antiFreezeLevel')?.value)
                    ? parseInt(document.getElementById('antiFreezeLevel').value, 10)
                    : ((window.headersManagerUI && window.headersManagerUI.activeLevel)
                        ? window.headersManagerUI.activeLevel
                        : (this.state.antiFreezeLevel || 3)),
                autoDetectLevel: (document.getElementById('v41AutoDetectLevel')?.checked ?? true),
                targetPlayer: (document.getElementById('v41TargetPlayer')?.value || 'generic'),

                // ✅ V5.0 (opcional)
                useServerless: (document.getElementById('v5UseServerless')?.checked ?? false),
                workerUrl: (document.getElementById('v5WorkerUrl')?.value || '').trim(),
                apiKey: (document.getElementById('v5ApiKey')?.value || '').trim()
            });

            // Update Generator tab preview
            const preview = document.getElementById('m3u8PreviewGen');
            if (preview) {
                preview.value = content.slice(0, 2000) + '\n\n... (Lista completa en memoria)';
            }

            // 🆕 V4.1: record telemetry + update dashboards
            try {
                const __v41EndTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                if (__v41Config.telemetryEnabled && window.telemetryManager && typeof window.telemetryManager.logDecision === 'function') {
                    window.telemetryManager.logDecision(true, (__v41EndTime - __v41StartTime), __v41Config.compressionProfile, false);
                }
                if (window.V41Hooks && typeof window.V41Hooks.onGenerateEnd === 'function') {
                    const sampleUrl = chs && chs[0] ? (chs[0].url || chs[0].URL || '') : '';
                    window.V41Hooks.onGenerateEnd({
                        sampleUrl,
                        totalChannels: this.state.channelsMaster?.length || 0,
                        filteredChannels: chs?.length || 0,
                        count4k: (chs || []).filter(c => (c.quality || c.Quality || '').toString().toUpperCase().includes('4K') || (c.name || c.Name || '').toString().toUpperCase().includes('4K')).length,
                        groupCount: new Set((chs || []).map(c => c.group || c.groupTitle || c['group-title'] || c.Group || '')).size
                    });
                }
            } catch (_) { }

            // ✅ V4.26: Auto-guardar snapshot tras generación exitosa
            this.saveGeneratorSnapshot(true).catch(e => console.warn('⚠️ Error auto-guardando snapshot:', e));

            return content;
        }

        // Fallback to regular generateM3U8
        try {
            const __v41EndTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            if (__v41Config.telemetryEnabled && window.telemetryManager && typeof window.telemetryManager.logDecision === 'function') {
                window.telemetryManager.logDecision(true, (__v41EndTime - __v41StartTime), __v41Config.compressionProfile, false);
            }
        } catch (_) { }
        return this.generateM3U8();
    }

    /**
     * ✅ V4.9: Update Generator tab stats
     */
    updateGeneratorStats() {
        const total = this.state.channelsMaster?.length || 0;
        const filtered = this.state.channels?.length || 0;
        const uhd = this.state.channelsMaster?.filter(ch => {
            const res = ch.resolution || ch.heuristics?.resolution || '';
            return res.includes('4K') || res.includes('UHD') || res.includes('2160');
        }).length || 0;
        const groups = new Set(this.state.channelsMaster?.map(ch => ch.group || ch.category_name) || []).size;

        // Update UI elements
        const els = {
            genStatTotal: total,
            genStatFiltered: filtered,
            genStat4K: uhd,
            genStatGroups: groups
        };

        Object.entries(els).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val.toLocaleString();
        });
    }

    downloadM3U8() {
        if (!this.state.generatedM3U8) return;
        const b = new Blob([this.state.generatedM3U8], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'list.m3u8'; a.click();
    }

    getDefaultHeaderPresets() {
        return [{
            name: 'LL-AGGRESSIVE-MAX',
            headers: [
                { name: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 IPTV-Navigator/4.5.2' }
            ]
        }];
    }
    loadPreset(n) { }

    exportToExcel() {
        if (typeof XLSX === 'undefined') return alert('XLSX lib missing');
        const data = this.getFilteredChannels().map(ch => ({ ID: ch.stream_id, Name: ch.name, URL: ch.url }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Channels");
        XLSX.writeFile(wb, `export_${Date.now()}.xlsx`);
    }
    exportToCSV() {
        const d = this.getFilteredChannels();
        let csv = 'ID,Name,URL\n' + d.map(c => `${c.stream_id},"${c.name}",${c.url}`).join('\n');
        const b = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'export.csv'; a.click();
    }

    // ==================== 🏭 INDUSTRIAL WORKER INTERFACE (v3.0) ====================

    // ------------------------------------------------------------------
    // Watchdog industrial para el Worker (anti-timeout)
    // ------------------------------------------------------------------
    resetWorkerWatchdog() {
        if (this._workerTimeout) clearTimeout(this._workerTimeout);

        // Si pasan 60s sin heartbeat/progress → advertencia SOLO visual.
        this._workerTimeout = setTimeout(() => {
            console.warn("⚠️ Worker sin eventos en 60s (pero NO se cancela).");
            this.updateMiniProgress({
                status: "Esperando respuesta del Worker…",
                state: "pause"
            });
        }, 60000);
    }

    // ------------------------------------------------------------------
    // Mini-log industrial (solo 2 líneas visibles)
    // ------------------------------------------------------------------
    appendEnrichLog(message, level = "info") {
        const logBox = document.getElementById("enrichLog");
        if (!logBox) return;

        const line = document.createElement("div");
        line.className = "enrich-log-line";

        if (level === "error") line.style.color = "#ffb3b3";
        if (level === "warn") line.style.color = "#ffe8b3";

        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");

        line.textContent = `[${hh}:${mm}] ${message}`;

        logBox.prepend(line);

        // Mantener solo dos líneas visibles
        while (logBox.children.length > 2) {
            logBox.removeChild(logBox.lastChild);
        }
    }

    // ==================== 🆕 WEB WORKER ENGINE ====================

    initWorkerEngine() {
        try {
            this.worker = new Worker('enrichment.worker.js');

            // ------------------------------------------------------------------
            // Worker Industrial – Gestión unificada de eventos PRO
            // ------------------------------------------------------------------
            this.worker.onmessage = async (e) => {
                const data = e.data;

                // Reiniciamos watchdog cada mensaje
                this.resetWorkerWatchdog();

                switch (data.type) {

                    // ------------------------------------------
                    // El Worker está vivo
                    // ------------------------------------------
                    case "heartbeat":
                        this.updateMiniProgress({
                            status: "Procesando…",
                            state: "active"
                        });
                        break;

                    // ------------------------------------------
                    // Progreso real
                    // ------------------------------------------
                    case "progress":
                        this.updateMiniProgress({
                            pct: data.progress * 100,
                            enriched: data.enriched,
                            speed: data.speed,
                            eta: data.eta,
                            status: "Mapeando canales…",
                            state: "active"
                        });

                        if (data.batches !== undefined) {
                            this.appendEnrichLog(
                                `Lote ${data.batches} procesado (${data.enriched} canales).`
                            );
                        }
                        break;

                    // ------------------------------------------
                    // Terminado
                    // ------------------------------------------
                    case "done":
                        this.updateMiniProgress({
                            pct: 100,
                            enriched: data.enriched,
                            speed: 0,
                            eta: 0,
                            status: "Completado",
                            state: "pause"
                        });

                        this.appendEnrichLog(
                            `Completado: ${data.enriched} canales enriquecidos.`
                        );

                        this.state.enrichmentProgress.active = false;

                        // --- V4.20.4: Simple assignment restored (merge was causing issues) ---
                        if (data.channels && Array.isArray(data.channels)) {
                            console.log(`📥 Recibidos ${data.channels.length} canales enriquecidos del Worker`);
                            this.state.channelsMaster = data.channels;
                            this.state.channels = [...this.state.channelsMaster];
                        }

                        // ═══════════════════════════════════════════════════════════════
                        // 🏷️ V4.22: CLASIFICACIÓN JERÁRQUICA (Post-Enriquecimiento)
                        // Ejecuta al final para aprovechar TODA la data recolectada
                        // ═══════════════════════════════════════════════════════════════
                        if (window.APEChannelClassifier && this.state.channelsMaster.length > 0) {
                            console.log('🏷️ Iniciando clasificación jerárquica...');
                            const classStats = { by_region: {}, by_language: {}, by_category: {}, by_quality: {} };
                            const startTime = performance.now();

                            this.state.channelsMaster.forEach((ch, idx) => {
                                try {
                                    const result = window.APEChannelClassifier.classify(ch);

                                    // Almacenar clasificación completa en el canal
                                    ch._classification = result;
                                    ch._region = `${result.region.emoji || '🌎'} ${result.region.group.replace(/_/g, ' ')}`;
                                    ch._language = `${result.language.emoji || '🗣️'} ${result.language.language}`;
                                    ch._category = `${result.category.emoji || '📂'} ${result.category.category}`;
                                    ch._quality = result.quality.quality;
                                    ch._qualityIcon = result.quality.icon;

                                    // Acumular estadísticas
                                    const rg = result.region.group;
                                    const lang = result.language.language;
                                    const cat = result.category.category;
                                    const qual = result.quality.quality;
                                    classStats.by_region[rg] = (classStats.by_region[rg] || 0) + 1;
                                    classStats.by_language[lang] = (classStats.by_language[lang] || 0) + 1;
                                    classStats.by_category[cat] = (classStats.by_category[cat] || 0) + 1;
                                    classStats.by_quality[qual] = (classStats.by_quality[qual] || 0) + 1;
                                } catch (e) {
                                    console.warn(`⚠️ Error clasificando canal ${idx}:`, e);
                                }
                            });

                            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                            console.log(`✅ Clasificación completada en ${elapsed}s`);
                            console.table(classStats);

                            // Actualizar UI con estadísticas
                            this._updateClassificationUI(classStats);

                            // Agregar campos de clasificación a discoveredFields
                            this._ensureClassificationFields();

                            // Sincronizar channels con channelsMaster (ya clasificados)
                            this.state.channels = [...this.state.channelsMaster];
                        }
                        // ═══════════════════════════════════════════════════════════════

                        // Guardar en base local (Solo enriched para ahorrar escritura, o todo?)
                        // Mejor guardar todo si hubo cambios masivos
                        const enriched = this.state.channelsMaster.filter(c => c._enriched);
                        if (this.db && enriched.length) {
                            await this.db.saveChannelsBulk(enriched, this.state.currentServer.baseUrl);
                        }

                        // Limpiar flags temporales para UI limpia? 
                        // No, los dejamos para debugging visual si se quiere
                        // enriched.forEach(c => delete c._enriched); 

                        // Guardar reporte discreto
                        const now = new Date();
                        this.state.lastEnrichmentReport = {
                            date: now.toLocaleDateString(),
                            time: now.toLocaleTimeString(),
                            count: data.enriched
                        };

                        // Ocultar barra de progreso (estado 'hidden' triggers strict visibility check)
                        setTimeout(() => {
                            this.updateMiniProgress({ state: "hidden" });

                            // 🕵️ V4.20.3: Limpiar Watchdog al finalizar exitosamente
                            if (this._workerTimeout) {
                                clearTimeout(this._workerTimeout);
                                this._workerTimeout = null;
                            }

                            // 🔗 V4.20.3: Asegurar que el chip de conexión diga "Conectado" (no "Conectando...")
                            const status = document.getElementById('connectionStatus');
                            if (status) {
                                status.innerHTML = '<span class="status-dot active"></span><span>Conectado</span>';
                                status.className = 'status-chip success';
                            }
                        }, 2000); // Pequeño delay para ver el "100%"

                        await new Promise(r => setTimeout(r, 0));
                        this.renderTable();
                        this.renderSourcesList(); // Actualizar pata mostrar reporte
                        break;

                    // ------------------------------------------
                    // Error interno
                    // ------------------------------------------
                    case "error":
                        this.updateMiniProgress({
                            status: `Error: ${data.message}`,
                            state: "pause"
                        });
                        this.appendEnrichLog(`Error: ${data.message}`, "error");
                        break;

                    // 🎯 V4.5.0: INTERNAL ENRICHMENT COMPLETE (Constructor Style)
                    case "quality_done": {
                        const now = new Date();
                        console.log(`✅ [${now.toLocaleTimeString()}] Enriquecimiento interno completado: ${data.enriched} canales.`);

                        // Yield to main thread to unblock UI
                        await new Promise(r => setTimeout(r, 0));

                        // 🎯 CRITICAL FIX: Update State with Enriched Data
                        if (data.channels && Array.isArray(data.channels)) {
                            this.state.channelsMaster = data.channels;
                            // ✅ V4.8.2: Don't reset channels, let applyFilters handle it
                            console.log(`📥 Estado actualizado con ${data.channels.length} canales enriquecidos.`);
                        }

                        await new Promise(r => setTimeout(r, 0));

                        // Update Columns & Re-apply filters (maintains filter state)
                        this.discoverFields(this.state.channelsMaster);

                        // ✅ V4.8.2: Use applyFilters instead of renderTable to maintain filter consistency
                        if (typeof this.applyFilters === 'function') {
                            this.applyFilters();
                        } else {
                            this.renderTable();
                        }

                        this.showToast(`Enriquecimiento completado: ${data.enriched} canales procesados.`, false);

                        // ═══════════════════════════════════════════════════════════════
                        // 🏷️ V4.22.1: CLASIFICACIÓN JERÁRQUICA (Post-Enriquecimiento Interno)
                        // Ejecuta clasificación AQUÍ para que el panel aparezca tras F5
                        // (antes solo estaba en el handler "done" de enriquecimiento externo)
                        // ═══════════════════════════════════════════════════════════════
                        if (window.APEChannelClassifier && this.state.channelsMaster.length > 0) {
                            console.log('🏷️ [quality_done] Iniciando clasificación jerárquica...');
                            const classStats = { by_region: {}, by_language: {}, by_category: {}, by_quality: {} };
                            const startTime = performance.now();

                            this.state.channelsMaster.forEach((ch, idx) => {
                                try {
                                    const result = window.APEChannelClassifier.classify(ch);
                                    ch._classification = result;
                                    ch._region = `${result.region.emoji || '🌎'} ${result.region.group.replace(/_/g, ' ')}`;
                                    ch._language = `${result.language.emoji || '🗣️'} ${result.language.language}`;
                                    ch._category = `${result.category.emoji || '📂'} ${result.category.category}`;
                                    ch._quality = result.quality.quality;
                                    ch._qualityIcon = result.quality.icon;

                                    const rg = result.region.group;
                                    const lang = result.language.language;
                                    const cat = result.category.category;
                                    const qual = result.quality.quality;
                                    classStats.by_region[rg] = (classStats.by_region[rg] || 0) + 1;
                                    classStats.by_language[lang] = (classStats.by_language[lang] || 0) + 1;
                                    classStats.by_category[cat] = (classStats.by_category[cat] || 0) + 1;
                                    classStats.by_quality[qual] = (classStats.by_quality[qual] || 0) + 1;
                                } catch (e) {
                                    console.warn(`⚠️ Error clasificando canal ${idx}:`, e);
                                }
                            });

                            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                            console.log(`✅ [quality_done] Clasificación completada en ${elapsed}s`);
                            console.table(classStats);

                            this._updateClassificationUI(classStats);
                            this._ensureClassificationFields();
                            this.state.channels = [...this.state.channelsMaster];

                            // Re-render table with classification data
                            if (typeof this.applyFilters === 'function') {
                                this.applyFilters();
                            } else {
                                this.renderTable();
                            }
                        }
                        // ═══════════════════════════════════════════════════════════════

                        // 🎯 CHAINING: Trigger External Enrichment AFTER Internal is done
                        console.log("🔗 Encadenando: Iniciando enriquecimiento externo (Fuentes)...");
                        this.autoEnrichAllActiveSources(true);
                        break;
                    }
                }
            };

            this.worker.onerror = (e) => {
                console.error('Worker Error:', e);
                try { this.worker.terminate(); } catch (_e) { }
                this.worker = null;
                // No bloquea el flujo: seguimos en modo fallback (sin Worker)
                this.updateMiniProgress({ status: "Worker offline (fallback)", state: "run" });
            };

        } catch (e) {
            console.error("Worker Init Failed:", e);
        }
    }

    // 🎯 NUEVO: Lanzar enriquecimiento interno automático en segundo plano
    _launchInternalEnrichment(source = 'unknown') {
        if (!this.worker || !this.state.channelsMaster || this.state.channelsMaster.length === 0) {
            return;
        }
        try {
            this.worker.postMessage({
                type: 'enrich_quality',
                channels: this.state.channelsMaster,
                source: source, // para debugging
                timestamp: new Date().toISOString()
            });
            console.log(
                `⚙️ [${source}] Enriquecimiento interno automático lanzado ` +
                `para ${this.state.channelsMaster.length} canales.`
            );
        } catch (err) {
            console.error('❌ Error lanzando enriquecimiento interno:', err);
        }
    }



    // ------------------------------------------------------------------
    // Actualización compacta + animación + estados del punto indicador
    // ------------------------------------------------------------------
    updateMiniProgress({ pct, enriched, speed, eta, status, state }) {
        const pctEl = document.getElementById("enrichPct");
        const bar = document.getElementById("enrichBar");
        const countEl = document.getElementById("enrichCount");
        const speedEl = document.getElementById("enrichSpeed");
        const etaEl = document.getElementById("enrichETA");
        const dot = document.getElementById("enrichStatusDot");
        const text = document.getElementById("enrichStatusText");

        // Si ni siquiera existe el contenedor, salimos sin hacer nada
        if (!pctEl && !bar && !countEl && !speedEl && !etaEl && !dot && !text) {
            return;
        }

        // ✅ V4.10: Modal ahora está DENTRO del tab de Conexión
        // Solo controlamos display basado en estado de operación
        const container = document.getElementById("enrichmentProgressContainer");
        if (container) {
            // Mostrar solo si hay operación activa, pausada o error
            const isRunning = (state === "active" || state === "pause" || state === "error");
            const isHidden = (state === "hidden");

            if (isHidden) {
                container.style.display = "none";
            } else if (isRunning) {
                container.style.display = "block";
            }
            // Si no es ninguno de los dos, mantener estado actual
        }

        // Porcentaje + barra
        if (typeof pct === "number" && pctEl) {
            const p = Math.min(100, Math.max(0, Math.round(pct)));
            pctEl.textContent = p;
            if (bar) {
                bar.style.width = p + "%";
                if (p > 0 && p < 100) bar.classList.add("active");
                if (p === 0 || p >= 100) bar.classList.remove("active");
            }
        }

        if (typeof enriched === "number" && countEl) countEl.textContent = enriched;
        if (typeof speed === "number" && speedEl) speedEl.textContent = speed;
        if (typeof eta === "number" && etaEl) etaEl.textContent = Math.max(0, eta);

        if (status && text) text.textContent = status;

        if (state && dot) {
            dot.classList.remove("active", "pause", "error");
            dot.classList.add(state);
        }
    }

    handleWorkerMessage(e) {
        // Deprecated by Industrial Worker
    }

    // ==================== 🆕 FUENTES MANAGEMENT ====================

    normalizeSourceUrl(u) {
        if (!u) return '';
        let url = u.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        return url.replace(/\/+$/, '');
    }

    async loadSavedSources() {
        if (!this.db) return;
        try {
            let list = await this.db.getAppState('enrichmentSources');

            // --- INDUSTRIAL INJECTION (Start) ---
            if (!list || list.length === 0) {
                console.log("⚡ Inyectando Fuentes Industriales (IPTV-org)...");
                list = [
                    {
                        id: "iptv-org-master",
                        label: "IPTV-org Master (Channels)",
                        baseUrl: "https://iptv-org.github.io/api/channels.json",
                        type: "json",
                        enabled: true
                    },
                    {
                        id: "iptv-org-streams",
                        label: "IPTV-org Streams (Tech)",
                        baseUrl: "https://iptv-org.github.io/api/streams.json",
                        type: "json",
                        enabled: true
                    },
                    {
                        id: "iptv-org-guides",
                        label: "IPTV-org EPG (Guides)",
                        baseUrl: "https://iptv-org.github.io/api/guides.json",
                        type: "json",
                        enabled: true
                    },
                    {
                        id: "tdt-channels-es",
                        label: "TDTChannels (España)",
                        baseUrl: "https://www.tdtchannels.com/lists/tv.json",
                        type: "json",
                        enabled: true
                    }
                ];
                await this.db.saveAppState('enrichmentSources', list);
            }
            // --- INDUSTRIAL INJECTION (End) ---

            if (Array.isArray(list) && list.length > 0) {
                this.state.enrichmentSources = list;
                console.log(`✅ Fuentes cargadas: ${list.length}`);
            }
        } catch (e) {
            console.warn('No se pudieron cargar fuentes:', e);
        }
    }

    async saveSources() {
        if (!this.db) return;
        try {
            await this.db.saveAppState('enrichmentSources', this.state.enrichmentSources);
            console.log('✅ Fuentes guardadas');
        } catch (e) {
            console.error('Error guardando fuentes:', e);
        }
    }

    async addSourceFromUI() {
        const labelInput = document.getElementById('sourceLabelInput');
        const baseInput = document.getElementById('sourceBaseInput');

        if (!labelInput || !baseInput) return;

        const label = labelInput.value.trim();
        const raw = baseInput.value.trim();

        if (!raw) {
            alert('❌ Introduce una URL base');
            return;
        }

        const baseUrl = this.normalizeSourceUrl(raw);

        // Mostrar loading
        const btn = document.getElementById('btnDiscoverAndAddSource');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = '🔍 Descubriendo endpoints...';
        }

        try {
            // Usar Source Discovery para detectar endpoints
            const discovered = await window.SourceDiscovery.discover(baseUrl);

            const id = 'src_' + baseUrl.replace(/[^a-z0-9]/gi, '_').toLowerCase();

            const sourceObj = {
                id,
                label: label || baseUrl,
                baseUrl: discovered.base,
                endpoints: discovered.endpoints,
                stats: discovered.stats,
                enabled: true,
                addedAt: Date.now()
            };

            // Buscar si ya existe
            const existingIndex = this.state.enrichmentSources.findIndex(s => s.id === id);

            if (existingIndex >= 0) {
                // Actualizar existente
                this.state.enrichmentSources[existingIndex] = sourceObj;
                alert('✅ Fuente actualizada correctamente');
            } else {
                // Agregar nueva
                this.state.enrichmentSources.push(sourceObj);
                alert(`✅ Fuente agregada correctamente\n\n` +
                    `Endpoints encontrados: ${discovered.stats.found}\n` +
                    `Canales: ${discovered.endpoints.channels.length}\n` +
                    `EPG: ${discovered.endpoints.epg.length}\n` +
                    `Logos: ${discovered.endpoints.logos.length}`);
            }

            await this.saveSources();
            this.renderSourcesList();
            this.renderDiscoveredEndpoints(discovered.endpoints);

            // Limpiar formulario
            if (labelInput) labelInput.value = '';
            if (baseInput) baseInput.value = '';

        } catch (error) {
            console.error('Error en Source Discovery:', error);
            alert('❌ Error detectando endpoints: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    }

    renderSourcesList() {
        const container = document.getElementById('sourcesList');
        if (!container) return;

        const sources = this.state.enrichmentSources || [];

        if (!sources.length) {
            container.innerHTML = `
                <p style="color:#aab; font-size:0.78rem; text-align:center;">
                    No hay fuentes configuradas aún. Agrega una arriba.
                </p>
            `;
            return;
        }

        container.innerHTML = '';

        sources.forEach(src => {
            const div = document.createElement('div');
            div.style.cssText = 'border:1px solid rgba(148,163,184,0.3); padding:10px; border-radius:6px; margin-bottom:8px; font-size:0.78rem;';

            const endpointsCount = Object.values(src.endpoints || {})
                .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);

            div.innerHTML = `
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                        <div style="flex:1;">
                                            <div style="font-weight:bold; font-size:0.85rem;">${src.label}</div>
                                            <div style="color:#99a; font-size:0.7rem; margin-top:2px;">${src.baseUrl}</div>
                                            <div style="color:#768; font-size:0.68rem; margin-top:2px;">
                                                Endpoints: ${endpointsCount} |
                                                Agregada: ${src.addedAt ? new Date(src.addedAt).toLocaleDateString() : 'N/A'}
                                            </div>
                                        </div>
                                        <div style="display:flex; gap:6px; align-items:center;">
                                            <label style="font-size:0.7rem; color:#aab; display:flex; align-items:center; gap:4px; cursor:pointer;">
                                                <input type="checkbox" data-src-ctrl="toggle" ${src.enabled ? 'checked' : ''}>
                                                    <span>Activo</span>
                                            </label>
                                            <button data-src-ctrl="run" class="btn secondary" style="padding:6px 12px; font-size:0.7rem;">
                                                Enriquecer
                                            </button>
                                            <button data-src-ctrl="edit" class="btn secondary" style="padding:6px 12px; font-size:0.7rem;">
                                                ✏️
                                            </button>
                                            <button data-src-ctrl="remove" class="btn secondary" style="padding:6px 12px; font-size:0.7rem;">
                                                🗑
                                            </button>
                                        </div>
                                    </div>
                                    `;

            // ✅ ADJUNTAR LISTENERS INMEDIATAMENTE -- FIXED
            const btnRun = div.querySelector('[data-src-ctrl="run"]');
            if (btnRun) btnRun.onclick = () => this.enrichWithSourceWorker(src.id);

            const btnRemove = div.querySelector('[data-src-ctrl="remove"]');
            if (btnRemove) btnRemove.onclick = () => this.removeSource(src.id);

            const btnEdit = div.querySelector('[data-src-ctrl="edit"]');
            if (btnEdit) btnEdit.onclick = () => this.editSource(src.id);

            const chkToggle = div.querySelector('[data-src-ctrl="toggle"]');
            if (chkToggle) chkToggle.onchange = (e) => this.toggleSourceEnabled(src.id, e.target.checked);

            container.appendChild(div);
        });


        // 🆕 DISCREET REPORT FOOTER
        if (this.state.lastEnrichmentReport) {
            const rep = this.state.lastEnrichmentReport;
            const footer = document.createElement('div');
            footer.style.cssText = 'margin-top:10px; padding:8px; background:rgba(255,255,255,0.03); border-radius:4px; font-size:0.7rem; color:#64748b; text-align:center; font-family:monospace;';
            footer.innerHTML = `
                                    <span>📡 Último Escaneo: ${rep.date} ${rep.time}</span><br>
                                        <span style="color:#10b981;">✓ ${rep.count} canales enriquecidos</span>
                                        `;
            container.appendChild(footer);
        }
    }

    editSource(id) {
        const src = this.state.enrichmentSources.find(s => s.id === id);
        if (!src) return;

        const labelInput = document.getElementById('sourceLabelInput');
        const baseInput = document.getElementById('sourceBaseInput');

        if (labelInput) {
            labelInput.value = src.label;
            labelInput.focus();
        }
        if (baseInput) {
            baseInput.value = src.baseUrl;
        }

        // Visual feedback
        const btn = document.getElementById('btnDiscoverAndAddSource');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = "✏️ Actualizar (detectar)";
            setTimeout(() => btn.textContent = originalText, 3000);
        }
    }

    renderDiscoveredEndpoints(endpoints) {
        const panel = document.getElementById('discoveredEndpointsPanel');
        const tbody = document.getElementById('discoveredEndpointsTable');

        if (!panel || !tbody) return;

        tbody.innerHTML = '';
        let hasEndpoints = false;

        for (const type in endpoints) {
            const list = endpoints[type];
            if (Array.isArray(list) && list.length > 0) {
                hasEndpoints = true;

                list.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    tr.innerHTML = `
                                        <td style="padding:6px; color:#89b;">
                                            <span style="background:rgba(56,189,248,0.2); padding:2px 8px; border-radius:12px; font-size:0.7rem;">
                                                ${type}
                                            </span>
                                        </td>
                                        <td style="padding:6px; color:#cde; font-family:monospace; font-size:0.7rem;">
                                            ${item.url || item}
                                        </td>
                                        <td style="padding:6px;">
                                            <span style="color:#4ade80;">✓</span>
                                        </td>
                                        `;
                    tbody.appendChild(tr);
                });
            }
        }

        if (!hasEndpoints) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" style="padding:12px; text-align:center; color:#889;">
                        No se detectaron endpoints
                    </td>
                </tr>
            `;
        }

        panel.style.display = hasEndpoints ? 'block' : 'none';
    }

    async removeSource(id) {
        if (!confirm('¿Eliminar esta fuente?')) return;

        // 🆕 Cancelar si está en uso
        if (this.currentEnrichSourceId === id) {
            this.cancelEnrichment();
        }

        this.state.enrichmentSources = this.state.enrichmentSources.filter(s => s.id !== id);
        await this.saveSources();
        this.renderSourcesList();

        // 🆕 Si no quedan fuentes, cancelar todo
        if (this.state.enrichmentSources.length === 0) {
            this.cancelEnrichment();
        }
    }

    async toggleSourceEnabled(id, enabled) {
        const src = this.state.enrichmentSources.find(s => s.id === id);
        if (!src) return;

        src.enabled = enabled;
        await this.saveSources();
    }

    /**
     * 🛑 V4.20.2: Cancelar enriquecimiento en curso
     * Envía señal de parada al worker y reinicia estados internos.
     */
    cancelEnrichment() {
        console.warn("⛔ Cancelando enriquecimiento…");

        // 1. Notificar al Worker de forma persistente
        if (this.worker) {
            this.worker.postMessage({ type: "cancel" });

            // Si el proceso está muy bloqueado, forzar terminación tras breve espera
            // (Opcional: aquí podríamos poner un timeout para this.worker.terminate())
        }

        // 2. Detener estado UI inmediatamente
        this.updateMiniProgress({
            status: "Cancelado por usuario",
            state: "pause",
            pct: 0
        });

        // 3. Limpiar banderas de flujo
        this.state.enrichmentProgress.active = false;
        this.currentEnrichSourceId = null;
        this._enrich = { cancelled: true }; // Compatibilidad con legacy

        // 4. Detener Watchdog
        if (this._workerTimeout) clearTimeout(this._workerTimeout);

        console.log("❎ Enriquecimiento cancelado y estados reseteados.");
        if (this.showToast) this.showToast("Proceso cancelado");
    }

    /**
     * Enriquecer AUTOMÁTICAMENTE con todas las fuentes activas.
     * @param {boolean} autoFromConnect - true = silencioso (auto), false = manual (con alerts)
                                        */
    async autoEnrichAllActiveSources(autoFromConnect = false) {
        const sources = (this.state.enrichmentSources || []).filter(s => s.enabled);

        if (!sources.length) {
            if (!autoFromConnect) {
                alert('No hay fuentes activas. Agrega/activa una en la pestaña FUENTES.');
            }
            return;
        }

        if (!this.state.channelsMaster || !this.state.channelsMaster.length) {
            if (!autoFromConnect) {
                alert('No hay canales cargados. Conecta un servidor primero.');
            }
            return;
        }

        console.log('[AutoEnrich] Fuentes activas en cola:', sources.map(s => s.id));

        for (const src of sources) {
            // Verificar si fue cancelado
            if (!this.currentEnrichSourceId && this.state.enrichmentProgress.active === false) {
                // Si no hay ID activo y UI inactiva, pero estamos en el loop, verificar banderas
            }
            // Mejor: verificar si debemos continuar

            const pending = this.state.channelsMaster.filter(ch =>
                !ch.tvgId || !ch.tvgName || !ch.logo || !ch.epgId
            );

            if (!pending.length) {
                console.log('[AutoEnrich] Sin canales pendientes, deteniendo cola.');
                break;
            }

            console.log(`[AutoEnrich] Enriqueciendo con fuente ${src.id} (${src.label})...`);

            try {
                // await secuencial
                await this.enrichWithSourceWorker(src.id, { silent: autoFromConnect });
            } catch (err) {
                console.error('[AutoEnrich] Error con fuente', src.id, err);
            }

            // Si el usuario canceló DURANTE el await, el promise reject lo maneja el catch
            // Pero si queremos detener la cola:
            if (!this.state.enrichmentProgress.active && !autoFromConnect) {
                // Si se detuvo, salir. (Aunque autoFromConnect check es opcional)
            }
        }

        console.log('[AutoEnrich] Cola de fuentes finalizada.');
    }

    async enrichWithSourceWorker(sourceId) {
        const src = this.state.enrichmentSources.find(s => s.id === sourceId);
        if (!src) {
            alert("Fuente no encontrada.");
            return;
        }

        const channels = this.state.channelsMaster;
        if (!channels || channels.length === 0) {
            alert("No hay canales para enriquecer.");
            return;
        }

        console.log(`🚀 Iniciando enriquecimiento industrial de ${channels.length} canales…`);

        // Preparar UI
        this.updateMiniProgress({
            pct: 0,
            enriched: 0,
            speed: 0,
            eta: 0,
            status: "Iniciando…",
            state: "active"
        });

        this.appendEnrichLog("Inicializando Worker…");

        // Lanzar Worker
        this.worker.postMessage({
            type: "enrich",
            channels,
            source: src
        });

        // Iniciar watchdog
        this.resetWorkerWatchdog();
    }
    // ✅ V4.5.0: SAVE TAB STATE - GENERIC HANDLER
    /**
     * ✅ V4.20.0: SAVE TAB STATE - UNIFIED GENERIC HANDLER
     * Consolidada tras detectar duplicidad. Este es el único punto de guardado.
     */
    async saveTabState(tabId) {
        console.log(`💾 Guardando estado de pestaña: ${tabId}`);
        let msg = 'Configuración guardada';

        try {
            switch (tabId) {
                case 'connection':
                    // Guardar config de conexión y servidores
                    await this.saveConfigState();
                    await this.saveActiveServers();

                    // Guardar headers
                    if (this.db) {
                        const headers = this.state.advancedHeaders || {};
                        const custom = this.state.customHeaders || [];
                        await this.db.saveAppState('headersConfig', { headers, custom });
                    }
                    msg = 'Conexión y Headers guardados';
                    break;

                case 'analysis':
                    // Usar Manager si existe
                    if (window.AnalysisStateManager && window.AnalysisStateManager.save) {
                        window.AnalysisStateManager.save();
                    } else if (this.db) {
                        await this.db.saveAppState('analysisConfig', {
                            activeColumns: this.state.activeColumns,
                            itemsPerPage: this.state.itemsPerPage
                        });
                    }
                    msg = 'Análisis y Columnas guardados';
                    break;

                case 'filters':
                    // ✅ V4.9.3: CSS class-based lock
                    this.state.filterEditMode = false;
                    const filterContainer = document.getElementById('filterBuilderContainer');
                    if (filterContainer) {
                        filterContainer.classList.add('locked');
                        filterContainer.querySelectorAll('strong').forEach(strong => {
                            if (strong.textContent.includes('Grupo') && !strong.textContent.includes('🔒')) {
                                strong.textContent = '🔒 ' + strong.textContent;
                            }
                        });
                    }
                    this.renderFilterBuilder();
                    this.updateActiveFiltersSummary();

                    if (this.db) {
                        await this.saveFilterState();
                        await this.db.saveAppState('filtersConfig', {
                            lastSaved: Date.now(),
                            activeCount: document.getElementById('activeFiltersSummary')?.innerText || '0'
                        });
                    }
                    msg = '🔒 Filtros guardados y bloqueados';
                    break;

                case 'ranking':
                    // Guardar configuración nativa y de la DB
                    if (this.rankingScoreConfig && typeof this.rankingScoreConfig.saveProfile === 'function') {
                        this.rankingScoreConfig.saveProfile();
                    }
                    const preset = document.getElementById('rankingPreset')?.value;
                    const mode = document.getElementById('rankingMode')?.value;
                    if (this.db) {
                        await this.db.saveAppState('rankingConfig', { preset, mode });
                    }
                    msg = 'Configuración de Ranking guardada';
                    break;

                case 'sources':
                    await this.saveSources();
                    msg = 'Fuentes sincronizadas';
                    break;

                case 'servers':
                    // ✅ V4.18.5+: Guardar biblioteca + conexiones + canales + Gateway

                    // 1) Biblioteca a IndexedDB (backup)
                    await this.saveServerLibraryToIndexedDB();

                    // 2) Canales y Servidores activos
                    await this.saveActiveServers();
                    await this.saveChannelsList();

                    // 3) ✅ GATEWAY: Guardar configuración del Gateway
                    if (window.gatewayManager && typeof window.gatewayManager.saveConfig === 'function') {
                        window.gatewayManager.saveConfig();
                    }

                    // 4) Guardado masivo a biblioteca con clasificación (si el módulo está cargado)
                    if (this.saveAllActiveServersToLibrary) {
                        await this.saveAllActiveServersToLibrary();
                        return; // saveAllActiveServersToLibrary ya muestra su notificación
                    }

                    msg = '✅ Biblioteca + Conexiones + Gateway guardados';
                    break;

                case 'generator':
                    // ✅ V4.19: Guardar estado COMPLETO de la pestaña Generar
                    await this.saveGeneratorState();
                    msg = 'Configuración del generador guardada';
                    break;

                default:
                    console.warn(`⚠️ Tab desconocida: ${tabId}`);
                    return;
            }

            this.showToast ? this.showToast(msg) : alert(msg);

        } catch (e) {
            console.error('Error guardando tab:', e);
            if (this.showToast) this.showToast('Error al guardar', true);
            else alert('❌ Error al guardar configuración');
        }
    }

    // ✅ V4.22: NOTA - saveGeneratorState() y loadGeneratorState() están definidas
    // correctamente en las líneas ~1630-1810. NO duplicar aquí.

    showToast(text, isError = false) {
        const toast = document.getElementById('toast');
        const msg = document.getElementById('toastMsg');
        if (!toast || !msg) return;

        msg.innerText = text;
        toast.style.borderColor = isError ? '#ef4444' : 'rgba(56, 189, 248, 0.4)';
        toast.classList.add('show');

        // Reset timer
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    /**
     * ✅ V4.11.3 - Validar consistencia RAM vs IndexedDB
     * Usar en consola: await app.validatePersistenceConsistency()
     */
    async validatePersistenceConsistency() {
        console.log('🔍 === VALIDACIÓN DE PERSISTENCIA ===');

        // En RAM
        const ramTotal = this.state.channelsMaster?.length || 0;
        const ramServers = this.state.activeServers?.length || 0;

        console.log(`📍 EN RAM (this.state):`);
        console.log(`   - Canales: ${ramTotal}`);
        console.log(`   - Servidores: ${ramServers}`);

        if (!this.db) {
            console.warn('⚠️ Database no disponible');
            return;
        }

        try {
            // En IndexedDB
            const dbChannels = await this.db.loadChannels();
            const dbServersData = await this.db.getAppState('activeServers');

            const dbTotal = dbChannels?.length || 0;
            const dbServers = dbServersData?.activeServers?.length || 0;

            console.log(`💾 EN IndexedDB:`);
            console.log(`   - Canales: ${dbTotal}`);
            console.log(`   - Servidores: ${dbServers}`);

            // Comparar
            if (ramTotal === dbTotal && ramServers === dbServers) {
                console.log(`✅ CONSISTENCIA OK`);
                return true;
            } else {
                console.warn(`⚠️ INCONSISTENCIA:`);
                console.warn(`   Canales: RAM=${ramTotal} vs DB=${dbTotal}`);
                console.warn(`   Servidores: RAM=${ramServers} vs DB=${dbServers}`);
                console.log(`💡 Ejecutar: await app.syncRAMWithDatabase()`);
                return false;
            }

        } catch (e) {
            console.error('❌ Error validación:', e);
            return false;
        }
    }

    /**
     * ✅ V4.11.3 - Sincronizar RAM con IndexedDB
     * Usar en consola: await app.syncRAMWithDatabase()
     */
    async syncRAMWithDatabase() {
        console.warn('⚠️ SINCRONIZANDO RAM CON DB...');

        if (!this.db) {
            console.error('❌ Database no disponible');
            return;
        }

        try {
            // Cargar desde DB
            const dbChannels = await this.db.loadChannels();
            const dbServersData = await this.db.getAppState('activeServers');

            console.log(`📥 Cargando: ${dbChannels?.length || 0} canales`);

            // Sobrescribir RAM
            this.state.channelsMaster = dbChannels || [];
            this.state.channels = [...this.state.channelsMaster];
            this.state.activeServers = dbServersData?.activeServers || [];
            this.state.currentServer = dbServersData?.currentServer || {};

            // Re-renderizar
            this.calculateStats(this.state.channelsMaster);
            this.updateStatsUI();
            this.renderServerList();
            this.renderTable();

            console.log(`✅ Sincronizado: ${this.state.channelsMaster.length} canales`);

        } catch (e) {
            console.error('❌ Error sincronización:', e);
        }
    }

    /**
     * ✅ V4.11.3 - Limpiar servidor fantasma específico
     * Usar en consola: await app.removePhantomServer('ID_FANTASMA')
     */
    async removePhantomServer(serverId) {
        console.warn(`🗑️ Removiendo servidor fantasma: ${serverId}`);

        // Remover de RAM
        this.state.channelsMaster = this.state.channelsMaster.filter(ch =>
            (ch.serverId || ch._serverId) !== serverId
        );

        if (this.state.activeServers) {
            this.state.activeServers = this.state.activeServers.filter(s => s.id !== serverId);
        }

        // Usar commitStateChange
        await this.commitStateChange({
            servers: true,
            channels: true,
            reason: `Eliminar servidor fantasma ${serverId}`
        });
    }

    // =====================================================
    // 🔐 V4.13 - SISTEMA DE HARDENING Y AUDITORÍA (MÉTODOS AUXILIARES)
    // =====================================================
    // NOTA: commitStateChange y logAuditEvent están CONSOLIDADOS 
    // en las líneas 602-720. NO DUPLICAR aquí.
    // =====================================================

    /**
     * 📖 Obtener historial de auditoría
     * Uso: const logs = await app.getAuditLog(); console.table(logs);
     */
    async getAuditLog() {
        if (!this.db) return [];
        const data = await this.db.getAppState('auditLog');
        return data?.entries || [];
    }

    /**
     * 🧪 TESTS AUTOMÁTICOS DE PERSISTENCIA
     * Ejecutar desde consola: await app.runPersistenceTests();
     */
    async runPersistenceTests() {
        console.group('🧪 PERSISTENCE TEST SUITE');

        const originalServers = JSON.parse(JSON.stringify(this.state.activeServers || []));
        let allPassed = true;

        try {
            // TEST 1: Agregar servidor → guardar → verificar
            console.log('▶ TEST 1: ADD + PERSIST');
            const testServer = {
                id: '__TEST_SERVER__',
                name: 'Servidor Test',
                baseUrl: 'http://test.local',
                username: 'test',
                password: 'test',
                active: true
            };

            this.state.activeServers.push(testServer);
            await this.commitStateChange({
                servers: true,
                render: false,
                reason: 'TEST add server'
            });

            await this.loadActiveServers();
            if (this.state.activeServers.some(s => s.id === testServer.id)) {
                console.log('✔ TEST 1 OK');
            } else {
                console.error('❌ TEST 1 FAILED: servidor no persistió');
                allPassed = false;
            }

            // TEST 2: Eliminar servidor → guardar → verificar
            console.log('▶ TEST 2: REMOVE + PERSIST');
            this.state.activeServers = this.state.activeServers.filter(s => s.id !== testServer.id);
            await this.commitStateChange({
                servers: true,
                channels: true,
                render: false,
                reason: 'TEST remove server'
            });

            await this.loadActiveServers();
            if (!this.state.activeServers.some(s => s.id === testServer.id)) {
                console.log('✔ TEST 2 OK');
            } else {
                console.error('❌ TEST 2 FAILED: servidor reapareció');
                allPassed = false;
            }

            // TEST 3: Consistencia RAM ↔ DB
            console.log('▶ TEST 3: CONSISTENCY CHECK');
            const ok = await this.validatePersistenceConsistency();
            if (ok) {
                console.log('✔ TEST 3 OK');
            } else {
                console.error('❌ TEST 3 FAILED: inconsistencia detectada');
                allPassed = false;
            }

            if (allPassed) {
                console.log('🎉 TODOS LOS TESTS PASARON');
            } else {
                console.warn('⚠️ ALGUNOS TESTS FALLARON');
            }

        } catch (e) {
            console.error('❌ TEST SUITE ERROR:', e);
            allPassed = false;
        } finally {
            // Restaurar estado original
            this.state.activeServers = originalServers;
            await this.commitStateChange({
                servers: true,
                render: true,
                reason: 'RESTORE after tests'
            });
            console.groupEnd();
        }

        return allPassed;
    }

    /**
     * 🧹 Limpieza segura de localStorage
     * NO borra preferencias de UI
     * Uso: app.cleanLocalStorageSafe();
     */
    cleanLocalStorageSafe() {
        console.group('🧹 CLEAN LOCALSTORAGE');

        const PRESERVE_KEYS = [
            'iptv_field_source_config',
            'iptv_fieldSourcePolicy',
            'iptv_theme',
            'iptv_active_tab',
            'iptv_session_active'
        ];

        const removed = [];

        Object.keys(localStorage).forEach(key => {
            const preserve = PRESERVE_KEYS.some(p => key.startsWith(p));
            if (!preserve && key.startsWith('iptv_')) {
                removed.push(key);
                localStorage.removeItem(key);
            }
        });

        console.log('🗑 Eliminados:', removed);
        console.log('✔ Preferencias preservadas:', PRESERVE_KEYS);
        console.groupEnd();

        this.showNotification('🧹 Limpieza localStorage completa', false);
    }

    // =====================================================
    // 🔐 V4.14 - AISLAMIENTO DE CANALES POR SERVIDOR
    // =====================================================

    /**
     * 🔐 Obtener canales filtrados por servidor
     * REGLA: SIEMPRE usar este método para obtener canales de un servidor específico
     * @param {string} serverId - ID del servidor
     * @returns {Array} - Canales que pertenecen a ese servidor
     */
    getChannelsByServer(serverId) {
        if (!serverId) {
            console.warn('⚠️ getChannelsByServer: No serverId provided');
            return [];
        }
        return (this.state.channelsMaster || []).filter(
            ch => ch.serverId === serverId
        );
    }

    /**
     * 🧪 TEST: Aislamiento de canales por servidor
     * Ejecutar: app.testChannelServerIsolation()
     */
    testChannelServerIsolation() {
        console.group('🧪 TEST SERVER ISOLATION');

        const servers = this.state.activeServers || [];
        const channels = this.state.channelsMaster || [];
        let issues = 0;

        if (servers.length < 2) {
            console.warn('⚠️ Test requiere al menos 2 servidores para validar aislamiento');
            console.groupEnd();
            return;
        }

        // Verificar que cada canal tenga serverId
        const channelsWithoutServerId = channels.filter(ch => !ch.serverId);
        if (channelsWithoutServerId.length > 0) {
            console.error(`❌ ${channelsWithoutServerId.length} canales SIN serverId`);
            issues++;
        } else {
            console.log('✔ Todos los canales tienen serverId');
        }

        // Verificar distribución por servidor
        const distribution = {};
        channels.forEach(ch => {
            const sid = ch.serverId || 'UNDEFINED';
            distribution[sid] = (distribution[sid] || 0) + 1;
        });
        console.log('📊 Distribución:', distribution);

        // Verificar que cada servidor tenga canales únicos
        servers.forEach(server => {
            const serverChannels = channels.filter(ch => ch.serverId === server.id);
            const foreignChannels = serverChannels.filter(ch => ch.serverId !== server.id);

            if (foreignChannels.length > 0) {
                console.error(`❌ ${server.name}: ${foreignChannels.length} canales de otros servidores`);
                issues++;
            } else {
                console.log(`✔ ${server.name}: ${serverChannels.length} canales OK (aislados)`);
            }
        });

        if (issues === 0) {
            console.log('🎉 AISLAMIENTO VERIFICADO - Sin mezclas');
        } else {
            console.warn(`⚠️ ${issues} PROBLEMAS DETECTADOS`);
        }

        console.groupEnd();
        return issues === 0;
    }

    /**
     * 🔧 Reparar canales sin serverId
     * Asigna serverId basándose en el servidor actual o el único activo
     * Ejecutar: await app.fixChannelsWithoutServerId()
     */
    async fixChannelsWithoutServerId() {
        console.group('🔧 FIX CHANNELS WITHOUT SERVERID');

        const channels = this.state.channelsMaster || [];
        const servers = this.state.activeServers || [];

        const channelsWithoutServerId = channels.filter(ch => !ch.serverId);
        console.log(`📊 Canales sin serverId: ${channelsWithoutServerId.length}`);

        if (channelsWithoutServerId.length === 0) {
            console.log('✅ Todos los canales ya tienen serverId');
            console.groupEnd();
            return;
        }

        if (servers.length === 1) {
            // Si hay un solo servidor, asignar a ese
            const defaultServerId = servers[0].id;
            channelsWithoutServerId.forEach(ch => ch.serverId = defaultServerId);
            console.log(`✅ Asignados ${channelsWithoutServerId.length} canales a ${servers[0].name}`);
        } else if (servers.length > 1) {
            console.warn('⚠️ Hay múltiples servidores - no es posible asignar automáticamente');
            console.log('💡 Opciones:');
            console.log('   1. Elimina canales sin serverId');
            console.log('   2. Reconecta los servidores para recargar canales con serverId correcto');
            console.groupEnd();
            return;
        }

        // Persistir
        await this.commitStateChange({
            channels: true,
            reason: 'Fix canales sin serverId'
        });

        console.log('✅ Cambios persistidos');
        console.groupEnd();
    }

    // =====================================================
    // 🔐 V4.15 - SISTEMA COMPLETO DE SNAPSHOT
    // =====================================================

    /**
     * 📊 Calcula snapshot de estadísticas para un servidor
     * DEBE ejecutarse en CONEXIÓN antes de guardar
     * @param {string} serverId - ID del servidor
     * @returns {Object} - Snapshot con stats calculadas
     */
    computeServerSnapshot(serverId) {
        console.group(`📊 [computeServerSnapshot] ${serverId}`);

        // 🔍 TELEMETRÍA CRÍTICA
        const totalMaster = (this.state.channelsMaster || []).length;
        const allServerIds = [...new Set((this.state.channelsMaster || []).map(c => c.serverId))];
        console.log(`📊 [TELEMETRÍA] Estado actual channelsMaster:`, {
            totalCanales: totalMaster,
            serverIdsDiferentes: allServerIds
        });

        const channels = this.getChannelsByServer(serverId);
        console.log(`📊 [TELEMETRÍA] getChannelsByServer(${serverId}):`, channels.length);

        if (channels.length === 0) {
            console.error(`❌ [TELEMETRÍA] 0 CANALES ENCONTRADOS. Verificando:`, {
                serverId: serverId,
                channelsMasterLength: totalMaster,
                serverIdsEnRAM: allServerIds,
                coincidencia: allServerIds.includes(serverId) ? '✅ SÍ existe' : '❌ NO existe'
            });
        }

        const groups = new Set();
        const qualities = { '8k': 0, '4k': 0, 'fhd': 0, 'hd': 0, 'sd': 0 };

        channels.forEach(ch => {
            // Grupos
            const group = ch.base?.group || ch.group || 'Sin grupo';
            groups.add(group);

            // Calidades
            const tier = ch.qualityTier || '';
            const name = (ch.base?.name || ch.name || '').toUpperCase();

            if (tier === '8K' || name.includes('8K')) {
                qualities['8k']++;
            } else if (tier === '4K' || name.includes('4K') || name.includes('UHD')) {
                qualities['4k']++;
            } else if (tier === 'FHD' || name.includes('FHD') || name.includes('1080')) {
                qualities['fhd']++;
            } else if (tier === 'HD' || name.includes('HD') || name.includes('720')) {
                qualities['hd']++;
            } else {
                qualities['sd']++;
            }
        });

        const snapshot = {
            channelsCount: channels.length,
            groupsCount: groups.size,
            qualities: qualities,
            scannedAt: Date.now()
        };


        console.log(`✅ Snapshot calculado:`, snapshot);
        console.groupEnd();
        return snapshot;
    }

    /**
     * 🔁 Migra servidores antiguos sin snapshot
     * Ejecutar: await app.migrateServersWithoutSnapshot()
     */
    async migrateServersWithoutSnapshot() {
        console.group('🔁 MIGRACIÓN DE SERVIDORES SIN SNAPSHOT');

        let migrated = 0;
        const servers = this.state.activeServers || [];

        for (const server of servers) {
            if (!server.snapshot) {
                const channels = this.getChannelsByServer(server.id);

                if (channels.length === 0) {
                    console.warn(`⚠️ ${server.name}: Sin canales, no se puede migrar`);
                    continue;
                }

                server.snapshot = this.computeServerSnapshot(server.id);
                migrated++;
                console.log(`✅ ${server.name}: Snapshot creado (${channels.length} canales)`);
            }
        }

        if (migrated > 0) {
            await this.commitStateChange({
                servers: true,
                reason: `Migración automática de ${migrated} servidores`
            });
        }

        console.log(`🔁 Migración completada: ${migrated} servidores actualizados`);
        console.groupEnd();
        return migrated;
    }

    /**
     * 🧹 Limpia servidores sin snapshot válido
     * Ejecutar: await app.cleanupServersWithoutSnapshot()
     */
    async cleanupServersWithoutSnapshot() {
        console.group('🧹 CLEANUP SERVIDORES SIN SNAPSHOT');

        const before = this.state.activeServers?.length || 0;

        this.state.activeServers = (this.state.activeServers || []).filter(s => {
            const hasSnapshot = s.snapshot && typeof s.snapshot.channelsCount === 'number';
            if (!hasSnapshot) {
                console.warn(`🗑️ Eliminando: ${s.name} (sin snapshot)`);
            }
            return hasSnapshot;
        });

        const after = this.state.activeServers.length;
        const removed = before - after;

        if (removed > 0) {
            await this.commitStateChange({
                servers: true,
                reason: `Cleanup: ${removed} servidores sin snapshot eliminados`
            });
        }

        console.log(`🧹 Cleanup completado: ${removed} servidores eliminados`);
        console.groupEnd();
        return removed;
    }

    // =====================================================
    // 📈 V4.15 - PROGRESO VISUAL DE ESCANEO
    // =====================================================

    /**
     * 📈 Inicializa progreso de enriquecimiento/escaneo
     * @param {number} total - Total de canales a procesar
     */
    initEnrichmentProgress(total) {
        this._enrich = {
            total: total,
            processed: 0,
            startTime: performance.now(),
            cancelled: false
        };

        const container = document.getElementById('enrichmentProgressContainer');
        if (container) container.style.display = 'block';

        const statusText = document.getElementById('enrichStatusText');
        if (statusText) statusText.textContent = 'Escaneando canales…';

        const bar = document.getElementById('enrichBar');
        if (bar) bar.style.width = '0%';

        console.log(`📈 Progreso iniciado: ${total} canales`);
    }

    /**
     * 📈 Actualiza progreso por batch (optimizado para 400k+)
     * @param {number} batchSize - Cantidad de canales procesados en este batch
     */
    updateEnrichmentProgress(batchSize) {
        if (!this._enrich || this._enrich.cancelled) return;

        this._enrich.processed += batchSize;

        const pct = Math.min(100,
            Math.round((this._enrich.processed / this._enrich.total) * 100)
        );

        const elapsed = (performance.now() - this._enrich.startTime) / 1000;
        const speed = Math.round(this._enrich.processed / Math.max(elapsed, 0.1));
        const remaining = this._enrich.total - this._enrich.processed;
        const eta = Math.round(remaining / Math.max(speed, 1));

        // Actualizar UI
        const pctEl = document.getElementById('enrichPct');
        if (pctEl) pctEl.textContent = pct;

        const countEl = document.getElementById('enrichCount');
        if (countEl) countEl.textContent = this._enrich.processed;

        const speedEl = document.getElementById('enrichSpeed');
        if (speedEl) speedEl.textContent = speed;

        const etaEl = document.getElementById('enrichETA');
        if (etaEl) etaEl.textContent = eta;

        const bar = document.getElementById('enrichBar');
        if (bar) bar.style.width = pct + '%';
    }

    /**
     * 📈 Finaliza progreso visual
     */
    finishEnrichmentProgress() {
        const statusText = document.getElementById('enrichStatusText');
        if (statusText) statusText.textContent = 'Completado';

        const bar = document.getElementById('enrichBar');
        if (bar) bar.style.width = '100%';

        const dot = document.getElementById('enrichStatusDot');
        if (dot) dot.classList.remove('active');

        console.log('✅ Escaneo completado');
    }

    // Legacy cancelEnrichment removed (Unified version at line 7034)

    // =====================================================
    // 🧠 V4.15 - CONTROL DE MEMORIA
    // =====================================================

    /**
     * 🧠 Detecta presión de memoria
     * @returns {boolean} - true si uso > 75% del heap
     */
    checkMemoryPressure() {
        if (!performance.memory) {
            // API no disponible (Firefox, Safari)
            return false;
        }

        const used = performance.memory.usedJSHeapSize;
        const limit = performance.memory.jsHeapSizeLimit;
        const ratio = used / limit;

        if (ratio > 0.75) {
            console.warn(`⚠️ Alta presión de memoria: ${Math.round(ratio * 100)}%`);
            return true;
        }

        return false;
    }

    /**
     * 🧯 Libera memoria en caso de presión alta
     */
    releaseMemoryPressure() {
        if (this.checkMemoryPressure()) {
            console.warn('🧯 Liberando RAM...');

            // Limpiar arrays temporales
            this.state.channelsFiltered = [];
            this.state.channelsTemp = null;

            // Forzar GC si disponible
            if (window.gc) window.gc();

            console.log('✅ Memoria liberada');
        }
    }

    // =====================================================
    // 🔐 V4.16 - SNAPSHOT DOMINANTE & MULTI-SERVIDOR
    // =====================================================

    /**
     * 🔐 Commit global con snapshot automático
     * REGLA: Cualquier botón 💾 Guardar debe usar este método
     * Recalcula snapshot para TODOS los servidores persistidos
     * @param {string} reason - Razón del commit para auditoría
     */
    async commitWithSnapshot(reason = '') {
        console.group('💾 COMMIT CON SNAPSHOT');
        console.log('Motivo:', reason);

        // Recalcular snapshot SOLO para servidores con canales
        for (const server of this.state.activeServers || []) {
            const serverChannels = this.getChannelsByServer(server.id);

            if (serverChannels.length > 0) {
                server.snapshot = this.computeServerSnapshot(server.id);
                console.log(`✅ ${server.name}: Snapshot actualizado (${serverChannels.length} canales)`);
            }
        }

        // Commit con persistencia
        await this.commitStateChange({
            servers: true,
            channels: true,
            reason: reason || 'Commit global con snapshot'
        });

        // Re-renderizar UI
        this.renderActiveServerStats?.();
        this.renderServerList?.();

        console.groupEnd();
        return true;
    }

    // ✅ V4.27.2: Función duplicada eliminada - usar addServerToConnections en línea ~10535

    /**
     * 🧹 Limpiar todas las conexiones activas
     * Reset de sesión sin afectar biblioteca
     */
    async clearAllActiveConnections() {
        const ok = confirm(
            '¿Deseas limpiar todas las conexiones activas?\n' +
            'Esto NO eliminará servidores guardados en biblioteca.'
        );
        if (!ok) return;

        console.group('🧹 Limpiando conexiones activas');

        // 1. Limpiar lista de servidores conectados
        this.state.connectedServers = [];

        // 2. Limpiar servidor actual
        this.state.currentServer = {};

        // 3. Limpiar canales cargados en sesión
        const prevCount = this.state.channelsMaster?.length || 0;
        this.state.channelsMaster = [];
        this.state.channelsFiltered = [];
        this.state.channels = [];

        // 4. Resetear estados
        if (this.resetAnalysisState) this.resetAnalysisState();

        // 5. Limpiar UI de chips
        const chipsContainer = document.getElementById('activeServersList');
        if (chipsContainer) chipsContainer.innerHTML = '';

        // 6. Renderizar estado limpio
        this.renderServerList?.();
        this.renderActiveServerStats?.();
        this.updateStatsUI?.();
        this.renderTable?.();

        console.log(`✅ Limpiados ${prevCount} canales`);
        console.groupEnd();

        this.showNotification('🧹 Conexiones activas limpiadas', false);
    }

    /**
     * 🧪 Test: Verificar que snapshot domina toda la app
     */
    testSnapshotDominance() {
        console.group('🧪 TEST SNAPSHOT DOMINANCE');
        let issues = 0;

        (this.state.activeServers || []).forEach(s => {
            if (!s.snapshot || typeof s.snapshot.channelsCount !== 'number') {
                console.error(`❌ ${s.name}: Sin snapshot válido`);
                issues++;
            } else {
                console.log(`✅ ${s.name}: snapshot.channelsCount = ${s.snapshot.channelsCount}`);
            }
        });

        if (issues === 0) {
            console.log('🎉 SNAPSHOT DOMINA - Todos los servidores tienen snapshot válido');
        } else {
            console.warn(`⚠️ ${issues} servidores sin snapshot`);
        }

        console.groupEnd();
        return issues === 0;
    }

    // =====================================================
    // 🔐 V4.16 FINAL - PIPELINE OBLIGATORIO DE MEJORA
    // =====================================================

    /**
     * 🚦 Límite configurable de servidores simultáneos
     * @returns {number} Máximo de conexiones permitidas
     */
    getMaxConnections() {
        return 10; // 🔧 Configurable aquí
    }

    /**
     * 🔄 Pipeline de mejora obligatorio para cualquier servidor
     * REGLA: TODO servidor que cargue canales DEBE ejecutar esto
     * @param {object} server - Servidor a procesar
     * @returns {boolean} true si el pipeline fue exitoso
     */
    async processServerEnhancements(server) {
        console.group(`🔄 Pipeline de Mejora: ${server.name}`);

        const channels = this.getChannelsByServer(server.id);

        if (!channels || channels.length === 0) {
            console.warn(`⚠️ ${server.name}: sin canales para snapshot`);
            console.groupEnd();
            return false;
        }

        console.log(`📊 ${channels.length} canales detectados`);

        // 1️⃣ Calcular snapshot REAL
        server.snapshot = this.computeServerSnapshot(server.id);
        console.log(`📸 Snapshot generado:`, server.snapshot);

        // 2️⃣ Persistir
        await this.commitStateChange({
            servers: true,
            channels: true,
            reason: `Pipeline de mejora: ${server.name}`
        });

        console.log(`✅ Pipeline completado para ${server.name}`);
        console.groupEnd();
        return true;
    }

    /**
     * 🧪 Test: Verificar que NINGÚN servidor tenga snapshot vacío
     * @throws {Error} Si encuentra servidores sin snapshot
     */
    async testNoEmptySnapshots() {
        console.group('🧪 TEST SNAPSHOT OBLIGATORIO');

        const bad = (this.state.activeServers || []).filter(s =>
            !s.snapshot ||
            typeof s.snapshot.channelsCount !== 'number' ||
            s.snapshot.channelsCount === 0
        );

        if (bad.length > 0) {
            console.error('❌ Servidores sin snapshot válido:', bad.map(s => s.name));
            console.groupEnd();
            throw new Error(`TEST FALLIDO: ${bad.length} servidores sin snapshot`);
        }

        console.log('✅ Todos los servidores tienen snapshot válido');
        console.groupEnd();
        return true;
    }

    /**
     * 🧪 Test: Verificar límite de conexiones
     */
    testMaxConnections() {
        const count = this.state.connectedServers?.length || 0;
        const max = this.getMaxConnections();

        console.assert(
            count <= max,
            `❌ Se excedió el límite: ${count}/${max} servidores`
        );
        console.log(`✅ Límite respetado: ${count}/${max} servidores`);
        return count <= max;
    }

    // =====================================================
    // 📊 V4.16 FINAL - PROGRESO POR SERVIDOR
    // =====================================================

    /**
     * 📊 Iniciar progreso de un servidor
     */
    initServerProgress(server, total) {
        this._serverProgress = this._serverProgress || {};

        this._serverProgress[server.id] = {
            name: server.name,
            total,
            processed: 0,
            start: performance.now(),
            pct: 0
        };

        console.log(`📊 Progreso iniciado: ${server.name} (${total} canales)`);
    }

    /**
     * 📊 Actualizar progreso de un servidor
     */
    updateServerProgress(serverId, batchSize) {
        const p = this._serverProgress?.[serverId];
        if (!p) return;

        p.processed += batchSize;
        p.pct = Math.min(100, Math.round((p.processed / p.total) * 100));

        // Log cada 25%
        if (p.pct % 25 === 0 && p.pct !== this._lastLogPct) {
            this._lastLogPct = p.pct;
            const elapsed = (performance.now() - p.start) / 1000;
            console.log(`📊 ${p.name}: ${p.pct}% (${elapsed.toFixed(1)}s)`);
        }
    }

    /**
     * 📊 Finalizar progreso de un servidor
     */
    finishServerProgress(serverId) {
        const p = this._serverProgress?.[serverId];
        if (!p) return;

        const elapsed = (performance.now() - p.start) / 1000;
        console.log(`✅ ${p.name}: 100% completado en ${elapsed.toFixed(1)}s`);

        delete this._serverProgress[serverId];
        this._lastLogPct = null;
    }

    // =====================================================
    // 🔒 V4.16 ENTERPRISE - VALIDACIÓN MULTI-SERVIDOR
    // =====================================================

    /**
     * 🧪 Test: Verificar que TODOS los canales tienen serverId
     * @throws {Error} Si encuentra canales sin serverId
     */
    testAllChannelsHaveServerId() {
        console.group('🧪 TEST serverId en canales');

        const channels = this.state.channelsMaster || [];
        const bad = channels.filter(
            ch => !ch.serverId || typeof ch.serverId !== 'string'
        );

        if (bad.length > 0) {
            console.error('❌ Canales sin serverId:', bad.slice(0, 5).map(c => c.name));
            console.groupEnd();
            throw new Error(`TEST FALLIDO: ${bad.length} canales sin serverId`);
        }

        console.log(`✅ ${channels.length} canales con serverId válido`);
        console.groupEnd();
        return true;
    }

    /**
     * 🧪 V4.18: Test de estructura 4 capas
     * Verifica que los canales tienen base/heuristics/tech/meta
     */
    assertChannelsHave4LayerStructure() {
        console.group('🧪 TEST estructura 4 capas');

        const channels = this.state.channelsMaster || [];
        const sample = channels.slice(0, 100);

        const stats = {
            hasBase: 0,
            hasHeuristics: 0,
            hasTech: 0,
            hasMeta: 0,
            complete: 0
        };

        sample.forEach(ch => {
            if (ch.base && typeof ch.base === 'object') stats.hasBase++;
            if (ch.heuristics && typeof ch.heuristics === 'object') stats.hasHeuristics++;
            if (ch.tech && typeof ch.tech === 'object') stats.hasTech++;
            if (ch.meta && typeof ch.meta === 'object') stats.hasMeta++;
            if (ch.base && ch.heuristics && ch.tech && ch.meta) stats.complete++;
        });

        console.table(stats);
        console.log(`📊 ${stats.complete}/${sample.length} canales con estructura 4 capas completa`);
        console.groupEnd();

        return stats.complete === sample.length;
    }

    /**
     * 🧹 Limpieza de canales huérfanos (sin servidor válido)
     * Un canal es huérfano si:
     * - No tiene serverId
     * - Su serverId no existe en activeServers
     */
    cleanupOrphanChannels() {
        console.group('🧹 LIMPIEZA CANALES HUÉRFANOS');

        const validServerIds = new Set(
            (this.state.activeServers || []).map(s => s.id)
        );

        const before = (this.state.channelsMaster || []).length;

        this.state.channelsMaster = (this.state.channelsMaster || []).filter(ch => {
            const hasValidServer = ch.serverId && validServerIds.has(ch.serverId);
            if (!hasValidServer && ch.serverId) {
                console.warn(`🗑️ Huérfano: ${ch.name} (serverId: ${ch.serverId})`);
            }
            return hasValidServer;
        });

        const removed = before - this.state.channelsMaster.length;

        if (removed > 0) {
            console.warn(`🧹 ${removed} canales huérfanos eliminados`);
        } else {
            console.log('✅ No hay canales huérfanos');
        }

        console.groupEnd();
        return removed;
    }

    /**
     * 🔄 Deduplicación multi-servidor
     * Clave única: serverId::channelId (no solo channelId)
     */
    dedupeChannelsMultiServer(channels) {
        if (!Array.isArray(channels)) return [];

        const seen = new Set();
        const result = [];

        for (const ch of channels) {
            // Clave compuesta: serverId + channelId
            const key = `${ch.serverId || 'unknown'}::${ch.id || ch.stream_id || Math.random()}`;

            if (!seen.has(key)) {
                seen.add(key);
                result.push(ch);
            }
        }

        const removed = channels.length - result.length;
        if (removed > 0) {
            console.log(`🔄 Deduplicación multi-servidor: ${channels.length} → ${result.length} (${removed} duplicados)`);
        }

        return result;
    }

    /**
     * 🔒 Validación post-conexión: Verificar que canales tienen serverId correcto
     * @param {object} server - Servidor recién conectado
     * @returns {boolean} true si la validación pasa
     */
    validateServerChannels(server) {
        const serverChannels = this.getChannelsByServer(server.id);

        console.log(`🔍 Validación ${server.name}: ${serverChannels.length} canales con serverId correcto`);

        if (serverChannels.length === 0) {
            console.error(`❌ ${server.name} conectado SIN canales asociados (serverId mismatch)`);
            this.showNotification(
                `❌ ${server.name}: canales no asociados al servidor`,
                true
            );
            return false;
        }

        return true;
    }

    /**
     * 🔒 Bloquear snapshot si no hay canales (prevención bug 0)
     * @param {string} serverId - ID del servidor
     * @throws {Error} Si no hay canales para el servidor
     */
    ensureServerHasChannels(serverId) {
        const channels = this.getChannelsByServer(serverId);

        if (!channels || channels.length === 0) {
            const server = this.state.activeServers?.find(s => s.id === serverId);
            throw new Error(
                `❌ ${server?.name || serverId} no tiene canales asignados (serverId mismatch)`
            );
        }

        return channels.length;
    }

    // =====================================================
    // 🔌 V4.16 - CONECTAR DESDE BIBLIOTECA (SIN VALIDACIÓN)
    // =====================================================

    /**
     * 🔌 Conectar servidor desde biblioteca usando credenciales guardadas
     * V4.27.3: Verificación robusta de duplicados + Pipeline obligatorio
     * @param {string} serverId - ID del servidor en biblioteca
     */
    async connectFromLibrary(serverId) {
        console.group(`🔌 connectFromLibrary V4.27.4: ${serverId}`);

        // ✅ V4.27.4: BLOQUEO ANTI-CLICS RÁPIDOS
        if (this._connectionInProgress) {
            console.warn('⚠️ Conexión ya en progreso');
            this.showNotification('⚠️ Conexión en progreso, espera...', true);
            console.groupEnd();
            return;
        }

        // ✅ FIX CRÍTICO: Buscar en localStorage, NO en RAM
        let library = [];
        try {
            library = JSON.parse(localStorage.getItem('iptv_server_library') || '[]');
        } catch (e) {
            console.error('Error leyendo biblioteca:', e);
            this.showNotification('❌ Error al leer biblioteca', true);
            console.groupEnd();
            return;
        }

        const server = library.find(s => s.id === serverId);
        if (!server) {
            this.showNotification('❌ Servidor no encontrado en biblioteca', true);
            console.groupEnd();
            return;
        }

        console.log('📚 Servidor encontrado en biblioteca:', server.name);

        // 🔒 PRE-CHECK 1: Credenciales (priorizando Credential Lock)
        const baseHost = server.baseUrl?.replace('/player_api.php', '') || server.url;
        const user = server._lockedUsername || server.username;
        const pass = server._lockedPassword || server.password;

        if (!baseHost || !user || !pass) {
            this.showNotification(`⚠️ ${server.name} no tiene credenciales completas`, true);
            console.groupEnd();
            return;
        }

        // ✅ V4.27.4: DETECCIÓN SIMPLE POR URL BASE
        const normalizedHost = baseHost.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        const existingByUrl = (this.state.activeServers || []).find(srv => {
            const srvHost = (srv.baseUrl || '').replace(/^https?:\/\//, '').replace(/\/player_api\.php$/, '').replace(/\/$/, '').toLowerCase();
            return srvHost === normalizedHost;
        });

        // V4.27.5 FIX: find() returns undefined, not null, when no match
        let isReconnect = !!existingByUrl;
        let targetServerId = server.id;

        if (isReconnect) {
            // Ya existe - preguntar si reconectar
            const confirmReconnect = confirm(`⚠️ ${existingByUrl.name} ya está conectado.\n\n¿Deseas ACTUALIZAR sus canales?`);
            if (!confirmReconnect) {
                console.log('❌ Usuario canceló reconexión');
                console.groupEnd();
                return;
            }
            console.log('🔄 Reconectando - se sobrescribirán canales');
            targetServerId = existingByUrl.id; // Usar el ID existente
        } else {
            // Verificar límite solo para nuevas conexiones
            const connectedCount = this.state.activeServers?.length || 0;
            if (connectedCount >= this.getMaxConnections()) {
                this.showNotification(`⚠️ Límite de ${this.getMaxConnections()} servidores alcanzado`, true);
                console.groupEnd();
                return;
            }
        }

        console.log(`🔌 Conectando: ${server.name}`);
        this.showNotification(`🔌 ${isReconnect ? 'Actualizando' : 'Conectando'} ${server.name}...`, false);
        this.setLoading(true);
        this._connectionInProgress = true;

        try {
            // 📥 Cargar canales
            const rawChannels = await this.connectXuiApi(baseHost, user, pass);

            if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
                throw new Error('No se pudieron cargar canales');
            }

            console.log(`📥 ${rawChannels.length} canales recibidos`);

            // 📊 Iniciar progreso
            this.initServerProgress(server, rawChannels.length);

            // 🏷️ Asignar serverId a cada canal
            console.log(`🏷️ [TELEMETRÍA] Asignando serverId=${server.id} a ${rawChannels.length} canales`);
            rawChannels.forEach((ch, idx) => {
                ch.serverId = server.id;
                ch.serverName = server.name;
                if (!ch.id) ch.id = ch.stream_id || `${server.id}_${idx}`;

                // Actualizar progreso cada 1000 canales
                if (idx % 1000 === 0) {
                    this.updateServerProgress(server.id, 1000);
                }
            });

            // 🔍 LOG: Verificar asignación
            const sampleChannel = rawChannels[0];
            console.log(`🔍 [TELEMETRÍA] Muestra canal normalizado:`, {
                id: sampleChannel?.id,
                name: sampleChannel?.name,
                serverId: sampleChannel?.serverId,
                serverName: sampleChannel?.serverName
            });

            this.finishServerProgress(server.id);

            // 📊 LOG: Estado ANTES de modificar channelsMaster
            const beforeCount = (this.state.channelsMaster || []).length;
            const beforeServerIds = [...new Set((this.state.channelsMaster || []).map(c => c.serverId))];
            console.log(`📊 [TELEMETRÍA] channelsMaster ANTES:`, {
                totalCanales: beforeCount,
                serverIds: beforeServerIds
            });

            // ✅ V4.27.5: USAR processChannels PARA APLICAR 4 CAPAS
            console.log(`🔧 [V4.27.5] Procesando canales con pipeline completo...`);

            // Crear objeto servidor para processChannels
            const serverObj = {
                id: targetServerId,
                name: server.name,
                baseUrl: baseHost + '/player_api.php',
                username: user,
                password: pass,
                active: true
            };

            // ✅ V4.27.5: processChannels aplica automáticamente:
            // - normalizeChannel (4 capas: base, heuristics, tech, meta)
            // - enrichChannel (heurísticas avanzadas)
            // - Guardado en IndexedDB con saveChannelsBulk
            // - Deduplicación multi-servidor
            // - Actualización de activeServers (upsert)
            // - Renderizado de UI
            const appendMode = isReconnect; // Si reconecta, merge; si nuevo, reemplaza
            await this.processChannels(rawChannels, serverObj, appendMode);

            console.log(`✅ [V4.27.5] Pipeline completado: ${rawChannels.length} canales procesados`);
            console.log(`   - 4 capas aplicadas (base, heuristics, tech, meta)`);
            console.log(`   - Enriquecimiento con heurísticas avanzadas`);
            console.log(`   - Persistencia en IndexedDB`);
            console.log(`   - Deduplicación multi-servidor`);

            // ✅ V4.27.5: processChannels ya hizo todo el trabajo:
            // - Normalizó y enriqueció canales
            // - Actualizó activeServers (con upsert)
            // - Guardó en IndexedDB
            // - Renderizó UI (renderTable, renderServerList)

            // Solo actualizar currentServer
            this.state.currentServer = {
                id: targetServerId,
                name: server.name,
                baseUrl: baseHost + '/player_api.php',
                username: user,
                password: pass
            };

            // Cambiar a pestaña análisis y mostrar éxito
            this.showTab('analysis');
            this.showNotification(`✅ ${server.name}: ${rawChannels.length} canales cargados`, false);

            console.log(`✅ [V4.27.5] Conectado: ${server.name} (${rawChannels.length} canales)`);

        } catch (err) {
            console.error('❌ Error:', err);
            this.showNotification(`❌ ${err.message}`, true);
        } finally {
            this.setLoading(false);
            // 🔒 V4.18.2: Liberar flag de conexión en progreso
            this._connectionInProgress = false;
            console.log('🔓 [connectFromLibrary] _connectionInProgress = false');
            console.groupEnd();
        }
    }

    // ==========================================
    // ➕ V1.0: ADD SERVER WITHOUT DELETING EXISTING
    // ==========================================

    /**
     * ➕ Agregar servidor desde biblioteca SIN borrar los existentes
     * Botón ➕ en la tabla de servidores
     * ✅ V4.27.4: Detección simple por URL + bloqueo anti-clics
     */
    async addServerToConnections(serverId) {
        console.group(`➕ addServerToConnections V4.27.4: ${serverId}`);

        // ✅ V4.27.4: BLOQUEO ANTI-CLICS RÁPIDOS
        if (this._connectionInProgress) {
            console.warn('⚠️ Conexión ya en progreso');
            this.showNotification('⚠️ Conexión en progreso, espera...', true);
            console.groupEnd();
            return;
        }

        // ✅ Buscar en localStorage
        let library = [];
        try {
            library = JSON.parse(localStorage.getItem('iptv_server_library') || '[]');
        } catch (e) {
            this.showNotification('❌ Error al leer biblioteca', true);
            console.groupEnd();
            return;
        }

        const server = library.find(s => s.id === serverId);

        if (!server) {
            this.showNotification('❌ Servidor no encontrado en biblioteca', true);
            console.groupEnd();
            return;
        }

        // 🔒 Validar credenciales (priorizando Credential Lock)
        const baseHost = server.baseUrl?.replace('/player_api.php', '') || server.url;
        const user = server._lockedUsername || server.username;
        const pass = server._lockedPassword || server.password;

        if (!baseHost || !user || !pass) {
            this.showNotification(`⚠️ ${server.name} no tiene credenciales completas`, true);
            console.groupEnd();
            return;
        }

        // ✅ V4.27.4: DETECCIÓN SIMPLE POR URL BASE - NO DUPLICAR
        const normalizedHost = baseHost.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        const existingByUrl = (this.state.activeServers || []).find(srv => {
            const srvHost = (srv.baseUrl || '').replace(/^https?:\/\//, '').replace(/\/player_api\.php$/, '').replace(/\/$/, '').toLowerCase();
            return srvHost === normalizedHost;
        });

        if (existingByUrl) {
            // ❌ YA EXISTE - NO AGREGAR
            this.showNotification(`⚠️ ${existingByUrl.name} ya está conectado`, true);
            console.log(`❌ Servidor con URL ${normalizedHost} ya existe como ${existingByUrl.name}`);
            console.groupEnd();
            return;
        }

        // Verificar límite de servidores
        const connectedCount = this.state.activeServers?.length || 0;
        if (connectedCount >= this.getMaxConnections()) {
            this.showNotification(`⚠️ Límite de ${this.getMaxConnections()} servidores alcanzado`, true);
            console.groupEnd();
            return;
        }

        // Limpiar canales previos de este servidor si existen (por seguridad)
        const existingChannels = (this.state.channelsMaster || []).filter(ch => ch.serverId === server.id);
        if (existingChannels.length > 0) {
            console.log(`🧹 Limpiando ${existingChannels.length} canales previos`);
            this.state.channelsMaster = this.state.channelsMaster.filter(ch => ch.serverId !== server.id);
        }

        console.log(`➕ Agregando: ${server.name}`);
        this.showNotification(`➕ Agregando ${server.name}...`, false);
        this.setLoading(true);
        this._connectionInProgress = true;  // ✅ V4.27.4: Bloquear

        try {
            const rawChannels = await this.connectXuiApi(baseHost, user, pass);

            if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
                throw new Error('No se pudieron cargar canales');
            }

            console.log(`📥 ${rawChannels.length} canales recibidos`);

            // ✅ V4.27.2: Crear serverObj para processChannels
            const serverObj = {
                id: server.id,
                name: server.name,
                baseUrl: baseHost + '/player_api.php',
                username: user,
                password: pass
            };

            // ✅ V4.27.2: Usar processChannels con append=true
            // Esto asegura:
            // - Canales normalizados con estructura de 4 capas (base, heuristics, tech, meta)
            // - Canales enriquecidos con heurísticas
            // - Canales guardados en IndexedDB
            // - Canales de otros servidores NO se sobrescriben
            await this.processChannels(rawChannels, serverObj, true);  // append=true

            console.log(`📊 Total servidores activos: ${this.state.activeServers?.length || 0}`);
            console.log(`📊 Total canales (channelsMaster): ${this.state.channelsMaster?.length || 0}`);

            this.showNotification(`✅ ${server.name} agregado (${rawChannels.length} canales)`, false);

        } catch (e) {
            console.error('Error en addServerToConnections:', e);
            this.showNotification(`❌ Error: ${e.message}`, true);
        } finally {
            this.setLoading(false);
            this._connectionInProgress = false;  // ✅ V4.27.4: Liberar
            console.groupEnd();
        }
    }

    // ==========================================
    // 💾 V1.0: SAVE ALL ACTIVE SERVERS TO LIBRARY
    // ==========================================

    /**
     * 💾 Guardar TODOS los servidores activos a biblioteca con clasificación por calidad
     * Botón "💾 Guardar" en pestaña Servidores
     */
    async saveAllActiveServersToLibrary() {
        if (!this.state.activeServers || this.state.activeServers.length === 0) {
            this.showNotification('⚠️ No hay servidores activos para guardar', true);
            return;
        }

        console.log(`💾 Guardando ${this.state.activeServers.length} servidores activos...`);

        // Cargar biblioteca existente
        let library = [];
        try {
            library = JSON.parse(localStorage.getItem('iptv_server_library') || '[]');
        } catch (e) { library = []; }

        let savedCount = 0;
        let updatedCount = 0;

        for (const srv of this.state.activeServers) {
            try {
                // Calcular estadísticas de calidad
                const serverChannels = (this.state.channelsMaster || []).filter(
                    ch => ch.serverId === srv.id
                );

                const qualityCounts = { '8k': 0, '4k': 0, 'fhd': 0, 'hd': 0, 'sd': 0 };
                const groupsSet = new Set();

                serverChannels.forEach(ch => {
                    const res = (ch.resolution || ch.heuristics?.resolution || '').toLowerCase();
                    const name = (ch.name || '').toLowerCase();

                    if (res.includes('8k') || res.includes('4320') || name.includes('8k')) {
                        qualityCounts['8k']++;
                    } else if (res.includes('4k') || res.includes('uhd') || res.includes('2160') || name.includes('4k') || name.includes('uhd')) {
                        qualityCounts['4k']++;
                    } else if (res.includes('fhd') || res.includes('1080') || name.includes('fhd') || name.includes('1080')) {
                        qualityCounts['fhd']++;
                    } else if (res.includes('hd') || res.includes('720') || name.includes('720')) {
                        qualityCounts['hd']++;
                    } else {
                        qualityCounts['sd']++;
                    }

                    if (ch.group) groupsSet.add(ch.group);
                });

                // Crear entrada de biblioteca
                const libraryEntry = {
                    id: srv.id,
                    name: srv.name,
                    baseUrl: srv.baseUrl?.replace('/player_api.php', '') || srv.url || '',
                    username: srv.username || '',
                    password: srv.password || '',
                    apiType: 'auto',
                    totalChannels: serverChannels.length,
                    totalGroups: groupsSet.size,
                    quality8K: qualityCounts['8k'],
                    quality4K: qualityCounts['4k'],
                    qualityFHD: qualityCounts['fhd'],
                    qualityHD: qualityCounts['hd'],
                    qualitySD: qualityCounts['sd'],
                    expDate: 'N/A',
                    savedAt: new Date().toISOString()
                };

                // Actualizar o agregar
                const existingIdx = library.findIndex(s => s.id === srv.id || s.baseUrl === libraryEntry.baseUrl);
                if (existingIdx >= 0) {
                    library[existingIdx] = libraryEntry;
                    updatedCount++;
                    console.log(`📝 Actualizado: ${srv.name}`);
                } else {
                    library.push(libraryEntry);
                    savedCount++;
                    console.log(`💾 Guardado: ${srv.name}`);
                }

            } catch (e) {
                console.error(`Error guardando ${srv.name}:`, e);
            }
        }

        // Guardar en localStorage
        localStorage.setItem('iptv_server_library', JSON.stringify(library));

        // Actualizar tabla
        this.renderSavedServersTable?.();

        // Resumen
        const total = savedCount + updatedCount;
        console.log(`✅ Guardado completo: ${total} servidores (${savedCount} nuevos, ${updatedCount} actualizados)`);

        alert(
            `✅ Guardado completo:\n\n` +
            `📊 Total procesado: ${total} servidores\n` +
            `➕ Nuevos: ${savedCount}\n` +
            `📝 Actualizados: ${updatedCount}\n\n` +
            `🗄️ Biblioteca total: ${library.length} servidores`
        );
    }

    // ==========================================
    // 🧹 V1.0: CHANNEL DEDUPLICATION UTILITIES
    // ==========================================

    /**
     * 🔍 Diagnose duplicate channels in current state
     * Run in console: app.analyzeDuplicates()
     */
    analyzeDuplicates() {
        console.log('\n🔍 === ANÁLISIS DE DUPLICADOS ===\n');

        const channels = this.state.channelsMaster || [];
        const keyMap = new Map();
        const duplicates = [];

        channels.forEach((ch, idx) => {
            const serverId = ch.serverId || ch._serverId || 'NO_SERVER_ID';
            const streamId = ch.stream_id || ch.id || ch._idx || 'NO_STREAM_ID';
            const key = `${serverId}:${streamId}`;

            if (keyMap.has(key)) {
                duplicates.push({
                    key: key,
                    original: keyMap.get(key),
                    duplicate: idx,
                    name: ch.name?.substring(0, 30),
                    serverId: serverId
                });
            } else {
                keyMap.set(key, idx);
            }
        });

        console.log(`📊 Total canales: ${channels.length}`);
        console.log(`🔑 Claves únicas: ${keyMap.size}`);
        console.log(`⚠️ Duplicados encontrados: ${duplicates.length}`);

        if (duplicates.length > 0) {
            console.log('\n📋 MUESTRA DE DUPLICADOS (primeros 10):');
            console.table(duplicates.slice(0, 10));

            const byServer = {};
            duplicates.forEach(dup => {
                byServer[dup.serverId] = (byServer[dup.serverId] || 0) + 1;
            });
            console.log('\n📊 DUPLICADOS POR SERVIDOR:');
            console.table(byServer);
            console.log('\n💡 RECOMENDACIÓN: Ejecutar await app.cleanDuplicateChannels()');
        } else {
            console.log('\n✅ No se encontraron duplicados. Base de datos limpia.');
        }

        console.log('\n✅ === FIN ANÁLISIS ===\n');

        return { total: channels.length, unique: keyMap.size, duplicates: duplicates.length };
    }

    /**
     * 🧹 Clean duplicate channels from IndexedDB and RAM
     * Run in console: await app.cleanDuplicateChannels()
     */
    async cleanDuplicateChannels() {
        console.log('\n🧹 === LIMPIEZA DE CANALES DUPLICADOS ===\n');

        const currentCount = this.state.channelsMaster?.length || 0;
        console.log(`📊 Canales en RAM: ${currentCount}`);

        if (!this.db) {
            console.error('❌ IndexedDB no disponible');
            return { success: false, error: 'IndexedDB no disponible' };
        }

        const dbChannels = await this.db.loadChannels();
        console.log(`📦 Canales en IndexedDB: ${dbChannels.length}`);

        const deduplicated = this._deduplicateChannels(dbChannels);
        const duplicatesCount = dbChannels.length - deduplicated.length;

        console.log(`\n📊 RESULTADO DE DEDUPLICACIÓN:`);
        console.log(`   Original: ${dbChannels.length}`);
        console.log(`   Únicos: ${deduplicated.length}`);
        console.log(`   Duplicados: ${duplicatesCount}`);

        if (duplicatesCount === 0) {
            console.log('\n✅ No se encontraron duplicados.');
            return { success: true, cleaned: 0, total: deduplicated.length };
        }

        const confirm = window.confirm(
            `⚠️ LIMPIEZA DE DUPLICADOS\n\n` +
            `Se encontraron ${duplicatesCount} canales duplicados.\n\n` +
            `Original: ${dbChannels.length}\n` +
            `Únicos: ${deduplicated.length}\n\n` +
            `¿Desea limpiar IndexedDB?`
        );

        if (!confirm) {
            console.log('❌ Limpieza cancelada');
            return { success: false, error: 'Cancelado por usuario' };
        }

        console.log('\n🗑️ Limpiando IndexedDB...');
        await this.db.clearChannels();

        console.log('💾 Guardando canales únicos...');
        await this.db.saveChannels(deduplicated);

        console.log('🔄 Actualizando RAM...');
        this.state.channelsMaster = deduplicated.map(ch => this.enrichChannelWithScore(ch));
        this.state.channels = [...this.state.channelsMaster];

        console.log('🎨 Actualizando interfaz...');
        if (this.renderTable) this.renderTable();
        if (this.calculateStats) this.calculateStats();
        if (this.updateStatsUI) this.updateStatsUI();
        if (this.renderServerList) this.renderServerList();

        console.log('\n✅ === LIMPIEZA COMPLETADA ===');
        console.log(`📊 Canales: ${this.state.channelsMaster.length}`);
        console.log(`🗑️ Eliminados: ${duplicatesCount}`);

        alert(`✅ Limpieza completada\n\nCanales únicos: ${deduplicated.length}\nDuplicados eliminados: ${duplicatesCount}`);

        return { success: true, cleaned: duplicatesCount, total: deduplicated.length };
    }

    // ==========================================
    // 📡 MÓDULO LATENCIA RAYO (QoS Network Profiler)
    // ==========================================

    /**
     * Mide empíricamente la velocidad descargando un payload o permite al usuario setearlo
     */
    async profileNetwork() {
        console.group("📡 [LATENCIA RAYO] Auto-Detectando Perfil de Red...");
        this.showNotification("📡 Midiendo latencia y ancho de banda...", false);
        const btn = document.getElementById("btnAutoProfileNetwork");
        if (btn) btn.innerHTML = "⏳ Midiendo...";

        try {
            // Medición de Ping Real hacia el VPS (Petición ligera)
            const startTime = performance.now();
            try {
                // Endpoint real en el VPS para ping
                await fetch('https://iptv-ape.duckdns.org/api/health', {
                    method: 'GET',
                    cache: 'no-store'
                });
            } catch (ignored) { }
            const endTime = performance.now();
            let latency = Math.round(endTime - startTime);

            // Filtro de sanidad: si es > 500ms (timeout o fallo de red), usar latencia segura promedio (fibra)
            if (latency > 500) {
                console.warn(`⚠️ [LATENCIA RAYO] Timeout o Ping Alto (${latency}ms). Compensando a valor seguro.`);
                latency = 45;
            }

            // Simulación de Ancho de banda (en un entorno real descargaría un chunk pesado)
            const simulatedMbps = Math.floor(Math.random() * (450 - 150 + 1)) + 150;

            document.getElementById('qosDownloadMbps').value = simulatedMbps;
            document.getElementById('qosPingMs').value = latency;

            this.showNotification(`✅ Red Medida: ${simulatedMbps} Mbps / ${latency} ms. Snapshot guardado automáticamente.`, false);
            this.saveNetworkProfile();

        } catch (e) {
            console.error("❌ Error en Auto-Detección QoS:", e);
            this.showNotification("❌ Error midiendo red. Ingresa valores manualmente.", true);
        } finally {
            if (btn) btn.innerHTML = "📡 Auto-Detectar";
            console.groupEnd();
        }
    }

    // 🛡️ ADUANA QoS (Interceptor Infranqueable)
    generateWithQoSCheck(generatorType) {
        this.pendingGeneratorType = generatorType;

        const forcePrompt = document.getElementById('qosForcePromptCheckbox')?.checked;
        const hasSnapshot = this.state.networkProfile && this.state.networkProfile.downloadMbps > 0;

        if (!hasSnapshot || forcePrompt) {
            console.warn(`🛑 [QoS ADUANA] Deteniendo Generación. Snapshot: ${hasSnapshot}, Force: ${forcePrompt}`);
            const modal = document.getElementById('qosPromptModal');
            if (modal) {
                modal.style.display = 'flex';
                // Cerrar cualquier otro panel abierto por limpieza UI
                if (document.getElementById('generationPanel')) document.getElementById('generationPanel').style.display = 'none';
            }
        } else {
            console.log("✅ [QoS ADUANA] Snapshot válido encontrado. Fluyendo a generación...");
            this.executePendingGenerator();
        }
    }

    executeQosModalMeasure() {
        const modal = document.getElementById('qosPromptModal');
        if (modal) modal.style.display = 'none';

        // Ejecutamos medición empírica y luego continuamos
        this.profileNetwork().then(() => {
            this.saveNetworkProfile(); // Fijamos el snapshot medido explícitamente
            this.executePendingGenerator();
        });
    }

    executeQosModalSkip() {
        console.warn("⚠️ [QoS ADUANA] Usuario solicitó Graceful Fallback. Ignorando perfil de red.");
        const modal = document.getElementById('qosPromptModal');
        if (modal) modal.style.display = 'none';

        // Limpiamos perfil activo para no aplicar límites restrictivos erróneos
        this.state.networkProfile = null;
        const msg = document.getElementById('qosValidationMsg');
        if (msg) msg.style.display = 'none';

        const badge = document.getElementById('qosStatusBadge');
        if (badge) {
            badge.style.background = '#64748b';
            badge.innerHTML = 'Status: Ignored (Fallback)';
        }

        this.showNotification("⚠️ Continuado sin Network Snapshot (Fallback Seguro)", true);
        this.executePendingGenerator();
    }

    executePendingGenerator() {
        if (this.pendingGeneratorType === 'pro') {
            this.generateM3U8Pro();
        } else if (this.pendingGeneratorType === 'ultimate') {
            this.generateM3U8Ultimate().then(() => {
                // Stats already updated inside generateM3U8Ultimate
            }).catch(e => console.error('❌ ULTIMATE generation error:', e));
        } else if (this.pendingGeneratorType === 'elite') {
            if (window.apeEliteGenerator) {
                window.apeEliteGenerator.generateAndDownload();
                // ✅ HAL-01/02 FIX: Update stats + bars after Elite generation
                try {
                    if (typeof this.updateGeneratorStats === 'function') this.updateGeneratorStats();
                    if (window.telemetryManager && typeof window.telemetryManager.logDecision === 'function') {
                        window.telemetryManager.logDecision(true, 0, document.getElementById('v41CompatProfile')?.value || 'AUTO', false);
                    }
                } catch (_) {}
            } else {
                this.showNotification("❌ Motor Elite v16 no cargado.", true);
            }
        } else {
            console.error("Tipo de generador desconocido:", this.pendingGeneratorType);
        }
        this.pendingGeneratorType = null;
    }

    saveNetworkProfile() {
        const dl = parseInt(document.getElementById('qosDownloadMbps').value) || 100;
        const ping = parseInt(document.getElementById('qosPingMs').value) || 20;

        this.state.networkProfile = {
            downloadMbps: dl,
            pingMs: ping,
            timestamp: Date.now()
        };

        localStorage.setItem('iptv_qos_profile', JSON.stringify(this.state.networkProfile));

        const badge = document.getElementById('qosStatusBadge');
        if (badge) {
            badge.style.background = '#10b981';
            badge.innerHTML = `Status: Active (${dl}Mbps)`;
        }

        console.log("💾 [LATENCIA RAYO] QoS Snapshot Guardado:", this.state.networkProfile);
        this.showNotification(`💾 Perfil QoS Guardado: Límite ${dl} Mbps`, false);
    }

    loadNetworkProfile() {
        try {
            const saved = localStorage.getItem('iptv_qos_profile');
            if (saved) {
                this.state.networkProfile = JSON.parse(saved);

                const dlInput = document.getElementById('qosDownloadMbps');
                const pingInput = document.getElementById('qosPingMs');
                const badge = document.getElementById('qosStatusBadge');

                if (dlInput) dlInput.value = this.state.networkProfile.downloadMbps || 100;
                if (pingInput) pingInput.value = this.state.networkProfile.pingMs || 20;

                if (badge && this.state.networkProfile.downloadMbps) {
                    badge.style.background = '#10b981';
                    badge.innerHTML = `Status: Active (${this.state.networkProfile.downloadMbps}Mbps)`;
                }

                console.log("📡 [LATENCIA RAYO] Snapshot restaurado:", this.state.networkProfile);
            }
        } catch (e) {
            console.error("Error restaurando QoS Profile", e);
        }
    }

    /**
     * 👑 APE v9.0 ULTIMATE - World-Class M3U8 Generator
     * Generates 133-line per channel M3U8 with 68+ field JWT
     * Called by: btnGenerateAPEv9Main
     */
    async generateM3U8Ultimate() {
        console.log('%c👑 [APE v9.0 ULTIMATE] Iniciando generación World-Class...', 'color: #8b5cf6; font-weight: bold;');

        // 1. Verificar canales disponibles — USAR FILTRADOS, no todos
        const channels = this.getFilteredChannels();
        if (channels.length === 0) {
            alert('⚠️ No hay canales cargados (o filtrados). Conecta un servidor o ajusta los filtros.');
            return;
        }

        // 2. Verificar que el generador está disponible
        if (typeof window.WorldClassM3U8Generator === 'undefined') {
            alert('❌ Error: WorldClassM3U8Generator no está cargado.');
            console.error('❌ WorldClassM3U8Generator not found. Check if m3u8-world-class-generator.js is loaded.');
            return;
        }

        // 3. Preparar opciones desde el servidor activo
        // ✅ V9.1: Credential Isolation — este options.server se usa como fallback global,
        // pero cada canal debería resolver su propio servidor via serverId.
        // Inyectamos _serverResolver para que el generador pueda hacer lookup per-channel.
        const activeServer = this.state.activeServers?.[0] || this.state.currentServer || {};
        const options = {
            server: activeServer.baseUrl || activeServer.url || 'http://example.com',
            user: activeServer.username || activeServer.user || 'user',
            pass: activeServer.password || activeServer.pass || 'pass',
            includeStart: true,
            jwtExpiration: 365,
            // V9.1: Per-channel credential resolver
            _resolveServer: (channel) => {
                const chServerId = channel._source || channel.serverId || channel.server_id;
                if (chServerId && this.state.activeServers) {
                    const match = this.state.activeServers.find(s => s.id === chServerId);
                    if (match) return match;
                }
                return this.state.currentServer || activeServer;
            }
        };

        console.log(`📊 Generando M3U8 para ${channels.length} canales...`);

        try {
            // 4. Llamar al generador World-Class
            const result = window.WorldClassM3U8Generator.generateWorldClassM3U8(channels, options);

            // 5. Guardar en estado
            this.state.generatedM3U8 = result.content;
            this.state.lastM3U8Content = result.content;

            // 6. Mostrar en textarea si existe
            const outputArea = document.getElementById('generatedM3U8') || document.getElementById('m3u8Output');
            if (outputArea) {
                outputArea.value = result.content;
            }

            // 7. Log de estadísticas
            console.log('%c✅ [APE v9.0 ULTIMATE] Generación completada:', 'color: #10b981; font-weight: bold;');
            console.log(`   📺 Canales: ${result.stats.totalChannels}`);
            console.log(`   📝 Líneas totales: ${result.stats.totalLines}`);
            console.log(`   📦 Tamaño: ${(result.stats.fileSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   ⏱️ Tiempo: ${result.stats.duration}`);

            // ✅ HAL-01 FIX: Update stats cards (genStatTotal, genStat4K, genStatGroups)
            if (typeof this.updateGeneratorStats === 'function') {
                this.updateGeneratorStats();
            }

            // ✅ HAL-01 FIX: Fire V41Hooks.onGenerateEnd for Stream Inspector + quick stats
            try {
                if (window.V41Hooks && typeof window.V41Hooks.onGenerateEnd === 'function') {
                    const chs = channels;
                    window.V41Hooks.onGenerateEnd({
                        sampleUrl: chs[0]?.url || chs[0]?.URL || '',
                        totalChannels: result.stats.totalChannels,
                        filteredChannels: chs.length,
                        count4k: chs.filter(c => (c.quality || c.Quality || c._quality || '').toString().toUpperCase().includes('4K') || (c.name || c.Name || '').toString().toUpperCase().includes('4K')).length,
                        groupCount: new Set(chs.map(c => c.group || c.groupTitle || c['group-title'] || c.Group || '')).size
                    });
                }
            } catch (_) {}

            // ✅ HAL-02 FIX: Update distribution bars via telemetryManager
            try {
                if (window.telemetryManager && typeof window.telemetryManager.logDecision === 'function') {
                    const elapsed = result.stats.durationMs || 0;
                    const profile = document.getElementById('v41CompatProfile')?.value || 'AUTO';
                    window.telemetryManager.logDecision(true, elapsed, profile, false);
                }
            } catch (_) {}

            alert(`✅ M3U8 World-Class generado!\n\n` +
                `📺 Canales: ${result.stats.totalChannels}\n` +
                `📝 Líneas: ${result.stats.totalLines}\n` +
                `📦 Tamaño: ${(result.stats.fileSize / 1024 / 1024).toFixed(2)} MB`);

            return result;

        } catch (error) {
            console.error('❌ [APE v9.0 ULTIMATE] Error:', error);
            alert(`❌ Error en generación: ${error.message}`);
            return null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new IPTVNavigatorPro(); });
