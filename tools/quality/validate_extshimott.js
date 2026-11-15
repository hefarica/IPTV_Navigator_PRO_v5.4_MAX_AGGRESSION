#!/usr/bin/env node
'use strict';
/*
 * Validador del tag #EXTSHIMOTT en listas .m3u8 -- sin dependencias externas.
 *
 * Que hace:
 *   1. Lee contracts/extshimott_contract.json y valida el payload JSON de cada
 *      ocurrencia del tag contra ese schema (motor propio, subconjunto declarado).
 *   2. Verifica las reglas duras que un JSON Schema NO puede expresar:
 *      - el tag aparece EXACTAMENTE 1 vez por canal
 *      - es la ULTIMA linea antes de la URI (0 lineas en blanco por medio)
 *      - tgt sin duplicados y con valores permitidos
 *      - cad.seg es multiplo entero de la duracion de GOP (v.g/v.f)
 *      - vlc.f=1 exige flt; flt sin vlc.f=1 es aviso; OTT ignora flt (nota)
 *      - trampas de cabecera medidas por el repo: %20 en UA, CR/LF, Referer al VPS
 *      - longitud de linea contra x-ape.limits del contrato
 *   3. Opcional --baseline <lista.m3u8>: prueba ADITIVA. Quita todas las lineas
 *      #EXTSHIMOTT de la lista validada y exige igualdad EXACTA (orden y bytes)
 *      con la baseline. Es la evidencia de "nada de lo existente se rompe".
 *
 * Subconjunto de JSON Schema implementado (lo demas es ERROR, no se ignora):
 *   $ref local "#/$defs/...", type, const, enum, required, properties,
 *   additionalProperties (false | schema), items, minProperties, minLength,
 *   maxLength, pattern, minimum, maximum, exclusiveMinimum, exclusiveMaximum,
 *   allOf, anyOf, oneOf, not.
 * Anotaciones (no validan): $schema, $id, $comment, title, description,
 *   examples, default y cualquier clave que empiece por "x-".
 *
 * NO implementa: format, dependentRequired, patternProperties, contains,
 * unevaluatedProperties, $dynamicRef, referencias externas.
 *
 * Solo lee. No escribe ni modifica ningun archivo.
 *
 * Uso:
 *   node tools/quality/validate_extshimott.js <lista.m3u8> [--baseline <base.m3u8>]
 *   node tools/quality/validate_extshimott.js <lista.m3u8> --json
 *   node tools/quality/validate_extshimott.js --contract <schema.json> <lista.m3u8>
 *
 * Exit: 0 = sin ERROR (warnings/notas permitidos) · 1 = hay ERROR · 2 = uso/IO/contrato
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CONTRACT = path.join(ROOT, 'contracts', 'extshimott_contract.json');

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log([
    'uso: node tools/quality/validate_extshimott.js <lista.m3u8> [opciones]',
    '',
    '  --baseline <lista.m3u8>  prueba aditiva: la lista validada debe ser la',
    '                           baseline + lineas #EXTSHIMOTT, sin otro cambio',
    '  --contract <schema.json> contrato alternativo (por defecto contracts/extshimott_contract.json)',
    '  --json                   salida JSON (para CI)',
    '  --help                   esta ayuda',
    '',
    'exit: 0 = sin ERROR · 1 = hay ERROR · 2 = uso/IO/contrato'
  ].join('\n'));
  process.exit(0);
}
const files = [];
let baselinePath = null;
let contractPath = DEFAULT_CONTRACT;
let asJson = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--baseline') { baselinePath = argv[++i]; if (!baselinePath) die2('--baseline exige una ruta'); }
  else if (a === '--contract') { contractPath = argv[++i]; if (!contractPath) die2('--contract exige una ruta'); }
  else if (a === '--json') asJson = true;
  else if (a.startsWith('--')) die2('opcion desconocida: ' + a);
  else files.push(a);
}
if (files.length === 0) die2('falta la lista .m3u8 (ver --help)');
if (baselinePath && files.length !== 1) die2('--baseline solo aplica a UNA lista');

function die2(msg) {
  console.error('[USO] ' + msg);
  process.exit(2);
}
function die2Contract(msg) {
  console.error('[CONTRATO] ' + msg);
  process.exit(2);
}

/* ------------------------------------------------------------------ *
 * contrato + motor de schema
 * ------------------------------------------------------------------ */
