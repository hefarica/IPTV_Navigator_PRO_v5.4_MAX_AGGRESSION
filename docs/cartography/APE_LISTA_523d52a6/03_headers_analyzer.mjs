#!/usr/bin/env node
/**
 * 03_headers_analyzer.mjs — APE_LISTA_1793589060441.m3u8
 *
 * Analizador de UNA SOLA PASADA (streaming, memoria acotada) de la capa de
 * metadatos/transporte por canal:
 *   #EXTHTTP, #KODIPROP, #EXTVLCOPT, #EXTATTRFROMURL,
 *   familias #EXT-X-CMAF-*, #EXT-X-VNOVA-LCEVC-*, #EXT-X-PHANTOM-HYDRA-*,
 *   encabezados de variante (#EXT-X-STREAM-INF, #EXT-X-I-FRAME-STREAM-INF, #EXT-X-MEDIA),
 *   #EXT-X-MAP (global).
 *
 * SOLO LECTURA sobre la lista. Escribe JSON por stdout (o --out ruta).
 * Redacta credenciales/tokens antes de cualquier salida.
 *
 * Uso:
 *   node 03_headers_analyzer.mjs --out 03_headers_map.json
 */

import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';

const SRC_DEFAULT =
  'C:\\Users\\HFRC\\AppData\\Local\\DSH_HERRAMIENTAS\\DSH_BLUEGREEN_021\\home\\attachments\\v1\\files\\52\\523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6\\APE_LISTA_1793589060441.m3u8';

const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const SRC = argOf('--src', SRC_DEFAULT);
const OUT = argOf('--out', null);

/* ------------------------------------------------------------------ utils */

const REDACTED = '***REDACTED***';

/** Redacta credenciales/tokens de un valor antes de emitirlo. */
function redact(s) {
  if (s == null) return s;
  let v = String(s);
  // scheme://user:pass@host  -> scheme://***:***@host
  v = v.replace(/\b([a-zA-Z][a-zA-Z0-9+.\-]*:\/\/)[^\s\/@:]+:[^\s\/@]*@/g, `$1${REDACTED}:${REDACTED}@`);
  // Xtream style: scheme://host:port/<user>/<pass>/...
  v = v.replace(/\b([a-zA-Z][a-zA-Z0-9+.\-]*:\/\/[^\s\/:]+(?::\d+)?\/)[^\s\/]+\/[^\s\/]+(?=\/)/g, `$1${REDACTED}/${REDACTED}`);
  // JWT
  v = v.replace(/\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g, REDACTED);
  // Bearer / Basic
  v = v.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._\-\/+=]{8,}/gi, `$1 ${REDACTED}`);
  // token= / password= / usuario= etc. dentro del valor
  v = v.replace(/\b(token|password|pass|pwd|secret|apikey|api_key|user|username|usuario|clave|session|sessionid|session_id|jwt)=([^\s&,;"']+)/gi, `$1=${REDACTED}`);
  // session-id opacos con separadores _ . -
  v = v.replace(/\b[a-f0-9]{8,}_[a-z0-9]{6,}_[a-z0-9]{3,}\b/gi, REDACTED);
  // blobs base64/hex largos (>=40) que parezcan credenciales
  v = v.replace(/\b[A-Za-z0-9+/]{48,}={0,2}\b/g, REDACTED);
  v = v.replace(/\b[a-fA-F0-9]{40,}\b/g, REDACTED);
  return v;
}

const inc = (map, k, n = 1) => {
  if (!map.has(k)) map.set(k, 0);
  map.set(k, map.get(k) + n);
};
const mapToSortedObj = (m, transform = (v) => v) => {
  const entries = m instanceof Map ? [...m.entries()] : Object.entries(m || {});
  const arr = entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const o = {};
  for (const [k, v] of arr) {
    // claves vacias rompen consumidores estrictos (PowerShell ConvertFrom-Json): se nombran
    const key = k === '' || k == null ? '(empty-string)' : transform(k);
    o[key] = v;
  }
  return o;
};
const pct = (arr, p) => {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const idx = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1));
  return a[idx];
};
const stats = (arr) => {
  if (!arr.length) return { n: 0 };
  const a = [...arr].sort((x, y) => x - y);
  const sum = a.reduce((s, x) => s + x, 0);
  return {
    n: a.length,
    min: a[0],
    max: a[a.length - 1],
    mean: +(sum / a.length).toFixed(2),
    median: pct(a, 50),
    p90: pct(a, 90),
    p95: pct(a, 95),
    p99: pct(a, 99),
    sum,
  };
};

/* ---------------------------------------------------------- tag taxonomy */

const TAG_RE = /^#([A-Za-z0-9._\-]+)/;
const FAMILY_PREFIXES = [
  '#EXT-X-CMAF-',
  '#EXT-X-VNOVA-LCEVC-',
  '#EXT-X-PHANTOM-HYDRA-',
];
const isFamily = (tag) => FAMILY_PREFIXES.some((p) => tag.startsWith(p));
const isApe = (tag) => tag.startsWith('#EXT-X-APE-');

