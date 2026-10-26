#!/usr/bin/env node
// Masked inspection of "username"/"password" JSON keys in selected files (3 chars + ***).
import fs from 'node:fs';
const mask3 = (s) => (typeof s === 'string' ? (s.length > 3 ? s.slice(0, 3) + '***' : '***') : '***');
const RE = /"(username|password)"\s*:\s*"([^"]*)"/g;
for (const f of process.argv.slice(2)) {
  if (!fs.existsSync(f)) { console.log(f, '=> ABSENT'); continue; }
  const t = fs.readFileSync(f, 'utf8');
  const hits = [];
  for (const m of t.matchAll(RE)) hits.push({ key: m[1], len: m[2].length, masked: mask3(m[2]) });
  console.log(f, '=>', JSON.stringify(hits));
}
