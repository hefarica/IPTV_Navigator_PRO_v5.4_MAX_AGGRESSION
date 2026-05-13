/**
 * APE IPTV FLAT PARSER — Wraps ApeM3U8IngestionParser.
 * Parses #EXTINF + URL blocks plus nearby EXTVLCOPT/KODIPROP/EXTHTTP tags.
 * Tolerates broken EXTINF, missing URL, commas in names, unquoted attrs.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const RE_EXTINF = /^#EXTINF:\s*(-?\d*\.?\d*)\s*,?\s*(.*)/;
    const RE_ATTR   = /([\w-]+)="([^"]*)"/g;

    function parseExtinfAttrs(line) {
        const attrs = {};
        let m;
        RE_ATTR.lastIndex = 0;
        while ((m = RE_ATTR.exec(line)) !== null) attrs[m[1].toLowerCase()] = m[2];
        return attrs;
    }

    function extractName(line) {
        const m = RE_EXTINF.exec(line);
        return (m && m[2]) ? m[2].trim() : '';
    }

    /**
     * Parse a flat M3U/M3U8 text into channel objects with sidecars.
     * Delegates the heavy lifting to ApeM3U8IngestionParser when available;
     * otherwise runs a local minimal scanner.
     *
     * @param {string} text
     * @param {Object} [opts]
     * @returns {{ channels: Array, stats: Object }}
     */
    function parseFlat(text, opts) {
        opts = opts || {};

        // Preferred path: delegate to existing ingestion parser
        if (global.ApeM3U8IngestionParser && typeof global.ApeM3U8IngestionParser.parse === 'function') {
            const r = global.ApeM3U8IngestionParser.parse(text, opts);
            const enriched = (r.channels || []).map(function (ch) {
                return Object.assign({}, ch, {
                    _flatSidecars: ch._flatSidecars || { extvlcopt: [], kodiprop: [], exthttp: [], extgrp: null }
                });
            });
            return { channels: enriched, stats: r.stats || {} };
        }

        // Fallback path (used in Node test contexts where ingestion parser is not loaded)
        if (text == null) return { channels: [], stats: { totalLines: 0, totalChannels: 0 } };
        if (text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = String(text).split(/\r?\n/);

        const channels = [];
        let currentExtinf = null;
        let currentAttrs = {};
        let sideExtVlcOpt = [];
        let sideKodiProp = [];
        let sideExtHttp = [];
        let sideExtGrp = null;
        let chIx = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            if (line.startsWith('#EXTM3U')) continue;

            if (line.startsWith('#EXTINF')) {
                currentExtinf = { raw: line, name: extractName(line) };
                currentAttrs = parseExtinfAttrs(line);
                continue;
            }
            if (line.startsWith('#EXTGRP'))    { sideExtGrp = line.substring(8).trim(); continue; }
            if (line.startsWith('#EXTVLCOPT')) { sideExtVlcOpt.push(line); continue; }
            if (line.startsWith('#KODIPROP'))  { sideKodiProp.push(line); continue; }
            if (line.startsWith('#EXTHTTP'))   { sideExtHttp.push(line); continue; }
            if (line.startsWith('#')) continue;

            if (currentExtinf) {
                channels.push({
                    id:            chIx,
                    name:          currentAttrs['tvg-name'] || currentExtinf.name || ('Channel ' + chIx),
                    url:           line,
                    tvg_id:        currentAttrs['tvg-id'] || '',
                    tvg_logo:      currentAttrs['tvg-logo'] || '',
                    group_title:   currentAttrs['group-title'] || '',
                    catchup:       currentAttrs['catchup'] || '',
                    radio:         currentAttrs['radio'] === 'true',
                    extinfRaw:     currentExtinf.raw,
                    _flatSidecars: {
                        extvlcopt: sideExtVlcOpt,
                        kodiprop:  sideKodiProp,
                        exthttp:   sideExtHttp,
                        extgrp:    sideExtGrp
                    }
                });
                chIx++;
                currentExtinf = null;
                currentAttrs = {};
                sideExtVlcOpt = [];
                sideKodiProp = [];
                sideExtHttp = [];
                sideExtGrp = null;
            }
        }

        return {
            channels: channels,
            stats: { totalLines: lines.length, totalChannels: channels.length }
        };
    }

    const APEIptvFlatParser = {
        parseFlat:       parseFlat,
        parseExtinfAttrs: parseExtinfAttrs
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEIptvFlatParser;
    } else {
        global.APEIptvFlatParser = APEIptvFlatParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
