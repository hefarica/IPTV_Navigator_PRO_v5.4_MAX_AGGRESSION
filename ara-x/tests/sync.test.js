'use strict';

/**
 * I3 · contrato del endpoint `/sync` staged (t15).
 *
 * Cubre la aceptación de la tarea: esquemas, HMAC 200, firma inválida 401, skew 401,
 * replay 409, rate-limit 429, D4-F10 (SoC unknown fail-closed), las 3 traducciones
 * contrato→wire del ack, ausencia de secretos/logs y el estado staged/NOT_RUN.
 *
 * Sin red externa y sin VPS: usa el mock loopback y el checker estático.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = require('../vps/client/ara_sync_client.js');
const mock = require('./helpers/mock_sync_server.js');
const miniSchema = require('./helpers/mini_schema.js');
const checker = require('../scripts/sync/check_sync_contract.js');

const SECRET = 'ara-x-test-secret';
const NOW_S = 1700000000;
const SCHEMA_DIR = path.join(__dirname, '..', 'vps', 'schema');
const REQ_SCHEMA = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'sync_request.schema.json'), 'utf8'));
const RES_SCHEMA = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'sync_response.schema.json'), 'utf8'));
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'device_policy.example.json'), 'utf8'));

function feat(value, prov, ageMs = 0, conf = 0.9) {
  return { value, prov, age_ms: ageMs, conf };
}

function payload({ seq = 7, ts = NOW_S, nonce = 'abc123def4567890', soc = 's905x4', socRaw } = {}) {
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
      soc,
      ...(socRaw !== undefined ? { soc_raw: socRaw } : {}),
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
        pm_thermal_status: feat(1, 'measured_device'),
        cpu_temp_c: feat(null, 'unavailable')
      },
      source: { resolution: '1920x1080', codec: 'hvc1.2.4.L123.B0', fps: 25, hdr: 'SDR', prov: 'measured_device', age_ms: 0 }
    },
    state: { active_profile: 'P2', profile_blend: { P2: 1 }, levers: {} }
  };
}

function signed({ payload: p, secret = SECRET, keyId = 'k1' } = {}) {
  const body = p || payload();
  return client.buildSyncRequest({
    secret,
    keyId,
    deviceId: body.device_id,
    seq: body.seq,
    ts: body.ts,
    nonce: body.nonce,
    client: body.client,
    ref: body.ref,
    metrics: body.metrics,
    state: body.state,
    session: body.session,
    events: body.events,
    capabilities: body.capabilities
  });
}

function post(url, built, headers = {}) {
  return fetch(url + '/sync', { method: 'POST', headers: { ...built.headers, ...headers }, body: built.rawBody });
}

test('schemas request/response parsean y el ejemplo valida en ambos', () => {
  assert.deepEqual(miniSchema.validate(EXAMPLE, RES_SCHEMA), []);
  const p = payload();
  assert.deepEqual(miniSchema.validate(p, REQ_SCHEMA), []);
  assert.equal(client.validateRequestPayload(p), p);
});

test('HMAC correcto → 200 con firma de respuesta válida', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const res = await post(server.url, signed({ payload: payload({ seq: 1, nonce: '1000000000000001' }) }));
    assert.equal(res.status, 200);
    const raw = await res.text();
    const policy = JSON.parse(raw);
    assert.equal(client.verifyResponseSignature({
      secret: SECRET,
      deviceId: 'onn4k-001',
      reqSeq: 1,
      respTs: policy.ts,
      rawBody: raw,
      headers: { 'X-ARA-Sig': res.headers.get('x-ara-sig') }
    }), true);
    assert.equal(client.validatePolicy(policy, { nowS: NOW_S }), true);
  } finally {
    await server.close();
  }
});

test('firma inválida → 401 uniforme', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const built = signed({ payload: payload({ seq: 1, nonce: '2000000000000001' }) });
    const res = await post(server.url, { ...built, headers: { ...built.headers, 'X-ARA-Sig': '0'.repeat(64) } });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false, error: 'unauthorized' });
  } finally {
    await server.close();
  }
});

test('timestamp fuera de ventana ±300 s → 401', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const past = await post(server.url, signed({ payload: payload({ seq: 1, ts: NOW_S - 301, nonce: '3000000000000001' }) }));
    assert.equal(past.status, 401);
    const future = await post(server.url, signed({ payload: payload({ seq: 2, ts: NOW_S + 301, nonce: '3000000000000002' }) }));
    assert.equal(future.status, 401);
  } finally {
    await server.close();
  }
});

test('replay → 409 (mismo seq con body distinto; nonce reusado)', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    assert.equal((await post(server.url, signed({ payload: payload({ seq: 5, nonce: '4000000000000005' }) }))).status, 200);
    const sameSeq = payload({ seq: 5, nonce: '4000000000000006' });
    sameSeq.metrics.features.rtt_ms = feat(99, 'measured_server');
    assert.equal((await post(server.url, signed({ payload: sameSeq }))).status, 409);
    assert.equal((await post(server.url, signed({ payload: payload({ seq: 6, nonce: '4000000000000005' }) }))).status, 409);
  } finally {
    await server.close();
  }
});

test('rate-limit de /sync → 429 con Retry-After (contrato R6)', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    let last;
    for (let i = 1; i <= 7; i += 1) {
      last = await post(server.url, signed({ payload: payload({ seq: i, nonce: String(5000000000000000 + i) }) }));
    }
    assert.equal(last.status, 429);
    assert.equal(last.headers.get('retry-after'), '30');
    assert.equal((await fetch(server.url + '/health')).status, 200);
  } finally {
    await server.close();
  }
});

test('D4-F10: SoC desconocido se admite como unknown+soc_raw (fail-closed, sin 400 silencioso)', async () => {
  const p = payload({ seq: 1, nonce: '6000000000000001', soc: 'rk3588', socRaw: 'rk3588' });
  const built = signed({ payload: p });
  assert.equal(built.payload.client.soc, 'unknown');
  assert.equal(built.payload.client.soc_raw, 'rk3588');
  assert.deepEqual(miniSchema.validate(built.payload, REQ_SCHEMA), []);

  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const res = await post(server.url, built);
    assert.equal(res.status, 200);
    const policy = JSON.parse(await res.text());
    assert.equal(policy.device.soc, 'unknown');
    assert.equal(policy.device.allowed, false);
    assert.deepEqual(policy.device.levers, {});
    assert.ok(policy.controls.flags.includes('soc_unmapped') || policy.controls.flags.includes('soc_not_allowlisted'));
    assert.equal(policy.display.eight_k, 'disabled');
    assert.equal(policy.display.wire_resolution, '1920x1080');
    assert.equal(client.validatePolicy(policy, { nowS: NOW_S }), true);
    assert.deepEqual(miniSchema.validate(policy, RES_SCHEMA), []);
  } finally {
    await server.close();
  }
});

test('D4-F10: unknown sin soc_raw se rechaza explícitamente (no silencioso)', () => {
  const p = payload({ soc: 'unknown' });
  delete p.client.soc_raw;
  assert.throws(() => client.validateRequestPayload(p), /requires a valid soc_raw/);

  // Un SoC crudo válido pero no canónico se ADMITE como unknown+soc_raw (fail-closed).
  const built = signed({ payload: payload({ soc: 'mystery-soc', socRaw: 'mystery-soc' }) });
  assert.equal(built.payload.client.soc, 'unknown');
  assert.equal(built.payload.client.soc_raw, 'mystery-soc');

  // Un soc_raw con caracteres inválidos no puede entrar (400 explícito).
  assert.throws(
    () => signed({ payload: payload({ soc: 'mystery-soc', socRaw: 'rk 3588!' }) }),
    /requires a valid soc_raw/
  );
});

test('traducciones contrato→wire del ack (gate denied, lifecycle, clamped)', () => {
  const base = {
    st: 'partial',
    rs: 'device_not_allowed',
    etag: 'sha256:' + 'c'.repeat(64),
    soc: { m: 's905x4', src: 'Build.HARDWARE', c: 's905x4', g: 'allowlisted', alias: 'amlogic_s905x4' },
    th: { prov: 'measured', st: 3, steps: 2, tier: 'balanced' },
    cad: 30,
    ap: ['global ai_sr_level 1'],
    un: 13,
    sk: [{ k: 'pq_ai_fbc_enable', r: 'value_out_of_domain' }],
    df: [{ k: 'buffer_s', r: 'player_active' }],
    hl: ['pq_sharpness_enable']
  };

  const gate = client.translateAck({ ...base, gate: 'denied', gate_soc: 'no_caps' });
  assert.equal(gate.soc.g, 'no_caps');
  assert.equal('gate' in gate, false);
  assert.equal(client.validateApply(gate), true);

  const gateDefault = client.translateAck({ ...base, gate: 'denied' });
  assert.equal(gateDefault.soc.g, 'not_allowlisted');

  const lifecycle = client.translateAck({ ...base, lifecycle: 'player_inactive' });
  assert.deepEqual(lifecycle.df.find((d) => d.k === 'lifecycle'), { k: 'lifecycle', r: 'lifecycle_pending' });
  assert.equal(client.translateAck({ ...base, lifecycle: 'next_media_source' }).df.some((d) => d.r === 'lifecycle_pending'), true);

  const clamped = client.translateAck({ ...base, clamped: [{ key: 'ai_sr_level', from: 3, to: 1 }] });
  assert.deepEqual(clamped.cl, [{ k: 'ai_sr_level', from: 3, to: 1 }]);
  assert.equal(clamped.soc.g, 'allowlisted'); // sin gate: no se altera

  assert.throws(() => client.translateAck({ ...base, lifecycle: 'invented' }), /unknown lifecycle/);
  assert.throws(() => client.translateAck({ ...base, gate: 'denied', soc: undefined }), /requires soc/);
});

test('D4-F10: el ack denied/soc_unmapped viaja con soc unknown', () => {
  const ack = client.translateAck({
    st: 'denied',
    rs: 'soc_unmapped',
    soc: { m: 'unknown', src: 'unknown', c: 'unknown', g: 'not_allowlisted', alias: 'rk3588' },
    gate: 'denied',
    gate_soc: 'not_allowlisted',
    th: { prov: 'unavailable', st: null, steps: 0, tier: 'minimal' }
  });
  assert.equal(ack.st, 'denied');
  assert.equal(ack.rs, 'soc_unmapped');
  assert.equal(ack.soc.m, 'unknown');
  assert.equal(ack.soc.g, 'not_allowlisted');
  assert.equal(client.validateApply(ack), true);
});

test('checker estático: PHP/nginx/esquemas/secretos/staged', () => {
  const result = checker.run();
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.ok(result.checks.length >= 30);
});

test('documento de deploy: matriz de errores, NOT_RUN de php -l y rollback', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'vps', 'DEPLOY_MAP_ENTRY.md'), 'utf8');
  for (const code of ['200', '401', '405', '409', '413', '415', '429', '500', '503']) {
    assert.ok(doc.includes(code), 'falta código ' + code);
  }
  assert.match(doc, /php -l[^\n]*NOT_RUN|NOT_RUN[^\n]*php -l/i);
  assert.match(doc, /rollback/i);
  assert.match(doc, /reload/i);
  assert.match(doc, /NO-GO/);
  assert.match(doc, /soc_unmapped/);
  assert.match(doc, /lifecycle_pending/);
  assert.match(doc, /cl\[/);
});
