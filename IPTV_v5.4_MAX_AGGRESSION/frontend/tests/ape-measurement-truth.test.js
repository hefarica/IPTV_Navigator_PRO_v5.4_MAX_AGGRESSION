#!/usr/bin/env node
/**
 * ape-measurement-truth.test.js — el medidor no puede mentir ni auto-bloquearse.
 *
 * Origen: consola real del operador (2026-11-21T22:45Z). Cadena medida:
 *   1. qos-speedtest/bandwidth-meter mandaban `Range: bytes=0-` y `X-APE-Rtt`.
 *   2. Esos headers NO son CORS-safelisted → preflight OPTIONS → nginx 405.
 *   3. status=0 → CÓRTEX STEALTH lo leyó como "host inalcanzable" y aplicó cooldowns.
 *   4. `mode:'auto'` cayó al sampler pasivo → 0.2 Mbps de tráfico incidental.
 *   5. `_applyAutoTune` reescribió los 12 perfiles a 0.01x.
 *
 * Este test fija las cinco invariantes para que no vuelvan a romperse.
 * Sin red, sin navegador, sin dependencias.
 *
 * Uso: node frontend/tests/ape-measurement-truth.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const F = {
    qos: path.join(ROOT, 'js/ape-v9/streaming/qos-speedtest-v1.js'),
    bw: path.join(ROOT, 'js/ape-v9/streaming/bandwidth-meter-v1.js'),
    speed: path.join(ROOT, 'js/ape-v9/ape-speed-meter-v9.js'),
    bridge: path.join(ROOT, 'js/ape-v9/ape-speedmeter-bridge.js'),
    pm: path.join(ROOT, 'js/ape-v9/profile-manager-v9.js'),
    html: path.join(ROOT, 'index-v4.html')
};

let pass = 0, fail = 0;
const fallos = [];

function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; fallos.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

/* Código efectivo: se quitan los comentarios de bloque y de línea para que un
 * comentario que NOMBRA un header prohibido no cuente como si lo enviara. */
