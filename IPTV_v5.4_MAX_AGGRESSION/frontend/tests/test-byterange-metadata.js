/**
 * TEST — capa byte-range (206) via metadata JSON
 *
 * Mandato del operador: aplicar el 206 via JSON metadata, no servir segmentos
 * completos a ciegas. La verdad medida es que NINGUNO de los dos origenes honra
 * Range, asi que el generador debe:
 *
 *   A) LEER la capacidad del LAB (byterange_capability) y emitirla como metadata
 *      por canal: #EXT-X-APE-RANGE-CAPABILITY + #EXT-X-APE-RANGE-MODE.
 *   B) NO emitir #EXT-X-BYTERANGE cuando honors_range_206 es false (rompe hls.js
 *      y ExoPlayer).
 *   C) SI emitirlo cuando honors_range_206 es true (para que el dia que el borde
 *      lo soporte, se active solo cambiando el LAB, sin tocar codigo).
 *   D) Sin dato (UNMEASURED) tampoco emite BYTERANGE.
 *
 * Uso: node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/test-byterange-metadata.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GEN_PATH = process.env.APE_GEN_PATH ||
    path.join(__dirname, '..', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const LAB_PATH = process.env.APE_LAB_JSON_PATH ||
    path.join(__dirname, '..', '..', '..', 'artifacts', 'LAB_CALIBRATED_FINAL_v24.0.0-6K.json');

let passed = 0, failed = 0;
function assert(c, m, extra) {
    if (c) { passed++; console.log('  PASS  ' + m); }
    else { failed++; console.error('  FAIL  ' + m + (extra ? '   [' + extra + ']' : '')); }
}

const HOST = 'http://nfqdeuxu.x1megaott.store';
const CH = [{ id: 'a', name: 'T', url: HOST + '/live/2E2ETBH3/HZHXPBUD/1.m3u8', group: 'g', profile: 'P3', tvg_id: '1', tvg_logo: 'http://x/y.png' }];

async function gen(capability) {
    global.window = {
        location: { origin: 'http://127.0.0.1:5500' },
        HUD_TYPED_ARRAYS: { log: () => {}, init: () => {}, complete: () => {}, isAborted: () => false, updateChannel: () => {} },
        console: { ...console, warn: () => {} },
        app: { state: { activeServers: [{ url: HOST }] } },
    };
    global.TextEncoder = require('util').TextEncoder;
    global.TextDecoder = require('util').TextDecoder;
    global.btoa = (s) => Buffer.from(s).toString('base64');
    global.ReadableStream = require('stream/web').ReadableStream;
    global.Blob = (await import('buffer')).Blob;
    global.APE_PROFILE_MATRIX = {};

    let code = fs.readFileSync(GEN_PATH, 'utf8');
    code = code.replace(/^\(function\s*\(\)\s*\{/, '').replace(/\}\)\(\);$/, '');
    code = code.replace(/\blet\s+/g, 'var ').replace(/\bconst\s+/g, 'var ');
    eval(code);

    const genr = window.M3U8TypedArraysGenerator;
    const lab = JSON.parse(fs.readFileSync(LAB_PATH, 'utf8').replace(/^\uFEFF/, ''));
    const prof = {};
    for (const [p, d] of Object.entries(lab.profiles_calibrated || {})) prof[p] = d;

    const opts = {
        bulletproof_loaded: true,
        bulletproof_profiles: prof,
        bulletproof_nivel1: lab.nivel1_directives || [],
        forceProfile: 'P3',
        dictatorMode: true,
        hud: false,
        byterange_capability: capability,
    };
    const res = await genr.generate(CH, opts);
    let txt = '';
    if (res instanceof Blob) txt = await res.text();
    else if (typeof res === 'string') txt = res;
    else if (res && typeof res.getReader === 'function') {
        const rd = res.getReader(); const dec = new TextDecoder();
        for (;;) { const { done, value } = await rd.read(); if (done) break; txt += dec.decode(value, { stream: true }); }
    }
    return txt;
}

const tags = (t, re) => t.split(/\r?\n/).map(s => s.trim()).filter(s => re.test(s));

(async () => {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  BYTE-RANGE (206) VIA METADATA JSON');
    console.log('══════════════════════════════════════════════════════════════\n');

    // ── CASO 1: el LAB real (no honra 206) ───────────────────────────────
    console.log('  ── CASO 1 · capacidad REAL del LAB (honors_206=false) ──────');
    const lab = JSON.parse(fs.readFileSync(LAB_PATH, 'utf8').replace(/^\uFEFF/, ''));
    const realCap = lab.byterange_capability || null;
    assert(realCap !== null, 'el LAB trae byterange_capability');
    if (realCap) {
        assert(realCap.hosts && realCap.hosts['nfqdeuxu.x1megaott.store'] !== undefined,
            'el LAB declara el host de MEGA');
        console.log('     honors_206 = ' + JSON.stringify(realCap.hosts['nfqdeuxu.x1megaott.store'].honors_range_206));
    }

    const t1 = await gen(realCap);
    const cap1 = tags(t1, /^#EXT-X-APE-RANGE-CAPABILITY:/);
    const mode1 = tags(t1, /^#EXT-X-APE-RANGE-MODE:/);
    const br1 = tags(t1, /^#EXT-X-BYTERANGE:/);

    console.log('     ' + (cap1[0] || '(sin tag)'));
    console.log('     ' + (mode1[0] || '(sin tag)'));
    assert(cap1.length === 1, 'emite 1 #EXT-X-APE-RANGE-CAPABILITY', 'hay ' + cap1.length);
    assert(/HONORS_206=false/.test(cap1[0] || ''), 'la capability declara HONORS_206=false');
    assert(/ACCEPT_RANGES=false/.test(cap1[0] || ''), 'la capability declara ACCEPT_RANGES=false (MEGA no lo manda)');
    assert(/EMIT_BYTERANGE=false/.test(cap1[0] || ''), 'la capability declara EMIT_BYTERANGE=false');
    assert(/STATE=MEASURED-NO-206/.test(cap1[0] || ''), 'el estado es MEASURED-NO-206');
    assert(mode1.length === 1 && /FULL-OBJECT/.test(mode1[0]), 'el modo es FULL-OBJECT');
    assert(br1.length === 0, 'NO emite #EXT-X-BYTERANGE (rompe hls.js/ExoPlayer)', 'hay ' + br1.length);

    // ── CASO 2: capacidad 206 = true (el dia que el borde lo soporte) ─────
    console.log('\n  ── CASO 2 · capacidad 206=true (simula un origen que SI honra Range) ──');
    const capSi = {
        hosts: { 'nfqdeuxu.x1megaott.store': { accept_ranges_header: true, honors_range_206: true, emit_byterange: true } },
    };
    const t2 = await gen(capSi);
    const cap2 = tags(t2, /^#EXT-X-APE-RANGE-CAPABILITY:/);
    const mode2 = tags(t2, /^#EXT-X-APE-RANGE-MODE:/);
    const open2 = tags(t2, /^#EXT-X-APE-RANGE-OPEN:/);

    console.log('     ' + (cap2[0] || '(sin tag)'));
    console.log('     ' + (mode2[0] || '(sin tag)'));
    console.log('     ' + (open2[0] || '(sin tag)'));
    assert(/HONORS_206=true/.test(cap2[0] || ''), 'la capability declara HONORS_206=true');
    assert(/EMIT_BYTERANGE=true/.test(cap2[0] || ''), 'la capability declara EMIT_BYTERANGE=true');
    assert(/STATE=VERIFIED-206/.test(cap2[0] || ''), 'el estado es VERIFIED-206');
    assert(mode2.length === 1 && /BYTERANGE-ELIGIBLE/.test(mode2[0]), 'el modo es BYTERANGE-ELIGIBLE');
    assert(open2.length === 1, 'emite #EXT-X-APE-RANGE-OPEN cuando hay 206 probado');

    // ── CASO 3: sin dato ─────────────────────────────────────────────────
    console.log('\n  ── CASO 3 · sin capacidad (UNMEASURED) ─────────────────────');
    const t3 = await gen(null);
    const cap3 = tags(t3, /^#EXT-X-APE-RANGE-CAPABILITY:/);
    const br3 = tags(t3, /^#EXT-X-BYTERANGE:/);
    console.log('     ' + (cap3[0] || '(sin tag)'));
    assert(/STATE=UNMEASURED/.test(cap3[0] || ''), 'declara STATE=UNMEASURED');
    assert(/EMIT_BYTERANGE=false/.test(cap3[0] || ''), 'sin dato NO habilita BYTERANGE');
    assert(br3.length === 0, 'sin dato NO emite #EXT-X-BYTERANGE', 'hay ' + br3.length);

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  TOTAL = ' + (passed + failed) + '   PASS = ' + passed + '   FAIL = ' + failed);
    console.log('══════════════════════════════════════════════════════════════\n');
    process.exit(failed === 0 ? 0 : 1);
})();
