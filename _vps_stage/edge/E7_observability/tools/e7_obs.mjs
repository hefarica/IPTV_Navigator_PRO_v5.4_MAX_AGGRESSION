#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E7 · e7_obs.mjs — arnés de OBSERVABILIDAD DE LA DECISIÓN (0 dependencias)
 * ═══════════════════════════════════════════════════════════════════════════
 * Tres usos, un fichero:
 *
 *   node tools/e7_obs.mjs probe     [--samples 5] [--split 3] [--ts]
 *        MIDE el baseline ANTES de desplegar nada: usa lo que ya existe
 *        (X-APE-Upstream-Ms, X-APE-URI-Rebased, X-APE-UHD, X-APE-Origin) y
 *        añade lo que faltaba: nº de redirects reales y SPLIT primer hop
 *        (proveedor) vs último hop (CDN). Es el dato que dimensiona la fase 3.
 *        Las URLs con credenciales NUNCA salen del VPS: el script remoto
 *        descubre el canal, mide y publica solo hosts/números.
 *
 *   node tools/e7_obs.mjs read      [--window 300] [--json]
 *        LEE /_ape/metrics (post-despliegue) y lo contrasta con el sobre de
 *        valores esperados. Si aún no está desplegado (404) lo dice y sugiere
 *        `probe`.
 *
 *   node tools/e7_obs.mjs watch     [--window 300] [--interval 60] [--count 3]
 *        Dos o más lecturas separadas en el tiempo → Δ de buckets → percentiles
 *        de la VENTANA (no acumulados). Esto es lo que demuestra una mejora.
 *
 * Salidas: tabla humana por stdout; con --json, JSON por stdout (para gates).
 * Código de salida: 0 OK · 1 fallo duro (con --strict) · 2 error de transporte.
 *
 * Env: EDGE_SSH (default root@178.156.147.234), E7_BASE (default 127.0.0.1:8088).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.resolve(HERE, '..', 'runs');
const SSH_TARGET = process.env.EDGE_SSH || 'root@178.156.147.234';
const BASE = process.env.E7_BASE || '127.0.0.1:8088';
const LIST_GZ = process.env.E7_LIST_GZ || '/var/www/html/lists/APE_LISTA_4K.m3u8.gz';
const CDN_IDS = (process.env.E7_CDN_IDS || '3,5,6').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_HOPS = 3; // espejo del gateway (documentado en ape_obs_metrics.lua)

// Buckets del histograma: DEBEN ser los mismos que ape_obs_metrics.lua M.MS_BOUNDS
const MS_BOUNDS = [25, 50, 100, 150, 200, 300, 400, 600, 800, 1200, 1600, 2400, 3200, 4800, 8000];

/* ── sobre de valores esperados (calibrado con `probe`; ver docs §5) ────────
 * Cada métrica: [min, max] aceptable. Fuera ⇒ WARN; fuera de [hardMin,hardMax]
 * (margen ×2) ⇒ FAIL con --strict. Estas bandas describen el BASELINE MEDIDO,
 * no un objetivo de marketing: sirven para detectar regresiones, no para
 * declarar mejoras (para eso está `watch`).                                    */
const ENVELOPE = {
  provider_fetch_p50_ms: { min: 500, max: 950, why: 'X-APE-Upstream-Ms p50 medido 704-750 ms' },
  provider_fetch_p95_ms: { min: 700, max: 1800, why: 'p95 del baseline (ver probe)' },
  first_hop_mean_ms: { min: 300, max: 900, why: 'fetch al proveedor (sin CDN)' },
  hops_mean: { min: 0.4, max: 1.8, why: '1 redirect 302 por petición (MAX_HOPS=3)' },
  hops_exhausted: { min: 0, max: 0, why: 'agotar MAX_HOPS sería un fallo real' },
  uhd_declared_pct: { min: 50, max: 100, why: 'los masters deben declarar 4K/8K salvo GOLDEN RULE' },
  uhd_blocked_pct: { min: 0, max: 0, why: 'hev1 en CODECS no debe aparecer (GOLDEN RULE)' },
  media_rebase_pct: { min: 90, max: 100, why: 'una playlist media debe rebasar sus URIs' },
  error_ratio: { min: 0, max: 0.5, why: 'fallos/intentos: 16,8% diario medido; el 0,60 de un run era el breaker de 15 s (ya eliminado)' },
  absolute_uri_pct: { min: 100, max: 100, why: 'invariante metadata-only: 0 URIs relativas tras el rebase' },
};

