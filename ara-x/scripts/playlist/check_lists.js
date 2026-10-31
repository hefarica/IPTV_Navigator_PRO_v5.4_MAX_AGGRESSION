'use strict';

/**
 * I2 gate over the TWO real catalogs (A: local full capture, B: CDN served).
 *
 * For each list:
 *   analyze → inject (27-line block) → validate against the input invariants
 *   (same #EXTINF, same URLs by aggregate sha256, same #STREAM-INF, block before first #EXTINF)
 *   → second pass must be a byte-identical no-op (same sha256) → expectations from R1.
 *
 * Writes only to a temp dir (no evidence/, no reports/). Exits 1 if any invariant fails.
 *
 *   node ara-x/scripts/playlist/check_lists.js [--per-channel] [--keep]
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { injectFile } = require('../../playlist/ara_x_injector.js');
const { analyzeFile, validateFile, compare } = require('../../playlist/ara_x_validator.js');

const ROOT = path.join(__dirname, '..', '..');
const EVIDENCE = path.join(ROOT, 'evidence');
const LIST_VERSION = '2026-10-30T22:07:37Z';

const LISTS = [
  {
    id: 'A_local_full',
    file: path.join(EVIDENCE, 'APE_LISTA_4K_live_20261030_full.m3u8'),
    expect: {
      extinf: 10631, urls: 10631, streamInf: 10631, declaredChannels: 10631,
      channelsWithoutStreamInf: 0, duplicateTvgIds: 0, duplicateTvgNames: 108,
      sidCollisions: 1, iframeWithoutUri: 10631, startCount: 2, cmafMalformedCodecs: 10631,
      hdrImpossible: 9823
    }
  },
  {
    id: 'B_cdn_served',
    file: path.join(EVIDENCE, 'APE_LISTA_CDN_1793397700248_full.m3u8'),
    expect: {
      extinf: 10631, urls: 10631, streamInf: 10586, declaredChannels: 10631,
      channelsWithoutStreamInf: 45, duplicateTvgIds: 0, duplicateTvgNames: 108,
      sidCollisions: 1, iframeWithoutUri: 10631, startCount: 2, cmafMalformedCodecs: 10631,
      hdrImpossible: 9823
    }
  }
];

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function preexistingMap(report) {
  return Object.fromEntries(report.preexisting.map((p) => [p.code, p.count]));
}

async function runList(spec, opts) {
  const result = { id: spec.id, ok: false, checks: [], errors: [] };
  if (!fs.existsSync(spec.file)) {
    result.errors.push('missing file: ' + path.basename(spec.file));
    return result;
  }

  const started = Date.now();
  const base = path.basename(spec.file);
  const once = path.join(opts.tmp, base + '.once.m3u8');
  const twice = path.join(opts.tmp, base + '.twice.m3u8');
  const check = (name, ok, detail) => result.checks.push({ name, ok: !!ok, detail });

  const before = await analyzeFile(spec.file);
  const inject = await injectFile(spec.file, once, { listVersion: LIST_VERSION, perChannel: opts.perChannel });
  const report = await validateFile(once, {
    expectChannels: before.extinf,
    expectUrlSha256: before.urlSha256,
    requireAra: true
  });
  const cmp = compare(before, report.stats);

  const second = await injectFile(once, twice, { listVersion: LIST_VERSION, perChannel: opts.perChannel });
  const [shaOnce, shaTwice] = await Promise.all([sha256File(once), sha256File(twice)]);
  const bytesOnce = fs.statSync(once).size;
  const bytesTwice = fs.statSync(twice).size;

  check('injected', inject.injected === true, inject.reason);
  check('block_lines_27', inject.blockLines === 27, inject.blockLines);
  check('validator_ok', report.ok === true, report.errors.slice(0, 3));
  check('channels_10_631', report.stats.extinf === 10631, report.stats.extinf);
  check('urls_10_631', report.stats.urls === 10631, report.stats.urls);
  check('url_digest_identical', report.stats.urlSha256 === before.urlSha256, {
    before: before.urlSha256, after: report.stats.urlSha256
  });
  check('compare_ok', cmp.ok === true, cmp.checks.filter((c) => !c.ok));
  check('ara_block_before_first_extinf', report.stats.ara.blockBeforeFirstExtinf === true, report.stats.ara.globalLines);
  check('ara_no_misplaced', report.stats.ara.misplaced.length === 0, report.stats.ara.misplaced.length);
  check('no_media_tags_added', cmp.checks.find((c) => c.name === 'media_only_tags_not_added').ok === true, null);
  check('idempotent_second_pass', second.injected === false && shaOnce === shaTwice && bytesOnce === bytesTwice,
    { injected: second.injected, sameSha: shaOnce === shaTwice, bytesOnce, bytesTwice });
  check('declared_channels', report.stats.declaredChannels === spec.expect.declaredChannels, report.stats.declaredChannels);

  const pre = preexistingMap(report);
  for (const [key, want] of Object.entries(spec.expect)) {
    const got = key === 'declaredChannels' ? report.stats.declaredChannels : report.stats.catalog[key];
    check('expect_' + key, got === want, { want, got });
  }

  result.ok = result.checks.every((c) => c.ok);
  result.elapsedMs = Date.now() - started;
  result.input = { file: base, bytes: fs.statSync(spec.file).size, sha256: before.sha256 || null };
  result.before = {
    extinf: before.extinf, urls: before.urls, streamInf: before.streamInf,
    declaredChannels: before.declaredChannels, urlSha256: before.urlSha256
  };
  result.after = {
    bytes: bytesOnce, sha256: shaOnce,
    extinf: report.stats.extinf, urls: report.stats.urls, streamInf: report.stats.streamInf,
    araVersion: report.stats.ara.version, araGlobalLines: report.stats.ara.globalLines,
    araChannelLines: report.stats.ara.channelLines
  };
  result.inject = inject;
  result.preexisting = pre;
  result.errors = report.errors;
  result.compareFailures = cmp.checks.filter((c) => !c.ok);

  if (!opts.keep) {
    for (const f of [once, twice]) {
      try { fs.unlinkSync(f); } catch { /* noop */ }
    }
  }
  return result;
}

(async () => {
  const args = process.argv.slice(2);
  const perChannel = args.includes('--per-channel');
  const keep = args.includes('--keep');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ara-x-i2-lists-'));
  const started = Date.now();
  const results = [];
  try {
    for (const spec of LISTS) results.push(await runList(spec, { tmp, perChannel, keep }));
  } finally {
    if (!keep) {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
    }
  }
  const ok = results.every((r) => r.ok);
  const summary = {
    ok,
    perChannel,
    elapsedMs: Date.now() - started,
    lists: results.map((r) => ({
      id: r.id,
      ok: r.ok,
      elapsedMs: r.elapsedMs,
      failed: r.checks.filter((c) => !c.ok).map((c) => ({ name: c.name, detail: c.detail })),
      before: r.before,
      after: r.after,
      preexisting: r.preexisting
    }))
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!ok) {
    for (const r of results) {
      if (!r.ok) console.error(`${r.id}: ${JSON.stringify(r.checks.filter((c) => !c.ok))}`);
    }
    process.exit(1);
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(2);
});
