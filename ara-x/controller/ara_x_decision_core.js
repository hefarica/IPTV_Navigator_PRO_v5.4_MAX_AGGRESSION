'use strict';
/**
 * ara_x_decision_core.js — NÚCLEO DE DECISIÓN DEL ADC ARA-X (I1 / t13)
 * ═══════════════════════════════════════════════════════════════════════════
 * Implementa el contrato D5 (`ara-x/spec/ara_x_decision.md`) y lo extiende con lo
 * que pide I1: envoltorio de features `value/prov/age_ms/conf`, defuzzificación a
 * `blend` P0-P5, predictor térmico, predictor de red, `stutter_probability`,
 * `riskFromQoe()` sin el falso "0 = no degradar", estado Thompson serializable.
 *
 * API PURA Y DETERMINISTA
 *   - Cero dependencias (`require` de módulos nativos incluido: ninguno).
 *   - Cero I/O, cero red, cero reloj del sistema: `now_ms` se inyecta.
 *   - Misma entrada + misma semilla ⇒ misma salida bit a bit.
 *   - `K` es EXACTAMENTE el de D5: el digest de `decision_test_vectors.json` debe
 *     seguir casando (si no casa, los vectores están obsoletos: fail-closed).
 *
 * NO HACE (invariantes D5/D1):
 *   - No comanda resolución (INV-1), no emite wire 8K (INV-2).
 *   - No mueve `profile.active` P0-P5 por resolución: el `blend` sólo reparte peso
 *     entre perfiles declarados 4K-eligibles; los demás quedan a 0.
 *   - No inventa métricas: lo no medido es `null` + `prov='unavailable'` (INV-6).
 *
 * @see ara-x/spec/ara_x_decision.md   (contrato D5)
 * @see ara-x/spec/decision_test_vectors.json (26 vectores golden)
 * @see ara-x/vps/schema/sync_features.json   (vocabulario: prov, socs, tiers, thermal)
 */

// ───────────────────────────────────────────────────────────────────────────────
// 0 · Constantes del contrato — IDÉNTICAS a D5 (no tocar: rompe el digest)
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
    enum_band: [0.0, 0.25, 0.5, 0.75, 0.9, 1.0, 1.0],
    temp_soft_c: 65,
    temp_hard_c: 85,
    u_enum_only: 0.35,
    u_temp_only: 0.2,
    u_both: 0.1,
    u_none: 1.0,
    unknown_arm_min_idx: 1,
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
    unknown_thermal_input: 0.5,
  },
  ladders: {
    fps: [60, 30, 24],
    fps_L_cut: [0.4, 0.9],
    fps_u_cut: 0.8,
    thermal_fps: [[0.75, 1], [0.9, 2]],
    thermal_post: [[0.5, 3], [0.75, 6], [0.9, 8]],
    net_stress_cut: [0.5, 0.8],
    post_u: [0.6, 0.66, 0.72, 0.78, 0.84, 0.88, 0.92, 0.96, 1.01],
    post_count: 9,
  },
  arms: [
    { id: 'A0', buffer_s: 30, abr: 0.85, bias: 0, reconnect: 6, live_delay: 8 },
    { id: 'A1', buffer_s: 45, abr: 0.82, bias: 0, reconnect: 8, live_delay: 10 },
    { id: 'A2', buffer_s: 45, abr: 0.8, bias: 0, reconnect: 10, live_delay: 10 },
    { id: 'A3', buffer_s: 60, abr: 0.76, bias: 1, reconnect: 12, live_delay: 15 },
    { id: 'A4', buffer_s: 90, abr: 0.7, bias: 1, reconnect: 20, live_delay: 20 },
  ],
  thompson: { prior: [1.0, 1.0], decay: 0.995, floor: 0.5, logistic_k: 0.5513, u_clamp: 0.000001 },
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
    {},
    { ai_pq_mode: 2 },
    { ai_sr_level: 2 },
    { pq_sharpness_enable: 0 },
    { pq_ai_dnr_enable: 0, pq_dnr_enable: 0, pq_nr_enable: 0 },
    { pq_ai_fbc_enable: 0 },
    { ai_sr_level: 1 },
    { pq_hdr_mode: 0 },
    { pq_hdr_enable: 0 },
    { minimal_post_processing_allowed: 1, ai_sr_level: 0, aipq_enable: 0, pq_ai_sr_enable: 0 },
  ],
  mask: {
    FPS30: 1 << 0, FPS24: 1 << 1, AI_PQ_REDUCED: 1 << 2, SR_REDUCED: 1 << 3,
    SHARP_OFF: 1 << 4, DNR_OFF: 1 << 5, FBC_OFF: 1 << 6, HDR_MODE_OFF: 1 << 7,
    HDR_OFF: 1 << 8, MINIMAL_PP: 1 << 9, BUFFER_RAISED: 1 << 10, ABR_TIGHTENED: 1 << 11,
    THERMAL_UNKNOWN: 1 << 12, THERMAL_CRITICAL: 1 << 13, RES_LOSS_LOCK: 1 << 14,
    FPS_UNAVAILABLE: 1 << 15,
  },
};

