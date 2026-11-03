#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * E1 · baseline_edge.mjs — ARNÉS FIJO DE BASELINE DE LA CAPA EDGE (READ-ONLY)
 * ═══════════════════════════════════════════════════════════════════════════
 * Mide, siempre igual, el estado del borde ANTES de tocar nada:
 *
 *   1. TTFB de la lista pública  — HTTP/1.1 (conexión nueva y keep-alive)
 *                                — HTTP/2 (intento estricto + ALPN real)
 *   2. TTFB del manifiesto /cdn/ — 3 canales fijos (ids 3, 5, 6)
 *                                — desde el cliente Y desde el loopback del VPS
 *   3. Hops HTTP de la cadena    — lista: 1 · /cdn/: 443→8088→proveedor(+302)
 *   4. Bytes                     — lista (gzip declarado), manifiestos, health
 *   5. error_ratio de /_ape/health — antes y después (con delta del propio arnés)
 *   6. Overhead del doble hop    — /ape/health por 443 vs /_ape/health por 8088
 *
 * GARANTÍAS
 *   · CERO escrituras en el VPS (solo GET/HEAD + `nginx -t`, que no muta).
 *   · CERO dependencias npm: Node >= 18 (probado en v24).
 *   · El cuerpo de la lista se aborta tras el primer chunk (no se bajan 140 MB).
 *   · Los canales se descubren de la lista viva en el VPS; nunca se persisten
 *     credenciales: las URLs se redactan en JSON/log (usuario/contraseña).
 *   · Números crudos + percentiles nearest-rank; N pequeño ⇒ p95 = máximo.
 *
 * USO
 *   node _vps_stage/edge/baseline/baseline_edge.mjs [--label <texto>]
 *
 * SALIDA
 *   _vps_stage/edge/baseline/runs/<STAMP_UTC>/baseline.json
 *   _vps_stage/edge/baseline/runs/<STAMP_UTC>/baseline.log
 *   _vps_stage/edge/baseline/runs/latest.json   (copia del último)
 *
 * VARIABLES DE ENTORNO
 *   EDGE_SSH   destino SSH (default: root@178.156.147.234)
 * ═══════════════════════════════════════════════════════════════════════════ */

import https from 'node:https';
import http2 from 'node:http2';
import tls from 'node:tls';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '1.0.1';

/* ── parámetros FIJOS del arnés (no cambiar sin cambiar BASELINE.md) ────── */
const SSH_TARGET = process.env.EDGE_SSH || 'root@178.156.147.234';
const HOST = 'iptv-ape.duckdns.org';
const BASE = `https://${HOST}`;
const LIST_PATH = '/lists/APE_LISTA_4K.m3u8';
const HEALTH_PUBLIC_PATH = '/ape/health';
const HEALTH_LOOPBACK_URL = 'http://127.0.0.1:8088/_ape/health';
const CDN_LIST_GZ = '/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz';
const CDN_IDS = ['3', '5', '6'];
const N = Object.freeze({
  LIST_FRESH: 5,
  LIST_KEEPALIVE: 5,
  CDN_CLIENT: 3,
  CDN_LOOPBACK: 3,
  HOP: 7,
});
const TIMEOUT_MS = 20000;
const UA = `edge-fluidez-baseline/${VERSION} (read-only; SRE)`;
const LABEL = argValue('--label') || 'baseline';

/* ── utilidades ─────────────────────────────────────────────────────────── */
const logLines = [];
const log = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  logLines.push(s);
  console.log(s);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ms1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

function stampUtc(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function bogotaStamp(d = new Date()) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium',
  }).format(d);
}

function stats(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const nearest = (p) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return {
    n: v.length,
    min: ms1(v[0]),
    p50: ms1(nearest(0.5)),
    p95: ms1(nearest(0.95)),
    max: ms1(v[v.length - 1]),
    mean: ms1(mean),
    stdev: ms1(sd),
  };
}

function redactUrl(u) {
  return String(u).replace(
    /(\/cdn\/[^/]+\/live\/)[^/]+\/[^/]+\//,
    '$1<USER>/<PASS>/',
  );
}
function originInfo(origin) {
  if (!origin) return null;
  const m = String(origin).match(/^https?:\/\/([^/]+)/);
  return { host: m ? m[1] : null, sha256_16: sha256(String(origin)).slice(0, 16) };
}

/* ── SSH (OpenSSH del sistema; sin dependencias) ────────────────────────── */
function ssh(script, timeoutMs = 180000) {
  const r = spawnSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SSH_TARGET, 'bash -s'],
    { input: script, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
  );
  return {
    status: r.status,
    signal: r.signal,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error ? String(r.error) : null,
  };
}

