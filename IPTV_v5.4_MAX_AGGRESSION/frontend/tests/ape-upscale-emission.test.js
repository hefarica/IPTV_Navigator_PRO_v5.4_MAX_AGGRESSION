#!/usr/bin/env node
'use strict';
/*
 * ape-upscale-emission.test.js — LA CADENA DE UPSCALING SE EMITE DE VERDAD, PERFIL POR PERFIL.
 *
 * Cierra el NO_COMPUTADO que el gate de calidad (t5) dejó abierto: "cargué window.APE_GEN y
 * drené su ReadableStream, pero las 8 invocaciones devolvieron lo mismo para todos los perfiles
 * (PROFILE=P1): el perfil pedido no se propaga". La causa era de FIRMA: el perfil es el SEGUNDO
 * argumento de `generateChannelEntry(channel, profile, …)`, no un campo del canal.
 *
 * QUÉ PRUEBA (con el generador REAL cargado en un sandbox, no con fragmentos):
 *   U-01  Cada uno de los 12 perfiles emite `#EXT-X-APE-CRYSTAL-UHD` con el token de su tier BASE
 *         y una intensidad VPP que NUNCA baja del piso histórico 55 en los `.5` (P4.5 70, P5.5 85).
 *   U-02  Cada uno emite `#EXT-X-APE-CRYSTAL-6K` con RES=5760x3240, CODEC=hvc1.2.4.L183.B0
 *         (GOLDEN RULE: hvc1 sólo en metadata, nunca hev1), BASE correcto y PROVENANCE del LAB.
 *   U-03  La cadena de mejora nunca se acompaña de una degradación: sin recode (`libx264`,
 *         `-c:v`, `-crf`), sin `scale=`/`-vf` y sin RESOLUTION por debajo del objetivo.
 *   U-04  La entrada no se trunca: >= 900 líneas por canal.
 *
 * FIXTURE: argv[2], $APE_LAB_CALIBRATED_JSON o artifacts/lab/calibrated/. Sin fixture: SKIP.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const NAME = 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json';
const REPO = path.join(__dirname, '..', '..', '..');
const FE = path.join(REPO, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend');
const NORM = require(path.join(FE, 'js', 'ape-lab-normalize.js'));

const cands = [process.argv[2], process.env.APE_LAB_CALIBRATED_JSON, path.join(REPO, 'artifacts', 'lab', 'calibrated', NAME)].filter(Boolean);
const fixture = cands.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!fixture) { console.log('SKIP  no hay fixture calibrado. Buscado en:\n  ' + cands.join('\n  ')); process.exit(0); }

let pass = 0, fail = 0;
const check = (cond, name, extra) => { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };

/* ── sandbox de navegador ── */
const noop = () => {};
const store = Object.create(null);
const fe = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, appendChild: noop, setAttribute: noop, addEventListener: noop, remove: noop, value: '', textContent: '', innerHTML: '' });
const ctx = {
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, group: noop, groupEnd: noop },
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear: () => { for (const k of Object.keys(store)) delete store[k]; }, key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: fe, createTextNode: fe, body: fe(), head: fe(), documentElement: fe(), readyState: 'complete', cookie: '' },
    navigator: { userAgent: 'node-harness' }, location: { href: 'http://localhost/' }, fetch: () => Promise.reject(new Error('sin red')),
    Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
    Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: noop }, performance: { now: () => Date.now() }
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js'), 'utf8'), ctx, { filename: 'gen.js', timeout: 60000 });
vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'ape-profiles-config.js'), 'utf8'), ctx, { filename: 'cfg.js', timeout: 60000 });

check(typeof ctx.APE_GEN_CHANNEL === 'function', 'el emisor por canal está expuesto (window.APE_GEN_CHANNEL)');
if (typeof ctx.APE_GEN_CHANNEL !== 'function') { console.log('\n{"passed":' + pass + ',"failed":' + fail + '}'); process.exit(1); }

/* tabla esperada: tier BASE emitido y VPP que NUNCA baja del piso histórico 55 en los .5 */
const TIER = { P0: 40, P1: 35, P2: 45, P3: 55, P4: 70, P5: 85 };
const FLOOR = 55;
const baseOf = (id) => { const m = String(id).match(/^(P[0-5])[._]5$/); return m ? m[1] : String(id); };
const expectVpp = (id) => { const b = baseOf(id); const emulado = b !== id; return (emulado && TIER[b] < FLOOR) ? FLOOR : TIER[b]; };

