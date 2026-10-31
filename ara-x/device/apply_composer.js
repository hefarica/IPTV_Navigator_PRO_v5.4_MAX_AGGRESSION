'use strict';

/**
 * apply_composer.js — I4 · compositor de payload de aplicación en device (JS de referencia).
 *
 * Traduce la decisión del ADC (política `/sync`) a las DOS superficies reales que existen:
 *   1) `device_settings` — filas "<ns> <key> <val>" que consume el APK vía `SettingsApplier`
 *      (misma forma que `ape_mesh_device_settings()`); es lo único que acaba en el device.
 *   2) `POST /a/cfg` — cuerpo JSON por sesión (loopback del VPS; alimenta `/a/` para players).
 *      NO lo consume el APK: aquí sólo se compone y se valida el presupuesto.
 *
 * Reglas duras (todas verificadas por `ara-x/tests/device_apply.test.js`):
 *  · SOLO claves de `ara-x/spec/actuator_allowlist.json` (29) y, para levers, las 13 de
 *    `settings_allowlist.vpp_levers` — igual que el cliente `/sync`.
 *  · Sin claves duplicadas: cada clave aparece UNA vez (base y lever se deduplican).
 *  · Fail-closed: SoC no medido / no canónico / mismatch / política inválida ⇒ `allowed:false`,
 *    `rows: []` y razón tipada. Nunca se aplica "la mitad" de una política dudosa.
 *  · `never_downscale` obligatorio (truth-guard 8K/4K-only) y wire 8K prohibido.
 *  · No toca RESOLUTION/CODECS/BANDWIDTH, no emite props ni namespaces inventados, no usa ADB,
 *    no hardcodea serial/chip y NO usa `buffer_health_pct` (modelo de red) como buffer del player.
 *
 * Dependencias: 0 (sólo `fs`/`path` para leer los specs del repo).
 */

const fs = require('fs');
const path = require('path');

const SPEC_DIR = path.join(__dirname, '..', 'spec');
const ALLOWLIST_PATH = path.join(SPEC_DIR, 'actuator_allowlist.json');
const LEVER_MAP_PATH = path.join(SPEC_DIR, 'lever_namespace_map.json');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const ALLOWLIST = readJson(ALLOWLIST_PATH);
const LEVER_MAP = readJson(LEVER_MAP_PATH);

// ── allowlist de record (R5) ──────────────────────────────────────────────────
const DEVICE_KEYS = ALLOWLIST.settings_allowlist.device_applier.keys;
const VPP_LEVERS = ALLOWLIST.settings_allowlist.vpp_levers.keys;
const ALLOWED = new Set(DEVICE_KEYS.map((k) => k.key));
const LEVERS = new Set(VPP_LEVERS);
const DOMAIN = new Map(DEVICE_KEYS.map((k) => [k.key, new RegExp(k.regex)]));

// ── metadatos por clave (D4: tier, ns, techo térmico, prohibición) ────────────
const MAP_ROWS = LEVER_MAP.keys;
if (MAP_ROWS.length !== DEVICE_KEYS.length) {
  throw new Error('E_SPEC_DRIFT: lever_namespace_map y actuator_allowlist no tienen las mismas claves');
}
const KEY_META = new Map();
for (const row of MAP_ROWS) {
  if (!ALLOWED.has(row.key)) throw new Error('E_SPEC_DRIFT: clave del mapa fuera de la allowlist: ' + row.key);
  KEY_META.set(row.key, {
    key: row.key,
    tier: row.tier,
    ns_hint: row.ns_hint || 'global',
    forbidden: row.forbidden_by_contract === true,
    reachable: row.reachable_from_policy === true,
    ceiling: row.ceiling_by_tier || null
  });
}

// ── SoC: canónico + alias (una sola fuente; se cruzan los dos artefactos) ─────
const CANON_SOCS = LEVER_MAP.soc.canonical.slice();
const ALLOWLIST_SOCS = ALLOWLIST.soc_gate.default_allow.slice();
if (CANON_SOCS.slice().sort().join(',') !== ALLOWLIST_SOCS.slice().sort().join(',')) {
  throw new Error('E_SPEC_DRIFT: soc.canonical != soc_gate.default_allow');
}
const SOC_ALIASES = Object.assign({}, LEVER_MAP.soc.alias);
const NO_WIRE_8K = Array.isArray(LEVER_MAP.soc.no_wire_8k) ? LEVER_MAP.soc.no_wire_8k.slice() : CANON_SOCS.slice();

