/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 STREAMING CALCULATOR v2.0 - IPTV Navigator PRO (INDUSTRIAL GRADE)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Motor de cálculo profesional para métricas de streaming.
 * Basado en estándares de industria: Netflix, Dolby, RFC 8216.
 * 
 * v2.0 IMPROVEMENTS (Industrial Grade):
 * - Hard stability rule: BW < bitrate*1.15 = UNSTABLE
 * - Correct bufferSeconds = prefetchSegments * SEGMENT_DURATION
 * - Parallel efficiency (non-linear gain)
 * - Separate peak vs average BW
 * - Jitter based on playerBuffer (not total)
 * - Memory overhead 1.20 (realistic for JS/player)
 * - Rebuffer Risk Score (0-100)
 * - Config sanity checks
 * - Legacy vs Pro mode
 * 
 * FECHA: 2026-02-01
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTES DE INDUSTRIA v2.0
    // ═══════════════════════════════════════════════════════════════════════

    const CONSTANTS = {
        // Duración típica de segmento HLS (segundos)
        SEGMENT_DURATION: 6,
        VALID_SEGMENT_DURATIONS: [2, 4, 6, 10],

        // Factor de seguridad para stall rate
        STALL_RATE_K_DEFAULT: 0.5,
        STALL_RATE_K_STABLE: 0.7,
        STALL_RATE_K_UNSTABLE: 0.2,

        // Target de stall rate (industria: <1.67% = experiencia aceptable)
        TARGET_STALL_RATE: 1.67,

        // ⚠️ SAFETY MARGIN: Si BW < bitrate * SAFETY_MARGIN → UNSTABLE
        SAFETY_MARGIN: 1.15,  // Mínimo 15% headroom

        // Overhead de memoria (JS web realista: 1.15-1.35)
        MEMORY_OVERHEAD_STEADY: 1.20,
        MEMORY_OVERHEAD_PEAK: 1.35,  // Con reintentos/duplicación

        // Eficiencia de descargas paralelas (no lineal)
        // parallelGain = 1 + (effectiveParallel - 1) * PARALLEL_EFFICIENCY
        PARALLEL_EFFICIENCY: 0.6,

        // Eficiencia de red (overhead TCP/HTTP)
        NETWORK_EFFICIENCY: 0.85,

        // Multiplicadores de throughput
        THROUGHPUT_T1_MULT: 1.3,
        THROUGHPUT_T2_MULT: 1.6,

        // Ratio buffer 4:4:1 (Network:Live:Player)
        BUFFER_RATIO: {
            NETWORK: 4,
            LIVE: 4,
            PLAYER: 1
        },

        // BPP (Bits Per Pixel) por codec y resolución
        BITS_PER_PIXEL: {
            'AV1_8K': 0.06, 'AV1_UHD': 0.08, 'AV1_FHD': 0.12, 'AV1_HD': 0.18, 'AV1_SD': 0.22,
            'H265_8K': 0.08, 'H265_UHD': 0.10, 'H265_FHD': 0.15, 'H265_HD': 0.20, 'H265_SD': 0.25,
            'HEVC_8K': 0.08, 'HEVC_UHD': 0.10, 'HEVC_FHD': 0.15, 'HEVC_HD': 0.20, 'HEVC_SD': 0.25,
            'VP9_8K': 0.09, 'VP9_UHD': 0.11, 'VP9_FHD': 0.16, 'VP9_HD': 0.21, 'VP9_SD': 0.26,
            'H264_8K': 0.12, 'H264_UHD': 0.15, 'H264_FHD': 0.20, 'H264_HD': 0.25, 'H264_SD': 0.30,
            'AVC_8K': 0.12, 'AVC_UHD': 0.15, 'AVC_FHD': 0.20, 'AVC_HD': 0.25, 'AVC_SD': 0.30,
            'MPEG2_UHD': 0.20, 'MPEG2_FHD': 0.28, 'MPEG2_HD': 0.35, 'MPEG2_SD': 0.40
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // NIVELES DE ESTABILIDAD (Hard Rules)
    // ═══════════════════════════════════════════════════════════════════════

    const STABILITY_CLASS = {
        OPTIMAL: {
            minRatio: 2.0,
            label: 'Óptimo',
            color: '#10b981',
            icon: '🟢',
            description: 'Headroom ≥100%: experiencia premium'
        },
        STABLE: {
            minRatio: 1.5,
            label: 'Estable',
            color: '#22c55e',
            icon: '🟢',
            description: 'Headroom ≥50%: reproducción fluida'
        },
        ADEQUATE: {
            minRatio: 1.25,
            label: 'Adecuado',
            color: '#eab308',
            icon: '🟡',
            description: 'Headroom 25%: margen justo'
        },
        MARGINAL: {
            minRatio: 1.15,
            label: 'Marginal',
            color: '#f97316',
            icon: '🟠',
            description: 'Headroom 15%: riesgo moderado'
        },
        UNSTABLE: {
            minRatio: 0,
            label: 'Inestable',
            color: '#ef4444',
            icon: '🔴',
            description: 'BW insuficiente: stalls inevitables'
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // NIVELES DE CALIDAD PARA STALL RATE (UI)
    // ═══════════════════════════════════════════════════════════════════════

    const STALL_QUALITY_LEVELS = {
        EXCELLENT: { max: 0.5, label: 'Excelente', color: '#10b981', icon: '🌟' },
        GOOD: { max: 1.0, label: 'Bueno', color: '#22c55e', icon: '✅' },
        ACCEPTABLE: { max: 1.67, label: 'Aceptable', color: '#eab308', icon: '⚡' },
        WARNING: { max: 3.0, label: 'Advertencia', color: '#f97316', icon: '⚠️' },
        POOR: { max: 100, label: 'Deficiente', color: '#ef4444', icon: '❌' }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL: StreamingCalculator v2.0
    // ═══════════════════════════════════════════════════════════════════════

    class StreamingCalculator {

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 🔒 VALIDACIÓN DE CONFIGURACIÓN (Sanity Checks)
         * ═══════════════════════════════════════════════════════════════════
         */
        static validateConfig(config) {
            const errors = [];
            const warnings = [];

            // Validaciones críticas
            if (!config.bitrateMbps || config.bitrateMbps <= 0) {
                errors.push('bitrateMbps debe ser > 0');
            }
            if (!config.bandwidthMbps || config.bandwidthMbps <= 0) {
                errors.push('bandwidthMbps debe ser > 0');
            }
            if (!config.prefetchSegments || config.prefetchSegments < 1) {
                errors.push('prefetchSegments debe ser >= 1');
            }
            if (!config.parallelDownloads || config.parallelDownloads < 1) {
                errors.push('parallelDownloads debe ser >= 1');
            }

            // Validaciones de advertencia
            if (config.parallelDownloads > config.prefetchSegments) {
                warnings.push(`parallelDownloads (${config.parallelDownloads}) > prefetchSegments (${config.prefetchSegments}), se usará ${config.prefetchSegments}`);
            }

            const segDur = config.segmentDuration || CONSTANTS.SEGMENT_DURATION;
            if (!CONSTANTS.VALID_SEGMENT_DURATIONS.includes(segDur)) {
                warnings.push(`segmentDuration (${segDur}) no estándar, usar: ${CONSTANTS.VALID_SEGMENT_DURATIONS.join(', ')}`);
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings
            };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 🚦 CLASE DE ESTABILIDAD (Hard Rule)
         * ═══════════════════════════════════════════════════════════════════
         * REGLA DURA: Si BW < bitrate * 1.15 → UNSTABLE (stalls inevitables)
         */
        static getStabilityClass(bandwidthMbps, bitrateMbps) {
            const ratio = bandwidthMbps / bitrateMbps;
            const headroomPercent = Math.round((ratio - 1) * 100);

            for (const [className, config] of Object.entries(STABILITY_CLASS)) {
                if (ratio >= config.minRatio) {
                    return {
                        class: className,
                        ratio: Math.round(ratio * 100) / 100,
                        headroomPercent,
                        ...config
                    };
                }
            }

            return {
                class: 'UNSTABLE',
                ratio: Math.round(ratio * 100) / 100,
                headroomPercent,
                ...STABILITY_CLASS.UNSTABLE
            };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 📐 CÁLCULO DE BITRATE
         * ═══════════════════════════════════════════════════════════════════
         */
        static calculateBitrate(resolution, codec, fps, compressionMult = 0.22) {
            const [width, height] = (resolution || '1920x1080').toString().toLowerCase().split('x').map(Number);
            const pixels = (width || 1920) * (height || 1080);

            let resLabel = 'FHD';
            if (pixels >= 33000000) resLabel = '8K';
            else if (pixels >= 8000000) resLabel = 'UHD';
            else if (pixels >= 2000000) resLabel = 'FHD';
            else if (pixels >= 900000) resLabel = 'HD';
            else resLabel = 'SD';

            const bppKey = `${(codec || 'HEVC').toString().toUpperCase()}_${resLabel}`;
            const bpp = CONSTANTS.BITS_PER_PIXEL[bppKey] || 0.15;
            const bitrateBase = (pixels * fps * bpp) / 1000000;

            return Math.round(bitrateBase * compressionMult * 10) / 10;
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 📊 CÁLCULO DE STALL RATE (con Hard Rule)
         * ═══════════════════════════════════════════════════════════════════
         * 
         * REGLA DURA: Si stability = UNSTABLE → stall alto forzado
         * 
         * Fórmula base: Stall% = 100 × e^(-k × B/S)
         */
        static calculateStallRate(bufferSeconds, bitrateMbps, bandwidthMbps, k = CONSTANTS.STALL_RATE_K_DEFAULT) {
            // Validación
            if (bufferSeconds <= 0 || bitrateMbps <= 0 || bandwidthMbps <= 0) {
                return { probability: 100, stabilityClass: 'UNSTABLE' };
            }

            // REGLA DURA: Verificar estabilidad
            const stability = this.getStabilityClass(bandwidthMbps, bitrateMbps);

            if (stability.class === 'UNSTABLE') {
                // Si BW < bitrate * 1.15, el stall es inevitable
                return {
                    probability: Math.min(100, 50 + (1 - stability.ratio) * 100),
                    stabilityClass: stability.class,
                    stability,
                    forced: true,
                    message: 'BW insuficiente: stalls inevitables'
                };
            }

            // Fórmula exponencial normal
            const throughputRatio = bandwidthMbps / bitrateMbps;
            const adjustedK = k * Math.min(2, Math.max(0.5, throughputRatio));
            const exponent = -adjustedK * (bufferSeconds / CONSTANTS.SEGMENT_DURATION);
            let stallRate = 100 * Math.exp(exponent);

            // Ajustes por buffer alto
            if (bufferSeconds >= 60) stallRate *= 0.8;
            if (bufferSeconds >= 120) stallRate *= 0.7;

            // Limitar
            stallRate = Math.max(0.01, Math.min(100, stallRate));

            return {
                probability: Math.round(stallRate * 100) / 100,
                stabilityClass: stability.class,
                stability,
                forced: false
            };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * ⏱️ CÁLCULO DE TIEMPO DE LLENADO (con Parallel Efficiency)
         * ═══════════════════════════════════════════════════════════════════
         * 
         * FIX: No asume ganancia perfecta de paralelo
         * parallelGain = 1 + (effectiveParallel - 1) * PARALLEL_EFFICIENCY
         */
        static calculateFillTime(prefetchSegments, bitrateMbps, parallelDownloads, bandwidthMbps) {
            // Tamaño de segmento en MB
            const segmentSizeMB = (bitrateMbps * CONSTANTS.SEGMENT_DURATION) / 8;

            // Total a descargar en MB
            const totalMB = prefetchSegments * segmentSizeMB;

            // Paralelismo efectivo (no puede ser mayor que segmentos)
            const effectiveParallel = Math.min(parallelDownloads, prefetchSegments);

            // Ganancia de paralelo NO lineal
            // parallelGain = 1 + (effectiveParallel - 1) * 0.6
            const parallelGain = 1 + (effectiveParallel - 1) * CONSTANTS.PARALLEL_EFFICIENCY;

            // Ancho de banda efectivo (con efficiency de red)
            const effectiveBWMbps = bandwidthMbps * CONSTANTS.NETWORK_EFFICIENCY;
            const effectiveBWMBps = effectiveBWMbps / 8;

            // Tiempo de llenado
            const fillTime = totalMB / (effectiveBWMBps * parallelGain);

            return {
                seconds: Math.max(1, Math.ceil(fillTime)),
                parallelGain: Math.round(parallelGain * 100) / 100,
                effectiveParallel,
                totalMB: Math.round(totalMB * 10) / 10
            };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 📶 CÁLCULO DE USO DE ANCHO DE BANDA (Peak vs Average)
         * ═══════════════════════════════════════════════════════════════════
         * 
         * FIX: Separar Peak Request Rate vs Average BW
         */
        static calculateBandwidthUsage(parallelDownloads, bitrateMbps, bandwidthMbps) {
            // Average BW: aproximadamente el bitrate del stream
            const averageBW = bitrateMbps;

            // Peak BW: picos durante descarga de segmentos
            // Teóricamente parallel * bitrate, limitado por bandwidth disponible
            const theoreticalPeak = parallelDownloads * bitrateMbps * 1.2; // 20% burst
            const peakBW = Math.min(theoreticalPeak, bandwidthMbps);

            // Headroom: cuánto margen hay
            const headroom = bandwidthMbps / bitrateMbps;

            return {
                average: Math.round(averageBW * 10) / 10,
                peak: Math.round(peakBW * 10) / 10,
                headroom: Math.round(headroom * 100) / 100,
                headroomPercent: Math.round((headroom - 1) * 100)
            };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 💾 CÁLCULO DE USO DE MEMORIA (Peak vs Steady)
         * ═══════════════════════════════════════════════════════════════════
         */
        static calculateMemoryUsage(prefetchSegments, bitrateMbps) {
            const segmentSizeMB = (bitrateMbps * CONSTANTS.SEGMENT_DURATION) / 8;
            const baseMemory = prefetchSegments * segmentSizeMB;

            return {
                base: Math.round(baseMemory * 10) / 10,
                steady: Math.round(baseMemory * CONSTANTS.MEMORY_OVERHEAD_STEADY * 10) / 10,
                peak: Math.round(baseMemory * CONSTANTS.MEMORY_OVERHEAD_PEAK * 10) / 10
            };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 🔧 CÁLCULO DE BUFFERS (Ratio 4:4:1)
         * ═══════════════════════════════════════════════════════════════════
         */
        static calculateBuffers(bufferBaseMs) {
            const networkMs = bufferBaseMs;
            const liveMs = bufferBaseMs;
            const playerMs = Math.max(250, Math.floor(bufferBaseMs / 4));

            return {
                network: networkMs,
                live: liveMs,
                player: playerMs,
                total: networkMs + liveMs + playerMs
            };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 📏 CÁLCULO DE JITTER MÁXIMO (basado en Player Buffer)
         * ═══════════════════════════════════════════════════════════════════
         * 
         * FIX: Usar playerBufferMs, no buffer total
         */
        static calculateMaxJitter(playerBufferMs) {
            const segmentMs = CONSTANTS.SEGMENT_DURATION * 1000;
            // Jitter max = playerBuffer - 0.5 * segmentDuration (más conservador)
            return Math.max(0, playerBufferMs - Math.floor(segmentMs * 0.5));
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 📊 BUFFER SECONDS CORRECTO
         * ═══════════════════════════════════════════════════════════════════
         * 
         * FIX: bufferSeconds = prefetchSegments * SEGMENT_DURATION
         */
        static calculateBufferSeconds(prefetchSegments, bufferTargetSeconds = null) {
            const segmentBuffer = prefetchSegments * CONSTANTS.SEGMENT_DURATION;

            if (bufferTargetSeconds && bufferTargetSeconds > 0) {
                return Math.min(bufferTargetSeconds, segmentBuffer);
            }

            return segmentBuffer;
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 🎯 REBUFFER RISK SCORE (0-100)
         * ═══════════════════════════════════════════════════════════════════
         * 
         * Score único basado en múltiples factores:
         * - throughput ratio (40%)
         * - buffer seconds (30%)
         * - fill time (15%)
         * - jitter margin (15%)
         */
        static calculateRiskScore(metrics) {
            const {
                stabilityClass,
                bufferSeconds,
                fillTime,
                jitterMax,
                headroom
            } = metrics;

            // Si es UNSTABLE, riesgo máximo
            if (stabilityClass === 'UNSTABLE') {
                return { score: 95, level: 'CRITICAL', color: '#ef4444' };
            }

            let score = 0;

            // Factor 1: Throughput/Headroom (40 puntos)
            // headroom 2+ = 0 puntos, headroom 1 = 40 puntos
            const headroomScore = Math.max(0, 40 - (headroom - 1) * 20);
            score += headroomScore;

            // Factor 2: Buffer seconds (30 puntos)
            // 120s+ = 0 puntos, 0s = 30 puntos
            const bufferScore = Math.max(0, 30 - (bufferSeconds / 4));
            score += bufferScore;

            // Factor 3: Fill time (15 puntos)
            // 3s = 0 puntos, 30s+ = 15 puntos
            const fillScore = Math.min(15, (fillTime - 3) * 0.5);
            score += fillScore;

            // Factor 4: Jitter margin (15 puntos)
            // 6000ms+ = 0 puntos, 0ms = 15 puntos
            const jitterScore = Math.max(0, 15 - (jitterMax / 400));
            score += jitterScore;

            // Clamp y redondear
            score = Math.max(0, Math.min(100, Math.round(score)));

            // Determinar nivel
            let level, color;
            if (score <= 20) { level = 'LOW'; color = '#10b981'; }
            else if (score <= 40) { level = 'MODERATE'; color = '#22c55e'; }
            else if (score <= 60) { level = 'ELEVATED'; color = '#eab308'; }
            else if (score <= 80) { level = 'HIGH'; color = '#f97316'; }
            else { level = 'CRITICAL'; color = '#ef4444'; }

            return { score, level, color };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 🎯 OBTENER NIVEL DE CALIDAD PARA STALL RATE
         * ═══════════════════════════════════════════════════════════════════
         */
        static getStallQualityLevel(stallRate) {
            for (const [level, config] of Object.entries(STALL_QUALITY_LEVELS)) {
                if (stallRate <= config.max) {
                    return {
                        level,
                        ...config,
                        meetsTarget: stallRate <= CONSTANTS.TARGET_STALL_RATE
                    };
                }
            }
            return { level: 'POOR', ...STALL_QUALITY_LEVELS.POOR, meetsTarget: false };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 📊 CÁLCULO DE THROUGHPUT T1 Y T2
         * ═══════════════════════════════════════════════════════════════════
         */
        static calculateThroughput(bitrateMbps) {
            return {
                t1: Math.round(bitrateMbps * CONSTANTS.THROUGHPUT_T1_MULT * 10) / 10,
                t2: Math.round(bitrateMbps * CONSTANTS.THROUGHPUT_T2_MULT * 10) / 10
            };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 🔄 CÁLCULO COMPLETO DE TODAS LAS MÉTRICAS v2.0
         * ═══════════════════════════════════════════════════════════════════
         * 
         * @param {Object} config - Configuración del perfil
         * @param {Object} options - { mode: 'legacy' | 'pro' }
         */
        static calculateAllMetrics(config, options = { mode: 'pro' }) {
            // Defaults
            const {
                resolution = '1920x1080',
                codec = 'H265',
                fps = 60,
                strategy = 'balanced',
                compressionMult = 0.22,
                bufferBaseMs = 6000,
                prefetchSegments = 25,
                parallelDownloads = 10,
                minBandwidthMbps = 40,
                bufferTargetSeconds = null
            } = config;

            // Sanitize
            const safeParallel = Math.min(parallelDownloads, prefetchSegments);

            // 1. Validación
            const validation = this.validateConfig({
                bitrateMbps: 1, // placeholder, se calcula después
                bandwidthMbps: minBandwidthMbps,
                prefetchSegments,
                parallelDownloads: safeParallel
            });

            // 2. Bitrate
            const bitrate = this.calculateBitrate(resolution, codec, fps, compressionMult);

            // 3. Throughput T1, T2
            const throughput = this.calculateThroughput(bitrate);

            // 4. Buffers
            const buffers = this.calculateBuffers(bufferBaseMs);

            // 5. Buffer seconds (CORREGIDO)
            const bufferSeconds = this.calculateBufferSeconds(prefetchSegments, bufferTargetSeconds);

            // 6. Stability Class (REGLA DURA)
            const stability = this.getStabilityClass(minBandwidthMbps, bitrate);

            // 7. Jitter Max (basado en player buffer, no total)
            const jitterMax = this.calculateMaxJitter(buffers.player);

            // 8. Memoria (peak y steady)
            const memory = this.calculateMemoryUsage(prefetchSegments, bitrate);

            // 9. Fill Time (con parallel efficiency)
            const fillTimeResult = this.calculateFillTime(
                prefetchSegments, bitrate, safeParallel, minBandwidthMbps
            );

            // 10. Bandwidth usage (peak vs average)
            const bwUsage = this.calculateBandwidthUsage(safeParallel, bitrate, minBandwidthMbps);

            // 11. Stall Rate (con hard rule)
            const stallResult = this.calculateStallRate(
                bufferSeconds, bitrate, minBandwidthMbps
            );

            // 12. Stall Quality Level
            const stallQuality = this.getStallQualityLevel(stallResult.probability);

            // 13. Risk Score
            const riskScore = this.calculateRiskScore({
                stabilityClass: stability.class,
                bufferSeconds,
                fillTime: fillTimeResult.seconds,
                jitterMax,
                headroom: bwUsage.headroom
            });

            return {
                // Metadata
                version: '2.0',
                mode: options.mode,
                validation,

                // Bitrate y Throughput
                bitrate,
                t1: throughput.t1,
                t2: throughput.t2,

                // Buffers
                bufferNetwork: buffers.network,
                bufferLive: buffers.live,
                bufferPlayer: buffers.player,
                bufferTotal: buffers.total,
                bufferSeconds,

                // Stability (HARD RULE)
                stability,
                isStable: stability.class !== 'UNSTABLE',

                // Jitter
                jitterMax,

                // Memoria
                memoryBase: memory.base,
                memorySteady: memory.steady,
                memoryPeak: memory.peak,

                // Fill Time
                fillTime: fillTimeResult.seconds,
                parallelGain: fillTimeResult.parallelGain,
                effectiveParallel: fillTimeResult.effectiveParallel,

                // Bandwidth
                bwAverage: bwUsage.average,
                bwPeak: bwUsage.peak,
                bwHeadroom: bwUsage.headroom,
                bwHeadroomPercent: bwUsage.headroomPercent,

                // Stall Rate
                stallRate: stallResult.probability,
                stallForced: stallResult.forced,
                stallQuality,
                meetsTarget: stallQuality.meetsTarget,

                // Risk Score
                riskScore: riskScore.score,
                riskLevel: riskScore.level,
                riskColor: riskScore.color,

                // Constants for UI
                targetStallRate: CONSTANTS.TARGET_STALL_RATE,
                segmentDuration: CONSTANTS.SEGMENT_DURATION,
                safetyMargin: CONSTANTS.SAFETY_MARGIN
            };
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * 🔄 MODO LEGACY (Compatibilidad con v1.0)
         * ═══════════════════════════════════════════════════════════════════
         */
        static calculateLegacy(config) {
            const result = this.calculateAllMetrics(config, { mode: 'legacy' });

            // Formato v1.0 compatible
            return {
                bitrate: result.bitrate,
                t1: result.t1,
                t2: result.t2,
                fillTime: result.fillTime,
                bwUsage: result.bwPeak,
                memoryPure: result.memoryBase,
                memoryReal: result.memorySteady,
                stallRate: result.stallRate,
                jitterMax: result.jitterMax,
                bufferTotal: result.bufferTotal
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════

    window.StreamingCalculator = StreamingCalculator;
    window.STREAMING_CONSTANTS = CONSTANTS;
    window.STABILITY_CLASS = STABILITY_CLASS;
    window.STALL_QUALITY_LEVELS = STALL_QUALITY_LEVELS;

    console.log('%c📊 Streaming Calculator v2.0 (Industrial Grade)', 'color: #10b981; font-weight: bold;');
    console.log(`   🎯 Target Stall Rate: <${CONSTANTS.TARGET_STALL_RATE}%`);
    console.log(`   ⚠️ Safety Margin: ${CONSTANTS.SAFETY_MARGIN}x (BW/Bitrate)`);
    console.log(`   📦 Segment Duration: ${CONSTANTS.SEGMENT_DURATION}s`);

})();
