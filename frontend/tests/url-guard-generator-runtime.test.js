#!/usr/bin/env node
/**
 * Runtime regression: the real generator must pass URL-GUARD when the parser
 * stores the playable URL in stream_url or raw.stream_url, without channel.url.
 * No network and no real playout: it only builds the M3U8 stream object.
 */
'use strict';
const path = require('path');
global.window = global;
global.self = global;
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  addEventListener: () => {}, getElementById: () => null, querySelector: () => null,
  querySelectorAll: () => [], body: { appendChild: () => {} },
  createElement: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {}, setAttribute: () => {} })
};
if (!global.navigator) Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', languages: ['es'] }, configurable: true });
global.location = { href: 'https://iptv-ape.duckdns.org/', origin: 'https://iptv-ape.duckdns.org' };
global.Blob = class { constructor(parts) { this.parts = parts || []; this.size = this.parts.join('').length; } text() { return Promise.resolve(this.parts.join('')); } };
global.APE_STRICT_URI = true;
const generatorPath = path.join(__dirname, '..', '..', 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
require(generatorPath);
const gen = window.M3U8TypedArraysGenerator;
if (!gen || typeof gen.generateStream !== 'function') throw new Error('generator export missing');
const cases = [
  [{ name: 'TEST_STREAM_URL', stream_id: '1', stream_url: 'https://host/live/1.m3u8' }],
  [{ name: 'TEST_RAW', stream_id: '1', raw: { stream_url: 'https://host/live/1.m3u8' } }],
  [{ name: 'TEST_PROVIDER', stream_id: '1', _provider_url: 'https://host/live/1.m3u8' }],
  [{ name: 'TEST_CANONICAL', stream_id: '1', _apeCanonical: { channel: { url: 'https://host/live/1.m3u8' } } }]
];
let pass = 0;
for (const [channel] of cases) {
  try {
    const stream = gen.generateStream([channel], { profile: 'P3', includeHeader: false, hud: false });
    if (!stream || typeof stream.getReader !== 'function') throw new Error('no stream');
    console.log('PASS ' + channel.name);
    pass++;
  } catch (e) {
    console.log('FAIL ' + channel.name + ' · ' + (e && e.message));
  }
}
console.log(`\nTOTAL=${cases.length} PASS=${pass} FAIL=${cases.length - pass}`);
if (pass !== cases.length) process.exitCode = 1;
