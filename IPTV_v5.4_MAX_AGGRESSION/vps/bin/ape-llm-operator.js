#!/usr/bin/env node
/**
 * ape-llm-operator.js — aplicador del operario LLM (t83). LADO VPS.
 *
 * QUÉ ES: el único punto por el que un delta del operario puede convertirse en
 * un valor de #EXTHTTP o de #EXT-X-SESSION-DATA. Todo lo demás se RECHAZA con
 * su código y su razón literal (fail-closed, atómico: si un delta de la vuelta
 * falla no se aplica NINGUNO).
 *
 * FUENTE DE VERDAD: contracts/llm_operator_knobs_v1.json (t81) — 90 perillas,
 * 131 nombres en lista negra, 1 invariante (X-Concurrent-Downloads). NO hay
 * lista blanca escrita a mano en este fichero: se lee del catálogo y se valida
 * su sha256. Y contracts/llm_operator_v1.json (t82) — pipeline, cadencia,
 * sutileza, reversión y auditoría.
 *
 * LO QUE ESTE MÓDULO NO PUEDE HACER (por construcción, no por promesa):
 *   - no escribe ficheros .kt/.java/.gradle ni recompila ni toca el APK:
 *     no importa child_process y NO llama a fs.writeFileSync sobre rutas de código;
 *   - no emite ni reescribe etiquetas: solo cambia el VALOR de una clave que ya
 *     existe en el objeto JSON que se le pasa;
 *   - no construye URLs ni comandos: cualquier cadena con '://', '/', '\\',
 *     '$(', ';' o que case una etiqueta estructural se rechaza con
 *     E_STRUCTURE_TOUCHED antes de tocar nada.
 *
 * USO
 *   const op = require('./ape-llm-operator');
 *   const cat = op.loadCatalog();                       // una vez
 *   const v   = op.validate(round, cat, { side:'vps' }); // -> {ok, code, reason, deltas}
 *   const r   = op.apply(round, v, { exthttp, sessionData }); // -> {exthttp, sessionData, receipt}
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ── Rutas y constantes (todas declaradas, ninguna hardcodeada a un valor de
 *    operador) ─────────────────────────────────────────────────────────────── */
const CATALOG_PATH = process.env.APE_LLM_KNOBS || path.join('contracts', 'llm_operator_knobs_v1.json');
const CONTRACT_PATH = process.env.APE_LLM_CONTRACT || path.join('contracts', 'llm_operator_v1.json');
const AUDIT_PATH = process.env.APE_LLM_AUDIT || '/var/lib/ape/llm-operator-audit.jsonl';

/* Presupuesto de la llamada al LLM (t82 budget): 1 llamada por vuelta, 512
 * tokens de salida, y un timeout DECLARADO aqui porque el contrato lo acota en
 * cadencia (2 s de termino LLM) pero no fija el numero: 2.000 ms. */
const LLM_TIMEOUT_MS = Number(process.env.APE_LLM_TIMEOUT_MS || 2000);
const LLM_MAX_TOKENS_OUT = 512;
const LLM_CALLS_PER_ROUND = 1;
const AUDIT_RECORD_MAX_BYTES = 4096;
const AUDIT_MAX_BYTES = 67108864;

/* Etapas estructurales: si aparecen en un nombre de perilla o en su valor, es
 * E_STRUCTURE_TOUCHED. Se declaran como DATO, no como expresion magica. */
const STRUCTURE_MARKERS = [
  '#EXTINF', '#EXT-X-STREAM-INF', '#EXTSHIMOTT', '#EXT-X-APE-PROFILE-TEMPLATE',
  '#EXT-X-APE-LAB-METADATA', '#EXT-X-MAP', '#EXT-X-KEY', '#EXT-X-MEDIA',
  '#EXTM3U', '#EXTVLCOPT', '#KODIPROP', '#EXT-X-APE-CHANNELS',
];
/* Nombres desnudos que también son estructura: una perilla NUNCA se llama así. */
const STRUCTURE_NAMES = ['url', 'uri', 'canales', 'canal_count', 'channels', 'n_canales', 'extinf'];
const STRUCTURE_PATTERNS = [
  /:\/\//, /(^|[^A-Za-z0-9_.-])\.\.?[\\/]/, /[\\/]/, /\$\(/, /[;&|`]/, /\bexec\b/i, /\beval\b/i,
];
/* Un delta no puede nombrar codigo de la APK (t82 step 6: E_APK_CODE_TOUCHED). */
const CODE_MARKERS = [/\.kt$/i, /\.java$/i, /\.gradle$/i, /\.kts$/i, /\.apk$/i, /\.so$/i, /\.dex$/i];

const CODES = {
  SCHEMA: 'E_SCHEMA',
  SIDE_MISMATCH: 'E_SIDE_MISMATCH',
  NOT_A_KNOB: 'E_NOT_A_KNOB',
  INVARIANT: 'E_INVARIANT_TOUCHED',
  STRUCTURE: 'E_STRUCTURE_TOUCHED',
  APK_CODE: 'E_APK_CODE_TOUCHED',
  TYPE: 'E_TYPE',
  RANGE: 'E_RANGE',
  DIRECTION: 'E_DIRECTION',
  TOO_MANY: 'E_TOO_MANY_KNOBS',
  STEP_FROZEN: 'E_COOLDOWN',
  NO_RECEIPT: 'E_NO_RECEIPT',
  NO_EVIDENCE: 'E_NO_EVIDENCE',
  REVERSAL_LOOP: 'E_REVERSAL_LOOP',
  OUTPUT: 'E_LLM_OUTPUT',
  BUDGET: 'E_BUDGET',
  INTERNAL: 'E_INTERNAL',
};

/* ── Catálogo ────────────────────────────────────────────────────────────── */

function loadCatalog(catalogPath, contractPath) {
  const cp = catalogPath || CATALOG_PATH;
  const raw = fs.readFileSync(cp, 'utf8');
  const j = JSON.parse(raw);
  if (!Array.isArray(j.knobs)) { throw new Error('catalogo sin knobs[]: ' + cp); }
  const byName = new Map();
  for (const k of j.knobs) {
    if (!k || !k.name) { continue; }
    byName.set(k.name, k);
  }
  const invariants = new Set((j.invariants || []).map((i) => i.name));
  /* La lista negra del catalogo son OBJETOS ({name, side, reason, detection});
   * aqui se reduce a nombres: comprobacion O(1) por igualdad exacta. Se aceptan
   * array de strings, array de objetos y {names:[...]}. */
  const blNames = (x) => {
    if (!x) { return []; }
    const arr = Array.isArray(x) ? x : (Array.isArray(x.names) ? x.names : []);
    return arr.map((e) => (typeof e === 'string') ? e : (e && e.name) || '').filter(Boolean);
  };
  const blacklist = new Set([ ...blNames(j.blacklist), ...blNames(j.blacklist_structure) ]);
  /* sha256 del catálogo: el contrato de t82 lo pinea; si cambia, queda STALE. */
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  return {
    path: cp, sha256: sha, knobs: byName, invariants, blacklist,
    contract_path: contractPath || CONTRACT_PATH,
    count: byName.size, blacklist_count: blacklist.size,
  };
}

