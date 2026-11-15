#!/usr/bin/env node
/**
 * test_extshimott_wrap.js — el tag `#EXTSHIMOTT` en el envoltorio de listas.
 *
 * QUÉ PRUEBA (con el envoltorio REAL y el ApeUrlBuilder REAL):
 *   A. fixture sintético de 3 canales:
 *      - exactamente 1 tag por canal, inmediatamente antes de su URI;
 *      - payload ver:1 + id + tgt + SOLO los campos cuyo dato real existe
 *        (v.* desde #EXT-X-APE-STREAM-TRUTH, hdr.* desde #EXTHTTP del canal);
 *      - w/h OMITIDOS cuando la propia lista declara fuente fake;
 *      - UA con %20 y Referer al VPS OMITIDOS (contrato), contados;
 *      - censo protegido intacto (EXTHTTP/EXTVLCOPT/KODIPROP/STREAM-INF) y
 *        directivas del origen presentes en el mismo orden;
 *      - tail: el archivo NO acaba en tag;
 *      - idempotencia: 2ª corrida = mismo sha; re-envolver no duplica el tag;
 *      - validador del contrato (tools/quality/validate_extshimott.js) exit 0.
 *   B. muestra REAL de la lista cableada (regenerated_list_4K_RESOLVER.m3u8):
 *      lee sólo los 2 primeros bloques (streaming, no carga 222 MB) y repite
 *      las comprobaciones sobre bloques de ~745 líneas con EXTHTTP de 6.5 KB.
 *      Si el archivo no está, se declara SKIP (no se finge un PASS).
 *   C. comprobación ESTRUCTURAL del PHP (balance de llaves/paréntesis/strings).
 *      NO es `php -l`: es un pre-chequeo. El lint real se corre en un host con
 *      PHP (`php -l <fichero>`); el comando exacto se imprime al final.
 *
 * Uso: node tools/pulse/test_extshimott_wrap.js
 * Exit: 0 si PASS, 1 si FAIL.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const WRAP = path.join(__dirname, 'ape-pulse-wrap.js');
const BUILDER = path.join(ROOT, 'tools', 'url2', 'ape-url-builder.js');
const VALIDATOR = path.join(ROOT, 'tools', 'quality', 'validate_extshimott.js');
const PHP_HELPER = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'prisma', 'api', 'ape-shimott-emit.php');
const REAL_LIST = path.join(ROOT, 'regenerated_list_4K_RESOLVER.m3u8');

let pass = 0, fail = 0, skip = 0; const fallos = [];
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; fallos.push(n + (d ? ' :: ' + d : '')); console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); }
};
const skipOne = (n, why) => { skip++; console.log('  SKIP  ' + n + ' :: ' + why); };

const PREFIX = '#EXTSHIMOTT:';
const isTag = (x) => x.startsWith(PREFIX);
const isUrl = (x) => /^https?:\/\//.test(x);
const nonEmpty = (arr) => arr.filter((x) => x.trim() !== '');
const jsonEqual = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]);
    return o;
  }
  return v;
}
function tagsOf(text) {
  return text.split('\n').filter(isTag).map((x) => JSON.parse(x.slice(PREFIX.length)));
}
function census(text) {
  const c = { exthttp: 0, ape: 0, extvlcopt: 0, kodiprop: 0, stream_inf: 0, shimott: 0 };
  for (const line of text.split('\n')) {
    if (line.startsWith('#EXTHTTP:')) c.exthttp++;
    else if (line.startsWith('#EXT-X-APE-')) c.ape++;
    else if (line.startsWith('#EXTVLCOPT:')) c.extvlcopt++;
    else if (line.startsWith('#KODIPROP:')) c.kodiprop++;
    else if (line.startsWith('#EXT-X-STREAM-INF:')) c.stream_inf++;
    else if (line.startsWith(PREFIX)) c.shimott++;
  }
  return c;
}
/** Cabeceras REALES dentro de los #EXTHTTP (el "199 por canal" del operador). */
function exthttpKeys(text) {
  let n = 0, lines = 0, bad = 0;
  for (const line of text.split('\n')) {
    if (!line.startsWith('#EXTHTTP:')) continue;
    lines++;
    try {
      const o = JSON.parse(line.slice('#EXTHTTP:'.length));
      if (o && typeof o === 'object' && !Array.isArray(o)) n += Object.keys(o).length;
      else bad++;
    } catch (_) { bad++; }
  }
  return { keys: n, lines, bad };
}
/** Líneas de directiva que el wrap NO debe alterar (ni crear ni destruir). */
const OWNER_PREFIXES = [
  '#EXT-X-APE-LCEVC-PHASE:', '#EXT-X-APE-LCEVC-ENABLED:', '#EXT-X-APE-HDR10-PLUS:',
  '#EXT-X-APE-DOLBY-VISION:', '#EXT-X-APE-HDR-DV:', '#EXT-X-APE-AI-SR:',
  '#EXT-X-APE-MINTERPOLATE:', '#EXT-X-APE-ENHANCE-STATE:'
];
const isOwner = (x) => OWNER_PREFIXES.some((p) => x.startsWith(p));
function dirs(text) {
  return nonEmpty(text.split('\n')).filter((x) => x.startsWith('#') && !x.startsWith('#EXT-X-I-FRAME-STREAM-INF') && !isOwner(x) && !isTag(x));
}
function isSubsequence(sub, full) {
  let i = 0;
  for (const x of full) if (i < sub.length && x === sub[i]) i++;
  return i === sub.length;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'extshimott-wrap-'));
