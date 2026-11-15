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
 *   node ape-profile-project.js light   <lista_servida.m3u8> <out.m3u8> --origin <origen.m3u8>
 *                                       [--gz] [--no-selfverify] [--no-gz-size] [--limit N] [--report r.json]
 *   node ape-profile-project.js verify-light <lista_con_plantillas.m3u8> <origen.m3u8>
 *                                       [--channels 1,100,21000]
 *   node ape-profile-project.js verify  <projected.m3u8> <original.m3u8>
 *   node ape-profile-project.js info    <file.m3u8>
 *
 *   `light` es el modo de ESTE encargo: lleva las plantillas de perfil a la cabecera de la
 *   lista servida y deja en cada #EXTSHIMOTT la referencia `mp` que permite reconstruir las
 *   1.040 lineas de metadata de ese canal. Ver el bloque 9 de este mismo fichero.
 *
 *   --gz   escribe el artefacto como gzip (magic 1f 8b). `verify` lo detecta solo.
 *          El JSON de salida informa bytes_out (artefacto real), bytes_out_plain,
 *          ratio y ratio_plain: los dos numeros, medidos. En `light`, ademas, bytes_out_gz
 *          (gzip -9 medido del artefacto completo).
 *
 * DESPLIEGUE (NO se ejecuta aqui: lo aprueba el operador)
 *   1) dry-run a un fichero hermano, NUNCA sobre la lista servida:
 *        node /opt/ape-bin/ape-profile-project.js light \
 *          /var/www/lists/<BASE>_LIGHT.m3u8  /var/www/lists/<BASE>_LIGHT.m3u8.NEW \
 *          --origin /var/www/lists/<BASE>.m3u8 --gz --report /var/log/ape-light.json
 *   2) gate que decide (los tres a la vez):
 *        exit 0 · .verificado === true · checks 1/100/21000 con
 *        sha256_reconstruido === sha256_origen
 *   3) promover SOLO con autorizacion explicita y copia previa:
 *        cp -a <BASE>_LIGHT.m3u8 <BASE>_LIGHT.m3u8.bak-<stamp>
 *        mv <BASE>_LIGHT.m3u8.NEW <BASE>_LIGHT.m3u8
 *        mv <BASE>_LIGHT.m3u8.NEW.gz <BASE>_LIGHT.m3u8.gz
 *      rollback: mv <BASE>_LIGHT.m3u8.bak-<stamp> <BASE>_LIGHT.m3u8
 *   AVISO MEDIDO: ape-list-light.sh valida `grep -c '^#EXT-X-APE-' == 0` sobre la
 *   lista _LIGHT y consideraria corrupta esta salida por sus 10 lineas de cabecera.
 *   Ese guard esta FUERA de este fichero: debe relajarse a "0 fuera de la cabecera"
 *   antes de publicar, o el timer regenerara la lista y tirara las plantillas.
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
const VERSION = '1.1.0';
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

/* ════════════════════════════════════════════════════════════════════════════════
 * 9. LIGHT — PLANTILLAS DE PERFIL EN LA CABECERA + REFERENCIA POR CANAL
 *
 * QUE HACE ESTE MODO (medido sobre el ORIGEN real, no supuesto)
 *   Toma la LISTA SERVIDA (la que ya es OTT-valida: #EXTINF + #EXTHTTP +
 *   #EXTSHIMOTT + URL) y la ORIGEN (la que trae las 1.040 lineas de metadata por
 *   canal). Aprende, por FORMA de bloque, una plantilla con los valores nonce
 *   sustituidos por marcadores; la publica UNA vez en la cabecera (un tag por par
 *   perfil+tier); y en cada canal solo deja la referencia `mp` dentro del
 *   #EXTSHIMOTT que ya existe (que se conserva ENTERO: solo se le anade `mp`).
 *
 * POR QUE POR FORMA Y NO SOLO POR PAR (perfil,tier) — MEDIDO
 *   El bloque no mide lo mismo en todos los canales del mismo par: el origen real
 *   tiene 40 formas sobre 9 pares (rango 1.027..1.051 lineas). Una plantilla por
 *   par desalinea los indices y el "valor variable" pasa a ser el bloque entero.
 *   Por eso la plantilla de un par contiene VARIANTES, una por forma, y el canal
 *   declara cual usa (`v`). La cabecera sigue teniendo UN tag por perfil.
 *
 * LOS VALORES DE CADA CANAL (n)
 *   Se extraen de los tags portadores que el propio generador declara en el
 *   bloque (SID, NONCE, REQUEST, SESSION, LIST-HASH, TIMESTAMP, UA, IP, canal,
 *   nombre, spoof por familia, DENYLIST...). La sustitucion es POR VALOR: un solo
 *   valor cubre todas las lineas que lo repiten ({SID} aparece ~20 veces). Los
 *   valores que se repiten en el catalogo (UA, IP, paneles) se guardan UNA vez
 *   por par en un POOL y el canal lleva el INDICE (un numero), no la cadena.
 *   `n` es un ARRAY POSICIONAL alineado con `vars` (no un objeto con claves): en
 *   21.224 canales, ahorrarse ~20 claves por canal son ~2 MB de lista. El nombre
 *   de cada posicion viaja en el INDICE (`vars`), asi que el receptor sabe que
 *   n[0] es SID, n[1] NONCE, etc.
 *
 * LO QUE NO VIAJA EN `n` — EXTINF, EXTHTTP Y URL
 *   La lista servida YA lleva por canal su #EXTINF, su #EXTHTTP y su URL. La
 *   plantilla no los duplica: guarda su POSICION (`e` = indice de #EXTHTTP,
 *   `u` = indice de la URL) y la reconstruccion los toma de la propia lista. Lo
 *   que se reconstruye desde cabecera+`mp` son las 1.040 lineas de metadata que
 *   la lista ligera tira. Todo lo que no se deriva (lineas que cambian de FORMA
 *   dentro de la misma forma) va al parche `x` del canal, con la linea literal.
 *
 * FORMATO EMITIDO
 *   Cabecera (una vez, antes del primer #EXTINF):
 *     #EXT-X-APE-PROFILE-INDEX:{json}
 *     #EXT-X-APE-PROFILE-TEMPLATE:<par>:<base64(gzip(json))>   (x9)
 *   Canal: las lineas de la lista servida tal cual, con el #EXTSHIMOTT existente
 *     ampliado: {"ver":...,"id":...,...,"mp":{"p":"P3+T5","v":3,"n":[...],"x":{...}}}
 *
 * RECONSTRUCCION (contrato del receptor)
 *   variante = template[mp.p].variants[mp.v]
 *   para i en 0..n-1:
 *     i == 0        -> #EXTINF de la propia lista
 *     i == e        -> #EXTHTTP de la propia lista
 *     i == u        -> URL de la propia lista
 *     x[i] existe   -> x[i] (linea literal)
 *     si no         -> variante.l[i] con los numeros sustituidos por n[idx]
 *   El resultado debe ser IDENTICO al bloque del origen. Eso es lo que comprueba
 *   la autoverificacion: recorre la lista nueva Y el origen en paralelo y compara
 *   linea por linea los 21.224 canales.
 *
 * LIMITES HONESTOS
 *   - Lo que no es derivable de los portadores declarados se paga como parche.
 *     El informe incluye `parche_lineas_total` y `parche_por_tag` medidos.
 *   - El tamano que cuesta la cabecera se declara, no se esconde.
 *   - NO sustituye a la lista servida: escribe donde se le diga y se niega a
 *     escribir en directorios publicados (misma guarda que `project`).
 * ════════════════════════════════════════════════════════════════════════════════ */

