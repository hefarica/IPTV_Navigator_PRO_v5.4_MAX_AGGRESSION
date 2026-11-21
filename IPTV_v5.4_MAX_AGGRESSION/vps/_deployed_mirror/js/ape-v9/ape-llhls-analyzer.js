/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE LL-HLS ANALYZER v1.0 — Low-Latency HLS Probing via hls.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Usa hls.js headless (sin <video> element) para analizar manifests HLS
 * y extraer datos de Low-Latency HLS que @videojs/m3u8-parser no parsea:
 *
 *   - EXT-X-SERVER-CONTROL: CAN-BLOCK-RELOAD, HOLD-BACK, PART-HOLD-BACK
 *   - EXT-X-PART-INF: PART-TARGET (duración objetivo de parts)
 *   - EXT-X-PRELOAD-HINT: TYPE, URI (preload de next part)
 *   - EXT-X-PART: duración real de cada part
 *   - EXT-X-RENDITION-REPORT: otras variantes con info de última secuencia
 *   - ABR bandwidth estimation del player real
 *   - Level details: targetDuration, totalduration, live/VOD detection
 *
 * ESTRATEGIA: Crea instancia hls.js headless con video element fantasma,
 * carga la URL, espera MANIFEST_PARSED + LEVEL_LOADED, extrae todo, destruye.
 * Timeout: 8 segundos. Si falla → datos del @videojs/m3u8-parser prevalecen.
 *
 * @requires window.Hls (from hls.light.vendor.js)
 * @license Apache-2.0
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const VERSION = '1.0.1';
    const HLS_PROBE_TIMEOUT_MS = 4000;

    /**
     * Probe a manifest URL using hls.js headless.
     * Extracts LL-HLS data, level details, and ABR information.
     *
     * @param {string} manifestUrl - URL of the HLS manifest
     * @returns {Promise<Object>} LL-HLS analysis result
     */
    async function analyzeWithHlsJs(manifestUrl) {
        const Hls = global.Hls;
        if (!Hls || !Hls.isSupported || !Hls.isSupported()) {
            return { error: 'HLS_NOT_SUPPORTED', source: 'HLS_JS' };
        }

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                cleanup('TIMEOUT');
            }, HLS_PROBE_TIMEOUT_MS);

            // Create phantom video element (never attached to DOM)
            const video = document.createElement('video');

            const hls = new Hls({
                debug: false,
                enableWorker: false,
                // Minimal loading — we only want manifest data
                maxBufferLength: 0,
                maxMaxBufferLength: 1,
                maxBufferSize: 0,
                startFragPrefetch: false,
                testBandwidth: false,
                // Low-Latency aware
                lowLatencyMode: true,
                backBufferLength: 0,
                // DISABLE internal retries — we have our own timeout
                manifestLoadingMaxRetry: 0,
                levelLoadingMaxRetry: 0,
                fragLoadingMaxRetry: 0
            });

            let result = {
                source: 'HLS_JS',
                llhls: false,
                levels: [],
                bestLevel: null,
                serverControl: null,
                partInf: null,
                preloadHint: null,
                isLive: false,
                targetDuration: 0,
                partTarget: 0,
                holdBack: 0,
                partHoldBack: 0,
                canBlockReload: false,
                canSkipUntil: 0,
                totalDuration: 0,
                probedAt: new Date().toISOString()
            };

            function cleanup(reason) {
                clearTimeout(timer);
                try {
                    hls.destroy();
                } catch (e) { /* silent */ }
                if (reason === 'TIMEOUT') {
                    result.error = 'TIMEOUT';
                }
                resolve(result);
            }

            // MANIFEST_PARSED: fires when master playlist is parsed
            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                result.levelCount = data.levels?.length || 0;

                // Extract all levels (variants) with full detail
                result.levels = (data.levels || []).map(level => ({
                    width: level.width || 0,
                    height: level.height || 0,
                    bitrate: level.bitrate || 0,
                    avgBitrate: level.averageBitrate || 0,
                    codecSet: level.codecSet || '',
                    videoCodec: level.videoCodec || '',
                    audioCodec: level.audioCodec || '',
                    frameRate: level.frameRate || 0,
                    videoRange: level.videoRange || 'SDR',
                    uri: level.uri || level.url || ''
                }));

                // Best level = highest bitrate
                if (result.levels.length > 0) {
                    const sorted = [...result.levels].sort((a, b) => b.bitrate - a.bitrate);
                    result.bestLevel = sorted[0];
                }

                // Audio tracks
                if (data.audioTracks && data.audioTracks.length > 0) {
                    result.audioTracks = data.audioTracks.map(t => ({
                        name: t.name || '',
                        lang: t.lang || '',
                        codec: t.audioCodec || '',
                        channels: t.channels || ''
                    }));
                }
            });

            // LEVEL_LOADED: fires when a media playlist is loaded — has LL-HLS data
            hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
                const details = data.details;
                if (!details) {
                    cleanup('NO_DETAILS');
                    return;
                }

                result.isLive = details.live || false;
                result.targetDuration = details.targetduration || 0;
                result.totalDuration = details.totalduration || 0;

                // ═══ LL-HLS DETECTION ═══
                // Check for EXT-X-SERVER-CONTROL
                if (details.canBlockReload !== undefined ||
                    details.holdBack !== undefined ||
                    details.partHoldBack !== undefined) {
                    result.llhls = true;
                    result.canBlockReload = !!details.canBlockReload;
                    result.holdBack = details.holdBack || 0;
                    result.partHoldBack = details.partHoldBack || 0;
                    result.canSkipUntil = details.canSkipUntil || 0;

                    result.serverControl = {
                        canBlockReload: result.canBlockReload,
                        holdBack: result.holdBack,
                        partHoldBack: result.partHoldBack,
                        canSkipUntil: result.canSkipUntil
                    };
                }

                // Check for EXT-X-PART-INF
                if (details.partTarget) {
                    result.llhls = true;
                    result.partTarget = details.partTarget;
                    result.partInf = {
                        partTarget: details.partTarget
                    };
                }

                // Check for parts in fragments (EXT-X-PART)
                if (details.partList && details.partList.length > 0) {
                    result.llhls = true;
                    result.partCount = details.partList.length;
                    // Average part duration
                    const partDurations = details.partList
                        .map(p => p.duration || 0)
                        .filter(d => d > 0);
                    if (partDurations.length > 0) {
                        result.avgPartDuration = partDurations.reduce((a, b) => a + b, 0) / partDurations.length;
                    }
                }

                // Check for preload hint (EXT-X-PRELOAD-HINT)
                if (details.preloadHint) {
                    result.llhls = true;
                    result.preloadHint = {
                        type: details.preloadHint.TYPE || 'PART',
                        uri: details.preloadHint.URI ? '(present)' : ''
                    };
                }

                // Fragment (segment) analysis
                if (details.fragments && details.fragments.length > 0) {
                    const frags = details.fragments.filter(f => f.duration > 0);
                    result.fragmentCount = frags.length;
                    if (frags.length > 0) {
                        const durations = frags.map(f => f.duration);
                        result.avgFragDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
                        result.minFragDuration = Math.min(...durations);
                        result.maxFragDuration = Math.max(...durations);
                    }
                }

                // Done — we have everything we need
                cleanup();
            });

            // Error handling
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    result.error = `HLS_ERROR: ${data.type}/${data.details}`;
                    cleanup('ERROR');
                }
            });

            // Start headless loading
            hls.attachMedia(video);
            hls.loadSource(manifestUrl);
        });
    }

    /**
     * Merge LL-HLS data into existing probe result.
     * Enriches the probeData with LL-HLS specific fields.
     *
     * @param {Object} probeData - Existing probe result from manifest parser
     * @param {Object} hlsData - Result from analyzeWithHlsJs()
     * @returns {Object} Enriched probe data
     */
    function mergeHlsData(probeData, hlsData) {
        if (!hlsData || hlsData.error) return probeData;

        // Add LL-HLS fields
        probeData.llhls = hlsData.llhls || false;
        probeData.isLive = hlsData.isLive || false;
        probeData.targetDuration = hlsData.targetDuration || 0;

        if (hlsData.llhls) {
            probeData.llhlsData = {
                serverControl: hlsData.serverControl,
                partInf: hlsData.partInf,
                preloadHint: hlsData.preloadHint,
                partTarget: hlsData.partTarget,
                holdBack: hlsData.holdBack,
                partHoldBack: hlsData.partHoldBack,
                canBlockReload: hlsData.canBlockReload,
                canSkipUntil: hlsData.canSkipUntil,
                partCount: hlsData.partCount || 0,
                avgPartDuration: hlsData.avgPartDuration || 0
            };
        }

        // Use hls.js level data if it has better codec info
        if (hlsData.bestLevel) {
            const best = hlsData.bestLevel;
            // Only override if hls.js found more specific codec strings
            if (best.videoCodec && best.videoCodec.includes('.')) {
                probeData.videoCodecHlsJs = best.videoCodec;
                // hls.js parses codec strings more accurately
                if (!probeData.videoCodec || !probeData.videoCodec.includes('.')) {
                    probeData.videoCodec = best.videoCodec;
                }
            }
            if (best.audioCodec) {
                probeData.audioCodecHlsJs = best.audioCodec;
            }
            if (best.videoRange && best.videoRange !== 'SDR') {
                probeData.videoRange = best.videoRange;
            }
            if (best.frameRate > 0 && !probeData.frameRate) {
                probeData.frameRate = best.frameRate;
            }
        }

        // Fragment analysis for buffer optimization tags
        if (hlsData.fragmentCount > 0) {
            probeData.fragmentInfo = {
                count: hlsData.fragmentCount,
                avgDuration: hlsData.avgFragDuration || 0,
                minDuration: hlsData.minFragDuration || 0,
                maxDuration: hlsData.maxFragDuration || 0
            };
        }

        // Audio tracks
        if (hlsData.audioTracks && hlsData.audioTracks.length > 0) {
            probeData.audioTracks = hlsData.audioTracks;
        }

        // Update source tag
        if (hlsData.llhls) {
            probeData.source = (probeData.source || 'PROBED_MASTER') + '+LLHLS';
        }

        return probeData;
    }

    // ─────────────────────────────────────────────────────────────
    // GLOBAL EXPORT
    // ─────────────────────────────────────────────────────────────

    const ApeLLHLSAnalyzer = {
        version: VERSION,
        analyzeWithHlsJs: analyzeWithHlsJs,
        mergeHlsData: mergeHlsData
    };

    if (typeof global !== 'undefined') {
        global.ApeLLHLSAnalyzer = ApeLLHLSAnalyzer;
    }

})(typeof window !== 'undefined' ? window : globalThis);
