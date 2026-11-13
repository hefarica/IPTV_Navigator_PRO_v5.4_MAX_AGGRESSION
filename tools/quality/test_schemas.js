#!/usr/bin/env node
'use strict';
/*
 * Validador de los DOS esquemas de contracts/ — sin dependencias externas.
 *
 * Implementa a mano un SUBCONJUNTO de JSON Schema 2020-12, suficiente para los
 * dos esquemas que valida y declarado aqui para que nadie crea que valida todo
 * el estandar:
 *   $ref (solo local "#/$defs/..."), type (string o array de tipos), const, enum,
 *   required, properties, additionalProperties (false | esquema), items,
 *   prefixItems, minItems, maxItems, uniqueItems, pattern, minLength, maxLength,
 *   minimum, maximum, exclusiveMinimum, allOf, anyOf, oneOf, not, if/then/else.
 *
 * NO implementa: format, unevaluatedProperties/Items, dependentRequired,
 * patternProperties, contains, $dynamicRef, referencias externas.
 *
 * Los dos esquemas de contracts/ usan SOLO el subconjunto implementado; si
 * alguien mete una palabra clave fuera de el, este validador NO la aplica en
 * silencio: la lista siguiente existe para poder auditar esa afirmacion.
 *
 * No escribe nada. Lee el quality-policy.json entregado y comprueba al final
 * que su sha256 no ha cambiado (prueba de que este test no lo modifica).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const POLICY_PATH = path.join(ROOT, 'scratch', 'canary_jit_20261111', 'unzipped', 'APE_CANARY_JIT_INTEGRACION_20261111', 'canary', 'quality-policy.json');
const POLICY_REL = 'scratch/canary_jit_20261111/unzipped/APE_CANARY_JIT_INTEGRACION_20261111/canary/quality-policy.json';
// Mismo patron que el hermano test_canary_jit_contract.js:43. Con scratch/ en .gitignore, un clon
// limpio o CI no tiene la politica. Por defecto eso es NO_COMPUTADO, no rojo; --require-policy
// convierte la ausencia en fallo para quien SI exige el fixture.
const ARGS = process.argv.slice(2);
const REQUIRE_POLICY = ARGS.includes('--require-policy');

// Los 8 casos que dependen del fixture. Se listan aqui para que, cuando el fichero falte,
// el runner los CUENTE como NO_COMPUTADO en vez de que simplemente no existan.
const POLICY_CASE_IDS = [
  'P1 policy_real_del_entregable',
  'P2 policy_chain_orden_alterado',
  'P3 policy_encoder_incompleto',
  'P4 policy_auto_enable_true',
  'P5 policy_authority_no_canary',
  'P6 policy_chain_siete_etapas',
  'P7 policy_sin_compatibility',
  'P8 policy_encoder_emitido_opcional'
];
const POLICY_SHA256_EXPECTED = '9845aa5da438213d86b1e58fdb8c5e7c081395e0de9798d23689a2dd8b86fc65';
const POLICY_SCHEMA_PATH = path.join(ROOT, 'contracts', 'canary_policy_schema.json');
const DEVICE_SCHEMA_PATH = path.join(ROOT, 'contracts', 'device_capability_schema.json');

const SUPPORTED_KEYWORDS = ['$ref', 'type', 'const', 'enum', 'required', 'properties', 'additionalProperties',
  'items', 'prefixItems', 'minItems', 'maxItems', 'uniqueItems', 'pattern', 'minLength', 'maxLength',
  'minimum', 'maximum', 'exclusiveMinimum', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else'];
const ANNOTATION_KEYWORDS = ['$schema', '$id', '$comment', 'title', 'description', '$defs',
  // palabras clave de EXTENSION declaradas por este repo. Se listan a proposito: la auditoria de
  // abajo debe fallar ante cualquier OTRA keyword no soportada, y estas dos las CONSUME el test
  // (provenance_alias_map alimenta el normalizador; provenance_canonical se compara con el enum).
  'provenance_alias_map', 'provenance_canonical'];

/* ------------------------------------------------------------------ *
 * utilidades
 * ------------------------------------------------------------------ */
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  const aa = Array.isArray(a), bb = Array.isArray(b);
  if (aa !== bb) return false;
  if (aa) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) { if (!(k in b)) return false; if (!deepEqual(a[k], b[k])) return false; }
  return true;
}

