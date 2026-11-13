#!/usr/bin/env node
'use strict';

// [2026-11-13] GATE: el 6K EMULADO se calcula sobre la fuente MEDIDA, no sobre la que el LAB asume.
//
// DIRECTIVA DEL OPERADOR (verbatim):
//   "lo que debes mejorar es que no lo tome como 1080, pero que lo lleve a 6k emulado"
//
// Traduccion tecnica: NO se deja de declarar 6K. Se corrige la ENTRADA del calculo.
//
// EL DEFECTO MEDIDO (ONN 4K, 2026-11-13):
//   canal publicado como "beIN SPORTS NEWS UHD" y "|AR| BEIN SPORTS NEWS 4K S1"
//   lo que ENTREGA: c2.amlogic.avc.decoder · video/avc (H.264 8 bit) · 1280x720
//   lo que DECLARABA el manifiesto:
//     #EXT-X-APE-CRYSTAL-6K:...;RES=5760x3240
//     #EXT-X-APE-CRYSTAL-6K-MODE:EMULATED;SOURCE=1920x1080;TECHNIQUE=fhd_upscale_ai_sr_3x;RATIO=3.00x
//   El SOURCE salia de settings.resolution del perfil base del LAB (1920x1080) — un SUPUESTO
//   del LAB, no una medicion del canal. Y el RATIO 3.00x es 5760/1920: sobre el 720p real el
//   factor verdadero es 5760/1280 = 4.50x. Dos numeros falsos derivados de uno inventado.
//
// LO QUE ESTE GATE EXIGE:
//   1. Con sonda que mide 1280x720 -> SOURCE=1280x720 y RATIO=4.50x y SOURCE_ORIGIN=PROBED
//   2. Sin sonda                   -> SOURCE=UNKNOWN y RATIO=UNKNOWN y SOURCE_ORIGIN=UNMEASURED
//   3. En AMBOS casos: RES=5760x3240 presente (el objetivo 6K NUNCA se pierde)
//   4. En AMBOS casos: TRUTH:DECLARED_ENHANCEMENT;NOT_SOURCE presente (la honestidad se mantiene)
//   5. La sonda es un FIXTURE de prueba, etiquetado como tal. No afirma nada sobre un canal real.
//
// Uso:  set LABV24=<ruta al LAB_CALIBRATED_FINAL_v24.0.0-6K.json>  &&  node tools/quality/test_6k_source_honest.js

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const FRONT = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/frontend');
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

// Una sola base: P3 (la del canal auditado). El fixture de sonda es EXPLICITO.
// FIXTURE: 1280x720 es lo que el decodificador del ONN midio para ese canal, no una invencion.
const CHANNELS = [
    { id: '1', name: 'FIXTURE canal 720p', url: 'https://audit.invalid/live/u/p/1.m3u8', profile: 'P3', group: 'Pruebas' }
];

function build() {
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
        APE_6K: false, APE_FAKE_UHD: false, APE_8K_DECLARE: false
    };
    ctx.window = ctx; ctx.self = ctx; ctx.global = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(BUNDLE, 'utf8'), ctx, { filename: 'ape-image-recipes-bundle.js' });
    vm.runInContext(fs.readFileSync(GEN, 'utf8'), ctx, { filename: 'm3u8-typed-arrays-ultimate.js' });
    return ctx;
}

async function generate() {
    const ctx = build();
    const st = ctx.M3U8TypedArraysGenerator.generateStream(CHANNELS);
    if (!st || typeof st.getReader !== 'function') throw new Error('generateStream no devolvio un ReadableStream');
    const rd = st.getReader(), dec = new TextDecoder();
    let body = '';
    for (;;) { const r = await rd.read(); if (r.done) break; body += typeof r.value === 'string' ? r.value : dec.decode(r.value, { stream: true }); }
    return body;
}

function grab(body, tag) {
    const m = body.match(new RegExp('^' + tag + ':([^\\n]*)', 'm'));
    return m ? m[1].trim() : null;
}

let ok = 0, total = 0;
function check(name, pass, detail) {
    total++;
    if (pass) ok++;
    console.log('  ' + (pass ? 'OK    ' : 'FALLA ') + name + (detail && !pass ? '   -> ' + detail : ''));
}

