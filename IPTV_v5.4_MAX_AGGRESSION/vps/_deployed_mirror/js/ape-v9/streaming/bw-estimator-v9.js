/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE BANDWIDTH ESTIMATOR v1.0 — medición REAL para Streaming Health
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE (fallo medido en producción)
 *   `prefetch-presets.js:326` alimentaba al motor con
 *       bandwidthObservedMbps: minBW       ← el PISO, no una medición
 *   y `streaming-input-resolver.js:96` lo recortaba:
 *       bandwidthSafeMbps = Math.min(bandwidthObservedMbps, minBw)
 *   Resultado: headroom = minBW/bitrate, constante. Para un perfil 8K de
 *   40 Mbps con minBW=12 sale ratio 0.30 → "Headroom -70%", "Risk 100",
 *   "UNSTABLE" PARA SIEMPRE, con red perfecta. El panel no mentía: nunca midió.
 *
 * QUÉ HACE
 *   Estima el throughput del enlace con el MODELO DE LOS PLAYERS DE REFERENCIA:
 *   doble EWMA (rápida + lenta) muestreada con descargas reales, en lugar de
 *   confiar en un número de configuración.
 *       alpha = 1 - 2^(-Δt / halfLife)      (decaída exponencial por tiempo)
 *       estimate = media ponderada de ambas pistas
 *   Fuentes de muestra, en este orden:
 *     1) Resource Timing API  → bytes y duración REALES de cada descarga que
 *        el navegador ya hizo (CORS-proof: no necesita leer el cuerpo).
 *     2) navigator.connection.downlink          (semilla, si existe)
 *     3) STARTUP_DEFAULT_MBPS                   (semilla de arranque honesta)
 *
 *   Nunca devuelve el piso del perfil como si fuera medición.
 *
 * API
 *   APE_BW.sample(bytes, ms, label?)     añade una muestra
 *   APE_BW.harvest()                     cosecha Resource Timing (idempotente)
 *   APE_BW.estimateMbps()                estimación actual (Mbps)
 *   APE_BW.confidence()                  'none'|'low'|'medium'|'high'
 *   APE_BW.snapshot()                    { mbps, confidence, source, samples, bytes }
 *   APE_BW.reset()
 *   APE_BW.stats()
 *
 * Sin dependencias. Sirve en navegador y en Node (para tests).
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
    'use strict';

    var CONFIG = {
        HALF_LIFE_FAST_S: 3,              // src/config.ts:424 abrEwmaFastLive
        HALF_LIFE_SLOW_S: 9,              // src/config.ts:427 abrEwmaSlowLive
        MIN_WEIGHT: 0.001,                // ewma-bandwidth-estimator.ts:27 minWeight_
        MIN_DELAY_MS: 50,                 // :28 minDelayMs (v1.6.x)
        MAX_HISTORY: 120,
        STARTUP_DEFAULT_MBPS: 10,         // semilla si no hay connection.downlink
        CONNECTION_MAX_MBPS: 1000,
        // URL_RE: solo muestras de streaming (evita JS/CSS/iconos)
        URL_RE: /(\.m3u8|\.ts|\.m4s|\.mp4|\.aac|\.m4a|\.key|\.vtt|player_api\.php|duckdns\.org|\/cdn\/|\/live\/)/i,
        MIN_SAMPLE_MS: 50
    };

    // Estado por pista: hls.js inicializa estimate_=0 y weight_=0
    // (src/utils/ewma.ts) y corrige el sesgo al leer (:32-40).
    var fast = { estimate: 0, weight: 0 };
    var slow = { estimate: 0, weight: 0 };
    var totalBytes = 0;
    var samples = 0;
    var history = [];
    var harvested = {};                   // nombre|startTime ya contado
    var seeded = null;                    // { mbps, source }

    /** adjAlpha = 0.5^(durationS/halfLifeS) — equivalencia exacta de
     *  alpha_=exp(ln(0.5)/halfLife) elevado al peso (ewma.ts:17,23-24). */
    function adjAlpha(durationS, halfLifeS) {
        if (!(durationS > 0)) return 0;
        return Math.pow(0.5, durationS / halfLifeS);
    }

    function updateTrack(track, bitsPerSec, durationS, halfLifeS) {
        var a = adjAlpha(durationS, halfLifeS);
        track.estimate = track.estimate * a + bitsPerSec * (1 - a);
        track.weight += durationS;        // peso = SEGUNDOS de descarga
    }

    /** getEstimate() de hls.js: des-sesga con 1/(1 - alpha^totalWeight)
     *  (ewma.ts:32-40). Omitirlo deja las primeras lecturas BAJAS → riesgo
     *  inflado, que es justo el defecto que estamos corrigiendo. */
    function trackEstimate(track, halfLifeS) {
        if (!(track.weight > 0)) return 0;
        var debias = 1 - Math.pow(0.5, track.weight / halfLifeS);
        if (!(debias > 0)) return 0;
        return track.estimate / debias;
    }

    function sample(bytes, ms, label) {
        if (!(bytes > 0)) return null;
        // v1.6.x: durationMs = max(durationMs, 50)
        var durationMs = Math.max(CONFIG.MIN_DELAY_MS, Number(ms) || 0);
        var durationS = durationMs / 1000;
        var bitsPerSec = (bytes * 8) / durationS;   // bits/s
        if (!(bitsPerSec > 0) || !isFinite(bitsPerSec)) return null;

        updateTrack(fast, bitsPerSec, durationS, CONFIG.HALF_LIFE_FAST_S);
        updateTrack(slow, bitsPerSec, durationS, CONFIG.HALF_LIFE_SLOW_S);

        totalBytes += bytes;
        samples++;
        var rec = {
            mbps: Math.round((bitsPerSec / 1e6) * 100) / 100,
            bytes: bytes, ms: Math.round(durationMs), label: label || ''
        };
        history.push(rec);
        if (history.length > CONFIG.MAX_HISTORY) history.shift();
        return rec;
    }

    /** Cosecha Resource Timing: bytes y duración reales de descargas ya hechas. */
    function harvest() {
        if (!global.performance || typeof global.performance.getEntriesByType !== 'function') return 0;
        var entries = global.performance.getEntriesByType('resource') || [];
        var added = 0;
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var key = e.name + '|' + Math.round(e.startTime || 0);
            if (harvested[key]) continue;
            if (!CONFIG.URL_RE.test(e.name || '')) continue;
            // transferSize 0 = cache/servicio: no refleja el enlace
            var bytes = e.transferSize || e.encodedBodySize || 0;
            var ms = e.duration || 0;
            if (!(bytes > 0) || !(ms >= CONFIG.MIN_SAMPLE_MS)) continue;
            harvested[key] = 1;
            if (sample(bytes, ms, shortName(e.name))) added++;
        }
        return added;
    }

    function shortName(url) {
        try {
            var u = new URL(url, global.location ? global.location.href : undefined);
            var last = u.pathname.split('/').filter(Boolean).pop() || u.pathname;
            if (/\.(ts|m4s|mp4)$/i.test(last)) return 'segmento';
            if (/\.m3u8$/i.test(last)) return 'playlist';
            return u.hostname;
        } catch (e) { return 'recurso'; }
    }

    function seed() {
        if (seeded) return seeded;
        var mbps = 0, source = 'none';

        var c = global.navigator && global.navigator.connection;
        if (c && typeof c.downlink === 'number' && c.downlink > 0 && c.downlink < CONFIG.CONNECTION_MAX_MBPS) {
            mbps = c.downlink; source = 'connection.downlink';
        }
        if (!mbps) { mbps = CONFIG.STARTUP_DEFAULT_MBPS; source = 'startup-default'; }

        seeded = { mbps: mbps, source: source };
        return seeded;
    }

    /** canEstimate() de hls.js (:67-69): ambas pistas con peso mínimo. */
    function canEstimate() {
        return fast.weight > CONFIG.MIN_WEIGHT && slow.weight > CONFIG.MIN_WEIGHT;
    }

    function hasSignal() { return canEstimate(); }

    function estimateMbps() {
        if (!canEstimate()) return seed().mbps;
        var f = trackEstimate(fast, CONFIG.HALF_LIFE_FAST_S);
        var s = trackEstimate(slow, CONFIG.HALF_LIFE_SLOW_S);
        // MEZCLA = Math.min(fast, slow) — hls.js :77. NO es media ponderada:
        // baja rápido y sube lento (asimetría intencional, anti-yo-yo).
        return Math.min(f, s) / 1e6;
    }

    function confidence() {
        if (!hasSignal()) return 'none';
        if (slow.weight < 1) return 'low';
        if (slow.weight < 3 || totalBytes < 2 * 1024 * 1024) return 'medium';
        return 'high';
    }

    function snapshot() {
        harvest();
        var conf = confidence();
        return {
            mbps: Math.round(estimateMbps() * 100) / 100,
            confidence: conf,
            source: conf === 'none' ? seed().source : 'resource-timing',
            samples: samples,
            bytes: totalBytes,
            fast: Math.round((trackEstimate(fast, CONFIG.HALF_LIFE_FAST_S) / 1e6) * 100) / 100,
            slow: Math.round((trackEstimate(slow, CONFIG.HALF_LIFE_SLOW_S) / 1e6) * 100) / 100
        };
    }

    function reset() {
        fast = { estimate: 0, weight: 0 };
        slow = { estimate: 0, weight: 0 };
        totalBytes = 0; samples = 0;
        history = []; harvested = {}; seeded = null;
    }

    function stats() {
        return {
            config: CONFIG,
            fast: { estimateMbps: Math.round((trackEstimate(fast, CONFIG.HALF_LIFE_FAST_S) / 1e6) * 100) / 100, weightS: Math.round(fast.weight * 1000) / 1000 },
            slow: { estimateMbps: Math.round((trackEstimate(slow, CONFIG.HALF_LIFE_SLOW_S) / 1e6) * 100) / 100, weightS: Math.round(slow.weight * 1000) / 1000 },
            canEstimate: canEstimate(),
            samples: samples, totalBytes: totalBytes,
            confidence: confidence(),
            seed: seed(),
            last: history.slice(-10)
        };
    }

    var API = {
        sample: sample, harvest: harvest, estimateMbps: estimateMbps,
        confidence: confidence, snapshot: snapshot, reset: reset, stats: stats,
        CONFIG: CONFIG
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') {
        window.APE_BW = API;
        // cosecha periódica: el panel siempre tiene datos frescos sin instrumentar fetch
        try { setInterval(function () { harvest(); }, 4000); } catch (e) {}
    }
})(typeof window !== 'undefined' ? window : globalThis);
