'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const injector = require('../playlist/ara_x_injector.js');
const validator = require('../playlist/ara_x_validator.js');

const EVIDENCE = path.join(__dirname, '..', 'evidence');
const REAL_LIST_A = path.join(EVIDENCE, 'APE_LISTA_4K_live_20261030_full.m3u8');
const REAL_LIST_B = path.join(EVIDENCE, 'APE_LISTA_CDN_1793397700248_full.m3u8');

const CATALOG_LF = [
  '#EXTM3U x-tvg-url="" refresh="1800"',
  '#EXT-X-VERSION:9',
  '#EXT-X-TARGETDURATION:2',
  '#EXTINF:-1 tvg-id="a" tvg-name="A" group-title="G",A',
  '#EXTVLCOPT:network-caching=55000',
  '#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=3840x2160',
  'https://cdn.example/live/a.m3u8?token=secret-a',
  '#EXTINF:-1 tvg-id="b" tvg-name="B" group-title="G",B',
  '#EXTVLCOPT:network-caching=55000',
  'https://cdn.example/live/b.m3u8?token=secret-b',
  ''
].join('\n');

// Catalog with per-channel evidence (ape-profile / ape-codec / ape-8k / ape-thermal-budget).
const CATALOG_META = [
  '#EXTM3U',
  '#EXT-X-VERSION:9',
  '#EXTINF:-1 tvg-id="10" tvg-name="M1" group-title="G" ape-profile="P3" ape-codec="hvc1.2.4.L123.B0" ape-8k="presentation" ape-thermal-budget="72",M1',
  'https://cdn.example/live/10.m3u8',
  '#EXTINF:-1 tvg-id="11" tvg-name="M2" group-title="G",M2',
  'https://cdn.example/live/11.m3u8',
  ''
].join('\n');

// Pre-existing violations R1 measured: this layer must REPORT them and stay green.
const CATALOG_PREEXISTING = [
  '#EXTM3U',
  '#EXT-X-VERSION:9',
  '#EXT-X-TARGETDURATION:2',
  '#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES',
  '#EXT-X-START:TIME-OFFSET=-14,PRECISE=YES',
  '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=375000,CODECS="hvc1.2.4.L123.B0"',
  '#EXTINF:-1 tvg-id="a" tvg-name="DUP" group-title="G",A',
  '#EXT-X-CMAF:CODECS="hvc1.2.4.L123.B0,",BANDWIDTH=15000000,RESOLUTION=1280x720',
  '#EXT-X-APE-HDR-METADATA:MDCV=true,CLLI=true,PEAK=100,AVG=1000',
  '#EXT-X-CMAF-IDEMPOTENCIA:SID=dup,SEED=X',
  '#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0"',
  'https://cdn.example/live/a.m3u8',
  '#EXTINF:-1 tvg-id="b" tvg-name="DUP" group-title="G",B',
  '#EXT-X-CMAF-IDEMPOTENCIA:SID=dup,SEED=X',
  '#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0"',
  'https://cdn.example/live/b.m3u8',
  '#EXTINF:-1 tvg-id="c" tvg-name="C" group-title="G",C',
  'https://cdn.example/live/c.m3u8',
  ''
].join('\n');

const BLOCK_LINES = injector.buildGlobalBlock({ listVersion: 'v-test' }).length;

function codes(report) {
  return report.preexisting.map((p) => p.code);
}

test('injects the global ARA-X block before the first #EXTINF exactly once', () => {
  const result = injector.injectText(CATALOG_LF, { listVersion: '2026-10-29T11:54:23Z' });
  assert.equal(result.injected, true);
  assert.equal(result.blockLines, BLOCK_LINES);

  const lines = result.text.split('\n');
  const araIndex = lines.findIndex((l) => l === '#EXT-X-ARA-VERSION:2026.10.30-EVO-NODROP');
  const extinfIndex = lines.findIndex((l) => l.startsWith('#EXTINF'));
  assert.ok(araIndex > 0 && araIndex < extinfIndex);

  const versionLines = lines.filter((l) => l.startsWith('#EXT-X-ARA-VERSION:'));
  assert.equal(versionLines.length, 1);
});

