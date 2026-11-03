#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E11 · Analizador del fallo intermitente de /cdn/  (offline, 0 dependencias)
 * ═══════════════════════════════════════════════════════════════════════════
 * Entradas (todas dentro de runs/<stamp>/):
 *   access443_cdn.log   líneas /cdn/ del access_log PÚBLICO (443, credenciales redactadas)
 *   access8088_cdn.log  líneas /cdn/ del log del plano 8088
 *   samples.jsonl       campaña controlada (180 GET, 3 canales, breaker por muestra)
 *   breaker_ab.jsonl    A/B determinista del breaker
 * Salida:
 *   E11_evidence.json   evidencia numérica completa
 *   (stdout)            resumen legible
 *
 * Modelo causal que verifica:
 *   1 fallo REAL del proveedor  ->  `HOSTS:set("down:<host>",1,15)`  ->  ~15 s en
 *   los que TODA petición de ese host sale 502 instantáneo SIN intentar fetch
 *   y SIN `reason`. El nº de castigos (`host_down:<host>`) es exactamente el nº
 *   de fallos reales; todo lo demás que cuenta `all_failed` son SKIPS cacheados.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';

const RUN = process.argv[2] || '.';
const J = (f) => { const p = path.join(RUN, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; };

/* ── 1 · parseo de líneas de access_log ────────────────────────────────────── */
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function parseLine(line) {
  // 178.156.147.234 - - [26/Oct/2026:20:44:09 +0000] "GET /cdn/... HTTP/1.1" 200 324 "ref" "ua"
  const m = line.match(/^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\] "([A-Z]+) (\S+) [^"]*" (\d{3}) (\S+) "([^"]*)" "([^"]*)"/);
  if (!m) return null;
  const [, ip, dd, mon, yyyy, hh, mm, ss, tz, method, url, status, bytes, ref, ua] = m;
  const t = Date.UTC(+yyyy, MON[mon], +dd, +hh, +mm, +ss);  return { ip, t, iso: `${yyyy}-${mon}-${dd}T${hh}:${mm}:${ss}${tz.slice(0, 3)}:${tz.slice(3)}`,
           method, url, status: +status, bytes: bytes === '-' ? 0 : +bytes, ref, ua };
}
function loadLog(f) {
  return J(f).split(/\r?\n/).filter(Boolean).map(parseLine).filter(Boolean);
}

/* ── 2 · clasificación de clientes ─────────────────────────────────────────── */
const HARNESS_IPS = new Set(['178.156.147.234', '127.0.0.1']);
function groupOf(r) {
  if (HARNESS_IPS.has(r.ip)) return 'harness';       // campaña E11 / A-B / fixtures
  if (r.ip === '146.70.86.222' || r.ip === '181.130.154.235') return 'externo'; // consumidor real
  return 'scanner';
}

/* ── 3 · ventanas del breaker, sembradas por el PRIMER fallo no-cubierto ─────
 * Un fallo REAL (fetch intentado que devuelve non-2xx) es lo único que hace
 * `HOSTS:set("down:<host>",1,15)`. A partir de ahí, TODA petición al mismo host
 * durante 15 s sale 502 sin intentar fetch. Por tanto:
 *   · el 1.er fallo no cubierto por una ventana previa = intento REAL (semilla),
 *   · cualquier fallo posterior dentro de [semilla, semilla+16 s] = SKIP.
 * Se agrupa por host del path (`/cdn/<host>/…`) porque el breaker es por host.
 * Nota conservadora: si una ráfaga llega sin disparador visible (el disparo lo
 * provocó OTRO cliente), su primer 502 se cuenta como intento real. Eso
 * SOBREESTIMA los fallos reales: la cifra de skips es un suelo, no un techo.
 */
