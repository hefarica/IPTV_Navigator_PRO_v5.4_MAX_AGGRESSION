'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = require('../vps/client/ara_sync_client.js');
const miniSchema = require('./helpers/mini_schema.js');
const generator = require('../scripts/gen_sync_schemas.js');

const SCHEMA_DIR = path.join(__dirname, '..', 'vps', 'schema');
const REQ_SCHEMA = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'sync_request.schema.json'), 'utf8'));
const RES_SCHEMA = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'sync_response.schema.json'), 'utf8'));
const EXAMPLE_POLICY = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'device_policy.example.json'), 'utf8'));
const CATALOG = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'sync_features.json'), 'utf8'));
const R5_SPEC = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'spec', 'actuator_allowlist.json'), 'utf8'));

const SECRET = 'ara-x-test-secret';
const TEST_ARTIFACT = Object.freeze({
  artifact_sha256: '81dbdd11ec620b1dead702ca404c9959c61f301639a5d0091da37ebfb95be14e',
  generation_id: 'gen-1793397700248-20261030T220737Z',
  list_version: '2026-10-30T22:07:37Z'
});

function feat(value, prov, ageMs = 0, conf = 0.9) {
  return { value, prov, age_ms: ageMs, conf };
}

function validMetrics() {
  return {
    window_s: 30,
    conf: 0.85,
    features: {
      vst_ms: feat(850, 'measured_device'),
      startup_outcome: feat('ok', 'measured_device'),
      rebuffer_events: feat(0, 'measured_device'),
      rebuffer_ms: feat(0, 'measured_device'),
      frame_drop_count: feat(2, 'measured_device'),
      fps_declared: feat(25, 'measured_device'),
      fps_effective: feat(24.98, 'measured_device'),
      buffer_ms: feat(45000, 'measured_device'),
      bitrate_bps: feat(25000000, 'measured_device'),
      rtt_ms: feat(28, 'measured_server'),
      throughput_bps: feat(42000000, 'measured_server'),
      err_rate_4xx: feat(0.01, 'measured_server'),
      cpu_temp_c: feat(null, 'unavailable'),
      gpu_temp_c: feat(null, 'unavailable'),
      pm_thermal_status: feat(1, 'measured_device'),
      gpu_load_pct: feat(null, 'unavailable'),
      vpu_load_pct: feat(null, 'unavailable'),
      ram_available_pct: feat(38, 'measured_device'),
      frame_drop_ratio: feat(null, 'unavailable'),
      stutter_probability: feat(null, 'unavailable')
    },
    source: {
      resolution: '1920x1080',
      codec: 'hvc1.2.4.L123.B0',
      fps: 25,
      hdr: 'SDR',
      prov: 'measured_device',
      age_ms: 500
    }
  };
}

function validRequestPayload() {
  return {
    v: 2,
    type: 'ara_x_sync',
    device_id: 'onn4k-001',
    seq: 7,
    ts: 1700000000,
    nonce: 'abc123def4567890',
    client: {
      app: 'ape-crystal-agent',
      version: '2.3.0-noWG',
      soc: 's905x4',
      soc_raw: 'amlogic_s905x4',
      android: 11,
      player: 'exoplayer'
    },
    ref: { ...TEST_ARTIFACT },
    session: { playback_state: 'playing', list_version: '2026-10-30T22:07:37Z' },
    metrics: validMetrics(),
    events: [{ type: 'decoder_error', code: 'MediaCodec', prov: 'measured_device', age_ms: 2000 }],
    capabilities: {
      super_resolution: false,
      frame_interp: false,
      glsl: true,
      media_enhance_api: true,
      soc_8k: '',
      prov: 'measured_device'
    },
    state: {
      active_profile: 'P2',
      profile_blend: { P0: 0, P1: 0, P2: 1, P3: 0, P4: 0, P5: 0 },
      policy_etag: 'sha256:' + 'a'.repeat(64),
      levers: { pq_ai_sr_enable: 1 }
    }
  };
}

function buildFromPayload(payload, { secret = SECRET } = {}) {
  return client.buildSyncRequest({
    secret,
    deviceId: payload.device_id,
    seq: payload.seq,
    ts: payload.ts,
    nonce: payload.nonce,
    client: payload.client,
    ref: payload.ref,
    metrics: payload.metrics,
    state: payload.state,
    session: payload.session,
    events: payload.events,
    capabilities: payload.capabilities
  });
}

