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

