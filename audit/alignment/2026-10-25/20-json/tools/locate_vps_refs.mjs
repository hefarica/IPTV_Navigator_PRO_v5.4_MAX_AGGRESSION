#!/usr/bin/env node
// Locate risky header/URL locations (own-VPS domain in Referer/Origin = EXTHTTP WAF trap 14) without printing values.
import fs from 'node:fs';
const files = process.argv.slice(2);
const VPS_RE = /iptv-ape\.duckdns\.org|178\.156\.147\.234|hetzner/i;
for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  const hits = [];
  const walk = (n, p, d) => {
    if (d > 14 || n === null) return;
    if (Array.isArray(n)) { n.forEach((v, i) => walk(v, `${p}[${i}]`, d + 1)); return; }
    if (typeof n === 'object') { for (const [k, v] of Object.entries(n)) walk(v, p ? `${p}.${k}` : k, d + 1); return; }
    if (typeof n === 'string' && VPS_RE.test(n)) hits.push({ path: p, len: n.length, kind: /referer|origin/i.test(p) ? 'REFERER_OR_ORIGIN' : 'OTHER' });
  };
  walk(doc, '', 0);
  const grouped = {};
  for (const h of hits) { const key = h.path.replace(/\[\d+\]/g, '[]') + '|' + h.kind; grouped[key] = (grouped[key] || 0) + 1; }
  console.log('===', f, '| hits:', hits.length);
  console.log(JSON.stringify(grouped, null, 1));
  const refOrigin = hits.filter((h) => h.kind === 'REFERER_OR_ORIGIN');
  console.log('REFERER/ORIGIN hits:', refOrigin.length, refOrigin.slice(0, 5).map((h) => h.path));
}
