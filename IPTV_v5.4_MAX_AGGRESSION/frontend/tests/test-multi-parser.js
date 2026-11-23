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
    /* ── H-4 (orden del operador: NO ELIMINES NADA, IMPLEMENTA LO QUE NECESITES) ──
     * Fixture autonomo: un canal con cabeceras X-PEVCE-* (valor = knob real de VLC) y
     * una cabecera arbitraria que VLC no puede inyectar. Se comprueba lo unico que
     * importa: (a) nada se pierde, (b) las que VLC sabe aplicar se aplican de verdad,
     * (c) las demas viajan en #EXTHTTP para los players que lo leen. */
    const h4Headers = {
        'User-Agent': 'TestUA',
        'Referer': 'http://example.com/',
        'X-Cabecera-Arbitraria': 'no-inyectable-por-vlc',
        'X-PEVCE-Network-Caching': '3000',
        'X-PEVCE-HTTP-Continuous': 'true',
        'X-PEVCE-Deinterlace': '-1'
    };
    const h4Playlist = [
        '#EXTM3U',
        '#EXTINF:-1 tvg-id="h4",Canal H4',
        '#EXTHTTP:' + JSON.stringify(h4Headers),
        'http://example.com/live/u/p/1.m3u8'
    ].join('\n');
    const h4Model = MP.parse(h4Playlist);
    const h4Vlc = MP.render(h4Model, 'vlc');

    assertIncludes(h4Vlc, '#EXTVLCOPT:http-header=', 'H-4 · conserva la cabecera que VLC no puede inyectar');
    assertIncludes(h4Vlc, 'X-Cabecera-Arbitraria', 'H-4 · el nombre de la cabecera sigue en la lista');
    assertIncludes(h4Vlc, '#EXTVLCOPT:http-user-agent=TestUA', 'H-4 · User-Agent real');
    assertIncludes(h4Vlc, '#EXTVLCOPT:http-referrer=http://example.com/', 'H-4 · Referer real');
    assertIncludes(h4Vlc, '#EXTVLCOPT:network-caching=3000', 'H-4 · X-PEVCE-Network-Caching -> network-caching');
    assertIncludes(h4Vlc, '#EXTVLCOPT:http-continuous', 'H-4 · flag http-continuous (sin =valor)');
    assertIncludes(h4Vlc, '#EXTVLCOPT:deinterlace=-1', 'H-4 · X-PEVCE-Deinterlace -> deinterlace=-1');
    assertIncludes(h4Vlc, '#EXTHTTP:', 'H-4 · ademas viaja en EXTHTTP (transporte real en otros players)');

    const h4Bloques = h4Vlc.split('\n').filter(function (l) { return l.indexOf('#EXTHTTP:') === 0; });
    assertEqual(h4Bloques.length, 1, 'H-4 · un bloque EXTHTTP por canal');
    let h4Claves = -1, h4Bytes = -1;
    if (h4Bloques.length) {
        const cuerpo = h4Bloques[0].slice('#EXTHTTP:'.length);
        h4Bytes = cuerpo.length;
        try { h4Claves = Object.keys(JSON.parse(cuerpo)).length; } catch (e) { h4Claves = -1; }
    }
    assertIncludes(h4Claves > 0 ? 'ok' : 'no', 'ok', 'H-4 · EXTHTTP del dialecto vlc es JSON valido');
    assertIncludes(h4Bytes > 0 && h4Bytes <= 8192 ? 'ok' : 'no', 'ok', 'H-4 · EXTHTTP <= 8192 B');
    assertIncludes(h4Claves > 0 && h4Claves <= 200 ? 'ok' : 'no', 'ok', 'H-4 · EXTHTTP <= 200 claves');
    assertIncludes(h4Bloques.length && h4Bloques[0].indexOf('X-Cabecera-Arbitraria') !== -1 ? 'ok' : 'no', 'ok',
        'H-4 · la cabecera no inyectable TAMBIEN viaja en EXTHTTP');

    const h4Mpv = MP.render(h4Model, 'mpv');
    assertNotIncludes(h4Mpv, '#EXTHTTP', 'H-4 · mpv no hereda el EXTHTTP del dialecto vlc');
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

    /* ── t15 · sin ruido nuevo de c2.a en el catálogo real ── */
    assertEqual(dReal.c2a.length, 0, 't15 · 0 c2a en el catálogo real (sin ruido nuevo)');
    assertEqual(repReal.anomalies.c2aCount, 0, 't15 · reporte real: c2aCount=0');

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

    /* ── t15 · SIMETRÍA de c2.a: mismo discriminante que F-05 ──
     * c2.a cuenta como señal de reproducción sólo en URI, nombre visible de canal
     * (línea #EXTINF) o tag que NO es APE. Dentro de metadata APE va a metadataC2A. */
    const nameC2a = MP.parse('#EXTM3U\n#EXTINF:-1 tvg-name="Canal c2.a",Canal c2.a\nhttp://example.com/1.m3u8\n');
    assertEqual(MP.diagnose(nameC2a).c2a.length, 1, 't15 · c2.a en el nombre del canal cuenta como c2a');

    const uriC2a = MP.parse('#EXTM3U\n#EXTINF:-1,A\nhttp://example.com/c2.a/u/p/1.m3u8\n');
    assertEqual(MP.diagnose(uriC2a).c2a.length, 1, 't15 · c2.a en la URI cuenta como c2a');

    const apeC2a = MP.parse('#EXTM3U\n#EXTINF:-1,A\n#EXT-X-APE-CORTEX-ERROR:c2.a=DETECTED\nhttp://example.com/1.m3u8\n');
    const dApeC2a = MP.diagnose(apeC2a);
    assertEqual(dApeC2a.c2a.length, 0, 't15 · c2.a SOLO en un tag #EXT-X-APE-* NO cuenta como c2a');
    assertEqual(dApeC2a.metadataC2A.length, 1, 't15 · se reporta aparte en metadataC2A');
    assertEqual(dApeC2a.metadataC2A[0].kind, 'metadata', 't15 · la entrada se etiqueta kind=metadata');
    assertEqual(dApeC2a.total, 0, 't15 · la metadata c2.a no infla el total de anomalías');

    const repC2a = MP.buildReport(apeC2a, { dialects: [] });
    assertEqual(repC2a.anomalies.c2aCount, 0, 't15 · reporte: c2aCount=0 con sólo metadata');
    assertEqual(repC2a.anomalies.metadataC2aCount, 1, 't15 · reporte: metadataC2aCount=1, sin mezclar');
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
// 7d · H-7 presupuesto EXTHTTP (8192 B / 200 cabeceras) y H-5 declarado
// ───────────────────────────────────────────────────────────────────────────

