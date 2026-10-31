#!/usr/bin/env node
'use strict';
/**
 * run_decision_vectors.js — runner del núcleo de decisión ARA-X (I1 / t13).
 *
 * Qué hace: carga `ara-x/spec/decision_test_vectors.json`, ejecuta el núcleo
 * (`ara-x/controller/ara_x_decision_core.js`) sobre los 26 vectores y sobre un
 * barrido determinista de estados sintéticos, y verifica:
 *   - expectativas de los vectores + paridad con la referencia D5
 *   - invariantes de política (sin resolución, fail-closed, rangos del schema)
 *   - contrato del blend (≥0, suma 1, ids P0-P5)
 *   - anti-flap: ningún cambio de blend dentro del dwell
 *
 * NO es el núcleo: el núcleo no hace I/O. Este script sí lee el JSON (es su trabajo).
 *
 * USO:
 *   node ara-x/scripts/controller/run_decision_vectors.js
 *   node ara-x/scripts/controller/run_decision_vectors.js --sweep 500
 *   node ara-x/scripts/controller/run_decision_vectors.js --vector V07
 *   node ara-x/scripts/controller/run_decision_vectors.js --json   (salida máquina)
 *
 * Salida: resumen humano; exit 0 si todo pasa, 1 si algo falla, 2 si faltan archivos.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..', '..');
const CORE_PATH = path.resolve(ROOT, 'ara-x', 'controller', 'ara_x_decision_core.js');
const VEC_PATH = path.resolve(ROOT, 'ara-x', 'spec', 'decision_test_vectors.json');
const D5_PATH = path.resolve(ROOT, 'ara-x', 'scripts', 'd5_check_decision.js');

const KEYS = [
  'arm', 'u_degrade', 'fps_cap', 'fps_applied', 'post_step', 'buffer_s', 'abr_bw_factor',
  'reconnect_attempts', 'live_delay_s', 'max_bitrate_bps', 'min_bitrate_bps', 'hdr_hint',
  'sync_next_s', 'promote_lock_ms', 'degrade_mask', 'flags', 'soc', 'allowed',
];

const r4 = (x) => (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 10000) / 10000 : x);
const norm = (v) => {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = norm(v[k]);
    return o;
  }
  return r4(v);
};
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

function sweep(n) {
  const next = (() => {
    // xorshift128+ sembrado con FNV-1a (mismo criterio que el núcleo)
    let h = 0xcbf29ce484222325n;
    const s = 'i1-runner-sweep';
    const M = (1n << 64n) - 1n;
    for (let i = 0; i < s.length; i++) {
      h = (h ^ BigInt(s.charCodeAt(i))) & M;
      h = (h * 0x100000001b3n) & M;
    }
    let s0 = h;
    let s1 = 0x9e3779b97f4a7c15n;
    return () => {
      let x = s0;
      const y = s1;
      s0 = y;
      x ^= (x << 23n) & M;
      s1 = (x ^ y ^ (x >> 17n) ^ (y >> 26n)) & M;
      return Number(((s1 + y) & M) >> 11n) / 9007199254740992;
    };
  })();
  const pick = (a) => a[Math.floor(next() * a.length) % a.length];
  const out = [];
  for (let i = 0; i < n; i++) {
    const calm = next() < 0.5;
    out.push({
      obs: {
        soc: pick(['amlogic_s905x4', 's905x4', 'mt8696', 'rtk_rtd1319', '', 'S905X4']),
        thermal_status: calm ? pick([0, 0, 1, undefined]) : pick([undefined, 0, 1, 2, 3, 4, 5, 6]),
        cpu_temp_c: calm ? pick([undefined, 55]) : pick([undefined, 72, 88]),
        frame_drop_ratio: calm ? pick([undefined, 0, 0.002]) : pick([undefined, 0, 0.02, 0.04, 0.08]),
        rebuffer_ratio: calm ? pick([undefined, 0]) : pick([undefined, 0.01, 0.03, 0.1]),
        stall: calm ? false : pick([false, false, true]),
        x_net: calm ? 0 : pick([0, 0.2, 0.5, 0.8, 1]),
        vst_ms: calm ? 900 : pick([900, 4000, 9000]),
        bitrate_bps: pick([undefined, 25000000, 3000000, 9000000]),
        resolution_class: calm ? '4k' : pick(['4k', '4k', '1080p', '720p', 'unknown']),
        ram_available_pct: pick([undefined, 8, 40, 90]),
        fps_declared: pick([25, 30, 50, 60]),
      },
      caps: { fps_lever: pick([true, false]), vpp_levers: pick([true, true, false]) },
      state: {
        arm: pick(['A0', 'A1', 'A2', 'A3', 'A4']),
        now_ms: pick([0, 5000, 30000, 120000]),
        arm_since_ms: pick([0, 10000, 100000]),
        changes_30s: pick([0, 0, 1, 2]),
        cold: pick([false, false, true]),
      },
      posteriors: {
        A0: [pick([1, 5, 400]), pick([1, 5, 400])], A1: [5, 5], A2: [5, 5], A3: [5, 5], A4: [5, 5],
      },
    });
  }
  return out;
}

function checkPolicy(d, leverAllowlist) {
  const errs = [];
  for (const k of Object.keys(d)) if (/resolution|width|height/i.test(k)) errs.push('clave_resolucion:' + k);
  for (const lk of Object.keys(d.levers || {})) {
    if (/resolution|width|height/i.test(lk)) errs.push('lever_resolucion:' + lk);
    if (leverAllowlist && leverAllowlist.indexOf(lk) === -1) errs.push('lever_fuera_allowlist:' + lk);
  }
  if (d.allowed === false && Object.keys(d.levers || {}).length) errs.push('fail_closed_violado');
  if (!(d.buffer_s >= 5 && d.buffer_s <= 120)) errs.push('buffer:' + d.buffer_s);
  if (!(d.abr_bw_factor >= 0.5 && d.abr_bw_factor <= 0.98)) errs.push('abr:' + d.abr_bw_factor);
  if (!(d.min_bitrate_bps >= 1000000 && d.min_bitrate_bps <= d.max_bitrate_bps && d.max_bitrate_bps <= 80000000)) errs.push('bitrate');
  if (!(d.degrade_mask >= 0 && d.degrade_mask <= 65535)) errs.push('mask:' + d.degrade_mask);
  return errs;
}

function main() {
  const argv = process.argv.slice(2);
  const jsonOut = argv.includes('--json');
  const onlyIdx = argv.indexOf('--vector');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
  const sweepIdx = argv.indexOf('--sweep');
  const nSweep = sweepIdx >= 0 ? Math.max(0, parseInt(argv[sweepIdx + 1], 10) || 0) : 200;

  for (const p of [CORE_PATH, VEC_PATH]) {
    if (!fs.existsSync(p)) {
      console.error('FALTA ' + path.relative(ROOT, p));
      return 2;
    }
  }
  const core = require(CORE_PATH);
  const doc = JSON.parse(fs.readFileSync(VEC_PATH, 'utf8'));
  let d5 = null;
  try { d5 = require(D5_PATH); } catch (e) { d5 = null; }

  const failures = [];
  const LEVERS = Object.keys(core.K.base_levers).sort();
  // 0 · digest de constantes
  const digest = 'sha256:' + crypto.createHash('sha256').update(core.canonicalConstants(), 'utf8').digest('hex');
  if (digest !== doc.constants_digest) failures.push('DIGEST_MISMATCH núcleo=' + digest + ' vectores=' + doc.constants_digest);
  if (d5 && d5.DIGEST !== digest) failures.push('DIGEST_MISMATCH referencia D5=' + d5.DIGEST);

  // 1 · vectores
  let done = 0;
  for (const v of doc.vectors) {
    if (only && v.id !== only) continue;
    done++;
    if (v.kind === 'fuse') {
      const got = core.fuse(v.samples.map((s) => ({ dt_ms: s.dt_ms, bytes: s.bytes, ttfb_ms: s.ttfb_ms })), v.floor_bps);
      for (const k of Object.keys(v.expect)) if (!same(got[k], v.expect[k])) failures.push(v.id + '.' + k + ' esperado ' + JSON.stringify(v.expect[k]) + ' obtenido ' + JSON.stringify(got[k]));
      continue;
    }
    if (v.kind === 'reward') {
      const got = core.reward(v.obs, v.applied);
      if (!same(got, v.expect.reward)) failures.push(v.id + '.reward esperado ' + v.expect.reward + ' obtenido ' + got);
      if (v.expect.posterior) {
        const p = core.updatePosterior(v.posterior_in, got);
        if (!same(p, [v.expect.posterior.a, v.expect.posterior.b])) failures.push(v.id + '.posterior');
      }
      continue;
    }
    const got = core.decideFromVector(v);
    for (const k of KEYS) if (!same(got[k], v.expect[k])) failures.push(v.id + '.' + k + ' esperado ' + JSON.stringify(v.expect[k]) + ' obtenido ' + JSON.stringify(got[k]));
    if (v.expect.levers && !same(got.levers, v.expect.levers)) failures.push(v.id + '.levers');
    if (d5) {
      const ref = d5.decide(v);
      for (const k of KEYS) if (!same(got[k], ref[k])) failures.push(v.id + '.parity.' + k);
    }
    failures.push(...checkPolicy(got, LEVERS).map((e) => v.id + '.' + e));
  }

  // 2 · barrido de invariantes + anti-flap de blend
  const states = sweep(nSweep);
  for (let i = 0; i < states.length; i++) {
    const d = core.decide(states[i]);
    failures.push(...checkPolicy(d, LEVERS).map((e) => 'sweep#' + i + '.' + e));
    const errs = core.validateBlend(d.blend);
    for (const e of errs) failures.push('sweep#' + i + '.blend.' + e);
    // sin cambio de blend dentro del dwell
    const gate = core.applyBlendGate(
      { P0: 0, P1: 0, P2: 1, P3: 0, P4: 0, P5: 0 },
      d.blend,
      { now_ms: 5000, blend_since_ms: 0 }
    );
    if (gate.held !== (JSON.stringify(d.blend) !== JSON.stringify({ P0: 0, P1: 0, P2: 1, P3: 0, P4: 0, P5: 0 }))) {
      failures.push('sweep#' + i + '.antiflap_blend');
    }
  }

  const total = doc.vectors.length;
  if (jsonOut) {
    console.log(JSON.stringify({ spec: core.SPEC, digest, vectors_checked: done, vectors_total: total, sweep: states.length, failures }, null, 2));
  } else {
    for (const f of failures.slice(0, 40)) console.log('FAIL ' + f);
    console.log(
      '\nI1 decision core: ' + done + '/' + total + ' vectores · ' +
      states.length + ' estados de barrido · ' + failures.length + ' fallo(s) · ' +
      'digest=' + digest.slice(0, 22) + '…'
    );
  }
  return failures.length === 0 ? 0 : 1;
}

if (require.main === module) process.exit(main());
module.exports = { main, sweep };
