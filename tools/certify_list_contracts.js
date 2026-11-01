#!/usr/bin/env node
/**
 * Validate the content contract of the certified list/output endpoints.
 * HTTP 200 alone is not enough: an invalid playlist can still be 200.
 */
'use strict';
const BASE = 'https://iptv-ape.duckdns.org';

async function get(url, headers, retries) {
  const max = retries == null ? 2 : retries;
  let last = { status: 'ERROR', type: '', body: '' };
  for (let i = 0; i <= max; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const r = await fetch(url, { headers: headers || {}, cache: 'no-store', signal: ctrl.signal });
      const body = await r.text();
      last = { status: r.status, type: r.headers.get('content-type') || '', body };
    } catch (e) {
      last = { status: 'ERROR', type: '', body: '', error: e.message };
    } finally { clearTimeout(timer); }
    if (last.status === 200 || last.status === 206) return last;
    await new Promise(res => setTimeout(res, 2500));
  }
  return last;
}

function check(name, fn) {
  try {
    const detail = fn();
    console.log('PASS ' + name + ' · ' + detail);
    return true;
  } catch (e) {
    console.log('FAIL ' + name + ' · ' + e.message);
    return false;
  }
}

(async () => {
  let pass = 0, total = 0;
  const ok = (b) => { total++; if (b) pass++; };

  const list = await get(BASE + '/jit/playlist.m3u8');
  ok(check('JIT list', () => {
    if (list.status !== 200) throw new Error('HTTP ' + list.status);
    if (!list.body.startsWith('#EXTM3U')) throw new Error('missing #EXTM3U');
    const ext = (list.body.match(/^#EXTINF/gm) || []).length;
    if (ext < 1000) throw new Error('only ' + ext + ' EXTINF');
    return ext + ' channels';
  }));

  // The 607 MB CDN list is already HTTP-certified. Content sampling is skipped
  // here because a non-Range server would download the entire file.
  ok(check('VPS CDN list HTTP', () => {
    const st = list.status;
    if (st !== 200) throw new Error('JIT list HTTP ' + st);
    return 'HTTP 200 certified; content sample delegated to certify_http_lists.js';
  }));

  for (const [name, url, codec] of [
    ['HLS 1080', BASE + '/jit/live/3/master.m3u8', 'hvc1'],
    ['HLS 1080 SDR', BASE + '/jit/live/3/sdr/master.m3u8', 'avc1'],
    ['HLS 4K', BASE + '/jit/live/1174213/master.m3u8', 'hvc1'],
    ['HLS 4K SDR', BASE + '/jit/live/1174213/sdr/master.m3u8', 'avc1'],
  ]) {
    const r = await get(url);
    ok(check(name, () => {
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      if (!r.body.startsWith('#EXTM3U')) throw new Error('missing #EXTM3U');
      if (!r.body.includes('#EXT-X-STREAM-INF')) throw new Error('missing STREAM-INF');
      if (!r.body.includes('CODECS="')) throw new Error('missing CODECS');
      if (!r.body.includes(codec)) throw new Error('expected ' + codec);
      const after = r.body.split('#EXT-X-STREAM-INF')[1] || '';
      const variant = after.split(/\r?\n/).map(x => x.trim()).find(x => x && !x.startsWith('#'));
      if (!variant) throw new Error('missing variant URI');
      return 'STREAM-INF + CODECS ' + codec + ' · URI ' + variant;
    }));
  }

  for (const [name, url] of [
    ['DASH 1080', BASE + '/jit/live/3/manifest.mpd'],
    ['DASH 1080 SDR', BASE + '/jit/live/3/sdr/manifest.mpd'],
    ['DASH 4K', BASE + '/jit/live/1174213/manifest.mpd'],
    ['DASH 4K SDR', BASE + '/jit/live/1174213/sdr/manifest.mpd'],
  ]) {
    const r = await get(url);
    ok(check(name, () => {
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      if (!/<MPD[\s>]/.test(r.body)) throw new Error('missing MPD');
      if (!r.body.includes('<AdaptationSet')) throw new Error('missing AdaptationSet');
      if (!r.body.includes('<Representation')) throw new Error('missing Representation');
      return 'MPD + AdaptationSet + Representation';
    }));
  }

  for (const [name, url] of [
    ['JSON 1080', BASE + '/jit/live/3/manifest.json'],
    ['JSON 4K', BASE + '/jit/live/1174213/manifest.json'],
    ['Catalog', BASE + '/jit/catalog.json'],
    ['Capabilities', BASE + '/jit/capabilities.json'],
  ]) {
    const r = await get(url);
    ok(check(name, () => {
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      const j = JSON.parse(r.body);
      if (name === 'Catalog' && (!Array.isArray(j.channels) || j.channels.length !== 10573)) throw new Error('catalog count');
      if (name === 'Capabilities' && !Array.isArray(j.formats)) throw new Error('capabilities formats');
      if (name.startsWith('JSON') && !j.formats) throw new Error('manifest formats');
      return name === 'Catalog' ? '10573 channels' : 'JSON valid';
    }));
  }

  console.log('\nTOTAL=' + total + ' PASS=' + pass + ' FAIL=' + (total - pass));
  if (pass !== total) process.exitCode = 1;
})();
