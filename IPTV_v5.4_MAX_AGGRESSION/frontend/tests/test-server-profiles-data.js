/**
 * TEST — circuito completo del store medido
 *
 * Verifica que el fichero generado (ape-server-profiles-data.js) sea consumible y
 * que el generador, alimentado con el, emita la capacidad REAL de cada servidor
 * en vez de UNMEASURED.
 *
 * Cubre lo que el operador pidio: "que la proxima lista salga con la capacidad
 * real desde el primer canal".
 *
 * Uso: node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/test-server-profiles-data.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'js', 'ape-v9', 'ape-server-profiles-data.js');
const SP_PATH = path.join(__dirname, '..', 'js', 'ape-v9', 'ape-server-profile.js');
const LAB_PATH = process.env.APE_LAB_JSON_PATH ||
    path.join(__dirname, '..', '..', '..', 'artifacts', 'LAB_CALIBRATED_FINAL_v24.0.0-6K.json');

let passed = 0, failed = 0;
function assert(c, m, extra) {
    if (c) { passed++; console.log('  PASS  ' + m); }
    else { failed++; console.error('  FAIL  ' + m + (extra ? '   [' + extra + ']' : '')); }
}

(async () => {
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  CIRCUITO COMPLETO: data.js -> controller -> generador');
    console.log('══════════════════════════════════════════════════════════════════\n');

    // ── 1. el fichero de datos existe y es consumible ────────────────────
    console.log('  ── 1 · ape-server-profiles-data.js ────────────────────────');
    assert(fs.existsSync(DATA_PATH), 'el fichero de datos existe');
    const store = require(DATA_PATH);
    assert(store && store.servers && Object.keys(store.servers).length > 0,
        'expone un store con servidores', store ? Object.keys(store.servers || {}).length : 0);
    assert(typeof store.moduleVersion === 'string', 'lleva moduleVersion (auditable)');

    const src = fs.readFileSync(DATA_PATH, 'utf8');
    assert(/NO EDITAR A MANO/.test(src), 'el fichero se declara generado');
    assert(/Medido desde: \d{4}-\d\d-\d\dT/.test(src), 'lleva la fecha de medicion (snapshot auditable)');
    assert(/TTL/.test(src), 'declara el TTL');

    const hosts = Object.keys(store.servers).map(k => store.servers[k].host);
    console.log('     servidores: ' + hosts.join(', '));
    assert(hosts.length >= 2, 'al menos los dos servidores reales', hosts.length);

    for (const [k, v] of Object.entries(store.servers)) {
        assert(v.state === 'MEASURED', k + ' esta MEASURED');
        assert(v.honors206 !== undefined, k + ' tiene honors206 declarado (' + v.honors206 + ')');
        assert(typeof v.uaSensitive === 'boolean', k + ' tiene uaSensitive medido (' + v.uaSensitive + ')');
        assert(v.authOk !== null && v.authOk !== undefined, k + ' tiene authOk medido (' + v.authOk + ')');
    }

    // ── 2. el generador lo consume y NO cae a UNMEASURED ────────────────
    console.log('\n  ── 2 · el generador emite capacidad REAL ──────────────────');
    delete require.cache[require.resolve(SP_PATH)];
    const SP = require(SP_PATH);

    const lab = JSON.parse(fs.readFileSync(LAB_PATH, 'utf8').replace(/^\uFEFF/, ''));
    const prof = {};
    for (const [p, d] of Object.entries(lab.profiles_calibrated || {})) prof[p] = d;

    const ch = hosts.map((h, i) => ({
        id: 'c' + i, name: h, url: 'http://' + h + '/live/u/p/' + (i + 1) + '.m3u8',
        group: 'g', profile: 'P3', tvg_id: String(i + 1), tvg_logo: 'http://x/y.png',
    }));

    global.window = {
        location: { origin: 'http://127.0.0.1:5500' },
        HUD_TYPED_ARRAYS: { log: () => {}, init: () => {}, complete: () => {}, isAborted: () => false, updateChannel: () => {} },
        console: { ...console, warn: () => {} },
        app: { state: { activeServers: hosts.map(h => ({ url: 'http://' + h })) } },
        APE_SERVER_PROFILE: SP,
        APE_SERVER_PROFILES_STORE: store,
    };
    global.TextEncoder = require('util').TextEncoder;
    global.TextDecoder = require('util').TextDecoder;
    global.btoa = (s) => Buffer.from(s).toString('base64');
    global.ReadableStream = require('stream/web').ReadableStream;
    global.Blob = (await import('buffer')).Blob;
    global.APE_PROFILE_MATRIX = {};

    let code = fs.readFileSync(path.join(__dirname, '..', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js'), 'utf8');
    code = code.replace(/^\(function\s*\(\)\s*\{/, '').replace(/\}\)\(\);$/, '');
    code = code.replace(/\blet\s+/g, 'var ').replace(/\bconst\s+/g, 'var ');
    eval(code);

    const res = await window.M3U8TypedArraysGenerator.generate(ch, {
        bulletproof_loaded: true, bulletproof_profiles: prof,
        bulletproof_nivel1: lab.nivel1_directives || [],
        forceProfile: 'P3', dictatorMode: true, hud: false,
        server_profile: store,
    });
    let txt = '';
    if (res instanceof Blob) txt = await res.text();
    else if (typeof res === 'string') txt = res;
    else if (res && typeof res.getReader === 'function') {
        const rd = res.getReader(); const dec = new TextDecoder();
        for (;;) { const { done, value } = await rd.read(); if (done) break; txt += dec.decode(value, { stream: true }); }
    }

    const cap = txt.split(/\r?\n/).map(s => s.trim()).filter(s => /^#EXT-X-APE-RANGE-CAPABILITY:/.test(s));
    const typ = txt.split(/\r?\n/).map(s => s.trim()).filter(s => /^#EXT-X-APE-SERVER-TYPE:/.test(s));
    for (const c of cap) console.log('     ' + c);

    assert(cap.length === hosts.length, 'un tag de capacidad por canal', cap.length);
    assert(cap.every(c => !/STATE=UNMEASURED/.test(c)),
        'NINGUN canal queda UNMEASURED (hay medicion real)',
        cap.filter(c => /UNMEASURED/.test(c)).length + ' sin medir');
    assert(cap.every(c => /STATE=MEASURED/.test(c)), 'todos declaran MEASURED-*');
    assert(cap.every(c => /MODULE=APE_SERVER_PROFILE@/.test(c)), 'todos citan el modulo y la version');
    assert(typ.length === hosts.length && typ.every(c => /XTREAM_HTTP/.test(c)),
        'todos clasificados XTREAM_HTTP', typ.length);

    // el dato de line: declara Accept-Ranges y no lo honra -> ACCEPT_RANGES=true y HONORS_206=false
    const lineCap = cap.find(c => /HOST=line\.tivi-ott\.net/.test(c));
    assert(lineCap && /ACCEPT_RANGES=true/.test(lineCap) && /HONORS_206=false/.test(lineCap),
        'line: declara Accept-Ranges pero HONORS_206=false (la medicion lo distingue)', lineCap || 'no');
    const megaCap = cap.find(c => /HOST=nfqdeuxu\.x1megaott\.store/.test(c));
    assert(megaCap && /ACCEPT_RANGES=unknown/.test(megaCap),
        'MEGA: ACCEPT_RANGES=unknown (no lo declara) en vez de false inventado', megaCap || 'no');

    assert(txt.split(/\r?\n/).filter(s => /^#EXT-X-BYTERANGE:/.test(s)).length === 0,
        'no emite BYTERANGE (ningun origen honra 206)');

    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  TOTAL = ' + (passed + failed) + '   PASS = ' + passed + '   FAIL = ' + failed);
    console.log('══════════════════════════════════════════════════════════════════\n');
    process.exit(failed === 0 ? 0 : 1);
})();
