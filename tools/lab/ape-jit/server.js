#!/usr/bin/env node
'use strict';
/*
 * APE JIT CMAF — one active channel at a time.
 * Input: /opt/ape-jit/channels.json  { "<id>": { "url": "...", "ua": "..." } }
 * Output: /dev/shm/ape-jit/<id>/{manifest.mpd,master.m3u8,media_*.m3u8,init-*.m4s,chunk-*.m4s}
 * Never accepts a URL from the client; only an id in the allowlist.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');

const PORT = Number(process.env.PORT || 3099);
const BIND = process.env.BIND || '127.0.0.1';
const MAP_FILE = process.env.MAP_FILE || '/opt/ape-jit/channels.json';
const OUT_ROOT = process.env.OUT_ROOT || '/dev/shm/ape-jit';
/* IDLE_MS: cuando no llega ninguna peticion durante este tiempo, se apaga el
 * transcode y la siguiente peticion arranca un trabajo NUEVO.
 *
 * MEDIDO en el sostenido de 30 min (1835 s, consumidor pidiendo cada 2 s):
 *   con IDLE_MS=20000 hubo DOS reinicios del pid y cada uno tiro la ventana de
 *   84 segmentos a 9 y a 28 => ~18 s de reproduccion perdidos por reinicio.
 *
 * 90000 (90 s) cubre el hueco entre peticiones de cualquier reproductor con
 * buffer de 30-120 s sin mantener el proceso vivo indefinidamente. Sigue siendo
 * configurable por entorno: IDLE_MS=30000 lo devuelve al comportamiento anterior. */
const IDLE_MS = Number(process.env.IDLE_MS || 90000);

/* ═══════════════════════════════════════════════════════════════════════════
 * MODULO DE IMAGEN — configuracion en caliente
 *
 * Permite que la UI de IPTV Navigator cambie la receta de imagen del JIT sin
 * desplegar ni reiniciar: POST /image/config escribe el JSON y el plan de
 * encoding se reconstruye en el siguiente start(). Un job ya en marcha NO se
 * toca a medias; se aplica al siguiente arranque (asi no se mezclan recetas
 * dentro de la misma salida).
 *
 * CAPACIDAD MEDIDA en este VPS (3 vCPU AMD EPYC-Rome, 20 s de testsrc2):
 *   2560x1440 hqdn3d+unsharp  ->  46,94 s  = 0,43x tiempo real
 *   3840x2160 hqdn3d+unsharp  ->  80,95 s  = 0,25x tiempo real
 * Con esos numeros, QHD y UHD NO son viables en directo con filtros en CPU.
 * La UI debe mostrarlo antes de dejar elegirlos.
 * ═══════════════════════════════════════════════════════════════════════════ */

const IMAGE_CONFIG_FILE = process.env.IMAGE_CONFIG_FILE || '/opt/ape-jit/image-config.json';

const IMAGE_DEFAULTS = {
  // ── destino ──
  //  source     : conserva dimensiones de la fuente (sin escala si ya cumple)
  //  FHD_1080   : 1920x1080
  //  QHD_1440   : 2560x1440   (llamado "2K" en la ruta REA)
  //  UHD_4K     : 3840x2160
  //  DCI_2K     : 2048x1080   (cine, NO sustituye QHD)
  target: 'source',
  // Perfil del LAB (P0..P5.5). Si se fija, DERIVA el target segun la politica
  // del informe; el target explicito sigue mandando si se envia junto.
  profile: '',
  allow_downscale: false,      // false = nunca reducir por debajo de la fuente

  // ── receta de filtros ──
  //  none | light | balanced | temporal | custom
  recipe: 'none',
  // parametros vivos (solo se usan si recipe='custom' o como ajuste de receta)
  hqdn3d:  { luma_spatial: 0.6, chroma_spatial: 0.45, luma_tmp: 0.9, chroma_tmp: 0.7 },
  unsharp: { luma_msize: 5, luma_amount: 0.20 },
  atadenoise: { s: 5, a: 0.010, b: 0.020 },
  filter_order: 'denoise_then_sharpen',   // denoise_then_sharpen | sharpen_only

  // ── encoder ──
  codec: 'libx265',            // libx265 | libx264 | libsvtav1
  preset: 'ultrafast',
  crf: 20,
  bitrate_mode: 'crf',         // crf | abr
  bitrate: '3000k',
  maxrate: '3300k',
  bufsize: '6000k',
  x265_threads: 3,

  // ── cadencia y sincronia ──
  fps: 'preserve',             // preserve | 25 | 30 | 50 | 60
  fps_mode: 'passthrough',     // passthrough | cfr

  // ── color ──
  color: 'preserve',           // preserve | sdr | pq
  // Si se pide una receta o un destino concreto, el motor DEBE transcodificar:
  // con -c:v copy los filtros no se ejecutan. true = la receta manda sobre la
  // proteccion de color; el color de la fuente se conserva sin relabelar.
  force_transcode: true,
  ten_bit: true,

  // ── audio ──
  audio: 'preserve',           // preserve | aac | drop
  audio_bitrate: '128k',

  // ── empaquetado ──
  seg_duration: 2,
  frag_duration: 2,
  window_size: 30,
  extra_window_size: 10,
  gop_seconds: 2,
  closed_gop: true
};

// Tope duro de seguridad: nunca permitir que una config absurda tumbe el motor.
const IMAGE_LIMITS = {
  crf: [0, 51],
  seg_duration: [1, 10],
  frag_duration: [1, 10],
  window_size: [3, 120],
  extra_window_size: [0, 60],
  gop_seconds: [1, 10],
  x265_threads: [1, 8],
  bitrate: null,
  targets: ['source', 'FHD_1080', 'QHD_1440', 'UHD_4K', 'DCI_2K'],
  recipes: ['none', 'light', 'balanced', 'temporal', 'custom'],
  codecs: ['libx265', 'libx264', 'libsvtav1'],
  presets: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'],
  fps: ['preserve', '25', '30', '50', '60'],
  audio: ['preserve', 'aac', 'drop']
};

/* Los 12 perfiles del LAB, tal como los declara el informe, con el destino de
 * salida que la politica les asigna y la viabilidad REAL medida en este host.
 * El perfil del LAB y el destino de salida se guardan por separado: elegir un
 * perfil NO implica que este host pueda sostener su destino.
 *
 * measured_viable: false significa que la medicion de 20 s da menos de 1,2x
 * tiempo real y el player se quedaria sin segmentos. No se oculta: se declara. */
const LAB_PROFILES = {
  'P0':    { declared: '7680x4320', target: 'UHD_4K',   treatment: 'conservar nativo; QHD/UHD como derivada elegida', measured_viable: false },
  'P0.5':  { declared: '5760x3240', target: 'UHD_4K',   treatment: 'mantener identidad 6K; supone reduccion si la fuente es 8K', measured_viable: false },
  'P1':    { declared: '3840x2160', target: 'UHD_4K',   treatment: 'salida UHD 3840x2160', measured_viable: false },
  'P1.5':  { declared: '5760x3240', target: 'QHD_1440', treatment: '6K separado; QHD como alternativa declarada', measured_viable: false },
  'P2':    { declared: '3840x2160', target: 'UHD_4K',   treatment: 'salida UHD; preservar la cadencia observada', measured_viable: false },
  'P2.5':  { declared: '5760x3240', target: 'QHD_1440', treatment: 'conservar solicitud 6K; registrar alternativa QHD', measured_viable: false },
  'P3':    { declared: '1920x1080', target: 'UHD_4K',   treatment: 'propuesta de mejora a UHD', measured_viable: false, note: 'en este host no cabe: medir FHD en su lugar' },
  'P3.5':  { declared: '5760x3240', target: 'QHD_1440', treatment: 'no declarar P3.5 ejecutado si solo se entrega QHD/UHD', measured_viable: false },
  'P4':    { declared: '1280x720',  target: 'QHD_1440', treatment: 'propuesta a QHD', measured_viable: false, note: 'QHD al limite (1,05x)' },
  'P4.5':  { declared: '5760x3240', target: 'QHD_1440', treatment: 'conservar seleccion 6K y resolver capacidad', measured_viable: false },
  'P5':    { declared: '854x480',   target: 'QHD_1440', treatment: 'propuesta a QHD respetando aspecto y cadencia', measured_viable: false, note: 'QHD al limite (1,05x)' },
  'P5.5':  { declared: '5760x3240', target: 'QHD_1440', treatment: 'conservar seleccion 6K; no sustituir en silencio', measured_viable: false }
};

// Destino que SI cabe en este host, por perfil, cuando el declarado no cabe.
const LAB_PROFILE_FALLBACK = {
  'P0': 'FHD_1080', 'P0.5': 'FHD_1080', 'P1': 'FHD_1080', 'P1.5': 'FHD_1080',
  'P2': 'FHD_1080', 'P2.5': 'FHD_1080', 'P3': 'FHD_1080', 'P3.5': 'FHD_1080',
  'P4': 'FHD_1080', 'P4.5': 'FHD_1080', 'P5': 'FHD_1080', 'P5.5': 'FHD_1080'
};

// Dimensiones por destino. DCI_2K es cine (1,90:1) y NO sustituye a QHD.
/* ═══════════════════════════════════════════════════════════════════════════
 * MATRIZ DE 12 PERFILES — resolucion de ENTRADA -> resolucion de SALIDA
 *
 * Cada perfil declara que resolucion de salida produce, con que modo de escala,
 * flags, SAR, bandas y dither. TODOS los campos son EDITABLES en caliente por
 * HTTP y por SSH: un 720p puede salir como 6K si el perfil lo pide.
 *
 * El motor NO asume que la entrada coincida con la salida. Calcula el escalado
 * real respetando el aspecto (o no, segun scale_mode) y devuelve la cadena de
 * filtros lista para ffmpeg, con sus metricas.
 *
 * NOTA HONESTA: esto es el CALCULO y la CADENA. Que el host pueda sostener 6K en
 * tiempo real es otra cosa y se reporta aparte con la capacidad medida. Un 720p
 * -> 6K es un upscale real de 9x en area: se calcula, se declara como upscale y
 * NO se presenta como detalle recuperado.
 * ═══════════════════════════════════════════════════════════════════════════ */

// formato de salida por perfil, con TODOS los campos editables
const PROFILE_MATRIX = {
  'P0':   { outW: 7680, outH: 4320, scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'error_diffusion', label: '8K UHD' },
  'P0.5': { outW: 5760, outH: 3240, scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'error_diffusion', label: '6K' },
  'P1':   { outW: 3840, outH: 2160, scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'ordered',        label: '4K UHD' },
  'P1.5': { outW: 5760, outH: 3240, scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'error_diffusion', label: '6K desde 4K' },
  'P2':   { outW: 3840, outH: 2160, scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'ordered',        label: '4K' },
  'P2.5': { outW: 5760, outH: 3240, scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'error_diffusion', label: '6K' },
  'P3':   { outW: 1920, outH: 1080, scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'ordered',        label: '1080p' },
  'P3.5': { outW: 5760, outH: 3240, scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'error_diffusion', label: '6K desde 1080p' },
  'P4':   { outW: 1280, outH: 720,  scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'ordered',        label: '720p' },
  'P4.5': { outW: 5760, outH: 3240, scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'error_diffusion', label: '6K desde 720p' },
  'P5':   { outW: 854,  outH: 480,  scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'ordered',        label: '480p' },
  'P5.5': { outW: 5760, outH: 3240, scaleMode: 'fit', flags: 'lanczos+accurate_rnd', sar: '1:1', pad: 'black', dither: 'error_diffusion', label: '6K desde 480p' }
};

// valores permitidos: el motor falla cerrado si llega otra cosa
const MATRIX_ALLOWED = {
  scaleMode: ['fit', 'fill', 'stretch'],
  flags: ['lanczos+accurate_rnd', 'lanczos', 'bicubic', 'bilinear', 'neighbor', 'spline16', 'spline36'],
  pad: ['black', 'none', 'copy'],
  dither: ['none', 'ordered', 'error_diffusion', 'random'],
  sar: ['1:1', 'preserve']
};

const MATRIX_LIMITS = {
  outW: { min: 256, max: 7680 },
  outH: { min: 144, max: 4320 }
};

const MATRIX_FILE = process.env.PROFILE_MATRIX_FILE || '/opt/ape-jit/profile-matrix.json';

function cloneMatrix() {
  const o = {};
  for (const k of Object.keys(PROFILE_MATRIX)) o[k] = Object.assign({}, PROFILE_MATRIX[k]);
  return o;
}

let profileMatrix = cloneMatrix();

function loadProfileMatrix() {
  try {
    if (!fs.existsSync(MATRIX_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(MATRIX_FILE, 'utf8'));
    for (const k of Object.keys(raw)) {
      if (profileMatrix[k]) Object.assign(profileMatrix[k], raw[k]);
    }
  } catch (_) { /* si el fichero esta corrupto se queda el default: fail-open en lectura */ }
}

function saveProfileMatrix() {
  try {
    fs.writeFileSync(MATRIX_FILE, JSON.stringify(profileMatrix, null, 2));
    return true;
  } catch (_) { return false; }
}

/* Aplica un parche a un perfil. Fail-CLOSED: un valor fuera de rango o no
 * permitido se rechaza con el motivo, no se corrige en silencio. */
function patchProfile(id, patch) {
  if (!profileMatrix[id]) return { ok: false, error: 'perfil inexistente: ' + id };
  const cur = profileMatrix[id];
  const next = Object.assign({}, cur);
  const errors = [];

  for (const [k, v] of Object.entries(patch || {})) {
    if (k === 'label') { next.label = String(v).slice(0, 40); continue; }
    if (k === 'outW' || k === 'outH') {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) { errors.push(k + ': no numerico'); continue; }
      const lim = MATRIX_LIMITS[k];
      if (n < lim.min || n > lim.max) { errors.push(k + ' fuera de [' + lim.min + ',' + lim.max + ']: ' + n); continue; }
      // par obligatorio: los codecs 4:2:0 exigen dimensiones pares
      next[k] = (n % 2 === 0) ? n : n + 1;
      continue;
    }
    if (MATRIX_ALLOWED[k]) {
      if (!MATRIX_ALLOWED[k].includes(String(v))) {
        errors.push(k + ' no permitido: ' + v + ' (validos: ' + MATRIX_ALLOWED[k].join(',') + ')');
        continue;
      }
      next[k] = String(v);
      continue;
    }
    errors.push('campo desconocido: ' + k);
  }

  if (errors.length) return { ok: false, errors, unchanged: cur };
  profileMatrix[id] = next;
  const saved = saveProfileMatrix();
  return { ok: true, profile: next, persisted: saved };
}

/* ── MOTOR DE CALCULO ──────────────────────────────────────────────────────
 * Dada una ENTRADA real (WxH, DAR) y un perfil, calcula el plan de escalado:
 * dimensiones escaladas, bandas, cadena de filtros y metricas.
 *
 * Respeta DAR salvo en scale_mode=stretch. En fit mete bandas; en fill recorta.
 * Las dimensiones se fuerzan a par porque 4:2:0 no admite impares.
 */
function gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a || 1; }

// dimension minima 2: los codecs 4:2:0 no admiten impares ni cero
function evenFloor(n) { const v = Math.floor(Number(n) / 2) * 2; return v < 2 ? 2 : v; }

// desplazamiento par que SI puede ser 0 (bandas, offsets de recorte). Usar
// evenFloor aqui metia un pad de 2 px cuando el escalado ya ocupaba el lienzo,
// y el margen derecho salia NEGATIVO. Medido: 720p->6K daba L=2 R=-2.
function evenOffset(n) { const v = Math.round(Number(n) / 2) * 2; return v < 0 ? 0 : v; }

function computePlan(profileId, input) {
  const p = profileMatrix[profileId];
  if (!p) return { ok: false, error: 'perfil inexistente: ' + profileId };

  const inW = Math.max(2, Math.round(Number(input && input.width) || 0));
  const inH = Math.max(2, Math.round(Number(input && input.height) || 0));
  if (!Number.isFinite(inW) || !Number.isFinite(inH) || inW < 16 || inH < 16) {
    return { ok: false, error: 'entrada invalida: se requiere width/height >= 16' };
  }

  const outW = p.outW, outH = p.outH;
  const dar = (input && input.dar) ? Number(input.dar) : (inW / inH);
  if (!Number.isFinite(dar) || dar <= 0) return { ok: false, error: 'DAR invalido' };

  let scaledW, scaledH, padX = 0, padY = 0, cropped = false;

  if (p.scaleMode === 'stretch') {
    // deforma: ocupa todo el lienzo, ignora DAR
    scaledW = outW; scaledH = outH;
  } else {
    const outDar = outW / outH;
    if (p.scaleMode === 'fit') {
      // cabe entero: el lado limitante manda, el otro se rellena con bandas
      if (dar > outDar) { scaledW = outW; scaledH = evenFloor(outW / dar); }
      else { scaledH = outH; scaledW = evenFloor(outH * dar); }
      scaledW = evenFloor(scaledW); scaledH = evenFloor(scaledH);
      // el pad se calcula como offset (puede ser 0) y se emite al doble
      padX = evenOffset(outW - scaledW) / 2;
      padY = evenOffset(outH - scaledH) / 2;
    } else {
      // fill: cubre todo y recorta el sobrante
      if (dar > outDar) { scaledH = outH; scaledW = evenFloor(outH * dar); }
      else { scaledW = outW; scaledH = evenFloor(outW / dar); }
      scaledW = evenFloor(scaledW); scaledH = evenFloor(scaledH);
      cropped = true;
    }
  }

  const cropX = cropped ? evenOffset(scaledW - outW) / 2 : 0;
  const cropY = cropped ? evenOffset(scaledH - outH) / 2 : 0;

  // cadena de filtros REAL: solo se emiten las etapas que hacen falta
  const chain = [];
  chain.push('format=yuv420p10le');
  chain.push('scale=' + scaledW + ':' + scaledH + ':flags=' + p.flags);
  if (p.sar === '1:1') chain.push('setsar=1');
  if (cropped && (cropX > 0 || cropY > 0)) {
    chain.push('crop=' + outW + ':' + outH + ':' + cropX + ':' + cropY);
  }
  if (!cropped && p.pad === 'black' && ((outW - scaledW) > 0 || (outH - scaledH) > 0)) {
    chain.push('pad=' + outW + ':' + outH + ':((ow-iw)/2):((oh-ih)/2):color=black');
  }
  /* DITHER: el filtro `format` de ffmpeg NO tiene opcion dither (solo pix_fmts).
   * Medido: 'format=yuv420p10le:dither=error_diffusion' falla con
   *   Error applying option 'dither' to filter 'format': Option not found
   * El dither real vive en zscale (dither 0..3: none/ordered/random/error_diffusion).
   * zscale puede abortar con 'no path between colorspaces' si la fuente no trae
   * tags, asi que se emite sin forzar transferencia: solo el dither. */
  if (p.dither && p.dither !== 'none') {
    const map = { none: 0, ordered: 1, random: 2, error_diffusion: 3 };
    chain.push('zscale=dither=' + (map[p.dither] != null ? map[p.dither] : 1));
  }
  chain.push('format=yuv420p10le');

  const inPx = inW * inH;
  const outPx = outW * outH;
  const scaledPx = scaledW * scaledH;

  return {
    ok: true,
    profile: profileId,
    label: p.label,
    input: { width: inW, height: inH, dar: Number(dar.toFixed(4)), pixels: inPx },
    output: { width: outW, height: outH, pixels: outPx, aspect: Number((outW / outH).toFixed(4)) },
    scaled: { width: scaledW, height: scaledH, pixels: scaledPx },
    // padX/padY ya son el OFFSET en pixeles (la mitad de la banda). El filtro
    // emite ((ow-iw)/2), asi que left == padX y right == total - padX. Multiplicar
    // por 2 daba L=570 R=0 para una banda de 570 (285+285). Medido y corregido.
    pad: (() => {
      const bandX = Math.max(0, outW - scaledW), bandY = Math.max(0, outH - scaledH);
      const l = Math.min(Math.max(0, padX), bandX), t = Math.min(Math.max(0, padY), bandY);
      return { left: l, right: Math.max(0, bandX - l), top: t, bottom: Math.max(0, bandY - t), totalX: bandX, totalY: bandY };
    })(),
    crop: cropped ? { x: cropX, y: cropY, w: outW, h: outH } : null,
    mode: p.scaleMode,
    flags: p.flags,
    sar: p.sar,
    dither: p.dither,
    filter: chain.join(','),
    metrics: {
      areaRatio: Number((outPx / inPx).toFixed(4)),
      linearRatio: Number((outW / inW).toFixed(4)),
      upscale: outPx > inPx,
      // coste relativo: los pixeles de salida mandan, el escalado suma
      relativeCost: Number(((outPx / (1920 * 1080)) * (outPx > inPx ? 1.35 : 1)).toFixed(3))
    },
    // declaracion honesta: un upscale NO recupera detalle
    honesty: outPx > inPx
      ? 'UPSCALE: ' + inW + 'x' + inH + ' -> ' + outW + 'x' + outH + ' (' + (outPx / inPx).toFixed(1) + 'x en area). Se interpola; NO se recupera detalle que la fuente no tiene.'
      : 'DOWNSCALE/DOWN: ' + inW + 'x' + inH + ' -> ' + outW + 'x' + outH
  };
}

/* ── GENERADOR DE COMBINACIONES ────────────────────────────────────────────
 * Enumera el espacio de calculos: perfiles x entradas x modos x flags x dither
 * x pad. Supera las 10.000 combinaciones distintas.
 */
const COMMON_INPUTS = [
  { name: '480p',  width: 854,  height: 480,  dar: 16 / 9 },
  { name: '480p4:3', width: 640, height: 480, dar: 4 / 3 },
  { name: '576p',  width: 1024, height: 576,  dar: 16 / 9 },
  { name: '576p4:3', width: 720, height: 576, dar: 4 / 3 },
  { name: '720p',  width: 1280, height: 720,  dar: 16 / 9 },
  { name: '1080p', width: 1920, height: 1080, dar: 16 / 9 },
  { name: '1080p2.39', width: 1920, height: 804, dar: 1920 / 804 },
  { name: '1440p', width: 2560, height: 1440, dar: 16 / 9 },
  { name: '4K',    width: 3840, height: 2160, dar: 16 / 9 },
  { name: '8K',    width: 7680, height: 4320, dar: 16 / 9 }
];

function enumeratePlans(opts) {
  const o = opts || {};
  const profiles = o.profiles && o.profiles.length ? o.profiles : Object.keys(profileMatrix);
  const inputs = o.inputs && o.inputs.length
    ? COMMON_INPUTS.filter((i) => o.inputs.includes(i.name))
    : COMMON_INPUTS;
  const modes = o.modes || MATRIX_ALLOWED.scaleMode;
  const flagsList = o.flags || MATRIX_ALLOWED.flags;
  const dithers = o.dither || MATRIX_ALLOWED.dither;
  const max = Math.min(Number(o.limit) || 10000, 10000);
  const offset = Math.max(0, Number(o.offset) || 0);

  const rows = [];
  let total = 0;
  let idx = 0;
  outer:
  for (const pid of profiles) {
    if (!profileMatrix[pid]) continue;
    for (const inp of inputs) {
      for (const mode of modes) {
        for (const fl of flagsList) {
          for (const dt of dithers) {
            total++;
            if (total <= offset) continue;
            if (rows.length >= max) continue outer;
            // se aplica una copia temporal del perfil para calcular sin mutar
            const backup = Object.assign({}, profileMatrix[pid]);
            profileMatrix[pid] = Object.assign({}, backup, { scaleMode: mode, flags: fl, dither: dt });
            const plan = computePlan(pid, inp);
            profileMatrix[pid] = backup;
            if (plan.ok) {
              plan.inputName = inp.name;
              plan.variant = { scaleMode: mode, flags: fl, dither: dt };
              plan.index = total;
              rows.push(plan);
            }
            idx++;
          }
        }
      }
    }
  }
  return {
    ok: true,
    // total del espacio completo, contado hasta donde se pidio
    totalEnumerated: total,
    returned: rows.length,
    offset,
    limit: max,
    // espacio completo teorico
    spaceSize: profiles.length * inputs.length * modes.length * flagsList.length * dithers.length,
    rows
  };
}

loadProfileMatrix();

/* ═══════════════════════════════════════════════════════════════════════════
 * GOBIERNO VPS -> PLAYER
 *
 * El panel de IPTV Navigator configura la matriz; el VPS GENERA la lista que
 * consumen los players (OTT Navigator, VLC, Kodi, TiviMate, la APK). Cada canal
 * de esa lista apunta a /jit/go/{id} con el perfil resuelto, asi que el player
 * reproduce la salida YA PROCESADA. No se le pide al player que filtre.
 *
 * VERDAD MEDIDA que manda sobre el diseno (skill ape-image-pipeline-truth):
 *   - `#EXTVLCOPT:video-filter=` es INERTE por POLITICA de VLC
 *     ("unsafe option ... ignored for security reasons"). No es sintaxis.
 *   - Los filtros de pixel los ejecuta el worker FFmpeg del JIT.
 *   - El VPP del SoC (AI-SR/AI-PQ) es el unico lever de pixeles en el device,
 *     y no se gobierna desde aqui.
 *
 * Por eso la lista NO emite video-filter: emite el perfil dentro de la URL y
 * solo las directivas que cada motor SI lee.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Capacidad por motor: que directiva lee de verdad y que NO se le puede pedir. */
const PLAYER_ENGINES = {
  vlc: {
    label: 'VLC / libVLC',
    reads: ['network-caching', 'http-user-agent', 'http-referrer', 'clock-jitter'],
    ignores: ['video-filter (unsafe option por politica)', 'kodi *', 'adaptive-*']
  },
  kodi: {
    label: 'Kodi (inputstream.adaptive)',
    reads: ['inputstream.adaptive.*', 'network-caching'],
    ignores: ['EXTVLCOPT exclusivas', 'video-filter']
  },
  tivimate: {
    label: 'TiviMate',
    reads: ['EXTHTTP de un solo valor', 'tvg-*', 'group-title'],
    ignores: ['EXTHTTP multi-valor con comas', 'EXTVLCOPT', 'KODIPROP']
  },
  ott: {
    label: 'OTT Navigator',
    reads: ['EXTVLCOPT http-user-agent/http-referrer', 'KODIPROP', 'EXTATTRFROMURL'],
    ignores: ['video-filter (no documentado en su changelog)']
  },
  apk: {
    label: 'APK ape-crystal-agent (Media3)',
    reads: ['la URL y sus cabeceras', 'HLS via HlsMediaSource', 'DASH via DashMediaSource'],
    ignores: ['EXTVLCOPT', 'KODIPROP', 'video-filter en la lista']
  }
};

/* Estado de gobierno: que perfil se aplica a cada canal y con que receta.
 * Se persiste aparte de la config global para poder tener canales con perfiles
 * distintos conviviendo. */
const GOVERNANCE_FILE = process.env.GOVERNANCE_FILE || '/opt/ape-jit/governance.json';

let governance = { defaultProfile: 'P4.5', channels: {} };

// ultimo perfil aplicado por la ruta /go (gobierno desde la lista)
let governorApplied = null;

function loadGovernance() {
  try {
    if (!fs.existsSync(GOVERNANCE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(GOVERNANCE_FILE, 'utf8'));
    if (raw && typeof raw === 'object') governance = Object.assign({}, governance, raw);
  } catch (_) { /* corrupto -> defaults */ }
}

function saveGovernance() {
  try { fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(governance, null, 2)); return true; }
  catch (_) { return false; }
}

loadGovernance();

/* ═══════════════════════════════════════════════════════════════════════════
 * REGLAS DE TRANSFORMACION: ENTRADA -> SALIDA
 *
 * Una regla es una fila de la tabla: "si llega ESTA entrada, entrega ESA salida".
 * Varias reglas pueden compartir la MISMA entrada con salidas distintas:
 *
 *   720p -> 1080p
 *   720p -> 1440p
 *   720p -> 4K
 *   720p -> 6K
 *   720p -> 8K
 *
 * El operador elige. La regla NO se deduce de nada: se declara.
 * La resolucion de entrada puede ser exacta (1280x720) o una ETIQUETA de banda
 * (720p) que casa cualquier fuente dentro del rango.
 * ═══════════════════════════════════════════════════════════════════════════ */

const RULES_FILE = process.env.RULES_FILE || '/opt/ape-jit/transform-rules.json';

/* Parametros por defecto de una regla. Son los mismos campos que ya vivian en la
 * configuracion global del modulo de imagen, pero AHORA por regla: cada fila
 * puede tener su encoder, sus filtros y su empaquetado.
 * Valores por defecto = los medidos como seguros en este host. */
const RULE_DEFAULTS = {
  preset: 'ultrafast',          // x265: el mas rapido; subir cuesta capacidad
  crf: 20,                      // 20 = buena calidad sin inflar bitrate
  audio: 'preserve',            // NO -ac 2 universal: eso degrada 5.1 a estereo
  hqdn3d: { luma_spatial: 0.6, chroma_spatial: 0.45, luma_tmp: 0.9, chroma_tmp: 0.7 },
  unsharp: { luma_amount: 0.2, luma_msize: 5, chroma_amount: 0, chroma_msize: 3 },
  atadenoise: { s: 5, a: 0.010, b: 0.020 },
  seg_duration: 2,
  window_size: 30,
  extra_window_size: 10,
  gop_seconds: 2,
  x265_threads: 1
};

/* Limites duros de cada parametro (los mismos rangos REALES de ffmpeg/x265). */
const RULE_LIMITS = {
  preset: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'],
  crf: { min: 0, max: 51 },
  audio: ['preserve', 'aac', 'drop'],
  'hqdn3d.luma_spatial': { min: 0, max: 20 },
  'hqdn3d.chroma_spatial': { min: 0, max: 20 },
  'hqdn3d.luma_tmp': { min: 0, max: 20 },
  'hqdn3d.chroma_tmp': { min: 0, max: 20 },
  'unsharp.luma_amount': { min: -2, max: 5 },
  // msize IMPAR en [3,23]: 0 rompe la cadena (defecto documentado en la skill)
  'unsharp.luma_msize': { min: 3, max: 23, odd: true },
  'unsharp.chroma_amount': { min: -2, max: 5 },
  'unsharp.chroma_msize': { min: 3, max: 23, odd: true },
  'atadenoise.s': { min: 0, max: 15 },
  'atadenoise.a': { min: 0, max: 1 },
  'atadenoise.b': { min: 0, max: 1 },
  seg_duration: { min: 1, max: 10 },
  window_size: { min: 3, max: 120 },
  extra_window_size: { min: 0, max: 60 },
  gop_seconds: { min: 1, max: 10 },
  x265_threads: { min: 1, max: 32 }
};

