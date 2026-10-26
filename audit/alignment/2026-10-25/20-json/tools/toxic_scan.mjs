#!/usr/bin/env node
// Toxic-header presence scan (EXTHTTP traps #9 / #10 / #13 / #14) across profile JSON artifacts.
// Reports JSON paths only (never full values).
import fs from 'node:fs';
const TOXIC = [/^Range$/i, /^If-None-Match$/i, /^If-Modified-Since$/i, /^TE$/i, /^Priority$/i, /^Upgrade-Insecure-Requests$/i, /^traceparent$/i, /^X-Requested-With$/i];
const out = {};
for (const f of process.argv.slice(2)) {
  const st = fs.statSync(f);
  const doc = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
  const hits = [];
  const walk = (n, p, d) => {
    if (d > 14 || n === null) return;
    if (Array.isArray(n)) { n.forEach((v, i) => walk(v, `${p}[${i}]`, d + 1)); return; }
    if (typeof n === 'object') {
      for (const [k, v] of Object.entries(n)) {
        const np = p ? `${p}.${k}` : k;
        if (TOXIC.some((r) => r.test(k))) {
          const val = typeof v === 'string' ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : typeof v;
          hits.push({ path: np, header: k, value_shape: val });
        }
        walk(v, np, d + 1);
      }
    }
  };
  walk(doc, '', 0);
  out[f] = { bytes: st.size, mtime: st.mtime.toISOString(), toxic_hits: hits.length, hits: hits.slice(0, 40) };
}
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(process.env.TOXIC_OUT || 'toxic_scan.json', JSON.stringify(out, null, 2));
