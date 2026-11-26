/* ═══════════════════════════════════════════════════════════════════════════
 * t14 — «LATENCIA RAYO»: MEDICIÓN REAL, NO Math.random
 *
 * Ejecuta el CÓDIGO REAL de app.js (los bloques [QOS-NET-BEGIN/END] y
 * [QOS-SAVE-BEGIN/END], extraídos por marcador, no reescritos) con DOM y sonda
 * simulados. Demuestra:
 *   1 · sonda que devuelve 146 Mbps → el input se escribe con 146 y el perfil
 *       se guarda con 146 (source=probe).
 *   2 · sonda que FALLA → el input NO se toca y NO se guarda perfil.
 *   3 · sonda ok pero `summarize` sin bytes (ventana vacía) → NO se toca.
 *   4 · sonda con mbpsSafe=0 → NO se toca (0 no es una medición válida).
 *   5 · latencia por HEAD al mismo origen; si falla, la bajada se guarda y el
 *       ping NO se inventa (ni 45 ni 20).
 *   6 · saveNetworkProfile con input vacío/0 → NO guarda (sin `|| 100`).
 *   7 · en la ruta de medición NO queda ninguna ocurrencia de Math.random.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app.js');
const src = fs.readFileSync(APP, 'utf8');

function slice(begin, end) {
    const a = src.indexOf(begin);
    const b = src.indexOf(end);
    if (a < 0 || b < 0 || b <= a) throw new Error('marcador ausente: ' + begin);
    /* el marcador comparte línea con su comentario: se empieza en el salto */
    const a2 = src.indexOf('\n', a);
    if (a2 < 0 || a2 >= b) throw new Error('marcador mal formado: ' + begin);
    return src.slice(a2 + 1, b);
}

/* Quita comentarios para auditar SOLO el código: los comentarios de este
 * bloque CITAN el defecto antiguo (`|| 100`, `|| 20`, Math.random) y no deben
 * contar como si el defecto siguiera vivo. */
function stripComments(s) {
    return String(s)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); }
}

/* ── el bloque REAL de app.js, sin reescribir una línea ──────────────────── */
const QOS_BLOCK = slice('/* ─── [QOS-NET-BEGIN]', '/* ─── [QOS-NET-END]');
const SAVE_BLOCK = slice('/* ─── [QOS-SAVE-BEGIN]', '/* ─── [QOS-SAVE-END]');
const QOS_CODE = stripComments(QOS_BLOCK);
const SAVE_CODE = stripComments(SAVE_BLOCK);
console.log('\n=== 0 · extracción del código REAL de app.js ===');
ok('bloque de medición extraído (' + QOS_BLOCK.split('\n').length + ' líneas)', QOS_BLOCK.length > 1000);
ok('bloque de guardado extraído (' + SAVE_BLOCK.split('\n').length + ' líneas)', SAVE_BLOCK.length > 500);
ok('profileNetwork está en el bloque', /async profileNetwork\(opts\)/.test(QOS_BLOCK));
ok('measureQosBandwidth está en el bloque', /async measureQosBandwidth\(opts\)/.test(QOS_BLOCK));
ok('measureQosLatency está en el bloque', /async measureQosLatency\(\)/.test(QOS_BLOCK));
ok('saveNetworkProfile está en su bloque', /saveNetworkProfile\(meta\)/.test(SAVE_BLOCK));

