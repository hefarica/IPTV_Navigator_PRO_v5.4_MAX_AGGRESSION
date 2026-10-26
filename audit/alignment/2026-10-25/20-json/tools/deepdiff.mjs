#!/usr/bin/env node
// Deep semantic diff between two JSON documents (order-insensitive for object keys).
import fs from 'node:fs';
const [aPath, bPath] = process.argv.slice(2);
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const A = read(aPath), B = read(bPath);
const diffs = [];
const MAX = 60;
function walk(a, b, path) {
  if (diffs.length >= MAX) return;
  const ta = Array.isArray(a) ? 'array' : a === null ? 'null' : typeof a;
  const tb = Array.isArray(b) ? 'array' : b === null ? 'null' : typeof b;
  if (ta !== tb) { diffs.push({ path, kind: 'type', a: ta, b: tb }); return; }
  if (ta === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    const onlyA = ka.filter((k) => !(k in b)), onlyB = kb.filter((k) => !(k in a));
    if (onlyA.length) diffs.push({ path, kind: 'keys_only_in_A', keys: onlyA.slice(0, 12), count: onlyA.length });
    if (onlyB.length) diffs.push({ path, kind: 'keys_only_in_B', keys: onlyB.slice(0, 12), count: onlyB.length });
    for (const k of ka) if (k in b) walk(a[k], b[k], path ? `${path}.${k}` : k);
    return;
  }
  if (ta === 'array') {
    if (a.length !== b.length) diffs.push({ path, kind: 'array_len', a: a.length, b: b.length });
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) walk(a[i], b[i], `${path}[${i}]`);
    return;
  }
  if (a !== b) diffs.push({ path, kind: 'value', a: typeof a === 'string' && a.length > 120 ? a.slice(0, 120) + '…' : a, b: typeof b === 'string' && b.length > 120 ? b.slice(0, 120) + '…' : b });
}
walk(A, B, '');
const stat = (p) => {
  const raw = fs.readFileSync(p, 'utf8');
  return { bytes: Buffer.byteLength(raw), newlines: (raw.match(/\n/g) || []).length, leading_spaces_sample: (raw.match(/\n( +)"/) || [])[1]?.length ?? 0 };
};
const out = { A: aPath, B: bPath, formatting_A: stat(aPath), formatting_B: stat(bPath), diff_count: diffs.length, diffs };
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(process.argv[2] + '.deepdiff.json', JSON.stringify(out, null, 2));