let seq = 0;
function wrapOne(inputText, opts = {}) {
  seq++;
  // El nombre del fichero de entrada viaja en la URL (`l=`) y por tanto en el
  // sha256: para probar idempotencia hay que REUSAR el mismo nombre.
  const base = opts.name || ('in' + seq);
  const inp = path.join(tmp, base + '.m3u8');
  const out = path.join(tmp, base + '.out.m3u8');
  fs.writeFileSync(inp, inputText, 'utf8');
  const stdout = execFileSync(process.execPath, [WRAP, '--in', inp, '--out', out, ...(opts.extra || [])], {
    env: Object.assign({}, process.env, { APE_URL_BUILDER: BUILDER }),
    encoding: 'utf8',
  }).trim();
  return { inp, out, res: JSON.parse(stdout), text: fs.readFileSync(out, 'utf8') };
}

/* ───────────────────────── A. fixture sintético ───────────────────────── */
const UA_A = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const RF_A = 'https://www.google.com/';
const FIXTURE = [
  '#EXTM3U',
  '#EXT-X-VERSION:9',
  '#EXT-X-APE-CHANNELS:3',
  '# FIXTURE #EXTSHIMOTT: dominios .invalid, sin hosts reales ni credenciales.',
  '#EXTINF:-1 tvg-id="es_c01" tvg-chno="1" tvg-name="FIX A" tvg-logo="https://fix.invalid/a.png" group-title="FIX",FIX A 4K',
  '#EXTHTTP:' + JSON.stringify({ 'User-Agent': UA_A, Referer: RF_A }),
  '#EXTVLCOPT:network-caching=4000',
  '#EXTVLCOPT:http-referrer=' + RF_A,
  '#KODIPROP:inputstream.adaptive.manifest_type=hls',
  '#KODIPROP:inputstream.adaptive.stream_selection_type=auto',
  '#EXT-X-APE-CODEC-REAL:hvc1.2.4.L153.B0',
  '#EXT-X-APE-STREAM-TRUTH:src=native-4k,w=3840,h=2160,fps=50,rawfps=50,family=HEVC,pq=1',
  '#EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=3840x2160,FRAME-RATE=50.000,CODECS="hvc1.2.4.L153.B0,ec-3",VIDEO-RANGE=PQ',
  'http://prov.invalid/live/u/p/1.m3u8',
  '#EXTINF:-1 tvg-id="es_c02" tvg-name="FIX B" group-title="FIX",FIX B 1080',
  '#EXTVLCOPT:network-caching=2000',
  '#EXT-X-APE-STREAM-TRUTH:src=fake-4k,w=3840,h=2160,fps=25,rawfps=25,family=AVC,pq=1',
  '#EXT-X-STREAM-INF:BANDWIDTH=6000000,AVERAGE-BANDWIDTH=4500000,RESOLUTION=3840x2160,FRAME-RATE=25.000,CODECS="avc1.640028,mp4a.40.2",VIDEO-RANGE=PQ',
  'http://prov.invalid/live/u/p/2.m3u8',
  '#EXTINF:-1 tvg-name="FIX C" group-title="FIX",FIX C SD',
  '#EXTHTTP:' + JSON.stringify({ 'User-Agent': 'Mozilla/5.0%20(X11;%20Linux%20x86_64)', Referer: 'https://iptv-ape.duckdns.org/' }),
  '#KODIPROP:inputstream.adaptive.manifest_type=hls',
  'http://prov.invalid/live/u/p/3.m3u8',
  '',
].join('\n');

