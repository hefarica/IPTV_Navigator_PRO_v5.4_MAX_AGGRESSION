'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const client = require('../vps/client/ara_sync_client.js');
const mock = require('./helpers/mock_sync_server.js');

const SECRET = 'ara-x-test-secret';
const NOW_S = 1700000000;

function feat(value, prov, ageMs = 0, conf = 0.9) {
  return { value, prov, age_ms: ageMs, conf };
}

function metrics(overrides = {}) {
  return {
    window_s: 30,
    conf: 0.88,
    features: {
      vst_ms: feat(700, 'measured_device'),
      startup_outcome: feat('ok', 'measured_device'),
      rebuffer_events: feat(0, 'measured_device'),
      rebuffer_ms: feat(0, 'measured_device'),
      fps_declared: feat(25, 'measured_device'),
      fps_effective: feat(24.9, 'measured_device'),
      buffer_ms: feat(45000, 'measured_device'),
      bitrate_bps: feat(25000000, 'measured_device'),
      rtt_ms: feat(31, 'measured_server'),
      pm_thermal_status: feat(1, 'measured_device'),
      cpu_temp_c: feat(null, 'unavailable'),
      ...overrides
    },
    source: { resolution: '1920x1080', codec: 'hvc1.2.4.L123.B0', fps: 25, hdr: 'SDR', prov: 'measured_device', age_ms: 400 }
  };
}

function payloadFor({ seq = 7, ts = NOW_S, nonce = 'abc123def4567890', state = 'playing' } = {}) {
  return {
    v: 2,
    type: 'ara_x_sync',
    device_id: 'onn4k-001',
    seq,
    ts,
    nonce,
    client: {
      app: 'ape-crystal-agent',
      version: '2.3.0-noWG',
      soc: 's905x4',
      soc_raw: 'amlogic_s905x4',
      android: 11,
      player: 'exoplayer'
    },
    ref: {
      artifact_sha256: mock.ARTIFACT.sha256,
      generation_id: mock.ARTIFACT.generation_id,
      list_version: mock.ARTIFACT.list_version
    },
    session: { playback_state: state, list_version: '2026-10-30T22:07:37Z' },
    metrics: metrics(),
    state: {
      active_profile: 'P2',
      profile_blend: { P0: 0, P1: 0, P2: 1, P3: 0, P4: 0, P5: 0 },
      levers: {}
    }
  };
}

function signed({ seq = 7, ts = NOW_S, nonce = 'abc123def4567890', payload, secret = SECRET, keyId = 'k1' } = {}) {
  const p = payload || payloadFor({ seq, ts, nonce });
  return client.buildSyncRequest({
    secret,
    keyId,
    deviceId: p.device_id,
    seq: p.seq,
    ts: p.ts,
    nonce: p.nonce,
    client: p.client,
    ref: p.ref,
    metrics: p.metrics,
    state: p.state,
    session: p.session,
    events: p.events,
    capabilities: p.capabilities
  });
}

function post(url, built, extraHeaders = {}) {
  return fetch(url + '/sync', {
    method: 'POST',
    headers: { ...built.headers, ...extraHeaders },
    body: built.rawBody
  });
}

test('E2E: honest v2 request → HMAC → policy → verify → apply (no VPS)', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const built = signed();
    const res = await post(server.url, built);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('access-control-allow-origin'), null);

    const raw = await res.text();
    const policy = JSON.parse(raw);
    const sig = res.headers.get('x-ara-sig');
    assert.match(sig, /^[a-f0-9]{64}$/);

    assert.equal(
      client.verifyResponseSignature({ secret: SECRET, deviceId: 'onn4k-001', reqSeq: 7, respTs: policy.ts, rawBody: raw, headers: { 'X-ARA-Sig': sig } }),
      true
    );
    assert.equal(client.validatePolicy(policy, { nowS: NOW_S }), true);
    assert.equal(policy.v, 2);
    assert.equal(policy.display.min_resolution, '3840x2160');
    assert.equal(policy.display.never_downscale, true);
    assert.equal(policy.display.eight_k, 'presentation_only');
    assert.deepEqual(policy.degrade.order, ['fps', 'processing']);
    assert.equal(policy.content.prov, 'lab_ssot');
    assert.equal(policy.thermal.status, 1);
    assert.equal(policy.ref.artifact_sha256, mock.ARTIFACT.sha256);
    assert.equal(policy.ref.generation_id, mock.ARTIFACT.generation_id);
    assert.equal(policy.controls.flags.includes('artifact_mismatch'), false);

    const plan = client.applyPolicy(policy, { nowS: NOW_S, request: built.payload });
    assert.equal(plan.player.buffer_s, 45);
    assert.equal(plan.processing.tier, 'quality');
    assert.equal(plan.fps.target, 30);
    assert.equal(plan.ref.artifact_sha256, mock.ARTIFACT.sha256);
    assert.equal(JSON.stringify(plan).includes('http://'), false);
  } finally {
    await server.close();
  }
});

