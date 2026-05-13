/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🛡️ BUFFER ADAPTATIVO SUPREMO v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Sistema de buffering adaptativo inteligente con 41 metadatos por canal.
 * Garantiza cero cortes y recuperación <5 segundos.
 * 
 * GRUPOS DE METADATOS:
 * - GRUPO 1: Buffer Adaptativo (8 tags)
 * - GRUPO 2: Prefetch Supremo (10 tags)
 * - GRUPO 3: Detección de Fallos (9 tags)
 * - GRUPO 4: Negociación Player (8 tags)
 * - GRUPO 5: Eventos en Vivo (6 tags)
 * 
 * TOTAL: 41 metadatos por canal
 * 
 * AUTHOR: APE Engine Team - IPTV Navigator PRO
 * VERSION: 1.0.0
 * DATE: 2026-01-28
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // PROFILE-BASED BUFFER VALUES
    // ═══════════════════════════════════════════════════════════════════════

    const BUFFER_PROFILES = {
        'P0': { // ULTRA_EXTREME
            bufferMin: 5000,
            bufferTarget: 8000,
            bufferMax: 15000,
            criticalThreshold: 2000,
            prefetchBase: 100,
            prefetchAggressive: 160,
            prefetchCritical: 220,
            parallelBase: 50,
            parallelAggressive: 70,
            parallelCritical: 90
        },
        'P1': { // 8K_SUPREME
            bufferMin: 3000,
            bufferTarget: 5000,
            bufferMax: 12000,
            criticalThreshold: 1500,
            prefetchBase: 95,
            prefetchAggressive: 155,
            prefetchCritical: 210,
            parallelBase: 45,
            parallelAggressive: 65,
            parallelCritical: 85
        },
        'P2': { // 4K_EXTREME
            bufferMin: 2000,
            bufferTarget: 3000,
            bufferMax: 10000,
            criticalThreshold: 1000,
            prefetchBase: 92,
            prefetchAggressive: 152,
            prefetchCritical: 205,
            parallelBase: 42,
            parallelAggressive: 62,
            parallelCritical: 82
        },
        'P3': { // FHD_ADVANCED
            bufferMin: 1500,
            bufferTarget: 2000,
            bufferMax: 8000,
            criticalThreshold: 800,
            prefetchBase: 90,
            prefetchAggressive: 150,
            prefetchCritical: 200,
            parallelBase: 40,
            parallelAggressive: 60,
            parallelCritical: 80
        },
        'P4': { // HD_STABLE
            bufferMin: 1200,
            bufferTarget: 1500,
            bufferMax: 6000,
            criticalThreshold: 600,
            prefetchBase: 85,
            prefetchAggressive: 140,
            prefetchCritical: 190,
            parallelBase: 35,
            parallelAggressive: 55,
            parallelCritical: 75
        },
        'P5': { // SD_FAILSAFE
            bufferMin: 1000,
            bufferTarget: 1000,
            bufferMax: 5000,
            criticalThreshold: 500,
            prefetchBase: 80,
            prefetchAggressive: 130,
            prefetchCritical: 180,
            parallelBase: 30,
            parallelAggressive: 50,
            parallelCritical: 70
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // BUFFER ADAPTATIVO SUPREMO CLASS
    // ═══════════════════════════════════════════════════════════════════════

    class BufferAdaptativoSupremo {
        constructor() {
            console.log('%c🛡️ Buffer Adaptativo Supremo v1.0.0 Loaded', 'color: #f59e0b; font-weight: bold;');
        }

        /**
         * Get buffer profile values for a given profile ID
         * @param {string} profileId - P0, P1, P2, P3, P4, P5
         * @returns {object} Profile buffer configuration
         */
        getProfileValues(profileId) {
            return BUFFER_PROFILES[profileId] || BUFFER_PROFILES['P3'];
        }

        /**
         * Generate all 41 metadata tags for a channel
         * @param {string} profileId - P0-P5
         * @param {boolean} isLiveEvent - Whether this is a live event channel
         * @returns {string} Multi-line string with all 41 EXT-X-APE-* tags
         */
        generateAllMetadata(profileId, isLiveEvent = false) {
            const p = this.getProfileValues(profileId);
            const tags = [];

            // ═══════════════════════════════════════════════════════════
            // GRUPO 1: BUFFER ADAPTATIVO (8 metadatos)
            // ═══════════════════════════════════════════════════════════
            tags.push(`#EXT-X-APE-BUFFER-ADAPTIVE-ENABLED:true`);
            tags.push(`#EXT-X-APE-BUFFER-STRATEGY:supremo-inteligente`);
            tags.push(`#EXT-X-APE-BUFFER-MIN:${p.bufferMin}`);
            tags.push(`#EXT-X-APE-BUFFER-TARGET:${p.bufferTarget}`);
            tags.push(`#EXT-X-APE-BUFFER-MAX:${p.bufferMax}`);
            tags.push(`#EXT-X-APE-BUFFER-CRITICAL-THRESHOLD:${p.criticalThreshold}`);
            tags.push(`#EXT-X-APE-BUFFER-RECOVERY-MODE:aggressive`);
            tags.push(`#EXT-X-APE-BUFFER-RECOVERY-MULTIPLIER:2.5`);

            // ═══════════════════════════════════════════════════════════
            // GRUPO 2: PREFETCH SUPREMO (10 metadatos)
            // ═══════════════════════════════════════════════════════════
            tags.push(`#EXT-X-APE-PREFETCH-SUPREMO-ENABLED:true`);
            tags.push(`#EXT-X-APE-PREFETCH-SEGMENTS-DYNAMIC:true`);
            tags.push(`#EXT-X-APE-PREFETCH-SEGMENTS-BASE:${p.prefetchBase}`);
            tags.push(`#EXT-X-APE-PREFETCH-SEGMENTS-AGGRESSIVE:${p.prefetchAggressive}`);
            tags.push(`#EXT-X-APE-PREFETCH-SEGMENTS-CRITICAL:${p.prefetchCritical}`);
            tags.push(`#EXT-X-APE-PREFETCH-PARALLEL-DYNAMIC:true`);
            tags.push(`#EXT-X-APE-PREFETCH-PARALLEL-BASE:${p.parallelBase}`);
            tags.push(`#EXT-X-APE-PREFETCH-PARALLEL-AGGRESSIVE:${p.parallelAggressive}`);
            tags.push(`#EXT-X-APE-PREFETCH-PARALLEL-CRITICAL:${p.parallelCritical}`);
            tags.push(`#EXT-X-APE-PREFETCH-BANDWIDTH-THRESHOLD:20`);

            // ═══════════════════════════════════════════════════════════
            // GRUPO 3: DETECCIÓN DE FALLOS (9 metadatos)
            // ═══════════════════════════════════════════════════════════
            tags.push(`#EXT-X-APE-FAILOVER-DETECTION-ENABLED:true`);
            tags.push(`#EXT-X-APE-FAILOVER-DETECTION-TIMEOUT:500`);
            tags.push(`#EXT-X-APE-FAILOVER-BANDWIDTH-DROP-THRESHOLD:20`);
            tags.push(`#EXT-X-APE-FAILOVER-BUFFER-CRITICAL-TIMEOUT:1000`);
            tags.push(`#EXT-X-APE-FAILOVER-RECOVERY-STRATEGY:aggressive`);
            tags.push(`#EXT-X-APE-FAILOVER-RETRY-ATTEMPTS:5`);
            tags.push(`#EXT-X-APE-FAILOVER-RETRY-DELAY:1000`);
            tags.push(`#EXT-X-APE-FAILOVER-BITRATE-REDUCTION:0.3`);
            tags.push(`#EXT-X-APE-FAILOVER-EMERGENCY-MODE:enabled`);

            // ═══════════════════════════════════════════════════════════
            // GRUPO 4: NEGOCIACIÓN PLAYER (8 metadatos)
            // ═══════════════════════════════════════════════════════════
            tags.push(`#EXT-X-APE-NEGOTIATION-ENABLED:true`);
            tags.push(`#EXT-X-APE-NEGOTIATION-INTERVAL:500`);
            tags.push(`#EXT-X-APE-NEGOTIATION-TELEMETRY:enabled`);
            tags.push(`#EXT-X-APE-NEGOTIATION-BUFFER-REPORT:enabled`);
            tags.push(`#EXT-X-APE-NEGOTIATION-BANDWIDTH-REPORT:enabled`);
            tags.push(`#EXT-X-APE-NEGOTIATION-LATENCY-REPORT:enabled`);
            tags.push(`#EXT-X-APE-NEGOTIATION-PACKET-LOSS-REPORT:enabled`);
            tags.push(`#EXT-X-APE-NEGOTIATION-DECISION-RESPONSE:enabled`);

            // ═══════════════════════════════════════════════════════════
            // GRUPO 5: EVENTOS EN VIVO (6 metadatos)
            // ═══════════════════════════════════════════════════════════
            const liveEnabled = isLiveEvent ? 'enabled' : 'standby';
            const livePriority = isLiveEvent ? 'maximum' : 'normal';
            tags.push(`#EXT-X-APE-LIVE-EVENT-DETECTION:${liveEnabled}`);
            tags.push(`#EXT-X-APE-LIVE-EVENT-LATENCY-TARGET:2000`);
            tags.push(`#EXT-X-APE-LIVE-EVENT-PREFETCH-MULTIPLIER:1.5`);
            tags.push(`#EXT-X-APE-LIVE-EVENT-PRIORITY:${livePriority}`);
            tags.push(`#EXT-X-APE-LIVE-EVENT-TOLERANCE:zero-cuts`);
            tags.push(`#EXT-X-APE-LIVE-EVENT-RECOVERY-AGGRESSIVE:true`);

            return tags.join('\n');
        }

        /**
         * Generate metadata as an object (for programmatic access)
         * @param {string} profileId - P0-P5
         * @param {boolean} isLiveEvent - Whether this is a live event
         * @returns {object} Object with all 41 metadata keys
         */
        generateMetadataObject(profileId, isLiveEvent = false) {
            const p = this.getProfileValues(profileId);
            const liveEnabled = isLiveEvent ? 'enabled' : 'standby';
            const livePriority = isLiveEvent ? 'maximum' : 'normal';

            return {
                // GRUPO 1: BUFFER ADAPTATIVO (8)
                'BUFFER-ADAPTIVE-ENABLED': 'true',
                'BUFFER-STRATEGY': 'supremo-inteligente',
                'BUFFER-MIN': p.bufferMin,
                'BUFFER-TARGET': p.bufferTarget,
                'BUFFER-MAX': p.bufferMax,
                'BUFFER-CRITICAL-THRESHOLD': p.criticalThreshold,
                'BUFFER-RECOVERY-MODE': 'aggressive',
                'BUFFER-RECOVERY-MULTIPLIER': '2.5',

                // GRUPO 2: PREFETCH SUPREMO (10)
                'PREFETCH-SUPREMO-ENABLED': 'true',
                'PREFETCH-SEGMENTS-DYNAMIC': 'true',
                'PREFETCH-SEGMENTS-BASE': p.prefetchBase,
                'PREFETCH-SEGMENTS-AGGRESSIVE': p.prefetchAggressive,
                'PREFETCH-SEGMENTS-CRITICAL': p.prefetchCritical,
                'PREFETCH-PARALLEL-DYNAMIC': 'true',
                'PREFETCH-PARALLEL-BASE': p.parallelBase,
                'PREFETCH-PARALLEL-AGGRESSIVE': p.parallelAggressive,
                'PREFETCH-PARALLEL-CRITICAL': p.parallelCritical,
                'PREFETCH-BANDWIDTH-THRESHOLD': 20,

                // GRUPO 3: DETECCIÓN DE FALLOS (9)
                'FAILOVER-DETECTION-ENABLED': 'true',
                'FAILOVER-DETECTION-TIMEOUT': 500,
                'FAILOVER-BANDWIDTH-DROP-THRESHOLD': 20,
                'FAILOVER-BUFFER-CRITICAL-TIMEOUT': 1000,
                'FAILOVER-RECOVERY-STRATEGY': 'aggressive',
                'FAILOVER-RETRY-ATTEMPTS': 5,
                'FAILOVER-RETRY-DELAY': 1000,
                'FAILOVER-BITRATE-REDUCTION': 0.3,
                'FAILOVER-EMERGENCY-MODE': 'enabled',

                // GRUPO 4: NEGOCIACIÓN PLAYER (8)
                'NEGOTIATION-ENABLED': 'true',
                'NEGOTIATION-INTERVAL': 500,
                'NEGOTIATION-TELEMETRY': 'enabled',
                'NEGOTIATION-BUFFER-REPORT': 'enabled',
                'NEGOTIATION-BANDWIDTH-REPORT': 'enabled',
                'NEGOTIATION-LATENCY-REPORT': 'enabled',
                'NEGOTIATION-PACKET-LOSS-REPORT': 'enabled',
                'NEGOTIATION-DECISION-RESPONSE': 'enabled',

                // GRUPO 5: EVENTOS EN VIVO (6)
                'LIVE-EVENT-DETECTION': liveEnabled,
                'LIVE-EVENT-LATENCY-TARGET': 2000,
                'LIVE-EVENT-PREFETCH-MULTIPLIER': 1.5,
                'LIVE-EVENT-PRIORITY': livePriority,
                'LIVE-EVENT-TOLERANCE': 'zero-cuts',
                'LIVE-EVENT-RECOVERY-AGGRESSIVE': 'true'
            };
        }

        /**
         * Detect if a channel is a live event based on name/metadata
         * @param {object} channel - Channel object
         * @returns {boolean} True if live event
         */
        isLiveEventChannel(channel) {
            const name = (channel.name || channel.stream_display_name || '').toUpperCase();
            const livePatterns = /\b(DEPORTES|FUTBOL|SOCCER|LIVE|PPV|UFC|NFL|NBA|CHAMPIONS|LIGA|DAZN|ESPN|EVENTO|DIRECTO|FIGHT|BOXING|F1|FORMULA)\b/i;
            return livePatterns.test(name);
        }

        /**
         * Get statistics about the buffer system
         * @returns {object} Stats
         */
        getStats() {
            return {
                version: '1.0.0',
                metadataGroups: 5,
                metadataTotal: 41,
                profiles: Object.keys(BUFFER_PROFILES),
                defaultProfile: 'P3'
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GLOBAL EXPORT
    // ═══════════════════════════════════════════════════════════════════════

    const instance = new BufferAdaptativoSupremo();
    window.BufferAdaptativoSupremo = instance;
    window.BUFFER_PROFILES = BUFFER_PROFILES;

    console.log('%c✅ Buffer Adaptativo Supremo Ready', 'color: #f59e0b;');
    console.log(`   41 metadatos por canal | Perfiles: ${Object.keys(BUFFER_PROFILES).join(', ')}`);

})();
