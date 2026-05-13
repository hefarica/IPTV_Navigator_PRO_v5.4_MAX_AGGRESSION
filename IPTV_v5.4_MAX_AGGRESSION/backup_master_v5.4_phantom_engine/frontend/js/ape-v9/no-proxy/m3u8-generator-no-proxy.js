/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📺 M3U8 GENERATOR - NO PROXY ARCHITECTURE v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Generates M3U8 playlists with DIRECT URLs to content servers.
 * Each channel URL includes a JWT with embedded simulators.
 * NO proxy infrastructure required - Maximum performance guaranteed.
 * 
 * Features:
 * - RFC 8216 compliant output
 * - Direct URLs with JWT tokens
 * - Batch generation (26k+ channels supported)
 * - Multiple output formats
 * 
 * @version 1.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    const CONFIG = {
        VERSION: '1.0.0',
        ARCHITECTURE: 'NO_PROXY_DIRECT',
        DEFAULT_TVG_URL: '',
        DEFAULT_LOGO: 'https://via.placeholder.com/150',
        BATCH_SIZE: 1000,
        OUTPUT_FORMAT: 'M3U8'
    };

    // ═══════════════════════════════════════════════════════════
    // M3U8 HEADER TEMPLATES
    // ═══════════════════════════════════════════════════════════

    const HEADERS = {
        standard: [
            '#EXTM3U',
            '#EXT-X-VERSION:7',
            '#EXT-X-INDEPENDENT-SEGMENTS'
        ],

        full: [
            '#EXTM3U',
            '#EXT-X-VERSION:7',
            '#EXT-X-INDEPENDENT-SEGMENTS',
            '#EXT-X-ALLOW-CACHE:YES',
            '#EXT-X-TARGETDURATION:10'
        ],

        ape_ultimate: [
            '#EXTM3U',
            '#EXT-X-VERSION:7',
            '#EXT-X-INDEPENDENT-SEGMENTS',
            '#EXT-X-APE-VERSION:17.0.0-NOPROXY',
            '#EXT-X-APE-ARCHITECTURE:DIRECT_CONNECTION',
            '#EXT-X-APE-PROXY:NONE',
            '#EXT-X-APE-SIMULATORS:EMBEDDED_JWT',
            '#EXT-X-APE-QUALITY:MAXIMUM'
        ]
    };

    // ═══════════════════════════════════════════════════════════
    // CHANNEL ENTRY BUILDER
    // ═══════════════════════════════════════════════════════════

    /**
     * Build a single channel entry for M3U8
     * @param {Object} channel - Channel data
     * @param {Object} options - Generation options
     * @returns {Array<string>} Lines for this channel
     */
    function buildChannelEntry(channel, options = {}) {
        const lines = [];
        const name = channel.name || channel.stream_name || 'Unknown Channel';
        const logo = channel.stream_icon || channel.logo || CONFIG.DEFAULT_LOGO;
        const group = channel.category_name || channel.group || 'General';
        const tvgId = channel.epg_channel_id || channel.tvg_id || '';
        const catchup = channel.catchup || '';
        const catchupDays = channel.catchup_days || 7;

        // Generate JWT with embedded simulators
        let token = '';
        if (window.JWTEmbeddedSimulators) {
            token = window.JWTEmbeddedSimulators.generateToken(channel, {
                proxy: options.proxyOptions || {},
                ua: options.uaOptions || {},
                maxBitrate: options.maxBitrate || 50000,
                buffer: options.buffer || 4000
            });
        } else if (window.JWT_TOKEN_V9) {
            // Fallback to standard JWT generator
            token = window.JWT_TOKEN_V9.generateChannelToken(channel, options);
        }

        // Build EXTINF line with all attributes
        let extinf = `#EXTINF:-1`;
        extinf += ` tvg-id="${tvgId}"`;
        extinf += ` tvg-name="${name.replace(/"/g, "'")}"`;
        extinf += ` tvg-logo="${logo}"`;
        extinf += ` group-title="${group.replace(/"/g, "'")}"`;

        if (catchup) {
            extinf += ` catchup="${catchup}"`;
            extinf += ` catchup-days="${catchupDays}"`;
        }

        extinf += `,${name}`;
        lines.push(extinf);

        // Add APE optimization tags (optional)
        if (options.includeApeTags !== false) {
            lines.push(...buildApeTags(channel, options));
        }

        // Build the URL - DIRECT, no proxy
        const baseUrl = channel.stream_url || channel.url || '';
        if (baseUrl) {
            const separator = baseUrl.includes('?') ? '&' : '?';
            const finalUrl = token
                ? `${baseUrl}${separator}ape_jwt=${encodeURIComponent(token)}`
                : baseUrl;
            lines.push(finalUrl);
        }

        return lines;
    }

    /**
     * Build APE optimization tags for a channel
     */
    function buildApeTags(channel, options = {}) {
        const tags = [];
        const profile = options.profile || 'P3';

        // EXTVLCOPT tags (9 lines for VLC/OTT compatibility)
        tags.push(`#EXTVLCOPT:network-caching=${options.buffer || 4000}`);
        tags.push(`#EXTVLCOPT:live-caching=${options.buffer || 4000}`);
        tags.push(`#EXTVLCOPT:http-reconnect=true`);
        tags.push(`#EXTVLCOPT:http-continuous=true`);

        // KODIPROP tags (Kodi compatibility)
        tags.push(`#KODIPROP:inputstream.adaptive.manifest_type=hls`);
        tags.push(`#KODIPROP:inputstream.adaptive.max_bandwidth=${options.maxBitrate || 50000}000`);

        // APE tags (quality/optimization)
        tags.push(`#EXT-X-APE-PROFILE:${profile}`);
        tags.push(`#EXT-X-APE-DIRECT:true`);
        tags.push(`#EXT-X-APE-PROXY:none`);

        return tags;
    }

    // ═══════════════════════════════════════════════════════════
    // M3U8 GENERATOR CLASS
    // ═══════════════════════════════════════════════════════════

    class M3U8GeneratorNoProxy {
        constructor(options = {}) {
            this.channels = [];
            this.options = {
                headerType: options.headerType || 'ape_ultimate',
                includeApeTags: options.includeApeTags !== false,
                profile: options.profile || 'P3',
                maxBitrate: options.maxBitrate || 50000,
                buffer: options.buffer || 4000,
                proxyOptions: options.proxyOptions || {},
                uaOptions: options.uaOptions || {},
                ...options
            };
            this.stats = {
                totalChannels: 0,
                generatedAt: null,
                generationTimeMs: 0
            };
        }

        /**
         * Add channels to the generator
         * @param {Array} channels - Array of channel objects
         * @returns {M3U8GeneratorNoProxy} this (for chaining)
         */
        addChannels(channels) {
            if (Array.isArray(channels)) {
                this.channels.push(...channels);
            } else if (channels) {
                this.channels.push(channels);
            }
            return this;
        }

        /**
         * Clear all channels
         * @returns {M3U8GeneratorNoProxy} this
         */
        clear() {
            this.channels = [];
            return this;
        }

        /**
         * Generate M3U8 content
         * @param {Object} options - Override options for this generation
         * @returns {string} Complete M3U8 content
         */
        generateM3U8(options = {}) {
            const startTime = performance.now();
            const mergedOptions = { ...this.options, ...options };
            const lines = [];

            // Add header
            const headerLines = HEADERS[mergedOptions.headerType] || HEADERS.standard;
            lines.push(...headerLines);

            // Add generation metadata
            lines.push(`#EXT-X-APE-GENERATED:${new Date().toISOString()}`);
            lines.push(`#EXT-X-APE-TOTAL-CHANNELS:${this.channels.length}`);
            lines.push(`#EXT-X-APE-ARCHITECTURE:${CONFIG.ARCHITECTURE}`);
            lines.push('');

            // Generate each channel entry
            for (const channel of this.channels) {
                try {
                    const channelLines = buildChannelEntry(channel, mergedOptions);
                    lines.push(...channelLines);
                    lines.push('');  // Blank line between channels
                } catch (e) {
                    console.error(`Error generating channel ${channel.name}:`, e);
                }
            }

            // Update stats
            const endTime = performance.now();
            this.stats = {
                totalChannels: this.channels.length,
                generatedAt: new Date().toISOString(),
                generationTimeMs: Math.round(endTime - startTime)
            };

            console.log(`📺 Generated M3U8: ${this.channels.length} channels in ${this.stats.generationTimeMs}ms`);

            return lines.join('\n');
        }

        /**
         * Generate and download as file
         * @param {string} filename - Output filename
         */
        downloadM3U8(filename = 'playlist.m3u8') {
            const content = this.generateM3U8();
            const blob = new Blob([content], { type: 'audio/x-mpegurl' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(`📁 Downloaded: ${filename} (${this.channels.length} channels)`);
        }

        /**
         * Get generation statistics
         * @returns {Object} Statistics object
         */
        getStats() {
            return {
                ...this.stats,
                architecture: CONFIG.ARCHITECTURE,
                version: CONFIG.VERSION
            };
        }

        /**
         * Validate that all URLs are direct (no proxy)
         * @returns {Object} Validation result
         */
        validateDirect() {
            const results = {
                total: this.channels.length,
                valid: 0,
                invalid: 0,
                issues: []
            };

            const proxyPatterns = [
                /proxy\./i,
                /\/proxy\//i,
                /\?proxy=/i,
                /&proxy=/i,
                /:8765\//,  // Common proxy port
                /:3128\//   // Another common proxy port
            ];

            for (const channel of this.channels) {
                const url = channel.stream_url || channel.url || '';
                let isValid = true;

                for (const pattern of proxyPatterns) {
                    if (pattern.test(url)) {
                        isValid = false;
                        results.issues.push({
                            channel: channel.name,
                            url: url.substring(0, 50) + '...',
                            reason: `Matches proxy pattern: ${pattern}`
                        });
                        break;
                    }
                }

                if (isValid) {
                    results.valid++;
                } else {
                    results.invalid++;
                }
            }

            results.isClean = results.invalid === 0;
            return results;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // QUICK GENERATION FUNCTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Quick generate M3U8 from channel array
     * @param {Array} channels - Channel array
     * @param {Object} options - Options
     * @returns {string} M3U8 content
     */
    function quickGenerate(channels, options = {}) {
        const generator = new M3U8GeneratorNoProxy(options);
        generator.addChannels(channels);
        return generator.generateM3U8();
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const M3U8NoProxyModule = {
        // Main class
        M3U8GeneratorNoProxy,

        // Quick functions
        quickGenerate,
        buildChannelEntry,
        buildApeTags,

        // Config
        CONFIG,
        HEADERS,

        // Version info
        getVersion: () => CONFIG.VERSION,
        getArchitecture: () => CONFIG.ARCHITECTURE
    };

    // Global exports
    window.M3U8GeneratorNoProxy = M3U8GeneratorNoProxy;
    window.M3U8NoProxy = M3U8NoProxyModule;

    console.log('%c📺 M3U8 Generator No-Proxy v1.0 Loaded', 'color: #00ff41; font-weight: bold;');
    console.log('   ✅ Architecture: DIRECT | No Proxy | Maximum Performance');

})();
