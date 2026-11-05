#!/usr/bin/env node
'use strict';
/**
 * Generador — declaraciones de mejora extrema por canal (autorización del
 * propietario, 2026-11-05). Se añaden al bloque de metadatos que
 * `apeFilterDialects` emite para CADA canal, para que las listas generadas
 * directamente en el navegador las lleven (el envoltorio ya las inyecta en las
 * listas envueltas).
 *
 * Sólo las que el template del generador NO trae ya (sin duplicar):
 *   HDR10+ 5000 nits · Dolby Vision 8.1 RPU declarado · minterpolate 120 ·
 *   marca de estado honesta.
 */
const fs = require('fs');
const path = require('path');

const GEN = path.join(__dirname, '..', '..', 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
let src = fs.readFileSync(GEN, 'utf8');

if (src.includes('APE-ENHANCE-STATE:DECLARED;OWNER=1')) {
  console.log('YA PARCHEADO');
  process.exit(0);
}

const anchor = "        if (exoB64) {\n            metadata.push('#EXT-X-SESSION-DATA:DATA-ID=\"ape.filters\",VALUE=\"' + exoB64 + '\"');\n        }";
if (!src.includes(anchor)) {
  console.error('NO ANCHOR');
  process.exit(1);
}

const ADD = anchor + "\n"
  + "        // ── [OWNER OVERRIDE 2026-11-05] Declaraciones de mejora extrema ──────\n"
  + "        // Autorizadas por el propietario. Metadata (RFC 8216 §6.3.1: ignorada por\n"
  + "        // players que no la entienden). NO tocan STREAM-INF/CODECS/RESOLUTION ni\n"
  + "        // SUPPLEMENTAL-CODECS. La última etiqueta dice el estado: DECLARED.\n"
  + "        metadata.push(\n"
  + "            '#EXT-X-APE-HDR10-PLUS:ENABLED;MAX_NITS=5000;MIN_NITS=0.0005;L1=per-scene',\n"
  + "            '#EXT-X-APE-DOLBY-VISION:ENABLED=true,PROFILE=8.1,RPU=DECLARED,CROSS_COMPATIBLE=true',\n"
  + "            '#EXT-X-APE-MINTERPOLATE:FPS=120;ME=epzs;MI_MODE=mci',\n"
  + "            '#EXT-X-APE-ENHANCE-STATE:DECLARED;OWNER=1;AUTHORIZED=2026-11-05;EXECUTION=engine_dependent'\n"
  + "        );";

fs.writeFileSync(GEN, src.replace(anchor, ADD), 'utf8');
console.log('PARCHEADO: declaraciones del propietario añadidas al generador');

