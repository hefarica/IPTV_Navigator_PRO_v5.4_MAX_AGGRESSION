#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E4 · ¿Se puede cachear el destino del 302? — análisis de TASA DE ACIERTO
 * ═══════════════════════════════════════════════════════════════════════════
 * Una caché `host+path → URL_final` solo sirve si la MISMA clave se vuelve a
 * pedir dentro del TTL. Este script mide exactamente eso sobre el log real:
 *   1) distribución de huecos entre peticiones de la misma clave,
 *   2) tasa de acierto alcanzable para TTL ∈ {2..60} s,
 *   3) desglose por clase de cliente (la caché es GLOBAL: cualquier cliente
 *      calienta la clave, pero el arnés de medida NO debe contarse — inflaría
 *      el resultado—, así que se calcula por separado),
 *   4) ahorro esperado = tasa × salto del proveedor.
 *
 * Uso: node e4_hitrate.mjs <access_log_redactado> [provider_hop_ms]
 * ═══════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';

const FILE = process.argv[2];
const PROVIDER_HOP_MS = Number(process.argv[3] || 290);   // medido en vivo
const TTLS = [2, 3, 5, 8, 10, 15, 30, 60];
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

const REAL = new Set(['146.70.86.222', '181.130.154.235']);
const HARNESS = new Set(['178.156.147.234', '127.0.0.1']);
const cls = (ip) => (REAL.has(ip) ? 'real' : HARNESS.has(ip) ? 'harness' : 'scanner');

const rows = [];
for (const l of fs.readFileSync(FILE, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\] "([A-Z]+) (\S+) [^"]*" (\d{3}) (\S+)/);
  if (!m) continue;
  const url = m[10];
  if (!url.startsWith('/cdn/')) continue;
  const q = url.indexOf('?');
  const path = q >= 0 ? url.slice(0, q) : url;
  const query = q >= 0 ? url.slice(q + 1) : '';
  const hm = path.match(/^\/cdn\/([^/]+)(\/.*)$/);
  rows.push({
    t: Date.UTC(+m[4], MON[m[3]], +m[2], +m[5], +m[6], +m[7]),
    ip: m[1], cls: cls(m[1]), status: +m[11], bytes: +m[12],
    key: hm ? `${hm[1]}${hm[2]}` : path, host: hm ? hm[1] : '?', query,
  });
}
rows.sort((a, b) => a.t - b.t);

/* ── 1 · huecos por clave, por subconjunto ─────────────────────────────────── */
function gapsFor(filter) {
  const last = new Map();
  const gaps = [];
  for (const r of rows) {
    if (!filter(r)) continue;
    const prev = last.get(r.key);
    if (prev !== undefined) gaps.push((r.t - prev) / 1000);
    last.set(r.key, r.t);
  }
  return gaps;
}
const pct = (a, p) => (a.length ? +[...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))].toFixed(2) : null);

function hitRate(filter, ttl) {
  const last = new Map();
  let n = 0, hit = 0;
  for (const r of rows) {
    if (!filter(r)) continue;
    n++;
    const prev = last.get(r.key);
    if (prev !== undefined && (r.t - prev) <= ttl * 1000) hit++;
    last.set(r.key, r.t);
  }
  return { ttl_s: ttl, requests: n, hits: hit, hit_rate: n ? +(hit / n).toFixed(4) : 0,
           saving_ms_p50: n ? +((hit / n) * PROVIDER_HOP_MS).toFixed(1) : 0 };
}

const subsets = {
  'solo clientes externos reales (lo que vería un despliegue sin arnés)': (r) => r.cls === 'real',
  'todos menos el arnés E11': (r) => r.cls !== 'harness',
  'todo el log (INCLUYE el arnés: cota superior artificial)': () => true,
};

const out = { file: FILE, rows: rows.length, provider_hop_ms_assumed: PROVIDER_HOP_MS,
              window: { from: new Date(rows[0]?.t || 0).toISOString(), to: new Date(rows.at(-1)?.t || 0).toISOString() },
              composition: {}, queries_present: rows.filter((r) => r.query).length,
              distinct_keys: {}, subsets: {} };

for (const [name, f] of Object.entries(subsets)) {
  const g = gapsFor(f);
  const n = rows.filter(f).length;
  out.composition[name] = n;
  out.distinct_keys[name] = new Set(rows.filter(f).map((r) => r.key)).size;
  out.subsets[name] = {
    requests: n,
    gap_s: { p50: pct(g, 0.5), p90: pct(g, 0.9), p99: pct(g, 0.99), min: g.length ? +Math.min(...g).toFixed(2) : null, max: g.length ? +Math.max(...g).toFixed(2) : null },
    gaps_le_2s_pct: g.length ? +(100 * g.filter((x) => x <= 2).length / g.length).toFixed(1) : 0,
    hit_rates: TTLS.map((ttl) => hitRate(f, ttl)),
  };
}

/* ── 2 · claves con más demanda (las que de verdad importan) ───────────────── */
const byKey = new Map();
for (const r of rows) {
  if (r.cls === 'harness') continue;
  const e = byKey.get(r.key) || { key: r.key, n: 0, ts: [] };
  e.n++; e.ts.push(r.t);
  byKey.set(r.key, e);
}
out.top_keys = [...byKey.values()].sort((a, b) => b.n - a.n).slice(0, 12).map((e) => {
  const gs = [];
  for (let i = 1; i < e.ts.length; i++) gs.push((e.ts[i] - e.ts[i - 1]) / 1000);
  return { key: e.key.replace(/\/live\/[^/]+\/[^/]+\//, '/live/<U>/<P>/'), n: e.n,
           gap_p50_s: pct(gs, 0.5), gap_min_s: gs.length ? +Math.min(...gs).toFixed(2) : null,
           hit_rate_at_5s: gs.length ? +(gs.filter((x) => x <= 5).length / e.n).toFixed(3) : 0 };
});

console.log(JSON.stringify(out, null, 2));