/** Clasifica el PATRON de un valor de EXTATTRFROMURL (que se rellena desde la URL/stream). */
function valuePattern(v) {
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return 'iso8601_timestamp';
  if (/^\d+x\d+$/.test(s)) return 'resolution_WxH';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return 'ipv4';
  if (/^\d+(\.\d+){1,3}$/.test(s)) return 'version_or_decimal';
  if (/^-?\d+$/.test(s)) return 'integer';
  if (/^(true|false)$/i.test(s)) return 'boolean';
  if (/^https?:\/\//i.test(s)) return 'url';
  if (/^[a-z0-9]{4}\.[0-9]/.test(s)) return 'rfc6381_codec';
  if (/^[a-f0-9]{16,}$/i.test(s)) return 'hex_id';
  if (/^[A-Za-z0-9]+_[A-Za-z0-9]+_[A-Za-z0-9]+$/.test(s)) return 'opaque_id_triple';
  if (/Mozilla\/|AppleWebKit|Dalvik|AppleCoreMedia|Roku\/|VLC\/|Kodi\//.test(s)) return 'user_agent';
  if (/^[a-z0-9_]+$/i.test(s)) return 'enum_token';
  if (/^[a-z0-9_]+,[a-z0-9_,]+$/i.test(s)) return 'enum_list';
  return 'other';
}

// headers tóxicos según doctrina del repo (CLAUDE.md / AGENTS.md)
const TOXIC_SPEC = [
  { needle: 'range', label: 'Range' },
  { needle: 'if-none-match', label: 'If-None-Match' },
  { needle: 'if-modified-since', label: 'If-Modified-Since' },
  { needle: 'te', label: 'TE' },
  { needle: 'priority', label: 'Priority' },
  { needle: 'upgrade-insecure-requests', label: 'Upgrade-Insecure-Requests' },
];

const CRED_HEADER_RE =
  /^(authorization|cookie|set-cookie|x-ape-playback-token|x-api-key|api-key|x-auth-token|x-access-token|proxy-authorization|x-ape-token)$/i;

/* --------------------------------------------------------------- estado */

const tagCounts = new Map();        // tag exacto -> conteo global
const kodipropNames = new Map();    // propiedad KODIPROP (sin valor) -> conteo
const extvlcoptNames = new Map();   // opción EXTVLCOPT -> conteo
const extattrAttrs = new Map();     // atributo EXTATTRFROMURL -> conteo
const familyValues = new Map();     // tag de familia -> Map(valor redactado -> conteo)
const familyChannels = new Map();   // tag de familia -> Set(blockIdx)
const extattrChannels = new Set();  // canales que usan EXTATTRFROMURL
const uriAttrViolations = [];       // URI= indebido en STREAM-INF / I-FRAME-STREAM-INF

// EXTHTTP
const exthttpFieldFreq = new Map();
const exthttpSizes = [];
const exthttpFieldCounts = [];
const exthttpParseErrors = [];
const exthttpOverflow = { count: 0 };
const toxicHits = new Map();        // label tóxico -> conteo de canales
const toxicChannels = new Map();     // label -> Set(ch)
const credHeaderFreq = new Map();
const credValueChannels = new Set();
const exthttpValueSampleByField = new Map(); // campo -> Set(valor redactado) (cap)

// EXTHTTP overflow (#EXT-X-APE-OVERFLOW-HEADERS base64)
const overflowStats = { objects: 0, valid: 0, invalid: 0, fieldCounts: [], sizes: [], fieldFreq: new Map(), errors: [] };

// KODIPROP familias
const kodipropFamilies = new Map();

// GOLDEN RULE hvc1 / hev1
const golden = {
  channelsWithStreamInfHvc1: 0,
  channelsWithStreamInfHev1: 0,
  channelsWithKodipropHvc1: 0,
  channelsWithKodipropHev1: 0,
  channelsWithExtvlcoptHvc1: 0,
  channelsWithExtvlcoptHev1: 0,
  channelsWithApeCodecTagHvc1: 0,
  channelsWithApeCodecTagHev1: 0,
  violations: [],       // {channel, kind, detail(redacted)}
  violationCounts: new Map(),
};

// variantes
const variant = {
  streamInfPerChannel: [],
  iframePerChannel: [],
  mediaPerChannel: [],
  daterangePerChannel: [],
  channelsWithGt1StreamInf: 0,
  channelsWith0StreamInf: 0,
  uriAttrInStreamInf: 0,
  uriAttrInIframe: 0,
  uriAttrInMedia: 0,
  coCodecsSamples: new Map(), // CODECS= encontrados
};

// EXTHTTP sin declarar en un canal
let channelsNoExthttp = 0;

/* --- sondas adicionales (coherencia de capas + reconciliacion) --- */
const preambleTagCounts = new Map();   // tags antes del primer #EXTINF
let preambleLines = 0;
const streamInfAttrs = { RESOLUTION: new Map(), VIDEO_RANGE: new Map(), HDCP_LEVEL: new Map(), FRAME_RATE: new Map(), BANDWIDTH: new Map(), STABLE_VARIANT_ID_prefix: new Map() };
const iframeCodecs = new Map();
const KODIPROP_VALUE_PROPS = new Set([
  'inputstream.adaptive.video_codec',
  'inputstream.adaptive.drm_type',
  'inputstream.adaptive.drm_level',
  'inputstream.adaptive.drm_security_level',
  'inputstream.adaptive.drm_robustness_level',
  'inputstream.adaptive.drm_key_request_properties',
  'inputstream.adaptive.drm_server_certificate',
  'inputstream.adaptive.manifest_headers',
  'inputstream.adaptive.stream_headers',
  'inputstream.adaptive.network_user_agent',
  'inputstream.adaptive.hdr_mode',
  'inputstream.adaptive.hdr_dolbyvision_profile',
  'inputstream.adaptive.max_resolution',
  'inputstream.adaptive.manifest_type',
  'inputstream.adaptive.video_lcevc',
  'inputstream.adaptive.video_lcevc_phase',
]);
const kodipropValueSamples = new Map(); // prop -> Map(valor redactado -> n)
const EXTVLCOPT_VALUE_PROPS = new Set(['codec', 'video-hdr-mode', 'video-hdr', 'adaptive-maxwidth', 'adaptive-maxheight', 'video-filter']);
const extvlcoptValueSamples = new Map();
const exthttpProfileDist = { 'X-APE-Profile': new Map(), 'X-APE-Tier': new Map(), 'X-APE-Codec-Video': new Map(), 'X-APE-Resolution-Q': new Map(), 'X-APE-HDR-Mode': new Map(), 'X-APE-Codec-Family': new Map() };
const extattrValues = new Map();       // atributo -> Map(valor redactado -> n)
const extattrPatterns = new Map();     // atributo -> Map(patron -> n)
const overflowToxic = new Map();
const overflowLookalike = new Map();
const overflowNameSet = new Set();
const perChannelTotalFields = [];
const daterangeHdrType = new Map();
const daterangeClass = new Map();
let daterangeCount = 0;

// bloque
let blockIdx = -1;
let cur = null;
const newBlock = () => ({
  i: blockIdx,
  lines: 0,
  uriLines: 0,
  exthttp: null,
  exthttpRaw: 0,
  exthttpFields: 0,
  overflowFields: 0,
  kodiprops: 0,
  extvlcopts: 0,
  attrs: 0,
  streamInf: 0,
  iframe: 0,
  media: 0,
  daterange: 0,
  map: 0,
  hv: { si_hvc1: 0, si_hev1: 0, kp_hvc1: 0, kp_hev1: 0, vl_hvc1: 0, vl_hev1: 0, ape_hvc1: 0, ape_hev1: 0 },
  codes: [],
  overflow: 0,
});

/* ---------------------------------------------------------------- pase 1 */

const sha = crypto.createHash('sha256');
await new Promise((resolve, reject) => {
  const rs = fs.createReadStream(SRC);
  rs.on('data', (c) => sha.update(c));
  rs.on('end', resolve);
  rs.on('error', reject);
});
const sha256 = sha.digest('hex');
const sizeBytes = fs.statSync(SRC).size;

const rl = readline.createInterface({
  input: fs.createReadStream(SRC, { encoding: 'utf8', highWaterMark: 1 << 20 }),
  crlfDelay: Infinity,
});

let lineNo = 0;
let totalLines = 0;
let nonTagLines = 0;
let extLines = 0;

/* cierre de bloque: agrega EXTHTTP y golden rule del bloque */
function closeBlock() {
  if (!cur) return;
  if (cur.exthttp === null) channelsNoExthttp++;
  variant.streamInfPerChannel.push(cur.streamInf);
  variant.iframePerChannel.push(cur.iframe);
  variant.mediaPerChannel.push(cur.media);
  variant.daterangePerChannel.push(cur.daterange);
  if (cur.streamInf === 0) variant.channelsWith0StreamInf++;
  if (cur.streamInf > 1) {
    variant.channelsWithGt1StreamInf++;
    if (variant.channelsWithGt1StreamInf <= 20) variant.uriAttrViolations.push({ channel: cur.i, kind: 'MULTI_STREAM_INF', n: cur.streamInf });
  }

  const h = cur.hv;
  if (h.si_hvc1 || h.si_hev1) {
    if (h.si_hvc1) golden.channelsWithStreamInfHvc1++;
    if (h.si_hev1) golden.channelsWithStreamInfHev1++;
  }
  if (h.kp_hvc1) golden.channelsWithKodipropHvc1++;
  if (h.kp_hev1) golden.channelsWithKodipropHev1++;
  if (h.vl_hvc1) golden.channelsWithExtvlcoptHvc1++;
  if (h.vl_hev1) golden.channelsWithExtvlcoptHev1++;
  if (h.ape_hvc1) golden.channelsWithApeCodecTagHvc1++;
  if (h.ape_hev1) golden.channelsWithApeCodecTagHev1++;

  // GOLDEN RULE: hvc1 SOLO en STREAM-INF CODECS; hev1 SOLO en KODIPROP/EXTVLCOPT. Nunca cruzados.
  // Violación A: STREAM-INF declara hev1.*
  if (h.si_hev1 > 0) {
    inc(golden.violationCounts, 'STREAM_INF_declares_hev1');
    if (golden.violations.length < 25) golden.violations.push({ channel: cur.i, kind: 'STREAM_INF_declares_hev1', count: h.si_hev1 });
  }
  // Violación B: KODIPROP o EXTVLCOPT declaran hvc1.*
  if (h.kp_hvc1 > 0 || h.vl_hvc1 > 0) {
    if (h.kp_hvc1 > 0) inc(golden.violationCounts, 'KODIPROP_declares_hvc1');
    if (h.vl_hvc1 > 0) inc(golden.violationCounts, 'EXTVLCOPT_declares_hvc1');
    if (golden.violations.length < 25) golden.violations.push({ channel: cur.i, kind: 'KODIPROP_or_EXTVLCOPT_declares_hvc1', kp: h.kp_hvc1, vl: h.vl_hvc1 });
  }
  cur = null;
}

for await (const rawLine of rl) {
  lineNo++;
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  totalLines = lineNo;
  if (!line) continue;

  if (line[0] !== '#') {
    nonTagLines++;
    if (cur) cur.uriLines++;
    continue;
  }
  extLines++;

  const m = TAG_RE.exec(line);
  const tag = m ? '#' + m[1] : '#(sin-nombre)';
  inc(tagCounts, tag);
  if (cur === null && blockIdx === -1) { inc(preambleTagCounts, tag); preambleLines++; }
  if (tag === '#EXT-X-MAP') { if (cur) cur.map++; }

  // frontera de canal
  if (tag === '#EXTINF') {
    closeBlock();
    blockIdx++;
    cur = newBlock();
    cur.lines = 1;
    continue;
  }
  if (!cur) continue;
  cur.lines++;

  // familia: valor
  if (isFamily(tag)) {
    const val = line.slice(tag.length).replace(/^:/, '');
    if (!familyValues.has(tag)) familyValues.set(tag, new Map());
    inc(familyValues.get(tag), redact(val).slice(0, 300));
    if (!familyChannels.has(tag)) familyChannels.set(tag, new Set());
    familyChannels.get(tag).add(blockIdx);
  }

  /* ---------------------------------------------------------- EXTHTTP */
  if (tag === '#EXTHTTP') {
    cur.exthttp = line.slice('#EXTHTTP:'.length);
    cur.exthttpRaw++;
    const s = cur.exthttp;
    const bytes = Buffer.byteLength(s, 'utf8');
    exthttpSizes.push(bytes);
    let obj = null;
    try {
      obj = JSON.parse(s);
    } catch (e) {
      exthttpParseErrors.push({ channel: blockIdx, line: lineNo, error: redact(String(e && e.message)), bytes });
    }
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const keys = Object.keys(obj);
      exthttpFieldCounts.push(keys.length);
      cur.exthttpFields = keys.length;
      if (bytes > 8192) exthttpOverflow.count++;
      for (const k of keys) {
        inc(exthttpFieldFreq, k);
        const kk = k.trim().toLowerCase();
        for (const t of TOXIC_SPEC) {
          if (kk === t.needle) {
            inc(toxicHits, t.label);
            if (!toxicChannels.has(t.label)) toxicChannels.set(t.label, new Set());
            toxicChannels.get(t.label).add(blockIdx);
          }
        }
        if (CRED_HEADER_RE.test(k)) {
          inc(credHeaderFreq, k);
          credValueChannels.add(blockIdx);
        }
        const v = obj[k];
        if (typeof v === 'string') {
          if (/(bearer|basic)\s+[A-Za-z0-9._\-\/+=]{8,}|eyJ[A-Za-z0-9_\-]{8,}\./i.test(v)) credValueChannels.add(blockIdx);
          if (Object.prototype.hasOwnProperty.call(exthttpProfileDist, k)) inc(exthttpProfileDist[k], redact(v).slice(0, 80));
          // muestra de valores por campo (para clasificar), cap 4 por campo, redactado
          if (!exthttpValueSampleByField.has(k)) exthttpValueSampleByField.set(k, new Set());
          const set = exthttpValueSampleByField.get(k);
          if (set.size < 4) set.add(redact(v).slice(0, 120));
        }
      }
    } else if (obj !== null) {
      // JSON válido pero no objeto
      exthttpParseErrors.push({ channel: blockIdx, line: lineNo, error: 'valid JSON but not an object: ' + (Array.isArray(obj) ? 'array' : typeof obj), bytes });
    }
    continue;
  }

  /* ------------------------------------ #EXT-X-APE-OVERFLOW-HEADERS */
  if (tag === '#EXT-X-APE-OVERFLOW-HEADERS') {
    cur.overflow++;
    overflowStats.objects++;
    const b64 = line.slice('#EXT-X-APE-OVERFLOW-HEADERS:'.length).trim();
    try {
      const json = Buffer.from(b64, 'base64').toString('utf8');
      overflowStats.sizes.push(Buffer.byteLength(json, 'utf8'));
      const o = JSON.parse(json);
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        overflowStats.valid++;
        const keys = Object.keys(o);
        overflowStats.fieldCounts.push(keys.length);
        cur.overflowFields = keys.length;
        perChannelTotalFields.push((cur.exthttpFields ?? 0) + keys.length);
        for (const k of keys) {
          inc(overflowStats.fieldFreq, k);
          overflowNameSet.add(k);
          const kk = k.trim().toLowerCase();
          for (const t of TOXIC_SPEC) if (kk === t.needle) inc(overflowToxic, t.label);
          // nombres "lookalike" de un header toxico: SOLO sufijo/prefijo exacto,
          // con allowlist de compuestos benignos (video-range, bitrate, latency...)
          const BENIGN = /(-video-range|runtime|-latency|-bitrate)/;
          for (const t of TOXIC_SPEC) {
            if (kk === t.needle) continue;
            const suf = kk.endsWith('-' + t.needle);
            const pre = kk.startsWith(t.needle + '-');
            if ((suf || pre) && !BENIGN.test(kk)) inc(overflowLookalike, k);
          }
        }
      } else {
        overflowStats.invalid++;
        if (overflowStats.errors.length < 10) overflowStats.errors.push({ channel: blockIdx, error: 'not an object' });
      }
    } catch (e) {
      overflowStats.invalid++;
      if (overflowStats.errors.length < 10) overflowStats.errors.push({ channel: blockIdx, error: redact(String(e && e.message)) });
    }
    continue;
  }

  /* --------------------------------------------------------- KODIPROP */
  if (tag === '#KODIPROP') {
    cur.kodiprops++;
    const body = line.slice('#KODIPROP:'.length);
    const eq = body.indexOf('=');
    const name = (eq >= 0 ? body.slice(0, eq) : body).trim();
    inc(kodipropNames, name);
    // familia
    let fam = 'other';
    if (name.startsWith('inputstream.adaptive.')) fam = 'inputstream.adaptive.*';
    else if (name === 'inputstream') fam = 'inputstream (selector de módulo)';
    else if (name.startsWith('inputstream.')) fam = 'inputstream.* (otro)';
    else if (name.startsWith('video.') || /vod|video/.test(name)) fam = 'video.*';
    else if (name.startsWith('audio.') || /audio/.test(name)) fam = 'audio.*';
    else if (name.startsWith('subtitle') || /sub/.test(name)) fam = 'subtitle.*';
    else if (/drm|widevine|playready|clearkey|license|hdcd|hdcp/.test(name)) fam = 'drm.*';
    else if (/hdr|dolby|hdr10|hlg|pq|bt2020/.test(name)) fam = 'hdr.*';
    else if (/codec|hevc|hvc1|hev1|avc|av1|vvc/.test(name)) fam = 'codec.*';
    else if (/buffer|bandwidth|bitrate|resolution|framerate|max_|min_|initial_|assured/.test(name)) fam = 'stream-tuning.*';
    inc(kodipropFamilies, fam);
    // golden rule sink
    const val = eq >= 0 ? body.slice(eq + 1) : '';
    if (KODIPROP_VALUE_PROPS.has(name)) {
      if (!kodipropValueSamples.has(name)) kodipropValueSamples.set(name, new Map());
      inc(kodipropValueSamples.get(name), redact(val).slice(0, 200));
    }
    if (/\bhvc1\./.test(val)) cur.hv.kp_hvc1++;
    if (/\bhev1\./.test(val)) cur.hv.kp_hev1++;
    continue;
  }

  /* -------------------------------------------------------- EXTVLCOPT */
  if (tag === '#EXTVLCOPT') {
    cur.extvlcopts++;
    const body = line.slice('#EXTVLCOPT:'.length);
    const eq = body.indexOf('=');
    const name = (eq >= 0 ? body.slice(0, eq) : body).trim();
    inc(extvlcoptNames, name);
    const val = eq >= 0 ? body.slice(eq + 1) : '';
    if (EXTVLCOPT_VALUE_PROPS.has(name)) {
      if (!extvlcoptValueSamples.has(name)) extvlcoptValueSamples.set(name, new Map());
      inc(extvlcoptValueSamples.get(name), redact(val).slice(0, 200));
    }
    if (/\bhvc1\./.test(val)) cur.hv.vl_hvc1++;
    if (/\bhev1\./.test(val)) cur.hv.vl_hev1++;
    continue;
  }

  /* ---------------------------------------------------- EXTATTRFROMURL */
  if (tag === '#EXTATTRFROMURL') {
    cur.attrs++;
    extattrChannels.add(blockIdx);
    const body = line.slice('#EXTATTRFROMURL:'.length);
    const eq = body.indexOf('=');
    const attr = (eq >= 0 ? body.slice(0, eq) : body).trim();
    inc(extattrAttrs, attr);
    const val = eq >= 0 ? body.slice(eq + 1) : '';
    if (!extattrValues.has(attr)) extattrValues.set(attr, new Map());
    inc(extattrValues.get(attr), redact(val).slice(0, 120));
    if (!extattrPatterns.has(attr)) extattrPatterns.set(attr, new Map());
    inc(extattrPatterns.get(attr), valuePattern(val));
    continue;
  }

  /* ------------------------------------------------ ENCABEZADOS VARIANTE */
  if (tag === '#EXT-X-STREAM-INF') {
    cur.streamInf++;
    const body = line.slice('#EXT-X-STREAM-INF:'.length);
    if (/(^|,)\s*URI\s*=/.test(body)) variant.uriAttrInStreamInf++;
    for (const attr of ['RESOLUTION', 'VIDEO-RANGE', 'HDCP-LEVEL', 'FRAME-RATE', 'BANDWIDTH']) {
      const rx = new RegExp('(?:^|,)' + attr + '=("[^"]*"|[^,]*)');
      const mm = rx.exec(body);
      if (mm) inc(streamInfAttrs[attr === 'VIDEO-RANGE' ? 'VIDEO_RANGE' : attr === 'HDCP-LEVEL' ? 'HDCP_LEVEL' : attr === 'FRAME-RATE' ? 'FRAME_RATE' : attr], redact(mm[1].replace(/^"|"$/g, '')));
    }
    const sv = /(?:^|,)STABLE-VARIANT-ID="([^"]*)"/.exec(body);
    if (sv) inc(streamInfAttrs.STABLE_VARIANT_ID_prefix, redact(sv[1].replace(/^.*_/, '')));
    const cm = /CODECS\s*=\s*"([^"]*)"/.exec(body);
    if (cm) {
      inc(variant.coCodecsSamples, cm[1].slice(0, 160));
      if (/\bhvc1\./.test(cm[1])) cur.hv.si_hvc1++;
      if (/\bhev1\./.test(cm[1])) cur.hv.si_hev1++;
    }
    continue;
  }
  if (tag === '#EXT-X-I-FRAME-STREAM-INF') {
    cur.iframe++;
    const body = line.slice('#EXT-X-I-FRAME-STREAM-INF:'.length);
    if (/(^|,)\s*URI\s*=/.test(body)) variant.uriAttrInIframe++;
    const cm2 = /CODECS\s*=\s*"([^"]*)"/.exec(body);
    if (cm2) inc(iframeCodecs, cm2[1].slice(0, 120));
    continue;
  }
  if (tag === '#EXT-X-MEDIA') {
    cur.media++;
    const body = line.slice('#EXT-X-MEDIA:'.length);
    if (/(^|,)\s*URI\s*=/.test(body)) variant.uriAttrInMedia++;
    continue;
  }
  if (tag === '#EXT-X-DATERANGE') {
    cur.daterange++;
    daterangeCount++;
    const body = line.slice('#EXT-X-DATERANGE:'.length);
    const ht = /X-HDR-TYPE=(?:"([^"]*)"|([^,]*))/.exec(body);
    if (ht) inc(daterangeHdrType, redact((ht[1] ?? ht[2] ?? '').trim()));
    const cls = /CLASS=(?:"([^"]*)"|([^,]*))/.exec(body);
    if (cls) inc(daterangeClass, redact((cls[1] ?? cls[2] ?? '').trim()));
    continue;
  }
  if (tag === '#EXT-X-APE-CODEC-REAL' || tag === '#EXT-X-APE-CODEC-PREFERRED') {
    const body = line.slice(tag.length).replace(/^:/, '');
    if (/\bhvc1\./.test(body)) cur.hv.ape_hvc1++;
    if (/\bhev1\./.test(body)) cur.hv.ape_hev1++;
    continue;
  }
}
closeBlock();