/* ─────────────── utilidades ─────────────────────────────────────────────── */
const ms1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function ssh(script, timeoutMs = 180000) {
  const r = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SSH_TARGET, 'bash -s'], {
    input: script, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
  });
  if (r.error) return { status: -1, stdout: '', stderr: String(r.error.message || r.error) };
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function stats(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  return {
    n: v.length,
    min: ms1(v[0]), max: ms1(v[v.length - 1]),
    mean: ms1(v.reduce((a, b) => a + b, 0) / v.length),
    p50: ms1(quantile(v, 0.5)), p90: ms1(quantile(v, 0.9)),
    p95: ms1(quantile(v, 0.95)), p99: ms1(quantile(v, 0.99)),
  };
}

/* Mismo algoritmo del bucket que ape_obs_metrics.lua (validación cruzada) */
function bucketOf(ms) {
  for (let i = 0; i < MS_BOUNDS.length; i++) if (ms < MS_BOUNDS[i]) return i + 1;
  return MS_BOUNDS.length + 1;
}
function bucketsOf(values) {
  const counts = new Array(MS_BOUNDS.length + 1).fill(0);
  for (const v of values) if (Number.isFinite(v)) counts[bucketOf(Math.max(0, v)) - 1]++;
  return counts;
}
/* Percentil desde buckets con interpolación lineal (idéntico al Lua) */
function pctlFromBuckets(counts, p) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return { ms: null, lo: null, hi: null, open: false, n: 0 };
  const target = p * total;
  let cum = 0;
  for (let i = 1; i <= counts.length; i++) {
    const c = counts[i - 1] || 0;
    if (c > 0) {
      const nxt = cum + c;
      if (nxt >= target) {
        const lo = i === 1 ? 0 : MS_BOUNDS[i - 2];
        const hi = MS_BOUNDS[i - 1]; // undefined en el bucket abierto
        if (hi === undefined) return { ms: lo, lo, hi: null, open: true, n: total };
        const frac = (target - cum) / c;
        return { ms: Math.round(lo + (hi - lo) * frac), lo, hi, open: false, n: total };
      }
      cum = nxt;
    }
  }
  const lo = MS_BOUNDS[MS_BOUNDS.length - 1];
  return { ms: lo, lo, hi: null, open: true, n: total };
}
/* Poda el "http://host[:puerto]" a host (sin token ni ruta) */
function hostOf(origin) {
  if (!origin) return null;
  const m = String(origin).match(/^https?:\/\/([^/]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function verdict(metric, value) {
  const env = ENVELOPE[metric];
  if (!env || value == null || !Number.isFinite(value)) return { name: metric, value, status: 'n/a' };
  if (value >= env.min && value <= env.max) return { name: metric, value, status: 'OK', why: env.why };
  const hardLo = env.min - Math.max(1, Math.abs(env.min) * 1.0);
  const hardHi = env.max + Math.max(1, Math.abs(env.max) * 1.0);
  const hard = env.min === env.max ? value !== env.min : value < hardLo || value > hardHi;
  return { name: metric, value, status: hard ? 'FAIL' : 'WARN', why: `esperado [${env.min}, ${env.max}] — ${env.why}` };
}

function printVerdicts(vs) {
  for (const v of vs) {
    const tag = v.status === 'OK' ? '  OK  ' : v.status === 'FAIL' ? ' FAIL ' : v.status === 'WARN' ? ' WARN ' : '  --  ';
    const val = v.value == null ? 'n/a' : String(v.value);
    console.log(`${tag} ${v.name.padEnd(26)} ${val.padStart(10)}${v.status === 'OK' ? '' : '   ' + (v.why || '')}`);
  }
}

function stampUtc() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}
function runDir() {
  const d = path.join(RUNS, stampUtc());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/* ─────────────────────────── probe ─────────────────────────────────────── */
function probe(opts) {
  const N = opts.samples;
  const S = opts.split;
  const t0 = Date.now();
  // El script remoto vive en scripts/probe_remote.sh: separado a propósito para
  // que bash y Node no se escapen mutuamente (bug real al primer intento con
  // las regex de la lista y los `sed` de backreference).
  const remotePath = path.resolve(HERE, '..', 'scripts', 'probe_remote.sh');
  const remote = fs.readFileSync(remotePath, 'utf8');
  const script = `LIST=${shq(LIST_GZ)} BASE=${shq(BASE)} IDS=${shq(CDN_IDS.join(' '))} N=${N} S=${S}\n${remote}`;

  const r = ssh(script, Math.max(240000, (N * 12 + S * 12 + 30) * 1000));
  if (r.status !== 0) {
    console.error(`probe: fallo de transporte (ssh exit ${r.status})\n${r.stderr}`);
    return 2;
  }

  const out = {
    schema: 'ape.obs.probe/1',
    ts_utc: new Date().toISOString(),
    host: SSH_TARGET, base: BASE, samples: N, split_samples: S,
    channels: [], sample: [], split: [], hops: [], qoe: null, health: null,
    metrics_endpoint: null, derived: {}, notes: [],
  };
  let jsonBuf = null;
  let jsonMode = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    const p = line.split('\t');
    switch (p[0]) {
      case 'PROBE_BEGIN': out.t_begin = p[1]; break;
      case 'PROBE_END': out.t_end = p[1]; break;
      case 'MISSING': out.notes.push(`canal ${p[1]} no está en la lista (${LIST_GZ})`); break;
      case 'CHANNEL': out.channels.push({ id: p[1], provider_host: p[2] }); break;
      case 'SAMPLE':
        out.sample.push({
          channel: p[1], i: Number(p[2]), status: Number(p[3]),
          ttfb_ms: ms1(Number(p[4]) * 1000), bytes: Number(p[5]),
          upstream_ms: p[6] === '' ? null : Number(p[6]),
          uri_rebased: p[7] === '' ? null : Number(p[7]),
          uhd: p[8] || null, cdn: p[9] || null, origin_host: hostOf(p[10]),
          body_uris: Number(p[11]), body_relative_uris: Number(p[12]),
          error: p[13] && p[13] !== '-' ? p[13] : null,
          error_ms: p[14] && p[14] !== '-' ? Number(p[14]) : null,
          fastfail_waits: Number(p[15] || 0),
        });
        break;
      case 'SPLIT':
        out.split.push({
          channel: p[1], i: Number(p[2]), code_first: Number(p[3]),
          first_hop_ms: ms1(Number(p[4]) * 1000), cdn_host: p[5] || null,
          code_last: p[6] === '-' ? null : Number(p[6]),
          last_hop_ms: p[7] === '-' ? null : ms1(Number(p[7]) * 1000),
          bytes: p[8] === '-' ? null : Number(p[8]),
        });
        break;
      case 'HOPS':
        out.hops.push({ channel: p[1], num_redirects: Number(p[2]), status: p[3] === '?' ? null : Number(p[3]) });
        break;
      case '---QOE---': jsonMode = 'qoe'; jsonBuf = ''; break;
      case '---HEALTH---': if (jsonMode === 'qoe') out.qoe = safeJson(jsonBuf); jsonMode = 'health'; jsonBuf = ''; break;
      case '---METRICS---': if (jsonMode === 'health') out.health = safeJson(jsonBuf); jsonMode = 'metrics'; jsonBuf = ''; break;
      default:
        if (jsonMode === 'metrics') { out.metrics_endpoint = line.trim(); jsonMode = null; }
        else if (jsonMode) jsonBuf += line + '\n';
    }
  }

  /* ── derivados: los números que la fase 6 publicará en /_ape/metrics ──── */
  const ok = out.sample.filter((s) => s.status >= 200 && s.status < 300);
  const failed = out.sample.filter((s) => !(s.status >= 200 && s.status < 300));
  const fastFail = failed.filter((s) => s.error === 'all_upstreams_failed' && (s.error_ms ?? 9999) < 50);
  const realFail = failed.filter((s) => !fastFail.includes(s));
  const splitOk = out.split.filter((s) => s.code_first >= 200 && s.code_first < 400);
  out.derived = {
    samples_total: out.sample.length,
    samples_ok: ok.length,
    samples_failed: failed.length,
    fast_fail: fastFail.length,
    real_fail: realFail.length,
    error_ratio: out.sample.length ? Math.round((failed.length / out.sample.length) * 10000) / 10000 : null,
    upstream_error_ratio: out.sample.length ? Math.round((realFail.length / out.sample.length) * 10000) / 10000 : null,
    fast_fail_waits: out.sample.reduce((a, s) => a + (s.fastfail_waits || 0), 0),
    provider_fetch_ms: stats(ok.map((s) => s.upstream_ms)),
    ttfb_client_ms: stats(ok.map((s) => s.ttfb_ms)),
    handler_overhead_ms: stats(ok.map((s) => s.ttfb_ms - s.upstream_ms)),
    first_hop_ms: stats(splitOk.map((s) => s.first_hop_ms)),
    last_hop_ms: stats(splitOk.filter((s) => s.last_hop_ms != null).map((s) => s.last_hop_ms)),
    split_errors: out.split.length - splitOk.length,
    hops: out.hops.map((h) => h.num_redirects),
    hops_mean: out.hops.length ? ms1(out.hops.reduce((a, b) => a + b.num_redirects, 0) / out.hops.length) : null,
    uhd: out.sample.reduce((acc, s) => { const k = s.uhd || 'none'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    rebase_pct: ok.length ? ms1(100 * ok.filter((s) => (s.uri_rebased || 0) > 0).length / ok.length) : null,
    uris_rebased_total: ok.reduce((a, s) => a + (s.uri_rebased || 0), 0),
    body_uris_total: ok.reduce((a, s) => a + s.body_uris, 0),
    body_relative_uris: ok.reduce((a, s) => a + s.body_relative_uris, 0),
    absolute_uri_pct: (() => {
      const tot = ok.reduce((a, s) => a + s.body_uris, 0);
      const rel = ok.reduce((a, s) => a + s.body_relative_uris, 0);
      return tot ? ms1(100 * (tot - rel) / tot) : null;
    })(),
    // distribución EXACTA por buckets (la que debe reproducir el histograma Lua)
    provider_fetch_ms_buckets: bucketsOf(ok.map((s) => s.upstream_ms)),
    provider_fetch_ms_p50_from_buckets: pctlFromBuckets(bucketsOf(ok.map((s) => s.upstream_ms)), 0.5).ms,
    distinct_origin_hosts: [...new Set(out.sample.map((s) => s.origin_host).filter(Boolean))],
    distinct_cdn_hosts: [...new Set(out.sample.map((s) => s.cdn).filter(Boolean))],
  };
  out.notes.push('Las URLs con credenciales no se han impreso ni almacenado: solo hosts, estados y tiempos.');
  out.notes.push('provider_fetch_ms viaja como X-APE-Upstream-Ms (fetch proveedor + 302) y solo se agrega en respuestas 2xx.');

  const dir = runDir();
  fs.writeFileSync(path.join(dir, 'probe.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(dir, 'probe.log'), r.stdout);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }

  console.log(`\n=== E7 · PROBE del baseline (${secs}s) — ${out.t_begin || ''} → ${out.t_end || ''} ===`);
  console.log(`canales: ${out.channels.map((c) => `${c.id}@${c.provider_host}`).join(' · ') || '(ninguno)'}`);
  console.log(`\n── provider_fetch_ms (X-APE-Upstream-Ms, solo 2xx) ──`);
  const pf = out.derived.provider_fetch_ms;
  console.log(`  n=${pf.n}  p50=${pf.p50 ?? '?'}  p90=${pf.p90 ?? '?'}  p95=${pf.p95 ?? '?'}  p99=${pf.p99 ?? '?'}  mean=${pf.mean ?? '?'} ms`);
  console.log(`  rango: ${pf.min ?? '?'}…${pf.max ?? '?'} ms`);
  console.log(`\n── split del fetch (lo que faltaba para dimensionar la fase 3) ──`);
  const f1 = out.derived.first_hop_ms, f2 = out.derived.last_hop_ms;
  console.log(`  primer hop (proveedor): n=${f1.n} p50=${f1.p50 ?? '?'} mean=${f1.mean ?? '?'} ms`);
  console.log(`  último hop (CDN 302):   n=${f2.n} p50=${f2.p50 ?? '?'} mean=${f2.mean ?? '?'} ms`);
  console.log(`  redirects reales (curl -L): ${out.derived.hops.join(', ') || '?'} ⇒ media ${out.derived.hops_mean ?? '?'} (MAX_HOPS=${MAX_HOPS})`);
  console.log(`\n── TTFB del cliente (loopback) y sobrecoste del handler ──`);
  const tc = out.derived.ttfb_client_ms, ho = out.derived.handler_overhead_ms;
  console.log(`  TTFB p50=${tc.p50 ?? '?'} p95=${tc.p95 ?? '?'} · Δ(TTFB−upstream) p50=${ho.p50 ?? '?'} ms`);
  console.log(`\n── decisión: hops, uhd_mode, rebase ──`);
  console.log(`  uhd: ${JSON.stringify(out.derived.uhd)}`);
  console.log(`  rebase_pct=${out.derived.rebase_pct ?? '?'}%  URIs rebasadas=${out.derived.uris_rebased_total}  relativas restantes=${out.derived.body_relative_uris}/${out.derived.body_uris_total} ⇒ absolute_uri_pct=${out.derived.absolute_uri_pct ?? '?'}%`);
  console.log(`  origen final (CDN): ${out.derived.distinct_origin_hosts.join(', ') || '?'}`);
  console.log(`\n── errores ──`);
  console.log(`  ${out.derived.samples_ok}/${out.derived.samples_total} ok · error_ratio=${out.derived.error_ratio ?? '?'} (fallos/intentos)`);
  console.log(`  fallo REAL (habló con el proveedor)=${out.derived.real_fail} · FAST FAIL (host marcado caído, sin fetch)=${out.derived.fast_fail}`);
  if (out.derived.fast_fail_waits > 0) {
    console.log(`  ⚠ ${out.derived.fast_fail_waits} muestra(s) cayeron en la ventana del circuito down: 15 s; se esperó 16 s y se reintentó (no contaminan el p50)`);
  }
  console.log(`\n── contadores acumulados de hoy (compat) ──`);
  if (out.qoe?.metrics) {
    const m = out.qoe.metrics;
    console.log(`  req=${m.req} all_failed=${m.all_failed} rebase_ok=${m.rebase_ok} bytes=${m.bytes} last_ms=${m.last_ms}`);
    if (out.health?.checks) {
      const c = out.health.checks;
      console.log(`  health.error_ratio(legacy)=${c.error_ratio} requests=${c.requests}`);
    }
  }
  console.log(`\n/_ape/metrics → ${out.metrics_endpoint === '200' ? '200 (E7 YA desplegado)' : `${out.metrics_endpoint || '?'} (E7 aún no desplegado: baseline medido con cabeceras)`}`);
  console.log(`\nartefactos: ${path.relative(process.cwd(), dir)}/{probe.json,probe.log}`);
  return 0;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return { _unparsed: String(s || '').slice(0, 200) }; }
}

/* ─────────────────────────── read ──────────────────────────────────────── */
function readSnapshot(windowS) {
  const script = `set -u
echo "---METRICS---"
curl -sS -m 10 -w '\\n__CODE__%{http_code}' "http://${BASE}/_ape/metrics?window=${windowS}" || true
echo ""
echo "---HEALTH---"
curl -sS -m 10 "http://${BASE}/_ape/health" || true
echo ""
`;
  const r = ssh(script, 60000);
  if (r.status !== 0) return { error: `ssh exit ${r.status}: ${r.stderr}` };
  const m = r.stdout.match(/---METRICS---\n([\s\S]*?)\n__CODE__(\d{3})/);
  const h = r.stdout.match(/---HEALTH---\n([\s\S]*)$/);
  return {
    code: m ? Number(m[2]) : null,
    metrics: m ? safeJson(m[1]) : null,
    health: h ? safeJson(h[1]) : null,
  };
}

function readCmd(opts) {
  const snap = readSnapshot(opts.window);
  if (snap.error) { console.error(`read: ${snap.error}`); return 2; }
  if (snap.code === 404) {
    console.log(`/_ape/metrics → 404: la fase 6 aún NO está desplegada.`);
    console.log(`Mide el baseline con cabeceras:  node tools/e7_obs.mjs probe`);
    if (snap.health?.checks) {
      const c = snap.health.checks;
      console.log(`\nEstado actual (/_ape/health, contadores acumulados):`);
      console.log(`  ok=${snap.health.ok} requests=${c.requests} all_failed=${snap.health.qoe?.all_failed} error_ratio(legacy)=${c.error_ratio}`);
    }
    return 0;
  }
  if (snap.code !== 200 || !snap.metrics) {
    console.error(`read: /_ape/metrics → ${snap.code}; cuerpo: ${JSON.stringify(snap.metrics)}`);
    return 2;
  }
  const m = snap.metrics;
  if (opts.json) { console.log(JSON.stringify({ metrics: m, health: snap.health }, null, 2)); return 0; }

  const pf = m.provider_fetch_ms || {};
  const sp = m.provider_fetch_split || {};
  const hp = m.hops || {};
  const uhd = m.uhd_mode || {};
  const rb = m.rebase || {};
  const er = m.errors || {};
  const ed = m.edge || {};
  const cum = m.cumulative || {};

  console.log(`\n=== E7 · /_ape/metrics (ventana ${m.window?.coverage_s ?? opts.window}s, slot parcial ${m.window?.partial_age_s ?? '?'}s) ===`);
  console.log(`schema=${m.schema} ts=${m.ts} disponible=${m.available}`);
  console.log(`\n── provider_fetch_ms ──`);
  console.log(`  n=${pf.n ?? 0}  mean=${pf.mean_ms ?? '?'}  p50=${pf.p50_ms ?? '?'}  p90=${pf.p90_ms ?? '?'}  p95=${pf.p95_ms ?? '?'}  p99=${pf.p99_ms ?? '?'} ms`);
  if (pf.p50_range_ms) console.log(`  p50 en bucket [${pf.p50_range_ms[0]}, ${pf.p50_range_ms[1] ?? '∞'}) — método ${pf.method}, bucket abierto=${pf.open_count ?? 0}`);
  console.log(`  split: primer hop=${sp.first_hop_mean_ms ?? '?'} ms (n=${sp.first_hop_n ?? 0}) · último hop(CDN)=${sp.last_hop_mean_ms ?? '?'} ms (n=${sp.last_hop_n ?? 0})`);
  console.log(`\n── hops ──`);
  console.log(`  n=${hp.n ?? 0} dist=${JSON.stringify(hp.dist || {})} mean=${hp.mean ?? '?'} redirects=${hp.redirects_total ?? 0} agotados=${hp.exhausted ?? 0} intentos=${hp.attempts ?? 0}`);
  console.log(`\n── uhd_mode (solo masters) ──`);
  console.log(`  masters=${uhd.masters ?? 0} media=${uhd.media_playlists ?? 0} dist=${JSON.stringify(uhd.dist || {})} declarado=${uhd.declared_pct ?? '?'}% bloqueado=${uhd.blocked_pct ?? '?'}%`);
  console.log(`\n── rebase ──`);
  console.log(`  playlists=${rb.playlists ?? 0} rebase_pct=${rb.rebase_pct ?? '?'}% (media ${rb.media_rebase_pct ?? '?'}% · master ${rb.master_rebase_pct ?? '?'}%) URIs=${rb.uris_total ?? 0} ${rb.uris_per_playlist ?? '?'}/playlist`);
  console.log(`\n── errors (fallos/INTENTOS) ──`);
  console.log(`  intentos=${er.attempts ?? 0} ok=${er.ok ?? 0} fail=${er.upstream_fail ?? 0} denied=${er.denied ?? 0} too_large=${er.too_large ?? 0} ⇒ error_ratio=${er.error_ratio ?? '?'}`);
  console.log(`\n── edge (n=${ed.n ?? 0}) ──`);
  console.log(`  request ${ed.mean_request_ms ?? '?'} ms · upstream ${ed.mean_upstream_ms ?? '?'} ms · status ${JSON.stringify(ed.status || {})} · h1=${ed.h1 ?? 0} h2=${ed.h2 ?? 0}`);
  console.log(`\n── acumulados (compat; D-67: NO citables como QoE) ──`);
  console.log(`  req=${cum.req} all_failed=${cum.all_failed} attempts=${cum.attempts} error_ratio_cum=${cum.error_ratio_cum} redirects=${cum.redirects} uhd4k=${cum.uhd4k} uhd8k=${cum.uhd8k}`);
  console.log(`\n── coste ──`);
  console.log(`  ${m.cost?.phase} · escrituras en ruta caliente=${m.cost?.hot_path_writes} · ${m.cost?.writes_per_request} incr/petición · ${m.cost?.keys_max} claves máx en ${m.cost?.dict}`);

  /* validación cruzada Lua↔JS con los mismos buckets */
  if (Array.isArray(pf.counts) && pf.p50_ms != null) {
    const js = pctlFromBuckets(pf.counts, 0.5);
    const diff = js.ms - pf.p50_ms;
    if (Math.abs(diff) > 2) {
      console.log(`\n  WARN desincronización Lua/JS en p50: lua=${pf.p50_ms} js=${js.ms} (¿cambió M.MS_BOUNDS en un solo lado?)`);
    } else {
      console.log(`\n  OK   validación cruzada Lua↔JS del histograma (p50 lua=${pf.p50_ms} js=${js.ms})`);
    }
  }

  const vs = [
    verdict('provider_fetch_p50_ms', pf.p50_ms),
    verdict('provider_fetch_p95_ms', pf.p95_ms),
    verdict('first_hop_mean_ms', sp.first_hop_mean_ms),
    verdict('hops_mean', hp.mean),
    verdict('hops_exhausted', hp.exhausted),
    verdict('uhd_declared_pct', uhd.declared_pct),
    verdict('uhd_blocked_pct', uhd.blocked_pct),
    verdict('media_rebase_pct', rb.media_rebase_pct),
    verdict('error_ratio', er.error_ratio),
  ];
  console.log(`\n── contraste con el baseline esperado ──`);
  printVerdicts(vs);
  const hard = vs.filter((v) => v.status === 'FAIL');
  if (opts.strict && hard.length) { console.error(`\nread --strict: ${hard.length} métrica(s) fuera de rango`); return 1; }
  return 0;
}

/* ─────────────────────────── watch (deltas) ────────────────────────────── */
function watchCmd(opts) {
  const snaps = [];
  for (let i = 0; i < opts.count; i++) {
    const s = readSnapshot(opts.window);
    if (s.error) { console.error(`watch: ${s.error}`); return 2; }
    if (s.code !== 200 || !s.metrics) {
      console.error(`watch: /_ape/metrics → ${s.code}. La fase 6 debe estar desplegada. Usa 'probe' si aún no lo está.`);
      return 2;
    }
    snaps.push({ t: Date.now(), m: s.metrics });
    if (i < opts.count - 1) {
      console.log(`  … muestra ${i + 1}/${opts.count} tomada; esperando ${opts.interval}s`);
      // espera síncrona sin dependencias ni timers colgando
      const sab = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(sab), 0, 0, opts.interval * 1000);
    }
  }
  const a = snaps[0].m, b = snaps[snaps.length - 1].m;
  const span = Math.round((snaps[snaps.length - 1].t - snaps[0].t) / 1000);
  const d = (k, p) => {
    const A = a[k]?.[p] ?? 0, B = b[k]?.[p] ?? 0;
    return B - A;
  };
  const pfA = a.provider_fetch_ms || {};
  const pfB = b.provider_fetch_ms || {};
  const countDelta = (Array.isArray(pfB.counts) && Array.isArray(pfA.counts))
    ? pfB.counts.map((v, i) => v - (pfA.counts[i] || 0)) : null;
  console.log(`\n=== E7 · ventana Δ (${span}s entre la primera y la última lectura) ===`);
  console.log(`  provider_fetch_ms.n: ${pfA.n ?? 0} → ${pfB.n ?? 0}  (Δ ${d('provider_fetch_ms', 'n')})`);
  if (countDelta) {
    const total = countDelta.reduce((x, y) => x + y, 0);
    const p50 = pctlFromBuckets(countDelta, 0.5);
    const p95 = pctlFromBuckets(countDelta, 0.95);
    console.log(`  percentiles SOLO de la ventana Δ (n=${total}): p50=${p50.ms ?? '?'} (bucket [${p50.lo}, ${p50.hi ?? '∞'})) p95=${p95.ms ?? '?'}`);
    if (total < 10) console.log(`  AVISO n=${total} es pequeño: los percentiles son indicativos (el tráfico real de /cdn/ es ~12/h)`);
  }
  console.log(`  hops.redirects_total: ${d('hops', 'redirects_total')} · intentos: ${d('errors', 'attempts')} · fallos: ${d('errors', 'fail_total')}`);
  const att = d('errors', 'attempts'), fl = d('errors', 'fail_total');
  if (att > 0) console.log(`  error_ratio Δ = ${fl}/${att} = ${Math.round((fl / att) * 10000) / 10000}`);
  console.log(`  uhd: 4k Δ ${d('uhd_mode', 'dist') === 0 ? '?' : JSON.stringify({ from: a.uhd_mode?.dist, to: b.uhd_mode?.dist })}`);
  console.log(`  edge.n Δ ${d('edge', 'n')} · h1 Δ ${d('edge', 'h1')} · h2 Δ ${d('edge', 'h2')}`);
  return 0;
}

/* ─────────────────────────────── main ──────────────────────────────────── */
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const nxt = argv[i + 1];
      if (nxt && !nxt.startsWith('--')) { o[k] = /^\d+$/.test(nxt) ? Number(nxt) : nxt; i++; }
      else o[k] = true;
    } else o._.push(a);
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const cmd = opts._[0] || 'read';
opts.window = opts.window || 300;
opts.samples = opts.samples || 5;
opts.split = opts.split || 3;
opts.interval = opts.interval || 60;
opts.count = opts.count || 2;

switch (cmd) {
  case 'probe': process.exit(probe(opts));
  case 'read': process.exit(readCmd(opts));
  case 'watch': process.exit(watchCmd(opts));
  case 'help':
  case '--help':
    console.log(`Uso: node tools/e7_obs.mjs <probe|read|watch> [opciones]
  probe  [--samples 5] [--split 3]   mide el baseline con cabeceras (sin desplegar)
  read   [--window 300] [--json] [--strict]
  watch  [--window 300] [--interval 60] [--count 2]
Env: EDGE_SSH=root@host  E7_BASE=127.0.0.1:8088  E7_CDN_IDS=3,5,6  E7_LIST_GZ=/var/www/html/lists/APE_LISTA_4K.m3u8.gz`);
    process.exit(0);
  default:
    console.error(`comando desconocido: ${cmd} (usa probe|read|watch)`);
    process.exit(2);
}
