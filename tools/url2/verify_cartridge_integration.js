#!/usr/bin/env node
/**
 * verify_cartridge_integration.js — ¿el cartucho URL-2 viaja de verdad por las listas?
 *
 * Comprueba, contra los endpoints REALES desplegados:
 *   1) /url2/canal.m3u8  P0..P5: cartucho completo con el perfil correcto.
 *   2) /pulse/<id>.m3u8  (m=cartridge): el MISMO cartucho, que es lo que llevan las
 *      listas envueltas (inventario en --channels <json>).
 *   3) manifest-4k.php: master 4K vivo.
 *
 * Uso:
 *   node tools/url2/verify_cartridge_integration.js [--channels <json>]
 *   json: [{ "list": "...", "url": "https://.../pulse/..." }, ...]
 *
 * Sale 0 si todo pasa. No modifica nada.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { ApeUrlBuilder } = require(path.join(__dirname, 'ape-url-builder.js'));

const U = 'http://line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8';
const BASE_URL2 = process.env.APE_URL2 || 'https://iptv-ape.duckdns.org/url2/canal.m3u8';
const BASE_M4K = process.env.APE_M4K || 'https://iptv-ape.duckdns.org/prisma/api/manifest-4k.php';
const EXPECTED_BW = { P0: 45000000, P1: 26900000, P2: 20000000, P3: 8000000, P4: 4000000, P5: 2000000 };
const TOXIC = /"(Range|If-Range|If-None-Match|If-Modified-Since|TE|Priority|Upgrade-Insecure-Requests)"\s*:/i;

let pass = 0, fail = 0; const fallos = [];
const ok = (n, c, d) => { if (c) { pass++; } else { fail++; fallos.push(n + (d ? ' :: ' + d : '')); console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); } };
const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');

function inspect(body) {
  const lines = body.split('\n');
  const si = lines.find(l => l.startsWith('#EXT-X-STREAM-INF:')) || '';
  const exthttp = lines.find(l => l.startsWith('#EXTHTTP:')) || '';
  const urls = lines.filter(l => /^https?:\/\//.test(l));
  let jsonOk = false;
  try { JSON.parse(exthttp.slice(9)); jsonOk = true; } catch (_) { }
  return {
    lines: lines.length,
    extinf: lines.filter(l => l.startsWith('#EXTINF:')).length,
    streaminf: (body.match(/#EXT-X-STREAM-INF:/g) || []).length,
    si, exthttp, urls,
    jsonOk, exthttpBytes: exthttp.length,
    bw: Number((si.match(/BANDWIDTH=(\d+)/) || [])[1] || 0),
    res: (si.match(/RESOLUTION=([0-9]+x[0-9]+)/) || [])[1] || '',
    codec: (si.match(/CODECS="([^"]+)"/) || [])[1] || '',
    pq: /VIDEO-RANGE=PQ/.test(si),
    hdcp: /HDCP-LEVEL=TYPE-1/.test(si),
    vlcopt: lines.filter(l => l.startsWith('#EXTVLCOPT:')).length,
    kodiprop: lines.filter(l => l.startsWith('#KODIPROP:')).length,
    ape: lines.filter(l => l.startsWith('#EXT-X-APE-')).length,
    attr: lines.filter(l => l.startsWith('#EXTATTRFROMURL:')).length,
    cmf: lines.filter(l => l.startsWith('#EXT-X-CMAF-')).length,
    device: lines.find(l => l.startsWith('#EXT-X-APE-URL2-DEVICE:')) || '',
    iframe: lines.filter(l => l.startsWith('#EXT-X-I-FRAME-STREAM-INF')).length,
    header: lines.find(l => l.startsWith('#EXT-X-APE-URL2-CARTRIDGE:')) || '',
    toxic: TOXIC.test(exthttp),
    hvInVlc: lines.some(l => /^#EXTVLCOPT:.*hvc1\./i.test(l)) || lines.some(l => /^#KODIPROP:.*hvc1\./i.test(l)),
    hevInSi: /hev1\./i.test(si),
  };
}

function assertCartridge(label, body, expectedProfile) {
  const r = inspect(body);
  ok(`${label}: 900+ directivas`, r.lines >= 895, 'lineas ' + r.lines);
  ok(`${label}: un solo STREAM-INF y sin EXTINF`, r.streaminf === 1 && r.extinf === 0, `si=${r.streaminf} extinf=${r.extinf}`);
  ok(`${label}: CODECS hvc1.2.4.L153.B0 + mp4a.40.2`, r.codec === 'hvc1.2.4.L153.B0,mp4a.40.2', r.codec);
  ok(`${label}: RESOLUTION 3840x2160 + VIDEO-RANGE=PQ`, r.res === '3840x2160' && r.pq === true, `${r.res} pq=${r.pq}`);
  ok(`${label}: HDCP-LEVEL=TYPE-1`, r.hdcp === true);
  ok(`${label}: EXTHTTP JSON válido y ≤8192 B`, r.jsonOk && r.exthttpBytes > 0 && r.exthttpBytes <= 8192, `${r.exthttpBytes} B json=${r.jsonOk}`);
  ok(`${label}: 0 headers tóxicos`, r.toxic === false);
  ok(`${label}: GOLDEN RULE (hvc1 sólo en STREAM-INF)`, r.hvInVlc === false && r.hevInSi === false);
  ok(`${label}: sin #EXT-X-I-FRAME-STREAM-INF sin URI (rompe players estrictos)`, r.iframe === 0, 'iframe=' + r.iframe);
  ok(`${label}: EXTVLCOPT/KODIPROP/APE/EXTATTR presentes`, r.vlcopt >= 100 && r.kodiprop >= 80 && r.ape >= 500 && r.attr >= 40,
    `vlc=${r.vlcopt} kodi=${r.kodiprop} ape=${r.ape} attr=${r.attr}`);
  ok(`${label}: exactamente UNA URL`, r.urls.length === 1, 'urls ' + r.urls.length);
  ok(`${label}: cabecera del cartucho`, /#EXT-X-APE-URL2-CARTRIDGE:1;PROFILE=P[0-5];LINES=904/.test(r.header), r.header);
  ok(`${label}: línea DEVICE (trazabilidad)`, r.device.startsWith('#EXT-X-APE-URL2-DEVICE:'), r.device.slice(0, 60));
  if (expectedProfile) {
    ok(`${label}: perfil ${expectedProfile} coincide`, r.header.includes('PROFILE=' + expectedProfile), r.header.slice(0, 60));
    ok(`${label}: BANDWIDTH ${EXPECTED_BW[expectedProfile]}`, r.bw === EXPECTED_BW[expectedProfile], 'bw=' + r.bw);
  }
  return r;
}

(async () => {
  console.log('== 1 · /url2/canal.m3u8 por perfil P0..P5 ==');
  for (const p of Object.keys(EXPECTED_BW)) {
    const url = BASE_URL2 + '?' + q({ u: U, p, id: '3' });
    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.text();
    console.log(`\n── ${p} · HTTP ${res.status} · ${body.length} B`);
    ok(`${p}: HTTP 200 m3u8`, res.status === 200 && /mpegurl/i.test(res.headers.get('content-type') || ''), res.status + ' ' + res.headers.get('content-type'));
    assertCartridge(p, body, p);
    const r = inspect(body);
    ok(`${p}: URL final VERBATIM`, r.urls[0] === U, r.urls[0]);
  }

  console.log('\n== 2 · /pulse/<id>.m3u8 (lo que llevan las listas envueltas) ==');
  const argi = process.argv.indexOf('--channels');
  const chFile = argi >= 0 ? process.argv[argi + 1] : (process.env.APE_CHANNELS || '');
  const rows = chFile && fs.existsSync(chFile) ? JSON.parse(fs.readFileSync(chFile, 'utf8')) : [];
  ok('inventario de canales provisto', rows.length > 0, 'fichero ' + chFile);
  for (const row of rows) {
    const pu = new URL(row.url);
    const pParam = (pu.searchParams.get('p') || '').toUpperCase();
    const verbatim = pu.searchParams.get('u') || '';
    const res = await fetch(row.url, { cache: 'no-store' });
    const body = await res.text();
    console.log(`\n── ${row.list} · p=${pParam} · HTTP ${res.status} · ${body.length} B`);
    ok(`${row.list}: URL de lista lleva m=cartridge`, /[?&]m=cartridge/.test(row.url), row.url.slice(0, 80));
    ok(`${row.list}: HTTP 200 m3u8`, res.status === 200 && /mpegurl/i.test(res.headers.get('content-type') || ''), res.status);
    const r = assertCartridge(row.list, body, pParam);
    ok(`${row.list}: URL final == u (verbatim, SHIELDED)`, r.urls[0] === verbatim, `${String(r.urls[0]).slice(0, 60)} vs ${verbatim.slice(0, 60)}`);
    const parsed = ApeUrlBuilder.parse(row.url);
    ok(`${row.list}: fingerprint de la URL válido`, parsed.valid === true, JSON.stringify(parsed && parsed.actual_fp));
  }

  console.log('\n== 3 · manifest-4k.php (master 4K, antes 503) ==');
  {
    const res = await fetch(BASE_M4K + '?u=' + encodeURIComponent(U), { cache: 'no-store' });
    const body = await res.text();
    ok('manifest-4k: HTTP 200', res.status === 200, 'status ' + res.status);
    ok('manifest-4k: STREAM-INF 4K + hvc1 + PQ', /RESOLUTION=3840x2160/.test(body) && /hvc1\.2\.4\.L153\.B0/.test(body) && /VIDEO-RANGE=PQ/.test(body), body.slice(0, 200));
    ok('manifest-4k: la URL verbatim al final', body.trim().endsWith(U), body.trim().split('\n').pop());
  }

  console.log(`\n== RESULTADO: ${pass} PASS · ${fail} FAIL ==`);
  if (fail) { console.log('Fallos:'); fallos.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e && e.message); process.exit(1); });


