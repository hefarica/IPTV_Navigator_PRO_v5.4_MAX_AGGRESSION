#!/usr/bin/env node
/**
 * Prueba del gate anti-degradacion (2026-11-13).
 *
 * Existe porque el gate daba un FALSO POSITIVO: contaba como degradacion los
 * comentarios que PROHIBEN degradar. La correccion (exigir contexto negado)
 * podria esconder una degradacion real, asi que aqui se prueba que NO lo hace.
 *
 * Tres casos:
 *   A · `-ac 2` real, sin negacion            -> DEBE contar   (si no, el gate es ciego)
 *   B · texto que prohíbe `-ac 2`             -> NO debe contar (si no, el gate castiga documentar)
 *   C · los ficheros JIT reales               -> se reportan sus contadores, sin juicio
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GATE = path.join(__dirname, '..', 'check_anti_degradation_policy.js');
let pass = 0, total = 0;
function check(nombre, cond, detalle) {
  total++;
  if (cond) { pass++; console.log('  PASS ' + nombre); }
  else { console.log('  FAIL ' + nombre + (detalle ? ' :: ' + detalle : '')); }
}
function escanear(txt) {
  const tmp = path.join(os.tmpdir(), 'ape-gate-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.js');
  fs.writeFileSync(tmp, txt, 'utf8');
  try {
    const out = execFileSync(process.execPath, [GATE, '--scan=' + tmp], { encoding: 'utf8' });
    return JSON.parse(out);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

console.log('== A · degradacion REAL debe seguir contando ==');
{
  const r = escanear([
    "const args = ['-i', src, '-ac', '2', '-c:v', 'libx265'];",
    'ffmpeg(args);'
  ].join('\n'));
  check('-ac 2 real cuenta como stereo_locked', r.stereo_locked === 1, 'stereo_locked=' + r.stereo_locked);
  check('sin copia de audio se marca degrading', r.degrading === true, 'degrading=' + r.degrading);
}
{
  const r = escanear("const a = '-ac 2';");
  check('-ac 2 dentro de una cadena cuenta', r.stereo_locked === 1, 'stereo_locked=' + r.stereo_locked);
}

console.log('== B · texto que PROHIBE degradar no debe contar ==');
{
  const r = escanear('// NO -ac 2 universal: eso degrada 5.1 a estereo');
  check('comentario "NO -ac 2" no cuenta', r.stereo_locked === 0, 'stereo_locked=' + r.stereo_locked);
}
{
  const r = escanear("const regla = '5. NUNCA poner -ac 2 universal: degradaria 5.1 a estereo';");
  check('cadena "NUNCA poner -ac 2" no cuenta', r.stereo_locked === 0, 'stereo_locked=' + r.stereo_locked);
}
{
  const r = escanear("const o = { audio: { reason: 'NO se fuerza -ac 2: eso degradaria 5.1' } };");
  check('cadena "NO se fuerza -ac 2" no cuenta', r.stereo_locked === 0, 'stereo_locked=' + r.stereo_locked);
}

console.log('== C · el patron de fps y el downscale siguen contando ==');
{
  const r = escanear("const a = ['-r', '25', 'fps=25'];");
  check('fps=25 cuenta', r.fps_locked >= 1, 'fps_locked=' + r.fps_locked);
}
{
  const r = escanear("if (CRYSTAL_2K_DOWNSCALE) {}");
  check('CRYSTAL_2K_DOWNSCALE cuenta', r.downscale_2k === 1, 'downscale_2k=' + r.downscale_2k);
}
{
  const r = escanear("const s = 'scale=w=1280:h=720';");
  check('scale=w=1280 cuenta', r.scale_small === 1, 'scale_small=' + r.scale_small);
}

console.log('== D · casos mezclados ==');
{
  const r = escanear([
    '// NO -ac 2: eso degrada',
    "const args = ['-ac', '2'];",
    "const reason = 'NUNCA -ac 2';"
  ].join('\n'));
  check('1 real + 2 negados = 1', r.stereo_locked === 1, 'stereo_locked=' + r.stereo_locked);
}

console.log('\nRESULT=' + (pass === total ? 'PASS' : 'FAIL') + ' ' + pass + '/' + total);
process.exit(pass === total ? 0 : 1);
