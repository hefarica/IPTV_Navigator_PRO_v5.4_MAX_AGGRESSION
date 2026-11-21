/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚡ APE DYNAMIC QOS BUFFER v9.0 ULTIMATE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Implements Dynamic QoS (Quality of Service) Buffer System as shown in
 * APE v9.0 Master Prototype image. Provides intelligent buffer sizing
 * based on content type, network conditions, and device capabilities.
 * 
 * Features:
 * - Dynamic buffer sizing (2s - 15s range)
 * - Content-type aware buffering (Live/VOD/Sports)
 * - Network condition adaptation
 * - Tiered fallback (4K HEVC > 4K HE80p > 1000p > 720p > 360p)
 * - Device-specific optimization
 * 
 * @version 9.0.0
 * @date 2024-12-30
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    const CONFIG = {
        VERSION: '9.0.0',
        MIN_BUFFER_MS: 2000,      // 2 seconds minimum
        MAX_BUFFER_MS: 30000,     // 30 seconds maximum (IMAX support)
        DEFAULT_BUFFER_MS: 5000,  // 5 seconds default
        DEBUG: false
    };

    // ═══════════════════════════════════════════════════════════
    // CONTENT TYPE PROFILES
    // ═══════════════════════════════════════════════════════════

    const CONTENT_PROFILES = {
        // Live TV - Low latency, smaller buffer
        'live': {
            name: 'Live Broadcast',
            baseBuffer: 3000,      // 3s base
            multiplier: 1.0,
            strategy: 'low-latency',
            prebuffer: 2
        },

        // Sports - Ultra low latency for real-time
        'sports': {
            name: 'Sports/Real-time',
            baseBuffer: 2000,      // 2s base (minimum)
            multiplier: 0.8,
            strategy: 'ultra-low-latency',
            prebuffer: 1
        },

        // VOD/Movies - Higher buffer for stability
        'vod': {
            name: 'Video on Demand',
            baseBuffer: 8000,      // 8s base
            multiplier: 1.5,
            strategy: 'stability',
            prebuffer: 5
        },

        // News - Medium latency
        'news': {
            name: 'News/Events',
            baseBuffer: 4000,      // 4s base
            multiplier: 1.0,
            strategy: 'balanced',
            prebuffer: 3
        },

        // Music/Radio - Audio optimized
        'audio': {
            name: 'Audio/Radio',
            baseBuffer: 6000,      // 6s base
            multiplier: 1.2,
            strategy: 'audio-optimized',
            prebuffer: 4
        },

        // 4K Content - Larger buffers needed
        '4k': {
            name: '4K/UHD Content',
            baseBuffer: 10000,     // 10s base
            multiplier: 2.0,
            strategy: 'high-bandwidth',
            prebuffer: 6
        },

        // 4K HDR Content - Premium quality
        '4k_hdr': {
            name: '4K HDR Content',
            baseBuffer: 12000,     // 12s base
            multiplier: 2.2,
            strategy: 'high-bandwidth',
            prebuffer: 7
        },

        // 8K Content - Ultra premium
        '8k': {
            name: '8K/Cinema Content',
            baseBuffer: 20000,     // 20s base
            multiplier: 3.0,
            strategy: 'premium-streaming',
            prebuffer: 8
        },

        // 8K HDR+ Content - Reference quality
        '8k_hdr': {
            name: '8K HDR+ Content',
            baseBuffer: 20000,     // 20s base
            multiplier: 3.5,
            strategy: 'premium-streaming',
            prebuffer: 10
        },

        // IMAX Cinema - Highest tier
        'imax': {
            name: 'IMAX Cinema Grade',
            baseBuffer: 30000,     // 30s base
            multiplier: 4.0,
            strategy: 'cinema-format',
            prebuffer: 10
        },

        // Default
        'default': {
            name: 'Standard',
            baseBuffer: 5000,      // 5s base
            multiplier: 1.0,
            strategy: 'balanced',
            prebuffer: 3
        }
    };

    // ═══════════════════════════════════════════════════════════
    // TIERED QUALITY FALLBACK
    // ═══════════════════════════════════════════════════════════

    const QUALITY_TIERS = [
        { id: 'tier4', name: '4K HEVC', resolution: '3840x2160', bitrate: 45000, buffer: 12000 },
        { id: 'tier3', name: '4K HE80p', resolution: '3840x2160', bitrate: 25000, buffer: 10000 },
        { id: '1000p', name: '1000p', resolution: '1920x1080', bitrate: 20000, buffer: 6000 },
        { id: 'tier2', name: '>70 MBps', resolution: '1280x720', bitrate: 10000, buffer: 4000 },
        { id: '360', name: '360p', resolution: '640x360', bitrate: 5000, buffer: 3000 }
    ];

    // Device capability tiers
    const DEVICE_TIERS = {
        'firetv': { maxTier: 'tier4', name: 'Fire TV', capabilities: ['4K', 'HEVC', 'HDR'] },
        'smarttv': { maxTier: 'tier4', name: 'Smart TV', capabilities: ['4K', 'HEVC'] },
        'androidtv': { maxTier: 'tier3', name: 'Android TV', capabilities: ['4K'] },
        'appletv': { maxTier: 'tier4', name: 'Apple TV', capabilities: ['4K', 'HEVC', 'HDR', 'DV'] },
        'chromecast': { maxTier: 'tier3', name: 'Chromecast', capabilities: ['4K'] },
        'roku': { maxTier: 'tier3', name: 'Roku', capabilities: ['4K'] },
        'mobile': { maxTier: '1000p', name: 'Mobile', capabilities: ['1080p'] },
        'desktop': { maxTier: 'tier4', name: 'Desktop', capabilities: ['4K', 'HEVC'] },
        'unknown': { maxTier: 'tier2', name: 'Unknown', capabilities: ['720p'] }
    };

    // ═══════════════════════════════════════════════════════════
    // CONTENT TYPE DETECTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Detect content type from channel metadata
     * @param {Object} channel - Channel object
     * @returns {string} Content type identifier
     */
    function detectContentType(channel) {
        const name = (channel.name || channel.stream_name || '').toLowerCase();
        const group = (channel.group_title || channel.category_name || '').toLowerCase();

        // 4K detection
        if (name.includes('4k') || name.includes('uhd') || name.includes('2160')) {
            return '4k';
        }

        // Sports detection
        if (name.includes('sport') || name.includes('espn') || name.includes('futbol') ||
            name.includes('nfl') || name.includes('nba') || name.includes('mlb') ||
            group.includes('sport') || group.includes('deportes')) {
            return 'sports';
        }

        // News detection
        if (name.includes('news') || name.includes('noticias') || name.includes('cnn') ||
            name.includes('bbc') || name.includes('fox news') ||
            group.includes('news') || group.includes('noticias')) {
            return 'news';
        }

        // Music/Radio detection
        if (name.includes('radio') || name.includes('music') || name.includes('fm ') ||
            group.includes('radio') || group.includes('music')) {
            return 'audio';
        }

        // VOD detection (movies, series)
        if (group.includes('movie') || group.includes('vod') || group.includes('series') ||
            group.includes('peliculas') || group.includes('series')) {
            return 'vod';
        }

        // Default to live
        return 'live';
    }

    /**
     * Detect device type from User-Agent
     * @param {string} userAgent - User-Agent string
     * @returns {string} Device type identifier
     */
    function detectDevice(userAgent) {
        if (!userAgent) userAgent = navigator.userAgent;
        const ua = userAgent.toLowerCase();

        if (ua.includes('firetv') || ua.includes('fire tv') || ua.includes('aftmm')) {
            return 'firetv';
        }
        if (ua.includes('tizen') || ua.includes('webos') || ua.includes('smart-tv')) {
            return 'smarttv';
        }
        if (ua.includes('android tv') || ua.includes('androidtv')) {
            return 'androidtv';
        }
        if (ua.includes('apple tv') || ua.includes('appletv')) {
            return 'appletv';
        }
        if (ua.includes('chromecast') || ua.includes('crkey')) {
            return 'chromecast';
        }
        if (ua.includes('roku')) {
            return 'roku';
        }
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
            return 'mobile';
        }
        if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) {
            return 'desktop';
        }

        return 'unknown';
    }

    // ═══════════════════════════════════════════════════════════
    // NETWORK CONDITION ESTIMATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Estimate network conditions using Navigation Timing API
     * @returns {Object} Network condition estimate
     */
    function estimateNetworkConditions() {
        const connection = navigator.connection ||
            navigator.mozConnection ||
            navigator.webkitConnection;

        if (connection) {
            return {
                type: connection.effectiveType || 'unknown',
                downlink: connection.downlink || 10,  // Mbps
                rtt: connection.rtt || 100,           // ms
                saveData: connection.saveData || false
            };
        }

        // Fallback estimation
        return {
            type: 'unknown',
            downlink: 10,
            rtt: 100,
            saveData: false
        };
    }

    /**
     * Get buffer adjustment factor based on network
     * @param {Object} network - Network conditions
     * @returns {number} Multiplier (0.5 - 2.0)
     */
    function getNetworkBufferFactor(network) {
        const { type, downlink, rtt } = network;

        // Fast connection - reduce buffer
        if (type === '4g' || downlink > 20) {
            return 0.8;
        }

        // Slow connection - increase buffer
        if (type === '2g' || downlink < 2) {
            return 2.0;
        }

        if (type === '3g' || downlink < 5) {
            return 1.5;
        }

        // High latency - increase buffer
        if (rtt > 300) {
            return 1.4;
        }

        return 1.0;
    }

    // ═══════════════════════════════════════════════════════════
    // DYNAMIC BUFFER CALCULATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Calculate optimal buffer for a channel
     * @param {Object} channel - Channel object
     * @param {Object} options - Calculation options
     * @returns {Object} Buffer configuration
     */
    function calculateBuffer(channel, options = {}) {
        const { userAgent, forceType, networkConditions } = options;

        // Detect content type
        const contentType = forceType || detectContentType(channel);
        const profile = CONTENT_PROFILES[contentType] || CONTENT_PROFILES.default;

        // Detect device
        const device = detectDevice(userAgent);
        const deviceProfile = DEVICE_TIERS[device] || DEVICE_TIERS.unknown;

        // Estimate network
        const network = networkConditions || estimateNetworkConditions();
        const networkFactor = getNetworkBufferFactor(network);

        // Calculate buffer
        let bufferMs = profile.baseBuffer * profile.multiplier * networkFactor;

        // Apply device adjustments
        if (device === 'mobile') {
            bufferMs *= 1.2;  // Mobile needs more buffer
        }

        // Clamp to valid range
        bufferMs = Math.max(CONFIG.MIN_BUFFER_MS, Math.min(CONFIG.MAX_BUFFER_MS, bufferMs));
        bufferMs = Math.round(bufferMs);

        return {
            bufferMs,
            bufferSeconds: bufferMs / 1000,
            contentType,
            contentProfile: profile.name,
            strategy: profile.strategy,
            prebufferSegments: profile.prebuffer,
            device,
            deviceCapabilities: deviceProfile.capabilities,
            network: network.type,
            networkFactor,
            isOptimal: bufferMs >= 3000 && bufferMs <= 10000
        };
    }

    // ═══════════════════════════════════════════════════════════
    // TIERED FALLBACK
    // ═══════════════════════════════════════════════════════════

    /**
     * Get recommended quality tier based on conditions
     * @param {Object} channel - Channel object
     * @param {Object} options - Options
     * @returns {Object} Recommended tier with fallbacks
     */
    function getQualityTiers(channel, options = {}) {
        const { userAgent, networkConditions } = options;

        const device = detectDevice(userAgent);
        const deviceProfile = DEVICE_TIERS[device];
        const network = networkConditions || estimateNetworkConditions();

        // Find maximum tier for device
        const maxTierIndex = QUALITY_TIERS.findIndex(t => t.id === deviceProfile.maxTier);

        // Filter available tiers based on network
        let availableTiers = QUALITY_TIERS.slice(maxTierIndex >= 0 ? maxTierIndex : 0);

        // Adjust based on network
        if (network.downlink < 10) {
            // Remove 4K tiers for slow connections
            availableTiers = availableTiers.filter(t => !t.name.includes('4K'));
        }

        if (network.downlink < 5) {
            // Limit to 720p or lower
            availableTiers = availableTiers.filter(t => t.bitrate <= 10000);
        }

        return {
            recommended: availableTiers[0] || QUALITY_TIERS[QUALITY_TIERS.length - 1],
            fallbacks: availableTiers.slice(1),
            device,
            deviceMaxTier: deviceProfile.maxTier,
            networkLimited: network.downlink < 10
        };
    }

    // ═══════════════════════════════════════════════════════════
    // VLC OPTIONS GENERATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Generate VLC/player buffer options
     * @param {Object} bufferConfig - Buffer configuration
     * @returns {Object} Player-specific options
     */
    function generatePlayerOptions(bufferConfig) {
        const { bufferMs, strategy, prebufferSegments } = bufferConfig;

        return {
            // VLC options
            vlc: {
                'network-caching': bufferMs,
                'file-caching': Math.min(bufferMs, 5000),
                'live-caching': Math.min(bufferMs, 3000),
                'disc-caching': 1000
            },

            // ExoPlayer (Android)
            exoplayer: {
                minBufferMs: bufferMs,
                maxBufferMs: bufferMs * 3,
                bufferForPlaybackMs: bufferMs,
                bufferForPlaybackAfterRebufferMs: bufferMs * 2
            },

            // HLS.js
            hls: {
                maxBufferLength: bufferMs / 1000 * 3,
                maxMaxBufferLength: bufferMs / 1000 * 6,
                liveSyncDuration: strategy === 'ultra-low-latency' ? 2 : 3,
                liveMaxLatencyDuration: bufferMs / 1000 * 2
            },

            // M3U8 EXTVLCOPT format
            m3u8Options: [
                `#EXTVLCOPT:network-caching=${bufferMs}`,
                `#EXTVLCOPT:live-caching=${Math.min(bufferMs, 3000)}`
            ]
        };
    }

    // ═══════════════════════════════════════════════════════════
    // M3U8 BUFFER HEADER
    // ═══════════════════════════════════════════════════════════

    /**
     * Generate M3U8 buffer configuration header
     * @param {Object} channel - Channel object
     * @returns {string} M3U8 lines for buffer config
     */
    function generateM3U8BufferConfig(channel) {
        const bufferConfig = calculateBuffer(channel);
        const playerOptions = generatePlayerOptions(bufferConfig);

        let lines = [];

        // Add EXTVLCOPT lines
        lines.push(...playerOptions.m3u8Options);

        // Add APE buffer metadata
        lines.push(`#EXT-X-APE-BUFFER:strategy=${bufferConfig.strategy},buffer=${bufferConfig.bufferMs},prebuffer=${bufferConfig.prebufferSegments}`);

        return lines.join('\n');
    }

    // ═══════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════

    function getStatus() {
        const network = estimateNetworkConditions();
        const device = detectDevice();

        return {
            version: CONFIG.VERSION,
            bufferRange: `${CONFIG.MIN_BUFFER_MS}-${CONFIG.MAX_BUFFER_MS}ms`,
            contentProfiles: Object.keys(CONTENT_PROFILES).length,
            qualityTiers: QUALITY_TIERS.length,
            deviceTypes: Object.keys(DEVICE_TIERS).length,
            currentDevice: device,
            currentNetwork: network.type,
            ready: true
        };
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const DynamicQoSBuffer = {
        // Core functions
        calculateBuffer,
        getQualityTiers,

        // Detection
        detectContentType,
        detectDevice,
        estimateNetworkConditions,

        // Player options
        generatePlayerOptions,
        generateM3U8BufferConfig,

        // Data
        CONTENT_PROFILES,
        QUALITY_TIERS,
        DEVICE_TIERS,

        // Status
        getStatus,

        // Config
        CONFIG
    };

    // Global exports
    window.DYNAMIC_QOS_V9 = DynamicQoSBuffer;
    window.APE_QoS = DynamicQoSBuffer;  // Alias

    console.log('%c⚡ APE Dynamic QoS Buffer v9.0 Loaded', 'color: #00ff41; font-weight: bold;');

})();
