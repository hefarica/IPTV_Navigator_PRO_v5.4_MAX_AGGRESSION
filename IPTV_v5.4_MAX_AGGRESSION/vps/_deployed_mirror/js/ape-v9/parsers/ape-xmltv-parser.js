/**
 * APE XMLTV PARSER — Async fetch + lightweight XML walker for XMLTV EPG feeds.
 *
 * Public API:
 *   fetchXmltv(url, opts) → Promise<{channels, programmes, stats}>
 *   parseXmltvText(text)  → {channels, programmes, stats}
 *   buildTvgIdMap(parsed) → { tvgId: channel }
 *
 * The parser is intentionally tolerant. Heavy XML validation is out of scope.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    function decodeEntities(s) {
        if (!s) return s;
        return String(s)
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    }

    function parseAttrs(tagSnippet) {
        const attrs = {};
        const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
        let m;
        while ((m = re.exec(tagSnippet)) !== null) attrs[m[1]] = decodeEntities(m[2]);
        return attrs;
    }

    function extractChildren(blockText, tagName) {
        const children = [];
        const re = new RegExp('<' + tagName + '(\\s[^>]*)?>([\\s\\S]*?)<\\/' + tagName + '>', 'gi');
        let m;
        while ((m = re.exec(blockText)) !== null) {
            children.push({
                attrs: parseAttrs(m[1] || ''),
                text:  decodeEntities((m[2] || '').trim())
            });
        }
        return children;
    }

    /**
     * Parse an XMLTV text payload.
     */
    function parseXmltvText(text) {
        const out = { channels: [], programmes: [], stats: { channels: 0, programmes: 0 } };
        if (!text || typeof text !== 'string') return out;

        const channelRe = /<channel(\s[^>]*)?>([\s\S]*?)<\/channel>/gi;
        let cm;
        while ((cm = channelRe.exec(text)) !== null) {
            const attrs = parseAttrs(cm[1] || '');
            const body  = cm[2] || '';
            const displayNames = extractChildren(body, 'display-name').map(function (c) { return c.text; });
            const iconMatch    = /<icon\s[^>]*src="([^"]+)"/i.exec(body);
            out.channels.push({
                id:           attrs.id || null,
                displayName:  displayNames[0] || null,
                displayNames: displayNames,
                icon:         iconMatch ? decodeEntities(iconMatch[1]) : null
            });
        }

        const progRe = /<programme(\s[^>]*)?>([\s\S]*?)<\/programme>/gi;
        let pm;
        while ((pm = progRe.exec(text)) !== null) {
            const attrs = parseAttrs(pm[1] || '');
            const body  = pm[2] || '';
            const titleMatch    = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i.exec(body);
            const descMatch     = /<desc(?:\s[^>]*)?>([\s\S]*?)<\/desc>/i.exec(body);
            const categoryMatch = /<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/i.exec(body);
            const episodeMatch  = /<episode-num(?:\s[^>]*)?>([\s\S]*?)<\/episode-num>/i.exec(body);
            out.programmes.push({
                channel:    attrs.channel || null,
                start:      attrs.start || null,
                stop:       attrs.stop || null,
                title:      titleMatch    ? decodeEntities(titleMatch[1].trim())    : null,
                desc:       descMatch     ? decodeEntities(descMatch[1].trim())     : null,
                category:   categoryMatch ? decodeEntities(categoryMatch[1].trim()) : null,
                episodeNum: episodeMatch  ? decodeEntities(episodeMatch[1].trim())  : null
            });
        }

        out.stats.channels   = out.channels.length;
        out.stats.programmes = out.programmes.length;
        return out;
    }

    function buildTvgIdMap(parsed) {
        const map = {};
        if (!parsed || !Array.isArray(parsed.channels)) return map;
        for (let i = 0; i < parsed.channels.length; i++) {
            const ch = parsed.channels[i];
            if (ch.id) map[ch.id] = ch;
        }
        return map;
    }

    /**
     * Async fetch + parse XMLTV feed with timeout.
     * @param {string} url
     * @param {{ timeoutMs?: number, headers?: Object }} [opts]
     * @returns {Promise<Object>}
     */
    function fetchXmltv(url, opts) {
        opts = opts || {};
        const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 5000;
        const headers   = opts.headers || {};

        if (typeof fetch !== 'function') {
            return Promise.reject(new Error('fetch unavailable'));
        }

        const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
        const signal = ctrl ? ctrl.signal : undefined;
        const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;

        return fetch(url, { headers: headers, signal: signal })
            .then(function (resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.text();
            })
            .then(function (text) {
                if (timer) clearTimeout(timer);
                const parsed = parseXmltvText(text);
                parsed.url = url;
                parsed.bytes = text.length;
                return parsed;
            })
            .catch(function (err) {
                if (timer) clearTimeout(timer);
                return { channels: [], programmes: [], stats: { channels: 0, programmes: 0 }, error: String(err && err.message || err) };
            });
    }

    const APEXmltvParser = {
        parseXmltvText: parseXmltvText,
        fetchXmltv:     fetchXmltv,
        buildTvgIdMap:  buildTvgIdMap
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEXmltvParser;
    } else {
        global.APEXmltvParser = APEXmltvParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
