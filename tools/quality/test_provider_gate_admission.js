#!/usr/bin/env node
/* test_provider_gate_admission.js — verifica la ADMISION ANTE EL PROVEEDOR del JIT (t55).
 *
 * Que prueba, y por que asi:
 *   1. EJECUTA la funcion REAL del motor (no una copia): extrae de
 *      tools/lab/ape-jit/server.js el bloque providerGateAdmit + sus constantes
 *      y lo evalua en un sandbox con `execFileSync`, `fs` y `log` controlados.
 *   2. Ejercita la TABLA DE DECISION que importa: que DENY signifique "no abras
 *      la conexion" y que `jit_serving_player_path` sea la UNICA excepcion.
 *   3. Comprueba el CABLEADO: que la llamada este DESPUES de slotAcquire() y
 *      ANTES de spawn() — si alguien la mueve, el 502 vuelve y este test falla.
 *   4. Ejecuta de verdad la linea de bash contra un gate falso, para probar que
 *      el contrato `decision=… claimant=… level=… reason=…` se parsea.
 *
 * Uso: node tools/quality/test_provider_gate_admission.js
 * Salida: lineas PASS/FAIL y exit 1 si algo falla. Sin red, sin VPS, sin ffmpeg.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'tools', 'lab', 'ape-jit', 'server.js');
const SRC = fs.readFileSync(SERVER, 'utf8');

let fails = 0;
const ok = (n, c, d) => { if (c) console.log('PASS  ' + n + (d ? '  (' + d + ')' : '')); else { fails++; console.log('FAIL  ' + n + (d ? '  (' + d + ')' : '')); } };

/* ── 1. Extraer el bloque real del motor ──────────────────────────────────
 * Del `const PG_LIB` al cierre de providerGateAdmit. Se cuenta llaves para no
 * depender de numeros de linea que el siguiente parche movera. */
function extractBlock(src) {
  const start = src.indexOf("const PG_LIB = process.env.APE_PROVIDER_GATE");
  if (start < 0) return null;
  const fnAt = src.indexOf('function providerGateAdmit(', start);
  if (fnAt < 0) return null;
  let i = src.indexOf('{', fnAt), depth = 0, end = -1;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) return null;
  return src.slice(start, end);
}

const block = extractBlock(SRC);
ok('bloque providerGateAdmit extraido del motor real', !!block, block ? block.length + ' B' : 'no encontrado');

/* Sandbox: mismos nombres que el motor espera. execFileSync es sustituible. */
function buildSandbox(gateBehaviour) {
  const logs = [];
  const fsStub = { existsSync: () => gateBehaviour.libPresent !== false };
  const execStub = (bin, args, opts) => {
    if (gateBehaviour.throws) {
      const e = new Error('Command failed');
      e.stdout = gateBehaviour.stdout || '';
      e.signal = gateBehaviour.signal || null;
      throw e;
    }
    return gateBehaviour.stdout;
  };
  const factory = new Function('fs', 'execFileSync', 'log', 'process', 'require',
    block + '\n; return { providerGateAdmit: providerGateAdmit, gateStats: gateStats };');
  const api = factory(fsStub, execStub, (...a) => logs.push(a.join(' ')), { env: {} }, require);
  return { api, logs };
}

const LINE = (d, r) => 'PROVIDER_GATE decision=' + d + ' claimant=jit level=2 reason=' + r +
  ' player_age_s=3 player_signal=zap player_window_s=45 canary_live="" jit_pids="" selftest=ok ts=2026-11-14T00:00:00Z';

