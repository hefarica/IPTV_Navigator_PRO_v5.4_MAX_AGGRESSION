'use strict';

/**
 * ARA-X sync client + policy guards — D3 (protocol v2).
 *
 * Scope: pure functions and small state machines. It NEVER mutates a segment URL.
 * The device applies policy through player/APK knobs; the VPS keeps selecting variants.
 *
 * Truth guards encoded here (R4/R5/R6):
 *  - Every measurement travels as {value, prov, age_ms, conf}; value=null <-> prov=unavailable.
 *  - Missing signal is NEVER zero (INV-6). ADB-only sensors can only be measured_device.
 *  - content.* is LAB SSOT (VPS-side); it is rejected in requests and accepted in policies
 *    only with prov=lab_ssot.
 *  - SoC vocabulary is canonical (R5 GAP-01): {mt8696, amlogic, s905x4, s905x3}.
 *  - SoC without 8K decode can never receive wire-8K nor resolution degradation.
 *  - Never downscale: ONN 4K (s905x4) policy must keep min_resolution=3840x2160 and
 *    never_downscale=true; degrade.order may only use fps/processing.
 *  - Only allowlisted VPP levers are accepted; blend must be a normalized P0..P5 distribution.
 *  - Policies may not contain URLs/segment targets, and never echo request strings.
 *  - Expired policies fail open to a conservative safe default, never to a stale aggressive one.
 *  - Replay: nonce single-use per device (>=600 s) and idempotent retry of the exact body
 *    returns the cached signed answer; a different body with the same seq is a conflict.
 */

const crypto = require('node:crypto');
const CATALOG = require('../schema/sync_features.json');

const SYNC_VERSION = 2;

// Wire canonical prefixes stay V1: R6-D3-AUTH-02 freezes the HMAC canonical strings.
const REQ_PREFIX = 'ARA-X-SYNC-V1';
const RESP_PREFIX = 'ARA-X-SYNC-RESP-V1';

const DEFAULT_CADENCE_S = 30;
const MIN_REQ_INTERVAL_S = 5;
const MAX_BODY_BYTES = CATALOG.limits.max_body_bytes;
const TS_SKEW_S = CATALOG.limits.ts_skew_s;
const MAX_POLICY_TTL_S = CATALOG.limits.max_policy_ttl_s;
const NONCE_TTL_S = CATALOG.limits.nonce_ttl_s;
const IDEMPOTENCY_TTL_S = CATALOG.limits.idempotency_ttl_s;
const MAX_FEATURES = CATALOG.limits.max_features;
const MAX_EVENTS = CATALOG.limits.max_events;
const MAX_AGE_MS = CATALOG.limits.max_age_ms;
const MAX_CONTENT_AGE_MS = CATALOG.limits.max_content_age_ms;

const PROFILE_KEYS = Object.freeze(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
const CANONICAL_SOCS = Object.freeze(CATALOG.socs.canonical.slice());
const REQUEST_SOCS = Object.freeze(CATALOG.socs.request.slice());
const RESPONSE_SOCS = Object.freeze(CATALOG.socs.response.slice());
const UNMAPPED_SOC = CATALOG.socs.unmapped || 'unknown';
const ACK_TRANSLATIONS = Object.freeze({ ...CATALOG.ack.translations });
const SOC_ALIASES = Object.freeze({ ...CATALOG.socs.aliases });
const NO_WIRE_8K_SOCS = Object.freeze(CATALOG.socs.no_wire_8k.slice());
const ONN4K_SOC = CATALOG.socs.onn4k;
const KNOWN_4K_SOCS = Object.freeze(['s905x4', 's905x3', 'mt8696', 'amlogic']);
const MIN_RESOLUTIONS = Object.freeze(CATALOG.display.min_resolutions.slice());
const WIRE_RESOLUTIONS = Object.freeze(CATALOG.display.wire_resolutions.slice());
const DISPLAY_MODES = Object.freeze(CATALOG.display.modes.slice());
const EIGHT_K_MODES = Object.freeze(CATALOG.display.eight_k.slice());
const HDR_HINTS = Object.freeze(CATALOG.display.hdr_hints.slice());
const FPS_TARGETS = Object.freeze(CATALOG.fps.targets.slice());
const FPS_MIN = CATALOG.fps.min;
const FPS_MAX_MEASURED = CATALOG.fps.max_measured;
const PROCESSING_TIERS = Object.freeze(CATALOG.processing.tiers.slice());
const DEGRADE_KEYS = Object.freeze(CATALOG.degrade.keys.slice());
const DEGRADE_MAX = CATALOG.degrade.max_items;
const THERMAL_STATUSES = Object.freeze(CATALOG.thermal.statuses.slice());
const THERMAL_LIMIT_KEYS = Object.freeze(CATALOG.thermal.limit_keys.slice());
const THERMAL_MIN_C = CATALOG.thermal.limits_min_c;
const THERMAL_MAX_C = CATALOG.thermal.limits_max_c;
const REQUEST_PROV = Object.freeze(CATALOG.provenance.request.slice());
const CONTENT_PROV = Object.freeze(CATALOG.provenance.response_content.slice());
const FEATURES = Object.freeze({ ...CATALOG.features });
const ADB_ONLY_FEATURES = Object.freeze(
  Object.entries(CATALOG.features).filter(([, def]) => def.adb_only).map(([name]) => name)
);
const EVENT_TYPES = Object.freeze(CATALOG.events.types.slice());
const EVENT_CODES = Object.freeze(CATALOG.events.codes.slice());
const CAPABILITY_KEYS = Object.freeze(CATALOG.capabilities.keys.slice());

const ARTIFACT = Object.freeze({ ...CATALOG.artifact });
const ARTIFACT_SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9._:+-]{1,64}$/;
/** Sentinel for "identity unknown" in the offline safe default (never a real artifact). */
const ARTIFACT_UNKNOWN_SHA256 = ARTIFACT.unknown_sha256;

// D4 ack L3 (D4-F02): full apply record travels inside `state.apply`.
const ACK = Object.freeze({ ...CATALOG.ack });
const ACK_STATES = Object.freeze(ACK.states.slice());
const ACK_REASONS = Object.freeze([...ACK.blocking_reasons, ...ACK.warning_reasons, ...ACK.skipped_reasons]);
const ACK_SOC_SOURCES = Object.freeze(ACK.soc_sources.slice());
const ACK_SOC_GATES = Object.freeze(ACK.soc_gates.slice());
const ACK_THERMAL_PROV = Object.freeze(ACK.thermal_prov.slice());
const ACK_DEFER_REASONS = Object.freeze(ACK.defer_reasons.slice());
const ACK_MAX_LINES = ACK.limits.max_lines;
const ACK_MAX_KEY_LEN = ACK.limits.max_key_len;
const ACK_MAX_AP_LINE_LEN = ACK.limits.max_ap_line_len;
const ACK_MAX_UNREACHABLE = ACK.limits.max_unreachable;
const ACK_MAX_STEPS = ACK.limits.max_steps;
const ACK_KEY_PATTERN = /^[a-z0-9_]+$/;
const ACK_AP_PATTERN = /^[a-z_]+ [a-z0-9_]+ -?[0-9]{1,4}$/;