// ── Schemas: generación determinista y catálogo único ────────────────────────

test('schemas are byte-identical to the deterministic generator output', () => {
  const out = generator.outputs();
  assert.equal(fs.readFileSync(path.join(SCHEMA_DIR, 'sync_request.schema.json'), 'utf8'), out.request);
  assert.equal(fs.readFileSync(path.join(SCHEMA_DIR, 'sync_response.schema.json'), 'utf8'), out.response);
});

test('schema feature/content enums mirror sync_features.json', () => {
  const reqFeatures = Object.keys(REQ_SCHEMA.properties.metrics.properties.features.properties).sort();
  assert.deepEqual(reqFeatures, Object.keys(CATALOG.features).sort());
  const resContent = Object.keys(RES_SCHEMA.properties.content.properties).filter((k) => !['prov', 'age_ms', 'conf'].includes(k)).sort();
  assert.deepEqual(resContent, Object.keys(CATALOG.content).sort());
  assert.deepEqual(REQ_SCHEMA.properties.client.properties.soc.enum, CATALOG.socs.request);
  assert.deepEqual(RES_SCHEMA.properties.display.properties.min_resolution.enum, CATALOG.display.min_resolutions);
  assert.deepEqual(RES_SCHEMA.properties.display.properties.wire_resolution.enum, CATALOG.display.wire_resolutions);
  assert.deepEqual(RES_SCHEMA.properties.fps.properties.target.enum, CATALOG.fps.targets);
  assert.deepEqual(RES_SCHEMA.properties.processing.properties.tier.enum, CATALOG.processing.tiers);
  assert.deepEqual(RES_SCHEMA.properties.degrade.properties.order.items.enum, CATALOG.degrade.keys);
  assert.deepEqual(RES_SCHEMA.properties.thermal.properties.limits.required, CATALOG.thermal.limit_keys);
});

test('13 VPP levers in the catalog are exactly the R5 allowlist (in_vpp_levers)', () => {
  const r5 = R5_SPEC.settings_allowlist.device_applier.keys
    .filter((k) => k.in_vpp_levers)
    .map((k) => k.key)
    .sort();
  assert.deepEqual([...client.ACTUATOR_ALLOWLIST].sort(), r5);
});

test('request catalog has no LAB-owned feature and keeps SoC canonical set from R5', () => {
  assert.equal(CATALOG.provenance.excluded_from_request.includes('lab_ssot'), true);
  assert.equal(CATALOG.provenance.request.includes('lab_ssot'), false);
  assert.deepEqual(CATALOG.socs.canonical, R5_SPEC.soc_gate.default_allow);
  assert.deepEqual(client.NO_WIRE_8K_SOCS, ['s905x4', 's905x3', 'mt8696', 'amlogic']);
});

// ── HMAC vectors (wire canonical frozen at V1 by R6-D3-AUTH-02) ──────────────

test('request signature matches the published deterministic vector', () => {
  const rawBody = JSON.stringify({ hello: 'ara-x' });
  const signed = client.signRequest({
    secret: SECRET,
    deviceId: 'onn4k-001',
    seq: 7,
    ts: 1700000000,
    nonce: 'abc123def4567890',
    rawBody
  });
  assert.equal(signed.bodyHash, 'b6779f1db95a683d9319f6729e4ca4032dbb55b229999b55e09d9c00245a4ea3');
  assert.equal(signed.sig, '0e5851ac8086b730f3cbd22d138ececaaebc140b8b4c6582c590c0b078ad68be');
  assert.equal(signed.headers['X-ARA-Sig'], signed.sig);
  assert.equal(signed.headers['X-ARA-Sync-Version'], '2');
});

test('response signature matches the published deterministic vector', () => {
  const rawBody = JSON.stringify({ ok: true });
  const ok = client.verifyResponseSignature({
    secret: SECRET,
    deviceId: 'onn4k-001',
    reqSeq: 7,
    respTs: 1700000000,
    rawBody,
    headers: { 'X-ARA-Sig': '2f00f129bb601a8a913db5bfae0d3e32fd2343141a7208b31500cf0e9b9ecf17' }
  });
  assert.equal(ok, true);
});

