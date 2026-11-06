/**
 * REGRESSION TEST — construccion de URL y pool de servidores
 *
 * Cubre dos defectos medidos en APE_LISTA_1793961926504.m3u8 (21.224 canales):
 *
 *   FIX A  El Referer del pipe se construia con encodeURIComponent(
 *          window.location.origin). Generando desde Live Server eso puso
 *          `Referer=http%3A%2F%2F127.0.0.1%3A5500` en las 21.224 URLs, encoded,
 *          asi que el player mandaba el literal. Ahora debe ser el host REAL
 *          del proveedor, sin encodear.
 *
 *   FIX B  El header declaraba SYS-SERVER-POOL-SIZE:3 con round_robin y un
 *          unico EXT-X-SERVER-1 (el nodo caido). Ahora debe declarar un
 *          SERVER-N por host real y ajustar POOL-SIZE al numero real.
 *
 * El mock de window.location.origin es DELIBERADAMENTE 127.0.0.1:5500: si el
 * fix se revierte, el test falla.
 *
 * Uso: node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/test-url-construction-regression.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GEN_PATH = process.env.APE_GEN_PATH ||
    path.join(__dirname, '..', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const LAB_CANDIDATES = [
    process.env.APE_LAB_JSON_PATH,
    path.join(__dirname, '..', '..', '..', 'artifacts', 'LAB_CALIBRATED_FINAL_v24.0.0-6K.json'),
].filter(Boolean);

let passed = 0, failed = 0;
function assert(cond, msg, extra) {
    if (cond) { passed++; console.log('  PASS  ' + msg); }
    else { failed++; console.error('  FAIL  ' + msg + (extra ? '   [' + extra + ']' : '')); }
}

const HOST_A = 'http://nfqdeuxu.x1megaott.store';
const HOST_B = 'http://line.tivi-ott.net';
const URL_A = HOST_A + '/live/2E2ETBH3/HZHXPBUD/1.m3u8';
const URL_B = HOST_B + '/live/3JHFTC/U56BDP/115.m3u8';

(async () => {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  REGRESION — construccion de URL y pool de servidores');
    console.log('══════════════════════════════════════════════════════════════\n');

    // 1) LAB
    let lab = null, labPath = null;
    for (const p of LAB_CANDIDATES) {
        if (fs.existsSync(p)) { labPath = p; break; }
    }
    if (!labPath) {
        console.error('  NO COMPUTADO: no hay LAB JSON para cargar directivas de header.');
        console.error('  Buscado en: ' + LAB_CANDIDATES.join(' | '));
        process.exit(2);
    }
    const labRaw = fs.readFileSync(labPath, 'utf8').replace(/^\uFEFF/, '');
    lab = JSON.parse(labRaw);
    console.log('  LAB: ' + path.basename(labPath) + '  (' + (Buffer.byteLength(labRaw) / 1024).toFixed(0) + ' KB)');

    const keys = Object.keys(lab);
    const hasProfiles = !!lab.profiles_calibrated;
    const nivel1 = lab.nivel1_directives || lab.nivel_1_header || lab.header_directives || [];
    console.log('  profiles_calibrated: ' + (hasProfiles ? 'si' : 'NO') + '   nivel1_directives: ' + nivel1.length + '\n');

    // 2) Mocks — el origin es el DEL BUG a proposito
    global.window = {
        location: { origin: 'http://127.0.0.1:5500' },
        HUD_TYPED_ARRAYS: { log: () => {}, init: () => {}, complete: () => {}, isAborted: () => false, updateChannel: () => {} },
        console: { ...console, warn: () => {} },
        // dos servidores reales: el pool debe declarar los dos
        app: { state: { activeServers: [{ url: HOST_B }, { url: HOST_A }] } },
    };
    global.TextEncoder = require('util').TextEncoder;
    global.TextDecoder = require('util').TextDecoder;
    global.btoa = (s) => Buffer.from(s).toString('base64');
    global.ReadableStream = require('stream/web').ReadableStream;
    global.Blob = (await import('buffer')).Blob;
    global.APE_PROFILE_MATRIX = {};

    // 3) Cargar generador (mismo patron que e2e-bulletproof-full-audit.js)
    let code = fs.readFileSync(GEN_PATH, 'utf8');
    code = code.replace(/^\(function\s*\(\)\s*\{/, '');
    code = code.replace(/\}\)\(\);$/, '');
    code = code.replace(/\blet\s+/g, 'var ');
    code = code.replace(/\bconst\s+/g, 'var ');
    try { eval(code); }
    catch (e) { console.error('  FAIL  el generador no evalua: ' + e.message); process.exit(1); }

    const gen = window.M3U8TypedArraysGenerator;
    if (!gen || typeof gen.generate !== 'function') {
        console.error('  NO COMPUTADO: M3U8TypedArraysGenerator.generate no existe'); process.exit(2);
    }
    console.log('  Generador cargado OK\n');

    // 4) Canales: uno por host
    const channels = [
        { id: 'a1', name: 'MEGA TEST', url: URL_A, group: 'T', profile: 'P3', tvg_id: '1', tvg_logo: 'http://x/y.png' },
        { id: 'b1', name: 'LINE TEST', url: URL_B, group: 'T', profile: 'P3', tvg_id: '115', tvg_logo: 'http://x/y.png' },
    ];

    const bulletproof_profiles = {};
    if (hasProfiles) for (const [pid, pd] of Object.entries(lab.profiles_calibrated)) bulletproof_profiles[pid] = pd;

    const options = {
        bulletproof_loaded: true,
        bulletproof_profiles,
        bulletproof_nivel1: nivel1,
        forceProfile: 'P3',
        dictatorMode: true,
        hud: false,
    };

    // 5) Generar
    let m3u8 = '';
    try {
        const res = await gen.generate(channels, options);
        if (res instanceof Blob) m3u8 = await res.text();
        else if (typeof res === 'string') m3u8 = res;
        else if (res && typeof res.getReader === 'function') {
            const rd = res.getReader(); const dec = new TextDecoder();
            for (;;) { const { done, value } = await rd.read(); if (done) break; m3u8 += dec.decode(value, { stream: true }); }
        } else { console.error('  FAIL  tipo de retorno desconocido: ' + typeof res); process.exit(1); }
    } catch (e) {
        console.error('  FAIL  generate() lanzo: ' + e.message);
        console.error(e.stack);
        process.exit(1);
    }

    // El nombre de salida lleva sufijo segun la fuente: antes el control contra
    // HEAD sobrescribia la salida del codigo con fix en el mismo path, y luego
    // se auditaba el fichero equivocado.
    const _tag = process.env.APE_GEN_PATH ? 'head' : 'actual';
    const outPath = path.join(__dirname, '..', '..', '..', 'tools', 'lab', 'out_regression_url_' + _tag + '.m3u8');
    try { fs.writeFileSync(outPath, m3u8, 'utf8'); } catch { /* opcional */ }
    console.log('  Salida: ' + m3u8.length + ' bytes\n');

    // 6) Extraer las URIs finales (las que llevan pipe o no)
    const uriLines = m3u8.split(/\r?\n/).map(s => s.trim()).filter(s => /^https?:\/\//i.test(s));
    console.log('  URIs emitidas: ' + uriLines.length + '\n');

    // ── FIX A: Referer del pipe ──────────────────────────────────────────
    console.log('  ── FIX A · Referer del pipe ─────────────────────────────────');
    const conLocalhost = uriLines.filter(u => /127\.0\.0\.1|localhost/i.test(u));
    assert(conLocalhost.length === 0,
        'ninguna URI contiene 127.0.0.1 ni localhost',
        conLocalhost.length + ' afectadas · ej: ' + (conLocalhost[0] || '').slice(0, 120));

    const conEncoded = uriLines.filter(u => {
        const i = u.indexOf('|');
        return i !== -1 && /%3A%2F%2F/i.test(u.slice(i));
    });
    assert(conEncoded.length === 0,
        'ningun Referer del pipe va URL-encoded',
        conEncoded.length + ' afectadas');

    // el Referer del pipe debe ser el host del proveedor de ESA uri
    let refOk = 0, refBad = [];
    for (const u of uriLines) {
        const i = u.indexOf('|');
        if (i === -1) continue;
        const url = u.slice(0, i);
        const q = u.slice(i + 1);
        const m = q.match(/(?:^|&)Referer=([^&]*)/i);
        if (!m) { refBad.push('sin Referer'); continue; }
        let host = ''; try { const x = new URL(url); host = x.protocol + '//' + x.hostname + '/'; } catch { }
        if (m[1] === host) refOk++; else refBad.push('Referer=' + m[1] + ' esperado ' + host);
    }
    assert(refOk === uriLines.length,
        'el Referer del pipe es el host REAL del proveedor en las ' + uriLines.length + ' URIs',
        refOk + ' ok / ' + refBad.length + ' mal' + (refBad[0] ? ' · ' + refBad[0] : ''));

    // ── FIX B: pool de servidores ───────────────────────────────────────
    console.log('\n  ── FIX B · pool de servidores ───────────────────────────────');
    const serverTags = m3u8.split(/\r?\n/).map(s => s.trim()).filter(s => /^#EXT-X-SERVER-\d+:/.test(s));
    const poolTag = m3u8.split(/\r?\n/).map(s => s.trim()).find(s => /^#EXT-X-SYS-SERVER-POOL-SIZE:/.test(s));

    console.log('     ' + (poolTag || '(sin POOL-SIZE)'));
    for (const t of serverTags) console.log('     ' + t);

    assert(serverTags.length === 2, 'se declaran 2 EXT-X-SERVER-N (uno por host real)', 'hay ' + serverTags.length);

    const hostsDeclarados = serverTags.map(t => t.replace(/^#EXT-X-SERVER-\d+:/, '').replace(/\/$/, '')).sort();
    const hostsEsperados = [HOST_A, HOST_B].sort();
    assert(JSON.stringify(hostsDeclarados) === JSON.stringify(hostsEsperados),
        'los hosts declarados son los dos reales',
        'declarados=' + hostsDeclarados.join(',') + ' esperados=' + hostsEsperados.join(','));

    const poolNum = poolTag ? parseInt(poolTag.split(':')[1], 10) : NaN;
    assert(poolNum === serverTags.length,
        'POOL-SIZE casa con el numero de SERVER-N declarados',
        'POOL-SIZE=' + poolNum + ' SERVER-N=' + serverTags.length);

    // ── Cierre ──────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  TOTAL = ' + (passed + failed) + '   PASS = ' + passed + '   FAIL = ' + failed);
    console.log('══════════════════════════════════════════════════════════════\n');
    process.exit(failed === 0 ? 0 : 1);
})();
