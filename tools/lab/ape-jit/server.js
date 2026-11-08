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
  { id: 'r-720-60-4k-30',  input: '720p', inFps: 60, outW: 3840, outH: 2160, outFps: 30, codec: 'hvc1', recipe: 'balanced', dither: 'error_diffusion', profile: 'P4', label: '720p60 -> 4K30' },
  { id: 'r-720-60-4k-60',  input: '720p', inFps: 60, outW: 3840, outH: 2160, outFps: 60, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', profile: 'P4', label: '720p60 -> 4K60' },
  { id: 'r-720-60-1080-30', input: '720p', inFps: 60, outW: 1920, outH: 1080, outFps: 30, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', profile: 'P4', label: '720p60 -> 1080p30' },
  { id: 'r-720-60-6k-30',  input: '720p', inFps: 60, outW: 5760, outH: 3240, outFps: 30, codec: 'hvc1', recipe: 'temporal', dither: 'error_diffusion', profile: 'P4', label: '720p60 -> 6K30' },
  // === 720p @30 -> salidas y cadencias, INCLUIDA SUBIDA a 60 ==
  { id: 'r-720-30-1440-60', input: '720p', inFps: 30, outW: 2560, outH: 1440, outFps: 60, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', profile: 'P4', label: '720p30 -> 2K60' },
  { id: 'r-720-30-4k-30',  input: '720p', inFps: 30, outW: 3840, outH: 2160, outFps: 30, codec: 'hvc1', recipe: 'balanced', dither: 'error_diffusion', profile: 'P4', label: '720p30 -> 4K30' },
  { id: 'r-720-30-6k-30',  input: '720p', inFps: 30, outW: 5760, outH: 3240, outFps: 30, codec: 'hvc1', recipe: 'temporal', dither: 'error_diffusion', profile: 'P4', label: '720p30 -> 6K30' },
  // === 1080p @50/60 ===
  { id: 'r-1080-60-4k-30', input: '1080p', inFps: 60, outW: 3840, outH: 2160, outFps: 30, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', profile: 'P3', label: '1080p60 -> 4K30' },
  { id: 'r-1080-50-1080-50', input: '1080p', inFps: 50, outW: 1920, outH: 1080, outFps: 50, codec: 'hvc1', recipe: 'none', dither: 'error_diffusion', profile: 'P3', label: '1080p50 -> 1080p50' },
  { id: 'r-1080-30-4k-60', input: '1080p', inFps: 30, outW: 3840, outH: 2160, outFps: 60, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', profile: 'P3', label: '1080p30 -> 4K60' },
  { id: 'r-1080-30-6k-30', input: '1080p', inFps: 30, outW: 5760, outH: 3240, outFps: 30, codec: 'hvc1', recipe: 'temporal', dither: 'error_diffusion', profile: 'P3', label: '1080p30 -> 6K30' },
  // === 4K: conservar y subir ===
  { id: 'r-4k-60-4k-60', input: '4K', inFps: 60, outW: 3840, outH: 2160, outFps: 60, codec: 'hvc1', recipe: 'none', dither: 'error_diffusion', profile: 'P1', label: '4K60 -> 4K60' },
  { id: 'r-4k-60-6k-30', input: '4K', inFps: 60, outW: 5760, outH: 3240, outFps: 30, codec: 'hvc1', recipe: 'light', dither: 'error_diffusion', profile: 'P1', label: '4K60 -> 6K30' },
  { id: 'r-4k-30-8k-30', input: '4K', inFps: 30, outW: 7680, outH: 4320, outFps: 30, codec: 'hvc1', recipe: 'balanced', dither: 'error_diffusion', profile: 'P1', label: '4K30 -> 8K30' },
  // === 480p ===
  { id: 'r-480-30-1080-30', input: '480p', inFps: 30, outW: 1920, outH: 1080, outFps: 30, codec: 'hvc1', recipe: 'balanced', dither: 'ordered', profile: 'P5', label: '480p30 -> 1080p30' },
  { id: 'r-480-30-4k-30', input: '480p', inFps: 30, outW: 3840, outH: 2160, outFps: 30, codec: 'hvc1', recipe: 'temporal', dither: 'ordered', profile: 'P5', label: '480p30 -> 4K30' }
];

let transformRules = [];

function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      const raw = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
      if (Array.isArray(raw) && raw.length) { transformRules = raw; return; }
    }
  } catch (_) { /* corrupto -> seed */ }
  transformRules = RULES_SEED.map((r) => Object.assign({}, r));
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
  if (errs.length) return { ok: false, errors: errs };

  const row = {
    id,
    input,
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

  if (outW > caps.maxW || outH > caps.maxH) {
    impossible.push('el decoder de ' + caps.label + ' llega a ' + caps.maxW + 'x' + caps.maxH
      + '; ' + outW + 'x' + outH + ' NO se puede decodificar en ese device');
  }
  const codecCat = CODEC_CATALOG[codec.id];
  if (codecCat && codecCat.family === 'avc' && outPx > 1920 * 1080) {
    impossible.push('AVC por encima de 1080p no es seguro en decoders Android');
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
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
    const r = declareProfile({
      profile: pid,
      input: { width: Number(q.get('w')) || 1280, height: Number(q.get('h')) || 720 },
      player: q.get('player') || 'onn-4k',
      codec: q.get('codec') || 'hvc1',
      recipe: q.get('recipe') || 'balanced',
      fps: q.get('fps') || 25
    });
    setBaseHeaders(res); setNoCacheHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, matrix: row, resolved: r }));
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
      outH: u.searchParams.get('outH'), player: u.searchParams.get('player') || 'onn-4k'
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









