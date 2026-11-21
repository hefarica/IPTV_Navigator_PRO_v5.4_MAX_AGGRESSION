#!/usr/bin/env node
/* Verifica el medidor de caudal y su puente al auto-ajuste. Sin red externa: loopback. */
'use strict';
const http = require('http');
const path = require('path');
const meter = require(path.join(__dirname, '../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-speed-meter-v9.js'));
const bridge = require(path.join(__dirname, '../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-speedmeter-bridge.js'));
const checks = [];
const ok = (n, c) => checks.push([n, !!c]);

const SIZE = 8 * 1024 * 1024;
const srv = http.createServer((req, res) => {
  if (String(req.url).indexOf('/missing') >= 0) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': SIZE });
  const chunk = Buffer.alloc(256 * 1024, 7); let n = 0;
  (function pump() { while (n < SIZE) { n += chunk.length; if (!res.write(chunk)) { res.once('drain', pump); return; } } res.end(); })();
});

srv.listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${srv.address().port}/blob.bin`;
  const r = await meter.measure({ urls: [url, url, url, url], concurrency: 4, durationMs: 2500, warmupMs: 400 });
  const d = r.derivados || {};
  ok('mide caudal real (>50 Mbps en loopback)', r.ok && r.mbps > 50);
  ok('p10 <= media', r.mbps_p10 <= r.mbps + 1e-9);
  ok('ewma > 0', r.mbps_ewma > 0);
  ok('buffer en rango 12000..30000', d.buffer_target_ms >= 12000 && d.buffer_target_ms <= 30000);
  ok('max = 2x target', d.buffer_max_ms === d.buffer_target_ms * 2);
  ok('min <= target', d.buffer_min_ms <= d.buffer_target_ms);
  ok('bitrate = min(100000, 50% del caudal)', d.target_bitrate_kbps === Math.round(Math.min(100000, d.mbps_usado * 500)));

  /* Fail-honest: una URL que responde 404 NO es "caudal bajo". Debe nombrar el
   * HTTP real y no fabricar un mbps (regresión: se reportaba "sin muestras utiles"
   * y la UI imprimía "undefined Mbps"). */
  const bad = await meter.measure({
    urls: [`http://127.0.0.1:${srv.address().port}/missing.bin`],
    concurrency: 2, durationMs: 1200, warmupMs: 200
  });
  ok('404 no se reporta como medición', bad.ok === false && bad.mbps === undefined);
  ok('404 queda nombrado como PROBE_FAILED', bad.state === 'PROBE_FAILED');
  ok('motivo cita el HTTP 404', /HTTP 404/.test(String(bad.motivo)));
  ok('motivo incluye la url sonda', String(bad.motivo).indexOf('/missing.bin') >= 0);

  const llamadas = [];
  globalThis.APE_SPEEDMETER = meter;
  const p1 = { id: 'P1' };
  globalThis.ProfileManagerV9 = {
    _applyAutoTune(r) { llamadas.push(r.measurement.mbpsSafe); return { ajustados: 12 }; },
    config: { getProfile: (id) => (id === 'P1' ? p1 : null) }
  };
  const fake = (mbps) => ({ ok: true, mbps, mbps_p10: mbps * 0.9, mbps_ewma: mbps, derivados: meter.derivar({ mbps, mbps_p10: mbps * 0.9 }) });
  globalThis.APE_SPEEDMETER = Object.assign({}, meter, { measure: async () => fake(100) });
  await bridge.apeAutoAdjustWithSpeedtest({ alcance: 'todos', urls: ['http://x/y'] });
  ok('todos invoca _applyAutoTune', llamadas.length === 1);
  ok('todos usa el p10', llamadas[0] === 90);

  globalThis.APE_SPEEDMETER = Object.assign({}, meter, { measure: async () => fake(12) });
  await bridge.apeAutoAdjustWithSpeedtest({ alcance: 'P1', urls: ['http://x/y'] });
  const esp = meter.derivar({ mbps: 12, mbps_p10: 10.8 });
  ok('perfil recibe buffer target', Number(p1.headerOverrides['X-Buffer-Target']) === esp.buffer_target_ms);
  ok('perfil recibe bitrate', Number(p1.headerOverrides['X-APE-TARGET-BITRATE']) === esp.target_bitrate_kbps);
  ok('perfil recibe caching', Number(p1.headerOverrides['X-Network-Caching']) === esp.network_caching_ms);
  ok('un perfil no aplica a todos', llamadas.length === 1);

  const r3 = await bridge.apeAutoAdjustWithSpeedtest({ alcance: 'P9', urls: ['http://x/y'] });
  ok('perfil inexistente se omite', r3.omitido.length > 0 && r3.aplicado.length === 0);

  /* Resolución de las URLs por defecto: relativa al PROPIO script, no a
   * location.origin (regresión: GET /probe-8mb.bin 404 en dev y en el sitio). */
  let vistas = [];
  const bridgeCon = async (src) => {
    globalThis.document = { currentScript: { src }, getElementsByTagName: () => [] };
    globalThis.APE_SPEEDMETER = Object.assign({}, meter, { measure: async (o) => { vistas.push(o.urls); return fake(100); } });
    vistas = [];
    await bridge.apeAutoAdjustWithSpeedtest({ alcance: 'todos' });
    return vistas[0] || [];
  };

  const devU = await bridgeCon('http://127.0.0.1:5500/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-speedmeter-bridge.js');
  ok('dev: sonda resuelve bajo frontend/', devU[0] === 'http://127.0.0.1:5500/IPTV_v5.4_MAX_AGGRESSION/frontend/probe-8mb.bin');

  const vpsU = await bridgeCon('https://iptv-ape.duckdns.org/js/ape-v9/ape-speedmeter-bridge.js');
  ok('VPS: sonda resuelve a la raiz del sitio', vpsU[0] === 'https://iptv-ape.duckdns.org/probe-8mb.bin');
  ok('respaldo same-origin', vpsU[1] === 'https://iptv-ape.duckdns.org/js/ape-v9/m3u8-typed-arrays-ultimate.js');

  globalThis.APE_SPEEDTEST_URLS = ['https://x/probe.bin'];
  vistas = [];
  globalThis.APE_SPEEDMETER = Object.assign({}, meter, { measure: async (o) => { vistas.push(o.urls); return fake(100); } });
  await bridge.apeAutoAdjustWithSpeedtest({ alcance: 'todos' });
  ok('APE_SPEEDTEST_URLS manda sobre el default', vistas[0] && vistas[0][0] === 'https://x/probe.bin');
  delete globalThis.APE_SPEEDTEST_URLS;
  delete globalThis.document;

  let fail = 0;
  for (const [n, c] of checks) { if (!c) fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); }
  console.log(`RESUMEN PASS=${checks.length - fail} FAIL=${fail}`);
  srv.close();
  process.exit(fail ? 1 : 0);
});