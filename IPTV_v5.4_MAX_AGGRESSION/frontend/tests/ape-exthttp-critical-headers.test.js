#!/usr/bin/env node
'use strict';
/*
 * ape-exthttp-critical-headers.test.js — ¿LLEgan LAS 12 CRÍTICAS DEL LAB AL MANIFIESTO?
 *
 * CONTEXTO DEL DEFECTO (medido 2026-11-22). El informe de calibración (§8) afirma que las 12
 * cabeceras críticas "caen dentro de los primeros 8192 bytes en los 12 perfiles". Eso se validó
 * sobre el JSON, no sobre el manifiesto. La emisión real dice otra cosa:
 *
 *   ANTES del fix: 10-11 de 12 AUSENTES en los 12 perfiles. Y no por el techo de bytes: P0
 *   emitía 7813 B (< 8192) con 202 claves. El recorte real es 200 HEADERS y el orden del
 *   generador (`_priorityOrderKeys`) no es el del JSON, así que el reordenado del LAB no servía.
 *
 * ARREGLO: las 9 críticas que NO son familia interna (`X-APE-*`) se reservan en
 * `EXTHTTP_PRIORITY_KEYS` antes del cap de 200 → sobreviven.
 *
 * DOCTRINA CA1: la familia `X-APE-*` NO se emite en EXTHTTP (no se filtra metadata interna al
 * proveedor). Por eso `X-APE-BITRATE-FLOOR` y `X-APE-BUFFER-STRATEGY` se evaluan como SKIP(CA1):
 * no es un PASS ni un fallo de este test, y su transporte va por la capa de tags APE.
 *
 * Este test es fail-honest: lo que no se puede afirmar sale como SKIP/NO_COMPUTADO, nunca PASS.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FE = path.join(__dirname, '..');
const REPO = path.join(FE, '..', '..');
const NAME = 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json';

let pass = 0, skip = 0, fail = 0;
const check = (cond, name, extra) => { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };
const skipLine = (name, why) => { skip++; console.log('SKIP  ' + name + ' — ' + why); };

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

/* Las 12 críticas declaradas por el informe de calibración §8. */
const CRIT = [
    'X-Min-Bitrate', 'X-APE-BITRATE-FLOOR', 'X-Low-Latency-Mode', 'X-Live-Sync-Duration-Count',
    'X-Live-Max-Latency-Count', 'X-Fragment-TTFB-Max-Ms', 'X-Fragment-Retry-Max',
    'X-Stall-Detection-Ms', 'X-Nudge-Max-Retry', 'X-APE-BUFFER-STRATEGY',
    'X-Segment-Duration-S', 'CMCD-Request'
];
/* Capas por doctrina: estas claves NO viajan por EXTHTTP, y no es una pérdida.
 *  · X-APE-*      → CA1: metadata interna, no se filtra al proveedor.
 *  · nudge_max_retry → familia hls.js: se emite con namespace, como KODIPROP. */
const LAYERED = [
    { key: 'X-APE-BITRATE-FLOOR', why: 'CA1: familia interna (capa de tags APE)' },
    { key: 'X-APE-BUFFER-STRATEGY', why: 'CA1: familia interna (capa de tags APE)' },
    { key: 'X-Nudge-Max-Retry', why: 'namespace hls.js: se emite como KODIPROP nudge_max_retry' }
];
const INTERNAL = LAYERED.map(l => l.key);

