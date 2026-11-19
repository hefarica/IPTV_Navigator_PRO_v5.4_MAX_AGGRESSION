/* ═══════════════════════════════════════════════════════════════════════════
 * t13 — GOBERNADOR DE CALIBRACIÓN: prueba del BUCLE con el código REAL
 *
 * Carga la clase REAL (profile-manager-v9.js) con la capa de config REAL
 * (ape-profiles-config.js), el tuner REAL (auto-tune-v1.js), los presets REALES
 * y el calculador REAL. Lo único simulado es el MEDIDOR (APE_BW_METER), que es
 * justo lo que la prueba tiene que guionizar.
 *
 * Verifica el ciclo completo:
 *   mbps=400  -> ok, plan coherente, APLICA los cuatro campos al perfil
 *   mbps=0.1  -> ok:false, NO aplica, CONSERVA el juego anterior y publica
 *                violations + neededMbpsForGreen
 *   mbps=400 de nuevo (mismo plan) -> skipped por ANTIOSCILACIÓN
 *   dos ticks con un ciclo lento -> skipped (máximo 1 ciclo en vuelo)
 *   startGovernor idempotente · stopGovernor detiene · plazo del ciclo
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');

/* ── stubs de navegador ───────────────────────────────────────────────────── */
function fakeEl() {
    return {
        style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
        appendChild() {}, setAttribute() {}, removeAttribute() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        addEventListener() {}, removeEventListener() {},
        innerHTML: '', textContent: '', value: '', title: ''
    };
}
global.window = global;
/* navigator/localStorage son getters en Node >=21: se redefinen, no se asignan. */
function stubGlobal(name, value) {
    try { Object.defineProperty(global, name, { value: value, configurable: true, writable: true }); }
    catch (e) { /* si no se puede, el stub ya existe y sirve */ }
}
stubGlobal('navigator', { userAgent: 'node-t13-governor' });
stubGlobal('localStorage', { getItem() { return null; }, setItem() {} });
/* registro de elementos por id: permite LEER lo que el panel pinta */
const __els = {};
function elById(id) {
    if (!__els[id]) __els[id] = fakeEl();
    return __els[id];
}
global.document = {
    hidden: false,
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement: () => fakeEl(),
    getElementById: (id) => elById(id),
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    _vis: [],
    addEventListener(ev, fn) { if (ev === 'visibilitychange') this._vis.push(fn); },
    removeEventListener() {}
};

const FRONT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── carga del stack REAL (orden del index-v4.html) ───────────────────────── */
const factory = require(path.join(FRONT, 'js/ape-v9/streaming/auto-tune-v1.js'));
require(path.join(FRONT, 'js/ape-v9/ape-profiles-config.js'));
require(path.join(FRONT, 'js/ape-v9/prefetch-presets.js'));
require(path.join(FRONT, 'js/ape-v9/streaming-calculator.js'));
window.APE_HEALTH_TUNER = factory({});
const tuner = window.APE_HEALTH_TUNER;
require(path.join(FRONT, 'js/ape-v9/profile-manager-v9.js'));

const PM = window.ProfileManagerV9;
const CFG = window.APE_PROFILES_CONFIG;

/* ── medidor guionizado (lo único simulado) ──────────────────────────────── */
const script = [];      // {mbps, ratio, delayMs}
let measureCalls = 0;
window.APE_BW_METER = {
    measureAndIntegrate(requiredMbps, opts) {
        measureCalls++;
        const nx = script.length ? script.shift() : { mbps: 400, ratio: 2 };
        const r = {
            ok: nx.ok !== false,
            state: nx.ok === false ? 'MEASURE_FAILED' : 'MEASURED',
            headroomRatio: nx.ratio,
            risk: 10,
            measurement: (nx.ok === false) ? null
                : { mbpsSafe: nx.mbps, mbpsAvg: nx.mbps, mbpsPeak: nx.mbps, windowS: (opts && opts.windowS) || 5, jitter: 0.5 },
            reason: nx.reason,
            samples: nx.ok === false ? [] : [{ bytes: 1 }, { bytes: 1 }],
            windowS: (opts && opts.windowS) || 5
        };
        return new Promise(res => setTimeout(() => res(r), nx.delayMs || 1));
    },
    summarize(samples, windowS) {
        if (!samples || !samples.length) return { ok: false, state: 'NO_MEASUREMENT', reason: 'ventana sin bytes' };
        return { ok: true, state: 'MEASURED', mbpsSafe: 400, mbpsAvg: 400, bins: samples.length, windowS: windowS || 5 };
    }
};

