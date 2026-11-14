#!/usr/bin/env node
'use strict';
/**
 * tools/quality/test_canonical_route.js — prueba de la RUTA CANONICA /lists/<x>.m3u8
 *
 * Demuestra las cuatro propiedades exigidas, contra el MOTOR REAL
 * (tools/lab/ape-jit/server.js) arrancado en loopback sobre un directorio de
 * listas temporal:
 *
 *   T1 IDEMPOTENCIA  dos GET -> mismos bytes y mismo ETag; If-None-Match -> 304 vacio
 *   T2 POLIMORFISMO  mismo path con UA de VLC y con UA de OTT -> dos formas distintas,
 *                    cada una valida para su player, con tabla de diferencias
 *   T3 ISOMORFISMO   la misma lista con OTRO nombre -> misma estructura, id de la ruta
 *   T4 MEMORIA       RSS antes/despues de servir la lista completa; no crece con el fichero
 *
 * Sin red (loopback), sin VPS. Escribe solo en os.tmpdir y lo borra al terminar.
 *
 * Uso:  node tools/quality/test_canonical_route.js [--big-bytes N]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ENGINE = path.join(ROOT, 'tools', 'lab', 'ape-jit', 'server.js');
const PORT = 3211;
const SHIM_PORT = 8899;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'canon-route-'));
const LISTS = path.join(TMP, 'lists');
fs.mkdirSync(LISTS, { recursive: true });
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d; };
/* Tamano real de la lista del operador: 1.311.467.322 B. Por defecto se prueba
 * ESE tamano; --big-bytes permite bajarlo en hosts lentos. */
const BIG_BYTES = argOf('--big-bytes', 1311467322);

let engine = null;
let engineLog = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── listas sinteticas con la FORMA real ─────────────────────────────────── */
const APE_META = [
  '#EXT-X-APE-CONTRACT:ape.lista.v1',
  '#EXT-X-APE-ENHANCE-STATE:DECLARED',
  '#EXT-X-APE-POLICY:visual-canary-fase01-parity',
  '#EXT-X-APE-LADDER:1:remux_native,2:vpp,3:upscale,4:display',
  '#EXT-X-APE-ANTI-DEGRADATION:on',
  '#EXT-X-APE-CRYSTAL-4K:on',
  '#EXT-X-APE-CRYSTAL-6K:opt-in',
  '#EXT-X-APE-CODEC-REAL:hvc1.2.4.L153.B0',
  '#EXT-X-APE-CODEC-PREFERRED:hvc1.2.4.L153.B0',
  '#EXT-X-APE-VIDEO-RANGE:PQ',
  '#EXT-X-APE-HDR:DECLARED',
  '#EXT-X-APE-AUDIO:passthrough',
  '#EXT-X-APE-PREFETCH:8',
  '#EXT-X-APE-BUFFER:30/120',
  '#EXT-X-APE-CONCURRENCY:1',
  '#EXT-X-APE-PROVIDER-GATE:single',
  '#EXT-X-APE-SHIM:127.0.0.1',
  '#EXT-X-APE-MODE:cartridge|proxy',
  '#EXT-X-APE-AUTHORITY:canary',
  '#EXT-X-APE-RECEIPT:required',
  '#EXT-X-APE-TRUTH-GUARD:declared-not-applied',
  '#EXT-X-APE-WIRING:ape-wire-1'
];

function channelBlock(i) {
  const id = 'ch' + String(10000 + i);
  const name = 'CANAL ' + i + ' UHD';
  return ' tvg-id="' + id + '" tvg-name="' + name + '" tvg-logo="http://logo.example/' + id +
    '.png" group-title="DEPORTES HD",' + name + '\n' +
    'http://provider.example:8080/live/user/pass/' + (10000 + i) + '.m3u8\n';
}

function writeList(file, channels, opts) {
  const head = '#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift="0" x-ape-version="ape-wire-1"\n' +
    APE_META.join('\n') + '\n';
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeSync(fd, head);
    const pad = (opts && opts.padPerChannel) || 0;
    for (let i = 0; i < channels; i++) {
      let block = '#EXTINF:-1' + channelBlock(i);
      if (pad > 0) block = block + ('#EXT-X-APE-DIRECTIVE:' + 'x'.repeat(pad) + '\n');
      fs.writeSync(fd, block);
    }
  } finally { fs.closeSync(fd); }
  return fs.statSync(file);
}

