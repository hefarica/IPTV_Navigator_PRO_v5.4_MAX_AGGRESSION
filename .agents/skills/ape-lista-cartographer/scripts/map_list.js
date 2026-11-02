#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * map_list.js — cartógrafo 0→100 % de una lista APE (M3U8/M3U Plus con capas propietarias).
 *
 * Skill: ape-lista-cartographer
 * Versión: 1.0.0
 *
 * QUÉ HACE
 *   Un pase (censo) o dos pasadas (muestra) sobre la lista y emite:
 *     - <out>/map_<sha8>.json  → todas las métricas de la skill
 *     - <out>/map_<sha8>.md    → resumen legible con el veredicto y los estados de evidencia
 *
 * GARANTÍAS
 *   - CERO dependencias externas (solo módulos nativos de Node ≥ 18).
 *   - NUNCA carga el archivo entero: chunks de 8 MiB + resto de línea acotado.
 *   - Redacta host, usuario y contraseña ANTES de escribir nada (y hace un scrub final).
 *   - Lo que no se puede medir se declara NO_COMPUTADO con su razón. No se estima.
 *   - Solo lectura sobre la lista. No escribe fuera de --out / --fixture-out.
 *
 * USO
 *   node scripts/map_list.js <lista.m3u8> --out <dir> [opciones]
 *
 * OPCIONES
 *   --out <dir>            directorio de salida (por defecto ./reports)
 *   --sample <N>           analiza en detalle N canales (estratificado uniforme).
 *                          El censo estructural (líneas, bloques, tags) sigue siendo total.
 *   --no-ffmpeg            no invoca ffmpeg (la validación de filtros queda NO_COMPUTADO)
 *   --ffmpeg <ruta>        binario ffmpeg a usar
 *   --keep-host            NO enmascara el host (usuario y contraseña se enmascaran siempre)
 *   --fixture <idx>        escribe el bloque del canal <idx> (1-based) redactado
 *   --fixture-out <ruta>   destino del fixture (por defecto <out>/fixture_canal_<idx>.txt)
 *   --expect-channels <N>  assertion: falla si los canales medidos != N
 *   --json-only            no escribe el Markdown
 *   --quiet                no imprime progreso
 *
 * SALIDA: exit 0 = cartografía emitida. exit 1 = error de uso/IO. exit 2 = assertion fallida.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const TOOL = { name: 'map_list.js', version: '1.0.0', schema: 'ape-lista-cartographer/map@1' };
const CHUNK = 8 * 1024 * 1024;
const REDACTED = '<REDACTED>';
const HOST_TAG = '<HOST>';
const USER_TAG = '<USER>';
const PASS_TAG = '<PASS>';

/* ════════════════════════════════════════════════════════════════════ argv */

function parseArgv(argv) {
  const o = {
    src: null,
    out: path.join(process.cwd(), 'reports'),
    sample: null,
    ffmpeg: null,
    noFfmpeg: false,
    keepHost: false,
    fixture: null,
    fixtureOut: null,
    expectChannels: null,
    jsonOnly: false,
    quiet: false,
    vlcVersion: null,
  };
  const need = (i, k) => {
    if (i + 1 >= argv.length) throw new Error(`falta el valor de ${k}`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--out': o.out = path.resolve(need(i, a)); i++; break;
      case '--sample': o.sample = Number(need(i, a)); i++; break;
      case '--ffmpeg': o.ffmpeg = need(i, a); i++; break;
      case '--no-ffmpeg': o.noFfmpeg = true; break;
      case '--vlc-version': o.vlcVersion = need(i, a); i++; break;
      case '--keep-host': o.keepHost = true; break;
      case '--fixture': o.fixture = Number(need(i, a)); i++; break;
      case '--fixture-out': o.fixtureOut = path.resolve(need(i, a)); i++; break;
      case '--expect-channels': o.expectChannels = Number(need(i, a)); i++; break;
      case '--json-only': o.jsonOnly = true; break;
      case '--quiet': o.quiet = true; break;
      case '-h': case '--help': o.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`opción desconocida: ${a}`);
        if (!o.src) o.src = path.resolve(a);
        else throw new Error(`argumento extra: ${a}`);
    }
  }
  return o;
}

const HELP = `map_list.js — cartografía una lista APE

  node scripts/map_list.js <lista.m3u8> --out <dir> [--sample N] [--no-ffmpeg]
                            [--ffmpeg <ruta>] [--vlc-version <X.Y.Z>] [--keep-host]
                            [--json-only] [--quiet] [--fixture <idx>]
                            [--fixture-out <ruta>] [--expect-channels <N>]

Salida: map_<sha8>.json + map_<sha8>.md en --out.
NO modifica la lista. NO usa red. Cero dependencias externas.`;

/* ══════════════════════════════════════════════════════════════ utilidades */

const nowIso = () => new Date().toISOString();
const pct = (n, d) => (d ? Number(((100 * n) / d).toFixed(2)) : 0);
const sha = (s, n = 16) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, n);

function quantiles(arr) {
  if (!arr.length) return null;
  const a = Float64Array.from(arr).sort();
  const at = (p) => a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i];
  return {
    n: a.length,
    min: a[0],
    p50: at(50),
    mean: Number((sum / a.length).toFixed(3)),
    p90: at(90),
    p95: at(95),
    p99: at(99),
    max: a[a.length - 1],
    sum: Number(sum.toFixed(3)),
  };
}

/** Histograma de valores enteros pequeños → [{value,count,pct}] ordenado por count desc. */
function histogram(arr) {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()]
    .map(([value, count]) => ({ value, count, pct: pct(count, arr.length) }))
    .sort((a, b) => b.count - a.count || a.value - b.value);
}

/** Top-N de un Map de frecuencias. */
function topEntries(map, n = 20) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, n)
    .map(([k, v]) => ({ key: k, count: v }));
}

/* ───────────────────────────────────────────────────────── redacción */

/**
 * Enmascara credenciales en un texto libre. Nunca se llama sobre la lista: solo sobre salidas.
 * `preserve` = conjunto de cadenas que NO deben tocarse (el sha256 del artefacto, por ejemplo).
 * `stats` = contador de sustituciones ({n}), para poder declarar cuántas se hicieron de verdad.
 */
function scrub(text, secrets, preserve, stats) {
  if (text == null) return text;
  let v = String(text);
  const preserveSet = preserve instanceof Set ? preserve : new Set(preserve || []);
  const bump = (n) => { if (stats && n) stats.n = (stats.n || 0) + n; };
  if (secrets && secrets.length) {
    for (const s of secrets) {
      if (!s || s.length < 3 || preserveSet.has(s)) continue;
      const parts = v.split(s);
      if (parts.length > 1) { bump(parts.length - 1); v = parts.join(REDACTED); }
    }
  }
  // scheme://user:pass@host
  v = v.replace(/\b([a-zA-Z][\w+.\-]*:\/\/)[^\s/@:]+:[^\s/@]*@/g, (m, g1) => { bump(1); return `${g1}${REDACTED}:${REDACTED}@`; });
  // Xtream: scheme://host/live/USER/PASS/ID.ext  (o /USER/PASS/ID.ext)
  v = v.replace(/\b([a-zA-Z][\w+.\-]*:\/\/[^\s/:]+(?::\d+)?\/(?:live|movie|series|timeshift)\/)[^\s/]+\/[^\s/]+/g,
    (m, g1) => { bump(1); return `${g1}${USER_TAG}/${PASS_TAG}`; });
  // tokens JWT
  v = v.replace(/\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g, () => { bump(1); return REDACTED; });
  v = v.replace(/\bBearer\s+[A-Za-z0-9._\-]{8,}/gi, () => { bump(1); return `Bearer ${REDACTED}`; });
  // valores largos hex con pinta de clave (>=32), nunca los hashes propios del informe
  v = v.replace(/\b[A-Fa-f0-9]{32,}\b/g, (m) => (preserveSet.has(m) ? m : (bump(1), REDACTED)));
  return v;
}

/** Clasifica una URI: host, plantilla y par de credenciales, sin guardar la URI real. */
function uriProfile(uri) {
  const m = /^([a-zA-Z][\w+.\-]*):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/.exec(uri);
  if (!m) return { scheme: '(sin esquema)', host: '', template: '(forma no-URL)', pair: null };
  const [, scheme, host, pathOnly, query] = m;
  const segs = pathOnly.split('/').filter(Boolean);
  let pair = null;
  let tmplSegs = segs.slice();
  // Xtream / live-style: el par user/pass son los dos segmentos previos al nombre de archivo.
  // Se ignoran los marcadores ya anonimizados (<USER>/<PASS>) para no contarlos como credencial.
  if (segs.length >= 3) {
    const user = segs[segs.length - 3];
    const pass = segs[segs.length - 2];
    const placeholder = (s) => !s || /^<.*>$/.test(s);
    if (user && pass && !/^\d+$/.test(user) && !placeholder(user) && !placeholder(pass)) {
      pair = `${user}\u0000${pass}`;
      tmplSegs[segs.length - 3] = USER_TAG;
      tmplSegs[segs.length - 2] = PASS_TAG;
    }
  }
  const template = `${scheme}://${HOST_TAG}/${tmplSegs.join('/')}${query ? '?<QUERY>' : ''}`;
  return { scheme, host, template, pair };
}

/* ────────────────────────────────────────────────────── parseo de tags */

const T_TAG = /^#[A-Za-z0-9_.\-]+/;

function tagNameOf(line) {
  const m = T_TAG.exec(line);
  return m ? m[0] : null;
}

/**
 * Parsea una lista de atributos KEY=VALUE separada por comas, respetando comillas
 * (RFC 8216 §4.2 / M3U Plus). Devuelve Map<string,string>.
 */
function parseAttrList(s) {
  const out = new Map();
  if (!s) return out;
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && (s[i] === ',' || s[i] === ' ')) i++;
    const keyStart = i;
    while (i < n && s[i] !== '=' && s[i] !== ',') i++;
    if (i >= n) { if (i > keyStart) out.set(s.slice(keyStart, i).trim(), ''); break; }
    if (s[i] === ',') { const k = s.slice(keyStart, i).trim(); if (k) out.set(k, ''); i++; continue; }
    const key = s.slice(keyStart, i).trim();
    i++; // '='
    let val;
    if (s[i] === '"') {
      i++;
      const vs = i;
      while (i < n && s[i] !== '"') i++;
      val = s.slice(vs, i);
      i++; // cierre
      while (i < n && s[i] !== ',') i++; // basura hasta la coma
      if (i < n) i++;
    } else {
      const vs = i;
      while (i < n && s[i] !== ',') i++;
      val = s.slice(vs, i).trim();
      if (i < n) i++;
    }
    if (key) out.set(key, val);
  }
  return out;
}

/**
 * Parsea los atributos de `#EXTINF` — en M3U Plus van separados por ESPACIOS
 * (`tvg-id="x" group-title="a b" ape-profile="P3"`), no por comas como en HLS.
 * Respeta las comillas, incluidas las comas y espacios que viven dentro del valor.
 */
function parseExtinfAttrs(s) {
  const out = new Map();
  if (!s) return out;
  const tokens = [];
  let cur = '';
  let inQuote = false;
  for (const ch of s) {
    if (ch === '"') { inQuote = !inQuote; cur += ch; continue; }
    if (!inQuote && /\s/.test(ch)) { if (cur) { tokens.push(cur); cur = ''; } continue; }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  for (const t of tokens) {
    const eq = t.indexOf('=');
    if (eq < 0) { out.set(t, ''); continue; }
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) val = val.slice(1, -1);
    if (key) out.set(key, val);
  }
  return out;
}