test('preserves channels, URLs and variant/attribute lines', () => {
  const before = validator.analyzeText(CATALOG_LF);
  const injected = injector.injectText(CATALOG_LF);
  const after = validator.analyzeText(injected.text);
  const cmp = validator.compare(before, after);

  assert.equal(before.extinf, 2);
  assert.equal(before.urls, 2);
  assert.equal(before.streamInf, 1);
  assert.equal(after.extinf, 2);
  assert.equal(after.urls, 2);
  assert.equal(after.streamInf, 1);
  assert.equal(after.araVersion, 1);
  assert.equal(after.araTags, BLOCK_LINES);
  assert.equal(before.urlSha256, after.urlSha256);
  assert.equal(cmp.ok, true);
});

test('is idempotent: second injection is a byte-identical no-op', () => {
  const once = injector.injectText(CATALOG_LF);
  const twice = injector.injectText(once.text);
  assert.equal(twice.injected, false);
  assert.equal(twice.reason, 'already_present');
  assert.equal(twice.text, once.text);
});

test('refuses media playlists and leaves them untouched', () => {
  const media = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n';
  const result = injector.injectText(media);
  assert.equal(result.injected, false);
  assert.equal(result.reason, 'not_channel_catalog');
  assert.equal(result.text, media);
});

test('refuses a catalog with no channels', () => {
  const empty = '#EXTM3U\n#EXT-X-VERSION:9\n';
  const result = injector.injectText(empty);
  assert.equal(result.injected, false);
  assert.equal(result.reason, 'not_channel_catalog');
});

test('preserves CRLF line endings', () => {
  const crlf = CATALOG_LF.replace(/\n/g, '\r\n');
  const result = injector.injectText(crlf);
  assert.equal(result.injected, true);
  assert.ok(result.text.includes('\r\n'));
  const segments = result.text.split('\n');
  for (const segment of segments.slice(0, -1)) assert.ok(segment.endsWith('\r'), 'line must keep CR');
});

test('validator detects URL mutation between before and after', () => {
  const before = validator.analyzeText(CATALOG_LF);
  const injected = injector.injectText(CATALOG_LF);
  const mutated = injected.text.replace('token=secret-a', 'token=evil');
  const after = validator.analyzeText(mutated);
  const cmp = validator.compare(before, after);
  assert.equal(cmp.ok, false);
  assert.equal(cmp.checks.find((c) => c.name === 'url_bytes_preserved').ok, false);
  assert.equal(validator.validateText(mutated, { expectUrlSha256: before.urlSha256 }).ok, false);
});

test('validator detects channel loss', () => {
  const before = validator.analyzeText(CATALOG_LF);
  const lines = CATALOG_LF.split('\n');
  const withoutSecond = lines.slice(0, 7).concat(['']).join('\n');
  const after = validator.analyzeText(withoutSecond);
  const cmp = validator.compare(before, after);
  assert.equal(cmp.ok, false);
  assert.equal(cmp.checks.find((c) => c.name === 'channels_preserved').ok, false);
  assert.equal(validator.validateText(withoutSecond, { expectChannels: 2 }).ok, false);
});

test('global block uses decode/present split and forbids dangerous directives', () => {
  const block = injector.buildGlobalBlock({ listVersion: 'v1' }).join('\n');
  assert.ok(block.includes('#EXT-X-ARA-MAX-DECODE-RESOLUTION:3840x2160'));
  assert.ok(block.includes('#EXT-X-ARA-MAX-PRESENT-RESOLUTION:7680x4320'));
  assert.ok(block.includes('#EXT-X-ARA-8K-MODE:PRESENTATION'));
  assert.ok(block.includes('#EXT-X-ARA-MINIMUM-DECODE-RESOLUTION:3840x2160'));
  assert.ok(block.includes('#EXT-X-ARA-NEVER-DOWNSCALE:true'));
  assert.ok(block.includes('#EXT-X-ARA-FPS-TARGETS:60,30,24'));
  assert.ok(block.includes('#EXT-X-ARA-MINIMUM-FPS:24'));
  assert.ok(block.includes('#EXT-X-ARA-PRIORITY:zero-frame-drops'));
  assert.ok(block.includes('#EXT-X-ARA-DEGRADE-ORDER:fps,processing'));
  assert.ok(block.includes('#EXT-X-ARA-EMERGENCY-DOWNSCALE:false'));
  assert.equal(block.includes('#EXT-X-ARA-MAX-RESOLUTION:'), false);
  assert.equal(block.includes('LCEVC'), false);
  assert.equal(block.includes('#EXT-X-VERSION:6'), false);
  assert.equal(block.includes('TOKEN'), false);
});

