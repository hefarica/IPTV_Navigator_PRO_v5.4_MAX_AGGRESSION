#!/usr/bin/env node
'use strict';
/**
 * tools/canary/deploy_contract_check.js
 *
 * Comprueba, SIN RED y SIN TOCAR EL VPS, que el reconciliador de infraestructura
 * de _vps_stage/deploy tiene la semantica audit/plan/apply que exige la seccion 12
 * del prompt MAESTRO, y que sin --apply no se escribe nada.
 *
 *   1) ANALISIS DE TEXTO sobre los scripts reales (solo lectura):
 *      C1 deploy.sh sin --apply DELEGA en dry-run.sh (exec) y no llega a mutar
 *      C2 deploy.sh exige --yes antes de cualquier mutacion (exit 2)
 *      C3 validate.sh corre ANTES de la primera mutacion (exit 3)
 *      C4 dry-run.sh no contiene comandos REMOTOS mutantes
 *      C5 dry-run.sh no tiene redirecciones de escritura hacia rutas REMOTAS
 *
 *   2) EJECUCION LOCAL CONTROLADA: copia el pipeline a os.tmpdir() (el repo
 *      queda intacto), sustituye ssh por un stub via SSH_BIN (lib.sh:31 lo
 *      permite) y mide:
 *      D1 deploy.sh sin --apply no escribe en el repo y si ejecuta dry-run.sh
 *      D2 deploy.sh --apply sin --yes aborta con exit 2 SIN contactar nada
 *      D3 validate.sh que falla aborta con exit 3 ANTES de la primera mutacion
 *      D4 el ssh real nunca se invoca (cero red, cero VPS)
 *
 * Fail-closed: si bash no esta disponible, D1-D3 se declaran NO_COMPUTADO y
 * FALLAN; el gate no puede probar la propiedad y no la da por buena.
 *
 * Uso: node tools/canary/deploy_contract_check.js
 * Exit: 0 solo si TODAS las comprobaciones pasan.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
/* --deploy-dir permite auditar una COPIA (control negativo): el gate debe FALLAR
   si esa copia tiene una mutacion remota en dry-run.sh. Por defecto, el repo real. */
const DEPLOY = path.resolve(argOf('--deploy-dir', path.join(ROOT, '_vps_stage', 'deploy')));
const IS_OVERRIDE = path.resolve(DEPLOY) !== path.resolve(path.join(ROOT, '_vps_stage', 'deploy'));
const FILES = {
  deploy: path.join(DEPLOY, 'deploy.sh'),
  dryrun: path.join(DEPLOY, 'dry-run.sh'),
  validate: path.join(DEPLOY, 'validate.sh'),
  lib: path.join(DEPLOY, 'lib.sh')
};

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const readText = (p) => fs.readFileSync(p, 'utf8');
const readLines = (p) => readText(p).replace(/\r\n/g, '\n').split('\n');
const lineOf = (lines, re) => {
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return -1;
};

/* Verbos remotos que NO escriben. Cualquier linea rsh que no se pueda explicar
   con esta lista se considera mutacion: el defecto por omision es el seguro. */