/** Mirrors `ape_vpp_levers()` (R5: 13 keys, verified against the allowlist JSON). */
const ACTUATOR_ALLOWLIST = Object.freeze(CATALOG.levers.vpp.slice());

const URL_LIKE_KEYS = Object.freeze([
  'url', 'uri', 'segment', 'segment_url', 'source_url', 'fetch_url', 'manifest_url', 'callback', 'webhook'
]);

function violation(code, message) {
  const err = new Error('ARA_X_POLICY_VIOLATION[' + code + ']: ' + message);
  err.code = 'ARA_X_POLICY_VIOLATION';
  err.reason = code;
  return err;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function hmacHex(secret, canonical) {
  if (typeof secret !== 'string' || secret.length === 0) throw violation('missing_secret', 'missing HMAC secret');
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

function canonicalRequestString({ deviceId, seq, ts, nonce, bodyHash }) {
  return [REQ_PREFIX, String(deviceId), String(seq), String(ts), String(nonce), String(bodyHash)].join('\n');
}

function canonicalResponseString({ deviceId, reqSeq, respTs, bodyHash }) {
  return [RESP_PREFIX, String(deviceId), String(reqSeq), String(respTs), String(bodyHash)].join('\n');
}

function signRequest({ secret, keyId = 'k1', deviceId, seq, ts, nonce, rawBody }) {
  if (typeof rawBody !== 'string') throw violation('bad_body', 'rawBody must be a string');
  const bodyHash = sha256Hex(rawBody);
  const canonical = canonicalRequestString({ deviceId, seq, ts, nonce, bodyHash });
  const sig = hmacHex(secret, canonical);
  return {
    bodyHash,
    canonical,
    sig,
    headers: {
      'Content-Type': 'application/json',
      'X-ARA-Sync-Version': String(SYNC_VERSION),
      'X-ARA-Key-Id': String(keyId),
      'X-ARA-Sig': sig
    }
  };
}

function verifyResponseSignature({ secret, deviceId, reqSeq, respTs, rawBody, headers }) {
  const sig = (headers && (headers['X-ARA-Sig'] || headers['x-ara-sig'])) || '';
  const bodyHash = sha256Hex(rawBody);
  const expected = hmacHex(secret, canonicalResponseString({ deviceId, reqSeq, respTs, bodyHash }));
  if (typeof sig !== 'string' || sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function assertNoUrlKeys(value, path = '$') {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoUrlKeys(item, path + '[' + i + ']'));
    return;
  }
  for (const key of Object.keys(value)) {
    if (URL_LIKE_KEYS.includes(String(key).toLowerCase())) {
      throw violation('url_key', 'payload must not contain URL-like key ' + path + '.' + key);
    }
    assertNoUrlKeys(value[key], path + '.' + key);
  }
}

function isFreshTimestamp(ts, nowS, skewS = TS_SKEW_S) {
  return Number.isInteger(ts) && Number.isInteger(nowS) && Math.abs(nowS - ts) <= skewS;
}

function isSequenceNew(lastSeq, seq) {
  return Number.isInteger(seq) && Number.isInteger(lastSeq) && seq > lastSeq;
}

function isNonceFormat(nonce) {
  return typeof nonce === 'string' && /^[a-f0-9]{16,64}$/.test(nonce);
}

/** R6-D3-SSRF-01 / R6-D3-SCHEMA-01: schemas are closed; reject unknown keys server-side too. */
function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw violation('unknown_key', label + ' has unexpected key ' + key);
  }
}

const ARTIFACT_REQUEST_KEYS = Object.freeze(['artifact_sha256', 'generation_id', 'list_version']);
const ARTIFACT_RESPONSE_KEYS = Object.freeze(['artifact_sha256', 'generation_id', 'list_version', 'lab_exported_at']);

/**
 * `ref` fixes the identity of the polymorphic catalog (R1 §0.8): byte-identity is only
 * valid inside one generation. The HTTP ETag of /lists is the gzip size (R1 F-19) and
 * `Range` is not honored (200 + chunked, never 206): neither can identify nor verify.
 */
function validateArtifactRef(ref, { response = false } = {}) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
    throw violation('artifact_ref', 'ref must be an object');
  }
  const allowed = response ? ARTIFACT_RESPONSE_KEYS : ARTIFACT_REQUEST_KEYS;
  rejectUnknownKeys(ref, allowed, 'ref');
  for (const key of allowed) {
    if (!(key in ref)) throw violation('artifact_ref_required', 'ref.' + key + ' is required');
    if (typeof ref[key] !== 'string') throw violation('artifact_ref_type', 'ref.' + key + ' must be a string');
  }
  if (!ARTIFACT_SHA256_PATTERN.test(ref.artifact_sha256)) {
    throw violation('artifact_sha256', 'ref.artifact_sha256 must be 64 lowercase hex chars');
  }
  if (!SAFE_TOKEN_PATTERN.test(ref.generation_id)) throw violation('artifact_generation', 'invalid ref.generation_id');
  if (!SAFE_TOKEN_PATTERN.test(ref.list_version)) throw violation('artifact_list_version', 'invalid ref.list_version');
  if (response && !SAFE_TOKEN_PATTERN.test(ref.lab_exported_at)) {
    throw violation('artifact_lab', 'invalid ref.lab_exported_at');
  }
  return true;
}

/** True when both refs describe the same catalog generation (sha256 + generation_id). */
function sameArtifact(a, b) {
  return Boolean(
    a &&
      b &&
      typeof a.artifact_sha256 === 'string' &&
      typeof b.artifact_sha256 === 'string' &&
      a.artifact_sha256 === b.artifact_sha256 &&
      a.generation_id === b.generation_id
  );
}

function artifactMismatch(requestRef, responseRef) {
  if (!sameArtifact(requestRef, responseRef)) return 'artifact_mismatch';
  if (requestRef.list_version !== responseRef.list_version) return 'list_version_mismatch';
  return null;
}

function canonicalSoc(raw) {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (SOC_ALIASES[key]) return SOC_ALIASES[key];
  const alt = key.replace(/-/g, '_');
  if (SOC_ALIASES[alt]) return SOC_ALIASES[alt];
  const alt2 = key.replace(/_/g, '-');
  if (SOC_ALIASES[alt2]) return SOC_ALIASES[alt2];
  return null;
}

function isKnown4kSoc(soc) {
  return KNOWN_4K_SOCS.includes(soc);
}

/* ── feature vector (R4 §6.1 / §6.5) ─────────────────────────────────────── */

function assertFeatureValue(name, def, value) {
  if (value === null) return;
  if (def.type === 'enum') {
    const ok = def.values.some((v) => Object.is(v, value));
    if (!ok) throw violation('feature_enum', name + ' value not in enum');
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw violation('feature_type', name + ' must be a number or null');
  }
  if (def.type === 'integer' && !Number.isInteger(value)) {
    throw violation('feature_type', name + ' must be an integer or null');
  }
  if (value < def.min || value > def.max) {
    throw violation('feature_range', name + ' out of range [' + def.min + ',' + def.max + ']');
  }
}

