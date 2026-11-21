/**
 * APE CODEC PARSER — Splits and classifies CODECS string.
 * Input: 'hvc1.2.4.L153.B0,mp4a.40.2'
 * Output: { videoCodec, audioCodec, textCodec, family, raw, parts, unknown }
 *
 * Delegates RFC 6381 validity check to M3U8ParserStrictUltimate.validateCodec
 * when available. Classification table is local for speed.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const VIDEO_FAMILIES = [
        { re: /^hvc1\./i, family: 'HEVC',          fourCC: 'hvc1' },
        { re: /^hev1\./i, family: 'HEVC',          fourCC: 'hev1' },
        { re: /^dvh1\./i, family: 'DOLBY_VISION',  fourCC: 'dvh1' },
        { re: /^dvhe\./i, family: 'DOLBY_VISION',  fourCC: 'dvhe' },
        { re: /^avc1\./i, family: 'AVC',           fourCC: 'avc1' },
        { re: /^avc3\./i, family: 'AVC',           fourCC: 'avc3' },
        { re: /^av01\./i, family: 'AV1',           fourCC: 'av01' },
        { re: /^vp09\./i, family: 'VP9',           fourCC: 'vp09' },
        { re: /^vp8$/i,   family: 'VP8',           fourCC: 'vp8'  },
        { re: /^mp4v\./i, family: 'MPEG4_PART2',   fourCC: 'mp4v' },
        { re: /^vvc1\./i, family: 'VVC',           fourCC: 'vvc1' },
        { re: /^evc1\./i, family: 'EVC',           fourCC: 'evc1' },
        { re: /^lcev\./i, family: 'LCEVC',         fourCC: 'lcev' }
    ];

    const AUDIO_FAMILIES = [
        { re: /^mp4a\.40\.2$/i,  family: 'AAC_LC' },
        { re: /^mp4a\.40\.5$/i,  family: 'HE_AAC' },
        { re: /^mp4a\.40\.29$/i, family: 'HE_AACv2' },
        { re: /^mp4a\.40\./i,    family: 'AAC' },
        { re: /^mp4a\.6B$/i,     family: 'MP3' },
        { re: /^ec-3$|^eac3$|^eac-3$/i, family: 'EAC3' },
        { re: /^ac-3$|^ac3$/i,   family: 'AC3' },
        { re: /^opus$/i,         family: 'OPUS' },
        { re: /^fLaC$/,          family: 'FLAC' },
        { re: /^vorbis$/i,       family: 'VORBIS' }
    ];

    const TEXT_FAMILIES = [
        { re: /^wvtt$/i,   family: 'WEBVTT' },
        { re: /^stpp/i,    family: 'TTML_IMSC1' },
        { re: /^im1t$/i,   family: 'IMSC1' },
        { re: /^cea608$/i, family: 'CEA_608' },
        { re: /^cea708$/i, family: 'CEA_708' }
    ];

    function classifyOne(token) {
        const t = String(token || '').trim();
        if (!t) return { family: null, fourCC: null, kind: 'unknown' };

        for (let i = 0; i < VIDEO_FAMILIES.length; i++) {
            if (VIDEO_FAMILIES[i].re.test(t)) {
                return { family: VIDEO_FAMILIES[i].family, fourCC: VIDEO_FAMILIES[i].fourCC, kind: 'video' };
            }
        }
        for (let i = 0; i < AUDIO_FAMILIES.length; i++) {
            if (AUDIO_FAMILIES[i].re.test(t)) {
                return { family: AUDIO_FAMILIES[i].family, fourCC: t, kind: 'audio' };
            }
        }
        for (let i = 0; i < TEXT_FAMILIES.length; i++) {
            if (TEXT_FAMILIES[i].re.test(t)) {
                return { family: TEXT_FAMILIES[i].family, fourCC: t, kind: 'text' };
            }
        }
        return { family: null, fourCC: t, kind: 'unknown' };
    }

    /**
     * Parse a CODECS string into structured info.
     * @param {string} codecsStr - e.g. 'hvc1.2.4.L153.B0,mp4a.40.2'
     * @returns {Object}
     */
    function parseCodecString(codecsStr) {
        const raw = String(codecsStr || '').trim();
        const out = {
            raw:        raw,
            videoCodec: null,
            audioCodec: null,
            textCodec:  null,
            family:     { video: null, audio: null, text: null },
            parts:      [],
            unknown:    [],
            valid:      false,
            warnings:   []
        };
        if (!raw) {
            out.warnings.push('empty CODECS string');
            return out;
        }

        const tokens = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            const info = classifyOne(t);
            out.parts.push({ token: t, kind: info.kind, family: info.family, fourCC: info.fourCC });
            if (info.kind === 'video' && !out.videoCodec) { out.videoCodec = t; out.family.video = info.family; }
            else if (info.kind === 'audio' && !out.audioCodec) { out.audioCodec = t; out.family.audio = info.family; }
            else if (info.kind === 'text' && !out.textCodec)  { out.textCodec  = t; out.family.text  = info.family; }
            else if (info.kind === 'unknown') out.unknown.push(t);
        }

        // Optional RFC 6381 validity via strict parser, if loaded
        if (global.M3U8ParserStrictUltimate && typeof global.M3U8ParserStrictUltimate.validateCodec === 'function') {
            const v = global.M3U8ParserStrictUltimate.validateCodec(raw);
            out.valid = !!v.valid;
            if (!v.valid && v.reason) out.warnings.push('RFC 6381: ' + v.reason);
        } else {
            out.valid = (out.unknown.length === 0 && tokens.length > 0);
        }

        return out;
    }

    /**
     * Split a compound CODECS into (video, audio) explicitly. Convenience.
     */
    function splitVideoAudio(codecsStr) {
        const p = parseCodecString(codecsStr);
        return { videoCodec: p.videoCodec, audioCodec: p.audioCodec };
    }

    const APECodecParser = {
        parseCodecString: parseCodecString,
        splitVideoAudio:  splitVideoAudio,
        classifyOne:      classifyOne,
        VIDEO_FAMILIES:   VIDEO_FAMILIES,
        AUDIO_FAMILIES:   AUDIO_FAMILIES,
        TEXT_FAMILIES:    TEXT_FAMILIES
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APECodecParser;
    } else {
        global.APECodecParser = APECodecParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
