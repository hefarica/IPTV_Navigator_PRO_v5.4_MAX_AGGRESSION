#!/usr/bin/env node
'use strict';
/**
 * tools/quality/test_canary_jit_contract.js
 *
 * Validador FAIL-CLOSED del contrato Canary -> JIT (ape.canary_jit.contract.v1).
 *
 * Reglas duras que este fichero hace cumplir:
 *   - Triple estado: requested / applied / output no se colapsan nunca.
 *   - applied solo existe con recibo medido (frames > 0, artefacto legible, aritmetica coherente).
 *   - La paridad se COMPUTA etapa por etapa; la etiqueta FILTERGRAPH_IDENTICAL no es prueba.
 *   - El encoder se exige completo (params libres + rate control + GOP) y con huella que case.
 *   - El motor se pinea por sha256, nunca por ruta.
 *   - Un artefacto sin fila en _vps_stage/deploy/manifest.tsv (SINGULAR) es NOT_DEPLOYED.
 *   - HDR (PQ/HLG/DV) no se mapea a cadena SDR de 8 bits; cadencia y audio se preservan.
 *   - -c:v copy con filtros = rechazo duro.
 *   - Degradacion solo con los cinco campos de autorizacion.
 *   - Ley Cardinal 1: el nivel declarado debe cargar resolucion + fps.
 *   - Umbral sin dato => gate 'desconocido' => rechazo.
 *
 * Sin dependencias, sin red, y escribe UNICAMENTE dentro de os.tmpdir().
 *
 * Uso:
 *   node tools/quality/test_canary_jit_contract.js
 *   node tools/quality/test_canary_jit_contract.js --require-policy   # el pin de politica pasa a ser obligatorio
 *   node tools/quality/test_canary_jit_contract.js --contract <ruta>
 *
 * Exit: 0 solo si el contrato es coherente Y todos los fixtures se comportan como se declara.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const ARGS = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = ARGS.indexOf(name);
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : fallback;
};
const CONTRACT_PATH = path.resolve(ROOT, argOf('--contract', 'contracts/canary_jit_contract_v1.json'));
const REQUIRE_POLICY = ARGS.includes('--require-policy');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* ------------------------------------------------------------------ *
 * ITU-T H.265 Annex A — maxima capacidad por nivel (Ley Cardinal 1)
 * ------------------------------------------------------------------ */
const HEVC_LEVELS = {
  93: { level: '3.1', maxLumaPs: 983040, maxLumaSr: 33177600 },
  120: { level: '4.0', maxLumaPs: 2228224, maxLumaSr: 66846720 },
  123: { level: '4.1', maxLumaPs: 2228224, maxLumaSr: 133693440 },
  150: { level: '5.0', maxLumaPs: 8912896, maxLumaSr: 267386880 },
  153: { level: '5.1', maxLumaPs: 8912896, maxLumaSr: 534773760 },
  156: { level: '5.2', maxLumaPs: 8912896, maxLumaSr: 1069547520 },
  180: { level: '6.0', maxLumaPs: 35651584, maxLumaSr: 1069547520 },
  183: { level: '6.1', maxLumaPs: 35651584, maxLumaSr: 2139095040 },
  186: { level: '6.2', maxLumaPs: 35651584, maxLumaSr: 4278190080 }
};

const TRANSFER_CLASS = {
  bt709: 'SDR',
  smpte170m: 'SDR',
  smpte2084: 'HDR_PQ',
  'arib-std-b67': 'HDR_HLG',
  dovi: 'HDR_DV',
  dvhe: 'HDR_DV',
  dvh1: 'HDR_DV'
};
const HDR_TRANSFERS = ['HDR_PQ', 'HDR_HLG', 'HDR_DV'];

const CODEC_RANK = { h264: 1, avc: 1, avc1: 1, hevc: 2, h265: 2, hvc1: 2, hev1: 2, av1: 3, av01: 3, vvc: 4, h266: 4 };

/** Nivel HEVC a partir de un idc (153), de un codec string (hvc1.2.4.L153.B0) o de "5.1". */
function parseHevcLevel(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return HEVC_LEVELS[value] ? value : null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return HEVC_LEVELS[Number(s)] ? Number(s) : null;
  const codecMatch = s.match(/\.L(\d+)(?:\.|$)/i);
  if (codecMatch) return HEVC_LEVELS[Number(codecMatch[1])] ? Number(codecMatch[1]) : null;
  const dotted = s.match(/^(\d+)\.(\d)$/);
  if (dotted) {
    const idc = Number(dotted[1]) * 30 + Number(dotted[2]) * 3;
    return HEVC_LEVELS[idc] ? idc : null;
  }
  return null;
}

/** ¿Carga el nivel declarado la resolucion + fps? (ITU-T H.265 Annex A) */
function levelLoads(levelIdc, width, height, fps) {
  const row = HEVC_LEVELS[levelIdc];
  if (!row) return { ok: false, reason: 'nivel HEVC desconocido: ' + levelIdc, idc: null };
  const lumaPs = Number(width) * Number(height);
  const lumaSr = lumaPs * Number(fps);
  const okPs = lumaPs <= row.maxLumaPs;
  const okSr = lumaSr <= row.maxLumaSr;
  return {
    ok: okPs && okSr,
    idc: levelIdc,
    level: row.level,
    lumaPs,
    lumaSr,
    maxLumaPs: row.maxLumaPs,
    maxLumaSr: row.maxLumaSr,
    reason: okPs && okSr ? 'carga' : (okPs ? 'MaxLumaSR excedido' : 'MaxLumaPs excedido')
  };
}

/* ------------------------------------------------------------------ *
 * Huella del encoder — debe ser identica a contracts/canary_jit_contract_v1.json
 * ------------------------------------------------------------------ */
function encoderFingerprint(enc) {
  if (!enc || typeof enc !== 'object') return null;
  const rc = enc.rate_control || {};
  const gop = enc.gop || {};
  const params = Array.isArray(enc.x265_params) ? enc.x265_params.slice().sort().join(':') : null;
  const fields = [enc.video_codec, enc.preset, enc.tune, params, rc.b_v, rc.maxrate, rc.bufsize, gop.g, gop.keyint_min, gop.sc_threshold];
  if (fields.some((v) => v === null || v === undefined || v === '')) return null;
  const canonical = [
    'codec=' + enc.video_codec,
    'preset=' + enc.preset,
    'tune=' + enc.tune,
    'x265-params=' + params,
    'b:v=' + rc.b_v,
    'maxrate=' + rc.maxrate,
    'bufsize=' + rc.bufsize,
    'g=' + gop.g,
    'keyint_min=' + gop.keyint_min,
    'sc_threshold=' + gop.sc_threshold
  ].join('|');
  return { canonical, sha256: sha256(Buffer.from(canonical, 'utf8')) };
}

/* ------------------------------------------------------------------ *
 * Paridad de filtergraph COMPUTADA (no etiqueta)
 * ------------------------------------------------------------------ */
function splitFiltergraph(chain) {
  if (typeof chain !== 'string' || chain.trim() === '') return [];
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of chain) {
    if (ch === "'") { quoted = !quoted; cur += ch; continue; }
    if (ch === ',' && !quoted) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

function computeParity(appliedFiltergraph, canonicalStages) {
  const applied = splitFiltergraph(appliedFiltergraph);
  const canonical = (canonicalStages || []).map((s) => s.filter);
  const missing = canonical.filter((f) => !applied.includes(f));
  const extra = applied.filter((f) => !canonical.includes(f));
  const order_mismatch = [];
  const common = applied.filter((f) => canonical.includes(f));
  common.forEach((f, i) => {
    const canonicalCommon = canonical.filter((c) => applied.includes(c));
    if (canonicalCommon[i] !== f) order_mismatch.push(f);
  });
  return {
    computed: true,
    derived_from: 'applied.filtergraph',
    identical: applied.length === canonical.length && applied.every((f, i) => f === canonical[i]),
    stage_count: applied.length,
    canonical_stage_count: canonical.length,
    missing,
    extra,
    order_mismatch
  };
}

/* ------------------------------------------------------------------ *
 * Utilidades de geometria / pix_fmt / audio
 * ------------------------------------------------------------------ */
function parseRatio(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d+):(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  if (!n || !d) return null;
  return { n, d, value: n / d };
}

function pixFmtDepth(pixFmt) {
  if (typeof pixFmt !== 'string') return null;
  const m = pixFmt.match(/p(\d{1,2})(le|be)?$/);
  if (m) return Number(m[1]);
  return { yuv420p: 8, yuv422p: 8, yuv444p: 8, yuvj420p: 8, rgb24: 8, gray: 8 }[pixFmt] || null;
}

function chromaClass(pixFmt) {
  if (typeof pixFmt !== 'string') return null;
  if (pixFmt.includes('444')) return 3;
  if (pixFmt.includes('422')) return 2;
  if (pixFmt.includes('420')) return 1;
  return null;
}

function codecRank(name) {
  if (typeof name !== 'string') return null;
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const k of Object.keys(CODEC_RANK)) if (key.startsWith(k)) return CODEC_RANK[k];
  return null;
}

