/**
 * APE SUBTITLE / CLOSED CAPTION PARSER — Reads EXT-X-MEDIA TYPE=SUBTITLES
 * and TYPE=CLOSED-CAPTIONS. Classifies format (WebVTT, IMSC1, TTML, CEA-608/708).
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    function classifyFormat(codec, uri) {
        const c = String(codec || '').trim().toLowerCase();
        const u = String(uri || '').trim().toLowerCase();
        if (c === 'wvtt' || u.endsWith('.vtt') || u.indexOf('.vtt?') !== -1) return 'WEBVTT';
        if (c.startsWith('stpp') || c === 'im1t' || u.endsWith('.ttml')) return 'IMSC1_TTML';
        if (c === 'cea608') return 'CEA_608';
        if (c === 'cea708') return 'CEA_708';
        return 'UNKNOWN';
    }

    function classifyInstreamId(id) {
        const v = String(id || '').toUpperCase();
        if (v.startsWith('CC')) return 'CEA_608';
        if (v.startsWith('SERVICE')) return 'CEA_708';
        return null;
    }

    /**
     * @param {Array<Object>} mediaList
     * @returns {Object}
     */
    function parseSubtitles(mediaList) {
        const subs = [];
        const ccs = [];
        const list = Array.isArray(mediaList) ? mediaList : [];

        for (let i = 0; i < list.length; i++) {
            const m = list[i] || {};
            const type = String(m.TYPE || '').toUpperCase();
            if (type === 'SUBTITLES') {
                const codec = (m.CODECS && String(m.CODECS).split(',')[0]) || null;
                subs.push({
                    groupId:    m['GROUP-ID'] || null,
                    name:       m.NAME || null,
                    language:   m.LANGUAGE || null,
                    isDefault:  String(m.DEFAULT || '').toUpperCase() === 'YES',
                    autoSelect: String(m.AUTOSELECT || '').toUpperCase() === 'YES',
                    forced:     String(m.FORCED || '').toUpperCase() === 'YES',
                    codec:      codec,
                    uri:        m.URI || null,
                    format:     classifyFormat(codec, m.URI)
                });
            } else if (type === 'CLOSED-CAPTIONS') {
                ccs.push({
                    groupId:    m['GROUP-ID'] || null,
                    name:       m.NAME || null,
                    language:   m.LANGUAGE || null,
                    isDefault:  String(m.DEFAULT || '').toUpperCase() === 'YES',
                    autoSelect: String(m.AUTOSELECT || '').toUpperCase() === 'YES',
                    instreamId: m['INSTREAM-ID'] || null,
                    format:     classifyInstreamId(m['INSTREAM-ID'])
                });
            }
        }

        return {
            subtitles:       subs,
            closedCaptions:  ccs,
            languagesFound:  Array.from(new Set(
                subs.map(function (s) { return s.language; })
                    .concat(ccs.map(function (c) { return c.language; }))
                    .filter(Boolean)
            ))
        };
    }

    const APESubtitleParser = {
        parseSubtitles:     parseSubtitles,
        classifyFormat:     classifyFormat,
        classifyInstreamId: classifyInstreamId
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APESubtitleParser;
    } else {
        global.APESubtitleParser = APESubtitleParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
