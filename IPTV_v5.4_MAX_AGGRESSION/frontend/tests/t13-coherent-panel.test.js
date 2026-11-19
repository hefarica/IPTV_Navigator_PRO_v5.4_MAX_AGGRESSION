/* ═══════════════════════════════════════════════════════════════════════════
 * t13 — PLAN COHERENTE ATADO AL OBJETIVO DE STALL (2ª parte, autorizada)
 *
 * Demuestra, con números y sin red:
 *   A · la réplica de stall del tuner es IGUAL al calculador REAL del panel
 *       (mismo resultado que StreamingCalculator.calculateStallRate).
 *   B · bufferForTargetStall despeja el buffer necesario y coincide con la
 *       bisección hecha con el calculador real.
 *   C · coherentPlan.ok:true SÓLO si el stall estimado ≤ target (1.67 %).
 *   D · MATRIZ 5 estrategias × 4 redes con buffer, stall estimado y ok:
 *       400 y 230 → stall ≤1.67 % y ok:true en las cinco; 20 y 0.1 → ok:false.
 *   E · si el buffer necesario no cabe en el rango (30 s) → ok:false con
 *       'buffer_insuficiente_para_target' y neededBufferS EXACTO.
 *   F · el plan aplicado al panel deja el chip verde de verdad (el calculador
 *       real confirma meetsTarget).
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

global.window = global;
global.document = {
    head: { appendChild() {} },
    createElement() { return { style: {}, appendChild() {} }; },
    getElementById() { return null; },
    querySelector() { return null; }
};
global.localStorage = { getItem() { return null; }, setItem() {} };

const FRONT = path.join(__dirname, '..');
const factory = require(path.join(FRONT, 'js/ape-v9/streaming/auto-tune-v1.js'));
const tuner = factory({});
require(path.join(FRONT, 'js/ape-v9/prefetch-presets.js'));
require(path.join(FRONT, 'js/ape-v9/streaming-calculator.js'));

const STRATS = global.window.PREFETCH_STRATEGIES || {};
const IDS = Object.keys(STRATS);
const CALC = global.window.StreamingCalculator;
const MARGIN = tuner.DEFAULTS.margin;
const TARGET = tuner.STALL.target;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); }
}
function r2(v) { return Math.round(v * 100) / 100; }

const PANEL = {
    prefetch_segments: { min: 5, max: 200 },
    parallel_downloads: { min: 1, max: 50 },
    buffer_target_seconds: { min: 10, max: 600 },
    min_bandwidth_mbps: { min: 0, max: 10000 }
};
const KEYMAP = {
    prefetch_segments: 'prefetchSegments',
    parallel_downloads: 'parallelDownloads',
    buffer_target_seconds: 'bufferTargetS',
    min_bandwidth_mbps: 'bwMinMbps'
};
function clampToPanel(pv) {
    const out = {}, clamped = [];
    Object.keys(PANEL).forEach((k) => {
        const src = pv ? pv[KEYMAP[k]] : undefined;
        if (src === undefined || src === null) return;
        const raw = Math.round(Number(src));
        if (!isFinite(raw)) return;
        const rr = PANEL[k];
        const v = Math.min(rr.max, Math.max(rr.min, raw));
        if (v !== raw) clamped.push({ key: k, plan: raw, applied: v });
        out[k] = v;
    });
    return { values: out, clamped };
}

/* Bitrate con el que el PANEL estima el stall: el suyo, no el del perfil. */
const STALL_BITRATE = CALC.calculateBitrate('1920x1080', 'H265', 60);   // :215-231
console.log('\n=== 0 · datos de partida ===');
console.log('        target de stall del panel = ' + TARGET + ' % · margen = ' + MARGIN +
    ' · bitrate del calculador (1080p H265 60) = ' + STALL_BITRATE + ' Mbps');
ok('RANGES.bufferTargetS = 10..32', tuner.RANGES.bufferTargetS.min === 10 && tuner.RANGES.bufferTargetS.max === 32, tuner.RANGES.bufferTargetS);
ok('STALL declara target 1.67 y k 0.5', tuner.STALL.target === 1.67 && tuner.STALL.k === 0.5);
ok('el target del tuner es el del panel (STREAMING_CONSTANTS)',
    global.window.STREAMING_CONSTANTS.TARGET_STALL_RATE === TARGET,
    global.window.STREAMING_CONSTANTS.TARGET_STALL_RATE);

