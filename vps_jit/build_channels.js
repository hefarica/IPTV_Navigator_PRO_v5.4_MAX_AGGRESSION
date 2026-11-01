#!/usr/bin/env node
/**
 * Build JIT allowlist + M3U from an authorized APE list.
 * Usage: node vps_jit/build_channels.js <lista.m3u8> <out_dir> [public_base]
 * Writes channels.json and APE_JIT_LIST.m3u8. Does not execute or fetch URLs.
 */
'use strict';
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const [input, outDir, publicBaseArg] = process.argv.slice(2);
if (!input || !outDir) { console.error('usage: build_channels.js <lista.m3u8> <out_dir> [base]'); process.exit(2); }
const publicBase = (publicBaseArg || 'https://iptv-ape.duckdns.org/jit').replace(/\/+$/, '');
fs.mkdirSync(outDir, { recursive: true });

function attrs(line) {
  const a = {};
  for (const m of line.matchAll(/([\w-]+)="([^"]*)"/g)) a[m[1]] = m[2];
  return a;
}
function safe(s) {
  return String(s || '').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}
function channelId(a, name, n, used) {
  let base = safe(a['tvg-id'] || '') || safe(name) || ('ch_' + n);
  if (!base) base = 'ch_' + n;
  let id = base, i = 1;
  while (used.has(id)) id = base + '_' + (++i);
  used.add(id);
  return id;
}

const used = new Set();
const map = {};
const entries = [];
let pending = null;

const rl = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity });
rl.on('line', line => {
  if (line.startsWith('#EXTINF')) { pending = { attrs: attrs(line), name: (line.split(',').pop() || '').trim() }; return; }
  if (!pending || !line.trim() || line.startsWith('#')) return;
  if (!/^https?:\/\//i.test(line)) { pending = null; return; }
  const idx = entries.length + 1;
  const id = channelId(pending.attrs, pending.name, idx, used);
  map[id] = { url: line.trim(), ua: pending.attrs['http-user-agent'] || 'VLC/3.0.19 LibVLC/3.0.19' };
  entries.push({
    id,
    name: pending.name || id,
    group: pending.attrs['group-title'] || '',
    tvg: pending.attrs['tvg-id'] || '',
    logo: pending.attrs['tvg-logo'] || '',
  });
  pending = null;
});
rl.on('close', () => {
  fs.writeFileSync(path.join(outDir, 'channels.json'), JSON.stringify(map));
  let out = '#EXTM3U\n';
  for (const e of entries) {
    out += `#EXTINF:-1 tvg-id="${e.tvg || e.id}" tvg-name="${e.name.replace(/"/g, '')}"`;
    if (e.logo) out += ` tvg-logo="${e.logo.replace(/"/g, '')}"`;
    if (e.group) out += ` group-title="${e.group.replace(/"/g, '')}"`;
    out += ` x-json-metadata="${publicBase}/live/${e.id}/manifest.json"`;
    out += `,${e.name.replace(/\r?\n/g, ' ')}\n${publicBase}/live/${e.id}/master.m3u8\n`;
  }
  fs.writeFileSync(path.join(outDir, 'APE_JIT_LIST.m3u8'), out);
  console.log(JSON.stringify({ channels: entries.length, mapBytes: fs.statSync(path.join(outDir, 'channels.json')).size, listBytes: fs.statSync(path.join(outDir, 'APE_JIT_LIST.m3u8')).size }, null, 2));
});
