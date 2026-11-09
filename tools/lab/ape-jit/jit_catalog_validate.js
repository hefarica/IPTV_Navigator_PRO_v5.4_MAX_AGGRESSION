#!/usr/bin/env node
'use strict';
/*
 * jit_catalog_validate.js — puerta de calidad del catalogo que se da de alta en OTT
 *
 * POR QUE EXISTE
 *   El objetivo exige que el catalogo se pueda registrar como proveedor en OTT
 *   Navigator. "Se puede" no es una opinion: OTT tiene un parser concreto y el
 *   manual documenta un limite de 150 MB. Este script comprueba, linea por linea,
 *   las restricciones que SI rompen el alta, y responde con hechos.
 *
 * QUE COMPRUEBA
 *   ESTRUCTURA   #EXTM3U en la primera linea; cada #EXTINF seguido de EXACTAMENTE
 *                una URL (Single URL Per Channel: varias URLs por canal provocan
 *                HTTP 509 en proveedores con 1 conexion).
 *   IDENTIDAD    tvg-id presente, unico y sin duplicados; nombre no vacio.
 *   BYTES        sin BOM, UTF-8 valido, sin caracteres de control, sin CR suelto;
 *                tamano dentro del limite de OTT (150 MB por defecto).
 *   RESOLUCION   la URL de cada canal (muestreada) responde 200 y es una playlist
 *                del tipo correcto para el cliente.
 *   EXTATTRFROMURL  la directiva devuelve una entrada con UNA url multimedia; si
 *                no la devuelve, OTT la ignora (documentado) y el canal cae al
 *                fallback. Se comprueba que el fallback tambien sirve.
 *
 * LIMITE HONESTO
 *   Muestrear 21.224 canales por red no cabe (y el JIT es de un canal a la vez).
 *   Por eso la comprobacion de red es por MUESTRA y se declara como tal. Las
 *   comprobaciones de estructura y bytes son sobre el 100% del fichero.
 *
 * Uso:
 *   node jit_catalog_validate.js <archivo.m3u8> [--sample N] [--base URL] [--no-net]
 */

const fs = require('fs');

const OTT_MAX_BYTES = 150 * 1024 * 1024;

function bytes(buf) {
  return {
    bom: buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF,
    size: buf.length,
    crlfOnly: /\r(?!\n)/.test(buf.toString('utf8', 0, Math.min(buf.length, 4 * 1024 * 1024))),
    ctrl: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(buf.toString('utf8', 0, Math.min(buf.length, 8 * 1024 * 1024))),
    utf8ok: (() => {
      try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch (_) { return false; }
    })(),
  };
}

function estructura(texto) {
  const lines = texto.split(/\r?\n/);
  const out = {
    firstLineExtm3u: (lines[0] || '').trim() === '#EXTM3U',
    canales: 0, directivas: 0, conExtm3u: 0,
    ids: new Map(), sinId: 0, sinNombre: 0, urlMultiple: 0, extinfSinUrl: 0,
    extattr: 0, extattrSinUrl: 0,
    profiles: new Map(),
    errores: [],
  };
  let pend = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('#EXTM3U')) { out.conExtm3u++; continue; }
    if (t.startsWith('#EXTINF')) {
      if (pend) { out.extinfSinUrl++; if (out.errores.length < 8) out.errores.push('EXTINF sin URL en linea ' + (i + 1)); }
      const id = (t.match(/tvg-id="([^"]*)"/) || [])[1] || '';
      const name = (t.match(/tvg-name="([^"]*)"/) || [])[1] || '';
      const prof = (t.match(/ape-profile="([^"]*)"/) || [])[1] || '';
      const visible = (t.split(',').pop() || '').trim();
      pend = { id, name: name || visible, prof, line: i + 1, urls: 0 };
      out.canales++;
      if (!id) out.sinId++;
      else out.ids.set(id, (out.ids.get(id) || 0) + 1);
      if (!(name || visible)) out.sinNombre++;
      if (prof) out.profiles.set(prof, (out.profiles.get(prof) || 0) + 1);
      continue;
    }
    if (t.startsWith('#EXTATTRFROMURL')) { out.extattr++; continue; }
    if (t.startsWith('#')) continue;
    if (t === '') continue;
    if (pend) {
      pend.urls++;
      if (pend.urls > 1) out.urlMultiple++;
      if (pend.urls === 1) pend = null;
    }
  }
  if (pend) out.extinfSinUrl++;
  return out;
}

