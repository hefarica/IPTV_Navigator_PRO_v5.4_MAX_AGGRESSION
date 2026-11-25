#!/usr/bin/env node
'use strict';
/* Prueba del parser de proyección: el original NO cambia; la copia queda tipo catálogo. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const TOOL = path.join(__dirname, '..', '..', '..', 'tools', 'pulse', 'catalog-projection.cjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-projection-'));
const input = path.join(TMP, 'mixed.m3u8');
const output = path.join(TMP, 'catalog.m3u8');
const source = [
  '#EXTM3U x-tvg-url="https://epg.invalid/epg.xml"',
  '#EXT-X-TARGETDURATION:2',
  '#EXT-X-STREAM-INF:BANDWIDTH=40000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0"',
  '#EXT-X-APE-UNIVERSAL:DIALECTS=12;TAGS=KEPT',
  '#EXTINF:-1 tvg-id="c1" group-title="T",Canal Uno',
  '#EXTHTTP:{"User-Agent":"VLC/3.0"}',
  '#EXT-X-APE-PROFILE:P1',
  '#EXT-X-APE-HYBRID-PULSE:ROUTE=max;P=P1',
  'https://iptv-ape.duckdns.org/pulse/1.m3u8?u=https%3A%2F%2Fprovider.invalid%2F1.m3u8&d=x&p=P1&m=proxy',
  '#EXT-X-I-FRAME-STREAM-INF:URI="iframes.m3u8",BANDWIDTH=1000',
  '#EXTINF:-1 tvg-id="c2" group-title="T",Canal Dos',
  '#EXT-X-APE-PROFILE:P1',
  'https://iptv-ape.duckdns.org/pulse/2.m3u8?u=https%3A%2F%2Fprovider.invalid%2F2.m3u8&d=x&p=P1&m=proxy',
  '#EXT-X-SESSION-DATA:DATA-ID="x",VALUE="y"',
  '',
].join('\n');
fs.writeFileSync(input, source, 'utf8');
const before = crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');
execFileSync(process.execPath, [TOOL, '--in', input, '--out', output, '--quiet'], { encoding: 'utf8' });
const after = crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');
const projected = fs.readFileSync(output, 'utf8');
const excluded = fs.readFileSync(output + '.excluded', 'utf8');
const stats = JSON.parse(fs.readFileSync(output + '.stats.json', 'utf8'));

const assert = require('assert');
assert.strictEqual(before, after, 'la entrada no debe cambiar');
assert.ok(projected.startsWith('#EXTM3U'), 'la salida debe ser catálogo');
assert.ok(projected.includes('#EXTINF:-1 tvg-id="c1"'), 'conserva EXTINF 1');
assert.ok(projected.includes('#EXTINF:-1 tvg-id="c2"'), 'conserva EXTINF 2');
assert.ok(projected.includes('#EXT-X-APE-UNIVERSAL'), 'conserva tags APE universal');
assert.ok(projected.includes('#EXT-X-APE-PROFILE'), 'conserva tags APE perfil');
assert.ok(projected.includes('#EXTHTTP:'), 'conserva EXTHTTP');
assert.strictEqual((projected.match(/^https?:\/\//gm) || []).length, 2, 'conserva 2 URLs');
assert.ok(!/^#EXT-X-(?:STREAM-INF|TARGETDURATION|I-FRAME-STREAM-INF|SESSION-DATA)/m.test(projected), 'no emite tipo master/media');
assert.ok(excluded.includes('#EXT-X-STREAM-INF'), 'sidecar conserva la línea excluida');
assert.ok(excluded.includes('#EXT-X-TARGETDURATION'), 'sidecar conserva targetduration');
assert.strictEqual(stats.excluded, 4, 'sidecar debe tener 4 líneas');
console.log('PASS proyección: original intacto, copia catálogo y sidecar completo');