/* Valida un parametro plano tipo 'hqdn3d.luma_spatial'. Fail-closed. */
function validateRuleParam(key, value) {
  const lim = RULE_LIMITS[key];
  if (!lim) return 'campo desconocido: ' + key;
  if (Array.isArray(lim)) {
    return lim.includes(String(value)) ? null : (key + ' no permitido: ' + value + ' (validos: ' + lim.join(',') + ')');
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return key + ': no numerico';
  if (n < lim.min || n > lim.max) return key + ' fuera de [' + lim.min + ',' + lim.max + ']: ' + n;
  if (lim.odd && n % 2 === 0) return key + ' debe ser impar (4:2:0 y el filtro lo exigen): ' + n;
  return null;
}

/* Aplica los parametros de una regla a un objeto plano de patch. */
function ruleParams(rule) {
  const o = Object.assign({}, RULE_DEFAULTS);
  for (const k of ['preset', 'crf', 'audio', 'seg_duration', 'window_size', 'extra_window_size', 'gop_seconds', 'x265_threads']) {
    if (rule[k] != null) o[k] = rule[k];
  }
  for (const grp of ['hqdn3d', 'unsharp', 'atadenoise']) {
    if (rule[grp]) o[grp] = Object.assign({}, RULE_DEFAULTS[grp], rule[grp]);
  }
  return o;
}

/* Bandas de entrada conocidas. `minPx`/`maxPx` acotan que fuente casa. */
const INPUT_BANDS = {
  '480p': { w: 854, h: 480, minPx: 200000, maxPx: 600000 },
  '576p': { w: 1024, h: 576, minPx: 350000, maxPx: 800000 },
  '720p': { w: 1280, h: 720, minPx: 800000, maxPx: 1500000 },
  '1080p': { w: 1920, h: 1080, minPx: 1500000, maxPx: 3000000 },
  '1440p': { w: 2560, h: 1440, minPx: 3000000, maxPx: 5000000 },
  '4K': { w: 3840, h: 2160, minPx: 5000000, maxPx: 10000000 },
  '8K': { w: 7680, h: 4320, minPx: 20000000, maxPx: 40000000 }
};

/* Reglas iniciales: 720p con CINCO salidas distintas, mas las bandas base.
 * Es exactamente el caso que el operador pidio. Se pueden editar y borrar. */
const RULES_SEED = [
  // === 720p @60 -> distintas salidas y CADENCIAS ==
  { id: 'r-720-60-4k-30',  input: '720p', inFps: 60, outW: 3840, outH: 2160, outFps: 30, codec: 'hvc1', recipe: 'balanced', dither: 'error_diffusion', mode: 'real', profile: 'P4', label: '720p60 -> 4K30' },
  { id: 'r-720-60-4k-60',  input: '720p', inFps: 60, outW: 3840, outH: 2160, outFps: 60, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', mode: 'real', profile: 'P4', label: '720p60 -> 4K60' },
  { id: 'r-720-60-1080-30', input: '720p', inFps: 60, outW: 1920, outH: 1080, outFps: 30, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', mode: 'real', profile: 'P4', label: '720p60 -> 1080p30' },
  { id: 'r-720-60-6k-30',  input: '720p', inFps: 60, outW: 5760, outH: 3240, outFps: 30, codec: 'hvc1', recipe: 'temporal', dither: 'error_diffusion', mode: 'emulado', profile: 'P4.5', label: '720p60 -> 6K30 EMULADO' },
  // === 720p @30 -> salidas y cadencias, INCLUIDA SUBIDA a 60 ==
  { id: 'r-720-30-1440-60', input: '720p', inFps: 30, outW: 2560, outH: 1440, outFps: 60, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', mode: 'real', profile: 'P4', label: '720p30 -> 2K60' },
  { id: 'r-720-30-4k-30',  input: '720p', inFps: 30, outW: 3840, outH: 2160, outFps: 30, codec: 'hvc1', recipe: 'balanced', dither: 'error_diffusion', mode: 'real', profile: 'P4', label: '720p30 -> 4K30' },
  { id: 'r-720-30-6k-30',  input: '720p', inFps: 30, outW: 5760, outH: 3240, outFps: 30, codec: 'hvc1', recipe: 'temporal', dither: 'error_diffusion', mode: 'emulado', profile: 'P4.5', label: '720p30 -> 6K30 EMULADO' },
  // === 1080p @50/60 ===
  { id: 'r-1080-60-4k-30', input: '1080p', inFps: 60, outW: 3840, outH: 2160, outFps: 30, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', mode: 'real', profile: 'P3', label: '1080p60 -> 4K30' },
  { id: 'r-1080-50-1080-50', input: '1080p', inFps: 50, outW: 1920, outH: 1080, outFps: 50, codec: 'hvc1', recipe: 'none', dither: 'error_diffusion', mode: 'real', profile: 'P3', label: '1080p50 -> 1080p50' },
  { id: 'r-1080-30-4k-60', input: '1080p', inFps: 30, outW: 3840, outH: 2160, outFps: 60, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', mode: 'real', profile: 'P3', label: '1080p30 -> 4K60' },
  { id: 'r-1080-30-6k-30', input: '1080p', inFps: 30, outW: 5760, outH: 3240, outFps: 30, codec: 'hvc1', recipe: 'temporal', dither: 'error_diffusion', mode: 'emulado', profile: 'P3.5', label: '1080p30 -> 6K30 EMULADO' },
  // === 4K: conservar y subir ===
  { id: 'r-4k-60-4k-60', input: '4K', inFps: 60, outW: 3840, outH: 2160, outFps: 60, codec: 'hvc1', recipe: 'none', dither: 'error_diffusion', mode: 'real', profile: 'P1', label: '4K60 -> 4K60' },
  { id: 'r-4k-60-6k-30', input: '4K', inFps: 60, outW: 5760, outH: 3240, outFps: 30, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', mode: 'emulado', profile: 'P1.5', label: '4K60 -> 6K30 EMULADO' },
  { id: 'r-4k-30-8k-30', input: '4K', inFps: 30, outW: 7680, outH: 4320, outFps: 30, codec: 'hvc1', recipe: 'balanced', dither: 'error_diffusion', mode: 'emulado', profile: 'P0.5', label: '4K30 -> 8K30 EMULADO' },
  // === 480p ===
  { id: 'r-480-30-1080-30', input: '480p', inFps: 30, outW: 1920, outH: 1080, outFps: 30, codec: 'hvc1', recipe: 'balanced', dither: 'ordered', mode: 'real', profile: 'P5', label: '480p30 -> 1080p30' },
  { id: 'r-480-30-4k-30', input: '480p', inFps: 30, outW: 3840, outH: 2160, outFps: 30, codec: 'hvc1', recipe: 'temporal', dither: 'ordered', mode: 'real', profile: 'P5', label: '480p30 -> 4K30' }
];

let transformRules = [];

/* Completa una regla con los defaults de encoder/filtros/empaquetado si le
 * faltan. Las semillas solo declaran lo esencial; esto les pone el resto para
 * que la tabla muestre TODOS los campos desde el primer arranque. */
function withRuleDefaults(r) {
  const p = ruleParams(r);
  return Object.assign({
    preset: p.preset, crf: p.crf, audio: p.audio,
    hqdn3d: p.hqdn3d, unsharp: p.unsharp, atadenoise: p.atadenoise,
    seg_duration: p.seg_duration, window_size: p.window_size,
    extra_window_size: p.extra_window_size, gop_seconds: p.gop_seconds,
    x265_threads: p.x265_threads
  }, r);
}

function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      const raw = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
      if (Array.isArray(raw) && raw.length) {
        // las reglas guardadas tambien se completan: una vieja sin params no
        // puede quedar a medias en la tabla
        transformRules = raw.map(withRuleDefaults);
        return;
      }
    }
  } catch (_) { /* corrupto -> seed */ }
  transformRules = RULES_SEED.map((r) => withRuleDefaults(Object.assign({}, r)));
  saveRules();
}

function saveRules() {
  try { fs.writeFileSync(RULES_FILE, JSON.stringify(transformRules, null, 2)); return true; }
  catch (_) { return false; }
}

/* Que reglas aplican a una ENTRADA real. Una fuente 1280x720 casa con la banda
 * '720p'. Una fuente rara (960x540) casa por area con la banda mas cercana y se
 * declara. Devuelve TODAS las salidas disponibles para esa entrada. */
function rulesForInput(w, h, fps) {
  const px = w * h;
  const inRatio = w / h;
  const srcFps = Number(fps) || 0;
  const matches = [];
  for (const r of transformRules) {
    const band = INPUT_BANDS[r.input];
    let hit = null;
    if (band) {
      // exacta si coincide la resolucion, o por area dentro de la banda
      if ((w === band.w && h === band.h) || (px >= band.minPx && px <= band.maxPx)) hit = r.input;
      else if (r.input === String(w) + 'x' + String(h)) hit = r.input;
    } else if (r.input === String(w) + 'x' + String(h)) {
      hit = r.input;   // regla con resolucion exacta literal
    }
    if (!hit) continue;
    /* Cadencia: una regla con inFps=0 casa siempre; con inFps=N exige que la
     * fuente traiga esa cadencia (tolerancia para 29.97 vs 30, 59.94 vs 60). */
    if (r.inFps && srcFps) {
      const tol = Math.max(0.6, r.inFps * 0.02);
      if (Math.abs(srcFps - r.inFps) > tol) continue;
    }
    matches.push({ rule: r, matchedBand: hit });
  }
  return {
    input: { width: w, height: h, pixels: px, aspect: Number(inRatio.toFixed(4)) },
    matches: matches.map((m) => ({
      id: m.rule.id,
      label: m.rule.label,
      matchedBand: m.matchedBand,
      output: { width: m.rule.outW, height: m.rule.outH, pixels: m.rule.outW * m.rule.outH },
      codec: m.rule.codec,
      recipe: m.rule.recipe,
      profile: m.rule.profile,
      inFps: m.rule.inFps || null,
      outFps: m.rule.outFps || null,
      // que hace con la cadencia: subir interpola, bajar decima, igual conserva
      filter: ruleFilterChain(m.rule, srcFps).filter,
      fpsCostNote: ruleFilterChain(m.rule, srcFps).fpsCostNote,
      mode: m.rule.mode || 'real',
      fpsOp: !m.rule.outFps ? 'preserve'
        : (!srcFps ? 'declared'
          : (m.rule.outFps > srcFps ? 'INTERPOLATE (' + srcFps + '->' + m.rule.outFps + ')'
            : (m.rule.outFps < srcFps ? 'DECIMATE (' + srcFps + '->' + m.rule.outFps + ')'
              : 'preserve'))),
      areaRatio: Number(((m.rule.outW * m.rule.outH) / px).toFixed(2))
    }))
  };
}

/* Cadena ffmpeg de una REGLA, con el cambio de cadencia resuelto.
 *
 * Subir fps: `minterpolate` interpola movimiento REAL, no repite fotogramas.
 * Bajar fps: `fps=N` decima. Igual: no se emite nada.
 *
 * HONESTIDAD: minterpolate NO crea informacion que la fuente no tiene; inventa
 * fotogramas intermedios. Y cuesta: medido en la skill ape-image-pipeline-truth,
 * 46,9x tiempo real a 1080p y 23,4x solo el filtro. En un host de 3 vCPU eso no
 * es sostenido. Se declara. */
function ruleFilterChain(rule, inFps) {
  const parts = [];
  const rec = RECIPE_PRESETS[rule.recipe];
  if (rec && rec.chain) parts.push(rec.chain);
  const srcFps = Number(inFps) || Number(rule.inFps) || 0;
  const dstFps = Number(rule.outFps) || 0;
  if (dstFps && srcFps && Math.abs(dstFps - srcFps) > 0.6) {
    if (dstFps > srcFps) {
      // interpolacion de movimiento (no repetition de frames)
      parts.push('minterpolate=fps=' + dstFps + ':mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1');
    } else {
      parts.push('fps=' + dstFps);
    }
  } else if (dstFps && !srcFps) {
    parts.push('fps=' + dstFps);
  }
  parts.push('format=yuv420p10le');
  parts.push('scale=' + rule.outW + ':' + rule.outH + ':flags=lanczos+accurate_rnd');
  parts.push('setsar=1');
  if (rule.dither !== 'none') parts.push('zscale=dither=3');
  parts.push('format=yuv420p10le');
  return {
    filter: parts.join(','),
    fpsOp: !dstFps ? 'preserve'
      : (!srcFps ? 'set'
        : (dstFps > srcFps ? 'INTERPOLATE' : (dstFps < srcFps ? 'DECIMATE' : 'preserve'))),
    interpolated: !!(dstFps && srcFps && dstFps > srcFps),
    fpsCostNote: (dstFps && srcFps && dstFps > srcFps)
      ? 'minterpolate interpola movimiento; NO recupera informacion. Coste alto: no sostenido en este host.'
      : null
  };
}

function upsertRule(patch) {
  const errs = [];
  const id = String(patch.id || '').trim();
  if (!id) errs.push('falta id');
  const input = String(patch.input || '').trim();
  if (!input) errs.push('falta input');
  const outW = Math.round(Number(patch.outW));
  const outH = Math.round(Number(patch.outH));
  const inFps = Number(patch.inFps) || 0;
  const outFps = Number(patch.outFps) || 0;
  if (inFps && (inFps < 1 || inFps > 240)) errs.push('inFps fuera de [1,240]');
  if (outFps && (outFps < 1 || outFps > 240)) errs.push('outFps fuera de [1,240]');
  if (!Number.isFinite(outW) || outW < 256 || outW > 7680) errs.push('outW fuera de [256,7680]');
  if (!Number.isFinite(outH) || outH < 144 || outH > 4320) errs.push('outH fuera de [144,4320]');
  if (patch.codec && !CODEC_CATALOG[patch.codec]) errs.push('codec desconocido: ' + patch.codec);
  if (patch.recipe && !RECIPE_PRESETS[patch.recipe]) errs.push('recipe desconocida: ' + patch.recipe);

  /* ENCODER + FILTROS + EMPAQUETADO: cada regla los lleva. Se validan con los
   * rangos REALES de ffmpeg/x265, no con lo que parezca razonable. */
  const flat = {};
  for (const k of ['preset', 'crf', 'audio', 'seg_duration', 'window_size', 'extra_window_size', 'gop_seconds', 'x265_threads']) {
    if (patch[k] != null && patch[k] !== '') flat[k] = patch[k];
  }
  for (const grp of ['hqdn3d', 'unsharp', 'atadenoise']) {
    if (patch[grp] && typeof patch[grp] === 'object') {
      for (const kk of Object.keys(patch[grp])) {
        if (patch[grp][kk] === '' || patch[grp][kk] == null) continue;
        flat[grp + '.' + kk] = patch[grp][kk];
      }
    }
  }
  for (const [k, v] of Object.entries(flat)) {
    const e = validateRuleParam(k, v);
    if (e) errs.push(e);
  }
  if (errs.length) return { ok: false, errors: errs };

  // se materializan los grupos con sus defaults + lo aportado
  const merged = ruleParams(Object.assign({}, patch, {}));
  for (const [k, v] of Object.entries(flat)) {
    if (k.indexOf('.') > 0) {
      const [g, kk] = k.split('.');
      if (!merged[g]) merged[g] = {};
      merged[g][kk] = Number(v);
    } else if (['crf', 'seg_duration', 'window_size', 'extra_window_size', 'gop_seconds', 'x265_threads'].includes(k)) {
      merged[k] = Number(v);
    } else {
      merged[k] = String(v);
    }
  }

  const mode = String(patch.mode || 'real');
  if (mode !== 'real' && mode !== 'emulado') errs.push('mode debe ser real o emulado: ' + mode);
  const row = {
    id,
    input,
    // REAL = el device lo decodifica de verdad. EMULADO = se declara la
    // resolucion aunque el decoder no la alcance; se marca como emulada.
    mode,
    // encoder
    preset: merged.preset, crf: merged.crf, audio: merged.audio,
    // filtros vivos, por regla
    hqdn3d: merged.hqdn3d, unsharp: merged.unsharp, atadenoise: merged.atadenoise,
    // empaquetado
    seg_duration: merged.seg_duration, window_size: merged.window_size,
    extra_window_size: merged.extra_window_size, gop_seconds: merged.gop_seconds,
    x265_threads: merged.x265_threads,
    inFps: inFps || 0,      // 0 = cualquier cadencia
    outFps: outFps || 0,
    outW: outW % 2 === 0 ? outW : outW + 1,
    outH: outH % 2 === 0 ? outH : outH + 1,
    codec: patch.codec || 'hvc1',
    recipe: patch.recipe || 'balanced',
    profile: patch.profile || 'P3',
    label: patch.label || (input + (inFps ? '@' + inFps : '') + ' -> ' + outW + 'x' + outH + (outFps ? '@' + outFps : ''))
  };
  const i = transformRules.findIndex((r) => r.id === id);
  if (i >= 0) transformRules[i] = row; else transformRules.push(row);
  const persisted = saveRules();
  return { ok: true, rule: row, created: i < 0, persisted };
}

function deleteRule(id) {
  const i = transformRules.findIndex((r) => r.id === String(id));
  if (i < 0) return { ok: false, error: 'regla inexistente: ' + id };
  const removed = transformRules.splice(i, 1)[0];
  return { ok: true, removed, persisted: saveRules() };
}

loadRules();

/* ═══════════════════════════════════════════════════════════════════════════
 * ALINEACION DE NIVELES L1-L7 + LLM SOBRE LOS 577 CAMPOS
 *
 * El operador: "el LLM ajustara cada campo en funcion de lo que habia en el
 * gestor, pero mejorandolo en funcion de lo que se esta guardando en el modulo
 * de imagen y ajuste los mas de 1700 campos".
 *
 * quality_levels L1-L7 MEDIDO (P0):
 *   {label, condition, resolution, bitrate_mbps, hdr, video_filter}
 * Cada nivel es un escalon de la escalera ABR: L1 es el mejor, L7 el failsafe.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Alinea los 7 niveles de calidad con la salida objetivo.
 * L1 = la salida objetivo. L2..L7 bajan por la escalera del repo. */
function alignQualityLevels(gestorProfile, obj) {
  const ql = gestorProfile.quality_levels;
  if (!ql || typeof ql !== 'object') return [];
  const diffs = [];
  const outW = obj.output.width, outH = obj.output.height;
  const isEmu = obj.mode === 'emulado';
  const codecFam = CODEC_CATALOG[obj.fields.codec.value]
    ? CODEC_CATALOG[obj.fields.codec.value].family : 'hevc';

  // bitrate base en Mbps (tabla del repo)
  const px = outW * outH;
  let baseMbps = 2.5;
  const T = [[7680*4320,80],[3840*2160,28],[2560*1440,16],[2048*1080,14],[1920*1080,12],[1280*720,5.5],[854*480,2.5]];
  for (const [pxr, b] of T) { if (px >= pxr) { baseMbps = b; break; } }
  if (px > 3840*2160 && px < 7680*4320) baseMbps = Math.round(28 + (px-3840*2160)/(7680*4320-3840*2160)*(80-28));
  if (codecFam === 'av1') baseMbps = Math.round(baseMbps * 0.75);
  else if (codecFam === 'avc') baseMbps = Math.round(baseMbps * 1.4);
  if (isEmu) baseMbps = Math.round(baseMbps * 1.15);

  // hdr segun codec: sin Main10 no hay HDR honesto
  const hdrFor = (codecFam === 'avc') ? 'sdr' : (isEmu ? 'hdr10plus' : 'hdr10');

  const levels = ['L1','L2','L3','L4','L5','L6','L7'];
  levels.forEach((k, i) => {
    const cur = ql[k];
    if (!cur || typeof cur !== 'object') return;
    const next = Object.assign({}, cur);
    // resolucion: escalera descendente
    next.resolution = cascadeRes(outW, outH, i, levels.length);
    // bitrate: 65% por escalon
    next.bitrate_mbps = Math.max(1, Math.round(baseMbps * Math.pow(0.65, i)));
    // hdr: los niveles bajos no sostienen HDR
    next.hdr = (i >= 4) ? 'sdr' : hdrFor;
    // video_filter: la cadena del objetivo en L1; los niveles bajos sin filtros
    // caros (nlmeans y atadenoise no tienen sentido a 480p)
    next.video_filter = (i === 0) ? obj.chain : (i <= 2 ? obj.chain.replace(/nlmeans=[^,]*,?/,'') : '');
    if (JSON.stringify(cur) !== JSON.stringify(next)) {
      diffs.push({
        path: 'quality_levels.' + k,
        before: cur, after: next, cascade: false,
        reason: 'nivel ' + k + ' alineado: resolucion, bitrate y HDR segun la escalera del objetivo'
      });
    }
  });
  return diffs;
}

/* Contexto del LLM para los 577 campos: que es cada seccion y que reglas duras
 * hay. Sin esto el modelo inventa valores que rompen el player. */
function llmAlignSystemPrompt() {
  return [
    'Eres ingeniero de video e IPTV. Recibes un PERFIL del Gestor APE v9 (6 perfiles, ~577 campos cada uno)',
    'y una PROPUESTA determinista ya calculada. Tu trabajo es MEJORARLA si puedes, campo a campo.',
    'Devuelves SOLO JSON valido, sin markdown.',
    '',
    'SECCIONES del perfil y su significado:',
    '- settings: resolution, codec, fps, bitrate (Mbps), bufferSeconds, buffer (ms), playerBuffer (ms),',
    '  t1/t2 (throughput Mbps), strategy, headersCount, audio_* .',
    '- vlcopt: directivas EXTVLCOPT. OJO: video-filter es INERTE por politica de VLC; se declara, no se promete.',
    '  network-caching/live-caching/clock-jitter en ms.',
    '- kodiprop: inputstream.adaptive.* . max_resolution WxH, max_bitrate en kbps.',
    '- prefetch_config: prefetch_segments, parallel_downloads, buffer_target_seconds, min_bandwidth_mbps.',
    '- quality_levels: L1..L7 con {label, condition, resolution, bitrate_mbps, hdr, video_filter} + primary{codec,profile}.',
    '  L1 es el mejor; L7 el failsafe. La resolucion DEBE bajar de L1 a L7: una escalera plana mata el ABR.',
    '- headers / headerOverrides: 230+ headers. MUCHOS son CSV de 4 niveles = CASCADA de fallback, no listas.',
    '  Hay que preservar la forma: 4 valores separados por coma.',
    '',
    'REGLAS DURAS (violarlas rompe la reproduccion):',
    '1. NO degradar resolucion/codec/HDR/fps/bitrate del objetivo elegido.',
    '2. msize de unsharp IMPAR en [3,23]. 0 rompe la cadena (defecto documentado).',
    '3. gradfun.strength en [0.51,64], radius en [4,32].',
    '4. nlmeans y atadenoise NO se apilan: son alternativas.',
    '5. NUNCA poner -ac 2 universal: degradaria 5.1 a estereo. audio_mode debe seguir passthrough_safe.',
    '6. La escalera de quality_levels debe DESCENDER. Nunca aplanarla.',
    '7. Los CSV que son cascadas deben seguir teniendo el mismo numero de niveles.',
    '8. minimo bitrate para 4K: 28 Mbps. Para 1080p: 12. Para 720p: 5.5. No inventes menos.',
    '',
    'OBJETIVO declarado del operador: 0 lags, 0 buffering, 0 rebuffering, 0 freeze, imagen maxima.',
    'Se audaz pero honesto: si un valor no se sostiene en un VPS de 3 vCPU sin GPU, no lo propongas.'
  ].join('\n');
}

function llmAlignUserPrompt(gestorProfile, base, obj) {
  // se envian solo las secciones con estructura, no los 3.366 campos de golpe
  const resumen = {};
  for (const k of Object.keys(gestorProfile)) {
    const v = gestorProfile[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v);
      resumen[k] = keys.length <= 40 ? v : keys.slice(0, 40).reduce((a, kk) => { a[kk] = v[kk]; return a; }, {});
      if (keys.length > 40) resumen[k].__truncated = keys.length - 40 + ' campos mas';
    } else {
      resumen[k] = v;
    }
  }
  return JSON.stringify({
    objetivo: {
      modo: obj.mode,
      salida: obj.output.width + 'x' + obj.output.height,
      cadena: obj.chain,
      coste: obj.cost,
      campos_del_modulo: obj.fields
    },
    perfil_actual: resumen,
    propuesta_determinista: base.diffs.map((d) => ({ path: d.path, before: d.before, after: d.after })),
    instruccion: [
      'Revisa la propuesta determinista y MEJORALA donde puedas.',
      'Devuelve: {"diffs":[{"path":"seccion.campo","after":<valor>,"reason":"..."}],"razon":"...","riesgo":"..."}',
      'Solo incluye campos que quieras CAMBIAR respecto a lo que ya hay en el perfil.',
      'Puedes incluir campos que la propuesta determinista no toco (headers, quality_levels, prefetch...).',
      'Respeta las reglas duras. Si dudas, no cambies.'
    ]
  });
}

/* Valida y fusiona la propuesta del LLM sobre el perfil del gestor.
 * Cualquier campo con forma invalida se DESCARTA. */
function validateLLMDiffs(diffs, gestorProfile) {
  const applied = [];
  const rejected = [];
  const valid = [];
  for (const d of (diffs || [])) {
    if (!d || typeof d.path !== 'string' || d.after === undefined) { rejected.push('item sin path/after'); continue; }
    const parts = d.path.split('.');
    if (parts.length < 2) { rejected.push(d.path + ': ruta invalida'); continue; }
    const sec = parts[0], key = parts.slice(1).join('.');
    const S = gestorProfile[sec];
    if (!S || typeof S !== 'object') { rejected.push(d.path + ': seccion inexistente'); continue; }

    // el valor debe ser primitivo o el mismo tipo que el actual
    const cur = S[key];
    const next = d.after;
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      // solo se acepta objeto en quality_levels.*
      if (sec !== 'quality_levels') { rejected.push(d.path + ': objeto no permitido'); continue; }
    }
    // reglas duras por nombre de campo
    const bad = llmValueViolation(key, next);
    if (bad) { rejected.push(d.path + ': ' + bad); continue; }
    valid.push({ path: d.path, before: cur == null ? null : cur, after: next,
                 cascade: isCascadeValue(cur), reason: String(d.reason || 'propuesto por el LLM').slice(0, 200) });
    applied.push(d.path);
  }
  return { valid, applied, rejected };
}

/* Comprobaciones duras sobre el valor que propone el LLM. */
function llmValueViolation(key, v) {
  const s = String(v);
  const num = Number(v);
  if (/msize/i.test(key) && Number.isFinite(num)) {
    if (num < 3 || num > 23 || num % 2 === 0) return 'msize debe ser IMPAR en [3,23]: ' + num;
  }
  if (/gradfun.*strength/i.test(key) && Number.isFinite(num)) {
    if (num < 0.51 || num > 64) return 'gradfun.strength fuera de [0.51,64]: ' + num;
  }
  if (/gradfun.*radius/i.test(key) && Number.isFinite(num)) {
    if (num < 4 || num > 32) return 'gradfun.radius fuera de [4,32]: ' + num;
  }
  if (/^bitrate$/i.test(key) && Number.isFinite(num) && num < 1) return 'bitrate < 1 Mbps: ' + num;
  if (/buffersec/i.test(key) && Number.isFinite(num) && (num < 2 || num > 600)) return 'bufferSeconds fuera de [2,600]: ' + num;
  // no degradar audio
  if (/audio_downmix|audio_mode/i.test(key) && /mono|stereo_only/i.test(s)) return 'degradaria el audio: ' + s;
  // no aplanar la escalera de niveles
  if (/quality_levels\.L\d\.resolution/i.test(key) && !/^\d+x\d+$/.test(s)) return 'resolucion invalida: ' + s;
  return null;
}

/* Call al LLM para la alineacion completa. */
async function callLLMAlign(gestorProfile, base, obj) {
  const apiKey = readLLMKey();
  if (!apiKey) return { error: 'sin key del LLM' };
  const endpoint = process.env.LLM_ENDPOINT || 'https://api.deepseek.com/chat/completions';
  const body = {
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: llmAlignSystemPrompt() },
      { role: 'user', content: llmAlignUserPrompt(gestorProfile, base, obj) }
    ],
    temperature: 0.25,
    max_tokens: 4000,
    response_format: { type: 'json_object' }
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LLM_TIMEOUT_MS);
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(body), signal: ctl.signal
    });
    if (!r.ok) { const t = await r.text(); return { error: 'HTTP ' + r.status + ': ' + t.slice(0, 160) }; }
    const j = await r.json();
    const txt = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!txt) return { error: 'respuesta sin contenido' };
    let parsed;
    try { parsed = JSON.parse(txt); }
    catch (_) {
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) return { error: 'el LLM no devolvio JSON' };
      try { parsed = JSON.parse(m[0]); } catch (e2) { return { error: 'JSON invalido: ' + e2.message }; }
    }
    return { proposal: parsed };
  } catch (e) {
    return { error: e.name === 'AbortError' ? ('timeout ' + LLM_TIMEOUT_MS + ' ms') : ('red: ' + e.message) };
  } finally { clearTimeout(timer); }
}



/* ═══════════════════════════════════════════════════════════════════════════
 * ALINEACION EXTENDIDA: los 577 campos del perfil, con CASCADA
 *
 * El operador: "observara cada campo del gestor... en cascada de campos o con
 * valor unico como sea su configuracion, el LLM ajustara cada campo... y ajuste
 * los mas de 1700 campos".
 *
 * ESTRUCTURA MEDIDA del perfil (P0, 577 campos):
 *   settings 18 · vlcopt 27 · kodiprop 6 · headerOverrides 230 ·
 *   prefetch_config 8 · quality_levels 8 · headers 242 · enabledCategories 32
 *
 * CASCADA: 226 de los 242 headers son CSV de 4 niveles ("80,50,30,20"). Esos
 * valores son la cadena de fallback, NO una lista. Se transforma CADA nivel con
 * el mismo criterio, preservando la forma de la cascada.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ¿El valor es una cascada? Solo si el CAMPO esta en el mapa de reglas y su
 * forma es CSV de numeros/resoluciones. Una lista de codecs de audio NO es
 * cascada y no se toca. */
function isCascadeValue(v) {
  const s = String(v);
  if (s.indexOf(',') < 0) return false;
  const parts = s.split(',');
  // heuristica: todos los trozos numericos puros o WxH
  return parts.every((p) => /^\s*-?\d+(\.\d+)?\s*$/.test(p) || /^\s*\d+x\d+\s*$/.test(p));
}

/* Aplica fn a cada nivel de una cascada, o al valor unico.
 *
 * A fn se le pasa el INDICE del nivel. Es imprescindible: si se aplana la
 * cascada a un solo valor, "7680x4320,3840x2160,2560x1440,1920x1080" se
 * convierte en "3840x2160,3840x2160,3840x2160,3840x2160" y DESAPARECE LA
 * ESCALERA ABR: todos los niveles serian iguales y el player no tendria a donde
 * bajar. Medido. La cascada se conserva: nivel 0 = salida objetivo, los
 * siguientes bajan hasta el suelo del perfil. */
function mapValue(v, fn) {
  if (isCascadeValue(v)) {
    const parts = String(v).split(',');
    return parts.map((p, i) => fn(p.trim(), i, parts.length)).join(',');
  }
  return fn(String(v), 0, 1);
}

/* Escalera de resoluciones para una cascada de N niveles. Nivel 0 = objetivo;
 * los siguientes bajan por la escalera del repo hasta el suelo. */
const RES_LADDER = [[7680,4320],[3840,2160],[2560,1440],[2048,1080],[1920,1080],[1280,720],[854,480]];
function cascadeRes(outW, outH, i, n) {
  if (i === 0) return outW + 'x' + outH;
  // desde la salida objetivo hacia abajo en la escalera
  const idx = RES_LADDER.findIndex(([w,h]) => w === outW && h === outH);
  const start = idx >= 0 ? idx : RES_LADDER.findIndex(([w,h]) => w <= outW && h <= outH);
  const j = Math.min(RES_LADDER.length - 1, (start >= 0 ? start : 0) + i);
  return RES_LADDER[j][0] + 'x' + RES_LADDER[j][1];
}
function cascadeBitrate(baseMbps, i, n) {
  if (i === 0) return String(baseMbps);
  // cada nivel baja ~35% (espaciado tipico de escalera ABR)
  return String(Math.max(1, Math.round(baseMbps * Math.pow(0.65, i))));
}
function cascadeFps(baseFps, i, n) {
  if (i === 0) return String(baseFps);
  // los niveles bajos no sostienen alta cadencia
  return String(i >= 2 ? Math.min(baseFps, 30) : baseFps);
}

/* Deriva los valores objetivo de TODAS las secciones del perfil. */
function alignmentTargetsFull(obj, gestorProfile) {
  const outW = obj.output.width, outH = obj.output.height;
  const outRes = outW + 'x' + outH;
  const isEmu = obj.mode === 'emulado';
  const codecId = obj.fields.codec.value;
  const codecFam = CODEC_CATALOG[codecId] ? CODEC_CATALOG[codecId].family : 'hevc';
  const codecLabel = codecFam === 'avc' ? 'H264' : (codecFam === 'av1' ? 'AV1' : 'H265');
  const codecRfc = obj.fields.codec.value === 'hvc1' ? 'hvc1.2.4.L153.B0'
    : (obj.fields.codec.value === 'avc1' ? 'avc1.640028' : 'av01.0.08M.10');
  const fps = obj.filters.minterpolate.enabled ? obj.filters.minterpolate.outFps : (obj.input.fps || 30);

  // bitrate por la tabla del repo
  const px = outW * outH;
  let mbps = 2.5;
  const T = [[7680*4320,80],[3840*2160,28],[2560*1440,16],[2048*1080,14],[1920*1080,12],[1280*720,5.5],[854*480,2.5]];
  for (const [pxr, b] of T) { if (px >= pxr) { mbps = b; break; } }
  if (px > 3840*2160 && px < 7680*4320) mbps = Math.round(28 + (px - 3840*2160)/(7680*4320-3840*2160)*(80-28));
  if (codecFam === 'av1') mbps = Math.round(mbps * 0.75);
  else if (codecFam === 'avc') mbps = Math.round(mbps * 1.4);
  if (isEmu) mbps = Math.round(mbps * 1.15);
  mbps = Math.max(1, mbps);

  /* LEY ANTI-DEGRADACION: el bitrate del perfil es un SUELO.
   * Si el perfil ya declara MAS Mbps que la tabla (p. ej. P1 con 40 para 4K
   * cuando la tabla dice 28), NO se baja: se respeta el del operador. Solo se
   * sube si esta por debajo de la tabla. */
  const declaredMbps = Number((gestorProfile && gestorProfile.settings && gestorProfile.settings.bitrate) || 0);
  if (declaredMbps > mbps) mbps = declaredMbps;

  /* GATE DE SUFICIENCIA: min_bandwidth debe ser 3x el bitrate para que el
   * headroom alcance el estado EXCEPCIONAL (sufficiency-law-v1.js).
   * Es un SUELO: nunca se reduce un min_bandwidth mas alto que ya exista. */
  const declaredMinBw = Number((gestorProfile && gestorProfile.prefetch_config &&
    gestorProfile.prefetch_config.min_bandwidth_mbps) || 0);
  const minBwFor3x = Math.ceil(mbps * 3);
  const minBwTarget = Math.max(declaredMinBw, minBwFor3x);

  const bufferSec = Math.min(60, Math.max(8, Math.round(8 + obj.cost.relative * 3 + (isEmu ? 4 : 0))));
  const netCache = bufferSec * 1000;
  const jitter = Math.round(netCache * 0.1);
  const playerBuf = bufferSec * 1000;
  const strategy = isEmu ? 'ultra-aggressive' : 'balanced';
  const prefetchSeg = isEmu ? 30 : 20;
  const parallel = isEmu ? 12 : 8;

  return {
    settings: {
      resolution: outRes, codec: codecLabel, fps: String(fps),
      bitrate: String(mbps), bufferSeconds: String(bufferSec),
      buffer: String(netCache), playerBuffer: String(playerBuf),
      // t1/t2: throughput que la cadena necesita. Se derivan del bitrate.
      // t1 = 3x (gate de suficiencia), t2 = 4x. Suelo: no bajan lo ya declarado.
      t1: String(Math.max(Number((gestorProfile.settings||{}).t1)||0, Math.ceil(mbps * 3))),
      t2: String(Math.max(Number((gestorProfile.settings||{}).t2)||0, Math.ceil(mbps * 4))),
      strategy: strategy, headersCount: '200',
      focus: isEmu ? 'MAXIMA_CALIDAD_EMULADA_UPSCALE_SINTETICO' : 'MAXIMA_CALIDAD_REAL_SOSTENIDA',
      // AUDIO: la doctrina prohibe degradar 5.1 a estereo
      audio_mode: 'passthrough_safe', audio_passthrough: 'auto',
      audio_fallback: 'aac_lc_2ch', audio_downmix: 'enabled',
      audio_codec_priority: 'eac3,ac3,aac,mp3', audio_validate: 'ffprobe'
    },
    vlcopt: {
      'network-caching': String(netCache),
      'live-caching': String(netCache),
      'file-caching': String(netCache + 20000),
      'clock-jitter': String(jitter),
      'clock-synchro': '1',
      'http-reconnect': 'true', 'http-continuous-stream': 'true',
      'http-max-retries': isEmu ? '99' : '50',
      'video-fps': String(fps),
      'video-width': String(outW), 'video-height': String(outH),
      'adaptive-maxwidth': String(outW), 'adaptive-maxheight': String(outH),
      'adaptive-maxbitrate': String(mbps * 1e6),
      'adaptive-initial-bandwidth': String(mbps * 1e6),
      // la cadena del motor. OJO: video-filter en playlist es inerte (politica VLC)
      'video-filter': obj.chain,
      contrast: '1.03', brightness: '1.0', saturation: '1.06', gamma: '1.0',
      'sharpen-sigma': isEmu ? '0.06' : '0.04',
      'tone-mapping': 'auto', 'hdr-output-mode': 'auto'
    },
    kodiprop: {
      'inputstream.adaptive.max_resolution': outRes,
      'inputstream.adaptive.max_bitrate': String(mbps * 1000),
      'inputstream.adaptive.preferred_video_frame_rate': String(fps),
      'inputstream.adaptive.min_bandwidth': String(Math.round(mbps * 0.5 * 1e6)),
      'inputstream.adaptive.manifest_type': 'hls',
      'inputstream.adaptive.stream_selection_type': 'adaptive'
    },
    prefetch_config: {
      strategy: isEmu ? 'ULTRA_AGRESIVO' : 'BALANCEADO',
      prefetch_segments: String(prefetchSeg),
      parallel_downloads: String(parallel),
      buffer_target_seconds: String(Math.min(600, bufferSec * 3)),
      // gate 3x: es lo que hace posible el estado EXCEPCIONAL del Streaming Health
      min_bandwidth_mbps: String(minBwTarget),
      adaptive_enabled: 'True',
      ai_prediction_enabled: 'True',
      continuous_prefetch: 'True'
    },
    quality_levels: {
      primary: { codec: codecLabel, profile: codecFam === 'hevc' ? 'MAIN-10,MAIN,HIGH,BASELINE' : 'HIGH,MAIN,BASELINE' }
    },
    /* HEADERS: mapa de patron -> valor objetivo. Cada valor se aplica a cada
     * nivel de la cascada. Los campos fuera del mapa se HEREDAN. */
    headers: {
      'X-APE-RESOLUTION': outRes,
      'X-Screen-Resolution': outRes,
      'X-Max-Resolution': outRes,
      'X-Stream-Resolution': outRes,
      'X-APE-BITRATE': String(mbps),
      'X-APE-TARGET-BITRATE': String(mbps * 1e6),
      'X-Max-Bitrate': String(mbps * 1e6),
      'X-Stream-Bitrate': String(mbps * 1e6),
      'X-Min-Bitrate': String(Math.round(mbps * 0.5 * 1e6)),
      'X-APE-BITRATE-FLOOR': String(Math.round(mbps * 0.15)),
      'X-APE-FPS': String(fps),
      'X-Stream-FPS': String(fps),
      'X-Max-Framerate': String(fps),
      'X-Video-Codecs': codecLabel,
      'X-APE-CODEC': codecFam === 'hevc' ? 'hvc1' : (codecFam === 'avc' ? 'avc1' : 'av01'),
      'X-Codec-Full': codecRfc,
      'X-Stream-Codecs': codecRfc,
      'X-HEVC-Level': codecFam === 'hevc' ? (outH >= 2160 ? '5.1' : (outH >= 1080 ? '4.1' : '3.1')) : '',
      'X-HEVC-Profile': codecFam === 'hevc' ? 'MAIN-10' : 'HIGH',
      'X-Video-Profile': codecFam === 'hevc' ? 'MAIN-10' : 'HIGH',
      'X-Color-Depth': codecFam === 'avc' ? '8bit' : '10bit',
      'X-Pixel-Format': codecFam === 'avc' ? 'yuv420p' : 'yuv420p10le',
      'X-Network-Caching': String(netCache),
      'X-Live-Caching': String(netCache),
      'X-File-Caching': String(netCache + 20000),
      'X-Buffer-Target': String(playerBuf),
      'X-Buffer-Max': String(playerBuf * 2),
      'X-Buffer-Min': String(Math.round(playerBuf * 0.6)),
      'X-Buffer-Size': String(playerBuf),
      'X-Min-Buffer-Time': String(bufferSec),
      'X-Max-Buffer-Time': String(bufferSec * 2),
      'X-ExoPlayer-Buffer-Min': String(playerBuf),
      'X-Manifest-Refresh': String(netCache),
      'X-Segment-Duration': '2',
      'X-Segment-Duration-S': '2',
      'X-APE-Prefetch-Segments': String(prefetchSeg),
      'X-Prefetch-Segments': String(prefetchSeg),
      'X-Parallel-Segments': String(parallel),
      'X-Concurrent-Downloads': String(parallel),
      'X-APE-STRATEGY': strategy,
      'X-Buffer-Strategy': isEmu ? 'adaptive-predictive' : 'adaptive',
      'X-Quality-Preference': codecFam === 'hevc' ? 'codec-hevc,profile-main-10,tier-main'
        : (codecFam === 'av1' ? 'codec-av1,profile-main-10,tier-main' : 'codec-h264,profile-high,tier-main'),
      // AI / sintesis: solo declarar lo que el modo sostiene
      'X-APE-AI-SR-ENABLED': isEmu ? 'TRUE' : 'FALSE',
      'X-APE-AI-FRAME-INTERPOLATION': isEmu ? 'OPTICAL_FLOW_SVFI' : 'DISABLED',
      'X-APE-AI-DENOISING': isEmu ? 'NLMEANS_HQDN3D_TEMPORAL' : 'HQDN3D',
      'X-APE-AI-SHARPENING': isEmu ? 'UNSHARP_MASK_ADAPTIVE' : 'UNSHARP_MASK',
      'X-APE-AI-COLOR-ENHANCEMENT': isEmu ? 'TRUE' : 'AUTO',
      'X-APE-AI-HDR-UPCONVERT': isEmu ? 'AUTO' : 'DISABLED',
      'X-APE-AI-ARTIFACT-REMOVAL': isEmu ? 'TRUE' : 'ADAPTIVE',
      'X-APE-HDR-UPCONVERT': isEmu ? 'AUTO' : 'DISABLED',
      // LCEVC / GPU: se declaran por modo
      'X-APE-LCEVC-ENABLED': isEmu ? 'TRUE' : 'ADAPTIVE',
      'X-APE-GPU-DECODE': isEmu ? 'TRUE' : 'AUTO',
      'X-APE-GPU-RENDER': isEmu ? 'TRUE' : 'AUTO',
      'X-Sharpen-Sigma': isEmu ? '0.06' : '0.04',
      'X-AntiFreeze-Stall-Detection-Ms': '1250',
      'X-DNR-POLICY': isEmu ? 'AI_DNR_HW+NLMEANS3.0+ATADENOISE+GRADFUN1.2' : 'HQDN3D+UNSHARP',
      'X-APE-DNR-POLICY': isEmu ? 'AI_DNR_HW+NLMEANS3.0+ATADENOISE+GRADFUN1.2' : 'HQDN3D+UNSHARP'
    }
  };
}

