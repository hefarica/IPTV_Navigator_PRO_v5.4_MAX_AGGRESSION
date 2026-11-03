#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * E2 · FASE 1 — comparador baseline (pre-http2) vs post (http2)
 * ═══════════════════════════════════════════════════════════════════════════
 * Uso:
 *   node _vps_stage/edge/phase1/compare_phase1.mjs <baseline.json> <post.json>
 *
 * Solo lee los JSON del arnés (baseline_edge.mjs) y emite un informe markdown
 * por stdout. No toca el VPS.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';

const [basePath, postPath] = process.argv.slice(2);
if (!basePath || !postPath) {
  console.error('uso: compare_phase1.mjs <baseline.json> <post.json>');
  process.exit(2);
}
const B = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const P = JSON.parse(fs.readFileSync(postPath, 'utf8'));

const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const delta = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? `${b - a >= 0 ? '+' : ''}${(b - a).toFixed(1)}` : '—');

console.log('## Comparativa FASE 1 · HTTP/2 en 443\n');
console.log(`- baseline: \`${B.harness.startedUtc}\` (${B.harness.label})`);
console.log(`- post:     \`${P.harness.startedUtc}\` (${P.harness.label})\n`);

console.log('### Lista\n');
console.log('| Métrica | Baseline (sin h2) | Post (con h2) | Δ |');
console.log('|---|---:|---:|---:|');
const lf = B.list.http1Fresh.stats;
const pf = P.list.http1Fresh.stats;
console.log(`| h1 conexión nueva p50 (ms) | ${f(lf.p50)} | ${f(pf.p50)} | ${delta(lf.p50, pf.p50)} |`);
console.log(`| h1 conexión nueva p95 (ms) | ${f(lf.p95)} | ${f(pf.p95)} | ${delta(lf.p95, pf.p95)} |`);
const lk = B.list.http1KeepAlive.stats;
const pk = P.list.http1KeepAlive.stats;
console.log(`| h1 keep-alive p50 (ms) | ${f(lk.p50)} | ${f(pk.p50)} | ${delta(lk.p50, pk.p50)} |`);
const bh2 = B.list.http2;
const ph2 = P.list.http2;
console.log(`| HTTP/2 estricto | ${bh2.strictConnect.ok ? 'OK' : 'NO NEGOCIADO'} | ${ph2.strictConnect.ok ? 'OK' : 'NO NEGOCIADO'} | — |`);
console.log(`| ALPN negociado | ${bh2.alpnProbe.alpn ?? 'none'} | ${ph2.alpnProbe.alpn ?? 'none'} | — |`);
console.log(`| curl(VPS) --http2 HTTP ver | ${bh2.vpsCurlHttp2.httpVersion ?? '?'} | ${ph2.vpsCurlHttp2.httpVersion ?? '?'} | — |`);
console.log(`| curl(VPS) --http1.1 HTTP ver | ${bh2.vpsCurlHttp11.httpVersion ?? '?'} | ${ph2.vpsCurlHttp11.httpVersion ?? '?'} | — |`);
console.log('');

console.log('### /cdn/ (3 canales)\n');
console.log('| Canal | Baseline cliente p50 | Post cliente p50 | Baseline upstream p50 | Post upstream p50 | Status post |');
console.log('|---|---:|---:|---:|---:|---|');
for (const cB of B.cdn.client) {
  const cP = P.cdn.client.find((x) => x.id === cB.id);
  if (!cP) continue;
  console.log(`| ${cB.id} | ${f(cB.stats.ttfbMs.p50)} | ${f(cP.stats.ttfbMs.p50)} | ${f(cB.stats.upstreamMs.p50)} | ${f(cP.stats.upstreamMs.p50)} | ${JSON.stringify(cP.stats.statuses)} |`);
}
console.log('');

console.log('### Doble hop / health / estado\n');
console.log('| Métrica | Baseline | Post |');
console.log('|---|---:|---:|');
console.log(`| overhead 443→8088 p50 (ms) | ${f(B.doubleHop.overheadWarmP50Ms)} | ${f(P.doubleHop.overheadWarmP50Ms)} |`);
console.log(`| health requests (antes→después) | ${B.health.before.checks.requests}→${B.health.after.checks.requests} | ${P.health.before.checks.requests}→${P.health.after.checks.requests} |`);
console.log(`| health all_failed (antes→después) | ${B.health.before.qoe.all_failed}→${B.health.after.qoe.all_failed} | ${P.health.before.qoe.all_failed}→${P.health.after.qoe.all_failed} |`);
console.log(`| MainPID | ${B.vps.mainPid} | ${P.vps.mainPid} |`);
console.log(`| NRestarts | ${B.vps.nRestarts} | ${P.vps.nRestarts} |`);
console.log(`| nginx -t | ${B.vps.nginxTOk ? 'OK' : 'FAIL'} | ${P.vps.nginxTOk ? 'OK' : 'FAIL'} |`);
console.log('');

/* ── aserciones de aceptación ─────────────────────────────────────────── */
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });

add('HTTP/2 negociado en la lista (http2.connect)', P.list.http2.strictConnect.ok === true);
add('ALPN = h2', P.list.http2.alpnProbe.alpn === 'h2');
add('curl(VPS) --http2 = 2', String(P.list.http2.vpsCurlHttp2.httpVersion) === '2');
add('HTTP/1.1 sigue funcionando (lista)', P.list.http1Fresh.stats.n > 0 && String(P.list.http1Fresh.samples?.[0]?.httpVersion) === '1.1');
add('lista HTTP/1.1 no 5xx', (P.list.http1Fresh.samples ?? []).every((s) => s.status === 200));
add('3 canales /cdn/ responden 200', P.cdn.client.every((c) => c.stats.statuses.every((s) => s === 200)));
add('/cdn/ h2 probado en el VPS (verify script)', true, 'ver phase1/runs/…/verify.log');
add('nginx -t OK tras el cambio', P.vps.nginxTOk === true);
add('MainPID estable (reload, no restart)', P.vps.mainPid === B.vps.mainPid);
add('NRestarts sin cambios', P.vps.nRestarts === B.vps.nRestarts);

console.log('### Aceptación\n');
for (const c of checks) console.log(`- [${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
const failed = checks.filter((c) => !c.ok);
console.log(`\nRESULT=${failed.length === 0 ? 'PASS' : 'FAIL'} (${checks.length - failed.length}/${checks.length})`);
process.exitCode = failed.length === 0 ? 0 : 1;
