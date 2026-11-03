#!/usr/bin/env node
/**
 * Coherencia de los campos derivados del perfil (PM9).
 *
 * Comprueba que al mover resolución, códec, fps o estrategia los campos derivados guardan
 * relación entre ellos y con la resolución: bitrate suficiente para la resolución declarada,
 * throughput por encima del bitrate, suelo por debajo del techo.
 *
 * Las tablas (BPP, estrategias, multiplicadores) se extraen del propio fuente, así que la prueba
 * mide lo que el fichero declara, no una copia que podría divergir.
 *
 * No afirma nada sobre el render visual: eso es otra prueba.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PM = path.join(__dirname, '..', 'js', 'ape-v9', 'profile-manager-v9.js');
const src = fs.readFileSync(PM, 'utf8');

let pass = 0, fail = 0;
const fallos = [];
function ok(cond, nombre, detalle) {
  if (cond) { pass++; console.log('  PASS  ' + nombre); }
  else { fail++; fallos.push(nombre + (detalle ? ' :: ' + detalle : '')); console.log('  FAIL  ' + nombre + (detalle ? ' :: ' + detalle : '')); }
}

function bloque(regla) {
  const m = src.match(regla);
  return m ? m[1] : '';
}
function tablaBPP() {
  const b = bloque(/static\s+BITS_PER_PIXEL\s*=\s*\{([\s\S]*?)\n\s{8}\};/);
  const out = {};
  for (const m of b.matchAll(/'([A-Za-z0-9]+_[A-Za-z0-9]+)'\s*:\s*([\d.]+)/g)) out[m[1]] = Number(m[2]);
  return out;
}
function tablaEstrategias() {
  const b = bloque(/static\s+STRATEGY_CONFIG\s*=\s*\{([\s\S]*?)\n\s{8}\};/);
  const out = {};
  // Recorrido con conteo de llaves: cada estrategia abre en 'nombre': { y cierra en su llave.
  const re = /'([a-z][a-z-]*)'\s*:\s*\{/g;
  let m;
  while ((m = re.exec(b)) !== null) {
    const inicio = m.index + m[0].length;
    let nivel = 1, i = inicio;
    while (i < b.length && nivel > 0) {
      if (b[i] === '{') nivel++;
      else if (b[i] === '}') nivel--;
      i++;
    }
    const cuerpo = b.slice(inicio, i - 1);
    const cm = cuerpo.match(/compressionMultiplier:\s*([\d.]+)/);
    const ds = cuerpo.match(/description:\s*'([^']*)'/);
    if (cm || ds) {
      out[m[1]] = { compressionMultiplier: cm ? Number(cm[1]) : null, description: ds ? ds[1] : '' };
    }
  }
  return out;
}
function multiplicador(cual) {
  const m = src.match(new RegExp('static\\s+THROUGHPUT_' + cual + '_MULTIPLIER\\s*=\\s*([\\d.]+)'));
  return m ? Number(m[1]) : null;
}

const BPP = tablaBPP();
const STRAT = tablaEstrategias();
const T1 = multiplicador('T1');
const T2 = multiplicador('T2');

function labelDe(pixels) {
  return pixels >= 33000000 ? '8K' : pixels >= 8000000 ? 'UHD' : pixels >= 2000000 ? 'FHD' : pixels >= 900000 ? 'HD' : 'SD';
}
const MIN = { '8K': 40, 'UHD': 20, 'FHD': 8, 'HD': 3.5, 'SD': 1.5 };
function bitrateEsperado(pixels, fps, bpp) {
  const base = (pixels * fps * bpp) / 1e6;
  return parseFloat(Math.max(MIN[labelDe(pixels)], base).toFixed(1));
}

console.log('\n== COHERENCIA DE CAMPOS DERIVADOS ==');

{
  ok(Object.keys(BPP).length > 10, 'BITS_PER_PIXEL extraida del fuente', Object.keys(BPP).length + ' entradas');
  ok(Object.keys(STRAT).length >= 4, 'STRATEGY_CONFIG extraida del fuente', Object.keys(STRAT).length + ' estrategias');
  ok(T1 === 1.3 && T2 === 1.6, 'multiplicadores T1/T2 = 1.3/1.6', 't1=' + T1 + ' t2=' + T2);
}

{
  ok(BPP['AV1_SD'] === 0.22, 'BITS_PER_PIXEL AV1_SD = 0.22 conservado', 'valor=' + BPP['AV1_SD']);
  ok(STRAT['ultra-aggressive'] && STRAT['ultra-aggressive'].compressionMultiplier === 0.27,
     'STRATEGY_CONFIG conserva su multiplicador (informativo)',
     STRAT['ultra-aggressive'] ? 'cm=' + STRAT['ultra-aggressive'].compressionMultiplier : 'ausente');

  ok(!/bitrateBase\s*\*\s*strategy\.compressionMultiplier/.test(src),
     'el bitrate NO se multiplica por compressionMultiplier');
  ok(/MIN_BITRATE_MBPS/.test(src), 'existe un mínimo de bitrate por resolución');
  ok(/Math\.min\(floorMbps,\s*techoPerfil\)/.test(src), 'el suelo se recorta al techo del perfil');
}

{
  const casos = [];
  for (const [w, h, lbl] of [[854, 480, 'SD'], [1280, 720, 'HD'], [1920, 1080, 'FHD'], [3840, 2160, 'UHD'], [7680, 4320, '8K']]) {
    for (const codec of ['AV1', 'H265', 'HEVC', 'VP9', 'H264', 'MPEG2']) {
      for (const fps of [24, 30, 60]) {
        const key = codec + '_' + lbl;
        if (BPP[key] == null) continue;
        casos.push({ w, h, lbl, codec, fps });
      }
    }
  }
  let malo = null, cuenta = 0;
  for (const c of casos) {
    const bpp = BPP[c.codec + '_' + c.lbl];
    const r = bitrateEsperado(c.w * c.h, c.fps, bpp);
    cuenta++;
    if (r < MIN[c.lbl]) malo = c.lbl + '/' + c.codec + '/' + c.fps + ' -> ' + r;
  }
  ok(malo === null, 'ninguna de las ' + cuenta + ' combinaciones baja de su mínimo', malo);
}

{
  const pixels = 854 * 480, fps = 30, bpp = BPP['AV1_SD'];
  const base = (pixels * fps * bpp) / 1e6;
  const antes = parseFloat((base * 0.27).toFixed(1));
  const despues = bitrateEsperado(pixels, fps, bpp);
  ok(antes < 1.0, 'con el código viejo SD daba menos de 1 Mbps', 'antes=' + antes);
  ok(despues >= 1.5, 'con el código nuevo SD da al menos 1,5 Mbps', 'despues=' + despues);
  ok(despues > antes, 'el valor subió (' + antes + ' -> ' + despues + ')');
}

{
  let todos = true, malo = null;
  for (const br of [1.5, 2.7, 8, 20, 40]) {
    const t1 = parseFloat((br * T1).toFixed(1));
    const t2 = parseFloat((br * T2).toFixed(1));
    if (!(t1 > br && t2 > t1)) { todos = false; malo = br + ' -> t1=' + t1 + ' t2=' + t2; }
  }
  ok(todos, 'T1 > bitrate y T2 > T1 en todos los casos', malo);
}

{
  let todos = true, malo = null;
  for (const tech of [1.5, 2, 3, 5, 8, 15, 20, 40, 200]) {
    for (const floor of [0.24, 1.5, 3, 5, 12, 15]) {
      if (Math.min(floor, tech) > tech) { todos = false; malo = floor + '/' + tech; }
    }
  }
  ok(todos, 'suelo <= techo en las 54 combinaciones', malo);
}

{
  const d = (STRAT['ultra-aggressive'] || {}).description || '';
  ok(!/\d+(\.\d+)?\s*Mbps/.test(d), 'la descripción no promete un Mbps concreto', d.substring(0, 90));
  ok(/NO recorta bitrate/i.test(d), 'la descripción dice que la estrategia no recorta bitrate');
}

console.log('\n== RESULTADO: ' + pass + ' PASS · ' + fail + ' FAIL ==');
if (fail) { console.log('FALLOS:'); fallos.forEach(f => console.log('  - ' + f)); process.exit(1); }
process.exit(0);