// ───────────────────────────────────────────────────────────────────────────────
// 1 · Constantes PROPIAS de I1 (fuera de K para no alterar el digest de D5)
// ───────────────────────────────────────────────────────────────────────────────
const EXT = {
  /** Vocabulario de procedencia (sync_features.json › provenance). */
  PROV: ['measured_device', 'measured_server', 'derived', 'modeled', 'unavailable'],
  /** Procedencia mínima que puede degradar imagen (D1 §9). */
  PROV_CAN_DEGRADE: ['measured_device', 'measured_server', 'derived'],
  /** Frescura: age_ms > 2× cadencia de la fuente ⇒ stale (D5 §2). */
  AGE_MULT: 2,
  /** Perfiles con evidencia de resolución ≥ piso. R2 §: sólo P1 tiene 4K medido
   *  (`#EXT-X-CMAF` 3840x2160 en 808 canales); P3=1080p y P4=720p están PROHIBIDOS
   *  como destino. P0/P2/P5 no aparecen en el catálogo medido. */
  PROFILES_4K: ['P1'],
  /** Prior de D1 §9: sin observación ⇒ P2 + qoe_unknown. */
  PROFILE_PRIOR: 'P2',
  PROFILE_IDS: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'],
  /** Tier de procesamiento (sync_features.json › processing.tiers), de mejor a peor. */
  TIERS: ['max_image', 'quality', 'balanced', 'minimal'],
  /** post_step → tier (monótono no creciente en calidad). */
  TIER_BY_POST: ['max_image', 'quality', 'quality', 'balanced', 'balanced', 'balanced', 'balanced', 'minimal', 'minimal', 'minimal'],
  /** Umbrales del adelanto proactivo (I1: predicted_temp > 82 °C · stutter > 0.30). */
  PROACTIVE: { temp_c: 82, stutter: 0.3, temp_post_min: 6, stutter_post_min: 2 },
  /** Peso del reparto de blend por agresividad del brazo (A0 más «alto», A4 más bajo). */
  BLEND_ARM_WEIGHT: [1.0, 0.75, 0.5, 0.25, 0.1],
  EPS: 1e-9,
};

/** JSON canónico (claves ordenadas) — base del digest que comprueba el gate CI. */
function canon(o) {
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  if (o && typeof o === 'object') {
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
  }
  return JSON.stringify(o);
}

/**
 * Cadena canónica de las constantes. El sha256 lo calcula QUIEN verifica (el test
 * o el gate CI) para que este módulo no necesite ni un `require`: así «cero
 * dependencias» es literalmente comprobable leyendo el fuente.
 */
function canonicalConstants() {
  return canon(K);
}

// ───────────────────────────────────────────────────────────────────────────────
// 2 · Utilidades deterministas (sin estado, sin reloj)
// ───────────────────────────────────────────────────────────────────────────────
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const r4 = (x) => Math.round(x * 10000) / 10000;
const rint = (x) => Math.round(x);

function trapezoid(x, p) {
  const [a, b, c, d] = p;
  if (x <= a) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  if (x < d) return (d - x) / (d - c);
  return 0;
}

/** FNV-1a 64 bits de un string → BigInt (sin cripto: siembra determinista y barata). */
function fnv1a64(str) {
  const M = (1n << 64n) - 1n;
  let h = 0xcbf29ce484222325n;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h = (h ^ BigInt(s.charCodeAt(i))) & M;
    h = (h * 0x100000001b3n) & M;
  }
  return h;
}

/** PRNG xorshift128+ con semilla string arbitraria (FNV-1a 64). Determinista. */
function makeRng(seedStr) {
  const M = (1n << 64n) - 1n;
  const mix = (z) => {
    z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n & M;
    z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn & M;
    return (z ^ (z >> 31n)) & M;
  };
  const seed = fnv1a64(seedStr == null ? 'ara-x-dec' : seedStr);
  let s0 = mix(0x9e3779b97f4a7c15n ^ seed);
  let s1 = mix(s0 ^ 0xbf58476d1ce4e5b9n);
  return function next() {
    let x = s0;
    const y = s1;
    s0 = y;
    x ^= (x << 23n) & M;
    s1 = (x ^ y ^ (x >> 17n) ^ (y >> 26n)) & M;
    return Number(((s1 + y) & M) >> 11n) / 9007199254740992;
  };
}

function uStream(input) {
  if (Array.isArray(input.rng) && input.rng.length) {
    let i = 0;
    return () => (i < input.rng.length ? input.rng[i++] : 0.5);
  }
  if (typeof input.rng_seed === 'string' && input.rng_seed !== '') {
    const next = makeRng(input.rng_seed);
    return () => next();
  }
  return () => 0.5; // sin RNG: z=0 ⇒ el muestreo colapsa a la media (legible)
}

// ───────────────────────────────────────────────────────────────────────────────
// 3 · Envoltorio de features: value / prov / age_ms / conf  (INV-6)
// ───────────────────────────────────────────────────────────────────────────────
const FEATURE_IDS = [
  'vst_ms', 'rebuffer_events', 'rebuffer_ms', 'rebuffer_ratio', 'play_ms',
  'frame_drop_count', 'frame_drop_ratio', 'fps_declared', 'fps_effective',
  'buffer_ms', 'buffer_pct', 'bitrate_bps', 'throughput_bps', 'ttfb_ms', 'rtt_ms',
  'jitter_ms', 'err5xx_rate', 'err4xx_rate', 'thermal_status', 'cpu_temp_c', 'gpu_temp_c',
  'gpu_load_pct', 'vpu_load_pct', 'ram_available_pct', 'stutter_probability',
  'resolution_class', 'soc', 'player', 'content_type',
];

/** Normaliza un valor crudo a la envoltura canónica. `null` ⇒ prov=unavailable. */
function envelope(value, prov, age_ms, conf) {
  const isNull = value === null || value === undefined || value === '';
  const p = isNull ? 'unavailable' : (EXT.PROV.indexOf(prov) !== -1 ? prov : 'measured_device');
  return {
    value: isNull ? null : value,
    prov: p,
    age_ms: isNull ? null : (typeof age_ms === 'number' ? age_ms : 0),
    conf: isNull ? 0 : r4(clamp(typeof conf === 'number' ? conf : 1, 0, 1)),
  };
}

/** ¿La feature puede usarse para degradar imagen? (D1 §9) */
function usable(f, cadenceMs) {
  if (!f || f.value === null || f.prov === 'unavailable') return false;
  if (EXT.PROV_CAN_DEGRADE.indexOf(f.prov) === -1) return false;
  const cad = cadenceMs || K.cadence_ms.t1_fuse;
  if (typeof f.age_ms === 'number' && f.age_ms > EXT.AGE_MULT * cad) return false;
  return f.conf >= 0.3;
}

