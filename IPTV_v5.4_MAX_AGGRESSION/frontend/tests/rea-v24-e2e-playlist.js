#!/usr/bin/env node
'use strict';

// [2026-11-08] Prueba END-TO-END: genera una playlist REAL con el LAB v24 importado y verifica
// sobre el resultado (no sobre el header aislado) que las cuatro declaraciones nuevas llegan.
//
// Es la respuesta a "la lista no demuestra que lo haga": aqui se demuestra.
//
// Entradas reales:
//   - LAB v24 adjunto por el operador (via LABV24 del entorno)
//   - bundle de recetas real (ape-image-recipes-bundle.js), cargado como lo hace index-v4.html:4379
//   - el generador real (m3u8-typed-arrays-ultimate.js) en un contexto vm, por generateStream
//
// Salida: docs/audits/playlist_rea_v24_sample.m3u8 (evidencia versionable; URLs audit.invalid).
//
// Uso:  set LABV24=<ruta al LAB_CALIBRATED_FINAL_v24.0.0-6K.json>  &&  node rea-v24-e2e-playlist.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONT = path.resolve(__dirname, '..');
// FRONT = <repo>/IPTV_v5.4_MAX_AGGRESSION/frontend  ->  '../..' = <repo>
const ROOT = path.resolve(FRONT, '../..');
const OUT = path.join(ROOT, 'docs/audits/playlist_rea_v24_sample.m3u8');
const LABV24 = process.env.LABV24;
const BUNDLE = path.join(FRONT, 'js/ape-v9/ape-image-recipes-bundle.js');
const GEN = path.join(FRONT, 'js/ape-v9/m3u8-typed-arrays-ultimate.js');
const HASH_V24 = '14ee67b55fc50fd8ccc607ff74a9870ec21327626d0028a7ce1629313d8507ac';

if (!LABV24 || !fs.existsSync(LABV24)) {
    console.error('FALTA LABV24: exporta la ruta al LAB_CALIBRATED_FINAL_v24.0.0-6K.json');
    process.exit(2);
}

const quiet = { log() {}, warn() {}, error() {}, debug() {}, info() {}, table() {}, group() {}, groupCollapsed() {}, groupEnd() {}, time() {}, timeEnd() {} };
const LAB = JSON.parse(fs.readFileSync(LABV24, 'utf8'));
const store = new Map();
const blobs = new Map();
const channels = [
    { id: '1', name: 'Canal FHD de prueba', url: 'https://audit.invalid/live/u/p/1.m3u8?sig=a%2Bb', profile: 'P3', group: 'Pruebas' },
    { id: '2', name: 'Canal 4K de prueba', url: 'https://audit.invalid/live/u/p/2.m3u8', profile: 'P1', group: 'Pruebas' }
];
const elements = {
    genExportFormat: { value: 'm3u8' }, gzipCompressionEnabled: { checked: false },
    'ape-out-jit': { checked: false }, 'ape-out-hdr': { value: 'auto' },
    'ape-delta-input': { value: '15' }, 'ape-gen-status': { textContent: '', style: {} }
};
class T extends URL {
    static createObjectURL(b) { const i = 'blob:t' + blobs.size; blobs.set(i, b); return i; }
    static revokeObjectURL(i) { blobs.delete(i); }
}
class A { click() {} remove() {} }
const document = {
    readyState: 'loading', getElementById: i => elements[i] || null,
    querySelector: s => s.includes('ape-out-format') ? { value: 'm3u8' } : (s === '#ape-gen-status' ? elements['ape-gen-status'] : null),
    querySelectorAll: () => [], addEventListener() {},
    createElement: n => n === 'a' ? new A() : { style: {}, appendChild() {}, addEventListener() {} },
    body: { appendChild() {}, removeChild() {} }
};
const cfg = {
    profiles: LAB.profiles_calibrated, labExportedAt: LAB.exported_at, labVersion: LAB.lab_version,
    labBulletproof: true, labDnaSha256: HASH_V24,
    labFileName: 'LAB_CALIBRATED_FINAL_v24.0.0-6K.json', labEmulated6k: LAB.emulated_6k || null,
    getProfile: function (id) { return this.profiles[id] || null; }
};
const ctx = {
    console: quiet, document, HTMLAnchorElement: A, URL: T, URLSearchParams,
    TextEncoder, TextDecoder, ReadableStream, WritableStream, TransformStream, CompressionStream,
    Blob, Response, AbortController, performance,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: (f, m) => m >= 1000 ? 0 : setTimeout(f, m), clearTimeout,
    setInterval: () => 0, clearInterval() {}, dispatchEvent() {}, addEventListener() {},
    CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; },
    localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    fetch: async u => (String(u).startsWith('blob:') ? { blob: async () => blobs.get(u) } : { ok: false, status: 503, json: async () => ({}) }),
    APE_PROFILES_CONFIG: cfg,
    APEHealthRuntime: { admittedMap: new Map(channels.map(c => ['id:' + c.id, {}])), config: {}, ensureReady: async () => {} },
    app: { getFilteredChannels: () => channels, showToast() {}, state: { currentProfile: 'P3' } },
    __APE_OUTPUT_TEST__: true,
    APE_DIRECT_MODE: true, APE_USE_JIT: false, APE_6K: false, APE_FAKE_UHD: false, APE_8K_DECLARE: false
};
ctx.window = ctx; ctx.self = ctx; ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(BUNDLE, 'utf8'), ctx, { filename: 'ape-image-recipes-bundle.js' });
vm.runInContext(fs.readFileSync(GEN, 'utf8'), ctx, { filename: 'm3u8-typed-arrays-ultimate.js' });
const G = ctx.M3U8TypedArraysGenerator;