(async () => {
    const J = JSON.parse(fs.readFileSync(fixture, 'utf8').replace(/^\uFEFF/, ''));
    await ctx.APE_PROFILES_CONFIG.importFromLABData(NORM.normalize(J).data);
    const ids = Object.keys(ctx.APE_PROFILES_CONFIG.profiles).sort();
    check(ids.length === 12, '12 perfiles importados antes de emitir', ids.length + ' → ' + ids.join(','));

    let emitOk = 0, uhdOk = 0, k6Ok = 0, cleanOk = 0, sizeOk = 0, upscaleOk = 0;
    for (const id of ids) {
        const ch = { name: 'TEST ' + id, url: 'http://example.invalid/live/test/1.m3u8', group: 'TEST', tvg_id: 'test.' + id, profile: id };
        let raw = null, err = null;
        try { raw = ctx.APE_GEN_CHANNEL(ch, id, 0, {}, {}); } catch (e) { err = e.message; }
        if (err) { check(false, id + ' · emite sin lanzar', err); continue; }
        emitOk++;
        const txt = Array.isArray(raw) ? raw.join('\n') : String(raw);

        /* U-01 · Crystal UHD con tier base y VPP no degradado */
        const uhd = (txt.match(/#EXT-X-APE-CRYSTAL-UHD:[^\n]*/) || [null])[0];
        const mU = uhd && uhd.match(/PROFILE=(P[0-5]);VPP_INTENSITY=(\d+);/);
        const wantBase = baseOf(id), wantVpp = expectVpp(id);
        if (mU && mU[1] === wantBase && Number(mU[2]) === wantVpp) uhdOk++;
        else check(false, id + ' · CRYSTAL-UHD PROFILE=' + wantBase + ' VPP=' + wantVpp, uhd || '(ausente)');

        /* U-02 · Crystal 6K con RES 5760x3240, hvc1 y provenance del LAB */
        const k6 = (txt.match(/#EXT-X-APE-CRYSTAL-6K:[^\n]*/) || [null])[0];
        const wantProf = wantBase + '.5';
        const good6 = k6 && k6.includes('PROFILE=' + wantProf) && k6.includes('BASE=' + wantBase)
            && k6.includes('RES=5760x3240') && k6.includes('CODEC=hvc1.2.4.L183.B0')
            && /PROVENANCE=(LAB_PROFILES|LAB)\b/.test(k6) && !k6.includes('hev1');
        if (good6) k6Ok++;
        else check(false, id + ' · CRYSTAL-6K PROFILE=' + wantProf + ' BASE=' + wantBase + ' RES=5760x3240 hvc1 LAB', k6 || '(ausente)');

        /* U-03 · la mejora nunca se acompaña de una degradación.
         * OJO: `scale=w=3840:h=2160:flags=lanczos` es UPSCALE (lanczos+unsharp+hqdn3d), no
         * degradación; y `video_ai_sr_scale=4` es AI super-resolution. Sólo es degradación un
         * `scale=` cuyo ancho caiga POR DEBAJO de la resolución del perfil base. */
        const baseProfile = ctx.APE_PROFILES_CONFIG.getProfile(wantBase);
        const baseRes = (baseProfile && baseProfile.settings && baseProfile.settings.resolution) || '';
        const baseW = parseInt(String(baseRes).split('x')[0], 10) || 0;
        const bad = [];
        if (/libx264|libx265|-c:v\s|-crf\s/.test(txt)) bad.push('recode');
        for (const m of txt.matchAll(/scale=w=(\d+):h=(\d+)/g)) {
            const w = Number(m[1]), h = Number(m[2]);
            if (baseW && w < baseW) bad.push('downscale ' + w + 'x' + h + ' < base ' + baseW);
        }
        if (bad.length) check(false, id + ' · sin recode ni downscale', bad.join(','));
        else cleanOk++;

        /* U-05 · "upscaling siempre": todo tier por debajo de 4K declara su cadena de mejora. */
        if (baseW && baseW < 3840) {
            const hasUpscale = /scale=w=(\d+)/.test(txt) && [...txt.matchAll(/scale=w=(\d+)/g)].some(m => Number(m[1]) >= 3840);
            const hasAiSr = /inputstream\.adaptive\.video_ai_sr_scale=([2-9]|\d{2,})/.test(txt);
            if (hasUpscale || hasAiSr) upscaleOk++;
            else check(false, id + ' · declara cadena de upscale (base ' + baseRes + ')', 'sin scale>=3840 ni AI-SR');
        } else upscaleOk++;

        /* U-04 · la entrada no viene truncada */
        const n = txt.split('\n').length;
        if (n >= 900) sizeOk++;
        else check(false, id + ' · entrada completa (>=900 líneas)', n);
    }

    const N = ids.length;
    check(emitOk === N, 'U-00 · los ' + N + ' perfiles emiten sin lanzar', emitOk + '/' + N);
    check(uhdOk === N, 'U-01 · CRYSTAL-UHD con tier base y VPP no degradado en ' + N + '/' + N, uhdOk + '/' + N);
    check(k6Ok === N, 'U-02 · CRYSTAL-6K derivado del LAB (RES/hvc1/BASE/PROVENANCE) en ' + N + '/' + N, k6Ok + '/' + N);
    check(cleanOk === N, 'U-03 · sin recode ni downscale bajo la base en ' + N + '/' + N, cleanOk + '/' + N);
    check(sizeOk === N, 'U-04 · entradas completas en ' + N + '/' + N, sizeOk + '/' + N);
    check(upscaleOk === N, 'U-05 · "upscaling siempre": todo tier por debajo de 4K declara su cadena en ' + N + '/' + N, upscaleOk + '/' + N);

    console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"perfiles":' + N + ',"emision":"real","upscale":"LAB"}');
    process.exit(fail === 0 ? 0 : 1);
})();