const LIGHT_FORMAT = 'ape.profile-light/1';
const LIGHT_TEMPLATE_FORMAT = 'ape.profile-template/1';
const LIGHT_TEMPLATE_TAG = '#EXT-X-APE-PROFILE-TEMPLATE:';
const LIGHT_INDEX_TAG = '#EXT-X-APE-PROFILE-INDEX:';
const LIGHT_SHIM_TAG = '#EXTSHIMOTT:';
const LIGHT_APE_PREFIX = '#EXT-X-APE-';
/** Umbral de pool: un valor con <= N valores distintos por par viaja como indice. */
const LIGHT_POOL_MAX = 512;

/**
 * Portadores de valor del canal: [MARCADOR, spec, weak?]. La spec es:
 *   'TAG'                    -> el valor es el resto de la linea tras ':'
 *   ['TAG', 'CLAVE', 'SEP']  -> el valor es lo que sigue a CLAVE= hasta SEP
 * Los `weak` se aplican DESPUES de los fuertes: solo capturan el resto de la
 * linea cuando ningun portador fuerte la ha cubierto. Asi una linea compuesta
 * (p.ej. #EXT-X-CMAF-SESSION) se descompone en sus nonces, y una linea cuyo
 * contenido entero varia (p.ej. el panel HDR de #EXT-X-DATERANGE) se captura
 * como bloque.
 */
const LIGHT_VARS = [
  ['SID', '#EXT-X-APE-IDEMPOTENCIA-SID'],
  ['NONCE', '#EXT-X-APE-POLIMORFISMO-NONCE'],
  ['REQ', '#EXT-X-APE-POLIMORFISMO-REQUEST'],
  ['SESS', '#EXT-X-APE-POLIMORFISMO-SESSION'],
  ['LHASH', '#EXT-X-APE-POLIMORFISMO-LIST-HASH'],
  ['TS', '#EXT-X-APE-POLIMORFISMO-TIMESTAMP'],
  ['UA', '#EXT-X-APE-POLIMORFISMO-UA'],
  ['IP', '#EXT-X-APE-POLIMORFISMO-IP'],
  ['CHID', '#EXT-X-APE-IDEMPOTENCIA-CHANNEL-ID'],
  ['NAME', '#EXT-X-APE-IDEMPOTENCIA-CHANNEL-NAME'],
  ['DENY', '#EXT-X-APE-DENYLIST-REMOVED'],
  ['SAND', '#EXT-X-APE-SPOOF-ANDROID'],
  ['SIOS', '#EXT-X-APE-SPOOF-IOS'],
  ['SCHR', '#EXT-X-APE-SPOOF-CHROME'],
  ['STIV', '#EXT-X-APE-SPOOF-TIVIMATE'],
  ['SOTT', '#EXT-X-APE-SPOOF-OTT'],
  ['SEXO', '#EXT-X-APE-SPOOF-EXOPLAYER'],
  ['SVLC', '#EXT-X-APE-SPOOF-VLC'],
  ['SSAF', '#EXT-X-APE-SPOOF-SAFARI'],
  ['SIP', '#EXT-X-APE-SPOOF-IP'],
  ['SKODI', '#EXT-X-APE-SPOOF-KODI'],
  ['PHKODI', '#EXT-X-PHANTOM-HYDRA-UA-KODI'],
  ['SPU', ['#EXT-X-APE-SPOOF', 'UA=', '']],
  ['SVID', ['#EXT-X-STREAM-INF', 'STABLE-VARIANT-ID="', '"']],
  ['SEED', ['#EXT-X-APE-URL2-DEVICE', 'SEED=', '']],
  ['EXUA', '#EXTVLCOPT:http-user-agent'],
  ['EXREF', '#EXTVLCOPT:http-referrer'],
  ['KUA', '#KODIPROP:inputstream.adaptive.network_user_agent'],
  ['MREF', ['#KODIPROP:inputstream.adaptive.manifest_headers', 'Referer=', '&']],
  ['MUA', ['#KODIPROP:inputstream.adaptive.manifest_headers', 'User-Agent=', '&']],
  ['SREF', ['#KODIPROP:inputstream.adaptive.stream_headers', 'Referer=', '&']],
  ['SUA', ['#KODIPROP:inputstream.adaptive.stream_headers', 'User-Agent=', '&']],
  ['MSEC', '#EXT-X-APE-MULTI-SERVER-SECONDARY'],
  ['MTER', '#EXT-X-APE-MULTI-SERVER-TERTIARY'],
  ['CBRAND', '#EXT-X-APE-CONTENT-HEURISTIC-BRAND'],
  ['CCLASS', '#EXT-X-APE-CONTENT-CLASS'],
  ['CTYPE', '#EXT-X-APE-CONTENT-HEURISTIC-TYPE'],
  ['CVMAF', '#EXT-X-APE-CONTENT-HEURISTIC-VMAF'],
  ['K4CT', '#EXT-X-APE-4KFALSE-CONTENT-TYPE'],
  ['HDRID', ['#EXT-X-DATERANGE', 'ID="', '"']],
  ['SRT', '#EXT-X-APE-SRT-PROTOCOL', true],
  ['BITDEPTH', '#EXT-X-APE-BIT-DEPTH', true],
  ['HDRBITDEPTH', '#EXT-X-APE-HDR-BITDEPTH', true],
  ['QOBITDEPTH', '#EXT-X-APE-QUALITY-OVERRIDE-BITDEPTH', true],
  ['REBUFTOL', '#EXT-X-APE-HTTP-REBUFFER-TOLERANCE', true],
  ['AUDIOTRK', '#EXT-X-APE-AUDIO-TRACK-ID', true],
  ['BNLIVE', '#EXT-X-APE-BUFFER-NUCLEAR-LIVE-DELAY', true],
  ['BNHOLD', '#EXT-X-APE-BUFFER-NUCLEAR-HOLD-BACK', true],
  ['BNPART', '#EXT-X-APE-BUFFER-NUCLEAR-PART-HOLD-BACK', true],
  ['BBRMAX', '#EXT-X-APE-BBR-HIJACK-RELOAD-MAXPERIOD', true],
  ['BBRMIN', '#EXT-X-APE-BBR-HIJACK-RELOAD-MINPERIOD', true],
  ['CORTELEM', '#EXT-X-APE-CORTEX-TELEMETRY-REBUFFER', true],
  ['CLOCKSYNC', '#EXT-X-APE-SYS-SYS-CLOCK-SYNCHRO', true],
  ['CONF', '#EXT-X-APE-CONFIDENCE', true],
  ['LCEVCPREQ', '#EXT-X-APE-LCEVC-PLAYER-REQUIRED', true],
  ['TLS', '#EXT-X-APE-TLS-COHERENCE', true]
];
const LIGHT_VAR_NAMES = LIGHT_VARS.map((v) => v[0]);
const LIGHT_VAR_SPEC = Object.create(null);
for (const v of LIGHT_VARS) LIGHT_VAR_SPEC[v[0]] = { spec: v[1], weak: v[2] === true };
const LIGHT_MARKER_RE = /\{([A-Z][A-Z0-9_]{0,15})\}/g;

