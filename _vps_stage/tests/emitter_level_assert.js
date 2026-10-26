#!/usr/bin/env node
'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * t29 · EMITTER LEVEL ASSERT — C2 fuente única + C5 denylist + G1 trazabilidad
 * ═══════════════════════════════════════════════════════════════════════════
 * Verificación OFFLINE, sin navegador y sin VPS:
 *
 *   [1] Extrae del EMISOR REAL (`m3u8-typed-arrays-ultimate.js`) el bloque
 *       `#region t29-core` … `#endregion t29-core` y lo evalúa en un `vm` con
 *       el módulo de cascada REAL (`ape-hevc-cascade.js`, que exporta por
 *       `module.exports`). No hay reimplementación: se prueba el código que
 *       se despliega.
 *
 *   [2] ≥10 casos de nivel: 4K@30→L150, 4K@60→L153, 1080p@30→L120,
 *       1080p@60→L123, 720p→L93, 480p→AVC.
 *
 *   [3] INVARIANTE DE PAREJA: RESOLUTION y CODECS salen del MISMO objeto
 *       {w,h,fps}; barrido de matriz + verificación aritmética de que el
 *       nivel no queda por debajo de la resolución (Ley Cardinal 1):
 *       prohibido 1080p con L150/L153, prohibido 4K con L120/L123.
 *
 *   [4] PQ sólo con HDR (cero PQ sobre SDR).
 *   [5] P2 deja de devolver 2560x1440 cuando la config activa dice 3840x2160.
 *   [6] Clamp de fps ≤ 60 (D1 / Apple 1.19).
 *   [7] C5: denylist de los 11 tóxicos + scrub string-level que NO toca CODECS.
 *   [8] G1: #EXT-X-APE-LAB-EXTRAS según includeLabExtras.
 *   [9] Cableado estático: los tags/llamadas están en el fuente.
 *
 *
 * CONTRATO QUE MIDE ESTE GATE (repair r3 · t45, 2026-10-25):
 *   Mide el contrato HONESTO PRE-FAKE del emisor: todas las llamadas a
 *   __apeStreamTruth pasan `fakeUhd: '0'`. Desde t62 el DEFAULT del emisor es
 *   fake-UHD '4k' (3840x2160 + L150/L153, ancla `:fake4k`) porque es la opción
 *   SEGURA — un player que filtra por RESOLUTION (Roku) puede descartar 8K sobre
 *   panel 4K ⇒ pantalla negra. `'8k'` (7680x4320 + L180/L183) es OPT-IN explícito.
 *   Su cobertura exhaustiva vive en `_vps_stage/tests/fake_uhd_assert.js` (88/88).
 *   La sección [10] deja constancia de la CONVIVENCIA de ambos contratos.
 * Uso:  node _vps_stage/tests/emitter_level_assert.js
 * Sale 0 si todo pasa, 1 si algo falla.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const EMITTER = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const CASCADE = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'ape-hevc-cascade.js');

