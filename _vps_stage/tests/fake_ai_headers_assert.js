#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * fake_ai_headers_assert.js — GATE T40 (ficción de headers IA de marca)
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ DEFIENDE
 *   Que NO vuelvan a emitirse en #EXTHTTP los 12 headers "IA por marca"
 *   inventados del módulo `ai_super_resolution_engine.php` (ningún fabricante
 *   los define y el TV no está en esa conexión ⇒ 0 píxeles + ruido), y que la
 *   ÚNICA ruta REAL de AI-SR (on-device, ONN 4K / Amlogic S905X4) siga intacta.
 *
 * AFIRMACIONES FATALES
 *   A1  0 apariciones de los 12 nombres inventados en el módulo.
 *   A2  0 referencias al mecanismo que los emitía (`'ai_header'`,
 *       `$device['ai_header']`) y 0 apariciones de `X-AI-Mode` (13º nombre que
 *       usaba el combo como fallback).
 *   A3  Las 63 claves EXTHTTP literales del módulo son EXACTAMENTE las del
 *       baseline ⇒ deja de emitirse lo retirado y NO se toca ninguna otra
 *       directiva. Los 3 guards reescritos y el bloque de audio siguen ahí.
 *   A4  Ruta REAL de AI-SR intacta: sha256 de `ape-pq-guardian.sh`,
 *       `ape-adb-hardening.sh` y `read_manifest.sh` = pin; las claves
 *       `pq_ai_sr_enable`, `ai_sr_level`, `ai_pic_mode`,
 *       `com.droidlogic.tv.action.AISR_ENABLE` y `AIPQ_ENABLE` presentes; y
 *       `ai_pq_mode` NO introducido en ficheros de MT8696 / Fire TV.
 *   A5  La lista viva no gana ni pierde nada por este cambio: `#EXTHTTP:` sigue
 *       en 2754 líneas y los 12 nombres siguen a 0 apariciones.
 *   A6  Integridad estructural del PHP (balance de delimitadores y profundidad
 *       de llaves), porque `php` NO está en PATH para `php -l`.
 *
 * INFORMATIVO (no fatal salvo --strict)
 *   DEBT  Copias del módulo FUERA del inScope de t40 (vps/cmaf_engine,
 *         vps/production_mirror ×2, backup_master_*) que aún contienen los 12
 *         nombres: se declaran con su recuento para que el propietario decida.
 *   [UNKNOWN] declarados: `libpqcontrol.so` no aparece en el repo (solo la
 *         invocación on-device fuera de repo) y **ninguno de los 12 nombres
 *         estaba en la lista viva** (0/12 medidos), por lo que el conteo de
 *         EXTHTTP no cambia: el ruido AI que sí viaja en la lista lo emite el
 *         generador de frontend (`X-APE-AI-*`), fuera del inScope de t40.
 *
 * USO
 *   node _vps_stage/tests/fake_ai_headers_assert.js            # gate
 *   node _vps_stage/tests/fake_ai_headers_assert.js --strict   # + DEBT fatal
 *   node _vps_stage/tests/fake_ai_headers_assert.js --json     # salida máquina
 *
 * GARANTÍAS: no escribe ficheros, no usa red, no ejecuta código del repo.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARGS = process.argv.slice(2);
const STRICT = ARGS.includes('--strict');
const AS_JSON = ARGS.includes('--json');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_REL = 'IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/modules/ai_super_resolution_engine.php';
const MODULE = path.join(ROOT, MODULE_REL);
const LIST = path.join(ROOT, 'downloaded_list.m3u8');

const FAKE_HEADERS = [
  'X-Xiaomi-AI-Mode', 'X-Samsung-Picture-Engine', 'X-LG-Picture-Master', 'X-Sony-XR-Mode',
  'X-Hisense-AI-Mode', 'X-TCL-AI-Mode', 'X-Philips-P5-Mode', 'X-Vizio-IQ-Mode',
  'X-Panasonic-HCX-Mode', 'X-FireTV-Picture-Mode', 'X-AppleTV-Display-Mode', 'X-Shield-AI-Mode',
];
const FAKE_COMBO_FALLBACK = 'X-AI-Mode';

