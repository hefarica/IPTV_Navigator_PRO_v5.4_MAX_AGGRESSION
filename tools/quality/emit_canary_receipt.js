#!/usr/bin/env node
/* tools/quality/emit_canary_receipt.js — [R16 2026-11-21]
 *
 * Re-emite el recibo canary de despliegue del motor JIT — y SOLO puede hacerlo con
 * una medición real del VPS. NO mide nada por su cuenta y NO inventa un sha.
 *
 * ORDEN QUE NO SE PUEDE INVERTIR (por eso existen las guardas):
 *   (1) desplegar el motor (lo autoriza el operador por el Environment production)
 *   (2) medir por SSH el sha256/bytes REALES de /opt/ape-jit/server.js
 *   (3) recién entonces, pasar esa medición aquí y escribir el recibo
 *
 * Re-emitir contra bytes que nunca corrieron es fabricar evidencia. El script se
 * niega si el sha medido no coincide con el pin del workflow o con el blob de HEAD.
 *
 * El gate (tools/quality/check_jit_deploy_parity.js, C2) lee de este recibo:
 *   · un objeto `motor` con `path === '/opt/ape-jit/server.js'` y `sha256`
 *   · una clave `deployment_YYYY_MM_DD` (se usa la de fecha mayor) para la antigüedad
 *   · opcional: filas con `destination === '/opt/ape-jit/server.js'` (source, source_sha256)
 *
 * USO (dry-run por defecto: NO escribe nada):
 *   node tools/quality/emit_canary_receipt.js \
 *     --measured-sha <64hex> --measured-bytes <n> \
 *     --deployed-at 2026-11-22T00:15:00Z --deployment-id deployment_2026_11_22 \
 *     --measured-from 'ssh root@VPS "sha256sum /opt/ape-jit/server.js"' \
 *     --measured-output '<salida literal>' \
 *     [--service active] [--listener-3099 1] [--health 200] \
 *     [--run <id>] [--ref <rama>] [--commit <sha corto>] [--backup-stamp <stamp>] \
 *     [--receipt <ruta alternativa>] [--confirm-deployed] --write
 *
 * Códigos: 0 = escrito/ya atestiguado · 1 = guarda violada (aborta) · 2 = uso incorrecto
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CANON = 'IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js';
const DEST = '/opt/ape-jit/server.js';
const RECEIPT = 'docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json';
const WORKFLOW = '.github/workflows/deploy-vps.yml';

const abs = (p) => path.isAbsolute(p) ? p : path.join(ROOT, p);
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const has = (name) => argv.includes('--' + name);

function die(code, msg, extra) {
  console.error('ABORTA: ' + msg);
  if (extra) console.error(extra);
  process.exit(code);
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const isSha = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

/* ── uso ──────────────────────────────────────────────────────────────────── */
if (has('help') || argv.length === 0) {
  console.log('uso: node tools/quality/emit_canary_receipt.js --measured-sha <64hex> --measured-bytes <n> \\');
  console.log('        --deployed-at <ISO-UTC> --deployment-id deployment_YYYY_MM_DD \\');
  console.log('        --measured-from <comando> --measured-output <salida> [--confirm-deployed] --write');
  console.log('Por defecto es dry-run: NO escribe. Ver cabecera del fichero para las guardas.');
  process.exit(argv.length === 0 ? 2 : 0);
}

/* ── entradas obligatorias ────────────────────────────────────────────────── */
const measuredSha = String(arg('measured-sha') || '').toLowerCase();
const measuredBytesRaw = arg('measured-bytes');
const deployedAt = arg('deployed-at');
const deploymentId = arg('deployment-id');
const measuredFrom = arg('measured-from');
const measuredOutput = arg('measured-output');
const receiptPath = abs(arg('receipt') || RECEIPT);
const write = has('write');

if (!isSha(measuredSha)) die(2, 'falta --measured-sha (64 hex) o no es un sha256 válido');
const measuredBytes = Number(measuredBytesRaw);
if (!Number.isInteger(measuredBytes) || measuredBytes <= 0) die(2, 'falta --measured-bytes (entero > 0)');
if (!deployedAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(deployedAt)) die(2, 'falta --deployed-at en formato YYYY-MM-DDTHH:MM:SSZ');
if (!deploymentId || !/^deployment_\d{4}_\d{2}_\d{2}$/.test(deploymentId)) die(2, 'falta --deployment-id (deployment_YYYY_MM_DD)');
if (!measuredFrom) die(2, 'falta --measured-from: sin el comando, los bytes no tienen procedencia');
if (!measuredOutput) die(2, 'falta --measured-output: sin la salida, la procedencia no es verificable');

