/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎛️ STREAMING POLICY v1.1 - IPTV Navigator PRO (Production Ready)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CAPA 3: Policy/Controller (Decisiones)
 * 
 * v1.1 IMPROVEMENTS:
 * - Uses errorSignals from runtimeInputs (passthrough from Resolver)
 * - Uses adaptive margin from metrics
 * - New rule: Error pressure + risk combo
 * - Better warning messages with context
 * 
 * INPUTS:
 * - profileInputs (config actual)
 * - runtimeInputs (del Resolver v1.1)
 * - metrics (del Calculator v3.1)
 * - policy (límites y señales override)
 * 
 * OUTPUTS (PolicyResult):
 * - actions: array de recomendaciones { type, value, reason, priority }
 * - warnings: array de alertas
 * - summary: quick status
 * 
 * FECHA: 2026-02-01
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // TIPOS DE ACCIONES
    // ═══════════════════════════════════════════════════════════════════════

    const ACTION_TYPES = {
        SET_PREFETCH: 'SET_PREFETCH',
        SET_PARALLEL: 'SET_PARALLEL',
        SET_MIN_BANDWIDTH: 'SET_MIN_BANDWIDTH',
        SET_BUFFER_TARGET: 'SET_BUFFER_TARGET',
        SWITCH_PROFILE: 'SWITCH_PROFILE',
        LOWER_RESOLUTION: 'LOWER_RESOLUTION'
    };

    const PRIORITY = {
        CRITICAL: 1,
        HIGH: 2,
        MEDIUM: 3,
        LOW: 4
    };

    // ═══════════════════════════════════════════════════════════════════════
    // DEFAULTS DE POLÍTICA
    // ═══════════════════════════════════════════════════════════════════════

    const DEFAULT_POLICY = {
        minPrefetch: 3,
        maxPrefetch: 25,
        minParallel: 1,
        maxParallel: 8,
        signals: {
            errors429: 0,
            errors5xx: 0,
            timeoutsCount: 0
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCIÓN PRINCIPAL: applyPolicy v1.1
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Genera recomendaciones basadas en métricas y estado
     * 
     * @param {Object} profileInputs - Inputs actuales del perfil
     * @param {Object} runtimeInputs - Inputs resueltos (v1.1 con errorSignals)
     * @param {Object} metrics - Métricas calculadas (v3.1)
     * @param {Object} policy - Configuración de política (override)
     * @returns {Object} PolicyResult { actions, warnings, summary }
     */
    function applyPolicy(profileInputs, runtimeInputs, metrics, policy = {}) {
        const actions = [];
        const warnings = [];

        // Merge con defaults
        const policyConfig = { ...DEFAULT_POLICY, ...policy };

        // v1.1: Use errorSignals from runtimeInputs if present
        const signals = {
            ...DEFAULT_POLICY.signals,
            ...(runtimeInputs.errorSignals || {}),
            ...(policy.signals || {})
        };

        const {
            minPrefetch,
            maxPrefetch,
            minParallel,
            maxParallel
        } = policyConfig;

        const currentPrefetch = profileInputs.prefetchSegments || runtimeInputs.prefetchSegments || 10;
        const currentParallel = profileInputs.parallelDownloads || runtimeInputs.parallelDownloads || 3;

        // ═══════════════════════════════════════════════════════════════════
        // REGLA 1: UNSTABLE → Aumentar buffer (CRITICAL)
        // ═══════════════════════════════════════════════════════════════════
        if (metrics.stallClass === 'UNSTABLE') {
            const marginUsed = metrics.unstableMarginUsed || 1.15;
            warnings.push(`UNSTABLE: BW (${runtimeInputs.bandwidthSafeMbps}Mbps) < Bitrate (${runtimeInputs.bitrateMbps}Mbps) × ${marginUsed.toFixed(2)}`);

            const newPrefetch = _clamp(currentPrefetch + 3, minPrefetch, maxPrefetch);
            if (newPrefetch !== currentPrefetch) {
                actions.push({
                    type: ACTION_TYPES.SET_PREFETCH,
                    value: newPrefetch,
                    reason: 'Increase buffer to reduce depletion risk under low bandwidth',
                    priority: PRIORITY.CRITICAL
                });
            }

            // También sugerir bajar resolución si es 4K+
            const resolution = runtimeInputs.profileMetadata?.resolution || '';
            if (resolution.includes('3840') || resolution.includes('4K')) {
                actions.push({
                    type: ACTION_TYPES.LOWER_RESOLUTION,
                    value: '1920x1080',
                    reason: 'Bandwidth insufficient for 4K; consider 1080p',
                    priority: PRIORITY.HIGH
                });
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // REGLA 2: WARNING/POOR → Aumentar buffer moderadamente
        // ═══════════════════════════════════════════════════════════════════
        if (metrics.stallClass === 'WARNING' || metrics.stallClass === 'POOR') {
            const newPrefetch = _clamp(currentPrefetch + 2, minPrefetch, maxPrefetch);
            if (newPrefetch !== currentPrefetch) {
                actions.push({
                    type: ACTION_TYPES.SET_PREFETCH,
                    value: newPrefetch,
                    reason: `Predicted Stall (${metrics.predictedStallPct || metrics.stallRatePct}%) is high; increase buffer`,
                    priority: PRIORITY.HIGH
                });
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // REGLA 3: Errores CDN (429/5xx) → Reducir paralelismo
        // ═══════════════════════════════════════════════════════════════════
        if (signals.errors429 > 0 || signals.errors5xx > 3) {
            const newParallel = _clamp(currentParallel - 1, minParallel, maxParallel);
            if (newParallel !== currentParallel) {
                actions.push({
                    type: ACTION_TYPES.SET_PARALLEL,
                    value: newParallel,
                    reason: 'Reduce parallel to lower CDN pressure / rate limit errors',
                    priority: PRIORITY.HIGH
                });
            }
            warnings.push(`CDN pressure detected: 429=${signals.errors429}, 5xx=${signals.errors5xx}, timeouts=${signals.timeoutsCount}`);
        }

        // ═══════════════════════════════════════════════════════════════════
        // REGLA 4: Timeouts frecuentes → Reducir paralelo y aumentar buffer
        // ═══════════════════════════════════════════════════════════════════
        if (signals.timeoutsCount > 5) {
            const newParallel = _clamp(currentParallel - 1, minParallel, maxParallel);
            const newPrefetch = _clamp(currentPrefetch + 1, minPrefetch, maxPrefetch);

            if (newParallel !== currentParallel) {
                actions.push({
                    type: ACTION_TYPES.SET_PARALLEL,
                    value: newParallel,
                    reason: `High timeouts (${signals.timeoutsCount}); reduce parallel`,
                    priority: PRIORITY.MEDIUM
                });
            }
            if (newPrefetch !== currentPrefetch) {
                actions.push({
                    type: ACTION_TYPES.SET_PREFETCH,
                    value: newPrefetch,
                    reason: `High timeouts (${signals.timeoutsCount}); increase buffer`,
                    priority: PRIORITY.MEDIUM
                });
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // REGLA 5: Headroom alto + FillTime lento → Aumentar paralelismo
        // ═══════════════════════════════════════════════════════════════════
        if (metrics.headroomRatio > 2.0 && metrics.fillTimeSec > 10 && signals.errors429 === 0) {
            const newParallel = _clamp(currentParallel + 1, minParallel, maxParallel);
            if (newParallel !== currentParallel) {
                actions.push({
                    type: ACTION_TYPES.SET_PARALLEL,
                    value: newParallel,
                    reason: `High headroom (${metrics.headroomPercent}%); increase parallel to speed prefill`,
                    priority: PRIORITY.LOW
                });
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // REGLA 6: Risk Score CRITICAL → Alerta urgente
        // ═══════════════════════════════════════════════════════════════════
        if (metrics.riskLevel === 'CRITICAL') {
            warnings.push(`CRITICAL RISK: Score ${metrics.riskScore}/100 (error penalty: ${metrics.errorPenalty || 0}). Consider lowering resolution or increasing bandwidth.`);
        } else if (metrics.riskLevel === 'HIGH') {
            warnings.push(`HIGH RISK: Score ${metrics.riskScore}/100. Monitor closely.`);
        }

        // ═══════════════════════════════════════════════════════════════════
        // REGLA 7: Jitter muy bajo → Advertencia
        // ═══════════════════════════════════════════════════════════════════
        if (metrics.jitterMaxMs < 1000) {
            warnings.push(`Low jitter tolerance (${metrics.jitterMaxMs}ms). Network instability may cause stalls.`);
        }

        // ═══════════════════════════════════════════════════════════════════
        // REGLA 8: Prefetch muy bajo para el bitrate → Advertencia
        // ═══════════════════════════════════════════════════════════════════
        const minRecommendedPrefetch = Math.ceil(runtimeInputs.bitrateMbps / 2);
        if (currentPrefetch < minRecommendedPrefetch && minRecommendedPrefetch >= minPrefetch) {
            warnings.push(`Prefetch (${currentPrefetch}) may be too low for bitrate (${runtimeInputs.bitrateMbps}Mbps). Consider ${minRecommendedPrefetch}+.`);
        }

        // ═══════════════════════════════════════════════════════════════════
        // REGLA 9: Segment duration variable detectada
        // ═══════════════════════════════════════════════════════════════════
        if (runtimeInputs.segmentDurationObservedSec) {
            const input = runtimeInputs.segmentDurationInput;
            const observed = runtimeInputs.segmentDurationObservedSec;
            const diff = Math.abs(observed - input);
            if (diff > 0.5) {
                warnings.push(`Segment duration variance: configured ${input}s, observed ${observed}s (using ${metrics.segmentDurationUsed}s).`);
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // Sort actions by priority
        // ═══════════════════════════════════════════════════════════════════
        actions.sort((a, b) => (a.priority || 4) - (b.priority || 4));

        // ═══════════════════════════════════════════════════════════════════
        // Summary
        // ═══════════════════════════════════════════════════════════════════
        const summary = {
            totalActions: actions.length,
            totalWarnings: warnings.length,
            hasUrgent: actions.some(a => a.priority === PRIORITY.CRITICAL) ||
                warnings.some(w => w.includes('CRITICAL') || w.includes('UNSTABLE')),
            status: metrics.stallClass === 'UNSTABLE' ? 'UNSTABLE' :
                metrics.riskLevel === 'CRITICAL' ? 'CRITICAL' :
                    actions.length > 0 ? 'NEEDS_ATTENTION' : 'OK'
        };

        return {
            version: '1.1',
            actions,
            warnings,
            summary
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCIONES AUXILIARES
    // ═══════════════════════════════════════════════════════════════════════

    function _clamp(x, a, b) {
        return Math.max(a, Math.min(b, x));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════

    window.StreamingPolicy = {
        apply: applyPolicy,
        ACTION_TYPES,
        PRIORITY,
        DEFAULT_POLICY
    };

    console.log('%c🎛️ Streaming Policy v1.1 (Production Ready)', 'color: #f59e0b; font-weight: bold;');
    console.log('   🎯 Error signals, priority actions, segment variance detection');

})();
