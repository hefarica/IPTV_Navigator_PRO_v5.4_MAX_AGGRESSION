#!/usr/bin/env node
'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * t62 · FAKE-UHD ASSERT — CRYSTAL FAKE-UHD (4K por DEFECTO, 8K opt-in)
 * ═══════════════════════════════════════════════════════════════════════════
 * ORDEN DIRECTA DEL PROPIETARIO (prevalece): «LO QUE SEA 4K LO VUELVA 8K, COMO
 * SEA. NO IMPORTA QUE LO HAGA COMO 8K FAKE COMO SEA» ⇒ el FAKE 8K está AUTORIZADO.
 *
 * Verificación OFFLINE sobre el CÓDIGO REAL: extrae el bloque `#region t29-core`
 * del emisor (donde vive `__apeStreamTruth`) y lo evalúa en `vm` con la cascada
 * REAL (`ape-hevc-cascade.js`). No hay reimplementación.
 *
 * Contrato cubierto (t62 — el default pasa de '8k' a '4k', decisión del propietario):
 *   R1  Default '4k': TODO canal declara 3840x2160 + L150 (≤30fps) / L153 (60fps) y
 *       ancla `#EXT-X-APE-UPSCALE:fake4k`. Nunca se hereda la resolución del ADN: se
 *       declara por la capa. '8k' queda como OPT-IN explícito (`fakeUhd:'8k'`).
 *       POR QUÉ '4k': un player que filtra por RESOLUTION antes de descargar (Roku)
 *       puede descartar la única variante si declara 8K sobre panel 4K ⇒ pantalla negra.
 *   R2  Nivel SIEMPRE legal: 2160@30→L150 · 2160@60→L153 · 4320@30→L180 · 4320@60→L183
 *       (@120→L186, que se evita capando FRAME-RATE a 60). Prohibido 8K con L153.
 *       Gate que FALLA si level < required(res,fps).
 *   R3  Familia preservada: HEVC→hvc1.2.4.L180/L183 · AVC 8K→avc1.64003E (High@6.2)
 *       · AVC 4K→avc1.640033 · AV1→av01.*. NUNCA hvc1 sobre bytes AVC.
 *   R4  PQ incondicional (lock 2026-06-16) también en el default nuevo.
 *   R5  `#EXT-X-APE-UPSCALE:fake4k` por canal en el default; `fake8k` sólo en opt-in.
 *   R6  Kill-switch `APE_FAKE_UHD`: (sin flag) ⇒ '4k' · '8k' ⇒ opt-in · '0'/0/false ⇒ off.
 *   R7  1 STREAM-INF por canal, 1 URL, directivas intactas.
 *
 * MUTACIÓN: el gate debe RECHAZAR los pares ilegales (8K+L153, 4K+L120, 8K+L120) y
 *           ADEMÁS §[8] revierte el default a '8k' en memoria y exige detectarlo
 *           (si alguien cambia `APE_FAKE_UHD_DEFAULT` a '8k', este gate cae).
 *
 * Uso:  node _vps_stage/tests/fake_uhd_assert.js   → 0 PASS / 1 FAIL
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const EMITTER = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const CASCADE = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'ape-hevc-cascade.js');

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; return true; }
  failures.push(detail ? `${name} — ${detail}` : name);
  return false;
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n── ${t}`);

const src = fs.readFileSync(EMITTER, 'utf8');
const iS = src.indexOf('// #region t29-core');
const iE = src.indexOf('// #endregion t29-core');
if (iS < 0 || iE < 0) { console.error('FATAL: bloque #region t29-core no encontrado'); process.exit(1); }
const region = src.slice(iS, iE);
const ctx = { console, window: {} };
vm.createContext(ctx);
vm.runInContext(region + '\n;globalThis.__T = { truth: __apeStreamTruth };', ctx);
const truth = ctx.__T.truth;
const cascade = require(CASCADE);

const idc = (c) => { const m = String(c || '').match(/\.L(\d+)\./); return m ? Number(m[1]) : -1; };
const is8k = (t) => /^7680x4320$/.test(String(t.resolution || ''));
const is4k = (t) => /^3840x2160$/.test(String(t.resolution || ''));
const required = (h, f) => (h >= 4320) ? ((f >= 100) ? 186 : ((f >= 50) ? 183 : 180))
  : (h >= 2160) ? ((f >= 50) ? 153 : 150) : (h >= 1440) ? 150
    : (h >= 1080) ? ((f >= 50) ? 123 : 120) : (h >= 720) ? 93 : (h >= 540) ? 90 : 63;

// Gate de par: FALLA si un canal que declara NxM lleva un nivel menor al requerido.
function checkPair(t) {
  if (/^avc1/i.test(t.codec)) return { ok: true };              // AVC tiene su propia escalera
  if (!/^hvc1/i.test(t.codec)) return { ok: true };             // AV1/VVC: fuera de la tabla HEVC
  const req = required(t.h, t.fps);
  const got = idc(t.codec);
  return (got >= req) ? { ok: true } : { ok: false, why: `${t.resolution}@${t.fps} con ${t.codec} < L${req}` };
}

console.log('══ t62 · FAKE-UHD ASSERT (4K declarado por defecto · 8K opt-in) ══');
console.log(`   emisor   ${EMITTER.split(path.sep).pop()} (${src.length} B, bloque ${region.length} B)`);
console.log(`   cascada  ${CASCADE.split(path.sep).pop()} (${Object.keys(cascade).length} exports)`);

// ═══════════════════════════════════════════════════════════════════════════
// [1] R1 · DEFAULT '4k': TODO canal declara 3840x2160 (opción segura, t62)
// ═══════════════════════════════════════════════════════════════════════════
section('[1] R1 · default 4K (seguro) para todos los perfiles');
for (const p of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  const r = truth({ profile: p, profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L150.B0', cascade, hdr: false });
  eq(`1.${p} ${p} sin flag declara 3840x2160`, r.resolution, '3840x2160');
  ok(`1.${p} ${p} nivel ≥ L150`, idc(r.codec) >= 150, r.codec);
  ok(`1.${p} ${p} marca fake4k (no fake8k)`, r.fakeUhd === '4k', String(r.fakeUhd));
}
{
  // sin argumento explícito ⇒ '4k' es el DEFAULT de la capa (decisión t62)
  const def = truth({ profile: 'P3', profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false });
  eq('1.7 sin flag ⇒ default 4K (3840x2160)', def.resolution, '3840x2160');
  eq('1.8 la marca es fake4k (no fake8k)', def.fakeUhd, '4k');
  ok('1.9 el source se declara fake-4k', def.source === 'fake-4k', def.source);
  eq('1.10 default @30fps ⇒ L150 (se corrige el L120 del hint)', idc(def.codec), 150);
  const def60 = truth({ profile: 'P3', profileResolution: '1920x1080', profileFps: 60, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false });
  eq('1.11 default @60fps ⇒ L153', idc(def60.codec), 153);
  ok('1.12 el default NUNCA declara 8K (anti-pantalla-negra en players que filtran)',
    def.resolution !== '7680x4320' && def60.resolution !== '7680x4320', `${def.resolution}/${def60.resolution}`);
  ok('1.13 el lock PQ sigue incondicional en el default', def.pqAllowed === true && def60.pqAllowed === true);
}
section('[1b] R1b · 8K sólo por OPT-IN explícito (fakeUhd:"8k")');
for (const p of ['P0', 'P1', 'P2']) {
  const r = truth({ profile: p, profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L150.B0', cascade, hdr: false, fakeUhd: '8k' });
  eq(`1b.${p} ${p} opt-in 8k declara 7680x4320`, r.resolution, '7680x4320');
  ok(`1b.${p} ${p} opt-in 8k nivel ≥ L180`, idc(r.codec) >= 180, r.codec);
  ok(`1b.${p} ${p} marca fakeUhd=8k`, r.fakeUhd === '8k', String(r.fakeUhd));
}
{
  // '4k' explícito y default deben coincidir (el default ES el modo 4k)
  const a = truth({ profile: 'P2', profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false });
  const b = truth({ profile: 'P2', profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false, fakeUhd: '4k' });
  ok('1b.4 default ≡ fakeUhd:"4k" (misma resolución, marca y nivel)',
    a.resolution === b.resolution && a.fakeUhd === b.fakeUhd && a.codec === b.codec && a.source === b.source,
    `${a.resolution}/${a.fakeUhd}/${a.codec} vs ${b.resolution}/${b.fakeUhd}/${b.codec}`);
}
{
  const byName = truth({ profile: 'P2', profileResolution: null, profileFps: 30, name: 'Canal 4K UHD', codecHint: 'hvc1.2.4.L153.B0', cascade, hdr: false, fakeUhd: '8k' });
  eq('1.10 el nombre «4K» no impide el 8K declarado', byName.resolution, '7680x4320');
}

// ═══════════════════════════════════════════════════════════════════════════
// [2] R2 · nivel legal para 8K: L180 / L183, nunca L153, nunca L186
// ═══════════════════════════════════════════════════════════════════════════
section('[2] R2 · 4320@30→L180 · 4320@60→L183 · sin L153 · sin L186');
{
  const t30 = truth({ profile: 'P2', profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L153.B0', cascade, hdr: false, fakeUhd: '8k' });
  eq('2.1 8K@30 ⇒ L180', idc(t30.codec), 180);
  const t60 = truth({ profile: 'P2', profileResolution: '1920x1080', profileFps: 60, codecHint: 'hvc1.2.4.L153.B0', cascade, hdr: false, fakeUhd: '8k' });
  eq('2.2 8K@60 ⇒ L183', idc(t60.codec), 183);
  const t120 = truth({ profile: 'P0', profileResolution: '7680x4320', profileFps: 120, codecHint: 'hvc1.2.4.L153.B0', cascade, hdr: false, fakeUhd: '8k' });
  eq('2.3 fps 120 se capa a 60 (evita L186)', t120.fps, 60);
  ok('2.4 8K declarado ⇒ NUNCA L186', idc(t120.codec) !== 186, t120.codec);
  ok('2.5 8K declarado ⇒ NUNCA L153 (freeze 08/06)', idc(t120.codec) !== 153, t120.codec);
  // el guard corrige una cascada que devuelva L153 para 8K
  const badCas = { resolveTierByResolution: () => ({ codec: 'hvc1.2.4.L153.B0', level: '5.1' }) };
  const fixed = truth({ profile: 'P1', profileResolution: '7680x4320', profileFps: 60, codecHint: 'hvc1.2.4.L153.B0', cascade: badCas, hdr: false, fakeUhd: '8k' });
  ok('2.6 si la cascada da L153 en 8K, el guard sube a L183', idc(fixed.codec) === 183 && fixed.levelCorrected === true, fixed.codec);
  let bad = 0;
  for (const f of [24, 30, 50, 60]) {
    const r = truth({ profile: 'P3', profileResolution: '1280x720', profileFps: f, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false, fakeUhd: '8k' });
    if (!checkPair(r).ok) bad += 1;
  }
  eq('2.7 cero pares ilegales en el barrido 8K@24/30/50/60', bad, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// [3] R3 · familia preservada (GOLDEN RULE) — 8K incluido
// ═══════════════════════════════════════════════════════════════════════════
section('[3] R3 · familia preservada, nunca hvc1 sobre AVC');
{
  const avc8k = truth({ profile: 'P4', profileResolution: '1280x720', profileFps: 30, codecHint: 'avc1.640028', cascade, hdr: false, fakeUhd: '8k' });
  eq('3.1 AVC en 8K ⇒ avc1.64003E (High@6.2)', avc8k.codec, 'avc1.64003E');
  ok('3.2 AVC NUNCA se declara hvc1 (GOLDEN RULE)', !/^hvc1/.test(avc8k.codec) && avc8k.family === 'AVC');
  const avc4k = truth({ profile: 'P4', profileResolution: '1280x720', profileFps: 30, codecHint: 'avc1.640028', cascade, hdr: false, fakeUhd: '4k' });
  eq('3.3 AVC en 4K (modo 4k) ⇒ avc1.640033', avc4k.codec, 'avc1.640033');
  const hevc = truth({ profile: 'P2', profileResolution: '3840x2160', profileFps: 30, codecHint: 'hvc1.2.4.L150.B0', cascade, hdr: false, fakeUhd: '8k' });
  ok('3.4 HEVC sigue HEVC y sube a nivel de 8K', /^hvc1\.2\.4\.L18[03]\.B0$/.test(hevc.codec), hevc.codec);
  // La tabla de la cascada es Main10 pura: un hint Main12 (.4.) se normaliza a
  // Main10 con nivel legal de 8K. No se exige preservar Main12 (no está en la tabla).
  const main12 = truth({ profile: 'P2', profileFps: 30, codecHint: 'hvc1.4.10.L180.B0', cascade, hdr: false, fakeUhd: '8k' });
  ok('3.5 un hint Main12 se emite como HEVC con nivel legal de 8K', /^hvc1\./.test(main12.codec) && idc(main12.codec) >= 180, main12.codec);
  const av1 = truth({ profile: 'P2', profileResolution: '3840x2160', profileFps: 30, codecHint: 'av01.0.13M.10', cascade, hdr: false, fakeUhd: '8k' });
  ok('3.6 AV1 sigue AV1 (av01.*)', /^av01\./.test(av1.codec), av1.codec);
}

// ═══════════════════════════════════════════════════════════════════════════
// [4] R4 · PQ incondicional
// ═══════════════════════════════════════════════════════════════════════════
section('[4] R4 · PQ incondicional (lock 2026-06-16)');
for (const p of ['P0', 'P3', 'P5']) {
  const r = truth({ profile: p, profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false, pqGate: true, fakeUhd: '8k' });
  ok(`4.${p} ${p} SDR + pqGate ⇒ PQ igualmente`, r.pqAllowed === true, `pq=${r.pqAllowed}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// [5] R5/R6 · etiquetas + kill-switch en los TRES modos
