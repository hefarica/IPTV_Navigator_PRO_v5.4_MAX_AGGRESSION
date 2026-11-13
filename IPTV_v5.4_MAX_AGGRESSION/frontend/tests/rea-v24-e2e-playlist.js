#!/usr/bin/env node
'use strict';

// [2026-11-08] E2E de la playlist: tres REGÍMENES, porque el generador no se comporta igual en todos.
//
//   A · legacy (sin finalizador REA)
//       El bloque 6K lleva los valores derivados del LAB importado:
//       PROVENANCE=LAB, SOURCE=<fuente real del perfil base>, DECLARED_ENHANCEMENT.
//
//   B · REA activo, sin opt-in de 6K (APE_6K=false)
//       El finalizador TOMA PRECEDENCIA y se niega a afirmar lo no medido:
//       NOT_REQUESTED, SOURCE=unknown, BITRATE=UNKNOWN;MEASURE_AT_RUNTIME=1,
//       REQUESTED_ENHANCEMENT.  Es MAS honesto que A, no una regresion.
//
//   C · REA activo con opt-in (APE_6K=true)
//       Declara la peticion (REQUESTED;RES=<objetivo>) sin afirmar ejecucion.
//
// Hallazgo de esta prueba: la capa REA SUPERSEDE las declaraciones 6K. Por eso la lista real
// (pre-parche, sin REA) muestra OPT-IN-ACTIVE con valores fijos, y una lista REA mostraria
// NOT_REQUESTED con medicion en runtime. Son dos regimenes distintos, no un drift.
//
// Entradas reales: LAB v24 del operador (LABV24), bundle de recetas y finalizador reales.
// Salida: docs/audits/playlist_rea_v24_sample.m3u8 (regimen B, el mas estricto).
//
// Uso:  set LABV24=<ruta al LAB_CALIBRATED_FINAL_v24.0.0-6K.json>  &&  node rea-v24-e2e-playlist.js

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
const FINALIZER = path.join(FRONT, 'js/ape-v9/rea-export-finalizer.js');
const POLICYMOD = path.join(FRONT, 'js/ape-v9/rea-processing-policy.js');
const HASH_V24 = '14ee67b55fc50fd8ccc607ff74a9870ec21327626d0028a7ce1629313d8507ac';

if (!LABV24 || !fs.existsSync(LABV24)) {
    console.error('FALTA LABV24: exporta la ruta al LAB_CALIBRATED_FINAL_v24.0.0-6K.json');
    process.exit(2);
}

const quiet = { log() {}, warn() {}, error() {}, debug() {}, info() {}, table() {}, group() {}, groupCollapsed() {}, groupEnd() {}, time() {}, timeEnd() {} };
const LAB = JSON.parse(fs.readFileSync(LABV24, 'utf8'));
const POLICY = require(POLICYMOD);
const CHANNELS = [
    { id: '1', name: 'Canal FHD de prueba', url: 'https://audit.invalid/live/u/p/1.m3u8?sig=a%2Bb', profile: 'P3', group: 'Pruebas' },
    { id: '2', name: 'Canal 4K de prueba', url: 'https://audit.invalid/live/u/p/2.m3u8', profile: 'P1', group: 'Pruebas' }
];

function build({ rea = false, optIn6k = false } = {}) {
    const store = new Map();
    const blobs = new Map();
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
    if (rea) cfg.reaProcessing = POLICY.policy;
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
        APEHealthRuntime: { admittedMap: new Map(CHANNELS.map(c => ['id:' + c.id, {}])), config: {}, ensureReady: async () => {} },
        app: { getFilteredChannels: () => CHANNELS, showToast() {}, state: { currentProfile: 'P3' } },
        __APE_OUTPUT_TEST__: true,
        APE_DIRECT_MODE: true, APE_USE_JIT: false,
        APE_6K: optIn6k, APE_FAKE_UHD: false, APE_8K_DECLARE: false
    };
    if (rea) ctx.APE_REA_POLICY = POLICY;
    ctx.window = ctx; ctx.self = ctx; ctx.global = ctx;
    vm.createContext(ctx);
    if (rea) ctx.APE_REA_EXPORT = require(FINALIZER)(ctx);
    vm.runInContext(fs.readFileSync(BUNDLE, 'utf8'), ctx, { filename: 'ape-image-recipes-bundle.js' });
    vm.runInContext(fs.readFileSync(GEN, 'utf8'), ctx, { filename: 'm3u8-typed-arrays-ultimate.js' });
    return ctx;
}

async function generate(opts) {
    const ctx = build(opts);
    const st = ctx.M3U8TypedArraysGenerator.generateStream(CHANNELS);
    if (!st || typeof st.getReader !== 'function') throw new Error('generateStream no devolvio un ReadableStream');
    const rd = st.getReader(), dec = new TextDecoder();
    let body = '';
    for (;;) { const r = await rd.read(); if (r.done) break; body += typeof r.value === 'string' ? r.value : dec.decode(r.value, { stream: true }); }
    return body;
}

function report(label, checks, body) {
    let ok = 0;
    console.log('\n=== ' + label + ' (' + body.length + ' bytes) ===');
    for (const [name, pass] of checks) { console.log('  ' + (pass ? 'OK    ' : 'FALLA ') + name); if (pass) ok++; }
    return { ok, total: checks.length };
}

