#!/usr/bin/env node
/**
 * tests/ape-r18-buffer-plan-panel.test.js
 * ---------------------------------------------------------------------------
 * RONDA 18 — la CONDICIÓN DE BUFFER vive DENTRO del panel y la tabla por perfil
 * se calcula con los bitrates del catálogo de perfiles (los del JSON LAB).
 *
 *   A. el bloque bueno es el del panel: ids nuevos (ape-link-input, ape-buf-plan)
 *      y la tabla se pinta desde el catálogo, sin cifras escritas a mano.
 *   B. un solo dueño de los ids: el bloque suelto (buffer-input-demand-panel.js)
 *      ya no se carga, así que no hay getElementById apuntando al nodo equivocado.
 *   C. la aritmética, con los 12 bitrates DECLARADOS en el JSON LAB CALIBRATED:
 *      entrada = salida x (1 + delta), exacta en bps, perfil por perfil.
 *   D. honestidad: sin bitrate se dice, sin enlace no se diagnostica.
 *
 * Nada de esto abre un navegador: se lee el código y se ejecuta la aritmética.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const D = require(path.join(__dirname, '..', 'js', 'ape-v9', 'buffer-input-demand.js'));

let PASS = 0, FAIL = 0;
function ok(name, cond, extra) {
  if (cond) { PASS++; console.log('PASS ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { FAIL++; console.log('FAIL ' + name + (extra ? '  [' + extra + ']' : '')); }
}
function eq(name, got, want) {
  const c = JSON.stringify(got) === JSON.stringify(want);
  ok(name, c, c ? '' : 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}

const ROOT = path.join(__dirname, '..');
const PANEL = path.join(ROOT, 'js', 'ape-v9', 'generation-output-panel.js');
const HTML = path.join(ROOT, 'index-v4.html');
const LAB = path.join(__dirname, '..', '..', '..', 'contracts', 'lab',
  'APE_FUSION_PREMIUM_6K_4K_LAB_CALIBRATED_BULLETPROOF_v9.3.json');

const panel = fs.readFileSync(PANEL, 'utf8');
const html = fs.readFileSync(HTML, 'utf8');

function count(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j === -1) break; n++; i = j + needle.length; }
  return n;
}

console.log('=== A · el bloque correcto está DENTRO del panel ===');
eq('A1  el panel trae el contenedor de la tabla (ape-buf-plan)', count(panel, 'id="ape-buf-plan"'), 1);
eq('A2  el panel trae la medida de enlace (ape-link-input)', count(panel, 'id="ape-link-input"'), 1);
const iCard = panel.indexOf('CONDICIÓN DE BUFFER');
const iPlan = panel.indexOf('id="ape-buf-plan"');
const iSug = panel.indexOf('id="ape-buf-sugerencia"');
ok('A3  la tabla va dentro de la tarjeta: tras el título y antes de la sugerencia',
  iCard !== -1 && iPlan > iCard && iPlan < iSug, iCard + ' < ' + iPlan + ' < ' + iSug);
ok('A4  la aritmética NO se reimplementa: se llama a APE_BUF_DEMAND.plan(',
  panel.indexOf('APE_BUF_DEMAND.plan(') !== -1);
ok('A5  la función se exporta para poder probarla', panel.indexOf('renderBufferPlan: renderBufferPlan') !== -1);
ok('A6  se repinta al aplicar el delta', count(panel, 'renderBufferPlan();') >= 2, 'llamadas=' + count(panel, 'renderBufferPlan();'));
const iIns = panel.indexOf('tab.insertBefore(panel, tab.firstChild);');
const afterIns = iIns === -1 ? '' : panel.slice(iIns, iIns + 400);
ok('A7  se pinta en cuanto la tarjeta está en el DOM', afterIns.indexOf('renderBufferPlan()') !== -1);
ok('A8  ninguna cifra de perfil escrita a mano en el panel',
  panel.indexOf('41.03') === -1 && panel.indexOf('123.2') === -1 && panel.indexOf("'P2.5'") === -1 &&
  panel.indexOf('220000000') === -1);

console.log('\n=== B · un solo dueño de los ids (no hay bloque duplicado) ===');
eq('B1  index-v4.html ya NO carga el bloque suelto', count(html, 'js/ape-v9/buffer-input-demand-panel.js'), 0);
eq('B2  index-v4.html sigue cargando la aritmética', count(html, 'js/ape-v9/buffer-input-demand.js?v=1.0.0-buf'), 1);
eq('B3  index-v4.html no tiene el input del delta (su dueño es el panel)', count(html, 'ape-delta-input'), 0);
eq('B4  el panel tiene UN solo input del delta', count(panel, 'id="ape-delta-input"'), 1);
eq('B5  el panel tiene UN solo botón de aplicar delta', count(panel, 'id="ape-delta-apply"'), 1);
eq('B6  el panel tiene UN solo cuadro de sugerencia', count(panel, 'id="ape-buf-sugerencia"'), 1);
eq('B7  index-v4.html no tiene el cuadro de sugerencia', count(html, 'ape-buf-sugerencia'), 0);

console.log('\n=== C · aritmética con los bitrates DECLARADOS en el JSON LAB ===');
const labOk = fs.existsSync(LAB);
ok('C1  el JSON LAB CALIBRATED está en su sitio', labOk, LAB);
let profs = [];
if (labOk) {
  const LABJ = JSON.parse(fs.readFileSync(LAB, 'utf8'));
  const ids = Object.keys(LABJ.profiles);
  eq('C2  el JSON trae 12 perfiles', ids.length, 12);
  for (const id of ids) profs.push({ id: id, settings: LABJ.profiles[id].settings || {} });
  const bitrates = ids.map(id => LABJ.profiles[id].settings.bitrate);
  eq('C3  los bitrates declarados son los 12 del contrato', bitrates,
    [200, 40, 37.3, 18.7, 4.1, 1.8, 89.6, 89.6, 112, 112, 112, 112]);

  const plan = D.plan(profs, { deltaPct: 10, bufferMs: 15000 });
  eq('C4  los 12 perfiles tienen bitrate declarado', plan.output_known, 12);
  eq('C5  hay una fila por perfil', plan.profiles.length, 12);
  let exactos = 0;
  for (const r of plan.profiles) {
    const want = Math.round(r.output_bps * 1.1);
    if (Math.abs(r.required_bps - want) <= 1) exactos++;
  }
  eq('C6  entrada = salida x 1,1 en 12 de 12 (tolerancia 1 bps)', exactos, 12);
  const tabla = {};
  for (const r of plan.profiles) tabla[r.id] = r.required_bps;
  eq('C7  P0 200 -> 220 Mbps', tabla.P0, 220000000);
  eq('C8  P1 40 -> 44 Mbps', tabla.P1, 44000000);
  eq('C9  P2 37,3 -> 41,03 Mbps', tabla.P2, 41030000);
  eq('C10 P3 18,7 -> 20,57 Mbps', tabla.P3, 20570000);
  eq('C11 P4 4,1 -> 4,51 Mbps', tabla.P4, 4510000);
  eq('C12 P5 1,8 -> 1,98 Mbps', tabla.P5, 1980000);
  eq('C13 P0.5 89,6 -> 98,56 Mbps', tabla['P0.5'], 98560000);
  eq('C14 P1.5 89,6 -> 98,56 Mbps', tabla['P1.5'], 98560000);
  eq('C15 P2.5 112 -> 123,2 Mbps', tabla['P2.5'], 123200000);
  eq('C16 P3.5 112 -> 123,2 Mbps', tabla['P3.5'], 123200000);
  eq('C17 P4.5 112 -> 123,2 Mbps', tabla['P4.5'], 123200000);
  eq('C18 P5.5 112 -> 123,2 Mbps', tabla['P5.5'], 123200000);
  const p20 = D.plan([{ id: 'P0', settings: { bitrate: 200 } }], { deltaPct: 20 });
  eq('C19 el incremento se aplica sobre el valor del perfil (200 +20 % = 240)', p20.profiles[0].required_bps, 240000000);
  const p0 = D.plan(profs, { deltaPct: 0 });
  eq('C20 la aritmética trata delta 0 como no especificado y usa 10 (declarado en el panel)',
    [p0.delta_pct, p0.profiles[0].required_bps], [10, 220000000]);
  ok('C20b el panel declara ese caso en vez de ocultarlo', panel.indexOf('no acepta delta 0') !== -1);
  eq('C21 la tabla es determinista (dos corridas iguales)',
    JSON.stringify(D.plan(profs, { deltaPct: 10 }).profiles), JSON.stringify(plan.profiles));
} else {
  ok('C2  NO COMPUTADO: falta el JSON LAB, no se comparan los 12 bitrates', true);
}

console.log('\n=== D · honestidad: sin dato no hay cifra ===');
const sinBit = D.plan([{ id: 'X', settings: {} }], { deltaPct: 10 });
eq('D1  un perfil sin bitrate se declara no computado', sinBit.profiles[0].output_known, false);
eq('D2  y no se le inventa una entrada', sinBit.profiles[0].required_bps, null);
if (labOk) {
  const sinLink = D.plan(profs, { deltaPct: 10 });
  eq('D3  sin medida de enlace no se dice que ningún perfil entra',
    sinLink.profiles.filter(r => r.feasible === true).length, 0);
  const l300 = D.plan(profs, { deltaPct: 10, linkBps: 300000000 });
  eq('D4  con 300 Mbps entran 12 de 12 (calculado, no escrito)', l300.feasible_count, 12);
  const l100 = D.plan(profs, { deltaPct: 10, linkBps: 100000000 });
  eq('D5  con 100 Mbps entran 7 de 12', l100.feasible_count, 7);
  eq('D6  el déficit de P0 con 100 Mbps son 120 Mbps',
    l100.profiles.filter(r => r.id === 'P0')[0].deficit_bps, 120000000);
}

console.log('\nRESUMEN PASS=' + PASS + ' FAIL=' + FAIL);
process.exit(FAIL === 0 ? 0 : 1);