/* ── Validación (pipeline de t82, EN ORDEN, atómica) ─────────────────────── */

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function structureHit(str) {
  const s = String(str);
  const low = s.toLowerCase();
  if (STRUCTURE_NAMES.indexOf(low) !== -1) { return 'nombre desnudo estructural: ' + low; }
  for (const m of STRUCTURE_MARKERS) { if (s.indexOf(m) !== -1) { return m; } }
  for (const re of STRUCTURE_PATTERNS) { if (re.test(s)) { return String(re); } }
  return null;
}

function codeHit(str) {
  const s = String(str);
  for (const re of CODE_MARKERS) { if (re.test(s)) { return String(re); } }
  return null;
}

/**
 * Valida una vuelta completa. Devuelve SIEMPRE un objeto (nunca lanza).
 * @returns {{ok:boolean, code:string|null, reason:string, deltas:Array, side:string}}
 */
function validate(round, cat, opts) {
  const o = opts || {};
  const out = { ok: false, code: null, reason: '', deltas: [], side: o.side || null };
  const fail = (code, reason) => { out.ok = false; out.code = code; out.reason = reason; out.deltas = []; return out; };
  try {
    /* 1 — esquema: forma cerrada, sin propiedades extra, kinds cerrados */
    if (!isPlainObject(round)) { return fail(CODES.SCHEMA, 'la vuelta no es un objeto'); }
    const allowed = ['round_id', 'schema_version', 'side', 'decision'];
    for (const k of Object.keys(round)) {
      if (allowed.indexOf(k) === -1) { return fail(CODES.SCHEMA, 'propiedad no permitida en la vuelta: ' + k); }
    }
    if (!round.round_id || !/^[A-Za-z0-9_.:-]{8,64}$/.test(String(round.round_id))) {
      return fail(CODES.SCHEMA, 'round_id ausente o fuera de patron');
    }
    if (round.schema_version !== 'ape.llm.operator.output/1') {
      return fail(CODES.SCHEMA, 'schema_version distinto de ape.llm.operator.output/1');
    }
    if (['vps', 'apk'].indexOf(round.side) === -1) { return fail(CODES.SCHEMA, 'side debe ser vps|apk'); }
    out.side = round.side;
    if (o.side && o.side !== round.side) {
      return fail(CODES.SIDE_MISMATCH, 'la vuelta declara side=' + round.side + ' y este aplicador es ' + o.side);
    }
    const d = round.decision;
    if (!isPlainObject(d) || ['change', 'abstain', 'revert'].indexOf(d.kind) === -1) {
      return fail(CODES.SCHEMA, 'decision.kind debe ser change|abstain|revert');
    }
    if (d.kind !== 'change') { out.ok = true; out.reason = 'kind=' + d.kind + ': no hay deltas que aplicar'; return out; }
    if (!Array.isArray(d.deltas) || d.deltas.length < 1 || d.deltas.length > 5) {
      return fail(CODES.SCHEMA, 'deltas debe ser un array de 1..5');
    }
    /* límite de perillas por iteración (t82 subtlety) */
    const maxKnobs = round.side === 'apk' ? 5 : 3;
    if (d.deltas.length > maxKnobs) {
      return fail(CODES.TOO_MANY, 'max ' + maxKnobs + ' perillas por iteracion en ' + round.side + '; llegaron ' + d.deltas.length);
    }

    for (const delta of d.deltas) {
      if (!isPlainObject(delta)) { return fail(CODES.SCHEMA, 'delta no es objeto'); }
      const dKeys = Object.keys(delta);
      for (const k of dKeys) {
        if (['knob', 'to'].indexOf(k) === -1) {
          /* 'from' esta PROHIBIDO por diseño en t82: el valor actual lo pone el
           * servidor. Cualquier otra clave tambien. */
          return fail(CODES.SCHEMA, 'propiedad no permitida en delta: ' + k);
        }
      }
      const name = String(delta.knob || '');
      if (!name) { return fail(CODES.SCHEMA, 'delta sin knob'); }

      /* 5 — estructura (antes que nada que pueda parecerse a un nombre) */
      const sh = structureHit(name);
      if (sh) { return fail(CODES.STRUCTURE, 'el nombre toca estructura (' + sh + '): ' + name); }
      const chCode = codeHit(name) || codeHit(delta.to);
      if (chCode) { return fail(CODES.APK_CODE, 'el delta nombra codigo (' + chCode + '): ' + name); }
      if (typeof delta.to === 'string') {
        const sv = structureHit(delta.to);
        if (sv) { return fail(CODES.STRUCTURE, 'el valor toca estructura (' + sv + '): ' + name + '=' + delta.to); }
      }

      /* 4 — invariante */
      if (cat.invariants.has(name)) {
        return fail(CODES.INVARIANT, 'perilla invariante (SSOT), prohibida: ' + name);
      }
      /* 3 — allowlist del catálogo; lista negra con su razón */
      const knob = cat.knobs.get(name);
      if (!knob) {
        const enNegra = cat.blacklist.has(name);
        return fail(CODES.NOT_A_KNOB, (enNegra ? 'nombre en la LISTA NEGRA (no es perilla): ' : 'perilla fuera del catalogo: ') + name);
      }
      /* 2 — side */
      if (knob.side && round.side !== knob.side) {
        return fail(CODES.SIDE_MISMATCH, name + ' es del lado ' + knob.side + ' y la vuelta es ' + round.side);
      }
      /* 7 — tipo y unidad */
      const t = String(knob.type || '');
      const v = delta.to;
      if (t === 'int' || t === 'integer') {
        if (typeof v !== 'number' || !Number.isFinite(v) || Math.floor(v) !== v) {
          return fail(CODES.TYPE, name + ' exige int; llego ' + JSON.stringify(v));
        }
      } else if (t === 'number' || t === 'float') {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          return fail(CODES.TYPE, name + ' exige number finito; llego ' + JSON.stringify(v));
        }
      } else if (t === 'bool' || t === 'boolean') {
        if (typeof v !== 'boolean') { return fail(CODES.TYPE, name + ' exige boolean; llego ' + JSON.stringify(v)); }
      } else if (t === 'enum' || t === 'string') {
        const vocab = Array.isArray(knob.vocabulary) ? knob.vocabulary : null;
        if (typeof v !== 'string') { return fail(CODES.TYPE, name + ' exige string; llego ' + JSON.stringify(v)); }
        if (vocab && vocab.indexOf(v) === -1) {
          return fail(CODES.TYPE, name + ' exige un valor del vocabulario [' + vocab.join(',') + ']; llego ' + v);
        }
      }
      /* rango */
      const min = (typeof knob.safe_min === 'number') ? knob.safe_min : null;
      const max = (typeof knob.safe_max === 'number') ? knob.safe_max : null;
      if (typeof v === 'number') {
        if ((min !== null && v < min) || (max !== null && v > max)) {
          return fail(CODES.RANGE, name + ' fuera de rango [' + min + ',' + max + ']; llego ' + v);
        }
      }
      out.deltas.push({ knob: knob, name: name, to: v, clamped: false, from: null });
    }
    out.ok = true;
    out.reason = 'ok';
    return out;
  } catch (e) {
    return fail(CODES.INTERNAL, 'excepcion en validacion: ' + e.message);
  }
}

