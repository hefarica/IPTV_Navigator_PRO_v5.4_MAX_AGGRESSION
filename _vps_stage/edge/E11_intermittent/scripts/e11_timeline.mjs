#!/usr/bin/env node
/** E11 · exploración: línea de tiempo de fallos por cliente en el log público 443.
 *  Solo lectura de runs/<stamp>/access443_cdn.log. */
import fs from 'node:fs';
import path from 'node:path';

const RUN = process.argv[2] || '.';
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const L = fs.readFileSync(path.join(RUN, 'access443_cdn.log'), 'utf8').split(/\r?\n/).filter(Boolean);
const rows = [];
for (const l of L) {
  const m = l.match(/^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\] "([A-Z]+) (\S+) [^"]*" (\d{3}) (\S+)/);
  if (!m) continue;
  rows.push({ ip: m[1], t: Date.UTC(+m[4], MON[m[3]], +m[2], +m[5], +m[6], +m[7]),
              iso: `${m[5]}:${m[6]}:${m[7]}`, url: m[10], status: +m[11], bytes: +m[12] });
}
const who = process.argv[3] || '146.70.86.222';
const sel = rows.filter((r) => r.ip === who).sort((a, b) => a.t - b.t);
console.log(`cliente ${who}: ${sel.length} peticiones · ${sel.filter(r=>r.status!==200).length} fallos`);
let prev = null;
for (const r of sel) {
  const gap = prev ? (((r.t - prev.t) / 1000) + "s").padStart(5) : '   — ';
  if (r.status !== 200) {
    console.log(`  ${r.iso} +${gap} ${r.status} ${String(r.bytes).padStart(4)}B  ${r.url.replace(/\/live\/[^/]+\/[^/]+\//, '/live/<U>/<P>/')}`);
  }
  prev = r;
}
console.log('\n— distribución —', JSON.stringify(sel.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {})));
const intervals = [];
for (let i = 1; i < sel.length; i++) intervals.push((sel[i].t - sel[i - 1].t) / 1000);
intervals.sort((a, b) => a - b);
if (intervals.length) {
  console.log('— intervalo entre peticiones del cliente: min', intervals[0], 'p50',
              intervals[Math.floor(intervals.length / 2)], 'max', intervals[intervals.length - 1], 's');
}