/** Nombre de tag de una linea: '#EXT-X-...' o '#EXTINF' / '<URL>' / '<EMPTY>'. */
function lightTagOf(line) {
  if (!line) return '<EMPTY>';
  if (line.charCodeAt(0) !== 35) return '<URL>';
  const c = line.indexOf(':');
  return c > 0 ? line.slice(0, c) : line;
}

/** Valor de un portador en una linea (null si no esta). */
function lightCarrierValue(line, name) {
  const spec = LIGHT_VAR_SPEC[name].spec;
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  if (typeof spec === 'string') return line.slice(colon + 1);
  const search = spec[1];
  const at = line.indexOf(search, colon + 1);
  if (at < 0) return null;
  const from = at + search.length;
  const sep = spec[2];
  if (sep === '') return line.slice(from);
  const end = line.indexOf(sep, from);
  return end < 0 ? line.slice(from) : line.slice(from, end);
}

/** Analiza un bloque del ORIGEN: par, forma, portadores y posiciones especiales. */
function lightAnalyse(block) {
  const tags = new Array(block.length);
  const vars = new Map();
  let profile = null;
  let tier = null;
  let exthttpAt = -1;
  let urlAt = -1;
  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    const tag = lightTagOf(line);
    tags[i] = tag;
    if (tag === '#EXTINF') {
      if (profile === null) {
        const m = /ape-profile="(P[0-9](?:\.5)?)"/.exec(line);
        if (m) profile = m[1];
      }
    } else if (tag === '#EXTHTTP') {
      if (exthttpAt < 0) {
        exthttpAt = i;
        const m = /"X-APE-Tier"\s*:\s*"(T[0-9]|F[0-9])"/.exec(line);
        if (m) tier = m[1];
      }
    } else if (tag === '<URL>') {
      if (urlAt < 0) urlAt = i;
    }
    if (tag.charCodeAt(0) !== 35) continue;
    for (let k = 0; k < LIGHT_VARS.length; k++) {
      const name = LIGHT_VAR_NAMES[k];
      if (vars.has(name)) continue;
      const spec = LIGHT_VARS[k][1];
      const tagName = typeof spec === 'string' ? spec : spec[0];
      if (tag !== tagName) continue;
      const val = lightCarrierValue(line, name);
      if (val !== null && val !== '') vars.set(name, val);
    }
  }
  const pair = (profile === null ? '?' : profile) + '+' + (tier === null ? '?' : tier);
  const shape = pair + '#' + block.length + '.' + fnv1a(tags.join('|')).toString(16).padStart(8, '0');
  return { tags, vars, profile, tier, pair, shape, exthttpAt, urlAt };
}

/** Sustituye los marcadores conocidos de una linea por los valores del canal. */
function lightRender(line, vars) {
  let out = '';
  let pos = 0;
  LIGHT_MARKER_RE.lastIndex = 0;
  let m;
  while ((m = LIGHT_MARKER_RE.exec(line)) !== null) {
    const v = vars.get(m[1]);
    if (v === undefined) continue; /* llave literal: se conserva */
    out += line.slice(pos, m.index) + v;
    pos = m.index + m[0].length;
  }
  return out + line.slice(pos);
}

/**
 * Tokeniza un bloque: sustituye cada valor portador por su marcador.
 * Fuertes primero (longitud descendente) y `weak` despues, de modo que un valor
 * compuesto no se come los marcadores ya puestos. Solo se marca una linea si la
 * ida y vuelta es EXACTA; si no, la linea queda literal (flag 0).
 */
function lightTokenize(block, vars) {
  const strong = [];
  const weak = [];
  const tailMap = new Map(); // valor -> marcador (para el anclaje de cola completa)
  for (let k = 0; k < LIGHT_VARS.length; k++) {
    const name = LIGHT_VAR_NAMES[k];
    const v = vars.get(name);
    if (typeof v !== 'string' || v.length === 0) continue;
    const marker = '{' + name + '}';
    if (!tailMap.has(v)) tailMap.set(v, marker);
    if (v.length < MIN_TOKEN_LEN) continue;
    (LIGHT_VAR_SPEC[name].weak ? weak : strong).push([v, marker]);
  }
  const byLen = (a, b) => b[0].length - a[0].length || (a[0] < b[0] ? -1 : 1);
  strong.sort(byLen);
  weak.sort(byLen);
  const flags = new Uint8Array(block.length);
  const out = new Array(block.length);
  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    /* ANCLAJE DE COLA COMPLETA: linea == 'TAG:' + valor. Exacto por construccion
       y permite tokenizar valores cortos (p.ej. CHANNEL-ID:1) sin buscar
       subcadenas cortas en todo el bloque, que corromperian otras lineas. */
    const colon = line.indexOf(':');
    if (colon > 0) {
      const tail = line.slice(colon + 1);
      const marker = tailMap.get(tail);
      if (marker !== undefined) {
        const candidate = line.slice(0, colon + 1) + marker;
        if (lightRender(candidate, vars) === line) { out[i] = candidate; flags[i] = 1; continue; }
      }
    }
    let s = line;
    let touched = false;
    for (let k = 0; k < strong.length; k++) {
      if (s.indexOf(strong[k][0]) !== -1) { s = s.split(strong[k][0]).join(strong[k][1]); touched = true; }
    }
    for (let k = 0; k < weak.length; k++) {
      if (s.indexOf(weak[k][0]) !== -1) { s = s.split(weak[k][0]).join(weak[k][1]); touched = true; }
    }
    if (!touched) { out[i] = line; continue; }
    if (lightRender(s, vars) === line) { out[i] = s; flags[i] = 1; }
    else out[i] = line;
  }
  return { lines: out, flags };
}