/* ── Sutileza: recorte al límite por paso de t82 ─────────────────────────── */

/**
 * Aplica el step_policy de t82 sobre un delta ya validado:
 *   vps: fraccion 25 % del valor actual (floor/ceiling del catalogo)
 *   apk: discreto -> un salto a un valor valido del vocabulario (sin recorte numerico)
 * @returns {{to:number|string, clamped:boolean, why:string}}
 */
function clampStep(delta, from, side) {
  const knob = delta.knob;
  const to = delta.to;
  if (typeof to !== 'number' || typeof from !== 'number') {
    return { to: to, clamped: false, why: 'no numerico: salto discreto' };
  }
  const frac = (knob.step && typeof knob.step.value === 'number') ? knob.step.value : 0.25;
  const maxUp = from + Math.floor(Math.abs(from) * frac);
  const maxDown = from - Math.floor(Math.abs(from) * frac);
  let clamped = false, why = 'dentro del limite';
  let v = to;
  if (to > maxUp) { v = maxUp; clamped = true; why = 'recortado al maximo por paso (+' + (frac * 100) + '%)'; }
  if (to < maxDown) { v = maxDown; clamped = true; why = 'recortado al minimo por paso (-' + (frac * 100) + '%)'; }
  /* prohibiciones de dirección del catálogo */
  if (Array.isArray(knob.direction_prohibited)) {
    if (to > from && knob.direction_prohibited.indexOf('up') !== -1) { return { to: from, clamped: true, why: 'direccion up prohibida por catalogo' }; }
    if (to < from && knob.direction_prohibited.indexOf('down') !== -1) { return { to: from, clamped: true, why: 'direccion down prohibida por catalogo' }; }
  }
  const floor = (knob.step && typeof knob.step.floor === 'number') ? knob.step.floor : null;
  const ceil = (knob.step && typeof knob.step.ceiling === 'number') ? knob.step.ceiling : null;
  if (floor !== null && v < floor) { v = floor; clamped = true; why += ' + floor del catalogo'; }
  if (ceil !== null && v > ceil) { v = ceil; clamped = true; why += ' + ceiling del catalogo'; }
  return { to: v, clamped, why };
}

/* ── Aplicación: SOLO el valor, nunca la forma ───────────────────────────── */

function setInObject(obj, name, value) {
  /* EXTHTTP: la clave es el nombre de la cabecera (plana).
   * SESSION-DATA: el nombre es una ruta con puntos (a.b.c). */
  if (Object.prototype.hasOwnProperty.call(obj, name)) {
    const before = obj[name];
    obj[name] = value;
    return { ok: true, from: before, path: name };
  }
  if (name.indexOf('.') !== -1) {
    const parts = name.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!isPlainObject(cur[parts[i]])) { return { ok: false, reason: 'ruta inexistente: ' + name }; }
      cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (!Object.prototype.hasOwnProperty.call(cur, last)) { return { ok: false, reason: 'clave inexistente: ' + name }; }
    const before = cur[last];
    cur[last] = value;
    return { ok: true, from: before, path: name };
  }
  return { ok: false, reason: 'la clave no existe en el contenedor (no se CREAN claves): ' + name };
}

/**
 * Aplica una vuelta YA validada. Nunca crea claves ni toca otras.
 * @returns {{ok, code, reason, exthttp, sessionData, receipts}}
 */
function apply(round, v, containers) {
  const c = containers || {};
  const out = { ok: false, code: null, reason: '', exthttp: c.exthttp, sessionData: c.sessionData, receipts: [] };
  if (!v || !v.ok) { out.code = (v && v.code) || CODES.SCHEMA; out.reason = (v && v.reason) || 'vuelta no validada'; return out; }
  if (!v.deltas.length) { out.ok = true; out.reason = 'sin deltas'; return out; }
  /* Copia profunda: se aplica sobre la copia y solo se publica si TODO va bien. */
  const next = {
    exthttp: c.exthttp ? JSON.parse(JSON.stringify(c.exthttp)) : null,
    sessionData: c.sessionData ? JSON.parse(JSON.stringify(c.sessionData)) : null,
  };
  const pending = [];
  for (const d of v.deltas) {
    const targetIsSession = String(d.knob.name).indexOf('.') !== -1;
    const cont = targetIsSession ? next.sessionData : next.exthttp;
    if (!cont) { out.code = CODES.NO_RECEIPT; out.reason = 'contenedor ausente para ' + d.name; return out; }
    const res = setInObject(cont, d.name, d.to);
    if (!res.ok) { out.code = CODES.NO_RECEIPT; out.reason = res.reason; return out; }
    const from = Number(res.from);
    const cl = clampStep(d, Number.isFinite(from) ? from : d.to, round.side || 'vps');
    if (cl.clamped && cl.to !== d.to) {
      /* re-escribir con el valor recortado (misma clave, mismo sitio) */
      setInObject(cont, d.name, cl.to);
    }
    pending.push({ knob: d.name, from: res.from, to: (cl.to !== undefined ? cl.to : d.to), clamped: cl.clamped, why: cl.why, target: targetIsSession ? 'session_data' : 'exthttp' });
  }
  out.ok = true;
  out.reason = 'aplicado';
  out.exthttp = next.exthttp;
  out.sessionData = next.sessionData;
  out.receipts = pending;
  return out;
}

/* ── Diff: prueba de que SOLO cambia el valor ────────────────────────────── */

function diffObjects(before, after) {
  const changes = [];
  const walk = (a, b, prefix) => {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of keys) {
      const p = prefix ? prefix + '.' + k : k;
      const va = a ? a[k] : undefined, vb = b ? b[k] : undefined;
      if (isPlainObject(va) && isPlainObject(vb)) { walk(va, vb, p); continue; }
      if (JSON.stringify(va) !== JSON.stringify(vb)) {
        changes.push({ path: p, from: va, to: vb, kind: va === undefined ? 'added' : (vb === undefined ? 'removed' : 'value') });
      }
    }
  };
  walk(before, after, '');
  return changes;
}