(async () => {
    let body = '';
    const st = G.generateStream(channels);
    assert.ok(st && typeof st.getReader === 'function', 'generateStream debe devolver un ReadableStream');
    const rd = st.getReader(), dec = new TextDecoder();
    for (;;) { const r = await rd.read(); if (r.done) break; body += typeof r.value === 'string' ? r.value : dec.decode(r.value, { stream: true }); }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, body, 'utf8');

    const extinf = (body.match(/^#EXTINF:/gm) || []).length;
    const uris = body.split(/\r?\n/).filter(l => /^https?:\/\//.test(l)).length;

    const checks = [
        ['DNA con hash real del v24', new RegExp('#EXT-X-APE-LAB-DNA:sha256=' + HASH_V24).test(body)],
        ['CRYSTAL-6K con PROVENANCE=LAB', /#EXT-X-APE-CRYSTAL-6K:[^\n]*PROVENANCE=LAB/.test(body)],
        ['SOURCE = fuente real (1920x1080), no el objetivo', /CRYSTAL-6K-MODE:EMULATED;SOURCE=1920x1080/.test(body) && !/CRYSTAL-6K-MODE:EMULATED;SOURCE=5760x3240/.test(body)],
        ['TRUTH:NOT_SOURCE', /CRYSTAL-6K-TRUTH:DECLARED_ENHANCEMENT;NOT_SOURCE/.test(body)],
        ['CACHING-PRECEDENCE declarada', /#EXT-X-APE-CACHING-PRECEDENCE:PROFILE=P3;/.test(body)],
        ['VLC-FILTER-SKIPPED declarada', /#EXT-X-APE-VLC-FILTER-SKIPPED:PROFILE=P3;SKIPPED=atadenoise/.test(body)],
        ['OVERRIDE bit_depth declarado', /#EXT-X-APE-OVERRIDE:bit_depth;GOVERNS=bit_depth/.test(body)],
        ['un canal por EXTINF y una URL por canal', extinf === channels.length && uris === channels.length]
    ];

    let ok = 0;
    console.log('bytes: ' + body.length + ' | #EXTINF: ' + extinf + ' | URIs: ' + uris + '\n');
    for (const [name, pass] of checks) { console.log('  ' + (pass ? 'OK    ' : 'FALLA ') + name); if (pass) ok++; }
    console.log('\n' + ok + '/' + checks.length + ' comprobaciones  ->  ' + OUT);
    process.exit(ok === checks.length ? 0 : 1);
})();
