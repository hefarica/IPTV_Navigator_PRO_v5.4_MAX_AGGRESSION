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