console.log('\n=== A · la réplica de stall == el calculador REAL ===');
[10, 13, 20, 25, 30].forEach((B) => {
    const mine = r2(tuner.stallForBuffer(B, STALL_BITRATE, 230));
    const real = r2(CALC.calculateStallRate(B, STALL_BITRATE, 230).probability);
    ok('buffer ' + B + ' s · mine=' + mine + ' real=' + real, Math.abs(mine - real) < 0.02, { mine, real });
});

console.log('\n=== B · bufferForTargetStall coincide con la bisección REAL ===');
const bft = tuner.bufferForTargetStallDetailed({
    requiredMbps: 200, measuredMbpsSafe: 400, bwMinMbps: 230,
    bitrateForStall: STALL_BITRATE, targetStallPct: TARGET
});
let bisect = null;
for (let b = 1; b <= 600; b++) {
    if (CALC.calculateStallRate(b, STALL_BITRATE, 230).probability <= TARGET) { bisect = b; break; }
}
console.log('        bufferForTargetStall = ' + bft.seconds + ' s · bisección real = ' + bisect + ' s · ratio ' + bft.ratio + 'x');
ok('la fórmula y la bisección dan el mismo entero', Math.ceil(bft.seconds) === bisect, { formula: bft.seconds, bisect });
ok('la base es el bitrate del calculador (no el del perfil)', bft.basis === 'calculator_bitrate', bft.basis);
/* La forma posicional SIN bitrateForStall no conoce el bitrate del panel: usa
 * requiredMbps como bitrate → base conservadora → pide MÁS buffer (42.8 s) que
 * la base del panel (24.6 s). Se comprueban las dos, y la diferencia se declara. */
const posCons = tuner.bufferForTargetStall(200, 400, TARGET);
const posPanel = tuner.bufferForTargetStall(200, 400, TARGET, STALL_BITRATE);
console.log('        posicional 3 args (conservadora) = ' + posCons + ' s · 4 args (base panel) = ' + posPanel + ' s');
ok('3 args → base conservadora (bitrate = required), pide más buffer', posCons > posPanel, { posCons, posPanel });
ok('4 args con el bitrate del panel coincide con la bisección real',
    Math.ceil(posPanel) === bisect, { posPanel, bisect });

console.log('\n=== C · ok:true SÓLO si el stall estimado ≤ target ===');
IDS.forEach((id) => {
    const p = tuner.coherentPlan({
        requiredMbps: 200, measuredMbpsSafe: 400, segDurationSec: 6,
        strategy: STRATS[id].name, bitrateForStall: STALL_BITRATE, targetStallPct: TARGET
    });
    const real = r2(CALC.calculateStallRate(p.values.bufferTargetS, STALL_BITRATE, p.values.bwMinMbps).probability);
    ok(STRATS[id].name + ' ok:true implica stall real ' + real + ' % ≤ ' + TARGET + ' %',
        p.ok === false || real <= TARGET, { ok: p.ok, real, plan: p.metrics.stallEstimatePct });
    ok('  · metrics publica stall, target, neededBufferS y base (con su ORIGEN declarado)',
        p.metrics.stallEstimatePct !== undefined && p.metrics.targetStallPct === TARGET &&
        p.metrics.neededBufferS !== undefined && typeof p.metrics.stallBasis === 'string' && p.metrics.stallBasis.length > 0,
        p.metrics);
});

console.log('\n=== Cbis · ALIAS del panel: las 6 claves de #pm9_strategy ===');
const PANEL_KEYS = ['ultra-aggressive', 'aggressive', 'balanced', 'adaptive', 'conservative', 'ultra-low-latency'];
const EXPECT = {
    'conservative': ['Conservador', 0.80],
    'balanced': ['Balanceado', 1.00],
    'aggressive': ['Agresivo', 1.30],
    'ultra-aggressive': ['Ultra-Agresivo', 1.60],
    'adaptive': ['Adaptativo', null],
    'ultra-low-latency': ['Ultra-Low-Latency', 0.60]
};
console.log('        clave del panel      -> preset            factor');
PANEL_KEYS.forEach((k) => {
    const s = tuner.strategyOf(k);
    const exp = EXPECT[k];
    console.log('        ' + k.padEnd(20) + '-> ' + s.name.padEnd(19) + ' f=' + String(s.factor));
    ok(k + ' → ' + exp[0] + ' (factor ' + exp[1] + ')', s.name === exp[0] && s.factor === exp[1], s);
    ok('  · strategyKey devuelve la clave del panel', tuner.strategyKey(k) === k, tuner.strategyKey(k));
});
ok('los alias en español siguen funcionando', tuner.strategyOf('Ultra-Agresivo').name === 'Ultra-Agresivo' &&
    tuner.strategyOf('ultra agresivo').name === 'Ultra-Agresivo');
