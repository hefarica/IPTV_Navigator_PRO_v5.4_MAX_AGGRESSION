'use strict';

/**
 * test-connection-budget.js
 *
 * Regresión del 403 por saturación de slot:
 *   1. OmegaSlotReaper v2.0 no hace burst paralelo con max_connections=1.
 *   2. Dos reap() concurrentes comparten una sola lectura (single-flight).
 *   3. El generador World-Class clampa parallelFetches / parallel_downloads /
 *      X-Concurrent-Downloads a 1 y emite #EXT-X-APE-CONNECTION-BUDGET:1.
 *
 * Uso:
 *   node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/test-connection-budget.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(condition, message, extra) {
    if (condition) {
        passed++;
        console.log('  PASS  ' + message);
    } else {
        failed++;
        console.error('  FAIL  ' + message + (extra ? '   [' + extra + ']' : ''));
    }
}

function makeSandbox(extra) {
    const sandbox = Object.assign({
        console: { log() {}, warn() {}, error() {} },
        window: {},
        performance: { now: () => Date.now() },
        Date,
        Math,
        JSON,
        Map,
        Set,
        Promise,
        Number,
        String,
        Boolean,
        Array,
        Object,
        RegExp,
        Error,
        parseInt,
        parseFloat,
        isNaN,
        encodeURIComponent,
        decodeURIComponent,
        unescape,
        btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
        atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
        setTimeout,
        clearTimeout,
        AbortController,
        Blob: global.Blob,
        URL
    }, extra || {});
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    return vm.createContext(sandbox);
}

function loadSlotReaper(fetchImpl) {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'ape-v9', 'slot-reaper.js'),
        'utf8'
    );
    const ctx = makeSandbox({ fetch: fetchImpl });
    vm.runInContext(src, ctx);
    return ctx.window.OmegaSlotReaper;
}

function loadGenerator() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'm3u8-world-class-generator.js'),
        'utf8'
    );
    const ctx = makeSandbox();
    vm.runInContext(src, ctx);
    return ctx;
}

function loadWarmup(fetchImpl) {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'ape-v9', 'session-warmup-v9.js'),
        'utf8'
    );
    const ctx = makeSandbox({ fetch: fetchImpl });
    vm.runInContext(src, ctx);
    return ctx.window.SESSION_WARMUP_V9;
}

async function testSlotReaperSingleSlot() {
    console.log('\n── 1 · SlotReaper max_connections=1 ─────────────────────────');
    let active = 1;
    let getCalls = 0;
    let headCalls = 0;
    let concurrent = 0;
    let maxConcurrent = 0;

    const fetchImpl = async (url, opts) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        try {
            if (opts && opts.method === 'HEAD') {
                headCalls++;
                return { ok: true, status: 200, json: async () => ({}) };
            }
            getCalls++;
            const snapshot = active;
            active = 0; // el proveedor libera el slot en la primera lectura
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    user_info: {
                        active_cons: String(snapshot),
                        max_connections: '1'
                    }
                })
            };
        } finally {
            concurrent--;
        }
    };

    const reaper = loadSlotReaper(fetchImpl);
    assert(reaper && reaper.version === '2.0.0', 'slot-reaper v2.0.0 cargado');

    const result = await reaper.reap(
        { id: 's1', baseUrl: 'http://provider.test', username: 'u', password: 'p' },
        { maxWaitMs: 2000, pollIntervalMs: 500, burstReap: true, burstSize: 3 }
    );

    assert(result.ok === true, 'reap devuelve ok con slot liberado', JSON.stringify(result));
    assert(result.code === 'SLOT_REAPED' || result.code === 'SLOT_CLEAR',
        'código SLOT_REAPED/SLOT_CLEAR', result.code);
    assert(headCalls === 0, 'NO se envía ningún HEAD burst con max_connections=1', 'headCalls=' + headCalls);
    assert(maxConcurrent === 1, 'nunca hay más de 1 request concurrente', 'maxConcurrent=' + maxConcurrent);
    assert(getCalls >= 1, 'leyó player_api al menos una vez', 'getCalls=' + getCalls);
}

async function testSlotReaperSingleFlight() {
    console.log('\n── 2 · SlotReaper single-flight ─────────────────────────────');
    let getCalls = 0;
    let resolveFirst;
    const firstResponse = new Promise((resolve) => { resolveFirst = resolve; });

    const fetchImpl = async () => {
        getCalls++;
        if (getCalls === 1) {
            await firstResponse;
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                user_info: { active_cons: '0', max_connections: '1' }
            })
        };
    };

    const reaper = loadSlotReaper(fetchImpl);
    const server = { id: 's2', baseUrl: 'http://provider.test', username: 'u', password: 'p' };
    const p1 = reaper.reap(server, { maxWaitMs: 2000, pollIntervalMs: 500, burstReap: false });
    const p2 = reaper.reap(server, { maxWaitMs: 2000, pollIntervalMs: 500, burstReap: false });

    // Dejar que ambas llamadas entren antes de resolver la primera lectura.
    await new Promise((resolve) => setTimeout(resolve, 30));
    resolveFirst();
    const [r1, r2] = await Promise.all([p1, p2]);

    assert(r1.ok === true && r2.ok === true, 'ambas llamadas terminan ok');
    assert(getCalls === 1, 'sólo una lectura de player_api para dos reap() concurrentes', 'getCalls=' + getCalls);
}

async function testSlotReaperMultiSlot() {
    console.log('\n── 3 · SlotReaper max_connections=2 ─────────────────────────');
    let active = 2;
    let headCalls = 0;
    let headConcurrent = 0;
    let headMaxConcurrent = 0;

    const fetchImpl = async (url, opts) => {
        if (opts && opts.method === 'HEAD') {
            headCalls++;
            headConcurrent++;
            headMaxConcurrent = Math.max(headMaxConcurrent, headConcurrent);
            await new Promise((resolve) => setTimeout(resolve, 10));
            headConcurrent--;
            return { ok: true, status: 200, json: async () => ({}) };
        }
        const snapshot = active;
        active = Math.max(0, active - 1);
        return {
            ok: true,
            status: 200,
            json: async () => ({
                user_info: { active_cons: String(snapshot), max_connections: '2' }
            })
        };
    };

    const reaper = loadSlotReaper(fetchImpl);
    const result = await reaper.reap(
        { id: 's3', baseUrl: 'http://provider.test', username: 'u', password: 'p' },
        { maxWaitMs: 2000, pollIntervalMs: 500, burstReap: true, burstSize: 3 }
    );

    assert(result.ok === true, 'reap multi-slot ok', JSON.stringify(result));
    assert(headCalls === 1, 'burst secuencial acotado a max-1 = 1 HEAD', 'headCalls=' + headCalls);
    assert(headMaxConcurrent === 1, 'los HEAD nunca van en paralelo', 'headMaxConcurrent=' + headMaxConcurrent);
}

function testGeneratorBudget() {
    console.log('\n── 4 · Generator connection budget ──────────────────────────');
    const ctx = loadGenerator();
    const gen = ctx.window.WorldClassM3U8Generator;
    assert(gen && typeof gen.generateWorldClassM3U8 === 'function', 'generador cargado en vm');

    ctx.window.APE_PROFILES_CONFIG = {
        labVersion: 'omega_v1',
        bulletproof: true,
        labExportedAt: '2026-11-22T00:00:00Z',
        nivel1Directives: [],
        nivel3PerLayer: {},
        profiles: {
            P2: {
                settings: { parallelFetches: 8, buffer_seconds: 30, bitrate: 10000 },
                prefetch_config: { parallel_downloads: 8, prefetch_segments: 8 },
                headerOverrides: {
                    'X-Concurrent-Downloads': '10',
                    'X-Parallel-Segments': '10'
                },
                hlsjs: { maxBufferLength: 30 },
                vlcopt: {},
                kodiprop: {}
            }
        }
    };

    const channel = {
        profile: 'P2',
        name: 'TEST CHANNEL',
        id: '1',
        url: 'http://example.test/live/1.ts'
    };

    const result = gen.generateWorldClassM3U8([channel], { maxConnections: 1, includeStart: false });
    const content = result && result.content ? result.content : '';

    assert(content.length > 0, 'generó contenido', 'len=' + content.length);
    assert(content.includes('#EXT-X-APE-CONNECTION-BUDGET:1'), 'emite CONNECTION-BUDGET:1');
    assert(content.includes('#EXT-X-APE-PREFETCH-PARALLEL:1'), 'emite PREFETCH-PARALLEL:1');
    assert(content.includes('"parallelFetches":1'), 'clampa settings.parallelFetches a 1');
    assert(content.includes('"parallel_downloads":1'), 'clampa prefetch_config.parallel_downloads a 1');
    assert(content.includes('"X-Concurrent-Downloads":"1"'), 'clampa header X-Concurrent-Downloads a 1');
    assert(content.includes('"X-Parallel-Segments":"1"'), 'clampa header X-Parallel-Segments a 1');

    const result2 = gen.generateWorldClassM3U8([channel], { maxConnections: 2, includeStart: false });
    const content2 = result2 && result2.content ? result2.content : '';
    assert(content2.includes('"parallelFetches":2'), 'con maxConnections=2 usa presupuesto 2');
    assert(!content2.includes('"undefined"') && !content2.includes(':undefined'),
        'no emite valores undefined al clampear');
}

function testAppProbeRemoved() {
    console.log('\n── 5 · app.js sin probe destructivo ─────────────────────────');
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert(!/probeUrl\s*=\s*`\$\{baseUrl\}\/live\//.test(app),
        'no queda GET /live/.../1.m3u8 como probe');
    assert(app.includes('probe=SKIPPED (no consume slot)'),
        'app.js declara el probe omitido');
    assert(app.includes('maxConnections: this.state.maxConnections'),
        'app.js pasa maxConnections al generador');
}

async function testWarmupSingleSlot() {
    console.log('\n── 6 · Warmup con max_connections=1 ─────────────────────────');
    let fetchCalls = 0;
    const warmup = loadWarmup(async () => {
        fetchCalls++;
        return { ok: true, status: 200, type: 'opaque', url: '' };
    });

    assert(warmup && typeof warmup.setMaxConnections === 'function', 'warmup cargado');
    assert(warmup.setMaxConnections(1) === 1, 'setMaxConnections(1) → 1');

    const result = await warmup.execute('http://provider.test/live/u/p/1.m3u8', 5);
    assert(result.reason === 'skipped_single_slot', 'omite /live/ con un solo slot', result.reason);
    assert(fetchCalls === 0, 'no ejecuta ningún fetch de warmup', 'fetchCalls=' + fetchCalls);

    assert(warmup.setMaxConnections(4) === 4, 'setMaxConnections(4) → 4');
}

(async () => {
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  CONNECTION BUDGET — regresión 403 / C2.A');
    console.log('══════════════════════════════════════════════════════════════════');

    await testSlotReaperSingleSlot();
    await testSlotReaperSingleFlight();
    await testSlotReaperMultiSlot();
    testGeneratorBudget();
    testAppProbeRemoved();
    await testWarmupSingleSlot();

    console.log('\n──────────────────────────────────────────────────────────────────');
    console.log('  RESULTADO: ' + passed + ' PASS · ' + failed + ' FAIL');
    console.log('──────────────────────────────────────────────────────────────────\n');

    if (failed > 0) process.exit(1);
})();