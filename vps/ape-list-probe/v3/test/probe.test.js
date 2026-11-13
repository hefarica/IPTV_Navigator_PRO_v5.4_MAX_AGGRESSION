'use strict';

// Pruebas de regresión con servidores locales: nunca consultan proveedores reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const {
  loadConfig, createProbe, createService, isPublicAddress, redactUrl, routeClass
} = require('../ape-list-probe.js');

const digest = b => createHash('sha256').update(b).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t, handler, host = '127.0.0.1') {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { server, base: `http://${host}:${server.address().port}` };
}

function probeFor(t, overrides = {}) {
  const probe = createProbe({
    ...loadConfig({ APE_PROBE_CACHE: 'off' }),
    allowPrivateHosts: ['127.0.0.1'],
    sampleUrls: 0,
    fetchTimeoutMs: 2000,
    totalTimeoutMs: 4000,
    ...overrides
  });
  t.after(() => probe.close());
  return probe;
}

function catalog(url) {
  return `#EXTM3U\n#EXTINF:-1,Canal de prueba\n${url}`;
}

function get(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, res => {
      const parts = [];
      res.on('data', chunk => parts.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        const text = Buffer.concat(parts).toString('utf8');
        let body;
        try { body = JSON.parse(text); } catch { body = text; }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('conserva hash, bytes y última línea cuando no existe LF final', async t => {
  let content;
  const origin = await fixture(t, (_req, res) => res.end(content));
  content = Buffer.from(catalog(`${origin.base}/live/demo/demo/7.ts`));
  const report = await probeFor(t).analyze(`${origin.base}/list.m3u8`);
  assert.equal(report.sha256, digest(content));
  assert.equal(report.sha256_http, digest(content));
  assert.equal(report.bytes, content.length);
  assert.equal(report.lineas, 3);
  assert.equal(report.canales, 1);
  assert.equal(report.harness.extm3u, true);
  assert.equal(report.tipo_lista, 'CATALOGO');
  assert.equal(report.estado, 'NO_VERIFICADA');
});

test('reconoce BOM, CRLF y UTF-8 dividido entre trozos', async t => {
  let content;
  const origin = await fixture(t, async (_req, res) => {
    res.setHeader('content-type', 'application/x-mpegURL; charset=utf-8');
    const split = content.indexOf(Buffer.from('ñ')) + 1;
    res.write(content.subarray(0, split));
    await delay(5);
    res.end(content.subarray(split));
  });
  content = Buffer.from(`\uFEFF#EXTM3U\r\n#EXTINF:-1,Señal agrícola 🌱\r\n${origin.base}/canal.m3u8\r\n`);
  const report = await probeFor(t).analyze(`${origin.base}/unicode.m3u8`);
  assert.equal(report.sha256, digest(content));
  assert.equal(report.bytes, content.length);
  assert.equal(report.lineas, 3);
  assert.equal(report.canales, 1);
  assert.equal(report.harness.extm3u, true);
  assert.equal(report.tipo_lista, 'CATALOGO');
});

test('separa hash de contenido M3U y hash de entidad HTTP gzip', async t => {
  let plain;
  let compressed;
  const origin = await fixture(t, (_req, res) => {
    res.writeHead(200, {
      'content-type': 'application/vnd.apple.mpegurl',
      'content-encoding': 'gzip',
      'content-length': compressed.length
    });
    res.end(compressed);
  });
  plain = Buffer.from(catalog(`${origin.base}/channel.ts`));
  compressed = gzipSync(plain);
  const report = await probeFor(t).analyze(`${origin.base}/compressed`);
  assert.equal(report.sha256, digest(plain));
  assert.equal(report.sha256_http, digest(compressed));
  assert.equal(report.bytes, plain.length);
  assert.equal(report.canales, 1);
});

for (const byteOrder of ['le', 'be']) {
  test(`detecta UTF-16${byteOrder.toUpperCase()} con BOM partido y conserva los bytes originales`, async t => {
    let content;
    const origin = await fixture(t, async (_req, res) => {
      // Divide tanto el BOM como una unidad UTF-16 para probar el estado incremental.
      res.write(content.subarray(0, 1));
      await delay(5);
      res.write(content.subarray(1, 4));
      await delay(5);
      res.write(content.subarray(4, 9));
      await delay(5);
      res.end(content.subarray(9));
    });
    const text = `#EXTM3U\r\n#EXTINF:-1,Señal agrícola 🌱\r\n${origin.base}/canal.ts`;
    const payload = Buffer.from(text, 'utf16le');
    if (byteOrder === 'be') payload.swap16();
    content = Buffer.concat([
      byteOrder === 'le' ? Buffer.from([0xff, 0xfe]) : Buffer.from([0xfe, 0xff]),
      payload
    ]);
    const report = await probeFor(t).analyze(`${origin.base}/utf16-${byteOrder}`);
    assert.equal(report.encoding_detected, `utf-16${byteOrder}`);
    assert.equal(report.sha256, digest(content));
    assert.equal(report.sha256_http, digest(content));
    assert.equal(report.bytes, content.length);
    assert.equal(report.lineas, 3);
    assert.equal(report.canales, 1);
    assert.equal(report.harness.extm3u, true);
    assert.equal(report.tipo_lista, 'CATALOGO');
  });
}

test('no publica identidad completa al exceder el límite de bytes', async t => {
  const content = Buffer.from(`#EXTM3U\n#EXTINF:-1,${'x'.repeat(500)}\nhttp://example.test/1.ts\n`);
  const origin = await fixture(t, (_req, res) => res.end(content));
  const report = await probeFor(t, { maxBytes: 80 }).analyze(`${origin.base}/too-big`);
  assert.equal(report.sha256, null);
  assert.equal(report.estado, 'INCOMPLETA');
  assert.ok(report.no_computado.length > 0);
});

test('una descarga truncada no deja un hash completo ni un resultado sano', async t => {
  const origin = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'content-length': 10000 });
    res.write('#EXTM3U\n#EXTINF:-1,Canal\nhttp://example.test/1.ts\n');
    setTimeout(() => res.destroy(), 10);
  });
  const report = await probeFor(t).analyze(`${origin.base}/truncated`);
  assert.equal(report.sha256, null);
  assert.equal(report.estado, 'INCOMPLETA');
  assert.ok(report.no_computado.length > 0);
});