/* Resolucion EFECTIVA de un perfil.
 *
 * LEY ANTI-DEGRADACION: la resolucion nativa del perfil es un SUELO. Si P0 es 8K
 * y el modulo de imagen produce 4K, el perfil NO baja a 4K: se queda en 8K.
 * El modulo puede SUBIR (P5 480p -> 4K es upscaling deseado), pero nunca BAJAR.
 *
 * BUG MEDIDO antes de esto: alinear los 6 perfiles con salida 4K ponia P0 (8K)
 * en 3840x2160, degradando el perfil de maxima calidad. */
function effectiveOutput(gestorProfile, obj) {
  const native = parseRes((gestorProfile && gestorProfile.settings && gestorProfile.settings.resolution) || '');
  const ow = obj.output.width, oh = obj.output.height;
  if (!native) return { width: ow, height: oh, nativeFloor: null, raised: false };
  // el suelo es la nativa; el techo es el mayor de nativa y salida
  const w = Math.max(native.w, ow);
  const h = Math.max(native.h, oh);
  return { width: w, height: h, nativeFloor: native.w + 'x' + native.h, raised: (w > ow || h > oh) };
}
function parseRes(str) {
  const m = String(str || '').match(/^(\d+)x(\d+)$/);
  if (!m) return null;
  const w = Number(m[1]), h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16) return null;
  return { w: w, h: h };
}

/* Genera la cascada correcta para un campo, preservando la escalera ABR. */
function mapCascade(cur, key, target, obj) {
  const n = String(cur).split(',').length;
  const outW = obj.output.width, outH = obj.output.height;
  const mbps = Number(target) || 28;
  const fps = Number(obj.filters.minterpolate.enabled ? obj.filters.minterpolate.outFps : (obj.input.fps || 30));
  if (/RESOLUTION/i.test(key)) {
    return Array.from({ length: n }, (_, i) => cascadeRes(outW, outH, i, n)).join(',');
  }
  if (/BITRATE/i.test(key)) {
    /* La UNIDAD la dice el propio target, no el nombre del campo.
     *
     * BUG MEDIDO: para X-APE-TARGET-BITRATE el target YA viene en bps
     * (28000000) y el codigo lo multiplicaba otra vez por 1e6 -> 28.000.000.000.000,
     * veintiocho billones. El player no tendria escalera, tendria basura.
     *
     * Regla: si el target numerico es > 1000 se asume bps; si no, Mbps. Se aplica
     * la MISMA unidad al multiplicar por el factor de la escalera. */
    const targetNum = Number(target) || mbps;
    const inBps = targetNum > 1000;
    const base = targetNum;   // ya esta en su unidad
    return Array.from({ length: n }, (_, i) => {
      const v = Number(cascadeBitrate(base, i, n));
      return String(inBps ? Math.round(v) : Math.max(1, Math.round(v)));
    }).join(',');
  }
  if (/FPS/i.test(key)) {
    return Array.from({ length: n }, (_, i) => cascadeFps(fps, i, n)).join(',');
  }
  if (/Segment-Duration/i.test(key)) {
    // segmentos un poco mas largos en los niveles bajos (menos peticiones)
    return Array.from({ length: n }, (_, i) => String(Math.min(6, 2 + i))).join(',');
  }
  if (/HEVC-Level/i.test(key)) {
    const lv = outH >= 2160 ? ['5.1','5.0','4.1','4.0','3.1'] : ['4.1','4.0','3.1','3.1','3.0'];
    return Array.from({ length: n }, (_, i) => lv[Math.min(i, lv.length - 1)]).join(',');
  }
  if (/Color-Depth/i.test(key)) {
    const d = ['10bit','10bit','8bit','8bit','8bit'];
    return Array.from({ length: n }, (_, i) => d[Math.min(i, d.length - 1)]).join(',');
  }
  // el resto: mismo valor en todos los niveles (caching, buffer, sharpen)
  return Array.from({ length: n }, () => target).join(',');
}

/* Compara TODAS las secciones y devuelve la propuesta completa. */
function proposeAlignmentFull(gestorProfile, objIn) {
  /* EL PERFIL MANDA EN SU MODO.
   *
   * Los .5 son la capa EMULADA de la doctrina 6K. Si el perfil declara
   * `_mode: 'emulado'` hay que evaluarlo con la funcion objetivo emulada
   * (cadena sintetica: nlmeans, minterpolate, cas, gradfun), NO con la real.
   * MEDIDO antes de esto: P0.5 daba exactamente los mismos 132 cambios que P0
   * porque el motor usaba el modo global pasado por el request. Un perfil
   * emulado alineado como real es una mentira.
   *
   * Si la reconstruccion falla (p. ej. el modo emulado no admite esa salida),
   * se cae al objetivo global: nunca se rompe la respuesta. */
  let obj = objIn;
  const profileMode = (gestorProfile && gestorProfile._mode) || null;
  if (profileMode && profileMode !== objIn.mode) {
    try {
      const alt = objective({
        inW: objIn.input.width, inH: objIn.input.height, inFps: objIn.input.fps,
        outW: objIn.output.width, outH: objIn.output.height,
        player: objIn.player || 'onn-4k', mode: profileMode
      });
      if (alt && alt.ok) obj = alt;
    } catch (_) { /* se queda el global */ }
  }
  // la resolucion nativa del perfil es un SUELO: nunca se degrada
  const eff = effectiveOutput(gestorProfile, obj);
  const objEff = Object.assign({}, obj, { output: { width: eff.width, height: eff.height,
    pixels: eff.width * eff.height } });
  const t = alignmentTargetsFull(objEff, gestorProfile);
  const diffs = [];
  let unchanged = 0;

  function cmp(section, key, target, reason, cascadeAllowed) {
    const sec = gestorProfile[section];
    if (!sec || typeof sec !== 'object') return;
    const cur = sec[key];
    let after;
    if (cur == null) {
      after = target;                       // campo nuevo
    } else if (cascadeAllowed && isCascadeValue(cur)) {
      // CASCADA: se preserva la escalera; el nivel 0 es el objetivo
      after = mapCascade(cur, key, target, objEff);
    } else {
      after = target;
    }
    if (String(cur) === String(after)) { unchanged++; return; }
    diffs.push({
      path: section + '.' + key,
      before: cur == null ? null : cur,
      after,
      cascade: !!(cascadeAllowed && isCascadeValue(cur)),
      reason
    });
  }

  // settings
  for (const k of Object.keys(t.settings)) {
    cmp('settings', k, t.settings[k], 'alineado con la funcion objetivo del modulo de imagen');
  }
  // vlcopt
  for (const k of Object.keys(t.vlcopt)) {
    const r = k === 'video-filter'
      ? 'cadena del motor (OJO: video-filter en playlist es inerte por politica de VLC)'
      : 'coherente con buffer, cadencia y salida objetivo';
    cmp('vlcopt', k, t.vlcopt[k], r);
  }
  // kodiprop
  for (const k of Object.keys(t.kodiprop)) {
    cmp('kodiprop', k, t.kodiprop[k], 'limite de Kodi alineado con la salida');
  }
  // prefetch
  for (const k of Object.keys(t.prefetch_config)) {
    cmp('prefetch_config', k, t.prefetch_config[k], 'prefetch escalado al buffer y al bitrate');
  }
  // quality_levels L1-L7 (escalera completa)
  for (const d of alignQualityLevels(gestorProfile, objEff)) diffs.push(d);
  // quality_levels.primary
  if (gestorProfile.quality_levels && gestorProfile.quality_levels.primary) {
    const cur = gestorProfile.quality_levels.primary;
    const tgt = Object.assign({}, cur, t.quality_levels.primary);
    if (JSON.stringify(cur) !== JSON.stringify(tgt)) {
      diffs.push({ path: 'quality_levels.primary', before: cur, after: tgt, cascade: false,
        reason: 'codec y perfil del nivel primario coherentes con la salida' });
    } else { unchanged++; }
  }
  // headers y headerOverrides: solo los del mapa, con cascada
  for (const sec of ['headers', 'headerOverrides']) {
    const S = gestorProfile[sec];
    if (!S || typeof S !== 'object') continue;
    for (const k of Object.keys(t.headers)) {
      if (!(k in S)) continue;              // solo los que el perfil YA tiene
      const isCascadeField = /RESOLUTION|BITRATE|FPS|CACHING|BUFFER|Segments|Downloads|Duration|HEVC-Level|Color-Depth|Sharpen/.test(k);
      cmp(sec, k, t.headers[k], 'declarativo coherente con la salida (cascada preservada)', isCascadeField);
    }
  }

  const totalFields = countFields(gestorProfile);
  return {
    ok: true,
    profile: gestorProfile.id || null,
    mode: obj.mode,
    // resolucion efectiva del perfil (nativo como suelo)
    resolution: eff.width + 'x' + eff.height,
    nativeFloor: eff.nativeFloor,
    raisedOverModule: eff.raised,
    // que modo se uso de verdad para ESTE perfil
    appliedMode: obj.mode,
    profileModeDeclared: (gestorProfile && gestorProfile._mode) || null,
    totalFields,
    proposed: diffs.length,
    unchanged: Math.max(0, totalFields - diffs.length),
    cascadeCount: diffs.filter((d) => d.cascade).length,
    sections: Object.keys(gestorProfile).filter((k) => typeof gestorProfile[k] === 'object')
      .map((s) => ({ section: s, fields: Object.keys(gestorProfile[s]).length,
                     changed: diffs.filter((d) => d.path.startsWith(s + '.')).length })),
    diffs,
    note: 'PROPUESTA. No se ha aplicado nada. Confirma con /image/profile/align/apply.'
  };
}

/* Aplica la propuesta al perfil y devuelve el JSON nuevo. NO escribe en disco
 * del frontend: el panel lo guarda en APE_PROFILES_CONFIG (localStorage). */
function applyAlignment(gestorProfile, diffs) {
  const out = JSON.parse(JSON.stringify(gestorProfile));
  let applied = 0;
  const failed = [];
  for (const d of diffs || []) {
    const parts = String(d.path).split('.');
    if (parts.length < 2) { failed.push(d.path); continue; }
    const sec = parts[0], key = parts.slice(1).join('.');
    if (!out[sec] || typeof out[sec] !== 'object') { failed.push(d.path); continue; }
    out[sec][key] = d.after;
    applied++;
  }
  return { ok: true, applied, failed, profile: out };
}



/* ═══════════════════════════════════════════════════════════════════════════
 * API KEY PERSISTIBLE EN CALIENTE + MOTOR DE ALINEACION CON EL GESTOR DE PERFILES
 *
 * 1) La key del LLM se puede guardar desde el panel y se aplica SIN reiniciar el
 *    servicio: se escribe en /opt/ape-jit/llm-key.json con chmod 600 y el motor la
 *    lee de ahi si no esta en el entorno. El navegador nunca la recibe de vuelta.
 *
 * 2) Alineacion: el perfil del GESTOR (P0..P5, con sus ~577 campos cada uno) se
 *    hereda y se propone como alinearlo con la funcion objetivo del modulo de
 *    imagen. Primero se AVISA, no se aplica: el operador confirma.
 * ═══════════════════════════════════════════════════════════════════════════ */

const LLM_KEY_FILE = process.env.LLM_KEY_FILE || '/opt/ape-jit/llm-key.json';
const PROFILES_JSON = process.env.PROFILES_JSON || '/var/www/html/js/ape-v9/APE_ALL_PROFILES_OPTIMIZED.json';

/* Key viva. Orden: entorno > archivo. Se recarga al guardar, sin reinicio. */
let llmKeyCache = null;

function readLLMKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  if (llmKeyCache) return llmKeyCache;
  try {
    if (fs.existsSync(LLM_KEY_FILE)) {
      const j = JSON.parse(fs.readFileSync(LLM_KEY_FILE, 'utf8'));
      if (j && typeof j.key === 'string' && j.key.length > 8) {
        llmKeyCache = j.key;
        return llmKeyCache;
      }
    }
  } catch (_) { /* ilegible: sin key */ }
  return null;
}

function saveLLMKey(key) {
  const k = String(key || '').trim();
  if (k.length < 8) return { ok: false, error: 'la key es demasiado corta (minimo 8 caracteres)' };
  if (!/^[A-Za-z0-9_\-\.]+$/.test(k)) return { ok: false, error: 'la key tiene caracteres no validos' };
  try {
    fs.writeFileSync(LLM_KEY_FILE, JSON.stringify({
      key: k,
      updated: new Date().toISOString(),
      note: 'clave del LLM. chmod 600. El motor la lee en caliente.'
    }, null, 2));
    try { fs.chmodSync(LLM_KEY_FILE, 0o600); } catch (_) {}
    llmKeyCache = k;
    return { ok: true, configured: true, chars: k.length };
  } catch (e) {
    return { ok: false, error: 'no se pudo escribir: ' + e.message };
  }
}

function clearLLMKey() {
  try { if (fs.existsSync(LLM_KEY_FILE)) fs.unlinkSync(LLM_KEY_FILE); } catch (_) {}
  llmKeyCache = null;
  return { ok: true, configured: !!readLLMKey() };
}

/* ── ALINEACION CON EL GESTOR DE PERFILES ──────────────────────────────────
 *
 * El operador: "al llamar al perfil desde el Gestor, el LLM heredara los campos
 * que vengan de alla y sobre esos valores realizara el ajuste para que en funcion
 * objetivo esta informacion sirva para que el modulo de imagen construya la imagen
 * excepcional... luego de confirmar, de manera automatizada debera mapear
 * absolutamente todos los campos del gestor de perfil y alinearlos".
 *
 * El motor devuelve una PROPUESTA campo a campo: antes, despues y razon. NO
 * aplica. El operador confirma con el boton.
 */
/* LOS SEIS EMULADOS (.5): la capa sintetica de la doctrina 6K.
 *
 * MEDIDO 2026-11-08: el Gestor JS conoce 12 ids (P0..P5 y P0.5..P5.5, ver
 * APE_6K_IDS en profile-manager-v9.js) pero APE_ALL_PROFILES_OPTIMIZED.json
 * solo trae 6. Los .5 llegan por el import del LAB v24 (data.profiles_calibrated);
 * sin ese import NO existen, y el modulo de imagen solo podia alinear 6.
 *
 * Solucion honesta, sin tocar el JSON: si un .5 no esta, se DERIVA de su base
 * marcando el modo como emulado. No se inventan valores nuevos: se copia la base
 * y se declara `_derived_from` + `_mode`. Asi el motor ya le aplica la cadena
 * sintetica (objective() distingue EMULADO de REAL) y el operador puede alinear
 * los 12. Cuando el LAB aporte el .5 real, este gana y la derivacion no se usa.
 */
const EMULATED_SUFFIX_IDS = ['P0.5','P1.5','P2.5','P3.5','P4.5','P5.5'];

function deriveEmulatedProfile(baseId, base) {
  const out = JSON.parse(JSON.stringify(base || {}));
  out.id = baseId;
  out.name = String(base && base.name ? base.name : baseId) + ' (6K EMULADO)';
  out._derived_from = String(base && base.id ? base.id : baseId.replace(/\.5$/, ''));
  out._mode = 'emulado';
  out._derived_note = 'derivado de ' + out._derived_from +
    ' con modo emulado: la capa sintetica (.5) no estaba en el JSON del Gestor';
  return out;
}

/* Completa los 12 ids: los 6 reales + los 6 emulados derivados si faltan. */
function withEmulatedProfiles(all) {
  if (!all || typeof all !== 'object') return all;
  for (const pid of EMULATED_SUFFIX_IDS) {
    if (all[pid]) continue;                       // el LAB ya lo trajo: gana
    const baseId = pid.replace(/\.5$/, '');
    const base = all[baseId];
    if (!base) continue;
    all[pid] = deriveEmulatedProfile(pid, base);
  }
  return all;
}

function loadGestorProfiles() {
  try {
    const raw = JSON.parse(fs.readFileSync(PROFILES_JSON, 'utf8'));
    return raw.profiles || {};
  } catch (e) {
    return null;
  }
}

/* Deriva los valores que LE TOCAN al gestor a partir de la funcion objetivo.
 * Estas son las reglas de alineacion: que campo del gestor se mueve y por que. */
function alignmentTargets(obj) {
  const outW = obj.output.width, outH = obj.output.height;
  const isEmu = obj.mode === 'emulado';
  const codecId = obj.fields.codec.value;
  const codecLabel = CODEC_CATALOG[codecId] ? CODEC_CATALOG[codecId].family.toUpperCase() : 'HEVC';

  /* Bitrate objetivo. Se usa la tabla de referencia del repo (CLAUDE.md,
   * "Bitrate Fallback por Resolucion"), NO un factor inventado.
   *
   * MEDIDO: con un factor px*0.06 el calculo daba 4K = 1 Mbps, absurdo. La tabla
   * del repo dice 4K = 28 Mbps y es la que rige. */
  const BITRATE_TABLE = [
    { px: 7680 * 4320, mbps: 80 },
    { px: 3840 * 2160, mbps: 28 },
    { px: 2560 * 1440, mbps: 16 },
    { px: 2048 * 1080, mbps: 14 },
    { px: 1920 * 1080, mbps: 12 },
    { px: 1280 * 720,  mbps: 5.5 },
    { px: 854 * 480,   mbps: 2.5 }
  ];
  const px = outW * outH;
  let bitrateMbps = 2.5;
  for (const row of BITRATE_TABLE) {
    if (px >= row.px) { bitrateMbps = row.mbps; break; }
  }
  // 6K (entre 4K y 8K): se interpola
  if (px > 3840 * 2160 && px < 7680 * 4320) {
    bitrateMbps = Math.round(28 + (px - 3840 * 2160) / (7680 * 4320 - 3840 * 2160) * (80 - 28));
  }
  // el codec ajusta: AV1 gasta ~25% menos, AVC ~40% mas para la misma calidad
  if (codecId === 'av01') bitrateMbps = Math.round(bitrateMbps * 0.75);
  else if (codecId === 'avc1') bitrateMbps = Math.round(bitrateMbps * 1.4);
  // emulado pide mas margen: hay pixeles sintetizados que codificar
  if (isEmu) bitrateMbps = Math.round(bitrateMbps * 1.15);
  bitrateMbps = Math.max(1, bitrateMbps);

  // buffer: mas grande si el coste es alto (mas riesgo de stall) y en emulado
  const costMul = obj.cost.relative;
  const bufferSec = Math.min(60, Math.max(8, Math.round(8 + costMul * 3 + (isEmu ? 4 : 0))));
  const networkCaching = bufferSec * 1000;
  const clockJitter = Math.round(networkCaching * 0.1);

  return {
    settings: {
      resolution: outW + 'x' + outH,
      codec: codecId === 'avc1' ? 'H264' : (codecId === 'av01' ? 'AV1' : 'H265'),
      fps: obj.filters.minterpolate.enabled ? obj.filters.minterpolate.outFps : (obj.input.fps || 30),
      bitrate: bitrateMbps,
      bufferSeconds: bufferSec,
      strategy: isEmu ? 'ultra-aggressive' : 'balanced',
      headersCount: 200,
      playerBuffer: bufferSec * 1000,
      bitrateFloor: Math.max(1, Math.round(bitrateMbps * 0.15))
    },
    vlcopt: {
      'network-caching': networkCaching,
      'live-caching': networkCaching,
      'clock-jitter': clockJitter,
      'clock-synchro': 1,
      // video-filter es INERTE por politica de VLC: se declara, no se promete
      'video-filter': obj.chain
    },
    kodiprop: {
      'inputstream.adaptive.max_resolution': outW + 'x' + outH,
      'inputstream.adaptive.max_bitrate': bitrateMbps * 1000,
      'inputstream.adaptive.preferred_video_frame_rate': obj.filters.minterpolate.enabled
        ? obj.filters.minterpolate.outFps : (obj.input.fps || 30)
    },
    prefetch_config: {
      buffer_target_seconds: Math.min(600, bufferSec * 3),
      prefetch_segments: isEmu ? 30 : 20,
      parallel_downloads: isEmu ? 12 : 8,
      adaptive_enabled: true
    },
    headers: {
      'X-APE-RESOLUTION': outW + 'x' + outH,
      'X-APE-BITRATE': String(bitrateMbps),
      'X-APE-TARGET-BITRATE': String(bitrateMbps * 1e6),
      'X-APE-FPS': String(obj.filters.minterpolate.enabled ? obj.filters.minterpolate.outFps : (obj.input.fps || 30)),
      'X-Video-Codecs': codecId === 'avc1' ? 'H264' : (codecId === 'av01' ? 'AV1' : 'HEVC'),
      'X-APE-CODEC': codecLabel,
      'X-Max-Resolution': outW + 'x' + outH,
      'X-Max-Bitrate': String(bitrateMbps * 1e6),
      'X-Network-Caching': String(networkCaching),
      'X-Min-Buffer-Time': String(bufferSec),
      'X-Buffer-Target': String(bufferSec * 1000)
    }
  };
}

/* Compara el perfil del gestor con los objetivos y devuelve la propuesta.
 * Cada cambio lleva: ruta, antes, despues, razon. */
function proposeAlignment(gestorProfile, obj) {
  const t = alignmentTargets(obj);
  const diffs = [];

  function cmp(section, key, target, reason) {
    const cur = (gestorProfile[section] && gestorProfile[section][key] != null)
      ? gestorProfile[section][key] : null;
    const same = String(cur) === String(target);
    if (same) return;
    diffs.push({
      path: section + '.' + key,
      before: cur,
      after: target,
      changed: true,
      reason
    });
  }

  const S = t.settings;
  cmp('settings', 'resolution', S.resolution, 'la salida del modulo de imagen define la resolucion del perfil');
  cmp('settings', 'codec', S.codec, 'el codec elegido por la funcion objetivo');
  cmp('settings', 'fps', S.fps, 'la cadencia real que se va a entregar');
  cmp('settings', 'bitrate', S.bitrate, 'bitrate que sostiene ' + S.resolution + ' con ' + S.codec);
  cmp('settings', 'bufferSeconds', S.bufferSeconds, 'buffer proporcional al coste (' + obj.cost.relative + 'x)');
  cmp('settings', 'strategy', S.strategy, obj.mode === 'emulado'
    ? 'emulado: estrategia agresiva para aprovechar el margen'
    : 'real: estrategia balanceada, no se promete lo que no se sostiene');

  for (const k of Object.keys(t.vlcopt)) {
    cmp('vlcopt', k, t.vlcopt[k], k === 'video-filter'
      ? 'cadena del modulo de imagen (OJO: video-filter en playlist es inerte por politica de VLC)'
      : 'coherente con el buffer y la cadencia objetivo');
  }
  for (const k of Object.keys(t.kodiprop)) {
    cmp('kodiprop', k, t.kodiprop[k], 'limite de Kodi alineado con la salida');
  }
  for (const k of Object.keys(t.prefetch_config)) {
    cmp('prefetch_config', k, t.prefetch_config[k], 'prefetch escalado al buffer');
  }
  for (const k of Object.keys(t.headers)) {
    cmp('headers', k, t.headers[k], 'header declarativo coherente con la salida');
  }

  return {
    ok: true,
    profile: gestorProfile.id || null,
    mode: obj.mode,
    totalFields: countFields(gestorProfile),
    proposed: diffs.length,
    unchanged: countFields(gestorProfile) - diffs.length,
    diffs,
    // lo que se hereda tal cual (sin tocar)
    inherited: Object.keys(gestorProfile).filter((k) => typeof gestorProfile[k] !== 'object'),
    note: 'PROPUESTA. No se ha aplicado nada. Confirma con /image/profile/align/apply.'
  };
}

function countFields(p) {
  let n = 0;
  for (const k of Object.keys(p || {})) {
    const v = p[k];
    n += (v && typeof v === 'object') ? Object.keys(v).length : 1;
  }
  return n;
}



/* ═══════════════════════════════════════════════════════════════════════════
 * OPTIMIZADOR LLM — opcional, con fallback determinista SIEMPRE
 *
 * El operador: "quiero que le implementes un API de un LLM, para que basado en
 * estos skills, sea quien haga los calculos y se adapte a mis exigencias".
 *
 * DISENO:
 *   1. El motor determinista `objective()` calcula SIEMPRE, primero. Es la red.
 *   2. Si hay DEEPSEEK_API_KEY, se le pasa al LLM esa base + el contexto, y puede
 *      MEJORARLA. La salida se VALIDA campo a campo contra los rangos reales.
 *   3. Si el LLM falla, tarda, o devuelve algo invalido, gana el determinista.
 *      El panel nunca se queda sin respuesta.
 *
 * SEGURIDAD: la key NO se expone al navegador. Vive solo en el proceso del motor.
 * La llamada sale del VPS, no del cliente.
 * ═══════════════════════════════════════════════════════════════════════════ */

const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 25000;

/* Contexto que se le da al modelo: que es cada campo y que rangos valen.
 * Es el "skill" en texto: sin esto el LLM inventa parametros que ffmpeg rechaza. */
function llmSystemPrompt() {
  return [
    'Eres un ingeniero de video experto en FFmpeg, HLS/CMAF y calidad de imagen IPTV.',
    'Devuelves SOLO un objeto JSON valido, sin markdown, sin explicaciones fuera del JSON.',
    'Trabajas para un VPS de 3 vCPU AMD EPYC-Rome y 3 GB. NO hay GPU. NO hay modelo DNN (sr no disponible).',
    '',
    'RANGOS REALES de los campos (fuera de rango = la cadena NO compila):',
    '- preset: ultrafast|superfast|veryfast|faster|fast|medium|slow',
    '- crf: 0..51 (menor = mas calidad y mas bitrate)',
    '- audio: preserve|aac|drop  (preserve NO degrada 5.1 a estereo)',
    '- hqdn3d.luma_spatial y chroma_spatial y luma_tmp y chroma_tmp: 0..20',
    '- unsharp.luma_amount: -2..5 ; unsharp.luma_msize: IMPAR 3..23 (0 ROMPE la cadena)',
    '- atadenoise.s: 0..15 (0 = desactivado)',
    '- gradfun.strength: 0.51..64 ; gradfun.radius: 4..32',
    '- cas.strength: 0..1',
    '- nlmeans.s: 0..10 ; p: 1..99 ; r: 1..99',
    '- minterpolate.outFps: 1..240 (solo se usa si enabled)',
    '- seg_duration: 1..10 ; window_size: 3..120 ; extra_window_size: 0..60 ; gop_seconds: 1..10',
    '- x265_threads: 1..32',
    '',
    'REGLAS DE LA CASA:',
    '1. NO degradar resolucion, codec, HDR, fps ni bitrate para "que funcione".',
    '2. minterpolate NO recupera informacion: inventa fotogramas. Declararlo siempre.',
    '3. nlmeans y atadenoise NO se apilan: son alternativas.',
    '4. En modo REAL: filtros conservadores, nada sintetico que empeore con movimiento.',
    '5. En modo EMULADO: sintesis maxima (denoise proporcional, debanding, CAS, interpolacion).',
    '6. El coste importa: 1080p a 25fps sin filtros da 1.76x tiempo real. Cada filtro suma.',
    '7. AUDACIA PERO HONESTIDAD: busca la mejor imagen posible, y declara lo que no se sostiene.'
  ].join('\n');
}

function llmUserPrompt(input, base) {
  return JSON.stringify({
    peticion: 'Optimiza TODOS los campos para esta transformacion. Devuelve el JSON con la misma forma que base.',
    entrada: input,
    base_determinista: {
      fields: base.fields,
      filters: base.filters,
      chain: base.chain,
      cost: base.cost
    },
    instruccion: [
      'Puedes cambiar cualquier valor de fields y filters si mejora la imagen.',
      'Manten los campos dentro de los rangos. msize impar.',
      'Si tu propuesta cuesta mas de 1.6 de coste relativo, dilo en "riesgo".',
      'Devuelve: {"fields":{...}, "filters":{...}, "razon":"...", "riesgo":"..."}'
    ]
  });
}

/* Valida y fusiona la propuesta del LLM sobre la base determinista.
 * Cualquier campo invalido se DESCARTA y se queda el determinista. */