(async () => {
    // ── A · legacy: la capa 6K lleva los valores derivados del LAB ────────────────
    const a = await generate({ rea: false, optIn6k: false });
    const ra = report('A · legacy (sin REA)', [
        ['DNA con hash real del v24', new RegExp('#EXT-X-APE-LAB-DNA:sha256=' + HASH_V24).test(a)],
        ['CRYSTAL-6K con PROVENANCE=LAB', /#EXT-X-APE-CRYSTAL-6K:[^\n]*PROVENANCE=LAB/.test(a)],
        // [2026-11-13] ANTES esta asercion exigia SOURCE=1920x1080 — es decir, afirmaba como
        // fuente la resolucion que el LAB ASUME para el perfil base. Medido en el ONN 4K: el
        // canal entrega 1280x720 y el manifiesto declaraba 1080p. Se invertia la honestidad:
        // el test exigia la mentira. Ahora, SIN sonda, el SOURCE es UNKNOWN.
        ['SOURCE=UNKNOWN sin sonda (no asume 1080p)', /CRYSTAL-6K-MODE:EMULATED;SOURCE=UNKNOWN/.test(a)],
        ['declara SOURCE_ORIGIN=UNMEASURED', /CRYSTAL-6K-MODE:[^\n]*SOURCE_ORIGIN=UNMEASURED/.test(a)],
        ['CONSERVA el objetivo 6K RES=5760x3240', /CRYSTAL-6K:[^\n]*RES=5760x3240/.test(a)],
        ['NO declara el objetivo (5760x3240) como fuente', !/CRYSTAL-6K-MODE:EMULATED;SOURCE=5760x3240/.test(a)],
        ['TRUTH: DECLARED_ENHANCEMENT;NOT_SOURCE', /CRYSTAL-6K-TRUTH:DECLARED_ENHANCEMENT;NOT_SOURCE/.test(a)],
        ['CACHING-PRECEDENCE declarada', /#EXT-X-APE-CACHING-PRECEDENCE:PROFILE=P3;/.test(a)],
        ['VLC-FILTER-SKIPPED declarada', /#EXT-X-APE-VLC-FILTER-SKIPPED:PROFILE=P3;SKIPPED=atadenoise/.test(a)],
        ['OVERRIDE bit_depth declarado', /#EXT-X-APE-OVERRIDE:bit_depth;GOVERNS=bit_depth/.test(a)],
        ['un EXTINF y una URL por canal', (a.match(/^#EXTINF:/gm) || []).length === CHANNELS.length && a.split(/\r?\n/).filter(l => /^https?:\/\//.test(l)).length === CHANNELS.length]
    ], a);

    // ── B · REA sin opt-in: el finalizador se niega a afirmar lo no medido ────────
    const b = await generate({ rea: true, optIn6k: false });
    const rb = report('B · REA activo, APE_6K=false', [
        ['REA con la politica real', /#EXT-X-APE-REA:\{[^\n]*"policyId":"rea-adaptive-v1"/.test(b)],
        ['REA no afirma ejecucion', /#EXT-X-APE-REA:\{[^\n]*"execution":"not_verified"/.test(b)],
        ['SOURCE declarada con motivo honesto', /#EXT-X-APE-SOURCE:\{[^\n]*"reason":"no_url_bound_probe"/.test(b)],
        ['4KFALSE-TARGET-RES reescrito a DISABLED', /4KFALSE-TARGET-RES:DISABLED;USE_REA_TARGET=1/.test(b)],
        ['REALCE-SOURCE a device-unverified', /REALCE-SOURCE:device-unverified;OBS_BPS=unknown;EXECUTED=0/.test(b)],
        ['6K NOT_REQUESTED (no finge opt-in)', /CRYSTAL-6K:NOT_REQUESTED;CAPACITY_CHECK=RUNTIME;EXECUTED=0/.test(b)],
        ['6K BITRATE en UNKNOWN, medir en runtime', /CRYSTAL-6K-BITRATE:UNKNOWN;MEASURE_AT_RUNTIME=1/.test(b)],
        ['6K SOURCE=unknown (sin probe, no inventa)', /CRYSTAL-6K-MODE:NOT_REQUESTED;SOURCE=unknown/.test(b)],
        ['6K REQUESTED_ENHANCEMENT', /CRYSTAL-6K-TRUTH:REQUESTED_ENHANCEMENT;NOT_SOURCE/.test(b)]
    ], b);

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, b, 'utf8');

    // ── C · REA con opt-in: declara la peticion, no la ejecucion ─────────────────
    const c = await generate({ rea: true, optIn6k: true });
    // Sin probe, intent.targetWidth/Height = 0 y wants6k = false: el opt-in NO puede
    // convertir en peticion lo que no tiene evidencia de fuente. Se prueba ESE comportamiento,
    // no el que exigiria inyectar un probe falso (seria inventar evidencia).
    const rc = report('C · REA activo, APE_6K=true (sin probe => no se inventa)', [
        ['sin evidencia el 6K queda NOT_REQUESTED', /CRYSTAL-6K:NOT_REQUESTED/.test(c)],
        ['declara CAPACITY_CHECK=RUNTIME', /CRYSTAL-6K:[^\n]*CAPACITY_CHECK=RUNTIME/.test(c)],
        ['el opt-in no se convierte en afirmacion', !/CRYSTAL-6K:REQUESTED;RES=/.test(c)],
        ['no afirma ejecucion', /CRYSTAL-6K:[^\n]*EXECUTED=0/.test(c)]
    ], c);

    const ok = ra.ok + rb.ok + rc.ok;
    const total = ra.total + rb.total + rc.total;
    console.log('\n----------------------------------------');
    console.log('A ' + ra.ok + '/' + ra.total + '   B ' + rb.ok + '/' + rb.total + '   C ' + rc.ok + '/' + rc.total);
    console.log('TOTAL ' + ok + '/' + total);
    console.log('artefacto (regimen B, el mas estricto): ' + OUT);
    process.exit(ok === total ? 0 : 1);
})();
