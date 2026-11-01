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

function setBaseHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, X-Requested-With, Content-Type, Accept, Accept-Encoding');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, ETag, Server-Timing');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Vary', '*');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=5, max=100');
  res.setHeader('X-Cache-Control', 'no-transform');
  res.setHeader('Surrogate-Control', 'no-store');
}

function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('ETag', 'W/"' + Date.now() + '-' + Math.random().toString(36).slice(2) + '"');
  res.setHeader('Server-Timing', 'cache;desc="no-store"');
}
function probeSource(spec) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name,color_transfer,color_primaries',
      '-of', 'json', spec.url,
    ], { encoding: 'utf8', timeout: 15000 });
    const s = (JSON.parse(out).streams || [])[0] || {};
    let audioOk = false, audioCodec = '';
    try {
      const aout = execFileSync('ffprobe', [
        '-v', 'error', '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
        '-select_streams', 'a:0',
        '-show_entries', 'stream=codec_name,channels,sample_rate',
        '-of', 'json', spec.url,
      ], { encoding: 'utf8', timeout: 15000 });
      const a = (JSON.parse(aout).streams || [])[0] || {};
      audioCodec = a.codec_name || '';
      audioOk = Number(a.channels) > 0 && Number(a.sample_rate) > 0;
    } catch (_) { }
    return {
      width: Number(s.width) || 0, height: Number(s.height) || 0,
      codec: s.codec_name || '', transfer: s.color_transfer || '',
      primaries: s.color_primaries || '',
      audioOk: audioOk, audioCodec: audioCodec,
    };
  } catch (e) {
    log('PROBE_ERROR', e.message);
    return { width: 0, height: 0, codec: '', transfer: '', primaries: '', audioOk: false, audioCodec: '' };
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

function start(id, spec, sdr, sdr720) {
  stopCurrent('switch');
  const src = probeSource(spec);
  const isSdr = !!(sdr || sdr720);
  const is720 = !!sdr720;
  const av1 = process.env.APE_SCHEME === 'av1' && !isSdr;
  const sixK = av1 && process.env.APE_6K === '1';
  const is4kSource = src.width >= 3840 && src.height >= 2160;
  const copy4k = !isSdr && is4kSource && (!av1 || !sixK) &&
    (src.transfer === 'smpte2084' || src.transfer === 'arib-std-b67') &&
    (src.codec === 'hevc' || src.codec === 'h264');
  const dir = path.join(OUT_ROOT, id, is720 ? 'sdr720' : (isSdr ? 'sdr' : ''));
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });

  const use2k = process.env.APE_2K === '1';
  const targetW = use2k ? 2048 : 1920;
  const targetH = 1080;
  const av1TargetW = is4kSource ? (sixK ? 6144 : 3840) : 2048;
  const av1TargetH = is4kSource ? (sixK ? 3456 : 2160) : 1080;
  const videoArgs = is720
    ? [
      '-vf', "scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited,format=yuv420p",
      '-pix_fmt', 'yuv420p',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
      '-profile:v', 'high', '-level:v', '4.0', '-tag:v', 'avc1',
      '-b:v', '2200k', '-maxrate', '2400k', '-bufsize', '4400k',
    ]
    : isSdr
    ? [
      '-vf', "scale=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited,format=yuv420p",
      '-pix_fmt', 'yuv420p',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
      '-profile:v', 'high', '-level:v', '4.2', '-tag:v', 'avc1',
      '-b:v', '4000k', '-maxrate', '4400k', '-bufsize', '8000k',
    ]
    : copy4k
    ? ['-c:v', 'copy', '-tag:v', 'hvc1']
    : av1
    ? [
      '-vf', `fps=30,scale=w=${av1TargetW}:h=${av1TargetH}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${av1TargetW}:${av1TargetH}:(ow-iw)/2:(oh-ih)/2,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited,zscale=t=smpte2084:p=bt2020:m=bt2020nc:r=limited,format=yuv420p10le`,
      '-pix_fmt', 'yuv420p10le',
      '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc',
      '-c:v', 'libsvtav1', '-preset', '13', '-crf', '30', '-g', '48',
      '-pix_fmt', 'yuv420p10le',
    ]
    : [
      '-vf', (use2k ? 'fps=30,' : '') + `scale=w=${targetW}:h=${targetH}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt2020:transfer=smpte2084:matrix=bt2020nc:primaries=bt2020,format=yuv420p10le`,
      '-pix_fmt', 'yuv420p10le',
      '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc',
      '-c:v', 'libx265', '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-threads', '3', '-tag:v', 'hvc1',
      '-x265-params', 'pools=3:frame-threads=1:hdr10=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=100,100',
      '-b:v', use2k ? '5000k' : '3000k', '-maxrate', use2k ? '5500k' : '3300k', '-bufsize', use2k ? '10000k' : '6000k',
    ];
  // Some 4K provider audio is EAC3 with 0 channels / no sample rate.
  // Do not break the video MPD: if audio is invalid, emit video-only.
  const audioArgs = isSdr
    ? (src.audioOk ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an'])
    : copy4k
    ? (src.audioOk ? ['-c:a', 'aac', '-b:a', '256k', '-ac', '2'] : ['-an'])
    : ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'];
  const hasAudio = isSdr ? src.audioOk : !(copy4k && !src.audioOk);
  const args = [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
    '-i', spec.url,
    '-map', '0:v:0', '-map', '0:a:0?',
    ...videoArgs,
    ...audioArgs,
    '-max_muxing_queue_size', '8192',
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
  const outWidth = is720 ? 1280 : (isSdr ? 1920 : (copy4k ? src.width : (av1 ? av1TargetW : targetW)));
  const outHeight = is720 ? 720 : (isSdr ? 1080 : (copy4k ? src.height : (av1 ? av1TargetH : targetH)));
  const upscaled = !copy4k && ((src.width || 0) < outWidth || (src.height || 0) < outHeight);
  current = {
    id, sdr: isSdr, sdr720: is720, child, dir, lastAccess: Date.now(), started: Date.now(),
    copy4k,
    hdr: !isSdr && (copy4k || src.transfer === 'smpte2084' || src.transfer === 'arib-std-b67'),
    sourceWidth: src.width || 0,
    sourceHeight: src.height || 0,
    width: outWidth,
    height: outHeight,
    upscaled,
    codecString: isSdr ? 'avc1.640028' : (av1 ? (sixK ? 'av01.0.16M.10' : 'av01.0.08M.10') : (use2k ? 'hvc1.2.4.L153.B0' : 'hvc1.2.4.L123.B0')),
    audioCodec: hasAudio ? 'mp4a.40.2' : '',
    bandwidth: is720 ? 2400000 : (isSdr ? 4500000 : (copy4k ? 20000000 : (av1 ? (sixK ? 25000000 : 5500000) : (use2k ? 5500000 : 3000000)))),
    crystal: true,
    use2k,
    av1,
    sixK,
    crystalMode: copy4k ? 'NATIVE_4K_HDR' : (av1 ? (sixK ? 'CRYSTAL_6K_AV1' : 'CRYSTAL_2K_AV1') : (upscaled ? (use2k ? 'CRYSTAL_2K_HDR_UPSCALE' : 'CRYSTAL_UHD_UPSCALE') : (is720 ? 'SDR720_STABLE' : (isSdr ? 'FHD_SDR' : 'FHD_HDR10')))),
  };
  log('START', id, 'pid=' + child.pid, 'sdr=' + isSdr, 'sdr720=' + is720, 'copy4k=' + copy4k, 'crystal=' + current.crystalMode, 'src=' + src.width + 'x' + src.height + '/' + src.transfer + '->' + outWidth + 'x' + outHeight);
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

function waitForFile(id, name, cb, sdr, sdr720) {
  const file = path.join(OUT_ROOT, id, sdr720 ? 'sdr720' : (sdr ? 'sdr' : ''), name);
  const t0 = Date.now();
  const tick = () => {
    if (fs.existsSync(file)) return cb(null, file);
    if (!current || current.id !== id || !!current.sdr720 !== !!sdr720 || !!current.sdr !== !!sdr) return cb(new Error('stream stopped'));
    if (Date.now() - t0 > WAIT_MS) return cb(new Error('startup timeout'));
    setTimeout(tick, 200);
  };
  tick();
}

function hdrMaster(text) {
  const codec = current ? current.codecString : 'hvc1.2.4.L123.B0';
  const audio = current ? current.audioCodec : 'mp4a.40.2';
  const mode = current ? current.crystalMode : 'FHD_HDR10';
  if (text.indexOf('#EXT-X-APE-CRYSTAL-UHD') === -1) {
    const up = current && current.upscaled
      ? '\n#EXT-X-APE-CRYSTAL-UPSCALE:SOURCE=' + current.sourceWidth + 'x' + current.sourceHeight +
        ';TARGET=' + current.width + 'x' + current.height + ';FILTER=LANCZOS'
      : '\n#EXT-X-APE-CRYSTAL-UPSCALE:NATIVE';
    text = text.replace('#EXTM3U',
      '#EXTM3U\n' +
      '#EXT-X-APE-CRYSTAL-UHD:ENABLED=true\n' +
      '#EXT-X-APE-CRYSTAL-MODE:' + mode + up + '\n' +
      '#EXT-X-APE-CRYSTAL-POLICY:MAX_IMAGE_FIRST');
  }
  return text
    .replace(/CODECS="[^"]*"/, 'CODECS="' + codec + (audio ? ',' + audio : '') + '"')
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
  if (current && text.indexOf('urn:ape:crystal:uhd') === -1) {
    const crystal = '<SupplementalProperty schemeIdUri="urn:ape:crystal:uhd" value="' +
      (current.crystalMode || 'FHD_HDR10') + '"/>';
    text = text.replace(/(<AdaptationSet[^>]*contentType="video"[^>]*>)/, '$1\n' + crystal);
  }
  return text.replace(/codecs="hvc1"/g, 'codecs="' + (current ? current.codecString : 'hvc1.2.4.L123.B0') + '"');
}

function sendStatic(req, res, file, type) {
  const stat = fs.statSync(file);
  const size = stat.size;
  const range = req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', type);
  setNoCacheHeaders(res);
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (!m) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size });
      return res.end();
    }
    let start = m[1] === '' ? null : Number(m[1]);
    let end = m[2] === '' ? null : Number(m[2]);
    if (start === null && end === null) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size });
      return res.end();
    }
    if (start === null) { start = Math.max(0, size - end); end = size - 1; }
    else if (end === null || end >= size) end = size - 1;
    if (start < 0 || start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
      'Content-Length': end - start + 1,
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function publicBase(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return proto + '://' + (req.headers.host || 'iptv-ape.duckdns.org') + '/jit';
}

function manifestJson(req, id, sdr, sdr720) {
  const base = publicBase(req);
  const prefix = '/live/' + id + (sdr720 ? '/sdr720' : (sdr ? '/sdr' : ''));
  const active = !!(current && current.id === id && !!current.sdr === !!sdr && !!current.sdr720 === !!sdr720);
  return {
    version: '1.0', channel: id, status: active ? 'active' : 'inactive', variant: sdr720 ? 'sdr720' : (sdr ? 'sdr' : 'hdr'),
    crystal_uhd: {
      enabled: true,
      mode: current ? current.crystalMode : 'FHD_HDR10',
      policy: 'MAX_IMAGE_FIRST',
      source_resolution: current ? current.sourceWidth + 'x' + current.sourceHeight : null,
      output_resolution: current ? current.width + 'x' + current.height : null,
      upscaled: !!(current && current.upscaled),
      upscale_filter: current && current.upscaled ? 'LANCZOS' : null,
      note: 'metadata/profile; 4K pixels only on native 4K HDR passthrough',
    },
    formats: {
      hls: { url: base + prefix + '/master.m3u8', protocol: 'HLS', container: 'CMAF/fMP4' },
      dash: { url: base + prefix + '/manifest.mpd', protocol: 'DASH', container: 'CMAF/fMP4' },
    },
    streams: [{
      bandwidth: current ? current.bandwidth : 3000000,
      average_bandwidth: current ? Math.round(current.bandwidth * 0.9) : 2700000,
      resolution: current ? current.width + 'x' + current.height : '1920x1080',
      codecs: (current ? current.codecString : 'hvc1.2.4.L123.B0') +
        (current && current.audioCodec ? ',' + current.audioCodec : ''),
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
  setBaseHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/playlist.m3u8') {
    const f = path.join(path.dirname(MAP_FILE), 'APE_JIT_LIST.m3u8');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('playlist not built'); }
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': MIME['.m3u8'] });
    return fs.createReadStream(f).pipe(res);
  }
  if (u.pathname === '/capabilities.json') {
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      service: 'ape-jit-cmaf',
      transports: ['vps-list', 'provider-direct'],
      formats: ['HLS', 'DASH', 'CMAF/fMP4'],
      codecs: ['HEVC Main10', 'AAC'],
      hdr: ['SDR', 'HDR10 (BT.2020/PQ)'],
      resolutions: { '4k': '3840x2160 passthrough', 'hd': '1920x1080 HDR10' },
      crystal_uhd: {
        enabled: true,
        applies_to: 'all JIT channels',
        modes: ['NATIVE_4K_HDR', 'CRYSTAL_2K_HDR_UPSCALE', 'CRYSTAL_2K_AV1', 'CRYSTAL_6K_AV1', 'FHD_HDR10', 'FHD_SDR', 'SDR720_STABLE'],
        note: 'policy/metadata; no fake 4K pixels',
      },
      limits: { concurrent_channels: 1, idle_stop_s: Math.round(IDLE_MS / 1000) },
      active: current ? current.id : null,
    }));
  }
  if (u.pathname === '/crystal.json') {
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      policy: 'APE_CRYSTAL_UHD',
      enabled: true,
      applies_to: 'all JIT channels',
      active_channel: current ? current.id : null,
      active_mode: current ? current.crystalMode : null,
      modes: {
        NATIVE_4K_HDR: 'native 3840x2160 HEVC Main10 HDR10 passthrough',
        CRYSTAL_2K_HDR_UPSCALE: 'HEVC Main10 2048x1080 HDR10, Lanczos upscale from <=1080p',
        CRYSTAL_2K_AV1: 'SVT-AV1 2048x1080 HDR10, opt-in APE_SCHEME=av1',
        CRYSTAL_6K_AV1: 'SVT-AV1 6144x3456 HDR10, opt-in APE_6K=1; not real-time on 3 vCPU',
        FHD_HDR10: 'HEVC Main10 1920x1080 HDR10, zscale SDR->PQ',
        FHD_SDR: 'H.264 1920x1080 SDR fallback for incompatible decoders',
        SDR720_STABLE: 'H.264 1280x720 SDR continuity fallback',
      },
      truth_guard: 'VPS selects/signals; device applies AI-SR/AI-PQ. No fake 4K pixels.',
    }));
  }
  if (u.pathname === '/catalog.json') {
    const map = loadMap();
    const base = publicBase(req);
    const channels = Object.keys(map).map(function (id) {
      return {
        id: id,
        hls: base + '/live/' + id + '/master.m3u8',
        dash: base + '/live/' + id + '/manifest.mpd',
        json: base + '/live/' + id + '/manifest.json',
        active: !!(current && current.id === id),
      };
    });
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ service: 'ape-jit-cmaf', count: channels.length, channels: channels }));
  }
  const gm = u.pathname.match(/^\/go\/([^/]+)\/?$/);
  if (gm) {
    const id = safeId(gm[1]);
    if (!id) { res.writeHead(400); return res.end('bad channel'); }
    const map = loadMap();
    if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }
    setNoCacheHeaders(res);
    res.writeHead(302, {
      'Location': publicBase(req) + '/live/' + id + '/master.m3u8',
      'Cache-Control': 'no-store',
    });
    return res.end();
  }
  if (u.pathname === '/health') {
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true, active: current ? current.id : null,
      pid: current ? current.child.pid : null,
      uptime_s: current ? Math.round((Date.now() - current.started) / 1000) : 0,
    }));
  }
  const jm = u.pathname.match(/^\/live\/([^/]+)\/(sdr720\/|sdr\/)?manifest\.json$/);
  if (jm) {
    const id = safeId(jm[1]);
    if (!id) { res.writeHead(400); return res.end('bad channel'); }
    const sdr720 = jm[2] === 'sdr720/';
    const sdr = !sdr720 && jm[2] === 'sdr/';
    // Start on manifest request so a player that asks JSON first also warms.
    const map = loadMap();
    if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }
    if (!current || current.id !== id || !!current.sdr !== sdr || !!current.sdr720 !== sdr720) start(id, map[id], sdr, sdr720);
    current.lastAccess = Date.now();
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(manifestJson(req, id, sdr, sdr720)));
  }
  const m = u.pathname.match(/^\/live\/([^/]+)\/(sdr720\/|sdr\/)?(master\.m3u8|index\.m3u8|manifest\.mpd|media_[0-9]+\.m3u8|init-[0-9]+\.m4s|chunk-[0-9]+-[0-9]+\.m4s)$/);
  if (!m) { res.writeHead(404); return res.end('not found'); }
  const id = safeId(m[1]);
  if (!id) { res.writeHead(400); return res.end('bad channel'); }
  const sdr720 = m[2] === 'sdr720/';
  const sdr = !sdr720 && m[2] === 'sdr/';
  const map = loadMap();
  if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }
  if (!current || current.id !== id || !!current.sdr !== sdr || !!current.sdr720 !== sdr720) start(id, map[id], sdr, sdr720);
  current.lastAccess = Date.now();

  let name = m[3];
  if (name === 'index.m3u8') name = 'media_0.m3u8';
  const waitName = (name === 'master.m3u8' || name === 'manifest.mpd' || name === 'media_0.m3u8') ? name : null;
  const serve = () => {
    const file = path.join(OUT_ROOT, id, sdr720 ? 'sdr720' : (sdr ? 'sdr' : ''), name);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not ready'); }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    if (name === 'master.m3u8' || name === 'manifest.mpd') {
      const txt = fs.readFileSync(file, 'utf8');
      setNoCacheHeaders(res);
      res.writeHead(200, { 'Content-Type': type });
      return res.end(name === 'master.m3u8' ? hdrMaster(txt) : hdrMpd(txt));
    }
    sendStatic(req, res, file, type);
  };
  if (waitName) return waitForFile(id, waitName, (err) => {
    if (err) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end(err.message); }
    serve();
  }, sdr, sdr720);
  serve();
});

setInterval(() => {
  if (current && Date.now() - current.lastAccess > IDLE_MS) stopCurrent('idle');
}, 5000);
process.on('SIGTERM', () => { stopCurrent('signal'); process.exit(0); });
process.on('SIGINT', () => { stopCurrent('signal'); process.exit(0); });

fs.mkdirSync(OUT_ROOT, { recursive: true });
server.listen(PORT, BIND, () => log('LISTEN', BIND + ':' + PORT, 'map=' + MAP_FILE));









