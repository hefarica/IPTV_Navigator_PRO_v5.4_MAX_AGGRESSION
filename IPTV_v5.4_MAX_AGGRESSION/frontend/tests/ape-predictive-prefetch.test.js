/**
 * TESTS — APE Predictive Prefetch v1.0
 * Ejecutar: node frontend/tests/ape-predictive-prefetch.test.js
 *
 * Los fixtures de estos tests son SECUENCIAS NUMÉRICAS CONTROLADAS para
 * verificar la matemática (EWMA/tendencia/regresión/riesgo). NO son datos de
 * producción ni simulan mediciones: la medición REAL está en
 * `predictive-prefetch-live.js` (HTTP loopback real, bytes y ms reales).
 */
'use strict';

const path = require('path');
const PRED_PATH = path.join(__dirname, '..', 'js', 'ape-v9', 'streaming', 'predictive-prefetch-v9.js');
const P = require(PRED_PATH);

let pass = 0, fail = 0;
const failures = [];

function ok(cond, msg) {
    if (cond) { pass++; console.log('  \u2705 ' + msg); }
    else { fail++; failures.push(msg); console.error('  \u274c ' + msg); }
}
function near(a, b, tol, msg) {
    ok(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ' + b + ' \u00b1' + tol + ')');
}
function section(t) { console.log('\n--- ' + t + ' ---'); }

function src(v) {
    // fuente contractual equivalente a APE_BW.snapshot()
    return function () {
        if (v === null) return null;
        return { mbps: v, fast: v, slow: v, confidence: 'high', samples: 1000 };
    };
}

function feed(p, values, stepMs, t0) {
    const t = (t0 === undefined) ? 0 : t0;
    for (let i = 0; i < values.length; i++) {
        p.setSource(src(values[i]));
        p.observe(t + i * stepMs);
    }
}

/**
 * Modelo de doble pista: rápida = muestra, lenta = EMA(0.9).
 * Así `trend = (fast - slow)/slow` tiene el signo real de la serie, igual
 * que en APE_BW (que expone fast/slow medidos).
 */
function feedModel(p, values, stepMs, t0) {
    let slow = values[0];
    for (let i = 0; i < values.length; i++) {
        slow = (i === 0) ? values[i] : (0.9 * slow + 0.1 * values[i]);
        const fast = values[i];
        const sm = slow;
        p.setSource(function () {
            return { mbps: Math.min(fast, sm), fast: fast, slow: sm, confidence: 'high', samples: 1000 };
        });
        p.observe(((t0 === undefined) ? 0 : t0) + i * stepMs);
    }
}

// ══════════════════════════════════════════════════════════════════════════
// A. Sin evidencia ⇒ no se inventa nada
// ══════════════════════════════════════════════════════════════════════════
section('A. Sin evidencia (nunca miente)');
P.reset();
P.setSource(function () { return null; });
{
    const sn = P.snapshot();
    ok(sn.evidence.source === 'none', 'snapshot sin fuente ⇒ evidence.source = none');
    ok(sn.confidence === 0, 'snapshot sin fuente ⇒ confidence 0');
    const d = P.decide({ prefetch_ai_prediction: true, prefetch_segments: 90, prefetch_parallel: 40, bitrate: 12000 });
    ok(d && d.applied.segments === 90 && d.applied.parallel === 40, 'sin evidencia ⇒ aplica lo declarado (90/40)');
    ok(d.riskPct === null, 'sin evidencia ⇒ riskPct null (no se declara riesgo medido)');
    ok(d.reasons.join(' ').indexOf('sin evidencia') >= 0, 'razón explícita: sin evidencia');
}

// ══════════════════════════════════════════════════════════════════════════
// B. AI OFF ⇒ no hay decisión
// ══════════════════════════════════════════════════════════════════════════
section('B. Toggle apagado');
P.reset();
{
    ok(P.decide({ prefetch_ai_prediction: false, prefetch_segments: 90, prefetch_parallel: 40, bitrate: 12000 }) === null,
        'decide() con AI off ⇒ null');
}

// ══════════════════════════════════════════════════════════════════════════
// C. Enlace estable y holgado ⇒ no toca nada, riesgo bajo
// ══════════════════════════════════════════════════════════════════════════
section('C. Enlace estable 60 Mbps / perfil 12 Mbps');
P.reset();
feedModel(P, [60, 60, 60, 60, 60, 60], 2000, 0);
{
    const sn = P.snapshot();
    near(sn.base, 60, 0.5, 'base = 60 Mbps');
    near(sn.predicted, 60, 1.5, 'predicted ≈ 60 (sin pendiente)');
    ok(sn.confidence > 0.7, 'confidence alta con 6 observaciones estables (got ' + sn.confidence + ')');
    const d = P.decide({ prefetch_ai_prediction: true, prefetch_segments: 90, prefetch_parallel: 40, bitrate: 12000 });
    ok(d.riskPct !== null && d.riskPct < 5, 'riesgo < 5% con headroom 5× (got ' + d.riskPct + '%)');
    ok(d.applied.segments === 90 && d.applied.parallel === 40, 'riesgo bajo ⇒ devuelve lo declarado sin tocar');
    ok(d.restricted === false, 'restricted = false');
}