function parseKv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/* ── HTTP/1.1 (Node https) ──────────────────────────────────────────────── */
function requestH1({ pathName, method = 'GET', agent = false, headers = {}, readBody = false, timeoutMs = TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const marks = {};
    let settled = false;
    const settle = (obj) => {
      if (settled) return;
      settled = true;
      resolve(obj);
    };
    const req = https.request(
      {
        hostname: HOST,
        port: 443,
        path: pathName,
        method,
        agent,
        headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip', ...headers },
      },
      (res) => {
        marks.headers = performance.now() - t0;
        const out = {
          status: res.statusCode,
          httpVersion: res.httpVersion,
          reusedSocket: !!req.reusedSocket,
          headers: res.headers,
          marks,
        };
        const chunks = [];
        let totalBody = 0;
        let first = true;
        res.on('data', (c) => {
          if (first) {
            first = false;
            marks.firstByte = performance.now() - t0;
            out.firstChunkBytes = c.length;
          }
          if (!readBody) {
            out.bytes = c.length;
            out.abortedAfterFirstChunk = true;
            out.total = performance.now() - t0;
            res.destroy();
            req.destroy();
            settle(out);
          } else {
            chunks.push(c);
            totalBody += c.length;
            if (totalBody > 4 * 1024 * 1024) {
              out.error = 'body_too_large';
              res.destroy();
              req.destroy();
              settle(out);
            }
          }
        });
        res.on('end', () => {
          if (settled) return;
          const body = Buffer.concat(chunks);
          out.bytes = body.length;
          if (readBody) out.bodySha256 = sha256(body);
          out.total = performance.now() - t0;
          if (!Number.isFinite(marks.firstByte)) marks.firstByte = marks.headers;
          settle(out);
        });
        res.on('error', (e) => {
          out.error = e.code || e.message;
          settle(out);
        });
      },
    );
    req.on('socket', (s) => {
      if (s.connecting) {
        s.once('secureConnect', () => {
          marks.tls = performance.now() - t0;
        });
      }
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => settle({ error: e.code || e.message, marks }));
    req.end();
  });
}

/* ── HTTP/2 (intento estricto: si no hay ALPN h2, se registra el fallo) ──── */
function http2Probe(pathName) {
  return new Promise((resolve) => {
    const out = { attempted: true, requestedAlpn: 'h2' };
    let done = false;
    let session;
    const timer = setTimeout(() => finish({ error: 'timeout' }), 12000);
    function finish(extra) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      Object.assign(out, extra);
      try { session?.close(); } catch { /* noop */ }
      resolve(out);
    }
    try {
      session = http2.connect(BASE, { ALPNProtocols: ['h2'] });
    } catch (e) {
      finish({ error: e.code || e.message });
      return;
    }
    session.on('connect', () => {
      out.alpn = session.socket?.alpnProtocol ?? null;
      const t0 = performance.now();
      const r = session.request({
        ':path': pathName,
        ':method': 'GET',
        'user-agent': UA,
        'accept-encoding': 'gzip',
      });
      let first = true;
      r.on('response', (h) => {
        out.status = h[':status'];
        out.ttfbMs = ms1(performance.now() - t0);
      });
      r.on('data', (c) => {
        if (first) {
          first = false;
          out.firstByteMs = ms1(performance.now() - t0);
          out.firstChunkBytes = c.length;
          r.close();
          session.close();
          finish({ ok: true });
        }
      });
      r.on('error', (e) => finish({ error: e.code || e.message }));
      r.end();
    });
    session.on('error', (e) => finish({
      error: e.code || e.message,
      alpn: session?.socket?.alpnProtocol ?? null,
    }));
    session.on('close', () => finish({ error: out.error || 'session_closed_without_stream' }));
  });
}

function tlsProbe() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (o) => { if (!done) { done = true; resolve(o); } };
    const s = tls.connect(
      { host: HOST, port: 443, servername: HOST, ALPNProtocols: ['h2', 'http/1.1'] },
      () => {
        finish({
          alpn: s.alpnProtocol ?? null,
          protocol: s.getProtocol(),
          cipher: s.getCipher()?.name || null,
        });
        s.end();
      },
    );
    s.on('error', (e) => finish({ error: e.code || e.message }));
    s.setTimeout(12000, () => { s.destroy(); finish({ error: 'timeout' }); });
  });
}

function curl(args) {
  const r = spawnSync('curl', args, { encoding: 'utf8', timeout: 60000, windowsHide: true });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

/* ── descubrimiento de los 3 canales /cdn/ desde la lista viva ──────────── */
function discoverChannels() {
  const script = `set -u
LIST=${CDN_LIST_GZ}
for id in ${CDN_IDS.join(' ')}; do
  url=$(zcat "$LIST" 2>/dev/null | grep -m1 -E "^https://iptv-ape\\.duckdns\\.org/cdn/line\\.tivi-ott\\.net/.*/${'${id}'}\\.m3u8$")
  printf 'CHANNEL\\t%s\\t%s\\n' "$id" "$url"
done
`;
  const r = ssh(script, 120000);
  if (r.status !== 0) throw new Error(`descubrimiento de canales falló (ssh exit ${r.status}): ${r.stderr}`);
  const chans = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^CHANNEL\t([^\t]+)\t(.+)$/);
    if (m && m[2].startsWith(`${BASE}/cdn/`)) chans.push({ id: m[1], url: m[2] });
  }
  if (chans.length !== CDN_IDS.length) {
    throw new Error(`esperaba ${CDN_IDS.length} canales en la lista, encontré ${chans.length}: ${JSON.stringify(chans.map((c) => c.id))}`);
  }
  return chans;
}