test('URL samples are masked and never leak query tokens', () => {
  const injected = injector.injectText(CATALOG_LF);
  const report = validator.analyzeText(injected.text);
  const joined = report.sampleUrls.join(' ');
  assert.equal(joined.includes('token'), false);
  assert.equal(joined.includes('secret'), false);
  assert.ok(joined.includes('cdn.example'));
  assert.equal(report.sampleUrls.length, 2);
  assert.equal(JSON.stringify(report).includes('secret-a'), false);
});

// ------------------------------------------------------------------ I2 additions

test('global block conforms to the D1 grammar (validator, not just injector)', () => {
  const injected = injector.injectText(CATALOG_LF);
  const report = validator.validateText(injected.text);
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.stats.ara.present, true);
  assert.equal(report.stats.ara.version, '2026.10.30-EVO-NODROP');
  assert.equal(report.stats.ara.blockBeforeFirstExtinf, true);
  assert.equal(report.stats.ara.contiguous, true);
  assert.deepEqual(report.stats.ara.unknown, []);
  assert.deepEqual(report.stats.ara.badValue, []);
  assert.deepEqual(report.stats.ara.forbidden, []);
});

test('per-channel directives are opt-in, evidence-only and never touch URLs', () => {
  const off = injector.injectText(CATALOG_LF);
  assert.equal(off.perChannelLines, 0);
  assert.equal(off.text.split('\n').filter((l) => l.startsWith('#EXT-X-ARA-CHANNEL-ID')).length, 0);

  const on = injector.injectText(CATALOG_LF, { perChannel: true });
  assert.equal(on.injected, true);
  assert.equal(on.perChannelLines, 2); // two channels, each with a tvg-id
  assert.equal(on.channelsWithDirectives, 2);

  const lines = on.text.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('#EXTINF:-1 tvg-id="a"'));
  assert.equal(lines[idx + 1], '#EXT-X-ARA-CHANNEL-ID:a');

  const before = validator.analyzeText(CATALOG_LF);
  const after = validator.analyzeText(on.text);
  assert.equal(after.extinf, before.extinf);
  assert.equal(after.urls, before.urls);
  assert.equal(after.urlSha256, before.urlSha256);
  assert.equal(validator.compare(before, after).ok, true);
  const report = validator.validateText(on.text);
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.stats.ara.channelLines, 2);

  // idempotent with per-channel directives present
  const twice = injector.injectText(on.text, { perChannel: true });
  assert.equal(twice.injected, false);
  assert.equal(twice.text, on.text);
});

test('per-channel directives require evidence: no profile/codec/8K invented', () => {
  const on = injector.injectText(CATALOG_META, { perChannel: true });
  const lines = on.text.split('\n');
  const i10 = lines.findIndex((l) => l.startsWith('#EXTINF:-1 tvg-id="10"'));
  assert.deepEqual(lines.slice(i10 + 1, i10 + 5), [
    '#EXT-X-ARA-CHANNEL-ID:10',
    '#EXT-X-ARA-PROFILE-HINT:P3',
    '#EXT-X-ARA-CODEC-PREFERRED:hvc1.2.4.L123.B0',
    '#EXT-X-ARA-8K:presentation'
  ]);
  assert.equal(lines[i10 + 5], '#EXT-X-ARA-THERMAL-BUDGET:72');
  const i11 = lines.findIndex((l) => l.startsWith('#EXTINF:-1 tvg-id="11"'));
  assert.deepEqual(lines.slice(i11 + 1, i11 + 2), ['#EXT-X-ARA-CHANNEL-ID:11']);
  assert.equal(lines[i11 + 2].startsWith('#EXT-X-ARA-'), false);
});

