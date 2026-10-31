#!/usr/bin/env node
'use strict';
/**
 * R1 · Cross-tabs over a fingerprint JSONL (profile × declared/measured fields).
 * Usage: node r1_crosstab.js <fp.jsonl> [--out out.json]
 */
const fs = require('node:fs');
const readline = require('node:readline');

const rows = [];
async function main() {
  const path = process.argv[2];
  if (!path) { console.error('usage: r1_crosstab.js <fp.jsonl> [--out out.json]'); process.exit(2); }
  const rl = readline.createInterface({ input: fs.createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) rows.push(JSON.parse(l));

  const tab = (a, b) => {
    const m = new Map();
    for (const r of rows) {
      const k = `${r[a]}|${r[b]}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([k, v]) => {
      const [x, y] = k.split('|'); return { a: x, b: y, n: v };
    });
  };
  const R = {
    channels: rows.length,
    profile_x_xres: tab('profile', 'xres'),
    profile_x_xcodec: tab('profile', 'xcodec'),
    profile_x_bw: tab('profile', 'bw'),
    profile_x_fr: tab('profile', 'fr'),
    profile_x_sf: tab('profile', 'sf'),
    profile_x_hdrs: tab('profile', 'hdrs'),
    profile_x_si: tab('profile', 'si'),
    xres_x_res: tab('xres', 'res'),
    codec_truth: rows.reduce((acc, r) => {
      const truthful4k = r.xres === '3840x2160' && r.res === '3840x2160' && /L153/.test(r.xcodec || '');
      const key = truthful4k ? 'truthful_4k_metadata' : 'declared_4k_wire_only';
      acc[key] = (acc[key] || 0) + 1; return acc;
    }, {}),
    hdcp_missing: rows.filter((r) => !r.hdcp).length,
    si_zero: rows.filter((r) => r.si === 0).map((r) => ({ i: r.i, id: r.id, name: r.name, group: r.group, profile: r.profile })),
    sf_zero_but_not_p1: rows.filter((r) => r.sf === 0 && r.profile !== 'P1').length,
    p1_without_sf: rows.filter((r) => r.profile === 'P1' && r.sf === 0).length,
    line_deltas_pending: null,
  };
  // line-count families
  const fam = new Map();
  for (const r of rows) fam.set(r.lines, (fam.get(r.lines) || 0) + 1);
  R.lines_families = [...fam.entries()].sort((a, b) => a[0] - b[0]).map(([lines, n]) => ({ lines, n }));
  const json = JSON.stringify(R, null, 2);
  const outIdx = process.argv.indexOf('--out');
  if (outIdx !== -1) { fs.writeFileSync(process.argv[outIdx + 1], json); console.log('wrote ' + process.argv[outIdx + 1]); }
  else console.log(json);
}
main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