function validateFeatureVector(features) {
  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    throw violation('features_type', 'metrics.features must be an object');
  }
  const names = Object.keys(features);
  if (names.length < 1) throw violation('features_empty', 'at least one feature is required');
  if (names.length > MAX_FEATURES) throw violation('features_count', 'more than ' + MAX_FEATURES + ' features');

  for (const name of names) {
    const def = FEATURES[name];
    if (!def) throw violation('feature_unknown', 'feature not in catalog: ' + name);
    const entry = features[name];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw violation('feature_entry', name + ' must be an object');
    }
    for (const key of Object.keys(entry)) {
      if (!['value', 'prov', 'age_ms', 'conf'].includes(key)) {
        throw violation('feature_extra', name + ' has unexpected key ' + key);
      }
    }
    if (!('value' in entry) || !('prov' in entry) || !('age_ms' in entry) || !('conf' in entry)) {
      throw violation('feature_required', name + ' requires value/prov/age_ms/conf');
    }
    assertFeatureValue(name, def, entry.value);
    if (!REQUEST_PROV.includes(entry.prov)) {
      throw violation('feature_prov', name + ' prov not allowed in request: ' + String(entry.prov));
    }
    if (entry.value === null && entry.prov !== 'unavailable') {
      throw violation('honesty_null', name + ' value=null requires prov=unavailable');
    }
    if (entry.prov === 'unavailable' && entry.value !== null) {
      throw violation('honesty_unavailable', name + ' prov=unavailable requires value=null');
    }
    if (entry.prov === 'lab_ssot') {
      throw violation('lab_ssot_request', name + ' is LAB-owned and cannot be sent by the device');
    }
    if (def.adb_only && entry.value !== null && entry.prov !== 'measured_device') {
      throw violation('adb_only_prov', name + ' is ADB-only; non-null requires prov=measured_device');
    }
    if (entry.age_ms !== null) {
      if (!Number.isInteger(entry.age_ms) || entry.age_ms < 0 || entry.age_ms > MAX_AGE_MS) {
        throw violation('feature_age', name + ' age_ms out of range [0,' + MAX_AGE_MS + ']');
      }
    }
    if (entry.conf !== null) {
      assertNumberInRange(entry.conf, 0, 1, name + '.conf');
    }
  }
  return true;
}

function validateSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw violation('source_type', 'metrics.source must be an object');
  }
  rejectUnknownKeys(source, ['resolution', 'codec', 'fps', 'hdr', 'prov', 'age_ms'], 'metrics.source');
  for (const key of ['resolution', 'codec', 'fps', 'hdr', 'prov', 'age_ms']) {
    if (!(key in source)) throw violation('source_required', 'metrics.source.' + key + ' is required');
  }
  if (typeof source.resolution !== 'string' || !/^[0-9]{3,5}x[0-9]{3,5}$/.test(source.resolution)) {
    throw violation('source_resolution', 'invalid metrics.source.resolution');
  }
  if (typeof source.codec !== 'string' || !/^[A-Za-z0-9._-]{3,128}$/.test(source.codec)) {
    throw violation('source_codec', 'invalid metrics.source.codec');
  }
  assertNumberInRange(source.fps, 1, 240, 'metrics.source.fps');
  if (!HDR_HINTS.includes(source.hdr)) throw violation('source_hdr', 'invalid metrics.source.hdr');
  if (!['measured_device', 'measured_server', 'derived', 'unavailable'].includes(source.prov)) {
    throw violation('source_prov', 'invalid metrics.source.prov');
  }
  if (source.age_ms !== null) {
    if (!Number.isInteger(source.age_ms) || source.age_ms < 0 || source.age_ms > MAX_AGE_MS) {
      throw violation('source_age', 'metrics.source.age_ms out of range');
    }
  }
  return true;
}

function validateEvents(events) {
  if (!Array.isArray(events)) throw violation('events_type', 'events must be an array');
  if (events.length > MAX_EVENTS) throw violation('events_count', 'more than ' + MAX_EVENTS + ' events');
  for (const ev of events) {
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) throw violation('event_type', 'event must be an object');
    for (const key of Object.keys(ev)) {
      if (!['type', 'code', 'prov', 'age_ms', 'message_hash'].includes(key)) {
        throw violation('event_extra', 'event has unexpected key ' + key);
      }
    }
    if (!EVENT_TYPES.includes(ev.type)) throw violation('event_enum', 'event type not in enum: ' + String(ev.type));
    if (!REQUEST_PROV.includes(ev.prov)) throw violation('event_prov', 'event prov invalid');
    if (ev.age_ms !== null && (!Number.isInteger(ev.age_ms) || ev.age_ms < 0 || ev.age_ms > MAX_AGE_MS)) {
      throw violation('event_age', 'event age_ms out of range');
    }
    if (ev.code !== undefined && !EVENT_CODES.includes(ev.code)) {
      throw violation('event_code', 'event code not in enum: ' + String(ev.code));
    }
    if (ev.message_hash !== undefined && !/^[a-f0-9]{64}$/.test(ev.message_hash)) {
      throw violation('event_hash', 'event message_hash must be sha256 hex');
    }
  }
  return true;
}

function validateCapabilities(caps) {  if (!caps || typeof caps !== 'object' || Array.isArray(caps)) {
    throw violation('caps_type', 'capabilities must be an object');
  }
  rejectUnknownKeys(caps, [...CAPABILITY_KEYS, 'prov'], 'capabilities');
  for (const key of CAPABILITY_KEYS) {
    if (key === 'soc_8k') continue;
    if (typeof caps[key] !== 'boolean') throw violation('caps_required', 'capabilities.' + key + ' must be boolean');
  }
  if (caps.soc_8k !== undefined && (typeof caps.soc_8k !== 'string' || caps.soc_8k.length > 16)) {
    throw violation('caps_soc8k', 'capabilities.soc_8k must be a short string');
  }
  if (!REQUEST_PROV.includes(caps.prov)) throw violation('caps_prov', 'capabilities.prov invalid');
  return true;
}