test('response signature rejects tampering', () => {
  const ok = client.verifyResponseSignature({
    secret: SECRET,
    deviceId: 'onn4k-001',
    reqSeq: 7,
    respTs: 1700000000,
    rawBody: JSON.stringify({ ok: false }),
    headers: { 'X-ARA-Sig': '2f00f129bb601a8a913db5bfae0d3e32fd2343141a7208b31500cf0e9b9ecf17' }
  });
  assert.equal(ok, false);
});

// ── Request build + schema ───────────────────────────────────────────────────

test('buildSyncRequest produces a schema-valid honest v2 body under the 16 KB limit', () => {
  const payload = validRequestPayload();
  const built = buildFromPayload(payload);
  assert.deepEqual(JSON.parse(built.rawBody), payload);
  assert.ok(Buffer.byteLength(built.rawBody, 'utf8') < client.MAX_BODY_BYTES);
  assert.match(built.headers['X-ARA-Sig'], /^[a-f0-9]{64}$/);
  assert.equal(built.headers['X-ARA-Sync-Version'], '2');
  assert.deepEqual(miniSchema.validate(built.payload, REQ_SCHEMA), []);
});

test('buildSyncRequest canonicalizes SoC aliases and keeps soc_raw for diagnostics', () => {
  const built = buildFromPayload(validRequestPayload());
  assert.equal(built.payload.client.soc, 's905x4');
  assert.equal(built.payload.client.soc_raw, 'amlogic_s905x4');

  for (const [raw, canonical] of [
    ['amlogic_s905x4', 's905x4'],
    ['amlogic-s905x4', 's905x4'],
    ['S905X4', 's905x4'],
    ['mediatek_mt8696', 'mt8696'],
    ['firetv_mt8696', 'mt8696'],
    ['amlogic', 'amlogic']
  ]) {
    assert.equal(client.canonicalSoc(raw), canonical, raw);
  }
  assert.equal(client.canonicalSoc('rk3588'), null);
});

test('request schema requires ref (artifact identity), not just list_version', () => {
  const missing = validRequestPayload();
  delete missing.ref;
  assert.ok(miniSchema.validate(missing, REQ_SCHEMA).some((e) => e.includes('missing required property ref')));
  assert.throws(() => client.validateRequestPayload(structuredClone(missing)), /ref must be an object/);

  const extra = validRequestPayload();
  extra.ref.etag = 'W/"x"';
  assert.ok(miniSchema.validate(extra, REQ_SCHEMA).some((e) => e.includes('unexpected property etag')));
  assert.throws(() => client.validateRequestPayload(structuredClone(extra)), /unexpected key etag/);

  const upper = validRequestPayload();
  upper.ref.artifact_sha256 = upper.ref.artifact_sha256.toUpperCase();
  assert.ok(miniSchema.validate(upper, REQ_SCHEMA).some((e) => e.includes('does not match pattern')));
  assert.throws(() => client.validateRequestPayload(structuredClone(upper)), /64 lowercase hex/);
});

test('artifact identity helpers: same generation vs cross-generation mismatch', () => {
  assert.equal(client.sameArtifact(TEST_ARTIFACT, { ...TEST_ARTIFACT }), true);
  assert.equal(client.sameArtifact(TEST_ARTIFACT, { ...TEST_ARTIFACT, artifact_sha256: 'f'.repeat(64) }), false);
  assert.equal(client.sameArtifact(TEST_ARTIFACT, { ...TEST_ARTIFACT, generation_id: 'other' }), false);
  assert.equal(client.sameArtifact(null, TEST_ARTIFACT), false);

  const serverRef = {
    ...TEST_ARTIFACT,
    lab_exported_at: '2026-10-26T01:31:05'
  };
  assert.equal(client.artifactMismatch(TEST_ARTIFACT, serverRef), null);
  assert.equal(client.artifactMismatch(TEST_ARTIFACT, { ...serverRef, list_version: '2026-10-31T00:00:00Z' }), 'list_version_mismatch');
  assert.equal(client.artifactMismatch(TEST_ARTIFACT, { ...serverRef, artifact_sha256: 'e'.repeat(64) }), 'artifact_mismatch');
});

