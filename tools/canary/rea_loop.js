#!/usr/bin/env node
'use strict';
/**
 * tools/canary/rea_loop.js — bucle REA §13: ciclo repetible, estado persistente y
 * limites de orquestacion (no metricas).
 *
 * QUE HACE: ejecuta, EN ORDEN FIJO, los gates que ya existen en el repo. Reintenta
 * cada gate hasta MAX_RETRIES_PER_GATE, clasifica el resultado (PASS / FAIL /
 * KNOWN_PREEXISTING) y escribe el estado en docs/canary/state/rea_loop_state.json.
 * Se detiene en el primer FAIL tras agotar reintentos, conservando el ultimo estado
 * sano. No deja ningun proceso corriendo: termina.
 *
 * QUE NO HACE, y no puede: desplegar, contactar el VPS, usar red. Solo requires
 * fs / path / child_process, y el unico comando que lanza son los gates declarados.
 *
 * CODIGOS DE SALIDA
 *   0  todos los gates ejecutados PASS, o KNOWN_PREEXISTING declarado
 *   1  algun gate FAIL tras agotar reintentos
 *   2  limite de orquestacion alcanzado (ciclos, o fallos de deploy consecutivos)
 *
 * USO
 *   node tools/canary/rea_loop.js                    # corrida normal sobre el repo
 *   node tools/canary/rea_loop.js --json             # imprime el estado JSON
 *   node tools/canary/rea_loop.js --root <dir> --state <file>   # copia / pruebas
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LIMITS = {
  MAX_REMEDIATION_CYCLES: 12,
  MAX_RETRIES_PER_GATE: 3,
  MAX_CONSECUTIVE_DEPLOY_FAILURES: 2
};

const STATE_SCHEMA = 'ape.canary.rea_loop.state.v1';

/* Orden FIJO. No se descubre ni se ordena por nombre: es una lista literal. */
const GATES = [
  { id: 'G1', name: 'anti_degradation_policy', script: 'tools/check_anti_degradation_policy.js', timeout_ms: 120000 },
  { id: 'G2', name: 'crystal_4k_law', script: 'tools/check_crystal_4k_law.js', timeout_ms: 120000 },
  { id: 'G3', name: 'crystal_6k_law', script: 'tools/check_crystal_6k_law.js', timeout_ms: 120000 },
  { id: 'G4', name: 'canary_jit_contract', script: 'tools/quality/test_canary_jit_contract.js', timeout_ms: 180000 },
  { id: 'G5', name: 'schemas', script: 'tools/quality/test_schemas.js', timeout_ms: 180000 },
  { id: 'G6', name: 'playlist_adapter', script: 'tools/quality/test_playlist_adapter.js', timeout_ms: 180000 }
];

/* Condiciones de fallo DECLARADAS DE ANTEMANO. Un gate que falla con esta firma
 * exacta se clasifica KNOWN_PREEXISTING: no detiene el bucle, se reporta con su
 * razon y NO cuenta como PASS. Si la firma no casa, es FAIL y detiene. */
const KNOWN_PREEXISTING = [
  {
    gate_id: 'G1',
    id: 'KP1',
    reason: 'Falso positivo preexistente: el gate marca IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js (el motor B, que no despliega) y no tools/lab/ape-jit/server.js. Declarado por el capitan en el encargo; NO se arregla aqui.',
    exit_code: 1,
    must_include: ['[DEGRADA] IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js', 'TOTAL=8 PASS=7 FAIL=1'],
    must_not_include: []
  }
];

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const hasFlag = (name) => process.argv.includes(name);

const ROOT = path.resolve(argOf('--root', path.resolve(__dirname, '..', '..')));
const STATE_FILE = path.resolve(argOf('--state', path.join(ROOT, 'docs', 'canary', 'state', 'rea_loop_state.json')));
const CYCLES_REQUESTED = Number(argOf('--cycles', '1'));
const QUIET = hasFlag('--quiet');

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const excerpt = (s, n) => (s.length <= n ? s : '…[recortado ' + (s.length - n) + ' chars]…\n' + s.slice(-n));

function readState() {
  try {
    const doc = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (doc && doc.schema === STATE_SCHEMA) return doc;
    return { prev_schema_unknown: doc && doc.schema ? doc.schema : null };
  } catch (e) {
    return null; /* sin estado previo: primera corrida */
  }
}

function writeState(doc) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(doc, null, 2) + '\n');
}

