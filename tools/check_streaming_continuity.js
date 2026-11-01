#!/usr/bin/env node
/**
 * Enforce the STREAMING CONTINUITY LAW against the public VPS.
 * Fails if a manifest is cacheable, a 206 is wrong, a segment name is fixed,
 * or the JIT playlist is not fresh.
 */
'use strict';
const BASE = 'https://iptv-ape.duckdns.org';
let pass = 0, total = 0;
function ok(name, cond, detail) {
  total++;
  if (cond) { pass++; console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  else console.log('FAIL ' + name + (detail ? ' · ' + detail : ''));
}
async function get(path, opts) {
  let last = null;
  for (let i = 0; i < 3; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      last = await fetch(BASE + path, { ...opts, cache: 'no-store', signal: ctrl.signal });
    } finally { clearTimeout(t); }
    if (last.status !== 503) return last;
    await new Promise(r => setTimeout(r, 2500));
  }
  return last;
}
(async () => {
  const list = await get('/jit/playlist.m3u8');
  ok('JIT list 200', list.status === 200, 'status=' + list.status);
  ok('JIT list no-store', /no-store/i.test(list.headers.get('cache-control') || ''));

  let master = await get('/jit/live/3/master.m3u8');
  if (master.status !== 200) {
    await new Promise(r => setTimeout(r, 3000));
    master = await get('/jit/live/3/master.m3u8');
  }
  ok('master 200', master.status === 200, 'status=' + master.status);
  ok('master no-store', /no-store/i.test(master.headers.get('cache-control') || ''));

  const media = await get('/jit/live/3/media_0.m3u8');
  const text = await media.text();
  const map = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const chunks = [...text.matchAll(/^(chunk-[^\r\n]+)$/gm)].map(m => m[1]);
  ok('EXT-X-MAP session-unique', !!map && /^init-[A-Za-z0-9]+-0\.m4s$/.test(map[1]), map ? map[1] : 'missing');
  ok('chunk session-unique', chunks.length > 0 && chunks.every(x => /^chunk-[A-Za-z0-9]+-0-\d+\.m4s$/.test(x)), chunks[0] || 'missing');
  ok('init not fixed init-0', !text.includes('URI="init-0.m4s"'));

  let init = map ? map[1] : '';
  let range = { status: 0, headers: new Headers() };
  for (let i = 0; i < 4 && init; i++) {
    range = await get('/jit/live/3/' + init, { headers: { Range: 'bytes=0-1023' } });
    if (range.status === 206) break;
    await new Promise(r => setTimeout(r, 2000));
    if (range.status === 404) {
      const media2 = await get('/jit/live/3/media_0.m3u8');
      const text2 = await media2.text();
      const map2 = text2.match(/#EXT-X-MAP:URI="([^"]+)"/);
      init = map2 ? map2[1] : '';
    }
  }
  ok('range 206', range.status === 206, 'status=' + range.status);
  ok('Content-Range', /^bytes 0-1023\/\d+$/.test(range.headers.get('content-range') || ''), range.headers.get('content-range') || '');
  ok('Content-Length', range.headers.get('content-length') === '1024', range.headers.get('content-length') || '');
  ok('MIME', /video\/iso\.segment/i.test(range.headers.get('content-type') || ''), range.headers.get('content-type') || '');
  ok('range no-store', /no-store/i.test(range.headers.get('cache-control') || ''));
  ok('range ETag', !!range.headers.get('etag'));

  const publicList = await get('/lists/APE_LISTA_1793531111695_CDN.m3u8', { method: 'HEAD' });
  ok('VPS list 200', publicList.status === 200, 'status=' + publicList.status);
  ok('VPS list no-store', /no-store/i.test(publicList.headers.get('cache-control') || ''), publicList.headers.get('cache-control') || '');

  const redirect = await get('/jit/go/3', { redirect: 'manual' });
  ok('302 redirect', redirect.status === 302, 'status=' + redirect.status);

  console.log('\nTOTAL=' + total + ' PASS=' + pass + ' FAIL=' + (total - pass));
  if (pass !== total) process.exitCode = 1;
})();
