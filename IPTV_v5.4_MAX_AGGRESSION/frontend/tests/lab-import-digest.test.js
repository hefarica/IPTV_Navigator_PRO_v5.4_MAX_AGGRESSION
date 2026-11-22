#!/usr/bin/env node
'use strict';
/*
 * lab-import-digest.test.js — DIGEST COMPLETO DEL LAB CALIBRADO.
 *
 * QUÉ FIJA (t3, 2026-11-22)
 *   1. IDENTIDAD del fixture: el JSON entregado por el propietario (1.704.559 B,
 *      sha256 91348284e4a4cfad4f6c189754dfaa0e2aebb1b790ac0ada5de32653eab14019)
 *      copiado a artifacts/lab/calibrated/ sin tocar un byte.
 *   2. DIGEST del NORMALIZADOR REAL (frontend/js/ape-lab-normalize.js, UMD, sin DOM):
 *      normaliza la familia B (`profiles` + `_meta.type='all_profiles'`) y se exige
 *      que NINGÚN nodo de la entrada falte en la salida y que NINGÚN valor cambie
 *      de valor NI DE TIPO. Los únicos nodos nuevos permitidos son los 6 canónicos
 *      del contrato, y cada uno debe derivarse de la entrada (cero valores inventados).
 *   3. CALIDAD INTACTA: P0 conserva bitrate nominal 200, bandwidth_floor 52325000 y
 *      bitrate_floor_mbps 52.325, con su tipo numérico (nada de string→number).
 *   4. ANTES/DESPUÉS del filtro de ids de `importProfiles()`: ejecuta la CLASE REAL
 *      (no un mock) desde el blob PRE-FIX (a3c4062a) y desde el árbol actual, con el
 *      mismo JSON. Antes: 6/12 y pérdida SILENCIOSA (devuelve true). Ahora: 12/12.
 *
 * POR QUÉ ASÍ: el defecto medido fue `filter(k => /^P[0-5]$/)`, que descartaba
 * P0.5..P5.5 sin lanzar. Un test que sólo cuente 12 tras el fix no demuestra que
 * antes se perdieran 6 ni que la pérdida fuera silenciosa: por eso se corre el blob
 * histórico en un contexto `vm` propio y se captura el log real de importación.
 *
 * FIXTURE: 1,7 MB, no se versiona. Búsqueda: argv[2] → $APE_LAB_CALIBRATED_JSON →
 * artifacts/lab/calibrated/<name>. Sin fixture imprime SKIP y sale 0 (un CI sin el
 * dato no se pone rojo). Con fixture, es un PASS duro.
 *
 * Uso:
 *   node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/lab-import-digest.test.js [ruta.json]
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const NAME = 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json';
const SHA = '91348284e4a4cfad4f6c189754dfaa0e2aebb1b790ac0ada5de32653eab14019';
const BYTES = 1704559;
const PRE_FIX_COMMIT = 'a3c4062a'; // padre de e7df70e1 (el fix del filtro)

const REPO = path.join(__dirname, '..', '..', '..');
const NORM_PATH = path.join(__dirname, '..', 'js', 'ape-lab-normalize.js');
const CFG_PATH = path.join(__dirname, '..', 'js', 'ape-v9', 'ape-profiles-config.js');
const CFG_REL = path.relative(REPO, CFG_PATH).split(path.sep).join('/');

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

let pass = 0, fail = 0, skip = 0;
const check = (cond, name, extra) => {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FALLA ' + name + (extra ? ' — ' + extra : '')); }
};
const skipWithReason = (name, reason) => { skip++; console.log('SKIP  ' + name + ' — ' + reason); };

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const NOTFOUND = Symbol('missing');

function deepEqual(a, b) {
    const ta = typeOf(a), tb = typeOf(b);
    if (ta !== tb) return false;
    if (ta === 'number') return Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b));
    if (ta === 'string' || ta === 'boolean' || ta === 'null' || ta === 'undefined') return a === b;
    if (ta === 'array') {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
        return true;
    }
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
        if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
        if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
}

function getIn(root, prefix) {
    let cur = root;
    for (const seg of prefix) {
        if (cur === null || typeof cur !== 'object') return NOTFOUND;
        if (!Object.prototype.hasOwnProperty.call(cur, seg)) return NOTFOUND;
        cur = cur[seg];
    }
    return cur;
}

const fmtPath = (p) => p.reduce((s, seg) => (typeof seg === 'number' ? s + '[' + seg + ']' : (s ? s + '.' + seg : String(seg))), '') || '$';

/* ═══════════════════ 1 · IDENTIDAD DEL FIXTURE ═══════════════════ */
console.log('── 1 · Fixture (copia byte a byte en artifacts/lab/calibrated/)');
const raw = fs.readFileSync(fixture);
const sha = crypto.createHash('sha256').update(raw).digest('hex');
console.log('      ruta  : ' + path.relative(REPO, fixture));
console.log('      bytes : ' + raw.length);
console.log('      sha256: ' + sha);
check(raw.length === BYTES, 'fixture con los 1.704.559 B del JSON entregado', String(raw.length));
check(sha === SHA, 'fixture byte a byte: sha256 = 91348284…4019', sha);