/**
 * Compila una plantilla a segmentos: [texto, slot, texto, ...].
 * Linea sin marcador -> [linea] (literal). `flags[i]===0` fuerza literal.
 */
function lightCompile(tokenLines, flags, vars) {
  const slotIndex = new Map();
  vars.forEach((n, i) => slotIndex.set(n, i));
  const out = new Array(tokenLines.length);
  for (let i = 0; i < tokenLines.length; i++) {
    const line = tokenLines[i];
    if (flags && flags[i] === 0) { out[i] = [line]; continue; }
    const segs = [];
    let pos = 0;
    LIGHT_MARKER_RE.lastIndex = 0;
    let m;
    while ((m = LIGHT_MARKER_RE.exec(line)) !== null) {
      const idx = slotIndex.get(m[1]);
      if (idx === undefined) continue; /* llave literal */
      segs.push(line.slice(pos, m.index));
      segs.push(idx);
      pos = m.index + m[0].length;
    }
    if (!segs.length) { out[i] = [line]; continue; }
    segs.push(line.slice(pos));
    out[i] = segs;
  }
  return out;
}

/** Renderiza una linea compilada con los valores posicionales del canal. */
function lightRenderCompiled(seg, values, pool, vars) {
  if (seg.length === 1) return seg[0];
  let out = '';
  for (let k = 0; k < seg.length; k++) {
    const item = seg[k];
    if ((k & 1) === 0) { out += item; continue; }
    const v = values[item];
    if (v === undefined || v === null) continue;
    if (typeof v === 'number') {
      const arr = pool[vars[item]];
      out += arr && v < arr.length ? arr[v] : '';
    } else out += v;
  }
  return out;
}

/* ── lectura/escritura por lineas, pull-based ──────────────────────────────── */

function makeLineReader(file) {
  const fd = fs.openSync(file, 'r');
  const CH = 4 << 20;
  const buf = Buffer.allocUnsafe(CH);
  const pending = [];
  let pi = 0;
  let tail = null;
  let eof = false;
  let bytes = 0;
  function fill() {
    if (eof) return false;
    const read = fs.readSync(fd, buf, 0, CH, null);
    if (read <= 0) {
      eof = true;
      if (tail && tail.length) { pending.push(tail.toString('latin1')); tail = null; }
      return false;
    }
    bytes += read;
    let start = 0;
    for (let i = 0; i < read; i++) {
      if (buf[i] === 10) {
        let line;
        if (tail) { line = Buffer.concat([tail, buf.subarray(start, i)]).toString('latin1'); tail = null; }
        else line = buf.toString('latin1', start, i);
        pending.push(line);
        start = i + 1;
      }
    }
    if (start < read) {
      const t = Buffer.from(buf.subarray(start, read));
      tail = tail ? Buffer.concat([tail, t]) : t;
    }
    return true;
  }
  return {
    next() {
      if (pi >= pending.length) {
        pending.length = 0; pi = 0;
        if (!fill() && pi >= pending.length) return null;
      }
      return pending[pi++];
    },
    get bytes() { return bytes; },
    close() { try { fs.closeSync(fd); } catch (e) { /* ya cerrado */ } }
  };
}

/** Devuelve la cabecera de un m3u8 (lineas antes del primer #EXTINF). */
function readHeaderLines(file) {
  const r = makeLineReader(file);
  const lines = [];
  try {
    for (;;) {
      const line = r.next();
      if (line === null) break;
      if (line.startsWith('#EXTINF')) break;
      lines.push(line);
    }
  } finally { r.close(); }
  return lines;
}

/** Iterador pull de bloques de canal sobre un m3u8 (cabecera descartada). */
function lightBlockIter(file) {
  const r = makeLineReader(file);
  let cur = null;
  let inHeader = true;
  let done = false;
  return {
    next() {
      for (;;) {
        if (done) return null;
        const line = r.next();
        if (line === null) {
          done = true;
          if (cur && cur.length) { const out = cur; cur = null; return out; }
          return null;
        }
        if (inHeader) {
          if (line.startsWith('#EXTINF')) { inHeader = false; cur = [line]; }
          continue;
        }
        if (line.startsWith('#EXTINF')) {
          if (cur) { const out = cur; cur = [line]; return out; }
          cur = [line];
          continue;
        }
        cur.push(line);
      }
    },
    close() { r.close(); }
  };
}

/** Escritor byte-exacto (latin1): 1 caracter = 1 byte, como el lector. */
function makeByteWriter(fd) {
  let acc = [];
  let accBytes = 0;
  let total = 0;
  return {
    push(line) {
      acc.push(line);
      accBytes += line.length + 1;
      total += line.length + 1;
      if (accBytes >= (4 << 20)) this.flush();
    },
    flush() {
      if (!acc.length) return;
      fs.writeSync(fd, Buffer.from(acc.join('\n') + '\n', 'latin1'));
      acc = [];
      accBytes = 0;
    },
    get bytes() { return total; }
  };
}

/** Tamano gzip del fichero (nivel 9, mismo criterio que `gzip -9`). */
function gzipSizeOfFile(file) {
  const buf = fs.readFileSync(file);
  return zlib.gzipSync(buf, { level: 9 }).length;
}

/* ── LIGHT: aprendizaje (pasada 1 sobre el origen) ─────────────────────────── */

