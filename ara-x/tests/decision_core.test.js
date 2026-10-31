'use strict';
/**
 * decision_core.test.js — Verificación del núcleo de decisión ARA-X (I1 / t13).
 *
 * Cubre, en el orden de las aceptaciones de la tarea:
 *   1. los 26 vectores golden de D5 + determinismo con la misma semilla
 *   2. blend: pesos ≥0, suma 1, sólo P0-P5
 *   3. degradación proactiva y monótona con predicted_temp > 82 o stutter > 0.3
 *   4. anti-flap de blend dentro del dwell de D5
 *   5. envoltura value/prov/age_ms/conf y `null` + `unavailable` (nunca 0 fabricado)
 *   6. cliente/telemetría no observada ⇒ `unknown` + prior P2; `riskFromQoe([])` ≠ 0
 *   7. sin ADB: pm_thermal_status / ram_available_pct / frame_drop_ratio bastan
 *   8. soc desconocido o no canónico ⇒ política conservadora
 *   9. cero dependencias / cero I/O / cero red + node --check y node --test
 *
 * Ejecutar: node --test ara-x/tests/decision_core.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const core = require(path.resolve(__dirname, '..', 'controller', 'ara_x_decision_core.js'));
const vectorsDoc = require(path.resolve(__dirname, '..', 'spec', 'decision_test_vectors.json'));
const d5 = require(path.resolve(__dirname, '..', 'scripts', 'd5_check_decision.js'));

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
const eq = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

const DECISION_KEYS = [
  'arm', 'u_degrade', 'fps_cap', 'fps_applied', 'post_step', 'buffer_s', 'abr_bw_factor',
  'reconnect_attempts', 'live_delay_s', 'max_bitrate_bps', 'min_bitrate_bps', 'hdr_hint',
  'sync_next_s', 'promote_lock_ms', 'degrade_mask', 'flags', 'soc', 'allowed',
];

// Estado sintético determinista para el barrido (semilla fija ⇒ reproducible).
function sweepStates(n) {
  const next = core.makeRng('i1-sweep');
  const pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
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

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación 9 (parte) · digest de constantes: el núcleo no puede divergir de D5
// ─────────────────────────────────────────────────────────────────────────────
test('digest de constantes == vectores == referencia D5', () => {
  const digest = 'sha256:' + crypto.createHash('sha256').update(core.canonicalConstants(), 'utf8').digest('hex');
  assert.equal(digest, vectorsDoc.constants_digest, 'el núcleo no reproduce el digest de los vectores');
  assert.equal(digest, d5.DIGEST, 'el núcleo no reproduce el digest de la referencia D5');
  assert.equal(vectorsDoc.spec, core.SPEC);
});

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación 1 · los 26 vectores pasan + determinismo con la misma semilla
// ─────────────────────────────────────────────────────────────────────────────
test('aceptación 1 · los 26 vectores golden pasan (expect + paridad con D5)', () => {
  assert.equal(vectorsDoc.vectors.length, 26);
  for (const v of vectorsDoc.vectors) {
    if (v.kind === 'fuse') {
      const got = core.fuse(
        v.samples.map((s) => ({ dt_ms: s.dt_ms, bytes: s.bytes, ttfb_ms: s.ttfb_ms })),
        v.floor_bps
      );
      for (const k of Object.keys(v.expect)) assert.deepEqual(norm(got[k]), norm(v.expect[k]), `${v.id}.${k}`);
      assert.deepEqual(norm(got), norm(Object.assign({}, got, v.expect)), `${v.id} (fuse completo)`);
      continue;
    }
    if (v.kind === 'reward') {
      const got = core.reward(v.obs, v.applied);
      assert.equal(got, v.expect.reward, `${v.id}.reward`);
      if (v.expect.posterior) {
        const p = core.updatePosterior(v.posterior_in, got);
        assert.deepEqual(norm(p), norm([v.expect.posterior.a, v.expect.posterior.b]), `${v.id}.posterior`);
      }
      continue;
    }
    const got = core.decideFromVector(v);
    const ref = d5.decide(v);
    for (const k of DECISION_KEYS) {
      assert.deepEqual(norm(got[k]), norm(v.expect[k]), `${v.id}.${k} (expect)`);
      assert.deepEqual(norm(got[k]), norm(ref[k]), `${v.id}.${k} (paridad D5)`);
    }
    if (v.expect.levers) assert.deepEqual(norm(got.levers), norm(v.expect.levers), `${v.id}.levers`);
  }
});

test('aceptación 1 · misma semilla ⇒ salida byte-idéntica; semilla distinta ⇒ sólo cambia la exploración', () => {
  const base = {
    obs: { soc: 's905x4', thermal_status: 0, bitrate_bps: 15000000, resolution_class: '4k', vst_ms: 900 },
    caps: { fps_lever: true, vpp_levers: true },
    state: { arm: 'A2', now_ms: 60000, arm_since_ms: 0, changes_30s: 0 },
    posteriors: { A0: [5, 5], A1: [5, 5], A2: [5, 5], A3: [5, 5], A4: [5, 5] },
  };
  const a = core.decide(Object.assign({}, base, { rng_seed: 'semilla-fija' }));
  const b = core.decide(Object.assign({}, base, { rng_seed: 'semilla-fija' }));
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'misma semilla ⇒ misma salida');

  const c = core.decide(Object.assign({}, base, { rng_seed: 'otra-semilla' }));
  // La semilla SÓLO puede mover la exploración del brazo (es Thompson): todo lo que
  // no depende del brazo debe ser idéntico.
  for (const k of ['u_degrade', 'fps_cap', 'fps_applied', 'allowed', 'soc', 'sync_next_s']) {
    assert.deepEqual(norm(c[k]), norm(a[k]), `la semilla no debe alterar ${k}`);
  }
  assert.deepEqual(norm(c.blend), norm(a.blend), 'el blend no depende de la semilla');
  assert.ok(['A0', 'A1', 'A2', 'A3'].includes(c.arm), 'el brazo explorado sigue siendo válido');
  // y el post_step sólo puede diferir por el sesgo del brazo (0/1), nunca más
  assert.ok(Math.abs(c.post_step - a.post_step) <= 1, 'la semilla no puede saltar la escalera');
});

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación 2 · blend: ≥0, suma 1, sólo P0-P5
// ─────────────────────────────────────────────────────────────────────────────
test('aceptación 2 · el blend siempre suma 1, no es negativo y sólo usa P0-P5', () => {
  const cases = sweepStates(200).map((s) => core.decide(s));
  cases.push(core.decide({}));
  cases.push(core.decide({ obs: { soc: 'rtk_rtd1319' } }));
  cases.push(core.decide({ obs: { soc: '', thermal_status: 5 } }));
  cases.push(core.decide({ features: {} }));
  for (const d of cases) {
    assert.deepEqual(core.validateBlend(d.blend), [], 'blend inválido: ' + JSON.stringify(d.blend));
    const ids = Object.keys(d.blend);
    assert.ok(ids.length >= 1 && ids.length <= 6, 'blend con ' + ids.length + ' claves');
    for (const id of ids) assert.ok(['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].includes(id), 'id inválido ' + id);
    const sum = ids.reduce((s, k) => s + d.blend[k], 0);
    assert.ok(Math.abs(sum - 1) <= 1e-6, 'blend suma ' + sum);
  }
});

test('aceptación 2 · el blend NUNCA asigna peso a perfiles bajo el piso 4K (P3/P4)', () => {
  for (const d of sweepStates(120).map((s) => core.decide(s))) {
    assert.equal(d.blend.P3, 0, 'P3 (1080p medido) no puede recibir peso');
    assert.equal(d.blend.P4, 0, 'P4 (720p medido) no puede recibir peso');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación 3 · degradación proactiva y monótona
// ─────────────────────────────────────────────────────────────────────────────
test('aceptación 3 · predicted_temp > 82 °C adelanta la degradación y nunca mejora el tier', () => {
  const base = {
    obs: { soc: 's905x4', thermal_status: 1, bitrate_bps: 12000000, resolution_class: '4k', vst_ms: 900 },
    caps: { fps_lever: true, vpp_levers: true },
    state: { arm: 'A2', now_ms: 60000, arm_since_ms: 0, changes_30s: 0 },
  };
  const frío = core.decide(base);
  const caliente = core.decide(Object.assign({}, base, {
    temp_series_c: [70, 76, 83, 88], // serie medida (ADB): Holt pronostica > 82
  }));
  assert.ok(caliente.predicted_temp_c !== null && caliente.predicted_temp_c > 82, 'predicción > 82 °C');
  assert.ok(caliente.post_step >= 6, 'post_step ≥ 6 con 88 °C pronosticados');
  assert.ok(caliente.fps_applied <= 1, 'FPS capado (1 = 30 fps)');
  assert.ok(caliente.proactive.includes('predicted_temp_gt_82'));
  assert.ok(caliente.flags.includes('proactive_thermal'));
  // monotonía: el adelanto sólo puede degradar, jamás mejorar
  assert.ok(caliente.post_step >= frío.post_step, 'post_step no puede bajar con fiebre');
  assert.ok(
    core.tierRank(caliente.processing_tier) >= core.tierRank(frío.processing_tier),
    'el tier no puede mejorar (' + frío.processing_tier + ' → ' + caliente.processing_tier + ')'
  );
});

test('aceptación 3 · predicted_temp > 82 con tier previo mejor ⇒ se mantiene el tier (no sube)', () => {
  const d = core.decide({
    obs: { soc: 's905x4', thermal_status: 0, bitrate_bps: 12000000, resolution_class: '4k' },
    caps: { fps_lever: true, vpp_levers: true },
    state: { arm: 'A2', now_ms: 60000, arm_since_ms: 0, changes_30s: 0, prev_processing_tier: 'max_image' },
    temp_series_c: [80, 84, 89],
  });
  assert.ok(d.reasons.includes('tier_monotone_hold') || core.tierRank(d.processing_tier) >= core.tierRank('max_image'));
  assert.ok(core.tierRank(d.processing_tier) >= 1, 'no puede quedarse en max_image con 89 °C');
});

test('aceptación 3 · stutter_probability > 0.30 adelanta la degradación', () => {
  const base = {
    obs: { soc: 's905x4', thermal_status: 0, bitrate_bps: 12000000, resolution_class: '4k' },
    caps: { fps_lever: true, vpp_levers: true },
    state: { arm: 'A2', now_ms: 60000, arm_since_ms: 0, changes_30s: 0 },
  };
  const suave = core.decide(base);
  const conStutter = core.decide({
    features: {
      soc: { value: 's905x4', prov: 'measured_device', age_ms: 10, conf: 1 },
      thermal_status: { value: 0, prov: 'measured_device', age_ms: 10, conf: 1 },
      bitrate_bps: { value: 12000000, prov: 'measured_device', age_ms: 10, conf: 1 },
      resolution_class: { value: '4k', prov: 'measured_device', age_ms: 10, conf: 1 },
      stutter_probability: { value: 0.5, prov: 'derived', age_ms: 100, conf: 0.9 },
    },
    caps: { fps_lever: true, vpp_levers: true },
    state: { arm: 'A2', now_ms: 60000, arm_since_ms: 0, changes_30s: 0 },
  });
  assert.equal(conStutter.stutter_probability, 0.5);
  assert.ok(conStutter.proactive.includes('stutter_gt_0_3'));
  assert.ok(conStutter.post_step >= 2, 'post_step ≥ 2 con stutter 0.5');
  assert.ok(conStutter.fps_applied >= 1, 'FPS capado con stutter 0.5');
  assert.ok(conStutter.post_step >= suave.post_step, 'monótono frente al caso sin stutter');
});

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación 4 · anti-flap del blend dentro del dwell de D5
// ─────────────────────────────────────────────────────────────────────────────
test('aceptación 4 · no hay cambio de blend dentro del dwell (20 s) de D5', () => {
  const a = { P0: 0, P1: 1, P2: 0, P3: 0, P4: 0, P5: 0 };
  const b = { P0: 0, P1: 0, P2: 1, P3: 0, P4: 0, P5: 0 };
  // 5 s < 20 s ⇒ se conserva el anterior
  const early = core.applyBlendGate(a, b, { now_ms: 5000, blend_since_ms: 0 });
  assert.equal(early.held, true);
  assert.deepEqual(early.blend, a);
  // 25 s ≥ 20 s ⇒ se aplica el nuevo
  const late = core.applyBlendGate(a, b, { now_ms: 25000, blend_since_ms: 0 });
  assert.equal(late.held, false);
  assert.deepEqual(late.blend, b);
  // sin cambio ⇒ no hay nada que contener
  const same = core.applyBlendGate(a, Object.assign({}, a), { now_ms: 1000, blend_since_ms: 0 });
  assert.equal(same.held, false);
});

test('aceptación 4 · el brazo bloqueado por anti-flap no arrastra cambio de blend', () => {
  const base = {
    obs: { soc: 's905x4', thermal_status: 0, bitrate_bps: 15000000, resolution_class: '4k', vst_ms: 900 },
    caps: { fps_lever: true, vpp_levers: true },
    posteriors: { A0: [9, 1], A1: [5, 5], A2: [5, 5], A3: [5, 5], A4: [5, 5] },
    rng: [0.9, 0.5, 0.5, 0.5],
  };
  const dentro = core.decide(Object.assign({}, base, { state: { arm: 'A2', now_ms: 5000, arm_since_ms: 0 } }));
  const fuera = core.decide(Object.assign({}, base, { state: { arm: 'A2', now_ms: 30000, arm_since_ms: 0 } }));
  assert.ok(dentro.flags.includes('antiflap_hold'), 'dentro del dwell debe bloquear');
  assert.equal(dentro.arm, 'A2');
  assert.deepEqual(norm(dentro.blend), norm(fuera.blend), 'el blend no cambia si el brazo no cambia');
});

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación 5 · envoltura de features y `null` que no se convierte en 0
// ─────────────────────────────────────────────────────────────────────────────
test('aceptación 5 · cada feature entra como value/prov/age_ms/conf y null ⇒ unavailable', () => {
  const { features, missing } = core.normalizeFeatures({
    features: {
      vst_ms: { value: 1200, prov: 'measured_device', age_ms: 250, conf: 0.9 },
      cpu_temp_c: { value: null, prov: 'measured_device', age_ms: 0, conf: 0.9 },
      gpu_load_pct: null,
      stutter_probability: { value: 0.1, prov: 'derived', age_ms: 100, conf: 0.4 },
    },
  });
  assert.deepEqual(Object.keys(features).sort(), core.FEATURE_IDS.slice().sort());
  assert.deepEqual(features.vst_ms, { value: 1200, prov: 'measured_device', age_ms: 250, conf: 0.9 });
  // null declarado o ausente ⇒ SIEMPRE unavailable, nunca 0
  assert.deepEqual(features.cpu_temp_c, { value: null, prov: 'unavailable', age_ms: null, conf: 0 });
  assert.deepEqual(features.gpu_load_pct, { value: null, prov: 'unavailable', age_ms: null, conf: 0 });
  assert.ok(missing.includes('cpu_temp_c') && missing.includes('gpu_load_pct'));
  assert.ok(missing.includes('vpu_load_pct'), 'vpu no observado también es unavailable');
  // una feature stale (> 2× cadencia) no es usable para degradar
  assert.equal(core.usable({ value: 5, prov: 'measured_device', age_ms: 999999, conf: 1 }), false);
  // conf baja tampoco
  assert.equal(core.usable({ value: 5, prov: 'measured_device', age_ms: 0, conf: 0.1 }), false);
  // modeled no puede degradar imagen (D1 §9)
  assert.equal(core.usable({ value: 5, prov: 'modeled', age_ms: 0, conf: 1 }), false);
});

test('aceptación 5 · no se fabrica ningún número: sin dato no hay decisión inventada', () => {
  const d = core.decide({ features: {} });
  assert.equal(d.qoe_state, 'unknown');
  assert.equal(d.predicted_temp_c, null, 'sin termómetro no hay temperatura pronosticada');
  assert.equal(d.stutter_probability, null, 'sin sensor de stutter no hay probabilidad');
  assert.ok(d.features_missing.includes('cpu_temp_c'));
  assert.ok(d.features_missing.includes('gpu_load_pct'));
  // y aun así la política sale conservadora y válida
  assert.deepEqual(core.validateBlend(d.blend), []);
  assert.equal(d.blend.P2, 1);
});

test('aceptación 5 · la ruta v2 (envoltura) dispara el reflejo de stall igual que la ruta plana', () => {
  const d = core.decide({
    features: {
      soc: { value: 's905x4', prov: 'measured_device', age_ms: 5, conf: 1 },
      thermal_status: { value: 1, prov: 'measured_device', age_ms: 5, conf: 1 },
      stall: { value: true, prov: 'measured_device', age_ms: 40, conf: 1 },
      bitrate_bps: { value: 9000000, prov: 'measured_device', age_ms: 40, conf: 1 },
      resolution_class: { value: '4k', prov: 'measured_device', age_ms: 40, conf: 1 },
    },
    caps: { fps_lever: true, vpp_levers: true },
    state: { arm: 'A2', now_ms: 60000, arm_since_ms: 0, changes_30s: 0 },
  });
  assert.equal(d.arm, 'A4', 'stall ⇒ emergencia A4');
  assert.ok(d.post_step >= 7);
  assert.ok(d.reasons.includes('stall_reflex'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación 6 · no observado ⇒ unknown + prior P2; riskFromQoe([]) ≠ 0
// ─────────────────────────────────────────────────────────────────────────────
test('aceptación 6 · cliente no observado ⇒ unknown con prior P2 (no "sano")', () => {
  const d = core.decide({ obs: { soc: 's905x4' } });
  assert.equal(d.qoe_state, 'unknown');
  assert.deepEqual(norm(d.blend), norm({ P0: 0, P1: 0, P2: 1, P3: 0, P4: 0, P5: 0 }));
  assert.ok(d.reasons.includes('qoe_unknown_prior_P2'));
  assert.equal(core.toPolicyProfile(d).active, 'P2');
  assert.ok(core.toPolicyControls(d).flags.includes('qoe_unknown'), 'la frontera de política sí marca qoe_unknown');
});

test('aceptación 6 · riskFromQoe([]) NO produce 0 ni "no degradar"', () => {
  const vacio = core.riskFromQoe([]);
  assert.equal(vacio.risk, null, 'sin QoE el riesgo es desconocido, no 0');
  assert.equal(vacio.action, 'unknown_prior');
  assert.equal(vacio.profile, 'P2');
  const indef = core.riskFromQoe(undefined);
  assert.equal(indef.risk, null);
  const silencioso = core.riskFromQoe({ vst: 800, rebuffer: 0, err: 0, req: 120 });
  assert.equal(silencioso.risk, null, 'proxy sin señal tampoco es 0');
  assert.equal(silencioso.action, 'unknown_prior');
  // y cuando SÍ hay señal, el riesgo es real
  const malo = core.riskFromQoe({ vst: 7000, rebuffer: 12, err: 20, req: 100 });
  assert.ok(typeof malo.risk === 'number' && malo.risk > 0);
  assert.equal(malo.action, 'degrade');
  const real = core.riskFromQoe({ qoe_score: 30 });
  assert.equal(real.risk, 70);
});

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación 7 · sin ADB basta pm_thermal_status / ram / frame_drop_ratio
// ─────────────────────────────────────────────────────────────────────────────
test('aceptación 7 · sin ADB el core decide con pm_thermal_status + RAM + frame_drop', () => {
  const sinAdb = core.decide({
    features: {
      soc: { value: 's905x4', prov: 'measured_device', age_ms: 10, conf: 1 },
      thermal_status: { value: 3, prov: 'measured_device', age_ms: 10, conf: 1 }, // PM_THERMAL_STATUS SEVERE
      ram_available_pct: { value: 22, prov: 'measured_device', age_ms: 500, conf: 0.8 },
      frame_drop_ratio: { value: 0.03, prov: 'derived', age_ms: 500, conf: 0.9 },
      resolution_class: { value: '4k', prov: 'measured_device', age_ms: 500, conf: 1 },
    },
    caps: { fps_lever: true, vpp_levers: true },
    state: { arm: 'A2', now_ms: 60000, arm_since_ms: 0, changes_30s: 0 },
  });
  // no exige ni temperatura ni GPU/VPU
  assert.equal(sinAdb.features_missing.includes('cpu_temp_c'), true);
  assert.equal(sinAdb.features_missing.includes('gpu_load_pct'), true);
  assert.equal(sinAdb.features_missing.includes('vpu_load_pct'), true);
  // y aun así degrada por térmico: SEVERE ⇒ post≥6 y FPS capado
  assert.ok(sinAdb.post_step >= 6, 'SEVERE debe degradar post-proceso');
  assert.ok(sinAdb.fps_applied >= 1, 'SEVERE debe capar FPS');
  assert.ok(sinAdb.thermal.x_therm >= 0.75);
  assert.equal(sinAdb.predicted_temp_c, null, 'sin termómetro no se inventa °C');
});

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación 8 · soc desconocido / no canónico ⇒ conservador
// ─────────────────────────────────────────────────────────────────────────────
test('aceptación 8 · soc desconocido o no canónico ⇒ allowed=false, sin perfil alto y sin levers', () => {
  const casos = [
    { obs: { soc: 'rtk_rtd1319', thermal_status: 0, bitrate_bps: 12000000, resolution_class: '4k' } },
    { obs: { soc: '', thermal_status: 0, bitrate_bps: 12000000, resolution_class: '4k' } },
    { obs: {}, state: { cold: true } },
  ];
  for (const c of casos) {
    const d = core.decide(c);
    assert.equal(d.allowed, false, 'soc no admitido ⇒ allowed=false (fail-closed)');
    assert.deepEqual(d.levers, {}, 'sin levers');
    assert.equal(d.blend.P2, 1, 'prior P2');
    assert.equal(d.blend.P0, 0);
    assert.equal(d.blend.P1, 0, 'nunca perfil alto por defecto');
    assert.ok(d.reasons.includes('soc_unknown_fail_closed') || d.reasons.includes('soc_not_allowlisted'));
  }
});

test('aceptación 8 · el alias canónico sí se admite (amlogic_s905x4 → s905x4)', () => {
  const d = core.decide({
    obs: { soc: 'amlogic_s905x4', thermal_status: 0, bitrate_bps: 12000000, resolution_class: '4k' },
    caps: { fps_lever: true, vpp_levers: true },
  });
  assert.equal(d.soc, 's905x4');
  assert.equal(d.allowed, true);
  assert.ok(Object.keys(d.levers).length > 0, 'con SoC admitido los levers VPP viajan');
});

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación 9 · cero dependencias / I/O / red, y el estado serializable
// ─────────────────────────────────────────────────────────────────────────────
test('aceptación 9 · el núcleo no hace require, ni I/O, ni red, ni lee el reloj', () => {
  const src = fs.readFileSync(path.resolve(ROOT, 'ara-x', 'controller', 'ara_x_decision_core.js'), 'utf8');
  const prohibidos = [
    [/\brequire\s*\(/, 'require()'],
    [/\bimport\s+/, 'import'],
    [/\bDate\.now\s*\(/, 'Date.now()'],
    [/\bnew Date\s*\(/, 'new Date()'],
    [/\bprocess\.(env|argv|hrtime)/, 'process.*'],
    [/\bfetch\s*\(/, 'fetch()'],
    [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
    [/\bchild_process\b/, 'child_process'],
    [/\bhttps?\.(request|get)\b/, 'http(s).request'],
    [/\bnet\.(connect|createConnection)\b/, 'net.connect'],
    [/\bfs\.(read|write|open|stat)/, 'fs.*'],
    [/\bMath\.random\s*\(/, 'Math.random() (no determinista)'],
  ];
  for (const [re, nombre] of prohibidos) assert.ok(!re.test(src), 'el núcleo usa ' + nombre);
  // y no referencia ningún paquete instalado
  assert.ok(!/node_modules/.test(src), 'el núcleo referencia node_modules');
  assert.ok(!/from ['"][^./]/.test(src), 'el núcleo importa un paquete');
});

test('aceptación 9 · estado Thompson serializable (JSON puro, ida y vuelta estable)', () => {
  const st = core.initialState(1000);
  assert.equal(typeof st.blend, 'object');
  const json = core.serializeState(st);
  assert.equal(typeof json, 'string');
  const back = core.deserializeState(json);
  assert.deepEqual(norm(back), norm(st));
  // tras una actualización sigue siendo serializable (números, no BigInt)
  back.posteriors.A2 = core.updatePosterior(back.posteriors.A2, 0.8);
  back.samples += 1;
  const json2 = core.serializeState(back);
  assert.ok(json2.indexOf('n') === -1 || !/\d+n/.test(json2), 'sin literales BigInt');
  assert.deepEqual(norm(core.deserializeState(json2).posteriors.A2), norm(back.posteriors.A2));
  // estado incompatible se rechaza (fail-closed)
  assert.throws(() => core.deserializeState(JSON.stringify({ v: 99 })), /estado_incompatible/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Extras: predictores, tier, invariantes de política, política /sync
// ─────────────────────────────────────────────────────────────────────────────
test('predictor de red: Holt detecta el cruce del piso (V23) y no inventa sin muestras', () => {
  const r = core.predictNetwork(
    [{ dt_ms: 2000, bytes: 2250000, ttfb_ms: 400 }, { dt_ms: 2000, bytes: 2000000, ttfb_ms: 600 }, { dt_ms: 2000, bytes: 1500000, ttfb_ms: 900 }],
    12000000
  );
  assert.equal(r.forecast_bps, 8479710);
  assert.equal(r.breach, true);
  assert.equal(r.x_net, 0.2934);
  const vacio = core.predictNetwork([], 12000000);
  assert.equal(vacio.breach, false);
  assert.equal(vacio.samples, 0);
});

test('predictor térmico: pronostica °C con serie medida y banda con enum; nunca inventa °C', () => {
  const conSerie = core.predictThermal({ obs: { thermal_status: 2 }, temp_series_c: [70, 74, 78] });
  assert.ok(conSerie.predicted_temp_c !== null && conSerie.predicted_temp_c > 78);
  assert.equal(conSerie.source, 'measured_device');
  const soloEnum = core.predictThermal({ obs: { thermal_status: 4 } });
  assert.equal(soloEnum.predicted_temp_c, null, 'un enum no es un termómetro');
  assert.ok(soloEnum.predicted_band >= 0.9);
  const nada = core.predictThermal({ obs: {} });
  assert.equal(nada.predicted_temp_c, null);
  assert.equal(nada.predicted_band, null);
  assert.equal(nada.unknown, true);
});

test('tier de procesamiento: mapeo monótono y vocabulario del catálogo', () => {
  const tiers = [];
  for (let p = 0; p <= 9; p++) tiers.push(core.tierFromPost(p));
  assert.equal(tiers[0], 'max_image');
  assert.equal(tiers[9], 'minimal');
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(core.tierRank(tiers[i]) >= core.tierRank(tiers[i - 1]), 'tier debe ser monótono en post_step');
  }
  for (const t of tiers) assert.ok(['minimal', 'balanced', 'quality', 'max_image'].includes(t));
});

test('invariantes de política sobre 200 estados sintéticos (sin resolución, sin 8K, rangos del schema)', () => {
  const LEVERS = Object.keys(core.K.base_levers).sort();
  for (const s of sweepStates(200)) {
    const d = core.decide(s);
    // INV-1 · sin autoridad de resolución
    for (const k of Object.keys(d)) assert.ok(!/resolution|width|height/i.test(k), 'clave con resolución: ' + k);
    for (const lk of Object.keys(d.levers)) {
      assert.ok(!/resolution|width|height/i.test(lk), 'lever de resolución: ' + lk);
      assert.ok(LEVERS.includes(lk), 'lever fuera de allowlist: ' + lk);
    }
    // INV-2 · 8K nunca
    assert.notEqual(d.hdr_hint, undefined);
    assert.ok(['PQ', 'SDR'].includes(d.hdr_hint));
    // INV-4 · fail-closed
    if (d.allowed === false) assert.deepEqual(d.levers, {});
    // INV-5 · rangos del schema de política
    assert.ok(d.buffer_s >= 5 && d.buffer_s <= 120, 'buffer ' + d.buffer_s);
    assert.ok(d.abr_bw_factor >= 0.5 && d.abr_bw_factor <= 0.98, 'abr ' + d.abr_bw_factor);
    assert.ok(d.min_bitrate_bps >= 1000000 && d.min_bitrate_bps <= d.max_bitrate_bps && d.max_bitrate_bps <= 80000000);
    assert.ok(d.reconnect_attempts >= 1 && d.reconnect_attempts <= 500);
    assert.ok(d.live_delay_s >= 1 && d.live_delay_s <= 60);
    assert.ok([10, 20, 30].includes(d.sync_next_s));
    assert.ok(d.degrade_mask >= 0 && d.degrade_mask <= 65535);
    // INV-6 · sin sensor térmico: marcado y nunca A0
    if (d.thermal.x_therm === null) {
      assert.ok((d.degrade_mask & core.K.mask.THERMAL_UNKNOWN) !== 0);
      assert.notEqual(d.arm, 'A0');
    }
    // INV-7 · lo no aplicado no se declara aplicado
    if ((d.degrade_mask & core.K.mask.FPS_UNAVAILABLE) !== 0) assert.equal(d.fps_applied, 0);
    if (d.fps_applied === 0) assert.equal(d.fps_cap, 60);
    // blend válido en todo momento
    assert.deepEqual(core.validateBlend(d.blend), []);
  }
});

test('frontera de política: profile.active sólo P0-P5 y reason ≤ 64 chars', () => {
  for (const s of sweepStates(60)) {
    const p = core.toPolicyProfile(core.decide(s));
    assert.ok(['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].includes(p.active));
    assert.ok(p.reason.length >= 1 && p.reason.length <= 64, 'reason: ' + p.reason);
    assert.deepEqual(core.validateBlend(p.blend), []);
    const c = core.toPolicyControls(core.decide(s));
    assert.ok(Array.isArray(c.flags) && c.flags.length <= 16);
    for (const f of c.flags) assert.ok(f.length <= 48, 'flag demasiado larga: ' + f);
  }
});