test('una línea excesiva se interrumpe sin acumular el cuerpo completo', async t => {
  const origin = await fixture(t, (_req, res) => {
    res.end(`#EXTM3U\n#EXTINF:-1,${'x'.repeat(5000)}`);
  });
  const report = await probeFor(t, { maxLineBytes: 256 }).analyze(`${origin.base}/long-line`);
  assert.equal(report.sha256, null);
  assert.equal(report.estado, 'INCOMPLETA');
});

test('interrumpe una descarga que envía cabeceras y deja el cuerpo detenido', async t => {
  let closed = false;
  const origin = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
    res.flushHeaders();
    res.on('close', () => { closed = true; });
  });
  const started = performance.now();
  const report = await probeFor(t, {
    fetchTimeoutMs: 40, idleTimeoutMs: 500, totalTimeoutMs: 1000
  }).analyze(`${origin.base}/stalled`);
  for (let attempt = 0; attempt < 20 && !closed; attempt++) await delay(5);
  assert.equal(report.sha256, null);
  assert.equal(report.estado, 'INCOMPLETA');
  assert.ok(report.no_computado.includes('DESCARGA_TIMEOUT'));
  assert.ok(performance.now() - started < 1000, 'el plazo no detuvo la descarga');
  assert.equal(closed, true);
});

test('un HTTP 200 con HTML no se clasifica como catálogo válido', async t => {
  const origin = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body>Inicia sesión para continuar</body></html>');
  });
  const report = await probeFor(t).analyze(`${origin.base}/login`);
  assert.equal(report.estado, 'INVALIDA');
  assert.notEqual(report.tipo_lista, 'CATALOGO');
});

test('distingue segmentos HLS de canales IPTV', async t => {
  const media = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:6.0,\nsegment1.ts\n#EXTINF:6.0,\nsegment2.ts\n';
  const origin = await fixture(t, (_req, res) => res.end(media));
  const report = await probeFor(t).analyze(`${origin.base}/media.m3u8`);
  assert.equal(report.tipo_lista, 'HLS_MEDIA');
  assert.equal(report.estado, 'HLS_DETECTADO');
  assert.equal(report.canales, 0);
});