/* ── Juez determinista y reversión (t82 reversal) ────────────────────────── */

const DEADBANDS = {
  buffer_ms_drop_gt: 1000, freeze_ms_gt: 0,
  frame_drop_count_increase_gt_pct: 10, fps_measured_drop_gt_pct: 5,
};

/**
 * Juez: NO decide el LLM. Compara la métrica ANTES con la observada en la
 * ventana y devuelve improved|neutral|worsened (+ motivo literal).
 */
function judge(before, after) {
  const b = before || {}, a = after || {};
  const notes = [];
  if (typeof b.buffer_ms === 'number' && typeof a.buffer_ms === 'number') {
    const drop = b.buffer_ms - a.buffer_ms;
    if (drop > DEADBANDS.buffer_ms_drop_gt) { notes.push('buffer_ms cae ' + drop + ' ms (> ' + DEADBANDS.buffer_ms_drop_gt + ')'); return { outcome: 'worsened', reason: notes.join('; ') }; }
    if (drop < -500) { notes.push('buffer_ms sube ' + (-drop) + ' ms'); }
  }
  if (typeof b.freeze_ms === 'number' && typeof a.freeze_ms === 'number') {
    if (a.freeze_ms - b.freeze_ms > DEADBANDS.freeze_ms_gt) { notes.push('freeze_ms sube ' + (a.freeze_ms - b.freeze_ms) + ' ms'); return { outcome: 'worsened', reason: notes.join('; ') }; }
  }
  if (typeof b.frame_drop_count === 'number' && typeof a.frame_drop_count === 'number' && b.frame_drop_count > 0) {
    const pct = ((a.frame_drop_count - b.frame_drop_count) / b.frame_drop_count) * 100;
    if (pct > DEADBANDS.frame_drop_count_increase_gt_pct) { notes.push('frame_drop_count +' + pct.toFixed(1) + ' %'); return { outcome: 'worsened', reason: notes.join('; ') }; }
  }
  if (typeof b.fps_measured === 'number' && typeof a.fps_measured === 'number' && b.fps_measured > 0) {
    const pct = ((b.fps_measured - a.fps_measured) / b.fps_measured) * 100;
    if (pct > DEADBANDS.fps_measured_drop_gt_pct) { notes.push('fps cae ' + pct.toFixed(1) + ' %'); return { outcome: 'worsened', reason: notes.join('; ') }; }
  }
  if (notes.length) { return { outcome: 'improved', reason: notes.join('; ') }; }
  return { outcome: 'neutral', reason: 'sin cambio fuera de banda muerta' };
}

/** El juez revierte por código: el LLM solo puede proponer. */
function decideRevert(judgement, applied) {
  if (!judgement || judgement.outcome !== 'worsened') { return null; }
  return {
    kind: 'revert', knob: applied.knob, from: applied.to, to: applied.from,
    reason: 'juez: ' + judgement.reason, code: 'E_REVERTED_BY_JUDGE',
  };
}

/* ── Auditoría append-only (JSONL, sin campo libre, con tope) ────────────── */

const AUDIT_FIELDS = [
  'decision_id', 'round_id', 'ts', 'device_id', 'channel_id', 'side', 'knob', 'from', 'to',
  'reason_code', 'metric', 'metric_value', 'metric_unit', 'expect_direction', 'expect_deadband',
  'evidence_refs', 'llm_model', 'llm_tokens_out', 'llm_latency_ms', 'llm_timeout_hit',
  'validation_ok', 'validation_code', 'applied_at', 'readback', 'readback_ok',
  'verify_window_ms', 'observed_value', 'outcome', 'revert_of',
];

function auditRecord(fields) {
  const rec = {};
  for (const f of AUDIT_FIELDS) { rec[f] = (fields && fields[f] !== undefined) ? fields[f] : null; }
  const s = JSON.stringify(rec);
  if (Buffer.byteLength(s) > AUDIT_RECORD_MAX_BYTES) {
    /* Sin campo libre, el registro no deberia crecer; si crece, se recorta el
     * unico campo de texto (evidence_refs) y se marca. */
    rec.evidence_refs = 'TRUNCATED';
    return JSON.stringify(rec);
  }
  return s;
}

function auditAppend(recordJson, auditPath) {
  const p = auditPath || AUDIT_PATH;
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > AUDIT_MAX_BYTES) {
      fs.renameSync(p, p + '.' + Date.now() + '.rot');   // rotación, nunca crecer sin cota
    }
    fs.appendFileSync(p, recordJson + '\n');
    return { ok: true, path: p };
  } catch (e) {
    return { ok: false, code: CODES.NO_RECEIPT, reason: 'auditoria no escribible: ' + e.message };
  }
}

/* ── Llamada al LLM acotada ──────────────────────────────────────────────── */

/**
 * Ejecuta una llamada con timeout y devuelve SIEMPRE un objeto: una respuesta
 * no-JSON o un timeout son fallos declarados, nunca una excepcion en el camino
 * de reproduccion.
 */
function boundedCall(fn, opts) {
  const o = opts || {};
  const started = Date.now();
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) { return; }
      done = true;
      resolve({ ok: false, code: 'E_LLM_TIMEOUT', reason: 'timeout de ' + LLM_TIMEOUT_MS + ' ms', latency_ms: Date.now() - started, timeout_hit: true });
    }, LLM_TIMEOUT_MS);
    Promise.resolve().then(() => fn({ max_tokens_out: LLM_MAX_TOKENS_OUT }))
      .then((txt) => {
        if (done) { return; }
        done = true; clearTimeout(timer);
        let parsed = null;
        try { parsed = JSON.parse(String(txt)); } catch (e) { /* cae abajo */ }
        if (!isPlainObject(parsed)) {
          resolve({ ok: false, code: CODES.OUTPUT, reason: 'respuesta no-JSON del LLM', latency_ms: Date.now() - started, timeout_hit: false });
          return;
        }
        resolve({ ok: true, output: parsed, latency_ms: Date.now() - started, timeout_hit: false });
      })
      .catch((e) => {
        if (done) { return; }
        done = true; clearTimeout(timer);
        resolve({ ok: false, code: CODES.OUTPUT, reason: 'fallo del LLM: ' + e.message, latency_ms: Date.now() - started, timeout_hit: false });
      });
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 * t87 — LOS CUATRO HUECOS DE t83 (F1 identidad · F2 rutinas · F3 procesos · F4 juez)
 * ══════════════════════════════════════════════════════════════════════════════
 * El operador lo pidio textual: "que viva en el APK Y EN EL VPS, cualquiera
 * despierta al mismo, el convive en dos lugares, pero no modifica estructuras,
 * corre rutinas, despierta procesos, ajusta settings".
 *
 * REGLA QUE NO CAMBIA: rutinas y procesos son ENUMS CERRADOS. Abiertos serian
 * ejecucion arbitraria y la frontera de t83 dejaria de existir. Aqui no hay
 * eval, ni spawn de nombres libres, ni shell.
 */