// ═══════════════════════════════════════════════════════════════════════════
section('[5] R5/R6 · fake8k / fake4k / off');
{
  const m8 = truth({ profile: 'P3', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false, fakeUhd: '8k' });
  ok('5.1 modo 8k ⇒ fakeUhd=8k (tag fake8k) y real8k=false', m8.fakeUhd === '8k' && m8.resolutionReal8k === false);
  const m4 = truth({ profile: 'P3', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false, fakeUhd: '4k' });
  eq('5.2 modo 4k ⇒ 3840x2160', m4.resolution, '3840x2160');
  eq('5.3 modo 4k ⇒ fakeUhd=4k (tag fake4k)', m4.fakeUhd, '4k');
  ok('5.4 modo 4k ⇒ nivel L150 (no por debajo)', idc(m4.codec) === 150, m4.codec);
  // DECISIÓN DEL CAPITÁN (2026-10-25): «la tabla manda». L153 es Level 5.1 y
  // soporta 2160p@60 por especificación; la prohibición de L153 es SÓLO para 8K.
  // El freeze del 2026-06-08 fue L153 sobre 8K@120, no sobre 4K. Queda bloqueado
  // aquí para que ninguna evolución futura lo cambie por L156 (violaría
  // «nivel ≤ necesario», Apple 1.11).
  const m4_60 = truth({ profile: 'P3', profileFps: 60, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false, fakeUhd: '4k' });
  ok('5.4b modo 4k @60 ⇒ L153 (tabla T9; prohibición de L153 es sólo 8K)', idc(m4_60.codec) === 153, m4_60.codec);
  ok('5.4c modo 4k @60 NO usa L156 (nivel ≤ necesario)', idc(m4_60.codec) !== 156, m4_60.codec);
  const off = truth({ profile: 'P3', profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false, fakeUhd: '0' });
  eq('5.5 kill-switch 0 ⇒ resolución previa intacta (1920x1080)', off.resolution, '1920x1080');
  ok('5.6 kill-switch 0 ⇒ nivel L120 y sin marca fake', idc(off.codec) === 120 && !off.fakeUhd, `${off.codec}/${off.fakeUhd}`);
  const offP1 = truth({ profile: 'P1', profileResolution: '7680x4320', profileFps: 60, codecHint: 'hvc1.2.4.L153.B0', cascade, hdr: false, fakeUhd: '0' });
  eq('5.7 kill-switch 0 NO altera la resolución original de P1', offP1.resolution, '7680x4320');
  const prevBool = truth({ profile: 'P3', profileResolution: '1280x720', profileFps: 30, codecHint: 'hvc1.2.4.L93.B0', cascade, hdr: false, fakeUhd: false });
  eq('5.8 fakeUhd=false se interpreta como off', prevBool.resolution, '1280x720');
}
{
  // 8K real (probe) en modo 8k ⇒ sin marca fake, con marca real
  const real = truth({ profile: 'P0', profileFps: 30, codecHint: 'hvc1.2.4.L180.B0', cascade, hdr: false, fakeUhd: '8k', probe: { resolution: '7680x4320', frameRate: 30 } });
  ok('5.9 8K real ⇒ fakeUhd=false y resolutionReal8k=true', real.fakeUhd === false && real.resolutionReal8k === true);
  eq('5.10 8K real ⇒ nivel L180', idc(real.codec), 180);
}

