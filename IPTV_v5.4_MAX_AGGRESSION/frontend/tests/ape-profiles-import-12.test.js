#!/usr/bin/env node
'use strict';
/*
 * ape-profiles-import-12.test.js — REGRESION del import de perfiles LAB.
 *
 * FIJA EL DEFECTO MEDIDO (2026-11-22): `importProfiles()` filtraba `/^P[0-5]$/`
 * y descartaba en silencio los 6 perfiles emulados `.5` del JSON calibrado:
 * se importaban 6 de 12. Con el filtro corregido entran los 12.
 *
 * COMO PRUEBA: ejecuta la CLASE REAL `APEProfilesConfig` (no un mock) dentro de un
 * contexto `vm` con stubs de navegador, importa el JSON calibrado y verifica el
 * estado persistido. No toca el navegador ni la red.
 *
 * FIXTURE: el JSON de 1,7 MB no vive en git. Busqueda en este orden:
 *   1. argv[2]
 *   2. $APE_LAB_CALIBRATED_JSON
 *   3. artifacts/lab/calibrated/APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json
 * Si no esta, la prueba imprime SKIP y sale 0: un CI sin fixture no debe ponerse rojo
 * por un dato que no versionamos. En local (con el fixture) es un PASS duro.
 *
 * Uso: node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-profiles-import-12.test.js [ruta.json]
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');

const NAME = 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json';
const SHA = '91348284e4a4cfad4f6c189754dfaa0e2aebb1b790ac0ada5de32653eab14019';
const REPO = path.join(__dirname, '..', '..', '..');
const SRC = path.join(REPO, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'ape-profiles-config.js');

const candidates = [
    process.argv[2],
    process.env.APE_LAB_CALIBRATED_JSON,
    path.join(REPO, 'artifacts', 'lab', 'calibrated', NAME)
].filter(Boolean);

const fixture = candidates.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!fixture) {
    console.log('SKIP  no hay fixture calibrado. Buscado en:\n  ' + candidates.join('\n  '));
    console.log('      Para correrlo: node ' + path.relative(REPO, __filename) + ' <ruta al JSON>');
    process.exit(0);
}

const noop = () => {};
const fakeEl = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, appendChild: noop, setAttribute: noop, addEventListener: noop, remove: noop, value: '', textContent: '', innerHTML: '' });
const store = Object.create(null);

const ctx = {
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, group: noop, groupEnd: noop },
    JSON, Math, Date, RegExp, Promise, Set, Map, Array, Object, String, Number, Boolean, Error, Symbol,
    setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
        key: (i) => Object.keys(store)[i] || null,
        get length() { return Object.keys(store).length; }
    },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: {
        addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
        getElementById: () => null, createElement: fakeEl, createTextNode: fakeEl, body: fakeEl(), head: fakeEl(),
        documentElement: fakeEl(), readyState: 'complete', cookie: ''
    },
    navigator: { userAgent: 'node-harness', language: 'es' },
    location: { href: 'http://localhost/', protocol: 'http:', hostname: 'localhost' },
    fetch: () => Promise.reject(new Error('sin red en el harness')),
    Event: class { constructor(t) { this.type = t; } },
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
    Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: noop },
    performance: { now: () => Date.now() }
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.top = ctx; ctx.parent = ctx;

let pass = 0, fail = 0;
const check = (cond, name, extra) => { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra ? ' — ' + extra : '')); } };

/* Identidad del fixture */
const bytes = fs.readFileSync(fixture);
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
check(sha === SHA, 'fixture = JSON calibrado entregado (sha256)', sha);

/* Carga de la clase REAL */
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'ape-profiles-config.js', timeout: 30000 });
const inst = ctx.APE_PROFILES_CONFIG;
check(!!inst && typeof inst.importProfiles === 'function', 'la clase real APEProfilesConfig se instancia y expone importProfiles');
if (!inst) { console.log('\n{"passed":' + pass + ',"failed":' + fail + '}'); process.exit(1); }

const before = Object.keys(inst.profiles || {}).length;
const json = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const ok = inst.importProfiles(json);
const ids = Object.keys(inst.profiles || {});
const esperados = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'];
const faltan = esperados.filter(k => ids.indexOf(k) < 0);

check(ok === true, 'importProfiles() devuelve true');
check(faltan.length === 0, 'los 12 perfiles persisten (incluidos los .5)', 'faltan: ' + faltan.join(','));
check(ids.length === 12, 'exactamente 12 perfiles en el estado', ids.length + ' (antes ' + before + ')');
check(Object.keys(json.profiles).every(k => ids.indexOf(k) >= 0), 'ningun perfil del JSON se pierde');

const s = (id) => (inst.profiles[id] || {}).settings || {};
const h = (id) => (inst.profiles[id] || {}).hlsjs || {};
check(Number(s('P0').bitrate) === 200, 'P0 bitrate nominal = 200 (no degradado)', s('P0').bitrate);
check(Number(s('P0').bandwidth_floor) === 52325000, 'P0 bandwidth_floor = 52325000 (suelo calibrado)', s('P0').bandwidth_floor);
check(Number(s('P0').bitrate_floor_mbps) === 52.325, 'P0 bitrate_floor_mbps = 52.325', s('P0').bitrate_floor_mbps);
check(Number(s('P4.5').bitrate) === 112, 'P4.5 bitrate nominal = 112', s('P4.5').bitrate);
check(Number(h('P4.5').maxBufferSize) === 536870912, 'P4.5 maxBufferSize = 512 MiB', h('P4.5').maxBufferSize);
check(String(h('P0').lowLatencyMode) === 'True', 'P0 lowLatencyMode = True', h('P0').lowLatencyMode);
check(Object.keys(store).length > 0, 'la importacion persiste en storage', Object.keys(store).join(','));

/* Nada de perfiles basura aceptados */
const junk = ['P6', 'Px', 'P0.7', 'P1.5.5', '_meta'];
const accepted = junk.filter(k => ids.indexOf(k) >= 0);
check(accepted.length === 0, 'el import no acepta ids invalidos', accepted.join(','));

console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"fixture":"' + path.basename(fixture) + '"}');
process.exit(fail === 0 ? 0 : 1);