/* ── F1 · IDENTIDAD COMPARTIDA ─────────────────────────────────────────────
 * El id NO se coordina por red: se DERIVA del catalogo de t81 (su sha256) y de
 * una sal fija. Los dos lados calculan el MISMO valor sin hablarse; si el
 * catalogo cambia, los dos cambian a la vez (y el contrato de t82 queda STALE).
 */
const OPERATOR_ID_SALT = 'ape.llm.operator/1';
const SHARED_STATE_PATH = process.env.APE_LLM_STATE || '/var/lib/ape/llm-operator-state.json';
const SHARED_STATE_SCHEMA = 'ape.llm.operator.state/1';

function operatorId(catalogSha) {
  const sha = catalogSha || loadCatalog().sha256;
  return 'op-' + crypto.createHash('sha256').update(OPERATOR_ID_SALT + '|' + sha).digest('hex').slice(0, 24);
}

function emptyShared(catalogSha) {
  return {
    schema: SHARED_STATE_SCHEMA, operator_id: operatorId(catalogSha), seq: 0,
    last: null, wake: null, sides: { vps: null, apk: null },
  };
}

/** Lee el estado compartido. Nunca lanza: si no existe o esta roto, vacio. */
function readShared(p, catalogSha) {
  const f = p || SHARED_STATE_PATH;
  try {
    if (!fs.existsSync(f)) { return emptyShared(catalogSha); }
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!isPlainObject(j) || j.schema !== SHARED_STATE_SCHEMA) {
      logVisible('ESTADO_COMPARTIDO_INVALIDO en ' + f + ' -> estado vacio');
      return emptyShared(catalogSha);
    }
    return j;
  } catch (e) {
    logVisible('ESTADO_COMPARTIDO_ILEGIBLE: ' + e.message + ' -> estado vacio');
    return emptyShared(catalogSha);
  }
}

/** Escritura atomica (tmp + rename) y `seq` monotono: ordena las escrituras. */
function writeShared(state, p) {
  const f = p || SHARED_STATE_PATH;
  try {
    const next = JSON.parse(JSON.stringify(state));
    next.schema = SHARED_STATE_SCHEMA;
    next.seq = (Number(next.seq) || 0) + 1;
    next.updated_at = new Date().toISOString();
    const tmp = f + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, f);
    return { ok: true, state: next, path: f };
  } catch (e) {
    return { ok: false, code: CODES.NO_RECEIPT, reason: 'estado compartido no escribible: ' + e.message };
  }
}

/** Publica en el estado una decision tomada por UN lado; el otro la ve. */
function publishDecision(side, decision, p, catalogSha) {
  const st = readShared(p, catalogSha);
  st.sides = st.sides || { vps: null, apk: null };
  st.sides[side] = { at: new Date().toISOString(), decision: decision };
  st.last = { side: side, at: new Date().toISOString(), decision: decision };
  return writeShared(st, p);
}

/** CUALQUIERA de los dos lados despierta al operario. */
function wake(by, reason, p, catalogSha) {
  const st = readShared(p, catalogSha);
  st.wake = { by: by, reason: reason || 'manual', at: new Date().toISOString() };
  st.sides = st.sides || { vps: null, apk: null };
  return writeShared(st, p);
}

/** Consume el aviso de despertar (lo lee y lo limpia). */
function takeWake(p, catalogSha) {
  const st = readShared(p, catalogSha);
  const w = st.wake || null;
  if (w) { st.wake = null; writeShared(st, p); }
  return w;
}

/* ── F2 · RUTINAS: ENUM CERRADO ────────────────────────────────────────────
 * "Corre rutinas" solo es seguro con lista cerrada y nombrada. Fuera del enum
 * no hay nada que ejecutar: E_ROUTINE_UNKNOWN con el nombre en la razon.
 */
const ROUTINES = Object.freeze([
  'PROBE_CHANNEL', 'REFRESH_TABLE', 'FLUSH_TELEMETRY', 'REREAD_LEVERS', 'RETUNE_CHANNEL',
  'DISCOVER_ACTIVE_LIST',
]);

function validateRoutine(name) {
  const n = String(name === undefined || name === null ? '' : name).trim();
  if (n === '') { return { ok: false, code: 'E_ROUTINE_UNKNOWN', reason: 'rutina vacia' }; }
  if (ROUTINES.indexOf(n) === -1) {
    return { ok: false, code: 'E_ROUTINE_UNKNOWN', reason: 'rutina fuera del enum cerrado [' + ROUTINES.join(',') + ']: ' + n };
  }
  return { ok: true, code: null, reason: 'rutina conocida: ' + n, routine: n };
}

/** El modulo NO implementa rutinas: el host inyecta deps[nombre]. Nunca un nombre libre. */
function runRoutine(name, deps) {
  const v = validateRoutine(name);
  if (!v.ok) { return v; }
  let h = deps && typeof deps[v.routine] === 'function' ? deps[v.routine] : null;
  if (!h && BUILTIN_ROUTINES[v.routine]) { h = () => BUILTIN_ROUTINES[v.routine](deps || {}); }
  if (!h) { return { ok: false, code: 'E_ROUTINE_UNAVAILABLE', reason: 'sin handler inyectado para ' + v.routine }; }
  try { return { ok: true, routine: v.routine, result: h() }; }
  catch (e) { return { ok: false, code: 'E_ROUTINE_FAILED', reason: v.routine + ': ' + e.message }; }
}

/* ── F3 · PROCESOS DESPERTABLES: ENUM CERRADO ──────────────────────────────
 * PROHIBIDO expresamente: unidades systemd, nginx, php-fpm y el propio
 * server.js. No son procesos del operario: son la plataforma. Se rechazan con
 * E_PROCESS_FORBIDDEN ANTES de mirar el enum.
 */
const PROCESSES = Object.freeze(['PROBE_WORKER', 'FLUSHER', 'TABLE_REFRESHER']);
const FORBIDDEN_PROCESS = Object.freeze([
  'systemd', 'systemctl', 'nginx', 'php-fpm', 'phpfpm', 'server.js', 'ape-jit', 'node', 'sshd', 'cron',
]);

