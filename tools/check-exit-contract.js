#!/usr/bin/env node
/**
 * check-exit-contract.js — impide que vuelva el defecto que costo tres rondas.
 *
 * El patron: una herramienta escribe un veredicto (DEFECTOS / CRITICAL / FAIL) y
 * despues hace `process.exit(0)` sin mirarlo. El informe dice una cosa y el build
 * lee exito. Se encontro tres veces en este repo:
 *
 *   validate_exthttp.js   -> exit(0) incondicional   (corregido)
 *   parse_defects.js      -> exit(0) incondicional   (corregido)
 *   e2e-runner.js         -> exit(0) incondicional   (corregido)
 *
 * Este checker NO pretende ser un analizador estatico: detecta el patron exacto y
 * nada mas. Un `process.exit(0)` se permite si en su misma linea o en las dos
 * anteriores hay una rama condicional (`if`, `else`, `?`) o un `help`. Cualquier
 * otro es un candidato a defecto y el gate falla.
 *
 * Escape explicito: la linea puede llevar el comentario `exit-ok: <razon>` y el
 * checker la respeta. Un escape escrito a mano queda registrado en el codigo; uno
 * implicito, no.
 *
 *   node tools/check-exit-contract.js [dir]
 *   exit 0 = sin candidatos · 1 = hay candidatos · 3 = uso
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = process.argv[2] || path.join(__dirname);

/** Recolecta .js recursivamente, sin entrar en node_modules ni en backups. */
function recolectar(dir, out = []) {
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const e of entradas) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      recolectar(p, out);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

const CONDICIONAL = /\bif\b|\belse\b|\?|help|exit-ok:/i;

/**
 * Quita comentarios conservando los numeros de linea, para no marcar el texto de la
 * propia documentacion. Sin esto el checker se reportaba a si mismo: 2 de sus 4
 * primeros candidatos eran lineas de este comentario de cabecera.
 */
function sinComentarios(src) {
  let out = '';
  let i = 0;
  let estado = 'codigo'; // codigo | linea | bloque | cadena
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (estado === 'codigo') {
      if (c === '/' && d === '/') { estado = 'linea'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { estado = 'bloque'; out += '  '; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { estado = 'cadena'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (estado === 'linea') {
      if (c === '\n') { estado = 'codigo'; out += '\n'; i++; continue; }
      out += ' '; i++; continue;
    }
    if (estado === 'bloque') {
      if (c === '*' && d === '/') { estado = 'codigo'; out += '  '; i += 2; continue; }
      out += c === '\n' ? '\n' : ' '; i++; continue;
    }
    // cadena: se respeta tal cual (una cadena no es codigo ejecutable)
    if (c === '\\') { out += c + (d || ''); i += 2; continue; }
    if (c === '\n') { estado = 'codigo'; out += '\n'; i++; continue; }
    out += c; i++;
  }
  return out;
}

/** Ventana de contexto: la linea y las 5 anteriores. El `help` de un bloque
 *  multilinea queda a 4 lineas, y con 2 se perdia (falso positivo real medido). */
const VENTANA = 5;

const candidatos = [];
let revisadas = 0;

for (const archivo of recolectar(RAIZ)) {
  let src;
  try {
    src = fs.readFileSync(archivo, 'utf8');
  } catch (_) {
    continue;
  }
  revisadas++;
  // Dos vistas del mismo fichero, con los MISMOS numeros de linea:
  //  - codigo: sin comentarios, para no marcar el texto de la documentacion
  //  - original: con comentarios, porque el escape `exit-ok:` vive en un comentario
  //    y sin esta segunda vista el checker se comia su propia salida de emergencia.
  const originales = src.split('\n');
  const lineas = sinComentarios(src).split('\n');
  for (let i = 0; i < lineas.length; i++) {
    if (!/process\.exit\(\s*0\s*\)/.test(lineas[i])) continue;
    const contexto = lineas.slice(Math.max(0, i - VENTANA), i + 1).join('\n');
    if (CONDICIONAL.test(contexto)) continue;
    // El escape se busca en el original (misma linea o las 2 anteriores).
    const escape = originales.slice(Math.max(0, i - 2), i + 1).join('\n');
    if (/exit-ok:/i.test(escape)) continue;
    candidatos.push({
      archivo: path.relative(process.cwd(), archivo),
      linea: i + 1,
      codigo: lineas[i].trim().slice(0, 120)
    });
  }
}

console.log(JSON.stringify({
  raiz: path.relative(process.cwd(), RAIZ) || '.',
  archivos_revisados: revisadas,
  candidatos_total: candidatos.length,
  candidatos,
  contrato: 'process.exit(0) exige rama condicional visible (if/else/?/help) o comentario exit-ok: <razon>'
}, null, 2));

process.exit(candidatos.length === 0 ? 0 : 1);