function num(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function artifactBytes(relOrAbs) {
  /* DEFECTO ARREGLADO 2026-11-12: `path.isAbsolute` LANZA TypeError
   * (ERR_INVALID_ARG_TYPE) con cualquier cosa que no sea string — medido con
   * objeto, null y undefined. `validateReceipt` no tiene try/catch envolvente,
   * asi que el throw de L459 (applied.evidence.artifact) o el de L1132
   * (manifestFile) SALIA del juez: en vez de rechazar con un codigo, el
   * verificador reventaba. Un juez que excepciona se puede sortear.
   *
   * El contrato documenta `artifact` como objeto (path + sha256 + bytes, L61),
   * asi que aqui se acepta esa forma leyendo SOLO su ruta: los sha256/bytes
   * declarados en el objeto NO se usan como medida; se miden del disco. La
   * forma string que usan los llamadores internos no cambia. */
  let rel;
  try {
    rel = (relOrAbs && typeof relOrAbs === 'object')
      ? (relOrAbs.path || relOrAbs.file || relOrAbs.rel || '')
      : relOrAbs;
  } catch (e) {
    /* Un getter hostil en `path` tambien lanzaria. JSON.parse no puede crear
     * getters, asi que esto no es alcanzable desde un recibo en disco, pero la
     * invariante de esta funcion es NO LANZAR nunca: si algo lanza, el juez
     * revienta y deja de juzgar. */
    return null;
  }
  if (typeof rel !== 'string' || rel.length === 0) return null;
  const abs = path.isAbsolute(rel) ? rel : path.resolve(ROOT, rel);
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) return null;
    return { path: abs, bytes: st.size, sha256: sha256(fs.readFileSync(abs)) };
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Campos obligatorios — UNA SOLA FUENTE: contract.receipt_schema
 *
 * El defecto de clase que esto arregla: el contrato declaraba campos
 * obligatorios que el validador no exigia, asi que OMITIR un campo
 * desactivaba la guarda en silencio. Aqui las listas required_* se leen
 * del JSON del contrato en tiempo de ejecucion: no hay una segunda lista
 * en codigo que pueda divergir.
 * ------------------------------------------------------------------ */
function getPath(obj, dotted) {
  let cur = obj;
  for (const seg of String(dotted).split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

function isPresent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

/** Recorre required_field_levels DEL CONTRATO y devuelve la primera ausencia. */
function walkRequiredFields(receipt, contract) {
  const schema = (contract && contract.receipt_schema) || {};
  const levels = schema.required_field_levels;
  const prefixOf = schema.required_field_level_map || {};
  const ownedBy = schema.gate_precedence || {};
  const guardOf = schema.guard_map || {};
  const skipped = [];
  const checked = [];
  if (!Array.isArray(levels) || levels.length === 0) {
    return { ok: false, code: 'E_REQUIRED_FIELD_MISSING', path: 'receipt_schema.required_field_levels', detail: 'el contrato no declara required_field_levels: sin fuente de obligatorios el validador no puede exigirlos' };
  }
  const status = getPath(receipt, 'applied.status');
  for (const level of levels) {
    const when = (schema.required_when || {})[level];
    if (when === 'applied.status=APPLIED_MEASURED' && status !== 'APPLIED_MEASURED') continue;
    const fields = schema[level];
    const prefix = prefixOf[level];
    if (!Array.isArray(fields)) {
      return { ok: false, code: 'E_REQUIRED_FIELD_MISSING', path: 'receipt_schema.' + level, detail: 'el contrato lista el nivel "' + level + '" pero no trae su array de campos' };
    }
    if (typeof prefix !== 'string') {
      return { ok: false, code: 'E_REQUIRED_FIELD_MISSING', path: 'receipt_schema.required_field_level_map.' + level, detail: 'el contrato no mapea el nivel "' + level + '" a un prefijo de path' };
    }
    if (prefix !== '') {
      const parentPath = prefix.slice(0, -1);
      const parent = getPath(receipt, parentPath);
      if (parent !== undefined && (parent === null || typeof parent !== 'object')) {
        return { ok: false, code: 'E_REQUIRED_FIELD_MISSING', path: parentPath, guard: guardOf[parentPath] || null, detail: 'se esperaba un objeto en "' + parentPath + '" y llego ' + (Array.isArray(parent) ? 'array' : typeof parent) };
      }
    }
    for (const field of fields) {
      const full = prefix + field;
      if (ownedBy[full]) { skipped.push(full + '->' + ownedBy[full]); continue; }
      checked.push(full);
      if (!isPresent(getPath(receipt, full))) {
        const guard = guardOf[full] || null;
        return {
          ok: false,
          code: 'E_REQUIRED_FIELD_MISSING',
          path: full,
          guard,
          detail: 'falta el campo obligatorio "' + full + '"' + (guard ? ' (protege la guarda ' + guard + ')' : '') + ': omitirlo NO desactiva la guarda en silencio, la rechaza'
        };
      }
    }
  }
  return { ok: true, checked, skipped };
}

/** El recibo queda atado a la receta de la autoridad, o no es de esta autoridad. */
function checkReceiptPolicyPin(receipt, contract) {
  const spec = ((contract && contract.receipt_schema) || {}).policy_pin || {};
  const pinPath = spec.path || 'requested.policy_sha256';
  const refPath = spec.reference || 'authority_block.policy_sha256';
  const claimed = getPath(receipt, pinPath);
  const expected = String(getPath(contract, refPath) || '').toLowerCase();
  if (!isPresent(claimed)) return { ok: false, path: pinPath, detail: pinPath + ' ausente: sin pin el recibo no queda atado a la receta y "Canary es la autoridad" es decorativo' };
  const value = String(claimed).trim().toLowerCase();
  if (!HEX64.test(value)) return { ok: false, path: pinPath, detail: pinPath + ' mal formado (' + JSON.stringify(claimed) + '): se exigen 64 hex' };
  if (/^0+$/.test(value)) return { ok: false, path: pinPath, detail: pinPath + ' todo ceros: no identifica ninguna receta' };
  if (value !== expected) return { ok: false, path: pinPath, detail: pinPath + '=' + value.slice(0, 16) + '… no es el pin de la autoridad ' + expected.slice(0, 16) + '…' };
  return { ok: true, path: pinPath, detail: value.slice(0, 16) + '…' };
}

/* ------------------------------------------------------------------ *
 * El validador. Devuelve { decision, code, reasons, derived }.
 * ------------------------------------------------------------------ */
function validateReceipt(receipt, contract) {
  const reasons = [];
  const derived = { parity: null, encoder_fingerprint: null, level: null, capacity: null, degradation: [], geometry: {} };
  const reject = (code, reason) => ({ decision: 'REJECT', code, reasons: reasons.concat([reason]), derived });

  /* 1. schema del recibo */
  const wantSchema = contract.receipt_schema && contract.receipt_schema.id;
  if (!receipt || typeof receipt !== 'object') return reject('E_RECEIPT_SCHEMA', 'recibo ausente o no es un objeto');
  if (receipt.schema !== wantSchema) {
    return reject('E_RECEIPT_SCHEMA', 'receipt.schema=' + JSON.stringify(receipt.schema) + ' y se exige ' + JSON.stringify(wantSchema));
  }

  /* 2. triple estado: nada se colapsa */
  for (const key of ['requested', 'applied', 'output']) {
    if (!receipt[key] || typeof receipt[key] !== 'object') {
      return reject('E_STATE_COLLAPSED', 'falta el estado "' + key + '": el triple requested/applied/output no se puede colapsar');
    }
  }
  for (const key of ['mode', 'desired_mode', 'applied_processing', 'execution', 'canary_fidelity']) {
    if (Object.prototype.hasOwnProperty.call(receipt, key)) {
      return reject('E_STATE_COLLAPSED', 'el recibo trae el estado plano "' + key + '" en la raiz en lugar del triple');
    }
  }
  const requested = receipt.requested;
  const applied = receipt.applied;
  const output = receipt.output;
  const source = requested.source || {};
  const status = applied.status;

  /* 2b. pin de la politica: el recibo queda atado a la receta, o no es de esta autoridad */
  const pinClaim = checkReceiptPolicyPin(receipt, contract);
  derived.policy_pin = pinClaim;
  if (!pinClaim.ok) return reject('E_POLICY_PIN_MISMATCH', pinClaim.detail);

  /* 2c. campos obligatorios: UN solo walker sobre las listas required_* del contrato.
         Va antes que las guardas semanticas para que una omision no pueda desactivarlas. */
  const walk = walkRequiredFields(receipt, contract);
  derived.required_fields = walk;
  if (!walk.ok) {
    return reject(walk.code, walk.detail + ' [path: ' + walk.path + ']' + (walk.guard ? ' [guarda: ' + walk.guard + ']' : ''));
  }

  /* 3. motor pineado por sha256, nunca por ruta */
  const engineSha = typeof receipt.engine_sha256 === 'string' ? receipt.engine_sha256.trim().toLowerCase() : '';
  if (!HEX64.test(engineSha)) {
    return reject('E_ENGINE_SHA_UNVERIFIED', 'engine_sha256 ausente o mal formado (' + JSON.stringify(receipt.engine_sha256) + '): un recibo que no nombra el sha del motor no acredita nada');
  }
  const deployable = String(contract.engine.deployable_engine_sha256).toLowerCase();
  if (engineSha !== deployable) {
    return reject('E_ENGINE_SHA_UNVERIFIED', 'engine_sha256 ' + engineSha.slice(0, 16) + '... no es el sha desplegable del manifiesto (' + deployable.slice(0, 16) + '...)');
  }
  if (!isPresent(applied.engine_sha256)) {
    return reject('E_ENGINE_SHA_UNVERIFIED', 'applied.engine_sha256 ausente: gate_precedence declara que este path lo valida ESTE gate; un gate que no rechaza la ausencia deja la guarda desactivada en silencio (F7 de t9)');
  }
  if (String(applied.engine_sha256).toLowerCase() !== engineSha) {
    return reject('E_ENGINE_SHA_UNVERIFIED', 'applied.engine_sha256 no coincide con receipt.engine_sha256');
  }

  /* 4. desplegabilidad: sin fila en el manifest no hay deploy */
  const dep = receipt.deployability || {};
  const depContract = contract.deployability;
  if (dep.manifest_file && path.basename(String(dep.manifest_file)) !== path.basename(depContract.manifest_file)) {
    return reject('E_STATE_COLLAPSED', 'deployability.manifest_file debe ser ' + depContract.manifest_file + ' (SINGULAR); recibido ' + dep.manifest_file);
  }
  if (dep.state === 'DEPLOYED') {
    const depSha = String(dep.sha256 || '').toLowerCase();
    const rows = [depContract.loop_artifact, depContract.mapped_artifact];
    const row = rows.find((r) => String(r.sha256).toLowerCase() === depSha);
    if (!row || row.manifest_rows === 0) {
      return reject('E_NOT_DEPLOYED', 'declara DEPLOYED el sha ' + depSha.slice(0, 16) + '... que tiene 0 filas en ' + depContract.manifest_file);
    }
    if (dep.jit_loop === true && row.jit_hits === 0) {
      return reject('E_NOT_DEPLOYED', 'declara el bucle Canary<->JIT desplegado sobre un artefacto con 0 hits de jit (' + row.path + ')');
    }
  }

  const measured = status === 'APPLIED_MEASURED';
  if (status !== 'APPLIED_MEASURED' && status !== 'NOT_APPLIED') {
    return reject('E_STATE_COLLAPSED', 'applied.status=' + JSON.stringify(status) + ' no es un estado declarado; applied no puede quedar indefinido');
  }

  /* 5. una ruta que solo construye -vf no acredita encoder */
  const partialRoutes = ((contract.encoder.partial_receipts_that_never_accredit_encoder) || []).map((r) => r.route);
  if (measured && partialRoutes.includes(applied.route)) {
    return reject('E_RECEIPT_INSUFFICIENT_FOR_ENCODER', 'la ruta "' + applied.route + '" solo construye el -vf: -preset/-tune/-x265-params no viajan, no puede acreditar encoder');
  }

  /* 6. encoder completo */
  if (measured) {
    const enc = applied.encoder || {};
    const need = ['video_codec', 'preset', 'tune', 'x265_params', 'rate_control', 'gop'];
    const missingFields = [];
    if (!enc.video_codec) missingFields.push('video_codec');
    if (!enc.preset) missingFields.push('preset');
    if (!enc.tune) missingFields.push('tune');
    if (!Array.isArray(enc.x265_params) || enc.x265_params.length === 0) missingFields.push('x265_params');
    const rc = enc.rate_control || {};
    for (const f of ['b_v', 'maxrate', 'bufsize']) if (!rc[f]) missingFields.push('rate_control.' + f);
    const gop = enc.gop || {};
    for (const f of ['g', 'keyint_min', 'sc_threshold']) if (gop[f] === undefined || gop[f] === null) missingFields.push('gop.' + f);
    if (missingFields.length) {
      return reject('E_ENCODER_BLOCK_INCOMPLETE', 'el encoder no se puede expresar con lo declarado; faltan ' + missingFields.join(', ') + ' (bloque exigido: ' + need.join('+') + ')');
    }
    const fp = encoderFingerprint(enc);
    derived.encoder_fingerprint = fp;
    const pinned = String(contract.encoder.fingerprint.sha256).toLowerCase();
    if (!fp || fp.sha256 !== pinned) {
      return reject('E_ENCODER_FINGERPRINT_MISMATCH', 'la huella del encoder (' + (fp ? fp.sha256.slice(0, 16) : 'null') + '...) no casa con la pineada (' + pinned.slice(0, 16) + '...): dos ejecuciones con la misma cadena y distinto rate control no son la misma imagen');
    }
  }

  /* 7. paridad computada, no etiqueta */
  const parityClaim = applied.parity;
  if (measured || parityClaim) {
    const computed = computeParity(applied.filtergraph, contract.chain.stages);
    derived.parity = computed;
    if (!parityClaim || parityClaim.computed !== true || parityClaim.derived_from !== 'applied.filtergraph') {
      return reject('E_FIDELITY_LABEL_NOT_MEASURED', 'la paridad se declara sin computed:true + derived_from:"applied.filtergraph": la etiqueta FILTERGRAPH_IDENTICAL es un literal, no una medida');
    }
    if (parityClaim.identical === true && computed.identical !== true) {
      return reject('E_FILTERGRAPH_DIVERGED', 'el recibo afirma paridad identica y la comparacion etapa por etapa la desmiente (faltan: [' + computed.missing.join(', ') + ']; extra: [' + computed.extra.join(', ') + '])');
    }
  }

  /* 8. aplicado exige evidencia de fotograma */
  if (measured) {
    const ev = applied.evidence || {};
    const frames = num(ev.frames);
    const seconds = num(ev.seconds);
    if (frames === null || frames <= 0) {
      return reject('E_APPLIED_WITHOUT_PROOF', 'APPLIED_MEASURED sin fotogramas: applied.evidence.frames=' + JSON.stringify(ev.frames));
    }
    if (seconds === null || seconds <= 0) {
      return reject('E_APPLIED_WITHOUT_PROOF', 'APPLIED_MEASURED sin duracion de codificacion: applied.evidence.seconds=' + JSON.stringify(ev.seconds));
    }
    if (num(ev.decode_errors) === null || num(ev.decode_errors) !== 0) {
      return reject('E_APPLIED_WITHOUT_PROOF', 'APPLIED_MEASURED con decode_errors=' + JSON.stringify(ev.decode_errors) + ' (se exige 0)');
    }
    const art = artifactBytes(ev.artifact);
    if (!art) {
      return reject('E_APPLIED_WITHOUT_PROOF', 'la evidencia de fotograma no tiene artefacto legible: ' + JSON.stringify(ev.artifact));
    }
    let evDoc;
    try { evDoc = readJson(art.path); } catch (e) {
      return reject('E_APPLIED_WITHOUT_PROOF', 'el artefacto de evidencia no es JSON legible: ' + e.message);
    }
    if (num(evDoc.frames) !== frames || Math.abs(num(evDoc.seconds) - seconds) > 1e-3) {
      return reject('E_APPLIED_WITHOUT_PROOF', 'el recibo declara ' + frames + ' f / ' + seconds + ' s y el artefacto dice ' + evDoc.frames + ' f / ' + evDoc.seconds + ' s');
    }
    const fpsMeasured = num(applied.measured_encode_fps);
    if (fpsMeasured === null || fpsMeasured <= 0) {
      return reject('E_CAPACITY_UNKNOWN', 'APPLIED_MEASURED sin fps de codificacion medido: el gate de capacidad queda desconocido y NO autoriza transcode');
    }
    const fpsFromEvidence = frames / seconds;
    if (Math.abs(fpsFromEvidence - fpsMeasured) / fpsMeasured > 0.02) {
      return reject('E_APPLIED_WITHOUT_PROOF', 'la aritmetica no cuadra: ' + frames + '/' + seconds + '=' + fpsFromEvidence.toFixed(4) + ' fps y se declaran ' + fpsMeasured);
    }
  } else if (num(output.filters_applied) > 0) {
    return reject('E_APPLIED_WITHOUT_PROOF', 'applied.status=NOT_APPLIED y output.filters_applied=' + output.filters_applied + ': un filtro aplicado no se puede declarar no aplicado');
  }

  /* 9. cadencia */
  const sourceFps = num(source.fps);
  const outputFps = num(output.fps);
  if (sourceFps === null || sourceFps <= 0) {
    return reject('E_FPS_CADENCE_CHANGED', 'sin fps de fuente no hay paridad de cadencia posible (requested.source.fps=' + JSON.stringify(source.fps) + ')');
  }
  if (outputFps === null || outputFps <= 0) {
    return reject('E_FPS_CADENCE_CHANGED', 'output.fps ausente o invalido (' + JSON.stringify(output.fps) + ')');
  }
  if (Math.abs(outputFps - sourceFps) > 0.01) {
    return reject('E_FPS_CADENCE_CHANGED', 'fps de salida ' + outputFps + ' != fps de fuente ' + sourceFps + ' (cambio de cadencia = rechazo)');
  }

  /* 10. copy no ejecuta filtros */
  if (applied.codec_mode === 'copy') {
    const filters = splitFiltergraph(applied.filtergraph || '');
    if (filters.length > 0 || num(output.filters_applied) > 0) {
      return reject('E_COPY_WITH_FILTERS', '-c:v copy con ' + (filters.length || output.filters_applied) + ' filtro(s) declarados: copy no ejecuta -vf');
    }
  }

  /* 11. HDR: una cadena SDR de 8 bits no toca una fuente HDR */
  const srcTransfer = TRANSFER_CLASS[String(source.transfer || '').toLowerCase()] || 'UNKNOWN';
  const outDepth = pixFmtDepth(output.pix_fmt);
  if (HDR_TRANSFERS.includes(srcTransfer)) {
    const outTransfer = TRANSFER_CLASS[String(output.transfer || '').toLowerCase()] || 'UNKNOWN';
    const sdrChain = splitFiltergraph(applied.filtergraph || '').some((f) => /^format=yuv420p$/.test(f));
    if (outTransfer === 'SDR' || sdrChain || (outDepth !== null && outDepth < 10)) {
      return reject('E_HDR_SOURCE_TO_SDR_CHAIN', 'fuente ' + srcTransfer + ' (' + source.transfer + ') mapeada a SDR/8 bits: transfer out=' + output.transfer + ', pix_fmt=' + output.pix_fmt + ', cadena SDR=' + sdrChain);
    }
  }

  /* 12. Dolby Vision sin RPU probado */
  if (srcTransfer === 'HDR_DV' && output.dv_rpu_preserved !== true) {
    return reject('E_DV_RPU_UNPROVEN', 'fuente Dolby Vision sin prueba de RPU en el bitstream (output.dv_rpu_preserved !== true)');
  }

  /* 13. geometria: DAR preservado y pixeles cuadrados */
  const srcDar = Number(source.width) > 0 && Number(source.height) > 0 ? Number(source.width) / Number(source.height) : null;
  const sar = parseRatio(output.sar);
  derived.geometry = { source_dar: srcDar, output_sar: sar ? sar.value : null };
  if (srcDar === null) {
    return reject('E_ASPECT_RATIO_DEFORMED', 'sin geometria de fuente no se puede probar preservacion de DAR');
  }
  const is16x9 = Math.abs(srcDar - 16 / 9) <= 0.01;
  const scaleStage = splitFiltergraph(applied.filtergraph || '').find((f) => f.startsWith('scale='));
  const arPreserving = splitFiltergraph(applied.filtergraph || '').some((f) => /\bscale=.*force_original_aspect_ratio=(decrease|increase)/.test(f));
  const padded = splitFiltergraph(applied.filtergraph || '').some((f) => f.startsWith('pad='));
  const outDar = Number(output.width) > 0 && Number(output.height) > 0 ? Number(output.width) / Number(output.height) : null;
  if (!is16x9 && scaleStage && !arPreserving && !padded) {
    return reject('E_ASPECT_RATIO_DEFORMED', 'fuente DAR ' + srcDar.toFixed(3) + ' (:1) escalada con "' + scaleStage + '" sin force_original_aspect_ratio: deforma el raster (medido: 1920x800 -> 3840x2160 SAR 27:20)');
  }
  if (sar && Math.abs(sar.value - 1) > 1e-6) {
    return reject('E_ASPECT_RATIO_DEFORMED', 'SAR de salida ' + output.sar + ' != 1:1: pixel anisotropico; la forma elegida es decrease+pad con pixeles cuadrados');
  }
  if (sar && outDar !== null && Math.abs(outDar * sar.value - srcDar) / srcDar > 0.01) {
    return reject('E_ASPECT_RATIO_DEFORMED', 'DAR de salida ' + (outDar * sar.value).toFixed(3) + ' (:1) != DAR de fuente ' + srcDar.toFixed(3) + ' (:1)');
  }

  /* 14. Ley Cardinal 1: nivel que carga resolucion + fps */
  if (/hevc|h265|hvc1|hev1/i.test(String(output.video_codec || output.level || ''))) {
    const idc = parseHevcLevel(output.level) || parseHevcLevel(output.video_codec);
    const check = levelLoads(idc, output.width, output.height, outputFps);
    derived.level = check;
    if (!check.ok) {
      return reject('E_LEVEL_RESOLUTION_IMPOSSIBLE', 'Ley Cardinal 1: nivel ' + (check.level || JSON.stringify(output.level)) + ' (idc ' + idc + ') no carga ' + output.width + 'x' + output.height + '@' + outputFps + ' — ' + check.reason + ' (' + check.lumaSr + ' > ' + check.maxLumaSr + ')' + (idc === null ? ' [nivel NO_COMPUTADO]' : ''));
    }
  }

  /* 15. audio perdido como paridad */
  const srcCh = num((source.audio || {}).channels);
  const outCh = num((output.audio || {}).channels);
  const usedAn = /(^|\s)-an(\s|$)/.test(String(applied.filtergraph || '')) || applied.audio_disabled === true;
  if (srcCh !== null && srcCh > 0 && (outCh === null || outCh === 0)) {
    return reject('E_AUDIO_LOST_AS_PARITY', 'fuente con ' + srcCh + ' canal(es) y salida con ' + JSON.stringify((output.audio || {}).channels) + ': el silencio no es paridad');
  }
  if (usedAn && srcCh !== null && srcCh > 0) {
    return reject('E_AUDIO_LOST_AS_PARITY', 'el recibo usa -an sobre una fuente con ' + srcCh + ' canal(es) y declara paridad');
  }

  /* 16. degradacion: solo con los cinco campos */
  const degradations = [];
  if (Number(output.width) * Number(output.height) < Number(source.width) * Number(source.height)) degradations.push('resolution');
  const rankSrc = codecRank(source.video_codec);
  const rankOut = codecRank(output.video_codec);
  if (rankSrc !== null && rankOut !== null && rankOut < rankSrc) degradations.push('codec');
  if (srcTransfer !== 'SDR' && (TRANSFER_CLASS[String(output.transfer || '').toLowerCase()] === 'SDR')) degradations.push('dynamic_range');
  const depthSrc = pixFmtDepth(source.pix_fmt);
  if (depthSrc !== null && outDepth !== null && outDepth < depthSrc) degradations.push('bit_depth');
  const chromaSrc = chromaClass(source.pix_fmt);
  const chromaOut = chromaClass(output.pix_fmt);
  if (chromaSrc !== null && chromaOut !== null && chromaOut < chromaSrc) degradations.push('chroma_subsampling');
  const brSrc = num(source.bitrate_bps);
  const brOut = num(output.bitrate_bps);
  if (brSrc !== null && brOut !== null && brOut < brSrc) degradations.push('video_bitrate');
  if (srcCh !== null && outCh !== null && outCh < srcCh) degradations.push('audio_channels');
  derived.degradation = degradations;
  if (degradations.length > 0) {
    const auth = receipt.degradation_authorization || {};
    const need = contract.degradation.exception_requires_all_five;
    const missing = need.filter((k) => auth[k] === undefined || auth[k] === null || String(auth[k]).trim() === '');
    if (missing.length) {
      return reject('E_DEGRADATION_UNAUTHORIZED', 'degradacion [' + degradations.join(', ') + '] sin autorizacion completa: faltan ' + missing.join(', ') + ' de los 5 campos');
    }
  }

  /* 17. capacidad: transcode solo si el fps medido alcanza al de la fuente */
  const measuredFps = num(applied.measured_encode_fps);
  const viable = measuredFps !== null && measuredFps >= sourceFps;
  derived.capacity = { source_fps: sourceFps, measured_encode_fps: measuredFps, viable };
  if (measured) {
    if (measuredFps === null) {
      return reject('E_CAPACITY_UNKNOWN', 'sin fps de codificacion medido el gate es desconocido: no se autoriza transcode');
    }
    if (measuredFps < sourceFps) {
      return reject('E_CAPACITY_INSUFFICIENT', 'transcode declarado aplicado a ' + measuredFps + ' fps medidos contra ' + sourceFps + ' fps de fuente: debe ser REMUX_PASSTHROUGH + NOT_APPLIED');
    }
  }
  if (!measured && measuredFps !== null && measuredFps >= sourceFps) {
    reasons.push('NOTA: capacidad suficiente (' + measuredFps + ' >= ' + sourceFps + ') y el recibo declara NOT_APPLIED: conservador, no es mentira');
  }
  if (!measured && measuredFps !== null && measuredFps < sourceFps && applied.reason !== 'CAPACITY_INSUFFICIENT') {
    reasons.push('NOTA: NOT_APPLIED sin reason=CAPACITY_INSUFFICIENT aunque la capacidad no alcanza; se acepta por ser la decision honesta');
  }

  /* 18. 4K falso: declarar nativo lo que es upscale */
  if (output.declared === 'NATIVE' && (Number(output.width) > Number(source.width) || Number(output.height) > Number(source.height))) {
    return reject('E_FAKE_NATIVE_CLAIM', 'declara NATIVA una salida de ' + output.width + 'x' + output.height + ' desde ' + source.width + 'x' + source.height + ': es upscale y debe declararse UPSCALE_FROM_SOURCE');
  }

  return {
    decision: 'ACCEPT',
    code: measured ? 'OK_APPLIED_MEASURED' : 'OK_NOT_APPLIED',
    reasons: reasons.concat(['estado aplicado: ' + status + '; cadencia ' + outputFps + ' fps; capacidad ' + (measuredFps === null ? 'NO_COMPUTADA' : measuredFps + ' fps')]),
    derived
  };
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-canary-jit-contract-'));
const evidenceCache = new Map();

function evidenceArtifact(frames, seconds) {
  const key = frames + 'x' + seconds;
  if (!evidenceCache.has(key)) {
    const file = path.join(TMP, 'evidence_' + frames + '_' + seconds + '.json');
    fs.writeFileSync(file, JSON.stringify({
      probe: 'encode_progress',
      frames,
      seconds,
      decode_errors: 0,
      note: 'fixture sintetica del validador: no es una medicion del VPS'
    }, null, 2));
    evidenceCache.set(key, file);
  }
  return evidenceCache.get(key);
}

function baseReceipt(overrides) {
  const base = {
    schema: 'ape.canary_jit.receipt.v1',
    engine_sha256: '8e9e663b43f822a9b9c8d3ecde38ec0a296441b926b47cec81803867f229b6e5',
    deployability: {
      state: 'NOT_DEPLOYED',
      artifact: 'vps/bin/ape-visual-emulate.sh',
      sha256: 'f1d2ecff6e6468eb58e04658703a34df8b0e2df1c7d61540abbb84ebf768fec1',
      manifest_file: '_vps_stage/deploy/manifest.tsv',
      jit_loop: true
    },
    requested: {
      mode: 'CANARY_SPATIAL_4K',
      policy_sha256: '9845aa5da438213d86b1e58fdb8c5e7c081395e0de9798d23689a2dd8b86fc65',
      policy_revision: 1,
      source: {
        width: 3840,
        height: 2160,
        fps: 25,
        transfer: 'bt709',
        pix_fmt: 'yuv420p',
        video_codec: 'hevc',
        bitrate_bps: 18000000,
        audio: { codec: 'aac', channels: 6 }
      },
      desired: { width: 3840, height: 2160, video_codec: 'libx265', level: 'L153' }
    },
    applied: {
      status: 'APPLIED_MEASURED',
      route: 'canary_canonical',
      engine_sha256: '8e9e663b43f822a9b9c8d3ecde38ec0a296441b926b47cec81803867f229b6e5',
      codec_mode: 'transcode',
      filtergraph: 'deblock,smartblur=lr=1.5:ls=-0.5,format=yuv444p,scale=3840:2160:flags=lanczos,noise=alls=8:allf=t,unsharp=5:5:0.8:3:3:0.4,eq=contrast=1.05:brightness=0.02:saturation=1.05,format=yuv420p',
      encoder: {
        video_codec: 'libx265',
        preset: 'ultrafast',
        tune: 'zerolatency',
        x265_params: ['pools=1', 'frame-threads=1', 'keyint=48', 'min-keyint=48', 'scenecut=0', 'bframes=0', 'rc-lookahead=0'],
        rate_control: { b_v: '25M', maxrate: '32M', bufsize: '64M' },
        gop: { g: 48, keyint_min: 48, sc_threshold: 0 }
      },
      evidence: { frames: 750, seconds: 30, decode_errors: 0, artifact: evidenceArtifact(750, 30) },
      measured_encode_fps: 25,
      parity: { computed: true, derived_from: 'applied.filtergraph', identical: true },
      audio_disabled: false
    },
    output: {
      width: 3840,
      height: 2160,
      fps: 25,
      transfer: 'bt709',
      pix_fmt: 'yuv420p',
      video_codec: 'hevc',
      level: 153,
      sar: '1:1',
      bitrate_bps: 25000000,
      audio: { codec: 'aac', channels: 6 },
      filters_applied: 8,
      declared: 'NATIVE',
      artifact: { path: 'out/segment0.ts', sha256: 'not-hashed-in-fixture', bytes: 1 }
    }
  };
  return deepMerge(base, overrides || {});
}

function deepMerge(base, override) {
  if (Array.isArray(override) || typeof override !== 'object' || override === null) return override;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const [k, v] of Object.entries(override)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]))
      ? deepMerge(out[k], v)
      : v;
  }
  return out;
}