// Baseline de claves EXTHTTP literales del módulo (63) tras retirar la ficción.
const BASELINE_KEYS = [
  'X-AI-Bandwidth-Boost', 'X-AI-Brightness', 'X-AI-Color-Engine', 'X-AI-Color-Recovery',
  'X-AI-Denoise-Pre-Upscale', 'X-AI-Depth-Engine', 'X-AI-Depth-Synthesis', 'X-AI-Detail-Enhancement',
  'X-AI-Enhance', 'X-AI-Genre-Detection', 'X-AI-Judder-Reduction', 'X-AI-Motion-Engine',
  'X-AI-Motion-Interpolation', 'X-AI-Noise-Reduction', 'X-AI-Scene-Adaptation', 'X-AI-Sound-Engine',
  'X-AI-Upscale-Local', 'X-AI-Upscale-Mode', 'X-APE-AI-Engine', 'X-APE-AI-Processor',
  'X-APE-Combo-Mode', 'X-APE-Device-Detected', 'X-APE-Neural-Networks', 'X-Audio-Passthrough',
  'X-Chroma-Subsampling', 'X-Codec-AV1-HW', 'X-Codec-Priority', 'X-Color-Depth-Force', 'X-Color-Space',
  'X-Color-Space-Handoff', 'X-Color-Volume', 'X-Color-Volume-Target', 'X-Content-Resolution',
  'X-Content-Scale', 'X-Content-Upscale-Hint', 'X-Denoise-Level', 'X-Dolby-Vision-Compat',
  'X-Force-Resolution', 'X-HDMI-Bandwidth', 'X-HDMI-Output', 'X-HDR-Genre-Optimization',
  'X-HDR-Local-Dimming', 'X-HDR-MaxCLL', 'X-HDR-MaxFALL', 'X-HDR-Mode', 'X-HDR-Mode-Primary',
  'X-HDR-Simulation', 'X-HDR-Target-Nits', 'X-HW-Decode-Priority', 'X-HW-Decoder',
  'X-Local-Tone-Mapping', 'X-Match-Content', 'X-Max-Decode', 'X-Pipeline-Mode', 'X-Player-Role',
  'X-Quality-Degradation', 'X-SDR-To-HDR-Simulation', 'X-Samsung-AI-Pipeline', 'X-Samsung-NQ8-Mode',
  'X-Samsung-Neural-Nets', 'X-TV-Role', 'X-Target-Resolution', 'X-Transfer-Function',
];

// Ruta REAL de AI-SR (on-device). Hash fijado el 2026-10-25 (t40).
const REAL_SCRIPTS = [
  { rel: 'IPTV_v5.4_MAX_AGGRESSION/backend/ape-pq-guardian.sh', sha256: '2F35F8C6FD02D0BA973E3483D90EA2716BCC4ECE8BAA3E2D6740BDE8158A4BD1' },
  { rel: 'IPTV_v5.4_MAX_AGGRESSION/backend/ape-adb-hardening.sh', sha256: 'DB7D1E265B6C60F4B46C30AC6C33743932854F925E829652CEF2F13D01C6AC11' },
  { rel: 'IPTV_v5.4_MAX_AGGRESSION/backend/read_manifest.sh', sha256: 'FCD0BF5301B7F3FF13C80F3DB0183F6E768853982D387F197D595EB1EB012A52' },
];
const REAL_KEYS = [
  'pq_ai_sr_enable', 'ai_sr_level', 'ai_pic_mode',
  'com.droidlogic.tv.action.AISR_ENABLE', 'com.droidlogic.tv.action.AIPQ_ENABLE',
];
const REAL_UNKNOWN = ['libpqcontrol.so'];
const EXTRA_SEARCH_DIRS = ['IPTV_v5.4_MAX_AGGRESSION/vps/sentinel/profiles'];
const MT8696_NAME_RE = /(mt8696|fire[_. -]?tv|fireos)/i;

// Copias del módulo fuera del inScope de t40 (deuda declarada, no fatal).
const DEBT_COPIES = [
  'IPTV_v5.4_MAX_AGGRESSION/vps/cmaf_engine/modules/ai_super_resolution_engine.php',
  'IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/modules/ai_super_resolution_engine.php',
  'IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/cmaf_engine/modules/ai_super_resolution_engine.php',
  'IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/backend/cmaf_engine/modules/ai_super_resolution_engine.php',
];

const EXTHTTP_LINE_BASELINE = 2754;

