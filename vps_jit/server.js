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
const { spawn, execFileSync } = require('child_process');

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
function probeSource(spec) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name,color_transfer,color_primaries',
      '-of', 'json', spec.url,
    ], { encoding: 'utf8', timeout: 15000 });
    const s = (JSON.parse(out).streams || [])[0] || {};
    return {
      width: Number(s.width) || 0, height: Number(s.height) || 0,
      codec: s.codec_name || '', transfer: s.color_transfer || '',
      primaries: s.color_primaries || '',
    };
  } catch (e) {
    log('PROBE_ERROR', e.message);
    return { width: 0, height: 0, codec: '', transfer: '', primaries: '' };
  }
}
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
  const src = probeSource(spec);
  const copy4k = src.width >= 3840 && src.height >= 2160 &&
    (src.transfer === 'smpte2084' || src.transfer === 'arib-std-b67') &&
    (src.codec === 'hevc' || src.codec === 'h264');
  const dir = path.join(OUT_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });

  const videoArgs = copy4k
    ? ['-c:v', 'copy', '-tag:v', 'hvc1']
    : [
      '-vf', "scale=w='max(iw,1920)':h='max(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt2020:transfer=smpte2084:matrix=bt2020nc:primaries=bt2020,format=yuv420p10le",
      '-pix_fmt', 'yuv420p10le',
      '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc',
      '-c:v', 'libx265', '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-threads', '3', '-tag:v', 'hvc1',
      '-x265-params', 'pools=3:frame-threads=1:hdr10=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=100,100',
      '-b:v', '3000k', '-maxrate', '3300k', '-bufsize', '6000k',
    ];
  // EAC3 copy is rejected by the DASH muxer for this stream; keep 4K video
  // in copy and transcode ONLY audio to AAC.
  const audioArgs = copy4k
    ? ['-c:a', 'aac', '-b:a', '256k', '-ac', '2']
    : ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'];
  const args = [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
    '-i', spec.url,
    '-map', '0:v:0', '-map', '0:a:0?',
    ...videoArgs,
    ...audioArgs,
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
  current = {
    id, child, dir, lastAccess: Date.now(), started: Date.now(),
    copy4k,
    hdr: copy4k || src.transfer === 'smpte2084' || src.transfer === 'arib-std-b67',
    width: copy4k ? src.width : Math.max(1920, src.width || 0),
    height: copy4k ? src.height : Math.max(1080, src.height || 0),
    codecString: copy4k ? 'hvc1.2.4.L153.B0' : 'hvc1.2.4.L123.B0',
    audioCodec: 'mp4a.40.2',
    bandwidth: copy4k ? 20000000 : 3000000,
  };
  log('START', id, 'pid=' + child.pid, 'copy4k=' + copy4k, 'src=' + src.width + 'x' + src.height + '/' + src.transfer);
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

function hdrMaster(text) {
  const codec = current ? current.codecString : 'hvc1.2.4.L123.B0';
  const audio = current ? current.audioCodec : 'mp4a.40.2';
  return text
    .replace(/CODECS="[^"]*"/, 'CODECS="' + codec + ',' + audio + '"')
    .replace(/BANDWIDTH=\d+/, 'BANDWIDTH=' + (current ? current.bandwidth : 3000000))
    .replace(/\bAUDIO="/, current && current.hdr ? 'VIDEO-RANGE=PQ,AUDIO="' : 'AUDIO="');
}

function hdrMpd(text) {
  if (current && current.hdr && text.indexOf('cicp:ColourPrimaries') === -1) {
    const props = [
      '<SupplementalProperty schemeIdUri="urn:mpeg:mpegB:cicp:ColourPrimaries" value="9"/>',
      '<SupplementalProperty schemeIdUri="urn:mpeg:mpegB:cicp:TransferCharacteristics" value="16"/>',
      '<SupplementalProperty schemeIdUri="urn:mpeg:mpegB:cicp:MatrixCoefficients" value="9"/>',
    ].join('\n');
    text = text.replace(/(<AdaptationSet[^>]*contentType="video"[^>]*>)/, '$1\n' + props);
  }
  return text.replace(/codecs="hvc1"/g, 'codecs="' + (current ? current.codecString : 'hvc1.2.4.L123.B0') + '"');
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
      bandwidth: current ? current.bandwidth : 3000000,
      average_bandwidth: current ? Math.round(current.bandwidth * 0.9) : 2700000,
      resolution: current ? current.width + 'x' + current.height : '1920x1080',
      codecs: (current ? current.codecString : 'hvc1.2.4.L123.B0') + ',' +
        (current ? current.audioCodec : 'mp4a.40.2'),
      uri: 'media_0.m3u8',
      hdr: current && current.hdr ? 'HDR10' : 'SDR',
      video_range: current && current.hdr ? 'PQ' : 'SDR',
      color_primaries: current && current.hdr ? 'BT.2020' : 'BT.709',
      transfer: current && current.hdr ? 'SMPTE ST 2084' : 'BT.709',
      matrix: current && current.hdr ? 'BT.2020 non-constant' : 'BT.709',
      master_display: current && current.hdr
        ? 'G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)' : null,
      max_cll: current && current.hdr ? 1000 : null,
      max_fall: current && current.hdr ? 400 : null,
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
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    if (name === 'master.m3u8' || name === 'manifest.mpd') {
      const txt = fs.readFileSync(file, 'utf8');
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      return res.end(name === 'master.m3u8' ? hdrMaster(txt) : hdrMpd(txt));
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
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
