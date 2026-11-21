#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * PARIDAD DE DESPLIEGUE DEL MOTOR JIT (gate de CI)
 *
 * POR QUE EXISTE (R9, 2026-11-21)
 *   En el arbol hay CUATRO server.js y solo uno es el motor canonico. Medido:
 *     IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js  268bbd3a…  480 976 B  9812 l  <- CANONICO
 *     vps/ape-jit/server.js                            290b1103…  449 392 B  9234 l
 *     tools/lab/ape-jit/server.js                      38c92b56…  474 044 B  9696 l
 *     vps_jit/server.js                                e400fa19…   29 624 B   662 l  (OTRO programa, legacy)
 *
 *   [R11 2026-11-21] La fila del CANONICO cambio de bytes: /resolve y /go pasaron a
 *   lectura pura. Pin vigente del canonico: ad37d894… 490421 B 9998 l
 *   (contracts/canary_jit_contract_v1.json -> engine.deployable_engine_sha256). Las
 *   cifras de esta cabecera son las medidas en R9 y se conservan como historia.
 *
 *   El gate del contrato de rutas (tools/quality/test_jit_routes_contract.js) comprueba
 *   que el canonico conserva sus 61 rutas. NO comprobaba QUE FICHERO SE DESPLIEGA: hoy
 *   tres artefactos dicen tres cosas distintas sobre /opt/ape-jit/server.js
 *     - _vps_stage/deploy/manifest.tsv        -> IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js (268bbd3a)
 *     - .github/workflows/deploy-vps.yml      -> tools/lab/ape-jit/server.js con SHA_PIN 8c1a0085
 *     - docs/canary/…/12_CANARY_DEPLOYMENT_RECEIPT.json -> declara source tools/lab y motor 290b1103
 *   Este script compara esos artefactos entre si y con los bytes del repo.
 *
 * QUE COMPRUEBA (tres aserciones, ninguna heredada de un informe)
 *   C1 FUENTE DEL MANIFIESTO: la fila de manifest.tsv cuyo destino es /opt/ape-jit/server.js
 *      apunta al fichero canonico, y ese fichero existe.
 *   C2 RECIBO CANARY == MANIFIESTO: el sha256 que el recibo canary declara como motor
 *      instalado coincide con el sha256 de la fuente del manifiesto. Si el recibo no
 *      declara sha del motor -> NO COMPUTADO (nunca PASS por ausencia de dato).
 *   C3 NINGUN WORKFLOW INSTALA OTRA COPIA: en .github/workflows/*.yml, toda instalacion de
 *      un fichero server.js hacia /opt/ape-jit/server.js debe nombrar el canonico.
 *
 * SALIDA
 *   exit 0 = C1..C3 PASS · exit 1 = alguna FALLA (nombra fichero, linea y sha) ·
 *   exit 2 = ninguna falla pero hay NO COMPUTADO (no se puede declarar verde).
 *
 * USO
 *   node tools/quality/check_jit_deploy_parity.js
 *   node tools/quality/check_jit_deploy_parity.js --json
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const CANON = 'IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js';
const DEST = '/opt/ape-jit/server.js';
const MANIFEST = '_vps_stage/deploy/manifest.tsv';
const RECEIPT = 'docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json';
const WORKFLOW_DIR = '.github/workflows';

const JSON_OUT = process.argv.includes('--json');

/* --workflows-dir=<ruta> permite apuntar C4 a una COPIA de los workflows (prueba negativa
 * sobre un temporal, sin tocar el workflow real). Acepta ruta absoluta o relativa a ROOT. */
const WD_ARG = process.argv.find((a) => a.startsWith('--workflows-dir='));
const PINS_DIR = WD_ARG ? (path.isAbsolute(WD_ARG.split('=')[1]) ? WD_ARG.split('=')[1] : WD_ARG.split('=').slice(1).join('=')) : WORKFLOW_DIR;

const results = [];

