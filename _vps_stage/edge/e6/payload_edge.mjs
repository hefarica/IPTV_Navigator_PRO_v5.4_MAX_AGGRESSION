#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * E6 · payload_edge.mjs — ARNÉS READ-ONLY DEL PESO Y LA ENTREGA DE LA LISTA
 * ═══════════════════════════════════════════════════════════════════════════
 * Mide, siempre igual, cómo se entrega `/lists/APE_LISTA_4K.m3u8`:
 *
 *   1. SONDA SERVIDOR (probe_vps.sh por ssh stdin, cero escrituras en el VPS)
 *      A · negociación gzip (gzip / identity / br / gzip;q=0 / sin cabecera)
 *      B · peso y digest REALES de cada representación + CPU de nginx
 *      C · Range sobre el .gz (206/200, Content-Range, validez del trozo)
 *      D · ETag / If-None-Match / If-Modified-Since → 304 (ambas formas)
 *      E · ALPN y tamaño de la petición h1
 *   2. CLIENTE (desde esta máquina, Bogotá ↔ Ashburn)
 *      · TTFB y primer chunk de cada representación (conexión nueva)
 *      · suelo de RTT con keep-alive
 *      · 304 condicional real (coste en bytes y en tiempo)
 *      · Range real (qué recibe un cliente que pide un trozo)
 *      · caudal acotado (32 MB / 10 s) → tiempo de descarga extrapolado
 *      · coste de k conexiones nuevas (palanca que HTTP/2 colapsaría)
 *      · HTTP/2 si el borde lo negocia (si no, se documenta la ausencia)
 *
 * GARANTÍAS
 *   · CERO escrituras en el VPS y CERO cambios de configuración.
 *   · CERO dependencias npm (Node >= 18; probado en v24).
 *   · Ninguna descarga completa de 140 MB/564 MB desde el cliente: el cuerpo
 *     se aborta (primer chunk o tope de bytes/tiempo). Las descargas completas
 *     y su digest se verifican en el LOOPBACK del VPS (probe_vps.sh B1–B4).
 *   · Las credenciales de canal no se tocan aquí (esta ruta no las lleva).
 *
 * USO
 *   node _vps_stage/edge/e6/payload_edge.mjs [--label <texto>] [--skip-probe]
 *
 * SALIDA
 *   _vps_stage/edge/e6/runs/<STAMP_UTC>/payload.json
 *   _vps_stage/edge/e6/runs/<STAMP_UTC>/payload.log
 *   _vps_stage/edge/e6/runs/<STAMP_UTC>/probe.raw.txt   (si no --skip-probe)
 *   _vps_stage/edge/e6/runs/latest.json
 * ═══════════════════════════════════════════════════════════════════════════ */

import https from 'node:https';
import http2 from 'node:http2';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '1.1.0';

const SSH_TARGET = process.env.EDGE_SSH || 'root@178.156.147.234';
const HOST = 'iptv-ape.duckdns.org';
const BASE = `https://${HOST}`;
const LIST_PATH = '/lists/APE_LISTA_4K.m3u8';
const GZ_BYTES_EXPECTED = 140555650; // medido y fijado en el baseline E1
const TIMEOUT_MS = 30000;
const UA = `edge-fluidez-e6-payload/${VERSION} (read-only; SRE)`;
const LABEL = argValue('--label') || 'E6-payload';
const SKIP_PROBE = process.argv.includes('--skip-probe');

/* topes de la muestra de caudal del cliente (no se bajan 140/564 MB) */
const CAP = Object.freeze({
  BYTES: 32 * 1024 * 1024,
  MS: 10000,
});
const N = Object.freeze({
  FRESH: 3,          // conexiones nuevas por representación (cliente)
  KEEPALIVE: 3,      // HEAD keep-alive (suelo de RTT)
  PARALLEL_K: 4,     // conexiones simultáneas para medir la palanca de h2
  RANGE: 2,          // repeticiones de los casos de Range
});

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
  return {
    n: v.length,
    min: ms1(v[0]),
    p50: ms1(nearest(0.5)),
    p95: ms1(nearest(0.95)),
    max: ms1(v[v.length - 1]),
    mean: ms1(mean),
  };
}
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ── SSH (OpenSSH del sistema; sin dependencias) ────────────────────────── */
function ssh(script, timeoutMs = 240000) {
  const r = spawnSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SSH_TARGET, 'bash -s'],
    { input: script, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
  );
  return { status: r.status, signal: r.signal, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error ? String(r.error) : null };
}

/* ── HTTP/1.1 ───────────────────────────────────────────────────────────── */
/**
 * Petición h1. Por defecto aborta tras el primer chunk (no baja 140 MB).
 * Con `capBytes`/`capMs` hace una muestra acotada de caudal.
 */
