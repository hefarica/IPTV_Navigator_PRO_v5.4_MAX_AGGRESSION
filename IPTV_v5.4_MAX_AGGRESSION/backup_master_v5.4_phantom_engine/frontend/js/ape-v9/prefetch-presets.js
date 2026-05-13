/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚀 PREFETCH PRESETS v1.0 - IPTV Navigator PRO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Definición de las 5 estrategias de prefetch inteligente.
 * Cada estrategia define parámetros para optimizar la descarga de segmentos
 * y garantizar reproducción sin buffering.
 * 
 * INTEGRACIÓN:
 * - Profile Manager: UI para seleccionar estrategia
 * - M3U8 Generator: Inyecta headers EXT-X-APE-PREFETCH-*
 * - Cloudflare Worker: Ajusta dinámicamente según red
 * 
 * FECHA: 2026-01-07
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // DEFINICIÓN DE ESTRATEGIAS DE PREFETCH
    // ═══════════════════════════════════════════════════════════════════════

    const PREFETCH_STRATEGIES = {

        // ─────────────────────────────────────────────────────────────────────
        // 🐢 CONSERVADOR - Mínimo consumo, máxima compatibilidad
        // ─────────────────────────────────────────────────────────────────────
        CONSERVADOR: {
            id: 'CONSERVADOR',
            name: 'Conservador',
            icon: '🐢',
            description: 'Bajo consumo de datos, ideal para redes lentas o limitadas',

            // Parámetros de prefetch
            prefetch_segments: 15,           // Segmentos a precargar (15 × 6s = 90s)
            parallel_downloads: 6,           // Descargas simultáneas
            buffer_target_seconds: 45,       // Buffer objetivo en segundos
            min_bandwidth_mbps: 20,          // Ancho de banda mínimo requerido

            // Configuración avanzada
            adaptive_enabled: true,          // Adaptación automática
            ai_prediction_enabled: false,    // Predicción AI desactivada
            continuous_prefetch: true,       // Prefetch continuo durante reproducción

            // Métricas estimadas (para UI)
            estimated: {
                fill_time_seconds: 15,       // Tiempo para llenar buffer
                bandwidth_usage_mbps: 30,    // Consumo de ancho de banda
                memory_usage_mb: 80,         // Uso de memoria estimado
                stall_rate_percent: 2.0      // Tasa de buffering esperada
            },

            // Recomendaciones
            best_for: ['WiFi débil', '4G con señal baja', 'Redes congestionadas', 'Data cap'],
            recommended_profiles: ['P4', 'P5']
        },

        // ─────────────────────────────────────────────────────────────────────
        // ⚖️ BALANCEADO - Equilibrio óptimo (RECOMENDADO)
        // ─────────────────────────────────────────────────────────────────────
        BALANCEADO: {
            id: 'BALANCEADO',
            name: 'Balanceado',
            icon: '⚖️',
            description: 'Equilibrio óptimo entre calidad y eficiencia (Recomendado)',

            prefetch_segments: 25,
            parallel_downloads: 10,
            buffer_target_seconds: 90,
            min_bandwidth_mbps: 40,

            adaptive_enabled: true,
            ai_prediction_enabled: false,
            continuous_prefetch: true,

            estimated: {
                fill_time_seconds: 10,
                bandwidth_usage_mbps: 60,
                memory_usage_mb: 120,
                stall_rate_percent: 0.5
            },

            best_for: ['WiFi hogareño', 'Cable estable', '5G', 'Mayoría de usuarios'],
            recommended_profiles: ['P2', 'P3', 'P4']
        },

        // ─────────────────────────────────────────────────────────────────────
        // 🚀 AGRESIVO - Alto rendimiento
        // ─────────────────────────────────────────────────────────────────────
        AGRESIVO: {
            id: 'AGRESIVO',
            name: 'Agresivo',
            icon: '🚀',
            description: 'Alto rendimiento para contenido 4K y deportes en vivo',

            prefetch_segments: 50,
            parallel_downloads: 20,
            buffer_target_seconds: 150,
            min_bandwidth_mbps: 70,

            adaptive_enabled: true,
            ai_prediction_enabled: false,
            continuous_prefetch: true,

            estimated: {
                fill_time_seconds: 6,
                bandwidth_usage_mbps: 90,
                memory_usage_mb: 200,
                stall_rate_percent: 0.1
            },

            best_for: ['Fibra ≥50 Mbps', '4K Streaming', 'Deportes en vivo'],
            recommended_profiles: ['P1', 'P2']
        },

        // ─────────────────────────────────────────────────────────────────────
        // ⚡ ULTRA-AGRESIVO - Máximo rendimiento
        // ─────────────────────────────────────────────────────────────────────
        ULTRA_AGRESIVO: {
            id: 'ULTRA_AGRESIVO',
            name: 'Ultra-Agresivo',
            icon: '⚡',
            description: 'Máximo prefetch para 8K y cero interrupciones',

            prefetch_segments: 90,
            parallel_downloads: 40,
            buffer_target_seconds: 240,
            min_bandwidth_mbps: 120,

            adaptive_enabled: true,
            ai_prediction_enabled: true,
            continuous_prefetch: true,

            estimated: {
                fill_time_seconds: 4,
                bandwidth_usage_mbps: 150,
                memory_usage_mb: 350,
                stall_rate_percent: 0.01
            },

            best_for: ['Fibra ≥100 Mbps', '8K UHD', 'Eventos premium', 'Sin limitaciones'],
            recommended_profiles: ['P0', 'P1']
        },

        // ─────────────────────────────────────────────────────────────────────
        // 🧠 ADAPTATIVO - Inteligencia automática
        // ─────────────────────────────────────────────────────────────────────
        ADAPTATIVO: {
            id: 'ADAPTATIVO',
            name: 'Adaptativo',
            icon: '🧠',
            description: 'Ajuste automático inteligente según condiciones de red',

            prefetch_segments: 'AUTO',       // Calculado dinámicamente
            parallel_downloads: 'AUTO',
            buffer_target_seconds: 'AUTO',
            min_bandwidth_mbps: 'AUTO',

            adaptive_enabled: true,
            ai_prediction_enabled: true,
            continuous_prefetch: true,

            // Rangos para modo automático
            auto_ranges: {
                prefetch_segments: { min: 10, max: 100 },
                parallel_downloads: { min: 2, max: 50 },
                buffer_target_seconds: { min: 30, max: 300 }
            },

            estimated: {
                fill_time_seconds: 'AUTO',
                bandwidth_usage_mbps: 'AUTO',
                memory_usage_mb: 'AUTO',
                stall_rate_percent: 0.05
            },

            best_for: ['Redes variables', 'Móvil + WiFi', 'Usuarios avanzados'],
            recommended_profiles: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MAPEO DE ESTRATEGIA DEFAULT POR PERFIL
    // ═══════════════════════════════════════════════════════════════════════

    const DEFAULT_STRATEGY_BY_PROFILE = {
        P0: 'ULTRA_AGRESIVO',
        P1: 'AGRESIVO',
        P2: 'AGRESIVO',
        P3: 'BALANCEADO',
        P4: 'BALANCEADO',
        P5: 'CONSERVADOR'
    };

    // ═══════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════════════════

    const PrefetchPresets = {

        /**
         * Obtiene todas las estrategias disponibles
         * @returns {Object} Mapa de estrategias
         */
        getAll() {
            return PREFETCH_STRATEGIES;
        },

        /**
         * Obtiene una estrategia por ID
         * @param {string} strategyId - ID de la estrategia
         * @returns {Object|null} Estrategia o null si no existe
         */
        get(strategyId) {
            return PREFETCH_STRATEGIES[strategyId] || null;
        },

        /**
         * Obtiene la estrategia default para un perfil
         * @param {string} profileId - ID del perfil (P0-P5)
         * @returns {Object} Estrategia default
         */
        getDefaultForProfile(profileId) {
            const strategyId = DEFAULT_STRATEGY_BY_PROFILE[profileId] || 'BALANCEADO';
            return PREFETCH_STRATEGIES[strategyId];
        },

        /**
         * Obtiene lista de IDs de estrategias para dropdown
         * @returns {Array} Lista de IDs
         */
        getStrategyIds() {
            return Object.keys(PREFETCH_STRATEGIES);
        },

        /**
         * Genera headers M3U8 para una configuración de prefetch
         * @param {Object} config - Configuración de prefetch
         * @returns {Array} Array de líneas de headers
         */
        generateM3U8Headers(config) {
            const headers = [];

            headers.push(`#EXT-X-APE-PREFETCH-STRATEGY:${config.strategy || 'BALANCEADO'}`);
            headers.push(`#EXT-X-APE-PREFETCH-SEGMENTS:${config.prefetch_segments}`);
            headers.push(`#EXT-X-APE-PREFETCH-PARALLEL:${config.parallel_downloads}`);
            headers.push(`#EXT-X-APE-PREFETCH-BUFFER-TARGET:${config.buffer_target_seconds * 1000}`);
            headers.push(`#EXT-X-APE-PREFETCH-ADAPTIVE:${config.adaptive_enabled}`);
            headers.push(`#EXT-X-APE-PREFETCH-MIN-BANDWIDTH:${config.min_bandwidth_mbps * 1000000}`);

            if (config.ai_prediction_enabled) {
                headers.push(`#EXT-X-APE-PREFETCH-AI-ENABLED:true`);
            }

            return headers;
        },

        /**
         * Valida una configuración de prefetch
         * @param {Object} config - Configuración a validar
         * @returns {Object} { valid: boolean, errors: [] }
         */
        validateConfig(config) {
            const errors = [];

            if (config.prefetch_segments !== 'AUTO') {
                if (config.prefetch_segments < 5 || config.prefetch_segments > 200) {
                    errors.push('prefetch_segments debe estar entre 5 y 200');
                }
            }

            if (config.parallel_downloads !== 'AUTO') {
                if (config.parallel_downloads < 1 || config.parallel_downloads > 50) {
                    errors.push('parallel_downloads debe estar entre 1 y 50');
                }
            }

            if (config.buffer_target_seconds !== 'AUTO') {
                if (config.buffer_target_seconds < 10 || config.buffer_target_seconds > 600) {
                    errors.push('buffer_target_seconds debe estar entre 10 y 600');
                }
            }

            return {
                valid: errors.length === 0,
                errors
            };
        },

        /**
         * Calcula métricas estimadas para una configuración custom
         * Usa StreamingEngine v3.0 (3-layer) si disponible, sino v2.0, sino legacy
         * @param {Object} config - Configuración de prefetch
         * @param {number} bitrateMbps - Bitrate del perfil en Mbps
         * @param {Object} profileInputs - Inputs adicionales del perfil (opcional)
         * @returns {Object} Métricas estimadas
         */
        estimatePerformance(config, bitrateMbps = 5, profileInputs = {}) {
            const segments = config.prefetch_segments === 'AUTO' ? 25 : config.prefetch_segments;
            const parallel = config.parallel_downloads === 'AUTO' ? 10 : config.parallel_downloads;
            const bufferSec = config.buffer_target_seconds === 'AUTO' ? 90 : config.buffer_target_seconds;
            const minBW = config.min_bandwidth_mbps === 'AUTO' ? 40 : config.min_bandwidth_mbps;

            // ═══════════════════════════════════════════════════════════════
            // OPCIÓN 1: StreamingEngine v3.0 (3-Layer Architecture)
            // ═══════════════════════════════════════════════════════════════
            if (window.StreamingEngine) {
                const engineInputs = {
                    profileId: profileInputs.profileId || 'P3',
                    resolution: profileInputs.resolution || '1920x1080',
                    codec: profileInputs.codec || 'H265',
                    fps: profileInputs.fps || 60,
                    segmentDurationSec: 6,
                    prefetchSegments: segments,
                    parallelDownloads: parallel,
                    minBandwidthMbps: minBW,
                    bufferBaseMs: 6000,
                    bufferTargetSec: bufferSec
                };

                const runtimeSignals = {
                    bitrateMbps: bitrateMbps,
                    bandwidthObservedMbps: minBW
                };

                const result = window.StreamingEngine.computeForUI(engineInputs, runtimeSignals);

                if (!result.error && result.metrics) {
                    return {
                        fill_time_seconds: result.metrics.fillTimeSec,
                        bandwidth_usage_mbps: result.metrics.bwPeakMbps,
                        bandwidth_average_mbps: result.metrics.bwAvgMbps,
                        memory_usage_mb: Math.round(result.runtimeInputs.memoryMB_real),
                        memory_peak_mb: Math.round(result.runtimeInputs.memoryMB_real * 1.125),
                        stall_rate_percent: result.metrics.stallRatePct,
                        stall_class: result.metrics.stallClass,
                        stall_color: result.metrics.stallColor,
                        stall_icon: result.metrics.stallIcon,
                        stability: {
                            class: result.metrics.stallClass,
                            label: result.metrics.stallClass,
                            color: result.metrics.stallColor,
                            icon: result.metrics.stallIcon
                        },
                        is_stable: result.ui.isStable,
                        risk_score: result.metrics.riskScore,
                        risk_level: result.metrics.riskLevel,
                        risk_color: result.metrics.riskColor,
                        headroom_percent: result.metrics.headroomPercent,
                        parallel_gain: result.metrics.parallelGain,

                        // === v3.1 METRICS ===
                        unstable_margin: result.metrics.unstableMarginUsed,
                        burst_factor: result.metrics.burstFactor,
                        stall_floor: result.metrics.stallFloor,
                        error_penalty: result.metrics.errorPenalty || 0,
                        request_overhead_sec: result.metrics.requestOverheadSec,
                        segment_duration_used: result.metrics.segmentDurationUsed,
                        meets_target: result.metrics.meetsTarget,
                        t1_mbps: result.metrics.t1Mbps,
                        t2_mbps: result.metrics.t2Mbps,
                        headroom_ratio: result.metrics.headroomRatio,

                        // Policy recommendations
                        policy_actions: result.policyResult?.actions || [],
                        policy_warnings: result.policyResult?.warnings || [],
                        has_recommendations: result.ui.hasActions || result.ui.hasWarnings,
                        warning_count: result.ui.warningCount || 0,
                        action_count: result.ui.actionCount || 0,
                        policy_status: result.ui.policyStatus || 'OK',
                        has_urgent: result.ui.hasUrgent || false,

                        // Version info
                        engine_version: result.ui.engineVersion || '3.1'
                    };
                }
            }

            // ═══════════════════════════════════════════════════════════════
            // OPCIÓN 2: StreamingCalculator v2.0 (Industrial Grade)
            // ═══════════════════════════════════════════════════════════════
            if (window.StreamingCalculator) {
                const metrics = window.StreamingCalculator.calculateAllMetrics({
                    resolution: '1920x1080',
                    codec: 'H265',
                    fps: 60,
                    compressionMult: 0.22,
                    bufferBaseMs: 6000,
                    bufferTargetSeconds: bufferSec,
                    prefetchSegments: segments,
                    parallelDownloads: parallel,
                    minBandwidthMbps: minBW
                });

                return {
                    fill_time_seconds: metrics.fillTime,
                    bandwidth_usage_mbps: metrics.bwPeak,
                    bandwidth_average_mbps: metrics.bwAverage,
                    memory_usage_mb: Math.round(metrics.memorySteady),
                    memory_peak_mb: Math.round(metrics.memoryPeak),
                    stall_rate_percent: metrics.stallRate,
                    stall_quality: metrics.stallQuality,
                    stability: metrics.stability,
                    is_stable: metrics.isStable,
                    risk_score: metrics.riskScore,
                    risk_level: metrics.riskLevel,
                    risk_color: metrics.riskColor,
                    headroom_percent: metrics.bwHeadroomPercent,
                    parallel_gain: metrics.parallelGain
                };
            }

            // ═══════════════════════════════════════════════════════════════
            // FALLBACK: Fórmulas simplificadas (legacy)
            // ═══════════════════════════════════════════════════════════════
            const segmentDuration = 6;
            const segmentSizeMb = (bitrateMbps * segmentDuration) / 8;

            // Tiempo de llenado con parallel efficiency
            const effectiveParallel = Math.min(parallel, segments);
            const parallelGain = 1 + (effectiveParallel - 1) * 0.6;
            const fillTime = Math.ceil((segments * segmentSizeMb * 8) / (minBW * 0.85 * parallelGain));

            // Uso de ancho de banda
            const bandwidthUsage = Math.min(parallel * bitrateMbps, minBW);

            // Memoria
            const memoryUsage = segments * segmentSizeMb * 1.20;

            // Buffer en segundos (CORRECTO)
            const bufferSeconds = segments * segmentDuration;

            // Stall rate (fórmula exponencial con hard rule)
            const headroom = minBW / bitrateMbps;
            let stallRate;

            if (headroom < 1.15) {
                // UNSTABLE: stall inevitable
                stallRate = 50 + (1 - headroom) * 50;
            } else {
                const k = 0.5 * Math.min(2, headroom);
                const exponent = -k * (bufferSeconds / segmentDuration);
                stallRate = 100 * Math.exp(exponent);
                if (bufferSeconds >= 60) stallRate *= 0.8;
                if (bufferSeconds >= 120) stallRate *= 0.7;
            }
            stallRate = Math.max(0.01, Math.min(100, stallRate));

            return {
                fill_time_seconds: fillTime,
                bandwidth_usage_mbps: Math.round(bandwidthUsage),
                memory_usage_mb: Math.round(memoryUsage),
                stall_rate_percent: Math.round(stallRate * 100) / 100,
                is_stable: headroom >= 1.15,
                headroom_percent: Math.round((headroom - 1) * 100)
            };
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════

    window.PREFETCH_PRESETS = PrefetchPresets;
    window.PREFETCH_STRATEGIES = PREFETCH_STRATEGIES;

    console.log('%c⚡ Prefetch Presets v1.0 Cargado', 'color: #10b981; font-weight: bold;');
    console.log(`   📦 ${Object.keys(PREFETCH_STRATEGIES).length} estrategias disponibles`);

})();
