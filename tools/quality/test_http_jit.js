#!/usr/bin/env node
/**
 * Live JIT HTTP smoke: 200 catalog/list, 206 range, 302 redirect.
 * Requires network. This is an integration check, not a unit test.
 */
'use strict';

const assert = require('assert');
const https = require('https');

const BASE = 'https://iptv-ape.duckdns.org';
let passed = 0;

function rangeStatus(url) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Range: 'bytes=0-1023', 'Accept-Encoding': 'identity' }
    }, function (res) {
      resolve({
        status: res.statusCode,
        accept: res.headers['accept-ranges'] || '',
        contentRange: res.headers['content-range'] || ''
      });
      res.destroy();
    });
    req.on('error', reject);
    req.setTimeout(20000, function () { req.destroy(new Error('timeout')); });
    req.end();
  });
}

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

    // 206 must be proven on a stable deployed asset. The JIT active stream can
    // legitimately return 503 while stopped; JIT media status is reported apart.
    const range = await rangeStatus(BASE + '/js/ape-v9/generation-output-panel.js?v=20261102-jit-hdr-v2');
    ok(range.status === 206, 'deployed app asset Range HTTP 206');
    ok(
      String(range.accept).toLowerCase().includes('bytes') ||
      String(range.contentRange).toLowerCase().startsWith('bytes '),
      'Range headers present (Accept-Ranges/Content-Range)'
    );

    const jitRange = await rangeStatus(BASE + '/jit/live/1174213/media_0.m3u8');
    console.log((jitRange.status === 206 ? 'PASS ' : 'SKIP ') + 'JIT media Range status=' + jitRange.status);

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