/** D4-F02: closed ack record. Never carries policy, URLs or credentials. */
function validateApply(apply) {
  if (!apply || typeof apply !== 'object' || Array.isArray(apply)) {
    throw violation('ack_type', 'state.apply must be an object');
  }
  rejectUnknownKeys(
    apply,
    ['st', 'rs', 'etag', 'soc', 'th', 'cad', 'ap', 'un', 'sk', 'cl', 'df', 'hl', 'ap_trunc'],
    'state.apply'
  );
  if (!ACK_STATES.includes(apply.st)) throw violation('ack_state', 'invalid state.apply.st');

  if (apply.rs !== undefined && apply.rs !== null && !ACK_REASONS.includes(apply.rs)) {
    throw violation('ack_reason', 'invalid state.apply.rs');
  }
  if (apply.etag !== undefined && (typeof apply.etag !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(apply.etag))) {
    throw violation('ack_etag', 'invalid state.apply.etag');
  }
  if (apply.soc !== undefined) {
    const soc = apply.soc;
    if (!soc || typeof soc !== 'object' || Array.isArray(soc)) throw violation('ack_soc', 'state.apply.soc must be an object');
    rejectUnknownKeys(soc, ['m', 'src', 'c', 'g', 'alias'], 'state.apply.soc');
    for (const key of ['m', 'src', 'c', 'g']) {
      if (!(key in soc)) throw violation('ack_soc_required', 'state.apply.soc.' + key + ' is required');
    }
    if (!REQUEST_SOCS.includes(soc.m)) throw violation('ack_soc_m', 'invalid state.apply.soc.m');
    if (!ACK_SOC_SOURCES.includes(soc.src)) throw violation('ack_soc_src', 'invalid state.apply.soc.src');
    if (!REQUEST_SOCS.includes(soc.c)) throw violation('ack_soc_c', 'invalid state.apply.soc.c');
    if (!ACK_SOC_GATES.includes(soc.g)) throw violation('ack_soc_g', 'invalid state.apply.soc.g');
    if (soc.alias !== undefined && (typeof soc.alias !== 'string' || !/^[A-Za-z0-9._:+-]{1,64}$/.test(soc.alias))) {
      throw violation('ack_soc_alias', 'invalid state.apply.soc.alias');
    }
  }
  if (apply.th !== undefined) {
    const th = apply.th;
    if (!th || typeof th !== 'object' || Array.isArray(th)) throw violation('ack_th', 'state.apply.th must be an object');
    rejectUnknownKeys(th, ['prov', 'st', 'steps', 'tier'], 'state.apply.th');
    for (const key of ['prov', 'st', 'steps', 'tier']) {
      if (!(key in th)) throw violation('ack_th_required', 'state.apply.th.' + key + ' is required');
    }
    if (!ACK_THERMAL_PROV.includes(th.prov)) throw violation('ack_th_prov', 'invalid state.apply.th.prov');
    if (th.st !== null && !THERMAL_STATUSES.includes(th.st)) throw violation('ack_th_status', 'invalid state.apply.th.st');
    if (!Number.isInteger(th.steps) || th.steps < 0 || th.steps > ACK_MAX_STEPS) {
      throw violation('ack_th_steps', 'state.apply.th.steps out of range');
    }
    if (!PROCESSING_TIERS.includes(th.tier)) throw violation('ack_th_tier', 'invalid state.apply.th.tier');
  }
  if (apply.cad !== undefined && (!Number.isInteger(apply.cad) || apply.cad < 10 || apply.cad > 120)) {
    throw violation('ack_cad', 'state.apply.cad out of range [10,120]');
  }
  if (apply.ap !== undefined) {
    if (!Array.isArray(apply.ap) || apply.ap.length > ACK_MAX_LINES) throw violation('ack_ap', 'state.apply.ap invalid');
    for (const line of apply.ap) {
      if (typeof line !== 'string' || line.length > ACK_MAX_AP_LINE_LEN || !ACK_AP_PATTERN.test(line)) {
        throw violation('ack_ap_line', 'state.apply.ap line must look like "<ns> <key> <int>"');
      }
    }
  }
  if (apply.un !== undefined && (!Number.isInteger(apply.un) || apply.un < 0 || apply.un > ACK_MAX_UNREACHABLE)) {
    throw violation('ack_un', 'state.apply.un out of range');
  }
  const ackKey = (key, label) => {
    if (typeof key !== 'string' || key.length > ACK_MAX_KEY_LEN || !ACK_KEY_PATTERN.test(key)) {
      throw violation('ack_key', label + ' key invalid');
    }
  };
  if (apply.sk !== undefined) {
    if (!Array.isArray(apply.sk) || apply.sk.length > ACK_MAX_LINES) throw violation('ack_sk', 'state.apply.sk invalid');
    for (const item of apply.sk) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw violation('ack_sk_item', 'state.apply.sk item invalid');
      rejectUnknownKeys(item, ['k', 'r'], 'state.apply.sk[]');
      ackKey(item.k, 'sk');
      if (!ACK.skipped_reasons.includes(item.r)) throw violation('ack_sk_reason', 'state.apply.sk reason invalid');
    }
  }
  if (apply.cl !== undefined) {
    if (!Array.isArray(apply.cl) || apply.cl.length > ACK_MAX_LINES) throw violation('ack_cl', 'state.apply.cl invalid');
    for (const item of apply.cl) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw violation('ack_cl_item', 'state.apply.cl item invalid');
      rejectUnknownKeys(item, ['k', 'from', 'to'], 'state.apply.cl[]');
      ackKey(item.k, 'cl');
      for (const key of ['from', 'to']) {
        if (!Number.isInteger(item[key]) || item[key] < -1000 || item[key] > 1000) {
          throw violation('ack_cl_value', 'state.apply.cl.' + key + ' out of range');
        }
      }
    }
  }
  if (apply.df !== undefined) {
    if (!Array.isArray(apply.df) || apply.df.length > ACK_MAX_LINES) throw violation('ack_df', 'state.apply.df invalid');
    for (const item of apply.df) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw violation('ack_df_item', 'state.apply.df item invalid');
      rejectUnknownKeys(item, ['k', 'r'], 'state.apply.df[]');
      ackKey(item.k, 'df');
      if (!ACK_DEFER_REASONS.includes(item.r)) throw violation('ack_df_reason', 'state.apply.df reason invalid');
    }
  }
  if (apply.hl !== undefined) {
    if (!Array.isArray(apply.hl) || apply.hl.length > ACK_MAX_LINES) throw violation('ack_hl', 'state.apply.hl invalid');
    for (const key of apply.hl) ackKey(key, 'hl');
  }
  if (apply.ap_trunc !== undefined && typeof apply.ap_trunc !== 'boolean') {
    throw violation('ack_ap_trunc', 'state.apply.ap_trunc must be boolean');
  }
  return true;
}

/**
 * Contract→wire translation for the D4 ack (3 mappings, catalog-driven):
 *  1. `gate: "denied"` → `soc.g = "not_allowlisted" | "no_caps"` (the wire has no `gate` key).
 *  2. `lifecycle: "player_inactive" | "next_media_source"` → `df[].r = "lifecycle_pending"`.
 *  3. `clamped[].key` → `cl[].k` (same `from`/`to`, never lost).
 * Anything outside these contract-only keys is rejected by the closed wire ack validator.
 */
function translateAck(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw violation('ack_translate_type', 'ack input must be an object');
  }
  const ack = { ...input };
  const gate = ack.gate;
  const gateSoc = ack.gate_soc;
  const lifecycle = ack.lifecycle;
  const clamped = ack.clamped;
  delete ack.gate;
  delete ack.gate_soc;
  delete ack.lifecycle;
  delete ack.clamped;

  if (gate !== undefined) {
    if (!ACK_TRANSLATIONS.gate_denied.values.includes(gate) && gate !== 'denied') {
      throw violation('ack_gate', 'gate must be "denied" (or a wire value)');
    }
    if (gate === 'denied') {
      if (!ack.soc || typeof ack.soc !== 'object') throw violation('ack_gate_soc', 'gate denied requires soc');
      const target = ACK_TRANSLATIONS.gate_denied.values;
      const chosen = target.includes(gateSoc) ? gateSoc : ACK_TRANSLATIONS.gate_denied.default;
      if (!target.includes(ack.soc.g)) ack.soc = { ...ack.soc, g: chosen };
    } else if (!ack.soc || typeof ack.soc !== 'object') {
      throw violation('ack_gate_soc', 'gate requires soc');
    }
  }

  if (lifecycle !== undefined) {
    const mapped = ACK_TRANSLATIONS.lifecycle.map[lifecycle];
    if (!mapped) throw violation('ack_lifecycle', 'unknown lifecycle value: ' + String(lifecycle));
    const key = ACK_TRANSLATIONS.lifecycle.key;
    const df = Array.isArray(ack.df) ? ack.df.slice() : [];
    if (!df.some((item) => item && item.k === key && item.r === mapped)) {
      df.push({ k: key, r: mapped });
    }
    ack.df = df;
  }

  if (clamped !== undefined) {
    if (!Array.isArray(clamped)) throw violation('ack_clamped', 'clamped must be an array');
    const cl = Array.isArray(ack.cl) ? ack.cl.slice() : [];
    for (const item of clamped) {
      if (!item || typeof item !== 'object' || item.key === undefined) {
        throw violation('ack_clamped_item', 'clamped item requires key/from/to');
      }
      cl.push({ k: item.key, from: item.from, to: item.to });
    }
    ack.cl = cl;
  }

  validateApply(ack);
  return ack;
}

function validateRequestPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw violation('request_type', 'request must be an object');
  }
  rejectUnknownKeys(
    payload,
    ['v', 'type', 'device_id', 'seq', 'ts', 'nonce', 'client', 'ref', 'session', 'metrics', 'events', 'capabilities', 'state'],
    'request'
  );
  if (payload.v !== SYNC_VERSION) throw violation('request_version', 'unsupported request version');  if (payload.type !== 'ara_x_sync') throw violation('request_type_field', 'unexpected request type');
  if (typeof payload.device_id !== 'string' || !/^[A-Za-z0-9._-]{3,128}$/.test(payload.device_id)) {
    throw violation('device_id', 'invalid device_id');
  }
  if (!Number.isInteger(payload.seq) || payload.seq < 1) throw violation('seq', 'invalid seq');
  if (!Number.isInteger(payload.ts) || payload.ts < 1) throw violation('ts', 'invalid ts');
  if (!isNonceFormat(payload.nonce)) throw violation('nonce', 'invalid nonce');
  validateArtifactRef(payload.ref);

  const c = payload.client;
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw violation('client', 'missing client');
  rejectUnknownKeys(c, ['app', 'version', 'soc', 'soc_raw', 'android', 'player', 'player_version'], 'client');
  for (const key of ['app', 'version', 'soc', 'android', 'player']) {
    if (!(key in c)) throw violation('client_required', 'client.' + key + ' is required');
  }
  if (typeof c.app !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(c.app)) throw violation('client_app', 'invalid client.app');
  if (typeof c.version !== 'string' || !/^[A-Za-z0-9._:+-]{1,32}$/.test(c.version)) {
    throw violation('client_version', 'invalid client.version');
  }
  if (!REQUEST_SOCS.includes(c.soc)) {
    throw violation('soc_request', 'client.soc must be one of ' + REQUEST_SOCS.join('|'));
  }
  if (c.soc === UNMAPPED_SOC && (typeof c.soc_raw !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(c.soc_raw))) {
    throw violation('soc_raw_required', 'client.soc=unknown requires a valid soc_raw (D4-F10)');
  }
  if (c.soc_raw !== undefined && (typeof c.soc_raw !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(c.soc_raw))) {
    throw violation('soc_raw', 'invalid client.soc_raw');
  }
  if (!Number.isInteger(c.android) || c.android < 7 || c.android > 99) throw violation('android', 'invalid client.android');
  if (!['exoplayer', 'vlc', 'kodi', 'tivimate', 'ott', 'hlsjs', 'other'].includes(c.player)) {
    throw violation('player', 'invalid client.player');
  }

  if (payload.session !== undefined) {
    const s = payload.session;
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw violation('session', 'invalid session');
    for (const key of Object.keys(s)) {
      if (!['playback_state', 'list_version', 'started_at'].includes(key)) {
        throw violation('session_extra', 'session has unexpected key ' + key);
      }
    }
    if (s.playback_state !== undefined && !['playing', 'paused', 'buffering', 'idle', 'unknown'].includes(s.playback_state)) {
      throw violation('playback_state', 'invalid session.playback_state');
    }
    if (s.list_version !== undefined && (typeof s.list_version !== 'string' || !/^[A-Za-z0-9._:+-]{1,64}$/.test(s.list_version))) {
      throw violation('list_version', 'invalid session.list_version');
    }
    if (s.started_at !== undefined && (!Number.isInteger(s.started_at) || s.started_at < 0)) {
      throw violation('started_at', 'invalid session.started_at');
    }
  }

  const m = payload.metrics;
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw violation('metrics', 'missing metrics');
  for (const key of ['window_s', 'conf', 'features', 'source']) {
    if (!(key in m)) throw violation('metrics_required', 'metrics.' + key + ' is required');
  }
  if (!Number.isInteger(m.window_s) || m.window_s < 10 || m.window_s > 60) {
    throw violation('window_s', 'metrics.window_s out of range [10,60]');
  }
  if (m.conf !== null) assertNumberInRange(m.conf, 0, 1, 'metrics.conf');
  validateFeatureVector(m.features);
  validateSource(m.source);

  if (payload.events !== undefined) validateEvents(payload.events);
  if (payload.capabilities !== undefined) validateCapabilities(payload.capabilities);

  const st = payload.state;
  if (!st || typeof st !== 'object' || Array.isArray(st)) throw violation('state', 'missing state');
  rejectUnknownKeys(st, ['active_profile', 'profile_blend', 'policy_etag', 'apply', 'levers'], 'state');
  for (const key of ['active_profile', 'profile_blend']) {
    if (!(key in st)) throw violation('state_required', 'state.' + key + ' is required');
  }
  if (!PROFILE_KEYS.includes(st.active_profile)) throw violation('active_profile', 'invalid state.active_profile');
  validateBlend(st.profile_blend);
  if (st.policy_etag !== undefined && (typeof st.policy_etag !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(st.policy_etag))) {
    throw violation('state_etag', 'invalid state.policy_etag');
  }
  if (st.apply !== undefined) validateApply(st.apply);
  if (st.levers !== undefined) validateLevers(st.levers);

  assertNoUrlKeys(payload);
  return payload;
}

function buildSyncRequest({ secret, keyId = 'k1', deviceId, seq, ts, nonce, client, ref, metrics, state, session, events, capabilities }) {
  const rawSoc = client && typeof client.soc === 'string' ? client.soc.trim() : '';
  const canonical = canonicalSoc(rawSoc) || (rawSoc.toLowerCase() === UNMAPPED_SOC ? UNMAPPED_SOC : null);
  let normalizedClient;
  if (!canonical) {
    // D4-F10: un SoC no identificado NO se descarta con un 400 silencioso: viaja como
    // unknown + soc_raw y el servidor responde fail-closed (allowed=false, soc_unmapped).
    const raw = typeof client.soc_raw === 'string' && client.soc_raw.length > 0 ? client.soc_raw : rawSoc;
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(raw)) {
      throw violation('soc_unknown', 'unrecognised SoC requires a valid soc_raw (got: ' + String(client && client.soc) + ')');
    }
    normalizedClient = { ...client, soc: UNMAPPED_SOC, soc_raw: raw };
  } else {
    normalizedClient = { ...client, soc: canonical };
    if (canonical === UNMAPPED_SOC) {
      const raw = typeof client.soc_raw === 'string' && client.soc_raw.length > 0 ? client.soc_raw : rawSoc;
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(raw)) {
        throw violation('soc_raw_required', 'client.soc=unknown requires a valid soc_raw (D4-F10)');
      }
      normalizedClient.soc_raw = raw;
    } else if (rawSoc.toLowerCase() !== canonical) {
      normalizedClient.soc_raw = String(client.soc_raw || rawSoc).slice(0, 64);
    } else if (client.soc_raw !== undefined) {
      normalizedClient.soc_raw = client.soc_raw;
    }
  }

  const payload = {
    v: SYNC_VERSION,
    type: 'ara_x_sync',
    device_id: deviceId,
    seq,
    ts,
    nonce,
    client: normalizedClient,
    ref,
    metrics,
    state
  };
  if (session !== undefined) payload.session = session;
  if (events !== undefined) payload.events = events;
  if (capabilities !== undefined) payload.capabilities = capabilities;

  validateRequestPayload(payload);
  const rawBody = JSON.stringify(payload);
  const bytes = Buffer.byteLength(rawBody, 'utf8');
  if (bytes > MAX_BODY_BYTES) throw violation('body_size', 'request body exceeds ' + MAX_BODY_BYTES + ' bytes');
  const signed = signRequest({ secret, keyId, deviceId, seq, ts, nonce, rawBody });
  return { payload, rawBody, headers: signed.headers, sig: signed.sig, bodyHash: signed.bodyHash };
}