test('validator reports pre-existing violations instead of hiding them', () => {
  const report = validator.validateText(CATALOG_PREEXISTING);
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  const present = codes(report);
  for (const code of [
    'grammar_mixed_master_media',
    'grammar_mixed_segment_master',
    'iframe_without_uri',
    'ext_x_start_duplicated',
    'cmaf_malformed_codecs',
    'hdr_maxfall_gt_maxcll',
    'channel_without_stream_inf',
    'tvg_name_duplicate',
    'sid_collision'
  ]) {
    assert.ok(present.includes(code), `missing pre-existing code ${code}: ${present.join(',')}`);
  }
  const byCode = Object.fromEntries(report.preexisting.map((p) => [p.code, p.count]));
  assert.equal(byCode.iframe_without_uri, 1);
  assert.equal(byCode.ext_x_start_duplicated, 1);
  assert.equal(byCode.cmaf_malformed_codecs, 1);
  assert.equal(byCode.hdr_maxfall_gt_maxcll, 1);
  assert.equal(byCode.channel_without_stream_inf, 1);
  assert.equal(byCode.tvg_name_duplicate, 1);
  assert.equal(byCode.sid_collision, 1);
});

test('validator fails when an ARA tag is misplaced (after the channel URL)', () => {
  const injected = injector.injectText(CATALOG_LF);
  const bad = injected.text.replace(
    'https://cdn.example/live/a.m3u8?token=secret-a\n',
    'https://cdn.example/live/a.m3u8?token=secret-a\n#EXT-X-ARA-SYNC:enabled\n'
  );
  const report = validator.validateText(bad);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.code === 'ara_misplaced'), JSON.stringify(report.errors));
});

test('validator fails when an ARA tag is not immediately after #EXTINF', () => {
  const injected = injector.injectText(CATALOG_LF);
  const bad = injected.text.replace(
    '#EXTVLCOPT:network-caching=55000\n#EXT-X-STREAM-INF',
    '#EXTVLCOPT:network-caching=55000\n#EXT-X-ARA-CHANNEL-ID:a\n#EXT-X-STREAM-INF'
  );
  const report = validator.validateText(bad);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.code === 'ara_misplaced'));
});

test('validator fails on a duplicated ARA directive', () => {
  const injected = injector.injectText(CATALOG_LF);
  const bad = injected.text.replace('#EXT-X-ARA-SCHEMA:1\n', '#EXT-X-ARA-SCHEMA:1\n#EXT-X-ARA-SCHEMA:1\n');
  const report = validator.validateText(bad);
  assert.equal(report.ok, false);
  const dup = report.errors.find((e) => e.code === 'ara_duplicate_directive');
  assert.ok(dup, JSON.stringify(report.errors));
  assert.match(dup.detail, /SCHEMA/);
});

test('validator fails when a channel has an extra URL', () => {
  const bad = CATALOG_LF.replace(
    'https://cdn.example/live/a.m3u8?token=secret-a\n',
    'https://cdn.example/live/a.m3u8?token=secret-a\nhttps://cdn.example/live/a2.m3u8\n'
  );
  const report = validator.validateText(bad);
  assert.equal(report.ok, false);
  const err = report.errors.find((e) => e.code === 'url_count_per_channel');
  assert.ok(err, JSON.stringify(report.errors));
  assert.equal(report.stats.catalog.blocksWithWrongUrlCount, 1);
});

test('validator fails on a forbidden directive value (8K-MODE:WIRE, VERSION:6)', () => {
  const injected = injector.injectText(CATALOG_LF);
  const badMode = validator.validateText(injected.text.replace('#EXT-X-ARA-8K-MODE:PRESENTATION', '#EXT-X-ARA-8K-MODE:WIRE'));
  assert.equal(badMode.ok, false);
  assert.ok(badMode.errors.some((e) => e.code === 'ara_forbidden_directive'));
  assert.ok(badMode.errors.some((e) => e.code === 'ara_bad_value'));

  const badVersion = validator.validateText(CATALOG_LF.replace('#EXT-X-VERSION:9', '#EXT-X-VERSION:6'));
  assert.equal(badVersion.ok, false);
  assert.ok(badVersion.errors.some((e) => e.code === 'ara_forbidden_directive'));
});

test('validator fails on an unknown ARA directive', () => {
  const injected = injector.injectText(CATALOG_LF);
  const bad = injected.text.replace('#EXT-X-ARA-SCHEMA:1\n', '#EXT-X-ARA-SCHEMA:1\n#EXT-X-ARA-NOT-A-DIRECTIVE:1\n');
  const report = validator.validateText(bad);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.code === 'ara_unknown_directive'));
});

