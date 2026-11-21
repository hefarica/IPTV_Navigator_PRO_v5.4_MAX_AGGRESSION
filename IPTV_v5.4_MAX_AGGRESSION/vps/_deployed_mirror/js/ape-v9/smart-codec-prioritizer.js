/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎬 SMART CODEC PRIORITIZER v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Intelligent codec prioritization for M3U8 generation.
 * Ensures HEVC/H.265 is the primary recommendation while enabling
 * automatic detection and selection of superior codecs (like AV1).
 * 
 * HIERARCHY: AV1 > H265 > VP9 > H264 > MPEG2
 * 
 * AUTHOR: APE Engine Team - IPTV Navigator PRO
 * VERSION: 1.0.0
 * DATE: 2026-01-28
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CODEC HIERARCHY MATRIX
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Codec efficiency hierarchy (Best to Worst)
     * 1️⃣ AV1   - Maximum efficiency, 50% better than H.264
     * 2️⃣ H.265 - Very efficient, 50% better than H.264 ← PRIMARY PREFERENCE
     * 3️⃣ VP9   - Efficient, 30% better than H.264
     * 4️⃣ H.264 - Universal standard, compatible with everything
     * 5️⃣ MPEG2 - Obsolete, avoid if possible
     */
    const CODEC_HIERARCHY = {
        'AV1': ['av1', 'hevc', 'vp9', 'h264', 'mpeg2'],
        'H265': ['hevc', 'av1', 'vp9', 'h264', 'mpeg2'],
        'HEVC': ['hevc', 'av1', 'vp9', 'h264', 'mpeg2'], // Alias
        'VP9': ['vp9', 'hevc', 'av1', 'h264', 'mpeg2'],
        'H264': ['h264', 'hevc', 'av1', 'vp9', 'mpeg2'],
        'AVC': ['h264', 'hevc', 'av1', 'vp9', 'mpeg2'], // Alias
        'MPEG2': ['mpeg2', 'h264', 'hevc', 'av1', 'vp9']
    };

    /**
     * Codec display names for metadata
     */
    const CODEC_DISPLAY_NAMES = {
        'av1': 'AV1',
        'hevc': 'HEVC',
        'h265': 'HEVC',
        'vp9': 'VP9',
        'h264': 'H264',
        'avc': 'H264',
        'mpeg2': 'MPEG2'
    };

    /**
     * Codec efficiency ratings (for logging/debugging)
     */
    const CODEC_EFFICIENCY = {
        'av1': { rating: 5, description: 'Eco Max - 50% better than H.264' },
        'hevc': { rating: 4, description: 'Eco - 50% better than H.264' },
        'vp9': { rating: 3, description: 'Google - 30% better than H.264' },
        'h264': { rating: 2, description: 'Pro - Universal standard' },
        'mpeg2': { rating: 1, description: 'Legacy - Obsolete' }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // SMART CODEC PRIORITIZER CLASS
    // ═══════════════════════════════════════════════════════════════════════

    class SmartCodecPrioritizer {
        constructor() {
            this.cache = new Map(); // Cache for server codec detection
            console.log('%c🎬 Smart Codec Prioritizer v1.0.0 Loaded', 'color: #10b981; font-weight: bold;');
        }

        /**
         * Get the codec priority chain based on user selection
         * @param {string} selectedCodec - User's codec selection (AV1, H265, VP9, H264, MPEG2)
         * @returns {string[]} Array of codecs in priority order
         */
        getPriorityChain(selectedCodec) {
            const normalized = (selectedCodec || 'H265').toUpperCase();
            return CODEC_HIERARCHY[normalized] || CODEC_HIERARCHY['H265'];
        }

        /**
         * Build the X-Video-Codecs header with intelligent prioritization
         * @param {string} selectedCodec - User's codec selection
         * @param {string[]} availableCodecs - Codecs available on server (optional)
         * @returns {string} Formatted header value: "av1,hevc,vp9,h264,mpeg2"
         */
        buildCodecHeader(selectedCodec, availableCodecs = null) {
            const priority = this.getPriorityChain(selectedCodec);

            // If we have availability data, filter and reorder
            if (availableCodecs && Array.isArray(availableCodecs) && availableCodecs.length > 0) {
                const normalizedAvailable = availableCodecs.map(c => c.toLowerCase());

                // Filter to only available codecs, maintaining priority order
                const filteredPriority = priority.filter(c => normalizedAvailable.includes(c));

                // Apply intelligent upgrade rule
                const upgraded = this._applyIntelligentUpgrade(selectedCodec, filteredPriority);

                return upgraded.join(',');
            }

            // Default: return full priority chain
            return priority.join(',');
        }

        /**
         * Apply intelligent upgrade: If a better codec is available, use it
         * @private
         */
        _applyIntelligentUpgrade(selectedCodec, availablePriority) {
            if (availablePriority.length === 0) return ['h264']; // Universal fallback

            const normalized = (selectedCodec || 'H265').toUpperCase();
            const selectedIndex = this._getCodecRank(normalized);

            // Check if we have something better than what user selected
            const bestAvailable = availablePriority[0];
            const bestRank = this._getCodecRank(bestAvailable.toUpperCase());

            if (bestRank > selectedIndex) {
                console.log(`%c🔄 [CODEC] Intelligent Upgrade: ${normalized} → ${bestAvailable.toUpperCase()}`, 'color: #3b82f6;');
            }

            return availablePriority;
        }

        /**
         * Get codec rank (higher = better)
         * @private
         */
        _getCodecRank(codec) {
            const ranks = { 'AV1': 5, 'H265': 4, 'HEVC': 4, 'VP9': 3, 'H264': 2, 'AVC': 2, 'MPEG2': 1 };
            return ranks[codec.toUpperCase()] || 2;
        }

        /**
         * Build the full X-Video-Codecs header string for URL insertion
         * @param {string} selectedCodec - User's codec selection
         * @param {string[]} availableCodecs - Optional server availability
         * @returns {string} "X-Video-Codecs=hevc,av1,vp9,h264,mpeg2"
         */
        buildFullHeader(selectedCodec, availableCodecs = null) {
            const value = this.buildCodecHeader(selectedCodec, availableCodecs);
            return `X-Video-Codecs=${value}`;
        }

        /**
         * Generate APE metadata tags for M3U8 output
         * @param {string} selectedCodec - User's codec selection
         * @param {string[]} availableCodecs - Optional server availability
         * @returns {object} Object with all metadata keys
         */
        generateMetadata(selectedCodec, availableCodecs = null) {
            const priority = this.buildCodecHeader(selectedCodec, availableCodecs);
            const primaryCodec = priority.split(',')[0] || 'hevc';
            const fallbackCodec = priority.split(',').find(c => c === 'h264') || 'h264';

            return {
                primary: CODEC_DISPLAY_NAMES[primaryCodec] || primaryCodec.toUpperCase(),
                fallback: CODEC_DISPLAY_NAMES[fallbackCodec] || fallbackCodec.toUpperCase(),
                priority: priority,
                method: availableCodecs ? 'intelligent_detection' : 'intelligent',
                detection: 'enabled'
            };
        }

        /**
         * Build M3U8 metadata comment lines
         * @param {string} selectedCodec - User's codec selection
         * @param {string[]} availableCodecs - Optional server availability
         * @returns {string} Multi-line string with EXT-X-APE-CODEC-* tags
         */
        buildMetadataLines(selectedCodec, availableCodecs = null) {
            const meta = this.generateMetadata(selectedCodec, availableCodecs);
            return [
                `#EXT-X-APE-CODEC-PRIMARY:${meta.primary}`,
                `#EXT-X-APE-CODEC-FALLBACK:${meta.fallback}`,
                `#EXT-X-APE-CODEC-PRIORITY:${meta.priority}`,
                `#EXT-X-APE-CODEC-SELECTION-METHOD:${meta.method}`,
                `#EXT-X-APE-CODEC-DETECTION:${meta.detection}`
            ].join('\n');
        }

        /**
         * Insert codec header into a streaming URL
         * @param {string} url - Base URL (may already have headers)
         * @param {string} selectedCodec - User's codec selection
         * @param {string[]} availableCodecs - Optional server availability
         * @returns {string} URL with X-Video-Codecs header appended
         */
        injectIntoUrl(url, selectedCodec, availableCodecs = null) {
            if (!url) return url;

            const header = this.buildFullHeader(selectedCodec, availableCodecs);

            // Check if URL already has pipe headers
            if (url.includes('|')) {
                // Append to existing headers
                if (url.includes('X-Video-Codecs=')) {
                    // Replace existing codec header
                    return url.replace(/X-Video-Codecs=[^&|]+/, header);
                }
                return `${url}&${header}`;
            } else {
                // Add pipe and header
                return `${url}|${header}`;
            }
        }

        /**
         * Get current codec selection from Profile Manager
         * @returns {string} Current codec selection (default: H265)
         */
        getCurrentSelection() {
            // Try to read from Profile Manager
            if (window.ProfileManagerV9 && typeof window.ProfileManagerV9.getActiveProfile === 'function') {
                const profile = window.ProfileManagerV9.getActiveProfile();
                if (profile && profile.settings && profile.settings.codec) {
                    return profile.settings.codec;
                }
            }

            // Try to read from DOM element directly
            const codecSelect = document.getElementById('pm9_codec');
            if (codecSelect) {
                return codecSelect.value || 'H265';
            }

            // Default
            return 'H265';
        }

        /**
         * Get codec info for UI display
         * @param {string} codec - Codec name
         * @returns {object} Efficiency info
         */
        getCodecInfo(codec) {
            const normalized = (codec || 'h264').toLowerCase();
            return CODEC_EFFICIENCY[normalized] || CODEC_EFFICIENCY['h264'];
        }

        /**
         * Validate a codec header string
         * @param {string} headerValue - The value of X-Video-Codecs
         * @returns {object} Validation result
         */
        validateHeader(headerValue) {
            if (!headerValue) {
                return { valid: false, error: 'Empty header value' };
            }

            const codecs = headerValue.split(',');
            const validCodecs = ['av1', 'hevc', 'h265', 'vp9', 'h264', 'avc', 'mpeg2'];
            const invalid = codecs.filter(c => !validCodecs.includes(c.toLowerCase().trim()));
            const duplicates = codecs.filter((c, i) => codecs.indexOf(c) !== i);

            if (invalid.length > 0) {
                return { valid: false, error: `Invalid codecs: ${invalid.join(', ')}` };
            }

            if (duplicates.length > 0) {
                return { valid: false, error: `Duplicate codecs: ${duplicates.join(', ')}` };
            }

            return { valid: true, codecs: codecs };
        }

        /**
         * Get statistics about codec usage
         * @returns {object} Current state
         */
        getStats() {
            return {
                currentSelection: this.getCurrentSelection(),
                priorityChain: this.getPriorityChain(this.getCurrentSelection()),
                headerValue: this.buildCodecHeader(this.getCurrentSelection()),
                cacheSize: this.cache.size
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GLOBAL EXPORT
    // ═══════════════════════════════════════════════════════════════════════

    // Create singleton instance
    const instance = new SmartCodecPrioritizer();

    // Export globally
    window.SmartCodecPrioritizer = instance;
    window.CODEC_HIERARCHY = CODEC_HIERARCHY;
    window.CODEC_EFFICIENCY = CODEC_EFFICIENCY;

    // Log initialization
    console.log('%c✅ Smart Codec Prioritizer Ready', 'color: #10b981;');
    console.log(`   Default Priority: ${instance.getPriorityChain('H265').join(' → ')}`);

})();