/* ── policy validation ───────────────────────────────────────────────────── */

function assertNumberInRange(value, min, max, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw violation('range', name + ' out of range [' + min + ',' + max + ']');
  }
}

function validateBlend(blend) {
  if (!blend || typeof blend !== 'object' || Array.isArray(blend)) throw violation('blend_type', 'profile.blend must be an object');
  const keys = Object.keys(blend);
  if (keys.length < 1 || keys.length > PROFILE_KEYS.length) throw violation('blend_count', 'profile.blend key count');
  let sum = 0;
  for (const key of keys) {
    if (!PROFILE_KEYS.includes(key)) throw violation('blend_key', 'unknown profile key ' + key);
    assertNumberInRange(blend[key], 0, 1, 'blend.' + key);
    sum += blend[key];
  }
  if (Math.abs(sum - 1) > 1e-6) throw violation('blend_sum', 'profile.blend must sum to 1 (got ' + sum + ')');
}

function validateLevers(levers) {
  if (!levers || typeof levers !== 'object' || Array.isArray(levers)) throw violation('levers_type', 'levers must be an object');
  for (const [key, value] of Object.entries(levers)) {
    if (!ACTUATOR_ALLOWLIST.includes(key)) throw violation('lever_allowlist', 'lever not allowlisted: ' + key);
    if (!Number.isInteger(value)) throw violation('lever_type', 'lever value must be integer: ' + key);
    if (value < -1000 || value > 1000) throw violation('lever_range', 'lever value out of range: ' + key);
  }
  return true;
}

function validateThermal(thermal) {
  if (!thermal || typeof thermal !== 'object' || Array.isArray(thermal)) throw violation('thermal_type', 'thermal must be an object');
  if (!THERMAL_STATUSES.includes(thermal.status)) throw violation('thermal_status', 'invalid thermal.status');
  const limits = thermal.limits;
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw violation('thermal_limits', 'thermal.limits must be an object');
  let previous = THERMAL_MIN_C - 1;
  for (const key of THERMAL_LIMIT_KEYS) {
    if (!(key in limits)) throw violation('thermal_limit_required', 'thermal.limits.' + key + ' is required');
    const v = limits[key];
    if (!Number.isInteger(v) || v < THERMAL_MIN_C || v > THERMAL_MAX_C) {
      throw violation('thermal_limit_range', 'thermal.limits.' + key + ' out of range [' + THERMAL_MIN_C + ',' + THERMAL_MAX_C + ']');
    }
    if (v <= previous) throw violation('thermal_limit_order', 'thermal.limits must be strictly increasing');
    previous = v;
  }
  return true;
}

function validateDisplay(display, soc) {
  if (!display || typeof display !== 'object' || Array.isArray(display)) throw violation('display_type', 'display must be an object');
  if (!DISPLAY_MODES.includes(display.mode)) throw violation('display_mode', 'invalid display.mode');
  if (!WIRE_RESOLUTIONS.includes(display.wire_resolution)) throw violation('display_wire', 'invalid display.wire_resolution');
  if (!MIN_RESOLUTIONS.includes(display.min_resolution)) throw violation('display_min', 'invalid display.min_resolution');
  if (typeof display.never_downscale !== 'boolean') throw violation('display_never_downscale', 'display.never_downscale must be boolean');
  if (!EIGHT_K_MODES.includes(display.eight_k)) throw violation('display_eight_k', 'invalid display.eight_k');
  if (!HDR_HINTS.includes(display.hdr_hint)) throw violation('display_hdr', 'invalid display.hdr_hint');
  rejectUnknownKeys(display, ['mode', 'wire_resolution', 'min_resolution', 'never_downscale', 'eight_k', 'hdr_hint'], 'display');

  if (NO_WIRE_8K_SOCS.includes(soc)) {
    if (display.wire_resolution === '7680x4320') throw violation('wire_8k', 'wire 8K forbidden on ' + soc);
    if (display.never_downscale !== true) throw violation('never_downscale', 'never_downscale=true is mandatory on ' + soc);
    if (isKnown4kSoc(soc) && display.min_resolution !== '3840x2160') {
      throw violation('min_resolution', 'min_resolution must be 3840x2160 on ' + soc);
    }
  }
  return true;
}

function validateFps(fps) {
  if (!fps || typeof fps !== 'object' || Array.isArray(fps)) throw violation('fps_type', 'fps must be an object');
  if (!FPS_TARGETS.includes(fps.target)) throw violation('fps_target', 'invalid fps.target');
  if (fps.current !== null) assertNumberInRange(fps.current, 1, FPS_MAX_MEASURED, 'fps.current');
  if (fps.min !== FPS_MIN) throw violation('fps_min', 'fps.min must be ' + FPS_MIN);
  if (fps.target < fps.min) throw violation('fps_target_min', 'fps.target must be >= fps.min');
  return true;
}

function validateDegrade(degrade, soc) {
  if (!degrade || typeof degrade !== 'object' || Array.isArray(degrade)) throw violation('degrade_type', 'degrade must be an object');
  const order = degrade.order;
  if (!Array.isArray(order) || order.length < 1 || order.length > DEGRADE_MAX) {
    throw violation('degrade_order', 'degrade.order must have 1..' + DEGRADE_MAX + ' items');
  }
  if (new Set(order).size !== order.length) throw violation('degrade_unique', 'degrade.order must not repeat keys');
  for (const key of order) {
    if (!DEGRADE_KEYS.includes(key)) throw violation('degrade_key', 'invalid degrade.order key ' + String(key));
  }
  if (NO_WIRE_8K_SOCS.includes(soc) && order.includes('resolution')) {
    throw violation('degrade_resolution', 'degrade.order may not include resolution on ' + soc);
  }
  return true;
}

function validateContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw violation('content_type', 'content must be an object');
  for (const [key, def] of Object.entries(CATALOG.content)) {
    if (!(key in content)) throw violation('content_required', 'content.' + key + ' is required');
    assertNumberInRange(content[key], def.min, def.max, 'content.' + key);
  }
  if (!CONTENT_PROV.includes(content.prov)) throw violation('content_prov', 'content.prov must be lab_ssot');
  if (content.age_ms !== null && (!Number.isInteger(content.age_ms) || content.age_ms < 0 || content.age_ms > MAX_CONTENT_AGE_MS)) {
    throw violation('content_age', 'content.age_ms out of range');
  }
  if (content.conf !== null) assertNumberInRange(content.conf, 0, 1, 'content.conf');
  return true;
}

function validatePolicy(policy, { nowS } = {}) {
  if (!policy || typeof policy !== 'object') throw violation('policy_type', 'policy must be an object');
  rejectUnknownKeys(
    policy,
    ['v', 'type', 'device_id', 'seq', 'ts', 'valid_until', 'policy_etag', 'profile', 'player', 'device', 'display', 'fps', 'thermal', 'processing', 'degrade', 'content', 'controls', 'ref'],
    'policy'
  );
  if (policy.v !== SYNC_VERSION) throw violation('policy_version', 'unsupported policy version');
  if (policy.type !== 'ara_x_policy') throw violation('policy_type_field', 'unexpected policy type');
  if (typeof policy.device_id !== 'string' || !/^[A-Za-z0-9._-]{3,128}$/.test(policy.device_id)) {
    throw violation('policy_device', 'invalid policy device_id');
  }
  if (!Number.isInteger(policy.seq) || policy.seq < 1) throw violation('policy_seq', 'invalid policy seq');
  if (!Number.isInteger(policy.ts) || policy.ts < 1) throw violation('policy_ts', 'invalid policy ts');
  if (!Number.isInteger(policy.valid_until)) throw violation('policy_ttl', 'invalid valid_until');
  if (policy.valid_until <= policy.ts) throw violation('policy_ttl_order', 'valid_until must be > ts');
  if (policy.valid_until - policy.ts > MAX_POLICY_TTL_S) throw violation('policy_ttl_max', 'policy TTL exceeds ' + MAX_POLICY_TTL_S + 's');
  if (typeof nowS === 'number' && policy.valid_until < nowS) throw violation('policy_expired', 'policy already expired');
  if (typeof policy.policy_etag !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(policy.policy_etag)) {
    throw violation('policy_etag', 'invalid policy_etag');
  }

  if (!policy.profile || !PROFILE_KEYS.includes(policy.profile.active)) throw violation('profile_active', 'invalid profile.active');
  validateBlend(policy.profile.blend);
  if (typeof policy.profile.reason !== 'string' || !/^[a-z0-9_]{1,64}$/.test(policy.profile.reason)) {
    throw violation('profile_reason', 'invalid profile.reason');
  }

  const p = policy.player || {};
  assertNumberInRange(p.buffer_s, 5, 120, 'player.buffer_s');
  assertNumberInRange(p.abr_bw_factor, 0.5, 0.98, 'player.abr_bw_factor');
  assertNumberInRange(p.reconnect_attempts, 1, 500, 'player.reconnect_attempts');
  assertNumberInRange(p.live_delay_s, 1, 60, 'player.live_delay_s');
  assertNumberInRange(p.max_bitrate_bps, 1000000, 80000000, 'player.max_bitrate_bps');
  assertNumberInRange(p.min_bitrate_bps, 1000000, 80000000, 'player.min_bitrate_bps');
  if (p.min_bitrate_bps > p.max_bitrate_bps) throw violation('player_bitrate_order', 'player.min_bitrate_bps > max_bitrate_bps');

  const d = policy.device || {};
  if (typeof d.allowed !== 'boolean') throw violation('device_allowed', 'device.allowed must be boolean');
  if (!RESPONSE_SOCS.includes(d.soc)) throw violation('device_soc', 'device.soc must be canonical or unknown');
  assertNumberInRange(d.thermal_target_c, 55, 85, 'device.thermal_target_c');
  validateLevers(d.levers);

  validateDisplay(policy.display || {}, d.soc);
  validateFps(policy.fps || {});
  validateThermal(policy.thermal || {});
  if (!policy.processing || !PROCESSING_TIERS.includes(policy.processing.tier)) {
    throw violation('processing_tier', 'invalid processing.tier');
  }
  validateDegrade(policy.degrade || {}, d.soc);
  if (policy.content !== undefined) validateContent(policy.content);

  const c = policy.controls || {};
  assertNumberInRange(c.sync_next_s, 10, 120, 'controls.sync_next_s');
  if (!Array.isArray(c.flags) || c.flags.length > 16 || c.flags.some((f) => typeof f !== 'string')) {
    throw violation('controls_flags', 'invalid controls.flags');
  }
  assertNumberInRange(c.degrade_mask, 0, 65535, 'controls.degrade_mask');

  const ref = policy.ref;
  validateArtifactRef(ref, { response: true });

  assertNoUrlKeys(policy);
  return true;
}

function defaultDisplay(soc) {
  const fourK = isKnown4kSoc(soc);
  return {
    mode: fourK ? '4k' : 'native',
    wire_resolution: fourK ? '3840x2160' : '1920x1080',
    min_resolution: fourK ? '3840x2160' : '1920x1080',
    never_downscale: true,
    eight_k: fourK ? 'presentation_only' : 'disabled',
    hdr_hint: 'SDR'
  };
}

function safeDefaultPolicy({ soc = 'unknown', deviceId = 'unknown', seq = 1, ts = Math.floor(Date.now() / 1000) } = {}) {
  const known = CANONICAL_SOCS.includes(soc);
  const wireSoc = known ? soc : UNMAPPED_SOC;
  const policy = {
    v: SYNC_VERSION,
    type: 'ara_x_policy',
    device_id: deviceId,
    seq,
    ts,
    valid_until: ts + 120,
    policy_etag: 'sha256:' + sha256Hex('ara-x-safe-default-v2|' + wireSoc + '|' + seq + '|' + ts),
    profile: {
      active: 'P2',
      blend: { P0: 0, P1: 0, P2: 1, P3: 0, P4: 0, P5: 0 },
      reason: 'offline_safe_default'
    },
    player: {
      buffer_s: 45,
      abr_bw_factor: 0.78,
      reconnect_attempts: 156,
      live_delay_s: 10,
      max_bitrate_bps: 25000000,
      min_bitrate_bps: 6000000
    },
    device: { allowed: false, soc: wireSoc, thermal_target_c: 70, levers: {} },
    display: defaultDisplay(wireSoc),
    fps: { target: 30, current: null, min: FPS_MIN },
    thermal: {
      status: 'unknown',
      limits: { light_c: 60, moderate_c: 66, severe_c: 72, critical_c: 78 }
    },
    processing: { tier: 'minimal' },
    degrade: { order: NO_WIRE_8K_SOCS.includes(wireSoc) || !known ? ['fps', 'processing'] : ['fps', 'processing', 'resolution'] },
    controls: {
      sync_next_s: 30,
      flags: known ? ['offline_safe_default'] : ['soc_unmapped', 'offline_safe_default'],
      degrade_mask: 0
    },
    ref: { artifact_sha256: ARTIFACT_UNKNOWN_SHA256, generation_id: 'unknown', list_version: 'unknown', lab_exported_at: 'unknown' }
  };
  validatePolicy(policy);
  return policy;
}