const text = raw.toString('utf8').replace(/^\uFEFF/, '');
const J = JSON.parse(text);

/* ═══════════════════ 2 · DIGEST DEL NORMALIZADOR REAL ═══════════════════ */
console.log('\n── 2 · Normalizador real (require del UMD, sin DOM ni storage)');
const NORM = require(NORM_PATH);
check(NORM && typeof NORM.normalize === 'function', 'ape-lab-normalize.js requiere y expone normalize() sin navegador', NORM && NORM.version);

let n = null, normErr = null;
try { n = NORM.normalize(J); } catch (e) { normErr = e.message; }
check(normErr === null, 'normalize() no lanza con la familia del LAB entregado', normErr || '');
if (!n) {
    console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"skipped":' + skip + '}');
    process.exit(1);
}
const OUT = n.data;
console.log('      family=' + n.family + '  ids=' + n.ids.length);

/* 2.1 — 12 ids EXACTOS */
const EXPECTED = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'];
const gotIds = Object.keys(OUT.profiles_calibrated);
const sorted = (a) => a.slice().sort();
check(gotIds.length === 12, '12 perfiles en la salida', gotIds.length + ': ' + gotIds.join(','));
check(JSON.stringify(sorted(gotIds)) === JSON.stringify(sorted(EXPECTED)), 'los 12 ids son EXACTOS (P0-P5 + P0.5-P5.5)', 'faltan=' + EXPECTED.filter(k => gotIds.indexOf(k) < 0).join(',') + ' sobran=' + gotIds.filter(k => EXPECTED.indexOf(k) < 0).join(','));

/* 2.2 — NINGÚN nodo de la entrada ausente / alterado en la salida */
/* Nota de coste: se compara cada PRIMITIVO (valor + tipo) y se exige presencia de
 * cada objeto/array; además un deepEqual del subárbol `profiles` completo cierra
 * cualquier hueco que un recorrido por nodos pudiera dejar. */
const nodes = [], prims = [];
(function walk(v, p) {
    const t = typeOf(v);
    nodes.push({ p: p, t: t });
    if (t === 'object') { for (const k of Object.keys(v)) walk(v[k], p.concat(k)); return; }
    if (t === 'array') { for (let i = 0; i < v.length; i++) walk(v[i], p.concat(i)); return; }
    prims.push({ p: p, v: v, t: t });
})(J, []);