(async () => {
    // ── CASO 1 · SIN sonda: no se asume 1080p, pero el 6K se sigue declarando ────────
    console.log('\n=== 1 · sin sonda (no se asume ninguna resolucion) ===');
    const sin = await generate();
    const mode1 = grab(sin, '#EXT-X-APE-CRYSTAL-6K-MODE');
    const k1 = grab(sin, '#EXT-X-APE-CRYSTAL-6K');
    check('SOURCE=UNKNOWN (no inventa 1080p)', /SOURCE=UNKNOWN/.test(mode1 || ''), mode1);
    check('RATIO=UNKNOWN', /RATIO=UNKNOWN/.test(mode1 || ''), mode1);
    check('SOURCE_ORIGIN=UNMEASURED', /SOURCE_ORIGIN=UNMEASURED/.test(mode1 || ''), mode1);
    check('CONSERVA el objetivo 6K RES=5760x3240', /RES=5760x3240/.test(k1 || ''), k1);
    check('CONSERVA TRUTH:NOT_SOURCE', /NOT_SOURCE/.test(grab(sin, '#EXT-X-APE-CRYSTAL-6K-TRUTH') || ''));

    // ── CASO 2 · CON sonda que mide 1280x720: SOURCE real + RATIO recalculado ────────
    // Aqui se INYECTA la sonda. Es un fixture de prueba, declarado: reproduce lo que el
    // decodificador del ONN midio para el canal auditado.
    console.log('\n=== 2 · sonda FIXTURE 1280x720 (lo que el ONN midio de verdad) ===');
    CHANNELS[0]._probeData = { resolution: '1280x720', source: 'FIXTURE' };
    const con = await generate();
    const mode2 = grab(con, '#EXT-X-APE-CRYSTAL-6K-MODE');
    const k2 = grab(con, '#EXT-X-APE-CRYSTAL-6K');
    check('SOURCE=1280x720 (la fuente REAL)', /SOURCE=1280x720/.test(mode2 || ''), mode2);
    check('RATIO=4.50x (5760/1280, no 3.00x de 1080p)', /RATIO=4\.50x/.test(mode2 || ''), mode2);
    check('SOURCE_ORIGIN=PROBED', /SOURCE_ORIGIN=PROBED/.test(mode2 || ''), mode2);
    check('CONSERVA el objetivo 6K RES=5760x3240', /RES=5760x3240/.test(k2 || ''), k2);
    check('CONSERVA TRUTH:NOT_SOURCE (sigue siendo enhancement)', /NOT_SOURCE/.test(grab(con, '#EXT-X-APE-CRYSTAL-6K-TRUTH') || ''));
    check('NO declara el objetivo como fuente', !/SOURCE=5760x3240/.test(con), 'declaro 5760 como SOURCE');

    // ── CASO 3 · sonda con resolucion basura: no se acepta ─────────────────────────
    console.log('\n=== 3 · sonda con resolucion malformada -> UNKNOWN, no se propaga basura ===');
    CHANNELS[0]._probeData = { resolution: 'no-es-resolucion' };
    const malo = await generate();
    const mode3 = grab(malo, '#EXT-X-APE-CRYSTAL-6K-MODE');
    check('rechaza la resolucion malformada', /SOURCE=UNKNOWN/.test(mode3 || ''), mode3);
    check('sigue declarando 6K', /RES=5760x3240/.test(grab(malo, '#EXT-X-APE-CRYSTAL-6K') || ''));

    // ── CASO 4 · otras fuentes reales: el ratio se recalcula siempre ───────────────
    console.log('\n=== 4 · el RATIO se recalcula con la fuente que sea ===');
    const casos = [
        ['1920x1080', '3.00x'],
        ['1280x720', '4.50x'],
        ['3840x2160', '1.50x'],
        ['854x480', '6.74x']
    ];
    for (const [res, esperado] of casos) {
        CHANNELS[0]._probeData = { resolution: res };
        const b = await generate();
        const m = grab(b, '#EXT-X-APE-CRYSTAL-6K-MODE');
        check(res + ' -> RATIO=' + esperado, new RegExp('RATIO=' + esperado.replace('.', '\\.')).test(m || ''), m);
    }

    console.log('\n----------------------------------------');
    console.log('TOTAL ' + ok + '/' + total);
    process.exit(ok === total ? 0 : 1);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