/** Parte una cadena de filtros por comas de NIVEL SUPERIOR (respeta paréntesis/corchetes/llaves). */function splitTopLevel(chain, sep = ',') {
  const parts = [];
  let depth = 0;
  let cur = '';
  let inQuote = null;
  for (const ch of chain) {
    if (inQuote) { cur += ch; if (ch === inQuote) inQuote = null; continue; }
    if (ch === '"' || ch === "'") { inQuote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Extrae [{filter, params:Map}] de una cadena estilo ffmpeg: name=k:v:name2=k. */
function parseFilterChain(chain) {
  return splitTopLevel(chain, ',').map((part) => {
    const params = new Map();
    const braceAt = part.indexOf('{');
    const eqAt = part.indexOf('=');
    // Gramática VLC: modulo{opt=val,opt2=val2}
    if (braceAt >= 0 && (eqAt < 0 || braceAt < eqAt)) {
      const name = part.slice(0, braceAt).trim();
      const close = part.lastIndexOf('}');
      const inner = part.slice(braceAt + 1, close > braceAt ? close : undefined);
      for (const opt of splitTopLevel(inner, ',')) {
        const eq = opt.indexOf('=');
        if (eq < 0) { if (opt.trim()) params.set(opt.trim(), ''); }
        else params.set(opt.slice(0, eq).trim(), opt.slice(eq + 1).trim());
      }
      const tail = close > braceAt ? part.slice(close + 1).trim() : '';
      if (tail) { const e2 = tail.indexOf('='); if (e2 > 0) params.set(tail.slice(0, e2).trim(), tail.slice(e2 + 1).trim()); }
      return { filter: name, params };
    }
    // Gramática ffmpeg: nombre=p1=v1:p2=v2  (el nombre acaba en el PRIMER '=')
    if (eqAt < 0) return { filter: part.trim(), params };
    const name = part.slice(0, eqAt).trim();
    const rest = part.slice(eqAt + 1);
    for (const s of splitTopLevel(rest, ':')) {
      const eq = s.indexOf('=');
      if (eq < 0) { if (s.trim()) params.set(s.trim(), ''); }
      else params.set(s.slice(0, eq).trim(), s.slice(eq + 1).trim());
    }
    return { filter: name, params };
  }).filter((f) => f.filter);
}

/* ═══════════════════════════════════════════════ tablas doctrinales */

/**
 * Etapas de imagen (9) y los filtros ffmpeg que caen en cada una.
 * Fuente: docs/cartography/APE_LISTA_523d52a6/04_LANE_CAPABILITY_MATRIX.md §1 (las 9 columnas).
 */
const STAGE_OF_FILTER = {
  yadif: 'deinterlace', bwdif: 'deinterlace', nnedi: 'deinterlace', deinterlace: 'deinterlace',
  estdif: 'deinterlace', w3fdif: 'deinterlace', idet: 'deinterlace',
  hqdn3d: 'denoise', nlmeans: 'denoise', atadenoise: 'denoise', fftdnoiz: 'denoise',
  owdenoise: 'denoise', dctdnoiz: 'denoise', vaguedenoiser: 'denoise', removegrain: 'denoise',
  scale: 'scaling', scale2ref: 'scaling', zscale: 'color_hdr', sr: 'scaling', dnn_processing: 'scaling',
  colorspace: 'color_hdr', setparams: 'color_hdr', format: 'bitdepth', libplacebo: 'color_hdr',
  tonemap: 'tonemapping', tonemap_opencl: 'tonemapping', tonemap_vaapi: 'tonemapping',
  unsharp: 'sharpening', cas: 'sharpening', sharpen: 'sharpening', smartblur: 'sharpening',
  gradfun: 'debanding', deband: 'debanding',
  minterpolate: 'motion_interp', fps: 'motion_interp', framerate: 'motion_interp', tblend: 'motion_interp',
  extractplanes: 'bitdepth', depth: 'bitdepth', 'pixelformat': 'bitdepth',
};

const STAGES = ['deinterlace', 'denoise', 'scaling', 'color_hdr', 'tonemapping', 'sharpening', 'debanding', 'motion_interp', 'bitdepth'];

/**
 * Módulos de filtro que EXISTEN en VLC (medido en 04 §5.1/§5.4 por strings del DLL + aviso
 * `option X is unknown`). Se usan para decidir si una etapa tiene motor real en VLC.
 */
const VLC_MODULES = {
  deinterlace: ['deinterlace'],
  denoise: ['hqdn3d'],
  debanding: ['gradfun'],
  sharpening: ['sharpen', 'postproc'],
  motion_interp: ['fps'],
  color_hdr: ['adjust'],
  scaling: [], tonemapping: [], bitdepth: [],
};

/**
 * Nombres que NO son módulos de VLC (medido: 18 `no video filter modules matched` por nombre).
 * 04 §5.3.
 */
const VLC_NOT_MODULES = ['nlmeans', 'bwdif', 'yadif', 'zscale', 'minterpolate', 'unsharp', 'cas',
  'libplacebo', 'pp', 'scale', 'ffmpeg', 'tonemap'];

/**
 * Matriz runtime × etapa. `verdict` = capacidad del runtime; `verdict_playlist` = lo que consigue
 * el tag de playlist. Códigos: N nativo · P plugin/daemon · D declarativo · I imposible.
 * Calidad de evidencia: m medido · r registro/arquitectura documentada · s ausencia documentada · x no medido.
 * Fuente: docs/cartography/APE_LISTA_523d52a6/04_LANE_CAPABILITY_MATRIX.md §1 (heredado).
 */
const RUNTIME_TABLE = {
  'VLC 3.x': {
    deinterlace: ['N', 'm'], denoise: ['N', 'm'], scaling: ['I', 'm'], color_hdr: ['D', 'm'],
    tonemapping: ['D', 'm'], sharpening: ['N', 'm'], debanding: ['N', 'm'], motion_interp: ['I', 'm'], bitdepth: ['I', 'm'],
    from_playlist: { deinterlace: ['D', 'm'], denoise: ['D', 'm'], sharpening: ['D', 'm'], debanding: ['D', 'm'], scaling: ['I', 'm'], color_hdr: ['D', 'm'], tonemapping: ['D', 'm'], motion_interp: ['I', 'm'], bitdepth: ['I', 'm'] },
  },
  'VLC 4.x': {
    _all: ['D', 'x'], from_playlist_all: ['D', 'x'],
    _overrides: { motion_interp: ['I', 's'], bitdepth: ['I', 's'] },
  },
  'OTT Navigator': { _all: ['D', 's'], from_playlist_all: ['D', 's'], _overrides: { motion_interp: ['I', 's'], bitdepth: ['I', 's'] } },
  'TiviMate': { _all: ['D', 's'], from_playlist_all: ['D', 's'], _overrides: { motion_interp: ['I', 's'], bitdepth: ['I', 's'] } },
  'ExoPlayer / Media3': { _all: ['D', 's'], from_playlist_all: ['D', 's'], _overrides: { motion_interp: ['I', 's'], bitdepth: ['I', 's'] } },
  'Kodi + ISA': { _all: ['D', 's'], from_playlist_all: ['D', 's'], _overrides: { motion_interp: ['I', 's'], bitdepth: ['I', 's'] } },
  'hls.js (navegador)': { _all: ['D', 's'], from_playlist_all: ['D', 's'], _overrides: { motion_interp: ['I', 's'], bitdepth: ['I', 's'] } },
  'VPS/Lua (rebase-only)': {
    _all: ['I', 'r'], from_playlist_all: ['I', 'r'],
    _overrides: { color_hdr: ['D', 'r'] },
  },
  'ARA / VPP del SoC': {
    _all: ['I', 'r'],
    _overrides: { denoise: ['P', 'r'], scaling: ['P', 'r'], color_hdr: ['P', 'r'], sharpening: ['P', 'r'] },
    from_playlist_all: ['D', 's'],
  },
};

/** Los 6 headers tóxicos de la doctrina (CLAUDE.md → "Headers PROHIBIDOS"). */
const TOXIC_HEADERS = ['range', 'if-none-match', 'if-modified-since', 'te', 'priority', 'upgrade-insecure-requests'];
/** Lookalikes que NO son el header tóxico. */
const TOXIC_LOOKALIKES = ['x-priority', 'x-qos-priority'];
/** Nombres de header que transportarían credenciales. */
const CREDENTIAL_HEADERS = ['authorization', 'proxy-authorization', 'cookie', 'set-cookie',
  'x-api-key', 'x-auth-token', 'x-emby-token', 'www-authenticate'];

/* ═════════════════════════════════════════════ ffmpeg: rangos reales */

function ffmpegVersion(bin) {
  const r = spawnSync(bin, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 20000 });
  if (r.error || r.status !== 0) return null;
  const line = String(r.stdout || '').split(/\r?\n/)[0] || '';
  return line.trim() || null;
}

/**
 * Consulta `ffmpeg -h filter=NAME` y devuelve el mapa de parámetros con su rango/enum REALES
 * del binario instalado. Sin tabla hardcodeada: la verdad la dice el ffmpeg de esta máquina.
 * Devuelve null si el filtro no existe o ffmpeg falla.
 */
function ffmpegFilterHelp(bin, filter) {
  const r = spawnSync(bin, ['-hide_banner', '-h', `filter=${filter}`], { encoding: 'utf8', timeout: 20000 });
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.error) return { error: String(r.error.message || r.error) };
  if (/Unknown filter/i.test(text) || !/filter|AVOptions|→/i.test(text)) return { error: 'filtro inexistente o sin AVOptions' };
  const params = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^\s{2,}([A-Za-z0-9_.\-]+)\s+<([a-zA-Z_]+)>\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, name, type, rest] = m;
    const info = { type, raw: rest.trim() };
    const range = /\(from\s+(-?[\d.eE+]+)\s+to\s+(-?[\d.eE+]+)\)/.exec(rest);
    if (range) { info.min = Number(range[1]); info.max = Number(range[2]); }
    const def = /\(default\s+([^)]*)\)/.exec(rest);
    if (def) info.default = def[1].trim();
    // enum: líneas siguientes con "nombre  valor" hasta el próximo parámetro
    const enums = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
      if (/^\s{2,}[A-Za-z0-9_.\-]+\s+<[a-zA-Z]+>/.test(lines[j])) break;
      const e = /^\s{4,}([A-Za-z0-9_\-]+)\s+(-?\d+)\s/.exec(lines[j]);
      if (e) enums.push(e[1]);
    }
    if (enums.length) info.enums = enums;
    params.set(name, info);
  }
  if (!params.size) return { error: 'ffmpeg -h no expone parámetros para este filtro' };
  return { params };
}

/**
 * Valida una cadena contra el help real de ffmpeg: nombre de filtro, nombre de parámetro y
 * rango/enum. NO sustituye la ejecución (validate_filter_chain.js): los parámetros de tipo
 * string con validación interna (p. ej. las constantes de zscale) quedan "no verificable aquí".
 */
function validateChainSyntax(chain, helpCache, bin) {
  const filters = parseFilterChain(chain);
  const violations = [];
  const unverifiable = [];
  for (const f of filters) {
    if (!f.filter) continue;
    let help = helpCache.get(f.filter);
    if (help === undefined) {
      help = ffmpegFilterHelp(bin, f.filter);
      helpCache.set(f.filter, help);
    }
    if (help.error) {
      violations.push({ filter: f.filter, param: null, kind: 'filtro_desconocido', detail: help.error });
      continue;
    }
    for (const [p, v] of f.params) {
      const info = help.params.get(p);
      if (!info) {
        violations.push({ filter: f.filter, param: p, kind: 'parametro_desconocido', detail: `no está en ffmpeg -h filter=${f.filter}` });
        continue;
      }
      if (info.min !== undefined && info.max !== undefined) {
        if (/^-?\d+(\.\d+)?$/.test(v)) {
          const num = Number(v);
          if (num < info.min || num > info.max) {
            violations.push({
              filter: f.filter, param: p, kind: 'fuera_de_rango', value: v,
              detail: `rango real [${info.min} .. ${info.max}] (ffmpeg -h filter=${f.filter})`,
            });
          }
        } else {
          // valor simbólico sobre parámetro numérico: las constantes con nombre las resuelve
          // el propio filtro en ejecución, no el AVOption. Se difiere al validador de ejecución.
          unverifiable.push({ filter: f.filter, param: p, value: v, type: info.type, why: 'valor simbólico sobre parámetro <int>' });
        }
      } else {
        unverifiable.push({ filter: f.filter, param: p, value: v, type: info.type, why: 'tipo string: lo resuelve el filtro al ejecutar' });
      }
    }
  }
  return { filters: filters.map((f) => f.filter), violations, unverifiable };
}

/* ══════════════════════════════════════════════ lector en streaming */

/**
 * Recorre el archivo en chunks, mantiene el hash SHA-256, valida UTF-8 de forma estricta y
 * entrega líneas SIN '\r'. No acumula el archivo: solo el resto de la línea actual.
 */
async function* readLines(file) {
  const hash = crypto.createHash('sha256');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let nonAscii = 0;
  let utf8Errors = 0;
  let utf8ErrorSample = null;
  let crlf = 0;
  let maxLineLen = 0;
  let maxLineNo = 0;
  let lineNo = 0;
  let endsWithNewline = false;
  let carry = '';
  let chunkIndex = 0;

  const stream = fs.createReadStream(file, { highWaterMark: CHUNK });
  for await (const buf of stream) {
    chunkIndex++;
    bytes += buf.length;
    hash.update(buf);
    for (let i = 0; i < buf.length; i++) if (buf[i] >= 0x80) nonAscii++;
    let text;
    try {
      text = decoder.decode(buf, { stream: true });
    } catch (e) {
      utf8Errors++;
      if (!utf8ErrorSample) utf8ErrorSample = `chunk#${chunkIndex}: ${String(e.message || e).slice(0, 120)}`;
      text = Buffer.from(buf).toString('utf8'); // sustitución, se declara
    }
    endsWithNewline = text.length > 0 ? text.endsWith('\n') : endsWithNewline;
    if (!text) continue;
    carry += text;
    let start = 0;
    for (;;) {
      const nl = carry.indexOf('\n', start);
      if (nl < 0) break;
      let line = carry.slice(start, nl);
      if (line.endsWith('\r')) { crlf++; line = line.slice(0, -1); }
      lineNo++;
      if (line.length > maxLineLen) { maxLineLen = line.length; maxLineNo = lineNo; }
      yield { line, lineNo };
      start = nl + 1;
    }
    carry = start ? carry.slice(start) : carry;
    if (carry.length > 64 * 1024 * 1024) throw new Error('línea patológicamente larga (>64 MiB): abortado para no consumir memoria');
  }
  try { decoder.decode(); } catch (e) {
    utf8Errors++;
    if (!utf8ErrorSample) utf8ErrorSample = `flush: ${String(e.message || e).slice(0, 120)}`;
  }
  if (carry.length) {
    let line = carry;
    if (line.endsWith('\r')) { crlf++; line = line.slice(0, -1); }
    lineNo++;
    if (line.length > maxLineLen) { maxLineLen = line.length; maxLineNo = lineNo; }
    yield { line, lineNo };
  }
  yield {
    final: true,
    stats: {
      bytes,
      sha256: hash.digest('hex'),
      non_ascii_bytes: nonAscii,
      utf8_errors: utf8Errors,
      utf8_error_sample: utf8ErrorSample,
      crlf_lines: crlf,
      max_line_len: maxLineLen,
      max_line_len_line: maxLineNo,
      ends_with_newline: endsWithNewline,
    },
  };
}

/* ══════════════════════════════════════════════════ acumuladores */

