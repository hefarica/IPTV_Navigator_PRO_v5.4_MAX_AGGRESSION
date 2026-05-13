/**
 * APE HLS ATTRIBUTE PARSER — KEY=VALUE,KEY2="QUOTED, COMMAS",KEY3=123
 * Compatible with the internal parseAttrList in M3U8ParserStrictUltimate.
 * Handles quoted commas, booleans, hex, integers, decimals, URIs, lists.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    // RFC 8216 attribute-list grammar — quoted strings vs unquoted tokens
    const RE_ATTR = /([A-Z0-9][A-Z0-9-]*)\s*=\s*("(?:[^"\\]|\\.)*"|[^,]+)/g;

    function coerceValue(rawVal) {
        if (rawVal == null) return rawVal;
        let v = String(rawVal).trim();
        if (v.length === 0) return v;

        // Quoted string → unwrap + unescape
        if (v.length >= 2 && v.charCodeAt(0) === 34 && v.charCodeAt(v.length - 1) === 34) {
            return v.slice(1, -1).replace(/\\(.)/g, '$1');
        }

        const up = v.toUpperCase();
        if (up === 'YES') return true;
        if (up === 'NO') return false;

        // Hex (0x...)
        if (/^0x[0-9A-F]+$/i.test(v)) {
            const n = parseInt(v, 16);
            return Number.isFinite(n) ? n : v;
        }

        // Resolution NxM
        if (/^\d+x\d+$/i.test(v)) return v;

        // Decimal / integer
        if (/^-?\d+(\.\d+)?$/.test(v)) {
            const n = Number(v);
            return Number.isFinite(n) ? n : v;
        }

        return v;
    }

    /**
     * Parse an HLS attribute list.
     * @param {string} s - Body of an HLS tag (after the colon)
     * @returns {{ attrs: Object, raw: string, warnings: string[], errors: string[] }}
     */
    function parseAttrList(s) {
        const out = { attrs: {}, raw: String(s || ''), warnings: [], errors: [] };
        if (!s) return out;

        const seen = Object.create(null);
        RE_ATTR.lastIndex = 0;
        let m;
        while ((m = RE_ATTR.exec(s)) !== null) {
            const key = m[1];
            const rawVal = m[2];
            const value = coerceValue(rawVal);
            if (seen[key]) out.warnings.push('duplicate attribute: ' + key);
            seen[key] = true;
            out.attrs[key] = value;
        }

        if (Object.keys(out.attrs).length === 0 && s.trim().length > 0) {
            out.warnings.push('no attributes parsed from non-empty body');
        }

        return out;
    }

    /**
     * Parse a full HLS tag line: "#EXT-X-STREAM-INF:BANDWIDTH=...,CODECS=..."
     * @param {string} line
     * @returns {{ tag: string, attrs: Object, raw: string, warnings: string[], errors: string[] }}
     */
    function parseTagLine(line) {
        const raw = String(line || '').trim();
        const colonIdx = raw.indexOf(':');
        if (colonIdx === -1 || !raw.startsWith('#')) {
            return { tag: raw, attrs: {}, raw: raw, warnings: ['no body or not a tag'], errors: [] };
        }
        const tag = raw.substring(0, colonIdx);
        const body = raw.substring(colonIdx + 1);
        const parsed = parseAttrList(body);
        return { tag: tag, attrs: parsed.attrs, raw: raw, warnings: parsed.warnings, errors: parsed.errors };
    }

    const APEHlsAttributeParser = {
        parseAttrList: parseAttrList,
        parseTagLine: parseTagLine,
        coerceValue: coerceValue
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEHlsAttributeParser;
    } else {
        global.APEHlsAttributeParser = APEHlsAttributeParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
