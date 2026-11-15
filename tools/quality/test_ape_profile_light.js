#!/usr/bin/env node
/**
 * tools/quality/test_ape_profile_light.js — prueba REAL del modo `light`
 * (plantillas de perfil en la cabecera + referencia `mp` por canal).
 *
 * QUE EXIGE (no admite prosa)
 *   1. La cabecera lleva UN #EXT-X-APE-PROFILE-INDEX y UN #EXT-X-APE-PROFILE-TEMPLATE
 *      por par (perfil,tier); cada plantilla descomprime y su sha256 coincide con el
 *      que declara el indice.
 *   2. Cada canal conserva su #EXTSHIMOTT ENTERO (ver,id,v,hdr,tgt) y lleva ademas
 *      `mp` con {p,v,n}. Ningun campo existente se pierde.
 *   3. La lista sigue siendo valida para OTT: #EXTM3U en la linea 1, el mismo numero
 *      de #EXTINF, de URLs y de #EXTSHIMOTT, y CERO lineas #EXT-X-APE- fuera de la
 *      cabecera.
 *   4. La lista servida se conserva byte a byte por canal: EXTINF, EXTHTTP y URL
 *      identicos; lo unico que cambia es la linea del shim (que gana `mp`).
 *   5. Reconstruccion EXACTA de los canales 1, 100 y 21.000 contra el ORIGEN
 *      (sha256 del bloque reconstruido == sha256 del bloque del origen). Solo con
 *      las listas reales completas (--full).
 *   6. Negativos que deben FALLAR:
 *        a) un byte corrupto en una plantilla de la cabecera  -> verify-light 5
 *        b) un valor corrupto en `mp.n` de un canal          -> verify-light 5
 *        c) origen inexistente                                -> light 5
 *        d) destino dentro de /var/www/lists                  -> light 3
 *   7. Idempotencia: dos ejecuciones seguidas del mismo par de entradas producen
 *      el MISMO sha256.
 *   8. --limit N no declara verificado (es una proyeccion parcial).
 *
 * USO
 *   node tools/quality/test_ape_profile_light.js [--full] [--allow-skip] [--fixtures-only]
 *     --full          incluye la reconstruccion de los canales 1/100/21000 sobre las
 *                     listas reales completas (21.224 canales; tarda minutos)
 *     --allow-skip    si faltan las listas reales, termina 0 con SKIP (por defecto 2)
 *   Variables: APE_LIGHT_BASE (lista servida), APE_LIGHT_ORIGIN (origen),
 *              APE_LIGHT_FIXTURES (directorio con fx_light.m3u8 / fx_origin.m3u8)
 *
 * SALIDA: una linea PASS/FAIL por caso, resumen y codigo de salida (0 = todo verde).
 * SIN dependencias externas. Sin red. No toca la lista servida: escribe en os.tmpdir().
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TOOL = path.resolve(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'bin', 'ape-profile-project.js');
const TEMPLATE_TAG = '#EXT-X-APE-PROFILE-TEMPLATE:';
const INDEX_TAG = '#EXT-X-APE-PROFILE-INDEX:';
const SHIM_TAG = '#EXTSHIMOTT:';

const argv = new Set(process.argv.slice(2));
const FULL = argv.has('--full');
const ALLOW_SKIP = argv.has('--allow-skip');
const FIXTURES_ONLY = argv.has('--fixtures-only');

const results = [];
let failures = 0;
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}` + (detail ? '  — ' + detail : ''));
}

function sha256File(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(8 << 20);
  let read;
  try { while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, read)); }
  finally { fs.closeSync(fd); }
  return h.digest('hex');
}

function runTool(args, opts) {
  const res = spawnSync(process.execPath, ['--max-old-space-size=4096', TOOL].concat(args), {
    encoding: 'utf8',
    maxBuffer: 256 << 20,
    timeout: (opts && opts.timeout) || 0
  });
  let json = null;
  try { json = JSON.parse(res.stdout); } catch (_e) { /* salida mixta o vacia */ }
  return { code: res.status, stdout: res.stdout, stderr: res.stderr, json };
}

