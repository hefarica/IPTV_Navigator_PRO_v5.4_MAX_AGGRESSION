#!/usr/bin/env node
/* E10 · caudal h1 vs h2 sobre la lista estática (sin proveedor).
 * Reproduce E6: ventana de flujo h2 por defecto (64 KiB) vs h1.
 * - 3 muestras por variante, 10 MiB por muestra vía Range (206).
 * - Variante h2 con ventana inicial grande (16 MiB) para demostrar la causa.
 * No escribe nada; no toca el VPS. */
import https from 'node:https';
import http2 from 'node:http2';

const HOST = 'iptv-ape.duckdns.org';
const PATH = '/lists/APE_LISTA_4K.m3u8';
const BYTES = 10 * 1024 * 1024;
const RANGE = `bytes=0-${BYTES - 1}`;
const N = 3;
const ms = (x) => Math.round(x);

function h1Sample() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = https.request({ hostname: HOST, port: 443, path: PATH, agent: false,
      headers: { Range: RANGE, 'User-Agent': 'e10-throughput/1.0' } }, (res) => {
      let bytes = 0, first = null;
      res.on('data', (c) => { if (first === null) first = performance.now() - t0; bytes += c.length; });
      res.on('end', () => resolve({ ver: res.httpVersion, status: res.statusCode, bytes,
        firstMs: ms(first), totalMs: ms(performance.now() - t0),
        mbps: (bytes / (1024 * 1024)) / ((performance.now() - t0) / 1000) }));
      res.on('error', (e) => resolve({ error: e.code || e.message }));
    });
    req.setTimeout(90000, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    req.end();
  });
}

function h2Sample(opts = {}) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let session, settled = false;
    const finish = (o) => { if (settled) return; settled = true; try { session?.close(); } catch {} resolve(o); };
    const timer = setTimeout(() => finish({ error: 'timeout' }), 90000);
    session = http2.connect(`https://${HOST}`, { settings: opts.settings || {} });
    session.on('error', (e) => { clearTimeout(timer); finish({ error: e.code || e.message }); });
    session.on('connect', () => {
      const r = session.request({ ':path': PATH, ':method': 'GET', range: RANGE,
        'user-agent': 'e10-throughput/1.0' });
      let bytes = 0, first = null, status = null;
      r.on('response', (h) => { status = h[':status']; });
      r.on('data', (c) => {
        if (first === null) first = performance.now() - t0;
        bytes += c.length;
        if (bytes >= BYTES) {
          clearTimeout(timer);
          finish({ ver: '2', status, bytes, firstMs: ms(first), totalMs: ms(performance.now() - t0),
            mbps: (bytes / (1024 * 1024)) / ((performance.now() - t0) / 1000) });
        }
      });
      r.on('error', (e) => { clearTimeout(timer); finish({ error: e.code || e.message }); });
      r.end();
    });
  });
}

function stats(v) {
  const a = v.filter(Number.isFinite).sort((x, y) => x - y);
  return { n: a.length, min: a[0], p50: a[Math.ceil(a.length * 0.5) - 1], max: a[a.length - 1] };
}

const out = { host: HOST, bytes: BYTES, n: N, variants: {} };
for (const [name, fn] of [
  ['h1', h1Sample],
  ['h2_default_window', () => h2Sample()],
  ['h2_window_16m', () => h2Sample({ settings: { initialWindowSize: 16 * 1024 * 1024 } })],
]) {
  const samples = [];
  for (let i = 0; i < N; i++) {
    const s = await fn();
    console.log(`${name} #${i + 1}: ${JSON.stringify(s)}`);
    samples.push(s);
    await new Promise((r) => setTimeout(r, 250));
  }
  const good = samples.filter((s) => Number.isFinite(s.mbps));
  out.variants[name] = {
    samples,
    mbps: stats(good.map((s) => s.mbps)),
    totalMs: stats(good.map((s) => s.totalMs)),
    ok: good.length, errors: samples.filter((s) => s.error).length,
  };
  console.log(`  -> ${name}: p50=${out.variants[name].mbps.p50?.toFixed(2)} MB/s (n=${good.length})`);
}
console.log('\nRESULT=' + JSON.stringify(out.variants));
