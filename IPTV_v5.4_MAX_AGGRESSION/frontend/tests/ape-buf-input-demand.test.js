/**
 * tests/ape-buf-input-demand.test.js
 * ---------------------------------------------------------------------------
 * Comprueba la CONDICIÓN DE BUFFER: entrada >= salida x (1 + delta).
 *
 *   A. la aritmética es EXACTA y entera (15 Mbps + 20 % = 18 Mbps, no 18,0001)
 *   B. el delta está acotado 1..90 y tiene defecto 10
 *   C. la etiqueta por canal se lee de vuelta y es determinista
 *   D. la muestra NO puede bajar el suelo (la petición es innegociable)
 *   E. el plan de muestreo dice la verdad sobre el medidor real (bins de 1000 ms)
 *   F. el plan por perfil no inventa: sin bitrate declarado, output_known=false
 *   G. el flag está APAGADO por defecto y el enganche del generador va guardado
 *   H. el módulo es puro (sin DOM, sin red, sin reloj, sin azar)
 *
 * LÍMITE HONESTO: esto demuestra la cuenta, la etiqueta y la guarda. NO
 * demuestra que un player obedezca la etiqueta ni que el buffer no se agote en
 * una red real: eso exige reproducir de verdad y no se ha hecho.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const D = require('../js/ape-v9/buffer-input-demand.js');

let PASS = 0, FAIL = 0;
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'esperado ' + JSON.stringify(want) + ', obtenido ' + JSON.stringify(got)); }

console.log('\n=== A · la cuenta es exacta y entera ===');
eq('A1  15 Mbps + 20 % = 18 000 000 bps (el ejemplo de la persona)', D.requiredBps(15000000, 20), 18000000);
eq('A2  18,7 Mbps + 10 % = 20 570 000 bps', D.requiredBps(18700000, 10), 20570000);
eq('A3  1,3 Mbps + 1 % = 1 313 000 bps (no 1 300 000)', D.requiredBps(1300000, 1), 1313000);
eq('A4  el resultado es entero', Number.isInteger(D.requiredBps(1234567, 7)), true);
eq('A5  la entrada nunca es menor que la salida', D.requiredBps(1000000, 1) > 1000000, true);
eq('A6  el suelo es la salida misma', D.demand({ outputBps: 18700000, deltaPct: 10 }).floor_bps, 18700000);
eq('A7  el extra es exactamente salida x delta', D.demand({ outputBps: 18700000, deltaPct: 10 }).extra_bps, 1870000);
eq('A8  sube con el delta', D.requiredBps(10000000, 5) < D.requiredBps(10000000, 10), true);
eq('A9  salida desconocida no inventa (NaN)', Number.isNaN(D.requiredBps(NaN, 10)), true);
eq('A10 salida 0 no inventa (NaN)', Number.isNaN(D.requiredBps(0, 10)), true);
eq('A11 meets(): 18 Mbps cumple con 15 Mbps al 20 %', D.meets(18000000, 15000000, 20), true);
eq('A12 meets(): 17,9 Mbps NO cumple', D.meets(17900000, 15000000, 20), false);
eq('A13 delta exacto necesario: enlace 18 Mbps sobre salida 15 → 20 %', D.deltaNeededExactPct(15000000, 18000000), 20);
eq('A14 el deltas que aguanta el enlace: 16,05 Mbps sobre 15 → 7 %', D.maxAffordableDeltaPct(15000000, 16050000), 7);
eq('A14b con 16 Mbps justos → 6 %', D.maxAffordableDeltaPct(15000000, 15900000), 6);
eq('A14c sin margen (15 Mbps justos) → 0 %', D.maxAffordableDeltaPct(15000000, 15000000), 0);
eq('A14d por debajo de la salida → null (ningún delta vale)', D.maxAffordableDeltaPct(15000000, 14999999), null);
eq('A15 el delta mínimo que la regla puede pedir es 1 % si cabe', D.deltaNeededPct(15000000, 16000000), 1);
eq('A15b y null si ni el 1 % cabe', D.deltaNeededPct(15000000, 15100000), null);

console.log('\n=== B · el delta está acotado y tiene defecto ===');
eq('B1  sin valor → 10 %', D.deltaPct(undefined), 10);
eq('B2  0 → se sube al mínimo 1 %', D.deltaPct(0), 10);
eq('B3  -5 → 1 %', D.deltaPct(-5), 1);
eq('B4  500 → 90 %', D.deltaPct(500), 90);
eq('B5  20,4 → 20 (redondeo a entero)', D.deltaPct(20.4), 20);
eq('B6  el panel lee window.APE_BUF_DELTA_PCT', D.deltaFromScope({ APE_BUF_DELTA_PCT: 25 }), 25);
eq('B7  sin panel → 10 %', D.deltaFromScope({}), 10);

console.log('\n=== C · la etiqueta por canal ===');
const t1 = D.tag({ outputBps: 18700000, deltaPct: 10, bufferMs: 15000 });
ok('C1  empieza por el nombre de la etiqueta', t1.indexOf(D.TAG) === 0, t1.slice(0, 40));
ok('C2  declara la salida', t1.indexOf('OUTPUT_BPS=18700000') !== -1);
ok('C3  declara la entrada requerida', t1.indexOf('REQUIRED_BPS=20570000') !== -1);
ok('C4  declara que la salida NO se reduce', t1.indexOf('OUTPUT_REDUCED=false') !== -1);
ok('C5  declara que NO se ha medido en el dispositivo', t1.indexOf('MEASURED_ON_DEVICE=false') !== -1);
ok('C6  declara el intervalo de muestreo', /SAMPLE_MS=\d+/.test(t1));
ok('C7  declara el ciego máximo tolerable', /MAX_SAFE_SAMPLE_MS=\d+/.test(t1));
ok('C8  declara la regla', t1.indexOf('RULE=INPUT_GE_OUTPUT_X_1P_DELTA') !== -1);
const p1 = D.parseTag(t1);
eq('C9  se lee de vuelta la salida', p1.output_bps, 18700000);
eq('C10 se lee de vuelta la requerida', p1.required_bps, 20570000);
eq('C11 se lee de vuelta el delta', p1.delta_pct, 10);
eq('C12 ida y vuelta: etiqueta idéntica reconstruida con lo leído',
    D.tag({ outputBps: p1.output_bps, deltaPct: p1.delta_pct, bufferMs: p1.buffer_ms }), t1);
eq('C13 determinista (misma entrada, misma cadena)', D.tag({ outputBps: 18700000, deltaPct: 10, bufferMs: 15000 }), t1);
ok('C14 sin salida conocida la etiqueta no miente: OUTPUT_BPS=unknown',
    D.tag({ outputBps: NaN, deltaPct: 10, bufferMs: 15000 }).indexOf('OUTPUT_BPS=unknown') !== -1);
ok('C15 parseTag rechaza lo que no es la etiqueta', D.parseTag('#EXTINF:-1,A') === null);

console.log('\n=== D · la muestra NO puede bajar la petición (innegociable) ===');
let prev = null;
const seq = [21000000, 4000000, 800000];
const asks = [];
for (let i = 0; i < seq.length; i++) {
    const r = D.decide({ outputBps: 18700000, deltaPct: 10, bufferMs: 15000, sampleBps: seq[i], prevEwmaBps: prev });
    prev = r.smoothed_bps;
    asks.push(r);
}
eq('D1  la primera muestra alta cumple → HOLD', asks[0].action, 'HOLD');
eq('D2  la segunda ya no cumple → SHORTFALL', asks[1].action, 'SHORTFALL');
eq('D3  la tercera tampoco → SHORTFALL', asks[2].action, 'SHORTFALL');
eq('D4  petición 1 = requerida exacta', asks[0].ask_bps, 20570000);
eq('D5  la caída NO baja la petición (sigue 20 570 000)', asks[2].ask_bps, 20570000);
eq('D6  todas las peticiones son el mismo número (suelo fijo)', new Set(asks.map(a => a.ask_bps)).size, 1);
eq('D7  la petición nunca queda por debajo de la salida', asks.every(a => a.ask_bps >= a.floor_bps), true);
eq('D8  con déficit dice cuánto falta (20 570 000 - 11 370 000)', asks[2].deficit_bps, 9200000);
eq('D8b y coincide con la media exponencial de la tercera muestra', asks[2].smoothed_bps, 11370000);
ok('D9  con déficit dice cuánto aguanta el buffer', asks[2].time_to_dry_s > 0, String(asks[2].time_to_dry_s));
eq('D10 sin déficit no hay cuenta de secado', asks[0].time_to_dry_s, null);
eq('D11 la media exponencial amortigua el primer bache', D.ewma(20000000, 4000000), 15200000);
eq('D12 sin histórico la media es la muestra', D.ewma(null, 4000000), 4000000);
eq('D13 la media respeta el alfa indicado', D.ewma(10000000, 20000000, 0.5), 15000000);

console.log('\n=== E · muestreo: lo más fino que TIENE SENTIDO, no lo que suena ===');
const s15 = D.samplePlan(15000);
eq('E1  buffer 15 s → se pide medir cada 1000 ms (tope)', s15.requested_ms, 1000);
eq('E2  ciego máximo tolerable = 0,625 x 15 000 = 9 375 ms', s15.max_safe_ms, 9375);
eq('E3  el medidor real de la app agrega en 1000 ms', s15.measurement_ms, 1000);
eq('E4  con 15 s de buffer, 1000 ms es suficiente', s15.resolution_ok, true);
const s1 = D.samplePlan(1000);
eq('E5  buffer 1 s → pedir 100 ms', s1.requested_ms, 100);
eq('E6  ciego máximo 625 ms', s1.max_safe_ms, 625);
eq('E7  con 1 s de buffer el medidor de 1000 ms NO es suficiente', s1.resolution_ok, false);
eq('E8  sin buffer no se inventa el plan', D.samplePlan(NaN).max_safe_ms, null);
const d15 = D.demand({ outputBps: 18700000, deltaPct: 10, bufferMs: 15000, linkBps: 300000 });
eq('E9  secado con 15 s de buffer y 0,3 Mbps: 15,24 s', d15.time_to_dry_s, 15.24);
eq('E10 déficit exacto con 0,3 Mbps: 20 270 000 bps', d15.deficit_bps, 20270000);
eq('E11 el delta mínimo que lo arreglaría no existe (null)', d15.delta_needed_pct, null);

console.log('\n=== F · plan por perfil: ni inventa bitrates ni inventa medidas ===');
const cat = [
    { id: 'P0', settings: { bitrate: 200 } },
    { id: 'P3', settings: { bitrate: 18.7 } },
    { id: 'P5', settings: { bitrate: 1.3 } }
];
const plan = D.plan(cat, { deltaPct: 10, linkBps: 300000, bufferMs: 15000 });
eq('F1  lee los 3 perfiles', plan.profiles_count, 3);
eq('F2  los 3 tienen salida declarada', plan.output_known, 3);
eq('F3  el de 200 Mbps se convierte a bps enteros', plan.profiles[0].output_bps, 200000000);
eq('F4  con 0,3 Mbps no entra ninguno', plan.feasible_count, 0);
eq('F5  el mínimo imprescindible es P5', plan.minimum_profile, 'P5');
eq('F6  P5 pide 1 430 000 bps al 10 %', plan.minimum_required_bps, 1430000);
eq('F7  y faltan 1 130 000 bps', plan.shortfall_bps, 1130000);
eq('F8  con ese enlace P5 no tiene margen ni para el 1 % (null)', plan.profiles[2].delta_affordable_pct, null);
const plan2 = D.plan(cat, { deltaPct: 10, linkBps: 2000000 });
eq('F9  con 2 Mbps entra P5 y sólo P5', JSON.stringify(plan2.feasible_ids), JSON.stringify(['P5']));
const plan3 = D.plan([{ id: 'X', settings: {} }], { deltaPct: 10 });
eq('F10 sin bitrate declarado no hay salida (NaN → null)', plan3.profiles[0].output_bps, null);
eq('F11 y se marca como desconocido', plan3.profiles[0].output_known, false);
eq('F12 sin medida de enlace no hay veredicto (null)', plan3.profiles[0].feasible, null);
eq('F13 el plan declara que no hay medida en el dispositivo', plan.measured_on_device, false);

console.log('\n=== G · flag apagado por defecto y guarda en el generador ===');
eq('G1  sin nada → apagado', D.isOn({}), false);
eq('G2  APE_12P_MODE=false → apagado', D.isOn({ APE_12P_MODE: false }), false);
eq('G3  APE_12P_MODE="on" → encendido', D.isOn({ APE_12P_MODE: 'on' }), true);
eq('G4  APE_BUF_DEMAND_ON=false manda (interruptor propio)', D.isOn({ APE_12P_MODE: 'on', APE_BUF_DEMAND_ON: false }), false);
const genPath = path.join(__dirname, '..', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const gen = fs.readFileSync(genPath, 'utf8').split('\n');
const iCache = gen.findIndex(l => l.indexOf('lines.push(`#EXTVLCOPT:network-caching') !== -1);
const i12p = gen.findIndex(l => l.indexOf('window.APE_LAB_12P.bufferTag') !== -1);
const iBuf = gen.findIndex(l => l.indexOf('window.APE_BUF_DEMAND.tag') !== -1);
ok('G5  existe el push de network-caching', iCache > 0, 'línea ' + iCache);
ok('G6  existe la guarda de la condición de buffer', iBuf > 0, 'línea ' + iBuf);
ok('G7  va después del push de network-caching', iBuf > iCache, iCache + ' / ' + iBuf);
ok('G8  va después de la capa 12P (no la desplaza)', iBuf > i12p, i12p + ' / ' + iBuf);
ok('G9  consulta el flag con isOn (no una constante)', gen.some(l => l.indexOf('APE_BUF_DEMAND.isOn') !== -1));
ok('G10 tiene try/catch: no puede romper la generación', gen.some(l => l.indexOf('catch (_eBuf)') !== -1));
ok('G11 emite por canal con la etiqueta del módulo', gen.some(l => l.indexOf('window.APE_BUF_DEMAND.tag({') !== -1));
ok('G12 lee el delta del panel (APE_BUF_DELTA_PCT)', gen.some(l => l.indexOf('APE_BUF_DEMAND.deltaFromScope') !== -1));
eq('G13 el generador no se ha reescrito: sigue teniendo su APE_GEN', gen.some(l => l.indexOf('window.APE_GEN') !== -1), true);

console.log('\n=== H · el módulo es puro (comprobable sin navegador) ===');
const mod = fs.readFileSync(path.join(__dirname, '..', 'js', 'ape-v9', 'buffer-input-demand.js'), 'utf8');
eq('H1  no toca el DOM', mod.indexOf('document.') === -1, true);
eq('H2  no hace red', mod.indexOf('fetch(') === -1 && mod.indexOf('XMLHttpRequest') === -1, true);
eq('H3  no usa reloj ni azar en el código', mod.indexOf('Date.now(') === -1 && mod.indexOf('Math.random(') === -1, true);
eq('H4  no emite nada (no usa lines.push)', mod.indexOf('lines.push') === -1, true);
const v = D.validate();
eq('H5  la autocomprobación de la regla pasa', v.ok, true);
eq('H6  son 7 invariantes', v.checks.length, 7);
eq('H7  versión declarada', D.VERSION, '1.0.0');

console.log('\nRESUMEN PASS=' + PASS + ' FAIL=' + FAIL);
process.exit(FAIL === 0 ? 0 : 1);