/** Adivina la procedencia de un valor plano (compatibilidad con D5/vectores). */
const PROV_HINT = {
  vst_ms: 'measured_device', rebuffer_events: 'measured_device', rebuffer_ms: 'measured_device',
  rebuffer_ratio: 'derived', play_ms: 'measured_device', frame_drop_count: 'measured_device',
  frame_drop_ratio: 'derived', fps_declared: 'measured_device', fps_effective: 'unavailable',
  buffer_ms: 'measured_device', buffer_pct: 'derived', bitrate_bps: 'measured_device',
  throughput_bps: 'measured_server', ttfb_ms: 'measured_server', rtt_ms: 'measured_server',
  jitter_ms: 'derived', err5xx_rate: 'measured_server', err4xx_rate: 'measured_server',
  thermal_status: 'measured_device', cpu_temp_c: 'measured_device', gpu_temp_c: 'measured_device',
  gpu_load_pct: 'unavailable', vpu_load_pct: 'unavailable', ram_available_pct: 'measured_device',
  stutter_probability: 'derived', resolution_class: 'measured_device', soc: 'measured_device',
  player: 'measured_device', content_type: 'lab_ssot',
};

function normalizeFeatures(input) {
  const src = (input && input.features) || {};
  const out = {};
  const missing = [];
  for (const id of FEATURE_IDS) {
    const raw = src[id];
    if (raw && typeof raw === 'object' && 'value' in raw) {
      out[id] = envelope(raw.value, raw.prov, raw.age_ms, raw.conf);
    } else if (raw === undefined || raw === null) {
      out[id] = envelope(null);
    } else {
      out[id] = envelope(raw, PROV_HINT[id] || 'measured_device');
    }
    if (out[id].prov === 'unavailable') missing.push(id);
  }
  if (src.stall && typeof src.stall === 'object' && 'value' in src.stall) {
    out.stall = envelope(src.stall.value, src.stall.prov || 'measured_device', src.stall.age_ms, src.stall.conf);
  } else if (typeof src.stall === 'boolean') {
    out.stall = envelope(src.stall, 'measured_device');
  }
  if (src.x_net && typeof src.x_net === 'object' && 'value' in src.x_net) {
    out.x_net = envelope(src.x_net.value, src.x_net.prov || 'derived', src.x_net.age_ms, src.x_net.conf);
  } else if (typeof src.x_net === 'number') {
    out.x_net = envelope(src.x_net, 'derived');
  }
  return { features: out, missing };
}

/** Proyecta una entrada estilo D5 (`{obs:{...}}`) a la envoltura v2. */
function featuresFromObs(obs) {
  const o = obs || {};
  const pick = (id, value, prov) => {
    if (value === undefined || value === null) return envelope(null);
    return envelope(value, prov || PROV_HINT[id] || 'measured_device');
  };
  const f = {};
  for (const id of FEATURE_IDS) f[id] = pick(id, o[id]);
  if (o.x_net !== undefined && o.x_net !== null) f.x_net = envelope(o.x_net, 'derived');
  // aproximaciones documentadas (D5 §3): conteo ⇒ ratio marcado como derived
  if (f.frame_drop_ratio.value === null && f.frame_drop_count.value !== null && f.fps_declared.value) {
    f.frame_drop_ratio = envelope(f.frame_drop_count.value / (f.fps_declared.value * 10), 'derived', 0, 0.5);
  }
  if (f.rebuffer_ratio.value === null && f.rebuffer_events.value !== null) {
    f.rebuffer_ratio = envelope(f.rebuffer_events.value / 5, 'derived', 0, 0.5);
  }
  return { features: f, missing: Object.keys(f).filter((k) => f[k].prov === 'unavailable') };
}

// ───────────────────────────────────────────────────────────────────────────────
// 4 · T1 · Red: EWMA + Holt (ARIMA-lite) y predictor de red
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
  for (const s of samples || []) {
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
  const hayMuestras = out.length > 0;
  return {
    inst_bps: last.ewma,
    ewma_bps: last.ewma,
    ttfb_ewma_ms: last.ttfb || 0,
    jitter_ewma_ms: last.jitter,
    forecast_bps: forecast,
    // sin muestras NO hay pronóstico: no se puede afirmar breach (null≠0)
    breach: hayMuestras && floor > 0 ? forecast < floor : false,
    x_net: hayMuestras && floor > 0 ? r4(clamp((floor - forecast) / floor, 0, 1)) : 0,
    samples: out.length,
  };
}

