#!/usr/bin/env node
/**
 * tests/ape-r19-condicion-buffer-coherencia.test.js
 * ---------------------------------------------------------------------------
 * RONDA 19 — el aviso de CONDICIÓN DE BUFFER y la tabla por perfil tienen que
 * decir LO MISMO, con la misma cifra de enlace y los mismos suelos, y los
 * suelos tienen que ser los del JSON LAB CALIBRATED (no literales inventados).
 *
 * Qué se ejecuta de verdad: el panel REAL (generation-output-panel.js) se carga
 * en un DOM mínimo dentro de un vm de node, con el catálogo de 12 perfiles
 * construido a partir del JSON LAB. Después se llaman sus propias funciones y se
 * lee lo que pinta. Nada de esto abre un navegador.
 *
 *   A. de dónde sale la cifra de enlace (linkInfo): medición, estimación o nada
 *   B. el aviso ya no afirma una medición que nadie hizo, ni bloquea por ella
 *   C. los mismos números en la tabla y en el aviso (suelo, techo, mínimo)
 *   D. el cableado: un solo dueño de la cifra, catálogo entero, mínimo derivado
 *   E. el evento real (escribir en «Enlace medido») mueve las dos piezas
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PANEL = path.join(ROOT, 'js', 'ape-v9', 'generation-output-panel.js');
const DEMAND = path.join(ROOT, 'js', 'ape-v9', 'buffer-input-demand.js');
const LAB = path.join(__dirname, '..', '..', '..', 'contracts', 'lab',
  'APE_FUSION_PREMIUM_6K_4K_LAB_CALIBRATED_BULLETPROOF_v9.3.json');

const panelSrc = fs.readFileSync(PANEL, 'utf8');
const demandSrc = fs.readFileSync(DEMAND, 'utf8');

let PASS = 0, FAIL = 0;
function ok(name, cond, extra) {
  if (cond) { PASS++; console.log('PASS ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { FAIL++; console.log('FAIL ' + name + (extra ? '  [' + extra + ']' : '')); }
}
function eq(name, got, want) {
  const c = JSON.stringify(got) === JSON.stringify(want);
  ok(name, c, c ? '' : 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}
function count(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j === -1) break; n++; i = j + needle.length; }
  return n;
}

// ── el catálogo de 12 perfiles, tal como lo ve el panel (bitrate Mbps + suelo bps) ──────────
const lab = JSON.parse(fs.readFileSync(LAB, 'utf8'));
const rawProfs = lab.profiles || {};
const profIds = Object.keys(rawProfs);
function settingsOf(p) { return (p && p.settings) ? p.settings : (p || {}); }
const CATALOGO = { activeProfileId: 'P3', profiles: {} };
for (const id of profIds) {
  const s = settingsOf(rawProfs[id]);
  CATALOGO.profiles[id] = { id: id, settings: { bitrate: s.bitrate, bandwidth_floor: s.bandwidth_floor } };
}
const LAB_FLOOR_BPS = {};
for (const id of profIds) LAB_FLOOR_BPS[id] = Number(settingsOf(rawProfs[id]).bandwidth_floor) || 0;

// ── DOM mínimo y arranque del panel dentro de un vm ────────────────────────────────────────
function makeElement(id) {
  const e = {
    id: id, innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    type: '', title: '', style: {}, dataset: {}, children: [], className: '',
    classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { return this.appendChild(c); },
    removeChild(c) { this.children = this.children.filter(function (x) { return x !== c; }); return c; },
    remove() { }, addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
    setAttribute(k, v) { this['attr_' + k] = v; }, getAttribute(k) { return this['attr_' + k] == null ? null : this['attr_' + k]; },
    removeAttribute() { }, querySelector() { return null; }, querySelectorAll() { return []; },
    focus() { }, blur() { }, click() { }, closest() { return null; }, contains() { return false; },
    get firstChild() { return this.children[0] || null; },
    get parentNode() { return null; },
    get offsetWidth() { return 100; }, get offsetHeight() { return 20; }
  };
  return e;
}

function boot(opts) {
  opts = opts || {};
  const byId = new Map();
  const listeners = {};
  const store = Object.assign({}, opts.store || {});

  function getById(id) {
    if (!byId.has(id)) byId.set(id, makeElement(id));
    return byId.get(id);
  }
  const document = {
    readyState: 'loading',          // NO dispara render(): aquí se prueban las funciones
    getElementById: getById,
    querySelector: function (sel) {
      if (typeof sel === 'string' && sel.charAt(0) === '#') return getById(sel.slice(1));
      return null;
    },
    querySelectorAll: function () { return []; },
    createElement: function (tag) { return makeElement('<' + tag + '>'); },
    createTextNode: function (t) { const e = makeElement('#text'); e.textContent = t; return e; },
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function () { },
    execCommand: function () { return true; },
    body: makeElement('body'),
    documentElement: makeElement('html'),
    head: makeElement('head')
  };

  const win = {
    document: document,
    console: console,
    location: { href: 'file:///index-v4.html', origin: 'file://', pathname: '/index-v4.html', search: '', hash: '' },
    navigator: { userAgent: 'node', connection: { downlink: 0.3 } },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    sessionStorage: { getItem: function () { return null; }, setItem: function () { }, removeItem: function () { } },
    setTimeout: function (fn) { try { fn(); } catch (_) { } return 0; },
    clearTimeout: function () { }, setInterval: function () { return 0; }, clearInterval: function () { },
    requestAnimationFrame: function (fn) { try { fn(0); } catch (_) { } return 0; }, cancelAnimationFrame: function () { },
    addEventListener: function () { }, removeEventListener: function () { },
    matchMedia: function () { return { matches: false, addListener: function () { }, addEventListener: function () { } }; },
    fetch: function () { return new Promise(function () { }); },
    URL: { createObjectURL: function () { return 'blob:test'; }, revokeObjectURL: function () { } },
    Blob: function () { }, FileReader: function () { },
    alert: function () { }, prompt: function () { return null; }, confirm: function () { return false; },
    __APE_OUTPUT_TEST__: true
  };
  win.window = win;
  win.self = win;
  win.showToast = function () { };
  win.app = { showToast: function () { }, getFilteredChannels: function () { return []; } };
  if (opts.abw !== undefined) win.APE_BW = opts.abw;
  if (opts.profiles !== undefined) win.APE_PROFILES_CONFIG = opts.profiles;

  const ctx = vm.createContext(win);
  vm.runInContext(demandSrc, ctx, { filename: 'buffer-input-demand.js' });
  vm.runInContext(panelSrc, ctx, { filename: 'generation-output-panel.js' });

  const H = win.APE_OUTPUT_TEST_HOOKS;
  const nodes = {
    plan: getById('ape-buf-plan'),
    sug: getById('ape-buf-sugerencia'),
    badge: getById('ape-buf-state'),
    link: getById('ape-link-input'),
    delta: getById('ape-delta-input')
  };
  return {
    win: win, H: H, nodes: nodes,
    paint: function () { H.renderBufferPlan(); H.renderSugerencia(); },
    fire: function (type, target) {
      (listeners[type] || []).forEach(function (fn) { try { fn({ target: target, type: type }); } catch (e) { console.log('  (listener ' + type + ' lanzó: ' + e.message + ')'); } });
    },
    listenerCount: function (t) { return (listeners[t] || []).length; }
  };
}

const SEED = { mbps: 0.3, source: 'connection.downlink', confidence: 'none', samples: 0 };
const REAL = { mbps: 5.2, source: 'resource-timing', confidence: 'high', samples: 12 };

console.log('=== A · de dónde sale la cifra de enlace (linkInfo) ===');
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return { mbps: 10, source: 'startup-default' }; } } });
  const L = e.H.linkInfo();
  eq('A1  semilla de arranque = estimación, no medición', [L.kind, L.measured, L.mbps], ['seed', false, 10]);
}
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return SEED; } } });
  const L = e.H.linkInfo();
  eq('A2  la semilla de navigator.connection (0,3) es estimación', [L.kind, L.measured, L.mbps], ['seed', false, 0.3]);
  eq('A3  y se nombra su origen', L.source, 'connection.downlink');
}
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return { mbps: 8, confidence: 'none' }; } } });
  eq('A4  confidence none también es estimación', e.H.linkInfo().kind, 'seed');
}
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return { mbps: 8, samples: 0 }; } } });
  eq('A5  cero muestras también es estimación', e.H.linkInfo().kind, 'seed');
}
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return REAL; } } });
  const L = e.H.linkInfo();
  eq('A6  con muestras reales es medición', [L.kind, L.measured, L.samples], ['measured', true, 12]);
}
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return { mbps: 5.2 }; } } });
  eq('A7  sin fuente ni muestras sigue valiendo como medición (arneses)', e.H.linkInfo().kind, 'measured');
}
{
  const e = boot({ profiles: CATALOGO });
  const L = e.H.linkInfo();
  eq('A8  sin medidor no hay cifra ni veredicto', [L.kind, L.mbps, L.measured], ['none', 0, false]);
}
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return SEED; } } });
  e.nodes.link.value = '7.2';
  const L = e.H.linkInfo();
  eq('A9  lo escrito a mano manda sobre la estimación', [L.kind, L.mbps, L.measured], ['manual', 7.2, true]);
}

console.log('\n=== B · el aviso ya no afirma una medición que nadie hizo ===');
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return SEED; } } });
  e.paint();
  const t = e.nodes.sug.innerHTML;
  ok('B1  con estimación el aviso dice «Sin medición de enlace»', t.indexOf('Sin medición de enlace') !== -1);
  ok('B2  y NO dice «el enlace mide»', t.indexOf('el enlace mide') === -1);
  ok('B3  se declara estimación del navegador', t.indexOf('estimación del navegador') !== -1);
  ok('B4  se nombra la fuente de la cifra', t.indexOf('connection.downlink') !== -1);
  eq('B5  el badge no finge un veredicto', e.nodes.badge.textContent, 'SIN MEDICIÓN');
  ok('B6  no se pinta un BLOQUEO por una estimación', t.indexOf('Bloqueado') === -1);
  ok('B7  se dice cuánto pide el perfil activo, con la cuenta a la vista',
    t.indexOf('para arrancar') !== -1 && t.indexOf('suelo') !== -1);
}
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return REAL; } } });
  e.paint();
  const t = e.nodes.sug.innerHTML;
  ok('B8  con medición real el aviso vuelve a decidir', t.indexOf('Sin medición de enlace') === -1);
  ok('B9  y cita la cifra medida', t.indexOf('5.2') !== -1);
  eq('B10 con medición real el badge sí opina', e.nodes.badge.textContent !== 'SIN MEDICIÓN', true);
}

console.log('\n=== C · los MISMOS números en la tabla y en el aviso ===');
{
  const LINK_M = 7.6;
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return { mbps: LINK_M }; } } });
  const D10 = e.H.getDeltaPct();
  const mult = (1 + D10 / 100);
  ok('C0  el delta vigente es el que usa todo el panel (1..90)', D10 >= 1 && D10 <= 90, 'delta=' + D10);
  eq('C1  suelo del catálogo: P3 del LAB es 6,5 Mbps', e.H.floorDePerfil('P3'), 6.5);
  eq('C2  suelo del catálogo: P0 del LAB es 52,325 Mbps', e.H.floorDePerfil('P0'), 52.325);
  eq('C3  suelo del catálogo: P5 del LAB es 1,3 Mbps', e.H.floorDePerfil('P5'), 1.3);

  const s = e.H.sugerirAjuste();
  ok('C4  con 7,6 Mbps el perfil activo P3 SÍ arranca', s.canStart === true && s.bloquea === false,
    'reqArranque=' + s.reqArranque.toFixed(2));
  ok('C5  y el requisito del aviso es suelo × multiplirador', Math.abs(s.reqArranque - 6.5 * mult) < 1e-9,
    s.reqArranque.toFixed(4));

  e.paint();
  const tabla = e.nodes.plan.innerHTML;
  const esperadoFila = '6.5 × ' + mult.toFixed(2) + ' = ' + (6.5 * mult).toFixed(2) + ' Mbps';
  ok('C6  la tabla dice la MISMA cuenta para P3', tabla.indexOf(esperadoFila) !== -1, esperadoFila);
  ok('C7  y no contradice al aviso: da P3 por arrancado, igual que el aviso',
    (function () {
      const i3 = tabla.indexOf('P3 · para arrancar pide');
      if (i3 === -1) return false;
      const trozo = tabla.slice(i3, i3 + 240);
      return trozo.indexOf(' · arranca · ') !== -1 && trozo.indexOf('NO arranca') === -1;
    })());

  // Las dos piezas usan el mismo enlace: se recuenta lo que la tabla afirma y se compara.
  let nArranca = 0, nConDato = 0;
  for (const id of profIds) {
    const f = e.H.floorDePerfil(id);
    if (!(Number(settingsOf(rawProfs[id]).bitrate) > 0)) continue;
    nConDato++;
    if (f > 0 && Math.round(LINK_M * 1e6) >= Math.round(f * mult * 1e6)) nArranca++;
  }
  ok('C8  el cierre de la tabla cuenta con ese mismo enlace',
    tabla.indexOf('arrancan ' + nArranca + ' de ' + nConDato + ' perfiles') !== -1,
    'esperado ' + nArranca + '/' + nConDato);
  eq('C9  la tabla tiene una línea por perfil del catálogo', count(tabla, ' · para arrancar pide ') + count(tabla, ' · sin bitrate declarado'), profIds.length);
}
{
  // Con un enlace muy holgado, ¿se consideran los 12 perfiles o sólo los 6 de la lista fija?
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return { mbps: 100 }; } } });
  const mult = 1 + e.H.getDeltaPct() / 100;
  let esperados = 0;
  for (const id of profIds) { const f = e.H.floorDePerfil(id); if (f > 0 && 100 >= f * mult) esperados++; }
  const alc = e.H.sugerirAjuste().alcanzables.length;
  eq('C10 con 100 Mbps la sugerencia considera TODOS los que caben del catálogo',
    [alc, esperados > 6], [esperados, true]);
}

console.log('\n=== C-bis · el mínimo imprescindible se DERIVA del catálogo ===');
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return { mbps: 0.3 }; } } });
  const m = e.H.mejorEscenario();
  let sueloMin = Infinity, perfilMin = null;
  for (const id of profIds) { const f = e.H.floorDePerfil(id); if (f > 0 && f < sueloMin) { sueloMin = f; perfilMin = id; } }
  eq('C11 con el catálogo del LAB el mínimo es el de suelo más bajo', m.minimo && m.minimo.perfil, perfilMin);
  ok('C12 y su requisito es ese suelo × el delta mínimo del 1 % (lo mínimo posible)',
    m.minimo && Math.abs(m.minimo.req - sueloMin * 1.01) < 1e-9,
    m.minimo ? m.minimo.req.toFixed(3) : 'sin minimo');
}
{
  // Catálogo retorcido: un perfil 'PX' con el suelo MÁS BAJO que P5. Si el mínimo estuviera
  // clavado en 'P5' (como antes) esto fallaría.
  const torcido = { activeProfileId: 'P0', profiles: {} };
  for (const k of Object.keys(CATALOGO.profiles)) torcido.profiles[k] = CATALOGO.profiles[k];
  torcido.profiles.PX = { id: 'PX', settings: { bitrate: 2, bandwidth_floor: 400000 } };
  const e = boot({ profiles: torcido, abw: { snapshot: function () { return { mbps: 0.3 }; } } });
  const m = e.H.mejorEscenario();
  eq('C13 con un suelo más bajo que P5, el mínimo se mueve (no está clavado en P5)',
    m.minimo && m.minimo.perfil, 'PX');
  let forzado = null;
  try { forzado = e.H.aplicarForzadoP5(null); } catch (err) { console.log('  (forzado lanzó en el DOM mínimo: ' + err.message + ')'); }
  eq('C14 el forzado usa ese mínimo derivado', forzado && forzado.profile, 'PX');
}

console.log('\n=== D · el cableado (leído del código) ===');
{
  eq('D1  una sola expresión lee el medidor en todo el panel (un dueño de la cifra)',
    count(panelSrc, 'typeof window.APE_BW.snapshot'), 1);
  const LISTA = "['P0', 'P1', 'P2', 'P3', 'P4', 'P5']";
  const iList = panelSrc.indexOf(LISTA);
  const iFn = panelSrc.indexOf('function profileIds()');
  ok('D2  la lista de 6 sólo queda como RESPALDO dentro de profileIds()',
    count(panelSrc, LISTA) === 1 && iFn !== -1 && iList > iFn && iList < iFn + 300,
    'iFn=' + iFn + ' iList=' + iList);
  ok('D3  se recorre el catálogo (profileIds) en la sugerencia y en la matriz',
    count(panelSrc, 'profileIds()') >= 3, 'usos=' + count(panelSrc, 'profileIds()'));
  ok('D4  el aviso y la tabla piden el suelo al mismo sitio (floorDePerfil)',
    count(panelSrc, 'floorDePerfil(') >= 3, 'usos=' + count(panelSrc, 'floorDePerfil('));
  ok('D5  ya no queda el perfil forzado clavado', count(panelSrc, "var profile = 'P5'") === 0);
  ok('D6  los ids sueltos de la tabla/aviso viven en el panel',
    count(panelSrc, 'id="ape-buf-plan"') === 1 && count(panelSrc, 'id="ape-buf-sugerencia"') === 1);

  // El suelo de respaldo tiene que ser el del LAB, no otro inventado.
  const m = panelSrc.match(/var FLOOR_MBPS = \{([^}]*)\}/);
  ok('D7  hay tabla de respaldo de suelos', !!m);
  const resp = {};
  String(m && m[1] || '').split(',').forEach(function (par) {
    const mm = par.split(':');
    if (mm.length === 2) resp[mm[0].trim()] = Number(mm[1]);
  });
  let iguales = 0;
  const detalle = [];
  for (const id of Object.keys(resp)) {
    if (!(id in LAB_FLOOR_BPS)) continue;
    const labM = LAB_FLOOR_BPS[id] / 1e6;
    if (Math.abs(resp[id] - labM) < 1e-9) iguales++; else detalle.push(id + ' respaldo=' + resp[id] + ' lab=' + labM);
  }
  eq('D8  los 6 suelos de respaldo son EXACTAMENTE los del LAB', [iguales, detalle.length], [6, 0]);
  ok('D9  sin dato no se inventa un suelo (el respaldo por defecto es 0)',
    /return Number\(FLOOR_MBPS\[id\]\) \|\| 0;/.test(panelSrc));
  ok('D10 los literales viejos ya no están en el panel',
    panelSrc.indexOf('{ P0: 15, P1: 12') === -1 && panelSrc.indexOf('P0: 15') === -1);

  // El mismo evento tiene que repintar aviso Y tabla.
  const iRef = panelSrc.indexOf('function refrescarCondicionBuffer()');
  const cuerpo = iRef === -1 ? '' : panelSrc.slice(iRef, iRef + 600);
  ok('D11 refrescarCondicionBuffer repinta las tres piezas',
    cuerpo.indexOf('guard()') !== -1 && cuerpo.indexOf('renderBufferPlan()') !== -1 && cuerpo.indexOf('renderSugerencia()') !== -1);
  ok('D12 los listeners delegados (input y change) pasan por ahí',
    count(panelSrc, 'refrescarCondicionBuffer();') >= 2, 'llamadas=' + count(panelSrc, 'refrescarCondicionBuffer();'));
  const iIns = panelSrc.indexOf('tab.insertBefore(panel, tab.firstChild);');
  const tras = iIns === -1 ? '' : panelSrc.slice(iIns, iIns + 700);
  ok('D13 al montar la tarjeta se pinta la tabla Y el aviso',
    tras.indexOf('renderBufferPlan()') !== -1 && tras.indexOf('renderSugerencia()') !== -1);
}

console.log('\n=== E · el evento real mueve las dos piezas ===');
{
  const e = boot({ profiles: CATALOGO, abw: { snapshot: function () { return SEED; } } });
  e.paint();
  ok('E1  arranca declarando que no hay medición', e.nodes.sug.innerHTML.indexOf('Sin medición de enlace') !== -1);
  const antesTabla = e.nodes.plan.innerHTML;

  e.nodes.link.value = '7.2';
  e.fire('input', e.nodes.link);
  const t = e.nodes.sug.innerHTML;
  ok('E2  al escribir 7,2 y disparar input, el aviso deja de hablar de estimación',
    t.indexOf('Sin medición de enlace') === -1 && t.indexOf('7.2') !== -1);
  ok('E3  y la tabla cambia con el MISMO evento', e.nodes.plan.innerHTML !== antesTabla);
  const i3 = e.nodes.plan.innerHTML.indexOf('P3 · para arrancar pide');
  const trozo3 = i3 === -1 ? '' : e.nodes.plan.innerHTML.slice(i3, i3 + 240);
  ok('E4  con 7,2 las dos piezas coinciden: el aviso dice BLOQUEADO y la fila de P3 NO arranca',
    t.indexOf('Bloqueado') !== -1 && trozo3.indexOf('NO arranca') !== -1,
    'avisoBloquea=' + (t.indexOf('Bloqueado') !== -1) + ' filaP3=' + JSON.stringify(trozo3.slice(0, 60)));

  e.nodes.link.value = '';
  e.fire('change', e.nodes.link);
  ok('E5  al borrar la cifra vuelve a declararse sin medición',
    e.nodes.sug.innerHTML.indexOf('Sin medición de enlace') !== -1);
  eq('E6  y el badge vuelve a SIN MEDICIÓN', e.nodes.badge.textContent, 'SIN MEDICIÓN');
}

console.log('\nRESUMEN PASS=' + PASS + ' FAIL=' + FAIL);
process.exit(FAIL === 0 ? 0 : 1);