// ── tiers y constantes ───────────────────────────────────────────────────────
const TIERS = ['minimal', 'balanced', 'quality', 'max_image'];   // = sync_features.processing.tiers
const FPS_TARGETS = [24, 30, 60];
const CFG_KEYS = ['pq', 'hdr', 'ua_mode', 'referer_mode', 'source_format', 'audio_codec', 'bit_depth'];
const BASE_ROWS = [
  ['hdr_conversion_mode', 1],              // T0
  ['match_content_frame_rate', 1],         // T1
  ['minimal_post_processing_allowed', 0]   // T2
];
const INVERT_CLAMP = new Set(['minimal_post_processing_allowed']); // 0 es MÁS agresivo que 1
for (const [k] of BASE_ROWS) {
  if (!ALLOWED.has(k)) throw new Error('E_SPEC_DRIFT: fila base fuera de la allowlist: ' + k);
}
const LIMITS = Object.freeze({
  max_cfg_bytes: 65536,     // = client_max_body_size 64k y MAX_BODY del Lua
  max_rows: 16,             // presupuesto Never-Drop de D4
  ttl_default_s: 300,       // TTL_DEFAULT del Lua
  ttl_min_s: 1,
  ttl_max_s: 3600,          // TTL_MAX del Lua
  thermal_min_c: 55,
  thermal_max_c: 85
});

const ERRORS = Object.freeze({
  SOC_NOT_MEASURED: 'E_SOC_NOT_MEASURED',
  SOC_UNMAPPED: 'E_SOC_UNMAPPED',
  SOC_MISMATCH: 'E_SOC_MISMATCH',
  KEY_NOT_ALLOWED: 'E_KEY_NOT_ALLOWED',
  KEY_FORBIDDEN: 'E_KEY_FORBIDDEN',
  LEVER_NOT_IN_ALLOWLIST: 'E_LEVER_NOT_IN_ALLOWLIST',
  VALUE_OUT_OF_DOMAIN: 'E_VALUE_OUT_OF_DOMAIN',
  WIRE_8K: 'E_WIRE_8K',
  NEVER_DOWNSCALE: 'E_NEVER_DOWNSCALE_REQUIRED',
  CFG_TOO_LARGE: 'E_CFG_TOO_LARGE',
  CFG_DUPLICATE_KEY: 'E_CFG_DUPLICATE_KEY',
  CFG_BAD_KEY: 'E_CFG_BAD_KEY',
  CFG_BAD_VALUE: 'E_CFG_BAD_VALUE',
  TTL_OUT_OF_RANGE: 'E_TTL_OUT_OF_RANGE',
  DEVICE_NOT_ALLOWED: 'E_DEVICE_NOT_ALLOWED',
  FORBIDDEN_FIELD: 'E_FORBIDDEN_FIELD'
});

// ── helpers ──────────────────────────────────────────────────────────────────
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const deSep = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Resuelve un SoC crudo al token canónico (o null). Acepta guion/underscore/mayúsculas. */
function resolveSoc(raw) {
  if (typeof raw !== 'string') return { raw: raw === undefined ? null : raw, canonical: null, alias_used: null };
  const trimmed = raw.trim();
  if (trimmed === '') return { raw, canonical: null, alias_used: null };
  const lower = trimmed.toLowerCase();
  if (CANON_SOCS.indexOf(lower) !== -1) return { raw: trimmed, canonical: lower, alias_used: null };
  if (SOC_ALIASES[lower]) return { raw: trimmed, canonical: SOC_ALIASES[lower], alias_used: trimmed };
  const d = deSep(lower);
  for (const alias of Object.keys(SOC_ALIASES)) {
    if (deSep(alias) === d) return { raw: trimmed, canonical: SOC_ALIASES[alias], alias_used: trimmed };
  }
  for (const c of CANON_SOCS) if (deSep(c) === d) return { raw: trimmed, canonical: c, alias_used: trimmed };
  return { raw: trimmed, canonical: null, alias_used: null };
}

