#!/usr/bin/env node
/**
 * Final HTTP contract: 200 for lists/manifests, 206 for Range, 302 for redirect.
 * Playback is out of scope.
 */
'use strict';
const BASE = 'https://iptv-ape.duckdns.org';

const LIST_200 = [
  ['JIT_HLS_LIST', '/jit/playlist.m3u8'],
  ['JIT_CATALOG', '/jit/catalog.json'],
  ['JIT_CAPABILITIES', '/jit/capabilities.json'],
  ['JIT_CRYSTAL', '/jit/crystal.json'],
  ['VPS_CDN_LIST', '/lists/APE_LISTA_1793531111695_CDN.m3u8'],
  ['HLS_1080', '/jit/live/3/master.m3u8'],
  ['HLS_1080_SDR', '/jit/live/3/sdr/master.m3u8'],
  ['DASH_1080', '/jit/live/3/manifest.mpd'],
  ['DASH_1080_SDR', '/jit/live/3/sdr/manifest.mpd'],
  ['JSON_1080', '/jit/live/3/manifest.json'],
  ['JSON_1080_SDR', '/jit/live/3/sdr/manifest.json'],
  ['HLS_4K', '/jit/live/1174213/master.m3u8'],
  ['HLS_4K_SDR', '/jit/live/1174213/sdr/master.m3u8'],
  ['DASH_4K', '/jit/live/1174213/manifest.mpd'],
  ['DASH_4K_SDR', '/jit/live/1174213/sdr/manifest.mpd'],
  ['JSON_4K', '/jit/live/1174213/manifest.json'],
  ['JSON_4K_SDR', '/jit/live/1174213/sdr/manifest.json'],
];
const RANGE_206 = [
  ['RANGE_1080_INIT', '/jit/live/3/init-0.m4s', '/jit/live/3/master.m3u8'],
  ['RANGE_1080_SDR_INIT', '/jit/live/3/sdr/init-0.m4s', '/jit/live/3/sdr/master.m3u8'],
  ['RANGE_4K_INIT', '/jit/live/1174213/init-0.m4s', '/jit/live/1174213/master.m3u8'],
  ['RANGE_4K_SDR_INIT', '/jit/live/1174213/sdr/init-0.m4s', '/jit/live/1174213/sdr/master.m3u8'],
];

async function req(path, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    return await fetch(BASE + path, { cache: 'no-store', ...opts, signal: ctrl.signal });
  } finally { clearTimeout(timer); }
}

async function retry200(path) {
  let last = 0;
  for (let i = 0; i < 3; i++) {
    const r = await req(path, { method: 'GET', redirect: 'manual' });
    last = r.status;
    if (r.status === 200) return r;
    await new Promise(res => setTimeout(res, 2500));
  }
  return { status: last };
}

(async () => {
  let total = 0, pass = 0;
  for (const [name, path] of LIST_200) {
    const r = await retry200(path);
    const ok = r.status === 200;
    total++; if (ok) pass++;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + ' = ' + r.status + ' (HTTP 200)');
  }
  for (const [name, path, warm] of RANGE_206) {
    await retry200(warm);
    let status = 0;
    for (let i = 0; i < 3; i++) {
      const r = await req(path, { headers: { Range: 'bytes=0-1023' }, redirect: 'manual' });
      status = r.status;
      if (status === 206) break;
      await new Promise(res => setTimeout(res, 2000));
    }
    const ok = status === 206;
    total++; if (ok) pass++;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + ' = ' + status + ' (HTTP 206 Range)');
  }
  for (const rid of ['3', '1174213']) {
    const redirect = await req('/jit/go/' + rid, { redirect: 'manual' });
    const loc = redirect.headers.get('location') || '';
    const ok = redirect.status === 302 && new RegExp('/jit/live/' + rid + '/master\\.m3u8$').test(loc);
    total++; if (ok) pass++;
    console.log((ok ? 'PASS ' : 'FAIL ') + 'REDIRECT_302_' + rid + ' = ' + redirect.status + ' · ' + loc);
  }
  console.log('\nTOTAL=' + total + ' PASS=' + pass + ' FAIL=' + (total - pass));
  if (pass !== total) process.exitCode = 1;
})();



