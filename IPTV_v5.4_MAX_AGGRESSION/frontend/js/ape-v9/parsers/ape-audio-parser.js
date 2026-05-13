/**
 * APE AUDIO PARSER — Reads EXT-X-MEDIA TYPE=AUDIO rows + ranks codecs.
 *
 * Ranking (descending visual/audible quality):
 *   1. EC-3  (Dolby Digital Plus / Atmos candidate)
 *   2. AC-3  (Dolby Digital)
 *   3. AAC LC (mp4a.40.2)
 *   4. HE-AAC (mp4a.40.5)
 *   5. Opus
 *   6. unknown
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const RANK = {
        EAC3:    100,
        AC3:      85,
        AAC_LC:   70,
        HE_AAC:   60,
        HE_AACv2: 55,
        FLAC:     50,
        OPUS:     45,
        MP3:      30,
        AAC:      40,
        UNKNOWN:   0
    };

    function familyFromCodec(codec) {
        const c = String(codec || '').trim().toLowerCase();
        if (!c) return 'UNKNOWN';
        if (/^ec-3$|^eac3$|^eac-3$/i.test(c)) return 'EAC3';
        if (/^ac-3$|^ac3$/i.test(c))           return 'AC3';
        if (c === 'mp4a.40.2')                 return 'AAC_LC';
        if (c === 'mp4a.40.5')                 return 'HE_AAC';
        if (c === 'mp4a.40.29')                return 'HE_AACv2';
        if (c.startsWith('mp4a.40.'))          return 'AAC';
        if (c === 'opus')                      return 'OPUS';
        if (c === 'flac' || c === 'flac')      return 'FLAC';
        if (c === 'mp4a.6b' || c === 'mp4a.40.34') return 'MP3';
        return 'UNKNOWN';
    }

    function rankCodec(codec) {
        const f = familyFromCodec(codec);
        return { family: f, rank: RANK[f] != null ? RANK[f] : 0 };
    }

    function detectAtmosHint(name, channels) {
        const n = String(name || '').toUpperCase();
        if (n.includes('ATMOS')) return true;
        if (n.includes('DOLBY') && n.includes('+')) return true;
        const ch = String(channels || '');
        if (ch.indexOf('JOC') !== -1) return true;
        return false;
    }

    /**
     * Parse all EXT-X-MEDIA TYPE=AUDIO records.
     * @param {Array<Object>} mediaList - Already-parsed media attributes (from master parser).
     * @returns {Object}
     */
    function parseAudioGroups(mediaList) {
        const audios = [];
        const list = Array.isArray(mediaList) ? mediaList : [];
        for (let i = 0; i < list.length; i++) {
            const m = list[i] || {};
            if (String(m.TYPE || '').toUpperCase() !== 'AUDIO') continue;
            const codec = (m.CODECS && String(m.CODECS).split(',')[0]) || null;
            const r = rankCodec(codec);
            audios.push({
                groupId:     m['GROUP-ID'] || null,
                name:        m.NAME || null,
                language:    m.LANGUAGE || null,
                isDefault:   String(m.DEFAULT || '').toUpperCase() === 'YES',
                autoSelect:  String(m.AUTOSELECT || '').toUpperCase() === 'YES',
                forced:      String(m.FORCED || '').toUpperCase() === 'YES',
                channels:    m.CHANNELS || null,
                codec:       codec,
                family:      r.family,
                rank:        r.rank,
                uri:         m.URI || null,
                atmosHint:   detectAtmosHint(m.NAME, m.CHANNELS)
            });
        }
        audios.sort(function (a, b) { return b.rank - a.rank; });
        const top = audios.length ? audios[0] : null;
        return {
            groups:         audios,
            topAudio:       top,
            topFamily:      top ? top.family : null,
            languagesFound: Array.from(new Set(audios.map(function (a) { return a.language; }).filter(Boolean)))
        };
    }

    const APEAudioParser = {
        parseAudioGroups:  parseAudioGroups,
        rankCodec:         rankCodec,
        familyFromCodec:   familyFromCodec,
        detectAtmosHint:   detectAtmosHint,
        RANK:              RANK
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEAudioParser;
    } else {
        global.APEAudioParser = APEAudioParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
