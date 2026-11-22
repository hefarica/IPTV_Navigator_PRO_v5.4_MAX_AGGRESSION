#!/usr/bin/env node
'use strict';
/*
 * ape-lab-gate-open.test.js — EL IMPORT NO PUEDE DEJAR EL GATE CERRADO EN SILENCIO.
 *
 * DEFECTO MEDIDO (2026-11-22): `importProfiles()` —camino A, los botones "Importar todos" y
 * "restaurar plantilla"— carga los 12 perfiles y deja `labExportedAt = null`. El
 * `generation-controller` aborta entonces con "LAB JSON no importado": el operador ve los 12
 * perfiles cargados y la generación bloqueada. Medido en dos sandbox:
 *     camino A → 12 perfiles · labExportedAt=null
 *     camino B → 12 perfiles · labExportedAt="2026-11-22T07:23:11.000Z"
 *
 * ARREGLO: `openLabGate(exportedAt)` abre el gate con la fecha que DECLARA el fichero. Nunca
 * fabrica una marca de tiempo: sin `exported_at` el gate sigue cerrado y el aviso lo dice.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FE = path.join(__dirname, '..');
const CFG = path.join(FE, 'js', 'ape-v9', 'ape-profiles-config.js');
const PM9 = path.join(FE, 'js', 'ape-v9', 'profile-manager-v9.js');
const NAME = 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json';
const REPO = path.join(FE, '..', '..');

let pass = 0, fail = 0;
const check = (cond, name, extra) => { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };

const noop = () => {};
const store = Object.create(null);
const fe = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, appendChild: noop, setAttribute: noop, addEventListener: noop, remove: noop, value: '', textContent: '', innerHTML: '' });
function mkCtx() {
    const c = {
        console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, group: noop, groupEnd: noop },
        btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'), atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
        setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear: () => { for (const k of Object.keys(store)) delete store[k]; }, key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } },
        sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        document: { addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: fe, createTextNode: fe, body: fe(), head: fe(), documentElement: fe(), readyState: 'complete', cookie: '' },
        navigator: { userAgent: 'node-harness' }, location: { href: 'http://localhost/' }, fetch: () => Promise.reject(new Error('sin red')),
        Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
        Blob: class {}, URL: { createObjectURL: () => 'x', revokeObjectURL: noop }, performance: { now: () => Date.now() }
    };
    c.window = c; c.self = c; c.globalThis = c;
    vm.createContext(c);
    vm.runInContext(fs.readFileSync(CFG, 'utf8'), c, { filename: 'cfg.js', timeout: 60000 });
    return c;
}

/* ── la función existe y es honesta ── */
const src = fs.readFileSync(CFG, 'utf8');
check(/openLabGate\(exportedAt\)\s*\{/.test(src), 'openLabGate() existe en APEProfilesConfig');

const c1 = mkCtx();
const inst = c1.APE_PROFILES_CONFIG;
let saved = 0;
inst.save = function () { saved++; };

/* baseline documentado: sin openLabGate el gate queda cerrado (es el defecto que se arregla) */
check(inst.labExportedAt == null, 'baseline: el gate arranca cerrado (labExportedAt null)', String(inst.labExportedAt));

/* vacíos: NO se inventa fecha */
check(inst.openLabGate('') === false && inst.labExportedAt == null, 'openLabGate("") no abre el gate');
check(inst.openLabGate(null) === false && inst.labExportedAt == null, 'openLabGate(null) no abre el gate');
check(inst.openLabGate('   ') === false && inst.labExportedAt == null, 'openLabGate("   ") no abre el gate');
check(saved === 0, 'no persistió nada mientras no había fecha', 'save() llamadas=' + saved);

/* fecha real: abre, persiste y conserva el valor del fichero */
const EXP = '2026-11-22T07:23:11.000Z';
check(inst.openLabGate(EXP) === true && inst.labExportedAt === EXP, 'openLabGate con la fecha del fichero abre el gate', String(inst.labExportedAt));
check(saved === 1, 'persistió al abrir (save() una vez)', 'save() llamadas=' + saved);

/* ya abierto: no se pisa (el LAB vigente manda) */
check(inst.openLabGate('2020-01-01T00:00:00.000Z') === false && inst.labExportedAt === EXP, 'no pisa un gate ya abierto', String(inst.labExportedAt));
check(saved === 1, 'no vuelve a persistir si no cambió', 'save() llamadas=' + saved);

/* ── los dos call sites usan openLabGate y el aviso dice la verdad ── */
const pm = fs.readFileSync(PM9, 'utf8');
const uses = (pm.match(/this\.config\.openLabGate\(/g) || []).length;
check(uses >= 2, 'los dos call sites (plantilla y botón LAB) abren el gate', 'llamadas=' + uses);
check(/_meta\.exported_at \|\| data\._meta\.exported/.test(pm) || /_meta\.exported_at\)\)[\s\S]{0,40}data\.exported_at/.test(pm),
    'la fecha sale del fichero: _meta.exported_at, _meta.exported o exported_at raíz');
check(pm.includes("'CERRADO — el fichero no declara exported_at"), 'el aviso declara CERRADO cuando el fichero no trae fecha');

/* ── integración: importar por camino A + abrir gate deja el estado que el generador exige ── */
const fixture = [path.join(REPO, 'artifacts', 'lab', 'calibrated', NAME), process.env.APE_LAB_CALIBRATED_JSON].filter(Boolean)
    .find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!fixture) {
    console.log('SKIP  integración con el JSON real (no hay fixture)');
} else {
    const J = JSON.parse(fs.readFileSync(fixture, 'utf8').replace(/^\uFEFF/, ''));
    const c2 = mkCtx();
    const i2 = c2.APE_PROFILES_CONFIG;
    const okImp = i2.importProfiles(J.profiles);
    check(okImp === true && Object.keys(i2.profiles).length === 12, 'camino A importa los 12 perfiles', Object.keys(i2.profiles).length);
    check(i2.labExportedAt == null, 'camino A deja el gate cerrado (documenta el foot-gun)');
    /* el JSON real declara `_meta.exported`; el normalizador lo renombra a `exported_at`.
     * El lector debe aceptar las dos formas (defecto real: sólo miraba exported_at). */
    const exp = (J._meta && (J._meta.exported_at || J._meta.exported)) || J.exported_at || null;
    check(!!exp, 'el JSON declara la fecha (exported_at o _meta.exported)', String(exp));
    check(i2.openLabGate(exp) === true && i2.labExportedAt === exp, 'tras abrir el gate, el generador ya no bloquea', String(i2.labExportedAt));
}

console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"gate":"honesto"}');
process.exit(fail === 0 ? 0 : 1);