/* ------------------------------------------------------------- resumen */

const channels = blockIdx + 1;
const kv = (m) => mapToSortedObj(m);

const exthttpOut = {
  occurrences: [...tagCounts.entries()].find(([k]) => k === '#EXTHTTP')?.[1] ?? 0,
  channels_with_exthttp: channels - channelsNoExthttp,
  channels_without_exthttp: channelsNoExthttp,
  valid_json: exthttpFieldCounts.length,
  invalid_count: exthttpParseErrors.length,
  parse_errors_sample: exthttpParseErrors.slice(0, 10),
  distinct_field_names: exthttpFieldFreq.size,
  field_frequency: kv(exthttpFieldFreq),
  field_count_per_object: stats(exthttpFieldCounts),
  size_stats_bytes: stats(exthttpSizes),
  overflow_count: exthttpOverflow.count,
  overflow_note:
    'overflow_count = objetos #EXTHTTP con serializacion > 8192 bytes. Los headers desplazados se emiten en #EXT-X-APE-OVERFLOW-HEADERS (base64 JSON).',
  overflow_headers_object: {
    occurrences: overflowStats.objects,
    valid_json: overflowStats.valid,
    invalid_count: overflowStats.invalid,
    field_count_per_object: stats(overflowStats.fieldCounts),
    size_stats_bytes: stats(overflowStats.sizes),
    field_frequency: kv(overflowStats.fieldFreq),
    errors_sample: overflowStats.errors,
  },
  toxic_headers: (() => {
    const o = {};
    for (const t of TOXIC_SPEC) {
      o[t.label] = {
        header_name_exact: t.needle,
        occurrences: toxicHits.get(t.label) ?? 0,
        channels: toxicChannels.get(t.label)?.size ?? 0,
      };
    }
    o.__total_channels_with_any_toxic = new Set(
      [...toxicChannels.values()].flatMap((s) => [...s])
    ).size;
    return o;
  })(),
  credential_like: {
    credential_header_names: kv(credHeaderFreq),
    channels_with_credential_value: credValueChannels.size,
  },
  value_samples_redacted_by_field: Object.fromEntries(
    [...exthttpValueSampleByField.entries()]
      .sort((a, b) => (exthttpFieldFreq.get(b[0]) ?? 0) - (exthttpFieldFreq.get(a[0]) ?? 0))
      .map(([k, set]) => [k, [...set]])
  ),
};

