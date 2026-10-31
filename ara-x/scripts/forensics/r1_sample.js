#!/usr/bin/env node
'use strict';
/**
 * R1 · Structural sampler for APE M3U8 catalogues.
 * Prints the header block and the first N channel blocks with URIs masked
 * (host kept, long path segments replaced by <Nc>) so no credentials reach the terminal.
 *
 * Usage: node ara-x/scripts/forensics/r1_sample.js <playlist> [blockCount=1]
 */
const fs = require('node:fs');
const readline = require('node:readline');

const MASK = (u) => {
  const m = /^([a-z][a-z0-9+.-]*:\/\/)([^/]+)(\/?.*)$/i.exec(u);
  if (!m) return `<non-url len=${u.length}>`;
  const segs = (m[3] || '').split('/');
  const masked = segs.map((s, i) => (i === 0 || s.length < 6 ? s : `<${s.length}c>`)).join('/');
  return m[1] + m[2] + masked;
};
const trunc = (l, n = 320) => (l.length > n ? l.slice(0, n) + `…(len=${l.length})` : l);

async function main() {
  const path = process.argv[2];
  const blockCount = Number(process.argv[3] || 1);
  const fromLine = Number(process.env.R1_FROM || 0);
  const toLine = Number(process.env.R1_TO || 0);
  if (!path) { console.error('usage: r1_sample.js <playlist> [blockCount]  (env R1_FROM/R1_TO for line range)'); process.exit(2); }

  const rl = readline.createInterface({
    input: fs.createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let n = 0, blockIdx = -1;
  for await (const raw of rl) {
    n++;
    const line = raw.replace(/\r$/, '');
    if (fromLine && n >= fromLine && n <= (toLine || Infinity)) {
      console.log(`${n}\t${line.startsWith('#') ? trunc(line, 500) : 'URI ' + MASK(line)}`);
      if (n === toLine) break;
      continue;
    }
    if (fromLine) continue;
    if (line.startsWith('#EXTINF:')) {
      blockIdx++;
      if (blockIdx >= blockCount) break;
      console.log(`\n===== BLOCK ${blockIdx} @line ${n} =====`);
      console.log(trunc(line));
      continue;
    }
    if (blockIdx < 0) { console.log('H ' + trunc(line)); continue; }
    if (line === '') { console.log('<empty>'); continue; }
    console.log(line.startsWith('#') ? trunc(line) : 'URI ' + MASK(line));
  }
  rl.close();
  console.log(`\n[stopped at line ${n}; blocks shown=${blockIdx}]`);
}

main().catch((e) => { console.error(e); process.exit(1); });
