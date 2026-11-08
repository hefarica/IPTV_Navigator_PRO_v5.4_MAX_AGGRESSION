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
  // === 720p con distintas salidas (el caso del operador) ===
  { id: 'r-720-1080', input: '720p', outW: 1920, outH: 1080, codec: 'hvc1', recipe: 'light', profile: 'P4', label: '720p -> 1080p' },
  { id: 'r-720-1440', input: '720p', outW: 2560, outH: 1440, codec: 'hvc1', recipe: 'balanced', profile: 'P4', label: '720p -> 1440p' },
  { id: 'r-720-4k',   input: '720p', outW: 3840, outH: 2160, codec: 'hvc1', recipe: 'balanced', profile: 'P4', label: '720p -> 4K' },
  { id: 'r-720-6k',   input: '720p', outW: 5760, outH: 3240, codec: 'hvc1', recipe: 'temporal', profile: 'P4', label: '720p -> 6K' },
  { id: 'r-720-8k',   input: '720p', outW: 7680, outH: 4320, codec: 'hvc1', recipe: 'temporal', profile: 'P4', label: '720p -> 8K' },
  // === 1080p con distintas salidas ===
  { id: 'r-1080-1080', input: '1080p', outW: 1920, outH: 1080, codec: 'hvc1', recipe: 'none', profile: 'P3', label: '1080p -> 1080p' },
  { id: 'r-1080-1440', input: '1080p', outW: 2560, outH: 1440, codec: 'hvc1', recipe: 'light', profile: 'P3', label: '1080p -> 1440p' },
  { id: 'r-1080-4k',   input: '1080p', outW: 3840, outH: 2160, codec: 'hvc1', recipe: 'balanced', profile: 'P3', label: '1080p -> 4K' },
  { id: 'r-1080-6k',   input: '1080p', outW: 5760, outH: 3240, codec: 'hvc1', recipe: 'temporal', profile: 'P3', label: '1080p -> 6K' },
  // === 4K: conservar y subir ===
  { id: 'r-4k-4k', input: '4K', outW: 3840, outH: 2160, codec: 'hvc1', recipe: 'none', profile: 'P1', label: '4K -> 4K' },
  { id: 'r-4k-6k', input: '4K', outW: 5760, outH: 3240, codec: 'hvc1', recipe: 'light', profile: 'P1', label: '4K -> 6K' },
  { id: 'r-4k-8k', input: '4K', outW: 7680, outH: 4320, codec: 'hvc1', recipe: 'balanced', profile: 'P1', label: '4K -> 8K' },
  // === 480p: subir respetando aspecto ===
  { id: 'r-480-1080', input: '480p', outW: 1920, outH: 1080, codec: 'hvc1', recipe: 'balanced', profile: 'P5', label: '480p -> 1080p' },
  { id: 'r-480-4k',   input: '480p', outW: 3840, outH: 2160, codec: 'hvc1', recipe: 'temporal', profile: 'P5', label: '480p -> 4K' }
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
function rulesForInput(w, h) {
  const px = w * h;
  const inRatio = w / h;
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
    if (hit) matches.push({ rule: r, matchedBand: hit });
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
      areaRatio: Number(((m.rule.outW * m.rule.outH) / px).toFixed(2))
    }))
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
  if (!Number.isFinite(outW) || outW < 256 || outW > 7680) errs.push('outW fuera de [256,7680]');
  if (!Number.isFinite(outH) || outH < 144 || outH > 4320) errs.push('outH fuera de [144,4320]');
  if (patch.codec && !CODEC_CATALOG[patch.codec]) errs.push('codec desconocido: ' + patch.codec);
  if (patch.recipe && !RECIPE_PRESETS[patch.recipe]) errs.push('recipe desconocida: ' + patch.recipe);
  if (errs.length) return { ok: false, errors: errs };

  const row = {
    id,
    input,
    outW: outW % 2 === 0 ? outW : outW + 1,
    outH: outH % 2 === 0 ? outH : outH + 1,
    codec: patch.codec || 'hvc1',
    recipe: patch.recipe || 'balanced',
    profile: patch.profile || 'P3',
    label: patch.label || (input + ' -> ' + outW + 'x' + outH)
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

