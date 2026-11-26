#!/usr/bin/env node
'use strict';
/*
 * ape-lab-import-pathB.test.js — REGRESION del camino LAB real (B).
 *
 * FIJA DOS DEFECTOS MEDIDOS (2026-11-22, informe t2 + verificación del capitán):
 *  H-02  `importFromLABData` lanzaba "Schema invalido: lab_version='APE_v9.0',
 *        schema_variant='all_profiles'". El normalizador copia _meta.version/_meta.type
 *        a lab_version/lab_schema_variant y el gate sólo aceptaba /^omega_/i o
 *        bulletproof===true. Sin este fix, el camino LAB daba 0/12.
 *  H-03  el botón LAB mandaba `_meta.type='all_profiles'` por importProfiles(), que
 *        descarta `_meta` ⇒ labExportedAt=null ⇒ generation-controller.js:1590
 *        ABORTA la generación. Ahora se enruta por normalize → importFromLABData.
 *
 * COMO PRUEBA: ejecuta la CLASE REAL en un contexto `vm` con stubs de navegador y
 * recorre el camino completo: normalize → importFromLABData → estado persistido.
 *
 * FIXTURE: no se versiona (1,7 MB). Busca en argv[2], $APE_LAB_CALIBRATED_JSON y
 * artifacts/lab/calibrated/. Sin fixture imprime SKIP y sale 0 (CI no se pone rojo).
 *
 * Uso: node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-lab-import-pathB.test.js [ruta.json]
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const NAME = 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json';
const REPO = path.join(__dirname, '..', '..', '..');
const FE = path.join(REPO, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend');
const SRC = path.join(FE, 'js', 'ape-v9', 'ape-profiles-config.js');
const NORM = require(path.join(FE, 'js', 'ape-lab-normalize.js'));

const candidates = [process.argv[2], process.env.APE_LAB_CALIBRATED_JSON, path.join(REPO, 'artifacts', 'lab', 'calibrated', NAME)].filter(Boolean);
const fixture = candidates.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!fixture) {
    console.log('SKIP  no hay fixture calibrado. Buscado en:\n  ' + candidates.join('\n  '));
    process.exit(0);
}

const noop = () => {};
const store = Object.create(null);
const fakeEl = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, appendChild: noop, setAttribute: noop, addEventListener: noop, remove: noop, value: '', textContent: '', innerHTML: '' });
const ctx = {
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, group: noop, groupEnd: noop },
    JSON, Math, Date, RegExp, Promise, Set, Map, Array, Object, String, Number, Boolean, Error, Symbol,
    setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
        key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; }
    },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: {
        addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
        getElementById: () => null, createElement: fakeEl, createTextNode: fakeEl, body: fakeEl(), head: fakeEl(), documentElement: fakeEl(), readyState: 'complete', cookie: ''
    },
    navigator: { userAgent: 'node-harness' }, location: { href: 'http://localhost/' },
    fetch: () => Promise.reject(new Error('sin red')),
    Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
    Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: noop }, performance: { now: () => Date.now() }
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;

let pass = 0, fail = 0;
const check = (cond, name, extra) => { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra ? ' — ' + extra : '')); } };

vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'ape-profiles-config.js', timeout: 30000 });
const inst = ctx.APE_PROFILES_CONFIG;
check(!!inst && typeof inst.importFromLABData === 'function', 'la clase real expone importFromLABData');
if (!inst) { console.log('\n{"passed":' + pass + ',"failed":' + fail + '}'); process.exit(1); }

const J = JSON.parse(fs.readFileSync(fixture, 'utf8').replace(/^\uFEFF/, ''));

(async () => {
    const n = NORM.normalize(J);
    check(n.ok === true && n.ids.length === 12, 'el normalizador acepta la familia all_profiles con 12 ids', (n.ids || []).length + ' ids');

    let err = null;
    try { await inst.importFromLABData(n.data); } catch (e) { err = e.message; }
    check(err === null, 'H-02: importFromLABData no lanza (gate de schema acepta all_profiles)', err || '');

    const ids = Object.keys(inst.profiles || {});
    const s = (id) => (inst.profiles[id] || {}).settings || {};
    const h = (id) => (inst.profiles[id] || {}).hlsjs || {};

    check(ids.length === 12, '12 perfiles persistidos', ids.join(','));
    check(['P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'].every(k => ids.indexOf(k) >= 0), 'los 6 perfiles .5 conservados');
    check(!!inst.labExportedAt, 'H-03: labExportedAt abierto (generation-controller.js:1590 no aborta)', String(inst.labExportedAt));

    /* CALIDAD: los valores calibrados llegan intactos */
    check(Number(s('P0').bitrate) === 200, 'P0 bitrate nominal 200', s('P0').bitrate);
    check(Number(s('P0').bandwidth_floor) === 52325000, 'P0 bandwidth_floor 52325000', s('P0').bandwidth_floor);
    check(Number(s('P0').bitrate_floor_mbps) === 52.325, 'P0 bitrate_floor_mbps 52.325', s('P0').bitrate_floor_mbps);
    check(Number(s('P4.5').bitrate) === 112, 'P4.5 bitrate 112', s('P4.5').bitrate);
    check(Number(h('P4.5').maxBufferSize) === 536870912, 'P4.5 maxBufferSize 512 MiB', h('P4.5').maxBufferSize);
    check(String(h('P0').lowLatencyMode) === 'True', 'P0 lowLatencyMode True', h('P0').lowLatencyMode);
    check(Object.keys((inst.profiles.P4_5 || inst.profiles['P4.5'] || {}).settings || {}).length > 0, 'P4.5 con settings presentes');

    console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"fixture":"' + path.basename(fixture) + '"}');
    process.exit(fail === 0 ? 0 : 1);
})();
