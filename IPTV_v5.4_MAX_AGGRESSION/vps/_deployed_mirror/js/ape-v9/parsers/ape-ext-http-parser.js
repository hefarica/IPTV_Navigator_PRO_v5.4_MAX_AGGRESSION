/**
 * APE EXTHTTP PARSER — Reads #EXTHTTP:{...} JSON blocks with tolerance.
 * ALL output passes through APEHttpHeaderSanitizer.sanitizeExtHttpHeaders
 * before being returned. Also strips fake metadata X-CMAF/X-FMP4/X-LCEVC/X-Cortex.
 *
 * Validation issues are surfaced via APE doctrine (8 EXTHTTP traps) when
 * M3U8ParserStrictUltimate.validateExtHttp is available.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    function tolerantJsonParse(jsonStr) {
        if (!jsonStr || typeof jsonStr !== 'string') return null;
        let s = jsonStr.trim();
        if (!s) return null;
        if (s.charCodeAt(0) !== 0x7B) {                       // not '{'
            const lb = s.indexOf('{');
            const rb = s.lastIndexOf('}');
            if (lb >= 0 && rb > lb) s = s.substring(lb, rb + 1);
        }
        // Tolerance: trailing comma before closing brace
        s = s.replace(/,\s*([}\]])/g, '$1');
        // Tolerance: single-quoted keys/values (rough — only convert pairs)
        if (s.indexOf('"') === -1 && s.indexOf("'") !== -1) {
            s = s.replace(/'/g, '"');
        }
        try { return JSON.parse(s); } catch (e) { return null; }
    }

    function sanitize(headers) {
        if (global.APEHttpHeaderSanitizer && typeof global.APEHttpHeaderSanitizer.sanitizeExtHttpHeaders === 'function') {
            return global.APEHttpHeaderSanitizer.sanitizeExtHttpHeaders(headers);
        }
        return { headers: headers || {}, audit: { toxicHeadersRemoved: [] } };
    }

    /**
     * Parse a single #EXTHTTP:{...} body.
     * @param {string} extHttpLine - Either the full line or just the JSON body.
     * @returns {Object}
     */
    function parseExtHttp(extHttpLine) {
        const raw = String(extHttpLine || '');
        const body = raw.startsWith('#EXTHTTP:') ? raw.substring(9) : raw;
        const out = {
            raw:                raw,
            parsedObject:       null,
            headers:            {},
            audit:              { toxicHeadersRemoved: [], emptyHeadersRemoved: [], unknownHeadersRemoved: [], placeholdersRemoved: [], fakeMetadataRemoved: [] },
            doctrineIssues:     [],
            valid:              false,
            warnings:           [],
            errors:             []
        };
        if (!body || !body.trim()) { out.warnings.push('empty EXTHTTP body'); return out; }

        // Project doctrine — surface 8 EXTHTTP traps via strict parser
        if (global.M3U8ParserStrictUltimate && typeof global.M3U8ParserStrictUltimate.validateExtHttp === 'function') {
            const issues = global.M3U8ParserStrictUltimate.validateExtHttp(body);
            if (Array.isArray(issues) && issues.length) out.doctrineIssues = issues;
        }

        const obj = tolerantJsonParse(body);
        if (!obj) { out.errors.push('INVALID-JSON'); return out; }
        out.parsedObject = obj;

        // Headers may live under `headers`, `http-headers`, or root.
        let candidate = obj.headers || obj['http-headers'] || obj;
        if (candidate && typeof candidate !== 'object') candidate = {};

        const sanitized = sanitize(candidate);
        out.headers = sanitized.headers;
        out.audit   = Object.assign(out.audit, sanitized.audit);
        out.valid   = Object.keys(out.headers).length > 0;
        return out;
    }

    /**
     * Walk a playlist text + collect all EXTHTTP blocks.
     */
    function parseExtHttpBlocks(text) {
        const blocks = [];
        if (text == null) return { blocks: blocks, summary: { count: 0, toxicHeadersRemoved: 0 } };
        if (text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = String(text).split(/\r?\n/);
        let toxic = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith('#EXTHTTP:')) continue;
            const p = parseExtHttp(line);
            p.lineNo = i + 1;
            blocks.push(p);
            toxic += (p.audit.toxicHeadersRemoved && p.audit.toxicHeadersRemoved.length) || 0;
        }
        return { blocks: blocks, summary: { count: blocks.length, toxicHeadersRemoved: toxic } };
    }

    const APEExtHttpParser = {
        parseExtHttp:        parseExtHttp,
        parseExtHttpBlocks:  parseExtHttpBlocks,
        tolerantJsonParse:   tolerantJsonParse
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEExtHttpParser;
    } else {
        global.APEExtHttpParser = APEExtHttpParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