const lostNodes = [], lostPrims = [], changedPrims = [];
for (const nd of nodes) {
    const got = getIn(OUT, nd.p);
    if (got === NOTFOUND) lostNodes.push(fmtPath(nd.p));
}
for (const pr of prims) {
    const got = getIn(OUT, pr.p);
    if (got === NOTFOUND) { lostPrims.push(fmtPath(pr.p)); continue; }
    if (!deepEqual(got, pr.v)) {
        changedPrims.push(fmtPath(pr.p) + ' (entrada ' + pr.t + ':' + JSON.stringify(pr.v) + ' → salida ' + typeOf(got) + ':' + JSON.stringify(got) + ')');
    }
}
console.log('      nodos recorridos: ' + nodes.length + '  primitivos comparados: ' + prims.length);
console.log('      perdidos: ' + lostNodes.length + '  primitivos perdidos: ' + lostPrims.length + '  alterados: ' + changedPrims.length);
if (lostNodes.length) console.log('      primeros perdidos: ' + lostNodes.slice(0, 8).join(' | '));
if (changedPrims.length) console.log('      primeros alterados: ' + changedPrims.slice(0, 8).join(' | '));

check(prims.length > 10000, 'el digest recorre un volumen real (no un recorte)', prims.length + ' primitivos');
check(lostNodes.length === 0, 'ningún nodo de la entrada falta en la salida (0 perdidos)', lostNodes.length + ' perdidos');
check(lostPrims.length === 0, 'ningún campo/valor de la entrada se pierde', lostPrims.length + ' perdidos');
check(changedPrims.length === 0, 'ningún valor ni TIPO cambia (cero coerciones string↔number)', changedPrims.length + ' alterados');

/* Cierre total del subárbol de perfiles (cubre arrays y orden de claves) */
check(deepEqual(OUT.profiles_calibrated, J.profiles), 'el subárbol `profiles` completo sale IDÉNTICO (deepEqual)');
check(deepEqual(OUT._meta, J._meta), '`_meta` sale idéntico (no se reescribe la procedencia)');

/* 2.3 — Nodos añadidos: exactamente los 6 del contrato, todos derivados de la entrada */
const inKeys = Object.keys(J), outKeys = Object.keys(OUT);
const added = outKeys.filter(k => inKeys.indexOf(k) < 0);
const ADDED_EXPECTED = ['exported_at', 'lab_schema_variant', 'lab_version', 'profiles_calibrated', '_ape_lab_family', '_ape_lab_ids'];
console.log('      nodos raíz añadidos: ' + (added.join(',') || '(ninguno)'));
check(JSON.stringify(sorted(added)) === JSON.stringify(sorted(ADDED_EXPECTED)), 'sólo se añaden los 6 nodos canónicos del contrato', 'añadidos=' + added.join(','));
check(OUT.profiles_calibrated === J.profiles, 'profiles_calibrated es la MISMA referencia (no se reconstruye ni se clona)');
check(OUT.lab_version === J._meta.version, 'lab_version = _meta.version de la entrada (no se inventa)', OUT.lab_version);
check(OUT.lab_schema_variant === J._meta.type, 'lab_schema_variant = _meta.type de la entrada', OUT.lab_schema_variant);
check(OUT.exported_at === J._meta.exported, 'exported_at = _meta.exported REAL de la entrada', OUT.exported_at);
check(OUT._ape_lab_family === 'profiles', '_ape_lab_family declara la familia detectada', OUT._ape_lab_family);
check(deepEqual(OUT._ape_lab_ids, EXPECTED.slice().sort((a, b) => gotIds.indexOf(a) - gotIds.indexOf(b))) &&
    deepEqual(OUT._ape_lab_ids, gotIds), '_ape_lab_ids replica los ids observados', JSON.stringify(OUT._ape_lab_ids));

