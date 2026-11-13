#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════════
 * APE CANARY — ADAPTADOR UNIVERSAL DE LISTAS  (schema ape.playlist.adapter/1)
 *
 * INGESTA -> VALIDACION FAIL-CLOSED -> PUBLICACION ATOMICA con manifiesto.
 *
 * DOCTRINA QUE IMPONE ESTE MODULO
 *   1. NADA SE DESCARTA. Cada linea se escribe byte a byte tal como entro. Las
 *      etiquetas desconocidas se conservan verbatim y NUNCA se interpretan.
 *   2. NADA SE EJECUTA. Cero evaluacion dinamica, cero procesos hijos, cero red.
 *      Una etiqueta es DATO. Un valor de atributo es DATO.
 *   3. SI NO SE PUEDE VALIDAR, NO SE PUBLICA. Una lista truncada a mitad de
 *      bloque (EXTINF sin URI) se rechaza; no hay publicacion parcial.
 *   4. LA REVISION ES UNA SOLA. Lista, indice y manifiesto comparten `revision`;
 *      el manifiesto se publica ULTIMO y es el punto de commit.
 *
 * LIMITES DECLARADOS (honestos, no se ocultan)
 *   · MEMORIA: O(nombres de tag distintos) + O(1) por linea. El contenido NO se
 *     acumula: se escribe mientras se lee y el indice se emite de forma
 *     incremental. En ningun punto se hace readFile del fichero completo.
 *   · El objeto `manifest.tags.by_name` crece con los NOMBRES distintos (795 en
 *     la muestra real, ~819 en la lista de produccion), no con los canales.
 *   · Envoltorios `pulse` (/pulse/?u=...) NO se desempaquetan: se preservan como
 *     URL opaca. No es competencia de este modulo.
 *   · .gz: se descomprime en streaming. GZIP multi-miembro NO se soporta. Un .gz
 *     corrupto o truncado se rechaza (E_GZIP_CORRUPT).
 *   · Listas de 1,3 GB: soportadas por diseno (streaming), NO probadas aqui.
 *   · El parseo de atributos es ASESOR, no normativo: si un titulo tiene la
 *     forma `Nombre = valor`, el parser puede leerlo como atributo. La LINEA se
 *     preserva igual (eso es lo que garantiza el contrato).
 *
 * SOLO CORE DE NODE. Sin dependencias, sin red.
 * ═══════════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const ADAPTER_VERSION = '1.0.0';
const SCHEMA_MANIFEST = 'ape.playlist.manifest/1';
const SCHEMA_INDEX = 'ape.playlist.index/1';

/* ── codigos de error: fail-closed. Cualquiera de estos ABORTA la publicacion. ── */
const ERROR_CODES = {
  E_EMPTY_INPUT: 'la entrada esta vacia',
  E_IO: 'error de lectura/escritura',
  E_LINE_TOO_LONG: 'una linea supera maxLineBytes (posible binario o corrupcion)',
  E_MISSING_EXTM3U: 'la primera linea util no es #EXTM3U',
  E_NO_BLOCKS: 'hay URIs pero ningun abridor de bloque (#EXTINF / #EXT-X-STREAM-INF)',
  E_URI_WITHOUT_BLOCK: 'URI fuera de cualquier bloque',
  E_TRUNCATED_BLOCK: 'bloque truncado: abridor sin URI (lista cortada a mitad de bloque)',
  E_MULTIPLE_URI_IN_BLOCK: 'bloque con mas de una URI',
  E_BAD_EXTINF_ATTRS: 'atributos de #EXTINF mal formados (comillas sin cerrar)',
  E_GZIP_CORRUPT: 'gzip corrupto o truncado',
  E_NO_FINAL_NEWLINE: 'el fichero no termina en salto de linea (posible corte a mitad de linea)',
  E_TOO_MANY_CHANNELS: 'se supera maxChannels',
  E_PUBLISH: 'fallo al publicar (rename/fsync)',
  E_OUTPUT_MISMATCH: 'los bytes publicados no casan con el sha256 calculado'
};

function makeError(code, message, detail) {
  const e = new Error((code ? code + ': ' : '') + message);
  e.code = code || 'E_UNKNOWN';
  if (detail) e.detail = detail;
  return e;
}

/* ── clasificacion de lineas ──────────────────────────────────────────────────
 * Se reconocen las familias que el contrato exige. Todo lo demas cae en OTROS y
 * se conserva igual: el adaptador no necesita entender una etiqueta para
 * preservarla. */
const FAMILY_ORDER = [
  'EXTM3U', 'EXTINF', 'EXTHTTP', 'EXTVLCOPT', 'KODIPROP', 'EXTATTRFROMURL',
  'EXT_X', 'OTROS'
];

function stripBom(s) {
  return (s.charCodeAt(0) === 0xFEFF) ? s.slice(1) : s;
}

function familyOf(line) {
  if (line.charCodeAt(0) !== 35 /* # */) return null;
  const l = stripBom(line);
  if (l.startsWith('#EXTM3U')) return 'EXTM3U';
  if (l.startsWith('#EXTINF')) return 'EXTINF';
  if (l.startsWith('#EXTHTTP')) return 'EXTHTTP';
  if (l.startsWith('#EXTVLCOPT')) return 'EXTVLCOPT';
  if (l.startsWith('#KODIPROP')) return 'KODIPROP';
  if (l.startsWith('#EXTATTRFROMURL')) return 'EXTATTRFROMURL';
  if (l.startsWith('#EXT-X-')) return 'EXT_X';
  return 'OTROS';
}

