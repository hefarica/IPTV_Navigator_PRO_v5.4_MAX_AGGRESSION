/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ⚡ M3U8 POST-PROCESSOR v1.0 — Inline Rules Engine
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * PROPÓSITO: Procesa el texto M3U8 DESPUÉS de la generación para garantizar
 * compatibilidad universal de parser. Aplica las mismas reglas que
 * restructure_m3u8.js (Node.js) pero directamente en el browser.
 *
 * SE EJECUTA AUTOMÁTICAMENTE después de cada generación.
 * 
 * REGLAS APLICADAS:
 * 1. EXTVLCOPT deduplicación (1 key = 1 value) con políticas KEEP_HIGHEST/LOWEST/FIRST
 * 2. KODIPROP profile-aware enforcement (resolución/bandwidth por perfil)
 * 3. Unicode pipe sanitization (┃ U+2503 → | U+007C)
 * 4. FALLBACK consolidación (12 sueltos → 4 líneas)
 * 5. Layer ordering validation (EXTINF→EXTHTTP→VLC→KODI→APE→URL)
 * 
 * AUTOR: APE Engine Team
 * VERSIÓN: 1.0.0
 * FECHA: 2026-03-25
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // RULES ENGINE (mirrors restructure_m3u8.js)
    // ═══════════════════════════════════════════════════════════════════════
    const RULES = window.APE_VLC_RULES || {
        KEEP_HIGHEST: new Set([
            'network-caching', 'live-caching', 'file-caching', 'disc-caching',
            'tcp-caching', 'sout-mux-caching', 'clock-jitter',
            'preferred-resolution', 'adaptive-maxwidth', 'adaptive-maxheight',
            'postproc-quality', 'swscale-mode', 'mtu',
            'sout-video-bitrate', 'sout-video-maxrate', 'sout-video-bufsize',
            'repeat', 'input-repeat', 'adaptive-cache-size'
        ]),
        KEEP_LOWEST: new Set([
            'avcodec-hurry-up', 'avcodec-fast', 'avcodec-skiploopfilter',
            'avcodec-skipframe', 'avcodec-skip-idct', 'avcodec-lowres'
        ]),
        KEEP_FIRST: new Set([
            'avcodec-hw', 'clock-synchro', 'deinterlace-mode',
            'preferred-codec', 'codec-priority', 'adaptive-logic',
            'video-filter', 'deinterlace'
        ])
    };

    const PROFILES = window.APE_PROFILE_TABLE || {
        P0: { maxRes: '7680x4320', maxBw: 130000000 },
        P1: { maxRes: '3840x2160', maxBw:  50000000 },
        P2: { maxRes: '3840x2160', maxBw:  35000000 },
        P3: { maxRes: '1920x1080', maxBw:  15000000 },
        P4: { maxRes: '1280x720',  maxBw:   8000000 },
        P5: { maxRes: '854x480',   maxBw:   3000000 }
    };

    /**
     * Processes raw M3U8 text and returns cleaned text.
     * Applies all 5 Rules Engine validations.
     * 
     * @param {string} m3u8Text - Raw generated M3U8 content
     * @returns {{ text: string, stats: object }} Cleaned M3U8 + stats
     */
    function postProcess(m3u8Text) {
        if (!m3u8Text || typeof m3u8Text !== 'string') {
            return { text: m3u8Text, stats: { channels: 0, deduped: 0, sanitized: 0 } };
        }

        const startTime = performance.now();
        const lines = m3u8Text.split('\n');
        const output = [];
        const stats = {
            channels: 0,
            vlcDeduped: 0,
            kodiFixed: 0,
            unicodeSanitized: 0,
            fallbackConsolidated: 0,
            layerReordered: 0
        };

        // Accumulator for current channel block
        let currentChannel = null;
        let channelLines = {
            extinf: null,
            exthttp: [],
            overflow: [],
            vlc: {},       // key → value (deduped)
            kodi: {},      // key → value
            ape: [],
            attr: [],
            cortex: [],
            fallback: [],
            url: null
        };

        function emitChannel() {
            if (!channelLines.extinf) return;
            stats.channels++;

            // Layer 1: EXTINF (Unicode sanitized)
            output.push(channelLines.extinf);

            // Layer 2: EXTHTTP
            channelLines.exthttp.forEach(l => output.push(l));

            // Layer 3: OVERFLOW
            channelLines.overflow.forEach(l => output.push(l));

            // Layer 4: EXTVLCOPT (deduped)
            for (const [key, value] of Object.entries(channelLines.vlc)) {
                output.push(`#EXTVLCOPT:${key}=${value}`);
            }

            // Layer 5: KODIPROP (profile-aware)
            for (const [key, value] of Object.entries(channelLines.kodi)) {
                output.push(`#KODIPROP:${key}=${value}`);
            }

            // Layer 6: APE tags
            channelLines.ape.forEach(l => output.push(l));

            // Layer 7: EXTATTRFROMURL
            channelLines.attr.forEach(l => output.push(l));

            // Layer 8: CORTEX/VNOVA
            channelLines.cortex.forEach(l => output.push(l));

            // Layer 9: FALLBACK (consolidated)
            if (channelLines.fallback.length > 0) {
                // Keep only CHAIN, STRATEGY, PERSIST, GENOME-B64
                const kept = channelLines.fallback.filter(l =>
                    l.includes('FALLBACK-CHAIN') ||
                    l.includes('FALLBACK-STRATEGY') ||
                    l.includes('FALLBACK-PERSIST') ||
                    l.includes('FALLBACK-GENOME-B64')
                );
                if (kept.length > 0) {
                    kept.forEach(l => output.push(l));
                } else {
                    // If no consolidated tags, keep original
                    channelLines.fallback.forEach(l => output.push(l));
                }
            }

            // Layer 10: URL (always last)
            if (channelLines.url) output.push(channelLines.url);
        }

        function resetChannel() {
            channelLines = {
                extinf: null,
                exthttp: [],
                overflow: [],
                vlc: {},
                kodi: {},
                ape: [],
                attr: [],
                cortex: [],
                fallback: [],
                url: null
            };
            currentChannel = null;
        }

        // Detect profile from EXTINF line
        function detectProfile(extinfLine) {
            const upper = (extinfLine || '').toUpperCase();
            if (upper.includes('APE-PROFILE="P0"') || upper.includes('8K')) return 'P0';
            if (upper.includes('APE-PROFILE="P1"') || upper.includes('4K') || upper.includes('UHD')) return 'P1';
            if (upper.includes('APE-PROFILE="P2"')) return 'P2';
            if (upper.includes('APE-PROFILE="P3"') || upper.includes('FHD') || upper.includes('1080')) return 'P3';
            if (upper.includes('APE-PROFILE="P4"') || upper.includes('HD')) return 'P4';
            if (upper.includes('APE-PROFILE="P5"') || upper.includes('SD')) return 'P5';
            return 'P3';
        }

        // VLC dedup with rules
        function addVLC(key, value) {
            if (channelLines.vlc[key] === undefined) {
                channelLines.vlc[key] = value;
                return;
            }
            stats.vlcDeduped++;

            if (RULES.KEEP_HIGHEST.has(key)) {
                const existing = parseFloat(channelLines.vlc[key]) || 0;
                const incoming = parseFloat(value) || 0;
                if (incoming > existing) channelLines.vlc[key] = value;
            } else if (RULES.KEEP_LOWEST.has(key)) {
                const existing = parseFloat(channelLines.vlc[key]) || 0;
                const incoming = parseFloat(value) || 0;
                if (incoming < existing) channelLines.vlc[key] = value;
            }
            // KEEP_FIRST and default: keep existing
        }

        // KODI dedup (keep latest, apply profile)
        function addKODI(key, value, profile) {
            const profileData = PROFILES[profile] || PROFILES.P3;
            // Profile-aware enforcement
            if (key === 'inputstream.adaptive.max_resolution' ||
                key === 'inputstream.adaptive.resolution_secure_max') {
                value = profileData.maxRes;
                stats.kodiFixed++;
            } else if (key === 'inputstream.adaptive.max_bandwidth' ||
                       key === 'inputstream.adaptive.initial_bandwidth' ||
                       key === 'inputstream.adaptive.initial_bitrate_max') {
                value = String(profileData.maxBw);
                stats.kodiFixed++;
            }
            channelLines.kodi[key] = value;
        }

        // ─── MAIN PROCESSING LOOP ───
        let profile = 'P3';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip empty lines
            if (!trimmed) continue;

            // Global header lines (before first EXTINF)
            if (!currentChannel && !trimmed.startsWith('#EXTINF')) {
                output.push(line);
                continue;
            }

            // New channel starts
            if (trimmed.startsWith('#EXTINF')) {
                // Emit previous channel if any
                if (currentChannel) emitChannel();
                resetChannel();

                // Unicode sanitize the EXTINF line
                let sanitized = line;
                if (sanitized.includes('\u2503') || sanitized.includes('\u2502') || sanitized.includes('\u2551')) {
                    sanitized = sanitized.replace(/[\u2503\u2502\u2551]/g, '|');
                    stats.unicodeSanitized++;
                }

                channelLines.extinf = sanitized;
                currentChannel = sanitized;
                profile = detectProfile(sanitized);
                continue;
            }

            // URL line (not a tag)
            if (currentChannel && !trimmed.startsWith('#')) {
                channelLines.url = line;
                emitChannel();
                resetChannel();
                continue;
            }

            // ─── TAG CLASSIFICATION ───
            if (trimmed.startsWith('#EXTHTTP:')) {
                channelLines.exthttp.push(line);
            } else if (trimmed.startsWith('#EXT-X-APE-OVERFLOW-HEADERS:')) {
                channelLines.overflow.push(line);
            } else if (trimmed.startsWith('#EXTVLCOPT:')) {
                // Parse key=value
                const content = trimmed.substring(11); // after '#EXTVLCOPT:'
                const eqIdx = content.indexOf('=');
                if (eqIdx > 0) {
                    addVLC(content.substring(0, eqIdx), content.substring(eqIdx + 1));
                }
            } else if (trimmed.startsWith('#KODIPROP:')) {
                const content = trimmed.substring(10); // after '#KODIPROP:'
                const eqIdx = content.indexOf('=');
                if (eqIdx > 0) {
                    addKODI(content.substring(0, eqIdx), content.substring(eqIdx + 1), profile);
                }
            } else if (trimmed.startsWith('#EXT-X-APE-FALLBACK')) {
                channelLines.fallback.push(line);
            } else if (trimmed.startsWith('#EXTATTRFROMURL:')) {
                channelLines.attr.push(line);
            } else if (trimmed.startsWith('#EXT-X-CORTEX') || trimmed.startsWith('#EXT-X-VNOVA')) {
                channelLines.cortex.push(line);
            } else if (trimmed.startsWith('#EXT-X-APE')) {
                channelLines.ape.push(line);
            } else {
                // Unknown tag — keep in APE layer
                channelLines.ape.push(line);
            }
        }

        // Emit last channel if pending
        if (currentChannel) emitChannel();

        const elapsed = Math.round(performance.now() - startTime);
        const resultText = output.join('\n');

        console.log(
            `%c⚡ [M3U8 Post-Processor] ${stats.channels} channels processed in ${elapsed}ms` +
            ` | VLC deduped: ${stats.vlcDeduped} | KODI fixed: ${stats.kodiFixed}` +
            ` | Unicode: ${stats.unicodeSanitized}`,
            'color: #10b981; font-weight: bold;'
        );

        return { text: resultText, stats };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AUTO-HOOK: Intercept M3U8 generation results
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Wraps any generator function to auto-apply post-processing.
     * Call this once after the generator is loaded.
     */
    function hookGenerator() {
        // Hook into app.state.generatedM3U8 setter
        if (window.app && window.app.state) {
            const originalDescriptor = Object.getOwnPropertyDescriptor(window.app.state, 'generatedM3U8');
            const originalValue = window.app.state.generatedM3U8;

            Object.defineProperty(window.app.state, 'generatedM3U8', {
                get() {
                    return this._generatedM3U8;
                },
                set(value) {
                    if (value && typeof value === 'string' && value.startsWith('#EXTM3U')) {
                        const result = postProcess(value);
                        this._generatedM3U8 = result.text;
                        this._postProcessStats = result.stats;
                    } else {
                        this._generatedM3U8 = value;
                    }
                },
                configurable: true,
                enumerable: true
            });

            // Set initial value if exists
            if (originalValue) {
                window.app.state.generatedM3U8 = originalValue;
            }

            console.log('%c⚡ [M3U8 Post-Processor] Hooked into app.state.generatedM3U8', 'color: #8b5cf6;');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GLOBAL EXPOSURE
    // ═══════════════════════════════════════════════════════════════════════
    window.M3U8PostProcessor = {
        process: postProcess,
        hookGenerator: hookGenerator,
        version: '1.0.0'
    };

    // Auto-hook when DOM is ready and app exists
    let hookAttempts = 0;
    const tryHook = setInterval(() => {
        hookAttempts++;
        if (window.app && window.app.state) {
            hookGenerator();
            clearInterval(tryHook);
        }
        if (hookAttempts > 50) clearInterval(tryHook); // Give up after 10s
    }, 200);

    console.log('%c⚡ M3U8 Post-Processor v1.0 (Inline Rules Engine) Cargado', 'color: #10b981; font-weight: bold; font-size: 14px;');

})();
