#!/usr/bin/env node
'use strict';

/**
 * sync-smoke.js — verificación HTTP mínima de `/sync` DESPUÉS del deploy (t35).
 * Sin dependencias externas. Sólo corre en el job `verify` (no en dry-run).
 *
 * Variables:
 *   SYNC_BASE          base URL (default https://iptv-ape.duckdns.org)
 *   SYNC_IP            IP del VPS para resolver el Host (evita DNS del runner)
 *   SYNC_DEVICE_ID     device_id ligado a la clave (default onn4k-001)
 *   SYNC_KEY           64 hex de la clave HMAC (si falta: 200 se marca SKIP)
 *   SYNC_KEY_ID        key_id (default k1)
 *   SYNC_ARTIFACT_SHA  sha256 del artefacto (default 64 ceros)
 *   SYNC_TOKEN         token de /ara/events (si falta: se marca SKIP)
 *
 * Comprueba: 401 sin firma · 401 key desconocida · 413 body >16 KB · 429 rate
 * · 200 HMAC válido (si hay clave) · /ara/events 200 (si hay token) · /lists/ 200.
 */

const https = require('node:https');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const BASE = new URL(process.env.SYNC_BASE || 'https://iptv-ape.duckdns.org');
const IP = process.env.SYNC_IP || '';
const DEVICE = process.env.SYNC_DEVICE_ID || 'onn4k-001';
const KEY = process.env.SYNC_KEY || '';
const KEY_ID = process.env.SYNC_KEY_ID || 'k1';
const ART = process.env.SYNC_ARTIFACT_SHA || '0'.repeat(64);
const TOKEN = process.env.SYNC_TOKEN || '';

if (!/^[a-f0-9]{64}$/.test(ART)) {
  console.error('SYNC_ARTIFACT_SHA inválido');
  process.exit(2);
}
if (KEY && !/^[a-f0-9]{64}$/.test(KEY)) {
  console.error('SYNC_KEY inválida: 64 hex lowercase');
  process.exit(2);
}