function mergeLLMProposal(base, prop) {
  const out = JSON.parse(JSON.stringify(base));
  const applied = [];
  const rejected = [];
  if (!prop || typeof prop !== 'object') return { out, applied, rejected, reason: 'respuesta no es objeto' };

  // campos planos
  if (prop.fields && typeof prop.fields === 'object') {
    for (const k of ['preset', 'crf', 'audio', 'seg_duration', 'window_size', 'extra_window_size', 'gop_seconds', 'x265_threads']) {
      if (prop.fields[k] == null) continue;
      const v = prop.fields[k];
      const e = validateRuleParam(k, v);
      if (e) { rejected.push(k + ': ' + e); continue; }
      out.fields[k] = { value: ['crf', 'seg_duration', 'window_size', 'extra_window_size', 'gop_seconds', 'x265_threads'].includes(k) ? Number(v) : v,
                        reason: 'propuesto por el LLM' };
      applied.push(k);
    }
  }
  // filtros: solo se aceptan dentro de rango
  if (prop.filters && typeof prop.filters === 'object') {
    const F = prop.filters;
    if (F.hqdn3d) {
      for (const k of ['luma_spatial', 'chroma_spatial', 'luma_tmp', 'chroma_tmp']) {
        if (F.hqdn3d[k] == null) continue;
        const e = validateRuleParam('hqdn3d.' + k, F.hqdn3d[k]);
        if (e) { rejected.push('hqdn3d.' + k + ': ' + e); continue; }
        out.filters.hqdn3d[k] = Number(F.hqdn3d[k]);
        applied.push('hqdn3d.' + k);
      }
    }
    if (F.unsharp) {
      for (const [k, lim] of [['luma_amount', 'unsharp.luma_amount'], ['luma_msize', 'unsharp.luma_msize']]) {
        if (F.unsharp[k] == null) continue;
        const e = validateRuleParam(lim, F.unsharp[k]);
        if (e) { rejected.push('unsharp.' + k + ': ' + e); continue; }
        out.filters.unsharp[k] = Number(F.unsharp[k]);
        applied.push('unsharp.' + k);
      }
    }
    if (F.cas && F.cas.strength != null) {
      const v = Number(F.cas.strength);
      if (v >= 0 && v <= 1) { out.filters.cas = { strength: v, enabled: v > 0 }; applied.push('cas.strength'); }
      else rejected.push('cas.strength fuera de [0,1]: ' + v);
    }
    if (F.gradfun) {
      if (F.gradfun.strength != null) {
        const v = Number(F.gradfun.strength);
        if (v >= 0.51 && v <= 64) { out.filters.gradfun.strength = v; out.filters.gradfun.enabled = true; applied.push('gradfun.strength'); }
        else rejected.push('gradfun.strength fuera de [0.51,64]: ' + v);
      }
      if (F.gradfun.radius != null) {
        const v = Math.round(Number(F.gradfun.radius));
        if (v >= 4 && v <= 32) { out.filters.gradfun.radius = v; applied.push('gradfun.radius'); }
        else rejected.push('gradfun.radius fuera de [4,32]: ' + v);
      }
    }
    if (F.nlmeans) {
      if (F.nlmeans.s != null) {
        const v = Number(F.nlmeans.s);
        if (v >= 0 && v <= 10) {
          out.filters.nlmeans = { s: v, p: Number(F.nlmeans.p) || 5, r: Number(F.nlmeans.r) || 11, enabled: v > 0 };
          applied.push('nlmeans.s');
        } else rejected.push('nlmeans.s fuera de [0,10]: ' + v);
      }
    }
    if (F.minterpolate && F.minterpolate.outFps != null) {
      const v = Number(F.minterpolate.outFps);
      if (v >= 1 && v <= 240) {
        out.filters.minterpolate = { outFps: v, enabled: true };
        applied.push('minterpolate.outFps');
      } else rejected.push('minterpolate.outFps fuera de [1,240]: ' + v);
    }
  }
  // la cadena se RECONSTRUYE con los valores validados, nunca se acepta del LLM
  out.chain = buildChainFromFilters(out.filters, out.output.width, out.output.height);
  out.llm = { used: true, applied, rejected, razon: String(prop.razon || '').slice(0, 400), riesgo: String(prop.riesgo || '').slice(0, 400) };
  return { out, applied, rejected, reason: null };
}

/* Reconstruye la cadena desde los filtros. Es la UNICA fuente de la cadena: el
 * LLM no puede inyectar texto arbitrario en el filtro. */
function buildChainFromFilters(F, outW, outH) {
  const c = [];
  c.push('format=yuv420p10le');
  if (F.minterpolate && F.minterpolate.enabled && F.minterpolate.outFps) {
    c.push('minterpolate=fps=' + F.minterpolate.outFps + ':mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1');
  } else if (F.minterpolate && F.minterpolate.outFps) {
    c.push('fps=' + F.minterpolate.outFps);
  }
  if (F.nlmeans && F.nlmeans.enabled && F.nlmeans.s > 0) {
    c.push('nlmeans=s=' + F.nlmeans.s + ':p=' + F.nlmeans.p + ':r=' + F.nlmeans.r);
  }
  if (F.hqdn3d && F.hqdn3d.luma_spatial > 0) {
    c.push('hqdn3d=' + F.hqdn3d.luma_spatial + ':' + F.hqdn3d.chroma_spatial + ':'
      + F.hqdn3d.luma_tmp + ':' + F.hqdn3d.chroma_tmp);
  }
  if (F.atadenoise && F.atadenoise.s > 0) {
    c.push('atadenoise=0a=' + F.atadenoise.a + ':0b=' + F.atadenoise.b + ':s=' + F.atadenoise.s);
  }
  c.push('scale=' + outW + ':' + outH + ':flags=lanczos+accurate_rnd');
  if (F.unsharp && F.unsharp.luma_amount > 0) {
    c.push('unsharp=' + F.unsharp.luma_msize + ':' + F.unsharp.luma_msize + ':' + F.unsharp.luma_amount
      + ':' + F.unsharp.chroma_msize + ':' + F.unsharp.chroma_msize + ':0');
  }
  if (F.cas && F.cas.enabled && F.cas.strength > 0) c.push('cas=strength=' + F.cas.strength);
  if (F.gradfun && F.gradfun.enabled) c.push('gradfun=strength=' + F.gradfun.strength + ':radius=' + F.gradfun.radius);
  c.push('setsar=1');
  c.push('zscale=dither=3');
  c.push('format=yuv420p10le');
  return c.join(',');
}

/* Llama al LLM. Devuelve null si no hay key, falla o tarda demasiado. */
async function callLLM(input, base) {
  const apiKey = readLLMKey();
  if (!apiKey) return { error: 'sin key: ni en el entorno ni en ' + LLM_KEY_FILE };
  const endpoint = process.env.LLM_ENDPOINT || 'https://api.deepseek.com/chat/completions';
  const body = {
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: llmSystemPrompt() },
      { role: 'user', content: llmUserPrompt(input, base) }
    ],
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LLM_TIMEOUT_MS);
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(body),
      signal: ctl.signal
    });
    if (!r.ok) { const t = await r.text(); return { error: 'HTTP ' + r.status + ': ' + t.slice(0, 160) }; }
    const j = await r.json();
    const txt = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!txt) return { error: 'respuesta sin contenido' };
    let parsed;
    try { parsed = JSON.parse(txt); }
    catch (_) {
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) return { error: 'el LLM no devolvio JSON' };
      try { parsed = JSON.parse(m[0]); } catch (e2) { return { error: 'JSON invalido del LLM: ' + e2.message }; }
    }
    return { proposal: parsed };
  } catch (e) {
    return { error: e.name === 'AbortError' ? ('timeout tras ' + LLM_TIMEOUT_MS + ' ms') : ('red: ' + e.message) };
  } finally {
    clearTimeout(timer);
  }
}



/* ═══════════════════════════════════════════════════════════════════════════
 * MOTOR DE OPTIMIZACION — funcion objetivo REAL vs EMULADO
 *
 * El operador: "si coloco real y si coloco emulado, tienen que cambiar: parametros
 * de la receta, encoder, filtros, empaquetado". Y "aplicando todas las tecnicas
 * que se usen para generar contenidos emulados o fake".
 *
 * DIFERENCIA DE FONDO:
 *   REAL    -> lo que el host y el device SOSTIENEN. Filtros conservadores, coste
 *              bajo, nada sintetico. Se promete lo que se puede entregar.
 *   EMULADO -> sintesis maxima: interpolacion de movimiento, denoise de alta
 *              calidad, debanding, contraste adaptativo, HDR sintetico. Se declara
 *              como emulado: la etiqueta NO miente sobre el bitstream.
 *
 * TECNICAS VERIFICADAS EN ESTE FFMPEG (medidas, no supuestas):
 *   cas=strength        OK  contraste adaptativo (mejor que unsharp en bordes)
 *   gradfun=strength    OK  debanding, rango [0.51,64] y radius [4,32]
 *   nlmeans=s:p:r       OK  denoise de alta calidad (caro)
 *   minterpolate        OK  mi_mode mci/mc_mode aobmc: interpolacion real
 *   atadenoise          OK  denoise temporal
 *   zscale              OK  HDR sintetico / dither
 *
 * NO DISPONIBLE, y se declara:
 *   sr (DNN super-resolution) exige `model=` con un .pb. NO existe en este VPS.
 *   Es el mismo bloqueo que los .tflite del APK. Sin modelo no hay super-resolucion
 *   neuronal: se usa Lanczos + cas + unsharp, que es sintesis por interpolacion.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Presets x265 ordenados de mas rapido a mas lento. El motor escoje el mas lento
 * que el host sostenga segun el coste relativo estimado. */
const X265_LADDER = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'];

/* Coste relativo maximo que este host sostiene. 1.0 = 1080p none a 25fps,
 * medido: 1,76x tiempo real. El umbral de 1,2x deja 1,47 de coste maximo. */
const HOST_COST_BUDGET = 1.6;

function pickPreset(relCost, mode) {
  // REAL: el mas rapido que sobre. EMULADO: se permite bajar un escalon mas
  let idx = 0;
  for (let i = 0; i < X265_LADDER.length; i++) {
    // cada preset ~ suma 8% de coste
    const c = relCost * (1 + i * 0.08);
    if (c <= HOST_COST_BUDGET) idx = i; else break;
  }
  if (mode === 'emulado') idx = Math.min(idx + 1, X265_LADDER.length - 1);
  return X265_LADDER[idx];
}

/* ── LA FUNCION OBJETIVO ───────────────────────────────────────────────────
 * Dada la seleccion, devuelve TODOS los campos: receta, parametros de filtro,
 * encoder y empaquetado, con el valor y el porque de cada uno.
 */
function objective(inp) {
  const o = inp || {};
  const inW = Math.max(16, Math.round(Number(o.inW) || 1280));
  const inH = Math.max(16, Math.round(Number(o.inH) || 720));
  const inFps = Number(o.inFps) || 30;
  const outW = Math.max(16, Math.round(Number(o.outW) || 3840));
  const outH = Math.max(16, Math.round(Number(o.outH) || 2160));
  const mode = String(o.mode || 'real') === 'emulado' ? 'emulado' : 'real';
  const playerId = String(o.player || 'onn-4k');
  const caps = PLAYER_CAPS[playerId] || PLAYER_CAPS.generic;

  const inPx = inW * inH, outPx = outW * outH;
  const areaRatio = outPx / inPx;
  const linearRatio = Math.sqrt(areaRatio);
  const exceedsDecoder = (outW > caps.maxW || outH > caps.maxH);
  const isEmu = mode === 'emulado';

  // ── coste base y preset ──
  const baseCost = (outPx / (1920 * 1080)) * (inFps > 30 ? 1.8 : 1.0);
  const preset = pickPreset(baseCost, mode);
  // CRF: emulado baja el numero (mas calidad) porque hay mas pixeles inventados
  const crf = isEmu ? (areaRatio > 9 ? 16 : areaRatio > 2.5 ? 17 : 18)
                    : (areaRatio > 9 ? 20 : areaRatio > 2.5 ? 21 : 22);

  // ── codec: el mejor que el player decodifique ──
  let codec = 'hvc1';
  if (!caps.codecs.includes('hvc1')) codec = caps.codecs.includes('hvc1_8') ? 'hvc1_8' : 'avc1';
  if (codec === 'avc1' && outPx > 1920 * 1080) codec = caps.codecs.includes('hvc1') ? 'hvc1' : 'avc1';

  // ── receta y parametros de filtro ──
  const F = {
    hqdn3d: { luma_spatial: 0, chroma_spatial: 0, luma_tmp: 0, chroma_tmp: 0 },
    unsharp: { luma_amount: 0, luma_msize: 5, chroma_amount: 0, chroma_msize: 3 },
    atadenoise: { s: 0, a: 0.01, b: 0.02 },
    gradfun: { strength: 1.2, radius: 16, enabled: false },
    cas: { strength: 0, enabled: false },
    nlmeans: { s: 0, p: 0, r: 0, enabled: false },
    minterpolate: { outFps: 0, enabled: false }
  };
  const why = {};

  if (isEmu) {
    /* EMULADO: sintesis maxima.
     *
     * a) Denoise PROPORCIONAL al upscale: cuanto mas se amplifica, mas ruido se
     *    amplifica. nlmeans es caro pero preserva bordes mejor que hqdn3d.
     * b) Debanding: el upscale crea bandas en degradados; gradfun las rompe.
     * c) CAS: contraste adaptativo, mejor que unsharp en detalle fino.
     * d) Unsharp de bordes (luma) siempre, porque el escalado suaviza. */
    if (areaRatio > 2.5) {
      F.nlmeans.enabled = true;
      F.nlmeans.s = Number(Math.min(3.0, 1.0 + linearRatio * 0.25).toFixed(2));
      F.nlmeans.p = 5;
      F.nlmeans.r = 11;
      why.nlmeans = 'upscale ' + areaRatio.toFixed(1) + 'x amplifica el ruido: nlmeans '
        + F.nlmeans.s + ' preserva bordes mejor que hqdn3d';
    } else {
      F.hqdn3d.luma_spatial = 0.6; F.hqdn3d.chroma_spatial = 0.45;
      F.hqdn3d.luma_tmp = 0.9; F.hqdn3d.chroma_tmp = 0.7;
      why.hqdn3d = 'upscale leve: hqdn3d basta y cuesta menos que nlmeans';
    }
    // banding: mas agresivo cuanto mayor el upscale
    F.gradfun.enabled = true;
    F.gradfun.strength = Number(Math.min(2.5, 0.9 + linearRatio * 0.15).toFixed(2));
    F.gradfun.radius = Math.min(32, Math.max(8, Math.round(8 + linearRatio * 3)));
    why.gradfun = 'el escalado crea bandas en degradados: gradfun ' + F.gradfun.strength
      + ' con radio ' + F.gradfun.radius;
    // CAS: contraste adaptativo
    F.cas.enabled = true;
    F.cas.strength = Number(Math.min(0.7, 0.15 + linearRatio * 0.08).toFixed(2));
    why.cas = 'CAS ' + F.cas.strength + ': realza contraste local sin halos como unsharp';
    // unsharp de bordes
    F.unsharp.luma_amount = Number(Math.min(0.4, 0.12 + linearRatio * 0.04).toFixed(2));
    F.unsharp.luma_msize = 5;
    why.unsharp = 'el escalado suaviza bordes: unsharp ' + F.unsharp.luma_amount;
    // interpolacion: SOLO si la fuente no trae ya alta cadencia
    if (inFps < 50 && outPx <= 3840 * 2160) {
      F.minterpolate.enabled = true;
      F.minterpolate.outFps = inFps < 30 ? 60 : Math.min(60, inFps * 2);
      why.minterpolate = 'fuente a ' + inFps + ' fps: interpolacion de movimiento a '
        + F.minterpolate.outFps + ' (NO recupera informacion; la inventa)';
    } else if (inFps > 30 && outPx > 3840 * 2160) {
      F.minterpolate.outFps = 30;
      why.minterpolate = 'por encima de 4K el host no sostiene mas de 30 fps: se decima';
    }
    F.atadenoise.s = 0; // no se apila con nlmeans: son alternativas
  } else {
    /* REAL: solo lo que se sostiene y no inventa. Nada de sintesis que pueda
     * empeorar con contenido en movimiento, grano o texto. */
    if (areaRatio <= 1.05) {
      why.filtros = 'sin escalado: filtrar solo anadiria artefactos';
    } else if (areaRatio <= 2.5) {
      F.unsharp.luma_amount = 0.15; F.unsharp.luma_msize = 5;
      why.unsharp = 'upscale leve: unsharp 0.15 basta, el denoise borraria detalle';
    } else if (areaRatio <= 9) {
      F.hqdn3d.luma_spatial = 0.6; F.hqdn3d.chroma_spatial = 0.45;
      F.hqdn3d.luma_tmp = 0.9; F.hqdn3d.chroma_tmp = 0.7;
      F.unsharp.luma_amount = 0.2; F.unsharp.luma_msize = 5;
      why.hqdn3d = 'upscale medio: el ruido se amplifica, hqdn3d moderado lo contiene';
      why.unsharp = 'unsharp 0.2 devuelve algo del borde que el escalado diluye';
    } else {
      F.atadenoise.s = 5; F.atadenoise.a = 0.010; F.atadenoise.b = 0.020;
      F.unsharp.luma_amount = 0.2; F.unsharp.luma_msize = 5;
      why.atadenoise = 'upscale severo: atadenoise temporal reduce el ruido sin el coste de nlmeans';
      why.unsharp = 'unsharp 0.2 sobre la salida temporal';
    }
  }

  // ── empaquetado ──
  const segDuration = 2;
  const gopSeconds = 2;
  const windowSize = isEmu ? 20 : 30;   // emulado: mas ventana por el coste
  const extraWindow = isEmu ? 6 : 10;
  const threads = isEmu ? Math.min(2, Math.max(1, Math.floor(baseCost / 1.4))) : 1;
  why.empaquetado = 'seg ' + segDuration + 's y GOP ' + gopSeconds + 's: GOP cerrado de 2s da '
    + 'arranque rapido y seek limpio';

  // ── coste final con todos los filtros ──
  let costMul = 1.0;
  if (F.nlmeans.enabled) costMul += 2.5;      // nlmeans es caro
  if (F.minterpolate.enabled) costMul += 2.0; // interpolacion muy cara
  if (F.cas.enabled) costMul += 0.15;
  if (F.gradfun.enabled) costMul += 0.2;
  if (F.atadenoise.s > 0) costMul += 0.35;
  if (F.unsharp.luma_amount > 0) costMul += 0.1;
  const relCost = Number((baseCost * costMul).toFixed(2));
  const estRatio = Number((1.76 / (relCost || 1)).toFixed(2));
  const viable = estRatio >= 1.2;

  // ── imposibles y avisos ──
  const impossible = [];
  const warnings = [];
  if (exceedsDecoder) {
    const msg = 'el decoder de ' + caps.label + ' llega a ' + caps.maxW + 'x' + caps.maxH
      + '; ' + outW + 'x' + outH + ' no se decodifica de forma nativa';
    if (isEmu) warnings.push('EMULADO: ' + msg + '. Se declara emulada; la etiqueta no miente.');
    else impossible.push(msg + '. Cambia a EMULADO para declararla igual.');
  }
  if (!viable) {
    warnings.push('coste ' + relCost + 'x -> ' + estRatio + 'x tiempo real: NO SOSTENIDO en este host de 3 vCPU');
  }
  if (F.minterpolate.enabled) {
    warnings.push('minterpolate NO recupera informacion: inventa fotogramas intermedios por estimacion de movimiento');
  }
  if (areaRatio > 20) {
    warnings.push('upscale ' + areaRatio.toFixed(1) + 'x: el detalle no existe en la fuente');
  }
  warnings.push('sr (DNN super-resolution) NO DISPONIBLE: exige un modelo .pb que no existe en este VPS. '
    + 'La sintesis se hace por Lanczos + cas + unsharp.');

  // ── la cadena ffmpeg resultante ──
  const chain = [];
  chain.push('format=yuv420p10le');
  if (F.minterpolate.enabled) {
    chain.push('minterpolate=fps=' + F.minterpolate.outFps + ':mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1');
  } else if (F.minterpolate.outFps) {
    chain.push('fps=' + F.minterpolate.outFps);
  }
  if (F.nlmeans.enabled) chain.push('nlmeans=s=' + F.nlmeans.s + ':p=' + F.nlmeans.p + ':r=' + F.nlmeans.r);
  if (F.hqdn3d.luma_spatial > 0) {
    chain.push('hqdn3d=' + F.hqdn3d.luma_spatial + ':' + F.hqdn3d.chroma_spatial + ':'
      + F.hqdn3d.luma_tmp + ':' + F.hqdn3d.chroma_tmp);
  }
  if (F.atadenoise.s > 0) {
    chain.push('atadenoise=0a=' + F.atadenoise.a + ':0b=' + F.atadenoise.b + ':s=' + F.atadenoise.s);
  }
  chain.push('scale=' + outW + ':' + outH + ':flags=lanczos+accurate_rnd');
  if (F.unsharp.luma_amount > 0) {
    chain.push('unsharp=' + F.unsharp.luma_msize + ':' + F.unsharp.luma_msize + ':' + F.unsharp.luma_amount
      + ':' + F.unsharp.chroma_msize + ':' + F.unsharp.chroma_msize + ':0');
  }
  if (F.cas.enabled) chain.push('cas=strength=' + F.cas.strength);
  if (F.gradfun.enabled) chain.push('gradfun=strength=' + F.gradfun.strength + ':radius=' + F.gradfun.radius);
  chain.push('setsar=1');
  chain.push('zscale=dither=3');
  chain.push('format=yuv420p10le');

  return {
    ok: true,
    mode,
    modeMeaning: isEmu
      ? 'EMULADO: sintesis maxima (denoise proporcional, debanding, CAS, interpolacion). Se declara emulada.'
      : 'REAL: solo lo sostenido y sin sintesis que pueda empeorar. Se promete lo que se entrega.',
    input: { width: inW, height: inH, fps: inFps, pixels: inPx },
    output: { width: outW, height: outH, pixels: outPx },
    areaRatio: Number(areaRatio.toFixed(2)),
    linearRatio: Number(linearRatio.toFixed(2)),
    exceedsDecoder,
    fields: {
      codec: { value: codec, reason: 'el mejor que ' + caps.label + ' decodifica para ' + outW + 'x' + outH },
      preset: { value: preset, reason: 'el mas lento que el host sostiene con ' + relCost + 'x de coste' },
      crf: { value: crf, reason: isEmu ? 'emulado: CRF bajo porque hay mas pixeles inventados que proteger' : 'real: CRF moderado, el bitrate no se infla' },
      audio: { value: 'preserve', reason: 'NO se fuerza -ac 2: eso degradaria 5.1 a estereo' },
      seg_duration: { value: segDuration, reason: why.empaquetado },
      gop_seconds: { value: gopSeconds, reason: why.empaquetado },
      window_size: { value: windowSize, reason: 'ventana DASH de ' + windowSize + ' segmentos' },
      extra_window_size: { value: extraWindow, reason: 'margen para seek' },
      x265_threads: { value: threads, reason: 'hilos proportionales al coste: mas hilos compiten por 3 vCPU' }
    },
    filters: F,
    why,
    chain: chain.join(','),
    cost: { relative: relCost, estimatedRatio: estRatio, viable },
    impossible,
    warnings
  };
}



/* ═══════════════════════════════════════════════════════════════════════════
 * AUTO POR CAMPO: la configuracion optima para una regla, campo a campo.
 *
 * Regla del operador: la tabla es MANUAL. El auto es una AYUDA por campo, no un
 * reemplazo. Cada campo puede pedir su valor optimo por separado, y el boton de
 * la fila pide todos de golpe.
 *
 * Y no se buscan configuraciones imposibles: si una combinacion no se puede
 * sostener, se dice cual y por que, en vez de devolverla como valida.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Escalera de codec de mejor a peor. El auto baja por ella hasta el primero que
 * el player decodifica Y que sirve para la resolucion pedida. */
const CODEC_LADDER = ['hvc1', 'hvc1_8', 'avc1', 'av01'];

/* Receta optima segun cuanto hay que inventar. Mas upscale = mas filtro, pero
 * el coste sube: se declara. */
function autoRecipe(areaRatio) {
  if (areaRatio <= 1.05) return { id: 'none', reason: 'sin escalado (ratio ' + areaRatio.toFixed(2) + 'x): filtrar solo anadiria artefactos' };
  if (areaRatio <= 2.5) return { id: 'light', reason: 'upscale leve (' + areaRatio.toFixed(2) + 'x): unsharp basta, el denoise borraria detalle' };
  if (areaRatio <= 9) return { id: 'balanced', reason: 'upscale medio (' + areaRatio.toFixed(2) + 'x): denoise + unsharp, el ruido se amplifica' };
  return { id: 'temporal', reason: 'upscale severo (' + areaRatio.toFixed(2) + 'x): atadenoise reduce el ruido que se amplificaria' };
}

function autoCodec(profile, playerId, outW, outH) {
  const caps = PLAYER_CAPS[playerId] || PLAYER_CAPS.generic;
  const notes = [];
  for (const cid of CODEC_LADDER) {
    if (!caps.codecs.includes(cid)) { notes.push(cid + ': el decoder no lo declara'); continue; }
    const c = CODEC_CATALOG[cid];
    // AVC por encima de 1080p no es seguro en decoders Android
    if (c.family === 'avc' && (outW * outH) > 1920 * 1080) { notes.push('avc1: no seguro por encima de 1080p'); continue; }
    if (c.family === 'av1' && !caps.codecs.includes('av01')) { notes.push('av01: el decoder no lo declara'); continue; }
    return { id: cid, reason: 'el mejor que ' + caps.label + ' decodifica para ' + outW + 'x' + outH, skipped: notes };
  }
  return { id: 'avc1', reason: 'ninguno de la escalera sirve; AVC como ultimo recurso', skipped: notes };
}

/* Cadencia optima. Regla: no interpolar si no aporta o si el coste no cabe.
 * Interpolar arriba en 4K+ en este host no se sostiene, y ademas no recupera
 * informacion: se propone conservar la cadencia de la fuente. */
function autoFps(inFps, outW, outH) {
  const px = outW * outH;
  const src = Number(inFps) || 0;
  if (!src) return { outFps: 0, op: 'preserve', reason: 'cadencia de la fuente desconocida: se conserva' };
  if (px > 3840 * 2160) {
    return { outFps: Math.min(src, 30), op: src > 30 ? 'DECIMATE' : 'preserve',
      reason: 'por encima de 4K este host no sostiene mas de 30 fps: se propone ' + Math.min(src, 30) };
  }
  if (src >= 50) return { outFps: src, op: 'preserve', reason: 'la fuente ya trae ' + src + ' fps: no hay que interpolar' };
  if (src <= 25) return { outFps: 0, op: 'preserve', reason: 'fuente a ' + src + ' fps: interpolar aqui no recupera informacion y cuesta caro' };
  return { outFps: 0, op: 'preserve', reason: 'fuente a ' + src + ' fps: se conserva; el contenido no gana por interpolar' };
}

function autoDither(codecId) {
  const c = CODEC_CATALOG[codecId];
  if (c && c.profile === 'main10') return { id: 'error_diffusion', reason: '10 bits: error_diffusion evita banding en gradientes' };
  return { id: 'ordered', reason: '8 bits: ordered es mas rapido y suficiente' };
}

/* El motor completo: devuelve CADA campo con su valor optimo y su razon, mas las
 * combinaciones que NO se pueden sostener. */
function autoConfig(opts) {
  const o = opts || {};
  const inW = Math.max(16, Math.round(Number(o.inW) || 1280));
  const inH = Math.max(16, Math.round(Number(o.inH) || 720));
  const outW = Math.max(16, Math.round(Number(o.outW) || 3840));
  const outH = Math.max(16, Math.round(Number(o.outH) || 2160));
  const inFps = Number(o.inFps) || 0;
  /* MODO: si el operador declara la regla como EMULADA, la resolucion se acepta
   * aunque el decoder no la alcance. No se bloquea: se declara.
   * La regla del operador: "si se puede colocar esa resolucion; hay una pestaña
   * que se debe seleccionar Resolucion Salida emulado/real". */
  const mode = String(o.mode || 'real') === 'emulado' ? 'emulado' : 'real';
  const playerId = String(o.player || 'onn-4k');
  const caps = PLAYER_CAPS[playerId];
  if (!caps) return { ok: false, error: 'player desconocido: ' + playerId };

  const inPx = inW * inH, outPx = outW * outH;
  const areaRatio = outPx / inPx;

  const codec = autoCodec(o.profile, playerId, outW, outH);
  const recipe = autoRecipe(areaRatio);
  const fps = autoFps(inFps, outW, outH);
  const dither = autoDither(codec.id);

  /* Combinaciones IMPOSIBLES: se declaran, no se devuelven como validas. */
  const impossible = [];
  const warnings = [];

  /* El limite del decoder SOLO es bloqueante en modo REAL. En EMULADO se acepta
   * la resolucion y se declara que el device no la decodifica de forma nativa. */
  const exceedsDecoder = (outW > caps.maxW || outH > caps.maxH);
  if (exceedsDecoder) {
    if (mode === 'real') {
      impossible.push('el decoder de ' + caps.label + ' llega a ' + caps.maxW + 'x' + caps.maxH
        + '; ' + outW + 'x' + outH + ' NO se puede decodificar en ese device. '
        + 'Cambia la regla a EMULADO si quieres declararla igual.');
    } else {
      warnings.push('EMULADO: ' + outW + 'x' + outH + ' supera el decoder de ' + caps.label
        + ' (' + caps.maxW + 'x' + caps.maxH + '). Se declara como resolucion emulada; '
        + 'el device recibe lo que puede y la etiqueta NO miente sobre el bitstream.');
    }
  }
  const codecCat = CODEC_CATALOG[codec.id];
  if (codecCat && codecCat.family === 'avc' && outPx > 1920 * 1080) {
    const msg = 'AVC por encima de 1080p no es seguro en decoders Android';
    if (mode === 'real') impossible.push(msg); else warnings.push('EMULADO: ' + msg);
  }
  if (fps.op === 'INTERPOLATE') {
    warnings.push('interpolar ' + inFps + '->' + fps.outFps + ' usa minterpolate: NO recupera informacion y cuesta ~46x tiempo real a 1080p');
  }
  if (areaRatio > 20) {
    warnings.push('upscale de ' + areaRatio.toFixed(1) + 'x: el detalle no existe en la fuente, se interpola');
  }
  // coste estimado en este host
  let hostCost = null;
  if (outPx > 0) {
    const base = outPx / (1920 * 1080);           // coste relativo a 1080p
    const fpsFactor = fps.outFps > 30 ? 1.8 : 1.0;
    const recipeFactor = recipe.id === 'temporal' ? 1.35 : (recipe.id === 'balanced' ? 1.15 : 1.0);
    const est = Number((base * fpsFactor * recipeFactor).toFixed(2));
    hostCost = {
      relative: est,
      // 1.76x es lo medido para 1080p none en este host
      estimatedRatio: Number((1.76 / (est || 1)).toFixed(2)),
      viable: (1.76 / (est || 1)) >= 1.2
    };
  }

  const band = Object.keys(INPUT_BANDS).filter((k) => {
    const b = INPUT_BANDS[k];
    return (inW === b.w && inH === b.h) || (inPx >= b.minPx && inPx <= b.maxPx);
  })[0] || (inW + 'x' + inH);

  return {
    ok: true,
    mode,
    // que significa REAL vs EMULADO, en una linea, para que el panel lo muestre
    modeMeaning: mode === 'real'
      ? 'REAL: se exige que el decoder del device decodifique la resolucion. Si no llega, se bloquea.'
      : 'EMULADO: se declara la resolucion aunque el decoder no la alcance. Se avisa y la etiqueta no miente.',
    exceedsDecoder,
    input: { band, width: inW, height: inH, fps: inFps || null, pixels: inPx },
    output: { width: outW, height: outH, pixels: outPx },
    areaRatio: Number(areaRatio.toFixed(2)),
    // LA CONFIG OPTIMA, campo por campo, con su razon
    fields: {
      codec: { value: codec.id, label: CODEC_CATALOG[codec.id] ? CODEC_CATALOG[codec.id].label : codec.id, reason: codec.reason },
      recipe: { value: recipe.id, reason: recipe.reason },
      outFps: { value: fps.outFps || 'preserve', op: fps.op, reason: fps.reason },
      dither: { value: dither.id, reason: dither.reason }
    },
    // lo que NO se puede
    impossible,
    warnings,
    hostCost,
    // resumen para el boton de la fila
    suggestion: {
      mode,
      input: band, inFps: inFps || null,
      outW, outH, outFps: fps.outFps || null,
      codec: codec.id, recipe: recipe.id, dither: dither.id,
      label: band + (inFps ? '@' + inFps : '') + ' -> ' + outW + 'x' + outH + (fps.outFps ? '@' + fps.outFps : '')
    }
  };
}





/* ═══════════════════════════════════════════════════════════════════════════
 * CASCADA DE CODECS CON SERIALES + FALLBACK ARMABLE
 *
 * Fuente: codec-cascade-actual.csv (13 tiers, Main 10, L3.0 -> L6.2).
 * El SERIAL de un tier es su codec string completo (RFC 6381), que es unico:
 *   hvc1.2.4.L153.B0  ==  Main10 / Level 5.1 / 4096x2160 @ 60
 *
 * GOLDEN RULE del repo que aqui se respeta: `hvc1.*` va en STREAM-INF y
 * `hev1.*` en KODIPROP/EXTVLCOPT. NUNCA cruzados. Cada tier guarda los dos
 * seriales y se elige el que corresponde al destino.
 *
 * FALLBACK: si el decoder del player no soporta el tier elegido, se baja por la
 * cascada hasta el primero que SI cabe. Cada salto se declara con su motivo. Un
 * fallback silencioso es una degradacion invisible; aqui se ve.
 * ═══════════════════════════════════════════════════════════════════════════ */

const CODEC_CASCADE = [
  { tier: 1,  hvc1: 'hvc1.2.4.L186.B0', hev1: 'hev1.2.4.L186.B0', profile: 'Main 10', level: '6.2', maxW: 8192, maxH: 4320, maxFps: 120, role: 'CORONA ABSOLUTA - 8K@120 HDR' },
  { tier: 2,  hvc1: 'hvc1.2.4.L183.B0', hev1: 'hev1.2.4.L183.B0', profile: 'Main 10', level: '6.1', maxW: 8192, maxH: 4320, maxFps: 60,  role: '8K@60 HDR' },
  { tier: 3,  hvc1: 'hvc1.2.4.L180.B0', hev1: 'hev1.2.4.L180.B0', profile: 'Main 10', level: '6',   maxW: 8192, maxH: 4320, maxFps: 30,  role: '8K@30 HDR' },
  { tier: 4,  hvc1: 'hvc1.2.4.L156.B0', hev1: 'hev1.2.4.L156.B0', profile: 'Main 10', level: '5.2', maxW: 4096, maxH: 2160, maxFps: 120, role: '4K@120 HDR' },
  { tier: 5,  hvc1: 'hvc1.2.4.L153.B0', hev1: 'hev1.2.4.L153.B0', profile: 'Main 10', level: '5.1', maxW: 4096, maxH: 2160, maxFps: 60,  role: '4K@60 HDR' },
  { tier: 6,  hvc1: 'hvc1.2.4.L150.B0', hev1: 'hev1.2.4.L150.B0', profile: 'Main 10', level: '5',   maxW: 4096, maxH: 2160, maxFps: 30,  role: '4K@30 HDR' },
  { tier: 7,  hvc1: 'hvc1.2.4.L123.B0', hev1: 'hev1.2.4.L123.B0', profile: 'Main 10', level: '4.1', maxW: 2048, maxH: 1080, maxFps: 60,  role: '1080p@60 HDR' },
  { tier: 8,  hvc1: 'hvc1.2.4.L123.B0', hev1: 'hev1.2.4.L123.B0', profile: 'Main 10', level: '4.1', maxW: 1920, maxH: 1080, maxFps: 50,  role: '1080p@50 HDR broadcast EU' },
  { tier: 9,  hvc1: 'hvc1.2.4.L120.B0', hev1: 'hev1.2.4.L120.B0', profile: 'Main 10', level: '4',   maxW: 2048, maxH: 1080, maxFps: 30,  role: '1080p@30 10-bit' },
  { tier: 10, hvc1: 'hvc1.2.4.L93.B0',  hev1: 'hev1.2.4.L93.B0',  profile: 'Main 10', level: '3.1', maxW: 1280, maxH: 720,  maxFps: 60,  role: '720p@60 HDR alto framerate' },
  { tier: 11, hvc1: 'hvc1.2.4.L93.B0',  hev1: 'hev1.2.4.L93.B0',  profile: 'Main 10', level: '3.1', maxW: 1280, maxH: 720,  maxFps: 34,  role: '720p HDR 10-bit' },
  { tier: 12, hvc1: 'hvc1.2.4.L90.B0',  hev1: 'hev1.2.4.L90.B0',  profile: 'Main 10', level: '3',   maxW: 854,  maxH: 480,  maxFps: 30,  role: '480p HDR (16:9 SD-wide)' },
  { tier: 13, hvc1: 'hvc1.2.4.L90.B0',  hev1: 'hev1.2.4.L90.B0',  profile: 'Main 10', level: '3',   maxW: 720,  maxH: 480,  maxFps: 30,  role: '480p HDR (NTSC 4:3)' }
];