function lightLearn(originPath) {
  const t0 = Date.now();
  const shapes = new Map();
  const pairOrder = [];
  const pairPools = new Map(); // pair -> Map(name -> {set:Set, overflow:boolean})
  let channels = 0;
  let headerLines = 0;

  function learnBlock(block) {
    channels++;
    const a = lightAnalyse(block);
    if (!pairPools.has(a.pair)) { pairPools.set(a.pair, new Map()); pairOrder.push(a.pair); }
    const pools = pairPools.get(a.pair);
    for (const [name, val] of a.vars) {
      let rec = pools.get(name);
      if (!rec) { rec = { set: new Set(), overflow: false }; pools.set(name, rec); }
      if (rec.overflow) continue;
      rec.set.add(val);
      if (rec.set.size > LIGHT_POOL_MAX) { rec.set = null; rec.overflow = true; }
    }
    let sh = shapes.get(a.shape);
    if (!sh) {
      const tk = lightTokenize(block, a.vars);
      sh = {
        pair: a.pair, shape: a.shape, ref: block, lines: block.length,
        flags: tk.flags, tokenized: tk.lines, n: 0,
        exthttpAt: a.exthttpAt, urlAt: a.urlAt
      };
      shapes.set(a.shape, sh);
    }
    sh.n++;
  }

  const r = makeLineReader(originPath);
  let cur = null;
  let inHeader = true;
  for (;;) {
    const line = r.next();
    if (line === null) break;
    if (inHeader) {
      if (line.startsWith('#EXTINF')) { inHeader = false; cur = [line]; }
      else headerLines++;
      continue;
    }
    if (line.startsWith('#EXTINF')) {
      if (cur) learnBlock(cur);
      cur = [line];
      continue;
    }
    cur.push(line);
  }
  if (cur) learnBlock(cur);
  r.close();

  /* pares definitivos: vars usadas = union de marcadores de todas sus formas */
  const pairs = [];
  for (const pair of pairOrder) {
    const list = [];
    for (const sh of shapes.values()) if (sh.pair === pair) list.push(sh);
    list.sort((a, b) => b.n - a.n || (a.shape < b.shape ? -1 : 1));
    const used = new Set();
    for (const sh of list) {
      for (const line of sh.tokenized) {
        LIGHT_MARKER_RE.lastIndex = 0;
        let m;
        while ((m = LIGHT_MARKER_RE.exec(line)) !== null) if (LIGHT_VAR_SPEC[m[1]]) used.add(m[1]);
      }
    }
    const vars = LIGHT_VAR_NAMES.filter((n) => used.has(n));
    list.forEach((sh, i) => {
      sh.variant = i;
      sh.segs = lightCompile(sh.tokenized, sh.flags, vars);
    });
    const pool = {};
    const poolIdx = {};
    const poolSets = pairPools.get(pair) || new Map();
    const channelsOfPair = list.reduce((a, sh) => a + sh.n, 0);
    for (const name of vars) {
      const rec = poolSets.get(name);
      if (!rec || rec.overflow || !rec.set || rec.set.size === 0 || rec.set.size > LIGHT_POOL_MAX) continue;
      /* Un pool solo se amortiza si cada valor se REPITE: si el valor es unico
         por canal, el indice no ahorra nada y ademas infla la cabecera. Se exige
         reutilizacion media >= 8. */
      if (rec.set.size * 8 > channelsOfPair) continue;
      const arr = [...rec.set].sort();
      pool[name] = arr;
      const idx = new Map();
      arr.forEach((v, i) => idx.set(v, i));
      poolIdx[name] = idx;
    }
    pairs.push({ k: pair, vars, pool, poolIdx, shapes: list });
  }
  pairs.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return { shapes, pairs, channels, headerLines, ms: Date.now() - t0 };
}

/* ── LIGHT: serializacion de las plantillas ───────────────────────────────── */

function lightSerializeTemplates(learn) {
  const out = new Map();
  for (const p of learn.pairs) {
    /* TABLA DE LINEAS COMPARTIDA: las variantes de un mismo par difieren en unas
       pocas lineas; guardar 40 copias del bloque entero es lo que infla la
       cabecera. Cada variante es una lista de indices a la tabla. */
    const table = [];
    const tableIdx = new Map();
    const variants = p.shapes.map((sh) => {
      const ix = new Array(sh.segs.length);
      for (let i = 0; i < sh.segs.length; i++) {
        const key = JSON.stringify(sh.segs[i]);
        let at = tableIdx.get(key);
        if (at === undefined) { at = table.length; table.push(sh.segs[i]); tableIdx.set(key, at); }
        ix[i] = at;
      }
      return { s: sh.shape, n: sh.n, e: sh.exthttpAt, u: sh.urlAt, x: ix };
    });
    const tpl = {
      f: LIGHT_TEMPLATE_FORMAT,
      k: p.k,
      vars: p.vars,
      pool: p.pool,
      lines: table,
      variants
    };
    const json = JSON.stringify(tpl);
    const gz = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
    const b64 = gz.toString('base64');
    out.set(p.k, {
      json, gz, b64,
      sha256: crypto.createHash('sha256').update(gz).digest('hex'),
      bytes_json: Buffer.byteLength(json),
      bytes_gz: gz.length,
      variants: p.shapes.length,
      lines: p.shapes.length ? p.shapes[0].lines : 0,
      channels: p.shapes.reduce((a, s) => a + s.n, 0)
    });
  }
  return out;
}

/* ── LIGHT: emision de la lista con plantillas ─────────────────────────────── */

/**
 * @param {string} inPath  lista servida (EXTINF/EXTHTTP/EXTSHIMOTT/URL)
 * @param {string} outPath destino
 * @param {object} opts    {origin, gz, noSelfVerify, limit, gzSize}
 */
