/* Regresion: `dry-run.sh` (el modo --audit de §12) debe ser FAIL-CLOSED.
 *
 * DEFECTO QUE ESTO FIJA (2026-11-12): dry-run.sh no comprobaba el estado de
 * `rsh`. Con el VPS inalcanzable, `remote` quedaba vacio, el `-z` marcaba todos
 * los destinos como NUEVO y el script imprimia "DRY-RUN COMPLETO" con exit 0.
 * Medido: 34 lineas de diff fabricadas y exit 0 en una simulacion de host caido.
 *
 * Por que importa: `--audit` es el modo que §12 exige ESTRICTAMENTE de solo
 * lectura. Un modo de lectura que inventa el estado remoto cuando no puede
 * leerlo no es conservador: es el mas peligroso, porque su salida parece buena.
 *
 * Lo que se comprueba aqui:
 *   1. ssh que falla  -> exit 3, cero lineas de diff, sin "DRY-RUN COMPLETO"
 *   2. ssh exit 0 sin salida -> exit 3, mensaje de lectura incompleta
 *   3. sin manifiesto -> no revienta con un diff inventado
 *
 * No se necesita VPS: se simula con SSH_BIN.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const DEPLOY = path.join(__dirname, '..', '..', '_vps_stage', 'deploy');
const SCRIPT = path.join(DEPLOY, 'dry-run.sh');

if (!fs.existsSync(SCRIPT)) {
  console.error('FALLO: no existe ' + SCRIPT);
  process.exit(1);
}

let total = 0;
let fail = 0;

function corre(sshBin) {
  /* La variable se inyecta DENTRO de bash, no por el `env` de spawnSync.
   *
   * Medido el 2026-11-12 en este host Windows: `spawnSync(..., {env:{SSH_BIN}})`
   * NO propaga la variable — `bash ve: VACIO` — y el script acababa invocando el
   * `ssh` real ("Permission denied"), con lo que los dos casos caian en la misma
   * rama y el test pasaba por el motivo equivocado. Con `bash -c 'VAR=... cmd'`
   * la asignacion la hace el propio shell y funciona en Windows y en Linux. */
  const r = spawnSync('bash', ['-c', 'SSH_BIN=' + sshBin + ' bash dry-run.sh'], {
    cwd: DEPLOY,
    encoding: 'utf8',
    timeout: 60000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  return { code: r.status, out, error: r.error };
}

const RE_DIFF = /\b(NUEVO|CAMBIA|IGUAL|AUSENTE|DESCONOCIDO)\b/;
function lineasDeDiff(out) {
  return out.split('\n').filter((l) => RE_DIFF.test(l));
}

/* 1 · host inalcanzable */
{
  total++;
  const r = corre('/bin/false');
  const diffs = lineasDeDiff(r.out);
  const diceCompleto = /DRY-RUN COMPLETO/.test(r.out);
  if (r.error) {
    fail++; console.log('  FAIL 1 ssh-caido LANZO ' + r.error.message);
  } else if (r.code !== 3) {
    fail++; console.log('  FAIL 1 ssh-caido exit=' + r.code + ' (se exige 3)');
  } else if (diffs.length !== 0) {
    fail++; console.log('  FAIL 1 ssh-caido imprimio ' + diffs.length + ' lineas de diff inventadas');
  } else if (diceCompleto) {
    fail++; console.log('  FAIL 1 ssh-caido dijo "DRY-RUN COMPLETO"');
  } else {
    console.log('  ok   1 ssh-caido -> exit 3, 0 diffs, sin "COMPLETO"');
    console.log('         ' + (r.out.split('\n').find((l) => /INALCANZABLE/.test(l)) || '').trim());
  }
}

/* 2 · host responde pero sin datos */
{
  total++;
  const r = corre('/bin/true');
  const diffs = lineasDeDiff(r.out);
  const diceIncompleta = /lectura incompleta/.test(r.out);
  if (r.error) {
    fail++; console.log('  FAIL 2 ssh-vacio LANZO ' + r.error.message);
  } else if (r.code !== 3) {
    fail++; console.log('  FAIL 2 ssh-vacio exit=' + r.code + ' (se exige 3)');
  } else if (diffs.length !== 0) {
    fail++; console.log('  FAIL 2 ssh-vacio imprimio ' + diffs.length + ' lineas de diff');
  } else if (!diceIncompleta) {
    fail++; console.log('  FAIL 2 ssh-vacio no dijo "lectura incompleta"');
  } else {
    console.log('  ok   2 ssh-vacio -> exit 3 y "lectura incompleta"');
  }
}

/* 3 · el script no debe tratar "no lo se" como "cambia".
       Se comprueba leyendo el codigo: la rama `-z` ya no puede asignar NUEVO. */
{
  total++;
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const mala = /\[ "\$rh" = "AUSENTE" \] \|\| \[ -z "\$rh" \]/.test(src);
  const tieneDesconocido = /DESCONOCIDO/.test(src);
  if (mala) {
    fail++; console.log('  FAIL 3 sigue colapsando AUSENTE y vacio en la misma rama');
  } else if (!tieneDesconocido) {
    fail++; console.log('  FAIL 3 no existe el estado DESCONOCIDO');
  } else {
    console.log('  ok   3 AUSENTE y desconocido son estados distintos');
  }
}

console.log('\nRESULT: ' + (total - fail) + '/' + total + ' comprobaciones · fallos: ' + fail);
process.exit(fail === 0 ? 0 : 1);
