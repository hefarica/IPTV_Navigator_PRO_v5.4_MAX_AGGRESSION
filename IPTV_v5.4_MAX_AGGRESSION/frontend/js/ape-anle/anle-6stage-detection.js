/**
 * ═══════════════════════════════════════════════════════════════
 * 🧬 ANLE — 6-Stage Media Type Detector
 * Adaptive Nomenclature Learning Engine v1.0
 * ═══════════════════════════════════════════════════════════════
 *
 * Based on: iptv-m3u-playlist-parser 6-stage media-type detection
 * model (100→50% confidence decay).
 *
 * Stages:
 *   1. Explicit tvg-type (100%)
 *   2. Group-title keyword (90%)
 *   3. Series pattern S01E02 (80%)
 *   4. URL path /live/ /vod/ (70%)
 *   5. HLS conservative (60%)
 *   6. Catchup fallback (50%)
 *
 * @version 1.0.0
 */
(function () {
    'use strict';

    const ANLE = window.ANLE = window.ANLE || {};

    const SERIES_RE = /(S\d{2}E\d{2})|(Season\s+\d+\s+Episode\s+\d+)|(\d+x\d{2})/i;

    const GROUP_KW = {
        live: ['live', 'en vivo', 'en directo', 'direct', 'canale', 'canales', 'channels', 'tv channels'],
        vod: ['vod', 'movies', 'peliculas', 'filmes', 'películas', 'cinema', 'cine', 'films', 'film'],
        series: ['series', 'tv shows', 'dizi', 'series tv', 'novelas', 'telenovelas', 'tv series'],
        radio: ['radio', 'rádio', 'fm', 'am']
    };

    /**
     * Check if canonicalized string contains any of the keywords.
     * @param {string} s - Raw string
     * @param {string[]} kws - Keywords to match
     * @returns {boolean}
     */
    function matchesAny(s, kws) {
        const c = ANLE.canonicalize(s);
        return kws.some(k => c.includes(k));
    }

    ANLE.detection = {
        /**
         * Detect media type using 6-stage confidence decay model.
         *
         * @param {Object} ch - Channel with { name, group_title, url, tvg-type, type, catchup, timeshift }
         * @returns {{ type: string, confidence: number, stage: number }}
         */
        detectMediaType(ch) {
            // ── Stage 1 (100%): Explicit tvg-type or type attribute ──
            const explicitType = ch['tvg-type'] || ch.type;
            if (explicitType) {
                const normalized = String(explicitType).toLowerCase().trim();
                if (['live', 'vod', 'series', 'radio', 'movie'].includes(normalized)) {
                    return {
                        type: normalized === 'movie' ? 'vod' : normalized,
                        confidence: 100,
                        stage: 1
                    };
                }
            }

            const name = String(ch.name || '');
            const grp = String(ch.group_title || ch.group || '');
            const url = String(ch.url || ch.stream_url || '');

            // ── Stage 2 (90%): Group-title keyword ──
            for (const [type, kws] of Object.entries(GROUP_KW)) {
                if (matchesAny(grp, kws)) {
                    return { type, confidence: 90, stage: 2 };
                }
            }

            // ── Stage 3 (80%): Series pattern in name ──
            if (SERIES_RE.test(name)) {
                return { type: 'series', confidence: 80, stage: 3 };
            }

            // ── Stage 4 (70%): URL path analysis ──
            if (/\/live\//i.test(url)) {
                return { type: 'live', confidence: 70, stage: 4 };
            }
            if (/\/(vod|movie|movies|film)\//i.test(url)) {
                return { type: 'vod', confidence: 70, stage: 4 };
            }
            if (/\/series\//i.test(url)) {
                return { type: 'series', confidence: 70, stage: 4 };
            }

            // ── Stage 5 (60%): HLS conservative ──
            if (/\.m3u8(\?|$)/.test(url)) {
                if (matchesAny(name, GROUP_KW.vod)) {
                    return { type: 'vod', confidence: 60, stage: 5 };
                }
                return { type: 'live', confidence: 60, stage: 5 };
            }
            if (/\.(mp4|mkv|avi|mov)(\?|$)/i.test(url)) {
                return { type: 'vod', confidence: 60, stage: 5 };
            }

            // ── Stage 6 (50%): Catchup/timeshift fallback ──
            if (ch.catchup || ch.timeshift || ch['catchup-source']) {
                return { type: 'live', confidence: 50, stage: 6 };
            }

            // ── No match ──
            return { type: 'unknown', confidence: 0, stage: 0 };
        }
    };

    console.log('🧬 [ANLE] 6-stage detection loaded');
})();
