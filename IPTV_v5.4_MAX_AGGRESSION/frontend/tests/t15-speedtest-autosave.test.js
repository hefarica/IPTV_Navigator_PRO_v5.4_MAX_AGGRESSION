/* ═══════════════════════════════════════════════════════════════════════════
 * t15 · BOTÓN ÚNICO + MEDICIÓN TIPO OOKLA + AUTOGUARDADO
 *
 * Mide contra SERVIDORES HTTP REALES en loopback (no mocks de red): uno estable,
 * uno oscilante y uno que retrasa bajo carga. Verifica los 6 puntos del contrato:
 *   1 · parada adaptativa (estable → antes del tope; oscilante → al tope)
 *   2 · multiconexión (N streams y suma > 1 stream contra el mismo servidor)
 *   3 · bufferbloat (RTT cargado − RTT idle > 0 y declarado)
 *   4 · autoguardado (ape_qoe_plan_v1 tras aplicar; restaura; caducado no aplica)
 *   5 · aplicar-a-todos (todos los perfiles, cada uno con SU bitrate, idempotente)
 *   6 · doble clic → 1 medición
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const http = require('http');
const FRONT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── almacén localStorage en memoria (con contador de escrituras) ─────────── */
const LS = {};
const store = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(LS, k) ? LS[k] : null),
    setItem: (k, v) => { LS[k] = String(v); store.writes++; },
    removeItem: (k) => { delete LS[k]; },
    writes: 0
};
global.window = global;
try { Object.defineProperty(global, 'localStorage', { value: store, configurable: true, writable: true }); } catch (e) {}
try { Object.defineProperty(global, 'navigator', { value: { userAgent: 'node-t15', hardwareConcurrency: 8 }, configurable: true, writable: true }); } catch (e) {}

/* DOM mínimo con registro por id (para leer lo que el panel pinta) */
const __els = {};
function fakeEl() {
    const e = {
        style: {}, classList: { add() {}, remove() {} }, children: [],
        appendChild(c) { this.children.push(c); return c; },
        insertBefore(c) { this.children.push(c); return c; },
        setAttribute() {}, removeAttribute() {}, getBoundingClientRect() { return { top: 0, left: 0, bottom: 0 }; },
        querySelector() { return null; }, querySelectorAll() { return []; },
        addEventListener() {}, removeEventListener() {},
        innerHTML: '', textContent: '', value: '', title: '', disabled: false,
        parentNode: null
    };
    /* un elemento creado con id queda registrado: getElementById lo encuentra */
    Object.defineProperty(e, 'id', {
        get() { return e._id || ''; },
        set(v) { e._id = v; if (v) __els[v] = e; },
        configurable: true
    });
    return e;
}
function elById(id) { if (!__els[id]) __els[id] = fakeEl(); return __els[id]; }
global.document = {
    hidden: false,
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement: () => fakeEl(),
    getElementById: (id) => elById(id),
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}
};

const SPEED = require(path.join(FRONT, 'js/ape-v9/streaming/qos-speedtest-v1.js'))(global);

/* ── servidores de prueba ─────────────────────────────────────────────────── */
const CHUNK = 64 * 1024;

/* estable: entrega ~RATE bps por stream, repartido en trozos */
function makeServer(mode) {
    const state = { hits: 0, rttCalls: 0, active: 0, maxActive: 0, bytesStream: 0 };
    const srv = http.createServer((req, res) => {
        state.hits++;
        if (req.method === 'HEAD') {
            state.rttCalls++;
            /* el de bufferbloat: retrasa el HEAD si hay carga */
            const delay = (mode === 'bloat' && state.active > 0) ? 120 : 0;
            setTimeout(() => { res.writeHead(200, { 'Content-Length': 0 }); res.end(); }, delay);
            return;
        }
        state.active++;
        state.maxActive = Math.max(state.maxActive, state.active);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
        let sent = 0;
        const t0 = Date.now();
        /* caudal CONTINUO hasta que el cliente corte: la ventana de medición
         * siempre tiene datos y la parada adaptativa es observable. */
        const timer = setInterval(() => {
            if (res.writableEnded) { clearInterval(timer); return; }
            let rate = 1;
            if (mode === 'oscillating') {
                /* oscila fuerte: 0,5× / 8× alternando cada 700 ms */
                rate = (Math.floor((Date.now() - t0) / 700) % 2) ? 8 : 0.5;
            }
            const n = Math.min(CHUNK, Math.max(1, Math.round((CHUNK / 4) * rate)));
            const buf = Buffer.alloc(n, 0x41);
            sent += n;
            state.bytesStream += n;
            try { res.write(buf); } catch (e) {}
        }, 25);
        req.on('close', () => { clearInterval(timer); if (state.active > 0) state.active--; });
    });
    return { srv: srv, state: state };
}

