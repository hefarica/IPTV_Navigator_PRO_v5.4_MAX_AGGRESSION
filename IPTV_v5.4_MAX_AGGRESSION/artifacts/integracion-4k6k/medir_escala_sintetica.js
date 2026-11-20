/* ═══════════════════════════════════════════════════════════════════════════
 * MEDICIÓN DE ESCALA — 5.000 canales SINTÉTICOS EN MEMORIA
 *
 * Herramienta de VERIFICACIÓN. NO abre la lista de 754 MB ni ninguna lista
 * real: genera N canales sintéticos en memoria, declara el tamaño exacto de la
 * muestra (canales + bytes JSON) y mide tiempo y memoria del adaptador REAL.
 *
 * Uso:  node artifacts/integracion-4k6k/medir_escala_sintetica.js [N]
 *       (N por defecto 5000; APE_4K6K_MEASURE_N también lo fija)
 *
 * Qué mide, por separado:
 *   1. flag 0: enrich(x) (camino apagado, coste 0 declarado)
 *   2. flag 1: enrich(x)  (copia + intención REA + archivo por canal)
 *   3. flag 1: audit(x)   (recorrido completo, stats + sha256)
 *   4. flag 1: 2ª pasada  (idempotencia a escala)
 * Memoria: heapUsed antes/después de cada fase + maxRSS del proceso.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const crypto = require('crypto');

const REPO = path.join(__dirname, '..', '..');
const ADAPTER = path.join(REPO, 'frontend/js/ape-v9/ape-4k6k-audit-adapter.js');
const api = require(ADAPTER);

const N = Number(process.argv[2] || process.env.APE_4K6K_MEASURE_N || 5000);
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const J = (v) => JSON.stringify(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

const PROFILES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
function makeChannel(i) {
    return {
        id: i,
        tvg_id: 'CH-' + i,
        name: 'Canal sintético ' + i,
        group: i % 3 === 0 ? 'Deportes' : (i % 3 === 1 ? 'Cine' : 'Noticias'),
        ape_profile: PROFILES[i % 6],
        resolution: i % 100 === 0 ? '7680x4320' : '1920x1080',
        height: i % 100 === 0 ? 4320 : 1080,
        codec: i % 100 === 0 ? 'hvc1.2.4.L183.B0' : 'hvc1.2.4.L153.B0',
        url: 'https://cdn.example/live/c' + i + '/index.m3u8?u=k' + i + '&d=eyJkZXYiOiJPTk4tNEsifQ',
        qoe: { p: PROFILES[i % 6] },
        lines: ['#EXTHTTP:{"User-Agent":"VLC/3.0"}']
    };
}

function measure(label, fn) {
    const gcOn = typeof global.gc === 'function';
    if (gcOn) global.gc();
    const heap0 = process.memoryUsage().heapUsed;
    const t0 = process.hrtime.bigint();
    const out = fn();
    const t1 = process.hrtime.bigint();
    if (gcOn) global.gc();
    const heap1 = process.memoryUsage().heapUsed;
    const ms = Number(t1 - t0) / 1e6;
    console.log('  ' + label.padEnd(30) + ms.toFixed(2).padStart(10) + ' ms   Δheap=' +
        ((heap1 - heap0) / 1048576).toFixed(1).padStart(8) + ' MiB' + (gcOn ? ' (gc forzado)' : ''));
    return { out, ms, heapDeltaMiB: (heap1 - heap0) / 1048576, gcForced: gcOn };
}

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  MEDICIÓN DE ESCALA · muestra SINTÉTICA en memoria (sin listas reales)');
console.log('  adaptador: ' + path.relative(REPO, ADAPTER));
console.log('  sha256 adaptador: ' + sha256(require('fs').readFileSync(ADAPTER, 'utf8')));
console.log('══════════════════════════════════════════════════════════════════════');

const channels = new Array(N);
for (let i = 0; i < N; i++) channels[i] = makeChannel(i);
const sampleJson = J(channels);
const sampleBytes = Buffer.byteLength(sampleJson, 'utf8');

console.log('\nMUESTRA DECLARADA');
console.log('  canales            : ' + N);
console.log('  bytes JSON         : ' + sampleBytes + '  (' + (sampleBytes / 1048576).toFixed(2) + ' MiB)');
console.log('  sha256 muestra     : ' + sha256(sampleJson));
console.log('  memoria del proceso: rss=' + (process.memoryUsage().rss / 1048576).toFixed(1) +
    ' MiB heapUsed=' + (process.memoryUsage().heapUsed / 1048576).toFixed(1) + ' MiB');

/* ── 1. FLAG 0 ─────────────────────────────────────────────────────────── */
console.log('\nFASES (tiempo de pared medido dentro del proceso)');
global.APE_4K6K_AUDIT = 0;
const offRef = measure('flag 0 · enrich (apagado)', () => api.enrich(channels));
const offSame = offRef.out === channels;
const offShaMatch = sha256(J(offRef.out)) === sha256(sampleJson);