// ═══════════════════════════════════════════════════════════════════════════
// [6] MUTACIÓN INTERNA: pares ilegales DEBEN fallar el gate
// ═══════════════════════════════════════════════════════════════════════════
section('[6] Mutación: 8K+L153 / 4K+L120 / 8K+L120 deben FALLAR');
{
  ok('6.1 el gate RECHAZA 7680x4320 con L153 (freeze 2026-06-08)', checkPair({ codec: 'hvc1.2.4.L153.B0', w: 7680, h: 4320, fps: 30, resolution: '7680x4320' }).ok === false);
  ok('6.2 el gate RECHAZA 7680x4320 con L120', checkPair({ codec: 'hvc1.2.4.L120.B0', w: 7680, h: 4320, fps: 30, resolution: '7680x4320' }).ok === false);
  ok('6.3 el gate RECHAZA 3840x2160 con L120', checkPair({ codec: 'hvc1.2.4.L120.B0', w: 3840, h: 2160, fps: 30, resolution: '3840x2160' }).ok === false);
  ok('6.4 el gate ACEPTA 7680x4320 con L180 y L183', checkPair({ codec: 'hvc1.2.4.L180.B0', h: 4320, fps: 30, resolution: '7680x4320' }).ok && checkPair({ codec: 'hvc1.2.4.L183.B0', h: 4320, fps: 60, resolution: '7680x4320' }).ok);
  ok('6.5 el gate RECHAZA hvc1 declarado en familia AVC', (function () {
    const t = truth({ profile: 'P4', profileFps: 30, codecHint: 'avc1.640028', cascade, hdr: false, fakeUhd: '8k' });
    return /^hvc1/.test(t.codec) === false;   // el emisor nunca lo produce
  })());
}

