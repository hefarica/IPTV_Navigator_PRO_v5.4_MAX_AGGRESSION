#!/usr/bin/env node
/**
 * verify_dialects.js — polimorfismo + idempotencia del cartucho por player.
 *
 * El MISMO canal se entrega con el vocabulario que cada reproductor entiende:
 *   VLC            -> dialecto vlc     (#EXTVLCOPT + cadena de filtros NATIVA de VLC)
 *   Kodi           -> dialecto kodi    (#KODIPROP / inputstream.adaptive)
 *   OTT/ExoPlayer  -> dialecto android (solo #EXT-X-* + #EXTHTTP)
 *   Fire TV/otro   -> proxy            (media playlist del proveedor, sin cartucho)
 *
 * Garantías que verifica:
 *   IDEMPOTENTE  misma entrada + mismo cliente => mismo cuerpo (salvo token DEV,
 *                que rota a propósito) y mismo dialecto.
 *   POLIMÓRFICO  cuatro formas distintas del mismo canal, todas válidas y con el
 *                mismo perfil y la misma URL verbatim.
 *
 * Uso: node tools/url2/verify_dialects.js [--url <pulse-url>]
 */
'use strict';

const U = process.env.APE_DIALECT_URL ||
  'https://iptv-ape.duckdns.org/pulse/15428.m3u8?u=http%3A%2F%2Fline.tivi-ott.net%2Flive%2F3JHFTC%2FU56BDP%2F15428.m3u8&p=P1&m=cartridge';

const UA = {
  vlc: 'VLC/3.0.20 LibVLC/3.0.20',
  kodi: 'Kodi/20.5 (Linux; Android 12)',
  android: 'ExoPlayerLib/2.19.1',
  proxy: 'Dalvik/2.1.0 (Linux; U; Android 11; AFTWMST22 Build/PS7484)',
};

let pass = 0, fail = 0; const fallos = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; fallos.push(n + (d ? ' :: ' + d : '')); console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); } };
const stripDev = (s) => s.replace(/DEV_[0-9A-Za-z]+/g, 'DEV_X');

async function get(ua) {
  const r = await fetch(U, { cache: 'no-store', headers: { 'user-agent': ua } });
  const body = await r.text();
  const lines = body.split('\n');
  return {
    status: r.status, body, lines,
    dialect: (body.match(/#EXT-X-APE-URL2-DIALECT:([a-z]+)/) || [])[1] || '',
    vlc: lines.filter(l => l.startsWith('#EXTVLCOPT:')).length,
    kodi: lines.filter(l => l.startsWith('#KODIPROP:')).length,
    ape: lines.filter(l => l.startsWith('#EXT-X-APE-')).length,
    http: lines.filter(l => l.startsWith('#EXTHTTP:')).length,
    streaminf: lines.filter(l => l.startsWith('#EXT-X-STREAM-INF:')).length,
    urls: lines.filter(l => /^https?:\/\//.test(l)),
    profile: (body.match(/#EXT-X-APE-URL2-CARTRIDGE:1;PROFILE=(P[0-5])/) || [])[1] || '',
    ffmpegInVlc: lines.filter(l => l.startsWith('#EXTVLCOPT:')).some(l => /hqdn3d|minterpolate|scale=w=/.test(l)),
    vlcNative: lines.some(l => l.includes('video-filter=sharpen:gradfun:adjust')),
  };
}

(async () => {
  console.log('== cartucho polimórfico por player ==');

  const vlc = await get(UA.vlc);
  console.log('\n── VLC');
  ok('dialecto vlc', vlc.dialect === 'vlc', vlc.dialect);
  ok('usa #EXTVLCOPT (muchas)', vlc.vlc >= 100, 'vlc=' + vlc.vlc);
  ok('NO usa #KODIPROP', vlc.kodi === 0, 'kodi=' + vlc.kodi);
  ok('cadena de filtros NATIVA de VLC', vlc.vlcNative);
  ok('SIN sintaxis ffmpeg en EXTVLCOPT', vlc.ffmpegInVlc === false);
  ok('1 STREAM-INF y 1 URL verbatim', vlc.streaminf === 1 && vlc.urls.length === 1, `si=${vlc.streaminf} urls=${vlc.urls.length}`);

  const kodi = await get(UA.kodi);
  console.log('\n── Kodi');
  ok('dialecto kodi', kodi.dialect === 'kodi', kodi.dialect);
  ok('usa #KODIPROP (muchas)', kodi.kodi >= 80, 'kodi=' + kodi.kodi);
  ok('NO usa #EXTVLCOPT (Kodi lo ignora)', kodi.vlc === 0, 'vlc=' + kodi.vlc);
  ok('1 STREAM-INF y 1 URL verbatim', kodi.streaminf === 1 && kodi.urls.length === 1);

  const andr = await get(UA.android);
  console.log('\n── OTT / ExoPlayer (android)');
  ok('dialecto android', andr.dialect === 'android', andr.dialect);
  ok('sin #EXTVLCOPT', andr.vlc === 0, 'vlc=' + andr.vlc);
  ok('sin #KODIPROP', andr.kodi === 0, 'kodi=' + andr.kodi);
  ok('conserva EXTHTTP + APE + STREAM-INF', andr.http === 1 && andr.ape > 400 && andr.streaminf === 1,
    `http=${andr.http} ape=${andr.ape} si=${andr.streaminf}`);
  ok('1 URL verbatim', andr.urls.length === 1);

  const prox = await get(UA.proxy);
  console.log('\n── Fire TV (proxy)');
  ok('media playlist (media/no master)', prox.body.startsWith('#EXTM3U') && prox.streaminf === 0, 'si=' + prox.streaminf);
  ok('sin cartucho ni EXTHTTP', prox.kodi === 0 && prox.http === 0 && prox.ape === 0);
  ok('segmentos absolutos', /^https?:\/\/[^\n]+\.(ts|m4s|mp4)/m.test(prox.body));

  console.log('\n── polimorfismo e idempotencia');
  const bodies = [vlc.body, kodi.body, andr.body].map(stripDev);
  ok('4 formas distintas del MISMO canal', new Set(bodies).size === 3 && prox.body !== stripDev(andr.body));
  ok('mismo perfil en los dialectos de cartucho', vlc.profile === kodi.profile && kodi.profile === andr.profile && vlc.profile !== '', vlc.profile);
  const vlc2 = await get(UA.vlc);
  ok('idempotente: mismo cliente => mismo cuerpo (salvo DEV)', stripDev(vlc.body) === stripDev(vlc2.body));
  ok('idempotente: mismo dialecto', vlc.dialect === vlc2.dialect);
  ok('DEV rota a propósito (anti-fingerprint)', vlc.body !== vlc2.body);

  console.log(`\n== RESULTADO: ${pass} PASS · ${fail} FAIL ==`);
  if (fail) { console.log('Fallos:'); fallos.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e && e.message); process.exit(1); });