/* Nombre exacto de la etiqueta: '#EXT-X-APE-RESILIENCE' de
 * '#EXT-X-APE-RESILIENCE:LEVEL=7,...'. OJO: corta en el primer ':' y compara
 * exacto, asi '#EXT-X-APE-DECLARED-I-FRAME-STREAM-INF' NO se confunde con
 * '#EXT-X-STREAM-INF'. */
function tagName(line) {
  if (line.charCodeAt(0) !== 35) return null;
  const l = stripBom(line);
  const c = l.indexOf(':');
  const n = c === -1 ? l : l.slice(0, c);
  return n.length > 1 ? n : null;
}

const URI_RE = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
function isUri(line) { return URI_RE.test(line); }

/* Se compara con startsWith y no con regex: esto corre en CADA linea de tags de
 * la lista. Con 2 regex por linea, 2,9 M lineas = 5,7 M ejecuciones de regex
 * (medido: ~8 s de los 26 s totales en una lista de 166 MiB). */
const OPENERS = [
  { kind: 'EXTINF', pre: '#EXTINF:' },
  { kind: 'STREAM_INF', pre: '#EXT-X-STREAM-INF:' }
];
function openerOf(line) {
  const l = stripBom(line);
  for (const o of OPENERS) if (l.startsWith(o.pre)) return o.kind;
  return null;
}

/* ── atributos: parser de solo lectura, lineal, sin retroceso ─────────────────
 * Devuelve { attrs, bare, title, duration, error }. Soporta valores
 * entrecomillados con \" escapado y claves sin valor (`url-tvg` en #EXTM3U). */
function parseAttributes(text) {
  const out = { attrs: Object.create(null), bare: [], title: null, duration: null, error: null };
  let i = 0;
  const n = text.length;
  while (i < n && text[i] !== ' ' && text[i] !== ',' && text[i] !== '\t') i++;
  out.duration = text.slice(0, i);
  while (i < n) {
    while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === ',')) i++;
    if (i >= n) break;
    const keyStart = i;
    while (i < n && text[i] !== '=' && text[i] !== ',' && text[i] !== ' ') i++;
    const key = text.slice(keyStart, i);
    if (i < n && text[i] === '=') {
      i++;
      if (text[i] === '"') {
        i++;
        let val = '';
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === '\\' && i + 1 < n) { val += text[i + 1]; i += 2; continue; }
          if (c === '"') { closed = true; i++; break; }
          val += c; i++;
        }
        if (!closed) { out.error = { at: key, reason: 'comilla sin cerrar' }; return out; }
        out.attrs[key] = val;
      } else {
        const vStart = i;
        // Un valor SIN comillas no lleva espacios: en el #EXTM3U el separador entre
        // atributos es el ESPACIO, no la coma. Cortar solo en ',' se comia el resto
        // de la cabecera (medido: catchup/url-tvg/refresh desaparecian).
        while (i < n && text[i] !== ',' && text[i] !== ' ' && text[i] !== '\t') i++;
        out.attrs[key] = text.slice(vStart, i).trim();
      }
    } else if (key) {
      out.bare.push(key);
    }
    if (i < n && text[i] === ',') {
      const after = text.slice(i + 1);
      if (!/^[A-Za-z0-9_.-]+\s*=/.test(after)) {
        out.title = after;
        i = n;
        break;
      }
    }
  }
  return out;
}

/* ── multiconjunto de tags ────────────────────────────────────────────────────
 * La clave incluye sha1 del contenido Y su longitud en bytes: dos lineas
 * distintas no colisionan y el conteo es exacto (multiconjunto, no conjunto). */
function multisetKey(line) {
  // acepta Buffer (bytes originales) o string; con Buffer no hay re-codificacion
  const b = Buffer.isBuffer(line) ? line : Buffer.from(String(line), 'utf8');
  const h = crypto.createHash('sha1').update(b).digest('hex').slice(0, 16);
  return h + '|' + b.length;
}
function multisetDigest(map) {
  const keys = Array.from(map.keys()).sort();
  const h = crypto.createHash('sha256');
  for (const k of keys) h.update(k + '=' + map.get(k) + '\n');
  return h.digest('hex');
}
function multisetDiff(a, b) {
  const out = [];
  for (const [k, v] of a) {
    const w = b.get(k) || 0;
    if (v > w) out.push({ key: k, count: v - w });
  }
  return out;
}

/* ── secretos ─────────────────────────────────────────────────────────────────
 * REGLA: el VALOR del secreto nunca se escribe en el indice, el manifiesto ni
 * ningun log. Solo se reporta DONDE estaba (linea, portador) y el NOMBRE de la
 * clave. La lista publicada conserva la URL original porque preservarla es el
 * contrato; el indice expone url_redacted + url_sha256. */
const SECRET_HEADERS = [
  'authorization', 'proxy-authorization', 'cookie', 'set-cookie',
  'x-api-key', 'x-auth-token', 'api-key', 'auth', 'token',
  'x-amz-security-token', 'x-goog-signature'
];
const SECRET_QUERY = [
  'sig', 'signature', 'token', 'password', 'passwd', 'pass', 'pwd',
  'api_key', 'apikey', 'auth', 'key', 'secret', 'hdnts', 'md5', 'st',
  'username', 'user', 'login', 'sp'
];

function redactQuery(u) {
  const q = u.indexOf('?');
  if (q === -1) return u;
  const head = u.slice(0, q);
  const parts = u.slice(q + 1).split('&').map(function (kv) {
    const eq = kv.indexOf('=');
    if (eq === -1) return kv;
    const k = kv.slice(0, eq);
    return SECRET_QUERY.indexOf(k.toLowerCase()) === -1 ? kv : k + '=***';
  });
  return head + '?' + parts.join('&');
}