function resolvePointer(rootSchema, ref) {
  if (typeof ref !== 'string' || ref.charAt(0) !== '#') throw new Error('REF_EXTERNA_NO_SOPORTADA:' + ref);
  const parts = ref.slice(1).split('/').filter(Boolean)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = rootSchema;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object' || !(p in cur)) throw new Error('REF_ROTA:' + ref);
    cur = cur[p];
  }
  return cur;
}

function typeName(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function typeOk(v, t) {
  const list = Array.isArray(t) ? t : [t];
  for (const one of list) {
    if (one === 'null' && v === null) return true;
    if (one === 'string' && typeof v === 'string') return true;
    if (one === 'boolean' && typeof v === 'boolean') return true;
    if (one === 'number' && typeof v === 'number' && isFinite(v)) return true;
    if (one === 'integer' && typeof v === 'number' && isFinite(v) && Math.floor(v) === v) return true;
    if (one === 'array' && Array.isArray(v)) return true;
    if (one === 'object' && v !== null && typeof v === 'object' && !Array.isArray(v)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * validador
 * ------------------------------------------------------------------ */
function validate(data, schema, rootSchema, at, errs) {
  if (schema === true) return;
  if (schema === false) { errs.push(at + ': esquema false (nada valida)'); return; }
  if (schema === null || typeof schema !== 'object') { errs.push(at + ': esquema mal formado'); return; }

  if (schema.$ref) { validate(data, resolvePointer(rootSchema, schema.$ref), rootSchema, at, errs); return; }

  if ('const' in schema && !deepEqual(data, schema.const)) {
    errs.push(at + ': const esperado ' + JSON.stringify(schema.const) + ' y llego ' + JSON.stringify(data));
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => deepEqual(data, e))) {
    errs.push(at + ': valor ' + JSON.stringify(data) + ' fuera del enum ' + JSON.stringify(schema.enum));
    return;
  }
  if ('type' in schema && !typeOk(data, schema.type)) {
    errs.push(at + ': tipo ' + typeName(data) + ' no admitido por ' + JSON.stringify(schema.type));
    return;
  }

  if (typeof data === 'number') {
    if ('minimum' in schema && data < schema.minimum) errs.push(at + ': ' + data + ' < minimum ' + schema.minimum);
    if ('maximum' in schema && data > schema.maximum) errs.push(at + ': ' + data + ' > maximum ' + schema.maximum);
    if ('exclusiveMinimum' in schema && !(data > schema.exclusiveMinimum)) errs.push(at + ': ' + data + ' <= exclusiveMinimum ' + schema.exclusiveMinimum);
  }

  if (typeof data === 'string') {
    if ('minLength' in schema && data.length < schema.minLength) errs.push(at + ': longitud ' + data.length + ' < ' + schema.minLength);
    if ('maxLength' in schema && data.length > schema.maxLength) errs.push(at + ': longitud ' + data.length + ' > ' + schema.maxLength);
    if (schema.pattern && !(new RegExp(schema.pattern).test(data))) errs.push(at + ': no casa el patron ' + schema.pattern);
  }

  if (Array.isArray(data)) {
    if ('minItems' in schema && data.length < schema.minItems) errs.push(at + ': ' + data.length + ' items < minItems ' + schema.minItems);
    if ('maxItems' in schema && data.length > schema.maxItems) errs.push(at + ': ' + data.length + ' items > maxItems ' + schema.maxItems);
    if (schema.uniqueItems === true) {
      for (let i = 0; i < data.length; i++) for (let j = i + 1; j < data.length; j++) {
        if (deepEqual(data[i], data[j])) errs.push(at + ': items ' + i + ' y ' + j + ' duplicados (uniqueItems)');
      }
    }
    if (Array.isArray(schema.prefixItems)) {
      for (let i = 0; i < data.length && i < schema.prefixItems.length; i++) {
        validate(data[i], schema.prefixItems[i], rootSchema, at + '[' + i + ']', errs);
      }
    }
    if ('items' in schema) {
      const start = Array.isArray(schema.prefixItems) ? schema.prefixItems.length : 0;
      for (let i = start; i < data.length; i++) {
        if (schema.items === false) errs.push(at + '[' + i + ']: items:false prohibe elementos mas alla de prefixItems');
        else validate(data[i], schema.items, rootSchema, at + '[' + i + ']', errs);
      }
    }
  }

  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    if (Array.isArray(schema.required)) {
      for (const k of schema.required) if (!(k in data)) errs.push(at + ': falta el campo obligatorio "' + k + '"');
    }
    if (schema.properties && typeof schema.properties === 'object') {
      for (const k of Object.keys(schema.properties)) {
        if (k in data) validate(data[k], schema.properties[k], rootSchema, at + '.' + k, errs);
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const k of Object.keys(data)) if (!allowed.has(k)) errs.push(at + ': propiedad no declarada "' + k + '"');
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const declared = new Set(Object.keys(schema.properties || {}));
      for (const k of Object.keys(data)) {
        if (!declared.has(k)) validate(data[k], schema.additionalProperties, rootSchema, at + '.' + k, errs);
      }
    }
  }

  if (Array.isArray(schema.allOf)) for (const sub of schema.allOf) validate(data, sub, rootSchema, at, errs);

  if (Array.isArray(schema.anyOf)) {
    let ok = false;
    for (const sub of schema.anyOf) { const e = []; validate(data, sub, rootSchema, at, e); if (e.length === 0) { ok = true; break; } }
    if (!ok) errs.push(at + ': no cumple ninguna rama de anyOf');
  }

  if (Array.isArray(schema.oneOf)) {
    let hits = 0;
    for (const sub of schema.oneOf) { const e = []; validate(data, sub, rootSchema, at, e); if (e.length === 0) hits++; }
    if (hits !== 1) errs.push(at + ': oneOf esperaba exactamente 1 rama y casaron ' + hits);
  }

  if (schema.not && typeof schema.not === 'object') {
    const e = []; validate(data, schema.not, rootSchema, at, e);
    if (e.length === 0) errs.push(at + ': cumple el esquema de "not"');
  }

  if (schema.if && typeof schema.if === 'object') {
    const e = []; validate(data, schema.if, rootSchema, at, e);
    if (e.length === 0) { if (schema.then) validate(data, schema.then, rootSchema, at, errs); }
    else if (schema.else) validate(data, schema.else, rootSchema, at, errs);
  }
}

function check(data, schemaFile) {
  const root = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  const errs = [];
  validate(data, root, root, '$', errs);
  return { valid: errs.length === 0, errors: errs };
}

/* ------------------------------------------------------------------ *
 * NORMALIZACION de provenance: alias de ENTRADA -> canonico
 *
 * El schema tiene 4 valores canonicos y NO acepta 'medido'. La redaccion
 * espanola se admite en la ENTRADA y este normalizador la convierte ANTES
 * de validar. La tabla y la lista canonica se LEEN DEL ESQUEMA
 * (provenance_alias_map / provenance_canonical), no se duplican aqui: si
 * alguien anade un alias al contrato, el test lo usa sin tocar codigo.
 *
 * Decision sobre mayusculas: se normaliza a minusculas (trim + toLowerCase).
 * Razon y coste en docs/audits/SCHEMAS_20261111.md §6.
 * ------------------------------------------------------------------ */
function provenanceRules() {
  const schema = JSON.parse(fs.readFileSync(DEVICE_SCHEMA_PATH, 'utf8'));
  const canonical = schema.provenance_canonical;
  const rawMap = schema.provenance_alias_map || {};
  if (!Array.isArray(canonical) || canonical.length !== 4) {
    throw new Error('PROVENANCE_CANONICAL_INVALIDO: se esperaban 4 valores y hay ' + JSON.stringify(canonical));
  }
  // cualquier clave que empiece por "$" es anotacion, no alias
  const aliasMap = {};
  for (const k of Object.keys(rawMap)) if (k.charAt(0) !== '$') aliasMap[k] = rawMap[k];
  return { canonical: canonical, aliasMap: aliasMap };
}

function normalizeProvenanceToken(token, rules) {
  if (typeof token !== 'string') return token;
  const t = token.trim().toLowerCase();
  if (rules.canonical.indexOf(t) >= 0) return t;
  if (Object.prototype.hasOwnProperty.call(rules.aliasMap, t)) return rules.aliasMap[t];
  return token; // desconocido: se deja tal cual para que el esquema lo rechace con su path
}

function normalizeSnapshot(snapshot, rules) {
  const out = JSON.parse(JSON.stringify(snapshot));
  const changes = [];
  if (out && out.capabilities && typeof out.capabilities === 'object') {
    for (const k of Object.keys(out.capabilities)) {
      const cap = out.capabilities[k];
      if (cap && typeof cap === 'object' && 'provenance' in cap) {
        const before = cap.provenance;
        const after = normalizeProvenanceToken(before, rules);
        if (after !== before) {
          changes.push(k + ': ' + JSON.stringify(before) + ' -> ' + JSON.stringify(after));
          cap.provenance = after;
        }
      }
    }
  }
  return { snapshot: out, changes: changes };
}

/* ------------------------------------------------------------------ *
 * auditoria del propio esquema: palabras clave fuera del subconjunto
 * ------------------------------------------------------------------ */
const DATA_KEYWORDS = ['const', 'enum', 'required', 'default', 'examples'];
const SUBSCHEMA_KEYWORDS = ['items', 'additionalProperties', 'if', 'then', 'else', 'not',
  'prefixItems', 'allOf', 'anyOf', 'oneOf'];

function auditKeywords(schema, at, out) {
  if (schema === null || typeof schema !== 'object') return out;
  if (Array.isArray(schema)) { schema.forEach((s, i) => auditKeywords(s, at + '[' + i + ']', out)); return out; }
  for (const k of Object.keys(schema)) {
    // $defs contiene esquemas: se recorren sus VALORES, no sus nombres
    if (k === '$defs') { for (const dk of Object.keys(schema[k])) auditKeywords(schema[k][dk], at + '.$defs.' + dk, out); continue; }
    if (k.charAt(0) === '$' || ANNOTATION_KEYWORDS.indexOf(k) >= 0) continue;
    if (SUPPORTED_KEYWORDS.indexOf(k) < 0) { out.push(at + '.' + k); continue; }
    if (DATA_KEYWORDS.indexOf(k) >= 0) continue;                 // datos, no esquema
    if (k === 'properties') { for (const pk of Object.keys(schema[k])) auditKeywords(schema[k][pk], at + '.properties.' + pk, out); continue; }
    if (SUBSCHEMA_KEYWORDS.indexOf(k) >= 0 && schema[k] !== null && typeof schema[k] === 'object') { auditKeywords(schema[k], at + '.' + k, out); continue; }
    // pattern / minLength / maximum / type / $ref: valores primitivos, nada que recorrer
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * fixtures
 * ------------------------------------------------------------------ */
const clone = (o) => JSON.parse(JSON.stringify(o));

// 6 capacidades con fuente medible en el repo (ver docs/audits/SCHEMAS_20261111.md)
// y 14 declaradas NO_COMPUTADO con provenance='unavailable' y value=null.
function honestSnapshot() {
  const unavailable = () => ({ value: null, provenance: 'unavailable' });
  const c = {
    api_level: { value: 34, provenance: 'measured', evidence: { artifact: 'docs/audits/CONDICION_4_MEDICION_ONN4K_20261108.md:137', command: 'adb shell getprop ro.build.version.sdk' } },
    soc: { value: 'amlogic s4', provenance: 'measured', evidence: { artifact: 'docs/audits/CONDICION_4_MEDICION_ONN4K_20261108.md:137', command: 'adb shell getprop ro.board.platform' } },
    cpu_arch: unavailable(),
    cpu_cores: unavailable(),
    hw_decoders: { value: ['c2.amlogic.hevc.decoder', 'c2.amlogic.avc.decoder'], provenance: 'measured', evidence: { artifact: 'docs/audits/CONDICION_4_MEDICION_ONN4K_20261108.md:33-34', command: 'sed -n /video\\/hevc/,/<\\/MediaCodec>/p /vendor/etc/media_codecs_amlogic_video.xml' } },
    hw_encoders: { value: [], provenance: 'unavailable' },
    gpu: unavailable(),
    vulkan: unavailable(),
    max_texture_size: unavailable(),
    ram: unavailable(),
    display_resolution: { value: { width: 3840, height: 2160 }, provenance: 'measured', evidence: { artifact: 'docs/audits/CONDICION_4_MEDICION_ONN4K_20261108.md:52', command: 'adb shell wm size' } },
    display_refresh_rate: { value: 60.000004, provenance: 'measured', evidence: { artifact: 'docs/audits/CONDICION_4_MEDICION_ONN4K_20261108.md:157', command: 'adb shell dumpsys display' } },
    hdr: unavailable(),
    codec_profiles: { value: [], provenance: 'unavailable' },
    thermal_state: unavailable(),
    battery: unavailable(),
    decoder_perf: { value: { max_decode_width: 4096, max_decode_height: 4096 }, provenance: 'measured', evidence: { artifact: 'docs/audits/CONDICION_4_MEDICION_ONN4K_20261108.md:34', command: 'grep Limit size /vendor/etc/media_codecs_amlogic_video.xml' } },
    rendered_frames: unavailable(),
    dropped_frames: unavailable(),
    buffering_events: unavailable()
  };
  return {
    schema: 'ape.device.capability.snapshot.v1',
    snapshot_id: 'schema-test-fixture-onn4k-20261111',
    captured_at: '2026-11-11T00:00:00Z',
    device_id: 'adb-GUSA2441015311-RXlL4A._adb-tls-connect._tcp',
    capabilities: c
  };
}

function buildCases(policy) {
  const cases = [];
  const P = POLICY_SCHEMA_PATH;
  const D = DEVICE_SCHEMA_PATH;

  // ---- POLITICA ----
  // Estos 8 casos CLONAN el quality-policy.json: sin el fichero no se pueden construir.
  // Cuando falta, se emiten como PLACEHOLDERS marcados needsPolicy para que el runner los
  // cuente y los reporte NO_COMPUTADO. NO se omiten: un recuento que diga "0 saltados"
  // cuando se saltaron 8 es exactamente la clase de mentira silenciosa que este repo combate.
  if (!policy) {
    for (const id of POLICY_CASE_IDS) {
      cases.push({ id: id, schema: P, data: null, expected: 'NO_COMPUTADO', needsPolicy: true,
        note: 'requiere quality-policy.json (scratch/ ausente)' });
    }
  } else {
  cases.push({ id: 'P1 policy_real_del_entregable', schema: P, data: clone(policy), expected: 'VALID',
    note: 'el quality-policy.json tal cual' });

  const swapped = clone(policy);
  const tmp = swapped.chain[2]; swapped.chain[2] = swapped.chain[3]; swapped.chain[3] = tmp;
  cases.push({ id: 'P2 policy_chain_orden_alterado', schema: P, data: swapped, expected: 'INVALID',
    note: 'chroma y upscale intercambiados' });

  const enc = clone(policy);
  delete enc.reference_encoder.x265_params;
  cases.push({ id: 'P3 policy_encoder_incompleto', schema: P, data: enc, expected: 'INVALID',
    note: 'sin x265_params' });

  const auto = clone(policy);
  auto.safety.production_auto_enable = true;
  cases.push({ id: 'P4 policy_auto_enable_true', schema: P, data: auto, expected: 'INVALID',
    note: 'production_auto_enable=true' });

  const auth = clone(policy);
  auth.authority = 'jit';
  cases.push({ id: 'P5 policy_authority_no_canary', schema: P, data: auth, expected: 'INVALID',
    note: 'authority distinta de canary' });

  const seven = clone(policy);
  seven.chain.pop();
  cases.push({ id: 'P6 policy_chain_siete_etapas', schema: P, data: seven, expected: 'INVALID',
    note: '7 etapas en vez de 8' });

  const noCompat = clone(policy);
  delete noCompat.compatibility;
  cases.push({ id: 'P7 policy_sin_compatibility', schema: P, data: noCompat, expected: 'INVALID',
    note: 'falta el bloque compatibility' });

  const emitted = clone(policy);
  emitted.reference_encoder_emitted = {
    x265_params: 'pools=1:frame-threads=1:keyint=48:min-keyint=48:scenecut=0:bframes=0:rc-lookahead=0',
    rate_control: { b_v: '25M', maxrate: '32M', bufsize: '64M' },
    gop: { g: 48, keyint_min: 48, sc_threshold: 0 }
  };
  cases.push({ id: 'P8 policy_encoder_emitido_opcional', schema: P, data: emitted, expected: 'VALID',
    note: 'el bloque opcional SI puede expresar lo que el script emite' });
  } // fin del bloque que depende de la politica

  // ---- DISPOSITIVO ----
  cases.push({ id: 'D1 snapshot_honesto', schema: D, data: honestSnapshot(), expected: 'VALID',
    note: '6 capacidades medidas con evidencia + 14 unavailable declaradas' });

  const noProv = honestSnapshot();
  delete noProv.capabilities.api_level.provenance;
  cases.push({ id: 'D2 capacidad_sin_provenance', schema: D, data: noProv, expected: 'INVALID',
    note: 'api_level sin provenance' });

  const encClaim = honestSnapshot();
  encClaim.capabilities.hw_encoders = { value: ['c2.amlogic.avc.encoder'], provenance: 'declared' };
  cases.push({ id: 'D3 encoder_afirmado_sin_evidencia', schema: D, data: encClaim, expected: 'INVALID',
    note: 'hw_encoders no vacio con provenance=declared y sin evidence' });

  const badEnum = honestSnapshot();
  badEnum.capabilities.soc = { value: 'amlogic s4', provenance: 'creido' };
  cases.push({ id: 'D4 provenance_fuera_del_enum', schema: D, data: badEnum, expected: 'INVALID',
    note: 'provenance="creido"' });

  const measNoEv = honestSnapshot();
  delete measNoEv.capabilities.soc.evidence;
  cases.push({ id: 'D5 measured_sin_evidence', schema: D, data: measNoEv, expected: 'INVALID',
    note: 'soc measured sin evidence' });

  const missing = honestSnapshot();
  delete missing.capabilities.battery;
  cases.push({ id: 'D6 capacidad_omitida', schema: D, data: missing, expected: 'INVALID',
    note: 'falta battery: se declara unavailable, no se omite' });

  const encMeasNoEv = honestSnapshot();
  encMeasNoEv.capabilities.codec_profiles = { value: ['hvc1.2.4.L153.B0'], provenance: 'measured' };
  cases.push({ id: 'D7 encoder_medido_sin_evidence', schema: D, data: encMeasNoEv, expected: 'INVALID',
    note: 'codec_profiles no vacio y measured, sin evidence' });

  const extra = honestSnapshot();
  extra.capabilities.npu_tops = { value: 6, provenance: 'measured', evidence: { artifact: 'x:1' } };
  cases.push({ id: 'D8 capacidad_no_declarada', schema: D, data: extra, expected: 'INVALID',
    note: 'capacidad fuera de las 20' });

  // ---- PROVENANCE: alias de entrada, canonico y case-sensitivity ----
  // Todos estos casos pasan por el normalizador salvo E6, que prueba justo lo contrario.
  const medido = honestSnapshot();
  medido.capabilities.soc.provenance = 'medido';
  cases.push({ id: 'E1 medido_normaliza_a_measured', schema: D, data: medido, expected: 'VALID',
    note: 'entrada en espanol que el consumidor normaliza al canonico antes de validar' });

  const canon = honestSnapshot();
  canon.capabilities.soc.provenance = 'measured';
  cases.push({ id: 'E2 measured_ya_canonico', schema: D, data: canon, expected: 'VALID',
    note: 'el canonico pasa sin cambios' });

  const upper = honestSnapshot();
  upper.capabilities.soc.provenance = 'MEASURED';
  cases.push({ id: 'E3 MEASURED_mayusculas_normalizado', schema: D, data: upper, expected: 'VALID',
    note: 'DECISION: se normaliza case (trim + toLowerCase); ver informe §6' });

  const typo = honestSnapshot();
  typo.capabilities.soc.provenance = 'medidoo';
  cases.push({ id: 'E4 medidoo_invalido', schema: D, data: typo, expected: 'INVALID',
    note: 'fuera de las dos redacciones: no casa alias ni canonico' });

  const desconocido = honestSnapshot();
  desconocido.capabilities.soc.provenance = 'desconocido';
  cases.push({ id: 'E5 desconocido_invalido', schema: D, data: desconocido, expected: 'INVALID',
    note: 'fuera de las dos redacciones' });

  const sinNorm = honestSnapshot();
  sinNorm.capabilities.soc.provenance = 'medido';
  cases.push({ id: 'E6 medido_sin_normalizar_invalido', schema: D, data: sinNorm, expected: 'INVALID',
    normalize: false,
    note: 'el ENUM del esquema es de 4: sin normalizar, el alias es invalido directamente' });

  return cases;
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */
/* Mismo patron que checkPolicyPin() del hermano (test_canary_jit_contract.js:1149-1161):
 * si el fixture canonico no se puede leer, se reporta NO_COMPUTADO con la razon; NUNCA PASS,
 * y nunca una excepcion que un clon limpio pueda leer como gate rojo. */
const NO_COMPUTADO_REASON = 'la politica canonica no esta disponible (' + POLICY_REL + '): scratch/ esta en .gitignore, el fixture no se puede leer en un clon limpio. NO_COMPUTADO, nunca PASS.';

function readPolicy() {
  let bytes = null;
  try { bytes = fs.readFileSync(POLICY_PATH); } catch (e) { bytes = null; }
  if (!bytes) return { available: false, bytes: null };
  return { available: true, bytes: bytes };
}

function main() {
  const pol = readPolicy();
  const policy = pol.available ? JSON.parse(pol.bytes.toString('utf8')) : null;
  const shaBefore = pol.available ? sha256(pol.bytes) : null;

  console.log('== ESQUEMAS CANARY / DEVICE CAPABILITY ==');
  if (pol.available) {
    console.log('politica:  ' + POLICY_REL + ' sha256=' + shaBefore.slice(0, 16) + '...');
  } else {
    console.log('politica:  NO_COMPUTADO');
    console.log('  NO_COMPUTADO: ' + NO_COMPUTADO_REASON);
  }
  console.log('esquemas:  contracts/canary_policy_schema.json + contracts/device_capability_schema.json');
  console.log('');

  // auditoria previa: los dos esquemas solo usan el subconjunto implementado
  const kw = [];
  auditKeywords(JSON.parse(fs.readFileSync(POLICY_SCHEMA_PATH, 'utf8')), 'canary_policy', kw);
  auditKeywords(JSON.parse(fs.readFileSync(DEVICE_SCHEMA_PATH, 'utf8')), 'device_capability', kw);
  const kwOk = kw.length === 0;
  console.log('-- auditoria de palabras clave fuera del subconjunto --');
  console.log('  ' + (kwOk ? 'PASS' : 'FAIL') + '  keywords soportadas  ' + (kwOk ? '[0 fuera del subconjunto]' : '[FUERA: ' + kw.join(', ') + ']'));
  console.log('');

  const cases = buildCases(policy);
  const results = [];
  let pass = 0, fail = 0, skipped = 0;
  const rules = provenanceRules();

  console.log('-- normalizacion de provenance (alias de entrada -> canonico) --');
  console.log('  canonicos: ' + rules.canonical.join(', '));
  console.log('  alias de entrada: ' + Object.keys(rules.aliasMap).map((k) => k + '->' + rules.aliasMap[k]).join(', '));
  console.log('');

  console.log('-- casos --');
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const tag = String(i + 1).padStart(2, '0');
    // Los casos de POLITICA clonan quality-policy.json: sin el fixture no se ejecutan ni se
    // inventan. Se reportan NO_COMPUTADO con su razon y NO cuentan como PASS ni como FAIL.
    if (c.needsPolicy && !pol.available) {
      skipped++;
      results.push({ id: c.id, expected: c.expected, got: 'NO_COMPUTADO', ok: null, errors: [] });
      console.log('  NO_COMPUTADO  [' + tag + '] ' + c.id);
      console.log('          razon:    ' + NO_COMPUTADO_REASON);
      continue;
    }
    // Todo caso de dispositivo pasa por el normalizador ANTES de validar,
    // salvo los que declaran normalize:false (prueban que el esquema NO acepta el alias directo).
    let data = c.data;
    let changes = [];
    if (c.schema === DEVICE_SCHEMA_PATH && c.normalize !== false) {
      const n = normalizeSnapshot(c.data, rules);
      data = n.snapshot;
      changes = n.changes;
    }
    const r = check(data, c.schema);
    const got = r.valid ? 'VALID' : 'INVALID';
    const ok = got === c.expected;
    if (ok) pass++; else fail++;
    results.push({ id: c.id, expected: c.expected, got: got, ok: ok, errors: r.errors });
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  [' + tag + '] ' + c.id);
    console.log('          esperado: ' + c.expected + '   obtenido: ' + got + '   (' + c.note + ')');
    if (changes.length) console.log('          normalizado: ' + changes.join(' | '));
    if (!ok) console.log('          motivo:   ' + (r.errors.length ? r.errors.slice(0, 3).join(' | ') : 'valido pero se esperaba INVALID'));
    else if (r.errors.length) console.log('          detalle:  ' + r.errors[0]);
  }

  // Prueba explicita de la COMPARACION que el defecto rompia en silencio.
  const raw = JSON.parse(JSON.stringify(cases.filter((c) => c.id === 'E1 medido_normaliza_a_measured')[0].data));
  const normalized = normalizeSnapshot(raw, rules).snapshot;
  const cap = 'soc';
  const rawEq = raw.capabilities[cap].provenance === 'measured';
  const normEq = normalized.capabilities[cap].provenance === 'measured';
  const cmpOk = rawEq === false && normEq === true;
  if (cmpOk) pass++; else fail++;
  console.log('');
  console.log('  ' + (cmpOk ? 'PASS' : 'FAIL') + '  [CMP] igualdad estricta contra el canonico  [sin normalizar: ' + JSON.stringify(raw.capabilities[cap].provenance) + ' === "measured" -> ' + rawEq + ' | normalizado: ' + JSON.stringify(normalized.capabilities[cap].provenance) + ' === "measured" -> ' + normEq + ']');
  console.log('          detalle:  el consumidor que compare sin normalizar obtiene false EN SILENCIO; con el normalizador obtiene true');

  const shaAfter = pol.available ? sha256(fs.readFileSync(POLICY_PATH)) : null;
  const unchanged = pol.available ? (shaBefore === shaAfter && shaBefore === POLICY_SHA256_EXPECTED) : null;

  console.log('');
  console.log('-- resumen --');
  console.log('  casos de esquema construidos: ' + cases.length + '  (+1 comparacion explicita = ' + (cases.length + 1) + ' comprobaciones)');
  console.log('  comprobaciones ejecutadas: ' + (pass + fail) + ' | PASS ' + pass + ' | FAIL ' + fail);
  console.log('  NO_COMPUTADO por fixture ausente: ' + skipped +
    (skipped ? '  <-- estos NO son PASS ni FAIL: la politica no se evaluo' : ''));
  console.log('  validos esperados (ejecutados): ' + cases.filter((c) => c.schema !== POLICY_SCHEMA_PATH || pol.available).filter((c) => c.expected === 'VALID').length +
    ' | invalidos esperados (ejecutados): ' + cases.filter((c) => c.schema !== POLICY_SCHEMA_PATH || pol.available).filter((c) => c.expected === 'INVALID').length);
  console.log('  palabras clave fuera del subconjunto: ' + kw.length);
  if (pol.available) {
    console.log('  quality-policy.json sha256 antes:  ' + shaBefore);
    console.log('  quality-policy.json sha256 despues: ' + shaAfter);
    console.log('  ' + (unchanged ? 'PASS' : 'FAIL') + '  la politica entregada NO se ha modificado  [pin=' + POLICY_SHA256_EXPECTED.slice(0, 16) + '...]');
  } else {
    console.log('  quality-policy.json: NO_COMPUTADO (no se pudo leer el fichero; el pin no se recomputa)');
    if (REQUIRE_POLICY) console.log('  FAIL  --require-policy activo: la ausencia del fixture SI es un fallo en esta invocacion');
    else console.log('  NO_COMPUTADO  pin de la politica  [ausente; pasa --require-policy para exigirlo]');
  }

  // Linea que hace imposible confundir NO_COMPUTADO con PASS. Lleva el veredicto dentro,
  // asi que NO se repite en una linea RESULT= aparte.
  const bad = fail + (kwOk ? 0 : 1)
    + (pol.available ? (unchanged ? 0 : 1) : (REQUIRE_POLICY ? 1 : 0));
  const verdict = bad === 0 ? (pol.available ? 'PASS' : 'PASS-de-esquema (politica NO evaluada)') : 'FAIL';
  console.log('');
  console.log('  politica: ' + (pol.available ? 'EVALUADA' : 'NO_COMPUTADO') +
    ' | casos de esquema: ' + (cases.length + 1) +
    ' | PASS ' + pass + ' | FAIL ' + fail +
    ' | NO_COMPUTADO-skip ' + skipped +
    ' | RESULT=' + verdict);
  process.exit(bad === 0 ? 0 : 1);
}

if (require.main === module) main();
module.exports = { validate, check, deepEqual, honestSnapshot };
