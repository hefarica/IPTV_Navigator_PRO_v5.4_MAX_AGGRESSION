#!/usr/bin/env node
// Verification: every userinfo-looking token in the deliverable must be masked/templated.
import fs from 'node:fs';
const f = process.argv[2];
const t = fs.readFileSync(f, 'utf8');
const RE = /[a-z][a-z0-9+.-]*:\/\/[^\s@]+@/gi;
const rows = [];
for (const m of t.matchAll(RE)) rows.push(m[0]);
const safe = rows.filter((s) => /\*\*\*|<[a-z]+>/i.test(s));
console.log(JSON.stringify({ matches: rows.length, all_masked_or_templated: safe.length === rows.length, rows }, null, 2));
