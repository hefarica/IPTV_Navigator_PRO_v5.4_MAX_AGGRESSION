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

function evenFloor(n) { const v = Math.floor(Number(n) / 2) * 2; return v < 2 ? 2 : v; }

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
      padX = evenFloor((outW - scaledW) / 2) / 2;
      padY = evenFloor((outH - scaledH) / 2) / 2;
    } else {
      // fill: cubre todo y recorta el sobrante
      if (dar > outDar) { scaledH = outH; scaledW = evenFloor(outH * dar); }
      else { scaledW = outW; scaledH = evenFloor(outW / dar); }
      scaledW = evenFloor(scaledW); scaledH = evenFloor(scaledH);
      cropped = true;
    }
  }

  const cropX = cropped ? evenFloor((scaledW - outW) / 2) : 0;
  const cropY = cropped ? evenFloor((scaledH - outH) / 2) : 0;

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
  if (p.dither && p.dither !== 'none') chain.push('format=yuv420p10le:dither=' + p.dither);

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
    pad: { left: padX * 2, right: outW - scaledW - padX * 2, top: padY * 2, bottom: outH - scaledH - padY * 2 },
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