const ANNOTATION = new Set(['$schema', '$id', '$comment', 'title', 'description', 'examples', 'default']);
const SUPPORTED = new Set(['$ref', 'type', 'const', 'enum', 'required', 'properties', 'additionalProperties',
  'items', 'minProperties', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'allOf', 'anyOf', 'oneOf', 'not']);

const contractRaw = readFileOrDie(contractPath, '[CONTRATO]');
let CONTRACT;
try { CONTRACT = JSON.parse(contractRaw); } catch (e) { die2Contract('JSON invalido: ' + e.message); }

const XAPE = CONTRACT['x-ape'] || {};
const PREFIX = typeof XAPE.tag_prefix === 'string' ? XAPE.tag_prefix : '#EXTSHIMOTT:';
const TAG = typeof XAPE.tag === 'string' ? XAPE.tag : '#EXTSHIMOTT';
const LIMITS = XAPE.limits || {};
const MAX_LINE_CHARS = Number.isInteger(LIMITS.max_line_chars) ? LIMITS.max_line_chars : 4096;
const WARN_LINE_CHARS = Number.isInteger(LIMITS.warn_line_chars) ? LIMITS.warn_line_chars : 3840;
const GOP_TOL = 1e-3; // segundos

// Auditoria del contrato: si el schema usa una palabra clave fuera del
// subconjunto implementado, NO se ignora en silencio -> exit 2.
(function auditKeywords(node, at) {
  if (Array.isArray(node)) { node.forEach((n, i) => auditKeywords(n, at + '/' + i)); return; }
  if (!node || typeof node !== 'object') return;
  for (const k of Object.keys(node)) {
    if (k.startsWith('x-') || ANNOTATION.has(k)) continue;
    if (!SUPPORTED.has(k)) die2Contract('palabra clave no soportada por este validador: "' + k + '" en ' + at);
    if (k === '$ref' && !String(node[k]).startsWith('#/$defs/')) die2Contract('$ref externo no soportado: ' + node[k] + ' en ' + at);
    if (k === 'properties' || k === 'not' || k === 'additionalProperties' || k === 'items') {
      // propiedades: cada valor es un schema
      if (k === 'properties') { for (const p of Object.keys(node[k])) auditKeywords(node[k][p], at + '/' + k + '/' + p); }
      else if (k === 'additionalProperties') { if (typeof node[k] === 'object') auditKeywords(node[k], at + '/' + k); }
      else auditKeywords(node[k], at + '/' + k);
      continue;
    }
    if (k === 'allOf' || k === 'anyOf' || k === 'oneOf') { node[k].forEach((s, i) => auditKeywords(s, at + '/' + k + '/' + i)); continue; }
  }
})(CONTRACT, '#');

function deref(root, schema) {
  if (schema && typeof schema === 'object' && typeof schema.$ref === 'string') {
    const parts = schema.$ref.slice(1).split('/').filter(Boolean).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let cur = root;
    for (const p of parts) cur = cur && cur[p];
    if (cur === undefined) throw new Error('$ref sin destino: ' + schema.$ref);
    return cur;
  }
  return schema;
}
function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}
function typeMatches(expected, v) {
  const t = typeOf(v);
  if (expected === 'number') return t === 'number' || t === 'integer';
  if (expected === 'integer') return t === 'integer';
  return t === expected;
}

