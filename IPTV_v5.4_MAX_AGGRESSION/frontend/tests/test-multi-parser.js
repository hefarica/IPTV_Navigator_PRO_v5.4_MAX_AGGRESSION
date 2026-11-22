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

/* ─── FORMA DE CATÁLOGO REAL (H-1/H-2/H-12) ────────────────────────────────
 * Reproduce el ORDEN LITERAL medido en artifacts/parsers/_emisiones.../_catalogo_12.m3u8:
 * cabecera de catálogo con metadata de media playlist heredada (#EXT-X-TARGETDURATION,
 * SERVER-CONTROL, PART-INF, START, SESSION-KEY) y, por cada uno de los 12 perfiles del LAB:
 *
 *   #EXTINF:-1 tvg-* ape-profile=…   ← el canal
 *   …directivas (EXTHTTP, APE, EXTVLCOPT, KODIPROP, personalizada)
 *   #EXT-X-STREAM-INF:…             ← la variante de ESE canal
 *   http://…/1.m3u8                 ← la URL del canal
 *
 * Se genera en vez de incrustar 1,7 MB, pero el orden y las familias de tag son las reales.
 * withStreamInf=false da la variante de los modos A/B del generador (sin STREAM-INF). */
const LAB_PROFILES = ['P0', 'P0.5', 'P1', 'P1.5', 'P2', 'P2.5', 'P3', 'P3.5', 'P4', 'P4.5', 'P5', 'P5.5'];

function buildRealCatalog(withStreamInf) {
    const out = ['#EXTM3U x-tvg-url="http://example.com/epg.xml"'];
    out.push('#EXT-X-TARGETDURATION:2');
    out.push('#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.5');
    out.push('#EXT-X-PART-INF:PART-TARGET=0.5');
    out.push('#EXT-X-START:TIME-OFFSET=0');
    out.push('#EXT-X-SESSION-KEY:METHOD=NONE');
    LAB_PROFILES.forEach(function (p, i) {
        out.push('#EXTINF:-1 tvg-id="t.' + p + '" tvg-name="TEST ' + p + '" tvg-logo="" tvg-chno="' + (i + 1) +
            '" tvg-shift="0" group-title="TEST" ape-profile="' + p + '",TEST ' + p);
        out.push('#EXTHTTP:{"User-Agent":"UA/' + p + '","Origin":"http://example.com","Range":"bytes=0-","X-APE-Profile":"' + p + '"}');
        out.push('#EXT-X-APE-REA-HTTP-OVERFLOW:{"exo_tunneled_playback":"true"}');
        out.push('#EXTVLCOPT:network-caching=8000');
        out.push('#EXTVLCOPT:clock-synchro=1');
        out.push('#EXTVLCOPT:video-hdr-nits=400');
        out.push('#KODIPROP:inputstream.adaptive.manifest_type=hls');
        out.push('#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=UA%2F' + p + '&Connection=keep-alive');
        out.push('#EXT-X-APE-PROFILE:' + p);
        out.push('#EXT-X-APE-CONNECTION-BUDGET:1');
        out.push('#EXT-X-APE-INSTALLER:DECLARED=1');
        out.push('#EXT-X-APE-CORTEX-ERROR-403:EVASION=true,UA-ROTATE=true');
        out.push('#EXT-X-CUSTOM-DESCONOCIDO:' + p);
        if (withStreamInf) {
            out.push('#EXT-X-STREAM-INF:BANDWIDTH=25000000,AVERAGE-BANDWIDTH=20000000,RESOLUTION=5760x3240,' +
                'CODECS="hvc1.2.4.L183.B0,mp4a.40.2",FRAME-RATE=120.000,VIDEO-RANGE=PQ');
        }
        out.push('http://example.com/live/u/p/' + (i + 1) + '.m3u8');
    });
    return out.join('\n') + '\n';
}

const REAL_CATALOG = buildRealCatalog(true);        // modo C (producción): con STREAM-INF
const REAL_CATALOG_FLAT = buildRealCatalog(false);  // modos A/B del generador: sin STREAM-INF

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
// 6b · FORMA DE CATÁLOGO REAL (H-1 extracción de canales, H-2 EXTHTTP en HLS)
// ───────────────────────────────────────────────────────────────────────────

