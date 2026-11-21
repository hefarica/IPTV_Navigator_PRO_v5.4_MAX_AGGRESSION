#!/usr/bin/env node
/*
 * test_buffer_targetduration.js — contrato offline de dos defectos medidos:
 *
 * 1. #EXT-X-TARGETDURATION estaba fijo en 2 aunque el perfil declarara
 *    segmentos de 4 o 6 s. Un master que declara 2 con segmentos de 4 hace
 *    que el player calcule mal el live edge y recargue antes de que el
 *    segmento exista; se ve como rebuffering de red.
 * 2. El buffer objetivo del JIT arrancaba en 8 s (4 segmentos de 2 s) y el
 *    load_control reanudaba tras rebuffer con 1000 ms. Un segmento lento +
 *    un retry vaciaba la cola y el player volvia a caer.
 *
 * No usa red, VPS, APK ni listas privadas. Carga el generador en un sandbox
 * Node con stubs mínimos y llama a la API pública exportada.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const GEN = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const JIT = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'ape-jit', 'server.js');
const LAB = path.join(ROOT, 'contracts', 'lab', 'APE_LAB_CANONICAL_BULLETPROOF.json');

let fails = 0;
const lines = [];
function t(name, condition, detail = '') {
  const ok = !!condition;
  lines.push((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  (' + detail + ')' : ''));
  if (!ok) fails += 1;
}

function loadGenerator() {
  const src = fs.readFileSync(GEN, 'utf8');
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
  vm.runInContext(src, sandbox, { filename: 'm3u8-typed-arrays-ultimate.js' });
  return sandbox.M3U8TypedArraysGenerator;
}

function main() {
  t('generador existe', fs.existsSync(GEN));
  t('JIT existe', fs.existsSync(JIT));
  t('LAB canónico existe', fs.existsSync(LAB));
  if (fails) return finish();

  const G = loadGenerator();
  t('API resolveTargetDuration exportada', typeof G.resolveTargetDuration === 'function');
  t('API generateGlobalHeader exportada', typeof G.generateGlobalHeader === 'function');
  if (typeof G.resolveTargetDuration !== 'function' || typeof G.generateGlobalHeader !== 'function') return finish();

  const R = G.resolveTargetDuration;

  // ── Resolvedor: duración real, no un literal ──────────────────────────────
  t('resolver segmento 2 s', R({ segment_duration_s: 2 }) === 2);
  t('resolver segmento 4 s', R({ segment_duration_s: 4 }) === 4);
  t('resolver segmento 6 s', R({ segment_duration_s: 6 }) === 6);
  t('resolver string "4" del LAB', R({ segment_duration_s: '4' }) === 4);
  t('resolver redondeo hacia arriba 4.5 -> 5', R({ segment_duration_s: 4.5 }) === 5);
  t('resolver prioriza opción explícita', R({ segment_duration_s: 6, segment_duration: 2 }) === 6);
  t('resolver lee settings del perfil maestro', R({
    masterProfile: 'P0',
    bulletproof_profiles: { P0: { settings: { segment_duration_s: '4' } } },
  }) === 4);
  t('resolver lee campo plano del perfil', R({
    masterProfile: 'P1',
    bulletproof_profiles: { P1: { segment_duration: 6 } },
  }) === 6);
  t('resolver ignora vacío y cae a 2', R({ segment_duration_s: '' }) === 2);
  t('resolver ignora null y cae a 2', R({ segment_duration_s: null }) === 2);
  t('resolver ignora negativo y cae a 2', R({ segment_duration_s: -4 }) === 2);
  t('resolver ignora texto no numérico y cae a 2', R({ segment_duration_s: 'cuatro' }) === 2);

  // ── Plantilla MAX_QUALITY: el tag sigue al segmento ───────────────────────
  for (const seg of [2, 4, 6]) {
    const h = G.generateGlobalHeader(10, { maxQualityMode: true, segment_duration_s: seg });
    const m = h.match(/^#EXT-X-TARGETDURATION:(\d+)$/m);
    t('MAX_QUALITY TARGETDURATION=' + seg, m && Number(m[1]) === seg, m ? m[1] : 'sin tag');
    t('MAX_QUALITY load_control 30000/3000/90000 (seg ' + seg + ')',
      /\\"minBufferMs\\":30000/.test(h) &&
      /\\"bufferForPlaybackAfterRebufferMs\\":3000/.test(h) &&
      /\\"maxBufferMs\\":90000/.test(h));
    t('MAX_QUALITY buffer strategy 15/24/48 (seg ' + seg + ')',
      h.includes('MIN=15s|TARGET=24s|MAX=48s'));
  }

  // ── Rama por defecto: mismos valores, sin depender de maxQualityMode ──────
  const d = G.generateGlobalHeader(10, {});
  t('default load_control 30000/3000/90000',
    /\\"minBufferMs\\":30000/.test(d) &&
    /\\"bufferForPlaybackAfterRebufferMs\\":3000/.test(d) &&
    /\\"maxBufferMs\\":90000/.test(d));
  t('default buffer strategy 15/24/48', d.includes('TARGET=24s|MIN=15s|MAX=48s'));

  // ── Ruta LAB/bulletproof: también debe llevar el load_control estándar ───
  const lab = JSON.parse(fs.readFileSync(LAB, 'utf8'));
  const b = G.generateGlobalHeader(10, {
    bulletproof_loaded: true,
    bulletproof_profiles: lab.profiles_calibrated,
    masterProfile: 'P0',
    lab_metadata: { lab_version: 'test' },
  });
  t('bulletproof load_control 30000/3000/90000',
    /\\"minBufferMs\\":30000/.test(b) &&
    /\\"bufferForPlaybackAfterRebufferMs\\":3000/.test(b) &&
    /\\"maxBufferMs\\":90000/.test(b));

  // ── El LAB canónico de P0 declara 4 s: el resolvedor debe leerlo ─────────
  const p0 = lab.profiles_calibrated && lab.profiles_calibrated.P0;
  t('LAB P0 tiene settings.segment_duration_s', !!(p0 && p0.settings && p0.settings.segment_duration_s));
  if (p0 && p0.settings && p0.settings.segment_duration_s) {
    t('resolver lee LAB P0', R({ masterProfile: 'P0', bulletproof_profiles: lab.profiles_calibrated }) ===
      Math.ceil(Number(p0.settings.segment_duration_s)));
  }

  // ── Contrato estático: no queda el literal viejo en la plantilla ─────────
  const genSrc = fs.readFileSync(GEN, 'utf8');
  t('sin #EXT-X-TARGETDURATION:2 literal', !genSrc.includes('#EXT-X-TARGETDURATION:2'));
  t('plantilla usa ${_targetDuration}', genSrc.includes('#EXT-X-TARGETDURATION:${_targetDuration}'));

  // ── JIT: piso 24 s, mínimo 62.5 %, segmento real ─────────────────────────
  const jitSrc = fs.readFileSync(JIT, 'utf8');
  t('JIT buffer floor 24 s', /Math\.min\(45,\s*Math\.max\(24,/.test(jitSrc));
  t('JIT X-Buffer-Min 62.5 %', /playerBuf \* 0\.625/.test(jitSrc));
  t('JIT X-Segment-Duration dinámico', /X-Segment-Duration': String\(segDur\)/.test(jitSrc));
  t('JIT resuelve segDurRaw', /const segDurRaw = Number\(/.test(jitSrc));
  t('JIT no fija X-Segment-Duration en 2', !/X-Segment-Duration': '2'/.test(jitSrc));

  finish();
}

function finish() {
  console.log(lines.join('\n'));
  console.log('\nRESUMEN: ' + (lines.length - fails) + ' PASS, ' + fails + ' FAIL');
  process.exit(fails === 0 ? 0 : 1);
}

main();
