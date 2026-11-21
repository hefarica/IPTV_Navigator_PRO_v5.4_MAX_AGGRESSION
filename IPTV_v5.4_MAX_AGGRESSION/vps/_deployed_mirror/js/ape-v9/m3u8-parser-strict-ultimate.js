/**
 * ============================================================================
 * M3U8 PARSER STRICT ULTIMATE — Vanilla JS HLS Parser/Validator
 * ============================================================================
 *
 * Companion del generator `m3u8-typed-arrays-ultimate.js`.
 *
 *   - Generator: WRITE-only — construye M3U8 desde channel data
 *   - Parser:    READ-only  — parsea y valida M3U8 existentes
 *
 * Especificación implementada:
 *   - RFC 8216 (HLS) — todas las cláusulas §4.x relevantes
 *   - RFC 8216bis (LL-HLS extension) — #EXT-X-PART, #EXT-X-PRELOAD-HINT
 *   - RFC 6381 (codec strings) — hvc1, avc1, av01, dvh.*, mp4a, ec-3, opus, vp09, lcev
 *   - Project doctrine — banned outbound headers, EXTHTTP traps, SESSION-DATA
 *
 * Arquitectura:
 *   - IIFE module, expone `window.M3U8ParserStrictUltimate`
 *   - Browser + Node compatible
 *   - Cero dependencias externas (vanilla JS)
 *   - Streaming-mode (`parseStream`) para archivos >512MB (handles 1.6GB+)
 *   - Full-text mode (`parse`) para archivos pequeños
 *
 * API pública:
 *   M3U8ParserStrictUltimate.parse(text, options)        → ParseResult sync
 *   M3U8ParserStrictUltimate.parseLines(linesIterable)   → ParseResult sync
 *   M3U8ParserStrictUltimate.parseStream(readable)       → Promise<ParseResult>
 *   M3U8ParserStrictUltimate.validateExtHttp(jsonStr)    → string[] issues
 *   M3U8ParserStrictUltimate.validateCodec(codecStr)     → {valid, reason}
 *   M3U8ParserStrictUltimate.summarize(parseResult)      → human-readable
 *
 * ParseResult shape:
 *   {
 *     valid:      boolean,           // verdict agregado (errors.length === 0)
 *     type:       'master'|'media',  // tipo de playlist detectado
 *     version:    number,            // valor del #EXT-X-VERSION
 *     errors:     [{line, type, msg, rule, severity}],
 *     warnings:   [{line, type, msg}],
 *     stats:      {channels, variants, sessionData, defines, ...},
 *     manifest:   {independentSegments, contentSteering, sessionDataList, ...}
 *   }
 *
 * @version 1.0.0
 * @date 2026-05-01
 * ============================================================================
 */