const findings = [];
const assertions = [];
const unknowns = [];
const record = (level, id, detail, extra) => findings.push(Object.assign({ level, id, detail }, extra || {}));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const countAll = (hay, needle) => {
  if (!needle) return 0;
  let n = 0, at = hay.indexOf(needle);
  while (at >= 0) { n++; at = hay.indexOf(needle, at + 1); }
  return n;
};
const linesOf = (text, needle) => {
  const out = [];
  text.split(/\r?\n/).forEach((ln, i) => { if (ln.indexOf(needle) >= 0) out.push(i + 1); });
  return out;
};

// ── lectura del módulo ─────────────────────────────────────────────────────
let src = '';
if (!fs.existsSync(MODULE)) {
  console.error('[T40-GATE] FATAL: no existe ' + MODULE_REL);
  process.exit(1);
}
src = fs.readFileSync(MODULE, 'utf8');
const sha = crypto.createHash('sha256').update(fs.readFileSync(MODULE)).digest('hex').toUpperCase();

// ── A1 · los 12 nombres inventados ────────────────────────────────────────
let a1Hits = 0;
for (const name of FAKE_HEADERS) {
  const n = countAll(src, name);
  if (n > 0) { a1Hits += n; record('FAIL', 'A1', 'header inventado presente: ' + name + ' x' + n, { lineas: linesOf(src, name).join(',') }); }
}
assertions.push({ id: 'A1 · 0 headers IA de marca en el módulo', ok: a1Hits === 0, detail: a1Hits + ' aparición(es)' });

// ── A2 · mecanismo de emisión y fallback del combo ────────────────────────
const a2 = [];
const nKeyRef = countAll(src, "'ai_header'");
const nDynRef = countAll(src, "$device['ai_header']");
const nCombo = countAll(src, FAKE_COMBO_FALLBACK);
if (nKeyRef) a2.push("'ai_header' x" + nKeyRef);
if (nDynRef) a2.push("$device['ai_header'] x" + nDynRef);
if (nCombo) a2.push(FAKE_COMBO_FALLBACK + ' x' + nCombo);
if (a2.length) record('FAIL', 'A2', 'mecanismo de emisión reintroducido: ' + a2.join(' , '));
assertions.push({ id: 'A2 · 0 mecanismo de emisión ('+"'ai_header'"+' / fallback)', ok: a2.length === 0, detail: a2.join(' , ') || 'limpio' });

// ── A3 · ninguna otra directiva tocada (set EXTHTTP exacto) ───────────────
const keysNow = [...new Set([...src.matchAll(/\$exthttp\['(X-[A-Za-z0-9\-]+)'\]/g)].map((m) => m[1]))].sort();
const missing = BASELINE_KEYS.filter((k) => !keysNow.includes(k));
const extra = keysNow.filter((k) => !BASELINE_KEYS.includes(k));
if (missing.length) record('FAIL', 'A3', 'claves EXTHTTP perdidas: ' + missing.join(','));
if (extra.length) record('FAIL', 'A3', 'claves EXTHTTP nuevas (fuera de baseline): ' + extra.join(','));
const nGuardOk = countAll(src, "if ($device['supports_ai']) {");
if (nGuardOk !== 4) record('FAIL', 'A3', "guards 'if ($device['supports_ai']) {' esperados 4 (3 reescritos + 1 preexistente del CASE 4), encontrados " + nGuardOk);
const nSound = countAll(src, "isset($device['ai_sound'])");
if (nSound !== 1) record('FAIL', 'A3', 'guard de audio esperado 1, encontrado ' + nSound);
assertions.push({
  id: 'A3 · 63 claves EXTHTTP idénticas al baseline (nada más tocado)',
  ok: missing.length === 0 && extra.length === 0 && nGuardOk === 4 && nSound === 1,
  detail: keysNow.length + ' claves · guards=' + nGuardOk + ' · audio=' + nSound,
});

