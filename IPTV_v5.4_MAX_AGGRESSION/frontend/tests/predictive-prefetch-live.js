/**
 * LIVE TEST — APE Predictive Prefetch v1.0 con MEDICIÓN REAL
 * Ejecutar: node frontend/tests/predictive-prefetch-live.js
 *
 * Qué mide: N descargas HTTP reales contra un servidor loopback propio
 * (socket TCP real, bytes reales, milisegundos reales). Con esas muestras
 * alimenta `APE_BW` (misma API que usa la página con Resource Timing) y luego
 * `APE_PREDICT`.
 *
 * Qué NO es: los bytes del payload son aleatorios (no hay stream IPTV), pero
 * la MEDICIÓN (bytes transferidos y duración) es real. No se inventan Mbps.
 */
'use strict';

const http = require('http');
const path = require('path');
const crypto = require('crypto');

const BW_PATH = path.join(__dirname, '..', 'js', 'ape-v9', 'streaming', 'bw-estimator-v9.js');
const PRED_PATH = path.join(__dirname, '..', 'js', 'ape-v9', 'streaming', 'predictive-prefetch-v9.js');

const BW = require(BW_PATH);
globalThis.APE_BW = BW;                 // contrato real: la página hace lo mismo
const P = require(PRED_PATH);

const PAYLOAD_BYTES = 1.5 * 1024 * 1024;
const FETCHES = 8;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  \u2705 ' + msg); } else { fail++; console.error('  \u274c ' + msg); } }

function fetchOnce(url) {
    return new Promise((resolve, reject) => {
        const t0 = process.hrtime.bigint();
        http.get(url, (res) => {
            let bytes = 0;
            res.on('data', (chunk) => { bytes += chunk.length; });
            res.on('end', () => {
                const ms = Number(process.hrtime.bigint() - t0) / 1e6;
                resolve({ bytes: bytes, ms: ms, status: res.statusCode });
            });
        }).on('error', reject);
    });
}

(async () => {
    const payload = crypto.randomBytes(PAYLOAD_BYTES);
    const server = http.createServer((req, res) => {
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(payload.length),
            'Cache-Control': 'no-store'
        });
        res.end(payload);
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const url = 'http://127.0.0.1:' + port + '/live/segment.ts';

    console.log('\n\u2550\u2550\u2550 MEDICIÓN REAL (loopback TCP) \u2550\u2550\u2550');
    console.log('  servidor: ' + url + ' (' + (PAYLOAD_BYTES / 1024).toFixed(0) + ' KB por respuesta)');

    const measured = [];
    try {
        for (let i = 0; i < FETCHES; i++) {
            const r = await fetchOnce(url);
            if (r.status !== 200 || !(r.bytes > 0)) throw new Error('respuesta inválida: ' + JSON.stringify(r));
            BW.sample(r.bytes, r.ms, 'segmento');
            P.observe(i * 250);
            const mbps = Math.round((r.bytes * 8 / (r.ms / 1000) / 1e6) * 100) / 100;
            measured.push({ bytes: r.bytes, ms: Math.round(r.ms), mbps: mbps });
            console.log('  #' + (i + 1) + '  ' + r.bytes + ' B en ' + r.ms.toFixed(1) + ' ms \u2192 ' + mbps + ' Mbps');
        }
    } catch (e) {
        console.error('\u274c Medición falló: ' + e.message);
        server.close();
        process.exit(2);
    }
    server.close();

    console.log('\n\u2550\u2550\u2550 PREDICCIÓN con esa evidencia \u2550\u2550\u2550');
    const sn = P.snapshot();
    console.log(JSON.stringify({
        base: sn.base, forecast: sn.forecast, predicted: sn.predicted,
        trend: sn.trend, slope: sn.slopeMbpsPerS, r2: sn.r2, jitter: sn.jitter,
        confidence: sn.confidence, evidence: sn.evidence
    }, null, 2));

    ok(sn.evidence.source === 'resource-timing', 'la evidencia declara resource-timing (no inventada)');
    ok(sn.evidence.samples >= FETCHES, 'muestras registradas = ' + sn.evidence.samples + ' (≥' + FETCHES + ')');
    ok(sn.base > 0, 'throughput medido > 0 (' + sn.base + ' Mbps)');
    ok(sn.confidence > 0, 'confianza > 0 con evidencia real (' + sn.confidence + ')');
    ok(isFinite(sn.predicted) && sn.predicted > 0, 'predicción finita y positiva (' + sn.predicted + ' Mbps)');

    const d = P.decide({ prefetch_ai_prediction: true, prefetch_segments: 90, prefetch_parallel: 40, bitrate: 12000 });
    console.log('\nDECISIÓN: ' + JSON.stringify({
        declared: d.declared, applied: d.applied, restricted: d.restricted,
        riskPct: d.riskPct, headroom: d.headroom, confidence: d.confidence,
        neuroLevel: d.neuroLevel, reasons: d.reasons
    }, null, 2));

    ok(d.enabled === true, 'decisión habilitada');
    ok(d.evidence.source === 'resource-timing', 'la decisión cita la evidencia medida');
    ok(d.riskPct !== null && d.riskPct >= 0 && d.riskPct <= 100, 'riesgo en rango válido (' + d.riskPct + '%)');
    ok(d.applied.segments <= 90 && d.applied.segments >= 3, 'segmentos aplicados dentro de [3, declarado]');
    ok(d.applied.parallel <= 40 && d.applied.parallel >= 1, 'paralelo aplicado dentro de [1, declarado]');

    // Sin evidencia el predictor no debe afirmar nada
    BW.reset();
    P.reset();
    const sn2 = P.snapshot();
    ok(sn2.evidence.source === 'none' && sn2.confidence === 0, 'tras reset sin medición: evidence none / confidence 0');

    console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log('LIVE RESULTADO: ' + pass + ' PASS / ' + fail + ' FAIL');
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR: ' + (e && e.stack || e)); process.exit(2); });
