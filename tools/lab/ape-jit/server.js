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
const { spawn, execFile, execFileSync } = require('child_process');

const PORT = Number(process.env.PORT || 3099);
const BIND = process.env.BIND || '127.0.0.1';
const MAP_FILE = process.env.MAP_FILE || '/opt/ape-jit/channels.json';
const OUT_ROOT = process.env.OUT_ROOT || '/dev/shm/ape-jit';
const IDLE_MS = Number(process.env.IDLE_MS || 20000);

/* ═══════════════════════════════════════════════════════════════════════════
 * MODULO DE IMAGEN — configuracion en caliente
 *
 * Permite que la UI de IPTV Navigator cambie la receta de imagen del JIT sin
 * desplegar ni reiniciar: POST /image/config escribe el JSON y el plan de
 * encoding se reconstruye en el siguiente start(). Un job ya en marcha NO se
 * toca a medias; se aplica al siguiente arranque (asi no se mezclan recetas
 * dentro de la misma salida).
 *
 * CAPACIDAD MEDIDA en este VPS (3 vCPU AMD EPYC-Rome, 20 s de testsrc2):
 *   2560x1440 hqdn3d+unsharp  ->  46,94 s  = 0,43x tiempo real
 *   3840x2160 hqdn3d+unsharp  ->  80,95 s  = 0,25x tiempo real
 * Con esos numeros, QHD y UHD NO son viables en directo con filtros en CPU.
 * La UI debe mostrarlo antes de dejar elegirlos.
 * ═══════════════════════════════════════════════════════════════════════════ */

const IMAGE_CONFIG_FILE = process.env.IMAGE_CONFIG_FILE || '/opt/ape-jit/image-config.json';

const IMAGE_DEFAULTS = {
  // ── destino ──
  //  source     : conserva dimensiones de la fuente (sin escala si ya cumple)
  //  FHD_1080   : 1920x1080
  //  QHD_1440   : 2560x1440   (llamado "2K" en la ruta REA)
  //  UHD_4K     : 3840x2160
  //  DCI_2K     : 2048x1080   (cine, NO sustituye QHD)
  target: 'source',
  allow_downscale: false,      // false = nunca reducir por debajo de la fuente

  // ── receta de filtros ──
  //  none | light | balanced | temporal | custom
  recipe: 'none',
  // parametros vivos (solo se usan si recipe='custom' o como ajuste de receta)
  hqdn3d:  { luma_spatial: 0.6, chroma_spatial: 0.45, luma_tmp: 0.9, chroma_tmp: 0.7 },
  unsharp: { luma_msize: 5, luma_amount: 0.20 },
  atadenoise: { s: 5, a: 0.010, b: 0.020 },
  filter_order: 'denoise_then_sharpen',   // denoise_then_sharpen | sharpen_only

  // ── encoder ──
  codec: 'libx265',            // libx265 | libx264 | libsvtav1
  preset: 'ultrafast',
  crf: 20,
  bitrate_mode: 'crf',         // crf | abr
  bitrate: '3000k',
  maxrate: '3300k',
  bufsize: '6000k',
  x265_threads: 3,

  // ── cadencia y sincronia ──
  fps: 'preserve',             // preserve | 25 | 30 | 50 | 60
  fps_mode: 'passthrough',     // passthrough | cfr

  // ── color ──
  color: 'preserve',           // preserve | sdr | pq
  ten_bit: true,

  // ── audio ──
  audio: 'preserve',           // preserve | aac | drop
  audio_bitrate: '128k',

  // ── empaquetado ──
  seg_duration: 2,
  frag_duration: 2,
  window_size: 30,
  extra_window_size: 10,
  gop_seconds: 2,
  closed_gop: true
};

// Tope duro de seguridad: nunca permitir que una config absurda tumbe el motor.
const IMAGE_LIMITS = {
  crf: [0, 51],
  seg_duration: [1, 10],
  frag_duration: [1, 10],
  window_size: [3, 120],
  extra_window_size: [0, 60],
  gop_seconds: [1, 10],
  x265_threads: [1, 8],
  bitrate: null,
  targets: ['source', 'FHD_1080', 'QHD_1440', 'UHD_4K', 'DCI_2K'],
  recipes: ['none', 'light', 'balanced', 'temporal', 'custom'],
  codecs: ['libx265', 'libx264', 'libsvtav1'],
  presets: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'],
  fps: ['preserve', '25', '30', '50', '60'],
  audio: ['preserve', 'aac', 'drop']
};

// Dimensiones por destino. DCI_2K es cine (1,90:1) y NO sustituye a QHD.
const IMAGE_TARGETS = {
  source: null,
  FHD_1080: { w: 1920, h: 1080 },
  QHD_1440: { w: 2560, h: 1440 },
  UHD_4K:   { w: 3840, h: 2160 },
  DCI_2K:   { w: 2048, h: 1080 }
};

let imageConfig = JSON.parse(JSON.stringify(IMAGE_DEFAULTS));
let imageConfigSource = 'defaults';

function loadImageConfig() {
  try {
    if (fs.existsSync(IMAGE_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(IMAGE_CONFIG_FILE, 'utf8'));
      imageConfig = Object.assign({}, IMAGE_DEFAULTS, raw);
      imageConfigSource = IMAGE_CONFIG_FILE;
      log('IMAGE_CONFIG_LOADED', IMAGE_CONFIG_FILE);
    }
  } catch (e) {
    log('IMAGE_CONFIG_LOAD_FAILED', e.message, '-> usando defaults');
    imageConfig = JSON.parse(JSON.stringify(IMAGE_DEFAULTS));
    imageConfigSource = 'defaults';
  }
}

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
function pick(v, allowed, fallback) {
  return allowed.includes(String(v)) ? String(v) : fallback;
}

