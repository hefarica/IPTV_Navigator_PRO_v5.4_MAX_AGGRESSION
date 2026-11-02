'use strict';

/*
 * stream_engine_adapter.js — plain-http adapter for vps_jit/server.js
 *
 * No Express. No production wiring. The caller owns the http server and calls:
 *   const engine = require('./stream_engine_adapter').createEngine();
 *   engine.handle(req, res, new URL(req.url, 'http://127.0.0.1'));
 *
 * The writer feeds RAM through put():
 *   engine.put(ch, 'init', 'init-stream_0.m4s', buf);
 *   engine.put(ch, 'part', { msn, part }, buf);
 *   engine.put(ch, 'seg',  { msn },       buf);
 *
 * Status contract: 200, 206, 304, 302, 416. HEAD is supported.
 */

const CACHE = Object.freeze({
  master: 'public, max-age=5, stale-while-revalidate=60, stale-if-error=600',
  media: 'public, max-age=2, stale-while-revalidate=10, stale-if-error=30',
  init: 'public, max-age=31536000, immutable',
  seg: 'public, max-age=31536000, immutable',
  redirect: 'private, max-age=10'
});

const MIME = Object.freeze({
  m3u8: 'application/vnd.apple.mpegurl',
  m4s: 'video/iso.segment',
  mp4: 'video/mp4',
  json: 'application/json',
  text: 'text/plain; charset=utf-8'
});

function weakETag(seed) {
  return 'W/"' + String(seed).replace(/[^A-Za-z0-9_.:-]/g, '_') + '"';
}

function parseRange(value, size) {
  if (typeof value !== 'string' || !/^bytes=/.test(value.trim())) return { bad: true };
  const m = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!m || (m[1] === '' && m[2] === '')) return { bad: true };
  let start = m[1] === '' ? null : Number(m[1]);
  let end = m[2] === '' ? null : Number(m[2]);
  if (start === null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }
  if (start > end || start >= size) return { bad: true };
  return { start, end };
}

function installTiming(res, get) {
  const origEnd = res.end;
  let stamped = false;
  res.end = function () {
    if (!stamped) {
      stamped = true;
      try {
        const t = get();
        res.setHeader('Server-Timing',
          'ttfb;dur=' + t.ttfb.toFixed(1) +
          ', gen;dur=' + t.gen.toFixed(1) +
          ', cache;desc="' + t.cache + '"');
      } catch (_) { }
    }
    return origEnd.apply(res, arguments);
  };
}

