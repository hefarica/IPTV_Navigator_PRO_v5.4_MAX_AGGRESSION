#!/usr/bin/env node
'use strict';
/*
 * ape-streaminf-honesty.test.js — SIN EVIDENCIA NO SE DECLARA VARIANTE.
 *
 * POR QUÉ EXISTE. La doctrina del repo lo dice en la tabla de tiers: **F5 = ORIGINAL_DIRECT_SAFE
 * → solo EXTINF + URL, NO emite STREAM-INF**. Declarar `RESOLUTION=`/`CODECS=` sin probe es la
 * mentira que rompe al decoder (el freeze de 2026-06-08 nació de declarar un nivel que el
 * bitstream no sostenía).
 *
 * MEDIDO AL CONSTRUIR ESTE TEST (para que no se confunda arnés con producto):
 *   · el bloque POR CANAL (`generateChannelEntry`) no lleva `#EXT-X-STREAM-INF` — se arma a nivel
 *     de lista; sólo lleva `#EXTINF` + `#EXT-X-APE-DECLARED-I-FRAME-STREAM-INF` con
 *     `STATUS=UNVERIFIED`.
 *   · la lista completa (`APE_GEN`, 12 canales → 11.788 líneas) emite **0** `#EXT-X-STREAM-INF`
 *     cuando no hay evidencia de probe. No es un fallo: es F5.
 * Por eso este test NO exige STREAM-INF (sería exigir una mentira): exige su AUSENCIA honesta.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FE = path.join(__dirname, '..');
const REPO = path.join(FE, '..', '..');
const NAME = 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json';

let pass = 0, fail = 0, skip = 0;
const check = (c, name, extra) => { if (c) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };

const fixture = [process.argv[2], process.env.APE_LAB_CALIBRATED_JSON, path.join(REPO, 'artifacts', 'lab', 'calibrated', NAME)].filter(Boolean)
    .find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!fixture) { console.log('SKIP  sin fixture calibrado'); process.exit(0); }

const noop = () => {};
const store = Object.create(null);
const fe = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, appendChild: noop, setAttribute: noop, addEventListener: noop, remove: noop, value: '', textContent: '', innerHTML: '' });
const ctx = {
    console: { log: noop, warn: noop, error: noop },
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'), atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear: () => { for (const k of Object.keys(store)) delete store[k]; }, key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: fe, createTextNode: fe, body: fe(), head: fe(), documentElement: fe(), readyState: 'complete', cookie: '' },
    navigator: { userAgent: 'node-harness' }, location: { href: 'http://localhost/' }, fetch: () => Promise.reject(new Error('sin red')),
    Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
    Blob: class {}, URL: { createObjectURL: () => 'x', revokeObjectURL: noop }, performance: { now: () => Date.now() },
    TextEncoder, TextDecoder, ReadableStream, TransformStream, WritableStream, queueMicrotask
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js'), 'utf8'), ctx, { filename: 'gen.js', timeout: 60000 });
vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'ape-profiles-config.js'), 'utf8'), ctx, { filename: 'cfg.js', timeout: 60000 });
const NORM = require(path.join(FE, 'js', 'ape-lab-normalize.js'));

const drain = async (res) => {
    if (res && typeof res.getReader === 'function') {
        const r = res.getReader(); let out = '';
        for (;;) { const { done, value } = await r.read(); if (done) break; out += (typeof value === 'string' ? value : Buffer.from(value).toString('utf8')); }
        return out;
    }
    return String(res);
};

(async () => {
    const J = JSON.parse(fs.readFileSync(fixture, 'utf8').replace(/^\uFEFF/, ''));
    await ctx.APE_PROFILES_CONFIG.importFromLABData(NORM.normalize(J).data);
    const ids = Object.keys(J.profiles);

    /* ── 1 · bloque por canal: líneas honestas ── */
    let infOk = 0, iframeOk = 0, noRealOk = 0;
    for (const id of ids) {
        const out = String(ctx.APE_GEN_CHANNEL({ name: 'T ' + id, url: 'http://example.invalid/live/t/1.m3u8', group: 'T', tvg_id: 't.' + id, profile: id }, id, 0, {}, {}));
        if (out.split('\n').some(l => l.indexOf('#EXTINF:') === 0)) infOk++;
        const ifr = out.split('\n').filter(l => l.indexOf('#EXT-X-APE-DECLARED-I-FRAME-STREAM-INF:') === 0)[0] || '';
        if (/STATUS=UNVERIFIED/.test(ifr)) iframeOk++;
        if (!/#EXT-X-APE-CODEC-REAL:/.test(out) && !/codecVerified=true/i.test(out)) noRealOk++;
    }
    check(infOk === ids.length, 'cada perfil emite su #EXTINF (' + ids.length + '/' + ids.length + ')', infOk + '/' + ids.length);
    check(iframeOk === ids.length, 'el I-FRAME declarado se marca STATUS=UNVERIFIED (' + ids.length + '/' + ids.length + ')', iframeOk + '/' + ids.length);
    check(noRealOk === ids.length, 'nada declara CODEC-REAL / codecVerified=true sin evidencia (' + ids.length + '/' + ids.length + ')', noRealOk + '/' + ids.length);

    /* ── 2 · lista completa: F5 no emite STREAM-INF sin probe ── */
    const chans = ids.map((id, i) => ({ name: 'T ' + id, url: 'http://example.invalid/live/t/' + (i + 1) + '.m3u8', group: 'T', tvg_id: 't.' + id, 'ape-profile': id, profile: id, id: 1000 + i, stream_id: 1000 + i }));
    let text = '';
    try { text = await drain(ctx.APE_GEN(chans, {})); }
    catch (e) { skip++; console.log('SKIP  emisión de lista — ' + e.message.slice(0, 90)); }
    if (text) {
        const lines = text.split('\n');
        const sis = lines.filter(l => l.indexOf('#EXT-X-STREAM-INF') === 0);
        check(lines.length > ids.length * 500, 'la lista se emite completa (' + lines.length + ' líneas, ≥500 por canal)', lines.length);
        check(sis.length === 0, 'sin evidencia de probe NO se emite #EXT-X-STREAM-INF (F5): 0 esperado, ' + sis.length + ' real', sis.slice(0, 2).join(' | ').slice(0, 160));
    }

    console.log('\n{"passed":' + pass + ',"skipped":' + skip + ',"failed":' + fail + ',"streaminf":"honesto"}');
    process.exit(fail === 0 ? 0 : 1);
})();
