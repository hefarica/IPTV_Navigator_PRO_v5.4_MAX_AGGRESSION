/* Test del medidor de banda APE (bandwidth-meter-v1).
 * Determinista, sin red: alimenta ventanas sintéticas y verifica la aritmética,
 * el rechazo a inventar sin medición, el techo de concurrencia y que los
 * fallbacks por perfil queden FUERA del automatismo. */
'use strict';

const sufficiency = require('../js/ape-v9/streaming/sufficiency-law-v1.js');
const factory = require('../js/ape-v9/streaming/bandwidth-meter-v1.js');
/* root = lo que en el navegador es `window`. Se le pasa fetch/AbortController/
 * performance reales para que la sonda sintética se pueda probar de verdad. */
const meter = factory({
    evaluateSufficiency: sufficiency.evaluateSufficiency,
    fetch: globalThis.fetch,
    AbortController: globalThis.AbortController,
    performance: globalThis.performance
});

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (detail ? ' -> ' + detail : '')); }
}
/* n bins de 1 s, cada uno con `mbs` MEGABYTES decimales (1 MB = 1e6 B)
 * Nota: el modulo mide Mbps decimales (bytes*8/1e6). Usar 1048576 aquí
 * introduciría un 4,86 % de error de unidad — fue el primer fallo de este test. */
function win(mbs, n) {
    const out = [];
    for (let i = 0; i < (n || 5); i++) out.push({ t_ms: i * 1000, bytes: Math.round(mbs * 1e6) });
    return out;
}
function winVar(arr) {
    return arr.map((mbs, i) => ({ t_ms: i * 1000, bytes: Math.round(mbs * 1e6) }));
}

console.log('\n=== 1 · sin medición no hay números ===');
{
    const r = meter.integrate(20, [], { windowS: 5 });
    ok('estado NO_MEASUREMENT', r.state === 'NO_MEASUREMENT', r.state);
    ok('headroom null', r.headroomRatio === null);
    ok('risk null', r.risk === null);
    ok('recommend.config null', r.recommend.config === null);
    ok('sin satisfyExceptional', r.satisfiesExceptional === false || r.satisfiesExceptional === undefined);
}
{
    const r = meter.integrate(20, win(0, 5), { windowS: 5 });
    ok('ventana inactiva != 0 Mbps', r.state === 'NO_MEASUREMENT' && /no es 0 Mbps/.test(r.reason), r.reason);
}
{
    const r = meter.integrate(0, win(2, 5), { windowS: 5 });
    ok('sin exigencia → NO_REQUIREMENT', r.state === 'NO_REQUIREMENT', r.state);
}

console.log('\n=== 2 · aritmética de la ventana (2 MB/s) ===');
{
    const s = meter.summarize(win(2, 5), 5);
    ok('mbpsAvg = 16', s.mbpsAvg === 16, s.mbpsAvg);
    ok('mbpsSafe = 16 (sin jitter)', s.mbpsSafe === 16, s.mbpsSafe);
    ok('jitter = 0', s.jitter === 0, s.jitter);
    ok('5 bins', s.bins === 5, s.bins);
}

console.log('\n=== 3 · headroom 0.8x sobre 20 Mbps exigidos ===');
{
    const r = meter.integrate(20, win(2, 5), { windowS: 5 });
    ok('ratio 0.8', r.headroomRatio === 0.8, r.headroomRatio);
    ok('headroomPct -20', r.headroomPct === -20, r.headroomPct);
    ok('risk 75 (bajo 1.0x, ancla 1.0x=70 / 0x=95)', r.risk === 75, r.risk);
    ok('no excepcional', r.satisfiesExceptional === false);
    ok('buffer 8 s', r.recommend.config.bufferTargetS === 8, r.recommend.config.bufferTargetS);
    ok('concurrencia 1 (2*0.8=1)', r.recommend.config.parallelDownloads === 1, r.recommend.config.parallelDownloads);
}

console.log('\n=== 4 · headroom 4x → excepcional ===');
{
    const r = meter.integrate(20, win(10, 5), { windowS: 5 });
    ok('ratio 4', r.headroomRatio === 4, r.headroomRatio);
    ok('risk 5', r.risk === 5, r.risk);
    ok('satisfiesExceptional', r.satisfiesExceptional === true);
    ok('buffer 12 s', r.recommend.config.bufferTargetS === 12);
    ok('prefetch 6', r.recommend.config.prefetchSegments === 6);
    ok('concurrencia 8 (techo)', r.recommend.config.parallelDownloads === 8, r.recommend.config.parallelDownloads);
    ok('read timeout 90 s', r.recommend.config.readTimeoutMs === 90000);
}

console.log('\n=== 5 · jitter: un bin malo manda (min, no media) ===');
{
    const s = meter.summarize(winVar([10, 10, 1, 10, 10]), 5);
    ok('avg 65.6 sobre 5 bins', s.mbpsAvg === 65.6, s.mbpsAvg);
    ok('safe = min (8)', s.mbpsSafe === 8, s.mbpsSafe);
    const r = meter.integrate(20, winVar([10, 10, 1, 10, 10]), { windowS: 5 });
    ok('con un bin malo el ratio cae a 0.4', r.headroomRatio === 0.4, r.headroomRatio);
    ok('risk 85 (0.4x)', r.risk === 85, r.risk);
}

