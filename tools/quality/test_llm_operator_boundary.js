#!/usr/bin/env node
/**
 * test_llm_operator_boundary.js — prueba de frontera del operario LLM (t83).
 *
 * DEMUESTRA, uno por uno:
 *   1. Las CINCO clases de ataque estructural se rechazan con su código.
 *   2. El resto de la frontera: fuera de catálogo, lista negra, invariante, side
 *      cruzado, tipo, rango, 'from' prohibido, propiedad extra, exceso de
 *      perillas, schema_version y nombre que apunta a código.
 *   3. Atomicidad: si un delta falla no se aplica ninguno.
 *   4. Sutileza: un salto por encima del límite de t82 se RECORTA y se registra.
 *   5. Diff: solo cambia el valor; ninguna clave se mueve ni se crea.
 *   6. No se crean claves (E_NO_RECEIPT).
 *   7. Auditoría con los 29 campos de t82, JSONL append-only y tope de 4.096 B.
 *   8. Juez determinista + reversión exacta al valor anterior.
 *   9. Llamada al LLM acotada (timeout, no-JSON, excepción): fallos declarados.
 *  10. RUNTIME: el operario no puede tocar código de la APK (prueba estática de
 *      los dos ficheros del aplicador).
 *
 * Uso: node tools/quality/test_llm_operator_boundary.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OP = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'bin', 'ape-llm-operator.js');
const KT = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'android', 'ape-crystal-agent',
  'app', 'src', 'main', 'java', 'com', 'ape', 'crystalagent', 'llm', 'LlmOperatorApplier.kt');
const CAT = path.join(ROOT, 'contracts', 'llm_operator_knobs_v1.json');

let fails = 0;
const ok = (n, c, d) => { if (c) console.log('PASS  ' + n + (d ? '  (' + d + ')' : '')); else { fails++; console.log('FAIL  ' + n + (d ? '  (' + d + ')' : '')); } };

const op = require(OP);
const cat = op.loadCatalog(CAT);

console.log('== 0) catalogo de t81 (fuente unica de perillas) ==');
ok('se cargan las 90 perillas', cat.count === 90, 'knobs=' + cat.count);
ok('lista negra poblada y 1 invariante', cat.blacklist.size >= 100 && cat.invariants.size === 1,
  'negra=' + cat.blacklist.size + ' · invariantes=' + [...cat.invariants].join(','));
ok('el catalogo se identifica por sha256', /^[a-f0-9]{64}$/.test(cat.sha256), cat.sha256.slice(0, 16) + '...');

const K = [...cat.knobs.values()].find((k) => k.side === 'vps' && k.type === 'int'
  && typeof k.safe_min === 'number' && typeof k.safe_max === 'number' && k.safe_max > k.safe_min);
const invariant = [...cat.invariants][0];
const blackName = [...cat.blacklist][0];
ok('hay perilla vps int con rango para las pruebas', !!K, K ? K.name + ' [' + K.safe_min + ',' + K.safe_max + ']' : 'ninguna');

/** Contenedor con la perilla elegida ya presente en su ruta de puntos. */
function makeCtx(withKnob) {
  const sd = {
    exoplayer: { load_control: { minBufferMs: 20000 } },
    com: { ape: { network_resilience: { retryCount: 5 } } },
  };
  if (withKnob !== false) {
    const parts = K.name.split('.');
    let cur = sd;
    for (let i = 0; i < parts.length - 1; i++) { if (!cur[parts[i]]) { cur[parts[i]] = {}; } cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = K.safe_min;
  }
  return {
    exthttp: { 'X-Buffer-Target': '6667', 'X-Min-Buffer-Time': '5', 'X-Max-Buffer-Time': '16', 'X-Prefetch-Segments': '8' },
    sessionData: sd,
  };
}
const round = (deltas, side) => ({
  round_id: 'r-20261115-0001', schema_version: 'ape.llm.operator.output/1',
  side: side || 'vps', decision: { kind: 'change', deltas },
});
const why = (r) => r.code + ' · ' + r.reason;

/* 1 — CINCO ataques estructurales */
console.log('\n== 1) cinco ataques estructurales, uno por uno ==');
const attacks = [
  ['ANADIR UN TAG (#EXTINF)', round([{ knob: '#EXTINF:-1 tvg-id="1"', to: 1 }]), op.CODES.STRUCTURE],
  ['CAMBIAR UNA URL', round([{ knob: 'url', to: 'http://169.254.169.254/x.m3u8' }]), op.CODES.STRUCTURE],
  ['CAMBIAR EL Nº DE CANALES', round([{ knob: 'canales', to: 10573 }]), op.CODES.STRUCTURE],
  ['ALTERAR #EXTSHIMOTT', round([{ knob: '#EXTSHIMOTT:version=2', to: 2 }]), op.CODES.STRUCTURE],
  ['TOCAR LA PLANTILLA', round([{ knob: 'X-Buffer-Target', to: '#EXT-X-APE-PROFILE-TEMPLATE:P3' }]), op.CODES.STRUCTURE],
];
for (const [name, r, want] of attacks) {
  const v = op.validate(r, cat, { side: 'vps' });
  ok('rechaza ' + name, v.ok === false && v.code === want, why(v));
}

/* 2 — resto de la frontera */
console.log('\n== 2) frontera de validacion (resto) ==');
const more = [
  ['perilla fuera del catalogo', round([{ knob: 'X-Inventada', to: 1 }]), op.CODES.NOT_A_KNOB],
  ['nombre de la LISTA NEGRA (' + blackName + ')', round([{ knob: blackName, to: 1 }]), op.CODES.NOT_A_KNOB],
  ['INVARIANTE ' + invariant, round([{ knob: invariant, to: 12 }]), op.CODES.INVARIANT],
  ['side cruzado (apk en vuelta vps)', round([{ knob: K.name, to: K.safe_min }], 'apk'), op.CODES.SIDE_MISMATCH],
  ['tipo erroneo (string donde int)', round([{ knob: K.name, to: 'mucho' }]), op.CODES.TYPE],
  ['fuera de rango (' + (K.safe_max + 1) + ')', round([{ knob: K.name, to: K.safe_max + 1 }]), op.CODES.RANGE],
  ['delta con "from" (t82 lo prohibe)', round([{ knob: K.name, to: K.safe_min, from: 1 }]), op.CODES.SCHEMA],
  ['propiedad extra en la vuelta', { ...round([{ knob: K.name, to: K.safe_min }]), extra: 1 }, op.CODES.SCHEMA],
  ['mas perillas que el maximo por iteracion', round([1, 2, 3, 4].map(() => ({ knob: K.name, to: K.safe_min }))), op.CODES.TOO_MANY],
  ['schema_version distinto', { ...round([{ knob: K.name, to: K.safe_min }]), schema_version: 'otro/1' }, op.CODES.SCHEMA],
  ['knob que nombra codigo .kt', round([{ knob: 'Foo.kt', to: 1 }]), op.CODES.APK_CODE],
];
for (const [name, r, want] of more) {
  const v = op.validate(r, cat, { side: 'vps' });
  ok('rechaza ' + name, v.ok === false && v.code === want, why(v));
}

/* 3 — atomicidad */
console.log('\n== 3) atomicidad ==');
const vmix = op.validate(round([{ knob: 'X-Buffer-Target', to: 6700 }, { knob: '#EXTINF', to: 1 }]), cat, { side: 'vps' });
ok('si UN delta falla, la vuelta entera se rechaza (0 aceptados)', vmix.ok === false && vmix.deltas.length === 0, why(vmix));

/* 4 — sutileza: recorte al limite de t82 */
console.log('\n== 4) sutileza: recorte por paso (25 %) ==');
const ctx = makeCtx();
const from = K.safe_min;
const vj = op.validate(round([{ knob: K.name, to: K.safe_max }]), cat, { side: 'vps' });
const aj = op.apply(vj, vj, ctx);
const rec0 = aj.receipts && aj.receipts[0];
const esperado = from + Math.floor(Math.abs(from) * 0.25);
ok('el delta se acepta y se RECORTA', vj.ok && rec0 && rec0.clamped === true,
  rec0 ? (from + ' -> pedido ' + K.safe_max + ' -> aplicado ' + rec0.to + ' (' + rec0.why + ')') : 'sin recibo');
ok('el recorte usa la fraccion del catalogo (25 %)', rec0 && Number(rec0.to) === esperado,
  'esperado ' + esperado + ', obtenido ' + (rec0 && rec0.to));

/* 5 — diff: solo el valor */
console.log('\n== 5) diff: solo cambia el valor ==');
const changes = op.diffObjects(ctx, { exthttp: aj.exthttp, sessionData: aj.sessionData });
ok('un solo cambio, en la ruta pedida',
  changes.length === 1 && changes[0].path === 'sessionData.' + K.name && changes[0].kind === 'value',
  JSON.stringify(changes));
ok('el numero de claves de EXTHTTP no cambia',
  Object.keys(aj.exthttp).length === Object.keys(ctx.exthttp).length,
  Object.keys(ctx.exthttp).length + ' -> ' + Object.keys(aj.exthttp).length);

/* 6 — no se crean claves */
console.log('\n== 6) no se crean claves ==');
const ctxSin = makeCtx(false);
const vNew = op.validate(round([{ knob: K.name, to: K.safe_min }]), cat, { side: 'vps' });
const aNew = op.apply(vNew, vNew, ctxSin);
ok('perilla valida ausente del contenedor -> E_NO_RECEIPT (no se inventa la clave)',
  aNew.ok === false && aNew.code === op.CODES.NO_RECEIPT, aNew.code + ' · ' + aNew.reason);

/* 7 — auditoria */
console.log('\n== 7) auditoria append-only ==');
const rec = op.auditRecord({
  decision_id: 'd-1', round_id: 'r-20261115-0001', ts: new Date().toISOString(), channel_id: '1234', side: 'vps',
  knob: K.name, from: from, to: rec0 ? rec0.to : from, reason_code: 'R_BUFFER_LOW',
  metric: 'buffer_ms', metric_value: 2400, metric_unit: 'ms', validation_ok: true, outcome: 'unverified',
});
const parsed = JSON.parse(rec);
const missing = op.AUDIT_FIELDS.filter((f) => !(f in parsed));
ok('el registro tiene los ' + op.AUDIT_FIELDS.length + ' campos de t82', missing.length === 0, 'faltan: ' + (missing.join(',') || 'ninguno'));
ok('lleva LADO, valor anterior y valor nuevo', parsed.side === 'vps' && parsed.from === from && parsed.to === rec0.to,
  parsed.from + ' -> ' + parsed.to + ' (' + parsed.side + ')');
ok('sin ventana de verificacion el resultado es unverified', parsed.outcome === 'unverified');
ok('el registro no supera 4.096 B', Buffer.byteLength(rec) <= 4096, Buffer.byteLength(rec) + ' B');
const af = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 't83-')), 'audit.jsonl');
const w1 = op.auditAppend(rec, af), w2 = op.auditAppend(rec, af);
ok('append-only: dos escrituras dejan dos lineas', w1.ok && w2.ok && fs.readFileSync(af, 'utf8').trim().split('\n').length === 2);

