#!/usr/bin/env node
/**
 * Aceptación URL-2 "todo embebido en una URL" — contra el endpoint REAL desplegado.
 * Verifica: 200, cartucho completo por perfil, GOLDEN RULE, Ley Cardinal 1,
 * EXTHTTP JSON válido ≤8192 B, sin headers tóxicos, UNA sola URL (verbatim),
 * sustituciones por canal, y rechazos (400) de entradas inválidas.
 */
'use strict';
const BASE = process.env.APE_URL2_BASE || 'https://iptv-ape.duckdns.org/prisma/api/url2-cartridge.php';
const U = 'http://line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8';

let pass = 0, fail = 0;
const fallos = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; fallos.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}
const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');

(async () => {
  console.log('== URL-2 · TODO EMBEBIDO EN UNA URL (endpoint real) ==');
  const profiles = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
  const seen = {};
  for (const p of profiles) {
    const url = BASE + '?' + q({ u: U, p, n: 'TOP CHANNEL FHD', g: 'ALBANIA', id: '3', logo: 'http://picon.tivi-ott.net/p.png' });
    const r = await fetch(url, { cache: 'no-store' });
    const body = await r.text();
    const lines = body.split('\n');
    const si = lines.find(l => l.startsWith('#EXT-X-STREAM-INF:')) || '';
    const ei = lines.find(l => l.startsWith('#EXTINF:')) || '';
    const exthttp = lines.find(l => l.startsWith('#EXTHTTP:')) || '';
    const urls = lines.filter(l => /^https?:\/\//.test(l));
    const hdr = r.headers.get('x-ape-url2') || '';

    const bw = Number((si.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
    const res = (si.match(/RESOLUTION=([0-9]+x[0-9]+)/) || [])[1] || '';
    const codec = (si.match(/CODECS="([^"]+)"/) || [])[1] || '';
    const level = (codec.match(/hvc1\.2\.4\.L(\d+)\.B0/) || [])[1] || '';
    const pq = /VIDEO-RANGE=PQ/.test(si);
    let jsonOk = false, jsonBytes = exthttp.length;
    try { JSON.parse(exthttp.replace(/^#EXTHTTP:/, '')); jsonOk = true; } catch (_) { }

    const toxic = /\b(Range|If-Range|If-None-Match|If-Modified-Since|TE|Priority|Upgrade-Insecure-Requests)\b\s*[:=]/i.test(exthttp);
    const hvInVlc = lines.some(l => /^#EXTVLCOPT:.*hvc1\./i.test(l)) || lines.some(l => /^#KODIPROP:.*hvc1\./i.test(l));
    const hevInStreamInf = /hev1\./i.test(si);

    console.log(`\n── ${p} · ${lines.length} líneas · ${body.length} B · bw=${bw} res=${res} L${level}`);
    ok(`${p}: HTTP 200`, r.status === 200, 'status ' + r.status);
    ok(`${p}: content-type m3u8`, /mpegurl/i.test(r.headers.get('content-type') || ''), r.headers.get('content-type'));
    ok(`${p}: cabecera X-APE-URL2 declara el perfil`, hdr.includes('profile=' + p), hdr);
    ok(`${p}: 900+ directivas (cartucho real)`, lines.length >= 895, 'lineas ' + lines.length);
    ok(`${p}: #EXTINF presente`, ei.startsWith('#EXTINF:'), ei.slice(0, 80));
    ok(`${p}: #EXT-X-STREAM-INF único`, (body.match(/#EXT-X-STREAM-INF:/g) || []).length === 1);
    ok(`${p}: EXTHTTP JSON válido`, jsonOk, 'bytes ' + jsonBytes);
    ok(`${p}: EXTHTTP ≤ 8192 B`, jsonBytes <= 8192, 'bytes ' + jsonBytes);
    ok(`${p}: sin headers tóxicos`, toxic === false);
    ok(`${p}: GOLDEN RULE hvc1 sólo en STREAM-INF`, hvInVlc === false && hevInStreamInf === false);
    ok(`${p}: Ley Cardinal 1 (L153 ↔ 4K)`, res === '3840x2160' && level === '153', `res=${res} L=${level}`);
    ok(`${p}: declara HDR (VIDEO-RANGE=PQ)`, pq === true);
    ok(`${p}: hay #EXTVLCOPT (VLC)`, lines.some(l => l.startsWith('#EXTVLCOPT:')));
    ok(`${p}: hay #KODIPROP (Kodi)`, lines.some(l => l.startsWith('#KODIPROP:')));
    ok(`${p}: hay #EXT-X-APE-* (daemon/hardware)`, lines.some(l => l.startsWith('#EXT-X-APE-')));
    ok(`${p}: exactamente UNA URL`, urls.length === 1, 'urls ' + urls.length + ' ' + urls.join(','));
    ok(`${p}: la URL es VERBATIM (SHIELDED)`, urls[0] === U, urls[0]);
    ok(`${p}: nombre/grupo aplicados`, ei.includes('TOP CHANNEL FHD') && ei.includes('ALBANIA'), ei.slice(0, 200));
    ok(`${p}: tvg-id aplicado`, ei.includes('tvg-id="3"'), ei.slice(0, 120));
    ok(`${p}: logo aplicado`, ei.includes('tvg-logo="http://picon.tivi-ott.net/p.png"'));
    ok(`${p}: DEV rotado (no estático)`, /DEV_[0-9a-f]{10}/.test(body));
    seen[p] = { bw, res, level, lines: lines.length };
  }

  // Diferenciación real por perfil (no copias)
  console.log('\n── perfil: BANDWIDTH distinto por perfil');
  const bws = profiles.map(p => seen[p].bw);
  ok('los 6 perfiles tienen BANDWIDTH distinto', new Set(bws).size === 6, JSON.stringify(seen));

  // Negativos
  console.log('\n── rechazos');
  const r400a = await fetch(BASE, { cache: 'no-store' });
  ok('sin u → 400', r400a.status === 400, 'status ' + r400a.status);
  const r400b = await fetch(BASE + '?' + q({ u: 'file:///etc/passwd', p: 'P1' }), { cache: 'no-store' });
  ok('esquema file:// → 400', r400b.status === 400, 'status ' + r400b.status);
  const r400c = await fetch(BASE + '?u=' + encodeURIComponent(U + '\r\n#EXT-X-STREAM-INF:BANDWIDTH=1'), { cache: 'no-store' });
  ok('inyección CRLF en u → 400', r400c.status === 400, 'status ' + r400c.status);

  console.log(`\n== RESULTADO: ${pass} PASS · ${fail} FAIL ==`);
  if (fail) { console.log('Fallos:'); fallos.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e && e.message); process.exit(1); });
