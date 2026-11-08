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