function hostOf(url) { const m = url.match(/^\/cdn\/([^/]+)\//); return m ? m[1] : '?'; }

function classify(fails) {
  const byHost = {};
  for (const f of fails) (byHost[hostOf(f.url)] ||= []).push(f);
  const out = [];
  for (const [host, arr] of Object.entries(byHost)) {
    arr.sort((a, b) => a.t - b.t);
    const win = [];
    for (const f of arr) {
      const w = win.find((x) => f.t >= x.t0 && f.t <= x.t1);
      if (w) { out.push({ ...f, host, cls: 'breaker_skip', window: w.id }); continue; }
      const nw = { t0: f.t, t1: f.t + 16000, id: win.length + 1, seed: f.status };
      win.push(nw);
      out.push({ ...f, host, cls: f.status === 502 ? 'real_attempt_502' : 'real_attempt', window: nw.id });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

function windowsFrom(classified) {
  const map = new Map();
  for (const f of classified) {
    const k = `${f.host}#${f.window}`;
    const w = map.get(k) || { host: f.host, id: f.window, t0: f.t, t1: f.t, seed: f.cls === 'real_attempt' ? f.status : f.status, n: 0, skips: 0 };
    w.n++; if (f.cls === 'breaker_skip') w.skips++;
    w.t1 = Math.max(w.t1, f.t);
    map.set(k, w);
  }
  return [...map.values()].sort((a, b) => a.t0 - b.t0)
    .map((w) => ({ t0: new Date(w.t0).toISOString().replace('.000', ''), host: w.host,
                   seed_status: w.seed, span_s: (w.t1 - w.t0) / 1000, n: w.n, skips: w.skips }));
}

/* ── 4 · métricas ──────────────────────────────────────────────────────────── */
function dist(rows) {
  const d = {};
  for (const r of rows) d[r.status] = (d[r.status] || 0) + 1;
  return d;
}
function honest(fail, ok) { return (fail + ok) > 0 ? +(fail / (fail + ok)).toFixed(4) : 0; }
function official(fail, ok) { return ok > 0 ? +(fail / ok).toFixed(4) : 0; }

function analyze(rows, label) {
  const ok = rows.filter((r) => r.status === 200);
  const bad = rows.filter((r) => r.status !== 200);
  const cl = classify(bad);
  const wins = windowsFrom(cl);
  const realN = cl.filter((f) => f.cls !== 'breaker_skip').length;
  const skipN = cl.filter((f) => f.cls === 'breaker_skip').length;
  return {
    label,
    total: rows.length,
    ok: ok.length,
    bad: bad.length,
    dist: dist(rows),
    error_ratio_official: official(bad.length, ok.length),
    error_ratio_honest: honest(bad.length, ok.length),
    amplification: realN > 0 ? +(bad.length / realN).toFixed(2) : null,
    breaker_windows: wins.length,
    breaker_skips_est: skipN,
    real_attempts_est: realN,
    skip_share_pct: bad.length ? +(100 * skipN / bad.length).toFixed(1) : 0,
    clusters: wins,
  };
}

/* ── 5 · campaña controlada + A/B ──────────────────────────────────────────── */
function campaign() {
  if (!J('samples.jsonl').trim()) return null;
  const L = J('samples.jsonl').split(/\r?\n/).filter(Boolean).map((s) => JSON.parse(s));
  const meta = L.find((x) => x.kind === 'META');
  const tail = L.find((x) => x.kind === 'TAIL');
  const S = L.filter((x) => x.kind === 'SAMPLE');
  const byArm = {};
  for (const s of S) {
    const a = (byArm[s.arm] ||= { n: 0, ok: 0, bad: 0, dist: {}, ttfb: [], breaker_open_at_req: 0,
                                  byChan: {} });
    a.n++;
    if (s.status === 200) a.ok++; else a.bad++;
    a.dist[s.status] = (a.dist[s.status] || 0) + 1;
    if (Number.isFinite(s.ttfb_ms)) a.ttfb.push(s.ttfb_ms);
    if (s.pre && s.pre.breaker_gw) a.breaker_open_at_req++;
    const c = (a.byChan[s.chan] ||= { n: 0, ok: 0 });
    c.n++; if (s.status === 200) c.ok++;
  }
  const pct = (arr, p) => {
    if (!arr.length) return null;
    const s = [...arr].sort((x, y) => x - y);
    return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
  };
  for (const a of Object.values(byArm)) {
    a.ttfb_p50 = pct(a.ttfb, 0.5); a.ttfb_p95 = pct(a.ttfb, 0.95);
    delete a.ttfb;
  }
  return {
    meta: { utc: meta.utc, channels: meta.channels, gw_host: meta.gw_host,
            arms: meta.arms, plane_before: meta.plane_before },
    by_arm: byArm,
    total: { n: S.length, ok: S.filter((s) => s.status === 200).length,
             bad: S.filter((s) => s.status !== 200).length },
    plane_after: tail.plane_after,
    counter_delta: {
      req: tail.plane_after.req - meta.plane_before.req,
      all_failed: tail.plane_after.all_failed - meta.plane_before.all_failed,
      trips_gw: tail.plane_after.trips_gw - meta.plane_before.trips_gw,
      trips_loop: (tail.plane_after.trips_loop ?? 0) - (meta.plane_before.trips_loop ?? 0),
    },
  };
}

function ab() {
  if (!J('breaker_ab.jsonl').trim()) return null;
  const L = J('breaker_ab.jsonl').split(/\r?\n/).filter(Boolean).map((s) => JSON.parse(s));
  const meta = L.find((x) => x.kind === 'AB_META');
  const trig = L.find((x) => x.kind === 'AB_STEP' && x.step === 'trigger');
  const win = L.filter((x) => x.kind === 'AB_STEP' && x.step === 'window').map((x) => x.rec);
  const before = L.find((x) => x.kind === 'AB_STEP' && x.step === 'control_before');
  const after = L.find((x) => x.kind === 'AB_STEP' && x.step === 'control_after');
  const tail = L.find((x) => x.kind === 'AB_TAIL');
  const first200 = win.find((w) => w.status === 200);
  const last502 = [...win].reverse().find((w) => w.status !== 200);
  const fails = win.filter((w) => w.status !== 200);
  const provOk = win.filter((w) => w.prov && w.prov.prov_status === 302 && w.prov.cdn_status === 200);
  return {
    utc: meta.utc,
    trigger: {
      status: trig.rec.status, ms: trig.rec.body && trig.rec.body.ms,
      has_reason: trig.rec.body_has_reason, reason: trig.rec.body && trig.rec.body.reason,
      ttfb_ms: trig.rec.ttfb_ms, bytes: trig.rec.size,
      breaker_after: trig.rec.plane_after.down, trips_after: trig.rec.plane_after.trips_gw,
    },
    control_before: { gw_status: before.gw.status, gw_ttfb_ms: before.gw.ttfb_ms, prov: before.prov },
    control_after: { gw_status: after.gw.status, gw_ttfb_ms: after.gw.ttfb_ms, prov: after.prov,
                     t_from_trip: after.t_from_trip },
    window: {
      n: win.length, fails: fails.length,
      all_502: fails.every((f) => f.status === 502),
      all_no_xape: fails.every((f) => Object.keys(f.x_ape || {}).length === 0),
      all_ms0: fails.every((f) => f.body && f.body.ms === 0),
      all_no_reason: fails.every((f) => f.body_has_reason === false),
      ttfb_ms: { min: Math.min(...fails.map((f) => f.ttfb_ms)), max: Math.max(...fails.map((f) => f.ttfb_ms)) },
      bytes: [...new Set(fails.map((f) => f.size))],
      fail_window_s: [fails[0] && fails[0].t_from_trip, last502 && last502.t_from_trip],
      recovery_at_s: first200 && first200.t_from_trip,
      recovery_ttfb_ms: first200 && first200.ttfb_ms,
      recovery_xape_headers: first200 && Object.keys(first200.x_ape || {}).length,
      provider_controls_during_window: provOk.length,
      provider_healthy_throughout_window: provOk.length > 0 && win.filter((w) => w.prov).every((w) => w.prov.prov_status === 302 && w.prov.cdn_status === 200),
    },
    counter_delta: {
      all_failed: tail.plane_after.all_failed - meta.plane_before.all_failed,
      req: tail.plane_after.req - meta.plane_before.req,
      trips_gw: tail.plane_after.trips_gw - meta.plane_before.trips_gw,
    },
    plane_after: tail.plane_after,
  };
}

/* ── 6 · recomputación honesta de los valores históricos de E1 ─────────────── */
const historical = [
  // [label, successes_requested(ok), failures, fuente]
  { label: 'E1 inicio 20:20:41 (error_ratio publicado 0.2637)', ok: 91, fail: 24 },
  { label: 'E1 fin   (+18 req, error_ratio publicado 0.2202)', ok: 109, fail: 24 },
  { label: 'Lectura 20:27:25 (137 ok / 41 fail)', ok: 137, fail: 41 },
  { label: 'E11 20:34:29 (req=182 all_failed=60)', ok: 182, fail: 60 },
].map((h) => ({ ...h,
  official: official(h.fail, h.ok),
  honest: honest(h.fail, h.ok),
  error_pct_del_published: +(100 * (official(h.fail, h.ok) - honest(h.fail, h.ok)) / official(h.fail, h.ok)).toFixed(1) }));

/* ── 7 · impacto en reproducción ──────────────────────────────────────────── */
function playbackImpact(externoAll, externoBad) {
  const rate = externoAll.length ? externoBad.length / externoAll.length : 0;
  // Un zap = 1 GET del manifiesto. Con el breaker abierto, TODOS los reintentos
  // del player dentro de la ventana (15 s) caen. Player típico: reintento a
  // ~1 s, 2 s, 4 s (3 intentos) => los 3 dentro de la ventana => zap perdido.
  const pFail = rate;                                  // fallo del primer intento
  const pFailWithRetries = rate;                       // el breaker no perdona reintentos <15 s
  return {
    externo_requests: externoAll.length,
    externo_failures: externoBad.length,
    manifest_failure_rate: +rate.toFixed(4),
    retry_within_15s_would_fail: +pFailWithRetries.toFixed(4),
    // 1 manifiesto fallido => el player no arranca ese canal; si el usuario
    // reintenta manualmente pasados >15 s, arranca. Modelo: 1 zap = 1 manifiesto.
    zaps_lost_pct: +(100 * rate).toFixed(1),
    zaps_lost_pct_if_2_retries_inside_window: +(100 * (1 - (1 - rate) * (1 - rate))).toFixed(1),
  };
}

/* ── 6b · caracterización del proveedor y TTL del token (solo POSTFIX) ─────── */
function jsonl(f) {
  const s = J(f);
  if (!s.trim()) return null;
  return s.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

function providerCodes() {
  const L = jsonl('provider_codes.jsonl');
  if (!L) return null;
  const b = (L.find((x) => x.kind === 'PC_B') || {}).rutas || {};
  const row = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === '_gateway') continue;
    row[k] = { provider: v.map((x) => x.prov), cdn: v.map((x) => x.cdn ?? null) };
  }
  const d = (L.find((x) => x.kind === 'PC_D_concurrencia') || {}).res || null;
  return { routes: row, gateway: b._gateway || null, concurrency: d,
           utc: (L.find((x) => x.kind === 'PC_META') || {}).utc };
}

function tokenTtl() {
  const L = jsonl('token_ttl.jsonl');
  if (!L) return null;
  const u = L.find((x) => x.kind === 'TOK_UNIQUENESS') || {};
  const t = (L.find((x) => x.kind === 'TOK_TTL') || {}).trials || [];
  const first509 = t.map((x) => x.first_509_at_s).filter((v) => v !== null && v !== undefined);
  return {
    utc: (L.find((x) => x.kind === 'TOK_META') || {}).utc,
    unique_per_request: u.unique_per_request === true,
    distinct_of_n: `${u.distinct}/${u.n}`,
    trials: t.map((x) => ({ trial: x.trial, first_509_at_s: x.first_509_at_s,
                            ok_at: (x.samples || []).filter((s) => s.status === 200).map((s) => s.t_s),
                            fresh_token_after: x.fresh_token_after })),
    ttl_bounds_s: { min_first_509: first509.length ? Math.min(...first509) : null,
                    max_first_509: first509.length ? Math.max(...first509) : null,
                    trials_without_509: t.length - first509.length,
                    grid_max_s: 30 },
    verdict: 'token único por petición; caduca en decenas de segundos (6-15 s medidos, 1/3 >30 s). Un token rancio => 509.',
  };
}

/* ── main ──────────────────────────────────────────────────────────────────── */
const l443 = loadLog('access443_cdn.log');
const l8088 = loadLog('access8088_cdn.log');
const groups = ['externo', 'harness', 'scanner'];
const perGroup = {};
for (const g of groups) perGroup[g] = analyze(l443.filter((r) => groupOf(r) === g), g);

const out = {
  generated_at: new Date().toISOString(),
  run_dir: path.basename(RUN),
  source: { '443_log': 'playlist_access.log (vhost público)', '8088_log': 'access.log (plano)' },
  public_443: {
    total: l443.length,
    overall: analyze(l443, 'todos'),
    by_group: perGroup,
    clients: Object.entries(l443.reduce((a, r) => ((a[r.ip] = (a[r.ip] || 0) + 1), a), {}))
      .sort((a, b) => b[1] - a[1]).map(([ip, n]) => ({ ip, n })),
  },
  plane_8088: { total: l8088.length, overall: analyze(l8088, 'todos') },
  clients_detail: ['146.70.86.222', '181.130.154.235', '178.156.147.234', '127.0.0.1']
    .map((ip) => ({ ip, ...analyze(l443.filter((r) => r.ip === ip), ip) })),
  campaign_controlled: campaign(),
  breaker_ab: ab(),
  provider_codes: providerCodes(),
  token_ttl: tokenTtl(),
  metric_definition_fix: {
    actual_formula: 'error_ratio = all_failed / req   (req SOLO cuenta éxitos -> no es una ratio)',
    actual_published_example: 'E1: 24 fallos / 91 éxitos = 0.2637 publicado; el ratio real de intentos es 0.2088',
    correct_formula: 'error_ratio = all_failed / (all_failed + req)',
    note: 'req se incrementa SOLO en el camino de éxito de ape_gateway.lua; all_failed en el de fallo. La suma es el nº de intentos.',
    historical_recomputed: historical,
  },
  playback_impact: playbackImpact(l443.filter((r) => groupOf(r) === 'externo'),
                                  l443.filter((r) => groupOf(r) === 'externo' && r.status !== 200)),
};

fs.writeFileSync(path.join(RUN, 'E11_evidence.json'), JSON.stringify(out, null, 2));

/* ── resumen legible ──────────────────────────────────────────────────────── */
const p = console.log;
p('══ E11 · EVIDENCIA ══');
p(`\n[443 público] total ${l443.length} · ${JSON.stringify(perGroup.externo.dist)} (externos)`);
for (const g of groups) {
  const a = perGroup[g];
  if (!a.total) continue;
  p(`  ${g.padEnd(8)} n=${String(a.total).padStart(3)} ok=${String(a.ok).padStart(3)} bad=${String(a.bad).padStart(3)}`
    + ` · oficial=${a.error_ratio_official} honesto=${a.error_ratio_honest}`
    + ` · ventanas=${a.breaker_windows} skips≈${a.breaker_skips_est} reales≈${a.real_attempts_est}`
    + ` · amplificación=${a.amplification}× · ${a.skip_share_pct}% fabricado por el breaker`);
}
p(`\n[8088 plano] total ${l8088.length} · ${JSON.stringify(analyze(l8088, 'x').dist)}`);
if (out.campaign_controlled) {
  const c = out.campaign_controlled;
  p(`\n[campaña] ${c.total.n} GET · ok ${c.total.ok} · bad ${c.total.bad} · arms ${JSON.stringify(
    Object.fromEntries(Object.entries(c.by_arm).map(([k, v]) => [k, { n: v.n, ok: v.ok, bad: v.bad, p50: v.ttfb_p50 }])))}`);
  p(`  delta contadores: ${JSON.stringify(c.counter_delta)} · breaker abierto en ${Object.values(c.by_arm)
    .reduce((a, v) => a + v.breaker_open_at_req, 0)} peticiones`);
}
if (out.breaker_ab) {
  p(`\n[A/B breaker] trigger=${JSON.stringify(out.breaker_ab.trigger)}`);
  p(`  ventana: ${out.breaker_ab.window.fails}/${out.breaker_ab.window.n} fallos · 502=${out.breaker_ab.window.all_502}`
    + ` · sin X-APE=${out.breaker_ab.window.all_no_xape} · ms:0=${out.breaker_ab.window.all_ms0}`
    + ` · sin reason=${out.breaker_ab.window.all_no_reason}`);
  p(`  ttfb ventana ${out.breaker_ab.window.ttfb_ms.min}-${out.breaker_ab.window.ttfb_ms.max} ms ·`
    + ` proveedor sano durante la ventana=${out.breaker_ab.window.provider_healthy_throughout_window}`);
  p(`  recuperación a t=${out.breaker_ab.window.recovery_at_s}s (ttfb ${out.breaker_ab.window.recovery_ttfb_ms} ms)`);
}
if (out.provider_codes) {
  p('\n[proveedor · códigos por ruta] (3 muestras cada una)');
  for (const [k, v] of Object.entries(out.provider_codes.routes)) p(`  ${k.padEnd(22)} prov=${JSON.stringify(v.provider)} cdn=${JSON.stringify(v.cdn)}`);
  const g = out.provider_codes.gateway || {};
  for (const [k, v] of Object.entries(g)) p(`  gateway/${k.padEnd(16)} status=${v.status} reason=${(v.body || {}).reason} ms=${(v.body || {}).ms}`);
  if (out.provider_codes.concurrency) p(`  concurrencia 6×: ${JSON.stringify(out.provider_codes.concurrency.prov)} / gw ${JSON.stringify(out.provider_codes.concurrency.gw)}`);
}
if (out.token_ttl) {
  p(`\n[token 302] único por petición=${out.token_ttl.unique_per_request} (${out.token_ttl.distinct_of_n})`
    + ` · primer 509 a los ${JSON.stringify(out.token_ttl.ttl_bounds_s)}`);
  for (const t of out.token_ttl.trials) p(`  trial ${t.trial}: 200 en ${JSON.stringify(t.ok_at)} · first_509=${t.first_509_at_s}`);
}
p(`\n[impacto] ${JSON.stringify(out.playback_impact)}`);
p(`\n[histórico recomputado]`);
for (const h of historical) p(`  ${h.label}: oficial ${h.official} -> honesto ${h.honest} (${h.error_pct_del_published}% de sobrevaloración)`);
p(`\n→ ${path.join(RUN, 'E11_evidence.json')}`);
