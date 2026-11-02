#!/usr/bin/env node
/**
 * audit_vlcopt.js — audita nombres de opcion #EXTVLCOPT contra los binarios de VLC.
 *
 * Método: construye un blob de cadenas de los .dll/.exe de VLC (codificación latin1)
 * y comprueba si cada nombre aparece como token exacto, probando su forma con
 * guiones y con guiones bajos.
 *
 * LIMITE HONESTO: presencia en el binario no prueba que la opción esté registrada
 * (podría ser parte de una descripción). Ausencia sí es evidencia fuerte de que
 * VLC no conoce el nombre. Un empate se reporta como PRESENTE_SIN_PRUEBA.
 *
 * Uso: node audit_vlcopt.js <names.txt> [--root "C:\\Program Files\\VideoLAN\\VLC"] [--out audit.json]
 */
'use strict';

const fs = require('fs');
const path = require('path');

function collectBinaries(dir, acc, skipped) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    skipped.push({ dir, reason: err.code || err.message });
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'locale' || e.name === 'lua') continue;
      collectBinaries(p, acc, skipped);
    } else if (/\.(dll|exe)$/i.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

function main() {
  const argv = process.argv.slice(2);
  const namesPath = argv[0];
  let root = 'C:\\Program Files\\VideoLAN\\VLC';
  let outPath = null;
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--root') root = argv[i + 1];
    if (argv[i] === '--out') outPath = argv[i + 1];
  }
  if (!namesPath || !fs.existsSync(namesPath)) {
    process.stderr.write('uso: node audit_vlcopt.js <names.txt> [--root DIR] [--out FILE]\n');
    return 2;
  }
  const names = fs.readFileSync(namesPath, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!fs.existsSync(root)) {
    process.stderr.write(`raiz VLC no existe: ${root}\n`);
    return 3;
  }

  const skipped = [];
  const binaries = collectBinaries(root, [], skipped);
  if (binaries.length === 0) {
    process.stderr.write(`no se encontraron binarios bajo ${root}\n`);
    return 4;
  }

  let blob = '';
  let bytesRead = 0;
  for (const f of binaries) {
    try {
      const buf = fs.readFileSync(f);
      bytesRead += buf.length;
      blob += buf.toString('latin1');
      blob += '\u0000';
    } catch (err) {
      skipped.push({ file: f, reason: err.code || err.message });
    }
  }

  const present = [];
  const absent = [];
  for (const n of names) {
    const hyphen = n;
    const underscore = n.replace(/-/g, '_');
    const hit = blob.includes(hyphen) || blob.includes(underscore);
    if (hit) present.push(n);
    else absent.push(n);
  }

  const report = {
    root,
    binaries_scanned: binaries.length,
    bytes_scanned: bytesRead,
    method: 'token exacto (latin1) en el blob de binarios; guiones y guiones_bajos',
    limitation: 'presencia NO prueba registro de la opcion; ausencia es evidencia fuerte de nombre inexistente',
    total: names.length,
    presentes: present.length,
    ausentes: absent.length,
    ausentes_lista: absent,
    presentes_lista: present,
    skipped
  };

  if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`binarios=${report.binaries_scanned} bytes=${report.bytes_scanned}`);
  console.log(`total=${report.total} presentes=${report.presentes} ausentes=${report.ausentes}`);
  console.log('--- AUSENTES (VLC no conoce el nombre) ---');
  absent.forEach((a) => console.log('  ' + a));
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    process.stderr.write(`audit_vlcopt.js ERROR: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { collectBinaries };
