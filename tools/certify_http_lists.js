#!/usr/bin/env node
/**
 * Certify HTTP 200 for every official APE list/output type.
 * Playback is intentionally out of scope.
 */
'use strict';
const ENDPOINTS = [
  { id: 'JIT_HLS_LIST', url: 'https://iptv-ape.duckdns.org/jit/playlist.m3u8' },
  { id: 'JIT_CATALOG', url: 'https://iptv-ape.duckdns.org/jit/catalog.json' },
  { id: 'JIT_CAPABILITIES', url: 'https://iptv-ape.duckdns.org/jit/capabilities.json' },
  { id: 'VPS_CDN_LIST', url: 'https://iptv-ape.duckdns.org/lists/APE_LISTA_1793531111695_CDN.m3u8' },
  { id: 'HLS_1080_MASTER', url: 'https://iptv-ape.duckdns.org/jit/live/3/master.m3u8' },
  { id: 'HLS_1080_SDR', url: 'https://iptv-ape.duckdns.org/jit/live/3/sdr/master.m3u8' },
  { id: 'DASH_1080_MPD', url: 'https://iptv-ape.duckdns.org/jit/live/3/manifest.mpd' },
  { id: 'DASH_1080_SDR_MPD', url: 'https://iptv-ape.duckdns.org/jit/live/3/sdr/manifest.mpd' },
  { id: 'JSON_1080', url: 'https://iptv-ape.duckdns.org/jit/live/3/manifest.json' },
  { id: 'HLS_4K_MASTER', url: 'https://iptv-ape.duckdns.org/jit/live/1174213/master.m3u8' },
  { id: 'DASH_4K_MPD', url: 'https://iptv-ape.duckdns.org/jit/live/1174213/manifest.mpd' },
  { id: 'JSON_4K', url: 'https://iptv-ape.duckdns.org/jit/live/1174213/manifest.json' },
  { id: 'HLS_4K_SDR', url: 'https://iptv-ape.duckdns.org/jit/live/1174213/sdr/master.m3u8' },
  { id: 'DASH_4K_SDR_MPD', url: 'https://iptv-ape.duckdns.org/jit/live/1174213/sdr/manifest.mpd' }
];

async function probe(e) {
  let last = { id: e.id, status: 'ERROR', ok: false };
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const r = await fetch(e.url, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      last = { id: e.id, status: r.status, type: r.headers.get('content-type') || '', ok: r.status === 200 };
      if (last.ok || r.status !== 503) return last;
    } catch (err) {
      clearTimeout(timer);
      last = { id: e.id, status: 'ERROR', error: err.message, ok: false };
    }
    await new Promise(res => setTimeout(res, 3000));
  }
  return last;
}

(async () => {
  const rows = [];
  for (const e of ENDPOINTS) rows.push(await probe(e));
  for (const r of rows) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.id + ' = ' + r.status + ' ' + (r.type || ''));
  const failed = rows.filter(r => !r.ok);
  console.log('\nTOTAL=' + rows.length + ' PASS=' + (rows.length - failed.length) + ' FAIL=' + failed.length);
  if (failed.length) process.exitCode = 1;
})();
