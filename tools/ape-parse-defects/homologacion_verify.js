#!/usr/bin/env node
/**
 * homologacion_verify.js — comprueba que la regla del operador se cumple de verdad.
 *
 * La regla: los campos con el MISMO nombre sobran hasta quedar uno; los que tienen NOMBRE DISTINTO pero
 * miden lo mismo se quedan, y todos dicen EL MISMO valor para que la configuración llegue igual a VLC,
 * Kodi, hls.js, el panel y los knobs.
 *
 * No comprueba valores absolutos —eso ataría el test al LAB de hoy— sino PROPIEDADES:
 *
 *   P1  tras aplicar, ninguna familia conserva dos ocurrencias de la misma clave (duplicados eliminados)
 *   P2  tras aplicar, toda ocurrencia numerica de una familia vale lo mismo que el SSOT del LAB
 *   P3  aplicar es idempotente: segunda pasada elimina 0 y cambia 0
 *   P4  el array de homologos cubre las 15 familias y ninguna entrada queda sin valor
 *   P5  ninguna familia se queda SIN_FUENTE (el LAB trae la ruta declarada)
 *
 * Uso:  node homologacion_verify.js <fields.json>        (el .json del volcado, con .fields o el fields pelado)
 * Contrato: 0 = las cinco propiedades se cumplen · 4 = alguna falla · 3 = entrada ilegible
 */
'use strict';

const fs = require('fs');
const H = require('./homologacion');

const ruta = process.argv[2];
if (!ruta || !fs.existsSync(ruta)) {
  process.stderr.write('ERROR: falta el fichero de fields\n');
  process.exit(3);
}

let bruto;
try { bruto = JSON.parse(fs.readFileSync(ruta, 'utf8')); }
catch (e) { process.stderr.write(`ERROR: JSON ilegible (${e.message})\n`); process.exit(3); }

// Acepta tanto el volcado completo del decoder como un fields pelado.
const fields = bruto.json && bruto.json.fields ? bruto.json.fields
  : (bruto.fields ? bruto.fields : bruto);

let lab;
try { lab = H.cargarLab(); }
catch (e) { process.stderr.write(`ERROR: LAB no disponible (${e.message})\n`); process.exit(3); }

const fallos = [];
const nota = (ok, txt) => { if (!ok) fallos.push(txt); process.stderr.write(`${ok ? '  OK  ' : '  FALLA'}  ${txt}\n`); };

// ── aplicar una vez ─────────────────────────────────────────────────────────────────────────────
const r1 = H.aplicar(fields, lab);
const ssot = H.derivarSSOT(lab);
const planos = H.homologosPlanos();
const norm = (k) => String(k).toLowerCase().replace(/[._-]/g, '');

// ── P5 · el LAB trae la fuente de todas las familias ────────────────────────────────────────────
const sinFuente = Object.keys(ssot).filter((id) => !ssot[id].encontrado);
nota(sinFuente.length === 0, `P5 ninguna familia sin fuente en el LAB (sin fuente: ${sinFuente.length}${sinFuente.length ? ' -> ' + sinFuente.join(', ') : ''})`);

// ── P4 · el array de homologos ──────────────────────────────────────────────────────────────────
const arr = H.arrayHomologos(lab);
const sinValor = arr.filter((a) => a.valor === null || a.valor === undefined);
nota(arr.length === planos.length && sinValor.length === 0,
  `P4 array de homologos completo (${arr.length} entradas, ${sinValor.length} sin valor)`);

// ── P1 · no quedan duplicados de nombre exacto tras aplicar ─────────────────────────────────────
const restsDup = [];
for (const d of H.DUPLICADOS) {
  // contar ocurrencias de la clave en TODO el objeto resultante
  let n = 0;
  const walk = (o) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) { walk(v); continue; }
      if (Array.isArray(v)) continue;
      // headerOverrides guarda politicas POR PERFIL serializadas ("1,0,0,0"): no es un escalar duplicado.
      if (typeof v === 'string' && v.includes(',')) continue;
      if (norm(k) === norm(d.clave)) n++;
    }
  };
  walk(r1.fields);
  if (n > 1) restsDup.push(`${d.clave} x${n}`);
}
nota(restsDup.length === 0, `P1 duplicados de nombre eliminados (quedan: ${restsDup.length}${restsDup.length ? ' -> ' + restsDup.join(', ') : ''})`);

// ── P2 · todos los homólogos dicen el mismo valor que el LAB ────────────────────────────────────
const desalineados = [];
for (const h of planos) {
  const exigido = H.heredar(h, ssot);
  if (exigido === null) continue;
  // buscar la clave en el resultado
  const walk = (o) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) { walk(v); continue; }
      if (Array.isArray(v)) continue;
      if (norm(k) !== norm(h.clave)) continue;
      const num = Number(v);
      if (!isFinite(num)) continue;
      if (Number(num) !== Number(exigido)) desalineados.push(`${k}=${v} (LAB ${exigido})`);
    }
  };
  walk(r1.fields);
}
nota(desalineados.length === 0, `P2 homologos alineados al SSOT del LAB (desalineados: ${desalineados.length}${desalineados.length ? ' -> ' + desalineados.slice(0, 4).join(' | ') : ''})`);

// ── P3 · idempotencia ──────────────────────────────────────────────────────────────────────────
const r2 = H.aplicar(r1.fields, lab);
nota(r2.eliminados.length === 0 && r2.cambios.length === 0,
  `P3 aplicar es idempotente (2a pasada: ${r2.eliminados.length} eliminados, ${r2.cambios.length} cambios)`);

// ── resumen ────────────────────────────────────────────────────────────────────────────────────
process.stderr.write(`\nLAB ${lab.perfil} v${lab.lab_version}\n`);
process.stderr.write(`1a pasada: ${r1.eliminados.length} rutas eliminadas, ${r1.cambios.length} valores homologados\n`);
if (fallos.length) {
  process.stderr.write(`\nFALLAN ${fallos.length} propiedad(es)\n`);
  process.exit(4);
}
process.stderr.write('\nLas cinco propiedades se cumplen.\n');
process.exit(0);