const kodipropOut = {
  total: [...tagCounts.entries()].find(([k]) => k === '#KODIPROP')?.[1] ?? 0,
  per_channel_stats: stats(variant.streamInfPerChannel.length ? [] : []),
  distinct_properties: kodipropNames.size,
  property_frequency: kv(kodipropNames),
  families: kv(kodipropFamilies),
  golden_rule_violations: {
    rule: 'hvc1.* SOLO en #EXT-X-STREAM-INF CODECS=; hev1.* SOLO en #KODIPROP/#EXTVLCOPT. Nunca cruzados.',
    sinks_observed: {
      channels_streaminf_hvc1: golden.channelsWithStreamInfHvc1,
      channels_streaminf_hev1: golden.channelsWithStreamInfHev1,
      channels_kodiprop_hvc1: golden.channelsWithKodipropHvc1,
      channels_kodiprop_hev1: golden.channelsWithKodipropHev1,
      channels_extvlcopt_hvc1: golden.channelsWithExtvlcoptHvc1,
      channels_extvlcopt_hev1: golden.channelsWithExtvlcoptHev1,
      channels_ape_codectag_hvc1: golden.channelsWithApeCodecTagHvc1,
      channels_ape_codectag_hev1: golden.channelsWithApeCodecTagHev1,
    },
    violation_counts: kv(golden.violationCounts),
    violations_sample: golden.violations,
  },
};

