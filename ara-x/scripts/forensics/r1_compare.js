#!/usr/bin/env node
'use strict';
/**
 * R1 · Structural comparison of two catalogue fingerprints (from r1_fingerprint.js).
 * Usage: node r1_compare.js <left.jsonl> <right.jsonl> [--out compare.json]
 * Emits aggregate + per-field + per-index deltas. No credentials involved.
 */
const fs = require('node:fs');
const readline = require('node:readline');

const FIELDS = ['id', 'profile', 'cfam', 'fps', 'bw', 'res', 'codecs', 'fr', 'hdcp', 'vr', 'sf', 'xres', 'xcodec', 'xrange', 'hdrs', 'url', 'host', 'scheme', 'lines', 'urls', 'si', 'country'];

async function load(path) {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) rows.push(JSON.parse(line));
  return rows;
}
const dist = (rows, f) => {
  const m = new Map();
  for (const r of rows) { const v = String(r[f]); m.set(v, (m.get(v) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

async function main() {
  const [a, b] = process.argv.slice(2);
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx !== -1 ? process.argv[outIdx + 1] : null;
  const A = await load(a), B = await load(b);
  const R = { left: a, right: b, left_channels: A.length, right_channels: B.length, fields: {} };

  const setA = (f) => new Set(A.map((r) => r[f]));
  const setB = (f) => new Set(B.map((r) => r[f]));
  for (const f of FIELDS) {
    const same = A.length === B.length ? A.filter((r, i) => String(r[f]) === String(B[i][f])).length : null;
    const mismatches = A.length === B.length ? A.length - same : null;
    R.fields[f] = {
      left_distinct: f === 'url' ? setA(f).size : (dist(A, f).length),
      right_distinct: f === 'url' ? setB(f).size : (dist(B, f).length),
      same_at_same_index: same,
      mismatched_at_index: mismatches,
      left_top: dist(A, f).slice(0, 12),
      right_top: dist(B, f).slice(0, 12),
    };
  }
  // set-level URL/identity comparison
  const urlA = new Map(), urlB = new Map();
  for (const r of A) urlA.set(r.url, (urlA.get(r.url) || 0) + 1);
  for (const r of B) urlB.set(r.url, (urlB.get(r.url) || 0) + 1);
  R.url_set = {
    only_left: [...urlA.keys()].filter((k) => !urlB.has(k)).length,
    only_right: [...urlB.keys()].filter((k) => !urlA.has(k)).length,
    shared: [...urlA.keys()].filter((k) => urlB.has(k)).length,
  };
  const idA = new Set(A.map((r) => r.id)), idB = new Set(B.map((r) => r.id));
  R.id_set = { only_left: [...idA].filter((k) => !idB.has(k)).length, only_right: [...idB].filter((k) => !idA.has(k)).length, shared: [...idA].filter((k) => idB.has(k)).length };
  // ordering check: first 20 ids both sides
  R.order_head = { left: A.slice(0, 12).map((r) => `${r.i}:${r.id}`), right: B.slice(0, 12).map((r) => `${r.i}:${r.id}`) };
  // per-index mismatch samples (first 10 per field)
  R.samples = {};
  for (const f of FIELDS) {
    const s = [];
    for (let i = 0; i < Math.min(A.length, B.length) && s.length < 10; i++) {
      if (String(A[i][f]) !== String(B[i][f])) s.push({ i, left: A[i][f], right: B[i][f], left_name: A[i].name, right_name: B[i].name });
    }
    R.samples[f] = s;
  }
  // byte/line totals
  R.totals = {
    left_lines: A.reduce((s, r) => s + r.lines, 0), right_lines: B.reduce((s, r) => s + r.lines, 0),
    left_bytes: A.reduce((s, r) => s + r.bytes, 0), right_bytes: B.reduce((s, r) => s + r.bytes, 0),
  };
  // duplicate detection per side
  R.dups = {
    left_url_dups: A.length - urlA.size, right_url_dups: B.length - urlB.size,
    left_id_dups: A.length - idA.size, right_id_dups: B.length - idB.size,
  };
  const json = JSON.stringify(R, null, 2);
  if (out) { fs.writeFileSync(out, json); console.log(`wrote ${out}`); } else console.log(json);
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