function validateResponseFreshness({ policy, request, nowS }) {
  if (!request) throw violation('fresh_request', 'request is required to verify response freshness');
  if (policy.device_id !== request.device_id) throw violation('fresh_device', 'response device_id does not match request');
  if (policy.seq !== request.seq) throw violation('fresh_seq', 'response seq does not match request');
  if (policy.valid_until <= nowS) throw violation('fresh_expired', 'response policy already expired');
  if (!Number.isInteger(policy.ts) || Math.abs(policy.ts - nowS) > 30) {
    throw violation('fresh_ts', 'response ts outside +/-30 s of device clock');
  }
  if (policy.valid_until > policy.ts + MAX_POLICY_TTL_S) {
    throw violation('fresh_ttl', 'response policy TTL exceeds ' + MAX_POLICY_TTL_S + 's');
  }
  return true;
}

function applyPolicy(policy, { nowS, request } = {}) {
  validatePolicy(policy, { nowS });
  if (request) validateResponseFreshness({ policy, request, nowS: nowS === undefined ? Math.floor(Date.now() / 1000) : nowS });
  const plan = {
    profile: { ...policy.profile, blend: { ...policy.profile.blend } },
    player: { ...policy.player },
    device: { ...policy.device, levers: { ...policy.device.levers } },
    display: { ...policy.display },
    fps: { ...policy.fps },
    thermal: { ...policy.thermal, limits: { ...policy.thermal.limits } },
    processing: { ...policy.processing },
    degrade: { order: [...policy.degrade.order] },
    controls: { ...policy.controls, flags: [...policy.controls.flags] },
    ref: { ...policy.ref }
  };
  if (policy.content) plan.content = { ...policy.content };
  assertNoUrlKeys(plan);
  return plan;
}

/* ── client state: cadence, cache, seq/nonce ─────────────────────────────── */

class SyncScheduler {
  constructor({ rng = Math.random, cadenceS = DEFAULT_CADENCE_S, maxBackoffS = 120, jitter = 0.2 } = {}) {
    this.rng = rng;
    this.cadenceS = cadenceS;
    this.maxBackoffS = maxBackoffS;
    this.jitter = jitter;
    this._baseS = cadenceS;
    this._failures = 0;
  }

  _delayMs() {
    const factor = 1 + (this.rng() * 2 - 1) * this.jitter;
    return Math.max(1000, Math.round(this._baseS * 1000 * factor));
  }

  nextDelayMs() {
    return this._delayMs();
  }

  onSuccess() {
    this._failures = 0;
    this._baseS = this.cadenceS;
    return this._delayMs();
  }

  onFailure() {
    this._failures += 1;
    this._baseS = Math.min(this.maxBackoffS, 5 * Math.pow(1.6, this._failures - 1));
    return this._delayMs();
  }

  get state() {
    return { failures: this._failures, baseS: this._baseS };
  }
}

class PolicyCache {
  constructor({ soc = 'unknown' } = {}) {
    this.soc = soc;
    this._policy = null;
    this._until = 0;
  }

  set(policy) {
    validatePolicy(policy);
    this._policy = policy;
    this._until = policy.valid_until;
  }

  resolve(nowS) {
    if (this._policy && nowS < this._until) return { source: 'cache', policy: this._policy };
    return {
      source: 'safe_default',
      policy: safeDefaultPolicy({
        soc: this.soc,
        deviceId: this._policy ? this._policy.device_id : 'unknown',
        seq: this._policy ? this._policy.seq : 1,
        ts: nowS
      })
    };
  }
}

function defaultNonce() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Persists seq/nonce BEFORE sending (R6-D3-REPLAY-06). A timeout retries the same
 * request; seq only advances after a verified 200/204.
 */
class SyncStateStore {
  constructor({ seq = 0, nonceFactory = defaultNonce } = {}) {
    this.seq = seq;
    this.nonceFactory = nonceFactory;
    this._pending = null;
  }

  prepare({ nowS = Math.floor(Date.now() / 1000) } = {}) {
    if (!this._pending) {
      this._pending = { seq: this.seq + 1, nonce: this.nonceFactory(), ts: nowS };
    }
    return { ...this._pending };
  }

  retry() {
    return this._pending ? { ...this._pending } : null;
  }

  commit(success) {
    if (!success) return this.seq;
    if (this._pending) {
      this.seq = this._pending.seq;
      this._pending = null;
    }
    return this.seq;
  }

  get state() {
    return { seq: this.seq, pending: this._pending ? { ...this._pending } : null };
  }
}

module.exports = {
  SYNC_VERSION,
  REQ_PREFIX,
  RESP_PREFIX,
  DEFAULT_CADENCE_S,
  MIN_REQ_INTERVAL_S,
  MAX_BODY_BYTES,
  TS_SKEW_S,
  MAX_POLICY_TTL_S,
  NONCE_TTL_S,
  IDEMPOTENCY_TTL_S,
  MAX_FEATURES,
  MAX_EVENTS,
  MAX_AGE_MS,
  PROFILE_KEYS,
  CANONICAL_SOCS,
  SOC_ALIASES,
  NO_WIRE_8K_SOCS,
  ONN4K_SOC,
  KNOWN_4K_SOCS,
  MIN_RESOLUTIONS,
  WIRE_RESOLUTIONS,
  DISPLAY_MODES,
  EIGHT_K_MODES,
  HDR_HINTS,
  FPS_TARGETS,
  FPS_MIN,
  PROCESSING_TIERS,
  DEGRADE_KEYS,
  THERMAL_STATUSES,
  THERMAL_LIMIT_KEYS,
  REQUEST_PROV,
  CONTENT_PROV,
  FEATURES,
  ADB_ONLY_FEATURES,
  EVENT_TYPES,
  EVENT_CODES,
  CAPABILITY_KEYS,
  ARTIFACT,
  ARTIFACT_UNKNOWN_SHA256,
  ARTIFACT_SHA256_PATTERN,
  SAFE_TOKEN_PATTERN,
  ACK,
  ACK_STATES,
  ACK_REASONS,
  ACK_SOC_SOURCES,
  ACK_SOC_GATES,
  ACK_THERMAL_PROV,
  ACK_DEFER_REASONS,
  ACK_TRANSLATIONS,
  REQUEST_SOCS,
  RESPONSE_SOCS,
  UNMAPPED_SOC,
  ACTUATOR_ALLOWLIST,
  URL_LIKE_KEYS,
  violation,
  sha256Hex,
  hmacHex,
  canonicalRequestString,
  canonicalResponseString,
  signRequest,
  verifyResponseSignature,
  assertNoUrlKeys,
  isFreshTimestamp,
  isSequenceNew,
  isNonceFormat,
  canonicalSoc,
  isKnown4kSoc,
  rejectUnknownKeys,
  validateArtifactRef,
  sameArtifact,
  artifactMismatch,
  validateFeatureVector,
  validateSource,
  validateEvents,
  validateCapabilities,
  validateApply,
  translateAck,
  validateRequestPayload,
  buildSyncRequest,
  validateBlend,
  validateLevers,
  validateThermal,
  validateDisplay,
  validateFps,
  validateDegrade,
  validateContent,
  validatePolicy,
  validateResponseFreshness,
  safeDefaultPolicy,
  applyPolicy,
  SyncScheduler,
  PolicyCache,
  SyncStateStore,
  defaultNonce
};