// Devuelve [{code, path, msg}] y NO lanza: acumula todo lo que encuentra.
function validateAgainst(root, schema, value, at, out) {
  schema = deref(root, schema);
  if (!schema || typeof schema !== 'object') return out;

  for (const sub of (schema.allOf || [])) validateAgainst(root, sub, value, at, out);
  if (Array.isArray(schema.anyOf)) {
    const hits = schema.anyOf.filter((s) => validateAgainst(root, s, value, at, []).length === 0);
    if (hits.length === 0) out.push({ code: 'E_SCHEMA_ANYOF', path: at, msg: 'no cumple ninguna rama de anyOf' });
  }
  if (Array.isArray(schema.oneOf)) {
    const hits = schema.oneOf.filter((s) => validateAgainst(root, s, value, at, []).length === 0);
    if (hits.length !== 1) out.push({ code: 'E_SCHEMA_ONEOF', path: at, msg: 'cumple ' + hits.length + ' ramas de oneOf (exige exactamente 1)' });
  }
  if (schema.not && validateAgainst(root, schema.not, value, at, []).length === 0) {
    out.push({ code: 'E_SCHEMA_NOT', path: at, msg: 'cumple el schema prohibido por not' });
  }
  if (schema.const !== undefined && !deepEqual(schema.const, value)) {
    out.push({ code: 'E_SCHEMA_CONST', path: at, msg: 'esperado const ' + JSON.stringify(schema.const) + ', recibido ' + JSON.stringify(value) });
  }
  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((t) => typeMatches(t, value))) {
      out.push({ code: 'E_SCHEMA_TYPE', path: at, msg: 'tipo esperado ' + expected.join('|') + ', recibido ' + typeOf(value) });
      return out; // sin tipo correcto, el resto de keywords no aporta
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => deepEqual(e, value))) {
    out.push({ code: 'E_SCHEMA_ENUM', path: at, msg: 'valor ' + JSON.stringify(value) + ' fuera de enum ' + JSON.stringify(schema.enum) });
  }
  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) out.push({ code: 'E_SCHEMA_LEN', path: at, msg: 'longitud ' + value.length + ' < minLength ' + schema.minLength });
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) out.push({ code: 'E_SCHEMA_LEN', path: at, msg: 'longitud ' + value.length + ' > maxLength ' + schema.maxLength });
    if (typeof schema.pattern === 'string') {
      let re;
      try { re = new RegExp(schema.pattern); } catch (e) { die2Contract('pattern invalido en ' + at + ': ' + schema.pattern); }
      if (!re.test(value)) out.push({ code: 'E_SCHEMA_PATTERN', path: at, msg: 'no casa con ' + schema.pattern });
    }
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) out.push({ code: 'E_SCHEMA_RANGE', path: at, msg: value + ' < minimum ' + schema.minimum });
    if (typeof schema.maximum === 'number' && value > schema.maximum) out.push({ code: 'E_SCHEMA_RANGE', path: at, msg: value + ' > maximum ' + schema.maximum });
    if (typeof schema.exclusiveMinimum === 'number' && !(value > schema.exclusiveMinimum)) out.push({ code: 'E_SCHEMA_RANGE', path: at, msg: value + ' no > exclusiveMinimum ' + schema.exclusiveMinimum });
    if (typeof schema.exclusiveMaximum === 'number' && !(value < schema.exclusiveMaximum)) out.push({ code: 'E_SCHEMA_RANGE', path: at, msg: value + ' no < exclusiveMaximum ' + schema.exclusiveMaximum });
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((it, i) => validateAgainst(root, schema.items, it, at + '[' + i + ']', out));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const props = schema.properties || {};
    for (const req of (schema.required || [])) {
      if (!(req in value)) out.push({ code: 'E_SCHEMA_REQUIRED', path: at + '.' + req, msg: 'campo obligatorio ausente' });
    }
    if (Number.isInteger(schema.minProperties) && Object.keys(value).length < schema.minProperties) {
      out.push({ code: 'E_SCHEMA_MINPROPS', path: at || '(raiz)', msg: 'objeto vacio: minProperties ' + schema.minProperties + ' (si no se conoce nada, se OMITE el objeto)' });
    }
    for (const k of Object.keys(value)) {
      if (Object.prototype.hasOwnProperty.call(props, k)) {
        validateAgainst(root, props[k], value[k], (at ? at + '.' : '') + k, out);
      } else if (schema.additionalProperties === false) {
        out.push({ code: 'E_SCHEMA_ADDITIONAL', path: (at ? at + '.' : '') + k, msg: 'campo NO declarado en el contrato ver:1 (para extender se sube ver)' });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateAgainst(root, schema.additionalProperties, value[k], (at ? at + '.' : '') + k, out);
      }
    }
  }
  return out;
}
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  const aa = Array.isArray(a), bb = Array.isArray(b);
  if (aa !== bb) return false;
  if (aa) return a.length === bb.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
}

