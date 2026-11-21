/**
 * APE HLS MASTER PARSER — Extracts variants, alternate media,
 * I-frame variants, SESSION-DATA, SESSION-KEY, DEFINE from master playlist.
 *
 * Delegates raw line walk to APEHlsAttributeParser + APEM3ULexer (when loaded).
 * Falls back to inline minimal scanner when running in Node test contexts.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    function parseAttrList(body) {
        if (global.APEHlsAttributeParser && typeof global.APEHlsAttributeParser.parseAttrList === 'function') {
            return global.APEHlsAttributeParser.parseAttrList(body).attrs;
        }
        const attrs = {};
        const re = /([A-Z0-9][A-Z0-9-]*)\s*=\s*("(?:[^"\\]|\\.)*"|[^,]+)/g;
        let m;
        while ((m = re.exec(body)) !== null) {
            let v = m[2];
            if (v && v.charCodeAt(0) === 34) v = v.slice(1, -1);
            attrs[m[1]] = v;
        }
        return attrs;
    }

    function resolveUri(uri, base) {
        if (!uri) return null;
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) return uri;
        if (!base) return uri;
        try { return new URL(uri, base).toString(); } catch (e) { return uri; }
    }

    /**
     * @param {string} text - Master playlist text
     * @param {Object} [opts]
     * @param {string} [opts.baseUrl] - Used to resolve relative variant URIs
     * @returns {Object}
     */
    function parseMaster(text, opts) {
        opts = opts || {};
        const baseUrl = opts.baseUrl || null;

        const out = {
            type:                'master',
            version:             null,
            independentSegments: false,
            start:               null,
            streamInfs:          [],
            iFrameStreamInfs:    [],
            media:               [],
            sessionData:         [],
            sessionKey:          [],
            defines:             [],
            errors:              [],
            warnings:            []
        };

        if (text == null) { out.errors.push('null input'); return out; }
        if (text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = String(text).split(/\r?\n/);

        let pendingStreamInf = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith('#EXT-X-VERSION:')) {
                out.version = parseInt(line.substring(15), 10) || null;
                continue;
            }
            if (line.startsWith('#EXT-X-INDEPENDENT-SEGMENTS')) { out.independentSegments = true; continue; }
            if (line.startsWith('#EXT-X-START:'))   { out.start = parseAttrList(line.substring(13)); continue; }
            if (line.startsWith('#EXT-X-DEFINE:'))  { out.defines.push(parseAttrList(line.substring(14))); continue; }

            if (line.startsWith('#EXT-X-STREAM-INF:')) {
                pendingStreamInf = parseAttrList(line.substring(18));
                continue;
            }
            if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')) {
                const a = parseAttrList(line.substring(26));
                if (a.URI) a._uriAbs = resolveUri(a.URI, baseUrl);
                out.iFrameStreamInfs.push(a);
                continue;
            }
            if (line.startsWith('#EXT-X-MEDIA:')) {
                out.media.push(parseAttrList(line.substring(13)));
                continue;
            }
            if (line.startsWith('#EXT-X-SESSION-DATA:')) {
                out.sessionData.push(parseAttrList(line.substring(20)));
                continue;
            }
            if (line.startsWith('#EXT-X-SESSION-KEY:')) {
                out.sessionKey.push(parseAttrList(line.substring(19)));
                continue;
            }
            if (line.startsWith('#')) continue;

            if (pendingStreamInf) {
                pendingStreamInf.URI    = line;
                pendingStreamInf._uriAbs = resolveUri(line, baseUrl);
                if (typeof pendingStreamInf.BANDWIDTH === 'string') {
                    pendingStreamInf.BANDWIDTH = parseInt(pendingStreamInf.BANDWIDTH, 10) || pendingStreamInf.BANDWIDTH;
                }
                if (typeof pendingStreamInf['AVERAGE-BANDWIDTH'] === 'string') {
                    pendingStreamInf['AVERAGE-BANDWIDTH'] = parseInt(pendingStreamInf['AVERAGE-BANDWIDTH'], 10) || pendingStreamInf['AVERAGE-BANDWIDTH'];
                }
                if (typeof pendingStreamInf['FRAME-RATE'] === 'string') {
                    pendingStreamInf['FRAME-RATE'] = parseFloat(pendingStreamInf['FRAME-RATE']) || pendingStreamInf['FRAME-RATE'];
                }
                out.streamInfs.push(pendingStreamInf);
                pendingStreamInf = null;
            }
        }

        if (pendingStreamInf) out.warnings.push('STREAM-INF without URI line');

        // Quick required-attr validation per RFC 8216
        out.streamInfs.forEach(function (s, ix) {
            if (!s.BANDWIDTH) out.errors.push('STREAM-INF #' + ix + ' missing BANDWIDTH');
        });
        out.media.forEach(function (m, ix) {
            if (!m.TYPE || !m['GROUP-ID'] || !m.NAME) {
                out.errors.push('MEDIA #' + ix + ' missing TYPE/GROUP-ID/NAME');
            }
        });

        return out;
    }

    const APEHlsMasterParser = { parseMaster: parseMaster };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEHlsMasterParser;
    } else {
        global.APEHlsMasterParser = APEHlsMasterParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