/** Pasos térmicos: SOLO con prov=measured. `unavailable` ⇒ 0 (null != frío). */
function thermalSteps(thermal, limits) {
  if (!isPlainObject(thermal) || thermal.prov !== 'measured') {
    return { steps: 0, prov: (thermal && thermal.prov) || 'unavailable', source: 'none' };
  }
  if (typeof thermal.temp_c === 'number' && isPlainObject(limits) &&
      ['light_c', 'moderate_c', 'severe_c', 'critical_c'].every((k) => Number.isInteger(limits[k]))) {
    if (thermal.temp_c >= limits.critical_c) return { steps: 3, prov: 'measured', source: 'temp_c' };
    if (thermal.temp_c >= limits.severe_c) return { steps: 2, prov: 'measured', source: 'temp_c' };
    if (thermal.temp_c >= limits.moderate_c) return { steps: 1, prov: 'measured', source: 'temp_c' };
    return { steps: 0, prov: 'measured', source: 'temp_c' };
  }
  const st = thermal.status;
  if (typeof st !== 'number') return { steps: 0, prov: 'measured', source: 'status_none' };
  const steps = st <= 1 ? 0 : st === 2 ? 1 : st <= 4 ? 2 : 3;
  return { steps, prov: 'measured', source: 'pm_thermal_status' };
}

function validThermalLimits(limits) {
  if (!isPlainObject(limits)) return null;
  const keys = ['light_c', 'moderate_c', 'severe_c', 'critical_c'];
  let prev = LIMITS.thermal_min_c - 1;
  const out = {};
  for (const k of keys) {
    const v = limits[k];
    if (!Number.isInteger(v) || v < LIMITS.thermal_min_c || v > LIMITS.thermal_max_c || v <= prev) return null;
    out[k] = v;
    prev = v;
  }
  return out;
}

function lowerTier(tier, steps) {
  const i = TIERS.indexOf(tier);
  if (i < 0) return TIERS[0];
  return TIERS[Math.max(0, i - steps)];
}

/** Cuenta claves repetidas en un texto JSON plano (detección de "clave duplicada"). */
function findDuplicateJsonKeys(text) {
  const seen = new Map();
  const re = /"([A-Za-z0-9_]+)"\s*:/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const k = m[1];
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

function assertBytes(text, limit, code) {
  const bytes = Buffer.byteLength(String(text), 'utf8');
  if (bytes > limit) {
    const err = new Error((code || ERRORS.CFG_TOO_LARGE) + ': ' + bytes + ' B > ' + limit + ' B');
    err.code = code || ERRORS.CFG_TOO_LARGE;
    err.bytes = bytes;
    err.limit = limit;
    throw err;
  }
  return bytes;
}

/** Nombres de campo prohibidos en CUALQUIER salida (RESOLUTION/CODECS/BANDWIDTH/URL/props). */
const FORBIDDEN_FIELD_RE = /^(resolution|resolutions|codecs?|bandwidth|average_bandwidth|width|height|url|uri|segment|prop|props|setprop|getprop|serial|chip|soc_serial)$/i;

function scanForbiddenFields(value, basePath = '$') {
  const hits = [];
  const walk = (v, p) => {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach((item, i) => walk(item, p + '[' + i + ']')); return; }
    for (const k of Object.keys(v)) {
      if (FORBIDDEN_FIELD_RE.test(k)) hits.push(p + '.' + k);
      walk(v[k], p + '.' + k);
    }
  };
  walk(value, basePath);
  return hits;
}

// ── /a/cfg ───────────────────────────────────────────────────────────────────
/**
 * Compone el cuerpo de `POST /a/cfg` (loopback del VPS).
 * @param {{session:string, values:object, ttl?:number, limits?:object}} args
 */