/* ── app REAL-simulado: el módulo «Latencia Rayo» es la REFERENCIA ─────────
 * El gobernador llama a window.app.profileNetwork({prefetched}) con la sonda
 * que ya hizo; el módulo resume y ESCRIBE state.networkProfile, que es lo que
 * coherentPlan lee como measuredMbpsSafe. Este stub replica ese contrato. */
window.app = {
    state: { networkProfile: null },
    profileNetwork(opts) {
        opts = opts || {};
        const r = opts.prefetched || {};
        const m = r.measurement || {};
        const mbps = Number(m.mbpsSafe);
        if (!isFinite(mbps) || mbps <= 0) return Promise.resolve({ ok: false, stage: 'bandwidth', state: r.state || 'NO_MEASUREMENT' });
        this.state.networkProfile = { downloadMbps: mbps, pingMs: 30, timestamp: Date.now(), source: 'synthetic-probe' };
        return Promise.resolve({ ok: true, downloadMbps: mbps, pingMs: 30, saved: true });
    }
};

/* Corre UN ciclo aislado (sin dejar el timer del gobernador armado). */
async function oneCycle(profileId, mbps, ratio, delayMs) {
    PM.activeProfileId = profileId;
    script.length = 0;
    script.push({ mbps, ratio, delayMs });
    const rec = await PM._governorCycle();
    return rec;
}