function requestH1(opts = {}) {
  const {
    pathName = LIST_PATH, method = 'GET', headers = {}, agent = false,
    mode = 'firstChunk', capBytes = CAP.BYTES, capMs = CAP.MS, timeoutMs = TIMEOUT_MS,
  } = opts;

  return new Promise((resolve) => {
    const t0 = performance.now();
    const marks = {};
    let settled = false;
    const out = { pathName, method, mode, headersSent: {}, marks };
    const settle = (extra = {}) => {
      if (settled) return;
      settled = true;
      Object.assign(out, extra);
      resolve(out);
    };
    const req = https.request(
      {
        hostname: HOST, port: 443, path: pathName, method, agent,
        headers: { 'User-Agent': UA, ...headers },
      },
      (res) => {
        marks.headers = performance.now() - t0;
        out.status = res.statusCode;
        out.httpVersion = res.httpVersion;
        out.headers = res.headers;
        out.reusedSocket = !!req.reusedSocket;
        let bytes = 0;
        let first = true;
        const chunks = [];
        res.on('data', (c) => {
          bytes += c.length;
          if (first) {
            first = false;
            marks.firstByte = performance.now() - t0;
            out.firstChunkBytes = c.length;
            if (mode === 'firstChunk') {
              out.bytes = bytes;
              out.total = performance.now() - t0;
              res.destroy(); req.destroy();
              settle({ aborted: true });
              return;
            }
          }
          if (mode === 'digest' && bytes <= 8 * 1024 * 1024) chunks.push(c);
          if (mode === 'cap') {
            const elapsed = performance.now() - t0;
            if (bytes >= capBytes || elapsed >= capMs) {
              out.bytes = bytes;
              out.total = elapsed;
              out.cap = { capBytes, capMs, reason: bytes >= capBytes ? 'bytes' : 'time' };
              res.destroy(); req.destroy();
              settle({ aborted: true });
              return;
            }
          }
        });
        res.on('aborted', () => settle({ aborted: true, bytes }));
        res.on('end', () => {
          if (settled) return;
          out.bytes = bytes;
          out.total = performance.now() - t0;
          if (chunks.length) out.bodySha256 = sha256(Buffer.concat(chunks));
          settle({ complete: true });
        });
        res.on('error', (e) => settle({ error: e.code || e.message, bytes }));
      },
    );
    req.on('socket', (s) => {
      if (s.connecting) s.once('secureConnect', () => { marks.tls = performance.now() - t0; });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => settle({ error: e.code || e.message }));
    req.end();
  });
}

/* ── HTTP/2 (ALPN real + intento estricto) ──────────────────────────────── */
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

function http2Probe({ pathName = LIST_PATH, headers = { 'accept-encoding': 'gzip' }, mode = 'firstChunk', capBytes = CAP.BYTES, capMs = CAP.MS, windowBytes = null } = {}) {
  return new Promise((resolve) => {
    const out = { attempted: true, requestedAlpn: 'h2', mode };
    if (windowBytes) out.localWindowBytes = windowBytes;
    let done = false;
    let session;
    const dialT0 = performance.now();
    const timer = setTimeout(() => finish({ error: 'timeout' }), 20000);
    function finish(extra) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      Object.assign(out, extra);
      out.dialMs = ms1(performance.now() - dialT0);
      try { session?.close(); } catch { /* noop */ }
      resolve(out);
    }
    try {
      session = http2.connect(BASE, {
        ALPNProtocols: ['h2'],
        settings: windowBytes ? { initialWindowSize: windowBytes } : undefined,
      });
    } catch (e) {
      finish({ error: e.code || e.message });
      return;
    }
    session.on('connect', () => {
      out.alpn = session.socket?.alpnProtocol ?? null;
      out.connectMs = ms1(performance.now() - dialT0);
      if (windowBytes) {
        try { session.setLocalWindowSize(windowBytes); } catch { /* noop */ }
      }
      const t0 = performance.now();
      const r = session.request({ ':path': pathName, ':method': 'GET', 'user-agent': UA, ...headers });
      let first = true;
      let bytes = 0;
      r.on('response', (h) => {
        out.status = h[':status'];
        out.responseHeaders = h;
        out.ttfbMs = ms1(performance.now() - t0);
        out.ttfbFromDialMs = ms1(performance.now() - dialT0);
      });
      r.on('data', (c) => {
        bytes += c.length;
        if (first) {
          first = false;
          out.firstByteMs = ms1(performance.now() - t0);
          out.firstByteFromDialMs = ms1(performance.now() - dialT0);
          out.firstChunkBytes = c.length;
          if (mode === 'firstChunk') {
            out.bytes = bytes;
            r.close(); session.close();
            finish({ ok: true });
            return;
          }
        }
        const elapsed = performance.now() - t0;
        if (mode === 'cap' && (bytes >= capBytes || elapsed >= capMs)) {
          out.bytes = bytes;
          out.elapsedMs = ms1(elapsed);
          r.close(); session.close();
          finish({ ok: true, aborted: true });
        }
      });
      r.on('end', () => { out.bytes = bytes; finish({ ok: true, complete: true }); });
      r.on('error', (e) => finish({ error: e.code || e.message }));
      r.end();
    });
    session.on('error', (e) => finish({ error: e.code || e.message, alpn: session?.socket?.alpnProtocol ?? null }));
    session.on('close', () => finish({ error: out.error || 'session_closed_without_stream' }));
  });
}

/* k HEAD concurrentes sobre UNA sesión h2 — comparable con §10 (k conexiones h1) */
function h2ParallelHeads(k, pathName = LIST_PATH) {
  return new Promise((resolve) => {
    const out = { k, attempted: true };
    let done = false;
    let session;
    const dialT0 = performance.now();
    const timer = setTimeout(() => finish({ error: 'timeout' }), 15000);
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
    } catch (e) { finish({ error: e.code || e.message }); return; }
    const ttfb = [];
    let pending = k;
    session.on('connect', () => {
      out.connectMs = ms1(performance.now() - dialT0);
      out.alpn = session.socket?.alpnProtocol ?? null;
      for (let i = 0; i < k; i++) {
        const t0 = performance.now();
        const r = session.request({ ':path': pathName, ':method': 'HEAD', 'user-agent': UA, 'accept-encoding': 'gzip' });
        r.on('response', (h) => {
          ttfb.push(ms1(performance.now() - t0));
          out.statuses = [...(out.statuses || []), h[':status']];
          r.close();
          if (--pending === 0) {
            out.streamTtfbMs = ttfb;
            out.wallMs = ms1(performance.now() - dialT0);
            try { session.close(); } catch { /* noop */ }
            finish({ ok: true });
          }
        });
        r.on('error', (e) => finish({ error: e.code || e.message }));
        r.end();
      }
    });
    session.on('error', (e) => finish({ error: e.code || e.message }));
    session.on('close', () => finish({ error: out.error || 'session_closed_without_stream' }));
  });
}

/* ── sonda del servidor (probe_vps.sh) ──────────────────────────────────── */
function runProbe() {
  const scriptPath = path.join(HERE, 'probe_vps.sh');
  const script = fs.readFileSync(scriptPath, 'utf8');
  const t0 = Date.now();
  const r = ssh(script, 300000);
  return { ...r, elapsedMs: Date.now() - t0, scriptSha256: sha256(script) };
}

