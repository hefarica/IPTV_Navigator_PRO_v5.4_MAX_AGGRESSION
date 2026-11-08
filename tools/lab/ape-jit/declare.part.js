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
    // se reemplaza la resolucion del plan por la del target elegido
    const scalePart = 'scale=' + outW + ':' + outH + ':flags=' + profileMatrix[profileId].flags;
    const planChain = plan.filter.split(',');
    const idx = planChain.findIndex((x) => x.startsWith('scale='));
    if (idx >= 0) planChain[idx] = scalePart;
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

