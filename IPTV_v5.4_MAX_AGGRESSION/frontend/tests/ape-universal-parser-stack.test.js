/**
 * tests/ape-universal-parser-stack.test.js
 *
 * Regresión del orquestador de 26 parsers. No carga los módulos hijos: prueba
 * la clasificación de entrada y las guardas de dependencias del stack, que es
 * donde vive el cambio 2026-11-25 (detectType por línea, mixed_m3u y errores
 * explícitos en vez de silencio).
 */
'use strict';

const path = require('path');
const assert = require('assert');
const STACK = require(path.join(__dirname, '..', 'js', 'ape-v9', 'parsers', 'ape-universal-parser-stack.js'));

let pass = 0;
function ok(name, cond, detail) {
  if (!cond) throw new Error(name + (detail ? ' → ' + detail : ''));
  pass++;
  console.log('PASS ' + name);
}

const flat = [
  '#EXTM3U x-tvg-url="https://epg.invalid/epg.xml"',
  '#EXTINF:-1 tvg-id="c1" tvg-name="Canal" group-title="Pruebas",Canal',
  'http://provider.invalid/live/u/p/1.m3u8',
  '#EXTINF:-1 tvg-id="c2" tvg-name="Otro" group-title="Pruebas",Otro',
  'http://provider.invalid/live/u/p/2.m3u8',
].join('\n');

const flatWithComment = [
  '#EXTM3U',
  '# NOTA: esto no es un master; menciona #EXT-X-STREAM-INF en un comentario',
  '#EXTINF:-1 tvg-id="c1",Canal',
  'http://provider.invalid/live/u/p/1.m3u8',
].join('\n');

const master = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="hvc1.2.4.L120.B0"',
  'chunklist_1080.m3u8',
].join('\n');

const media = [
  '#EXTM3U',
  '#EXT-X-TARGETDURATION:4',
  '#EXT-X-MEDIA-SEQUENCE:10',
  '#EXTINF:4.0,',
  'seg_00010.ts',
  '#EXT-X-ENDLIST',
].join('\n');

const mixed = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=8000000',
  'chunklist.m3u8',
  '#EXTINF:-1 tvg-id="c1",Canal',
  'http://provider.invalid/live/u/p/1.m3u8',
].join('\n');

ok('versión del stack', STACK.version === '1.0.0');
ok('flat M3U sigue siendo flat_m3u', STACK.parseAny(flat).type === 'flat_m3u');
ok('comentario con #EXT-X-STREAM-INF NO convierte en master',
  STACK.parseAny(flatWithComment).type === 'flat_m3u');
ok('master detectado como hls_master', STACK.parseAny(master).type === 'hls_master');
ok('media detectado como hls_media', STACK.parseAny(media).type === 'hls_media');
ok('mezcla master + catálogo se rechaza como mixed_m3u',
  STACK.parseAny(mixed).type === 'mixed_m3u');

const mixedResult = STACK.parseAny(mixed);
ok('mixed_m3u no devuelve canonical', mixedResult.canonical === null);
ok('mixed_m3u reporta MIXED_PLAYLIST_TYPES',
  Array.isArray(mixedResult.errors) && mixedResult.errors.indexOf('MIXED_PLAYLIST_TYPES') >= 0);

const masterOnly = STACK.parseAny(master);
ok('sin dependencias, master no finge canonical',
  masterOnly.canonical === null && masterOnly.errors.indexOf('PARSER_DEPENDENCY_MISSING') >= 0);
const mediaOnly = STACK.parseAny(media);
ok('sin dependencias, media no finge canonical',
  mediaOnly.canonical === null && mediaOnly.errors.indexOf('PARSER_DEPENDENCY_MISSING') >= 0);

ok('entrada nula no explota', STACK.parseAny(null).type === 'unknown');
ok('reset de auditoría devuelve contadores a cero',
  STACK.resetParserAuditSummary().parserErrors === 0);

console.log('OK — ' + pass + ' parser-stack checks');
