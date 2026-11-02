#!/usr/bin/env node
/** Regression test: the real __apePlayableChannelUrl helper must resolve the
 * parser field names, not only channel.url. No DOM, no network. */
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js'), 'utf8');
const start = src.indexOf('function __apePlayableChannelUrl');
const end = src.indexOf('function preferHttps', start);
if (start < 0 || end < 0) throw new Error('helper not found');
const helper = src.slice(start, end);
const isPlayable = (u) => typeof u === 'string' && /^https?:\/\/[^/]+\/.+/.test(u.trim());
const preferHttps = (u) => u;
const resolve = new Function('isPlayableStreamUrl', 'preferHttps', helper + '\nreturn __apePlayableChannelUrl;')(isPlayable, preferHttps);
const cases = [
  [{ url: 'https://host/live/1.m3u8' }, 'https://host/live/1.m3u8'],
  [{ stream_url: 'https://host/live/2.m3u8' }, 'https://host/live/2.m3u8'],
  [{ direct_source: 'https://host/live/3.m3u8' }, 'https://host/live/3.m3u8'],
  [{ raw: { stream_url: 'https://host/live/4.m3u8' } }, 'https://host/live/4.m3u8'],
  [{ raw: { server_url: 'https://host/live/5.m3u8' } }, 'https://host/live/5.m3u8'],
  [{ _apeCanonical: { channel: { url: 'https://host/live/6.m3u8' } } }, 'https://host/live/6.m3u8'],
  [{ playback_url: 'https://host/live/7.m3u8' }, 'https://host/live/7.m3u8'],
  [{ url: 'not-a-url' }, 'not-a-url'],
  [{}, ''],
];
let pass = 0;
for (const [input, expected] of cases) {
  const got = resolve(input);
  const ok = got === expected;
  console.log((ok ? 'PASS ' : 'FAIL ') + JSON.stringify(input) + ' -> ' + JSON.stringify(got));
  if (ok) pass++;
}
console.log(`\nTOTAL=${cases.length} PASS=${pass} FAIL=${cases.length - pass}`);
if (pass !== cases.length) process.exitCode = 1;