/* Ejecuta un gate UNA vez. Devuelve exit code, duracion y salida combinada. */
function runOnce(gate) {
  const t0 = Date.now();
  const abs = path.join(ROOT, gate.script);
  if (!fs.existsSync(abs)) {
    return { exit_code: 127, duration_ms: Date.now() - t0, output: 'E_GATE_MISSING: ' + abs, missing: true };
  }
  const r = spawnSync(process.execPath, [abs], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: gate.timeout_ms,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  return {
    exit_code: timedOut ? 124 : (r.status === null ? 125 : r.status),
    duration_ms: Date.now() - t0,
    output: out,
    timed_out: !!timedOut,
    missing: false
  };
}

/* Clasifica un fallo: KNOWN_PREEXISTING si casa la firma declarada, si no FAIL. */
function classifyFailure(gate, last) {
  for (const kp of KNOWN_PREEXISTING) {
    if (kp.gate_id !== gate.id) continue;
    if (last.exit_code !== kp.exit_code) continue;
    const inc = (kp.must_include || []).every((s) => last.output.includes(s));
    const exc = (kp.must_not_include || []).some((s) => last.output.includes(s));
    if (inc && !exc) return { result: 'KNOWN_PREEXISTING', known: kp };
  }
  return { result: 'FAIL', known: null };
}

/* Un ciclo = una pasada completa por la lista fija de gates. */
function runCycle() {
  const gates = [];
  let block = null;
  for (const gate of GATES) {
    const log = [];
    let last = null;
    let result = null;
    let known = null;
    for (let attempt = 1; attempt <= LIMITS.MAX_RETRIES_PER_GATE; attempt++) {
      last = runOnce(gate);
      log.push({ attempt, exit_code: last.exit_code, duration_ms: last.duration_ms, timed_out: !!last.timed_out });
      if (last.exit_code === 0) { result = 'PASS'; break; }
      if (last.missing) break; /* no se reintenta un fichero que no existe */
    }
    if (result === null) {
      const c = classifyFailure(gate, last);
      result = c.result;
      known = c.known;
    }
    const observations = [];
    /* Solo se marca cuando el marcador NO_COMPUTADO va seguido de un valor distinto
       de 0 (o no lleva valor reconocible). Los contadores benignos del gate de
       esquemas — "NO_COMPUTADO-skip 0" y "NO_COMPUTADO por fixture ausente: 0" — NO
       se marcan: son recuentos a cero, no degradaciones. Un exceso de marca es
       preferible a una marca que falta, pero aqui el dato es 0 y se comprueba. */
    const ncMarkers = [...last.output.matchAll(/NO_COMPUTADO(?:[^0-9\n]{0,40}(\d+))?/g)];
    if (ncMarkers.some((m) => m[1] === undefined || Number(m[1]) > 0)) {
      observations.push('la salida declara NO_COMPUTADO sin valor 0: exit 0 no equivale a verificado');
    }
    if (last.timed_out) observations.push('timeout del gate (' + gate.timeout_ms + ' ms)');
    gates.push({
      id: gate.id,
      name: gate.name,
      command: 'node ' + gate.script,
      attempts: log.length,
      attempt_log: log,
      exit_code: last.exit_code,
      duration_ms: log.reduce((a, b) => a + b.duration_ms, 0),
      result,
      known_preexisting: known ? { id: known.id, reason: known.reason } : null,
      observations,
      output_excerpt: excerpt(last.output, result === 'PASS' ? 400 : 8000)
    });
    if (result === 'FAIL') {
      block = {
        gate_id: gate.id,
        gate: gate.name,
        command: 'node ' + gate.script,
        attempts: log.length,
        exit_code: last.exit_code,
        reason: last.missing ? 'E_GATE_MISSING' : (last.timed_out ? 'E_TIMEOUT' : 'E_GATE_FAILED'),
        literal_output: excerpt(last.output, 8000),
        at_utc: nowIso()
      };
      break; /* se detiene: los gates posteriores NO se ejecutan */
    }
  }
  return { gates, block };
}

function summarise(prevRuns, doc) {
  const h = { total_runs: prevRuns.length, healthy_runs: 0, blocked_runs: 0, failed_runs: 0 };
  for (const r of prevRuns) {
    if (r.result === 'HEALTHY') h.healthy_runs++;
    else if (r.result === 'BLOCKED') h.blocked_runs++;
    else h.failed_runs++;
  }
  return h;
}

function main() {
  const prev = readState() || {};
  const prevRuns = Array.isArray(prev.runs) ? prev.runs.slice() : [];
  const consecutive = Number(prev.consecutive_deploy_failures || 0);
  const runId = 'run-' + Date.now();
  const startedAt = nowIso();
  const state = {
    schema: STATE_SCHEMA,
    updated_at_utc: startedAt,
    root: ROOT,
    limits: LIMITS,
    consecutive_deploy_failures: consecutive,
    previous_state_schema: prev.schema || null,
    last_healthy: prev.last_healthy || null,
    history: { total_runs: prevRuns.length, healthy_runs: 0, blocked_runs: 0, failed_runs: 0 },
    runs: prevRuns
  };

  const finish = (exitCode, result, extra, gates) => {
    const run = Object.assign({
      run_id: runId,
      started_at_utc: startedAt,
      finished_at_utc: nowIso(),
      cycles_requested: CYCLES_REQUESTED,
      cycles_used: gates && gates.length ? 1 : 0,
      result,
      exit_code: exitCode,
      gates: gates || []
    }, extra || {});
    if (result === 'HEALTHY') {
      state.last_healthy = { run_id: runId, finished_at_utc: run.finished_at_utc, gates: (gates || []).map((g) => ({ id: g.id, name: g.name, result: g.result, attempts: g.attempts })) };
    } else {
      run.last_healthy_kept = state.last_healthy ? state.last_healthy.run_id : null;
    }
    state.runs = prevRuns.concat([run]).slice(-20);
    state.runs_retained = 20;
    state.history = summarise(state.runs, state);
    state.updated_at_utc = nowIso();
    writeState(state);
    if (hasFlag('--json')) {
      process.stdout.write(JSON.stringify({ run, last_healthy: state.last_healthy, history: state.history, limits: LIMITS, state_file: STATE_FILE }, null, 2) + '\n');
    } else if (!QUIET) {
      printReport(run, state);
    }
    process.exit(exitCode);
  };

  /* Límites de orquestacion: se comprueban ANTES de ejecutar nada. */
  if (!Number.isFinite(CYCLES_REQUESTED) || CYCLES_REQUESTED < 1) {
    return finish(2, 'BLOCKED', { block: { reason: 'E_CYCLE_LIMIT_INVALID', requested: String(CYCLES_REQUESTED), at_utc: nowIso() } });
  }
  if (CYCLES_REQUESTED > LIMITS.MAX_REMEDIATION_CYCLES) {
    return finish(2, 'BLOCKED', { block: { reason: 'E_CYCLE_LIMIT', requested: CYCLES_REQUESTED, max: LIMITS.MAX_REMEDIATION_CYCLES, at_utc: nowIso() } });
  }
  if (consecutive >= LIMITS.MAX_CONSECUTIVE_DEPLOY_FAILURES) {
    return finish(2, 'BLOCKED', { block: { reason: 'E_DEPLOY_FAILURE_LIMIT', consecutive_deploy_failures: consecutive, max: LIMITS.MAX_CONSECUTIVE_DEPLOY_FAILURES, at_utc: nowIso() } });
  }

  const cycle = runCycle();
  if (cycle.block) return finish(1, 'BLOCKED', { block: cycle.block }, cycle.gates);
  return finish(0, 'HEALTHY', {}, cycle.gates);
}

function printReport(run, state) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log('== REA LOOP §13 · ' + ROOT + ' ==');
  console.log('limites: MAX_REMEDIATION_CYCLES=' + state.limits.MAX_REMEDIATION_CYCLES +
    ' · MAX_RETRIES_PER_GATE=' + state.limits.MAX_RETRIES_PER_GATE +
    ' · MAX_CONSECUTIVE_DEPLOY_FAILURES=' + state.limits.MAX_CONSECUTIVE_DEPLOY_FAILURES);
  console.log('-- gates (orden fijo) --');
  for (const g of run.gates) {
    const extra = g.known_preexisting ? ' [' + g.known_preexisting.id + ']' : '';
    console.log('  ' + pad(g.id, 3) + pad(g.result, 20) + pad('attempts=' + g.attempts, 13) +
      pad('exit=' + g.exit_code, 9) + g.duration_ms + 'ms  ' + g.name + extra);
    if (g.observations.length) console.log('        obs: ' + g.observations.join(' | '));
  }
  if (run.block) {
    console.log('-- bloqueo --');
    console.log('  gate=' + (run.block.gate || '(limite de orquestacion)') + ' reason=' + run.block.reason +
      (run.block.attempts ? ' attempts=' + run.block.attempts : ''));
    if (run.block.literal_output) console.log('  salida literal:\n' + run.block.literal_output.split('\n').map((l) => '    ' + l).join('\n'));
  }
  console.log('-- resultado --');
  console.log('  run=' + run.run_id + ' exit=' + run.exit_code + ' result=' + run.result);
  console.log('  ultimo estado sano: ' + (state.last_healthy
    ? state.last_healthy.run_id + ' (' + state.last_healthy.finished_at_utc + ', ' + state.last_healthy.gates.length + ' gates)'
    : 'NINGUNO — no hay todavia una corrida completa verde'));
  console.log('  estado: ' + STATE_FILE);
}

if (require.main === module) main();

module.exports = { LIMITS, GATES, KNOWN_PREEXISTING, STATE_SCHEMA, runCycle, readState };