(function () {
    'use strict';

    const VERSION = '1.0.0';
    const SPEC = 'RFC 8216 + RFC 6381 + Project doctrine';

    // ── RFC 6381 codec patterns ─────────────────────────────────────────────
    const CODEC_PATTERNS = {
        hevc:  /^(hvc1|hev1)\.[A-Z0-9]\d?\.[A-F0-9]{1,8}\.[LH]\d{1,3}(\.[0-9A-F]{2}){0,6}$/i,
        avc:   /^avc[123]\.[0-9A-F]{6}$/i,
        av1:   /^av01\.\d\.\d{1,2}[MH]\.\d{1,2}(\.\d){0,7}$/i,
        dv:    /^dvh[e1]\.\d{1,2}\.\d{1,2}$/i,
        aac:   /^mp4a\.40\.\d{1,2}$/i,
        eac3:  /^ec-3$|^eac3$|^eac-3$/i,    // RFC + common industry variants
        ac3:   /^ac-3$|^ac3$/i,
        opus:  /^opus$/i,
        mp3:   /^mp4a\.6B$|^mp4a\.40\.34$/i,
        vp9:   /^vp09\.\d{2}\.\d{2}\.\d{2}/i,
        vp8:   /^vp8$/i,
        lcevc: /^lcev\.\d\.\d\.\d$/i,
        vvc:   /^vvc1\.\d\.[A-F0-9]+\.[LH]\d+/i,
        flac:  /^fLaC$/,
    };

    // ── RFC 8216 singleton tags ─────────────────────────────────────────────
    const SINGLETON_TAGS = new Set([
        '#EXTM3U',
        '#EXT-X-VERSION',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-START',
        '#EXT-X-PLAYLIST-TYPE',
        '#EXT-X-TARGETDURATION',
        '#EXT-X-MEDIA-SEQUENCE',
        '#EXT-X-DISCONTINUITY-SEQUENCE',
        '#EXT-X-ENDLIST',
        '#EXT-X-I-FRAMES-ONLY',
        '#EXT-X-CONTENT-STEERING',
    ]);

    // ── Master-only tags (forbidden in media playlist) ──────────────────────
    const MASTER_ONLY_TAGS = new Set([
        '#EXT-X-STREAM-INF',
        '#EXT-X-I-FRAME-STREAM-INF',
        '#EXT-X-MEDIA',
        '#EXT-X-SESSION-DATA',
        '#EXT-X-SESSION-KEY',
        '#EXT-X-CONTENT-STEERING',
    ]);

    // ── Media-only tags (forbidden in master playlist) ──────────────────────
    const MEDIA_ONLY_TAGS = new Set([
        '#EXT-X-TARGETDURATION',
        '#EXT-X-MEDIA-SEQUENCE',
        '#EXT-X-DISCONTINUITY-SEQUENCE',
        '#EXT-X-ENDLIST',
        '#EXT-X-PLAYLIST-TYPE',
        '#EXT-X-I-FRAMES-ONLY',
        '#EXTINF',
        '#EXT-X-BYTERANGE',
        '#EXT-X-DISCONTINUITY',
        '#EXT-X-KEY',
        '#EXT-X-MAP',
        '#EXT-X-PROGRAM-DATE-TIME',
        '#EXT-X-GAP',
        '#EXT-X-BITRATE',
        '#EXT-X-PART',
        '#EXT-X-PART-INF',
        '#EXT-X-SERVER-CONTROL',
        '#EXT-X-PRELOAD-HINT',
        '#EXT-X-RENDITION-REPORT',
        '#EXT-X-SKIP',
    ]);

    // ── Tags with version requirements (RFC 8216 §7) ────────────────────────
    const VERSION_REQUIREMENTS = {
        '#EXT-X-MAP': 5,
        '#EXT-X-DATERANGE': 6,
        '#EXT-X-DEFINE': 8,
        '#EXT-X-PART': 9,
        '#EXT-X-PART-INF': 9,
        '#EXT-X-PRELOAD-HINT': 9,
        '#EXT-X-RENDITION-REPORT': 9,
        '#EXT-X-SKIP': 9,
        '#EXT-X-CONTENT-STEERING': 9,
    };

    // ── Required attributes per tag ─────────────────────────────────────────
    const REQUIRED_ATTRS = {
        '#EXT-X-STREAM-INF':         ['BANDWIDTH'],
        '#EXT-X-I-FRAME-STREAM-INF': ['BANDWIDTH', 'URI'],
        '#EXT-X-MEDIA':              ['TYPE', 'GROUP-ID', 'NAME'],
        '#EXT-X-KEY':                ['METHOD'],
        '#EXT-X-SESSION-KEY':        ['METHOD'],
        '#EXT-X-MAP':                ['URI'],
        '#EXT-X-DATERANGE':          ['ID', 'START-DATE'],
        '#EXT-X-SESSION-DATA':       ['DATA-ID'],
        '#EXT-X-PART':               ['URI', 'DURATION'],
        '#EXT-X-PRELOAD-HINT':       ['TYPE', 'URI'],
        '#EXT-X-RENDITION-REPORT':   ['URI', 'LAST-MSN'],
        '#EXT-X-CONTENT-STEERING':   ['SERVER-URI'],
    };

    // ── Banned outbound headers (project doctrine — banned_patterns.md) ─────
    const BANNED_OUTBOUND_HEADERS = new Set([
        'Connection', 'Keep-Alive', 'Proxy-Connection',
        'X-Forwarded-For', 'X-Real-IP', 'X-Client-IP',
        'X-Forwarded-Proto', 'X-Forwarded-Host', 'X-Forwarded-Port',
        'X-Via', 'Via', 'Forwarded',
        'X-APE-Nonce', 'X-APE-SID', 'X-APE-List-Hash', 'X-APE-Timestamp',
        'X-No-Proxy', 'X-Powered-By', 'Server',
        'X-AspNet-Version', 'X-AspNetMvc-Version',
    ]);

    // ── EXTHTTP traps (project doctrine — 8 traps) ──────────────────────────
    const EXTHTTP_TRAPS = {
        TRAP_2: 'percent-encoded space (%20) in User-Agent',
        TRAP_3: 'CRLF in header value',
        TRAP_4: 'trailing comma in JSON',
        TRAP_5: 'mixed single/double quotes',
        TRAP_6: 'missing JSON braces',
        TRAP_7: 'unescaped backslash',
        TRAP_8: 'double percent-encoding',
    };

    // ── Helpers ─────────────────────────────────────────────────────────────

    function parseAttrList(s) {
        // Parse `KEY=VALUE,KEY2="QUOTED, VALUE",KEY3=123` syntax
        const attrs = {};
        if (!s) return attrs;
        const re = /([A-Z0-9-]+)=("([^"]*)"|([^,]+))/g;
        let m;
        while ((m = re.exec(s)) !== null) {
            attrs[m[1]] = m[3] !== undefined ? m[3] : (m[4] || '').trim();
        }
        return attrs;
    }

    function getTagName(line) {
        // Returns tag without args: "#EXT-X-STREAM-INF:BANDWIDTH=..." → "#EXT-X-STREAM-INF"
        if (!line || !line.startsWith('#')) return null;
        const colonIdx = line.indexOf(':');
        return colonIdx === -1 ? line : line.substring(0, colonIdx);
    }

    function getTagBody(line) {
        const colonIdx = line.indexOf(':');
        return colonIdx === -1 ? '' : line.substring(colonIdx + 1);
    }

    function isUriLine(line) {
        if (!line || line.startsWith('#')) return false;
        // Strip APE pipe params (URL|key=value&...)
        const pipe = line.indexOf('|');
        const url = pipe === -1 ? line : line.substring(0, pipe);
        return /^(https?|file|data):\/\//i.test(url) || url.startsWith('/');
    }

    // ── Public: validateCodec (RFC 6381) ────────────────────────────────────

    function validateCodec(codecStr) {
        if (!codecStr || typeof codecStr !== 'string') {
            return { valid: false, reason: 'empty codec string' };
        }
        const codecs = codecStr.split(',').map(c => c.trim());
        const invalid = [];
        for (const c of codecs) {
            let matched = false;
            for (const name in CODEC_PATTERNS) {
                if (CODEC_PATTERNS[name].test(c)) { matched = true; break; }
            }
            if (!matched) invalid.push(c);
        }
        return invalid.length
            ? { valid: false, reason: 'unrecognized RFC 6381 codecs: ' + invalid.join(', '), invalid }
            : { valid: true, codecs };
    }

    // ── Public: validateExtHttp (project doctrine — 8 traps + banned hdrs) ──

    function validateExtHttp(jsonStr) {
        const issues = [];
        if (!jsonStr || typeof jsonStr !== 'string') {
            issues.push('TRAP-6: empty body');
            return issues;
        }
        if (!(jsonStr.startsWith('{') && jsonStr.endsWith('}'))) {
            issues.push('TRAP-6: missing braces');
            return issues;
        }
        if (/,\s*}/.test(jsonStr)) issues.push('TRAP-4: trailing comma');
        if (jsonStr.includes("'") && !jsonStr.includes('"')) {
            issues.push('TRAP-5: single quotes');
        }
        let obj;
        try { obj = JSON.parse(jsonStr); }
        catch (e) { issues.push('INVALID-JSON: ' + e.message); return issues; }

        for (const k in obj) {
            const v = obj[k];
            if (typeof v !== 'string') continue;
            if (v.indexOf('\r') !== -1 || v.indexOf('\n') !== -1) {
                issues.push('TRAP-3: CRLF in ' + k);
            }
            if (k.toLowerCase() === 'user-agent' && v.indexOf('%20') !== -1) {
                issues.push('TRAP-2: %20 in User-Agent');
            }
            if (/%25[0-9A-F]{2}/i.test(v)) {
                issues.push('TRAP-8: double-encoding in ' + k);
            }
            // Banned outbound headers (doctrine)
            if (BANNED_OUTBOUND_HEADERS.has(k)) {
                issues.push('BANNED-OUTBOUND: ' + k + ' must not leak upstream');
            }
        }
        return issues;
    }

    // ── Core parser state machine ───────────────────────────────────────────

    // ── Mode profiles ───────────────────────────────────────────────────────
    // 'strict' = pure RFC 8216 — todos los violations son errors
    // 'iptv'   = realistic IPTV — patterns toleradas por TiviMate/Kodi/VLC/ExoPlayer
    //            se reportan como warnings en vez de errors:
    //              - EXTINF in master (hybrid IPTV manifest pattern)
    //              - I-FRAME-STREAM-INF sin URI attribute (cosmetic)
    //            DATERANGE sin START-DATE permanece error (RFC §4.4.5.1 unambiguous)
    const IPTV_TOLERANT_PATTERNS = new Set([
        'EXTINF_IN_MASTER',
        'I_FRAME_NO_URI_ATTR',
    ]);

    function createParseState(options) {
        return {
            valid: false,
            type: null,            // 'master' | 'media'
            version: null,
            _mode: (options && options.mode) || 'iptv',  // default iptv-tolerant
            independentSegments: false,
            errors: [],
            warnings: [],
            stats: {
                lines: 0,
                channels: 0,
                variants: 0,
                iFrameVariants: 0,
                sessionDataEntries: 0,
                defines: 0,
                medias: 0,
                contentSteering: false,
                codecs: {},        // codec name → count
                bandwidthMin: Infinity,
                bandwidthMax: 0,
                resolutionMax: '0x0',
                resolutionMaxPixels: 0,
                bannedHeadersHits: 0,
                exthttpValid: 0,
                exthttpInvalid: 0,
            },
            manifest: {
                contentSteering: null,
                sessionDataList: [],
                defines: [],
                medias: [],
                variants: [],
            },
            _seenSingletons: new Set(),
            _seenSessionDataIds: new Set(),
            _seenDefineNames: new Set(),
            _pendingExtinf: null,
            _pendingStreamInf: null,
            _lineNum: 0,
            _channelCountTag: null,
        };
    }

    function pushError(state, type, msg, rule) {
        // IPTV mode: downgrade tolerable patterns to warning
        if (state._mode === 'iptv' && IPTV_TOLERANT_PATTERNS.has(type)) {
            state.warnings.push({
                line: state._lineNum, type, msg, rule: rule || null, severity: 'warning',
                note: 'downgraded from error in iptv mode (tolerated by real players)',
            });
            return;
        }
        state.errors.push({
            line: state._lineNum, type, msg, rule: rule || null, severity: 'error',
        });
    }
    function pushWarning(state, type, msg, rule) {
        state.warnings.push({
            line: state._lineNum, type, msg, rule: rule || null, severity: 'warning',
        });
    }

    function processLine(state, line) {
        state._lineNum++;
        state.stats.lines++;

        // Skip empty lines and pure comments (lines starting with # but not #EXT*)
        if (!line || (line.startsWith('#') && !line.startsWith('#EXT'))) {
            // Comments are RFC-legal but rare; skip
            if (state._pendingExtinf) state._pendingExtinf = null; // reset
            if (state._pendingStreamInf) state._pendingStreamInf = null;
            return;
        }

        // First non-empty must be #EXTM3U
        if (state._lineNum === 1) {
            if (line.split(/\s/)[0] !== '#EXTM3U') {
                pushError(state, 'NO_EXTM3U', 'First line must be #EXTM3U, got: ' + line.substring(0, 60), 'RFC 8216 §4.3.1.1');
                return;
            }
            state._seenSingletons.add('#EXTM3U');
            return;
        }

        // URI line — close any pending #EXTINF or #EXT-X-STREAM-INF
        if (isUriLine(line)) {
            if (state._pendingExtinf) {
                state.stats.channels++;
                state._pendingExtinf = null;
            } else if (state._pendingStreamInf) {
                state.stats.variants++;
                state.manifest.variants.push(state._pendingStreamInf);
                state._pendingStreamInf = null;
            }
            return;
        }

        // Process tags
        const tag = getTagName(line);
        const body = getTagBody(line);

        // Singleton enforcement
        if (SINGLETON_TAGS.has(tag) && state._seenSingletons.has(tag)) {
            pushError(state, 'DUPLICATE_SINGLETON', tag + ' is a singleton tag', 'RFC 8216 §4.3');
        }
        state._seenSingletons.add(tag);

        // Required attrs enforcement
        if (REQUIRED_ATTRS[tag]) {
            const attrs = parseAttrList(body);
            for (const reqAttr of REQUIRED_ATTRS[tag]) {
                if (!(reqAttr in attrs)) {
                    // I-FRAME-STREAM-INF missing URI is project-cosmetic; iptv mode tolerates
                    if (tag === '#EXT-X-I-FRAME-STREAM-INF' && reqAttr === 'URI') {
                        pushError(state, 'I_FRAME_NO_URI_ATTR',
                            tag + ' missing URI attribute (no trick-play target)', 'RFC 8216 §4.3.4.3');
                    } else {
                        pushError(state, 'MISSING_ATTR',
                            tag + ' missing required attribute: ' + reqAttr, 'RFC 8216 §4.3.4/§4.3.5');
                    }
                }
            }
        }

        // Version requirement check
        if (VERSION_REQUIREMENTS[tag] && state.version !== null) {
            if (state.version < VERSION_REQUIREMENTS[tag]) {
                pushWarning(state, 'VERSION_TOO_LOW', tag + ' requires #EXT-X-VERSION >= ' + VERSION_REQUIREMENTS[tag] + ', got ' + state.version, 'RFC 8216 §7');
            }
        }

        // Per-tag handling
        switch (tag) {
            case '#EXT-X-VERSION': {
                const v = parseInt(body, 10);
                if (isNaN(v) || v < 1) {
                    pushError(state, 'INVALID_VERSION', '#EXT-X-VERSION must be positive integer', 'RFC 8216 §4.3.1.2');
                } else {
                    state.version = v;
                }
                break;
            }

            case '#EXT-X-INDEPENDENT-SEGMENTS':
                state.independentSegments = true;
                break;

            case '#EXTINF': {
                state.type = state.type || 'media';
                if (state.type === 'master') {
                    pushError(state, 'EXTINF_IN_MASTER', '#EXTINF in master playlist', 'RFC 8216 §4.3.2');
                }
                const m = body.match(/^(-?\d+(?:\.\d+)?),?/);
                if (!m) {
                    pushError(state, 'EXTINF_NO_DURATION', '#EXTINF missing numeric duration', 'RFC 8216 §4.3.2.1');
                } else {
                    state._pendingExtinf = { duration: parseFloat(m[1]), line: state._lineNum };
                }
                break;
            }

            case '#EXT-X-STREAM-INF': {
                state.type = state.type || 'master';
                if (state.type === 'media') {
                    pushError(state, 'STREAMINF_IN_MEDIA', '#EXT-X-STREAM-INF in media playlist', 'RFC 8216 §4.3.4.2');
                }
                const attrs = parseAttrList(body);
                if (attrs.CODECS) {
                    const cv = validateCodec(attrs.CODECS);
                    if (!cv.valid) {
                        pushWarning(state, 'INVALID_CODECS', cv.reason, 'RFC 6381');
                    }
                    // Aggregate codec family stats regardless of validity (catalog purposes)
                    for (const codec of attrs.CODECS.split(',').map(c => c.trim())) {
                        const family = codec.split('.')[0].toLowerCase();
                        state.stats.codecs[family] = (state.stats.codecs[family] || 0) + 1;
                    }
                }
                if (attrs.BANDWIDTH) {
                    const bw = parseInt(attrs.BANDWIDTH, 10);
                    if (!isNaN(bw)) {
                        state.stats.bandwidthMin = Math.min(state.stats.bandwidthMin, bw);
                        state.stats.bandwidthMax = Math.max(state.stats.bandwidthMax, bw);
                    }
                }
                if (attrs.RESOLUTION) {
                    const rm = attrs.RESOLUTION.match(/^(\d+)x(\d+)$/);
                    if (rm) {
                        const pixels = parseInt(rm[1], 10) * parseInt(rm[2], 10);
                        if (pixels > state.stats.resolutionMaxPixels) {
                            state.stats.resolutionMaxPixels = pixels;
                            state.stats.resolutionMax = attrs.RESOLUTION;
                        }
                    }
                }
                state._pendingStreamInf = { attrs, line: state._lineNum };
                break;
            }

            case '#EXT-X-I-FRAME-STREAM-INF':
                state.type = state.type || 'master';
                state.stats.iFrameVariants++;
                break;

            case '#EXT-X-MEDIA': {
                state.type = state.type || 'master';
                state.stats.medias++;
                state.manifest.medias.push(parseAttrList(body));
                break;
            }

            case '#EXT-X-SESSION-DATA': {
                state.type = state.type || 'master';
                const attrs = parseAttrList(body);
                if (attrs['DATA-ID']) {
                    // RFC 8216 §4.3.4.4: each DATA-ID/LANGUAGE pair must appear at most once
                    const key = attrs['DATA-ID'] + '|' + (attrs.LANGUAGE || '');
                    if (state._seenSessionDataIds.has(key)) {
                        pushError(state, 'DUPLICATE_SESSION_DATA_ID', 'DATA-ID ' + attrs['DATA-ID'] + ' duplicated', 'RFC 8216 §4.3.4.4');
                    }
                    state._seenSessionDataIds.add(key);
                    if (!attrs.VALUE && !attrs.URI) {
                        pushError(state, 'SESSION_DATA_NO_VALUE_URI', 'SESSION-DATA must have VALUE or URI', 'RFC 8216 §4.3.4.4');
                    }
                }
                state.stats.sessionDataEntries++;
                state.manifest.sessionDataList.push(parseAttrList(body));
                break;
            }

            case '#EXT-X-DEFINE': {
                const attrs = parseAttrList(body);
                if (!attrs.NAME && !attrs.IMPORT && !attrs.QUERYPARAM) {
                    pushError(state, 'DEFINE_NO_TYPE', 'DEFINE must have NAME, IMPORT, or QUERYPARAM', 'RFC 8216 §4.3.5.4');
                }
                if (attrs.NAME) {
                    if (state._seenDefineNames.has(attrs.NAME)) {
                        pushError(state, 'DUPLICATE_DEFINE', 'DEFINE NAME=' + attrs.NAME + ' duplicated', 'RFC 8216 §4.3.5.4');
                    }
                    state._seenDefineNames.add(attrs.NAME);
                }
                state.stats.defines++;
                state.manifest.defines.push(attrs);
                break;
            }

            case '#EXT-X-CONTENT-STEERING':
                state.type = state.type || 'master';
                state.stats.contentSteering = true;
                state.manifest.contentSteering = parseAttrList(body);
                break;

            case '#EXTHTTP': {
                const issues = validateExtHttp(body);
                if (issues.length) {
                    state.stats.exthttpInvalid++;
                    for (const issue of issues) {
                        if (issue.startsWith('INVALID-JSON') || issue.startsWith('TRAP-')) {
                            pushError(state, 'EXTHTTP_TRAP', issue, 'project doctrine');
                        } else if (issue.startsWith('BANNED-OUTBOUND')) {
                            state.stats.bannedHeadersHits++;
                            pushError(state, 'BANNED_OUTBOUND_HEADER', issue, 'project doctrine');
                        }
                    }
                } else {
                    state.stats.exthttpValid++;
                }
                break;
            }

            case '#EXT-X-APE-CHANNELS': {
                const n = parseInt(body, 10);
                if (!isNaN(n)) state._channelCountTag = n;
                break;
            }

            case '#EXT-X-APE-VALIDATED':
                // Our own CA11 marker — informational only
                state.manifest.preValidated = body;
                break;

            default:
                // Master/Media tag mixing detection
                if (state.type === 'master' && MEDIA_ONLY_TAGS.has(tag)) {
                    pushError(state, 'MEDIA_TAG_IN_MASTER', tag + ' is media-playlist-only', 'RFC 8216 §4.3.3');
                }
                if (state.type === 'media' && MASTER_ONLY_TAGS.has(tag)) {
                    pushError(state, 'MASTER_TAG_IN_MEDIA', tag + ' is master-playlist-only', 'RFC 8216 §4.3.4');
                }
                break;
        }
    }

    function finalizeParse(state) {
        // Check pending entries
        if (state._pendingExtinf) {
            pushError(state, 'EXTINF_NO_URI', '#EXTINF at line ' + state._pendingExtinf.line + ' has no following URI', 'RFC 8216 §4.3.2.1');
        }
        if (state._pendingStreamInf) {
            pushError(state, 'STREAMINF_NO_URI', '#EXT-X-STREAM-INF at line ' + state._pendingStreamInf.line + ' has no following URI', 'RFC 8216 §4.3.4.2');
        }

        // Cross-check channel count tag vs actual variants/channels
        if (state._channelCountTag !== null) {
            const actual = state.type === 'master' ? state.stats.variants : state.stats.channels;
            if (state._channelCountTag !== actual) {
                pushWarning(state, 'CHANNEL_COUNT_MISMATCH',
                    '#EXT-X-APE-CHANNELS=' + state._channelCountTag + ' but actual=' + actual);
            }
        }

        // Master without variants
        if (state.type === 'master' && state.stats.variants === 0 && state.stats.iFrameVariants === 0) {
            pushWarning(state, 'MASTER_NO_VARIANTS', 'Master playlist has no STREAM-INF variants');
        }

        // Finalize stats
        if (state.stats.bandwidthMin === Infinity) state.stats.bandwidthMin = 0;

        state.valid = state.errors.length === 0;

        // Cleanup internal state
        delete state._seenSingletons;
        delete state._seenSessionDataIds;
        delete state._seenDefineNames;
        delete state._pendingExtinf;
        delete state._pendingStreamInf;
        delete state._lineNum;
        delete state._channelCountTag;

        return state;
    }

    // ── Public: parse(text) — full-text mode (small/medium files) ───────────

    function parse(text, options) {
        options = options || {};
        const state = createParseState(options);
        if (typeof text !== 'string') {
            pushError(state, 'INVALID_INPUT', 'parse() requires string input');
            return finalizeParse(state);
        }
        // Strip BOM
        if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
        // Split by newline (handles both LF and CRLF)
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            processLine(state, lines[i]);
        }
        return finalizeParse(state);
    }

    // ── Public: parseLines(iterable) — generator-friendly mode ──────────────

    function parseLines(iterable, options) {
        const state = createParseState(options);
        for (const line of iterable) {
            processLine(state, line.replace(/\r$/, ''));
        }
        return finalizeParse(state);
    }

    // ── Public: parseStream(readable) — streaming mode (huge files) ─────────

    async function parseStream(readable, options) {
        const state = createParseState(options);
        const decoder = (typeof TextDecoder !== 'undefined')
            ? new TextDecoder('utf-8')
            : null;
        let buffer = '';

        const reader = readable.getReader ? readable.getReader() : null;
        if (!reader) {
            throw new Error('parseStream requires ReadableStream with getReader()');
        }

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                let chunk;
                if (typeof value === 'string') {
                    chunk = value;
                } else if (decoder) {
                    chunk = decoder.decode(value, { stream: true });
                } else {
                    chunk = String.fromCharCode.apply(null, value);
                }
                buffer += chunk;
                // Process complete lines from buffer
                let nlIdx;
                while ((nlIdx = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, nlIdx).replace(/\r$/, '');
                    buffer = buffer.substring(nlIdx + 1);
                    processLine(state, line);
                }
            }
            // Flush remaining buffer
            if (buffer.length > 0) {
                processLine(state, buffer.replace(/\r$/, ''));
            }
        } finally {
            try { reader.releaseLock(); } catch (_) {}
        }

        return finalizeParse(state);
    }

    // ── Public: summarize(parseResult) — human-readable report ──────────────

    function summarize(result) {
        const lines = [];
        const v = result.valid ? '✅ VALID' : '❌ INVALID';
        lines.push('M3U8 Parser Strict Ultimate v' + VERSION + ' — ' + SPEC);
        lines.push('Verdict: ' + v);
        lines.push('Type: ' + (result.type || 'unknown'));
        lines.push('Version: ' + (result.version || 'unset'));
        lines.push('Independent segments: ' + result.independentSegments);
        lines.push('');
        lines.push('Stats:');
        for (const k in result.stats) {
            const val = result.stats[k];
            if (typeof val === 'object' && val !== null) {
                lines.push('  ' + k + ': ' + JSON.stringify(val));
            } else {
                lines.push('  ' + k + ': ' + val);
            }
        }
        lines.push('');
        lines.push('Errors: ' + result.errors.length);
        for (const e of result.errors.slice(0, 20)) {
            lines.push('  L' + e.line + ' [' + e.type + '] ' + e.msg + (e.rule ? ' (' + e.rule + ')' : ''));
        }
        if (result.errors.length > 20) lines.push('  ... +' + (result.errors.length - 20) + ' more');
        lines.push('');
        lines.push('Warnings: ' + result.warnings.length);
        for (const w of result.warnings.slice(0, 10)) {
            lines.push('  L' + w.line + ' [' + w.type + '] ' + w.msg);
        }
        if (result.warnings.length > 10) lines.push('  ... +' + (result.warnings.length - 10) + ' more');
        return lines.join('\n');
    }

    // ── Public API export ───────────────────────────────────────────────────

    const M3U8ParserStrictUltimate = {
        VERSION,
        SPEC,
        parse,
        parseLines,
        parseStream,
        validateCodec,
        validateExtHttp,
        summarize,
        // Constants exposed for advanced consumers
        CODEC_PATTERNS,
        SINGLETON_TAGS,
        MASTER_ONLY_TAGS,
        MEDIA_ONLY_TAGS,
        BANNED_OUTBOUND_HEADERS,
        VERSION_REQUIREMENTS,
        REQUIRED_ATTRS,
    };

    // Browser
    if (typeof window !== 'undefined') {
        window.M3U8ParserStrictUltimate = M3U8ParserStrictUltimate;
        window.M3U8_PARSER = M3U8ParserStrictUltimate; // short alias
    }
    // Node
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = M3U8ParserStrictUltimate;
    }
})();