const REMOTE_READ_ONLY = [
  /^\s*for\s+f\s+in\b/, /^\s*if\s+\[/, /^\s*else\b/, /^\s*fi\b/, /^\s*done\b/,
  /\bsha256sum\b/, /\bstat\s+-c\b/, /\bls\s+-1\b/, /\bcat\b/, /\bhead\b/, /\btail\b/,
  /\bwc\s+-c\b/, /\bgrep\b/, /\bsed\b/, /\bawk\b/, /\bcut\b/, /\btr\b/, /\bsort\b/,
  /\bprintf\b/, /\becho\b/, /\bfind\b/, /\btest\s+-f\b/, /\bnginx\s+-t\b/,
  /\bsystemctl\s+is-active\b/, /\bdf\s+-h\b/, /\bopenssl\s+x509\b/, /\bluac\s+-p\b/,
  /\bphp\s+-l\b/, /\bhostname\b/, /\bnginx\s+-v\b/, /\bphp\s+-v\b/
];

/* Tokens que, aparezcan donde aparezcan dentro de un comando remoto, mutan. */
const REMOTE_MUTATING = [
  { re: /\brm\s+-/, why: 'rm' },
  { re: /\bmv\b/, why: 'mv' },
  { re: /\bcp\s+-a\b/, why: 'cp -a' },
  { re: /\binstall\s+-[md]/, why: 'install' },
  { re: /\bmkdir\s+-p\b/, why: 'mkdir -p' },
  { re: /\btouch\b/, why: 'touch' },
  { re: /\btee\b/, why: 'tee' },
  { re: /\bdd\s+/, why: 'dd' },
  { re: /\btruncate\b/, why: 'truncate' },
  { re: /\bchmod\b/, why: 'chmod' },
  { re: /\bchown\b/, why: 'chown' },
  { re: /\bsystemctl\s+(restart|start|stop|reload|enable|disable|daemon-reload)/, why: 'systemctl mutante' },
  { re: /\bnginx\s+-s\s+reload\b/, why: 'nginx -s reload' },
  { re: /\bsed\s+-i\b/, why: 'sed -i' },
  { re: /\bcat\s*>/, why: 'cat > (escritura remota)' }
];

const results = [];
const findings = [];
const add = (id, name, ok, detail) => results.push({ id, name, ok: !!ok, detail });
const finding = (where, text) => findings.push({ where, text });

/* ------------------------------------------------------------------ *
 * 1 · ANALISIS DE TEXTO
 * ------------------------------------------------------------------ */
function staticChecks() {
  const dep = readLines(FILES.deploy);
  const dry = readLines(FILES.dryrun);

  /* Primera mutacion real del pipeline: rsh mutante, script con --apply, o rollback. */
  const firstMutation = (() => {
    for (let i = 0; i < dep.length; i++) {
      const l = dep[i];
      const isRsh = /\brsh\s+/.test(l);
      const isMutating = isRsh && REMOTE_MUTATING.some((m) => m.re.test(l));
      const isApplyScript = /sync-(provision|include)\.sh.*--apply/.test(l) && !/^\s*#/.test(l);
      const isRollback = /rollback\.sh/.test(l) && !/^\s*#/.test(l);
      if (isMutating || isApplyScript || isRollback) return i + 1;
    }
    return -1;
  })();

  /* C1 · delegacion a dry-run.sh dentro del bloque sin --apply */
  const ifNoApply = lineOf(dep, /if\s+\[\s*"\$APPLY"\s+-ne\s+1\s*\]/);
  let execLine = -1;
  if (ifNoApply > 0) {
    for (let i = ifNoApply; i < dep.length; i++) {
      if (/^\s*fi\b/.test(dep[i])) break;
      if (/\bexec\b.*dry-run\.sh/.test(dep[i])) { execLine = i + 1; break; }
    }
  }
  add('C1', 'deploy.sh sin --apply DELEGA en dry-run.sh y no llega a mutar',
    ifNoApply > 0 && execLine > 0 && firstMutation > 0 && execLine < firstMutation,
    ifNoApply > 0 && execLine > 0
      ? 'bloque sin-apply en :' + ifNoApply + ', exec dry-run.sh en :' + execLine + ', primera mutacion en :' + firstMutation
      : 'no se encontro el bloque sin-apply (if en :' + ifNoApply + ', exec en :' + execLine + ')');

  /* C2 · --yes obligatorio con exit 2, antes de mutar */
  const yesLine = lineOf(dep, /\[\s*"\$YES"\s+-eq\s+1\s*\]/);
  const yesExit = yesLine > 0 && /exit\s+2/.test(dep[yesLine - 1]);
  add('C2', 'deploy.sh --apply exige --yes (exit 2) antes de cualquier mutacion',
    yesLine > 0 && yesExit && yesLine < firstMutation,
    yesLine > 0 ? 'guard --yes en :' + yesLine + ' con exit 2=' + yesExit + ', primera mutacion en :' + firstMutation : 'no se encontro el guard de --yes');

  /* C3 · validate.sh antes de mutar, con exit 3 */
  const valLine = lineOf(dep, /"\$DEPLOY_DIR\/validate\.sh"/);
  const valExit = valLine > 0 && /exit\s+3/.test(dep[valLine - 1]);
  add('C3', 'validate.sh corre ANTES de la primera mutacion y su fallo aborta con exit 3',
    valLine > 0 && valExit && valLine < firstMutation,
    valLine > 0 ? 'validate.sh en :' + valLine + ' con exit 3=' + valExit + ', primera mutacion en :' + firstMutation : 'no se invoca validate.sh');

  /* C4 · dry-run.sh sin comandos remotos mutantes */
  const offenders = [];
  dry.forEach((l, i) => {
    if (!/\brsh\s+/.test(l) || /^\s*#/.test(l)) return;
    const cmd = l.slice(l.indexOf('rsh '));
    for (const m of REMOTE_MUTATING) if (m.re.test(cmd)) offenders.push('dry-run.sh:' + (i + 1) + ' (' + m.why + ')');
  });
  add('C4', 'dry-run.sh no contiene comandos REMOTOS mutantes', offenders.length === 0,
    offenders.length ? 'MUTACIONES REMOTAS: ' + offenders.join(', ') : 'comandos remotos clasificados como solo-lectura');

  /* C5 · dry-run.sh sin redirecciones de escritura hacia el VPS.
     Se descartan 2>/dev/null y 2>&1: son redirecciones de stderr, no escrituras. */
  const remoteWrites = [];
  dry.forEach((l, i) => {
    if (!/\brsh\s+/.test(l) || /^\s*#/.test(l)) return;
    const cmd = l.slice(l.indexOf('rsh ')).replace(/2>\s*\/dev\/null/g, '').replace(/2>&1/g, '').replace(/>&2/g, '');
    if (/>\s*(?:\/|"|\$\{?SNAP|~)/.test(cmd)) remoteWrites.push('dry-run.sh:' + (i + 1));
  });
  add('C5', 'dry-run.sh no redirige escritura a rutas REMOTAS', remoteWrites.length === 0,
    remoteWrites.length ? 'REDIRECCIONES REMOTAS: ' + remoteWrites.join(', ') : 'ninguna redireccion dentro de comandos remotos');

  /* Inventario de escrituras LOCALES (no fallan el gate: van al informe) */
  dry.forEach((l, i) => {
    if (/^\s*#/.test(l)) return;
    const m = l.match(/[^0-9&>]>\s*"?(\$\{?[A-Z_]+|[^\s"]+)/);
    if (m && !/rsh\s+/.test(l)) finding('dry-run.sh:' + (i + 1), 'escritura LOCAL: ' + l.trim());
  });
  if (!/mkdir/.test(readText(FILES.lib))) finding('lib.sh', 'no crea directorios: SNAP_DIR debe existir antes (si falta, el redirect de dry-run.sh:8 falla)');

  /* C6 · SSH_BIN es la unica puerta al VPS: ningun script invoca ssh directo */
  const directSsh = [];
  for (const [name, file] of Object.entries({ 'deploy.sh': FILES.deploy, 'dry-run.sh': FILES.dryrun, 'validate.sh': FILES.validate })) {
    readLines(file).forEach((l, i) => {
      if (/^\s*#/.test(l)) return;
      if (/(^|[^_A-Z"])\bssh\s+-/.test(l)) directSsh.push(name + ':' + (i + 1));
    });
  }
  const honorsSshBin = /SSH_BIN="\$\{SSH_BIN:-ssh\}"/.test(readText(FILES.lib)) && /"\$SSH_BIN"/.test(readText(FILES.lib));
  add('C6', 'SSH_BIN es la unica puerta: lib.sh lo respeta y ningun script llama a ssh directo',
    directSsh.length === 0 && honorsSshBin,
    'ssh directo: ' + (directSsh.length ? directSsh.join(', ') : 'ninguno') + ' · lib.sh respeta SSH_BIN=' + honorsSshBin);

  return { firstMutation, execLine, yesLine, valLine };
}

/* ------------------------------------------------------------------ *
 * 2 · EJECUCION LOCAL CONTROLADA (copia en os.tmpdir + ssh stub)
 * ------------------------------------------------------------------ */
const toPosix = (p) => {
  if (process.platform !== 'win32') return p;
  const m = String(p).match(/^([A-Za-z]):[\\/](.*)$/);
  return m ? '/mnt/' + m[1].toLowerCase() + '/' + m[2].replace(/\\/g, '/') : String(p).replace(/\\/g, '/');
};

const bashOk = () => {
  const r = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' });
  return r.status === 0 && /ok/.test(r.stdout || '');
};

const snapshotTree = (dir) => {
  const out = {};
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      const key = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(abs, key);
      else out[key] = sha256(fs.readFileSync(abs));
    }
  };
  walk(dir, '');
  return out;
};

const diffTrees = (a, b) => {
  const added = Object.keys(b).filter((k) => !(k in a));
  const removed = Object.keys(a).filter((k) => !(k in b));
  const changed = Object.keys(a).filter((k) => k in b && a[k] !== b[k]);
  return { added, removed, changed };
};

function makeSandbox(tag) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-deploy-' + tag + '-'));
  const copy = path.join(work, 'deploy');
  fs.cpSync(DEPLOY, copy, { recursive: true });
  for (const f of fs.readdirSync(copy)) {
    if (f.endsWith('.sh')) { try { fs.chmodSync(path.join(copy, f), 0o755); } catch (e) { /* drvfs */ } }
  }
  const log = path.join(work, 'ssh_calls.log');
  fs.writeFileSync(log, '');
  const stub = path.join(work, 'stub_ssh.sh');
  fs.writeFileSync(stub, '#!/bin/sh\nprintf "STUB_SSH %s\\n" "$*" >> "' + toPosix(log) + '"\nexit 255\n');
  try { fs.chmodSync(stub, 0o755); } catch (e) { /* drvfs */ }
  return { work, copy, log, stub };
}

const runIn = (sandbox, args, extraEnv) => {
  /* El codigo de salida se lee de spawnStatus, NO de un `echo $?` dentro del script:
     medido en este host, un `$?`/`$var` dentro de la cadena de `bash -c` se expande
     ANTES de que el script corra (devolvia EXIT=0 y RC= vacio con el script saliendo 2).
     Invocacion directa => spawn.status es el exit real del pipeline. */
  const cmd = 'cd ' + toPosix(sandbox.copy) + ' && SSH_BIN=' + toPosix(sandbox.stub) +
    ' APE_SSH_KEY=/nonexistent ' + (extraEnv || '') + ' bash ./deploy.sh ' + args;
  const r = spawnSync('bash', ['-c', cmd], { encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), sshCalls: fs.readFileSync(sandbox.log, 'utf8') };
};

function dynamicChecks() {
  if (!bashOk()) {
    const why = 'bash no disponible: NO_COMPUTADO (el gate no puede probar la propiedad y no la da por buena)';
    add('D1', 'deploy.sh sin --apply no escribe en el repo y ejecuta dry-run.sh', false, why);
    add('D2', 'deploy.sh --apply sin --yes aborta con exit 2 sin contactar nada', false, why);
    add('D3', 'validate.sh que falla aborta con exit 3 antes de mutar', false, why);
    add('D4', 'el ssh real nunca se invoca (cero red, cero VPS)', false, why);
    return;
  }

  const realBefore = snapshotTree(DEPLOY);

  /* D1 · sin --apply: delega, no escribe en el repo */
  const s1 = makeSandbox('noapply');
  const r1 = runIn(s1, '');
  const realAfter = snapshotTree(DEPLOY);
  const dRepo = diffTrees(realBefore, realAfter);
  const dCopy = diffTrees(snapshotTree(DEPLOY), snapshotTree(s1.copy));
  const delegado = /STUB_SSH/.test(r1.sshCalls) && /sha256sum/.test(r1.sshCalls);
  const repoIntacto = dRepo.added.length === 0 && dRepo.removed.length === 0 && dRepo.changed.length === 0;
  const snapshotLocal = dCopy.added.filter((f) => /dryrun_remote_hashes_.*\.txt$/.test(f));
  add('D1', 'deploy.sh sin --apply no escribe en el repo y ejecuta dry-run.sh',
    r1.code === 0 && delegado && repoIntacto,
    'exit=' + r1.code + ' · delego a dry-run.sh=' + delegado + ' · repo _vps_stage/deploy intacto=' + repoIntacto +
    ' · escrituras dentro del sandbox: ' + (dCopy.added.join(', ') || 'ninguna'));
  if (snapshotLocal.length) finding('dry-run.sh:8 (ejecutado)', 'crea snapshot LOCAL en snapshots/: ' + snapshotLocal.join(', ') + ' — escritura local, NO remota');

  /* D2 · --apply sin --yes: exit 2 y cero llamadas remotas */
  const s2 = makeSandbox('noyes');
  const r2 = runIn(s2, '--apply');
  add('D2', 'deploy.sh --apply sin --yes aborta con exit 2 sin contactar nada',
    r2.code === 2 && r2.sshCalls.trim() === '',
    'exit=' + r2.code + ' (esperado 2) · llamadas ssh=' + (r2.sshCalls.trim() ? r2.sshCalls.trim().split('\n').length : 0));

  /* D3 · validate.sh que falla: exit 3 antes de la primera mutacion */
  const s3 = makeSandbox('valfail');
  fs.writeFileSync(path.join(s3.copy, 'validate.sh'), '#!/bin/sh\nexit 1\n');
  const r3 = runIn(s3, '--apply --yes');
  add('D3', 'validate.sh que falla aborta con exit 3 antes de mutar',
    r3.code === 3 && r3.sshCalls.trim() === '',
    'exit=' + r3.code + ' (esperado 3) · llamadas ssh antes del aborto=' + (r3.sshCalls.trim() ? r3.sshCalls.trim().split('\n').length : 0));

  /* D4 · cero red: el stub recibio todas las llamadas y no hay ssh directo */
  add('D4', 'el ssh real nunca se invoca (cero red, cero VPS)',
    /STUB_SSH/.test(r1.sshCalls) && r2.sshCalls.trim() === '' && r3.sshCalls.trim() === '',
    'llamadas capturadas por el stub en D1=' + r1.sshCalls.trim().split('\n').filter(Boolean).length +
    ' · en D2/D3=0 · el binario ssh real no se usa (SSH_BIN lo sustituye)');

  for (const s of [s1, s2, s3]) { try { fs.rmSync(s.work, { recursive: true, force: true }); } catch (e) { /* tmpdir */ } }
}

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */
function main() {
  console.log('== CONTRATO DEL RECONCILIADOR VPS · audit/plan/apply sobre _vps_stage/deploy ==');
  console.log('pipeline: ' + path.relative(ROOT, DEPLOY).replace(/\\/g, '/') + ' · sin red · sin VPS · copia de trabajo en os.tmpdir()');
  if (IS_OVERRIDE) console.log('AVISO: auditando una COPIA (--deploy-dir), no el pipeline del repo');
  console.log('');

  console.log('-- analisis de texto (solo lectura sobre el repo) --');
  const meta = staticChecks();
  console.log('  anclas: exec dry-run.sh :' + meta.execLine + ' · guard --yes :' + meta.yesLine +
    ' · validate.sh :' + meta.valLine + ' · primera mutacion :' + meta.firstMutation);
  for (const r of results.filter((x) => x.id.startsWith('C'))) {
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.id + ' ' + r.name);
    console.log('        ' + r.detail);
  }
  console.log('');

  console.log('-- ejecucion local controlada (ssh sustituido por stub via SSH_BIN) --');
  dynamicChecks();
  for (const r of results.filter((x) => x.id.startsWith('D'))) {
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.id + ' ' + r.name);
    console.log('        ' + r.detail);
  }

  if (findings.length) {
    console.log('');
    console.log('-- hallazgos (no tumban el gate: van al informe) --');
    for (const f of findings) console.log('  HALLAZGO  ' + f.where + ' → ' + f.text);
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log('');
  console.log('-- resumen --');
  console.log('  comprobaciones: ' + results.length + ' | PASS ' + pass + ' | FAIL ' + fail);
  console.log('  hallazgos declarados: ' + findings.length);
  console.log('  RESULT=' + (fail === 0 ? 'PASS' : 'FAIL'));
  process.exit(fail === 0 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { staticChecks, dynamicChecks, toPosix, snapshotTree, diffTrees };
