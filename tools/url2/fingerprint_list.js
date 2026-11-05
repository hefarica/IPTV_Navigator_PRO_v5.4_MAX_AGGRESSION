#!/usr/bin/env node
'use strict';
/**
 * fingerprint_list.js — huellas por clase de línea para comparar dos listas sin
 * diff completo: URL, EXTHTTP, EXTINF, resto. Uso: node fingerprint_list.js <lista> [--json]
 */
const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');

const file = process.argv[2];
if (!file) { console.error('uso: node fingerprint_list.js <lista>'); process.exit(2); }

const H = {
  urls: crypto.createHash('sha256'), exthttp: crypto.createHash('sha256'),
  extinf: crypto.createHash('sha256'), rest: crypto.createHash('sha256'),
  all: crypto.createHash('sha256'),
};
const C = { urls: 0, exthttp: 0, extinf: 0, rest: 0 };
const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });

rl.on('line', (line) => {
  H.all.update(line + '\n');
  if (/^https?:\/\//i.test(line.trim())) { C.urls++; H.urls.update(line + '\n'); return; }
  if (line.startsWith('#EXTHTTP:')) { C.exthttp++; H.exthttp.update(line + '\n'); return; }
  if (line.startsWith('#EXTINF')) { C.extinf++; H.extinf.update(line + '\n'); return; }
  C.rest++; H.rest.update(line + '\n');
});
rl.on('close', () => {
  const out = { file, counts: C };
  for (const k of Object.keys(H)) out[k] = H[k].digest('hex');
  console.log(JSON.stringify(out, null, 2));
});
