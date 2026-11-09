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

  // bitrate objetivo: el que la resolucion y el codec pueden sostener.
  // Se parte del bitrate real medido del master (BANDWIDTH) y se escala por area.
  const px = outW * outH;
  const baseBps = Math.round(px * (codecId === 'av01' ? 0.045 : (codecId === 'avc1' ? 0.09 : 0.06)));
  const bitrateMbps = Math.max(1, Math.round(baseBps / 1e6));

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