// ── A4 · ruta REAL de AI-SR intacta ──────────────────────────────────────
let a4ok = true;
for (const s of REAL_SCRIPTS) {
  const abs = path.join(ROOT, s.rel);
  if (!fs.existsSync(abs)) { a4ok = false; record('FAIL', 'A4', 'falta artefacto de la ruta real: ' + s.rel); continue; }
  const got = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').toUpperCase();
  if (got !== s.sha256) { a4ok = false; record('FAIL', 'A4', 'hash cambiado en ' + s.rel + ' (esperado ' + s.sha256.slice(0, 12) + '…, obtenido ' + got.slice(0, 12) + '…)'); }
}
// claves de la ruta real: deben estar presentes en el conjunto de scripts
const pool = [];
for (const s of REAL_SCRIPTS) pool.push({ rel: s.rel, text: fs.readFileSync(path.join(ROOT, s.rel), 'utf8') });
for (const d of EXTRA_SEARCH_DIRS) {
  const abs = path.join(ROOT, d);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (!/\.(sh|bash)$/i.test(f)) continue;
    pool.push({ rel: d + '/' + f, text: fs.readFileSync(path.join(abs, f), 'utf8') });
  }
}
for (const k of REAL_KEYS) {
  const where = pool.filter((p) => p.text.indexOf(k) >= 0).map((p) => p.rel);
  if (!where.length) { a4ok = false; record('FAIL', 'A4', 'clave de la ruta real ausente: ' + k); }
  else record('INFO', 'A4', 'ruta real OK: ' + k + ' en ' + (where.length > 2 ? where.slice(0, 2).join(' , ') + ' (+' + (where.length - 2) + ')' : where.join(' , ')));
}
// regla MT8696: ai_pq_mode NO debe aparecer en artefactos de MT8696/Fire TV
const mtDirs = ['IPTV_v5.4_MAX_AGGRESSION/backend', 'IPTV_v5.4_MAX_AGGRESSION/vps/sentinel/profiles'];
for (const d of mtDirs) {
  const abs = path.join(ROOT, d);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (!/\.(sh|bash|php|js)$/i.test(f) || !MT8696_NAME_RE.test(f)) continue;
    const t = fs.readFileSync(path.join(abs, f), 'utf8');
    if (t.indexOf('ai_pq_mode') >= 0) { a4ok = false; record('FAIL', 'A4', 'ai_pq_mode introducido en artefacto MT8696/FireTV: ' + d + '/' + f); }
  }
}
for (const u of REAL_UNKNOWN) unknowns.push({ what: u, why: 'no aparece en el repo: vive on-device / fuera del árbol versionado; no verificable aquí (Amlogic S905X4)' });
assertions.push({ id: 'A4 · ruta REAL de AI-SR intacta (hashes + claves + regla MT8696)', ok: a4ok, detail: REAL_SCRIPTS.length + ' scripts pinneados · ' + REAL_KEYS.length + ' claves' });

// ── A5 · lista viva: sin pérdida ni ganancia ──────────────────────────────
let a5ok = true, listFake = 0, exthttpLines = 0, presentInList = 0;
if (fs.existsSync(LIST)) {
  const buf = fs.readFileSync(LIST);
  const txt = buf.toString('utf8');
  exthttpLines = countAll(txt, '#EXTHTTP:');
  for (const name of FAKE_HEADERS) {
    const c = countAll(txt, name);
    listFake += c;
    if (c > 0) presentInList++;
  }
  if (listFake !== 0) { a5ok = false; record('FAIL', 'A5', 'la lista viva contiene headers inventados x' + listFake); }
  if (exthttpLines !== EXTHTTP_LINE_BASELINE) { a5ok = false; record('FAIL', 'A5', '#EXTHTTP: = ' + exthttpLines + ' (baseline ' + EXTHTTP_LINE_BASELINE + ')'); }
  const aiNoise = countAll(txt, 'X-APE-AI-');
  unknowns.push({
    what: 'ruido AI restante en la lista viva',
    why: 'X-APE-AI-* aparece ' + aiNoise + ' veces: lo emite el generador de FRONTEND (fuera del inScope de t40); no son los 12 headers de marca',
  });
} else {
  a5ok = false;
  record('FAIL', 'A5', 'no existe downloaded_list.m3u8 (no se puede verificar la lista)');
}
if (presentInList === 0) unknowns.push({ what: 'los 12 nombres en la lista viva', why: 'ninguno estaba (0/12 medidos) ⇒ el conteo de EXTHTTP NO cambia con este cambio; el delta es 0' });
assertions.push({
  id: 'A5 · lista viva intacta (#EXTHTTP=' + EXTHTTP_LINE_BASELINE + ', 0 nombres inventados)',
  ok: a5ok,
  detail: '#EXTHTTP=' + exthttpLines + ' · nombres inventados en lista=' + listFake + ' · presentes=' + presentInList + '/12',
});