/* ═══════════════════ 3 · CALIDAD INTACTA (P0) ═══════════════════ */
console.log('\n── 3 · Calidad intacta (los valores calibrados llegan, no se degradan)');
const P0 = OUT.profiles_calibrated['P0'] || {};
const s0 = P0.settings || {};
const P45 = OUT.profiles_calibrated['P4.5'] || {};
console.log('      P0.settings.bitrate=' + s0.bitrate + ' (' + typeof s0.bitrate + ')  bandwidth_floor=' + s0.bandwidth_floor + '  bitrate_floor_mbps=' + s0.bitrate_floor_mbps);
check(s0.bitrate === 200 && typeof s0.bitrate === 'number', 'P0 nominal = 200 (number)', typeof s0.bitrate + ':' + s0.bitrate);
check(s0.bandwidth_floor === 52325000 && typeof s0.bandwidth_floor === 'number', 'P0 bandwidth_floor = 52325000 (number)', typeof s0.bandwidth_floor + ':' + s0.bandwidth_floor);
check(s0.bitrate_floor_mbps === 52.325 && typeof s0.bitrate_floor_mbps === 'number', 'P0 bitrate_floor_mbps = 52.325 (number)', typeof s0.bitrate_floor_mbps + ':' + s0.bitrate_floor_mbps);
check(P45.settings && P45.settings.bitrate === 112, 'P4.5 nominal = 112 (6K no se rebaja)', P45.settings && P45.settings.bitrate);
check(P45.hlsjs && P45.hlsjs.maxBufferSize === 536870912, 'P4.5 maxBufferSize = 512 MiB (no se recorta el buffer)', P45.hlsjs && P45.hlsjs.maxBufferSize);
check(P0.hlsjs && String(P0.hlsjs.lowLatencyMode) === 'True', 'P0 lowLatencyMode = True se conserva', P0.hlsjs && P0.hlsjs.lowLatencyMode);

/* ═══════════════════ 4 · ANTES / DESPUÉS DEL FILTRO DE importProfiles() ═══════════════════ */
console.log('\n── 4 · importProfiles() real: ANTES (' + PRE_FIX_COMMIT + ') vs AHORA');

/* Identidad del código que se mide: sin esto, un PASS no dice sobre qué revisión corre. */
let headShort = 'NO_MEDIDO', cfgDirty = 'NO_MEDIDO';
try {
    headShort = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    cfgDirty = execFileSync('git', ['status', '--porcelain', '--', CFG_REL], { cwd: REPO, encoding: 'utf8' }).trim();
} catch (e) { /* git ausente: se declara NO_MEDIDO, no se finge */ }
console.log('      HEAD=' + headShort + '  ' + path.basename(CFG_REL) + '=' + (cfgDirty === '' ? 'limpio (= HEAD)' : 'MODIFICADO: ' + cfgDirty));