function testExtHttpBudget() {
    console.log('\n── 7d · H-7 presupuesto EXTHTTP · H-5 transformaciones declaradas ─');

    /* (1) entrada > 8192 B: recorta por prioridad y AVISA con cifras */
    const big = { 'User-Agent': 'PRIORITY-UA' };
    for (let i = 0; i < 40; i++) big['X-Big-' + String(i).padStart(2, '0')] = 'A'.repeat(250);
    const tBig = '#EXTM3U\n#EXTINF:-1,A\n#EXTHTTP:' + JSON.stringify(big) + '\nhttp://example.com/1.m3u8\n';
    const mBig = MP.parse(tBig);
    const outBig = MP.render(mBig, 'exoplayer');
    const bodyBig = outBig.split('\n').filter(function (l) { return l.indexOf('#EXTHTTP:') === 0; })[0].slice('#EXTHTTP:'.length);
    const parsedBig = JSON.parse(bodyBig);
    assert(Buffer.byteLength(bodyBig, 'utf8') <= 8192, 'H-7 · la salida cabe en 8192 B', Buffer.byteLength(bodyBig, 'utf8') + ' B');
    assert(Object.keys(parsedBig).length < 41, 'H-7 · se descartaron cabeceras', Object.keys(parsedBig).length + ' de 41');
    assertEqual(parsedBig['User-Agent'], 'PRIORITY-UA', 'H-7 · la cabecera prioritaria sobrevive al recorte');
    const wBig = mBig.warnings.filter(function (x) { return x.indexOf('EXTHTTP recortado') === 0; });
    assertEqual(wBig.length, 1, 'H-7 · warning con cifras en model.warnings');
    assertIncludes(wBig[0], 'B / 41 cabeceras ->', 'H-7 · el warning declara entrada (B/cabeceras) y salida');
    assertEqual(mBig.renderAudit.byDialect.exoplayer.extHttp.blocks, 1, 'H-7 · auditoría: 1 bloque recortado');
    assert(mBig.renderAudit.byDialect.exoplayer.extHttp.dropped > 0, 'H-7 · auditoría declara las descartadas');
    const repBig = MP.buildReport(mBig, { dialects: [] });
    assert(repBig.limits.some(function (l) { return l.indexOf('H-7:') === 0 && l.indexOf('aviso') !== -1; }),
        'H-7 · el reporte publica el recorte con cifras en limits');

    /* (2) entrada con > 200 cabeceras (pero pequeña) */
    const many = {};
    for (let i = 0; i < 260; i++) many['X-K' + String(i).padStart(3, '0')] = 'v';
    const tMany = '#EXTM3U\n#EXTINF:-1,A\n#EXTHTTP:' + JSON.stringify(many) + '\nhttp://example.com/1.m3u8\n';
    const mMany = MP.parse(tMany);
    const bodyMany = MP.render(mMany, 'exoplayer').split('\n').filter(function (l) { return l.indexOf('#EXTHTTP:') === 0; })[0].slice('#EXTHTTP:'.length);
    assertEqual(Object.keys(JSON.parse(bodyMany)).length, 200, 'H-7 · se queda en 200 cabeceras exactas');
    assertEqual(mMany.warnings.filter(function (x) { return x.indexOf('EXTHTTP recortado') === 0; }).length, 1,
        'H-7 · warning también cuando el motivo es el número de cabeceras');

    /* (3) lo que YA cabe no se toca ni avisa */
    const smallLine = '{"User-Agent":"UA","Referer":"http://example.com/","X-APE-Profile":"P3"}';
    const tSmall = '#EXTM3U\n#EXTINF:-1,A\n#EXTHTTP:' + smallLine + '\nhttp://example.com/1.m3u8\n';
    const mSmall = MP.parse(tSmall);
    const outSmall = MP.render(mSmall, 'exoplayer');
    assertIncludes(outSmall, smallLine, 'H-7 · lo que cabe se emite byte a byte igual');
    assertEqual(mSmall.warnings.filter(function (x) { return x.indexOf('EXTHTTP recortado') === 0; }).length, 0,
        'H-7 · sin warning si no hay recorte');
    assertEqual(mSmall.renderAudit.byDialect.exoplayer.extHttp.blocks, 0, 'H-7 · 0 recortes cuando cabe');
    assertEqual(mSmall.renderAudit.byDialect.exoplayer.exthttpReserialized, 0,
        'H-5 · re-emitir idéntico NO se cuenta como transformación');

    /* (4) H-5 · el round-trip universal DECLARA lo que transforma */
    const h5 = MP.parse('#EXTM3U\n' +
        '#EXTINF:-1,A\n' +
        '#EXTVLCOPT:network-caching=8000\n' +
        '#EXTVLCOPT:network-caching=8000\n' +
        '#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=UA/1.0&Connection=keep-alive\n' +
        'http://example.com/1.m3u8\n');
    const uniH5 = MP.render(h5, 'universal');
    const au = h5.renderAudit.universal;
    assertEqual(au.duplicateLinesCollapsed, 1, 'H-5 · declara la línea duplicada colapsada');
    assertEqual(au.kodipropReserialized, 1, 'H-5 · declara el bloque KODIPROP re-serializado');
    assertEqual(au.headersPercentEncoded, 1, 'H-5 · declara el valor re-codificado en percent-encoding');
    const wH5 = h5.warnings.filter(function (x) { return x.indexOf('[universal] render transforma') === 0; });
    assertEqual(wH5.length, 1, 'H-5 · warning con números en model.warnings');
    assertIncludes(wH5[0], '1 línea(s) duplicada(s) colapsada(s)', 'H-5 · el warning da la cifra de colapsadas');
    assertIncludes(wH5[0], '1 valor(es) re-codificado(s)', 'H-5 · el warning da la cifra de re-codificados');
    assertNotIncludes(uniH5, 'Connection=keep-alive', 'H-5 · la cabecera tóxica sigue fuera');
    const repH5 = MP.buildReport(h5, { dialects: [] });
    assert(repH5.limits.some(function (l) { return l.indexOf('H-5: universal declara') === 0 && l.indexOf('1 línea(s)') !== -1; }),
        'H-5 · el reporte declara las transformaciones con cifras en limits');
}