test('E2E: thermal guard degrades profile/processing and raises buffer', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const p = payloadFor({ seq: 8, nonce: 'bbbbccccddddeeee' });
    p.metrics.features.pm_thermal_status = feat(4, 'measured_device');
    p.metrics.features.cpu_temp_c = feat(null, 'unavailable'); // ADB-only: null is honest
    const built = signed({ payload: p });

    const res = await post(server.url, built);
    assert.equal(res.status, 200);
    const policy = JSON.parse(await res.text());
    assert.equal(policy.profile.active, 'P3');
    assert.equal(policy.profile.reason, 'thermal_guard');
    assert.equal(policy.player.buffer_s, 60);
    assert.equal(policy.device.thermal_target_c, 65);
    assert.equal(policy.thermal.status, 4);
    assert.equal(policy.processing.tier, 'minimal');
    assert.equal(client.validatePolicy(policy, { nowS: NOW_S }), true);
  } finally {
    await server.close();
  }
});

test('E2E: identical retry returns the cached signed answer (idempotent 200)', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const built = signed();
    const first = await post(server.url, built);
    assert.equal(first.status, 200);
    const firstRaw = await first.text();
    const firstSig = first.headers.get('x-ara-sig');

    const second = await post(server.url, built);
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('x-ara-idempotent'), '1');
    assert.equal(await second.text(), firstRaw);
    assert.equal(second.headers.get('x-ara-sig'), firstSig);
  } finally {
    await server.close();
  }
});

test('E2E: nonce reuse with a new seq is rejected with 409', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    assert.equal((await post(server.url, signed({ seq: 7, nonce: 'abc123def4567890' }))).status, 200);
    const res = await post(server.url, signed({ seq: 8, nonce: 'abc123def4567890' }));
    assert.equal(res.status, 409);
  } finally {
    await server.close();
  }
});

test('E2E: stale timestamp and bad signature are uniform 401', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const stale = signed({ ts: NOW_S - 400, seq: 9, nonce: 'ffff000011112222' });
    const r1 = await post(server.url, stale);
    assert.equal(r1.status, 401);
    assert.deepEqual(await r1.json(), { ok: false, error: 'unauthorized' });

    const bad = signed({ seq: 10, nonce: 'aaaabbbbccccdddd' });
    const r2 = await post(server.url, { ...bad, headers: { ...bad.headers, 'X-ARA-Sig': '0'.repeat(64) } });
    assert.equal(r2.status, 401);
    assert.deepEqual(await r2.json(), { ok: false, error: 'unauthorized' });
  } finally {
    await server.close();
  }
});

test('E2E: stale local catalog is flagged by artifact identity (ETag/Range are not trusted)', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const p = payloadFor({ seq: 12, nonce: '2222333344445555' });
    p.ref = {
      artifact_sha256: 'e'.repeat(64),
      generation_id: 'gen-old-20261029T115423Z',
      list_version: '2026-10-29T11:54:23Z'
    };
    const res = await post(server.url, signed({ payload: p }));
    assert.equal(res.status, 200);
    const policy = JSON.parse(await res.text());
    assert.equal(policy.controls.flags.includes('artifact_mismatch'), true);
    assert.equal(policy.ref.artifact_sha256, mock.ARTIFACT.sha256);
    assert.equal(client.artifactMismatch(p.ref, policy.ref), 'artifact_mismatch');
    assert.equal(client.validatePolicy(policy, { nowS: NOW_S }), true);
  } finally {
    await server.close();
  }
});

test('E2E: shadow mode returns 204 and no policy body', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const built = signed({ seq: 11, nonce: '1111222233334444' });
    const res = await post(server.url, built, { 'X-ARA-Sync-Mode': 'shadow' });
    assert.equal(res.status, 204);
    assert.equal(await res.text(), '');
    assert.equal(res.headers.get('x-ara-sync-mode'), 'shadow');
  } finally {
    await server.close();
  }
});
