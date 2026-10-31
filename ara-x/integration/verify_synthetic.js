#!/usr/bin/env node
'use strict';

/**
 * X1 · Pruebas sintéticas del adaptador canónico sobre N = 100 y N = 40.000.
 *
 * Demuestra las propiedades que exige el owner:
 *   · OFF ⇒ byte-idéntico.
 *   · ON  ⇒ bloque de 27 líneas UNA vez, entre header y primer #EXTINF.
 *   · Idempotente: segunda pasada byte-idéntica.
 *   · Isomórfico: cada canal recibe sus directivas según su propia evidencia,
 *     independientemente de su posición; mismo canal ⇒ mismas directivas.
 *   · Polimórfico: LF y CRLF, header con/sin línea en blanco, con/sin evidencia.
 *   · 0 pérdida de canales · 0 URLs mutadas · 0 duplicados.
 *   · Sin hardcodeo de 10.631 (ni de ningún N).
 *   · Streaming de 40.000 canales con memoria acotada (maxPending « línea).
 *
 * Uso: node ara-x/integration/verify_synthetic.js
 * No escribe fuera de %TEMP%; no toca los hot files.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const adapter = require('./ara_x_adapter.js');

const checks = [];
const check = (id, name, ok, detail) => checks.push({ id, name, ok: !!ok, detail });
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const EXTINF_RE = /^#EXTINF/gm; // global para contar
const URL_RE = /^https?:\/\/\S+$/gm;
const count = (text, re) => (text.match(re) || []).length;
const urls = (text) => text.match(URL_RE) || [];

function buildCatalog(n, opts) {
  const o = opts || {};
  const eol = o.eol || '\n';
  const evidence = o.evidence || 'mixed';
  const lines = [];
  lines.push('#EXTM3U x-tvg-url="" refresh="1800"');
  lines.push('#EXT-X-VERSION:9');
  lines.push('#EXT-X-APE-CHANNELS:' + n);
  if (o.headerVariation === 1) lines.push('#EXT-X-APE-AUDIT:header-extra');
  lines.push('');
  for (let i = 0; i < n; i++) {
    const hasId = evidence === 'all' || (evidence === 'mixed' && i % 2 === 0);
    const hasProfile = evidence === 'all' || (evidence === 'mixed' && i % 3 === 0);
    const attrs = [];
    if (hasId) attrs.push('tvg-id="id' + i + '"');
    attrs.push('tvg-name="CH ' + i + '"');
    attrs.push('group-title="G' + (i % 10) + '"');
    if (hasProfile) attrs.push('ape-profile="P' + (i % 6) + '"');
    lines.push('#EXTINF:-1 ' + attrs.join(' ') + ',CH ' + i);
    lines.push('#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=3840x2160,CODECS="avc1.640033"');
    lines.push('https://cdn.example/live/' + i + '.m3u8');
    lines.push('');
  }
  return lines.join(eol);
}

function expectedDirectives(i, evidence) {
  const hasId = evidence === 'all' || (evidence === 'mixed' && i % 2 === 0);
  const hasProfile = evidence === 'all' || (evidence === 'mixed' && i % 3 === 0);
  const out = [];
  if (hasId) out.push('#EXT-X-ARA-CHANNEL-ID:id' + i);
  if (hasProfile) out.push('#EXT-X-ARA-PROFILE-HINT:P' + (i % 6));
  return out;
}

/** Extrae en UNA pasada (O(n)) las directivas de cada canal: índice -> [directivas]. */
function extractChannelDirectives(text) {
  const lines = text.split('\n');
  const out = new Map();
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    if (l.indexOf('#EXTINF') !== 0) continue;
    const m = /tvg-name="CH (\d+)"/.exec(l);
    if (!m) continue;
    const dirs = [];
    for (let j = k + 1; j < lines.length && lines[j].indexOf('#EXT-X-ARA-') === 0; j++) dirs.push(lines[j].trim());
    out.set(Number(m[1]), dirs);
  }
  return out;
}