function newAcc() {
  return {
    lines: 0,
    tagCounts: new Map(),
    tagFirstLine: new Map(),
    emptyLines: 0,
    emptyTail: [],          // distribución de vacías por bloque (muestra acotada)
    channels: [],
    headerLines: [],
    headerTagCounts: new Map(),
    uris: 0,
    uriHashes: new Set(),
    uriTemplates: new Map(),
    hosts: new Set(),
    logoHosts: new Set(),
    pairs: new Set(),
    schemeCounts: new Map(),
    streamIds: new Set(),
    // familias / vocabularios
    kodipropKeys: new Map(),
    extvlcoptKeys: new Map(),
    extattrKeys: new Map(),
    vfChains: new Map(),     // cadena exacta -> {count, profiles:Map, firstChannel}
    // hechos globales
    extXMap: 0,
    extXMedia: 0,
    apeChannelsDeclared: null,
    globalPartTarget: null,
    globalPartHoldBack: null,
    extXVersion: null,
    // estructuras pesadas
    exthttp: {
      occurrences: 0, valid: 0, invalid: 0, nonObject: 0,
      fieldCounts: [], byteSizes: [], fieldFrequency: new Map(),
      toxicHits: new Map(), lookalikeHits: new Map(), credentialHits: new Map(),
      bearerHits: 0, jwtHits: 0, invalidSamples: [],
    },
    overflow: {
      occurrences: 0, decoded: 0, invalid: 0, nonObject: 0,
      fieldCounts: [], byteSizes: [], fieldFrequency: new Map(), invalidSamples: [],
    },
    // vistas por canal que la matriz de coherencia necesita
    cross: {
      siKeys: [], siKeyCounts: new Map(), siCodecs: new Map(), siResolution: new Map(),
      siValues: new Map(),
      siVideoRange: new Map(), siFrameRate: new Map(), siBandwidth: [], siHdcpMissing: 0,
      siHdcpLevel: new Map(), siStableId: new Map(), siColorPrim: new Map(),
      iframeCodecs: new Map(),
      drTransfer: new Map(), drRange: new Map(), drBitDepth: new Map(), drChrom: new Map(),
      kodipropMaxRes: new Map(), kodipropVideoCodec: new Map(), kodipropHdr: new Map(),
      kodipropDrmType: new Map(),
      vlcCodec: new Map(), vlcHdrMode: new Map(), vlcHdrBool: new Map(),
      xapeCodecVideo: new Map(), xapeCmaf: new Map(), xapeResolutionQ: new Map(),
      cmafContainer: new Map(), cmafVersion: new Map(), cmafPartTarget: new Map(), cmafPartHoldBack: new Map(),
      vnovaBaseRes: new Map(),
      extinfAttrNames: new Map(), extinfDurations: new Map(), extinfForms: new Map(),
      // contradicciones
      c: {
        resolution_streaminf_vs_kodiprop: 0,
        pq_vs_vlchdr: 0,
        codec_hvc1_vs_vlch264: 0,
        iframe_level_below_streaminf: 0,
        xape_codec_below_streaminf: 0,
        cmaf_container_vs_fmp4: 0,
        cmaf_init_without_map: 0,
        cmaf_part_target_mismatch: 0,
        cmaf_part_holdback_mismatch: 0,
        version_vs_cmafversion: 0,
        parttarget_vs_cmaf: 0,
        vlc_adaptive_vs_kodiprop_res: 0,
        hdcp_missing: 0,
        golden_hvc1_in_kodiprop_or_vlc: 0,
        golden_hev1_in_streaminf: 0,
        rfc6381_in_kodiprop_or_vlc: 0,
      },
      // sub-esquemas
      kodipropFamilies: new Map(),
      extXVersionVal: new Map(),
    },
    // estructura de bloques
    blockSizes: [],
    linesAfterUri: [],
    profileOfChain: new Map(),
    profiles: new Map(),
    codecFamilies: new Map(),
    ffmpegStatus: null,
    sampledDetail: null,
    fixture: null,
  };
}

/* ─────────────────────────────────────────── análisis de un canal */

function closeChannel(acc, ch, lineNo) {
  if (!ch) return;
  ch.endLine = lineNo;
  ch.lines = ch.endLine - ch.startLine + 1;
  ch.linesAfterUri = ch.uriLine ? ch.endLine - ch.uriLine : 0;
  acc.blockSizes.push(ch.lines);
  acc.linesAfterUri.push(ch.linesAfterUri);
  acc.emptyTail.push(ch.empties);
  if (ch._exthttpRaw != null || ch._overflowRaw != null) analyzeHeavy(acc, ch);
  // liberar el texto crudo: es lo único grande que el acumulador tocaría por canal
  delete ch._exthttpRaw;
  delete ch._overflowRaw;
  acc.channels.push(ch);
}

/** Analiza las capas pesadas de un canal ya cerrado. Solo se llama en el canal actual. */
function analyzeHeavy(acc, ch) {
  // #EXTHTTP
  if (ch._exthttpRaw != null) {
    const raw = ch._exthttpRaw;
    const e = acc.exthttp;
    e.occurrences++;
    e.byteSizes.push(Buffer.byteLength(raw, 'utf8'));
    try {
      const obj = JSON.parse(raw);
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        e.nonObject++;
      } else {
        e.valid++;
        const keys = Object.keys(obj);
        e.fieldCounts.push(keys.length);
        for (const k of keys) {
          e.fieldFrequency.set(k, (e.fieldFrequency.get(k) || 0) + 1);
          const lk = k.toLowerCase();
          if (TOXIC_HEADERS.includes(lk)) e.toxicHits.set(k, (e.toxicHits.get(k) || 0) + 1);
          if (TOXIC_LOOKALIKES.includes(lk)) e.lookalikeHits.set(k, (e.lookalikeHits.get(k) || 0) + 1);
          if (CREDENTIAL_HEADERS.includes(lk)) e.credentialHits.set(k, (e.credentialHits.get(k) || 0) + 1);
          const v = obj[k];
          if (typeof v === 'string') {
            if (/^Bearer\s+\S+/i.test(v)) e.bearerHits++;
            if (/eyJ[A-Za-z0-9_\-]{8,}\./.test(v)) e.jwtHits++;
          }
        }
        ch.exthttp = { ok: true, fields: keys.length };
        if (Object.prototype.hasOwnProperty.call(obj, 'X-APE-Codec-Video')) ch.xapeCodecVideo = String(obj['X-APE-Codec-Video']);
        if (Object.prototype.hasOwnProperty.call(obj, 'X-APE-CMAF')) ch.xapeCmaf = String(obj['X-APE-CMAF']);
        if (Object.prototype.hasOwnProperty.call(obj, 'X-APE-Resolution-Q')) ch.xapeResolutionQ = String(obj['X-APE-Resolution-Q']);
      }
    } catch (err) {
      e.invalid++;
      if (e.invalidSamples.length < 5) e.invalidSamples.push(String(err.message || err).slice(0, 120));
      ch.exthttp = { ok: false, fields: null };
    }
  }
  // overflow base64
  if (ch._overflowRaw != null) {
    const e = acc.overflow;
    e.occurrences++;
    try {
      const decoded = Buffer.from(ch._overflowRaw, 'base64').toString('utf8');
      e.byteSizes.push(Buffer.byteLength(decoded, 'utf8'));
      const obj = JSON.parse(decoded);
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) e.nonObject++;
      else {
        e.decoded++;
        const keys = Object.keys(obj);
        e.fieldCounts.push(keys.length);
        for (const k of keys) {
          e.fieldFrequency.set(k, (e.fieldFrequency.get(k) || 0) + 1);
          const lk = k.toLowerCase();
          if (TOXIC_HEADERS.includes(lk)) acc.exthttp.toxicHits.set(k, (acc.exthttp.toxicHits.get(k) || 0) + 1);
          if (TOXIC_LOOKALIKES.includes(lk)) acc.exthttp.lookalikeHits.set(k, (acc.exthttp.lookalikeHits.get(k) || 0) + 1);
          if (CREDENTIAL_HEADERS.includes(lk)) acc.exthttp.credentialHits.set(k, (acc.exthttp.credentialHits.get(k) || 0) + 1);
        }
      }
    } catch (err) {
      e.invalid++;
      if (e.invalidSamples.length < 5) e.invalidSamples.push(String(err.message || err).slice(0, 120));
    }
  }
}

/* ─────────────────────────────────── registro por línea (una pasada) */

const LINE_KINDS = { tag: 0, uri: 0, empty: 0 };

/**
 * Procesa una línea. `heavy` controla si se hace el trabajo caro (JSON/base64) en este canal.
 * Devuelve el canal en curso (puede cambiar al abrir uno nuevo).
 */