test('distingue un manifiesto HLS master de un catálogo IPTV', async t => {
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\n720p/index.m3u8\n';
  const origin = await fixture(t, (_req, res) => res.end(master));
  const report = await probeFor(t).analyze(`${origin.base}/master.m3u8`);
  assert.equal(report.tipo_lista, 'HLS_MASTER');
  assert.equal(report.estado, 'HLS_DETECTADO');
  assert.equal(report.canales, 0);
});

test('rechaza loopback y redes reservadas sin permiso explícito', async t => {
  let hits = 0;
  const origin = await fixture(t, (_req, res) => { hits++; res.end('#EXTM3U\n'); });
  const probe = probeFor(t, { allowPrivateHosts: [] });
  const report = await probe.analyze(`${origin.base}/private`);
  assert.equal(hits, 0);
  assert.equal(report.sha256, null);
  assert.ok(report.no_computado.length > 0);
  for (const address of [
    '0.0.0.0', '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1',
    '169.254.169.254', '100.64.0.1', '198.18.0.1', '224.0.0.1',
    '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1'
  ]) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('vuelve a aplicar la política de destino al seguir una redirección', async t => {
  let targetHits = 0;
  const target = await fixture(t, (_req, res) => {
    targetHits++;
    res.end('#EXTM3U\n');
  }, '127.0.0.2');
  const origin = await fixture(t, (_req, res) => {
    res.writeHead(302, { location: `${target.base}/blocked-target` });
    res.end();
  });
  const report = await probeFor(t).analyze(`${origin.base}/redirect`);
  assert.equal(targetHits, 0);
  assert.equal(report.sha256, null);
  assert.ok(report.no_computado.length > 0);
});

test('oculta credenciales de rutas Xtream, userinfo y consultas', async t => {
  const secrets = ['USUARIO_SECRETO', 'CLAVE_SECRETA', 'TOKEN_SECRETO'];
  let content;
  const origin = await fixture(t, (_req, res) => res.end(content));
  const privateUrl = `${origin.base}/live/${secrets[0]}/${secrets[1]}/100.ts?token=${secrets[2]}`;
  content = Buffer.from(catalog(privateUrl));
  const report = await probeFor(t).analyze(`${origin.base}/list.m3u8?token=${secrets[2]}`);
  const representations = [
    JSON.stringify(report),
    redactUrl(privateUrl),
    routeClass(privateUrl),
    redactUrl(`https://${secrets[0]}:${secrets[1]}@example.test/list?token=${secrets[2]}`)
  ];
  for (const repr of representations) {
    for (const secret of secrets) assert.equal(repr.includes(secret), false, 'secreto expuesto');
  }
});

test('usa 304 con ETag fuerte y permite forzar el recálculo completo', async t => {
  let content;
  let fullResponses = 0;
  let conditionalRequests = 0;
  const origin = await fixture(t, (req, res) => {
    const etag = '"fixture-v1"';
    if (req.headers['if-none-match'] === etag) {
      conditionalRequests++;
      res.writeHead(304, { etag });
      return res.end();
    }
    fullResponses++;
    res.writeHead(200, { etag });
    res.end(content);
  });
  content = Buffer.from(catalog(`${origin.base}/channel.ts`));
  const probe = probeFor(t);
  const first = await probe.analyze(`${origin.base}/etag`);
  const second = await probe.analyze(`${origin.base}/etag`);
  assert.equal(first.sha256, digest(content));
  assert.equal(second.sha256, digest(content));
  assert.equal(second.cache.hit, true);
  assert.equal(second.identidad.origen, 'CACHE_REVALIDADA');
  assert.equal(fullResponses, 1);
  assert.equal(conditionalRequests, 1);
  const third = await probe.analyze(`${origin.base}/etag`, { force: true });
  assert.equal(third.sha256, digest(content));
  assert.notEqual(third.cache.hit, true);
  assert.equal(fullResponses, 2);
});

test('no reusa identidad exacta basándose solamente en ETag débil', async t => {
  let content;
  let count = 0;
  let conditioned = false;
  const origin = await fixture(t, (req, res) => {
    count++;
    conditioned ||= Boolean(req.headers['if-none-match']);
    res.writeHead(200, { etag: 'W/"weak-v1"' });
    res.end(content);
  });
  content = Buffer.from(catalog(`${origin.base}/channel.ts`));
  const probe = probeFor(t);
  await probe.analyze(`${origin.base}/weak`);
  const second = await probe.analyze(`${origin.base}/weak`);
  assert.equal(count, 2);
  assert.equal(conditioned, false);
  assert.notEqual(second.cache.hit, true);
});

test('una revalidación 304 comprueba de nuevo la muestra y detecta un 404 nuevo', async t => {
  let base;
  let failed = false;
  let sampleHits = 0;
  const origin = await fixture(t, (req, res) => {
    if (req.url === '/list') {
      if (req.headers['if-none-match'] === '"fresh-sample"') {
        res.writeHead(304, { etag: '"fresh-sample"' });
        return res.end();
      }
      res.writeHead(200, { etag: '"fresh-sample"' });
      return res.end(catalog(`${base}/channel.ts`));
    }
    sampleHits++;
    if (failed) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'video/mp2t' });
    res.end(Buffer.alloc(376, 0x47));
  });
  base = origin.base;
  const probe = probeFor(t, { sampleUrls: 1, sampleBudget: 1 });
  const first = await probe.analyze(`${base}/list`);
  assert.equal(first.estado, 'SIN_FALLOS_EN_MUESTRA');
  failed = true;
  const second = await probe.analyze(`${base}/list`);
  assert.equal(second.cache.hit, true);
  assert.equal(second.estado, 'CON_HALLAZGOS');
  assert.equal(second.muestreo.fallos, 1);
  assert.equal(sampleHits, 2);
});