function composeCfg(args) {
  const a = args || {};
  const lim = Object.assign({}, LIMITS, a.limits || {});
  const session = typeof a.session === 'string' ? a.session.trim() : '';
  const errors = [];
  if (!session) errors.push({ code: ERRORS.CFG_BAD_KEY, detail: 'session' });

  const values = isPlainObject(a.values) ? a.values : {};
  const out = {};
  for (const k of Object.keys(values)) {
    if (CFG_KEYS.indexOf(k) === -1) { errors.push({ code: ERRORS.CFG_BAD_KEY, detail: k }); continue; }
    const v = values[k];
    if (!Number.isInteger(v) || v < -1000 || v > 1000) { errors.push({ code: ERRORS.CFG_BAD_VALUE, detail: k }); continue; }
    out[k] = v;
  }

  // TTL: declarado y acotado (el Lua lo clampa igual: [1,3600], default 300)
  let ttl = a.ttl === undefined ? lim.ttl_default_s : a.ttl;
  if (!Number.isInteger(ttl)) { errors.push({ code: ERRORS.TTL_OUT_OF_RANGE, detail: 'ttl' }); ttl = lim.ttl_default_s; }
  const ttl_s = Math.min(lim.ttl_max_s, Math.max(lim.ttl_min_s, ttl));
  out.ttl = ttl_s;

  const body = JSON.stringify(out);
  const dup = findDuplicateJsonKeys(body);
  for (const d of dup) errors.push({ code: ERRORS.CFG_DUPLICATE_KEY, detail: d });

  let bytes = Buffer.byteLength(body, 'utf8');
  try { bytes = assertBytes(body, lim.max_cfg_bytes, ERRORS.CFG_TOO_LARGE); }
  catch (e) { errors.push({ code: e.code, detail: e.bytes + '>' + e.limit, bytes: e.bytes, limit: e.limit }); }

  return {
    ok: errors.length === 0,
    session,
    body,
    bytes,
    ttl_s,
    ttl_declared: a.ttl !== undefined,
    keys: Object.keys(out).filter((k) => k !== 'ttl'),
    errors
  };
}

/** Valida un cuerpo `/a/cfg` ya serializado (round-trip y detección de duplicados). */
function parseCfgBody(text, limits) {
  const lim = Object.assign({}, LIMITS, limits || {});
  const errors = [];
  const raw = String(text == null ? '' : text);
  const bytes = Buffer.byteLength(raw, 'utf8');
  if (bytes > lim.max_cfg_bytes) errors.push({ code: ERRORS.CFG_TOO_LARGE, detail: bytes + '>' + lim.max_cfg_bytes });

  const dup = findDuplicateJsonKeys(raw);
  for (const d of dup) errors.push({ code: ERRORS.CFG_DUPLICATE_KEY, detail: d });

  let obj = null;
  try { obj = JSON.parse(raw); } catch (e) { errors.push({ code: ERRORS.CFG_BAD_VALUE, detail: 'json' }); }

  if (isPlainObject(obj)) {
    for (const k of Object.keys(obj)) {
      if (CFG_KEYS.indexOf(k) === -1 && k !== 'ttl') errors.push({ code: ERRORS.CFG_BAD_KEY, detail: k });
      if (!Number.isInteger(obj[k])) errors.push({ code: ERRORS.CFG_BAD_VALUE, detail: k });
    }
    if (!Number.isInteger(obj.ttl)) errors.push({ code: ERRORS.TTL_OUT_OF_RANGE, detail: 'ttl_missing' });
  }
  return { ok: errors.length === 0, bytes, value: obj, errors };
}

// ── composición principal ────────────────────────────────────────────────────
/**
 * @param {{policy:object, measured:object, cfg?:object, current?:object, limits?:object}} input
 * @returns {object} composición (rows = device_settings, cfg = POST /a/cfg o null)
 */
