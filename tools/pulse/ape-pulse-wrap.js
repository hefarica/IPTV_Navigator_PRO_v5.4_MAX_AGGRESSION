#!/usr/bin/env node
/**
 * ape-pulse-wrap.js — despachador único de los tres modos APE Crystal.
 *
 *   --format iptv       (default) catálogo IPTV + /pulse + EXTSHIMOTT + híbrido
 *   --format hls-master maestro HLS: STREAM-INF -> URI intactos
 *   --format upscale    vídeo local -> HLS 4K/6K on-demand
 *
 * El modo iptv delega en ape-pulse-list.cjs (comportamiento 1.7.0 conservado).
 * El modo upscale NO se usa en /pulse ni en listas servidas.
 */
'use strict';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { args[name] = true; continue; }
    args[name] = next;
    i++;
  }
  return args;
}

const args = parseArgs(process.argv);
const format = args.format === undefined ? 'iptv' : String(args.format);
const WRAPPER_VERSION = '1.8.0';

if (!['iptv', 'hls-master', 'upscale'].includes(format)) {
  console.error('uso: --format iptv|hls-master|upscale --in <src> --out <dst>');
  process.exit(2);
}

if (format === 'upscale') {
  require('./crystal-upscale.cjs').run(args, WRAPPER_VERSION).then((result) => {
    if (!result) process.exitCode = 1;
  }).catch((error) => {
    console.error('crystal-error:', error && error.message ? error.message : error);
    process.exit(1);
  });
} else if (format === 'hls-master') {
  require('./ape-pulse-master.cjs').run(args, WRAPPER_VERSION);
} else {
  // Delegación al envoltorio de listas 1.7.0: no se reescribe aquí su parser.
  require('./ape-pulse-list.cjs');
}
