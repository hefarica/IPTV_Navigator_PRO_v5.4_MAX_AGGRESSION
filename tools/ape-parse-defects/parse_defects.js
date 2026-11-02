#!/usr/bin/env node
/**
 * parse_defects.js — caza de DEFECTOS DE PARSEO sobre una lista M3U real.
 * Solo lectura. Emite JSON por stdout. No modifica el fichero.
 *
 * Qué mide, y por qué cada cosa rompe un parser real:
 *   BOM          — tres bytes iniciales EF BB BF: algunos parsers no ven "#EXTM3U"
 *   CR           — CRLF: parsers que cortan por \n dejan "\r" al final de cada token
 *   lineas_max   — una linea gigante hace que parsers con buffer fijo la trunquen
 *   vacias       — lineas en blanco intercaladas: hay parsers que cortan el bloque
 *   uri_sin_tag  — URL sin #EXTINF previo: el canal se pierde o se atribuye mal
 *   extinf_mal   — #EXTINF sin coma o sin nombre: metadata vacia
 *   uri_dup      — misma URL dos veces: el proveedor cuenta 2 conexiones (509)
 *   uri_no_http  — esquema distinto de http/https
 *   no_ascii     — caracteres no ASCII fuera de lo esperado
 *   lineas_largas — cuantas superan 4096 bytes (umbral tipico de buffer)
 */

const fs = require('fs');
const crypto = require('crypto');

const path = process.argv[2];
if (!path) {
  process.stderr.write('uso: node parse_defects.js <lista.m3u8>\n');
  process.exit(3);
}

const LIMITE_LARGO = 4096;
const stats = {
  archivo: path,
  bytes: 0,
  sha256: null,
  bom: false,
  cr_presente: false,
  lineas: 0,
  vacias: 0,
  max_linea_bytes: 0,
  max_linea_numero: 0,
  lineas_sobre_limite: 0,
  uri_total: 0,
  uri_dup: 0,
  uri_dup_ejemplos: [],
  uri_sin_tag: 0,
  uri_no_http: 0,
  extinf_total: 0,
  extinf_sin_coma: 0,
  extinf_sin_nombre: 0,
  no_ascii_lineas: 0,
  sin_extm3u: true,
};

const hash = crypto.createHash('sha256');
const vistos = new Map();

let resto = '';
let numLinea = 0;
let ultimaFueExtinf = false;

const buf = fs.createReadStream(path, { highWaterMark: 1 << 20 });

buf.on('data', (chunk) => {
  hash.update(chunk);
  stats.bytes += chunk.length;

  if (stats.bytes === chunk.length && chunk.length >= 3) {
    stats.bom = chunk[0] === 0xef && chunk[1] === 0xbb && chunk[2] === 0xbf;
  }
  if (!stats.cr_presente && chunk.includes(0x0d)) stats.cr_presente = true;

  const texto = resto + chunk.toString('utf8');
  const partes = texto.split('\n');
  resto = partes.pop();

  for (const cruda of partes) {
    numLinea++;
    stats.lineas++;

    const len = Buffer.byteLength(cruda, 'utf8');
    if (len > stats.max_linea_bytes) {
      stats.max_linea_bytes = len;
      stats.max_linea_numero = numLinea;
    }
    if (len > LIMITE_LARGO) stats.lineas_sobre_limite++;

    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7F]/.test(cruda)) stats.no_ascii_lineas++;

    const l = cruda.replace(/\r$/, '').trim();
    if (l === '') { stats.vacias++; continue; }

    if (stats.sin_extm3u && l.startsWith('#EXTM3U')) stats.sin_extm3u = false;

    if (l.startsWith('#EXTINF')) {
      stats.extinf_total++;
      const coma = l.indexOf(',');
      if (coma === -1) stats.extinf_sin_coma++;
      else if (l.slice(coma + 1).trim() === '') stats.extinf_sin_nombre++;
      ultimaFueExtinf = true;
      continue;
    }

    if (l.startsWith('#')) continue;

    // linea que no es tag: deberia ser una URI
    stats.uri_total++;
    if (!ultimaFueExtinf) stats.uri_sin_tag++;
    ultimaFueExtinf = false;

    if (!/^https?:\/\//i.test(l)) stats.uri_no_http++;

    const prev = vistos.get(l);
    if (prev === undefined) {
      vistos.set(l, numLinea);
    } else {
      stats.uri_dup++;
      if (stats.uri_dup_ejemplos.length < 3) {
        stats.uri_dup_ejemplos.push({ linea_primera: prev, linea_duplicada: numLinea });
      }
    }
  }
});

buf.on('end', () => {
  if (resto !== '') {
    numLinea++;
    stats.lineas++;
    const l = resto.replace(/\r$/, '').trim();
    if (l === '') stats.vacias++;
  }
  stats.sha256 = hash.digest('hex');

  const fallos = [];
  if (stats.bom) fallos.push('BOM UTF-8 al inicio');
  if (stats.cr_presente) fallos.push('retornos de carro (CRLF)');
  if (stats.sin_extm3u) fallos.push('falta #EXTM3U');
  if (stats.lineas_sobre_limite > 0) fallos.push(`${stats.lineas_sobre_limite} lineas > ${LIMITE_LARGO} B`);
  if (stats.uri_sin_tag > 0) fallos.push(`${stats.uri_sin_tag} URIs sin #EXTINF`);
  if (stats.uri_dup > 0) fallos.push(`${stats.uri_dup} URIs duplicadas`);
  if (stats.uri_no_http > 0) fallos.push(`${stats.uri_no_http} URIs no http(s)`);
  if (stats.extinf_sin_coma > 0) fallos.push(`${stats.extinf_sin_coma} #EXTINF sin coma`);
  if (stats.extinf_sin_nombre > 0) fallos.push(`${stats.extinf_sin_nombre} #EXTINF sin nombre`);
  if (stats.vacias > 0) fallos.push(`${stats.vacias} lineas vacias`);

  stats.fallos = fallos;
  stats.veredicto = fallos.length === 0 ? 'LIMPIO' : 'DEFECTOS';
  process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
  process.exit(0);
});

buf.on('error', (e) => {
  process.stderr.write('ERROR leyendo: ' + e.message + '\n');
  process.exit(4);
});