// ── Harness ────────────────────────────────────────────────────────────────
let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; return true; }
  failures.push(detail ? `${name} — ${detail}` : name);
  return false;
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n── ${t}`);

// ── Carga del bloque real del emisor ──────────────────────────────────────
const src = fs.readFileSync(EMITTER, 'utf8');
const iStart = src.indexOf('// #region t29-core');
const iEnd = src.indexOf('// #endregion t29-core');
if (iStart < 0 || iEnd < 0) {
  console.error('FATAL: no se encontró el bloque #region t29-core en el emisor.');
  process.exit(1);
}
const region = src.slice(iStart, iEnd);

const ctx = {
  console,
  window: { APE_PROFILES_CONFIG: { getProfile: (id) => ({ includeLabExtras: String(id).toUpperCase() === 'P0' }) } },
};
vm.createContext(ctx);
vm.runInContext(
  region + `
  ;globalThis.__APE_T29 = {
      streamTruth: __apeStreamTruth,
      filterToxic: __apeFilterToxicHeaders,
      isToxic: __apeIsToxicHeader,
      scrub: __apeScrubToxicPairs,
      labExtras: __apeLabExtrasFlag,
      denylist: APE_TOXIC_DENYLIST
  };`,
  ctx,
);
const H = ctx.__APE_T29;
if (!H || typeof H.streamTruth !== 'function') {
  console.error('FATAL: el bloque t29-core no expuso __apeStreamTruth.');
  process.exit(1);
}

// ── Cascada REAL (sin tocar la tabla de tiers) ────────────────────────────
const cascade = require(CASCADE);
const T = (w, h, fps) => cascade.resolveTierByResolution(w, h, fps, {});
const idc = (codec) => {
  const m = String(codec || '').match(/\.L(\d+)\./);
  return m ? Number(m[1]) : -1;
};

console.log('══ t29 · EMITTER LEVEL ASSERT ══');
console.log(`   emisor   ${EMITTER.split(path.sep).pop()} (${src.length} B, bloque t29 = ${region.length} B)`);
console.log(`   cascada  ${CASCADE.split(path.sep).pop()} (${Object.keys(cascade).length} exports)`);

// ═══════════════════════════════════════════════════════════════════════════
// [2] Casos de nivel por resolución/fps
// ═══════════════════════════════════════════════════════════════════════════
section('[2] Nivel derivado del mismo {w,h,fps} (≥10 casos)');

const CASES = [
  // nombre,                       input,                                                   esperado codec
  ['4K@30 → L150', { profileResolution: '3840x2160', profileFps: 30, codecHint: 'hvc1.2.4.L183.B0' }, 'hvc1.2.4.L150.B0'],
  ['4K@60 → L153', { profileResolution: '3840x2160', profileFps: 60, codecHint: 'hvc1.2.4.L183.B0' }, 'hvc1.2.4.L153.B0'],
  ['4K@25 → L150', { profileResolution: '3840x2160', profileFps: 25, codecHint: 'hvc1.2.4.L153.B0' }, 'hvc1.2.4.L150.B0'],
  ['1080p@30 → L120', { profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L153.B0' }, 'hvc1.2.4.L120.B0'],
  ['1080p@60 → L123', { profileResolution: '1920x1080', profileFps: 60, codecHint: 'hvc1.2.4.L120.B0' }, 'hvc1.2.4.L123.B0'],
  ['720p@30 → L93', { profileResolution: '1280x720', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0' }, 'hvc1.2.4.L93.B0'],
  ['QHD@30 → L150', { profileResolution: '2560x1440', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0' }, 'hvc1.2.4.L150.B0'],
  ['540p@30 → L90', { profileResolution: '960x540', profileFps: 30, codecHint: 'hvc1.2.4.L93.B0' }, 'hvc1.2.4.L90.B0'],
  ['360p@30 → L63', { profileResolution: '640x360', profileFps: 30, codecHint: 'hvc1.2.4.L93.B0' }, 'hvc1.2.4.L63.B0'],
  ['8K@30 → L180', { profileResolution: '7680x4320', profileFps: 30, codecHint: 'hvc1.2.4.L153.B0' }, 'hvc1.2.4.L180.B0'],
];
for (const [name, input, expected] of CASES) {
  const r = H.streamTruth(Object.assign({ cascade, fakeUhd: '0', hdr: false }, input));
  eq(`2 · ${name}`, r.codec, expected);
  ok(`2 · ${name} · resolution coherente`, r.resolution === `${r.w}x${r.h}`, `res=${r.resolution}`);
}

// 480p → AVC (la rama anti-freeze F4 conserva la familia AVC; no se inventa HEVC)
{
  const r = H.streamTruth({ profileResolution: '854x480', profileFps: 30, codecHint: 'avc1.640028', cascade, fakeUhd: '0', hdr: false });
  ok('2 · 480p → AVC (no se inventa HEVC)', /^avc1\./.test(String(r.codec)), `codec=${r.codec}`);
  eq('2 · 480p → resolution 854x480', r.resolution, '854x480');
  ok('2 · 480p → family AVC', r.family === 'AVC', `family=${r.family}`);
}
// 720p con familia AVC también se respeta
{
  const r = H.streamTruth({ profileResolution: '1280x720', profileFps: 30, codecHint: 'avc1.640028', cascade, fakeUhd: '0', hdr: false });
  ok('2 · 720p+AVC se respeta como AVC', /^avc1\./.test(String(r.codec)), `codec=${r.codec}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// [3] INVARIANTE DE PAREJA: RESOLUTION y CODECS del MISMO objeto
// ═══════════════════════════════════════════════════════════════════════════
section('[3] RESOLUTION y CODECS del MISMO objeto + Ley Cardinal 1');