/* 8 — juez y reversion */
console.log('\n== 8) juez determinista y reversion ==');
const jW = op.judge({ buffer_ms: 5000 }, { buffer_ms: 3200 });
ok('buffer cae > 1000 ms => worsened', jW.outcome === 'worsened', jW.reason);
ok('caida dentro de la banda muerta => neutral', op.judge({ buffer_ms: 5000 }, { buffer_ms: 4600 }).outcome === 'neutral');
ok('subida de buffer => improved', op.judge({ buffer_ms: 3000 }, { buffer_ms: 5000 }).outcome === 'improved');
const rev = op.decideRevert(jW, { knob: K.name, from: from, to: rec0.to });
ok('la reversion devuelve EXACTAMENTE el valor anterior', rev && rev.to === from && rev.from === rec0.to,
  rev ? (rev.from + ' -> ' + rev.to) : 'sin reversion');
ok('sin empeoramiento no hay reversion', op.decideRevert({ outcome: 'neutral' }, {}) === null);

/* 9 y 10 — asincrono */
(async () => {
  console.log('\n== 9) llamada al LLM acotada ==');
  ok('timeout declarado', op.LLM_TIMEOUT_MS > 0 && op.LLM_TIMEOUT_MS <= 5000, op.LLM_TIMEOUT_MS + ' ms');
  ok('presupuesto de tokens declarado', op.LLM_MAX_TOKENS_OUT === 512 && op.LLM_CALLS_PER_ROUND === 1,
    op.LLM_MAX_TOKENS_OUT + ' tokens · ' + op.LLM_CALLS_PER_ROUND + ' llamada/vuelta');
  const nj = await op.boundedCall(() => 'esto no es json');
  ok('respuesta no-JSON => fallo declarado sin excepcion', nj.ok === false && nj.code === op.CODES.OUTPUT, nj.code);
  const ne = await op.boundedCall(() => { throw new Error('proveedor caido'); });
  ok('excepcion del LLM => fallo declarado sin propagar', ne.ok === false && ne.code === op.CODES.OUTPUT, ne.code);
  const to = await op.boundedCall(() => new Promise((r) => setTimeout(() => r('{"a":1}'), op.LLM_TIMEOUT_MS + 150)));
  ok('timeout => E_LLM_TIMEOUT con su latencia', to.ok === false && to.timeout_hit === true, to.code + ' tras ' + to.latency_ms + ' ms');

  console.log('\n== 10) runtime: el operario NO puede tocar codigo de la APK ==');
  /* Se quitan los COMENTARIOS antes de buscar APIs prohibidas: una cabecera que
   * DOCUMENTA lo prohibido no es una violacion (falso positivo que este mismo test
   * tuvo en su primera version). */
  const stripComments = (src, lang) => (lang === 'kt'
    ? src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    : src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, ''));
  const js = stripComments(fs.readFileSync(OP, 'utf8'), 'js');
  /* t87: el modulo SI usa child_process, pero SOLO para fork(__filename) (el
   * juez en otro proceso). Lo que sigue prohibido es lanzar programas libres. */
  ok('no usa spawn/exec/execSync (ningun programa libre)', !/\.(spawn|exec|execSync|execFile)\s*\(/.test(js));
  ok('fork SOLO con __filename (el juez es este mismo fichero)', /fork\(__filename,/.test(js) && !/fork\([^_)]/.test(js));
  ok('el modulo JS no escribe ficheros de codigo', !/writeFileSync\([^)]*\.(kt|java|gradle|kts|apk|dex|so)/i.test(js));
  ok('sus unicas escrituras son el estado compartido (tmp+rename) y el log append', /writeFileSync\(tmp/.test(js) && /appendFileSync/.test(js));
  ok('el modulo JS solo escribe el log de auditoria (appendFileSync)', /appendFileSync/.test(js));
  ok('el modulo JS no contiene rutas de /opt/ape-jit ni del APK instalado', !/\/opt\/ape-jit|\.apk['"]/.test(js));
  if (fs.existsSync(KT)) {
    const kt = stripComments(fs.readFileSync(KT, 'utf8'), 'kt');
    const forbidden = ['java.io.File', 'FileOutputStream', 'FileWriter', 'Runtime.getRuntime', 'ProcessBuilder', 'PackageManager', 'installPackage', '.exec('];
    const hits = forbidden.filter((f) => kt.indexOf(f) !== -1);
    ok('el aplicador Kotlin no puede escribir ficheros, compilar ni instalar', hits.length === 0,
      hits.length ? 'PROHIBIDO: ' + hits.join(', ') : 'ninguno de ' + forbidden.length + ' simbolos');
    ok('el Kotlin declara los mismos codigos de rechazo',
      ['E_STRUCTURE_TOUCHED', 'E_APK_CODE_TOUCHED', 'E_INVARIANT_TOUCHED', 'E_NOT_A_KNOB'].every((c) => kt.indexOf(c) !== -1));
    ok('el Kotlin no crea claves', /no se crean claves/.test(kt));
    console.log('SKIP  gradle assembleDebug  (NO COMPUTADO: el arbol tiene gradlew pero este host no tiene Android SDK ni JDK de Android configurado; no se puede invocar sin declarar un entorno que no existe)');
  } else {
    ok('existe el aplicador del lado APK', false, 'falta ' + path.relative(ROOT, KT));
  }

  /* ── 11. F1 identidad compartida ── */
  console.log('\n== 11) F1 identidad compartida APK <-> VPS ==');
  const stFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 't87-')), 'state.json');
  const idVps = op.operatorId(cat.sha256);
  const idApk = op.operatorId(cat.sha256);
  ok('los dos lados calculan EL MISMO id sin hablarse', idVps === idApk && /^op-[a-f0-9]{24}$/.test(idVps), idVps);
  const decV = op.publishDecision('vps', { kind: 'change', deltas: [{ knob: 'X-Buffer-Target', to: 6700 }] }, stFile, cat.sha256);
  ok('una decision del VPS se escribe en el estado compartido', decV.ok && decV.state.seq === 1);
  ok('esa decision es VISIBLE desde el otro lado', op.readShared(stFile, cat.sha256).last.side === 'vps');
  const decA = op.publishDecision('apk', { kind: 'change', deltas: [{ knob: 'display_mode_hdr', to: 1 }] }, stFile, cat.sha256);
  ok('una decision del APK se escribe y el VPS la ve', decA.ok && op.readShared(stFile, cat.sha256).last.side === 'apk');
  ok('el APK despierta al operario', op.wake('apk', 'desde-apk', stFile, cat.sha256).ok && op.readShared(stFile).wake.by === 'apk');
  const tw = op.takeWake(stFile, cat.sha256);
  ok('el VPS consume el despertar y lo limpia', tw && tw.by === 'apk' && op.readShared(stFile).wake === null);
  ok('y el VPS tambien puede despertarlo', op.wake('vps', 'desde-vps', stFile, cat.sha256).ok && op.readShared(stFile).wake.by === 'vps');

  /* ── 12. F2 rutinas: enum cerrado ── */
  console.log('\n== 12) F2 rutinas: enum CERRADO ==');
  ok('el enum de rutinas es cerrado y nombrado', op.ROUTINES.length === 6 && Object.isFrozen(op.ROUTINES), op.ROUTINES.join(','));
  for (const inv of ['BORRAR_TODO', 'rm_rf', 'RUTINA_INVENTADA']) {
    const v = op.validateRoutine(inv);
    ok('rutina inventada rechazada: ' + inv, v.ok === false && v.code === 'E_ROUTINE_UNKNOWN', v.reason);
  }
  ok('rutina del enum sin handler -> E_ROUTINE_UNAVAILABLE', op.runRoutine('PROBE_CHANNEL', {}).code === 'E_ROUTINE_UNAVAILABLE');
  let corridas = 0;
  const rOk = op.runRoutine('FLUSH_TELEMETRY', { FLUSH_TELEMETRY: () => { corridas++; return 'ok'; } });
  ok('rutina del enum SI se ejecuta con handler inyectado', rOk.ok && corridas === 1);
  ok('un nombre libre NUNCA llega a un handler',
    op.runRoutine('BORRAR_TODO', { BORRAR_TODO: () => { throw new Error('no deberia ejecutarse'); } }).ok === false);

  /* ── 13. F3 procesos: enum cerrado ── */
  console.log('\n== 13) F3 procesos despertables: enum CERRADO ==');
  ok('el enum de procesos es cerrado y nombrado', op.PROCESSES.length === 3 && Object.isFrozen(op.PROCESSES), op.PROCESSES.join(','));
  for (const par of [['systemd', 'E_PROCESS_FORBIDDEN'], ['BORRAR_DISCO', 'E_PROCESS_UNKNOWN'], ['nginx', 'E_PROCESS_FORBIDDEN'],
    ['php-fpm', 'E_PROCESS_FORBIDDEN'], ['server.js', 'E_PROCESS_FORBIDDEN'], ['ape-jit.service', 'E_PROCESS_FORBIDDEN']]) {
    const v = op.validateProcess(par[0]);
    ok('proceso rechazado: ' + par[0], v.ok === false && v.code === par[1], v.reason);
  }
  ok('proceso del enum SI se despierta con handler', op.wakeProcess('FLUSHER', { FLUSHER: () => 'wake' }).ok === true);
  ok('proceso del enum sin handler -> E_PROCESS_UNAVAILABLE', op.wakeProcess('PROBE_WORKER', {}).code === 'E_PROCESS_UNAVAILABLE');

  /* ── 14. F4 juez en proceso separado ── */
  console.log('\n== 14) F4 juez en PROCESO SEPARADO ==');
  /* El kill() es asincrono: esperar un tiempo fijo era una carrera (el test se
   * volvio intermitente al crecer). Se espera al EXIT de verdad, con tope. */
  const waitDead = (h, ms) => new Promise((r) => {
    const t0 = Date.now();
    const tick = () => {
      if (!h.alive() || Date.now() - t0 > (ms || 5000)) { r(!h.alive()); return; }
      setTimeout(tick, 25);
    };
    tick();
  });
  const juez = op.spawnJudge();
  const v1 = await juez.ask({ buffer_ms: 5000 }, { buffer_ms: 3200 });
  ok('el juez corre en OTRO PROCESO (pid distinto)', juez.pid !== process.pid && v1 && v1.pid === juez.pid, 'juez=' + juez.pid + ' · este=' + process.pid);
  ok('y dicta lo mismo que el juez en proceso', v1 && v1.outcome === 'worsened', v1 && v1.reason);
  const hijo = op.spawnOperator();
  const ping = await hijo.ping();
  ok('el operario-hijo arranca y responde', ping && ping.pid === hijo.pid, 'pid=' + (ping && ping.pid));
  hijo.kill();
  await waitDead(hijo);
  ok('APAGAR EL OPERARIO no apaga al juez', hijo.alive() === false && juez.alive() === true);
  const v2 = await juez.ask({ buffer_ms: 5000 }, { buffer_ms: 4900 });
  ok('el juez sigue contestando tras apagar el operario', v2 && v2.outcome === 'neutral', v2 && v2.reason);
  juez.kill();
  await waitDead(juez);
  ok('APAGAR EL JUEZ no apaga al operario', juez.alive() === false);
  const hijo2 = op.spawnOperator();
  const ping2 = await hijo2.ping();
  ok('el operario sigue vivo y validando tras apagar al juez', ping2 && ping2.pid === hijo2.pid);
  const ap = await hijo2.apply(round([{ knob: K.name, to: K.safe_min }]));
  ok('y aplica en su propio proceso (E_OK)', ap && ap.ok === true, ap && (ap.ok + ' ' + ap.code));
  hijo2.kill();
  /* ── 15. RUTINA DISCOVER_ACTIVE_LIST (t88, con el log REAL) ── */
  console.log('\n== 15) DISCOVER_ACTIVE_LIST: log real y ejes de la lista ==');
  ok('la rutina esta en el enum CERRADO y es la sexta', op.ROUTINES.indexOf('DISCOVER_ACTIVE_LIST') !== -1 && op.ROUTINES.length === 6, op.ROUTINES.join(','));
  const T0 = Date.UTC(2026, 10, 15, 15, 0, 0);
  const DEV = '181.130.154.235', VPS = '178.156.147.234';
  const linea = (ip, ruta, hh, mm) => ip + ' - - [15/Nov/2026:' + hh + ':' + mm + ':00 +0000] "GET ' + ruta
    + ' HTTP/1.1" 200 1024 "-" "Dalvik/2.1.0 (Android 14; onn. 4K Streaming Box) OTT Navigator/1.7.3.3"';
  /* Reproduccion EXACTA de lo medido por el capitan sobre playlist_access.log:
   * device 17.825 · /pulse/ 569 · /lists/ 29 (14+8+6) · host 8.504 · loopback 897. */
  const mkReal = () => {
    const L = [];
    for (const par of [['APE_LISTA_1794100720046.m3u8', 14], ['APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8', 8], ['APE_LISTA_1794100720046_CABLEADA.m3u8', 6]]) {
      for (let k = 0; k < par[1]; k++) { L.push(linea(DEV, '/lists/' + par[0], '10', '0' + (k % 10))); }
    }
    for (let k = 0; k < 569; k++) { L.push(linea(DEV, '/pulse?u=http%3A%2F%2Fprovider%2Flive%2F' + k, '11', String(10 + (k % 40)))); }
    L.push(linea(DEV, '/lists/APE_LISTA_1794100720046_4K.m3u8', '10', '09'));   /* la 29ª descarga: otro fichero */
    for (let k = 0; k < 17825 - 29 - 569; k++) { L.push(linea(DEV, '/seg/' + k + '.ts', '12', '00')); }
    for (let k = 0; k < 8504; k++) { L.push(linea(VPS, '/lists/APE_LISTA_1794100720046.m3u8', '13', '00')); }
    for (let k = 0; k < 897; k++) { L.push(linea('127.0.0.1', '/health', '13', '01')); }
    return L.join('\n');
  };
  const realLog = mkReal();
  const STUB = '#EXTM3U';                                  /* 8 B, como el fichero real */
  const REAL_LIST = '#EXTM3U\n#EXT-X-APE-CHANNELS:21224\n'
    + Array.from({ length: 21224 }, (_, k) => '#EXTINF:-1,c' + k).join('\n') + '\n'
    + Array.from({ length: 21224 }, (_, k) => 'http://iptv-ape.duckdns.org/pulse?u=ch' + k).join('\n') + '\n';
  const src = [{ path: '/var/log/nginx/playlist_access.log', bytes: 7094624, lines: realLog.split('\n').length }];
  const depsReal = (lista) => ({
    readAccessLog: () => ({ text: realLog, sources: src }),
    readListFile: (n) => (n.indexOf('pulse/') === 0 ? lista : STUB),
    hostIps: [VPS], discover: { now: T0, window_ms: 86400000 },
  });

  const rr = op.runRoutine('DISCOVER_ACTIVE_LIST', depsReal(REAL_LIST));
  ok('PULSE_PROXIED con los numeros REALES', rr.result.state === 'PULSE_PROXIED', rr.result.reason);
  ok('device 17.825 · /lists/ 29 · /pulse/ 569',
    rr.result.evidence.requests_total === 17825 && rr.result.evidence.list_requests === 29 && rr.result.evidence.pulse_requests === 569,
    JSON.stringify({ t: rr.result.evidence.requests_total, l: rr.result.evidence.list_requests, p: rr.result.evidence.pulse_requests }));
  ok('los tres ficheros del device: 14 / 8 / 6 (la 29ª descarga es otro fichero)', rr.result.evidence.files[0].requests === 14 && rr.result.evidence.files[1].requests === 8 && rr.result.evidence.files[2].requests === 6 && rr.result.evidence.list_requests === 29, JSON.stringify(rr.result.evidence.files));
  ok('autotrafico APARTE: 8.504 del host + 897 loopback', rr.result.evidence.excluded.self_host === 8504 && rr.result.evidence.excluded.loopback === 897,
    JSON.stringify(rr.result.evidence.excluded));
  ok('resuelve el STUB de 8 B y lee la lista real de pulse/', rr.result.evidence.list_resolved === 'pulse/APE_LISTA_1794100720046.m3u8', String(rr.result.evidence.list_resolved));
  ok('declara QUE log leyo y cuantas lineas', rr.result.evidence.log_sources[0].path.indexOf('playlist_access.log') !== -1 && rr.result.evidence.log_lines === realLog.split('\n').length,
    JSON.stringify(rr.result.evidence.log_sources) + ' lineas=' + rr.result.evidence.log_lines);
  ok('0 plantillas y 0 #EXTSHIMOTT => PULSE_ONLY (no es LA lista que construimos)',
    rr.result.evidence.profile_templates === 0 && rr.result.evidence.shimott_count === 0 && rr.result.projection === 'PULSE_ONLY',
    'plantillas=' + rr.result.evidence.profile_templates + ' shimott=' + rr.result.evidence.shimott_count + ' proyeccion=' + rr.result.projection);
  const rr2 = op.runRoutine('DISCOVER_ACTIVE_LIST', depsReal(REAL_LIST + '#EXT-X-APE-PROFILE-TEMPLATE:P3\n#EXTSHIMOTT:version=2\n'));
  ok('con plantillas y #EXTSHIMOTT => LIGHT_PROJECTED', rr2.result.projection === 'LIGHT_PROJECTED',
    'plantillas=' + rr2.result.evidence.profile_templates + ' shimott=' + rr2.result.evidence.shimott_count);

  /* El log EQUIVOCADO: vacio -> NO_COMPUTADO con razon, nunca 0 silencioso. */
  const vacio = op.runRoutine('DISCOVER_ACTIVE_LIST', {
    readAccessLog: () => ({ text: '', sources: [{ path: '/var/log/nginx/access.log', bytes: 0, lines: 0, note: 'vacio' }] }),
    readListFile: () => REAL_LIST, hostIps: [VPS], discover: { now: T0, window_ms: 86400000 },
  });
  ok('log vacio/inexistente -> NO_COMPUTADO con razon literal (no 0 silencioso)',
    vacio.result.state === 'NO_COMPUTADO' && /vacios o no existen/.test(vacio.result.reason), vacio.result.reason);

  const directo = op.runRoutine('DISCOVER_ACTIVE_LIST', {
    readAccessLog: () => ({ text: linea(DEV, '/lists/APE_LISTA_x_CABLEADA_LIGHT.m3u8', '10', '00'), sources: [{ path: 'x', bytes: 1, lines: 1 }] }),
    readListFile: () => '#EXTM3U\nhttp://provider.example:8080/live/u/p/1.m3u8\n',
    hostIps: [VPS], discover: { now: T0, window_ms: 86400000 },
  });
  ok('DIRECT_PROVIDER aunque el fichero se llame CABLEADA_LIGHT (el nombre NO decide)', directo.result.state === 'DIRECT_PROVIDER', directo.result.reason);

  const dos = op.runRoutine('DISCOVER_ACTIVE_LIST', {
    readAccessLog: () => ({ text: linea(DEV, '/lists/A.m3u8', '10', '00') + '\n' + linea('80.80.80.80', '/lists/B.m3u8', '11', '00'), sources: [{ path: 'x', bytes: 1, lines: 2 }] }),
    readListFile: () => REAL_LIST, hostIps: [VPS], discover: { now: T0, window_ms: 86400000 },
  });
  ok('varios candidatos -> NO_COMPUTADO y se reportan TODOS', dos.result.state === 'NO_COMPUTADO' && dos.result.evidence.candidates.length === 2, dos.result.reason);

  const jsSrc2 = fs.readFileSync(OP, 'utf8');
  const bloque = jsSrc2.slice(jsSrc2.indexOf('RUTINA · DISCOVER_ACTIVE_LIST'), jsSrc2.indexOf('const BUILTIN_ROUTINES'));
  ok('solo lectura: sin escrituras, borrados ni mkdir',
    !/writeFileSync|appendFileSync|unlinkSync|rmSync|mkdirSync|renameSync|chmodSync/.test(bloque) && /readFileSync/.test(bloque));
  ok('el log configurado NO es access.log (el equivocado)', op.ACCESS_LOG_PATHS[0].indexOf('playlist_access.log') !== -1 && op.ACCESS_LOG_PATHS.indexOf('/var/log/nginx/access.log') === -1,
    op.ACCESS_LOG_PATHS.join(' , '));
  ok('la IP del device NO esta hardcodeada', jsSrc2.indexOf('181.130.154.235') === -1);
  console.log('\n' + (fails ? 'FALLOS: ' + fails : 'OK: todos los controles en verde'));
  process.exit(fails ? 1 : 0);
})();