// ══════════════════════════════════════════════════════════════════════════
// D. Caída fuerte ⇒ pronóstico a la baja + riesgo alto + estrechamiento
// ══════════════════════════════════════════════════════════════════════════
section('D. Caída 70→18 Mbps (perfil 12 Mbps)');
P.reset();
feedModel(P, [70, 55, 42, 32, 24, 18], 2000, 0);
{
    const sn = P.snapshot();
    ok(sn.trend < 0, 'tendencia negativa (got ' + sn.trend + ')');
    ok(sn.slopeMbpsPerS < -1, 'pendiente negativa (got ' + sn.slopeMbpsPerS + ' Mbps/s)');
    ok(sn.forecast < sn.base, 'forecast por debajo de base (got ' + sn.forecast + ' < ' + sn.base + ')');
    ok(sn.predicted < sn.base, 'predicted por debajo de base');
    const d = P.decide({ prefetch_ai_prediction: true, prefetch_segments: 90, prefetch_parallel: 40, bitrate: 12000 });
    ok(d.riskPct > 20, 'riesgo > 20% tras la caída (got ' + d.riskPct + '%)');
    ok(d.applied.segments < 90 && d.applied.parallel < 40, 'estrecha (aplicado ' + d.applied.segments + 'x' + d.applied.parallel + ')');
    ok(d.applied.segments >= P.CONFIG.FLOOR_SEGMENTS, 'respeta piso de segmentos');
    ok(d.applied.parallel >= P.CONFIG.FLOOR_PARALLEL, 'respeta piso de paralelo');
    ok(d.restricted === true, 'restricted = true');
}

// ══════════════════════════════════════════════════════════════════════════
// E. Garantías duras: nunca por encima del SSOT, nunca bajo el piso
// ══════════════════════════════════════════════════════════════════════════
section('E. Garantías (SSOT y pisos)');
{
    P.reset();
    feedModel(P, [60, 45, 33, 24, 18, 14], 2000, 0);
    const d = P.decide({ prefetch_ai_prediction: true, prefetch_segments: 10, prefetch_parallel: 4, bitrate: 12000 });
    ok(d.applied.segments <= 10, 'aplicado ≤ declarado (segmentos)');
    ok(d.applied.parallel <= 4, 'aplicado ≤ declarado (paralelo)');
    ok(d.applied.segments >= 3, 'aplicado ≥ piso 3');
    ok(d.applied.parallel >= 1, 'aplicado ≥ piso 1');

    // fuzz determinista: 200 combinaciones, propiedad siempre válida
    let violations = 0;
    let seed = 12345;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    for (let i = 0; i < 200; i++) {
        P.reset();
        const declaredSeg = 3 + Math.floor(rnd() * 120);
        const declaredPar = 1 + Math.floor(rnd() * 64);
        const vals = [];
        for (let k = 0; k < 6; k++) vals.push(5 + rnd() * 95);
        feed(P, vals, 1000, 0);
        const bitrateKbps = 1000 + Math.floor(rnd() * 60000);
        const dd = P.decide({
            prefetch_ai_prediction: true,
            prefetch_segments: declaredSeg,
            prefetch_parallel: declaredPar,
            bitrate: bitrateKbps
        });
        if (dd.applied.segments > declaredSeg || dd.applied.parallel > declaredPar) violations++;
        if (dd.applied.segments < 3 || dd.applied.parallel < 1) violations++;
        if (!(dd.riskPct === null || (dd.riskPct >= 0 && dd.riskPct <= 100))) violations++;
    }
    ok(violations === 0, '200 casos fuzz: 0 violaciones de contrato (got ' + violations + ')');
}

// ══════════════════════════════════════════════════════════════════════════
// F. Determinismo
// ══════════════════════════════════════════════════════════════════════════
section('F. Determinismo');
{
    function run() {
        P.reset();
        feed(P, [50, 44, 38, 33, 29, 26], 2000, 0);
        return JSON.stringify(P.decide({ prefetch_ai_prediction: true, prefetch_segments: 90, prefetch_parallel: 40, bitrate: 12000 }));
    }
    ok(run() === run(), 'misma entrada ⇒ misma decisión (byte a byte)');
}

