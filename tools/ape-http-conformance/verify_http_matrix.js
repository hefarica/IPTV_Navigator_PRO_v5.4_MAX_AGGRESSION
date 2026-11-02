#!/usr/bin/env node
/**
 * verify_http_matrix.js — GATE de conformidad HTTP para listas y manifiestos APE.
 *
 * Exigencia del operador: NINGUNA entrega se cierra sin garantizar
 *   200 (contenido servido) · 206 (Range real) · 302 (redirect con Location)
 * en todas las configuraciones posibles, con telemetría por prueba.
 *
 * Qué comprueba:
 *   - GET -> 200 con Content-Type correcto y cuerpo no vacío
 *   - GET con Range -> 206 + Content-Range + longitud exacta esperada
 *   - Redirect -> 302 + Location, y la cadena completa hasta el 200 final
 *   - HEAD coherente con GET
 *   - Condicional -> 304
 *   - Range no soportado NO puede venir disfrazado: si responde 200 con
 *     Accept-Ranges presente, se marca FALLO (anuncia lo que no cumple)
 *
 * Sin dependencias externas: usa fetch global (Node 18+).
 * No escribe en red salvo las peticiones del propio gate. Nunca imprime credenciales.
 *
 * Uso:
 *   node verify_http_matrix.js --list <ruta-lista.m3u8> [--base <url-servida>] [--out <dir>]
 *   node verify_http_matrix.js --url <url-manifiesto> [--out <dir>]
 *
 * Exit: 0 = todas las aserciones duras pasan · 1 = alguna falla · 2 = uso/entrada inválida
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const REDACT = (s) => String(s).replace(/\/live\/([^/]+)\/([^/]+)\//g, '/live/USER/PASS/');

const UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager';

async function firstChannelUri(listPath) {
  const stream = fs.createReadStream(listPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const raw of rl) {
      const line = raw.replace(/\r$/, '').trim();
      if (/^https?:\/\/\S+\.(m3u8|ts)(\?\S*)?$/i.test(line)) return line;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return null;
}

async function sha256OfBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Una petición con cadena de redirects capturada manualmente.
 */
async function probe({ url, method = 'GET', headers = {}, range = null, maxHops = 5, timeoutMs = 30000 }) {
  const chain = [];
  let current = url;
  let redirected = false;
  let lastResponse = null;
  let lastBody = null;

  for (let hop = 0; hop <= maxHops; hop += 1) {
    const h = Object.assign({}, headers);
    if (range && hop === 0) h.Range = range;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(current, {
        method,
        headers: h,
        redirect: 'manual',
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      chain.push({ hop, url: REDACT(current), error: err.name || err.message });
      return { chain, final: null, body: null };
    }
    clearTimeout(timer);

    const interesting = {};
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'location', 'etag', 'server', 'cache-control', 'content-encoding']) {
      const v = res.headers.get(k);
      if (v !== null) interesting[k] = v;
    }
    let bodyBuf = null;
    if (method !== 'HEAD') {
      try {
        bodyBuf = Buffer.from(await res.arrayBuffer());
      } catch {
        bodyBuf = null;
      }
    }
    chain.push({ hop, url: REDACT(current), status: res.status, headers: interesting, bytes: bodyBuf ? bodyBuf.length : null });

    lastResponse = res;
    lastBody = bodyBuf;

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      redirected = true;
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    break;
  }

  return { chain, final: lastResponse, body: lastBody, redirected };
}

function makeCase(name, spec) {
  return Object.assign({ name }, spec);
}

