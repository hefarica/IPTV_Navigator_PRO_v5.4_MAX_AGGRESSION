#!/usr/bin/env node
// Masked URL-userinfo sampler (3 chars + ***). Never prints a full credential.
import fs from 'node:fs';
const mask3 = (s) => (typeof s === 'string' && s.length > 3 ? s.slice(0, 3) + '***' : '***');
const RE = /([a-z][a-z0-9+.-]*:\/\/)([^/@"'\s:]{1,80}):([^/@"'\s]{1,80})@/gi;
const files = process.argv.slice(2);
for (const f of files) {
  if (!fs.existsSync(f)) { console.log(f, '=> ABSENT'); continue; }
  const t = fs.readFileSync(f, 'latin1');
  const out = [];
  for (const m of t.matchAll(RE)) { out.push(`${m[1]}${mask3(m[2])}:${mask3(m[3])}@`); if (out.length >= 4) break; }
  console.log(f, '=>', JSON.stringify(out));
}
