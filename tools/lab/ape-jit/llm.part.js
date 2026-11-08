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
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return { error: 'sin DEEPSEEK_API_KEY en el entorno del motor' };
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

