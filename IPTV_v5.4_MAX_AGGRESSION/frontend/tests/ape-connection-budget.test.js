#!/usr/bin/env node
'use strict';
/*
 * ape-connection-budget.test.js — REGRESIÓN DEL 403 INTERMITENTE (c2.a)
 *
 * HIPÓTESIS MEDIDA: el 403 no era permanente porque dependía de si el ÚNICO slot del
 * proveedor (max_connections=1) quedaba ocupado cuando el player pedía su primer segmento.
 * Lo ocupaban tres cosas nuestras:
 *   1. app.js hacía un probe `GET /live/{u}/{p}/1.m3u8` con mode:'no-cors' → ABRÍA UN STREAM
 *      REAL. Una respuesta no-cors es opaca (status=0, Location vacío): el probe nunca podía
 *      detectar el redirect que decía detectar, sólo robaba el slot.
 *   2. slot-reaper v1.0 lanzaba Promise.all de 3 HEAD → 3 conexiones con un solo slot.
 *   3. session-warmup hacía HEAD a /live/ sin mirar el presupuesto.
 *
 * Este test fija los invariantes que impiden volver a ese estado.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FE = path.join(__dirname, '..');
let pass = 0, fail = 0;
const check = (c, name, extra) => { if (c) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };

function sandbox(extra) {
    const box = Object.assign({
        console: { log() {}, warn() {}, error() {} },
        performance: { now: () => Date.now() },
        Date, Math, JSON, Map, Set, Promise, Number, String, Boolean, Array, Object, RegExp, Error,
        parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, unescape,
        setTimeout, clearTimeout, AbortController, URL,
        btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
        atob: (s) => Buffer.from(String(s), 'base64').toString('binary')
    }, extra || {});
    box.globalThis = box; box.window = box;
    return vm.createContext(box);
}

function load(file, extra) {
    const ctx = sandbox(extra);
    vm.runInContext(fs.readFileSync(path.join(FE, file), 'utf8'), ctx, { filename: file });
    return ctx;
}

(async () => {
    /* ── 1 · slot-reaper: cero burst con un solo slot ── */
    let active = 1, headCalls = 0, concurrent = 0, maxConcurrent = 0;
    const fetchOneSlot = async (url, opts) => {
        concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
        try {
            if (opts && opts.method === 'HEAD') { headCalls++; return { ok: true, status: 200, json: async () => ({}) }; }
            const snap = active; active = 0;
            return { ok: true, status: 200, json: async () => ({ user_info: { active_cons: String(snap), max_connections: '1' } }) };
        } finally { concurrent--; }
    };
    const r1 = load('js/ape-v9/slot-reaper.js', { fetch: fetchOneSlot }).window.OmegaSlotReaper;
    check(r1 && r1.version === '2.0.0', 'slot-reaper es v2.0.0', r1 && r1.version);
    const res1 = await r1.reap({ id: 's1', baseUrl: 'http://p.test', username: 'u', password: 'p' },
        { maxWaitMs: 2000, pollIntervalMs: 500, burstReap: true, burstSize: 3 });
    check(res1.ok === true && /^SLOT_(REAPED|CLEAR)$/.test(res1.code), 'reap libera el slot y devuelve SLOT_*', JSON.stringify(res1));
    check(headCalls === 0, 'max_connections=1 → CERO HEAD de burst', 'headCalls=' + headCalls);
    check(maxConcurrent === 1, 'nunca más de 1 request concurrente', 'maxConcurrent=' + maxConcurrent);

    /* ── 2 · single-flight ── */
    let getCalls = 0, releaseFirst, firstResp = new Promise(r => { releaseFirst = r; });
    const fetchSlow = async () => {
        getCalls++;
        if (getCalls === 1) await firstResp;
        return { ok: true, status: 200, json: async () => ({ user_info: { active_cons: '0', max_connections: '1' } }) };
    };
    const r2 = load('js/ape-v9/slot-reaper.js', { fetch: fetchSlow }).window.OmegaSlotReaper;
    const srv = { id: 's2', baseUrl: 'http://p.test', username: 'u', password: 'p' };
    const pA = r2.reap(srv, { maxWaitMs: 2000, pollIntervalMs: 500, burstReap: false });
    const pB = r2.reap(srv, { maxWaitMs: 2000, pollIntervalMs: 500, burstReap: false });
    await new Promise(r => setTimeout(r, 30));
    releaseFirst();
    const [a, b] = await Promise.all([pA, pB]);
    check(a.ok && b.ok, 'dos reap() concurrentes terminan ok');
    check(getCalls === 1, 'single-flight: 1 sola lectura de player_api para 2 reap()', 'getCalls=' + getCalls);

    /* ── 3 · dos slots: burst secuencial acotado a max-1 ── */
    let active2 = 2, head2 = 0, headConc = 0, headMaxConc = 0;
    const fetchTwo = async (url, opts) => {
        if (opts && opts.method === 'HEAD') {
            head2++; headConc++; headMaxConc = Math.max(headMaxConc, headConc);
            await new Promise(r => setTimeout(r, 10)); headConc--;
            return { ok: true, status: 200, json: async () => ({}) };
        }
        const snap = active2; active2 = Math.max(0, active2 - 1);
        return { ok: true, status: 200, json: async () => ({ user_info: { active_cons: String(snap), max_connections: '2' } }) };
    };
    const r3 = load('js/ape-v9/slot-reaper.js', { fetch: fetchTwo }).window.OmegaSlotReaper;
    const res3 = await r3.reap({ id: 's3', baseUrl: 'http://p.test', username: 'u', password: 'p' },
        { maxWaitMs: 2000, pollIntervalMs: 500, burstReap: true, burstSize: 3 });
    check(res3.ok === true, 'reap multi-slot ok', JSON.stringify(res3));
    check(head2 === 1, 'burst acotado a max-1 = 1 HEAD', 'head2=' + head2);
    check(headMaxConc === 1, 'los HEAD van secuenciales, nunca en paralelo', 'headMaxConc=' + headMaxConc);

    /* ── 4 · warmup respeta el presupuesto ── */
    let wCalls = 0;
    const w = load('js/ape-v9/session-warmup-v9.js', { fetch: async () => { wCalls++; return { ok: true, status: 200, type: 'opaque' }; } }).window.SESSION_WARMUP_V9;
    check(w && typeof w.setMaxConnections === 'function', 'warmup expone setMaxConnections');
    check(w.setMaxConnections(1) === 1, 'setMaxConnections(1) → 1');
    const wr = await w.execute('http://p.test/live/u/p/1.m3u8', 5);
    check(wr.reason === 'skipped_single_slot', 'con 1 slot OMITE el warmup de /live/', wr.reason);
    check(wCalls === 0, 'no ejecuta ningún fetch de warmup con 1 slot', 'wCalls=' + wCalls);
    check(w.setMaxConnections(4) === 4, 'setMaxConnections(4) → 4');

    /* ── 5 · app.js: el probe destructivo no puede volver ── */
    const app = fs.readFileSync(path.join(FE, 'app.js'), 'utf8');
    check(!/probeUrl\s*=\s*`\$\{baseUrl\}\/live\//.test(app), 'app.js NO hace GET /live/.../1.m3u8 como probe');
    check(!/mode:\s*'no-cors'[\s\S]{0,200}1\.m3u8/.test(app), 'app.js no abre stream con no-cors');
    check(app.includes('probe=SKIPPED (no consume slot)'), 'app.js declara el probe omitido');
    check(app.includes('window.SESSION_WARMUP_V9.setMaxConnections(maxConnections)'), 'app.js pasa el presupuesto al warmup');
    check(app.includes('this.state.maxConnections = maxConnections'), 'app.js guarda max_connections en state');
    check(app.includes('maxConnections: this.state.maxConnections'), 'app.js PASA maxConnections al generador (sin esto el clamp es inerte)');
    check(app.includes("streamFormat: this.state.preferredStreamFormat"), 'app.js pasa streamFormat al generador');

    /* ── 6 · generador World-Class: clamp SOLO si el panel declara límite ── */
    const wcCtx = sandbox({ Blob: global.Blob, TextEncoder, TextDecoder });
    wcCtx.window.APE_PROFILES_CONFIG = {
        labVersion: 'omega_v1', bulletproof: true, labExportedAt: '2026-11-22T00:00:00Z',
        nivel1Directives: [], nivel3PerLayer: {},
        profiles: {
            P2: {
                settings: { parallelFetches: 8, buffer_seconds: 30, bitrate: 10000 },
                prefetch_config: { parallel_downloads: 8, prefetch_segments: 8, prefetch_parallel: 8, parallel_workers: 8, aggression_levels: '{"l1":{"parallel":2}}' },
                headerOverrides: { 'X-Concurrent-Downloads': '10', 'X-Parallel-Segments': '10' },
                hlsjs: { maxBufferLength: 30 }, vlcopt: {}, kodiprop: {}
            }
        }
    };
    vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'm3u8-world-class-generator.js'), 'utf8'), wcCtx, { filename: 'wc.js' });
    const wc = wcCtx.window.WorldClassM3U8Generator;
    check(wc && typeof wc.generateWorldClassM3U8 === 'function', 'generador World-Class cargado');

    const chan = { profile: 'P2', name: 'TEST', id: '1', url: 'http://example.test/live/1.ts' };
    const emit = (mc) => { const r = wc.generateWorldClassM3U8([chan], { maxConnections: mc, includeStart: false }); return (r && r.content) || ''; };

    const c1 = emit(1);
    check(c1.includes('#EXT-X-APE-CONNECTION-BUDGET:1'), 'maxConnections=1 emite CONNECTION-BUDGET:1');
    check(c1.includes('"parallelFetches":1'), 'maxConnections=1 clampa settings.parallelFetches a 1');
    check(c1.includes('"parallel_downloads":1'), 'maxConnections=1 clampa parallel_downloads a 1');
    check(c1.includes('"parallel_workers":1'), 'maxConnections=1 clampa parallel_workers a 1');
    check(c1.includes('"X-Concurrent-Downloads":"1"'), 'maxConnections=1 clampa X-Concurrent-Downloads a 1');
    check(c1.includes('"X-Parallel-Segments":"1"'), 'maxConnections=1 clampa X-Parallel-Segments a 1');

    const c2 = emit(2);
    check(c2.includes('#EXT-X-APE-CONNECTION-BUDGET:2') && c2.includes('"parallelFetches":2'),
        'maxConnections=2 usa presupuesto 2 (no degrada cuentas con 2 slots)');

    /* INVARIANTE DEL REPO: sin límite declarado NO se clampea (X-Concurrent-Downloads = 8/10) */
    const c0 = emit(0);
    check(!c0.includes('#EXT-X-APE-CONNECTION-BUDGET:'), 'maxConnections=0 NO emite tag de presupuesto');
    check(c0.includes('"parallelFetches":8'), 'maxConnections=0 conserva parallelFetches=8 (sin clamp)');
    check(c0.includes('"X-Concurrent-Downloads":"10"'), 'maxConnections=0 conserva X-Concurrent-Downloads=10 (sin clamp)');
    check(!/undefined/.test(c1 + c2 + c0), 'el clamp no inyecta valores undefined');

    console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"scope":"connection-budget","physical_playback_verified":false}');
    process.exit(fail === 0 ? 0 : 1);
})();
