/**
 * APE UNIVERSAL PARSER STACK — Orchestrator.
 *
 * Imports and routes calls to all 25 sibling parser modules + the
 * existing APEHttpHeaderSanitizer. Produces a canonical APE object
 * that the Fallback Resolver and m3u8-typed-arrays-ultimate.js can
 * consume directly.
 *
 * Public:
 *   parseAny(input)
 *   parseFlatM3U(text)
 *   parseHlsMaster(text, baseUrl)
 *   parseHlsMedia(text)
 *   parseChannelBlock(channel, fragments)
 *   parseCodecString(codecsStr)
 *   parseHevcCodec(codec)
 *   parseDolbyHdr(streamInfAttrs)
 *   parseExtHttp(line)
 *   parseVlcOpt(line)
 *   parseKodiProp(line)
 *   parseXtreamUrl(url)
 *   sanitizeExtHttpHeaders(headers)
 *   normalizeToApeCanonical(parts)
 *   validateCanonical(canonical)
 *   getParserAuditSummary()
 *   resetParserAuditSummary()
 *
 * Doctrina:
 *   MAX IMAGE FIRST · COVERAGE ALWAYS · NO CHANNEL LOSS
 *   ZERO TOXIC HEADERS · NO OKHTTP EOF · OMEGA-NO-DELETE
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    function g(name) { return global[name] || null; }

    // ─── AUDIT COUNTERS ─────────────────────────────────────────────────────
    const audit = makeAuditSummary();

    function makeAuditSummary() {
        return {
            totalLines: 0, totalChannels: 0, parsedChannels: 0,
            brokenBlocks: 0, missingUrls: 0,
            hlsMasters: 0, hlsMediaPlaylists: 0,
            fmp4CmafDetected: 0, mpegTsDetected: 0,
            hevcDetected: 0, main10Detected: 0, main12Detected: 0,
            dolbyVisionDetected: 0, hdrDetected: 0,
            audioOnly: 0, drmDetected: 0,
            extHttpBlocks: 0, vlcOptBlocks: 0, kodiPropBlocks: 0,
            toxicHeadersRemoved: 0, ifNoneMatchRemoved: 0, rangeRemoved: 0,
            ifModifiedSinceRemoved: 0, teRemoved: 0, priorityRemoved: 0,
            upgradeInsecureRequestsRemoved: 0,
            cacheTrap304Detected: 0,
            parserWarnings: 0, parserErrors: 0,
            channelsRemoved: 0
        };
    }

    function resetParserAuditSummary() {
        const fresh = makeAuditSummary();
        Object.keys(fresh).forEach(function (k) { audit[k] = fresh[k]; });
        return audit;
    }

    function getParserAuditSummary() {
        return Object.assign({}, audit);
    }

    function countToxic(audit_obj) {
        if (!audit_obj || !audit_obj.toxicHeadersRemoved) return 0;
        const arr = audit_obj.toxicHeadersRemoved;
        for (let i = 0; i < arr.length; i++) {
            const lk = String(arr[i]).toLowerCase();
            if (lk === 'if-none-match')             audit.ifNoneMatchRemoved++;
            else if (lk === 'range')                audit.rangeRemoved++;
            else if (lk === 'if-modified-since')    audit.ifModifiedSinceRemoved++;
            else if (lk === 'te')                   audit.teRemoved++;
            else if (lk === 'priority')             audit.priorityRemoved++;
            else if (lk === 'upgrade-insecure-requests') audit.upgradeInsecureRequestsRemoved++;
        }
        return arr.length;
    }

    // ─── SHALLOW DETECTORS ──────────────────────────────────────────────────

    function detectType(text) {
        const t = String(text || '');
        if (!t.trim().toUpperCase().startsWith('#EXTM3U')) return 'unknown';
        if (t.indexOf('#EXT-X-STREAM-INF') !== -1)         return 'hls_master';
        if (t.indexOf('#EXT-X-TARGETDURATION') !== -1)     return 'hls_media';
        return 'flat_m3u';
    }

    // ─── DELEGATED PUBLIC API ───────────────────────────────────────────────

    function sanitizeExtHttpHeaders(headers) {
        const s = g('APEHttpHeaderSanitizer');
        if (!s || typeof s.sanitizeExtHttpHeaders !== 'function') {
            return { headers: headers || {}, audit: {} };
        }
        const r = s.sanitizeExtHttpHeaders(headers);
        countToxic(r.audit);
        audit.toxicHeadersRemoved += (r.audit && r.audit.toxicHeadersRemoved && r.audit.toxicHeadersRemoved.length) || 0;
        return r;
    }

    function parseCodecString(codecsStr) {
        const p = g('APECodecParser');
        return p ? p.parseCodecString(codecsStr) : { raw: codecsStr, videoCodec: null, audioCodec: null };
    }

    function parseHevcCodec(codec) {
        const p = g('APEHevcParser');
        const r = p ? p.parseHevcCodec(codec) : { valid: false };
        if (r.valid) {
            audit.hevcDetected++;
            if (r.codecFamily === 'HEVC_MAIN_10') audit.main10Detected++;
            if (r.codecFamily === 'HEVC_MAIN_12') audit.main12Detected++;
        }
        return r;
    }

    function parseDolbyHdr(streamInfAttrs) {
        const p = g('APEDolbyHdrParser');
        const r = p ? p.parseStreamInf(streamInfAttrs) : { hdrVerified: false };
        if (r.hdrVerified) audit.hdrDetected++;
        if (r.isDolbyVision) audit.dolbyVisionDetected++;
        return r;
    }

    function parseExtHttp(line) {
        const p = g('APEExtHttpParser');
        const r = p ? p.parseExtHttp(line) : { headers: {}, audit: {} };
        audit.extHttpBlocks++;
        countToxic(r.audit);
        audit.toxicHeadersRemoved += (r.audit && r.audit.toxicHeadersRemoved && r.audit.toxicHeadersRemoved.length) || 0;
        return r;
    }

    function parseVlcOpt(line) {
        const p = g('APEVlcOptParser');
        audit.vlcOptBlocks++;
        if (!p) return null;
        const r = p.parseVlcOpt(line);
        if (r && r.blocked && r.reason === 'CA7_C8_TOXIC_HEADER_BLOCKED') {
            audit.toxicHeadersRemoved++;
            if (r.headerKey) {
                const lk = String(r.headerKey).toLowerCase();
                if (lk === 'if-none-match')             audit.ifNoneMatchRemoved++;
                else if (lk === 'range')                audit.rangeRemoved++;
                else if (lk === 'if-modified-since')    audit.ifModifiedSinceRemoved++;
                else if (lk === 'te')                   audit.teRemoved++;
                else if (lk === 'priority')             audit.priorityRemoved++;
                else if (lk === 'upgrade-insecure-requests') audit.upgradeInsecureRequestsRemoved++;
            }
        }
        return r;
    }

    function parseKodiProp(line) {
        const p = g('APEKodiPropParser');
        audit.kodiPropBlocks++;
        if (!p) return null;
        const r = p.parseKodiProp(line);
        if (r && Array.isArray(r.toxicHeadersRemoved) && r.toxicHeadersRemoved.length > 0) {
            audit.toxicHeadersRemoved += r.toxicHeadersRemoved.length;
            for (let i = 0; i < r.toxicHeadersRemoved.length; i++) {
                const lk = String(r.toxicHeadersRemoved[i]).toLowerCase();
                if      (lk === 'if-none-match')             audit.ifNoneMatchRemoved++;
                else if (lk === 'range')                     audit.rangeRemoved++;
                else if (lk === 'if-modified-since')         audit.ifModifiedSinceRemoved++;
                else if (lk === 'te')                        audit.teRemoved++;
                else if (lk === 'priority')                  audit.priorityRemoved++;
                else if (lk === 'upgrade-insecure-requests') audit.upgradeInsecureRequestsRemoved++;
            }
        }
        return r;
    }

    function parseXtreamUrl(url) {
        const p = g('APEXtreamParser');
        return p ? p.parseXtreamUrl(url) : null;
    }

    function parseFlatM3U(text) {
        const p = g('APEIptvFlatParser');
        const r = p ? p.parseFlat(text) : { channels: [], stats: {} };
        if (r && r.stats) {
            audit.totalLines += r.stats.totalLines || 0;
            audit.totalChannels += r.stats.totalChannels || 0;
            audit.parsedChannels += (r.channels || []).length;
        }
        return r;
    }

    function parseHlsMaster(text, baseUrl) {
        const p = g('APEHlsMasterParser');
        const r = p ? p.parseMaster(text, { baseUrl: baseUrl }) : null;
        audit.hlsMasters++;
        if (r && r.errors)   audit.parserErrors   += r.errors.length;
        if (r && r.warnings) audit.parserWarnings += r.warnings.length;
        return r;
    }

    function parseHlsMedia(text) {
        const p = g('APEHlsMediaParser');
        const r = p ? p.parseMedia(text) : null;
        audit.hlsMediaPlaylists++;
        if (r && r.container) {
            if (r.container.type === 'FMP4_CMAF') audit.fmp4CmafDetected++;
            if (r.container.type === 'MPEG_TS')   audit.mpegTsDetected++;
            if (r.container.type === 'AUDIO_ONLY') audit.audioOnly++;
        }
        if (r && r.errors)   audit.parserErrors   += r.errors.length;
        if (r && r.warnings) audit.parserWarnings += r.warnings.length;
        return r;
    }

    function normalizeToApeCanonical(parts) {
        const p = g('APEParserNormalizer');
        return p ? p.normalize(parts) : null;
    }

    function validateCanonical(canonical) {
        const p = g('APEParserValidator');
        const r = p ? p.validate(canonical) : { valid: true, errors: [], warnings: [] };
        if (r) {
            audit.parserErrors   += (r.errors   || []).length;
            audit.parserWarnings += (r.warnings || []).length;
        }
        return r;
    }

    // ─── HIGH-LEVEL ROUTER ──────────────────────────────────────────────────

    function parseChannelBlock(channel, fragments) {
        fragments = fragments || {};
        const codecP = channel && channel.codecs ? parseCodecString(channel.codecs) : null;
        const hevcP  = codecP && codecP.videoCodec && /^h(ev|vc)/i.test(codecP.videoCodec)
                       ? parseHevcCodec(codecP.videoCodec) : null;
        const hdrP   = fragments.streamInfAttrs ? parseDolbyHdr(fragments.streamInfAttrs) : null;
        const drmP   = fragments.drm  || null;
        const audP   = fragments.audio || null;
        const subP   = fragments.subs || null;
        const llP    = fragments.llHls || null;
        const extP   = fragments.extHttp || null;
        const cusP   = fragments.custom  || null;
        const reachP = fragments.reachability || null;

        const canonical = normalizeToApeCanonical({
            channel:      channel,
            master:       fragments.master,
            media:        fragments.media,
            codec:        codecP,
            hevc:         hevcP,
            hdr:          hdrP,
            audio:        audP,
            subs:         subP,
            drm:          drmP,
            extHttp:      extP,
            llHls:        llP,
            custom:       cusP,
            reachability: reachP,
            headers:      fragments.headers || null
        });

        const verdict = validateCanonical(canonical);
        canonical.ape.warnings = canonical.ape.warnings.concat(verdict.warnings || []);
        canonical.ape.errors   = canonical.ape.errors.concat(verdict.errors   || []);

        if (canonical.probe && canonical.probe.errorClass === 'CACHE_TRAP_304_EMPTY_BODY') {
            audit.cacheTrap304Detected++;
        }
        if (canonical.drm && canonical.drm.encrypted) audit.drmDetected++;

        return canonical;
    }

    /**
     * Auto-detect input type and return either a list of canonical objects
     * (flat M3U) or a single canonical (HLS master/media).
     */
    function parseAny(input, opts) {
        opts = opts || {};
        const baseUrl = opts.baseUrl || null;

        if (input == null) return { type: 'unknown', canonical: [], audit: getParserAuditSummary() };

        const text = String(input);
        const t = detectType(text);

        if (t === 'flat_m3u') {
            const flat = parseFlatM3U(text);
            const out = [];
            for (let i = 0; i < (flat.channels || []).length; i++) {
                out.push(parseChannelBlock(flat.channels[i], {
                    headers: null,
                    extHttp: null,
                    custom:  null
                }));
            }
            return { type: 'flat_m3u', canonical: out, audit: getParserAuditSummary() };
        }

        if (t === 'hls_master') {
            const master = parseHlsMaster(text, baseUrl);
            const can = parseChannelBlock({ url: baseUrl || null }, {
                master: master,
                headers: null
            });
            return { type: 'hls_master', canonical: can, master: master, audit: getParserAuditSummary() };
        }

        if (t === 'hls_media') {
            const media = parseHlsMedia(text);
            const llhls = g('APELLHlsParser') ? g('APELLHlsParser').parseLLHls(text) : null;
            const dates = g('APEDateRangeScte35Parser') ? g('APEDateRangeScte35Parser').parseDateRanges(text) : null;
            const can = parseChannelBlock({ url: baseUrl || null }, {
                media:    media,
                llHls:    llhls,
                custom:   g('APECustomTagsParser') ? g('APECustomTagsParser').parseCustomTags(text) : null
            });
            return { type: 'hls_media', canonical: can, media: media, llhls: llhls, dateranges: dates, audit: getParserAuditSummary() };
        }

        return { type: 'unknown', canonical: null, audit: getParserAuditSummary() };
    }

    // ─── EXPORT ─────────────────────────────────────────────────────────────

    const APEUniversalParserStack = {
        version: '1.0.0',

        // High-level
        parseAny:                parseAny,
        parseFlatM3U:            parseFlatM3U,
        parseHlsMaster:          parseHlsMaster,
        parseHlsMedia:           parseHlsMedia,
        parseChannelBlock:       parseChannelBlock,

        // Per-aspect
        parseCodecString:        parseCodecString,
        parseHevcCodec:          parseHevcCodec,
        parseDolbyHdr:           parseDolbyHdr,
        parseExtHttp:            parseExtHttp,
        parseVlcOpt:             parseVlcOpt,
        parseKodiProp:           parseKodiProp,
        parseXtreamUrl:          parseXtreamUrl,

        // Sanitizer
        sanitizeExtHttpHeaders:  sanitizeExtHttpHeaders,

        // Schema
        normalizeToApeCanonical: normalizeToApeCanonical,
        validateCanonical:       validateCanonical,

        // Audit
        getParserAuditSummary:   getParserAuditSummary,
        resetParserAuditSummary: resetParserAuditSummary
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEUniversalParserStack;
    } else {
        global.APEUniversalParserStack = APEUniversalParserStack;
    }

})(typeof window !== 'undefined' ? window : globalThis);