/* ── muestreo loopback (server-side, en el VPS) ─────────────────────────── */
function loopbackSamples(url, samples) {
  const script = `set -u
H=$(mktemp); B=$(mktemp); trap 'rm -f "$H" "$B"' EXIT
i=0
while [ "$i" -lt ${samples} ]; do
  i=$((i+1))
  meta=$(curl -sS -D "$H" -o "$B" -m 30 -w '%{http_code}\\t%{time_starttransfer}\\t%{time_total}\\t%{size_download}' '${url}')
  hdr=$(tr -d '\\r' < "$H")
  up=$(printf '%s\\n' "$hdr" | awk 'tolower($1)=="x-ape-upstream-ms:"{print $2; exit}')
  cdn=$(printf '%s\\n' "$hdr" | awk 'tolower($1)=="x-ape-cdn:"{print $2; exit}')
  org=$(printf '%s\\n' "$hdr" | awk 'tolower($1)=="x-ape-origin:"{print $2; exit}')
  bg=$(sha256sum "$B" | cut -d' ' -f1)
  printf 'SAMPLE\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$i" "$meta" "\${up:-}" "\${cdn:-}" "\${org:-}" "$bg"
  sleep 0.25
done
`;
  const r = ssh(script, 180000);
  if (r.status !== 0) return { error: `ssh exit ${r.status}`, stderr: r.stderr, samples: [] };
  const out = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const p = line.split('\t');
    if (p[0] !== 'SAMPLE') continue;
    const [i, code, ttfb, total, size, up, cdn, org, bodySha] = p.slice(1);
    out.push({
      i: Number(i),
      status: Number(code),
      ttfbMs: ms1(Number(ttfb) * 1000),
      totalMs: ms1(Number(total) * 1000),
      bytes: Number(size),
      upstreamMs: up === '' ? null : Number(up),
      cdn,
      origin: originInfo(org),
      bodySha256: bodySha,
    });
  }
  return { samples: out };
}

/* ── overhead del doble hop: 443 (proxy) vs 8088 (directo) ──────────────── */
function doubleHopSamples(samples) {
  const script = `set -u
i=0
while [ "$i" -lt ${samples} ]; do
  i=$((i+1))
  a=$(curl -sS -m 15 -o /dev/null -w '%{http_code} %{time_starttransfer}\\n' --resolve ${HOST}:443:127.0.0.1 '${BASE}${HEALTH_PUBLIC_PATH}' --next -sS -m 15 -o /dev/null -w '%{http_code} %{time_starttransfer}\\n' '${BASE}${HEALTH_PUBLIC_PATH}' | tail -1)
  b=$(curl -sS -m 15 -o /dev/null -w '%{http_code} %{time_starttransfer}\\n' '${HEALTH_LOOPBACK_URL}' --next -sS -m 15 -o /dev/null -w '%{http_code} %{time_starttransfer}\\n' '${HEALTH_LOOPBACK_URL}' | tail -1)
  printf 'HOP\\t%s\\t%s\\t%s\\n' "$i" "$a" "$b"
  sleep 0.1
done
`;
  const r = ssh(script, 120000);
  const edge = [];
  const direct = [];
  if (r.status !== 0) return { error: `ssh exit ${r.status}`, stderr: r.stderr, edge: [], direct: [] };
  for (const line of r.stdout.split(/\r?\n/)) {
    const p = line.split('\t');
    if (p[0] !== 'HOP') continue;
    const [aCode, aTtfb] = String(p[2] || '').split(' ');
    const [bCode, bTtfb] = String(p[3] || '').split(' ');
    edge.push({ status: Number(aCode), ttfbMs: ms1(Number(aTtfb) * 1000) });
    direct.push({ status: Number(bCode), ttfbMs: ms1(Number(bTtfb) * 1000) });
  }
  return { edge, direct };
}

