'use strict';

/**
 * Local ARA-X /sync mock server v2 (test harness only, NOT production).
 *
 * Purpose: exercise the full request → HMAC verify → replay/idempotency → policy →
 * HMAC sign → apply loop with zero VPS writes. The production endpoint is the staged
 * PHP in `ara-x/vps/php/ara-sync.php` (not deployed).
 *
 * Models the R6-D3 security contract missing from the baseline mock (R6-F06):
 *  - nonce single-use per device with history (sha256(nonce), >=600 s)
 *  - idempotent retry of the exact body (same seq + body hash -> 200 identical)
 *  - monotonic seq, same body different seq -> 409
 *  - rate limit 3 r/m burst 6 -> 429 + Retry-After (only /sync)
 *  - Content-Type 415, body >16 KB 413, JSON/unknown field 400
 *  - uniform 401, no CORS, no-store + nosniff
 */

const http = require('node:http');
const crypto = require('node:crypto');
const client = require('../../vps/client/ara_sync_client.js');

const LAB_SSOT = Object.freeze({
  motion_score: 22,
  film_grain: 0.35,
  scene_complexity: 48,
  dark_ratio: 0.12,
  exported_at: '2026-10-26T01:31:05',
  list_version: '2026-10-30T22:07:37Z'
});

/**
 * Identity of the served catalog generation (R1 §1.1 artifact B, measured).
 * The HTTP ETag of /lists is the gzip size and Range is not honored (R1 F-19, §1.2),
 * so this sha256 is the only trustworthy identity, valid inside one generation only.
 */
const ARTIFACT = Object.freeze({
  sha256: '81dbdd11ec620b1dead702ca404c9959c61f301639a5d0091da37ebfb95be14e',
  generation_id: 'gen-1793397700248-20261030T220737Z',
  list_version: '2026-10-30T22:07:37Z',
  bytes: 568241457
});

const ERROR_BODY = Object.freeze({ ok: false, error: 'unauthorized' });
const MAX_REPLAY_ROWS = 256;

