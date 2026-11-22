/**
 * Tests del resolutor determinista de BW mínimo de prefetch.
 *
 * Regresion que fija (medida 2026-11-22 en el panel):
 *   - un perfil 8K mostraba BW mínimo = 1 Mbps (0,5 × 1,15 redondeado)
 *   - el mismo panel calculaba 28 Mbps en el veredicto: dos verdades distintas
 *   - el generador emitía #EXT-X-APE-PREFETCH-BW-MIN:1Mbps
 *
 * Uso: node frontend/tests/prefetch-min-bw.test.js
 */
'use strict';

const path = require('path');
const M = require(path.join(__dirname, '..', 'js', 'ape-v9', 'prefetch-min-bw.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('PASS ' + name); }
    else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(a, b, name) { ok(Object.is(a, b), name, 'esperado ' + b + ', obtenido ' + a); }

/* ── 1 · el defecto medido no puede volver ─────────────────────────────── */
const r8k = M.resolveMinBwMbps({ tierMbps: M.tierFloor('GOD_TIER_8K'), measuredMbps: null });
eq(r8k.mbps, 80, '8K sin medición → piso 80 Mbps, nunca 1');
eq(r8k.clamped, true, '8K sin medición queda marcado como piso');

const rBasis = M.resolveMinBwMbps({ tierMbps: M.tierFloor('8K'), declaredMbps: 194, measuredMbps: null });
eq(rBasis.mbps, 194, 'piso declarado (194) manda sobre el del tier cuando es mayor');

/* ── 2 · la red es el insumo ──────────────────────────────────────────── */
const rMed = M.resolveMinBwMbps({ tierMbps: 28, measuredMbps: 201.33, margin: 1.15 });
eq(rMed.mbps, 231.53, 'medición 201.33 × 1.15 = 231.53 (determinista)');
eq(rMed.clamped, false, 'medición suficiente no se recorta');

const rLow = M.resolveMinBwMbps({ tierMbps: 80, measuredMbps: 10, margin: 1.15 });
eq(rLow.mbps, 80, 'medición insuficiente → se aplica el piso del perfil');
eq(rLow.clamped, true, 'se declara el recorte');

/* ── 3 · sin piso declarado NO se inventa valor ───────────────────────── */
const rNone = M.resolveMinBwMbps({ measuredMbps: 50 });
eq(rNone.mbps, null, 'sin piso declarado → null (el llamador no escribe)');
eq(rNone.source.indexOf('no se escribe') >= 0, true, 'la fuente nombra que no se escribe');

/* ── 4 · márgenes fuera de rango se acotan, no se confían ─────────────── */
eq(M.resolveMinBwMbps({ tierMbps: 28, measuredMbps: 100, margin: 0.1 }).margin, 1.0, 'margen < 1 se acota a 1.0');
eq(M.resolveMinBwMbps({ tierMbps: 28, measuredMbps: 100, margin: 99 }).margin, 2.0, 'margen > 2 se acota a 2.0');
eq(M.resolveMinBwMbps({ tierMbps: 28, measuredMbps: 100, margin: 'x' }).margin, 1.15, 'margen no numérico usa el default');

/* ── 5 · determinismo estricto y pureza ───────────────────────────────── */
const a = JSON.stringify(M.resolveMinBwMbps({ tierMbps: 80, measuredMbps: 33.6, margin: 1.15 }));
const b = JSON.stringify(M.resolveMinBwMbps({ tierMbps: 80, measuredMbps: 33.6, margin: 1.15 }));
eq(a, b, 'misma entrada → misma salida (byte a byte)');

const before = JSON.stringify(M.FLOOR_MBPS);
M.resolveMinBwMbps({ tierMbps: 80, measuredMbps: 1e9 });
eq(JSON.stringify(M.FLOOR_MBPS), before, 'la tabla de pisos no se muta');

/* ── 6 · mapeo de tiers ───────────────────────────────────────────────── */
eq(M.tierFloor('GOD_TIER_8K'), 80, 'etiqueta compuesta GOD_TIER_8K → 80');
eq(M.tierFloor('2160p'), 28, '2160p → 4K → 28');
eq(M.tierFloor('P5_SD'), 2.5, 'P5_SD → 2.5');
eq(M.tierFloor('???'), null, 'tier desconocido → null (no se adivina)');

console.log('\n{"passed":' + pass + ',"failed":' + fail + '}');
process.exit(fail === 0 ? 0 : 1);
