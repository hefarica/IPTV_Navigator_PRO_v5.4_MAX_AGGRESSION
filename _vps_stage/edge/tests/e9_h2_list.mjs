#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * E9 · e9_h2_list.mjs — TTFB de la lista por HTTP/2 con N suficiente (v1.0.0)
 * ---------------------------------------------------------------------------
 * El arnés de t1 mide HTTP/2 con UN solo `http2.connect` (ALPN + 1 TTFB), así
 * que no da p50/p95. Este script complementa (no sustituye) al arnés: mide la
 * lista por h2 en sesión reutilizada y con sesión nueva, y h1 con conexión
 * nueva, con percentiles nearest-rank. READ-ONLY: solo HEAD.
 *
 * Uso: node _vps_stage/edge/tests/e9_h2_list.mjs [--host iptv-ape.duckdns.org]
 * ═══════════════════════════════════════════════════════════════════════════ */
import http2 from 'node:http2';
import https from 'node:https';
import tls from 'node:tls';

const HOST = (() => {
  const i = process.argv.indexOf('--host');
  return i >= 0 ? process.argv[i + 1] : 'iptv-ape.duckdns.org';
})();
const PATH = '/lists/APE_LISTA_4K.m3u8';
const UA = 'edge-fluidez-e9-verify/1.0 (read-only)';
const N_SESSION = 10;
const N_FRESH_H2 = 5;
const N_FRESH_H1 = 5;

const stats = (v) => {
  const a = v.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!a.length) return { n: 0 };
  const at = (p) => a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))];
  return {
    n: a.length,
    min: Math.round(a[0] * 10) / 10,
    p50: Math.round(at(0.5) * 10) / 10,
    p95: Math.round(at(0.95) * 10) / 10,
    max: Math.round(a[a.length - 1] * 10) / 10,
  };
};

function alpnProbe() {
  return new Promise((resolve) => {
    const s = tls.connect({ host: HOST, port: 443, servername: HOST, ALPNProtocols: ['h2', 'http/1.1'] });
    s.once('secureConnect', () => { const r = { alpn: s.alpnProtocol, protocol: s.getProtocol() }; s.end(); resolve(r); });
    s.once('error', (e) => resolve({ error: e.code || e.message }));
    s.setTimeout(12000, () => { s.destroy(); resolve({ error: 'timeout' }); });
  });
}

function h2Once(session) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = session.request({ ':method': 'HEAD', ':path': PATH, 'user-agent': UA });
    let done = false;
    const fin = (o) => { if (!done) { done = true; resolve(o); } };
    req.on('response', (h) => fin({ ms: Number(process.hrtime.bigint() - t0) / 1e6, status: h[':status'], len: h['content-length'] }));
    req.on('error', (e) => fin({ error: e.code || e.message }));
    req.setTimeout(15000, () => { req.close(); fin({ error: 'timeout' }); });
    req.end();
  });
}

function h1Fresh() {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = https.request({ host: HOST, port: 443, path: PATH, method: 'HEAD', agent: false, headers: { 'user-agent': UA } });
    req.on('response', (res) => {
      res.resume();
      resolve({ ms: Number(process.hrtime.bigint() - t0) / 1e6, status: res.statusCode, httpVersion: res.httpVersion });
    });
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.end();
  });
}

function h2Fresh() {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const session = http2.connect(`https://${HOST}`);
    let done = false;
    const fin = (o) => { if (!done) { done = true; try { session.close(); } catch {} resolve(o); } };
    session.on('error', (e) => fin({ error: e.code || e.message }));
    session.on('connect', () => {
      const req = session.request({ ':method': 'HEAD', ':path': PATH, 'user-agent': UA });
      req.on('response', (h) => fin({
        ms: Number(process.hrtime.bigint() - t0) / 1e6,
        status: h[':status'],
        alpn: session.socket && session.socket.alpnProtocol,
        len: h['content-length'],
      }));
      req.on('error', (e) => fin({ error: e.code || e.message }));
      req.end();
    });
    setTimeout(() => fin({ error: 'timeout' }), 15000);
  });
}

const out = { host: HOST, path: PATH, startedUtc: new Date().toISOString(), alpn: await alpnProbe() };
const session = http2.connect(`https://${HOST}`);
const reused = [];
for (let i = 0; i < N_SESSION; i++) {
  const r = await h2Once(session);
  if (r.ms) reused.push(r.ms);
  if (i === 0) out.h2SessionFirst = r;
}
try { session.close(); } catch {}
const freshH2 = [];
const freshH2Meta = [];
for (let i = 0; i < N_FRESH_H2; i++) {
  const r = await h2Fresh();
  if (r.ms) freshH2.push(r.ms);
  freshH2Meta.push(r);
}
const freshH1 = [];
const freshH1Meta = [];
for (let i = 0; i < N_FRESH_H1; i++) {
  const r = await h1Fresh();
  if (r.ms) freshH1.push(r.ms);
  freshH1Meta.push(r);
}
out.h2Reused = { stats: stats(reused), samples: reused.map((x) => Math.round(x * 10) / 10) };
out.h2Fresh = { stats: stats(freshH2), statuses: freshH2Meta.map((r) => r.status || r.error), alpn: freshH2Meta.map((r) => r.alpn || r.error) };
out.h1Fresh = { stats: stats(freshH1), httpVersions: freshH1Meta.map((r) => r.httpVersion || r.error) };
out.finishedUtc = new Date().toISOString();
console.log(JSON.stringify(out, null, 2));