test('injector is fail-open: no ARA tag on non-catalog input', () => {
  const text = '#EXTM3U\n#EXT-X-TARGETDURATION:6\nsegment.ts\n';
  const result = injector.injectText(text);
  assert.equal(result.text.includes('#EXT-X-ARA-'), false);
  const report = validator.validateText(result.text);
  assert.equal(report.ok, true);
  assert.equal(report.stats.ara.present, false);
});

test('synthetic 10,631-channel catalog: exact counts, URL digest and idempotency', () => {
  const n = 10631;
  const lines = ['#EXTM3U', '#EXT-X-VERSION:9', `#EXT-X-APE-CHANNELS:${n}`];
  for (let i = 0; i < n; i += 1) {
    lines.push(`#EXTINF:-1 tvg-id="${i}" tvg-name="CH ${i}" group-title="G",CH ${i}`);
    lines.push('#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0"');
    lines.push(`https://cdn.example/live/${i}.m3u8`);
  }
  const catalog = lines.join('\n') + '\n';

  const before = validator.analyzeText(catalog);
  assert.equal(before.extinf, n);
  assert.equal(before.urls, n);
  assert.equal(before.blocksWithWrongUrlCount, 0);

  const once = injector.injectText(catalog, { listVersion: 'v-synth' });
  assert.equal(once.injected, true);
  const report = validator.validateText(once.text, { expectChannels: n, expectUrlSha256: before.urlSha256 });
  assert.equal(report.ok, true, JSON.stringify(report.errors.slice(0, 3)));
  assert.equal(report.stats.extinf, n);
  assert.equal(report.stats.urls, n);
  assert.equal(report.stats.urlSha256, before.urlSha256);
  assert.equal(report.stats.ara.globalLines, 27);

  const twice = injector.injectText(once.text, { listVersion: 'v-synth' });
  assert.equal(twice.injected, false);
  assert.equal(twice.text, once.text);
});

test('real catalogs: 10,631 channels, 0 URL mutation, idempotent (ARA_X_E2E=1)', {
  skip: process.env.ARA_X_E2E !== '1' ? 'set ARA_X_E2E=1 (writes ~1.1 GB to a temp dir)' : false,
  timeout: 600000
}, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ara-x-i2-'));
  try {
    for (const [file, expectedStreamInf] of [[REAL_LIST_A, 10631], [REAL_LIST_B, 10586]]) {
      if (!fs.existsSync(file)) continue;
      const base = path.basename(file);
      const once = path.join(tmp, base + '.once.m3u8');
      const twice = path.join(tmp, base + '.twice.m3u8');

      const before = await validator.analyzeFile(file);
      assert.equal(before.extinf, 10631, `${base} #EXTINF`);
      assert.equal(before.urls, 10631, `${base} URLs`);
      assert.equal(before.streamInf, expectedStreamInf, `${base} STREAM-INF`);

      const inject = await injector.injectFile(file, once, { listVersion: 'i2-e2e' });
      assert.equal(inject.injected, true);
      assert.equal(inject.blockLines, 27);

      const report = await validator.validateFile(once, {
        expectChannels: 10631,
        expectUrlSha256: before.urlSha256
      });
      assert.equal(report.ok, true, `${base}: ${JSON.stringify(report.errors.slice(0, 3))}`);
      assert.equal(report.stats.urlSha256, before.urlSha256);
      assert.equal(report.stats.ara.blockBeforeFirstExtinf, true);

      const second = await injector.injectFile(once, twice, { listVersion: 'i2-e2e' });
      assert.equal(second.injected, false);
      assert.equal(fs.statSync(twice).size, fs.statSync(once).size);
      const hashOf = (file) => new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        const stream = fs.createReadStream(file);
        stream.on('data', (chunk) => h.update(chunk));
        stream.on('end', () => resolve(h.digest('hex')));
        stream.on('error', reject);
      });
      const [shaOnce, shaTwice] = await Promise.all([hashOf(once), hashOf(twice)]);
      assert.equal(shaTwice, shaOnce, `${base} second pass must be byte-identical`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
