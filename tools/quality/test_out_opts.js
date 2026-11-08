#!/usr/bin/env node
/**
 * Test A/B/C/D — JIT + HDR output options.
 *
 * A: panel state -> controller options (VM, no jsdom dependency).
 * B: real generator entry -> observed VIDEO-RANGE, requested HDR and JIT URL.
 * C: semantic regression for JIT off + HDR auto.
 * D: JIT catalog id -> hls + fallback.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DeltaContractV9 = require('../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/streaming/delta-contract-v9.js');

const ROOT = path.resolve(__dirname, '..', '..');
const PANEL = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/generation-output-panel.js');
const GENERATOR = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js');

let passed = 0;
function ok(condition, message) {
  if (!condition) throw new Error(message);
  passed++;
  console.log('PASS ' + message);
}

function panelContext(catalog) {
  const elements = {
    'ape-out-jit': { checked: false },
    'ape-out-hdr': { value: 'auto' },
    'ape-delta-input': { value: '15' },
    'dictatorMode': { checked: false },
    'ape-max-quality-toggle': { checked: false },
    'ape-perceptual-4k-toggle': { checked: false },
    'ape-max-compat-toggle': { checked: false }
  };
  const store = new Map();
  const calls = [];
  const window = {
    __APE_OUTPUT_TEST__: true,
    APEGenerationController: {
      prepublishAndGenerate: async function (opts) {
        calls.push(opts);
        return { decision: 'generated' };
      }
    }
  };
  const document = {
    readyState: 'loading',
    getElementById: function (id) { return elements[id] || null; },
    querySelector: function (sel) {
      if (sel && sel.indexOf('ape-out-format') !== -1) return { value: 'm3u8' };
      if (sel && sel.indexOf('dictatorTier') !== -1) return { value: '4K' };
      return null;
    },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    createElement: function () { return { style: {}, appendChild: function () {} }; }
  };
  const localStorage = {
    getItem: function (k) { return store.has(k) ? store.get(k) : null; },
    setItem: function (k, v) { store.set(k, String(v)); }
  };
  const fetch = async function (url) {
    if (String(url).indexOf('/jit/catalog.json') !== -1) {
      return {
        ok: true,
        status: 200,
        json: async function () { return catalog; }
      };
    }
    throw new Error('network disabled in test');
  };
  const context = {
    window: window,
    document: document,
    localStorage: localStorage,
    fetch: fetch,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Map: Map,
    Promise: Promise,
    JSON: JSON,
    String: String,
    Number: Number,
    Object: Object,
    Array: Array,
    Error: Error,
    URL: URL
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(PANEL, 'utf8'), context, { filename: PANEL });
  return { window: window, elements: elements, calls: calls, hooks: window.APE_OUTPUT_TEST_HOOKS };
}

async function testA() {
  const ctx = panelContext({
    channels: [
      { id: '3', hls: 'https://iptv-ape.duckdns.org/jit/live/3/master.m3u8' }
    ]
  });
  assert(ctx.hooks, 'test hooks missing');
  ctx.elements['ape-out-jit'].checked = true;
  ctx.elements['ape-out-hdr'].value = 'pq';
  ctx.elements['dictatorMode'].checked = true;
  ctx.elements['ape-max-quality-toggle'].checked = false;
  ctx.elements['ape-perceptual-4k-toggle'].checked = false;
  ctx.elements['ape-max-compat-toggle'].checked = true;
  ok((await ctx.hooks.ensureJitCatalog()) === true, 'A1 catalog loaded');
  ok(ctx.hooks.jitUrlForChannel({ tvg_id: '3' }) === 'https://iptv-ape.duckdns.org/jit/live/3/master.m3u8', 'A2 tvg_id -> hls');
  ok(ctx.hooks.jitUrlForChannel({ tvg_id: 'nope' }) === null, 'A3 unknown id -> null');
  await ctx.hooks.runDirect();
  ok(ctx.calls.length === 1, 'A4 controller called once');
  ok(ctx.calls[0].jit === true, 'A5 jit passed to controller');
  ok(ctx.calls[0].hdrMode === 'pq', 'A6 hdrMode passed to controller');
  ok(ctx.calls[0].manifestMetadata && ctx.calls[0].manifestMetadata.dictatorMode === true, 'A6b dictatorMode passed as metadata');
  ok(ctx.calls[0].manifestMetadata && ctx.calls[0].manifestMetadata.dictatorTier === '4K', 'A6c dictatorTier passed as metadata');
  ok(ctx.calls[0].manifestMetadata && ctx.calls[0].manifestMetadata.maxCompatMode === true, 'A6d maxCompatMode passed as metadata');
  ok(ctx.window.APE_USE_JIT === undefined, 'A7 APE_USE_JIT restored');
  ok(ctx.window.APE_HDR_MODE === undefined, 'A8 APE_HDR_MODE restored');
  ctx.hooks.saveOutOpts(true, 'sdr');
  const restored = ctx.hooks.loadOutOpts();
  ok(restored.jit === true && restored.hdr === 'sdr', 'A9 JIT/HDR persisted and restored');
}

async function testD() {
  const ctx = panelContext({ channels: [] });
  assert(ctx.hooks, 'test hooks missing');
  ctx.elements['ape-out-jit'].checked = true;
  const loaded = await ctx.hooks.ensureJitCatalog();
  ok(loaded === false, 'D1 empty catalog returns false');
  await ctx.hooks.runDirect();
  ok(ctx.calls[0].jit === false, 'D2 empty catalog falls back to direct');
}

function loadGenerator() {
  global.window = global;
  global.self = global;
  global.btoa = function (s) { return Buffer.from(s).toString('base64'); };
  global.UAPhantomEngine = { get: function () { return 'MockUA'; } };
  global.getProfileConfig = function () {
    return {
      bandwidth: 80000000,
      resolution: '1920x1080',
      fps: 30,
      video_range: 'SDR',
      hdr_mode: 'SDR',
      codec_chain_video: 'hvc1.2.4.L120.B0',
      codec_chain_audio: 'mp4a.40.2',
      bitrate: 5000
    };
  };
  global.getRandomIp = function () { return '0.0.0.0'; };
  global.generateJWT68Fields = function () {
    return { token: 'mocktoken', sessionId: 'mocksess', reqId: 'mockreq' };
  };
  global.build_exthttp = function () { return '#EXTHTTP:{"User-Agent":"MockUA"}'; };
  global.HttpAnabolicEngine = { buildAnabolicPayload: function () { return {}; } };
  global.buildChannelUrl = function () { return 'http://example.com/live/user/pass/123.ts'; };
  global.generateEXTINF = function () { return '#EXTINF:-1 tvg-id="",Channel Name'; };
  global.FRONTCDN_FORCE_TS_HOSTS = [];
  global.CLEAN_URL_MODE = false;
  global.APE_USE_JIT = false;
  global.APE_DIRECT_MODE = true;
  global.APE_REA_POLICY = require('../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/rea-processing-policy.js');
  global.APE_REA_EXPORT = require('../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/rea-export-finalizer.js')(global);

  eval(fs.readFileSync(GENERATOR, 'utf8'));
  return global.M3U8TypedArraysGenerator;
}

function stableLines(out) {
  return String(out)
    .split('\n')
    .filter(function (l) {
      return /^#EXTINF/.test(l) || /^#EXT-X-STREAM-INF/.test(l) || /^https?:\/\//.test(l);
    })
    .join('\n');
}

function testB() {
  const gen = loadGenerator();
  const channel = {
    id: '3',
    tvg_id: '3',
    name: 'Test Channel',
    url: 'http://example.com/live/user/pass/123.ts',
    _probeData: {
      source: 'PROBED_MASTER', resolution: '1920x1080', videoCodec: 'avc1.640028',
      videoRange: 'SDR', frameRate: 30, bandwidth: 5000000,
      provenance: {
        schema: 'ape.probe-provenance/1', scope: 'channel_url',
        requestedUrl: 'http://example.com/live/user/pass/123.ts',
        responseUrl: 'http://example.com/live/user/pass/123.ts',
        observedFields: ['resolution', 'videoCodec', 'videoRange', 'frameRate', 'bandwidth']
      }
    }
  };

  const auto = gen.generateChannelEntry(channel, 'P4', 0, {}, {});
  ok(auto.indexOf('VIDEO-RANGE=SDR') !== -1, 'B1 auto preserves observed SDR source');
  const pq = gen.generateChannelEntry(channel, 'P4', 0, {}, { hdr_force: 'pq' });
  ok(pq.indexOf('VIDEO-RANGE=SDR') !== -1 && pq.indexOf('"outputPreference":"pq"') !== -1, 'B2 hdr_force=pq requests conversion without relabeling SDR');
  const sdr = gen.generateChannelEntry(channel, 'P4', 0, {}, { hdr_force: 'sdr' });
  ok(sdr.indexOf('VIDEO-RANGE=SDR') !== -1, 'B3 hdr_force=sdr -> VIDEO-RANGE=SDR');
  ok(sdr.indexOf('#EXT-X-APE-4KFALSE-MODE:DISABLED') !== -1, 'B4 fake source declarations are disabled');

  global.APE_JIT_URL_FOR_CHANNEL = function (c) {
    return c && String(c.tvg_id) === '3'
      ? 'https://iptv-ape.duckdns.org/jit/live/3/master.m3u8'
      : null;
  };
  global.APE_USE_JIT = true;
  global.APE_DIRECT_MODE = false;
  const jit = gen.generateChannelEntry(channel, 'P4', 0, {}, {});
  ok(jit.indexOf('https://iptv-ape.duckdns.org/jit/live/3/master.m3u8') !== -1, 'B5 JIT URL emitted');
  global.APE_JIT_URL_FOR_CHANNEL = function () { return null; };
  const fallback = gen.generateChannelEntry(channel, 'P4', 0, {}, {});
  ok(fallback.indexOf('http://example.com/live/user/pass/123.ts') !== -1, 'B6 no JIT match -> direct URL');
  global.APE_USE_JIT = false;
  global.APE_DIRECT_MODE = true;

  // Observed source evidence must survive a resolver's incompatible PQ hint.
  global.APEFallbackResolver = {
    resolveMaxQualityFallback: function () {
      return { tier: 'F2_HEVC_PREMIUM_HINT', resolution: '3840x2160', videoRange: 'PQ', hdr: 'HDR10_PQ', hdrVerified: true, frameRate: 30 };
    },
    emitApeFallbackTags: function () { return []; },
    emitStreamInfFromTruth: function () {
      return '#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=3840x2160,VIDEO-RANGE=PQ';
    }
  };
  const sdrWithResolver = gen.generateChannelEntry(channel, 'P4', 0, {}, { hdr_force: 'sdr' });
  ok(sdrWithResolver.indexOf('VIDEO-RANGE=SDR') !== -1, 'B7 resolver cannot override observed SDR');
  delete global.APEFallbackResolver;

  const metadataTag = gen._outputMetadataTag({
    manifest_metadata: {
      dictatorMode: true,
      dictatorTier: '4K',
      maxQualityMode: false,
      perceptual4kMode: false,
      maxCompatMode: true
    }
  });
  ok(metadataTag === '#EXT-X-APE-OUTPUT-METADATA:{"dictatorMode":true,"dictatorTier":"4K","maxQualityMode":false,"perceptual4kMode":false,"maxCompatMode":true}', 'B8 manifest metadata tag exact');
  const mqSdr = gen.generateChannelEntry(channel, 'P4', 0, {}, { maxQualityMode: true, hdr_force: 'sdr' });
  ok(mqSdr.indexOf('VIDEO-RANGE=SDR') !== -1, 'B9 source evidence wins over maxQualityMode STREAM-INF');
  const baseOnly = {
    id: '3', name: 'Base Layer URL', base: { url: 'http://example.com/live/user/pass/123.ts' }
  };
  const baseEntry = gen.generateChannelEntry(baseOnly, 'P4', 0, {}, {});
  ok(baseEntry.indexOf('http://example.com/live/user/pass/123.ts') !== -1, 'B10 base.url resolves URI');
  global.DeltaContractV9 = DeltaContractV9;
  global.APE_DELTA_CONTRACT = DeltaContractV9.compute({
    outMbps: 9, deltaPct: 35, targetBufferSec: 105, fillTimeSec: 300, measuredInputMbps: 14.2
  });
  const gh = gen._generateGlobalHeader(1, {});
  ok(gh.indexOf('#EXT-X-APE-DELTA-CONTRACT:') !== -1, 'B11 generator emits delta contract tag');
  ok(gh.indexOf('IN_MIN_MBPS=12.15') !== -1, 'B12 delta tag carries IN_MIN');
  delete global.APE_DELTA_CONTRACT;

  const auto2 = gen.generateChannelEntry(channel, 'P4', 0, {}, {});
  ok(stableLines(auto) === stableLines(auto2), 'C1 semantic stable with JIT off + HDR auto');
  ok(stableLines(auto).indexOf('/jit/') === -1, 'C2 no JIT URL when JIT off');
}

async function testE() {
  const gen = global.M3U8TypedArraysGenerator;
  const channel = { id: '3', tvg_id: '3', name: 'Manifest Test', url: 'http://example.com/live/user/pass/123.ts' };
  const stream = gen.generateStream([channel], {
    manifest_metadata: {
      dictatorMode: true,
      dictatorTier: '8K',
      maxQualityMode: false,
      perceptual4kMode: false,
      maxCompatMode: true
    }
  });
  const reader = stream.getReader();
  let text = '';
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    text += Buffer.from(r.value).toString('utf8');
  }
  ok(text.indexOf('#EXT-X-APE-OUTPUT-METADATA:') !== -1, 'E1 manifest carries output metadata');
  ok(text.indexOf('"dictatorMode":true') !== -1, 'E2 metadata dictatorMode true');
  ok(text.indexOf('"maxCompatMode":true') !== -1, 'E3 metadata maxCompatMode true');
}

async function testF() {
  const gen = global.M3U8TypedArraysGenerator;
  const channel = {
    id: '3', name: 'Base Layer URL',
    base: { url: 'http://example.com/live/user/pass/123.ts' }
  };
  const stream = gen.generateStream([channel], { hud: false });
  const reader = stream.getReader();
  let text = '';
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    text += Buffer.from(r.value).toString('utf8');
  }
  ok(text.indexOf('http://example.com/live/user/pass/123.ts') !== -1, 'F1 URL-GUARD accepts base.url in full stream');
}

async function main() {
  try {
    await testA();
    testB();
    await testE();
    await testF();
    await testD();
    console.log('\\ntest_out_opts: ' + passed + ' assertions OK');
  } catch (e) {
    console.error('\\ntest_out_opts: FAIL');
    console.error(e && e.stack || e);
    process.exitCode = 1;
  }
}

main();