/** Keeps per-device replay rows bounded (R6-D3-REPLAY-05). Exported for the test matrix. */
function capReplay(st, maxRows = MAX_REPLAY_ROWS) {
  while (st.replay.size > maxRows) {
    const oldest = st.replay.keys().next().value;
    st.replay.delete(oldest);
  }
  return st.replay.size;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function featureValue(request, name) {
  const entry = request.metrics && request.metrics.features ? request.metrics.features[name] : undefined;
  if (!entry || entry.value === null || entry.value === undefined) return null;
  return entry.value;
}

function featureNumber(request, name) {
  const v = featureValue(request, name);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function computePolicy(request, { nowS, lab = LAB_SSOT, artifact = ARTIFACT } = {}) {
  const soc = request.client.soc;
  const allowed = client.CANONICAL_SOCS.includes(soc);

  const thermalStatus = featureValue(request, 'pm_thermal_status');
  const cpuTemp = featureNumber(request, 'cpu_temp_c');
  const rebufferRatio = featureNumber(request, 'rebuffer_ratio');
  const bufferPct = featureNumber(request, 'buffer_pct');
  const fpsDeclared = featureNumber(request, 'fps_declared');
  const fpsEffective = featureNumber(request, 'fps_effective');

  const thermalGuard =
    (typeof thermalStatus === 'number' && thermalStatus >= 3) ||
    (cpuTemp !== null && cpuTemp >= 75);
  const stabilityGuard =
    (rebufferRatio !== null && rebufferRatio > 0.15) ||
    (bufferPct !== null && bufferPct < 20) ||
    (fpsDeclared !== null && fpsEffective !== null && fpsEffective < fpsDeclared * 0.9);

  let active = 'P2';
  let blend = { P2: 1 };
  let reason = 'nominal';
  if (thermalGuard) {
    active = 'P3';
    blend = { P2: 0.4, P3: 0.6 };
    reason = 'thermal_guard';
  } else if (stabilityGuard) {
    active = 'P2';
    blend = { P2: 1 };
    reason = 'stability_guard';
  }

  const levers = thermalGuard
    ? { pq_ai_sr_enable: 0, ai_sr_level: 1, pq_hdr_enable: 1 }
    : { pq_ai_sr_enable: 1, ai_sr_level: 3, pq_hdr_enable: 1 };

  if (!allowed) {
    const safe = client.safeDefaultPolicy({ soc, deviceId: request.device_id, seq: request.seq, ts: nowS });
    safe.profile.reason = 'soc_decode_ceiling';
    safe.controls.flags = ['soc_not_allowlisted'];
    client.validatePolicy(safe, { nowS });
    return safe;
  }

  const ts = nowS;
  const declaredFps = fpsDeclared !== null ? fpsDeclared : request.metrics.source.fps;
  const targetFps = declaredFps >= 50 ? 60 : declaredFps >= 25 ? 30 : 24;
  const currentFps = fpsEffective !== null ? fpsEffective : declaredFps;
  const hdrHint = request.metrics.source.hdr === 'PQ' || request.metrics.source.hdr === 'HLG'
    ? request.metrics.source.hdr
    : 'SDR';

  const contentAgeMs = lab.exported_at
    ? Math.max(0, nowS * 1000 - Date.parse(lab.exported_at + 'Z'))
    : null;

  const flags = thermalGuard ? ['thermal_guard'] : stabilityGuard ? ['stability_guard'] : ['nominal'];
  if (!client.sameArtifact(request.ref, { artifact_sha256: artifact.sha256, generation_id: artifact.generation_id })) {
    flags.push('artifact_mismatch');
  }

  const policy = {
    v: client.SYNC_VERSION,
    type: 'ara_x_policy',
    device_id: request.device_id,
    seq: request.seq,
    ts,
    valid_until: ts + 30,
    policy_etag: 'sha256:' + client.sha256Hex(JSON.stringify({ active, blend, reason, soc, ts, targetFps })),
    profile: { active, blend, reason },
    player: {
      buffer_s: thermalGuard || stabilityGuard ? 60 : 45,
      abr_bw_factor: stabilityGuard ? 0.7 : 0.78,
      reconnect_attempts: 156,
      live_delay_s: 10,
      max_bitrate_bps: 25000000,
      min_bitrate_bps: 6000000
    },
    device: {
      allowed: true,
      soc,
      thermal_target_c: thermalGuard ? 65 : 70,
      levers
    },
    display: {
      mode: '4k',
      wire_resolution: '3840x2160',
      min_resolution: '3840x2160',
      never_downscale: true,
      eight_k: 'presentation_only',
      hdr_hint: hdrHint
    },
    fps: {
      target: targetFps,
      current: currentFps === null ? null : clamp(currentFps, 1, client.FPS_MIN * 10),
      min: client.FPS_MIN
    },
    thermal: {
      status: thermalStatus === null || thermalStatus === undefined ? 'unknown' : thermalStatus,
      limits: { light_c: 60, moderate_c: 66, severe_c: 72, critical_c: 78 }
    },
    processing: { tier: thermalGuard ? 'minimal' : stabilityGuard ? 'balanced' : 'quality' },
    degrade: { order: ['fps', 'processing'] },
    content: {
      motion_score: lab.motion_score,
      film_grain: lab.film_grain,
      scene_complexity: lab.scene_complexity,
      dark_ratio: lab.dark_ratio,
      prov: 'lab_ssot',
      age_ms: contentAgeMs,
      conf: 0.9
    },
    controls: {
      sync_next_s: 30,
      flags,
      degrade_mask: 0
    },
    ref: {
      artifact_sha256: artifact.sha256,
      generation_id: artifact.generation_id,
      list_version: artifact.list_version,
      lab_exported_at: lab.exported_at
    }
  };

  client.validatePolicy(policy, { nowS });
  return policy;
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limitBytes) {
        done = true;
        reject(Object.assign(new Error('payload too large'), { httpStatus: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      if (!done) reject(err);
    });
  });
}

function sendJson(res, status, body, extraHeaders = {}) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(raw, 'utf8'),
    ...extraHeaders
  });
  res.end(raw);
  return raw;
}

function contentKind(req) {
  const raw = String(req.headers['content-type'] || '').toLowerCase();
  const base = raw.split(';')[0].trim();
  return base === 'application/json' ? 'json' : base === '' ? 'missing' : 'other';
}