function validateProcess(name) {
  const n = String(name === undefined || name === null ? '' : name).trim();
  const low = n.toLowerCase();
  if (n === '') { return { ok: false, code: 'E_PROCESS_UNKNOWN', reason: 'proceso vacio' }; }
  for (const f of FORBIDDEN_PROCESS) {
    if (low === f || low.indexOf(f) !== -1) {
      return { ok: false, code: 'E_PROCESS_FORBIDDEN', reason: 'proceso de PLATAFORMA prohibido (' + f + '): ' + n };
    }
  }
  if (/(\.service|\.socket|\.timer|\.target)$/i.test(n)) {
    return { ok: false, code: 'E_PROCESS_FORBIDDEN', reason: 'unidad systemd prohibida: ' + n };
  }
  if (PROCESSES.indexOf(n) === -1) {
    return { ok: false, code: 'E_PROCESS_UNKNOWN', reason: 'proceso fuera del enum cerrado [' + PROCESSES.join(',') + ']: ' + n };
  }
  return { ok: true, code: null, reason: 'proceso conocido: ' + n, process: n };
}

function wakeProcess(name, deps) {
  const v = validateProcess(name);
  if (!v.ok) { return v; }
  const h = deps && typeof deps[v.process] === 'function' ? deps[v.process] : null;
  if (!h) { return { ok: false, code: 'E_PROCESS_UNAVAILABLE', reason: 'sin handler inyectado para ' + v.process }; }
  try { return { ok: true, process: v.process, result: h() }; }
  catch (e) { return { ok: false, code: 'E_PROCESS_FAILED', reason: v.process + ': ' + e.message }; }
}

/* ── RUTINA · DISCOVER_ACTIVE_LIST (t88, corregida) ──────────────────────────
 * Pregunta del operador: "averiguar en OTT NAVIGATOR cual es la lista que se
 * consume". Y la pregunta que decide si el sistema de perfiles toca la
 * reproduccion real: esa lista, ¿pasa por /pulse/ o va directa al proveedor?
 *
 * LOG CORRECTO — el vhost principal NO escribe en access.log. Medido:
 *   /var/log/nginx/access.log            548.256 B   <- el equivocado
 *   /var/log/nginx/playlist_access.log 7.094.624 B   <- 13x mas grande, EL REAL
 *   /var/log/nginx/ara_sync_access.log              <- el del APK
 * Leer access.log da NO_COMPUTADO en FALSO: falso negativo garantizado. Aqui se
 * leen los paths configurados (APE_ACCESS_LOG, separados por coma) y se declara
 * CUAL se leyo y cuantas lineas tiene.
 *
 * Se excluye el autotrafico ANTES de contar (loopback + APE_SELF_IPS): en la
 * medicion real, 8.504 peticiones del propio VPS y 897 de 127.0.0.1 frente a
 * 17.825 del device.
 *
 * NO se clasifica por el NOMBRE del fichero: se leen las URLs REALES. Ademas el
 * nombre publico puede servir OTRO fichero (el stub de 8 B de /lists/ sirve la
 * lista real de /lists/pulse/), asi que se prueban los dos y se declara cual se
 * uso. Y se cuentan plantillas de perfil y #EXTSHIMOTT: distinguen "consume una
 * lista pulseada" de "consume LA lista que construimos".
 *
 * SOLO LECTURA: statSync/readFileSync y nada mas.
 */
const DISCOVER_WINDOW_MS = Number(process.env.APE_DISCOVER_WINDOW_MS || 24 * 3600 * 1000);
const ACCESS_LOG_PATHS = String(process.env.APE_ACCESS_LOG
  || '/var/log/nginx/playlist_access.log,/var/log/nginx/ara_sync_access.log')
  .split(',').map((s) => s.trim()).filter(Boolean);
const LISTS_DIR_PATH = process.env.APE_LISTS_DIR || '/var/www/html/lists';
const LIST_NAME_RE = /([A-Za-z0-9_.\-]+\.(?:m3u8|m3u))(?:\?|$)/;
const LIST_PATH_RE = /\/lists?\//;
const LOOPBACK_IPS = ['127.0.0.1', '::1', 'localhost', '0.0.0.0'];

/** Linea de log nginx (combined). Fecha parseada a mano: no se depende del motor. */
function parseAccessLog(text) {
  const out = [];
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) (\S+) [^"]*" (\d{3})/);
    if (!m) { continue; }
    const dm = m[2].match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
    const when = dm ? Date.UTC(+dm[3], MON[dm[2]], +dm[1], +dm[4], +dm[5], +dm[6]) : NaN;
    out.push({ ip: m[1], ts: Number.isFinite(when) ? when : null, method: m[3], path: m[4], status: Number(m[5]) });
  }
  return out;
}

/** URLs de canal de una lista (lineas que no son comentario). */
function listUrls(text) {
  const urls = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t || t[0] === '#') { continue; }
    if (/^https?:\/\//i.test(t)) { urls.push(t); }
  }
  return urls;
}

/** PULSE_PROXIED | DIRECT_PROVIDER | NO_COMPUTADO. Sin cuarto estado. */
function classifyUrls(urls) {
  let pulse = 0, direct = 0;
  for (const u of urls) {
    if (/\/pulse(?:[/?]|$)/.test(u)) { pulse++; } else { direct++; }
  }
  if (pulse === 0 && direct === 0) {
    return { state: 'NO_COMPUTADO', reason: 'la lista no tiene ninguna URL de canal que clasificar', pulse: 0, direct: 0 };
  }
  if (pulse > 0 && pulse >= direct) {
    return { state: 'PULSE_PROXIED', reason: pulse + ' de ' + (pulse + direct) + ' URLs de canal pasan por /pulse/ (el perfil SI toca la reproduccion)', pulse: pulse, direct: direct };
  }
  return { state: 'DIRECT_PROVIDER', reason: direct + ' de ' + (pulse + direct) + ' URLs de canal van DIRECTAS al proveedor (el perfil NO la toca)', pulse: pulse, direct: direct };
}

/** Lee los logs configurados y DECLARA cual leyo y cuantas lineas tiene. */
function readLogSources(paths) {
  const sources = [], chunks = [];
  for (const p of (paths || ACCESS_LOG_PATHS)) {
    try {
      const st = fs.statSync(p);
      if (!st.size) { sources.push({ path: p, bytes: 0, lines: 0, note: 'vacio' }); continue; }
      const text = fs.readFileSync(p, 'utf8');
      chunks.push(text);
      sources.push({ path: p, bytes: st.size, lines: text.split('\n').filter(Boolean).length });
    } catch (e) {
      sources.push({ path: p, bytes: null, lines: 0, note: 'no existe o ilegible: ' + (e.code || e.message) });
    }
  }
  return { text: chunks.join('\n'), sources: sources };
}