/* Valida y normaliza una config recibida. Devuelve {ok, config, errors[]}. */
function normalizeImageConfig(patch) {
  const errors = [];
  const c = Object.assign({}, imageConfig);
  const p = patch || {};

  if (p.target !== undefined) {
    c.target = pick(p.target, IMAGE_LIMITS.targets, c.target);
    if (c.target !== String(p.target)) errors.push('target invalido: ' + p.target);
  }
  if (p.recipe !== undefined) {
    c.recipe = pick(p.recipe, IMAGE_LIMITS.recipes, c.recipe);
    if (c.recipe !== String(p.recipe)) errors.push('recipe invalida: ' + p.recipe);
  }
  if (p.codec !== undefined) {
    c.codec = pick(p.codec, IMAGE_LIMITS.codecs, c.codec);
    if (c.codec !== String(p.codec)) errors.push('codec invalido: ' + p.codec);
  }
  if (p.preset !== undefined) {
    c.preset = pick(p.preset, IMAGE_LIMITS.presets, c.preset);
    if (c.preset !== String(p.preset)) errors.push('preset invalido: ' + p.preset);
  }
  if (p.fps !== undefined) {
    c.fps = pick(p.fps, IMAGE_LIMITS.fps, c.fps);
    if (c.fps !== String(p.fps)) errors.push('fps invalido: ' + p.fps);
  }
  if (p.audio !== undefined) {
    c.audio = pick(p.audio, IMAGE_LIMITS.audio, c.audio);
    if (c.audio !== String(p.audio)) errors.push('audio invalido: ' + p.audio);
  }

  if (p.crf !== undefined) c.crf = clampInt(p.crf, 0, 51, c.crf);
  if (p.seg_duration !== undefined) c.seg_duration = clampInt(p.seg_duration, 1, 10, c.seg_duration);
  if (p.frag_duration !== undefined) c.frag_duration = clampInt(p.frag_duration, 1, 10, c.frag_duration);
  if (p.window_size !== undefined) c.window_size = clampInt(p.window_size, 3, 120, c.window_size);
  if (p.extra_window_size !== undefined) c.extra_window_size = clampInt(p.extra_window_size, 0, 60, c.extra_window_size);
  if (p.gop_seconds !== undefined) c.gop_seconds = clampInt(p.gop_seconds, 1, 10, c.gop_seconds);
  if (p.x265_threads !== undefined) c.x265_threads = clampInt(p.x265_threads, 1, 8, c.x265_threads);
  if (p.allow_downscale !== undefined) c.allow_downscale = !!p.allow_downscale;
  if (p.ten_bit !== undefined) c.ten_bit = !!p.ten_bit;
  if (p.closed_gop !== undefined) c.closed_gop = !!p.closed_gop;
  if (p.filter_order !== undefined) {
    c.filter_order = pick(p.filter_order, ['denoise_then_sharpen', 'sharpen_only'], c.filter_order);
  }
  if (p.bitrate !== undefined) c.bitrate = String(p.bitrate);
  if (p.maxrate !== undefined) c.maxrate = String(p.maxrate);
  if (p.bufsize !== undefined) c.bufsize = String(p.bufsize);
  if (p.audio_bitrate !== undefined) c.audio_bitrate = String(p.audio_bitrate);
  if (p.fps_mode !== undefined) c.fps_mode = pick(p.fps_mode, ['passthrough', 'cfr'], c.fps_mode);

  if (p.hqdn3d && typeof p.hqdn3d === 'object') {
    c.hqdn3d = {
      luma_spatial: clampNum(p.hqdn3d.luma_spatial, 0, 20, c.hqdn3d.luma_spatial),
      chroma_spatial: clampNum(p.hqdn3d.chroma_spatial, 0, 20, c.hqdn3d.chroma_spatial),
      luma_tmp: clampNum(p.hqdn3d.luma_tmp, 0, 20, c.hqdn3d.luma_tmp),
      chroma_tmp: clampNum(p.hqdn3d.chroma_tmp, 0, 20, c.hqdn3d.chroma_tmp)
    };
  }
  if (p.unsharp && typeof p.unsharp === 'object') {
    c.unsharp = {
      luma_msize: clampInt(p.unsharp.luma_msize, 3, 13, c.unsharp.luma_msize),
      luma_amount: clampNum(p.unsharp.luma_amount, -2, 5, c.unsharp.luma_amount)
    };
    if (c.unsharp.luma_msize % 2 === 0) c.unsharp.luma_msize += 1; // msize debe ser impar
  }
  if (p.atadenoise && typeof p.atadenoise === 'object') {
    c.atadenoise = {
      s: clampInt(p.atadenoise.s, 0, 15, c.atadenoise.s),
      a: clampNum(p.atadenoise.a, 0, 1, c.atadenoise.a),
      b: clampNum(p.atadenoise.b, 0, 1, c.atadenoise.b)
    };
  }
  return { ok: errors.length === 0, config: c, errors };
}

/* Construye la cadena -vf segun la receta. Devuelve '' si recipe='none'. */
function buildImageFilterChain(cfg) {
  const r = cfg.recipe;
  if (r === 'none') return '';
  const u = cfg.unsharp;
  const sharpen = 'unsharp=' + u.luma_msize + ':' + u.luma_msize + ':' + u.luma_amount
    + ':' + u.luma_msize + ':' + u.luma_msize + ':0';
  if (r === 'light') return sharpen;
  const h = cfg.hqdn3d;
  const denoise = 'hqdn3d=' + h.luma_spatial + ':' + h.chroma_spatial + ':'
    + h.luma_tmp + ':' + h.chroma_tmp;
  if (r === 'balanced') {
    return cfg.filter_order === 'sharpen_only' ? sharpen : denoise + ',' + sharpen;
  }
  if (r === 'temporal') {
    const a = cfg.atadenoise;
    // a/b son el limite inferior; el rango efectivo es asimetrico (a..b) por plano
    const ata = 'atadenoise=0a=' + a.a + ':0b=' + a.b
      + ':1a=' + (a.a * 1.5) + ':1b=' + (a.b * 1.5)
      + ':2a=' + (a.a * 1.5) + ':2b=' + (a.b * 1.5) + ':s=' + a.s;
    return ata + ',' + sharpen;
  }
  if (r === 'custom') {
    const parts = [];
    if (cfg.filter_order !== 'sharpen_only') parts.push(denoise);
    parts.push(sharpen);
    return parts.join(',');
  }
  return '';
}

/* Capacidad medida en ESTE VPS. La UI la muestra para no ofrecer imposibles. */
const IMAGE_MEASURED_CAPACITY = {
  measured_at: '2026-11-08',
  host: '3 vCPU AMD EPYC-Rome, 3 GB',
  source: 'testsrc2 20 s, libx265 ultrafast, hqdn3d+unsharp, -an',
  rows: [
    { target: 'FHD_1080', recipe: 'balanced', seconds_for_20s: null, realtime_ratio: null, note: 'no medido' },
    { target: 'QHD_1440', recipe: 'balanced', seconds_for_20s: 46.94, realtime_ratio: 0.43, viable: false },
    { target: 'UHD_4K',   recipe: 'balanced', seconds_for_20s: 80.95, realtime_ratio: 0.25, viable: false }
  ],
  verdict: 'QHD y UHD NO son viables en directo con filtros en CPU en este host. '
         + 'Margen exigido 1,2x tiempo real; medido 0,43x a 1440p y 0,25x a 2160p.'
};

loadImageConfig();

// HARDENING: 15 s no siempre alcanza para el primer chunk (probe + ffmpeg +
// primer GOP). El 503 'startup timeout' se veia como canal caido. 30 s.
const WAIT_MS = Number(process.env.WAIT_MS || 30000);
const PROCESSING_DOMAIN = 'vps_jit_legacy';
const REA_POLICY_REF = 'contracts/rea/rea-processing-v1.json';

let current = null;
const MIME = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.mpd': 'application/dash+xml',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
};
function log(...a) { console.log(new Date().toISOString(), ...a); }
function redactUpstreamUrls(message) { return String(message).replace(/https?:\/\/[^\s"'<>]+/gi, '[upstream-url]'); }

function setBaseHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, X-Requested-With, Content-Type, Accept, Accept-Encoding');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, ETag, Server-Timing');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Timing-Allow-Origin', '*');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=5, max=100');
  res.setHeader('X-Cache-Control', 'no-transform');
  res.setHeader('Surrogate-Control', 'no-store');
}

function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function cachePolicy(kind) {
  if (kind === 'master' || kind === 'mpd') {
    return 'public, max-age=5, stale-while-revalidate=60, stale-if-error=600';
  }
  if (kind === 'media') {
    return 'public, max-age=2, stale-while-revalidate=10, stale-if-error=30';
  }
  if (kind === 'init' || kind === 'seg') {
    return 'public, max-age=31536000, immutable';
  }
  if (kind === 'redirect') {
    return 'private, max-age=10';
  }
  return 'no-cache, no-store, must-revalidate, private, max-age=0';
}

function setObjectCacheHeaders(res, kind) {
  const policy = cachePolicy(kind);
  res.setHeader('Cache-Control', policy);
  if (kind === 'master' || kind === 'mpd') {
    res.setHeader('Vary', 'Accept-Encoding');
  }
  if (kind === 'init' || kind === 'seg') {
    res.setHeader('CDN-Cache-Control', policy);
  }
}

function installTiming(req, res) {
  const t0 = process.hrtime.bigint();
  let stamped = false;
  res.locals = res.locals || {};
  const stamp = () => {
    if (stamped) return;
    stamped = true;
    const ttfb = Number(process.hrtime.bigint() - t0) / 1e6;
    res.setHeader('Server-Timing',
      'ttfb;dur=' + ttfb.toFixed(1) +
      ', cache;desc="' + String(res.locals.cache || 'miss') + '"');
  };
  const origWriteHead = res.writeHead.bind(res);
  const origEnd = res.end.bind(res);
  res.writeHead = function () {
    stamp();
    return origWriteHead.apply(res, arguments);
  };
  res.end = function () {
    stamp();
    return origEnd.apply(res, arguments);
  };
}