function redactUserinfo(u) {
  const m = u.match(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/?#]*@)(.*)$/);
  if (!m) return u;
  const ui = m[2].slice(0, -1);
  const c = ui.indexOf(':');
  return m[1] + (c === -1 ? ui : ui.slice(0, c) + ':***') + '@' + m[3];
}

function redactXtreamPath(u) {
  return u.replace(
    /^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]+)\/(live|movie|series)\/([^/?#]+)\/([^/?#]+)(\/[^?#]*)?/,
    function (_all, origin, kind, _a, _b, rest) {
      return origin + '/' + kind + '/***/***' + (rest || '');
    });
}

function redactUrl(u) {
  return redactXtreamPath(redactQuery(redactUserinfo(String(u))));
}

function redactSecrets(text) {
  let t = String(text);
  t = t.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/g, '$1 ***');
  t = t.replace(/([?&](?:sig|signature|token|password|passwd|pass|pwd|api_key|apikey|auth|key|secret|hdnts|md5|st)=)[^&\s"']+/gi, '$1***');
  t = t.replace(/[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s"']*@/g, function (m) { return redactUserinfo(m); });
  return t;
}

/* Pre-filtro barato: solo se escanea a fondo la linea que PUEDE llevar credencial.
 * Sin esto se pagan 5 regex por linea en listas de ~2,9 M lineas. */
function maybeHasSecret(t) {
  return t.indexOf('EXTHTTP') !== -1 || t.indexOf('@') !== -1 || t.indexOf('?') !== -1 ||
    t.indexOf('ookie') !== -1 || t.indexOf('thorization') !== -1 || t.indexOf('earer') !== -1 ||
    t.indexOf('Basic') !== -1 || t.indexOf('oken') !== -1 || t.indexOf('assword') !== -1 ||
    t.indexOf('license_key') !== -1 || t.indexOf('api_key') !== -1;
}

/* Hallazgos SIN valor: solo linea, portador y nombre de clave. */
function findSecretsInLine(line, lineNo) {
  const found = [];
  const l = stripBom(line);

  if (l.startsWith('#EXTHTTP')) {
    const body = l.slice('#EXTHTTP'.length).replace(/^\s*:\s*/, '');
    let obj = null;
    try { obj = JSON.parse(body); } catch (_) {
      found.push({ line: lineNo, carrier: 'EXTHTTP', kind: 'json_invalido', key: null });
    }
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        if (SECRET_HEADERS.indexOf(k.toLowerCase()) !== -1) {
          found.push({ line: lineNo, carrier: 'EXTHTTP', kind: 'header', key: k });
        }
      }
    }
  }

  const hm = l.match(/\b(Authorization|Proxy-Authorization|Cookie|Set-Cookie)\s*:\s*\S/i);
  if (hm) found.push({ line: lineNo, carrier: 'linea', kind: 'header', key: hm[1] });

  if (/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/.test(l)) {
    found.push({ line: lineNo, carrier: 'linea', kind: 'token', key: null });
  }

  if (isUri(l)) {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*@/.test(l)) {
      found.push({ line: lineNo, carrier: 'uri', kind: 'userinfo', key: null });
    }
    const q = l.indexOf('?');
    if (q !== -1) {
      for (const kv of l.slice(q + 1).split('&')) {
        const eq = kv.indexOf('=');
        if (eq === -1) continue;
        if (SECRET_QUERY.indexOf(kv.slice(0, eq).toLowerCase()) !== -1 && kv.length > eq + 1) {
          found.push({ line: lineNo, carrier: 'uri', kind: 'query', key: kv.slice(0, eq) });
        }
      }
    }
    if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]+\/(live|movie|series)\/[^/]+\/[^/]+\//.test(l)) {
      found.push({ line: lineNo, carrier: 'uri', kind: 'ruta_xtream', key: null });
    }
  }
  return found;
}

/* ── lector por lineas que PRESERVA los bytes ─────────────────────────────────
 * No se usa readline: normaliza \r\n y pierde el terminador original. Aqui se
 * corta por 0x0A (que nunca aparece dentro de una secuencia UTF-8) y el 0x0D
 * previo se devuelve como parte del EOL. Asi la reescritura es byte-exacta con
 * LF, CRLF, mixtos o sin salto final. Memoria: O(linea mas larga).
 *
 * Se entrega el Buffer ORIGINAL de la linea (no solo su texto): reescribir el
 * texto re-codificado corromperia cualquier byte que no sea UTF-8 valido. El
 * texto se da aparte y SOLO para clasificar/parsear (asesor). */
function makeSplitter(maxLineBytes, onLine) {
  let pending = Buffer.alloc(0);
  let lineNo = 0;
  let tooLong = 0;

  function emit(buf, eol) {
    lineNo++;
    onLine(buf, buf.toString('utf8'), eol, lineNo);
  }

  return {
    push(chunk) {
      const buf = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let start = 0;
      for (;;) {
        const nl = buf.indexOf(0x0A, start);
        if (nl === -1) break;
        let end = nl;
        let eol = '\n';
        if (end > start && buf[end - 1] === 0x0D) { end--; eol = '\r\n'; }
        const lineBuf = buf.subarray(start, end);
        if (lineBuf.length > maxLineBytes) { tooLong++; }
        else emit(lineBuf, eol);
        start = nl + 1;
      }
      pending = start === 0 ? buf : buf.subarray(start);
      if (pending.length > maxLineBytes) { tooLong++; pending = Buffer.alloc(0); }
    },
    end() {
      if (pending.length) { emit(pending, ''); pending = Buffer.alloc(0); }
      return { lines: lineNo, tooLong: tooLong };
    },
    get tooLongCount() { return tooLong; }
  };
}

