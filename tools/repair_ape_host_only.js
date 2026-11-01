#!/usr/bin/env node
/**
 * repair_ape_host_only.js — reemplaza URIs host-only usando una fuente sana.
 * Uso: node tools/repair_ape_host_only.js <rota.m3u8> <fuente.m3u8[.gz]> <salida.m3u8>
 * Mapea por tvg-id y, si falta, por tvg-name.
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

const [badPath, goodPath, outPath] = process.argv.slice(2);
if (!badPath || !goodPath || !outPath) {
  console.error('uso: node tools/repair_ape_host_only.js <rota.m3u8> <fuente.m3u8[.gz]> <salida.m3u8>');
  process.exit(2);
}
const isGz = /\.gz$/i.test(goodPath);
const input = isGz ? fs.createReadStream(goodPath).pipe(zlib.createGunzip()) : fs.createReadStream(goodPath);

const byId = new Map();
const byName = new Map();
let attrs = {};
let count = 0;

function parseAttrs(line) {
  const a = {};
  for (const m of line.matchAll(/([\w-]+)="([^"]*)"/g)) a[m[1]] = m[2];
  return a;
}

function indexLine(line) {
  if (line.startsWith('#EXTINF')) { attrs = parseAttrs(line); return; }
  if (!line.trim() || line.startsWith('#')) return;
  if (!/^https?:\/\//i.test(line)) return;
  const id = attrs['tvg-id'] || '';
  const name = attrs['tvg-name'] || (line && '');
  if (id) byId.set(id, line.trim());
  if (name) byName.set(name, line.trim());
  attrs = {};
  count++;
}

function indexSource() {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    rl.on('line', indexLine);
    rl.on('close', resolve);
    rl.on('error', reject);
  });
}

function repair() {
  const out = fs.createWriteStream(outPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fs.createReadStream(badPath), crlfDelay: Infinity });
  let current = {};
  let replaced = 0, missing = 0, kept = 0, pending = false;
  rl.on('line', (line) => {
    if (line.startsWith('#EXTINF')) { current = parseAttrs(line); pending = true; out.write(line + '\n'); return; }
    if (pending && line.trim() && !line.startsWith('#')) {
      pending = false;
      const id = current['tvg-id'] || '';
      const name = current['tvg-name'] || '';
      if (/^https?:\/\//i.test(line)) { out.write(line + '\n'); kept++; }
      else {
        const good = (id && byId.get(id)) || (name && byName.get(name));
        if (good) { out.write(good + '\n'); replaced++; }
        else { out.write(line + '\n'); missing++; }
      }
      return;
    }
    out.write(line + '\n');
  });
  rl.on('close', () => out.end(() => {
    console.log(JSON.stringify({ source_channels: count, replaced, missing, kept, out: outPath }, null, 2));
  }));
  rl.on('error', (e) => { console.error(e); out.destroy(); process.exit(1); });
}

indexSource().then(repair).catch(e => { console.error(e); process.exit(1); });
