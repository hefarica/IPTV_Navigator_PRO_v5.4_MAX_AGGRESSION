/**
 * APE URL RESOLVER — Relative → absolute URI resolution.
 *
 * Wraps `new URL(rel, base)` with safe defaults and a few common-case
 * shortcuts (already absolute, root-relative, dot segments, query strings,
 * fragments, signed URLs).
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const RE_ABSOLUTE = /^[a-z][a-z0-9+.-]*:\/\//i;
    const RE_PROTOCOL_RELATIVE = /^\/\//;
    const RE_DATA_URI = /^data:/i;

    function isAbsolute(uri) {
        if (!uri) return false;
        return RE_ABSOLUTE.test(uri) || RE_PROTOCOL_RELATIVE.test(uri) || RE_DATA_URI.test(uri);
    }

    /**
     * Resolve `rel` against `base`. Returns the input unchanged on failure.
     */
    function resolve(rel, base) {
        const r = String(rel || '').trim();
        const b = String(base || '').trim();
        if (!r) return null;
        if (isAbsolute(r)) return r;
        if (!b) return r;
        try { return new URL(r, b).toString(); }
        catch (e) { return r; }
    }

    /**
     * Extract origin from any URL string. Returns null on failure.
     */
    function origin(url) {
        try { return new URL(String(url)).origin; } catch (e) { return null; }
    }

    /**
     * Extract directory of an absolute URL (everything up to last `/`).
     */
    function directory(url) {
        try {
            const u = new URL(String(url));
            const path = u.pathname;
            const idx = path.lastIndexOf('/');
            const dir = idx >= 0 ? path.substring(0, idx + 1) : '/';
            return u.origin + dir;
        } catch (e) { return null; }
    }

    /**
     * Replace the path of a URL, preserving origin + query (optional).
     */
    function withPath(url, newPath, preserveQuery) {
        try {
            const u = new URL(String(url));
            u.pathname = newPath;
            if (!preserveQuery) u.search = '';
            return u.toString();
        } catch (e) { return null; }
    }

    function parseQuery(url) {
        const result = {};
        try {
            const u = new URL(String(url));
            u.searchParams.forEach(function (v, k) { result[k] = v; });
        } catch (e) {}
        return result;
    }

    const APEUrlResolver = {
        resolve:    resolve,
        isAbsolute: isAbsolute,
        origin:     origin,
        directory:  directory,
        withPath:   withPath,
        parseQuery: parseQuery
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEUrlResolver;
    } else {
        global.APEUrlResolver = APEUrlResolver;
    }

})(typeof window !== 'undefined' ? window : globalThis);