const extattrOut = {
  total_lines: [...tagCounts.entries()].find(([k]) => k === '#EXTATTRFROMURL')?.[1] ?? 0,
  channels_using: extattrChannels.size,
  channels: channels,
  per_channel: channels ? +((([...tagCounts.entries()].find(([k]) => k === '#EXTATTRFROMURL')?.[1] ?? 0) / channels)).toFixed(3) : 0,
  distinct_attributes: extattrAttrs.size,
  attribute_frequency: kv(extattrAttrs),
  attribute_value_patterns: Object.fromEntries(
    [...extattrAttrs.keys()].sort().map((a) => [
      a,
      {
        occurrences: extattrAttrs.get(a),
        patterns: kv(extattrPatterns.get(a) ?? new Map()),
        top_values_redacted: [...(extattrValues.get(a) ?? new Map()).entries()]
          .sort((x, y) => y[1] - x[1])
          .slice(0, 3)
          .map(([v, c]) => ({ value: v, count: c })),
      },
    ])
  ),
};

const famOut = (prefix) => {
  const o = {};
  for (const [tag, n] of [...tagCounts.entries()].filter(([k]) => k.startsWith(prefix)).sort((a, b) => b[1] - a[1])) {
    const vals = familyValues.get(tag);
    const valArr = vals ? [...vals.entries()].sort((a, b) => b[1] - a[1]) : [];
    o[tag] = {
      count: n,
      channels: familyChannels.get(tag)?.size ?? 0,
      distinct_values: valArr.length,
      top_values: valArr.slice(0, 6).map(([v, c]) => ({ value: v, count: c })),
    };
  }
  return {
    distinct_tags: Object.keys(o).length,
    total_occurrences: Object.values(o).reduce((s, x) => s + x.count, 0),
    tags: o,
  };
};

