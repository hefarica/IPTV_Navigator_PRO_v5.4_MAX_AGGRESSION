/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE QUALITY PROBER v1.0 — Per-Profile Live HLS Manifest Probing
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Sondea manifests HLS reales del proveedor usando @videojs/m3u8-parser.
 * Extrae BANDWIDTH, CODECS, RESOLUTION, FRAME-RATE y VIDEO-RANGE empíricos.
 * 
 * ESTRATEGIA: Per-Profile × Per-Host
 *   - Agrupa canales por (host, profile)
 *   - Sondea 1 canal representativo por (host, profile) combo
 *   - Típico: 3 hosts × 4 profiles = ~12 requests
 *   - Concurrencia: 6 simultáneos → ~5-10 segundos total
 *   - Cache: localStorage 24h TTL
 * 
 * ANTI-509: Máximo 1 request por (host, profile). Con 3 hosts esto son
 * ~12-18 requests totales — muy por debajo del umbral de 509.
 * 
 * REGLA SHIELDED: Las URLs se usan SOLO para probe (HEAD/GET).
 * NUNCA se modifican las URLs en la lista final.
 * 
 * @requires window.m3u8Parser (from m3u8-parser.vendor.js)
 * @license Apache-2.0
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const VERSION = '1.1.0';
    const CACHE_KEY = 'ape_quality_probe_cache_v1';
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    const PROBE_TIMEOUT_MS = 3000; // 3s — reduced from 5s
    const MAX_CONCURRENCY = 6;
    const CORS_PREFLIGHT_TIMEOUT_MS = 800; // 800ms fast-fail for CORS detection

    // ─────────────────────────────────────────────────────────────
    // CACHE LAYER
    // ─────────────────────────────────────────────────────────────

    function loadCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return {};
            const cache = JSON.parse(raw);
            const now = Date.now();
            // Purge expired entries
            for (const key of Object.keys(cache)) {
                if (now - (cache[key]._cachedAt || 0) > CACHE_TTL_MS) {
                    delete cache[key];
                }
            }
            return cache;
        } catch (e) {
            return {};
        }
    }

    function saveCache(cache) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (e) { /* quota exceeded — silent */ }
    }

    function cacheKey(host, profile) {
        return `${host.toLowerCase()}|${profile}`;
    }

    // ─────────────────────────────────────────────────────────────
    // CHANNEL GROUPING: Per (Host, Profile)
    // ─────────────────────────────────────────────────────────────

    function groupChannelsByHostProfile(channels) {
        const groups = {}; // key: "host|profile" → { host, profile, sample: channel }

        for (const ch of channels) {
            // Extract host from URL
            let host = ch._host || '';
            if (!host && ch.url) {
                try { host = new URL(ch.url).hostname; } catch (e) { continue; }
            }
            if (!host) continue;

            // Determine profile
            const profile = ch._quickProfile || ch._profileDebug?.profile || 'P3';

            const key = cacheKey(host, profile);
            if (!groups[key]) {
                groups[key] = { host, profile, sample: ch, key };
            }
        }

        return Object.values(groups);
    }

    // ─────────────────────────────────────────────────────────────
    // SINGLE PROBE: Fetch manifest + parse with videojs parser
    // ─────────────────────────────────────────────────────────────

    async function probeOne(channel) {
        const url = channel.url || '';
        if (!url) return null;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

        try {
            const resp = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV) AppleWebKit/537.36',
                    'Accept': '*/*'
                },
                redirect: 'follow',
                mode: 'cors'
            });

            clearTimeout(timer);

            if (!resp.ok) {
                return { error: `HTTP ${resp.status}`, status: resp.status };
            }

            const text = await resp.text();

            // Check if it's actually an HLS manifest
            if (!text.includes('#EXTM3U')) {
                return { error: 'NOT_HLS', status: resp.status };
            }

            // Use @videojs/m3u8-parser
            const Parser = global.m3u8Parser?.Parser;
            if (!Parser) {
                console.warn('[PROBER] m3u8Parser not loaded — skipping');
                return { error: 'NO_PARSER' };
            }

            const parser = new Parser();
            parser.push(text);
            parser.end();

            const manifest = parser.manifest;

            // C8 (2026-05-12) — pass manifest text to extractors for container detection
            // Is it a Master Playlist? (has playlists/variants)
            if (manifest.playlists && manifest.playlists.length > 0) {
                return extractFromMaster(manifest, text);
            }

            // It's a Media Playlist (segments only) — extract what we can
            return extractFromMedia(manifest, resp, text);
        } catch (e) {
            clearTimeout(timer);
            if (e.name === 'AbortError') {
                return { error: 'TIMEOUT' };
            }
            // CORS error or network failure
            return { error: e.message || 'FETCH_FAILED' };
        }
    }

    // C8 (2026-05-12) — Honest container detection + evidence extraction
    function detectContainer(text) {
        const hasMap = /#EXT-X-MAP:/i.test(text);
        const hasM4s = /\.m4s(\?|$)/im.test(text);
        const hasInitMp4 = /init\.mp4/i.test(text);
        const hasTs = /\.ts(\?|$)/im.test(text);
        if (hasMap && (hasM4s || hasInitMp4)) return 'fmp4-cmaf';
        if (hasTs) return 'mpegts-hls';
        return 'unknown';
    }

    function extractEvidence(text) {
        return {
            hasExtXMap: /#EXT-X-MAP:/i.test(text),
            hasM4s: /\.m4s(\?|$)/im.test(text),
            hasInitMp4: /init\.mp4/i.test(text),
            hasTs: /\.ts(\?|$)/im.test(text),
            hasStreamInf: /#EXT-X-STREAM-INF:/i.test(text),
            hasCodecs: /CODECS=/i.test(text),
            hasVideoRange: /VIDEO-RANGE=/i.test(text),
            hasSupplementalCodecs: /SUPPLEMENTAL-CODECS=/i.test(text)
        };
    }

    function extractSupplementalCodecs(text) {
        // SUPPLEMENTAL-CODECS="dvh1.08.06" - extract value if present
        const match = text.match(/SUPPLEMENTAL-CODECS="([^"]+)"/i);
        return match ? match[1] : null;
    }

    function extractFromMaster(manifest, rawText) {
        const playlists = manifest.playlists;
        const text = rawText || '';

        // Sort by bandwidth descending — highest quality first
        playlists.sort((a, b) => {
            const bwA = a.attributes?.BANDWIDTH || 0;
            const bwB = b.attributes?.BANDWIDTH || 0;
            return bwB - bwA;
        });

        const best = playlists[0]?.attributes || {};
        const resObj = best.RESOLUTION || {};

        // Build codec strings
        const codecsFull = best.CODECS || '';
        const codecParts = codecsFull.split(',').map(c => c.trim());
        const videoCodec = codecParts.find(c =>
            c.startsWith('hvc1') || c.startsWith('hev1') ||
            c.startsWith('avc1') || c.startsWith('av01') ||
            c.startsWith('vvc1') || c.startsWith('vp09')
        ) || codecParts[0] || '';
        const audioCodec = codecParts.find(c =>
            c.startsWith('mp4a') || c.startsWith('ec-3') ||
            c.startsWith('ac-3') || c.startsWith('opus')
        ) || 'mp4a.40.2';

        // Resolution string
        const resStr = (resObj.width && resObj.height)
            ? `${resObj.width}x${resObj.height}`
            : '';

        // C8 (2026-05-12) — container detection + evidence flags + supplemental codecs honest
        const container = detectContainer(text);
        const evidence = extractEvidence(text);
        const supplementalCodecs = extractSupplementalCodecs(text);

        return {
            bandwidth: best.BANDWIDTH || 0,
            avgBandwidth: best['AVERAGE-BANDWIDTH'] || Math.round((best.BANDWIDTH || 0) * 0.85),
            videoCodec: videoCodec,
            audioCodec: audioCodec,
            codecsFull: codecsFull,
            resolution: resStr,
            frameRate: best['FRAME-RATE'] || 0,
            videoRange: best['VIDEO-RANGE'] || '',
            hdcpLevel: best['HDCP-LEVEL'] || '',  // observado, no default
            supplementalCodecs: supplementalCodecs,  // C8: solo si presente en master real
            container: container,
            evidence: evidence,
            variantCount: playlists.length,
            allVariants: playlists.map(p => ({
                bw: p.attributes?.BANDWIDTH || 0,
                res: p.attributes?.RESOLUTION
                    ? `${p.attributes.RESOLUTION.width}x${p.attributes.RESOLUTION.height}`
                    : '',
                codecs: p.attributes?.CODECS || '',
                fps: p.attributes?.['FRAME-RATE'] || 0
            })),
            source: 'PROBED_MASTER',
            probedAt: new Date().toISOString()
        };
    }

    function extractFromMedia(manifest, resp, rawText) {
        const text = rawText || '';
        const container = detectContainer(text);
        const evidence = extractEvidence(text);
        // Media playlists don't have variant info,
        // but we can extract segment duration and target duration
        const contentType = resp.headers?.get('Content-Type') || '';

        return {
            bandwidth: 0, // unknown from media playlist
            videoCodec: '',
            audioCodec: '',
            resolution: '',
            frameRate: 0,
            videoRange: '',
            supplementalCodecs: null,
            container: container,  // C8: definitive from media playlist (segments visible)
            evidence: evidence,
            variantCount: 0,
            targetDuration: manifest.targetDuration || 0,
            segmentCount: manifest.segments?.length || 0,
            source: 'PROBED_MEDIA',
            probedAt: new Date().toISOString()
        };
    }

    // ─────────────────────────────────────────────────────────────
    // CONCURRENCY LIMITER
    // ─────────────────────────────────────────────────────────────

    async function parallelLimit(tasks, limit) {
        const results = [];
        const executing = new Set();

        for (const task of tasks) {
            const p = task().then(r => {
                executing.delete(p);
                return r;
            });
            executing.add(p);
            results.push(p);

            if (executing.size >= limit) {
                await Promise.race(executing);
            }
        }

        return Promise.allSettled(results);
    }

    // ─────────────────────────────────────────────────────────────
    // MAIN PROBE ORCHESTRATOR
    // ─────────────────────────────────────────────────────────────

    /**
     * Probe channels grouped by (host, profile).
     * Enriches channel._probeData with real manifest data.
     * 
     * @param {Array} channels - Array of channel objects
     * @param {Object} [opts]
     * @param {Function} [opts.onProgress] - (completed, total, current) callback
     * @param {boolean} [opts.skipCache] - Force re-probe even if cached
     * @returns {Promise<{ probed: number, cached: number, failed: number, timeMs: number }>}
     */
    /**
     * Fast CORS pre-flight: one quick fetch to detect if we can reach providers.
     * If CORS blocks us (localhost dev), returns false immediately.
     */
    async function canReachProviders(sampleUrl) {
        if (!sampleUrl) return false;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), CORS_PREFLIGHT_TIMEOUT_MS);
            const resp = await fetch(sampleUrl, {
                signal: controller.signal,
                method: 'HEAD',
                mode: 'cors',
                redirect: 'follow'
            });
            clearTimeout(timer);
            return resp.ok || resp.status === 302 || resp.status === 301;
        } catch (e) {
            // CORS error or network failure — providers unreachable from this origin
            return false;
        }
    }

    async function probe(channels, opts = {}) {
        const t0 = performance.now();
        const cache = opts.skipCache ? {} : loadCache();
        const groups = groupChannelsByHostProfile(channels);

        let probed = 0, cached = 0, failed = 0;
        const total = groups.length;

        console.log(
            `%c🔬 [QUALITY PROBER] ${total} combos (host×profile) a sondear de ${channels.length} canales`,
            'color: #8b5cf6; font-weight: bold;'
        );

        // ═══ FAST CORS PRE-FLIGHT ═══
        // One quick ping to check if providers are reachable from this origin.
        // If CORS blocks us (localhost:5500), skip ALL probing instantly (<1s)
        // instead of waiting 57+ seconds of accumulated timeouts.
        if (groups.length > 0 && !opts.skipCorsCheck) {
            const sampleUrl = groups[0]?.sample?.url || '';
            if (sampleUrl) {
                const reachable = await canReachProviders(sampleUrl);
                if (!reachable) {
                    const timeMs = Math.round(performance.now() - t0);
                    console.log(
                        `%c🔬 [QUALITY PROBER] CORS pre-flight: proveedores no alcanzables desde este origen (${timeMs}ms). Usando datos estimados/cache.`,
                        'color: #f59e0b; font-weight: bold;'
                    );
                    // Still apply cached data if available
                    let enriched = 0;
                    for (const ch of channels) {
                        let host = ch._host || '';
                        if (!host && ch.url) {
                            try { host = new URL(ch.url).hostname; } catch (e) { continue; }
                        }
                        const profile = ch._quickProfile || ch._profileDebug?.profile || 'P3';
                        const key = cacheKey(host, profile);
                        const data = cache[key];
                        if (data && data.bandwidth > 0) {
                            ch._probeData = data;
                            enriched++;
                        }
                    }
                    return { probed: 0, cached: Object.keys(cache).length, failed: 0, enriched, totalCombos: total, timeMs, channelsTotal: channels.length, skipped: 'CORS_BLOCKED' };
                }
            }
        }

        // Separate cached vs need-to-probe
        const toProbe = [];
        const cachedResults = {};

        for (const group of groups) {
            const existing = cache[group.key];
            if (existing && existing.source) {
                cachedResults[group.key] = existing;
                cached++;
            } else {
                toProbe.push(group);
            }
        }

        if (cached > 0) {
            console.log(`   📦 ${cached} combos desde cache (${total - cached} a sondear)`);
        }

        // Probe uncached groups in parallel
        if (toProbe.length > 0) {
            const tasks = toProbe.map((group, idx) => () =>
                probeOne(group.sample).then(async (result) => {
                    const key = group.key;
                    const manifestSucceeded = result && !result.error && result.bandwidth > 0;

                    if (manifestSucceeded) {
                        // ═══ PHASE 2: Binary Segment Analysis (Ground Truth) ═══
                        // Only runs if Phase 1 manifest probe SUCCEEDED.
                        // If ApeSegmentAnalyzer is loaded, fetch first 32KB of
                        // the actual video segment and extract codec from NAL units.
                        // This catches: fake 4K, codec mismatch, wrong profile/level.
                        if (global.ApeSegmentAnalyzer && result.allVariants?.[0]) {
                            try {
                                const manifestUrl = group.sample.url || '';
                                const bestVariantUri = result.allVariants[0]?.uri || '';
                                let segUrl = '';

                                // If we got a media playlist URI from the master,
                                // fetch it to get segment URLs
                                if (bestVariantUri) {
                                    segUrl = global.ApeSegmentAnalyzer
                                        .resolveFirstSegmentUrl(manifestUrl, { segments: [], playlists: [{ uri: bestVariantUri }] });
                                }

                                // If we have a segment URL, analyze it
                                if (segUrl) {
                                    const segResult = await global.ApeSegmentAnalyzer.analyzeSegment(segUrl);
                                    if (segResult && !segResult.error) {
                                        const validation = global.ApeSegmentAnalyzer.crossValidate(result, segResult);
                                        result._binaryAnalysis = segResult;
                                        result._crossValidation = validation;

                                        // Apply corrections from binary ground truth
                                        if (validation.correctedCodec) {
                                            result.videoCodecBinary = validation.correctedCodec;
                                            // Override manifest codec with binary truth
                                            result.videoCodec = validation.correctedCodec;
                                        }
                                        if (validation.codecMismatch) {
                                            console.warn(`   🔍 [BINARY] ${group.host}|${group.profile}: ${validation.details.join(', ')}`);
                                        }
                                        if (validation.fake4K) {
                                            console.warn(`   ⚠️ [FAKE-4K] ${group.host}|${group.profile}: ${validation.details.join(', ')}`);
                                            // Correct resolution from binary
                                            if (segResult.width > 0 && segResult.height > 0) {
                                                result.resolution = `${segResult.width}x${segResult.height}`;
                                            }
                                        }
                                        if (segResult.audioCodec) {
                                            result.audioCodecBinary = segResult.audioCodec;
                                        }
                                        result.source = 'PROBED_MASTER+BINARY';
                                    }
                                }
                            } catch (segErr) {
                                // Binary analysis is optional — manifest data still valid
                                console.debug(`   [BINARY] Analysis skipped for ${group.host}: ${segErr.message}`);
                            }
                        }

                        // ═══ PHASE 3: LL-HLS Analysis via hls.js headless ═══
                        // Uses hls.js to detect Low-Latency HLS capabilities:
                        // EXT-X-SERVER-CONTROL, EXT-X-PART-INF, EXT-X-PRELOAD-HINT
                        // This generates REAL LL-HLS tags instead of invented ones.
                        if (global.ApeLLHLSAnalyzer) {
                            try {
                                const manifestUrl = group.sample.url || '';
                                if (manifestUrl) {
                                    const hlsResult = await global.ApeLLHLSAnalyzer.analyzeWithHlsJs(manifestUrl);
                                    if (hlsResult && !hlsResult.error) {
                                        global.ApeLLHLSAnalyzer.mergeHlsData(result, hlsResult);
                                        if (hlsResult.llhls) {
                                            console.log(`   ⚡ [LL-HLS] ${group.host}|${group.profile}: PART-TARGET=${hlsResult.partTarget}s, HOLD-BACK=${hlsResult.holdBack}s`);
                                        }
                                    }
                                }
                            } catch (hlsErr) {
                                console.debug(`   [LL-HLS] Analysis skipped for ${group.host}: ${hlsErr.message}`);
                            }
                        }

                        result._cachedAt = Date.now();
                        cache[key] = result;
                        cachedResults[key] = result;
                        probed++;
                    } else {
                        failed++;
                        console.warn(`   ⚠️ [PROBE] ${group.host}|${group.profile}: ${result?.error || 'NO_DATA'}`);
                    }

                    if (opts.onProgress) {
                        opts.onProgress(probed + cached + failed, total,
                            `${group.host} (${group.profile})`);
                    }

                    return { key, result };
                })
            );

            await parallelLimit(tasks, MAX_CONCURRENCY);
        }

        // Save updated cache
        saveCache(cache);

        // Apply probe data to ALL channels matching each (host, profile)
        let enriched = 0;
        for (const ch of channels) {
            let host = ch._host || '';
            if (!host && ch.url) {
                try { host = new URL(ch.url).hostname; } catch (e) { continue; }
            }
            const profile = ch._quickProfile || ch._profileDebug?.profile || 'P3';
            const key = cacheKey(host, profile);
            const data = cachedResults[key];

            if (data && data.bandwidth > 0) {
                ch._probeData = data;
                enriched++;
            }
        }

        const timeMs = Math.round(performance.now() - t0);

        const summary = {
            probed,
            cached,
            failed,
            enriched,
            totalCombos: total,
            timeMs,
            channelsTotal: channels.length
        };

        console.log(
            `%c🔬 [QUALITY PROBER] Completado en ${timeMs}ms ` +
            `(probed: ${probed}, cached: ${cached}, failed: ${failed}, enriched: ${enriched}/${channels.length})`,
            'color: #10b981; font-weight: bold;'
        );

        return summary;
    }

    /**
     * Quick-probe: only probe, skip cache, minimal logging.
     * For use in the generation pipeline.
     */
    async function quickProbe(channels, onProgress) {
        return probe(channels, { onProgress, skipCache: false });
    }

    /**
     * Clear the probe cache entirely.
     */
    function clearCache() {
        localStorage.removeItem(CACHE_KEY);
        console.log('[QUALITY PROBER] Cache cleared');
    }

    // ─────────────────────────────────────────────────────────────
    // GLOBAL EXPORT
    // ─────────────────────────────────────────────────────────────

    const ApeQualityProber = {
        version: VERSION,
        probe: probe,
        quickProbe: quickProbe,
        probeOne: probeOne,
        clearCache: clearCache,
        groupChannelsByHostProfile: groupChannelsByHostProfile
    };

    if (typeof global !== 'undefined') {
        global.ApeQualityProber = ApeQualityProber;
    }

})(typeof window !== 'undefined' ? window : globalThis);
