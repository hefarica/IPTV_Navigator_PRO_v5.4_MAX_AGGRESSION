#!/usr/bin/env node
/**
 * ape-profile-project.js — PROYECTOR de listas APE por PLANTILLA DE PERFIL + NONCES.
 *
 * MISION
 *   Reducir una lista .m3u8 APE (1.040+ lineas de metadata por canal) a:
 *     (a) UNA plantilla por forma de canal, con los valores nonce sustituidos por marcadores;
 *     (b) por canal: sus valores nonce + el parche de las lineas que no se derivan de la plantilla.
 *   La reconstruccion desde la lista proyectada debe devolver el fichero ORIGINAL byte a byte
 *   (sha256 identico). Si no coincide, el verificador sale con codigo 5 y NO declara nada.
 *
 * REGLAS DURAS QUE ESTE CODIGO IMPONE
 *   R1. NO toca el generador (m3u8-typed-arrays-ultimate.js) ni ape-profiles-config.js.
 *       Solo LEE una lista ya generada y escribe una proyeccion nueva.
 *   R2. NO se pierde NI UNA linea: la reconstruccion es byte-exacta y se prueba por sha256.
 *   R3. NUNCA sobreescribe la lista servida: se niega a escribir sobre el fichero de entrada
 *       y rechaza destinos dentro de directorios de publicacion servida.
 *   R4. Cero mocks: todo sale del fichero real. Los numeros que imprime son medidos.
 *   R5. Procesa BYTES, no UTF-8: las lineas se decodifican en latin1 (1 byte = 1 caracter),
 *       de modo que un fichero truncado o con bytes invalidos se reconstruye igual.
 *
 * MODELO MEDIDO (no inventado; ver tools/quality/test_ape_profile_project.js)
 *   - Un canal = un bloque de lineas: #EXTINF ... (n lineas) ... URL.
 *   - El bloque tiene una FORMA: (perfil, tier de fallback, numero de lineas, secuencia de tags).
 *     Los canales de la misma forma comparten plantilla. En la lista medida salen 26 formas
 *     sobre 8 pares (perfil,tier) y 21.224 canales.
 *   - Dentro del bloque, los valores que cambian de canal a canal se extraen de los tags
 *     portadores medidos en la propia lista (carriers). Esos valores son las "nonces" del canal
 *     y en la plantilla quedan como marcadores {SID} {NONCE} {REQUEST} {SESSION} {HASH8} {CHID}.
 *     La sustitucion es POR VALOR, no por tag: en la lista medida los tags CMaf-SESSION, TELCHEMY-SID
 *     y RESILIENCE-SID llevan EL MISMO valor que IDEMPOTENCIA-SID, asi que un solo {SID} los cubre
 *     todos. Cada linea se tokeniza solo si la ida y vuelta es exacta; si no, queda literal.
 *   - Todo lo que no se deriva (nombre del canal, URL, EXTINF, rotacion de UA/IP, timestamp,
 *     y el blob #EXTHTTP con su juego de modulos opcionales) va al parche del canal,
 *     referenciando un DICCIONARIO global deduplicado: asi lo que se repite se guarda UNA vez.
 *
 * LIMITE MEDIDO (honesto, 2026-11-15 sobre scratch/APE_LISTA_HARNESS.m3u8, 1.311.382.485 B)
 *   El motor de plantilla+nonces deriva el 95,4 % de las lineas (parche medio 48,69 de 1.054).
 *   El 4,6 % restante concentra el tamano: #EXTHTTP son ~7,4 KB por canal (21.224 lineas distintas;
 *   de sus 202 claves, ~20 cambian por canal y cambian de FORMA —claves que aparecen y desaparecen—
 *   no solo de valor). Por eso el contenedor de TEXTO queda en 250.760.470 B (ratio 0,191218, PEOR
 *   que la lista LIGHT de 186.789.613 B) y el contenedor GZIP en 18.991.757 B (ratio 0,014482,
 *   9,84 veces menor que LIGHT). Ambos se declaran; no se esconde el que pierde.
 *   Reproduccion: node tools/quality/test_ape_profile_project.js
 *
 * FORMATO EMITIDO (JSONL tipado; NO es una lista reproducible: no se sirve)
 *   Preambulo:
 *     #EXTM3U
 *     #EXT-X-VERSION:9
 *     #EXT-X-APE-PROJECTION:<FORMAT>
 *     #EXT-X-APE-PROJECTION-MODE:projection-only-not-playable
 *     #EXT-X-APE-PROJECTION-ORIGINAL-BYTES / -ORIGINAL-SHA256 / -ORIGINAL-LINES
 *     #EXT-X-APE-PROJECTION-CHANNELS / -TEMPLATES / -DICT-ENTRIES / -VARS / -FINAL-NEWLINE
 *     #EXT-X-APE-PROJECTION-CONTAINER:text-jsonl|gzip/text-jsonl
 *   Cuerpo (una linea = un registro JSON autocontenido):
 *     {"t":"H","o":<offset>,"l":[lineas]}            cabecera original, literal
 *     {"t":"T","k":"P3+F2#1052.a1b2c3d4","o":<off>,"l":[lineas]}  plantilla (con marcadores)
 *     {"t":"F","k":<plantilla>,"f":"0110..."}        flags: 1 = linea tokenizada, 0 = literal
 *     {"t":"D","i":<base>,"l":[lineas]}              trozo del diccionario (lineas literales)
 *     {"t":"C","k":<plantilla>,"v":[sid,nonce,...],"p":[idx,ref,idx,ref,...]}  canal
 *
 * RECONSTRUCCION
 *   lineas_del_canal = plantilla[k]
 *   para i en 0..n-1: si (i,ref) esta en p -> diccionario[ref]   (literal, sin sustitucion)
 *                     si no              -> plantilla[i] con {MARCADOR} sustituido por v
 *   fichero = unir(cabecera + bloques de todos los canales, "\n") + "\n" si FINAL-NEWLINE
 *
 * USO
 *   node ape-profile-project.js project <in.m3u8> <out.m3u8> [--gz] [--no-selfverify] [--limit N]
 *   node ape-profile-project.js verify  <projected.m3u8> <original.m3u8>
 *   node ape-profile-project.js info    <file.m3u8>
 *
 *   --gz   escribe el artefacto como gzip (magic 1f 8b). `verify` lo detecta solo.
 *          El JSON de salida informa bytes_out (artefacto real), bytes_out_plain,
 *          ratio y ratio_plain: los dos numeros, medidos.
 *
 * SALIDAS
 *   project -> JSON {canales, plantillas, lineas_plantilla, bytes_in, bytes_out, ratio,
 *                    sha256_in, sha256_out, verificado, sha256_reconstruido, ...}
 *   verify  -> JSON {ok, sha256_original, sha256_reconstruido, canales, bytes}; exit 5 si difiere.
 *
 * SIN dependencias externas (zlib es stdlib de Node). Node >= 14. Determinista. Sin red.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const TOOL = 'ape-profile-project';
const VERSION = '1.0.0';
const FORMAT = 'ape-profile-template+nonce/1';

/* ────────────────────────────────────────────────────────────────────────────────
 * 1. VARIABLES POR CANAL (nonces) — portadores medidos en la lista
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Cada entrada es [NOMBRE_MARCADOR, tag_portador]. El tag es el nombre SIN ':'.
 * El valor es el resto de la linea tras el ':' (recortado a la derecha).
 * Se toman del bloque de cada canal; el primero que aparezca manda.
 */