(async function run() {
    console.log('\n=== 0 · el stack REAL carga y el gobernador existe ===');
    ok('window.ProfileManagerV9 es una instancia', PM && typeof PM === 'object');
    ok('startGovernor es función', typeof PM.startGovernor === 'function');
    ok('stopGovernor es función', typeof PM.stopGovernor === 'function');
    ok('_governorCycle es función', typeof PM._governorCycle === 'function');
    ok('APE_PROFILES_CONFIG cargado', !!CFG && typeof CFG.getProfile === 'function');
    ok('tuner real cargado', typeof tuner.coherentPlan === 'function');

    const P0 = CFG.getProfile('P0');
    ok('P0 tiene bitrate (exigencia medida)', Number(P0.settings.bitrate) > 0, P0.settings.bitrate);
    /* [t15] La estrategia del PANEL (settings.strategy) es la que gobierna el
     * plan. P0 viene con 'ultra-aggressive', que por la regla de exigencia
     * medida×0.90 queda INCOHERENTE a propósito (se prueba en el bloque 10).
     * Para los bloques del ciclo que APLICA se usa una estrategia clásica. */
    P0.settings.strategy = 'balanced';
    console.log('        P0 bitrate=' + P0.settings.bitrate + ' Mbps · segDur=' +
        (P0.settings.segment_duration_s || '(sin declarar -> 6)') +
        ' · bwMin esperado=' + Math.round(Number(P0.settings.bitrate) * 1.15 * 100) / 100 + ' Mbps' +
        ' · estrategia=' + P0.settings.strategy);

    /* Punto de partida: piso del perfil (valores del preset P0) */
    PM.activeProfileId = 'P0';
    const before = CFG.getPrefetchConfig('P0');
    console.log('        antes: ' + JSON.stringify({
        seg: before.prefetch_segments, par: before.parallel_downloads,
        buf: before.buffer_target_seconds, bw: before.min_bandwidth_mbps, strat: before.strategy
    }));

    console.log('\n=== 1 · CICLO con mbps=400: ok y APLICA los cuatro campos ===');
    const c1 = await oneCycle('P0', 400, 400 / Number(P0.settings.bitrate));
    const after1 = CFG.getPrefetchConfig('P0');
    console.log('        ' + JSON.stringify({ ok: c1.ok, values: c1.values, applied: c1.applied }));
    ok('el ciclo ok:true', c1.ok === true, c1.violations);
    ok('midió 400 Mbps', c1.measuredMbpsSafe === 400, c1.measuredMbpsSafe);
    ok('aplicó los CUATRO campos', c1.applied && Object.keys(c1.applied).length === 4, c1.applied);
    ok('el PERFIL quedó con los valores del plan',
        after1.prefetch_segments === c1.applied.prefetch_segments &&
        after1.parallel_downloads === c1.applied.parallel_downloads &&
        after1.buffer_target_seconds === c1.applied.buffer_target_seconds &&
        after1.min_bandwidth_mbps === c1.applied.min_bandwidth_mbps,
        { after: after1, applied: c1.applied });
    ok('bwMin = exigencia x 1.15', c1.applied.min_bandwidth_mbps === Math.round(Number(P0.settings.bitrate) * 1.15),
        c1.applied.min_bandwidth_mbps);
    ok('_lastTune guarda el ciclo', PM._lastTune && PM._lastTune.at > 0 && PM._lastTune.ok === true);

    console.log('\n=== 2 · CICLO con mbps=0.1: ok:false, NO aplica, CONSERVA el anterior ===');
    const keptBefore = JSON.stringify(CFG.getPrefetchConfig('P0'));
    const c2 = await oneCycle('P0', 0.1, 0.1 / Number(P0.settings.bitrate));
    const after2 = CFG.getPrefetchConfig('P0');
    console.log('        ' + JSON.stringify({ ok: c2.ok, violations: c2.violations, needed: c2.neededMbpsForGreen }));
    ok('el ciclo NO es ok', c2.ok === false);
    ok('declara red_insuficiente', (c2.violations || []).some(v => /red_insuficiente/.test(v)), c2.violations);
    ok('publica neededMbpsForGreen = ' + Math.round(Number(P0.settings.bitrate) * 1.15),
        c2.neededMbpsForGreen === Math.round(Number(P0.settings.bitrate) * 1.15 * 100) / 100, c2.neededMbpsForGreen);
    ok('NO escribió ni un campo', c2.applied === null, c2.applied);
    ok('el perfil CONSERVA el juego coherente anterior', JSON.stringify(after2) === keptBefore,
        { keptBefore, after2 });
    ok('conserva la referencia del último juego aplicado', !!c2.kept && c2.kept.min_bandwidth_mbps === after2.min_bandwidth_mbps, c2.kept);

    console.log('\n=== 3 · ANTIOSCILACION: mismo plan -> skipped, sin escribir ===');
    const c3 = await oneCycle('P0', 400, 400 / Number(P0.settings.bitrate));
    console.log('        ' + JSON.stringify({ ok: c3.ok, skipReason: c3.skipReason, skipped: c3.skipped }));
    ok('no aplica nada', !c3.applied, c3.applied);
    ok('marca skipReason = antioscilacion', c3.skipReason === 'antioscilacion', c3.skipReason);

    console.log('\n=== 4 · MAXIMO 1 CICLO EN VUELO: el tick ocupado se salta ===');
    PM.activeProfileId = 'P0';
    PM._govCfg = PM._governorCfg();
    PM._govCfg.intervaloS = 0.02;
    script.length = 0;
    script.push({ mbps: 400, ratio: 2, delayMs: 120 });   // ciclo lento
    PM._govActive = true;
    PM._govInFlight = false;
    PM._govSkipped = 0;
    PM._governorTick();                                    // arranca ciclo lento
    await sleep(60);                                       // dos ticks más, aún en vuelo
    PM._governorTick();
    PM._governorTick();
    const skippedDuring = PM._govSkipped;
    await sleep(200);                                      // deja terminar
    PM.stopGovernor();
    console.log('        skipped durante el ciclo lento = ' + skippedDuring);
    ok('contó al menos un tick saltado por ciclo en vuelo', skippedDuring >= 1, skippedDuring);
    ok('stopGovernor deja el gobernador parado', PM._govActive === false);

    console.log('\n=== 5 · startGovernor idempotente + cadencia medida ===');
    PM._govCfg = null; PM._govTimer = null; PM._govActive = false; PM._govPaused = false;
    script.length = 0;
    for (let i = 0; i < 6; i++) script.push({ mbps: 400, ratio: 2, delayMs: 1 });
    const c0 = PM._govCycles || 0;              // _govCycles es acumulativo entre bloques
    const st1 = PM.startGovernor({ intervaloS: 0.05 });
    const st2 = PM.startGovernor({ intervaloS: 0.05 });
    console.log('        start1=' + JSON.stringify(st1) + ' start2=' + JSON.stringify(st2));
    ok('el primero arranca', st1.ok === true && st1.started === true);
    ok('el segundo NO duplica (already:true)', st2.ok === true && st2.already === true, st2);
    await sleep(320);
    const delta = (PM._govCycles || 0) - c0;
    PM.stopGovernor();
    console.log('        ciclos en 320 ms con cadencia 50 ms = ' + delta + ' (esperado ~6)');
    ok('corrió varios ciclos sin apilarse', delta >= 3 && delta <= 8, delta);

    console.log('\n=== 6 · plazo del ciclo: sonda lenta -> CYCLE_DEADLINE, sin aplicar ===');
    PM.activeProfileId = 'P0';
    const before6 = JSON.stringify(CFG.getPrefetchConfig('P0'));
    PM._govCfg = Object.assign(PM._governorCfg(), { deadlineMs: 40 });
    script.length = 0;
    script.push({ mbps: 400, ratio: 2, delayMs: 300 });    // más lenta que el plazo
    const c6 = await PM._governorCycle();
    console.log('        ' + JSON.stringify({ ok: c6.ok, planState: c6.planState, violations: c6.violations }));
    ok('el ciclo se cierra por plazo (no cuelga)', c6.planState === 'CYCLE_DEADLINE', c6.planState);
    ok('no aplicó nada', c6.applied === null, c6.applied);
    ok('el perfil no cambió', JSON.stringify(CFG.getPrefetchConfig('P0')) === before6);

    console.log('\n=== 7 · visibilidad: pausa y reanudación ===');
    PM._govCfg = null; PM._govTimer = null; PM._govActive = false; PM._govPaused = false;
    script.length = 0;
    for (let i = 0; i < 8; i++) script.push({ mbps: 400, ratio: 2, delayMs: 1 });
    PM.startGovernor({ intervaloS: 0.05 });
    await sleep(80);
    document.hidden = true;
    document._vis.forEach(fn => fn());
    const paused = PM._govPaused === true && PM._govActive === false;
    const cyclesAtPause = PM._govCycles;
    await sleep(150);
    ok('se pausó con la pestaña oculta', paused);
    ok('no corrió ciclos mientras estaba oculta', PM._govCycles === cyclesAtPause, { cyclesAtPause, now: PM._govCycles });
    document.hidden = false;
    document._vis.forEach(fn => fn());
    await sleep(120);
    ok('reanudó al volver a visible', PM._govActive === true && PM._govPaused === false);
    PM.stopGovernor();

    console.log('\n=== 8 · formato de la línea [CALIB] y del _lastTune ===');
    PM.activeProfileId = 'P0';
    const logged = [];
    const origLog = console.log;
    console.log = function () { logged.push(Array.prototype.join.call(arguments, ' ')); if (/^\[CALIB\]/.test(arguments[0])) return; origLog.apply(console, arguments); };
    const c8 = await oneCycle('P0', 500, 500 / Number(P0.settings.bitrate));
    console.log = origLog;
    const line = logged.find(l => /^\[CALIB\]/.test(l)) || '';
    console.log('        ' + line);
    ok('escribe UNA línea [CALIB] por ciclo', logged.filter(l => /^\[CALIB\]/.test(l)).length === 1, logged.length);
    ok('la línea trae at/mbps/ratio/ok/buf/seg/par/bwMin',
        /at=\S+ mbps=\S+ ratio=\S+ ok=\S+ buf=\S+ seg=\S+ par=\S+ bwMin=\S+/.test(line), line);
    ok('_lastTune tiene las claves del contrato',
        ['at', 'ok', 'values', 'violations', 'measuredMbpsSafe', 'headroomRatio'].every(k => k in c8),
        Object.keys(c8));

    console.log('\n=== 9 · el PERFIL DE RED es la REFERENCIA del cálculo ===');
    PM.activeProfileId = 'P0';
    const req = Number(P0.settings.bitrate);
    /* el perfil dice 900 Mbps aunque la sonda del ciclo mida 400:
     * el plan debe razonar con 900 (la referencia), no con la sonda. */
    window.app.state.networkProfile = { downloadMbps: 900, pingMs: 21, timestamp: Date.now(), source: 'probe' };
    const fm = PM._freshMeasurement();
    console.log('        _freshMeasurement(): ' + JSON.stringify(fm));
    ok('_freshMeasurement usa el PERFIL (900)', fm && fm.measuredMbpsSafe === 900 && fm.source === 'networkProfile', fm);
    const planRef = PM._coherentPlanFor(P0, 'AGRESIVO');
    ok('el plan calcula el ratio con 900/80 = 11.25x', planRef && planRef.metrics.ratio === 11.25, planRef && planRef.metrics);
    ok('el ping del perfil llega al plan', fm.pingMs === 21, fm && fm.pingMs);

    /* TTL: un perfil viejo NO es referencia → NO_MEASUREMENT, no se inventa */
    window.app.state.networkProfile = { downloadMbps: 900, pingMs: 21, timestamp: Date.now() - (6 * 60 * 1000), source: 'probe' };
    const stale = PM._networkProfile();
    const fmStale = PM._freshMeasurement();
    const planStale = PM._coherentPlanFor(P0, 'AGRESIVO');
    console.log('        perfil caducado → ageMs=' + (stale && stale.ageMs) + ' fresh=' + (stale && stale.fresh) +
        ' planState=' + (planStale && planStale.state));
    ok('a los 6 min el perfil NO es fresco (TTL 5 min)', stale && stale.fresh === false, stale);
    ok('sin perfil fresco NO hay medición', fmStale === null, fmStale);
    ok('el plan devuelve NO_MEASUREMENT', planStale && planStale.state === 'NO_MEASUREMENT', planStale && planStale.state);
    ok('y no inventa valores', planStale && planStale.values === null);

    /* el gobernador ESCRIBE el perfil con la sonda del ciclo (una sola sonda) */
    window.app.state.networkProfile = null;
    CFG.updatePrefetchSetting('P0', 'prefetch_segments', 2);   // fuerza un salto real (plan=5)
    const callsBefore = measureCalls;
    const c9 = await oneCycle('P0', 400, 400 / req);
    console.log('        tras el ciclo: perfil=' + JSON.stringify(window.app.state.networkProfile) + ' · sondas=' + (measureCalls - callsBefore));
    ok('el ciclo publicó el perfil de red', window.app.state.networkProfile && window.app.state.networkProfile.downloadMbps === 400,
        window.app.state.networkProfile);
    ok('UNA sola sonda por ciclo', (measureCalls - callsBefore) === 1, measureCalls - callsBefore);
    ok('el ciclo aplicó el plan cuando había salto real', c9.ok === true && !!c9.applied, { ok: c9.ok, applied: c9.applied });

    console.log('\n=== 10 · la ESTRATEGIA del panel cambia el plan (y dispara recálculo) ===');
    PM.activeProfileId = 'P0';
    P0.settings.strategy = 'ultra-aggressive';
    ok('_activeStrategyId lee settings.strategy del PANEL', PM._activeStrategyId() === 'ultra-aggressive', PM._activeStrategyId());
    window.app.state.networkProfile = { downloadMbps: 400, pingMs: 20, timestamp: Date.now(), source: 'probe' };
    const ultraPlan = PM._coherentPlanFor(P0, PM._activeStrategyId());
    console.log('        ultra-aggressive con 400 medidos y perfil ' + P0.settings.bitrate + ' → ok=' + ultraPlan.ok +
        ' · disponible=' + ultraPlan.metrics.availableMbps + ' exigido=' + ultraPlan.metrics.requiredMbpsForStall +
        ' ratio=' + ultraPlan.metrics.dutyRatio);
    ok('ultra-aggressive usa la exigencia medida×0.90', ultraPlan.metrics.stallBasis === 'measured_duty' &&
        ultraPlan.metrics.demandDuty === 0.90 && ultraPlan.metrics.availableMbps === 360, ultraPlan.metrics);
    /* 400 Mbps sostienen de sobra un perfil de 80: disponible 360 ≥ exigido 92. */
    ok('ultra-aggressive SÍ es coherente con 400 Mbps y perfil 80', ultraPlan.ok === true, ultraPlan.violations);
    ok('  · la razón es disponible/exigido > 1', ultraPlan.metrics.dutyRatio > 1 && ultraPlan.metrics.dutyOk === true,
        ultraPlan.metrics);

    /* y dice NO cuando el enlace no llega al umbral de duty (92/0.90 = 102.2) */
    window.app.state.networkProfile = { downloadMbps: 100, pingMs: 20, timestamp: Date.now(), source: 'probe' };
    const ultraPlanNo = PM._coherentPlanFor(P0, PM._activeStrategyId());
    console.log('        ultra-aggressive con 100 medidos → ok=' + ultraPlanNo.ok + ' · ' +
        (ultraPlanNo.violations[0] || '').slice(0, 90));
    ok('ultra-aggressive dice NO con 100 Mbps (bajo el umbral de duty)',
        ultraPlanNo.ok === false && /duty_insuficiente/.test((ultraPlanNo.violations || []).join(' ')), ultraPlanNo.violations);
    ok('  · publica el umbral exacto neededMbpsForUltra',
        ultraPlanNo.metrics.neededMbpsForUltra === Math.round((Number(P0.settings.bitrate) * 1.15 / 0.90) * 100) / 100,
        ultraPlanNo.metrics.neededMbpsForUltra);

    P0.settings.strategy = 'balanced';
    const balPlan = PM._coherentPlanFor(P0, PM._activeStrategyId());
    ok('balanced SÍ es coherente con la misma red', balPlan.ok === true, balPlan.violations);
    ok('el plan declara su strategyKey canónica', balPlan.strategyKey === 'balanced', balPlan.strategyKey);

    /* cambiar la estrategia por la API del panel debe disparar el recálculo */
    const callsB = measureCalls;
    CFG.updatePrefetchSetting('P0', 'prefetch_segments', 2);      // asegura salto real
    PM.updateSetting('strategy', 'conservative');
    await sleep(250);
    console.log('        updateSetting(strategy) → sondas delta=' + (measureCalls - callsB) +
        ' · _lastTune.ok=' + (PM._lastTune && PM._lastTune.ok));
    ok('cambiar la estrategia dispara recálculo con sonda', (measureCalls - callsB) >= 1, measureCalls - callsB);
    ok('el plan aplicado está ok tras el cambio', PM._lastTune && PM._lastTune.ok === true, PM._lastTune && PM._lastTune.violations);
    PM.stopGovernor();

    console.log('\n=== 11 · AUTO-AJUSTAR: UN ciclo forzado, idempotente (delta de sondas = 1) ===');
    PM.activeProfileId = 'P0';
    P0.settings.strategy = 'balanced';
    PM._govCfg = PM._governorCfg();
    PM._govForceApply = false;
    PM._govCyclePromise = null;
    CFG.updatePrefetchSetting('P0', 'prefetch_segments', 2);
    script.length = 0;
    script.push({ mbps: 400, ratio: 5, delayMs: 60 });
    const cBefore = measureCalls;
    const pA = PM.governorRunOnce({ force: true });
    const pB = PM.governorRunOnce({ force: true });     // pulsar dos veces
    ok('la segunda llamada REUTILIZA el ciclo en vuelo', pA === pB, { same: pA === pB });
    await Promise.all([pA, pB]);
    const deltaForced = measureCalls - cBefore;
    console.log('        delta de sondas tras pulsar AUTO-AJUSTAR dos veces = ' + deltaForced);
    ok('UN ciclo forzado: exactamente 1 sonda', deltaForced === 1, deltaForced);
    ok('el ciclo forzado aplicó aunque el cambio fuese pequeño', PM._lastTune && PM._lastTune.ok === true && !!PM._lastTune.applied,
        PM._lastTune && { ok: PM._lastTune.ok, applied: PM._lastTune.applied, skip: PM._lastTune.skipReason });

    console.log('\n=== 12 · panel de rendimiento pintado con el PLAN (no constantes) ===');
    PM._paintPerfPanel(PM._lastCoherent);
    const txt = (id) => (document.getElementById(id).textContent || '');
    const painted = {
        net_min: txt('pm9_net_min'), net_opt: txt('pm9_net_opt'),
        jitter: txt('pm9_jitter_max'), buffer: txt('pm9_buffer_total'),
        ram_real: txt('pm9_ram_real'), ram_teo: txt('pm9_ram_theoretical'),
        note: txt('pm9_ram_note'), qos: txt('pm9_qos_link'), gate: txt('pm9_sufficiency_gate')
    };
    Object.keys(painted).forEach(k => console.log('        ' + k.padEnd(9) + ' = ' + painted[k]));
    const HARDCODED = ['260', '320', '20266', '63333', '1583.3', '1045.0'];
    const allTxt = Object.keys(painted).map(k => painted[k]).join(' | ');
    ok('ningún id conserva las constantes viejas (260/320/20266/63333/1583.3/1045.0)',
        !HARDCODED.some(v => new RegExp(v.replace('.', '\\.')).test(allTxt)), allTxt);
    ok('net_min pinta el mínimo EXIGIDO por el plan', /Mbps/.test(painted.net_min) && /\d/.test(painted.net_min), painted.net_min);
    ok('net_opt pinta la red MEDIDA', /medid/.test(painted.net_opt), painted.net_opt);
    ok('RAM real/teórica salen del plan (números, no guiones)', /\d/.test(painted.ram_real) && /\d/.test(painted.ram_teo), painted);
    ok('la nota declara presupuesto y uso del plan', /Presupuesto 12150 MB/.test(painted.note), painted.note);
    ok('el enlace QoS dice ACTIVO con medición fresca', /ACTIVO/.test(painted.qos) && /400 Mbps/.test(painted.qos), painted.qos);
    ok('el gate incluye el veredicto del plan', /plan/.test(painted.gate) && /(COHERENTE|INCOHERENTE)/.test(painted.gate), painted.gate);
    ok('el badge QoS refleja medición fresca', /Active/.test(document.getElementById('qosStatusBadge').innerHTML),
        document.getElementById('qosStatusBadge').innerHTML);

    /* sin medición fresca: NO se pinta cifra */
    window.app.state.networkProfile = { downloadMbps: 400, pingMs: 20, timestamp: Date.now() - (6 * 60 * 1000), source: 'probe' };
    PM._paintPerfPanel(PM._lastCoherent);
    console.log('        con perfil caducado → net_min = ' + txt('pm9_net_min') + ' · qos = ' + txt('pm9_qos_link'));
    ok('perfil caducado → los campos dicen "sin medición"', /sin medici/i.test(txt('pm9_net_min')), txt('pm9_net_min'));
    ok('perfil caducado → el enlace QoS lo declara', /CADUCADO|OFFLINE/.test(txt('pm9_qos_link')), txt('pm9_qos_link'));
    ok('perfil caducado → badge Offline', /Offline/.test(document.getElementById('qosStatusBadge').innerHTML),
        document.getElementById('qosStatusBadge').innerHTML);

    console.log('\n=== 13 · RISK y HEADROOM con la BASE DEL PLAN (encargo final) ===');
    /* La ley real del riesgo y la ley de suficiencia, no réplicas. */
    const REAL_METER = require(path.join(FRONT, 'js/ape-v9/streaming/bandwidth-meter-v1.js'))(global);
    if (REAL_METER && typeof REAL_METER.riskFromRatio === 'function') {
        window.APE_BW_METER.riskFromRatio = REAL_METER.riskFromRatio;
    }
    try { require(path.join(FRONT, 'js/ape-v9/streaming/sufficiency-law-v1.js')); } catch (e) {}
    ok('riskFromRatio real disponible', typeof window.APE_BW_METER.riskFromRatio === 'function');
    ok('evaluateSufficiency cargado', typeof window.evaluateSufficiency === 'function');

    PM.activeProfileId = 'P0';
    P0.settings.strategy = 'balanced';
    const SC2 = window.StreamingCalculator;
    const bP0 = SC2.calculateBitrate(P0.settings.resolution || '1920x1080', P0.settings.codec || 'H265', Number(P0.settings.fps) || 60);
    const bas = PM._requiredMbpsBasis(P0);
    console.log('        base del plan P0 = ' + bas.mbps + ' Mbps (' + bas.source + ') · declarado=' + P0.settings.bitrate);
    ok('la base es calculateBitrate (' + bP0 + '), NO el declarado (' + P0.settings.bitrate + ')',
        bas.mbps === bP0 && bas.mbps !== Number(P0.settings.bitrate), bas);

    /* 146 Mbps medidos sobre P0 */
    window.app.state.networkProfile = { downloadMbps: 146, pingMs: 20, timestamp: Date.now(), source: 'probe' };
    PM._updateStreamingHealth();
    const riskTxt = String(document.getElementById('pm9_risk_preview').textContent);
    const headTxt = String(document.getElementById('pm9_headroom_preview').textContent);
    const gateTxt = String(document.getElementById('pm9_sufficiency_gate').textContent);
    const titleTxt = String(document.getElementById('pm9_risk_preview').title);
    const riskNum = Number(riskTxt.replace(/[^0-9.]/g, ''));
    console.log('        146 Mbps → risk=' + riskTxt + ' · headroom=' + headTxt);
    console.log('        gate="' + gateTxt + '"');
    console.log('        title="' + titleTxt + '"');
    ok('risk ≤ 10 con 146 Mbps y base ' + bP0, isFinite(riskNum) && riskNum <= 10, riskTxt);
    ok('ratio 4.17x declarado en el title', /ratio 4\.17x/.test(titleTxt), titleTxt);
    ok('el title declara la pareja medidos/exigidos y la base',
        /146 Mbps medidos \/ 35 Mbps exigidos \(base del plan/.test(titleTxt), titleTxt);
    /* el panel muestra el SPARE: (ratio-1)×100 = 317 % para 4.17x. El ratio
     * exacto va en el title. Las dos cosas se comprueban. */
    ok('headroom ≥ 200 % (spare de 4.17x = 317 %) y ratio 4.17x en el title',
        Number(String(headTxt).replace(/[^0-9.]/g, '')) >= 200 && /4\.17x/.test(titleTxt),
        { headTxt, titleTxt });
    ok('gate EXCEPCIONAL cumplido', /SUFICIENCIA EXCEPCIONAL/.test(gateTxt), gateTxt);

    /* 20 Mbps medidos: el riesgo sube y el gate dice cuánto falta */
    window.app.state.networkProfile = { downloadMbps: 20, pingMs: 20, timestamp: Date.now(), source: 'probe' };
    PM._updateStreamingHealth();
    const risk20 = Number(String(document.getElementById('pm9_risk_preview').textContent).replace(/[^0-9.]/g, ''));
    const gate20 = String(document.getElementById('pm9_sufficiency_gate').textContent);
    console.log('        20 Mbps → risk=' + risk20 + ' · gate="' + gate20 + '"');
    ok('con 20 Mbps el risk SUBE (' + risk20 + ' > ' + riskNum + ')', risk20 > riskNum, { risk20, risk146: riskNum });
    ok('con 20 Mbps el gate NO es excepcional y declara el déficit',
        /NO EXCEPCIONAL/.test(gate20) && /faltan/.test(gate20), gate20);

    /* sin medición fresca: NO_MEASUREMENT, nunca 95 */
    window.app.state.networkProfile = { downloadMbps: 146, pingMs: 20, timestamp: Date.now() - (6 * 60 * 1000), source: 'probe' };
    PM._updateStreamingHealth();
    const riskStale = String(document.getElementById('pm9_risk_preview').textContent);
    const gateStale = String(document.getElementById('pm9_sufficiency_gate').textContent);
    const titleStale = String(document.getElementById('pm9_risk_preview').title);
    console.log('        sin medición → risk="' + riskStale + '" · gate="' + gateStale + '"');
    console.log('        title="' + titleStale + '"');
    ok('sin medición el risk NO es un número (nada de 95)', !/[0-9]/.test(riskStale), riskStale);
    ok('sin medición se declara NO_MEASUREMENT y el motivo',
        /NO_MEASUREMENT/.test(titleStale) && /sin perfil de red fresco|perfil caducado/.test(titleStale), titleStale);
    ok('sin medición el gate dice que no es computable', /sin medicion|sin medición|NO_MEASUREMENT/i.test(gateStale), gateStale);
    ok('el semáforo queda gris, ni verde ni rojo', String(document.getElementById('pm9_health_indicator').style.background).indexOf('64748b') >= 0,
        document.getElementById('pm9_health_indicator').style.background);

    console.log('\n─────────────────────────────────────────────');
    console.log('  PASS ' + pass + ' · FAIL ' + fail);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.log('  FAIL  excepción no capturada -> ' + (e && e.stack || e));
    console.log('\n─────────────────────────────────────────────');
    console.log('  PASS ' + pass + ' · FAIL ' + (fail + 1));
    process.exit(1);
});