function abs(rel) { return path.join(ROOT, rel); }

function sha256(rel) {
  const p = abs(rel);
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function record(id, status, detail, evidence) {
  results.push({ id, status, detail, evidence: evidence || null });
}

/* ── C1: la fuente del manifiesto es el canonico ─────────────────────────── */
function checkManifestSource() {
  const p = abs(MANIFEST);
  if (!fs.existsSync(p)) {
    record('C1', 'NO_COMPUTADO', `no existe ${MANIFEST}`);
    return null;
  }
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  let row = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.startsWith('#')) continue;
    const cols = raw.split('\t');
    if (cols.length < 2) continue;
    if (cols[1].trim() === DEST) { row = { line: i + 1, source: cols[0].trim(), cols }; break; }
  }
  if (!row) {
    record('C1', 'FALLA', `${MANIFEST} no tiene ninguna fila con destino ${DEST}`, { file: MANIFEST });
    return null;
  }
  if (row.source !== CANON) {
    record('C1', 'FALLA', `${MANIFEST}:${row.line} despliega ${row.source} y NO el canonico ${CANON}`, { file: MANIFEST, line: row.line, found: row.source, expected: CANON });
    return { source: row.source, sha: sha256(row.source), line: row.line };
  }
  const sha = sha256(row.source);
  if (!sha) {
    record('C1', 'FALLA', `${MANIFEST}:${row.line} apunta a ${row.source}, que no existe en el arbol`, { file: MANIFEST, line: row.line });
    return null;
  }
  record('C1', 'PASS', `${MANIFEST}:${row.line} -> ${CANON} sha256=${sha}`, { file: MANIFEST, line: row.line, sha });
  return { source: row.source, sha, line: row.line, date: lastCommitDate(CANON) };
}

