#!/usr/bin/env node
/**
 * parse_mediacodec_logcat.js — telemetría de decodificador desde logcat (Android TV).
 *
 * Extrae lo que el player realmente hace: códec elegido, resolución decodificada,
 * frames renderizados vs descartados, y tipo de decoder (HW/SW).
 *
 * Fail-honest: reporta la COBERTURA (líneas reconocidas / total). Una cobertura baja
 * significa que el parser no conoce ese formato de log, NO que no haya eventos.
 *
 * Uso:
 *   adb logcat -d > logcat.txt
 *   node parse_mediacodec_logcat.js logcat.txt --out telemetria.jsonl
 *   node parse_mediacodec_logcat.js logcat.txt --json     # resumen a stdout
 *
 * Sin dependencias. Solo lee el archivo indicado.
 * Exit: 0 siempre que el archivo exista (la cobertura es un dato, no un error).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Patrones reales de logcat de ExoPlayer/Media3 y de MediaCodec crudo.
 * Cada patrón captura un evento tipado. Añadir uno nuevo exige un caso de prueba.
 */
const PATTERNS = [
  {
    // EventLogger: decoderInitialized [rendererIndex, trackType, elapsed, "c2.mtk.hevc.decoder", initMs]
    id: 'decoderInitialized',
    re: /decoderInitialized\s*\[[^\]]*"([^"]+)"\s*,\s*(\d+)\s*\]/,
    map: (m) => ({ codec: m[1], init_ms: Number(m[2]) })
  },
  {
    // forma alternativa: decoderInitialized "c2.qti.avc.decoder"
    id: 'decoderInitialized_alt',
    re: /decoderInitialized[^"]*"([^"]+)"/,
    map: (m) => ({ codec: m[1] })
  },
  {
    // videoInputFormat: [1, video] 3840x2160 [0] hvc1...  -> el indice entre corchetes
    // contiene digitos, por eso se usa .*? y no [^\d]*
    id: 'videoInputFormat',
    re: /videoInputFormat(?:.*?)v?(\d{2,5})\s*[xX]\s*(\d{2,5})/,
    map: (m) => ({ width: Number(m[1]), height: Number(m[2]) })
  },
  {
    // format ... 1920x1080 ; codec=avc1.640028
    id: 'format_dims',
    re: /\bformat\b.*?(\d{2,5})\s*[xX]\s*(\d{2,5})/i,
    map: (m) => ({ width: Number(m[1]), height: Number(m[2]) })
  },
  {
    id: 'codec_attr',
    re: /\bcodec[=:]\s*"?([a-zA-Z0-9._-]+)"?/,
    map: (m) => ({ codec: m[1] })
  },
  {
    // Dropped frames: 12, total: 3456  (orden A)
    id: 'dropped_a',
    re: /Dropped frames:\s*(\d+)[^\d]+total:\s*(\d+)/i,
    map: (m) => ({ dropped_frames: Number(m[1]), total_frames: Number(m[2]) })
  },
  {
    // dropped=12 rendered=3456 (orden B)
    id: 'dropped_b',
    re: /dropped[=:\s]+(\d+)[^\d]+rendered[=:\s]+(\d+)/i,
    map: (m) => ({ dropped_frames: Number(m[1]), rendered_frames: Number(m[2]) })
  },
  {
    id: 'rendered_only',
    re: /rendered frames:\s*(\d+)/i,
    map: (m) => ({ rendered_frames: Number(m[1]) })
  },
  {
    // decoder type from the codec name prefix (c2./OMX. = hardware, .sw. / google = software)
    id: 'videoEnabled',
    re: /videoEnabled/,
    map: () => ({ event: 'videoEnabled' })
  },
  {
    id: 'videoDisabled',
    re: /videoDisabled/,
    map: () => ({ event: 'videoDisabled' })
  },
  {
    id: 'stall',
    re: /(?:stall|buffering)/i,
    map: () => ({ event: 'stall_or_buffering' })
  },
  {
    id: 'error',
    re: /(?:ExoPlaybackException|PlaybackException|MediaCodecRenderer[^:]*:\s*(?:error|Error))/,
    map: () => ({ event: 'error' })
  }
];

function classifyDecoder(codec) {
  if (!codec) return 'unknown';
  const c = codec.toLowerCase();
  if (c.startsWith('c2.') || c.startsWith('omx.')) {
    if (c.includes('.sw.') || c.includes('google') || c.includes('software')) return 'software';
    return 'hardware_candidate';
  }
  if (c.includes('sw') || c.includes('google') || c.includes('ffmpeg')) return 'software';
  return 'unknown';
}

async function parse(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const events = [];
  const counts = {};
  let total = 0;
  let matched = 0;
  let currentCodec = null;
  let currentWidth = null;
  let currentHeight = null;

  for await (const raw of rl) {
    total += 1;
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;

    let hit = null;
    for (const p of PATTERNS) {
      const m = p.re.exec(line);
      if (m) {
        hit = { pattern: p.id, ...p.map(m) };
        break;
      }
    }
    if (!hit) continue;
    matched += 1;
    counts[hit.pattern] = (counts[hit.pattern] || 0) + 1;

    if (hit.codec) currentCodec = hit.codec;
    if (hit.width && hit.height) { currentWidth = hit.width; currentHeight = hit.height; }

    const ev = {
      line_no: total,
      pattern: hit.pattern
    };
    if (hit.codec) ev.codec = hit.codec;
    if (hit.init_ms !== undefined) ev.init_ms = hit.init_ms;
    if (hit.width) { ev.width = hit.width; ev.height = hit.height; }
    if (hit.dropped_frames !== undefined) ev.dropped_frames = hit.dropped_frames;
    if (hit.rendered_frames !== undefined) ev.rendered_frames = hit.rendered_frames;
    if (hit.total_frames !== undefined) ev.total_frames = hit.total_frames;
    if (hit.event) ev.event = hit.event;
    if (currentCodec) ev.decoder_class = classifyDecoder(currentCodec);
    if (currentWidth) { ev.context_width = currentWidth; ev.context_height = currentHeight; }

    events.push(ev);
  }
  rl.close();
  stream.destroy();

  // ultimo estado conocido por codec
  const lastByCodec = {};
  let lastDropped = null;
  let lastTotal = null;
  for (const ev of events) {
    if (ev.dropped_frames !== undefined) lastDropped = ev.dropped_frames;
    if (ev.total_frames !== undefined) lastTotal = ev.total_frames;
    else if (ev.rendered_frames !== undefined) lastTotal = ev.rendered_frames;
    if (ev.codec) {
      lastByCodec[ev.codec] = lastByCodec[ev.codec] || {};
      lastByCodec[ev.codec].last_seen_line = ev.line_no;
      if (ev.init_ms !== undefined) lastByCodec[ev.codec].init_ms = ev.init_ms;
      lastByCodec[ev.codec].decoder_class = ev.decoder_class;
    }
  }

  const droppedRate = (lastDropped !== null && lastTotal)
    ? Number((lastDropped / lastTotal).toFixed(6))
    : null;

  return {
    file: path.basename(filePath),
    lines_total: total,
    lines_matched: matched,
    coverage: total ? Number((matched / total).toFixed(6)) : null,
    pattern_counts: counts,
    codecs: lastByCodec,
    final: {
      codec: currentCodec,
      decoder_class: classifyDecoder(currentCodec),
      width: currentWidth,
      height: currentHeight,
      dropped_frames: lastDropped,
      total_or_rendered: lastTotal,
      dropped_rate: droppedRate
    },
    events,
    limits: {
      note: 'cobertura < 1 significa formato de log no reconocido, NO ausencia de eventos',
      synthetic_test: null
    }
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const file = argv[0];
  if (!file || !fs.existsSync(file)) {
    process.stderr.write('uso: node parse_mediacodec_logcat.js <logcat.txt> [--out file.jsonl] [--json]\n');
    return 2;
  }
  let out = null;
  let asJson = false;
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--json') asJson = true;
  }

  const result = await parse(file);

  if (out) {
    const lines = result.events.map((e) => JSON.stringify(e));
    fs.writeFileSync(out, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  }
  if (asJson) {
    const { events, ...summary } = result;
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    process.stdout.write(
      `lineas=${result.lines_total} reconocidas=${result.lines_matched} cobertura=${result.coverage}\n` +
      `codec=${result.final.codec} clase=${result.final.decoder_class} ` +
      `${result.final.width || '?'}x${result.final.height || '?'} ` +
      `dropped=${result.final.dropped_frames} total=${result.final.total_or_rendered} ` +
      `tasa=${result.final.dropped_rate}\n`
    );
  }
  return 0;
}

if (require.main === module) {
  main()
    .then((c) => { process.exitCode = c; })
    .catch((e) => { process.stderr.write(`parse_mediacodec_logcat.js ERROR: ${e.message}\n`); process.exitCode = 1; });
}

module.exports = { parse, classifyDecoder, PATTERNS };