test('request schema rejects missing/extra fields and the deprecated v1 envelope', () => {
  const missing = validRequestPayload();
  delete missing.nonce;
  assert.ok(miniSchema.validate(missing, REQ_SCHEMA).some((e) => e.includes('missing required property nonce')));

  const extra = validRequestPayload();
  extra.extra = 1;
  assert.ok(miniSchema.validate(extra, REQ_SCHEMA).some((e) => e.includes('unexpected property extra')));

  const v1 = validRequestPayload();
  v1.v = 1;
  assert.ok(miniSchema.validate(v1, REQ_SCHEMA).some((e) => e.includes('value not in enum')));
  assert.throws(() => client.validateRequestPayload(v1), /unsupported request version/);
});

test('honesty rules: null<->unavailable, no lab_ssot in request, ADB-only provenance', () => {
  const p = validRequestPayload();
  p.metrics.features.cpu_temp_c = feat(62.5, 'derived'); // ADB-only must be measured_device
  assert.throws(() => client.validateRequestPayload(structuredClone(p)), /ADB-only/);

  const p2 = validRequestPayload();
  p2.metrics.features.cpu_temp_c = feat(null, 'measured_device');
  assert.throws(() => client.validateRequestPayload(structuredClone(p2)), /prov=unavailable/);

  const p3 = validRequestPayload();
  p3.metrics.features.ram_available_pct = feat(38, 'unavailable');
  assert.throws(() => client.validateRequestPayload(structuredClone(p3)), /requires value=null/);

  const p4 = validRequestPayload();
  p4.metrics.features.ram_available_pct = feat(38, 'lab_ssot');
  assert.throws(() => client.validateRequestPayload(structuredClone(p4)), /LAB-owned|prov not allowed in request/);

  const p5 = validRequestPayload();
  p5.metrics.features.invented_metric = feat(1, 'measured_device');
  assert.throws(() => client.validateRequestPayload(structuredClone(p5)), /not in catalog/);

  const p6 = validRequestPayload();
  p6.metrics.features.ram_available_pct = feat(140, 'measured_device');
  assert.throws(() => client.validateRequestPayload(structuredClone(p6)), /out of range/);
});

test('events accept decoder_error and device_capabilities but reject unknown types', () => {
  const stats = { decoder_error: 0, device_capabilities: 0 };
  for (const type of ['decoder_error', 'device_capabilities']) {
    const p = validRequestPayload();
    p.events = [{ type, prov: 'measured_device', age_ms: 1000 }];
    assert.equal(client.validateRequestPayload(p), p);
    stats[type] += 1;
  }
  assert.deepEqual(stats, { decoder_error: 1, device_capabilities: 1 });

  const bad = validRequestPayload();
  bad.events = [{ type: 'invented_event', prov: 'measured_device', age_ms: 0 }];
  assert.throws(() => client.validateRequestPayload(bad), /event type not in enum/);
});

test('state.levers are validated against the VPP allowlist', () => {
  const bad = validRequestPayload();
  bad.state.levers = { invented_lever: 1 };
  assert.throws(() => client.validateRequestPayload(bad), /lever not allowlisted/);
});

test('request schema rejects an unknown top-level property and a URL-like key', () => {
  const extra = validRequestPayload();
  extra.callback = 'https://example.invalid/x';
  assert.ok(miniSchema.validate(extra, REQ_SCHEMA).some((e) => e.includes('unexpected property callback')));
  assert.throws(() => client.validateRequestPayload(extra), /URL-like key|unexpected key callback/);
});

// ── D4 ack L3 in state.apply (D4-F02) ───────────────────────────────────────

function ackExample() {
  return {
    st: 'partial',
    rs: 'device_not_allowed',
    etag: 'sha256:' + 'c'.repeat(64),
    soc: { m: 's905x4', src: 'Build.HARDWARE', c: 's905x4', g: 'allowlisted', alias: 'amlogic_s905x4' },
    th: { prov: 'measured', st: 3, steps: 2, tier: 'balanced' },
    cad: 30,
    ap: ['global ai_pq_mode 2', 'global ai_sr_level 1'],
    un: 13,
    sk: [{ k: 'pq_ai_fbc_enable', r: 'value_out_of_domain' }],
    cl: [{ k: 'ai_sr_level', from: 3, to: 1 }],
    df: [{ k: 'buffer_s', r: 'player_active' }],
    hl: ['pq_sharpness_enable']
  };
}