/* ── 2. FLAG 1 ─────────────────────────────────────────────────────────── */
global.APE_4K6K_AUDIT = 1;
const input = clone(channels);
const enrich1 = measure('flag 1 · enrich', () => api.enrich(input));
const audit1 = measure('flag 1 · audit', () => api.audit(enrich1.out));
const again = measure('flag 1 · enrich 2ª pasada', () => api.enrich(clone(enrich1.out)));

const idem = J(again.out) === J(enrich1.out);
const maxRss = process.resourceUsage().maxRSS / 1024; /* KB -> MiB en Windows/Linux */
const finalMem = process.memoryUsage();

/* ── RESULTADO ─────────────────────────────────────────────────────────── */
console.log('\nINVARIANTES');
console.log('  flag 0: enrich devuelve la MISMA referencia        : ' + offSame);
console.log('  flag 0: sha256(salida) === sha256(entrada)         : ' + offShaMatch);
console.log('  flag 1: canales procesados = N                     : ' + (enrich1.out.length === N));
console.log('  flag 1: audit.channels = N                         : ' + (audit1.out.before.channels === N));
console.log('  flag 1: audit.uris = N                             : ' + (audit1.out.before.uris === N));
console.log('  flag 1: idempotente a escala (2ª pasada == 1ª)     : ' + idem);
console.log('  ninguna variante executed:true en la salida        : ' + !/"executed"\s*:\s*true/.test(J(enrich1.out)));

const result = {
    schema: 'ape-4k6k-verificacion-escala/1',
    adapter_path: path.relative(REPO, ADAPTER).replace(/\\/g, '/'),
    adapter_sha256: sha256(require('fs').readFileSync(ADAPTER, 'utf8')),
    node_version: process.version,
    platform: process.platform,
    sample: { kind: 'synthetic_in_memory', channels: N, json_bytes: sampleBytes, sha256_json: sha256(sampleJson) },
    timings_ms: {
        flag0_enrich: Number(offRef.ms.toFixed(2)),
        flag1_enrich: Number(enrich1.ms.toFixed(2)),
        flag1_audit: Number(audit1.ms.toFixed(2)),
        flag1_enrich_second_pass: Number(again.ms.toFixed(2)),
        total_flag1: Number((enrich1.ms + audit1.ms + again.ms).toFixed(2))
    },
    memory_mib: {
        gc_forced: enrich1.gcForced,
        heap_delta_flag1_enrich: Number(enrich1.heapDeltaMiB.toFixed(1)),
        heap_delta_flag1_audit: Number(audit1.heapDeltaMiB.toFixed(1)),
        heap_used_end: Number((finalMem.heapUsed / 1048576).toFixed(1)),
        rss_end: Number((finalMem.rss / 1048576).toFixed(1)),
        max_rss_process: Number(maxRss.toFixed(1)),
        nota: 'maxRSS es el pico del PROCESO NODE COMPLETO (incluye la muestra sintética), no solo el adaptador'
    },
    invariants: {
        flag0_same_reference: offSame,
        flag0_sha_input_equals_output: offShaMatch,
        channels_preserved: enrich1.out.length === N,
        audit_channels_equals_n: audit1.out.before.channels === N,
        audit_uris_equals_n: audit1.out.before.uris === N,
        idempotent_at_scale: idem,
        no_executed_true: !/"executed"\s*:\s*true/.test(J(enrich1.out))
    }
};
console.log('\nJSON DE MEDICIÓN');
console.log(J(result));
process.exit(0);
