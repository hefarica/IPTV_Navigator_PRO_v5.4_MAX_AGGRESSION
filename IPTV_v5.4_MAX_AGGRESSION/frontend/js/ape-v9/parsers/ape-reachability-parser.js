/**
 * APE REACHABILITY PARSER — Async URL probe.
 *
 * Detects: HTTP status, content-type, redirect, timeout, HTML-instead-of-M3U8,
 * empty body, 304+empty body cache trap (project C8 incident root cause).
 *
 * The most critical detection: HTTP 304 with empty body. This is the
 * If-None-Match:* OkHttp EOF trap (memory feedback_exthttp_traps trap #9).
 *
 * Public:
 *   check(url, opts) → Promise<ReachResult>
 *   classifyStatus(httpStatus, contentType, bodyBytes) → errorClass
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const HTML_RE = /^\s*<(!doctype\s+html|html|body)/i;
    const M3U8_RE = /^\s*#EXTM3U/i;
    const XML_RE  = /^\s*<\?xml/i;

    function classifyStatus(httpStatus, contentType, bodySnippet) {
        const ct = String(contentType || '').toLowerCase();
        const body = String(bodySnippet || '');
        const status = Number(httpStatus) || 0;

        if (status === 304) {
            if (!body || body.length === 0) return 'CACHE_TRAP_304_EMPTY_BODY';
            return 'NOT_MODIFIED_OK';
        }
        if (status === 0)            return 'NETWORK_ERROR_OR_TIMEOUT';
        if (status === 401)          return 'AUTH_REQUIRED';
        if (status === 403)          return 'FORBIDDEN';
        if (status === 404)          return 'NOT_FOUND';
        if (status === 407)          return 'PROXY_AUTH_REQUIRED';
        if (status === 429)          return 'RATE_LIMITED';
        if (status >= 500)           return 'UPSTREAM_5XX';
        if (status === 200 && HTML_RE.test(body))                return 'HTML_INSTEAD_OF_MANIFEST';
        if (status === 200 && ct.indexOf('text/html') === 0)     return 'HTML_INSTEAD_OF_MANIFEST';
        if (status === 200 && body.length === 0)                 return 'EMPTY_BODY';
        if (status === 200 && M3U8_RE.test(body))                return 'OK_MANIFEST';
        if (status === 200 && XML_RE.test(body))                 return 'OK_XML';
        if (status >= 200 && status < 300)                       return 'OK_GENERIC';
        if (status >= 300 && status < 400)                       return 'REDIRECT';
        return 'UNKNOWN_STATUS_' + status;
    }

    /**
     * Probe a URL.
     * @param {string} url
     * @param {{ method?: string, timeoutMs?: number, headers?: Object, maxBytes?: number }} [opts]
     * @returns {Promise<Object>}
     */
    function check(url, opts) {
        opts = opts || {};
        const method    = opts.method || 'HEAD';
        const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 5000;
        const headers   = opts.headers || {};
        const maxBytes  = typeof opts.maxBytes === 'number' ? opts.maxBytes : 512;

        // CA7/C8: sanitize headers before sending — never reintroduce toxic headers
        let sendHeaders = headers;
        if (global.APEHttpHeaderSanitizer && typeof global.APEHttpHeaderSanitizer.sanitizeExtHttpHeaders === 'function') {
            sendHeaders = global.APEHttpHeaderSanitizer.sanitizeExtHttpHeaders(headers).headers;
        }

        if (typeof fetch !== 'function') {
            return Promise.resolve({
                url: url, reachable: false, httpStatus: 0, contentType: null,
                isManifest: false, isHtmlError: false, errorClass: 'FETCH_UNAVAILABLE',
                bytesProbed: 0, redirected: false, finalUrl: null
            });
        }

        const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
        const signal = ctrl ? ctrl.signal : undefined;
        const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;

        return fetch(url, { method: method, headers: sendHeaders, signal: signal, redirect: 'follow' })
            .then(function (resp) {
                const status     = resp.status;
                const ct         = resp.headers && resp.headers.get ? resp.headers.get('content-type') : null;
                const finalUrl   = resp.url || url;
                const redirected = !!resp.redirected;

                if (method === 'HEAD' || status === 204 || status === 304) {
                    if (timer) clearTimeout(timer);
                    const errorClass = classifyStatus(status, ct, '');
                    return {
                        url:         url,
                        finalUrl:    finalUrl,
                        reachable:   status >= 200 && status < 400,
                        httpStatus:  status,
                        contentType: ct,
                        isManifest:  false,
                        isHtmlError: false,
                        errorClass:  errorClass,
                        bytesProbed: 0,
                        redirected:  redirected
                    };
                }
                return resp.text().then(function (full) {
                    if (timer) clearTimeout(timer);
                    const snippet = full.substring(0, maxBytes);
                    const errorClass = classifyStatus(status, ct, snippet);
                    return {
                        url:         url,
                        finalUrl:    finalUrl,
                        reachable:   status >= 200 && status < 400,
                        httpStatus:  status,
                        contentType: ct,
                        isManifest:  M3U8_RE.test(snippet),
                        isHtmlError: HTML_RE.test(snippet),
                        errorClass:  errorClass,
                        bytesProbed: full.length,
                        redirected:  redirected
                    };
                });
            })
            .catch(function (err) {
                if (timer) clearTimeout(timer);
                const aborted = err && (err.name === 'AbortError' || /aborted/i.test(String(err.message)));
                return {
                    url:         url,
                    reachable:   false,
                    httpStatus:  0,
                    contentType: null,
                    isManifest:  false,
                    isHtmlError: false,
                    errorClass:  aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
                    bytesProbed: 0,
                    redirected:  false,
                    error:       String(err && err.message || err)
                };
            });
    }

    const APEReachabilityParser = {
        check:           check,
        classifyStatus:  classifyStatus
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEReachabilityParser;
    } else {
        global.APEReachabilityParser = APEReachabilityParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
