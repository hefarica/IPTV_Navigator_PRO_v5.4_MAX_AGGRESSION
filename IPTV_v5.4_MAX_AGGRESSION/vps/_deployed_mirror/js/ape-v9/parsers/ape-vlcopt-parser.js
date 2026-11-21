/**
 * APE EXTVLCOPT PARSER — #EXTVLCOPT:key=value classifier.
 * Categories: network, cache, decoder, video, audio, subtitle, adaptive,
 *             http-header, unsupported.
 *
 * Marks playerScope: VLC_ONLY. Strips toxic headers from `http-header=`
 * lines using APEHttpHeaderSanitizer.sanitizeSingleHttpHeader.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    function classifyKey(key) {
        const k = String(key || '').toLowerCase();
        if (!k) return 'unsupported';
        if (k === 'http-header')                                                    return 'http-header';
        if (k.startsWith('http-') || k === 'network-caching' || k === 'live-caching') return 'network';
        if (k.indexOf('caching') !== -1)                                            return 'cache';
        if (k.indexOf('decoder') !== -1 || k === 'avcodec-hw' || k === 'avcodec-fast') return 'decoder';
        if (k.startsWith('video-') || k === 'deinterlace' || k === 'vout-filter')   return 'video';
        if (k.startsWith('audio-') || k === 'aout' || k === 'audio-language')       return 'audio';
        if (k.startsWith('sub-') || k === 'sout-sub')                               return 'subtitle';
        if (k.indexOf('adaptive') !== -1)                                           return 'adaptive';
        return 'unsupported';
    }

    function sanitizeHeaderLine(rawValue) {
        const val = String(rawValue || '').trim();
        if (!val) return { key: '', value: '', blocked: true, reason: 'EMPTY' };
        if (global.APEHttpHeaderSanitizer && typeof global.APEHttpHeaderSanitizer.sanitizeSingleHttpHeader === 'function') {
            return global.APEHttpHeaderSanitizer.sanitizeSingleHttpHeader(val);
        }
        const idx = val.indexOf(':');
        if (idx <= 0) return { key: '', value: val, blocked: true, reason: 'MALFORMED_NO_COLON' };
        return { key: val.substring(0, idx).trim(), value: val.substring(idx + 1).trim(), blocked: false, reason: null };
    }

    /**
     * Parse a single EXTVLCOPT directive line.
     * @param {string} line - "#EXTVLCOPT:key=value" or just "key=value".
     */
    function parseVlcOpt(line) {
        const raw = String(line || '');
        const body = raw.startsWith('#EXTVLCOPT:') ? raw.substring(11) : raw;
        const eqIdx = body.indexOf('=');
        if (eqIdx <= 0) {
            return {
                raw: raw, key: null, value: null, category: 'unsupported',
                playerScope: 'VLC_ONLY', warnings: ['malformed: missing ='], blocked: false, reason: null
            };
        }
        const key = body.substring(0, eqIdx).trim();
        const value = body.substring(eqIdx + 1).trim();
        const category = classifyKey(key);

        const out = {
            raw:         raw,
            key:         key,
            value:       value,
            category:    category,
            playerScope: 'VLC_ONLY',
            warnings:    [],
            blocked:     false,
            reason:      null
        };

        if (category === 'http-header') {
            const sanitized = sanitizeHeaderLine(value);
            out.headerKey   = sanitized.key;
            out.headerValue = sanitized.value;
            out.blocked     = !!sanitized.blocked;
            out.reason      = sanitized.reason;
            if (sanitized.blocked) out.warnings.push('toxic http-header stripped: ' + sanitized.reason);
        }

        return out;
    }

    /**
     * Walk text + collect all EXTVLCOPT lines.
     */
    function parseVlcOptBlocks(text) {
        const blocks = [];
        if (text == null) return { blocks: blocks, summary: { count: 0, toxicHeadersRemoved: 0 } };
        if (text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = String(text).split(/\r?\n/);
        let toxic = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith('#EXTVLCOPT')) continue;
            const p = parseVlcOpt(line);
            p.lineNo = i + 1;
            blocks.push(p);
            if (p.category === 'http-header' && p.blocked && p.reason === 'CA7_C8_TOXIC_HEADER_BLOCKED') toxic++;
        }
        return { blocks: blocks, summary: { count: blocks.length, toxicHeadersRemoved: toxic } };
    }

    const APEVlcOptParser = {
        parseVlcOpt:        parseVlcOpt,
        parseVlcOptBlocks:  parseVlcOptBlocks,
        classifyKey:        classifyKey
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEVlcOptParser;
    } else {
        global.APEVlcOptParser = APEVlcOptParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
