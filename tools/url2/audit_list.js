#!/usr/bin/env node
'use strict';
/**
 * audit_list.js — auditoría estructural de una lista generada, en streaming.
 * Uso: node audit_list.js <lista.m3u8> [--json]
 *
 * Mide sin interpretar: bytes, líneas, canales (EXTINF), STREAM-INF, URLs,
 * hosts, perfiles (ape-profile), familias de tags, declaraciones de mejora,
 * bloques EXTHTTP (validez JSON + nº de campos), EXTVLCOPT/KODIPROP por canal,
 * primeras/últimas líneas y una muestra de canales.
 */
const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');

const file = process.argv[2];
if (!file) { console.error('uso: node audit_list.js <lista.m3u8>'); process.exit(2); }

const st = {
  file, bytes: fs.statSync(file).size,
  lines: 0, extinf: 0, streaminf: 0, iframe: 0, urls: 0, extvlcopt: 0, kodiprop: 0,
  exthttp: 0, exthttp_bad: 0, exthttp_fields_total: 0,
  hosts: {}, profiles: {}, tagFamilies: {}, declarations: {},
  firstExtinf: null, lastUrl: null, sample: [], channels: [],
  maxBlockLines: 0, blocks: 0,
};

const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
let block = 0;
let cur = null;
const sha = crypto.createHash('sha256');

rl.on('line', (line) => {
  sha.update(line + '\n');
  st.lines++;
  block++;
  if (st.lines === 1) st.header1 = line.slice(0, 160);

  if (line.startsWith('#EXTINF')) {
    st.extinf++;
    if (!st.firstExtinf) st.firstExtinf = line.slice(0, 220);
    const m = /ape-profile="([^"]+)"/.exec(line);
    if (m) st.profiles[m[1]] = (st.profiles[m[1]] || 0) + 1;
    const id = /tvg-id="([^"]*)"/.exec(line);
    const name = /,(.*)$/.exec(line);
    cur = { id: id ? id[1] : '', name: name ? name[1] : '' };
    if (st.channels.length < 3) st.channels.push({ extinf: line.slice(0, 200) });
    return;
  }
  if (line.startsWith('#EXT-X-STREAM-INF')) st.streaminf++;
  if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF')) st.iframe++;
  if (line.startsWith('#EXTVLCOPT')) st.extvlcopt++;
  if (line.startsWith('#KODIPROP')) st.kodiprop++;
  if (line.startsWith('#EXTHTTP:')) {
    st.exthttp++;
    const raw = line.slice(9);
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') st.exthttp_fields_total += Object.keys(o).length;
      else st.exthttp_bad++;
    } catch (e) { st.exthttp_bad++; }
  }
  if (line.startsWith('#EXT-X-APE-')) {
    const fam = line.slice(0, 9 + 1 + 20).split(':')[0];
    st.tagFamilies[fam] = (st.tagFamilies[fam] || 0) + 1;
    for (const k of ['LCEVC-PHASE', 'HDR10-PLUS', 'DOLBY-VISION', 'MINTERPOLATE', 'ENHANCE-STATE', 'AI-SR']) {
      if (line.startsWith('#EXT-X-APE-' + k)) st.declarations[k] = (st.declarations[k] || 0) + 1;
    }
  }
  if (line && !line.startsWith('#') && /^https?:\/\//i.test(line.trim())) {
    st.urls++;
    st.lastUrl = line.slice(0, 160);
    try { const h = new URL(line.trim()).host; st.hosts[h] = (st.hosts[h] || 0) + 1; } catch (e) { st.hosts['(invalida)'] = (st.hosts['(invalida)'] || 0) + 1; }
    if (cur && st.channels.length < 6) st.channels[st.channels.length - 1].url = line.slice(0, 160);
    if (block > st.maxBlockLines) st.maxBlockLines = block;
    st.blocks++;
    block = 0;
  }
});
rl.on('close', () => {
  st.sha256 = sha.digest('hex');
  st.avg_block_lines = st.blocks ? +(st.lines / st.blocks).toFixed(2) : 0;
  delete st.channels;
  console.log(JSON.stringify(st, null, 2));
});
