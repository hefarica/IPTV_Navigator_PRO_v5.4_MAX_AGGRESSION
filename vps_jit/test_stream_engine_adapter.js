'use strict';

const assert = require('assert');
const http = require('http');
const { createEngine, parseRange } = require('./stream_engine_adapter');

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed++;
  console.log('PASS ' + label);
}

async function main() {
  const engine = createEngine({ holdMs: 800, maxBytes: 1024 * 1024 });
  engine.put('3', 'init', 'init-stream_0.m4s', Buffer.from('INIT-DATA'));
  engine.put('3', 'part', { msn: 0, part: 0 }, Buffer.from('PART-0'));
  engine.put('3', 'seg', { msn: 0 }, Buffer.from('SEGMENT-0'));

  const server = http.createServer(function (req, res) {
    engine.handle(req, res, new URL(req.url, 'http://127.0.0.1'))
      .catch(function (e) {
        res.statusCode = 500;
        res.end('engine error: ' + e.message);
      });
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  const base = 'http://127.0.0.1:' + server.address().port;

  try {
    let r = await fetch(base + '/jit/live/3/master.m3u8');
    ok(r.status === 200, 'master 200');
    ok((await r.text()).indexOf('#EXT-X-STREAM-INF') !== -1, 'master has STREAM-INF');

    r = await fetch(base + '/jit/live/3/media_0.m3u8');
    const media = await r.text();
    ok(r.status === 200, 'media 200');
    ok(/#EXT-X-PART/.test(media), 'media carries EXT-X-PART');
    ok(/#EXT-X-MAP/.test(media), 'media carries EXT-X-MAP');
    ok((r.headers.get('server-timing') || '').indexOf('ttfb;dur=') !== -1, 'Server-Timing stamped');
    const mediaTag = r.headers.get('etag');
    ok(!!mediaTag, 'media has ETag');

    r = await fetch(base + '/jit/live/3/media_0.m3u8', { headers: { 'If-None-Match': mediaTag } });
    ok(r.status === 304, 'media 304 on If-None-Match');

    r = await fetch(base + '/jit/live/3/init-stream_0.m4s', { headers: { Range: 'bytes=0-3' } });
    ok(r.status === 206, 'init 206');
    ok(r.headers.get('content-range') === 'bytes 0-3/9', 'init Content-Range');
    ok((await r.arrayBuffer()).byteLength === 4, 'init range length');

    r = await fetch(base + '/jit/live/3/init-stream_0.m4s', { headers: { Range: 'bytes=999-' } });
    ok(r.status === 416, 'invalid range 416');
    ok(r.headers.get('content-range') === 'bytes */9', '416 Content-Range');

    r = await fetch(base + '/jit/go/3', { redirect: 'manual' });
    ok(r.status === 302, 'go 302');
    ok((r.headers.get('location') || '') === '/jit/live/3/master.m3u8', 'go Location');

    r = await fetch(base + '/jit/live/3/media_0.m3u8', { method: 'HEAD' });
    ok(r.status === 200, 'HEAD 200');
    ok((await r.text()).length === 0, 'HEAD empty body');

    const blocking = fetch(base + '/jit/live/3/media_0.m3u8?_HLS_msn=1&_HLS_part=0');
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
    engine.put('3', 'part', { msn: 1, part: 0 }, Buffer.from('PART-1'));
    engine.put('3', 'seg', { msn: 1 }, Buffer.from('SEGMENT-1'));
    r = await blocking;
    const blockedText = await r.text();
    ok(r.status === 200, 'blocking reload 200');
    ok(
      blockedText.indexOf('part-stream_0_0_0.m4s') !== -1 &&
      blockedText.indexOf('part-stream_0_1_0.m4s') !== -1,
      'blocking reload advanced window'
    );

    ok(parseRange('bytes=0-9', 10).end === 9, 'parseRange valid');
    ok(parseRange('bytes=20-', 10).bad === true, 'parseRange invalid');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('\ntest_stream_engine_adapter: ' + passed + ' assertions OK');
}

main().catch(function (e) {
  console.error('test_stream_engine_adapter: FAIL');
  console.error(e && e.stack || e);
  process.exitCode = 1;
});