function cascadeByTier(t) { return CODEC_CASCADE.filter((c) => c.tier === Number(t))[0] || null; }
function cascadeBySerial(s) { return CODEC_CASCADE.filter((c) => c.hvc1 === String(s) || c.hev1 === String(s))[0] || null; }

/* Elige el serial segun el destino. GOLDEN RULE: hvc1 en STREAM-INF,
 * hev1 en KODIPROP/EXTVLCOPT. Nunca cruzados. */
function serialFor(tier, where) {
  const c = cascadeByTier(tier);
  if (!c) return null;
  return where === 'kodiprop' || where === 'extvlcopt' ? c.hev1 : c.hvc1;
}

/* ── FALLBACK ARMABLE ──────────────────────────────────────────────────────
 * Dada una lista de tiers pedida (o un serial), un player y un target, baja por
 * la cascada hasta el primer tier que el decoder soporta Y que cubre el target.
 * Devuelve la traza COMPLETA: cada tier con su veredicto y su motivo.
 */
function resolveFallback(opts) {
  const o = opts || {};
  const playerId = String(o.player || 'onn-4k');
  const caps = PLAYER_CAPS[playerId];
  if (!caps) return { ok: false, error: 'player desconocido: ' + playerId };

  const targetId = String(o.target || 'UHD_4K');
  const target = OUTPUT_TARGETS[targetId];
  if (!target) return { ok: false, error: 'target desconocido: ' + targetId };

  const fps = Number(o.fps) || 25;

  /* Cadena pedida: o un tier concreto, o una lista custom del operador, o la
   * cascada entera como fallback por defecto. */
  /* La cadena que se recorre.
   *
   * Si el operador da una LISTA explicita, se respeta al pie de la letra: es SU
   * fallback armado a mano.
   *
   * Si da un TIER o un SERIAL suelto, la cadena es ESE tier y TODOS los
   * siguientes de la cascada: pedir el tier 1 (8K) y no poder no debe terminar en
   * AVC, debe bajar al mejor que si cabe. Medido: antes devolvia AVC porque la
   * cadena era [1] y no habia a donde bajar. */
  let chain = [];
  if (Array.isArray(o.tiers) && o.tiers.length) {
    chain = o.tiers.map(Number).filter((t) => cascadeByTier(t));
  } else {
    let start = null;
    if (o.tier != null) start = Number(o.tier);
    else if (o.serial) { const c = cascadeBySerial(o.serial); start = c ? c.tier : null; }
    if (start != null && cascadeByTier(start)) {
      chain = CODEC_CASCADE.filter((c) => c.tier >= start).map((c) => c.tier);
    }
  }
  if (!chain.length) {
    /* SIN tier explicito: se recorre de MAS AJUSTADO a MAS HOLGADO, no al reves.
     *
     * Medido: recorriendo la cascada de arriba abajo, un target de 1080p elegia el
     * tier 1 y declaraba hvc1.2.4.L186.B0 (nivel 6.2, 8K@120) para un video de
     * 1080p. Eso es sobre-declarar el nivel y viola la Ley Cardinal 1 (nunca por
     * debajo, pero tampoco muy por encima: el decoder reserva de mas y puede
     * rechazar).
     *
     * El orden correcto es por AREA del tier ascendente: el primero que cubra el
     * target sera el mas ajustado que sirve. */
    chain = CODEC_CASCADE.slice()
      .sort((x, y) => {
        const ax = x.maxW * x.maxH, ay = y.maxW * y.maxH;
        if (ax !== ay) return ax - ay;      // primero el area mas ajustada
        return x.maxFps - y.maxFps;         // a igual area, la cadencia mas baja
      })
      .map((c) => c.tier);
  }

  // el player solo decodifica HEVC si lo declara
  const playerHevc = caps.codecs.some((c) => c === 'hvc1' || c === 'hvc1_8');

  const trace = [];
  let chosen = null;

  for (const t of chain) {
    const c = cascadeByTier(t);
    if (!c) continue;
    const diag = { tier: c.tier, serial: c.hvc1, level: c.level, role: c.role, verdict: null, reason: null };

    // 1. el player tiene decoder HEVC?
    if (!playerHevc) {
      diag.verdict = 'SKIP';
      diag.reason = caps.label + ' no declara decoder HEVC (codecs: ' + caps.codecs.join(',') + ')';
      trace.push(diag); continue;
    }
    // 2. el nivel cubre el target?
    if (c.maxW < target.w || c.maxH < target.h) {
      diag.verdict = 'SKIP';
      diag.reason = 'tier ' + c.tier + ' llega a ' + c.maxW + 'x' + c.maxH + ', el target es ' + target.w + 'x' + target.h;
      trace.push(diag); continue;
    }
    /* 3. el DECODER cubre el TARGET.
     *
     * El error anterior comparaba el maximo del TIER con el maximo del DECODER:
     *   tier 5 llega a 4096x2160, Shield limita a 3840x2160 -> SKIP
     * Eso es falso: un tier que alcanza 4096x2160 PUEDE producir 3840x2160, que
     * es menor. Medido: con esa regla el Shield y el Firestick 4K Max NUNCA
     * podian usar 4K, caian a AVC siempre.
     *
     * Lo correcto: lo que importa es la resolucion REAL de salida (el target).
     * El decoder debe cubrir el target, y el tier debe cubrirlo tambien (punto 2). */
    if (target.w > caps.maxW || target.h > caps.maxH) {
      diag.verdict = 'SKIP';
      diag.reason = 'el target ' + target.w + 'x' + target.h + ' supera el decoder de '
        + caps.label + ' (' + caps.maxW + 'x' + caps.maxH + ')';
      trace.push(diag); continue;
    }
    /* 4. fps: manda el MENOR entre lo que aguanta el tier y lo que aguanta el
     * decoder del player. El ONN declara 4K@60; un tier de 4K@120 no sirve ahi
     * aunque su nivel lo permita. */
    const effFps = Math.min(c.maxFps, caps.maxFps4K > 0 ? caps.maxFps4K : c.maxFps);
    if (effFps < fps) {
      diag.verdict = 'SKIP';
      diag.reason = 'tier ' + c.tier + ' y ' + caps.label + ' aguantan ' + effFps
        + ' fps como maximo, se piden ' + fps;
      trace.push(diag); continue;
    }
    // 5. HDR pide Main10 (todos los tiers lo son) y el player debe soportarlo
    if (target.hdr && !caps.main10) {
      diag.verdict = 'SKIP';
      diag.reason = caps.label + ' no tiene Main10: no puede sostener HDR';
      trace.push(diag); continue;
    }

    diag.verdict = 'USADO';
    diag.reason = 'primer tier que el decoder acepta y que cubre ' + target.w + 'x' + target.h + ' @ ' + fps + 'fps';
    trace.push(diag);
    chosen = c;
    break;
  }

  // si ninguno sirve: AVC seguro a 1080p como ultimo recurso, declarado
  if (!chosen) {
    return {
      ok: true,
      player: { id: playerId, label: caps.label, maxW: caps.maxW, maxH: caps.maxH },
      target: { id: targetId, label: target.label, w: target.w, h: target.h, hdr: target.hdr },
      fps,
      chosen: null,
      fallbackToAvc: {
        serial: 'avc1.640028',
        reason: 'ningun tier de la cascada cabe en ' + caps.label + '; se declara AVC High 1080p como ultimo recurso',
        safe: true
      },
      trace,
      impossible: ['ningun tier HEVC de los ' + CODEC_CASCADE.length + ' sirve para este player+target']
    };
  }

  return {
    ok: true,
    player: { id: playerId, label: caps.label, maxW: caps.maxW, maxH: caps.maxH },
    target: { id: targetId, label: target.label, w: target.w, h: target.h, hdr: target.hdr },
    fps,
    chosen: {
      tier: chosen.tier,
      serial: chosen.hvc1,
      serialKodiprop: chosen.hev1,
      level: chosen.level,
      role: chosen.role,
      profile: chosen.profile
    },
    // cuantos se saltaron y por que (contados sobre la traza real)
    skipped: trace.filter((t) => t.verdict === 'SKIP').length,
    chainLength: trace.length,
    trace,
    // la cadena que el operador puede armar a mano, ya resuelta
    chainResolved: trace.map((t) => t.tier + ':' + t.verdict),
    impossible: []
  };
}



/* ═══════════════════════════════════════════════════════════════════════════
 * CATALOGO DE SALIDAS, CODECS Y PLAYERS + MOTOR DE DECLARACION
 *
 * El operador elige PERFIL + ENTRADA + TARGET (con etiqueta comercial) + CODEC +
 * PLAYER. El motor rellena lo que falte con la mejor alternativa posible Y
 * declara lo que NO puede cumplirse, en vez de fingir que si.
 *
 * Verdad medida que manda (no se inventa nada):
 *   - ONN 4K (Amlogic s4): decoder c2.amlogic.hevc.decoder max="4096x4096".
 *     5760x3240 y 7680x4320 NO caben ahi. Se declara el fallback.
 *   - Firestick Lite: solo AVC, sin Main10, sin HDR.
 *   - El codec cambia la cadena de filtros y el preset, no solo el string.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Salidas con su etiqueta COMERCIAL. El id es el que viaja; el label es lo que
 * ve el operador en el desplegable. */
const OUTPUT_TARGETS = {
  'SD_480':     { label: '480p SD',        w: 854,  h: 480,  hdr: false, tier: 'SD' },
  'HD_720':     { label: '720p HD',        w: 1280, h: 720,  hdr: false, tier: 'HD' },
  'FHD_1080':   { label: '1080p FHD SDR',  w: 1920, h: 1080, hdr: false, tier: 'FHD' },
  'FHD_HDR':    { label: '1080p FHD HDR',  w: 1920, h: 1080, hdr: true,  tier: 'FHD' },
  'DCI_2K':     { label: '2K DCI (2048)',  w: 2048, h: 1080, hdr: false, tier: '2K' },
  'QHD_1440':   { label: '2K QHD SDR',     w: 2560, h: 1440, hdr: false, tier: 'QHD' },
  'QHD_HDR':    { label: '2K QHD HDR',     w: 2560, h: 1440, hdr: true,  tier: 'QHD' },
  'UHD_4K':     { label: '4K UHD SDR',     w: 3840, h: 2160, hdr: false, tier: 'UHD' },
  'UHD_4K_HDR': { label: '4K UHD HDR',     w: 3840, h: 2160, hdr: true,  tier: 'UHD' },
  'DCI_4K':     { label: '4K DCI (4096)',  w: 4096, h: 2160, hdr: false, tier: 'UHD' },
  'K6_3240':    { label: '6K UHD SDR',     w: 5760, h: 3240, hdr: false, tier: '6K' },
  'K6_PQ':      { label: '6K UHD PQ',      w: 5760, h: 3240, hdr: true,  tier: '6K' },
  'K8_4320':    { label: '8K UHD',         w: 7680, h: 4320, hdr: false, tier: '8K' }
};

/* Codecs con lo que REALMENTE cambia: perfil, nivel, preset y filtros posibles. */
const CODEC_CATALOG = {
  hvc1: {
    label: 'HEVC / H.265 Main10',
    family: 'hevc',
    rfc: 'hvc1',
    profile: 'main10',
    pixFmt: 'yuv420p10le',
    encoder: 'libx265',
    preset: 'ultrafast',
    // HEVC 10-bit permite cadenas con zscale y nlmeans sin salir de rango
    maxFpsAt4K: 25,
    notes: 'Main10 10-bit. El unico que sostiene HDR/PQ con coherencia.'
  },
  hvc1_8: {
    label: 'HEVC / H.265 Main (8-bit)',
    family: 'hevc',
    rfc: 'hvc1',
    profile: 'main',
    pixFmt: 'yuv420p',
    encoder: 'libx265',
    preset: 'ultrafast',
    maxFpsAt4K: 25,
    notes: 'Main 8-bit. Menos banda que Main10, pierde gradiente en HDR.'
  },
  avc1: {
    label: 'AVC / H.264 High',
    family: 'avc',
    rfc: 'avc1',
    profile: 'high',
    pixFmt: 'yuv420p',
    encoder: 'libx264',
    preset: 'ultrafast',
    maxFpsAt4K: 0,
    notes: 'H.264 High 8-bit. NO soporta 4K en la mayoria de decoders Android; solo hasta 1080p seguro.'
  },
  av01: {
    label: 'AV1 Main10',
    family: 'av1',
    rfc: 'av01',
    profile: 'main10',
    pixFmt: 'yuv420p10le',
    encoder: 'libsvtav1',
    preset: '12',
    maxFpsAt4K: 0,
    notes: 'AV1 10-bit. Mejor eficiencia, pero no todos los players lo decodifican.'
  }
};

/* Capacidades por PLAYER, con la evidencia de donde sale cada limite. */
const PLAYER_CAPS = {
  'onn-4k': {
    label: 'ONN 4K (Amlogic s4)',
    maxW: 4096, maxH: 4096,
    codecs: ['hvc1', 'hvc1_8', 'avc1'],
    hdr: true, main10: true, maxFps4K: 60,
    evidence: 'c2.amlogic.hevc.decoder max="4096x4096" medido por dumpsys en este device'
  },
  'firestick-4k-max': {
    label: 'Fire TV Stick 4K Max (MT8696)',
    maxW: 3840, maxH: 2160,
    codecs: ['hvc1', 'hvc1_8', 'avc1', 'av01'],
    hdr: true, main10: true, maxFps4K: 60,
    evidence: 'specs MT8696: 4K60 decode HEVC/AV1/VP9'
  },
  'firestick-lite': {
    label: 'Fire TV Stick Lite',
    maxW: 1920, maxH: 1080,
    codecs: ['avc1'],
    hdr: false, main10: false, maxFps4K: 0,
    evidence: 'solo H.264; sin HEVC ni HDR. Limita a 1080p AVC'
  },
  'shield-tv': {
    label: 'NVIDIA Shield TV',
    maxW: 3840, maxH: 2160,
    codecs: ['hvc1', 'hvc1_8', 'avc1', 'av01'],
    hdr: true, main10: true, maxFps4K: 60,
    evidence: 'Tegra X1+: 4K60 HEVC Main10 + HDR10'
  },
  generic: {
    label: 'Generico / desconocido',
    maxW: 1920, maxH: 1080,
    codecs: ['hvc1', 'avc1'],
    hdr: false, main10: true, maxFps4K: 0,
    evidence: 'sin evidencia del device: se asume el minimo seguro 1080p'
  }
};

/* Nivel HEVC segun resolucion (Ley Cardinal 1 del repo: nunca por debajo). */
function hevcLevelFor(w, h) {
  const px = w * h;
  if (px <= 854 * 480) return 90;    // L3.0
  if (px <= 1280 * 720) return 93;   // L3.1
  if (px <= 1920 * 1080) return 120; // L4.0
  if (px <= 2560 * 1440) return 150; // L5.0
  if (px <= 3840 * 2160) return 153; // L5.1
  if (px <= 4096 * 2160) return 156; // L5.2
  return 180;                        // L6.0+ (6K/8K)
}

function codecStringFor(codecId, w, h, fps) {
  const c = CODEC_CATALOG[codecId];
  if (!c) return null;
  if (c.family === 'hevc') {
    const idc = c.profile === 'main10' ? 2 : 1;
    const compat = c.profile === 'main10' ? 4 : 6;
    const lvl = Math.max(hevcLevelFor(w, h), Number(fps) > 30 ? hevcLevelFor(w, h) : hevcLevelFor(w, h));
    return 'hvc1.' + idc + '.' + compat + '.L' + lvl + '.B0';
  }
  if (c.family === 'avc') {
    // High profile, nivel por resolucion
    const lvlHex = (w * h) > 1280 * 720 ? '28' : '1f';
    return 'avc1.6400' + lvlHex;
  }
  if (c.family === 'av1') {
    return 'av01.0.08M.10';
  }
  return null;
}

/* Recetas con sus parametros, PRESELECCIONADAS. El operador puede cambiarlas. */
const RECIPE_PRESETS = {
  none:     { label: 'Sin filtros (remux/copy)', chain: '', params: {} },
  light:    { label: 'Light — realce leve', chain: 'unsharp=5:5:0.15:5:5:0',
              params: { unsharp_amount: 0.15, unsharp_msize: 5 } },
  balanced: { label: 'Balanced — denoise + realce',
              chain: 'hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0',
              params: { hq_ls: 0.6, hq_cs: 0.45, hq_lt: 0.9, hq_ct: 0.7, unsharp_amount: 0.2, unsharp_msize: 5 } },
  temporal: { label: 'Temporal — atadenoise + realce',
              chain: 'atadenoise=0a=0.01:0b=0.02:1a=0.015:1b=0.03:2a=0.015:2b=0.03:s=5,unsharp=5:5:0.2:5:5:0',
              params: { at_s: 5, unsharp_amount: 0.2, unsharp_msize: 5 } },
  custom:   { label: 'Custom — libre', chain: '', params: {} }
};

/* ── MOTOR DE DECLARACION ──────────────────────────────────────────────────
 * Dada la seleccion del operador, devuelve el perfil COMPLETO resuelto, con
 * todo lo que falte relleno y una lista explicita de lo que NO se puede cumplir.
 */
function declareProfile(opts) {
  const o = opts || {};
  const profileId = String(o.profile || 'P4.5');
  if (!profileMatrix[profileId]) {
    return { ok: false, error: 'perfil inexistente: ' + profileId };
  }

  const input = o.input || {};
  const inW = Math.max(16, Math.round(Number(input.width) || 1280));
  const inH = Math.max(16, Math.round(Number(input.height) || 720));

  const playerId = String(o.player || 'onn-4k');
  const caps = PLAYER_CAPS[playerId];
  if (!caps) return { ok: false, error: 'player desconocido: ' + playerId };

  const codecId = String(o.codec || 'hvc1');
  const codec = CODEC_CATALOG[codecId];
  if (!codec) return { ok: false, error: 'codec desconocido: ' + codecId };

  const recipeId = String(o.recipe || 'balanced');
  const recipe = RECIPE_PRESETS[recipeId];
  if (!recipe) return { ok: false, error: 'receta desconocida: ' + recipeId };

  /* TARGET: si el operador lo da, manda. Si no, se toma el del perfil en la
   * matriz. Y si el decoder del player no lo soporta, se declara el fallback. */
  let targetId = String(o.target || '');
  let target = targetId ? OUTPUT_TARGETS[targetId] : null;
  const declared = [];
  const impossible = [];

  if (!target) {
    const row = profileMatrix[profileId];
    target = { label: row.label, w: row.outW, h: row.outH, hdr: false, tier: '?' };
    targetId = 'matrix:' + profileId;
  }

  let outW = target.w, outH = target.h;
  let downgraded = null;

  // el decoder del player es un limite DURO
  if (outW > caps.maxW || outH > caps.maxH) {
    const fits = Object.entries(OUTPUT_TARGETS)
      .filter(([, t]) => t.w <= caps.maxW && t.h <= caps.maxH)
      .sort((a, b) => (b[1].w * b[1].h) - (a[1].w * a[1].h))[0];
    if (fits) {
      downgraded = { from: outW + 'x' + outH, to: fits[1].w + 'x' + fits[1].h, targetId: fits[0],
        reason: 'decoder de ' + caps.label + ' limita a ' + caps.maxW + 'x' + caps.maxH };
      outW = fits[1].w; outH = fits[1].h; targetId = fits[0]; target = fits[1];
    } else {
      impossible.push('ningun target del catalogo cabe en ' + caps.label);
    }
  }

  // codec soportado por el player
  let effCodecId = codecId;
  if (!caps.codecs.includes(codecId)) {
    const alt = caps.codecs[0];
    impossible.push('codec ' + codecId + ' no soportado por ' + caps.label + '; se declara ' + alt);
    effCodecId = alt;
  }
  const effCodec = CODEC_CATALOG[effCodecId];

  // 4K con AVC no es seguro
  if (effCodec.family === 'avc' && (outW * outH) > 1920 * 1080) {
    impossible.push('AVC por encima de 1080p no es seguro en decoders Android; usar HEVC');
  }
  // HDR pide Main10
  if (target.hdr && !caps.main10) {
    impossible.push('HDR pedido pero ' + caps.label + ' no tiene Main10: la salida sera SDR');
  }
  if (target.hdr && effCodec.profile !== 'main10') {
    impossible.push('HDR con perfil ' + effCodec.profile + ': incoherente, se pierde el rango');
  }

  const fps = Number(o.fps) || (o.fps === 'preserve' ? 25 : 25);

  // cadena de filtros: receta + escalado resuelto por el motor existente
  const plan = computePlan(profileId, { width: inW, height: inH, dar: input.dar });
  const chainParts = [];
  if (recipe.chain) chainParts.push(recipe.chain);
  if (plan.ok) {
    /* La cadena del plan trae format=yuv420p10le porque asume HEVC Main10.
     * Con AVC (8 bits) eso es incoherente: se declara yuv420p en el codec y se
     * fuerza 10-bit en los pixeles. Medido en el caso '4K en AVC'.
     * Se reescribe el format al pixFmt REAL del codec elegido. */
    const scalePart = 'scale=' + outW + ':' + outH + ':flags=' + profileMatrix[profileId].flags;
    const pix = effCodec.pixFmt;
    const planChain = plan.filter.split(',').map((x) => {
      if (x.startsWith('scale=')) return scalePart;
      if (x.startsWith('format=')) return 'format=' + pix;
      return x;
    });
    chainParts.length = 0;
    if (recipe.chain) chainParts.push(recipe.chain);
    chainParts.push(planChain.join(','));
  }
  const fullChain = chainParts.join(',');

  const codecStr = codecStringFor(effCodecId, outW, outH, fps);
  const areaRatio = Number(((outW * outH) / (inW * inH)).toFixed(2));
  const relCost = Number((((outW * outH) / (1920 * 1080)) * (outW * outH > inW * inH ? 1.35 : 1) * (fps > 30 ? 1.8 : 1)).toFixed(2));

  // viabilidad en ESTE host segun la capacidad medida
  let hostViable = null;
  const rows = (IMAGE_MEASURED_CAPACITY && IMAGE_MEASURED_CAPACITY.rows) || [];
  const match = rows.find((r) => String(r.target).indexOf(String(outW)) === 0 || (r.target === 'UHD_4K' && outW >= 3840));
  if (match) hostViable = { ratio: match.realtime_ratio, viable: match.realtime_ratio >= 1.2, source: 'medido en este host' };
  else hostViable = { ratio: null, viable: null, source: 'NO COMPUTADO: no hay medicion para esta resolucion' };

  return {
    ok: true,
    profile: profileId,
    declared: {
      input: { width: inW, height: inH, pixels: inW * inH },
      target: { id: targetId, label: target.label, width: outW, height: outH, hdr: !!target.hdr, tier: target.tier },
      player: { id: playerId, label: caps.label, evidence: caps.evidence },
      codec: { id: effCodecId, label: effCodec.label, rfc: codecStr, profile: effCodec.profile,
               encoder: effCodec.encoder, preset: effCodec.preset, pixFmt: effCodec.pixFmt },
      recipe: { id: recipeId, label: recipe.label, params: recipe.params },
      fps,
      filter: fullChain,
      scalePlan: plan.ok ? {
        scaled: plan.scaled, pad: plan.pad, mode: plan.mode, flags: plan.flags
      } : null,
      metrics: { areaRatio, relativeCost: relCost, upscale: outW * outH > inW * inH },
      hostViable,
      // lo que NO se cumple, explicito
      impossible,
      // lo que se ajusto respecto a lo pedido
      downgraded,
      // declaracion final legible
      declaration: 'PERFIL ' + profileId + ' | ENTRADA ' + inW + 'x' + inH + ' -> SALIDA ' + outW + 'x' + outH
        + ' (' + target.label + ') | CODEC ' + codecStr + ' | RECETA ' + recipeId
        + ' | PLAYER ' + caps.label + ' | ' + fps + ' fps'
    }
  };
}



/* Mapeo motor -> caps del player que lo ejecuta. Sirve para que la lista
 * gobernada NO entregue un perfil que ese device no puede decodificar.
 *
 * MEDIDO en el tablero: el default estaba en P4.5 (5760x3240 = 6K) y NINGUN
 * player del catalogo decodifica 6K (ONN 4096, Firestick/Shield 3840, Lite 1920).
 * Una lista gobernada con P4.5 daba pantalla negra en todos. */
const ENGINE_PLAYER = {
  vlc: 'generic', kodi: 'generic', tivimate: 'generic',
  ott: 'onn-4k', apk: 'onn-4k'
};

/* CONSULTA, no decision.
 *
 * Devuelve el mejor perfil de la matriz que ese decoder soporta. Sirve para que
 * el OPERADOR decida con el dato a la vista, NO para que el motor sustituya su
 * eleccion.
 *
 * Antes esta funcion reescribia el perfil en la lista gobernada. Eso convertia
 * una advertencia en una degradacion automatica y violaba dos leyes del repo:
 *   - ANTI-DEGRADACION: prohibido bajar 6K/4K para "que funcione".
 *   - Regla de oro 6 de ape-image-pipeline-truth: no degradar resolucion,
 *     codec, HDR, fps ni bitrate.
 * El perfil es del operador. El decoder es un aviso que se declara. */
function bestProfileForEngine(engine) {
  const pid = ENGINE_PLAYER[engine] || 'generic';
  const caps = PLAYER_CAPS[pid] || PLAYER_CAPS.generic;
  const ids = Object.keys(profileMatrix)
    .map((k) => ({ k, w: profileMatrix[k].outW, h: profileMatrix[k].outH }))
    .sort((x, y) => (y.w * y.h) - (x.w * x.h));
  for (const it of ids) {
    if (it.w <= caps.maxW && it.h <= caps.maxH) return { profile: it.k, player: pid, caps };
  }
  return { profile: 'P3', player: pid, caps };
}

function profileForChannel(id) {
  const ch = String(id);
  const row = governance.channels && governance.channels[ch];
  const p = (row && row.profile) || governance.defaultProfile;
  return profileMatrix[p] ? p : 'P4.5';
}

/* Directivas que SI se pueden emitir, por motor. Se derivan de PLAYER_ENGINES:
 * nada que el motor ignore llega a la lista. */
function engineDirectives(engine, profile) {
  const p = profileMatrix[profile] || profileMatrix['P4.5'];
  const out = [];
  out.push('#EXT-X-APE-PROFILE:' + profile);
  out.push('#EXT-X-APE-TARGET:' + p.outW + 'x' + p.outH + ';MODE=' + p.scaleMode + ';DITHER=' + p.dither);
  // declaracion honesta del responsable del procesamiento
  out.push('#EXT-X-APE-PROCESSING:DOMAIN=vps_jit;PLAYER_FILTERS=0;REASON=video-filter-es-inerte-en-playlist');
  if (engine === 'vlc' || engine === 'kodi' || engine === 'ott') {
    // network-caching SI lo lee VLC (medido); el resto no se emite
    out.push('#EXTVLCOPT:network-caching=3000');
    out.push('#EXTVLCOPT:clock-jitter=0');
  }
  if (engine === 'kodi') {
    out.push('#KODIPROP:inputstream.adaptive.stream_selection_type=manual-osd');
  }
  return out;
}

/* Genera la lista M3U8 de gobierno. Cada canal apunta a /jit/go/{id} con su
 * perfil; el JIT resuelve a la ejecucion con esa matriz aplicada. */
function buildGovernedLineup(opts) {
  const o = opts || {};
  const engine = String(o.engine || 'ott');
  const base = String(o.base || 'https://iptv-ape.duckdns.org');
  const map = loadMap();
  const ids = Object.keys(map).filter((id) => map[id] && map[id].url);
  /* EL PERFIL ES DEL OPERADOR. Se usa governance.defaultProfile (o el override
   * del canal) tal cual. El decoder del device se consulta solo para DECLARAR
   * si no puede; nunca para cambiar lo que el operador eligio. */
  const engineBest = bestProfileForEngine(engine);
  /* Se cuenta ANTES de construir la cabecera, que ya usa `exceeds`. Tener el
   * `let` despues del array es TDZ: ReferenceError en la primera peticion y 502. */
  let exceeds = 0;
  for (const id0 of ids) {
    const ov0 = governance.channels && governance.channels[id0];
    const p0 = profileMatrix[(ov0 && ov0.profile && profileMatrix[ov0.profile]) ? ov0.profile : governance.defaultProfile] || {};
    if (p0.outW > engineBest.caps.maxW || p0.outH > engineBest.caps.maxH) exceeds++;
  }
  const lines = [
    '#EXTM3U',
    '#EXT-X-APE-GOVERNANCE:VERSION=1;DEFAULT_PROFILE=' + governance.defaultProfile +
      ';ENGINE=' + engine + ';PLAYER=' + engineBest.player +
      ';DECODER_MAX=' + engineBest.caps.maxW + 'x' + engineBest.caps.maxH +
      ';BEST_FOR_DECODER=' + engineBest.profile +
      ';EXCEEDS_DECODER=' + exceeds + ';CHANNELS=' + ids.length,
    '#EXT-X-APE-ENGINE:' + engine + ';READS=' + PLAYER_ENGINES[engine].reads.join('|') +
      ';IGNORES=' + PLAYER_ENGINES[engine].ignores.join('|')
  ];
  let emitted = 0;
  for (const id of ids) {
    const ov = governance.channels && governance.channels[id];
    const prof = (ov && ov.profile && profileMatrix[ov.profile]) ? ov.profile : governance.defaultProfile;
    const prow = profileMatrix[prof] || {};
    const over = (prow.outW > engineBest.caps.maxW || prow.outH > engineBest.caps.maxH);
    const ch = map[id];
    const name = (ch && ch.name) ? String(ch.name).replace(/[,]/g, ' ') : ('Canal ' + id);
    const grp = (ch && ch.group) ? String(ch.group).replace(/[,]/g, ' ') : 'APE';
    lines.push('#EXTINF:-1 tvg-id="' + id + '" tvg-chno="' + id + '" group-title="' + grp + '",' + name);
    for (const d of engineDirectives(engine, prof)) lines.push(d);
    if (over) {
      // ADVERTENCIA explicita: el perfil pedido supera el decoder. Se entrega
      // igual (es la eleccion del operador) y se declara el riesgo.
      lines.push('#EXT-X-APE-WARNING:PROFILE_EXCEEDS_DECODER;PROFILE=' + prof
        + ';NEEDS=' + (prow.outW || 0) + 'x' + (prow.outH || 0)
        + ';DECODER_MAX=' + engineBest.caps.maxW + 'x' + engineBest.caps.maxH
        + ';SUGGESTED=' + engineBest.profile
        + ';ACTION=keep_operator_choice');
    }
    lines.push(base + '/jit/go/' + encodeURIComponent(id) + '?p=' + encodeURIComponent(prof) + '&e=' + encodeURIComponent(engine));
    lines.push('');
    emitted++;
  }
  return { text: lines.join('\n'), emitted, engine, ids };
}



const IMAGE_TARGETS = {
  source: null,
  FHD_1080: { w: 1920, h: 1080 },
  QHD_1440: { w: 2560, h: 1440 },
  UHD_4K:   { w: 3840, h: 2160 },
  DCI_2K:   { w: 2048, h: 1080 }
};

let imageConfig = JSON.parse(JSON.stringify(IMAGE_DEFAULTS));
let imageConfigSource = 'defaults';

function loadImageConfig() {
  try {
    if (fs.existsSync(IMAGE_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(IMAGE_CONFIG_FILE, 'utf8'));
      imageConfig = Object.assign({}, IMAGE_DEFAULTS, raw);
      imageConfigSource = IMAGE_CONFIG_FILE;
      log('IMAGE_CONFIG_LOADED', IMAGE_CONFIG_FILE);
    }
  } catch (e) {
    log('IMAGE_CONFIG_LOAD_FAILED', e.message, '-> usando defaults');
    imageConfig = JSON.parse(JSON.stringify(IMAGE_DEFAULTS));
    imageConfigSource = 'defaults';
  }
}

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
function pick(v, allowed, fallback) {
  return allowed.includes(String(v)) ? String(v) : fallback;
}