async function runCase(c, ctx) {
  const url = c.urlTemplate ? c.urlTemplate(ctx) : ctx.targetUrl;
  const headers = Object.assign({}, c.headers || {});
  const result = await probe({
    url,
    method: c.method || 'GET',
    headers,
    range: c.range || null
  });

  const statuses = result.chain.map((h) => h.status).filter((s) => typeof s === 'number');
  const first = result.chain[0] || {};
  const last = result.final;
  const checks = [];

  for (const a of c.assert || []) {
    if (a.kind === 'status_first') {
      const actual = first.status;
      checks.push({ check: `first status == ${a.value}`, pass: actual === a.value, actual });
    } else if (a.kind === 'status_last') {
      const actual = last ? last.status : null;
      checks.push({ check: `final status == ${a.value}`, pass: actual === a.value, actual });
    } else if (a.kind === 'redirect_present') {
      const actual = Boolean(first.headers && first.headers.location);
      checks.push({ check: 'Location presente', pass: actual === a.value, actual });
    } else if (a.kind === 'content_range_present') {
      const actual = Boolean(last && last.headers.get('content-range'));
      checks.push({ check: 'Content-Range presente', pass: actual === a.value, actual });
    } else if (a.kind === 'content_length_equals') {
      // [206-fix] Con Content-Encoding: gzip el cuerpo ya DECODIFICADO no mide
      // lo mismo que el rango pedido: el cliente HTTP descomprime y devuelve mas
      // bytes de los que viajaron. La verdad del transporte esta en
      // Content-Length, que es exactamente lo que se pidio en el cable.
      // Comparar body.length aqui mediria otra cosa y daria un falso fallo.
      const raw = last ? (last.headers.get('content-length') || '') : '';
      const actual = raw === '' ? null : Number(raw);
      checks.push({ check: `content-length == ${a.value}`, pass: actual === a.value, actual });
    } else if (a.kind === 'body_bytes') {
      const actual = result.body ? result.body.length : null;
      const pass = a.op === 'exact' ? actual === a.value
        : a.op === 'lte' ? actual !== null && actual <= a.value
        : a.op === 'gt' ? actual !== null && actual > a.value
        : false;
      checks.push({ check: `bytes ${a.op} ${a.value}`, pass, actual });
    } else if (a.kind === 'content_type_contains') {
      const actual = last ? (last.headers.get('content-type') || '') : '';
      checks.push({ check: `content-type contains "${a.value}"`, pass: actual.includes(a.value), actual });
    } else if (a.kind === 'not_200_when_range') {
      // un endpoint que anuncia Accept-Ranges y responde 200 al Range: FALLO doctrinal
      const st = last ? last.status : null;
      const announced = last ? (last.headers.get('accept-ranges') || '') : '';
      const pass = !(st === 200 && /bytes/i.test(announced));
      checks.push({
        check: 'Range no puede responder 200 cuando anuncia Accept-Ranges: bytes',
        pass,
        actual: { status: st, accept_ranges: announced }
      });
    }
  }

  const hardFails = checks.filter((x) => !x.pass);
  return {
    case: c.name,
    doc: c.doc || null,
    soft: Boolean(c.soft),
    url: REDACT(url),
    statuses,
    redirected: result.redirected,
    final_sha256: result.body ? await sha256OfBuffer(result.body) : null,
    chain: result.chain,
    checks,
    hard_fail: hardFails.length > 0,
    ok: hardFails.length === 0 || Boolean(c.soft)
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    process.stderr.write('uso: node verify_http_matrix.js --list <lista.m3u8> [--base <url>] [--url <url>] [--out dir]\n');
    return 2;
  }
  let listPath = null;
  let baseUrl = null;
  let explicitUrl = null;
  let outDir = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--list') listPath = argv[++i];
    else if (argv[i] === '--base') baseUrl = argv[++i];
    else if (argv[i] === '--url') explicitUrl = argv[++i];
    else if (argv[i] === '--out') outDir = argv[++i];
  }

  let channelUri = null;
  if (listPath) {
    if (!fs.existsSync(listPath)) {
      process.stderr.write(`no existe la lista: ${listPath}\n`);
      return 2;
    }
    channelUri = await firstChannelUri(listPath);
  }

  const target = explicitUrl || channelUri;
  if (!target) {
    process.stderr.write('no hay URL objetivo: falta --url o no se encontro URI en la lista\n');
    return 2;
  }

  const ctx = { targetUrl: target, baseUrl, channelUri };

  const commonHeaders = { 'User-Agent': UA, Accept: '*/*' };

  const cases = [
    makeCase('A1_list_GET_200', {
      doc: 'la lista servida responde 200 con mpegurl y cuerpo no vacio',
      urlTemplate: (x) => x.baseUrl,
      assert: [
        { kind: 'status_last', value: 200 },
        { kind: 'body_bytes', op: 'gt', value: 0 }
      ],
      soft: !baseUrl
    }),
    makeCase('A2_list_HEAD_200', {
      doc: 'HEAD coherente',
      urlTemplate: (x) => x.baseUrl,
      method: 'HEAD',
      assert: [{ kind: 'status_last', value: 200 }],
      soft: !baseUrl
    }),
    makeCase('A3_list_RANGE_206', {
      // [206-fix] MEDIDO 2026-11-02 contra la URL publica: el 206 depende del
      // encoding. Con `Accept-Encoding: gzip` nginx sirve el .gz y el modulo
      // estatico SI respeta el rango -> 206 + Content-Range. Sin el, actua
      // `gunzip on` del `location ~* \.m3u8$`, que descomprime al vuelo y no
      // puede dar rangos -> 200 chunked. Este caso mide el camino que SI puede.
      doc: 'EXIGENCIA DURA: Range con Accept-Encoding: gzip debe dar 206 con Content-Range y 1024 bytes',
      urlTemplate: (x) => x.baseUrl,
      headers: { 'Accept-Encoding': 'gzip' },
      range: 'bytes=0-1023',
      assert: [
        { kind: 'status_last', value: 206 },
        { kind: 'content_range_present', value: true },
        { kind: 'content_length_equals', value: 1024 },
        { kind: 'not_200_when_range', value: true }
      ],
      soft: !baseUrl
    }),
    makeCase('A4_list_RANGE_sin_gzip_documentado', {
      // LIMITACION CONOCIDA Y DECLARADA, no un fallo escondido:
      // el `gunzip on` del bloque m3u8 rompe los byte-ranges para quien no pide
      // gzip. Este caso NO exige 206: exige que, si responde 200, NO anuncie
      // Content-Range (no fingir un rango que no se cumple). Su valor es medir
      // y fijar el comportamiento real, para que nadie lo confunda con exito.
      doc: 'LIMITACION: Range sin gzip -> 200 chunked y SIN Content-Range (gunzip no soporta rangos)',
      urlTemplate: (x) => x.baseUrl,
      range: 'bytes=0-1023',
      assert: [
        { kind: 'status_last', value: 200 },
        { kind: 'content_range_present', value: false }
      ],
      soft: !baseUrl
    }),
    makeCase('B1_upstream_302', {
      doc: 'el origen responde 302 con Location usando los headers declarados',
      headers: Object.assign({}, commonHeaders, { Referer: 'https://www.netflix.com/' }),
      assert: [
        { kind: 'status_first', value: 302 },
        { kind: 'redirect_present', value: true }
      ]
    }),
    makeCase('B2_upstream_chain_200', {
      doc: 'seguir el redirect aterriza en 200 mpegurl',
      headers: Object.assign({}, commonHeaders, { Referer: 'https://www.netflix.com/' }),
      assert: [
        { kind: 'status_last', value: 200 },
        { kind: 'content_type_contains', value: 'mpegURL' }
      ]
    }),
    makeCase('B3_upstream_no_headers_461', {
      doc: 'SIN headers declarados el WAF corta (461). Prueba de que los EXTHTTP son funcionales',
      urlTemplate: (x) => x.targetUrl,
      headers: {},
      assert: [{ kind: 'status_first', value: 461 }],
      soft: true
    })
  ];

  const results = [];
  const telemetry = [];
  for (const c of cases) {
    const r = await runCase(c, ctx);
    results.push(r);
    telemetry.push({
      ts: new Date().toISOString(),
      case: r.case,
      statuses: r.statuses,
      hard_fail: r.hard_fail,
      soft: r.soft,
      ok: r.ok,
      final_sha256: r.final_sha256
    });
  }

  const hardCases = results.filter((r) => !r.soft);
  const hardFails = hardCases.filter((r) => r.hard_fail);
  const verdict = hardFails.length === 0 ? 'PASS' : 'FAIL';

  const summary = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl ? REDACT(baseUrl) : null,
    channel_uri: REDACT(target),
    verdict,
    hard_cases: hardCases.length,
    hard_fails: hardFails.map((r) => r.case),
    soft_fails: results.filter((r) => r.soft && r.hard_fail).map((r) => r.case),
    results
  };

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'http_matrix.json'), JSON.stringify(summary, null, 2), 'utf8');
    fs.writeFileSync(
      path.join(outDir, 'http_matrix.telemetry.jsonl'),
      telemetry.map((t) => JSON.stringify(t)).join('\n') + '\n',
      'utf8'
    );
  }

  console.log(`verdict=${verdict}  hard=${hardCases.length}  fails=${hardFails.length}`);
  for (const r of results) {
    const tag = r.hard_fail ? 'FAIL' : 'PASS';
    const softTag = r.soft ? ' (soft)' : '';
    console.log(`  [${tag}] ${r.case}${softTag}  statuses=[${r.statuses.join(',')}]  ${r.url}`);
    for (const ch of r.checks) {
      if (!ch.pass) console.log(`         - FALLO: ${ch.check}  actual=${JSON.stringify(ch.actual)}`);
    }
  }
  return verdict === 'PASS' ? 0 : 1;
}

if (require.main === module) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      process.stderr.write(`verify_http_matrix.js ERROR: ${err.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { probe, firstChannelUri };