const results = [];
function record(name, status, expect, detail = '') {
  const ok = Array.isArray(expect) ? expect.includes(status) : status === expect;
  results.push({ name, status, expect, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: HTTP ${status} (esperado ${Array.isArray(expect) ? expect.join('/') : expect})${detail ? ' · ' + detail : ''}`);
  return ok;
}

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      method,
      hostname: BASE.hostname,
      port: BASE.port || 443,
      path,
      headers: { Host: BASE.hostname, ...headers },
      timeout: 15000
    };
    if (IP) {
      opts.lookup = (host, opts2, cb) => cb(null, IP, 4);
    }
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function payload(seq, nonce) {
  const now = Math.floor(Date.now() / 1000);
  return {
    v: 2,
    type: 'ara_x_sync',
    device_id: DEVICE,
    seq,
    ts: now,
    nonce,
    client: {
      app: 'deploy-verify',
      version: '3.2.0-sync-d4',
      soc: 's905x4',
      android: 11,
      player: 'exoplayer'
    },
    ref: { artifact_sha256: ART, generation_id: 'deploy-verify', list_version: 'deploy-verify' },
    metrics: {
      window_s: 30,
      conf: 0.9,
      features: {
        vst_ms: { value: 800, prov: 'measured_device', age_ms: 0, conf: 0.9 },
        fps_declared: { value: 25, prov: 'measured_device', age_ms: 0, conf: 0.9 },
        fps_effective: { value: 25, prov: 'measured_device', age_ms: 0, conf: 0.9 },
        buffer_ms: { value: 45000, prov: 'measured_device', age_ms: 0, conf: 0.9 },
        pm_thermal_status: { value: 1, prov: 'measured_device', age_ms: 0, conf: 0.9 }
      },
      source: { resolution: '1920x1080', codec: 'hvc1.2.4.L123.B0', fps: 25, hdr: 'SDR', prov: 'measured_device', age_ms: 0 }
    },
    state: { active_profile: 'P2', profile_blend: { P2: 1 }, levers: {} }
  };
}

function signed(seq, nonce) {
  const raw = JSON.stringify(payload(seq, nonce));
  const bodyHash = crypto.createHash('sha256').update(raw).digest('hex');
  const canonical = ['ARA-X-SYNC-V1', DEVICE, String(seq), String(JSON.parse(raw).ts), nonce, bodyHash].join('\n');
  const sig = crypto.createHmac('sha256', KEY).update(canonical).digest('hex');
  return {
    raw,
    headers: {
      'Content-Type': 'application/json',
      'X-ARA-Sync-Version': '2',
      'X-ARA-Key-Id': KEY_ID,
      'X-ARA-Sig': sig
    }
  };
}

(async () => {
  const tag = Date.now().toString(16).slice(-8);
  const baseReq = JSON.stringify(payload(1, tag.padEnd(16, '0')));

  // 1 · sin firma -> 401
  try {
    const r = await request('POST', '/sync', baseReq, { 'Content-Type': 'application/json', 'X-ARA-Sync-Version': '2' });
    record('401 sin HMAC', r.status, 401);
  } catch (e) { record('401 sin HMAC', 0, 401, e.message); }

  // 2 · key desconocida -> 401
  try {
    const r = await request('POST', '/sync', baseReq, {
      'Content-Type': 'application/json',
      'X-ARA-Sync-Version': '2',
      'X-ARA-Key-Id': 'unknown-key',
      'X-ARA-Sig': '0'.repeat(64)
    });
    record('401 key desconocida', r.status, 401);
  } catch (e) { record('401 key desconocida', 0, 401, e.message); }

  // 3 · body > 16 KB -> 413
  try {
    const r = await request('POST', '/sync', 'x'.repeat(17000), { 'Content-Type': 'application/json', 'X-ARA-Sync-Version': '2' });
    record('413 body >16 KB', r.status, 413);
  } catch (e) { record('413 body >16 KB', 0, 413, e.message); }

  // 4 · rate-limit: 7 peticiones -> alguna 429 (burst 6)
  let saw429 = false;
  for (let i = 0; i < 7; i += 1) {
    try {
      const r = await request('POST', '/sync', baseReq, { 'Content-Type': 'application/json', 'X-ARA-Sync-Version': '2' });
      if (r.status === 429) saw429 = true;
    } catch (e) { /* red: lo reporta el chequeo siguiente */ }
  }
  record('429 rate-limit', saw429 ? 429 : 0, 429);

  // 5 · HMAC válido -> 200 (solo si el Environment inyecta la clave)
  if (KEY) {
    try {
      const s = signed(2, (tag + 'a').padEnd(16, '0').slice(0, 16));
      const r = await request('POST', '/sync', s.raw, s.headers);
      const ok = record('200 HMAC válido', r.status, 200);
      if (ok) {
        const sig = r.headers['x-ara-sig'] || '';
        const bodyHash = crypto.createHash('sha256').update(r.body).digest('hex');
        const canonical = ['ARA-X-SYNC-RESP-V1', DEVICE, '2', String(JSON.parse(r.body).ts), bodyHash].join('\n');
        const want = crypto.createHmac('sha256', KEY).update(canonical).digest('hex');
        record('200 firma de respuesta', sig === want ? 200 : 0, 200);
      }
    } catch (e) { record('200 HMAC válido', 0, 200, e.message); }
  } else {
    console.log('SKIP 200 HMAC válido: falta SYNC_KEY en el Environment');
  }

  // 6 · /ara/events con token -> 200 (solo si se inyecta token)
  if (TOKEN) {
    try {
      const r = await request('GET', `/ara/events?token=${encodeURIComponent(TOKEN)}`, undefined, { 'X-APA-ARA-Events': 'v1.0' });
      record('/ara/events con token', r.status, 200);
    } catch (e) { record('/ara/events con token', 0, 200, e.message); }
  } else {
    console.log('SKIP /ara/events con token: falta SYNC_TOKEN');
  }

  // 7 · /lists/ 200
  try {
    const r = await request('GET', '/lists/APE_LISTA_4K.m3u8');
    record('/lists/APE_LISTA_4K.m3u8', r.status, 200);
  } catch (e) { record('/lists/APE_LISTA_4K.m3u8', 0, 200, e.message); }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESUMEN SYNC SMOKE: ${results.length - failed.length}/${results.length} OK · ${failed.length} FAIL`);
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('SYNC SMOKE ERROR:', e.message);
  process.exit(2);
});
