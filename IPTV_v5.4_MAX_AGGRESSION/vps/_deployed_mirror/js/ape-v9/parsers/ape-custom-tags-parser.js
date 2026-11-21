/**
 * APE CUSTOM TAGS PARSER — Reads ape-* attributes from EXTINF + #EXT-X-APE-*
 * tags. Counterpart to the WRITE-side emitter in m3u8-typed-arrays-ultimate.js.
 *
 * Recognized APE attributes (extracted from EXTINF):
 *   ape-profile, ape-container, ape-container-verified, ape-codec-real,
 *   ape-codec-preferred, ape-codec-family, ape-bit-depth, ape-hdr,
 *   ape-resolution, ape-framerate, ape-bandwidth, ape-average-bandwidth,
 *   ape-quality-score, ape-fallback-tier, ape-confidence,
 *   ape-probe-timestamp, ape-compression, ape-denoise, ape-player-scope,
 *   ape-header-sanitized, ape-header-sanitized-reason.
 *
 * Recognized #EXT-X-APE-* tags (anything starting with #EXT-X-APE-).
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const APE_ATTR_KEYS = new Set([
        'ape-profile', 'ape-container', 'ape-container-verified',
        'ape-codec-real', 'ape-codec-preferred', 'ape-codec-family',
        'ape-bit-depth', 'ape-hdr', 'ape-resolution', 'ape-framerate',
        'ape-bandwidth', 'ape-average-bandwidth', 'ape-quality-score',
        'ape-fallback-tier', 'ape-confidence', 'ape-probe-timestamp',
        'ape-compression', 'ape-denoise', 'ape-player-scope',
        'ape-header-sanitized', 'ape-header-sanitized-reason'
    ]);

    const RE_ATTR = /([\w-]+)="([^"]*)"/g;

    function parseApeAttrs(extinfLine) {
        const out = {};
        const seen = {};
        RE_ATTR.lastIndex = 0;
        let m;
        while ((m = RE_ATTR.exec(String(extinfLine || ''))) !== null) {
            const k = m[1].toLowerCase();
            if (!k.startsWith('ape-')) continue;
            if (seen[k]) continue;
            seen[k] = true;
            out[k] = m[2];
        }
        return out;
    }

    function coerceTagBody(body) {
        const v = String(body || '').trim();
        if (!v) return null;
        if (v.toUpperCase() === 'TRUE')  return true;
        if (v.toUpperCase() === 'FALSE') return false;
        if (/^-?\d+(\.\d+)?$/.test(v))  return Number(v);
        return v;
    }

    /**
     * Walk text + collect ape-* attrs from EXTINF and #EXT-X-APE-* tags.
     * @param {string} text
     * @returns {Object}
     */
    function parseCustomTags(text) {
        const out = {
            channelTags: [],         // { lineNo, attrs }
            globalTags:  {},         // { TAG: value }
            count: { extinfWithApeAttrs: 0, extXApeTags: 0 },
            warnings: []
        };

        if (text == null) return out;
        if (text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = String(text).split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith('#EXTINF') && line.indexOf('ape-') !== -1) {
                const a = parseApeAttrs(line);
                if (Object.keys(a).length) {
                    out.channelTags.push({ lineNo: i + 1, attrs: a });
                    out.count.extinfWithApeAttrs++;
                }
                continue;
            }

            if (line.indexOf('#EXT-X-APE-') === 0) {
                const colonIdx = line.indexOf(':');
                const tagName  = colonIdx === -1 ? line : line.substring(0, colonIdx);
                const body     = colonIdx === -1 ? null : line.substring(colonIdx + 1);
                out.globalTags[tagName] = coerceTagBody(body);
                out.count.extXApeTags++;
            }
        }
        return out;
    }

    const APECustomTagsParser = {
        parseCustomTags: parseCustomTags,
        parseApeAttrs:   parseApeAttrs,
        APE_ATTR_KEYS:   APE_ATTR_KEYS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APECustomTagsParser;
    } else {
        global.APECustomTagsParser = APECustomTagsParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