/* ------------------------------------------------------------------ *
 * utilidades
 * ------------------------------------------------------------------ */
function readFileOrDie(p, tag) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { console.error((tag || '[IO]') + ' no se puede leer ' + p + ': ' + e.message); process.exit(2); }
}
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
function tvgIdOf(extinf) {
  const m = /\btvg-id="([^"]*)"/.exec(extinf);
  return m ? m[1] : null;
}
function nameOf(extinf) {
  const i = extinf.indexOf(',');
  return i >= 0 ? extinf.slice(i + 1).trim() : '';
}

function splitLines(text) {
  // CRLF y LF producen el mismo array; no se altera el contenido de cada linea.
  const arr = text.split(/\r?\n/);
  if (arr.length && arr[arr.length - 1] === '') arr.pop(); // terminador final
  return arr;
}

/* ------------------------------------------------------------------ *
 * parseo de la lista
 * ------------------------------------------------------------------ */
function parsePlaylist(text) {
  const lines = splitLines(text);
  const channels = [];
  const findings = [];
  let outsideTags = [];          // {idx, line}
  let masterUnsupported = 0;
  let cur = null;
  const isBlank = (l) => l.trim() === '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBlank(line)) continue;

    const trimmedStart = line.replace(/^\s+/, '');
    const looksLikeTag = trimmedStart.toUpperCase().startsWith(TAG.toUpperCase());

    if (looksLikeTag) {
      if (trimmedStart !== line) {
        findings.push({ sev: 'ERROR', code: 'E_TAG_MALFORMED', where: 'linea ' + (i + 1), msg: 'el tag tiene espacios iniciales; debe empezar en la columna 1' });
      } else if (!line.startsWith(PREFIX)) {
        findings.push({ sev: 'ERROR', code: 'E_TAG_MALFORMED', where: 'linea ' + (i + 1), msg: 'forma esperada "' + PREFIX + '{"ver":1,...}" en una sola linea' });
      } else if (line !== line.replace(/\s+$/, '')) {
        findings.push({ sev: 'WARN', code: 'W_TAG_TRAILING_WS', where: 'linea ' + (i + 1), msg: 'espacios al final de la linea' });
      }
      if (!cur) outsideTags.push({ idx: i, line });
      else cur.tags.push({ idx: i, line });
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      if (cur) {
        findings.push({ sev: 'ERROR', code: 'E_EXTINF_WITHOUT_URI', where: 'linea ' + (cur.extinfIdx + 1), msg: 'bloque #EXTINF sin URI antes del siguiente #EXTINF' });
      }
      cur = { extinfIdx: i, extinf: line, tags: [], uri: null, uriIdx: null, name: nameOf(line), tvgId: tvgIdOf(line) };
      continue;
    }
    if (line[0] === '#') {
      if (cur) cur.tags.push({ idx: i, line });
      else if (/^#EXT-X-STREAM-INF/i.test(line)) masterUnsupported++; // variante sin EXTINF: catalogo master puro
      continue;
    }
    // URI
    if (!cur) {
      findings.push({ sev: 'WARN', code: 'W_URI_WITHOUT_EXTINF', where: 'linea ' + (i + 1), msg: 'URI sin #EXTINF que la introduzca' });
      continue;
    }
    cur.uri = line;
    cur.uriIdx = i;
    channels.push(cur);
    cur = null;
  }
  if (cur) findings.push({ sev: 'ERROR', code: 'E_EXTINF_WITHOUT_URI', where: 'linea ' + (cur.extinfIdx + 1), msg: 'bloque #EXTINF al final del archivo sin URI' });
  for (const t of outsideTags) {
    findings.push({ sev: 'ERROR', code: 'E_TAG_OUTSIDE', where: 'linea ' + (t.idx + 1), msg: 'el tag aparece fuera de un bloque de canal (#EXTINF ... URI)' });
  }
  return { lines, channels, findings, masterUnsupported };
}