test('contrasta APE_CHANNELS y exige nombres completos de las directivas', async t => {
  let content;
  const origin = await fixture(t, (_req, res) => res.end(content));
  content = '#EXTM3U\n#EXT-X-APE-CHANNELS:2\n'
    + '#EXT-X-APE-URL2-CARTRIDGE-EXTRA:1\n#EXT-X-APE-QMAX-VERSION-EXTRA:1\n'
    + '#EXT-X-APE-QUALITY-WATCH-EXTRA:1\n#EXT-X-APE-LAB-EXTRA:1\n'
    + `#EXTINF:-1,Canal\n${origin.base}/channel.ts\n`;
  const report = await probeFor(t).analyze(`${origin.base}/harness`);
  assert.equal(report.canales, 1);
  assert.equal(report.harness.ape_channels, 2);
  assert.equal(report.estado, 'CON_HALLAZGOS');
  assert.ok(report.estructura.hallazgos.includes('APE_CHANNELS_NO_COINCIDE_CON_CENSO'));
  for (const field of ['url2_cartridge', 'apex_qmax', 'quality_watch', 'lab']) {
    assert.equal(report.harness[field], false, field);
  }
  assert.equal(report.harness.ejecucion_verificada, false);
});

test('limita clases distintas sin perder el censo ni los conteos de clases conocidas', async t => {
  let content;
  const origin = await fixture(t, (_req, res) => res.end(content));
  content = '#EXTM3U\n'
    + `#EXTINF:-1,Uno\n${origin.base}/live/demo/pass/1.ts\n`
    + `#EXTINF:-1,Dos\n${origin.base}/resolver/2.ts\n`
    + `#EXTINF:-1,Tres\n${origin.base}/live/demo/pass/3.ts\n`;
  const report = await probeFor(t, { maxPatterns: 1 }).analyze(`${origin.base}/classes`);
  assert.equal(report.canales, 3);
  assert.equal(report.urls_http, 3);
  assert.equal(report.patrones.length, 1);
  assert.equal(report.patrones[0].urls, 2);
  assert.equal(report.clasificacion.completa, false);
  assert.equal(report.clasificacion.urls_sin_clasificar, 1);
  assert.equal(report.estado, 'CON_HALLAZGOS');
});