// ═══════════════════════════════════════════════════════════════════════════
// [7] R7 + cableado estático
// ═══════════════════════════════════════════════════════════════════════════
section('[7] R7 · estructura y cableado');
{
  eq('7.1 un único push de #EXT-X-STREAM-INF por canal', (src.match(/lines\.push\(`#EXT-X-STREAM-INF:/g) || []).length, 1);
  eq('7.2 #EXT-X-APE-CHANNELS sigue presente (4)', (src.match(/#EXT-X-APE-CHANNELS/g) || []).length, 4);
  eq('7.3 tag #EXT-X-APE-UPSCALE:fake8k emitido una sola vez', (src.match(/lines\.push\(`#EXT-X-APE-UPSCALE:fake8k/g) || []).length, 1);
  eq('7.4 tag #EXT-X-APE-UPSCALE:fake4k emitido una sola vez', (src.match(/lines\.push\(`#EXT-X-APE-UPSCALE:fake4k/g) || []).length, 1);
  ok('7.5 fake8k se emite sólo con fakeUhd===\'8k\'', /if \(_streamTruth\.fakeUhd === '8k'\) \{\s*\n\s*lines\.push\(`#EXT-X-APE-UPSCALE:fake8k/.test(src));
  ok('7.6 el DEFAULT es la constante nombrada \'4k\' y \'8k\' exige comparación explícita', (function () {
    const m = src.match(/const APE_FAKE_UHD_DEFAULT = '([^']+)';/);
    const okConst = !!m && m[1] === '4k';
    const ok8kGuard = /o\.fakeUhd === '8k'/.test(src) && /window\.APE_FAKE_UHD === '8k'/.test(src);
    const okNoRevert = !/:\s*'8k'\s*[,)]/.test(src);      // ningún fallback por defecto a 8k
    return okConst && ok8kGuard && okNoRevert;
  })());
  ok('7.7 documentada la orden del propietario y el riesgo aceptado', /LO QUE SEA 4K LO VUELVA 8K/.test(src) && /RIESGO ACEPTADO/.test(src));
  ok('7.8 documentada la mitigación de edge (LEVER B) SIN implementarla aquí', /LEVER B/.test(src) && /EDGE degrade/.test(src));
  ok('7.9 documentada la física (techo HDMI 4K del stack)', /ONN 4K, Fire TV 4K Max/.test(src) && /HDMI/.test(src));
  const iTruth = src.indexOf('_codec796_csv = _streamTruth.codec');
  const iPush = src.indexOf('lines.push(`#EXT-X-STREAM-INF:');
  const between = (iTruth > -1 && iPush > iTruth) ? src.slice(iTruth, iPush) : '';
  eq('7.10 el codec no se reasigna entre el truth y el STREAM-INF', (between.match(/_codec796_csv\s*=/g) || []).length, 1);
  ok('7.11 el default nombrado se usa en LOS DOS caminos (truth + window→option)',
    (src.match(/APE_FAKE_UHD_DEFAULT/g) || []).length >= 4,
    `ocurrencias=${(src.match(/APE_FAKE_UHD_DEFAULT/g) || []).length}`);
  ok('7.12 documentado el PORQUÉ (player que filtra por RESOLUTION ⇒ negro) y el opt-in 8K',
    /OPT-IN/.test(src) && /(descartar|descartarla)/i.test(src));
  ok('7.13 documentado cómo pedir 8K sin tocar código (window.APE_FAKE_UHD = \'8k\')',
    /window\.APE_FAKE_UHD = '8k'/.test(src));
}

// ═══════════════════════════════════════════════════════════════════════════
// [8] ANTI-REGRESIÓN DEL DEFAULT · revertir '4k'→'8k' DEBE detectarse
// ═══════════════════════════════════════════════════════════════════════════
// Se muta EN MEMORIA la línea del default (no se escribe nada) y se re-evalúa el
// bloque real del emisor. Si el default vuelve a '8k', el canal sube a 7680x4320
// y las aserciones 1.7/1.8/1.10-1.12 de este gate fallan ⇒ el gate cae.
section('[8] Mutación anti-regresión: default revertido a \'8k\' debe ser detectado');
{
  const MARKER = "const APE_FAKE_UHD_DEFAULT = '4k';";
  ok('8.1 el default vive en UNA línea nombrada y greppable', region.includes(MARKER));
  const mutatedRegion = region.replace(MARKER, "const APE_FAKE_UHD_DEFAULT = '8k';");
  ok('8.2 la mutación aplicó de verdad (si se renombra la constante, el gate falla aquí)',
    mutatedRegion !== region);
  const mctx = { console, window: {} };
  vm.createContext(mctx);
  vm.runInContext(mutatedRegion + '\n;globalThis.__T = { truth: __apeStreamTruth };', mctx);
  const mtruth = mctx.__T.truth;
  const mdef = mtruth({ profile: 'P3', profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false });
  eq('8.3 con el default revertido el canal sube a 7680x4320 ⇒ la aserción 1.7 fallaría', mdef.resolution, '7680x4320');
  ok('8.4 con el default revertido la marca sería fake8k ⇒ 1.8/1b.4 fallarían', mdef.fakeUhd === '8k', String(mdef.fakeUhd));
  eq('8.5 con el default revertido el nivel sube a L180 ⇒ 1.10/1.11 fallarían', idc(mdef.codec), 180);
  ok('8.6 el default REAL (sin mutar) sigue siendo 4K en la misma corrida',
    truth({ profile: 'P3', profileResolution: '1920x1080', profileFps: 30, codecHint: 'hvc1.2.4.L120.B0', cascade, hdr: false }).resolution === '3840x2160');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════');
if (failures.length === 0) {
  console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
  console.log('NOTA HONESTA: no se ejecuta el emisor completo (necesita navegador);');
  console.log('              se evalúa el bloque real del emisor + la cascada real.');
  console.log('════════════════════════════════════════════════════');
  process.exit(0);
} else {
  console.log(`RESULTADO: FAIL — ${pass} OK, ${failures.length} fallo(s)`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log('════════════════════════════════════════════════════');
  process.exit(1);
}
