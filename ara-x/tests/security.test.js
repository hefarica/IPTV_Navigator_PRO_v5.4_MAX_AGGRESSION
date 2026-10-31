'use strict';

/**
 * V3 · contrato de seguridad de la entrega ARA-X (repo-only, sin VPS).
 *
 * Cubre: HMAC/canonical, replay/nonce/idempotencia (F-06), tamaño/JSON/content-type,
 * rate-limit de /sync, ausencia de CORS/headers tóxicos, no ADB/ejecución, esquemas
 * cerrados, PHP/Lua staged, secretos de la entrega y trazabilidad de findings.
 *
 * Los tests verdes NO convierten los findings V3-F-01..F-04 en PASS: el veredicto
 * global sigue FAIL/NO-GO (documentado en reports/V3_security.md).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = require('../vps/client/ara_sync_client.js');
const mock = require('./helpers/mock_sync_server.js');
const secrets = require('../scripts/security/scan_secrets.js');

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SECRET = 'ara-x-test-secret';
const NOW_S = 1700000000;
const V3 = fs.readFileSync(path.join(ROOT, 'reports', 'V3_security.md'), 'utf8');
const R6 = fs.readFileSync(path.join(ROOT, 'reports', 'R6_security.md'), 'utf8');
const R3 = fs.readFileSync(path.join(ROOT, 'reports', 'R3_vps_sync_reality.md'), 'utf8');
const R1 = fs.readFileSync(path.join(ROOT, 'reports', 'R1_list_forensics.md'), 'utf8');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const codeOnly = (text, marker = '--') => text
  .split(/\r?\n/)
  .map((line) => line.replace(new RegExp(marker + '.*$'), ''))
  .join('\n');

function feat(value, prov = 'measured_device', ageMs = 0, conf = 0.9) {
  return { value, prov, age_ms: ageMs, conf };
}

function payloadFor({ seq = 7, ts = NOW_S, nonce = 'abc123def4567890', soc = 's905x4', socRaw } = {}) {
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
        vst_ms: feat(800),
        rebuffer_ms: feat(0),
        fps_declared: feat(25),
        fps_effective: feat(25),
        buffer_ms: feat(45000),
        bitrate_bps: feat(25000000),
        rtt_ms: feat(30, 'measured_server'),
        cpu_temp_c: feat(null, 'unavailable'),
        pm_thermal_status: feat(1)
      },
      source: {
        resolution: '1920x1080',
        codec: 'hvc1.2.4.L123.B0',
        fps: 25,
        hdr: 'SDR',
        prov: 'measured_device',
        age_ms: 0
      }
    },
    state: {
      active_profile: 'P2',
      profile_blend: { P0: 0, P1: 0, P2: 1, P3: 0, P4: 0, P5: 0 },
      levers: {}
    }
  };
}

function signed(payload = payloadFor()) {
  return client.buildSyncRequest({
    secret: SECRET,
    keyId: 'k1',
    deviceId: payload.device_id,
    seq: payload.seq,
    ts: payload.ts,
    nonce: payload.nonce,
    client: payload.client,
    ref: payload.ref,
    metrics: payload.metrics,
    state: payload.state
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
  return fetch(url + '/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body
  });
}

// ── 1 · HMAC / canonicalización ───────────────────────────────────────────────

test('HMAC request/response: canónico exacto, vector conocido y tampering', () => {
  const canonical = client.canonicalRequestString({
    deviceId: 'onn4k-001',
    seq: 7,
    ts: 1700000000,
    nonce: 'abc123def4567890',
    bodyHash: 'f'.repeat(64)
  });
  assert.equal(canonical, ['ARA-X-SYNC-V1', 'onn4k-001', '7', '1700000000', 'abc123def4567890', 'f'.repeat(64)].join('\n'));

  const built = client.signRequest({
    secret: SECRET,
    deviceId: 'onn4k-001',
    seq: 7,
    ts: 1700000000,
    nonce: 'abc123def4567890',
    rawBody: JSON.stringify({ hello: 'ara-x' })
  });
  assert.equal(built.bodyHash, 'b6779f1db95a683d9319f6729e4ca4032dbb55b229999b55e09d9c00245a4ea3');
  assert.equal(built.sig, '0e5851ac8086b730f3cbd22d138ececaaebc140b8b4c6582c590c0b078ad68be');
  assert.equal(built.sig.length, 64);

  const raw = JSON.stringify({ ok: true });
  assert.equal(client.verifyResponseSignature({
    secret: SECRET,
    deviceId: 'onn4k-001',
    reqSeq: 7,
    respTs: 1700000000,
    rawBody: raw,
    headers: { 'X-ARA-Sig': '2f00f129bb601a8a913db5bfae0d3e32fd2343141a7208b31500cf0e9b9ecf17' }
  }), true);
  assert.equal(client.verifyResponseSignature({
    secret: SECRET,
    deviceId: 'onn4k-001',
    reqSeq: 7,
    respTs: 1700000000,
    rawBody: JSON.stringify({ ok: false }),
    headers: { 'X-ARA-Sig': '2f00f129bb601a8a913db5bfae0d3e32fd2343141a7208b31500cf0e9b9ecf17' }
  }), false);
});

// ── 2 · Contrato /sync: auth, skew, payload, tamaño ──────────────────────────

test('/sync: 200 válido, 401 firma/key/ts, 400 payload, 413 tamaño, 415 content-type', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const ok = await post(server.url, signed(payloadFor({ seq: 1, nonce: '1000000000000001' })));
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('x-ara-sig'), /^[a-f0-9]{64}$/);
    assert.equal(ok.headers.get('access-control-allow-origin'), null);

    const badSig = signed(payloadFor({ seq: 2, nonce: '1000000000000002' }));
    const r401 = await post(server.url, badSig, { 'X-ARA-Sig': '0'.repeat(64) });
    assert.equal(r401.status, 401);
    assert.deepEqual(await r401.json(), { ok: false, error: 'unauthorized' });

    const unknownKey = signed(payloadFor({ seq: 3, nonce: '1000000000000003' }));
    assert.equal((await post(server.url, unknownKey, { 'X-ARA-Key-Id': 'nope' })).status, 401);

    assert.equal((await post(server.url, signed(payloadFor({ seq: 4, ts: NOW_S - 301, nonce: '1000000000000004' })))).status, 401);
    assert.equal((await post(server.url, signed(payloadFor({ seq: 5, ts: NOW_S + 301, nonce: '1000000000000005' })))).status, 401);

    assert.equal((await rawPost(server.url, '{')).status, 400);
    const malformed = payloadFor();
    malformed.extra = 'nope';
    assert.equal((await rawPost(server.url, JSON.stringify(malformed))).status, 400);
    assert.equal((await rawPost(server.url, 'x'.repeat(client.MAX_BODY_BYTES + 1))).status, 413);

    const wrongType = await fetch(server.url + '/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payloadFor())
    });
    assert.equal(wrongType.status, 415);

    assert.equal((await fetch(server.url + '/sync')).status, 405);
    assert.equal((await fetch(server.url + '/sync', { method: 'PUT', body: '{}' })).status, 405);
  } finally {
    await server.close();
  }
});

// ── 3 · Nonce histórico, replay e idempotencia (F-06) ────────────────────────

test('nonce single-use con histórico, replay seq mayor, idempotencia 200 exacto vs 409', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    const first = signed(payloadFor({ seq: 9, nonce: '2000000000000009' }));
    const r1 = await post(server.url, first);
    const raw1 = await r1.text();
    const sig1 = r1.headers.get('x-ara-sig');
    assert.equal(r1.status, 200);

    // Reintento exacto dentro de 120 s: mismo body y misma firma.
    const retry = await post(server.url, first);
    assert.equal(retry.status, 200);
    assert.equal(retry.headers.get('x-ara-idempotent'), '1');
    assert.equal(await retry.text(), raw1);
    assert.equal(retry.headers.get('x-ara-sig'), sig1);

    // Nonce reusado con seq MAYOR: el histórico lo rechaza.
    assert.equal((await post(server.url, signed(payloadFor({ seq: 10, nonce: '2000000000000009' })))).status, 409);

    // Mismo seq con body distinto: 409.
    const altered = payloadFor({ seq: 9, nonce: '2000000000000010' });
    altered.metrics.features.rtt_ms = feat(99, 'measured_server');
    assert.equal((await post(server.url, signed(altered))).status, 409);

    // seq menor: 409.
    assert.equal((await post(server.url, signed(payloadFor({ seq: 8, nonce: '2000000000000011' })))).status, 409);
  } finally {
    await server.close();
  }
});

// ── 4 · Rate-limit solo /sync y playback intacto ─────────────────────────────

test('rate-limit de /sync: 429 + Retry-After; /health sigue 200', async () => {
  const server = await mock.start({ secret: SECRET, nowS: NOW_S });
  try {
    let last = null;
    for (let i = 1; i <= 7; i += 1) {
      last = await post(server.url, signed(payloadFor({ seq: i, nonce: String(3000000000000000 + i) })));
      if (i < 7) assert.equal(last.status, 200, 'req ' + i);
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

// ── 5 · Esquemas cerrados, sin URLs, sin 8K wire, levers ────────────────────

test('schemas request/response: closed, sin URL keys, sin 8K wire, levers allowlist', () => {
  const req = JSON.parse(read('vps/schema/sync_request.schema.json'));
  const res = JSON.parse(read('vps/schema/sync_response.schema.json'));
  const example = JSON.parse(read('vps/schema/device_policy.example.json'));

  assert.equal(req.additionalProperties, false);
  assert.equal(res.additionalProperties, false);
  assert.deepEqual(client.validatePolicy(example), true);

  const urlKey = /^(url|uri|segment|segment_url|source_url|fetch_url|manifest_url|callback|webhook)$/i;
  const walk = (node, p = '$') => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, p + '[' + i + ']')); return; }
    for (const [k, v] of Object.entries(node)) {
      assert.equal(urlKey.test(k), false, 'URL-like key ' + p + '.' + k);
      walk(v, p + '.' + k);
    }
  };
  walk(req);
  walk(res);

  const wire = res.properties.display.properties.wire_resolution.enum;
  assert.equal(wire.includes('7680x4320'), false);
  assert.equal(res.properties.display.properties.eight_k.enum.includes('native'), false);

  const extra = { ...example, soc_canonical: 's905x4', prov: { x: 1 }, conf: 0.5 };
  assert.throws(() => client.validatePolicy(extra), /unknown|unexpected|key/i);
});

// ── 6 · PHP staged: HMAC/replay/headers/no red ───────────────────────────────

test('PHP staged: HMAC constant-time, nonce/replay/idempotencia, 16KB, no-store/nosniff, sin red/CORS', () => {
  const php = read('vps/php/ara-sync.php');
  assert.match(php, /hash_equals\(/);
  assert.match(php, /hash_hmac\('sha256'/);
  assert.match(php, /ARA_REQ_PREFIX/);
  assert.match(php, /ARA_RESP_PREFIX/);
  assert.match(php, /ara_sync_nonce/);
  assert.match(php, /ara_sync_replay/);
  assert.match(php, /X-ARA-Idempotent: 1/);
  assert.match(php, /BEGIN IMMEDIATE/);
  assert.match(php, /ARA_MAX_BODY = 16384/);
  assert.match(php, /application\/json/);
  assert.match(php, /Cache-Control: no-store/);
  assert.match(php, /X-Content-Type-Options: nosniff/);
  assert.match(php, /ARA_SYNC_KEYS_FILE/);
  assert.match(php, /device_ids/);
  assert.match(php, /ara_sync_scan_urls/);

  assert.equal(/Access-Control-Allow-Origin/i.test(php), false);
  const net = php.match(/curl_|file_get_contents|fsockopen|stream_socket_client|get_headers|shell_exec|proc_open|popen|passthru|system\(|eval\(/g) || [];
  assert.deepEqual(net, []);
  const logs = php.split(/\r?\n/).filter((l) => /error_log\s*\(/.test(l));
  assert.equal(logs.some((l) => /secret|presented|nonce|bodyHash|raw\b/i.test(l)), false);
  assert.equal(/secret\s*=\s*['"][a-f0-9]{32,}['"]/i.test(php), false);
});

// ── 7 · Lua staged: contrato estático y bloqueos documentados ────────────────

test('Lua /sync: sin resty/playback, HMAC/canonical/16KB/TTL/8K y hazard de require documentado', () => {
  const lua = read('vps/lua/ara_x_sync.lua');
  const luaCode = codeOnly(lua);
  assert.equal(/resty/i.test(luaCode), false);
  assert.equal(/proxy_pass/i.test(luaCode), false);
  assert.equal(/\/lists\//.test(luaCode), false);
  assert.match(lua, /MAX_BODY\s*=\s*16384/);
  assert.match(lua, /M\.REQ_PREFIX\s*=\s*"ARA-X-SYNC-V1"/);
  assert.match(lua, /M\.RESP_PREFIX\s*=\s*"ARA-X-SYNC-RESP-V1"/);
  assert.match(lua, /table\.concat\(\{\s*M\.REQ_PREFIX,\s*device_id,\s*tostring\(seq\),\s*tostring\(ts\),\s*nonce,\s*body_hash\s*\},\s*"\\n"\)/);
  assert.match(lua, /NONCE_TTL\s*=\s*600/);
  assert.match(lua, /REPLAY_TTL\s*=\s*120/);
  assert.match(lua, /pcall\(handle\)/);
  assert.match(lua, /presentation_only/);
  assert.equal(/7680x4320/.test(luaCode), false);
  for (const code of ['401', '409', '413', '429', '503']) assert.ok(lua.includes(code));

  // El helper existente ejecuta M.serve() al cargarse si ngx.var.uri existe.
  const helperPath = path.join(REPO_ROOT, '_vps_stage', 'lua', 'ape_attr.lua');
  assert.equal(fs.existsSync(helperPath), true);
  const helper = fs.readFileSync(helperPath, 'utf8');
  const hazard = /pcall\(require,\s*"ape_attr"\)/.test(lua) && /ngx\.var\.uri then\s*\n\s*M\.serve\(\)/.test(helper);
  if (hazard) {
    assert.match(V3, /V3-F-03/);
    assert.match(V3, /NO-GO/);
  }
});

test('Lua response sin extras top-level; el cliente rechaza extras (V3-F-04)', () => {
  const example = JSON.parse(read('vps/schema/device_policy.example.json'));
  for (const extra of [{ soc_canonical: 's905x4' }, { prov: { x: 1 } }, { conf: 0.5 }]) {
    assert.throws(() => client.validatePolicy({ ...example, ...extra }), /unknown|unexpected|key/i);
  }
  const lua = read('vps/lua/ara_x_sync.lua');
  assert.equal(/soc_canonical/.test(lua), false, 'V3-F-04 reparado en t28: la respuesta Lua no añade extras');
  assert.match(V3, /V3-F-04/);
});

test('Lua zone file y Retry-After: gap documentado (V3-F-06/07)', () => {
  const files = fs.readdirSync(path.join(ROOT, 'vps', 'nginx')).filter((f) => f.endsWith('.conf'));
  const raw = files.map((f) => read(path.join('vps', 'nginx', f)));
  const luaSnippet = read('vps/nginx/ara-sync-lua.conf');
  const definesLuaZone = raw.some((text) => text
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .some((l) => /limit_req_zone[^\n]*zone=ara_sync_lua/.test(l)));
  if (/zone=ara_sync_lua/.test(luaSnippet) && !definesLuaZone) assert.match(V3, /V3-F-06/);

  const phpSnippet = read('vps/nginx/ara-sync.conf');
  if (!/Retry-After/i.test(phpSnippet)) assert.match(V3, /V3-F-07/);
});

// ── 8 · Nginx: solo /sync, 3r/m burst 6, headers, sin playback ───────────────

test('nginx /sync: location único, 3r/m burst 6, no-store/nosniff, sin CORS/playback', () => {
  const sync = read('vps/nginx/ara-sync.conf');
  const zone = read('vps/nginx/ara-sync-zone.conf');
  const luaSnippet = read('vps/nginx/ara-sync-lua.conf');
  const code = [sync, zone].join('\n').split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');

  assert.match(sync, /location\s*=\s*\/sync\s*\{/);
  assert.equal((sync.match(/location\s*=/g) || []).length, 1);
  assert.equal((sync.match(/limit_req\s/g) || []).length, 1);
  assert.match(sync, /limit_req zone=ara_sync burst=6 nodelay/);
  assert.match(zone, /limit_req_zone\s+\$binary_remote_addr\s+zone=ara_sync:1m\s+rate=3r\/m/);
  assert.match(zone, /limit_req_status\s+429/);
  assert.match(sync, /client_max_body_size\s+16k/);
  assert.match(sync, /Cache-Control "no-store"/);
  assert.match(sync, /X-Content-Type-Options "nosniff"/);
  assert.equal(/Access-Control-Allow-Origin/i.test(code + luaSnippet), false);
  assert.equal(/proxy_pass|resolver\s/.test(code), false);
  assert.equal(/\/lists\//.test(code), false);
  assert.equal(/limit_conn/.test(code), false);
  assert.equal(/listen\s+80/.test(code), false);
});

// ── 9 · Secretos: entrega limpia y evidencia R1 sin credenciales (F-02 remediado) ──

test('secret scan: 0 en entrega y 0 en R1 evidence (V3-F-02 remediado por redacción)', () => {
  const delivery = secrets.run({
    root: ROOT,
    excludes: ['evidence', 'reports/r1_evidence', 'node_modules', '.git'],
    allow: secrets.DEFAULTS.allow
  });
  assert.equal(delivery.ok, true);
  assert.deepEqual(delivery.findings, []);

  // Reparación r2 (t26): las URLs con el par cuenta/clave de `last_lines` se redactaron.
  const full = secrets.run({
    root: ROOT,
    excludes: ['evidence', 'node_modules', '.git'],
    allow: secrets.DEFAULTS.allow
  });
  assert.equal(full.findings.length, 0, JSON.stringify(full.findings.map((f) => f.file + ':' + f.kind)));
  assert.deepEqual(full.findings, []);

  // La evidencia sigue existiendo (no se borró) y su última URL de canal quedó enmascarada.
  for (const f of ['reports/r1_evidence/cdn_full.json', 'reports/r1_evidence/local_full.json']) {
    const json = JSON.parse(read(f));
    assert.equal(Array.isArray(json.last_lines), true);
    assert.equal(json.last_lines.some((l) => /\/live\/[A-Za-z0-9]{4,}\/[A-Za-z0-9]{4,}\//.test(l)), false);
  }

  // Trazabilidad: el finding queda documentado en V3 y la remediación en el informe de reparación.
  assert.match(V3, /V3-F-02/);
  assert.match(V3, /r1_evidence/);
  const repair = read('reports/V3_repair_r2.md');
  assert.match(repair, /V3-F-02/);
  assert.match(repair, /redact/i);
});

// ── 10 · Headers tóxicos, ADB y ejecución desde playlist ─────────────────────

test('0 headers tóxicos nuevos, 0 ADB/ejecución en entrega y bloque ARA limpio', () => {
  const vpsText = [
    read('vps/lua/ara_x_sync.lua'),
    read('vps/php/ara-sync.php'),
    read('vps/nginx/ara-sync.conf'),
    read('vps/nginx/ara-sync-lua.conf'),
    read('vps/nginx/ara-sync-zone.conf')
  ].join('\n');
  const vpsNoComments = vpsText
    .split(/\r?\n/)
    .map((line) => line
      .replace(/\s*\/\/.*$/, '')
      .replace(/\s*--.*$/, '')
      .replace(/^\s*\*.*$/, ''))
    .join('\n');
  for (const name of ['Range', 'If-None-Match', 'If-Modified-Since', 'TE', 'Priority', 'Upgrade-Insecure-Requests']) {
    assert.equal(new RegExp('(?:^|["\\s])' + name + '\\s*:').test(vpsNoComments), false, 'tóxico en VPS staged: ' + name);
  }
  assert.equal(/\badb\b|\bfastboot\b/i.test(vpsNoComments), false);
  assert.equal(/shell_exec|proc_open|popen|passthru|system\(|eval\(|curl_|fsockopen|stream_socket_client/i.test(vpsNoComments), false);

  const injector = require('../playlist/ara_x_injector.js');
  const block = injector.buildGlobalBlock({ listVersion: 'v3-test' }).join('\n');
  assert.equal(/secret|token|password|user:pass|ape_attr|hmacKey/i.test(block), false);
  assert.equal(/\badb\b|\bfastboot\b|shell|exec/i.test(block), false);
  assert.equal(/#EXTHTTP/i.test(block), false);
  for (const name of ['Range', 'If-None-Match', 'If-Modified-Since', 'TE', 'Priority', 'Upgrade-Insecure-Requests']) {
    assert.equal(block.includes(name), false, 'tóxico en bloque ARA: ' + name);
  }
});

// ── 11 · Trazabilidad: F-01..F-04, R3-R4..R3-R7, R1 path, S10 ───────────────

test('F-01..F-04, R3-R4..R3-R7, R1 path y checklist S10 están revisados y firmados', () => {
  for (const id of ['F-01', 'F-02', 'F-03', 'F-04']) {
    assert.ok(R6.includes(id), 'R6 falta ' + id);
    assert.ok(V3.includes(id), 'V3 falta ' + id);
  }
  assert.match(R6, /NO-GO/);
  assert.match(V3, /NO-GO/);
  assert.match(V3, /V3-F-01/);
  assert.match(V3, /CRITICAL/);

  for (const id of ['R3-R4', 'R3-R5', 'R3-R6', 'R3-R7']) {
    assert.ok(R3.includes(id), 'R3 falta ' + id);
    assert.ok(V3.includes(id), 'V3 no revisó ' + id);
  }

  assert.match(R1, /seg6/);
  assert.match(R1, /streamId/);
  assert.match(V3, /\/cdn\/<host>\/live\/<seg6>\/<seg6>\/<id>/);
  assert.match(V3, /rotar|rotación/i);

  assert.match(V3, /Checklist S10/);
  assert.match(V3, /Firma S10/);
  assert.match(V3, /\bFAIL\b/);
  assert.match(V3, /NO-GO/);
});