function testRealCatalogShape() {
    console.log('\n── 6b · Catálogo real: EXTINF + directivas + STREAM-INF + URI ─');
    const m = MP.parse(REAL_CATALOG, { sourceName: 'catalogo-12' });

    /* ── H-1: la forma de producción NO pierde el canal ── */
    assertEqual(m.kind, 'hls_master', 'catálogo real con STREAM-INF: tipo master');
    assertEqual(m.hls.variants.length, 12, '12 variantes (una por perfil)');
    assertEqual(m.channels.length, 12, 'H-1 · 12 canales extraídos (antes: 0)');
    assertEqual(m.quarantine.length, 0, 'H-1 · cero cuarentena por STREAM-INF');
    assertEqual(m.stats.channels, 12, 'stats.channels = 12');
    assertEqual(m.stats.segments, 0, 'un catálogo no se cuenta como 12 segmentos');

    const c0 = m.channels[0];
    const c11 = m.channels[11];
    assertEqual(c0.meta.name, 'TEST P0', 'nombre del canal desde su EXTINF');
    assertEqual(c11.meta.name, 'TEST P5.5', 'el último canal conserva su nombre');
    assert(!!c0.url && /^https?:\/\/.+\.m3u8/.test(c0.url), 'H-1 · url = URI que sigue al STREAM-INF', c0.url);
    assert(c0.directives.length >= 9, 'H-1 · directivas intermedias asociadas al canal', 'n=' + c0.directives.length);
    assertEqual(c0.directives.filter(function (d) { return d.tagUpper === '#EXTVLCOPT'; }).length, 3, '3 EXTVLCOPT en el canal 0');
    assertEqual(c0.directives.filter(function (d) { return d.tagUpper === '#KODIPROP'; }).length, 2, '2 KODIPROP en el canal 0');
    assertEqual(c0.directives.filter(function (d) { return d.tagUpper === '#EXT-X-STREAM-INF'; }).length, 0, 'el STREAM-INF no se duplica como directiva');
    assertEqual(m.channels.filter(function (c) { return !c.url; }).length, 0, 'ningún canal sin URL');
    assertEqual(m.channels.filter(function (c) { return !c.meta.name; }).length, 0, 'ningún canal sin nombre');
    assertEqual(m.channels.filter(function (c) { return c.directives.length === 0; }).length, 0, 'ningún canal sin directivas');

    /* cabeceras por canal, cosechadas de las directivas intermedias */
    assertEqual(c0.safeHeaders['User-Agent'], 'UA/P0', 'User-Agent cosechado del EXTHTTP del canal');
    assert(!c0.safeHeaders['Range'], 'Range eliminado del canal (tóxica)');
    assert(!c0.safeHeaders['Connection'], 'Connection eliminada del canal (tóxica)');
    assertEqual(m.stats.headers, 12, '12 canales con cabeceras saneadas');

    /* ── H-2: quien declara exthttp DEBE emitirlo también en el render HLS ── */
    const exo = MP.render(m, 'exoplayer');
    assertIncludes(exo, '#EXTHTTP:', 'H-2 · ExoPlayer emite EXTHTTP en render HLS');
    assertEqual(exo.split('\n').filter(function (l) { return l.indexOf('#EXTHTTP:') === 0; }).length, 12, 'H-2 · 12 bloques EXTHTTP para 12 canales');
    assertNotIncludes(exo, '"Range"', 'H-2 · EXTHTTP emitido sin Range');
    assertIncludes(MP.render(m, 'tivimate'), '#EXTHTTP:', 'H-2 · TiviMate emite EXTHTTP');
    assertIncludes(MP.render(m, 'ott'), '#EXTHTTP:', 'H-2 · OTT Navigator emite EXTHTTP');
    assertIncludes(MP.render(m, 'smarters'), '#EXTHTTP:', 'H-2 · Smarters emite EXTHTTP');
    assertIncludes(MP.render(m, 'generic'), '#EXTHTTP:', 'H-2 · genérico emite EXTHTTP');
    assertNotIncludes(MP.render(m, 'hlsjs'), '#EXTHTTP', 'hls.js NO emite EXTHTTP (va en sidecar, y capabilities lo dice)');
    assertNotIncludes(MP.render(m, 'vlc'), '#EXTHTTP', 'VLC NO emite EXTHTTP (usa EXTVLCOPT)');
    assertIncludes(MP.render(m, 'vlc'), '#EXTVLCOPT:network-caching=8000', 'VLC conserva sus EXTVLCOPT');

    /* capabilities coherente en los dos caminos (no a medias) */
    const caps = MP.getCapabilities().dialects;
    const cap = function (id) { return caps.filter(function (x) { return x.id === id; })[0]; };
    assertEqual(cap('exoplayer').flat.exthttp, true, 'capabilities.flat.exthttp de exoplayer = true');
    assertEqual(cap('exoplayer').hls.exthttp, true, 'capabilities.hls.exthttp de exoplayer = true (H-2)');
    assertEqual(cap('tivimate').hls.exthttp, true, 'capabilities.hls.exthttp de tivimate = true');
    assertEqual(cap('hlsjs').hls.exthttp, false, 'capabilities.hls.exthttp de hls.js = false (verdad)');
    assertEqual(cap('vlc').hls.exthttp, false, 'capabilities.hls.exthttp de vlc = false (verdad)');

    /* universal conserva el documento; el bundle ve los 12 canales */
    const uni = MP.render(m, 'universal');
    assertEqual(uni.split('\n').filter(function (l) { return l.indexOf('#EXTINF:') === 0; }).length, 12, 'universal conserva los 12 EXTINF');
    assertIncludes(uni, '#EXT-X-CUSTOM-DESCONOCIDO:P0', 'universal conserva la directiva no estándar del canal');
    assertIncludes(uni, '#EXT-X-APE-INSTALLER:DECLARED=1', 'universal conserva el tag APE del canal');
    const bundle = MP.buildBundleZip(m, { includeSidecars: true });
    const man = JSON.parse(bundle.files['manifest.json']);
    assertEqual(man.channels, 12, 'manifiesto declara 12 canales');
    assertEqual(man.variants, 12, 'manifiesto declara 12 variantes');
    const sidecars = Object.keys(bundle.files).filter(function (f) { return f.indexOf('sidecars/') === 0; });
    assert(sidecars.length >= 4, 'H-2 · el bundle genera sidecars (antes: 0)', sidecars.join(','));

    /* ── F-05 · el catálogo real trae 12 tags APE-…-403: NO son respuestas HTTP ── */
    const dReal = MP.diagnose(m);
    assertEqual(dReal.http403.length, 0, 'F-05 · 0 http403 en el catálogo real (los 12 APE-403 son metadata)');
    assertEqual(dReal.metadata403.length, 12, 'F-05 · 12 metadata403 reportados aparte');
    const repReal = MP.buildReport(m, { dialects: [] });
    assertEqual(repReal.anomalies.http403Count, 0, 'F-05 · reporte real: http403Count=0');
    assertEqual(repReal.anomalies.metadata403Count, 12, 'F-05 · reporte real: metadata403Count=12');

    /* ── F-03 · el manifiesto del bundle real lista N-1 (nunca se a sí mismo) ── */
    assertEqual(man.files.length, Object.keys(bundle.files).length - 1, 'F-03 · manifiesto del bundle real lista N-1');

    /* ── variante sin STREAM-INF (modos A/B del generador): también 12 canales ── */
    const mf = MP.parse(REAL_CATALOG_FLAT, { sourceName: 'catalogo-12-sin-streaminf' });
    assertEqual(mf.kind, 'flat', 'catálogo sin STREAM-INF: tipo flat, no media', 'kind=' + mf.kind);
    assertEqual(mf.channels.length, 12, 'H-1 · 12 canales también sin STREAM-INF');
    assertEqual(mf.hls.segments.length, 0, 'no inventa 12 segmentos');
    assertEqual(mf.quarantine.length, 0, 'cero cuarentena');

    /* el master puro sigue sin canales: el assert de la sección 5 NO se toca */
    assertEqual(MP.parse(HLS_MASTER).channels.length, 0, 'un master sin EXTINF sigue con 0 canales');
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

    /* ── F-05 · un 403 de METADATA APE no es una respuesta HTTP 403 ── */
    const ape403 = MP.parse('#EXTM3U\n#EXTINF:-1,A\n#EXT-X-APE-CORTEX-ERROR-403:EVASION=true,UA-ROTATE=true\nhttp://example.com/1.m3u8\n');
    const dApe = MP.diagnose(ape403);
    assertEqual(dApe.http403.length, 0, 'F-05 · un tag #EXT-X-APE-*-403 NO cuenta como http403');
    assertEqual(dApe.metadata403.length, 1, 'F-05 · se reporta aparte en metadata403');
    assertEqual(dApe.metadata403[0].kind, 'metadata', 'F-05 · la entrada se etiqueta kind=metadata');
    assertEqual(dApe.total, 0, 'F-05 · la metadata APE no infla el total de anomalías');

    const uri403 = MP.parse('#EXTM3U\n#EXTINF:-1,A\nhttp://example.com/live/403/u/p/1.m3u8\n');
    assertEqual(MP.diagnose(uri403).http403.length, 1, 'F-05 · un 403 REAL en la URI sigue contando como http403');
    assertEqual(MP.diagnose(uri403).metadata403.length, 0, 'F-05 · sin metadata403 si no hay tags APE');

    const err403 = MP.parse('#EXTM3U\n#EXT-X-ERROR:403\n#EXTINF:-1,A\nhttp://example.com/1.m3u8\n');
    assertEqual(MP.diagnose(err403).http403.length, 1, 'F-05 · un 403 en un tag que NO es APE sigue contando');

    const repApe = MP.buildReport(ape403, { dialects: [] });
    assertEqual(repApe.anomalies.http403Count, 0, 'F-05 · reporte: http403Count=0 con sólo metadata');
    assertEqual(repApe.anomalies.metadata403Count, 1, 'F-05 · reporte: metadata403Count=1, sin mezclar');
    assert((repApe.limits || []).some(function (l) { return l.indexOf('metadata403Count') !== -1; }),
        'F-05 · el reporte declara la separación en limits');
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

    /* ── F-03 · contrato del manifiesto (VERIFICADO: no es defecto) ──
     * Un manifiesto no puede declarar el CRC32/hash de sí mismo: el hash dependería de su
     * propio contenido (dependencia circular). `renderBundle` escribe manifest.json DESPUÉS
     * de evaluar buildManifest(files), así que el manifiesto ve todos los demás archivos.
     * El contrato queda fijado: lista N-1 y declara el excluido con motivo. */
    const bundleNames = Object.keys(bundle.files);
    const missingFromManifest = bundleNames.filter(function (n) {
        return !manifest.files.some(function (f) { return f.name === n; });
    });
    assertEqual(manifest.files.length, bundleNames.length - 1, 'F-03 · manifiesto lista N-1 archivos');
    assertEqual(manifest.fileCount, manifest.files.length, 'F-03 · fileCount coincide con files');
    assertEqual(missingFromManifest.length, 1, 'F-03 · un solo archivo no listado', missingFromManifest.join(','));
    assertEqual(missingFromManifest[0], 'manifest.json', 'F-03 · el único no listado es manifest.json (no se pierde otro)');
    assertEqual(manifest.excluded.length, 1, 'F-03 · declara 1 exclusión');
    assertEqual(manifest.excluded[0].name, 'manifest.json', 'F-03 · exclusión declarada por nombre');
    assert(!!manifest.excluded[0].reason && manifest.excluded[0].reason.indexOf('circular') !== -1,
        'F-03 · la exclusión declara el motivo (dependencia circular)');

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
    testRealCatalogShape();
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
