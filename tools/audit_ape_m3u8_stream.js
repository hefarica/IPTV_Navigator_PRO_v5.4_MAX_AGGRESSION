#!/usr/bin/env node
/**
 * audit_ape_m3u8_stream.js — auditoría streaming para listas APE gigantes.
 * Uso: node tools/audit_ape_m3u8_stream.js <lista.m3u8>
 * No carga el archivo completo; lee línea a línea.
 */
'use strict';
const fs = require('fs');
const readline = require('readline');

const MAX_EXTHTTP_HEADERS = 200;
const MAX_EXTHTTP_BYTES = 8192;
const MAX_METADATA_CHUNK = 4096;
const file = process.argv[2];
if (!file) { console.error('uso: node tools/audit_ape_m3u8_stream.js <lista.m3u8>'); process.exit(2); }

let lines = 0, first = '', version = false;
let extinf = 0, extinfWithUri = 0, pendingExtinf = false;
let exthttpLines = 0, exthttpMaxHeaders = 0, exthttpMaxBytes = 0, exthttpViolations = 0, exthttpBad = 0;
let overflowLines = 0, overflowTotalHeaders = 0, overflowBad = 0;
let metaTotal = 0, metaBad = '';
const metaChunks = new Map();

const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
rl.on('line', (line) => {
  lines++;
  if (lines === 1) first = line;
  if (line.startsWith('#EXT-X-VERSION:')) version = true;

  // Tags de metadata y headers: procesar SIEMPRE, también dentro del bloque
  // #EXTINF, porque el generador los emite antes de la URL final.
  if (line.startsWith('#EXTHTTP:')) {
    exthttpLines++;
    try {
      const obj = JSON.parse(line.slice(9));
      const n = Object.keys(obj).length;
      const bytes = line.slice(9).length;
      if (n > exthttpMaxHeaders) exthttpMaxHeaders = n;
      if (bytes > exthttpMaxBytes) exthttpMaxBytes = bytes;
      if (n > MAX_EXTHTTP_HEADERS || bytes >= MAX_EXTHTTP_BYTES) exthttpViolations++;
    } catch (_) { exthttpBad++; }
    return;
  }
  if (line.startsWith('#EXT-X-APE-OVERFLOW-HEADERS:')) {
    overflowLines++;
    try {
      const b64 = line.slice('#EXT-X-APE-OVERFLOW-HEADERS:'.length);
      overflowTotalHeaders += Object.keys(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))).length;
    } catch (_) { overflowBad++; }
    return;
  }
  if (line.startsWith('#EXT-X-APE-LAB-METADATA:')) {
    const b = line.slice('#EXT-X-APE-LAB-METADATA:'.length).trim();
    const m = b.match(/^(\d+)\/(\d+):(.+)$/);
    if (!m) { metaBad = 'chunk sin formato i/N'; return; }
    const i = parseInt(m[1], 10);
    metaTotal = parseInt(m[2], 10);
    if (m[3].length > MAX_METADATA_CHUNK) metaBad = 'chunk > ' + MAX_METADATA_CHUNK;
    metaChunks.set(i, m[3]);
    return;
  }

  if (line.startsWith('#EXTINF')) {
    extinf++;
    pendingExtinf = true;
    return;
  }
  if (pendingExtinf) {
    if (!line.trim()) return;
    if (/^https?:\/\//i.test(line)) { extinfWithUri++; pendingExtinf = false; return; }
    // tags intermedios no cierran el bloque; la URL puede llegar después.
    return;
  }
});

rl.on('close', () => {
  let b64 = '';
  if (!metaBad) {
    if (metaChunks.size !== metaTotal) metaBad = 'faltan chunks';
    else for (let i = 1; i <= metaTotal; i++) b64 += metaChunks.get(i) || '';
  }
  let meta = null, metaBytes = 0, sections = 0, fields = 0, headerOverrides = 0, profile = null;
  if (!metaBad) {
    try {
      const raw = Buffer.from(b64, 'base64');
      metaBytes = raw.length;
      meta = JSON.parse(raw.toString('utf8'));
      profile = meta.profile || null;
      const f = meta.fields || {};
      sections = Object.keys(f).length;
      for (const v of Object.values(f)) {
        if (Array.isArray(v)) fields += v.length;
        else if (v && typeof v === 'object') fields += Object.keys(v).length;
        else fields++;
      }
      headerOverrides = Object.keys(f.headerOverrides || {}).length;
    } catch (e) { metaBad = 'base64/json inválido: ' + e.message; }
  }
  const score = {
    extm3u: first.startsWith('#EXTM3U') ? 5 : 0,
    version: version ? 5 : 0,
    structure: extinf > 0 && extinfWithUri === extinf ? 15 : 0,
    metadata: meta && !metaBad ? 20 : 0,
    metadataFields: fields >= 632 ? 10 : (fields >= 400 ? 7 : 0),
    exthttp: exthttpLines > 0 && exthttpBad === 0 ? 15 : 0,
    cap: exthttpLines > 0 && exthttpBad === 0 && exthttpViolations === 0 ? 15 : 0,
    overflow: overflowLines > 0 && overflowBad === 0 ? 10 : 0,
    dynamic: sections >= 10 && headerOverrides >= 200 ? 5 : 0
  };
  const total = Object.values(score).reduce((a, b) => a + b, 0);
  console.log(JSON.stringify({
    file,
    bytes: fs.statSync(file).size,
    lines,
    channels: extinf,
    channelsWithUri: extinfWithUri,
    exthttp: { lines: exthttpLines, maxHeadersPerChannel: exthttpMaxHeaders, maxPayloadBytesPerChannel: exthttpMaxBytes, capViolations: exthttpViolations, invalidJson: exthttpBad },
    cap: { maxHeaders: MAX_EXTHTTP_HEADERS, maxBytes: MAX_EXTHTTP_BYTES, overflowLines, overflowHeadersTotal: overflowTotalHeaders, overflowInvalid: overflowBad },
    metadata: { chunks: metaChunks.size, total: metaTotal, bytes: metaBytes, sections, fields, headerOverrides, profile, valid: !!meta && !metaBad, error: metaBad || null },
    score: { ...score, total }
  }, null, 2));
  console.log('\n== APE AUDIT ' + total + '/100 ' + (total >= 95 ? 'CERTIFICABLE estructura/metadata' : 'REVISAR') + ' ==');
  if (total < 100) process.exitCode = 1;
});
