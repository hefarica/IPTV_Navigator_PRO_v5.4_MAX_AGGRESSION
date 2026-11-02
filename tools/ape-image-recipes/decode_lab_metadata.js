#!/usr/bin/env node
/**
 * decode_lab_metadata.js — extrae y decodifica el bloque LAB del manifiesto.
 *
 * El generador emite el blob de calibración del LAB como N líneas
 *   #EXT-X-APE-LAB-METADATA:<i>/<N>:<chunk-base64>
 * donde cada chunk es una porción del MISMO base64 (no decodificable por
 * separado). Se concatenan en orden y se decodifica una sola vez.
 *
 * Uso:
 *   node decode_lab_metadata.js <ruta-lista.m3u8> [--out <dir>] [--max-lines N]
 *
 * Solo lee las líneas de cabecera (antes del primer #EXTINF).
 * No escribe red. Redacta credenciales en el resumen.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const LINE_RE = /^#EXT-X-APE-LAB-METADATA:(\d+)\/(\d+):(.+)$/;

async function extract(listPath, maxLines) {
  const stream = fs.createReadStream(listPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const chunks = new Map();
  let declaredTotal = null;
  let headerLines = 0;
  let headerRaw = [];
  let firstExtinfSeen = false;

  for await (const rawLine of rl) {
    const line = rawLine.replace(/\r$/, '');
    if (!firstExtinfSeen && line.startsWith('#EXTINF')) {
      firstExtinfSeen = true;
      break;
    }
    headerLines += 1;
    headerRaw.push(line);
    if (maxLines && headerLines > maxLines) break;

    const m = LINE_RE.exec(line);
    if (m) {
      const idx = parseInt(m[1], 10);
      const total = parseInt(m[2], 10);
      if (declaredTotal === null) declaredTotal = total;
      if (declaredTotal !== total) {
        throw new Error(`chunk ${idx} declara total ${total}, esperaba ${declaredTotal}`);
      }
      if (chunks.has(idx)) throw new Error(`chunk duplicado: ${idx}`);
      chunks.set(idx, m[3]);
    }
  }
  rl.close();
  stream.destroy();

  return { chunks, declaredTotal, headerLines, headerRaw };
}

function decodeLab(extracted) {
  const { chunks, declaredTotal } = extracted;
  const indexes = [...chunks.keys()].sort((a, b) => a - b);
  const missing = [];
  for (let i = 1; i <= (declaredTotal || 0); i += 1) {
    if (!chunks.has(i)) missing.push(i);
  }
  if (missing.length) {
    throw new Error(`faltan chunks: ${missing.join(',')} (declarado total=${declaredTotal})`);
  }
  const b64 = indexes.map((i) => chunks.get(i)).join('');
  const buf = Buffer.from(b64, 'base64');
  const text = buf.toString('utf8');
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    parseError = err.message;
  }
  return {
    chunks: indexes.length,
    declaredTotal,
    base64Bytes: b64.length,
    decodedBytes: buf.length,
    parsed,
    parseError,
    text
  };
}

function summarize(lab) {
  if (!lab.parsed) {
    return { parsed: false, parseError: lab.parseError, decodedBytes: lab.decodedBytes };
  }
  const obj = lab.parsed;
  const top = Object.keys(obj);
  const qualityLevels = obj.quality_levels ? Object.keys(obj.quality_levels) : [];
  const perLevel = {};
  if (obj.quality_levels) {
    for (const key of qualityLevels) {
      const lvl = obj.quality_levels[key];
      perLevel[key] = {
        label: lvl.label,
        resolution: lvl.resolution,
        bitrate_mbps: lvl.bitrate_mbps,
        hdr: lvl.hdr,
        video_filter_present: typeof lvl.video_filter === 'string',
        video_filter_len: typeof lvl.video_filter === 'string' ? lvl.video_filter.length : 0,
        video_filter_tokens: typeof lvl.video_filter === 'string'
          ? lvl.video_filter.split(',').map((s) => s.split('=')[0].split(':')[0])
          : []
      };
    }
  }
  return {
    parsed: true,
    top_level_keys: top,
    decodedBytes: lab.decodedBytes,
    chunks: lab.chunks,
    quality_levels: perLevel,
    prefetch_config: obj.prefetch_config || null,
    has_player_enslavement: Boolean(obj.player_enslavement),
    has_actor_injections: Boolean(obj.actor_injections),
    soc_vpp_dnr: obj.actor_injections && obj.actor_injections.soc_vpp_dnr
      ? {
          target: obj.actor_injections.soc_vpp_dnr.target,
          vps_control: obj.actor_injections.soc_vpp_dnr.vps_control,
          truth_guard: obj.actor_injections.soc_vpp_dnr.truth_guard
        }
      : null
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    process.stderr.write('uso: node decode_lab_metadata.js <lista.m3u8> [--out dir] [--max-lines N]\n');
    return 2;
  }
  const listPath = argv[0];
  let outDir = null;
  let maxLines = 2000;
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--out') outDir = argv[i + 1];
    if (argv[i] === '--max-lines') maxLines = parseInt(argv[i + 1], 10);
  }
  if (!fs.existsSync(listPath)) {
    process.stderr.write(`no existe: ${listPath}\n`);
    return 2;
  }

  const extracted = await extract(listPath, maxLines);
  if (extracted.chunks.size === 0) {
    process.stderr.write('no se encontro ningun #EXT-X-APE-LAB-METADATA en la cabecera\n');
    return 3;
  }
  const lab = decodeLab(extracted);
  const summary = summarize(lab);
  summary.header_lines_scanned = extracted.headerLines;

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    if (lab.parsed) {
      fs.writeFileSync(
        path.join(outDir, 'lab_metadata.json'),
        JSON.stringify(lab.parsed, null, 2),
        'utf8'
      );
    } else {
      fs.writeFileSync(path.join(outDir, 'lab_metadata.raw.txt'), lab.text, 'utf8');
    }
    fs.writeFileSync(
      path.join(outDir, 'lab_header_raw.txt'),
      extracted.headerRaw.join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(outDir, 'lab_summary.json'),
      JSON.stringify(summary, null, 2),
      'utf8'
    );
  }

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  return summary.parsed ? 0 : 4;
}

if (require.main === module) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      process.stderr.write(`decode_lab_metadata.js ERROR: ${err.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { extract, decodeLab, summarize };