const VAR_CARRIERS = [
  ['SID', '#EXT-X-APE-IDEMPOTENCIA-SID'],
  ['NONCE', '#EXT-X-APE-POLIMORFISMO-NONCE'],
  ['REQUEST', '#EXT-X-APE-POLIMORFISMO-REQUEST'],
  ['SESSION', '#EXT-X-APE-POLIMORFISMO-SESSION'],
  ['HASH8', '#EXT-X-APE-POLIMORFISMO-LIST-HASH'],
  ['CHID', '#EXT-X-APE-IDEMPOTENCIA-CHANNEL-ID']
];
const VAR_NAMES = VAR_CARRIERS.map((c) => c[0]);
const VAR_IDS = Object.create(null);
VAR_NAMES.forEach((n, i) => { VAR_IDS[n] = i; });
const CARRIER_INDEX = Object.create(null);
VAR_CARRIERS.forEach(([name, tag], i) => { CARRIER_INDEX[tag] = i; });

/** Un valor mas corto que esto no se tokeniza: seria ruido y colisionaria con texto comun. */
const MIN_TOKEN_LEN = 4;

/* Tags que declaran el perfil y el tier del canal (medidos en la lista real). */
const TAG_PROFILE = '#EXT-X-APE-IDEMPOTENCIA-PROFILE';
const TAG_PROFILE_ALT = '#EXT-X-APE-QUALITY-OVERRIDE';
const TAG_TIER = '#EXT-X-APE-FALLBACK-TIER';

const DICT_CHUNK = 512;
const LINE_CHUNK_BYTES = 262144;

/* ────────────────────────────────────────────────────────────────────────────────
 * 2. LECTURA BYTE-EXACTA
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Recorre un fichero por lineas separadas por 0x0A, decodificando en latin1 para que
 * cada byte sea exactamente un caracter. Llama onLine(line) por cada linea terminada en \n
 * y devuelve el resto final SIN salto de linea (o null si el fichero acaba en \n).
 * onChunk(buffer) recibe cada bloque tal cual, para hashear sin releer.
 */