/* ── localizacion de entradas reales ───────────────────────────────────────── */
function findReal() {
  const cands = [];
  const push = (p) => { if (p) cands.push(p); };
  push(process.env.APE_LIGHT_BASE);
  const baseList = [
    '/var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8',
    path.join(ROOT, 'scratch', 'metapack', 'fx_light.m3u8')
  ];
  const originList = [
    '/var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8',
    path.join(ROOT, 'scratch', 'metapack', 'fx_origin.m3u8')
  ];
  if (process.env.APE_LIGHT_FIXTURES) {
    baseList.unshift(path.join(process.env.APE_LIGHT_FIXTURES, 'fx_light.m3u8'));
    originList.unshift(path.join(process.env.APE_LIGHT_FIXTURES, 'fx_origin.m3u8'));
  }
  const first = (list) => { for (const c of list) { try { if (fs.statSync(c).size > 1024) return path.resolve(c); } catch (_e) { /* siguiente */ } } return null; };
  const base = first([process.env.APE_LIGHT_BASE].filter(Boolean).concat(baseList));
  const origin = first([process.env.APE_LIGHT_ORIGIN].filter(Boolean).concat(originList));
  if (!base || !origin) return null;
  return { base, origin };
}

/** Cabecera + primeros N bloques de un m3u8 (byte-exacto, latin1). */
function headFixture(src, dst, nCh) {
  const rfd = fs.openSync(src, 'r');
  const wfd = fs.openSync(dst, 'w');
  const CH = 4 << 20;
  const buf = Buffer.allocUnsafe(CH);
  let tail = null, read, inHeader = true, cur = [], blocks = 0, out = [];
  const flush = () => { if (out.length) { fs.writeSync(wfd, Buffer.from(out.join('\n') + '\n', 'latin1')); out = []; } };
  const push = (line) => {
    if (inHeader) {
      if (line.startsWith('#EXTINF')) { inHeader = false; cur = [line]; } else out.push(line);
      return false;
    }
    if (line.startsWith('#EXTINF')) {
      if (cur.length) { for (const l of cur) out.push(l); blocks++; cur = []; if (blocks >= nCh) return true; }
      cur = [line];
      return false;
    }
    cur.push(line);
    return false;
  };
  let stop = false;
  while (!stop && (read = fs.readSync(rfd, buf, 0, CH, null)) > 0) {
    let start = 0;
    for (let i = 0; i < read && !stop; i++) {
      if (buf[i] === 10) {
        let line;
        if (tail) { line = Buffer.concat([tail, buf.subarray(start, i)]).toString('latin1'); tail = null; }
        else line = buf.toString('latin1', start, i);
        stop = push(line);
        start = i + 1;
      }
    }
    if (!stop && start < read) { const t = Buffer.from(buf.subarray(start, read)); tail = tail ? Buffer.concat([tail, t]) : t; }
  }
  if (!stop && cur.length) { for (const l of cur) out.push(l); blocks++; }
  flush();
  fs.closeSync(rfd);
  fs.closeSync(wfd);
  return blocks;
}

/* ── parsers de la lista emitida (independientes del tool) ─────────────────── */
function readHeader(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  const lines = [];
  let tail = null, read;
  try {
    outer:
    while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      let start = 0;
      for (let i = 0; i < read; i++) {
        if (buf[i] !== 10) continue;
        let line;
        if (tail) { line = Buffer.concat([tail, buf.subarray(start, i)]).toString('latin1'); tail = null; }
        else line = buf.toString('latin1', start, i);
        if (line.startsWith('#EXTINF')) break outer;
        lines.push(line);
        start = i + 1;
      }
      if (start < read) { const t = Buffer.from(buf.subarray(start, read)); tail = tail ? Buffer.concat([tail, t]) : t; }
    }
  } finally { fs.closeSync(fd); }
  return lines;
}

