/* Test del autotuner de Streaming Health.
 * Verifica las 4 formulas, la validacion por rangos, el rechazo de cualquier
 * propuesta que toque fallbacks/codec/resolucion, y que APLICAR sólo mueve las
 * claves permitidas. Sin red: el LLM se simula con un fetch inyectado. */
'use strict';

const factory = require('../js/ape-v9/streaming/auto-tune-v1.js');
const tuner = factory({});
/* RANGES de la doctrina vigente: se leen del propio tuner para no duplicar
 * constantes en el test (si el tuner no lo expone, el assert falla en vez de
 * inventarse un rango). */
const RANGES = tuner.RANGES || (factory({}).RANGES) || (factory({}).ranges);
if (!RANGES) { console.log('  FAIL  el tuner no expone RANGES'); process.exit(1); }

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); }
}

console.log('\n=== 1 · FORMULA 1: buffer absorbe el deficit ===');
ok('r=3 → piso del RANGO (10 s): el buffer mínimo del panel es 10', tuner.bufferForRatio(3) === RANGES.bufferTargetS.min, tuner.bufferForRatio(3));
ok('r=1 → piso del RANGO (10 s), no 6 s: segDur 6 se recorta al mínimo del panel', tuner.bufferForRatio(1) === RANGES.bufferTargetS.min, tuner.bufferForRatio(1));
ok('r=0.6 → 18 s', tuner.bufferForRatio(0.6) === 18, tuner.bufferForRatio(0.6));
ok('r=0.3 no pasa del TECHO vigente (32 s, autorizado por el operador)', tuner.bufferForRatio(0.3) === RANGES.bufferTargetS.max, tuner.bufferForRatio(0.3));
ok('sin ratio → null (no inventa)', tuner.bufferForRatio(null) === null);

console.log('\n=== 2 · FORMULA 2: prefetch que cabe en ese buffer ===');
ok('buffer 12 s / seg 6 → 2', tuner.prefetchForBuffer(12, 6) === 2, tuner.prefetchForBuffer(12, 6));
ok('buffer 20 s / seg 6 → 4', tuner.prefetchForBuffer(20, 6) === 4, tuner.prefetchForBuffer(20, 6));
ok('nunca menos de 2', tuner.prefetchForBuffer(6, 6) === 2, tuner.prefetchForBuffer(6, 6));

console.log('\n=== 3 · FORMULA 3: concurrencia = 2·ratio, techo 8 ===');
ok('r=3 → 6', tuner.parallelForRatio(3) === 6, tuner.parallelForRatio(3));
ok('r=4.5 → 8 (techo)', tuner.parallelForRatio(4.5) === 8, tuner.parallelForRatio(4.5));
ok('r=0.4 → 1 (piso)', tuner.parallelForRatio(0.4) === 1, tuner.parallelForRatio(0.4));
ok('r=9 nunca > 8', tuner.parallelForRatio(9) === 8, tuner.parallelForRatio(9));

console.log('\n=== 4 · FORMULA 4: read-timeout sube cuando la red baja ===');
ok('r=3 → 45 s', tuner.timeoutForRatio(3) === 45000, tuner.timeoutForRatio(3));
ok('r=0.5 → 75 s', tuner.timeoutForRatio(0.5) === 75000, tuner.timeoutForRatio(0.5));
ok('r=0.33 → 105 s', tuner.timeoutForRatio(0.33) === 105000, tuner.timeoutForRatio(0.33));
ok('r=0.1 no pasa de 120 s', tuner.timeoutForRatio(0.1) === 120000, tuner.timeoutForRatio(0.1));

console.log('\n=== 5 · VALIDACION: rangos y claves prohibidas ===');
const good = { bufferTargetS: 12, prefetchSegments: 3, parallelDownloads: 6, readTimeoutMs: 60000 };
ok('propuesta valida aceptada', tuner.validate(good).ok === true);
const outRange = { bufferTargetS: 99, prefetchSegments: 0, parallelDownloads: 99, readTimeoutMs: 9 };
const vr = tuner.validate(outRange);
ok('recorta a los rangos (igualdad EXACTA contra RANGES)',
    vr.ok && vr.config.bufferTargetS === RANGES.bufferTargetS.max && vr.config.parallelDownloads === RANGES.parallelDownloads.max, vr.config);
