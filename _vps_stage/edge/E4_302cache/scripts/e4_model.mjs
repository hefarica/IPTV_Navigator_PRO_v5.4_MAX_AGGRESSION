#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E4 · MODELO de las dos variantes de caché del 302 sobre datos MEDIDOS
 * ═══════════════════════════════════════════════════════════════════════════
 * Entradas:
 *   access_log  → distribución real de huecos entre peticiones de la MISMA clave
 *                 (clientes externos reales, sin el arnés), de e4_hitrate.mjs
 *   measure.jsonl → (a) split de saltos (hop1 = 302 proveedor, hop2 = CDN)
 *                   (b) curva de vida del token «vivo a los N s» (6 ensayos)
 *
 * Modelo por petición, con `h` = P(gap ≤ TTL) y `a` = P(token vivo a esa edad):
 *   A) caché INGENUA (sirve el hit siempre):      h·hop2 + (1−h)·(hop1+hop2)   … pero
 *      un hit con token muerto DEVUELVE 509 al cliente ⇒ coste real = fallo duro.
 *   B) caché con REVALIDACIÓN POR STATUS (509 ⇒ re-acuñar):
 *        a·h·hop2  +  (1−a)·h·(hop2 + hop1 + hop2)  +  (1−h)·(hop1+hop2)
 *      el 509 NUNCA llega al cliente; el hit muerto solo cuesta un hop2 perdido.
 *   C) «bomba de tokens» (pre-acuñir en background cada P s):  hop2 + hop1·(P/intervalo)
 *      = el techo práctico; se evalúa como cota, no se propone sin decisión del dueño.
 *
 * Uso: node e4_model.mjs <access_log> <measure.jsonl>
 * ═══════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';

const LOG = process.argv[2];
const MEAS = process.argv[3];
const TTLS = [2, 3, 4, 5, 6, 8, 10, 15, 30, 60];

/* ── datos medidos ─────────────────────────────────────────────────────── */
const M = fs.readFileSync(MEAS, 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l));
const split = M.find((x) => x.kind === 'E4_SPLIT').res;
const tok = M.find((x) => x.kind === 'E4_TOKEN').res;
const HOP1 = split.hop1_proveedor_302_ms.mean;      // media (el p50 subestima: hay cola)
const HOP1_P50 = split.hop1_proveedor_302_ms.p50;
const HOP2 = split.hop2_cdn_playlist_ms.mean;
const HOP2_P50 = split.hop2_cdn_playlist_ms.p50;

// curva de vida: comparte de ensayos con token vivo a cada edad (interpolada)
const alive = Object.fromEntries(Object.entries(tok.alive_at_s).map(([k, v]) => [+k, v.share]));
const aliveAt = (age) => {
  const ks = Object.keys(alive).map(Number).sort((a, b) => a - b);
  if (age <= ks[0]) return alive[ks[0]];
  for (let i = 1; i < ks.length; i++) {
    if (age <= ks[i]) {
      const t = (age - ks[i - 1]) / (ks[i] - ks[i - 1]);
      return alive[ks[i - 1]] + t * (alive[ks[i]] - alive[ks[i - 1]]);
    }
  }
  return alive[ks[ks.length - 1]];
};

/* ── huecos reales (misma clave), clientes externos reales ─────────────── */
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const REAL = new Set(['146.70.86.222', '181.130.154.235']);
const rows = [];
for (const l of fs.readFileSync(LOG, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\] "([A-Z]+) (\S+) [^"]*" (\d{3})/);
  if (!m || !REAL.has(m[1])) continue;
  const u = m[10];
  const path = u.split('?')[0];
  const hm = path.match(/^\/cdn\/([^/]+)(\/.*)$/);
  if (!hm) continue;
  rows.push({ t: Date.UTC(+m[4], MON[m[3]], +m[2], +m[5], +m[6], +m[7]), key: `${hm[1]}${hm[2]}` });
}
rows.sort((a, b) => a.t - b.t);