function defaultDiscoverBase() {
  return {
    readAccessLog: () => readLogSources(ACCESS_LOG_PATHS),
    readListFile: (name) => fs.readFileSync(
      path.join(LISTS_DIR_PATH, String(name).replace(/^.*[\\/]/, '')), 'utf8'),
    hostIps: process.env.APE_SELF_IPS ? String(process.env.APE_SELF_IPS).split(',') : [],
  };
}

/**
 * Averigua que lista consume el device y con que ejes. NUNCA elige una IP si hay
 * varias candidatas (las reporta todas), NUNCA devuelve un valor por defecto y
 * NUNCA declara 0 silencioso cuando el log no existe o esta vacio.
 */
function discoverActiveList(deps, opts) {
  const d = deps || {};
  const o = Object.assign({ window_ms: DISCOVER_WINDOW_MS, now: Date.now() }, opts || {});
  const base = { routine: 'DISCOVER_ACTIVE_LIST', state: 'NO_COMPUTADO', reason: '', projection: null, evidence: null };
  try {
    let rawLog = null, sources = null;
    if (typeof d.readAccessLog === 'function') {
      const r = d.readAccessLog();
      if (r && typeof r === 'object' && typeof r.text === 'string') { rawLog = r.text; sources = r.sources || null; }
      else { rawLog = String(r === null || r === undefined ? '' : r); }
    }
    if (rawLog === null) {
      return Object.assign({}, base, { reason: 'NO_COMPUTADO: sin lector del log de acceso (no se inventa evidencia)' });
    }
    if (!sources) {
      sources = [{ path: '(inyectado por el llamador)', bytes: Buffer.byteLength(rawLog), lines: rawLog.split('\n').filter(Boolean).length }];
    }
    if (!rawLog.trim()) {
      return Object.assign({}, base, {
        reason: 'NO_COMPUTADO: los logs configurados estan vacios o no existen (' +
          sources.map((s) => s.path + (s.note ? ' [' + s.note + ']' : '')).join(', ') +
          '); no se declara un 0 silencioso',
        evidence: { log_sources: sources, log_lines: 0, candidates: [], excluded: { loopback: 0, self_host: 0, total_lines: 0 } },
      });
    }
    const entries = parseAccessLog(rawLog);
    const selfIps = new Set([].concat(LOOPBACK_IPS, Array.isArray(d.hostIps) ? d.hostIps : []));
    const since = o.now - o.window_ms;
    let loopback = 0, selfHost = 0;
    const byIp = new Map();
    for (const e of entries) {
      if (selfIps.has(e.ip)) {
        if (LOOPBACK_IPS.indexOf(e.ip) !== -1) { loopback++; } else { selfHost++; }
        continue;
      }
      if (e.ts === null || e.ts < since) { continue; }
      const g = byIp.get(e.ip) || { ip: e.ip, requests_total: 0, list_requests: 0, pulse_requests: 0, last_ts: null, files: new Map() };
      g.requests_total++;
      if (/\/pulse(?:[/?]|$)/.test(e.path)) { g.pulse_requests++; }
      const nm = (e.path.match(LIST_NAME_RE) || [])[1];
      if (nm && LIST_PATH_RE.test(e.path)) {
        g.list_requests++;
        g.files.set(nm, (g.files.get(nm) || 0) + 1);
      }
      if (g.last_ts === null || e.ts > g.last_ts) { g.last_ts = e.ts; }
      byIp.set(e.ip, g);
    }
    const excluded = { loopback: loopback, self_host: selfHost, total_lines: entries.length };
    const all = [...byIp.values()].sort((a, b) => (b.list_requests - a.list_requests) || (b.requests_total - a.requests_total));
    const candidates = all.filter((c) => c.list_requests > 0);
    const ctxEv = { log_sources: sources, log_lines: rawLog.split('\n').filter(Boolean).length, excluded: excluded };
    if (candidates.length === 0) {
      return Object.assign({}, base, {
        reason: 'NO_COMPUTADO: 0 peticiones de lista desde un device en la ventana de ' + o.window_ms + ' ms (autotrafico excluido: ' + loopback + ' loopback + ' + selfHost + ' del propio host; IPs vistas: ' + all.length + ')',
        evidence: Object.assign(ctxEv, { candidates: all.map((c) => ({ ip: c.ip, requests_total: c.requests_total, list_requests: c.list_requests, pulse_requests: c.pulse_requests })) }),
      });
    }
    if (candidates.length > 1) {
      return Object.assign({}, base, {
        reason: 'NO_COMPUTADO: ' + candidates.length + ' candidatos con trafico de lista; se reportan todos y no se elige uno',
        evidence: Object.assign(ctxEv, { candidates: candidates.map((c) => ({ ip: c.ip, requests_total: c.requests_total, list_requests: c.list_requests, pulse_requests: c.pulse_requests, last_ts: c.last_ts === null ? null : new Date(c.last_ts).toISOString() })) }),
      });
    }
    const c = candidates[0];
    const files = [...c.files.entries()].sort((a, b) => b[1] - a[1]);
    const name = files.length ? files[0][0] : null;
    const ev = Object.assign(ctxEv, {
      device_ip: c.ip,
      list_file: name,
      last_ts: c.last_ts === null ? null : new Date(c.last_ts).toISOString(),
      requests_total: c.requests_total,
      list_requests: c.list_requests,
      pulse_requests: c.pulse_requests,
      requests_in_window: c.requests_total,
      files: files.map((f) => ({ name: f[0], requests: f[1] })),
    });
    if (!name) {
      return Object.assign({}, base, { reason: 'NO_COMPUTADO: peticiones sin nombre de lista reconocible', evidence: ev });
    }
    /* El nombre publico puede servir OTRO fichero (stub de 8 B -> pulse/<name>):
     * se prueban los dos y gana el que tenga mas URLs de canal. */
    let best = null, bestCount = -1, bestPath = null;
    const tried = [];
    for (const cand of [name, 'pulse/' + name]) {
      let txt = null;
      try { txt = typeof d.readListFile === 'function' ? d.readListFile(cand) : null; } catch (e) { txt = null; }
      if (txt === null || txt === undefined) { tried.push({ path: cand, bytes: null, urls: 0, note: 'no legible' }); continue; }
      const u = listUrls(String(txt));
      tried.push({ path: cand, bytes: String(txt).length, urls: u.length });
      if (u.length > bestCount) { best = String(txt); bestCount = u.length; bestPath = cand; }
    }
    ev.list_tried = tried;
    if (best === null) {
      return Object.assign({}, base, { reason: 'NO_COMPUTADO: no se pudo leer la lista ' + name + ' ni pulse/' + name + ' (solo lectura, no se inventa su contenido)', evidence: ev });
    }
    const urls = listUrls(best);
    const cl = classifyUrls(urls);
    const profile_templates = (best.match(/#EXT-X-APE-PROFILE-TEMPLATE/g) || []).length;
    const shimott_count = (best.match(/#EXTSHIMOTT/g) || []).length;
    ev.list_resolved = bestPath;
    ev.list_bytes = Buffer.byteLength(best);
    ev.urls_total = urls.length;
    ev.urls_pulse = cl.pulse;
    ev.urls_direct = cl.direct;
    ev.urls_sample = urls.slice(0, 3);
    ev.profile_templates = profile_templates;
    ev.shimott_count = shimott_count;
    const projection = (cl.state === 'PULSE_PROXIED')
      ? ((profile_templates > 0 || shimott_count > 0) ? 'LIGHT_PROJECTED' : 'PULSE_ONLY')
      : 'DIRECT_NO_PROJECTION';
    return {
      routine: 'DISCOVER_ACTIVE_LIST',
      state: cl.state,
      projection: projection,
      reason: cl.reason + ' · proyeccion=' + projection + ' (plantillas=' + profile_templates + ', #EXTSHIMOTT=' + shimott_count + ')' + (bestPath !== name ? ' · servida desde ' + bestPath : ''),
      evidence: ev,
    };
  } catch (e) {
    return Object.assign({}, base, { reason: 'NO_COMPUTADO: excepcion leyendo la evidencia: ' + e.message });
  }
}
const BUILTIN_ROUTINES = Object.freeze({
  DISCOVER_ACTIVE_LIST: (deps) => discoverActiveList(deps || {}, (deps && deps.discover) || {}),
});
/* ── F4 · JUEZ EN PROCESO SEPARADO ─────────────────────────────────────────
 * Si el juez vive en el mismo proceso que el que propone, el que propone se
 * juzga a si mismo. Aqui el juez es un PROCESO HIJO (fork de este mismo fichero
 * con --judge-worker): PIDs distintos, vidas independientes. Apagar el operario
 * no apaga al juez; apagar al juez no apaga al operario.
 *
 * Unico uso de child_process: `fork(__filename, [...])`. No hay spawn, ni exec,
 * ni shell, ni nombre de programa libre. El test lo comprueba.
 */
const JUDGE_WORKER_FLAG = '--judge-worker';
const OPERATOR_WORKER_FLAG = '--operator-worker';

function workerMain(role) {
  process.on('message', (msg) => {
    const m = isPlainObject(msg) ? msg : {};
    if (m.op === 'ping') { if (process.send) { process.send({ op: 'pong', role: role, pid: process.pid }); } return; }
    if (role === 'judge' && m.op === 'judge') {
      const j = judge(m.before, m.after);
      const applied = m.applied || null;
      if (process.send) {
        process.send({ op: 'verdict', pid: process.pid, outcome: j.outcome, reason: j.reason, revert: applied ? decideRevert(j, applied) : null });
      }
      return;
    }
    if (role === 'operator' && m.op === 'apply') {
      const cat = loadCatalog();
      const v = validate(m.round, cat, { side: (m.round && m.round.side) || 'vps' });
      if (process.send) { process.send({ op: 'applied', pid: process.pid, ok: v.ok, code: v.code, reason: v.reason }); }
      return;
    }
    if (process.send) { process.send({ op: 'error', pid: process.pid, code: 'E_MSG_UNKNOWN' }); }
  });
  if (process.send) { process.send({ op: 'ready', role: role, pid: process.pid }); }
}

/** Lanza el juez como proceso hijo: ask() juzga alli, no aqui. */
function spawnJudge(opts) {
  const o = opts || {};
  const child = require('child_process').fork(__filename, [JUDGE_WORKER_FLAG], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: o.env || process.env,
  });
  const waiters = [];
  child.on('message', (m) => {
    if (!m || m.op !== 'verdict') { return; }
    const w = waiters.shift();
    if (typeof w === 'function') { w(m); }
  });
  return {
    pid: child.pid,
    alive: () => child.exitCode === null && child.signalCode === null,
    ask: (before, after, applied) => new Promise((resolve) => {
      const timer = setTimeout(() => { resolve(null); }, 5000);
      waiters.push((m) => { clearTimeout(timer); resolve(m); });
      child.send({ op: 'judge', before: before, after: after, applied: applied || null });
    }),
    kill: () => { try { child.kill(); } catch (_) { /* ya muerto */ } },
    child: child,
  };
}

/** Lanza un operario-hijo, para demostrar vidas independientes. */
function spawnOperator(opts) {
  const o = opts || {};
  const child = require('child_process').fork(__filename, [OPERATOR_WORKER_FLAG], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: o.env || process.env,
  });
  const once = (op, msg, ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { child.removeListener('message', onMsg); resolve(null); }, ms || 5000);
    const onMsg = (m) => { if (m && m.op === op) { clearTimeout(timer); child.removeListener('message', onMsg); resolve(m); } };
    child.on('message', onMsg);
    child.send(msg);
  });
  return {
    pid: child.pid,
    alive: () => child.exitCode === null && child.signalCode === null,
    ping: () => once('pong', { op: 'ping' }),
    apply: (round) => once('applied', { op: 'apply', round: round }),
    kill: () => { try { child.kill(); } catch (_) { /* ya muerto */ } },
    child: child,
  };
}

