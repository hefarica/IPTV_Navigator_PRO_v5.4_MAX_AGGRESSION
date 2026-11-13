#!/usr/bin/env node
'use strict';
/**
 * tools/quality/test_rea_loop.js — prueba FAIL-CLOSED del bucle REA §13.
 *
 * Monta arboles de gates FALSOS en os.tmpdir (nunca toca el repo) y comprueba que
 * tools/canary/rea_loop.js:
 *   C1  sobre el repo REAL devuelve exit 0 y deja un estado sano
 *   C2  con un gate que falla siempre se DETIENE, registra el bloqueo con la salida
 *       literal y devuelve exit != 0, conservando el last_healthy anterior
 *   C3  con --cycles por encima de MAX_REMEDIATION_CYCLES devuelve exit 2 sin ejecutar gates
 *   C4  con consecutive_deploy_failures >= MAX_CONSECUTIVE_DEPLOY_FAILURES devuelve exit 2
 *   C5  con un gate AUSENTE devuelve exit != 0 y lo nombra (E_GATE_MISSING)
 *   C6  dos corridas seguidas acumulan historia en el mismo estado
 *
 * Sin dependencias, sin red. Escribe solo en os.tmpdir().
 * Exit: 0 solo si TODOS los casos se comportan como se declara.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LOOP = path.join(ROOT, 'tools', 'canary', 'rea_loop.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rea-loop-test-'));
const BROKEN_MARKER = 'BOOM_GATE_ROTO_INYECTADO';

const GATE_SCRIPTS = [
  'tools/check_anti_degradation_policy.js',
  'tools/check_crystal_4k_law.js',
  'tools/check_crystal_6k_law.js',
  'tools/quality/test_canary_jit_contract.js',
  'tools/quality/test_schemas.js',
  'tools/quality/test_playlist_adapter.js'
];

/** Arbol falso: todos los gates salen 0 salvo el que se rompe o se omite. */
function makeFakeTree(tag, opts) {
  const dir = path.join(TMP, 'tree-' + tag);
  const brokenScript = opts && opts.broken ? GATE_SCRIPTS[opts.broken.index] : null;
  const missingScript = opts && opts.missing ? GATE_SCRIPTS[opts.missing.index] : null;
  for (const rel of GATE_SCRIPTS) {
    if (rel === missingScript) continue;
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const body = rel === brokenScript
      ? "'use strict';\nconsole.error('" + BROKEN_MARKER + "');\nconsole.log('gate falso que falla siempre');\nprocess.exit(1);\n"
      : "'use strict';\nconsole.log('gate falso OK: " + path.basename(rel) + "');\nprocess.exit(0);\n";
    fs.writeFileSync(abs, body);
  }
  return dir;
}

