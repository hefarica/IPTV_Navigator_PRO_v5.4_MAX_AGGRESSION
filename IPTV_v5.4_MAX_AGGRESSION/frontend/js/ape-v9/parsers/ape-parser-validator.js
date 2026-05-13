/**
 * APE PARSER VALIDATOR — Validates a canonical APE object against doctrine.
 *
 * Cross-field rules:
 *   - container=FMP4_CMAF only if evidence != null (EXT-X-MAP + .m4s/init.mp4)
 *   - HDR verified only if video.videoRange ∈ {PQ, HLG} OR DV evidence
 *   - CODECS non-empty if master hls.type == 'master' and streams present
 *   - No toxic headers in headers.values
 *   - Accept-Encoding=identity when headers.values has any entries
 *   - URL is valid (parseable)
 *   - No If-None-Match, no Range, no If-Modified-Since
 *
 * Returns: { valid: boolean, errors: [], warnings: [] }
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const TOXIC_HEADER_RE = /^(range|if-none-match|if-modified-since|te|priority|upgrade-insecure-requests)$/i;

    function validateUrl(url) {
        if (!url) return { ok: false, reason: 'empty url' };
        try { new URL(url); return { ok: true }; }
        catch (e) { return { ok: false, reason: 'malformed url' }; }
    }

    function validate(canonical) {
        const errors = [];
        const warnings = [];
        if (!canonical || typeof canonical !== 'object') {
            return { valid: false, errors: ['canonical object missing'], warnings: [] };
        }

        // ─── Channel
        if (!canonical.channel || !canonical.channel.url) {
            warnings.push('channel.url missing');
        } else {
            const u = validateUrl(canonical.channel.url);
            if (!u.ok) errors.push('channel.url ' + u.reason);
        }

        // ─── Container — verified only with evidence
        if (canonical.container && canonical.container.type === 'FMP4_CMAF' && !canonical.container.evidence) {
            errors.push('container=FMP4_CMAF without evidence (EXT-X-MAP + .m4s/init.mp4)');
        }
        if (canonical.container && canonical.container.verified && !canonical.container.evidence) {
            errors.push('container verified=true but no evidence');
        }

        // ─── HDR — only with evidence
        if (canonical.video && canonical.video.hdr && canonical.video.hdr !== 'SDR_OR_UNKNOWN' && canonical.video.hdr !== 'SDR') {
            const range = canonical.video.videoRange;
            const family = canonical.video.codecFamily;
            const isDV = family === 'DOLBY_VISION' || (canonical.video.hdr || '').indexOf('DOLBY_VISION') === 0;
            const isHdr10orHlg = range === 'PQ' || range === 'HLG';
            if (!isDV && !isHdr10orHlg) {
                errors.push('HDR=' + canonical.video.hdr + ' without VIDEO-RANGE or DV codec evidence');
            }
        }

        // ─── CODECS — non-empty for master
        if (canonical.hls && canonical.hls.type === 'master' && !canonical.video.codec) {
            warnings.push('master playlist without CODECS attribute on STREAM-INF');
        }

        // ─── Headers — zero toxic
        if (canonical.headers && canonical.headers.values) {
            const keys = Object.keys(canonical.headers.values);
            for (let i = 0; i < keys.length; i++) {
                if (TOXIC_HEADER_RE.test(keys[i])) {
                    errors.push('TOXIC_HEADER present: ' + keys[i] + ' (CA7/C8 violation)');
                }
            }
            // Accept-Encoding must be identity if present
            const aeKey = keys.find(function (k) { return k.toLowerCase() === 'accept-encoding'; });
            if (aeKey && String(canonical.headers.values[aeKey]).toLowerCase() !== 'identity') {
                errors.push('Accept-Encoding must be "identity", found: ' + canonical.headers.values[aeKey]);
            }
            // If we have header entries but the audit flag says sanitized=false → warn
            if (canonical.headers.sanitized === false && keys.length > 0) {
                warnings.push('headers.sanitized=false but headers present');
            }
        }

        // ─── 304 cache trap
        if (canonical.probe && canonical.probe.errorClass === 'CACHE_TRAP_304_EMPTY_BODY') {
            errors.push('reachability detected CACHE_TRAP_304_EMPTY_BODY — toxic header upstream');
        }

        return { valid: errors.length === 0, errors: errors, warnings: warnings };
    }

    const APEParserValidator = { validate: validate };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEParserValidator;
    } else {
        global.APEParserValidator = APEParserValidator;
    }

})(typeof window !== 'undefined' ? window : globalThis);
