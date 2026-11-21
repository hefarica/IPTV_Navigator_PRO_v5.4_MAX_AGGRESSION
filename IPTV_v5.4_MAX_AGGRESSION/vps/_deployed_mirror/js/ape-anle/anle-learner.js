/**
 * ═══════════════════════════════════════════════════════════════
 * 🧬 ANLE — Nomenclature Learner
 * Adaptive Nomenclature Learning Engine v1.0
 * ═══════════════════════════════════════════════════════════════
 *
 * Consensus-based alias learning: observes post-classification
 * channels, extracts tokens, and promotes tokens to aliases
 * when they appear >= MIN_OCCURRENCES times with classification
 * confidence >= MIN_CONFIDENCE.
 *
 * @version 1.0.0
 */
(function () {
    'use strict';

    const ANLE = window.ANLE = window.ANLE || {};

    const MIN_CONFIDENCE = 0.7;
    const MIN_OCCURRENCES = 3;
    const MIN_TOKEN_LEN = 4; // Skip short tokens to reduce noise

    const STOPWORDS = new Set([
        'hd', 'sd', 'fhd', 'uhd', 'tv', 'channel', 'live', 'vod',
        'de', 'la', 'el', 'en', 'y', 'of', 'the', 'and', 'liga',
        'real', 'sports', 'sport', 'premium', 'plus', 'canal',
        'radio', 'news', 'mega', 'super', 'new', 'best', 'top',
        'star', 'gold', 'max', 'ultra', 'pro', 'extra', 'free'
    ]);

    // In-memory observation buffer (flushed at end of observeBatch)
    let buffer = new Map(); // token → { count, categories: Set, countries: Set, languages: Set }

    /**
     * Record a token observation from a classified channel.
     * @param {string} tok - Canonicalized token
     * @param {Object} ch - Channel with classification signals
     */
    function noteToken(tok, ch) {
        if (!buffer.has(tok)) {
            buffer.set(tok, {
                count: 0,
                categories: new Set(),
                countries: new Set(),
                languages: new Set()
            });
        }
        const entry = buffer.get(tok);
        entry.count++;

        // Capture classification signals
        if (ch._classCategory || ch.category) {
            entry.categories.add(ch._classCategory || ch.category);
        }
        if (ch.country && ch.country !== 'INT') {
            entry.countries.add(ch.country);
        }
        if (ch.language && ch.language !== 'MIX') {
            entry.languages.add(ch.language);
        }
    }

    ANLE.learner = {
        /**
         * Observe a batch of classified channels.
         * Extracts tokens from names of high-confidence channels,
         * accumulates counts, then flushes promotions.
         *
         * @param {Array<Object>} channels - Post-classification channels
         * @returns {Promise<number>} Count of newly promoted aliases
         */
        async observeBatch(channels) {
            const startTime = performance.now();

            for (const ch of channels) {
                // Only learn from channels classified with sufficient confidence
                const confidence = ch._classConfidence || ch.anleConfidence || 0;
                if (confidence < MIN_CONFIDENCE) continue;

                const tokens = ANLE.canonicalize(ch.name || '')
                    .split(/\s+/)
                    .filter(t => t.length >= MIN_TOKEN_LEN && !STOPWORDS.has(t));

                for (const t of tokens) {
                    noteToken(t, ch);
                }
            }

            const promoted = await this.flush();
            const elapsed = (performance.now() - startTime).toFixed(1);
            console.log(`🧬 [ANLE-Learner] Observed ${channels.length} channels in ${elapsed}ms, promoted ${promoted} tokens`);
            return promoted;
        },

        /**
         * Flush the buffer: promote tokens with sufficient evidence to aliases.
         * @returns {Promise<number>} Count of promoted aliases
         */
        async flush() {
            const promotions = [];

            for (const [tok, evidence] of buffer.entries()) {
                if (evidence.count < MIN_OCCURRENCES) continue;

                // Check if alias already exists (merge, don't overwrite)
                const existing = await ANLE.dictionary.getAlias(tok);

                const entry = {
                    id: tok,
                    canonical: existing?.canonical || tok.toUpperCase(),
                    variants: existing?.variants || [tok],
                    country: [...evidence.countries][0] || existing?.country || '',
                    languages: [...evidence.languages],
                    categories: [...evidence.categories],
                    weight: 25, // Learned weight (lower than seed)
                    source: 'learned',
                    learnedAt: Date.now(),
                    occurrences: (existing?.occurrences || 0) + evidence.count
                };

                // Merge variants if existing
                if (existing?.variants) {
                    const merged = new Set([...existing.variants, tok]);
                    entry.variants = [...merged];
                }

                promotions.push(entry);
            }

            if (promotions.length > 0) {
                await ANLE.dictionary.putAliasBulk(promotions);
                console.log(`🧬 [ANLE-Learner] Promoted ${promotions.length} tokens to aliases`);
            }

            buffer.clear();
            return promotions.length;
        },

        /**
         * Get current buffer size (for diagnostics).
         * @returns {number}
         */
        getBufferSize() {
            return buffer.size;
        }
    };

    console.log('🧬 [ANLE] learner loaded');
})();
