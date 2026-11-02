#!/usr/bin/env node
/** Regression: real certified LAB must merge into P0 with >635 fields and
 * preserve the audio-safe policy. No DOM/network beyond the JS modules. */
'use strict';
const path = require('path');
global.window = global;
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  addEventListener: () => {}, getElementById: () => null, querySelector: () => null,
  querySelectorAll: () => [], body: { appendChild: () => {} },
  createElement: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {} })
};
if (!global.navigator) Object.defineProperty(global, 'navigator', { value: { userAgent: 'node' }, configurable: true });
const base = path.join(__dirname, '..', '..', 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9');
require(path.join(base, 'ape-lab-v8-profiles.js'));
require(path.join(base, 'ape-profiles-config.js'));
const p = window.APE_PROFILES_CONFIG.getProfile('P0');
const sections = ['settings', 'vlcopt', 'kodiprop', 'hlsjs', 'prefetch_config', 'optimized_knobs', 'bounds', 'headerOverrides', 'lab_sync'];
const counts = {};
let total = 0;
for (const key of sections) {
  const n = p[key] && typeof p[key] === 'object' ? Object.keys(p[key]).length : 0;
  counts[key] = n;
  total += n;
}
const ok = total > 635 && p.settings.audio_mode === 'passthrough_safe' &&
  p.settings.audio_fallback === 'aac_lc_2ch' &&
  p.headerOverrides['X-Audio-Passthrough-Mode'] === 'passthrough_safe';
console.log(JSON.stringify({ total, counts, audio_mode: p.settings.audio_mode, fallback: p.settings.audio_fallback, ok }, null, 2));
if (!ok) process.exitCode = 1;