function light(inPath, outPath, opts) {
  const t0 = Date.now();
  opts = opts || {};
  const blocked = isProtectedTarget(inPath, outPath);
  if (blocked) return { ok: false, error: 'destino_protegido', detail: blocked };
  if (!fs.existsSync(inPath)) return { ok: false, error: 'no_existe_entrada', detail: inPath };
  const originPath = opts.origin || inPath;
  if (!fs.existsSync(originPath)) return { ok: false, error: 'no_existe_origen', detail: originPath };
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 0;

  const learn = lightLearn(originPath);
  const tpls = lightSerializeTemplates(learn);

  const index = {
    f: LIGHT_FORMAT,
    tool: TOOL + '/' + VERSION,
    origin: path.basename(originPath),
    origin_bytes: fs.statSync(originPath).size,
    base: path.basename(inPath),
    base_bytes: fs.statSync(inPath).size,
    channels: learn.channels,
    vars: LIGHT_VAR_NAMES,
    container: 'gzip+base64',
    pairs: learn.pairs.map((p) => {
      const t = tpls.get(p.k);
      return { k: p.k, channels: t.channels, variants: t.variants, lines: t.lines, gz: t.bytes_gz, sha256: t.sha256 };
    })
  };
  const indexJson = JSON.stringify(index);

  const headerIn = readHeaderLines(inPath);
  const keptHeader = headerIn.filter((l) => !l.startsWith(LIGHT_TEMPLATE_TAG) && !l.startsWith(LIGHT_INDEX_TAG));

  const stats = {
    ok: true,
    modo: 'light',
    canales: 0,
    lineas_emitidas: 0,
    formas: learn.shapes.size,
    pares: [],
    plantillas_bytes_gz: 0,
    plantillas_bytes_b64: 0,
    indice_bytes: Buffer.byteLength(indexJson, 'utf8'),
    cabecera_lineas: keptHeader.length + 1 + learn.pairs.length,
    shimott_inyectados: 0,
    shimott_sintetizados: 0,
    parche_lineas_total: 0,
    parche_medio_lineas: 0,
    parche_por_tag: [],
    valores_bytes_medios: 0,
    bytes_base: fs.statSync(inPath).size,
    bytes_out: 0,
    delta_bytes: 0,
    ratio: 0,
    sha256_out: null,
    desalineados_tvgid: 0,
    truncado_por_limite: false,
    version: VERSION
  };
  for (const t of tpls.values()) {
    stats.plantillas_bytes_gz += t.bytes_gz;
    stats.plantillas_bytes_b64 += t.b64.length;
  }

  const outTmp = outPath + '.tmp';
  let fd = null;
  let fatal = null;
  const patchByTag = new Map();
  const pairCount = new Map();
  let patchLinesTotal = 0;
  let valuesBytes = 0;
  const varBytes = new Map();
  let injected = 0;
  let synthesized = 0;
  let mismatch = 0;
  let emittedLines = 0;

  const bIn = lightBlockIter(inPath);
  const bOr = lightBlockIter(originPath);
  try {
    fd = fs.openSync(outTmp, 'w');
    const w = makeByteWriter(fd);
    for (const line of keptHeader) w.push(line);
    w.push(LIGHT_INDEX_TAG + indexJson);
    for (const p of learn.pairs) w.push(LIGHT_TEMPLATE_TAG + p.k + ':' + tpls.get(p.k).b64);

    for (;;) {
      if (limit && stats.canales >= limit) { stats.truncado_por_limite = true; break; }
      const bl = bIn.next();
      const bo = bOr.next();
      if (!bl && !bo) break;
      if (!bl || !bo) throw Object.assign(new Error('canales_no_cuadran'), { code: 'canales_no_cuadran', detail: bl ? 'sobran_origen' : 'faltan_canales' });
      if (stats.canales === 0 && bl.length > 200) {
        throw Object.assign(new Error('base_no_es_light'), { code: 'base_no_es_light', detail: 'la base trae ' + bl.length + ' lineas por canal: pásale la lista SERVIDA (light), no el origen; el origen va en --origin' });
      }
      const a = lightAnalyse(bo);
      const sh = learn.shapes.get(a.shape);
      if (!sh) throw Object.assign(new Error('forma_no_aprendida'), { code: 'forma_no_aprendida', detail: a.shape });
      const pair = learn.pairs.find((x) => x.k === a.pair);
      if (!pair) throw Object.assign(new Error('par_no_aprendido'), { code: 'par_no_aprendido', detail: a.pair });

      const idIn = /tvg-id="([^"]*)"/.exec(bl[0]);
      const idOr = /tvg-id="([^"]*)"/.exec(bo[0]);
      if (!idIn || !idOr || idIn[1] !== idOr[1]) mismatch++;

      const values = new Array(pair.vars.length);
      for (let s = 0; s < pair.vars.length; s++) {
        const name = pair.vars[s];
        const raw = a.vars.get(name);
        if (raw === undefined) { values[s] = ''; continue; }
        const idx = pair.poolIdx[name];
        const pi = idx ? idx.get(raw) : undefined;
        values[s] = pi === undefined ? raw : pi;
        if (typeof values[s] === 'string') {
          valuesBytes += values[s].length;
          varBytes.set(name, (varBytes.get(name) || 0) + values[s].length);
        }
      }

      const x = {};
      let patchCount = 0;
      for (let i = 0; i < bo.length; i++) {
        /* EXTINF, EXTHTTP y URL ya viajan en la lista servida: no se duplican */
        if (i === 0 || i === sh.exthttpAt || i === sh.urlAt) continue;
        const rendered = lightRenderCompiled(sh.segs[i], values, pair.pool, pair.vars);
        if (rendered !== bo[i]) {
          x[i] = bo[i];
          patchCount++;
          const tg = lightTagOf(bo[i]);
          patchByTag.set(tg, (patchByTag.get(tg) || 0) + 1);
        }
      }
      patchLinesTotal += patchCount;

      const mp = { p: a.pair, v: sh.variant, n: values };
      if (patchCount) mp.x = x;

      let shimAt = -1;
      for (let i = 0; i < bl.length; i++) if (bl[i].startsWith(LIGHT_SHIM_TAG)) { shimAt = i; break; }
      let shimLine;
      if (shimAt >= 0) {
        let obj;
        try { obj = JSON.parse(bl[shimAt].slice(LIGHT_SHIM_TAG.length)); }
        catch (e) { throw Object.assign(new Error('shimott_json_invalido'), { code: 'shimott_json_invalido', detail: 'canal ' + (stats.canales + 1) + ': ' + e.message }); }
        delete obj.mp;
        obj.mp = mp;
        shimLine = LIGHT_SHIM_TAG + JSON.stringify(obj);
        injected++;
      } else {
        synthesized++;
        shimLine = LIGHT_SHIM_TAG + JSON.stringify({ ver: 1, mp });
      }

      if (shimAt >= 0) {
        for (let i = 0; i < bl.length; i++) w.push(i === shimAt ? shimLine : bl[i]);
        emittedLines += bl.length;
      } else {
        /* posicion del contrato: ultima linea de tag, inmediatamente antes de la URI */
        let at = bl.length;
        for (let i = 0; i < bl.length; i++) {
          if (bl[i].length && bl[i].charCodeAt(0) !== 35) { at = i; break; }
        }
        for (let i = 0; i < bl.length; i++) {
          if (i === at) w.push(shimLine);
          w.push(bl[i]);
        }
        if (at >= bl.length) w.push(shimLine);
        emittedLines += bl.length + 1;
      }
      pairCount.set(a.pair, (pairCount.get(a.pair) || 0) + 1);
      stats.canales++;
    }
    w.flush();
  } catch (e) {
    fatal = e;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e) { /* cerrado */ } }
    bIn.close();
    bOr.close();
  }

  if (fatal) {
    try { fs.unlinkSync(outTmp); } catch (e) { /* no estaba */ }
    return { ok: false, error: fatal.code || 'light_error', detail: fatal.detail || String(fatal.message), canales_procesados: stats.canales };
  }
  if (mismatch > 0) {
    try { fs.unlinkSync(outTmp); } catch (e) { /* no estaba */ }
    return { ok: false, error: 'base_desalineada', detail: mismatch + ' canales con tvg-id distinto entre la lista servida y el origen', canales: stats.canales };
  }
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  fs.renameSync(outTmp, outPath);

  stats.lineas_emitidas = emittedLines;
  stats.shimott_inyectados = injected;
  stats.shimott_sintetizados = synthesized;
  stats.parche_lineas_total = patchLinesTotal;
  stats.parche_medio_lineas = stats.canales ? +(patchLinesTotal / stats.canales).toFixed(2) : 0;
  stats.parche_por_tag = [...patchByTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  stats.valores_bytes_medios = stats.canales ? +(valuesBytes / stats.canales).toFixed(1) : 0;
  stats.valores_bytes_por_var = [...varBytes.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, +(v / stats.canales).toFixed(1)]);
  stats.pares = learn.pairs.map((p) => ({ k: p.k, variantes: p.shapes.length, canales: pairCount.get(p.k) || 0 }));
  stats.bytes_out = fs.statSync(outPath).size;
  stats.delta_bytes = stats.bytes_out - stats.bytes_base;
  stats.ratio = stats.bytes_out / stats.bytes_base;
  stats.sha256_out = sha256File(outPath);

  /* gzip del artefacto completo (mismo criterio que gzip -9). Con --gz se escribe
     el hermano .gz y se reutiliza ESE gzip para el numero: no se comprime dos veces. */
  if (opts.gz) {
    const gzPath = outPath + '.gz';
    const buf = zlib.gzipSync(fs.readFileSync(outPath), { level: 9 });
    fs.writeFileSync(gzPath, buf);
    stats.gz_path = gzPath;
    stats.bytes_out_gz = buf.length;
    stats.sha256_out_gz = crypto.createHash('sha256').update(buf).digest('hex');
  } else if (!opts.noGzSize) {
    stats.bytes_out_gz = gzipSizeOfFile(outPath);
  }

  if (stats.truncado_por_limite) {
    stats.verificado = null;
    stats.motivo_no_verificado = 'truncado_por_limite';
  } else if (!opts.noSelfVerify) {
    const v = verifyLight(outPath, originPath, {});
    stats.verificado = !!v.ok;
    stats.verificacion = {
      ok: v.ok,
      canales: v.canales,
      lineas: v.lineas,
      lineas_distintas: v.lineas_distintas,
      canales_distintos: v.canales_distintos,
      checks_canales: v.checks_canales,
      ott: v.ott,
      muestras: v.muestras,
      ms: v.ms
    };
    if (!v.ok) {
      stats.ok = false;
      stats.error = 'reconstruccion_no_coincide';
      stats.detalle_verificacion = v;
    }
  }
  stats.ms = Date.now() - t0;
  return stats;
}