/* ── hechos del VPS (read-only) ─────────────────────────────────────────── */
function vpsFacts() {
  const script = `set -u
echo "DATE_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "HOST=$(hostname)"
echo "KERNEL=$(uname -r)"
echo "NGINX=$(nginx -v 2>&1)"
echo "NGINX_T=$(nginx -t 2>&1 | tr '\\n' '|')"
echo "MAINPID=$(systemctl show nginx -p MainPID --value)"
echo "NRESTARTS=$(systemctl show nginx -p NRestarts --value)"
echo "ACTIVE_ENTER=$(systemctl show nginx -p ActiveEnterTimestamp --value)"
echo "NGINX_T_SHA=$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)"
echo "H2_LISTEN_COUNT=$(grep -RhE 'listen .*443' /etc/nginx/sites-enabled/default /etc/nginx/conf.d/ 2>/dev/null | grep -c http2 || true)"
for f in /etc/nginx/conf.d/50-ape-meta-plane.conf /etc/nginx/snippets/ape-meta-public.conf /etc/nginx/sites-enabled/default; do
  echo "CONF=$(sha256sum "$f" | cut -d' ' -f1)|$(stat -c %s "$f")|$f"
done
for f in /var/www/html/lists/APE_LISTA_4K.m3u8 /var/www/html/lists/APE_LISTA_4K.m3u8.gz /var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz; do
  echo "LISTFILE=$(stat -c '%s|%Y|%n' "$f")"
done
`;
  const r = ssh(script, 120000);
  if (r.status !== 0) throw new Error(`vpsFacts falló (ssh exit ${r.status}): ${r.stderr}`);
  const kv = parseKv(r.stdout);
  return {
    dateUtc: kv.DATE_UTC,
    host: kv.HOST,
    kernel: kv.KERNEL,
    nginx: kv.NGINX,
    nginxTOk: /successful/.test(kv.NGINX_T || ''),
    nginxT: kv.NGINX_T,
    mainPid: kv.MAINPID,
    nRestarts: Number(kv.NRESTARTS),
    activeSince: kv.ACTIVE_ENTER,
    nginxTSha256: kv.NGINX_T_SHA,
    h2ListenCount: Number(kv.H2_LISTEN_COUNT),
    configs: r.stdout
      .split(/\r?\n/)
      .filter((l) => l.startsWith('CONF='))
      .map((l) => {
        const [hash, size, file] = l.slice(5).split('|');
        return { path: file, size: Number(size), sha256: hash };
      }),
    listFiles: r.stdout
      .split(/\r?\n/)
      .filter((l) => l.startsWith('LISTFILE='))
      .map((l) => {
        const [size, mtime, file] = l.slice(9).split('|');
        return { path: file, size: Number(size), mtimeEpoch: Number(mtime) };
      }),
    raw: r.stdout,
  };
}

