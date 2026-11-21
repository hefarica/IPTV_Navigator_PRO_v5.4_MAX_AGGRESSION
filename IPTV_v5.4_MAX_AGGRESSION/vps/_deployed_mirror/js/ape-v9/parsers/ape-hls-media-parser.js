/**
 * APE HLS MEDIA PLAYLIST PARSER — Walks an HLS media playlist line by line.
 * Detects container (fMP4/CMAF if EXT-X-MAP + .m4s/init.mp4, otherwise MPEG-TS),
 * playlist type (live/vod/event), segments and discontinuities.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    function parseAttrList(body) {
        if (global.APEHlsAttributeParser && typeof global.APEHlsAttributeParser.parseAttrList === 'function') {
            return global.APEHlsAttributeParser.parseAttrList(body).attrs;
        }
        const attrs = {};
        const re = /([A-Z0-9][A-Z0-9-]*)\s*=\s*("(?:[^"\\]|\\.)*"|[^,]+)/g;
        let m;
        while ((m = re.exec(body)) !== null) {
            let v = m[2];
            if (v && v.charCodeAt(0) === 34) v = v.slice(1, -1);
            attrs[m[1]] = v;
        }
        return attrs;
    }

    function detectSegmentContainer(uri, hasMap, mapUri) {
        if (!uri && !mapUri) return { container: 'UNKNOWN', verified: false, evidence: null };
        const u = (uri || '').toLowerCase();
        const mu = (mapUri || '').toLowerCase();
        if (hasMap && (mu.indexOf('.mp4') !== -1 || mu.indexOf('init.mp4') !== -1 || mu.indexOf('init.cmfv') !== -1)) {
            return { container: 'FMP4_CMAF', verified: true, evidence: 'EXT-X-MAP+init.mp4' };
        }
        if (hasMap && (u.indexOf('.m4s') !== -1 || u.indexOf('.cmfv') !== -1 || u.indexOf('.cmfa') !== -1)) {
            return { container: 'FMP4_CMAF', verified: true, evidence: 'EXT-X-MAP+.m4s' };
        }
        if (u.indexOf('.ts') !== -1 || u.indexOf('.tsa') !== -1 || u.indexOf('.tsv') !== -1) {
            return { container: 'MPEG_TS', verified: true, evidence: '.ts segment' };
        }
        if (u.indexOf('.aac') !== -1 || u.indexOf('.mp3') !== -1) {
            return { container: 'AUDIO_ONLY', verified: true, evidence: 'audio extension' };
        }
        return { container: 'UNKNOWN', verified: false, evidence: null };
    }

    /**
     * @param {string} text
     * @param {Object} [opts]
     * @returns {Object}
     */
    function parseMedia(text, opts) {
        opts = opts || {};

        const out = {
            type:                  'media',
            version:               null,
            targetDuration:        null,
            mediaSequence:         0,
            discontinuitySequence: 0,
            independentSegments:   false,
            playlistType:          null,
            endlist:               false,
            iFramesOnly:           false,
            map:                   null,
            key:                   null,
            segments:              [],
            programDateTime:       null,
            container:             { type: 'UNKNOWN', verified: false, evidence: null },
            lowLatency:            null,
            errors:                [],
            warnings:              []
        };

        if (text == null) { out.errors.push('null input'); return out; }
        if (text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = String(text).split(/\r?\n/);

        let pendingSegment = null;
        let hasMap = false;
        let firstSegUri = null;
        let durations = 0;
        let count = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith('#EXT-X-VERSION:'))               { out.version = parseInt(line.substring(15), 10) || null; continue; }
            if (line.startsWith('#EXT-X-TARGETDURATION:'))        { out.targetDuration = parseInt(line.substring(22), 10) || null; continue; }
            if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:'))        { out.mediaSequence = parseInt(line.substring(22), 10) || 0; continue; }
            if (line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:')){ out.discontinuitySequence = parseInt(line.substring(30), 10) || 0; continue; }
            if (line.startsWith('#EXT-X-INDEPENDENT-SEGMENTS'))   { out.independentSegments = true; continue; }
            if (line.startsWith('#EXT-X-PLAYLIST-TYPE:'))         { out.playlistType = line.substring(21).trim().toUpperCase(); continue; }
            if (line.startsWith('#EXT-X-I-FRAMES-ONLY'))          { out.iFramesOnly = true; continue; }
            if (line.startsWith('#EXT-X-ENDLIST'))                { out.endlist = true; continue; }
            if (line.startsWith('#EXT-X-MAP:'))                   { out.map = parseAttrList(line.substring(11)); hasMap = true; continue; }
            if (line.startsWith('#EXT-X-KEY:'))                   { out.key = parseAttrList(line.substring(11)); continue; }
            if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:'))     {
                const v = line.substring(25).trim();
                if (out.programDateTime == null) out.programDateTime = v;
                if (pendingSegment) pendingSegment.programDateTime = v;
                continue;
            }
            if (line.startsWith('#EXTINF:')) {
                const body = line.substring(8);
                const commaIdx = body.indexOf(',');
                const dur = parseFloat(commaIdx === -1 ? body : body.substring(0, commaIdx)) || 0;
                pendingSegment = { duration: dur, title: commaIdx === -1 ? '' : body.substring(commaIdx + 1).trim(), uri: null };
                continue;
            }
            if (line.startsWith('#EXT-X-BYTERANGE:')) {
                if (pendingSegment) pendingSegment.byteRange = line.substring(17).trim();
                continue;
            }
            if (line.startsWith('#EXT-X-DISCONTINUITY')) {
                if (pendingSegment) pendingSegment.discontinuity = true;
                else out.segments.push({ discontinuityMarker: true });
                continue;
            }
            if (line.startsWith('#EXT-X-PART-INF') || line.startsWith('#EXT-X-PART:') ||
                line.startsWith('#EXT-X-PRELOAD-HINT') || line.startsWith('#EXT-X-SERVER-CONTROL')) {
                out.lowLatency = out.lowLatency || { detected: true };
                continue;
            }
            if (line.startsWith('#')) continue;

            if (pendingSegment) {
                pendingSegment.uri = line;
                out.segments.push(pendingSegment);
                if (!firstSegUri) firstSegUri = line;
                durations += pendingSegment.duration;
                count++;
                pendingSegment = null;
            }
        }

        const det = detectSegmentContainer(firstSegUri, hasMap, out.map ? out.map.URI : null);
        out.container = { type: det.container, verified: det.verified, evidence: det.evidence };
        out.stats = {
            segments:      count,
            avgDuration:   count > 0 ? durations / count : 0,
            totalDuration: durations,
            live:          !out.endlist,
            vod:           out.endlist && out.playlistType === 'VOD',
            event:         out.playlistType === 'EVENT'
        };

        return out;
    }

    const APEHlsMediaParser = {
        parseMedia:              parseMedia,
        detectSegmentContainer:  detectSegmentContainer
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEHlsMediaParser;
    } else {
        global.APEHlsMediaParser = APEHlsMediaParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
