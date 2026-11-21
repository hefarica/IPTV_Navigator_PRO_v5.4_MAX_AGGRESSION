/**
 * ═══════════════════════════════════════════════════════════════
 * 🧬 ANLE — Seed Syncer
 * Adaptive Nomenclature Learning Engine v1.0
 * ═══════════════════════════════════════════════════════════════
 *
 * Seeds the dictionary from iptv-org/api channels.json (~10K canonical entries).
 * Falls back to embedded ANLE_SEED_FALLBACK.json if remote unavailable.
 * 30-day TTL — only re-fetches if stale.
 *
 * @version 1.0.0
 */
(function () {
    'use strict';

    const ANLE = window.ANLE = window.ANLE || {};
    const SEED_URL = 'https://iptv-org.github.io/api/channels.json';
    const FALLBACK_URL = 'js/ape-anle/ANLE_SEED_FALLBACK.json';
    const TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
    const LS_KEY = 'anle.seed.lastSync';

    /**
     * Convert iptv-org channel entry to ANLE alias format.
     * @param {Object} c - iptv-org channel { id, name, country, languages, categories, alt_names }
     * @returns {Object} ANLE alias entry
     */
    function entryToAlias(c) {
        const country = (c.country || '').toLowerCase();
        const languages = c.languages || [];
        const categories = c.categories || [];
        const altNames = c.alt_names || [];

        // Build variants: name, id, alt_names (all canonicalized on storage)
        const variants = [c.name, c.id, ...altNames].filter(Boolean);

        return {
            id: ANLE.canonicalize(c.id || `${c.name}.${country}`),
            canonical: c.name,
            variants: variants,
            country: country,
            languages: languages,
            categories: categories,
            source: 'iptv-org-seed',
            weight: 30,
            seededAt: Date.now()
        };
    }

    ANLE.seedSyncer = {
        /**
         * Sync from remote iptv-org API.
         * Falls back to local JSON on failure.
         * @returns {Promise<number>} count of aliases synced
         */
        async syncFromRemote() {
            try {
                console.log('🧬 [ANLE-Seed] Fetching from iptv-org...');
                const res = await fetch(SEED_URL, { cache: 'no-cache' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();

                // Limit to first 2000 for performance (still huge seed)
                const aliases = data.slice(0, 2000).map(entryToAlias);
                const n = await ANLE.dictionary.putAliasBulk(aliases);

                localStorage.setItem(LS_KEY, String(Date.now()));
                console.log(`🧬 [ANLE-Seed] Synced ${n} aliases from iptv-org (${data.length} total available)`);
                return n;
            } catch (e) {
                console.warn('🧬 [ANLE-Seed] Remote failed, falling back:', e.message);
                return this.loadFallback();
            }
        },

        /**
         * Load from embedded offline fallback JSON.
         * @returns {Promise<number>} count loaded
         */
        async loadFallback() {
            try {
                const res = await fetch(FALLBACK_URL);
                if (!res.ok) throw new Error(`Fallback HTTP ${res.status}`);
                const data = await res.json();
                const aliases = data.map(entryToAlias);
                const n = await ANLE.dictionary.putAliasBulk(aliases);
                console.log(`🧬 [ANLE-Seed] Loaded ${n} fallback aliases`);
                return n;
            } catch (e) {
                console.error('🧬 [ANLE-Seed] Both remote and fallback failed:', e.message);
                return 0;
            }
        },

        /**
         * Ensure dictionary has fresh seed data.
         * Only re-syncs if TTL expired or dictionary empty.
         * @returns {Promise<number>} alias count
         */
        async ensureFresh() {
            const last = parseInt(localStorage.getItem(LS_KEY) || '0');
            const isStale = (Date.now() - last) > TTL_MS;

            const stats = await ANLE.dictionary.stats();
            const isEmpty = stats.aliases === 0;

            if (isStale || isEmpty) {
                return this.syncFromRemote();
            }

            console.log(`🧬 [ANLE-Seed] Dictionary fresh (${stats.aliases} aliases, last sync ${new Date(last).toISOString()})`);
            return stats.aliases;
        }
    };

    console.log('🧬 [ANLE] seed-syncer loaded');
})();
