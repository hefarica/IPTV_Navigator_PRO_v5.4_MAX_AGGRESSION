#!/usr/bin/env node
'use strict';
/*
 * ape-exthttp-critical-headers.test.js — ¿LLEGA LA CALIBRACIÓN AL MANIFIESTO, CON SU VALOR?
 *
 * HISTORIA MEDIDA (2026-11-22). El informe de calibración (§8) afirma que las 12 cabeceras
 * críticas "caen dentro de los primeros 8192 bytes en los 12 perfiles". Se validó sobre el JSON,
 * no sobre el manifiesto. La emisión real decía:
 *   1) 10-11 de 12 AUSENTES — y no por el techo de bytes (P0 emitía 7813 B con 202 claves): el
 *      recorte real es 200 HEADERS y el orden del generador no era el del JSON.
 *   2) Las que sí llegaban traían el valor del GENERADOR, no el del LAB:
 *      X-Min-Bitrate 8 000 000 vs 52 325 000 · retry 6 vs 8 · stall 250 vs 750.
 *   3) Dos valores X-APE no viajaban en NINGUNA capa, y nudge_max_retry emitía 6 vs 10.
 *
 * ARREGLOS QUE ESTE TEST VIGILA:
 *   · las 9 críticas no internas se reservan en EXTHTTP_PRIORITY_KEYS (sobreviven al cap 200);
 *   · el valor CALIBRADO del perfil gana sobre la derivación del generador (EXTHTTP);
 *   · las 2 X-APE se declaran como tag APE (CA1 prohíbe EXTHTTP para esa familia);
 *   · nudge_max_retry usa el valor calibrado.
 *
 * TRES CAPAS, TRES LECTORES: #EXT-X-APE-* → nuestro VPS · #EXTHTTP → el player hacia el
 * proveedor · #KODIPROP/#EXTVLCOPT → el motor del player en local.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FE = path.join(__dirname, '..');
const REPO = path.join(FE, '..', '..');
const NAME = 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json';

let pass = 0, fail = 0;
const check = (c, name, extra) => { if (c) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };

const fixture = [process.argv[2], process.env.APE_LAB_CALIBRATED_JSON, path.join(REPO, 'artifacts', 'lab', 'calibrated', NAME)].filter(Boolean)
    .find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!fixture) { console.log('SKIP  sin fixture calibrado'); process.exit(0); }

const noop = () => {};
const store = Object.create(null);
const fe = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, appendChild: noop, setAttribute: noop, addEventListener: noop, remove: noop, value: '', textContent: '', innerHTML: '' });
const ctx = {
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
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js'), 'utf8'), ctx, { filename: 'gen.js', timeout: 60000 });
vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'ape-profiles-config.js'), 'utf8'), ctx, { filename: 'cfg.js', timeout: 60000 });
const NORM = require(path.join(FE, 'js', 'ape-lab-normalize.js'));

/* Claves que SÍ viajan por EXTHTTP (legales upstream) — se exige el valor del LAB. */
const IN_EXTHTTP = [
    'X-Min-Bitrate', 'X-Low-Latency-Mode', 'X-Live-Sync-Duration-Count', 'X-Live-Max-Latency-Count',
    'X-Fragment-TTFB-Max-Ms', 'X-Fragment-Retry-Max', 'X-Stall-Detection-Ms',
    'X-Segment-Duration', 'X-Segment-Duration-S', 'CMCD-Request'
];
/* Claves cuya casa NO es EXTHTTP: se vigila su capa real. */
const VIA_TAG = ['X-APE-BITRATE-FLOOR', 'X-APE-BUFFER-STRATEGY'];
const VIA_KODIPROP = 'X-Nudge-Max-Retry';