/* ── guarda 1: el pin del workflow debe ser EXACTAMENTE lo medido ─────────── */
let pins = [];
try {
  const wf = fs.readFileSync(abs(WORKFLOW), 'utf8');
  pins = [...wf.matchAll(/SHA_PIN\s*=\s*([0-9a-fA-F]{64})/g)].map((m) => m[1].toLowerCase());
} catch (e) {
  die(1, `no se pudo leer ${WORKFLOW}: sin pin no hay contra qué validar la medición`, e.message);
}
const uniqPins = [...new Set(pins)];
if (!uniqPins.length) die(1, `${WORKFLOW} no declara ningún SHA_PIN: no se puede validar la medición contra el despliegue`);
if (uniqPins.length > 1) die(1, `${WORKFLOW} declara pins distintos (${uniqPins.join(', ')}): hay que unificarlos antes de atestiguar`);
if (uniqPins[0] !== measuredSha) {
  die(1,
    `el sha medido (${measuredSha}) NO es el pin del workflow (${uniqPins[0]}).\n` +
    '  Re-emitir el recibo con un sha distinto al que se despliega sería atestiguar otros bytes.');
}

/* ── guarda 2: lo medido debe ser el blob COMMITEADO del canónico ─────────── */
let blobSha = null;
try {
  const buf = execFileSync('git', ['-C', ROOT, 'cat-file', '-p', `HEAD:${CANON}`],
    { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  blobSha = sha(buf);
} catch (e) {
  die(1, `no se pudo leer el blob HEAD:${CANON} (git disponible y fichero versionado son requisito)`, e.message);
}
if (blobSha !== measuredSha) {
  die(1,
    `el sha medido (${measuredSha}) != blob de HEAD (${blobSha}).\n` +
    '  O el VPS no tiene lo que dice el repo, o el commit no es el que se desplegó. No se atestigua.');
}

/* ── guarda 3: la fecha del recibo no puede ser anterior a los bytes ──────── */
const idDate = deploymentId.replace(/^deployment_/, '').replace(/_/g, '-');
let commitDate = null;
try {
  commitDate = execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%cs', '--', CANON],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch (e) { /* sin historial: se declara abajo */ }
if (!commitDate || !/^\d{4}-\d{2}-\d{2}$/.test(commitDate)) {
  die(1, `no se pudo obtener la fecha del último commit de ${CANON}: sin ella no se puede demostrar que el recibo es POSTERIOR a los bytes`);
}
if (idDate < commitDate) {
  die(1,
    `la fecha del recibo (${idDate}) es ANTERIOR al último commit del canónico (${commitDate}).\n` +
    '  El gate lo marcaría NO COMPUTADO por antigüedad, y con razón: un recibo no puede atestiguar bytes posteriores.');
}

/* ── guarda 4: confirmación explícita de despliegue ───────────────────────── */
if (write && !has('confirm-deployed')) {
  die(1, 'para escribir hace falta --confirm-deployed: el script no asume que el motor ya está desplegado');
}

/* ── recibo actual: se PRESERVA toda la historia, no se reescribe ─────────── */
let doc = {};
if (fs.existsSync(receiptPath)) {
  try { doc = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); }
  catch (e) { die(1, `${receiptPath} existe pero no es JSON válido: no se sobrescribe a ciegas`, e.message); }
}
const prev = doc[deploymentId] && doc[deploymentId].motor ? doc[deploymentId].motor : null;
if (prev && String(prev.sha256).toLowerCase() === measuredSha) {
  console.log(`YA ATESTIGUADO: ${deploymentId} ya declara motor.sha256=${measuredSha} (${measuredBytes} B). No se escribe nada.`);
  process.exit(0);
}

/* ── nodo del despliegue (sólo campos medidos; lo no medido se omite) ─────── */
const servicio = arg('service');
const listener = arg('listener-3099');
const health = arg('health');
const motor = {
  path: DEST,
  bytes: measuredBytes,
  sha256: measuredSha,
  sha_en_origen_y_destino: true,          // guardas 1 y 2: pin == medido == blob HEAD
  ...(servicio ? { servicio } : {}),
  ...(listener !== null ? { listener_3099: Number(listener) } : {}),
  ...(health !== null ? { health_interno: Number(health) } : {}),
};
const node = {
  run: arg('run') || null,
  ref: arg('ref') || null,
  commit: arg('commit') || null,
  mode: 'deploy',
  backup_stamp: arg('backup-stamp') || null,
  motor,
  deployed_at_utc: deployedAt,
  measured_from: [{
    command: measuredFrom,
    output: measuredOutput,
    at_utc: new Date().toISOString(),
  }],
  note: 'Re-emitido por emit_canary_receipt.js tras desplegar y medir. La historia anterior se conserva en las demás claves deployment_*.',
};
/* ── composición del recibo ───────────────────────────────────────────────────
 * ORDEN DE CLAVES = CORRECTO, no cosmético. El gate busca el bloque `motor` con
 * `findMotorBlock`, que recorre el objeto en orden de claves y devuelve el PRIMERO
 * con `path === DEST`. Si la clave nueva se añade al final (Object.assign), el
 * gate lee el motor del despliegue ANTERIOR: con la fecha ya actualizada, C2
 * pasaría de NO COMPUTADO a **FALLA** aunque la medición sea correcta.
 * Por eso la clave nueva va PRIMERO, y se verifica antes de escribir. */
const next = { [deploymentId]: node };
for (const k of Object.keys(doc)) if (k !== deploymentId) next[k] = doc[k];
next.generated_at_utc = new Date().toISOString();
next.base_git = (() => {
  try {
    const short = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const full = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    return { short, full };
  } catch (e) { return doc.base_git || null; }
})();

const out = JSON.stringify(next, null, 2) + '\n';
const before = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath, 'utf8') : '';

/* ── AUTO-VERIFICACIÓN: la misma lógica de búsqueda del gate, sobre el JSON final,
 *    ANTES de escribir. Y la antigüedad que calculará C2. Si algo no cuadra, no se
 *    escribe: mejor un recibo viejo que uno que ponga el gate en rojo por un detalle. */
function firstMotorOf(json) {
  const walk = (n, d) => {
    if (!n || typeof n !== 'object' || d > 6) return null;
    if (n.motor && typeof n.motor === 'object' && n.motor.path === DEST) return n.motor;
    for (const k of Object.keys(n)) { const h = walk(n[k], d + 1); if (h) return h; }
    return null;
  };
  return walk(json, 0);
}
function lastDeploymentDate(json) {
  const ks = Object.keys(json).filter((k) => /^deployment_\d{4}_\d{2}_\d{2}$/.test(k)).sort();
  if (!ks.length) return null;
  const m = ks[ks.length - 1].match(/^deployment_(\d{4})_(\d{2})_(\d{2})$/);
  return `${m[1]}-${m[2]}-${m[3]}`;
}
const parsed = JSON.parse(out);                 // relee lo que se va a escribir
const seen = firstMotorOf(parsed);
const seenDate = lastDeploymentDate(parsed);
if (!seen || String(seen.sha256).toLowerCase() !== measuredSha) {
  die(1, 'AUTO-VERIFICACIÓN FALLIDA: el primer bloque `motor` del recibo resultante no es el medido ' +
    `(vio ${seen ? seen.sha256 : 'ninguno'}). No se escribe: el gate leería otro despliegue.`);
}
if (seenDate !== idDate) {
  die(1, `AUTO-VERIFICACIÓN FALLIDA: C2 calculará la antigüedad con ${seenDate} y el despliegue es ${idDate}. No se escribe.`);
}

console.log('== RE-EMISIÓN DEL RECIBO CANARY ==');
console.log(`   recibo     : ${path.relative(ROOT, receiptPath)}`);
console.log(`   despliegue : ${deploymentId} (${deployedAt}) — clave PRIMERA del objeto`);
console.log(`   motor      : ${DEST}  ${measuredBytes} B  ${measuredSha}`);
console.log(`   pin wf     : ${uniqPins[0]}  (coincide)`);
console.log(`   blob HEAD  : ${blobSha}  (coincide)`);
console.log(`   últimos bytes commiteados del canónico: ${commitDate} (recibo ${idDate} >= ${commitDate})`);
console.log(`   gate leerá : motor.sha256=${seen.sha256} · fecha=${seenDate}  (auto-verificado)`);
console.log(`   modo       : ${write ? 'ESCRITURA REAL' : 'DRY-RUN (no se escribe; añade --write --confirm-deployed)'}`);

if (!write) {
  const added = out.split('\n').length - before.split('\n').length;
  console.log(`   diff       : ${added >= 0 ? '+' : ''}${added} líneas vs el recibo actual`);
  console.log('DRY-RUN: no se ha escrito nada.');
  process.exit(0);
}

const tmp = receiptPath + '.tmp';
fs.writeFileSync(tmp, out, { encoding: 'utf8', mode: 0o644 });
fs.renameSync(tmp, receiptPath);
console.log(`ESCRITO: ${path.relative(ROOT, receiptPath)} (${Buffer.byteLength(out)} B)`);
console.log('Siguiente: node tools/quality/check_jit_deploy_parity.js  → C2 debe pasar a PASS si sha y fecha cuadran.');
