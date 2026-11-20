/* Comparación de bytes con el generador REAL y el LAB REAL.
 * Uso: node gen-4k6k-compare.js <genPath> <estado> <outPath>
 *   estado = previo | off | on
 * Reusa el arnés de tests/e2e-bulletproof-full-audit.js (mocks + eval del IIFE).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAIN = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend';
const LAB_PATH = process.env.APE_LAB_JSON_PATH ||
    'C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_20260418_210955.json';

(async () => {
    const [genPath, estado, outPath] = process.argv.slice(2);
    if (!genPath || !estado || !outPath) { console.error('uso: genPath estado outPath'); process.exit(2); }

    const lab = JSON.parse(fs.readFileSync(LAB_PATH, 'utf8').replace(/^\uFEFF/, ''));

    /* ── DETERMINISMO FORZADO ────────────────────────────────────────────────
     * El generador es polimórfico por diseño (UA rotativa, LIST-ID, fingerprint,
     * tokens de evasión): dos corridas idénticas dan cientos de líneas distintas.
     * Para comparar código previo vs OFF vs ON con BYTES CRUDOS hay que fijar las
     * fuentes de azar. Esto es una condición del arnés, no un cambio del producto:
     * las tres corridas usan exactamente la misma semilla.
     */
    let _seed = 0x9e3779b9;
    Math.random = function () {
        _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
        let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    /* performance/hrtime también alimentan tokens de evasión. */
    let _pf = 0;
    try { global.performance = { now: function () { _pf += 16.7; return _pf; } }; } catch (_) {}
    try { process.hrtime = function () { _pf += 1000000; return [Math.floor(_pf / 1e9), Math.round(_pf % 1e9)]; }; process.hrtime.bigint = function () { _pf += 1000000; return BigInt(Math.round(_pf)) * 1000n; }; } catch (_) {}    const FIXED_MS = 1795150000000;               /* 2026-11-20T…Z, fijo */
    const RealDate = Date;
    global.Date = class extends RealDate {
        constructor(...a) { super(...(a.length ? a : [FIXED_MS])); }
        static now() { return FIXED_MS; }
    };
    try {
        const cryptoNode = require('crypto');
        let _ctr = 0;
        cryptoNode.randomUUID = () => '00000000-0000-4000-8000-' + String(++_ctr).padStart(12, '0');
        cryptoNode.getRandomValues = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = (_seed = (_seed * 1664525 + 1013904223) >>> 0) & 0xff; return arr; };
        if (globalThis.crypto) {
            try { globalThis.crypto.getRandomValues = cryptoNode.getRandomValues; } catch (_) {}
            try { globalThis.crypto.randomUUID = cryptoNode.randomUUID; } catch (_) {}
        }
    } catch (_) { /* sin crypto: el resto sigue */ }

    global.window = {
        location: { origin: 'http://localhost:3000' },
        HUD_TYPED_ARRAYS: { log: () => {}, init: () => {}, complete: () => {}, isAborted: () => false, updateChannel: () => {} },
        console: Object.assign({}, console, { warn: () => {} })
    };
    global.TextEncoder = require('util').TextEncoder;
    global.TextDecoder = require('util').TextDecoder;
    global.btoa = (s) => Buffer.from(s).toString('base64');
    global.ReadableStream = require('stream/web').ReadableStream;
    global.Blob = (await import('buffer')).Blob;
    global.APE_PROFILE_MATRIX = {};
    window.APE_REA_POLICY = require(path.join(MAIN, 'js/ape-v9/rea-processing-policy.js'));
    window.APE_REA_EXPORT = require(path.join(MAIN, 'js/ape-v9/rea-export-finalizer.js'))(window);

    /* El adaptador se carga SIEMPRE (como en el index cableado); quien decide es la bandera. */
    window.APE_4K6K = require(path.join(MAIN, 'js/ape-v9/ape-4k6k-audit-adapter.js'));
    /* El UMD resuelve su root en globalThis; en el navegador window === globalThis, en node no. */
    globalThis.APE_4K6K_AUDIT = (estado === 'on') ? true : (estado === 'off' ? false : undefined);

    /* Instrumentación: ¿se alcanza el hook? */
    let _hookCalls = 0;
    if (window.APE_4K6K && window.APE_4K6K.insertIntentTag) {
        const _origIns = window.APE_4K6K.insertIntentTag;
        window.APE_4K6K.insertIntentTag = function (b, c, f) {
            _hookCalls++;
            if (_hookCalls === 1) {
                console.log('DEBUG tipo=' + (typeof b) + ' len=' + (b && b.length));
                console.log('DEBUG cola=[' + String(b).slice(-120).replace(/\n/g, '\\n') + ']');
            }
            return _origIns.call(window.APE_4K6K, b, c, f);
        };
    }
    let code = fs.readFileSync(genPath, 'utf8');
    code = code.replace(/^\(function\s*\(\)\s*\{/, '');
    code = code.replace(/\}\)\(\);$/, '');
    code = code.replace(/\blet\s+/g, 'var ');
    code = code.replace(/\bconst\s+/g, 'var ');
    eval(code);

    const gen = window.M3U8TypedArraysGenerator;
    if (!gen || typeof gen.generate !== 'function') { console.error('sin generator'); process.exit(1); }

    const profiles = ['P0', 'P0', 'P0', 'P0', 'P1', 'P1', 'P1', 'P3', 'P3', 'P3'];
    const channels = profiles.map((p, i) => ({
        id: 'test_' + i,
        name: 'Test Channel ' + i + ' (' + p + ')',
        url: 'http://iptv-provider.com/live/testuser/testpass/' + (1000 + i) + '.ts',
        group: 'Audit', profile: p, tvg_id: 'ch_' + i,
        tvg_logo: 'http://logo.example.com/logo.png'
    }));

    const bulletproof_profiles = {};
    for (const [pid, pdata] of Object.entries(lab.profiles_calibrated)) bulletproof_profiles[pid] = pdata;
    const options = {
        bulletproof_loaded: true,
        bulletproof_profiles: bulletproof_profiles,
        bulletproof_nivel1: lab.nivel1_directives || [],
        forceProfile: 'P0',
        dictatorMode: false,
        hud: false
    };

    const result = await gen.generate(channels, options);
    let texto;
    if (result && typeof result.text === 'function') texto = await result.text();
    else if (typeof result === 'string') texto = result;
    else if (result && typeof result.getReader === 'function') {
        const r = result.getReader(); const dec = new TextDecoder(); let t = '';
        for (;;) { const { done, value } = await r.read(); if (done) break; t += dec.decode(value, { stream: true }); }
        texto = t;
    } else { console.error('salida no reconocida'); process.exit(1); }

    fs.writeFileSync(outPath, texto, 'utf8');
    const sha = crypto.createHash('sha256').update(texto).digest('hex');
    const lineas = texto.split('\n').length;
    const sidecar = texto.split('\n').filter(l => l.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0).length;
    const uris = (texto.match(/^https?:\/\//gm) || []).length;
    const shim = texto.split('\n').filter(l => l.indexOf('#EXTSHIMOTT:') === 0).length;
    console.log(JSON.stringify({
        estado, bytes: Buffer.byteLength(texto), lineas, sha256: sha,
        sidecar, hook_calls: _hookCalls, extinf: (texto.match(/^#EXTINF:/gm) || []).length, uris, extshimott: shim,
        out: outPath
    }));
})().catch(e => { console.error('FALLO:', e && e.message); process.exit(1); });