/* ── utilidades de fichero ─────────────────────────────────────────────────── */
function sha256FileSync(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 16);
  try {
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      h.update(buf.subarray(0, n));
    }
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

function sniffFormat(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(4);
  let n = 0;
  try { n = fs.readSync(fd, head, 0, 4, 0); } finally { fs.closeSync(fd); }
  const gz = n >= 2 && head[0] === 0x1F && head[1] === 0x8B;
  const bom = n >= 3 && head[0] === 0xEF && head[1] === 0xBB && head[2] === 0xBF;
  const ext = path.extname(file).toLowerCase();
  let inner = ext;
  if (ext === '.gz') inner = path.extname(file.slice(0, -3)).toLowerCase();
  return { gzip: gz, bom: bom, ext: ext, innerExt: inner, headBytes: n };
}

/* ── publicacion atomica ──────────────────────────────────────────────────────
 * Cada entrada ya esta escrita y fsync-eada en un `tmp` del MISMO directorio (y
 * por tanto del mismo volumen, requisito para que el rename sea atomico). El
 * orden es lista -> indice -> manifiesto: el manifiesto es el punto de commit.
 * Si un rename falla, se borran todos los temporales y no queda nada visible. */
function commitAtomically(outDir, entries) {
  const done = [];
  try {
    for (const e of entries) {
      fs.renameSync(e.tmp, e.final);
      done.push(e.final);
    }
    return done;
  } catch (err) {
    for (const e of entries) { try { fs.unlinkSync(e.tmp); } catch (_) {} }
    for (const f of done) { try { fs.unlinkSync(f); } catch (_) {} }
    throw makeError('E_PUBLISH', 'no se pudo publicar: ' + (err && err.message ? err.message : String(err)));
  }
}

/* Escribe un buffer en un temporal del outDir y lo fsync-ea. Devuelve la entrada. */
function writeTemp(outDir, name, buf) {
  const suffix = '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  const tmp = path.join(outDir, '.' + name + suffix);
  const fd = fs.openSync(tmp, 'wx', 0o644);
  try {
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off, off);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  return { name: name, tmp: tmp, final: path.join(outDir, name), bytes: buf.length };
}

function dedupeSecrets(list) {
  const seen = Object.create(null);
  const out = [];
  for (const s of list) {
    const k = s.carrier + '|' + s.kind + '|' + (s.key || '');
    if (seen[k]) {
      seen[k].count++;
      if (seen[k].lines.length < 8) seen[k].lines.push(s.line);
      continue;
    }
    seen[k] = { carrier: s.carrier, kind: s.kind, key: s.key, count: 1, lines: [s.line] };
    out.push(seen[k]);
  }
  return out;
}

function countFamiliesOfText(text) {
  const fam = Object.create(null);
  for (const line of String(text).split('\n')) {
    if (line.charCodeAt(0) === 35) {
      const f = familyOf(line);
      fam[f] = (fam[f] || 0) + 1;
    }
  }
  return fam;
}

async function multisetOfFile(file, maxLineBytes) {
  const map = new Map();
  const fam = Object.create(null);
  let tags = 0;
  const cache = new Map();
  const splitter = makeSplitter(maxLineBytes || (8 * 1024 * 1024), function (rawLine, text) {
    if (text.charCodeAt(0) === 35) {
      let k;
      if (text.indexOf('\uFFFD') !== -1) { k = multisetKey(rawLine); }
      else { k = cache.get(text); if (k === undefined) { k = multisetKey(rawLine); cache.set(text, k); } }
      map.set(k, (map.get(k) || 0) + 1);
      const f = familyOf(text);
      fam[f] = (fam[f] || 0) + 1;
      tags++;
    }
  });
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 1 << 16 })) splitter.push(chunk);
  splitter.end();
  return { map: map, digest: multisetDigest(map), families: fam, tags: tags };
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * processPlaylist — API principal
 * ═══════════════════════════════════════════════════════════════════════════════
 * opts:
 *   input         ruta del .m3u/.m3u8/.gz                      (obligatorio)
 *   outDir        directorio de publicacion                     (obligatorio)
 *   publish       true = escribe lista+indice+manifiesto        (def. true)
 *   listName      nombre del fichero de lista publicado         (def. list.<ext>)
 *   maxLineBytes  tope defensivo por linea                      (def. 8 MiB)
 *   maxChannels   tope de canales                               (def. 200000)
 *   log           funcion de log (se le aplica redactSecrets)   (def. null)
 *   revision      revision explicita                            (def. generada)
 */
