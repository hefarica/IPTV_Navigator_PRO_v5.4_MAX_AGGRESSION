/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE PREDICTIVE PREFETCH v1.0 — motor REAL detrás del toggle "Predicción AI"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * POR QUÉ EXISTE (fallo medido en el repo)
 *   `profile-manager-v9.js` ofrecía un checkbox "Predicción AI" que escribía
 *   `prefetch_config.ai_prediction_enabled` y NADIE lo leía. El generador
 *   declaraba `AI=enabled` fijo. No había modelo, ni consumidor, ni evidencia.
 *
 * QUÉ HACE (y qué NO)
 *   SÍ: pronostica el throughput del enlace a un horizonte corto usando
 *        MEDICIONES REALES de `APE_BW` (Resource Timing → bytes/ms reales),
 *        y convierte ese pronóstico en una decisión ACOTADA de prefetch.
 *   NO: no es machine learning, no inventa datos, no promete "IA" genérica.
 *        Es un predictor determinista y auditable: doble EWMA + tendencia por
 *        mínimos cuadrados + ventana tipo neuro-buffer + riesgo logístico.
 *        Si no hay medición, devuelve `evidence: 'none'` y NO cambia nada.
 *
 * MODELO (todo verificable a mano; ver tests/ape-predictive-prefetch.test.js)
 *   base      = APE_BW.snapshot().mbps  (min(fast,slow) des-sesgado de hls.js)
 *   trend     = (fast - slow) / max(slow, ε)          → asimetría medida
 *   slope     = mínimos cuadrados de mbps vs segundos (ventana reciente)
 *   forecast  = clamp(base + slope·H, 0.25·base, 3·base)      (H = 10 s)
 *   predicted = 0.6·base + 0.4·forecast               → baja varianza
 *   jitter    = EWMA(α=0.3) de |x_i - x_{i-1}| / max(x_{i-1}, ε)
 *   r2        = 1 - SSres/SStot de la ventana (calidad de ajuste)
 *   confidence= min(1, n/6) · (0.5 + 0.5·max(0,r2)) · peso(BW.confidence)
 *   headroom  = predicted / bitrateMbps
 *   risk      = 1 / (1 + exp(-(5.9·(headroom-1) + 0.2 - 0.8·jitter + bufferBonus)))
 *               calibrado: headroom 2.0→~0.2%, 1.5→~4%, 1.2→~20%,
 *               1.0→~45%, 0.8→~73%.  El buffer real (si existe) baja el riesgo.
 *
 * GOBIERNO ACOTADO (nunca viola el SSOT del perfil)
 *   El predictor SOLO puede ESTRECHAR: segments/parallel ∈ [3, declarado].
 *   Nunca infla por encima de lo declarado por el operador.
 *   - risk ≥ 35%  → aplica 50% de lo declarado
 *   - risk ≥ 20%  → aplica 75%
 *   - resto       → deja lo declarado
 *   Si el buffer real está por debajo del nivel BURST/NUCLEAR (semántica del
 *   `neuro_buffer_controller.php` del VPS: 70/30/10 %), estrecha otro 25%
 *   adicional — siempre dentro del piso 3/1.
 *
 * EVIDENCIA
 *   `snapshot()` y `decide()` devuelven siempre `evidence`:
 *     { samples, mbps, bwConfidence, observations, source, measuredAt }
 *   con `source: 'resource-timing' | 'none'`. Nada se declara medido si no lo fue.
 *
 * API
 *   APE_PREDICT.observe([atMs])      cosecha APE_BW y añade a la ventana
 *   APE_PREDICT.setBuffer(pct)       buffer real 0-100 (opcional, del player)
 *   APE_PREDICT.setSource(fn)        fuente de medición alternativa (player)
 *   APE_PREDICT.snapshot()           predicción actual + evidencia
 *   APE_PREDICT.decide(profile)      decisión acotada (null si AI está off)
 *   APE_PREDICT.explain()            razones legibles de la última decisión
 *   APE_PREDICT.reset()
 *   APE_PREDICT.CONFIG
 *
 * Sin dependencias. Navegador y Node (tests).
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
    'use strict';

    var CONFIG = {
        VERSION: '1.0.0',
        HORIZON_S: 10,              // horizonte de pronóstico (≈2 ventanas de 5 s)
        WINDOW_MAX: 60,             // observaciones guardadas
        WINDOW_FIT: 8,              // observaciones usadas para la regresión
        JITTER_ALPHA: 0.3,
        MIN_OBSERVATIONS: 2,        // menos que esto = sin evidencia
        MIN_CONFIDENCE: 0.35,       // umbral para que el gobernador actúe
        FLOOR_SEGMENTS: 3,          // mismo piso histórico del bloque 8.l
        FLOOR_PARALLEL: 1,
        RISK_TIGHTEN: 35,           // % de riesgo → estrecha 50%
        RISK_SOFT: 20,              // % de riesgo → estrecha 25%
        NEURO_LEVELS: { NORMAL: 70, ESCALATE: 30, BURST: 10 }  // == neuro_buffer_controller.php
    };

    var window_ = [];               // [{ t: ms, mbps: number }]
    var bufferPct = null;           // buffer real del player (0-100)
    var jitter = 0;
    var lastDecision = null;
    var lastExplain = [];
    var cache = { key: '', value: null };
    var source = null;              // fuente alternativa de medición (player/tests)

    function now() { return Date.now(); }

    function eps() { return 1e-6; }

    function round(n, d) {
        var p = Math.pow(10, d || 0);
        return Math.round(n * p) / p;
    }

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    /** Fuente alternativa de medición: debe devolver el MISMO contrato que
     *  APE_BW.snapshot() → { mbps, fast, slow, confidence, samples }.
     *  Sirve para alimentar el predictor con el estimador del player cuando
     *  el navegador no expone Resource Timing. */
    function setSource(fn) {
        source = (typeof fn === 'function') ? fn : null;
        cache.key = '';
        return !!source;
    }

    function bwSnapshot() {
        if (source) {
            try {
                var o = source();
                if (o && typeof o.mbps === 'number' && o.mbps > 0) return o;
                return null;
            } catch (e) { return null; }
        }
        var api = global.APE_BW;
        if (!api || typeof api.snapshot !== 'function') return null;
        try { return api.snapshot(); } catch (e) { return null; }
    }

    function bwConfidenceWeight(c) {
        if (c === 'high') return 1;
        if (c === 'medium') return 0.85;
        if (c === 'low') return 0.6;
        return 0;
    }

    /** Añade la medición actual a la ventana de tendencia. Devuelve tamaño.
     *  @param {number} [atMs] reloj explícito (tests); si falta usa Date.now() */
    function observe(atMs) {
        var s = bwSnapshot();
        if (!s || typeof s.mbps !== 'number' || !(s.mbps > 0)) return window_.length;
        if (s.confidence === 'none') return window_.length;   // sin medición no hay evidencia

        // jitter relativo EWMA (la primera muestra no aporta delta)
        var prev = window_.length ? window_[window_.length - 1].mbps : 0;
        if (prev > 0) {
            var rel = Math.abs(s.mbps - prev) / prev;
            jitter = CONFIG.JITTER_ALPHA * rel + (1 - CONFIG.JITTER_ALPHA) * jitter;
        }

        var t = Number(atMs);
        window_.push({ t: Number.isFinite(t) ? t : now(), mbps: s.mbps });
        if (window_.length > CONFIG.WINDOW_MAX) window_.shift();
        cache.key = '';                                        // invalida memo
        return window_.length;
    }

    function setBuffer(pct) {
        var n = Number(pct);
        bufferPct = (Number.isFinite(n) && n >= 0 && n <= 100) ? n : null;
        cache.key = '';
        return bufferPct;
    }

    function neuroLevel(pct) {
        if (pct === null || pct === undefined) return null;
        if (pct >= CONFIG.NEURO_LEVELS.NORMAL) return 'NORMAL';
        if (pct >= CONFIG.NEURO_LEVELS.ESCALATE) return 'ESCALATE';
        if (pct >= CONFIG.NEURO_LEVELS.BURST) return 'BURST';
        return 'NUCLEAR';
    }

    /** Regresión lineal mínima → { slope (Mbps/s), r2, n }. */
    function fit() {
        var pts = window_.slice(-CONFIG.WINDOW_FIT);
        var n = pts.length;
        if (n < 2) return { slope: 0, r2: 0, n: n };

        var t0 = pts[0].t;
        var sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, count = 0;
        for (var i = 0; i < n; i++) {
            var x = (pts[i].t - t0) / 1000;                     // segundos
            var y = pts[i].mbps;
            if (!isFinite(x) || !isFinite(y)) continue;
            sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; count++;
        }
        if (count < 2) return { slope: 0, r2: 0, n: count };

        var denom = count * sxx - sx * sx;
        var slope = (Math.abs(denom) < eps()) ? 0 : (count * sxy - sx * sy) / denom;
        var meanY = sy / count;
        var ssTot = 0, ssRes = 0;
        for (var j = 0; j < n; j++) {
            var xj = (pts[j].t - t0) / 1000;
            var yj = pts[j].mbps;
            if (!isFinite(xj) || !isFinite(yj)) continue;
            var pred = meanY + slope * (xj - sx / count);
            ssTot += Math.pow(yj - meanY, 2);
            ssRes += Math.pow(yj - pred, 2);
        }
        var r2 = ssTot > eps() ? (1 - ssRes / ssTot) : 1;   // serie constante = ajuste perfecto
        return { slope: isFinite(slope) ? slope : 0, r2: clamp(r2, 0, 1), n: count };
    }

    /**
     * Predicción completa. Nunca lanza; si no hay evidencia devuelve
     * confidence 0 y evidence.source 'none'.
     */
    function snapshot() {
        var s = bwSnapshot();
        var bwConf = s ? s.confidence : 'none';
        // APE_BW devuelve una SEMILLA (startup-default / connection.downlink)
        // cuando aún no midió. Eso NO es evidencia: base = 0 y source = none,
        // para no declarar Mbps "medidos" que nunca se midieron.
        var hasSignal = !!s && bwConf !== 'none' && typeof s.mbps === 'number' && s.mbps > 0;
        var base = hasSignal ? s.mbps : 0;
        var fast = (hasSignal && typeof s.fast === 'number') ? s.fast : base;
        var slow = (hasSignal && typeof s.slow === 'number') ? s.slow : base;

        var trend = 0;
        if (slow > eps() && fast > 0) trend = (fast - slow) / slow;

        var f = fit();
        var forecast = clamp(base + f.slope * CONFIG.HORIZON_S, base * 0.25, base * 3);
        var predicted = base > 0 ? (0.6 * base + 0.4 * forecast) : 0;

        var obs = window_.length;
        var hasEvidence = base > 0 && obs >= CONFIG.MIN_OBSERVATIONS && bwConf !== 'none';
        var conf = hasEvidence
            ? clamp(Math.min(1, obs / 6) * (0.5 + 0.5 * Math.max(0, f.r2)) * bwConfidenceWeight(bwConf), 0, 1)
            : 0;

        var evidence = {
            samples: (s && s.samples) || 0,
            mbps: round(base, 2),
            bwConfidence: bwConf,
            observations: obs,
            source: hasEvidence ? 'resource-timing' : 'none',
            measuredAt: now()
        };

        return {
            version: CONFIG.VERSION,
            base: round(base, 2),
            forecast: round(forecast, 2),
            predicted: round(predicted, 2),
            trend: round(trend, 4),
            slopeMbpsPerS: round(f.slope, 4),
            r2: round(f.r2, 4),
            jitter: round(jitter, 4),
            confidence: round(conf, 2),
            horizonSec: CONFIG.HORIZON_S,
            bufferPct: bufferPct,
            neuroLevel: neuroLevel(bufferPct),
            evidence: evidence
        };
    }

    /** Riesgo de stall en el horizonte, dado el bitrate del perfil.
     *  z = -5.9·(headroom-1) - 0.2 - 0.8·jitter + bufferBonus
     *  Calibración verificada en tests: h=2.0→~0.2% · 1.5→~4% · 1.2→~20%
     *  1.0→~45% · 0.8→~73%. Más jitter ⇒ z baja ⇒ más riesgo. */
    function riskFor(predictedMbps, bitrateMbps, sn) {
        if (!(bitrateMbps > 0)) return null;
        var headroom = predictedMbps / bitrateMbps;
        var bufferBonus = (sn.bufferPct !== null) ? clamp((sn.bufferPct - 30) / 100, -0.2, 0.5) : 0;
        var z = (-5.9 * (headroom - 1)) - 0.2 - (0.8 * sn.jitter) + bufferBonus;
        var risk = 1 / (1 + Math.exp(-z));
        return { headroom: headroom, riskPct: round(risk * 100, 1) };
    }

    function numOrNull(v) {
        var n = Number(String(v === undefined || v === null ? '' : v).split(',')[0].trim());
        return (Number.isFinite(n) && n > 0) ? n : null;
    }

    /**
     * Decisión acotada de prefetch para un perfil.
     * @param {Object} profile { bitrate(kbps), prefetch_segments, prefetch_parallel,
     *                           prefetch_buffer_target(ms), segment_duration(s),
     *                           prefetch_ai_prediction(bool) }
     * @returns {Object|null} null si AI está off; si no, {declared,applied,...,evidence}
     */
    function decide(profile) {
        var p = profile || {};
        if (p.prefetch_ai_prediction !== true) { lastDecision = null; return null; }

        var declaredSegments = numOrNull(p.prefetch_segments) || CONFIG.FLOOR_SEGMENTS;
        var declaredParallel = numOrNull(p.prefetch_parallel) || CONFIG.FLOOR_PARALLEL;
        var bitrateMbps = (Number(p.bitrate) > 0) ? Number(p.bitrate) / 1000 : 0;

        var key = [declaredSegments, declaredParallel, bitrateMbps, bufferPct, window_.length,
            (window_.length ? window_[window_.length - 1].mbps : 0)].join('|');
        if (cache.key === key && cache.value) return cache.value;

        var sn = snapshot();
        // Sin medición no se declara riesgo: un 0 Mbps "medido" produciría un
        // 100% de riesgo falso. La ausencia de evidencia se reporta como tal.
        var risk = (sn.evidence.source !== 'none') ? riskFor(sn.predicted, bitrateMbps, sn) : null;

        var appliedSegments = declaredSegments;
        var appliedParallel = declaredParallel;
        var reasons = [];
        var restricted = false;

        if (sn.evidence.source !== 'none' && sn.confidence >= CONFIG.MIN_CONFIDENCE && risk) {
            var factor = 1;
            if (risk.riskPct >= CONFIG.RISK_TIGHTEN) {
                factor = 0.50;
                reasons.push('riesgo ' + risk.riskPct + '% ≥ ' + CONFIG.RISK_TIGHTEN + '% → 50%');
            } else if (risk.riskPct >= CONFIG.RISK_SOFT) {
                factor = 0.75;
                reasons.push('riesgo ' + risk.riskPct + '% ≥ ' + CONFIG.RISK_SOFT + '% → 75%');
            } else {
                reasons.push('riesgo ' + risk.riskPct + '% < ' + CONFIG.RISK_SOFT + '% → declarado');
            }

            // Semántica neuro-buffer del VPS: buffer bajo ⇒ estrechar otro 25%
            if (sn.neuroLevel === 'BURST' || sn.neuroLevel === 'NUCLEAR') {
                factor *= 0.75;
                reasons.push('buffer ' + (bufferPct === null ? '?' : bufferPct + '%') + ' (' + sn.neuroLevel + ') → ×0.75');
            }

            appliedSegments = Math.max(CONFIG.FLOOR_SEGMENTS, Math.floor(declaredSegments * factor));
            appliedParallel = Math.max(CONFIG.FLOOR_PARALLEL, Math.floor(declaredParallel * factor));
            restricted = (appliedSegments !== declaredSegments || appliedParallel !== declaredParallel);
        } else {
            reasons.push('sin evidencia suficiente (conf ' + sn.confidence + ') → declarado sin cambios');
        }

        // Garantías duras: nunca por debajo del piso, nunca por encima del SSOT
        appliedSegments = clamp(appliedSegments, CONFIG.FLOOR_SEGMENTS, declaredSegments);
        appliedParallel = clamp(appliedParallel, CONFIG.FLOOR_PARALLEL, declaredParallel);

        var decision = {
            enabled: true,
            restricted: restricted,
            declared: { segments: declaredSegments, parallel: declaredParallel },
            applied: { segments: appliedSegments, parallel: appliedParallel },
            riskPct: risk ? risk.riskPct : null,
            headroom: risk ? round(risk.headroom, 2) : null,
            confidence: sn.confidence,
            predictedMbps: sn.predicted,
            trend: sn.trend,
            jitter: sn.jitter,
            neuroLevel: sn.neuroLevel,
            horizonSec: sn.horizonSec,
            evidence: sn.evidence,
            reasons: reasons
        };

        lastDecision = decision;
        lastExplain = reasons.slice();
        cache.key = key;
        cache.value = decision;
        return decision;
    }

    function explain() {
        return lastExplain.slice();
    }

    function reset() {
        window_ = [];
        bufferPct = null;
        jitter = 0;
        lastDecision = null;
        lastExplain = [];
        cache = { key: '', value: null };
        source = null;
    }

    var API = {
        observe: observe,
        setBuffer: setBuffer,
        setSource: setSource,
        snapshot: snapshot,
        decide: decide,
        explain: explain,
        reset: reset,
        neuroLevel: neuroLevel,
        CONFIG: CONFIG
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') {
        window.APE_PREDICT = API;
        // Observación periódica: la ventana se llena con mediciones reales de APE_BW.
        try {
            setInterval(function () {
                try { if (global.APE_BW && global.APE_BW.harvest) global.APE_BW.harvest(); } catch (e) {}
                observe();
            }, 2000);
        } catch (e) {}
    }
})(typeof window !== 'undefined' ? window : globalThis);