ok('reporta los recortes', vr.clamped.length === 4, vr.clamped.length);
const forbidden = Object.assign({}, good, { codec: 'hvc1.2.4.L183.B0' });
ok('RECHAZA si toca codec', tuner.validate(forbidden).ok === false, tuner.validate(forbidden).rejected);
const fb = Object.assign({}, good, { fallback_chain: 'F0>F5' });
ok('RECHAZA si toca fallbacks', tuner.validate(fb).ok === false, tuner.validate(fb).rejected);
ok('RECHAZA si falta una clave', tuner.validate({ bufferTargetS: 12 }).ok === false);

console.log('\n=== 6 · VERDICTO: la config no crea banda ===');
const v1 = tuner.verdict(80, 0.8);
ok('estado NETWORK_INSUFFICIENT', v1.state === 'NETWORK_INSUFFICIENT', v1.state);
ok('gap = 176 Mbps (240-64)', v1.gapMbpsForGate === 176, v1.gapMbpsForGate);
ok('needed para gate = 240', v1.neededMbpsForGate === 240, v1.neededMbpsForGate);
const v2 = tuner.verdict(80, 3.2);
ok('con 3.2x el gate se cumple', v2.reachable === true && v2.state === 'GATE_OK', v2.state);
ok('sin medicion no hay veredicto', tuner.verdict(80, null).state === 'NO_MEASUREMENT');

console.log('\n=== 7 · PLAN: determinista vs LLM, gana el validado ===');
(async () => {
    const base = await tuner.plan({ requiredMbps: 80, headroomRatio: 0.8, segDurationSec: 6 });
    ok('sin LLM → determinista', base.source === 'deterministic' && base.ok === true, base.source);
    ok('determinista usa las 4 formulas',
        base.chosen.bufferTargetS === 11 && base.chosen.parallelDownloads === 1 &&
        base.chosen.readTimeoutMs === 55000, base.chosen);

    const fakeLlmOk = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
        source: 'deepseek-chat',
        health_config: { bufferTargetS: 16, prefetchSegments: 3, parallelDownloads: 2, readTimeoutMs: 80000 }
    })});
    const p1 = await tuner.plan({ requiredMbps: 80, headroomRatio: 0.8 }, { llm: true, fetch: fakeLlmOk });
    ok('LLM valido gana', p1.source === 'llm' && p1.chosen.bufferTargetS === 16, p1.source);

    const fakeLlmBad = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
        source: 'llm',
        health_config: { bufferTargetS: 16, prefetchSegments: 3, parallelDownloads: 2,
                         readTimeoutMs: 80000, codec_chain_video: 'hvc1.2.4.L183.B0' }
    })});
    const p2 = await tuner.plan({ requiredMbps: 80, headroomRatio: 0.8 }, { llm: true, fetch: fakeLlmBad });
    ok('LLM que toca codec → gana determinista', p2.source === 'deterministic', p2.source);
    ok('deja constancia del rechazo', p2.llm.rejected.includes('codec_chain_video'), p2.llm.rejected);

    const fakeLlmDead = () => Promise.reject(new Error('sin red'));
    const p3 = await tuner.plan({ requiredMbps: 80, headroomRatio: 0.8 }, { llm: true, fetch: fakeLlmDead });
    ok('LLM caido → determinista', p3.source === 'deterministic', p3.source);

    console.log('\n=== 8 · APPLY: sólo mueve las claves permitidas ===');
    const calls = [];
    const fakePm = {
        updateSetting: (k, v) => calls.push(['setting', k, v]),
        updatePrefetchValue: (k, v) => calls.push(['prefetch', k, v])
    };
    const res = tuner.apply(fakePm, 'P0.5', good);
    ok('aplica 3 valores', res.applied.length === 3, res.applied);
    ok('no falla nada', res.failed.length === 0, res.failed);
    ok('toca bufferSeconds', calls.some(c => c[1] === 'bufferSeconds' && c[2] === 12));
    ok('toca prefetch_segments', calls.some(c => c[1] === 'prefetch_segments' && c[2] === 3));
    ok('toca parallel_downloads', calls.some(c => c[1] === 'parallel_downloads' && c[2] === 6));
    ok('NO toca ninguna clave de fallback/codec',
        calls.every(c => !/fallback|codec|resolution|tier|bitrate/i.test(c[1])), calls.map(c => c[1]));
    const resNoPm = tuner.apply(null, 'P0', good);
    ok('sin ProfileManager lo dice, no finge', resNoPm.applied.length === 0 && resNoPm.failed.length === 1);

    console.log('\n─────────────────────────────────────────────');
    console.log('  PASS ' + pass + ' · FAIL ' + fail);
    process.exit(fail === 0 ? 0 : 1);
})();