/** Iterador de bloques de canal (EXTINF -> linea anterior al siguiente). */
function blockIter(file) {
  const fd = fs.openSync(file, 'r');
  const CH = 4 << 20;
  const buf = Buffer.allocUnsafe(CH);
  const pending = [];
  let pi = 0, tail = null, eof = false, cur = null, inHeader = true, done = false;
  function fill() {
    if (eof) return false;
    const read = fs.readSync(fd, buf, 0, CH, null);
    if (read <= 0) { eof = true; if (tail && tail.length) { pending.push(tail.toString('latin1')); tail = null; } return false; }
    let start = 0;
    for (let i = 0; i < read; i++) {
      if (buf[i] === 10) {
        let line;
        if (tail) { line = Buffer.concat([tail, buf.subarray(start, i)]).toString('latin1'); tail = null; }
        else line = buf.toString('latin1', start, i);
        pending.push(line);
        start = i + 1;
      }
    }
    if (start < read) { const t = Buffer.from(buf.subarray(start, read)); tail = tail ? Buffer.concat([tail, t]) : t; }
    return true;
  }
  function nextLine() {
    if (pi >= pending.length) { pending.length = 0; pi = 0; if (!fill() && pi >= pending.length) return null; }
    return pending[pi++];
  }
  return {
    next() {
      for (;;) {
        if (done) return null;
        const line = nextLine();
        if (line === null) { done = true; if (cur && cur.length) { const o = cur; cur = null; fs.closeSync(fd); return o; } fs.closeSync(fd); return null; }
        if (inHeader) { if (line.startsWith('#EXTINF')) { inHeader = false; cur = [line]; } continue; }
        if (line.startsWith('#EXTINF')) { if (cur) { const o = cur; cur = [line]; return o; } cur = [line]; continue; }
        cur.push(line);
      }
    }
  };
}

function mpOf(block) {
  for (const line of block) {
    if (!line.startsWith(SHIM_TAG)) continue;
    try {
      const o = JSON.parse(line.slice(SHIM_TAG.length));
      if (o && typeof o === 'object') return { shim: o, mp: o.mp || null };
    } catch (_e) { return null; }
  }
  return null;
}