const MATRIX = [
  [3840, 2160, 24], [3840, 2160, 30], [3840, 2160, 50], [3840, 2160, 60],
  [2560, 1440, 30], [2560, 1440, 60],
  [1920, 1080, 25], [1920, 1080, 30], [1920, 1080, 50], [1920, 1080, 60],
  [1280, 720, 30], [1280, 720, 60],
  [960, 540, 30], [640, 360, 30],
];
let pairFails = 0;
let lcFails = 0;
for (const [w, h, fps] of MATRIX) {
  const r = H.streamTruth({ profileResolution: `${w}x${h}`, profileFps: fps, codecHint: 'hvc1.2.4.L153.B0', cascade, fakeUhd: '0', hdr: false });
  const tier = T(w, h, fps);
  const tag = `${w}x${h}@${fps}`;
  // (a) el codec ES exactamente el tier de ESE {w,h,fps}
  if (r.codec !== tier.codec || r.resolution !== `${w}x${h}`) {
    pairFails += 1;
    console.error(`   ✗ pareja rota ${tag}: res=${r.resolution} codec=${r.codec} (tier=${tier.codec})`);
  }
  // (b) Ley Cardinal 1: el nivel declarado cubre la resolución declarada
  const need = (h >= 2160 && fps >= 50) ? 153 : (h >= 2160 ? 150 : (h >= 1080 && fps >= 50 ? 123 : (h >= 1080 ? 120 : (h >= 720 ? 93 : 63))));
  if (idc(r.codec) < need) {
    lcFails += 1;
    console.error(`   ✗ nivel por debajo de la resolución ${tag}: codec=${r.codec} (necesita L${need})`);
  }
}
ok('3.1 cero parejas incoherentes en la matriz (14 combinaciones)', pairFails === 0, `${pairFails} fallos`);
ok('3.2 cero niveles por debajo de la resolución (Ley Cardinal 1)', lcFails === 0, `${lcFails} fallos`);