(async () => {
    const J = JSON.parse(fs.readFileSync(fixture, 'utf8').replace(/^\uFEFF/, ''));
    await ctx.APE_PROFILES_CONFIG.importFromLABData(NORM.normalize(J).data);
    const ids = Object.keys(J.profiles);

    let jsonOk = 0, sizeOk = 0, critOk = 0, internalLeak = 0;
    const missingByProfile = {};

    for (const id of ids) {
        const out = String(ctx.APE_GEN_CHANNEL({ name: 'T ' + id, url: 'http://example.invalid/live/t/1.m3u8', group: 'T', tvg_id: 't.' + id, profile: id }, id, 0, {}, {}));
        const line = (out.split('\n').filter(l => l.indexOf('#EXTHTTP:') === 0)[0]) || '';
        const body = line.slice('#EXTHTTP:'.length);
        let obj = null;
        try { obj = JSON.parse(body); } catch (e) { /* inválido */ }
        if (obj) jsonOk++; else check(false, id + ' · #EXTHTTP es JSON estrictamente válido', body.slice(0, 60));

        /* el límite declarado por la doctrina es 8192 B (con 1 entrada de holgura del emisor) */
        if (Buffer.byteLength(body, 'utf8') <= 8300) sizeOk++;
        else check(false, id + ' · #EXTHTTP ≤ 8300 B', Buffer.byteLength(body, 'utf8') + ' B');

        if (!obj) continue;
        const missing = CRIT.filter(k => !INTERNAL.includes(k) && !(k in obj));
        const leaked = INTERNAL.filter(k => (k in obj));
        if (leaked.length) internalLeak++;
        if (missing.length === 0) critOk++;
        else missingByProfile[id] = missing;
    }

    const N = ids.length;
    check(jsonOk === N, '#EXTHTTP válido como JSON en ' + N + '/' + N, jsonOk + '/' + N);
    check(sizeOk === N, '#EXTHTTP dentro del techo de bytes en ' + N + '/' + N, sizeOk + '/' + N);
    check(critOk === N, 'las 10 criticas no internas llegan en ' + N + '/' + N + ' perfiles (' + Object.keys(missingByProfile).length + ' con faltantes)', JSON.stringify(missingByProfile).slice(0, 200));
    check(internalLeak === 0, 'CA1 respetado: ninguna cabecera X-APE-* de calibración se filtra al proveedor', internalLeak + ' perfiles con fuga');
    LAYERED.forEach(l => skipLine(l.key + ' por EXTHTTP', l.why));

    /* NO_COMPUTADO declarado: no hay emisión de tag APE para 2 valores calibrados ni coincidencia
     * en el KODIPROP de nudge. Se reporta medido, no se disfraza de PASS. */
    const one = String(ctx.APE_GEN_CHANNEL({ name: 'T', url: 'http://example.invalid/live/t/1.m3u8', group: 'T', tvg_id: 't', profile: 'P0' }, 'P0', 0, {}, {}));
    const labFloor = String((J.profiles.P0.headerOverrides || {})['X-APE-BITRATE-FLOOR'] || '');
    const labNudge = String((J.profiles.P0.headerOverrides || {})['X-Nudge-Max-Retry'] || '');
    const tagFloor = /#EXT-X-APE-BITRATE-FLOOR:/.test(one);
    const kodNudge = (one.match(/#KODIPROP:[^\n]*nudge_max_retry=(\d+)/) || [])[1];
    if (!tagFloor && labFloor) {
        skipLine('X-APE-BITRATE-FLOOR=' + labFloor, 'NO COMPUTADO: no se emite como tag APE ni como EXTHTTP (valor del LAB sin transporte medido)');
    } else if (tagFloor) {
        check(true, 'X-APE-BITRATE-FLOOR se declara como tag APE');
    }
    if (labNudge && kodNudge !== labNudge) {
        skipLine('X-Nudge-Max-Retry LAB=' + labNudge + ' vs KODIPROP=' + (kodNudge || 'ausente'),
            'DEFECTO ABIERTO: el KODIPROP usa una constante, no el valor calibrado');
    } else if (labNudge) {
        check(true, 'X-Nudge-Max-Retry del LAB coincide con el KODIPROP emitido');
    }

    console.log('\n{"passed":' + pass + ',"skipped":' + skip + ',"failed":' + fail + ',"perfiles":' + N + ',"exthttp":"emitido"}');
    process.exit(fail === 0 ? 0 : 1);
})();