/* ── LIGHT: verificacion (reconstruye y compara contra el ORIGEN) ─────────── */

function verifyLight(lightPath, originPath, opts) {
  opts = opts || {};
  const t0 = Date.now();
  if (!fs.existsSync(lightPath)) return { ok: false, error: 'no_existe_lista', detail: lightPath };
  if (!fs.existsSync(originPath)) return { ok: false, error: 'no_existe_origen', detail: originPath };

  const header = readHeaderLines(lightPath);
  let index = null;
  const templates = new Map();
  for (const line of header) {
    if (line.startsWith(LIGHT_INDEX_TAG)) {
      try { index = JSON.parse(line.slice(LIGHT_INDEX_TAG.length)); }
      catch (e) { return { ok: false, error: 'indice_json_invalido', detail: String(e.message) }; }
      continue;
    }
    if (line.startsWith(LIGHT_TEMPLATE_TAG)) {
      const rest = line.slice(LIGHT_TEMPLATE_TAG.length);
      const c = rest.indexOf(':');
      const pair = rest.slice(0, c);
      try {
        const gz = Buffer.from(rest.slice(c + 1), 'base64');
        templates.set(pair, JSON.parse(zlib.gunzipSync(gz).toString('utf8')));
      } catch (e) {
        return { ok: false, error: 'plantilla_ilegible', par: pair, detail: String(e.message) };
      }
    }
  }
  if (!index) return { ok: false, error: 'sin_indice' };
  if (!templates.size) return { ok: false, error: 'sin_plantillas' };

  const ott = {
    extm3u_primera: header.length > 0 && header[0].startsWith('#EXTM3U'),
    extinf: 0,
    exthttp: 0,
    urls: 0,
    shimott: 0,
    ape_fuera_cabecera: 0,
    cabecera_lineas: header.length,
    plantillas_cabecera: templates.size,
    indice_pares: (index.pairs || []).length
  };
  const sum = (key) => otc(ott, key);

  const wanted = new Set((opts.channels && opts.channels.length ? opts.channels : [1, 100, 21000]).map(Number));
  const checks = {};
  let channels = 0;
  let lines = 0;
  let mismatches = 0;
  let channelsBad = 0;
  const samples = [];

  const bLight = lightBlockIter(lightPath);
  const bOrigin = lightBlockIter(originPath);
  try {
    for (;;) {
      const bl = bLight.next();
      const bo = bOrigin.next();
      if (!bl && !bo) break;
      if (!bl || !bo) {
        return { ok: false, error: 'canales_no_cuadran', canales: channels };
      }
      channels++;
      const ord = channels;
      let extinf = null;
      let exthttp = null;
      let url = null;
      let mp = null;
      for (const line of bl) {
        if (line.startsWith('#EXTINF')) { if (extinf === null) extinf = line; sum('extinf'); continue; }
        if (line.startsWith('#EXTHTTP:')) { if (exthttp === null) exthttp = line; sum('exthttp'); continue; }
        if (line.startsWith(LIGHT_SHIM_TAG)) {
          sum('shimott');
          try {
            const o = JSON.parse(line.slice(LIGHT_SHIM_TAG.length));
            if (o && o.mp) mp = o.mp;
          } catch (e) { /* se contabiliza como fallo abajo */ }
          continue;
        }
        if (line.length && line.charCodeAt(0) !== 35) {
          if (url === null) { url = line; sum('urls'); }
          continue;
        }
        if (line.startsWith(LIGHT_APE_PREFIX)) ott.ape_fuera_cabecera++;
      }
      const a = lightAnalyse(bo);
      const hRec = wanted.has(ord) ? crypto.createHash('sha256') : null;
      const hOri = wanted.has(ord) ? crypto.createHash('sha256') : null;
      let bad = 0;
      if (!mp) {
        bad = bo.length;
      } else {
        const tpl = templates.get(mp.p || a.pair);
        const variant = tpl ? tpl.variants[mp.v | 0] : null;
        if (!tpl || !variant) {
          bad = bo.length;
        } else {
          const values = mp.n || [];
          const x = mp.x || null;
          for (let i = 0; i < bo.length; i++) {
            let expected;
            if (i === 0) expected = extinf;
            else if (i === (variant.e | 0)) expected = exthttp;
            else if (i === (variant.u | 0)) expected = url;
            else if (x && x[i] !== undefined) expected = x[i];
            else expected = lightRenderCompiled((tpl.lines || [])[variant.x[i]], values, tpl.pool || {}, tpl.vars || []);
            lines++;
            if (hRec) { hRec.update(expected === null || expected === undefined ? '' : expected, 'latin1'); hRec.update('\n'); }
            if (expected !== bo[i]) {
              bad++;
              if (samples.length < 8) samples.push({ canal: ord, linea: i, tag: lightTagOf(bo[i]), reconstruido: String(expected).slice(0, 90), origen: String(bo[i]).slice(0, 90) });
            }
          }
        }
      }
      if (hOri) {
        for (const l of bo) hOri.update(l, 'latin1'), hOri.update('\n');
        checks[ord] = {
          lineas: bo.length,
          distintas: bad,
          ok: bad === 0,
          sha256_reconstruido: hRec.digest('hex'),
          sha256_origen: hOri.digest('hex')
        };
      }
      if (bad) { mismatches += bad; channelsBad++; }
    }
  } finally {
    bLight.close();
    bOrigin.close();
  }

  const res = {
    ok: mismatches === 0 &&
      ott.ape_fuera_cabecera === 0 &&
      ott.extm3u_primera &&
      ott.extinf === ott.shimott &&
      ott.exthttp === ott.extinf &&
      ott.urls === ott.extinf,
    canales: channels,
    lineas: lines,
    lineas_distintas: mismatches,
    canales_distintos: channelsBad,
    checks_canales: checks,
    ott,
    muestras: samples,
    indice: { formato: index.f, canales: index.channels, pares: (index.pairs || []).length, vars: index.vars },
    ms: Date.now() - t0
  };
  if (!res.ok) res.error = 'verificacion_fallida';
  return res;
}

