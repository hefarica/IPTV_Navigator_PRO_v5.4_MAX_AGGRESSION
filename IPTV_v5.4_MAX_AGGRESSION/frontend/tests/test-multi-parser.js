global.__apeHasUnzip = function () { try { require('child_process').execFileSync('unzip', ['-v'], { stdio: 'ignore' }); return true; } catch (e) { return false; } };
'use strict';

/**
 * test-multi-parser.js
 *
 * Suite del APE MultiParser v1.0:
 *   - Parseo sin pérdida de listas planas, HLS master y HLS media.
 *   - Dialectos por player (VLC, Kodi, TiviMate, OTT, Smarters, ExoPlayer,
 *     Apple, ffmpeg, mpv, hls.js, genérico, universal).
 *   - Saneamiento de cabeceras tóxicas.
 *   - Idempotencia y round-trip.
 *   - Cuarentena de bloques inválidos.
 *   - ZIP con manifiesto, reporte y sidecars.
 *
 * Uso:
 *   node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/test-multi-parser.js
 *
 * Todas las listas de esta suite son sintéticas (example.com). No contienen
 * listas privadas, tokens ni credenciales reales.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MP = require('../js/ape-v9/ape-multi-parser.js');

let passed = 0;
let failed = 0;

function assert(condition, message, extra) {
    if (condition) {
        passed++;
        console.log('  PASS  ' + message);
    } else {
        failed++;
        console.error('  FAIL  ' + message + (extra ? '   [' + extra + ']' : ''));
    }
}

function assertEqual(actual, expected, message) {
    assert(actual === expected, message, 'esperado=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
}

function assertIncludes(haystack, needle, message) {
    assert(String(haystack).indexOf(needle) !== -1, message, 'no contiene ' + JSON.stringify(needle));
}

function assertNotIncludes(haystack, needle, message) {
    assert(String(haystack).indexOf(needle) === -1, message, 'contiene ' + JSON.stringify(needle));
}

// ───────────────────────────────────────────────────────────────────────────
// FIXTURES SINTÉTICOS
// ───────────────────────────────────────────────────────────────────────────

const FLAT = '\uFEFF#EXTM3U x-tvg-url="http://example.com/epg.xml" url-tvg="http://example.com/epg2.xml"\r\n' +
    '#EXTINF:-1 tvg-id="c1" tvg-name="Canal, Uno" tvg-logo="http://example.com/logo1.png" group-title="Noticias",Canal, Uno\r\n' +
    '#EXTGRP:Noticias\r\n' +
    '#EXTVLCOPT:network-caching=3000\r\n' +
    '#EXTVLCOPT:http-user-agent=TestUA\r\n' +
    '#EXTVLCOPT:http-header=Referer: http://example.com/\r\n' +
    '#EXTVLCOPT:http-header=Range: bytes=0-1\r\n' +
    '#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=TestUA&Referer=http%3A%2F%2Fexample.com%2F&Range=bytes%3D0-1\r\n' +
    '#EXTHTTP:{"headers":{"User-Agent":"TestUA","Range":"bytes=0-1","If-None-Match":"abc"}}\r\n' +
    '#EXT-X-APE-PROFILE:P1\r\n' +
    '#EXT-X-APE-CONNECTION-BUDGET:1\r\n' +
    '#FOO:bar\r\n' +
    'http://example.com/live/u/p/1.m3u8\r\n' +
    '#EXTINF:-1 tvg-id="c2" tvg-name="Canal Dos" group-title="Deportes",Canal Dos\r\n' +
    'http://example.com/live/u/p/2.m3u8\r\n' +
    '#EXTINF:-1 tvg-id="c3" tvg-name="Canal Sin URL" group-title="Rotos",Canal Sin URL\r\n' +
    '#EXTINF:-1 tvg-id="c4" tvg-name="Canal Cuatro" group-title="Música",Canal Cuatro\r\n' +
    '#EXTVLCOPT:http-user-agent=OtroUA\r\n' +
    'http://example.com/live/u/p/4.m3u8\r\n' +
    '#TAIL:1\r\n';

const HLS_MASTER = '#EXTM3U\n' +
    '#EXT-X-VERSION:6\n' +
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Español",LANGUAGE="es",DEFAULT=YES,URI="audio.m3u8"\n' +
    '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ\n' +
    '#EXTVLCOPT:http-user-agent=TestUA\n' +
    'video.m3u8\n' +
    '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080,CODECS="avc1.4d401f,mp4a.40.2"\n' +
    'video-1080.m3u8\n' +
    '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1000000,URI="iframe.m3u8"\n';

const HLS_MEDIA = '#EXTM3U\n' +
    '#EXT-X-VERSION:7\n' +
    '#EXT-X-TARGETDURATION:6\n' +
    '#EXT-X-MEDIA-SEQUENCE:10\n' +
    '#EXT-X-MAP:URI="init.mp4"\n' +
    '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n' +
    '#EXTVLCOPT:http-user-agent=TestUA\n' +
    '#EXTINF:6.0,\n' +
    'seg1.m4s\n' +
    '#EXTINF:6.0,\n' +
    'seg2.m4s\n' +
    '#EXT-X-ENDLIST\n';

// ───────────────────────────────────────────────────────────────────────────
// 1 · PARSEO PLANO
// ───────────────────────────────────────────────────────────────────────────

function testFlatParse() {
    console.log('\n── 1 · Parseo plano sin pérdida ──────────────────────────────');
    const m = MP.parse(FLAT, { sourceName: 'fixture-flat' });

    assertEqual(m.kind, 'flat', 'tipo detectado: flat');
    assertEqual(m.channels.length, 3, '3 canales con URL');
    assertEqual(m.quarantine.length, 1, '1 canal sin URL en cuarentena');
    assertEqual(m.channels[0].meta.name, 'Canal, Uno', 'nombre con coma preservado');
    assertEqual(m.channels[0].meta.group, 'Noticias', 'grupo preservado');
    assertEqual(m.channels[0].meta.logo, 'http://example.com/logo1.png', 'logo preservado');
    assertEqual(m.channels[0].extinf.attrs['tvg-name'], 'Canal, Uno', 'atributo con coma preservado');
    assertEqual(m.channels[0].safeHeaders['User-Agent'], 'TestUA', 'User-Agent extraído');
    assertEqual(m.channels[0].safeHeaders['Referer'], 'http://example.com/', 'Referer extraído');
    assert(!m.channels[0].safeHeaders['Range'], 'Range eliminado de safeHeaders');
    assert(!m.channels[0].safeHeaders['If-None-Match'], 'If-None-Match eliminado');
    assert(m.stats.tags.vlc >= 4, 'tags EXTVLCOPT contados');
    assert(m.stats.tags.kodi >= 1, 'tags KODIPROP contados');
    assert(m.stats.tags.http >= 1, 'tags EXTHTTP contados');
    assert(m.stats.tags.ape >= 2, 'tags APE contados');
    assert(m.stats.unknownTags.indexOf('#FOO') !== -1, 'tag desconocido #FOO preservado en inventario');
    assertEqual(m.trailing.length, 1, 'tag final preservado en model.trailing');
    assertEqual(m.header.attrs['x-tvg-url'], 'http://example.com/epg.xml', 'atributo de cabecera EPG');
}

// ───────────────────────────────────────────────────────────────────────────
// 2 · DIALECTOS
// ───────────────────────────────────────────────────────────────────────────

function testDialects() {
    console.log('\n── 2 · Dialectos por player ──────────────────────────────────');
    const m = MP.parse(FLAT);

    const universal = MP.render(m, 'universal');
    assertIncludes(universal, '#EXTVLCOPT:network-caching=3000', 'universal conserva EXTVLCOPT');
    assertIncludes(universal, '#KODIPROP:', 'universal conserva KODIPROP');
    assertIncludes(universal, '#EXT-X-APE-PROFILE:P1', 'universal conserva APE');
    assertIncludes(universal, '#FOO:bar', 'universal conserva tag desconocido');
    assertIncludes(universal, '#TAIL:1', 'universal conserva tag final');
    assertNotIncludes(universal, 'Range', 'universal elimina Range');
    assertNotIncludes(universal, 'If-None-Match', 'universal elimina If-None-Match');

    const vlc = MP.render(m, 'vlc');
    assertIncludes(vlc, '#EXTVLCOPT:http-user-agent=TestUA', 'VLC usa http-user-agent');
    assertIncludes(vlc, '#EXTVLCOPT:http-referrer=http://example.com/', 'VLC usa http-referrer');
    assertIncludes(vlc, '#EXTVLCOPT:network-caching=3000', 'VLC conserva caching');
    assertNotIncludes(vlc, '#KODIPROP', 'VLC no emite KODIPROP');
    assertNotIncludes(vlc, '#EXTHTTP', 'VLC no emite EXTHTTP');
    assertNotIncludes(vlc, '#EXT-X-APE', 'VLC no emite APE');
    assertNotIncludes(vlc, '#FOO', 'VLC no emite tags desconocidos');

    const kodi = MP.render(m, 'kodi');
    assertIncludes(kodi, '#KODIPROP:inputstream.adaptive.stream_headers=', 'Kodi usa stream_headers');
    assertIncludes(kodi, 'User-Agent=TestUA', 'Kodi incluye User-Agent');
    assertNotIncludes(kodi, '#EXTVLCOPT', 'Kodi no emite EXTVLCOPT');
    assertNotIncludes(kodi, '#EXTHTTP', 'Kodi no emite EXTHTTP');
    assertNotIncludes(kodi, '#EXT-X-APE', 'Kodi no emite APE');

    const tivimate = MP.render(m, 'tivimate');
    assertIncludes(tivimate, '#EXTHTTP:', 'TiviMate usa EXTHTTP');
    assertIncludes(tivimate, '#EXTVLCOPT:http-user-agent=TestUA', 'TiviMate usa EXTVLCOPT UA');
    assertNotIncludes(tivimate, '#KODIPROP', 'TiviMate no emite KODIPROP');

    const ott = MP.render(m, 'ott');
    assertIncludes(ott, '#EXTHTTP:', 'OTT Navigator usa EXTHTTP');
    assertNotIncludes(ott, '#KODIPROP', 'OTT Navigator no emite KODIPROP');

    const smarters = MP.render(m, 'smarters');
    assertIncludes(smarters, '#EXTHTTP:', 'Smarters usa EXTHTTP');
    assertNotIncludes(smarters, '#KODIPROP', 'Smarters no emite KODIPROP');

    const exo = MP.render(m, 'exoplayer');
    assertIncludes(exo, '#EXTHTTP:', 'ExoPlayer usa EXTHTTP');
    assertNotIncludes(exo, '#EXTVLCOPT', 'ExoPlayer no emite EXTVLCOPT');
    assertNotIncludes(exo, '#KODIPROP', 'ExoPlayer no emite KODIPROP');
    assertNotIncludes(exo, '#EXT-X-APE', 'ExoPlayer no emite APE');

    const apple = MP.render(m, 'apple');
    const appleLines = apple.trim().split('\n');
    const appleBad = appleLines.filter(function (l) {
        return l && l.charAt(0) === '#' && l.indexOf('#EXTM3U') !== 0 && l.indexOf('#EXTINF') !== 0;
    });
    assertEqual(appleBad.length, 0, 'Apple solo emite EXTM3U/EXTINF');
    assertNotIncludes(apple, 'tvg-id=', 'Apple no emite atributos');

    const ffmpeg = MP.render(m, 'ffmpeg');
    const ffBad = ffmpeg.trim().split('\n').filter(function (l) {
        return l && l.charAt(0) === '#' && l.indexOf('#EXTM3U') !== 0 && l.indexOf('#EXTINF') !== 0;
    });
    assertEqual(ffBad.length, 0, 'ffmpeg solo emite EXTM3U/EXTINF');

    const mpv = MP.render(m, 'mpv');
    assertIncludes(mpv, '#EXTVLCOPT:http-user-agent=TestUA', 'mpv usa EXTVLCOPT UA');

    const hlsjs = MP.render(m, 'hlsjs');
    assertNotIncludes(hlsjs, '#EXTVLCOPT', 'hls.js no emite EXTVLCOPT');
    assertNotIncludes(hlsjs, '#EXTHTTP', 'hls.js no emite EXTHTTP');

    const generic = MP.render(m, 'generic');
    assertIncludes(generic, '#EXTHTTP:', 'genérico usa EXTHTTP');
    assertIncludes(generic, '#EXTVLCOPT:http-user-agent=TestUA', 'genérico usa EXTVLCOPT UA');
}

// ───────────────────────────────────────────────────────────────────────────
// 3 · CABECERAS TÓXICAS
// ───────────────────────────────────────────────────────────────────────────

function testToxicHeaders() {
    console.log('\n── 3 · Cero cabeceras tóxicas en todos los dialectos ─────────');
    const m = MP.parse(FLAT);
    const toxic = ['If-None-Match', 'If-Modified-Since', 'Upgrade-Insecure-Requests', 'Priority', 'Range: bytes'];
    const dialects = MP.getDialectList().map(function (d) { return d.id; });

    dialects.forEach(function (id) {
        const out = MP.render(m, id);
        toxic.forEach(function (t) {
            assertNotIncludes(out, t, id + ' sin ' + t);
        });
    });
}

// ───────────────────────────────────────────────────────────────────────────
// 4 · ROUND-TRIP E IDEMPOTENCIA
// ───────────────────────────────────────────────────────────────────────────

function testRoundTrip() {
    console.log('\n── 4 · Round-trip e idempotencia ─────────────────────────────');
    const a = MP.parse(FLAT);
    const text = MP.render(a, 'universal');
    const b = MP.parse(text);

    assertEqual(b.kind, 'flat', 'round-trip conserva tipo flat');
    assertEqual(b.channels.length, a.channels.length, 'round-trip conserva número de canales');
    assertEqual(b.channels[0].url, a.channels[0].url, 'round-trip conserva URL');
    assertEqual(b.channels[0].safeHeaders['User-Agent'], a.channels[0].safeHeaders['User-Agent'], 'round-trip conserva User-Agent');
    assertEqual(b.stats.tags.kodi, a.stats.tags.kodi, 'round-trip conserva KODIPROP');
    // El único EXTVLCOPT que desaparece es el tóxico `http-header=Range`,
    // eliminado por diseño. Los demás deben sobrevivir.
    assert(b.stats.tags.vlc >= a.stats.tags.vlc - 1, 'round-trip conserva EXTVLCOPT no tóxicos');
    assertIncludes(text, '#EXTVLCOPT:network-caching=3000', 'round-trip conserva caching');
    assertIncludes(text, '#EXTVLCOPT:http-user-agent=TestUA', 'round-trip conserva User-Agent');
    assertEqual(b.stats.tags.ape, a.stats.tags.ape, 'round-trip conserva APE');
    assertEqual(b.stats.unknownTags.length, a.stats.unknownTags.length, 'round-trip conserva tags desconocidos');

    const stable = MP.render(b, 'universal');
    assertEqual(stable, text, 'render universal es idempotente');

    const vlcA = MP.render(a, 'vlc');
    const vlcB = MP.render(MP.parse(vlcA), 'vlc');
    assertEqual(vlcB, vlcA, 'render VLC es idempotente');

    const kodiA = MP.render(a, 'kodi');
    const kodiB = MP.render(MP.parse(kodiA), 'kodi');
    assertEqual(kodiB, kodiA, 'render Kodi es idempotente');
}

// ───────────────────────────────────────────────────────────────────────────
// 5 · HLS MASTER
// ───────────────────────────────────────────────────────────────────────────

function testHlsMaster() {
    console.log('\n── 5 · HLS master ────────────────────────────────────────────');
    const m = MP.parse(HLS_MASTER);

    assertEqual(m.kind, 'hls_master', 'tipo master');
    assertEqual(m.hls.variants.length, 3, '3 variantes (2 stream-inf + 1 iframe)');
    assertEqual(m.hls.media.length, 1, '1 rendition de audio');
    assertEqual(m.channels.length, 0, 'master no inventa canales');

    const apple = MP.render(m, 'apple');
    assertNotIncludes(apple, '#EXTVLCOPT', 'Apple elimina EXTVLCOPT del master');
    assertIncludes(apple, '#EXT-X-STREAM-INF', 'Apple conserva STREAM-INF');
    assertIncludes(apple, '#EXT-X-MEDIA', 'Apple conserva MEDIA');

    const vlc = MP.render(m, 'vlc');
    assertIncludes(vlc, '#EXTVLCOPT:http-user-agent=TestUA', 'VLC conserva EXTVLCOPT del master');

    const universal = MP.render(m, 'universal');
    assertIncludes(universal, '#EXT-X-I-FRAME-STREAM-INF', 'universal conserva I-FRAME');
}

// ───────────────────────────────────────────────────────────────────────────
// 6 · HLS MEDIA
// ───────────────────────────────────────────────────────────────────────────

function testHlsMedia() {
    console.log('\n── 6 · HLS media ─────────────────────────────────────────────');
    const m = MP.parse(HLS_MEDIA);

    assertEqual(m.kind, 'hls_media', 'tipo media');
    assertEqual(m.hls.targetDuration, 6, 'TARGETDURATION');
    assertEqual(m.hls.segments.length, 2, '2 segmentos');
    assertEqual(m.hls.keys.length, 1, '1 clave');
    assertEqual(m.hls.maps.length, 1, '1 init map');
    assertEqual(m.hls.container, 'FMP4_CMAF', 'contenedor FMP4/CMAF');
    assertEqual(m.hls.endList, true, 'ENDLIST detectado');

    const apple = MP.render(m, 'apple');
    assertNotIncludes(apple, '#EXTVLCOPT', 'Apple elimina EXTVLCOPT de media');
    assertIncludes(apple, '#EXT-X-MAP', 'Apple conserva MAP');
    assertIncludes(apple, '#EXT-X-KEY', 'Apple conserva KEY');

    const vlc = MP.render(m, 'vlc');
    assertIncludes(vlc, '#EXTVLCOPT:http-user-agent=TestUA', 'VLC conserva EXTVLCOPT de media');
}

// ───────────────────────────────────────────────────────────────────────────
// 7 · CUARENTENA
// ───────────────────────────────────────────────────────────────────────────

function testQuarantine() {
    console.log('\n── 7 · Cuarentena ────────────────────────────────────────────');
    const text = '#EXTM3U\n' +
        '#EXTINF:-1,Canal roto\n' +
        '#EXTINF:-1,Canal bueno\n' +
        'http://example.com/live/u/p/1.m3u8\n' +
        'http://example.com/live/u/p/orphan.m3u8\n';

    const m = MP.parse(text);
    assertEqual(m.channels.length, 1, 'solo canal con URL');
    assert(m.quarantine.length >= 2, 'cuarentena registra EXTINF sin URL y URI huérfana');
    assertEqual(m.channels[0].meta.name, 'Canal bueno', 'canal bueno preservado');

    const rendered = MP.render(m, 'universal');
    assertNotIncludes(rendered, 'Canal roto', 'canal roto no se emite');
    assertIncludes(rendered, 'Canal bueno', 'canal bueno se emite');
}

// ───────────────────────────────────────────────────────────────────────────
// 7b · DIAGNÓSTICO DE ANOMALÍAS TEMPORALES
// ───────────────────────────────────────────────────────────────────────────

function testDiagnose() {
    console.log('\n── 7b · Diagnóstico c2.a / 403 / EXT-X-ERROR ─────────────────');
    const text = '#EXTM3U\n' +
        '#EXT-X-ERROR:c2.a\n' +
        '#EXTINF:-1,Canal c2.a\n' +
        'http://example.com/live/u/p/403.m3u8\n' +
        '#EXTINF:-1,Canal roto\n';

    const m = MP.parse(text);
    const d = MP.diagnose(m);

    assert(d.c2a.length >= 2, 'detecta c2.a en tag y nombre');
    assert(d.http403.length >= 1, 'detecta 403 en URI');
    assert(d.extXError.length >= 1, 'detecta EXT-X-ERROR');
    assert(d.missingUrl >= 1, 'detecta bloque sin URL');

    const bundle = MP.renderBundle(m);
    assertEqual(bundle.report.anomalies.c2aCount, d.c2a.length, 'reporte incluye conteo c2.a');
    assertEqual(bundle.report.anomalies.http403Count, d.http403.length, 'reporte incluye conteo 403');
    assertEqual(bundle.report.anomalies.extXErrorCount, d.extXError.length, 'reporte incluye conteo EXT-X-ERROR');
    assertNotIncludes(JSON.stringify(bundle.report), 'example.com', 'reporte de anomalías sin URLs');
}

// ───────────────────────────────────────────────────────────────────────────
// 7c · CABECERAS APE NATIVAS
// ───────────────────────────────────────────────────────────────────────────

function testApeHttpHeaders() {
    console.log('\n── 7c · EXT-X-APE-HTTP-HEADERS ───────────────────────────────');
    const text = '#EXTM3U\n' +
        '#EXTINF:-1,Canal APE\n' +
        '#EXT-X-APE-HTTP-HEADERS:{"User-Agent":"ApeUA","TE":"trailers"}\n' +
        '#EXT-X-APE-OVERFLOW-HEADERS:eyJYLU92ZXJmbG93IjoiWWVzIiwiVEUiOiJ0cmFpbGVycyJ9\n' +
        'http://example.com/live/u/p/1.m3u8\n';

    const m = MP.parse(text);
    assertEqual(m.channels.length, 1, '1 canal');
    assertEqual(m.channels[0].safeHeaders['User-Agent'], 'ApeUA', 'User-Agent desde APE HTTP HEADERS');
    assertEqual(m.channels[0].safeHeaders['X-Overflow'], 'Yes', 'cabecera desde APE OVERFLOW');
    assert(!m.channels[0].safeHeaders['TE'], 'TE eliminado');

    const vlc = MP.render(m, 'vlc');
    assertIncludes(vlc, '#EXTVLCOPT:http-user-agent=ApeUA', 'VLC traduce APE HTTP HEADERS');
    assertIncludes(vlc, '#EXTVLCOPT:http-header=X-Overflow: Yes', 'VLC traduce APE OVERFLOW');

    const kodi = MP.render(m, 'kodi');
    assertIncludes(kodi, 'User-Agent=ApeUA', 'Kodi traduce APE HTTP HEADERS');

    const universal = MP.render(m, 'universal');
    assertIncludes(universal, '#EXT-X-APE-HTTP-HEADERS:', 'universal conserva el tag APE');
    assertNotIncludes(universal, '"TE"', 'universal elimina TE del tag APE');
}

// ───────────────────────────────────────────────────────────────────────────
// 8 · LISTA GRANDE
// ───────────────────────────────────────────────────────────────────────────

function testLargeList() {
    console.log('\n── 8 · Lista grande (10.000 canales) ─────────────────────────');
    const parts = ['#EXTM3U'];
    for (let i = 0; i < 10000; i++) {
        parts.push('#EXTINF:-1 tvg-id="c' + i + '" tvg-name="Canal ' + i + '" group-title="G' + (i % 20) + '",Canal ' + i);
        parts.push('#EXTVLCOPT:http-user-agent=UA' + (i % 5));
        parts.push('http://example.com/live/u/p/' + i + '.m3u8');
    }
    const text = parts.join('\n');

    const t0 = Date.now();
    const m = MP.parse(text);
    const elapsed = Date.now() - t0;

    assertEqual(m.channels.length, 10000, '10.000 canales parseados');
    assert(elapsed < 5000, 'parseo de 10.000 canales < 5 s', elapsed + ' ms');

    const t1 = Date.now();
    const out = MP.render(m, 'vlc');
    const renderElapsed = Date.now() - t1;
    assert(out.split('\n').length > 20000, 'render VLC produce líneas');
    assert(renderElapsed < 5000, 'render de 10.000 canales < 5 s', renderElapsed + ' ms');
}

// ───────────────────────────────────────────────────────────────────────────
// 9 · ZIP
// ───────────────────────────────────────────────────────────────────────────

function testZip() {
    console.log('\n── 9 · ZIP, manifiesto y reporte ─────────────────────────────');
    const m = MP.parse(FLAT);
    const bundle = MP.buildBundleZip(m, { includeSidecars: true });

    assert(bundle.zip instanceof Uint8Array, 'ZIP es Uint8Array');
    assertEqual(bundle.zip[0], 0x50, 'firma ZIP P');
    assertEqual(bundle.zip[1], 0x4B, 'firma ZIP K');
    assert(bundle.files['universal.m3u8'], 'incluye universal.m3u8');
    assert(bundle.files['vlc.m3u8'], 'incluye vlc.m3u8');
    assert(bundle.files['kodi.m3u8'], 'incluye kodi.m3u8');
    assert(bundle.files['apple.m3u8'], 'incluye apple.m3u8');
    assert(bundle.files['manifest.json'], 'incluye manifest.json');
    assert(bundle.files['reports/multiparser-report.json'], 'incluye reporte');
    assert(bundle.files['README.txt'], 'incluye README');
    assert(bundle.files['capabilities.json'], 'incluye capabilities');

    const manifest = JSON.parse(bundle.files['manifest.json']);
    assert(manifest.files.length >= 10, 'manifiesto lista archivos');
    assert(manifest.channels === 3, 'manifiesto declara 3 canales');

    const tmp = path.join(os.tmpdir(), 'ape-multiparser-test-' + process.pid + '.zip');
    fs.writeFileSync(tmp, Buffer.from(bundle.zip));
    try {
        if (!global.__apeHasUnzip()) { console.log('  SKIP  unzip -t / unzip -l - NO COMPUTADO: binario unzip ausente en este host'); return; }
        const out = execFileSync('unzip', ['-t', tmp], { encoding: 'utf8' });
        assertIncludes(out, 'No errors detected', 'unzip -t sin errores');
        const listing = execFileSync('unzip', ['-l', tmp], { encoding: 'utf8' });
        assertIncludes(listing, 'universal.m3u8', 'unzip lista universal.m3u8');
        assertIncludes(listing, 'manifest.json', 'unzip lista manifest.json');
    } finally {
        try { fs.unlinkSync(tmp); } catch (e) { /* noop */ }
    }
}

