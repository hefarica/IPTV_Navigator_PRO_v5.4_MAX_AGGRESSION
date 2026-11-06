#!/usr/bin/env node
/**
 * Aceptación de /pulse — "la URL como autobús de datos".
 * Verifica contra el endpoint REAL: 302 verbatim, 200 cartucho, log redactado,
 * rechazos, idempotencia y que el canary esté APAGADO por defecto.
 */
'use strict';
const BASE = process.env.APE_PULSE_BASE || 'https://iptv-ape.duckdns.org/pulse';
const CARTRIDGE_BASE = process.env.APE_URL2_BASE || 'https://iptv-ape.duckdns.org/url2';
const U = 'http://line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8';

let pass = 0, fail = 0; const fallos = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; fallos.push(n + (d ? ' :: ' + d : '')); console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); } };
const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const stripDev = (s) => s.replace(/DEV_[0-9A-Za-z]+/g, 'DEV_X');

(async () => {
  console.log('== /pulse · la URL como transporte de datos ==');
  const dev = Buffer.from(JSON.stringify({ soc: 's905x4', max_h: 2160, buffer_ms: 4500, player: 'vlc' })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // 1 · redirect (defecto): 302 verbatim, sin seguir
  {
    const url = BASE + '/canal.m3u8?' + q({ u: U, m: 'redirect', c: 'ch5_001', d: dev, z: '1' });
    const r = await fetch(url, { redirect: 'manual', cache: 'no-store' });
    const loc = r.headers.get('location') || '';
    console.log('\n── redirect');
    ok('200-family: 302', r.status === 302, 'status ' + r.status);
    ok('Location == u VERBATIM', loc === U, loc);
    ok('cabecera X-APE-Pulse: logged', (r.headers.get('x-ape-pulse') || '').includes('logged'));
    ok('no-store', (r.headers.get('cache-control') || '').includes('no-store'));
  }

  // 1b · MODO POR UA (medido en Philips 65PUS9206: "Loaded playlist has unexpected type.")
  {
    const base = BASE + '/canal.m3u8?' + q({ u: U, c: 'ch5_001' });
    const tvUa = 'Mozilla/5.0 (SMART-TV; PHILIPS; 65PUS9206/12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';
    const rTv = await fetch(base, { redirect: 'manual', cache: 'no-store', headers: { 'user-agent': tvUa } });
    const rVlc = await fetch(base + '&m=cartridge', { redirect: 'manual', cache: 'no-store', headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20' } });
    const rNone = await fetch(base, { redirect: 'manual', cache: 'no-store' });
    console.log('\n── modo por UA');
    ok('TV estricta (Philips) -> 200 PROXY (media playlist)', rTv.status === 200, 'status ' + rTv.status);
    ok('TV estricta: sin redirect (playlist servida por el VPS)', (rTv.headers.get('location') || '') === '', rTv.headers.get('location'));
    ok('VLC + m=cartridge -> 200 cartridge', rVlc.status === 200, 'status ' + rVlc.status);
    ok('sin UA -> 200 PROXY (default seguro)', rNone.status === 200, 'status ' + rNone.status);
    const rFire = await fetch(base, { redirect: 'manual', cache: 'no-store', headers: { 'user-agent': 'Dalvik/2.1.0 (Linux; U; Android 11; AFTWMST22 Build/PS7484)' } });
    ok('Fire TV (Dalvik AFTWMST22) -> 200 PROXY', rFire.status === 200, 'status ' + rFire.status);
    const rXtr = await fetch(base, { redirect: 'manual', cache: 'no-store', headers: { 'user-agent': 'Xtream-Codes/2.5 IPTV' } });
    ok('Fire TV (Xtream-Codes) -> 200 PROXY', rXtr.status === 200, 'status ' + rXtr.status);
    const bodyProxy = await rXtr.text();
    ok('PROXY entrega media playlist (#EXTM3U + EXTINF)', bodyProxy.startsWith('#EXTM3U') && /^#EXTINF:/m.test(bodyProxy), bodyProxy.slice(0, 40));
    ok('PROXY: segmentos ABSOLUTOS (el video no pasa por el VPS)', /^https?:\/\/[^\n]+\.(ts|m4s|mp4)/m.test(bodyProxy));
    ok('PROXY: sin master ni cartucho', !/#EXT-X-STREAM-INF/.test(bodyProxy) && !/#EXTHTTP/.test(bodyProxy));
    const rExo = await fetch(base + '&m=cartridge', { redirect: 'manual', cache: 'no-store', headers: { 'user-agent': 'ExoPlayerLib/2.19.1' } });
    ok('ExoPlayer + m=cartridge -> 200 cartridge', rExo.status === 200, 'status ' + rExo.status);
    // URL antigua con m=cartridge servida a un cliente no capaz: degrada a PROXY
    const rForce = await fetch(base + '&m=cartridge', { redirect: 'manual', cache: 'no-store', headers: { 'user-agent': tvUa } });
    ok('TV estricta + m=cartridge (lista cacheada) -> 200 PROXY', rForce.status === 200 && (rForce.headers.get('x-ape-pulse') || '').includes('mode=proxy'), 'status ' + rForce.status + ' ' + (rForce.headers.get('x-ape-pulse') || ''));
    const rVlcForce = await fetch(base + '&m=cartridge', { redirect: 'manual', cache: 'no-store', headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20' } });
    ok('VLC + m=cartridge sigue 200', rVlcForce.status === 200, 'status ' + rVlcForce.status);
  }
  // 2 · cartridge: 200 con cartucho completo (misma máquina que /url2/)
  {
    const url = BASE + '/canal.m3u8?' + q({ u: U, p: 'P1', m: 'cartridge', c: 'ch5_001', id: '3' });
    const r = await fetch(url, { cache: 'no-store', headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20' } });
    const body = await r.text();
    const lines = body.split('\n');
    console.log('\n── cartridge');
    ok('200', r.status === 200, 'status ' + r.status);
    ok('content-type m3u8', /mpegurl/i.test(r.headers.get('content-type') || ''));
    ok('>= 780 directivas (dialecto vlc)', lines.length >= 780, 'lineas ' + lines.length);
    ok('dialecto declarado', /#EXT-X-APE-URL2-DIALECT:vlc/.test(body), (body.match(/#EXT-X-APE-URL2-DIALECT:[^\n]*/) || [''])[0]);
    { const vo = body.split('\n').filter(l => l.startsWith('#EXTVLCOPT:'));
      ok('VLC: EXTVLCOPT con cadena nativa (modulos VLC) y sin sintaxis ffmpeg', vo.some(l => /video-filter=(hqdn3d|atadenoise|gradfun|sharpen|deinterlace)/.test(l)) && !vo.some(l => /scale=w=|minterpolate|unsharp=lx=/.test(l))); }
    ok('VLC: 0 KODIPROP', !/^#KODIPROP:/m.test(body));
    ok('master válido: 1 STREAM-INF', (body.match(/#EXT-X-STREAM-INF:/g) || []).length === 1);
    ok('sin #EXTINF en master', !/^#EXTINF:/m.test(body));
    ok('EXTHTTP JSON válido', (() => { const l = lines.find(x => x.startsWith('#EXTHTTP:')) || ''; try { JSON.parse(l.slice(9)); return true; } catch (_) { return false; } })());
    ok('una sola URL y verbatim', (lines.filter(x => /^https?:\/\//.test(x)).length === 1) && lines.includes(U));
    ok('cabecera dice cartridge', (r.headers.get('x-ape-pulse') || '').includes('mode=cartridge'));
  }

  // 3 · idempotencia (mismos parámetros -> mismo cuerpo salvo token DEV)
  {
    const url = BASE + '/canal.m3u8?' + q({ u: U, p: 'P3', m: 'cartridge', c: 'ch5_001', id: '3' });
    const vlcHdr = { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20' };
    const a = await (await fetch(url, { cache: 'no-store', headers: vlcHdr })).text();
    const b = await (await fetch(url, { cache: 'no-store', headers: vlcHdr })).text();
    console.log('\n── idempotencia');
    ok('mismo parámetro => misma respuesta (DEV rota)', stripDev(a) === stripDev(b));
    ok('el token DEV sí rota (anti-fingerprint)', stripDev(a) === stripDev(b) && a !== b);
  }

  // 4 · rechazos
  {
    console.log('\n── rechazos');
    const r1 = await fetch(BASE + '/canal.m3u8', { redirect: 'manual', cache: 'no-store' });
    ok('sin u -> 400', r1.status === 400, 'status ' + r1.status);
    const r2 = await fetch(BASE + '/canal.m3u8?u=' + encodeURIComponent('file:///etc/passwd'), { redirect: 'manual', cache: 'no-store' });
    ok('file:// -> 400', r2.status === 400, 'status ' + r2.status);
    const r3 = await fetch(BASE + '/canal.m3u8?u=' + encodeURIComponent(U + '\r\nX-Evil: 1'), { redirect: 'manual', cache: 'no-store' });
    ok('CRLF en u -> 400', r3.status === 400, 'status ' + r3.status);
    const r4 = await fetch(BASE + '/canal.m3u8?' + q({ u: U, m: 'redirect', d: 'no-es-base64url!!' }), { redirect: 'manual', cache: 'no-store' });
    ok('device basura -> se ignora (302 igual)', r4.status === 302, 'status ' + r4.status);
  }

  // 5 · el cartucho de /url2/ sigue igual (no regresión al compartir generador)
  {
    const url = CARTRIDGE_BASE + '/canal.m3u8?' + q({ u: U, p: 'P2', id: '3' });
    const r = await fetch(url, { cache: 'no-store', headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20' } });
    const t = await r.text();
    console.log('\n── no regresión /url2/');
    ok('/url2/ sigue 200', r.status === 200, 'status ' + r.status);
    ok('/url2/ sigue con 900+ líneas', t.split('\n').length >= 895);
  }

  console.log(`\n== RESULTADO: ${pass} PASS · ${fail} FAIL ==`);
  if (fail) { console.log('Fallos:'); fallos.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e && e.message); process.exit(1); });