(async function main() {
    console.log('═════════════════════════════════════════════════════════════');
    console.log('  t15 · BOTÓN ÚNICO · MEDICIÓN OOKLA · AUTOGUARDADO');
    console.log('═════════════════════════════════════════════════════════════');

    /* ── 1 · PARADA ADAPTATIVA ───────────────────────────────────────────── */
    console.log('\n=== 1 · parada adaptativa: estable corta antes del tope, oscilante agota ===');
    const est = makeServer('stable');
    await new Promise(r => est.srv.listen(0, '127.0.0.1', r));
    const estUrl = 'http://127.0.0.1:' + est.srv.address().port + '/probe.bin';
    const rEst = await SPEED.measure({ url: estUrl, windowS: 10, hardwareConcurrency: 8 });
    console.log('        estable: stop=' + rEst.stopReason + ' elapsed=' + rEst.elapsedS + ' s · bins=' + rEst.bins +
        ' · cv=' + rEst.cvPct + ' % · safe=' + rEst.mbpsSafe + ' · p95=' + rEst.mbpsP95);
    ok('estable: midió', rEst.ok === true, rEst);
    ok('estable: paró ANTES del tope (elapsed ' + rEst.elapsedS + ' s < 10 s)', rEst.elapsedS < 10, rEst.elapsedS);
    ok('estable: motivo adaptativa', rEst.stopReason === 'adaptativa', rEst.stopReason);
    ok('estable: CV bajo (' + rEst.cvPct + ' % < 5 %)', rEst.cvPct !== null && rEst.cvPct < 5, rEst.cvPct);

    const osc = makeServer('oscillating');
    await new Promise(r => osc.srv.listen(0, '127.0.0.1', r));
    const oscUrl = 'http://127.0.0.1:' + osc.srv.address().port + '/probe.bin';
    const rOsc = await SPEED.measure({ url: oscUrl, windowS: 5, hardwareConcurrency: 8 });
    console.log('        oscilante: stop=' + rOsc.stopReason + ' elapsed=' + rOsc.elapsedS + ' s · bins=' + rOsc.bins +
        ' · cv=' + rOsc.cvPct + ' % · safe=' + rOsc.mbpsSafe);
    ok('oscilante: midió', rOsc.ok === true, rOsc);
    ok('oscilante: llegó al tope (stop=' + rOsc.stopReason + ')', rOsc.stopReason === 'tope', rOsc.stopReason);
    ok('oscilante: CV alto (' + rOsc.cvPct + ' % ≥ 5 %)', rOsc.cvPct !== null && rOsc.cvPct >= 5, rOsc.cvPct);

    /* ── 2 · MULTICONEXIÓN ──────────────────────────────────────────────── */
    console.log('\n=== 2 · multiconexión: N streams y suma > 1 stream (mismo servidor) ===');
    ok('N = clamp(hc/2, 4, 8) con hc=8 → 4', SPEED.streamsFor(8) === 4, SPEED.streamsFor(8));
    ok('hc=16 → 8', SPEED.streamsFor(16) === 8, SPEED.streamsFor(16));
    ok('hc=2 → 4 (piso)', SPEED.streamsFor(2) === 4, SPEED.streamsFor(2));
    console.log('        streams declarados=' + rEst.streams + ' · activos simultáneos (servidor)=' + est.state.maxActive +
        ' · bytes totales=' + rEst.totalBytes + ' · por stream=' + JSON.stringify(rEst.streamsBytes));
    ok('midió con ' + rEst.streams + ' streams en paralelo', rEst.streams >= 4, rEst.streams);
    ok('el servidor vio ≥ 2 conexiones SIMULTÁNEAS (max=' + est.state.maxActive + ')', est.state.maxActive >= 2, est.state.maxActive);
    ok('todos los streams aportaron bytes', (rEst.streamsBytes || []).every(b => b > 0), rEst.streamsBytes);

    /* 1 solo stream contra el MISMO servidor, misma ventana */
    const single = await SPEED.measure({ url: estUrl, windowS: 3, hardwareConcurrency: 2, defaults: Object.assign({}, SPEED.DEFAULTS, { streamsMin: 1, streamsMax: 1 }) });
    console.log('        1 stream: total=' + single.totalBytes + ' B · 4 streams: total=' + rEst.totalBytes + ' B (ventanas distintas)');
    const singleRate = single.totalBytes / Math.max(1, single.elapsedS);
    const multiRate = rEst.totalBytes / Math.max(1, rEst.elapsedS);
    console.log('        tasa 1 stream=' + Math.round(singleRate / 1024) + ' KB/s · tasa 4 streams=' + Math.round(multiRate / 1024) + ' KB/s');
    ok('la tasa con ' + rEst.streams + ' streams SUPERA la de 1 solo stream', multiRate > singleRate, { singleRate, multiRate });

    /* ── 3 · BUFFERBLOAT ────────────────────────────────────────────────── */
    console.log('\n=== 3 · bufferbloat: servidor que retrasa bajo carga ===');
    const bl = makeServer('bloat');
    await new Promise(r => bl.srv.listen(0, '127.0.0.1', r));
    const blUrl = 'http://127.0.0.1:' + bl.srv.address().port + '/probe.bin';
    const rBl = await SPEED.measure({ url: blUrl, windowS: 5, hardwareConcurrency: 8 });
    console.log('        rttIdle=' + rBl.rttIdleMs + ' ms · rttCargado=' + rBl.rttLoadedMs +
        ' ms · bufferbloat=' + rBl.bufferbloatMs + ' ms · safe=' + rBl.mbpsSafe);
    ok('midió bajo carga', rBl.ok === true, rBl);
    ok('rttIdle medido', typeof rBl.rttIdleMs === 'number' && rBl.rttIdleMs >= 0, rBl.rttIdleMs);
    ok('rttCargado medido', typeof rBl.rttLoadedMs === 'number', rBl.rttLoadedMs);
    ok('bufferbloat > 0 y DECLARADO (' + rBl.bufferbloatMs + ' ms)', rBl.bufferbloatMs > 0, rBl.bufferbloatMs);

    /* ── 4 · AUTOGUARDADO ───────────────────────────────────────────────── */
    console.log('\n=== 4 · autoguardado: se guarda TRAS aplicar, restaura, y caducado no aplica ===');
    require(path.join(FRONT, 'js/ape-v9/ape-profiles-config.js'));
    require(path.join(FRONT, 'js/ape-v9/prefetch-presets.js'));
    require(path.join(FRONT, 'js/ape-v9/streaming-calculator.js'));
    /* el tuner real: coherentPlan vive ahí y sin él no hay plan que aplicar */
    window.APE_HEALTH_TUNER = require(path.join(FRONT, 'js/ape-v9/streaming/auto-tune-v1.js'))({});
    const CFG = window.APE_PROFILES_CONFIG;
    require(path.join(FRONT, 'js/ape-v9/profile-manager-v9.js'));
    const PM = window.ProfileManagerV9;
    PM.config = CFG;
    PM.activeProfileId = 'P0';
    if (!PM.config.getProfile('P0')) { console.log('  FAIL  sin perfiles'); process.exit(1); }
    PM._bwAutoStarted = true;                       // no arrancar el gobernador aquí
    const fakeMeasured = { ok: true, mbpsSafe: 400, mbpsP95: 460, mbpsAvg: 420, jitterMbps: 6.5, bufferbloatMs: 120, rttIdleMs: 18, source: 'ookla-multistream', bins: 6, windowS: 8 };
    global.app = {
        state: { networkProfile: null },
        measureQosBandwidth: async () => fakeMeasured,
        applyNetworkMeasurement: (m) => {
            if (!m || m.ok !== true) return { ok: false, wrote: false };
            global.app.state.networkProfile = {
                downloadMbps: m.mbpsSafe, pingMs: m.rttIdleMs, timestamp: Date.now(),
                source: m.source, mbpsP95: m.mbpsP95, jitterMbps: m.jitterMbps, bufferbloatMs: m.bufferbloatMs
            };
            return { ok: true, wrote: true };
        }
    };
    window.app = global.app;

    const run1 = await PM.qosRunAll('one');
    console.log('        aplicar uno: state=' + run1.state + ' · perfiles=' + JSON.stringify(run1.appliedIds) + ' · saved=' + run1.saved);
    ok('aplicó al perfil activo', run1.ok === true && run1.appliedIds.length === 1 && run1.appliedIds[0] === 'P0', run1.appliedIds);
    ok('guardó el plan (saved=true)', run1.saved === true);
    const rawPlan = LS['ape_qoe_plan_v1'] ? JSON.parse(LS['ape_qoe_plan_v1']) : null;
    console.log('        ape_qoe_plan_v1 → ' + (rawPlan ? Object.keys(rawPlan.profiles).length + ' perfil(es) · ts=' + !!rawPlan.ts : 'AUSENTE'));
    ok('existe ape_qoe_plan_v1', !!rawPlan);
    const p0 = rawPlan && rawPlan.profiles ? rawPlan.profiles.P0 : null;
    console.log('        P0 guardado: ' + JSON.stringify(p0));
    ok('el plan guardado trae los 4 valores y la BASE',
        p0 && p0.bufferTargetS > 0 && p0.prefetchSegments > 0 && p0.parallelDownloads > 0 &&
        p0.bwMinMbps > 0 && p0.basis > 0, p0);
    ok('la base es calculateBitrate (no el declarado)', p0 && p0.basisSource === 'calculateBitrate del panel', p0 && p0.basisSource);
    ok('se guardó la medición con sus métricas', rawPlan.measurement && rawPlan.measurement.mbpsSafe === 400 &&
        rawPlan.measurement.bufferbloatMs === 120, rawPlan.measurement);

    /* restauración */
    const rest = PM._restoreQoePlan();
    console.log('        restaurar → ' + JSON.stringify({ restored: rest.restored, plan: !!rest.plan }));
    ok('restaura el plan del perfil activo', rest.restored === true, rest);

    /* caducado → NO aplica */
    const rec = JSON.parse(LS['ape_qoe_plan_v1']);
    rec.ts = Date.now() - (30 * 60 * 1000);
    LS['ape_qoe_plan_v1'] = JSON.stringify(rec);
    const restOld = PM._restoreQoePlan();
    console.log('        caducado → ' + JSON.stringify({ restored: restOld.restored, stale: !!restOld.stale }));
    ok('caducado NO restaura', restOld.restored === false && restOld.stale === true, restOld);

    /* ── 5 · APLICAR A TODOS ────────────────────────────────────────────── */
    console.log('\n=== 5 · aplicar a TODOS: cada perfil con SU bitrate, idempotente ===');
    const ids = PM._allProfileIds();
    console.log('        perfiles configurados: ' + ids.length + ' → ' + ids.join(', '));
    const runAll = await PM.qosRunAll('all');
    const bases = {};
    Object.keys(runAll.profiles).forEach(id => { bases[id] = runAll.profiles[id].basis; });
    console.log('        aplicados=' + runAll.appliedIds.length + ' · bases (Mbps)=' + JSON.stringify(bases));
    ok('cubrió TODOS los perfiles configurados (' + ids.length + ')', runAll.appliedIds.length === ids.length,
        { applied: runAll.appliedIds.length, ids: ids.length });
    ok('cada perfil usó SU propio bitrate de base',
        new Set(Object.values(bases)).size > 1, bases);
    ok('los 12/6 perfiles declaran base > 0', Object.values(bases).every(b => b > 0), bases);

    const snap1 = JSON.stringify(Object.keys(runAll.profiles).map(k => runAll.profiles[k].bufferTargetS + '/' +
        runAll.profiles[k].prefetchSegments + '/' + runAll.profiles[k].parallelDownloads + '/' + runAll.profiles[k].bwMinMbps));
    const runAll2 = await PM.qosRunAll('all');
    const snap2 = JSON.stringify(Object.keys(runAll2.profiles).map(k => runAll2.profiles[k].bufferTargetS + '/' +
        runAll2.profiles[k].prefetchSegments + '/' + runAll2.profiles[k].parallelDownloads + '/' + runAll2.profiles[k].bwMinMbps));
    console.log('        pasada 2 idéntica = ' + (snap1 === snap2));
    ok('segunda pasada NO cambia valores (idempotente)', snap1 === snap2, { snap1, snap2 });

    /* ── 6 · DOBLE CLIC → 1 MEDICIÓN ────────────────────────────────────── */
    console.log('\n=== 6 · doble clic → UNA sola medición ===');
    let calls = 0;
    global.app = {
        state: { networkProfile: null },
        measureQosBandwidth: async () => { calls++; await sleep(60); return fakeMeasured; },
        applyNetworkMeasurement: () => ({ ok: true, wrote: true })
    };
    window.app = global.app;
    PM._qosRunPromise = null;
    const p1 = PM.qosRunAll('one');
    const p2 = PM.qosRunAll('one');
    ok('la segunda pulsación REUTILIZA la promesa en vuelo', p1 === p2, { same: p1 === p2 });
    await Promise.all([p1, p2]);
    console.log('        sondas ejecutadas = ' + calls);
    ok('exactamente 1 medición para dos clics', calls === 1, calls);

    /* ── LED / feedback ─────────────────────────────────────────────────── */
    console.log('\n=== 7 · feedback visual (LED + botón deshabilitado) ===');
    const btn = document.getElementById('pm9_auto_adjust_btn');
    PM._qosUiStart({});
    const midText = String(btn.innerHTML);
    const disabled = btn.disabled === true;
    const leds = document.getElementById('pm9_qos_leds');
    PM._qosUiStop({ measured: { ok: true }, coherent: true });
    console.log('        durante: texto="' + midText + '" disabled=' + disabled + ' · LEDs=' + (leds ? leds.children.length : 0));
    ok('el botón se deshabilita y dice "Midiendo… N s"', disabled && /Midiendo…\s*\d+\s*s/.test(midText), midText);
    ok('hay LED de puntos (' + (leds ? leds.children.length : 0) + ')', leds && leds.children.length >= 3, leds && leds.children.length);
    ok('al terminar el botón se rehabilita', btn.disabled === false, btn.disabled);
    ok('el LED queda VERDE con plan coherente', String((leds.children[0] || {}).style.background).indexOf('10b981') >= 0,
        (leds.children[0] || {}).style.background);
    PM._qosUiStart({});
    PM._qosUiStop({ measured: { ok: true }, coherent: false });
    ok('el LED queda ÁMBAR si midió pero no alcanza',
        String((leds.children[0] || {}).style.background).indexOf('eab308') >= 0, (leds.children[0] || {}).style.background);
    PM._qosUiStart({});
    PM._qosUiStop({ measured: { ok: false }, coherent: false });
    ok('el LED queda ROJO si no pudo medir',
        String((leds.children[0] || {}).style.background).indexOf('ef4444') >= 0, (leds.children[0] || {}).style.background);

    /* ── 8 · sin medición: no se escribe nada ───────────────────────────── */
    console.log('\n=== 8 · si no se puede medir, NO se escribe ni se aplica ===');
    const before = JSON.stringify(LS['ape_qoe_plan_v1'] || null);
    global.app = { measureQosBandwidth: async () => ({ ok: false, state: 'NO_MEASUREMENT', reason: 'sin bytes' }) };
    window.app = global.app;
    PM._qosRunPromise = null;
    const bad = await PM.qosRunAll('one');
    const after = JSON.stringify(LS['ape_qoe_plan_v1'] || null);
    console.log('        state=' + bad.state + ' · reason=' + bad.reason + ' · plan intacto=' + (before === after));
    ok('state NO_MEASUREMENT propagado', bad.state === 'NO_MEASUREMENT', bad.state);
    ok('NO se aplicó ni se guardó nada', bad.ok === false && before === after, { before: !!before, after: !!after });

    est.srv.close(); osc.srv.close(); bl.srv.close();
    await sleep(50);
    console.log('\n─────────────────────────────────────────────');
    console.log('  PASS ' + pass + ' · FAIL ' + fail);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.log('  FAIL  excepción no capturada -> ' + (e && e.stack || e));
    console.log('  PASS ' + pass + ' · FAIL ' + (fail + 1));
    process.exit(1);
});
