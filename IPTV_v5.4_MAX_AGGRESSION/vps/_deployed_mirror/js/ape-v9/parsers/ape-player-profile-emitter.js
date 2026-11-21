/**
 * APE PLAYER PROFILE EMITTER — Emits the per-player view of a canonical APE
 * object. Each target strips or adds player-specific tags. The emitter
 * NEVER reintroduces toxic headers (CA7/C8).
 *
 * Targets:
 *   STANDARD_HLS, EXOPLAYER_SAFE, TIVIMATE_SAFE, OTT_NAVIGATOR_SAFE,
 *   VLC_ENHANCED, KODI_ENHANCED, APPLE_HLS_STRICT
 *
 * Each emission returns an object describing what to write:
 *   { profile, extinf, extras: [string], headers: Object }
 *
 * The actual M3U8 writing remains the responsibility of
 * m3u8-typed-arrays-ultimate.js (PATH A generator).
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const PROFILES = [
        'STANDARD_HLS', 'EXOPLAYER_SAFE', 'TIVIMATE_SAFE',
        'OTT_NAVIGATOR_SAFE', 'VLC_ENHANCED', 'KODI_ENHANCED', 'APPLE_HLS_STRICT'
    ];

    function safeHeaders(headers) {
        if (global.APEHttpHeaderSanitizer && typeof global.APEHttpHeaderSanitizer.sanitizeExtHttpHeaders === 'function') {
            return global.APEHttpHeaderSanitizer.sanitizeExtHttpHeaders(headers || {}).headers;
        }
        return headers || {};
    }

    function buildExtinf(canonical) {
        const ch = canonical.channel || {};
        const attrs = [];
        if (ch.id)    attrs.push('tvg-id="' + ch.id + '"');
        if (ch.name)  attrs.push('tvg-name="' + ch.name + '"');
        if (ch.logo)  attrs.push('tvg-logo="' + ch.logo + '"');
        if (ch.group) attrs.push('group-title="' + ch.group + '"');
        const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
        return '#EXTINF:-1' + attrStr + ',' + (ch.name || 'Channel');
    }

    function emitStandardHls(canonical) {
        return {
            profile: 'STANDARD_HLS',
            extinf:  buildExtinf(canonical),
            extras:  [],
            headers: safeHeaders(canonical.headers && canonical.headers.values)
        };
    }

    function emitExoplayerSafe(canonical) {
        const out = emitStandardHls(canonical);
        out.profile = 'EXOPLAYER_SAFE';
        return out;
    }

    function emitTivimateSafe(canonical) {
        const out = emitStandardHls(canonical);
        out.profile = 'TIVIMATE_SAFE';
        return out;
    }

    function emitOttNavigatorSafe(canonical) {
        const out = emitStandardHls(canonical);
        out.profile = 'OTT_NAVIGATOR_SAFE';
        // EXTHTTP supported by OTT Navigator
        const hdrs = out.headers;
        if (hdrs && Object.keys(hdrs).length) {
            out.extras.push('#EXTHTTP:' + JSON.stringify({ headers: hdrs }));
        }
        return out;
    }

    function emitVlcEnhanced(canonical) {
        const out = emitStandardHls(canonical);
        out.profile = 'VLC_ENHANCED';
        const hdrs = out.headers || {};
        const keys = Object.keys(hdrs);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            // never emit toxic — sanitizer already stripped, just defensive
            if (/^(range|if-none-match|if-modified-since|te|priority|upgrade-insecure-requests)$/i.test(k)) continue;
            out.extras.push('#EXTVLCOPT:http-header=' + k + ': ' + hdrs[k]);
        }
        return out;
    }

    function emitKodiEnhanced(canonical) {
        const out = emitStandardHls(canonical);
        out.profile = 'KODI_ENHANCED';
        const hdrs = out.headers || {};
        const pairs = [];
        const keys = Object.keys(hdrs);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (/^(range|if-none-match|if-modified-since|te|priority|upgrade-insecure-requests)$/i.test(k)) continue;
            pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(hdrs[k]));
        }
        if (pairs.length) {
            out.extras.push('#KODIPROP:inputstream.adaptive.stream_headers=' + pairs.join('&'));
        }
        return out;
    }

    function emitAppleHlsStrict(canonical) {
        const out = emitStandardHls(canonical);
        out.profile = 'APPLE_HLS_STRICT';
        // Strip everything custom; keep only RFC 8216 tags
        out.extras = [];
        // Apple is strict about Accept-Encoding identity — preserve.
        return out;
    }

    function emit(canonical, target) {
        const t = String(target || '').toUpperCase();
        switch (t) {
            case 'STANDARD_HLS':       return emitStandardHls(canonical);
            case 'EXOPLAYER_SAFE':     return emitExoplayerSafe(canonical);
            case 'TIVIMATE_SAFE':      return emitTivimateSafe(canonical);
            case 'OTT_NAVIGATOR_SAFE': return emitOttNavigatorSafe(canonical);
            case 'VLC_ENHANCED':       return emitVlcEnhanced(canonical);
            case 'KODI_ENHANCED':      return emitKodiEnhanced(canonical);
            case 'APPLE_HLS_STRICT':   return emitAppleHlsStrict(canonical);
            default:                   return emitStandardHls(canonical);
        }
    }

    function emitAll(canonical) {
        const out = {};
        for (let i = 0; i < PROFILES.length; i++) out[PROFILES[i]] = emit(canonical, PROFILES[i]);
        return out;
    }

    const APEPlayerProfileEmitter = {
        emit:     emit,
        emitAll:  emitAll,
        PROFILES: PROFILES
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEPlayerProfileEmitter;
    } else {
        global.APEPlayerProfileEmitter = APEPlayerProfileEmitter;
    }

})(typeof window !== 'undefined' ? window : globalThis);