/* ------------------------------------------------------------------ *
 * checks semanticos por ocurrencia
 * ------------------------------------------------------------------ */
function checkSemantics(obj, where, constants) {
  const out = [];
  const err = (code, msg) => out.push({ sev: 'ERROR', code, where, msg });
  const warn = (code, msg) => out.push({ sev: 'WARN', code, where, msg });
  const note = (code, msg) => out.push({ sev: 'NOTE', code, where, msg });

  // --- tgt: sin duplicados ---
  if (typeof obj.tgt === 'string') {
    const parts = obj.tgt.split('|');
    const uniq = new Set(parts);
    if (uniq.size !== parts.length) err('E_TGT_DUP', 'tgt repite targets: "' + obj.tgt + '"');
  }

  // --- GOP: cad.seg debe ser multiplo entero de v.g/v.f ---
  const g = obj.v && Number(obj.v.g);
  const f = obj.v && Number(obj.v.f);
  const seg = obj.cad && Number(obj.cad.seg);
  if (g > 0 && f > 0 && seg > 0) {
    const gop = g / f;
    const k = seg / gop;
    const kr = Math.round(k);
    if (kr < 1) err('E_GOP_COHERENCE', 'cad.seg=' + seg + 's es menor que un GOP (' + gop.toFixed(4) + 's): el segmento partiria GOPs');
    else if (Math.abs(k - kr) * gop > GOP_TOL) err('E_GOP_COHERENCE', 'cad.seg=' + seg + 's no es multiplo entero de GOP ' + gop.toFixed(4) + 's (v.g=' + g + ', v.f=' + f + '); k=' + k.toFixed(4));
    else note('N_GOP_OK', 'cad.seg=' + seg + 's = ' + kr + ' x GOP(' + gop.toFixed(4) + 's)');
  } else {
    note('N_GOP_NOT_COMPUTED', 'coherencia cad.seg<=>v.g/v.f NO COMPUTADA: falta ' + [!g && 'v.g', !f && 'v.f', !seg && 'cad.seg'].filter(Boolean).join(', '));
  }

  // --- cadencia fija distinta del fps real ---
  if (obj.cad && obj.cad.mode === 'fixed' && Number(obj.cad.fps) > 0 && f > 0 && Math.abs(Number(obj.cad.fps) - f) > 1e-6) {
    warn('W_CAD_FPS_MISMATCH', 'cad.mode=fixed con cad.fps=' + obj.cad.fps + ' pero v.f=' + f + ': conversion de cadencia declarada');
  }

  // --- flt / vlc / ott ---
  const tgt = typeof obj.tgt === 'string' ? obj.tgt.split('|') : [];
  const vlcOn = obj.vlc && obj.vlc.f === 1;
  if (tgt.includes('vlc') && vlcOn && !obj.flt) {
    err('E_VLC_FLT_MISSING', 'tgt incluye vlc y vlc.f=1 pero falta "flt": no hay cadena que aplicar');
  }
  if (obj.flt && !(tgt.includes('vlc') && vlcOn)) {
    warn('W_FLT_UNUSED', 'hay "flt" pero ningun consumidor lo aplica (falta vlc.f=1 o "vlc" en tgt): cadena inerte');
  }
  if (tgt.includes('ott') && obj.flt) {
    note('N_OTT_IGNORES_FLT', 'tgt incluye ott y hay "flt": OTT NO debe tocar la cadena (flt es VPS/VLC)');
  }
  // Objetos por-target declarados pero no listados en tgt: dato muerto (el shim no lo aplicara).
  const TARGET_OBJECTS = { ott: 'ott', vlc: 'vlc', kod: 'kod' };
  for (const [objKey, target] of Object.entries(TARGET_OBJECTS)) {
    if (obj[objKey] && typeof obj[objKey] === 'object' && !tgt.includes(target)) {
      warn('W_OBJ_NOT_TARGETED', 'objeto "' + objKey + '" declarado pero "' + target + '" no esta en tgt: el shim no lo aplicara');
    }
  }

  // --- trampas de cabecera (checklist EXTHTTP del repo) ---
  const ua = obj.hdr && obj.hdr.ua;
  if (typeof ua === 'string') {
    if (/%20/.test(ua)) err('E_UA_PCT20', 'trampa 2: %20 en User-Agent (debe ir espacio literal)');
    if (/[\r\n]/.test(ua)) err('E_UA_CRLF', 'trampa 3: CR/LF en User-Agent (inyeccion de cabeceras)');
    if (/OMEGA|CRYSTAL|APE_/i.test(ua)) warn('W_UA_ENGINE_FP', 'trampa 11: huella de motor en el User-Agent');
  }
  const rf = obj.hdr && obj.hdr.rf;
  if (typeof rf === 'string' && /iptv-ape|duckdns|178\.156|hetzner/i.test(rf)) {
    err('E_RF_VPS', 'trampa 14: Referer apunta al VPS propio (un bloqueo del CDN mataria todos los canales)');
  }

  // --- identidad vs tvg-id ---
  const tvgId = constants.tvgId;
  if (tvgId && typeof obj.id === 'string' && tvgId !== obj.id) {
    warn('W_ID_TVGID', 'id="' + obj.id + '" no coincide con tvg-id="' + tvgId + '"');
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * validacion de UNA lista
 * ------------------------------------------------------------------ */
function validateFile(file) {
  const text = readFileOrDie(file);
  const findings = [];
  const { lines, channels, findings: parseFindings, masterUnsupported } = parsePlaylist(text);
  findings.push(...parseFindings);

  const stats = {
    file,
    lines: lines.length,
    channels: channels.length,
    tags: 0,
    max_tag_line_chars: 0,
    max_payload_chars: 0,
    non_ascii_tag_lines: 0,
    protected_census: { exthttp: 0, ape_directives: 0, extvlcopt: 0, kodiprop: 0, stream_inf: 0 }
  };

  for (const line of lines) {
    if (line.startsWith('#EXTHTTP:')) stats.protected_census.exthttp++;
    else if (line.startsWith('#EXT-X-APE-')) stats.protected_census.ape_directives++;
    else if (line.startsWith('#EXTVLCOPT:')) stats.protected_census.extvlcopt++;
    else if (line.startsWith('#KODIPROP:')) stats.protected_census.kodiprop++;
    else if (line.startsWith('#EXT-X-STREAM-INF:')) stats.protected_census.stream_inf++;
  }

  channels.forEach((ch, ci) => {
    const label = 'canal #' + (ci + 1) + (ch.name ? ' "' + clip(ch.name, 40) + '"' : '');
    const occ = ch.tags.filter((t) => t.line.startsWith(PREFIX));

    if (occ.length === 0) {
      findings.push({ sev: 'ERROR', code: 'E_TAG_MISSING', where: label + ' (linea ' + (ch.extinfIdx + 1) + ')', msg: 'el canal no tiene ' + TAG });
      return;
    }
    if (occ.length > 1) {
      findings.push({ sev: 'ERROR', code: 'E_TAG_DUP', where: label, msg: occ.length + ' ocurrencias del tag (el contrato exige exactamente 1); lineas ' + occ.map((o) => o.idx + 1).join(', ') });
    }
    const last = occ[occ.length - 1];
    if (last.idx !== ch.uriIdx - 1) {
      const between = ch.uriIdx - last.idx - 1;
      findings.push({ sev: 'ERROR', code: 'E_TAG_NOT_LAST', where: label, msg: 'el tag no es la linea inmediatamente anterior a la URI (' + between + ' linea(s) entre el tag y la URI)' });
    }

    occ.forEach((o) => {
      stats.tags++;
      const lineChars = o.line.length;
      stats.max_tag_line_chars = Math.max(stats.max_tag_line_chars, lineChars);
      if (Buffer.byteLength(o.line, 'utf8') !== lineChars) stats.non_ascii_tag_lines++;
      const payload = o.line.slice(PREFIX.length);
      stats.max_payload_chars = Math.max(stats.max_payload_chars, payload.length);

      if (lineChars > MAX_LINE_CHARS) {
        findings.push({ sev: 'ERROR', code: 'E_LINE_TOO_LONG', where: label + ' (linea ' + (o.idx + 1) + ')', msg: lineChars + ' chars > techo duro ' + MAX_LINE_CHARS + ' del contrato' });
      } else if (lineChars > WARN_LINE_CHARS) {
        findings.push({ sev: 'WARN', code: 'W_LINE_NEAR_LIMIT', where: label + ' (linea ' + (o.idx + 1) + ')', msg: lineChars + ' chars > presupuesto operativo ' + WARN_LINE_CHARS + ' (techo ' + MAX_LINE_CHARS + ')' });
      }

      if (/,\s*[}\]]/.test(payload)) {
        findings.push({ sev: 'ERROR', code: 'E_TRAILING_COMMA', where: label + ' (linea ' + (o.idx + 1) + ')', msg: 'comas finales: JSON estricto las rechaza y el bloque entero se descartaria' });
      }
      let obj;
      try { obj = JSON.parse(payload); } catch (e) {
        findings.push({ sev: 'ERROR', code: 'E_JSON_PARSE', where: label + ' (linea ' + (o.idx + 1) + ')', msg: 'payload no es JSON estricto: ' + e.message });
        return;
      }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        findings.push({ sev: 'ERROR', code: 'E_PAYLOAD_NOT_OBJECT', where: label, msg: 'el payload debe ser un objeto JSON {..}' });
        return;
      }
      if (JSON.stringify(obj) !== payload) {
        findings.push({ sev: 'WARN', code: 'W_NOT_CANONICAL', where: label + ' (linea ' + (o.idx + 1) + ')', msg: 'el payload no es la forma compacta canonica (claves ordenadas como se emiten y sin espacios); JSON valido, forma no' });
      }
      for (const f of validateAgainst(CONTRACT, CONTRACT, obj, '', [])) {
        findings.push({ sev: 'ERROR', code: f.code, where: label + ' ' + (f.path || '(raiz)'), msg: f.msg });
      }
      for (const f of checkSemantics(obj, label, { tvgId: ch.tvgId })) findings.push(f);
    });
  });

  if (channels.length === 0) {
    findings.push({ sev: 'ERROR', code: 'E_NO_CHANNELS', where: file, msg: 'no se encontro ningun bloque #EXTINF ... URI: no es un catalogo de canales y el contrato no aplica aqui' });
  }
  if (masterUnsupported > 0) {
    findings.push({ sev: 'WARN', code: 'W_MASTER_VARIANT_WITHOUT_EXTINF', where: file, msg: masterUnsupported + ' #EXT-X-STREAM-INF sin #EXTINF: no es la forma del catalogo de canales' });
  }
  return { stats, findings };
}

