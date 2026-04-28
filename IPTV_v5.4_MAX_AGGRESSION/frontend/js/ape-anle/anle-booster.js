/**
 * ═══════════════════════════════════════════════════════════════
 * 🧬 ANLE — Score Booster Overlay
 * Adaptive Nomenclature Learning Engine v1.0
 * ═══════════════════════════════════════════════════════════════
 *
 * Reads the dictionary and computes boost scores for a channel.
 * NEVER mutates ch.country, ch.language, etc.
 * Writes ONLY to ch.anle (new namespace).
 *
 * @version 1.0.0
 */
(function () {
    'use strict';

    const ANLE = window.ANLE = window.ANLE || {};

    /**
     * Tokenize a string into words (>= 2 chars) using canonicalize.
     * @param {string} s
     * @returns {string[]}
     */
    function tokenize(s) {
        return ANLE.canonicalize(s).split(/\s+/).filter(t => t.length >= 2);
    }

    ANLE.booster = {
        /**
         * Weight constants for different match types.
         */
        WEIGHTS: {
            ALIAS_EXCLUSIVE: 35,
            GROUP_PATTERN: 25,
            PREFIX_FINGERPRINT: 20,
            CROSS_SERVER_CANONICAL: 30,
            EMOJI_FLAG: 15
        },

        /**
         * Compute boost scores for a channel.
         * Queries the dictionary for token matches and aggregates weights.
         *
         * FROZEN: does NOT mutate the input channel object.
         *
         * @param {Object} ch - Channel with { name, group_title, country, language }
         * @returns {Promise<Object>} { region_boost, lang_boost, category_boost, quality_boost,
         *                              learned_aliases_hit[], confidence_delta }
         */
        async computeBoost(ch) {
            const out = {
                region_boost: 0,
                lang_boost: 0,
                category_boost: 0,
                quality_boost: 0,
                learned_aliases_hit: [],
                confidence_delta: 0
            };

            if (!ch || !ch.name) return out;

            // Tokenize name and group_title
            const nameTokens = tokenize(ch.name);
            const groupTokens = tokenize(ch.group_title || ch.group || '');
            const allTokens = [...new Set([...nameTokens, ...groupTokens])];

            // Query dictionary for each unique token
            for (const tok of allTokens) {
                // Skip very short tokens (noise)
                if (tok.length < 3) continue;

                const hit = await ANLE.dictionary.queryByVariant(tok);
                if (!hit) continue;

                out.learned_aliases_hit.push({
                    token: tok,
                    canonical: hit.canonical,
                    weight: hit.weight || 0,
                    source: hit.source || 'unknown'
                });

                const w = hit.weight || this.WEIGHTS.ALIAS_EXCLUSIVE;

                if (hit.country) {
                    out.region_boost += w;
                }
                if (hit.languages && hit.languages.length > 0) {
                    out.lang_boost += w;
                }
                if (hit.categories && hit.categories.length > 0) {
                    out.category_boost += w;
                }
            }

            // Emoji flag bonus (🇨🇴 🇲🇽 etc.)
            const flagMatch = (ch.name || '').match(/[\u{1F1E6}-\u{1F1FF}]{2}/u);
            if (flagMatch) {
                out.region_boost += this.WEIGHTS.EMOJI_FLAG;
            }

            // Confidence delta = capped sum of all boosts
            out.confidence_delta = Math.min(50,
                out.region_boost + out.lang_boost + out.category_boost
            );

            return out;
        },

        /**
         * Merge base classification with boost.
         * Returns a NEW object — NEVER mutates the input channel.
         *
         * @param {Object} ch - Channel with base classification
         * @param {Object} boost - Output from computeBoost()
         * @returns {Object} Final classification overlay
         */
        merge(ch, boost) {
            return {
                country: ch.country,
                language: ch.language,
                category: ch.category,
                quality: ch.quality,
                anleConfidence: boost.confidence_delta,
                anleHits: boost.learned_aliases_hit,
                anleRegionBoost: boost.region_boost,
                anleLangBoost: boost.lang_boost,
                anleCategoryBoost: boost.category_boost
            };
        }
    };

    console.log('🧬 [ANLE] booster loaded');
})();