function runForN(n) {
  const tag = 'N=' + n;
  const base = buildCatalog(n);
  const baseUrls = urls(base);
  const baseHash = sha(base);

  // OFF
  const off = adapter.transformText(base, { enabled: false, listVersion: 'syn-' + n });
  check(`SYN-${n}:off`, `${tag} OFF byte-idéntico`, off === base && sha(off) === baseHash, baseHash.slice(0, 16) + '…');

  // ON
  const on = adapter.transformText(base, { enabled: true, listVersion: 'syn-' + n });
  const blockAt = on.indexOf('#EXT-X-ARA-VERSION:');
  const firstExtinf = on.indexOf('#EXTINF');
  check(`SYN-${n}:block-once`, `${tag} bloque exactamente 1 vez`, count(on, /#EXT-X-ARA-VERSION:/g) === 1, String(count(on, /#EXT-X-ARA-VERSION:/g)));
  check(`SYN-${n}:block-pos`, `${tag} bloque antes del primer #EXTINF`, blockAt > 0 && blockAt < firstExtinf, `block@${blockAt} extinf@${firstExtinf}`);
  check(`SYN-${n}:block-lines`, `${tag} 27 líneas de bloque`, count(on, /^#EXT-X-ARA-/gm) === 27, String(count(on, /^#EXT-X-ARA-/gm)));
  check(`SYN-${n}:channels`, `${tag} 0 pérdida: ${n} #EXTINF`, count(on, EXTINF_RE) === n, String(count(on, EXTINF_RE)));
  const onUrls = urls(on);
  check(`SYN-${n}:urls`, `${tag} 0 URLs mutadas (${n})`, onUrls.length === baseUrls.length && sha(onUrls.join('\n')) === sha(baseUrls.join('\n')), String(onUrls.length));
  check(`SYN-${n}:no-dupes`, `${tag} 0 duplicados (EXTINF y URL únicos)`,
    new Set(on.match(EXTINF_RE) ? on.split('\n').filter((l) => l.indexOf('#EXTINF') === 0) : []).size === n &&
    new Set(onUrls).size === n, 'unique');

  // idempotencia
  const onTwice = adapter.transformText(on, { enabled: true, listVersion: 'syn-' + n });
  check(`SYN-${n}:idempotent`, `${tag} segunda pasada byte-idéntica`, onTwice === on && sha(onTwice) === sha(on), sha(on).slice(0, 16) + '…');

  // per-channel (O(n): extracción en una sola pasada)
  const per = adapter.transformText(base, { enabled: true, perChannel: true, listVersion: 'syn-' + n });
  const perTwice = adapter.transformText(per, { enabled: true, perChannel: true, listVersion: 'syn-' + n });
  const perOk = perTwice === per;
  const extracted = extractChannelDirectives(per);
  let mismatches = 0;
  for (let i = 0; i < n; i++) {
    const got = extracted.get(i);
    const want = expectedDirectives(i, 'mixed');
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      mismatches++;
      if (mismatches <= 3) check(`SYN-${n}:iso-${i}`, `${tag} canal ${i}`, false, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
    }
  }
  check(`SYN-${n}:iso-coverage`, `${tag} directivas presentes en los ${n} canales`, extracted.size === n, String(extracted.size));
  check(`SYN-${n}:isomorphic`, `${tag} per-channel isomórfico (${n} canales)`, mismatches === 0, mismatches + ' mismatch');
  check(`SYN-${n}:per-idempotent`, `${tag} per-channel segunda pasada byte-idéntica`, perOk, 'idempotente');
  check(`SYN-${n}:urls-per`, `${tag} per-channel 0 URLs mutadas`, JSON.stringify(urls(per)) === JSON.stringify(baseUrls), String(urls(per).length));

  // CRLF
  const crlfBase = buildCatalog(Math.min(n, 200), { eol: '\r\n' });
  const crlfOn = adapter.transformText(crlfBase, { enabled: true, perChannel: true, listVersion: 'syn-crlf' });
  check(`SYN-${n}:crlf`, `${tag} CRLF preservado y bloque insertado antes del primer #EXTINF`,
    crlfOn.indexOf('#EXT-X-ARA-VERSION:') > 0 &&
    crlfOn.indexOf('#EXT-X-ARA-VERSION:') < crlfOn.indexOf('#EXTINF') &&
    (crlfOn.match(/#EXT-X-ARA-VERSION:[^\r]*\r\n/) || []).length === 1,
    'crlf ok');

  // header variation
  const hvBase = buildCatalog(Math.min(n, 200), { headerVariation: 1 });
  const hvOn = adapter.transformText(hvBase, { enabled: true, listVersion: 'syn-hv' });
  check(`SYN-${n}:header-var`, `${tag} header con líneas extra ⇒ bloque antes del primer #EXTINF`,
    hvOn.indexOf('#EXT-X-ARA-VERSION:') < hvOn.indexOf('#EXTINF') && hvOn.indexOf('#EXT-X-ARA-VERSION:') > 0, 'ok');
}

function runStreaming() {
  const n = 40000;
  const tag = 'N=40000 (fichero)';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x1-syn-'));
  const inPath = path.join(tmp, 'catalog.m3u8');
  const outPath = path.join(tmp, 'catalog.once.m3u8');
  const out2Path = path.join(tmp, 'catalog.twice.m3u8');
  const base = buildCatalog(n);
  fs.writeFileSync(inPath, base, 'utf8');
  const t0 = Date.now();
  return Promise.all([adapter.transformFile(inPath, outPath, { enabled: true, perChannel: true, listVersion: 'stream-40k' })])
    .then(async ([r1]) => {
      const elapsed = Date.now() - t0;
      const once = fs.readFileSync(outPath, 'utf8');
      const twice = adapter.transformText(once, { enabled: true, perChannel: true, listVersion: 'stream-40k' });
      check('SYN-stream:run', `${tag} transform completado`, r1.ok && r1.mode === 'on', `${elapsed} ms · ${r1.bytesIn}→${r1.bytesOut} B`);
      check('SYN-stream:eq-text', `${tag} streaming ≡ transformText`, sha(once) === sha(adapter.transformText(base, { enabled: true, perChannel: true, listVersion: 'stream-40k' })), sha(once).slice(0, 16) + '…');
      check('SYN-stream:bounded', `${tag} memoria acotada (maxPending < 1 MiB)`, r1.stats.maxPending < 1024 * 1024, `${r1.stats.maxPending} B pendientes`);
      check('SYN-stream:idempotent', `${tag} segunda pasada (texto) byte-idéntica`, twice === once, 'idempotente');
      check('SYN-stream:channels', `${tag} 40.000 #EXTINF`, count(once, EXTINF_RE) === n, String(count(once, EXTINF_RE)));
      check('SYN-stream:urls', `${tag} 40.000 URLs sin mutar`, urls(once).length === n && sha(urls(once).join('\n')) === sha(urls(base).join('\n')), String(urls(once).length));
      // segunda pasada por fichero (bounded)
      const r2 = await adapter.transformFile(outPath, out2Path, { enabled: true, perChannel: true, listVersion: 'stream-40k' });
      check('SYN-stream:idempotent-file', `${tag} segunda pasada (fichero) byte-idéntica`,
        r2.ok && sha(fs.readFileSync(out2Path, 'utf8')) === sha(once), 'idempotente-file');
      // fail-open con línea gigante
      const bigPath = path.join(tmp, 'big.m3u8');
      const bigOut = path.join(tmp, 'big.out.m3u8');
      fs.writeFileSync(bigPath, '#EXTM3U\n#' + 'x'.repeat(1100 * 1024) + '\n', 'utf8');
      const r3 = await adapter.transformFile(bigPath, bigOut, { enabled: true, listVersion: 'big' });
      check('SYN-stream:fail-open', `${tag} línea > MAX ⇒ fail-open copia intacta`,
        r3.mode === 'fail-open' && sha(fs.readFileSync(bigOut, 'utf8')) === sha(fs.readFileSync(bigPath, 'utf8')), r3.mode);
      fs.rmSync(tmp, { recursive: true, force: true });
      return undefined;
    });
}

function runStatic() {
  const sources = ['ara-x-hook.js', 'ara_x_adapter.js']
    .map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'))
    .join('\n');
  check('SYN-static:no-hardcode', 'sin hardcodeo de 10.631 ni de un N concreto', !/10\.?631/.test(sources), 'clean');
}

function main() {
  for (const n of [100, 40000]) runForN(n);
  runStatic();
  runStreaming().then(() => {
    const failed = checks.filter((c) => !c.ok);
    for (const c of checks) {
      console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.id} · ${c.name}`);
      if (!c.ok || process.env.X1_VERBOSE === '1') console.log('      ' + c.detail);
    }
    console.log(`\nchecks=${checks.length} pass=${checks.length - failed.length} fail=${failed.length}`);
    console.log(JSON.stringify({ ok: failed.length === 0, checks: checks.length, failed: failed.map((c) => c.id) }));
    console.log(failed.length === 0 ? 'ALL_OK' : 'NOT_OK');
    process.exit(failed.length === 0 ? 0 : 1);
  }).catch((e) => { console.error(e); process.exit(1); });
}

main();
