#!/usr/bin/env node
'use strict';
/*
 * ape-upscale-chain-validity.test.js — ¿LA CADENA DE UPSCALE EJECUTA, O ES SOLO TEXTO?
 *
 * POR QUÉ EXISTE. La doctrina prohíbe dos cosas distintas y este test separa las dos:
 *   1) una cadena que NO parsea  → el motor la rechaza y filtra NADA (mentira al parser);
 *   2) decir que un filtro "se aplica" porque está escrito en la playlist (declaración ≠ ejecución).
 *
 * QUÉ MIDE:
 *   C-01  Cada etapa de cada `#EXTVLCOPT:video-filter` emitido se EJECUTA en el ffmpeg real
 *         (lane ffmpeg), etapa por etapa, leyendo el stderr literal. Si una etapa no parsea,
 *         FALLA con el mensaje del binario.
 *   C-02  Ningún tag de la cadena declara ejecución: no puede aparecer EXECUTED=1 / APPLIED=1.
 *         El upscale se declara con SCOPE=DISPLAY / ACTIVATION=DEVICE_GATED / PIXELS=0.
 *   C-03  La cadena no degrada: si hay `scale=`, su ancho no cae bajo la resolución del perfil base.
 *   C-04  Reporta (no inventa) el hueco de `quality_levels` en el LAB: P5.5 no los declara.
 *
 * HONESTO: la cadena completa con `minterpolate` a 4K no completa un frame en 120 s en este host
 * (medido). Eso es coste, no sintaxis: se reporta como NO TIEMPO REAL, no como fallo de parseo.
 * Y `#EXTVLCOPT:video-filter` es inerte en VLC 3.0.24 por política (`unsafe option`), así que
 * este test NO afirma que el player aplique el filtro: solo que la cadena es válida y que no se
 * miente declarándola ejecutada.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { spawnSync } = require('child_process');

const FE = path.join(__dirname, '..');
const REPO = path.join(FE, '..', '..');
const NAME = 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json';

let pass = 0, fail = 0, skip = 0;
const check = (c, name, extra) => { if (c) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };
const skipLine = (name, why) => { skip++; console.log('SKIP  ' + name + ' — ' + why); };

const fixture = [process.argv[2], process.env.APE_LAB_CALIBRATED_JSON, path.join(REPO, 'artifacts', 'lab', 'calibrated', NAME)].filter(Boolean)
    .find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!fixture) { console.log('SKIP  sin fixture calibrado'); process.exit(0); }

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;
if (!hasFfmpeg) skipLine('validación de cadena con ffmpeg', 'binario ffmpeg no disponible en este host');

const noop = () => {};
const store = Object.create(null);
const fe = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, appendChild: noop, setAttribute: noop, addEventListener: noop, remove: noop, value: '', textContent: '', innerHTML: '' });
const ctx = {
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, group: noop, groupEnd: noop },
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'), atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear: () => { for (const k of Object.keys(store)) delete store[k]; }, key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: fe, createTextNode: fe, body: fe(), head: fe(), documentElement: fe(), readyState: 'complete', cookie: '' },
    navigator: { userAgent: 'node-harness' }, location: { href: 'http://localhost/' }, fetch: () => Promise.reject(new Error('sin red')),
    Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
    Blob: class {}, URL: { createObjectURL: () => 'x', revokeObjectURL: noop }, performance: { now: () => Date.now() }
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js'), 'utf8'), ctx, { filename: 'gen.js', timeout: 60000 });
vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'ape-profiles-config.js'), 'utf8'), ctx, { filename: 'cfg.js', timeout: 60000 });
const NORM = require(path.join(FE, 'js', 'ape-lab-normalize.js'));

const runStage = (stage) => spawnSync('ffmpeg',
    ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x120:d=0.3:r=10', '-vf', stage, '-frames:v', '1', '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 25000 });

(async () => {
    const J = JSON.parse(fs.readFileSync(fixture, 'utf8').replace(/^\uFEFF/, ''));
    await ctx.APE_PROFILES_CONFIG.importFromLABData(NORM.normalize(J).data);
    const ids = Object.keys(J.profiles);

    const chains = new Map();          // cadena → primer perfil que la usa
    let noExecution = 0, noDownscale = 0, withChain = 0;

    for (const id of ids) {
        const out = String(ctx.APE_GEN_CHANNEL({ name: 'T ' + id, url: 'http://example.invalid/live/t/1.m3u8', group: 'T', tvg_id: 't.' + id, profile: id }, id, 0, {}, {}));

        /* C-02 · no declarar ejecución */
        if (!/EXECUTED=1|APPLIED=1/i.test(out)) noExecution++;
        else check(false, id + ' · ningún tag declara EXECUTED=1/APPLIED=1');

        /* C-03 · sin downscale bajo la base */
        const base = String(id).match(/^(P[0-5])[._]5$/) ? String(id).match(/^(P[0-5])[._]5$/)[1] : id;
        const prof = ctx.APE_PROFILES_CONFIG.getProfile(base);
        const baseW = parseInt(String((prof && prof.settings && prof.settings.resolution) || '').split('x')[0], 10) || 0;
        let okScale = true;
        for (const m of out.matchAll(/scale=w=(\d+):h=(\d+)/g)) {
            if (baseW && Number(m[1]) < baseW) { okScale = false; check(false, id + ' · scale no baja de ' + baseW, m[1] + 'x' + m[2]); }
        }
        if (okScale) noDownscale++;

        /* C-01 · recolectar la cadena */
        const m = out.match(/#EXTVLCOPT:video-filter=([^\n]*)/);
        if (m && m[1].trim()) { withChain++; if (!chains.has(m[1].trim())) chains.set(m[1].trim(), id); }
    }

    check(noExecution === ids.length, 'ningún perfil declara ejecución del upscale (EXECUTED=1 ausente) ' + ids.length + '/' + ids.length, noExecution + '/' + ids.length);
    check(noDownscale === ids.length, 'ninguna cadena hace downscale bajo la resolución del perfil base ' + ids.length + '/' + ids.length, noDownscale + '/' + ids.length);
    check(withChain === ids.length, 'los ' + ids.length + ' perfiles emiten cadena de mejora', withChain + '/' + ids.length);

    /* C-01 · ejecutar cada etapa de cada cadena distinta */
    if (hasFfmpeg) {
        let stOk = 0, stBad = 0;
        const problems = [];
        for (const [chain, owner] of chains) {
            for (const st of chain.split(',')) {
                const r = runStage(st);
                const err = (r.stderr || '').trim().split('\n').filter(Boolean)[0] || '';
                if (r.status === 0 && !err) stOk++;
                else { stBad++; problems.push(owner + ' · ' + st.split('=')[0] + ' → ' + (r.signal === 'SIGTERM' ? 'TIMEOUT' : err.slice(0, 90))); }
            }
        }
        check(stBad === 0, 'todas las etapas de la(s) ' + chains.size + ' cadena(s) ejecutan en ffmpeg (' + stOk + ' etapas)', problems.join(' | ').slice(0, 220));
    }

    /* C-04 · hueco declarado, no inventado */
    const noQL = ids.filter(id => !(J.profiles[id].quality_levels && Object.keys(J.profiles[id].quality_levels).length));
    if (noQL.length) skipLine('quality_levels de ' + noQL.join(','), 'NO COMPUTADO: el LAB no declara niveles para ese perfil; el generador no los inventa');

    console.log('\n{"passed":' + pass + ',"skipped":' + skip + ',"failed":' + fail + ',"perfiles":' + ids.length + ',"cadenas":' + chains.size + '}');
    process.exit(fail === 0 ? 0 : 1);
})();
