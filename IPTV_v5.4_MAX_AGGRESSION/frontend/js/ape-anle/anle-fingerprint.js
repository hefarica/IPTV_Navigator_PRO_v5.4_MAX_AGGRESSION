/**
 * ═══════════════════════════════════════════════════════════════
 * 🧬 ANLE — Server Fingerprint Extractor
 * Adaptive Nomenclature Learning Engine v1.0
 * ═══════════════════════════════════════════════════════════════
 *
 * Analyzes a server's channel naming patterns on first connect.
 * Extracts: ISO prefixes, separators, group-title clusters,
 * emoji flags, token frequency — builds a nomenclature profile.
 *
 * @version 1.0.0
 */
(function () {
    'use strict';

    const ANLE = window.ANLE = window.ANLE || {};

    const PREFIX_RE = /^([A-Z]{2,5})[:|┃\s\-·—]/;
    const SEPARATORS = ['|', ':', '—', '-', '·', '┃'];
    const FLAG_RE = /([\u{1F1E6}-\u{1F1FF}]{2})/gu;
    const STOPWORDS = new Set([
        'hd', 'sd', 'fhd', 'uhd', '4k', '8k', 'tv', 'channel', 'live', 'vod',
        'de', 'la', 'el', 'en', 'y', 'of', 'the', 'and', 'les', 'le', 'un',
        'des', 'du', 'sur', 'par', 'und', 'der', 'die', 'das'
    ]);

    /**
     * Convert emoji flag pair to ISO 3166-1 alpha-2 country code.
     * @param {string} flag - Two regional indicator characters
     * @returns {string|null} Lowercase 2-letter code or null
     */
    function flagToCC(flag) {
        const cps = [...flag];
        if (cps.length !== 2) return null;
        const a = cps[0].codePointAt(0) - 0x1F1E6 + 65;
        const b = cps[1].codePointAt(0) - 0x1F1E6 + 65;
        if (a < 65 || a > 90 || b < 65 || b > 90) return null;
        return String.fromCharCode(a, b).toLowerCase();
    }

    ANLE.fingerprint = {
        /**
         * Extract nomenclature fingerprint from a sample of server channels.
         * Designed to run synchronously on first ~5000 channels.
         *
         * @param {string} serverId - Server identifier
         * @param {Array<Object>} channels - Array of { name, group_title }
         * @returns {Object} Fingerprint object (persistable via dictionary.putFingerprint)
         */
        extract(serverId, channels) {
            const sample = channels.slice(0, 5000);
            const prefixes = {};
            const separatorCounts = {};
            const groupPatterns = {};
            const tokenFreq = {};
            const flagCountries = {};

            for (const ch of sample) {
                const name = String(ch.name || '');
                const grp = String(ch.group_title || ch.group || '');

                // ── Prefix extraction ──
                const pm = name.match(PREFIX_RE);
                if (pm) {
                    const k = pm[1].toLowerCase();
                    if (!prefixes[k]) prefixes[k] = { count: 0, examples: [] };
                    prefixes[k].count++;
                    if (prefixes[k].examples.length < 3) {
                        prefixes[k].examples.push(name.substring(0, 60));
                    }
                }

                // ── Separator detection ──
                for (const sep of SEPARATORS) {
                    if (name.includes(sep)) {
                        separatorCounts[sep] = (separatorCounts[sep] || 0) + 1;
                    }
                }

                // ── Group-title clustering ──
                if (grp) {
                    const c = ANLE.canonicalize(grp);
                    if (c) groupPatterns[c] = (groupPatterns[c] || 0) + 1;
                }

                // ── Token frequency ──
                const tokens = ANLE.canonicalize(name).split(/\s+/);
                for (const t of tokens) {
                    if (t.length < 3 || STOPWORDS.has(t)) continue;
                    tokenFreq[t] = (tokenFreq[t] || 0) + 1;
                }

                // ── Emoji flag extraction ──
                FLAG_RE.lastIndex = 0;
                let m;
                while ((m = FLAG_RE.exec(name + ' ' + grp))) {
                    const cc = flagToCC(m[1]);
                    if (cc) flagCountries[cc] = (flagCountries[cc] || 0) + 1;
                }
            }

            // Determine dominant separator
            const sortedSeps = Object.entries(separatorCounts).sort((a, b) => b[1] - a[1]);
            const dominantSep = sortedSeps[0]?.[0] || '|';

            // Top tokens (excluding noise)
            const topTokens = Object.entries(tokenFreq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 200);

            return {
                serverId,
                samplesAnalyzed: sample.length,
                prefixes,
                separators: Object.keys(separatorCounts),
                dominantSeparator: dominantSep,
                groupPatterns,
                topTokens,
                flagCountries,
                confidence: Math.min(1, sample.length / 5000),
                lastUpdated: new Date().toISOString()
            };
        },

        /**
         * Extract and persist fingerprint for a server.
         * @param {string} serverId
         * @param {Array<Object>} channels
         * @returns {Promise<Object>} The extracted fingerprint
         */
        async extractAndPersist(serverId, channels) {
            const fp = this.extract(serverId, channels);
            await ANLE.dictionary.putFingerprint(fp);
            console.log(`🧬 [ANLE-FP] Server "${serverId}": ${fp.samplesAnalyzed} sampled, ` +
                `${Object.keys(fp.prefixes).length} prefixes, ` +
                `${Object.keys(fp.flagCountries).length} flags, ` +
                `separator: "${fp.dominantSeparator}"`);
            return fp;
        }
    };

    console.log('🧬 [ANLE] fingerprint loaded');
})();