// Pares IMPOSIBLES explícitamente prohibidos
{
  const r1080 = H.streamTruth({ profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L150.B0', cascade, fakeUhd: '0', hdr: false });
  ok('3.3 prohibido 1080p con L150 (se corrige a L120)', idc(r1080.codec) !== 150 && idc(r1080.codec) === 120, `codec=${r1080.codec}`);
  const r4k = H.streamTruth({ profileResolution: '3840x2160', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, fakeUhd: '0', hdr: false });
  ok('3.4 prohibido 4K con L120 (se corrige a L150)', idc(r4k.codec) === 150, `codec=${r4k.codec}`);
  const r4k60 = H.streamTruth({ profileResolution: '3840x2160', profileFps: 60, codecHint: 'hvc1.2.4.L123.B0', cascade, fakeUhd: '0', hdr: false });
  ok('3.5 prohibido 4K@60 con L123 (se corrige a L153)', idc(r4k60.codec) === 153, `codec=${r4k60.codec}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// [4] PQ · LOCK 2026-06-16 ON por defecto + puerta por artefacto (ruta universal)
// ═══════════════════════════════════════════════════════════════════════════
section('[4] PQ: default incondicional (lock) + puerta pqGate');
// Default = lock del propietario 2026-06-16: PQ SIEMPRE, incluso sobre SDR.
for (const p of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  const r = H.streamTruth({ profile: p, profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, fakeUhd: '0', hdr: false });
  ok(`4.${p} default sin pqGate ⇒ pqAllowed=true (lock 2026-06-16)`, r.pqAllowed === true, `pqAllowed=${r.pqAllowed}`);
}
{
  const rHdr = H.streamTruth({ profile: 'P1', profileResolution: '3840x2160', profileFps: 60, codecHint: 'hvc1.2.4.L153.B0', cascade, fakeUhd: '0', hdr: true });
  ok('4.7 P1 HDR ⇒ pqAllowed=true', rHdr.pqAllowed === true);
  // Puerta por artefacto: ruta universal / Roku ⇒ sólo con HDR probado.
  for (const p of ['P3', 'P4', 'P5']) {
    const r = H.streamTruth({ profile: p, profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, fakeUhd: '0', hdr: false, pqGate: true });
    ok(`4.8 ${p} ruta universal (pqGate) + SDR ⇒ pqAllowed=false (cero PQ)`, r.pqAllowed === false, `pqAllowed=${r.pqAllowed}`);
  }
  const rGateHdr = H.streamTruth({ profileResolution: '3840x2160', profileFps: 60, codecHint: 'hvc1.2.4.L153.B0', cascade, fakeUhd: '0', hdr: true, pqGate: true });
  ok('4.9 ruta universal + HDR ⇒ pqAllowed=true (se conserva el HDR real)', rGateHdr.pqAllowed === true);
}
{
  // El escape por artefacto NO depende del helper: se resuelve en el cableado
  // (APE_PQ_UNCONDITIONAL === false ⇒ pqGate true). Aquí se comprueba que el
  // helper respeta pqGate de forma determinista en ambos sentidos.
  const sinGate = H.streamTruth({ profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, fakeUhd: '0', hdr: false });
  const conGate = H.streamTruth({ profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, fakeUhd: '0', hdr: false, pqGate: true });
  ok('4.10 pqGate es el ÚNICO discriminador de PQ sobre SDR', sinGate.pqAllowed === true && conGate.pqAllowed === false);
}

// ═══════════════════════════════════════════════════════════════════════════
// [5] P2 deja de devolver 2560x1440 cuando la config dice 3840x2160
// ═══════════════════════════════════════════════════════════════════════════
section('[5] P2 = config activa (no QHD inferido)');
{
  const r = H.streamTruth({ profile: 'P2', profileResolution: '3840x2160', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, fakeUhd: '0', hdr: false });
  ok('5.1 P2 con config 4K NO devuelve 2560x1440', r.resolution !== '2560x1440', `res=${r.resolution}`);
  eq('5.2 P2 con config 4K declara 3840x2160', r.resolution, '3840x2160');
  ok('5.3 P2 con config 4K lleva nivel ≥ L150', idc(r.codec) >= 150, `codec=${r.codec}`);
  eq('5.4 la fuente declarada es el perfil', r.source, 'profile');
}
{
  // Si NO hay perfil (getProfile no resolvió), se infiere del nombre.
  const r = H.streamTruth({ profile: 'P2', profileResolution: null, profileFps: null, name: 'beIN Sports 1 4K', codecHint: 'hvc1.2.4.L120.B0', cascade, fakeUhd: '0', hdr: false });
  eq('5.5 sin perfil ⇒ se infiere del nombre (4K)', r.resolution, '3840x2160');
  eq('5.6 la fuente declarada es el nombre', r.source, 'name');
}

// ═══════════════════════════════════════════════════════════════════════════
// [6] Clamp de fps ≤ 60 (D1 / Apple 1.19)
// ═══════════════════════════════════════════════════════════════════════════
section('[6] FRAME-RATE nunca > 60');
{
  const r = H.streamTruth({ profile: 'P0', profileResolution: '3840x2160', profileFps: 120, codecHint: 'hvc1.2.4.L153.B0', cascade, fakeUhd: '0', hdr: false });
  ok('6.1 fps 120 se clampa a 60', r.fps === 60, `fps=${r.fps}`);
  eq('6.2 fpsRaw conserva la intención', r.fpsRaw, 120);
  ok('6.3 el nivel usa el fps clampado (4K@60 → L153)', idc(r.codec) === 153, `codec=${r.codec}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// [7] C5 · denylist de los 11 tóxicos + scrub que NO toca CODECS
// ═══════════════════════════════════════════════════════════════════════════
section('[7] C5 · denylist (11) y scrub');
eq('7.1 la denylist tiene 11 patrones', H.denylist.length, 11);
{
  const obj = {
    'User-Agent': 'VLC/3.0.21', 'Accept': '*/*', 'Accept-Encoding': 'identity',
    'Range': 'bytes=0-1', 'If-None-Match': '*', 'If-Modified-Since': 'Mon, 01 Jan 2024 00:00:00 GMT',
    'TE': 'trailers', 'Priority': 'u=0, i', 'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive', 'Keep-Alive': 'timeout=5', 'Proxy-Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'video', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'cross-site',
    'Sec-CH-UA': '"Chrome"', 'Sec-CH-UA-Mobile': '?0', 'Sec-CH-UA-Platform': '"Windows"',
    'X-Video-Codecs': 'hvc1, hev1, avc1',
  };
  const before = Object.keys(obj).length;      // 19 claves
  const res = H.filterToxic({ ...obj });
  const left = Object.keys(res.filtered);
  ok('7.2 se quitaron las 15 entradas tóxicas', res.removed.length === 15, `removed=${res.removed.length} (${res.removed.join(',')})`);
  ok('7.3 no queda ninguna clave tóxica', left.every((k) => !H.isToxic(k)), left.join(','));
  ok('7.4 se conservan los 4 headers legítimos', left.length === before - 15 && left.includes('User-Agent') && left.includes('X-Video-Codecs'), `left=${left.length}: ${left.join(',')}`);
  ok('7.5 isToxic es case-insensitive para familias', H.isToxic('sec-fetch-dest') === true && H.isToxic('SEC-CH-UA-PLATFORM') === true);
  ok('7.6 isToxic no marca un header legítimo', H.isToxic('X-Video-Codecs') === false && H.isToxic('Accept') === false);
}
{
  const dirty = '#EXTHTTP:{"User-Agent":"VLC","Range":"bytes=0-1","TE":"trailers","Sec-CH-UA-Mobile":"?0","X-Video-Codecs":"hvc1,hev1"}';
  const out = H.scrub(dirty);
  ok('7.7 el scrub detecta ≥3 pares', out.hits >= 3, `hits=${out.hits}`);
  ok('7.8 el scrub elimina Range/TE/Sec-CH-UA', !/"Range"|"TE"|"Sec-CH-UA/.test(out.text), out.text);
  ok('7.9 el scrub NO toca CODECS ni la verdad de codec', /hvc1,hev1/.test(out.text) && out.text.includes('"User-Agent"'), out.text);
  ok('7.10 el scrub deja JSON válido', (() => { try { JSON.parse(out.text.replace(/^#EXTHTTP:/, '')); return true; } catch (_e) { return false; } })());
}

// ═══════════════════════════════════════════════════════════════════════════
// [8] G1 · LAB-EXTRAS
// ═══════════════════════════════════════════════════════════════════════════
section('[8] G1 · #EXT-X-APE-LAB-EXTRAS');
eq('8.1 P0 (includeLabExtras=true) ⇒ 1', H.labExtras({ profile: 'P0' }), 1);
eq('8.2 P3 (includeLabExtras=false) ⇒ 0', H.labExtras({ profile: 'P3' }), 0);
eq('8.3 options.includeLabExtras=true gana ⇒ 1', H.labExtras({ profile: 'P3', includeLabExtras: true }), 1);
eq('8.4 options.includeLabExtras=false gana ⇒ 0', H.labExtras({ profile: 'P0', includeLabExtras: false }), 0);

// ═══════════════════════════════════════════════════════════════════════════
// [9] Cableado estático en el emisor real
// ═══════════════════════════════════════════════════════════════════════════
section('[9] Cableado estático (el código nuevo está EN GANCHO)');
ok('9.1 llamada a __apeStreamTruth desde el emisor', (src.match(/__apeStreamTruth\(/g) || []).length >= 2, 'helper + llamada');
ok('9.2 el STREAM-INF se emite con _res796_csv/_codec796_csv del truth', /_res796_csv\s*=\s*_streamTruth\.resolution/.test(src) && /_codec796_csv\s*=\s*_streamTruth\.codec/.test(src));
ok('9.3 tag de trazabilidad #EXT-X-APE-STREAM-TRUTH', src.includes('#EXT-X-APE-STREAM-TRUTH:'));
ok('9.4 PQ: lock ON por defecto + puerta por artefacto', src.includes('APE_PQ_UNCONDITIONAL') && src.includes('APE_PQ_UNIVERSAL_ROUTE') && /pqGate\s*:\s*\(typeof window/.test(src));
ok('9.5 denylist aplicada al payload EXTHTTP', src.includes('__apeFilterToxicHeaders(_httpPayload)'));
ok('9.6 scrub string-level sobre la salida', src.includes('__apeScrubToxicPairs(_finalM3U)'));
ok('9.7 tag #EXT-X-APE-DENYLIST-REMOVED', src.includes('#EXT-X-APE-DENYLIST-REMOVED:'));
ok('9.8 tag #EXT-X-APE-LAB-EXTRAS en cabecera', (src.match(/#EXT-X-APE-LAB-EXTRAS:\$\{__apeLabExtrasFlag\(options\)\}/g) || []).length >= 3);
ok('9.9 resolver URL con url= codificado', /&url=\$\{encodeURIComponent\(primaryUrl\)\}/.test(src));
ok('9.10 tag #EXT-X-APE-RESOLVER-URL', src.includes('#EXT-X-APE-RESOLVER-URL:'));
ok('9.11 la tabla de tiers NO se tocó (T8=L150 4K@30)', T(3840, 2160, 30).codec === 'hvc1.2.4.L150.B0');
ok('9.12 T9=L153 4K@60 (sin cambios)', T(3840, 2160, 60).codec === 'hvc1.2.4.L153.B0');

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// [10] CONVIVENCIA · el contrato FAKE-UHD por defecto ('4k' desde t62) sigue vigente
// ═══════════════════════════════════════════════════════════════════════════
section('[10] Convivencia: fakeUhd default (4k) vs opt-in 8k vs contrato honesto (fakeUhd:0)');
// Este gate mide el contrato HONESTO (todas las llamadas pasan fakeUhd:'0').
// Aquí se deja constancia de que el default VIGENTE (t62: fake-UHD '4k') no se ha
// roto con este repair, y de que '8k' sigue existiendo sólo como opt-in.
// Su cobertura exhaustiva vive en `_vps_stage/tests/fake_uhd_assert.js` (88/88).
{
  const def60 = H.streamTruth({ profileResolution: '3840x2160', profileFps: 60, codecHint: 'hvc1.2.4.L153.B0', cascade, hdr: false });
  eq('10.1 default sin fakeUhd ⇒ resolución fake 3840x2160 (segura)', def60.resolution, '3840x2160');
  ok('10.2 default sin fakeUhd ⇒ nivel L153 (4K@60)', idc(def60.codec) === 153, `codec=${def60.codec}`);
  eq('10.3 default sin fakeUhd ⇒ la fuente se declara fake-4k', def60.source, 'fake-4k');
  const def30 = H.streamTruth({ profile: 'P2', profileResolution: '3840x2160', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false });
  ok('10.4 default con perfil P2 4K@30 ⇒ 3840x2160 + L150', def30.resolution === '3840x2160' && idc(def30.codec) === 150, `res=${def30.resolution} codec=${def30.codec}`);
  const hon60 = H.streamTruth({ profileResolution: '3840x2160', profileFps: 60, codecHint: 'hvc1.2.4.L183.B0', cascade, hdr: false, fakeUhd: '0' });
  ok('10.5 fakeUhd:0 ⇒ contrato honesto 3840x2160 + L153 + source profile', hon60.resolution === '3840x2160' && idc(hon60.codec) === 153 && hon60.source === 'profile', `res=${hon60.resolution} codec=${hon60.codec} source=${hon60.source}`);
  const f8k = H.streamTruth({ profileResolution: '3840x2160', profileFps: 30, codecHint: 'hvc1.2.4.L183.B0', cascade, hdr: false, fakeUhd: '8k' });
  ok('10.6 fakeUhd:8k sigue siendo OPT-IN distinto (7680x4320 + L180 + fake-8k)',
    f8k.resolution === '7680x4320' && idc(f8k.codec) === 180 && f8k.source === 'fake-8k',
    `res=${f8k.resolution} codec=${f8k.codec} source=${f8k.source}`);
  const f4k = H.streamTruth({ profileResolution: '3840x2160', profileFps: 30, codecHint: 'hvc1.2.4.L183.B0', cascade, hdr: false, fakeUhd: '4k' });
  ok('10.7 fakeUhd:4k explícito ≡ default (misma resolución/nivel/source)',
    f4k.resolution === def30.resolution && f4k.source === 'fake-4k' && idc(f4k.codec) === idc(def30.codec),
    `res=${f4k.resolution} codec=${f4k.codec} source=${f4k.source}`);
  ok('10.8 el default NO emite 8K (anti-pantalla-negra en players que filtran por RESOLUTION)',
    def30.resolution !== '7680x4320' && def60.resolution !== '7680x4320');
}

// RESUMEN
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════');
if (failures.length === 0) {
  console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
  console.log('NOTA HONESTA: no se ejecutó el emisor completo (browser IIFE);');
  console.log('              se evalúa su bloque t29 real + la cascada real.');
  console.log('════════════════════════════════════════════════════');
  process.exit(0);
} else {
  console.log(`RESULTADO: FAIL — ${pass} OK, ${failures.length} fallo(s)`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log('════════════════════════════════════════════════════');
  process.exit(1);
}