/* Revisión declarada por el recibo: su clave de despliegue (p.ej. deployment_2026_11_12). */
function receiptRevision(json) {
  if (!json || typeof json !== 'object') return null;
  const keys = Object.keys(json).filter((k) => /^deployment_\d{4}_\d{2}_\d{2}$/.test(k)).sort();
  if (!keys.length) return null;
  const m = keys[keys.length - 1].match(/^deployment_(\d{4})_(\d{2})_(\d{2})$/);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/* Fecha del último commit que tocó un path (git). null si no hay git o no hay historial. */
function lastCommitDate(rel) {
  try {
    const out = require('child_process').execFileSync(
      'git', ['-C', ROOT, 'log', '-1', '--format=%cs', '--', rel],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch (e) { return null; }
}

/* ── C2: el recibo canary pinea los mismos bytes que el manifiesto ───────── */

/* El recibo agrupa su evidencia por despliegue (p.ej. deployment_2026_11_12). No se fija
 * la clave: se busca, en cualquier nivel, un objeto `motor` cuyo `path` sea el destino. */
function findMotorBlock(node, depth) {
  if (!node || typeof node !== 'object' || (depth || 0) > 6) return null;
  if (node.motor && typeof node.motor === 'object' && node.motor.path === DEST) return node.motor;
  for (const k of Object.keys(node)) {
    const hit = findMotorBlock(node[k], (depth || 0) + 1);
    if (hit) return hit;
  }
  return null;
}

/* Igual: cualquier array de filas con `destination` == destino del motor. */
function collectDeployedFiles(node, depth, acc) {
  acc = acc || [];
  if (!node || typeof node !== 'object' || (depth || 0) > 6) return acc;
  if (Array.isArray(node)) {
    for (const it of node) {
      if (it && it.destination === DEST) acc.push(it);
      collectDeployedFiles(it, (depth || 0) + 1, acc);
    }
    return acc;
  }
  for (const k of Object.keys(node)) collectDeployedFiles(node[k], (depth || 0) + 1, acc);
  return acc;
}

function checkReceipt(mf) {
  const p = abs(RECEIPT);
  if (!fs.existsSync(p)) {
    record('C2', 'NO_COMPUTADO', `no existe ${RECEIPT}: no hay recibo que pinee el motor`);
    return;
  }
  let json;
  try { json = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) {
    record('C2', 'NO_COMPUTADO', `${RECEIPT} no es JSON valido: ${e.message}`);
    return;
  }
  const motor = findMotorBlock(json);
  const motorSha = motor && typeof motor.sha256 === 'string' ? motor.sha256.toLowerCase() : null;

  // fila del recibo que declara el destino del motor
  let declared = null;
  const files = collectDeployedFiles(json);
  if (Array.isArray(files)) {
    const hit = files.find((f) => f && f.destination === DEST);
    if (hit) declared = { source: hit.source, sha: (hit.source_sha256 || '').toLowerCase() || null, bytes: hit.source_bytes };
  }

  if (!motorSha) {
    record('C2', 'NO_COMPUTADO', `${RECEIPT} no declara evidencia_de_verificacion.motor.sha256: no se puede comparar (no se rellena con un numero)`);
    return;
  }
  if (!mf || !mf.sha) {
    record('C2', 'NO_COMPUTADO', 'C1 no produjo sha de la fuente del manifiesto: nada que comparar');
    return;
  }
  if (motorSha !== mf.sha) {
    const src = declared && declared.source ? `${declared.source}` : '(fuente no declarada)';
    // Antiguedad: un recibo anterior a los bytes actuales no puede atestiguarlos. Se declara
    // NO COMPUTADO (no PASS, no FALLA) y se nombra la remedacion: re-emitir el recibo.
    // FALLA solo si el recibo es de la MISMA fecha o posterior y aun asi contradice al manifiesto.
    const receiptDate = receiptRevision(json);
    if (receiptDate && mf && mf.date && receiptDate < mf.date) {
      record('C2', 'NO_COMPUTADO',
        `el recibo canary (${receiptDate}) es ANTERIOR a los bytes actuales del canonico (${mf.date}): ` +
        `pinea ${motorSha} y atribuye la instalacion a ${src}, mientras el manifiesto despliega ${mf.sha}. ` +
        `No mide los bytes de hoy: hay que RE-EMITIR el recibo contra ${CANON} (${mf.sha}). No se rellena con un numero`,
        { receipt: RECEIPT, receipt_date: receiptDate, receipt_sha: motorSha, manifest_sha: mf.sha, receipt_source: src });
      return;
    }
    record('C2', 'FALLA',
      `el recibo canary pinea el motor en ${motorSha} pero el manifiesto despliega ${mf.sha} ` +
      `(${CANON}); el recibo atribuye la instalacion a ${src}. Gate RED: alguien desplegaria una copia y atestiguaria otra`,
      { receipt: RECEIPT, receipt_sha: motorSha, manifest_sha: mf.sha, receipt_source: src });
    return;
  }
  record('C2', 'PASS', `recibo canary y manifiesto pinean el mismo motor sha256=${motorSha}`, { receipt: RECEIPT, sha: motorSha });
}

/* ── C3: ningun workflow instala una copia no canonica ──────────────────── */
function checkWorkflows() {
  const dir = abs(WORKFLOW_DIR);
  if (!fs.existsSync(dir)) {
    record('C3', 'NO_COMPUTADO', `no existe ${WORKFLOW_DIR}`);
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f));
  const offenders = [];
  const mentions = [];

  for (const f of files) {
    const rel = path.posix.join(WORKFLOW_DIR, f);
    const lines = fs.readFileSync(abs(rel), 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;                       // comentario: no ejecuta
      if (!/server\.js/.test(line)) continue;
      mentions.push(`${rel}:${i + 1}`);
      // solo interesa la linea que COPIA o INSTALA el fichero en el destino del motor
      const installs = /\b(scp|install|cp|rsync)\b/.test(line) && /ape-jit\/server\.js/.test(line);
      if (!installs) continue;
      const named = (line.match(/[A-Za-z0-9_.\-\/]*ape-jit\/server\.js/g) || []);
      const copySources = named.filter((n) => !n.includes(':/opt/') && !n.startsWith('/opt/'));
      const isCanon = copySources.some((s) => s.replace(/^\.\//, '') === CANON);
      const onlyDest = copySources.length === 0;
      if (!isCanon && !onlyDest) {
        offenders.push({ file: rel, line: i + 1, sources: copySources, text: trimmed.slice(0, 200) });
      }
    }
  }

  if (offenders.length === 0) {
    record('C3', 'PASS', `ningun workflow instala una copia no canonica (${mentions.length} menciones revisadas en ${files.length} workflows)`);
    return;
  }
  for (const o of offenders) {
    record('C3', 'FALLA',
      `${o.file}:${o.line} instala ${o.sources.join(', ') || '(fuente no reconocida)'} hacia ${DEST} y NO el canonico`,
      o);
  }
}

/* ── C4: ningun SHA_PIN de despliegue puede divergir del sha real del canonico ──
 *
 * POR QUE (medido 2026-11-21): C1 mira la RUTA del fichero, C3 mira QUE fichero se
 * instala, C2 esta NO COMPUTADO por antiguedad del recibo. El VALOR del SHA_PIN no lo
 * veia nadie: si el motor sube y el pin se queda viejo, el gate se queda amarillo y el
 * que se entera es el paso de deploy abortando. Gate decorativo al lado de un fallo real.
 *
 * El sha de referencia es el del BLOB commiteado (`git cat-file -p HEAD:<path>`), porque eso
 * es EXACTAMENTE lo que ve el paso de deploy en CI al hacer `sha256sum` sobre un checkout
 * limpio. Si el worktree esta sucio (edicion en vuelo), el worktree NO es la referencia: se
 * informa como INFO. Comparar contra el worktree haria verde un pin que apunta a bytes que
 * todavia no existen en ningun commit. */
function blobSha256(rel) {
  try {
    const buf = require('child_process').execFileSync(
      'git', ['-C', ROOT, 'cat-file', '-p', `HEAD:${rel}`],
      { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch (e) { return null; }
}

/* sha del fichero en disco normalizado a LF (para informar de un worktree sucio, NO para decidir). */
function worktreeSha256(rel) {
  const p = abs(rel);
  if (!fs.existsSync(p)) return null;
  const normalized = fs.readFileSync(p).toString('binary').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(Buffer.from(normalized, 'binary')).digest('hex');
}

/* Workflows que INSTALAN el motor: linea no comentada con verbo de copia y el destino
 * o el fuente del motor. Se devuelven todos los que hoy lo hacen, no solo el conocido. */
function engineInstallerFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/i.test(x)).sort()) {
    const full = path.isAbsolute(dir) ? path.join(dir, f) : abs(path.posix.join(dir, f));
    const rows = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    const hits = [];
    rows.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('#')) return;
      if (!/\b(scp|install|cp|rsync)\b/.test(line)) return;
      if (!/ape-jit[\/-]server\.js|ape-jit\/server\.js/.test(line)) return;
      hits.push(i + 1);
    });
    if (hits.length) out.push({ name: f, display: path.posix.join(dir, f), lines: rows, installLines: hits });
  }
  return out;
}

function checkPins(pinsDir) {
  const dir = pinsDir || WORKFLOW_DIR;
  const realSha = blobSha256(CANON);
  if (!realSha) {
    record('C4', 'NO_COMPUTADO', `no se pudo leer el canonico ${CANON}: sin sha real no hay contra que comparar`);
    return;
  }
  const installers = engineInstallerFiles(dir);
  if (installers.length === 0) {
    record('C4', 'NO_COMPUTADO',
      `ningun workflow de ${dir} instala ${DEST}: no hay SHA_PIN que comprobar (no se declara verde por ausencia)`);
    return;
  }

  const checked = [];
  const unpinned = [];
  for (const wf of installers) {
    let found = 0;
    wf.lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('#')) return;                                  // comentario: no despliega
      const m = line.match(/SHA_PIN\s*=\s*([0-9a-fA-F]{64})/);
      if (!m) return;
      found += 1;
      const pin = m[1].toLowerCase();
      if (pin !== realSha) {
        record('C4', 'FALLA',
          `${wf.display}:${i + 1}  pin=${pin}  real=${realSha}`,
          { file: wf.display, line: i + 1, pin, real: realSha });
      } else {
        checked.push(`${wf.display}:${i + 1}`);
      }
    });
    if (found === 0) unpinned.push(wf.display);
  }

  if (checked.length === 0 && results.every((r) => !(r.id === 'C4' && r.status === 'FALLA'))) {
    record('C4', 'NO_COMPUTADO',
      `los instaladores del motor no declaran ningun SHA_PIN (${unpinned.join(', ')}): no hay pin que verificar`);
    return;
  }
  if (checked.length > 0) {
    record('C4', 'PASS',
      `${checked.length} SHA_PIN casan con el sha real del canonico (${realSha}): ${checked.join(', ')}` +
      (unpinned.length ? ` · declarado: ${unpinned.length} instalador(es) sin SHA_PIN (verifican por bytes, no por pin): ${unpinned.join(', ')}` : ''),
      { real: realSha, checked, unpinned });
  }
  for (const u of unpinned) {
    record('C4', 'INFO', `${u} instala el motor sin SHA_PIN: verifica por otra via (no es divergencia, pero no esta pineado)`);
  }
}