function fileETag(stat) {
  return 'W/"' + stat.size + '-' + Math.floor(stat.mtimeMs) + '"';
}

function isFresh(req, etag) {
  const inm = req.headers['if-none-match'];
  return !!inm && String(inm).split(',').some(function (v) { return v.trim() === etag; });
}
function probeSource(spec) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name,color_transfer,color_primaries,color_space,color_range',
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
      primaries: s.color_primaries || '', matrix: s.color_space || '', range: s.color_range || '',
      audioOk: audioOk, audioCodec: audioCodec,
    };
  } catch (e) {
    // execFileSync errors contain the full command, including provider tokens.
    log('PROBE_ERROR', e.code || 'probe_failed');
    return { width: 0, height: 0, codec: '', transfer: '', primaries: '', audioOk: false, audioCodec: '' };
  }
}

function videoRange(transfer) {
  if (transfer === 'smpte2084') return 'PQ';
  if (transfer === 'arib-std-b67') return 'HLG';
  return ['bt709', 'smpte170m', 'smpte240m', 'gamma22', 'gamma28', 'iec61966-2-1',
    'iec61966-2-4', 'bt1361e', 'bt2020-10', 'bt2020-12'].includes(transfer) ? 'SDR' : null;
}

/** The real encoder argument plan; no inferred source codec strings or levels. */
function buildEncodingPlan(src, options = {}) {
  const env = options.env || process.env;
  const isSdr = !!(options.sdr || options.sdr720), is720 = !!options.sdr720;
  const use2k = env.APE_2K === '1', av1Requested = env.APE_SCHEME === 'av1' && !isSdr;
  const is4kSource = src.width >= 3840 && src.height >= 2160;
  const sourceRange = videoRange(src.transfer);
  const known709 = sourceRange === 'SDR' && src.primaries === 'bt709'
    && src.transfer === 'bt709' && src.matrix === 'bt709' && ['tv', 'pc'].includes(src.range);
  const knownHdr = ['PQ', 'HLG'].includes(sourceRange) && src.primaries === 'bt2020'
    && src.matrix === 'bt2020nc' && ['tv', 'pc'].includes(src.range);
  const sixK = av1Requested && env.APE_6K === '1' && is4kSource
    && src.width <= 6144 && src.height <= 3456 && (src.width < 6144 || src.height < 3456)
    && (known709 || knownHdr);
  // ── destino resuelto por el MODULO DE IMAGEN ────────────────────────────────
  // La config en caliente decide el destino. Si target='source' se conserva el
  // comportamiento historico (1280/1920/2048 x 720/1080) para no romper nada.
  const cfg = options.imageConfig || imageConfig;
  const requestedTarget = IMAGE_TARGETS[cfg.target] || null;
  let targetW, targetH;
  if (requestedTarget) {
    targetW = requestedTarget.w; targetH = requestedTarget.h;
  } else {
    targetW = is720 ? 1280 : (isSdr ? 1920 : (av1Requested || use2k ? 2048 : 1920));
    targetH = is720 ? 720 : 1080;
  }
  // allow_downscale=false impide que un destino menor reduzca la fuente.
  if (!cfg.allow_downscale && src.width > 0 && src.height > 0
      && (targetW < src.width || targetH < src.height) && requestedTarget) {
    targetW = src.width; targetH = src.height;
  }
  if (isSdr && (sourceRange !== 'SDR' || !known709 || src.width > targetW || src.height > targetH)) {
    throw new Error('SOURCE_PRESERVATION_REQUIRED: SDR route would reduce or relabel the source; use native/provider-direct');
  }
  // Native HDR is retained even below 4K. Unknown color is never assumed BT.709.
  // 4K SDR and dimensions larger than the legacy target must not fall to FHD.
  const copyNative = !isSdr && !sixK && (is4kSource || sourceRange === 'PQ' || sourceRange === 'HLG'
    || !known709 || src.width > targetW || src.height > targetH);
  if (copyNative && !['hevc', 'h264', 'av1', 'vp9'].includes(src.codec)) {
    throw new Error('UNSUPPORTED_NATIVE_CMAF_CODEC: source retained; use provider-direct');
  }
  const av1 = av1Requested && !copyNative;
  const width = copyNative ? src.width : (sixK ? 6144 : targetW);
  const height = copyNative ? src.height : (sixK ? 3456 : targetH);
  const hdrPreserved = sixK && knownHdr;
  const outputColorIntent = copyNative || hdrPreserved
    ? { transfer: src.transfer, primaries: src.primaries, matrix: src.matrix, range: src.range }
    : isSdr ? { transfer: 'bt709', primaries: 'bt709', matrix: 'bt709', range: 'tv' }
      : { transfer: 'smpte2084', primaries: 'bt2020', matrix: 'bt2020nc', range: 'tv' };
  const colorArgs = ['-color_primaries', outputColorIntent.primaries, '-color_trc', outputColorIntent.transfer,
    '-colorspace', outputColorIntent.matrix, '-color_range', outputColorIntent.range];
  const imageFilters = buildImageFilterChain(cfg);
  const pixelFmt = cfg.ten_bit ? 'format=yuv420p10le' : 'format=yuv420p';
  const head = imageFilters ? (pixelFmt + ',' + imageFilters + ',') : '';
  const geometry = head + `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
  // setparams only relabels pixels. zscale performs the actual known-SDR -> PQ conversion.
  const hdrFilter = geometry + (hdrPreserved ? ',format=yuv420p10le'
    : ',zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt2020:t=smpte2084:m=bt2020nc:r=limited,format=yuv420p10le');
  let videoArgs;
  if (copyNative) {
    videoArgs = ['-c:v', 'copy'];
    if (src.codec === 'hevc') videoArgs.push('-tag:v', 'hvc1');
    else if (src.codec === 'h264') videoArgs.push('-tag:v', 'avc1');
  } else if (isSdr) {
    videoArgs = ['-vf', geometry + ',format=yuv420p', '-pix_fmt', 'yuv420p', ...colorArgs,
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'high', '-tag:v', 'avc1',
      '-b:v', is720 ? '2200k' : '4000k', '-maxrate', is720 ? '2400k' : '4400k', '-bufsize', is720 ? '4400k' : '8000k'];
  } else if (av1) {
    videoArgs = ['-vf', hdrFilter, '-pix_fmt', 'yuv420p10le', ...colorArgs,
      '-c:v', 'libsvtav1', '-preset', '13', '-crf', '30', '-g', '48', '-svtav1-params', 'lp=3'];
  } else {
    // encoder instrumentado: preset, crf, hilos y GOP salen de la config viva
    const gop = cfg.closed_gop
      ? 'keyint=' + Math.max(1, Math.round(30 * cfg.gop_seconds)) + ':scenecut=0:open-gop=0:'
      : '';
    const rateArgs = cfg.bitrate_mode === 'abr'
      ? ['-b:v', cfg.bitrate, '-maxrate', cfg.maxrate, '-bufsize', cfg.bufsize]
      : ['-crf', String(cfg.crf), '-b:v', '0'];
    videoArgs = ['-vf', hdrFilter, '-pix_fmt', cfg.ten_bit ? 'yuv420p10le' : 'yuv420p', ...colorArgs,
      '-c:v', cfg.codec === 'libx265' ? 'libx265' : cfg.codec,
      '-preset', cfg.preset, '-tune', 'zerolatency', '-threads', String(cfg.x265_threads), '-tag:v', 'hvc1',
      '-x265-params', gop + 'pools=' + cfg.x265_threads + ':frame-threads=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc',
      ...rateArgs];
  }
  const audioSource = src.audioOk ? src : (options.audioSrc && options.audioSrc.audioOk ? options.audioSrc : null);
  if (!audioSource && (src.audioCodec || options.audioSrc && options.audioSrc.audioCodec)) {
    throw new Error('AUDIO_PROBE_INCOMPLETE: audio retained at source; use provider-direct');
  }
  if (audioSource && !['aac', 'ac3', 'eac3'].includes(audioSource.audioCodec)) {
    throw new Error('UNSUPPORTED_CMAF_AUDIO: no downmix or audio removal; use provider-direct');
  }
  return { isSdr, is720, use2k, av1, sixK, copyNative, copy4k: copyNative && is4kSource,
    width, height, videoArgs,
    // FIX 2026-11-08, aislado con 7 experimentos A-G sobre el ffmpeg real:
    //   -f mp4  -> funciona sin tocar nada
    //   -f dash -> falla: el demuxer HLS propaga codec_tag 0x0F y el muxer DASH
    //             lo rechaza ('Tag [15][0][0][0] incompatible with codec id 86018 (mp4a)')
    //   -b:a 128k solo -> sigue fallando (el aviso 'No bit rate set' engana)
    //   -tag:a mp4a   -> RESUELVE (39.142 B escritos, exit 0)
    // NO degrada: sigue siendo -c:a copy; solo corrige el empaquetado del tag.
    audioArgs: (() => {
      if (cfg.audio === 'drop' || !audioSource) return ['-an'];
      if (cfg.audio === 'aac') return ['-c:a', 'aac', '-b:a', cfg.audio_bitrate, '-tag:a', 'mp4a'];
      return ['-c:a', 'copy', '-tag:a', 'mp4a'];
    })(),
    hasAudio: !!audioSource, outputColorIntent,
    upscaled: src.width > 0 && src.height > 0 && (width > src.width || height > src.height),
    crystalMode: copyNative ? (is4kSource ? 'NATIVE_4K_' : 'NATIVE_') + (sourceRange || 'COLOR_UNKNOWN')
      : (sixK ? 'CRYSTAL_6K_AV1' : av1 ? 'CRYSTAL_2K_AV1' : is720 ? 'SDR720_STABLE'
        : (imageFilters ? 'FILTERED_' + String(cfg.recipe).toUpperCase() : 'FHD_SDR')) };
}

function probeOutputFile(filename) {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=codec_name,codec_tag_string,width,height,color_transfer,color_primaries,color_space,color_range,pix_fmt',
      '-of', 'json', filename], { encoding: 'utf8', timeout: 4000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(new Error('OUTPUT_PROBE_FAILED'));
      try {
        const stream = (JSON.parse(stdout).streams || [])[0];
        if (!stream || !stream.width || !stream.height) throw new Error('OUTPUT_PROBE_INCOMPLETE');
        resolve({ status: 'observed_output_init', width: stream.width, height: stream.height,
          codec: stream.codec_name || null, sampleEntry: stream.codec_tag_string || null,
          transfer: stream.color_transfer || null, primaries: stream.color_primaries || null,
          matrix: stream.color_space || null, range: stream.color_range || null,
          pixelFormat: stream.pix_fmt || null, videoRange: videoRange(stream.color_transfer) });
      } catch (_) { reject(new Error('OUTPUT_PROBE_INCOMPLETE')); }
    });
  });
}

async function ensureOutputTruth(state) {
  if (!state) return null;
  if (state.outputTruth) return state.outputTruth;
  if (state.outputProbePromise) return state.outputProbePromise;
  const init = path.join(state.dir, 'init-' + state.session + '-0.m4s');
  if (!fs.existsSync(init)) return null;
  state.outputProbePromise = probeOutputFile(init).then(truth => {
    state.outputTruth = truth;
    return truth;
  }).catch(() => null).finally(() => { state.outputProbePromise = null; });
  return state.outputProbePromise;
}
function loadMap() {
  try { return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); }
  catch (e) { log('MAP_ERROR', e.message); return {}; }
}
function safeId(id) { return /^[A-Za-z0-9_.-]{1,80}$/.test(id) ? id : null; }

/* ────────────────────────────────────────────────────────────────────────────
 * HARDENING 2026-11-06 — el pipeline moria y fallaba siempre
 * ────────────────────────────────────────────────────────────────────────────
 * MEDIDO antes del parche: 120 fallos en 60 min
 *   /dev/shm/ape-jit/{3,1174213} -> 0 ficheros
 *   FFMPEG failed to rename chunk-*.m4s.tmp to chunk-*.m4s: No such file or directory
 *   FFMPEG Could not write header (incorrect codec parameters ?): No such file or directory
 *
 * CAUSA RAIZ — cuatro productores de ENOENT sobre el mismo directorio:
 *   A) stopCurrent borraba el dir con fs.rmSync en la linea SIGUIENTE al SIGTERM.
 *      SIGTERM es asincrono: ffmpeg seguia vivo escribiendo su .tmp en un dir que
 *      ya no existia. El rename final fallaba con ENOENT. Reproducible al 100%.
 *   B) start() limpiaba el dir sin saber si un hijo anterior seguia usandolo.
 *   C) El handler 'exit' borraba el dir aunque ya perteneciera a un stream NUEVO
 *      y vivo, matandolo por la espalda.
 *   D) El intervalo de idle mataba a los IDLE_MS desde START, antes de que ffmpeg
 *      escribiera el primer chunk. Log real: START 14:18:00 -> STOP idle 14:18:30
 *      con 0 ficheros escritos.
 *
 * REGLA NUEVA: NADIE borra un directorio que un hijo vivo pueda estar escribiendo.
 * El borrado ocurre SOLO tras 'exit' del hijo dueno, o pasado STOP_GRACE_MS como
 * red de seguridad si 'exit' nunca llega.
 * ──────────────────────────────────────────────────────────────────────────── */
const STOP_GRACE_MS = Number(process.env.STOP_GRACE_MS || 6000);
const KILL_AFTER_MS = Number(process.env.KILL_AFTER_MS || 3000);
// El proveedor SOLO acepta max_connections=1. Por tanto el slot es unico y hay
// que SERIALIZARLO: un ffmpeg no puede nacer mientras el anterior no haya muerto,
// o el proveedor ve dos conexiones y corta las dos. Este es el invariante central.
const SLOT_WAIT_MS = Number(process.env.SLOT_WAIT_MS || 12000);
// Tiempo maximo de ARRANQUE antes de declararlo colgado y liberar el slot unico.
// No es el idle: mide desde started hasta que ffmpeg escribe el primer fichero.
// Con slot unico, un arranque colgado bloquea el siguiente canal: por eso hay
// tope, pero el tope se aplica SOLO mientras no haya output.
const BOOT_GRACE_MS = Number(process.env.BOOT_GRACE_MS || 45000);
// Dirs cuyo hijo esta muriendo: no se pueden borrar ni reutilizar hasta el reaping.
const pendingDirs = new Set();
// Hijos realmente vivos ahora mismo. slotAcquire espera a que este en 0.
const liveKids = new Set();
// Arranques en curso (clave canal|variante). start() es async ahora, asi que
// entre la peticion y el spawn hay una espera: waitForFile NO debe interpretar
// esa espera como 'stream stopped' o el handler devuelve 503 en cada arranque.
const booting = new Set();
const startFailures = new Map();
function chKey(id, sdr, sdr720) { return id + '|' + (sdr720 ? 'h' : sdr ? 's' : 'n'); }

function safeStartFailure(error) {
  const code = String(error && error.message || '').split(':', 1)[0];
  return ['SOURCE_PRESERVATION_REQUIRED', 'UNSUPPORTED_NATIVE_CMAF_CODEC',
    'AUDIO_PROBE_INCOMPLETE', 'UNSUPPORTED_CMAF_AUDIO'].includes(code) ? code : 'JIT_START_FAILED';
}
function recordStartFailure(id, sdr, sdr720, error) {
  const key = chKey(id, sdr, sdr720), code = safeStartFailure(error);
  startFailures.set(key, code);
  booting.delete(key);
  log('START_FAIL', id, code, 'source retained; use provider-direct');
}

function reapDir(dir) {
  if (!dir) return;
  pendingDirs.delete(dir);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

/* Espera a que NO haya ningun hijo vivo: el slot unico del proveedor. */
function slotAcquire() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (liveKids.size === 0) return resolve(true);
      if (Date.now() - t0 > SLOT_WAIT_MS) {
        log('SLOT_TIMEOUT', 'hijos vivos=' + liveKids.size + ' tras ' + SLOT_WAIT_MS + 'ms');
        return resolve(false);
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

function stopCurrent(reason) {
  if (!current) return;
  const c = current; current = null;
  log('STOP', c.id, reason || '');
  // El dir queda marcado: lo libera 'exit' del hijo, o la red de seguridad.
  pendingDirs.add(c.dir);
  try {
    if (!c.child || c.child.exitCode !== null || c.child.signalCode !== null) {
      reapDir(c.dir);                         // ya estaba muerto: se limpia ya
      return;
    }
    c.child.kill('SIGTERM');
  } catch (_) { reapDir(c.dir); return; }
  setTimeout(() => { try { c.child.kill('SIGKILL'); } catch (_) {} }, KILL_AFTER_MS);
  // Red de seguridad: si 'exit' no llega (hijo zombi), liberar pasado el grace.
  setTimeout(() => reapDir(c.dir), STOP_GRACE_MS);
}

/* async: debe poder ESPERAR a que el slot unico quede libre antes de spawnear. */
async function start(id, spec, sdr, sdr720) {
  startFailures.delete(chKey(id, sdr, sdr720));
  stopCurrent('switch');
  const src = probeSource(spec);
  // Optional audio-only fallback source. Video stays on spec.url.
  const audioSpec = spec.audioUrl ? { url: spec.audioUrl, ua: spec.audioUa || spec.ua } : null;
  const audioSrc = audioSpec ? probeSource(audioSpec) : null;
  const fallbackAudio = !!(audioSrc && audioSrc.audioOk);
  const audioOk = !!src.audioOk || fallbackAudio;
  const plan = buildEncodingPlan(src, { sdr, sdr720, audioSrc });
  const { isSdr, is720, use2k, av1, sixK, copy4k, copyNative, videoArgs, audioArgs, hasAudio } = plan;
  const dir = path.join(OUT_ROOT, id, is720 ? 'sdr720' : (isSdr ? 'sdr' : ''));
  fs.mkdirSync(dir, { recursive: true });
  // HARDENING (bug B): no limpiar un dir que un hijo anterior aun esta soltando.
  // Si esta pendiente de reaping, el mkdir ya lo reclamo; borrar aqui mataria al
  // proceso que todavia escribe su ultimo .tmp. Se espera al reaping.
  if (!pendingDirs.has(dir)) {
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  } else {
    log('DEFER_CLEAN', id, 'dir pendiente de reaping, no se borra');
  }

  const session = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const args = [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
    '-i', spec.url,
    ...(audioSpec ? ['-i', audioSpec.url] : []),
    '-map', '0:v:0', '-map', (src.audioOk ? '0:a:0?' : (fallbackAudio ? '1:a:0?' : '0:a:0?')),
    ...videoArgs,
    ...audioArgs,
    '-max_muxing_queue_size', '8192',
    // One FFmpeg -> shared fMP4 for DASH + HLS.
    '-f', 'dash',
    '-seg_duration', '2', '-frag_duration', '2',
    '-window_size', '30', '-extra_window_size', '10',
    '-remove_at_exit', '0',
    '-hls_playlist', '1', '-hls_master_name', 'master.m3u8',
    '-init_seg_name', 'init-' + session + '-$RepresentationID$.m4s',
    '-media_seg_name', 'chunk-' + session + '-$RepresentationID$-$Number$.m4s',
    'manifest.mpd',
  ];
  /* SLOT UNICO: el proveedor solo acepta max_connections=1. No se arranca el
   * ffmpeg nuevo hasta que el anterior haya muerto de verdad. Sin esta espera
   * el switch de canal abre dos conexiones y el proveedor corta ambas. */
  const slotOk = await slotAcquire();
  if (!slotOk) {
    log('START_ABORT', id, 'slot ocupado, no se abre una segunda conexion');
    return;
  }
  const child = spawn('nice', ['-n', '19', 'ffmpeg', ...args], {
    cwd: dir,
    detached: false,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  liveKids.add(child);
  const outWidth = plan.width, outHeight = plan.height;
  current = {
    id, sdr: !!sdr, sdr720: is720, child, dir, session,
    lastAccess: Date.now(), started: Date.now(),
    copy4k, copyNative, sourceWidth: src.width || 0, sourceHeight: src.height || 0,
    width: outWidth, height: outHeight, upscaled: plan.upscaled,
    outputColorIntent: plan.outputColorIntent,
    outputTruth: null, outputProbePromise: null,
    crystal: true, use2k, av1, sixK, crystalMode: plan.crystalMode,
    processingDomain: PROCESSING_DOMAIN,
  };
  log('START', id, 'pid=' + child.pid, 'sdr=' + isSdr, 'sdr720=' + is720, 'copy4k=' + copy4k, 'crystal=' + current.crystalMode, 'src=' + src.width + 'x' + src.height + '/' + src.transfer + '->' + outWidth + 'x' + outHeight);
  child.stderr.on('data', d => {
    const s = String(d).trim();
    if (s) log('FFMPEG', redactUpstreamUrls(s).slice(0, 300));
  });
  child.on('exit', (code, sig) => {
    liveKids.delete(child);
    log('EXIT', id, code, sig || '');
    if (current && current.child === child) current = null;
    // HARDENING (bug C): solo se borra si este dir esta PENDIENTE de reaping.
    // Si no lo esta, el dir pertenece a un stream vivo (uno nuevo que arranco
    // mientras este moria): borrarlo lo mataria. Ese era el tercer ENOENT.
    if (pendingDirs.has(dir)) reapDir(dir);
  });
  // HARDENING: un spawn que falla no debe dejar 'current' apuntando a un muerto.
  child.on('error', (e) => {
    liveKids.delete(child);
    log('SPAWN_ERROR', id, e && e.message ? e.message : String(e));
    if (current && current.child === child) current = null;
    if (pendingDirs.has(dir)) reapDir(dir);
  });
}

function waitForFile(id, name, cb, sdr, sdr720) {
  const file = path.join(OUT_ROOT, id, sdr720 ? 'sdr720' : (sdr ? 'sdr' : ''), name);
  const key = chKey(id, sdr, sdr720);
  const t0 = Date.now();
  const tick = () => {
    if (startFailures.has(key)) return cb(new Error(startFailures.get(key) + ': use provider-direct; source unchanged'));
    if (fs.existsSync(file)) return cb(null, file);
    // HARDENING: si este canal esta arrancando (start async esperando el slot
    // unico), no es 'stream stopped'. Antes de este guard el handler devolvia 503
    // en cada arranque y ademas se perdia el probe de 30 s.
    if (!booting.has(key) &&
        (!current || current.id !== id || !!current.sdr720 !== !!sdr720 || !!current.sdr !== !!sdr)) {
      return cb(new Error('stream stopped'));
    }
    if (Date.now() - t0 > WAIT_MS) return cb(new Error('startup timeout'));
    setTimeout(tick, 200);
  };
  tick();
}

function hdrMaster(text, state = current) {
  if (!state) return text;
  const mode = state.crystalMode;
  const id = state.id;
  if (id && text.indexOf('DATA-ID="com.ape.channel"') === -1) {
    text = text.replace('#EXTM3U',
      '#EXTM3U\n' +
      '#EXT-X-SESSION-DATA:DATA-ID="com.ape.channel",URI="/jit/meta/' + encodeURIComponent(id) + '.json"\n' +
      '#EXT-X-SESSION-DATA:DATA-ID="com.ape.manifest",URI="/jit/live/' + encodeURIComponent(id) + '/manifest.json"');
  }
  if (text.indexOf('#EXT-X-APE-CRYSTAL-UHD') === -1) {
    const up = state.upscaled
      ? '\n#EXT-X-APE-CRYSTAL-UPSCALE:SOURCE=' + state.sourceWidth + 'x' + state.sourceHeight +
        ';TARGET=' + state.width + 'x' + state.height + ';FILTER=LANCZOS'
      : '\n#EXT-X-APE-CRYSTAL-UPSCALE:NATIVE';
    // HARDENING 2026-11-06 — la etiqueta ENHANCE mentia y el VPP se perdia.
    //
    // Medido antes del cambio:
    //   canal 1080p  -> ENHANCE=4K_PLUS  TARGET=1920x1080  (dice 4K, es 1080p)
    //   canal 720p   -> ENHANCE=UPSCALE_4K  y SIN VPP ni TARGET
    //
    // Causa: ENHANCE derivaba de `upscaled`, que es false en DOS casos distintos:
    // (a) la fuente YA es 4K (correcto) y (b) el target es 1080 y la fuente 1080
    // (el mismo tamano, que no es 4K). Y el ramal `upscaled` solo emitia la
    // etiqueta, sin VPP ni TARGET: justo los canales 720p/480p —los que MAS
    // necesitan el post-proceso del SoC— eran los unicos que no lo declaraban.
    //
    // Ahora ENHANCE deriva del tamano REAL de salida y VPP+TARGET se emiten SIEMPRE.
    const outW = state.outputTruth ? state.outputTruth.width : state.width;
    const outH = state.outputTruth ? state.outputTruth.height : state.height;
    const enhTag = outH >= 2160 ? '4K_PLUS'
      : (outH >= 1080 && outW >= 2048) ? '2K_PLUS'
        : outH >= 1080 ? 'FHD_PLUS'
          : 'UPSCALE';
    const enhance = '\n#EXT-X-APE-CRYSTAL-ENHANCE:' + enhTag +
      '\n#EXT-X-APE-CRYSTAL-VPP:DEVICE_DISPLAY;POLICY=MAX_IMAGE_FIRST;EXECUTED=0' +
      '\n#EXT-X-APE-CRYSTAL-TARGET:' + outW + 'x' + outH + ';STATUS=' + (state.outputTruth ? 'OUTPUT_OBSERVED' : 'REQUESTED');
    const sixKTag = state.sixK
      ? '\n#EXT-X-APE-CRYSTAL-6K:REQUESTED=true;OUTPUT_VERIFIED=' + !!state.outputTruth +
        '\n#EXT-X-APE-CRYSTAL-6K-TARGET:6144x3456'
      : '\n#EXT-X-APE-CRYSTAL-6K:AVAILABLE=OPT_IN;ENV=APE_6K';
    text = text.replace('#EXTM3U',
      '#EXTM3U\n' +
      '#EXT-X-APE-CRYSTAL-UHD:ENABLED=true\n' +
      '#EXT-X-APE-CRYSTAL-MODE:' + mode + up + enhance + sixKTag + '\n' +
      '#EXT-X-APE-CRYSTAL-POLICY:MAX_IMAGE_FIRST\n' +
      '#EXT-X-APE-PROCESSING-DOMAIN:' + PROCESSING_DOMAIN + ';REA_POLICY_REF=' + REA_POLICY_REF + ';REA_EXECUTED=0');
  }
  // CODECS, BANDWIDTH and RESOLUTION come from FFmpeg's actual muxed output.
  // They must not be overwritten with a scheme, profile or input estimate.
  const range = state.outputTruth && state.outputTruth.videoRange;
  if (!range) return text;
  return text.split('\n').map(line => {
    if (!line.startsWith('#EXT-X-STREAM-INF:')) return line;
    const clean = line.replace(/,?VIDEO-RANGE=[^,\r\n]*/g, '');
    return clean.replace(/\r?$/, ',VIDEO-RANGE=' + range);
  }).join('\n');
}

function hdrMpd(text, state = current) {
  if (!state) return text;
  const truth = state.outputTruth;
  const props = [];
  const codes = truth ? {
    ColourPrimaries: { bt709: 1, bt2020: 9 }[truth.primaries],
    TransferCharacteristics: { bt709: 1, smpte2084: 16, 'arib-std-b67': 18 }[truth.transfer],
    MatrixCoefficients: { bt709: 1, bt2020nc: 9 }[truth.matrix]
  } : {};
  for (const [name, value] of Object.entries(codes)) {
    if (value != null) props.push('<SupplementalProperty schemeIdUri="urn:mpeg:mpegB:cicp:' + name + '" value="' + value + '"/>');
  }
  return text.replace(/(<AdaptationSet\b[^>]*>)([\s\S]*?)(<\/AdaptationSet>)/g, (all, open, body, close) => {
    if (!/\bcontentType="video"|\bmimeType="video\//.test(open + body)) return all;
    let result = body;
    for (const name of Object.keys(codes)) {
      if (codes[name] == null) continue;
      const existing = new RegExp('<(?:SupplementalProperty|EssentialProperty)\\b[^>]*schemeIdUri="urn:mpeg:mpegB:cicp:' + name + '"[^>]*\\/>', 'g');
      result = result.replace(existing, '');
    }
    if (!result.includes('urn:ape:crystal:uhd')) result = '\n<SupplementalProperty schemeIdUri="urn:ape:crystal:uhd" value="' + state.crystalMode + '"/>' + result;
    if (!result.includes('urn:ape:processing:domain')) result = '\n<SupplementalProperty schemeIdUri="urn:ape:processing:domain" value="' + PROCESSING_DOMAIN + '"/>' + result;
    return open + '\n' + props.join('\n') + result + close;
  });
}

function sendStatic(req, res, file, type, kind) {
  const stat = fs.statSync(file);
  const size = stat.size;
  const etag = fileETag(stat);
  res.locals.cache = kind || 'static';
  setObjectCacheHeaders(res, kind || 'seg');
  res.setHeader('ETag', etag);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', type);
  if (isFresh(req, etag)) {
    res.writeHead(304);
    return res.end();
  }
  const range = req.headers.range;
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

function outputDescriptor(state) {
  const truth = state && state.outputTruth;
  if (!truth) return null;
  let master = '';
  try { master = fs.readFileSync(path.join(state.dir, 'master.m3u8'), 'utf8'); } catch (_) { }
  const line = master.split('\n').find(value => value.startsWith('#EXT-X-STREAM-INF:')) || '';
  const codec = (line.match(/\bCODECS="([^"]+)"/) || [])[1] || null;
  const numeric = name => { const match = line.match(new RegExp('(?:^#EXT-X-STREAM-INF:|,)' + name + '=(\\d+(?:\\.\\d+)?)')); return match ? Number(match[1]) : null; };
  return {
    evidence: truth.status, bandwidth: numeric('BANDWIDTH'), average_bandwidth: numeric('AVERAGE-BANDWIDTH'),
    bandwidth_source: 'ffmpeg_manifest', resolution: truth.width + 'x' + truth.height,
    codecs: codec, uri: 'media_0.m3u8', frame_rate: numeric('FRAME-RATE'),
    hdr: truth.videoRange, video_range: truth.videoRange, color_primaries: truth.primaries,
    transfer: truth.transfer, matrix: truth.matrix, pixel_format: truth.pixelFormat,
    master_display: null, max_cll: null, max_fall: null
  };
}

function manifestJson(req, id, sdr, sdr720, state = current) {
  const base = publicBase(req);
  const prefix = '/live/' + id + (sdr720 ? '/sdr720' : (sdr ? '/sdr' : ''));
  const active = !!(state && state.id === id && !!state.sdr === !!sdr && !!state.sdr720 === !!sdr720);
  const selected = active ? state : null, stream = outputDescriptor(selected);
  return {
    version: '1.1', channel: id, status: active ? 'active' : 'inactive', variant: sdr720 ? 'sdr720' : (sdr ? 'sdr' : 'hdr'),
    variant_semantics: 'route_name_not_color_evidence',
    processing_domain: PROCESSING_DOMAIN, rea_policy_ref: REA_POLICY_REF, rea_executed: false,
    output_status: stream ? 'observed_output_init' : 'pending_output',
    crystal_uhd: {
      enabled: true,
      mode: selected ? selected.crystalMode : null,
      policy: 'MAX_IMAGE_FIRST',
      source_resolution: selected && selected.sourceWidth > 0 && selected.sourceHeight > 0 ? selected.sourceWidth + 'x' + selected.sourceHeight : null,
      requested_resolution: selected && selected.width > 0 && selected.height > 0 ? selected.width + 'x' + selected.height : null,
      output_resolution: stream ? stream.resolution : null,
      upscaled: stream && selected ? selected.upscaled : null,
      upscale_filter: selected && selected.upscaled ? 'LANCZOS' : null,
      note: 'Legacy VPS processing; output init verification does not prove physical HDR, REA execution or real-time playback',
    },
    formats: {
      hls: { url: base + prefix + '/master.m3u8', protocol: 'HLS', container: 'CMAF/fMP4' },
      dash: { url: base + prefix + '/manifest.mpd', protocol: 'DASH', container: 'CMAF/fMP4' },
    },
    streams: stream ? [stream] : [],
    error: active ? null : (startFailures.get(chKey(id, sdr, sdr720)) || null),
    clients_connected: null,
    active_pipeline_count: active ? 1 : 0,
    active_since: active ? new Date(selected.started).toISOString() : null,
    generated_at: new Date().toISOString(),
  };
}

function metaJson(req, id) {
  const map = loadMap();
  const known = !!(map[id] && map[id].url);
  const active = !!(current && current.id === id);
  const base = publicBase(req);
  const descriptor = active ? outputDescriptor(current) : null;
  return {
    $schema: 'https://iptv-ape.duckdns.org/schemas/channel-v1.json',
    model_version: '1.0',
    id: id,
    generated_at: new Date().toISOString(),
    active: active,
    known: known,
    representations: {
      hls: base + '/live/' + id + '/master.m3u8',
      dash: base + '/live/' + id + '/manifest.mpd',
      media_json: base + '/live/' + id + '/manifest.json'
    },
    playback: descriptor ? { ...descriptor,
      hdr: descriptor.video_range ? ['PQ', 'HLG'].includes(descriptor.video_range) : null,
      crystal_mode: current.crystalMode } : null,
    processing_domain: PROCESSING_DOMAIN, rea_policy_ref: REA_POLICY_REF, rea_executed: false,
    truth_guard: {
      supplemental_codecs: 'not emitted without measured DV',
      video_range: 'PQ/HLG/SDR only from the observed output init segment',
      codecs: 'FFmpeg output manifest; never synthesized from the selected encoder scheme',
      pixels: 'Output metadata is not a physical HDR or device playback verification'
    }
  };
}

const server = http.createServer((req, res) => {
  installTiming(req, res);
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
      codecs: ['AVC/HEVC/AV1/VP9 native copy where supported', 'HEVC Main10', 'AV1 opt-in', 'AAC/AC-3/E-AC-3 native audio'],
      hdr: ['SDR', 'PQ', 'HLG'],
      processing_domain: PROCESSING_DOMAIN, rea_policy_ref: REA_POLICY_REF, rea_executed: false,
      resolutions: { native: 'Preserve source dimensions', legacy_hdr: '1920x1080 or 2048x1080 from known BT.709 SDR',
        legacy_6k: '6144x3456 opt-in, capacity not certified', rea_device: 'Separate REA policy; not executed by this service' },
      crystal_uhd: {
        enabled: true,
        applies_to: 'all JIT channels',
        modes: ['NATIVE_4K_PQ', 'NATIVE_4K_HLG', 'NATIVE_4K_SDR', 'NATIVE_4K_COLOR_UNKNOWN',
          'NATIVE_PQ', 'NATIVE_HLG', 'NATIVE_SDR', 'NATIVE_COLOR_UNKNOWN', 'CRYSTAL_2K_HDR_UPSCALE',
          'CRYSTAL_2K_AV1', 'CRYSTAL_6K_AV1', 'FHD_HDR10', 'FHD_SDR', 'SDR720_STABLE'],
        note: 'Capabilities are conditional; output is verified from its init segment. Physical HDR and realtime performance are not certified.',
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
      processing_domain: PROCESSING_DOMAIN, rea_policy_ref: REA_POLICY_REF, rea_executed: false,
      enabled: true,
      applies_to: 'all JIT channels',
      active_channel: current ? current.id : null,
      active_mode: current ? current.crystalMode : null,
      modes: {
        NATIVE_4K_HDR: 'compatibility label; actual native codec, resolution and PQ/HLG/SDR come from output',
        CRYSTAL_2K_HDR_UPSCALE: 'HEVC Main10 2048x1080 HDR10, Lanczos upscale from <=1080p',
        CRYSTAL_2K_AV1: 'SVT-AV1 2048x1080 HDR10, opt-in APE_SCHEME=av1',
        CRYSTAL_6K_AV1: 'SVT-AV1 6144x3456, native PQ/HLG preserved or known SDR converted to PQ; opt-in APE_6K=1; not real-time on 3 vCPU',
        FHD_HDR10: 'HEVC Main10 1920x1080 HDR10, zscale SDR->PQ',
        FHD_SDR: 'H.264 1920x1080 SDR fallback for incompatible decoders',
        SDR720_STABLE: 'H.264 1280x720 SDR continuity fallback',
      },
      truth_guard: 'This legacy FFmpeg service does not execute the REA device engine. Output metadata does not certify physical display HDR.',
    }));
  }
  const mm = u.pathname.match(/^\/meta\/([^/]+)\.json$/);
  if (mm) {
    const id = safeId(mm[1]);
    if (!id) { res.writeHead(400); return res.end('bad channel'); }
    const map = loadMap();
    if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }
    res.locals.cache = 'meta';
    setNoCacheHeaders(res);
    res.setHeader('Link', '</jit/live/' + encodeURIComponent(id) + '/master.m3u8>; rel="alternate"; type="application/vnd.apple.mpegurl"');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(metaJson(req, id)));
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
    res.locals.cache = 'redirect';
    setObjectCacheHeaders(res, 'redirect');
    res.writeHead(302, {
      'Location': publicBase(req) + '/live/' + id + '/master.m3u8'
    });
    return res.end();
  }
  /* ── MODULO DE IMAGEN: control remoto desde la UI ───────────────────────── */
  if (u.pathname === '/image/config' || u.pathname === '/image/capacity') {
    setBaseHeaders(res);
    setNoCacheHeaders(res);
    if (u.pathname === '/image/capacity') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true, ...IMAGE_MEASURED_CAPACITY,
        targets: IMAGE_TARGETS, limits: IMAGE_LIMITS
      }));
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        config: imageConfig,
        source: imageConfigSource,
        defaults: IMAGE_DEFAULTS,
        effective_filter: buildImageFilterChain(imageConfig),
        capabilities: { targets: IMAGE_LIMITS.targets, recipes: IMAGE_LIMITS.recipes,
          codecs: IMAGE_LIMITS.codecs, presets: IMAGE_LIMITS.presets, fps: IMAGE_LIMITS.fps }
      }));
    }
    if (req.method === 'POST') {
      let body = '';
      let tooBig = false;
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 16384) { tooBig = true; req.destroy(); }
      });
      req.on('end', () => {
        if (tooBig) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'body demasiado grande' }));
        }
        let patch;
        try { patch = JSON.parse(body || '{}'); }
        catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
        }
        const norm = normalizeImageConfig(patch);
        if (!norm.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, errors: norm.errors, config: imageConfig }));
        }
        // Guardar: si el disco falla, NO se aplica. Mejor no cambiar que cambiar a medias.
        try {
          fs.writeFileSync(IMAGE_CONFIG_FILE + '.tmp', JSON.stringify(norm.config, null, 2));
          fs.renameSync(IMAGE_CONFIG_FILE + '.tmp', IMAGE_CONFIG_FILE);
        } catch (e) {
          log('IMAGE_CONFIG_WRITE_FAILED', e.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'no se pudo persistir: ' + e.message }));
        }
        imageConfig = norm.config;
        imageConfigSource = IMAGE_CONFIG_FILE;
        log('IMAGE_CONFIG_APPLIED', JSON.stringify({
          target: imageConfig.target, recipe: imageConfig.recipe,
          codec: imageConfig.codec, preset: imageConfig.preset, crf: imageConfig.crf,
          filter: buildImageFilterChain(imageConfig) || '(sin filtros)'
        }));
        // Aplicar al siguiente arranque: se detiene el job vivo para que la
        // proxima peticion construya el plan con la receta nueva.
        try { stopCurrent('image_config_changed'); } catch (e) { /* noop */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          ok: true,
          config: imageConfig,
          effective_filter: buildImageFilterChain(imageConfig),
          applied_at_next_start: true,
          note: 'el job en curso se detuvo; la proxima peticion usara la receta nueva'
        }));
      });
      return;
    }
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'usa GET o POST' }));
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
    if (!current || current.id !== id || !!current.sdr !== sdr || !!current.sdr720 !== sdr720) {
      const _k = chKey(id, sdr, sdr720);
      booting.add(_k);
      // start() es async (espera el slot unico). El guard de abajo evita el
      // TypeError que habia en `current.lastAccess` cuando el arranque no dejaba
      // current seteado. La marca booting caduca sola para no enmascarar muertes.
      start(id, map[id], sdr, sdr720)
        .catch((e) => recordStartFailure(id, sdr, sdr720, e))
        .finally(() => setTimeout(() => booting.delete(_k), BOOT_GRACE_MS));
    }
    if (current) current.lastAccess = Date.now();
    return ensureOutputTruth(current && current.id === id ? current : null).then(() => {
      setNoCacheHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(manifestJson(req, id, sdr, sdr720)));
    });
  }
  const m = u.pathname.match(/^\/live\/([^/]+)\/(sdr720\/|sdr\/)?(master\.m3u8|index\.m3u8|manifest\.mpd|media_[0-9]+\.m3u8|init-[A-Za-z0-9_-]+\.m4s|chunk-[A-Za-z0-9_-]+\.m4s)$/);
  if (!m) { res.writeHead(404); return res.end('not found'); }
  const id = safeId(m[1]);
  if (!id) { res.writeHead(400); return res.end('bad channel'); }
  const sdr720 = m[2] === 'sdr720/';
  const sdr = !sdr720 && m[2] === 'sdr/';
  const map = loadMap();
  if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }
  if (!current || current.id !== id || !!current.sdr !== sdr || !!current.sdr720 !== sdr720) {
    const _k = chKey(id, sdr, sdr720);
    booting.add(_k);
    start(id, map[id], sdr, sdr720)
      .catch((e) => recordStartFailure(id, sdr, sdr720, e))
      .finally(() => setTimeout(() => booting.delete(_k), BOOT_GRACE_MS));
  }
  if (current) current.lastAccess = Date.now();

  let name = m[3];
  if (name === 'index.m3u8') name = 'media_0.m3u8';
  const waitName = (name === 'master.m3u8' || name === 'manifest.mpd' || name === 'media_0.m3u8') ? name : null;
  const serve = async () => {
    const file = path.join(OUT_ROOT, id, sdr720 ? 'sdr720' : (sdr ? 'sdr' : ''), name);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not ready'); }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const kind = name === 'master.m3u8' ? 'master'
      : name === 'manifest.mpd' ? 'mpd'
      : /^media_[0-9]+\.m3u8$/.test(name) ? 'media'
      : /^init-.*\.m4s$/.test(name) ? 'init'
      : /^chunk-.*\.m4s$/.test(name) ? 'seg'
      : 'seg';
    if (name === 'master.m3u8' || name === 'manifest.mpd') {
      const state = current && current.id === id && !!current.sdr === sdr && !!current.sdr720 === sdr720 ? current : null;
      await ensureOutputTruth(state);
      const stat = fs.statSync(file);
      const etag = fileETag(stat);
      res.locals.cache = kind;
      setObjectCacheHeaders(res, kind);
      res.setHeader('ETag', etag);
      if (isFresh(req, etag)) {
        res.writeHead(304);
        return res.end();
      }
      const txt = fs.readFileSync(file, 'utf8');
      if (name === 'master.m3u8') {
        res.setHeader('Link', '</jit/meta/' + encodeURIComponent(id) + '.json>; rel="describedby"; type="application/json"');
      }
      res.writeHead(200, { 'Content-Type': type });
      return res.end(name === 'master.m3u8' ? hdrMaster(txt, state) : hdrMpd(txt, state));
    }
    sendStatic(req, res, file, type, kind);
  };
  const serveError = () => {
    if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'text/plain' });
    if (!res.writableEnded) res.end('output unavailable');
  };
  if (waitName) return waitForFile(id, waitName, (err) => {
    if (err) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end(err.message); }
    serve().catch(serveError);
  }, sdr, sdr720);
  serve().catch(serveError);
});

/* HARDENING (bug D) — el idle mataba el stream antes de nacer.
 * Log medido: START 14:18:00 -> STOP idle 14:18:30 -> 0 ficheros, y el
 * 'failed to rename' justo despues. lastAccess se fija en start(), y hasta que
 * ffmpeg escribe el primer chunk el cliente no tiene nada que pedir: el idle
 * contaba como abandono lo que en realidad era arranque normal.
 *
 * Con max_connections=1 hay que liberar rapido, asi que NO basta con un grace
 * fijo: se distingue ARRANQUE de ABANDONO por el output real en disco.
 *   - sin ficheros  -> es arranque: solo se corta si se pasa BOOT_GRACE_MS
 *                      (asi un ffmpeg colgado no bloquea el slot para siempre)
 *   - con ficheros  -> arranco: aplica el idle normal (libera el slot rapido)
 */
function dirHasOutput(dir) {
  try {
    return fs.readdirSync(dir).some((f) => f.endsWith('.m4s') || f.endsWith('.mpd') || f.endsWith('.m3u8'));
  } catch (_) { return false; }
}
if (require.main === module) {
setInterval(() => {
  if (!current) return;
  const now = Date.now();
  if (!dirHasOutput(current.dir)) {
    if (now - (current.started || 0) > BOOT_GRACE_MS) {
      log('BOOT_TIMEOUT', current.id, 'sin output tras ' + BOOT_GRACE_MS + 'ms, liberando slot');
      stopCurrent('boot-timeout');
    }
    return;
  }
  if (now - current.lastAccess > IDLE_MS) stopCurrent('idle');
}, 5000);
process.on('SIGTERM', () => { stopCurrent('signal'); process.exit(0); });
process.on('SIGINT', () => { stopCurrent('signal'); process.exit(0); });

fs.mkdirSync(OUT_ROOT, { recursive: true });
server.listen(PORT, BIND, () => log('LISTEN', BIND + ':' + PORT, 'map=' + MAP_FILE));
}

module.exports = { buildEncodingPlan, probeOutputFile, ensureOutputTruth, outputDescriptor,
  hdrMaster, hdrMpd, manifestJson, videoRange, safeStartFailure, redactUpstreamUrls, PROCESSING_DOMAIN, REA_POLICY_REF };