function scanFile(file, onLine, onChunk) {
  const fd = fs.openSync(file, 'r');
  const CH = 8 << 20;
  const buf = Buffer.allocUnsafe(CH);
  let rest = null;
  let read;
  let bytes = 0;
  try {
    while ((read = fs.readSync(fd, buf, 0, CH, null)) > 0) {
      bytes += read;
      if (onChunk) onChunk(buf.subarray(0, read));
      let start = 0;
      for (let i = 0; i < read; i++) {
        if (buf[i] === 10) {
          let line;
          if (rest) {
            line = Buffer.concat([rest, buf.subarray(start, i)]).toString('latin1');
            rest = null;
          } else {
            line = buf.toString('latin1', start, i);
          }
          onLine(line);
          start = i + 1;
        }
      }
      if (start < read) {
        const tail = Buffer.from(buf.subarray(start, read)); // copia: buf se reutiliza
        rest = rest ? Buffer.concat([rest, tail]) : tail;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return { bytes, rest: rest && rest.length ? rest.toString('latin1') : null };
}

/** sha256 de un fichero, por streaming. */
function sha256File(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(8 << 20);
  let read;
  try {
    while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

/* ────────────────────────────────────────────────────────────────────────────────
 * 3. FORMA DEL CANAL Y EXTRACCION DE VARIABLES
 * ──────────────────────────────────────────────────────────────────────────────── */

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Recorre el bloque UNA vez y devuelve:
 *   tagSeq   cadena con la secuencia de tags (para la firma de forma)
 *   vars     valores de los portadores
 *   profile / tier  declarados por el canal
 * Una linea que no empieza por '#' cuenta como '<URL>'.
 */
function analyseBlock(lines) {
  const vars = new Array(VAR_NAMES.length);
  const tags = new Array(lines.length);
  let profile = null;
  let tier = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.charCodeAt(0) !== 35 /* # */) { tags[i] = '<URL>'; continue; }
    const colon = line.indexOf(':');
    const tag = colon > 0 ? line.slice(0, colon) : line;
    tags[i] = tag;
    const vi = CARRIER_INDEX[tag];
    if (vi !== undefined && vars[vi] === undefined) {
      vars[vi] = colon > 0 ? line.slice(colon + 1).replace(/[\r\n]+$/, '') : '';
    }
    if (tag === TAG_PROFILE && profile === null) profile = colon > 0 ? line.slice(colon + 1) : '';
    else if (tag === TAG_TIER && tier === null) tier = colon > 0 ? line.slice(colon + 1) : '';
  }
  if (profile === null) {
    // Respaldo medido: el perfil tambien viaja en QUALITY-OVERRIDE:PROFILE=P3,BW=...
    for (let i = 0; i < lines.length; i++) {
      const tag = tags[i];
      if (tag === TAG_PROFILE_ALT) {
        const m = /PROFILE=([^,\s]+)/.exec(lines[i]);
        if (m) { profile = m[1]; break; }
      }
    }
  }
  return { vars, tags, profile, tier };
}

/** Firma de forma: perfil + tier + numero de lineas + hash de la secuencia de tags. */
function shapeKey(analysed) {
  const seq = analysed.tags.join('|');
  return (
    (analysed.profile === null ? '?' : analysed.profile) +
    '+' + (analysed.tier === null ? '?' : analysed.tier) +
    '#' + analysed.tags.length +
    '.' + fnv1a(seq).toString(16).padStart(8, '0')
  );
}

/* ────────────────────────────────────────────────────────────────────────────────
 * 4. PLANTILLA: TOKENIZACION Y COMPILACION
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Sustituye cada valor nonce del canal por su marcador, en TODO el bloque.
 * Los valores mas largos primero: asi un valor que contiene a otro (session contiene
 * sid y nonce; hash8 es prefijo de nonce) no se parte a medias.
 *
 * Devuelve { lines, flags }: flags[i] === 1 solo cuando la linea admite ida y vuelta
 * EXACTA con los marcadores (valor -> marcador -> valor). Si una linea trae un texto
 * que ya parecia un marcador, se deja literal y su flag es 0: sin esa comprobacion,
 * una linea con '{SID}' literal se corromperia al reconstruir.
 */
function tokenizeBlock(lines, vars) {
  const pairs = [];
  for (let i = 0; i < VAR_NAMES.length; i++) {
    const v = vars[i];
    if (typeof v === 'string' && v.length >= MIN_TOKEN_LEN) pairs.push([v, '{' + VAR_NAMES[i] + '}']);
  }
  pairs.sort((a, b) => b[0].length - a[0].length || (a[0] < b[0] ? -1 : 1));
  const flags = new Uint8Array(lines.length);
  const out = new Array(lines.length);
  if (!pairs.length) { for (let i = 0; i < lines.length; i++) out[i] = lines[i]; return { lines: out, flags }; }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let s = line;
    let touched = false;
    for (let k = 0; k < pairs.length; k++) {
      if (s.indexOf(pairs[k][0]) !== -1) { s = s.split(pairs[k][0]).join(pairs[k][1]); touched = true; }
    }
    if (!touched) { out[i] = line; continue; }
    if (substituteMarkers(s, vars) === line) { out[i] = s; flags[i] = 1; }
    else out[i] = line; /* ida y vuelta no exacta: literal */
  }
  return { lines: out, flags };
}

/** Sustituye los marcadores de una linea por los valores del canal (ruta lenta, para comprobaciones). */
function substituteMarkers(line, vars) {
  let pos = 0;
  let scan = 0;
  let out = '';
  for (;;) {
    const open = line.indexOf('{', scan);
    if (open === -1) break;
    const close = line.indexOf('}', open + 1);
    if (close === -1) break;
    const vi = VAR_IDS[line.slice(open + 1, close)];
    if (vi === undefined) { scan = open + 1; continue; } /* llave literal: no se consume */
    out += line.slice(pos, open) + (vars[vi] === undefined || vars[vi] === null ? '' : vars[vi]);
    pos = close + 1;
    scan = pos;
  }
  return out + line.slice(pos);
}

/**
 * Compila una plantilla para renderizar rapido: por linea, o un literal {l},
 * o segmentos {s:[texto, varIdx, texto, varIdx, texto]}.
 * `flags[i] === 0` fuerza literal: esa linea no lleva NINGUN marcador propio.
 *
 * Las llaves que NO son marcadores (las de un JSON, por ejemplo) se conservan
 * literales: se avanza el cursor de busqueda pero NO el de consumo. Sin esto se
 * perdia la llave y la linea mas grande del canal (#EXTHTTP) caia siempre al parche.
 */
function compileTemplate(lines, flags) {
  const out = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (flags && flags[i] === 0) { out[i] = { l: line }; continue; }
    let segs = null;
    let pos = 0;
    let scan = 0;
    for (;;) {
      const open = line.indexOf('{', scan);
      if (open === -1) break;
      const close = line.indexOf('}', open + 1);
      if (close === -1) break;
      const name = line.slice(open + 1, close);
      const vi = VAR_IDS[name];
      if (vi === undefined) { scan = open + 1; continue; }
      if (!segs) segs = [];
      segs.push(line.slice(pos, open));
      segs.push(vi);
      pos = close + 1;
      scan = pos;
    }
    if (!segs) { out[i] = { l: line }; continue; }
    segs.push(line.slice(pos));
    out[i] = { s: segs };
  }
  return out;
}

/** Renderiza una linea compilada con los valores del canal. */
function renderLine(compiled, vars) {
  if (compiled.l !== undefined) return compiled.l;
  const segs = compiled.s;
  let out = segs[0];
  for (let k = 1; k < segs.length; k += 2) {
    const v = vars[segs[k]];
    out += (v === undefined || v === null ? '' : v) + segs[k + 1];
  }
  return out;
}

/** Serializa los flags de tokenizacion como '0'/'1' (1 char por linea). */
function flagsToString(flags) {
  let s = '';
  for (let i = 0; i < flags.length; i++) s += flags[i] ? '1' : '0';
  return s;
}
function flagsFromString(str, n) {
  const f = new Uint8Array(n);
  if (!str) return f;
  for (let i = 0; i < n; i++) f[i] = str.charCodeAt(i) === 49 ? 1 : 0;
  return f;
}
function countFlags(flags) {
  let c = 0;
  for (let i = 0; i < flags.length; i++) if (flags[i]) c++;
  return c;
}

/* ────────────────────────────────────────────────────────────────────────────────
 * 5. ESCRITURA POR BLOQUES
 * ──────────────────────────────────────────────────────────────────────────────── */

function makeWriter(fd) {
  let acc = [];
  let accBytes = 0;
  let total = 0;
  return {
    push(str) {
      acc.push(str);
      accBytes += str.length + 1;
      total += Buffer.byteLength(str, 'utf8') + 1;
      if (accBytes >= 4 << 20) this.flush();
    },
    pushUtf8(str) {
      // mismo contrato pero contabilizando bytes reales
      acc.push(str);
      accBytes += str.length;
      total += Buffer.byteLength(str, 'utf8');
      if (accBytes >= 4 << 20) this.flush();
    },
    flush() {
      if (!acc.length) return;
      const s = acc.join('\n') + '\n';
      fs.writeSync(fd, Buffer.from(s, 'utf8'));
      acc = [];
      accBytes = 0;
    },
    get bytes() { return total; }
  };
}

/* ────────────────────────────────────────────────────────────────────────────────
 * 6. PROJECT
 * ──────────────────────────────────────────────────────────────────────────────── */

function ratioStr(n) {
  if (!isFinite(n)) return 'n/a';
  if (n === 0) return '0';
  return n < 0.01 ? n.toPrecision(4) : n.toFixed(6);
}

function isProtectedTarget(inPath, outPath) {
  const a = path.resolve(inPath);
  const b = path.resolve(outPath);
  if (a === b) return 'entrada == salida (la proyeccion nunca sobreescribe el original)';
  /* normalizado a '/' y sin letra de unidad para que el guard valga igual en Windows y en el VPS */
  const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase().replace(/^[a-z]:/, '');
  const dir = norm(path.dirname(b));
  const forbidden = ['/var/www/lists', '/var/www/html'];
  for (const f of forbidden) {
    if (dir === f || dir.indexOf(f + '/') === 0) {
      return 'destino dentro de un directorio de publicacion servida: ' + f;
    }
  }
  return null;
}

function project(inPath, outPath, opts) {
  const t0 = Date.now();
  const blocked = isProtectedTarget(inPath, outPath);
  if (blocked) {
    return { ok: false, error: 'destino_protegido', detail: blocked };
  }
  if (!fs.existsSync(inPath)) return { ok: false, error: 'no_existe_entrada', detail: inPath };
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 0;

  const bodyPath = outPath + '.body.tmp';
  let bodyFd;
  try {
    bodyFd = fs.openSync(bodyPath, 'w');
  } catch (e) {
    return { ok: false, error: 'no_puede_escribir_salida', detail: String(e.message), ruta: outPath };
  }
  const w = makeWriter(bodyFd);

  const hashIn = crypto.createHash('sha256');

  /* estado */
  let inHeader = true;
  let headerCount = 0;
  let headerLines = [];
  let cur = null;
  let channels = 0;
  let lineTotal = 0;
  let truncated = false;
  let headerOffset = 0;

  const templates = new Map(); // key -> {lines(compiladas), raw, n, patchLines}
  const templateOrder = [];
  const dictIndex = new Map();
  const dictLines = [];
  let dictPending = [];
  let dictBase = 0;

  let patchLinesTotal = 0;
  let dictRefs = 0;

  function flushDict() {
    if (!dictPending.length) return;
    w.push(JSON.stringify({ t: 'D', i: dictBase, l: dictPending }));
    dictBase += dictPending.length;
    dictPending = [];
  }

  function dictRef(line) {
    let idx = dictIndex.get(line);
    if (idx === undefined) {
      idx = dictLines.length;
      dictLines.push(line);
      dictIndex.set(line, idx);
      dictPending.push(line);
      if (dictPending.length >= DICT_CHUNK) flushDict();
    }
    dictRefs++;
    return idx;
  }

  /** Emite `lines` troceadas por tamano. `baseOffset` continua la numeracion. Devuelve el offset final. */
  function emitLines(kind, key, lines, baseOffset) {
    let offset = baseOffset | 0;
    let chunk = [];
    let bytes = 0;
    for (let i = 0; i < lines.length; i++) {
      chunk.push(lines[i]);
      bytes += lines[i].length + 2;
      if (bytes >= LINE_CHUNK_BYTES) {
        const rec = { t: kind, o: offset, l: chunk };
        if (key !== null) rec.k = key;
        w.push(JSON.stringify(rec));
        offset += chunk.length;
        chunk = [];
        bytes = 0;
      }
    }
    if (chunk.length) {
      const rec = { t: kind, o: offset, l: chunk };
      if (key !== null) rec.k = key;
      w.push(JSON.stringify(rec));
      offset += chunk.length;
    }
    return offset;
  }

  function emitChannel(lines) {
    const analysed = analyseBlock(lines);
    const key = shapeKey(analysed);
    let tpl = templates.get(key);
    if (tpl === undefined) {
      const tk = tokenizeBlock(lines, analysed.vars);
      tpl = {
        raw: tk.lines,
        flags: tk.flags,
        compiled: compileTemplate(tk.lines, tk.flags),
        n: 0,
        patchLines: 0,
        lines: tk.lines.length,
        tokenized: countFlags(tk.flags)
      };
      templates.set(key, tpl);
      templateOrder.push(key);
      emitLines('T', key, tk.lines, 0);
      w.push(JSON.stringify({ t: 'F', k: key, f: flagsToString(tk.flags) }));
    }
    tpl.n++;

    /* parche: toda linea que no se deriva de la plantilla + los nonces */
    const patch = [];
    let patchCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const expected = renderLine(tpl.compiled[i], analysed.vars);
      if (expected !== lines[i]) {
        patch.push(i, dictRef(lines[i]));
        patchCount++;
      }
    }
    tpl.patchLines += patchCount;
    patchLinesTotal += patchCount;

    const v = [];
    for (let k = 0; k < analysed.vars.length; k++) v.push(analysed.vars[k] === undefined ? '' : analysed.vars[k]);
    const rec = { t: 'C', k: key, v: v };
    if (patch.length) rec.p = patch;
    w.push(JSON.stringify(rec));
  }

  function onLine(line) {
    lineTotal++;
    if (inHeader) {
      if (line.startsWith('#EXTINF')) {
        inHeader = false;
        cur = [line];
      } else {
        headerLines.push(line);
        headerCount++;
        if (headerLines.length >= 512) { headerOffset = emitLines('H', null, headerLines, headerOffset); headerLines = []; }
      }
      return;
    }
    if (!cur) return; /* truncado por --limit: se ignora el resto */
    if (line.startsWith('#EXTINF')) {
      if (limit && channels >= limit) { truncated = true; cur = null; return; }
      emitChannel(cur);
      channels++;
      cur = [line];
      return;
    }
    cur.push(line);
  }

  const scan = scanFile(inPath, onLine, (chunk) => hashIn.update(chunk));
  /* resto sin salto de linea final */
  const finalNewline = scan.rest === null;
  if (scan.rest !== null) {
    lineTotal++;
    if (inHeader) {
      headerLines.push(scan.rest);
      headerCount++;
    } else if (cur) {
      cur.push(scan.rest);
    }
  }
  if (!inHeader && cur && cur.length && (!limit || channels < limit)) {
    emitChannel(cur);
    channels++;
  }
  /* con --limit la proyeccion es parcial por definicion: no se declara verificada */
  if (limit > 0 && channels >= limit) truncated = true;
  if (headerLines.length) headerOffset = emitLines('H', null, headerLines, headerOffset);
  flushDict();
  w.flush();
  fs.closeSync(bodyFd);

  const bytesIn = scan.bytes;
  const sha256In = hashIn.digest('hex');

  /* ── ensamblado: preambulo + cuerpo ── */
  const preamble = [];
  preamble.push('#EXTM3U');
  preamble.push('#EXT-X-VERSION:9');
  preamble.push('#EXT-X-APE-PROJECTION:' + FORMAT);
  preamble.push('#EXT-X-APE-PROJECTION-MODE:projection-only-not-playable');
  preamble.push('#EXT-X-APE-PROJECTION-TOOL:' + TOOL + '/' + VERSION);
  preamble.push('#EXT-X-APE-PROJECTION-ORIGINAL-BYTES:' + bytesIn);
  preamble.push('#EXT-X-APE-PROJECTION-ORIGINAL-SHA256:' + sha256In);
  preamble.push('#EXT-X-APE-PROJECTION-ORIGINAL-LINES:' + lineTotal);
  preamble.push('#EXT-X-APE-PROJECTION-CHANNELS:' + channels);
  preamble.push('#EXT-X-APE-PROJECTION-TEMPLATES:' + templates.size);
  preamble.push('#EXT-X-APE-PROJECTION-DICT-ENTRIES:' + dictLines.length);
  preamble.push('#EXT-X-APE-PROJECTION-VARS:' + VAR_NAMES.join(','));
  preamble.push('#EXT-X-APE-PROJECTION-FINAL-NEWLINE:' + (finalNewline ? '1' : '0'));
  preamble.push('#EXT-X-APE-PROJECTION-CONTAINER:' + (opts.gz ? 'gzip/text-jsonl' : 'text-jsonl'));
  preamble.push('#EXT-X-APE-PROJECTION-BODY:jsonl');

  const plainPath = outPath + '.plain.tmp';
  const plainFd = fs.openSync(plainPath, 'w');
  try {
    fs.writeSync(plainFd, Buffer.from(preamble.join('\n') + '\n', 'utf8'));
    const bodyFd2 = fs.openSync(bodyPath, 'r');
    const buf = Buffer.allocUnsafe(8 << 20);
    let read;
    try {
      while ((read = fs.readSync(bodyFd2, buf, 0, buf.length, null)) > 0) {
        fs.writeSync(plainFd, buf.subarray(0, read));
      }
    } finally {
      fs.closeSync(bodyFd2);
    }
  } finally {
    fs.closeSync(plainFd);
  }
  fs.unlinkSync(bodyPath);

  const bytesPlain = fs.statSync(plainPath).size;
  let gzUsed = false;
  if (opts.gz) {
    const buf = fs.readFileSync(plainPath);
    const g = zlib.gzipSync(buf, { level: 9 });
    fs.writeFileSync(outPath, g);
    fs.unlinkSync(plainPath);
    gzUsed = true;
  } else {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    fs.renameSync(plainPath, outPath);
  }

  const stats = {
    ok: true,
    canales: channels,
    plantillas: templates.size,
    lineas_plantilla: 0,
    lineas_plantilla_rango: [0, 0],
    bytes_in: bytesIn,
    bytes_out: fs.statSync(outPath).size,
    bytes_out_plain: bytesPlain,
    contenedor: gzUsed ? 'gzip' : 'texto',
    ratio: 0,
    ratio_plain: bytesIn ? bytesPlain / bytesIn : 0,
    sha256_in: sha256In,
    sha256_out: sha256File(outPath),
    verificado: false,
    sha256_reconstruido: null,
    lineas_in: lineTotal,
    lineas_cabecera: headerCount,
    diccionario_entradas: dictLines.length,
    referencias_diccionario: dictRefs,
    parche_medio_lineas: channels ? +(patchLinesTotal / channels).toFixed(2) : 0,
    vars: VAR_NAMES.slice(),
    final_newline: finalNewline,
    truncado_por_limite: truncated,
    plantillas_detalle: []
  };

  /* detalle de plantillas: lineas y uso */
  let lineasMin = Infinity;
  let lineasMax = 0;
  const counts = new Map();
  for (const [key, tpl] of templates) {
    stats.plantillas_detalle.push({
      clave: key,
      lineas: tpl.lines,
      lineas_con_marcadores: tpl.tokenized,
      canales: tpl.n,
      parche_lineas_total: tpl.patchLines,
      parche_medio_lineas: tpl.n ? +(tpl.patchLines / tpl.n).toFixed(2) : 0
    });
    lineasMin = Math.min(lineasMin, tpl.lines);
    lineasMax = Math.max(lineasMax, tpl.lines);
    counts.set(tpl.lines, (counts.get(tpl.lines) || 0) + tpl.n);
  }
  stats.plantillas_detalle.sort((a, b) => b.canales - a.canales);
  stats.lineas_plantilla_rango = [lineasMin === Infinity ? 0 : lineasMin, lineasMax];
  let modeLines = 0;
  let modeCount = -1;
  for (const [ln, c] of counts) if (c > modeCount) { modeCount = c; modeLines = ln; }
  stats.lineas_plantilla = modeLines;

  stats.bytes_out = fs.statSync(outPath).size;
  stats.ratio = bytesIn ? stats.bytes_out / bytesIn : 0;

  /* ── autoverificacion: reconstruir y comparar sha256 (por defecto ON) ── */
  if (truncated) {
    /* con --limit la proyeccion cubre solo los primeros N canales: el sha256 del
       original NO aplica. No se declara verificado. */
    stats.verificado = null;
    stats.motivo_no_verificado = 'truncado_por_limite';
  } else if (!opts.noSelfVerify) {
    const vres = verify(outPath, null, { quiet: true, expectSha256: sha256In, expectBytes: bytesIn });
    stats.verificado = !!vres.ok;
    stats.sha256_reconstruido = vres.sha256_reconstruido || null;
    stats.canales_reconstruidos = vres.canales;
    stats.bytes_reconstruidos = vres.bytes;
    if (!vres.ok) {
      stats.ok = false;
      stats.error = 'reconstruccion_no_coincide';
      stats.detalle_verificacion = vres;
    }
  }
  stats.ms = Date.now() - t0;
  stats.version = VERSION;
  return stats;
}

