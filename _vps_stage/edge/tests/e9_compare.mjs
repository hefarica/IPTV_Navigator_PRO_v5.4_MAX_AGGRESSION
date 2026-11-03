#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * E9 · e9_compare.mjs — tabla ANTES/DESPUES de runs del arnés de t1 (v1.0.0)
 * ---------------------------------------------------------------------------
 * NO mide: solo lee `baseline.json` producidos por `baseline_edge.mjs` v1.0.1 y
 * los tabula con el MISMO esquema, para que la comparación no dependa de la prosa
 * de ningún informe.
 *
 * Uso:
 *   node _vps_stage/edge/tests/e9_compare.mjs <antes.json> <despues.json> [...]
 *
 * Salida: tabla markdown por stdout + bloque JSON `E9_TABLE_JSON` al final.
 * Cero dependencias (Node >= 18).
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

const f = (x, d = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const sha16 = (s) => (s ? String(s).slice(0, 16) : null);

function load(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const hb = j.health?.before?.qoe || {};
  const ha = j.health?.after?.qoe || {};
  const req = Number(ha.req || 0);
  const failed = Number(ha.all_failed || 0);
  const reqB = Number(hb.req || 0);
  const failedB = Number(hb.all_failed || 0);
  const chans = [3, 5, 6].map((id) => {
    const c = (j.cdn?.client || []).find((x) => x.id === String(id)) || {};
    const l = (j.cdn?.loopback || []).find((x) => x.id === String(id)) || {};
    return {
      id,
      clientTtfbP50: f(c.stats?.ttfbMs?.p50),
      clientTtfbP95: f(c.stats?.ttfbMs?.p95),
      clientUpstreamP50: f(c.stats?.upstreamMs?.p50),
      clientBytes: c.stats?.bytes?.p50 ?? null,
      clientStatuses: c.stats?.statuses || [],
      loopTtfbP50: f(l.stats?.ttfbMs?.p50),
      loopUpstreamP50: f(l.stats?.upstreamMs?.p50),
      loopBytes: l.stats?.bytes?.p50 ?? null,
      uhd: c.stats?.headersLast?.['x-ape-uhd'] ?? null,
      rebased: c.stats?.headersLast?.['x-ape-uri-rebased'] ?? null,
    };
  });
  return {
    file: path.basename(path.dirname(p)) + '/' + path.basename(p),
    label: j.harness?.label,
    startedUtc: j.harness?.startedUtc,
    nginxTSha256: sha16(j.vps?.nginxTSha256),
    h2ListenCount: j.vps?.h2ListenCount,
    defaultSha256: sha16((j.vps?.configs || []).find((c) => c.path.endsWith('sites-enabled/default'))?.sha256),
    mainPid: j.vps?.mainPid,
    nRestarts: j.vps?.nRestarts,
    listFiles: (j.vps?.listFiles || []).map((x) => `${path.basename(x.path)}:${x.size}:${x.mtimeEpoch}`),
    listH1P50: f(j.list?.http1Fresh?.stats?.p50),
    listH1P95: f(j.list?.http1Fresh?.stats?.p95),
    listKaP50: f(j.list?.http1KeepAlive?.stats?.p50),
    alpn: j.list?.http2?.alpnProbe?.alpn ?? null,
    h2StrictOk: j.list?.http2?.strictConnect?.ok ?? null,
    h2StrictStatus: j.list?.http2?.strictConnect?.status ?? null,
    curlHttp2: j.list?.http2?.vpsCurlHttp2?.httpVersion ?? null,
    curlHttp11: j.list?.http2?.vpsCurlHttp11?.httpVersion ?? null,
    listBytesGz: j.list?.bytes?.declaredGzip ?? null,
    channels: chans,
    healthOldBefore: j.health?.errorRatioBefore ?? null,
    healthOldAfter: j.health?.errorRatioAfter ?? null,
    countersBefore: { req: reqB, allFailed: failedB },
    countersAfter: { req, allFailed: failed },
    errorRatioHonestBefore: reqB + failedB > 0 ? f(failedB / (reqB + failedB), 4) : null,
    errorRatioHonestAfter: req + failed > 0 ? f(failed / (req + failed), 4) : null,
    overheadHopP50: j.doubleHop?.overheadWarmP50Ms ?? null,
    hopsList: j.hops?.list?.total ?? null,
    hopsCdn: j.hops?.cdn?.totalProven ?? null,
  };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('uso: node e9_compare.mjs <antes.json> <despues.json> [...]');
  process.exit(2);
}
const runs = files.map(load);

const COLS = [
  ['label', (r) => r.label],
  ['inicio UTC', (r) => r.startedUtc],
  ['nginx -T sha256', (r) => r.nginxTSha256],
  ['default sha256', (r) => r.defaultSha256],
  ['h2 en listen 443', (r) => r.h2ListenCount],
  ['ALPN negociado', (r) => r.alpn],
  ['http2.connect estricto', (r) => (r.h2StrictOk ? `OK ${r.h2StrictStatus}` : 'NO NEGOCIADO')],
  ['curl(VPS) --http2', (r) => r.curlHttp2],
  ['curl(VPS) --http1.1', (r) => r.curlHttp11],
  ['lista h1 nueva p50 ms', (r) => r.listH1P50],
  ['lista h1 nueva p95 ms', (r) => r.listH1P95],
  ['lista h1 keep-alive p50 ms', (r) => r.listKaP50],
  ['lista bytes (gzip)', (r) => r.listBytesGz],
  ['/cdn/ ch3 cliente p50 ms', (r) => r.channels[0].clientTtfbP50],
  ['/cdn/ ch5 cliente p50 ms', (r) => r.channels[1].clientTtfbP50],
  ['/cdn/ ch6 cliente p50 ms', (r) => r.channels[2].clientTtfbP50],
  ['/cdn/ ch3/5/6 cliente p95 ms', (r) => r.channels.map((c) => c.clientTtfbP95).join(' / ')],
  ['/cdn/ ch3 loopback p50 ms', (r) => r.channels[0].loopTtfbP50],
  ['/cdn/ upstream ch3/5/6 p50', (r) => r.channels.map((c) => c.clientUpstreamP50).join(' / ')],
  ['/cdn/ upstream loopback p50', (r) => r.channels.map((c) => c.loopUpstreamP50).join(' / ')],
  ['/cdn/ bytes ch3/5/6', (r) => r.channels.map((c) => c.clientBytes).join(' / ')],
  ['/cdn/ statuses 200?', (r) => r.channels.map((c) => (c.clientStatuses.every((s) => s === 200) ? '3x200' : c.clientStatuses.join('+'))).join(' / ')],
  ['X-APE-UHD', (r) => r.channels.map((c) => c.uhd).join(' / ')],
  ['X-APE-URI-Rebased', (r) => r.channels.map((c) => c.rebased).join(' / ')],
  ['hops lista / hops /cdn/', (r) => `${r.hopsList} / ${r.hopsCdn}`],
  ['overhead 443→8088 p50 ms', (r) => r.overheadHopP50],
  ['error_ratio publicado (viejo)', (r) => `${r.healthOldBefore} → ${r.healthOldAfter}`],
  ['error_ratio honesto fallos/(fallos+éxitos)', (r) => `${r.errorRatioHonestBefore} → ${r.errorRatioHonestAfter}`],
  ['intentos acumulados (req/fallos)', (r) => `${r.countersAfter.req}/${r.countersAfter.allFailed}`],
  ['MainPID / NRestarts', (r) => `${r.mainPid} / ${r.nRestarts}`],
  ['ficheros de lista (bytes:mtime)', (r) => r.listFiles.map((s) => s.split(':').slice(0, 2).join(':')).join(' · ')],
];

const out = [];
out.push(`| métrica | ${runs.map((r) => r.label).join(' | ')} |`);
out.push(`|---|${runs.map(() => '---:').join('|')}|`);
for (const [name, get] of COLS) {
  out.push(`| ${name} | ${runs.map((r) => (get(r) === null || get(r) === undefined ? '—' : get(r))).join(' | ')} |`);
}
const table = out.join('\n');
console.log(table);
console.log('\nE9_TABLE_JSON_BEGIN');
console.log(JSON.stringify({ generatedUtc: new Date().toISOString(), runs }, null, 2));
console.log('E9_TABLE_JSON_END');
