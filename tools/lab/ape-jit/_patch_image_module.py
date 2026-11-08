"""
Instrumentacion del modulo de imagen del JIT APE.
Aplica UN solo parche quirurgico sobre tools/lab/ape-jit/server.js:

  1. Modulo IMAGE CONFIG  -> configuracion de imagen en caliente, persistida en JSON
  2. buildEncodingPlan    -> lee la config en vez de resoluciones hardcodeadas
  3. Rutas                -> GET/POST /image/config, GET /image/capacity
  4. Cadena de filtros    -> hqdn3d / unsharp / atadenoise reales con parametros vivos

No cambia el comportamiento por defecto: target='source' y recipe='none' dejan
el plan EXACTAMENTE como estaba (FHD_SDR -> H.264 1920x1080).
"""
import io
import sys

SRV = "tools/lab/ape-jit/server.js"
s = io.open(SRV, encoding="utf-8").read()
orig_len = len(s)

# ───────────────────────────────────────────────────────────────────────────
# 1 · Modulo de configuracion, insertado tras las constantes de entorno
# ───────────────────────────────────────────────────────────────────────────
ANCHOR = "const IDLE_MS = Number(process.env.IDLE_MS || 20000);"
assert ANCHOR in s, "ancla de constantes no encontrada"

MODULE = ANCHOR + r"""

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

// Dimensiones por destino. DCI_2K es cine (1,90:1) y NO sustituye a QHD.
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
  source: 'testsrc2 20 s, libx265 ultrafast, hqdn3d+unsharp, -an',
  rows: [
    { target: 'FHD_1080', recipe: 'balanced', seconds_for_20s: null, realtime_ratio: null, note: 'no medido' },
    { target: 'QHD_1440', recipe: 'balanced', seconds_for_20s: 46.94, realtime_ratio: 0.43, viable: false },
    { target: 'UHD_4K',   recipe: 'balanced', seconds_for_20s: 80.95, realtime_ratio: 0.25, viable: false }
  ],
  verdict: 'QHD y UHD NO son viables en directo con filtros en CPU en este host. '
         + 'Margen exigido 1,2x tiempo real; medido 0,43x a 1440p y 0,25x a 2160p.'
};

loadImageConfig();
"""

s = s.replace(ANCHOR, MODULE, 1)

# ───────────────────────────────────────────────────────────────────────────
# 2 · buildEncodingPlan lee la config de imagen
# ───────────────────────────────────────────────────────────────────────────
OLD_TARGET = """  const targetW = is720 ? 1280 : (isSdr ? 1920 : (av1Requested || use2k ? 2048 : 1920));
  const targetH = is720 ? 720 : 1080;"""

NEW_TARGET = """  // ── destino resuelto por el MODULO DE IMAGEN ────────────────────────────────
  // La config en caliente decide el destino. Si target='source' se conserva el
  // comportamiento historico (1280/1920/2048 x 720/1080) para no romper nada.
  const cfg = options.imageConfig || imageConfig;
  const requestedTarget = IMAGE_TARGETS[cfg.target] || null;
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
  }"""
assert OLD_TARGET in s, "no encontre targetW/targetH"
s = s.replace(OLD_TARGET, NEW_TARGET, 1)

# la geometria incorpora la receta de imagen
OLD_GEO = """  const geometry = `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;"""
NEW_GEO = """  const imageFilters = buildImageFilterChain(cfg);
  const pixelFmt = cfg.ten_bit ? 'format=yuv420p10le' : 'format=yuv420p';
  const head = imageFilters ? (pixelFmt + ',' + imageFilters + ',') : '';
  const geometry = head + `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;"""
assert OLD_GEO in s, "no encontre geometry"
s = s.replace(OLD_GEO, NEW_GEO, 1)

# encoder x265 lee preset/crf/hilos de la config
OLD_X265 = """    videoArgs = ['-vf', hdrFilter, '-pix_fmt', 'yuv420p10le', ...colorArgs,
      '-c:v', 'libx265', '-preset', 'ultrafast', '-tune', 'zerolatency', '-threads', '3', '-tag:v', 'hvc1',
      '-x265-params', 'pools=3:frame-threads=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc',
      '-b:v', use2k ? '5000k' : '3000k', '-maxrate', use2k ? '5500k' : '3300k', '-bufsize', use2k ? '10000k' : '6000k'];"""