function makeHarness() {
    const noop = () => {};
    const store = Object.create(null);
    const logs = [];
    const push = (lvl) => (...a) => { logs.push(lvl + ' ' + a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
    const fakeEl = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, appendChild: noop, setAttribute: noop, addEventListener: noop, remove: noop, value: '', textContent: '', innerHTML: '' });
    const ctx = {
        console: { log: push('log'), warn: push('warn'), error: push('error'), info: push('info'), debug: noop, group: noop, groupEnd: noop },
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
    return { ctx: ctx, store: store, logs: logs };
}

function importWith(sourceText, label) {
    const h = makeHarness();
    vm.createContext(h.ctx);
    vm.runInContext(sourceText, h.ctx, { filename: label, timeout: 60000 });
    const inst = h.ctx.APE_PROFILES_CONFIG;
    if (!inst || typeof inst.importProfiles !== 'function') throw new Error(label + ': no expone importProfiles');
    const before = Object.keys(inst.profiles || {});
    const ret = inst.importProfiles(J);
    const after = Object.keys(inst.profiles || {});
    const line = h.logs.find(l => /IMPORTADOS\s+\d+\s+perfiles/.test(l)) || '';
    const m = line.match(/IMPORTADOS\s+(\d+)\s+perfiles/);
    return { ret: ret, before: before, ids: after, log: line.trim(), reported: m ? Number(m[1]) : null, store: h.store, logs: h.logs, inst: inst };
}

let preSrc = null, preWhy = null;
try {
    preSrc = execFileSync('git', ['show', PRE_FIX_COMMIT + ':' + CFG_REL], { cwd: REPO, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
} catch (e) {
    preWhy = 'git show ' + PRE_FIX_COMMIT + ':' + CFG_REL + ' → ' + String(e.message).split('\n')[0];
}

const HALF = ['P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'];
const BASE = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

let preIds = null;
if (preSrc === null) {
    skipWithReason('demostración ANTES (' + PRE_FIX_COMMIT + ')', preWhy + ' (sin blob histórico no se simula: no se inventa la cifra de 6)');
} else {
    const pre = importWith(preSrc, 'ape-profiles-config@' + PRE_FIX_COMMIT);
    preIds = pre.ids;
    console.log('      ANTES: ids=' + pre.ids.length + ' [' + pre.ids.join(',') + ']  log="' + pre.log + '"');
    check(pre.ret === true, 'ANTES importProfiles() devolvía true (la pérdida era SILENCIOSA)', String(pre.ret));
    check(pre.ids.length === 6, 'ANTES sólo entraban 6 perfiles', String(pre.ids.length));
    check(BASE.every(k => pre.ids.indexOf(k) >= 0), 'ANTES los P0-P5 sí entraban', pre.ids.join(','));
    check(HALF.every(k => pre.ids.indexOf(k) < 0), 'ANTES los 6 perfiles .5 se DESCARTABAN', HALF.filter(k => pre.ids.indexOf(k) >= 0).join(','));
    check(pre.reported === 6, 'ANTES el log declaraba "IMPORTADOS 6 perfiles"', String(pre.reported));
}

const now = importWith(fs.readFileSync(CFG_PATH, 'utf8'), 'ape-profiles-config@working-tree');
console.log('      AHORA: ids=' + now.ids.length + ' [' + now.ids.join(',') + ']  log="' + now.log + '"');
check(now.ret === true, 'AHORA importProfiles() devuelve true', String(now.ret));
check(now.ids.length === 12, 'AHORA entran los 12 perfiles', String(now.ids.length));
check(EXPECTED.every(k => now.ids.indexOf(k) >= 0), 'AHORA los 12 ids esperados persisten', 'faltan=' + EXPECTED.filter(k => now.ids.indexOf(k) < 0).join(','));
check(now.reported === 12, 'AHORA el log declara "IMPORTADOS 12 perfiles"', String(now.reported));
check(Object.keys(J.profiles).every(k => now.ids.indexOf(k) >= 0), 'ningún perfil del JSON queda fuera del estado importado');
check(Object.keys(now.store).length > 0, 'la importación persiste en storage', Object.keys(now.store).length + ' claves');

/* Calidad tras el import (no sólo en el JSON): estado REAL en memoria */
const sPersist = (now.inst.profiles['P0'] || {}).settings || {};
console.log('      P0 tras import: bitrate=' + sPersist.bitrate + '  bandwidth_floor=' + sPersist.bandwidth_floor + '  bitrate_floor_mbps=' + sPersist.bitrate_floor_mbps);
check(sPersist.bitrate === 200 && sPersist.bandwidth_floor === 52325000 && sPersist.bitrate_floor_mbps === 52.325,
    'P0 importado conserva 200 / 52325000 / 52.325 (sin degradar)', JSON.stringify({ b: sPersist.bitrate, f: sPersist.bandwidth_floor, m: sPersist.bitrate_floor_mbps }));
const sPersist45 = (now.inst.profiles['P4.5'] || {}).settings || {};
check(sPersist45.bitrate === 112, 'P4.5 importado conserva nominal 112', String(sPersist45.bitrate));

/* ═══════════════════ RESUMEN ═══════════════════ */
const summary = {
    passed: pass, failed: fail, skipped: skip,
    fixture: path.basename(fixture), sha256: sha,
    head: headShort, cfg_worktree: cfgDirty === '' ? 'clean' : 'modified',
    digest: { nodes: nodes.length, primitives: prims.length, lost: lostNodes.length + lostPrims.length, changed: changedPrims.length },
    before: preIds === null ? 'NO_MEDIDO' : preIds.length + '/12',
    after: now.ids.length + '/12'
};
console.log('\n' + JSON.stringify(summary));
process.exit(fail === 0 ? 0 : 1);
