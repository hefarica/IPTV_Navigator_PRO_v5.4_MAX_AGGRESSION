#!/usr/bin/env node
/**
 * audit_ape_m3u8.js — auditoría local de una lista APE generada.
 *
 * Uso:
 *   node tools/audit_ape_m3u8.js ruta/o/url.m3u8
 *
 * No hardcodea headers ni valores: lee la lista y puntúa lo que realmente trae.
 * Salida: informe legible + JSON con score 0-100.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');

const MAX_EXTHTTP_HEADERS = 200;
const MAX_EXTHTTP_BYTES = 8192;
const MAX_METADATA_CHUNK = 4096;

function readInput(src) {
  if (/^https?:\/\//i.test(src)) {
    const mod = src.startsWith('https:') ? https : http;
    return new Promise((resolve, reject) => {
      mod.get(src, { headers: { 'User-Agent': 'APE-Audit/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          readInput(new URL(res.headers.location, src).toString()).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }).on('error', reject);
    });
  }
  return Promise.resolve(fs.readFileSync(src, 'utf8'));
}

function decodeMeta(lines) {
  const chunkLines = lines.filter(l => l.startsWith('#EXT-X-APE-LAB-METADATA:'));
  if (!chunkLines.length) return { chunks: 0, json: null, bytes: 0, bad: 'sin metadata' };
  const parts = {};
  let total = 0;
  let bad = '';
  for (const l of chunkLines) {
    const b = l.slice('#EXT-X-APE-LAB-METADATA:'.length).trim();
    const m = b.match(/^(\d+)\/(\d+):(.+)$/);
    if (!m) { bad = 'chunk sin formato i/N'; continue; }
    const i = parseInt(m[1], 10);
    total = parseInt(m[2], 10);
    parts[i] = m[3];
    if (m[3].length > MAX_METADATA_CHUNK) bad = 'chunk > ' + MAX_METADATA_CHUNK;
  }
  if (!bad && Object.keys(parts).length !== total) bad = 'faltan chunks';
  let b64 = '';
  for (let i = 1; i <= total; i++) b64 += parts[i] || '';
  try {
    const raw = Buffer.from(b64, 'base64');
    return { chunks: total, json: JSON.parse(raw.toString('utf8')), bytes: raw.length, bad };
  } catch (e) {
    return { chunks: total, json: null, bytes: 0, bad: 'base64/json inválido: ' + e.message };
  }
}

function flattenCount(fields) {
  let n = 0;
  for (const v of Object.values(fields || {})) {
    if (Array.isArray(v)) n += v.length;
    else if (v && typeof v === 'object') n += Object.keys(v).length;
    else n++;
  }
  return n;
}

async function main() {
  const src = process.argv[2];
  if (!src) { console.error('uso: node tools/audit_ape_m3u8.js <lista.m3u8|https://...>'); process.exit(2); }
  const text = await readInput(src);
  const lines = text.split(/\r?\n/);
  const extinf = lines.filter(l => l.startsWith('#EXTINF')).length;
  const extinfWithUri = (() => {
    let n = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#EXTINF')) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].trim()) continue;
        if (lines[j].startsWith('#EXTINF')) break;
        if (/^https?:\/\//i.test(lines[j])) { n++; break; }
      }
    }
    return n;
  })();
  const exthttpLines = lines.filter(l => l.startsWith('#EXTHTTP:'));
  let exthttpHeaders = 0;
  let exthttpBytes = 0;
  let exthttpBad = '';
  for (const l of exthttpLines) {
    try {
      const o = JSON.parse(l.slice(9));
      exthttpHeaders += Object.keys(o).length;
      exthttpBytes += l.length - 9;
    } catch (e) { exthttpBad = 'JSON inválido'; }
  }
  const overflow = lines.filter(l => l.startsWith('#EXT-X-APE-OVERFLOW-HEADERS:'));
  let overflowHeaders = 0;
  let overflowBad = '';
  for (const l of overflow) {
    try {
      overflowHeaders += Object.keys(JSON.parse(Buffer.from(l.slice('#EXT-X-APE-OVERFLOW-HEADERS:'.length), 'base64').toString('utf8'))).length;
    } catch (e) { overflowBad = 'overflow base64/json inválido'; }
  }
  const meta = decodeMeta(lines);
  const metaFields = meta.json ? flattenCount(meta.json.fields) : 0;
  const metaSections = meta.json ? Object.keys(meta.json.fields || {}).length : 0;
  const hdrCount = meta.json ? Object.keys(meta.json.fields?.headerOverrides || {}).length : 0;
  const first = lines[0] || '';

  const score = {
    extm3u: first.startsWith('#EXTM3U') ? 5 : 0,
    version: lines.some(l => l.startsWith('#EXT-X-VERSION:')) ? 5 : 0,
    structure: extinf > 0 && extinfWithUri === extinf ? 15 : 0,
    metadata: meta.json && !meta.bad ? 20 : 0,
    metadataFields: metaFields >= 632 ? 10 : (metaFields >= 400 ? 7 : 0),
    exthttp: !exthttpBad ? 15 : 0,
    cap: !exthttpBad && exthttpHeaders <= MAX_EXTHTTP_HEADERS && exthttpBytes < MAX_EXTHTTP_BYTES ? 15 : 0,
    overflow: overflow.length > 0 && !overflowBad ? 10 : 0,
    dynamic: metaSections >= 10 && hdrCount >= 200 ? 5 : 0
  };
  const total = Object.values(score).reduce((a, b) => a + b, 0);
  const report = {
    source: src,
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: lines.length,
    channels: extinf,
    channelsWithUri: extinfWithUri,
    exthttp: { lines: exthttpLines.length, headers: exthttpHeaders, payloadBytes: exthttpBytes, valid: !exthttpBad, error: exthttpBad || null },
    exthttpCap: { maxHeaders: MAX_EXTHTTP_HEADERS, maxBytes: MAX_EXTHTTP_BYTES, overflowHeaders, overflowValid: !overflowBad, overflowError: overflowBad || null },
    metadata: { chunks: meta.chunks, bytes: meta.bytes, sections: metaSections, fields: metaFields, headerOverrides: hdrCount, profile: meta.json?.profile || null, valid: !!meta.json && !meta.bad, error: meta.bad || null },
    score: { ...score, total }
  };
  console.log(JSON.stringify(report, null, 2));
  const verdict = total >= 95 ? 'CERTIFICABLE (estructura/metadata)' : total >= 85 ? 'REVISAR reproducción' : 'NO APTO';
  console.log('\n== APE AUDIT ' + total + '/100 · ' + verdict + ' ==');
  if (total < 100) process.exitCode = 1;
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