ok("ultra-low-latency tiene techo de 2 segmentos y 2 paralelas",
    tuner.strategyOf('ultra-low-latency').bufferSegCap === 2 && tuner.strategyOf('ultra-low-latency').parallelCap === 2);

console.log('\n=== D · MATRIZ 6 estrategias del panel × 4 redes (required 200, base del panel) ===');
const REDES = [400, 230, 146, 0.1];
const MATRIX = {};
/* [2026-11-18 · DIRECCIÓN CORREGIDA] La puerta de ultra es
 *   disponible = medido × duty(0.90)  vs  exigido = perfil × margen(1.15)
 * o sea ratio = disponible/exigido >= 1 (semántica del calculador:
 * bandwidth/bitrate). Antes se pasaba invertida y ultra salía UNSTABLE con
 * 400 Mbps. Con la dirección correcta:
 *   · 400 → disponible 360 ≥ 230 → ratio 1.57 → la PUERTA pasa; el único
 *     impedimento es el BUFFER: hacen falta 31.3 s y el techo es 30 → ok:false
 *     por buffer_insuficiente_para_target (dato exacto, no se toca el techo).
 *   · 230 → disponible 207 < 230 → ratio 0.90 → duty_insuficiente
 *     (neededMbpsForUltra = 230/0.90 = 255.56).
 *   · 146 y 0.1 → red_insuficiente en las seis.
 * ultra-low-latency: su puerta es SÓLO red suficiente (+ buffer ≤2 segmentos);
 * el stall se publica como PRECIO (stallPricePct), no como fallo. */
const CLASSIC = ['aggressive', 'balanced', 'adaptive', 'conservative'];
console.log('        red  | estr | disp | exig | ratio(d/e) | buf | stall | ok');
PANEL_KEYS.forEach((k) => { /* encabezado de referencia */ });
REDES.forEach((mbps) => {
    const row = [];
    MATRIX[mbps] = {};
    PANEL_KEYS.forEach((k) => {
        const p = tuner.coherentPlan({
            requiredMbps: 200, measuredMbpsSafe: mbps, segDurationSec: 6,
            strategy: k, bitrateForStall: STALL_BITRATE, targetStallPct: TARGET
        });
        MATRIX[mbps][k] = p;
        const real = (p.values ? r2(CALC.calculateStallRate(p.values.bufferTargetS, STALL_BITRATE, p.values.bwMinMbps).probability) : null);
        p._realStall = real;
        const mm = p.metrics;
        const avail = (mm.availableMbps === null || mm.availableMbps === undefined) ? mm.measuredMbps : mm.availableMbps;
        const rat = (mm.dutyRatio === null || mm.dutyRatio === undefined) ? mm.ratio : mm.dutyRatio;
        row.push((p.ok ? 'ok:true ' : 'ok:false') + ' b=' + (p.values ? p.values.bufferTargetS : '-') +
            ' stall=' + (real === null ? '-' : real));
        if (k === 'ultra-aggressive' || k === 'ultra-low-latency') {
            console.log('        ' + String(mbps).padStart(5) + ' | ' + k.padEnd(17) + ' | ' +
                String(avail).padStart(5) + ' | ' + String(mm.requiredMbpsForStall || mm.requiredMbps).padStart(4) +
                ' | ' + String(rat).padStart(6) + ' | ' + String(p.values.bufferTargetS).padStart(3) +
                ' | ' + String(mm.stallEstimatePct).padStart(5) + ' | ' + p.ok);
        }
    });
    console.log('        MATRIZ ' + String(mbps).padStart(4) + ' | ' + row.join(' | '));
});
[400, 230].forEach((mbps) => CLASSIC.forEach((k) => {
    const p = MATRIX[mbps][k];
    ok('red ' + mbps + ' · ' + k + ' → ok:true (stall real ' + p._realStall + ' %)', p.ok === true, p.violations);
    ok('  · stall real ≤ target', p._realStall <= TARGET, p._realStall);
}));

/* ── DIRECCIÓN: disponible/exigido, y la puerta de duty ─────────────────── */
const u400 = MATRIX[400]['ultra-aggressive'];
console.log('        400 · ultra: disponible=' + u400.metrics.availableMbps + ' exigido=' +
    u400.metrics.requiredMbpsForStall + ' ratio=' + u400.metrics.dutyRatio +
    ' dutyOk=' + u400.metrics.dutyOk + ' neededBufferS=' + u400.metrics.neededBufferS);
