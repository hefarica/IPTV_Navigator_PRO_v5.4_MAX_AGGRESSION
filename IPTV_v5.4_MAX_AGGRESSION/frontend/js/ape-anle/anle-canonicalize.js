/**
 * ═══════════════════════════════════════════════════════════════
 * 🧬 ANLE — Canonicalize Helper
 * Adaptive Nomenclature Learning Engine v1.0
 * ═══════════════════════════════════════════════════════════════
 *
 * Pure function: NFD + lowercase + strip-diacritics + normalize-spaces.
 * Used as the universal token normalizer for all ANLE matching.
 *
 * Based on:
 *   - Dispatcharr#471 TVG-ID normalization (dot-strip + lowercase + space-normalize)
 *   - iptv-org canonical channel-id format <Name>.<cc>
 *
 * @version 1.0.0
 */
(function () {
    'use strict';

    const ANLE = window.ANLE = window.ANLE || {};

    /**
     * Canonicalize a string for dictionary matching.
     * - Decomposes accented characters (NFD) and strips combining marks
     * - Lowercases
     * - Removes dots (TVG-ID normalization)
     * - Collapses whitespace, underscores, hyphens into single space
     * - Strips non-word/non-space characters (preserves emoji as token boundary)
     * - Trims
     *
     * @param {string|null|undefined} s - Input string
     * @returns {string} Canonicalized string
     *
     * @example
     *   canonicalize('FOO1.xx')        → 'foo1xx'
     *   canonicalize('Canal Único')    → 'canal unico'
     *   canonicalize('🇨🇴 Caracol HD') → 'caracol hd' (emoji stripped, tokens preserved)
     */
    ANLE.canonicalize = function (s) {
        if (s == null) return '';
        return String(s)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')   // strip combining diacritical marks
            .toLowerCase()
            .replace(/\./g, '')                 // strip dots (TVG-ID compat)
            .replace(/[\s_\-]+/g, ' ')          // collapse whitespace/underscore/hyphen
            .replace(/[^\w\s]/g, '')            // strip non-word non-space (emoji, punctuation)
            .replace(/\s+/g, ' ')               // collapse multiple spaces
            .trim();
    };

    console.log('🧬 [ANLE] canonicalize loaded');
})();
