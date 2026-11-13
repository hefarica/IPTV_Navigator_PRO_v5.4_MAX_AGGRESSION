#!/usr/bin/env node
/**
 * Test de la seleccion de modo en Display4K.kt — sin dispositivo.
 *
 * Protege DOS decisiones que costaron medidas reales:
 *
 *  1) El discriminador de cadencia debe rechazar los CASI-multiplos.
 *     Con tolerancia 2e-3, 59.94 Hz "casaba" con 60 fps a 0,999x. Eso es 0,1 % de deficit:
 *     ~3,6 s de deriva por hora. Es judder lento, no cadencia exacta. Se aprio a 1e-4.
 *
 *  2) Si el panel YA esta en 4K, Display4K no debe tocar nada.
 *     Demostrado en el ONN 4K el 2026-11-13: el operador puso 4k@50Hz en Ajustes
 *     (mActiveModeId=125, renderFrameRate 50.0), abrio la APK y el panel volvio a 60 Hz
 *     (124); al cerrarla volvio a 50. Tres pasos, repetible.
 *
 * Uso: node tools/quality/test_display_cadence.js
 * Salida: "N/N PASS" y exit 0, o los fallos y exit 1.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fallos = [];
function ok(nombre, cond, detalle) {
  if (cond) { pass++; }
  else { fail++; fallos.push(nombre + (detalle ? ' :: ' + detalle : '')); }
}

// ---------------------------------------------------------------- 1 · aritmetica
// Misma regla que esMultiploExacto() en Display4K.kt
const TOL = 1e-4;
const CONTENT_RATES = [25.0, 50.0, 30.0, 60.0, 24.0, 23.976025];

function esMultiploExacto(displayFps, contentFps) {
  if (contentFps <= 0) return false;
  const ratio = displayFps / contentFps;
  const rounded = Math.round(ratio);
  if (rounded < 1) return false;
  return Math.abs(ratio - rounded) < TOL;
}

function casaConAlguna(displayFps) {
  return CONTENT_RATES.some(c => esMultiploExacto(displayFps, c));
}

// Tabla real de modos del ONN 4K (dumpsys display, 2026-11-13)
const MODOS_REALES = [
  [60.000004, true,  '4K@60'],     // casa con 30 y 60 fps
  [50.0,      true,  '4K@50'],     // casa con 25 y 50 fps  <- el del catalogo
  [59.94006,  false, '4K@59.94'],  // NO casa: 0,1 % de diferencia con 60
  [30.000002, true,  '4K@30'],
  [29.97003,  false, '4K@29.97'],  // NO casa con la familia 30/60
  [25.0,      true,  '4K@25'],
  [24.000002, true,  '4K@24'],
  [23.976025, true,  '4K@23.976'],
];

for (const [fps, esperado, nombre] of MODOS_REALES) {
  ok('casa(' + nombre + ') = ' + esperado, casaConAlguna(fps) === esperado,
     'obtenido ' + casaConAlguna(fps));
}

// El caso que cazo el falso positivo: con 2e-3 esto daba true y es incorrecto.
const ratio5994 = 59.94006 / 60.0;
ok('59.94/60 NO es multiplo exacto (ratio ' + ratio5994.toFixed(6) + ')',
   !esMultiploExacto(59.94006, 60.0));
ok('con tolerancia laxa 2e-3 SI casaria (prueba de que la tolerancia importa)',
   Math.abs(ratio5994 - 1) < 2e-3 && Math.abs(ratio5994 - 1) >= TOL);

// El contenido del catalogo: 25 y 50 fps
ok('4K@50 casa con 25 fps a 2,000000x', esMultiploExacto(50.0, 25.0));
ok('4K@50 casa con 50 fps a 1,000000x', esMultiploExacto(50.0, 50.0));
ok('4K@60 NO casa con 25 fps (2,4x)', !esMultiploExacto(60.000004, 25.0));
ok('4K@60 NO casa con 50 fps (1,2x)', !esMultiploExacto(60.000004, 50.0));

// Misma familia fraccionaria: 59.94 / 29.97 = 2 exacto
ok('59.94 casa con 29.97 a 2,000000x', esMultiploExacto(59.94006, 29.97003));
ok('23.976 casa con 23.976 a 1,000000x', esMultiploExacto(23.976025, 23.976025));

// ---------------------------------------------------------------- 2 · el codigo
const src = path.join(__dirname, '..', '..',
  'IPTV_v5.4_MAX_AGGRESSION', 'android', 'ape-crystal-agent', 'app', 'src', 'main',
  'java', 'com', 'ape', 'crystalagent', 'Display4K.kt');

let code = '';
try { code = fs.readFileSync(src, 'utf8'); }
catch (e) { fail++; fallos.push('no se pudo leer Display4K.kt: ' + e.message); }

if (code) {
  // Se quitan comentarios ANTES de comprobar literales: el comentario de Display4K explica
  // por que se descarto 2e-3 y menciona el literal. Un test que no distingue codigo de
  // comentario da falsos fallos.
  const sinComentarios = code
    .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */
    .replace(/\/\/.*$/gm, '');          // // ...

  ok('Display4K tiene salida temprana si el panel ya esta en 4K',
     /if\s*\(\s*yaEn4K\s*\)\s*\{/.test(sinComentarios));
  ok('dentro de yaEn4K hace return antes de tocar window.attributes',
     /if\s*\(\s*yaEn4K\s*\)\s*\{[\s\S]{0,900}?return/.test(sinComentarios) &&
     sinComentarios.indexOf('return') < sinComentarios.indexOf('lp.preferredDisplayModeId'));
  ok('usa tolerancia 1e-4 en el codigo (no 2e-3)',
     /1e-4/.test(sinComentarios) && !/2e-3/.test(sinComentarios));
  ok('prefiere modos que casan con cadencia de contenido',
     /conCadenciaExacta/.test(sinComentarios));
  ok('conserva el aviso honesto cuando no hay 4K',
     /display_no_4k/.test(sinComentarios));
  ok('un solo punto donde se fija preferredDisplayModeId',
     (sinComentarios.match(/preferredDisplayModeId/g) || []).length === 1);
}

// ---------------------------------------------------------------- resumen
console.log('');
console.log(pass + '/' + (pass + fail) + ' PASS');
if (fail > 0) {
  console.log('FALLOS:');
  fallos.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
process.exit(0);
