#!/usr/bin/env node
/**
 * test_ape_profile_classifier.js — Tests del clasificador atomico de perfiles APE.
 *
 * Corre con:  node tools/quality/test_ape_profile_classifier.js
 * Sale 0 SOLO si todos los casos pasan. Sale 1 si alguno falla.
 *
 * Sin dependencias externas. Sin red. Determinista.
 *
 * PROCEDENCIA DE LOS CASOS "REALES":
 *   - Los 9 pares (Profile,Tier) y sus conteos son los medidos en la lista servida
 *     (21.224 canales): P3+T5 14462, P3+T6 4405, P3+T7 1320, P1+T8 672, P1+T9 255,
 *     P3+T9 35, P4+T5 20, P1+T5 6, P5+T5 5.  Suma = 21.180.
 *     (Los 44 canales restantes NO tienen par atribuido: NO COMPUTADO, no se rellenan.)
 *   - La tabla de perfiles y sus valores (resolucion, codec, design_bps, fuse_bps)
 *     se leen del contrato contracts/ape_profiles_12.json, cuyos valores fueron
 *     medidos en artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json
 *     (sha256 71307d9a6ce49cf4d384c6c894093e15011891306107b970de6768efff953e30).
 */

'use strict';

const path = require('path');

const CLASSIFIER_PATH = path.resolve(__dirname, '../../IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js');
const CONTRACT_PATH = path.resolve(__dirname, '../../contracts/ape_profiles_12.json');

const C = require(CLASSIFIER_PATH);
const fs = require('fs');

/* ────────────────────────────────────────────────────────────────────────────
 * Mini harness (sin deps)
 * ──────────────────────────────────────────────────────────────────────────── */

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    process.stdout.write(`  PASS  ${name}\n`);
  } else {
    failed++;
    failures.push({ name, detail });
    process.stdout.write(`  FAIL  ${name}${detail ? '  <- ' + detail : ''}\n`);
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, `esperado=${JSON.stringify(expected)} obtenido=${JSON.stringify(actual)}`);
}

