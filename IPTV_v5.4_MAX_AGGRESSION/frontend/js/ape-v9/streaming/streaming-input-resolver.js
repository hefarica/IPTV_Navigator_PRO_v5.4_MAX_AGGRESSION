/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📥 STREAMING INPUT RESOLVER v1.1 - IPTV Navigator PRO (Production Ready)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CAPA 1: Resolver (Runtime Inputs)
 * 
 * v1.1 IMPROVEMENTS:
 * - Support for segmentDurationObservedSec (from telemetry)
 * - Error signals passthrough for Calculator
 * - Profile metadata for adaptive margin calculation
 * 
 * INPUTS (del perfil):
 * - segmentDurationSec, prefetchSegments, parallelDownloads, minBandwidthMbps
 * - bufferBaseMs, bufferTargetSec
 * 
 * RUNTIME SIGNALS (medición opcional):
 * - bandwidthObservedMbps (si hay telemetría)
 * - segmentDurationObservedSec (si hay telemetría)
 * - memoryOverhead
 * - errorSignals { errors429, errors5xx, timeoutsCount }
 * 
 * ADAPTERS (inyección de dependencias):
 * - getBitrateMbps(profileInputs) → bitrate del core existente
 * - getPlayerBufferMs(profileInputs) → buffer del player
 * - getBufferTotalMs(profileInputs) → buffer total (4:4:1)
 * 
 * FECHA: 2026-02-01
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTES DE RESOLVER
    // ═══════════════════════════════════════════════════════════════════════

    const RESOLVER_CONSTANTS = {
        DEFAULT_SEGMENT_DURATION: 6,
        DEFAULT_PREFETCH_SEGMENTS: 10,
        DEFAULT_PARALLEL_DOWNLOADS: 3,
        DEFAULT_MIN_BANDWIDTH_MBPS: 10,
        DEFAULT_BUFFER_BASE_MS: 12000,
        DEFAULT_MEMORY_OVERHEAD: 1.20,
        MIN_BITRATE_MBPS: 0.1,
        MIN_BANDWIDTH_MBPS: 0.1,
        // FIX 2026-10-24: margen de seguridad aplicado a la MEDICIÓN (no al piso).
        // 0.95 = mismo factor que hls.js para bajar/mantener nivel
        // (`adjustedbw = 0.95 * bw`, abr-controller.ts:928-932) y misma
        // semántica que `bandwidthSafetyFactor` de dash.js.
        // Para SUBIR de nivel el factor es 0.7 (abrBandWidthUpFactor).
        SAFETY_FACTOR: 0.95,
        SAFETY_FACTOR_UP: 0.7,
        // v1.1: Segment duration tolerance
        SEGMENT_TOLERANCE_MIN: 0.7,
        SEGMENT_TOLERANCE_MAX: 1.3
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RESOLUCIÓN DE INPUTS EN TIEMPO REAL
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Resuelve los inputs en tiempo real para el Calculator
     * 
     * @param {Object} profileInputs - Inputs del perfil (editables por usuario)
     * @param {Object} runtimeSignals - Señales de runtime (mediciones, etc.)
     * @param {Object} adapters - Funciones para obtener datos del core existente
     * @returns {Object} RuntimeInputs listos para el Calculator
     */
    function resolveRuntimeInputs(profileInputs, runtimeSignals = {}, adapters = {}) {
        const nowMs = Date.now();

        // ═══════════════════════════════════════════════════════════════════
        // 1) BITRATE: SIEMPRE del core existente (inyectado por adapter)
        // ═══════════════════════════════════════════════════════════════════
        let bitrateMbps;

        if (adapters.getBitrateMbps) {
            bitrateMbps = adapters.getBitrateMbps(profileInputs);
        } else if (runtimeSignals.bitrateMbps) {
            bitrateMbps = runtimeSignals.bitrateMbps;
        } else {
            // Fallback: calcular desde profileInputs si tiene resolution/codec/fps
            bitrateMbps = _calculateFallbackBitrate(profileInputs);
        }

        // Fallback defensivo
        const safeBitrate = Math.max(RESOLVER_CONSTANTS.MIN_BITRATE_MBPS, Number(bitrateMbps || 0));

        // ═══════════════════════════════════════════════════════════════════
        // 2) BANDWIDTH: Observado vs Mínimo configurado
        // ═══════════════════════════════════════════════════════════════════
        const observed = Number(runtimeSignals.bandwidthObservedMbps || 0);
        const minBw = Math.max(
            RESOLVER_CONSTANTS.MIN_BANDWIDTH_MBPS,
            Number(profileInputs.minBandwidthMbps || RESOLVER_CONSTANTS.DEFAULT_MIN_BANDWIDTH_MBPS)
        );
        const bwConfidence = String(runtimeSignals.bandwidthConfidence || (observed > 0 ? 'low' : 'none'));
        const bwSource = String(runtimeSignals.bandwidthSource || (observed > 0 ? 'runtime' : 'none'));

        // ── FIX 2026-10-24 ────────────────────────────────────────────────
        // ANTES:  bandwidthSafeMbps = Math.min(bandwidthObservedMbps, minBw)
        //         → el piso del perfil RECORTABA toda medición real, así que
        //           ningún enlace podía superar minBw y el headroom quedaba
        //           clavado en minBw/bitrate (p. ej. 12/40 = -70%).
        // AHORA:  si hay medición con confianza, manda la medición atenuada
        //         por un factor de seguridad (0.9, estilo dash.js). El piso
        //         SOLO actúa como valor de arranque cuando no hay medición.
        const hasMeasurement = observed > 0 && bwConfidence !== 'none';
        const bandwidthObservedMbps = hasMeasurement ? observed : minBw;
        const bandwidthSafeMbps = hasMeasurement
            ? Math.max(RESOLVER_CONSTANTS.MIN_BANDWIDTH_MBPS,
                       observed * RESOLVER_CONSTANTS.SAFETY_FACTOR)
            : minBw;

        // ═══════════════════════════════════════════════════════════════════
        // 3) v1.1: SEGMENT DURATION (input vs observed con tolerancia)
        // ═══════════════════════════════════════════════════════════════════
        const inputSegDur = Math.max(1, Number(
            profileInputs.segmentDurationSec || RESOLVER_CONSTANTS.DEFAULT_SEGMENT_DURATION
        ));

        // Si hay observed, usar con tolerancia ±30%
        const observedSegDur = Number(
            runtimeSignals.segmentDurationObservedSec ||
            profileInputs.segmentDurationObservedSec ||
            0
        );

        let segmentDurationSec = inputSegDur;
        let segmentDurationObservedSec = null;

        if (observedSegDur > 0) {
            segmentDurationObservedSec = observedSegDur;
            // Clamp observed to ±30% of input
            segmentDurationSec = _clamp(
                observedSegDur,
                inputSegDur * RESOLVER_CONSTANTS.SEGMENT_TOLERANCE_MIN,
                inputSegDur * RESOLVER_CONSTANTS.SEGMENT_TOLERANCE_MAX
            );
        }

        // ═══════════════════════════════════════════════════════════════════
        // 4) PREFETCH Y PARALLEL (inputs del usuario)
        // ═══════════════════════════════════════════════════════════════════
        const prefetchSegments = Math.max(1, Math.floor(Number(
            profileInputs.prefetchSegments || RESOLVER_CONSTANTS.DEFAULT_PREFETCH_SEGMENTS
        )));

        const parallelDownloads = Math.max(1, Math.floor(Number(
            profileInputs.parallelDownloads || RESOLVER_CONSTANTS.DEFAULT_PARALLEL_DOWNLOADS
        )));

        // ═══════════════════════════════════════════════════════════════════
        // 5) DERIVADOS FÍSICOS
        // ═══════════════════════════════════════════════════════════════════
        const bufferPrefetchSec = prefetchSegments * segmentDurationSec;
        const segmentSizeMB = (safeBitrate * segmentDurationSec) / 8; // Mbps * s / 8 = MB

        // ═══════════════════════════════════════════════════════════════════
        // 6) BUFFERS (del sistema existente o derivados)
        // ═══════════════════════════════════════════════════════════════════
        const bufferBaseMs = Number(
            profileInputs.bufferBaseMs || RESOLVER_CONSTANTS.DEFAULT_BUFFER_BASE_MS
        );

        let bufferPlayerMs;
        if (adapters.getPlayerBufferMs) {
            bufferPlayerMs = adapters.getPlayerBufferMs(profileInputs);
        } else {
            // Fórmula 4:4:1 existente
            bufferPlayerMs = Math.max(250, Math.floor(bufferBaseMs / 4));
        }

        let bufferTotalMs;
        if (adapters.getBufferTotalMs) {
            bufferTotalMs = adapters.getBufferTotalMs(profileInputs);
        } else {
            // Fórmula 4:4:1: Network + Live + Player ≈ 2.25 × base
            bufferTotalMs = Math.floor(bufferBaseMs * 2.25);
        }

        // ═══════════════════════════════════════════════════════════════════
        // 7) MEMORIA
        // ═══════════════════════════════════════════════════════════════════
        const overhead = Number(
            runtimeSignals.memoryOverhead || RESOLVER_CONSTANTS.DEFAULT_MEMORY_OVERHEAD
        );
        const memoryMB_pure = prefetchSegments * segmentSizeMB;
        const memoryMB_real = memoryMB_pure * overhead;

        // ═══════════════════════════════════════════════════════════════════
        // 8) v1.1: ERROR SIGNALS PASSTHROUGH
        // ═══════════════════════════════════════════════════════════════════
        const errorSignals = {
            errors429: Number(runtimeSignals.errors429 || runtimeSignals.errorSignals?.errors429 || 0),
            errors5xx: Number(runtimeSignals.errors5xx || runtimeSignals.errorSignals?.errors5xx || 0),
            timeoutsCount: Number(runtimeSignals.timeoutsCount || runtimeSignals.errorSignals?.timeoutsCount || 0)
        };

        // ═══════════════════════════════════════════════════════════════════
        // RETURN: RuntimeInputs v1.1
        // ═══════════════════════════════════════════════════════════════════
        return {
            version: '1.1',
            nowMs,
            bitrateMbps: _round1(safeBitrate),

            bandwidthObservedMbps: _round1(bandwidthObservedMbps),
            bandwidthSafeMbps: _round1(bandwidthSafeMbps),
            // FIX 2026-10-24: procedencia de la cifra de ancho de banda.
            // `hasMeasurement=false` ⇒ el valor es el PISO del perfil, no una
            // medición: la UI NO debe presentarlo como salud real.
            hasMeasurement,
            bandwidthConfidence: bwConfidence,
            bandwidthSource: bwSource,

            // v1.1: Both input and observed segment duration
            segmentDurationSec: _round1(segmentDurationSec),
            segmentDurationInput: inputSegDur,
            segmentDurationObservedSec: segmentDurationObservedSec ? _round1(segmentDurationObservedSec) : null,

            prefetchSegments,
            parallelDownloads,

            bufferPrefetchSec: _round1(bufferPrefetchSec),
            bufferPlayerMs: Math.round(bufferPlayerMs),
            bufferTotalMs: Math.round(bufferTotalMs),

            segmentSizeMB: _round2(segmentSizeMB),
            memoryMB_pure: _round1(memoryMB_pure),
            memoryMB_real: _round1(memoryMB_real),

            // v1.1: Error signals for risk score
            errorSignals,

            // Profile metadata for adaptive margin (passthrough)
            profileMetadata: {
                resolution: profileInputs.resolution || '1920x1080',
                codec: profileInputs.codec || 'H264',
                fps: Number(profileInputs.fps || 60),
                isLive: profileInputs.isLive || profileInputs.live || false
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCIONES AUXILIARES
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Calcula bitrate de fallback si no hay adapter
     */
    function _calculateFallbackBitrate(profileInputs) {
        const resolution = profileInputs.resolution || '1920x1080';
        const codec = profileInputs.codec || 'H264';
        const fps = Number(profileInputs.fps || 60);
        const compressionMult = Number(profileInputs.compressionMult || 0.22);

        const [width, height] = resolution.toLowerCase().split('x').map(Number);
        const pixels = (width || 1920) * (height || 1080);

        // BPP simplificado
        let bpp = 0.20;
        if (codec.toUpperCase().includes('265') || codec.toUpperCase().includes('HEVC')) {
            bpp = 0.15;
        } else if (codec.toUpperCase().includes('AV1')) {
            bpp = 0.10;
        }

        return (pixels * fps * bpp * compressionMult) / 1000000;
    }

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

    window.StreamingInputResolver = {
        resolve: resolveRuntimeInputs,
        CONSTANTS: RESOLVER_CONSTANTS
    };

    console.log('%c📥 Streaming Input Resolver v1.1 (Production Ready)', 'color: #3b82f6; font-weight: bold;');
    console.log('   🎯 Observed segment duration, error signals, profile metadata');

})();