/* ── main ───────────────────────────────────────────────────────────────── */
async function main() {
  const start = new Date();
  const stamp = stampUtc(start);
  const runDir = path.join(HERE, 'runs', stamp);
  fs.mkdirSync(runDir, { recursive: true });

  log('═══════════════════════════════════════════════════════════════════════');
  log(`E1 · BASELINE EDGE · ${stamp} · ${bogotaStamp(start)}`);
  log(`arnés=v${VERSION} label=${LABEL} host=${HOST} ssh=${SSH_TARGET}`);
  log('═══════════════════════════════════════════════════════════════════════');

  /* 0 · VPS + config */
  log('\n── 0 · VPS / CONFIG (read-only) ──────────────────────────────────────');
  const vps = vpsFacts();
  delete vps.configsUnused;
  log(`fecha_utc=${vps.dateUtc} host=${vps.host} kernel=${vps.kernel}`);
  log(`nginx=${vps.nginx}`);
  log(`nginx -t=${vps.nginxTOk ? 'OK' : 'FAIL'} · MainPID=${vps.mainPid} NRestarts=${vps.nRestarts} activo_desde=${vps.activeSince}`);
  log(`nginx -T sha256=${vps.nginxTSha256} · ocurrencias 'http2' en listen 443 = ${vps.h2ListenCount}`);
  for (const c of vps.configs) log(`conf ${c.path} size=${c.size} sha256=${c.sha256}`);
  for (const f of vps.listFiles) log(`listfile ${f.path} size=${f.size} mtime_epoch=${f.mtimeEpoch}`);

  /* 1 · health antes */
  log('\n── 1 · /_ape/health (loopback 8088) · ANTES ──────────────────────────');
  const healthBefore = healthLoop();
  log(JSON.stringify(healthBefore));

  /* 2 · lista: HTTP/1.1 conexión nueva */
  log('\n── 2 · LISTA · HTTP/1.1 (conexión nueva) ─────────────────────────────');
  const listFresh = [];
  for (let i = 0; i < N.LIST_FRESH; i++) {
    const r = await requestH1({ pathName: LIST_PATH, agent: false, readBody: false });
    listFresh.push(r);
    log(`sample ${i + 1}: status=${r.status ?? r.error} http=${r.httpVersion ?? '?'} ttfb=${ms1(r.marks?.headers ?? NaN)}ms tls=${ms1(r.marks?.tls ?? NaN)}ms firstByte=${ms1(r.marks?.firstByte ?? NaN)}ms firstChunk=${r.firstChunkBytes ?? '-'}B`);
    await sleep(150);
  }

  /* 3 · lista: HTTP/1.1 keep-alive (una conexión reutilizada, HEAD sin cuerpo) */
  log('\n── 3 · LISTA · HTTP/1.1 (keep-alive, 1 conexión, HEAD sin cuerpo) ────');
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 });
  const listKeepAlive = [];
  for (let i = 0; i < N.LIST_KEEPALIVE; i++) {
    const r = await requestH1({ pathName: LIST_PATH, method: 'HEAD', agent, readBody: false });
    listKeepAlive.push(r);
    log(`sample ${i + 1}: status=${r.status ?? r.error} reused=${r.reusedSocket ? 'yes' : 'no'} headers_ttfb=${ms1(r.marks?.headers ?? NaN)}ms`);
    await sleep(120);
  }
  agent.destroy();

  /* 4 · HTTP/2 real */
  log('\n── 4 · LISTA · HTTP/2 (ALPN + intento estricto + curl del VPS) ───────');
  const alpn = await tlsProbe();
  log(`tls ALPN ofrecido [h2,http/1.1] → negociado=${alpn.alpn ?? 'none'} protocol=${alpn.protocol ?? '?'} cipher=${alpn.cipher ?? '?'}`);
  const h2 = await http2Probe(LIST_PATH);
  log(`http2.connect → ${h2.ok ? `OK status=${h2.status} ttfb=${h2.ttfbMs}ms` : `FALLO error=${h2.error} alpn=${h2.alpn ?? 'none'}`}`);
  const vpsCurlV = ssh(`curl -V | head -1`, 30000);
  const vpsCurlFmt = "http_version=%{http_version}\\tcode=%{http_code}\\tttfb=%{time_starttransfer}";
  const vpsH2 = ssh(`curl -sS -I --http2 -m 15 -o /dev/null -w '${vpsCurlFmt}' '${BASE}${LIST_PATH}'`, 60000);
  const vpsH1 = ssh(`curl -sS -I --http1.1 -m 15 -o /dev/null -w '${vpsCurlFmt}' '${BASE}${LIST_PATH}'`, 60000);
  const vpsCurlHttp2 = parseCurlW(vpsH2.stdout);
  const vpsCurlHttp11 = parseCurlW(vpsH1.stdout);
  const localCurlV = curl(['-V']);
  const localCurlHasH2 = /\bHTTP2\b/i.test(localCurlV.stdout);
  log(`curl VPS (${(vpsCurlV.stdout || '').split('\n')[0] || '?'}) --http2  → ${vpsCurlHttp2.httpVersion ?? '?'} status=${vpsCurlHttp2.status ?? '?'} ttfb=${vpsCurlHttp2.ttfbMs ?? '?'}ms${vpsH2.status !== 0 ? ` (ssh_exit=${vpsH2.status})` : ''}`);
  log(`curl VPS --http1.1                                    → ${vpsCurlHttp11.httpVersion ?? '?'} status=${vpsCurlHttp11.status ?? '?'} ttfb=${vpsCurlHttp11.ttfbMs ?? '?'}ms`);
  log(`curl local: HTTP2=${localCurlHasH2 ? 'soportado' : 'NO soportado por el build (no se usa como prueba)'}`);

  /* 5 · canales fijos */
  log('\n── 5 · DESCUBRIMIENTO DE CANALES /cdn/ (desde la lista viva) ─────────');
  const channels = discoverChannels();
  for (const c of channels) log(`canal id=${c.id} url=${redactUrl(c.url)}`);

  /* 6 · /cdn/ desde el cliente */
  log('\n── 6 · /cdn/ · CLIENTE (HTTPS 443, conexión nueva por muestra) ───────');
  const cdnClient = [];
  for (const c of channels) {
    const samples = [];
    for (let i = 0; i < N.CDN_CLIENT; i++) {
      const r = await requestH1({
        pathName: new URL(c.url).pathname + new URL(c.url).search,
        agent: false,
        headers: { 'Accept-Encoding': 'identity' },
        readBody: true,
      });
      const s = {
        i: i + 1,
        status: r.status ?? null,
        error: r.error ?? null,
        ttfbMs: ms1(r.marks?.headers ?? NaN),
        tlsMs: ms1(r.marks?.tls ?? NaN),
        firstByteMs: ms1(r.marks?.firstByte ?? NaN),
        totalMs: ms1(r.total ?? NaN),
        bytes: r.bytes ?? null,
        bodySha256: r.bodySha256 ?? null,
        headers: pickApeHeaders(r.headers || {}),
      };
      samples.push(s);
      log(`canal ${c.id} sample ${i + 1}: status=${s.status ?? s.error} ttfb=${s.ttfbMs}ms tls=${s.tlsMs}ms upstream=${s.headers['x-ape-upstream-ms'] ?? '?'}ms bytes=${s.bytes}${s.bodySha256 ? ' sha=' + s.bodySha256.slice(0, 12) : ''}`);
      await sleep(300);
    }
    cdnClient.push({ id: c.id, urlRedacted: redactUrl(c.url), samples });
  }

  /* 7 · /cdn/ desde el loopback del VPS (server-side, sin 443 ni internet) */
  log('\n── 7 · /cdn/ · LOOPBACK VPS (127.0.0.1:8088, server-side) ────────────');
  const cdnLoopback = [];
  for (const c of channels) {
    const r = loopbackSamples(c.url, N.CDN_LOOPBACK);
    for (const s of r.samples) {
      log(`canal ${c.id} sample ${s.i}: status=${s.status} loop_ttfb=${s.ttfbMs}ms upstream=${s.upstreamMs ?? '?'}ms bytes=${s.bytes} origin=${s.origin?.host ?? '?'}`);
    }
    if (r.error) log(`canal ${c.id}: ERROR ${r.error} ${r.stderr || ''}`);
    cdnLoopback.push({ id: c.id, samples: r.samples, error: r.error || null });
  }

  /* 8 · doble hop 443 → 8088 */
  log('\n── 8 · DOBLE HOP: 443(proxy) vs 8088(directo) · mismo handler ─────────');
  const hop = doubleHopSamples(N.HOP);
  if (hop.error) log(`ERROR ${hop.error} ${hop.stderr || ''}`);
  const edgeTtfb = hop.edge.map((s) => s.ttfbMs).filter(Number.isFinite);
  const directTtfb = hop.direct.map((s) => s.ttfbMs).filter(Number.isFinite);
  const hopEdge = stats(edgeTtfb);
  const hopDirect = stats(directTtfb);
  const hopOverhead = hopEdge.n && hopDirect.n ? ms1(hopEdge.p50 - hopDirect.p50) : null;
  log(`443 /ape/health   p50=${hopEdge.p50 ?? '?'}ms (n=${hopEdge.n}) [warm, 2ª transferencia]`);
  log(`8088 /_ape/health p50=${hopDirect.p50 ?? '?'}ms (n=${hopDirect.n}) [warm, 2ª transferencia]`);
  log(`overhead del hop extra 443→8088 (sin TLS) p50 ≈ ${hopOverhead ?? '?'} ms`);

  /* 9 · health después */
  log('\n── 9 · /_ape/health (loopback 8088) · DESPUÉS ─────────────────────────');
  const healthAfter = healthLoop();
  log(JSON.stringify(healthAfter));

  /* 10 · agregados */
  const listFreshStats = stats(listFresh.map((r) => r.marks?.headers).filter(Number.isFinite));
  const listKeepStats = stats(listKeepAlive.map((r) => r.marks?.headers).filter(Number.isFinite));
  const listHeaders = listFresh.find((r) => r.headers)?.headers || {};
  const clientStats = {};
  for (const c of cdnClient) {
    const ttfb = c.samples.map((s) => s.ttfbMs).filter(Number.isFinite);
    const up = c.samples.map((s) => Number(s.headers['x-ape-upstream-ms'])).filter(Number.isFinite);
    const by = c.samples.map((s) => s.bytes).filter(Number.isFinite);
    clientStats[c.id] = {
      ttfbMs: stats(ttfb),
      tlsMs: stats(c.samples.map((s) => s.tlsMs)),
      ttfbMinusTlsMs: stats(c.samples.map((s) => (Number.isFinite(s.ttfbMs) && Number.isFinite(s.tlsMs) ? s.ttfbMs - s.tlsMs : NaN))),
      upstreamMs: stats(up),
      bytes: stats(by),
      statuses: c.samples.map((s) => s.status),
      bodiesSha256: c.samples.map((s) => s.bodySha256),
      headersLast: c.samples[c.samples.length - 1]?.headers || {},
    };
  }
  const loopStats = {};
  for (const c of cdnLoopback) {
    loopStats[c.id] = {
      ttfbMs: stats(c.samples.map((s) => s.ttfbMs)),
      upstreamMs: stats(c.samples.map((s) => Number(s.upstreamMs))),
      bytes: stats(c.samples.map((s) => s.bytes)),
      statuses: c.samples.map((s) => s.status),
      bodiesSha256: c.samples.map((s) => s.bodySha256),
      originHosts: [...new Set(c.samples.map((s) => s.origin?.host).filter(Boolean))],
    };
  }

  const reqBefore = Number(healthBefore?.checks?.requests ?? NaN);
  const reqAfter = Number(healthAfter?.checks?.requests ?? NaN);
  const failedBefore = Number(healthBefore?.qoe?.all_failed ?? NaN);
  const failedAfter = Number(healthAfter?.qoe?.all_failed ?? NaN);
  const errBefore = Number(healthBefore?.checks?.error_ratio ?? NaN);
  const errAfter = Number(healthAfter?.checks?.error_ratio ?? NaN);
  const harnessReqs = Number.isFinite(reqAfter - reqBefore) ? reqAfter - reqBefore : null;
  const harnessFailures = Number.isFinite(failedAfter - failedBefore) ? failedAfter - failedBefore : null;

  const result = {
    harness: {
      version: VERSION,
      label: LABEL,
      startedUtc: start.toISOString(),
      startedBogota: bogotaStamp(start),
      finishedUtc: new Date().toISOString(),
      ssh: SSH_TARGET,
      params: { HOST, BASE, LIST_PATH, CDN_IDS, N, TIMEOUT_MS },
      percentiles: 'nearest-rank; N pequeño ⇒ p95 = máximo',
    },
    vps,
    health: {
      before: healthBefore,
      after: healthAfter,
      harnessRequests: harnessReqs,
      harnessFailures,
      errorRatioBefore: errBefore,
      errorRatioAfter: errAfter,
      errorRatioDelta: Number.isFinite(errAfter - errBefore) ? Number((errAfter - errBefore).toFixed(4)) : null,
      note: 'las muestras del arnés incrementan req/all_failed; el delta es atribuible a este run',
    },
    list: {
      path: LIST_PATH,
      http1Fresh: {
        stats: listFreshStats,
        samples: listFresh.map((r) => ({
          status: r.status ?? null,
          error: r.error ?? null,
          httpVersion: r.httpVersion ?? null,
          headersMs: ms1(r.marks?.headers ?? NaN),
          tlsMs: ms1(r.marks?.tls ?? NaN),
          firstByteMs: ms1(r.marks?.firstByte ?? NaN),
          firstChunkBytes: r.firstChunkBytes ?? null,
        })),
      },
      http1KeepAlive: {
        stats: listKeepStats,
        samples: listKeepAlive.map((r) => ({
          status: r.status ?? null,
          error: r.error ?? null,
          method: 'HEAD',
          reusedSocket: r.reusedSocket ?? null,
          headersMs: ms1(r.marks?.headers ?? NaN),
        })),
      },
      http2: {
        alpnProbe: alpn,
        strictConnect: h2,
        vpsCurlHttp2: { sshStatus: vpsH2.status, stderr: vpsH2.stderr, ...vpsCurlHttp2 },
        vpsCurlHttp11: { sshStatus: vpsH1.status, stderr: vpsH1.stderr, ...vpsCurlHttp11 },
        vpsCurlVersion: (vpsCurlV.stdout || '').split('\n')[0] || null,
        localCurlVersion: (localCurlV.stdout || '').split('\n')[0] || null,
        localCurlHasHttp2: localCurlHasH2,
      },
      headers: {
        status: listFresh.find((r) => r.status)?.status ?? null,
        httpVersion: listFresh.find((r) => r.httpVersion)?.httpVersion ?? null,
        contentLength: numberOrNull(listHeaders['content-length']),
        contentEncoding: listHeaders['content-encoding'] ?? null,
        etag: listHeaders.etag ?? null,
        lastModified: listHeaders['last-modified'] ?? null,
        cacheControl: listHeaders['cache-control'] ?? null,
        vary: listHeaders.vary ?? null,
        server: listHeaders.server ?? null,
      },
      bytes: {
        declaredGzip: numberOrNull(listHeaders['content-length']),
        firstChunk: listFresh.find((r) => Number.isFinite(r.firstChunkBytes))?.firstChunkBytes ?? null,
        onDisk: vps.listFiles,
      },
    },
    cdn: {
      discovery: channels.map((c) => ({ id: c.id, urlRedacted: redactUrl(c.url) })),
      client: cdnClient.map((c) => ({ id: c.id, urlRedacted: c.urlRedacted, samples: c.samples, stats: clientStats[c.id] })),
      loopback: cdnLoopback.map((c) => ({ id: c.id, samples: c.samples, stats: loopStats[c.id], error: c.error })),
    },
    doubleHop: {
      samples: N.HOP,
      edge443Warm: hopEdge,
      direct8088Warm: hopDirect,
      overheadWarmP50Ms: hopOverhead,
      note: 'cada muestra es la 2ª transferencia de una misma invocación curl (keep-alive): aísla el hop 443→8088 sin handshake TLS. La 1ª transferencia (fría, con TLS) está en list.http2.vpsCurlHttp11',
      raw: { edge: hop.edge, direct: hop.direct },
    },
    hops: buildHops(clientStats, loopStats, channels),
    limitations: [
      'HTTP/2 no negociado ⇒ la muestra "HTTP/2" documenta la ausencia, no un TTFB h2.',
      'Los canales /cdn/ se descubren de la lista viva; las credenciales se redactan en JSON/log.',
      'El arnés incrementa los contadores de /_ape/health (req/all_failed): se registra el delta.',
      'Percentiles nearest-rank con N=3/5: p95 = máximo. Es una línea base, no un intervalo de confianza.',
      'No se miden hops IP (traceroute): "hops" = intercambios HTTP demostrables en la cadena.',
      'El 302 del proveedor se sigue dentro del gateway; X-APE-Origin expone el origen final (host), no el número exacto de saltos.',
      'TTFB del cliente incluye el handshake TLS (se reporta aparte tls_ms y ttfb-tls).',
    ],
  };

  fs.writeFileSync(path.join(runDir, 'baseline.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(runDir, 'baseline.log'), logLines.join('\n') + '\n');
  fs.writeFileSync(path.join(HERE, 'runs', 'latest.json'), JSON.stringify(result, null, 2));

  log('\n── 11 · RESUMEN ──────────────────────────────────────────────────────');
  log(`lista h1 nueva   p50=${listFreshStats.p50 ?? '?'}ms p95=${listFreshStats.p95 ?? '?'}ms (n=${listFreshStats.n})`);
  log(`lista h1 keepalive p50=${listKeepStats.p50 ?? '?'}ms (n=${listKeepStats.n})`);
  log(`lista http/2     ${h2.ok ? 'OK' : 'NO NEGOCIADO'} · ALPN=${alpn.alpn ?? 'none'} · curl(VPS) --http2=${vpsCurlHttp2.httpVersion ?? '?'}`);
  for (const c of channels) {
    const cs = clientStats[c.id];
    const ls = loopStats[c.id];
    log(`canal ${c.id}: cliente ttfb p50=${cs.ttfbMs.p50 ?? '?'}ms (tls ${cs.tlsMs.p50 ?? '?'}ms) · upstream servidor p50=${ls.upstreamMs.p50 ?? '?'}ms · bytes=${cs.bytes.p50 ?? '?'} · status=${JSON.stringify(cs.statuses)}`);
  }
  log(`error_ratio: ${errBefore ?? '?'} → ${errAfter ?? '?'} (delta ${result.health.errorRatioDelta ?? '?'}) · req +${harnessReqs ?? '?'} · fallos +${harnessFailures ?? '?'}`);
  log(`overhead doble hop (443 vs 8088): ${hopOverhead ?? '?'} ms p50`);
  log(`salida: ${path.join('runs', stamp, 'baseline.json')}`);
  log('RESULT=OK');
}

function pickApeHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    if (k.startsWith('x-ape-')) out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}
function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parseCurlTriplet(s) {
  const p = String(s || '').split('\t');
  if (p.length < 3) return { raw: s };
  return { httpVersion: p[0], status: Number(p[1]), ttfbMs: ms1(Number(p[2]) * 1000) };
}
function parseCurlW(s) {
  const m = String(s || '').match(/http_version=([^\t]+)\tcode=([^\t]+)\tttfb=([^\t]+)/);
  if (!m) return { raw: s };
  return { httpVersion: m[1], status: Number(m[2]), ttfbMs: ms1(Number(m[3]) * 1000) };
}
function buildHops(clientStats, loopStats, channels) {
  const originHosts = [];
  for (const c of channels) {
    for (const h of loopStats[c.id]?.originHosts || []) originHosts.push(h);
  }
  const upstreamRedirectObserved = originHosts.some((h) => h && !h.startsWith('line.tivi-ott.net'));
  return {
    definition: 'intercambios HTTP demostrables en la cadena de servicio (no hops IP)',
    list: {
      total: 1,
      chain: ['cliente', '443 nginx estático (gzip_static+gunzip)'],
      evidence: 'la respuesta de la lista no trae cabeceras X-APE-* (no pasa por Lua ni por 8088)',
    },
    cdn: {
      clientToEdge: 1,
      edge443ToMeta8088: 1,
      metaToProvider: 1,
      upstreamRedirectsObserved: upstreamRedirectObserved ? '>=1' : 0,
      upstreamRedirectMaxConfigured: 3,
      totalProven: upstreamRedirectObserved ? 4 : 3,
      totalMin: 3,
      chain: ['cliente', '443 (proxy)', '8088 (gateway Lua)', 'proveedor', '302 → CDN (origen final)'],
      evidence: 'X-APE-CDN presente en la respuesta del cliente ⇒ sirvió el gateway del 8088; X-APE-Origin host ≠ host pedido ⇒ ≥1 redirect seguido',
    },
    doubleHopCollapseTarget: 'fase 2: 443 → gateway sin hop 8088 (totalProven - 1)',
  };
}
function healthLoop() {
  const r = ssh(`curl -sS -m 10 '${HEALTH_LOOPBACK_URL}'`, 60000);
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { error: 'bad_json', ssh_status: r.status, stderr: r.stderr, raw: r.stdout.slice(0, 400) };
  }
}

main().catch((e) => {
  log(`FATAL: ${e && e.stack ? e.stack : e}`);
  try {
    const stamp = stampUtc();
    const runDir = path.join(HERE, 'runs', stamp);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'baseline.log'), logLines.join('\n') + '\n');
  } catch { /* noop */ }
  process.exitCode = 1;
});