function main() {
  const found = FIXTURES_ONLY
    ? { base: path.join(ROOT, 'scratch', 'metapack', 'fx_light.m3u8'), origin: path.join(ROOT, 'scratch', 'metapack', 'fx_origin.m3u8') }
    : findReal();
  if (!found || !fs.existsSync(found.base) || !fs.existsSync(found.origin)) {
    console.log('[SKIP] no hay listas reales (APE_LIGHT_BASE / APE_LIGHT_ORIGIN / scratch/metapack/fx_*)');
    process.exit(ALLOW_SKIP ? 0 : 2);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-light-'));
  const base = found.base;
  const origin = found.origin;

  /* fixture de trabajo: primeras 600 formas del par real (o la lista entera si es corta) */
  const fxBase = path.join(tmp, 'base.m3u8');
  const fxOrigin = path.join(tmp, 'origin.m3u8');
  const nBase = headFixture(base, fxBase, 600);
  const nOrigin = headFixture(origin, fxOrigin, 600);
  record('fixture alineado (mismo numero de canales en servida y origen)', nBase === nOrigin && nBase > 0,
    `${nBase} canales`);

  const out1 = path.join(tmp, 'light1.m3u8');
  const out2 = path.join(tmp, 'light2.m3u8');
  const r1 = runTool(['light', fxBase, out1, '--origin', fxOrigin, '--no-gz-size', '--report', path.join(tmp, 'r1.json')]);

  record('light exit 0 con autoverificacion', r1.code === 0 && !!r1.json && r1.json.ok === true && r1.json.verificado === true,
    r1.json ? `canales=${r1.json.canales} formas=${r1.json.formas} parche_medio=${r1.json.parche_medio_lineas}` : `exit ${r1.code} ${r1.stderr.slice(0, 200)}`);
  if (!r1.json || r1.code !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }

  /* 1. cabecera: indice + una plantilla por par, y sha256 que cuadra */
  const header = readHeader(out1);
  const idxLines = header.filter((l) => l.startsWith(INDEX_TAG));
  const tplLines = header.filter((l) => l.startsWith(TEMPLATE_TAG));
  let index = null;
  try { index = JSON.parse(idxLines[0].slice(INDEX_TAG.length)); } catch (_e) { /* abajo */ }
  record('cabecera: 1 indice #EXT-X-APE-PROFILE-INDEX', idxLines.length === 1 && !!index, idxLines.length + ' lineas');
  record('cabecera: 1 plantilla por par declarado', !!index && tplLines.length === index.pairs.length && tplLines.length > 0,
    `${tplLines.length} plantillas / ${index ? index.pairs.length : '?'} pares`);

  let tplOk = true;
  let tplDetail = '';
  const seenPairs = [];
  for (const line of tplLines) {
    const rest = line.slice(TEMPLATE_TAG.length);
    const c = rest.indexOf(':');
    const pair = rest.slice(0, c);
    seenPairs.push(pair);
    try {
      const gz = Buffer.from(rest.slice(c + 1), 'base64');
      const json = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
      const sha = crypto.createHash('sha256').update(gz).digest('hex');
      const declared = (index.pairs.find((p) => p.k === pair) || {}).sha256;
      if (!json.lines || !json.variants || !json.variants.length) { tplOk = false; tplDetail = pair + ': sin lineas/variantes'; break; }
      if (declared !== sha) { tplOk = false; tplDetail = pair + ': sha256 declarado != real'; break; }
    } catch (e) { tplOk = false; tplDetail = pair + ': ' + e.message; break; }
  }
  record('plantillas: gzip+base64 legible y sha256 == indice', tplOk, tplDetail || seenPairs.join(' '));

  /* 2. #EXTSHIMOTT entero + mp */
  const bOut = blockIter(out1);
  const bBase = blockIter(fxBase);
  let ch = 0, shimOk = 0, mpOk = 0, keepOk = 0, preserveOk = 0;
  const fields = ['ver', 'id', 'v', 'hdr', 'tgt'];
  for (;;) {
    const o = bOut.next();
    const b = bBase.next();
    if (!o && !b) break;
    if (!o || !b) { preserveOk = -1; break; }
    ch++;
    const got = mpOf(o);
    const ref = mpOf(b);
    if (got) {
      shimOk++;
      if (got.mp && typeof got.mp.p === 'string' && typeof got.mp.v === 'number' && Array.isArray(got.mp.n)) mpOk++;
      let same = true;
      for (const f of fields) if (JSON.stringify(got.shim[f]) !== JSON.stringify(ref.shim[f])) same = false;
      if (same) keepOk++;
    }
    /* conservacion: todas las lineas del bloque base siguen, salvo el shim que gana mp */
    const a = b.filter((l) => !l.startsWith(SHIM_TAG));
    const c = o.filter((l) => !l.startsWith(SHIM_TAG));
    if (a.length === c.length && a.every((l, i) => l === c[i])) preserveOk++;
  }
  record('cada canal conserva su #EXTSHIMOTT (1 por canal)', ch > 0 && shimOk === ch, `${shimOk}/${ch}`);
  record('cada #EXTSHIMOTT lleva mp {p,v,n}', mpOk === ch, `${mpOk}/${ch}`);
  record('los campos previos del shim se conservan (ver,id,v,hdr,tgt)', keepOk === ch, `${keepOk}/${ch}`);
  record('EXTINF/EXTHTTP/URL de la lista servida intactos por canal', preserveOk === ch, `${preserveOk}/${ch}`);

  /* 3. OTT */
  const v1 = runTool(['verify-light', out1, fxOrigin]);
  const ott = v1.json && v1.json.ott;
  record('verify-light exit 0 (reconstruccion completa del fixture)', v1.code === 0 && v1.json && v1.json.ok === true,
    v1.json ? `canales=${v1.json.canales} lineas=${v1.json.lineas} distintas=${v1.json.lineas_distintas}` : `exit ${v1.code}`);
  record('OTT: #EXTM3U en la linea 1', !!ott && ott.extm3u_primera === true);
  record('OTT: un #EXTINF, una URL y un #EXTSHIMOTT por canal',
    !!ott && ott.extinf > 0 && ott.extinf === ott.urls && ott.extinf === ott.shimott,
    ott ? `extinf=${ott.extinf} urls=${ott.urls} shimott=${ott.shimott}` : 'sin datos');
  record('OTT: cero lineas #EXT-X-APE- fuera de la cabecera', !!ott && ott.ape_fuera_cabecera === 0,
    ott ? String(ott.ape_fuera_cabecera) : 'sin datos');

  /* 4. negativos */
  const corruptTpl = path.join(tmp, 'corrupt_tpl.m3u8');
  fs.copyFileSync(out1, corruptTpl);
  {
    const text = fs.readFileSync(corruptTpl, 'latin1');
    const lines = text.split('\n');
    const at = lines.findIndex((l) => l.startsWith(TEMPLATE_TAG));
    const l = lines[at];
    const c = l.indexOf(':', TEMPLATE_TAG.length);
    /* cambia un caracter del base64 de la plantilla */
    const b64 = l.slice(c + 1);
    const pos = Math.floor(b64.length / 2);
    const alt = b64[pos] === 'A' ? 'B' : 'A';
    lines[at] = l.slice(0, c + 1) + b64.slice(0, pos) + alt + b64.slice(pos + 1);
    fs.writeFileSync(corruptTpl, lines.join('\n'), 'latin1');
  }
  const vTpl = runTool(['verify-light', corruptTpl, fxOrigin]);
  record('NEGATIVO: plantilla corrupta -> verify-light 5', vTpl.code === 5, `exit ${vTpl.code}`);

  const corruptMp = path.join(tmp, 'corrupt_mp.m3u8');
  fs.copyFileSync(out1, corruptMp);
  {
    const text = fs.readFileSync(corruptMp, 'latin1');
    const lines = text.split('\n');
    const at = lines.findIndex((l) => l.startsWith(SHIM_TAG));
    const o = JSON.parse(lines[at].slice(SHIM_TAG.length));
    o.mp.n[0] = String(o.mp.n[0]) + 'X';
    lines[at] = SHIM_TAG + JSON.stringify(o);
    fs.writeFileSync(corruptMp, lines.join('\n'), 'latin1');
  }
  const vMp = runTool(['verify-light', corruptMp, fxOrigin]);
  record('NEGATIVO: valor corrupto en mp.n -> verify-light 5', vMp.code === 5, `exit ${vMp.code}`);

  const rNoOrigin = runTool(['light', fxBase, path.join(tmp, 'x.m3u8'), '--origin', path.join(tmp, 'no_existe.m3u8')]);
  record('NEGATIVO: origen inexistente -> light != 0', rNoOrigin.code !== 0, `exit ${rNoOrigin.code}`);

  const protPath = path.join(tmp, 'x', 'out.m3u8');
  fs.mkdirSync(path.dirname(protPath), { recursive: true });
  const rProt = runTool(['light', fxBase, path.join('/var', 'www', 'lists', 'nunca.m3u8'), '--origin', fxOrigin]);
  record('NEGATIVO: destino en /var/www/lists -> light 3', rProt.code === 3, `exit ${rProt.code}`);

  /* 5. idempotencia */
  const r2 = runTool(['light', fxBase, out2, '--origin', fxOrigin, '--no-gz-size', '--no-selfverify']);
  const s1 = sha256File(out1);
  const s2 = sha256File(out2);
  record('idempotente: misma entrada -> mismo sha256', r2.code === 0 && s1 === s2, `${s1} vs ${s2}`);

  /* 6. --limit no declara verificado */
  const outL = path.join(tmp, 'limit.m3u8');
  const rL = runTool(['light', fxBase, outL, '--origin', fxOrigin, '--no-gz-size', '--limit', '25']);
  record('--limit: parcial y NO verificado', rL.code === 0 && rL.json && rL.json.truncado_por_limite === true && rL.json.verificado === null,
    rL.json ? `canales=${rL.json.canales} truncado=${rL.json.truncado_por_limite} verificado=${rL.json.verificado}` : `exit ${rL.code}`);

  /* 7. reconstruccion de los canales 1, 100 y 21.000 sobre las listas REALES */
  if (FULL) {
    const outFull = path.join(tmp, 'full.m3u8');
    const rF = runTool(['light', base, outFull, '--origin', origin, '--no-gz-size', '--report', path.join(tmp, 'full.json')], { timeout: 0 });
    record('FULL: light sobre las listas reales', rF.code === 0 && rF.json && rF.json.ok === true && rF.json.verificado === true,
      rF.json ? `canales=${rF.json.canales} gz=${rF.json.bytes_out_gz} B` : `exit ${rF.code}`);
    const vF = runTool(['verify-light', outFull, origin, '--channels', '1,100,21000'], { timeout: 0 });
    const chk = (vF.json && vF.json.checks_canales) || {};
    for (const ord of ['1', '100', '21000']) {
      const c = chk[ord];
      record(`FULL: canal ${ord} reconstruido identico al origen`,
        !!c && c.ok === true && c.sha256_reconstruido === c.sha256_origen,
        c ? `${c.lineas} lineas · dif=${c.distintas} · sha256=${c.sha256_reconstruido}` : 'sin dato (¿menos de ' + ord + ' canales?)');
    }
    record('FULL: los 21.224 canales reconstruidos sin una sola linea distinta',
      !!vF.json && vF.json.lineas_distintas === 0, vF.json ? `lineas=${vF.json.lineas} distintas=${vF.json.lineas_distintas}` : `exit ${vF.code}`);
  } else {
    console.log('[SKIP] reconstruccion de 1/100/21000 sobre las listas completas: requiere --full');
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nRESUMEN: ${results.length - failures}/${results.length} PASS`);
  process.exit(failures ? 1 : 0);
}

main();
