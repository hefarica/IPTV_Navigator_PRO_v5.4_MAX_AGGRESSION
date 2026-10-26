#!/usr/bin/env node
// Collision / duplicate detection inside each channels_map copy (read-only).
import fs from 'node:fs';
const dir = process.argv[2];
const load = (n) => JSON.parse(fs.readFileSync(`${dir}/${n}`, 'utf8'));
const F = load('ids_frontend.json'), B = load('ids_backend.json'), D = load('ids_frontend_data.json');
function caseCollisions(keys) {
  const m = new Map();
  for (const k of keys) { const lk = k.toLowerCase(); if (!m.has(lk)) m.set(lk, []); m.get(lk).push(k); }
  const groups = [...m.values()].filter((g) => g.length > 1);
  return { groups: groups.length, extra_records: groups.reduce((a, g) => a + g.length - 1, 0), sample: groups.slice(0, 10) };
}
const out = {
  backend_case_insensitive_collisions: caseCollisions(B.top_keys),
  frontend_data_case_insensitive_collisions: caseCollisions(D.top_keys),
  frontend_case_insensitive_collisions: caseCollisions(F.top_keys),
  note: 'case-insensitive collisions = same channel identity emitted with different casing (risk of double-emit / EPG split)',
};
fs.writeFileSync(`${dir}/channels_map_collisions.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
