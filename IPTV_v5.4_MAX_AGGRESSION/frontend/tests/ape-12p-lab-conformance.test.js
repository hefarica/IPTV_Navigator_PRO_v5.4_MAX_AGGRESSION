/**
 * tests/ape-12p-lab-conformance.test.js
 * ---------------------------------------------------------------------------
 * Comprobaciones de la CAPA 12P (aditiva, apagada por defecto):
 *   A. la política de buffer del JSON del LAB se aplica tal cual la declara
 *   B. envelope y prefetch con el redondeo bancario que el JSON exige
 *   C. la etiqueta que se añade conserva el declarado y añade el efectivo
 *   D. el flag está APAGADO por defecto
 *   E. los 4 defectos (D1/D3/D4 + doctrina) se detectan y no se inventan
 *   F. la auditoría de una lista distingue master / media / catálogo
 *   G. el enganche en el generador existe, va DESPUÉS del push de network-caching
 *      y el módulo no toca DOM ni red
 *
 * LÍMITE HONESTO: esta suite NO demuestra que la salida se genere de punta a
 * punta con el flag encendido (eso exige el generador completo en un sandbox);
 * sí demuestra la matemática, la detección y que sin flag no hay ni un byte
 * nuevo. La lista real con flag encendido YA está medida, línea a línea, en
 * tests/ape-12p-onpath-equivalence.test.js (OFF vs ON sobre la fixture real).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const L = require('../js/ape-v9/lab-12p-conformance.js');

let PASS = 0, FAIL = 0;
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'esperado ' + JSON.stringify(want) + ', obtenido ' + JSON.stringify(got)); }

console.log('\n=== A · política de buffer del LAB (caps) ===');
eq('A1  25 Mbps → 30 s', L.capSeconds(25), 30);
eq('A2  25.1 Mbps → 24 s', L.capSeconds(25.1), 24);
eq('A3  80 Mbps → 24 s', L.capSeconds(80), 24);
eq('A4  150 Mbps → 20 s', L.capSeconds(150), 20);
eq('A5  150.1 Mbps → 15 s', L.capSeconds(150.1), 15);
eq('A6  sin bitrate → último techo (15 s)', L.capSeconds(NaN), 15);
eq('A7  1 Mbps → 30 s', L.capSeconds(1), 30);

console.log('\n=== B · buffer efectivo, envelope y prefetch ===');
const e1 = L.effectiveBuffer({ declaredSec: 63, bitrateMbps: 200 });
eq('B1  declarado 63 s @200 Mbps → efectivo 15 s', e1.effective_target_s, 15);
eq('B2  se marca como recortado', e1.capped, true);
eq('B3  el declarado se conserva', e1.declared_s, 63);
eq('B4  declared_retained true', e1.declared_retained, true);
eq('B5  measured_on_device false (no se ha medido nada)', e1.measured_on_device, false);
const e2 = L.effectiveBuffer({ declaredSec: 10, bitrateMbps: 4 });
eq('B6  declarado 10 s @4 Mbps → efectivo 10 s (no se toca)', e2.effective_target_s, 10);
eq('B7  no recortado', e2.capped, false);
const e3 = L.effectiveBuffer({ declaredSec: 40, bitrateMbps: 40 });
eq('B8  declarado 40 s @40 Mbps → techo 24 s', e3.effective_target_s, 24);
const env = L.envelope(24);
eq('B9  envelope.min_ms(T=24) = 15 000', env.min_ms, 15000);
eq('B10 envelope.max_ms(T=24) = 48 000', env.max_ms, 48000);
eq('B11 envelope.exo_min_ms(T=24) = 30 000', env.exo_min_ms, 30000);
eq('B12 envelope.exo_max_ms(T=24) = 90 000', env.exo_max_ms, 90000);
eq('B13 redondeo bancario 9.5 → 10', L.bankers(9.5), 10);
eq('B14 redondeo bancario 10.5 → 10', L.bankers(10.5), 10);
eq('B15 redondeo bancario 9.375 → 9', L.bankers(9.375), 9);
eq('B16 prefetch T=24 → 6', L.prefetchSegments(24), 6);
eq('B17 prefetch T=8 → 2', L.prefetchSegments(8), 2);
eq('B18 prefetch T=12 → 3', L.prefetchSegments(12), 3);
eq('B19 paralelo = 4 (regla del LAB)', e1.parallel_downloads, 4);

console.log('\n=== C · etiqueta añadida (conserva declarado, añade efectivo) ===');
const tag = L.bufferTag({ declaredMs: 63000, bandwidthKbps: 200000 });
ok('C1  empieza por #EXT-X-APE-BUFFER-POLICY', tag.indexOf('#EXT-X-APE-BUFFER-POLICY:') === 0, tag);
ok('C2  conserva DECLARED_MS=63000', tag.indexOf('DECLARED_MS=63000') !== -1, tag);
ok('C3  añade EFFECTIVE_TARGET_MS=15000', tag.indexOf('EFFECTIVE_TARGET_MS=15000') !== -1, tag);
ok('C4  añade EFFECTIVE_TARGET_S=15', tag.indexOf('EFFECTIVE_TARGET_S=15') !== -1, tag);
ok('C5  el máximo del envelope supera al objetivo', tag.indexOf('MAX_GE_TARGET=true') !== -1, tag);
ok('C6  MEASURED_ON_DEVICE=false', tag.indexOf('MEASURED_ON_DEVICE=false') !== -1, tag);
ok('C7  una sola línea, sin saltos', tag.indexOf('\n') === -1, tag);
const tagNoBw = L.bufferTag({ declaredMs: 60000, bandwidthKbps: NaN });
ok('C8  sin bitrate no revienta y dice el techo usado', tagNoBw.indexOf('CAP_S=15') !== -1, tagNoBw);

console.log('\n=== D · el flag está APAGADO por defecto ===');
eq('D1  sin la clave → false', L.isOn({}), false);
eq('D2  undefined → false', L.isOn({ APE_12P_MODE: undefined }), false);
eq('D3  "off" → false', L.isOn({ APE_12P_MODE: 'off' }), false);
eq('D4  "0" → false', L.isOn({ APE_12P_MODE: '0' }), false);
eq('D5  true → true', L.isOn({ APE_12P_MODE: true }), true);
eq('D6  "on" → true', L.isOn({ APE_12P_MODE: 'on' }), true);
eq('D7  sin scope → false', L.isOn(null), false);

console.log('\n=== E · los 4 defectos se detectan (y no se inventan) ===');
const bueno = {
    profiles: {
        P0: {
            id: 'P0',
            execution: { status: 'SIMULATED_EXECUTED', upscale_executed: true },
            settings: { bufferTargetSec: 15, bitrate: 200, codec: 'hevc', codec_string: 'hvc1.2.4.L153.B0,mp4a.40.2', video_range: 'PQ', audio_codec: 'mp4a.40.2' }
        }
    }
};
eq('E1  un perfil correcto no genera hallazgos', L.auditProfiles(bueno).length, 0);
const malo = {
    profiles: {
        P0: {
            id: 'P0',
            execution: { status: 'SIMULATED_EXECUTED', upscale_executed: true },
            settings: {
                bufferTargetSec: 63, playerBuffer: 25300, bitrate: 200,
                codec: 'av1', codec_string: 'hvc1.2.4.L183.B0,mp4a.40.2',
                video_range: 'SDR', hdr_mode: 'HDR10PLUS', audio_codec: 'ac-3'
            }
        },
        P1: { id: 'P1', execution: { status: 'OK' }, settings: { bufferTargetSec: 40, bitrate: 200 } }
    }
};
const f = L.auditProfiles(malo);
const codes = {};
for (const x of f) codes[x.code] = (codes[x.code] || 0) + 1;
ok('E2  D1 detectado (declarado > techo)', (codes.D1 || 0) >= 1, JSON.stringify(codes));
ok('E3  D1 también por playerBuffer < declarado', f.some(x => x.code === 'D1' && /playerBuffer/.test(x.detail)), JSON.stringify(f));
ok('E4  D3 detectado (codec av1 vs hvc1)', f.some(x => x.code === 'D3' && /codec_string/.test(x.detail)), JSON.stringify(f));
ok('E5  D3 detectado (SDR con HDR10PLUS)', f.some(x => x.code === 'D3' && /video_range/.test(x.detail)), JSON.stringify(f));
ok('E6  doctrina: P1 no declara upscale simulado', f.some(x => x.code === 'DOCTRINE' && x.profile === 'P1'), JSON.stringify(f));
eq('E7  doctrina: P0 sí lo declara', L.doctrineStatus(malo).simulated, 1);
const conHost = JSON.parse(JSON.stringify(bueno));
conHost.profiles.P0.settings.url = 'https://real-host-xyz.example.invalid/live.m3u8';
eq('E8  un host de ejemplo NO se marca como D4', L.auditProfiles(conHost).filter(x => x.code === 'D4').length, 0);
const conHostReal = JSON.parse(JSON.stringify(bueno));
conHostReal.profiles.P0.settings.url = 'https://algo-real-de-verdad.tv/live.m3u8';
eq('E9  un host real sí se marca como D4', L.auditProfiles(conHostReal).filter(x => x.code === 'D4').length, 1);
eq('E10 profiles como objeto y como array dan el mismo número', L.profileIds({ profiles: [{ id: 'A' }] }).length, 1);

console.log('\n=== F · auditoría de una lista generada ===');
const masterOk = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080\nhttps://example.invalid/a.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1280x720\nhttps://example.invalid/b.m3u8\n';
const aOk = L.auditList(masterOk);
eq('F1  master correcta: tipo master', aOk.kind, 'master');
eq('F2  master correcta: sin errores', aOk.ok, true);
eq('F3  master correcta: 2 STREAM-INF', aOk.counts.streaminf, 2);
const masterMal = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:-1,Canales\n#EXT-X-STREAM-INF:BANDWIDTH=8000000\n#EXTSHIMOTT:x\nhttps://example.invalid/a.m3u8\n#EXT-X-KEY:METHOD=NONE\n';
const aMal = L.auditList(masterMal);
ok('F4  master rota: detecta STREAM-INF sin URI al lado', aMal.errors.some(x => /no va seguido de su URI/.test(x)), JSON.stringify(aMal.errors));
ok('F5  master rota: detecta #EXTINF en master', aMal.errors.some(x => /#EXTINF/.test(x)), JSON.stringify(aMal.errors));
ok('F6  master rota: detecta TARGETDURATION en master', aMal.errors.some(x => /TARGETDURATION/.test(x)), JSON.stringify(aMal.errors));
ok('F7  master rota: detecta #EXT-X-KEY en master', aMal.errors.some(x => /#EXT-X-KEY/.test(x)), JSON.stringify(aMal.errors));
eq('F8  master rota: no es OK', aMal.ok, false);
const catalogo = '#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="G",Canal A\nhttps://example.invalid/a.m3u8\n#EXTINF:-1 tvg-id="b",Canal B\nhttps://example.invalid/b.m3u8\n';
const aCat = L.auditList(catalogo);
eq('F9  catálogo: tipo catalog', aCat.kind, 'catalog');
eq('F10 catálogo: sin errores', aCat.ok, true);
eq('F11 catálogo: 2 EXTINF', aCat.counts.extinf, 2);
const media = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg1.ts\n#EXT-X-ENDLIST\n';
eq('F12 media playlist: tipo media', L.auditList(media).kind, 'media');
eq('F13 media playlist: sin errores', L.auditList(media).ok, true);
const bufo = '#EXTM3U\n#EXTVLCOPT:http-user-agent=x\n#EXTINF:-1,Canal\n#EXT-X-BUFFER:X-Buffer-Target: 60000\n#EXT-X-BUFFER:Y X-Max-Buffer-Time: 15\nhttps://example.invalid/a.m3u8\n';
ok('F14 D1 en la salida: máximo por debajo del objetivo', L.auditList(bufo).errors.some(x => /D1:/.test(x)), JSON.stringify(L.auditList(bufo).errors));
const conBom = '\uFEFF#EXTM3U\n#EXTINF:-1,A\nhttps://example.invalid/a.m3u8\n';
ok('F15 BOM detectado', L.auditList(conBom).errors.some(x => /BOM/.test(x)), JSON.stringify(L.auditList(conBom).errors));

console.log('\n=== G · enganche en el generador y pureza del módulo ===');
const genPath = path.join(__dirname, '..', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const gen = fs.readFileSync(genPath, 'utf8').split('\n');
const idxCache = gen.findIndex(l => l.indexOf('lines.push(`#EXTVLCOPT:network-caching') !== -1);
const idxGuard = gen.findIndex(l => l.indexOf('window.APE_LAB_12P.bufferTag') !== -1);
ok('G1  existe el push de network-caching', idxCache > 0, 'línea ' + idxCache);
ok('G2  existe la guarda de la capa 12P', idxGuard > 0, 'línea ' + idxGuard);
ok('G3  la guarda va DESPUÉS del push (no altera el orden previo)', idxGuard > idxCache, idxCache + ' / ' + idxGuard);
ok('G4  la guarda va en las líneas siguientes (mismo bloque)', (idxGuard - idxCache) < 25, String(idxGuard - idxCache));
ok('G5  el flag se consulta con isOn (no con una constante)', gen.some(l => l.indexOf('APE_LAB_12P.isOn') !== -1));
ok('G6  hay try/catch: la capa 12P no puede romper la generación', gen.some(l => l.indexOf('catch (_e12p)') !== -1));
const mod = fs.readFileSync(path.join(__dirname, '..', 'js', 'ape-v9', 'lab-12p-conformance.js'), 'utf8');
ok('G7  el módulo no toca el DOM', mod.indexOf('document.') === -1);
ok('G8  el módulo no hace red', mod.indexOf('fetch(') === -1 && mod.indexOf('XMLHttpRequest') === -1);
ok('G9  el módulo no usa Date.now ni Math.random (determinista)', mod.indexOf('Date.now') === -1 && mod.indexOf('Math.random') === -1);
ok('G10 el módulo no emite nada (no usa lines.push): sólo audita', mod.indexOf('lines.push') === -1);

console.log('\nRESUMEN PASS=' + PASS + ' FAIL=' + FAIL);
process.exit(FAIL === 0 ? 0 : 1);