test('una clase con una muestra útil y otra fallida queda MIXTA', async t => {
  let base;
  const origin = await fixture(t, (req, res) => {
    if (req.url === '/list') {
      return res.end('#EXTM3U\n'
        + `#EXTINF:-1,Uno\n${base}/live/1.ts\n`
        + `#EXTINF:-1,Dos\n${base}/live/2.ts\n`);
    }
    if (req.url === '/live/2.ts') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'video/mp2t' });
    res.end(Buffer.alloc(376, 0x47));
  });
  base = origin.base;
  const report = await probeFor(t, { sampleUrls: 2, sampleBudget: 2 }).analyze(`${base}/list`);
  assert.equal(report.servabilidad.length, 1);
  assert.equal(report.servabilidad[0].estado, 'MIXTA');
  assert.equal(report.servabilidad[0].exitos, 1);
  assert.equal(report.servabilidad[0].fallos, 1);
  assert.equal(report.muestreo.probadas, 2);
  assert.equal(report.estado, 'CON_HALLAZGOS');
});

test('cierra una muestra de vídeo infinita después de leer su prefijo', async t => {
  let source;
  let opened = 0;
  let closed = 0;
  const origin = await fixture(t, (req, res) => {
    if (req.url === '/list') return res.end(catalog(`${source}/live`));
    opened++;
    res.writeHead(200, { 'content-type': 'video/mp2t' });
    const block = Buffer.alloc(188 * 16, 0);
    for (let pos = 0; pos < block.length; pos += 188) block[pos] = 0x47;
    res.write(block);
    const timer = setInterval(() => res.write(block), 5);
    res.on('close', () => { clearInterval(timer); closed++; });
  });
  source = origin.base;
  const report = await probeFor(t, {
    sampleUrls: 1, sampleBudget: 1, sampleTimeoutMs: 1000
  }).analyze(`${origin.base}/list`);
  for (let attempt = 0; attempt < 40 && closed < opened; attempt++) await delay(5);
  assert.equal(opened, 1);
  assert.equal(closed, opened);
  assert.equal(report.estado, 'SIN_FALLOS_EN_MUESTRA');
  assert.ok(report.servabilidad.length > 0);
});

test('una redirección a HTML no hace pasar una muestra como vídeo válido', async t => {
  let source;
  const origin = await fixture(t, (req, res) => {
    if (req.url === '/list') return res.end(catalog(`${source}/redirect`));
    if (req.url === '/redirect') {
      res.writeHead(302, { location: `${source}/login` });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>Login</title>');
  });
  source = origin.base;
  const report = await probeFor(t, {
    sampleUrls: 1, sampleBudget: 1, sampleTimeoutMs: 1000
  }).analyze(`${origin.base}/list`);
  assert.equal(report.estado, 'CON_HALLAZGOS');
});

test('acota descargas simultáneas de listas distintas', async t => {
  let active = 0;
  let peak = 0;
  let base;
  const origin = await fixture(t, (_req, res) => {
    active++;
    peak = Math.max(peak, active);
    res.on('close', () => active--);
    res.write('#EXTM3U\n');
    setTimeout(() => res.end(`#EXTINF:-1,Canal\n${base}/stream.ts`), 35);
  });
  base = origin.base;
  const probe = probeFor(t, { maxConcurrent: 1 });
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, n) => probe.analyze(`${base}/list-${n}`))
  );
  assert.ok(results.some(result => result.status === 'fulfilled'));
  assert.ok(peak <= 1, `se observaron ${peak} descargas concurrentes`);
});

test('el servicio rechaza POST y mantiene disponible /health', async t => {
  const service = createService({
    ...loadConfig({ APE_PROBE_CACHE: 'off' }),
    allowPrivateHosts: ['127.0.0.1']
  });
  await new Promise((resolve, reject) => {
    service.server.once('error', reject);
    service.server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => service.close());
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const wrongMethod = await get(`${base}/probe`, 'POST');
  assert.equal(wrongMethod.status, 405);
  assert.match(wrongMethod.headers.allow, /GET/);
  const health = await get(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.headers['cache-control'], 'no-store');
});