function compose(input) {
  const inp = input || {};
  const lim = Object.assign({}, LIMITS, inp.limits || {});
  const policy = isPlainObject(inp.policy) ? inp.policy : {};
  const measured = isPlainObject(inp.measured) ? inp.measured : {};
  const errors = [];
  const warnings = [];
  const skipped = [];
  const clamped = [];
  const ignored_inputs = [];

  // S1 · SoC MEDIDO obligatorio (nunca de la política, nunca de un serial hardcodeado)
  const rawSoc = measured.soc !== undefined ? measured.soc : measured.soc_raw;
  const soc = resolveSoc(rawSoc);
  if (rawSoc === undefined || rawSoc === null || String(rawSoc).trim() === '') {
    errors.push({ code: ERRORS.SOC_NOT_MEASURED });
  }

  // R4-F05: identidad por serial/chip se IGNORA explícitamente (no se hardcodea, no se emite)
  for (const k of ['serial', 'serial_number', 'chip', 'soc_serial', 'device_serial']) {
    if (Object.prototype.hasOwnProperty.call(measured, k) || Object.prototype.hasOwnProperty.call(policy, k)) {
      ignored_inputs.push(k);
    }
  }

  // R4-F05: buffer_health_pct es un modelo de red, no el buffer del player
  let buffer_ms = null;
  if (isPlainObject(measured.player_runtime) && typeof measured.player_runtime.buffer_ms === 'number') {
    buffer_ms = measured.player_runtime.buffer_ms;
  }
  const bhp = (isPlainObject(measured.player) && measured.player.buffer_health_pct) ||
              (isPlainObject(measured.player_runtime) && measured.player_runtime.buffer_health_pct) ||
              (isPlainObject(measured.metrics) && measured.metrics.buffer_health_pct);
  if (bhp !== undefined && bhp !== null) { ignored_inputs.push('buffer_health_pct'); warnings.push('buffer_health_pct_ignored'); }

  // S2 · gate de SoC (fail-closed)
  const policySocRaw = isPlainObject(policy.device) ? policy.device.soc : undefined;
  const policySoc = resolveSoc(policySocRaw);
  const denied = [];
  if (soc.canonical === null) denied.push({ code: ERRORS.SOC_UNMAPPED, detail: soc.raw });
  if (soc.canonical && policySoc.canonical && policySoc.canonical !== soc.canonical) {
    denied.push({ code: ERRORS.SOC_MISMATCH, detail: policySoc.canonical + '!=' + soc.canonical });
  }

  // S3 · truth-guards de display
  const display = isPlainObject(policy.display) ? policy.display : {};
  if (display.wire_resolution === '7680x4320') denied.push({ code: ERRORS.WIRE_8K, detail: 'wire_resolution' });
  if (display.eight_k === 'native') denied.push({ code: ERRORS.WIRE_8K, detail: 'eight_k_native' });
  if (soc.canonical && display.never_downscale !== true) denied.push({ code: ERRORS.NEVER_DOWNSCALE, detail: 'never_downscale!=true' });

  // S4 · validación de claves (0 claves fuera de la allowlist ⇒ si hay alguna, no se aplica NADA)
  const leversIn = (isPlainObject(policy.device) && isPlainObject(policy.device.levers)) ? policy.device.levers : {};
  const accepted = new Map();
  for (const key of Object.keys(leversIn).sort()) {
    const meta = KEY_META.get(key);
    if (!meta) { errors.push({ code: ERRORS.KEY_NOT_ALLOWED, detail: key }); continue; }
    if (meta.forbidden) { errors.push({ code: ERRORS.KEY_FORBIDDEN, detail: key }); continue; }
    if (!LEVERS.has(key)) { errors.push({ code: ERRORS.LEVER_NOT_IN_ALLOWLIST, detail: key }); continue; }
    const v = leversIn[key];
    if (!Number.isInteger(v) || !DOMAIN.get(key).test(String(v))) {
      skipped.push({ key, code: 'value_out_of_domain', value: v });
      continue;
    }
    accepted.set(key, v);
  }

  const hardFail = errors.length > 0 || denied.length > 0;
  const allowed = !hardFail && isPlainObject(policy.device) && policy.device.allowed === true;

  // S5 · tier de procesamiento + pasos térmicos
  const tierReq = (isPlainObject(policy.processing) && TIERS.indexOf(policy.processing.tier) !== -1)
    ? policy.processing.tier : 'max_image';
  const thermalLimits = validThermalLimits(isPlainObject(policy.thermal) ? policy.thermal.limits : null);
  if (isPlainObject(policy.thermal) && policy.thermal.limits !== undefined && thermalLimits === null) {
    warnings.push('thermal_limits_invalid');
  }
  const th = thermalSteps(measured.thermal, thermalLimits);
  if (th.prov !== 'measured') warnings.push('thermal_unavailable');
  const effective_tier = lowerTier(tierReq, th.steps);

  // S6 · objetivo = filas base (+ levers si allowed), y cap por tier efectivo
  const target = new Map();
  if (soc.canonical && !hardFail) for (const [k, v] of BASE_ROWS) target.set(k, v);
  if (allowed) for (const [k, v] of accepted) target.set(k, v);

  for (const meta of MAP_ROWS) {
    const key = meta.key;
    if (!target.has(key) || !meta.ceiling_by_tier) continue;
    const ceil = meta.ceiling_by_tier[effective_tier];
    if (ceil === null || ceil === undefined) continue;
    const v = target.get(key);
    const next = INVERT_CLAMP.has(key) ? Math.max(v, ceil) : Math.min(v, ceil);
    if (next !== v) { clamped.push({ key, from: v, to: next }); target.set(key, next); }
  }

  // S7 · levers descartados por fail-closed (visibilidad)
  if (!allowed && !hardFail) for (const k of accepted.keys()) skipped.push({ key: k, code: 'device_not_allowed' });

  // S8 · filas "<ns> <key> <int>" ordenadas por tier y clave, sin duplicados, ≤ max_rows
  const rows = [];
  const seen = new Set();
  const TIER_IDX = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };
  const ordered = [...target.entries()].sort((a, b) => {
    const ta = TIER_IDX[KEY_META.get(a[0]).tier];
    const tb = TIER_IDX[KEY_META.get(b[0]).tier];
    if (ta !== tb) return ta - tb;
    return a[0] < b[0] ? -1 : 1;
  });
  for (const [key, value] of ordered) {
    if (seen.has(key)) continue;                       // nunca dos filas para la misma clave
    seen.add(key);
    const meta = KEY_META.get(key);
    if (rows.length >= lim.max_rows) { warnings.push('rows_truncated'); break; }
    if (!DOMAIN.get(key).test(String(value))) { skipped.push({ key, code: 'value_out_of_domain', value }); continue; }
    rows.push(meta.ns_hint + ' ' + key + ' ' + value);
  }

  // S9 · cfg (opcional: sólo si el llamador lo aporta; el compositor no inventa valores)
  let cfg = null;
  if (isPlainObject(inp.cfg)) {
    const cfgLimits = Object.assign({}, lim, isPlainObject(inp.cfg.limits) ? inp.cfg.limits : {});
    cfg = composeCfg({ session: inp.cfg.session, values: inp.cfg.values, ttl: inp.cfg.ttl, limits: cfgLimits });
    if (!cfg.ok) errors.push({ code: cfg.errors[0].code, detail: 'cfg' });
  }

  // S10 · fps objetivo / never_downscale / límites térmicos = INTENTS (no van como settings)
  const fpsTarget = (isPlainObject(policy.fps) && FPS_TARGETS.indexOf(policy.fps.target) !== -1) ? policy.fps.target : null;
  if (fpsTarget === null) warnings.push('cadence_unknown');

  const result = {
    ok: errors.length === 0 && denied.length === 0,
    allowed,
    state: (hardFail || !allowed) ? 'denied' : (skipped.length > 0 || clamped.length > 0 ? 'partial' : (rows.length > 0 ? 'applied' : 'noop')),
    reason: hardFail
      ? (denied[0] ? denied[0].code : errors[0].code)
      : (allowed ? null : ERRORS.DEVICE_NOT_ALLOWED),
    denials: denied,
    soc: { raw: soc.raw, canonical: soc.canonical, gate: soc.canonical ? 'allowlisted' : 'not_allowlisted', alias_used: soc.alias_used },
    rows,
    cfg,
    intents: {
      fps_target: fpsTarget,
      processing_tier: tierReq,
      effective_tier,
      thermal_steps: th.steps,
      thermal_source: th.source,
      thermal_prov: th.prov,
      thermal_limits: thermalLimits,
      never_downscale: display.never_downscale === true,
      buffer_ms
    },
    skipped,
    clamped,
    warnings,
    ignored_inputs,
    errors,
    limits: { max_cfg_bytes: lim.max_cfg_bytes, max_rows: lim.max_rows, ttl_min_s: lim.ttl_min_s, ttl_max_s: lim.ttl_max_s }
  };

  // Defensa final: la salida no puede contener campos prohibidos (resolución/códec/bitrate/url/props)
  const forbiddenOut = scanForbiddenFields({ rows: result.rows, intents: result.intents, cfg: result.cfg && result.cfg.keys ? { keys: result.cfg.keys } : null });
  if (forbiddenOut.length > 0) {
    result.errors.push({ code: ERRORS.FORBIDDEN_FIELD, detail: forbiddenOut.join(',') });
    result.ok = false;
    result.state = 'denied';
    result.rows = [];
    result.allowed = false;
    result.reason = ERRORS.FORBIDDEN_FIELD;
  }
  return result;
}

module.exports = {
  ERRORS,
  LIMITS,
  CFG_KEYS,
  TIERS,
  FPS_TARGETS,
  BASE_ROWS,
  CANON_SOCS,
  NO_WIRE_8K,
  ALLOWED,
  LEVERS,
  KEY_META,
  SPEC: { allowlist: ALLOWLIST_PATH, lever_map: LEVER_MAP_PATH },
  resolveSoc,
  thermalSteps,
  validThermalLimits,
  lowerTier,
  findDuplicateJsonKeys,
  assertBytes,
  scanForbiddenFields,
  composeCfg,
  parseCfgBody,
  compose
};
