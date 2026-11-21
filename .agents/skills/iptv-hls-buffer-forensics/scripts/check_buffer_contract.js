#!/usr/bin/env node
/*
 * Generic regression harness for the APE-style generator contract:
 *
 *   node check_buffer_contract.js \
 *     --generator path/to/m3u8-typed-arrays-ultimate.js \
 *     --jit path/to/ape-jit/server.js \
 *     --lab path/to/APE_LAB_CANONICAL_BULLETPROOF.json \
 *     --segments 2,4,6
 *
 * It loads the generator in a Node vm with minimal DOM stubs and calls the
 * exported API. It does not need a browser, a VPS, an APK or a private list.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return fallback;
  return process.argv[i + 1] || fallback;
}

const GENERATOR = path.resolve(arg('generator', ''));
const JIT = path.resolve(arg('jit', ''));
const LAB = arg('lab', '') ? path.resolve(arg('lab', '')) : null;
const SEGMENTS = String(arg('segments', '2,4,6'))
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

let fails = 0;
const lines = [];
function t(name, condition, detail = '') {
  const ok = !!condition;
  lines.push((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  (' + detail + ')' : ''));
  if (!ok) fails += 1;
}

function loadGenerator() {
  const src = fs.readFileSync(GENERATOR, 'utf8');
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, URL, TextEncoder, TextDecoder,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.document = {
    addEventListener() {},
    createElement() { return { style: {}, appendChild() {}, setAttribute() {}, remove() {} }; },
    body: { appendChild() {}, removeChild() {} },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  sandbox.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  sandbox.navigator = { userAgent: 'node', language: 'es' };
  sandbox.location = { href: 'http://localhost/', search: '', hash: '' };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: path.basename(GENERATOR) });
  return sandbox.M3U8TypedArraysGenerator;
}

function hasLoadControl(text) {
  return /\\"minBufferMs\\":30000/.test(text) &&
    /\\"bufferForPlaybackAfterRebufferMs\\":3000/.test(text) &&
    /\\"maxBufferMs\\":90000/.test(text);
}

function main() {
  t('generator exists', fs.existsSync(GENERATOR), GENERATOR);
  t('JIT exists', fs.existsSync(JIT), JIT);
  if (!fs.existsSync(GENERATOR) || !fs.existsSync(JIT)) return finish();

  const G = loadGenerator();
  t('resolveTargetDuration exported', typeof G.resolveTargetDuration === 'function');
  t('generateGlobalHeader exported', typeof G.generateGlobalHeader === 'function');
  if (typeof G.resolveTargetDuration !== 'function' || typeof G.generateGlobalHeader !== 'function') {
    return finish();
  }

  const R = G.resolveTargetDuration;
  for (const seg of SEGMENTS) {
    t(`resolver ${seg} s`, R({ segment_duration_s: seg }) === Math.ceil(seg));
    const h = G.generateGlobalHeader(10, { maxQualityMode: true, segment_duration_s: seg });
    const m = h.match(/^#EXT-X-TARGETDURATION:(\d+)$/m);
    t(`TARGETDURATION ${seg} s`, m && Number(m[1]) === Math.ceil(seg), m ? m[1] : 'missing');
    t(`load_control ${seg} s`, hasLoadControl(h));
  }

  t('resolver fallback empty', R({ segment_duration_s: '' }) === 2);
  t('resolver fallback null', R({ segment_duration_s: null }) === 2);
  t('resolver fallback negative', R({ segment_duration_s: -4 }) === 2);
  t('resolver rounds up 4.5', R({ segment_duration_s: 4.5 }) === 5);

  const d = G.generateGlobalHeader(10, {});
  t('default load_control', hasLoadControl(d));
  t('default buffer strategy', d.includes('TARGET=24s|MIN=15s|MAX=48s'));

  if (LAB && fs.existsSync(LAB)) {
    const lab = JSON.parse(fs.readFileSync(LAB, 'utf8'));
    const b = G.generateGlobalHeader(10, {
      bulletproof_loaded: true,
      bulletproof_profiles: lab.profiles_calibrated,
      masterProfile: 'P0',
      lab_metadata: { lab_version: 'contract-test' },
    });
    t('bulletproof load_control', hasLoadControl(b));
    const p0 = lab.profiles_calibrated && lab.profiles_calibrated.P0;
    if (p0 && p0.settings && p0.settings.segment_duration_s) {
      t('resolver reads LAB P0', R({
        masterProfile: 'P0',
        bulletproof_profiles: lab.profiles_calibrated,
      }) === Math.ceil(Number(p0.settings.segment_duration_s)));
    }
  } else {
    lines.push('SKIP  LAB not supplied');
  }

  const genSrc = fs.readFileSync(GENERATOR, 'utf8');
  const jitSrc = fs.readFileSync(JIT, 'utf8');
  t('no literal TARGETDURATION:2', !genSrc.includes('#EXT-X-TARGETDURATION:2'));
  t('TARGETDURATION uses variable', genSrc.includes('#EXT-X-TARGETDURATION:${_targetDuration}'));
  t('JIT buffer floor 24 s', /Math\.min\(45,\s*Math\.max\(24,/.test(jitSrc));
  t('JIT X-Buffer-Min 62.5%', /playerBuf \* 0\.625/.test(jitSrc));
  t('JIT segment duration dynamic', /X-Segment-Duration': String\(segDur\)/.test(jitSrc));
  t('JIT no static X-Segment-Duration', !/X-Segment-Duration': '2'/.test(jitSrc));

  finish();
}

function finish() {
  console.log(lines.join('\n'));
  console.log('\nSUMMARY: ' + (lines.length - fails) + ' PASS, ' + fails + ' FAIL');
  process.exit(fails === 0 ? 0 : 1);
}

main();