console.log('\n=== 6 · techo de concurrencia y anclas de riesgo ===');
{
    const r = meter.integrate(1, win(100, 5), { windowS: 5 });   // 800 Mbps sobre 1
    ok('concurrencia nunca > 8', r.recommend.config.parallelDownloads === 8, r.recommend.config.parallelDownloads);
    ok('ratio 800 (implausible lo filtra la ley)', r.headroomRatio === 800, r.headroomRatio);
    const seq = [3.5, 3, 2, 1.5, 1.3, 1, 0.5].map(meter.riskFromRatio);
    ok('risk monótono decreciente', seq.every((v, i) => i === 0 || v >= seq[i - 1]), JSON.stringify(seq));
    ok('risk en 3x = 5', meter.riskFromRatio(3) === 5, meter.riskFromRatio(3));
    ok('risk en 1.3x = 50', meter.riskFromRatio(1.3) === 50, meter.riskFromRatio(1.3));
}

console.log('\n=== 7 · los fallbacks por perfil NO se tocan ===');
{
    const r = meter.integrate(20, win(10, 5), { windowS: 5 });
    ok('declara fallback_chain_F0_F5 intacta', r.untouched.indexOf('fallback_chain_F0_F5') !== -1);
    ok('declara codec_ladder intacto', r.untouched.indexOf('codec_ladder_priority') !== -1);
    ok('declara anti_degradation_floor intacto', r.untouched.indexOf('anti_degradation_floor') !== -1);
    ok('la config no contiene tiers F0..F5', JSON.stringify(r.recommend.config).indexOf('F0') === -1);
    ok('la config no contiene RESOLUTION', JSON.stringify(r.recommend.config).toUpperCase().indexOf('RESOLUTION') === -1);
}

console.log('\n=== 8 · ventana de 10 s ===');
{
    const r = meter.integrate(25, win(5, 10), { windowS: 10 });
    ok('10 bins contados', r.measurement.bins === 10, r.measurement.bins);
    ok('ratio 40/25 = 1.6', r.headroomRatio === 1.6, r.headroomRatio);
    ok('estado SUFFICIENT', r.state === 'SUFFICIENT', r.state);
}

console.log('\n=== 9 · modo RT: no inventa sin tráfico de media ===');
(async () => {
    const r9 = await meter.measureAndIntegrate(20, { windowS: 1, mode: 'rt' });
    ok('sin tráfico de media → NO_MEASUREMENT/NO_RESOURCE_TIMING',
        r9.state === 'NO_MEASUREMENT' || r9.state === 'NO_RESOURCE_TIMING', r9.state);
    ok('sin config recomendada', r9.recommend.config === null);
    ok('explica la razón', typeof r9.reason === 'string' && r9.reason.length > 10, r9.reason);

    console.log('\n=== 10 · SONDA SINTÉTICA real (servidor local) — mide SIN reproducir ===');
    const http = require('http');
    const CHUNK = Buffer.alloc(64 * 1024, 0x41);
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'none' });
        let sent = 0;
        const iv = setInterval(() => {
            if (sent >= 16 * 1024 * 1024) { clearInterval(iv); res.end(); return; }
            res.write(CHUNK); sent += CHUNK.length;
        }, 8);
        req.on('close', () => clearInterval(iv));
    });

    const port = await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });

    const t0 = Date.now();
    const r10 = await meter.measureAndIntegrate(20, {
        windowS: 2,
        probeUrl: 'http://127.0.0.1:' + port + '/probe.bin'
    });
    const elapsed = Date.now() - t0;

    ok('la sonda mide SIN reproducir (ok=true)', r10.ok === true, r10.state);
    ok('fuente = synthetic-probe', r10.probe && r10.probe.source === 'synthetic-probe',
        r10.probe && r10.probe.source);
    ok('descargó bytes reales', r10.probe && r10.probe.bytes > 0, r10.probe && r10.probe.bytes);
    ok('ventana ≈ 2 s (no cuelga)', elapsed >= 1500 && elapsed <= 6000, elapsed + 'ms');
    ok('ratio calculado sobre lo medido', typeof r10.headroomRatio === 'number' && r10.headroomRatio > 0,
        r10.headroomRatio);
    ok('mbpsSafe es el mínimo de los bins', r10.measurement.mbpsSafe <= r10.measurement.mbpsAvg);
    ok('config recomendada presente', !!r10.recommend.config, JSON.stringify(r10.recommend));
    ok('concurrencia ≤ 8', r10.recommend.config.parallelDownloads <= 8,
        r10.recommend.config.parallelDownloads);
    ok('los fallbacks siguen intactos', r10.untouched.indexOf('fallback_chain_F0_F5') !== -1);

    /* Y con MODO AUTO: si la sonda falla, cae a Resource Timing o declara. */
    const r11 = await meter.measureAndIntegrate(20, {
        windowS: 1, mode: 'auto', probeUrl: 'http://127.0.0.1:1/no-existe.bin'
    });
    ok('modo auto con sonda rota no revienta', typeof r11.ok === 'boolean', r11.state);
    ok('modo auto sin datos NO inventa config', r11.ok ? !!r11.recommend.config : r11.recommend.config === null,
        r11.state);

    server.close();

    console.log('\n─────────────────────────────────────────────');
    console.log('  PASS ' + pass + ' · FAIL ' + fail);
    process.exit(fail === 0 ? 0 : 1);
})();