/** Recorta una distribucion de valores: top N + conteo de distintos (evita bloat). */
const slimDist = (m, topN = 6) => {
  if (!m) return { distinct_values: 0, top_values: [] };
  const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    distinct_values: arr.length,
    top_values: arr.slice(0, topN).map(([value, count]) => ({ value, count })),
  };
};

const result = {
  meta: {
    source: SRC,
    size_bytes: sizeBytes,
    sha256,
    total_lines: totalLines,
    extension_lines: extLines,
    non_tag_lines: nonTagLines,
    channels_measured: channels,
    declared_channels_tag: '#EXT-X-APE-CHANNELS:10573',
    analyzer: '03_headers_analyzer.mjs',
    generated_at: new Date().toISOString(),
    redaction: 'Valores emitidos pasan por redact(): user:pass@, rutas Xtream, JWT, Bearer/Basic, token=/password= y blobs base64/hex >=40 sustituidos por ' + REDACTED,
  },
  global_tag_counts: kv(tagCounts),
  exthttp: exthttpOut,
  kodiprop: kodipropOut,
  extvlcopt: {
    total: [...tagCounts.entries()].find(([k]) => k === '#EXTVLCOPT')?.[1] ?? 0,
    distinct_options: extvlcoptNames.size,
    option_frequency: kv(extvlcoptNames),
  },
  extattrfromurl: extattrOut,
  cmaf: { ...famOut('#EXT-X-CMAF-'), ext_x_map_count_global: [...tagCounts.entries()].find(([k]) => k === '#EXT-X-MAP')?.[1] ?? 0 },
  vnova: famOut('#EXT-X-VNOVA-LCEVC-'),
  phantom: famOut('#EXT-X-PHANTOM-HYDRA-'),
  variant_headers: {
    ext_x_stream_inf: {
      total: [...tagCounts.entries()].find(([k]) => k === '#EXT-X-STREAM-INF')?.[1] ?? 0,
      per_channel: stats(variant.streamInfPerChannel),
      channels_with_zero: variant.channelsWith0StreamInf,
      channels_with_more_than_one: variant.channelsWithGt1StreamInf,
      uri_attribute_present: variant.uriAttrInStreamInf,
      codecs_values: kv(variant.coCodecsSamples),
    },
    ext_x_i_frame_stream_inf: {
      total: [...tagCounts.entries()].find(([k]) => k === '#EXT-X-I-FRAME-STREAM-INF')?.[1] ?? 0,
      per_channel: stats(variant.iframePerChannel),
      uri_attribute_present: variant.uriAttrInIframe,
    },
    ext_x_media: {
      total: [...tagCounts.entries()].find(([k]) => k === '#EXT-X-MEDIA')?.[1] ?? 0,
      per_channel: stats(variant.mediaPerChannel),
      uri_attribute_present: variant.uriAttrInMedia,
    },
    ext_x_daterange: {
      total: [...tagCounts.entries()].find(([k]) => k === '#EXT-X-DATERANGE')?.[1] ?? 0,
      per_channel: stats(variant.daterangePerChannel),
    },
    uri_lines_per_channel_note: 'non_tag_lines / channels = URLs por canal (doctrina Single-URL-per-channel)',
    extension_lines: extLines,
    non_tag_lines: nonTagLines,
  },
  ext_x_map_count: [...tagCounts.entries()].find(([k]) => k === '#EXT-X-MAP')?.[1] ?? 0,
  reconciliation: {
    preamble_lines_before_first_EXTINF: preambleLines - 1,
    preamble_tag_counts: kv(preambleTagCounts),
    deltas: {
      '#EXT-X-DATERANGE': {
        global: [...tagCounts.entries()].find(([k]) => k === '#EXT-X-DATERANGE')?.[1] ?? 0,
        sum_per_channel: variant.daterangePerChannel.reduce((a, b) => a + b, 0),
        in_preamble: preambleTagCounts.get('#EXT-X-DATERANGE') ?? 0,
      },
      '#EXT-X-APE-QUANTUM-PIXEL': {
        global: [...tagCounts.entries()].find(([k]) => k === '#EXT-X-APE-QUANTUM-PIXEL')?.[1] ?? 0,
        in_preamble: preambleTagCounts.get('#EXT-X-APE-QUANTUM-PIXEL') ?? 0,
      },
      '#EXT-X-APE-AUDIO-PASSTHROUGH': {
        global: [...tagCounts.entries()].find(([k]) => k === '#EXT-X-APE-AUDIO-PASSTHROUGH')?.[1] ?? 0,
        in_preamble: preambleTagCounts.get('#EXT-X-APE-AUDIO-PASSTHROUGH') ?? 0,
      },
      '#KODIPROP': {
        global: [...tagCounts.entries()].find(([k]) => k === '#KODIPROP')?.[1] ?? 0,
        sum_property_frequency: [...kodipropNames.values()].reduce((a, b) => a + b, 0),
        in_preamble: preambleTagCounts.get('#KODIPROP') ?? 0,
      },
      '#EXTVLCOPT': {
        global: [...tagCounts.entries()].find(([k]) => k === '#EXTVLCOPT')?.[1] ?? 0,
        sum_option_frequency: [...extvlcoptNames.values()].reduce((a, b) => a + b, 0),
        in_preamble: preambleTagCounts.get('#EXTVLCOPT') ?? 0,
      },
    },
  },
  coherence: {
    note: 'Contradicciones MEDIDAS entre la capa de variante (STREAM-INF) y la capa por-canal (EXTHTTP/KODIPROP/EXTVLCOPT/DATERANGE/EXTATTRFROMURL) del MISMO canal. Se reporta la medicion, no una intencion.',
    stream_inf_attrs: Object.fromEntries(Object.entries(streamInfAttrs).map(([k, v]) => [k, kv(v)])),
    iframe_codecs: kv(iframeCodecs),
    exthttp_layer: Object.fromEntries(Object.entries(exthttpProfileDist).map(([k, v]) => [k, kv(v)])),
    kodiprop_layer: Object.fromEntries([...kodipropValueSamples.entries()].map(([k, v]) => [k, slimDist(v, 4)])),
    extvlcopt_layer: Object.fromEntries([...extvlcoptValueSamples.entries()].map(([k, v]) => [k, slimDist(v, 4)])),
    daterange_layer: { total: daterangeCount, class: kv(daterangeClass), hdr_type: kv(daterangeHdrType) },
  },
  exthttp_overflow_audit: {
    lookalike_names_in_overflow: kv(overflowLookalike),
    toxic_exact_names_in_overflow: Object.fromEntries(TOXIC_SPEC.map((t) => [t.label, overflowToxic.get(t.label) ?? 0])),
    union_distinct_field_names_main_plus_overflow: new Set([...exthttpFieldFreq.keys(), ...overflowNameSet]).size,
    per_channel_total_fields_main_plus_overflow: stats(perChannelTotalFields),
  },
  ape_family: {
    distinct_tags: [...tagCounts.keys()].filter((t) => isApe(t)).length,
    total_occurrences: [...tagCounts.entries()].filter(([t]) => isApe(t)).reduce((s, [, n]) => s + n, 0),
    top_tags: Object.entries(kv(new Map([...tagCounts.entries()].filter(([t]) => isApe(t))))).slice(0, 40),
  },
};

const json = JSON.stringify(result, null, 2);
if (OUT) {
  fs.writeFileSync(OUT, json, 'utf8');
  console.error(`[ok] escrito ${OUT} (${Buffer.byteLength(json)} bytes)`);
  console.error(`[ok] canales=${channels} lineas=${totalLines} sha256=${sha256}`);
} else {
  process.stdout.write(json);
}
