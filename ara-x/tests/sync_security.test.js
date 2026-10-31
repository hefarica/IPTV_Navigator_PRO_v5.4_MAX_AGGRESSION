'use strict';

/**
 * D3 security matrix (R6 §6, 23 cases). Deterministic, local mock only, no VPS.
 * Each case maps 1:1 to a R6-D3-* requirement; see ara-x/reports/D3_sync_contract.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = require('../vps/client/ara_sync_client.js');
const mock = require('./helpers/mock_sync_server.js');

const SECRET = 'ara-x-test-secret';
const NOW_S = 1700000000;
const EXAMPLE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'vps', 'schema', 'device_policy.example.json'), 'utf8')
);

function feat(value, prov, ageMs = 0, conf = 0.9) {
  return { value, prov, age_ms: ageMs, conf };
}

function payloadFor({ seq = 7, ts = NOW_S, nonce = 'abc123def4567890', deviceId = 'onn4k-001' } = {}) {
  return {
    v: 2,
    type: 'ara_x_sync',
    device_id: deviceId,
    seq,
    ts,
    nonce,
    client: {
      app: 'ape-crystal-agent',
      version: '2.3.0-noWG',
      soc: 's905x4',
      android: 11,
      player: 'exoplayer'
    },
    ref: {
      artifact_sha256: mock.ARTIFACT.sha256,
      generation_id: mock.ARTIFACT.generation_id,
      list_version: mock.ARTIFACT.list_version
    },
    metrics: {
      window_s: 30,
      conf: 0.9,
      features: {
        vst_ms: feat(800, 'measured_device'),
        rebuffer_ms: feat(0, 'measured_device'),
        fps_declared: feat(25, 'measured_device'),
        fps_effective: feat(25, 'measured_device'),
        buffer_ms: feat(45000, 'measured_device'),
        bitrate_bps: feat(25000000, 'measured_device'),
        rtt_ms: feat(30, 'measured_server'),
        cpu_temp_c: feat(null, 'unavailable'),
        pm_thermal_status: feat(1, 'measured_device')
      },
      source: { resolution: '1920x1080', codec: 'hvc1.2.4.L123.B0', fps: 25, hdr: 'SDR', prov: 'measured_device', age_ms: 0 }
    },
    state: {
      active_profile: 'P2',
      profile_blend: { P0: 0, P1: 0, P2: 1, P3: 0, P4: 0, P5: 0 },
      levers: {}
    }
  };
}

function signed({ payload, secret = SECRET, keyId = 'k1', seq, ts, nonce } = {}) {
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

function rawPost(url, body, headers = {}) {
  return fetch(url + '/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
}

function applyIfVerifiable({ status, raw, sig, secret = SECRET, deviceId, reqSeq, respTs }) {
  if (status === 204 || !sig || raw === null || raw === '') return false;
  const okSig = client.verifyResponseSignature({ secret, deviceId, reqSeq, respTs, rawBody: raw, headers: { 'X-ARA-Sig': sig } });
  if (!okSig) return false;
  const policy = JSON.parse(raw);
  client.applyPolicy(policy, { nowS: respTs, request: { device_id: deviceId, seq: reqSeq } });
  return true;
}

// 1 · HMAC request vector
test('01 · HMAC request vector is exact (64 hex) and accepted with 200', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const built = signed();
    assert.match(built.sig, /^[a-f0-9]{64}$/);
    const res = await post(server.url, built);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('x-ara-sig'), /^[a-f0-9]{64}$/);
  } finally {
    await server.close();
  }
});

// 2 · bad signature / unknown key
test('02 · bad signature and unknown key_id are uniform 401', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const bad = signed({ seq: 7, nonce: 'aaaabbbbccccdddd' });
    const r1 = await post(server.url, { ...bad, headers: { ...bad.headers, 'X-ARA-Sig': '1'.repeat(64) } });
    assert.equal(r1.status, 401);
    assert.deepEqual(await r1.json(), { ok: false, error: 'unauthorized' });

    const unknown = signed({ keyId: 'kX', seq: 8, nonce: 'bbbbccccddddeeee' });
    const r2 = await post(server.url, unknown);
    assert.equal(r2.status, 401);
    assert.deepEqual(await r2.json(), { ok: false, error: 'unauthorized' });
  } finally {
    await server.close();
  }
});

// 3 · Bearer-only (ARA_TOKEN) cannot authenticate /sync
test('03 · Authorization Bearer without HMAC is 401 (no token-only fallback)', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const p = payloadFor();
    const res = await rawPost(server.url, JSON.stringify(p), { Authorization: 'Bearer ' + 'x'.repeat(48) });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

// 4 · ts skew ±300/301
test('04 · timestamp skew is ±300 s', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    assert.equal((await post(server.url, signed({ payload: payloadFor({ seq: 1, ts: NOW_S - 300, nonce: '1000000000000001' }) }))).status, 200);
    assert.equal((await post(server.url, signed({ payload: payloadFor({ seq: 2, ts: NOW_S - 301, nonce: '1000000000000002' }) }))).status, 401);
    assert.equal((await post(server.url, signed({ payload: payloadFor({ seq: 3, ts: NOW_S + 301, nonce: '1000000000000003' }) }))).status, 401);
  } finally {
    await server.close();
  }
});

// 5 · nonce reuse with seq+1
test('05 · reused nonce with a new seq is 409', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    assert.equal((await post(server.url, signed({ payload: payloadFor({ seq: 1, nonce: 'deadbeefdeadbeef' }) }))).status, 200);
    assert.equal((await post(server.url, signed({ payload: payloadFor({ seq: 2, nonce: 'deadbeefdeadbeef' }) }))).status, 409);
  } finally {
    await server.close();
  }
});

// 6 · seq regression
test('06 · seq equal/lower without cached result is 409', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    assert.equal((await post(server.url, signed({ payload: payloadFor({ seq: 7, nonce: '2000000000000007' }) }))).status, 200);
    assert.equal((await post(server.url, signed({ payload: payloadFor({ seq: 7, nonce: '2000000000000008' }) }))).status, 409);
    assert.equal((await post(server.url, signed({ payload: payloadFor({ seq: 6, nonce: '2000000000000009' }) }))).status, 409);
  } finally {
    await server.close();
  }
});

// 7 · identical retry after a dropped response
test('07 · identical retry within 120 s returns 200 with the same body and signature', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const built = signed({ payload: payloadFor({ seq: 9, nonce: '3000000000000009' }) });
    const first = await post(server.url, built);
    const raw = await first.text();
    const sig = first.headers.get('x-ara-sig');
    assert.equal(first.status, 200);

    const retry = await post(server.url, built);
    assert.equal(retry.status, 200);
    assert.equal(retry.headers.get('x-ara-idempotent'), '1');
    assert.equal(await retry.text(), raw);
    assert.equal(retry.headers.get('x-ara-sig'), sig);
  } finally {
    await server.close();
  }
});

// 8 · same seq, different body
test('08 · same seq with a different body is 409', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    assert.equal((await post(server.url, signed({ payload: payloadFor({ seq: 5, nonce: '4000000000000005' }) }))).status, 200);
    const p2 = payloadFor({ seq: 5, nonce: '4000000000000006' });
    p2.metrics.features.rtt_ms = feat(99, 'measured_server');
    assert.equal((await post(server.url, signed({ payload: p2 }))).status, 409);
  } finally {
    await server.close();
  }
});

// 9 · body too large
test('09 · body of 16.385 B is 413', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const res = await rawPost(server.url, 'x'.repeat(client.MAX_BODY_BYTES + 1));
    assert.equal(res.status, 413);
  } finally {
    await server.close();
  }
});

// 10 · wrong content type
test('10 · Content-Type text/plain is 415', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const res = await fetch(server.url + '/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payloadFor())
    });
    assert.equal(res.status, 415);
  } finally {
    await server.close();
  }
});

// 11 · invalid JSON / unknown field
test('11 · invalid JSON and unknown fields are 400', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    assert.equal((await rawPost(server.url, '{')).status, 400);
    const p = payloadFor();
    p.extra = 'nope';
    const res = await rawPost(server.url, JSON.stringify(p));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, 'invalid_payload');
  } finally {
    await server.close();
  }
});

// 12 · URL-like key inside request
test('12 · nested URL-like key is 400', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const p = payloadFor();
    p.metrics.source.url = 'https://example.invalid/segment.ts';
    assert.equal((await rawPost(server.url, JSON.stringify(p))).status, 400);
  } finally {
    await server.close();
  }
});

// 13 · invented lever
test('13 · invented lever in state.levers is 400 and never echoed', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const p = payloadFor();
    p.state.levers = { invented_lever: 1 };
    const res = await rawPost(server.url, JSON.stringify(p));
    assert.equal(res.status, 400);
    assert.equal((await res.text()).includes('invented_lever'), false);
  } finally {
    await server.close();
  }
});

// 14 · invalid policy is never signed
test('14 · invalid policy (wire 8K / never_downscale=false) is rejected before signing', async () => {
  const bad = structuredClone(EXAMPLE);
  bad.display.wire_resolution = '7680x4320';
  assert.throws(() => client.validatePolicy(bad), /invalid display.wire_resolution|wire 8K/);

  const server = await mock.start({
    secret: SECRET,
    nowS: NOW_S,
    policyFactory: () => structuredClone(bad)
  });
  try {
    const res = await post(server.url, signed({ payload: payloadFor({ seq: 1, nonce: '5000000000000001' }) }));
    assert.equal(res.status, 500);
    assert.equal(res.headers.get('x-ara-sig'), null);
  } finally {
    await server.close();
  }
});

// 15 · TTL above 120 s
test('15 · response valid_until > ts+120 is rejected by the client', () => {
  const bad = structuredClone(EXAMPLE);
  bad.valid_until = bad.ts + client.MAX_POLICY_TTL_S + 1;
  assert.throws(() => client.validatePolicy(bad), /TTL exceeds/);
});

// 16 · response tampering
test('16 · tampered response body is rejected by the client verifier', () => {
  const raw = JSON.stringify(EXAMPLE);
  const ok = client.verifyResponseSignature({
    secret: SECRET,
    deviceId: EXAMPLE.device_id,
    reqSeq: EXAMPLE.seq,
    respTs: EXAMPLE.ts,
    rawBody: raw,
    headers: { 'X-ARA-Sig': '0'.repeat(64) }
  });
  assert.equal(ok, false);
  assert.equal(applyIfVerifiable({ status: 200, raw, sig: '0'.repeat(64), deviceId: EXAMPLE.device_id, reqSeq: EXAMPLE.seq, respTs: EXAMPLE.ts }), false);
});

// 17 · 204 without applicable signature
test('17 · a 204 without a policy body is never applied', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const built = signed({ payload: payloadFor({ seq: 2, nonce: '6000000000000002' }) });
    const res = await post(server.url, built, { 'X-ARA-Sync-Mode': 'shadow' });
    assert.equal(res.status, 204);
    assert.equal(applyIfVerifiable({ status: res.status, raw: '', sig: res.headers.get('x-ara-sig'), deviceId: 'onn4k-001', reqSeq: 2, respTs: NOW_S }), false);
    assert.equal(applyIfVerifiable({ status: 204, raw: '', sig: null, deviceId: 'onn4k-001', reqSeq: 2, respTs: NOW_S }), false);
  } finally {
    await server.close();
  }
});

// 18 · rate limit only on /sync
test('18 · 7 requests in one minute hit 429 + Retry-After while /health keeps 200', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    let last = null;
    for (let i = 0; i < 7; i += 1) {
      const nonce = String(7000000000000000 + i);
      last = await post(server.url, signed({ payload: payloadFor({ seq: i + 1, nonce }) }));
      if (i < 6) assert.equal(last.status, 200, 'req ' + (i + 1));
    }
    assert.equal(last.status, 429);
    assert.equal(last.headers.get('retry-after'), '30');

    const health = await fetch(server.url + '/health');
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'OK');
  } finally {
    await server.close();
  }
});

// 19 · method
test('19 · GET and PUT on /sync are 405', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    assert.equal((await fetch(server.url + '/sync')).status, 405);
    assert.equal((await fetch(server.url + '/sync', { method: 'PUT', body: '{}' })).status, 405);
  } finally {
    await server.close();
  }
});

// 20 · no CORS
test('20 · /sync never sends Access-Control-Allow-Origin (200 and 401)', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const ok = await post(server.url, signed({ payload: payloadFor({ seq: 1, nonce: '8000000000000001' }) }));
    assert.equal(ok.headers.get('access-control-allow-origin'), null);
    const unauthorized = await post(server.url, signed({ keyId: 'nope', payload: payloadFor({ seq: 2, nonce: '8000000000000002' }) }));
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get('access-control-allow-origin'), null);
  } finally {
    await server.close();
  }
});

// 21 · no secret/stack leakage in errors
test('21 · error bodies never include key, sig, nonce or stack', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const built = signed({ keyId: 'nope', payload: payloadFor({ seq: 3, nonce: '9000000000000003' }) });
    const res = await post(server.url, built);
    const body = await res.text();
    assert.equal(res.status, 401);
    assert.equal(body.includes('9000000000000003'), false);
    assert.equal(body.includes('X-ARA-Sig'), false);
    assert.equal(body.includes('stack'), false);
    assert.deepEqual(JSON.parse(body), { ok: false, error: 'unauthorized' });
  } finally {
    await server.close();
  }
});

// 22 · purge TTLs and row cap
test('22 · replay expires at 120 s, nonce at 600 s and replay rows are capped', async () => {
  let now = NOW_S;
  const server = await mock.start({ secret: SECRET, nowS: () => now });
  try {
    const built = signed({ payload: payloadFor({ seq: 7, nonce: 'a000000000000007' }) });
    assert.equal((await post(server.url, built)).status, 200);
    const st = server.state.get('onn4k-001');
    assert.equal(st.replay.has(7), true);
    assert.equal(st.nonces.size, 1);

    // t+121 s: still inside the ±300 s auth window, but the idempotency cache (120 s)
    // and the replay answer are gone -> nonce reuse is a conflict.
    now = NOW_S + 121;
    assert.equal((await post(server.url, built)).status, 409);

    // Advance 601 s: nonce (>600 s) and replay are purged on the next request.
    now = NOW_S + 601;
    const next = signed({ payload: payloadFor({ seq: 8, nonce: 'a000000000000008', ts: now }) });
    assert.equal((await post(server.url, next)).status, 200);
    assert.equal(st.replay.has(7), false);
    assert.equal(st.replay.has(8), true);

    const fake = { replay: new Map() };
    for (let i = 0; i < 300; i += 1) fake.replay.set(i, {});
    assert.equal(mock.capReplay(fake, 256), 256);
    assert.equal(fake.replay.has(0), false);
    assert.equal(fake.replay.has(299), true);
  } finally {
    await server.close();
  }
});

// 23 · key rotation window
test('23 · old key is accepted until retires_at; new key works during the window', async () => {
  let now = NOW_S;
  const S1 = 'rotation-secret-old';
  const S2 = 'rotation-secret-new';
  const server = await mock.start({
    nowS: () => now,
    keys: {
      k1: { secret: S1, device_ids: null, retires_at: NOW_S + 3600 },
      k2: { secret: S2, device_ids: null }
    }
  });
  try {
    assert.equal((await post(server.url, signed({ secret: S1, keyId: 'k1', payload: payloadFor({ seq: 1, nonce: 'b000000000000001' }) }))).status, 200);
    assert.equal((await post(server.url, signed({ secret: S2, keyId: 'k2', payload: payloadFor({ seq: 2, nonce: 'b000000000000002' }) }))).status, 200);

    now = NOW_S + 3601;
    assert.equal((await post(server.url, signed({ secret: S1, keyId: 'k1', payload: payloadFor({ seq: 3, nonce: 'b000000000000003', ts: now }) }))).status, 401);
    assert.equal((await post(server.url, signed({ secret: S2, keyId: 'k2', payload: payloadFor({ seq: 4, nonce: 'b000000000000004', ts: now }) }))).status, 200);
  } finally {
    await server.close();
  }
});