/** Predictor de red: mismo Holt, pero con nombre y contrato de salida explícitos. */
function predictNetwork(samples, floorBps) {
  const r = fuse(samples, floorBps);
  return {
    ewma_bps: r.ewma_bps,
    forecast_bps: r.forecast_bps,
    breach: r.breach,
    x_net: r.x_net,
    samples: r.samples,
    horizon_samples: K.fuse.holt_horizon,
    prov: 'measured_server',
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// 5 · T2 · Predictor térmico (enum 0..6 + temperatura si existe)
// ───────────────────────────────────────────────────────────────────────────────
function thermalFusion(obs) {
  const T = K.thermal;
  const hasEnum = typeof obs.thermal_status === 'number' && obs.thermal_status >= 0 && obs.thermal_status <= 6;
  const hasTemp = typeof obs.cpu_temp_c === 'number';
  let band = null;
  let u = T.u_none;
  if (hasEnum && hasTemp) {
    band = Math.max(T.enum_band[obs.thermal_status], clamp((obs.cpu_temp_c - T.temp_soft_c) / (T.temp_hard_c - T.temp_soft_c), 0, 1));
    u = T.u_both;
  } else if (hasEnum) {
    band = T.enum_band[obs.thermal_status];
    u = T.u_enum_only;
  } else if (hasTemp) {
    band = clamp((obs.cpu_temp_c - T.temp_soft_c) / (T.temp_hard_c - T.temp_soft_c), 0, 1);
    u = T.u_temp_only;
  }
  const unknown = band === null;
  return { x_therm: unknown ? null : r4(band), u_T: u, unknown };
}

/**
 * Predictor térmico (I1). Devuelve una temperatura PRONOSTICADA sólo si hay
 * serie de temperatura medida (ADB); si sólo hay enum, predice la BANDA y deja
 * `predicted_temp_c = null` — un enum no es un termómetro (R4 N5, R5 §14.3).
 */
function predictThermal(input) {
  const obs = (input && input.obs) || {};
  const series = (input && input.temp_series_c) || null;
  let predicted_temp_c = null;
  let slope_c_per_sample = 0;
  let source = 'none';
  if (Array.isArray(series) && series.length >= 2) {
    // Holt sobre la serie de temperatura (mismas alfas que la red: reutiliza el motor)
    let level = series[0];
    let trend = series[1] - series[0];
    for (let i = 1; i < series.length; i++) {
      const prev = level;
      level = K.fuse.holt_alpha * series[i] + (1 - K.fuse.holt_alpha) * (prev + trend);
      trend = K.fuse.holt_beta * (level - prev) + (1 - K.fuse.holt_beta) * trend;
    }
    slope_c_per_sample = r4(trend);
    predicted_temp_c = r4(level + K.fuse.holt_horizon * trend);
    source = 'measured_device';
  }
  const fused = thermalFusion(obs);
  // banda pronosticada: si hay temperatura pronosticada manda ella; si no, el enum.
  let predicted_band = fused.x_therm;
  if (predicted_temp_c !== null) {
    predicted_band = Math.max(
      typeof obs.thermal_status === 'number' ? K.thermal.enum_band[obs.thermal_status] : 0,
      clamp((predicted_temp_c - K.thermal.temp_soft_c) / (K.thermal.temp_hard_c - K.thermal.temp_soft_c), 0, 1)
    );
    predicted_band = r4(predicted_band);
  }
  return {
    predicted_temp_c,
    slope_c_per_sample,
    predicted_band,
    x_therm: fused.x_therm,
    u_T: fused.u_T,
    unknown: fused.unknown,
    source,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// 6 · `stutter_probability` — derivada y DECLARADA, nunca inventada
// ───────────────────────────────────────────────────────────────────────────────
/**
 * D1 §9: `stutter_probability` es `derived` y sólo puede degradar si sus
 * primitivas son `measured`. Aquí NO se recalcula desde los drops para el lazo
 * (sería contar dos veces la misma evidencia: el fuzzy ya usa `L`); se toma del
 * sensor si llega, y si no llega es `null`.
 */
function stutterProbability(features) {
  const f = features || {};
  const sp = f.stutter_probability;
  if (sp && sp.value !== null && usable(sp, K.cadence_ms.t2_fuzzy)) {
    return { value: r4(clamp(sp.value, 0, 1)), prov: sp.prov, source: 'sensor' };
  }
  return { value: null, prov: 'unavailable', source: 'absent' };
}

// ───────────────────────────────────────────────────────────────────────────────
// 7 · T2 · Fuzzy (12 reglas) y normalización
// ───────────────────────────────────────────────────────────────────────────────
function normalizeObs(obs) {
  const F = K.fuse;
  const th = thermalFusion(obs);
  const dropRatio = typeof obs.frame_drop_ratio === 'number'
    ? obs.frame_drop_ratio
    : typeof obs.frame_drop_count === 'number' && obs.fps_declared
      ? obs.frame_drop_count / (obs.fps_declared * 10)
      : null;
  const rebufRatio = typeof obs.rebuffer_ratio === 'number'
    ? obs.rebuffer_ratio
    : typeof obs.rebuffer_count === 'number' ? obs.rebuffer_count / 5
      : typeof obs.rebuffer_events === 'number' ? obs.rebuffer_events / 5
        : null;
  return {
    x_drop: dropRatio === null ? null : r4(clamp(dropRatio / F.drop_full, 0, 1)),
    x_rebuf: rebufRatio === null ? null : r4(clamp(rebufRatio / F.rebuf_full, 0, 1)),
    x_stall: obs.stall === true ? 1 : 0,
    x_net: typeof obs.x_net === 'number' ? r4(clamp(obs.x_net, 0, 1)) : 0,
    x_ttfb: typeof obs.ttfb_ewma_ms === 'number' ? r4(clamp((obs.ttfb_ewma_ms - F.ttfb_zero) / F.ttfb_span, 0, 1)) : null,
    x_jit: typeof obs.jitter_ewma_ms === 'number' ? r4(clamp(obs.jitter_ewma_ms / F.jitter_full, 0, 1)) : null,
    x_err: typeof obs.err5xx_rate === 'number' ? r4(clamp(obs.err5xx_rate / F.err_full, 0, 1)) : null,
    x_therm: th.x_therm,
    u_T: th.u_T,
    x_res: ['720p', '1080p', 'below'].indexOf(obs.resolution_class) !== -1 ? 1 : 0,
    ram_avail_pct: typeof obs.ram_available_pct === 'number' ? obs.ram_available_pct : null,
    vst_ms: typeof obs.vst_ms === 'number' ? obs.vst_ms : null,
  };
}

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
// 8 · T3 · Thompson (fraccional) con estado serializable
// ───────────────────────────────────────────────────────────────────────────────
function betaMeanSd(a, b) {
  const n = a + b;
  return { mean: a / n, sd: Math.sqrt((a * b) / (n * n * (n + 1))) };
}

function thompson(feasible, posteriors, nextU, state) {
  const k = K.thompson;
  const rows = [];
  for (const idx of feasible) {
    const arm = K.arms[idx];
    const p = (posteriors && posteriors[arm.id]) || k.prior;
    const { mean, sd } = betaMeanSd(p[0], p[1]);
    const u = clamp(nextU(), k.u_clamp, 1 - k.u_clamp);
    const z = k.logistic_k * Math.log(u / (1 - u));
    rows.push({ id: arm.id, idx, mean: r4(mean), sd: r4(sd), u: r4(u), sample: r4(mean + sd * z), n: r4(p[0] + p[1]) });
  }
  rows.sort((p, q) => (q.sample - p.sample) || (p.idx - q.idx));
  const chosen = rows[0];
  const now = typeof state.now_ms === 'number' ? state.now_ms : 0;
  const dwell_ok = typeof state.arm_since_ms === 'number' ? now - state.arm_since_ms >= K.antiflap.dwell_ms : false;
  const cool_ok = typeof state.cooldown_until_ms === 'number' ? now >= state.cooldown_until_ms : true;
  const lock_ok = typeof state.promote_lock_until_ms === 'number' ? now >= state.promote_lock_until_ms : true;
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
// 9 · SoC y tiers
// ───────────────────────────────────────────────────────────────────────────────
function socCanon(raw) {
  const s = String(raw == null ? '' : raw).toLowerCase().trim();
  return K.soc_alias[s] || 'unknown';
}
function socAllowed(raw) {
  const c = socCanon(raw);
  return K.soc_allowlist.indexOf(c) !== -1;
}
/** post_step → processing tier (monótono: a más degradación, menor tier). */
function tierFromPost(postStep) {
  const i = clamp(Math.round(postStep), 0, EXT.TIER_BY_POST.length - 1);
  return EXT.TIER_BY_POST[i];
}
function tierRank(tier) {
  const i = EXT.TIERS.indexOf(tier);
  return i === -1 ? EXT.TIERS.length : i;
}

// ───────────────────────────────────────────────────────────────────────────────
// 10 · Defuzzificación a `blend` P0-P5
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Reparte peso entre los perfiles declarados 4K-eligibles. Reglas:
 *   - Sólo se usan ids P0..P5 (schema) y NUNCA perfiles por debajo del piso:
 *     `allowed` por defecto es `['P1']` (único perfil con 4K medido en el catálogo R2).
 *   - Sin observación (`qoe_state==='unknown'`) o SoC no admitido ⇒ prior D1: `{P2:1}`.
 *   - Con varios perfiles admitidos, el peso se reparte por agresividad del brazo
 *     y se normaliza; con uno solo, `{P1:1}` (la variación va por tier/levers).
 */
function blendFrom(ctx) {
  const allowed = (ctx && Array.isArray(ctx.allowed_4k) && ctx.allowed_4k.length
    ? ctx.allowed_4k
    : EXT.PROFILES_4K).filter((p) => EXT.PROFILE_IDS.indexOf(p) !== -1);
  const zero = {};
  for (const id of EXT.PROFILE_IDS) zero[id] = 0;
  if (!ctx || ctx.qoe_state === 'unknown' || ctx.allowed === false || !allowed.length) {
    const b = Object.assign({}, zero);
    b[EXT.PROFILE_PRIOR] = 1;
    return b;
  }
  if (allowed.length === 1) {
    const b = Object.assign({}, zero);
    b[allowed[0]] = 1;
    return b;
  }
  // Reparto: base por agresividad del brazo (A0 = más «alto»), modulada por el post_step.
  const armIdx = K.arms.findIndex((a) => a.id === ctx.arm);
  const aggressiveness = EXT.BLEND_ARM_WEIGHT[armIdx < 0 ? 2 : armIdx] * (1 - 0.1 * clamp(ctx.post_step || 0, 0, 9) / 9);
  const sorted = allowed.slice().sort((a, b) => EXT.PROFILE_IDS.indexOf(a) - EXT.PROFILE_IDS.indexOf(b));
  const raw = sorted.map((p, i) => Math.max(0, aggressiveness - i * (1 / Math.max(1, sorted.length)) * 0.5));
  const sum = raw.reduce((s, v) => s + v, 0);
  const b = Object.assign({}, zero);
  if (sum <= 0) {
    b[sorted[0]] = 1;
    return b;
  }
  let acc = 0;
  sorted.forEach((p, i) => {
    const w = (i === sorted.length - 1) ? 1 - acc : raw[i] / sum;
    b[p] = Math.round(w * 1e9) / 1e9;
    acc += b[p];
  });
  return b;
}

/** Valida el contrato del blend (INV: ≥0, suma 1, sólo P0-P5). */
function validateBlend(blend) {
  const errs = [];
  if (!blend || typeof blend !== 'object') return ['blend_no_objeto'];
  const keys = Object.keys(blend);
  if (!keys.length) errs.push('blend_vacio');
  let sum = 0;
  for (const k of keys) {
    if (EXT.PROFILE_IDS.indexOf(k) === -1) errs.push('blend_id_invalido:' + k);
    const v = blend[k];
    if (typeof v !== 'number' || !isFinite(v)) errs.push('blend_no_numerico:' + k);
    else {
      if (v < 0) errs.push('blend_negativo:' + k);
      if (v > 1) errs.push('blend_gt1:' + k);
      sum += v;
    }
  }
  if (Math.abs(sum - 1) > 1e-6) errs.push('blend_suma:' + r4(sum));
  return errs;
}

// ───────────────────────────────────────────────────────────────────────────────
// 11 · T0-T4 · Decisión completa
// ───────────────────────────────────────────────────────────────────────────────
function leversFor(postStep, caps, socOk) {
  if (!caps.vpp_levers || !socOk) return {};
  const out = Object.assign({}, K.base_levers);
  for (let i = 1; i <= Math.min(postStep, K.post_steps.length - 1); i++) Object.assign(out, K.post_steps[i]);
  return out;
}

/** Normaliza la entrada: acepta `{obs, caps, state, posteriors, rng}` (D5) o `{features}` (v2). */
function prepareInput(input) {
  const i = input || {};
  const hasEnvelope = i.features && typeof i.features === 'object';
  const env = hasEnvelope ? normalizeFeatures(i) : featuresFromObs(i.obs || {});
  // Proyección de la envoltura al `obs` plano que consume el algoritmo D5.
  const f = env.features;
  const val = (id) => (f[id] && f[id].value !== null && usable(f[id], K.cadence_ms.t2_fuzzy) ? f[id].value : undefined);
  const obs = {
    frame_drop_ratio: val('frame_drop_ratio'),
    frame_drop_count: val('frame_drop_count'),
    rebuffer_ratio: val('rebuffer_ratio'),
    rebuffer_events: val('rebuffer_events'),
    stall: (i.obs && i.obs.stall === true) || (f.stall && f.stall.value === true && usable(f.stall, K.cadence_ms.t0_reflex)),
    x_net: val('x_net'),
    ttfb_ewma_ms: val('ttfb_ms'),
    jitter_ewma_ms: val('jitter_ms'),
    err5xx_rate: val('err5xx_rate'),
    vst_ms: val('vst_ms'),
    bitrate_bps: val('bitrate_bps'),
    resolution_class: val('resolution_class'),
    ram_available_pct: val('ram_available_pct'),
    fps_declared: val('fps_declared'),
    thermal_status: val('thermal_status'),
    cpu_temp_c: val('cpu_temp_c'),
    soc: val('soc'),
    player: val('player'),
  };
  // Overrides explícitos de D5 (compatibilidad con los 26 vectores): si el vector
  // trae `obs` plano, ese valor manda (el vector es el contrato, no la heurística).
  if (i.obs) {
    for (const k of Object.keys(i.obs)) {
      if (obs[k] === undefined && i.obs[k] !== null) obs[k] = i.obs[k];
    }
  }
  return { obs, features: f, missing: env.missing, input: i };
}

function decide(input) {
  const prep = prepareInput(input);
  const obs = prep.obs;
  const x = normalizeObs(obs);
  const caps = Object.assign({ fps_lever: false, vpp_levers: true, adb_sensors: false }, (input && input.caps) || {});
  const state = Object.assign({ arm: 'A2', now_ms: 0, arm_since_ms: 0, changes_30s: 0 }, (input && input.state) || {});
  const fz = fuzzy(x);
  const soc = socCanon(obs.soc);
  const socKnown = obs.soc !== undefined && String(obs.soc).trim() !== '';
  const socOk = K.soc_allowlist.indexOf(soc) !== -1;
  const flags = [];
  const reasons = [];
  let mask = 0;

  // ── predictores (I1) ──────────────────────────────────────────────────────
  const th = predictThermal({ obs, temp_series_c: (input && input.temp_series_c) || null });
  const stutter = stutterProbability(prep.features);
  const proactive = [];
  let predicted_temp_c = th.predicted_temp_c;
  // D5 también puede traer la predicción ya calculada por el sensor layer:
  if (predicted_temp_c === null && input && typeof input.predicted_temp_c === 'number') predicted_temp_c = input.predicted_temp_c;

  // ── T0 · térmico ─────────────────────────────────────────────────────────
  const thStatus = typeof obs.thermal_status === 'number' ? obs.thermal_status : null;
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

  // ── T2 · escalera FPS (rank-1) + térmico ──────────────────────────────────
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

  // ── I1 · adelanto proactivo (predictivo, NO duplica la evidencia del fuzzy) ──
  if (predicted_temp_c !== null && predicted_temp_c > EXT.PROACTIVE.temp_c) {
    fpsStep = Math.max(fpsStep, 1);
    postStep = Math.max(postStep, EXT.PROACTIVE.temp_post_min);
    proactive.push('predicted_temp_gt_82');
    flags.push('proactive_thermal');
    reasons.push('predicted_temp_gt_82');
  }
  if (stutter.value !== null && stutter.value > EXT.PROACTIVE.stutter) {
    fpsStep = Math.max(fpsStep, 1);
    postStep = Math.max(postStep, EXT.PROACTIVE.stutter_post_min);
    proactive.push('stutter_gt_0_3');
    flags.push('proactive_stutter');
    reasons.push('stutter_gt_0_3');
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

  // ── T3 · brazo ────────────────────────────────────────────────────────────
  const stressed = fpsStep > 0 || postStep > 0 || fz.N >= 0.5;
  let armIdx;
  let thom = null;
  const uNext = uStream(input || {});
  if (!stressed) {
    if (state.cold === true) {
      armIdx = Math.max(minIdx, 2);
      reasons.push('cold_start_fixed_arm');
    } else {
      const allowedArms = [];
      for (let i = 0; i < K.arms.length; i++) if (i >= minIdx && i <= 3) allowedArms.push(i);
      if (!allowedArms.length) allowedArms.push(minIdx);
      thom = thompson(allowedArms, (input && input.posteriors) || {}, uNext, state);
      const currentIdx = K.arms.findIndex((a) => a.id === state.arm);
      const g = thom.gates;
      const wantsChange = thom.chosen.idx !== currentIdx;
      const isPromote = thom.chosen.idx < currentIdx;
      const allow = isPromote
        ? g.dwell_ok && g.cool_ok && g.lock_ok && g.budget_ok && g.margin_ok && g.samples_ok
        : g.dwell_ok && g.budget_ok;
      if (wantsChange && !allow) {
        armIdx = Math.max(minIdx, currentIdx);
        flags.push('antiflap_hold');
        reasons.push('change_blocked');
      } else {
        armIdx = thom.chosen.idx;
        if (wantsChange) reasons.push(isPromote ? 'promote' : 'demote');
      }
    }
  } else {
    let forced = 2;
    if (fpsStep >= 1) forced = 2;
    if (fpsStep >= 2) forced = 3;
    if (postStep >= 3) forced = 3;
    if (postStep >= 7) forced = 4;
    if (fz.N >= K.ladders.net_stress_cut[1]) forced = Math.max(forced, 3);
    else if (fz.N >= K.ladders.net_stress_cut[0]) forced = Math.max(forced, 2);
    armIdx = Math.max(minIdx, forced);
    reasons.push('stressed_deterministic');
  }
  if (emergency) {
    armIdx = Math.max(armIdx, 4);
    reasons.push('emergency_override');
  }
  const arm = K.arms[armIdx];

  // ── fps aplicado / sustitución ────────────────────────────────────────────
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

  // ── tier: nunca sube dentro del mismo paso (monótono) ─────────────────────
  let postFinal = clamp(postStep + arm.bias, 0, K.ladders.post_count);
  let tier = tierFromPost(postFinal);
  const prevTier = (input && input.state && input.state.prev_processing_tier) || null;
  if (prevTier && proactive.length && tierRank(tier) < tierRank(prevTier)) {
    // el adelanto proactivo no puede MEJORAR el tier en el mismo paso
    tier = prevTier;
    reasons.push('tier_monotone_hold');
  }

  // ── máscara, buffer, abr, bitrate ─────────────────────────────────────────
  if (postFinal >= 1) mask |= K.mask.AI_PQ_REDUCED;
  if (postFinal >= 2) mask |= K.mask.SR_REDUCED;
  if (postFinal >= 3) mask |= K.mask.SHARP_OFF;
  if (postFinal >= 4) mask |= K.mask.DNR_OFF;
  if (postFinal >= 5) mask |= K.mask.FBC_OFF;
  if (postFinal >= 7) mask |= K.mask.HDR_MODE_OFF;
  if (postFinal >= 8) mask |= K.mask.HDR_OFF;
  if (postFinal >= 9) mask |= K.mask.MINIMAL_PP;

  const bufferBump = postFinal <= 2 ? 0 : postFinal <= 5 ? 10 : postFinal <= 8 ? 20 : 30;
  if (bufferBump > 0) mask |= K.mask.BUFFER_RAISED;
  const buffer_s = r4(clamp(arm.buffer_s + bufferBump, 5, 120));
  const abr = r4(clamp(arm.abr - 0.02 * Math.floor(postFinal / 3), 0.5, 0.98));
  if (postFinal >= 3) mask |= K.mask.ABR_TIGHTENED;

  const B = K.bitrate;
  const obsBps = typeof obs.bitrate_bps === 'number' ? obs.bitrate_bps : null;
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

  // ── qoe_state + blend ─────────────────────────────────────────────────────
  // "Sin observación" = no llegó NI UNA primitiva de playback (D1 §9: P2 + qoe_unknown).
  const QOE_PRIMITIVES = ['vst_ms', 'rebuffer_ratio', 'rebuffer_events', 'frame_drop_ratio',
    'frame_drop_count', 'bitrate_bps', 'fps_effective', 'buffer_ms'];
  const observedAny = QOE_PRIMITIVES.some((id) => {
    const feat = prep.features[id];
    return feat && feat.value !== null && feat.prov !== 'unavailable';
  });
  const qoe_state = observedAny ? 'observed' : 'unknown';
  if (qoe_state === 'unknown') {
    reasons.push('qoe_unknown_prior_P2');
  }
  const blend = blendFrom({
    allowed_4k: (input && input.allowed_4k) || EXT.PROFILES_4K,
    qoe_state,
    allowed: socOk,
    arm: arm.id,
    post_step: postFinal,
  });

  return {
    // ── salida estilo D5 (los 26 vectores la comprueban) ──
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
    _sampled: thom ? thom.rows.map((r) => r.id) : [],
    // ── extensiones I1 ──
    processing_tier: tier,
    blend,
    qoe_state,
    predicted_temp_c,
    predicted_band: th.predicted_band,
    stutter_probability: stutter.value,
    proactive,
    features_missing: prep.missing.slice(),
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// 12 · Recompensa, posterior y estado serializable
// ───────────────────────────────────────────────────────────────────────────────
function reward(obs, applied) {
  const R = K.reward;
  const o = obs || {};
  const x = normalizeObs(o);
  const fpsNorm = applied ? applied.fps_applied / 2 : 0;
  const postNorm = applied ? applied.post_step / K.ladders.post_count : 0;
  const stepNorm = 0.5 * fpsNorm + 0.5 * postNorm;
  const vstPen = x.vst_ms === null ? 0 : clamp((x.vst_ms - K.fuse.vst_zero) / K.fuse.vst_span, 0, 1);
  const thermalPen = x.x_therm === null ? K.thermal.uncertain_penalty : clamp((x.x_therm - 0.5) / 0.5, 0, 1);
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
  return [
    r4(Math.max(T.floor, p[0] * T.decay + r)),
    r4(Math.max(T.floor, p[1] * T.decay + (1 - r))),
  ];
}

/** Estado Thompson serializable (sólo JSON: números, strings, booleanos). */
function initialState(nowMs) {
  const posteriors = {};
  for (const a of K.arms) posteriors[a.id] = K.thompson.prior.slice();
  return {
    v: 1,
    now_ms: typeof nowMs === 'number' ? nowMs : 0,
    arm: 'A2',
    arm_since_ms: 0,
    changes_30s: 0,
    cooldown_until_ms: 0,
    promote_lock_until_ms: 0,
    prev_processing_tier: null,
    blend: Object.assign({ P0: 0, P1: 0, P2: 1, P3: 0, P4: 0, P5: 0 }),
    blend_since_ms: 0,
    cold: true,
    posteriors,
    samples: 0,
  };
}

function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(json) {
  const s = typeof json === 'string' ? JSON.parse(json) : json;
  if (!s || s.v !== 1) throw new Error('estado_incompatible');
  const out = initialState(s.now_ms);
  Object.assign(out, s);
  for (const a of K.arms) {
    const p = (s.posteriors && s.posteriors[a.id]) || K.thompson.prior;
    out.posteriors[a.id] = [Number(p[0]), Number(p[1])];
  }
  return out;
}

/**
 * Anti-flap específico del blend (I1 · aceptación 4): si cambia el blend dentro
 * del dwell de D5, se conserva el anterior y se reporta `blend_flap_hold`.
 */
function applyBlendGate(prev, next, state) {
  const errs = validateBlend(next);
  if (errs.length) return { blend: prev || next, held: false, errors: errs };
  if (!prev) return { blend: next, held: false, errors: [] };
  const same = EXT.PROFILE_IDS.every((p) => Math.abs((prev[p] || 0) - (next[p] || 0)) < EXT.EPS);
  if (same) return { blend: next, held: false, errors: [] };
  const now = typeof state.now_ms === 'number' ? state.now_ms : 0;
  const since = typeof state.blend_since_ms === 'number' ? state.blend_since_ms : 0;
  if (now - since < K.antiflap.dwell_ms) return { blend: prev, held: true, errors: [] };
  return { blend: next, held: false, errors: [] };
}

// ───────────────────────────────────────────────────────────────────────────────
// 13 · `riskFromQoe` — el falso "0 = no degradar" (aceptación 6)
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Espejo honesto de `ape_mesh.php::ape_risk_from_qoe()`: cuando NO hay QoE
 * devuelve **desconocido**, no 0. `0` significaba «no degradar», indistinguible
 * de un cliente perfecto (R4-F09 / D1 §9: «unknown no es sano»).
 */
function riskFromQoe(qoe) {
  if (!qoe || (typeof qoe === 'object' && Object.keys(qoe).length === 0)) {
    return { risk: null, action: 'unknown_prior', profile: EXT.PROFILE_PRIOR, qoe_state: 'unknown', source: 'none' };
  }
  if (typeof qoe.qoe_score === 'number') {
    const risk = clamp(100 - qoe.qoe_score, 0, 100);
    return { risk: r4(risk), action: risk >= 50 ? 'degrade' : risk > 0 ? 'watch' : 'hold', profile: null, qoe_state: 'observed', source: 'real' };
  }
  let risk = 0;
  if (typeof qoe.vst === 'number') risk += qoe.vst > 6000 ? 45 : qoe.vst > 3000 ? 25 : qoe.vst > 1500 ? 10 : 0;
  if (typeof qoe.rebuffer === 'number') risk += qoe.rebuffer > 10 ? 40 : qoe.rebuffer > 3 ? 22 : qoe.rebuffer > 0 ? 8 : 0;
  if (typeof qoe.req === 'number' && qoe.req > 0 && typeof qoe.err === 'number' && qoe.err > 0) {
    const rate = qoe.err / qoe.req;
    risk += rate > 0.1 ? 30 : rate > 0.03 ? 15 : 0;
  }
  if (risk === 0) {
    // proxy sin señal: no es 0, es «no concluyente»
    return { risk: null, action: 'unknown_prior', profile: EXT.PROFILE_PRIOR, qoe_state: 'unknown', source: 'proxy_silent' };
  }
  return { risk: r4(clamp(risk, 0, 100)), action: risk >= 50 ? 'degrade' : 'watch', profile: null, qoe_state: 'observed', source: 'proxy' };
}

// ───────────────────────────────────────────────────────────────────────────────
// 14 · Etiqueta de política (para el ensamblado /sync de D3/D4)
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Controles para la política /sync. Aquí —y sólo aquí— se añade el token
 * `qoe_unknown` que exige D1 §9, para no alterar el contrato congelado de D5.
 */
function toPolicyControls(decision) {
  const flags = (decision.flags || []).slice();
  if (decision.qoe_state === 'unknown' && flags.indexOf('qoe_unknown') === -1) flags.push('qoe_unknown');
  return { flags: flags.slice(0, 16), sync_next_s: decision.sync_next_s, degrade_mask: decision.degrade_mask };
}

function toPolicyProfile(decision) {
  const blend = decision.blend;
  const ids = Object.keys(blend).filter((k) => blend[k] > 0);
  const active = ids.length === 1 ? ids[0] : EXT.PROFILE_PRIOR;
  return { active, blend: Object.assign({}, blend), reason: (decision.reasons[0] || 'no_action').slice(0, 64) };
}

// ───────────────────────────────────────────────────────────────────────────────
// 15 · Adaptador para `decision_test_vectors.json`
// ───────────────────────────────────────────────────────────────────────────────
function decideFromVector(v) {
  if (!v) throw new Error('vector_requerido');
  return decide({
    obs: v.obs || {},
    caps: v.caps,
    state: v.state,
    posteriors: v.posteriors,
    rng: v.rng,
    rng_seed: v.rng_seed,
    predicted_temp_c: v.predicted_temp_c,
    stutter_probability: v.stutter_probability,
  });
}

module.exports = {
  SPEC, K, EXT, FEATURE_IDS, canonicalConstants, fnv1a64,
  // features
  envelope, normalizeFeatures, featuresFromObs, usable,
  // niveles
  fuse, predictNetwork, thermalFusion, predictThermal, stutterProbability,
  normalizeObs, fuzzy,
  // decisión
  decide, decideFromVector,
  thompson, socCanon, socAllowed, tierFromPost, tierRank,
  blendFrom, validateBlend, applyBlendGate,
  reward, updatePosterior, initialState, serializeState, deserializeState,
  riskFromQoe, toPolicyProfile, toPolicyControls,
  // utilidades
  clamp, r4, rint, makeRng,
};
