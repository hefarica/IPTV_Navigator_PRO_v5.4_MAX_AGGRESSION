#!/usr/bin/env node
/**
 * Test de variant_select.js — protege la seleccion de la mejor variante real.
 *
 * La trampa que este test existe para impedir: ordenar por BANDWIDTH pondria el 720p
 * a 9 Mbps antes que el 1080p a 5 Mbps. Eso es degradar con la excusa de un numero
 * mas alto. La resolucion manda (Ley Anti-Degradacion).
 *
 * Uso: node tools/quality/test_variant_select.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { reorderMaster, codecRank, area } = require(path.join(__dirname, '..', 'vps', 'variant_select.js'));

let pass = 0, fail = 0;
const fallos = [];
function ok(nombre, cond, detalle) {
  if (cond) pass++;
  else { fail++; fallos.push(nombre + (detalle ? ' :: ' + detalle : '')); }
}

const FIX = path.join(__dirname, '..', '..', '_vps_stage', 'fixtures');
function fixture(n) {
  try { return fs.readFileSync(path.join(FIX, n), 'utf8'); } catch { return null; }
}

// helper: contar bloques STREAM-INF
const cuentaStreamInf = s => (s.match(/#EXT-X-STREAM-INF:/g) || []).length;
// helper: extraer solo las lineas STREAM-INF (sin reordenar) para comparar conjuntos
const lineasInf = s => s.split(/\r?\n/).filter(l => l.startsWith('#EXT-X-STREAM-INF:'));

// ---------------------------------------------------------------- 1 · la trampa del bitrate
{
  const body = fixture('selftest_master.m3u8');
  ok('fixture selftest_master.m3u8 existe', !!body);
  if (body) {
    const r = reorderMaster(body);
    const infs = lineasInf(r.body);
    ok('1080p queda PRIMERO aunque el 720p declare mas bitrate',
       /RESOLUTION=1920x1080/.test(infs[0]), infs[0]);
    ok('el 720p de 9 Mbps NO sube al primer puesto',
       !/RESOLUTION=1280x720/.test(infs[0]));
    ok('no se pierde ninguna variante', cuentaStreamInf(r.body) === cuentaStreamInf(body));
    ok('los atributos no cambian: mismo conjunto de lineas STREAM-INF',
       JSON.stringify(infs.slice().sort()) === JSON.stringify(lineasInf(body).slice().sort()));
  }
}

// ---------------------------------------------------------------- 2 · orden invertido se corrige
{
  const body = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360',
    'a/360.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=3840x2160',
    'b/2160.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720',
    'c/720.m3u8',
  ].join('\n');
  const r = reorderMaster(body);
  const infs = lineasInf(r.body);
  ok('orden invertido -> 4K primero', /3840x2160/.test(infs[0]));
  ok('orden invertido -> 720p segundo', /1280x720/.test(infs[1]));
  ok('orden invertido -> 360p ultimo', /640x360/.test(infs[2]));
  ok('changed=true cuando reordena de verdad', r.changed === true);
  ok('reason=reordered', r.reason === 'reordered');
}

// ---------------------------------------------------------------- 3 · idempotencia
{
  const body = fixture('selftest_master4k.m3u8');
  if (body) {
    const uno = reorderMaster(body);
    const dos = reorderMaster(uno.body);
    ok('segunda pasada no cambia el cuerpo', dos.body === uno.body);
    ok('segunda pasada changed=false', dos.changed === false);
    ok('segunda pasada reason=already_ordered', dos.reason === 'already_ordered');
    ok('4K queda primero', /RESOLUTION=3840x2160/.test(lineasInf(uno.body)[0]));
  }
}

// ---------------------------------------------------------------- 4 · codec desempata a igual resolucion
{
  const body = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"',
    'h264/1080.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="hvc1.2.4.L123.B0,mp4a.40.2"',
    'hevc/1080.m3u8',
  ].join('\n');
  const r = reorderMaster(body);
  const infs = lineasInf(r.body);
  ok('a igual resolucion gana HEVC aunque el H264 tenga mas bitrate',
     /hvc1\./.test(infs[0]), infs[0]);
}

// ---------------------------------------------------------------- 5 · resolucion GANA al codec
{
  const body = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1280x720,CODECS="hvc1.1.6.L120.B0"',
    'hevc/720.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=1920x1080,CODECS="avc1.640028"',
    'h264/1080.m3u8',
  ].join('\n');
  const r = reorderMaster(body);
  ok('1080p AVC va antes que 720p HEVC: la resolucion manda',
     /1920x1080/.test(lineasInf(r.body)[0]));
}

// ---------------------------------------------------------------- 6 · passthrough honesto
{
  const mixed = fixture('selftest.m3u8');
  if (mixed) {
    const r = reorderMaster(mixed);
    ok('master mezclado con EXTINF -> passthrough', r.changed === false);
    ok('reason=mixed_master_and_media', r.reason === 'mixed_master_and_media', r.reason);
    ok('el cuerpo se devuelve INTACTO', r.body === mixed);
  }

  const soloMedia = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg1.ts\n';
  const r2 = reorderMaster(soloMedia);
  ok('playlist de segmentos -> passthrough no_stream_inf', r2.reason === 'no_stream_inf');
  ok('cuerpo intacto en passthrough', r2.body === soloMedia);

  const vacio = reorderMaster('');
  ok('cuerpo vacio -> passthrough empty_body', vacio.reason === 'empty_body');

  const basura = 'no soy un manifiesto';
  const r4 = reorderMaster(basura);
  ok('texto sin EXTM3U -> passthrough', r4.reason === 'no_extm3u');
  ok('cuerpo intacto', r4.body === basura);

  const uno = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=640x360\nx.m3u8\n';
  const r5 = reorderMaster(uno);
  ok('una sola variante -> passthrough less_than_two_variants',
     r5.reason === 'less_than_two_variants', r5.reason);
}

// ---------------------------------------------------------------- 7 · atributos y URLs intactos
{
  const body = [
    '#EXTM3U',
    '#EXT-X-VERSION:6',
    '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100,URI="iframes.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0",VIDEO-RANGE=PQ',
    'https://proveedor.example/2160/index.m3u8?token=abc',
    '#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=1920x1080,CODECS="hvc1.1.6.L123.B0"',
    'https://proveedor.example/1080/index.m3u8?token=abc',
  ].join('\n');
  const r = reorderMaster(body);
  ok('la URL con query se preserva byte a byte',
     r.body.includes('https://proveedor.example/2160/index.m3u8?token=abc') &&
     r.body.includes('https://proveedor.example/1080/index.m3u8?token=abc'));
  ok('VIDEO-RANGE=PQ se conserva', r.body.includes('VIDEO-RANGE=PQ'));
  ok('#EXT-X-I-FRAME-STREAM-INF se conserva', r.body.includes('#EXT-X-I-FRAME-STREAM-INF'));
  ok('#EXT-X-VERSION se conserva', r.body.includes('#EXT-X-VERSION:6'));
  ok('el total de lineas no cambia',
     r.body.split('\n').length === body.split('\n').length);
}

// ---------------------------------------------------------------- 8 · primitivas
{
  ok('area(3840x2160) = 8294400', area('3840x2160') === 8294400);
  ok('area(null) = 0', area(null) === 0);
  ok('area(basura) = 0', area('4K') === 0);
  ok('codecRank HEVC > AVC', codecRank('hvc1.2.4.L153.B0') > codecRank('avc1.640028'));
  ok('codecRank DV > HEVC', codecRank('dvh1.08.06') > codecRank('hvc1.2.4.L153.B0'));
  ok('codecRank AV1 entre HEVC y AVC',
     codecRank('av01.0.10M.10') > codecRank('avc1.640028') &&
     codecRank('av01.0.10M.10') < codecRank('hvc1.2.4.L153.B0'));
  ok('codecRank con audio detras usa el mejor de video',
     codecRank('avc1.640028,mp4a.40.2') === codecRank('avc1.640028'));
}

// ---------------------------------------------------------------- resumen
console.log('');
console.log(pass + '/' + (pass + fail) + ' PASS');
if (fail > 0) {
  console.log('FALLOS:');
  fallos.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
process.exit(0);
