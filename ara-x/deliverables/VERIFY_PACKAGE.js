#!/usr/bin/env node
'use strict';

/**
 * Verificador del paquete ARA-X (X2).
 *
 * Comprueba un árbol extraído contra `MANIFEST_SHA256.txt`:
 *   - cada línea `sha256  bytes  path` (el path relativo a `--root`);
 *   - tamaño exacto, sha256 exacto y ausencia de rutas fuera de `--root`;
 *   - informa de archivos extra no listados (aviso, no error).
 *
 * Uso:
 *   node VERIFY_PACKAGE.js --manifest MANIFEST_SHA256.txt --root <dir>
 *
 * Exit: 0 si todos los archivos del manifiesto verifican; 1 si falta/sobra algo
 * o hay hash/size distinto; 2 error de uso/IO.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const out = { manifest: null, root: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--manifest') out.manifest = argv[++i];
    else if (argv[i] === '--root') out.root = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') out.help = true;
    else throw new Error(`argumento no reconocido: ${argv[i]}`);
  }
  return out;
}

function usage() {
  console.log('Uso: node VERIFY_PACKAGE.js --manifest <MANIFEST_SHA256.txt> --root <directorio extraído>');
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function walk(dir, base, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); return 0; }
  if (!args.manifest || !args.root) { usage(); return 2; }

  const manifestAbs = path.resolve(args.manifest);
  const rootAbs = path.resolve(args.root);
  if (!fs.existsSync(manifestAbs)) throw new Error(`manifiesto ausente: ${manifestAbs}`);
  if (!fs.existsSync(rootAbs)) throw new Error(`root ausente: ${rootAbs}`);

  const lines = fs.readFileSync(manifestAbs, 'utf8').split(/\r?\n/);
  const entries = [];
  for (const line of lines) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    const m = /^([a-f0-9]{64})\s+(\d+)\s+(.+)$/.exec(line);
    if (!m) throw new Error(`línea de manifiesto inválida: ${line.slice(0, 120)}`);
    entries.push({ sha256: m[1], bytes: Number(m[2]), rel: m[3] });
  }
  if (entries.length === 0) throw new Error('manifiesto vacío');

  const listed = new Set();
  const failures = [];
  let bytes = 0;
  for (const e of entries) {
    if (e.rel.includes('..')) { failures.push({ rel: e.rel, why: 'path traversal' }); continue; }
    const full = path.resolve(rootAbs, e.rel);
    if (!full.startsWith(rootAbs + path.sep) && full !== rootAbs) {
      failures.push({ rel: e.rel, why: 'fuera del root' });
      continue;
    }
    listed.add(e.rel.split(path.sep).join('/'));
    if (!fs.existsSync(full)) { failures.push({ rel: e.rel, why: 'ausente' }); continue; }
    const st = fs.statSync(full);
    if (st.size !== e.bytes) { failures.push({ rel: e.rel, why: `bytes ${st.size} != ${e.bytes}` }); continue; }
    const got = await sha256File(full);
    if (got !== e.sha256) { failures.push({ rel: e.rel, why: `sha256 ${got.slice(0, 12)}… != ${e.sha256.slice(0, 12)}…` }); continue; }
    bytes += st.size;
  }

  const extras = walk(rootAbs, rootAbs).filter((rel) => !listed.has(rel) && rel !== 'MANIFEST_SHA256.txt');

  const ok = failures.length === 0;
  console.log(JSON.stringify({
    ok,
    files_verified: entries.length - failures.length,
    files_expected: entries.length,
    payload_bytes: bytes,
    extras,
    failures,
    manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(manifestAbs)).digest('hex')
  }, null, 2));
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(2);
});