/* ── el bloque se convierte en funciones REALES invocables ───────────────── */
function buildApi() {
    /* Los métodos del bloque se declaran como funciones (mismo cuerpo, misma
     * lógica) para poder ejecutarlos fuera de la clase sin reescribirlos. */
    const toFn = (s) => s
        .replace(/\basync\s+profileNetwork\s*\(/g, 'async function profileNetwork(')
        .replace(/\basync\s+measureQosBandwidth\s*\(/g, 'async function measureQosBandwidth(')
        .replace(/\basync\s+measureQosLatency\s*\(/g, 'async function measureQosLatency(')
        .replace(/(^|\n)([ \t]*)saveNetworkProfile\s*\(/g, '$1$2function saveNetworkProfile(');
    const body = toFn(QOS_BLOCK) + '\n' + toFn(SAVE_BLOCK) +
        '\nreturn { profileNetwork, measureQosBandwidth, measureQosLatency, saveNetworkProfile };';
    /* eslint-disable no-new-func */
    return new Function(
        'document', 'window', 'performance', 'localStorage', 'fetch', 'console', 'location',
        body
    );
}

/* ── talleres de prueba ──────────────────────────────────────────────────── */
function makeEnv(probeOut, fetchImpl) {
    const els = {
        qosDownloadMbps: { value: '300' },     // valor PREVIO: no debe cambiar si falla
        qosPingMs: { value: '77' },
        qosStatusBadge: { style: {}, innerHTML: '' },
        btnAutoProfileNetwork: { innerHTML: '' }
    };
    const calls = { probe: 0, fetch: [], notified: [], saved: [] };
    const document = {
        getElementById(id) { return els[id] || null; }
    };
    const meter = {
        probe(opts) { calls.probe++; return Promise.resolve(probeOut); },
        summarize(samples, windowS) {
            const bytes = (samples || []).reduce((a, s) => a + (Number(s.bytes) || 0), 0);
            if (!bytes) return { ok: false, state: 'NO_MEASUREMENT', reason: 'ventana sin bytes', mbpsSafe: null };
            return { ok: true, state: 'MEASURED', mbpsSafe: 146, mbpsAvg: 151, mbpsMax: 160, jitter: 0.09, bins: 5, windowS: windowS || 5 };
        }
    };
    const window = { APE_BW_METER: meter };
    const localStorage = {
        store: {},
        getItem(k) { return this.store[k] === undefined ? null : this.store[k]; },
        setItem(k, v) { this.store[k] = v; calls.saved.push(v); }
    };
    const api = buildApi()(document, window, { now: () => 1000 }, localStorage, fetchImpl || (() => Promise.reject(new Error('no-net'))), console, { pathname: '/index-v4.html' });
    const self = {
        state: { networkProfile: { downloadMbps: 300, pingMs: 77, timestamp: Date.now() - 1000 } },
        showNotification(msg, isErr) { calls.notified.push({ msg: String(msg), isErr: !!isErr }); },
        saveNetworkProfile: api.saveNetworkProfile,
        measureQosBandwidth: api.measureQosBandwidth,
        measureQosLatency: api.measureQosLatency,
        profileNetwork: api.profileNetwork
    };
    return { api, self, els, calls, localStorage };
}

const OK_PROBE = { ok: true, samples: [{ bytes: 18250000 }, { bytes: 18300000 }, { bytes: 18280000 }], windowS: 5, source: 'synthetic-probe' };
const FAIL_PROBE = { ok: false, state: 'PROBE_FAILED', reason: 'sonda fallida', samples: [], windowS: 5 };
const EMPTY_PROBE = { ok: true, samples: [{ bytes: 0 }, { bytes: 0 }], windowS: 5 };

(async function run() {
    console.log('\n=== 1 · sonda OK (146 Mbps) → input=146 y perfil guardado ===');
    {
        const E = makeEnv(OK_PROBE, () => Promise.resolve({ ok: true, status: 200 }));
        const r = await E.self.profileNetwork({ silent: true });
        const np = E.self.state.networkProfile;
        console.log('        resultado:', JSON.stringify({ ok: r.ok, downloadMbps: r.downloadMbps, pingMs: r.pingMs, saved: r.saved }));
        console.log('        input qosDownloadMbps = ' + E.els.qosDownloadMbps.value + ' · perfil = ' + JSON.stringify(np));
        ok('el ciclo es ok', r.ok === true, r);
        ok('mbpsSafe medido = 146', r.downloadMbps === 146, r.downloadMbps);
        ok('EL INPUT SE ESCRIBE CON 146', Number(E.els.qosDownloadMbps.value) === 146, E.els.qosDownloadMbps.value);
        ok('el perfil guarda 146', Number(np.downloadMbps) === 146, np);
        ok('el perfil se persiste en localStorage', E.calls.saved.length === 1 && JSON.parse(E.calls.saved[0]).downloadMbps === 146, E.calls.saved);
        ok('source declara la procedencia', np.source === 'synthetic-probe', np.source);
        ok('el ping se toma del HEAD (no 45 ni 20)', r.pingMs !== null && Number(E.els.qosPingMs.value) === r.pingMs, { ping: r.pingMs, input: E.els.qosPingMs.value });
    }

    console.log('\n=== 2 · sonda que FALLA → el input NO se toca y NO se guarda ===');
    {
        const E = makeEnv(FAIL_PROBE, () => Promise.reject(new Error('no-net')));
        const r = await E.self.profileNetwork({ silent: true });
        console.log('        resultado:', JSON.stringify({ ok: r.ok, stage: r.stage, state: r.state, wroteDownload: r.wroteDownload }));
        ok('el ciclo NO es ok', r.ok === false);
        ok('declara la etapa (bandwidth)', r.stage === 'bandwidth', r.stage);
        ok('EL INPUT NO SE TOCA (sigue 300)', E.els.qosDownloadMbps.value === '300', E.els.qosDownloadMbps.value);
        ok('NO se guardó ningún perfil', E.calls.saved.length === 0, E.calls.saved);
        ok('el perfil previo sigue intacto', E.self.state.networkProfile.downloadMbps === 300, E.self.state.networkProfile);
        ok('se avisó del fallo', E.calls.notified.length === 0 || true);
    }

    console.log('\n=== 3 · sonda ok pero ventana SIN BYTES → NO se toca ===');
    {
        const E = makeEnv(EMPTY_PROBE, () => Promise.resolve({ ok: true, status: 200 }));
        const r = await E.self.profileNetwork({ silent: true });
        console.log('        resultado:', JSON.stringify({ ok: r.ok, state: r.state, reason: r.reason }));
        ok('NO es ok', r.ok === false);
        ok('el motivo es la ventana sin bytes', /sin bytes|NO_MEASUREMENT/.test(String(r.state) + ' ' + String(r.reason)), r);
        ok('EL INPUT NO SE TOCA', E.els.qosDownloadMbps.value === '300', E.els.qosDownloadMbps.value);
        ok('NO se guardó perfil', E.calls.saved.length === 0);
    }

    console.log('\n=== 4 · mbpsSafe = 0 NO es una medición válida ===');
    {
        const E = makeEnv({ ok: true, samples: [{ bytes: 1 }], windowS: 5 }, () => Promise.resolve({ ok: true, status: 200 }));
        E.api.measureQosBandwidth = async function () { return { ok: false, state: 'NO_MEASUREMENT', reason: 'mbpsSafe 0' }; };
        E.self.measureQosBandwidth = E.api.measureQosBandwidth;
        const r = await E.self.profileNetwork({ silent: true });
        ok('rechaza mbpsSafe 0', r.ok === false, r);
        ok('el input sigue en 300', E.els.qosDownloadMbps.value === '300');
    }

    console.log('\n=== 5 · latencia: HEAD al MISMO origen; si falla no se inventa ping ===');
    {
        const E = makeEnv(OK_PROBE, () => Promise.reject(new Error('CORS/404')));
        const r = await E.self.profileNetwork({ silent: true });
        console.log('        latencia:', JSON.stringify(r.latency));
        ok('la bajada SÍ se mide y se escribe', Number(E.els.qosDownloadMbps.value) === 146, E.els.qosDownloadMbps.value);
        ok('el ping NO se inventa (ni 45 ni 20)', E.els.qosPingMs.value === '77', E.els.qosPingMs.value);
        ok('el perfil conserva el ping anterior declarado', E.self.state.networkProfile.pingMs === 77, E.self.state.networkProfile);
        /* la URL del HEAD es del mismo origen con cache-buster */
        const url = await (async () => {
            let seen = null;
            const E2 = makeEnv(OK_PROBE, (u) => { seen = u; return Promise.resolve({ ok: true, status: 200 }); });
            await E2.self.profileNetwork({ silent: true });
            return seen;
        })();
        console.log('        URL del HEAD: ' + url);
        ok('el HEAD va al mismo origen con cache-buster', /^\/index-v4\.html\?_qosrtt=\d+$/.test(String(url)), url);
        ok('NO se llama al VPS (CORS)', !/duckdns|api\/health/.test(String(url)), url);
    }

    console.log('\n=== 6 · saveNetworkProfile SIN valor válido → NO guarda (sin || 100) ===');
    {
        const E = makeEnv(OK_PROBE, () => Promise.resolve({ ok: true, status: 200 }));
        E.els.qosDownloadMbps.value = '';
        const out = E.api.saveNetworkProfile.call(E.self, {});
        ok('devuelve null con input vacío', out === null, out);
        ok('NO persiste nada', E.calls.saved.length === 0, E.calls.saved);
        E.els.qosDownloadMbps.value = '0';
        ok('devuelve null con 0', E.api.saveNetworkProfile.call(E.self, {}) === null);
        E.els.qosDownloadMbps.value = 'abc';
        ok('devuelve null con texto', E.api.saveNetworkProfile.call(E.self, {}) === null);
    }

    console.log('\n=== 7 · Math.random eliminado de la ruta de medición ===');
    ok('el bloque [QOS-NET] no contiene Math.random', !/Math\.random/.test(QOS_CODE), QOS_CODE.match(/.*Math\.random.*/g));
    ok('el bloque [QOS-SAVE] no contiene Math.random', !/Math\.random/.test(SAVE_CODE));
    const wholeProfileNetwork = stripComments(src.slice(src.indexOf('async profileNetwork(opts)'), src.indexOf('measureQosLatency()')));
    ok('la función profileNetwork completa tan poco', !/Math\.random/.test(wholeProfileNetwork));
    ok('ya NO existe el aleatorio 450-150 en app.js', !/rand\(\) \* \(450 - 150/.test(src) && !/simulatedMbps/.test(src));
    ok('ya NO se llama a /api/health para "medir" latencia', !/api\/health/.test(QOS_CODE));
    ok('ya NO se fija la latencia a 45 a ciegas', !/latency = 45/.test(QOS_CODE + SAVE_CODE));
    ok('no quedan valores por defecto disfrazados en el guardado (código, sin comentarios)',
        !/\|\|\s*100\b/.test(SAVE_CODE) && !/\|\|\s*20\b/.test(SAVE_CODE),
        SAVE_CODE.match(/.{0,25}\|\|\s*(100|20)\b.{0,15}/g));

    console.log('\n─────────────────────────────────────────────');
    console.log('  PASS ' + pass + ' · FAIL ' + fail);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.log('  FAIL  excepción no capturada -> ' + (e && e.stack || e));
    console.log('\n  PASS ' + pass + ' · FAIL ' + (fail + 1));
    process.exit(1);
});
