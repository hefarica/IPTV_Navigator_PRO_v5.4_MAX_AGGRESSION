/**
 * tests/ape-12p-reconciliation.test.js
 * ---------------------------------------------------------------------------
 * RONDA 20 — Reconciliación de los 12 perfiles del LAB, medida y no leída:
 *
 *   A. el puente ape-lab-12p-reconcile.js trae los 12 ids y los valores del JSON
 *   B. patchLabV8 corrige la copia embebida APE_LAB_V8_PROFILES (y es idempotente)
 *   C. el GENERADOR REAL, en un sandbox, emite para los 12 perfiles el suelo,
 *      el techo, el arranque y el BANDWIDTH del LAB (antes: 8/5/2 Mbps fijos)
 *   D. la página carga el puente en el orden correcto
 *   E. el catálogo de la muestra coincide con el LAB en los 12
 *   F. el módulo es puro (sin DOM, sin red, determinista)
 *   G. sin el puente el resultado es EXACTAMENTE el de antes (cero cambio)
 *
 * LÍMITE HONESTO: esto prueba que lo que la app DECLARA coincide con el LAB.
 * No prueba que un reproductor no corte: eso exige tráfico real y no se puede
 * medir aquí.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MOD = path.join(ROOT, 'js', 'ape-v9', 'ape-lab-12p-reconcile.js');
const LAB_JSON = path.join(ROOT, '..', '..', 'contracts', 'lab', 'APE_FUSION_PREMIUM_6K_4K_LAB_CALIBRATED_BULLETPROOF_v9.3.json');
const CAT = path.join(ROOT, '..', '..', 'contracts', 'muestra-12p', 'CATALOGO_12P.m3u8');
const INDEX = path.join(ROOT, 'index-v4.html');

let PASS = 0, FAIL = 0;
const fails = [];
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; fails.push(name); console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'esperado ' + JSON.stringify(want) + ', obtenido ' + JSON.stringify(got)); }

const L = require(MOD);
const LAB = JSON.parse(fs.readFileSync(LAB_JSON, 'utf8'));
const ORDER = ['P0', 'P0.5', 'P1', 'P1.5', 'P2', 'P2.5', 'P3', 'P3.5', 'P4', 'P4.5', 'P5', 'P5.5'];
const labS = id => LAB.profiles[id].settings;

// ── sandbox mínimo (mismo patrón que la suite de la capa 12P) ───────────────
function makeSandbox(files) {
    const vm = require('vm');
    const store = {};
    const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, appendChild() {}, setAttribute() {}, removeAttribute() {}, addEventListener() {}, children: [], innerHTML: '', textContent: '' });
    const doc = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, createElement: el, createElementNS: el, body: el(), head: el(), documentElement: el(), readyState: 'complete', title: '' };
    const sb = {
        console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear() {} },
        document: doc, navigator: { userAgent: 'node', connection: null },
        location: { href: 'http://localhost/', hostname: 'localhost', protocol: 'http:', origin: 'http://localhost' },
        setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, queueMicrotask: f => f(),
        atob: s => Buffer.from(String(s), 'base64').toString('binary'),
        btoa: s => Buffer.from(String(s), 'binary').toString('base64'),
        TextEncoder, TextDecoder, URL, URLSearchParams, performance: { now: () => Date.now() },
        addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
        crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
        fetch: () => Promise.reject(new Error('sin red en la prueba')),
    };
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    for (const f of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'ape-v9', f), 'utf8'), sb, { filename: f });
    }
    return sb;
}
const CHAN = { name: 'CANAL PRUEBA', url: 'http://example.invalid/live/index.m3u8', group_title: 'TEST', tvg_id: 'demo' };
function emit(sb, id) {
    const G = sb.window.APE_GEN_CHANNEL;
    if (typeof G !== 'function') return { txt: '', min: null, max: null, init: null, bw: null, avg: null };
    const txt = String(G(CHAN, id, 0, {}, {}) || '');
    const pick = re => { const m = re.exec(txt); return m ? Number(m[1]) : null; };
    return {
        txt,
        min: pick(/#KODIPROP:inputstream\.adaptive\.min_bandwidth=(\d+)/),
        max: pick(/#KODIPROP:inputstream\.adaptive\.max_bandwidth=(\d+)/),
        init: pick(/#KODIPROP:inputstream\.adaptive\.initial_bandwidth=(\d+)/),
        bw: pick(/BANDWIDTH=(\d+)/),
        avg: pick(/AVERAGE-BANDWIDTH=(\d+)/),
        vlcInit: pick(/#EXTVLCOPT:adaptive-initial-bandwidth=(\d+)/),
    };
}

// ── A · el puente trae los 12 y los valores del LAB ────────────────────────
console.log('\n=== A · el puente de reconciliación (12 perfiles) ===');
eq('A1  ids() devuelve 12', L.ids().length, 12);
eq('A2  el orden es el del LAB', L.ids().join(','), ORDER.join(','));
let a3 = 0;
for (const id of ORDER) {
    if (L.get(id) && L.floorBps(id) === Math.round(labS(id).bandwidth_floor) &&
        L.maxBps(id) === Math.round(labS(id).bandwidth_max) &&
        L.targetBps(id) === Math.round(labS(id).bandwidth_target) &&
        L.bitrateBps(id) === Math.round(labS(id).bitrate * 1e6)) a3++;
}
eq('A3  los 12 coinciden con el JSON (bitrate/suelo/objetivo/techo)', a3, 12);
eq('A4  P0 suelo 52 325 000 bps', L.floorBps('P0'), 52325000);
eq('A5  P0 techo 200 000 000 bps', L.maxBps('P0'), 200000000);
eq('A6  P2.5 bitrate 112 Mbps', L.bitrateBps('P2.5'), 112000000);
const s3 = L.settingsFor('P3');
eq('A7  settingsFor(P3).bitrate_floor_mbps = 6.5', s3.bitrate_floor_mbps, 6.5);
eq('A8  settingsFor(P3).avgBitrateKbps = 14960', s3.avgBitrateKbps, 14960);
eq('A9  settingsFor("P9") no inventa perfil', L.settingsFor('P9'), null);
let a10 = 0;
for (const id of ORDER) if (L.coherent(id).ok) a10++;
eq('A10 los 12 son coherentes consigo mismos (suelo < bitrate ≤ techo)', a10, 12);
const aud = L.audit();
eq('A11 audit() recorre los 12', aud.length, 12);
ok('A12 audit() no declara ninguna incoherencia', aud.filter(r => !r.ok).length === 0, JSON.stringify(aud.filter(r => !r.ok)));

// ── B · patchLabV8 corrige la copia embebida ────────────────────────────────
console.log('\n=== B · corrección de la copia embebida (APE_LAB_V8_PROFILES) ===');
const viejo = { P0: { settings: { bitrate: 200, bandwidth_floor: 8000000, bandwidth_target: 40000000, bandwidth_max: 80000000, maxBitrateKbps: 8000, avgBitrateKbps: 6400 } } };
const rep1 = L.patchLabV8(viejo);
ok('B1  informe: P0 corregido', rep1.patched.some(r => r.id === 'P0'));
eq('B2  P0 suelo queda en 52 325 000', viejo.P0.settings.bandwidth_floor, 52325000);
eq('B3  P0 techo queda en 200 000 000', viejo.P0.settings.bandwidth_max, 200000000);
eq('B4  P0 bitrate_floor_mbps derivado = 52.325', viejo.P0.settings.bitrate_floor_mbps, 52.325);
ok('B5  los 6 perfiles .5 se declaran no presentes (no se crean)',
    ['P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'].every(id => rep1.not_present.indexOf(id) >= 0));
ok('B6  changed > 0 en la primera pasada', rep1.changed > 0, 'changed=' + rep1.changed);
const rep2 = L.patchLabV8(viejo);
eq('B7  segunda pasada: 0 cambios (idempotente)', rep2.changed, 0);
const rep3 = L.patchLabV8(null);
eq('B8  sin objetivo no revienta y lo dice', rep3.skipped.length, 1);
ok('B9  huella de 8 hex estable', /^[0-9a-f]{8}$/.test(rep1.fingerprint) && rep1.fingerprint === rep2.fingerprint, rep1.fingerprint);

// ── C · el generador REAL emite el LAB en los 12 ───────────────────────────
console.log('\n=== C · lo que emite el generador para cada perfil ===');
const sbCon = makeSandbox(['ape-lab-v8-profiles.js', 'ape-lab-12p-reconcile.js', 'ape-profiles-config.js', 'm3u8-typed-arrays-ultimate.js']);
let cMin = 0, cMax = 0, cInit = 0, cBw = 0, c7 = 0;
const detalle = [];
for (const id of ORDER) {
    const e = emit(sbCon, id);
    const s = labS(id);
    const wantFloor = Math.round(s.bandwidth_floor);
    const wantMax = Math.round(s.bandwidth_max);
    const wantTarget = Math.round(s.bandwidth_target);
    if (e.min === wantFloor) cMin++;
    if (e.max === wantMax) cMax++;
    if (e.init === wantTarget) cInit++;
    if (e.bw === wantMax) cBw++;
    if (e.txt && e.txt.length > 2000 && e.min && e.max && e.init) c7++;
    if (e.min !== wantFloor || e.max !== wantMax || e.init !== wantTarget || e.bw !== wantMax) {
        detalle.push(id + ' suelo ' + e.min + '/' + wantFloor + ' techo ' + e.max + '/' + wantMax + ' arranque ' + e.init + '/' + wantTarget + ' BANDWIDTH ' + e.bw + '/' + wantMax);
    }
}
eq('C1  min_bandwidth = suelo del LAB en 12/12', cMin, 12);
eq('C2  max_bandwidth = techo del LAB en 12/12', cMax, 12);
eq('C3  initial_bandwidth = objetivo del LAB en 12/12', cInit, 12);
eq('C4  BANDWIDTH del bloque = techo del LAB en 12/12', cBw, 12);
eq('C5  los 12 emiten un bloque completo (no vacío)', c7, 12);
eq('C6  ninguna discrepancia', detalle.length, 0);
if (detalle.length) console.log('       ' + detalle.join('\n       '));
const eP1 = emit(sbCon, 'P1');
eq('C7  el arranque de VLC coincide con el objetivo del LAB (P1 = 38 000 000)', eP1.vlcInit, 38000000);
let c7b = 0;
for (const id of ORDER) { const e = emit(sbCon, id); if (e.vlcInit === e.init && e.init > 0) c7b++; }
eq('C7b los 12 arrancan con la misma cifra en VLC y en Kodi', c7b, 12);
const eP4 = emit(sbCon, 'P4');
ok('C8  P4 (720p) no pide 10 Mbps: techo = 9 750 000', eP4.max === 9750000, 'max=' + eP4.max);
const eP05 = emit(sbCon, 'P0.5');
ok('C9  P0.5 ya no cae al rescate P3 (8 Mbps)', eP05.max === 90000000 && eP05.bw === 90000000, 'max=' + eP05.max + ' bw=' + eP05.bw);

// ── D · la página carga el puente en el orden correcto ─────────────────────
console.log('\n=== D · carga en index-v4.html ===');
const html = fs.readFileSync(INDEX, 'utf8');
const iLab = html.indexOf('js/ape-v9/ape-lab-v8-profiles.js');
const iPuente = html.indexOf('js/ape-v9/ape-lab-12p-reconcile.js');
const iCfg = html.indexOf('js/ape-v9/ape-profiles-config.js');
const iGen = html.indexOf('js/ape-v9/m3u8-typed-arrays-ultimate.js');
ok('D1  el puente está en la página', iPuente > 0);
ok('D2  después de ape-lab-v8-profiles.js', iLab > 0 && iLab < iPuente, 'lab=' + iLab + ' puente=' + iPuente);
ok('D3  antes de ape-profiles-config.js (que mezcla al cargar)', iPuente < iCfg && iCfg > 0, 'puente=' + iPuente + ' cfg=' + iCfg);
ok('D4  el generador se carga después de los tres', iGen > iCfg, 'gen=' + iGen + ' cfg=' + iCfg);
eq('D5  el puente aparece una sola vez', html.split('js/ape-v9/ape-lab-12p-reconcile.js').length - 1, 1);

// ── E · el catálogo de la muestra coincide con el LAB ──────────────────────
console.log('\n=== E · muestra (contracts/muestra-12p) ===');
const catLines = fs.readFileSync(CAT, 'utf8').split(/\r?\n/);
const bloques = [];
let cur = null;
for (const line of catLines) {
    if (line.startsWith('#EXTINF')) {
        const m = /tvg-id="?([^\s"]+)"?/.exec(line);
        cur = { id: m ? m[1].replace('demo.12p.', '') : '?' };
        bloques.push(cur);
        continue;
    }
    if (cur) {
        const m = /min_bandwidth=(\d+)/.exec(line);
        if (m) cur.min = Number(m[1]);
    }
}
eq('E1  el catálogo trae 12 bloques', bloques.length, 12);
let e2 = 0;
const eDet = [];
for (const b of bloques) {
    const s = LAB.profiles[b.id] ? LAB.profiles[b.id].settings : null;
    if (s && b.min === Math.round(s.bandwidth_floor)) e2++;
    else eDet.push(b.id + ' muestra ' + b.min + ' vs LAB ' + (s ? s.bandwidth_floor : 'sin perfil'));
}
eq('E2  min_bandwidth de la muestra = suelo del LAB en 12/12', e2, 12);
if (eDet.length) console.log('       ' + eDet.join('\n       '));

// ── F · el módulo es puro y determinista ───────────────────────────────────
console.log('\n=== F · el puente no toca el mundo ===');
const src = fs.readFileSync(MOD, 'utf8');
eq('F1  no usa document.', (src.split('document.').length - 1), 0);
eq('F2  no usa fetch(', (src.split('fetch(').length - 1), 0);
eq('F3  no usa XMLHttpRequest', (src.split('XMLHttpRequest').length - 1), 0);
eq('F4  no usa require(', (src.split('require(').length - 1), 0);
ok('F5  la huella de los 12 no depende del reloj ni del azar', L.fingerprint() === L.fingerprint() && /^[0-9a-f]{8}$/.test(L.fingerprint()));

// ── G · sin el puente, el resultado es el de antes ─────────────────────────
console.log('\n=== G · guarda: sin puente no cambia nada ===');
const sbSin = makeSandbox(['ape-lab-v8-profiles.js', 'ape-profiles-config.js', 'm3u8-typed-arrays-ultimate.js']);
const gP0 = emit(sbSin, 'P0');
const gP05 = emit(sbSin, 'P0.5');
eq('G1  sin puente P0 sigue en el suelo de seguridad 14 000 000', gP0.min, 14000000);
eq('G2  sin puente P0.5 sigue en el rescate 8 000 000', gP05.max, 8000000);
eq('G3  sin puente P0.5 sigue con suelo 5 000 000', gP05.min, 5000000);
ok('G4  con puente ese mismo P0 sube al LAB (52 325 000)', emit(sbCon, 'P0').min === 52325000);

// ── H · buffer: el LAB calibra networkCachingMs por perfil y ahora manda en los 12 ──
console.log('\n=== H · network-caching (ms): los 12 perfiles emiten el buffer del LAB ===');
let h1 = 0;
const hBad = [];
for (const id of L.ids()) {
    const e = emit(sbCon, id);
    const re = /#EXTVLCOPT:network-caching=(\d+)/.exec(e.txt);
    const want = L.networkCachingEmittedMs(id);
    if (re && want > 0 && Number(re[1]) === want) h1++; else hBad.push(id + '=' + (re ? re[1] : 'sin_linea') + '≠' + want);
}
eq('H1  los 12 perfiles emiten el network-caching calibrado del LAB' + (hBad.length ? ' (' + hBad.join(',') + ')' : ''), h1, 12);
eq('H2  P0.5 usa 15 000 ms (LAB)', L.networkCachingEmittedMs('P0.5'), 15000);
eq('H3  P5.5 usa 12 000 ms (LAB)', L.networkCachingEmittedMs('P5.5'), 12000);
// los seis base YA NO llevan los 5 000 fijos de la copia embebida: el LAB calibra
// 19 000 / 12 000 / 10 000 / 8 000 / 10 000 / 5 000, recortado al buffer efectivo del
// propio perfil (P0 baja a 15 000). Antes de esta ronda los seis decían 5 000.
let h4 = 0;
const hBase = { P0: 15000, P1: 12000, P2: 10000, P3: 8000, P4: 10000, P5: 5000 };
for (const id of Object.keys(hBase)) {
    const re = /#EXTVLCOPT:network-caching=(\d+)/.exec(emit(sbCon, id).txt);
    if (re && Number(re[1]) === hBase[id]) h4++;
}
eq('H4  los 6 perfiles base emiten el buffer del LAB (15 000/12 000/10 000/8 000/10 000/5 000)', h4, 6);
// H5 · el recorte al buffer efectivo: ninguno emite más de lo que su propio perfil aguanta
let h5 = 0;
for (const id of L.ids()) {
    const declared = L.networkCachingMs(id), emitted = L.networkCachingEmittedMs(id);
    if (emitted > 0 && emitted <= declared) h5++;
}
eq('H5  en los 12, lo emitido nunca supera el cache declarado (recorte, no invención)', h5, 12);
eq('H6  sólo P0 cambia por el recorte: 19 000 declarado -> 15 000 emitido',
    [L.networkCachingMs('P0'), L.networkCachingEmittedMs('P0')].join('/'), '19000/15000');
// H7 · guarda: sin el puente cargado, los seis base vuelven a los 5 000 del config v8 y
// los .5 al rescate de 60 000 — o sea, el cambio no existe si el puente no está.
let h7 = 0;
for (const id of Object.keys(hBase)) {
    const re = /#EXTVLCOPT:network-caching=(\d+)/.exec(emit(sbSin, id).txt);
    if (re && Number(re[1]) === 5000) h7++;
}
eq('H7  guarda: sin puente, los 6 base siguen en 5 000 (comportamiento de antes intacto)', h7, 6);
{
    const re = /#EXTVLCOPT:network-caching=(\d+)/.exec(emit(sbSin, 'P0.5').txt);
    eq('H8  guarda: sin puente, P0.5 sigue en el rescate de 60 000', re ? Number(re[1]) : -1, 60000);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' RESUMEN PASS=' + PASS + '  FAIL=' + FAIL + '  TOTAL=' + (PASS + FAIL));
console.log('═══════════════════════════════════════════════════════════════');
if (FAIL) { console.log('FALLAN: ' + fails.join(' · ')); process.exit(1); }
