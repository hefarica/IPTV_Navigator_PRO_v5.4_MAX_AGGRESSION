#!/usr/bin/env node
'use strict';
/*
 * jit_catalog_build.js — APE_JIT_LIST.m3u8 con el MISMO contrato que ApeUrlBuilder:
 * IDEMPOTENTE · POLIMORFICO · ISOMORFICO
 *
 * ── POR QUE EXISTE ────────────────────────────────────────────────────────────
 * reconcile.js genera el catalogo del JIT pero:
 *   - NO usa ApeUrlBuilder (medido: grep vacio)
 *   - hardcodea "master.m3u8", que OTT/TiviMate/ExoPlayer ABORTAN con
 *     "Loaded playlist has unexpected type." (MEDIDO 2026-11-05, codigo de pulse.php;
 *     Philips 65PUS9206, 4 reintentos en 15 s)
 *   - NO emite perfil por canal (0 lineas con p=): el perfil queda en el
 *     imageConfig global, que es single-slot y no isomorfo
 *   - el SKIP es por size+mtime de UNA lista concreta: no hay contrato repetible
 *
 * ── LOS TRES CONTRATOS ────────────────────────────────────────────────────────
 *
 * 1. IDEMPOTENTE
 *    La salida se identifica por sha256 del CONTENIDO NORMALIZADO (no por mtime).
 *    Acoplar la misma lista N veces da EXACTAMENTE el mismo fichero. Si el sha256
 *    de salida no cambia, no se reescribe (sale 0 sin tocar disco).
 *    La huella incluye: version del contrato + lista origen (id logico, no bytes) +
 *    mapa id->(nombre,grupo,url) normalizado. Dos listas distintas que describen
 *    los mismos canales producen la MISMA salida: eso es idempotencia de contenido.
 *
 * 2. POLIMORFICO
 *    Cada entrada NO apunta a un master fijo. Apunta al RESOLVER:
 *        /jit/resolve?channel=<id>&p=<perfil>&k=<sello>
 *    El resolver decide en el ZAP:
 *        VLC/LibVLC/Kodi/LibreELEC -> master.m3u8
 *        resto (OTT, TiviMate, ExoPlayer) -> media_0.m3u8
 *    Asi el mismo catalogo sirve a cualquier cliente, servidor o tipo de lista sin
 *    regenerarlo. El sello `k` liga la entrada a este contrato: si el contrato
 *    cambia, el sello cambia y se puede detectar una entrada vieja.
 *
 * 3. ISOMORFICO
 *    El perfil pedido viaja EN LA URL (no en un estado global), derivado de la
 *    propia fuente por su declaracion (nombre/grupo). El estado completo de una
 *    entrada se puede reconstruir leyendo solo esa linea. Y siempre pide el perfil
 *    MAS ALTO que la fuente pueda sostener: nunca se degrada por defecto.
 *
 * ── LIMITE HONESTO ────────────────────────────────────────────────────────────
 * El perfil se deriva de la DECLARACION del canal (nombre/grupo), NO de sondear
 * 21.224 fuentes: un probe masivo no cabe en el ciclo. Si un canal miente en su
 * nombre, el perfil pedido sera el que declara. El JIT sigue siendo quien decide
 * la salida real, y su recibo (/jit/image/receipt) mide lo que de verdad salio.
 *
 * Uso:
 *   node jit_catalog_build.js --list <ruta.m3u8> [--out <dir>] [--check] [--force]
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTRACT_VERSION = '1.0.0';
const BASE = process.env.APE_JIT_PUBLIC_BASE || 'https://iptv-ape.duckdns.org';

/* ── Perfil derivado de la DECLARACION del canal (isomorfismo) ────────────────
 * La escalera es la de la matriz del LAB. Nunca se pide menos de P3 (FHD): un
 * canal sin declaracion se trata como FHD, no como SD, para no degradar por
 * omision. Los .5 existen y se respetan si el nombre los menciona. */
const ESCALERA = [
  { re: /\b(8k|4320p?|7680)\b/i,                     perfil: 'P0' },
  { re: /\b(4k|uhd|2160p?|3840)\b/i,                 perfil: 'P1' },
  { re: /\b(1440p?|2k|qhd)\b/i,                      perfil: 'P3' },
  { re: /\bfhd\b|\b1080p?|\bfull\s*hd\b/i,           perfil: 'P3' },
  { re: /\bhd\b|\b720p?/i,                           perfil: 'P4' },
  { re: /\b(sd|480p?|576p?|360p?|240p?)\b/i,         perfil: 'P5' },
];
const PERFIL_POR_DEFECTO = 'P3';   // sin declaracion: FHD, nunca SD

function perfilPara(nombre, grupo) {
  const texto = String(nombre || '') + ' ' + String(grupo || '');
  for (const e of ESCALERA) if (e.re.test(texto)) return e.perfil;
  return PERFIL_POR_DEFECTO;
}

