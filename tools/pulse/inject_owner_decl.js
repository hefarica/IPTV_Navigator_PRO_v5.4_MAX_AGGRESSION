#!/usr/bin/env node
'use strict';
/**
 * inyecta las declaraciones del propietario en una lista YA SERVIDA, en streaming.
 * Se usa para no esperar a un re-wrap (que la guarda de disco bloquea con 96%).
 *
 * - Escribe a <out>.new y renombra atómicamente: la lista servida nunca queda a medias.
 * - Idempotente: si el bloque ya trae #EXT-X-APE-ENHANCE-STATE, no duplica.
 * - Sólo añade las 4 declaraciones que faltaban (LCEVC-PHASE ya venía del generador).
 *
 * Uso: node inject_owner_decl.js <lista.m3u8> [--apply]
 *      sin --apply hace dry-run (cuenta canales y bytes estimados).
 */
const fs = require('fs');
const readline = require('readline');

const BLOCK = [
  '#EXT-X-APE-HDR10-PLUS:ENABLED;MAX_NITS=5000;MIN_NITS=0.0005;L1=per-scene',
  '#EXT-X-APE-DOLBY-VISION:ENABLED=true,PROFILE=8.1,RPU=DECLARED,CROSS_COMPATIBLE=true',
  '#EXT-X-APE-MINTERPOLATE:FPS=120;ME=epzs;MI_MODE=mci',
  '#EXT-X-APE-ENHANCE-STATE:DECLARED;OWNER=1;AUTHORIZED=2026-11-05;EXECUTION=engine_dependent',
];

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) { console.error('falta <lista.m3u8>'); process.exit(2); }

const tmp = file + '.owner.new';
const out = fs.createWriteStream(tmp);
const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });

let blockLines = [];
let channels = 0;
let injected = 0;
let already = 0;
let bytesIn = 0;

function flushBlock() {
  blockLines = [];
}

rl.on('line', (line) => {
  bytesIn += line.length + 1;
  if (line.startsWith('#EXTINF')) {
    blockLines = [line];
    return;
  }
  if (line && !line.startsWith('#') && /^https?:\/\//i.test(line.trim())) {
    // [FIX 2026-11-05] Escribir PRIMERO el bloque original (EXTINF + directivas).
    // La versión anterior no lo escribía y borró 10.573 EXTINF de la lista servida.
    const hasDecl = blockLines.some((l) => l.startsWith('#EXT-X-APE-ENHANCE-STATE'));
    for (const l of blockLines) out.write(l + '\n');
    if (hasDecl) {
      already++;
    } else {
      for (const l of BLOCK) out.write(l + '\n');
      injected++;
    }
    channels++;
    out.write(line + '\n');
    flushBlock();
    return;
  }
  // Dentro de un bloque (después de #EXTINF y antes de la URL) sólo se bufferiza:
  // escribirlo además provocaría duplicar cada directiva (bug detectado 2026-11-05).
  if (blockLines.length) { blockLines.push(line); return; }
  out.write(line + '\n');
});

rl.on('close', () => {
  out.end(() => {
    const statIn = fs.statSync(file).size;
    const statOut = fs.statSync(tmp).size;
    const info = {
      file, channels, injected, already,
      bytes_in: statIn, bytes_out: statOut, delta: statOut - statIn,
      mode: apply ? 'applied' : 'dry-run', tmp: apply ? tmp : undefined,
    };
    if (apply) {
      fs.renameSync(tmp, file);
      info.renamed = true;
    } else {
      fs.unlinkSync(tmp);
    }
    console.log(JSON.stringify(info, null, 2));
  });
});