function sinComentarios(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

console.log('\n=== 1 · Ningun medidor fuerza un preflight (Range / X-APE-Rtt) ===');
for (const [nombre, ruta] of [['qos-speedtest', F.qos], ['bandwidth-meter', F.bw], ['ape-speed-meter', F.speed]]) {
    const code = sinComentarios(read(ruta));
    ok(nombre + ' no envia header Range', !/\bRange\s*:/.test(code));
    ok(nombre + ' no envia X-APE-Rtt', !/X-APE-Rtt\s*['"]?\s*:/.test(code));
}

/* Correccion 2026-11-21 (medida en Chrome 157): `Range` simple es CORS-safelisted,
 * asi que su retirada es doctrina, no el fix del preflight. El preflight real lo
 * disparaba X-APE-Rtt. Esta asercion fija la retirada de ESE header. */
ok('headRtt ya no manda X-APE-Rtt', !/headers:\s*\{\s*'X-APE-Rtt'/.test(sinComentarios(read(F.qos))));

console.log('\n=== 2 · Los medidores miden con fetch NATIVO, no con el motor de evasion ===');
/* Se exige la DECLARACION, no la mera mencion: la primera version de este test
 * buscaba /NATIVE_FETCH/ y daba por bueno un archivo que lo USABA sin declararlo
 * (ReferenceError en runtime, cazado por t15-speedtest-autosave). */
ok('qos-speedtest declara NATIVE_FETCH', /var\s+NATIVE_FETCH\s*=/.test(read(F.qos)));
ok('bandwidth-meter declara NATIVE_FETCH', /var\s+NATIVE_FETCH\s*=/.test(read(F.bw)));
ok('ape-speed-meter declara NATIVE_FETCH', /var\s+NATIVE_FETCH\s*=/.test(read(F.speed)));
ok('qos-speedtest lo usa en measure()', /opts\.fetch\s*\|\|\s*NATIVE_FETCH/.test(read(F.qos)));
ok('ape-speed-meter lo usa en tirarDeUrl()', /NATIVE_FETCH\s*\|\|\s*fetch/.test(read(F.speed)));

console.log('\n=== 3 · summarize() publica los BYTES de la ventana ===');
/* UMD del repo: en Node exporta la FACTORY, no el objeto. Se invoca con globalThis. */
const bwMod = require(F.bw);
const BW = (typeof bwMod === 'function') ? bwMod(globalThis) : bwMod;
const suma = BW.summarize([
    { t_ms: 100, bytes: 4000 },
    { t_ms: 1100, bytes: 5000 },
    { t_ms: 2100, bytes: 6000 },
    { t_ms: 3100, bytes: 7000 }
], 4);
ok('summarize devuelve bytes', Number(suma.bytes) === 22000, 'bytes=' + suma.bytes);
ok('summarize sigue devolviendo mbpsSafe', suma.state === 'MEASURED' && suma.mbpsSafe > 0, JSON.stringify(suma));

console.log('\n=== 4 · Gate de procedencia: el artefacto NO puede mover parametros ===');
const T = BW.isTrustworthyMeasurement;

const sondaReal = T({ ok: true, probe: { bytes: 8388608, source: 'synthetic-probe' }, measurement: { state: 'MEASURED', mbpsSafe: 42.5, bytes: 8388608 } });
ok('sonda sintetica real -> TUNEABLE', sondaReal.ok === true, JSON.stringify(sondaReal));

const medidor8mb = T({ ok: true, measurement: { state: 'MEASURED', mbpsSafe: 80, bytes: 8000000, source: 'ape-speed-meter-v9' } });
ok('sonda 8MB (ape-speed-meter-v9) -> TUNEABLE', medidor8mb.ok === true, JSON.stringify(medidor8mb));

/* EL CASO DEL OPERADOR, literal: 0.2 Mbps con 200 KB de trafico incidental. */
const artefacto = T({ ok: true, probeError: { state: 'PROBE_FAILED' }, measurement: { state: 'MEASURED', mbpsSafe: 0.2, bytes: 200 * 1024 } });
ok('sampler pasivo con 200 KB -> NO tuneable', artefacto.ok === false, JSON.stringify(artefacto));
ok('la razon nombra el sampler pasivo', /sampler pasivo/.test(String(artefacto.reason)), artefacto.reason);

const deadline = T({ ok: false, state: 'CYCLE_DEADLINE', measurement: null });
ok('CYCLE_DEADLINE -> NO tuneable', deadline.ok === false, JSON.stringify(deadline));

const sinMedida = T({ ok: false, state: 'NO_MEASUREMENT', measurement: { state: 'NO_MEASUREMENT' } });
ok('NO_MEASUREMENT -> NO tuneable', sinMedida.ok === false, JSON.stringify(sinMedida));

const cero = T({ ok: true, probe: { bytes: 1000 }, measurement: { state: 'MEASURED', mbpsSafe: 0 } });
ok('mbpsSafe=0 -> NO tuneable', cero.ok === false, JSON.stringify(cero));

/* Trafico real suficiente por sampler pasivo SI es evidencia de transporte. */
const pasivoReal = T({ ok: true, measurement: { state: 'MEASURED', mbpsSafe: 8, bytes: 8 * 1024 * 1024 } });
ok('sampler pasivo con 8 MB -> tuneable', pasivoReal.ok === true, JSON.stringify(pasivoReal));

console.log('\n=== 5 · La sonda real no lanza: falla con motivo nombrado ===');
(async () => {
    const rechaza = () => Promise.reject(new TypeError('Failed to fetch'));
    const pr = await BW.probe({ fetch: rechaza, probeUrl: '/lists/x.m3u8', windowS: 1, maxBytes: 4096 });
    ok('probe() con fetch que falla -> ok:false', pr.ok === false, JSON.stringify({ state: pr.state, reason: pr.reason }));
    ok('probe() nombra el fallo (PROBE_FAILED/PROBE_ABORTED)', pr.state === 'PROBE_FAILED' || pr.state === 'PROBE_ABORTED', pr.state);

    console.log('\n=== 6 · measureAndIntegrate auto marca el fallback con probeError ===');
    const auto = await BW.measureAndIntegrate(20, { mode: 'auto', fetch: rechaza, windowS: 1 });
    ok('sin sonda y sin trafico -> ok:false', auto.ok !== true || !BW.isTrustworthyMeasurement(auto).ok,
        JSON.stringify({ ok: auto.ok, state: auto.state, hasProbe: !!auto.probe }));

    console.log('\n=== 7 · qos-speedtest: la peticion real NO lleva headers prohibidos ===');
    const qosMod = require(F.qos);
    const Q = (typeof qosMod === 'function') ? qosMod(globalThis) : qosMod;
    const vistos = [];
    const fakeRes = (bytes) => {
        let served = false;
        return {
            ok: true, status: 200,
            body: {
                getReader() {
                    return {
                        read() {
                            if (served) return Promise.resolve({ done: true });
                            served = true;
                            return Promise.resolve({ done: false, value: new Uint8Array(bytes) });
                        },
                        cancel() { return Promise.resolve(); }
                    };
                }
            }
        };
    };
    const stub = (url, init) => {
        vistos.push({ url: String(url), init: init || {} });
        return Promise.resolve(fakeRes(65536));
    };
    const defaults = Object.assign({}, Q.DEFAULTS, { minWindowS: 1, maxWindowS: 1, stopMinS: 1, stopCvPct: 0, maxBytesPerStream: 1024 * 1024 });
    const med = await Q.measure({ fetch: stub, windowS: 1, binS: 1, url: 'https://edge.example/x.m3u8', defaults: defaults });
    ok('qos.measure emitio peticiones', vistos.length > 0, 'n=' + vistos.length);
    const conRange = vistos.filter(v => {
        const h = v.init.headers || {};
        return Object.keys(h).some(k => /^range$/i.test(k) || /^x-ape-rtt$/i.test(k));
    });
    ok('ninguna peticion llevo Range/X-APE-Rtt', conRange.length === 0, JSON.stringify(conRange.slice(0, 2)));
    ok('qos.measure devuelve un objeto (no lanza)', !!med && typeof med === 'object', JSON.stringify({ ok: med && med.ok, state: med && med.state }));

    console.log('\n=== 8 · Contratos de integracion en los otros modulos ===');
    ok('profile-manager invoca el gate', /isTrustworthyMeasurement/.test(read(F.pm)));
    const bridgeSrc = read(F.bridge);
    ok('bridge resuelve contra la base del script', /desdeScript\('\.\.\/\.\.\/probe-8mb\.bin'\)/.test(bridgeSrc));
    ok('bridge resuelve contra la base de la pagina', /desdePagina\('probe-8mb\.bin'\)/.test(bridgeSrc));
    ok('bridge NO deriva X-APE-TARGET-BITRATE del caudal', !/headerOverrides\['X-APE-TARGET-BITRATE'\]\s*=/.test(sinComentarios(bridgeSrc)));
    ok('bridge declara la procedencia al auto-tune', /probe:\s*\{[^}]*source:\s*'ape-speed-meter-v9'/.test(bridgeSrc));

    console.log('\n=== 9 · Cache-busting: los assets del medidor ya no van con el token viejo ===');
    const html = read(F.html);
    ok('speed-meter con token preflight', /ape-speed-meter-v9\.js\?v=20261121-preflight/.test(html));
    ok('bridge con token preflight', /ape-speedmeter-bridge\.js\?v=20261121-preflight/.test(html));
    ok('bandwidth-meter con token preflight', /bandwidth-meter-v1\.js\?v=20261121-preflight/.test(html));
    ok('qos-speedtest con token preflight', /qos-speedtest-v1\.js\?v=20261121-preflight/.test(html));

    console.log('\n=== 10 · Ledger durable: el dato y el cálculo nunca se pierden ===');
    const setLS = (v) => {
        try { Object.defineProperty(globalThis, 'localStorage', { value: v, configurable: true, writable: true }); }
        catch (e) { globalThis.localStorage = v; }
    };
    setLS((() => {
        const m = new Map();
        return {
            getItem: (k) => (m.has(k) ? m.get(k) : null),
            setItem: (k, v) => { m.set(k, String(v)); },
            removeItem: (k) => { m.delete(k); },
            clear: () => m.clear(),
            get length() { return m.size; }
        };
    })());
    const L = require(path.join(ROOT, 'js/ape-v9/ape-measurement-ledger.js'));

    L.clear();
    ok('ledger arranca vacío', L.stats().mediciones === 0 && L.stats().planes === 0);
    L.pushMeasurement({ mbpsSafe: 102.53, bytes: 8000000, source: 'ookla-multistream', probeUrl: 'https://iptv-ape.duckdns.org/lists/streamlink.m3u8', accepted: true });
    ok('persiste la medición', L.stats().mediciones === 1 && L.lastMeasurement().mbpsSafe === 102.53);
    ok('clasifica el ámbito del edge', L.lastMeasurement().scope === 'edge', L.lastMeasurement().scope);

    L.pushMeasurement({ mbpsSafe: 355.506, probeUrl: 'http://127.0.0.1:5500/IPTV_v5.4_MAX_AGGRESSION/frontend/probe-8mb.bin', accepted: false, reason: 'loopback' });
    ok('clasifica loopback', L.lastMeasurement().scope === 'loopback', L.lastMeasurement().scope);
    ok('persiste TAMBIÉN la rechazada', L.stats().mediciones === 2 && L.stats().rechazadas === 1);

    L.pushPlan({ mbps: 102.53, perfiles: [{ id: 'P0', cacheMs: 25000, ratio: 5.09 }] });
    ok('persiste el plan con sus cálculos', L.stats().planes === 1 && L.lastPlan().perfiles[0].cacheMs === 25000);

    L.setState({ mbps: 102.53, pendingLow: 0 });
    ok('el estado sobrevive a la recarga', L.getState().mbps === 102.53);

    const dump = L.export();
    ok('export produce JSON válido', (() => { try { JSON.parse(dump); return true; } catch (e) { return false; } })());
    L.clear();
    const imp = L.importar(dump);
    ok('import restaura mediciones y planes', imp.ok && L.stats().mediciones === 2 && L.stats().planes === 1);

    L.clear();
    for (let i = 0; i < L.MAX_MEASUREMENTS + 25; i++) L.pushMeasurement({ mbpsSafe: i, accepted: false });
    ok('recorta al máximo configurado', L.stats().mediciones === L.MAX_MEASUREMENTS, 'n=' + L.stats().mediciones);

    setLS({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } });
    let rompio = false;
    try { L.pushMeasurement({ mbpsSafe: 1 }); L.getState(); L.stats(); } catch (e) { rompio = true; }
    ok('con localStorage roto NO lanza', rompio === false);
    setLS(undefined);

    console.log('\n=== 11 · Gates nuevos: piso de bytes y loopback ===');
    ok('rechaza sonda de 4 KB', BW.isTrustworthyMeasurement({ ok: true, probe: { bytes: 4096, probeUrl: 'https://iptv-ape.duckdns.org/lists/x.m3u8' }, measurement: { state: 'MEASURED', mbpsSafe: 1.18 } }).ok === false);
    ok('rechaza sonda en loopback', BW.isTrustworthyMeasurement({ ok: true, probe: { bytes: 8388608, probeUrl: 'http://127.0.0.1:5500/probe-8mb.bin' }, measurement: { state: 'MEASURED', mbpsSafe: 355 } }).ok === false);
    ok('acepta sonda edge con bytes', BW.isTrustworthyMeasurement({ ok: true, probe: { bytes: 8388608, probeUrl: 'https://iptv-ape.duckdns.org/lists/x.m3u8' }, measurement: { state: 'MEASURED', mbpsSafe: 102.53 } }).ok === true);

    console.log('\n=== 12 · Contratos de hardening en los módulos ===');
    const pmSrc = read(F.pm);
    ok('profile-manager tiene histéresis', /caída súbita/.test(pmSrc) && /pendingLow/.test(pmSrc));
    ok('profile-manager persiste el plan', /pushPlan/.test(pmSrc));
    const brSrc = read(F.bridge);
    ok('bridge prefiere la medición del edge', /medirConOokla/.test(brSrc));
    ok('bridge persiste cada medición', /pushMeasurement/.test(brSrc));
    ok('bridge rechaza loopback', /loopback/.test(brSrc));
    const htmlSrc = read(F.html);
    const iLedger = htmlSrc.indexOf('ape-measurement-ledger.js');
    const iSpeed = htmlSrc.indexOf('ape-speed-meter-v9.js');
    ok('index carga el ledger ANTES de los medidores', iLedger > 0 && iSpeed > 0 && iLedger < iSpeed, 'ledger@' + iLedger + ' speed@' + iSpeed);

    console.log('\n────────────────────────────────────────');
    console.log('  PASS=' + pass + '  FAIL=' + fail);
    if (fail) { console.log('  fallos:'); fallos.forEach(f => console.log('   - ' + f)); }
    console.log('────────────────────────────────────────\n');
    process.exit(fail ? 1 : 0);
})().catch(e => {
    console.error('EXCEPCION no capturada:', e && e.stack || e);
    process.exit(1);
});