function start({
  secret,
  keyId = 'k1',
  nowS,
  policyFactory = computePolicy,
  lab = LAB_SSOT,
  rateLimit = { capacity: 6, refillPerMin: 3 },
  keys = null
} = {}) {
  if (!secret && !keys) throw new Error('mock server requires a secret or a key map');
  const keyMap = keys || { [keyId]: { secret, device_ids: null } };
  const state = new Map(); // device_id -> { lastSeq, nonces: Map, replay: Map }
  const buckets = new Map(); // key -> { tokens, lastMs }
  const clock =
    typeof nowS === 'number'
      ? () => nowS
      : typeof nowS === 'function'
        ? nowS
        : () => Math.floor(Date.now() / 1000);

  function bucketFor(key) {
    const nowMs = clock() * 1000;
    let b = buckets.get(key);
    if (!b) {
      b = { tokens: rateLimit.capacity, lastMs: nowMs };
      buckets.set(key, b);
    }
    const elapsedMin = Math.max(0, (nowMs - b.lastMs) / 60000);
    b.tokens = Math.min(rateLimit.capacity, b.tokens + elapsedMin * rateLimit.refillPerMin);
    b.lastMs = nowMs;
    return b;
  }

  function deviceState(deviceId) {
    let st = state.get(deviceId);
    if (!st) {
      st = { lastSeq: 0, nonces: new Map(), replay: new Map() };
      state.set(deviceId, st);
    }
    return st;
  }

  function purge(st, nowS) {
    for (const [hash, meta] of st.nonces) {
      if (nowS - meta.ts > client.NONCE_TTL_S) st.nonces.delete(hash);
    }
    for (const [seq, meta] of st.replay) {
      if (nowS - meta.ts > client.NONCE_TTL_S) st.replay.delete(seq);
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const nowS = clock();

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('OK');
      return;
    }

    if (url.pathname !== '/sync') {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return;
    }

    // R6-D3-RATE-01/02: rate-limit only on /sync, before auth (anti-oracle).
    const bucket = bucketFor(String(req.headers['x-ara-key-id'] || 'anon'));
    if (bucket.tokens < 1) {
      sendJson(res, 429, { ok: false, error: 'rate_limited' }, { 'Retry-After': '30' });
      return;
    }
    bucket.tokens -= 1;

    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }
    if (contentKind(req) !== 'json') {
      sendJson(res, 415, { ok: false, error: 'unsupported_media_type' });
      return;
    }

    let raw;
    try {
      raw = await readBody(req, client.MAX_BODY_BYTES);
    } catch (err) {
      sendJson(res, err.httpStatus || 400, { ok: false, error: err.httpStatus === 413 ? 'payload_too_large' : 'bad_request' });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' });
      return;
    }
    try {
      client.validateRequestPayload(payload);
    } catch (err) {
      sendJson(res, 400, { ok: false, error: 'invalid_payload', reason: err.reason || 'schema' });
      return;
    }

    // Auth: per-device key, uniform 401 (R6-D3-AUTH-01/07).
    const presentedKeyId = String(req.headers['x-ara-key-id'] || '');
    const entry = keyMap[presentedKeyId];
    const keySecret = entry && entry.secret;
    if (!entry || (entry.device_ids && !entry.device_ids.includes(payload.device_id)) || (entry.retires_at && nowS > entry.retires_at)) {
      sendJson(res, 401, ERROR_BODY);
      return;
    }
    const bodyHash = client.sha256Hex(raw);
    const expected = client.hmacHex(
      keySecret,
      client.canonicalRequestString({
        deviceId: payload.device_id,
        seq: payload.seq,
        ts: payload.ts,
        nonce: payload.nonce,
        bodyHash
      })
    );
    if (!safeEqual(String(req.headers['x-ara-sig'] || ''), expected)) {
      sendJson(res, 401, ERROR_BODY);
      return;
    }
    if (!client.isFreshTimestamp(payload.ts, nowS)) {
      sendJson(res, 401, ERROR_BODY);
      return;
    }

    const st = deviceState(payload.device_id);
    purge(st, nowS);

    // R6-D3-REPLAY-04: identical retry wins over nonce/seq rejection.
    const cached = st.replay.get(payload.seq);
    if (cached && cached.bodyHash === bodyHash && nowS - cached.ts <= client.IDEMPOTENCY_TTL_S) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-ARA-Sig': cached.sig,
        'X-ARA-Policy-Etag': cached.etag,
        'X-ARA-Idempotent': '1',
        'Content-Length': Buffer.byteLength(cached.raw, 'utf8')
      });
      res.end(cached.raw);
      return;
    }

    const nonceHash = client.sha256Hex(payload.nonce);
    // R6-D3-REPLAY-02/03.
    if (st.nonces.has(nonceHash) || payload.seq <= st.lastSeq) {
      sendJson(res, 409, { ok: false, error: 'replay' });
      return;
    }

    let policy;
    try {
      policy = policyFactory(payload, { nowS, lab });
      client.validatePolicy(policy, { nowS });
    } catch {
      sendJson(res, 500, { ok: false, error: 'policy_generation_failed' });
      return;
    }

    const rawResponse = JSON.stringify(policy);
    const respHash = client.sha256Hex(rawResponse);
    const respSig = client.hmacHex(
      keySecret,
      client.canonicalResponseString({
        deviceId: payload.device_id,
        reqSeq: payload.seq,
        respTs: policy.ts,
        bodyHash: respHash
      })
    );

    st.lastSeq = payload.seq;
    st.nonces.set(nonceHash, { ts: nowS, seq: payload.seq, bodyHash });
    st.replay.set(payload.seq, { bodyHash, raw: rawResponse, sig: respSig, etag: policy.policy_etag, ts: nowS });
    capReplay(st);

    if (String(req.headers['x-ara-sync-mode'] || '').toLowerCase() === 'shadow') {
      const emptyHash = client.sha256Hex('');
      const shadowSig = client.hmacHex(
        keySecret,
        client.canonicalResponseString({
          deviceId: payload.device_id,
          reqSeq: payload.seq,
          respTs: policy.ts,
          bodyHash: emptyHash
        })
      );
      res.writeHead(204, {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-ARA-Sig': shadowSig,
        'X-ARA-Sync-Mode': 'shadow'
      });
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-ARA-Sig': respSig,
      'X-ARA-Policy-Etag': policy.policy_etag,
      'Content-Length': Buffer.byteLength(rawResponse, 'utf8')
    });
    res.end(rawResponse);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: 'http://127.0.0.1:' + port,
        state,
        lab,
        close: () => new Promise((done) => server.close(() => done()))
      });
    });
  });
}

module.exports = { start, computePolicy, LAB_SSOT, ARTIFACT, capReplay, MAX_REPLAY_ROWS };
