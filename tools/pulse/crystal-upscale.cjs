#!/usr/bin/env node
/**
 * crystal-upscale.cjs — motor on-demand APE Crystal 4K/6K.
 *
 * Portado del contrato `ape.crystal.upscale/1` (propuesta Genspark 1.6.3) y
 * adaptado a este repo. NO se usa en /pulse ni en listas servidas: es un trabajo
 * local explícito sobre un fichero de vídeo.
 *
 * Contrato:
 *   node ape-pulse-wrap.js --format upscale --in <video local> --out <dir nuevo>
 *        [--target 4k|6k] [--quality balanced|max]
 *        [--sharpness classic|strong] [--plan] [--quiet]
 *
 * Salida: JSON con status PLANNED | FILTERS_EXECUTED | SOURCE_PRESERVED.
 * Errores: exit 1, sin dejar directorio parcial.
 *
 * Reglas duras:
 *   - solo archivo local (protocol_whitelist=file, sin URLs);
 *   - no sobrescribe un directorio existente;
 *   - HDR/Dolby Vision y rotación se rechazan (no se convierten);
 *   - si no hay ampliación real, no se crea salida (SOURCE_PRESERVED);
 *   - las cadenas son fijas del contrato: no se aceptan filtros del usuario;
 *   - todo fallo de FFmpeg elimina el directorio de salida.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

function loadContract() {
  const candidates = [
    process.env.APE_UPSCALE_PROFILES,
    path.join(__dirname, 'crystal_upscale_profiles.json'),
    path.join(__dirname, '..', '..', 'contracts', 'crystal_upscale_profiles.json'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const contract = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    if (contract.schema !== 'ape.crystal.upscale/1') {
      throw new Error('contrato de upscale desconocido: ' + candidate);
    }
    if (!Array.isArray(contract.presets) || !contract.targets) {
      throw new Error('contrato de upscale incompleto: ' + candidate);
    }
    return contract;
  }
  throw new Error('no se encontró crystal_upscale_profiles.json');
}

const CONTRACT = loadContract();
const FFMPEG = process.env.APE_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.APE_FFPROBE || 'ffprobe';
const TIMEOUT_MS = Number(process.env.APE_UPSCALE_TIMEOUT_MS) || 30 * 60 * 1000;

function parseTarget(value) {
  if (!Object.prototype.hasOwnProperty.call(CONTRACT.targets, value)) {
    throw new Error('Use --target 4k|6k');
  }
  return value;
}

function parseQuality(value) {
  if (!['balanced', 'max'].includes(value)) {
    throw new Error('Use --quality balanced|max');
  }
  return value;
}

function parseSharpness(value) {
  if (!['classic', 'strong'].includes(value)) {
    throw new Error('Use --sharpness classic|strong');
  }
  return value;
}

function probe(input) {
  const raw = execFileSync(FFPROBE, [
    '-v', 'error',
    '-protocol_whitelist', 'file',
    '-format_whitelist', CONTRACT.input_formats,
    '-show_streams',
    '-of', 'json',
    '-i', input,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000, maxBuffer: 2 ** 20 });
  return JSON.parse(raw);
}

function isHdrOrDv(stream) {
  const transfer = String(stream.color_transfer || '');
  const codecTag = String(stream.codec_tag_string || '');
  if (/smpte2084|arib-std-b67/i.test(transfer)) return true;
  if (/^(dvh1|dvhe)$/i.test(codecTag)) return true;
  return (stream.side_data_list || []).some((side) =>
    /dovi|dolby vision|mastering display|content light/i.test(String(side.side_data_type || '')));
}

function hasRotation(stream) {
  return (stream.side_data_list || []).some((side) =>
    side.rotation !== undefined && Number(side.rotation) % 360 !== 0);
}

function even(value) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function crystalPlan(stream, target, quality, sharpness) {
  if (!Object.prototype.hasOwnProperty.call(CONTRACT.targets, target)) {
    throw new Error('Use --target 4k|6k');
  }
  if (!['balanced', 'max'].includes(quality)) {
    throw new Error('Use --quality balanced|max');
  }
  if (!['classic', 'strong'].includes(sharpness)) {
    throw new Error('Use --sharpness classic|strong');
  }
  const width = Number(stream.width);
  const height = Number(stream.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 16 || height < 16 || width > 8192 || height > 8192) {
    throw new Error('Dimensiones de fuente fuera del intervalo admitido');
  }
  if (isHdrOrDv(stream)) {
    throw new Error('HDR o Dolby Vision detectado: conservar la fuente original');
  }
  if (hasRotation(stream)) {
    throw new Error('La fuente tiene rotación: normalícela antes del trabajo');
  }

  const [tw, th] = CONTRACT.targets[target];
  const sarText = String(stream.sample_aspect_ratio || '');
  const darText = String(stream.display_aspect_ratio || '');
  const sar = /^(\d+):(\d+)$/.exec(sarText);
  const dar = /^(\d+):(\d+)$/.exec(darText);
  let ratio = 1;
  if (sar && Number(sar[1]) > 0 && Number(sar[2]) > 0) {
    ratio = Number(sar[1]) / Number(sar[2]);
  } else if (dar && Number(dar[1]) > 0 && Number(dar[2]) > 0) {
    // DAR = (width * SAR) / height => SAR = DAR * height / width.
    ratio = (Number(dar[1]) / Number(dar[2])) * height / width;
  }
  if (ratio < 0.1 || ratio > 10) {
    throw new Error('Relación de píxel fuera del intervalo admitido');
  }

  const scale = Math.min(tw / (width * ratio), th / height);
  const active = [even(width * ratio * scale), even(height * scale)];
  const bypass = scale <= 1 + 1e-8 || active[0] < width || active[1] < height;
  const preset = CONTRACT.presets.find((item) => Math.min(width, height) <= item.max);
  if (!preset) throw new Error('No hay preset para la resolución medida');

  const filters = [];
  let casStrength = null;
  if (!bypass) {
    if (CONTRACT.interlaced_field_orders.includes(String(stream.field_order || ''))) {
      filters.push(CONTRACT.deinterlace);
    }
    if (quality === 'max') {
      if (preset.deblock) filters.push(preset.deblock);
      if (preset.denoise) filters.push(preset.denoise);
      filters.push('format=yuv420p10le');
      if (preset.deband) {
        filters.push('deband=1thr=0.008:2thr=0.008:3thr=0.008:range=12:blur=false');
      }
    }
    const flags = quality === 'max' ? CONTRACT.scale_flags_max : CONTRACT.scale_flags_balanced;
    filters.push('scale=' + active.join(':') + ':flags=' + flags + ':threads=2');
    if (quality === 'max') {
      casStrength = sharpness === 'strong'
        ? (preset.cas_strong === null ? preset.cas : preset.cas_strong)
        : preset.cas;
      if (casStrength !== null) filters.push('cas=strength=' + casStrength + ':planes=1');
    }
    filters.push('setsar=1');
    filters.push('pad=' + tw + ':' + th +
      ':trunc((ow-iw)/4)*2:trunc((oh-ih)/4)*2');
    filters.push('format=yuv420p10le');
  }

  return {
    profile: preset.id,
    quality,
    sharpness,
    source_px: [width, height],
    input_sar: sarText || '1:1',
    display_aspect_ratio: darText || null,
    active_px: active,
    output_px: bypass ? null : [tw, th],
    target,
    bypass,
    cas_strength: casStrength,
    filters,
  };
}

function runFfmpeg(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch (_) { }
      reject(new Error('FFmpeg excedió el tiempo máximo'));
    }, TIMEOUT_MS);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('FFmpeg no completó el HLS (' + (signal || code) + ')'));
    });
  });
}

async function encode(input, stream, plan, outputDir) {
  const [width, height] = plan.output_px;
  const is6k = plan.target === '6k';
  const preset = plan.quality === 'max' ? 'medium' : 'fast';
  const crf = plan.quality === 'max' ? CONTRACT.encode.crf_max : CONTRACT.encode.crf_balanced;
  const maxrate = is6k ? CONTRACT.encode.maxrate_6k : CONTRACT.encode.maxrate_4k;
  const bufsize = is6k ? CONTRACT.encode.bufsize_6k : CONTRACT.encode.bufsize_4k;
  const args = [
    '-hide_banner', '-nostdin', '-y', '-v', 'error', '-xerror',
    '-protocol_whitelist', 'file',
    '-format_whitelist', CONTRACT.input_formats,
    '-threads', '2', '-noautorotate', '-i', input,
    '-map', '0:' + stream.index, '-map', '0:a:0?',
    '-map_metadata', '-1', '-map_chapters', '-1',
    '-filter_threads', '2', '-vf', plan.filters.join(','),
    '-fps_mode', 'passthrough',
    '-c:v', CONTRACT.encode.video_codec,
    '-tag:v', CONTRACT.encode.tag,
    '-pix_fmt', CONTRACT.encode.pix_fmt,
    '-preset', preset,
    '-crf', String(crf),
    '-maxrate', maxrate,
    '-bufsize', bufsize,
    '-x265-params', 'log-level=error:pools=2:frame-threads=2:open-gop=0',
    '-force_key_frames', 'expr:gte(t,n_forced*2)',
    '-c:a', CONTRACT.encode.audio_codec,
    '-b:a', CONTRACT.encode.audio_bitrate,
    '-f', 'hls',
    '-hls_time', String(CONTRACT.encode.hls_time),
    '-hls_playlist_type', CONTRACT.encode.hls_playlist_type,
    '-hls_segment_type', CONTRACT.encode.hls_segment_type,
    '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_flags', 'independent_segments+temp_file',
    '-hls_segment_filename', 'segment-%06d.m4s',
    'video.m3u8',
  ];
  await runFfmpeg(args, outputDir);

  const mediaPath = path.join(outputDir, 'video.m3u8');
  const initPath = path.join(outputDir, 'init.mp4');
  if (!fs.existsSync(mediaPath) || !fs.existsSync(initPath) || fs.statSync(initPath).size === 0) {
    throw new Error('HLS incompleto: falta video.m3u8 o init.mp4');
  }
  const media = fs.readFileSync(mediaPath, 'utf8');
  const segments = media.split(/\r?\n/).filter((line) => /^segment-\d+\.m4s$/.test(line));
  if (!segments.length || !media.includes('#EXT-X-ENDLIST')) {
    throw new Error('HLS incompleto: faltan segmentos o ENDLIST');
  }

  const initProbe = probe(initPath);
  const actual = (initProbe.streams || []).find((item) => item.codec_type === 'video');
  if (!actual || actual.width !== width || actual.height !== height ||
      actual.codec_name !== 'hevc' || actual.pix_fmt !== CONTRACT.encode.pix_fmt) {
    throw new Error('El vídeo codificado no coincide con el plan Crystal');
  }

  const durations = [...media.matchAll(/^#EXTINF:([0-9.]+)/gm)].map((match) => Number(match[1]));
  if (durations.length !== segments.length ||
      durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
    throw new Error('Duraciones HLS inválidas');
  }
  const initBytes = fs.statSync(initPath).size;
  const bandwidth = Math.ceil(Math.max(...segments.map((segment, index) =>
    (fs.statSync(path.join(outputDir, segment)).size + initBytes) * 8 / durations[index])));
  fs.writeFileSync(path.join(outputDir, 'master.m3u8'),
    '#EXTM3U\n#EXT-X-VERSION:7\n' +
    '#EXT-X-STREAM-INF:BANDWIDTH=' + bandwidth + ',RESOLUTION=' + width + 'x' + height + '\n' +
    'video.m3u8\n');

  return {
    codec: actual.codec_name,
    pixel_format: actual.pix_fmt,
    segments: segments.length,
    bandwidth,
    master: path.join(outputDir, 'master.m3u8'),
  };
}

async function run(args, wrapperVersion) {
  let createdDir = null;
  try {
    const target = parseTarget(args.target === undefined ? '4k' : String(args.target));
    const quality = parseQuality(args.quality === undefined ? 'balanced' : String(args.quality));
    const sharpness = parseSharpness(args.sharpness === undefined ? 'classic' : String(args.sharpness));
    if (args.plan !== undefined && args.plan !== true) throw new Error('--plan no acepta valor');
    if (typeof args.in !== 'string' || typeof args.out !== 'string' || !args.in || !args.out) {
      throw new Error('uso: --format upscale --in <video> --out <directorio>');
    }

    const input = fs.realpathSync(args.in);
    if (!fs.statSync(input).isFile()) throw new Error('La entrada debe ser un archivo de vídeo local');
    const outputDir = path.resolve(args.out);

    const media = probe(input);
    const stream = (media.streams || []).find((item) =>
      item.codec_type === 'video' && !(item.disposition && item.disposition.attached_pic));
    if (!stream) throw new Error('No se encontró una pista de vídeo');

    const plan = crystalPlan(stream, target, quality, sharpness);
    let verification = null;
    if (!args.plan && !plan.bypass) {
      if (fs.existsSync(outputDir)) throw new Error('El directorio de salida ya existe: ' + outputDir);
      fs.mkdirSync(outputDir, { mode: 0o750 });
      createdDir = outputDir;
      verification = await encode(input, stream, plan, outputDir);
    }

    const result = {
      format: 'upscale',
      wrapper: wrapperVersion,
      status: plan.bypass ? 'SOURCE_PRESERVED' : (args.plan ? 'PLANNED' : 'FILTERS_EXECUTED'),
      native_detail: false,
      ...plan,
      verification,
      master: verification ? verification.master : null,
    };
    if (!args.quiet) console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    if (createdDir) {
      try { fs.rmSync(createdDir, { recursive: true, force: true }); } catch (_) { }
    }
    console.error('crystal-error:', error && error.message ? error.message : error);
    process.exitCode = 1;
    return null;
  }
}

module.exports = { run, crystalPlan, probe, CONTRACT };
