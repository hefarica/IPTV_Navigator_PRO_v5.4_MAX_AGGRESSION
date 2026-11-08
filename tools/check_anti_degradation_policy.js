#!/usr/bin/env node
/** Static gate for the anti-degradation law. */
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, total = 0;
function ok(name, cond, detail) {
  total++;
  if (cond) { pass++; console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  else console.log('FAIL ' + name + (detail ? ' · ' + detail : ''));
}
const law = fs.readFileSync('docs/policies/ANTI_DEGRADATION_LAW.md', 'utf8');
const contract = JSON.parse(fs.readFileSync('contracts/anti_degradation_contract.json', 'utf8'));
const agents = fs.readFileSync('AGENTS.md', 'utf8');
ok('law exists', law.includes('LEY ANTI-DEGRADACIÓN') && law.includes('Prohibición de degradar'));
ok('law forbids 4K→FHD', law.includes('4K → FHD') || law.includes('4K → FHD/HD/SD'));
ok('contract mandatory', contract.status === 'mandatory');
ok('contract forbids fallback', contract.forbidden_automatic_actions.includes('replace_4k_source_with_fhd'));
ok('contract allows JIT copy', contract.allowed_without_exception.includes('jit_native_copy_4k'));
ok('AGENTS references law', agents.includes('ANTI_DEGRADATION_LAW.md') || agents.includes('LEY ANTI-DEGRADACIÓN'));

// ─────────────────────────────────────────────────────────────────────────────
// [2026-11-08] ESCANEO DE CÓDIGO — hasta ahora el gate era SOLO documental.
//
// Verificaba que la ley, el contrato y AGENTS.md DIJERAN lo correcto, pero nunca leía
// una línea del código que ejecuta. Por eso pasaba en verde mientras el JIT desplegado
// (ape-jit-mirror) contiene fps=30, '-ac 2' incondicional y modos de downscale a 2K.
//
// Ahora escanea las implementaciones JIT. Es un TRINQUETE con línea base: no exige que
// las violaciones históricas desaparezcan de golpe (eso exige decidir el despliegue),
// exige que NINGUNA NUEVA entre. Cuando se corrija, se regenera con --update.
// ─────────────────────────────────────────────────────────────────────────────

const BASELINE = 'contracts/anti_degradation_jit_baseline.json';
const JIT_FILES = [
  'vps_jit/server.js',
  'IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js',
  'tools/lab/ape-jit/server.js'
];

// Patrones de degradación. `audio_passthrough` es el contrapeso: si hay '-ac 2' y NO hay
// ninguna rama de copia de audio, la reduccion es incondicional.
const PATTERNS = {
  fps_locked: /fps=(?:24|25|30)\b/g,
  stereo_locked: /-ac['",\s]+2/g,
  downscale_2k: /CRYSTAL_2K[A-Z_]*DOWNSCALE/g,
  scale_small: /scale=w=(?:1280|1920|720)\b/g
};
const PATTERN_AUDIO_COPY = /-c:a['",\s]+copy/g;

function scanJit(rel) {
  if (!fs.existsSync(rel)) return null;
  const txt = fs.readFileSync(rel, 'utf8');
  const counts = {};
  for (const k of Object.keys(PATTERNS)) {
    const m = txt.match(PATTERNS[k]);
    counts[k] = m ? m.length : 0;
  }
  counts.audio_passthrough = PATTERN_AUDIO_COPY.test(txt) ? 1 : 0;
  counts.degrading = Object.keys(PATTERNS)
    .reduce((a, k) => a + counts[k], 0) > 0
    && counts.audio_passthrough === 0 && counts.stereo_locked > 0;
  return counts;
}

const scan = {};
for (const f of JIT_FILES) {
  const r = scanJit(f);
  if (r) scan[f] = r;
}
const scannedCount = Object.keys(scan).length;
ok('JIT escaneado (código, no solo doctrina)', scannedCount > 0,
  scannedCount + ' de ' + JIT_FILES.length + ' implementaciones presentes');

const upd = process.argv.includes('--update');
if (upd) {
  fs.writeFileSync(BASELINE, JSON.stringify({
    schema: 'ape.anti-degradation/jit-baseline/1',
    note: 'Violaciones conocidas en las implementaciones JIT. Ratchet: ninguna nueva. Regenerar tras corregir.',
    measured_at: new Date().toISOString(),
    files: scan
  }, null, 2) + '\n', 'utf8');
  console.log('linea base escrita: ' + BASELINE);
  console.log('\nTOTAL=' + total + ' PASS=' + pass + ' FAIL=' + (total - pass));
  process.exit(pass === total ? 0 : 1);
}

let baseline = { files: {} };
if (fs.existsSync(BASELINE)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}

const nuevas = [];
let totalConocidas = 0;
for (const f of Object.keys(scan)) {
  const now = scan[f];
  const was = (baseline.files || {})[f] || null;
  for (const k of Object.keys(now)) {
    if (k === 'degrading' || k === 'audio_passthrough') continue;
    const antes = was ? (was[k] || 0) : 0;
    if (now[k] > antes) nuevas.push(f + ' :: ' + k + ' ' + antes + ' -> ' + now[k]);
    totalConocidas += ahora(was, k);
  }
}
function ahora(was, k) { return was ? (was[k] || 0) : 0; }

ok('sin degradacion NUEVA en el codigo JIT', nuevas.length === 0,
  nuevas.length ? nuevas.join(' | ') : 'conocidas en linea base: ' + totalConocidas);

// Informe legible: lo que sigue degradando, para que no desaparezca del radar
for (const f of Object.keys(scan)) {
  const s = scan[f];
  const etiqueta = s.degrading ? 'DEGRADA' : 'CUMPLE';
  console.log('  [' + etiqueta + '] ' + f
    + '  fps_locked=' + s.fps_locked
    + ' stereo_locked=' + s.stereo_locked
    + ' downscale_2k=' + s.downscale_2k
    + ' scale_small=' + s.scale_small
    + ' audio_passthrough=' + s.audio_passthrough);
}

console.log('\nTOTAL=' + total + ' PASS=' + pass + ' FAIL=' + (total - pass));
if (pass !== total) process.exitCode = 1;
