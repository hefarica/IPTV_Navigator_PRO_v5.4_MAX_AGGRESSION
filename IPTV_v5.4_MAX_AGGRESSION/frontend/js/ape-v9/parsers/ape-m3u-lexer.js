/**
 * APE M3U LEXER — Line-by-line tokenizer for M3U/M3U8/HLS playlists
 * Token types: EMPTY, COMMENT, EXT_DIRECTIVE, EXTINF, EXTGRP, EXTVLCOPT,
 *              KODIPROP, EXTHTTP, HLS_TAG, URI, JSON_INLINE, UNKNOWN
 *
 * Tracks line number, original text, current block, current channel.
 * Tolerant to commas in quotes, JSON embedded, URLs with tokens.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const TOKEN = {
        EMPTY:         'EMPTY',
        COMMENT:       'COMMENT',
        EXT_DIRECTIVE: 'EXT_DIRECTIVE',
        EXTINF:        'EXTINF',
        EXTGRP:        'EXTGRP',
        EXTVLCOPT:     'EXTVLCOPT',
        KODIPROP:      'KODIPROP',
        EXTHTTP:       'EXTHTTP',
        HLS_TAG:       'HLS_TAG',
        URI:           'URI',
        JSON_INLINE:   'JSON_INLINE',
        UNKNOWN:       'UNKNOWN'
    };

    const RE_URI = /^(https?|file|data|rtmp|rtsp|udp|rtp):\/\//i;
    const RE_REL = /^[./]|^[A-Za-z0-9_-]+\.(m3u8?|ts|m4s|mp4|aac|vtt)/i;

    function classifyLine(raw) {
        if (raw == null) return TOKEN.EMPTY;
        const line = String(raw).trim();
        if (!line) return TOKEN.EMPTY;

        if (line.charCodeAt(0) !== 35) {
            if (RE_URI.test(line) || RE_REL.test(line) || line.startsWith('/')) return TOKEN.URI;
            if (line.charCodeAt(0) === 123) return TOKEN.JSON_INLINE;
            return TOKEN.UNKNOWN;
        }

        if (line.startsWith('#EXTINF'))     return TOKEN.EXTINF;
        if (line.startsWith('#EXTGRP'))     return TOKEN.EXTGRP;
        if (line.startsWith('#EXTVLCOPT'))  return TOKEN.EXTVLCOPT;
        if (line.startsWith('#KODIPROP'))   return TOKEN.KODIPROP;
        if (line.startsWith('#EXTHTTP'))    return TOKEN.EXTHTTP;
        if (line.startsWith('#EXT-X-'))     return TOKEN.HLS_TAG;
        if (line.startsWith('#EXTM3U'))     return TOKEN.EXT_DIRECTIVE;
        if (line.startsWith('##'))          return TOKEN.COMMENT;
        if (line.startsWith('#'))           return TOKEN.COMMENT;

        return TOKEN.UNKNOWN;
    }

    function getTagName(line) {
        const colonIdx = line.indexOf(':');
        return colonIdx === -1 ? line : line.substring(0, colonIdx);
    }

    function getTagBody(line) {
        const colonIdx = line.indexOf(':');
        return colonIdx === -1 ? '' : line.substring(colonIdx + 1);
    }

    /**
     * Tokenize an M3U/M3U8 text into structured token objects.
     * @param {string} text - Raw playlist text
     * @param {Object} [opts]
     * @returns {{ tokens: Array, stats: Object }}
     */
    function tokenize(text, opts) {
        opts = opts || {};
        const includeEmpty = !!opts.includeEmpty;

        if (text == null) return { tokens: [], stats: { totalLines: 0, byType: {} } };
        if (text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

        const lines = String(text).split(/\r?\n/);
        const tokens = [];
        const byType = {};
        let currentBlock = null;     // 'master' | 'media' | 'flat' | null
        let currentChannel = null;   // running channel index

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const trimmed = raw == null ? '' : raw.trim();
            const type = classifyLine(trimmed);

            if (type === TOKEN.EMPTY && !includeEmpty) continue;

            // Block detection (heuristic, non-authoritative)
            if (type === TOKEN.HLS_TAG) {
                const tagName = getTagName(trimmed);
                if (tagName === '#EXT-X-STREAM-INF' || tagName === '#EXT-X-MEDIA' || tagName === '#EXT-X-I-FRAME-STREAM-INF') {
                    currentBlock = 'master';
                } else if (tagName === '#EXT-X-TARGETDURATION' || tagName === '#EXT-X-MEDIA-SEQUENCE' || tagName === '#EXTINF') {
                    if (currentBlock !== 'master') currentBlock = 'media';
                }
            }
            if (type === TOKEN.EXTINF && currentBlock !== 'master' && currentBlock !== 'media') {
                currentBlock = 'flat';
                currentChannel = (currentChannel == null) ? 0 : currentChannel + 1;
            }

            const token = {
                lineNo:    i + 1,
                raw:       raw,
                trimmed:   trimmed,
                type:      type,
                block:     currentBlock,
                channelIx: currentChannel
            };
            if (type === TOKEN.HLS_TAG || type === TOKEN.EXTINF ||
                type === TOKEN.EXTGRP || type === TOKEN.EXTVLCOPT ||
                type === TOKEN.KODIPROP || type === TOKEN.EXTHTTP ||
                type === TOKEN.EXT_DIRECTIVE) {
                token.tagName = getTagName(trimmed);
                token.tagBody = getTagBody(trimmed);
            }
            tokens.push(token);
            byType[type] = (byType[type] || 0) + 1;
        }

        return {
            tokens: tokens,
            stats: {
                totalLines: lines.length,
                emittedTokens: tokens.length,
                byType: byType
            }
        };
    }

    const APEM3ULexer = {
        TOKEN: TOKEN,
        tokenize: tokenize,
        classifyLine: classifyLine,
        getTagName: getTagName,
        getTagBody: getTagBody
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEM3ULexer;
    } else {
        global.APEM3ULexer = APEM3ULexer;
    }

})(typeof window !== 'undefined' ? window : globalThis);
