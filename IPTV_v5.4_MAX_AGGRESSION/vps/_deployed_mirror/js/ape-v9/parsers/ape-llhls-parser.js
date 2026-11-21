/**
 * APE LL-HLS PARSER — Preserve-only. Reads LL-HLS tags from a media playlist.
 * Never injects LL-HLS where the upstream doesn't provide it.
 *
 * Tags: EXT-X-SERVER-CONTROL, EXT-X-PART-INF, EXT-X-PART, EXT-X-PRELOAD-HINT,
 *       EXT-X-RENDITION-REPORT, EXT-X-SKIP.
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

    /**
     * Parse LL-HLS tags from a media playlist text.
     * @param {string} text
     * @returns {Object}
     */
    function parseLLHls(text) {
        const out = {
            detected:         false,
            serverControl:    null,
            partInf:          null,
            parts:            [],
            preloadHints:     [],
            renditionReports: [],
            skip:             null
        };

        if (text == null) return out;
        if (text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = String(text).split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            if (line.startsWith('#EXT-X-SERVER-CONTROL:')) {
                out.serverControl = parseAttrList(line.substring(22));
                out.detected = true;
                continue;
            }
            if (line.startsWith('#EXT-X-PART-INF:')) {
                out.partInf = parseAttrList(line.substring(16));
                out.detected = true;
                continue;
            }
            if (line.startsWith('#EXT-X-PART:')) {
                out.parts.push(parseAttrList(line.substring(12)));
                out.detected = true;
                continue;
            }
            if (line.startsWith('#EXT-X-PRELOAD-HINT:')) {
                out.preloadHints.push(parseAttrList(line.substring(20)));
                out.detected = true;
                continue;
            }
            if (line.startsWith('#EXT-X-RENDITION-REPORT:')) {
                out.renditionReports.push(parseAttrList(line.substring(24)));
                out.detected = true;
                continue;
            }
            if (line.startsWith('#EXT-X-SKIP:')) {
                out.skip = parseAttrList(line.substring(12));
                out.detected = true;
                continue;
            }
        }

        // Convenience exposures
        if (out.serverControl) {
            if (out.serverControl['HOLD-BACK']) out.holdBack = parseFloat(out.serverControl['HOLD-BACK']);
            if (out.serverControl['PART-HOLD-BACK']) out.partHoldBack = parseFloat(out.serverControl['PART-HOLD-BACK']);
            if (out.serverControl['CAN-SKIP-UNTIL']) out.canSkipUntil = parseFloat(out.serverControl['CAN-SKIP-UNTIL']);
            out.canBlockReload = String(out.serverControl['CAN-BLOCK-RELOAD'] || '').toUpperCase() === 'YES';
        }
        if (out.partInf && out.partInf['PART-TARGET']) {
            out.partTarget = parseFloat(out.partInf['PART-TARGET']);
        }

        return out;
    }

    const APELLHlsParser = { parseLLHls: parseLLHls };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APELLHlsParser;
    } else {
        global.APELLHlsParser = APELLHlsParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
