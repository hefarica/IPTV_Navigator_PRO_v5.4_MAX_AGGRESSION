#!/usr/bin/env node
/**
 * validate_pre_t8.js — gatekeeper del checkpoint antes de t8.
 *
 * POR QUÉ EXISTE
 * t9 cambia el generador para que un artefacto con credenciales no salga del workspace,
 * y t10 añade el cap que sí muerde. Este script comprueba lo que t9 emitió ANTES de dejar
 * arrancar t8, sin confiar en la prosa del informe.
 *
 * DEFECTOS QUE ESTE SCRIPT EVITA (corregidos respecto de la propuesta inicial del operador)
 *  1. Un gate de contenido "cero credenciales en la URI" es IMPOSIBLE en el modo por defecto:
 *     la lista reproducible conserva el par usuario/password a propósito. Aplicarlo ahí
 *     empujaría a entregar una lista rota (URI con hash = 404 al arrancar el canal).
 *     => El gate se ELIGE por modo, leído del marcador de la cabecera.
 *  2. `process.exitCode` dentro de este proceso NO es el exit code de t9. Hay que recibirlo
 *     explícito con --t9-exit=N.
 *  3. Aceptar exit 3 como válido es contradictorio: 3 = VIDEO_DOWNSCALE_VIOLATION (fallo duro).
 *  4. `content.includes('A.*B')` es coincidencia LITERAL: `.*` nunca coincide. Hay que usar regex.
 *  5. `git check-ignore` responde 1 cuando el archivo NO está ignorado, que es justo el caso
 *     bueno si la salida va fuera del repo. El gate correcto es de RUTA RESUELTA contra la
 *     raíz git, no de .gitignore.
 *
 * Uso:
 *   node validate_pre_t8.js --input <salida.m3u8> [--t9-exit N] [--json]
 *
 * Exit: 0 = CHECKPOINT PASS · 1 = FAIL · 2 = uso/entrada invalida
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MARKER_REDACTED = '# APE-SENSITIVE: redacted, NOT playable';
const MARKER_SENSITIVE = '# APE-SENSITIVE: contains credentials, DO NOT DISTRIBUTE';
const CRED_PAIR = /\/live\/([^/\s]{2,})\/([^/\s]{2,})\//g;
/** Marcadores canonicos de redaccion. Sin esto, el propio placeholder se contaria como fuga. */
const PLACEHOLDER_SEGMENT = /^(?:USER|PASS|USERNAME|PASSWORD|\*+|<[^>]*>)$/i;

function countCredentialPairs(text) {
  let n = 0;
  let m;
  CRED_PAIR.lastIndex = 0;
  while ((m = CRED_PAIR.exec(text)) !== null) {
    if (PLACEHOLDER_SEGMENT.test(m[1]) || PLACEHOLDER_SEGMENT.test(m[2])) continue;
    n += 1;
  }
  return n;
}

/** Exit codes de t7/t9 y su significado. Aceptar 3 como "vale" seria aceptar un downscale. */
const EXIT_MEANING = {
  0: { ok: true, meaning: 'OK' },
  2: { ok: true, meaning: 'AUDIO_NO_COMPUTADO (declarado, sin URI inventada)' },
  3: { ok: false, meaning: 'VIDEO_DOWNSCALE_VIOLATION' },
  4: { ok: false, meaning: 'INPUT_MISSING' },
  5: { ok: false, meaning: 'INVALID_EVIDENCE' },
  6: { ok: false, meaning: 'OUTPUT_PATH_INSIDE_REPO (rechazo correcto si la salida caia en el repo)' },
  8: { ok: false, meaning: 'OUTPUT_EXISTS (colision en preflight; no hay artefacto que validar)' }
};

function gitRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function validate(inputPath, t9Exit) {
  const out = {
    tool: 'validate_pre_t8.js',
    version: '1.0.0',
    input: path.basename(inputPath),
    gates: {},
    mode: null,
    t9_exit: t9Exit === undefined ? null : t9Exit,
    verdict: null,
    notes: []
  };

  const head = fs.readFileSync(inputPath, 'utf8').slice(0, 20000);

  // --- deteccion de modo por el marcador exacto ---
  const hasRedacted = head.split(/\r?\n/).some((l) => l.trim() === MARKER_REDACTED);
  const hasSensitive = head.split(/\r?\n/).some((l) => l.trim() === MARKER_SENSITIVE);
  if (hasRedacted) out.mode = 'redacted';
  else if (hasSensitive) out.mode = 'sensitive-default';
  else out.mode = 'none';

  // --- G1: el marcador debe existir y ser el correcto para el modo declarado ---
  out.gates.G1_marker = {
    pass: out.mode !== 'none',
    actual: { redacted_marker: hasRedacted, sensitive_marker: hasSensitive },
    rule: 'la salida debe declarar su naturaleza con un marcador exacto'
  };

  // --- G2: contenido. Solo se exige cero credenciales en modo redactado ---
  const body = fs.readFileSync(inputPath, 'utf8');
  const pairCount = countCredentialPairs(body);
  if (out.mode === 'redacted') {
    out.gates.G2_content = {
      pass: pairCount === 0,
      actual: { credential_pairs: pairCount },
      rule: 'modo redactado: no puede quedar ningun par usuario/password'
    };
  } else if (out.mode === 'sensitive-default') {
    out.gates.G2_content = {
      pass: true,
      actual: { credential_pairs: pairCount, skipped_by_design: true },
      rule: 'modo reproducible: el par se conserva a proposito; el gate pasa a G3 (ruta)'
    };
  } else {
    out.gates.G2_content = {
      pass: false,
      actual: { credential_pairs: pairCount },
      rule: 'sin marcador no se puede decidir el modo'
    };
  }

  // --- G3: ruta resuelta contra la raiz git (no .gitignore) ---
  const root = gitRoot();
  const abs = path.resolve(inputPath);
  if (out.mode === 'redacted') {
    out.gates.G3_route = {
      pass: true,
      actual: { skipped_by_design: true, inside_repo: root ? isInside(root, abs) : null },
      rule: 'modo redactado: puede vivir dentro del repo, no lleva credenciales'
    };
  } else if (out.mode === 'sensitive-default') {
    const inside = root ? isInside(root, abs) : null;
    out.gates.G3_route = {
      pass: inside === false,
      actual: { inside_repo: inside, git_root: root },
      rule: 'modo reproducible: un archivo con credenciales NO puede vivir dentro del repo'
    };
  } else {
    out.gates.G3_route = { pass: false, actual: null, rule: 'sin marcador no hay modo' };
  }

  // --- G4: exit code de t9, recibido explicitamente ---
  if (t9Exit === undefined) {
    out.gates.G4_exit = { pass: false, actual: null, rule: 'falta --t9-exit=N; no se asume' };
  } else {
    const info = EXIT_MEANING[t9Exit] || { ok: false, meaning: 'codigo desconocido' };
    let pass = info.ok;
    // exit 6 es correcto SOLO si el destino estaba dentro del repo y se rechazo.
    if (t9Exit === 6 && out.gates.G3_route.actual && out.gates.G3_route.actual.inside_repo === true) {
      pass = true;
      out.notes.push('exit 6 con destino dentro del repo: rechazo correcto, el archivo no deberia existir');
    }
    out.gates.G4_exit = { pass, actual: { code: t9Exit, meaning: info.meaning }, rule: 'solo 0 y 2 son aceptables en una corrida normal' };
  }

  const fails = Object.entries(out.gates).filter(([, g]) => !g.pass).map(([k]) => k);
  out.verdict = fails.length === 0 ? 'CHECKPOINT PASS' : 'CHECKPOINT FAIL';
  out.failed_gates = fails;
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const inputIdx = argv.indexOf('--input');
  if (inputIdx === -1 || !argv[inputIdx + 1]) {
    process.stderr.write('uso: node validate_pre_t8.js --input <salida.m3u8> [--t9-exit N] [--json]\n');
    return 2;
  }
  const inputPath = argv[inputIdx + 1];
  if (!fs.existsSync(inputPath)) {
    process.stderr.write(`no existe: ${inputPath}\n`);
    return 2;
  }
  let t9Exit;
  const exitIdx = argv.indexOf('--t9-exit');
  if (exitIdx !== -1 && argv[exitIdx + 1] !== undefined) {
    t9Exit = parseInt(argv[exitIdx + 1], 10);
  }
  const result = validate(inputPath, t9Exit);

  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(`modo=${result.mode}  verdict=${result.verdict}\n`);
    for (const [name, g] of Object.entries(result.gates)) {
      process.stdout.write(`  [${g.pass ? 'PASS' : 'FAIL'}] ${name}  ${JSON.stringify(g.actual)}\n`);
    }
    for (const n of result.notes) process.stdout.write(`  nota: ${n}\n`);
  }
  return result.verdict === 'CHECKPOINT PASS' ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { validate, MARKER_REDACTED, MARKER_SENSITIVE, EXIT_MEANING };
