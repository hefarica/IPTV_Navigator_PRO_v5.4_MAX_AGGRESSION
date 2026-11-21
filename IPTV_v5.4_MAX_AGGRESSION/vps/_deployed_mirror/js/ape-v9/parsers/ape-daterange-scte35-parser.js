/**
 * APE DATERANGE + SCTE-35 PARSER
 *
 * Reads #EXT-X-DATERANGE and decodes SCTE35-OUT/SCTE35-IN/SCTE35-CMD payloads
 * (hex base16 strings). No deep splice_info_section parsing — that requires a
 * specialized decoder. We expose the raw bytes + a few high-level fields.
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

    function decodeHexBytes(hex) {
        if (!hex) return null;
        const h = String(hex).replace(/^0x/i, '').replace(/\s+/g, '');
        if (!/^[0-9A-F]+$/i.test(h) || h.length % 2 !== 0) return null;
        const out = new Array(h.length / 2);
        for (let i = 0; i < h.length; i += 2) {
            out[i / 2] = parseInt(h.substring(i, i + 2), 16);
        }
        return out;
    }

    function summarizeScte35(bytes) {
        if (!bytes || bytes.length < 14) return { tableId: null, spliceCommandType: null };
        return {
            tableId:           bytes[0],
            sectionLengthHint: ((bytes[1] & 0x0F) << 8) | bytes[2],
            spliceCommandType: bytes[13] != null ? bytes[13] : null
        };
    }

    /**
     * Parse a single EXT-X-DATERANGE attribute set.
     * @param {Object} attrs
     * @returns {Object}
     */
    function parseDateRange(attrs) {
        const a = attrs || {};
        const out = {
            id:               a.ID || null,
            class:            a.CLASS || null,
            startDate:        a['START-DATE'] || null,
            endDate:          a['END-DATE'] || null,
            duration:         a.DURATION != null ? Number(a.DURATION) : null,
            plannedDuration:  a['PLANNED-DURATION'] != null ? Number(a['PLANNED-DURATION']) : null,
            scte35:           null
        };

        const scte = {
            out: a['SCTE35-OUT'] || null,
            in:  a['SCTE35-IN']  || null,
            cmd: a['SCTE35-CMD'] || null
        };
        if (scte.out || scte.in || scte.cmd) {
            const raw = scte.out || scte.in || scte.cmd;
            const bytes = decodeHexBytes(raw);
            out.scte35 = {
                hex:       raw,
                direction: scte.out ? 'OUT' : (scte.in ? 'IN' : 'CMD'),
                bytes:     bytes,
                summary:   summarizeScte35(bytes)
            };
        }
        return out;
    }

    /**
     * Walk text + extract all DATERANGE tags.
     * @param {string} text
     * @returns {{ dateRanges: Array, scte35Events: Array }}
     */
    function parseDateRanges(text) {
        const out = { dateRanges: [], scte35Events: [] };
        if (text == null) return out;
        if (text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = String(text).split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith('#EXT-X-DATERANGE:')) continue;
            const dr = parseDateRange(parseAttrList(line.substring(17)));
            out.dateRanges.push(dr);
            if (dr.scte35) out.scte35Events.push(dr);
        }
        return out;
    }

    const APEDateRangeScte35Parser = {
        parseDateRange:   parseDateRange,
        parseDateRanges:  parseDateRanges,
        decodeHexBytes:   decodeHexBytes,
        summarizeScte35:  summarizeScte35
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEDateRangeScte35Parser;
    } else {
        global.APEDateRangeScte35Parser = APEDateRangeScte35Parser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
