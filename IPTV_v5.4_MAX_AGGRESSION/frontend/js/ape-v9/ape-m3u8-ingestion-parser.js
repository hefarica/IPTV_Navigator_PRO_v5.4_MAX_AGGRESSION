/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE M3U8 INGESTION PARSER v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * LECTOR universal de listas IPTV M3U/M3U8. Lee CUALQUIER lista de
 * cualquier proveedor y emite un array de channel objects compatibles
 * con generateChannelEntry() del generador OMEGA.
 * 
 * REGLA SHIELDED: Este parser NO modifica URLs. Las URLs se preservan
 * exactamente como vienen en la lista original (directas al proveedor).
 * 
 * @license Apache-2.0
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const VERSION = '1.0.0';

    // ─────────────────────────────────────────────────────────────
    // REGEX PATTERNS
    // ─────────────────────────────────────────────────────────────

    // #EXTINF:-1 tvg-id="123" tvg-name="CNN" tvg-logo="..." group-title="News",CNN HD
    const RE_EXTINF = /^#EXTINF:\s*(-?\d*\.?\d*)\s*,?\s*(.*)/;
    const RE_ATTR = /([\w-]+)="([^"]*)"/g;

    // URL detection
    const RE_URL = /^https?:\/\/.+/i;

    // Xtream: /live/{user}/{pass}/{id}.{ext}
    const RE_XTREAM = /\/(?:live|movie|series)\/([^/]+)\/([^/]+)\/(\d+)\.\w+/;

    // Query HLS: ?username=X&password=Y
    const RE_QUERY = /[?&]username=([^&]+).*[?&]password=([^&]+)/i;

    // ─────────────────────────────────────────────────────────────
    // EXTINF ATTRIBUTE PARSER
    // ─────────────────────────────────────────────────────────────

    function parseExtinfAttrs(line) {
        const attrs = {};
        let match;
        RE_ATTR.lastIndex = 0;
        while ((match = RE_ATTR.exec(line)) !== null) {
            attrs[match[1].toLowerCase()] = match[2];
        }
        return attrs;
    }

    // ─────────────────────────────────────────────────────────────
    // URL PARADIGM DETECTOR
    // ─────────────────────────────────────────────────────────────

    function detectParadigm(url) {
        const result = {
            paradigm: 'direct',
            host: '',
            port: '',
            username: '',
            password: '',
            streamId: ''
        };

        try {
            const parsed = new URL(url);
            result.host = parsed.hostname;
            result.port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');

            // Check Xtream pattern: /live/{user}/{pass}/{id}.ext
            const xtreamMatch = RE_XTREAM.exec(parsed.pathname);
            if (xtreamMatch) {
                result.paradigm = 'xtream';
                result.username = decodeURIComponent(xtreamMatch[1]);
                result.password = decodeURIComponent(xtreamMatch[2]);
                result.streamId = xtreamMatch[3];
                return result;
            }

            // Check query HLS: ?username=X&password=Y
            const queryMatch = RE_QUERY.exec(parsed.search);
            if (queryMatch) {
                result.paradigm = 'query_hls';
                result.username = decodeURIComponent(queryMatch[1]);
                result.password = decodeURIComponent(queryMatch[2]);
                return result;
            }
        } catch (e) {
            // malformed URL — just use as direct
        }

        return result;
    }

    // ─────────────────────────────────────────────────────────────
    // MAIN PARSER
    // ─────────────────────────────────────────────────────────────

    /**
     * Parse an M3U/M3U8 text into an array of channel objects
     * compatible with generateChannelEntry().
     * 
     * @param {string} text - Raw M3U8 file content
     * @param {Object} [opts] - Options
     * @param {string} [opts.sourceName] - Name of the source file
     * @param {Function} [opts.onProgress] - Progress callback (parsed, total)
     * @returns {{ channels: Array, stats: Object }}
     */
    function parse(text, opts = {}) {
        const t0 = performance.now();
        const sourceName = opts.sourceName || 'external';

        // Handle BOM
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

        const lines = text.split(/\r?\n/);
        const totalLines = lines.length;
        const channels = [];
        const stats = {
            totalLines: totalLines,
            totalChannels: 0,
            hosts: {},
            groups: {},
            paradigms: { xtream: 0, query_hls: 0, direct: 0 },
            profiles: { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
            parseTimeMs: 0,
            sourceName: sourceName
        };

        let currentExtinf = null;
        let currentAttrs = {};
        let channelIndex = 0;

        for (let i = 0; i < totalLines; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Skip #EXTM3U header
            if (line.startsWith('#EXTM3U')) continue;

            // Parse #EXTINF
            const extinfMatch = RE_EXTINF.exec(line);
            if (extinfMatch) {
                currentAttrs = parseExtinfAttrs(line);
                currentExtinf = {
                    duration: parseFloat(extinfMatch[1]) || -1,
                    title: extinfMatch[2] || ''
                };
                continue;
            }

            // Skip other tags (preserve for future use but don't block)
            if (line.startsWith('#')) continue;

            // This is a URL line
            if (RE_URL.test(line) && currentExtinf) {
                const url = line;
                const urlInfo = detectParadigm(url);

                // Determine name: tvg-name > title from EXTINF
                const name = currentAttrs['tvg-name'] || currentExtinf.title || 'Channel ' + (channelIndex + 1);

                // Quick profile guess from name/group
                const nameUpper = name.toUpperCase();
                const groupUpper = (currentAttrs['group-title'] || '').toUpperCase();
                let quickProfile = 'P3'; // default FHD
                if (nameUpper.includes('8K') || groupUpper.includes('8K')) quickProfile = 'P0';
                else if (nameUpper.includes('4K') || nameUpper.includes('UHD') || groupUpper.includes('4K') || groupUpper.includes('UHD') || groupUpper.includes('ULTRA')) quickProfile = 'P1';
                else if (nameUpper.includes('FHD') || nameUpper.includes('1080') || groupUpper.includes('FHD') || groupUpper.includes('FULL HD')) quickProfile = 'P3';
                else if (nameUpper.includes('HD') && !nameUpper.includes('FHD') && !nameUpper.includes('UHD')) quickProfile = 'P3';
                else if (nameUpper.includes('720') || groupUpper.includes('720')) quickProfile = 'P4';
                else if (nameUpper.includes('SD') || nameUpper.includes('480') || groupUpper.includes('SD')) quickProfile = 'P5';

                const channel = {
                    // Core fields for generateChannelEntry()
                    id: parseInt(currentAttrs['tvg-id'] || urlInfo.streamId || channelIndex, 10) || channelIndex,
                    stream_id: currentAttrs['tvg-id'] || urlInfo.streamId || String(channelIndex),
                    name: name,
                    stream_icon: currentAttrs['tvg-logo'] || '',
                    category_name: currentAttrs['group-title'] || 'Imported',
                    url: url,

                    // Ingestion metadata
                    _source: 'ingested',
                    _ingestedFrom: sourceName,
                    _host: urlInfo.host,
                    _port: urlInfo.port,
                    _paradigm: urlInfo.paradigm,
                    _quickProfile: quickProfile,

                    // Credentials extracted from URL
                    _username: urlInfo.username,
                    _password: urlInfo.password,

                    // IPTV extras
                    tv_archive: currentAttrs['catchup'] ? 1 : 0,
                    tv_archive_duration: parseInt(currentAttrs['catchup-days'] || '0', 10),
                    tv_shift: parseInt(currentAttrs['tvg-shift'] || '0', 10),
                    num: parseInt(currentAttrs['tvg-chno'] || String(channelIndex + 1), 10),

                    // Probe placeholder — filled by QualityProber if enabled
                    _probeData: null
                };

                channels.push(channel);

                // Stats
                stats.paradigms[urlInfo.paradigm] = (stats.paradigms[urlInfo.paradigm] || 0) + 1;
                stats.hosts[urlInfo.host] = (stats.hosts[urlInfo.host] || 0) + 1;
                stats.groups[channel.category_name] = (stats.groups[channel.category_name] || 0) + 1;
                stats.profiles[quickProfile] = (stats.profiles[quickProfile] || 0) + 1;

                channelIndex++;

                // Progress callback every 2000 channels
                if (opts.onProgress && channelIndex % 2000 === 0) {
                    opts.onProgress(channelIndex, i, totalLines);
                }

                // Reset
                currentExtinf = null;
                currentAttrs = {};
            }
        }

        stats.totalChannels = channels.length;
        stats.parseTimeMs = Math.round(performance.now() - t0);
        stats.hostsUnique = Object.keys(stats.hosts).length;
        stats.groupsUnique = Object.keys(stats.groups).length;

        console.log(
            `%c📥 [INGESTION] ${channels.length} canales parseados en ${stats.parseTimeMs}ms ` +
            `(${stats.hostsUnique} hosts, ${stats.groupsUnique} grupos)`,
            'color: #10b981; font-weight: bold;'
        );

        return { channels, stats };
    }

    // ─────────────────────────────────────────────────────────────
    // FILE READER HELPER
    // ─────────────────────────────────────────────────────────────

    /**
     * Read a File object (from input or drag-drop) and parse it.
     * @param {File} file
     * @param {Object} [opts]
     * @returns {Promise<{ channels: Array, stats: Object }>}
     */
    async function parseFile(file, opts = {}) {
        opts.sourceName = opts.sourceName || file.name;
        const text = await file.text();
        return parse(text, opts);
    }

    // ─────────────────────────────────────────────────────────────
    // CREDENTIALS MAP BUILDER
    // ─────────────────────────────────────────────────────────────

    /**
     * Build a credentialsMap from ingested channels (for the generator).
     * Groups by host and extracts the first username/password found.
     */
    function buildCredentialsMapFromIngested(channels) {
        const map = {};
        for (const ch of channels) {
            if (!ch._username || !ch._password || !ch._host) continue;
            const hostKey = 'host:' + ch._host.toLowerCase();
            if (map[hostKey]) continue;

            // Build baseUrl from URL
            let baseUrl = '';
            try {
                const parsed = new URL(ch.url);
                baseUrl = parsed.origin;
            } catch (e) {
                continue;
            }

            const entry = {
                baseUrl: baseUrl,
                username: ch._username,
                password: ch._password
            };
            map[hostKey] = entry;
            if (ch.id) map[ch.id] = entry;
        }
        return map;
    }

    // ─────────────────────────────────────────────────────────────
    // GLOBAL EXPORT
    // ─────────────────────────────────────────────────────────────

    const ApeM3U8IngestionParser = {
        version: VERSION,
        parse: parse,
        parseFile: parseFile,
        buildCredentialsMapFromIngested: buildCredentialsMapFromIngested,
        detectParadigm: detectParadigm
    };

    if (typeof global !== 'undefined') {
        global.ApeM3U8IngestionParser = ApeM3U8IngestionParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
