#!/usr/bin/env node
/**
 * Prueba del auto-ajuste del delta SIN navegador.
 *
 * Carga generation-output-panel.js con un DOM minimo mockeado, fuerza estados de ancho de banda
 * reales y comprueba tres cosas: que el guard decide como dice la teoria, que la sugerencia calcula
 * el delta despejado exacto, y que el boton APLICA ese delta de verdad (no es decorativo).
 *
 * No afirma nada sobre el render visual en un navegador real: eso es otra prueba.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PANEL = path.join(__dirname, '..', 'js', 'ape-v9', 'generation-output-panel.js');
const src = fs.readFileSync(PANEL, 'utf8');

let pass = 0, fail = 0;
const fallos = [];
function ok(cond, nombre, detalle) {
  if (cond) { pass++; console.log('  PASS  ' + nombre); }
  else { fail++; fallos.push(nombre + (detalle ? ' :: ' + detalle : '')); console.log('  FAIL  ' + nombre + (detalle ? ' :: ' + detalle : '')); }
}

// ── DOM minimo ────────────────────────────────────────────────────────────────────────────────
function hacerNodo(id) {
  return {
    id, textContent: '', innerHTML: '', value: '', style: {}, onclick: null,
    addEventListener() {}, appendChild() {}, insertBefore() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    setAttribute() {}, getAttribute() { return null; }
  };
}
const nodos = {};
function nodo(id) { if (!nodos[id]) nodos[id] = hacerNodo(id); return nodos[id]; }

const documentMock = {
  readyState: 'complete',
  querySelector(sel) {
    if (sel === '#ape-buf-state') return nodo('ape-buf-state');
    if (sel === '#ape-buf-sugerencia') return nodo('ape-buf-sugerencia');
    if (sel === '#ape-gen-status') return nodo('ape-gen-status');
    if (sel === '#ape-gen-mode') return nodo('ape-gen-mode');
    return null;
  },
  getElementById(id) { return nodo(id); },
  querySelectorAll() { return []; },
  addEventListener() {},
  createElement() { return hacerNodo('tmp'); },
  body: { appendChild() {} }
};

// ── winfow minimo ─────────────────────────────────────────────────────────────────────────────
const store = {};
const windowMock = {
  document: documentMock,
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; }
  },
  APE_PROFILES_CONFIG: null,
  APE_BW: null,
  setInterval() { return 0; },
  setTimeout(fn) { try { fn(); } catch (_) { } return 0; },
  addEventListener() {},
  fetch() { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); }
};
windowMock.window = windowMock;

// ── Laboratorio: perfiles con el suelo del LAB ────────────────────────────────────────────────
const FLOOR_MBPS = { P0: 15, P1: 12, P2: 8, P3: 5, P4: 3, P5: 1.5 };
const TECHO_MBPS = { P0: 200, P1: 40, P2: 25, P3: 15, P4: 10, P5: 2 };
function perfil(pid) {
  return { quality: 'FHD', settings: { bitrate: TECHO_MBPS[pid], bandwidth_floor: FLOOR_MBPS[pid] * 1e6 } };
}
function montar(activo, inMbps, delta) {
  store['ape_output_delta_pct'] = String(delta);
  nodos['ape-delta-input'] = hacerNodo('ape-delta-input');
  nodos['ape-delta-input'].value = String(delta);
  windowMock.APE_PROFILES_CONFIG = {
    activeProfileId: activo,
    profiles: { P0: perfil('P0'), P1: perfil('P1'), P2: perfil('P2'), P3: perfil('P3'), P4: perfil('P4'), P5: perfil('P5') },
    save() { }
  };
  windowMock.APE_BW = { snapshot: () => ({ mbps: inMbps }) };
  // recargar el modulo con estado limpio
  delete windowMock.__APE_GEN_OUTPUT_PANEL__;
  windowMock.__APE_OUTPUT_TEST__ = true;   // seam del panel: sin esto los hooks son inertes
  Object.keys(windowMock).forEach(k => { if (k.startsWith('APE_') && k !== 'APE_PROFILES_CONFIG' && k !== 'APE_BW') delete windowMock[k]; });
  const ctx = vm.createContext({ window: windowMock, document: documentMock, console, Math, Number, String, Object, Array, JSON, isFinite, isNaN, parseFloat, parseInt, localStorage: windowMock.localStorage, fetch: windowMock.fetch, setInterval: windowMock.setInterval, setTimeout: windowMock.setTimeout, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } }, Blob: function () { }, navigator: {} });
  vm.runInContext(src, ctx, { filename: 'generation-output-panel.js' });
  return windowMock.APE_OUTPUT_TEST_HOOKS;
}

console.log('\n== AUTO-AJUSTE DEL DELTA · teoria contra implementacion ==');

// ── Caso 1: bloqueo, el delta SI puede salvar ────────────────────────────────────────────────
{
  const H = montar('P0', 16, 20);
  const g = H.guard();
  ok(g.has === true, 'P0/16/20: hay medicion');
  ok(g.inM === 16, 'P0/16/20: inM leido', 'inM=' + g.inM);
  ok(g.floorM === 15, 'P0/16/20: suelo del LAB leido', 'floorM=' + g.floorM);
  ok(g.canStart === false, 'P0/16/20: BLOQUEA (16 < 15*1.20=18)');

  const s = H.sugerirAjuste();
  ok(s.bloquea === true, 'P0/16/20: la sugerencia reporta bloqueo');
  ok(Math.abs(s.reqArranque - 18) < 1e-9, 'P0/16/20: requisito = 18.00', 'req=' + s.reqArranque);
  ok(Math.abs(s.deltaMaxEntero - 6) === 0, 'P0/16/20: delta despejado = 6%', 'delta=' + s.deltaMaxEntero);
  ok(s.deltaAplicable === true, 'P0/16/20: el delta es aplicable (1..90)');
  // verificar la teoria: con delta 6 el perfil DEBE entrar
  const reqCon = g.floorM * (1 + s.deltaMaxEntero / 100);
  ok(16 >= reqCon - 1e-9, 'P0/16/20: con delta 6% entra (req=' + reqCon.toFixed(2) + ')');

  // render: el HTML debe nombrar el delta y ofrecer los dos botones
  H.renderSugerencia();
  const html = nodos['ape-buf-sugerencia'].innerHTML;
  ok(html.indexOf('6%') >= 0, 'P0/16/20: el HTML muestra el delta 6%');
  ok(html.indexOf('ape-sug-delta') >= 0, 'P0/16/20: el HTML ofrece aplicar el delta');
  ok(html.indexOf('Faltan') >= 0, 'P0/16/20: el HTML dice cuanto falta');

  // el boton debe APLICAR de verdad
  const btn = nodos['ape-sug-delta'];
  ok(!!btn && typeof btn.onclick === 'function', 'P0/16/20: el boton tiene handler');
  if (btn && btn.onclick) {
    btn.onclick();
    ok(H.getDeltaPct() === 6, 'P0/16/20: el clic aplica delta 6%', 'delta=' + H.getDeltaPct());
    ok(nodos['ape-delta-input'].value === '6', 'P0/16/20: el input refleja 6');
    const g2 = H.guard();
    ok(g2.canStart === true, 'P0/16/20: TRAS EL CLIC el perfil arranca');
  }
}

// ── Caso 2: bloqueo, ningun delta sirve -> debe ofrecer cambiar de perfil ────────────────────
{
  const H = montar('P0', 12, 10);
  const s = H.sugerirAjuste();
  ok(s.bloquea === true, 'P0/12/10: bloquea');
  ok(s.deltaAplicable === false, 'P0/12/10: el delta NO es aplicable (suelo 15 > 12)');
  ok(s.mejorPerfil === 'P2', 'P0/12/10: sugiere P2 (suelo 8, 12 >= 8.8)', 'mejor=' + s.mejorPerfil);
  H.renderSugerencia();
  const html = nodos['ape-buf-sugerencia'].innerHTML;
  ok(html.indexOf('ape-sug-perfil') >= 0, 'P0/12/10: ofrece cambiar de perfil');
  ok(html.indexOf('no sirve') >= 0, 'P0/12/10: dice que bajar el delta no sirve');
  const bp = nodos['ape-sug-perfil'];
  if (bp && bp.onclick) {
    bp.onclick();
    ok(windowMock.APE_PROFILES_CONFIG.activeProfileId === 'P2', 'P0/12/10: el clic cambia a P2',
       'activo=' + windowMock.APE_PROFILES_CONFIG.activeProfileId);
  } else { ok(false, 'P0/12/10: el boton de perfil tiene handler'); }
}

// ── Caso 3: ningun perfil entra ──────────────────────────────────────────────────────────────
{
  const H = montar('P0', 1, 10);
  const s = H.sugerirAjuste();
  ok(s.bloquea === true, 'P0/1/10: bloquea');
  ok(s.deltaAplicable === false, 'P0/1/10: sin delta valido');
  ok(s.mejorPerfil === null, 'P0/1/10: ningun perfil entra (P5 pide 1.65)', 'mejor=' + s.mejorPerfil);
  H.renderSugerencia();
  ok(nodos['ape-buf-sugerencia'].innerHTML.indexOf('Ningún perfil arranca') >= 0, 'P0/1/10: lo dice explicitamente');
}

// ── Caso 4: no bloquea pero no sostiene el techo -> avisa, no bloquea ────────────────────────
{
  const H = montar('P0', 50, 10);
  const g = H.guard();
  ok(g.canStart === true, 'P0/50/10: arranca');
  ok(g.ok === false, 'P0/50/10: no sostiene el techo de 200');
  ok(H.checkGeneration() === true, 'P0/50/10: NO bloquea la generacion');
  ok(nodos['ape-buf-state'].textContent === 'BUFFER RIESGO', 'P0/50/10: estado BUFFER RIESGO', nodos['ape-buf-state'].textContent);
}

// ── Caso 5: sin medicion -> permite, no bloquea ─────────────────────────────────────────────
{
  const H = montar('P0', 0, 10);
  ok(H.checkGeneration() === true, 'P0/0: sin medicion NO bloquea');
  ok(nodos['ape-buf-state'].textContent === 'SIN DATO', 'P0/0: estado SIN DATO');
}

// ── Caso 6: seis casos que bloquean -> el delta despejado SIEMPRE hace entrar ───────────────
{
  const casos = [['P0', 16, 20], ['P0', 17, 25], ['P1', 13, 15], ['P3', 6, 25], ['P5', 1.8, 30], ['P4', 3.5, 20]];
  let todos = true;
  const detalle = [];
  for (const [p, m, d] of casos) {
    const H = montar(p, m, d);
    const s = H.sugerirAjuste();
    if (!s.bloquea) { todos = false; detalle.push(p + '/' + m + ' no bloqueaba'); continue; }
    if (!s.deltaAplicable) { todos = false; detalle.push(p + '/' + m + ' sin delta aplicable'); continue; }
    const req = s.floorM * (1 + s.deltaMaxEntero / 100);
    if (!(m >= req - 1e-9)) { todos = false; detalle.push(p + '/' + m + ' delta ' + s.deltaMaxEntero + ' no entra'); }
  }
  ok(todos, 'los 6 casos bloqueantes encuentran un delta que hace entrar', detalle.join('; '));
}

console.log('\n== RESULTADO: ' + pass + ' PASS · ' + fail + ' FAIL ==');
if (fail) { console.log('FALLOS:'); fallos.forEach(f => console.log('  - ' + f)); process.exit(1); }
process.exit(0);
