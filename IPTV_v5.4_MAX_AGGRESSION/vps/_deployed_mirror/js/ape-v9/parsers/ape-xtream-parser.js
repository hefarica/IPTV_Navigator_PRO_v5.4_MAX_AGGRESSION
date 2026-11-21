/**
 * APE XTREAM PARSER — Detects and parses Xtream/M3U-Plus URLs.
 *
 * Supports:
 *   /live/{user}/{pass}/{id}.m3u8
 *   /movie/{user}/{pass}/{id}.{ext}
 *   /series/{user}/{pass}/{id}.{ext}
 *   /timeshift/{user}/{pass}/{duration}/{date}/{id}.{ext}
 *   /player_api.php?username=X&password=Y
 *   /get.php?username=X&password=Y&type=...
 *
 * Delegates initial paradigm detection to ApeM3U8IngestionParser when loaded.
 * Never logs credentials.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const RE_XTREAM_LIVE      = /\/live\/([^/]+)\/([^/]+)\/(\d+)\.(\w+)/i;
    const RE_XTREAM_MOVIE     = /\/movie\/([^/]+)\/([^/]+)\/(\d+)\.(\w+)/i;
    const RE_XTREAM_SERIES    = /\/series\/([^/]+)\/([^/]+)\/(\d+)\.(\w+)/i;
    const RE_XTREAM_TIMESHIFT = /\/timeshift\/([^/]+)\/([^/]+)\/(\d+)\/([^/]+)\/(\d+)\.(\w+)/i;
    const RE_API_USER         = /[?&]username=([^&]+)/i;
    const RE_API_PASS         = /[?&]password=([^&]+)/i;
    const RE_API_TYPE         = /[?&]type=([^&]+)/i;
    const RE_API_ACTION       = /[?&]action=([^&]+)/i;

    function tryDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

    /**
     * Parse a single URL into an Xtream descriptor.
     * @param {string} url
     * @returns {Object}
     */
    function parseXtreamUrl(url) {
        const raw = String(url || '');
        const out = {
            raw:           raw,
            isXtream:      false,
            paradigm:      'direct',
            host:          null,
            port:          null,
            protocol:      null,
            username:      null,
            password:      null,
            streamId:      null,
            streamType:    null,
            extension:     null,
            apiAction:     null,
            apiType:       null,
            timeshiftDate: null,
            timeshiftDur:  null,
            warnings:      []
        };

        let parsed;
        try { parsed = new URL(raw); }
        catch (e) { out.warnings.push('malformed URL'); return out; }

        out.protocol = parsed.protocol.replace(':', '');
        out.host     = parsed.hostname;
        out.port     = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');

        let m;
        if ((m = RE_XTREAM_LIVE.exec(parsed.pathname))) {
            out.isXtream = true; out.paradigm = 'xtream';
            out.streamType = 'live'; out.username = tryDecode(m[1]); out.password = tryDecode(m[2]);
            out.streamId = m[3]; out.extension = m[4].toLowerCase();
            return out;
        }
        if ((m = RE_XTREAM_TIMESHIFT.exec(parsed.pathname))) {
            out.isXtream = true; out.paradigm = 'xtream';
            out.streamType = 'timeshift'; out.username = tryDecode(m[1]); out.password = tryDecode(m[2]);
            out.timeshiftDur = m[3]; out.timeshiftDate = m[4];
            out.streamId = m[5]; out.extension = m[6].toLowerCase();
            return out;
        }
        if ((m = RE_XTREAM_MOVIE.exec(parsed.pathname))) {
            out.isXtream = true; out.paradigm = 'xtream';
            out.streamType = 'movie'; out.username = tryDecode(m[1]); out.password = tryDecode(m[2]);
            out.streamId = m[3]; out.extension = m[4].toLowerCase();
            return out;
        }
        if ((m = RE_XTREAM_SERIES.exec(parsed.pathname))) {
            out.isXtream = true; out.paradigm = 'xtream';
            out.streamType = 'series'; out.username = tryDecode(m[1]); out.password = tryDecode(m[2]);
            out.streamId = m[3]; out.extension = m[4].toLowerCase();
            return out;
        }

        const lower = parsed.pathname.toLowerCase();
        if (lower.indexOf('player_api.php') !== -1 || lower.indexOf('get.php') !== -1) {
            out.isXtream = true; out.paradigm = 'xtream_api';
            const u = RE_API_USER.exec(parsed.search);
            const p = RE_API_PASS.exec(parsed.search);
            const t = RE_API_TYPE.exec(parsed.search);
            const a = RE_API_ACTION.exec(parsed.search);
            if (u) out.username  = tryDecode(u[1]);
            if (p) out.password  = tryDecode(p[1]);
            if (t) out.apiType   = tryDecode(t[1]);
            if (a) out.apiAction = tryDecode(a[1]);
            return out;
        }

        const u2 = RE_API_USER.exec(parsed.search);
        const p2 = RE_API_PASS.exec(parsed.search);
        if (u2 && p2) {
            out.paradigm = 'query_hls';
            out.username = tryDecode(u2[1]);
            out.password = tryDecode(p2[1]);
        }
        return out;
    }

    /**
     * Redact credentials for safe logging.
     */
    function redact(desc) {
        if (!desc) return desc;
        return Object.assign({}, desc, {
            username: desc.username ? '***' + desc.username.slice(-2) : null,
            password: desc.password ? '***'                            : null
        });
    }

    const APEXtreamParser = {
        parseXtreamUrl: parseXtreamUrl,
        redact:         redact
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEXtreamParser;
    } else {
        global.APEXtreamParser = APEXtreamParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