/* Valida y normaliza una config recibida. Devuelve {ok, config, errors[]}. */
function normalizeImageConfig(patch) {
  const errors = [];
  const c = Object.assign({}, imageConfig);
  const p = patch || {};

  if (p.target !== undefined) {
    c.target = pick(p.target, IMAGE_LIMITS.targets, c.target);
    if (c.target !== String(p.target)) errors.push('target invalido: ' + p.target);
  }
  if (p.recipe !== undefined) {
    c.recipe = pick(p.recipe, IMAGE_LIMITS.recipes, c.recipe);
    if (c.recipe !== String(p.recipe)) errors.push('recipe invalida: ' + p.recipe);
  }
  if (p.codec !== undefined) {
    c.codec = pick(p.codec, IMAGE_LIMITS.codecs, c.codec);
    if (c.codec !== String(p.codec)) errors.push('codec invalido: ' + p.codec);
  }
  if (p.preset !== undefined) {
    c.preset = pick(p.preset, IMAGE_LIMITS.presets, c.preset);
    if (c.preset !== String(p.preset)) errors.push('preset invalido: ' + p.preset);
  }
  if (p.fps !== undefined) {
    c.fps = pick(p.fps, IMAGE_LIMITS.fps, c.fps);
    if (c.fps !== String(p.fps)) errors.push('fps invalido: ' + p.fps);
  }
  if (p.audio !== undefined) {
    c.audio = pick(p.audio, IMAGE_LIMITS.audio, c.audio);
    if (c.audio !== String(p.audio)) errors.push('audio invalido: ' + p.audio);
  }

  if (p.crf !== undefined) c.crf = clampInt(p.crf, 0, 51, c.crf);
  if (p.seg_duration !== undefined) c.seg_duration = clampInt(p.seg_duration, 1, 10, c.seg_duration);
  if (p.frag_duration !== undefined) c.frag_duration = clampInt(p.frag_duration, 1, 10, c.frag_duration);
  if (p.window_size !== undefined) c.window_size = clampInt(p.window_size, 3, 120, c.window_size);
  if (p.extra_window_size !== undefined) c.extra_window_size = clampInt(p.extra_window_size, 0, 60, c.extra_window_size);
  if (p.gop_seconds !== undefined) c.gop_seconds = clampInt(p.gop_seconds, 1, 10, c.gop_seconds);
  if (p.x265_threads !== undefined) c.x265_threads = clampInt(p.x265_threads, 1, 8, c.x265_threads);
  if (p.allow_downscale !== undefined) c.allow_downscale = !!p.allow_downscale;
  if (p.force_transcode !== undefined) c.force_transcode = !!p.force_transcode;
  if (p.profile !== undefined) {
    const prof = String(p.profile);
    if (prof === '' || LAB_PROFILES[prof]) c.profile = prof;
    else errors.push('perfil invalido: ' + prof + ' (usa P0..P5.5 o vacio)');
  }
  if (p.ten_bit !== undefined) c.ten_bit = !!p.ten_bit;
  if (p.closed_gop !== undefined) c.closed_gop = !!p.closed_gop;
  if (p.filter_order !== undefined) {
    c.filter_order = pick(p.filter_order, ['denoise_then_sharpen', 'sharpen_only'], c.filter_order);
  }
  if (p.bitrate !== undefined) c.bitrate = String(p.bitrate);
  if (p.maxrate !== undefined) c.maxrate = String(p.maxrate);
  if (p.bufsize !== undefined) c.bufsize = String(p.bufsize);
  if (p.audio_bitrate !== undefined) c.audio_bitrate = String(p.audio_bitrate);
  if (p.fps_mode !== undefined) c.fps_mode = pick(p.fps_mode, ['passthrough', 'cfr'], c.fps_mode);

  if (p.hqdn3d && typeof p.hqdn3d === 'object') {
    c.hqdn3d = {
      luma_spatial: clampNum(p.hqdn3d.luma_spatial, 0, 20, c.hqdn3d.luma_spatial),
      chroma_spatial: clampNum(p.hqdn3d.chroma_spatial, 0, 20, c.hqdn3d.chroma_spatial),
      luma_tmp: clampNum(p.hqdn3d.luma_tmp, 0, 20, c.hqdn3d.luma_tmp),
      chroma_tmp: clampNum(p.hqdn3d.chroma_tmp, 0, 20, c.hqdn3d.chroma_tmp)
    };
  }
  if (p.unsharp && typeof p.unsharp === 'object') {
    c.unsharp = {
      luma_msize: clampInt(p.unsharp.luma_msize, 3, 13, c.unsharp.luma_msize),
      luma_amount: clampNum(p.unsharp.luma_amount, -2, 5, c.unsharp.luma_amount)
    };
    if (c.unsharp.luma_msize % 2 === 0) c.unsharp.luma_msize += 1; // msize debe ser impar
  }
  if (p.atadenoise && typeof p.atadenoise === 'object') {
    c.atadenoise = {
      s: clampInt(p.atadenoise.s, 0, 15, c.atadenoise.s),
      a: clampNum(p.atadenoise.a, 0, 1, c.atadenoise.a),
      b: clampNum(p.atadenoise.b, 0, 1, c.atadenoise.b)
    };
  }
  return { ok: errors.length === 0, config: c, errors };
}

/* Construye la cadena -vf segun la receta. Devuelve '' si recipe='none'. */
function buildImageFilterChain(cfg) {
  const r = cfg.recipe;
  if (r === 'none') return '';
  const u = cfg.unsharp;
  const sharpen = 'unsharp=' + u.luma_msize + ':' + u.luma_msize + ':' + u.luma_amount
    + ':' + u.luma_msize + ':' + u.luma_msize + ':0';
  if (r === 'light') return sharpen;
  const h = cfg.hqdn3d;
  const denoise = 'hqdn3d=' + h.luma_spatial + ':' + h.chroma_spatial + ':'
    + h.luma_tmp + ':' + h.chroma_tmp;
  if (r === 'balanced') {
    return cfg.filter_order === 'sharpen_only' ? sharpen : denoise + ',' + sharpen;
  }
  if (r === 'temporal') {
    const a = cfg.atadenoise;
    // a/b son el limite inferior; el rango efectivo es asimetrico (a..b) por plano
    const ata = 'atadenoise=0a=' + a.a + ':0b=' + a.b
      + ':1a=' + (a.a * 1.5) + ':1b=' + (a.b * 1.5)
      + ':2a=' + (a.a * 1.5) + ':2b=' + (a.b * 1.5) + ':s=' + a.s;
    return ata + ',' + sharpen;
  }
  if (r === 'custom') {
    const parts = [];
    if (cfg.filter_order !== 'sharpen_only') parts.push(denoise);
    parts.push(sharpen);
    return parts.join(',');
  }
  return '';
}

/* Capacidad medida en ESTE VPS. La UI la muestra para no ofrecer imposibles. */
const IMAGE_MEASURED_CAPACITY = {
  measured_at: '2026-11-08',
  host: '3 vCPU AMD EPYC-Rome, 3 GB',
  source: 'testsrc2 20 s, libx265 ultrafast, -an; escala lanczos; fps segun fila',
  margin_required: 1.2,
  // MATRIZ COMPLETA, 11 mediciones. El fps es el factor decisivo, no la receta.
  rows: [
    { target: 'FHD_1080', fps: 25, recipe: 'none',     seconds_for_20s: 11.4, realtime_ratio: 1.76, viable: true  },
    { target: 'FHD_1080', fps: 25, recipe: 'light',    seconds_for_20s: 13.5, realtime_ratio: 1.48, viable: true  },
    { target: 'FHD_1080', fps: 25, recipe: 'balanced', seconds_for_20s: 14.0, realtime_ratio: 1.43, viable: true  },
    { target: 'FHD_1080', fps: 25, recipe: 'temporal', seconds_for_20s: 14.6, realtime_ratio: 1.37, viable: true  },
    { target: 'FHD_1080', fps: 50, recipe: 'light',    seconds_for_20s: 25.6, realtime_ratio: 0.78, viable: false },
    { target: 'FHD_1080', fps: 50, recipe: 'balanced', seconds_for_20s: 26.8, realtime_ratio: 0.75, viable: false },
    { target: 'QHD_1440', fps: 25, recipe: 'none',     seconds_for_20s: 16.8, realtime_ratio: 1.19, viable: false, note: 'al limite' },
    { target: 'QHD_1440', fps: 25, recipe: 'light',    seconds_for_20s: 19.0, realtime_ratio: 1.05, viable: false, note: 'al limite' },
    { target: 'QHD_1440', fps: 25, recipe: 'temporal', seconds_for_20s: 18.6, realtime_ratio: 1.07, viable: false, note: 'al limite' },
    { target: 'QHD_1440', fps: 50, recipe: 'balanced', seconds_for_20s: 46.94, realtime_ratio: 0.43, viable: false },
    { target: 'UHD_4K',   fps: 50, recipe: 'balanced', seconds_for_20s: 80.95, realtime_ratio: 0.25, viable: false }
  ],
  viable_combinations: [
    { target: 'FHD_1080', fps: 25, recipes: ['none','light','balanced','temporal'], min_ratio: 1.37 },
    { target: 'QHD_1440', fps: 25, recipes: [], min_ratio: 1.05, status: 'al limite, no certificar' }
  ],
  verdict: 'VIABLE: FHD_1080 a 25 fps con cualquier receta (1,37x-1,76x). '
         + 'AL LIMITE: QHD_1440 a 25 fps (1,05x-1,19x, por debajo del 1,2x exigido). '
         + 'NO VIABLE: cualquier destino a 50 fps (0,75x-0,78x) y UHD_4K (0,25x). '
         + 'El fps decide mas que la receta: FHD 25fps balanced (1,43x) supera a FHD 50fps none (0,78x).'
};

loadImageConfig();

// HARDENING: 15 s no siempre alcanza para el primer chunk (probe + ffmpeg +
// primer GOP). El 503 'startup timeout' se veia como canal caido. 30 s.
const WAIT_MS = Number(process.env.WAIT_MS || 30000);
const PROCESSING_DOMAIN = 'vps_jit_legacy';
const REA_POLICY_REF = 'contracts/rea/rea-processing-v1.json';

let current = null;
const MIME = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.mpd': 'application/dash+xml',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
};
function log(...a) { console.log(new Date().toISOString(), ...a); }
function redactUpstreamUrls(message) { return String(message).replace(/https?:\/\/[^\s"'<>]+/gi, '[upstream-url]'); }

function setBaseHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  /* POST y DELETE estaban fuera de la lista, asi que el navegador rechazaba
   * con preflight CORS TODOS los botones del panel: declarar, auto, guardar
   * reglas, gobernanza. Medido: OPTIONS devolvia "GET, HEAD, OPTIONS".
   * El panel vive en otro origen (127.0.0.1:5500 en local, el VPS en prod). */
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, X-Requested-With, Content-Type, Accept, Accept-Encoding');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, ETag, Server-Timing');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Timing-Allow-Origin', '*');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=5, max=100');
  res.setHeader('X-Cache-Control', 'no-transform');
  res.setHeader('Surrogate-Control', 'no-store');
}

function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function cachePolicy(kind) {
  if (kind === 'master' || kind === 'mpd') {
    return 'public, max-age=5, stale-while-revalidate=60, stale-if-error=600';
  }
  if (kind === 'media') {
    return 'public, max-age=2, stale-while-revalidate=10, stale-if-error=30';
  }
  if (kind === 'init' || kind === 'seg') {
    return 'public, max-age=31536000, immutable';
  }
  if (kind === 'redirect') {
    return 'private, max-age=10';
  }
  return 'no-cache, no-store, must-revalidate, private, max-age=0';
}

function setObjectCacheHeaders(res, kind) {
  const policy = cachePolicy(kind);
  res.setHeader('Cache-Control', policy);
  if (kind === 'master' || kind === 'mpd') {
    res.setHeader('Vary', 'Accept-Encoding');
  }
  if (kind === 'init' || kind === 'seg') {
    res.setHeader('CDN-Cache-Control', policy);
  }
}

function installTiming(req, res) {
  const t0 = process.hrtime.bigint();
  let stamped = false;
  res.locals = res.locals || {};
  const stamp = () => {
    if (stamped) return;
    stamped = true;
    const ttfb = Number(process.hrtime.bigint() - t0) / 1e6;
    res.setHeader('Server-Timing',
      'ttfb;dur=' + ttfb.toFixed(1) +
      ', cache;desc="' + String(res.locals.cache || 'miss') + '"');
  };
  const origWriteHead = res.writeHead.bind(res);
  const origEnd = res.end.bind(res);
  res.writeHead = function () {
    stamp();
    return origWriteHead.apply(res, arguments);
  };
  res.end = function () {
    stamp();
    return origEnd.apply(res, arguments);
  };
}

function fileETag(stat) {
  return 'W/"' + stat.size + '-' + Math.floor(stat.mtimeMs) + '"';
}

function isFresh(req, etag) {
  const inm = req.headers['if-none-match'];
  return !!inm && String(inm).split(',').some(function (v) { return v.trim() === etag; });
}
function probeSource(spec) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name,color_transfer,color_primaries,color_space,color_range',
      '-of', 'json', spec.url,
    ], { encoding: 'utf8', timeout: 15000 });
    const s = (JSON.parse(out).streams || [])[0] || {};
    let audioOk = false, audioCodec = '';
    try {
      const aout = execFileSync('ffprobe', [
        '-v', 'error', '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
        '-select_streams', 'a:0',
        '-show_entries', 'stream=codec_name,channels,sample_rate',
        '-of', 'json', spec.url,
      ], { encoding: 'utf8', timeout: 15000 });
      const a = (JSON.parse(aout).streams || [])[0] || {};
      audioCodec = a.codec_name || '';
      audioOk = Number(a.channels) > 0 && Number(a.sample_rate) > 0;
    } catch (_) { }
    return {
      width: Number(s.width) || 0, height: Number(s.height) || 0,
      codec: s.codec_name || '', transfer: s.color_transfer || '',
      primaries: s.color_primaries || '', matrix: s.color_space || '', range: s.color_range || '',
      audioOk: audioOk, audioCodec: audioCodec,
    };
  } catch (e) {
    // execFileSync errors contain the full command, including provider tokens.
    log('PROBE_ERROR', e.code || 'probe_failed');
    return { width: 0, height: 0, codec: '', transfer: '', primaries: '', audioOk: false, audioCodec: '' };
  }
}

function videoRange(transfer) {
  if (transfer === 'smpte2084') return 'PQ';
  if (transfer === 'arib-std-b67') return 'HLG';
  return ['bt709', 'smpte170m', 'smpte240m', 'gamma22', 'gamma28', 'iec61966-2-1',
    'iec61966-2-4', 'bt1361e', 'bt2020-10', 'bt2020-12'].includes(transfer) ? 'SDR' : null;
}