test('state.apply (D4 ack L3) is schema-valid and accepted by the client', () => {
  const p = validRequestPayload();
  p.state.apply = ackExample();
  assert.deepEqual(miniSchema.validate(p, REQ_SCHEMA), []);
  assert.equal(client.validateRequestPayload(p), p);
  assert.equal(client.ACK_STATES.length, 5);
  assert.equal(client.ACK.limits.max_ack_bytes, 1024);
});

test('state.apply rejects invalid state, oversized lists, URLs and unknown keys', () => {
  const badState = validRequestPayload();
  badState.state.apply = { ...ackExample(), st: 'ok' };
  assert.throws(() => client.validateRequestPayload(badState), /ack_state|invalid state.apply.st/);

  const tooMany = validRequestPayload();
  tooMany.state.apply = { ...ackExample(), ap: Array.from({ length: 17 }, (_, i) => 'global ai_sr_level ' + (i % 5)) };
  assert.throws(() => client.validateRequestPayload(tooMany), /state.apply.ap invalid/);

  const badLine = validRequestPayload();
  badLine.state.apply = { ...ackExample(), ap: ['global ai_sr_level https'] };
  assert.throws(() => client.validateRequestPayload(badLine), /ap line/);

  const badDefer = validRequestPayload();
  badDefer.state.apply = { ...ackExample(), df: [{ k: 'buffer_s', r: 'whenever' }] };
  assert.throws(() => client.validateRequestPayload(badDefer), /df reason invalid/);

  const extra = validRequestPayload();
  extra.state.apply = { ...ackExample(), secret: 'x' };
  assert.throws(() => client.validateRequestPayload(extra), /unexpected key secret/);
});

test('amlogic is 4K-only: never_downscale/min_resolution/degrade guards apply (D4-F01 residual)', () => {
  const aml = structuredClone(EXAMPLE_POLICY);
  aml.device.soc = 'amlogic';
  assert.equal(client.validatePolicy(aml), true);

  const noDownscale = structuredClone(aml);
  noDownscale.display.never_downscale = false;
  assert.throws(() => client.validatePolicy(noDownscale), /never_downscale/);

  const minHd = structuredClone(aml);
  minHd.display.min_resolution = '1920x1080';
  assert.throws(() => client.validatePolicy(minHd), /min_resolution/);

  const resDegrade = structuredClone(aml);
  resDegrade.degrade.order = ['fps', 'resolution'];
  assert.throws(() => client.validatePolicy(resDegrade), /may not include resolution/);
});

// ── Policy guards ────────────────────────────────────────────────────────────

test('example policy validates against schema and guards', () => {
  assert.deepEqual(miniSchema.validate(EXAMPLE_POLICY, RES_SCHEMA), []);
  assert.equal(client.validatePolicy(EXAMPLE_POLICY), true);
});

test('wire 8K is rejected on S905X4', () => {
  const bad = structuredClone(EXAMPLE_POLICY);
  bad.display = { ...bad.display, wire_resolution: '7680x4320' };
  assert.throws(() => client.validatePolicy(bad), /invalid display.wire_resolution|wire 8K/);
});

test('never_downscale=false and a downscaled min_resolution are rejected on S905X4', () => {
  const noDownscale = structuredClone(EXAMPLE_POLICY);
  noDownscale.display.never_downscale = false;
  assert.throws(() => client.validatePolicy(noDownscale), /never_downscale/);

  const minHd = structuredClone(EXAMPLE_POLICY);
  minHd.display.min_resolution = '1920x1080';
  assert.throws(() => client.validatePolicy(minHd), /min_resolution/);
});

test('degrade.order may not include resolution on a no-wire-8K SoC', () => {
  const bad = structuredClone(EXAMPLE_POLICY);
  bad.degrade.order = ['fps', 'resolution', 'processing'];
  assert.throws(() => client.validatePolicy(bad), /may not include resolution/);
});

test('fps and thermal guards are enforced', () => {
  const badFps = structuredClone(EXAMPLE_POLICY);
  badFps.fps.target = 50;
  assert.throws(() => client.validatePolicy(badFps), /invalid fps.target/);

  const badMin = structuredClone(EXAMPLE_POLICY);
  badMin.fps.min = 30;
  assert.throws(() => client.validatePolicy(badMin), /fps.min must be 24/);

  const badThermal = structuredClone(EXAMPLE_POLICY);
  badThermal.thermal.limits = { light_c: 78, moderate_c: 66, severe_c: 72, critical_c: 80 };
  assert.throws(() => client.validatePolicy(badThermal), /strictly increasing/);
});