(async () => {
    const J = JSON.parse(fs.readFileSync(fixture, 'utf8').replace(/^\uFEFF/, ''));
    await ctx.APE_PROFILES_CONFIG.importFromLABData(NORM.normalize(J).data);
    const ids = Object.keys(J.profiles);
    const N = ids.length;

    let jsonOk = 0, sizeOk = 0, valuesOk = 0, ca1Ok = 0, tagOk = 0, nudgeOk = 0;
    const valueDiffs = {}, tagDiffs = {}, nudgeDiffs = {};

    for (const id of ids) {
        const out = String(ctx.APE_GEN_CHANNEL({ name: 'T ' + id, url: 'http://example.invalid/live/t/1.m3u8', group: 'T', tvg_id: 't.' + id, profile: id }, id, 0, {}, {}));
        const lab = (J.profiles[id] && J.profiles[id].headerOverrides) || {};
        const line = (out.split('\n').filter(l => l.indexOf('#EXTHTTP:') === 0)[0]) || '';
        const body = line.slice('#EXTHTTP:'.length);
        let obj = null;
        try { obj = JSON.parse(body); } catch (e) { /* inválido */ }
        if (obj) jsonOk++;
        if (Buffer.byteLength(body, 'utf8') <= 8300) sizeOk++;
        if (!obj) continue;

        /* 1 · el valor del LAB llega Y coincide */
        const bad = IN_EXTHTTP.filter(k => !(k in obj) || String(obj[k]) !== String(lab[k]));
        if (bad.length === 0) valuesOk++;
        else valueDiffs[id] = bad.map(k => k + ': app=' + String(obj[k]).slice(0, 20) + ' lab=' + String(lab[k]).slice(0, 20));

        /* 2 · CA1: ninguna X-APE-* interna filtrada al proveedor */
        const leaked = Object.keys(obj).filter(k => /^X-APE-/i.test(k)
            && !['X-APE-Profile', 'X-APE-Tier', 'X-APE-Max-Quality', 'X-APE-Codec-Cascade', 'X-APE-Channel-Id'].includes(k));
        if (leaked.length === 0) ca1Ok++;

        /* 3 · los dos X-APE calibrados viven como tag APE, con su valor, UNA vez */
        const tagBad = [];
        for (const k of VIA_TAG) {
            const want = String(lab[k] == null ? '' : lab[k]).trim();
            const hits = out.split('\n').filter(l => l.indexOf('#EXT-X-APE-' + k.replace('X-APE-', '') + ':') === 0);
            if (!want) continue;
            if (hits.length !== 1) tagBad.push(k + ' → ' + hits.length + ' ocurrencias');
            else if (hits[0].slice(hits[0].indexOf(':') + 1).trim() !== want) tagBad.push(k + ' valor≠LAB');
        }
        if (tagBad.length === 0) tagOk++; else tagDiffs[id] = tagBad;

        /* 4 · nudge_max_retry con el valor calibrado */
        const wantN = String(lab[VIA_KODIPROP] == null ? '' : lab[VIA_KODIPROP]).trim();
        const gotN = (out.match(/#KODIPROP:[^\n]*nudge_max_retry=(\d+)/) || [])[1];
        if (!wantN || gotN === wantN) nudgeOk++; else nudgeDiffs[id] = 'app=' + gotN + ' lab=' + wantN;
    }

    check(jsonOk === N, '#EXTHTTP válido como JSON en ' + N + '/' + N, jsonOk + '/' + N);
    check(sizeOk === N, '#EXTHTTP dentro del techo de bytes en ' + N + '/' + N, sizeOk + '/' + N);
    check(valuesOk === N, 'las ' + IN_EXTHTTP.length + ' criticas llegan CON EL VALOR DEL LAB en ' + N + '/' + N, JSON.stringify(valueDiffs).slice(0, 260));
    check(ca1Ok === N, 'CA1 respetado: ninguna X-APE-* interna viaja al proveedor en ' + N + '/' + N, ca1Ok + '/' + N);
    check(tagOk === N, 'los 2 X-APE calibrados se declaran como tag APE (valor del LAB, 1 sola vez) en ' + N + '/' + N, JSON.stringify(tagDiffs).slice(0, 200));
    check(nudgeOk === N, 'nudge_max_retry usa el valor calibrado en ' + N + '/' + N, JSON.stringify(nudgeDiffs).slice(0, 160));

    console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"perfiles":' + N + ',"exthttp":"valor=LAB"}');
    process.exit(fail === 0 ? 0 : 1);
})();
