#!/usr/bin/env node
/**
 * Matriz de escenarios del guard de delta: mejor opción + aprobar / denegar / forzar.
 *
 * Ante un bloqueo el panel no debe dejar al operador sin salida. Debe recorrer TODOS los perfiles
 * y TODOS los deltas, proponer el mejor viable, y si no hay ninguno decir cuál es el mínimo
 * imprescindible y cuánto falta. Y dejarle aprobar la propuesta, denegarla, o forzarla sabiendo
 * que no cumple.
 *
 * Carga el módulo real con un DOM mockeado y el seam de test del propio panel, y llama a los
 * handlers de los botones comprobando el EFECTO, no que existan.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PANEL = path.join(__dirname, '..', 'js', 'ape-v9', 'generation-output-panel.js');
const src = fs.readFileSync(PANEL, 'utf8');

let pass = 0, fail = 0;
const fallos = [];
function ok(c, n, d) {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; fallos.push(n + (d ? ' :: ' + d : '')); console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); }
}

const nodos = {};
function nd(id) {
  return nodos[id] || (nodos[id] = {
    id, textContent: '', innerHTML: '', value: '', style: {}, onclick: null,
    addEventListener() { }, appendChild() { }, insertBefore() { },
    querySelector() { return null; }, querySelectorAll() { return []; },
    setAttribute() { }, getAttribute() { return null; }, remove() { }
  });
}
const doc = {
  readyState: 'complete',
  querySelector(s) {
    if (s === '#ape-buf-state') return nd('ape-buf-state');
    if (s === '#ape-buf-sugerencia') return nd('ape-buf-sugerencia');
    if (s === '#ape-gen-status') return nd('ape-gen-status');
    return null;
  },
  getElementById(id) { return nd(id); },
  querySelectorAll() { return []; },
  addEventListener() { },
  createElement() { return nd('t'); },
  body: { appendChild() { } }
};
const store = {};
const w = {
  document: doc,
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; }
  },
  APE_PROFILES_CONFIG: null, APE_BW: null,
  setInterval() { return 0; },
  setTimeout(fn) { try { fn(); } catch (_) { } return 0; },
  addEventListener() { },
  fetch() { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); }
};
w.window = w;
const ctx = vm.createContext({
  window: w, document: doc, console: { log() { }, warn() { }, error() { } },
  Math, Number, String, Object, Array, JSON, isFinite, isNaN, parseFloat, parseInt,
  localStorage: w.localStorage, fetch: w.fetch, setInterval: w.setInterval, setTimeout: w.setTimeout,
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } }, Blob: function () { }, navigator: {}
});

const FLOOR = { P0: 15, P1: 12, P2: 8, P3: 5, P4: 3, P5: 1.5 };
const TECHO = { P0: 200, P1: 40, P2: 25, P3: 15, P4: 10, P5: 2 };
function montar(activo, inMbps, delta) {
  store['ape_output_delta_pct'] = String(delta);
  delete w.__APE_GEN_OUTPUT_PANEL__;
  w.__APE_OUTPUT_TEST__ = true;
  w.__APE_SUG_FORZADO__ = false;
  w.__APE_SUG_DENEGADO__ = false;
  nd('ape-delta-input').value = String(delta);
  nd('ape-buf-sugerencia').innerHTML = '';
  const profs = {};
  for (const k of Object.keys(FLOOR)) profs[k] = { quality: 'FHD', settings: { bitrate: TECHO[k], bandwidth_floor: FLOOR[k] * 1e6 } };
  w.APE_PROFILES_CONFIG = { activeProfileId: activo, profiles: profs, save() { } };
  w.APE_BW = { snapshot: () => ({ mbps: inMbps }) };
  vm.runInContext(src, ctx, { filename: 'generation-output-panel.js' });
  return w.APE_OUTPUT_TEST_HOOKS;
}

console.log('\n== MATRIZ DE ESCENARIOS + APROBAR / DENEGAR ==');

// A) El caso exacto de la captura: P3 con 1.3 Mbps y delta 15%.
{
  const H = montar('P3', 1.3, 15);
  ok(H.sugerirAjuste().bloquea === true, 'A) P3/1.3/15 bloquea');
  const m = H.mejorEscenario();
  ok(m.viable === null, 'A) ningún perfil entra (el caso de la captura)', 'viable=' + JSON.stringify(m.viable));
  ok(m.minimo && m.minimo.perfil === 'P5', 'A) mínimo imprescindible = P5');
  ok(Math.abs(m.minimo.req - 1.515) < 0.01, 'A) P5 al 1% pide 1.515 Mbps', 'req=' + m.minimo.req.toFixed(3));
  ok(Math.abs(m.minimo.faltan - 0.215) < 0.01, 'A) faltan 0.215 Mbps', 'faltan=' + m.minimo.faltan.toFixed(3));
  H.renderSugerencia();
  const h = nd('ape-buf-sugerencia').innerHTML;
  ok(h.indexOf('Ningún perfil entra') >= 0, 'A) lo declara en el panel');
  ok(h.indexOf('ape-sug-forzar') >= 0, 'A) ofrece FORZAR');
  ok(h.indexOf('ape-sug-denegar') >= 0, 'A) ofrece DENEGAR');
  nd('ape-sug-forzar').onclick();
  ok(w.__APE_SUG_FORZADO__ === true, 'A) forzar marca el flag');
  ok(w.APE_PROFILES_CONFIG.activeProfileId === 'P5', 'A) forzar activa el perfil P5');
  ok(H.getDeltaPct() === 1, 'A) forzar fija el delta global en 1%');
  ok(nd('ape-delta-input').value === '1', 'A) forzar sincroniza el input del delta');
  ok(!!w.APE_OUTPUT_DELTA_ARRAY && Number(w.APE_OUTPUT_DELTA_ARRAY.P5) === 1, 'A) forzar sincroniza el array por perfil');
  ok(H.checkGeneration() === true, 'A) con el flag, la comprobación PERMITE generar');
}

// B) Bloqueo con salida: P3 con 5.2 Mbps necesita 5.75; entra con un delta menor.
{
  const H = montar('P3', 5.2, 15);
  ok(H.sugerirAjuste().bloquea === true, 'B) P3/5.2/15 bloquea');
  const m = H.mejorEscenario();
  ok(m.viable !== null, 'B) hay escenario viable');
  ok(m.viable.perfil === 'P3', 'B) el mejor es P3', 'perfil=' + m.viable.perfil);
  const req = m.viable.floor * (1 + m.viable.delta / 100);
  ok(5.2 >= req - 1e-9, 'B) el delta propuesto hace entrar', 'req=' + req.toFixed(2));
  H.renderSugerencia();
  const h = nd('ape-buf-sugerencia').innerHTML;
  ok(h.indexOf('ape-sug-aprobar') >= 0, 'B) ofrece APROBAR');
  ok(h.indexOf('ape-sug-denegar') >= 0, 'B) ofrece DENEGAR');
  nd('ape-sug-aprobar').onclick();
  ok(w.APE_PROFILES_CONFIG.activeProfileId === 'P3', 'B) aprobar fija el perfil');
  ok(H.getDeltaPct() === m.viable.delta, 'B) aprobar fija el delta propuesto', 'delta=' + H.getDeltaPct());
  ok(H.guard().canStart === true, 'B) tras aprobar ARRANCA');
}

// C) Denegar no toca nada.
{
  const H = montar('P3', 5.2, 15);
  H.renderSugerencia();
  const antesP = w.APE_PROFILES_CONFIG.activeProfileId, antesD = H.getDeltaPct();
  nd('ape-sug-denegar').onclick();
  ok(w.APE_PROFILES_CONFIG.activeProfileId === antesP, 'C) denegar no cambia el perfil');
  ok(H.getDeltaPct() === antesD, 'C) denegar no cambia el delta');
  ok(w.__APE_SUG_DENEGADO__ === true, 'C) marca denegado');
  ok(nd('ape-buf-sugerencia').innerHTML.indexOf('denegada') >= 0, 'C) lo dice en el panel');
}

// D) Perfil alto con enlace medio: propone el mejor que sí entra.
{
  const H = montar('P0', 13, 10);
  const m = H.mejorEscenario();
  ok(m.viable && m.viable.perfil === 'P1', 'D) P0/13 propone P1 (suelo 12)', 'perfil=' + (m.viable && m.viable.perfil));
  ok(m.viable.delta === 8, 'D) delta máximo de P1 = 8%', 'delta=' + m.viable.delta);
}

// E) Con enlace holgado no bloquea ni propone nada.
{
  const H = montar('P3', 30, 10);
  ok(H.sugerirAjuste().bloquea === false, 'E) 30 Mbps con P3 no bloquea');
  ok(H.checkGeneration() === true, 'E) permite generar directamente');
}

console.log('\n== RESULTADO: ' + pass + ' PASS · ' + fail + ' FAIL ==');
if (fail) { console.log('FALLOS:'); fallos.forEach(f => console.log('  - ' + f)); process.exit(1); }
process.exit(0);