/* ── 2. Tabla de decision (funcion REAL, gate simulado) ──────────────────── */
const cases = [
  ['ALLOW idle_admit                       -> permite', { stdout: LINE('ALLOW', 'idle_admit') }, true, 'idle_admit'],
  ['DENY  player_active                    -> BLOQUEA', { stdout: LINE('DENY', 'player_active'), throws: true }, false, 'player_active'],
  ['DENY  canary_holds_connection          -> BLOQUEA', { stdout: LINE('DENY', 'canary_holds_connection'), throws: true }, false, 'canary_holds_connection'],
  ['DENY  player_state_unknown_failclosed  -> BLOQUEA', { stdout: LINE('DENY', 'player_state_unknown_failclosed'), throws: true }, false, 'player_state_unknown_failclosed'],
  ['DENY  jit_serving_player_path          -> PERMITE (unica excepcion)', { stdout: LINE('DENY', 'jit_serving_player_path'), throws: true }, true, 'jit_serving_player_path'],
  ['DENY  sin stdout / gate roto           -> BLOQUEA (fail-closed)', { throws: true, stdout: '' }, false, 'gate_unavailable'],
  ['gate NO instalado                      -> permite + gate_absent', { libPresent: false }, true, 'gate_absent'],
];
console.log('\n== tabla de decision (ejecutando el codigo del motor) ==');
for (const [name, behaviour, wantAllow, wantReason] of cases) {
  const { api } = buildSandbox(behaviour);
  const r = api.providerGateAdmit('jit');
  const good = r.allow === wantAllow && r.reason === wantReason;
  ok(name, good, 'allow=' + r.allow + ' reason=' + r.reason);
}

/* ── 3. Cableado: la puerta va entre slotAcquire() y spawn() ─────────────── */
console.log('\n== cableado en start() ==');
const iSlot = SRC.indexOf('const slotOk = await slotAcquire();');
const iGate = SRC.indexOf("providerGateAdmit('jit')", iSlot);
const iSpawn = SRC.indexOf('const child = spawn(', iSlot);
ok('la admision se consulta DESPUES de slotAcquire()', iSlot > 0 && iGate > iSlot);
ok('la admision se consulta ANTES de spawn() (no se abre la conexion)', iGate > 0 && iSpawn > iGate && iGate < iSpawn);
ok('el DENY registra PROVIDER_SLOT_BUSY (el player recibe el motivo)',
  /PROVIDER_SLOT_BUSY/.test(SRC.slice(iGate, iSpawn)));
ok('PROVIDER_SLOT_BUSY sobrevive al filtro safeStartFailure',
  /'PROVIDER_SLOT_BUSY'\]\.includes\(code\)/.test(SRC));
ok('/health expone provider_gate (el arreglo es observable)', /provider_gate: gateStats/.test(SRC));

/* ── 4. La linea de bash real, contra un gate falso ──────────────────────── */
console.log('\n== invocacion real de bash contra un gate falso ==');
const BASH = process.env.BASH_BIN || (process.platform === 'win32'
  ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash');
let bashOk = true, bashDetail = '';
try {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-admit-'));
  const fake = path.join(tmp, 'fake-gate.sh');
  fs.writeFileSync(fake, [
    '#!/usr/bin/env bash',
    'provider_gate_decide() {',
    '  printf "%s\\n" "PROVIDER_GATE decision=DENY claimant=jit level=2 reason=player_active player_age_s=3 player_signal=zap player_window_s=45 canary_live=\\"\\" jit_pids=\\"\\" selftest=ok ts=2026-11-14T00:00:00Z"',
    '  return 1',
    '}',
  ].join('\n'), 'utf8');
  const out = execFileSync(BASH, ['-c', '. "$1" >/dev/null 2>&1; provider_gate_decide "$2"', '--', fake, 'jit'],
    { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const m = out.match(/decision=(\w+)\s+claimant=\S+\s+level=\S+\s+reason=(\S+)/);
  bashOk = !!m && m[2] === 'player_active';
  bashDetail = m ? m[2] : out.slice(0, 80);
} catch (e) {
  /* exit 1 del gate falso es lo esperado: se valida por el mensaje, no por el 0. */
  const out = String((e && e.stdout) || '').trim();
  const m = out.match(/decision=(\w+)\s+claimant=\S+\s+level=\S+\s+reason=(\S+)/);
  bashOk = !!m && m[1] === 'DENY' && m[2] === 'player_active';
  bashDetail = m ? (m[1] + '/' + m[2]) : String(e.message || e).slice(0, 80);
}
ok('la linea de bash produce decision=DENY reason=player_active', bashOk, bashDetail);

console.log('\n' + (fails ? 'FALLOS: ' + fails : 'OK: todos los controles en verde'));
process.exit(fails ? 1 : 0);