// ── A6 · integridad estructural del PHP (sustituto de php -l) ─────────────
const bal = (a, b) => [countAll(src, a), countAll(src, b)];
const [bo, bc] = bal('{', '}');
const [po, pc] = bal('(', ')');
const [qo, qc] = bal('[', ']');
let depth = 0, neverNegative = true;
for (const ch of src) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth < 0) { neverNegative = false; break; } } }
const a6ok = bo === bc && po === pc && qo === qc && depth === 0 && neverNegative && src.startsWith('<?php');
if (!a6ok) record('FAIL', 'A6', 'estructura PHP incoherente: {} ' + bo + '/' + bc + ' · () ' + po + '/' + pc + ' · [] ' + qo + '/' + qc + ' · profundidad final ' + depth);
assertions.push({ id: 'A6 · estructura PHP válida (php no está en PATH: chequeo de delimitadores)', ok: a6ok, detail: '{} ' + bo + '/' + bc + ' · () ' + po + '/' + pc + ' · [] ' + qo + '/' + qc });

// ── DEBT · copias fuera del inScope ──────────────────────────────────────
for (const rel of DEBT_COPIES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { record('DEBT', 'DEBT', rel + '  (no existe)', { count: 0 }); continue; }
  const t = fs.readFileSync(abs, 'utf8');
  let n = 0;
  for (const name of FAKE_HEADERS) n += countAll(t, name);
  record('DEBT', 'DEBT', rel + '  headers inventados=' + n, { count: n });
}

// ── salida ────────────────────────────────────────────────────────────────
const fails = findings.filter((f) => f.level === 'FAIL');
const debt = findings.filter((f) => f.level === 'DEBT');
const infos = findings.filter((f) => f.level === 'INFO');
const fatal = fails.length + (STRICT ? debt.length : 0);

if (AS_JSON) {
  console.log(JSON.stringify({
    ok: fatal === 0, strict: STRICT,
    module: { rel: MODULE_REL, sha256: sha, exthttpKeys: keysNow.length },
    counts: { assertionsOk: assertions.filter((a) => a.ok).length, assertionsTotal: assertions.length, fails: fails.length, debt: debt.length, unknowns: unknowns.length },
    assertions, findings, unknowns,
  }, null, 2));
} else {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(' T40 · GATE DE HEADERS IA DE MARCA (ficción sin píxeles)' + (STRICT ? '  [STRICT]' : ''));
  console.log(' módulo: ' + MODULE_REL);
  console.log(' sha256: ' + sha);
  console.log('══════════════════════════════════════════════════════════════════════');
  for (const a of assertions) console.log((a.ok ? ' [PASS] ' : ' [FAIL] ') + a.id + '  (' + a.detail + ')');

  console.log('\n- RUTA REAL DE AI-SR (on-device, ONN 4K / Amlogic S905X4) -');
  for (const i of infos) console.log('   · ' + i.detail);

  console.log('\n- VIOLACIONES FATALES: ' + fails.length + ' -');
  if (!fails.length) console.log('   (ninguna)');
  for (const f of fails) console.log('   ✗ [' + f.id + '] ' + f.detail + (f.lineas ? '  (L' + f.lineas + ')' : ''));

  console.log('\n- DEUDA DECLARADA fuera del inScope de t40 (copias del módulo): ' + debt.length + ' -');
  for (const d of debt) console.log('   · ' + d.detail);
  console.log('   → cerrar en tarea propia con inScope sobre vps/** y backup_master_*.');

  console.log('\n- [UNKNOWN] declarados: ' + unknowns.length + ' -');
  for (const u of unknowns) console.log('   · ' + u.what + ': ' + u.why);

  console.log('\n' + (fatal === 0
    ? '[T40-GATE] OK — 0 headers inventados, ruta real de AI-SR intacta y ninguna otra directiva tocada.'
    : '[T40-GATE] FALLO — ' + fatal + ' hallazgo(s) fatal(es).'));
  console.log('nota: `php -l` no disponible en esta máquina (php no está en PATH) → A6 valida estructura, no sintaxis PHP completa.');
}

process.exit(fatal === 0 ? 0 : 1);