/* ────────────────────────────────────────────────────────────────────────────────
 * 7. VERIFY — reconstruye y compara
 * ──────────────────────────────────────────────────────────────────────────────── */

function verify(projPath, origPath, opts) {
  opts = opts || {};
  if (!fs.existsSync(projPath)) return { ok: false, error: 'no_existe_proyectada', detail: projPath };
  const t0 = Date.now();
  /* La proyeccion se escribe en UTF-8 (es JSON). Se lee en UTF-8 para recuperar
     EXACTAMENTE los mismos code points que se decodificaron del original en latin1.
     Al reconstruir con Buffer.from(str,'latin1') se obtienen los bytes originales.
     Si el fichero es gzip (magic 1f 8b), se descomprime antes de leer. */
  const raw = fs.readFileSync(projPath);
  const isGzip = raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b;
  const text = (isGzip ? require('zlib').gunzipSync(raw) : raw).toString('utf8');
  const lines = text.split('\n');

  let channels = 0;
  let templates = 0;
  let dictEntries = 0;
  let finalNewline = true;
  let declaredSha = null;
  let declaredBytes = null;
  let body = false;

  const headerLines = [];
  const tplLines = new Map();
  const tplFlags = new Map();
  const dict = [];
  const channelRecords = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!body) {
      if (line.startsWith('#EXT-X-APE-PROJECTION-BODY:')) { body = true; continue; }
      if (line.startsWith('#EXT-X-APE-PROJECTION-ORIGINAL-SHA256:')) declaredSha = line.slice(line.indexOf(':') + 1);
      else if (line.startsWith('#EXT-X-APE-PROJECTION-ORIGINAL-BYTES:')) declaredBytes = Number(line.slice(line.indexOf(':') + 1));
      else if (line.startsWith('#EXT-X-APE-PROJECTION-FINAL-NEWLINE:')) finalNewline = line.slice(line.indexOf(':') + 1) === '1';
      continue;
    }
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch (e) {
      return { ok: false, error: 'json_invalido', line: i + 1, detail: String(e.message) };
    }
    switch (rec.t) {
      case 'H': {
        const off = rec.o | 0;
        for (let k = 0; k < rec.l.length; k++) headerLines[off + k] = rec.l[k];
        break;
      }
      case 'T': {
        let arr = tplLines.get(rec.k);
        if (!arr) { arr = []; tplLines.set(rec.k, arr); templates++; }
        const off = rec.o | 0;
        for (let k = 0; k < rec.l.length; k++) arr[off + k] = rec.l[k];
        break;
      }
      case 'D': {
        const base = rec.i | 0;
        for (let k = 0; k < rec.l.length; k++) dict[base + k] = rec.l[k];
        dictEntries = dict.length;
        break;
      }
      case 'F': tplFlags.set(rec.k, rec.f || ''); break;
      case 'C': channelRecords.push(rec); channels++; break;
      default:
        return { ok: false, error: 'registro_desconocido', line: i + 1, detail: String(rec.t) };
    }
  }

  if (!body) return { ok: false, error: 'sin_cuerpo_jsonl' };
  if (declaredSha === null) return { ok: false, error: 'sin_sha256_declarado' };

  /* reconstruccion + hash por streaming, sin materializar el fichero */
  const h = crypto.createHash('sha256');
  let totalBytes = 0;
  let first = true;
  function emit(line) {
    const s = first ? line : '\n' + line;
    first = false;
    h.update(Buffer.from(s, 'latin1'));
    totalBytes += Buffer.byteLength(s, 'latin1');
  }

  for (let i = 0; i < headerLines.length; i++) emit(headerLines[i]);

  const compiledCache = new Map();
  for (let ci = 0; ci < channelRecords.length; ci++) {
    const rec = channelRecords[ci];
    const tplRaw = tplLines.get(rec.k);
    if (!tplRaw) return { ok: false, error: 'plantilla_ausente', canal: ci, clave: rec.k };
    let compiled = compiledCache.get(rec.k);
    if (!compiled) {
      compiled = compileTemplate(tplRaw, flagsFromString(tplFlags.get(rec.k), tplRaw.length));
      compiledCache.set(rec.k, compiled);
    }
    const vars = rec.v || [];
    const patch = rec.p;
    const n = compiled.length;
    for (let i = 0; i < n; i++) {
      let line = renderLine(compiled[i], vars);
      if (patch) {
        for (let k = 0; k < patch.length; k += 2) {
          if (patch[k] === i) { line = dict[patch[k + 1]]; break; }
        }
      }
      emit(line);
    }
  }
  if (finalNewline) { h.update(Buffer.from('\n', 'latin1')); totalBytes += 1; }

  const reconSha = h.digest('hex');
  let result = {
    ok: reconSha === declaredSha,
    sha256_reconstruido: reconSha,
    sha256_declarado: declaredSha,
    canales: channels,
    plantillas: templates,
    diccionario_entradas: dictEntries,
    bytes: totalBytes,
    bytes_declarados: declaredBytes,
    ms: Date.now() - t0
  };

  if (opts.expectSha256) {
    result.ok = result.ok && reconSha === opts.expectSha256;
    result.sha256_esperado = opts.expectSha256;
  }
  if (opts.expectBytes) {
    result.ok = result.ok && totalBytes === opts.expectBytes;
  }

  /* si se da el original, se comprueba contra el fichero real */
  if (origPath) {
    if (!fs.existsSync(origPath)) return { ok: false, error: 'no_existe_original', detail: origPath };
    const origSha = sha256File(origPath);
    const origBytes = fs.statSync(origPath).size;
    result.sha256_original = origSha;
    result.bytes_original = origBytes;
    result.ok = result.ok && reconSha === origSha && totalBytes === origBytes;
  }
  if (!result.ok) result.error = 'sha256_no_coincide';
  result.version = VERSION;
  return result;
}