function parseProbe(raw) {
  const facts = {};
  const cases = [];
  let cur = null;
  for (const line of String(raw).split(/\r?\n/)) {
    if (line.startsWith('### end')) { cur = null; continue; }
    if (line.startsWith('### ')) {
      cur = { label: line.slice(4).trim(), lines: [] };
      cases.push(cur);
      continue;
    }
    if (cur) { cur.lines.push(line); continue; }
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) facts[m[1]] = m[2];
    else if (line.trim() && !line.startsWith('═')) {
      if (!facts._misc) facts._misc = [];
      facts._misc.push(line);
    }
  }
  const parsed = cases.map((c) => {
    const text = c.lines.join('\n');
    // tristemente el borde puede negociar h1 o h2 según el worker que acepte:
    // se registra el protocolo REAL de cada caso, no se asume.
    const statusMatch = text.match(/^HTTP\/(1\.[01]|2)\s+(\d{3})/m);
    const status = statusMatch ? Number(statusMatch[2]) : null;
    const protocol = statusMatch ? (statusMatch[1] === '2' ? 'h2' : `h${statusMatch[1]}`) : null;
    const headers = {};
    for (const l of c.lines) {
      const m = l.match(/^([A-Za-z0-9-]+):\s?(.*)$/);
      if (m && !/^HTTP\//.test(l)) {
        const k = m[1].toLowerCase();
        headers[k] = headers[k] ? `${headers[k]}, ${m[2]}` : m[2];
      }
    }
    const w = (text.match(/^W status=(\S+) http=(\S+) size=(\S+) ttfb=(\S+) total=(\S+) speed=(\S+)/m) || []).slice(1);
    const kv = {};
    for (const l of c.lines) {
      if (l.startsWith('REQ_ARGS=')) { kv.REQ_ARGS = l.slice('REQ_ARGS='.length); continue; }
      // admite varios KEY=VALUE en la misma línea (p. ej. B1: TICKS=… HZ=… CPU_MS=…)
      // y tolera el espacio tras '=' que deja `xargs echo`
      for (const m of l.matchAll(/([A-Z0-9_]+)=\s*([^\s]+)/g)) kv[m[1]] = m[2];
    }
    return {
      label: c.label,
      requestArgs: kv.REQ_ARGS ?? null,
      status,
      protocol,
      httpVersion: w[1] ?? null,
      headers,
      curl: w.length ? {
        status: num(w[0]), httpVersion: w[1], sizeDownload: num(w[2]),
        ttfbSec: num(w[3]), totalSec: num(w[4]), speedBps: num(w[5]),
      } : null,
      kv, // BODY_SHA256, BODY_BYTES, NGINX_CPU_MS, …
      raw: text,
    };
  });
  return { facts, cases: parsed };
}

/* ── derivación ÚNICA de los hechos del servidor desde la sonda ─────────── */
function deriveServer(probe) {
  const f = probe.facts || {};
  const gzSize = Number(String(f.GZ || '').match(/size=(\d+)/)?.[1] ?? NaN) || null;
  const decBytes = num(f.DECOMPRESSED_BYTES);
  const cpu = {};
  for (const c of probe.cases) {
    if (/^B[12] /.test(c.label)) {
      cpu[c.label] = {
        nginxCpuMs: num(c.kv.NGINX_CPU_MS), wallMs: num(c.kv.WALL_MS),
        bytes: c.curl?.sizeDownload ?? null,
        cpuMsPer100Mb: c.curl?.sizeDownload
          ? Math.round((num(c.kv.NGINX_CPU_MS) / (c.curl.sizeDownload / 1e8)) * 10) / 10 : null,
      };
    }
  }
  const negotiation = probe.cases
    .filter((c) => /^A\d+ /.test(c.label))
    .map((c) => {
      const args = c.requestArgs || '';
      let ae = args.replace(/^-I\s*/, '').replace(/-H\s+Accept-Encoding:\s*/i, '').trim();
      if (!ae) ae = '(ninguna)';
      if (/^--http1\.0/.test(ae)) ae = '(ninguna, HTTP/1.0)';
      return {
        case: c.label,
        acceptEncoding: ae,
        status: c.status,
        protocol: c.protocol ?? null,
        contentEncoding: c.headers['content-encoding'] ?? null,
        contentLength: num(c.headers['content-length']),
        transferEncoding: c.headers['transfer-encoding'] ?? null,
        etag: c.headers.etag ?? null,
        vary: c.headers.vary ?? null,
        acceptRanges: c.headers['accept-ranges'] ?? null,
        acceptRangesCount: (c.lines || []).filter((l) => /^accept-ranges:/i.test(l)).length || null,
        ttlMs: c.curl ? ms1(c.curl.ttfbSec * 1000) : null,
      };
    });
  const ranges = probe.cases
    .filter((c) => /^C\d+ /.test(c.label) && c.status)
    .map((c) => ({
      case: c.label,
      args: c.requestArgs,
      status: c.status,
      protocol: c.protocol ?? null,
      contentRange: c.headers['content-range'] ?? null,
      contentEncoding: c.headers['content-encoding'] ?? null,
      contentType: c.headers['content-type'] ?? null,
      contentLength: num(c.headers['content-length']),
      bytes: c.curl?.sizeDownload ?? null,
      bodySha256: c.kv.BODY_SHA256 ?? null,
      bodyBytes: num(c.kv.BODY_BYTES),
    }));
  const conditional = probe.cases
    .filter((c) => /^D\d+ /.test(c.label))
    .map((c) => ({
      case: c.label,
      args: c.requestArgs,
      status: c.status,
      protocol: c.protocol ?? null,
      etag: c.headers.etag ?? null,
      contentLength: num(c.headers['content-length']),
      contentEncoding: c.headers['content-encoding'] ?? null,
      vary: c.headers.vary ?? null,
      ttlMs: c.curl ? ms1(c.curl.ttfbSec * 1000) : null,
      bytes: c.curl?.sizeDownload ?? null,
    }));
  const c10 = probe.cases.find((c) => /^C10 /.test(c.label))?.kv?.BODY_SHA256 ?? null;
  const c11 = probe.cases.find((c) => /^C11 /.test(c.label))?.kv?.BODY_SHA256 ?? null;

  const vps = {
    dateUtc: f.DATE_UTC ?? null,
    masterPid: f.MASTER_PID ?? null,
    nginxT: f.NGINX_T_SHA ?? null,
    h2ListenCount: num(f.H2_LISTEN_COUNT),
    config: {
      sitesEnabledDefault: f.CONF_DEFAULT_SHA ?? null,
      metaPlane: f.CONF_META_PLANE_SHA ?? null,
      metaPublic: f.CONF_META_PUBLIC_SHA ?? null,
    },
    stub: f.STUB ?? null,
    gz: f.GZ ?? null,
    gzBytes: gzSize,
    gzSha256: f.GZ_SHA256 ?? null,
    decompressed: {
      sha256: f.DECOMPRESSED_SHA256 ?? null,
      bytes: decBytes,
      lines: num(f.DECOMPRESSED_LINES),
      mb: decBytes ? Math.round((decBytes / 1048576) * 10) / 10 : null,
    },
    ratio: decBytes && gzSize ? Math.round((decBytes / gzSize) * 100) / 100 : null,
  };
  const server = {
    negotiation,
    cpu,
    ranges,
    conditional,
    alpn: probe.cases.find((c) => /^E1 /.test(c.label))?.raw?.trim() ?? null,
    h2StrictAlpn: probe.cases.find((c) => /^E2 /.test(c.label))?.raw?.trim() ?? null,
    h2Curl: probe.cases.find((c) => /^E3 /.test(c.label))?.httpVersion ?? null,
    h1RequestBytesPlayerUa: num(probe.cases.find((c) => /^E5 /.test(c.label))?.kv?.H1_REQUEST_BYTES_UA_PLAYER),
    sliceChecks: {
      gzSlice0_1024: f.GZ_SLICE_0_1024_SHA256 ?? null,
      gzSlice100000000_1000: f.GZ_SLICE_100000000_1000_SHA256 ?? null,
      stub: f.STUB_SHA256 ?? null,
      // el cuerpo REAL servido en un Range debe ser el trozo exacto del .gz
      rangeBodyMatchesFile: {
        c10: c10 ? c10 === f.GZ_SLICE_0_1024_SHA256 : null,
        c11: c11 ? c11 === f.GZ_SLICE_100000000_1000_SHA256 : null,
        c10Sha: c10, c11Sha: c11,
      },
    },
  };
  return { vps, server };
}