// ───────────────────────────────────────────────────────────────────────────
// 7e · H-3 · 8 semánticas de player (understood / ignored §6.3.1 / rejected)
// ───────────────────────────────────────────────────────────────────────────

function testPlayerSemantics() {
    console.log('\n── 7e · H-3 · 8 semánticas de player ────────────────────────');

    /* (1) el mapa declara las 8 familias y CADA UNA declara su nivel de evidencia */
    const fams = MP.listPlayerFamilies();
    const ids = fams.map(function (f) { return f.id; });
    ['hlsjs', 'exoplayer', 'tivimate', 'ott', 'smarters', 'vlc', 'kodi', 'apple'].forEach(function (id) {
        assert(ids.indexOf(id) !== -1, 'H-3 · familia declarada: ' + id);
    });
    assertEqual(fams.length, 8, 'H-3 · el mapa tiene 8 familias');
    assertEqual(MP.getPlayerSemantics('libvlc').id, 'vlc', 'H-3 · alias libvlc→vlc');
    assertEqual(MP.getPlayerSemantics('hls.js').id, 'hlsjs', 'H-3 · alias hls.js→hlsjs');
    assertEqual(MP.getPlayerSemantics('avplayer').id, 'apple', 'H-3 · alias avplayer→apple');
    assertEqual(MP.getPlayerSemantics('hlsjs').evidence, 'measured', 'H-3 · hls.js declara evidencia MEDIDA (t8)');
    assert(fams.filter(function (f) { return f.evidence === 'repo-doctrine'; }).length >= 3,
        'H-3 · las familias no medidas se declaran doctrina, no medidas');
    assert(fams.every(function (f) { return f.ruleKinds > 0 && f.understands > 0; }),
        'H-3 · todas declaran tags entendidos y reglas de rechazo');

    /* (2) sobre el catálogo de FORMA REAL cada familia da veredicto con números */
    const m = MP.parse(REAL_CATALOG, { sourceName: 'catalogo-12' });
    const all = MP.auditAll(m);
    assertEqual(Object.keys(all.families).length, 8, 'H-3 · auditAll cubre las 8 familias');
    Object.keys(all.families).forEach(function (id) {
        const r = all.families[id];
        assert(r.verdict === 'PASS' || r.verdict === 'FAIL', 'H-3 · ' + id + ' da veredicto');
        assert(r.understood.length > 0, 'H-3 · ' + id + ' entiende tags (n=' + r.counts.understoodTags + ')');
        assert(r.ignored.length > 0, 'H-3 · ' + id + ' ignora tags por §6.3.1 (n=' + r.counts.ignoredTags + ')');
        assert(r.counts.understoodLines + r.counts.ignoredLines >= 12,
            'H-3 · ' + id + ' contabiliza líneas (' + (r.counts.understoodLines + r.counts.ignoredLines) + ')');
    });

    /* hls.js: lo MEDIDO en t8 manda — la contaminación de tipo es FATAL */
    const hls = all.families.hlsjs;
    assertEqual(hls.verdict, 'FAIL', 'H-3 · hls.js FAIL sobre el catálogo real');
    assertEqual(hls.counts.fatal, 1, 'H-3 · hls.js: 1 fatal (TARGETDURATION fuerza MEDIA)');
    assert(hls.rejected.some(function (r) { return r.kind === 'media_routing_tag' && r.severity === 'fatal'; }),
        'H-3 · el fatal es el enrutado de tipo (medido t8)');
    assert(hls.rejected.some(function (r) { return r.kind === 'extinf_negative'; }),
        'H-3 · hls.js declara EXTINF:-1 como rechazo (medido t8: duration=0 + URI falso)');
    assert(hls.rejected.some(function (r) { return r.kind === 'session_key_none' && r.severity === 'warning'; }),
        'H-3 · SESSION-KEY NONE es rechazo de severidad warning (medido t8)');

    /* §6.3.1: los tags APE son IGNORADO-LEGAL, jamás un rechazo */
    assert(hls.ignored.some(function (r) { return r.tag.indexOf('#EXT-X-APE-') === 0; }),
        'H-3 · los tags #EXT-X-APE-* caen en IGNORADO (§6.3.1)');
    assertEqual(hls.rejected.filter(function (r) { return r.detail && r.detail.indexOf('#EXT-X-APE-') === 0; }).length, 0,
        'H-3 · ningún tag APE cuenta como rechazo');
    /* lo que cada familia entiende de verdad: discriminación real, no un includes */
    assert(MP.auditFor(m, 'kodi').ignored.some(function (r) { return r.tag === '#EXTVLCOPT'; }),
        'H-3 · Kodi ignora #EXTVLCOPT (§6.3.1)');
    assert(MP.auditFor(m, 'kodi').understood.some(function (r) { return r.tag === '#KODIPROP'; }),
        'H-3 · Kodi entiende #KODIPROP');
    assert(MP.auditFor(m, 'vlc').ignored.some(function (r) { return r.tag === '#KODIPROP'; }),
        'H-3 · VLC ignora #KODIPROP (§6.3.1)');
    assert(MP.auditFor(m, 'vlc').understood.some(function (r) { return r.tag === '#EXTVLCOPT'; }),
        'H-3 · VLC entiende #EXTVLCOPT');
    assert(MP.auditFor(m, 'hlsjs').ignored.some(function (r) { return r.tag === '#EXTHTTP'; }),
        'H-3 · hls.js ignora #EXTHTTP (§6.3.1)');
    /* familias tolerantes: PASS y dicen por qué */
    assertEqual(all.families.vlc.verdict, 'PASS', 'H-3 · VLC PASS (tolera el ruido de tipo)');
    assertEqual(all.families.kodi.verdict, 'PASS', 'H-3 · Kodi PASS');
    assertEqual(all.families.ott.verdict, 'PASS', 'H-3 · OTT Navigator PASS');
    assertEqual(all.families.smarters.verdict, 'PASS', 'H-3 · Smarters PASS');
    assertEqual(all.families.apple.verdict, 'FAIL', 'H-3 · AVPlayer FAIL (RFC estricto)');
    /* Discriminación REAL entre familias ante la MISMA cabecera: el UA con coma es lo que
     * la emisión real trae ("…KHTML,like Gecko…"), y TiviMate parsea sólo el primer valor. */
    const commaUa = MP.parse('#EXTM3U\n#EXTINF:10 tvg-id="a",A\n' +
        '#EXTHTTP:{"User-Agent":"Mozilla/5.0 (X11; Linux) KHTML, like Gecko"}\n' +
        '#EXT-X-STREAM-INF:BANDWIDTH=25000000,RESOLUTION=5760x3240,CODECS="hvc1.2.4.L183.B0"\n' +
        'http://example.com/1.m3u8\n');
    assertEqual(MP.auditFor(commaUa, 'tivimate').verdict, 'FAIL', 'H-3 · TiviMate FAIL con UA de valor único que lleva coma');
    assert(MP.auditFor(commaUa, 'tivimate').rejected.some(function (r) { return r.kind === 'multi_value_single_header'; }),
        'H-3 · el motivo declarado es multi_value_single_header');
    assertEqual(MP.auditFor(commaUa, 'vlc').verdict, 'PASS', 'H-3 · VLC no sufre con la misma coma (no la lee como cabecera única)');
    assertEqual(MP.auditFor(commaUa, 'exoplayer').verdict, 'PASS', 'H-3 · ExoPlayer la marca warning, no error');

    /* (3) los 6 casos negativos plantados salen REJECTED CON SU LÍNEA */
    const BODY = '#EXT-X-STREAM-INF:BANDWIDTH=25000000,RESOLUTION=5760x3240,CODECS="hvc1.2.4.L183.B0"';
    const NEG = [
        { id: 'N1 TARGETDURATION fuerza MEDIA', kind: 'media_routing_tag', line: 2, verdict: 'FAIL', sev: 'fatal',
          text: '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:10,A\n' + BODY + '\nhttp://example.com/1.m3u8\n' },
        { id: 'N2 EXTINF -1', kind: 'extinf_negative', line: 2, verdict: 'FAIL', sev: 'error',
          text: '#EXTM3U\n#EXTINF:-1,A\n' + BODY + '\nhttp://example.com/1.m3u8\n' },
        { id: 'N3 SESSION-KEY NONE', kind: 'session_key_none', line: 2, verdict: 'PASS', sev: 'warning',
          text: '#EXTM3U\n#EXT-X-SESSION-KEY:METHOD=NONE\n#EXTINF:10,A\n' + BODY + '\nhttp://example.com/1.m3u8\n' },
        { id: 'N4 CODECS sin comillas', kind: 'codecs_unquoted', line: 3, verdict: 'PASS', sev: 'warning',
          text: '#EXTM3U\n#EXTINF:10,A\n#EXT-X-STREAM-INF:BANDWIDTH=25000000,RESOLUTION=5760x3240,CODECS=hvc1.2.4.L183.B0,mp4a.40.2\nhttp://example.com/1.m3u8\n' },
        { id: 'N5 dos URIs tras un EXTINF', kind: 'uri_without_owner', line: 5, verdict: 'FAIL', sev: 'error',
          text: '#EXTM3U\n#EXTINF:10,A\n' + BODY + '\nhttp://example.com/1.m3u8\nhttp://example.com/2.m3u8\n' },
        { id: 'N6 tag de media playlist en catálogo', kind: 'media_only_tag_in_catalog', line: 2, verdict: 'FAIL', sev: 'error',
          text: '#EXTM3U\n#EXT-X-PART-INF:PART-TARGET=0.5\n#EXTINF:10,A\n' + BODY + '\nhttp://example.com/1.m3u8\n' }
    ];
    NEG.forEach(function (c) {
        const mm = MP.parse(c.text, { sourceName: c.id });
        const h = MP.auditFor(mm, 'hlsjs');
        const hit = h.rejected.filter(function (r) { return r.kind === c.kind; });
        assert(hit.length > 0, 'H-3 · ' + c.id + ' → REJECTED (' + c.kind + ')');
        if (hit.length) {
            assertEqual(hit[0].line, c.line, 'H-3 · ' + c.id + ' con su línea');
            assertEqual(hit[0].severity, c.sev, 'H-3 · ' + c.id + ' con su severidad medida');
        }
        assertEqual(h.verdict, c.verdict, 'H-3 · ' + c.id + ' deja el veredicto en ' + c.verdict);
    });

    /* el caso limpio NO se inventa rechazos */
    const clean = MP.parse('#EXTM3U\n#EXTINF:10,A\n' + BODY + '\nhttp://example.com/1.m3u8\n');
    assertEqual(MP.auditFor(clean, 'hlsjs').verdict, 'PASS', 'H-3 · forma real sin defectos → hls.js PASS');
    assertEqual(MP.auditFor(clean, 'hlsjs').counts.rejected, 0, 'H-3 · forma real sin defectos → 0 rechazos');
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

// ───────────────────────────────────────────────────────────────────────────
// 15 · H-8 · DETERMINISMO DEL BUNDLE (instante explícito)
// ───────────────────────────────────────────────────────────────────────────
/*
 * H-8 medido (2026-11-22): el bundle embebía `new Date()` en el informe, el manifiesto,
 * los 4 sidecars y las fechas DOS del ZIP, más `model.stats.parseTimeMs` (reloj).
 * Dos generaciones del MISMO input daban sha256 distinto y `report.stats` distinto.
 * Contrato que se fija aquí:
 *   · mismo input + MISMO instante  -> ZIP byte-idéntico (sha256 igual);
 *   · instantes DISTINTOS           -> sólo cambian los campos de tiempo declarados
 *     (generatedAt, el crc32 derivado de esos ficheros y la línea de `limits`),
 *     con IGUAL número de líneas no vacías, iguales `stats` y los 12 dialectos
 *     byte-idénticos;
 *   · sin instante                  -> comportamiento anterior, DECLARADO en limits.
 */
function testBundleDeterminism() {
    const crypto = require('crypto');
    const sha = function (b) { return crypto.createHash('sha256').update(Buffer.from(b)).digest('hex'); };
    const ISO_A = '2026-11-22T00:00:00Z';
    const ISO_B = '2026-11-22T06:30:00Z';
    /* el módulo publica el instante CANÓNICO de Date#toISOString (…:00.000Z) */
    const CANON_A = new Date(ISO_A).toISOString();
    const textOf = function (v) { return typeof v === 'string' ? v : null; };
    const nonEmpty = function (txt) { return txt.split('\n').filter(function (l) { return l.trim() !== ''; }).length; };

    const model = MP.parse(REAL_CATALOG, { sourceName: 'h8-determinismo' });

    const A = MP.buildBundleZip(model, { generatedAt: ISO_A });
    const B = MP.buildBundleZip(model, { generatedAt: ISO_A });
    const C = MP.buildBundleZip(model, { generatedAt: ISO_B });

    /* 1 · mismo input + mismo instante => byte-idéntico */
    assertEqual(sha(A.zip), sha(B.zip), 'H-8 · mismo input + mismo instante => ZIP byte-idéntico');
    const names = Object.keys(A.files).sort();
    const sameBytes = names.filter(function (n) {
        const a = A.files[n], b = B.files[n];
        return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
    });
    assertEqual(sameBytes.length, names.length, 'H-8 · los ' + names.length + ' ficheros del bundle son idénticos entre dos corridas con el mismo instante');

    /* 2 · el instante declarado es el que se pidió (informe, manifiesto, sidecars) */
    assertEqual(A.report.generatedAt, CANON_A, 'H-8 · report.generatedAt es el instante pedido');
    assertEqual(A.manifest.generatedAt, CANON_A, 'H-8 · manifest.generatedAt es el instante pedido');
    const sidecars = names.filter(function (n) { return n.indexOf('sidecars/') === 0; });
    const sidecarsOk = sidecars.every(function (n) {
        try { return JSON.parse(A.files[n]).generatedAt === CANON_A; } catch (e) { return false; }
    });
    assert(sidecarsOk && sidecars.length > 0, 'H-8 · los ' + sidecars.length + ' sidecars llevan el mismo instante', sidecars.join(','));

    /* 3 · instante distinto => el ZIP cambia, pero NADA estructural */
    assert(sha(A.zip) !== sha(C.zip), 'H-8 · instantes distintos => sha256 del ZIP distinto (el tiempo no se congela solo)');
    const ALLOWED = /generatedAt|crc32|instante explícito/;
    let diffLines = 0, diffNotAllowed = [], diffDialects = [], lineCountMismatch = [];
    names.forEach(function (n) {
        const ta = textOf(A.files[n]), tc = textOf(C.files[n]);
        if (ta === null || tc === null) {
            if (Buffer.compare(Buffer.from(A.files[n]), Buffer.from(C.files[n])) !== 0) diffNotAllowed.push(n + ':binario distinto');
            return;
        }
        if (nonEmpty(ta) !== nonEmpty(tc)) lineCountMismatch.push(n);
        const la = ta.split('\n'), lc = tc.split('\n');
        const max = Math.max(la.length, lc.length);
        let fileDiff = 0;
        for (let i = 0; i < max; i++) {
            if (la[i] === lc[i]) continue;
            fileDiff++; diffLines++;
            if (!ALLOWED.test(la[i] || '')) diffNotAllowed.push(n + ':' + (i + 1) + ' ' + String(la[i] || '(falta)').slice(0, 90));
        }
        if (/\.m3u8$/.test(n) && fileDiff > 0) diffDialects.push(n);
    });
    assert(diffLines > 0, 'H-8 · con instantes distintos hay líneas distintas que declarar', String(diffLines));
    assertEqual(diffNotAllowed.length, 0, 'H-8 · sólo cambian campos de tiempo declarados (0 líneas estructurales distintas)', diffNotAllowed.slice(0, 3).join(' | '));
    assertEqual(lineCountMismatch.length, 0, 'H-8 · mismo número de líneas no vacías por fichero entre instantes', lineCountMismatch.join(','));
    assertEqual(diffDialects.length, 0, 'H-8 · los 12 dialectos son byte-idénticos entre instantes', diffDialects.join(','));

    /* 4 · la estructura declarada no depende del tiempo */
    assertEqual(JSON.stringify(A.report.stats), JSON.stringify(C.report.stats), 'H-8 · report.stats idéntico entre instantes (sin mediciones de reloj)');
    assertEqual(A.report.stats.parseTimeMs, null, 'H-8 · con instante explícito parseTimeMs se publica null (no se miente con una medición)');
    assertEqual(JSON.stringify(A.dialects), JSON.stringify(C.dialects), 'H-8 · bytes por dialecto idénticos entre instantes');

    /* 5 · el contrato se declara, y sin instante se declara lo contrario */
    const limitOk = A.report.limits.some(function (l) { return /REPRODUCIBLE: instante explícito/.test(l); });
    assert(limitOk, 'H-8 · limits declara que el bundle es reproducible con instante explícito');
    const ND = MP.buildBundleZip(model, {});
    const limitNd = ND.report.limits.some(function (l) { return /NO es reproducible/.test(l); });
    assert(limitNd, 'H-8 · sin instante, limits declara que el bundle NO es reproducible (no se promete lo que no hay)');

    /* 6 · options.clock es equivalente a options.generatedAt */
    const K = MP.buildBundleZip(model, { clock: function () { return ISO_A; } });
    assertEqual(sha(K.zip), sha(A.zip), 'H-8 · options.clock() produce el mismo ZIP que options.generatedAt');

    /* 7 · un instante inválido se rechaza en voz alta, no se ignora */
    let threw = false;
    try { MP.buildBundleZip(model, { generatedAt: 'no-es-una-fecha' }); } catch (e) { threw = true; }
    assert(threw, 'H-8 · generatedAt inválido lanza (no cae al reloj del sistema en silencio)');
}

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
    testExtHttpBudget();
    testPlayerSemantics();
    testLargeList();
    testZip();
    testReportPrivacy();
    testModelFromChannels();
    testCapabilities();
    testEscapedAttrs();
    testBundleDeterminism();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' RESULTADO: ' + passed + ' PASS · ' + failed + ' FAIL');
    console.log('═══════════════════════════════════════════════════════════════');

    if (failed > 0) process.exit(1);
}

main();
