#!/usr/bin/env node
'use strict';

/**
 * V2 · E2E sobre las DOS capturas completas del catálogo real (ARA-X).
 *
 * Por cada lista:
 *
 *   input (captura full)  ──▶  analyze (validator)          ─┐
 *        │                    scan (sha256 + URLs por URL)  ─┤ invariantes antes
 *        ▼                                                    │
 *   injectFile #1 (27 líneas ARA-X antes del primer #EXTINF)  │
 *        ▼                                                    │
 *   once  ──▶ validate (ara_x_validator) + compare           ─┤ invariantes después
 *        │     scan (sha256 + URLs por URL)                  │
 *        ▼                                                    │
 *   injectFile #2 (debe ser no-op) ──▶ twice                 ─┤ idempotencia
 *        ▼                                                    ▼
 *   publica once/twice en ara-x/evidence/ y emite reporte (JSON + MD)
 *
 * Verifica: truncamiento (EXTINF == #EXT-X-APE-CHANNELS), 0 pérdida, 0 URL mutada
 * (sha256 por URL + agregado), idempotencia byte a byte, bloque ARA/Never-Drop
 * único, captura completa, sin bloques sin URL, y reporta los hallazgos
 * PRE-EXISTENTES de R1 (p. ej. 45 canales sin #EXT-X-STREAM-INF en la CDN: el
 * footer `errors=0` del propio generador NO es prueba de completitud).
 *
 * Identidad (R1 §0.8 / D3 `artifact`): `artifact_sha256` = sha256 de la captura de
 * entrada; `generation_id` = id determinista de ESTA generación (artefacto +
 * versión ARA-X + list_version + bloque). La byte-identidad solo se afirma
 * INTRA-generación (once vs twice con los mismos parámetros); entre
 * generaciones (p. ej. otro `list_version`) el archivo NO es byte-idéntico por
 * diseño — se demuestra comparando contra la generación previa de I2.
 *
 * Sin red, sin VPS, sin deploy. Escribe SOLO:
 *   ara-x/evidence/<outputs del scope t20>
 *   ara-x/reports/V2_e2e.json · ara-x/reports/V2_e2e_report.md
 *
 * Uso:
 *   node ara-x/scripts/e2e/run_e2e.js --list all      # 4K + CDN (≈10 min, 2,3 GB I/O)
 *   node ara-x/scripts/e2e/run_e2e.js --list 4K
 *   node ara-x/scripts/e2e/run_e2e.js --list CDN
 *   node ara-x/scripts/e2e/run_e2e.js --selftest      # sintético, no toca evidence/
 *   flags: --dry-run (no publica), --keep-temp, --json, --help
 *
 * Exit: 0 ⟺ todas las listas pasan TODO; 1 invariante roja; 2 error de uso/IO.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const injector = require('../../playlist/ara_x_injector.js');
const validator = require('../../playlist/ara_x_validator.js');

const ROOT = path.resolve(__dirname, '..', '..');                 // …/ara-x
const REPO = path.resolve(ROOT, '..');
const EVIDENCE = path.join(ROOT, 'evidence');
const REPORT_JSON = path.join(ROOT, 'reports', 'V2_e2e.json');
const REPORT_MD = path.join(ROOT, 'reports', 'V2_e2e_report.md');

const GENERATION = Object.freeze({
  schema: 'ara-x.playlist.generation/1',
  // D1 fija LIST_VERSION = 2026-10-30T22:07:37Z; I2 (check_lists) y V2 usan el mismo valor.
  list_version: '2026-10-30T22:07:37Z',
  per_channel: false
});
const ARA_VERSION = injector.ARA_VERSION;
const SYNC_URL = injector.DEFAULT_SYNC_URL;
const CLIENT_TYPE = injector.DEFAULT_CLIENT_TYPE;

const BLOCK = injector.buildGlobalBlock({
  listVersion: GENERATION.list_version,
  syncUrl: SYNC_URL,
  clientType: CLIENT_TYPE
});
const BLOCK_SHA256 = sha256(Buffer.from(BLOCK.join('\n') + '\n', 'utf8'));

const LISTS = [
  {
    id: '4K_LOCAL_FULL',
    label: 'APE_LISTA_4K (captura local full)',
    input: path.join(EVIDENCE, 'APE_LISTA_4K_live_20261030_full.m3u8'),
    outputs: {
      once: path.join(EVIDENCE, 'APE_LISTA_4K_ARA-X_once.m3u8'),
      twice: path.join(EVIDENCE, 'APE_LISTA_4K_ARA-X_twice.m3u8')
    },
    // Referencia de la generación previa (I2/e2e_baseline, list_version 2026-10-29T11:54:23Z).
    previousGeneration: path.join(EVIDENCE, 'APE_LISTA_4K_live_20261030_full_ARA-X_once.m3u8'),
    knownInputSha: 'e27c03eb45dacd6e5f19c3f4e016b456236ca2c06f485ddf11165ddc86e2a680',
    expected: {
      extinf: 10631,
      urls: 10631,
      streamInf: 10631,
      extattr: 584705,
      declaredChannels: 10631,
      channelsWithoutStreamInf: 0
    }
  },
  {
    id: 'CDN_FULL',
    label: 'APE_LISTA_CDN_1793397700248 (full)',
    input: path.join(EVIDENCE, 'APE_LISTA_CDN_1793397700248_full.m3u8'),
    outputs: {
      once: path.join(EVIDENCE, 'APE_LISTA_CDN_1793397700248_full_ARA-X_once.m3u8'),
      twice: path.join(EVIDENCE, 'APE_LISTA_CDN_1793397700248_full_ARA-X_twice.m3u8')
    },
    previousGeneration: null,
    knownInputSha: '81dbdd11ec620b1dead702ca404c9959c61f301639a5d0091da37ebfb95be14e',
    expected: {
      extinf: 10631,
      urls: 10631,
      streamInf: 10586,          // R1 §3.3: 45 canales |IL| sin variante
      declaredChannels: 10631,
      channelsWithoutStreamInf: 45
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// utilidades
// ─────────────────────────────────────────────────────────────────────────────

const posix = (p) => p.split(path.sep).join('/');
const rel = (p) => posix(path.relative(ROOT, p)) === '' ? '.' : posix(path.relative(REPO, p));
const relRepo = (p) => posix(path.relative(REPO, p));

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function stamp(date = new Date()) {
  // Fecha/hora LOCAL con su offset real: `toISOString()` da UTC, así que se
  // desplaza el instante por el offset antes de etiquetarlo (evita el clásico
  // "UTC con sufijo local", que adelanta/atrasa la fecha reportada).
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  const local = new Date(date.getTime() + off * 60000);
  return local.toISOString().replace('Z', `${sign}${hh}:${mm}`);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    let bytes = 0;
    stream.on('data', (chunk) => { bytes += chunk.length; hash.update(chunk); });
    stream.on('end', () => resolve({ sha256: hash.digest('hex'), bytes }));
    stream.on('error', reject);
  });
}

function fmtBytes(n) {
  if (n == null) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(3)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(3)} MB`;
  return `${n} B`;
}

function check(list, name, ok, detail) {
  list.checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? null : detail });
}

function generationId(artifactSha256) {
  const h = sha256(Buffer.from([
    GENERATION.schema,
    artifactSha256,
    ARA_VERSION,
    GENERATION.list_version,
    BLOCK_SHA256,
    `per_channel=${GENERATION.per_channel}`
  ].join('|'), 'utf8'));
  return 'ara-x.gen1:' + h.slice(0, 32);
}

// ─────────────────────────────────────────────────────────────────────────────
// scanFile: sha256 del archivo + conteos + sha256 POR URL (una lectura)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee el archivo una sola vez y devuelve:
 *  - sha256/bytes del archivo
 *  - counts: lines, blank, crlf, extinf, urls, streamInf, extattr, declaredChannels
 *  - urlSha256 agregado (url + '\n', mismo cálculo que ara_x_validator)
 *  - perUrlHashes: sha256 de cada URL en orden (para comparar 1:1 antes/después)
 *  - blocks/blockUrlCounts/wrongBlocks (cada #EXTINF debe tener exactamente 1 URL)
 *  - sampleUrls enmascaradas
 */