/* ── cliente HTTP que NO bufferiza: hashea al vuelo ───────────────────────── */
async function getStreamed(p, headers) {
  const ac = new AbortController();
  const r = await fetch('http://127.0.0.1:' + PORT + p, { headers: headers || {}, signal: ac.signal, redirect: 'manual' });
  const h = crypto.createHash('sha256');
  let bytes = 0;
  const first = [];
  let keep = 3;
  if (r.body) {
    for await (const chunk of r.body) {
      h.update(chunk);
      bytes += chunk.length;
      if (keep > 0) { first.push(chunk.toString('utf8')); keep--; }
    }
  }
  return { status: r.status, headers: Object.fromEntries(r.headers), bytes, sha256: h.digest('hex'), head: first.join('').slice(0, 400) };
}

async function getBuffered(p, headers) {
  const r = await fetch('http://127.0.0.1:' + PORT + p, { headers: headers || {}, redirect: 'manual' });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: Object.fromEntries(r.headers), buf, text: buf.toString('utf8') };
}

/* ── arranque del motor ──────────────────────────────────────────────────── */
async function startEngine() {
  fs.mkdirSync(LISTS, { recursive: true });
  const map = path.join(TMP, 'map.json');
  fs.writeFileSync(map, JSON.stringify({ 1: { url: 'http://127.0.0.1:1/x.ts', name: 'x' } }));
  fs.mkdirSync(path.join(TMP, 'shm'), { recursive: true });
  engine = spawn(process.execPath, [ENGINE], {
    cwd: TMP,
    env: Object.assign({}, process.env, {
      PORT: String(PORT), BIND: '127.0.0.1', MAP_FILE: map,
      OUT_ROOT: path.join(TMP, 'shm'), LISTS_DIR: LISTS, APE_SHIM_PORT: String(SHIM_PORT),
      IDLE_MS: '180000', WAIT_MS: '60000', BOOT_GRACE_MS: '60000', APE_2K: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  engineLog = '';
  engine.stdout.on('data', (d) => { engineLog += String(d); });
  engine.stderr.on('data', (d) => { engineLog += String(d); });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/health');
      if (r.status === 200) return true;
    } catch (_) { /* arrancando */ }
    await sleep(250);
  }
  throw new Error('el motor no respondio /health: ' + engineLog.slice(-500));
}

/* ── casos ──────────────────────────────────────────────────────────────── */
const cases = [];
const check = (id, name, fn) => cases.push({ id, name, fn });
const assert = (c, m) => { if (!c) throw new Error(m); };
const STATE = {};
const UA_VLC = 'VLC/3.0.21 LibVLC/3.0.21';
const UA_OTT = 'OTT Navigator/1.6.6.3 (Linux; Android 11; ExoPlayer/2.18.1)';

check('T1', 'IDEMPOTENCIA: dos GET = mismos bytes y ETag; If-None-Match -> 304 vacio', async () => {
  const a = await getStreamed('/lists/APE_LISTA_1794100720046.m3u8', { 'User-Agent': UA_VLC });
  const b = await getStreamed('/lists/APE_LISTA_1794100720046.m3u8', { 'User-Agent': UA_VLC });
  assert(a.status === 200 && b.status === 200, 'status esperado 200, obtenido ' + a.status + '/' + b.status);
  assert(a.sha256 === b.sha256, 'DOS GET DIERON BYTES DISTINTOS: ' + a.sha256.slice(0, 16) + ' vs ' + b.sha256.slice(0, 16));
  assert(a.headers.etag === b.headers.etag, 'ETag distinto entre GET: ' + a.headers.etag + ' vs ' + b.headers.etag);
  assert(a.bytes === b.bytes, 'tamano distinto: ' + a.bytes + ' vs ' + b.bytes);
  const etag = a.headers.etag;
  /* [2026-11-14] La forma ya NO es cartridge|proxy: la ruta sirve VERBATIM siempre y
   * la polimorfia la hace pulse.php sobre las URLs de la lista. El ETag lleva la
   * forma 'verbatim' para que quede declarado en la cabecera, no para distinguir. */
  assert(/^"[0-9a-f]{32}-ape-wire-1-verbatim"$/.test(etag), 'ETag no derivado de sha256+version+forma: ' + etag);
  const c = await getStreamed('/lists/APE_LISTA_1794100720046.m3u8', { 'User-Agent': UA_VLC, 'If-None-Match': etag });
  assert(c.status === 304, 'If-None-Match no dio 304, dio ' + c.status);
  assert(c.bytes === 0, 'el 304 trajo cuerpo (' + c.bytes + ' B)');
  STATE.etagCartridge = etag;
  STATE.shaCartridge = a.sha256;
  return 'sha256=' + a.sha256.slice(0, 16) + '… en los 2 GET · ETag=' + etag + ' · 304 con 0 B';
});

check('T2', 'POLIMORFISMO: la ruta sirve VERBATIM y declara que el polimorfismo esta en la lista', async () => {
  const vlc = await getBuffered('/lists/APE_LISTA_1794100720046.m3u8', { 'User-Agent': UA_VLC });
  const ott = await getBuffered('/lists/APE_LISTA_1794100720046.m3u8', { 'User-Agent': UA_OTT });
  assert(vlc.status === 200 && ott.status === 200, 'status ' + vlc.status + '/' + ott.status);
  /* [2026-11-14 · DECISION MEDIDA]
   * La ruta NO reescribe URLs. Medido sobre la lista real del operador: cada canal
   * ya apunta a https://iptv-ape.duckdns.org/pulse/<id>.m3u8?u=<proveedor>&d=<device>
   * y pulse.php hace la polimorfia por User-Agent:
   *   VLC -> mode=cartridge;dialect=vlc   OTT -> mode=proxy
   * Por tanto el polimorfismo EXISTE, pero vive en la lista y en pulse.php, no aqui.
   * Reescribir al loopback del OttShim era doble cableado y roto: el shim corre EN EL
   * DEVICE, asi que 127.0.0.1 en una lista publicada lo resuelve cada cliente contra
   * si mismo. Lo que se verifica aqui es lo que la ruta SI aporta. */
  const shaV = sha256(vlc.buf), shaO = sha256(ott.buf);
  assert(shaV === shaO, 'la ruta sirve bytes distintos por UA: no es verbatim (' + shaV.slice(0, 12) + ' vs ' + shaO.slice(0, 12) + ')');
  const src = fs.readFileSync(path.join(LISTS, 'APE_LISTA_1794100720046.m3u8'));
  assert(shaV === sha256(src), 'la respuesta no es verbatim (sha distinto del fuente)');
  /* Ambas formas declaran ser verbatim y de donde viene el cableado. */
  for (const r of [vlc, ott]) {
    assert(r.headers['x-ape-served'] === 'verbatim', 'x-ape-served=' + r.headers['x-ape-served']);
    assert(r.headers['x-ape-channel-wiring'] === 'in-list:pulse.php-by-ua', 'x-ape-channel-wiring=' + r.headers['x-ape-channel-wiring']);
  }
  /* La forma se sigue REPORTANDO por UA: el dato no se pierde, solo no se usa para reescribir. */
  assert(vlc.headers['x-ape-form'] === 'cartridge', 'forma VLC=' + vlc.headers['x-ape-form']);
  assert(ott.headers['x-ape-form'] === 'proxy', 'forma OTT=' + ott.headers['x-ape-form']);
  /* Y la prueba de que el cableado YA esta en la lista: cada URL de canal es /pulse/<id>. */
  const urls = vlc.text.split('\n').filter((l) => l && !l.startsWith('#'));
  assert(urls.length > 0, 'la lista no tiene URLs de canal');
  const pulse = urls.filter((l) => /\/pulse\/[0-9]+\.m3u8\?u=/.test(l));
  assert(pulse.length === urls.length, 'solo ' + pulse.length + ' de ' + urls.length + ' URLs van cableadas por /pulse/');
  const ext = vlc.text.split('\n').filter((l) => l.startsWith('#EXTINF')).length;
  const meta = vlc.text.split('\n').filter((l) => l.startsWith('#EXT-X-APE-')).length;
  STATE.shaProxy = shaO;
  return 'verbatim en las 2 formas (sha=' + shaV.slice(0, 12) + '…) · ' + urls.length + ' URLs cableadas por /pulse/ · ' + ext + ' #EXTINF · ' + meta + ' #EXT-X-APE intactas';
});

check('T3', 'ISOMORFISMO: la misma lista con otro nombre -> misma estructura, id de la ruta', async () => {
  const alt = 'OTRA_LISTA_20261114_xyz';
  fs.copyFileSync(path.join(LISTS, 'APE_LISTA_1794100720046.m3u8'), path.join(LISTS, alt + '.m3u8'));
  const r = await getBuffered('/lists/' + alt + '.m3u8', { 'User-Agent': UA_VLC });
  assert(r.status === 200, 'la lista con otro nombre dio ' + r.status);
  const orig = fs.readFileSync(path.join(LISTS, 'APE_LISTA_1794100720046.m3u8'));
  assert(sha256(r.buf) === sha256(orig), 'el cuerpo cambio al cambiar el nombre');
  assert(r.headers['x-ape-list-id'] === alt, 'X-APE-List-Id no refleja la ruta: ' + r.headers['x-ape-list-id']);
  assert(r.headers.etag.split('-')[0] === '"' + sha256(orig).slice(0, 32), 'el ETag no deriva del contenido');
  const missing = await getBuffered('/lists/NO_EXISTE_123.m3u8', { 'User-Agent': UA_VLC });
  assert(missing.status === 404, 'una lista inexistente deberia dar 404, dio ' + missing.status);
  return 'pedida como ' + alt + ' -> ' + r.buf.length + ' B, sha256 identico, id de la ruta="' + r.headers['x-ape-list-id'] + '", inexistente -> 404';
});

check('T4', 'MEMORIA: servir la lista COMPLETA no crece con el fichero', async () => {
  const big = path.join(LISTS, 'APE_LISTA_BIG.m3u8');
  /* Se construye un fichero del TAMANO REAL (1.311.467.322 B) repitiendo el
   * bloque de canal medido: 62 KB por canal x 21.224 canales. */
  const per = Math.floor(BIG_BYTES / 21224);
  writeList(big, 21224, { padPerChannel: Math.max(0, per - 300) });
  const st = fs.statSync(big);
  const rssBefore = await readRss();
  assert(rssBefore > 0, 'no se pudo medir el RSS del motor (0 B): la prueba de memoria no seria evidencia');
  /* Muestreo concurrente: el pico ocurre MIENTRAS se sirve, no al terminar.
   * En Windows se usa UN proceso PowerShell que emite el RSS cada 200 ms: con un
   * tasklist por muestra el propio muestreo dominaba el tiempo de la prueba. */
  let peak = rssBefore;
  let sampler = null;
  if (process.platform === 'win32') {
    sampler = require('child_process').spawn('powershell', ['-NoProfile', '-Command',
      '$p=' + engine.pid + '; while($true){ try{ (Get-Process -Id $p).WorkingSet64 } catch { }; Start-Sleep -Milliseconds 200 }'],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    let acc = '';
    sampler.stdout.on('data', (d) => {
      acc += String(d);
      const parts = acc.split(/\r?\n/);
      acc = parts.pop();
      for (const p of parts) { const v = Number(p.trim()); if (Number.isFinite(v) && v > peak) peak = v; }
    });
  } else {
    sampler = setInterval(() => { readRss().then((v) => { if (v > peak) peak = v; }); }, 200);
  }
  const r1 = await getStreamed('/lists/APE_LISTA_BIG.m3u8', { 'User-Agent': UA_VLC });
  const r2 = await getStreamed('/lists/APE_LISTA_BIG.m3u8', { 'User-Agent': UA_VLC });
  if (process.platform === 'win32') { try { sampler.kill(); } catch (_) { } } else { clearInterval(sampler); }
  const rssAfter = await readRss();
  assert(r1.status === 200 && r2.status === 200, 'status ' + r1.status + '/' + r2.status);
  assert(r1.bytes === st.size, 'Content-Length/bytes servidos (' + r1.bytes + ') != tamano del fichero (' + st.size + ')');
  assert(r1.sha256 === r2.sha256, 'la lista GRANDE no es idempotente');
  const growthMB = (rssAfter - rssBefore) / 1048576;
  const peakMB = (peak - rssBefore) / 1048576;
  const limitMB = 96;
  assert(peakMB < limitMB, 'el RSS crecio ' + peakMB.toFixed(1) + ' MB sirviendo ' + (st.size / 1048576).toFixed(0) + ' MB (limite ' + limitMB + ' MB)');
  fs.unlinkSync(big);
  return 'fichero ' + (st.size / 1048576).toFixed(1) + ' MB servido 2x · RSS base ' + (rssBefore / 1048576).toFixed(1) +
    ' MB -> pico ' + (peak / 1048576).toFixed(1) + ' MB (+' + peakMB.toFixed(1) + ') -> final +' + growthMB.toFixed(1) +
    ' MB (limite ' + limitMB + ' MB) · sha256 estable en las 2 pasadas';
});

/* RSS del proceso del motor: en Linux /proc; en Windows, tasklist. */
async function readRss() {
  if (process.platform === 'linux') {
    try { const s = fs.readFileSync('/proc/' + engine.pid + '/status', 'utf8'); const m = s.match(/VmRSS:\s+(\d+) kB/); return m ? Number(m[1]) * 1024 : 0; } catch (_) { return 0; }
  }
  const r = require('child_process').spawnSync('tasklist', ['/FI', 'PID eq ' + engine.pid, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  /* Formato medido en este host: "node.exe","9680","Console","1","47.780 KB" */
  const m = String(r.stdout || '').match(/"[^"]+","\d+","[^"]+","\d+","([\d.,]+)\s*K[B]?"/);
  if (m) return Math.round(Number(String(m[1]).replace(/[.,]/g, '')) * 1024);
  const ps = require('child_process').spawnSync('powershell', ['-NoProfile', '-Command', '(Get-Process -Id ' + engine.pid + ').WorkingSet64'], { encoding: 'utf8' });
  const n = Number(String(ps.stdout || '').trim());
  return Number.isFinite(n) ? n : 0;
}

/* ── runner ─────────────────────────────────────────────────────────────── */
async function main() {
  console.log('== RUTA CANONICA /lists/<x>.m3u8 — motor real en loopback ==');
  console.log('tmp: ' + TMP + ' · LISTS_DIR=' + LISTS + ' · APE_SHIM_PORT=' + SHIM_PORT);
  console.log('lista de prueba grande: ' + (BIG_BYTES / 1048576).toFixed(1) + ' MB (la real del operador: 1250.7 MB)');
  console.log('');
  const st = writeList(path.join(LISTS, 'APE_LISTA_1794100720046.m3u8'), 21, {});
  console.log('lista funcional: ' + st.size + ' B, 21 canales, ' + APE_META.length + ' lineas #EXT-X-APE-*');
  console.log('');
  let pass = 0, fail = 0;
  try {
    await startEngine();
    for (const c of cases) {
      try {
        const d = await c.fn();
        pass++;
        console.log('  PASS  ' + c.id + '  ' + c.name);
        console.log('        ' + String(d).replace(/\n/g, '\n        '));
      } catch (e) {
        fail++;
        console.log('  FAIL  ' + c.id + '  ' + c.name);
        console.log('        ' + String((e && e.message) || e).split('\n').join('\n        '));
      }
    }
  } finally {
    try { if (engine) engine.kill('SIGKILL'); } catch (_) { }
    await sleep(400);
    try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) { /* best effort */ }
  }
  console.log('');
  console.log('-- resumen --');
  console.log('  casos: ' + cases.length + ' | PASS ' + pass + ' | FAIL ' + fail);
  console.log('  RESULT=' + (fail === 0 ? 'PASS' : 'FAIL'));
  process.exit(fail === 0 ? 0 : 1);
}

if (require.main === module) main().catch((e) => { console.error('TEST ERROR: ' + ((e && e.stack) || e)); try { if (engine) engine.kill('SIGKILL'); } catch (_) { } process.exit(1); });