function handleLine(acc, line, lineNo, ch, heavy) {
  acc.lines++;
  if (line.length === 0) {
    acc.emptyLines++;
    if (ch) ch.empties++;
    return ch;
  }
  if (line[0] !== '#') {
    // URI
    acc.uris++;
    const p = uriProfile(line);
    acc.uriHashes.add(sha(line, 16));
    acc.uriTemplates.set(p.template, (acc.uriTemplates.get(p.template) || 0) + 1);
    acc.schemeCounts.set(p.scheme, (acc.schemeCounts.get(p.scheme) || 0) + 1);
    if (p.host) acc.hosts.add(p.host);
    if (p.pair) acc.pairs.add(p.pair);
    const fname = line.slice(line.lastIndexOf('/') + 1).split('?')[0];
    if (fname) acc.streamIds.add(sha(fname, 12));
    if (ch) {
      ch.uriLine = lineNo;
      if (!ch.uriTemplate) ch.uriTemplate = p.template;
    }
    return ch;
  }

  const tag = tagNameOf(line);
  if (!tag) return ch;
  acc.tagCounts.set(tag, (acc.tagCounts.get(tag) || 0) + 1);
  if (!acc.tagFirstLine.has(tag)) acc.tagFirstLine.set(tag, lineNo);
  if (!ch && tag !== '#EXTINF') {
    acc.headerLines.push(lineNo);
    acc.headerTagCounts.set(tag, (acc.headerTagCounts.get(tag) || 0) + 1);
  }

  switch (tag) {
    case '#EXTINF': {
      closeChannel(acc, ch, lineNo - 1);
      ch = {
        idx: acc.channels.length + 1, startLine: lineNo, endLine: lineNo, lines: 0,
        uriLine: null, linesAfterUri: 0, empties: 0, uriTemplate: null,
        profile: null, codecFamily: null, fps: null, keys: null,
        _exthttpRaw: null, _overflowRaw: null,
      };
      const after = line.slice('#EXTINF:'.length);
      const sp = after.indexOf(' ');
      const comma = (() => {
        let inQ = false;
        for (let i = 0; i < after.length; i++) {
          const c = after[i];
          if (c === '"') inQ = !inQ;
          else if (c === ',' && !inQ) return i;
        }
        return -1;
      })();
      ch.duration = sp > 0 ? after.slice(0, sp) : after;
      ch.form = comma > 0 ? (after.includes('=') ? 'attrs|name' : 'name') : 'name';
      const attrs = comma > 0 ? parseExtinfAttrs(after.slice(sp + 1, comma)) : new Map();
      ch.attrCount = attrs.size;
      for (const [k, v] of attrs) {
        acc.cross.extinfAttrNames.set(k, (acc.cross.extinfAttrNames.get(k) || 0) + 1);
        if (k === 'ape-profile' || k === 'ape-codec-family' || k === 'ape-fps') {
          ch[k === 'ape-profile' ? 'profile' : k === 'ape-fps' ? 'fps' : 'codecFamily'] = v;
        }
      }
      acc.cross.extinfDurations.set(ch.duration, (acc.cross.extinfDurations.get(ch.duration) || 0) + 1);
      {
        const logo = attrs.get('tvg-logo');
        if (logo) { const lh = /^[a-z][\w+.\-]*:\/\/([^/?#]+)/i.exec(logo); if (lh) acc.logoHosts.add(lh[1]); }
      }
      acc.cross.extinfForms.set(ch.form, (acc.cross.extinfForms.get(ch.form) || 0) + 1);
      if (ch.profile) acc.profiles.set(ch.profile, (acc.profiles.get(ch.profile) || 0) + 1);
      if (ch.codecFamily) acc.codecFamilies.set(ch.codecFamily, (acc.codecFamilies.get(ch.codecFamily) || 0) + 1);
      return ch;
    }

    case '#EXT-X-STREAM-INF': {
      const attrs = parseAttrList(line.slice('#EXT-X-STREAM-INF:'.length));
      if (ch) ch.keys = attrs.size;
      for (const k of attrs.keys()) acc.cross.siKeys.push(k);
      acc.cross.siKeyCounts.set(attrs.size, (acc.cross.siKeyCounts.get(attrs.size) || 0) + 1);
      // valores por clave, con cardinalidad acotada (STABLE-VARIANT-ID es único por canal)
      for (const [k, v] of attrs) {
        let rec = acc.cross.siValues.get(k);
        if (!rec) { rec = { counts: new Map(), overflow: false }; acc.cross.siValues.set(k, rec); }
        if (!rec.overflow && v !== '') {
          rec.counts.set(v, (rec.counts.get(v) || 0) + 1);
          if (rec.counts.size > 64) { rec.overflow = true; rec.counts.clear(); }
        }
      }
      const bump = (m, v) => { if (v != null && v !== '') m.set(v, (m.get(v) || 0) + 1); };
      bump(acc.cross.siCodecs, attrs.get('CODECS'));
      bump(acc.cross.siResolution, attrs.get('RESOLUTION'));
      bump(acc.cross.siVideoRange, attrs.get('VIDEO-RANGE'));
      bump(acc.cross.siFrameRate, attrs.get('FRAME-RATE'));
      bump(acc.cross.siHdcpLevel, attrs.get('HDCP-LEVEL'));
      bump(acc.cross.siStableId, attrs.get('STABLE-VARIANT-ID'));
      bump(acc.cross.siColorPrim, attrs.get('COLOR-PRIMARIES'));
      const bw = attrs.get('BANDWIDTH');
      if (bw && /^\d+$/.test(bw)) acc.cross.siBandwidth.push(Number(bw));
      if (!attrs.has('HDCP-LEVEL')) acc.cross.siHdcpMissing++;
      if (ch) ch.si = {
        codecs: attrs.get('CODECS') || null,
        resolution: attrs.get('RESOLUTION') || null,
        videoRange: attrs.get('VIDEO-RANGE') || null,
        hdcp: attrs.get('HDCP-LEVEL') || null,
      };
      return ch;
    }

    case '#EXT-X-I-FRAME-STREAM-INF': {
      const attrs = parseAttrList(line.slice('#EXT-X-I-FRAME-STREAM-INF:'.length));
      const c = attrs.get('CODECS');
      if (c) acc.cross.iframeCodecs.set(c, (acc.cross.iframeCodecs.get(c) || 0) + 1);
      if (ch) ch.iframeCodecs = c || null;
      return ch;
    }

    case '#EXT-X-DATERANGE': {
      const attrs = parseAttrList(line.slice('#EXT-X-DATERANGE:'.length));
      const bump = (m, v) => { if (v != null && v !== '') m.set(v, (m.get(v) || 0) + 1); };
      bump(acc.cross.drTransfer, attrs.get('X-COLOR-TRANSFER'));
      bump(acc.cross.drRange, attrs.get('X-HDR-TYPE'));
      bump(acc.cross.drBitDepth, attrs.get('X-BIT-DEPTH'));
      bump(acc.cross.drChrom, attrs.get('X-CHROMA-SUBSAMPLING'));
      if (ch) ch.dr = { transfer: attrs.get('X-COLOR-TRANSFER') || null, hdrType: attrs.get('X-HDR-TYPE') || null };
      return ch;
    }

    case '#EXT-X-MAP': acc.extXMap++; return ch;
    case '#EXT-X-MEDIA': acc.extXMedia++; return ch;
    case '#EXT-X-VERSION': {
      const v = line.slice('#EXT-X-VERSION:'.length).trim();
      if (!acc.extXVersion) acc.extXVersion = v;
      acc.cross.extXVersionVal.set(v, (acc.cross.extXVersionVal.get(v) || 0) + 1);
      return ch;
    }

    case '#EXTHTTP': {
      if (heavy && ch) ch._exthttpRaw = line.slice('#EXTHTTP:'.length);
      return ch;
    }
    case '#EXT-X-APE-OVERFLOW-HEADERS': {
      if (heavy && ch) ch._overflowRaw = line.slice('#EXT-X-APE-OVERFLOW-HEADERS:'.length);
      return ch;
    }
    case '#EXT-X-APE-CHANNELS': {
      if (acc.apeChannelsDeclared == null) acc.apeChannelsDeclared = Number(line.split(':').slice(1).join(':').trim());
      return ch;
    }

    case '#KODIPROP': {
      const body = line.slice('#KODIPROP:'.length);
      const eq = body.indexOf('=');
      const key = eq < 0 ? body.trim() : body.slice(0, eq).trim();
      const val = eq < 0 ? '' : body.slice(eq + 1);
      acc.kodipropKeys.set(key, (acc.kodipropKeys.get(key) || 0) + 1);
      const fam = key.includes('.') ? key.split('.').slice(0, 2).join('.') : key;
      acc.cross.kodipropFamilies.set(fam, (acc.cross.kodipropFamilies.get(fam) || 0) + 1);
      const bump = (m, v) => { if (v) m.set(v, (m.get(v) || 0) + 1); };
      if (key.endsWith('max_resolution')) bump(acc.cross.kodipropMaxRes, val);
      if (key.endsWith('video_codec')) bump(acc.cross.kodipropVideoCodec, val);
      if (key.endsWith('hdr_type') || key === 'inputstream.adaptive.hdr_type') bump(acc.cross.kodipropHdr, val);
      if (key.endsWith('drm_type')) bump(acc.cross.kodipropDrmType, val);
      if (/^hvc1\./.test(val) || /^hev1\./.test(val)) {
        if (/^hvc1\./.test(val)) acc.cross.c.golden_hvc1_in_kodiprop_or_vlc++;
        if (ch) ch.rfc6381inKodi = true;
      }
      if (ch && key.endsWith('max_resolution')) ch.kodipropMaxRes = val;
      if (ch && key.endsWith('video_codec')) ch.kodipropVideoCodec = val;
      return ch;
    }

    case '#EXTVLCOPT': {
      const body = line.slice('#EXTVLCOPT:'.length);
      const eq = body.indexOf('=');
      const key = eq < 0 ? body.trim() : body.slice(0, eq).trim();
      const val = eq < 0 ? '' : body.slice(eq + 1);
      acc.extvlcoptKeys.set(key, (acc.extvlcoptKeys.get(key) || 0) + 1);
      if (key === 'video-filter') {
        let rec = acc.vfChains.get(val);
        if (!rec) { rec = { count: 0, profiles: new Map(), firstChannel: ch ? ch.idx : null }; acc.vfChains.set(val, rec); }
        rec.count++;
        const p = ch && ch.profile ? ch.profile : '(sin_canal)';
        rec.profiles.set(p, (rec.profiles.get(p) || 0) + 1);
        if (ch) ch.vfChain = val;
      }
      const bump = (m, v) => { if (v) m.set(v, (m.get(v) || 0) + 1); };
      if (key === 'codec') { if (ch) ch.vlcCodec = val; bump(acc.cross.vlcCodec, val); }
      if (key === 'video-hdr-mode') { if (ch) ch.vlcHdrMode = val; bump(acc.cross.vlcHdrMode, val); }
      if (key === 'video-hdr') { if (ch) ch.vlcHdrBool = val; bump(acc.cross.vlcHdrBool, val); }
      if (key === 'adaptive-maxwidth' && ch) ch.vlcMaxWidth = val;
      if (/^hvc1\./.test(val) || /^hev1\./.test(val)) {
        if (/^hvc1\./.test(val)) acc.cross.c.golden_hvc1_in_kodiprop_or_vlc++;
        if (ch) ch.rfc6381inVlc = true;
      }
      return ch;
    }

    case '#EXTATTRFROMURL': {
      const body = line.slice('#EXTATTRFROMURL:'.length);
      const eq = body.indexOf('=');
      const key = eq < 0 ? body.trim() : body.slice(0, eq).trim();
      acc.extattrKeys.set(key, (acc.extattrKeys.get(key) || 0) + 1);
      return ch;
    }

    /* familias propietarias: el conteo ya lo lleva tagCounts; aquí solo valores de interés */
    case '#EXT-X-CMAF-CONTAINER': {
      const v = line.slice(line.indexOf(':') + 1).trim(); bumpOnce(acc.cross.cmafContainer, v); if (ch) ch.cmafContainer = v; return ch;
    }
    case '#EXT-X-CMAF-VERSION': {
      const v = line.slice(line.indexOf(':') + 1).trim(); bumpOnce(acc.cross.cmafVersion, v); if (ch) ch.cmafVersion = v; return ch;
    }
    case '#EXT-X-CMAF-PART-TARGET': {
      const v = line.slice(line.indexOf(':') + 1).trim(); bumpOnce(acc.cross.cmafPartTarget, v); if (ch) ch.cmafPartTarget = v; return ch;
    }
    case '#EXT-X-CMAF-PART-HOLD-BACK': {
      const v = line.slice(line.indexOf(':') + 1).trim(); bumpOnce(acc.cross.cmafPartHoldBack, v); if (ch) ch.cmafPartHoldBack = v; return ch;
    }
    case '#EXT-X-CMAF-INIT-SEGMENT': if (ch) ch.cmafInitSegment = true; return ch;
    case '#EXT-X-PART-INF': {
      const at = parseAttrList(line.slice('#EXT-X-PART-INF:'.length));
      const v = at.get('PART-TARGET') || null;
      if (ch) ch.partTarget = v; else if (v && !acc.globalPartTarget) acc.globalPartTarget = v;
      return ch;
    }
    case '#EXT-X-SERVER-CONTROL': {
      const at = parseAttrList(line.slice('#EXT-X-SERVER-CONTROL:'.length));
      const v = at.get('PART-HOLD-BACK') || null;
      if (ch) ch.partHoldBack = v; else if (v && !acc.globalPartHoldBack) acc.globalPartHoldBack = v;
      return ch;
    }
    case '#EXT-X-VNOVA-LCEVC-BASE-RESOLUTION': bumpOnce(acc.cross.vnovaBaseRes, line.slice(line.indexOf(':') + 1).trim()); return ch;
    default: return ch;
  }
}

function bumpOnce(map, v) { if (v) map.set(v, (map.get(v) || 0) + 1); }

/* ════════════════════════════════════════ evaluación de coherencia */

/** Razón de nivel HEVC (L153 > L150 > L123 > L93) para comparar declaraciones. */
function hevcLevel(codecStr) {
  if (!codecStr) return null;
  const m = /(?:hvc1|hev1)\.[\d.]*?L(\d+)/.exec(codecStr);
  return m ? Number(m[1]) : null;
}

function evaluateCoherence(acc) {
  const c = acc.cross.c;
  const chs = acc.channels;
  for (const ch of chs) {
    // C1 resolución
    if (ch.si && ch.si.resolution && ch.kodipropMaxRes && ch.si.resolution !== ch.kodipropMaxRes) c.resolution_streaminf_vs_kodiprop++;
    // C2 PQ vs EXTVLCOPT SDR
    if (ch.si && ch.si.videoRange === 'PQ' && ((ch.vlcHdrMode && ch.vlcHdrMode !== 'PQ') || ch.vlcHdrBool === 'false')) c.pq_vs_vlchdr++;
    // C3 hvc1 vs codec=h264
    if (ch.si && ch.si.codecs && /hvc1|hev1/.test(ch.si.codecs) && ch.vlcCodec && !/hevc|hvc1|hev1/.test(ch.vlcCodec)) c.codec_hvc1_vs_vlch264++;
    // C4 nivel I-FRAME por debajo del de la variante
    const lvSi = hevcLevel(ch.si && ch.si.codecs);
    const lvIf = hevcLevel(ch.iframeCodecs);
    if (lvSi != null && lvIf != null && lvIf < lvSi) c.iframe_level_below_streaminf++;
    const lvX = hevcLevel(ch.xapeCodecVideo);
    if (lvSi != null && lvX != null && lvX < lvSi) c.xape_codec_below_streaminf++;
    // C6 la familia CMAF declara contenedor mientras NO existe #EXT-X-MAP
    if (acc.extXMap === 0 && ch.cmafContainer) c.cmaf_container_vs_fmp4++;
    // C11 init segment declarado por la familia sin el tag que lo define
    if (acc.extXMap === 0 && ch.cmafInitSegment) c.cmaf_init_without_map++;
    // C12 techo adaptativo vs kodiprop
    if (ch.vlcMaxWidth && ch.kodipropMaxRes) {
      const w = Number(ch.vlcMaxWidth);
      const kr = /(\d+)x(\d+)/.exec(ch.kodipropMaxRes);
      if (kr && w > Number(kr[1])) c.vlc_adaptive_vs_kodiprop_res++;
    }
  }
  // C7 / C8 / C9: el tag HLS real contra el declarado por la familia CMAF, por canal
  const realV = acc.extXVersion;
  for (const ch of chs) {
    if (realV && ch.cmafVersion && realV !== ch.cmafVersion) c.version_vs_cmafversion++;
    // #EXT-X-PART-INF / #EXT-X-SERVER-CONTROL viven en la CABECERA (valor global); se comparan
    // contra el valor que declara la familia CMAF en CADA canal.
    const pt = ch.partTarget || acc.globalPartTarget;
    const phb = ch.partHoldBack || acc.globalPartHoldBack;
    if (pt && ch.cmafPartTarget && pt !== ch.cmafPartTarget) c.cmaf_part_target_mismatch++;
    if (phb && ch.cmafPartHoldBack && phb !== ch.cmafPartHoldBack) c.cmaf_part_holdback_mismatch++;
  }
  // C13 HDCP ausente
  c.hdcp_missing = acc.cross.siHdcpMissing;
  // Golden rule: hev1 en STREAM-INF
  for (const ch of chs) if (ch.si && ch.si.codecs && /hev1\./.test(ch.si.codecs) && !/hvc1\./.test(ch.si.codecs)) c.golden_hev1_in_streaminf++;
  // RFC 6381 en capas que no lo emiten por diseño
  c.rfc6381_in_kodiprop_or_vlc = chs.filter((x) => x.rfc6381inKodi || x.rfc6381inVlc).length;
  return c;
}

/* ══════════════════════════════════════ matriz de capacidad por runtime */

function buildRuntimeMatrix(acc, env) {
  const stagesPresent = new Map();
  for (const rec of acc.vfChains.values()) {
    for (const st of rec.stages || []) stagesPresent.set(st, (stagesPresent.get(st) || 0) + 1);
  }
  const runtimes = Object.keys(RUNTIME_TABLE);
  const cells = [];
  for (const rt of runtimes) {
    const t = RUNTIME_TABLE[rt];
    for (const stage of STAGES) {
      let cell = t._all ? [...t._all] : (t[stage] ? [...t[stage]] : ['D', 's']);
      if (t._overrides && t._overrides[stage]) cell = [...t._overrides[stage]];
      let fromPl = t.from_playlist_all ? [...t.from_playlist_all] : (t.from_playlist && t.from_playlist[stage] ? [...t.from_playlist[stage]] : cell);
      const present = stagesPresent.has(stage);
      let verdict = present ? cell[0] : null;
      let evidence = present ? cell[1] : null;
      let state = 'declarado';
      let source = 'heredado:04_LANE_CAPABILITY_MATRIX.md§1';
      if (!present) { verdict = null; state = 'no_aplica'; }
      // Enriquecimiento medido por este run (inventario, no efecto)
      if (rt === 'VLC 3.x') {
        if (!env.vlc.present) { state = 'no_computado'; source = 'runtime ausente en esta máquina'; }
        else { state = 'heredado_citado'; source = `heredado:04 §4 (medido con VLC ${env.vlc.version || '?'})`; }
      }
      if (rt === 'VLC 4.x' && !env.vlc4.present) { state = 'no_computado'; source = 'sin binario VLC 4.x en esta máquina'; }
      if (rt === 'ARA / VPP del SoC') { state = 'declarado'; source = 'heredado:04 §6.8 (efecto en píxeles NO_VERIFICADO sin device)'; }
      cells.push({
        runtime: rt, stage,
        verdict, verdict_playlist: present ? fromPl[0] : null,
        evidence_quality: evidence, evidence_quality_playlist: present ? fromPl[1] : null,
        evidence_state: state, source,
      });
    }
  }
  return {
    legend: {
      verdict: { N: 'NATIVO', P: 'PLUGIN/DAEMON', D: 'DECLARATIVO (metadata inerte)', I: 'IMPOSIBLE' },
      evidence_quality: { m: 'medido', r: 'registro/arquitectura documentada', s: 'ausencia documentada de mecanismo', x: 'no medido' },
      evidence_state: ['declarado', 'observado', 'resuelto', 'heredado_citado', 'aplicado', 'verificado', 'no_computado', 'no_aplica'],
    },
    rows: runtimes,
    columns: STAGES,
    cells,
    counts: cells.reduce((a, c) => { const k = c.verdict || 'sin_cadena'; a[k] = (a[k] || 0) + 1; return a; }, {}),
  };
}

/* ══════════════════════════════════════ entorno: ffmpeg y VLC */

function detectEnvironment(opts) {
  const env = {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    ffmpeg: { present: false, bin: null, version: null, reason: null },
    vlc: { present: false, version: null, video_filter_plugins: null, avfilter_binaries: null, reason: null },
    vlc4: { present: false, reason: null },
  };

  if (opts.noFfmpeg) {
    env.ffmpeg.reason = 'desactivado con --no-ffmpeg';
  } else {
    const bin = opts.ffmpeg || 'ffmpeg';
    const ver = ffmpegVersion(bin);
    if (ver) { env.ffmpeg = { present: true, bin, version: ver, reason: null }; }
    else env.ffmpeg.reason = 'ffmpeg no encontrado en PATH (o falló -version)';
  }

  const vlcCandidates = process.platform === 'win32'
    ? [process.env.VLC_PATH, 'C:\\Program Files\\VideoLAN\\VLC', 'C:\\Program Files (x86)\\VideoLAN\\VLC'].filter(Boolean)
    : ['/usr/bin/vlc', '/usr/local/bin/vlc', '/Applications/VLC.app/Contents/MacOS'];
  for (const dir of vlcCandidates) {
    try {
      const vlcExe = fs.statSync(dir).isDirectory() ? path.join(dir, process.platform === 'win32' ? 'vlc.exe' : 'vlc') : dir;
      if (!fs.existsSync(vlcExe)) continue;
      // NO se invoca `vlc --version`: en Windows es una app GUI y bloquea la consola
      // (medido: >120 s sin retorno). La versión se toma de --vlc-version si el operador
      // la declara, o queda null y se reporta como no determinada.
      const pluginDir = path.join(path.dirname(vlcExe), 'plugins', 'video_filter');
      let plugins = null;
      if (fs.existsSync(pluginDir)) plugins = fs.readdirSync(pluginDir).filter((f) => f.endsWith('.dll') || f.endsWith('.so')).length;
      let avfilter = null;
      const root = path.dirname(vlcExe);
      try {
        const stack = [root];
        let scanned = 0;
        let hits = 0;
        while (stack.length && scanned < 20000) {
          const d = stack.pop();
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            scanned++;
            if (e.isDirectory()) stack.push(path.join(d, e.name));
            else if (/avfilter|ffmpeg/i.test(e.name)) hits++;
            if (scanned > 20000) break;
          }
        }
        avfilter = hits;
      } catch { avfilter = null; }
      env.vlc = {
        present: true,
        version: opts.vlcVersion || null,
        version_source: opts.vlcVersion ? 'declarada por el operador (--vlc-version)' : 'no determinada: `vlc --version` es una app GUI y bloquea la consola; usar --vlc-version',
        video_filter_plugins: plugins,
        avfilter_binaries: avfilter,
        exe: vlcExe,
        reason: null,
      };
      if (opts.vlcVersion && /^4\./.test(opts.vlcVersion)) env.vlc4 = { present: true, reason: null };
      break;
    } catch { /* siguiente candidato */ }
  }
  if (!env.vlc.present) env.vlc.reason = 'VLC no instalado o no localizable en las rutas estándar';
  if (!env.vlc4.present && !env.vlc4.reason) env.vlc4.reason = 'no hay binario VLC 4.x en esta máquina (fila de la matriz en grado x)';
  return env;
}

/* ══════════════════════════════════════════════ pase único / doble */

async function pass(file, acc, opts, { heavyAll, sampleSet, fixtureIdx }) {
  let ch = null;
  let stats = null;
  let fixtureLines = null;
  for await (const item of readLines(file)) {
    if (item.final) { stats = item.stats; break; }
    const { line, lineNo } = item;
    const idx = acc.channels.length + 1; // canal que se abrirá en este #EXTINF
    const heavy = heavyAll || (sampleSet ? sampleSet.has(idx) : false);
    ch = handleLine(acc, line, lineNo, ch, heavy);
    if (fixtureIdx && ch && ch.idx === fixtureIdx) {
      if (!fixtureLines) fixtureLines = [];
      fixtureLines.push(line);
    }
  }
  // el último bloque cierra en EOF (su última línea vista es acc.lines)
  closeChannel(acc, ch, acc.lines);
  return { stats, fixtureLines };
}

/* ═══════════════════════════════════════════════════ informes */

function buildVerdict(acc, env, syntax) {
  const chs = acc.channels.length;
  const claims = [];
  const add = (id, claim, state, evidence) => claims.push({ id, claim, state, evidence });

  add('V1', 'La lista está identificada por tamaño y sha256 medidos en esta máquina', 'observado',
    'sha256 calculado en el mismo pase de lectura; bytes contados');
  add('V2', 'La cabecera y el bloque de canal están delimitados por #EXTINF, no por un tramo fijo', 'observado',
    `${chs} bloques delimitados; cabecera = líneas previas al primer #EXTINF`);
  add('V3', 'El vocabulario de tags está censado (nombres distintos y líneas por nombre)', 'observado',
    `${acc.tagCounts.size} nombres distintos sobre ${acc.lines} líneas`);
  add('V4', 'Cada cadena de filtros pertenece a un perfil declarado (correlación medida)', 'observado',
    acc.vfChains.size ? `Pares cadena→perfil contados por canal` : 'no hay cadenas video-filter en esta lista');
  add('V5', 'Todo #EXTHTTP analizado es JSON válido (objeto, no array ni escalar)', acc.exthttp.occurrences === 0 ? 'no_aplica'
    : acc.exthttp.invalid === 0 ? 'resuelto' : 'fallido',
  acc.exthttp.occurrences === 0 ? 'la lista no emite #EXTHTTP'
    : `${acc.exthttp.valid} válidos / ${acc.exthttp.invalid} inválidos sobre ${acc.exthttp.occurrences} objetos analizados (JSON.parse real)`);
  add('V6', 'No hay headers tóxicos (Range/If-None-Match/If-Modified-Since/TE/Priority/Upgrade-Insecure-Requests)', 'resuelto',
    `búsqueda exacta case-insensitive en objeto principal y overflow: ${[...acc.exthttp.toxicHits.keys()].join(', ') || '0 coincidencias'}`);
  add('V7', 'Las cadenas de filtros parsean en el ffmpeg instalado', syntax.status === 'NO_COMPUTADO' ? 'no_computado' : (syntax.violations === 0 ? 'resuelto' : 'fallido'),
    syntax.status === 'NO_COMPUTADO' ? syntax.reason : `${syntax.distinct_chains} cadenas distintas; ${syntax.violations} violaciones de nombre/rango/enum contra ffmpeg -h`);
  add('V8', 'La cadena se APLICA en algún runtime desde la playlist', 'heredado_citado',
    'heredado:04 §4 — VLC 3.0.24 descarta #EXTVLCOPT:video-filter por política (unsafe option); los demás runtimes no tienen mecanismo');
  add('V9', 'El filtro mejora la imagen (efecto en píxeles)', 'no_computado',
    'requiere captura y diff de frames; ninguna herramienta de esta skill mide píxeles');
  add('V10', acc.extXMap === 0 ? 'No hay #EXT-X-MAP: el contenedor NO es CMAF/fMP4 real' : 'Hay #EXT-X-MAP: el contenedor puede ser fMP4',
    'observado', `#EXT-X-MAP = ${acc.extXMap}; #EXT-X-MEDIA = ${acc.extXMedia}`);
  return { claims, legend: ['declarado', 'observado', 'resuelto', 'heredado_citado', 'aplicado', 'verificado', 'no_computado', 'fallido'] };
}

function buildNotComputed(acc, env, opts) {
  const nc = [];
  const push = (metric, reason) => nc.push({ metric, state: 'NO_COMPUTADO', reason });
  if (!env.ffmpeg.present) push('parámetros de filtro dentro de rango (ffmpeg -h)', `ffmpeg no disponible: ${env.ffmpeg.reason}`);
  push('resolución / códec / HDR REALES por canal', 'requiere probe del manifest remoto y del bitstream; esta skill es análisis estático local sin red');
  push('salud HTTP de las URIs', 'sin red por diseño (la cartografía no hace peticiones)');
  push('variantes internas de cada manifest HLS', 'la URI del canal apunta a un manifest remoto no descargado');
  push('efecto en píxeles de cualquier filtro', 'requiere captura de frames y diff; no hay vout/grabber en esta herramienta');
  if (!env.vlc.present) push('matriz VLC medida en esta máquina', `VLC no instalado: ${env.vlc.reason}; las celdas quedan heredadas de 04`);
  if (!env.vlc4.present) push('matriz VLC 4.x', env.vlc4.reason);
  push('capacidad de OTT/TiviMate/ExoPlayer/Kodi/hls.js', 'no ejecutables desde esta herramienta; sus celdas son arquitectura documentada (grado s)');
  push('estabilidad temporal de la estructura entre generaciones', 'se analiza una sola instantánea del archivo; sin segunda generación no hay serie');
  if (opts.sample) push(`censo de capas pesadas (EXTHTTP/KODIPROP/EXTVLCOPT por canal)`, `modo muestra --sample ${opts.sample}: el detalle se calcula sobre los canales muestreados; el resto de métricas sigue siendo censal`);
  return nc;
}

function buildFilterSection(acc, opts, env) {
  const chains = [];
  const helpCache = new Map();
  for (const [chain, rec] of acc.vfChains.entries()) {
    const parsed = parseFilterChain(chain);
    const stages = [...new Set(parsed.map((f) => STAGE_OF_FILTER[f.filter] || 'desconocida'))];
    let syntax = { status: 'NO_COMPUTADO', reason: 'ffmpeg no disponible', violations: [], unverifiable: [] };
    if (env.ffmpeg.present) {
      const v = validateChainSyntax(chain, helpCache, env.ffmpeg.bin);
      syntax = {
        status: v.violations.length ? 'FAIL' : 'PASS',
        violations: v.violations,
        unverifiable: v.unverifiable.length,
        unverifiable_params: v.unverifiable.slice(0, 8),
        filters: v.filters,
      };
    }
    const vlcModulesAll = Object.values(VLC_MODULES).flat();
    chains.push({
      sha8: sha(chain, 8),
      length: chain.length,
      channels: rec.count,
      share_pct: pct(rec.count, acc.channels.length),
      profiles: Object.fromEntries(rec.profiles),
      stages,
      filters: parsed.map((f) => f.filter),
      vlc_modules: parsed.map((f) => f.filter).filter((f) => vlcModulesAll.includes(f)),
      not_vlc_modules: parsed.map((f) => f.filter).filter((f) => VLC_NOT_MODULES.includes(f)),
      ffmpeg_syntax: syntax,
      chain_redacted: scrub(chain, []),
    });
  }
  chains.sort((a, b) => b.channels - a.channels);
  const totalViolations = chains.reduce((n, c) => n + (c.ffmpeg_syntax.violations ? c.ffmpeg_syntax.violations.length : 0), 0);
  const status = !env.ffmpeg.present ? 'NO_COMPUTADO' : (totalViolations ? 'FAIL' : 'PASS');
  return {
    entries: acc.vfChains.size ? [...acc.vfChains.values()].reduce((n, r) => n + r.count, 0) : 0,
    distinct_chains: acc.vfChains.size,
    chains,
    syntax: { status, violations: totalViolations, distinct_chains: acc.vfChains.size, reason: !env.ffmpeg.present ? env.ffmpeg.reason : null },
    note: 'El veredicto de sintaxis sale de `ffmpeg -h filter=NAME` (rangos/enums reales del binario). Los parámetros de tipo string con validación interna —zscale es el caso— quedan como no verificables aquí: los juzga scripts/validate_filter_chain.js ejecutando ffmpeg.',
  };
}

/* ══════════════════════════════════════════════ markdown resumen */

function renderMarkdown(map) {
  const L = [];
  const p = (s = '') => L.push(s);
  const src = map.source;
  p(`# Cartografía APE — \`${src.name_masked}\``);
  p();
  p(`Generado por \`ape-lista-cartographer\` v1.0.0 (\`scripts/map_list.js\`) el ${map.generated_at}.`);
  p();
  p('> **Alcance:** análisis estático local. Sin red, sin ejecución de players, sin modificar la lista.');
  p(`> **Estado:** \`${map.scope.mode}\`${map.scope.sample_n ? ` (detalle sobre ${map.scope.sample_n} canales; estructura censal)` : ''}.`);
  p();

  p('## 0. Veredicto en ocho líneas');
  p();
  const b = map.blocks;
  p(`1. **Identidad medida:** ${fmt(src.bytes)} bytes · \`sha256 ${src.sha256.slice(0, 16)}…\` · ${fmt(src.lines)} líneas · ${fmt(src.channels)} canales.`);
  if (b) p(`2. **Bloque de canal:** p50 ${b.p50} líneas (min ${b.min}, max ${b.max}); ${fmt(b.sum)} líneas en bloques + ${fmt(map.header.lines)} de cabecera = ${fmt(map.header.lines + b.sum)} ${b.sum_check_exact ? '**exacto**' : '**NO cuadra**'}.`);
  p(`3. **Vocabulario:** ${fmt(map.tag_vocabulary.distinct)} nombres de tag distintos; ${map.tag_vocabulary.classes.length} clases medidas.`);
  if (map.video_filter.distinct_chains) {
    p(`4. **Cadenas de filtros:** ${fmt(map.video_filter.entries)} líneas \`video-filter\`, pero solo **${map.video_filter.distinct_chains} firmas distintas**; sintaxis ffmpeg: **${map.video_filter.syntax.status}** (${map.video_filter.syntax.violations} violaciones contra \`ffmpeg -h\`).`);
  } else {
    p('4. **Cadenas de filtros:** la lista no emite `#EXTVLCOPT:video-filter`.');
  }
  p(`5. **\`#EXTHTTP\`:** ${fmt(map.exthttp.lines_census)} líneas en la lista · ${fmt(map.exthttp.objects_analyzed)} objetos analizados · ${fmt(map.exthttp.invalid)} inválidos (JSON.parse real) · ${fmt(Object.keys(map.exthttp.toxic_hits).length)} headers tóxicos distintos.`);
  if (map.overflow.lines_census) p(`6. **Overflow:** ${fmt(map.overflow.lines_census)} líneas · ${fmt(map.overflow.objects_analyzed)} objetos decodificados · ${fmt(map.overflow.invalid)} inválidos${map.overflow.field_stats ? ` · ${fmt(map.overflow.field_stats.min)}–${fmt(map.overflow.field_stats.max)} campos` : ''}.`);
  else p('6. **Overflow:** la lista no emite `#EXT-X-APE-OVERFLOW-HEADERS`.');
  p(`7. **Contenedor:** \`#EXT-X-MAP\` = ${map.families.ext_x_map} → ${map.families.ext_x_map === 0 ? '**no hay CMAF/fMP4 real**, cualquier etiqueta CMAF es declarativa' : 'puede haber fMP4'}.`);
  p('8. **Techo honesto:** ninguna celda de la matriz llega a `verificado`. Un tag de imagen en la playlist es `declarado`; el efecto en píxeles **no se mide aquí** (§8).');
  p();

  p('## 1. Identidad del artefacto');
  p();
  p('| Propiedad | Valor |');
  p('|---|---|');
  p(`| Nombre (enmascarado) | \`${src.name_masked}\` |`);
  p(`| Bytes | ${fmt(src.bytes)} |`);
  p(`| SHA-256 | \`${src.sha256}\` |`);
  p(`| Líneas | ${fmt(src.lines)} |`);
  p(`| Canales (\`#EXTINF\`) | ${fmt(src.channels)} |`);
  p(`| Líneas URI (no-tag) | ${fmt(src.uri_lines)} |`);
  p(`| URIs distintas | ${fmt(src.distinct_uris)} |`);
  p(`| Hosts distintos | ${src.hosts} |`);
  p(`| Pares usuario/contraseña distintos | ${src.credential_pairs} |`);
  p(`| Esquemas | ${src.schemes} |`);
  p(`| Codificación | ${src.encoding.utf8_errors === 0 ? 'UTF-8 estricto OK' : `${src.encoding.utf8_errors} errores`} · no-ASCII ${fmt(src.encoding.non_ascii_bytes)} B · CRLF ${fmt(src.encoding.crlf_lines)} |`);
  p(`| Línea más larga | ${fmt(src.encoding.max_line_len)} caracteres (línea ${fmt(src.encoding.max_line_len_line)}) |`);
  p(`| Termina en salto de línea | ${src.encoding.ends_with_newline ? 'sí' : 'no'} |`);
  p();

  p('## 2. Cabecera y bloques');
  p();
  p(`- Cabecera: **${map.header.lines} líneas** de tag antes del primer \`#EXTINF\` (línea ${map.header.first_extinf_line}); ${map.header.tags} tags distintos.`);
  if (map.header.ape_channels_declared != null) p(`- La cabecera declara \`#EXT-X-APE-CHANNELS:${map.header.ape_channels_declared}\` y se midieron ${fmt(src.channels)} canales → ${map.header.ape_channels_declared === src.channels ? '**coincide**' : '**NO coincide**'}.`);
  if (b) {
    p();
    p('| Estadístico | Líneas por bloque |');
    p('|---|---|');
    p(`| n | ${fmt(b.n)} |`);
    p(`| mín / p50 / media | ${b.min} / ${b.p50} / ${b.mean} |`);
    p(`| p90 / p95 / p99 | ${b.p90} / ${b.p95} / ${b.p99} |`);
    p(`| máx | ${b.max} |`);
    p(`| suma | ${fmt(b.sum)} |`);
    p();
    p(`Tallas distintas: **${b.histogram.length}**. ${b.histogram.slice(0, 8).map((h) => `${h.value}→${fmt(h.count)}`).join(' · ')}${b.histogram.length > 8 ? ' · …' : ''}`);
    p();
    p(`Líneas tras el URI: ${b.lines_after_uri.map((h) => `${h.value}→${fmt(h.count)}`).join(' · ')} ${b.lines_after_uri.length && b.lines_after_uri[0].value > 0 ? '→ **el URI no es la última línea del bloque**' : ''}`);
    p();
  }

  p('## 3. Vocabulario de tags (censo)');
  p();
  p('| Clase | Líneas |');
  p('|---|---|');
  for (const cl of map.tag_vocabulary.classes.slice(0, 16)) p(`| \`${cl.class}\` | ${fmt(cl.lines)} |`);
  p();
  p(`Tags sólo en cabecera: **${map.tag_vocabulary.header_only}** · sólo en bloque: **${map.tag_vocabulary.block_only}** · en ambos: **${map.tag_vocabulary.both}**.`);
  p();
  p('Tags con exactamente 1 línea por canal (plantilla fija): ' + map.tag_vocabulary.template_tags.slice(0, 12).map((t) => `\`${t.tag}\``).join(', ') + (map.tag_vocabulary.template_tags.length > 12 ? ' …' : ''));
  p();

  if (map.extinf) {
    p('## 4. `#EXTINF` y variante');
    p();
    p(`Atributos distintos: **${map.extinf.attributes.length}**. Duraciones: ${map.extinf.durations.map((d) => `${d.value}×${fmt(d.count)}`).join(' · ')}.`);
    p();
    const dist = (name) => {
      const d = map.extinf.distributions[name];
      if (!d) return;
      p(`- \`${name}\`: ` + d.slice(0, 8).map((x) => `${x.value}=${fmt(x.count)}`).join(' · '));
    };
    for (const k of Object.keys(map.extinf.distributions)) dist(k);
    p();
    if (map.stream_inf) {
      p(`\`#EXT-X-STREAM-INF\`: ${map.stream_inf.instances} instancias · claves por instancia: ${map.stream_inf.key_count_distribution.map((h) => `${h.value}→${fmt(h.count)}`).join(' · ')}.`);
      p();
      p('| Clave | Presente en | Valores distintos | Valor(es) |');
      p('|---|---|---|---|');
      for (const k of map.stream_inf.keys) p(`| \`${k.key}\` | ${fmt(k.count)} | ${k.distinct} | ${(k.values || []).slice(0, 3).map((v) => `\`${v.value}\`×${fmt(v.count)}`).join(' · ') || '—'} |`);
      p();
    }
  }

  if (map.video_filter.distinct_chains) {
    p('## 5. Cadenas de filtros y sintaxis real');
    p();
    p('| # | Canales | Perfil(es) | Etapas | Sintaxis ffmpeg | Primer defecto |');
    p('|---|---|---|---|---|---|');
    map.video_filter.chains.forEach((c, i) => {
      const first = c.ffmpeg_syntax.violations && c.ffmpeg_syntax.violations[0];
      p(`| ${i + 1} (\`${c.sha8}\`) | ${fmt(c.channels)} | ${Object.keys(c.profiles).join('/')} | ${c.stages.join(', ')} | **${c.ffmpeg_syntax.status}** | ${first ? `\`${first.filter} ${first.param || ''}\` ${first.kind} — ${first.detail}` : '—'} |`);
    });
    p();
    p(`> ${map.video_filter.note}`);
    p();
  }

  p('## 6. `#EXTHTTP` (JSON) y headers tóxicos');
  p();
  p('| Métrica | Valor |');
  p('|---|---|');
  p(`| Líneas \`#EXTHTTP\` (censo) | ${fmt(map.exthttp.lines_census)} |`);
  p(`| Objetos analizados (JSON.parse real) | ${fmt(map.exthttp.objects_analyzed)} |`);
  p(`| JSON válido / inválido | ${fmt(map.exthttp.valid)} / ${fmt(map.exthttp.invalid)} |`);
  p(`| Campos por objeto | ${map.exthttp.field_stats ? `${map.exthttp.field_stats.min}–${map.exthttp.field_stats.max} (p50 ${map.exthttp.field_stats.p50})` : '—'} |`);
  p(`| Bytes por objeto | ${map.exthttp.byte_stats ? `${fmt(map.exthttp.byte_stats.min)}–${fmt(map.exthttp.byte_stats.max)} (p50 ${fmt(map.exthttp.byte_stats.p50)})` : '—'} |`);
  p(`| Nombres de campo distintos | ${fmt(map.exthttp.distinct_fields)} |`);
  p(`| Headers tóxicos | ${Object.keys(map.exthttp.toxic_hits).length === 0 ? '**0**' : Object.entries(map.exthttp.toxic_hits).map(([k, v]) => `${k}×${v}`).join(', ')} |`);
  p(`| Lookalikes (NO tóxicos) | ${Object.entries(map.exthttp.lookalike_hits).map(([k, v]) => `${k}×${fmt(v)}`).join(', ') || '—'} |`);
  p(`| Nombres de header credencial | ${Object.keys(map.exthttp.credential_hits).length} |`);
  p();

  p('## 7. Matriz de capacidad por runtime');
  p();
  p('`N` nativo · `P` plugin/daemon · `D` declarativo (metadata inerte) · `I` imposible. Calidad: `m` medido · `r` documentado · `s` ausencia documentada · `x` no medido.');
  p();
  p('| Runtime | ' + map.runtime_matrix.columns.map((c) => c).join(' | ') + ' |');
  p('|---|' + map.runtime_matrix.columns.map(() => '---').join('|') + '|');
  for (const rt of map.runtime_matrix.rows) {
    const cells = map.runtime_matrix.columns.map((st) => {
      const c = map.runtime_matrix.cells.find((x) => x.runtime === rt && x.stage === st);
      if (!c || !c.verdict) return '—';
      return `${c.verdict}·${c.evidence_quality}`;
    });
    p(`| **${rt}** | ${cells.join(' | ')} |`);
  }
  p();
  p('Reparto de celdas: ' + Object.entries(map.runtime_matrix.counts).map(([k, v]) => `${k}=${v}`).join(' · ') + '.');
  p();

  p('## 8. Estados de evidencia (la escalera y su techo)');
  p();
  p('| Estado | Significado | Quién lo alcanza en esta cartografía |');
  p('|---|---|---|');
  p('| `declarado` | está escrito en la lista | tags, atributos, cadenas |');
  p('| `observado` | medido sobre los bytes por este mapper | censos, distribuciones |');
  p('| `resuelto` | validado contra una herramienta real | `JSON.parse`, `ffmpeg -h`, `Get-FileHash` |');
  p('| `heredado_citado` | medido antes, citado con su artefacto | matriz de runtimes, `unsafe option` de VLC |');
  p('| `aplicado` | el runtime ejecutó el mecanismo | **0 celdas** (requiere player en ejecución) |');
  p('| `verificado` | el frame cambió y se midió el diff | **0 celdas** (no hay captura de frames) |');
  p();
  p('| Claim | Estado | Evidencia |');
  p('|---|---|---|');
  for (const c of map.verdict.claims) p(`| ${c.id} ${c.claim} | \`${c.state}\` | ${c.evidence} |`);
  p();

  if (map.coherence) {
    p('## 9. Coherencia entre capas');
    p();
    p('| # | Contradicción | Canales | % | Denominador |');
    p('|---|---|---|---|---|');
    for (const c of map.coherence.contradictions) {
      if (c.channels > 0) p(`| ${c.id} | ${c.label} | ${fmt(c.channels)} | ${c.pct} % | ${fmt(c.denominator)} (\`${c.scope}\`) |`);
    }
    p();
    if (map.coherence.not_implemented && map.coherence.not_implemented.length) {
      for (const n of map.coherence.not_implemented) p(`- **${n.id} no implementado:** ${n.label}. Razón: ${n.reason}`);
      p();
    }
    p(`GOLDEN RULE \`hvc1\`/\`hev1\`: **${map.coherence.golden_rule.violations}** violaciones (${map.coherence.golden_rule.note}).`);
    p();
  }

  p('## 10. NO COMPUTADO');
  p();
  p('| Métrica | Estado | Razón |');
  p('|---|---|---|');
  for (const n of map.not_computed) p(`| ${n.metric} | ${n.state} | ${n.reason} |`);
  p();
  p('Nada de lo anterior se ha sustituido por una estimación.');
  p();

  p('## 11. Artefactos y reproducibilidad');
  p();
  p('```text');
  p(`node .agents/skills/ape-lista-cartographer/scripts/map_list.js "${src.name_masked}" --out <dir>${map.scope.mode === 'muestra' ? ` --sample ${map.scope.sample_n}` : ''}`);
  p('```');
  p();
  p(`- JSON completo: \`${map.artifacts.json}\``);
  if (map.artifacts.markdown) p(`- Este resumen: \`${map.artifacts.markdown}\``);
  if (map.artifacts.fixture) p(`- Fixture redactado: \`${map.artifacts.fixture}\``);
  p();
  p(`**Redacción:** host ${map.redaction.host_masked ? 'enmascarado' : 'visible por --keep-host'}; usuario y contraseña enmascarados siempre; ${map.redaction.secrets_scrubbed} secretos sustituidos en la salida.`);
  p();
  p('---');
  p('Skill: `.agents/skills/ape-lista-cartographer/` · esquema `ape-lista-cartographer/map@1`.');
  return L.join('\n');
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/* ═══════════════════════════════════════════════════ main */

async function main() {
  let opts;
  try { opts = parseArgv(process.argv.slice(2)); } catch (e) {
    console.error(`[map_list] ${e.message}`);
    console.error(HELP);
    process.exit(1);
  }
  if (opts.help) { console.log(HELP); return; }
  if (!opts.src) { console.error('[map_list] falta la ruta de la lista\n' + HELP); process.exit(1); }
  if (!fs.existsSync(opts.src)) { console.error(`[map_list] no existe: ${opts.src}`); process.exit(1); }
  const st = fs.statSync(opts.src);
  if (!st.isFile()) { console.error('[map_list] la ruta no es un archivo'); process.exit(1); }

  const log = (...a) => { if (!opts.quiet) console.log('[map_list]', ...a); };
  const t0 = Date.now();
  const env = detectEnvironment(opts);
  log(`ffmpeg: ${env.ffmpeg.present ? env.ffmpeg.version : `AUSENTE (${env.ffmpeg.reason})`}`);
  log(`vlc: ${env.vlc.present ? `v${env.vlc.version} (${env.vlc.video_filter_plugins} plugins video_filter, ${env.vlc.avfilter_binaries} binarios avfilter/ffmpeg)` : `AUSENTE (${env.vlc.reason})`}`);

  /* ── pase 1: estructura (siempre censal) + captura del fixture si se pidió */
  const acc = newAcc();
  log(`leyendo ${opts.src} …`);
  const { stats, fixtureLines } = await pass(opts.src, acc, opts, {
    heavyAll: !opts.sample, sampleSet: null, fixtureIdx: opts.fixture || null,
  });
  if (!stats) throw new Error('no se pudo leer el archivo');

  /* ── pase 2 (solo muestra): detalle de las capas pesadas en los canales elegidos */
  let sampleSet = null;
  if (opts.sample && acc.channels.length > 0) {
    const n = Math.max(1, Math.min(opts.sample, acc.channels.length));
    const stride = Math.max(1, Math.floor(acc.channels.length / n));
    sampleSet = new Set();
    for (let i = 1; i <= acc.channels.length && sampleSet.size < n; i += stride) sampleSet.add(i);
    log(`muestra: ${sampleSet.size} canales (paso ${stride}) — segunda pasada para capas pesadas`);
    const acc2 = newAcc();
    await pass(opts.src, acc2, opts, { heavyAll: false, sampleSet, fixtureIdx: null });
    acc.exthttp = acc2.exthttp;
    acc.overflow = acc2.overflow;
    // los valores por canal de las capas pesadas viven en acc2.channels
    for (const c2 of acc2.channels) {
      if (!sampleSet.has(c2.idx)) continue;
      const c1 = acc.channels[c2.idx - 1];
      if (!c1) continue;
      c1.xapeCodecVideo = c2.xapeCodecVideo || null;
      c1.xapeCmaf = c2.xapeCmaf || null;
      c1.xapeResolutionQ = c2.xapeResolutionQ || null;
      c1.exthttp = c2.exthttp || null;
    }
  }
  // el detalle pesado se mide sobre los canales analizados; el total de líneas es censal
  const exthttpLinesCensus = acc.tagCounts.get('#EXTHTTP') || 0;
  const overflowLinesCensus = acc.tagCounts.get('#EXT-X-APE-OVERFLOW-HEADERS') || 0;

  /* ── fixture (redactado) usando las líneas capturadas en el pase 1 */
  let fixtureInfo = null;
  if (opts.fixture) {
    if (!fixtureLines || !fixtureLines.length) {
      console.error(`[map_list] canal ${opts.fixture} no encontrado (la lista tiene ${acc.channels.length})`);
      process.exit(1);
    }
    const secrets = [...acc.pairs].flatMap((p) => p.split('\u0000')).concat([...acc.hosts]).concat([...acc.logoHosts]);
    const fStats = { n: 0 };
    const out = fixtureLines.map((l) => scrub(l, secrets, null, fStats)).join('\n') + '\n';
    const dest = opts.fixtureOut || path.join(opts.out, `fixture_canal_${String(opts.fixture).padStart(3, '0')}.txt`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out, 'utf8');
    const leaks = secrets.filter((s) => s && s.length >= 3).reduce((n, s) => n + countOccurrences(out, s), 0);
    fixtureInfo = {
      path: dest, channel_index: opts.fixture, lines: fixtureLines.length,
      bytes: Buffer.byteLength(out, 'utf8'), sha256: sha(out, 64), redactions_applied: fStats.n || 0,
      host_or_credential_occurrences: leaks,
    };
    log(`fixture canal ${opts.fixture}: ${fixtureInfo.lines} líneas · ${fixtureInfo.redactions_applied} redacciones → ${dest}`);
    if (leaks > 0) { console.error('[map_list] ASSERTION: el fixture contiene host/credencial sin redactar'); process.exit(2); }
  }

  /* ── secciones derivadas */
  const filterSection = buildFilterSection(acc, opts, env);
  // etapas por cadena (para la matriz): se recalculan desde las cadenas medidas
  for (const [chain, rec] of acc.vfChains.entries()) {
    rec.stages = [...new Set(parseFilterChain(chain).map((f) => STAGE_OF_FILTER[f.filter] || 'desconocida'))];
  }
  const runtimeMatrix = buildRuntimeMatrix(acc, env);
  const contradictions = evaluateCoherence(acc);
  const verdict = buildVerdict(acc, env, filterSection.syntax);
  const notComputed = buildNotComputed(acc, env, opts);

  /* ── clases de tag */
  const classOf = (tag) => {
    if (tag.startsWith('#EXT-X-APE-')) return '#EXT-X-APE-*';
    if (tag === '#EXTVLCOPT') return '#EXTVLCOPT';
    if (tag === '#KODIPROP') return '#KODIPROP';
    if (tag === '#EXTATTRFROMURL') return '#EXTATTRFROMURL';
    if (tag.startsWith('#EXT-X-CMAF')) return '#EXT-X-CMAF*';
    if (tag.startsWith('#EXT-X-VNOVA')) return '#EXT-X-VNOVA*';
    if (tag.startsWith('#EXT-X-PHANTOM')) return '#EXT-X-PHANTOM-HYDRA*';
    if (tag === '#EXTHTTP') return '#EXTHTTP';
    if (tag === '#EXTINF') return '#EXTINF';
    if (tag === '#EXTM3U') return '#EXTM3U';
    if (tag.startsWith('#EXT-X-SYS-')) return '#EXT-X-SYS-*';
    if (tag.startsWith('#EXT-X-')) return '#EXT-X-* (otros)';
    return 'otros';
  };
  const classCounts = new Map();
  for (const [tag, n] of acc.tagCounts) classCounts.set(classOf(tag), (classCounts.get(classOf(tag)) || 0) + n);

  /* ── vocabulario: cabecera vs bloque */
  let headerOnly = 0; let both = 0; let blockOnly = 0;
  for (const [tag, n] of acc.tagCounts) {
    const h = acc.headerTagCounts.get(tag) || 0;
    if (h > 0 && h === n) headerOnly++;
    else if (h > 0) both++;
    else blockOnly++;
  }
  const templateTags = [...acc.tagCounts.entries()]
    .filter(([, n]) => n === acc.channels.length || n === acc.channels.length + 1)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => ({ tag, lines: n }));

  /* ── EXTHTTP / overflow con estadísticos */
  const fieldStats = quantiles(acc.exthttp.fieldCounts);
  const byteStats = quantiles(acc.exthttp.byteSizes);
  const ovFieldStats = quantiles(acc.overflow.fieldCounts);
  const ovByteStats = quantiles(acc.overflow.byteSizes);

  /* ── matriz de contradicciones etiquetada */
  const chs = acc.channels.length;
  const contradictionRows = [
    { id: 'C1', label: 'STREAM-INF RESOLUTION ≠ KODIPROP max_resolution', channels: contradictions.resolution_streaminf_vs_kodiprop },
    { id: 'C2', label: 'STREAM-INF VIDEO-RANGE=PQ vs EXTVLCOPT video-hdr*=SDR/false', channels: contradictions.pq_vs_vlchdr },
    { id: 'C3', label: 'STREAM-INF CODECS=hvc1… vs EXTVLCOPT codec sin hevc', channels: contradictions.codec_hvc1_vs_vlch264 },
    { id: 'C4', label: 'I-FRAME-STREAM-INF con nivel HEVC < STREAM-INF', channels: contradictions.iframe_level_below_streaminf },
    { id: 'C5', label: 'EXTHTTP X-APE-Codec-Video con nivel HEVC < STREAM-INF', channels: contradictions.xape_codec_below_streaminf, scope: opts.sample ? 'muestra (capas pesadas)' : 'censo' },
    { id: 'C6', label: 'La familia CMAF declara contenedor y #EXT-X-MAP = 0', channels: contradictions.cmaf_container_vs_fmp4 },
    { id: 'C7', label: '#EXT-X-VERSION real ≠ #EXT-X-CMAF-VERSION declarado', channels: contradictions.version_vs_cmafversion },
    { id: 'C8', label: '#EXT-X-PART-INF PART-TARGET real ≠ #EXT-X-CMAF-PART-TARGET', channels: contradictions.cmaf_part_target_mismatch },
    { id: 'C9', label: '#EXT-X-SERVER-CONTROL PART-HOLD-BACK real ≠ #EXT-X-CMAF-PART-HOLD-BACK', channels: contradictions.cmaf_part_holdback_mismatch },
    { id: 'C11', label: 'Init segment declarado por la familia sin #EXT-X-MAP', channels: contradictions.cmaf_init_without_map },
    { id: 'C12', label: 'Techo adaptativo VLC (maxwidth) > KODIPROP max_resolution', channels: contradictions.vlc_adaptive_vs_kodiprop_res },
    { id: 'C13', label: 'STREAM-INF sin HDCP-LEVEL', channels: contradictions.hdcp_missing },
  ].map((r) => {
    const scoped = String(r.scope || 'censo').startsWith('muestra') && sampleSet ? sampleSet.size : chs;
    return { ...r, scope: r.scope || 'censo', denominator: scoped, pct: pct(r.channels, scoped) };
  });

  /* ── nombre enmascarado del archivo ── */
  const baseName = path.basename(opts.src);
  const nameMasked = opts.keepHost ? baseName : baseName;

  /* ── ensamblar mapa ── */
  const map = {
    schema: TOOL.schema,
    generated_at: nowIso(),
    tool: { ...TOOL, node: process.version, platform: `${process.platform} ${process.arch}`, elapsed_ms: null },
    environment: env,
    source: {
      path_masked: opts.keepHost ? opts.src : scrub(opts.src, []),
      name_masked: nameMasked,
      bytes: stats.bytes,
      sha256: stats.sha256,
      mtime_iso: st.mtime.toISOString(),
      lines: acc.lines,
      channels: chs,
      uri_lines: acc.uris,
      distinct_uris: acc.uriHashes.size,
      hosts: acc.hosts.size,
      logo_hosts: acc.logoHosts.size,
      credential_pairs: acc.pairs.size,
      schemes: [...acc.schemeCounts.entries()].map(([k, v]) => `${k}×${v}`).join(' · '),
      uri_templates: topEntries(acc.uriTemplates, 5).map((t) => ({ template: t.key, count: t.count })),
      distinct_stream_ids: acc.streamIds.size,
      encoding: {
        utf8_errors: stats.utf8_errors,
        utf8_error_sample: stats.utf8_error_sample,
        non_ascii_bytes: stats.non_ascii_bytes,
        crlf_lines: stats.crlf_lines,
        max_line_len: stats.max_line_len,
        max_line_len_line: stats.max_line_len_line,
        ends_with_newline: stats.ends_with_newline,
      },
    },
    scope: {
      mode: opts.sample ? 'muestra' : 'censo',
      sample_n: opts.sample || null,
      detail_denominator: opts.sample ? (sampleSet ? sampleSet.size : 0) : chs,
      note: opts.sample
        ? 'Estructura (líneas, bloques, vocabulario de tags, familias) censal. Capas pesadas (EXTHTTP/overflow con JSON.parse y base64) solo sobre los canales muestreados.'
        : 'Censo total: una pasada sobre el archivo completo, sin muestreo.',
    },
    header: {
      lines: (() => { const f = acc.channels.length ? acc.channels[0].startLine : acc.lines; return f - 1; })(),
      first_extinf_line: acc.channels.length ? acc.channels[0].startLine : null,
      tags: acc.headerTagCounts.size,
      tag_counts: topEntries(acc.headerTagCounts, 25),
      ape_channels_declared: acc.apeChannelsDeclared,
    },
    blocks: (() => {
      const q = quantiles(acc.blockSizes);
      const headerLines = acc.channels.length ? acc.channels[0].startLine - 1 : acc.lines;
      return {
        n: q ? q.n : 0,
        ...q,
        histogram: histogram(acc.blockSizes),
        lines_after_uri: histogram(acc.linesAfterUri),
        empties: { total: acc.emptyLines, per_block: histogram(acc.emptyTail) },
        sum_check_exact: headerLines + (q ? q.sum : 0) === acc.lines,
        sum_check: { header_lines: headerLines, block_lines: q ? q.sum : 0, total_lines: acc.lines },
      };
    })(),
    tag_vocabulary: {
      distinct: acc.tagCounts.size,
      classes: [...classCounts.entries()].map(([k, v]) => ({ class: k, lines: v })).sort((a, b) => b.lines - a.lines),
      header_only: headerOnly, block_only: blockOnly, both,
      template_tags: templateTags,
      top: topEntries(acc.tagCounts, 40).map((t) => ({ tag: t.key, lines: t.count, first_line: acc.tagFirstLine.get(t.key) })),
    },
    extinf: {
      attributes: [...acc.cross.extinfAttrNames.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count),
      durations: [...acc.cross.extinfDurations.entries()].map(([value, count]) => ({ value, count, pct: pct(count, chs) })).sort((a, b) => b.count - a.count),
      forms: [...acc.cross.extinfForms.entries()].map(([k, v]) => ({ form: k, count: v })),
      distributions: {
        'ape-profile': histogram(expand(acc.profiles)),
        'ape-codec-family': histogram(expand(acc.codecFamilies)),
      },
    },
    stream_inf: {
      instances: acc.cross.siKeyCounts.size ? [...acc.cross.siKeyCounts.entries()].reduce((n, [, c]) => n + c, 0) : 0,
      key_count_distribution: [...acc.cross.siKeyCounts.entries()].map(([value, count]) => ({ value, count, pct: pct(count, chs) })).sort((a, b) => b.count - a.count),
      keys: (() => {
        const m = new Map();
        for (const k of acc.cross.siKeys) m.set(k, (m.get(k) || 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => {
          const rec = acc.cross.siValues.get(key);
          const usable = rec && !rec.overflow;
          return {
            key, count,
            distinct: usable ? rec.counts.size : (rec && rec.overflow ? 'alta cardinalidad (>64)' : null),
            values: usable ? topEntries(rec.counts, 6).map((v) => ({ value: v.key, count: v.count })) : null,
          };
        });
      })(),
      bandwidth: quantiles(acc.cross.siBandwidth),
      hdcp_missing: acc.cross.siHdcpMissing,
    },
    iframe_stream_inf: { codecs: topEntries(acc.cross.iframeCodecs, 10).map((t) => ({ value: t.key, count: t.count })) },
    daterange: {
      transfer: topEntries(acc.cross.drTransfer, 10).map((t) => ({ value: t.key, count: t.count })),
      hdr_type: topEntries(acc.cross.drRange, 10).map((t) => ({ value: t.key, count: t.count })),
      bit_depth: topEntries(acc.cross.drBitDepth, 10).map((t) => ({ value: t.key, count: t.count })),
      chroma: topEntries(acc.cross.drChrom, 10).map((t) => ({ value: t.key, count: t.count })),
    },
    exthttp: {
      lines_census: exthttpLinesCensus,
      objects_analyzed: acc.exthttp.occurrences,
      valid: acc.exthttp.valid,
      invalid: acc.exthttp.invalid,
      non_object: acc.exthttp.nonObject,
      distinct_fields: acc.exthttp.fieldFrequency.size,
      field_stats: fieldStats,
      byte_stats: byteStats,
      toxic_hits: Object.fromEntries(acc.exthttp.toxicHits),
      lookalike_hits: Object.fromEntries(acc.exthttp.lookalikeHits),
      credential_hits: Object.fromEntries(acc.exthttp.credentialHits),
      bearer_values: acc.exthttp.bearerHits,
      jwt_values: acc.exthttp.jwtHits,
      invalid_samples: acc.exthttp.invalidSamples,
      field_frequency: topEntries(acc.exthttp.fieldFrequency, 40).map((t) => ({ name: t.key, count: t.count })),
    },
    overflow: {
      lines_census: overflowLinesCensus,
      objects_analyzed: acc.overflow.occurrences,
      decoded: acc.overflow.decoded,
      invalid: acc.overflow.invalid,
      non_object: acc.overflow.nonObject,
      field_stats: ovFieldStats,
      byte_stats: ovByteStats,
      distinct_fields: acc.overflow.fieldFrequency.size,
      invalid_samples: acc.overflow.invalidSamples,
    },
    kodiprop: {
      lines: acc.kodipropKeys.size ? [...acc.kodipropKeys.values()].reduce((a, b) => a + b, 0) : 0,
      distinct_keys: acc.kodipropKeys.size,
      families: [...acc.cross.kodipropFamilies.entries()].map(([k, v]) => ({ family: k, lines: v })).sort((a, b) => b.lines - a.lines).slice(0, 20),
      keys: topEntries(acc.kodipropKeys, 40).map((t) => ({ key: t.key, lines: t.count })),
      max_resolution: topEntries(acc.cross.kodipropMaxRes, 8).map((t) => ({ value: t.key, count: t.count })),
      video_codec: topEntries(acc.cross.kodipropVideoCodec, 8).map((t) => ({ value: t.key, count: t.count })),
      drm_type: topEntries(acc.cross.kodipropDrmType, 8).map((t) => ({ value: t.key, count: t.count })),
    },
    extvlcopt: {
      lines: [...acc.extvlcoptKeys.values()].reduce((a, b) => a + b, 0),
      distinct_options: acc.extvlcoptKeys.size,
      options: topEntries(acc.extvlcoptKeys, 60).map((t) => ({ option: t.key, lines: t.count })),
      codec: topEntries(acc.cross.vlcCodec, 8).map((t) => ({ value: t.key, count: t.count })),
      hdr_mode: topEntries(acc.cross.vlcHdrMode, 8).map((t) => ({ value: t.key, count: t.count })),
      hdr_flag: topEntries(acc.cross.vlcHdrBool, 8).map((t) => ({ value: t.key, count: t.count })),
    },
    extattrfromurl: {
      lines: [...acc.extattrKeys.values()].reduce((a, b) => a + b, 0),
      distinct_attributes: acc.extattrKeys.size,
      attributes: topEntries(acc.extattrKeys, 60).map((t) => ({ attribute: t.key, lines: t.count })),
    },
    families: {
      ape: { tags: [...acc.tagCounts.keys()].filter((t) => t.startsWith('#EXT-X-APE-')).length, lines: [...acc.tagCounts.entries()].filter(([t]) => t.startsWith('#EXT-X-APE-')).reduce((n, [, c]) => n + c, 0) },
      cmaf: { tags: [...acc.tagCounts.keys()].filter((t) => t.startsWith('#EXT-X-CMAF')).length, lines: [...acc.tagCounts.entries()].filter(([t]) => t.startsWith('#EXT-X-CMAF')).reduce((n, [, c]) => n + c, 0), container: topEntries(acc.cross.cmafContainer, 6).map((t) => ({ value: t.key, count: t.count })) },
      vnova: { tags: [...acc.tagCounts.keys()].filter((t) => t.startsWith('#EXT-X-VNOVA')).length, lines: [...acc.tagCounts.entries()].filter(([t]) => t.startsWith('#EXT-X-VNOVA')).reduce((n, [, c]) => n + c, 0), base_resolution: topEntries(acc.cross.vnovaBaseRes, 6).map((t) => ({ value: t.key, count: t.count })) },
      phantom: { tags: [...acc.tagCounts.keys()].filter((t) => t.startsWith('#EXT-X-PHANTOM')).length, lines: [...acc.tagCounts.entries()].filter(([t]) => t.startsWith('#EXT-X-PHANTOM')).reduce((n, [, c]) => n + c, 0) },
      ext_x_map: acc.extXMap,
      ext_x_media: acc.extXMedia,
      ext_x_version: acc.extXVersion,
    },
    video_filter: filterSection,
    coherence: {
      contradictions: contradictionRows,
      not_implemented: [
        { id: 'C10', label: 'audio Atmos/DTS/TrueHD: la familia CMAF dice ENABLED=false y la capa de atributos dice presente', reason: 'requiere cruzar 3 tags de familia con 3 campos de #EXTHTTP; el campo X-APE-ATMOS no está en el top-40 de frecuencias y el chequeo quedaría muestral o ciego — se deja a revisión manual sobre el JSON' },
      ],
      golden_rule: {
        violations: contradictions.golden_hvc1_in_kodiprop_or_vlc + contradictions.golden_hev1_in_streaminf,
        hvc1_in_kodiprop_or_vlc: contradictions.golden_hvc1_in_kodiprop_or_vlc,
        hev1_in_stream_inf: contradictions.golden_hev1_in_streaminf,
        rfc6381_in_kodiprop_or_vlc: contradictions.rfc6381_in_kodiprop_or_vlc,
        note: 'hvc1.* solo en STREAM-INF CODECS; hev1.* solo en KODIPROP/EXTVLCOPT. KODIPROP/EXTVLCOPT no emiten RFC 6381 por diseño, así que cualquier hvc1/hev1 ahí es una violación.',
      },
    },
    runtime_matrix: runtimeMatrix,
    verdict,
    not_computed: notComputed,
    artifacts: {},
    redaction: {
      host_masked: !opts.keepHost,
      user_pass_masked: true,
      secrets_scrubbed: 0,
      note: 'El host del stream y los hosts de tvg-logo se enmascaran salvo --keep-host. Usuario y contraseña se enmascaran siempre, también en fixtures. Los valores de #EXTHTTP no se almacenan (solo nombres y tamaños).',
    },
  };

  /* ── red está prohibida: se declara ── */
  map.network = { used: false, note: 'esta skill no hace peticiones: toda la evidencia es estática y local' };

  /* ── salida ── */
  fs.mkdirSync(opts.out, { recursive: true });
  const sha8 = map.source.sha256.slice(0, 8);
  const jsonPath = path.join(opts.out, `map_${sha8}.json`);
  const mdPath = path.join(opts.out, `map_${sha8}.md`);
  map.artifacts = { json: jsonPath, markdown: opts.jsonOnly ? null : mdPath, fixture: fixtureInfo ? fixtureInfo.path : null };

  const secrets = [...acc.pairs].flatMap((p) => p.split('\u0000'))
    .concat([...acc.hosts]).concat([...acc.logoHosts])
    .filter((s) => s && s.length >= 3 && !/^<.*>$/.test(s));
  const preserve = new Set([map.source.sha256]);
  if (fixtureInfo && fixtureInfo.sha256) preserve.add(fixtureInfo.sha256);
  const scrubStats = { n: 0 };
  map.tool.elapsed_ms = Date.now() - t0;
  let jsonText = scrub(JSON.stringify(map, null, 2), secrets, preserve, scrubStats);
  map.redaction.secrets_scrubbed = scrubStats.n || 0;
  // el recuento real de sustituciones se escribe después del scrub (es el único campo que cambia)
  jsonText = jsonText.replace(/"secrets_scrubbed": 0/, `"secrets_scrubbed": ${scrubStats.n || 0}`);

  let mdText = null;
  const mdStats = { n: 0 };
  if (!opts.jsonOnly) mdText = scrub(renderMarkdown(map), secrets, preserve, mdStats);

  /* ── control de fugas: se mide sobre el texto YA escrito ── */
  const outText = jsonText + (mdText || '');
  const leakChecks = {
    json_parses: (() => { try { JSON.parse(jsonText); return true; } catch { return false; } })(),
    host_occurrences_in_output: [...acc.hosts]
      .filter((h) => h && h.length > 3 && !/^<.*>$/.test(h))
      .reduce((n, h) => n + countOccurrences(outText, h), 0),
    credential_occurrences_in_output: secrets.reduce((n, s) => n + (s.length > 3 ? countOccurrences(outText, s) : 0), 0),
    sha256_preserved: countOccurrences(jsonText, map.source.sha256) > 0,
    redactions_applied: scrubStats.n || 0,
  };
  map.redaction.secrets_scrubbed = scrubStats.n || 0;
  map.redaction.leak_checks = leakChecks;
  jsonText = jsonText.replace(/"secrets_scrubbed": \d+/, `"secrets_scrubbed": ${scrubStats.n || 0}`);
  fs.writeFileSync(jsonPath, jsonText, 'utf8');
  if (mdText) fs.writeFileSync(mdPath, mdText, 'utf8');
  if (!leakChecks.json_parses) { console.error('[map_list] ERROR: el JSON emitido no parsea'); process.exit(1); }
  if (!opts.quiet) {
    log(`canales ${fmt(map.source.channels)} · líneas ${fmt(map.source.lines)} · tags ${fmt(map.tag_vocabulary.distinct)} · ${map.scope.mode}`);
    log(`filtros: ${map.video_filter.distinct_chains} firmas · sintaxis ${map.video_filter.syntax.status}`);
    log(`EXTHTTP: ${fmt(map.exthttp.objects_analyzed)} analizados de ${fmt(map.exthttp.lines_census)} · ${map.exthttp.invalid} inválidos · tóxicos ${Object.keys(map.exthttp.toxic_hits).length}`);
    log(`JSON  → ${jsonPath}`);
    if (mdPath) log(`MD    → ${mdPath}`);
    log(`control de fugas → host:${leakChecks.host_occurrences_in_output} credencial:${leakChecks.credential_occurrences_in_output} sha_preservado:${leakChecks.sha256_preserved} json_ok:${leakChecks.json_parses}`);
    log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  // las comprobaciones de fuga van al JSON ya emitido: se anexan al log de auditoría del run
  if (opts.expectChannels != null && map.source.channels !== opts.expectChannels) {
    console.error(`[map_list] ASSERTION: canales ${map.source.channels} != esperado ${opts.expectChannels}`);
    process.exit(2);
  }
  if (leakChecks.host_occurrences_in_output > 0 || leakChecks.credential_occurrences_in_output > 0) {
    console.error('[map_list] ASSERTION: fuga de host/credencial en la salida');
    process.exit(2);
  }
}

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0; let i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + needle.length; }
  return n;
}

/** Expande un Map<valor,count> a un array para poder pasarlo por histogram(). */
function expand(map) {
  const out = [];
  for (const [v, n] of map) for (let i = 0; i < n; i++) out.push(v);
  return out;
}

main().catch((e) => {
  console.error('[map_list] FATAL:', e && e.stack ? e.stack : e);
  process.exit(1);
});