ok('400 · disponible = medido×0.90 = 360', u400.metrics.availableMbps === 360, u400.metrics.availableMbps);
ok('400 · exigido = perfil×1.15 = 230', u400.metrics.requiredMbpsForStall === 230, u400.metrics.requiredMbpsForStall);
ok('400 · ratio es disponible/exigido = 1.57 (NO invertido)', u400.metrics.dutyRatio === 1.57, u400.metrics.dutyRatio);
ok('400 · la puerta de duty PASA (ratio ≥ 1)', u400.metrics.dutyOk === true, u400.metrics);
/* [2026-11-18 · techo 30→32 autorizado] con 32 s el buffer necesario (31.3) CABE:
 * ultra-aggressive pasa a ok:true en una red de 400 Mbps. */
ok('400 · con techo 32 el buffer necesario (' + u400.metrics.neededBufferS + ' s) SÍ cabe → ok:true',
    u400.ok === true && u400.metrics.neededBufferS <= 32 && u400.values.bufferTargetS <= 32,
    { ok: u400.ok, need: u400.metrics.neededBufferS, buf: u400.values.bufferTargetS, v: u400.violations });
ok('400 · y su stall estimado cumple el target (' + u400.metrics.stallEstimatePct + ' % ≤ ' + TARGET + ' %)',
    u400.metrics.stallEstimatePct <= TARGET, u400.metrics.stallEstimatePct);
ok('400 · el stall REAL del calculador también cumple (' + u400._realStall + ' %)', u400._realStall <= TARGET, u400._realStall);
ok('400 · la violación NO es de red ni de duty', !/red_insuficiente|duty_insuficiente/.test((u400.violations || []).join(' ')), u400.violations);

const u230 = MATRIX[230]['ultra-aggressive'];
console.log('        230 · ultra: disponible=' + u230.metrics.availableMbps + ' ratio=' +
    u230.metrics.dutyRatio + ' neededMbpsForUltra=' + u230.metrics.neededMbpsForUltra);
ok('230 · disponible 207 < exigido 230', u230.metrics.availableMbps === 207 && u230.metrics.dutyOk === false, u230.metrics);
ok('230 · declara duty_insuficiente con availableMbps/requiredMbps/neededMbpsForUltra',
    /duty_insuficiente/.test((u230.violations || []).join(' ')) &&
    u230.metrics.availableMbps === 207 && u230.metrics.requiredMbpsForStall === 230 &&
    u230.metrics.neededMbpsForUltra === 255.56, { v: u230.violations, m: u230.metrics });
ok('230 · ok:false', u230.ok === false);

/* umbral exacto: con el techo de 30 s el primer verde de ultra está en 418 Mbps */
let primerVerde = null;
for (let mm = 255; mm <= 600; mm++) {
    const q = tuner.coherentPlan({ requiredMbps: 200, measuredMbpsSafe: mm, segDurationSec: 6, strategy: 'ultra-aggressive', bitrateForStall: STALL_BITRATE, targetStallPct: TARGET });
    if (q.ok) { primerVerde = mm; break; }
}
console.log('        primer medido con ultra ok:true y techo 32 s = ' + primerVerde + ' Mbps');
ok('con el techo actual (32 s) ultra se pone verde a partir de 393 Mbps', primerVerde === 393, primerVerde);

/* ── ultra-low-latency: la puerta es la RED, el stall es precio ─────────── */
[400, 230].forEach((mbps) => {
    const l = MATRIX[mbps]['ultra-low-latency'];
    ok('red ' + mbps + ' · ultra-low-latency → buffer 12 s (2 segmentos) y ≤2 paralelas',
        l.values.bufferTargetS === 12 && l.values.parallelDownloads <= 2, l.values);
    ok('  · ok:true porque la RED basta (su único gate real)', l.ok === true, l.violations);
    ok('  · el stall va como PRECIO declarado, no como fallo (stallPricePct ' + l.metrics.stallPricePct + ')',
        l.metrics.stallPricePct !== null && !/latencia_prioritaria|buffer_insuficiente/.test((l.violations || []).join(' ')),
        { price: l.metrics.stallPricePct, v: l.violations });
});
REDES.filter(m => m <= 146).forEach((mbps) => PANEL_KEYS.forEach((k) => {
    const p = MATRIX[mbps][k];
    ok('red ' + mbps + ' · ' + k + ' → ok:false', p.ok === false);
    ok('  · declara red_insuficiente', (p.violations || []).some(v => /red_insuficiente/.test(v)), p.violations);
}));
/* El caso que el capitán puso como ejemplo: 146 Mbps medidos y perfil de 200. */
const caso = MATRIX[146]['ultra-aggressive'];
ok('CASO 146/200: ultra-aggressive dice NO por red', caso.ok === false &&
    (caso.violations || []).some(v => /red_insuficiente/.test(v)), caso.violations);