async function scanFile(filePath) {
  const fileHash = crypto.createHash('sha256');
  const urlHash = crypto.createHash('sha256');
  const perUrlHashes = [];
  const blockUrlCounts = [];
  const sampleUrls = [];
  const counts = {
    bytes: 0, lines: 0, blankLines: 0, crlfLines: 0,
    extinf: 0, urls: 0, streamInf: 0, extattr: 0, declaredChannels: 0, comments: 0,
    araTags: 0, araNeverDrop: 0, araVersionLines: 0
  };
  let currentBlockUrls = 0;
  let inBlock = false;
  let tail = Buffer.alloc(0);

  const handleLine = (line) => {
    counts.lines += 1;
    if (line === '') { counts.blankLines += 1; return; }
    if (line.startsWith('#EXTINF')) {
      if (inBlock) blockUrlCounts.push(currentBlockUrls);
      inBlock = true;
      currentBlockUrls = 0;
      counts.extinf += 1;
      return;
    }
    if (line.startsWith('#')) {
      counts.comments += 1;
      if (line.startsWith('#EXT-X-ARA-')) {
        counts.araTags += 1;
        if (line === '#EXT-X-ARA-MODE:never-drop') counts.araNeverDrop += 1;
        if (line.startsWith('#EXT-X-ARA-VERSION:')) counts.araVersionLines += 1;
      }
      if (line.startsWith('#EXT-X-STREAM-INF')) counts.streamInf += 1;
      else if (line.startsWith('#EXTATTRFROMURL')) counts.extattr += 1;
      else if (line.startsWith('#EXT-X-APE-CHANNELS')) {
        const n = Number.parseInt(line.slice(line.indexOf(':') + 1), 10);
        if (Number.isInteger(n) && n > 0) counts.declaredChannels = n;
      }
      return;
    }
    counts.urls += 1;
    currentBlockUrls += 1;
    perUrlHashes.push(sha256(Buffer.from(line, 'utf8')));
    urlHash.update(line + '\n', 'utf8');
    if (sampleUrls.length < 3) sampleUrls.push(validator.maskUrl(line));
  };

  await new Promise((resolve, reject) => {
    const reader = fs.createReadStream(filePath, { highWaterMark: 1 << 20 });
    reader.on('data', (chunk) => {
      fileHash.update(chunk);
      counts.bytes += chunk.length;
      const buf = tail.length ? Buffer.concat([tail, chunk]) : chunk;
      let start = 0;
      let idx = buf.indexOf(0x0a);
      while (idx !== -1) {
        let lineBuf = buf.subarray(start, idx);
        if (lineBuf.length && lineBuf[lineBuf.length - 1] === 0x0d) {
          lineBuf = lineBuf.subarray(0, lineBuf.length - 1);
          counts.crlfLines += 1;
        }
        handleLine(lineBuf.toString('utf8'));
        start = idx + 1;
        idx = buf.indexOf(0x0a, start);
      }
      tail = Buffer.from(buf.subarray(start));
    });
    reader.on('error', reject);
    reader.on('end', () => {
      if (tail.length) {
        let lineBuf = tail;
        if (lineBuf.length && lineBuf[lineBuf.length - 1] === 0x0d) {
          lineBuf = lineBuf.subarray(0, lineBuf.length - 1);
          counts.crlfLines += 1;
        }
        handleLine(lineBuf.toString('utf8'));
      }
      resolve();
    });
  });

  if (inBlock) blockUrlCounts.push(currentBlockUrls);
  const wrongSamples = [];
  let wrong = 0;
  blockUrlCounts.forEach((count, i) => {
    if (count !== 1) {
      wrong += 1;
      if (wrongSamples.length < 5) wrongSamples.push({ block: i + 1, urls: count });
    }
  });

  return {
    file: relRepo(filePath),
    sha256: fileHash.digest('hex'),
    bytes: counts.bytes,
    counts,
    urlSha256: urlHash.digest('hex'),
    perUrlHashes,
    perUrlDigest: sha256(Buffer.from(perUrlHashes.join('\n'), 'utf8')),
    blocks: blockUrlCounts.length,
    blocksWithWrongUrlCount: wrong,
    wrongSamples,
    sampleUrls
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// identidad de la fuente (cabecera del catálogo)
// ─────────────────────────────────────────────────────────────────────────────

async function readSourceIdentity(filePath) {
  const out = { list_id: null, generated: null, sys_version: null, lab_dna: null };
  const rl = require('node:readline').createInterface({
    input: fs.createReadStream(filePath, { end: 2 * 1024 * 1024, encoding: 'utf8' }),
    crlfDelay: Infinity
  });
  let n = 0;
  for await (const line of rl) {
    n += 1;
    let m;
    if (!out.list_id && (m = /^#EXT-X-SYS-LIST-ID:(.*)$/.exec(line))) out.list_id = m[1].trim();
    if (!out.generated && (m = /^#EXT-X-SYS-GENERATED:(.*)$/.exec(line))) out.generated = m[1].trim();
    if (!out.sys_version && (m = /^#EXT-X-SYS-VERSION:(.*)$/.exec(line))) out.sys_version = m[1].trim();
    if (!out.lab_dna && (m = /^#EXT-X-APE-LAB-DNA:(.*)$/.exec(line))) out.lab_dna = m[1].trim();
    if (n > 200) break;
  }
  rl.close();
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// diff de líneas entre dos archivos (para la comparación entre generaciones)
// ─────────────────────────────────────────────────────────────────────────────

async function diffLines(pathA, pathB, maxSamples = 3) {
  const rlA = require('node:readline').createInterface({
    input: fs.createReadStream(pathA, { encoding: 'utf8' }), crlfDelay: Infinity
  });
  const rlB = require('node:readline').createInterface({
    input: fs.createReadStream(pathB, { encoding: 'utf8' }), crlfDelay: Infinity
  });
  const itA = rlA[Symbol.asyncIterator]();
  const itB = rlB[Symbol.asyncIterator]();
  const samples = [];
  let line = 0;
  let differing = 0;
  for (;;) {
    const [a, b] = await Promise.all([itA.next(), itB.next()]);
    if (a.done || b.done) {
      if (a.done !== b.done) differing += 1;
      break;
    }
    line += 1;
    if (a.value !== b.value) {
      differing += 1;
      if (samples.length < maxSamples) {
        const safe = (s) => (/^#EXT-X-ARA-/.test(s) ? s : `<línea ${line} distinta>`);
        samples.push({ line, a: safe(a.value), b: safe(b.value) });
      }
    }
  }
  rlA.close();
  rlB.close();
  const sizeA = fs.statSync(pathA).size;
  const sizeB = fs.statSync(pathB).size;
  return { compared_lines: line, differing_lines: differing, same_bytes: sizeA === sizeB, samples, bytes_a: sizeA, bytes_b: sizeB };
}

// ─────────────────────────────────────────────────────────────────────────────
// pipeline por lista
// ─────────────────────────────────────────────────────────────────────────────

async function runList(spec, opts = {}) {
  const dryRun = opts.dryRun === true;
  const tmpDir = opts.tmpDir;
  const list = {
    id: spec.id,
    label: spec.label,
    ok: false,
    checks: [],
    input: null,
    generation: null,
    before: null,
    after: null,
    url_integrity: null,
    validator: null,
    compare: null,
    inject: null,
    second_pass: null,
    outputs: [],
    previous_outputs: [],
    cross_generation: null,
    preexisting: [],
    errors: [],
    elapsed_ms: 0
  };
  const started = Date.now();
  const base = path.basename(spec.input, '.m3u8');
  const onceTmp = path.join(tmpDir, `${base}.once.tmp.m3u8`);
  const twiceTmp = path.join(tmpDir, `${base}.twice.tmp.m3u8`);

  if (!fs.existsSync(spec.input)) {
    list.errors.push(`input ausente: ${spec.input}`);
    check(list, 'file_present', false, path.basename(spec.input));
    list.elapsed_ms = Date.now() - started;
    return list;
  }
  check(list, 'file_present', true, path.basename(spec.input));

  // 1 · antes: stats ricos (validator) + scan (sha256/URLs)
  const before = await validator.analyzeFile(spec.input);
  const scanBefore = await scanFile(spec.input);
  const sourceIdentity = await readSourceIdentity(spec.input);
  const artifactSha256 = scanBefore.sha256;
  const genId = generationId(artifactSha256);

  list.input = {
    file: relRepo(spec.input),
    bytes: scanBefore.bytes,
    sha256: artifactSha256,
    artifact_sha256: artifactSha256,
    generation_id: genId,
    source_identity: sourceIdentity
  };
  list.generation = {
    schema: GENERATION.schema,
    ara_version: ARA_VERSION,
    list_version: GENERATION.list_version,
    block_sha256: BLOCK_SHA256,
    block_lines: BLOCK.length,
    per_channel: GENERATION.per_channel,
    sync_url: SYNC_URL,
    client_type: CLIENT_TYPE,
    generation_id: genId
  };

  check(list, 'input_sha256_hex64', /^[a-f0-9]{64}$/.test(artifactSha256), artifactSha256.slice(0, 16) + '…');
  check(list, 'input_known_artifact', !spec.knownInputSha || artifactSha256 === spec.knownInputSha,
    spec.knownInputSha ? { expected: spec.knownInputSha.slice(0, 16) + '…', got: artifactSha256.slice(0, 16) + '…' } : 'sin referencia fija');

  const exp = spec.expected || {};
  const beforeCounts = {
    extinf: before.extinf,
    urls: before.urls,
    streamInf: before.streamInf,
    extattr: before.extattr,
    declaredChannels: before.declaredChannels,
    blocks: before.blocks,
    blocksWithWrongUrlCount: before.blocksWithWrongUrlCount,
    channelsWithoutStreamInf: before.catalog.channelsWithoutStreamInf
  };
  list.before = beforeCounts;

  check(list, 'input_extinf_expected', exp.extinf == null || before.extinf === exp.extinf, { expect: exp.extinf, got: before.extinf });
  check(list, 'input_urls_expected', exp.urls == null || before.urls === exp.urls, { expect: exp.urls, got: before.urls });
  check(list, 'input_streaminf_expected', exp.streamInf == null || before.streamInf === exp.streamInf, { expect: exp.streamInf, got: before.streamInf });
  check(list, 'input_extattr_expected', exp.extattr == null || before.extattr === exp.extattr, { expect: exp.extattr, got: before.extattr });
  check(list, 'input_declared_channels_expected', exp.declaredChannels == null || before.declaredChannels === exp.declaredChannels,
    { expect: exp.declaredChannels, got: before.declaredChannels });
  check(list, 'input_channels_without_streaminf_expected',
    exp.channelsWithoutStreamInf == null || before.catalog.channelsWithoutStreamInf === exp.channelsWithoutStreamInf,
    { expect: exp.channelsWithoutStreamInf, got: before.catalog.channelsWithoutStreamInf });
  check(list, 'input_extinf_equals_ape_channels', before.declaredChannels > 0 && before.extinf === before.declaredChannels,
    { extinf: before.extinf, ape_channels: before.declaredChannels });
  check(list, 'input_capture_complete', before.declaredChannels > 0 && before.extinf === before.declaredChannels,
    { declared: before.declaredChannels, measured: before.extinf });
  check(list, 'input_no_ara_block', before.araTags === 0 && scanBefore.counts.araTags === 0,
    { validator_araTags: before.araTags, scan_araTags: scanBefore.counts.araTags });

  // 2 · inyectar una vez
  const inject = await injector.injectFile(spec.input, onceTmp, {
    listVersion: GENERATION.list_version,
    syncUrl: SYNC_URL,
    clientType: CLIENT_TYPE,
    perChannel: GENERATION.per_channel
  });
  list.inject = inject;
  check(list, 'injected', inject.injected === true, inject.reason);
  check(list, 'block_lines_27', inject.blockLines === 27, inject.blockLines);
  check(list, 'eol_preserved', (inject.eol || 'LF') === (scanBefore.counts.crlfLines > 0 ? 'CRLF' : 'LF'),
    { input_crlf_lines: scanBefore.counts.crlfLines, inject_eol: inject.eol });

  // 3 · después: validate (errores ARA/estructurales) + compare + scan
  const report = await validator.validateFile(onceTmp, {
    expectChannels: before.extinf,
    expectUrlSha256: before.urlSha256,
    requireAra: true
  });
  const cmp = validator.compare(before, report.stats);
  const scanAfter = await scanFile(onceTmp);
  const after = report.stats;

  list.after = {
    extinf: after.extinf,
    urls: after.urls,
    streamInf: after.streamInf,
    extattr: after.extattr,
    declaredChannels: after.declaredChannels,
    blocks: after.blocks,
    blocksWithWrongUrlCount: after.blocksWithWrongUrlCount,
    channelsWithoutStreamInf: after.catalog.channelsWithoutStreamInf,
    araVersion: after.araVersion,
    araTags: after.araTags,
    araGlobalLines: after.ara.globalLines,
    araChannelLines: after.ara.channelLines
  };
  list.validator = {
    ok: report.ok,
    errors: report.errors,
    preexisting: report.preexisting
  };
  list.preexisting = report.preexisting;
  list.compare = {
    ok: cmp.ok,
    checks: cmp.checks,
    failed: cmp.checks.filter((c) => !c.ok)
  };

  check(list, 'validator_ok', report.ok === true, report.errors.slice(0, 4));
  check(list, 'validator_no_errors', report.errors.length === 0, report.errors.length);
  check(list, 'channels_preserved', before.extinf === after.extinf, { before: before.extinf, after: after.extinf });
  check(list, 'urls_preserved', before.urls === after.urls, { before: before.urls, after: after.urls });
  check(list, 'streaminf_preserved', before.streamInf === after.streamInf, { before: before.streamInf, after: after.streamInf });
  check(list, 'extattr_preserved', before.extattr === after.extattr, { before: before.extattr, after: after.extattr });
  check(list, 'declared_channels_preserved', before.declaredChannels === after.declaredChannels,
    { before: before.declaredChannels, after: after.declaredChannels });
  check(list, 'extinf_equals_ape_channels_after', after.extinf === after.declaredChannels,
    { extinf: after.extinf, ape_channels: after.declaredChannels });
  check(list, 'capture_complete_after', after.declaredChannels > 0 && after.extinf === after.declaredChannels,
    { declared: after.declaredChannels, measured: after.extinf });
  check(list, 'zero_wrong_url_blocks_after', after.blocksWithWrongUrlCount === 0,
    { blocks: after.blocks, wrong: after.blocksWithWrongUrlCount, samples: after.wrongSamples });
  check(list, 'ara_block_exactly_once',
    after.araVersion === 1 && scanAfter.counts.araTags === BLOCK.length &&
    scanAfter.counts.araVersionLines === 1 && after.duplicateAra.length === 0,
    {
      araVersion: after.araVersion,
      araTags: scanAfter.counts.araTags,
      araVersionLines: scanAfter.counts.araVersionLines,
      expectedTags: BLOCK.length,
      duplicates: after.duplicateAra
    });
  check(list, 'ara_never_drop_unique',
    scanAfter.counts.araNeverDrop === 1 && scanAfter.counts.araTags === BLOCK.length,
    { neverDropLines: scanAfter.counts.araNeverDrop, araTags: scanAfter.counts.araTags });
  check(list, 'ara_placement_clean',
    report.stats.ara.blockBeforeFirstExtinf === true &&
    report.stats.ara.contiguous === true &&
    report.stats.ara.misplaced.length === 0 &&
    report.stats.ara.unknown.length === 0 &&
    report.stats.ara.badValue.length === 0 &&
    report.stats.ara.forbidden.length === 0 &&
    report.stats.ara.channelLines === 0,
    {
      blockBeforeFirstExtinf: report.stats.ara.blockBeforeFirstExtinf,
      contiguous: report.stats.ara.contiguous,
      misplaced: report.stats.ara.misplaced.length,
      unknown: report.stats.ara.unknown.length,
      badValue: report.stats.ara.badValue.length,
      forbidden: report.stats.ara.forbidden.length,
      channelLines: report.stats.ara.channelLines
    });
  check(list, 'compare_ok', cmp.ok === true, cmp.checks.filter((c) => !c.ok));

  // 4 · 0 URL alterada: sha256 POR URL + agregado + orden
  const mismatchIndexes = [];
  const n = Math.max(scanBefore.perUrlHashes.length, scanAfter.perUrlHashes.length);
  for (let i = 0; i < n; i += 1) {
    if (scanBefore.perUrlHashes[i] !== scanAfter.perUrlHashes[i]) {
      mismatchIndexes.push(i + 1);
      if (mismatchIndexes.length >= 10) break;
    }
  }
  list.url_integrity = {
    urls_before: scanBefore.perUrlHashes.length,
    urls_after: scanAfter.perUrlHashes.length,
    per_url_sha256_mismatches: mismatchIndexes.length,
    mismatch_positions_sample: mismatchIndexes,
    aggregate_sha256_before: scanBefore.urlSha256,
    aggregate_sha256_after: scanAfter.urlSha256,
    aggregate_equal: scanBefore.urlSha256 === scanAfter.urlSha256,
    per_url_digest_before: scanBefore.perUrlDigest,
    per_url_digest_after: scanAfter.perUrlDigest,
    per_url_digest_equal: scanBefore.perUrlDigest === scanAfter.perUrlDigest,
    validator_aggregate_equal: before.urlSha256 === after.urlSha256,
    sample_urls: scanAfter.sampleUrls
  };
  check(list, 'per_url_sha256_equal',
    scanBefore.perUrlHashes.length === scanAfter.perUrlHashes.length && mismatchIndexes.length === 0,
    { before: scanBefore.perUrlHashes.length, after: scanAfter.perUrlHashes.length, mismatches: mismatchIndexes.length });
  check(list, 'url_perurl_digest_equal', scanBefore.perUrlDigest === scanAfter.perUrlDigest,
    { before: scanBefore.perUrlDigest.slice(0, 16) + '…', after: scanAfter.perUrlDigest.slice(0, 16) + '…' });
  check(list, 'url_aggregate_sha_equal', scanBefore.urlSha256 === scanAfter.urlSha256,
    { before: scanBefore.urlSha256.slice(0, 16) + '…', after: scanAfter.urlSha256.slice(0, 16) + '…' });

  const preexistingMap = Object.fromEntries((report.preexisting || []).map((p) => [p.code, p.count]));
  check(list, 'preexisting_reported', Array.isArray(report.preexisting),
    { codes: Object.keys(preexistingMap).length });
  if (exp.channelsWithoutStreamInf != null) {
    check(list, 'r1_channels_without_streaminf_match',
      (preexistingMap.channel_without_stream_inf || 0) === exp.channelsWithoutStreamInf,
      { expect: exp.channelsWithoutStreamInf, got: preexistingMap.channel_without_stream_inf || 0 });
  }

  // 5 · segunda pasada (idempotencia byte a byte)
  const second = await injector.injectFile(onceTmp, twiceTmp, {
    listVersion: GENERATION.list_version,
    syncUrl: SYNC_URL,
    clientType: CLIENT_TYPE,
    perChannel: GENERATION.per_channel
  });
  // `once` ya está hasheado por scanFile(onceTmp); solo hace falta hashear `twice`.
  const twiceSha = await sha256File(twiceTmp);
  const onceSha = { bytes: scanAfter.bytes, sha256: scanAfter.sha256 };
  list.second_pass = {
    injected: second.injected,
    reason: second.reason,
    once: { bytes: onceSha.bytes, sha256: onceSha.sha256 },
    twice: { bytes: twiceSha.bytes, sha256: twiceSha.sha256 },
    byte_identical: onceSha.sha256 === twiceSha.sha256 && onceSha.bytes === twiceSha.bytes
  };
  check(list, 'second_pass_noop', second.injected === false && second.reason === 'already_present', second.reason);
  check(list, 'second_pass_byte_identical', list.second_pass.byte_identical,
    { once: onceSha.sha256.slice(0, 16) + '…', twice: twiceSha.sha256.slice(0, 16) + '…' });

  // 6 · comparación entre generaciones (solo si existe una generación previa de referencia)
  if (spec.previousGeneration && fs.existsSync(spec.previousGeneration)) {
    const diff = await diffLines(onceTmp, spec.previousGeneration);
    const prevSha = await sha256File(spec.previousGeneration);
    list.cross_generation = {
      reference_file: relRepo(spec.previousGeneration),
      reference_bytes: prevSha.bytes,
      reference_sha256: prevSha.sha256,
      v2_bytes: onceSha.bytes,
      v2_sha256: onceSha.sha256,
      same_bytes: diff.same_bytes,
      compared_lines: diff.compared_lines,
      differing_lines: diff.differing_lines,
      samples: diff.samples,
      interpretation: 'La byte-identidad NO se afirma entre generaciones (R1 §0.8: solo intra-generación). '
        + 'La referencia I2 se generó con otro list_version; se comprueba que el resto del archivo es idéntico.'
    };
    if (!(diff.same_bytes && diff.differing_lines === 1)) {
      list.errors.push(`cross_generation_localized: same_bytes=${diff.same_bytes}, differing_lines=${diff.differing_lines}`);
    }
  }

  // 7 · publicar outputs (solo fuera de dry-run)
  const tempHashes = { once: list.second_pass.once, twice: list.second_pass.twice };
  for (const role of ['once', 'twice']) {
    const target = spec.outputs[role];
    const tempPath = role === 'once' ? onceTmp : twiceTmp;
    const previous = fs.existsSync(target)
      ? { file: relRepo(target), bytes: fs.statSync(target).size, sha256: null }
      : null;
    if (previous) previous.sha256 = (await sha256File(target)).sha256;
    if (dryRun) {
      list.previous_outputs.push({ role, ...(previous || {}), published: false, dry_run: true });
      check(list, `output_${role}_dry_run`, true, { temp_bytes: tempHashes[role].bytes, target: relRepo(target) });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      fs.renameSync(tempPath, target);
    } catch {
      fs.copyFileSync(tempPath, target);
      fs.rmSync(tempPath, { force: true });
    }
    const published = fs.statSync(target);
    list.outputs.push({
      role,
      file: relRepo(target),
      bytes: published.size,
      sha256: tempHashes[role].sha256,
      matches_generated: published.size === tempHashes[role].bytes
    });
    list.previous_outputs.push({ role, ...(previous || {}), published: true });
    check(list, `output_${role}_published`, published.size === tempHashes[role].bytes,
      { file: relRepo(target), bytes: published.size, sha256: tempHashes[role].sha256 });
  }

  check(list, 'generation_metadata_valid',
    /^[a-f0-9]{64}$/.test(artifactSha256) && /^[A-Za-z0-9._:+-]{1,64}$/.test(genId),
    { artifact_sha256: artifactSha256.slice(0, 16) + '…', generation_id: genId });

  if (!dryRun) {
    // Limpieza de temporales que no se movieron (p.ej. si falló la publicación).
    for (const f of [onceTmp, twiceTmp]) {
      try { if (fs.existsSync(f)) fs.rmSync(f, { force: true }); } catch { /* noop */ }
    }
  }

  list.ok = list.errors.length === 0 && list.checks.every((c) => c.ok);
  list.elapsed_ms = Date.now() - started;
  return list;
}

// ─────────────────────────────────────────────────────────────────────────────
// selftest sintético (no toca evidence/ ni reports/)
// ─────────────────────────────────────────────────────────────────────────────

function syntheticCatalog({ declared, channels, name }) {
  const lines = [
    '#EXTM3U x-tvg-url=""',
    '#EXT-X-VERSION:9',
    `#EXT-X-APE-CHANNELS:${declared}`,
    '#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES'
  ];
  for (let i = 1; i <= channels; i += 1) {
    lines.push(`#EXTINF:-1 tvg-id="s${i}" tvg-name="${name} ${i}",${name} ${i}`);
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${1000000 + i * 1000},RESOLUTION=1920x1080,CODECS="avc1.640028"`);
    lines.push(`https://cdn.example/live/${name.toLowerCase()}/${i}.m3u8?token=secret-${i % 2 ? 'a' : 'b'}`);
  }
  lines.push('#EXT-X-APE-VALIDATED:RFC8216-STRICT,verdict=PASS,errors=0');
  return lines.join('\n') + '\n';
}

async function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ara-x-v2-selftest-'));
  const results = [];
  try {
    const validPath = path.join(tmp, 'valid.m3u8');
    fs.writeFileSync(validPath, syntheticCatalog({ declared: 3, channels: 3, name: 'Valid' }));
    const valid = await runList({
      id: 'SELFTEST_VALID',
      label: 'sintético válido',
      input: validPath,
      outputs: { once: path.join(tmp, 'out.once.m3u8'), twice: path.join(tmp, 'out.twice.m3u8') },
      previousGeneration: null,
      expected: { extinf: 3, urls: 3, streamInf: 3, declaredChannels: 3, channelsWithoutStreamInf: 0 }
    }, { dryRun: true, tmpDir: tmp });
    results.push(valid);

    const truncatedPath = path.join(tmp, 'truncated.m3u8');
    fs.writeFileSync(truncatedPath, syntheticCatalog({ declared: 5, channels: 3, name: 'Trunc' }));
    const truncated = await runList({
      id: 'SELFTEST_TRUNCATED',
      label: 'sintético truncado',
      input: truncatedPath,
      outputs: { once: path.join(tmp, 'bad.once.m3u8'), twice: path.join(tmp, 'bad.twice.m3u8') },
      previousGeneration: null,
      expected: { extinf: 3, urls: 3, streamInf: 3, declaredChannels: 5, channelsWithoutStreamInf: 0 }
    }, { dryRun: true, tmpDir: tmp });
    results.push(truncated);

    const failedNames = truncated.checks.filter((c) => !c.ok).map((c) => c.name);
    const ok = valid.ok === true
      && valid.second_pass.byte_identical === true
      && valid.url_integrity.per_url_digest_equal === true
      && truncated.ok === false
      && failedNames.includes('input_extinf_equals_ape_channels')
      && failedNames.includes('extinf_equals_ape_channels_after')
      && failedNames.includes('validator_no_errors');
    return {
      ok,
      valid: { ok: valid.ok, checks: valid.checks.length, failed: valid.checks.filter((c) => !c.ok).map((c) => c.name) },
      truncated: { ok: truncated.ok, failed: failedNames }
    };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// reportes
// ─────────────────────────────────────────────────────────────────────────────

function toListEntry(r, ranAt) {
  return {
    id: r.id,
    label: r.label,
    ok: r.ok,
    ran_at: ranAt || null,
    elapsed_ms: r.elapsed_ms,
    input: r.input,
    generation: r.generation,
    before: r.before,
    after: r.after,
    url_integrity: r.url_integrity,
    validator: r.validator,
    compare: r.compare,
    inject: r.inject,
    second_pass: r.second_pass,
    outputs: r.outputs,
    previous_outputs: r.previous_outputs,
    cross_generation: r.cross_generation,
    preexisting: r.preexisting,
    checks: r.checks,
    errors: r.errors
  };
}

function buildJson(listEntries, summary) {
  return {
    schema: 'ara-x.v2.e2e/1',
    generated_at: summary.generated_at,
    host: summary.host,
    node: summary.node,
    ok: summary.ok,
    verdict: summary.verdict,
    elapsed_ms: summary.elapsed_ms,
    generation: {
      schema: GENERATION.schema,
      ara_version: ARA_VERSION,
      list_version: GENERATION.list_version,
      block_sha256: BLOCK_SHA256,
      block_lines: BLOCK.length,
      per_channel: GENERATION.per_channel,
      sync_url: SYNC_URL,
      client_type: CLIENT_TYPE,
      identity_rule: 'artifact_sha256 = sha256 del input; generation_id = sha256(schema|artifact_sha256|ara_version|list_version|block_sha256|per_channel) acotado a 32 hex. '
        + 'Byte-identidad solo intra-generación (R1 §0.8); entre generaciones no se afirma.'
    },
    totals: summary.totals,
    run_history: summary.run_history,
    lists: listEntries,
    commands: summary.commands,
    limitations: summary.limitations
  };
}

function buildMarkdown(listEntries, summary) {
  const L = [];
  L.push('# V2 · E2E sobre el catálogo real — inyección ARA-X, 0 pérdida, 0 URL mutada, idempotencia');
  L.push('');
  L.push(`**Fecha:** ${summary.generated_at}  `);
  L.push(`**Host:** ${summary.host} · Node ${summary.node} · sin red, sin VPS, sin deploy  `);
  L.push(`**Veredicto: ${summary.verdict}** · ${summary.totals.lists_passed}/${summary.totals.lists} listas · `
    + `${summary.totals.elapsed_ms} ms de pipeline · ${summary.totals.fail} checks rojos.`);
  L.push('');
  L.push('> Identidad (R1 §0.8 / D3 `artifact`): `artifact_sha256` = sha256 de la captura de entrada; `generation_id` '
    + 'identifica ESTA generación (artefacto + versión ARA-X + list_version + bloque). La byte-identidad se afirma '
    + '**solo intra-generación** (`once` vs `twice` con los mismos parámetros). Entre generaciones **no** se afirma: '
    + 'cambiar `list_version` cambia el bloque por diseño.');
  L.push('');
  L.push('## Generación');
  L.push('');
  L.push('| Parámetro | Valor |');
  L.push('|---|---|');
  L.push(`| schema | \`${GENERATION.schema}\` |`);
  L.push(`| ARA_VERSION | \`${ARA_VERSION}\` |`);
  L.push(`| LIST_VERSION (D1) | \`${GENERATION.list_version}\` |`);
  L.push(`| bloque ARA-X | ${BLOCK.length} líneas · sha256 \`${BLOCK_SHA256.slice(0, 16)}…\` |`);
  L.push(`| per_channel | ${GENERATION.per_channel} |`);
  L.push(`| sync_url / client_type | \`${SYNC_URL}\` · \`${CLIENT_TYPE}\` |`);
  L.push('');
  for (const r of listEntries) {
    L.push(`## ${r.id} — ${r.label}`);
    L.push('');
    L.push(`**Resultado: ${r.ok ? 'PASS' : 'FAIL'}** · ${r.elapsed_ms} ms.`);
    L.push('');
    L.push('### Entrada y salidas (hashes)');
    L.push('');
    L.push('| Rol | Archivo | Bytes | sha256 |');
    L.push('|---|---|---|---|');
    L.push(`| input (artifact) | \`${r.input.file}\` | ${r.input.bytes} | \`${r.input.sha256}\` |`);
    for (const out of r.outputs) {
      L.push(`| output ${out.role} | \`${out.file}\` | ${out.bytes} | \`${out.sha256}\` |`);
    }
    if (r.second_pass) {
      L.push(`| segunda pasada (temp) | \`${r.id}.twice\` | ${r.second_pass.twice.bytes} | \`${r.second_pass.twice.sha256}\` |`);
    }
    L.push('');
    L.push(`- \`artifact_sha256\`: \`${r.input.artifact_sha256}\``);
    L.push(`- \`generation_id\`: \`${r.generation.generation_id}\``);
    L.push(`- \`source_identity\`: list-id \`${r.input.source_identity.list_id}\` · generated \`${r.input.source_identity.generated}\` · ${r.input.source_identity.sys_version}`);
    L.push('');
    L.push('### Conteos antes/después');
    L.push('');
    L.push('| Métrica | Antes | Después | ¿Igual? |');
    L.push('|---|---|---|---|');
    for (const key of ['extinf', 'urls', 'streamInf', 'extattr', 'declaredChannels', 'blocks', 'blocksWithWrongUrlCount', 'channelsWithoutStreamInf']) {
      L.push(`| ${key} | ${r.before[key]} | ${r.after[key]} | ${r.before[key] === r.after[key] ? 'sí' : '**NO**'} |`);
    }
    L.push(`| #EXT-X-ARA-* (bloque) | 0 | ${r.after.araTags} (global ${r.after.araGlobalLines}, canal ${r.after.araChannelLines}) | +${r.after.araTags} |`);
    L.push('');
    L.push(`- Truncamiento: \`EXTINF (${r.after.extinf}) == #EXT-X-APE-CHANNELS (${r.after.declaredChannels})\` ⇒ `
      + `${r.after.extinf === r.after.declaredChannels ? 'captura completa' : '**CAPTURA TRUNCADA**'}.`);
    L.push(`- Sin bloques sin URL: \`blocksWithWrongUrlCount=${r.after.blocksWithWrongUrlCount}\` sobre ${r.after.blocks} canales.`);
    L.push(`- Bloque ARA/Never-Drop único: araVersion=${r.after.araVersion}, ${r.after.araGlobalLines} líneas globales, `
      + `${r.after.araChannelLines} por canal; \`#EXT-X-ARA-MODE:never-drop\` presente una vez.`);
    L.push('');
    L.push('### Integridad de URLs (0 mutación)');
    L.push('');
    L.push('| Check | Valor |');
    L.push('|---|---|');
    L.push(`| URLs antes / después | ${r.url_integrity.urls_before} / ${r.url_integrity.urls_after} |`);
    L.push(`| sha256 por URL (posiciones distintas) | ${r.url_integrity.per_url_sha256_mismatches} |`);
    L.push(`| digest de la lista de sha256 por URL (antes) | \`${r.url_integrity.per_url_digest_before}\` |`);
    L.push(`| digest de la lista de sha256 por URL (después) | \`${r.url_integrity.per_url_digest_after}\` |`);
    L.push(`| sha256 agregado del validator (antes) | \`${r.url_integrity.aggregate_sha256_before}\` |`);
    L.push(`| sha256 agregado del validator (después) | \`${r.url_integrity.aggregate_sha256_after}\` |`);
    L.push(`| muestras enmascaradas | ${r.url_integrity.sample_urls.map((u) => '`' + u + '`').join(' · ')} |`);
    L.push('');
    L.push('### Idempotencia');
    L.push('');
    L.push(`- 2.ª pasada: \`injected=${r.second_pass.injected}\`, \`reason=${r.second_pass.reason}\`.`);
    L.push(`- sha256 once = \`${r.second_pass.once.sha256}\``);
    L.push(`- sha256 twice = \`${r.second_pass.twice.sha256}\``);
    L.push(`- byte-idéntica intra-generación: **${r.second_pass.byte_identical ? 'sí' : 'NO'}** (${r.second_pass.once.bytes} B).`);
    L.push('');
    if (r.cross_generation) {
      L.push('### Comparación entre generaciones (informativa, NO byte-identidad)');
      L.push('');
      L.push(`- Referencia (I2, otro \`list_version\`): \`${r.cross_generation.reference_file}\` · \`${r.cross_generation.reference_sha256}\``);
      L.push(`- V2: \`${r.cross_generation.v2_sha256}\` · ${r.cross_generation.v2_bytes} B · referencia ${r.cross_generation.reference_bytes} B`);
      L.push(`- bytes iguales: ${r.cross_generation.same_bytes} · líneas comparadas: ${r.cross_generation.compared_lines} · líneas distintas: **${r.cross_generation.differing_lines}**`);
      for (const s of r.cross_generation.samples) {
        L.push(`  - L${s.line}: \`${s.a}\` ↔ \`${s.b}\``);
      }
      L.push(`- ${r.cross_generation.interpretation}`);
      L.push('');
    }
    L.push('### Hallazgos PRE-EXISTENTES (R1) — reportados, no “arreglados” por esta capa');
    L.push('');
    if (r.preexisting.length === 0) {
      L.push('Sin hallazgos pre-existentes reportados.');
    } else {
      L.push('| Código | Conteo | Descripción |');
      L.push('|---|---|---|');
      for (const p of r.preexisting) {
        L.push(`| \`${p.code}\` | ${p.count} | ${String(p.message).replace(/\|/g, '\\|')} |`);
      }
    }
    L.push('');
    L.push('> El footer del propio generador (`#EXT-X-APE-VALIDATED:…errors=0…`) **no es prueba de completitud**: '
      + 'no considera “canal sin variante” un error. La simetría 1:1 `EXTINF == STREAM-INF` se mide aquí aparte '
      + `(medido: ${r.before.extinf} EXTINF / ${r.before.streamInf} STREAM-INF ⇒ `
      + `${r.before.channelsWithoutStreamInf} canales sin variante; la URL existe ⇒ no es pérdida de canal).`);
    L.push('');
    L.push('### Checks');
    L.push('');
    L.push('| Check | Estado | Detalle |');
    L.push('|---|---|---|');
    for (const c of r.checks) {
      L.push(`| ${c.name} | ${c.ok ? 'PASS' : '**FAIL**'} | ${c.detail == null ? '' : String(JSON.stringify(c.detail)).replace(/\|/g, '\\|').slice(0, 240)} |`);
    }
    L.push('');
    if (r.errors.length) {
      L.push('**Errores:**');
      L.push('');
      for (const e of r.errors) L.push(`- ${e}`);
      L.push('');
    }
  }
  L.push('## Ejecuciones');
  L.push('');
  for (const h of summary.run_history || []) {
    L.push(`- \`${h.at}\` · ${h.lists.join(', ')} · ${h.ok ? 'PASS' : 'FAIL'} · ${h.elapsed_ms} ms`);
  }
  L.push('');
  L.push('## Reproducir');
  L.push('');
  L.push('```powershell');
  L.push('node ara-x/scripts/e2e/run_e2e.js --selftest       # sintético, no toca evidence/');
  L.push('node ara-x/scripts/e2e/run_e2e.js --list 4K        # captura 4K full (572 MB)');
  L.push('node ara-x/scripts/e2e/run_e2e.js --list CDN       # captura CDN full (568 MB)');
  L.push('node ara-x/scripts/e2e/run_e2e.js --list all       # ambos (≈10 min, 2,3 GB de I/O)');
  L.push('node --test "ara-x/tests/*.test.js"                # forma ejecutable de la suite (Node 24/Windows)');
  L.push('node --check ara-x/scripts/e2e/run_e2e.js');
  L.push('```');
  L.push('');
  L.push('Salidas: `ara-x/evidence/APE_LISTA_4K_ARA-X_{once,twice}.m3u8` y '
    + '`ara-x/evidence/APE_LISTA_CDN_1793397700248_full_ARA-X_{once,twice}.m3u8`. '
    + 'Los nombres del 4K son los que fija el scope de t20 y **no** incluyen `_full`; su `artifact_sha256` '
    + 'identifica la captura full de la que provienen (tabla de hashes arriba).');
  L.push('');
  L.push('## Límites');
  L.push('');
  for (const lim of summary.limitations) L.push(`- ${lim}`);
  L.push('');
  L.push(`**Firma V2:** \`integration-verifier\` · ${summary.generated_at} · \`${summary.verdict}\`.`);
  L.push('');
  return L.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { list: 'all', dryRun: false, keepTemp: false, json: false, selftest: false, help: false, rebuildReport: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--list') { out.list = (argv[++i] || '').toUpperCase(); }
    else if (a === '--selftest') out.selftest = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--keep-temp') out.keepTemp = true;
    else if (a === '--json') out.json = true;
    else if (a === '--rebuild-report') out.rebuildReport = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`argumento no reconocido: ${a}`);
  }
  return out;
}

/**
 * Repara SOLO el formato de un timestamp histórico emitido por la versión antigua
 * de `stamp()` (reloj UTC etiquetado con el offset local, ⇒ instante futuro). No
 * toca ningún dato de verificación: es la misma ejecución, con la hora bien rotulada.
 */
function normalizeHistoryStamp(at) {
  if (typeof at !== 'string') return at;
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed) || parsed <= Date.now() + 3600000) return at;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3})[-+]\d{2}:\d{2}$/.exec(at);
  if (!m) return at;
  return stamp(new Date(m[1] + 'Z'));
}

async function rebuildReport() {
  if (!fs.existsSync(REPORT_JSON)) throw new Error(`no existe ${relRepo(REPORT_JSON)}`);
  const data = JSON.parse(fs.readFileSync(REPORT_JSON, 'utf8'));
  const before = JSON.stringify(data.run_history);
  data.generated_at = normalizeHistoryStamp(data.generated_at);
  data.run_history = (data.run_history || []).map((h) => ({ ...h, at: normalizeHistoryStamp(h.at) }));
  const summary = {
    ok: data.ok,
    verdict: data.verdict,
    generated_at: data.generated_at,
    host: data.host,
    node: data.node,
    elapsed_ms: data.elapsed_ms,
    run_history: data.run_history,
    totals: data.totals,
    commands: data.commands,
    limitations: (data.limitations || []).concat([
      'Reporte reconstruido desde V2_e2e.json: solo se normalizó el formato de timestamps de run_history/'
      + 'generated_at (una versión previa de stamp() rotulaba la hora UTC con el offset local). '
      + 'No se re-ejecutó el E2E ni se alteró ningún dato de listas, hashes o checks.'
    ])
  };
  data.limitations = summary.limitations;
  fs.writeFileSync(REPORT_JSON, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.writeFileSync(REPORT_MD, buildMarkdown(data.lists, summary), 'utf8');
  const changed = before !== JSON.stringify(data.run_history);
  console.log(`V2 report rebuilt · ${changed ? 'timestamps normalizados' : 'sin cambios de timestamp'} · ${relRepo(REPORT_JSON)}`);
  return 0;
}

function usage() {
  console.log(`V2 · E2E ARA-X sobre las dos capturas completas

  node ara-x/scripts/e2e/run_e2e.js --list all|4K|CDN
  node ara-x/scripts/e2e/run_e2e.js --selftest
  node ara-x/scripts/e2e/run_e2e.js --rebuild-report   # rehace MD/JSON desde V2_e2e.json
  flags: --dry-run (no publica en evidence/), --keep-temp, --json

  Salidas: ara-x/reports/V2_e2e.json · ara-x/reports/V2_e2e_report.md
           ara-x/evidence/APE_LISTA_4K_ARA-X_{once,twice}.m3u8
           ara-x/evidence/APE_LISTA_CDN_1793397700248_full_ARA-X_{once,twice}.m3u8`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); return 0; }
  if (args.rebuildReport) return rebuildReport();
  if (args.selftest) {
    const st = await selftest();
    console.log(`V2 selftest: ${st.ok ? 'PASS' : 'FAIL'} · valid=${JSON.stringify(st.valid)} · truncated=${JSON.stringify(st.truncated)}`);
    return st.ok ? 0 : 1;
  }
  if (!['ALL', '4K', 'CDN'].includes(args.list)) throw new Error(`--list inválido: ${args.list}`);

  const startedAt = new Date();
  const started = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ara-x-v2-e2e-'));
  const selected = args.list === 'ALL' ? LISTS : LISTS.filter((s) => (args.list === '4K' ? s.id === '4K_LOCAL_FULL' : s.id === 'CDN_FULL'));
  const results = [];
  try {
    for (const spec of selected) {
      process.stderr.write(`[V2] ${spec.id}: ${path.basename(spec.input)} …\n`);
      const r = await runList(spec, { dryRun: args.dryRun, tmpDir });
      results.push(r);
      process.stderr.write(`[V2] ${spec.id}: ${r.ok ? 'PASS' : 'FAIL'} · ${r.elapsed_ms} ms\n`);
      for (const c of r.checks) {
        if (!c.ok) process.stderr.write(`[V2]   FAIL ${c.name}: ${JSON.stringify(c.detail)}\n`);
      }
    }
  } finally {
    if (!args.keepTemp) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
    } else {
      process.stderr.write(`[V2] tmp conservado: ${tmpDir}\n`);
    }
  }

  const runOk = results.length === selected.length && results.every((r) => r.ok);
  const ranAt = stamp(startedAt);
  const currentEntries = results.map((r) => toListEntry(r, ranAt));

  // Merge con el reporte previo SOLO si es la misma generación: permite ejecutar
  // `--list 4K` y `--list CDN` por separado y que el reporte final cubra ambas.
  let mergedEntries = currentEntries;
  let runHistory = [];
  let priorNote = null;
  if (!args.dryRun && fs.existsSync(REPORT_JSON)) {
    try {
      const prior = JSON.parse(fs.readFileSync(REPORT_JSON, 'utf8'));
      const sameGeneration = prior.generation
        && prior.generation.block_sha256 === BLOCK_SHA256
        && prior.generation.list_version === GENERATION.list_version;
      if (sameGeneration && Array.isArray(prior.lists)) {
        mergedEntries = [
          ...prior.lists.filter((l) => !currentEntries.some((e) => e.id === l.id)),
          ...currentEntries
        ];
        runHistory = Array.isArray(prior.run_history) ? prior.run_history.slice() : [];
      } else {
        priorNote = 'reporte previo descartado: generación distinta (block_sha256/list_version no coincide)';
      }
    } catch {
      priorNote = 'reporte previo ilegible: se reescribe con esta ejecución';
    }
  }
  const order = LISTS.map((s) => s.id);
  mergedEntries.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  runHistory.push({
    at: ranAt,
    lists: currentEntries.map((e) => e.id),
    elapsed_ms: Date.now() - started,
    ok: runOk
  });

  const mergedChecks = mergedEntries.flatMap((e) => e.checks || []);
  const mergedFail = mergedChecks.filter((c) => !c.ok).length
    + mergedEntries.reduce((a, e) => a + (e.errors || []).length, 0);
  const reportOk = mergedEntries.length === LISTS.length && mergedEntries.every((e) => e.ok);
  const verdict = reportOk ? 'PASS' : (mergedEntries.length < LISTS.length ? 'PARTIAL' : 'FAIL');

  const summary = {
    ok: reportOk,
    verdict,
    generated_at: ranAt,
    host: `${process.platform}/${process.arch} ${os.release()}`,
    node: process.version,
    elapsed_ms: Date.now() - started,
    run_history: runHistory,
    totals: {
      lists: mergedEntries.length,
      lists_passed: mergedEntries.filter((e) => e.ok).length,
      checks: mergedChecks.length,
      fail: mergedFail,
      elapsed_ms: mergedEntries.reduce((a, e) => a + (e.elapsed_ms || 0), 0)
    },
    commands: [
      'node ara-x/scripts/e2e/run_e2e.js --selftest',
      'node ara-x/scripts/e2e/run_e2e.js --list 4K',
      'node ara-x/scripts/e2e/run_e2e.js --list CDN',
      'node ara-x/scripts/e2e/run_e2e.js --list all',
      'node --test "ara-x/tests/*.test.js"',
      'node --check ara-x/scripts/e2e/run_e2e.js'
    ],
    limitations: [
      'Solo lectura local de las capturas de `ara-x/evidence/`; no hay red, VPS ni deploy.',
      '`#EXT-X-APE-CHANNELS` ya viene en la cabecera del catálogo: V2 comprueba EXTINF == ese valor (truncamiento) antes y después; no lo reescribe.',
      'El footer `#EXT-X-APE-VALIDATED … errors=0` es del validador del generador y NO se usa como prueba; los conteos y los hallazgos pre-existentes se miden aquí con `ara_x_validator`.',
      'Byte-identidad: solo intra-generación (once vs twice). Cambiar `list_version` (u otro parámetro del bloque) produce otro archivo por diseño; la comparación con la generación previa de I2 se reporta como informativa, no como PASS de estabilidad entre generaciones.',
      'Los nombres de salida del 4K (`APE_LISTA_4K_ARA-X_*`) son los fijados por el scope de t20 y no incluyen `_full`; el `artifact_sha256` de la tabla identifica la captura full de origen.',
      args.dryRun ? 'Ejecución --dry-run: no se publicaron salidas en `ara-x/evidence/` ni se escribieron reportes.' : 'Salidas publicadas en `ara-x/evidence/`.',
      verdict === 'PARTIAL' ? 'Reporte PARCIAL: falta ejecutar la lista restante (ver `run_history`); no se declara PASS global hasta cubrir ambas.' : 'Reporte con las dos capturas completas.',
      'La forma `node --test ara-x/tests/` no es ejecutable en Node 24.12.0/Windows (el runner trata el directorio como módulo); la suite se ejecuta con el glob `node --test "ara-x/tests/*.test.js"`, que cubre los mismos archivos.'
    ]
  };
  if (priorNote) summary.limitations.push(priorNote);
  if (args.dryRun) {
    summary.limitations.push('Los checks de publicación figuran como dry_run (no se movió ningún archivo a evidence/).');
  }

  if (!args.dryRun && results.length > 0) {
    fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
    fs.writeFileSync(REPORT_JSON, JSON.stringify(buildJson(mergedEntries, summary), null, 2) + '\n', 'utf8');
    fs.writeFileSync(REPORT_MD, buildMarkdown(mergedEntries, summary), 'utf8');
  }

  const out = {
    ok: runOk,
    verdict: runOk ? 'PASS' : 'FAIL',
    report: {
      ok: reportOk,
      verdict,
      lists: mergedEntries.map((e) => ({ id: e.id, ok: e.ok, ran_at: e.ran_at })),
      path: relRepo(REPORT_JSON)
    },
    lists: currentEntries.map((e) => ({
      id: e.id,
      ok: e.ok,
      elapsed_ms: e.elapsed_ms,
      before: e.before,
      after: e.after,
      input_sha256: e.input.sha256,
      outputs: e.outputs,
      second_pass: e.second_pass,
      url_integrity: {
        mismatches: e.url_integrity.per_url_sha256_mismatches,
        per_url_digest_equal: e.url_integrity.per_url_digest_equal,
        aggregate_equal: e.url_integrity.aggregate_sha_equal
      },
      failed_checks: e.checks.filter((c) => !c.ok).map((c) => c.name),
      errors: e.errors
    })),
    totals: summary.totals,
    reports: args.dryRun ? null : { json: relRepo(REPORT_JSON), md: relRepo(REPORT_MD) }
  };
  console.log(args.json ? JSON.stringify(out, null, 2)
    : `V2 ${verdict} · ${summary.totals.lists_passed}/${summary.totals.lists} listas · ${mergedFail} fallos · ${summary.elapsed_ms} ms`);
  return runOk && (reportOk || mergedEntries.length < LISTS.length) ? 0 : 1;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(2);
  });
}

module.exports = { scanFile, diffLines, runList, selftest, generationId, GENERATION, BLOCK, BLOCK_SHA256 };