async function processPlaylist(opts) {
  const started = Date.now();
  const input = opts && opts.input;
  if (!input) throw makeError('E_IO', 'falta opts.input');
  if (!opts.outDir) throw makeError('E_IO', 'falta opts.outDir');
  const publish = opts.publish !== false;
  const maxLineBytes = opts.maxLineBytes || (8 * 1024 * 1024);
  const maxChannels = opts.maxChannels || 200000;
  const log = typeof opts.log === 'function' ? opts.log : null;
  const say = function (msg) { if (log) log(redactSecrets(msg)); };

  let st;
  try { st = fs.statSync(input); } catch (e) {
    throw makeError('E_IO', 'no se puede leer la entrada: ' + (e && e.message ? e.message : String(e)));
  }
  if (!st.isFile()) throw makeError('E_IO', 'la entrada no es un fichero regular');
  if (st.size === 0) throw makeError('E_EMPTY_INPUT', 'la entrada tiene 0 bytes');

  const fmt = sniffFormat(input);
  const revision = opts.revision ||
    (new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + crypto.randomBytes(4).toString('hex'));

  fs.mkdirSync(opts.outDir, { recursive: true });
  const outNames = {
    list: opts.listName || ('list' + (fmt.innerExt === '.m3u' ? '.m3u' : '.m3u8')),
    index: opts.indexName || 'index.json',
    manifest: opts.manifestName || 'manifest.json'
  };

  const suf = '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  const tmpList = path.join(opts.outDir, '.' + outNames.list + suf);
  const tmpIndex = path.join(opts.outDir, '.' + outNames.index + suf);

  /* estado de parseo — O(nombres de tag), no O(bytes) */
  const famIn = Object.create(null);
  const tagCountIn = new Map();
  const msIn = new Map();
  /* Cache de claves de multiconjunto: una lista tiene ~800 lineas de tag
   * DISTINTAS y millones de repeticiones. Sin cache, un SHA1 OpenSSL por linea
   * cuesta ~58 s en 2,9 M lineas (medido). Solo se cachea cuando el decodificado
   * es sin perdida (sin U+FFFD): ahi el texto identifica los bytes de forma
   * biyectiva y la clave cacheada es exactamente la de los bytes. */
  const msCache = new Map();
  function msKeyOf(rawLine, text) {
    if (text.indexOf('\uFFFD') !== -1) return multisetKey(rawLine);   // decodificado con perdida: hashear bytes
    let k = msCache.get(text);
    if (k === undefined) { k = multisetKey(rawLine); msCache.set(text, k); }
    return k;
  }
  let lines = 0, tagLines = 0, uriLines = 0, blankLines = 0, otherLines = 0;
  let lastEol = 'x';   // '' = la ultima linea no traia terminador
  let firstUseful = null;
  let bomSeen = false;
  let flavor = 'desconocido';
  let channels = 0;
  let httpInHeader = null;
  let headerAttrs = null;
  const warnings = [];
  const secrets = [];
  let cur = null;

  const hOut = crypto.createHash('sha256');
  let outBytes = 0;
  let fdList = null, fdIndex = null, indexFirst = true;

  /* Buffer de salida: agrupa lineas y hace UNA escritura por bloque de 256 KiB.
   * Sin esto el coste es una syscall sincrona por linea (medido: 2,88 M lineas
   * de una lista de 1,3 GB = minutos en Windows). Memoria acotada por FLUSH. */
  const FLUSH_BYTES = 1 << 18;
  let outChunks = [], outPending = 0, outPos = 0;
  const NL = Buffer.from('\n', 'latin1');
  const CRLF = Buffer.from('\r\n', 'latin1');

  function writeFd(buf) {
    let w = 0;
    while (w < buf.length) w += fs.writeSync(fdList, buf, w, buf.length - w, outPos + w);
    outPos += buf.length;
    outBytes += buf.length;
    hOut.update(buf);
  }
  function queueOut(buf) {
    outChunks.push(buf);
    outPending += buf.length;
    if (outPending >= FLUSH_BYTES) flushOut();
  }
  function flushOut() {
    if (!outPending) return;
    const b = outChunks.length === 1 ? outChunks[0] : Buffer.concat(outChunks, outPending);
    outChunks = []; outPending = 0;
    writeFd(b);
  }

  function countHttpHeaders(l) {
    const body = l.slice('#EXTHTTP'.length).replace(/^\s*:\s*/, '');
    try {
      const o = JSON.parse(body);
      if (o && typeof o === 'object') {
        const keys = Object.keys(o);
        return {
          count: keys.length,
          keys_sha256: crypto.createHash('sha256').update(keys.slice().sort().join('|'), 'utf8').digest('hex')
        };
      }
    } catch (_) { return { count: null, keys_sha256: null, json_valid: false }; }
    return { count: null, keys_sha256: null };
  }

  function emitIndexChannel(ch) {
    fs.writeSync(fdIndex, Buffer.from((indexFirst ? '' : ',') + JSON.stringify(ch), 'utf8'));
    indexFirst = false;
  }

  /* valor del canal si lo declara; si no, el GLOBAL del #EXTM3U */
  function pickAttr(attrs, key) {
    if (attrs[key] != null) return attrs[key];
    if (headerAttrs && headerAttrs.attrs[key] != null) return headerAttrs.attrs[key];
    return null;
  }

  function closeBlock(reason) {
    if (!cur) return;
    if (!cur.uri) {
      throw makeError('E_TRUNCATED_BLOCK',
        'bloque abierto en la linea ' + cur.openLine + ' (' + cur.kind + ') sin URI' +
        (reason === 'eof' ? ' al llegar a EOF' : ' antes del siguiente abridor'),
        { openLine: cur.openLine, kind: cur.kind, reason: reason });
    }
    channels++;
    if (channels > maxChannels) {
      throw makeError('E_TOO_MANY_CHANNELS', 'mas de ' + maxChannels + ' canales');
    }
    emitIndexChannel({
      index: channels,
      opener: cur.kind,
      line: cur.openLine,
      uri_line: cur.uriLine,
      uri_offset_in_block: cur.uriOffset,
      duration: cur.duration,
      name: cur.title,
      tvg_id: cur.attrs['tvg-id'] != null ? cur.attrs['tvg-id'] : null,
      tvg_name: cur.attrs['tvg-name'] != null ? cur.attrs['tvg-name'] : null,
      tvg_logo: cur.attrs['tvg-logo'] != null ? redactUrl(cur.attrs['tvg-logo']) : null,
      tvg_chno: cur.attrs['tvg-chno'] != null ? cur.attrs['tvg-chno'] : null,
      tvg_shift: cur.attrs['tvg-shift'] != null ? cur.attrs['tvg-shift'] : null,
      group_title: cur.attrs['group-title'] != null ? cur.attrs['group-title'] : null,
      catchup: cur.attrs['catchup'] != null ? cur.attrs['catchup'] : null,
      catchup_source: cur.attrs['catchup-source'] != null ? cur.attrs['catchup-source'] : null,
      catchup_days: cur.attrs['catchup-days'] != null ? cur.attrs['catchup-days'] : null,
      // herencia: si el canal no lo declara, rige el atributo GLOBAL del #EXTM3U
      catchup_effective: pickAttr(cur.attrs, 'catchup'),
      catchup_source_effective: pickAttr(cur.attrs, 'catchup-source'),
      catchup_days_effective: pickAttr(cur.attrs, 'catchup-days'),
      url_redacted: redactUrl(cur.uri),
      url_sha256: crypto.createHash('sha256').update(cur.uri, 'utf8').digest('hex'),
      attributes: Object.keys(cur.attrs).length,
      tags_in_block: cur.tagCount,
      tags_before_uri: cur.preUri,
      tags_after_uri: cur.postUri,
      http_headers: cur.httpHeaders
    });
    cur = null;
  }

  function onLine(rawLine, text, eol, lineNo) {
    lines++;
    lastEol = eol;
    /* Se escribe el Buffer ORIGINAL + su terminador original, sin re-codificar.
     * Se encola ANTES de validar: si algo falla, el temporal se borra. */
    queueOut(rawLine);
    if (eol === '\n') queueOut(NL);
    else if (eol === '\r\n') queueOut(CRLF);

    const l = stripBom(text);
    if (lineNo === 1 && text.charCodeAt(0) === 0xFEFF) bomSeen = true;

    if (l.trim() === '') { blankLines++; return; }
    if (firstUseful === null) firstUseful = l;

    /* Los secretos se buscan en TODA linea util, no solo en las etiquetas: la
     * credencial mas comun esta en la URI (userinfo, ?token=, ruta xtream). */
    /* Escaneo de credenciales:
     *   · URI  -> SIEMPRE completo. Hay ~1 por canal (barato) y la credencial
     *             mas comun vive ahi (userinfo, ?token=, ruta estilo xtream
     *             /live/<user>/<pass>/<id>, que NO tiene ni '@' ni '?').
     *   · tag  -> solo si el pre-filtro barato dice que puede llevar una.
     * El pre-filtro NO se aplica a las URI: hacerlo perdia la ruta xtream sin
     * query (regresion detectada por el test de secretos). */
    const needSecretScan = (text.charCodeAt(0) === 35) ? maybeHasSecret(text) : URI_RE.test(text);
    if (needSecretScan) {
      const sec = findSecretsInLine(text, lineNo);
      if (sec.length) for (const s of sec) secrets.push(s);
    }

    if (text.charCodeAt(0) === 35) {          // etiqueta
      tagLines++;
      const fam = familyOf(l);
      famIn[fam] = (famIn[fam] || 0) + 1;
      const name = tagName(l);
      if (name) tagCountIn.set(name, (tagCountIn.get(name) || 0) + 1);
      const mk = msKeyOf(rawLine, text);   // bytes originales, una sola vez por linea distinta
      msIn.set(mk, (msIn.get(mk) || 0) + 1);

      if (fam === 'EXTM3U' && !headerAttrs) {
        // los atributos GLOBALES viven en el #EXTM3U: catchup, x-tvg-url, url-tvg…
        const hp = parseAttributes(l.slice('#EXTM3U'.length));
        headerAttrs = { attrs: hp.attrs, bare: hp.bare, error: hp.error };
      }

      if (fam === 'EXTHTTP') {
        if (cur) cur.httpHeaders = countHttpHeaders(l);
        else if (!httpInHeader) httpInHeader = countHttpHeaders(l);
      }

      const op = openerOf(l);
      if (op) {
        closeBlock('next');
        if (op === 'STREAM_INF') flavor = 'hls-master';
        else if (flavor === 'desconocido') flavor = 'm3u-plus';
        const parsed = parseAttributes(l.slice(l.indexOf(':') + 1));
        if (parsed.error) {
          throw makeError('E_BAD_EXTINF_ATTRS',
            'atributos mal formados en la linea ' + lineNo +
            ' (clave "' + parsed.error.at + '": ' + parsed.error.reason + ')',
            { line: lineNo, key: parsed.error.at });
        }
        cur = {
          kind: op, openLine: lineNo, attrs: parsed.attrs,
          duration: parsed.duration, title: parsed.title,
          uri: null, uriLine: null, uriOffset: 0,
          tagCount: 0, preUri: 0, postUri: 0, httpHeaders: null
        };
      } else if (cur) {
        cur.tagCount++;
        if (cur.uri) cur.postUri++; else cur.preUri++;
      }
      return;
    }

    if (isUri(l)) {
      uriLines++;
      if (!cur) {
        throw makeError('E_URI_WITHOUT_BLOCK',
          'URI en la linea ' + lineNo + ' sin abridor de bloque previo (#EXTINF / #EXT-X-STREAM-INF)',
          { line: lineNo });
      }
      if (cur.uri) {
        throw makeError('E_MULTIPLE_URI_IN_BLOCK',
          'segunda URI en el bloque abierto en la linea ' + cur.openLine,
          { openLine: cur.openLine, line: lineNo });
      }
      cur.uri = text;
      cur.uriLine = lineNo;
      cur.uriOffset = lineNo - cur.openLine;
      return;
    }

    otherLines++;
  }

  /* ── bucle de lectura ─────────────────────────────────────────────────────── */
  try {
    fdList = fs.openSync(tmpList, 'wx', 0o644);
    fdIndex = fs.openSync(tmpIndex, 'wx', 0o644);
    fs.writeSync(fdIndex, Buffer.from('{"schema":"' + SCHEMA_INDEX + '","revision":"' + revision +
      '","adapter_version":"' + ADAPTER_VERSION + '","channels":[', 'utf8'));

    const splitter = makeSplitter(maxLineBytes, onLine);
    let source;
    if (fmt.gzip) {
      const gun = zlib.createGunzip();
      const rs = fs.createReadStream(input, { highWaterMark: 1 << 16 });
      rs.on('error', function (e) { gun.destroy(e); });
      rs.pipe(gun);
      source = gun;
    } else {
      source = fs.createReadStream(input, { highWaterMark: 1 << 16 });
    }
    try {
      for await (const chunk of source) splitter.push(chunk);
    } catch (e) {
      if (e && e.code && String(e.code).startsWith('E_')) throw e;   // no reetiquetar
      if (fmt.gzip) throw makeError('E_GZIP_CORRUPT', 'gzip corrupto: ' + (e && e.message ? e.message : String(e)));
      throw makeError('E_IO', 'fallo de lectura: ' + (e && e.message ? e.message : String(e)));
    }
    const endInfo = splitter.end();
    if (endInfo.tooLong > 0) {
      throw makeError('E_LINE_TOO_LONG', endInfo.tooLong + ' linea(s) superan ' + maxLineBytes + ' bytes');
    }
    /* GUARD OPCIONAL (def. OFF): un fichero cuya ultima linea no lleva salto esta
     * cortado en algun sitio, pero "sin salto final" NO prueba truncamiento — hay
     * generadores que no lo emiten. Se expone como gate explicito, apagado por
     * defecto; ver el limite declarado en el informe. */
    if (opts.requireFinalNewline === true && lastEol === '') {
      throw makeError('E_NO_FINAL_NEWLINE',
        'la ultima linea no termina en salto de linea (posible corte a mitad de linea)');
    }

    closeBlock('eof');

    if (!firstUseful || !String(firstUseful).startsWith('#EXTM3U')) {
      throw makeError('E_MISSING_EXTM3U',
        'la primera linea util no es #EXTM3U (es: ' +
        JSON.stringify(String(firstUseful || '').slice(0, 60)) + ')',
        { firstLine: firstUseful ? String(firstUseful).slice(0, 60) : null });
    }
    if (!lines) throw makeError('E_EMPTY_INPUT', 'sin lineas');
    if (flavor === 'desconocido') {
      if (uriLines > 0) throw makeError('E_NO_BLOCKS', 'hay ' + uriLines + ' URI(s) sin ningun abridor de bloque');
      flavor = 'sin-cuerpo';
      warnings.push({ code: 'W_NO_BODY', message: 'la lista no contiene #EXTINF ni #EXT-X-STREAM-INF' });
    }

    fs.writeSync(fdIndex, Buffer.from('],"counts":' + JSON.stringify({
      lines: lines, tag_lines: tagLines, uri_lines: uriLines, blank_lines: blankLines,
      other_lines: otherLines, channels: channels
    }) + '}\n', 'utf8'));
    flushOut();
    fs.fsyncSync(fdList);
    fs.fsyncSync(fdIndex);
    fs.closeSync(fdList); fdList = null;
    fs.closeSync(fdIndex); fdIndex = null;
  } catch (err) {
    if (fdList !== null) { try { fs.closeSync(fdList); } catch (_) {} }
    if (fdIndex !== null) { try { fs.closeSync(fdIndex); } catch (_) {} }
    try { fs.unlinkSync(tmpList); } catch (_) {}
    try { fs.unlinkSync(tmpIndex); } catch (_) {}
    throw err;
  }

  const outSha256 = hOut.digest('hex');
  const inSha256 = sha256FileSync(input);

  /* multiconjunto de la SALIDA, calculado sobre los BYTES ESCRITOS (temp) */
  const outMs = await multisetOfFile(tmpList, maxLineBytes);
  const lost = multisetDiff(msIn, outMs.map);
  const added = multisetDiff(outMs.map, msIn);

  const famSorted = {};
  for (const f of FAMILY_ORDER) famSorted[f] = famIn[f] || 0;
  for (const k of Object.keys(famIn).sort()) if (!(k in famSorted)) famSorted[k] = famIn[k];
  const tagNameSorted = {};
  for (const k of Array.from(tagCountIn.keys()).sort()) tagNameSorted[k] = tagCountIn.get(k);

  const manifest = {
    schema: SCHEMA_MANIFEST,
    adapter_version: ADAPTER_VERSION,
    revision: revision,
    generated_at: new Date().toISOString(),
    input: {
      file: path.basename(input),
      bytes: st.size,
      sha256: inSha256,
      container: fmt.gzip ? 'gzip' : 'plain',
      format: fmt.gzip ? 'gz' : (fmt.innerExt || fmt.ext || 'desconocido'),
      inner_format: fmt.innerExt || null,
      bom: fmt.bom || bomSeen,
      decoded_bytes: outBytes,
      decoded_sha256: outSha256
    },
    output: {
      file: outNames.list,
      bytes: outBytes,
      sha256: outSha256,
      sha256_verified: false
    },
    index: { file: outNames.index, sha256: null },
    counts: {
      lines: lines, tag_lines: tagLines, uri_lines: uriLines,
      blank_lines: blankLines, other_lines: otherLines, channels: channels
    },
    flavor: flavor,
    header: headerAttrs ? {
      // atributos GLOBALES del #EXTM3U (catchup, EPG, logo…): se exponen porque
      // un canal sin catchup propio hereda estos, y el contrato los exige.
      attributes: headerAttrs.attrs,
      bare_keys: headerAttrs.bare,
      parse_error: headerAttrs.error || null,
      catchup: headerAttrs.attrs['catchup'] != null ? headerAttrs.attrs['catchup'] : null,
      catchup_source: headerAttrs.attrs['catchup-source'] != null ? headerAttrs.attrs['catchup-source'] : null,
      catchup_days: headerAttrs.attrs['catchup-days'] != null ? headerAttrs.attrs['catchup-days'] : null,
      x_tvg_url: headerAttrs.attrs['x-tvg-url'] != null ? headerAttrs.attrs['x-tvg-url'] : null,
      url_tvg: headerAttrs.attrs['url-tvg'] != null ? headerAttrs.attrs['url-tvg'] : null,
      x_tvg_logo: headerAttrs.attrs['x-tvg-logo'] != null ? redactUrl(headerAttrs.attrs['x-tvg-logo']) : null
    } : null,
    tags: {
      families: famSorted,
      out_families: outMs.families,
      distinct_names: tagCountIn.size,
      by_name: tagNameSorted,
      multiset_digest_in: multisetDigest(msIn),
      multiset_digest_out: outMs.digest,
      multiset_size: msIn.size
    },
    preservation: {
      policy: 'verbatim-byte-exact',
      lost: lost.length,
      added: added.length,
      identical: lost.length === 0 && added.length === 0,
      lost_detail: lost.slice(0, 20),
      added_detail: added.slice(0, 20),
      byte_identical_to_input: fmt.gzip ? false : (outSha256 === inSha256),
      note: fmt.gzip
        ? 'entrada comprimida: la lista publicada es el contenido descomprimido (bytes distintos, contenido identico)'
        : 'la lista publicada es byte-identica a la entrada'
    },
    secrets: {
      count: secrets.length,
      redacted_in: [outNames.index, outNames.manifest, 'log'],
      not_redacted_in: [outNames.list],
      findings: dedupeSecrets(secrets)
    },
    warnings: warnings,
    timings_ms: { total: 0 }
  };

  let published = null;
  let verifiedPostRename = false;
  if (publish) {
    const idxBytes = fs.statSync(tmpIndex).size;
    manifest.index.bytes = idxBytes;
    manifest.index.sha256 = sha256FileSync(tmpIndex);
    manifest.timings_ms.total = Date.now() - started;
    // verdad comprobable antes de publicar: el sha256 calculado al escribir es el
    // de los bytes que estan en el temporal que se va a renombrar
    manifest.output.sha256_verified_on_temp = (sha256FileSync(tmpList) === outSha256);

    const listEntry = { name: outNames.list, tmp: tmpList, final: path.join(opts.outDir, outNames.list) };
    const idxEntry = { name: outNames.index, tmp: tmpIndex, final: path.join(opts.outDir, outNames.index) };
    const manEntry = writeTemp(opts.outDir, outNames.manifest,
      Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'));

    const listShaInTemp = sha256FileSync(tmpList);
    if (listShaInTemp !== outSha256) {
      // coherencia interna: el sha256 calculado al escribir debe ser el del temp
      try { fs.unlinkSync(tmpList); } catch (_) {}
      try { fs.unlinkSync(tmpIndex); } catch (_) {}
      try { fs.unlinkSync(manEntry.tmp); } catch (_) {}
      throw makeError('E_OUTPUT_MISMATCH', 'el sha256 calculado no coincide con el temporal escrito');
    }

    published = commitAtomically(opts.outDir, [listEntry, idxEntry, manEntry]);

    /* verificacion POST-rename: los hashes del manifiesto casan con los BYTES
     * realmente publicados. Si no casan, se retira la publicacion entera. */
    const listPub = path.join(opts.outDir, outNames.list);
    const idxPub = path.join(opts.outDir, outNames.index);
    const okList = sha256FileSync(listPub) === manifest.output.sha256 &&
      fs.statSync(listPub).size === manifest.output.bytes;
    const okIdx = sha256FileSync(idxPub) === manifest.index.sha256;
    if (!okList || !okIdx) {
      for (const f of published) { try { fs.unlinkSync(f); } catch (_) {} }
      throw makeError('E_OUTPUT_MISMATCH',
        'lo publicado no casa con el manifiesto (lista_ok=' + okList + ', indice_ok=' + okIdx + ')');
    }
    verifiedPostRename = true;
  } else {
    try { fs.unlinkSync(tmpList); } catch (_) {}
    try { fs.unlinkSync(tmpIndex); } catch (_) {}
  }

  say('adapter rev=' + revision + ' canales=' + channels + ' tags=' + tagLines +
    ' sha=' + outSha256.slice(0, 12) + ' perdidas=' + lost.length + ' anadidas=' + added.length);

  return {
    ok: true,
    revision: revision,
    manifest: manifest,
    published: published,
    verified_post_rename: verifiedPostRename,
    multiset_in: { digest: multisetDigest(msIn), size: msIn.size },
    multiset_out: { digest: outMs.digest, size: outMs.map.size, families: outMs.families, tags: outMs.tags },
    lost: lost,
    added: added
  };
}

module.exports = {
  ADAPTER_VERSION: ADAPTER_VERSION,
  SCHEMA_MANIFEST: SCHEMA_MANIFEST,
  SCHEMA_INDEX: SCHEMA_INDEX,
  ERROR_CODES: ERROR_CODES,
  FAMILY_ORDER: FAMILY_ORDER,
  processPlaylist: processPlaylist,
  familyOf: familyOf,
  tagName: tagName,
  openerOf: openerOf,
  isUri: isUri,
  parseAttributes: parseAttributes,
  redactUrl: redactUrl,
  redactSecrets: redactSecrets,
  findSecretsInLine: findSecretsInLine,
  countFamiliesOfText: countFamiliesOfText,
  multisetDigest: multisetDigest,
  multisetOfFile: multisetOfFile,
  sha256FileSync: sha256FileSync,
  sniffFormat: sniffFormat
};
