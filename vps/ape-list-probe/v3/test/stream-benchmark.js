#!/usr/bin/env node
'use strict';

// Prueba optativa: no se ejecuta con node --test test/*.test.js.
// Genera una lista sintética en streaming y la sirve solamente en loopback.
// Uso: node test/stream-benchmark.js [--gib=1.31] [--out=benchmark-result.json]
// El productor y el auditor comparten proceso; RSS incluye ambos y Node.js.
const http = require('node:http');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { loadConfig, createProbe, VERSION } = require('../ape-list-probe.js');

async function main() {
  const flags = new Map(process.argv.slice(2).map(arg => {
    const at = arg.indexOf('=');
    return [at < 0 ? arg : arg.slice(0, at), at < 0 ? '' : arg.slice(at + 1)];
  }));
  for (const key of flags.keys()) {
    if (!['--gib', '--out'].includes(key)) throw new Error(`Argumento desconocido: ${key}`);
  }
  const gib = Number(flags.get('--gib') || 1.31);
  if (!Number.isFinite(gib) || gib < 0.001 || gib > 2.8) throw new Error('--gib debe estar entre 0.001 y 2.8');
  const output = path.resolve(flags.get('--out') || 'benchmark-result.json');
  const metadata = '#KODIPROP:inputstream.adaptive.stream_headers=X-Test=synthetic\n';
  const recordText = '#EXTINF:-1,Canal sintético de carga\n'
    + metadata.repeat(975)
    + 'https://example.test/live/test/test/100.ts\n';
  const record = Buffer.from(recordText);
  const channels = Math.ceil((gib * 1024 ** 3) / record.length);
  const head = Buffer.from(`#EXTM3U\n#EXT-X-APE-CHANNELS:${channels}\n`);
  const expectedBytes = head.length + record.length * channels;
  const expectedLines = 2 + 977 * channels;
  const expectedHash = createHash('sha256');
  let emittedBytes = 0;
  let expectedDigest = null;
  let producerError = null;
  let requests = 0;
  let peakRss = process.memoryUsage().rss;
  let peakHeap = process.memoryUsage().heapUsed;
  let peakExternal = process.memoryUsage().external;
  function memorySample() {
    const usage = process.memoryUsage();
    peakRss = Math.max(peakRss, usage.rss);
    peakHeap = Math.max(peakHeap, usage.heapUsed);
    peakExternal = Math.max(peakExternal, usage.external);
  }
  const sampling = setInterval(memorySample, 20);
  sampling.unref();
  const server = http.createServer(async (req, res) => {
    requests++;
    if (requests !== 1 || req.url !== '/synthetic.m3u8') {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
      'content-length': expectedBytes, 'cache-control': 'no-store' });
    async function write(chunk) {
      expectedHash.update(chunk);
      emittedBytes += chunk.length;
      if (!res.write(chunk)) await once(res, 'drain');
    }
    try {
      await write(head);
      for (let i = 0; i < channels; i++) await write(record);
      expectedDigest = expectedHash.digest('hex');
      res.end();
    } catch (error) {
      producerError = String(error.code || error.message);
      res.destroy();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const probe = createProbe({
    ...loadConfig({ APE_PROBE_CACHE: 'off' }),
    allowPrivateHosts: ['127.0.0.1'],
    sampleUrls: 0,
    sampleBudget: 0,
    fetchTimeoutMs: 180000,
    totalTimeoutMs: 200000
  });
  const started = performance.now();
  let report;
  try {
    report = await probe.analyze(`http://127.0.0.1:${server.address().port}/synthetic.m3u8`);
  } finally {
    memorySample(); clearInterval(sampling);
    await probe.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  const seconds = (performance.now() - started) / 1000;
  const maxRssBytes = process.resourceUsage().maxRSS * 1024;
  peakRss = Math.max(peakRss, maxRssBytes);
  const result = {
    benchmark: 'ape-list-probe-local-streaming',
    version: VERSION,
    measured_at: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    synthetic: true,
    notes: 'Sin proveedores reales. Sin fichero gigante. RSS incluye servidor productor y auditor en el mismo proceso. Sin muestreo HTTP de canales.',
    bytes: report.bytes,
    expected_bytes: expectedBytes,
    emitted_bytes: emittedBytes,
    gib: Number((expectedBytes / 1024 ** 3).toFixed(6)),
    duration_seconds: Number(seconds.toFixed(3)),
    throughput_mib_per_second: Number((expectedBytes / 1024 ** 2 / seconds).toFixed(3)),
    peak_rss_bytes: peakRss,
    peak_rss_mib: Number((peakRss / 1024 ** 2).toFixed(3)),
    sampled_peak_heap_mib: Number((peakHeap / 1024 ** 2).toFixed(3)),
    sampled_peak_external_mib: Number((peakExternal / 1024 ** 2).toFixed(3)),
    channels: report.canales,
    expected_channels: channels,
    lines: report.lineas,
    expected_lines: expectedLines,
    sha256: report.sha256,
    expected_sha256: expectedDigest,
    sha_matches: report.sha256 === expectedDigest && report.sha256_http === expectedDigest,
    estado: report.estado,
    integridad: report.integridad,
    producer_error: producerError,
    audit_errors: report.no_computado,
    pass: !producerError && expectedDigest !== null && report.sha256 === expectedDigest
      && report.sha256_http === expectedDigest && report.bytes === expectedBytes
      && report.canales === channels && report.lineas === expectedLines
      && report.integridad?.completa === true && report.estado === 'NO_VERIFICADA'
  };
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.pass) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