function otc(obj, key) { obj[key] = (obj[key] || 0) + 1; }

/* ────────────────────────────────────────────────────────────────────────────────
 * 9b. CLI
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Opciones que llevan valor: se leen como `--x valor` o `--x=valor`. */
const VALUED_FLAGS = new Set(['--limit', '--origin', '--report', '--channels']);

function parseArgs(argv) {
  const opts = { flags: new Set(), args: [], values: Object.create(null) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq > 0 ? a.slice(0, eq) : a;
      if (eq > 0) {
        opts.values[name] = a.slice(eq + 1);
        opts.flags.add(name);
        if (name === '--limit') opts.limit = Number(a.slice(eq + 1));
        continue;
      }
      const next = argv[i + 1];
      if (VALUED_FLAGS.has(name) && next !== undefined && !next.startsWith('--')) {
        opts.values[name] = next;
        opts.flags.add(name);
        if (name === '--limit') opts.limit = Number(next);
        i++;
        continue;
      }
      opts.flags.add(name);
      continue;
    }
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

  if (cmd === 'light') {
    const inPath = opts.args[1];
    const outPath = opts.args[2];
    const usage = 'light <lista_servida.m3u8> <out.m3u8> --origin <origen.m3u8> [--gz] [--no-selfverify] [--no-gz-size] [--limit N] [--report N]';
    if (!inPath || !outPath) die(2, { ok: false, error: 'uso', usage });
    const res = light(inPath, outPath, {
      origin: opts.values['--origin'],
      gz: opts.flags.has('--gz'),
      noSelfVerify: opts.flags.has('--no-selfverify'),
      noGzSize: opts.flags.has('--no-gz-size'),
      limit: opts.limit
    });
    if (opts.values['--report']) {
      try { fs.writeFileSync(opts.values['--report'], JSON.stringify(res, null, 1)); }
      catch (e) { process.stderr.write('no pude escribir el informe: ' + e.message + '\n'); }
    }
    if (!res.ok) die(res.error === 'destino_protegido' ? 3 : 5, res);
    out(res);
    return 0;
  }

  if (cmd === 'verify-light') {
    const lightPath = opts.args[1];
    const originPath = opts.args[2];
    if (!lightPath || !originPath) die(2, { ok: false, error: 'uso', usage: 'verify-light <lista_con_plantillas.m3u8> <origen.m3u8> [--channels 1,100,21000]' });
    const chans = opts.values['--channels'] ? String(opts.values['--channels']).split(',').map(Number) : undefined;
    const res = verifyLight(lightPath, originPath, { channels: chans });
    if (!res.ok) die(5, Object.assign({ ok: false }, res));
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
      'light   <lista_servida.m3u8> <out.m3u8> --origin <origen.m3u8> [--gz] [--no-selfverify] [--limit N]',
      'verify-light <lista_con_plantillas.m3u8> <origen.m3u8> [--channels 1,100,21000]',
      'verify  <projected.m3u8> <original.m3u8>',
      'info    <file.m3u8>'
    ]
  });
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  project, verify, info,
  light, verifyLight,
  lightAnalyse, lightTokenize, lightRender, lightRenderCompiled, lightCompile,
  tokenizeBlock, analyseBlock, shapeKey,
  VAR_NAMES, LIGHT_VAR_NAMES, FORMAT, LIGHT_FORMAT, VERSION
};