function runLoop(args, env) {
  const r = spawnSync(process.execPath, [LOOP].concat(args), {
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 16 * 1024 * 1024,
    env: Object.assign({}, process.env, env || {})
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const statePath = (tag) => path.join(TMP, 'state-' + tag + '.json');

const cases = [];
const check = (id, name, fn) => cases.push({ id, name, fn });
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/* C1 · repo real -> exit 0 y estado sano */
check('C1', 'repo real: exit 0 y estado HEALTHY con 6 gates', () => {
  const st = statePath('c1');
  const r = runLoop(['--state', st, '--json']);
  assert(r.code === 0, 'exit esperado 0, obtenido ' + r.code + '\n' + r.out.slice(-800));
  const doc = readJson(st);
  const run = doc.runs[doc.runs.length - 1];
  assert(run.result === 'HEALTHY', 'result esperado HEALTHY, obtenido ' + run.result);
  assert(run.gates.length === 6, 'gates esperados 6, obtenidos ' + run.gates.length);
  assert(run.gates.every((g) => g.attempts >= 1 && typeof g.exit_code === 'number' && typeof g.duration_ms === 'number'),
    'cada gate debe registrar attempts/exit_code/duration_ms');
  assert(run.gates[0].result === 'KNOWN_PREEXISTING', 'G1 debe ser KNOWN_PREEXISTING, es ' + run.gates[0].result);
  assert(run.gates[0].attempts === 3, 'G1 debe agotar 3 intentos, tiene ' + run.gates[0].attempts);
  assert(doc.last_healthy && doc.last_healthy.run_id === run.run_id, 'last_healthy debe apuntar a esta corrida');
  return 'exit=0 · 6 gates · G1 KNOWN_PREEXISTING(attempts=3) · last_healthy=' + doc.last_healthy.run_id;
});

/* C2 · gate roto inyectado -> se detiene, bloqueo literal, exit != 0, last_healthy intacto */
check('C2', 'gate roto inyectado: se detiene con bloqueo literal y exit != 0', () => {
  const st = statePath('c2');
  fs.mkdirSync(path.dirname(st), { recursive: true });
  fs.writeFileSync(st, JSON.stringify({
    schema: 'ape.canary.rea_loop.state.v1',
    last_healthy: { run_id: 'SEED_HEALTHY', finished_at_utc: '2026-11-11T00:00:00Z', gates: [] },
    consecutive_deploy_failures: 0, runs: []
  }, null, 2));
  const tree = makeFakeTree('c2', { broken: { index: 2 } }); /* G3 roto */
  const r = runLoop(['--root', tree, '--state', st, '--json']);
  assert(r.code !== 0, 'exit debe ser != 0, obtenido ' + r.code);
  assert(r.code === 1, 'exit esperado 1 (gate FAIL), obtenido ' + r.code + '\n' + r.out.slice(-500));
  const doc = readJson(st);
  const run = doc.runs[doc.runs.length - 1];
  assert(run.block && run.block.gate_id === 'G3', 'el bloqueo debe nombrar G3, es ' + JSON.stringify(run.block && run.block.gate_id));
  assert(run.block.attempts === 3, 'debe reintentar 3 veces antes de bloquear, intentos=' + run.block.attempts);
  assert(run.block.literal_output.includes(BROKEN_MARKER), 'el bloqueo debe conservar la salida literal del gate');
  assert(run.gates.length === 3, 'debe detenerse en G3 sin ejecutar G4-G6, gates ejecutados=' + run.gates.length);
  assert(doc.last_healthy.run_id === 'SEED_HEALTHY', 'last_healthy NO debe sobrescribirse con una corrida fallida');
  return 'exit=1 · block=G3 attempts=3 · salida literal conservada · last_healthy sigue en SEED_HEALTHY';
});

/* C3 · limite de ciclos */
check('C3', 'MAX_REMEDIATION_CYCLES: 13 ciclos -> exit 2 sin ejecutar gates', () => {
  const st = statePath('c3');
  const r = runLoop(['--root', makeFakeTree('c3', {}), '--state', st, '--json', '--cycles', '13']);
  assert(r.code === 2, 'exit esperado 2, obtenido ' + r.code);
  const doc = readJson(st);
  const run = doc.runs[doc.runs.length - 1];
  assert(run.block && run.block.reason === 'E_CYCLE_LIMIT', 'reason esperado E_CYCLE_LIMIT, es ' + JSON.stringify(run.block));
  assert(run.gates.length === 0, 'no debe ejecutar gates antes de aplicar el limite, ejecutados=' + run.gates.length);
  return 'exit=2 · E_CYCLE_LIMIT (13 > ' + doc.limits.MAX_REMEDIATION_CYCLES + ') · 0 gates ejecutados';
});

/* C4 · limite de fallos de deploy consecutivos (lo alimenta otro proceso) */
check('C4', 'MAX_CONSECUTIVE_DEPLOY_FAILURES: 2 previos -> exit 2 sin ejecutar gates', () => {
  const st = statePath('c4');
  fs.mkdirSync(path.dirname(st), { recursive: true });
  fs.writeFileSync(st, JSON.stringify({
    schema: 'ape.canary.rea_loop.state.v1', last_healthy: null, consecutive_deploy_failures: 2, runs: []
  }, null, 2));
  const r = runLoop(['--root', makeFakeTree('c4', {}), '--state', st, '--json']);
  assert(r.code === 2, 'exit esperado 2, obtenido ' + r.code);
  const doc = readJson(st);
  const run = doc.runs[doc.runs.length - 1];
  assert(run.block && run.block.reason === 'E_DEPLOY_FAILURE_LIMIT', 'reason esperado E_DEPLOY_FAILURE_LIMIT, es ' + JSON.stringify(run.block));
  assert(run.gates.length === 0, 'no debe ejecutar gates, ejecutados=' + run.gates.length);
  return 'exit=2 · E_DEPLOY_FAILURE_LIMIT (2 >= 2) · 0 gates ejecutados';
});

/* C5 · gate ausente -> fail-closed */
check('C5', 'gate ausente: exit != 0 y E_GATE_MISSING sin reintentos', () => {
  const st = statePath('c5');
  const r = runLoop(['--root', makeFakeTree('c5', { missing: { index: 1 } }), '--state', st, '--json']);
  assert(r.code === 1, 'exit esperado 1, obtenido ' + r.code);
  const doc = readJson(st);
  const run = doc.runs[doc.runs.length - 1];
  assert(run.block && run.block.reason === 'E_GATE_MISSING', 'reason esperado E_GATE_MISSING, es ' + JSON.stringify(run.block && run.block.reason));
  assert(run.block.gate_id === 'G2', 'debe nombrar G2, es ' + (run.block && run.block.gate_id));
  assert(run.block.attempts === 1, 'un fichero ausente no se reintenta, attempts=' + run.block.attempts);
  return 'exit=1 · E_GATE_MISSING en G2 · attempts=1 (no se reintenta lo que no existe)';
});

/* C6 · historia acumulada en el mismo fichero de estado */
check('C6', 'estado compatible entre corridas: historia acumulada y last_healthy actualizado', () => {
  const st = statePath('c6');
  const r1 = runLoop(['--state', st, '--json']);
  assert(r1.code === 0, 'primera corrida debe salir 0, salio ' + r1.code);
  const first = readJson(st);
  const r2 = runLoop(['--state', st, '--json']);
  assert(r2.code === 0, 'segunda corrida debe salir 0, salio ' + r2.code);
  const doc = readJson(st);
  assert(doc.runs.length === 2, 'debe haber 2 corridas en el estado, hay ' + doc.runs.length);
  assert(doc.history.total_runs === 2, 'history.total_runs debe ser 2, es ' + doc.history.total_runs);
  assert(doc.last_healthy.run_id !== first.last_healthy.run_id, 'last_healthy debe actualizarse con la corrida nueva');
  assert(doc.previous_state_schema === 'ape.canary.rea_loop.state.v1', 'debe releer el estado previo, previous_state_schema=' + doc.previous_state_schema);
  return '2 corridas acumuladas · history.total_runs=2 · last_healthy actualizado · estado previo releido';
});

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */
function main() {
  console.log('== PRUEBA FAIL-CLOSED DEL BUCLE REA §13 (tools/canary/rea_loop.js) ==');
  console.log('tmp: ' + TMP);
  console.log('');
  let pass = 0;
  let fail = 0;
  try {
    for (const c of cases) {
      try {
        const detail = c.fn();
        pass++;
        console.log('  PASS  ' + c.id + '  ' + c.name);
        console.log('        ' + detail);
      } catch (e) {
        fail++;
        console.log('  FAIL  ' + c.id + '  ' + c.name);
        console.log('        ' + String(e && e.message ? e.message : e).split('\n').join('\n        '));
      }
    }
  } finally {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* tmpdir best effort */ }
  }
  console.log('');
  console.log('-- resumen --');
  console.log('  casos: ' + cases.length + ' | PASS ' + pass + ' | FAIL ' + fail);
  console.log('  RESULT=' + (fail === 0 ? 'PASS' : 'FAIL'));
  process.exit(fail === 0 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { makeFakeTree, runLoop, BROKEN_MARKER, GATE_SCRIPTS };
