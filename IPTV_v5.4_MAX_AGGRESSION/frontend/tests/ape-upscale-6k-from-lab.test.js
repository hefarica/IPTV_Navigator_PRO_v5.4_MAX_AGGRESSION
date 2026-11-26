#!/usr/bin/env node
'use strict';
/*
 * ape-upscale-6k-from-lab.test.js — EL UPSCALING 6K SALE DEL LAB, NO DEL LITERAL.
 *
 * DEFECTOS QUE FIJA (2026-11-22):
 *  U-01  Con el LAB importado, `_ape6kResolve` debe devolver `source=LAB_PROFILES` y los
 *        mbps de los perfiles `.5` del JSON (P0.5 89.6 · P2.5/P3.5/P4.5/P5.5 112). Antes
 *        del import cae al literal `GENERATOR_DEFAULT`: eso también se comprueba, para
 *        demostrar que la derivación es real y no una coincidencia de la tabla.
 *  U-02  `_ape6kBaseOf`: la tabla está indexada P0..P5, así que un canal etiquetado `P4.5`
 *        NO recibía su declaración 6K mientras un `P4` sí. Ahora un `.5` usa su tier base;
 *        un id desconocido sigue sin tag (no se inventa).
 *
 * COMO PRUEBA: carga la clase REAL, importa el JSON por el camino LAB, y ejecuta los
 * fragmentos REALES del generador (tabla + resolvedor + helper) extraídos del fuente.
 *
 * FIXTURE: argv[2], $APE_LAB_CALIBRATED_JSON o artifacts/lab/calibrated/. Sin fixture: SKIP.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const NAME = 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json';
const REPO = path.join(__dirname, '..', '..', '..');
const FE = path.join(REPO, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend');
const GEN = path.join(FE, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const NORM = require(path.join(FE, 'js', 'ape-lab-normalize.js'));

const candidates = [process.argv[2], process.env.APE_LAB_CALIBRATED_JSON, path.join(REPO, 'artifacts', 'lab', 'calibrated', NAME)].filter(Boolean);
const fixture = candidates.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!fixture) { console.log('SKIP  no hay fixture calibrado. Buscado en:\n  ' + candidates.join('\n  ')); process.exit(0); }

let pass = 0, fail = 0;
const check = (cond, name, extra) => { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra ? ' — ' + extra : '')); } };

const src = fs.readFileSync(GEN, 'utf8');
const fb = src.match(/const _APE_6K_FALLBACK = \{[\s\S]*?\n        \};/);
const fn = src.match(/const _ape6kResolve = \(\) => \{[\s\S]*?\n        \};/);
const helper = src.match(/function _ape6kBaseOf\(profile, table\) \{[\s\S]*?\n    \}/);
check(!!fb && !!fn && !!helper, 'fragmentos reales del generador localizados (tabla + resolvedor + helper)');
if (!fb || !fn || !helper) { console.log('\n{"passed":' + pass + ',"failed":' + fail + '}'); process.exit(1); }

const _ape6kBaseOf = new Function('return ' + helper[0])();
const resolve = (win) => new Function('window', fb[0] + '\n' + fn[0] + '\nreturn _ape6kResolve();')(win);

/* U-02 · mapeo de base 6K */
const T = { P0: 1, P1: 1, P2: 1, P3: 1, P4: 1, P5: 1 };
const map = [['P4', 'P4'], ['P4.5', 'P4'], ['P4_5', 'P4'], ['P0.5', 'P0'], ['P5.5', 'P5'], ['P6', null], ['', null], [null, null], ['xyz', null]];
let badMap = [];
for (const [inp, exp] of map) { if (_ape6kBaseOf(inp, T) !== exp) badMap.push(JSON.stringify(inp) + '→' + JSON.stringify(_ape6kBaseOf(inp, T))); }
check(badMap.length === 0, 'U-02: un canal P4.5/P4_5 recibe su declaración 6K; id inválido no', badMap.join(','));

/* contexto de navegador para la clase real */
const noop = () => {};
const store = Object.create(null);
const fe = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, appendChild: noop, setAttribute: noop, addEventListener: noop, remove: noop, value: '', textContent: '', innerHTML: '' });
const ctx = {
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, group: noop, groupEnd: noop },
    JSON, Math, Date, RegExp, Promise, Set, Map, Array, Object, String, Number, Boolean, Error, Symbol,
    setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear: () => { for (const k of Object.keys(store)) delete store[k]; }, key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: fe, createTextNode: fe, body: fe(), head: fe(), documentElement: fe(), readyState: 'complete', cookie: '' },
    navigator: { userAgent: 'node-harness' }, location: { href: 'http://localhost/' }, fetch: () => Promise.reject(new Error('sin red')),
    Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
    Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: noop }, performance: { now: () => Date.now() }
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'ape-profiles-config.js'), 'utf8'), ctx, { filename: 'ape-profiles-config.js', timeout: 30000 });
const inst = ctx.APE_PROFILES_CONFIG;

(async () => {
    const before = resolve(ctx);
    check(before.source === 'GENERATOR_DEFAULT', 'U-01: SIN LAB la capa 6K es el literal declarado como tal', before.source);

    const J = JSON.parse(fs.readFileSync(fixture, 'utf8').replace(/^\uFEFF/, ''));
    await inst.importFromLABData(NORM.normalize(J).data);

    const after = resolve(ctx);
    check(after.source === 'LAB_PROFILES' || after.source === 'LAB', 'U-01: CON el LAB la capa 6K se deriva del JSON importado', after.source);
    check(Number(after.table.P0.mbps) === 89.6, 'P0.5 mbps 89.6 (del JSON)', after.table.P0.mbps);
    check(Number(after.table.P4.mbps) === 112, 'P4.5 mbps 112 (del JSON)', after.table.P4.mbps);
    check(Number(after.table.P5.mbps) === 112, 'P5.5 mbps 112 (del JSON)', after.table.P5.mbps);
    check(after.table.P4.id === 'P4.5' && after.table.P5.id === 'P5.5', 'cada tier apunta a su perfil .5', after.table.P4.id + '/' + after.table.P5.id);
    check(/^\d+x\d+$/.test(String(after.table.P4.src)), 'src = resolución del perfil BASE', after.table.P4.src);
    check(String(after.table.P4.tec).indexOf('upscale') >= 0, 'la técnica declara upscale', after.table.P4.tec);

    console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"upscale":"LAB"}');
    process.exit(fail === 0 ? 0 : 1);
})();
