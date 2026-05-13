/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌍 APE GEOBLOCKING DETECTOR v9.0 ULTIMATE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Detects geo-restricted streams and finds working bypass configurations.
 * Tests channels from multiple country perspectives.
 * 
 * Features:
 * - Auto-detection of geo-restrictions
 * - Multi-country testing
 * - Auto-fix headers per channel
 * - Bypass configuration storage
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
        TIMEOUT_MS: 5000,           // 5 second timeout per test
        DEFAULT_CONCURRENCY: 3,     // Parallel tests
        DEBUG: false
    };

    // ═══════════════════════════════════════════════════════════
    // COUNTRY PROFILES
    // ═══════════════════════════════════════════════════════════

    const COUNTRY_PROFILES = {
        'US': {
            name: 'United States',
            headers: {
                'Accept-Language': 'en-US,en;q=0.9',
                'CF-IPCountry': 'US'
            },
            timezone: 'America/New_York'
        },
        'UK': {
            name: 'United Kingdom',
            headers: {
                'Accept-Language': 'en-GB,en;q=0.9',
                'CF-IPCountry': 'GB'
            },
            timezone: 'Europe/London'
        },
        'DE': {
            name: 'Germany',
            headers: {
                'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
                'CF-IPCountry': 'DE'
            },
            timezone: 'Europe/Berlin'
        },
        'ES': {
            name: 'Spain',
            headers: {
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                'CF-IPCountry': 'ES'
            },
            timezone: 'Europe/Madrid'
        },
        'FR': {
            name: 'France',
            headers: {
                'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
                'CF-IPCountry': 'FR'
            },
            timezone: 'Europe/Paris'
        },
        'IT': {
            name: 'Italy',
            headers: {
                'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
                'CF-IPCountry': 'IT'
            },
            timezone: 'Europe/Rome'
        },
        'BR': {
            name: 'Brazil',
            headers: {
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                'CF-IPCountry': 'BR'
            },
            timezone: 'America/Sao_Paulo'
        },
        'MX': {
            name: 'Mexico',
            headers: {
                'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
                'CF-IPCountry': 'MX'
            },
            timezone: 'America/Mexico_City'
        }
    };

    // ═══════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════

    const _geoFixes = new Map();  // channelId -> working country profile
    const _testResults = new Map();  // channelId -> test results

    // ═══════════════════════════════════════════════════════════
    // DETECTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Test if a channel is geo-blocked
     * @param {string} url - Channel URL
     * @param {Object} options - Test options
     * @returns {Promise<Object>} Test result
     */
    async function testGeoBlock(url, options = {}) {
        const { country = 'US', timeout = CONFIG.TIMEOUT_MS } = options;
        const profile = COUNTRY_PROFILES[country];

        if (!profile) {
            return { success: false, error: 'Invalid country code' };
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method: 'HEAD',
                headers: {
                    ...profile.headers,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                signal: controller.signal,
                mode: 'no-cors'  // Cross-origin streams
            });

            clearTimeout(timeoutId);

            // Analyze response
            const isBlocked =
                response.status === 403 ||
                response.status === 451 ||
                response.redirected && response.url.includes('blocked');

            return {
                success: !isBlocked,
                country,
                countryName: profile.name,
                status: response.status,
                blocked: isBlocked,
                responseTime: Date.now()
            };

        } catch (error) {
            return {
                success: false,
                country,
                countryName: profile.name,
                error: error.name === 'AbortError' ? 'Timeout' : error.message,
                blocked: true
            };
        }
    }

    /**
     * Test a channel from multiple countries
     * @param {Object} channel - Channel object
     * @param {number} concurrency - Parallel tests
     * @returns {Promise<Object>} Results from all countries
     */
    async function testMultipleCountries(channel, concurrency = CONFIG.DEFAULT_CONCURRENCY) {
        const url = channel.url || channel.stream_url;
        const channelId = channel.stream_id || channel.id || url;
        const countries = Object.keys(COUNTRY_PROFILES);

        const results = {
            channelId,
            channelName: channel.name || channel.stream_name,
            tests: [],
            workingCountries: [],
            blockedCountries: [],
            primaryFix: null
        };

        // Test in batches
        for (let i = 0; i < countries.length; i += concurrency) {
            const batch = countries.slice(i, i + concurrency);
            const batchResults = await Promise.all(
                batch.map(country => testGeoBlock(url, { country }))
            );

            batchResults.forEach(result => {
                results.tests.push(result);
                if (result.success && !result.blocked) {
                    results.workingCountries.push(result.country);
                } else {
                    results.blockedCountries.push(result.country);
                }
            });
        }

        // Set primary fix (first working country)
        if (results.workingCountries.length > 0) {
            const primaryCountry = results.workingCountries[0];
            results.primaryFix = {
                country: primaryCountry,
                headers: COUNTRY_PROFILES[primaryCountry].headers
            };

            // Store fix
            _geoFixes.set(channelId, results.primaryFix);
        }

        _testResults.set(channelId, results);

        return results;
    }

    /**
     * Test multiple channels
     * @param {Array} channels - Array of channel objects
     * @param {number} concurrency - Parallel channel tests
     */
    async function testMultipleChannels(channels, concurrency = 5) {
        const results = {
            totalTested: 0,
            fixed: 0,
            blocked: 0,
            startTime: Date.now()
        };

        for (let i = 0; i < channels.length; i += concurrency) {
            const batch = channels.slice(i, i + concurrency);
            const batchResults = await Promise.all(
                batch.map(ch => testMultipleCountries(ch))
            );

            batchResults.forEach(result => {
                results.totalTested++;
                if (result.primaryFix) {
                    results.fixed++;
                } else {
                    results.blocked++;
                }
            });

            if (CONFIG.DEBUG) {
                console.log(`[GeoBlock] Tested ${results.totalTested}/${channels.length}`);
            }
        }

        results.duration = Date.now() - results.startTime;

        return results;
    }

    // ═══════════════════════════════════════════════════════════
    // FIX APPLICATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Get geo fix for a channel
     * @param {string} channelId - Channel identifier
     * @returns {Object|null} Geo fix configuration
     */
    function getGeoFix(channelId) {
        return _geoFixes.get(channelId) || null;
    }

    /**
     * Apply geo fix to channel headers
     * @param {string} channelId - Channel identifier
     * @param {Object} headers - Base headers
     * @returns {Object} Headers with geo fix applied
     */
    function applyGeoFixToChannel(channelId, headers = {}) {
        const fix = _geoFixes.get(channelId);

        if (!fix) {
            return headers;
        }

        return {
            ...headers,
            ...fix.headers,
            'X-Geo-Fixed': 'true',
            'X-Geo-Country': fix.country
        };
    }

    /**
     * Get channel with fallback geo configurations
     */
    function getChannelWithFallback(channelId, channelName) {
        const testResult = _testResults.get(channelId);

        if (!testResult) {
            return null;
        }

        return {
            channelId,
            channelName,
            primary: testResult.primaryFix,
            backups: testResult.workingCountries.slice(1).map(country => ({
                country,
                headers: COUNTRY_PROFILES[country].headers
            }))
        };
    }

    // ═══════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════

    function getStatus() {
        return {
            version: CONFIG.VERSION,
            countriesAvailable: Object.keys(COUNTRY_PROFILES).length,
            channelsTested: _testResults.size,
            channelsFixed: _geoFixes.size,
            ready: true
        };
    }

    function getStats() {
        const fixes = Array.from(_geoFixes.values());
        const countryStats = {};

        fixes.forEach(fix => {
            countryStats[fix.country] = (countryStats[fix.country] || 0) + 1;
        });

        return {
            totalFixes: fixes.length,
            byCountry: countryStats
        };
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const GeoBlockingDetector = {
        // Detection
        testGeoBlock,
        testMultipleCountries,
        testMultipleChannels,

        // Fix application
        getGeoFix,
        applyGeoFixToChannel,
        getChannelWithFallback,

        // Data
        COUNTRY_PROFILES,
        geoFixes: _geoFixes,

        // Status
        getStatus,
        getStats,

        // Config
        CONFIG
    };

    // Global exports
    window.GEOBLOCKING_V9 = GeoBlockingDetector;
    window.APE_GeoBlock = GeoBlockingDetector;  // Alias

    console.log('%c🌍 APE Geoblocking Detector v9.0 Loaded', 'color: #00ff41; font-weight: bold;');

})();