NEW_X265 = """    // encoder instrumentado: preset, crf, hilos y GOP salen de la config viva
    const gop = cfg.closed_gop
      ? 'keyint=' + Math.max(1, Math.round(30 * cfg.gop_seconds)) + ':scenecut=0:open-gop=0:'
      : '';
    const rateArgs = cfg.bitrate_mode === 'abr'
      ? ['-b:v', cfg.bitrate, '-maxrate', cfg.maxrate, '-bufsize', cfg.bufsize]
      : ['-crf', String(cfg.crf), '-b:v', '0'];
    videoArgs = ['-vf', hdrFilter, '-pix_fmt', cfg.ten_bit ? 'yuv420p10le' : 'yuv420p', ...colorArgs,
      '-c:v', cfg.codec === 'libx265' ? 'libx265' : cfg.codec,
      '-preset', cfg.preset, '-tune', 'zerolatency', '-threads', String(cfg.x265_threads), '-tag:v', 'hvc1',
      '-x265-params', gop + 'pools=' + cfg.x265_threads + ':frame-threads=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc',
      ...rateArgs];"""
assert OLD_X265 in s, "no encontre el bloque x265"
s = s.replace(OLD_X265, NEW_X265, 1)

# audio instrumentado
OLD_AUDIO = "    audioArgs: audioSource ? ['-c:a', 'copy', '-tag:a', 'mp4a'] : ['-an'],"
NEW_AUDIO = """    audioArgs: (() => {
      if (cfg.audio === 'drop' || !audioSource) return ['-an'];
      if (cfg.audio === 'aac') return ['-c:a', 'aac', '-b:a', cfg.audio_bitrate, '-tag:a', 'mp4a'];
      return ['-c:a', 'copy', '-tag:a', 'mp4a'];
    })(),"""
assert OLD_AUDIO in s
s = s.replace(OLD_AUDIO, NEW_AUDIO, 1)

# crystaMode refleja la receta para que el manifiesto no mienta
OLD_MODE = "      : (sixK ? 'CRYSTAL_6K_AV1' : av1 ? 'CRYSTAL_2K_AV1' : is720 ? 'SDR720_STABLE' : isSdr ? 'FHD_SDR' : use2k ? 'CRYSTAL_2K_HDR_UPSCALE' : 'FHD_HDR10') };"
NEW_MODE = """      : (sixK ? 'CRYSTAL_6K_AV1' : av1 ? 'CRYSTAL_2K_AV1' : is720 ? 'SDR720_STABLE'
        : (imageFilters ? 'FILTERED_' + String(cfg.recipe).toUpperCase() : 'FHD_SDR')) };"""
assert OLD_MODE in s
s = s.replace(OLD_MODE, NEW_MODE, 1)

# ───────────────────────────────────────────────────────────────────────────
# 3 · Rutas de control
# ───────────────────────────────────────────────────────────────────────────
ROUTE_ANCHOR = "  if (u.pathname === '/health') {"
assert ROUTE_ANCHOR in s, "no encontre /health"

ROUTES = r"""  /* ── MODULO DE IMAGEN: control remoto desde la UI ───────────────────────── */
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

"""

s = s.replace(ROUTE_ANCHOR, ROUTES + ROUTE_ANCHOR, 1)

io.open(SRV, "w", encoding="utf-8", newline="\n").write(s)
print("PARCHE APLICADO: +%d bytes" % (len(s.encode()) - orig_len))
print("  1) modulo IMAGE CONFIG (defaults, limites, capacidad medida)")
print("  2) buildEncodingPlan lee target/recipe/preset/crf/fps/audio/gop")
print("  3) buildImageFilterChain: hqdn3d, unsharp, atadenoise reales")
print("  4) rutas GET/POST /image/config y GET /image/capacity")