/* ------------------------------------------------------------------ *
 * prueba aditiva --baseline
 * ------------------------------------------------------------------ */
function checkAdditive(targetFile, baseFile) {
  const base = splitLines(readFileOrDie(baseFile, '[BASELINE]'));
  const targetAll = splitLines(readFileOrDie(targetFile));
  const out = [];
  const baseTags = base.filter((l) => l.startsWith(PREFIX)).length;
  if (baseTags > 0) {
    out.push({ sev: 'ERROR', code: 'E_BASELINE_HAS_TAG', where: baseFile, msg: 'la baseline ya contiene ' + baseTags + ' lineas ' + TAG + ': pase la lista SIN el tag' });
    return out;
  }
  const stripped = targetAll.filter((l) => !l.startsWith(PREFIX));
  const n = Math.max(base.length, stripped.length);
  for (let i = 0; i < n; i++) {
    if (base[i] === stripped[i]) continue;
    out.push({
      sev: 'ERROR', code: 'E_BASELINE_DIFF', where: 'linea ' + (i + 1),
      msg: 'la lista validada, sin el tag, difiere de la baseline. baseline=' + JSON.stringify(clip(base[i] === undefined ? '<ausente>' : base[i], 120)) + ' validada=' + JSON.stringify(clip(stripped[i] === undefined ? '<ausente>' : stripped[i], 120))
    });
    break; // un solo hallazgo: el primero desalineado ya prueba la diferencia
  }
  if (out.length === 0) {
    out.push({ sev: 'NOTE', code: 'N_ADDITIVE_OK', where: targetFile, msg: 'ADITIVO: quitando ' + targetAll.filter((l) => l.startsWith(PREFIX)).length + ' lineas ' + TAG + ' la lista es identica a la baseline (' + base.length + ' lineas, orden y contenido)' });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */
const results = [];
let errors = 0, warns = 0, notes = 0;
for (const f of files) {
  const r = validateFile(f);
  if (baselinePath) r.findings.push(...checkAdditive(f, baselinePath));
  for (const x of r.findings) {
    if (x.sev === 'ERROR') errors++;
    else if (x.sev === 'WARN') warns++;
    else notes++;
  }
  results.push(r);
}

if (asJson) {
  console.log(JSON.stringify({
    tool: 'validate_extshimott',
    contract: contractPath,
    contract_id: CONTRACT.$id,
    limits: { max_line_chars: MAX_LINE_CHARS, warn_line_chars: WARN_LINE_CHARS },
    baseline: baselinePath,
    verdict: errors === 0 ? 'PASS' : 'FAIL',
    counts: { errors, warns, notes },
    files: results
  }, null, 2));
} else {
  console.log('== validate_extshimott == contrato ' + CONTRACT.$id + ' (techo ' + MAX_LINE_CHARS + ' chars, presupuesto ' + WARN_LINE_CHARS + ')');
  for (const r of results) {
    console.log('\n-- ' + r.stats.file);
    console.log('   lineas=' + r.stats.lines + ' canales=' + r.stats.channels + ' tags=' + r.stats.tags +
      ' max_tag_line_chars=' + r.stats.max_tag_line_chars + ' max_payload_chars=' + r.stats.max_payload_chars +
      (r.stats.non_ascii_tag_lines ? ' lineas_tag_no_ascii=' + r.stats.non_ascii_tag_lines : ''));
    console.log('   censo protegido: EXTHTTP=' + r.stats.protected_census.exthttp +
      ' EXT-X-APE-*=' + r.stats.protected_census.ape_directives +
      ' EXTVLCOPT=' + r.stats.protected_census.extvlcopt +
      ' KODIPROP=' + r.stats.protected_census.kodiprop +
      ' EXT-X-STREAM-INF=' + r.stats.protected_census.stream_inf);
    if (r.findings.length === 0) { console.log('   [PASS] sin hallazgos'); continue; }
    for (const f of r.findings) {
      const tag = f.sev === 'ERROR' ? '[FAIL]' : f.sev === 'WARN' ? '[WARN]' : '[NOTE]';
      console.log('   ' + tag + ' ' + f.code + ' · ' + f.where + ' · ' + f.msg);
    }
  }
  console.log('\n== veredicto: ' + (errors === 0 ? 'PASS' : 'FAIL') + ' · ERROR=' + errors + ' WARN=' + warns + ' NOTE=' + notes);
}
process.exit(errors === 0 ? 0 : 1);