test('processing.tier and content provenance are closed', () => {
  const badTier = structuredClone(EXAMPLE_POLICY);
  badTier.processing.tier = 'ultra';
  assert.throws(() => client.validatePolicy(badTier), /invalid processing.tier/);

  const badProv = structuredClone(EXAMPLE_POLICY);
  badProv.content.prov = 'measured_device';
  assert.throws(() => client.validatePolicy(badProv), /content.prov must be lab_ssot/);
});

test('levers outside the existing allowlist are rejected', () => {
  const bad = structuredClone(EXAMPLE_POLICY);
  bad.device.levers = { invented_lever: 1 };
  assert.throws(() => client.validatePolicy(bad), /lever not allowlisted: invented_lever/);
});

test('blend that does not sum to 1 is rejected', () => {
  const bad = structuredClone(EXAMPLE_POLICY);
  bad.profile.blend = { P1: 0.2, P2: 0.7 };
  assert.throws(() => client.validatePolicy(bad), /must sum to 1/);
});

test('URL-like keys are rejected anywhere in the policy', () => {
  const bad = structuredClone(EXAMPLE_POLICY);
  bad.player.url = 'https://example.invalid/segment.ts';
  assert.throws(() => client.validatePolicy(bad), /URL-like key/);
});

test('policy TTL and expiry are enforced', () => {
  const longTtl = structuredClone(EXAMPLE_POLICY);
  longTtl.valid_until = longTtl.ts + client.MAX_POLICY_TTL_S + 1;
  assert.throws(() => client.validatePolicy(longTtl), /TTL exceeds/);

  assert.throws(() => client.validatePolicy(EXAMPLE_POLICY, { nowS: EXAMPLE_POLICY.valid_until + 1 }), /already expired/);
});

test('policy can only echo a canonical SoC', () => {
  const bad = structuredClone(EXAMPLE_POLICY);
  bad.device.soc = 'amlogic_s905x4';
  assert.throws(() => client.validatePolicy(bad), /device.soc must be canonical/);
});

// ── Response freshness (R6-D3-REPLAY-07/08) ─────────────────────────────────

test('response freshness rejects device/seq mismatch, stale ts and expired policy', () => {
  const request = { device_id: 'onn4k-001', seq: 7 };
  assert.equal(client.validateResponseFreshness({ policy: EXAMPLE_POLICY, request, nowS: EXAMPLE_POLICY.ts }), true);

  assert.throws(
    () => client.validateResponseFreshness({ policy: { ...EXAMPLE_POLICY, device_id: 'other' }, request, nowS: EXAMPLE_POLICY.ts }),
    /device_id does not match/
  );
  assert.throws(
    () => client.validateResponseFreshness({ policy: { ...EXAMPLE_POLICY, seq: 8 }, request, nowS: EXAMPLE_POLICY.ts }),
    /seq does not match/
  );
  assert.throws(
    () => client.validateResponseFreshness({ policy: EXAMPLE_POLICY, request, nowS: EXAMPLE_POLICY.ts - 31 }),
    /ts outside/
  );
  assert.throws(
    () => client.validateResponseFreshness({ policy: EXAMPLE_POLICY, request, nowS: EXAMPLE_POLICY.valid_until + 1 }),
    /already expired/
  );
});

// ── Replay primitives + client persistence ──────────────────────────────────

test('sequence, timestamp and nonce windows', () => {
  assert.equal(client.isSequenceNew(7, 7), false);
  assert.equal(client.isSequenceNew(7, 8), true);
  assert.equal(client.isSequenceNew(7, 6), false);
  assert.equal(client.isFreshTimestamp(1700000000, 1700000300), true);
  assert.equal(client.isFreshTimestamp(1700000000, 1700000301), false);
  assert.equal(client.isNonceFormat('abc123def4567890'), true);
  assert.equal(client.isNonceFormat('short'), false);
});