/* ── main ───────────────────────────────────────────────────────────────── */
async function main() {
  /* modo utilidad: re-derivar el JSON de la sonda desde un raw ya capturado */
  const parseOnly = argValue('--parse-only');
  if (parseOnly) {
    const raw = fs.readFileSync(parseOnly, 'utf8');
    const p = parseProbe(raw);
    fs.writeFileSync(path.join(HERE, 'runs', 'latest_probe.json'), JSON.stringify(p, null, 2));
    console.log(`parse-only: ${p.cases.length} casos · ${Object.keys(p.facts).length} hechos`);
    for (const c of p.cases) {
      if (/^B[12] /.test(c.label)) console.log(`${c.label}: cpu_ms=${c.kv.NGINX_CPU_MS} wall_ms=${c.kv.WALL_MS} bytes=${c.curl?.sizeDownload}`);
      if (/^C1[01] /.test(c.label)) console.log(`${c.label}: body_sha=${c.kv.BODY_SHA256} bytes=${c.kv.BODY_BYTES}`);
    }
    return;
  }

  /* modo utilidad: re-derivar los hechos del servidor de un run ya medido,
     sin repetir tráfico (re-parsea su probe.raw.txt y reescribe payload.json) */
  const rebuildDir = argValue('--rebuild');
  if (rebuildDir) {
    const payloadPath = path.join(rebuildDir, 'payload.json');
    const rawPath = path.join(rebuildDir, 'probe.raw.txt');
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    const p = parseProbe(fs.readFileSync(rawPath, 'utf8'));
    const { vps, server } = deriveServer(p);
    payload.vps = vps;
    payload.server = server;
    payload.findings = buildFindings({
      f: p.facts, nego: server.negotiation, ranges: server.ranges, cond: server.conditional,
      clientFresh: payload.client?.fresh, throughput: payload.client?.throughput,
      parallel: payload.client?.parallel, h2: payload.client?.http2?.strict,
      h2cap: payload.client?.http2?.cap, h2capTuned: payload.client?.http2?.capTuned,
      h2k4: payload.client?.http2?.parallelHeads, alpn: payload.client?.http2?.alpn,
      cpu: server.cpu,
    });
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    const cpuVals = Object.values(server.cpu);
    console.log(`rebuild: ${rebuildDir} · casos=${p.cases.length} · cpu_gzip=${cpuVals[0]?.nginxCpuMs}ms cpu_identity=${cpuVals[1]?.nginxCpuMs}ms · AE=${server.negotiation.map((n) => n.acceptEncoding).join(' | ')}`);
    return;
  }

  const start = new Date();
  const stamp = stampUtc(start);
  const runDir = path.join(HERE, 'runs', stamp);
  fs.mkdirSync(runDir, { recursive: true });

  log('═══════════════════════════════════════════════════════════════════════');
  log(`E6 · PESO Y ENTREGA DE LA LISTA · ${stamp} · ${bogotaStamp(start)}`);
  log(`arnés=v${VERSION} label=${LABEL} host=${HOST} ssh=${SSH_TARGET}`);
  log('═══════════════════════════════════════════════════════════════════════');

  /* 0 · DNS del borde (¿hay CDN delante?) */
  let dnsInfo = null;
  try {
    const a = await dns.resolve4(HOST);
    dnsInfo = { a };
    log(`\n── 0 · DNS ${HOST} → ${a.join(', ')}`);
  } catch (e) {
    dnsInfo = { error: e.code || e.message };
    log(`\n── 0 · DNS ${HOST} → ERROR ${dnsInfo.error}`);
  }

  /* 1 · sonda servidor (o reutilizar la última) */
  let probe;
  if (SKIP_PROBE) {
    const latest = path.join(HERE, 'runs', 'latest_probe.json');
    if (!fs.existsSync(latest)) throw new Error('--skip-probe sin runs/latest_probe.json');
    probe = JSON.parse(fs.readFileSync(latest, 'utf8'));
    log('\n── 1 · SONDA SERVIDOR: reutilizada de runs/latest_probe.json');
  } else {
    log('\n── 1 · SONDA SERVIDOR (probe_vps.sh, read-only, por ssh) ─────────────');
    const r = runProbe();
    if (r.status !== 0) {
      log(`FALLO ssh exit=${r.status} stderr=${r.stderr.slice(0, 400)}`);
      throw new Error(`probe_vps.sh falló (ssh exit ${r.status})`);
    }
    fs.writeFileSync(path.join(runDir, 'probe.raw.txt'), r.stdout);
    probe = parseProbe(r.stdout);
    probe.meta = { elapsedMs: r.elapsedMs, scriptSha256: r.scriptSha256, rawBytes: r.stdout.length };
    fs.writeFileSync(path.join(HERE, 'runs', 'latest_probe.json'), JSON.stringify(probe, null, 2));
    log(`sonda: ${probe.cases.length} casos · ${(r.stdout.length / 1024).toFixed(1)} KB crudos · ${(r.elapsedMs / 1000).toFixed(1)} s · script sha256=${r.scriptSha256.slice(0, 16)}…`);
  }
  const f = probe.facts || {};
  log(`config: default=${String(f.CONF_DEFAULT_SHA).slice(0, 12)}… meta-plane=${String(f.CONF_META_PLANE_SHA).slice(0, 12)}… h2_listen=${f.H2_LISTEN_COUNT} nginx -T=${String(f.NGINX_T_SHA).slice(0, 12)}…`);
  const gzFileBytes = Number(String(f.GZ || '').match(/size=(\d+)/)?.[1] ?? NaN);
  log(`peso: gz=${gzFileBytes} B → descomprimido=${f.DECOMPRESSED_BYTES} B (${(Number(f.DECOMPRESSED_BYTES) / 1048576).toFixed(1)} MB) · líneas=${f.DECOMPRESSED_LINES} · ratio ×${Number.isFinite(gzFileBytes) ? (Number(f.DECOMPRESSED_BYTES) / gzFileBytes).toFixed(2) : '?'}`);
  log(`digests: gz=${String(f.GZ_SHA256).slice(0, 16)}… descomprimido=${String(f.DECOMPRESSED_SHA256).slice(0, 16)}…`);
  for (const c of probe.cases) {
    if (/^B[12] /.test(c.label)) {
      log(`CPU ${c.label}: nginx_cpu_ms=${c.kv.NGINX_CPU_MS} wall_ms=${c.kv.WALL_MS} bytes=${c.curl?.sizeDownload}`);
    }
  }

  /* 2 · hechos del servidor (una sola derivación, reutilizable por --rebuild) */
  const { vps: vpsDerived, server: serverDerived } = deriveServer(probe);
  const nego = serverDerived.negotiation;
  const ranges = serverDerived.ranges;
  const cond = serverDerived.conditional;
  const cpu = serverDerived.cpu;

  log('\n── 2 · NEGOCIACIÓN gzip (HEAD, loopback del VPS) ─────────────────────');
  for (const n of nego) {
    log(`AE=${String(n.acceptEncoding).padEnd(34)} → ${n.status} CE=${String(n.contentEncoding || '—').padEnd(5)} CL=${String(n.contentLength ?? '—').padEnd(9)} TE=${String(n.transferEncoding || '—').padEnd(8)} ETag=${n.etag ?? '—'} ttfb=${n.ttlMs}ms`);
  }

  log('\n── 3 · RANGE sobre el .gz (loopback del VPS) ─────────────────────────');
  for (const r of ranges) {
    log(`${r.case.padEnd(46)} → ${r.status} CL=${String(r.contentLength ?? '—').padEnd(9)} CR=${String(r.contentRange ?? '—').padEnd(34)} CE=${r.contentEncoding ?? '—'} bytes=${r.bytes}`);
  }

  log('\n── 4 · ETag / 304 (loopback del VPS) ─────────────────────────────────');
  for (const c of cond) log(`${c.case.padEnd(46)} → ${c.status} etag=${String(c.etag).padEnd(20)} CL=${String(c.contentLength ?? '—').padEnd(9)} CE=${c.contentEncoding ?? '—'} ttfb=${c.ttlMs}ms bytes=${c.bytes}`);
  log(`cuerpo de Range == trozo del .gz: C10=${serverDerived.sliceChecks.rangeBodyMatchesFile.c10} · C11=${serverDerived.sliceChecks.rangeBodyMatchesFile.c11}`);
  const protoCount = probe.cases.reduce((a, c) => { if (c.protocol) a[c.protocol] = (a[c.protocol] || 0) + 1; return a; }, {});
  const h1Cases = probe.cases.filter((c) => c.protocol && c.protocol !== 'h2').map((c) => c.label.split(' ')[0]);
  log(`protocolo usado por la sonda: ${JSON.stringify(protoCount)} · casos h1: ${h1Cases.length ? h1Cases.join(', ') : 'ninguno'} (A8/E4 fuerzan h1 a propósito)`);

  /* 5 · CLIENTE: TTFB de cada representación */
  log('\n── 5 · CLIENTE · TTFB/first-chunk (conexión nueva por muestra) ───────');
  const clientFresh = { gzip: [], identity: [] };
  for (const [rep, maxAccept] of [['gzip', 'gzip'], ['identity', 'identity']]) {
    for (let i = 0; i < N.FRESH; i++) {
      const r = await requestH1({ headers: { 'Accept-Encoding': maxAccept }, mode: 'firstChunk' });
      const s = {
        i: i + 1, status: r.status ?? null, error: r.error ?? null,
        httpVersion: r.httpVersion ?? null,
        ttfbMs: ms1(r.marks.headers), tlsMs: ms1(r.marks.tls),
        firstByteMs: ms1(r.marks.firstByte), firstChunkBytes: r.firstChunkBytes ?? null,
        contentEncoding: r.headers?.['content-encoding'] ?? null,
        contentLength: num(r.headers?.['content-length']),
        transferEncoding: r.headers?.['transfer-encoding'] ?? null,
        etag: r.headers?.etag ?? null,
      };
      clientFresh[rep].push(s);
      log(`${rep.padEnd(8)} #${i + 1}: ${s.status} http=${s.httpVersion} tls=${s.tlsMs}ms ttfb=${s.ttfbMs}ms 1er_chunk=${s.firstChunkBytes}B CE=${s.contentEncoding ?? '—'} CL=${s.contentLength ?? '—'}`);
      await sleep(200);
    }
  }

  /* 6 · CLIENTE: suelo de RTT (keep-alive) */
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 });
  const keepAlive = [];
  log('\n── 6 · CLIENTE · suelo de RTT (HEAD keep-alive) ──────────────────────');
  for (let i = 0; i < N.KEEPALIVE; i++) {
    const r = await requestH1({ method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' }, agent, mode: 'firstChunk' });
    keepAlive.push({ i: i + 1, status: r.status ?? null, reused: r.reusedSocket ?? null, headersMs: ms1(r.marks.headers) });
    log(`HEAD #${i + 1}: ${r.status} reused=${r.reusedSocket ? 'yes' : 'no'} headers=${ms1(r.marks.headers)}ms`);
    await sleep(120);
  }
  agent.destroy();

  /* 7 · CLIENTE: 304 condicional (gzip y identity) */
  log('\n── 7 · CLIENTE · 304 condicional (bytes y tiempo reales) ──────────────');
  const etags = {};
  for (const rep of ['gzip', 'identity']) {
    const h = await requestH1({ method: 'HEAD', headers: { 'Accept-Encoding': rep } });
    etags[rep] = h.headers?.etag ?? null;
  }
  log(`ETag gzip=${etags.gzip} · identity=${etags.identity}`);
  const cond304 = [];
  for (const [rep, validator, label] of [
    ['gzip', etags.gzip, 'gzip + INM propio (fuerte)'],
    ['identity', etags.identity, 'identity + INM propio (débil)'],
    ['identity', etags.gzip, 'identity + INM fuerte cruzado'],
    ['gzip', etags.identity, 'gzip + INM débil cruzado'],
  ]) {
    const r = await requestH1({ headers: { 'Accept-Encoding': rep, 'If-None-Match': validator }, mode: 'firstChunk' });
    cond304.push({
      label, representation: rep, validator,
      status: r.status ?? null, bytes: r.bytes ?? null,
      ttfbMs: ms1(r.marks.headers), totalMs: ms1(r.total ?? NaN),
      etag: r.headers?.etag ?? null, contentLength: num(r.headers?.['content-length']),
      contentEncoding: r.headers?.['content-encoding'] ?? null,
      vary: r.headers?.vary ?? null,
    });
    log(`${label.padEnd(36)} → ${r.status} bytes=${r.bytes ?? '?'} ttfb=${ms1(r.marks.headers)}ms etag=${r.headers?.etag ?? '—'} CE=${r.headers?.['content-encoding'] ?? '—'} Vary=${r.headers?.vary ?? '—'}`);
    await sleep(200);
  }

  /* 8 · CLIENTE: Range */
  log('\n── 8 · CLIENTE · Range (qué recibe un cliente real) ──────────────────');
  const clientRange = [];
  for (const [rep, range, label] of [
    ['gzip', 'bytes=0-1023', 'Range 0-1023 + gzip'],
    ['identity', 'bytes=0-1023', 'Range 0-1023 + identity'],
    ['gzip', 'bytes=100000000-100000999', 'Range 100000000-100000999 + gzip'],
    ['gzip', 'bytes=-1024', 'Range -1024 (sufijo) + gzip'],
  ]) {
    const r = await requestH1({ headers: { 'Accept-Encoding': rep, Range: range }, mode: 'firstChunk' });
    clientRange.push({
      label, representation: rep, range,
      status: r.status ?? null, bytes: r.bytes ?? null,
      contentRange: r.headers?.['content-range'] ?? null,
      contentEncoding: r.headers?.['content-encoding'] ?? null,
      contentType: r.headers?.['content-type'] ?? null,
      contentLength: num(r.headers?.['content-length']),
      ttfbMs: ms1(r.marks.headers), firstChunkBytes: r.firstChunkBytes ?? null,
    });
    log(`${label.padEnd(40)} → ${r.status} CR=${r.headers?.['content-range'] ?? '—'} CE=${r.headers?.['content-encoding'] ?? '—'} 1er_chunk=${r.firstChunkBytes ?? '?'}B ttfb=${ms1(r.marks.headers)}ms`);
    await sleep(200);
  }

  /* 9 · CLIENTE: caudal acotado por representación */
  log('\n── 9 · CLIENTE · caudal acotado (32 MB / 10 s) → descarga extrapolada ─');
  const throughput = {};
  for (const rep of ['gzip', 'identity']) {
    const r = await requestH1({ headers: { 'Accept-Encoding': rep }, mode: 'cap' });
    const s = (r.total ?? 0) / 1000;
    const steady = (r.bytes - (r.firstChunkBytes ?? 0)) / Math.max(0.001, s - (r.marks.firstByte ?? 0) / 1000);
    const declared = rep === 'gzip' ? GZ_BYTES_EXPECTED : Number(f.DECOMPRESSED_BYTES ?? 0);
    throughput[rep] = {
      cap: r.cap, bytesRead: r.bytes ?? null, elapsedMs: ms1(r.total ?? NaN),
      ttfbMs: ms1(r.marks.headers), firstByteMs: ms1(r.marks.firstByte),
      avgBps: r.total ? Math.round((r.bytes / (r.total / 1000))) : null,
      steadyBps: Number.isFinite(steady) ? Math.round(steady) : null,
      declaredBytes: declared,
      extrapolatedDownloadSec: declared && Number.isFinite(steady) && steady > 0 ? ms1(declared / steady) : null,
      extrapolatedNote: 'extrapolación lineal desde la muestra acotada; NO es una descarga completa',
    };
    log(`${rep.padEnd(8)}: leídos=${(r.bytes / 1048576).toFixed(1)} MB en ${ms1(r.total)}ms · avg=${(throughput[rep].avgBps / 1048576).toFixed(2)} MB/s · steady=${(throughput[rep].steadyBps / 1048576).toFixed(2)} MB/s · descarga_de_${(declared / 1048576).toFixed(1)}MB ≈ ${throughput[rep].extrapolatedDownloadSec}s`);
    await sleep(300);
  }

  /* 10 · CLIENTE: coste de k conexiones nuevas (palanca que h2 colapsaría) */
  log('\n── 10 · CLIENTE · 1 vs 4 conexiones nuevas (palanca de HTTP/2) ───────');
  const parallel = {};
  for (const k of [1, N.PARALLEL_K]) {
    const t0 = performance.now();
    const rs = await Promise.all(Array.from({ length: k }, () =>
      requestH1({ method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' }, agent: false, mode: 'firstChunk' })));
    const wall = performance.now() - t0;
    parallel[`k${k}`] = {
      k, wallMs: ms1(wall),
      perConnTlsMs: rs.map((r) => ms1(r.marks.tls)),
      perConnTtfbMs: rs.map((r) => ms1(r.marks.headers)),
      statuses: rs.map((r) => r.status ?? null),
    };
    log(`k=${k}: pared=${ms1(wall)}ms · tls_por_conexión=[${parallel[`k${k}`].perConnTlsMs.join(', ')}]ms · ttfb=[${parallel[`k${k}`].perConnTtfbMs.join(', ')}]ms`);
    await sleep(400);
  }

  /* 11 · HTTP/2 */
  log('\n── 11 · HTTP/2 (ALPN + intento estricto + muestra si existe) ─────────');
  const alpn = await tlsProbe();
  log(`ALPN [h2,http/1.1] → ${alpn.alpn ?? 'none'} · ${alpn.protocol ?? '?'} · ${alpn.cipher ?? '?'}`);
  const h2 = await http2Probe({ mode: 'firstChunk' });
  log(`http2.connect estricto → ${h2.ok ? `OK status=${h2.status} ttfb=${h2.ttfbMs}ms 1er_chunk=${h2.firstChunkBytes}B` : `FALLO ${h2.error} (alpn=${h2.alpn ?? 'none'})`}`);
  let h2cap = null;
  let h2capTuned = null;
  let h2k4 = null;
  if (h2.ok) {
    h2cap = await http2Probe({ mode: 'cap' });
    if (h2cap.ok && h2cap.bytes) {
      const s = (h2cap.elapsedMs ?? 0) / 1000;
      log(`h2 caudal (ventana por defecto 64 KiB): ${(h2cap.bytes / 1048576).toFixed(1)} MB en ${h2cap.elapsedMs}ms (${(h2cap.bytes / 1048576 / Math.max(0.001, s)).toFixed(2)} MB/s)`);
    }
    h2capTuned = await http2Probe({ mode: 'cap', windowBytes: 16 * 1024 * 1024 });
    if (h2capTuned.ok && h2capTuned.bytes) {
      const s = (h2capTuned.elapsedMs ?? 0) / 1000;
      log(`h2 caudal (ventana local 16 MiB):        ${(h2capTuned.bytes / 1048576).toFixed(1)} MB en ${h2capTuned.elapsedMs}ms (${(h2capTuned.bytes / 1048576 / Math.max(0.001, s)).toFixed(2)} MB/s)`);
    }
    h2k4 = await h2ParallelHeads(N.PARALLEL_K);
    log(`h2 ${N.PARALLEL_K} HEAD sobre UNA sesión → pared=${h2k4.wallMs}ms (connect=${h2k4.connectMs}ms, streams=[${(h2k4.streamTtfbMs || []).join(', ')}]ms) · h1 ${N.PARALLEL_K} conexiones = ${parallel[`k${N.PARALLEL_K}`]?.wallMs}ms`);
  } else {
    log('h2 no disponible ⇒ el efecto de HTTP/2 se cuantifica con el coste de conexión medido en §5/§10, no con una muestra h2 (no se inventa).');
  }

  /* 12 · agregados */
  const result = {
    harness: {
      version: VERSION, label: LABEL,
      startedUtc: start.toISOString(), startedBogota: bogotaStamp(start),
      finishedUtc: new Date().toISOString(), ssh: SSH_TARGET,
      percentiles: 'nearest-rank; N pequeño ⇒ p95 = máximo',
      probeScriptSha256: probe.meta?.scriptSha256 ?? null,
      probeElapsedMs: probe.meta?.elapsedMs ?? null,
      probeRawBytes: probe.meta?.rawBytes ?? null,
      dns: dnsInfo,
    },
    vps: vpsDerived,
    server: serverDerived,
    client: {
      fresh: {
        gzip: { stats: stats(clientFresh.gzip.map((s) => s.ttfbMs)), samples: clientFresh.gzip },
        identity: { stats: stats(clientFresh.identity.map((s) => s.ttfbMs)), samples: clientFresh.identity },
      },
      keepAliveRtt: { stats: stats(keepAlive.map((s) => s.headersMs)), samples: keepAlive },
      conditional304: cond304,
      range: clientRange,
      throughput,
      parallel,
      http2: { alpn, strict: h2, cap: h2cap, capTuned: h2capTuned, parallelHeads: h2k4 },
    },
    findings: buildFindings({ f, nego, ranges, cond, clientFresh, throughput, parallel, h2, h2cap, h2capTuned, h2k4, alpn, cpu }),
    limitations: [
      'No se descarga la lista completa desde el cliente: el peso y el digest REALES se verifican en el loopback del VPS (B1–B4) y el cliente solo hace lecturas acotadas (primer chunk / 32 MB / 10 s).',
      'Los tiempos del cliente incluyen DNS+TCP+TLS; se reporta tls_ms por separado.',
      'Percentiles nearest-rank con N=3: p95 = máximo. Es una línea base, no un intervalo de confianza.',
      'La sonda del servidor termina 4 transferencias completas en loopback (2 × 140 MB + 2 × 564 MB): es tráfico local, sin salir a Internet.',
      'HTTP/2 no está activo en el momento de la medida (ver §11): si la fase 1 lo activa, el bloque client.http2 cambia de "ausencia documentada" a "muestra real".',
      'La estimación de descarga extrapolada es lineal desde una muestra acotada; no modela variación de caudal ni congestión.',
    ],
  };

  fs.writeFileSync(path.join(runDir, 'payload.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(runDir, 'payload.log'), logLines.join('\n') + '\n');
  fs.writeFileSync(path.join(HERE, 'runs', 'latest.json'), JSON.stringify(result, null, 2));

  log('\n── 12 · RESUMEN ──────────────────────────────────────────────────────');
  log(`peso: ${result.vps.gzBytes} B gz → ${result.vps.decompressed.bytes} B (${result.vps.decompressed.mb} MB, ×${result.vps.ratio}) · ${result.vps.decompressed.lines} líneas`);
  log(`CPU nginx por descarga: gzip=${cpu['B1 GET gzip completo (coste CPU nginx)']?.nginxCpuMs} ms · identity=${cpu['B2 GET identity completo (ruta gunzip, coste CPU nginx)']?.nginxCpuMs} ms`);
  log(`cliente ttfb p50: gzip=${result.client.fresh.gzip.stats.p50} ms · identity=${result.client.fresh.identity.stats.p50} ms · RTT keep-alive=${result.client.keepAliveRtt.stats.p50} ms`);
  log(`304: ${cond304.filter((c) => c.status === 304).length}/${cond304.length} variantes devuelven 304 (bytes=0)`);
  log(`Range: ${ranges.filter((r) => r.status === 206).length} casos 206 · ${ranges.filter((r) => r.status === 200).length} casos 200 (Range ignorado)`);
  log(`HTTP/2: ${h2.ok ? 'NEGOCIADO' : 'NO NEGOCIADO'} · ALPN=${alpn.alpn ?? 'none'}`);
  if (h2.ok) {
    const mbps = (o) => (o?.ok && o.bytes && o.elapsedMs ? (o.bytes / 1048576 / (o.elapsedMs / 1000)).toFixed(2) + ' MB/s' : '?');
    log(`h2 caudal: ventana por defecto=${mbps(h2cap)} · ventana 16 MiB=${mbps(h2capTuned)} · h1 (mismo run)=${throughput.gzip?.steadyBps ? (throughput.gzip.steadyBps / 1048576).toFixed(2) + ' MB/s' : '?'}`);
    log(`h2 ${N.PARALLEL_K} streams sobre 1 conexión = ${h2k4?.wallMs} ms vs ${parallel[`k${N.PARALLEL_K}`]?.wallMs} ms con ${N.PARALLEL_K} conexiones h1`);
  }
  log(`salida: ${path.join('runs', stamp, 'payload.json')}`);
  log('RESULT=OK');
}

/* ── findings automáticos (datos → afirmaciones verificables) ───────────── */
function buildFindings({ f, nego, ranges, cond, clientFresh, throughput, parallel, h2, h2cap, h2capTuned, h2k4, alpn, cpu }) {
  const out = [];
  const gzBytes = Number(f.GZ?.match(/size=(\d+)/)?.[1] ?? NaN);
  const decBytes = Number(f.DECOMPRESSED_BYTES);
  const cpuGzip = cpu['B1 GET gzip completo (coste CPU nginx)']?.nginxCpuMs;
  const cpuId = cpu['B2 GET identity completo (ruta gunzip, coste CPU nginx)']?.nginxCpuMs;
  if (Number.isFinite(gzBytes) && Number.isFinite(decBytes)) {
    out.push({
      id: 'E6-01',
      claim: 'la representación sin gzip pesa ×' + (decBytes / gzBytes).toFixed(2) + ' y cuesta ×' + (Number.isFinite(cpuId) && Number.isFinite(cpuGzip) ? (cpuId / cpuGzip).toFixed(1) : '?') + ' CPU de nginx',
      gzBytes, decompressedBytes: decBytes, ratio: Math.round((decBytes / gzBytes) * 100) / 100,
      nginxCpuMsGzip: cpuGzip, nginxCpuMsIdentity: cpuId,
      evidence: 'probe_vps.sh B1/B2 + DECOMPRESSED_BYTES',
    });
  }
  const noGzipClients = nego.filter((n) => !n.contentEncoding);
  if (noGzipClients.length) {
    out.push({
      id: 'E6-02',
      claim: `${noGzipClients.length} de ${nego.length} variantes de Accept-Encoding reciben la lista DESCOMPRIMIDA (chunked, sin Content-Length)`,
      cases: noGzipClients.map((n) => n.acceptEncoding),
      evidence: 'probe_vps.sh A1–A8',
    });
  }
  const r206 = ranges.filter((r) => r.status === 206);
  const r200 = ranges.filter((r) => r.status === 200);
  out.push({
    id: 'E6-03',
    claim: `Range sobre el .gz: ${r206.length} casos 206 (trozo del stream gzip, Content-Range sobre 140555650) y ${r200.length} casos 200 (Range ignorado, cuerpo completo)`,
    statuses: ranges.map((r) => ({ case: r.case, status: r.status, contentRange: r.contentRange, contentEncoding: r.contentEncoding })),
    evidence: 'probe_vps.sh C1–C11 + GZ_SLICE_*',
  });
  out.push({
    id: 'E6-04',
    claim: `304 en ${cond.filter((c) => c.status === 304).length}/${cond.filter((c) => !/ajeno/.test(c.case)).length} variantes con validador propio o cruzado (fuerte/débil y al revés); con ETag ajeno → ${cond.find((c) => /ajeno/.test(c.case))?.status ?? '?'} (correcto)`,
    etagOn304: [...new Set(cond.filter((c) => c.status === 304).map((c) => c.etag))],
    etagOn200Identity: [...new Set(nego.filter((n) => !n.contentEncoding).map((n) => n.etag))],
    evidence: 'probe_vps.sh D1–D13',
  });
  if (throughput?.gzip?.steadyBps && throughput?.identity?.steadyBps) {
    out.push({
      id: 'E6-05',
      claim: 'descarga estimada del cliente: gzip ≈ ' + throughput.gzip.extrapolatedDownloadSec + ' s vs identity ≈ ' + throughput.identity.extrapolatedDownloadSec + ' s',
      gzip: throughput.gzip, identity: throughput.identity,
      evidence: 'payload_edge.mjs §9 (muestra acotada, extrapolación lineal)',
    });
  }
  if (!h2.ok) {
    out.push({
      id: 'E6-06',
      claim: 'HTTP/2 no negociado: ALPN=' + (alpn.alpn ?? 'none') + '; la palanca h2 se cuantifica como coste de conexión (k conexiones nuevas)',
      alpn, error: h2.error ?? null,
      parallelK1WallMs: parallel.k1?.wallMs ?? null,
      parallelK4WallMs: parallel.k4?.wallMs ?? null,
      evidence: 'payload_edge.mjs §10/§11',
    });
  } else {
    const mbps = (o) => (o?.ok && o.bytes && o.elapsedMs ? Math.round((o.bytes / 1048576 / (o.elapsedMs / 1000)) * 100) / 100 : null);
    out.push({
      id: 'E6-06',
      claim: `HTTP/2 NEGOCIADO (ALPN=${alpn.alpn}); ${h2k4?.k ?? '?'} HEAD por h2 = ${h2k4?.wallMs ?? '?'} ms vs ${parallel?.k4?.wallMs ?? '?'} ms con 4 conexiones h1; caudal h2 con ventana por defecto = ${mbps(h2cap) ?? '?'} MB/s vs ${mbps(h2capTuned) ?? '?'} MB/s con ventana local 16 MiB`,
      alpn, h2k4, h1k4: parallel?.k4 ?? null,
      h2CapDefault: h2cap ? { mbps: mbps(h2cap), bytes: h2cap.bytes, elapsedMs: h2cap.elapsedMs } : null,
      h2CapTuned: h2capTuned ? { mbps: mbps(h2capTuned), bytes: h2capTuned.bytes, elapsedMs: h2capTuned.elapsedMs, localWindowBytes: h2capTuned.localWindowBytes } : null,
      h1Throughput: throughput?.gzip ? { steadyBps: throughput.gzip.steadyBps } : null,
      evidence: 'payload_edge.mjs §9/§10/§11',
    });
  }
  return out;
}

main().catch((e) => {
  log(`FATAL: ${e && e.stack ? e.stack : e}`);
  try {
    const stamp = stampUtc();
    const runDir = path.join(HERE, 'runs', stamp);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'payload.log'), logLines.join('\n') + '\n');
  } catch { /* noop */ }
  process.exitCode = 1;
});
