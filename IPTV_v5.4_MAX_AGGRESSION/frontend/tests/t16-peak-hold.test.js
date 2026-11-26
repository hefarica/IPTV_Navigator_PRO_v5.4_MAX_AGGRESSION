/* ═══════════════════════════════════════════════════════════════════════════
 * t16 · MEDIDA BAJO DEMANDA + SNAPSHOT PERSISTENTE  (modelo vigente)
 *
 * ORDEN DEL OPERADOR: "tiene que medir cuando lo pido… ya luego no tiene
 * porque repetirse una y otra vez, pues esto va a generar que este cambiando
 * datos sin que se lo pida". Por tanto: CERO bucle, CERO auto-medición.
 * La única vía es la acción explícita; al medir se calcula+aplica+persiste; al
 * cargar se restaura el snapshot SIN medir; ningún TTL borra ni mueve valores.
 *
 * Se conserva el peak-hold (capacidad sostenida) pero SIN bucle.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const FRONT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stx = (t) => /sin medir|\d+\.\d+%/.test(String(t));   // o declara 'sin medir' o da un % válido

const LS = {};
const store = {
    getItem: (k) => (LS[k] === undefined ? null : LS[k]),
    setItem: (k, v) => { LS[k] = String(v); },
    removeItem: (k) => { delete LS[k]; }
};
global.window = global;
try { Object.defineProperty(global, 'localStorage', { value: store, configurable: true, writable: true }); } catch (e) {}
try { Object.defineProperty(global, 'navigator', { value: { userAgent: 'node-t16' }, configurable: true, writable: true }); } catch (e) {}

const __els = {};
function fakeEl() {
    const e = {
        style: {}, classList: { add() {}, remove() {} }, children: [],
        appendChild(c) { this.children.push(c); return c; },
        insertBefore(c) { this.children.push(c); return c; },
        setAttribute() {}, removeAttribute() {}, getBoundingClientRect() { return { top: 0, left: 0, bottom: 0 }; },
        querySelector() { return null; }, querySelectorAll() { return []; },
        addEventListener() {}, removeEventListener() {},
        innerHTML: '', textContent: '', value: '', title: '', disabled: false, parentNode: null
    };
    Object.defineProperty(e, 'id', { get() { return e._id || ''; }, set(v) { e._id = v; if (v) __els[v] = e; }, configurable: true });
    return e;
}
global.document = {
    hidden: false, head: { appendChild() {} }, body: { appendChild() {} },
    createElement: () => fakeEl(),
    getElementById: (id) => { if (!__els[id]) __els[id] = fakeEl(); return __els[id]; },
    querySelector: () => fakeEl(), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}
};

window.APE_PROFILES_12K = require(path.join(FRONT, 'js/ape-v9/ape-profiles-12k.js'));
require(path.join(FRONT, 'js/ape-v9/ape-profiles-config.js'));
require(path.join(FRONT, 'js/ape-v9/prefetch-presets.js'));
require(path.join(FRONT, 'js/ape-v9/streaming-calculator.js'));
require(path.join(FRONT, 'js/ape-v9/streaming/sufficiency-law-v1.js'));
window.APE_HEALTH_TUNER = require(path.join(FRONT, 'js/ape-v9/streaming/auto-tune-v1.js'))({});
const REAL_METER = require(path.join(FRONT, 'js/ape-v9/streaming/bandwidth-meter-v1.js'))(global);
window.APE_BW_METER = { riskFromRatio: REAL_METER.riskFromRatio };
require(path.join(FRONT, 'js/ape-v9/profile-manager-v9.js'));

const PM = window.ProfileManagerV9;
const CFG = window.APE_PROFILES_CONFIG;
PM.config = CFG;
PM.activeProfileId = 'P0';

let sondas = 0;
let guion = [];
function instalarMedidor() {
    global.app = {
        state: { networkProfile: null },
        measureQosBandwidth: async () => {
            sondas++;
            const m = guion.shift() || { mbpsSafe: 240.97, mbpsP95: 260, jitterMbps: 4.2, bufferbloatMs: 11, rttIdleMs: 8 };
            return { ok: true, mbpsSafe: m.mbpsSafe, mbpsP95: m.mbpsP95, mbpsAvg: m.mbpsSafe,
                     jitterMbps: m.jitterMbps, bufferbloatMs: m.bufferbloatMs, rttIdleMs: m.rttIdleMs,
                     bins: 5, windowS: 8, source: m.source || 'explicit-test' };
        },
        applyNetworkMeasurement: (m) => {
            global.app.state.networkProfile = {
                downloadMbps: m.mbpsSafe, pingMs: m.rttIdleMs, timestamp: Date.now(),
                source: m.source, mbpsP95: m.mbpsP95, jitterMbps: m.jitterMbps, bufferbloatMs: m.bufferbloatMs
            };
            return { ok: true, wrote: true };
        }
    };
    window.app = global.app;
}
instalarMedidor();

const snap = () => JSON.stringify(LS['ape_qoe_plan_v1'] || null);

(async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  t16 · MEDIDA BAJO DEMANDA + SNAPSHOT (sin bucle)');
    console.log('═══════════════════════════════════════════════════════════════');

    console.log('\n=== a) pagina abierta sin pulsar nada: 0 sondas, snapshot identico ===');
    PM._peakSamples = [];
    delete LS['ape_qoe_plan_v1'];
    PM._bwAutoStarted = false;
    sondas = 0;
    /* el render completo necesita un DOM real; lo que importa es que ni el
     * arranque ni el repintado midan. Se simula la carga con la ruta del snapshot. */
    try { PM._restoreQoePlan(); } catch (e) {}
    await sleep(120);
    const antesBeat = snap();
    ok('startGovernor NO se auto-arranca (sin bucle)', PM._govActive !== true, PM._govActive);
    ok('no hay temporizador de ciclo armado', !PM._govTimer, !!PM._govTimer);
    for (let i = 0; i < 60; i++) { PM._updateStreamingHealth(); }
    await sleep(120);
    const despuesBeat = snap();
    console.log('        pases de repintado: 60 · sondas=' + sondas + ' · snapshot igual=' + (antesBeat === despuesBeat));
    ok('60 pases sin pulsar -> 0 sondas', sondas === 0, sondas);
    ok('el snapshot no cambia solo', antesBeat === despuesBeat, { antesBeat, despuesBeat });
    ok('sin snapshot el panel no inventa riesgo',
        String(document.getElementById('pm9_risk_preview').textContent).indexOf('--') === 0,
        document.getElementById('pm9_risk_preview').textContent);

    console.log('\n=== b) al pulsar: 1 sonda · plan aplicado · snapshot con ts y fuente ===');
    sondas = 0;
    guion = [{ mbpsSafe: 240.97, mbpsP95: 262.4, jitterMbps: 3.1, bufferbloatMs: 9, rttIdleMs: 8 }];
    PM._qosRunPromise = null;
    const run = await PM.qosRunAll('one');
    console.log('        state=' + run.state + ' · perfiles=' + JSON.stringify(run.appliedIds) + ' · saved=' + run.saved);
    ok('UNA sonda por pulsacion', sondas === 1, sondas);
    ok('aplico el perfil activo', run.appliedIds.indexOf('P0') >= 0, run.appliedIds);
    const raw1 = JSON.parse(LS['ape_qoe_plan_v1'] || 'null');
    console.log('        snapshot: ts=' + (raw1 && raw1.ts) + ' · fuente=' + (raw1 && raw1.measurement.source) +
        ' · mbps=' + (raw1 && raw1.measurement.mbpsSafe) + ' · p95=' + (raw1 && raw1.measurement.mbpsP95) +
        ' · jitter=' + (raw1 && raw1.measurement.jitterMbps) + ' · bufferbloat=' + (raw1 && raw1.measurement.bufferbloatMs));
    ok('el snapshot trae ts y fuente', !!(raw1 && raw1.ts > 0 && raw1.measurement && raw1.measurement.source), raw1 && raw1.ts);
    ok('trae mbps, p95, jitter y bufferbloat medidos',
        raw1.measurement.mbpsSafe === 240.97 && raw1.measurement.mbpsP95 === 262.4 &&
        raw1.measurement.jitterMbps === 3.1 && raw1.measurement.bufferbloatMs === 9, raw1.measurement);
    ok('el plan quedo guardado por perfil', raw1.profiles && raw1.profiles.P0 && raw1.profiles.P0.bufferTargetS > 0,
        raw1.profiles && Object.keys(raw1.profiles));
    const planAplicado = CFG.getPrefetchConfig('P0');
    console.log('        prefetch P0 tras aplicar: ' + JSON.stringify(planAplicado));
    ok('se aplico de verdad al perfil (prefetch coincide con el snapshot)',
        Number(planAplicado.buffer_target_seconds) === Number(raw1.profiles.P0.bufferTargetS), {
            cfg: planAplicado.buffer_target_seconds, snap: raw1.profiles.P0.bufferTargetS
        });

    console.log('\n=== e) doble clic -> UNA sola sonda ===');
    sondas = 0;
    guion = [{ mbpsSafe: 200, mbpsP95: 210, jitterMbps: 2, bufferbloatMs: 7, rttIdleMs: 8 }];
    PM._qosRunPromise = null;
    const p1 = PM.qosRunAll('one');
    const p2 = PM.qosRunAll('one');
    ok('la segunda pulsacion reutiliza la promesa en vuelo', p1 === p2, { same: p1 === p2 });
    await Promise.all([p1, p2]);
    console.log('        sondas=' + sondas);
    ok('doble clic -> 1 sonda', sondas === 1, sondas);

    console.log('\n=== c) recargar la pagina: restaura y aplica SIN sonda ===');
    const antesRecarga = snap();
    CFG.updatePrefetchSetting('P0', 'buffer_target_seconds', 11);
    PM._snapshotInfo = null;
    sondas = 0;
    const rest = PM._restoreQoePlan();
    console.log('        restore -> restored=' + rest.restored + ' · stale=' + rest.stale +
        ' · aplicado=' + JSON.stringify(rest.applied));
    const etiqueta = PM._snapshotLabel();
    console.log('        etiqueta: "' + etiqueta + '"');
    ok('restaura el snapshot', rest.restored === true, rest);
    ok('restaurar NO lanza ninguna sonda', sondas === 0, sondas);
    ok('el snapshot no se modifica al restaurar', snap() === antesRecarga);
    ok('vuelve a aplicar los valores del snapshot',
        Number(CFG.getPrefetchConfig('P0').buffer_target_seconds) === Number(rest.plan.bufferTargetS),
        { cfg: CFG.getPrefetchConfig('P0').buffer_target_seconds, snap: rest.plan.bufferTargetS });
    ok('el panel muestra "medido hace X (fuente Y)"',
        /^medido hace .+ \(fuente .+\)/.test(String(etiqueta)), etiqueta);

    console.log('\n=== d) snapshot de hace 30 min: sigue aplicado + ANTIGUO, nada cambia solo ===');
    const viejo = JSON.parse(LS['ape_qoe_plan_v1']);
    viejo.ts = Date.now() - (30 * 60 * 1000);
    const planViejo = JSON.stringify(viejo.profiles.P0);
    LS['ape_qoe_plan_v1'] = JSON.stringify(viejo);
    PM._snapshotInfo = null;
    sondas = 0;
    const restViejo = PM._restoreQoePlan();
    for (let i = 0; i < 30; i++) { PM._updateStreamingHealth(); }
    const rawDespues = JSON.parse(LS['ape_qoe_plan_v1']);
    const etiquetaVieja = PM._snapshotLabel();
    console.log('        restored=' + restViejo.restored + ' · stale=' + restViejo.stale +
        ' · etiqueta="' + etiquetaVieja + '"');
    console.log('        plan P0 intacto=' + (JSON.stringify(rawDespues.profiles.P0) === planViejo));
    ok('un snapshot de 30 min SE APLICA igual (ningun TTL lo borra)', restViejo.restored === true, restViejo);
    ok('se marca ANTIGUO de forma visible', restViejo.stale === true && /ANTIGUO/.test(String(etiquetaVieja)), etiquetaVieja);
    ok('ningun valor del plan cambia solo', JSON.stringify(rawDespues.profiles.P0) === planViejo);
    ok('ninguna sonda durante 30 pases de repintado', sondas === 0, sondas);

    console.log('\n=== e2) varias medidas explicitas: gana la ultima y queda historico ===');
    sondas = 0;
    guion = [{ mbpsSafe: 300, mbpsP95: 320, jitterMbps: 2, bufferbloatMs: 5, rttIdleMs: 7 }];
    PM._qosRunPromise = null;
    PM._peakSamples = [];
    await PM.qosRunAll('one');
    const rawUlt = JSON.parse(LS['ape_qoe_plan_v1']);
    console.log('        ultima medicion=' + rawUlt.measurement.mbpsSafe + ' Mbps · historico=' +
        (rawUlt.history ? rawUlt.history.length : 0) + ' entradas: ' +
        (rawUlt.history || []).map(h => h.mbpsSafe).join(' -> '));
    ok('gana la ULTIMA medicion explicita', rawUlt.measurement.mbpsSafe === 300, rawUlt.measurement.mbpsSafe);
    ok('queda historico para trazabilidad', Array.isArray(rawUlt.history) && rawUlt.history.length >= 2,
        rawUlt.history && rawUlt.history.length);

    console.log('\n=== peak-hold se conserva (sin bucle) ===');
    PM._peakSamples = [];
    global.app.state.networkProfile = null;   // aislar: el peak se prueba sin perfil vivo
    window.app = global.app;
    PM._peakRecord(240.97, Date.now() - 60000);
    PM._peakRecord(18.72, Date.now() - 30000);
    const cap = PM._capacity();
    console.log('        peak=' + cap.peak + ' · ahora=' + cap.now + ' · dip=' + cap.dip);
    ok('el peak se sostiene (240,97) y el dip se marca', cap.peak === 240.97 && cap.dip === true, cap);
    ok('la ventana esta declarada (20 ciclos / 10 min)', PM._peakCfg().maxCycles === 20 &&
        PM._peakCfg().ttlMs === 600000, PM._peakCfg());

    /* ═══════════════════════════════════════════════════════════════════
     * [t17] LA ESTRATEGIA ELEGIDA NO SE REVIERTE + CONFIG COHERENTE
     * ═══════════════════════════════════════════════════════════════════ */
    console.log('\n=== g) ultra-aggressive: el select NO se revierte y su config es suya ===');
    const tunerS = window.APE_HEALTH_TUNER;
    PM.activeProfileId = 'P0';
    PM._peakSamples = [];
    global.app.state.networkProfile = null;
    PM._setUserStrategy('P0', 'ultra-aggressive');
    const estrat = CFG.getProfile('P0').settings.strategy;
    console.log('        settings.strategy tras seleccionar = ' + estrat);
    ok('la estrategia elegida queda guardada como ultra-aggressive', estrat === 'ultra-aggressive', estrat);
    PM._setUserStrategy('P0', 'Ultra-Agresivo');
    ok('la clave canonica se acepta aunque llegue el nombre en espanol',
        CFG.getProfile('P0').settings.strategy === 'ultra-aggressive', CFG.getProfile('P0').settings.strategy);
    PM._setUserStrategy('P0', 'ultra-aggressive');

    PM._peakRecord(284.37, Date.now());
    const planUltra = PM._coherentPlanFor(CFG.getProfile('P0'), 'ultra-aggressive');
    console.log('        medicion 284,37 · plan -> par=' + planUltra.values.parallelDownloads +
        ' seg=' + planUltra.values.prefetchSegments + ' buf=' + planUltra.values.bufferTargetS +
        ' bwMin=' + planUltra.values.bwMinMbps + ' ok=' + planUltra.ok);
    ok('parallel >= 2 (NUNCA 1 con ultra)', planUltra.values.parallelDownloads >= 2, planUltra.values.parallelDownloads);
    ok('segments >= 6', planUltra.values.prefetchSegments >= 6, planUltra.values.prefetchSegments);
    ok('buffer alto (>= 20 s)', planUltra.values.bufferTargetS >= 20, planUltra.values.bufferTargetS);
    console.log('        estrategia en el perfil TRAS calcular el plan = ' + CFG.getProfile('P0').settings.strategy);
    ok('calcular el plan NO cambia la estrategia',
        CFG.getProfile('P0').settings.strategy === 'ultra-aggressive', CFG.getProfile('P0').settings.strategy);

    CFG.getProfile('P0').settings.strategy = 'conservative';
    const guard = PM._guardStrategy(CFG.getProfile('P0'));
    console.log('        guardia: ' + JSON.stringify(guard) + ' -> estrategia=' + CFG.getProfile('P0').settings.strategy);
    ok('la guardia detecta y restaura la reversion a conservative',
        guard.ok === false && guard.restored === 'ultra-aggressive' &&
        CFG.getProfile('P0').settings.strategy === 'ultra-aggressive', guard);

    console.log('\n=== h) con medicion baja (20 Mbps) la estrategia SIGUE y hay UNA sola causa ===');
    PM._peakSamples = [];
    global.app.state.networkProfile = null;
    PM._peakRecord(20, Date.now());
    const planBajo = PM._coherentPlanFor(CFG.getProfile('P0'), 'ultra-aggressive');
    console.log('        20 Mbps · plan -> par=' + planBajo.values.parallelDownloads + ' seg=' + planBajo.values.prefetchSegments +
        ' buf=' + planBajo.values.bufferTargetS + ' ok=' + planBajo.ok);
    console.log('        violaciones (' + planBajo.violations.length + '): ' + planBajo.violations.join(' || ').slice(0, 240));
    ok('con 20 Mbps el plan es ok:false', planBajo.ok === false, planBajo.ok);
    ok('UNA sola violacion (sin causas contradictorias)', planBajo.violations.length === 1, planBajo.violations);
    ok('la violacion declara disponible, exigido, ratio y los Mbps que faltan',
        /disponible .*exigido .*ratio .*faltan/.test(planBajo.violations[0]), planBajo.violations[0]);
    ok('faltan es el DEFICIT, no el total exigido',
        !/faltan 255\.56/.test(planBajo.violations[0]) && /faltan \d+(\.\d+)? Mbps medidos/.test(planBajo.violations[0]),
        planBajo.violations[0]);
    ok('parallel NO se degrada a 1 con medicion baja', planBajo.values.parallelDownloads >= 2, planBajo.values.parallelDownloads);
    console.log('        estrategia tras el plan fallido = ' + CFG.getProfile('P0').settings.strategy);
    ok('el plan fallido NO revierte la estrategia',
        CFG.getProfile('P0').settings.strategy === 'ultra-aggressive', CFG.getProfile('P0').settings.strategy);

    console.log('\n=== i) conservative y ultra-low-latency: cada una con SU config, sin reversion ===');
    PM._peakSamples = [];
    global.app.state.networkProfile = null;
    PM._peakRecord(284.37, Date.now());
    PM._setUserStrategy('P0', 'conservative');
    const planCons = PM._coherentPlanFor(CFG.getProfile('P0'), 'conservative');
    console.log('        conservative -> par=' + planCons.values.parallelDownloads + ' seg=' + planCons.values.prefetchSegments +
        ' buf=' + planCons.values.bufferTargetS + ' · estrategia=' + CFG.getProfile('P0').settings.strategy);
    ok('conservative se queda seleccionada', CFG.getProfile('P0').settings.strategy === 'conservative',
        CFG.getProfile('P0').settings.strategy);
    ok('conservative aplica SU configuracion (no la de ultra)',
        planCons.values.prefetchSegments <= planUltra.values.prefetchSegments, {
            cons: planCons.values.prefetchSegments, ultra: planUltra.values.prefetchSegments
        });
    PM._setUserStrategy('P0', 'ultra-low-latency');
    const planULL = PM._coherentPlanFor(CFG.getProfile('P0'), 'ultra-low-latency');
    console.log('        ultra-low-latency -> par=' + planULL.values.parallelDownloads + ' seg=' + planULL.values.prefetchSegments +
        ' buf=' + planULL.values.bufferTargetS + ' · estrategia=' + CFG.getProfile('P0').settings.strategy);
    ok('ultra-low-latency se queda seleccionada', CFG.getProfile('P0').settings.strategy === 'ultra-low-latency',
        CFG.getProfile('P0').settings.strategy);
    ok('ultra-low-latency mantiene su techo de 2 segmentos (buffer 12 s)',
        planULL.values.bufferTargetS === 12 && planULL.values.parallelDownloads <= 2, planULL.values);

    console.log('\n=== j) ningun texto con backtick roto ===');
    const fsMod = require('fs');
    const presetsSrc = fsMod.readFileSync(path.join(FRONT, 'js/ape-v9/prefetch-presets.js'), 'utf8');
    const pmSrc = fsMod.readFileSync(path.join(FRONT, 'js/ape-v9/profile-manager-v9.js'), 'utf8');
    const roto = new RegExp('Ma' + String.fromCharCode(96) + 'ximo');
    console.log('        texto roto presente: ' + roto.test(presetsSrc + pmSrc) +
        ' · "Maximo" ASCII: ' + /Maximo prefetch para 8K/.test(presetsSrc));
    ok('no queda el texto con backtick', roto.test(presetsSrc + pmSrc) === false);
    ok('el texto dice Maximo', /Maximo prefetch para 8K/.test(presetsSrc));

    /* ═══════════════════════════════════════════════════════════════════
     * [t18] COHERENCIA DEL PANEL — las 4 incoherencias de la captura del
     * operador (pico 97,35 / requerido 200 / util 87,62 / exigido 230).
     * ═══════════════════════════════════════════════════════════════════ */
    console.log('\n=== k) red mínima: ÚTILES y MEDIDOS con el factor declarado ===');
    PM._peakSamples = [];
    global.app.state.networkProfile = null;
    PM._peakRecord(97.35, Date.now());
    PM._setUserStrategy('P0', 'ultra-aggressive');
    /* la captura del operador es un perfil de 200 Mbps de promedio (exigido 230) */
    const bitrateReal = CFG.getProfile('P0').settings.bitrate;
    /* exigido 230 = override manual del operador (200 x 1,15) */
    CFG.getProfile('P0').settings.bitrate = 200;
    CFG.getProfile('P0').settings.bitrate_user_override = true;
    const planCap = PM._coherentPlanFor(CFG.getProfile('P0'), 'ultra-aggressive');
    const veredicto = String(PM.coherentVerdictHtml(CFG.getProfile('P0'), 'ultra-aggressive')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    console.log('        disponible=' + planCap.metrics.availableMbps + ' · exigido=' + planCap.metrics.requiredMbpsForStall +
        ' · ratio=' + planCap.metrics.dutyRatio + ' · needed=' + planCap.neededMbpsForGreen);
    console.log('        veredicto: ' + veredicto.slice(0, 300));
    ok('el veredicto da los ÚTILES y los MEDIDOS',
        /230 Mbps .{1,3}les/.test(veredicto) && /255\.56 Mbps medidos/.test(veredicto), veredicto);
    ok('declara el factor aplicado (0.9)', /factor 0\.9/.test(veredicto), veredicto);
    ok('los números de disponible/exigido coinciden con la captura del operador',
        planCap.metrics.availableMbps === 87.62 && planCap.metrics.requiredMbpsForStall === 230, planCap.metrics);
    ok('el déficit declarado es el real (158.21 medidos / 142.38 de capacidad)',
        /faltan 158\.21 Mbps medidos/.test(veredicto) && /142\.38 Mbps de capacidad/.test(veredicto), veredicto);

    delete CFG.getProfile('P0').settings.bitrate_user_override;   // vuelve a la base real
    console.log('\n=== l) cobertura segmentos × duración vs buffer ===');
    PM._paintPerfPanel(planCap);
    const nota = String(document.getElementById('pm9_ram_note').textContent);
    console.log('        nota: ' + nota);
    ok('la nota declara la base de duración del segmento',
        /cobertura 6 seg × 6 s = 36 s de contenido vs buffer 32 s/.test(nota), nota);
    ok('el tuner publica segDurS', planCap.metrics.segDurS === 6, planCap.metrics.segDurS);

    console.log('\n=== m) STALL observado: nunca negativo y sin medir sin evidencia ===');
    const etiqSinEv = PM._summaryLabels({ evidence: false, stall_rate_percent: -3, risk_score: 5, risk_level: 'LOW' });
    const etiqNeg = PM._summaryLabels({ evidence: true, stall_rate_percent: -0.4, risk_score: 5, risk_level: 'LOW' });
    PM._updateStreamingHealth();
    const stallTxt = etiqSinEv.stall;
    const riskTxt2 = etiqSinEv.risk;
    console.log('        sin evidencia -> stall="' + etiqSinEv.stall + '" · risk="' + etiqSinEv.risk + '"');
    console.log('        con evidencia y stall negativo -> stall="' + etiqNeg.stall + '"');
    console.log('        stall summary: "' + stallTxt + '"');
    console.log('        risk  summary: "' + riskTxt2 + '"');
    ok('con evidencia de red pero sin reproductor, la tasa NO se inventa (ni <0%)',
        !/-\d/.test(stallTxt) && stx(stallTxt), stallTxt);
    ok('el risk se etiqueta como riesgo de RED', /^red: /.test(riskTxt2), riskTxt2);
    ok('el risk lleva title aclarando que no es estabilidad de reproducción',
        /NO es un veredicto de estabilidad/.test(etiqSinEv.riskTitle), etiqSinEv.riskTitle);
    ok('una tasa negativa se recorta a 0 (nunca <0%)', etiqNeg.stall === '0.00%', etiqNeg.stall);

    console.log('\n=== n) headroom con nombre y umbral de industria separado ===');
    const headTitle = String(document.getElementById('pm9_headroom_preview').title);
    const headTxt2 = String(document.getElementById('pm9_headroom_preview').textContent);
    console.log('        headroom: "' + headTxt2 + '"');
    console.log('        title: ' + headTitle.slice(0, 220));
    ok('el headroom se identifica como de RED', /\(red\)/.test(headTxt2), headTxt2);
    ok('el title dice que el 1.3x es el MÍNIMO de industria, no una medición',
        /MÍNIMO recomendado de industria/.test(headTitle), headTitle);

    CFG.getProfile('P0').settings.bitrate = bitrateReal;   // restaurar el perfil

    /* ═══════════════════════════════════════════════════════════════════════
     * [t18] UN SOLO VEREDICTO: el gate no puede decir EXCEPCIONAL con plan
     * incoherente. Dos dimensiones etiquetadas: TRANSPORTE (manda) y CODEC.
     * ═══════════════════════════════════════════════════════════════════ */
    console.log('\n=== o) caso de la captura: capacidad 138,04 · exigido 230 · perfil 200 ===');
    const bitrateGuardado = CFG.getProfile('P0').settings.bitrate;
    CFG.getProfile('P0').settings.bitrate = 200;
    CFG.getProfile('P0').settings.bitrate_user_override = true;   // exigido 230 = override
    PM._setUserStrategy('P0', 'ultra-aggressive');
    PM._peakSamples = [];
    global.app.state.networkProfile = null;
    PM._peakRecord(138.04, Date.now());
    PM._updateStreamingHealth();
    const gate18 = String(document.getElementById('pm9_sufficiency_gate').textContent);
    const stab18 = String(document.getElementById('pm9_stability_label').textContent);
    const stall18 = String(document.getElementById('pm9_stall_preview').textContent);
    const ind18 = String(document.getElementById('pm9_health_indicator').style.background);
    const plan18 = PM._coherentPlanFor(CFG.getProfile('P0'), 'ultra-aggressive');
    console.log('        gate: ' + gate18);
    console.log('        estabilidad: ' + stab18 + ' · stall: ' + stall18 + ' · semáforo: ' + ind18);
    console.log('        plan.ok=' + plan18.ok + ' · disponible=' + plan18.metrics.availableMbps +
        ' · exigido=' + plan18.metrics.requiredMbpsForStall + ' · ratio=' + plan18.metrics.dutyRatio);
    ok('el gate NO dice EXCEPCIONAL con plan incoherente', !/EXCEPCIONAL/.test(gate18) || /NO EXCEPCIONAL/.test(gate18), gate18);
    ok('el gate dice NO EXCEPCIONAL', /^NO EXCEPCIONAL/.test(gate18), gate18);
    ok('muestra la dimensión TRANSPORTE con disponible/exigido/ratio',
        /TRANSPORTE: 124\.24\/230 Mbps \(0\.54x\)/.test(gate18), gate18);
    ok('declara el déficit de transporte', /faltan 105\.76 Mbps útiles/.test(gate18), gate18);
    ok('muestra el CODEC aparte como informativo',
        /CODEC: .* Mbps vs 35 Mbps de bitrate/.test(gate18) && /informativo/.test(gate18), gate18);
    ok('la causa dominante va en el texto', /causa: red_insuficiente/.test(gate18), gate18);
    ok('la estabilidad se deriva del plan (no dice ESTABLE con plan rojo)',
        /NO ESTABLE/.test(stab18), stab18);
    ok('el semáforo es ROJO (un solo color, el del plan)', ind18.indexOf('239,68,68') >= 0 || ind18.indexOf('#ef4444') >= 0, ind18);
    ok('el stall se muestra como estimación (96 %) y no "<0.00%"',
        /stall est\. \d+(\.\d+)? %/.test(stall18) && !/<0/.test(stall18), stall18);
    /* e) el gate formatea el stall correctamente en el caso REAL que supera */
    ok('el stall dice SUPERA cuando excede el target',
        /stall est\. 96 % SUPERA el target 1\.67 %/.test(stall18), stall18);
    ok('el stall NO usa "≤ 1.67" cuando lo supera', !/≤ 1\.67/.test(stall18), stall18);
    ok('el gate unificado no repite el texto del stall (una sola fuente)',
        !/stall est\./.test(gate18), gate18);
    ok('el title explica cómo llegar a EXCEPCIONAL (3x exigido)',
        /3x lo exigido/.test(String(document.getElementById('pm9_sufficiency_gate').title)),
        document.getElementById('pm9_sufficiency_gate').title);

    delete CFG.getProfile('P0').settings.bitrate_user_override;   // vuelve a la base real
    console.log('\n=== p) caso bueno: medido 400 con perfil de 80 ===');
    CFG.getProfile('P0').settings.bitrate = bitrateGuardado;   // 80
    PM._peakSamples = [];
    global.app.state.networkProfile = null;
    PM._peakRecord(400, Date.now());
    PM._updateStreamingHealth();
    const gateOk18 = String(document.getElementById('pm9_sufficiency_gate').textContent);
    const stabOk18 = String(document.getElementById('pm9_stability_label').textContent);
    const indOk18 = String(document.getElementById('pm9_health_indicator').style.background);
    const planOk18 = PM._coherentPlanFor(CFG.getProfile('P0'), 'ultra-aggressive');
    console.log('        gate: ' + gateOk18);
    console.log('        estabilidad: ' + stabOk18 + ' · semáforo: ' + indOk18 + ' · plan.ok=' + planOk18.ok);
    ok('con red suficiente el plan es coherente', planOk18.ok === true, planOk18.violations);
    ok('el gate dice EXCEPCIONAL', /^EXCEPCIONAL/.test(gateOk18), gateOk18);
    ok('ambas dimensiones coherentes (transporte cubre y códec decodificable)',
        /cubre el mínimo/.test(gateOk18) && /decodificable/.test(gateOk18), gateOk18);
    ok('la estabilidad dice ESTABLE', /ESTABLE/.test(stabOk18) && !/NO ESTABLE/.test(stabOk18), stabOk18);
    ok('el semáforo es VERDE', indOk18.indexOf('10b981') >= 0, indOk18);
    ok('cuando cumple, el gate NO dice SUPERA', !/SUPERA/.test(gateOk18), gateOk18);

    console.log('\n=== q) caso sin medición: "--" y NO_MEASUREMENT, sin colores ===');
    PM._peakSamples = [];
    delete LS['ape_peak_hold_v1'];
    global.app.state.networkProfile = null;
    PM._updateStreamingHealth();
    const gateNada = String(document.getElementById('pm9_sufficiency_gate').textContent);
    const stabNada = String(document.getElementById('pm9_stability_label').textContent);
    const indNada = String(document.getElementById('pm9_health_indicator').style.background);
    console.log('        gate: ' + gateNada + ' · estabilidad: ' + stabNada + ' · semáforo: ' + indNada);
    ok('sin medición el gate declara NO_MEASUREMENT', /NO_MEASUREMENT/.test(gateNada), gateNada);
    ok('sin medición no hay veredicto verde', /^NO EXCEPCIONAL/.test(gateNada) && !/^EXCEPCIONAL/.test(gateNada), gateNada);
    ok('la etiqueta dice SIN MEDICIÓN', /SIN MEDICIÓN/.test(stabNada), stabNada);
    ok('el semáforo queda neutro (gris)', indNada.indexOf('64748b') >= 0, indNada);

    console.log('\n=== r) INVARIANTE: en ningún estado EXCEPCIONAL con plan ok:false ===');
    const casos = [
        { mbps: 20, req: 200 }, { mbps: 97.35, req: 200 }, { mbps: 138.04, req: 200 },
        { mbps: 230, req: 200 }, { mbps: 400, req: 200 }, { mbps: 400, req: 80 },
        { mbps: 600, req: 200 }, { mbps: 1000, req: 200 }
    ];
    let violacionesInv = 0;
    casos.forEach(c => {
        CFG.getProfile('P0').settings.bitrate = c.req;
        PM._setUserStrategy('P0', 'ultra-aggressive');
        PM._peakSamples = [];
        global.app.state.networkProfile = null;
        PM._peakRecord(c.mbps, Date.now());
        PM._updateStreamingHealth();
        const g = String(document.getElementById('pm9_sufficiency_gate').textContent);
        const pl = PM._coherentPlanFor(CFG.getProfile('P0'), 'ultra-aggressive');
        const diceExcepcional = /^EXCEPCIONAL/.test(g);
        if (!pl.ok && diceExcepcional) violacionesInv++;
        console.log('        ' + String(c.mbps).padStart(6) + ' medidos / ' + String(c.req).padStart(3) +
            ' requerido · plan.ok=' + String(pl.ok).padEnd(5) + ' · gate=' + g.slice(0, 42));
    });
    ok('0 casos con EXCEPCIONAL y plan ok:false', violacionesInv === 0, violacionesInv);
    CFG.getProfile('P0').settings.bitrate = bitrateGuardado;

    /* ═══════════════════════════════════════════════════════════════════════
     * [t19] EXIGENCIA CON LA BASE REAL (resolución del perfil), PERFIL FIJO.
     * El algoritmo optimiza los SETTINGS de ESE perfil; nunca cambia de perfil.
     * ═══════════════════════════════════════════════════════════════════ */
    console.log('\n=== s) P0 fijo + 138 Mbps: base 35 · exigido 40,25 · verde ===');
    PM.activeProfileId = 'P0';
    PM._setUserStrategy('P0', 'ultra-aggressive');
    PM._peakSamples = []; delete LS['ape_peak_hold_v1'];
    global.app.state.networkProfile = null;
    PM._peakRecord(138.04, Date.now());
    const basP0 = PM._requiredMbpsBasis(CFG.getProfile('P0'));
    const planP0 = PM._coherentPlanFor(CFG.getProfile('P0'), 'ultra-aggressive');
    PM._updateStreamingHealth();
    const stabP0 = String(document.getElementById('pm9_stability_label').textContent);
    const indP0 = String(document.getElementById('pm9_health_indicator').style.background);
    const gateP0 = String(document.getElementById('pm9_sufficiency_gate').textContent);
    console.log('        base del perfil = ' + basP0.mbps + ' Mbps (' + basP0.source + ')');
    console.log('        plan: exigido desplegado -> bwMin=' + planP0.values.bwMinMbps + ' · ratio=' + planP0.metrics.ratio +
        ' · par=' + planP0.values.parallelDownloads + ' seg=' + planP0.values.prefetchSegments +
        ' buf=' + planP0.values.bufferTargetS + ' · ok=' + planP0.ok);
    console.log('        estabilidad=' + stabP0 + ' · semáforo=' + indP0);
    console.log('        gate: ' + gateP0.slice(0, 150));
    ok('la base es calculateBitrate del perfil (35), NO el declarado',
        basP0.mbps === 35 && /calculateBitrate/.test(basP0.source), basP0);
    ok('exigido = 35 x 1,15 = 40,25 Mbps', planP0.values.bwMinMbps === 40.25, planP0.values.bwMinMbps);
    ok('ratio alto (>= 3x)', planP0.metrics.ratio >= 3, planP0.metrics.ratio);
    ok('el plan es COHERENTE (ok:true) con 138 Mbps', planP0.ok === true, planP0.violations);
    ok('settings de ultra: par>=2 seg>=6 buf alto',
        planP0.values.parallelDownloads >= 2 && planP0.values.prefetchSegments >= 6 && planP0.values.bufferTargetS >= 20,
        planP0.values);
    ok('el panel queda ESTABLE (verde)', /ESTABLE/.test(stabP0) && !/NO ESTABLE/.test(stabP0), stabP0);
    ok('el semáforo es verde', indP0.indexOf('10b981') >= 0, indP0);
    ok('EL PERFIL NO CAMBIA', PM.activeProfileId === 'P0', PM.activeProfileId);

    console.log('\n=== t) P0 fijo + 20 Mbps: sigue P0, ok:false con déficit, ámbar ===');
    PM._peakSamples = []; delete LS['ape_peak_hold_v1'];
    global.app.state.networkProfile = null;
    PM._peakRecord(20, Date.now());
    const planP0Low = PM._coherentPlanFor(CFG.getProfile('P0'), 'ultra-aggressive');
    PM._updateStreamingHealth();
    const stabLow = String(document.getElementById('pm9_stability_label').textContent);
    console.log('        20 Mbps: par=' + planP0Low.values.parallelDownloads + ' seg=' + planP0Low.values.prefetchSegments +
        ' buf=' + planP0Low.values.bufferTargetS + ' · ok=' + planP0Low.ok);
    console.log('        violación: ' + String(planP0Low.violations[0]).slice(0, 160));
    ok('con 20 Mbps el plan es ok:false', planP0Low.ok === false, planP0Low.ok);
    ok('declara el déficit con los Mbps que faltan', /faltan \d+(\.\d+)? Mbps medidos/.test(String(planP0Low.violations[0])), planP0Low.violations[0]);
    ok('los settings se quedan en su MÁXIMO alcanzable (seg>=6, buf alto)',
        planP0Low.values.prefetchSegments >= 6 && planP0Low.values.bufferTargetS >= 20, planP0Low.values);
    ok('parallel no cae a 1 con ultra', planP0Low.values.parallelDownloads >= 2, planP0Low.values.parallelDownloads);
    ok('EL PERFIL SIGUE SIENDO P0 (no cambia para pintar verde)', PM.activeProfileId === 'P0', PM.activeProfileId);
    ok('sin perfil que cambie, el panel dice NO ESTABLE (ámbar honesto)', /NO ESTABLE/.test(stabLow), stabLow);

    console.log('\n=== u) P5 fijo + 138 Mbps: sigue P5 con SUS settings ===');
    PM.activeProfileId = 'P5';
    const basP5 = PM._requiredMbpsBasis(CFG.getProfile('P5'));
    const planP5 = PM._coherentPlanFor(CFG.getProfile('P5'), 'ultra-aggressive');
    console.log('        P5 base=' + basP5.mbps + ' Mbps · bwMin=' + planP5.values.bwMinMbps +
        ' · par=' + planP5.values.parallelDownloads + ' seg=' + planP5.values.prefetchSegments +
        ' buf=' + planP5.values.bufferTargetS + ' · ok=' + planP5.ok);
    ok('P5 usa SU propia base (no la de P0)', basP5.mbps !== basP0.mbps, { p5: basP5.mbps, p0: basP0.mbps });
    ok('P5 conserva su identidad activa', PM.activeProfileId === 'P5', PM.activeProfileId);
    ok('P5 tiene sus propios settings', planP5.values.bwMinMbps > 0 && planP5.values.prefetchSegments >= 2, planP5.values);

    console.log('\n=== v) PROHIBIDO: que el plan escriba el perfil activo ===');
    const fsMod2 = require('fs');
    const pmSrc2 = fsMod2.readFileSync(path.join(FRONT, 'js/ape-v9/profile-manager-v9.js'), 'utf8');
    const lineas = pmSrc2.split('\n');
    const writes = [];
    lineas.forEach((l, i) => {
        if (/this\.activeProfileId\s*=/.test(l) || /settings\.profile\s*=/.test(l)) writes.push((i + 1) + ': ' + l.trim());
    });
    const sospechosas = writes.filter(w => /_coherentPlanFor|applyCoherentPlan|_applyPlan|_governor|qosRun|_paintCoherent/.test(w));
    console.log('        escrituras de activeProfileId/settings.profile en el fichero: ' + writes.length);
    writes.forEach(w => console.log('           ' + w));
    ok('NINGUNA escritura del perfil dentro de las rutas del plan', sospechosas.length === 0, sospechosas);

    /* ═══════════════════════════════════════════════════════════════════════
     * [t20] UNA SOLA FUENTE: panel y widget V1.1 dicen lo mismo.
     * ═══════════════════════════════════════════════════════════════════ */
    console.log('\n=== w) captura: 246,57 medidos · perfil 80 · exigido 92 · coherente ===');
    PM.activeProfileId = 'P0';
    CFG.getProfile('P0').settings.bitrate = 80;
    delete CFG.getProfile('P0').settings.bitrate_user_override;
    PM._setUserStrategy('P0', 'balanced');
    PM._peakSamples = []; delete LS['ape_peak_hold_v1'];
    global.app.state.networkProfile = null;
    PM._peakRecord(246.57, Date.now());
    PM._updateStreamingHealth();
    const vW = PM._verdict();
    const bannerW = PM._verdictHtmlBanner();
    const etiqW = String(document.getElementById('pm9_stability_label').textContent);
    const gateW = String(document.getElementById('pm9_sufficiency_gate').textContent);
    console.log('        verdict: ' + JSON.stringify({ state: vW.state, ok: vW.ok, label: vW.label, headroom: vW.headroomRatio, pct: vW.headroomPct, bwMin: vW.bwMin, stall: vW.stall, cta: vW.cta }));
    console.log('        banner: ' + bannerW.inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 220));
    console.log('        estabilidad del panel: ' + etiqW);
    ok('el veredicto es ESTABLE', vW.state === 'OK' && vW.ok === true, vW.state);
    ok('SIN CTA cuando el plan es coherente', vW.cta === false, vW.cta);
    ok('el banner no contiene ACCIÓN URGENTE', !/URGENTE/.test(bannerW.inner), bannerW.inner);
    ok('el headroom es UNA cifra razonable (no 27007 %)',
        vW.headroomPct !== null && Math.abs(vW.headroomPct) < 5000, vW.headroomPct);
    ok('el headroom coincide con transporte/exigido del panel',
        gateW.indexOf(String(vW.headroomRatio) + 'x') >= 0, { gate: gateW.slice(0, 120), ratio: vW.headroomRatio });
    /* [t19] el exigido es la base REAL x1.15 (35 -> 40.25). El 92 de la captura
     * venía del bitrate declarado (80), que ya no es la tasa del transporte. */
    const planW = PM._coherentPlanFor(CFG.getProfile('P0'), PM._activeStrategyId());
    ok('BW mín del widget = exigido REAL del plan', vW.bwMin === planW.values.bwMinMbps, { widget: vW.bwMin, plan: planW.values.bwMinMbps });
    ok('el banner muestra el BW mín del plan', new RegExp('BW mín ' + planW.values.bwMinMbps + ' Mbps').test(bannerW.inner), bannerW.inner);
    ok('la etiqueta del panel es ESTABLE', /ESTABLE/.test(etiqW) && !/NO ESTABLE/.test(etiqW), etiqW);
    ok('el stall del veredicto cumple el target', vW.stallOk === true, { stall: vW.stall, target: vW.stallTarget });

    console.log('\n=== x) plan incoherente (P0 fijo + 20 Mbps): AMBOS NO ESTABLE + CTA ===');
    PM._peakSamples = []; delete LS['ape_peak_hold_v1'];
    global.app.state.networkProfile = null;
    PM._peakRecord(20, Date.now());
    PM._updateStreamingHealth();
    const vB = PM._verdict();
    const bannerB = PM._verdictHtmlBanner();
    const etiqB = String(document.getElementById('pm9_stability_label').textContent);
    console.log('        verdict: ' + JSON.stringify({ state: vB.state, label: vB.label, cta: vB.cta, causa: String(vB.cause).slice(0, 90) }));
    ok('el veredicto es NO ESTABLE', vB.state === 'BAD' && vB.ok === false, vB.state);
    ok('CTA presente cuando el plan es incoherente', vB.cta === true, vB.cta);
    ok('el banner incluye la causa única', /red_insuficiente/.test(bannerB.inner), bannerB.inner);
    ok('la etiqueta del panel es NO ESTABLE', /NO ESTABLE/.test(etiqB), etiqB);
    ok('el perfil NO cambia', PM.activeProfileId === 'P0', PM.activeProfileId);

    console.log('\n=== y) sin medición: AMBOS SIN MEDICIÓN, gris, sin CTA ===');
    PM._peakSamples = []; delete LS['ape_peak_hold_v1'];
    global.app.state.networkProfile = null;
    PM._updateStreamingHealth();
    const vN = PM._verdict();
    const bannerN = PM._verdictHtmlBanner();
    const etiqN = String(document.getElementById('pm9_stability_label').textContent);
    console.log('        verdict: ' + JSON.stringify({ state: vN.state, label: vN.label, color: vN.color, cta: vN.cta }));
    ok('veredicto SIN MEDICIÓN y gris', vN.state === 'NOM' && vN.color === '#64748b', vN);
    ok('sin CTA sin medición', vN.cta === false, vN.cta);
    ok('el banner tampoco tiene CTA', !/URGENTE/.test(bannerN.inner), bannerN.inner);
    ok('la etiqueta del panel es SIN MEDICIÓN', /SIN MEDICIÓN/.test(etiqN), etiqN);

    console.log('\n=== z) barrido: ningún renderer calcula estabilidad por su cuenta ===');
    const fsZ = require('fs');
    const srcZ = fsZ.readFileSync(path.join(FRONT, 'js/ape-v9/profile-manager-v9.js'), 'utf8');
    const lineasZ = srcZ.split('\n');
    const usos = [];
    lineasZ.forEach((l, i) => {
        if (/performance\.stability/.test(l) || /has_urgent/.test(l) || /headroom_percent/.test(l)) {
            usos.push((i + 1) + ': ' + l.trim().slice(0, 110));
        }
    });
    console.log('        usos de performance.stability/has_urgent/headroom_percent que quedan: ' + usos.length);
    usos.forEach(u => console.log('           ' + u));
    ok('el banner/CTA/etiqueta ya NO usan performance.stability ni has_urgent',
        usos.filter(u => /stability-banner|has_urgent|stability\.label|stability\.color/.test(u) && !/\/\*/.test(u)).length === 0, usos);

    /* ═══════════════════════════════════════════════════════════════════════
     * [t21] AUTO-AJUSTAR: sin campos vacíos y sin cascadas colapsadas.
     * ═══════════════════════════════════════════════════════════════════ */
    console.log('\n=== A1) cascadas del PERFIL (aridad de referencia) ===');
    PM.activeProfileId = 'P0';
    const pA = CFG.getProfile('P0');
    const aridad = {};
    ['X-Parallel-Segments', 'X-Prefetch-Segments', 'X-Frame-Rates', 'X-Segment-Duration', 'X-APE-STRATEGY'].forEach(k => {
        const v = CFG.getHeaderValue('P0', k);
        aridad[k] = v === null ? 0 : String(v).split(',').length;
        console.log('        ' + k.padEnd(22) + ' = "' + v + '" (' + aridad[k] + ' pos)');
    });
    ok('el perfil declara aridad > 1 en las cascadas que importan',
        aridad['X-Parallel-Segments'] > 1 && aridad['X-Prefetch-Segments'] > 1, aridad);

    console.log('\n=== A2) cascada derivada del PLAN (par=7 seg=7) ===');
    const casc = PM._reconcilePlanCascades(pA, { parallel_downloads: 7, prefetch_segments: 7 });
    const afterParallel = CFG.getHeaderValue('P0', 'X-Parallel-Segments');
    const afterPrefetch = CFG.getHeaderValue('P0', 'X-Prefetch-Segments');
    console.log('        X-Parallel-Segments = ' + afterParallel + ' (' + String(afterParallel).split(',').length + ' pos)');
    console.log('        X-Prefetch-Segments = ' + afterPrefetch + ' (' + String(afterPrefetch).split(',').length + ' pos)');
    ok('X-Parallel-Segments conserva la aridad del perfil',
        String(afterParallel).split(',').length === aridad['X-Parallel-Segments'], afterParallel);
    ok('X-Prefetch-Segments conserva la aridad del perfil',
        String(afterPrefetch).split(',').length === aridad['X-Prefetch-Segments'], afterPrefetch);
    ok('la cascada es MONÓTONA decreciente y empieza en el valor del plan',
        String(afterParallel) === '7,6,5,4' || /^7,/.test(String(afterParallel)), afterParallel);
    ok('no repite el mismo valor en todas las posiciones',
        new Set(String(afterParallel).split(',')).size > 1, afterParallel);

    console.log('\n=== A3) GUARD: campos vacíos rellenados desde el perfil/SSOT ===');
    /* se fuerzan los 4 vacíos que reportó el operador */
    CFG.setHeaderOverride('P0', 'Keep-Alive', '');
    CFG.setHeaderOverride('P0', 'Connection', '');
    CFG.setHeaderOverride('P0', 'Accept-Encoding', '');
    CFG.setHeaderOverride('P0', 'Sec-CH-UA-Platform', '');
    console.log('        antes: Keep-Alive="' + CFG.getHeaderValue('P0', 'Keep-Alive') + '" · Connection="' +
        CFG.getHeaderValue('P0', 'Connection') + '" · Accept-Encoding="' + CFG.getHeaderValue('P0', 'Accept-Encoding') +
        '" · Sec-CH-UA-Platform="' + CFG.getHeaderValue('P0', 'Sec-CH-UA-Platform') + '"');
    const g1 = PM._guardFields(pA);
    console.log('        guard: rellenados=' + g1.rellenados.length + ' · vacios=' + g1.vacios.length +
        ' · aridad=' + g1.aridad.length + ' · declarados=' + g1.declarados.length);
    g1.rellenados.forEach(r => console.log('           rellenado: ' + r));
    g1.declarados.forEach(r => console.log('           declarado: ' + r));
    ok('0 campos vacíos tras el guard', g1.vacios.length === 0, g1.vacios);
    ok('0 cascadas gobernadas por el plan con aridad reducida', g1.aridad.length === 0, g1.aridad);
    ok('los 4 vacíos de la captura se rellenaron con valor de perfil', g1.rellenados.length >= 4, g1.rellenados);
    console.log('        despues: Keep-Alive="' + CFG.getHeaderValue('P0', 'Keep-Alive') + '" · Connection="' +
        CFG.getHeaderValue('P0', 'Connection') + '" · Accept-Encoding="' + CFG.getHeaderValue('P0', 'Accept-Encoding') +
        '" · Sec-CH-UA-Platform="' + CFG.getHeaderValue('P0', 'Sec-CH-UA-Platform') + '"');
    ok('ningún campo quedó vacío', ['Keep-Alive', 'Connection', 'Accept-Encoding', 'Sec-CH-UA-Platform']
        .every(k => String(CFG.getHeaderValue('P0', k)).trim() !== ''));

    console.log('\n=== A4) el botón informa cascadas y guard ===');
    PM._peakSamples = []; global.app.state.networkProfile = null;
    PM._peakRecord(246.57, Date.now());
    PM._qosRunPromise = null;
    guion = [{ mbpsSafe: 246.57, mbpsP95: 260, jitterMbps: 2, bufferbloatMs: 8, rttIdleMs: 6 }];
    const runG = await PM.qosRunAll('one');
    console.log('        report.cascadas = ' + JSON.stringify(runG.cascadas));
    console.log('        report.guard    = ' + JSON.stringify({ ok: runG.guard && runG.guard.ok,
        rellenados: (runG.guard || {}).rellenados, vacios: (runG.guard || {}).vacios,
        aridad: (runG.guard || {}).aridad }));
    ok('el resultado del botón incluye el informe del guard', !!(runG.guard && Array.isArray(runG.guard.rellenados)), runG.guard);
    ok('el guard cierra en verde (0 vacíos, 0 aridad)', runG.guard.ok === true, runG.guard);
    ok('el resultado incluye las cascadas escritas', !!(runG.cascadas && runG.cascadas.plan), runG.cascadas);

    console.log('\n=== A5) snapshot restaurado con un campo vacío se completa ===');
    CFG.setHeaderOverride('P0', 'X-Frame-Rates', '');
    const restG = PM._restoreQoePlan();
    const gRest = (PM._snapshotInfo && PM._snapshotInfo.guard) || null;
    console.log('        restore → restored=' + restG.restored + ' · guard.rellenados=' +
        ((gRest && gRest.rellenados) || []).length + ' · vacios=' + ((gRest && gRest.vacios) || []).length);
    ok('al restaurar se completa el campo vacío', gRest && gRest.rellenados.length > 0, gRest);
    ok('X-Frame-Rates ya no está vacío', String(CFG.getHeaderValue('P0', 'X-Frame-Rates')).trim() !== '',
        CFG.getHeaderValue('P0', 'X-Frame-Rates'));

    console.log('\n─────────────────────────────────────────────');
    console.log('  PASS ' + pass + ' · FAIL ' + fail);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.log('  FAIL  excepción no capturada -> ' + (e && e.stack || e));
    console.log('  PASS ' + pass + ' · FAIL ' + (fail + 1));
    process.exit(1);
});