/* ────────────────────────────────────────────────────────────────────────────────
 * 8. INFO — estructura medida de un fichero
 * ──────────────────────────────────────────────────────────────────────────────── */

function info(file) {
  if (!fs.existsSync(file)) return { ok: false, error: 'no_existe', detail: file };
  const t0 = Date.now();
  const hash = crypto.createHash('sha256');
  let inHeader = true;
  let headerCount = 0;
  let cur = null;
  let channels = 0;
  let lines = 0;
  let minB = Infinity;
  let maxB = 0;
  const shapes = new Map();
  const varsSeen = new Set();

  function finish(block) {
    if (!block || !block.length) return;
    const a = analyseBlock(block);
    const k = shapeKey(a);
    const s = shapes.get(k) || { canales: 0, lineas: a.tags.length, perfil: a.profile, tier: a.tier };
    s.canales++;
    shapes.set(k, s);
    minB = Math.min(minB, block.length);
    maxB = Math.max(maxB, block.length);
    for (let i = 0; i < a.vars.length; i++) if (a.vars[i] !== undefined) varsSeen.add(VAR_NAMES[i]);
  }
  function onLine(line) {
    lines++;
    if (inHeader) {
      if (line.startsWith('#EXTINF')) { inHeader = false; cur = [line]; } else headerCount++;
      return;
    }
    if (line.startsWith('#EXTINF')) { finish(cur); channels++; cur = [line]; return; }
    cur.push(line);
  }
  const scan = scanFile(file, onLine, (c) => hash.update(c));
  if (scan.rest !== null) {
    if (inHeader) headerCount++;
    else cur.push(scan.rest);
    lines++;
  }
  if (!inHeader && cur) { finish(cur); channels++; }
  return {
    ok: true,
    fichero: file,
    bytes: scan.bytes,
    sha256: hash.digest('hex'),
    lineas: lines,
    lineas_cabecera: headerCount,
    canales: channels,
    lineas_por_canal_rango: [minB === Infinity ? 0 : minB, maxB],
    formas: [...shapes.entries()].sort((a, b) => b[1].canales - a[1].canales).map(([k, s]) => ({
      clave: k, canales: s.canales, lineas: s.lineas, perfil: s.perfil, tier: s.tier
    })),
    vars_presentes: VAR_NAMES.filter((n) => varsSeen.has(n)),
    ms: Date.now() - t0
  };
}

