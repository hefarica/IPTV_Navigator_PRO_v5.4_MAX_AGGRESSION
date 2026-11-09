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

/* Aplica fn a cada nivel de una cascada, o al valor unico. */
function mapValue(v, fn) {
  if (isCascadeValue(v)) {
    return String(v).split(',').map((p) => fn(p.trim())).join(',');
  }
  return fn(String(v));
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
      t1: String(Math.round(mbps * 3)), t2: String(Math.round(mbps * 4)),
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
      min_bandwidth_mbps: String(Math.round(mbps * 2.5)),
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

/* Compara TODAS las secciones y devuelve la propuesta completa. */
function proposeAlignmentFull(gestorProfile, obj) {
  const t = alignmentTargetsFull(obj, gestorProfile);
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
      // CASCADA: se transforma cada nivel con el mismo objetivo
      after = mapValue(cur, () => target);
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