// ───────────────────────────────────────────────────────────────────────────
// 10 · REPORTE SIN DATOS PRIVADOS
// ───────────────────────────────────────────────────────────────────────────

function testReportPrivacy() {
    console.log('\n── 10 · Reporte sin URLs ni credenciales ─────────────────────');
    const m = MP.parse(FLAT, { sourceName: 'ruta/privada/lista.m3u8' });
    const bundle = MP.renderBundle(m);
    const reportText = JSON.stringify(bundle.report);

    assertNotIncludes(reportText, 'http://', 'reporte sin http://');
    assertNotIncludes(reportText, 'https://', 'reporte sin https://');
    assertNotIncludes(reportText, 'example.com', 'reporte sin hosts');
    assertNotIncludes(reportText, 'TestUA', 'reporte sin User-Agent');
    assertNotIncludes(reportText, 'ruta/privada', 'reporte sin nombre de archivo privado');
    assertIncludes(reportText, 'unknownTags', 'reporte incluye inventario de tags');
    assertIncludes(reportText, 'limits', 'reporte declara límites');
}

// ───────────────────────────────────────────────────────────────────────────
// 11 · MODELO DESDE CANALES DE LA APP
// ───────────────────────────────────────────────────────────────────────────

function testModelFromChannels() {
    console.log('\n── 11 · Modelo desde canales de la app ───────────────────────');
    const channels = [
        {
            id: 'c1',
            name: 'Canal App',
            logo: 'http://example.com/logo.png',
            group: 'General',
            url: 'http://example.com/live/u/p/1.m3u8',
            exthttp: { 'User-Agent': 'AppUA', 'Range': 'bytes=0-1' },
            _flatSidecars: {
                extvlcopt: ['#EXTVLCOPT:network-caching=2000'],
                kodiprop: ['#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=AppUA']
            }
        }
    ];

    const m = MP.modelFromChannels(channels, { sourceName: 'app' });
    assertEqual(m.kind, 'flat', 'modelo flat');
    assertEqual(m.channels.length, 1, '1 canal');
    assertEqual(m.channels[0].safeHeaders['User-Agent'], 'AppUA', 'header desde app');
    assert(!m.channels[0].safeHeaders['Range'], 'Range eliminado');

    const vlc = MP.render(m, 'vlc');
    assertIncludes(vlc, '#EXTVLCOPT:network-caching=2000', 'VLC conserva sidecar');
    assertIncludes(vlc, '#EXTVLCOPT:http-user-agent=AppUA', 'VLC traduce header');

    const kodi = MP.render(m, 'kodi');
    assertIncludes(kodi, '#KODIPROP:', 'Kodi emite KODIPROP');
}