/* ────────────────────────────────────────────────────────────────────────────────
 * 9. CLI
 * ──────────────────────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const opts = { flags: new Set(), args: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') {
      /* admite '--limit N' y '--limit=N' */
      const v = argv[i + 1];
      if (v !== undefined && !v.startsWith('--') && !isNaN(Number(v))) { opts.limit = Number(v); i++; opts.flags.add('--limit'); continue; }
      opts.flags.add('--limit');
      continue;
    }
    if (a.startsWith('--limit=')) { opts.limit = Number(a.slice(8)); opts.flags.add('--limit'); continue; }
    if (a.startsWith('--')) { opts.flags.add(a); continue; }
    opts.args.push(a);
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  const cmd = opts.args[0];
  const quiet = opts.flags.has('--quiet');

  function out(obj) {
    process.stdout.write(JSON.stringify(obj, null, 1) + '\n');
  }
  function die(code, obj) {
    process.stdout.write(JSON.stringify(obj, null, 1) + '\n');
    process.exit(code);
  }

  if (cmd === 'project') {
    const inPath = opts.args[1];
    const outPath = opts.args[2];
    if (!inPath || !outPath) die(2, { ok: false, error: 'uso', usage: 'project <in.m3u8> <out.m3u8> [--no-selfverify] [--limit N]' });
    const res = project(inPath, outPath, {
      noSelfVerify: opts.flags.has('--no-selfverify'),
      gz: opts.flags.has('--gz'),
      limit: opts.limit
    });
    if (!res.ok) die(res.error === 'destino_protegido' ? 3 : 5, res);
    out(res);
    return 0;
  }

  if (cmd === 'verify') {
    const projPath = opts.args[1];
    const origPath = opts.args[2];
    if (!projPath || !origPath) die(2, { ok: false, error: 'uso', usage: 'verify <projected.m3u8> <original.m3u8>' });
    const res = verify(projPath, origPath, {});
    if (!res.ok) die(5, Object.assign({ ok: false }, res));
    out(res);
    return 0;
  }

  if (cmd === 'info') {
    const file = opts.args[1];
    if (!file) die(2, { ok: false, error: 'uso', usage: 'info <file.m3u8>' });
    const res = info(file);
    if (!res.ok) die(5, res);
    out(res);
    return 0;
  }

  die(2, {
    ok: false,
    error: 'comando_desconocido',
    tool: TOOL,
    version: VERSION,
    uso: [
      'project <in.m3u8> <out.m3u8> [--gz] [--no-selfverify] [--limit N]',
      'verify  <projected.m3u8> <original.m3u8>',
      'info    <file.m3u8>'
    ]
  });
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { project, verify, info, tokenizeBlock, analyseBlock, shapeKey, VAR_NAMES, FORMAT, VERSION };