function section(title) {
  process.stdout.write(`\n=== ${title} ===\n`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 0. INTEGRIDAD DEL CONTRATO
 * ──────────────────────────────────────────────────────────────────────────── */

section('0 · Integridad del contrato (12 perfiles)');

const raw = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const ids = raw.profiles.map((p) => p.id);

eq('el contrato declara exactamente 12 perfiles', raw.profiles.length, 12);

const EXPECTED_IDS = ['P0', 'P0.5', 'P1', 'P1.5', 'P2', 'P2.5', 'P3', 'P3.5', 'P4', 'P4.5', 'P5', 'P5.5'];
eq('los 12 ids son los medidos en el LAB v24', JSON.stringify(ids.slice().sort()), JSON.stringify(EXPECTED_IDS.slice().sort()));

eq('el clasificador carga los 12 perfiles', C.profileIds().length, 12);

// Campos obligatorios por perfil (los que pide la mision).
const REQUIRED_FIELDS = ['id', 'name', 'level', 'quality', 'codec_ladder', 'design_bps', 'fuse_bps', 'resolution_cap', 'hdr', 'buffer', 'source', 'fallback', 'fallback_chain'];
const missing = [];
for (const p of raw.profiles) {
  for (const f of REQUIRED_FIELDS) {
    if (p[f] === undefined) missing.push(`${p.id}.${f}`);
  }
}
ok('todos los perfiles declaran todos los campos exigidos', missing.length === 0, missing.join(', '));

// Cada perfil declara su FALLBACK_CHAIN.
const badChain = raw.profiles.filter((p) => !Array.isArray(p.fallback_chain)).map((p) => p.id);
ok('cada perfil declara FALLBACK_CHAIN como array', badChain.length === 0, badChain.join(','));

/**
 * Monotonia de la cadena de fallback.
 *
 * Regla medida: la cadena desciende en capacidad SIEMPRE, con UNA excepcion
 * documentada: P0.5 nace de un DOWNSAMPLE de 8K (mode=adaptive_downscale,
 * 8k_downsample_lanczos_0.75), asi que su fallback a P0 no sube calidad: quita la
 * emulacion y devuelve la fuente real 8K, que es mejor. Ver
 * contracts/ape_profiles_12.json#/fallback_edge_semantics.
 *
 * Se exige, sin excepcion:
 *   - ningun perfil se auto-referencia;
 *   - en un perfil emulado, fallback_chain[0] === base_profile;
 *   - desde fallback_chain[0] en adelante (o desde el inicio en los canonicos),
 *     la cadena desciende estrictamente.
 * Un perfil canonico que suba de capacidad = fallo duro.
 */
const badOrder = [];
for (const p of raw.profiles) {
  const cap = C.capHeight(p.resolution_cap);
  const chain = p.fallback_chain || [];

  if (chain.indexOf(p.id) !== -1) badOrder.push(`${p.id}->${p.id} (auto-referencia)`);

  let from = 0;
  if (p.emulated) {
    if (chain[0] !== p.base_profile) {
      badOrder.push(`${p.id}: fallback_chain[0] debe ser su base_profile ${p.base_profile}, es ${chain[0]}`);
    }
    // La arista emulado->base es la unica que puede subir; se salta para la monotonia.
    from = 1;
  } else if (chain.length) {
    // Un canonico jamas puede caer a un perfil de mayor capacidad.
    const firstCap = C.capHeight((raw.profiles.find((q) => q.id === chain[0]) || {}).resolution_cap);
    if (firstCap > cap) badOrder.push(`${p.id} (canonico) -> ${chain[0]} sube de ${cap} a ${firstCap}`);
  }

  for (let i = from; i < chain.length; i++) {
    const stepCap = C.capHeight((raw.profiles.find((q) => q.id === chain[i]) || {}).resolution_cap);
    if (stepCap > cap) badOrder.push(`${p.id}->${chain[i]} sube de ${cap} a ${stepCap}`);
    if (i > 0) {
      const prevCap = C.capHeight((raw.profiles.find((q) => q.id === chain[i - 1]) || {}).resolution_cap);
      if (stepCap > prevCap) badOrder.push(`${p.id}: ${chain[i - 1]}->${chain[i]} no desciende`);
    }
  }
}
ok('ninguna cadena de fallback sube (salvo la arista emulado->base documentada) ni se auto-referencia',
  badOrder.length === 0, badOrder.join('; '));

// La arista P0.5->P0 es la UNICA que sube capacidad; se prueba que es exclusiva.
const risingEdges = [];
for (const p of raw.profiles) {
  const cap = C.capHeight(p.resolution_cap);
  const chain = p.fallback_chain || [];
  const from = p.emulated ? 1 : 0;
  for (let i = from; i < chain.length; i++) {
    const stepCap = C.capHeight((raw.profiles.find((q) => q.id === chain[i]) || {}).resolution_cap);
    if (stepCap > cap) risingEdges.push(`${p.id}->${chain[i]}`);
  }
  if (p.emulated && chain.length) {
    const baseCap = C.capHeight((raw.profiles.find((q) => q.id === chain[0]) || {}).resolution_cap);
    if (baseCap > cap) risingEdges.push(`${p.id}->${chain[0]}(base)`);
  }
}
ok('la unica arista que sube capacidad es P0.5->P0 (downsample de 8K), y esta documentada',
  risingEdges.length === 1 && risingEdges[0].indexOf('P0.5') === 0, risingEdges.join(', '));

// Invariante del fusible: fuse_bps <= design_bps (12/12).
const bwBad = C.checkBandwidthInvariant();
ok('invariante fuse_bps <= design_bps en los 12 perfiles', bwBad.length === 0, bwBad.join('; '));

// Los 6 derivados deben declarar base_profile y truth_guard.
const badDerived = raw.profiles
  .filter((p) => p.emulated)
  .filter((p) => !p.base_profile || !p.truth_guard)
  .map((p) => p.id);
ok('los 6 perfiles emulados declaran base_profile y truth_guard', badDerived.length === 0, badDerived.join(','));
eq('hay exactamente 6 perfiles emulados', raw.profiles.filter((p) => p.emulated).length, 6);

/* ────────────────────────────────────────────────────────────────────────────
 * 1. LOS 9 PARES (Profile,Tier) MEDIDOS EN LA LISTA SERVIDA
 * ──────────────────────────────────────────────────────────────────────────── */

section('1 · Los 9 pares P+T reales de la lista servida');

/**
 * Cada par con un canal representativo cuyo probe VERIFICADO coincide con la
 * resolucion real del perfil. Si el clasificador contradice al par medido, el
 * perfil del canal estaba mal o el clasificador esta mal: cualquiera de las dos
 * cosas debe romper el test.
 */
const PAIRS = [
  { pair: 'P3+T5', count: 14462, profile: 'P3', probe: { width: 1920, height: 1080, codec: 'hvc1.2.4.L123.B0', fps: 60, hdr: 'SDR', bitrate: 9, verified: true } },
  { pair: 'P3+T6', count: 4405, profile: 'P3', probe: { width: 1920, height: 1080, codec: 'hvc1.2.4.L123.B0', fps: 60, hdr: 'HLG', bitrate: 10, verified: true } },
  { pair: 'P3+T7', count: 1320, profile: 'P3', probe: { width: 1920, height: 1080, codec: 'avc1.640028', fps: 60, hdr: 'SDR', bitrate: 8, verified: true } },
  { pair: 'P1+T8', count: 672, profile: 'P1', probe: { width: 3840, height: 2160, codec: 'hvc1.2.4.L153.B0', fps: 60, hdr: 'HDR10+', bitrate: 22, verified: true } },
  { pair: 'P1+T9', count: 255, profile: 'P1', probe: { width: 3840, height: 2160, codec: 'hvc1.2.4.L153.B0', fps: 60, hdr: 'HDR10', bitrate: 21, verified: true } },
  { pair: 'P3+T9', count: 35, profile: 'P3', probe: { width: 1920, height: 1080, codec: 'hvc1.2.4.L123.B0', fps: 60, hdr: 'SDR', bitrate: 9, verified: true } },
  { pair: 'P4+T5', count: 20, profile: 'P4', probe: { width: 1280, height: 720, codec: 'hvc1.2.4.L93.B0', fps: 30, hdr: 'SDR', bitrate: 6, verified: true } },
  { pair: 'P1+T5', count: 6, profile: 'P1', probe: { width: 3840, height: 2160, codec: 'hvc1.2.4.L153.B0', fps: 60, hdr: 'HDR10', bitrate: 20, verified: true } },
  { pair: 'P5+T5', count: 5, profile: 'P5', probe: { width: 854, height: 480, codec: 'avc1.42c01e', fps: 30, hdr: 'SDR', bitrate: 2, verified: true } }
];

let totalCensused = 0;
for (const item of PAIRS) {
  totalCensused += item.count;
  const ch = {
    name: `Canal ${item.pair}`,
    group: 'General',
    url: 'http://example/stream.m3u8',
    probe: item.probe
  };
  const r = C.classify(ch);
  eq(`${item.pair} (${item.count} canales) -> ${item.profile}`, r.profile, item.profile);
  ok(`${item.pair} devuelve confidence alta (probe verificado)`, r.confidence === 'high', `confidence=${r.confidence}`);
}

eq('los 9 pares suman 21.180 canales censados (no 21.224)', totalCensused, 21180);
process.stdout.write(
  `  nota  hueco declarado: ${21224 - totalCensused} canales sin par atribuido -> NO COMPUTADO, no se rellenan\n`
);

/* ────────────────────────────────────────────────────────────────────────────
 * 2. CASOS BORDE
 * ──────────────────────────────────────────────────────────────────────────── */

section('2 · Casos borde');

/* 2.1 — 4K REAL: nunca debe degradarse */
{
  const ch = {
    name: 'Canal 4K Real',
    group: 'Deportes',
    url: 'http://example/4k.m3u8',
    probe: { width: 3840, height: 2160, codec: 'hvc1.2.4.L153.B0', fps: 60, hdr: 'HDR10', bitrate: 25, verified: true }
  };
  const r = C.classify(ch);
  eq('4K real verificado -> P1', r.profile, 'P1');
  ok('4K real NUNCA cae a FHD/HD/SD (Ley Anti-Degradacion)',
    ['P0', 'P1', 'P2'].indexOf(r.profile) !== -1, `perfil=${r.profile}`);
  ok('4K real lleva señal probe_verified', r.signals.some((s) => s.indexOf('probe_verified') === 0), r.signals.join(','));
}

/* 2.2 — 4K SDR a 30fps: el split P1/P2 debe funcionar */
{
  const ch = {
    name: 'Canal 4K SDR',
    group: 'Cine',
    url: 'http://example/4ksdr.m3u8',
    probe: { width: 3840, height: 2160, codec: 'hvc1.2.4.L150.B0', fps: 30, hdr: 'SDR', bitrate: 15, verified: true }
  };
  const r = C.classify(ch);
  eq('4K SDR @30fps -> P2 (balanced, no P1)', r.profile, 'P2');
}

/* 2.3 — FHD DISFRAZADO DE 4K: el caso que la mision exige */
{
  const ch = {
    name: 'SUPER DEPORTES 4K UHD PREMIUM',
    group: 'Deportes',
    url: 'http://example/fake.m3u8',
    probe: { width: 1920, height: 1080, codec: 'hvc1.2.4.L123.B0', fps: 60, hdr: 'SDR', bitrate: 8, verified: false },
    truth: { src: 'fake-4k', w: 1920, h: 1080 }
  };
  const r = C.classify(ch);
  eq('fake-4k 1920x1080 -> P3 (FHD), NO P1 (4K)', r.profile, 'P3');
  ok('fake-4k NO se clasifica como 4K aunque el nombre diga 4K UHD',
    ['P0', 'P1', 'P2'].indexOf(r.profile) === -1, `perfil=${r.profile}`);
  ok('fake-4k emite la señal guard:fake_uhd_never_4k',
    r.signals.some((s) => s === 'guard:fake_uhd_never_4k'), r.signals.join(','));
  ok('fake-4k baja la confidence (no se presenta como medido)', r.confidence === 'low', `confidence=${r.confidence}`);
  ok('la reason de fake-4k explica que corregir metadata no es degradar',
    /no es degradar/i.test(r.reason), r.reason);
}

/* 2.4 — fake-4k con las dimensiones del override (3840x2160) tampoco es 4K */
{
  const ch = {
    name: 'Canal Fake Override',
    group: 'General',
    url: 'http://example/fake2.m3u8',
    probe: { width: 3840, height: 2160, codec: 'hvc1.2.4.L153.B0', fps: 60, hdr: 'SDR', bitrate: 6, verified: false },
    truth: { src: 'fake-4k', w: 3840, h: 2160 }
  };
  const r = C.classify(ch);
  eq('fake-4k con dims de override 3840x2160 -> P3 (no se acepta el override)', r.profile, 'P3');
  ok('se rechaza explicitamente el override fake-UHD',
    r.signals.some((s) => s.indexOf('fake_uhd_override_rejected') === 0), r.signals.join(','));
}

/* 2.5 — Canal SIN probe y SIN tokens */
{
  const ch = { name: 'Canal X', group: 'General', url: 'http://example/x.m3u8' };
  const r = C.classify(ch);
  eq('sin probe ni tokens -> P5', r.profile, 'P5');
  ok('la reason es no_evidence', r.reason.indexOf('no_evidence') === 0, r.reason);
  eq('el score de no_evidence es 0', r.score, 0);
  ok('no_evidence emite la señal correspondiente', r.signals.indexOf('no_evidence') !== -1, r.signals.join(','));
}

/* 2.6 — Canal PREMIUM sin probe: hipotesis, no medida */
{
  const ch = { name: 'DAZN LaLiga 4K', group: 'Deportes', url: 'http://example/dazn.m3u8' };
  const r = C.classify(ch);
  eq('premium 4K sin probe -> perfil superior de su cadena (P1)', r.profile, 'P1');
  ok('premium sin probe tiene confidence baja', r.confidence === 'low', `confidence=${r.confidence}`);
  ok('la reason declara que es HIPOTESIS y no medida', /hip[oó]tesis/i.test(r.reason), r.reason);
  ok('se listan los tokens que decidieron', r.signals.some((s) => s.indexOf('token:') === 0), r.signals.join(','));
}

/* 2.7 — Canal SD */
{
  const ch = {
    name: 'Canal SD',
    group: 'General',
    url: 'http://example/sd.m3u8',
    probe: { width: 854, height: 480, codec: 'avc1.42c01e', fps: 30, hdr: 'SDR', bitrate: 2, verified: true }
  };
  const r = C.classify(ch);
  eq('SD 854x480 -> P5', r.profile, 'P5');
  eq('P5 es terminal: fallback null', r.fallback, null);
}

/* 2.8 — 8K real: P0, y NUNCA se declara L153 sobre 8K */
{
  const good = {
    name: 'Canal 8K',
    group: 'Eventos',
    url: 'http://example/8k.m3u8',
    probe: { width: 7680, height: 4320, codec: 'dvh1.08.06', fps: 60, hdr: 'DOLBY_VISION', bitrate: 80, verified: true }
  };
  const rGood = C.classify(good);
  eq('8K real verificado -> P0', rGood.profile, 'P0');

  const bad = {
    name: 'Canal 8K mal declarado',
    group: 'Eventos',
    url: 'http://example/8kbad.m3u8',
    probe: { width: 7680, height: 4320, codec: 'hvc1.2.4.L153.B0', fps: 60, hdr: 'HDR10', bitrate: 80, verified: true }
  };
  const rBad = C.classify(bad);
  ok('L153 sobre 8K dispara contradiccion explicita',
    rBad.signals.some((s) => s.indexOf('contradiction:L153_on_8K') === 0), rBad.signals.join(','));
  eq('un 8K mal declarado sigue siendo P0 por la resolucion medida', rBad.profile, 'P0');
}

/* 2.9 — Ley Cardinal 1: nivel insuficiente se reporta */
{
  const ch = {
    name: 'Canal 4K con nivel bajo',
    group: 'Cine',
    url: 'http://example/low.m3u8',
    probe: { width: 3840, height: 2160, codec: 'hvc1.2.4.L120.B0', fps: 60, hdr: 'SDR', bitrate: 18, verified: true }
  };
  const r = C.classify(ch);
  ok('L120 sobre 2160p dispara cardinal1_violation',
    r.signals.some((s) => s.indexOf('cardinal1_violation') === 0), r.signals.join(','));
}

/* 2.10 — FALLBACK segun capacidad del device (R6) */
{
  const table = C.loadProfiles().table;
  const highEnd = C.resolveFallback('P1', table, { max_height: 2160 });
  eq('device 4K: fallback de P1 es P2 (un escalon)', highEnd.fallback, 'P2');

  const fhd = C.resolveFallback('P1', table, { max_height: 1080 });
  eq('device FHD: fallback de P1 es P3 (el inmediato que decodifica)', fhd.fallback, 'P3');

  const noDevice = C.resolveFallback('P1', table, null);
  eq('sin device: fallback declarado por el contrato', noDevice.fallback, 'P2');
  ok('sin device se declara basis=contract_declared', noDevice.basis === 'contract_declared', noDevice.basis);

  // Un device que no decodifica HEVC: P1 y P2 son hvc1 -> debe saltar a P4/P5 si son avc1.
  const avcOnly = C.resolveFallback('P1', table, { max_height: 2160, codecs: ['avc1.640028'] });
  ok('device solo-AVC no recibe un fallback HEVC',
    avcOnly.fallback === null || C.codecFamily(table[avcOnly.fallback].codec_full) === 'AVC',
    `fallback=${avcOnly.fallback}`);
}

/* 2.11 — Ningun perfil emulado se selecciona desde un probe */
{
  for (const id of ['P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5']) {
    const p = raw.profiles.find((x) => x.id === id);
    const capH = C.capHeight(p.resolution_cap);
    const ch = {
      name: `Probe ${id}`,
      group: 'General',
      url: 'http://example/e.m3u8',
      probe: { width: C.capWidth(p.resolution_cap), height: capH, codec: p.codec_full, fps: p.fps, hdr: p.hdr, bitrate: p.design_bps / 1e6, verified: true }
    };
    const r = C.classify(ch);
    ok(`un probe de ${capH}p nunca devuelve el perfil emulado ${id}`,
      r.profile !== id, `devuelto=${r.profile}`);
  }
}

/* 2.12 — Idempotencia: clasificar dos veces da el mismo resultado */
{
  const ch = {
    name: 'Idempotencia 4K',
    group: 'Deportes',
    url: 'http://example/i.m3u8',
    probe: { width: 3840, height: 2160, codec: 'hvc1.2.4.L153.B0', fps: 60, hdr: 'HDR10', bitrate: 22, verified: true }
  };
  const a = C.classify(ch);
  const b = C.classify(ch);
  eq('clasificar dos veces da el mismo perfil', JSON.stringify(a), JSON.stringify(b));
}

/* 2.13 — El contrato y el clasificador coinciden en los derivados .5 */
{
  let mismatch = 0;
  for (const p of raw.profiles.filter((x) => x.emulated)) {
    const table = C.loadProfiles().table[p.id];
    if (!table) { mismatch++; continue; }
    if (table.fallback !== p.fallback) mismatch++;
  }
  eq('los fallback de los 6 derivados coinciden entre contrato y clasificador', mismatch, 0);
}

/* 2.14 — Una declaracion 4K NO verificada no puede promocionar el canal.
 *
 * MEDIDO en scratch/LISTA_ACTUAL.m3u8 (604.593.696 B): el canal 1 (tvg-id=3,
 * "|AL| TOP CHANNEL FHD") declara #EXT-X-STREAM-INF RESOLUTION=3840x2160 con
 * CODECS="hvc1.2.4.L153.B0", pero su propio #KODIPROP max_resolution=1920x1080,
 * su #EXT-X-CMAF RESOLUTION=1920x1080 y su ape-codec-family="h264" dicen FHD.
 * Esa lista no trae #EXT-X-APE-STREAM-TRUTH (0 ocurrencias), asi que creer la
 * declaracion inflaria el canal a 4K.
 */
{
  const inflado = {
    name: '|AL| TOP CHANNEL FHD [line.tivi-ott.net]',
    group: 'EUROPA ORIENTAL / GENERALISTA / FULL HD',
    url: 'http://line.tivi-ott.net/3.m3u8',
    probe: { width: 3840, height: 2160, codec: 'hvc1.2.4.L153.B0', fps: 30, hdr: 'PQ', bitrate: 9, verified: false }
  };
  const r = C.classify(inflado);
  ok('un 4K declarado SIN verificar no promociona el canal a 4K (P1/P2 prohibidos)',
    ['P0', 'P1', 'P2'].indexOf(r.profile) === -1, `perfil=${r.profile}`);
  eq('el canal real inflado se clasifica por su nombre/grupo -> P3 (coincide con ape-profile="P3")', r.profile, 'P3');
  ok('se emite la señal guard:unverified_uhd_dims_not_evidence',
    r.signals.some((s) => s === 'guard:unverified_uhd_dims_not_evidence'), r.signals.join(','));
}

/* 2.15 — La MISMA declaracion SI vale cuando la verdad dice src=probe */
{
  const conProbeReal = {
    name: 'Canal 4K con truth probe',
    group: 'Cine',
    url: 'http://example/p.m3u8',
    probe: { width: 3840, height: 2160, codec: 'hvc1.2.4.L153.B0', fps: 60, hdr: 'HDR10', bitrate: 22, verified: false },
    truth: { src: 'probe', w: 3840, h: 2160 }
  };
  const r = C.classify(conProbeReal);
  ok('con STREAM-TRUTH src=probe el 4K declarado SI se acepta',
    ['P0', 'P1', 'P2'].indexOf(r.profile) !== -1, `perfil=${r.profile}`);
  ok('no se emite la guard de dims no verificadas', r.signals.indexOf('guard:unverified_uhd_dims_not_evidence') === -1, r.signals.join(','));
}

/* 2.16 — Regresion: el canal real sin probe coincide con el perfil que ya emite la lista */
{
  const real = {
    name: '|AL| TOP CHANNEL FHD [line.tivi-ott.net]',
    group: 'EUROPA ORIENTAL / GENERALISTA / FULL HD',
    url: 'http://line.tivi-ott.net/3.m3u8'
  };
  const r = C.classify(real);
  eq('canal real de produccion sin probe -> P3, igual que su ape-profile="P3"', r.profile, 'P3');
  eq('y con confidence baja, porque es hipotesis y no medida', r.confidence, 'low');
}

/* ────────────────────────────────────────────────────────────────────────────
 * RESUMEN
 * ──────────────────────────────────────────────────────────────────────────── */

process.stdout.write('\n=== RESUMEN ===\n');
process.stdout.write(`PASS: ${passed}\n`);
process.stdout.write(`FAIL: ${failed}\n`);

if (failed > 0) {
  process.stdout.write('\nFallos:\n');
  for (const f of failures) {
    process.stdout.write(`  - ${f.name}${f.detail ? ' :: ' + f.detail : ''}\n`);
  }
  process.stdout.write('\nRESULTADO: FAIL\n');
  process.exit(1);
}

process.stdout.write('\nRESULTADO: PASS (todos los casos)\n');
process.exit(0); // exit-ok: el bloque `if (failed > 0) { ... process.exit(1) }` de arriba ya corto el caso FAIL; llegar aqui significa failed === 0