console.log('\n=== E · si el buffer no cabe en el rango, se DICE con el número exacto ===');
/* Base conservadora: sin bitrateForStall el plan usa requiredMbps como bitrate.
 * Con 200 Mbps eso da ratio 1.15x, que exige MUCHO más buffer. */
const cons = tuner.coherentPlan({
    requiredMbps: 200, measuredMbpsSafe: 400, segDurationSec: 6, strategy: 'Agresivo'
});
console.log('        base conservadora: ratio ' + cons.metrics.stallRatio + 'x · necesita ' +
    cons.metrics.neededBufferS + ' s · aplica ' + cons.values.bufferTargetS + ' s · stall ' +
    cons.metrics.stallEstimatePct + ' % · ok=' + cons.ok);
console.log('        violations: ' + JSON.stringify(cons.violations));
ok('declara la base conservadora', cons.metrics.stallBasis === 'required_fallback', cons.metrics.stallBasis);
ok('ok:false por buffer insuficiente para el target',
    cons.ok === false && (cons.violations || []).some(v => /buffer_insuficiente_para_target/.test(v)), cons.violations);
ok('publica neededBufferS exacto', cons.neededBufferS > 32, cons.neededBufferS);
ok('el stall estimado NO cumple y por eso no hay ok:true',
    cons.metrics.stallEstimatePct > TARGET, cons.metrics.stallEstimatePct);

console.log('\n=== F · el plan aplicado deja el chip verde DE VERDAD ===');
const pOK = tuner.coherentPlan({
    requiredMbps: 200, measuredMbpsSafe: 400, segDurationSec: 6,
    strategy: 'Agresivo', bitrateForStall: STALL_BITRATE, targetStallPct: TARGET
});
const applied = clampToPanel(pOK.values).values;
const V = CALC.calculateAllMetrics({
    resolution: '1920x1080', codec: 'H265', fps: 60,
    prefetchSegments: applied.prefetch_segments,
    parallelDownloads: applied.parallel_downloads,
    minBandwidthMbps: applied.min_bandwidth_mbps,
    bufferTargetSeconds: applied.buffer_target_seconds
}, { mode: 'pro' });
console.log('        aplicado: ' + JSON.stringify(applied));
console.log('        panel → stall ' + V.stallRate + ' % · meetsTarget(<1.67%) ' + V.meetsTarget +
    ' · riesgo ' + V.riskScore + ' (' + V.riskLevel + ') · RAM steady/peak ' +
    V.memorySteady + '/' + V.memoryPeak + ' MB · llenado ' + V.fillTime + ' s · estabilidad ' + V.stability.class);
ok('el calculador REAL confirma stall ≤ 1.67 %', V.stallRate <= TARGET, V.stallRate);
ok('el calculador REAL marca meetsTarget=true', V.meetsTarget === true, V.meetsTarget);
ok('RAM dentro del presupuesto (12150 MB)', V.memoryPeak <= 12150, V.memoryPeak);
ok('la validación del calculador pasa', V.validation.valid === true, V.validation.errors);
ok('el buffer aplicado no excede el rango 10..32', applied.buffer_target_seconds <= 32, applied.buffer_target_seconds);

console.log('\n=== G · invariantes ===');
ok('bufferForTargetStall y stallForBuffer se exportan',
    typeof tuner.bufferForTargetStall === 'function' && typeof tuner.stallForBuffer === 'function');
ok('el plan sólo devuelve los 4 valores del panel',
    JSON.stringify(Object.keys(pOK.values).sort()) ===
    JSON.stringify(['bwMinMbps', 'bufferTargetS', 'parallelDownloads', 'prefetchSegments'].sort()),
    Object.keys(pOK.values));
ok('la violación nueva es EXACTAMENTE buffer_insuficiente_para_target',
    /buffer_insuficiente_para_target/.test(fs.readFileSync(path.join(FRONT, 'js/ape-v9/streaming/auto-tune-v1.js'), 'utf8')));
ok('el panel pasa bitrateForStall y targetStallPct al plan',
    /bitrateForStall: this\._stallBitrateFor\(p\)/.test(fs.readFileSync(path.join(FRONT, 'js/ape-v9/profile-manager-v9.js'), 'utf8')) &&
    /targetStallPct: this\._stallTargetPct\(\)/.test(fs.readFileSync(path.join(FRONT, 'js/ape-v9/profile-manager-v9.js'), 'utf8')));

console.log('\n─────────────────────────────────────────────');
console.log('  PASS ' + pass + ' · FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