console.log('== [A] ape-pulse-wrap · #EXTSHIMOTT sobre fixture sintetico ==');
const A = wrapOne(FIXTURE);
const aLines = A.text.split('\n');
const aTags = tagsOf(A.text);
const aCensusIn = census(FIXTURE);
const aCensusOut = census(A.text);

ok('3 canales, 3 tags (1 por canal)', A.res.channels === 3 && aTags.length === 3 && A.res.shimott === 3,
  JSON.stringify({ channels: A.res.channels, shimott: A.res.shimott, tags: aTags.length }));
ok('cada tag es la linea INMEDIATAMENTE anterior a su URI',
  aLines.every((x, i) => !isTag(x) || isUrl(aLines[i + 1] || '')));
ok('tail: el archivo NO acaba en tag (la ultima linea util es la URI)',
  isUrl(nonEmpty(aLines).slice(-1)[0]), JSON.stringify(nonEmpty(aLines).slice(-5)));
ok('el tag va DESPUES de las APE/EXTHTTP del bloque (no antes)', (() => {
  const i0 = aLines.findIndex((x) => x.startsWith('#EXTINF:'));
  const i1 = aLines.findIndex((x, i) => i > i0 && isUrl(x));
  const block = aLines.slice(i0, i1);
  const iTag = block.findIndex(isTag);
  const iHttp = block.findIndex((x) => x.startsWith('#EXTHTTP:'));
  const iApe = block.map((x, i) => (x.startsWith('#EXT-X-APE-') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  const iInf = block.findIndex((x) => x.startsWith('#EXT-X-STREAM-INF:'));
  return iTag > iHttp && iTag > iApe && iTag > iInf && iTag === block.length - 1;
})());

ok('canal A: v desde STREAM-TRUTH (native) + hdr desde EXTHTTP',
  jsonEqual(aTags[0], {
    ver: 1, id: 'es_c01',
    v: { c: 'hevc', f: 50, w: 3840, h: 2160 },
    hdr: { ua: UA_A, rf: RF_A },
    tgt: 'ott|vlc|kod',
  }), JSON.stringify(aTags[0]));

ok('canal B: fuente fake-4k => w/h OMITIDOS (no se declara 4K falso)',
  jsonEqual(aTags[1], { ver: 1, id: 'es_c02', v: { c: 'h264', f: 25 }, tgt: 'ott|vlc' }),
  JSON.stringify(aTags[1]));

ok('canal C: sin tvg-id -> id de ordinal; UA %20 y Referer VPS omitidos',
  jsonEqual(aTags[2], { ver: 1, id: 'ch3', tgt: 'ott|kod' }) &&
  A.res.shimott_id_fallback === 1 && A.res.shimott_ua_dropped === 1 && A.res.shimott_rf_dropped === 1,
  JSON.stringify({ tag: aTags[2], res: { idfb: A.res.shimott_id_fallback, ua: A.res.shimott_ua_dropped, rf: A.res.shimott_rf_dropped } }));

console.log('   tag canal A (' + aLines.find(isTag).length + ' chars): ' + aLines.find(isTag));
console.log('   tail -5 salida: ' + JSON.stringify(nonEmpty(aLines).slice(-5)));

ok('ningun campo inventado: v.hdr ausente aunque pq=1',
  aTags.every((t) => !t.v || !('hdr' in t.v)));

ok('censo protegido intacto (EXTHTTP/EXTVLCOPT/KODIPROP/STREAM-INF)',
  aCensusIn.exthttp === aCensusOut.exthttp &&
  aCensusIn.extvlcopt === aCensusOut.extvlcopt &&
  aCensusIn.kodiprop === aCensusOut.kodiprop &&
  aCensusIn.stream_inf === aCensusOut.stream_inf,
  JSON.stringify({ in: aCensusIn, out: aCensusOut }));

ok('cabeceras DENTRO de los #EXTHTTP intactas (llaves JSON)',
  exthttpKeys(FIXTURE).keys === exthttpKeys(A.text).keys && exthttpKeys(A.text).bad === 0,
  JSON.stringify({ in: exthttpKeys(FIXTURE), out: exthttpKeys(A.text) }));

console.log('   fixture ANTES  EXTHTTP=' + aCensusIn.exthttp + ' (llaves=' + exthttpKeys(FIXTURE).keys + ')' +
  ' EXTVLCOPT=' + aCensusIn.extvlcopt + ' KODIPROP=' + aCensusIn.kodiprop +
  ' STREAM-INF=' + aCensusIn.stream_inf + ' APE=' + aCensusIn.ape);
console.log('   fixture DESPUES EXTHTTP=' + aCensusOut.exthttp + ' (llaves=' + exthttpKeys(A.text).keys + ')' +
  ' EXTVLCOPT=' + aCensusOut.extvlcopt + ' KODIPROP=' + aCensusOut.kodiprop +
  ' STREAM-INF=' + aCensusOut.stream_inf + ' APE=' + aCensusOut.ape + ' #EXTSHIMOTT=' + aCensusOut.shimott);

ok('directivas del origen intactas, en orden (APE del origen ⊂ salida)',
  JSON.stringify(dirs(FIXTURE)) === JSON.stringify(dirs(A.text)) &&
  isSubsequence(dirs(FIXTURE).filter((x) => x.startsWith('#EXT-X-APE-')), dirs(A.text)));

ok('APE: salida = origen + 8 lineas del bloque del propietario por canal',
  aCensusOut.ape === aCensusIn.ape + 8 * 3,
  JSON.stringify({ in: aCensusIn.ape, out: aCensusOut.ape }));

ok('idempotente: misma entrada (mismo nombre) ⇒ mismo sha256', (() => {
  const B = wrapOne(FIXTURE, { name: 'idem' });
  const B2 = wrapOne(FIXTURE, { name: 'idem' });
  return B.res.sha256 === B2.res.sha256 && B2.res.shimott === 3;
})());

ok('re-envolver la salida no duplica el tag', (() => {
  const C = wrapOne(A.text, { name: 'rewrap' });
  return C.res.already === 3 && C.res.wrapped === 0 && C.text === A.text && C.res.shimott === 0 &&
    census(C.text).shimott === 3;
})());

ok('URL suelta en cabecera (sin #EXTINF) NO recibe tag', (() => {
  const H = ['#EXTM3U', 'http://prov.invalid/huerfana.m3u8', '#EXTINF:-1 tvg-id="c9",CANAL 9',
    'http://prov.invalid/live/9.m3u8', ''].join('\n');
  const W = wrapOne(H, { name: 'hdrurl' });
  const t = tagsOf(W.text);
  return W.res.shimott === 1 && t.length === 1 && t[0].id === 'c9' &&
    W.text.indexOf('#EXTSHIMOTT:') > W.text.indexOf('#EXTINF:');
})());

/* ── validador del contrato sobre la salida ── */
try {
  const vout = execFileSync(process.execPath, [VALIDATOR, A.out], { encoding: 'utf8' });
  ok('validador del contrato: PASS (exit 0)', /veredicto: PASS/.test(vout) && /tags=3/.test(vout), vout.split('\n').slice(-2).join(' | '));
} catch (e) {
  ok('validador del contrato: PASS (exit 0)', false, ((e.stdout || '') + (e.stderr || '')).slice(0, 800));
}

/* ───────────────────── B. muestra REAL de la lista cableada ───────────────────── */
console.log('\n== [B] muestra REAL (2 bloques) de regenerated_list_4K_RESOLVER.m3u8 ==');
function readFirstBlocks(file, want) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(65536);
  let carry = '', text = '', urls = 0, pos = 0;
  try {
    while (urls < want) {
      const n = fs.readSync(fd, buf, 0, buf.length, pos);
      if (n <= 0) break;
      pos += n;
      carry += buf.toString('utf8', 0, n);
      let i;
      while ((i = carry.indexOf('\n')) >= 0) {
        const line = carry.slice(0, i);
        carry = carry.slice(i + 1);
        text += line + '\n';
        if (isUrl(line)) urls++;
        if (urls >= want) break;
      }
    }
  } finally { fs.closeSync(fd); }
  return urls >= want ? text : '';
}
if (!fs.existsSync(REAL_LIST)) {
  skipOne('muestra real', 'no existe ' + REAL_LIST);
} else {
  const sample = readFirstBlocks(REAL_LIST, 2);
  ok('se leyeron 2 bloques completos (streaming, sin cargar 222 MB)', sample !== '' && sample.split('\n').filter(isUrl).length === 2);
  const R = wrapOne(sample);
  const rTags = tagsOf(R.text);
  const rIn = census(sample), rOut = census(R.text);
  ok('2 tags (1 por canal) en bloques reales de ~745 lineas', R.res.channels === 2 && rTags.length === 2 && R.res.shimott === 2,
    JSON.stringify({ channels: R.res.channels, shimott: R.res.shimott }));
  ok('EXTHTTP/KODIPROP/EXTVLCOPT/STREAM-INF intactos en la muestra real',
    rIn.exthttp === rOut.exthttp && rIn.kodiprop === rOut.kodiprop &&
    rIn.extvlcopt === rOut.extvlcopt && rIn.stream_inf === rOut.stream_inf,
    JSON.stringify({ in: rIn, out: rOut }));
  ok('cabeceras DENTRO de los #EXTHTTP intactas (muestra real)',
    exthttpKeys(sample).keys === exthttpKeys(R.text).keys && exthttpKeys(R.text).bad === 0,
    JSON.stringify({ in: exthttpKeys(sample), out: exthttpKeys(R.text) }));
  ok('directivas del origen intactas, en orden (muestra real)',
    isSubsequence(dirs(sample), dirs(R.text)));
  ok('payload real: id = tvg-id y v desde STREAM-TRUTH',
    rTags.every((t, i) => {
      const ext = R.text.split('\n').filter((x) => x.startsWith('#EXTINF:'))[i] || '';
      const m = /tvg-id="([^"]*)"/.exec(ext);
      return t.ver === 1 && m && t.id === m[1] && t.tgt === 'ott|vlc|kod' && t.v && t.v.c;
    }), JSON.stringify(rTags.map((t) => ({ id: t.id, v: t.v, tgt: t.tgt }))));
  {
    const t1 = R.text.split('\n').find(isTag) || '';
    console.log('   tag real 1 (' + t1.length + ' chars): ' + t1.slice(0, 460) + (t1.length > 460 ? ' …' : ''));
  }
  try {
    const vout = execFileSync(process.execPath, [VALIDATOR, R.out], { encoding: 'utf8' });
    ok('validador del contrato sobre la muestra real: PASS (exit 0)', /veredicto: PASS/.test(vout) && /tags=2/.test(vout),
      vout.split('\n').slice(-2).join(' | '));
  } catch (e) {
    ok('validador del contrato sobre la muestra real: PASS (exit 0)', false, ((e.stdout || '') + (e.stderr || '')).slice(0, 1200));
  }
  console.log('   muestra real: EXTHTTP=' + rIn.exthttp + ' (llaves=' + exthttpKeys(sample).keys + ')' +
    ' EXTVLCOPT=' + rIn.extvlcopt + ' KODIPROP=' + rIn.kodiprop +
    ' STREAM-INF=' + rIn.stream_inf + ' APE=' + rIn.ape + ' -> APE=' + rOut.ape +
    ' (bloque del propietario: ' + (rOut.ape - rIn.ape) + ')');
}

