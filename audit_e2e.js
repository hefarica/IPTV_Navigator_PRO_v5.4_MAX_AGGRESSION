// ═══════════════════════════════════════════════════════════════
// AUDITORÍA END-TO-END — Pre-Generación M3U8
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js';
const c = fs.readFileSync(path, 'utf8');
let pass = 0, fail = 0, warn = 0;

function ok(msg) { console.log(`  ✅ ${msg}`); pass++; }
function bad(msg) { console.log(`  ❌ ${msg}`); fail++; }
function warning(msg) { console.log(`  ⚠️ ${msg}`); warn++; }

console.log('═══════════════════════════════════════════════════════════');
console.log('  AUDITORÍA E2E — m3u8-typed-arrays-ultimate.js');
console.log('═══════════════════════════════════════════════════════════\n');

// ── CHECK 1: Sintaxis JS ──
console.log('🔍 CHECK 1: Sintaxis JavaScript');
try {
  new Function(c);
  ok('Sintaxis válida (parseable)');
} catch(e) {
  bad('Error de sintaxis: ' + e.message);
}

// ── CHECK 2: Phantom tags en header global ──
console.log('\n🔍 CHECK 2: Tags fantasma en header global');
const phantomPreload = (c.match(/push\(`#EXT-X-PRELOAD-HINT:URI=/g) || []).length;
const phantomSteering = (c.match(/push\(`#EXT-X-CONTENT-STEERING:SERVER-URI=/g) || []).length;
const phantomIframeUri = (c.match(/push\(`#EXT-X-I-FRAME-STREAM-INF:.*URI="iframe_primary/g) || []).length;
phantomPreload === 0 ? ok('Sin PRELOAD-HINT fantasma') : bad('PRELOAD-HINT fantasma: ' + phantomPreload);
phantomSteering === 0 ? ok('Sin CONTENT-STEERING fantasma') : bad('CONTENT-STEERING fantasma: ' + phantomSteering);
phantomIframeUri === 0 ? ok('Sin I-FRAME-STREAM-INF con URI fantasma en header') : bad('I-FRAME con URI fantasma: ' + phantomIframeUri);

// ── CHECK 3: EXT-X-MAP dinámico (no estático) ──
console.log('\n🔍 CHECK 3: EXT-X-MAP — init.mp4 dinámico via resolver');
const staticInit = (c.match(/EXT-X-MAP:URI="init\.mp4"/g) || []).length;
const dynamicInit = (c.match(/seg=init\.mp4/g) || []).length;
staticInit === 0 ? ok('Sin init.mp4 ESTÁTICO (elimina 404)') : bad('init.mp4 estático encontrado: ' + staticInit);
dynamicInit > 0 ? ok('init.mp4 DINÁMICO via resolver: ' + dynamicInit) : bad('Falta init.mp4 dinámico');

// ── CHECK 4: 1 URL por canal ──
console.log('\n🔍 CHECK 4: Regla 1 URL por canal');
const streamInfPush = (c.match(/lines\.push\(`#EXT-X-STREAM-INF:/g) || []).length;
const primaryUrlPush = (c.match(/lines\.push\(primaryUrl\)/g) || []).length;
console.log(`  📊 STREAM-INF pushes: ${streamInfPush}, primaryUrl pushes: ${primaryUrlPush}`);
if (primaryUrlPush === 1) ok('1 sola emisión de primaryUrl ✓');
else bad('Múltiples emisiones de primaryUrl: ' + primaryUrlPush);

// ── CHECK 5: EXT-X-MEDIA sin URI= ──
console.log('\n🔍 CHECK 5: EXT-X-MEDIA sin URI= (metadata pura)');
const mediaTotal = (c.match(/EXT-X-MEDIA:TYPE=AUDIO/g) || []).length;
const mediaWithUri = (c.match(/EXT-X-MEDIA:TYPE=AUDIO[^"]*URI="/g) || []).length;
console.log(`  📊 EXT-X-MEDIA totales: ${mediaTotal}`);
mediaWithUri === 0 ? ok('Ningún EXT-X-MEDIA con URI= (no abre conexiones extra)') : bad('EXT-X-MEDIA con URI=: ' + mediaWithUri);

// ── CHECK 6: I-FRAME-STREAM-INF sin URI= en L10 ──
console.log('\n🔍 CHECK 6: I-FRAME-STREAM-INF sin URI= en per-channel');
const iframeInL10 = (c.match(/lines\.push\(`#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=.*CODECS=/g) || []).length;
const iframeWithUri = (c.match(/lines\.push\(`#EXT-X-I-FRAME-STREAM-INF:.*URI="/g) || []).length;
console.log(`  📊 I-FRAME pushes: ${iframeInL10}`);
iframeWithUri === 0 ? ok('I-FRAME sin URI= (no abre conexión extra)') : bad('I-FRAME con URI=: ' + iframeWithUri);

// ── CHECK 7: Conteo total de lines.push() ──
console.log('\n🔍 CHECK 7: Conteo de líneas por canal');
const totalPush = (c.match(/lines\.push\(/g) || []).length;
console.log(`  📊 Total lines.push() en archivo: ${totalPush}`);
if (totalPush >= 790) ok(`${totalPush} líneas — arquitectura OMEGA completa`);
else bad(`Solo ${totalPush} líneas — puede faltar contenido`);

// ── CHECK 8: Funciones core existen ──
console.log('\n🔍 CHECK 8: Funciones core');
['generateChannelEntry', 'generateGlobalHeader', 'generateM3U8Stream', 'buildChannelUrl', 'build_extvlcopt', 'build_exthttp', 'build_kodiprop'].forEach(fn => {
  const regex = new RegExp('function\\s+' + fn + '|' + fn + '\\s*[=(]');
  regex.test(c) ? ok(`${fn}() existe`) : bad(`${fn}() NO ENCONTRADA`);
});

// ── CHECK 9: Capas L0-L9 intactas ──
console.log('\n🔍 CHECK 9: Capas L0-L9 intactas');
const layers = {
  'L0 EXTINF': /_extinf/,
  'L1 EXTVLCOPT': /build_extvlcopt/,
  'L2 EXTHTTP': /build_exthttp/,
  'L3 KODIPROP': /build_kodiprop/,
  'L4 CMAF': /EXT-X-CMAF/,
  'L5 HDR-DV': /EXT-X-APE-HDR-DV|APE-HDR/,
  'L6 TELCHEMY': /TELCHEMY/,
  'L7 EXTATTRFROMURL': /EXTATTRFROMURL/,
  'L8 APE Crystal': /EXT-X-APE-BUFFER-NUCLEAR/,
  'L9 PHANTOM': /PHANTOM-HYDRA/
};
Object.entries(layers).forEach(([name, regex]) => {
  regex.test(c) ? ok(`${name} presente`) : bad(`${name} AUSENTE`);
});

// ── CHECK 10: Variables OMEGA intactas ──
console.log('\n🔍 CHECK 10: Variables OMEGA');
['_sid796', '_nonce796', '_bw796', '_res796', '_fps796', '_codec796', '_codecAudio', '_hdrMode', '_avgBw'].forEach(v => {
  c.includes(v) ? ok(`${v} presente`) : bad(`${v} AUSENTE`);
});

// ── CHECK 11: Variantes fantasma eliminadas ──
console.log('\n🔍 CHECK 11: Variantes fantasma eliminadas');
const profileP5 = (c.match(/primaryUrl.*profile=P5/g) || []).length;
const profileP1 = (c.match(/primaryUrl.*profile=P1/g) || []).length;
const dvh1 = (c.match(/dvh1\.08\.06.*3840x2160.*120\.000/g) || []).length;
profileP5 === 0 ? ok('Sin URL fantasma &profile=P5') : bad('URL fantasma P5: ' + profileP5);
profileP1 === 0 ? ok('Sin URL fantasma &profile=P1') : bad('URL fantasma P1: ' + profileP1);
dvh1 === 0 ? ok('Sin variante 4K/120fps fantasma') : bad('Variante 4K/120fps fantasma: ' + dvh1);

// ═══════════════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  RESULTADO: ${pass} ✅ PASS | ${fail} ❌ FAIL | ${warn} ⚠️ WARN`);
if (fail === 0) {
  console.log('  🟢 LISTA PARA GENERAR — 0 fallos detectados');
} else {
  console.log('  🔴 NO GENERAR — Hay fallos que resolver');
}
console.log('═══════════════════════════════════════════════════════════\n');
