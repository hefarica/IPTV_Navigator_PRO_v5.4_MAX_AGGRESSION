/**
 * APE KODIPROP PARSER — #KODIPROP:key=value classifier.
 * Categories: inputstream, adaptive, drm, license, bandwidth, user_agent,
 *             audio_passthrough, unsupported.
 *
 * Marks playerScope: KODI_ONLY. Sanitizes embedded headers.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    function classifyKey(key) {
        const k = String(key || '').toLowerCase();
        if (!k) return 'unsupported';
        if (k.startsWith('inputstream.adaptive.license_'))                              return 'license';
        if (k.startsWith('inputstream.adaptive.manifest_'))                             return 'adaptive';
        if (k.startsWith('inputstream.adaptive.stream_headers'))                        return 'adaptive';
        if (k.startsWith('inputstream.adaptive.'))                                      return 'adaptive';
        if (k.startsWith('inputstream.'))                                               return 'inputstream';
        if (k.indexOf('drm') !== -1 || k.indexOf('widevine') !== -1 ||
            k.indexOf('playready') !== -1)                                              return 'drm';
        if (k === 'min_bandwidth' || k === 'max_bandwidth' || k.indexOf('bitrate') !== -1) return 'bandwidth';
        if (k === 'user_agent')                                                         return 'user_agent';
        if (k.indexOf('audio_passthrough') !== -1)                                      return 'audio_passthrough';
        return 'unsupported';
    }

    function sanitizeStreamHeaders(value) {
        if (!value || typeof value !== 'string') return { value: value, removed: [], blocked: false };
        if (!global.APEHttpHeaderSanitizer) return { value: value, removed: [], blocked: false };
        const obj = {};
        const pairs = String(value).split('&');
        for (let i = 0; i < pairs.length; i++) {
            const eq = pairs[i].indexOf('=');
            if (eq <= 0) continue;
            const k = decodeURIComponent(pairs[i].substring(0, eq).trim());
            const v = decodeURIComponent(pairs[i].substring(eq + 1).trim());
            obj[k] = v;
        }
        const r = global.APEHttpHeaderSanitizer.sanitizeExtHttpHeaders(obj);
        const rebuilt = Object.entries(r.headers)
            .map(function (e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); })
            .join('&');
        return { value: rebuilt, removed: r.audit.toxicHeadersRemoved || [], blocked: false };
    }

    function parseKodiProp(line) {
        const raw = String(line || '');
        const body = raw.startsWith('#KODIPROP:') ? raw.substring(10) : raw;
        const eqIdx = body.indexOf('=');
        if (eqIdx <= 0) {
            return {
                raw: raw, key: null, value: null, category: 'unsupported',
                playerScope: 'KODI_ONLY', warnings: ['malformed: missing ='], toxicHeadersRemoved: []
            };
        }
        const key = body.substring(0, eqIdx).trim();
        let value = body.substring(eqIdx + 1).trim();
        const category = classifyKey(key);

        const out = {
            raw:                  raw,
            key:                  key,
            value:                value,
            category:             category,
            playerScope:          'KODI_ONLY',
            warnings:             [],
            toxicHeadersRemoved:  []
        };

        if (key.toLowerCase() === 'inputstream.adaptive.stream_headers') {
            const r = sanitizeStreamHeaders(value);
            out.value = r.value;
            out.toxicHeadersRemoved = r.removed;
            if (r.removed && r.removed.length) {
                out.warnings.push('stream_headers sanitized, removed: ' + r.removed.join(', '));
            }
        }

        return out;
    }

    function parseKodiPropBlocks(text) {
        const blocks = [];
        if (text == null) return { blocks: blocks, summary: { count: 0, toxicHeadersRemoved: 0 } };
        if (text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = String(text).split(/\r?\n/);
        let toxic = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith('#KODIPROP')) continue;
            const p = parseKodiProp(line);
            p.lineNo = i + 1;
            blocks.push(p);
            toxic += (p.toxicHeadersRemoved && p.toxicHeadersRemoved.length) || 0;
        }
        return { blocks: blocks, summary: { count: blocks.length, toxicHeadersRemoved: toxic } };
    }

    const APEKodiPropParser = {
        parseKodiProp:        parseKodiProp,
        parseKodiPropBlocks:  parseKodiPropBlocks,
        classifyKey:          classifyKey
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEKodiPropParser;
    } else {
        global.APEKodiPropParser = APEKodiPropParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