/* ───────────────────── C. PHP: comprobación estructural ───────────────────── */
console.log('\n== [C] PHP · comprobacion ESTRUCTURAL (no es php -l) ==');
function phpStructCheck(file) {
  if (!fs.existsSync(file)) return ['no existe el archivo'];
  const src = fs.readFileSync(file, 'utf8');
  const issues = [];
  if (!src.startsWith('<?php')) issues.push('no empieza por <?php');
  if (/\?>\s*$/.test(src)) issues.push('termina con ?> (salida accidental si hay bytes tras el)');
  const depth = { '{': 0, '(': 0, '[': 0 };
  const openOf = { '}': '{', ')': '(', ']': '[' };
  let i = 0, line = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        if (src[i] === '\n') line++;
        i++;
      }
      continue;
    }
    if (c === '{' || c === '(' || c === '[') { depth[c]++; i++; continue; }
    if (c === '}' || c === ')' || c === ']') {
      depth[openOf[c]]--;
      if (depth[openOf[c]] < 0) issues.push('cierre de "' + c + '" sin apertura (linea ' + line + ')');
      i++;
      continue;
    }
    i++;
  }
  for (const k of Object.keys(depth)) if (depth[k] !== 0) issues.push('sin cerrar "' + k + '" x' + depth[k]);
  return issues;
}
{
  const api = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'prisma', 'api');
  const files = [PHP_HELPER, path.join(api, 'ape-feedforward.php'), path.join(api, 'ape-feedforward-stream.php')];
  for (const f of files) {
    const issues = phpStructCheck(f);
    ok('estructura PHP: ' + path.basename(f), issues.length === 0, issues.join('; '));
  }
  console.log('   lint real (host con PHP): php -l ' + files.map((f) => path.relative(ROOT, f)).join(' && php -l '));
}

/* ───────────────────────── resultado ───────────────────────── */
console.log('\n== RESULTADO: ' + pass + ' PASS · ' + fail + ' FAIL · ' + skip + ' SKIP ==');
if (fail) { console.log('Fallos:'); fallos.forEach((f) => console.log('  - ' + f)); }
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { }
process.exit(fail ? 1 : 0);