/* ── CENSO: copias presentes en el arbol (informativo, siempre mide) ─────── */
function census() {
  const copies = [CANON, 'vps/ape-jit/server.js', 'tools/lab/ape-jit/server.js', 'vps_jit/server.js'];
  return copies.map((rel) => {
    const p = abs(rel);
    if (!fs.existsSync(p)) return { path: rel, present: false };
    const buf = fs.readFileSync(p);
    return {
      path: rel,
      present: true,
      bytes: buf.length,
      lines: (buf.toString('utf8').match(/\n/g) || []).length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      canonical: rel === CANON,
    };
  });
}

function main() {
  const mf = checkManifestSource();
  checkReceipt(mf);
  checkWorkflows();
  checkPins(PINS_DIR);

  const failing = results.filter((r) => r.status === 'FALLA');
  const unknown = results.filter((r) => r.status === 'NO_COMPUTADO');
  const exitCode = failing.length ? 1 : (unknown.length ? 2 : 0);

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({
      gate: 'jit-deploy-parity',
      canonical: CANON,
      destination: DEST,
      exit_code: exitCode,
      results,
      copies: census(),
    }, null, 2) + '\n');
    process.exit(exitCode);
  }

  const tag = { PASS: 'PASS', FALLA: 'FALLA', NO_COMPUTADO: 'NO COMPUTADO', INFO: 'INFO' };
  console.log('== PARIDAD DE DESPLIEGUE DEL MOTOR JIT ==');
  console.log(`   canonico: ${CANON}`);
  console.log(`   destino : ${DEST}`);
  for (const r of results) console.log(`   [${tag[r.status]}] ${r.id} — ${r.detail}`);
  console.log('-- copias presentes en el arbol --');
  for (const c of census()) {
    if (!c.present) { console.log(`   AUSENTE  ${c.path}`); continue; }
    console.log(`   ${c.canonical ? 'CANONICO' : 'copia   '} ${c.path}  ${c.sha256}  ${c.bytes} B  ${c.lines} l`);
  }
  console.log(`-- RESULTADO: ${failing.length} FALLA · ${unknown.length} NO COMPUTADO · exit ${exitCode}`);
  process.exit(exitCode);
}

if (require.main === module) main();
module.exports = { main, CANON, DEST, MANIFEST, RECEIPT };
