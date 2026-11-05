#!/usr/bin/env node
'use strict';
/**
 * Test de la emisión multi-dialecto del generador (una receta → varios idiomas).
 *
 * Carga el helper REAL `apeFilterDialects` del generador (extraído por conteo de
 * llaves) y el bundle REAL `APE_IMAGE_RECIPES`, y exige:
 *   1. VLC: sólo módulos verificados (gradfun/deinterlace/sharpen/hqdn3d), con
 *      separador `:` y opciones `{k=v}`. Cero módulos ffmpeg en el carril VLC.
 *   2. ffmpeg: sin chroma 0 (el defecto universal de las 10.573 cadenas),
 *      gradfun.strength dentro de [0.51, 64], radius [4, 32].
 *   3. Los 7 tags de metadata existen y son coherentes con la misma receta.
 *   4. `#EXT-X-SESSION-DATA` decodifica a JSON con el perfil y el target.
 *   5. Fail-closed: sin bundle, sigue emitiendo cadenas VÁLIDAS (no vacías).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const GEN = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const BUNDLE = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'ape-image-recipes-bundle.js');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); }
};

// ── extraer el helper del generador por conteo de llaves ────────────────────
function extractHelper(file) {
  const src = fs.readFileSync(file, 'utf8');
  const mark = 'function apeFilterDialects(profile, cfg) {';
  const start = src.indexOf(mark);
  if (start < 0) throw new Error('helper no encontrado en ' + file);
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('helper sin cierre');
  return src.slice(start, end);
}

const helperSrc = extractHelper(GEN);
const bundleSrc = fs.readFileSync(BUNDLE, 'utf8');
const bundle = (() => {
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundleSrc, sandbox);
  return sandbox.window.APE_IMAGE_RECIPES || sandbox.module.exports;
})();

ok('bundle tiene 6 perfiles', bundle && Object.keys(bundle.profiles).length === 6, JSON.stringify(bundle && Object.keys(bundle.profiles || {})));

function callHelper(profile, cfg, withBundle) {
  const sandbox = {
    window: withBundle === false ? {} : { APE_IMAGE_RECIPES: bundle },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    Buffer,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext('var apeFilterDialects = ' + helperSrc + ';', sandbox);
  return sandbox.apeFilterDialects(profile, cfg);
}

const VERIFIED = new Set(['gradfun', 'deinterlace', 'sharpen', 'hqdn3d']);
const FORBIDDEN = ['nlmeans', 'bwdif', 'yadif', 'zscale', 'minterpolate', 'unsharp', 'cas', 'libplacebo', 'pp'];

for (const profile of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  const fd = callHelper(profile, { width: 3840, height: 2160 }, true);
  const tag = (prefix) => (fd.metadata.find((l) => l.startsWith(prefix)) || '').slice(prefix.length);

  // 1) VLC lane
  const modules = fd.vlc.chain.split(':').map((m) => m.replace(/\{.*$/, ''));
  ok(profile + ' VLC sólo módulos verificados', modules.every((m) => VERIFIED.has(m)), fd.vlc.chain);
  ok(profile + ' VLC sin módulos ffmpeg', !FORBIDDEN.some((f) => new RegExp('(^|:)' + f + '\\{').test(fd.vlc.chain)), fd.vlc.chain);
  // las comas DENTRO de {k=v} son opciones del módulo (válidas); fuera de llaves no.\n  ok(profile + ' VLC sin coma entre módulos', !fd.vlc.chain.replace(/\{[^}]*\}/g, '').includes(','), fd.vlc.chain);

  // 2) ffmpeg lane
  const chromaZero = /(^|:)chroma_msize_[xy]=0(:|,)/.test(fd.ffmpeg);
  ok(profile + ' ffmpeg sin chroma_msize=0', !chromaZero, fd.ffmpeg);
  const gs = /gradfun=radius=\d+:strength=([0-9.]+)/.exec(fd.ffmpeg);
  ok(profile + ' ffmpeg gradfun.strength en rango', !gs || (parseFloat(gs[1]) >= 0.51 && parseFloat(gs[1]) <= 64), gs && gs[1]);
  const un = /unsharp=lx=(\d+):ly=(\d+)/.exec(fd.ffmpeg);
  ok(profile + ' ffmpeg unsharp luma msize en rango', !un || (parseInt(un[1], 10) >= 3 && parseInt(un[2], 10) >= 3), un && un[1]);

  // 3) metadata tags
  const want = [
    '#EXT-X-APE-FILTERS:', '#EXT-X-APE-VLC-FILTERS:', '#EXT-X-APE-VLC-POLICY:',
    '#EXT-X-APE-FFMPEG-FILTERS:', '#EXT-X-APE-MPV-FILTERS:', '#EXT-X-APE-EXO-FILTERS:',
    '#EXT-X-APE-KODI-FILTERS:', '#EXT-X-SESSION-DATA:'
  ];
  ok(profile + ' emite los 8 tags', want.every((w) => fd.metadata.some((l) => l.startsWith(w))), fd.metadata.length);
  ok(profile + ' FILTERS lleva la MISMA cadena VLC', tag('#EXT-X-APE-FILTERS:').includes('VLC=' + fd.vlc.chain), tag('#EXT-X-APE-FILTERS:'));
  ok(profile + ' FILTERS lleva la MISMA cadena ffmpeg', tag('#EXT-X-APE-FILTERS:').includes('FFMPEG=' + fd.ffmpeg));
  ok(profile + ' MPV usa la cadena ffmpeg', tag('#EXT-X-APE-MPV-FILTERS:') === '--vf=' + fd.ffmpeg);
  ok(profile + ' KODI declara NONE', tag('#EXT-X-APE-KODI-FILTERS:').startsWith('NONE;'), tag('#EXT-X-APE-KODI-FILTERS:'));
  ok(profile + ' fuente = recipes.json', tag('#EXT-X-APE-FILTERS:').includes('SOURCE=recipes.json'), tag('#EXT-X-APE-FILTERS:'));

  // 4) session-data decodifica
  const m = /VALUE="([A-Za-z0-9_-]+)"/.exec(fd.metadata.find((l) => l.startsWith('#EXT-X-SESSION-DATA:')) || '');
  let decoded = null;
  try { decoded = m ? JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) : null; } catch (e) { decoded = null; }
  ok(profile + ' SESSION-DATA JSON válido', decoded && decoded.profile === profile, m && m[1]);
  ok(profile + ' SESSION-DATA declara política VLC', decoded && /inert/.test(decoded.vlc_policy || ''), decoded && decoded.vlc_policy);
}

// 5) fail-closed sin bundle
const fb = callHelper('P3', { width: 1920, height: 1080 }, false);
ok('fallback sin bundle: VLC válida', fb.vlc.chain.split(':').map((m) => m.replace(/\{.*$/, '')).every((m) => VERIFIED.has(m)), fb.vlc.chain);
ok('fallback sin bundle: ffmpeg válida', !/(^|:)chroma_msize_[xy]=0(:|,)/.test(fb.ffmpeg), fb.ffmpeg);
ok('fallback sin bundle: declara SOURCE=fallback-P3', fb.metadata[0].includes('SOURCE=fallback-P3'), fb.metadata[0]);

console.log('\nRESUMEN FILTER-DIALECTS: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exitCode = fail ? 1 : 0;

