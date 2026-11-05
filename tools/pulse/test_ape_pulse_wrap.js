#!/usr/bin/env node
/**
 * test_ape_pulse_wrap.js — las tres garantías del envoltorio de listas.
 *   IDEMPOTENTE · ISOMÓRFICA · POLIMÓRFICA
 * Usa una lista sintética y el builder REAL. Sale 0 si las tres se cumplen.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const WRAP = path.join(__dirname, 'ape-pulse-wrap.js');
const BUILDER = path.join(ROOT, 'tools', 'url2', 'ape-url-builder.js');
const { ApeUrlBuilder } = require(BUILDER);

let pass = 0, fail = 0; const fallos = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; fallos.push(n + (d ? ' :: ' + d : '')); console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); } };

const SRC = [
  '#EXTM3U',
  '#EXT-X-APEX:1',
  '#EXTINF:-1 tvg-id="3" tvg-chno="3" tvg-name="TOP CHANNEL FHD" tvg-logo="http://p/x.png" group-title="ALBANIA FHD",TOP CHANNEL FHD',
  '#EXTVLCOPT:network-caching=30000',
  '#EXT-X-APE-FOO:BAR',
  'http://line.tivi-ott.net/live/U/P/3.m3u8',
  '#EXTINF:-1 tvg-id="9" tvg-chno="9" tvg-name="KLAN 4K" group-title="4K PREMIUM",KLAN 4K',
  'http://line.tivi-ott.net/live/U/P/9.m3u8',
  '#EXTINF:-1 tvg-id="77" tvg-chno="77" tvg-name="CANAL CON HEADERS INLINE" group-title="TEST",CANAL CON HEADERS INLINE',
  'http://line.tivi-ott.net/live/U/P/77.m3u8|User-Agent=Kodi/20.5&Cache-Control=no-cache',  '#EXTINF:-1 tvg-id="12" tvg-chno="12" tvg-name="SD CHANNEL" group-title="SD",SD CHANNEL',
  'http://line.tivi-ott.net/live/U/P/12.m3u8',
  '',
].join('\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-pulse-wrap-'));
const inp = path.join(tmp, 'in.m3u8');
fs.writeFileSync(inp, SRC);

function run(out, extra = []) {
  return JSON.parse(execFileSync(process.execPath, [WRAP, '--in', inp, '--out', out, '--mode', 'cartridge', ...extra], {
    env: { ...process.env, APE_URL_BUILDER: BUILDER },
    encoding: 'utf8',
  }).trim());
}

console.log('== ape-pulse-wrap · idempotente / isomórfico / polimórfico ==');
const a = run(path.join(tmp, 'a.m3u8'));
const textA = fs.readFileSync(path.join(tmp, 'a.m3u8'), 'utf8');

// ISOMÓRFICO: estructura 1:1
{
  const srcLines = SRC.split('\n');
  const outLines = textA.split('\n');
  const count = (arr, p) => arr.filter(x => p(x)).length;
  ok('mismo número de #EXTINF', count(srcLines, x => x.startsWith('#EXTINF')) === count(outLines, x => x.startsWith('#EXTINF')),
    count(srcLines, x => x.startsWith('#EXTINF')) + ' vs ' + count(outLines, x => x.startsWith('#EXTINF')));
  ok('mismas directivas no-URL (byte a byte)',
    JSON.stringify(srcLines.filter(x => x.startsWith('#'))) === JSON.stringify(outLines.filter(x => x.startsWith('#'))));
  ok('una sola URL por canal', count(outLines, x => /^https?:\/\//.test(x)) === 4);
  ok('cabecera intacta', outLines[0] === '#EXTM3U');
}

// POLIMÓRFICO: perfil por clase de canal
{
  ok('4 canales envueltos (uno con headers inline)', a.wrapped === 4, JSON.stringify(a));
  ok('saneo de URL con |headers contado', a.sanitized === 1, JSON.stringify(a));
  ok('perfiles distintos por clase (P0 4K / P3 FHD / P5 SD)',
    a.profiles.P0 === 1 && a.profiles.P3 === 2 && a.profiles.P5 === 1, JSON.stringify(a.profiles));
  const urls = textA.split('\n').filter(x => /^https?:\/\//.test(x));
  const parsed = urls.map(u => ApeUrlBuilder.parse(u));
  ok('todas las URLs portan fingerprint válido (isomorfismo inverso)', parsed.every(p => p.valid));
  ok('la URL es /pulse/<id>.m3u8', urls.every(u => /\/pulse\/\d+\.m3u8\?/.test(u)), urls[0]);
  ok('modo cartridge declarado en la URL', urls.every(u => /[?&]m=cartridge/.test(u)));
  ok('el perfil viaja en la URL y coincide con la clase',
    parsed[0].state.profile === 'P3' && parsed[1].state.profile === 'P0' && parsed[2].state.profile === 'P3' && parsed[3].state.profile === 'P5',
    parsed.map(p => p.state.profile).join(','));
}

// IDEMPOTENTE: misma entrada -> misma salida; y no doble-envuelve
{
  const b = run(path.join(tmp, 'b.m3u8'));
  ok('misma entrada ⇒ mismo sha256', a.sha256 === b.sha256, a.sha256 + ' vs ' + b.sha256);
  const c = JSON.parse(execFileSync(process.execPath, [WRAP, '--in', path.join(tmp, 'a.m3u8'), '--out', path.join(tmp, 'c.m3u8'), '--mode', 'cartridge'], {
    env: { ...process.env, APE_URL_BUILDER: BUILDER }, encoding: 'utf8',
  }).trim());
  ok('re-envolver una lista ya envuelta NO duplica', c.already === 4 && c.wrapped === 0, JSON.stringify(c));
  ok('salida de re-envolver == salida original', c.sha256 === a.sha256);
}

console.log(`\n== RESULTADO: ${pass} PASS · ${fail} FAIL ==`);
if (fail) { console.log('Fallos:'); fallos.forEach(f => console.log('  - ' + f)); }
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { }
process.exit(fail ? 1 : 0);


