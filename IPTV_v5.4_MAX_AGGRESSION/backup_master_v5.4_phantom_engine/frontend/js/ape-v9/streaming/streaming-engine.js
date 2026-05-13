/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚀 STREAMING ENGINE v1.1 - IPTV Navigator PRO (Production Ready)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ORQUESTADOR: Pipeline completo Resolver → Calculator → Policy
 * 
 * v1.1 IMPROVEMENTS:
 * - Uses profileMetadata for adaptive margin calculation
 * - Passes errorSignals through entire pipeline
 * - Better UI helpers with version info
 * - Summary status from Policy
 * 
 * FLUJO:
 * 1. resolveRuntimeInputs(profileInputs, signals, adapters) → RuntimeInputs v1.1
 * 2. computeMetrics(profileInputs, runtimeInputs, opts) → Metrics v3.1
 * 3. applyPolicy(profileInputs, runtimeInputs, metrics, policy) → PolicyResult v1.1
 * 
 * FECHA: 2026-02-01
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '1.1';

    // ═══════════════════════════════════════════════════════════════════════
    // DEFAULTS DE ENGINE
    // ═══════════════════════════════════════════════════════════════════════

    const ENGINE_DEFAULTS = {
        compute: {
            stallK: 0.5,
            // v1.1: unstableMargin is now calculated adaptively, this is fallback
            baseMargin: 1.15,
            netEfficiency: 0.85,
            parallelGainFactor: 0.6
        },
        policy: {
            minPrefetch: 4,
            maxPrefetch: 25,
            minParallel: 1,
            maxParallel: 8,
            signals: {
                errors429: 0,
                errors5xx: 0,
                timeoutsCount: 0
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCIÓN PRINCIPAL: runStreamingEngine v1.1
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Ejecuta el pipeline completo y devuelve resultado unificado
     * 
     * @param {Object} profileInputs - Config del perfil (los 4 inputs controlables)
     * @param {Object} runtimeSignals - Señales de runtime (mediciones)
     * @param {Object} adapters - Funciones para conectar con core existente
     * @param {Object} options - Opciones de cálculo y política
     * @returns {Object} Resultado completo { profileInputs, runtimeInputs, metrics, policyResult }
     */
    function runStreamingEngine(profileInputs, runtimeSignals = {}, adapters = {}, options = {}) {
        // Verificar que los módulos están cargados
        if (!window.StreamingInputResolver) {
            console.error('❌ StreamingInputResolver not loaded');
            return _createErrorResult('StreamingInputResolver not loaded');
        }
        if (!window.StreamingCalculatorV3) {
            console.error('❌ StreamingCalculatorV3 not loaded');
            return _createErrorResult('StreamingCalculatorV3 not loaded');
        }
        if (!window.StreamingPolicy) {
            console.error('❌ StreamingPolicy not loaded');
            return _createErrorResult('StreamingPolicy not loaded');
        }

        // Merge options con defaults
        const computeOpts = { ...ENGINE_DEFAULTS.compute, ...(options.compute || {}) };
        const policyOpts = { ...ENGINE_DEFAULTS.policy, ...(options.policy || {}) };

        try {
            // ═══════════════════════════════════════════════════════════════
            // PASO 1: RESOLVER (Inputs en tiempo real)
            // ═══════════════════════════════════════════════════════════════
            const runtimeInputs = window.StreamingInputResolver.resolve(
                profileInputs,
                runtimeSignals,
                adapters
            );

            // ═══════════════════════════════════════════════════════════════
            // PASO 2: CALCULATOR (Métricas puras)
            // v1.1: Pass errorSignals to calculator for risk score
            // ═══════════════════════════════════════════════════════════════
            const calcOpts = {
                ...computeOpts,
                errorSignals: runtimeInputs.errorSignals
            };

            const metrics = window.StreamingCalculatorV3.compute(
                profileInputs,
                runtimeInputs,
                calcOpts
            );

            // ═══════════════════════════════════════════════════════════════
            // PASO 3: POLICY (Recomendaciones)
            // v1.1: Policy uses errorSignals from runtimeInputs automatically
            // ═══════════════════════════════════════════════════════════════
            const policyResult = window.StreamingPolicy.apply(
                profileInputs,
                runtimeInputs,
                metrics,
                policyOpts
            );

            // ═══════════════════════════════════════════════════════════════
            // RETURN: Resultado completo v1.1
            // ═══════════════════════════════════════════════════════════════
            return {
                success: true,
                version: VERSION,
                timestamp: Date.now(),
                profileInputs,
                runtimeInputs,
                metrics,
                policyResult,

                // Accesos directos para UI
                ui: {
                    // Version info
                    engineVersion: VERSION,
                    resolverVersion: runtimeInputs.version || '1.0',
                    calculatorVersion: metrics.version || '3.0',
                    policyVersion: policyResult.version || '1.0',

                    // Estabilidad
                    isStable: metrics.stallClass !== 'UNSTABLE',
                    stabilityLabel: metrics.stallClass,
                    stabilityColor: metrics.stallColor,
                    stabilityIcon: metrics.stallIcon,

                    // Headroom
                    headroomPercent: metrics.headroomPercent,
                    headroomOk: metrics.headroomRatio >= metrics.unstableMarginUsed,

                    // Stall (renamed to Predicted Stall)
                    predictedStallPct: metrics.predictedStallPct || metrics.stallRatePct,
                    stallMeetsTarget: metrics.meetsTarget,
                    stallFloor: metrics.stallFloor,

                    // Risk
                    riskScore: metrics.riskScore,
                    riskLevel: metrics.riskLevel,
                    riskColor: metrics.riskColor,
                    errorPenalty: metrics.errorPenalty,

                    // v1.1: BW details
                    bwPeak: metrics.bwPeakMbps,
                    bwAvg: metrics.bwAvgMbps,
                    burstFactor: metrics.burstFactor,

                    // v1.1: Adaptive margin used
                    unstableMarginUsed: metrics.unstableMarginUsed,

                    // v1.1: Segment duration
                    segmentDurationUsed: metrics.segmentDurationUsed,
                    segmentDurationObserved: runtimeInputs.segmentDurationObservedSec,

                    // Recomendaciones
                    hasActions: policyResult.actions.length > 0,
                    hasWarnings: policyResult.warnings.length > 0,
                    actionCount: policyResult.actions.length,
                    warningCount: policyResult.warnings.length,

                    // v1.1: Policy summary
                    policyStatus: policyResult.summary?.status || 'UNKNOWN',
                    hasUrgent: policyResult.summary?.hasUrgent || false
                }
            };

        } catch (error) {
            console.error('❌ StreamingEngine error:', error);
            return _createErrorResult(error.message);
        }
    }

    /**
     * Versión simplificada para UI que solo devuelve métricas y UI helpers
     */
    function computeForUI(profileInputs, runtimeSignals = {}, adapters = {}, options = {}) {
        const result = runStreamingEngine(profileInputs, runtimeSignals, adapters, options);

        if (!result.success) {
            return {
                error: result.error,
                metrics: null,
                ui: null
            };
        }

        return {
            error: null,
            version: VERSION,
            runtimeInputs: result.runtimeInputs,
            metrics: result.metrics,
            policy: result.policyResult,
            ui: result.ui
        };
    }

    /**
     * Quick performance check (minimal output)
     */
    function quickCheck(profileInputs, runtimeSignals = {}) {
        const result = runStreamingEngine(profileInputs, runtimeSignals);

        if (!result.success) {
            return { error: result.error, ok: false };
        }

        return {
            ok: result.ui.isStable && result.metrics.meetsTarget,
            stable: result.ui.isStable,
            meetsTarget: result.metrics.meetsTarget,
            predictedStall: result.ui.predictedStallPct,
            riskScore: result.metrics.riskScore,
            riskLevel: result.metrics.riskLevel,
            urgentActions: result.policyResult.actions.filter(a => a.priority <= 2).length,
            warnings: result.policyResult.warnings.length
        };
    }

    /**
     * Crea un resultado de error
     */
    function _createErrorResult(message) {
        return {
            success: false,
            version: VERSION,
            error: message,
            timestamp: Date.now(),
            profileInputs: null,
            runtimeInputs: null,
            metrics: null,
            policyResult: null,
            ui: null
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ADAPTERS HELPER: Crear adaptadores para core existente
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Crea adapters para conectar con ProfileManager existente
     * 
     * @param {Object} profileManager - Instancia de ProfileManagerV9
     * @returns {Object} Adapters para el Engine
     */
    function createProfileManagerAdapters(profileManager) {
        return {
            /**
             * Obtiene el bitrate calculado del core
             */
            getBitrateMbps: (profileInputs) => {
                if (!profileManager) return null;

                // Intentar obtener del profile actual
                const profile = profileManager.getProfile?.(profileInputs.profileId);
                if (profile?.settings?.bitrate) {
                    return profile.settings.bitrate;
                }

                // Fallback: calcular si hay método disponible
                if (profileManager.calculateBitrate) {
                    return profileManager.calculateBitrate(profileInputs);
                }

                return null;
            },

            /**
             * Obtiene el buffer del player
             */
            getPlayerBufferMs: (profileInputs) => {
                const bufferBase = profileInputs.bufferBaseMs || 6000;
                // Fórmula 4:4:1 existente
                return Math.max(250, Math.floor(bufferBase / 4));
            },

            /**
             * Obtiene el buffer total del sistema
             */
            getBufferTotalMs: (profileInputs) => {
                const bufferBase = profileInputs.bufferBaseMs || 6000;
                // 4:4:1 → Network + Live + Player ≈ 2.25 × base
                return Math.floor(bufferBase * 2.25);
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════

    window.StreamingEngine = {
        run: runStreamingEngine,
        computeForUI,
        quickCheck,
        createAdapters: createProfileManagerAdapters,
        DEFAULTS: ENGINE_DEFAULTS,
        VERSION
    };

    console.log('%c🚀 Streaming Engine v1.1 (Production Ready)', 'color: #8b5cf6; font-weight: bold;');
    console.log('   Pipeline: Resolver v1.1 → Calculator v3.1 → Policy v1.1');

})();