/** Recibo honesto canonico: fuente 1080p SDR 8 bits -> 4K declarado como upscale, 25 fps,
 *  audio 5.1 preservado, encoder completo con huella correcta, motor pineado, NOT_DEPLOYED.
 *  Es la base del fixture positivo Y del test de campos load-bearing. */
function honestReceipt() {
  return baseReceipt({
    requested: { source: { width: 1920, height: 1080, fps: 25, transfer: 'bt709', pix_fmt: 'yuv420p', video_codec: 'hevc', bitrate_bps: 9000000, audio: { codec: 'aac', channels: 6 } } },
    output: { width: 3840, height: 2160, fps: 25, sar: '1:1', declared: 'UPSCALE_FROM_SOURCE', audio: { codec: 'aac', channels: 6 }, bitrate_bps: 25000000, pix_fmt: 'yuv420p', transfer: 'bt709', level: 153 },
    applied: { measured_encode_fps: 25, evidence: { frames: 750, seconds: 30, decode_errors: 0, artifact: evidenceArtifact(750, 30) } }
  });
}

function buildFixtures(contract) {
  const f = [];
  const push = (id, label, receipt, expected, expectedCode) => f.push({ id, label, receipt, expected, expectedCode });

  /* (i) honesto medido: 1080p -> 4K declarado como upscale, 25 fps, audio 5.1 preservado,
         encoder completo con huella correcta, motor pineado, deploy declarado NOT_DEPLOYED. */
  push('honest_applied', 'recibo honesto APPLIED_MEASURED (upscale declarado, motor pineado)', honestReceipt(), 'ACCEPT', 'OK_APPLIED_MEASURED');

  /* (ii) honesto NO aplicado: la cifra real del Canary (0,1828 fps) contra una fuente de 25 fps.
         El gate mide, no alcanza, y el recibo declara NOT_APPLIED + passthrough. */
  push('honest_not_applied_capacity', 'recibo honesto NOT_APPLIED por capacidad (0,1828 fps medidos < 25 fps de fuente)', baseReceipt({
    applied: {
      status: 'NOT_APPLIED',
      route: 'remux_passthrough',
      codec_mode: 'copy',
      filtergraph: '',
      encoder: null,
      parity: { computed: true, derived_from: 'applied.filtergraph', identical: false, missing: [], extra: [] },
      evidence: { frames: 30, seconds: 164.1, decode_errors: 0, artifact: evidenceArtifact(30, 164.1) },
      measured_encode_fps: 0.1828,
      reason: 'CAPACITY_INSUFFICIENT'
    },
    output: { width: 3840, height: 2160, fps: 25, sar: '1:1', pix_fmt: 'yuv420p', transfer: 'bt709', video_codec: 'hevc', level: 153, filters_applied: 0, declared: 'NATIVE', bitrate_bps: 18000000, audio: { codec: 'aac', channels: 6 } }
  }), 'ACCEPT', 'OK_NOT_APPLIED');

  /* (iii) applied sin evidencia de fotograma */
  push('applied_without_frame_evidence', 'APPLIED_MEASURED con 0 fotogramas', baseReceipt({
    applied: { evidence: { frames: 0, seconds: 30, decode_errors: 0, artifact: evidenceArtifact(750, 30) } }
  }), 'REJECT', 'E_APPLIED_WITHOUT_PROOF');

  /* (iv) fuente PQ mapeada a cadena SDR de 8 bits */
  push('pq_to_sdr', 'fuente smpte2084 (PQ) mapeada a cadena SDR', baseReceipt({
    requested: { source: { transfer: 'smpte2084', pix_fmt: 'yuv420p10le' } },
    output: { transfer: 'bt709', pix_fmt: 'yuv420p' }
  }), 'REJECT', 'E_HDR_SOURCE_TO_SDR_CHAIN');

  /* (v) fuente HLG: mismo codigo, distinto transfer (demuestra que no esta cableado a PQ) */
  push('hlg_to_sdr', 'fuente arib-std-b67 (HLG) mapeada a cadena SDR', baseReceipt({
    requested: { source: { transfer: 'arib-std-b67', pix_fmt: 'yuv420p10le' } },
    output: { transfer: 'bt709', pix_fmt: 'yuv420p' }
  }), 'REJECT', 'E_HDR_SOURCE_TO_SDR_CHAIN');

  /* (vi) Dolby Vision sin RPU probado */
  push('dv_without_rpu', 'fuente Dolby Vision sin prueba de RPU', baseReceipt({
    requested: { source: { transfer: 'dovi', pix_fmt: 'yuv420p10le' } },
    applied: {
      filtergraph: 'deblock,smartblur=lr=1.5:ls=-0.5,format=yuv444p10le,scale=3840:2160:flags=lanczos,noise=alls=8:allf=t,unsharp=5:5:0.8:3:3:0.4,eq=contrast=1.05:brightness=0.02:saturation=1.05,format=yuv420p10le',
      parity: { computed: true, derived_from: 'applied.filtergraph', identical: false }
    },
    output: { transfer: 'dovi', pix_fmt: 'yuv420p10le', dv_rpu_preserved: false }
  }), 'REJECT', 'E_DV_RPU_UNPROVEN');

  /* (vii) cadencia distinta de la fuente */
  push('fps_mismatch', 'salida a 30 fps desde fuente de 25 fps', baseReceipt({
    requested: { source: { width: 1920, height: 1080, fps: 25, transfer: 'bt709', pix_fmt: 'yuv420p', video_codec: 'hevc', bitrate_bps: 9000000, audio: { codec: 'aac', channels: 6 } } },
    output: { width: 3840, height: 2160, fps: 30, sar: '1:1', declared: 'UPSCALE_FROM_SOURCE', level: 153 },
    applied: { measured_encode_fps: 30, evidence: { frames: 900, seconds: 30, decode_errors: 0, artifact: evidenceArtifact(900, 30) } }
  }), 'REJECT', 'E_FPS_CADENCE_CHANGED');

  /* (viii) -c:v copy con filtros declarados */
  push('copy_with_filters', '-c:v copy con cadena de filtros declarada', baseReceipt({
    applied: { codec_mode: 'copy' }
  }), 'REJECT', 'E_COPY_WITH_FILTERS');

  /* (ix) degradacion sin los cinco campos */
  push('degradation_unauthorized', 'degradacion 4K->FHD + 5.1->estereo sin autorizacion completa', baseReceipt({
    requested: { source: { width: 3840, height: 2160, fps: 25, transfer: 'bt709', pix_fmt: 'yuv420p', video_codec: 'hevc', bitrate_bps: 18000000, audio: { codec: 'aac', channels: 6 } } },
    output: { width: 1920, height: 1080, fps: 25, sar: '1:1', pix_fmt: 'yuv420p', transfer: 'bt709', video_codec: 'hevc', level: 153, bitrate_bps: 18000000, audio: { codec: 'aac', channels: 2 }, declared: 'NATIVE' },
    degradation_authorization: { channel_id: 'ch-1', device_id: 'dev-1', degradation: '4K->FHD + 5.1->2.0' }
  }), 'REJECT', 'E_DEGRADATION_UNAUTHORIZED');

  /* (x) L153 sobre 8K@120 */
  push('level_8k120_L153', 'hvc1.2.4.L153.B0 declarado sobre 8K@120', baseReceipt({
    requested: { source: { width: 7680, height: 4320, fps: 120, transfer: 'bt709', pix_fmt: 'yuv420p', video_codec: 'hevc', bitrate_bps: 40000000, audio: { codec: 'aac', channels: 6 } } },
    applied: { measured_encode_fps: 120, evidence: { frames: 360, seconds: 3, decode_errors: 0, artifact: evidenceArtifact(360, 3) } },
    output: { width: 7680, height: 4320, fps: 120, sar: '1:1', pix_fmt: 'yuv420p', transfer: 'bt709', video_codec: 'hevc', level: 153, declared: 'NATIVE', bitrate_bps: 40000000 }
  }), 'REJECT', 'E_LEVEL_RESOLUTION_IMPOSSIBLE');

  /* (xi) audio eliminado declarado como paridad */
  push('audio_dropped_as_parity', 'audio 5.1 -> 0 canales y se declara paridad', baseReceipt({
    output: { audio: { codec: 'none', channels: 0 } }
  }), 'REJECT', 'E_AUDIO_LOST_AS_PARITY');

  /* (xii) encoder incompleto: sin rate control ni GOP */
  push('encoder_incomplete', 'encoder sin rate control ni GOP', baseReceipt({
    applied: {
      encoder: {
        video_codec: 'libx265',
        preset: 'ultrafast',
        tune: 'zerolatency',
        x265_params: ['pools=1', 'frame-threads=1'],
        rate_control: null,
        gop: null
      }
    }
  }), 'REJECT', 'E_ENCODER_BLOCK_INCOMPLETE');

  /* (xiii) ruta chain_4k_test: solo -vf, no acredita encoder */
  push('vf_only_chain4k_test', 'recibo de chain_4k_test que pretende acreditar encoder', baseReceipt({
    applied: { route: 'chain_4k_test', filtergraph: 'scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2' }
  }), 'REJECT', 'E_RECEIPT_INSUFFICIENT_FOR_ENCODER');

  /* (xiv) artefacto sin fila en el manifest declarado como desplegado */
  push('not_in_manifest_deployed', 'artefacto sin fila en manifest.tsv declarado desplegado', baseReceipt({
    deployability: {
      state: 'DEPLOYED',
      artifact: 'vps/bin/ape-visual-emulate.sh',
      sha256: 'f1d2ecff6e6468eb58e04658703a34df8b0e2df1c7d61540abbb84ebf768fec1',
      manifest_file: '_vps_stage/deploy/manifest.tsv',
      jit_loop: true
    }
  }), 'REJECT', 'E_NOT_DEPLOYED');

  /* (xv) motor sin sha */
  push('engine_sha_missing', 'recibo sin engine_sha256', baseReceipt({
    engine_sha256: undefined,
    applied: { engine_sha256: undefined }
  }), 'REJECT', 'E_ENGINE_SHA_UNVERIFIED');

  /* (xvi) motor con sha que no es el desplegable (artefacto B) */
  push('engine_sha_not_deployable', 'recibo medido sobre el motor B, que no despliega', baseReceipt({
    engine_sha256: '8405f78412dc2a984f690b7270e891d050740d88358f10ca5818f905151fbae0',
    applied: { engine_sha256: '8405f78412dc2a984f690b7270e891d050740d88358f10ca5818f905151fbae0' }
  }), 'REJECT', 'E_ENGINE_SHA_UNVERIFIED');

  /* (xvii) colapso de estado: se prueba en state_collapsed_missing_requested
         y state_collapsed_flat_keys (t8/F5), un caso por rama de la guarda. */

  /* (xviii) AR deformado: 1920x800 con scale=3840:2160 y SAR 27:20 */
  push('aspect_ratio_deformed', 'fuente 1920x800 deformada por scale=3840:2160 (SAR 27:20)', baseReceipt({
    requested: { source: { width: 1920, height: 800, fps: 25, transfer: 'bt709', pix_fmt: 'yuv420p', video_codec: 'hevc', bitrate_bps: 9000000, audio: { codec: 'aac', channels: 6 } } },
    output: { width: 3840, height: 2160, fps: 25, sar: '27:20', declared: 'UPSCALE_FROM_SOURCE', level: 153 }
  }), 'REJECT', 'E_ASPECT_RATIO_DEFORMED');

  /* (xix) etiqueta de paridad sin computar (el literal de canary_quality.js:45) */
  push('fidelity_label_literal', 'paridad declarada como etiqueta literal, sin computar', baseReceipt({
    applied: { parity: { label: 'FILTERGRAPH_IDENTICAL', computed: null, derived_from: null } }
  }), 'REJECT', 'E_FIDELITY_LABEL_NOT_MEASURED');

  /* (xx) cadena divergente con firma de paridad (hqdn3d del JIT en lugar de noise) */
  push('filtergraph_diverged', 'cadena con hqdn3d (denoise) declarada identica a la canonica (grano)', baseReceipt({
    applied: {
      filtergraph: 'deblock,smartblur=lr=1.5:ls=-0.5,format=yuv444p,scale=3840:2160:flags=lanczos,hqdn3d=1.5:1.5:3:3,unsharp=5:5:0.8:3:3:0.4,eq=contrast=1.05:brightness=0.02:saturation=1.05,format=yuv420p10le',
      parity: { computed: true, derived_from: 'applied.filtergraph', identical: true }
    }
  }), 'REJECT', 'E_FILTERGRAPH_DIVERGED');

  /* (xxi) transcode declarado aplicado con la cifra real del Canary (0,1828 fps < 25 fps) */
  push('capacity_insufficient_claimed_applied', 'transcode 4K declarado aplicado a 0,1828 fps medidos contra 25 fps', baseReceipt({
    applied: {
      measured_encode_fps: 0.1828,
      evidence: { frames: 30, seconds: 164.1, decode_errors: 0, artifact: evidenceArtifact(30, 164.1) }
    }
  }), 'REJECT', 'E_CAPACITY_INSUFFICIENT');

  /* (xxii) sin fps de codificacion medido: gate desconocido */
  push('capacity_unknown', 'APPLIED_MEASURED sin fps de codificacion medido', baseReceipt({
    applied: { measured_encode_fps: undefined }
  }), 'REJECT', 'E_CAPACITY_UNKNOWN');

  /* (xxiii) schema de recibo invalido */
  push('receipt_schema_invalid', 'recibo sin schema del contrato', baseReceipt({
    schema: 'ape.canary_jit.receipt.v0'
  }), 'REJECT', 'E_RECEIPT_SCHEMA');

  /* (xxiv) encoder completo pero con otro rate control: huella distinta */
  push('encoder_fingerprint_mismatch', 'encoder completo con maxrate 20M (huella distinta)', baseReceipt({
    applied: {
      encoder: {
        video_codec: 'libx265',
        preset: 'ultrafast',
        tune: 'zerolatency',
        x265_params: ['pools=1', 'frame-threads=1', 'keyint=48', 'min-keyint=48', 'scenecut=0', 'bframes=0', 'rc-lookahead=0'],
        rate_control: { b_v: '25M', maxrate: '20M', bufsize: '64M' },
        gop: { g: 48, keyint_min: 48, sc_threshold: 0 }
      }
    }
  }), 'REJECT', 'E_ENCODER_FINGERPRINT_MISMATCH');

  /* (xxv) 4K falso: declarar NATIVA una salida con mas pixeles que la fuente */
  push('fake_native_claim', 'upscale 1080p->4K declarado NATIVO', baseReceipt({
    requested: { source: { width: 1920, height: 1080, fps: 25, transfer: 'bt709', pix_fmt: 'yuv420p', video_codec: 'hevc', bitrate_bps: 9000000, audio: { codec: 'aac', channels: 6 } } },
    output: { width: 3840, height: 2160, fps: 25, sar: '1:1', declared: 'NATIVE', level: 153, bitrate_bps: 25000000 }
  }), 'REJECT', 'E_FAKE_NATIVE_CLAIM');

  /* ---- t8/F1: pin de politica (ausente, ceros, distinto) + su control positivo.
         Sin este pin, "Canary es la autoridad" es decorativo. ---- */
  const PIN = String(getPath(contract, 'authority_block.policy_sha256') || '');
  push('policy_pin_absent', 'pin de politica ausente', baseReceipt({ requested: { policy_sha256: undefined } }), 'REJECT', 'E_POLICY_PIN_MISMATCH');
  push('policy_pin_zeroed', 'pin de politica todo ceros', baseReceipt({ requested: { policy_sha256: '0'.repeat(64) } }), 'REJECT', 'E_POLICY_PIN_MISMATCH');
  push('policy_pin_mismatch', 'pin de politica de otra revision', baseReceipt({ requested: { policy_sha256: sha256(Buffer.from('otra-politica')) } }), 'REJECT', 'E_POLICY_PIN_MISMATCH');
  push('policy_pin_correct_control', 'control: el mismo recibo con el pin correcto', baseReceipt({ requested: { policy_sha256: PIN } }), 'ACCEPT', 'OK_APPLIED_MEASURED');

  /* ---- t8/F3+F4: deployability obligatorio y un fixture por NIVEL del walker ---- */
  push('deployability_absent', 'recibo sin deployability (nivel required_top_level)', baseReceipt({ deployability: undefined }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('deployability_not_object', 'deployability como string en vez de objeto', baseReceipt({ deployability: 'DEPLOYED' }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('deployability_missing_sha256', 'deployability sin sha256 (nivel deployability)', baseReceipt({ deployability: { sha256: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('section_missing_requested_field', 'falta requested.desired (nivel requested)', baseReceipt({ requested: { desired: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('section_missing_source_field', 'falta requested.source.transfer (nivel source)', baseReceipt({ requested: { source: { transfer: undefined } } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('section_missing_source_audio_field', 'falta requested.source.audio.channels (nivel source.audio)', baseReceipt({ requested: { source: { audio: { channels: undefined } } } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('section_missing_applied_field', 'falta applied.route (nivel applied)', baseReceipt({ applied: { route: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('section_missing_applied_when_measured_field', 'falta applied.codec_mode (nivel applied_when_measured)', baseReceipt({ applied: { codec_mode: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('section_missing_evidence_field', 'falta applied.evidence.decode_errors (nivel evidence)', baseReceipt({ applied: { evidence: { decode_errors: undefined } } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('section_missing_output_field', 'falta output.width (nivel output)', baseReceipt({ output: { width: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');

  /* ---- t8/F2: evasiones por OMISION. Cada una desactivaba una guarda y hoy RECHAZA ---- */
  push('evasion_missing_source_video_codec', 'HEVC->AVC con requested.source.video_codec omitido', baseReceipt({ requested: { source: { video_codec: undefined } }, output: { video_codec: 'h264', level: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('evasion_missing_output_video_codec', 'codec HEVC->AVC con output.video_codec omitido', baseReceipt({ output: { video_codec: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('evasion_missing_source_pix_fmt', '10 bits 4:4:4 -> 8 bits 4:2:0 con requested.source.pix_fmt omitido', baseReceipt({ requested: { source: { pix_fmt: undefined } }, output: { pix_fmt: 'yuv420p' } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('evasion_missing_output_pix_fmt', 'cambio de pix_fmt de salida con output.pix_fmt omitido', baseReceipt({ output: { pix_fmt: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('evasion_missing_output_transfer', 'rango dinamico con output.transfer omitido', baseReceipt({ output: { transfer: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('evasion_missing_output_sar', 'geometria con output.sar omitido', baseReceipt({ output: { sar: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('evasion_missing_output_level', 'nivel declarado omitido', baseReceipt({ output: { level: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('evasion_missing_bitrates', 'bitrate 25M->8M sin bitrate de fuente ni de salida', baseReceipt({ requested: { source: { bitrate_bps: undefined } }, output: { bitrate_bps: undefined } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');
  push('evasion_missing_source_audio', 'audio 5.1->2.0 con requested.source.audio omitido', baseReceipt({ requested: { source: { audio: undefined } }, output: { audio: { codec: 'aac', channels: 2 } } }), 'REJECT', 'E_REQUIRED_FIELD_MISSING');

  /* ---- t8/F5: guardas sin fixture. El control prueba que la decision CAMBIA. ---- */
  push('state_collapsed_missing_requested', 'falta requested (caso 1 de colapso)', (() => { const r = baseReceipt({}); delete r.requested; return r; })(), 'REJECT', 'E_STATE_COLLAPSED');
  push('state_collapsed_flat_keys', 'claves planas en la raiz con el triple intacto (caso 2)', (() => { const r = baseReceipt({}); r.mode = 'CANARY_SPATIAL_4K'; r.applied_processing = 'NOT_EXECUTED'; return r; })(), 'REJECT', 'E_STATE_COLLAPSED');
  push('flat_keys_absent_control', 'control: el mismo recibo SIN las claves planas', baseReceipt({}), 'ACCEPT', 'OK_APPLIED_MEASURED');
  push('engine_sha_applied_mismatch', 'applied.engine_sha256 de otro motor', baseReceipt({ applied: { engine_sha256: String(contract.engine.candidates.find((c) => c.id === 'B').sha256) } }), 'REJECT', 'E_ENGINE_SHA_UNVERIFIED');
  push('applied_engine_sha_match_control', 'control: applied.engine_sha256 igual al motor desplegable', baseReceipt({ applied: { engine_sha256: String(contract.engine.deployable_engine_sha256) } }), 'ACCEPT', 'OK_APPLIED_MEASURED');

  /* ---- criterio duro de t9: el recibo compuesto del review debe RECHAZAR ---- */
  push('review_composed_receipt_blocker', 'review t7: origen/salida borrados + pin en ceros + sin deployability', (() => {
    const r = baseReceipt({ requested: { policy_sha256: '0'.repeat(64) } });
    r.requested.source = {};
    r.output = {};
    delete r.deployability;
    return r;
  })(), 'REJECT', 'E_POLICY_PIN_MISMATCH');
  push('review_composed_with_pin_still_rejected', 'el mismo recibo con pin correcto: la completitud tambien lo rechaza', (() => {
    const r = baseReceipt({ requested: { policy_sha256: PIN } });
    r.requested.source = {};
    r.output = {};
    delete r.deployability;
    return r;
  })(), 'REJECT', 'E_REQUIRED_FIELD_MISSING');

  /* t11/F7: applied.engine_sha256 estaba declarado obligatorio, el walker lo saltaba por
     gate_precedence y el gate dueno solo comparaba SI estaba presente -> ausencia aceptada.
     Se anade al final para no renumerar los fixtures que el documento ya cita. */
  push('applied_engine_sha_absent', 'falta applied.engine_sha256 (gate_precedence debe rechazar la ausencia)', baseReceipt({ applied: { engine_sha256: undefined } }), 'REJECT', 'E_ENGINE_SHA_UNVERIFIED');

  return f;
}

/* ------------------------------------------------------------------ *
 * Fuente unica: los obligatorios y sus comprobaciones no pueden divergir
 * ------------------------------------------------------------------ */
function requiredPaths(contract) {
  const s = (contract && contract.receipt_schema) || {};
  const out = [];
  for (const level of s.required_field_levels || []) {
    const prefix = (s.required_field_level_map || {})[level];
    if (typeof prefix !== 'string') continue;
    for (const field of s[level] || []) out.push(prefix + field);
  }
  return out;
}

function deletePath(obj, dotted) {
  const segs = String(dotted).split('.');
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    if (cur === null || typeof cur !== 'object') return;
    cur = cur[segs[i]];
  }
  if (cur && typeof cur === 'object') delete cur[segs[segs.length - 1]];
}

const REQUIRED_LISTS = ['required_top_level', 'requested', 'source', 'source.audio', 'applied', 'applied_when_measured', 'evidence', 'output', 'deployability'];

/** Direccion 2 (F7 de t9): cada path exento en gate_precedence debe ser RECHAZADO por SU
 *  gate dueno cuando se borra del recibo. Un path que no supera esta prueba es un HUECO,
 *  no una exencion: estaba declarado obligatorio, el walker lo saltaba y el dueno no lo
 *  exigia, asi que su ausencia pasaba. Se comprueba tambien que, si se retira la exencion,
 *  el path sigue rechazando (el walker o la guarda semantica toman el relevo). */
function checkGatePrecedenceLoadBearing(contract) {
  const s = (contract && contract.receipt_schema) || {};
  const ownedBy = s.gate_precedence || {};
  const rows = [];
  const base = honestReceipt();
  for (const path of Object.keys(ownedBy)) {
    const owner = ownedBy[path];
    const probe = JSON.parse(JSON.stringify(base));
    deletePath(probe, path);
    const asIs = validateReceipt(probe, contract);
    const relaxed = JSON.parse(JSON.stringify(contract));
    delete relaxed.receipt_schema.gate_precedence[path];
    const sinExencion = validateReceipt(probe, relaxed);
    let status = 'EXENCION_PROBADA';
    if (asIs.decision !== 'REJECT') status = 'HUECO_AUSENCIA_ACEPTADA';
    else if (asIs.code !== owner) status = 'CODIGO_DISTINTO:' + asIs.code;
    else if (sinExencion.decision !== 'REJECT') status = 'SIN_RESPALDO_EN_LISTA';
    rows.push({
      path,
      owner,
      asIs: asIs.decision + '/' + asIs.code,
      sinExencion: sinExencion.decision + '/' + sinExencion.code,
      status,
      ok: status === 'EXENCION_PROBADA'
    });
  }
  return rows;
}

function checkRequiredFieldSource(contract) {
  const res = [];
  const add = (name, ok, detail) => res.push({ name, ok: !!ok, detail });
  const s = (contract && contract.receipt_schema) || {};
  const levels = s.required_field_levels || [];
  const paths = requiredPaths(contract);
  add('required_field_levels declarado', levels.length > 0, 'niveles=' + levels.length);
  const broken = levels.filter((l) => !Array.isArray(s[l]) || typeof (s.required_field_level_map || {})[l] !== 'string');
  add('cada nivel trae lista y prefijo', broken.length === 0, broken.length ? 'rotos: ' + broken.join(',') : 'niveles mapeados=' + levels.length);
  const dup = paths.filter((p, i) => paths.indexOf(p) !== i);
  add('sin paths obligatorios duplicados', dup.length === 0, dup.length ? 'duplicados: ' + dup.join(',') : 'paths=' + paths.length);
  const owned = Object.keys(s.gate_precedence || {});
  const inertOwned = owned.filter((p) => !paths.includes(p));
  add('gate_precedence apunta a paths obligatorios', inertOwned.length === 0, inertOwned.length ? 'inertes: ' + inertOwned.join(',') : 'owned=' + owned.length);
  const guarded = Object.keys(s.guard_map || {});
  const inertGuarded = guarded.filter((p) => !paths.includes(p));
  add('guard_map apunta a paths obligatorios', inertGuarded.length === 0, inertGuarded.length ? 'inertes: ' + inertGuarded.join(',') : 'guards=' + guarded.length);

  /* AMBAS direcciones (F7 de t9). Direccion 2: ninguna exencion sin prueba de que su gate
     dueno rechaza la ausencia. Direccion 1: ningun path obligatorio sin gate que lo exija. */
  const gp = checkGatePrecedenceLoadBearing(contract);
  const gpBad = gp.filter((r) => !r.ok);
  add('gate_precedence: el gate dueno rechaza la ausencia', gpBad.length === 0,
    gpBad.length ? 'HUECOS: ' + gpBad.map((r) => r.path + '(' + r.status + ')').join(' ; ') : 'exenciones probadas=' + gp.length);
  const uncovered = owned.filter((p) => { const row = gp.find((r) => r.path === p); return !row || !row.ok; });
  add('ningun path obligatorio sin gate que lo exija', uncovered.length === 0,
    'walker=' + (paths.length - owned.length) + ' + exenciones probadas=' + (owned.length - uncovered.length) + ' = ' + paths.length
    + (uncovered.length ? ' ; sin cobertura: ' + uncovered.join(',') : ''));

  const lists = REQUIRED_LISTS.filter((k) => Array.isArray(s[k]));
  const orphan = lists.filter((k) => !levels.includes(k));
  add('ninguna lista obligatoria huerfana', orphan.length === 0, orphan.length ? 'sin nivel: ' + orphan.join(',') : 'listas=' + lists.length);
  return res;
}

/** Borra cada campo del guard_map del recibo Y del contrato: si el gate sigue
 *  rechazando por otro codigo, el campo es redundante (y se dice), no load-bearing. */
function requiredFieldLoadBearing(contract) {
  const s = (contract && contract.receipt_schema) || {};
  const rows = [];
  for (const path of Object.keys(s.guard_map || {})) {
    const receipt = JSON.parse(JSON.stringify(honestReceipt()));
    deletePath(receipt, path);
    const withGuard = validateReceipt(receipt, contract);
    const relaxed = JSON.parse(JSON.stringify(contract));
    const rs = relaxed.receipt_schema;
    for (const level of [...(rs.required_field_levels || [])]) {
      const prefix = rs.required_field_level_map[level];
      if (typeof prefix !== 'string') continue;
      if (prefix !== '' && (path + '.').startsWith(prefix) && prefix.length > 0) {
        const field = path.slice(prefix.length);
        if (Array.isArray(rs[level]) && field.indexOf('.') === -1) rs[level] = rs[level].filter((x) => x !== field);
      }
      if (prefix !== '' && prefix.startsWith(path + '.')) {
        rs.required_field_levels = rs.required_field_levels.filter((x) => x !== level);
      }
    }
    delete rs.gate_precedence[path];
    const withoutGuard = validateReceipt(receipt, relaxed);
    const coveredBy = withoutGuard.decision === 'REJECT' && withoutGuard.code !== 'E_REQUIRED_FIELD_MISSING' ? withoutGuard.code : null;
    rows.push({
      path,
      guard: s.guard_map[path],
      withGuard: withGuard.decision + '/' + withGuard.code,
      withoutGuard: withoutGuard.decision + '/' + withoutGuard.code,
      status: coveredBy ? 'REDUNDANTE_COVERED_BY:' + coveredBy : (withoutGuard.decision === 'ACCEPT' ? 'LOAD_BEARING' : 'ROTO'),
      ok: withGuard.decision === 'REJECT' && withGuard.code === 'E_REQUIRED_FIELD_MISSING' && (withoutGuard.decision === 'ACCEPT' || coveredBy !== null)
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Comprobaciones del propio contrato
 * ------------------------------------------------------------------ */
function checkContract(contract) {
  const results = [];
  const add = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
  add('schema', contract.schema === 'ape.canary_jit.contract.v1', 'schema=' + contract.schema);
  add('authority', contract.authority === 'canary', 'authority=' + contract.authority);
  add('revision', Number.isInteger(contract.revision) && contract.revision > 0, 'revision=' + contract.revision);
  add('policy_sha256 formato', HEX64.test(String(contract.authority_block && contract.authority_block.policy_sha256 || '')), 'policy_sha256=' + (contract.authority_block || {}).policy_sha256);
  const ts = contract.triple_state || {};
  add('triple estado completo', !!(ts.requested && ts.applied && ts.output), 'requested/applied/output presentes');

  const stages = (contract.chain && contract.chain.stages) || [];
  const joined = stages.map((s) => s.filter).join(',');
  add('cadena canonica == etapas', joined === contract.chain.canonical_filtergraph, 'etapas=' + stages.length + ' chars=' + joined.length);
  add('cadena canonica sha256', sha256(Buffer.from(joined, 'utf8')) === contract.chain.canonical_filtergraph_sha256, 'sha16=' + sha256(Buffer.from(joined, 'utf8')).slice(0, 16));
  add('cadena canonica chars', joined.length === contract.chain.canonical_filtergraph_chars, 'chars=' + joined.length);

  const fpOwn = encoderFingerprint(contract.encoder);
  add('huella encoder auto-consistente', !!fpOwn && fpOwn.sha256 === contract.encoder.fingerprint.sha256, 'sha16=' + (fpOwn ? fpOwn.sha256.slice(0, 16) : 'null') + ' canónico=' + (fpOwn ? fpOwn.canonical : 'null'));

  const manifestFile = String((contract.deployability || {}).manifest_file || '');
  add('manifest SINGULAR', path.basename(manifestFile) === 'manifest.tsv', 'manifest_file=' + manifestFile);
  add('manifest existe en disco', !!artifactBytes(manifestFile), 'bytes=' + ((artifactBytes(manifestFile) || {}).bytes) + ' sha16=' + String((artifactBytes(manifestFile) || {}).sha256 || '').slice(0, 16));
  add('manifest sha256 pineado', (artifactBytes(manifestFile) || {}).sha256 === contract.deployability.manifest_sha256, 'pin=' + String(contract.deployability.manifest_sha256).slice(0, 16));
  add('artefacto del bucle NOT_DEPLOYED', contract.deployability.loop_artifact.state === 'NOT_DEPLOYED' && contract.deployability.loop_artifact.manifest_rows === 0, 'jit_hits=' + contract.deployability.loop_artifact.jit_hits + ' rows=' + contract.deployability.loop_artifact.manifest_rows);
  add('artefacto mapeado DEPLOYED', contract.deployability.mapped_artifact.state === 'DEPLOYED' && contract.deployability.mapped_artifact.manifest_rows === 1, 'line=' + contract.deployability.mapped_artifact.manifest_line);

  const engineFile = String(contract.engine.deployable_engine_path || '');
  const engineOnDisk = artifactBytes(engineFile);
  add('motor desplegable existe', !!engineOnDisk, 'path=' + engineFile + ' bytes=' + ((engineOnDisk || {}).bytes));
  add('motor desplegable sha256', !!engineOnDisk && engineOnDisk.sha256 === contract.engine.deployable_engine_sha256, 'pin=' + String(contract.engine.deployable_engine_sha256).slice(0, 16) + ' real=' + String((engineOnDisk || {}).sha256 || '').slice(0, 16));

  const codes = new Set((contract.rejections || []).map((r) => r.code));
  const notComputed = (contract.not_computed || []).length;
  add('rechazos declarados', codes.size >= 20, 'codes=' + codes.size + ' not_computed=' + notComputed);

  return results;
}

function checkPolicyPin(contract) {
  const declared = String((contract.authority_block || {}).policy_sha256 || '');
  const rel = String((contract.authority_block || {}).policy_path || '');
  const abs = path.isAbsolute(rel) ? rel : path.resolve(ROOT, rel);
  let bytes = null;
  try { bytes = fs.readFileSync(abs); } catch (e) { bytes = null; }
  if (!bytes) {
    return {
      status: 'NO_COMPUTADO',
      ok: !REQUIRE_POLICY,
      detail: 'la politica canonica no esta disponible (' + rel + '): scratch/ esta en .gitignore, el pin no se puede recomputar en un clon limpio. NO_COMPUTADO, nunca PASS.'
    };
  }
  const real = sha256(bytes);
  return {
    status: real === declared ? 'PASS' : 'FAIL',
    ok: real === declared,
    detail: real === declared
      ? declared.slice(0, 16) + '… (' + bytes.length + ' B)'
      : 'pin=' + declared.slice(0, 16) + '… real=' + real.slice(0, 16) + '… (' + bytes.length + ' B)'
  };
}

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */
function main() {
  let contract;
  try {
    contract = readJson(CONTRACT_PATH);
  } catch (e) {
    console.error('FATAL: no se puede leer el contrato ' + CONTRACT_PATH + ': ' + e.message);
    process.exit(2);
  }

  console.log('== CONTRATO CANARY -> JIT (ape.canary_jit.contract.v1) ==');
  console.log('contrato: ' + path.relative(ROOT, CONTRACT_PATH).replace(/\\/g, '/') + ' sha256=' + sha256(fs.readFileSync(CONTRACT_PATH)).slice(0, 16) + '…');
  console.log('authority=' + contract.authority + ' revision=' + contract.revision + ' estado=' + contract.status);
  console.log('');

  let cohFail = 0;
  let cohTotal = 0;

  console.log('-- coherencia del contrato --');
  const contractChecks = checkContract(contract).concat(checkRequiredFieldSource(contract));
  for (const r of contractChecks) {
    cohTotal++;
    console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + '  [' + r.detail + ']');
    if (!r.ok) cohFail++;
  }

  const pin = checkPolicyPin(contract);
  cohTotal++;
  console.log((pin.ok ? '  ' + pin.status.padEnd(4) : '  FAIL') + '  pin de la politica canonica  [' + pin.detail + ']');
  if (!pin.ok) cohFail++;
  console.log('');

  console.log('-- fixtures del validador --');
  const fixtures = buildFixtures(contract);
  let pass = 0;
  let fail = 0;
  for (let i = 0; i < fixtures.length; i++) {
    const fx = fixtures[i];
    const r = validateReceipt(fx.receipt, contract);
    const ok = r.decision === fx.expected && r.code === fx.expectedCode;
    if (ok) pass++; else fail++;
    const tag = String(i + 1).padStart(2, '0');
    console.log((ok ? '  PASS  ' : '  FAIL  ') + '[' + tag + '] ' + fx.label + '  -> ' + r.decision + '/' + r.code);
    if (!ok) {
      console.log('          esperado: ' + fx.expected + '/' + fx.expectedCode + '   obtenido: ' + r.decision + '/' + r.code);
      console.log('          motivo:   ' + r.reasons.join(' | '));
    }
  }

  /* Cobertura 1:1 entre codigos declarados y codigos ejercitados por los fixtures. */
  const contractCodes = new Set((contract.rejections || []).map((r) => r.code));
  const declaredCodeSet = new Set();
  for (const fx of fixtures) if (fx.expected === 'REJECT') declaredCodeSet.add(fx.expectedCode);
  const unexercised = [...contractCodes].filter((c) => !declaredCodeSet.has(c));
  const undeclared = [...declaredCodeSet].filter((c) => !contractCodes.has(c));
  const coverageOk = unexercised.length === 0 && undeclared.length === 0;
  cohTotal++;
  if (!coverageOk) cohFail++;
  console.log('');
  console.log('-- cobertura de codigos de rechazo --');
  console.log('  ' + (coverageOk ? 'PASS' : 'FAIL') + '  declarados=' + contractCodes.size + ' ejercitados=' + declaredCodeSet.size
    + (unexercised.length ? '  declarados y no ejercitados: ' + unexercised.join(',') : '')
    + (undeclared.length ? '  ejercitados y no declarados: ' + undeclared.join(',') : ''));

  /* Control negativo de la CLASE: se borra cada campo obligatorio del recibo Y del
     contrato; si sigue rechazando por otro codigo, se declara REDUNDANTE, no se finge. */
  const lb = requiredFieldLoadBearing(contract);
  let lbFail = 0;
  const lbRedundant = lb.filter((r) => r.status !== 'LOAD_BEARING');
  console.log('');
  console.log('-- campos obligatorios load-bearing (se borran del recibo y del contrato) --');
  for (const r of lb) {
    if (!r.ok) lbFail++;
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + String(r.path).padEnd(32) + ' ' + r.status + '  [con guarda: ' + r.withGuard + ' | sin guarda: ' + r.withoutGuard + ']');
  }

  const fxTotal = fixtures.length;
  const cohOk = cohTotal - cohFail;
  const lbOk = lb.length - lbFail;
  const totalChecks = fxTotal + cohTotal + lb.length;
  const totalFails = fail + cohFail + lbFail;
  console.log('');
  console.log('-- resumen --');
  console.log('  fixtures: ' + pass + '/' + fxTotal + ' PASS  (FAIL ' + fail + ')');
  console.log('  coherencia del contrato: ' + (cohFail === 0 ? 'PASS' : 'FAIL') + '  (' + cohOk + '/' + cohTotal + ' checks)');
  console.log('  campos load-bearing: ' + lbOk + '/' + lb.length + ' PASS  (FAIL ' + lbFail + ')'
    + (lbRedundant.length ? '  redundantes declarados: ' + lbRedundant.map((r) => r.path + '=' + r.status).join(',') : ''));
  console.log('  aceptados: ' + fixtures.filter((f) => f.expected === 'ACCEPT').length
    + ' | envenenados rechazados: ' + fixtures.filter((f) => f.expected === 'REJECT').length);
  console.log('  total: ' + (totalChecks - totalFails) + '/' + totalChecks + ' comprobaciones | fallos: ' + totalFails);
  console.log('  RESULT=' + (totalFails === 0 ? 'PASS' : 'FAIL'));
  process.exit(totalFails === 0 ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } finally {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* tmpdir best effort */ }
  }
}

module.exports = {
  validateReceipt,
  computeParity,
  splitFiltergraph,
  encoderFingerprint,
  parseHevcLevel,
  levelLoads,
  checkContract,
  checkRequiredFieldSource,
  requiredFieldLoadBearing,
  walkRequiredFields,
  checkReceiptPolicyPin,
  requiredPaths,
  getPath,
  honestReceipt,
  CONTRACT_PATH
};
