/**
 * TEST — integracion generador <-> APE_SERVER_PROFILE
 *
 * Verifica que el generador CONSUMA el store del modulo y que la precedencia sea:
 *   1. options.server_profile            (store medido por el modulo)
 *   2. options.byterange_capability      (seccion del LAB, compatibilidad)
 *   3. sin dato                          (UNMEASURED)
 *
 * Y que el generador NO degrade la emision existente: los tags de rango siguen
 * apareciendo exactamente una vez por canal.
 *
 * Uso: node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/test-server-profile-integration.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GEN_PATH = process.env.APE_GEN_PATH ||
    path.join(__dirname, '..', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const SP_PATH = path.join(__dirname, '..', 'js', 'ape-v9', 'ape-server-profile.js');
const LAB_PATH = process.env.APE_LAB_JSON_PATH ||
    path.join(__dirname, '..', '..', '..', 'artifacts', 'LAB_CALIBRATED_FINAL_v24.0.0-6K.json');

let passed = 0, failed = 0;
function assert(c, m, extra) {
    if (c) { passed++; console.log('  PASS  ' + m); }
    else { failed++; console.error('  FAIL  ' + m + (extra ? '   [' + extra + ']' : '')); }
}

const HOST_A = 'http://nfqdeuxu.x1megaott.store';
const HOST_B = 'http://line.tivi-ott.net';

async function generate(spModule, serverProfile, byterangeCapability) {
    global.window = {
        location: { origin: 'http://127.0.0.1:5500' },
        HUD_TYPED_ARRAYS: { log: () => {}, init: () => {}, complete: () => {}, isAborted: () => false, updateChannel: () => {} },
        console: { ...console, warn: () => {} },
        app: { state: { activeServers: [{ url: HOST_A }, { url: HOST_B }] } },
    };
    if (spModule) global.window.APE_SERVER_PROFILE = spModule;

    global.TextEncoder = require('util').TextEncoder;
    global.TextDecoder = require('util').TextDecoder;
    global.btoa = (s) => Buffer.from(s).toString('base64');
    global.ReadableStream = require('stream/web').ReadableStream;
    global.Blob = (await import('buffer')).Blob;
    global.APE_PROFILE_MATRIX = {};

    const genPath = process.env.APE_GEN_PATH ||
        path.join(__dirname, '..', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
    let code = fs.readFileSync(genPath, 'utf8');
    code = code.replace(/^\(function\s*\(\)\s*\{/, '').replace(/\}\)\(\);$/, '');
    code = code.replace(/\blet\s+/g, 'var ').replace(/\bconst\s+/g, 'var ');
    eval(code);

    const lab = JSON.parse(fs.readFileSync(LAB_PATH, 'utf8').replace(/^\uFEFF/, ''));
    const prof = {};
    for (const [p, d] of Object.entries(lab.profiles_calibrated || {})) prof[p] = d;

    const ch = [
        { id: 'a', name: 'MEGA', url: HOST_A + '/live/2E2ETBH3/HZHXPBUD/1.m3u8', group: 'g', profile: 'P3', tvg_id: '1', tvg_logo: 'http://x/y.png' },
        { id: 'b', name: 'LINE', url: HOST_B + '/live/3JHFTC/U56BDP/115.m3u8', group: 'g', profile: 'P3', tvg_id: '115', tvg_logo: 'http://x/y.png' },
    ];
    const opts = {
        bulletproof_loaded: true, bulletproof_profiles: prof,
        bulletproof_nivel1: lab.nivel1_directives || [],
        forceProfile: 'P3', dictatorMode: true, hud: false,
    };
    if (serverProfile) opts.server_profile = serverProfile;
    if (byterangeCapability) opts.byterange_capability = byterangeCapability;

    const res = await window.M3U8TypedArraysGenerator.generate(ch, opts);
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
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  INTEGRACION generador <-> APE_SERVER_PROFILE');
    console.log('══════════════════════════════════════════════════════════════════\n');

    delete require.cache[require.resolve(SP_PATH)];
    const SP = require(SP_PATH);

    // store medido (como lo produciria profile_run.js)
    let store = SP.emptyStore();
    store = SP.upsert(store, {
        state: 'MEASURED', host: 'nfqdeuxu.x1megaott.store', measuredAt: new Date().toISOString(),
        type: 'XTREAM_HTTP', typeReason: 'path /live/', reachable: true, status: 200, latencyMs: 88,
        authOk: true, accountStatus: 'Active', maxConnections: '1',
        uaSensitive: true, refererTolerant: true, acceptRanges: null, honors206: false,
        baseUrl: HOST_A, inputHash: SP.inputHash(SP.detectShape(HOST_A), null)
    }, {});
    store = SP.upsert(store, {
        state: 'MEASURED', host: 'line.tivi-ott.net', measuredAt: new Date().toISOString(),
        type: 'XTREAM_HTTP', typeReason: 'path /live/', reachable: true, status: 401, latencyMs: 149,
        authOk: true, accountStatus: 'Active', maxConnections: '1',
        uaSensitive: false, refererTolerant: true, acceptRanges: 'bytes', honors206: false,
        baseUrl: HOST_B, inputHash: SP.inputHash(SP.detectShape(HOST_B), null)
    }, {});
    assert(Object.keys(store.servers).length === 2, 'store de prueba con 2 servidores medidos');

    // ── CASO 1: el generador consume el store del modulo ──────────────────
    console.log('  ── 1 · generador CON store del modulo ─────────────────────');
    const t1 = await generate(SP, store, null);
    const cap1 = tags(t1, /^#EXT-X-APE-RANGE-CAPABILITY:/);
    const typ1 = tags(t1, /^#EXT-X-APE-SERVER-TYPE:/);
    const ua1 = tags(t1, /^#EXT-X-APE-UA-REQUIRED:/);
    for (const c of cap1) console.log('     ' + c);
    for (const c of typ1) console.log('     ' + c);
    for (const c of ua1) console.log('     ' + c);
    assert(cap1.length === 2, 'un tag de capacidad por canal', 'hay ' + cap1.length);
    assert(cap1.some(c => /HOST=nfqdeuxu\.x1megaott\.store/.test(c)), 'la capacidad es del host de MEGA');
    assert(cap1.some(c => /HOST=line\.tivi-ott\.net/.test(c)), 'la capacidad es del host de line');
    assert(cap1.every(c => /HONORS_206=false/.test(c)), 'ambos declaran HONORS_206=false (medido)');
    assert(cap1.every(c => /EMIT_BYTERANGE=false/.test(c)), 'ninguno emite BYTERANGE');
    assert(cap1.every(c => /MODULE=APE_SERVER_PROFILE@/.test(c)), 'el tag identifica el modulo y su version');
    assert(tags(t1, /^#EXT-X-BYTERANGE:/).length === 0, 'NO se emite #EXT-X-BYTERANGE');
    assert(typ1.length === 2 && typ1.every(c => /XTREAM_HTTP/.test(c)), 'declara SERVER-TYPE=XTREAM_HTTP por canal');
    assert(ua1.length === 1 && /player/.test(ua1[0]), 'solo MEGA declara UA-REQUIRED (uaSensitive=true)', 'hay ' + ua1.length);

    // ── CASO 2: precedencia — el store gana al LAB ────────────────────────
    console.log('\n  ── 2 · precedencia: store del modulo > seccion del LAB ────');
    const labCap = { hosts: { 'nfqdeuxu.x1megaott.store': { accept_ranges_header: true, honors_range_206: true, emit_byterange: true } } };
    const t2 = await generate(SP, store, labCap);
    const cap2 = tags(t2, /^#EXT-X-APE-RANGE-CAPABILITY:/);
    assert(cap2.every(c => /HONORS_206=false/.test(c)), 'el store medido GANA al LAB que decia 206=true');
    assert(tags(t2, /^#EXT-X-BYTERANGE:/).length === 0, 'sigue sin emitir BYTERANGE (206 no medido)');

    // ── CASO 3: sin modulo cargado -> fallback al LAB ─────────────────────
    console.log('\n  ── 3 · sin modulo cargado: cae a la seccion del LAB ───────');
    const t3 = await generate(null, null, labCap);
    const cap3 = tags(t3, /^#EXT-X-APE-RANGE-CAPABILITY:/);
    assert(cap3.length === 2, 'emite capacidad por canal aun sin modulo', 'hay ' + cap3.length);
    assert(cap3.some(c => /HONORS_206=true/.test(c)), 'con el LAB diciendo 206=true lo refleja');
    assert(tags(t3, /^#EXT-X-APE-SERVER-TYPE:/).length === 0, 'sin modulo no hay SERVER-TYPE (no se inventa)');

    // ── CASO 4: sin modulo y sin LAB -> UNMEASURED ────────────────────────
    console.log('\n  ── 4 · sin modulo y sin LAB: UNMEASURED ───────────────────');
    const t4 = await generate(null, null, null);
    const cap4 = tags(t4, /^#EXT-X-APE-RANGE-CAPABILITY:/);
    assert(cap4.length === 2, 'igual emite el tag (observabilidad)', 'hay ' + cap4.length);
    assert(cap4.every(c => /STATE=UNMEASURED/.test(c)), 'declara STATE=UNMEASURED');
    assert(cap4.every(c => /EMIT_BYTERANGE=false/.test(c)), 'UNMEASURED no habilita BYTERANGE');
    assert(tags(t4, /^#EXT-X-BYTERANGE:/).length === 0, 'no emite BYTERANGE sin dato');

    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  TOTAL = ' + (passed + failed) + '   PASS = ' + passed + '   FAIL = ' + failed);
    console.log('══════════════════════════════════════════════════════════════════\n');
    process.exit(failed === 0 ? 0 : 1);
})();
