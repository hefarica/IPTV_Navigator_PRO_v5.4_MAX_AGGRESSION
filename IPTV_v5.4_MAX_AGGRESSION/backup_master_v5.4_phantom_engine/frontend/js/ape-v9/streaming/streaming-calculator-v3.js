/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 STREAMING CALCULATOR v3.1 - IPTV Navigator PRO (Production Ready)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CAPA 2: Calculator (Métricas Puras, Determinísticas)
 * 
 * v3.1 IMPROVEMENTS (Production Ready):
 * 1. Adaptive UNSTABLE margin by profile (base + codec/fps/4K/live penalties)
 * 2. Variable segment duration support (observed vs input)
 * 3. Fill Time with request overhead penalty
 * 4. BW Peak with burstiness factor (log2 parallel + segDur)
 * 5. Stall Rate floor based on headroom (avoid false 0.01%)
 * 6. Risk Score with error pressure component
 * 
 * FECHA: 2026-02-01
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTES DE CÁLCULO v3.1
    // ═══════════════════════════════════════════════════════════════════════

    const CALC_CONSTANTS = {
        // Multiplicadores de throughput
        T1_MULTIPLIER: 1.3,
        T2_MULTIPLIER: 1.6,

        // Eficiencia de red (overhead TCP/HTTP)
        DEFAULT_NET_EFFICIENCY: 0.85,

        // Eficiencia de paralelo (ganancia no lineal)
        DEFAULT_PARALLEL_GAIN_FACTOR: 0.6,

        // Stall rate
        DEFAULT_STALL_K: 0.5,

        // ⚠️ v3.1: UNSTABLE margin ahora es adaptativo por perfil
        // Base margin + penalties por codec/fps/4K/live
        BASE_UNSTABLE_MARGIN: 1.15,
        PENALTY_60FPS: 0.05,
        PENALTY_4K: 0.10,
        PENALTY_8K: 0.15,
        PENALTY_HEVC_DECODE: 0.03,  // Some devices have decode spikes
        PENALTY_LIVE: 0.05,

        // Target stall rate (industria)
        TARGET_STALL_RATE: 1.67,

        // v3.1: Request overhead for fill time
        BASE_REQUEST_OVERHEAD_MS: 30,
        PER_PARALLEL_OVERHEAD_MS: 15
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CLASES DE STALL
    // ═══════════════════════════════════════════════════════════════════════

    const STALL_CLASSES = {
        EXCELLENT: { max: 0.5, color: '#10b981', icon: '🌟' },
        GOOD: { max: 1.0, color: '#22c55e', icon: '✅' },
        ACCEPTABLE: { max: 1.67, color: '#eab308', icon: '⚡' },
        WARNING: { max: 3.0, color: '#f97316', icon: '⚠️' },
        POOR: { max: 15.0, color: '#ef4444', icon: '❌' },
        UNSTABLE: { max: 100, color: '#dc2626', icon: '🔴' }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // v3.1: CÁLCULO DE UNSTABLE MARGIN ADAPTATIVO
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Calcula el margen UNSTABLE adaptativo por perfil
     * base 1.15 + penalizaciones por codec/fps/resolución/live
     */
    function _calculateAdaptiveUnstableMargin(profileInputs, opts = {}) {
        let margin = opts.baseMargin ?? CALC_CONSTANTS.BASE_UNSTABLE_MARGIN;

        // Penalty: 60fps
        const fps = Number(profileInputs.fps || 30);
        if (fps >= 60) {
            margin += CALC_CONSTANTS.PENALTY_60FPS;
        }

        // Penalty: 4K/8K resolution
        const resolution = String(profileInputs.resolution || '1920x1080').toLowerCase();
        const [width] = resolution.split('x').map(Number);
        if (width >= 7680) {
            margin += CALC_CONSTANTS.PENALTY_8K;
        } else if (width >= 3840) {
            margin += CALC_CONSTANTS.PENALTY_4K;
        }

        // Penalty: HEVC decode spikes (optional)
        const codec = String(profileInputs.codec || 'H264').toUpperCase();
        if (codec.includes('265') || codec.includes('HEVC')) {
            margin += CALC_CONSTANTS.PENALTY_HEVC_DECODE;
        }

        // Penny: Live stream
        const isLive = profileInputs.isLive || profileInputs.live || false;
        if (isLive) {
            margin += CALC_CONSTANTS.PENALTY_LIVE;
        }

        // Max reasonable margin
        return _clamp(margin, 1.10, 1.50);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // v3.1: SEGMENT DURATION CON SOPORTE PARA OBSERVADO
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Calcula segment duration efectiva (observed vs input)
     */
    function _getEffectiveSegmentDuration(runtimeInputs, profileInputs) {
        const inputDur = runtimeInputs.segmentDurationSec || 6;
        const observedDur = runtimeInputs.segmentDurationObservedSec ||
            profileInputs.segmentDurationObservedSec;

        if (observedDur && observedDur > 0) {
            // Clamp observed to ±30% of input
            return _clamp(observedDur, inputDur * 0.7, inputDur * 1.3);
        }

        return inputDur;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // v3.1: BURSTINESS FACTOR PARA BW PEAK
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Calcula burst factor basado en paralelo y segment duration
     * burstFactor = 1.0 + 0.1*log2(parallel) + 0.05*(segDur<=4 ? 1 : 0)
     */
    function _calculateBurstFactor(parallel, segmentDurationSec) {
        const parallelFactor = 0.1 * Math.log2(Math.max(1, parallel));
        const shortSegmentFactor = segmentDurationSec <= 4 ? 0.05 : 0;
        return 1.0 + parallelFactor + shortSegmentFactor;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCIÓN PRINCIPAL: computeMetrics v3.1
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Calcula todas las métricas a partir de inputs resueltos
     * 
     * @param {Object} profileInputs - Inputs del perfil
     * @param {Object} runtimeInputs - Inputs resueltos del Resolver
     * @param {Object} opts - Opciones de cálculo
     * @returns {Object} Metrics calculadas
     */
    function computeMetrics(profileInputs, runtimeInputs, opts = {}) {
        // v3.1: Segment duration efectiva (observed vs input)
        const SEG = _getEffectiveSegmentDuration(runtimeInputs, profileInputs);
        const bitrate = runtimeInputs.bitrateMbps;
        const bwSafe = runtimeInputs.bandwidthSafeMbps;

        // ═══════════════════════════════════════════════════════════════════
        // 1) THROUGHPUT TARGETS
        // ═══════════════════════════════════════════════════════════════════
        const t1Mbps = bitrate * CALC_CONSTANTS.T1_MULTIPLIER;
        const t2Mbps = bitrate * CALC_CONSTANTS.T2_MULTIPLIER;

        // ═══════════════════════════════════════════════════════════════════
        // 2) HEADROOM RATIO
        // ═══════════════════════════════════════════════════════════════════
        const headroomRatio = bwSafe / Math.max(0.1, bitrate);

        // ═══════════════════════════════════════════════════════════════════
        // 3) v3.1: ADAPTIVE UNSTABLE MARGIN
        // ═══════════════════════════════════════════════════════════════════
        const adaptiveMargin = opts.unstableMargin ??
            _calculateAdaptiveUnstableMargin(profileInputs, opts);

        // ═══════════════════════════════════════════════════════════════════
        // 4) FILL TIME (con request overhead)
        // ═══════════════════════════════════════════════════════════════════
        const prefetchSegments = runtimeInputs.prefetchSegments;
        const parallel = runtimeInputs.parallelDownloads;
        const segmentSizeMB = runtimeInputs.segmentSizeMB;
        const totalMB = prefetchSegments * segmentSizeMB;

        const efficiency = _clamp(
            opts.netEfficiency ?? CALC_CONSTANTS.DEFAULT_NET_EFFICIENCY,
            0.5,
            0.95
        );

        const effectiveParallel = Math.min(parallel, prefetchSegments);
        const parallelGainFactor = opts.parallelGainFactor ?? CALC_CONSTANTS.DEFAULT_PARALLEL_GAIN_FACTOR;
        const parallelGain = 1 + (effectiveParallel - 1) * parallelGainFactor;

        const effectiveMbps = Math.max(0.1, bwSafe * efficiency);

        // Base fill time
        let fillTimeSec = (totalMB * 8) / (effectiveMbps * parallelGain);

        // v3.1: Add request overhead penalty
        const reqOverheadMs = CALC_CONSTANTS.BASE_REQUEST_OVERHEAD_MS +
            (parallel * CALC_CONSTANTS.PER_PARALLEL_OVERHEAD_MS);
        const overheadSec = (prefetchSegments * reqOverheadMs) / 1000 / parallelGain;
        fillTimeSec += overheadSec;

        // ═══════════════════════════════════════════════════════════════════
        // 5) v3.1: BANDWIDTH PEAK con Burst Factor
        // ═══════════════════════════════════════════════════════════════════
        const bwAvgMbps = bitrate;
        const burstFactor = _calculateBurstFactor(parallel, SEG);
        const bwPeakMbps = Math.min(
            parallel * bitrate * burstFactor,
            bwSafe * 1.2  // Can't exceed available + 20% burst
        );

        // ═══════════════════════════════════════════════════════════════════
        // 6) STALL RATE (con floor y adaptive margin)
        // ═══════════════════════════════════════════════════════════════════
        const stallResult = _calculateStallRate({
            bufferSec: runtimeInputs.bufferPrefetchSec,
            segmentDurationSec: SEG,
            bitrateMbps: bitrate,
            bandwidthSafeMbps: bwSafe,
            kBase: opts.stallK ?? CALC_CONSTANTS.DEFAULT_STALL_K,
            unstableMargin: adaptiveMargin,
            headroomRatio  // v3.1: Para calcular floor
        });

        // ═══════════════════════════════════════════════════════════════════
        // 7) JITTER MAX (basado en player buffer)
        // ═══════════════════════════════════════════════════════════════════
        const jitterMaxMs = Math.max(0, runtimeInputs.bufferPlayerMs - (SEG * 1000));

        // ═══════════════════════════════════════════════════════════════════
        // 8) v3.1: RISK SCORE con Error Pressure
        // ═══════════════════════════════════════════════════════════════════
        const errorSignals = opts.errorSignals || runtimeInputs.errorSignals || {};
        const riskScore = _calculateRiskScore({
            stallRatePct: stallResult.stallRatePct,
            headroomRatio,
            fillTimeSec,
            jitterMaxMs,
            errors429: errorSignals.errors429 || 0,
            errors5xx: errorSignals.errors5xx || 0,
            timeouts: errorSignals.timeoutsCount || 0
        });

        // ═══════════════════════════════════════════════════════════════════
        // RETURN: Metrics v3.1
        // ═══════════════════════════════════════════════════════════════════
        return {
            // Version
            version: '3.1',

            t1Mbps: _round1(t1Mbps),
            t2Mbps: _round1(t2Mbps),

            fillTimeSec: _round1(fillTimeSec),
            parallelGain: _round2(parallelGain),
            requestOverheadSec: _round2(overheadSec),

            bwAvgMbps: _round1(bwAvgMbps),
            bwPeakMbps: _round1(bwPeakMbps),
            burstFactor: _round2(burstFactor),
            headroomRatio: _round2(headroomRatio),
            headroomPercent: Math.round((headroomRatio - 1) * 100),

            // v3.1: Renamed to "Predicted Stall" for clarity
            predictedStallPct: _round2(stallResult.stallRatePct),
            stallRatePct: _round2(stallResult.stallRatePct),  // Alias for compatibility
            stallClass: stallResult.stallClass,
            stallColor: stallResult.stallColor,
            stallIcon: stallResult.stallIcon,
            stallFloor: _round2(stallResult.stallFloor || 0.01),
            meetsTarget: stallResult.stallRatePct <= CALC_CONSTANTS.TARGET_STALL_RATE,

            // v3.1: Adaptive margin used
            unstableMarginUsed: _round2(adaptiveMargin),

            jitterMaxMs: Math.round(jitterMaxMs),

            riskScore: riskScore.score,
            riskLevel: riskScore.level,
            riskColor: riskScore.color,
            errorPenalty: riskScore.errorPenalty,

            // Segment duration (actual used)
            segmentDurationUsed: SEG,

            // Metadata
            targetStallRate: CALC_CONSTANTS.TARGET_STALL_RATE
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CÁLCULO DE STALL RATE v3.1 (con floor)
    // ═══════════════════════════════════════════════════════════════════════

    function _calculateStallRate({
        bufferSec,
        segmentDurationSec,
        bitrateMbps,
        bandwidthSafeMbps,
        kBase,
        unstableMargin,
        headroomRatio
    }) {
        const ratio = bandwidthSafeMbps / Math.max(0.1, bitrateMbps);

        // ═══════════════════════════════════════════════════════════════════
        // REGLA DURA: Si BW < bitrate * unstableMargin → UNSTABLE
        // ═══════════════════════════════════════════════════════════════════
        if (ratio < unstableMargin) {
            const stallPct = 15 + (unstableMargin - ratio) * 50;
            return {
                stallRatePct: _clamp(stallPct, 15, 100),
                stallClass: 'UNSTABLE',
                stallColor: STALL_CLASSES.UNSTABLE.color,
                stallIcon: STALL_CLASSES.UNSTABLE.icon,
                stallFloor: 15
            };
        }

        // ═══════════════════════════════════════════════════════════════════
        // v3.1: STALL FLOOR basado en headroom
        // Evita que la exponencial dé 0.01% cuando headroom es apenas > margin
        // stallFloor = max(0.01, (1 / headroomRatio) * 0.2)
        // ═══════════════════════════════════════════════════════════════════
        const safeHeadroom = Math.max(0.1, headroomRatio || ratio);
        const stallFloor = Math.max(0.01, (1 / safeHeadroom) * 0.2);

        // ═══════════════════════════════════════════════════════════════════
        // FÓRMULA EXPONENCIAL (proxy para UI)
        // Stall% = 100 × e^(-k × segments)
        // ═══════════════════════════════════════════════════════════════════
        const segments = bufferSec / Math.max(1, segmentDurationSec);
        const kAdj = kBase * _clamp(ratio / 2, 0.3, 1.0);
        const stallExp = 100 * Math.exp(-kAdj * segments);

        // v3.1: Apply floor
        const stallWithFloor = Math.max(stallFloor, stallExp);
        const stallClamped = _clamp(stallWithFloor, 0.01, 100);

        const classInfo = _classifyStall(stallClamped);

        return {
            stallRatePct: stallClamped,
            stallClass: classInfo.name,
            stallColor: classInfo.color,
            stallIcon: classInfo.icon,
            stallFloor
        };
    }

    function _classifyStall(pct) {
        for (const [name, config] of Object.entries(STALL_CLASSES)) {
            if (pct <= config.max) {
                return { name, color: config.color, icon: config.icon };
            }
        }
        return { name: 'UNSTABLE', color: STALL_CLASSES.UNSTABLE.color, icon: STALL_CLASSES.UNSTABLE.icon };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // v3.1: CÁLCULO DE RISK SCORE con Error Pressure
    // ═══════════════════════════════════════════════════════════════════════

    function _calculateRiskScore({
        stallRatePct,
        headroomRatio,
        fillTimeSec,
        jitterMaxMs,
        errors429 = 0,
        errors5xx = 0,
        timeouts = 0
    }) {
        let s = 0;

        // Factor 1: Stall Rate (hasta 50 puntos, reducido para hacer espacio a error penalty)
        s += _clamp(stallRatePct * 10, 0, 50);

        // Factor 2: Headroom bajo (hasta 25 puntos)
        s += _clamp((1.3 - headroomRatio) * 35, 0, 25);

        // Factor 3: Fill time alto (hasta 15 puntos)
        s += _clamp((fillTimeSec - 8) * 1.5, 0, 15);

        // Factor 4: Jitter buffer bajo (hasta 10 puntos)
        s += _clamp((2000 - jitterMaxMs) / 200, 0, 10);

        // ═══════════════════════════════════════════════════════════════════
        // v3.1: Factor 5: Error Pressure (hasta 20 puntos)
        // errorPenalty = min(20, errors429*4 + errors5xx*2 + timeouts*3)
        // ═══════════════════════════════════════════════════════════════════
        const errorPenalty = Math.min(20,
            (errors429 * 4) + (errors5xx * 2) + (timeouts * 3)
        );
        s += errorPenalty;

        const score = Math.max(0, Math.min(100, Math.round(s)));

        // Determinar nivel
        let level, color;
        if (score <= 20) { level = 'LOW'; color = '#10b981'; }
        else if (score <= 40) { level = 'MODERATE'; color = '#22c55e'; }
        else if (score <= 60) { level = 'ELEVATED'; color = '#eab308'; }
        else if (score <= 80) { level = 'HIGH'; color = '#f97316'; }
        else { level = 'CRITICAL'; color = '#ef4444'; }

        return { score, level, color, errorPenalty };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCIONES AUXILIARES
    // ═══════════════════════════════════════════════════════════════════════

    function _clamp(x, a, b) {
        return Math.max(a, Math.min(b, x));
    }

    function _round1(x) {
        return Math.round(x * 10) / 10;
    }

    function _round2(x) {
        return Math.round(x * 100) / 100;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════

    window.StreamingCalculatorV3 = {
        compute: computeMetrics,
        calculateAdaptiveMargin: _calculateAdaptiveUnstableMargin,
        calculateBurstFactor: _calculateBurstFactor,
        CONSTANTS: CALC_CONSTANTS,
        STALL_CLASSES
    };

    console.log('%c📊 Streaming Calculator v3.1 (Production Ready)', 'color: #10b981; font-weight: bold;');
    console.log('   🎯 Adaptive margins, burst factor, stall floor, error pressure');

})();