test('SyncStateStore persists seq/nonce before send and reuses the same request on retry', () => {
  let i = 0;
  const store = new client.SyncStateStore({ seq: 6, nonceFactory: () => 'nonce' + String(++i).padStart(11, '0') });
  const first = store.prepare({ nowS: 1700000000 });
  assert.deepEqual(first, { seq: 7, nonce: 'nonce00000000001', ts: 1700000000 });
  assert.deepEqual(store.retry(), first);
  assert.deepEqual(store.prepare({ nowS: 1700000030 }), first); // no advances while pending
  assert.equal(store.commit(true), 7);
  assert.equal(store.retry(), null);
  const second = store.prepare({ nowS: 1700000030 });
  assert.equal(second.seq, 8);
  assert.equal(store.commit(false), 7);
  assert.deepEqual(store.retry(), second); // failure keeps the same request for idempotent retry
});

// ── Scheduler + cache ────────────────────────────────────────────────────────

test('scheduler cadence, jitter and exponential backoff are deterministic', () => {
  const scheduler = new client.SyncScheduler({ rng: () => 0.5 });
  assert.equal(scheduler.nextDelayMs(), 30000);

  const delays = [];
  for (let i = 0; i < 8; i += 1) delays.push(scheduler.onFailure());
  assert.deepEqual(delays, [5000, 8000, 12800, 20480, 32768, 52429, 83886, 120000]);
  assert.equal(scheduler.onSuccess(), 30000);
  assert.deepEqual(scheduler.state, { failures: 0, baseS: 30 });
});

test('policy cache serves the last good policy until TTL, then fails open to a v2 safe default', () => {
  const cache = new client.PolicyCache({ soc: 's905x4' });
  cache.set(EXAMPLE_POLICY);

  const fresh = cache.resolve(EXAMPLE_POLICY.valid_until - 1);
  assert.equal(fresh.source, 'cache');
  assert.equal(fresh.policy.seq, EXAMPLE_POLICY.seq);

  const expired = cache.resolve(EXAMPLE_POLICY.valid_until + 1);
  assert.equal(expired.source, 'safe_default');
  assert.equal(client.validatePolicy(expired.policy), true);
  assert.equal(expired.policy.v, 2);
  assert.equal(expired.policy.display.wire_resolution, '3840x2160');
  assert.equal(expired.policy.display.min_resolution, '3840x2160');
  assert.equal(expired.policy.display.never_downscale, true);
  assert.equal(expired.policy.display.eight_k, 'presentation_only');
  assert.deepEqual(expired.policy.degrade.order, ['fps', 'processing']);
  assert.equal(expired.policy.device.allowed, false);
  assert.deepEqual(expired.policy.device.levers, {});
});

test('safe default policy is schema-valid for known and unknown SoCs', () => {
  for (const soc of ['s905x4', 'mt8696', 'unknown']) {
    const safe = client.safeDefaultPolicy({ soc, deviceId: 'onn4k-001', seq: 9, ts: 1700000000 });
    assert.deepEqual(miniSchema.validate(safe, RES_SCHEMA), []);
    assert.equal(safe.profile.active, 'P2');
    assert.equal(safe.device.allowed, false);
    if (soc === 'unknown') {
      // D4-F10: SoC no identificado = fail-closed, sin reclamar 4K ni presentación 8K.
      assert.equal(safe.device.soc, 'unknown');
      assert.deepEqual(safe.device.levers, {});
      assert.equal(safe.display.eight_k, 'disabled');
      assert.equal(safe.display.wire_resolution, '1920x1080');
      assert.equal(safe.display.min_resolution, '1920x1080');
      assert.equal(safe.display.never_downscale, true);
      assert.equal(safe.controls.flags[0], 'soc_unmapped');
      assert.equal(safe.controls.flags.includes('offline_safe_default'), true);
    } else {
      assert.equal(safe.display.eight_k, 'presentation_only');
    }
  }
});

test('applyPolicy returns only knobs (new v2 fields included), never URLs', () => {
  const plan = client.applyPolicy(EXAMPLE_POLICY);
  assert.deepEqual(Object.keys(plan).sort(), [
    'content', 'controls', 'degrade', 'device', 'display', 'fps', 'player', 'processing', 'profile', 'ref', 'thermal'
  ]);
  const serialized = JSON.stringify(plan).toLowerCase();
  assert.equal(serialized.includes('http://'), false);
  assert.equal(serialized.includes('https://'), false);
  assert.equal(/"url"|"uri"|"segment_url"/.test(serialized), false);
});