/* secuencia de "estado de caché" por petición: hit si el gap ≤ TTL */
function series(ttl) {
  const last = new Map();
  const out = [];
  for (const r of rows) {
    const prev = last.get(r.key);
    const gap = prev === undefined ? Infinity : (r.t - prev) / 1000;
    out.push({ hit: gap <= ttl, age: prev === undefined ? 0 : gap });
    last.set(r.key, r.t);
  }
  return out;
}

const rowsOut = [];
for (const ttl of TTLS) {
  const s = series(ttl);
  const n = s.length;
  const hits = s.filter((x) => x.hit).length;
  const h = hits / n;
  // ---- A · ingenua: el hit se sirve siempre (token muerto = 509 al cliente)
  const aDead = s.filter((x) => x.hit && Math.random() < (1 - aliveAt(x.age))).length; // informativo
  // determinista: probabilidad de token muerto entre los hits, ponderada por edad
  const deadShare = hits ? s.filter((x) => x.hit).reduce((acc, x) => acc + (1 - aliveAt(x.age)), 0) / hits : 0;
  const aliveShare = 1 - deadShare;
  // ---- B · con revalidación por status
  const tB = h * aliveShare * HOP2 + h * deadShare * (HOP2 + HOP1 + HOP2) + (1 - h) * (HOP1 + HOP2);
  // ---- A · ingenua: hit vivo = hop2; hit muerto = 509 (fallo, coste = hop2 desperdiciado + reintento completo del cliente)
  const tA = h * aliveShare * HOP2 + h * deadShare * (HOP2 + HOP1 + HOP2) + (1 - h) * (HOP1 + HOP2);
  const baseline = HOP1 + HOP2;
  rowsOut.push({
    ttl_s: ttl,
    hit_rate: +(100 * h).toFixed(1),
    hits,
    requests: n,
    p_token_alive_on_hit: +(100 * aliveShare).toFixed(1),
    /** peticiones servidas con token VIVO (el único caso que ahorra) */
    effective_hit_pct: +(100 * h * aliveShare).toFixed(1),
    /** peticiones que pagarían un hop2 perdido (hit con token muerto) */
    wasted_pct: +(100 * h * deadShare).toFixed(1),
    /** latencia media esperada, ms (media de saltos) */
    expected_ms_A: +tA.toFixed(1),
    expected_ms_B: +tB.toFixed(1),
    baseline_ms: +baseline.toFixed(1),
    saving_ms_B: +(baseline - tB).toFixed(1),
    saving_pct_B: +(100 * (baseline - tB) / baseline).toFixed(1),
    /** A expone 509 al cliente en h·deadShare de las peticiones */
    exposes_509_pct: +(100 * h * deadShare).toFixed(1),
  });
}

/* ── techo teórico: si el hit SIEMPRE tuviera token vivo (bomba de tokens) ─ */
const ceiling = {
  hop1_ms_mean: +HOP1.toFixed(1), hop2_ms_mean: +HOP2.toFixed(1),
  hop1_ms_p50: HOP1_P50, hop2_ms_p50: HOP2_P50,
  baseline_ms_mean: +(HOP1 + HOP2).toFixed(1), baseline_ms_p50: +(HOP1_P50 + HOP2_P50).toFixed(1),
  best_possible_ms_p50: HOP2_P50,
  best_possible_ms_mean: +HOP2.toFixed(1),
  best_saving_pct_on_total: +(100 * HOP1 / (HOP1 + HOP2)).toFixed(1),
  refutes_under_350ms: HOP2_P50 > 350,
  token_pump: {
    note: 'pre-acuñir el token en background cada P segundos y servir el hit con edad ≤ P',
    alive_share_at_2s: aliveAt(2), alive_share_at_4s: aliveAt(4),
    expected_ms_p50_guess: +(HOP2_P50 + HOP1_P50 * 0.0).toFixed(1),
    provider_extra_req_per_s_if_P2: 0.5,
  },
};

console.log(JSON.stringify({ measured: { hop1: HOP1, hop2: HOP2, alive_curve: alive },
                             baseline_samples: rows.length, table: rowsOut, ceiling }, null, 2));