/** The real encoder argument plan; no inferred source codec strings or levels. */
function buildEncodingPlan(src, options = {}) {
  const env = options.env || process.env;
  const isSdr = !!(options.sdr || options.sdr720), is720 = !!options.sdr720;
  const use2k = env.APE_2K === '1', av1Requested = env.APE_SCHEME === 'av1' && !isSdr;
  const is4kSource = src.width >= 3840 && src.height >= 2160;
  const sourceRange = videoRange(src.transfer);
  const known709 = sourceRange === 'SDR' && src.primaries === 'bt709'
    && src.transfer === 'bt709' && src.matrix === 'bt709' && ['tv', 'pc'].includes(src.range);
  const knownHdr = ['PQ', 'HLG'].includes(sourceRange) && src.primaries === 'bt2020'
    && src.matrix === 'bt2020nc' && ['tv', 'pc'].includes(src.range);
  const sixK = av1Requested && env.APE_6K === '1' && is4kSource
    && src.width <= 6144 && src.height <= 3456 && (src.width < 6144 || src.height < 3456)
    && (known709 || knownHdr);
  // ── destino resuelto por el MODULO DE IMAGEN ────────────────────────────────
  // La config en caliente decide el destino. Si target='source' se conserva el
  // comportamiento historico (1280/1920/2048 x 720/1080) para no romper nada.
  const cfg = options.imageConfig || imageConfig;
  // Un perfil del LAB DERIVA el destino de salida. El perfil describe que declara
  // el LAB; el target describe que produce este motor. Son objetos distintos y se
  // guardan por separado para que la etiqueta no mienta sobre lo que llega al video.
  const labProfile = cfg.profile && LAB_PROFILES[cfg.profile] ? cfg.profile : null;
  const derivedTarget = labProfile ? LAB_PROFILES[labProfile].target : null;
  const effectiveTarget = derivedTarget || cfg.target;
  // La MATRIZ del perfil manda si trae resolucion propia: un canal gobernado con
  // ?p=P4.5 debe producir 5760x3240 aunque IMAGE_TARGETS no conozca ese tamano.
  const matrixRow = (cfg.profile && profileMatrix[cfg.profile]) ? profileMatrix[cfg.profile] : null;
  const matrixTarget = matrixRow ? { w: matrixRow.outW, h: matrixRow.outH } : null;
  const requestedTarget = matrixTarget || IMAGE_TARGETS[effectiveTarget] || null;
  // Una receta de filtros o un destino explicito NO pueden servirse con -c:v copy:
  // copy no ejecuta -vf. Si se pide procesamiento, se procesa.
  const wantsProcessing = cfg.force_transcode !== false
    && ((cfg.recipe && cfg.recipe !== 'none') || (cfg.target && cfg.target !== 'source'));
  let targetW, targetH;
  if (requestedTarget) {
    targetW = requestedTarget.w; targetH = requestedTarget.h;
  } else {
    targetW = is720 ? 1280 : (isSdr ? 1920 : (av1Requested || use2k ? 2048 : 1920));
    targetH = is720 ? 720 : 1080;
  }
  // allow_downscale=false impide que un destino menor reduzca la fuente.
  if (!cfg.allow_downscale && src.width > 0 && src.height > 0
      && (targetW < src.width || targetH < src.height) && requestedTarget) {
    targetW = src.width; targetH = src.height;
  }
  if (isSdr && (sourceRange !== 'SDR' || !known709 || src.width > targetW || src.height > targetH)) {
    throw new Error('SOURCE_PRESERVATION_REQUIRED: SDR route would reduce or relabel the source; use native/provider-direct');
  }
  // Native HDR is retained even below 4K. Unknown color is never assumed BT.709.
  // 4K SDR and dimensions larger than the legacy target must not fall to FHD.
  const copyNativeRaw = !isSdr && !sixK && (is4kSource || sourceRange === 'PQ' || sourceRange === 'HLG'
    || !known709 || src.width > targetW || src.height > targetH);
  // wantsProcessing vence a la proteccion de color: si hay receta, se codifica.
  const copyNative = copyNativeRaw && !wantsProcessing;
  if (copyNative && !['hevc', 'h264', 'av1', 'vp9'].includes(src.codec)) {
    throw new Error('UNSUPPORTED_NATIVE_CMAF_CODEC: source retained; use provider-direct');
  }
  const av1 = av1Requested && !copyNative;
  const width = copyNative ? src.width : (sixK ? 6144 : targetW);
  const height = copyNative ? src.height : (sixK ? 3456 : targetH);
  const hdrPreserved = sixK && knownHdr;
  // Con color no conocido y transcode forzado, la salida NO se inventa: se hereda
  // lo que declare la fuente y, si no declara nada, no se etiqueta color.
  const colorUnknown = !known709 && !knownHdr;
  const outputColorIntent = (copyNative || hdrPreserved || (wantsProcessing && colorUnknown))
    ? { transfer: src.transfer, primaries: src.primaries, matrix: src.matrix, range: src.range }
    : isSdr ? { transfer: 'bt709', primaries: 'bt709', matrix: 'bt709', range: 'tv' }
      : { transfer: 'smpte2084', primaries: 'bt2020', matrix: 'bt2020nc', range: 'tv' };
  const colorArgs = [];
  if (outputColorIntent.primaries && outputColorIntent.primaries !== 'unknown') {
    colorArgs.push('-color_primaries', outputColorIntent.primaries);
  }
  if (outputColorIntent.transfer && outputColorIntent.transfer !== 'unknown') {
    colorArgs.push('-color_trc', outputColorIntent.transfer);
  }
  if (outputColorIntent.matrix && outputColorIntent.matrix !== 'unknown') {
    colorArgs.push('-colorspace', outputColorIntent.matrix);
  }
  if (outputColorIntent.range && ['tv', 'pc'].includes(outputColorIntent.range)) {
    colorArgs.push('-color_range', outputColorIntent.range);
  }
  // bwdif SOLO si la fuente es entrelazada. Ponerlo por defecto altera la cadencia
  // senalizada de una fuente progresiva (medido en el ensayo del informe).
  const needsDeint = !!src.interlaced;
  const deint = needsDeint ? 'bwdif=mode=send_field:parity=auto:deint=interlaced,' : '';
  const imageFilters = buildImageFilterChain(cfg);
  const pixelFmt = cfg.ten_bit ? 'format=yuv420p10le' : 'format=yuv420p';
  const head = (deint || imageFilters) ? (pixelFmt + ',' + deint + imageFilters + ',') : '';
  const geometry = head + `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
  // setparams only relabels pixels. zscale performs the actual known-SDR -> PQ conversion.
  // zscale SOLO si el color de entrada es conocido. Con color desconocido,
  // convertir a PQ falla con "no path between colorspaces" (code 3074) y el
  // filtro entero se cae: nada se escribe y el cliente recibe 503.
  // Medido en el canal 2: colorUnknown=true -> zscale rompia la cadena.
  const hdrFilter = geometry + ((hdrPreserved || colorUnknown)
    ? ',format=yuv420p10le'
    : ',zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt2020:t=smpte2084:m=bt2020nc:r=limited,format=yuv420p10le');
  let videoArgs;
  if (copyNative) {
    videoArgs = ['-c:v', 'copy'];
    if (src.codec === 'hevc') videoArgs.push('-tag:v', 'hvc1');
    else if (src.codec === 'h264') videoArgs.push('-tag:v', 'avc1');
  } else if (isSdr) {
    videoArgs = ['-vf', geometry + ',format=yuv420p', '-pix_fmt', 'yuv420p', ...colorArgs,
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'high', '-tag:v', 'avc1',
      '-b:v', is720 ? '2200k' : '4000k', '-maxrate', is720 ? '2400k' : '4400k', '-bufsize', is720 ? '4400k' : '8000k'];
  } else if (av1) {
    videoArgs = ['-vf', hdrFilter, '-pix_fmt', 'yuv420p10le', ...colorArgs,
      '-c:v', 'libsvtav1', '-preset', '13', '-crf', '30', '-g', '48', '-svtav1-params', 'lp=3'];
  } else {
    // encoder instrumentado: preset, crf, hilos y GOP salen de la config viva
    const gop = cfg.closed_gop
      ? 'keyint=' + Math.max(1, Math.round(30 * cfg.gop_seconds)) + ':scenecut=0:open-gop=0:'
      : '';
    const rateArgs = cfg.bitrate_mode === 'abr'
      ? ['-b:v', cfg.bitrate, '-maxrate', cfg.maxrate, '-bufsize', cfg.bufsize]
      : ['-crf', String(cfg.crf), '-b:v', '0'];
    // fps: 'preserve' no toca la cadencia. Cualquier otro valor la fija de verdad
    // (-r) y con -fps_mode cfr, para que la salida declare lo que se pidio.
    const fpsArgs = (cfg.fps && cfg.fps !== 'preserve')
      ? ['-r', String(cfg.fps), '-fps_mode', 'cfr']
      : ['-fps_mode', cfg.fps_mode || 'passthrough'];
    videoArgs = ['-vf', hdrFilter, '-pix_fmt', cfg.ten_bit ? 'yuv420p10le' : 'yuv420p', ...colorArgs,
      ...fpsArgs,
      '-c:v', cfg.codec === 'libx265' ? 'libx265' : cfg.codec,
      '-preset', cfg.preset, '-tune', 'zerolatency', '-threads', String(cfg.x265_threads), '-tag:v', 'hvc1',
      // Los metadatos de color del bitstream SOLO se escriben si la salida es HDR
      // conocida. Antes estaban hardcodeados a bt2020/smpte2084 y eso metia PQ en el
      // flujo aunque la fuente tuviera color desconocido o fuera SDR: el manifiesto
      // acababa declarando VIDEO-RANGE=PQ leido de ffprobe, pero era una etiqueta
      // inyectada, no una propiedad del contenido.
      '-x265-params', gop + 'pools=' + cfg.x265_threads + ':frame-threads=1'
        + (['PQ', 'HLG'].includes(outputColorIntent.transfer) && outputColorIntent.primaries === 'bt2020'
            ? ':colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc' : ''),
      ...rateArgs];
  }
  const audioSource = src.audioOk ? src : (options.audioSrc && options.audioSrc.audioOk ? options.audioSrc : null);
  if (!audioSource && (src.audioCodec || options.audioSrc && options.audioSrc.audioCodec)) {
    throw new Error('AUDIO_PROBE_INCOMPLETE: audio retained at source; use provider-direct');
  }
  if (audioSource && !['aac', 'ac3', 'eac3'].includes(audioSource.audioCodec)) {
    throw new Error('UNSUPPORTED_CMAF_AUDIO: no downmix or audio removal; use provider-direct');
  }
  return { isSdr, is720, use2k, av1, sixK, copyNative, copy4k: copyNative && is4kSource,
    wantsProcessing, colorUnknown,
    width, height, videoArgs,
    // FIX 2026-11-08, aislado con 7 experimentos A-G sobre el ffmpeg real:
    //   -f mp4  -> funciona sin tocar nada
    //   -f dash -> falla: el demuxer HLS propaga codec_tag 0x0F y el muxer DASH
    //             lo rechaza ('Tag [15][0][0][0] incompatible with codec id 86018 (mp4a)')
    //   -b:a 128k solo -> sigue fallando (el aviso 'No bit rate set' engana)
    //   -tag:a mp4a   -> RESUELVE (39.142 B escritos, exit 0)
    // NO degrada: sigue siendo -c:a copy; solo corrige el empaquetado del tag.
    audioArgs: (() => {
      if (cfg.audio === 'drop' || !audioSource) return ['-an'];
      if (cfg.audio === 'aac') return ['-c:a', 'aac', '-b:a', cfg.audio_bitrate, '-tag:a', 'mp4a'];
      return ['-c:a', 'copy', '-tag:a', 'mp4a'];
    })(),
    hasAudio: !!audioSource, outputColorIntent,
    upscaled: src.width > 0 && src.height > 0 && (width > src.width || height > src.height),
    crystalMode: copyNative ? (is4kSource ? 'NATIVE_4K_' : 'NATIVE_') + (sourceRange || 'COLOR_UNKNOWN')
      : (sixK ? 'CRYSTAL_6K_AV1' : av1 ? 'CRYSTAL_2K_AV1' : is720 ? 'SDR720_STABLE'
        : (imageFilters ? 'FILTERED_' + String(cfg.recipe).toUpperCase() : 'FHD_SDR')) };
}

/* Codec string RFC 6381 REAL, construido desde el bitstream.
 *
 * MEDIDO: el DASH declaraba codecs="hvc1" y el HLS CODECS="hvc1,mp4a.40.2", sin
 * perfil ni nivel. El bitstream real es Main 10 / level 120 / yuv420p10le, cuyo
 * string correcto es hvc1.2.4.L120.B0.
 *
 * Por que importa: DashMediaSource y HlsMediaSource usan `codecs` para resolver
 * el decoder. Un "hvc1" pelado no dice perfil ni nivel, y un player estricto
 * puede no encontrar un decoder compatible — es el candidato mas fuerte para que
 * el DASH del JIT no arranque en la APK aunque ffprobe lo lea.
 *
 * Formato HEVC: hvc1.<profile_idc>.<compat_flags>.L<level>.<constraints>
 *   Main    (profile 1) -> 1.6.L<level>.B0
 *   Main 10 (profile 2) -> 2.4.L<level>.B0
 *   Main Still (3)      -> 3.4.L<level>.B0
 *   Main 12 (4)         -> 4.8.L<level>.B0
 * Si el perfil no se reconoce se devuelve null y NO se inventa un string: el
 * llamador deja el que traia ffmpeg. */
const HEVC_PROFILE_MAP = {
  'Main':         { idc: 1, compat: 6 },
  'Main 10':      { idc: 2, compat: 4 },
  'Main Still Picture': { idc: 3, compat: 4 },
  'Main 12':      { idc: 4, compat: 8 },
  'Rext':         { idc: 5, compat: 8 }
};

function hevcCodecString(truth) {
  if (!truth) return null;
  if (!truth.codec || String(truth.codec).toLowerCase() !== 'hevc') return null;
  const pm = HEVC_PROFILE_MAP[String(truth.profile || '')];
  if (!pm) return null;
  const level = Number(truth.level);
  if (!Number.isFinite(level) || level <= 0) return null;
  return 'hvc1.' + pm.idc + '.' + pm.compat + '.L' + level + '.B0';
}

function probeOutputFile(filename) {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=codec_name,profile,level,codec_tag_string,width,height,color_transfer,color_primaries,color_space,color_range,pix_fmt',
      '-of', 'json', filename], { encoding: 'utf8', timeout: 4000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(new Error('OUTPUT_PROBE_FAILED'));
      try {
        const stream = (JSON.parse(stdout).streams || [])[0];
        if (!stream || !stream.width || !stream.height) throw new Error('OUTPUT_PROBE_INCOMPLETE');
        const truthObj = { status: 'observed_output_init', width: stream.width, height: stream.height,
          codec: stream.codec_name || null, profile: stream.profile || null, level: stream.level || null,
          sampleEntry: stream.codec_tag_string || null,
          transfer: stream.color_transfer || null, primaries: stream.color_primaries || null,
          matrix: stream.color_space || null, range: stream.color_range || null,
          pixelFormat: stream.pix_fmt || null, videoRange: videoRange(stream.color_transfer) };
        // codec string RFC 6381 derivado del bitstream; null si no se reconoce
        truthObj.codecString = hevcCodecString(truthObj);
        resolve(truthObj);
      } catch (_) { reject(new Error('OUTPUT_PROBE_INCOMPLETE')); }
    });
  });
}

async function ensureOutputTruth(state) {
  if (!state) return null;
  if (state.outputTruth) return state.outputTruth;
  if (state.outputProbePromise) return state.outputProbePromise;
  const init = path.join(state.dir, 'init-' + state.session + '-0.m4s');
  if (!fs.existsSync(init)) return null;
  state.outputProbePromise = probeOutputFile(init).then(truth => {
    state.outputTruth = truth;
    return truth;
  }).catch(() => null).finally(() => { state.outputProbePromise = null; });
  return state.outputProbePromise;
}
function loadMap() {
  try { return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); }
  catch (e) { log('MAP_ERROR', e.message); return {}; }
}
function safeId(id) { return /^[A-Za-z0-9_.-]{1,80}$/.test(id) ? id : null; }

/* ────────────────────────────────────────────────────────────────────────────
 * HARDENING 2026-11-06 — el pipeline moria y fallaba siempre
 * ────────────────────────────────────────────────────────────────────────────
 * MEDIDO antes del parche: 120 fallos en 60 min
 *   /dev/shm/ape-jit/{3,1174213} -> 0 ficheros
 *   FFMPEG failed to rename chunk-*.m4s.tmp to chunk-*.m4s: No such file or directory
 *   FFMPEG Could not write header (incorrect codec parameters ?): No such file or directory
 *
 * CAUSA RAIZ — cuatro productores de ENOENT sobre el mismo directorio:
 *   A) stopCurrent borraba el dir con fs.rmSync en la linea SIGUIENTE al SIGTERM.
 *      SIGTERM es asincrono: ffmpeg seguia vivo escribiendo su .tmp en un dir que
 *      ya no existia. El rename final fallaba con ENOENT. Reproducible al 100%.
 *   B) start() limpiaba el dir sin saber si un hijo anterior seguia usandolo.
 *   C) El handler 'exit' borraba el dir aunque ya perteneciera a un stream NUEVO
 *      y vivo, matandolo por la espalda.
 *   D) El intervalo de idle mataba a los IDLE_MS desde START, antes de que ffmpeg
 *      escribiera el primer chunk. Log real: START 14:18:00 -> STOP idle 14:18:30
 *      con 0 ficheros escritos.
 *
 * REGLA NUEVA: NADIE borra un directorio que un hijo vivo pueda estar escribiendo.
 * El borrado ocurre SOLO tras 'exit' del hijo dueno, o pasado STOP_GRACE_MS como
 * red de seguridad si 'exit' nunca llega.
 * ──────────────────────────────────────────────────────────────────────────── */
const STOP_GRACE_MS = Number(process.env.STOP_GRACE_MS || 6000);
const KILL_AFTER_MS = Number(process.env.KILL_AFTER_MS || 3000);
// El proveedor SOLO acepta max_connections=1. Por tanto el slot es unico y hay
// que SERIALIZARLO: un ffmpeg no puede nacer mientras el anterior no haya muerto,
// o el proveedor ve dos conexiones y corta las dos. Este es el invariante central.
const SLOT_WAIT_MS = Number(process.env.SLOT_WAIT_MS || 12000);
// Tiempo maximo de ARRANQUE antes de declararlo colgado y liberar el slot unico.
// No es el idle: mide desde started hasta que ffmpeg escribe el primer fichero.
// Con slot unico, un arranque colgado bloquea el siguiente canal: por eso hay
// tope, pero el tope se aplica SOLO mientras no haya output.
const BOOT_GRACE_MS = Number(process.env.BOOT_GRACE_MS || 45000);
// Dirs cuyo hijo esta muriendo: no se pueden borrar ni reutilizar hasta el reaping.
const pendingDirs = new Set();
// Hijos realmente vivos ahora mismo. slotAcquire espera a que este en 0.
const liveKids = new Set();
// Arranques en curso (clave canal|variante). start() es async ahora, asi que
// entre la peticion y el spawn hay una espera: waitForFile NO debe interpretar
// esa espera como 'stream stopped' o el handler devuelve 503 en cada arranque.
const booting = new Set();
const startFailures = new Map();
function chKey(id, sdr, sdr720) { return id + '|' + (sdr720 ? 'h' : sdr ? 's' : 'n'); }

function safeStartFailure(error) {
  const code = String(error && error.message || '').split(':', 1)[0];
  return ['SOURCE_PRESERVATION_REQUIRED', 'UNSUPPORTED_NATIVE_CMAF_CODEC',
    'AUDIO_PROBE_INCOMPLETE', 'UNSUPPORTED_CMAF_AUDIO'].includes(code) ? code : 'JIT_START_FAILED';
}
function recordStartFailure(id, sdr, sdr720, error) {
  const key = chKey(id, sdr, sdr720), code = safeStartFailure(error);
  startFailures.set(key, code);
  booting.delete(key);
  log('START_FAIL', id, code, 'source retained; use provider-direct');
}

function reapDir(dir) {
  if (!dir) return;
  pendingDirs.delete(dir);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

/* Espera a que NO haya ningun hijo vivo: el slot unico del proveedor. */
function slotAcquire() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (liveKids.size === 0) return resolve(true);
      if (Date.now() - t0 > SLOT_WAIT_MS) {
        log('SLOT_TIMEOUT', 'hijos vivos=' + liveKids.size + ' tras ' + SLOT_WAIT_MS + 'ms');
        return resolve(false);
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

function stopCurrent(reason) {
  if (!current) return;
  const c = current; current = null;
  log('STOP', c.id, reason || '');
  // El dir queda marcado: lo libera 'exit' del hijo, o la red de seguridad.
  pendingDirs.add(c.dir);
  try {
    if (!c.child || c.child.exitCode !== null || c.child.signalCode !== null) {
      reapDir(c.dir);                         // ya estaba muerto: se limpia ya
      return;
    }
    c.child.kill('SIGTERM');
  } catch (_) { reapDir(c.dir); return; }
  setTimeout(() => { try { c.child.kill('SIGKILL'); } catch (_) {} }, KILL_AFTER_MS);
  // Red de seguridad: si 'exit' no llega (hijo zombi), liberar pasado el grace.
  setTimeout(() => reapDir(c.dir), STOP_GRACE_MS);
}

/* async: debe poder ESPERAR a que el slot unico quede libre antes de spawnear. */
async function start(id, spec, sdr, sdr720) {
  startFailures.delete(chKey(id, sdr, sdr720));
  stopCurrent('switch');
  const src = probeSource(spec);
  // Optional audio-only fallback source. Video stays on spec.url.
  const audioSpec = spec.audioUrl ? { url: spec.audioUrl, ua: spec.audioUa || spec.ua } : null;
  const audioSrc = audioSpec ? probeSource(audioSpec) : null;
  const fallbackAudio = !!(audioSrc && audioSrc.audioOk);
  const audioOk = !!src.audioOk || fallbackAudio;
  const plan = buildEncodingPlan(src, { sdr, sdr720, audioSrc });
  const { isSdr, is720, use2k, av1, sixK, copy4k, copyNative, videoArgs, audioArgs, hasAudio } = plan;
  const dir = path.join(OUT_ROOT, id, is720 ? 'sdr720' : (isSdr ? 'sdr' : ''));
  fs.mkdirSync(dir, { recursive: true });
  // HARDENING (bug B): no limpiar un dir que un hijo anterior aun esta soltando.
  // Si esta pendiente de reaping, el mkdir ya lo reclamo; borrar aqui mataria al
  // proceso que todavia escribe su ultimo .tmp. Se espera al reaping.
  if (!pendingDirs.has(dir)) {
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  } else {
    log('DEFER_CLEAN', id, 'dir pendiente de reaping, no se borra');
  }

  const session = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const args = [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-user_agent', spec.ua || 'VLC/3.0.19 LibVLC/3.0.19',
    '-i', spec.url,
    ...(audioSpec ? ['-i', audioSpec.url] : []),
    '-map', '0:v:0', '-map', (src.audioOk ? '0:a:0?' : (fallbackAudio ? '1:a:0?' : '0:a:0?')),
    ...videoArgs,
    ...audioArgs,
    '-max_muxing_queue_size', '8192',
    // One FFmpeg -> shared fMP4 for DASH + HLS.
    '-f', 'dash',
    '-seg_duration', '2', '-frag_duration', '2',
    '-window_size', '30', '-extra_window_size', '10',
    '-remove_at_exit', '0',
    '-hls_playlist', '1', '-hls_master_name', 'master.m3u8',
    '-init_seg_name', 'init-' + session + '-$RepresentationID$.m4s',
    '-media_seg_name', 'chunk-' + session + '-$RepresentationID$-$Number$.m4s',
    'manifest.mpd',
  ];
  /* SLOT UNICO: el proveedor solo acepta max_connections=1. No se arranca el
   * ffmpeg nuevo hasta que el anterior haya muerto de verdad. Sin esta espera
   * el switch de canal abre dos conexiones y el proveedor corta ambas. */
  const slotOk = await slotAcquire();
  if (!slotOk) {
    log('START_ABORT', id, 'slot ocupado, no se abre una segunda conexion');
    return;
  }
  const child = spawn('nice', ['-n', '19', 'ffmpeg', ...args], {
    cwd: dir,
    detached: false,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  liveKids.add(child);
  const outWidth = plan.width, outHeight = plan.height;
  current = {
    id, sdr: !!sdr, sdr720: is720, child, dir, session,
    lastAccess: Date.now(), started: Date.now(),
    copy4k, copyNative, sourceWidth: src.width || 0, sourceHeight: src.height || 0,
    width: outWidth, height: outHeight, upscaled: plan.upscaled,
    outputColorIntent: plan.outputColorIntent,
    outputTruth: null, outputProbePromise: null,
    crystal: true, use2k, av1, sixK, crystalMode: plan.crystalMode,
    processingDomain: PROCESSING_DOMAIN,
  };
  log('START', id, 'pid=' + child.pid, 'sdr=' + isSdr, 'sdr720=' + is720, 'copy4k=' + copy4k, 'crystal=' + current.crystalMode, 'src=' + src.width + 'x' + src.height + '/' + src.transfer + '->' + outWidth + 'x' + outHeight);
  child.stderr.on('data', d => {
    const s = String(d).trim();
    if (s) log('FFMPEG', redactUpstreamUrls(s).slice(0, 300));
  });
  child.on('exit', (code, sig) => {
    liveKids.delete(child);
    log('EXIT', id, code, sig || '');
    if (current && current.child === child) current = null;
    // HARDENING (bug C): solo se borra si este dir esta PENDIENTE de reaping.
    // Si no lo esta, el dir pertenece a un stream vivo (uno nuevo que arranco
    // mientras este moria): borrarlo lo mataria. Ese era el tercer ENOENT.
    if (pendingDirs.has(dir)) reapDir(dir);
  });
  // HARDENING: un spawn que falla no debe dejar 'current' apuntando a un muerto.
  child.on('error', (e) => {
    liveKids.delete(child);
    log('SPAWN_ERROR', id, e && e.message ? e.message : String(e));
    if (current && current.child === child) current = null;
    if (pendingDirs.has(dir)) reapDir(dir);
  });
}

function waitForFile(id, name, cb, sdr, sdr720) {
  const file = path.join(OUT_ROOT, id, sdr720 ? 'sdr720' : (sdr ? 'sdr' : ''), name);
  const key = chKey(id, sdr, sdr720);
  const t0 = Date.now();
  const tick = () => {
    if (startFailures.has(key)) return cb(new Error(startFailures.get(key) + ': use provider-direct; source unchanged'));
    /* CARRERA CRITICA, medida en el E2E del 2026-11-08:
     *
     * El orden anterior era (a) existe el fichero -> servir, (b) si no estas
     * arrancando -> 'stream stopped'. Como start() BORRA el directorio pero es
     * async, un master.m3u8 de la ejecucion ANTERIOR seguia en disco cuando
     * llegaba la peticion: se servia 200 con los segmentos de un trabajo muerto
     * que start() borraba acto seguido. El player recibia un manifiesto valido y
     * pedia chunks inexistentes => exactamente el sintoma de "player sin imagen".
     *
     * Ahora UN JOB VIVO ES CONDICION PREVIA para mirar el fichero. Sin job vivo
     * el fichero no se sirve nunca, aunque exista. */
    const alive = !!current && current.id === id &&
      !!current.sdr === !!sdr && !!current.sdr720 === !!sdr720;
    if (!alive && !booting.has(key)) {
      return cb(new Error('stream stopped'));
    }
    if (alive && fs.existsSync(file)) return cb(null, file);
    if (Date.now() - t0 > WAIT_MS) return cb(new Error('startup timeout'));
    setTimeout(tick, 200);
  };
  tick();
}

/* Bitrate REAL medido del ultimo segmento de video.
 * Por que existe: ffmpeg con -crf no conoce el bitrate objetivo y escribe en el
 * master un BANDWIDTH estimado del primer fragmento parcial. Medido: 2234 y 3481
 * bps para 1080p, que es imposible. Aqui se recalcula con el tamano real del
 * ultimo chunk de video dividido por su duracion.
 * Si no hay datos suficientes devuelve null y el atributo se OMITE: mejor no
 * declarar que declarar una cifra falsa. */
function measuredBandwidth(state) {
  try {
    if (!state || !state.dir) return null;
    const dir = state.dir;
    const seg = Number(state.segDuration || 2);
    const files = fs.readdirSync(dir)
      .filter(n => n.startsWith('chunk-') && n.endsWith('.m4s'))
      .map(n => ({ n, p: path.join(dir, n), st: fs.statSync(path.join(dir, n)) }))
      .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    // el RepresentationID 0 es video; 1 es audio
    const video = files.filter(x => /-0-\d+\.m4s$/.test(x.n));
    const audio = files.filter(x => /-1-\d+\.m4s$/.test(x.n));
    if (!video.length) return null;
    const vBps = Math.round((video[0].st.size * 8) / seg);
    const aBps = audio.length ? Math.round((audio[0].st.size * 8) / seg) : 0;
    if (vBps <= 0) return null;
    return { video: vBps, audio: aBps, total: vBps + aBps,
             samples: { video: video.length, audio: audio.length }, window_s: seg };
  } catch (e) {
    return null;
  }
}

function hdrMaster(text, state = current) {
  if (!state) return text;
  const mode = state.crystalMode;
  const id = state.id;
  if (id && text.indexOf('DATA-ID="com.ape.channel"') === -1) {
    text = text.replace('#EXTM3U',
      '#EXTM3U\n' +
      '#EXT-X-SESSION-DATA:DATA-ID="com.ape.channel",URI="/jit/meta/' + encodeURIComponent(id) + '.json"\n' +
      '#EXT-X-SESSION-DATA:DATA-ID="com.ape.manifest",URI="/jit/live/' + encodeURIComponent(id) + '/manifest.json"');
  }
  if (text.indexOf('#EXT-X-APE-CRYSTAL-UHD') === -1) {
    const up = state.upscaled
      ? '\n#EXT-X-APE-CRYSTAL-UPSCALE:SOURCE=' + state.sourceWidth + 'x' + state.sourceHeight +
        ';TARGET=' + state.width + 'x' + state.height + ';FILTER=LANCZOS'
      : '\n#EXT-X-APE-CRYSTAL-UPSCALE:NATIVE';
    // HARDENING 2026-11-06 — la etiqueta ENHANCE mentia y el VPP se perdia.
    //
    // Medido antes del cambio:
    //   canal 1080p  -> ENHANCE=4K_PLUS  TARGET=1920x1080  (dice 4K, es 1080p)
    //   canal 720p   -> ENHANCE=UPSCALE_4K  y SIN VPP ni TARGET
    //
    // Causa: ENHANCE derivaba de `upscaled`, que es false en DOS casos distintos:
    // (a) la fuente YA es 4K (correcto) y (b) el target es 1080 y la fuente 1080
    // (el mismo tamano, que no es 4K). Y el ramal `upscaled` solo emitia la
    // etiqueta, sin VPP ni TARGET: justo los canales 720p/480p —los que MAS
    // necesitan el post-proceso del SoC— eran los unicos que no lo declaraban.
    //
    // Ahora ENHANCE deriva del tamano REAL de salida y VPP+TARGET se emiten SIEMPRE.
    const outW = state.outputTruth ? state.outputTruth.width : state.width;
    const outH = state.outputTruth ? state.outputTruth.height : state.height;
    const enhTag = outH >= 2160 ? '4K_PLUS'
      : (outH >= 1080 && outW >= 2048) ? '2K_PLUS'
        : outH >= 1080 ? 'FHD_PLUS'
          : 'UPSCALE';
    const enhance = '\n#EXT-X-APE-CRYSTAL-ENHANCE:' + enhTag +
      '\n#EXT-X-APE-CRYSTAL-VPP:DEVICE_DISPLAY;POLICY=MAX_IMAGE_FIRST;EXECUTED=0' +
      '\n#EXT-X-APE-CRYSTAL-TARGET:' + outW + 'x' + outH + ';STATUS=' + (state.outputTruth ? 'OUTPUT_OBSERVED' : 'REQUESTED');
    const sixKTag = state.sixK
      ? '\n#EXT-X-APE-CRYSTAL-6K:REQUESTED=true;OUTPUT_VERIFIED=' + !!state.outputTruth +
        '\n#EXT-X-APE-CRYSTAL-6K-TARGET:6144x3456'
      : '\n#EXT-X-APE-CRYSTAL-6K:AVAILABLE=OPT_IN;ENV=APE_6K';
    text = text.replace('#EXTM3U',
      '#EXTM3U\n' +
      '#EXT-X-APE-CRYSTAL-UHD:ENABLED=true\n' +
      '#EXT-X-APE-CRYSTAL-MODE:' + mode + up + enhance + sixKTag + '\n' +
      '#EXT-X-APE-CRYSTAL-POLICY:MAX_IMAGE_FIRST\n' +
      '#EXT-X-APE-PROCESSING-DOMAIN:' + PROCESSING_DOMAIN + ';REA_POLICY_REF=' + REA_POLICY_REF + ';REA_EXECUTED=0');
  }
  // CODECS, BANDWIDTH and RESOLUTION come from FFmpeg's actual muxed output.
  // They must not be overwritten with a scheme, profile or input estimate.
  const range = state.outputTruth && state.outputTruth.videoRange;
  const bw = measuredBandwidth(state);
  return text.split('\n').map(line => {
    if (!line.startsWith('#EXT-X-STREAM-INF:')) return line;
    let out = line;
    // VIDEO-RANGE solo si ffmpeg lo observo en el bitstream
    if (range) {
      out = out.replace(/,?VIDEO-RANGE=[^,\r\n]*/g, '').replace(/\r?$/, ',VIDEO-RANGE=' + range);
    }
    // BANDWIDTH: se sustituye por el bitrate MEDIDO de los segmentos reales.
    // Si no hay medicion, se quita el atributo en vez de dejar el valor de ffmpeg,
    // que con -crf es una estimacion del primer fragmento parcial (2234 bps a 1080p).
    if (bw) {
      out = out.replace(/BANDWIDTH=\d+/g, 'BANDWIDTH=' + bw.total);
      if (!/AVERAGE-BANDWIDTH=/.test(out)) {
        out = out.replace(/(BANDWIDTH=\d+)/, '$1,AVERAGE-BANDWIDTH=' + bw.total);
      }
    } else {
      // SIN medicion se quita el BANDWIDTH, haya o no outputTruth.
      // Antes la condicion era `else if (!state.outputTruth)`, asi que con el
      // init ya sondeado pero sin chunks medidos se conservaba el valor de
      // ffmpeg (2234 bps a 1080p). Medido en el E2E: el atributo volvia a salir
      // imposible justo en los primeros segundos del trabajo.
      out = out.replace(/,?BANDWIDTH=\d+/g, '');
    }
    // CODECS: ffmpeg escribe "hvc1" pelado; se sustituye por el RFC 6381 real.
    const cs = state.outputTruth && state.outputTruth.codecString;
    if (cs) {
      out = out.replace(/CODECS="([^"]*)"/g, (all, list) =>
        'CODECS="' + list.split(',').map((c) => (c.trim().toLowerCase() === 'hvc1' ? cs : c.trim())).join(',') + '"');
    }
    return out;
  }).join('\n');
}

/* Limpieza de CONFORMIDAD del MPD que emite ffmpeg.
 *
 * MEDIDO: el muxer DASH de ffmpeg 6.1.1 escribe dos elementos VACIOS que el
 * esquema MPD no admite:
 *     <ProgramInformation></ProgramInformation>        -> exige al menos un <Title>
 *     <ServiceDescription id="0"></ServiceDescription> -> exige al menos un <Scope>
 * ffprobe los tolera (por eso el DASH "se lee"), pero un parser estricto puede
 * rechazar el manifiesto entero. Se eliminan SOLO cuando estan vacios: si algun
 * dia traen contenido, se conservan tal cual.
 *
 * Tambien se indenta el SupplementalProperty propio, que ffmpeg deja pegado al
 * inicio de linea dentro del AdaptationSet. */
function sanitizeMpd(text) {
  let out = String(text);
  out = out.replace(/[ \t]*<ProgramInformation\b[^>]*>\s*<\/ProgramInformation>\s*\n?/g, '');
  out = out.replace(/[ \t]*<ServiceDescription\b[^>]*>\s*<\/ServiceDescription>\s*\n?/g, '');
  out = out.replace(/\n(<SupplementalProperty schemeIdUri="urn:ape:)/g, '\n\t\t\t$1');
  return out;
}

/* Sustituye codecs="hvc1" (sin perfil ni nivel) por el string RFC 6381 REAL
 * derivado del bitstream. Solo actua sobre el AdaptationSet de video; el audio
 * (mp4a.40.2) ya viene completo. Si no hay codecString medido, no se toca: mejor
 * dejar el de ffmpeg que inventar un perfil. */
function fixMpdCodecs(text, state) {
  const cs = state && state.outputTruth && state.outputTruth.codecString;
  if (!cs) return text;
  return text
    .replace(/(<AdaptationSet\b[^>]*contentType="video"[^>]*>[\s\S]*?)codecs="hvc1"/g, '$1codecs="' + cs + '"')
    .replace(/(<Representation\b[^>]*mimeType="video\/[^"]*"[^>]*)codecs="hvc1"/g, '$1codecs="' + cs + '"');
}

function hdrMpd(text, state = current) {
  if (!state) return text;
  const truth = state.outputTruth;
  const props = [];
  const codes = truth ? {
    ColourPrimaries: { bt709: 1, bt2020: 9 }[truth.primaries],
    TransferCharacteristics: { bt709: 1, smpte2084: 16, 'arib-std-b67': 18 }[truth.transfer],
    MatrixCoefficients: { bt709: 1, bt2020nc: 9 }[truth.matrix]
  } : {};
  for (const [name, value] of Object.entries(codes)) {
    if (value != null) props.push('<SupplementalProperty schemeIdUri="urn:mpeg:mpegB:cicp:' + name + '" value="' + value + '"/>');
  }
  return text.replace(/(<AdaptationSet\b[^>]*>)([\s\S]*?)(<\/AdaptationSet>)/g, (all, open, body, close) => {
    if (!/\bcontentType="video"|\bmimeType="video\//.test(open + body)) return all;
    let result = body;
    for (const name of Object.keys(codes)) {
      if (codes[name] == null) continue;
      const existing = new RegExp('<(?:SupplementalProperty|EssentialProperty)\\b[^>]*schemeIdUri="urn:mpeg:mpegB:cicp:' + name + '"[^>]*\\/>', 'g');
      result = result.replace(existing, '');
    }
    if (!result.includes('urn:ape:crystal:uhd')) result = '\n<SupplementalProperty schemeIdUri="urn:ape:crystal:uhd" value="' + state.crystalMode + '"/>' + result;
    if (!result.includes('urn:ape:processing:domain')) result = '\n<SupplementalProperty schemeIdUri="urn:ape:processing:domain" value="' + PROCESSING_DOMAIN + '"/>' + result;
    return open + '\n' + props.join('\n') + result + close;
  });
}

/* Se aplica el saneo de conformidad como ULTIMO paso, tanto si hubo
 * outputTruth (se inyectaron propiedades) como si no. */
function hdrMpdSanitized(text, state = current) {
  return fixMpdCodecs(sanitizeMpd(hdrMpd(text, state)), state);
}

function sendStatic(req, res, file, type, kind) {
  const stat = fs.statSync(file);
  const size = stat.size;
  const etag = fileETag(stat);
  res.locals.cache = kind || 'static';
  setObjectCacheHeaders(res, kind || 'seg');
  res.setHeader('ETag', etag);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', type);
  if (isFresh(req, etag)) {
    res.writeHead(304);
    return res.end();
  }
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (!m) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size });
      return res.end();
    }
    let start = m[1] === '' ? null : Number(m[1]);
    let end = m[2] === '' ? null : Number(m[2]);
    if (start === null && end === null) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size });
      return res.end();
    }
    if (start === null) { start = Math.max(0, size - end); end = size - 1; }
    else if (end === null || end >= size) end = size - 1;
    if (start < 0 || start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
      'Content-Length': end - start + 1,
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function publicBase(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return proto + '://' + (req.headers.host || 'iptv-ape.duckdns.org') + '/jit';
}

function outputDescriptor(state) {
  const truth = state && state.outputTruth;
  if (!truth) return null;
  let master = '';
  try { master = fs.readFileSync(path.join(state.dir, 'master.m3u8'), 'utf8'); } catch (_) { }
  const line = master.split('\n').find(value => value.startsWith('#EXT-X-STREAM-INF:')) || '';
  const codec = (line.match(/\bCODECS="([^"]+)"/) || [])[1] || null;
  const numeric = name => { const match = line.match(new RegExp('(?:^#EXT-X-STREAM-INF:|,)' + name + '=(\\d+(?:\\.\\d+)?)')); return match ? Number(match[1]) : null; };
  return {
    evidence: truth.status, bandwidth: numeric('BANDWIDTH'), average_bandwidth: numeric('AVERAGE-BANDWIDTH'),
    bandwidth_source: 'ffmpeg_manifest', resolution: truth.width + 'x' + truth.height,
    codecs: codec, uri: 'media_0.m3u8', frame_rate: numeric('FRAME-RATE'),
    hdr: truth.videoRange, video_range: truth.videoRange, color_primaries: truth.primaries,
    transfer: truth.transfer, matrix: truth.matrix, pixel_format: truth.pixelFormat,
    master_display: null, max_cll: null, max_fall: null
  };
}

function manifestJson(req, id, sdr, sdr720, state = current) {
  const base = publicBase(req);
  const prefix = '/live/' + id + (sdr720 ? '/sdr720' : (sdr ? '/sdr' : ''));
  const active = !!(state && state.id === id && !!state.sdr === !!sdr && !!state.sdr720 === !!sdr720);
  const selected = active ? state : null, stream = outputDescriptor(selected);
  return {
    version: '1.1', channel: id, status: active ? 'active' : 'inactive', variant: sdr720 ? 'sdr720' : (sdr ? 'sdr' : 'hdr'),
    variant_semantics: 'route_name_not_color_evidence',
    processing_domain: PROCESSING_DOMAIN, rea_policy_ref: REA_POLICY_REF, rea_executed: false,
    output_status: stream ? 'observed_output_init' : 'pending_output',
    crystal_uhd: {
      enabled: true,
      mode: selected ? selected.crystalMode : null,
      policy: 'MAX_IMAGE_FIRST',
      source_resolution: selected && selected.sourceWidth > 0 && selected.sourceHeight > 0 ? selected.sourceWidth + 'x' + selected.sourceHeight : null,
      requested_resolution: selected && selected.width > 0 && selected.height > 0 ? selected.width + 'x' + selected.height : null,
      output_resolution: stream ? stream.resolution : null,
      upscaled: stream && selected ? selected.upscaled : null,
      upscale_filter: selected && selected.upscaled ? 'LANCZOS' : null,
      note: 'Legacy VPS processing; output init verification does not prove physical HDR, REA execution or real-time playback',
    },
    formats: {
      hls: { url: base + prefix + '/master.m3u8', protocol: 'HLS', container: 'CMAF/fMP4' },
      dash: { url: base + prefix + '/manifest.mpd', protocol: 'DASH', container: 'CMAF/fMP4' },
    },
    streams: stream ? [stream] : [],
    error: active ? null : (startFailures.get(chKey(id, sdr, sdr720)) || null),
    clients_connected: null,
    active_pipeline_count: active ? 1 : 0,
    active_since: active ? new Date(selected.started).toISOString() : null,
    generated_at: new Date().toISOString(),
  };
}

function metaJson(req, id) {
  const map = loadMap();
  const known = !!(map[id] && map[id].url);
  const active = !!(current && current.id === id);
  const base = publicBase(req);
  const descriptor = active ? outputDescriptor(current) : null;
  return {
    $schema: 'https://iptv-ape.duckdns.org/schemas/channel-v1.json',
    model_version: '1.0',
    id: id,
    generated_at: new Date().toISOString(),
    active: active,
    known: known,
    representations: {
      hls: base + '/live/' + id + '/master.m3u8',
      dash: base + '/live/' + id + '/manifest.mpd',
      media_json: base + '/live/' + id + '/manifest.json'
    },
    playback: descriptor ? { ...descriptor,
      hdr: descriptor.video_range ? ['PQ', 'HLG'].includes(descriptor.video_range) : null,
      crystal_mode: current.crystalMode } : null,
    processing_domain: PROCESSING_DOMAIN, rea_policy_ref: REA_POLICY_REF, rea_executed: false,
    truth_guard: {
      supplemental_codecs: 'not emitted without measured DV',
      video_range: 'PQ/HLG/SDR only from the observed output init segment',
      codecs: 'FFmpeg output manifest; never synthesized from the selected encoder scheme',
      pixels: 'Output metadata is not a physical HDR or device playback verification'
    }
  };
}

const server = http.createServer((req, res) => {
  installTiming(req, res);
  setBaseHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/playlist.m3u8') {
    const f = path.join(path.dirname(MAP_FILE), 'APE_JIT_LIST.m3u8');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('playlist not built'); }
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': MIME['.m3u8'] });
    return fs.createReadStream(f).pipe(res);
  }
  if (u.pathname === '/capabilities.json') {
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      service: 'ape-jit-cmaf',
      transports: ['vps-list', 'provider-direct'],
      formats: ['HLS', 'DASH', 'CMAF/fMP4'],
      codecs: ['AVC/HEVC/AV1/VP9 native copy where supported', 'HEVC Main10', 'AV1 opt-in', 'AAC/AC-3/E-AC-3 native audio'],
      hdr: ['SDR', 'PQ', 'HLG'],
      processing_domain: PROCESSING_DOMAIN, rea_policy_ref: REA_POLICY_REF, rea_executed: false,
      resolutions: { native: 'Preserve source dimensions', legacy_hdr: '1920x1080 or 2048x1080 from known BT.709 SDR',
        legacy_6k: '6144x3456 opt-in, capacity not certified', rea_device: 'Separate REA policy; not executed by this service' },
      crystal_uhd: {
        enabled: true,
        applies_to: 'all JIT channels',
        modes: ['NATIVE_4K_PQ', 'NATIVE_4K_HLG', 'NATIVE_4K_SDR', 'NATIVE_4K_COLOR_UNKNOWN',
          'NATIVE_PQ', 'NATIVE_HLG', 'NATIVE_SDR', 'NATIVE_COLOR_UNKNOWN', 'CRYSTAL_2K_HDR_UPSCALE',
          'CRYSTAL_2K_AV1', 'CRYSTAL_6K_AV1', 'FHD_HDR10', 'FHD_SDR', 'SDR720_STABLE'],
        note: 'Capabilities are conditional; output is verified from its init segment. Physical HDR and realtime performance are not certified.',
      },
      limits: { concurrent_channels: 1, idle_stop_s: Math.round(IDLE_MS / 1000) },
      active: current ? current.id : null,
    }));
  }
  if (u.pathname === '/crystal.json') {
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      policy: 'APE_CRYSTAL_UHD',
      processing_domain: PROCESSING_DOMAIN, rea_policy_ref: REA_POLICY_REF, rea_executed: false,
      enabled: true,
      applies_to: 'all JIT channels',
      active_channel: current ? current.id : null,
      active_mode: current ? current.crystalMode : null,
      modes: {
        NATIVE_4K_HDR: 'compatibility label; actual native codec, resolution and PQ/HLG/SDR come from output',
        CRYSTAL_2K_HDR_UPSCALE: 'HEVC Main10 2048x1080 HDR10, Lanczos upscale from <=1080p',
        CRYSTAL_2K_AV1: 'SVT-AV1 2048x1080 HDR10, opt-in APE_SCHEME=av1',
        CRYSTAL_6K_AV1: 'SVT-AV1 6144x3456, native PQ/HLG preserved or known SDR converted to PQ; opt-in APE_6K=1; not real-time on 3 vCPU',
        FHD_HDR10: 'HEVC Main10 1920x1080 HDR10, zscale SDR->PQ',
        FHD_SDR: 'H.264 1920x1080 SDR fallback for incompatible decoders',
        SDR720_STABLE: 'H.264 1280x720 SDR continuity fallback',
      },
      truth_guard: 'This legacy FFmpeg service does not execute the REA device engine. Output metadata does not certify physical display HDR.',
    }));
  }
  const mm = u.pathname.match(/^\/meta\/([^/]+)\.json$/);
  if (mm) {
    const id = safeId(mm[1]);
    if (!id) { res.writeHead(400); return res.end('bad channel'); }
    const map = loadMap();
    if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }
    res.locals.cache = 'meta';
    setNoCacheHeaders(res);
    res.setHeader('Link', '</jit/live/' + encodeURIComponent(id) + '/master.m3u8>; rel="alternate"; type="application/vnd.apple.mpegurl"');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(metaJson(req, id)));
  }

  if (u.pathname === '/catalog.json') {
    const map = loadMap();
    const base = publicBase(req);
    const channels = Object.keys(map).map(function (id) {
      return {
        id: id,
        hls: base + '/live/' + id + '/master.m3u8',
        dash: base + '/live/' + id + '/manifest.mpd',
        json: base + '/live/' + id + '/manifest.json',
        active: !!(current && current.id === id),
      };
    });
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ service: 'ape-jit-cmaf', count: channels.length, channels: channels }));
  }
  const gm = u.pathname.match(/^\/go\/([^/]+)\/?$/);
  if (gm) {
    const id = safeId(gm[1]);
    if (!id) { res.writeHead(400); return res.end('bad channel'); }
    const map = loadMap();
    if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }

    /* GOBIERNO: ?p=Px fija el perfil de ESTA peticion.
     *
     * Antes /go/{id} redirigia siempre sin mirar el perfil, asi que la lista
     * gobernada decia P4.5 pero el motor producia lo que tuviera en su config
     * global. Medido: pedir ?p=P0 dejaba config.target=FHD_1080.
     *
     * Ahora el perfil de la URL se aplica al trabajo en curso: se copia al
     * imageConfig como profile (del que buildEncodingPlan deriva la resolucion
     * de la matriz) antes de redirigir. Es single-slot por diseno: el ultimo
     * perfil pedido manda, y se declara en el manifiesto. */
    const qp = String(u.searchParams.get('p') || '');
    if (qp && profileMatrix[qp]) {
      /* El perfil cambia la RESOLUCION de salida, y eso solo se aplica si el
       * transcode ARRANCA DE NUEVO: cambiar imageConfig con un job vivo no toca
       * el ffmpeg que ya esta corriendo.
       *
       * MEDIDO: pedir ?p=P4.5 (5760x3240) con un job en P1 dejaba la salida en
       * 3840x2160, con el MISMO session id en el init. El perfil se registraba
       * pero el video no cambiaba: la etiqueta mentia.
       *
       * Se para el trabajo cuando el perfil pedido no es el que esta produciendo. */
      if (imageConfig.profile !== qp) {
        imageConfig.profile = qp;
        imageConfigSource = 'governance:' + qp;
        imageConfig.force_transcode = true;
        try { fs.writeFileSync(IMAGE_CONFIG_FILE, JSON.stringify(imageConfig, null, 2)); } catch (_) {}
        if (current) {
          try { stopCurrent('governance-profile-change'); } catch (_) {}
        }
      }
    }
    // se registra SIEMPRE que la peticion traiga un perfil valido, no solo cuando
    // cambia la config: el recibo debe reflejar lo que pidio el player.
    if (qp && profileMatrix[qp]) {
      governorApplied = { profile: qp, channel: id, at: new Date().toISOString() };
    }

    res.locals.cache = 'redirect';
    setObjectCacheHeaders(res, 'redirect');
    const qs = qp && profileMatrix[qp] ? ('?p=' + encodeURIComponent(qp)) : '';
    res.writeHead(302, {
      'Location': publicBase(req) + '/live/' + id + '/master.m3u8' + qs
    });
    return res.end();
  }
  /* ── MODULO DE IMAGEN: control remoto desde la UI ───────────────────────── */
  /* \u2500\u2500 MATRIZ EDITABLE de los 12 perfiles: entrada -> salida \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  /* CATALOGO: salidas, codecs, players y recetas para el panel unificado */
  if (u.pathname === '/image/catalog') {
    setBaseHeaders(res); setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      targets: Object.entries(OUTPUT_TARGETS).map(([id, t]) => ({ id, label: t.label, width: t.w, height: t.h, hdr: t.hdr, tier: t.tier })),
      codecs: Object.entries(CODEC_CATALOG).map(([id, c]) => ({ id, label: c.label, family: c.family, profile: c.profile, encoder: c.encoder, notes: c.notes })),
      players: Object.entries(PLAYER_CAPS).map(([id, p]) => ({ id, label: p.label, maxW: p.maxW, maxH: p.maxH, codecs: p.codecs, hdr: p.hdr, main10: p.main10, evidence: p.evidence })),
      recipes: Object.entries(RECIPE_PRESETS).map(([id, r]) => ({ id, label: r.label, chain: r.chain, params: r.params })),
      profiles: Object.keys(profileMatrix),
      counts: { targets: Object.keys(OUTPUT_TARGETS).length, codecs: Object.keys(CODEC_CATALOG).length,
                players: Object.keys(PLAYER_CAPS).length, recipes: Object.keys(RECIPE_PRESETS).length }
    }));
  }

  /* DECLARAR: dada la seleccion, resuelve todo y declara lo que no se puede */
  if (u.pathname === '/image/declare' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 32768) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const r = declareProfile(pl);
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(r));
    });
    return;
  }

  /* PERFIL COMPLETO: al seleccionar un perfil trae su config actual resuelta */
  if (u.pathname.match(/^\/image\/profile\/[^/]+\/full$/)) {
    const pid = decodeURIComponent(u.pathname.split('/')[3] || '');
    const row = profileMatrix[pid];
    if (!row) {
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'perfil inexistente: ' + pid }));
    }
    const q = u.searchParams;
    /* Las REGLAS de este perfil, con todos sus campos ya cargados. Es lo que el
     * panel necesita para rellenar el constructor al cambiar de perfil: sin esto
     * el select cambiaba de nombre pero los valores seguian siendo los del perfil
     * anterior. */
    const myRules = transformRules.filter((x) => String(x.profile) === String(pid));
    // la primera regla es la que se usa como plantilla (la mas ajustada)
    const tpl = myRules.length ? myRules[0] : null;
    const tplParams = tpl ? ruleParams(tpl) : ruleParams({});
    const r = declareProfile({
      profile: pid,
      input: { width: Number(q.get('w')) || 1280, height: Number(q.get('h')) || 720 },
      player: q.get('player') || 'onn-4k',
      codec: q.get('codec') || (tpl ? tpl.codec : 'hvc1'),
      recipe: q.get('recipe') || (tpl ? tpl.recipe : 'balanced'),
      target: q.get('target') || undefined,
      fps: q.get('fps') || (tpl && tpl.inFps ? tpl.inFps : 25)
    });
    setBaseHeaders(res); setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      profile: pid,
      matrix: row,
      rules: myRules,
      ruleCount: myRules.length,
      // TODO lo que el panel debe rellenar, ya resuelto
      load: {
        input: tpl ? tpl.input : null,
        inFps: tpl ? tpl.inFps : null,
        outW: row.outW, outH: row.outH,
        outFps: tpl ? tpl.outFps : null,
        codec: tpl ? tpl.codec : 'hvc1',
        recipe: tpl ? tpl.recipe : 'balanced',
        dither: tpl ? (tpl.dither || row.dither) : row.dither,
        mode: tpl ? (tpl.mode || 'real') : 'real',
        preset: tplParams.preset, crf: tplParams.crf, audio: tplParams.audio,
        hqdn3d: tplParams.hqdn3d, unsharp: tplParams.unsharp, atadenoise: tplParams.atadenoise,
        seg_duration: tplParams.seg_duration, window_size: tplParams.window_size,
        extra_window_size: tplParams.extra_window_size, gop_seconds: tplParams.gop_seconds,
        x265_threads: tplParams.x265_threads
      },
      resolved: r
    }));
  }

  /* CASCADA: los 13 tiers con su serial, seleccionables */
  if (u.pathname === '/image/cascade') {
    setBaseHeaders(res); setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      count: CODEC_CASCADE.length,
      goldenRule: 'hvc1.* en STREAM-INF, hev1.* en KODIPROP/EXTVLCOPT. Nunca cruzados.',
      tiers: CODEC_CASCADE,
      players: Object.keys(PLAYER_CAPS)
    }));
  }

  /* FALLBACK: resuelve el tier efectivo y devuelve la traza completa */
  if (u.pathname === '/image/fallback' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 32768) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const r = resolveFallback(pl);
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(r));
    });
    return;
  }

  /* SERIAL por tier para el lugar correcto (golden rule) */
  if (u.pathname === '/image/serial') {
    const t = u.searchParams.get('tier');
    const where = u.searchParams.get('where') || 'stream-inf';
    const c = cascadeByTier(t);
    setBaseHeaders(res); setNoCacheHeaders(res);
    if (!c) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'tier inexistente: ' + t }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true, tier: c.tier, where,
      serial: serialFor(c.tier, where),
      both: { hvc1: c.hvc1, hev1: c.hev1 },
      note: where === 'stream-inf' ? 'hvc1 va en CODECS= del STREAM-INF' : 'hev1 va en KODIPROP/EXTVLCOPT'
    }));
  }

  /* REGLAS: la tabla entrada -> salida, con varias salidas por entrada */
  /* AUTO POR CAMPO: la config optima para una fila, campo a campo */
  /* OPTIMIZACION: la funcion objetivo completa REAL vs EMULADO */
  /* OPTIMIZACION con LLM: determinista primero, LLM puede mejorar, se valida */
  if (u.pathname === '/image/optimize-llm' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 65536) { tooBig = true; req.destroy(); } });
    req.on('end', async () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      // 1. la base determinista SIEMPRE se calcula: es la red
      const base = objective(pl);
      if (!base.ok) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(base)); }
      // 2. el LLM puede mejorarla
      const t0 = Date.now();
      const llm = await callLLM(pl, base);
      const ms = Date.now() - t0;
      if (llm.error) {
        base.llm = { used: false, error: llm.error, ms, source: 'deterministico' };
        setBaseHeaders(res); setNoCacheHeaders(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(base));
      }
      // 3. se valida campo a campo; lo invalido se descarta
      const m = mergeLLMProposal(base, llm.proposal);
      m.out.llm = Object.assign({}, m.out.llm, { used: true, ms, source: 'llm+validacion' });
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(m.out));
    });
    return;
  }

  /* Estado del LLM: si hay key, que modelo, sin exponer la clave */
  /* KEY del LLM: guardar, borrar, consultar estado. En caliente, sin reinicio. */
  if (u.pathname === '/image/llm-key' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      setBaseHeaders(res); setNoCacheHeaders(res);
      if (pl.clear === true) {
        const r = clearLLMKey();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(r));
      }
      const r = saveLLMKey(pl.key);
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(r));
    });
    return;
  }

  /* ALINEACION: hereda el perfil del gestor y PROPONE los cambios. No aplica. */
  if (u.pathname === '/image/profile/align' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 512 * 1024) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const pid = String(pl.profile || 'P4.5');
      // el perfil del gestor: el que manda el panel, o el fichero si no viene
      let gp = pl.gestorProfile;
      if (!gp) {
        const all = withEmulatedProfiles(loadGestorProfiles());
        if (all) {
          const base = pid.split('.')[0];
          gp = all[base] || all[pid];
        }
      }
      if (!gp) {
        setBaseHeaders(res); setNoCacheHeaders(res);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'perfil del gestor no encontrado: ' + pid + ' (y el JSON no lo tiene)' }));
      }
      // la funcion objetivo con lo que pida el panel
      const obj = objective({
        inW: pl.inW, inH: pl.inH, inFps: pl.inFps,
        outW: pl.outW, outH: pl.outH,
        player: pl.player || 'onn-4k', mode: pl.mode || 'real'
      });
      if (!obj.ok) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(obj)); }
      // version COMPLETA: todos los campos, con cascada
      const prop = proposeAlignmentFull(gp, obj);
      prop.gestorProfile = gp;   // el panel lo necesita para aplicar
      prop.objective = {
        mode: obj.mode, chain: obj.chain, cost: obj.cost,
        fields: obj.fields, warnings: obj.warnings.slice(0, 4), impossible: obj.impossible
      };
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(prop));
    });
    return;
  }

  /* Que perfiles del gestor conoce el motor (para que el panel pueda listarlos) */
  /* APLICA la alineacion: devuelve el perfil nuevo para que el panel lo guarde */
  /* ALINEACION CON LLM: determinista primero, el LLM mejora, se valida */
  /* ALINEA LOS 6 PERFILES DE GOLPE: 6 x 577 = 3.366 campos */
  /* APLICA la alineacion de los 6 perfiles: devuelve los 6 perfiles nuevos */
  if (u.pathname === '/image/profile/align-all/apply' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 8 * 1024 * 1024) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande (>8MB)' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const inProfiles = pl.profiles;
      if (!inProfiles || typeof inProfiles !== 'object') {
        setBaseHeaders(res); setNoCacheHeaders(res);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'se requiere {profiles: {P0:{gestorProfile,diffs}, ...}}' }));
      }
      const out = { ok: true, profiles: {}, totals: { profiles: 0, applied: 0, failed: 0 } };
      for (const pid of Object.keys(inProfiles)) {
        const item = inProfiles[pid];
        if (!item || !item.gestorProfile || !Array.isArray(item.diffs)) continue;
        const r = applyAlignment(item.gestorProfile, item.diffs);
        out.profiles[pid] = r;
        out.totals.profiles++;
        out.totals.applied += r.applied;
        out.totals.failed += r.failed.length;
      }
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    });
    return;
  }

  if (u.pathname === '/image/profile/align-all' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 1024 * 1024) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const all = withEmulatedProfiles(loadGestorProfiles());
      if (!all) {
        setBaseHeaders(res); setNoCacheHeaders(res);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'no hay perfiles del gestor cargados' }));
      }
      const obj = objective({
        inW: pl.inW, inH: pl.inH, inFps: pl.inFps,
        outW: pl.outW, outH: pl.outH,
        player: pl.player || 'onn-4k', mode: pl.mode || 'real'
      });
      if (!obj.ok) {
        setBaseHeaders(res); setNoCacheHeaders(res);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(obj));
      }
      const out = {
        ok: true, mode: obj.mode, output: obj.output,
        profiles: {}, totals: { profiles: 0, fields: 0, proposed: 0, unchanged: 0, cascade: 0 }
      };
      for (const pid of Object.keys(all)) {
        const gp = all[pid];
        if (!gp || typeof gp !== 'object') continue;
        const p = proposeAlignmentFull(gp, obj);
        p.gestorProfile = gp;
        out.profiles[pid] = p;
        out.totals.profiles++;
        out.totals.fields += p.totalFields;
        out.totals.proposed += p.proposed;
        out.totals.unchanged += p.unchanged;
        out.totals.cascade += p.cascadeCount;
      }
      out.note = 'PROPUESTA de los ' + out.totals.profiles + ' perfiles. No se aplico nada.';
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    });
    return;
  }

  if (u.pathname === '/image/profile/align-llm' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 1024 * 1024) { tooBig = true; req.destroy(); } });
    req.on('end', async () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const pid = String(pl.profile || 'P0');
      let gp = pl.gestorProfile;
      if (!gp) {
        const all = loadGestorProfiles();
        if (all) gp = all[pid.split('.')[0]] || all[pid];
      }
      if (!gp) {
        setBaseHeaders(res); setNoCacheHeaders(res);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'perfil no encontrado: ' + pid }));
      }
      const obj = objective({
        inW: pl.inW, inH: pl.inH, inFps: pl.inFps,
        outW: pl.outW, outH: pl.outH,
        player: pl.player || 'onn-4k', mode: pl.mode || 'real'
      });
      if (!obj.ok) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(obj)); }

      // 1. base determinista (incluye L1-L7)
      const base = proposeAlignmentFull(gp, obj);
      base.gestorProfile = gp;

      // 2. el LLM puede mejorarla
      const t0 = Date.now();
      const llm = await callLLMAlign(gp, base, obj);
      const ms = Date.now() - t0;
      if (llm.error) {
        base.llm = { used: false, error: llm.error, ms, source: 'deterministico' };
        setBaseHeaders(res); setNoCacheHeaders(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(base));
      }
      // 3. validacion campo a campo
      const v = validateLLMDiffs(llm.proposal && llm.proposal.diffs, gp);
      // fusion: la determinista manda; el LLM aporta solo lo que la base no toco
      const basePaths = {};
      for (const d of base.diffs) basePaths[d.path] = true;
      const extra = v.valid.filter((d) => !basePaths[d.path]);
      for (const d of extra) base.diffs.push(d);
      base.proposed = base.diffs.length;
      base.unchanged = Math.max(0, base.totalFields - base.diffs.length);
      base.cascadeCount = base.diffs.filter((d) => d.cascade).length;
      base.llm = {
        used: true, ms, source: 'llm+validacion',
        applied: v.applied.length, rejected: v.rejected,
        extra_over_deterministic: extra.length,
        razon: String((llm.proposal && llm.proposal.razon) || '').slice(0, 400),
        riesgo: String((llm.proposal && llm.proposal.riesgo) || '').slice(0, 400)
      };
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(base));
    });
    return;
  }

  if (u.pathname === '/image/profile/align/apply' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 1024 * 1024) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      if (!pl.gestorProfile || !Array.isArray(pl.diffs)) {
        setBaseHeaders(res); setNoCacheHeaders(res);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'se requieren gestorProfile y diffs' }));
      }
      const r = applyAlignment(pl.gestorProfile, pl.diffs);
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(r));
    });
    return;
  }

  /* Perfil crudo del gestor, para que el panel pueda aplicar sobre el */
  if (u.pathname.match(/^\/image\/gestor\/profile\/[^/]+$/)) {
    const pid = decodeURIComponent(u.pathname.split('/')[4] || '');
    const all = loadGestorProfiles();
    setBaseHeaders(res); setNoCacheHeaders(res);
    if (!all || !all[pid]) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'perfil inexistente: ' + pid }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, id: pid, profile: all[pid] }));
  }

  if (u.pathname === '/image/gestor/profiles') {
    const all = loadGestorProfiles();
    setBaseHeaders(res); setNoCacheHeaders(res);
    if (!all) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'no se pudo leer ' + PROFILES_JSON }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      count: Object.keys(all).length,
      profiles: Object.keys(all).map((k) => ({
        id: k,
        name: all[k].name || k,
        level: all[k].level,
        fields: countFields(all[k]),
        sections: Object.keys(all[k]).filter((x) => typeof all[k][x] === 'object')
      }))
    }));
  }

  if (u.pathname === '/image/llm-status') {
    const has = !!readLLMKey();
    setBaseHeaders(res); setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      configured: has,
      model: LLM_MODEL,
      endpoint: process.env.LLM_ENDPOINT || 'https://api.deepseek.com/chat/completions',
      timeoutMs: LLM_TIMEOUT_MS,
      source: process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY
        ? 'entorno' : (llmKeyCache ? 'archivo ' + LLM_KEY_FILE : 'ninguna'),
      keyFile: LLM_KEY_FILE,
      note: has
        ? 'El LLM propone; la validacion por rangos reales decide. Si falla, gana el determinista.'
        : 'Sin API key: el motor determinista responde. Guardala desde el panel (se aplica en caliente, sin reiniciar).'
    }));
  }

  if (u.pathname === '/image/optimize' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 65536) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const r = objective(pl);
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(r));
    });
    return;
  }

  /* La misma funcion por GET, para probar desde terminal */
  if (u.pathname === '/image/optimize') {
    const q = u.searchParams;
    const r = objective({
      inW: q.get('inW'), inH: q.get('inH'), inFps: q.get('inFps'),
      outW: q.get('outW'), outH: q.get('outH'),
      player: q.get('player') || 'onn-4k', mode: q.get('mode') || 'real'
    });
    setBaseHeaders(res); setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(r));
  }

  if (u.pathname === '/image/rules/auto' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 32768) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const r = autoConfig(pl);
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(r));
    });
    return;
  }

  /* AUTO de UN SOLO CAMPO: para la ayuda por campo del panel */
  if (u.pathname === '/image/rules/auto-field') {
    const field = String(u.searchParams.get('field') || '');
    const r = autoConfig({
      inW: u.searchParams.get('inW'), inH: u.searchParams.get('inH'),
      inFps: u.searchParams.get('inFps'), outW: u.searchParams.get('outW'),
      outH: u.searchParams.get('outH'), player: u.searchParams.get('player') || 'onn-4k',
      mode: u.searchParams.get('mode') || 'real'
    });
    setBaseHeaders(res); setNoCacheHeaders(res);
    if (!r.ok) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r)); }
    if (field && r.fields[field]) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, field, ...r.fields[field], areaRatio: r.areaRatio, impossible: r.impossible, warnings: r.warnings }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(r));
  }

  if (u.pathname === '/image/rules' && req.method === 'GET') {
    setBaseHeaders(res); setNoCacheHeaders(res);
    // agrupadas por entrada para que se vea que 720p tiene N salidas
    const byInput = {};
    for (const r of transformRules) {
      if (!byInput[r.input]) byInput[r.input] = [];
      byInput[r.input].push(r);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      count: transformRules.length,
      bands: Object.keys(INPUT_BANDS),
      // esto es lo que el operador pidio: una entrada, varias salidas
      byInput,
      rules: transformRules,
      model: 'Una regla es entrada -> salida. Varias reglas pueden compartir la misma entrada con salidas distintas.'
    }));
  }

  if (u.pathname === '/image/rules' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 32768) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const r = upsertRule(pl);
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(r));
    });
    return;
  }

  if (u.pathname.match(/^\/image\/rules\/[^/]+$/) && req.method === 'DELETE') {
    const id = decodeURIComponent(u.pathname.split('/')[3] || '');
    const r = deleteRule(id);
    setBaseHeaders(res); setNoCacheHeaders(res);
    res.writeHead(r.ok ? 200 : 404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(r));
  }

  /* Que reglas aplican a una entrada REAL concreta */
  if (u.pathname === '/image/rules/resolve') {
    const w = Math.round(Number(u.searchParams.get('w')) || 0);
    const h = Math.round(Number(u.searchParams.get('h')) || 0);
    setBaseHeaders(res); setNoCacheHeaders(res);
    if (!w || !h) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'se requieren w y h' }));
    }
    const fps = Number(u.searchParams.get('fps')) || 0;
    const r = rulesForInput(w, h, fps);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, ...r, count: r.matches.length }));
  }

  if (u.pathname === '/image/governance' && req.method === 'GET') {
    setBaseHeaders(res);
    setNoCacheHeaders(res);
    const map = loadMap();
    /* El perfil de cada canal se resuelve IGUAL que en la lista: override del
     * canal si lo hay, y si no el mejor que el motor pueda decodificar. Antes
     * mostraba governance.defaultProfile a pelo, asi que la tabla decia P4.5
     * (6K) mientras la lista entregaba P1. La etiqueta mentia. */
    const eng = String(u.searchParams.get('engine') || 'ott');
    const engineBest = bestProfileForEngine(eng);
    const rows = Object.keys(map).filter((id) => map[id] && map[id].url).map((id) => {
      const ov = governance.channels && governance.channels[id];
      // el perfil del operador manda; el decoder solo marca si no puede
      const pid = (ov && ov.profile && profileMatrix[ov.profile]) ? ov.profile : governance.defaultProfile;
      const p = profileMatrix[pid] || {};
      const over = (p.outW > engineBest.caps.maxW || p.outH > engineBest.caps.maxH);
      return {
        channel: id,
        name: (map[id].name || '').slice(0, 60),
        group: (map[id].group || '').slice(0, 30),
        profile: pid,
        target: (p.outW || 0) + 'x' + (p.outH || 0),
        overridden: !!ov,
        decodable: !over
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      defaultProfile: governance.defaultProfile,
      engine: eng,
      decoderPlayer: engineBest.player,
      decoderMax: engineBest.caps.maxW + 'x' + engineBest.caps.maxH,
      bestForDecoder: engineBest.profile,
      exceedsDecoder: rows.filter((r) => !r.decodable).length,
      rule: 'El perfil es la eleccion del operador. Si supera el decoder se declara como aviso, no se cambia.',
      channels: rows,
      count: rows.length,
      engines: PLAYER_ENGINES,
      mechanism: 'El VPS entrega una URL con el perfil resuelto y el JIT produce esa salida. El player solo reproduce. video-filter en playlist es inerte por politica de VLC.'
    }));
  }

  if (u.pathname === '/image/governance' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 32768) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'body grande' })); }
      let pl;
      try { pl = JSON.parse(body || '{}'); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const errs = [];
      if (pl.defaultProfile != null) {
        if (!profileMatrix[String(pl.defaultProfile)]) errs.push('perfil inexistente: ' + pl.defaultProfile);
        else governance.defaultProfile = String(pl.defaultProfile);
      }
      if (pl.channel != null) {
        const ch = String(pl.channel);
        if (pl.profile === null || pl.profile === '') delete governance.channels[ch];
        else if (!profileMatrix[String(pl.profile)]) errs.push('perfil inexistente: ' + pl.profile);
        else governance.channels[ch] = { profile: String(pl.profile), at: new Date().toISOString() };
      }
      if (errs.length) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, errors: errs })); }
      const saved = saveGovernance();
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, persisted: saved, defaultProfile: governance.defaultProfile, overrides: Object.keys(governance.channels).length }));
    });
    return;
  }

  if (u.pathname === '/image/lineup') {
    const engine = String(u.searchParams.get('engine') || 'ott');
    if (!PLAYER_ENGINES[engine]) {
      setBaseHeaders(res); setNoCacheHeaders(res);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'motor desconocido: ' + engine + '. validos: ' + Object.keys(PLAYER_ENGINES).join(',') }));
    }
    const base = String(u.searchParams.get('base') || ((req.headers['x-forwarded-proto'] || 'https') + '://' + (req.headers.host || 'iptv-ape.duckdns.org')));
    const lin = buildGovernedLineup({ engine, base });
    setBaseHeaders(res);
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl; charset=utf-8' });
    return res.end(lin.text);
  }

  if (u.pathname === '/image/matrix' && req.method === 'GET') {
    setBaseHeaders(res);
    setNoCacheHeaders(res);
    const rows = Object.keys(profileMatrix).map((id) => {
      const p = profileMatrix[id];
      const lab = LAB_PROFILES[id] || {};
      return {
        profile: id,
        label: p.label,
        labDeclared: lab.declared || null,
        outW: p.outW, outH: p.outH,
        scaleMode: p.scaleMode, flags: p.flags, sar: p.sar, pad: p.pad, dither: p.dither,
        editable: ['outW', 'outH', 'scaleMode', 'flags', 'sar', 'pad', 'dither', 'label']
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      count: rows.length,
      rows,
      allowed: MATRIX_ALLOWED,
      limits: MATRIX_LIMITS,
      // espacio de calculos que el motor puede generar
      spaceSize: Object.keys(profileMatrix).length * COMMON_INPUTS.length *
        MATRIX_ALLOWED.scaleMode.length * MATRIX_ALLOWED.flags.length * MATRIX_ALLOWED.dither.length,
      inputs: COMMON_INPUTS.map((i) => ({ name: i.name, width: i.width, height: i.height }))
    }));
  }

  /* \u2500\u2500 EDITAR un perfil de la matriz \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  if (u.pathname === '/image/matrix' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => { body += chunk; if (body.length > 32768) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'body demasiado grande' }));
      }
      let payload;
      try { payload = JSON.parse(body || '{}'); }
      catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const r = patchProfile(String(payload.profile || ''), payload.patch || {});
      setBaseHeaders(res);
      setNoCacheHeaders(res);
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(r));
    });
    return;
  }

  /* \u2500\u2500 CALCULAR el plan: entrada real -> salida del perfil \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  if (u.pathname === '/image/plan' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => { body += chunk; if (body.length > 32768) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'body demasiado grande' }));
      }
      let payload;
      try { payload = JSON.parse(body || '{}'); }
      catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
      }
      const plan = computePlan(String(payload.profile || ''), payload.input || {});
      setBaseHeaders(res);
      setNoCacheHeaders(res);
      res.writeHead(plan.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(plan));
    });
    return;
  }

  /* \u2500\u2500 ENUMERAR miles de calculos por perfil \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  if (u.pathname === '/image/plans') {
    const q = u.searchParams;
    const qlist = (k) => (q.get(k) ? String(q.get(k)).split(',').map((x) => x.trim()).filter(Boolean) : null);
    const out = enumeratePlans({
      profiles: qlist('profiles'),
      inputs: qlist('inputs'),
      modes: qlist('modes'),
      flags: qlist('flags'),
      dither: qlist('dither'),
      limit: q.get('limit'),
      offset: q.get('offset')
    });
    setBaseHeaders(res);
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // resumen + primera pagina de filas para no devolver megabytes
    const rows = out.rows.slice(0, Math.min(out.rows.length, 40));
    return res.end(JSON.stringify({
      ok: true,
      totalEnumerated: out.totalEnumerated,
      returned: out.returned,
      shown: rows.length,
      offset: out.offset,
      limit: out.limit,
      spaceSize: out.spaceSize,
      rows
    }));
  }

  /* ── PERFILES DEL LAB: los 12, con su destino y su viabilidad medida ─────── */
  if (u.pathname === '/image/profiles') {
    setBaseHeaders(res);
    setNoCacheHeaders(res);
    const rows = Object.keys(LAB_PROFILES).map((k) => {
      const p = LAB_PROFILES[k];
      return {
        profile: k,
        declared: p.declared,
        target: p.target,
        treatment: p.treatment,
        measured_viable: p.measured_viable,
        fallback_viable: LAB_PROFILE_FALLBACK[k] || null,
        note: p.note || null
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      count: rows.length,
      rows,
      current_profile: imageConfig.profile || null,
      current_target: imageConfig.target,
      rule: 'SD/720p -> QHD; 1080p -> UHD; 4K -> mantener UHD (politica del informe)',
      measured_reality: 'En este host NINGUNO de los 12 destinos declarados es viable con filtros: '
        + 'QHD da 1,05-1,19x y UHD 0,25x, frente al 1,2x exigido. '
        + 'El unico destino certificable es FHD_1080 a 25 fps (1,37-1,76x).'
    }));
  }

  /* ── ESTADO VIVO del modulo de imagen ───────────────────────────────────── */
  if (u.pathname === '/image/state') {
    setBaseHeaders(res);
    setNoCacheHeaders(res);
    const cur = current;
    let output = null;
    let segs = 0;
    let mediaList = [];
    try {
      const dir = cur && cur.dir;
      if (dir && fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir)) {
          if (name.startsWith('init-') || name.startsWith('chunk-')) segs++;
          if (name.endsWith('.m3u8')) mediaList.push(name);
        }
        const mpd = path.join(dir, 'manifest.mpd');
        if (fs.existsSync(mpd)) mediaList.push('manifest.mpd');
      }
    } catch (e) { /* noop */ }
    if (cur && cur.outputTruth) output = cur.outputTruth;
    const started = cur && cur.started ? cur.started : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      job: cur ? {
        channel: cur.id,
        variant: cur.sdr720 ? 'sdr720' : (cur.sdr ? 'sdr' : 'hdr'),
        pid: cur.child && cur.child.pid ? cur.child.pid : null,
        started_at: started ? new Date(started).toISOString() : null,
        age_s: started ? Math.round((Date.now() - started) / 1000) : null,
        mode: cur.crystalMode || null,
        copy: !!cur.copyNative,
        sdr: !!cur.sdr,
        output_width: cur.outWidth || null,
        output_height: cur.outHeight || null,
        source_width: cur.sourceWidth || null,
        source_height: cur.sourceHeight || null
      } : null,
      output_observed: output,
      measured_bandwidth: measuredBandwidth(cur),
      files: { segments: segs, playlists: mediaList.slice(0, 8) },
      config: {
        target: imageConfig.target, recipe: imageConfig.recipe, fps: imageConfig.fps,
        codec: imageConfig.codec, preset: imageConfig.preset, crf: imageConfig.crf,
        audio: imageConfig.audio, force_transcode: imageConfig.force_transcode,
        profile: imageConfig.profile || null,
        idle_stop_s: Math.round(IDLE_MS / 1000),
        governor_applied: governorApplied,
        derived_target: (imageConfig.profile && LAB_PROFILES[imageConfig.profile])
          ? LAB_PROFILES[imageConfig.profile].target : null
      },
      effective_filter: buildImageFilterChain(imageConfig),
      engine: {
        processing_domain: PROCESSING_DOMAIN,
        rea_executed: false,
        slot: liveKids.size,
        source: imageConfigSource
      }
    }));
  }

  if (u.pathname === '/image/config' || u.pathname === '/image/capacity') {
    setBaseHeaders(res);
    setNoCacheHeaders(res);
    if (u.pathname === '/image/capacity') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true, ...IMAGE_MEASURED_CAPACITY,
        targets: IMAGE_TARGETS, limits: IMAGE_LIMITS
      }));
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        config: imageConfig,
        source: imageConfigSource,
        defaults: IMAGE_DEFAULTS,
        effective_filter: buildImageFilterChain(imageConfig),
        capabilities: { targets: IMAGE_LIMITS.targets, recipes: IMAGE_LIMITS.recipes,
          codecs: IMAGE_LIMITS.codecs, presets: IMAGE_LIMITS.presets, fps: IMAGE_LIMITS.fps }
      }));
    }
    if (req.method === 'POST') {
      let body = '';
      let tooBig = false;
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 16384) { tooBig = true; req.destroy(); }
      });
      req.on('end', () => {
        if (tooBig) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'body demasiado grande' }));
        }
        let patch;
        try { patch = JSON.parse(body || '{}'); }
        catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'JSON invalido' }));
        }
        const norm = normalizeImageConfig(patch);
        if (!norm.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, errors: norm.errors, config: imageConfig }));
        }
        // Guardar: si el disco falla, NO se aplica. Mejor no cambiar que cambiar a medias.
        try {
          fs.writeFileSync(IMAGE_CONFIG_FILE + '.tmp', JSON.stringify(norm.config, null, 2));
          fs.renameSync(IMAGE_CONFIG_FILE + '.tmp', IMAGE_CONFIG_FILE);
        } catch (e) {
          log('IMAGE_CONFIG_WRITE_FAILED', e.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'no se pudo persistir: ' + e.message }));
        }
        imageConfig = norm.config;
        imageConfigSource = IMAGE_CONFIG_FILE;
        log('IMAGE_CONFIG_APPLIED', JSON.stringify({
          target: imageConfig.target, recipe: imageConfig.recipe,
          codec: imageConfig.codec, preset: imageConfig.preset, crf: imageConfig.crf,
          filter: buildImageFilterChain(imageConfig) || '(sin filtros)'
        }));
        // Aplicar al siguiente arranque: se detiene el job vivo para que la
        // proxima peticion construya el plan con la receta nueva.
        try { stopCurrent('image_config_changed'); } catch (e) { /* noop */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          ok: true,
          config: imageConfig,
          effective_filter: buildImageFilterChain(imageConfig),
          applied_at_next_start: true,
          note: 'el job en curso se detuvo; la proxima peticion usara la receta nueva'
        }));
      });
      return;
    }
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'usa GET o POST' }));
  }

  if (u.pathname === '/health') {
    setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true, active: current ? current.id : null,
      pid: current ? current.child.pid : null,
      uptime_s: current ? Math.round((Date.now() - current.started) / 1000) : 0,
    }));
  }
  const jm = u.pathname.match(/^\/live\/([^/]+)\/(sdr720\/|sdr\/)?manifest\.json$/);
  if (jm) {
    const id = safeId(jm[1]);
    if (!id) { res.writeHead(400); return res.end('bad channel'); }
    const sdr720 = jm[2] === 'sdr720/';
    const sdr = !sdr720 && jm[2] === 'sdr/';
    // Start on manifest request so a player that asks JSON first also warms.
    const map = loadMap();
    if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }
    if (!current || current.id !== id || !!current.sdr !== sdr || !!current.sdr720 !== sdr720) {
      const _k = chKey(id, sdr, sdr720);
      booting.add(_k);
      // start() es async (espera el slot unico). El guard de abajo evita el
      // TypeError que habia en `current.lastAccess` cuando el arranque no dejaba
      // current seteado. La marca booting caduca sola para no enmascarar muertes.
      start(id, map[id], sdr, sdr720)
        .catch((e) => recordStartFailure(id, sdr, sdr720, e))
        .finally(() => setTimeout(() => booting.delete(_k), BOOT_GRACE_MS));
    }
    if (current) current.lastAccess = Date.now();
    return ensureOutputTruth(current && current.id === id ? current : null).then(() => {
      setNoCacheHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(manifestJson(req, id, sdr, sdr720)));
    });
  }
  const m = u.pathname.match(/^\/live\/([^/]+)\/(sdr720\/|sdr\/)?(master\.m3u8|index\.m3u8|manifest\.mpd|media_[0-9]+\.m3u8|init-[A-Za-z0-9_-]+\.m4s|chunk-[A-Za-z0-9_-]+\.m4s)$/);
  if (!m) { res.writeHead(404); return res.end('not found'); }
  const id = safeId(m[1]);
  if (!id) { res.writeHead(400); return res.end('bad channel'); }
  const sdr720 = m[2] === 'sdr720/';
  const sdr = !sdr720 && m[2] === 'sdr/';
  const map = loadMap();
  if (!map[id] || !map[id].url) { res.writeHead(404); return res.end('unknown channel'); }
  if (!current || current.id !== id || !!current.sdr !== sdr || !!current.sdr720 !== sdr720) {
    const _k = chKey(id, sdr, sdr720);
    booting.add(_k);
    start(id, map[id], sdr, sdr720)
      .catch((e) => recordStartFailure(id, sdr, sdr720, e))
      .finally(() => setTimeout(() => booting.delete(_k), BOOT_GRACE_MS));
  }
  if (current) current.lastAccess = Date.now();

  let name = m[3];
  if (name === 'index.m3u8') name = 'media_0.m3u8';
  const waitName = (name === 'master.m3u8' || name === 'manifest.mpd' || name === 'media_0.m3u8') ? name : null;
  const serve = async () => {
    const file = path.join(OUT_ROOT, id, sdr720 ? 'sdr720' : (sdr ? 'sdr' : ''), name);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not ready'); }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const kind = name === 'master.m3u8' ? 'master'
      : name === 'manifest.mpd' ? 'mpd'
      : /^media_[0-9]+\.m3u8$/.test(name) ? 'media'
      : /^init-.*\.m4s$/.test(name) ? 'init'
      : /^chunk-.*\.m4s$/.test(name) ? 'seg'
      : 'seg';
    if (name === 'master.m3u8' || name === 'manifest.mpd') {
      const state = current && current.id === id && !!current.sdr === sdr && !!current.sdr720 === sdr720 ? current : null;
      await ensureOutputTruth(state);
      const stat = fs.statSync(file);
      const etag = fileETag(stat);
      res.locals.cache = kind;
      setObjectCacheHeaders(res, kind);
      res.setHeader('ETag', etag);
      if (isFresh(req, etag)) {
        res.writeHead(304);
        return res.end();
      }
      const txt = fs.readFileSync(file, 'utf8');
      if (name === 'master.m3u8') {
        res.setHeader('Link', '</jit/meta/' + encodeURIComponent(id) + '.json>; rel="describedby"; type="application/json"');
      }
      res.writeHead(200, { 'Content-Type': type });
      return res.end(name === 'master.m3u8' ? hdrMaster(txt, state) : hdrMpdSanitized(txt, state));
    }
    sendStatic(req, res, file, type, kind);
  };
  const serveError = () => {
    if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'text/plain' });
    if (!res.writableEnded) res.end('output unavailable');
  };
  if (waitName) return waitForFile(id, waitName, (err) => {
    if (err) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end(err.message); }
    serve().catch(serveError);
  }, sdr, sdr720);
  serve().catch(serveError);
});

/* HARDENING (bug D) — el idle mataba el stream antes de nacer.
 * Log medido: START 14:18:00 -> STOP idle 14:18:30 -> 0 ficheros, y el
 * 'failed to rename' justo despues. lastAccess se fija en start(), y hasta que
 * ffmpeg escribe el primer chunk el cliente no tiene nada que pedir: el idle
 * contaba como abandono lo que en realidad era arranque normal.
 *
 * Con max_connections=1 hay que liberar rapido, asi que NO basta con un grace
 * fijo: se distingue ARRANQUE de ABANDONO por el output real en disco.
 *   - sin ficheros  -> es arranque: solo se corta si se pasa BOOT_GRACE_MS
 *                      (asi un ffmpeg colgado no bloquea el slot para siempre)
 *   - con ficheros  -> arranco: aplica el idle normal (libera el slot rapido)
 */
function dirHasOutput(dir) {
  try {
    return fs.readdirSync(dir).some((f) => f.endsWith('.m4s') || f.endsWith('.mpd') || f.endsWith('.m3u8'));
  } catch (_) { return false; }
}
if (require.main === module) {
setInterval(() => {
  if (!current) return;
  const now = Date.now();
  if (!dirHasOutput(current.dir)) {
    if (now - (current.started || 0) > BOOT_GRACE_MS) {
      log('BOOT_TIMEOUT', current.id, 'sin output tras ' + BOOT_GRACE_MS + 'ms, liberando slot');
      stopCurrent('boot-timeout');
    }
    return;
  }
  if (now - current.lastAccess > IDLE_MS) stopCurrent('idle');
}, 5000);
process.on('SIGTERM', () => { stopCurrent('signal'); process.exit(0); });
process.on('SIGINT', () => { stopCurrent('signal'); process.exit(0); });

fs.mkdirSync(OUT_ROOT, { recursive: true });
server.listen(PORT, BIND, () => log('LISTEN', BIND + ':' + PORT, 'map=' + MAP_FILE));
}

module.exports = { buildEncodingPlan, probeOutputFile, ensureOutputTruth, outputDescriptor,
  hdrMaster, hdrMpd, manifestJson, videoRange, safeStartFailure, redactUpstreamUrls, PROCESSING_DOMAIN, REA_POLICY_REF };