/* Ganchos de entrada: SOLO si este fichero es el programa principal y trae el
 * flag. Cargado como modulo (require) no arranca ningun bucle. */
if (require.main === module) {
  if (process.argv.indexOf(JUDGE_WORKER_FLAG) !== -1) { workerMain('judge'); }
  else if (process.argv.indexOf(OPERATOR_WORKER_FLAG) !== -1) { workerMain('operator'); }
}

module.exports = {
  loadCatalog, validate, clampStep, apply, diffObjects, judge, decideRevert,
  auditRecord, auditAppend, boundedCall, setInObject,
  /* t87 */
  operatorId, readShared, writeShared, publishDecision, wake, takeWake, emptyShared,
  validateRoutine, runRoutine, validateProcess, wakeProcess,
  discoverActiveList, parseAccessLog, listUrls, classifyUrls, readLogSources, DISCOVER_WINDOW_MS, LOOPBACK_IPS, ACCESS_LOG_PATHS,
  spawnJudge, spawnOperator,
  ROUTINES, PROCESSES, FORBIDDEN_PROCESS, OPERATOR_ID_SALT, SHARED_STATE_SCHEMA,
  JUDGE_WORKER_FLAG, OPERATOR_WORKER_FLAG,
  CODES, AUDIT_FIELDS, DEADBANDS, STRUCTURE_MARKERS, STRUCTURE_PATTERNS, CODE_MARKERS,
  LLM_TIMEOUT_MS, LLM_MAX_TOKENS_OUT, LLM_CALLS_PER_ROUND,
};
