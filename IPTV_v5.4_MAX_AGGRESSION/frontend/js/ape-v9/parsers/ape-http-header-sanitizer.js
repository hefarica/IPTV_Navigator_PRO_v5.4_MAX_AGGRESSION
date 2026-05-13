/**
 * APE HTTP HEADER SANITIZER — CA7/C8 Defense-in-Depth
 * DOCTRINA: ZERO TOXIC HEADERS · NO OKHTTP EOF
 *
 * Eliminates headers that cause EOF, 304 empty, 400, 403, cache traps,
 * browser fingerprinting, or OkHttp/ExoPlayer incompatibility.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    // ═══ BANNED HEADERS — ABSOLUTE PROHIBITION ═══
    // These 6 headers are empirically confirmed destructive:
    // Range → 400/403 + EOF
    // If-None-Match → 304 + 0 bytes → okhttp EOF (THE WORST)
    // If-Modified-Since → 304 cache trap + 0 bytes
    // TE → 400 Bad Request on Xtream
    // Priority → 400 Bad Request on some providers
    // Upgrade-Insecure-Requests → 403 browser fingerprint
    const BANNED_HEADERS = new Set([
        'range',
        'if-none-match',
        'if-modified-since',
        'te',
        'priority',
        'upgrade-insecure-requests'
    ]);

    // ═══ ALLOWED HEADERS — SAFE WHITELIST ═══
    const ALLOWED_HEADERS = new Set([
        'user-agent',
        'accept',
        'accept-encoding',
        'accept-language',
        'connection',
        'cache-control',
        'pragma',
        'referer',
        'origin'
    ]);

    // ═══ FAKE METADATA HEADERS — Stripped silently ═══
    const FAKE_METADATA_RE = /^x-(cmaf|fmp4|lcevc|cortex|ape-internal)/i;

    /**
     * Sanitize HTTP headers for safe IPTV streaming.
     * Removes toxic headers, enforces Accept-Encoding: identity,
     * and audits every decision.
     *
     * @param {Object} headers - Raw header key-value pairs
     * @param {Object} [opts] - Options
     * @param {boolean} [opts.strictAllowlist=false] - If true, only allow whitelisted headers
     * @returns {{ headers: Object, audit: Object }}
     */
    function sanitizeExtHttpHeaders(headers, opts) {
        const strict = opts && opts.strictAllowlist;
        const out = {};
        const audit = {
            toxicHeadersRemoved: [],
            emptyHeadersRemoved: [],
            unknownHeadersRemoved: [],
            placeholdersRemoved: [],
            fakeMetadataRemoved: [],
            totalInput: 0,
            totalOutput: 0
        };

        const entries = Object.entries(headers || {});
        audit.totalInput = entries.length;

        for (let i = 0; i < entries.length; i++) {
            const originalKey = String(entries[i][0] || '').trim();
            const lk = originalKey.toLowerCase();
            const rawVal = entries[i][1];
            const v = String(rawVal == null ? '' : rawVal).trim();

            // Skip empty key or value
            if (!originalKey || !v) {
                audit.emptyHeadersRemoved.push(originalKey || '(empty)');
                continue;
            }

            // ABSOLUTE BAN — toxic headers
            if (BANNED_HEADERS.has(lk)) {
                audit.toxicHeadersRemoved.push(originalKey);
                continue;
            }

            // Strip fake metadata headers (X-CMAF, X-FMP4, X-LCEVC, X-Cortex)
            if (FAKE_METADATA_RE.test(originalKey)) {
                audit.fakeMetadataRemoved.push(originalKey);
                continue;
            }

            // Reject unresolved placeholders
            if (v.indexOf('{') !== -1 && v.indexOf('}') !== -1) {
                audit.placeholdersRemoved.push(originalKey);
                continue;
            }

            // In strict mode, reject unknown headers
            if (strict && !ALLOWED_HEADERS.has(lk)) {
                audit.unknownHeadersRemoved.push(originalKey);
                continue;
            }

            out[originalKey] = v;
        }

        // ═══ FORCED SAFE DEFAULTS ═══
        // Accept-Encoding MUST be identity — compressed segments can break players
        out['Accept-Encoding'] = 'identity';

        // Cache busting defaults (if not already set)
        if (!out['Cache-Control']) out['Cache-Control'] = 'no-cache';
        if (!out['Pragma']) out['Pragma'] = 'no-cache';

        audit.totalOutput = Object.keys(out).length;
        return { headers: out, audit: audit };
    }

    /**
     * Check if a single header key is toxic (banned).
     * @param {string} key
     * @returns {boolean}
     */
    function isToxicHeader(key) {
        return BANNED_HEADERS.has(String(key || '').trim().toLowerCase());
    }

    /**
     * Check if a single header key is in the safe allowlist.
     * @param {string} key
     * @returns {boolean}
     */
    function isAllowedHeader(key) {
        return ALLOWED_HEADERS.has(String(key || '').trim().toLowerCase());
    }

    /**
     * Sanitize a single EXTVLCOPT http-header line.
     * Example: "Range: bytes=0-" → blocked
     * Example: "User-Agent: Mozilla/5.0" → passed
     *
     * @param {string} headerLine - "Key: Value" format
     * @returns {{ key: string, value: string, blocked: boolean, reason: string|null }}
     */
    function sanitizeSingleHttpHeader(headerLine) {
        const raw = String(headerLine || '');
        const colonIdx = raw.indexOf(':');
        if (colonIdx <= 0) {
            return { key: '', value: '', blocked: true, reason: 'MALFORMED_NO_COLON' };
        }
        const key = raw.substring(0, colonIdx).trim();
        const value = raw.substring(colonIdx + 1).trim();
        const lk = key.toLowerCase();

        if (BANNED_HEADERS.has(lk)) {
            return { key: key, value: value, blocked: true, reason: 'CA7_C8_TOXIC_HEADER_BLOCKED' };
        }
        if (!value) {
            return { key: key, value: value, blocked: true, reason: 'EMPTY_VALUE' };
        }
        return { key: key, value: value, blocked: false, reason: null };
    }

    /**
     * Get list of all banned header names.
     * @returns {string[]}
     */
    function getBannedHeaderList() {
        return Array.from(BANNED_HEADERS);
    }

    /**
     * Get list of all allowed header names.
     * @returns {string[]}
     */
    function getAllowedHeaderList() {
        return Array.from(ALLOWED_HEADERS);
    }

    // ═══ EXPORT ═══
    const APEHttpHeaderSanitizer = {
        sanitizeExtHttpHeaders: sanitizeExtHttpHeaders,
        isToxicHeader: isToxicHeader,
        isAllowedHeader: isAllowedHeader,
        sanitizeSingleHttpHeader: sanitizeSingleHttpHeader,
        getBannedHeaderList: getBannedHeaderList,
        getAllowedHeaderList: getAllowedHeaderList,
        BANNED_HEADERS: BANNED_HEADERS,
        ALLOWED_HEADERS: ALLOWED_HEADERS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEHttpHeaderSanitizer;
    } else {
        global.APEHttpHeaderSanitizer = APEHttpHeaderSanitizer;
    }

})(typeof window !== 'undefined' ? window : globalThis);
