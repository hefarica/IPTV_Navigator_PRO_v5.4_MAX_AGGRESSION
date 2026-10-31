#!/usr/bin/env node
'use strict';
/**
 * d5_check_decision.js — Verificador determinista del contrato de decisión ARA-X (D5 / t11).
 *
 * QUÉ ES: la implementación de REFERENCIA del contrato `ara-x/spec/ara_x_decision.md`.
 *   - Define las constantes (K) y su digest canónico.
 *   - Implementa fuse() [T1], fuzzy() [T2], thompson() [T3], decidir() [T0-T4] y reward().
 *   - Carga `ara-x/spec/decision_test_vectors.json`, comprueba que el digest de constantes
 *     coincide (fail-closed) y ejecuta cada vector comparando con lo esperado.
 *
 * QUÉ NO ES: no es un player, no habla con el VPS, no ejecuta ADB, no lee el reloj del sistema
 *   dentro de la lógica pura (todo `now_ms`/`tick` se inyecta) y no muta nada.
 *
 * USO:
 *   node ara-x/scripts/d5_check_decision.js              # verifica vectores
 *   node ara-x/scripts/d5_check_decision.js --print-digest
 *   node ara-x/scripts/d5_check_decision.js --vector V07 # depura un vector
 *
 * DETERMINISMO: sin Date.now() en la ruta pura; el muestreo Thompson usa uniformes inyectados
 *   (rng[]) o, si faltan, un xorshift128+ sembrado por vector. Redondeo único a 4 decimales
 *   (half-up) para todo float comparado.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ───────────────────────────────────────────────────────────────────────────────
// 0 · Constantes del contrato (fuente de verdad; el .md las documenta)
// ───────────────────────────────────────────────────────────────────────────────
const SPEC = 'ara-x-dec.v1';

const K = {
  spec: SPEC,
  cadence_ms: { t0_reflex: 100, t1_fuse: 500, t2_fuzzy: 5000, t3_thompson: 10000, t4_sync: 30000 },
  resolution_floor: { w: 3840, h: 2160 },
  soc_allowlist: ['amlogic', 'mt8696', 's905x3', 's905x4'],
  soc_alias: {
    amlogic_s905x4: 's905x4',
    'amlogic-s905x4': 's905x4',
    aml_s905x4: 's905x4',
    s905x4: 's905x4',
    s905x3: 's905x3',
    amlogic: 'amlogic',
    mt8696: 'mt8696',
    mediatek_mt8696: 'mt8696',
    mt8696_firetv: 'mt8696',
  },
  thermal: {
    enum_band: [0.0, 0.25, 0.5, 0.75, 0.9, 1.0, 1.0], // 0 NONE … 6 SHUTDOWN
    temp_soft_c: 65,
    temp_hard_c: 85,
    u_enum_only: 0.35,
    u_temp_only: 0.2,
    u_both: 0.1,
    u_none: 1.0,
    unknown_arm_min_idx: 1, // sin sensor térmico: nunca A0
    uncertain_penalty: 0.25,
  },
  fuse: {
    drop_full: 0.05,
    rebuf_full: 0.05,
    ttfb_zero: 300,
    ttfb_span: 1200,
    jitter_full: 200,
    err_full: 0.05,
    vst_zero: 2000,
    vst_span: 6000,
    ram_low: 0.15,
    bw_alpha: 0.3,
    ttfb_alpha: 0.3,
    jitter_alpha: 0.2,
    holt_alpha: 0.3,
    holt_beta: 0.1,
    holt_horizon: 3,
  },
  fuzzy: {
    // conjuntos (trapecio); LOW usa a=-0.01 y HIGH d=1.01 para incluir los extremos
    sets: { LOW: [-0.01, 0.0, 0.25, 0.45], MID: [0.3, 0.55, 0.8, 0.8], HIGH: [0.6, 0.85, 1.0, 1.01] },
    rules: [
      ['LOW', 'LOW', 'LOW', 0.0],
      ['LOW', 'LOW', 'MID', 0.15],
      ['LOW', 'MID', 'LOW', 0.2],
      ['LOW', 'LOW', 'HIGH', 0.45],
      ['LOW', 'MID', 'MID', 0.3],
      ['LOW', 'HIGH', 'LOW', 0.55],
      ['MID', 'LOW', 'LOW', 0.45],
      ['MID', 'MID', 'MID', 0.65],
      ['MID', 'HIGH', 'MID', 0.8],
      ['LOW', 'HIGH', 'HIGH', 0.85],
      ['HIGH', 'MID', 'MID', 0.9],
      ['HIGH', 'HIGH', 'HIGH', 1.0],
    ],
    unknown_thermal_input: 0.5, // punto neutro de una variable incierta (NO "templado")
  },
  ladders: {
    fps: [60, 30, 24],
    fps_L_cut: [0.4, 0.9],   // L >= 0.40 -> 30 fps ; L >= 0.90 -> 24 fps
    fps_u_cut: 0.8,          // u global >= 0.80 fuerza al menos 30 fps
    thermal_fps: [[0.75, 1], [0.9, 2]],
    thermal_post: [[0.5, 3], [0.75, 6], [0.9, 8]],
    net_stress_cut: [0.5, 0.8], // N >= 0.5 -> arm>=A2 ; N >= 0.8 -> arm>=A3
    post_u: [0.6, 0.66, 0.72, 0.78, 0.84, 0.88, 0.92, 0.96, 1.01], // 9 umbrales -> post_step 1..9
    post_count: 9,
  },
  arms: [
    { id: 'A0', buffer_s: 30, abr: 0.85, bias: 0, reconnect: 6, live_delay: 8 },
    { id: 'A1', buffer_s: 45, abr: 0.82, bias: 0, reconnect: 8, live_delay: 10 },
    { id: 'A2', buffer_s: 45, abr: 0.8, bias: 0, reconnect: 10, live_delay: 10 },
    { id: 'A3', buffer_s: 60, abr: 0.76, bias: 1, reconnect: 12, live_delay: 15 },
    { id: 'A4', buffer_s: 90, abr: 0.7, bias: 1, reconnect: 20, live_delay: 20 },
  ],
  thompson: {
    prior: [1.0, 1.0],
    decay: 0.995,
    floor: 0.5,
    logistic_k: 0.5513, // sqrt(3)/pi: logística unitaria ≈ normal unitaria
    u_clamp: 0.000001,
  },
  reward: {
    base: 0.75,
    w_quality: 0.25,
    w_drop: 3.0,
    w_rebuf: 4.0,
    w_stall: 0.5,
    w_res_loss: 6.0,
    w_vst: 1.5,
    w_thermal: 1.0,
  },
  antiflap: {
    dwell_ms: 20000,
    promote_margin: 0.06,
    promote_min_n: 2,
    cooldown_ms: 45000,
    reslock_ms: 120000,
    max_changes_30s: 1,
  },
  bitrate: {
    observed_max_factor: 1.25,
    observed_min_factor: 0.85,
    unknown_max_bps: 25000000,
    unknown_min_bps: 6000000,
    hard_min_bps: 1000000,
    hard_max_bps: 80000000,
  },
  sync_next_s: { emergency: 10, stressed: 20, normal: 30 },
  thermal_target_c: 70,
  base_levers: {
    pq_ai_sr_enable: 1,
    ai_sr_level: 3,
    ai_pq_mode: 3,
    aipq_enable: 1,
    pq_sharpness_enable: 1,
    pq_ai_dnr_enable: 1,
    pq_dnr_enable: 1,
    pq_nr_enable: 1,
    pq_ai_fbc_enable: 1,
    pq_hdr_enable: 1,
    pq_hdr_mode: 1,
    match_content_frame_rate: 1,
    minimal_post_processing_allowed: 0,
  },
  post_steps: [
    {},                                                        // 0
    { ai_pq_mode: 2 },                                         // 1
    { ai_sr_level: 2 },                                        // 2
    { pq_sharpness_enable: 0 },                                // 3
    { pq_ai_dnr_enable: 0, pq_dnr_enable: 0, pq_nr_enable: 0 },// 4
    { pq_ai_fbc_enable: 0 },                                   // 5
    { ai_sr_level: 1 },                                        // 6
    { pq_hdr_mode: 0 },                                        // 7
    { pq_hdr_enable: 0 },                                      // 8
    { minimal_post_processing_allowed: 1, ai_sr_level: 0, aipq_enable: 0, pq_ai_sr_enable: 0 }, // 9
  ],
  mask: {
    FPS30: 1 << 0, FPS24: 1 << 1, AI_PQ_REDUCED: 1 << 2, SR_REDUCED: 1 << 3,
    SHARP_OFF: 1 << 4, DNR_OFF: 1 << 5, FBC_OFF: 1 << 6, HDR_MODE_OFF: 1 << 7,
    HDR_OFF: 1 << 8, MINIMAL_PP: 1 << 9, BUFFER_RAISED: 1 << 10, ABR_TIGHTENED: 1 << 11,
    THERMAL_UNKNOWN: 1 << 12, THERMAL_CRITICAL: 1 << 13, RES_LOSS_LOCK: 1 << 14,
    FPS_UNAVAILABLE: 1 << 15,
  },
};

function canon(o) {
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  if (o && typeof o === 'object') {
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
  }
  return JSON.stringify(o);
}
const DIGEST = 'sha256:' + crypto.createHash('sha256').update(canon(K), 'utf8').digest('hex');

// ───────────────────────────────────────────────────────────────────────────────
// 1 · Utilidades deterministas
// ───────────────────────────────────────────────────────────────────────────────
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const r4 = (x) => Math.round(x * 10000) / 10000;
const rint = (x) => Math.round(x); // half-up para positivos

function trapezoid(x, p) {
  // f(x): 0 en a, sube a b, 1 entre b y c, baja a d, 0 tras d
  const [a, b, c, d] = p;
  if (x <= a) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  if (x < d) return (d - x) / (d - c);
  return 0;
}

function xorshift128plus(seedStr) {
  // splitmix64 para inicializar, luego xorshift128+
  // La semilla es un STRING arbitrario: se hashea a 64 bits (misma semilla => misma secuencia).
  const seedHex = crypto.createHash('sha256').update(String(seedStr || 'ara-x-dec'), 'utf8').digest('hex');
  let s0 = 0x9e3779b97f4a7c15n;
  let s1 = 0xbf58476d1ce4e5b9n;
  const h = BigInt('0x' + seedHex.slice(0, 16));
  const M = (1n << 64n) - 1n;
  const mix = (z) => {
    z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n & M;
    z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn & M;
    return (z ^ (z >> 31n)) & M;
  };
  s0 = mix(h ^ s0);
  s1 = mix(s0 ^ s1);
  return function next() {
    let x = s0;
    const y = s1;
    s0 = y;
    x ^= (x << 23n) & M;
    s1 = (x ^ y ^ (x >> 17n) ^ (y >> 26n)) & M;
    const v = (s1 + y) & M;
    return Number(v >> 11n) / 9007199254740992; // 53 bits -> [0,1)
  };
}

function uStream(vector) {
  if (Array.isArray(vector.rng) && vector.rng.length) {
    let i = 0;
    return () => (i < vector.rng.length ? vector.rng[i++] : 0.5);
  }
  if (typeof vector.rng_seed === 'string' && vector.rng_seed !== '') {
    const next = xorshift128plus(vector.rng_seed);
    return () => next();
  }
  return () => 0.5; // sin RNG declarado: z=0 => el muestreo colapsa a la media (determinista y legible)
}

// ───────────────────────────────────────────────────────────────────────────────
// 2 · T1 — fusión de red (EWMA + Holt/ARIMA-lite)
// ───────────────────────────────────────────────────────────────────────────────
function fuse(samples, floorBps) {
  const F = K.fuse;
  let ewma = null;
  let ttfb = null;
  let jitter = 0;
  let level = null;
  let trend = 0;
  let prevTtfb = null;
  const out = [];
  for (const s of samples) {
    const dt = Math.max(1, s.dt_ms);
    const inst = Math.round((s.bytes * 8 * 1000) / dt);
    ewma = ewma === null ? inst : Math.round(F.bw_alpha * inst + (1 - F.bw_alpha) * ewma);
    if (level === null) {
      level = ewma;
      trend = 0;
    } else {
      const prevLevel = level;
      level = F.holt_alpha * ewma + (1 - F.holt_alpha) * (prevLevel + trend);
      trend = F.holt_beta * (level - prevLevel) + (1 - F.holt_beta) * trend;
    }
    if (typeof s.ttfb_ms === 'number') {
      ttfb = ttfb === null ? s.ttfb_ms : Math.round(F.ttfb_alpha * s.ttfb_ms + (1 - F.ttfb_alpha) * ttfb);
      const jInst = prevTtfb === null ? 0 : Math.abs(s.ttfb_ms - prevTtfb);
      jitter = Math.round(F.jitter_alpha * jInst + (1 - F.jitter_alpha) * jitter);
      prevTtfb = s.ttfb_ms;
    }
    out.push({ inst, ewma, ttfb, jitter, level: Math.round(level), trend: Math.round(trend) });
  }
  const last = out[out.length - 1] || { ewma: 0, ttfb: 0, jitter: 0, level: 0, trend: 0 };
  const forecast = Math.round(last.level + K.fuse.holt_horizon * last.trend);
  const floor = floorBps || 0;
  return {
    inst_bps: last.ewma,
    ewma_bps: last.ewma,
    ttfb_ewma_ms: last.ttfb || 0,
    jitter_ewma_ms: last.jitter,
    forecast_bps: forecast,
    breach: floor > 0 ? forecast < floor : false,
    x_net: floor > 0 ? r4(clamp((floor - forecast) / floor, 0, 1)) : 0,
    samples: out.length,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// 3 · Normalización de features (0..1) + térmico honesto
// ───────────────────────────────────────────────────────────────────────────────
function thermalFusion(f) {
  const T = K.thermal;
  const hasEnum = typeof f.thermal_status === 'number' && f.thermal_status >= 0 && f.thermal_status <= 6;
  const hasTemp = typeof f.cpu_temp_c === 'number';
  let band = null;
  let u = T.u_none;
  if (hasEnum && hasTemp) {
    band = Math.max(T.enum_band[f.thermal_status], clamp((f.cpu_temp_c - T.temp_soft_c) / (T.temp_hard_c - T.temp_soft_c), 0, 1));
    u = T.u_both;
  } else if (hasEnum) {
    band = T.enum_band[f.thermal_status];
    u = T.u_enum_only;
  } else if (hasTemp) {
    band = clamp((f.cpu_temp_c - T.temp_soft_c) / (T.temp_hard_c - T.temp_soft_c), 0, 1);
    u = T.u_temp_only;
  }
  const unknown = band === null;
  return { x_therm: unknown ? null : r4(band), u_T: u, unknown };
}

function normalize(f) {
  const F = K.fuse;
  const th = thermalFusion(f);
  const dropRatio = typeof f.frame_drop_ratio === 'number'
    ? f.frame_drop_ratio
    : typeof f.frame_drop_count === 'number' && f.fps_declared
      ? f.frame_drop_count / (f.fps_declared * 10)
      : null;
  const rebufRatio = typeof f.rebuffer_ratio === 'number'
    ? f.rebuffer_ratio
    : typeof f.rebuffer_count === 'number' ? f.rebuffer_count / 5 : null;
  const x = {
    x_drop: dropRatio === null ? null : r4(clamp(dropRatio / F.drop_full, 0, 1)),
    x_rebuf: rebufRatio === null ? null : r4(clamp(rebufRatio / F.rebuf_full, 0, 1)),
    x_stall: f.stall === true ? 1 : 0,
    x_net: typeof f.x_net === 'number' ? r4(clamp(f.x_net, 0, 1)) : 0,
    x_ttfb: typeof f.ttfb_ewma_ms === 'number' ? r4(clamp((f.ttfb_ewma_ms - F.ttfb_zero) / F.ttfb_span, 0, 1)) : null,
    x_jit: typeof f.jitter_ewma_ms === 'number' ? r4(clamp(f.jitter_ewma_ms / F.jitter_full, 0, 1)) : null,
    x_err: typeof f.err5xx_rate === 'number' ? r4(clamp(f.err5xx_rate / F.err_full, 0, 1)) : null,
    x_therm: th.x_therm,
    u_T: th.u_T,
    x_res: ['720p', '1080p', 'below'].indexOf(f.resolution_class) !== -1 ? 1 : 0,
    ram_avail_pct: typeof f.ram_available_pct === 'number' ? f.ram_available_pct : null,
    vst_ms: typeof f.vst_ms === 'number' ? f.vst_ms : null,
  };
  return x;
}

// ───────────────────────────────────────────────────────────────────────────────
// 4 · T2 — fuzzy (Mamdani min + media ponderada de singleton)
// ───────────────────────────────────────────────────────────────────────────────
function fuzzy(x) {
  const S = K.fuzzy.sets;
  const nn = (v) => (v === null ? 0 : v);
  const L = Math.max(nn(x.x_drop), nn(x.x_rebuf), x.x_stall, nn(x.x_err));
  const N = Math.max(nn(x.x_net), nn(x.x_ttfb), nn(x.x_jit));
  const tUnknown = x.x_therm === null;
  const T = tUnknown ? K.fuzzy.unknown_thermal_input : x.x_therm;

  const mu = (setName, v) => trapezoid(v, S[setName]);
  let num = 0;
  let den = 0;
  for (const [ls, ns, ts, c] of K.fuzzy.rules) {
    const w = Math.min(mu(ls, L), mu(ns, N), mu(ts, T));
    if (w > 0) {
      num += w * c;
      den += w;
    }
  }
  const u = den > 0 ? num / den : 0;
  let post = 0;
  if (u >= K.ladders.post_u[0]) {
    post = 1;
    for (let i = 0; i < K.ladders.post_u.length; i++) if (u >= K.ladders.post_u[i]) post = i + 1;
    post = Math.min(post, K.ladders.post_count);
  }
  return { u: r4(u), L: r4(L), N: r4(N), T: r4(T), thermal_unknown: tUnknown, post_step: post };
}

// ───────────────────────────────────────────────────────────────────────────────
// 5 · T3 — Thompson (fraccional, Beta por arm) con cuantil logístico
// ───────────────────────────────────────────────────────────────────────────────
function betaMeanSd(a, b) {
  const n = a + b;
  const mean = a / n;
  const varr = (a * b) / (n * n * (n + 1));
  return { mean, sd: Math.sqrt(varr) };
}

function thompson(feasible, posteriors, nextU, state) {
  const k = K.thompson;
  const rows = [];
  for (const idx of feasible) {
    const arm = K.arms[idx];
    const p = posteriors[arm.id] || k.prior;
    const { mean, sd } = betaMeanSd(p[0], p[1]);
    const u = clamp(nextU(), k.u_clamp, 1 - k.u_clamp);
    const z = k.logistic_k * Math.log(u / (1 - u));
    const sample = mean + sd * z;
    rows.push({ id: arm.id, idx, mean: r4(mean), sd: r4(sd), u: r4(u), sample: r4(sample), n: r4(p[0] + p[1]) });
  }
  rows.sort((p, q) => (q.sample - p.sample) || (p.idx - q.idx));
  const chosen = rows[0];
  const dwell_ok = typeof state.now_ms === 'number' && typeof state.arm_since_ms === 'number'
    ? state.now_ms - state.arm_since_ms >= K.antiflap.dwell_ms
    : false;
  const cool_ok = typeof state.cooldown_until_ms === 'number' ? state.now_ms >= state.cooldown_until_ms : true;
  const lock_ok = typeof state.promote_lock_until_ms === 'number' ? state.now_ms >= state.promote_lock_until_ms : true;
  const budget_ok = (state.changes_30s || 0) < K.antiflap.max_changes_30s;
  const currentIdx = K.arms.findIndex((a) => a.id === state.arm);
  const promote = chosen.idx < currentIdx;
  const samplesOk = chosen.n >= K.antiflap.promote_min_n;
  const margin_ok = promote
    ? chosen.sample - (rows.find((r) => r.idx === currentIdx) || { sample: -1 }).sample >= K.antiflap.promote_margin
    : true;
  return { rows, chosen, promote, gates: { dwell_ok, cool_ok, lock_ok, budget_ok, margin_ok, samples_ok: samplesOk } };
}

// ───────────────────────────────────────────────────────────────────────────────
// 6 · T0/T2/T3/T4 — decisión completa
// ───────────────────────────────────────────────────────────────────────────────
function canonSoc(raw) {
  const s = String(raw || '').toLowerCase().trim();
  return K.soc_alias[s] || 'unknown';
}

function leversFor(postStep, caps, socOk) {
  if (!caps.vpp_levers || !socOk) return {};
  const out = Object.assign({}, K.base_levers);
  for (let i = 1; i <= Math.min(postStep, K.post_steps.length - 1); i++) {
    Object.assign(out, K.post_steps[i]);
  }
  return out;
}

function decide(vector) {
  const x = normalize(vector.obs || {});
  const caps = Object.assign({ fps_lever: false, vpp_levers: true, adb_sensors: false }, vector.caps || {});
  const state = Object.assign({ arm: 'A2', now_ms: 0, arm_since_ms: 0, changes_30s: 0 }, vector.state || {});
  const fz = fuzzy(x);
  const socRaw = (vector.obs || {}).soc;
  const soc = canonSoc(socRaw);
  const socKnown = socRaw !== undefined && String(socRaw).trim() !== '';
  const socOk = K.soc_allowlist.indexOf(soc) !== -1;
  const flags = [];
  const reasons = [];
  let mask = 0;

  // ── T0 · térmico: banda fusionada manda (enum y/o temperatura) ────────────
  const thStatus = typeof (vector.obs || {}).thermal_status === 'number' ? vector.obs.thermal_status : null;
  let minIdx = x.x_therm === null ? K.thermal.unknown_arm_min_idx : 0;
  if (x.x_therm !== null) {
    if (x.x_therm >= 0.9) minIdx = 4;
    else if (x.x_therm >= 0.75) minIdx = 3;
    else if (x.x_therm >= 0.5) minIdx = 2;
    else if (x.x_therm >= 0.25) minIdx = 1;
  }
  if (x.x_therm === null) {
    mask |= K.mask.THERMAL_UNKNOWN;
    flags.push('thermal_unknown');
    reasons.push('thermal_sensor_absent');
  }
  if (thStatus !== null && thStatus >= 4) {
    mask |= K.mask.THERMAL_CRITICAL;
    flags.push('thermal_critical');
    reasons.push('pm_thermal_status_critical');
  } else if (thStatus === 3) {
    flags.push('thermal_severe');
    reasons.push('pm_thermal_status_severe');
  }

  // ── T2 · fuzzy + escalera FPS (rank-1) + térmico (R2: todo evento térmico degrada FPS) ──
  const LAD = K.ladders;
  let fpsStep = 0;
  if (fz.L >= LAD.fps_L_cut[1]) fpsStep = 2;
  else if (fz.L >= LAD.fps_L_cut[0]) fpsStep = 1;
  let postStep = fz.post_step;
  if (fz.u >= LAD.fps_u_cut) fpsStep = Math.max(fpsStep, 1);
  if (x.x_therm !== null) {
    for (const [band, fps] of LAD.thermal_fps) if (x.x_therm >= band) fpsStep = Math.max(fpsStep, fps);
    for (const [band, post] of LAD.thermal_post) if (x.x_therm >= band) postStep = Math.max(postStep, post);
    if (x.x_therm >= LAD.thermal_post[2][0]) reasons.push('thermal_band_critical');
    else if (x.x_therm >= LAD.thermal_post[1][0]) reasons.push('thermal_band_severe');
    else if (x.x_therm >= LAD.thermal_post[0][0]) reasons.push('thermal_band_moderate');
  }
  const emergency = (thStatus !== null && thStatus >= 4) || x.x_stall === 1 || (x.x_therm !== null && x.x_therm >= 0.9);
  if (x.x_stall === 1) {
    postStep = Math.max(postStep, 7);
    fpsStep = Math.max(fpsStep, 1);
    reasons.push('stall_reflex');
  }
  let promoteLockMs = 0;
  if (x.vst_ms !== null && x.vst_ms > 8000) {
    postStep = Math.max(postStep, 2);
    reasons.push('vst_critical');
    flags.push('vst_critical');
  }
  if (x.x_res === 1) {
    postStep = Math.max(postStep, 4);
    mask |= K.mask.RES_LOSS_LOCK;
    flags.push('res_loss_lock');
    reasons.push('resolution_below_floor');
    promoteLockMs = K.antiflap.reslock_ms;
  }
  if (x.ram_avail_pct !== null && x.ram_avail_pct < K.fuse.ram_low * 100) {
    flags.push('ram_low');
    reasons.push('ram_low');
  }

  // ── T3 · brazo (determinista bajo estrés; Thompson sólo en calma) ─────────
  const stressed = fpsStep > 0 || postStep > 0 || fz.N >= 0.5;
  let armIdx;
  let th = null;
  const uNext = uStream(vector);
  if (!stressed) {
    if (state.cold === true) {
      armIdx = Math.max(minIdx, 2);
      reasons.push('cold_start_fixed_arm');
    } else {
      const allowed = [];
      for (let i = 0; i < K.arms.length; i++) if (i >= minIdx && i <= 3) allowed.push(i);
      if (!allowed.length) allowed.push(minIdx);
      th = thompson(allowed, vector.posteriors || {}, uNext, state);
      const currentIdx = K.arms.findIndex((a) => a.id === state.arm);
      const gates = th.gates;
      const wantsChange = th.chosen.idx !== currentIdx;
      const isPromote = th.chosen.idx < currentIdx;
      const allow = isPromote
        ? gates.dwell_ok && gates.cool_ok && gates.lock_ok && gates.budget_ok && gates.margin_ok && gates.samples_ok
        : gates.dwell_ok && gates.budget_ok; // degradar es seguro; sólo se limita la tasa
      if (wantsChange && !allow) {
        armIdx = Math.max(minIdx, currentIdx);
        flags.push('antiflap_hold');
        reasons.push('change_blocked');
      } else {
        armIdx = th.chosen.idx;
        if (wantsChange) reasons.push(isPromote ? 'promote' : 'demote');
      }
    }
  } else {
    let forced = 2; // bajo estrés nunca se promociona por debajo de A2
    if (fpsStep >= 1) forced = 2;
    if (fpsStep >= 2) forced = 3;
    if (postStep >= 3) forced = 3;
    if (postStep >= 7) forced = 4;
    if (fz.N >= 0.8) forced = Math.max(forced, 3);
    else if (fz.N >= 0.5) forced = Math.max(forced, 2);
    armIdx = Math.max(minIdx, forced);
    reasons.push('stressed_deterministic');
  }
  if (emergency) {
    armIdx = Math.max(armIdx, 4);
    reasons.push('emergency_override');
  }
  const arm = K.arms[armIdx];

  // ── fps: sin lever => se sustituye por post-proceso equivalente ───────────
  let fpsApplied = fpsStep;
  let fpsCap = K.ladders.fps[fpsStep];
  if (fpsStep > 0 && !caps.fps_lever) {
    postStep = Math.max(postStep, Math.min(fpsStep * 2, K.ladders.post_count));
    fpsApplied = 0;
    fpsCap = K.ladders.fps[0];
    mask |= K.mask.FPS_UNAVAILABLE;
    flags.push('fps_unavailable');
    reasons.push('no_fps_lever');
  }
  if (fpsApplied === 1) mask |= K.mask.FPS30;
  if (fpsApplied === 2) mask |= K.mask.FPS24;

  // ── sesgo del brazo (nunca relaja) ────────────────────────────────────────
  const postFinal = clamp(postStep + arm.bias, 0, K.ladders.post_count);
  if (postFinal >= 1) mask |= K.mask.AI_PQ_REDUCED;
  if (postFinal >= 2) mask |= K.mask.SR_REDUCED;
  if (postFinal >= 3) mask |= K.mask.SHARP_OFF;
  if (postFinal >= 4) mask |= K.mask.DNR_OFF;
  if (postFinal >= 5) mask |= K.mask.FBC_OFF;
  if (postFinal >= 7) mask |= K.mask.HDR_MODE_OFF;
  if (postFinal >= 8) mask |= K.mask.HDR_OFF;
  if (postFinal >= 9) mask |= K.mask.MINIMAL_PP;

  // ── buffer / abr / bitrate ────────────────────────────────────────────────
  const bufferBump = postFinal <= 2 ? 0 : postFinal <= 5 ? 10 : postFinal <= 8 ? 20 : 30;
  if (bufferBump > 0) mask |= K.mask.BUFFER_RAISED;
  const buffer_s = r4(clamp(arm.buffer_s + bufferBump, 5, 120));
  const abr = r4(clamp(arm.abr - 0.02 * Math.floor(postFinal / 3), 0.5, 0.98));
  if (postFinal >= 3) mask |= K.mask.ABR_TIGHTENED;

  const B = K.bitrate;
  const obsBps = typeof (vector.obs || {}).bitrate_bps === 'number' ? vector.obs.bitrate_bps : null;
  let max_bps;
  let min_bps;
  if (obsBps !== null && obsBps > 0) {
    max_bps = clamp(rint(obsBps * B.observed_max_factor), B.hard_min_bps, B.hard_max_bps);
    min_bps = clamp(rint(obsBps * B.observed_min_factor), B.hard_min_bps, max_bps);
  } else {
    max_bps = B.unknown_max_bps;
    min_bps = B.unknown_min_bps;
    flags.push('bitrate_unknown');
  }

  if (!socKnown) {
    flags.push('soc_unknown');
    reasons.push('soc_unknown_fail_closed');
  } else if (!socOk) {
    flags.push('soc_not_allowlisted');
    reasons.push('soc_not_allowlisted');
  }
  if (!caps.vpp_levers) {
    flags.push('vpp_not_applicable');
    reasons.push('vpp_not_applicable');
  }
  if (fz.thermal_unknown) reasons.push('thermal_unknown_conservative');

  const levers = leversFor(postFinal, caps, socOk);
  const hdr_hint = postFinal >= 8 ? 'SDR' : 'PQ';
  const sync_next_s = emergency || (thStatus !== null && thStatus >= 4)
    ? K.sync_next_s.emergency
    : postFinal >= 3 || fpsApplied > 0 ? K.sync_next_s.stressed
      : K.sync_next_s.normal;

  if (state.cold === true) {
    flags.push('cold_start');
    reasons.push('cold_start');
  }

  const out = {
    arm: arm.id,
    u_degrade: fz.u,
    fps_cap: fpsCap,
    fps_applied: fpsApplied,
    post_step: postFinal,
    buffer_s,
    abr_bw_factor: abr,
    reconnect_attempts: arm.reconnect,
    live_delay_s: arm.live_delay,
    max_bitrate_bps: max_bps,
    min_bitrate_bps: min_bps,
    hdr_hint,
    sync_next_s,
    promote_lock_ms: promoteLockMs,
    degrade_mask: mask,
    levers,
    flags,
    reasons,
    thermal: { x_therm: x.x_therm, u_T: x.u_T, min_arm_idx: minIdx },
    soc,
    allowed: socOk,
    fuzzy: { L: fz.L, N: fz.N, T: fz.T, post_step_raw: fz.post_step },
    _sampled: th ? th.rows.map((r) => r.id) : [],
  };
  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// 7 · Recompensa y actualización de posterior
// ───────────────────────────────────────────────────────────────────────────────
function reward(obs, applied) {
  const R = K.reward;
  const x = normalize(obs || {});
  const fpsNorm = applied ? applied.fps_applied / 2 : 0;
  const postNorm = applied ? applied.post_step / K.ladders.post_count : 0;
  const stepNorm = 0.5 * fpsNorm + 0.5 * postNorm;
  const vstPen = x.vst_ms === null ? 0 : clamp((x.vst_ms - K.fuse.vst_zero) / K.fuse.vst_span, 0, 1);
  const thermalPen = x.x_therm === null
    ? K.thermal.uncertain_penalty
    : clamp((x.x_therm - 0.5) / 0.5, 0, 1);
  const r = R.base
    + R.w_quality * (1 - stepNorm)
    - R.w_drop * (x.x_drop === null ? 0 : x.x_drop)
    - R.w_rebuf * (x.x_rebuf === null ? 0 : x.x_rebuf)
    - R.w_stall * x.x_stall
    - R.w_res_loss * x.x_res
    - R.w_vst * vstPen
    - R.w_thermal * thermalPen;
  return r4(clamp(r, 0, 1));
}

function updatePosterior(p, r) {
  const T = K.thompson;
  const a = Math.max(T.floor, p[0] * T.decay + r);
  const b = Math.max(T.floor, p[1] * T.decay + (1 - r));
  return [r4(a), r4(b)];
}

// ───────────────────────────────────────────────────────────────────────────────
// 8 · Invariantes del contrato (independientes de los valores esperados)
//    Se comprueban sobre TODOS los vectores y sobre un barrido pseudoaleatorio
//    determinista. Una violación es un fallo del contrato, no un "expected" mal puesto.
// ───────────────────────────────────────────────────────────────────────────────
const LEVER_KEYS = Object.keys(K.base_levers).sort();

function checkInvariants(out, ctx, bad) {
  const add = (code, detail) => bad.push(`${ctx}: ${code} ${detail}`);
  const keys = Object.keys(out);
  // INV-2 · el ADC no tiene autoridad sobre la resolución (ni directa ni por setting)
  for (const k of keys) {
    if (/resolution|width|height/i.test(k)) add('INV2_RESOLUTION_AUTHORITY', `key=${k}`);
    if (k === 'levers') {
      for (const lk of Object.keys(out.levers)) {
        if (/resolution|width|height/i.test(lk)) add('INV2_RESOLUTION_LEVER', `lever=${lk}`);
        if (LEVER_KEYS.indexOf(lk) === -1) add('INV3_LEVER_NOT_ALLOWLISTED', `lever=${lk}`);
      }
    }
    // INV-9 · la política no transporta URLs (no se reescriben segmentos)
    if (/url|uri|segment/i.test(k)) add('INV9_URL_IN_POLICY', `key=${k}`);
  }
  // INV-4 · fail-closed por SoC
  if (out.allowed === false && Object.keys(out.levers || {}).length !== 0) add('INV4_FAIL_CLOSED', 'allowed=false con levers');
  // INV-5 · rangos del schema de política
  if (!(out.buffer_s >= 5 && out.buffer_s <= 120)) add('INV5_BUFFER_RANGE', String(out.buffer_s));
  if (!(out.abr_bw_factor >= 0.5 && out.abr_bw_factor <= 0.98)) add('INV5_ABR_RANGE', String(out.abr_bw_factor));
  if (!(out.min_bitrate_bps >= 1000000 && out.min_bitrate_bps <= out.max_bitrate_bps && out.max_bitrate_bps <= 80000000)) {
    add('INV5_BITRATE_RANGE', `${out.min_bitrate_bps}..${out.max_bitrate_bps}`);
  }
  if (!(out.reconnect_attempts >= 1 && out.reconnect_attempts <= 500)) add('INV5_RECONNECT_RANGE', String(out.reconnect_attempts));
  if (!(out.live_delay_s >= 1 && out.live_delay_s <= 60)) add('INV5_LIVE_DELAY_RANGE', String(out.live_delay_s));
  if ([10, 20, 30].indexOf(out.sync_next_s) === -1) add('INV5_SYNC_NEXT', String(out.sync_next_s));
  if (out.degrade_mask < 0 || out.degrade_mask > 65535) add('INV5_MASK_RANGE', String(out.degrade_mask));
  // INV-6 · null != 0 en térmico: sensor ausente => conservador y marcado
  if (out.thermal.x_therm === null) {
    if (!(out.degrade_mask & K.mask.THERMAL_UNKNOWN)) add('INV6_THERMAL_UNKNOWN_UNMARKED', 'sin bit');
    if (out.arm === 'A0') add('INV6_THERMAL_UNKNOWN_A0', 'arm=A0');
  }
  // INV-7 · la escalera de proceso es monótona y consistente con la máscara
  if (!(out.post_step >= 0 && out.post_step <= K.ladders.post_count)) add('INV7_POST_STEP_RANGE', String(out.post_step));
  const postMustSet = [[1, 'AI_PQ_REDUCED'], [2, 'SR_REDUCED'], [3, 'SHARP_OFF'], [4, 'DNR_OFF'], [5, 'FBC_OFF'], [7, 'HDR_MODE_OFF'], [8, 'HDR_OFF'], [9, 'MINIMAL_PP']];
  for (const [thr, bit] of postMustSet) {
    if (out.post_step >= thr && !(out.degrade_mask & K.mask[bit])) add('INV7_MASK_MISSING', `${bit} con post=${out.post_step}`);
  }
  if (out.post_step === 0 && (out.degrade_mask & (K.mask.AI_PQ_REDUCED | K.mask.SR_REDUCED | K.mask.SHARP_OFF | K.mask.DNR_OFF | K.mask.FBC_OFF))) {
    add('INV7_MASK_EXTRA', 'bits de post con post=0');
  }
  if (out.hdr_hint !== (out.post_step >= 8 ? 'SDR' : 'PQ')) add('INV7_HDR_HINT', out.hdr_hint);
  if ([60, 30, 24].indexOf(out.fps_cap) === -1) add('INV7_FPS_VALUE', String(out.fps_cap));
  // INV-8 · sin lever de fps no se declara fps aplicado
  if (out.fps_applied !== 0 && (out.degrade_mask & K.mask.FPS_UNAVAILABLE)) add('INV8_FPS_CONTRADICTION', 'aplicado + no disponible');
  if (out.fps_applied === 0 && out.fps_cap !== 60) add('INV8_FPS_CAP_WITHOUT_APPLY', `cap=${out.fps_cap}`);
  // INV-10 · pérdida de resolución => bloqueo de promoción declarado
  if (out.reasons.indexOf('resolution_below_floor') !== -1 && out.promote_lock_ms !== K.antiflap.reslock_ms) {
    add('INV10_RES_LOCK', String(out.promote_lock_ms));
  }
}

function sweep(n) {
  const next = xorshift128plus('d5sweep');
  const pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
  const out = [];
  for (let i = 0; i < n; i++) {
    // 50 % calma (para ejercitar la ruta Thompson) y 50 % estrés (para ejercitar la escalera)
    const calm = next() < 0.5;
    const stress = (arr) => pick(calm ? arr.slice(0, 2) : arr);
    const obs = {
      soc: pick(['amlogic_s905x4', 's905x4', 'mt8696', 'rtk_rtd1319', '']),
      thermal_status: calm ? pick([undefined, 0, 0, 1]) : pick([undefined, 0, 1, 2, 3, 4, 5, 6]),
      cpu_temp_c: calm ? pick([undefined, undefined, 55]) : pick([undefined, undefined, 55, 72, 88]),
      frame_drop_ratio: calm ? pick([undefined, 0, 0.002]) : pick([undefined, 0, 0.005, 0.02, 0.04, 0.08, 0.2]),
      rebuffer_ratio: calm ? pick([undefined, 0]) : pick([undefined, 0, 0.01, 0.03, 0.1]),
      stall: calm ? false : pick([false, false, false, true]),
      x_net: calm ? pick([0, 0.1]) : pick([0, 0.2, 0.5, 0.8, 1]),
      ttfb_ewma_ms: calm ? pick([undefined, 350]) : pick([undefined, 350, 900, 1800]),
      jitter_ewma_ms: calm ? pick([undefined, 10]) : pick([undefined, 10, 90, 400]),
      err5xx_rate: calm ? pick([undefined, 0]) : pick([undefined, 0, 0.01, 0.08]),
      vst_ms: calm ? pick([undefined, 900]) : pick([undefined, 900, 4000, 9000]),
      bitrate_bps: stress([undefined, 25000000, 0, 3000000, 9000000]),
      resolution_class: calm ? pick(['4k', '4k', 'unknown']) : pick(['4k', '4k', '1080p', '720p', 'unknown']),
      ram_available_pct: calm ? pick([undefined, 40, 90]) : pick([undefined, 8, 40, 90]),
      fps_declared: pick([25, 30, 50, 60]),
    };
    out.push({
      obs,
      caps: { fps_lever: pick([true, false]), vpp_levers: pick([true, true, false]) },
      state: { arm: pick(['A0', 'A1', 'A2', 'A3', 'A4']), now_ms: pick([0, 5000, 30000, 120000]), arm_since_ms: pick([0, 10000, 100000]), changes_30s: pick([0, 0, 1, 2]), cold: pick([false, false, true]) },
      posteriors: { A0: [pick([1, 5, 400]), pick([1, 5, 400])], A1: [5, 5], A2: [5, 5], A3: [5, 5], A4: [5, 5] },
    });
  }
  return out;
}
// ───────────────────────────────────────────────────────────────────────────────
// 9 · Runner de vectores
// ───────────────────────────────────────────────────────────────────────────────
function roundDeep(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : r4(v);
  if (Array.isArray(v)) return v.map(roundDeep);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = roundDeep(v[k]);
    return o;
  }
  return v;
}

function subsetEqual(expected, actual, where, failures) {
  for (const k of Object.keys(expected)) {
    const e = expected[k];
    const a = actual === undefined || actual === null ? undefined : actual[k];
    if (e && typeof e === 'object' && !Array.isArray(e)) {
      if (!a || typeof a !== 'object') { failures.push(`${where}.${k}: expected object, got ${JSON.stringify(a)}`); continue; }
      subsetEqual(e, a, `${where}.${k}`, failures);
    } else {
      const ea = JSON.stringify(roundDeep(e));
      const aa = JSON.stringify(roundDeep(a));
      if (ea !== aa) failures.push(`${where}.${k}: expected ${ea} got ${aa}`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--print-digest')) {
    console.log(DIGEST);
    console.log('spec=' + SPEC);
    return 0;
  }
  const onlyIdx = args.indexOf('--vector');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
  const vecPath = path.join(__dirname, '..', 'spec', 'decision_test_vectors.json');
  if (!fs.existsSync(vecPath)) { console.error('MISSING ' + vecPath); return 2; }
  const doc = JSON.parse(fs.readFileSync(vecPath, 'utf8'));

  let failures = [];
  if (doc.constants_digest !== DIGEST) {
    console.error(`CONSTANTS_DIGEST_MISMATCH file=${doc.constants_digest} impl=${DIGEST}`);
    return 3;
  }
  if (doc.spec !== SPEC) { console.error(`SPEC_MISMATCH file=${doc.spec} impl=${SPEC}`); return 3; }

  const results = [];
  for (const v of doc.vectors) {
    if (only && v.id !== only) continue;
    const f = [];
    try {
      if (v.kind === 'fuse') {
        const got = fuseSamples(v);
        subsetEqual(v.expect, got, v.id, f);
      } else if (v.kind === 'reward') {
        const applied = { fps_applied: v.applied.fps_applied, post_step: v.applied.post_step };
        const got = reward(v.obs, applied);
        subsetEqual({ reward: v.expect.reward }, { reward: got }, v.id, f);
        if (v.expect.posterior) {
          const p = updatePosterior(v.posterior_in, got);
          const pe = v.expect.posterior;
          subsetEqual({ a: pe.a, b: pe.b }, { a: p[0], b: p[1] }, v.id + '.posterior', f);
        }
      } else {
        const got = decide(v);
        const again = decide(v);
        if (JSON.stringify(got) !== JSON.stringify(again)) f.push(`${v.id}: non-deterministic (two runs differ)`);
        checkInvariants(got, v.id, f);
        subsetEqual(v.expect, got, v.id, f);
      }
    } catch (e) {
      f.push(`${v.id}: threw ${e && e.message}`);
    }
    results.push({ id: v.id, name: v.name || '', ok: f.length === 0, failures: f });
    failures = failures.concat(f);
  }

  const pass = results.filter((r) => r.ok).length;
  // INVARIANTES sobre barrido determinista (independiente de los expected)
  const invBad = [];
  const N_SWEEP = 300;
  for (let i = 0; i < N_SWEEP; i++) {
    const sw = sweep(1)[0];
    let got;
    try { got = decide(sw); } catch (e) { invBad.push(`sweep#${i}: threw ${e && e.message}`); continue; }
    checkInvariants(got, `sweep#${i}`, invBad);
  }
  for (const msg of invBad) console.log('INVARIANT FAIL ' + msg);

  for (const r of results) {
    if (!r.ok) {
      console.log(`FAIL ${r.id} · ${r.name}`);
      for (const msg of r.failures) console.log('      ' + msg);
    }
  }
  const totalFail = failures.length + invBad.length;
  console.log(`\nD5 decision vectors: ${pass}/${results.length} PASS · ${failures.length} fallo(s) · invariantes: ${N_SWEEP - invBad.length}/${N_SWEEP} OK · total fallos=${totalFail} · spec=${SPEC} · ${DIGEST.slice(0, 22)}…`);
  return totalFail === 0 ? 0 : 1;
}

function fuseSamples(v) {
  const s = (v.samples || []).map((x) => ({ dt_ms: x.dt_ms, bytes: x.bytes, ttfb_ms: x.ttfb_ms }));
  return fuse(s, v.floor_bps || 0);
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { K, DIGEST, SPEC, fuse, fuzzy, decide, reward, updatePosterior, normalize, thermalFusion, canonSoc, r4 };