// ══════════════════════════════════════════════════════════════════════════
// G. Calibración del riesgo (fórmula documentada)
// ══════════════════════════════════════════════════════════════════════════
section('G. Calibración risk(headroom)');
{
    // headroom objetivo = predicted/bitrate ⇒ fijamos predicted=60 y variamos bitrate
    const cases = [
        { bitrateKbps: 30000, headroom: 2.0, want: 0.2, tol: 1.0 },
        { bitrateKbps: 40000, headroom: 1.5, want: 4.0, tol: 2.0 },
        { bitrateKbps: 50000, headroom: 1.2, want: 20.0, tol: 6.0 },
        { bitrateKbps: 60000, headroom: 1.0, want: 45.0, tol: 8.0 },
        { bitrateKbps: 75000, headroom: 0.8, want: 73.0, tol: 10.0 }
    ];
    for (const c of cases) {
        P.reset();
        feed(P, [60, 60, 60, 60, 60, 60], 2000, 0);
        const d = P.decide({ prefetch_ai_prediction: true, prefetch_segments: 100, prefetch_parallel: 50, bitrate: c.bitrateKbps });
        near(d.riskPct, c.want, c.tol, 'headroom ' + c.headroom + ' ⇒ riesgo ≈' + c.want + '%');
    }
}

// ══════════════════════════════════════════════════════════════════════════
// H. Jitter sube el riesgo (misma media)
// ══════════════════════════════════════════════════════════════════════════
section('H. Jitter');
{
    P.reset();
    feedModel(P, [40, 40, 40, 40, 40, 40], 2000, 0);
    const flat = P.decide({ prefetch_ai_prediction: true, prefetch_segments: 100, prefetch_parallel: 50, bitrate: 40000 });

    P.reset();
    feedModel(P, [40, 10, 70, 12, 66, 14], 2000, 0);
    const jag = P.decide({ prefetch_ai_prediction: true, prefetch_segments: 100, prefetch_parallel: 50, bitrate: 40000 });

    ok(jag.jitter > flat.jitter, 'jitter medido mayor en serie con picos (got ' + jag.jitter + ' > ' + flat.jitter + ')');
    ok(jag.riskPct > flat.riskPct, 'riesgo mayor con jitter (got ' + jag.riskPct + '% > ' + flat.riskPct + '%)');
}

// ══════════════════════════════════════════════════════════════════════════
// I. Ventana neuro-buffer (semántica del VPS)
// ══════════════════════════════════════════════════════════════════════════
section('I. Neuro-buffer');
{
    ok(P.neuroLevel(85) === 'NORMAL', '85% ⇒ NORMAL');
    ok(P.neuroLevel(50) === 'ESCALATE', '50% ⇒ ESCALATE');
    ok(P.neuroLevel(20) === 'BURST', '20% ⇒ BURST');
    ok(P.neuroLevel(5) === 'NUCLEAR', '5% ⇒ NUCLEAR');

    P.reset();
    feedModel(P, [24, 20, 17, 15, 13, 12], 2000, 0);
    const dNoBuf = P.decide({ prefetch_ai_prediction: true, prefetch_segments: 90, prefetch_parallel: 40, bitrate: 12000 });

    P.reset();
    P.setBuffer(8);                       // NUCLEAR
    feedModel(P, [24, 20, 17, 15, 13, 12], 2000, 0);
    const dBuf = P.decide({ prefetch_ai_prediction: true, prefetch_segments: 90, prefetch_parallel: 40, bitrate: 12000 });

    ok(dBuf.neuroLevel === 'NUCLEAR', 'buffer 8% reportado como NUCLEAR');
    ok(dBuf.applied.segments <= dNoBuf.applied.segments, 'buffer NUCLEAR no relaja (≤ sin buffer)');
    ok(dBuf.applied.segments >= 3, 'sigue sobre el piso');
}

// ══════════════════════════════════════════════════════════════════════════
// J. Memo: mismos insumos ⇒ mismo objeto cacheado, y observe() invalida
// ══════════════════════════════════════════════════════════════════════════
section('J. Caché');
{
    P.reset();
    feedModel(P, [60, 58, 56, 54, 52, 50], 2000, 0);
    const args = { prefetch_ai_prediction: true, prefetch_segments: 90, prefetch_parallel: 40, bitrate: 12000 };
    const a = P.decide(args);
    const b = P.decide(args);
    ok(a === b, 'segunda llamada devuelve la decisión cacheada');
    P.setSource(src(20));
    P.observe(20000);
    const c = P.decide(args);
    ok(c !== a, 'nueva observación invalida la caché');
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log('RESULTADO: ' + pass + ' PASS / ' + fail + ' FAIL');
if (fail) { console.log('Fallos:'); failures.forEach(f => console.log(' - ' + f)); }
console.log('══════════════════════════════════════');
process.exit(fail ? 1 : 0);


