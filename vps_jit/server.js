#!/usr/bin/env node
'use strict';
/*
 * APE JIT CMAF — one active channel at a time.
 * Input: /opt/ape-jit/channels.json  { "<id>": { "url": "...", "ua": "..." } }
 * Output: /dev/shm/ape-jit/<id>/{manifest.mpd,master.m3u8,media_*.m3u8,init-*.m4s,chunk-*.m4s}
 * Never accepts a URL from the client; only an id in the allowlist.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 3099);
const BIND = process.env.BIND || '127.0.0.1';
const MAP_FILE = process.env.MAP_FILE || '/opt/ape-jit/channels.json';
const OUT_ROOT = process.env.OUT_ROOT || '/dev/shm/ape-jit';
const IDLE_MS = Number(process.env.IDLE_MS || 20000);
const WAIT_MS = Number(process.env.WAIT_MS || 15000);

let current = null;
const MIME = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.mpd': 'application/dash+xml',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
};
function log(...a) { console.log(new Date().toISOString(), ...a); }
function loadMap() {
  try { return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); }
  catch (e) { log('MAP_ERROR', e.message); return {}; }
}
function safeId(id) { return /^[A-Za-z0-9_.-]{1,80}$/.test(id) ? id : null; }

function stopCurrent(reason) {
  if (!current) return;
  const c = current; current = null;
  log('STOP', c.id, reason || '');
  try { c.child.kill('SIGTERM'); } catch (_) {}
  setTimeout(() => { try { c.child.kill('SIGKILL'); } catch (_) {} }, 3000);
  try { fs.rmSync(c.dir, { recursive: true, force: true }); } catch (_) {}
}

function start(id, spec) {
  stopCurrent('switch');
  const dir = path.join(OUT_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  const args = [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
    '-i', spec.url,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx265', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-threads', '2', '-tag:v', 'hvc1',
    '-b:v', '2500k', '-maxrate', '2800k', '-bufsize', '5000k',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    // One FFmpeg -> shared fMP4 for DASH + HLS.
    '-f', 'dash',
    '-seg_duration', '2', '-frag_duration', '2',
    '-window_size', '6', '-extra_window_size', '2',
    '-remove_at_exit', '0',
    '-hls_playlist', '1', '-hls_master_name', 'master.m3u8',
    '-init_seg_name', 'init-$RepresentationID$.m4s',
    '-media_seg_name', 'chunk-$RepresentationID$-$Number$.m4s',
    'manifest.mpd',
  ];
  const child = spawn('nice', ['-n', '19', 'ffmpeg', ...args], {
    cwd: dir,
    detached: false,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  current = { id, child, dir, lastAccess: Date.now(), started: Date.now() };
  log('START', id, 'pid=' + child.pid);
  child.stderr.on('data', d => {
    const s = String(d).trim();
    if (s) log('FFMPEG', s.slice(0, 300));
  });
  child.on('exit', (code, sig) => {
    log('EXIT', id, code, sig || '');
    if (current && current.child === child) current = null;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  });
}

function waitForFile(id, name, cb) {
  const file = path.join(OUT_ROOT, id, name);
  const t0 = Date.now();
  const tick = () => {
    if (fs.existsSync(file)) return cb(null, file);
    if (!current || current.id !== id) return cb(new Error('stream stopped'));
    if (Date.now() - t0 > WAIT_MS) return cb(new Error('startup timeout'));
    setTimeout(tick, 200);
  };
  tick();
}

function publicBase(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return proto + '://' + (req.headers.host || 'iptv-ape.duckdns.org') + '/jit';
}

function manifestJson(req, id) {
  const base = publicBase(req);
  const active = !!(current && current.id === id);
  return {
    version: '1.0', channel: id, status: active ? 'active' : 'inactive',
    formats: {
      hls: { url: base + '/live/' + id + '/master.m3u8', protocol: 'HLS', container: 'CMAF/fMP4' },
      dash: { url: base + '/live/' + id + '/manifest.mpd', protocol: 'DASH', container: 'CMAF/fMP4' },
    },
    streams: [{
      bandwidth: 2800000, average_bandwidth: 2600000, resolution: '1920x1080',
      codecs: 'hvc1.1.6.L120.B0,mp4a.40.2', uri: 'media_0.m3u8',
    }],
    clients_connected: active ? 1 : 0,
    active_since: active ? new Date(current.started).toISOString() : null,
    generated_at: new Date().toISOString(),
  };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/playlist.m3u8') {
    const f = path.join(path.dirname(MAP_FILE), 'APE_JIT_LIST.m3u8');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('playlist not built'); }
    res.writeHead(200, { 'Content-Type': MIME['.m3u8'], 'Cache-Control': 'no-store' });
    return fs.createReadStream(f).pipe(res);
  }
  if (u.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true, active: current ? current.id : null,
      pid: current ? current.child.pid : null,
      uptime_s: current ? Math.round((Date.now() - current.started) / 1000) : 0,
    }));
  }
  const jm = u.pathname.match(/^\/live\/([^/]+)\/manifest\.json$/);
  if (jm) {
    const id = safeId(jm[1]);
    if (!id) { res.writeHead(400); return res.end('bad channel'); }
    // Start on manifest request so a player that asks JSON first also warms.
    const map = loadMap();
    if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }
    if (!current || current.id !== id) start(id, map[id]);
    current.lastAccess = Date.now();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(manifestJson(req, id)));
  }
  const m = u.pathname.match(/^\/live\/([^/]+)\/(master\.m3u8|index\.m3u8|manifest\.mpd|media_[0-9]+\.m3u8|init-[0-9]+\.m4s|chunk-[0-9]+-[0-9]+\.m4s)$/);
  if (!m) { res.writeHead(404); return res.end('not found'); }
  const id = safeId(m[1]);
  if (!id) { res.writeHead(400); return res.end('bad channel'); }
  const map = loadMap();
  if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }
  if (!current || current.id !== id) start(id, map[id]);
  current.lastAccess = Date.now();

  let name = m[2];
  if (name === 'index.m3u8') name = 'media_0.m3u8';
  const waitName = (name === 'master.m3u8' || name === 'manifest.mpd' || name === 'media_0.m3u8') ? name : null;
  const serve = () => {
    const file = path.join(OUT_ROOT, id, name);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not ready'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  };
  if (waitName) return waitForFile(id, waitName, (err) => {
    if (err) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end(err.message); }
    serve();
  });
  serve();
});

setInterval(() => {
  if (current && Date.now() - current.lastAccess > IDLE_MS) stopCurrent('idle');
}, 5000);
process.on('SIGTERM', () => { stopCurrent('signal'); process.exit(0); });
process.on('SIGINT', () => { stopCurrent('signal'); process.exit(0); });

fs.mkdirSync(OUT_ROOT, { recursive: true });
server.listen(PORT, BIND, () => log('LISTEN', BIND + ':' + PORT, 'map=' + MAP_FILE));