// ───────────────────────────────────────────────────────────────────────────
// 12 · CAPACIDADES
// ───────────────────────────────────────────────────────────────────────────

function testCapabilities() {
    console.log('\n── 12 · Matriz de capacidades ────────────────────────────────');
    const caps = MP.getCapabilities();
    assertEqual(caps.dialects.length, 12, '12 dialectos');
    const ids = caps.dialects.map(function (d) { return d.id; });
    ['universal', 'vlc', 'kodi', 'tivimate', 'ott', 'smarters', 'exoplayer', 'apple', 'ffmpeg', 'mpv', 'hlsjs', 'generic'].forEach(function (id) {
        assert(ids.indexOf(id) !== -1, 'dialecto ' + id + ' presente');
    });
    caps.dialects.forEach(function (d) {
        assert(d.flat && typeof d.flat === 'object', d.id + ' declara flat');
        assert(d.hls && typeof d.hls === 'object', d.id + ' declara hls');
    });
}

// ───────────────────────────────────────────────────────────────────────────
// 13 · ATRIBUTOS ESCAPADOS
// ───────────────────────────────────────────────────────────────────────────

function testEscapedAttrs() {
    console.log('\n── 13 · Atributos con comillas y barras ──────────────────────');
    const text = '#EXTM3U\n' +
        '#EXTINF:-1 tvg-name="Canal \\"Especial\\" \\\\ Plus" group-title="A, B",Canal Especial\n' +
        'http://example.com/live/u/p/1.m3u8\n';

    const m = MP.parse(text);
    assertEqual(m.channels.length, 1, '1 canal');
    assertEqual(m.channels[0].extinf.attrs['tvg-name'], 'Canal "Especial" \\ Plus', 'comillas y barra desescapadas');

    const out = MP.render(m, 'universal');
    const m2 = MP.parse(out);
    assertEqual(m2.channels[0].extinf.attrs['tvg-name'], 'Canal "Especial" \\ Plus', 'round-trip de atributo escapado');
}

// ───────────────────────────────────────────────────────────────────────────
// MAIN
// ───────────────────────────────────────────────────────────────────────────

function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(' APE MULTI-PARSER v' + MP.VERSION + ' — SUITE DE PRUEBAS');
    console.log('═══════════════════════════════════════════════════════════════');

    testFlatParse();
    testDialects();
    testToxicHeaders();
    testRoundTrip();
    testHlsMaster();
    testHlsMedia();
    testQuarantine();
    testDiagnose();
    testApeHttpHeaders();
    testLargeList();
    testZip();
    testReportPrivacy();
    testModelFromChannels();
    testCapabilities();
    testEscapedAttrs();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' RESULTADO: ' + passed + ' PASS · ' + failed + ' FAIL');
    console.log('═══════════════════════════════════════════════════════════════');

    if (failed > 0) process.exit(1);
}

main();