function createEngine(options) {
  options = options || {};
  const channels = new Map();
  const holdMs = Number(options.holdMs || 900);
  const ttlMs = Number(options.ttlMs || 45000);
  const maxBytes = Number(options.maxBytes || 24 * 1024 * 1024);

  function channel(ch) {
    let rb = channels.get(ch);
    if (!rb) {
      rb = {
        ch: ch,
        init: new Map(),
        parts: new Map(),
        segs: new Map(),
        bytes: 0,
        lastMsn: -1,
        curPart: -1,
        hits: 0,
        lastAccess: Date.now(),
        lastGood: null,
        waiters: new Set()
      };
      channels.set(ch, rb);
    }
    return rb;
  }

  function trim(rb) {
    const cutoff = Date.now() - ttlMs;
    for (const store of [rb.init, rb.parts, rb.segs]) {
      for (const [k, v] of store) {
        if (v.at < cutoff) {
          rb.bytes -= v.buf.length;
          store.delete(k);
        }
      }
    }
    while (rb.bytes > maxBytes && rb.segs.size > 1) {
      let oldest = null;
      for (const [k, v] of rb.segs) {
        if (!oldest || v.at < oldest.at) oldest = { k, at: v.at };
      }
      if (!oldest) break;
      const v = rb.segs.get(oldest.k);
      rb.bytes -= v.buf.length;
      rb.segs.delete(oldest.k);
    }
  }

  function put(ch, kind, key, buf) {
    const rb = channel(ch);
    buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || '');
    const entry = { buf: buf, at: Date.now() };
    if (kind === 'init') {
      rb.init.set(String(key), entry);
    } else if (kind === 'part') {
      const k = String(key.msn) + ':' + String(key.part);
      rb.parts.set(k, entry);
      if (Number(key.msn) === rb.lastMsn || rb.lastMsn < 0) {
        rb.curPart = Math.max(rb.curPart, Number(key.part));
      }
    } else if (kind === 'seg') {
      const msn = Number(key.msn);
      rb.segs.set(String(msn), entry);
      rb.lastMsn = Math.max(rb.lastMsn, msn);
      rb.curPart = -1;
    } else {
      throw new Error('unknown kind: ' + kind);
    }
    rb.bytes += buf.length;
    rb.lastAccess = Date.now();
    trim(rb);
    notify(rb, Number(key.msn) || 0, Number(key.part) || 0);
    return entry;
  }

  function notify(rb, msn, part) {
    for (const w of Array.from(rb.waiters)) {
      if (msn > w.msn || (msn === w.msn && part >= w.part)) {
        clearTimeout(w.timer);
        rb.waiters.delete(w);
        w.resolve(true);
      }
    }
  }

  function hold(rb, msn, part, timeout) {
    if (rb.lastMsn > msn || (rb.lastMsn === msn && rb.curPart >= part)) {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      const w = { msn: msn, part: part, resolve: resolve };
      w.timer = setTimeout(function () {
        rb.waiters.delete(w);
        resolve(false);
      }, timeout);
      rb.waiters.add(w);
    });
  }

  function mediaPlaylist(rb) {
    const window = 8;
    const first = Math.max(0, rb.lastMsn - window + 1);
    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:9',
      '#EXT-X-TARGETDURATION:4',
      '#EXT-X-PART-INF:PART-TARGET=0.200',
      '#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=0.600',
      '#EXT-X-MEDIA-SEQUENCE:' + first
    ];
    if (rb.init.has('init-stream_0.m4s')) {
      lines.push('#EXT-X-MAP:URI="init-stream_0.m4s"');
    }
    for (let msn = first; msn <= rb.lastMsn; msn++) {
      for (let part = 0; part < 99; part++) {
        if (!rb.parts.has(msn + ':' + part)) break;
        lines.push('#EXT-X-PART:DURATION=0.200,URI="part-stream_0_' + msn + '_' + part + '.m4s"' +
          (part === 0 ? ',INDEPENDENT=YES' : ''));
      }
      if (!rb.segs.has(String(msn))) continue;
      lines.push('#EXTINF:4.000,');
      lines.push('seg-stream_0_' + msn + '.m4s');
    }
    if (rb.lastMsn < 0) {
      lines.push('#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part-stream_0_0_0.m4s"');
    } else {
      lines.push('#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part-stream_0_' + (rb.lastMsn + 1) + '_0.m4s"');
    }
    return lines.join('\n') + '\n';
  }

  function send(req, res, status, body, type, policy, extra) {
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    if (policy) res.setHeader('Cache-Control', policy);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, If-None-Match, If-Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, ETag, Server-Timing');
    if (extra) {
      for (const k of Object.keys(extra)) res.setHeader(k, extra[k]);
    }
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    res.setHeader('Content-Length', buf.length);
    if (req.method === 'HEAD') return res.end();
    return res.end(buf);
  }

  function sendRange(req, res, buf, type, policy, etag, extra) {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', etag);
    const inm = req.headers['if-none-match'];
    if (inm && inm.split(',').some(function (v) { return v.trim() === etag; })) {
      res.statusCode = 304;
      res.setHeader('Cache-Control', policy);
      return res.end();
    }
    const range = req.headers.range;
    if (range) {
      const r = parseRange(range, buf.length);
      if (r.bad) {
        res.statusCode = 416;
        res.setHeader('Content-Range', 'bytes */' + buf.length);
        res.setHeader('Cache-Control', 'no-store');
        return res.end();
      }
      res.statusCode = 206;
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', policy);
      res.setHeader('Content-Range', 'bytes ' + r.start + '-' + r.end + '/' + buf.length);
      res.setHeader('Content-Length', r.end - r.start + 1);
      if (extra) for (const k of Object.keys(extra)) res.setHeader(k, extra[k]);
      if (req.method === 'HEAD') return res.end();
      return res.end(buf.subarray(r.start, r.end + 1));
    }
    return send(req, res, 200, buf, type, policy, Object.assign({ ETag: etag }, extra || {}));
  }

  async function handle(req, res, url) {
    const t0 = process.hrtime.bigint();
    const start = Date.now();
    let cache = 'miss';
    installTiming(res, function () {
      return {
        ttfb: Number(process.hrtime.bigint() - t0) / 1e6,
        gen: 0,
        cache: cache
      };
    });

    const p = (url && url.pathname) || '/';
    const pathname = p.replace(/^\/jit(?=\/)/, '');
    let m;

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      return res.end();
    }

    if (pathname === '/health' || pathname === '/health/') {
      return send(req, res, 200, JSON.stringify({ status: 'ok', channels: channels.size }), MIME.json, 'no-store');
    }

    if (pathname === '/catalog.json') {
      const list = Array.from(channels.values()).map(function (rb) {
        return {
          id: rb.ch,
          hls: '/jit/live/' + rb.ch + '/master.m3u8',
          active: rb.lastMsn >= 0
        };
      });
      return send(req, res, 200, JSON.stringify({ count: list.length, channels: list }), MIME.json, 'no-store');
    }

    if ((m = /^\/go\/([^/]+)\/?$/.exec(pathname))) {
      res.statusCode = 302;
      res.setHeader('Location', '/jit/live/' + encodeURIComponent(m[1]) + '/master.m3u8');
      res.setHeader('Cache-Control', CACHE.redirect);
      return res.end();
    }

    if ((m = /^\/live\/([^/]+)\/master\.m3u8$/.exec(pathname))) {
      const rb = channel(decodeURIComponent(m[1]));
      cache = 'master';
      const body = [
        '#EXTM3U',
        '#EXT-X-VERSION:9',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080',
        'media_0.m3u8'
      ].join('\n') + '\n';
      res.setHeader('Accept-CH', 'RTT, Downlink, Device-Memory');
      res.setHeader('Vary', 'Accept-Encoding');
      return send(req, res, 200, body, MIME.m3u8, CACHE.master);
    }

    if ((m = /^\/live\/([^/]+)\/(?:media_0|playlist)\.m3u8$/.exec(pathname))) {
      const rb = channel(decodeURIComponent(m[1]));
      const msn = url.searchParams.has('_HLS_msn') ? Number(url.searchParams.get('_HLS_msn')) : null;
      const part = url.searchParams.has('_HLS_part') ? Number(url.searchParams.get('_HLS_part')) : 0;
      if (msn !== null && Number.isFinite(msn)) {
        const ok = await hold(rb, msn, Number.isFinite(part) ? part : 0, holdMs);
        if (!ok) res.setHeader('X-Hold-Timeout', '1');
      }
      if (rb.lastMsn < 0 && !rb.lastGood) {
        res.statusCode = 503;
        res.setHeader('Retry-After', '1');
        res.setHeader('Cache-Control', 'no-store');
        return res.end('generating');
      }
      if (rb.lastMsn < 0 && rb.lastGood) {
        cache = 'stale';
        res.setHeader('X-Stale', '1');
        return send(req, res, 200, rb.lastGood, MIME.m3u8, CACHE.media);
      }
      const body = mediaPlaylist(rb);
      rb.lastGood = body;
      cache = 'media';
      const etag = weakETag(rb.ch + '-' + rb.lastMsn + '-' + rb.curPart);
      return sendRange(req, res, Buffer.from(body), MIME.m3u8, CACHE.media, etag);
    }

    if ((m = /^\/live\/([^/]+)\/([^/]+)$/.exec(pathname))) {
      const rb = channel(decodeURIComponent(m[1]));
      const name = decodeURIComponent(m[2]);
      let buf = null;
      let type = MIME.m4s;
      let policy = CACHE.seg;
      let etag = weakETag(rb.ch + '-' + name);
      let extra = { 'CDN-Cache-Control': policy };
      if (/^init-stream_\d+\.m4s$/.test(name)) {
        const e = rb.init.get(name);
        if (e) buf = e.buf;
        type = MIME.mp4;
        policy = CACHE.init;
        extra = { 'CDN-Cache-Control': policy };
      } else if ((m = /^part-stream_(\d+)_(\d+)_(\d+)\.m4s$/.exec(name))) {
        const e = rb.parts.get(m[2] + ':' + m[3]);
        if (e) buf = e.buf;
      } else if ((m = /^(?:seg|chunk)-stream_0_(\d+)\.m4s$/.exec(name))) {
        const e = rb.segs.get(m[1]);
        if (e) buf = e.buf;
        if (e) etag = weakETag(rb.ch + '-' + m[1]);
      } else {
        res.statusCode = 404;
        res.setHeader('Cache-Control', 'no-store');
        return res.end('not found');
      }
      if (!buf) {
        res.statusCode = 503;
        res.setHeader('Retry-After', '1');
        res.setHeader('Cache-Control', 'no-store');
        return res.end('pending');
      }
      rb.hits++;
      rb.lastAccess = Date.now();
      return sendRange(req, res, buf, type, policy, etag, extra);
    }

    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    return res.end('not found');
  }

  return {
    handle: handle,
    put: put,
    channels: channels,
    CACHE: CACHE,
    mediaPlaylist: mediaPlaylist
  };
}

module.exports = { createEngine, CACHE, parseRange };