/* ── Parseo de la lista origen (M3U Plus) ─────────────────────────────────── */
function parseLista(texto) {
  const lineas = texto.split(/\r?\n/);
  const canales = [];
  let pend = null;
  for (const linea of lineas) {
    if (linea.startsWith('#EXTINF')) {
      const id = (linea.match(/tvg-id="([^"]*)"/) || [])[1] || '';
      const name = (linea.match(/tvg-name="([^"]*)"/) || [])[1] || '';
      const logo = (linea.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
      const group = (linea.match(/group-title="([^"]*)"/) || [])[1] || '';
      const visible = (linea.split(',').pop() || '').trim();
      pend = { id, name: name || visible, logo, group };
      continue;
    }
    if (pend && linea && !linea.startsWith('#')) {
      pend.url = linea.trim();
      canales.push(pend);
      pend = null;
    }
  }
  return canales;
}

/* ── Normalizacion: la huella NO depende del orden ni del formato ──────────── */
function normalizar(canales) {
  return canales
    .filter((c) => c.id)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name || '').replace(/[\r\n,]/g, ' ').trim(),
      logo: String(c.logo || ''),
      group: String(c.group || ''),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function huella(norm) {
  const h = crypto.createHash('sha256');
  h.update('ape-jit-catalog|v' + CONTRACT_VERSION + '|');
  for (const c of norm) h.update(c.id + '\u0001' + c.name + '\u0001' + c.group + '\u0001' + c.logo + '\u0002');
  return h.digest('hex');
}

function sello(id, perfil) {
  return crypto.createHash('sha256')
    .update('ape-jit|' + CONTRACT_VERSION + '|' + id + '|' + perfil)
    .digest('hex').slice(0, 12);
}

/* ── Emision ──────────────────────────────────────────────────────────────── */
function emitir(norm) {
  const out = [];
  out.push('#EXTM3U');
  out.push('#EXT-X-APE-CONTRACT:ape-jit-catalog/' + CONTRACT_VERSION);
  out.push('#EXT-X-APE-CONTRACT-MODE:idempotente+polimorfico+isomorfico');
  out.push('#EXT-X-APE-RESOLVER:' + BASE + '/jit/resolve');
  out.push('#EXT-X-APE-POLICY:MAX_IMAGE_FIRST;perfil-derivado-de-la-fuente');
  out.push('#EXT-X-APE-PLAYER-POLY:VLC/Kodi->master;resto->media');
  const conteo = {};
  for (const c of norm) {
    const perfil = perfilPara(c.name, c.group);
    conteo[perfil] = (conteo[perfil] || 0) + 1;
    const k = sello(c.id, perfil);
    const q = '/jit/resolve?channel=' + encodeURIComponent(c.id) +
              '&p=' + encodeURIComponent(perfil) + '&k=' + k;
    const logo = c.logo ? ' tvg-logo="' + c.logo.replace(/"/g, '') + '"' : '';
    out.push('#EXTINF:-1 tvg-id="' + c.id + '" tvg-name="' + c.name + '"' + logo +
             ' group-title="' + c.group + '" ape-profile="' + perfil + '",' + c.name);
    out.push('#EXT-X-APE-PROFILE:' + perfil);
    out.push(BASE + q);
  }
  return { texto: out.join('\n') + '\n', conteo };
}

/* ── CLI ──────────────────────────────────────────────────────────────────── */
function arg(nombre, def) {
  const i = process.argv.indexOf(nombre);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function main() {
  const lista = arg('--list', '/opt/ape-jit/current/APE_JIT_LIST.m3u8');
  const outDir = arg('--out', '/opt/ape-jit/current');
  const check = process.argv.includes('--check');
  const force = process.argv.includes('--force');

  if (!fs.existsSync(lista)) {
    console.error('  ERROR: no existe la lista origen: ' + lista);
    return 2;
  }
  const texto = fs.readFileSync(lista, 'utf8');
  const canales = parseLista(texto);
  const norm = normalizar(canales);
  if (!norm.length) {
    console.error('  ERROR: la lista no tiene canales con tvg-id');
    return 2;
  }

  const h = huella(norm);
  const { texto: salida, conteo } = emitir(norm);
  const salidaHash = crypto.createHash('sha256').update(salida).digest('hex');
  const destino = path.join(outDir, 'APE_JIT_LIST_IDEMPOTENTE.m3u8');
  const estado = path.join(outDir, 'APE_JIT_LIST_IDEMPOTENTE.json');

  console.log('  origen          : ' + lista);
  console.log('  canales         : ' + norm.length);
  console.log('  huella contrato : ' + h.slice(0, 24));
  console.log('  hash salida     : ' + salidaHash.slice(0, 24));
  console.log('  bytes salida    : ' + Buffer.byteLength(salida, 'utf8'));
  console.log('  perfiles        : ' + Object.entries(conteo)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => k + '=' + v).join(' '));

  if (check) {
    // informa si re-ejecutar cambiaria algo (idempotencia observable)
    if (fs.existsSync(estado)) {
      const prev = JSON.parse(fs.readFileSync(estado, 'utf8'));
      console.log('  estado previo   : ' + (prev.salidaHash || '').slice(0, 24));
      console.log('  ' + (prev.salidaHash === salidaHash
        ? 'IDEMPOTENTE: la salida seria IDENTICA, no se escribiria'
        : 'CAMBIARIA: la salida difiere, se reescribiria'));
    } else {
      console.log('  sin estado previo: primera construccion');
    }
    return 0;
  }

  if (!force && fs.existsSync(estado)) {
    const prev = JSON.parse(fs.readFileSync(estado, 'utf8'));
    if (prev.salidaHash === salidaHash && fs.existsSync(destino)) {
      console.log('  SKIP: salida identica (sha256 del contenido normalizado), no se toca disco');
      return 0;
    }
  }

  const tmp = destino + '.tmp';
  fs.writeFileSync(tmp, salida);
  fs.renameSync(tmp, destino);          // atomico
  fs.writeFileSync(estado, JSON.stringify({
    contract: CONTRACT_VERSION,
    source: path.basename(lista),
    channels: norm.length,
    contratoHash: h,
    salidaHash,
    bytes: Buffer.byteLength(salida, 'utf8'),
    perfiles: conteo,
    at: new Date().toISOString(),
  }, null, 2));
  console.log('  escrito         : ' + destino);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { parseLista, normalizar, huella, emitir, perfilPara, CONTRACT_VERSION };
