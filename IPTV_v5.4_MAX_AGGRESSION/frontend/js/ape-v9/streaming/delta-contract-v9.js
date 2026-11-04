/**
 * delta-contract-v9.js
 *
 * OUT (calidad/bitrate) es inmutable.
 * DELTA es headroom de red, no una palanca de calidad.
 *
 * IN_MIN = OUT * (1 + D/100)
 * fillRate = (IN - OUT) / OUT  [segundos de buffer por segundo]
 */
(function (global) {
    'use strict';

    var STATUS = Object.freeze({
        UNKNOWN: 'UNKNOWN',
        GREEN: 'GREEN',     // IN >= IN_MIN
        YELLOW: 'YELLOW',   // OUT <= IN < IN_MIN
        RED: 'RED'          // IN < OUT
    });

    var DEFAULTS = Object.freeze({
        outMbps: 9.0,
        deltaPct: 35,
        targetBufferSec: 105,
        fillTimeSec: 300
    });

    function round(num, decimals) {
        var p = Math.pow(10, decimals);
        return Math.round(num * p) / p;
    }

    function finiteOrNull(value) {
        return (typeof value === 'number' && isFinite(value)) ? value : null;
    }

    function compute(params) {
        params = params || {};
        var outMbps = params.outMbps != null ? Number(params.outMbps) : DEFAULTS.outMbps;
        var deltaPct = params.deltaPct != null ? Number(params.deltaPct) : DEFAULTS.deltaPct;
        var targetBufferSec = params.targetBufferSec != null ? Number(params.targetBufferSec) : DEFAULTS.targetBufferSec;
        var fillTimeSec = params.fillTimeSec != null ? Number(params.fillTimeSec) : DEFAULTS.fillTimeSec;
        var measuredInputMbps = params.measuredInputMbps != null ? Number(params.measuredInputMbps) : null;

        if (!isFinite(outMbps) || outMbps <= 0) throw new Error('outMbps debe ser > 0');
        if (!isFinite(deltaPct) || deltaPct < 0) throw new Error('deltaPct no puede ser negativo');
        if (!isFinite(targetBufferSec) || targetBufferSec <= 0) throw new Error('targetBufferSec debe ser > 0');
        if (!isFinite(fillTimeSec) || fillTimeSec <= 0) throw new Error('fillTimeSec debe ser > 0');

        var inputMinMbps = outMbps * (1 + deltaPct / 100);
        var theoreticalFillRate = deltaPct / 100;
        var theoreticalFillTime = theoreticalFillRate > 0
            ? targetBufferSec / theoreticalFillRate
            : null;

        var headroomMbps = null;
        var actualFillRate = null;
        var actualFillTime = null;
        var status = STATUS.UNKNOWN;
        var viability = 'UNMEASURED';

        if (measuredInputMbps !== null && isFinite(measuredInputMbps)) {
            headroomMbps = measuredInputMbps - inputMinMbps;
            actualFillRate = (measuredInputMbps - outMbps) / outMbps;
            actualFillTime = actualFillRate > 0 ? targetBufferSec / actualFillRate : null;

            if (measuredInputMbps >= inputMinMbps) {
                status = STATUS.GREEN;
                viability = 'SUSTAINABLE';
            } else if (measuredInputMbps >= outMbps) {
                status = STATUS.YELLOW;
                viability = 'DEGRADING';
            } else {
                status = STATUS.RED;
                viability = 'UNSUSTAINABLE';
            }
        }

        return {
            outputMbps: outMbps,
            deltaPct: deltaPct,
            targetBufferSec: targetBufferSec,
            fillTimeSec: fillTimeSec,
            inputMinMbps: round(inputMinMbps, 3),
            theoreticalFillRateSecPerSec: round(theoreticalFillRate, 4),
            theoreticalFillTimeSec: theoreticalFillTime === null ? null : round(theoreticalFillTime, 1),
            measuredInputMbps: measuredInputMbps === null ? null : round(measuredInputMbps, 3),
            headroomMbps: headroomMbps === null ? null : round(headroomMbps, 3),
            actualFillRateSecPerSec: actualFillRate === null ? null : round(actualFillRate, 4),
            actualFillTimeSec: actualFillTime === null ? null : round(actualFillTime, 1),
            status: status,
            viability: viability,
            verified: measuredInputMbps !== null,
            timestamp: Date.now(),
            isoTimestamp: new Date().toISOString()
        };
    }

    function isSatisfied(contract) {
        return !!contract && contract.status === STATUS.GREEN;
    }

    function canSustain(contract) {
        return !!contract && (contract.status === STATUS.GREEN || contract.status === STATUS.YELLOW);
    }

    function toM3u8Tag(contract) {
        if (!contract) return '';
        return '#EXT-X-APE-DELTA-CONTRACT:' +
            'OUT_MBPS=' + Number(contract.outputMbps).toFixed(1) +
            ',DELTA_PCT=' + Number(contract.deltaPct) +
            ',IN_MIN_MBPS=' + Number(contract.inputMinMbps).toFixed(2) +
            ',TARGET_BUFFER_SEC=' + Number(contract.targetBufferSec) +
            ',FILL_SEC=' + Number(contract.fillTimeSec) +
            ',STATUS=' + contract.status +
            ',VERIFIED=' + String(contract.verified === true);
    }

    function toHttpHeaders(contract) {
        if (!contract) return {};
        return {
            'X-APE-Output-Mbps': Number(contract.outputMbps).toFixed(1),
            'X-APE-Input-Min-Mbps': Number(contract.inputMinMbps).toFixed(2),
            'X-APE-Input-Measured-Mbps': contract.measuredInputMbps == null ? 'unknown' : Number(contract.measuredInputMbps).toFixed(2),
            'X-APE-Delta-Pct': String(contract.deltaPct),
            'X-APE-Buffer-Target-Sec': String(contract.targetBufferSec),
            'X-APE-Delta-Status': contract.status,
            'X-APE-Delta-Verified': String(contract.verified === true)
        };
    }

    function toJsonMetadata(contract, channel) {
        if (!contract) return null;
        return {
            channel: channel || null,
            output_mbps: contract.outputMbps,
            delta_pct: contract.deltaPct,
            input_min_mbps: contract.inputMinMbps,
            input_measured_mbps: contract.measuredInputMbps,
            headroom_mbps: contract.headroomMbps,
            target_buffer_sec: contract.targetBufferSec,
            fill_rate_sec_per_sec: contract.theoreticalFillRateSecPerSec,
            fill_time_sec: contract.theoreticalFillTimeSec,
            actual_fill_time_sec: contract.actualFillTimeSec,
            status: contract.status,
            viability: contract.viability,
            verified: contract.verified,
            evidence: contract.verified ? 'serial_segment_probe' : null,
            timestamp: contract.timestamp,
            iso_timestamp: contract.isoTimestamp
        };
    }

    function computeMinimumDelta(targetBufferSec, fillTimeSec) {
        if (!(fillTimeSec > 0)) throw new Error('fillTimeSec debe ser > 0');
        return (100 * targetBufferSec) / fillTimeSec;
    }

    var DeltaContractV9 = {
        DEFAULTS: DEFAULTS,
        STATUS: STATUS,
        compute: compute,
        isSatisfied: isSatisfied,
        canSustain: canSustain,
        toM3u8Tag: toM3u8Tag,
        toHttpHeaders: toHttpHeaders,
        toJsonMetadata: toJsonMetadata,
        computeMinimumDelta: computeMinimumDelta
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = DeltaContractV9;
    if (global) global.DeltaContractV9 = DeltaContractV9;
})(typeof window !== 'undefined' ? window : globalThis);
