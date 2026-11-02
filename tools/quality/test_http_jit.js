#!/usr/bin/env node
/**
 * Live JIT HTTP smoke: 200 catalog/list, 206 range, 302 redirect.
 * Requires network. This is an integration check, not a unit test.
 */
'use strict';

const assert = require('assert');

const BASE = 'https://iptv-ape.duckdns.org';
let passed = 0;

function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
  console.log('PASS ' + message);
}

(async function main() {
  try {
    const catalog = await fetch(BASE + '/jit/catalog.json', { cache: 'no-store' });
    ok(catalog.status === 200, 'catalog HTTP 200');

    const list = await fetch(BASE + '/jit/playlist.m3u8', { cache: 'no-store' });
    ok(list.status === 200, 'playlist HTTP 200');

    const range = await fetch(BASE + '/jit/live/3/media_0.m3u8', {
      headers: { Range: 'bytes=0-1023' },
      cache: 'no-store'
    });
    ok(range.status === 206, 'media playlist Range HTTP 206');
    ok(String(range.headers.get('accept-ranges') || '').toLowerCase().includes('bytes'), 'Accept-Ranges: bytes');

    const redirect = await fetch(BASE + '/jit/go/3', {
      redirect: 'manual',
      cache: 'no-store'
    });
    ok(redirect.status === 302, 'go/3 HTTP 302');

    console.log('\\ntest_http_jit: ' + passed + ' assertions OK');
  } catch (e) {
    console.error('\\ntest_http_jit: FAIL');
    console.error(e && e.stack || e);
    process.exitCode = 1;
  }
})();
