#!/usr/bin/env node
/**
 * Verify the streaming HTTP contract against the public VPS.
 * Exit non-zero on any missing header or wrong status.
 */
'use strict';
const BASE = 'https://iptv-ape.duckdns.org';
let pass = 0, total = 0;

function ok(name, cond, detail) {
  total++;
  if (cond) { pass++; console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  else { console.log('FAIL ' + name + (detail ? ' · ' + detail : '')); }
}

async function fetchWithRetry(path, opts) {
  for (let i = 0; i < 3; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const r = await fetch(BASE + path, { ...opts, cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (r.status !== 503) return r;
    } catch (_) { clearTimeout(timer); }
    await new Promise(r => setTimeout(r, 2500));
  }
  return fetch(BASE + path, { ...opts, cache: 'no-store' });
}

(async () => {
  const master = await fetchWithRetry('/jit/live/3/master.m3u8', {});
  ok('master 200', master.status === 200, 'status=' + master.status);
  const cc = master.headers.get('cache-control') || '';
  ok('master no-store', /no-store/i.test(cc), cc);
  ok('master CORS', (master.headers.get('access-control-allow-origin') || '').includes('*'));
  ok('master keep-alive', /keep-alive/i.test(master.headers.get('connection') || ''));

  await fetchWithRetry('/jit/live/3/master.m3u8', {});
  await new Promise(r => setTimeout(r, 1000));
  const media = await fetchWithRetry('/jit/live/3/media_0.m3u8', {});
  const mediaText = await media.text();
  const initMatch = mediaText.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const init = initMatch ? initMatch[1] : 'init-0.m4s';
  ok('EXT-X-MAP found', !!initMatch, init);
  const range = await fetchWithRetry('/jit/live/3/' + init, { headers: { Range: 'bytes=0-1023' } });
  ok('range 206', range.status === 206, 'status=' + range.status);
  ok('Accept-Ranges', range.headers.get('accept-ranges') === 'bytes');
  ok('Content-Type', /video\/iso\.segment/i.test(range.headers.get('content-type') || ''), range.headers.get('content-type') || '');
  const cr = range.headers.get('content-range') || '';
  ok('Content-Range', /^bytes 0-1023\/\d+$/.test(cr), cr);
  ok('Content-Length', range.headers.get('content-length') === '1024', range.headers.get('content-length') || '');
  const rcc = range.headers.get('cache-control') || '';
  ok('range no-store', /no-store/i.test(rcc), rcc);
  ok('range ETag', !!range.headers.get('etag'));
  ok('range Vary *', (range.headers.get('vary') || '').includes('*'));
  ok('range CORS', (range.headers.get('access-control-allow-origin') || '').includes('*'));

  const opt = await fetchWithRetry('/jit/live/3/master.m3u8', { method: 'OPTIONS' });
  ok('OPTIONS 204', opt.status === 204, 'status=' + opt.status);

  const redirect = await fetchWithRetry('/jit/go/3', { redirect: 'manual' });
  ok('redirect 302', redirect.status === 302, 'status=' + redirect.status);
  ok('redirect Location', /\/jit\/live\/3\/master\.m3u8$/.test(redirect.headers.get('location') || ''));

  console.log('\nTOTAL=' + total + ' PASS=' + pass + ' FAIL=' + (total - pass));
  if (pass !== total) process.exitCode = 1;
})();
