#!/usr/bin/env node
'use strict';
const fs = require('fs');
let total = 0, pass = 0;
function check(name, cond, detail) {
  total++;
  if (cond) { pass++; console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  else console.log('FAIL ' + name + (detail ? ' · ' + detail : ''));
}
const oldSrc = fs.readFileSync('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js', 'utf8');
const v5Src = fs.readFileSync('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config-v5.js', 'utf8');
const json = JSON.parse(fs.readFileSync('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/APE_ALL_PROFILES_OPTIMIZED.json', 'utf8'));
for (const token of ['passthrough_safe', 'aac_lc_2ch', 'X-Audio-Passthrough-Mode', 'X-Audio-No-Damage', 'audio_passthrough_earc']) {
  check('live config ' + token, oldSrc.includes(token));
  check('v5 config ' + token, v5Src.includes(token));
}
for (const pid of Object.keys(json.profiles)) {
  const p = json.profiles[pid];
  const h = p.headers || {};
  check(pid + ' audio_mode', p.settings && p.settings.audio_mode === 'passthrough_safe');
  check(pid + ' audio fallback', h['X-Audio-Fallback'] === 'aac_lc_2ch');
  check(pid + ' audio priority', h['X-Audio-Codec-Priority'] === 'eac3,ac3,aac,mp3');
  check(pid + ' audio codecs compatible', h['X-Audio-Codecs'] === 'eac3,ac3,aac,mp3');
  check(pid + ' no damage', h['X-Audio-No-Damage'] === 'true');
}
check('generator has safe passthrough', fs.readFileSync('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js', 'utf8').includes('AUDIO-PASSTHROUGH:SAFE'));
const extra = fs.readFileSync('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/lab-extra-headers.js', 'utf8');
const extraNames = [...extra.matchAll(/"([^"]+)"/g)].map(m => m[1]);
check('LAB extra 185 headers', extraNames.length === 185, String(extraNames.length));
check('LAB extra audio 11', extraNames.filter(x => x.startsWith('X-Audio-')).length === 11);
check('LAB extra total 639', 233 + 221 + extraNames.length === 639, String(233 + 221 + extraNames.length));
console.log(`\nTOTAL=${total} PASS=${pass} FAIL=${total - pass}`);
if (pass !== total) process.exitCode = 1;