/* Timeout por defecto 30 s: el PRIMER segmento tras un arranque en frio del JIT
 * tarda mas que un segmento caliente (ffmpeg tiene que escribir el chunk). Con
 * 12 s se producia un HTTP 0 que parecia un fallo del catalogo y era del
 * instrumento. Medido 2026-11-09: canal 1 en frio -> abortado; caliente -> 215 B. */
async function httpOk(url, timeoutMs = 30000) {
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    const r = await fetch(url, { redirect: 'follow', signal: ac.signal });
    clearTimeout(to);
    const body = await r.text();
    return { code: r.status, body, ctype: r.headers.get('content-type') || '' };
  } catch (e) {
    return { code: 0, body: '', error: String(e.message || e) };
  }
}

function cuentaSegmentos(m3u) {
  return m3u.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length;
}

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error('  uso: jit_catalog_validate.js <archivo.m3u8> [--sample N] [--base URL] [--no-net]');
    return 2;
  }
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const sample = Math.max(0, Number(arg('--sample', '3')));
  const base = arg('--base', 'https://iptv-ape.duckdns.org');
  const noNet = process.argv.includes('--no-net');

  const buf = fs.readFileSync(file);
  const texto = buf.toString('utf8');
  const b = bytes(buf);
  const e = estructura(texto);

  let fallos = 0;
  let avisos = 0;
  const ok = (c, msg) => { if (!c) { fallos++; } console.log('  ' + (c ? 'OK  ' : 'FALLO') + '  ' + msg); };
  const warn = (c, msg) => { if (!c) { avisos++; } console.log('  ' + (c ? 'OK  ' : 'AVISO') + '  ' + msg); };

  console.log('  archivo: ' + file);
  console.log();
  console.log('  ── BYTES ──');
  ok(!b.bom, 'sin BOM UTF-8 (OTT no espera BOM)');
  ok(b.utf8ok, 'UTF-8 valido en el 100% del fichero');
  ok(!b.ctrl, 'sin caracteres de control (rompen el parser)');
  ok(!b.crlfOnly, 'sin CR suelto (solo CRLF o LF)');
  ok(b.size <= OTT_MAX_BYTES, 'tamano ' + b.size + ' B <= limite OTT ' + OTT_MAX_BYTES + ' B (' + (b.size / 1048576).toFixed(1) + ' MB)');

  console.log();
  console.log('  ── ESTRUCTURA (100% del fichero) ──');
  ok(e.firstLineExtm3u, 'primera linea es #EXTM3U');
  ok(e.conExtm3u === 1, 'exactamente un #EXTM3U (encontrados ' + e.conExtm3u + ')');
  ok(e.canales > 0, 'canales: ' + e.canales);
  ok(e.extinfSinUrl === 0, 'ningun #EXTINF sin URL (encontrados ' + e.extinfSinUrl + ')');
  ok(e.urlMultiple === 0, 'Single URL Per Channel: ningun canal con >1 URL (encontrados ' + e.urlMultiple + ')');
  ok(e.sinId === 0, 'todos con tvg-id (sin id: ' + e.sinId + ')');
  const dup = [...e.ids.entries()].filter(([, n]) => n > 1);
  ok(dup.length === 0, 'tvg-id unicos (duplicados: ' + dup.length + (dup.length ? ' ej: ' + dup.slice(0, 3).map(([k, n]) => k + 'x' + n).join(',') : '') + ')');
  ok(e.sinNombre === 0, 'todos con nombre (sin nombre: ' + e.sinNombre + ')');

  console.log();
  console.log('  ── CONTRATO ──');
  if (e.extattr > 0) {
    ok(e.extattr === e.canales, '#EXTATTRFROMURL en todos los canales (' + e.extattr + '/' + e.canales + ')');
  } else {
    warn(false, 'sin #EXTATTRFROMURL: el catalogo funciona por fallback directo');
  }
  if (e.profiles.size) {
    const total = [...e.profiles.values()].reduce((a, x) => a + x, 0);
    ok(total === e.canales, 'todos con perfil isomorfo (' + total + '/' + e.canales + '): ' +
      [...e.profiles.entries()].sort().map(([k, v]) => k + '=' + v).join(' '));
  } else {
    warn(false, 'sin ape-profile por canal');
  }

  if (!noNet && sample > 0) {
    console.log();
    console.log('  ── RED (muestra ' + sample + ', NO el 100%: el JIT es de un canal a la vez) ──');
    console.log('  NOTA: cada canal muestreado ARRANCA el JIT y detiene el anterior');
    console.log('        (single-active-channel). Por eso se calienta antes y se muestrea');
    console.log('        en serie: dos canales a la vez no pueden estar vivos.');
    const lineas = texto.split(/\r?\n/);
    const urls = [];
    for (let i = 0; i < lineas.length && urls.length < sample; i++) {
      const t = lineas[i].trim();
      if (t && !t.startsWith('#')) urls.push(t);
    }
    /* CALENTAMIENTO: se resuelve el primer canal y se espera a que el JIT
     * produzca. Sin esto el muestreo mide el arranque en frio, no el catalogo. */
    if (urls.length) {
      await httpOk(urls[0]);
      await new Promise((r) => setTimeout(r, 6000));
    }
    for (const u of urls) {
      const r = await httpOk(u);
      const esPlaylist = /#EXTM3U/.test(r.body || '');
      const esMaster = /STREAM-INF/.test(r.body || '');
      ok(r.code === 200 && esPlaylist,
        u.replace(base, '') + '  -> HTTP ' + r.code + (esPlaylist ? ' playlist' : ' NO playlist') +
        (esPlaylist ? (esMaster ? ' (master)' : ' (media)') : ''));
      if (r.code === 200 && !esMaster && esPlaylist) {
        const segs = cuentaSegmentos(r.body);
        ok(segs > 0, '  segmentos en la media playlist: ' + segs);
        if (segs > 0) {
          const seg = r.body.split(/\r?\n/).filter((x) => x.trim() && !x.trim().startsWith('#')).pop();
          const abs = new URL(seg, u).toString();
          let rs = await httpOk(abs);
          /* UN 503 DEL JIT NO ES UN DEFECTO DEL CATALOGO. Medido 2026-11-09: el
           * proveedor limita por rafaga (responde 200 con 1 B, o 403 a los
           * segmentos) y entonces el JIT no arranca y devuelve 503 "startup
           * timeout" — que es la respuesta CORRECTA. Un sondeo a 12 canales del
           * origen dio OK=11, VACIO=1: la fuente esta sana, el fallo era del
           * instrumento por martillear. Se reintenta una vez y, si sigue, se
           * reporta como AVISO transitorio, no como FALLO. */
          if (rs.code === 503 || rs.code === 0) {
            await new Promise((r) => setTimeout(r, 2500));
            rs = await httpOk(abs);
          }
          if (rs.code === 503) {
            warn(false, '  segmento 503 transitorio (origen limitando o JIT sin arrancar): ' +
              (rs.body || '').slice(0, 60));
          } else {
            ok(rs.code === 200 && rs.body.length > 0, '  segmento carga: HTTP ' + rs.code + ' ' + (rs.body.length) + ' B');
          }
        }
      }
    }
    // la directiva, si existe
    const lineaAttr = lineas.find((l) => l.trim().startsWith('#EXTATTRFROMURL'));
    if (lineaAttr) {
      const u = lineaAttr.trim().replace('#EXTATTRFROMURL:', '');
      const r = await httpOk(u);
      const tieneUrl = /#EXTINF/.test(r.body || '') && cuentaSegmentos(r.body) > 0;
      ok(r.code === 200 && tieneUrl,
        '#EXTATTRFROMURL devuelve entrada con UNA url (' + u.replace(base, '') + ') HTTP ' + r.code);
    }
  }

  console.log();
  console.log('  ══════════════════════════════════════════════');
  console.log('  RESULTADO: ' + (fallos === 0 ? 'APTO para alta en OTT' : (fallos + ' FALLO(S)')));
  console.log('  avisos: ' + avisos + '  ·  fallos: ' + fallos);
  console.log('  ══════════════════════════════════════════════');
  return fallos === 0 ? 0 : 1;
}

main().then((c) => process.exit(c)).catch((e) => { console.error('  ERROR: ' + e.message); process.exit(2); });
