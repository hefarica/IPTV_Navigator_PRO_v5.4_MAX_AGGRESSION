#!/usr/bin/env node
/**
 * verify_demuxed.js — ARNÉS DE VERIFICACIÓN del master demuxed de APE
 * ============================================================================
 * Node >= 18. CERO dependencias (solo `child_process` para invocar ffprobe).
 *
 * QUÉ VERIFICA — cuatro gates, cada uno con su evidencia y su estado
 * ----------------------------------------------------------------------------
 *  G1  ESTRUCTURA HLS del demuxed
 *      · cada `#EXT-X-MEDIA:TYPE=AUDIO` declara GROUP-ID, NAME, LANGUAGE, CHANNELS,
 *        DEFAULT, AUTOSELECT y URI  (RFC 8216 §4.4.6.1)
 *      · cada `#EXT-X-STREAM-INF` con `AUDIO="g"` referencia un GROUP-ID que EXISTE;
 *        y si el master declara renditions de audio, ninguna variante puede quedarse
 *        sin `AUDIO=` (sería un grupo huérfano / audio que el player no engancha)
 *      · la combinación GROUP-ID + NAME + LANGUAGE es única (la selección de rendition
 *        de ExoPlayer/hls.js se indexa por esa terna; un duplicado hace la elección
 *        ambigua y el player se queda con la primera)
 *      · como mucho un DEFAULT=YES por GROUP-ID
 *      · `#EXT-X-SESSION-DATA` usa **DATA-ID**; cualquier `NAME=` en SESSION-DATA es FALLO
 *        (DATA-ID es el campo de RFC 8216 §4.4.6.4; `NAME=` es de `#EXT-X-MEDIA`, no de aquí)
 *
 *  G2  CERO DOWNSCALE DE VÍDEO  (ley del operador: el vídeo NUNCA baja)
 *      · `RESOLUTION` de cada variante >= `--source-resolution` (ancho y alto)
 *      · `BANDWIDTH` >= `--min-video-bitrate` (si se da umbral)
 *      · `FRAME-RATE` >= `--source-framerate` (si se da suelo)
 *      · una variante SIN `RESOLUTION` no puede demostrar que no baja => FALLO
 *        (no se puede probar la ausencia de downscale que no se puede medir)
 *
 *  G3  CERO CAPS DE VÍDEO en el master emitido
 *      · prohibidos los 8 tokens del encargo (max_resolution, max_bitrate, max_framerate,
 *        video-width, video-height, adaptive-maxbitrate, adaptive-maxwidth, adaptive-maxheight)
 *      · MÁS los `prohibited[]` de `cap_verdicts.json` (t10) si el archivo existe: así el
 *        veredicto del catálogo de caps se aplica sin traducir la lista a mano.
 *        Medido en t10: `chooser_bandwidth_max` es el ÚNICO cap con efecto real (ISA, bit/s).
 *
 *  G4  THROUGHPASS DE AUDIO — MEDIDO CON ffprobe
 *      · extrae códec (con perfil AAC / AC-3 / E-AC-3), sample rate, canales, bitrate y
 *        duración REALES del segmento o de la rendition, y los compara con lo esperado
 *      · bajar audio (canales/bitrate) SÍ está permitido: este gate NO lo penaliza; lo
 *        que verifica es que el audio declarado es el audio que suena (throughpass real,
 *        sin transcode silencioso ni invención)
 *
 * POR QUÉ NO SE USA md5 DE BYTES DEL SEGMENTO (decisión, no pereza)
 * ------------------------------------------------------------------
 * Un md5 del segmento dice "estes bytes son los mismos bytes". NO dice nada del audio:
 *   · cualquier repackage (TS -> fMP4, o re-mux con otro muxer) cambia el contenedor y por
 *     tanto el md5, aunque el audio sea idéntico bit a bit (throughpass perfecto);
 *   · al revés, un transcode AAC 5.1 -> AAC 5.1 a otro bitrate puede producir el mismo
 *     tamaño con distinto audio y colisionar en la comparación por md5;
 *   · y un md5 no dice codec, ni sample rate, ni canales, ni bitrate, ni duración: que es
 *     justo lo que la ley del operador permite cambiar (audio) y lo que hay que demostrar
 *     que NO cambió por sorpresa.
 * Por eso el gate de throughpass mide con `ffprobe` la ESENCIA del stream (codec/sr/ch/br/dur),
 * que es invariante al contenedor y discrimina transcode. El md5 se puede seguir usando como
 * control de integridad de transferencia, no como prueba de throughpass.
 *
 * ESTADOS DE EVIDENCIA (no se mezclan)
 * ------------------------------------
 *   PASS        la medición se hizo y el criterio se cumple
 *   FAIL        la medición se hizo y el criterio NO se cumple -> exit 1
 *   NO_COMPUTADO  no hay con qué medir (p.ej. no se dio segmento de audio, o el master es
 *                 muxed y no declara audio). NUNCA se reporta como PASS.
 *
 * CÓDIGOS DE SALIDA
 * -----------------
 *   0  PASS        todos los gates duros PASS (el throughpass puede estar NO_COMPUTADO
 *                  cuando no se aportó segmento; el JSON lo dice y `--strict` lo convierte
 *                  en 2)
 *   1  FAIL        al menos un gate duro incumplido
 *   2  NO_COMPUTADO algún gate duro quedó NO_COMPUTADO (solo con --strict) o no hay
 *                  entrada/argumentos válidos
 *   3  USO         error de invocación (sin master, opciones incoherentes)
 *   4  IO          master ilegible/vacío
 *
 * USO
 * ---
 *   node verify_demuxed.js <master.m3u8> --source-resolution 3840x2160 [opciones]
 *
 *   --source-resolution WxH      Resolución NATIVA del canal (la que declara el operador).
 *                                Sin esto, G2 queda NO_COMPUTADO (no se inventa la fuente).
 *   --source-framerate N         Suelo de fps (opcional).
 *   --min-video-bitrate BPS      Umbral de BANDWIDTH por variante (opcional).
 *   --audio-segment <path|url>   Segmento/playlist de audio real para ffprobe (repetible).
 *   --probe-rendition <gid|NAME> Resuelve la URI de esa rendition en el master y la mide.
 *   --expect-audio-codec C       'ac-3' | 'ec-3' | 'mp4a.40.2' | 'aac' | 'any'.
 *   --expect-sample-rate HZ      Sample rate esperado.
 *   --expect-channels N          Canales esperados (5.1 => 6).
 *   --allow-audio-downscale      Explícito: bajar canales/bitrate de audio es LEGAL
 *                                (por defecto el gate tampoco lo penaliza; el flag deja
 *                                constancia en el JSON para auditoría).
 *   --ffprobe <path>             Binario de ffprobe (default: ffprobe del PATH).
 *   --json <path>                Salida JSON (default: verify_demuxed.json).
 *   --strict                     NO_COMPUTADO en gate duro => exit 2.
 *   --quiet                      Sin resumen humano por stdout.
 *   --help                       Esta ayuda.
 *
 * NO toca la lista de entrada (solo lectura), no hace red por su cuenta (si el operador
 * pasa una URL, la resuelve ffprobe: esa decisión es del operador), no escribe fuera de
 * `--json` y sus temporales de ffprobe.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const TOOL = 'verify_demuxed.js';
const VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Tokens de cap de VÍDEO prohibidos (los 8 del encargo + los de cap_verdicts.json).
// Se comparan sobre la línea en minúsculas y SOLO si la línea es un tag (#...).
// ---------------------------------------------------------------------------
const FORBIDDEN_CAPS_TASK = [
  'max_resolution',
  'max_bitrate',
  'max_framerate',
  'video-width',
  'video-height',
  'adaptive-maxbitrate',
  'adaptive-maxwidth',
  'adaptive-maxheight'
];

const AUDIO_MEDIA_REQUIRED = ['GROUP-ID', 'NAME', 'LANGUAGE', 'CHANNELS', 'DEFAULT', 'AUTOSELECT', 'URI'];

// Una línea de TAG real es #TAG:... segun RFC 8216. # comentario NO lo es: si un
// comentario nombra una clave de cap (p.ej. la cabecera de un fixture o un doc), contarlo
// como cap seria un falso positivo.
const TAG_LINE_RE = /^#[A-Za-z0-9.\\-]+:/;

// ---------------------------------------------------------------------------
// Caps prohibidos = los 8 del encargo + los `prohibited[]` de cap_verdicts.json (t10).
// Se cargan UNA vez al arrancar porque el escaneo es streaming y necesita el set completo
// antes de leer el primer byte. Si el archivo no está, se sigue con los 8 del encargo y el
// JSON lo declara (fuente de la lista de caps = "task-only").
// ---------------------------------------------------------------------------
function loadCapVerdicts() {
  const p = path.join(__dirname, 'cap_verdicts.json');
  const out = { source: null, prohibited: [], inert_removable: [], indeterminado: [] };
  if (!fs.existsSync(p)) { out.source = 'AUSENTE'; return out; }
  try {
    const cv = JSON.parse(fs.readFileSync(p, 'utf8'));
    out.source = path.basename(p) + ' v' + (cv.version || '?');
    out.prohibited = Array.isArray(cv.prohibited) ? cv.prohibited : [];
    out.inert_removable = Array.isArray(cv.inert_removable) ? cv.inert_removable : [];
    out.indeterminado = Array.isArray(cv.indeterminado) ? cv.indeterminado : [];
  } catch (e) {
    out.source = 'ILEGIBLE: ' + e.message;
  }
  return out;
}
const CAP_VERDICTS = loadCapVerdicts();

// tokens (minúsculas) que se buscan línea a línea. El `key` de cap_verdicts ya es el token
// exacto (p.ej. `inputstream.adaptive.chooser_bandwidth_max`), así que encaja como substring.
const CAP_TOKENS = Array.from(new Set([
  ...FORBIDDEN_CAPS_TASK,
  ...CAP_VERDICTS.prohibited.map(p => String(p.key || p.token || '').trim().toLowerCase()).filter(Boolean)
]));

// codec de ffprobe -> forma RFC 6381 / HLS
const CODEC_TO_RFC = {
  aac: 'mp4a.40.2',          // se refina con el perfil (LC 40.2 / HE 40.5 / HEv2 40.29)
  ac3: 'ac-3',
  eac3: 'ec-3',
  mp3: 'mp3',
  opus: 'opus',
  flac: 'flac',
  alac: 'alac',
  truehd: 'truehd',
  dts: 'dts'
};
const AAC_PROFILE_TO_RFC = {
  LC: 'mp4a.40.2',
  'HE-AAC': 'mp4a.40.5',
  'HE-AACv2': 'mp4a.40.29',
  'Main': 'mp4a.40.1',
  'LTP': 'mp4a.40.4',
  'SSR': 'mp4a.40.3'
};

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------
function die(code, msg) {
  process.stderr.write('ERROR: ' + msg + '\n');
  process.exit(code);
}

function parseArgs(argv) {
  const o = {
    input: null, sourceResolution: null, sourceFramerate: null, minVideoBitrate: null,
    audioSegments: [], probeRenditions: [], expectCodec: null, expectSampleRate: null,
    expectChannels: null, allowAudioDownscale: false, ffprobe: 'ffprobe',
    json: 'verify_demuxed.json', strict: false, quiet: false, help: false
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) die(3, 'falta el valor de ' + a);
      return argv[++i];
    };
    switch (a) {
      case '--help': case '-h': o.help = true; break;
      case '--source-resolution': o.sourceResolution = next(); break;
      case '--source-framerate': o.sourceFramerate = Number(next()); break;
      case '--min-video-bitrate': o.minVideoBitrate = Number(next()); break;
      case '--audio-segment': o.audioSegments.push(next()); break;
      case '--probe-rendition': o.probeRenditions.push(next()); break;
      case '--expect-audio-codec': o.expectCodec = String(next()).toLowerCase(); break;
      case '--expect-sample-rate': o.expectSampleRate = Number(next()); break;
      case '--expect-channels': o.expectChannels = Number(next()); break;
      case '--allow-audio-downscale': o.allowAudioDownscale = true; break;
      case '--ffprobe': o.ffprobe = next(); break;
      case '--json': o.json = next(); break;
      case '--strict': o.strict = true; break;
      case '--quiet': o.quiet = true; break;
      default:
        if (a.startsWith('--')) die(3, 'opción desconocida: ' + a);
        rest.push(a);
    }
  }
  if (rest.length > 1) die(3, 'solo se admite un master de entrada (recibidos ' + rest.length + ')');
  o.input = rest[0] || null;
  return o;
}

// Parser de lista de atributos HLS: clave=valor separados por comas, valores entrecomillados.
function parseAttrs(s) {
  const out = Object.create(null);
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && (s[i] === ',' || s[i] === ' ')) i++;
    if (i >= n) break;
    const ks = i;
    while (i < n && s[i] !== '=' && s[i] !== ',') i++;
    const key = s.slice(ks, i).trim();
    if (s[i] !== '=') { if (key) out[key] = ''; continue; }
    i++;
    let val = '';
    if (s[i] === '"') {
      i++;
      const vs = i;
      while (i < n && s[i] !== '"') i++;
      val = s.slice(vs, i);
      i++;
    } else {
      const vs = i;
      while (i < n && s[i] !== ',') i++;
      val = s.slice(vs, i).trim();
    }
    if (key) out[key] = val;
  }
  return out;
}

function parseResolution(s) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(s || '').trim());
  return m ? { w: Number(m[1]), h: Number(m[2]), raw: s } : null;
}

// ---------------------------------------------------------------------------
// Lectura STREAMING del master: no se carga el fichero en memoria (el catálogo real
// son 604 MB / 10.315.662 líneas y también es un master válido para este arnés).
// En el mismo pase se calcula el sha256 y se cuentan líneas/bytes.
// ---------------------------------------------------------------------------
function scanMaster(file) {
  const fd = fs.openSync(file, 'r');
  const hash = crypto.createHash('sha256');
  const CHUNK = 8 * 1024 * 1024;
  const buf = Buffer.allocUnsafe(CHUNK);

  const res = {
    bytes: 0, lines: 0, sha256: null,
    isCatalogue: false,
    crlf: 0,
    audioRenditions: [],
    sessionData: [],
    variants: [],
    caps: [],
    capsOverflow: 0,
    capsLines: 0,
    capTokenCounts: new Map(),
    streamInfWithoutAudio: 0,
    extinf: 0,
    uriLines: 0,
    // [G5] Cola de tags DESPUÉS de la URI de cada bloque de canal. En la lista de
    // referencia son 2 tags (#EXTVLCOPT:clock-jitter y #EXT-X-APE-CRYSTAL-UHD) más
    // una línea vacía (lines_after_uri=3 en 10.572 canales, 7 en el último). Un
    // parser o un generador que cierre el bloque en la URI los pierde sin avisar.
    blockTail: [],
    _tail: null,
    _tailChannel: 0,
    // [G6] Metadata chunked del LAB: #EXT-X-APE-LAB-METADATA:<i>/<n>:<base64>
    // Los 20 chunks concatenados en orden decodifican el JSON del laboratorio
    // (51.890 B en la lista de referencia). Un generador que reescribe el fichero
    // puede tirar uno o truncarlo y el manifiesto seguiria pareciendo valido.
    labMeta: [],
    firstLines: []
  };

  let rest = null;
  const handle = (b) => {
    res.lines++;
    let len = b.length;
    if (len && b[len - 1] === 0x0d) { len--; res.crlf++; }
    if (len === 0) return;
    const line = b.toString('latin1', 0, len);
    if (!line.startsWith('#')) {
      res.uriLines++;
      // URI que sigue a un STREAM-INF pendiente
      if (res._pendingVariant) { res._pendingVariant.uri = line; res._pendingVariant = null; }
      // [G5] Abre la cola de este bloque: lo que venga después de la URI y antes del
      // siguiente #EXTINF sigue siendo parte del canal.
      if (!res._tail) { res._tail = []; res._tailChannel = res.extinf; }
      return;
    }
    // [G5] Todo tag posterior a la URI del bloque actual pertenece a su cola.
    if (res._tail) res._tail.push(line.slice(0, 60));
    const ci = line.indexOf(':');
    const tag = ci > 0 ? line.slice(0, ci) : line;
    const body = ci > 0 ? line.slice(ci + 1) : '';

    if (res.firstLines.length < 12) res.firstLines.push(line.length > 200 ? line.slice(0, 200) + '…' : line);

    switch (tag) {
      case '#EXTINF':
        // [G5] Cierra la cola del bloque ANTERIOR antes de abrir el nuevo.
        if (res._tail) {
          if (res.blockTail.length < 200000) {
            res.blockTail.push({ channel: res._tailChannel, tags: res._tail.slice(0, 12), count: res._tail.length });
          }
          res._tail = null;
        }
        res.extinf++;
        res.isCatalogue = true;
        break;
      case '#EXT-X-MEDIA': {
        const a = parseAttrs(body);
        if (String(a.TYPE || '').toUpperCase() === 'AUDIO') {
          res.audioRenditions.push({ line: res.lines, attrs: a });
        }
        break;
      }
      case '#EXT-X-SESSION-DATA': {
        if (res.sessionData.length < 500) res.sessionData.push({ line: res.lines, attrs: parseAttrs(body), raw: line.slice(0, 300) });
        break;
      }
      case '#EXT-X-STREAM-INF': {
        const v = { line: res.lines, attrs: parseAttrs(body) };
        if (!('AUDIO' in v.attrs)) res.streamInfWithoutAudio++;
        if (res.variants.length < 200000) res.variants.push(v);
        res._pendingVariant = v;
        break;
      }
      // [G6] Metadata chunked del LAB. Forma: <i>/<n>:<base64>
      case '#EXT-X-APE-LAB-METADATA': {
        const m = /^\s*(\d+)\s*\/\s*(\d+)\s*:(.*)$/.exec(body);
        if (m && res.labMeta.length < 4096) {
          res.labMeta.push({ line: res.lines, i: Number(m[1]), n: Number(m[2]), payload: m[3] });
        } else if (res.labMeta.length < 4096) {
          res.labMeta.push({ line: res.lines, i: null, n: null, payload: '', malformed: body.slice(0, 120) });
        }
        break;
      }
      default: break;
    }

    // --- caps de vídeo ---------------------------------------------------------
    // Se buscan SOLO en líneas de tag reales (`#TAG:...`), nunca en comentarios: un
    // comentario que EXPLICA un cap (p.ej. la cabecera de un fixture) no es un cap, y
    // contarlo sería un falso positivo. Tampoco se escanea `#EXT-X-SESSION-DATA`: su
    // VALUE es texto libre (una referencia documental puede nombrar la clave sin pedirla).
    // El resto de tags SÍ se escanea, porque el cap puede venir de cualquier capa
    // (#EXTVLCOPT de VLC, #KODIPROP de ISA, #EXTATTRFROMURL o una familia APE).
    if (TAG_LINE_RE.test(line) && tag !== '#EXT-X-SESSION-DATA') {
      const low = line.toLowerCase();
      let capLineHit = false;
      for (const tok of CAP_TOKENS) {
        if (low.includes(tok)) {
          capLineHit = true;
          res.capTokenCounts.set(tok, (res.capTokenCounts.get(tok) || 0) + 1);
          if (res.caps.length < 500) {
            res.caps.push({ line: res.lines, token: tok, text: line.length > 220 ? line.slice(0, 220) + '…' : line });
          }
        }
      }
      if (capLineHit) res.capsLines++;
    }

    // --- SESSION-DATA con NAME= (defecto explícito del encargo) ---
    if (tag === '#EXT-X-SESSION-DATA') {
      if (/\bNAME\s*=/.test(body)) {
        if (res.sessionDataName.length < 100) res.sessionDataName.push({ line: res.lines, raw: line.slice(0, 300) });
      }
      if (!/\bDATA-ID\s*=/.test(body)) {
        if (res.sessionDataNoId.length < 100) res.sessionDataNoId.push({ line: res.lines, raw: line.slice(0, 300) });
      }
    }
  };
  res.sessionDataName = [];
  res.sessionDataNoId = [];

  for (;;) {
    const n = fs.readSync(fd, buf, 0, CHUNK, null);
    if (n <= 0) break;
    hash.update(buf.subarray(0, n));
    res.bytes += n;
    let start = 0;
    if (rest) {
      const idx = buf.indexOf(0x0a, 0);
      if (idx === -1 || idx >= n) { rest = Buffer.concat([rest, buf.subarray(0, n)]); continue; }
      handle(Buffer.concat([rest, buf.subarray(0, idx)]));
      start = idx + 1; rest = null;
    }
    let idx;
    while ((idx = buf.indexOf(0x0a, start)) !== -1 && idx < n) {
      handle(buf.subarray(start, idx));
      start = idx + 1;
    }
    if (start < n) rest = Buffer.from(buf.subarray(start, n));
  }
  if (rest && rest.length) handle(rest);
  fs.closeSync(fd);
  res.sha256 = hash.digest('hex');
  res.capsPairs = [...res.capTokenCounts.values()].reduce((a, b) => a + b, 0);
  res.capsOverflow = Math.max(0, res.capsPairs - res.caps.length);
  delete res._pendingVariant;
  return res;
}

// ---------------------------------------------------------------------------
// G1 — estructura HLS del demuxed
// ---------------------------------------------------------------------------
function gateStructure(scan) {
  const checks = [];
  const failures = [];
  const push = (name, ok, detail, evidence) => {
    checks.push({ check: name, status: ok ? 'PASS' : 'FAIL', detail, evidence: evidence || null });
    if (!ok) failures.push({ check: name, detail, evidence: evidence || null });
  };

  // 1) campos obligatorios de cada rendition
  for (const r of scan.audioRenditions) {
    const missing = AUDIO_MEDIA_REQUIRED.filter(k => !(k in r.attrs) || r.attrs[k] === '');
    push('EXT-X-MEDIA[line ' + r.line + '] campos obligatorios',
      missing.length === 0,
      missing.length === 0 ? 'GROUP-ID/NAME/LANGUAGE/CHANNELS/DEFAULT/AUTOSELECT/URI presentes'
        : 'faltan: ' + missing.join(', '),
      'line ' + r.line + ': ' + JSON.stringify(r.attrs).slice(0, 300));
  }

  // 2) AUDIO= de cada variante resuelve a un GROUP-ID declarado
  const groups = new Set(scan.audioRenditions.map(r => r.attrs['GROUP-ID']).filter(Boolean));
  const badRefs = [];
  const variantsWithAudio = [];
  for (const v of scan.variants) {
    if ('AUDIO' in v.attrs) {
      variantsWithAudio.push(v);
      if (!groups.has(v.attrs.AUDIO)) badRefs.push({ line: v.line, audio: v.attrs.AUDIO });
    }
  }
  if (groups.size > 0) {
    push('STREAM-INF AUDIO= -> GROUP-ID existente',
      badRefs.length === 0,
      badRefs.length === 0
        ? variantsWithAudio.length + ' variantes con AUDIO=, todas resuelven a uno de ' + groups.size + ' GROUP-ID'
        : badRefs.length + ' variantes apuntan a un GROUP-ID inexistente',
      badRefs.slice(0, 20).map(b => 'line ' + b.line + ': AUDIO="' + b.audio + '"').join(' | '));

    // 2b) si hay renditions, ninguna variante puede quedarse sin AUDIO= (grupo huérfano)
    const orphan = scan.streamInfWithoutAudio;
    push('variantes sin AUDIO= con renditions declaradas',
      orphan === 0,
      orphan === 0 ? 'todas las variantes enganchan el grupo' : orphan + ' variantes no declaran AUDIO=',
      orphan === 0 ? null : 'primeras líneas: ' + scan.variants.filter(v => !('AUDIO' in v.attrs)).slice(0, 10).map(v => v.line).join(', '));

    // 3) unicidad GROUP-ID + NAME + LANGUAGE
    const seen = new Map();
    const dups = [];
    for (const r of scan.audioRenditions) {
      const k = [r.attrs['GROUP-ID'] || '', r.attrs.NAME || '', r.attrs.LANGUAGE || ''].join('\u0000');
      if (seen.has(k)) dups.push({ line: r.line, prev: seen.get(k), key: k.replace(/\u0000/g, ' + ') });
      else seen.set(k, r.line);
    }
    push('unicidad GROUP-ID+NAME+LANGUAGE', dups.length === 0,
      dups.length === 0 ? seen.size + ' combinaciones únicas' : dups.length + ' duplicados',
      dups.slice(0, 10).map(d => 'line ' + d.line + ' duplica line ' + d.prev + ' (' + d.key + ')').join(' | '));

    // 3b) DEFAULT=YES: como mucho uno por GROUP-ID
    const defPerGroup = new Map();
    for (const r of scan.audioRenditions) {
      if (String(r.attrs.DEFAULT || '').toUpperCase() === 'YES') {
        const g = r.attrs['GROUP-ID'] || '';
        defPerGroup.set(g, (defPerGroup.get(g) || 0) + 1);
      }
    }
    const multiDef = [...defPerGroup.entries()].filter(([, c]) => c > 1);
    push('DEFAULT=YES como máximo uno por GROUP-ID', multiDef.length === 0,
      multiDef.length === 0 ? 'ningún grupo con más de un DEFAULT=YES' : 'grupos con varios DEFAULT=YES: ' + multiDef.map(([g, c]) => g + '=' + c).join(', '),
      null);
  } else {
    push('AUDIO= / GROUP-ID', true,
      'el master NO declara #EXT-X-MEDIA TYPE=AUDIO: es MUXED (nada que resolver aquí; el gate de throughpass queda NO_COMPUTADO)',
      null);
  }

  // 4) SESSION-DATA con NAME= o sin DATA-ID
  push('SESSION-DATA usa DATA-ID (no NAME)',
    scan.sessionDataName.length === 0 && scan.sessionDataNoId.length === 0,
    scan.sessionDataName.length === 0 && scan.sessionDataNoId.length === 0
      ? scan.sessionData.length + ' líneas SESSION-DATA, todas con DATA-ID'
      : 'NAME= en ' + scan.sessionDataName.length + ' líneas; sin DATA-ID en ' + scan.sessionDataNoId.length,
    [...new Map([...scan.sessionDataName, ...scan.sessionDataNoId].map(s => [s.line, s])).values()].slice(0, 10).map(s => 'line ' + s.line + ': ' + s.raw).join(' | ') || null);

  const hasFail = failures.length > 0;
  const muxed = scan.audioRenditions.length === 0;
  const status = hasFail ? 'FAIL' : (muxed ? 'NO_COMPUTADO' : 'PASS');
  return {
    gate: 'G1_structure',
    status,
    demuxed: !muxed,
    audio_renditions: scan.audioRenditions.length,
    audio_groups: [...groups],
    variants: scan.variants.length,
    session_data_lines: scan.sessionData.length,
    checks: checks.slice(0, 300),
    checks_total: checks.length,
    failures: failures.slice(0, 100),
    failures_total: failures.length,
    reason: muxed && !hasFail ? 'el master no declara #EXT-X-MEDIA TYPE=AUDIO; no hay estructura de demuxed que verificar' : null
  };
}

// ---------------------------------------------------------------------------
// G5 — layout del bloque: la cola tras la URI no se tira
// ---------------------------------------------------------------------------
// En la lista de referencia cada bloque de canal lleva DOS tags DESPUÉS de la URI
// (`#EXTVLCOPT:clock-jitter` y `#EXT-X-APE-CRYSTAL-UHD`) más una línea vacía:
// lines_after_uri=3 en 10.572 canales y 7 en el último. Un parser o un generador
// que cierre el bloque en la URI los pierde en el 100 % de los canales y no avisa.
//
// El invariante es "al menos 2 tags de cola por bloque", NO los nombres literales:
// fijar los nombres haría que un cambio legítimo de la lista rompiera el gate, y un
// gate que rompe por evolución no se mantiene, se desactiva.
function gateBlockLayout(scan) {
  // El último bloque del fichero cierra con EOF, no con #EXTINF: se añade aparte.
  const bloques = scan.blockTail.slice();
  if (scan._tail) {
    bloques.push({ channel: scan._tailChannel, tags: scan._tail.slice(0, 12), count: scan._tail.length });
  }

  if (!scan.isCatalogue || bloques.length === 0) {
    return {
      gate: 'G5_block_layout_tail',
      status: 'NO_COMPUTADO',
      reason: 'el master no tiene bloques de canal (#EXTINF + URI): no hay layout de bloque que verificar',
      blocks: 0,
      failures: [],
      failures_total: 0
    };
  }

  const MIN = 2;
  const failures = [];
  const dist = {};
  const tagHist = new Map();

  for (const b of bloques) {
    dist[b.count] = (dist[b.count] || 0) + 1;
    for (const t of b.tags) {
      const ci = t.indexOf(':');
      const name = t.startsWith('#') && ci > 0 ? t.slice(0, ci) : t;
      tagHist.set(name, (tagHist.get(name) || 0) + 1);
    }
    if (b.count < MIN && failures.length < 100) {
      failures.push({ channel: b.channel, tags_after_uri: b.count, tail: b.tags });
    }
  }

  const malos = bloques.filter(b => b.count < MIN).length;

  return {
    gate: 'G5_block_layout_tail',
    status: malos > 0 ? 'FAIL' : 'PASS',
    blocks: bloques.length,
    min_tags_required: MIN,
    tags_after_uri_distribution: dist,
    tail_tag_names: [...tagHist.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, n]) => ({ tag: name, blocks: n })),
    failures,
    failures_total: malos,
    reason: malos > 0
      ? malos + ' de ' + bloques.length + ' bloques tienen menos de ' + MIN +
        ' tags tras la URI: cerrar el bloque en la URI los pierde en todos esos canales'
      : null
  };
}

// ---------------------------------------------------------------------------
// G6 — metadata chunked del LAB: completa y decodificable
// ---------------------------------------------------------------------------
// La cabecera embebe el laboratorio en N chunks `#EXT-X-APE-LAB-METADATA:<i>/<n>:<b64>`.
// Concatenados en orden y decodificados UNA vez dan el JSON del LAB (51.890 B, schema
// ape-lab-metadata-v1, 20 chunks en la lista de referencia). Es la pieza que el operador
// llama "lo excepcional", y un generador que reescribe el fichero puede tirar un chunk,
// duplicarlo o truncarlo y el manifiesto seguiria pareciendo valido.
//
// Ausente = NO_COMPUTADO, no FAIL: un master puede no ser de este ecosistema y eso no es
// un defecto. Declarada pero incompleta o indescifrable = FAIL, sin excepcion.
function gateLabMetadata(scan) {
  if (!scan.labMeta.length) {
    return {
      gate: 'G6_lab_metadata_chunks',
      status: 'NO_COMPUTADO',
      reason: 'el master no declara #EXT-X-APE-LAB-METADATA: no hay metadata chunked que verificar',
      chunks: 0,
      failures: [],
      failures_total: 0
    };
  }

  const failures = [];
  const malformed = scan.labMeta.filter(c => c.i === null);
  if (malformed.length) {
    failures.push({ kind: 'malformed', count: malformed.length, sample: malformed.slice(0, 5).map(c => c.malformed) });
  }

  const bien = scan.labMeta.filter(c => c.i !== null);
  const ns = [...new Set(bien.map(c => c.n))];
  if (ns.length > 1) {
    failures.push({ kind: 'n_inconsistente', valores: ns.slice(0, 10) });
  }
  const n = ns.length === 1 ? ns[0] : (ns.length ? Math.max(...ns) : 0);

  const vistos = new Set();
  const duplicados = [];
  for (const c of bien) {
    if (vistos.has(c.i)) duplicados.push(c.i);
    vistos.add(c.i);
  }
  if (duplicados.length) {
    failures.push({ kind: 'indice_duplicado', indices: [...new Set(duplicados)].slice(0, 20) });
  }

  const faltan = [];
  const fueraDeRango = [];
  for (let k = 1; k <= n; k++) if (!vistos.has(k)) faltan.push(k);
  for (const c of bien) if (c.i < 1 || c.i > n) fueraDeRango.push(c.i);
  if (faltan.length) failures.push({ kind: 'chunks_faltantes', indices: faltan.slice(0, 50), total_faltan: faltan.length });
  if (fueraDeRango.length) failures.push({ kind: 'indice_fuera_de_rango', indices: [...new Set(fueraDeRango)].slice(0, 20) });

  // Solo se intenta decodificar si la estructura esta completa: decodificar un conjunto
  // incompleto daria un JSON invalido por construccion y ocultaria la causa real.
  let decoded = null;
  let jsonOk = null;
  let jsonKeys = null;
  let b64Ok = null;
  if (!failures.length) {
    const concat = bien
      .slice()
      .sort((a, b) => a.i - b.i)
      .map(c => c.payload.replace(/\s+/g, ''))
      .join('');
    let buf = null;
    try {
      buf = Buffer.from(concat, 'base64');
      b64Ok = buf.toString('base64') === concat;
    } catch (_) {
      b64Ok = false;
    }
    if (!b64Ok) {
      failures.push({ kind: 'base64_invalido', chars: concat.length });
    } else {
      decoded = buf.length;
      const txt = buf.toString('utf8');
      try {
        const j = JSON.parse(txt);
        jsonOk = true;
        jsonKeys = j && typeof j === 'object' && !Array.isArray(j) ? Object.keys(j).slice(0, 20) : null;
      } catch (e) {
        jsonOk = false;
        failures.push({ kind: 'json_invalido', error: String(e.message).slice(0, 160), inicio: txt.slice(0, 120) });
      }
    }
  }

  return {
    gate: 'G6_lab_metadata_chunks',
    status: failures.length ? 'FAIL' : 'PASS',
    chunks: scan.labMeta.length,
    declared_total: n,
    base64_chars: bien.length && !failures.length ? bien.reduce((s, c) => s + c.payload.replace(/\s+/g, '').length, 0) : null,
    base64_roundtrip_ok: b64Ok,
    decoded_bytes: decoded,
    json_valid: jsonOk,
    json_root_keys: jsonKeys,
    failures,
    failures_total: failures.length,
    reason: failures.length
      ? 'la metadata chunked del LAB esta declarada pero no es integra: ' + failures.map(f => f.kind).join(', ')
      : null
  };
}

// ---------------------------------------------------------------------------
// G2 — cero downscale de vídeo
// ---------------------------------------------------------------------------
function gateDownscale(scan, opt) {
  const src = parseResolution(opt.sourceResolution);
  const failures = [];
  const variants = scan.variants;
  let worst = null;
  let belowBitrate = 0;
  let belowFps = 0;

  if (!src) {
    return {
      gate: 'G2_zero_video_downscale',
      status: 'NO_COMPUTADO',
      reason: 'sin --source-resolution no se puede comparar: la resolución nativa la declara el operador, no se infiere del master (inferirla haría el gate vacuo)',
      variants: variants.length,
      failures: [], failures_total: 0
    };
  }

  for (const v of variants) {
    const r = parseResolution(v.attrs.RESOLUTION);
    if (!r) {
      failures.push({ line: v.line, kind: 'resolution_missing', detail: 'variante sin RESOLUTION: no se puede demostrar que no baja' });
      continue;
    }
    if (r.w < src.w || r.h < src.h) {
      failures.push({
        line: v.line, kind: 'resolution_below_source',
        detail: r.raw + ' < ' + src.w + 'x' + src.h,
        bandwidth: v.attrs.BANDWIDTH || null
      });
    }
    if (!worst || r.w * r.h < worst.w * worst.h) worst = { w: r.w, h: r.h, raw: r.raw, line: v.line };
    if (opt.minVideoBitrate) {
      const bw = Number(v.attrs.BANDWIDTH);
      if (!Number.isFinite(bw) || bw < opt.minVideoBitrate) {
        belowBitrate++;
        failures.push({ line: v.line, kind: 'bandwidth_below_min', detail: 'BANDWIDTH=' + (v.attrs.BANDWIDTH || 'ausente') + ' < ' + opt.minVideoBitrate, bandwidth: v.attrs.BANDWIDTH || null });
      }
    }
    if (opt.sourceFramerate) {
      const fr = Number(String(v.attrs['FRAME-RATE'] || '').trim());
      if (!Number.isFinite(fr) || fr < opt.sourceFramerate) {
        belowFps++;
        failures.push({ line: v.line, kind: 'framerate_below_min', detail: 'FRAME-RATE=' + (v.attrs['FRAME-RATE'] || 'ausente') + ' < ' + opt.sourceFramerate });
      }
    }
  }

  const status = failures.length ? 'FAIL' : 'PASS';
  return {
    gate: 'G2_zero_video_downscale',
    status,
    source_resolution: src.w + 'x' + src.h,
    source_framerate: opt.sourceFramerate || null,
    min_video_bitrate: opt.minVideoBitrate || null,
    variants: variants.length,
    variants_with_resolution: variants.filter(v => parseResolution(v.attrs.RESOLUTION)).length,
    worst_variant: worst,
    below_bitrate: belowBitrate,
    below_framerate: belowFps,
    failures: failures.slice(0, 100),
    failures_total: failures.length,
    note: 'ley del operador: el VÍDEO nunca baja. Bajar AUDIO (canales/bitrate) sí está permitido y NO se evalúa aquí.'
  };
}

// ---------------------------------------------------------------------------
// G3 — cero caps de vídeo
// ---------------------------------------------------------------------------
function gateCaps(scan) {
  const hits = scan.caps;
  const byToken = [...scan.capTokenCounts.entries()].sort((a, b) => b[1] - a[1]);
  const status = (scan.capsLines || hits.length) ? 'FAIL' : 'PASS';
  return {
    gate: 'G3_zero_video_caps',
    status,
    tokens_task: FORBIDDEN_CAPS_TASK,
    tokens_from_cap_verdicts: CAP_VERDICTS.prohibited.map(p => p.key),
    tokens_checked_total: CAP_TOKENS.length,
    cap_verdicts_source: CAP_VERDICTS.source,
    caps_lines: scan.capsLines,
    hits_total: scan.capsPairs,
    hits_detail_kept: hits.length,
    hits_overflow: scan.capsOverflow,
    by_token: byToken.map(([token, n]) => ({ token, n })),
    failures: hits.slice(0, 100),
    failures_total: scan.capsLines,
    note: 'un cap pide una salida PEOR que la fuente declarada; la ley prohíbe capar vídeo (resolución/bitrate/fps). ' +
      'Origen de la lista de tokens: encargo (8) + cap_verdicts.json de t10 (veredicto medido cap_de_video). ' +
      'hits_total cuenta pares (línea, token): una línea puede llevar dos tokens.'
  };
}

// ---------------------------------------------------------------------------
// G4 — throughpass de audio medido con ffprobe
// ---------------------------------------------------------------------------
function ffprobeOne(ffprobeBin, target) {
  const args = [
    '-v', 'error',
    '-print_format', 'json',
    '-show_streams', '-show_format',
    target
  ];
  const t0 = Date.now();
  const r = spawnSync(ffprobeBin, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  const ms = Date.now() - t0;
  if (r.error) return { ok: false, error: 'ffprobe no ejecutable: ' + r.error.message, elapsed_ms: ms, target };
  if (r.status !== 0) return { ok: false, error: 'ffprobe exit ' + r.status + ': ' + String(r.stderr || '').trim().slice(0, 400), elapsed_ms: ms, target };
  let j;
  try { j = JSON.parse(r.stdout); } catch (e) { return { ok: false, error: 'salida de ffprobe no es JSON: ' + e.message, elapsed_ms: ms, target }; }
  const streams = Array.isArray(j.streams) ? j.streams : [];
  const audio = streams.find(s => s.codec_type === 'audio') || null;
  if (!audio) return { ok: false, error: 'el recurso no contiene pista de audio', elapsed_ms: ms, target, streams: streams.map(s => s.codec_type) };
  const fmt = j.format || {};
  const dur = Number(audio.duration || fmt.duration || NaN);
  let br = Number(audio.bit_rate || NaN);
  let brSource = 'stream';
  if (!Number.isFinite(br)) {
    if (Number.isFinite(Number(fmt.bit_rate))) { br = Number(fmt.bit_rate); brSource = 'format'; }
    else if (Number.isFinite(dur) && dur > 0 && Number.isFinite(Number(fmt.size))) { br = Math.round(Number(fmt.size) * 8 / dur); brSource = 'calculado(size/duration)'; }
    else { br = null; brSource = 'no_computado'; }
  }
  const codecName = String(audio.codec_name || '').toLowerCase();
  let rfc = CODEC_TO_RFC[codecName] || codecName || null;
  const profile = audio.profile || null;
  if (codecName === 'aac' && profile && AAC_PROFILE_TO_RFC[profile]) rfc = AAC_PROFILE_TO_RFC[profile];
  return {
    ok: true,
    elapsed_ms: ms,
    target,
    audio: {
      codec: codecName || null,
      codec_rfc6381: rfc,
      profile: profile,
      sample_rate: Number(audio.sample_rate) || null,
      channels: Number(audio.channels) || null,
      channel_layout: audio.channel_layout || null,
      bit_rate: Number.isFinite(br) ? Math.round(br) : null,
      bit_rate_source: brSource,
      duration_s: Number.isFinite(dur) ? Number(dur.toFixed(3)) : null,
      codec_long_name: audio.codec_long_name || null
    },
    container: fmt.format_name || null
  };
}

function codecMatches(expected, measuredRfc, measuredName) {
  if (!expected || expected === 'any') return true;
  const e = String(expected).toLowerCase();
  const cand = [String(measuredRfc || '').toLowerCase(), String(measuredName || '').toLowerCase()];
  if (e === 'aac') return cand.includes('aac') || cand.some(c => c.startsWith('mp4a.40.'));
  if (e === 'ac-3' || e === 'ac3') return cand.includes('ac-3') || cand.includes('ac3');
  if (e === 'ec-3' || e === 'eac3') return cand.includes('ec-3') || cand.includes('eac3');
  return cand.includes(e);
}

function gateThroughpass(scan, opt) {
  const targets = [];
  for (const s of opt.audioSegments) targets.push({ target: s, how: 'segmento explícito' });

  // --probe-rendition: resolver la URI de la rendition declarada en el master
  for (const want of opt.probeRenditions) {
    const cand = scan.audioRenditions.find(r =>
      (r.attrs['GROUP-ID'] || '') === want || (r.attrs.NAME || '') === want);
    if (!cand) {
      return {
        gate: 'G4_audio_throughpass', status: 'NO_COMPUTADO',
        reason: 'no existe ninguna rendition con GROUP-ID/NAME="' + want + '" en el master',
        measurements: [], failures: []
      };
    }
    const uri = cand.attrs.URI || '';
    if (!uri) {
      return { gate: 'G4_audio_throughpass', status: 'NO_COMPUTADO', reason: 'la rendition "' + want + '" no declara URI', measurements: [], failures: [] };
    }
    if (/\*\*\*|<USER>|<PASS>|<HOST>/.test(uri)) {
      return {
        gate: 'G4_audio_throughpass', status: 'NO_COMPUTADO',
        reason: 'la URI de la rendition "' + want + '" está ENMASCARADA (modo redacted): no hay recurso medible. ' +
          'Un master enmascarado no es reproducible por diseño (ver SECURITY.md)',
        measurements: [], failures: []
      };
    }
    targets.push({ target: uri, how: 'rendition "' + want + '" del master (line ' + cand.line + ')' });
  }

  if (targets.length === 0) {
    return {
      gate: 'G4_audio_throughpass',
      status: 'NO_COMPUTADO',
      reason: 'no se aportó --audio-segment ni --probe-rendition: el throughpass real exige un recurso de audio accesible. ' +
        'Este arnés NO descarga red por su cuenta y NO usa md5 de bytes (ver cabecera del script: el md5 no distingue un repackage de un transcode)',
      measurements: [], failures: [], checks: []
    };
  }

  const measurements = [];
  const failures = [];
  for (const t of targets) {
    const m = ffprobeOne(opt.ffprobe, t.target);
    if (!m.ok) {
      measurements.push({ target: t.target, how: t.how, status: 'NO_COMPUTADO', error: m.error, elapsed_ms: m.elapsed_ms });
      failures.push({ kind: 'probe_failed', target: t.target, detail: m.error, hard: false });
      continue;
    }
    const checks = [];
    if (opt.expectCodec) {
      const ok = codecMatches(opt.expectCodec, m.audio.codec_rfc6381, m.audio.codec);
      checks.push({ check: 'codec', expected: opt.expectCodec, measured: m.audio.codec_rfc6381 + ' (' + m.audio.codec + (m.audio.profile ? '/' + m.audio.profile : '') + ')', status: ok ? 'PASS' : 'FAIL' });
      if (!ok) failures.push({ kind: 'codec_mismatch', target: t.target, detail: 'esperado ' + opt.expectCodec + ', medido ' + m.audio.codec_rfc6381, hard: true });
    }
    if (opt.expectSampleRate) {
      const ok = m.audio.sample_rate === opt.expectSampleRate;
      checks.push({ check: 'sample_rate', expected: opt.expectSampleRate, measured: m.audio.sample_rate, status: ok ? 'PASS' : 'FAIL' });
      if (!ok) failures.push({ kind: 'sample_rate_mismatch', target: t.target, detail: 'esperado ' + opt.expectSampleRate + ', medido ' + m.audio.sample_rate, hard: true });
    }
    if (opt.expectChannels) {
      const ok = m.audio.channels === opt.expectChannels;
      checks.push({ check: 'channels', expected: opt.expectChannels, measured: m.audio.channels, status: ok ? 'PASS' : 'FAIL' });
      if (!ok) failures.push({ kind: 'channels_mismatch', target: t.target, detail: 'esperado ' + opt.expectChannels + ', medido ' + m.audio.channels, hard: true });
    }
    measurements.push({
      target: t.target, how: t.how, status: checks.some(c => c.status === 'FAIL') ? 'FAIL' : 'PASS',
      elapsed_ms: m.elapsed_ms, audio: m.audio, container: m.container, checks
    });
  }

  const hardFails = failures.filter(f => f.hard);
  const probed = measurements.filter(m => m.status !== 'NO_COMPUTADO');
  let status;
  if (hardFails.length) status = 'FAIL';
  else if (probed.length === 0) status = 'NO_COMPUTADO';
  else status = 'PASS';

  return {
    gate: 'G4_audio_throughpass',
    status,
    method: 'ffprobe -show_streams -show_format (codec/sample_rate/channels/bit_rate/duration)',
    why_not_md5: 'el md5 de bytes del segmento cambia con cualquier repackage y no dice codec/sr/canales/bitrate/duración; no distingue throughpass de transcode',
    audio_downscale_allowed: true,
    audio_downscale_flagged: opt.allowAudioDownscale,
    expected: { codec: opt.expectCodec, sample_rate: opt.expectSampleRate, channels: opt.expectChannels },
    measurements,
    failures,
    failures_total: failures.length,
    reason: probed.length === 0 ? 'ningún recurso pudo medirse con ffprobe' : null
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  const opt = parseArgs(process.argv.slice(2));

  if (opt.help) {
    const src = fs.readFileSync(__filename, 'utf8');
    const end = src.indexOf('*/');
    process.stdout.write(src.slice(0, end + 2) + '\n');
    process.exit(0);
  }
  if (!opt.input) die(3, 'falta el master de entrada (uso: verify_demuxed.js <master.m3u8> --source-resolution WxH)');
  if (!fs.existsSync(opt.input)) die(4, 'no existe el master: ' + opt.input);
  const st = fs.statSync(opt.input);
  if (!st.isFile() || st.size === 0) die(4, 'el master no es un fichero regular o está vacío: ' + opt.input);

  const t0 = Date.now();
  const scan = scanMaster(opt.input);
  const scanMs = Date.now() - t0;

  if (scan.variants.length === 0) {
    die(4, 'el master no contiene ningún #EXT-X-STREAM-INF: no hay variantes que verificar');
  }

  const g1 = gateStructure(scan);
  const g2 = gateDownscale(scan, opt);
  const g3 = gateCaps(scan);
  const g4 = gateThroughpass(scan, opt);
  const g5 = gateBlockLayout(scan);
  const g6 = gateLabMetadata(scan);

  const gates = [g1, g2, g3, g4, g5, g6];
  const fails = gates.filter(g => g.status === 'FAIL');
  // G5 y G6 son duros: tirar la cola del bloque o romper la metadata del LAB es
  // pérdida de datos silenciosa, no un aviso.
  const hardGates = [g1, g2, g3, g5, g6];
  const hardUncomputed = hardGates.filter(g => g.status === 'NO_COMPUTADO');
  const allPass = gates.every(g => g.status === 'PASS');

  let exit = 0;
  let verdict;
  if (fails.length) { exit = 1; verdict = 'FAIL'; }
  else if (allPass) { exit = 0; verdict = 'PASS'; }
  else if (hardUncomputed.length) { exit = 2; verdict = 'NO_COMPUTADO'; }
  else if (opt.strict) { exit = 2; verdict = 'NO_COMPUTADO'; }
  else { exit = 0; verdict = 'PASS_HARD_GATES'; }

  const report = {
    tool: TOOL,
    version: VERSION,
    generated_at: new Date().toISOString(),
    input: {
      path: opt.input,
      bytes: scan.bytes,
      lines: scan.lines,
      sha256: scan.sha256,
      mode: scan.isCatalogue ? 'catalogue' : 'master',
      extinf_blocks: scan.extinf,
      uri_lines: scan.uriLines,
      crlf_lines: scan.crlf,
      first_lines: scan.firstLines
    },
    options: {
      source_resolution: opt.sourceResolution,
      source_framerate: opt.sourceFramerate,
      min_video_bitrate: opt.minVideoBitrate,
      audio_segments: opt.audioSegments,
      probe_renditions: opt.probeRenditions,
      expect_audio_codec: opt.expectCodec,
      expect_sample_rate: opt.expectSampleRate,
      expect_channels: opt.expectChannels,
      allow_audio_downscale: opt.allowAudioDownscale,
      ffprobe: opt.ffprobe,
      strict: opt.strict
    },
    summary: {
      verdict,
      exit_code: exit,
      hard_gates_pass: hardGates.every(g => g.status === 'PASS'),
      all_gates_pass: allPass,
      demuxed: g1.demuxed,
      gates: gates.map(g => ({ gate: g.gate, status: g.status, failures: (g.failures_total || 0) })),
      scan_ms: scanMs,
      total_ms: Date.now() - t0
    },
    // Derivado del array, NO enumerado a mano: antes esta linea listaba g1..g4 y G5/G6
    // corrian pero no llegaban al informe JSON, asi que cualquier consumidor del informe
    // los veia como inexistentes. Un gate invisible en el informe no esta conectado.
    // La clave va en minusculas para conservar exactamente las claves historicas.
    gates: Object.fromEntries(gates.map(g => [g.gate.toLowerCase(), g])),
    evidence: {
      master: opt.input,
      master_sha256: scan.sha256,
      cap_tokens_task: FORBIDDEN_CAPS_TASK,
      cap_verdicts_source: CAP_VERDICTS.source,
      cap_tokens_checked: CAP_TOKENS,
      ffprobe: opt.ffprobe,
      generated_by: 'node ' + TOOL + ' ' + process.argv.slice(2).join(' ')
    }
  };

  fs.writeFileSync(opt.json, JSON.stringify(report, null, 2), 'utf8');

  if (!opt.quiet) {
    const line = (g) => '  ' + g.gate.padEnd(26) + g.status.padEnd(14) +
      (g.status === 'FAIL' ? (g.failures_total + ' fallo(s)') :
        g.status === 'NO_COMPUTADO' ? (g.reason || '').slice(0, 90) :
          (g.failures_total === 0 ? 'ok' : ''));
    process.stdout.write('verify_demuxed ' + VERSION + '  ->  ' + verdict + '  (exit ' + exit + ')\n');
    process.stdout.write('  master: ' + opt.input + '  (' + scan.bytes + ' B, ' + scan.lines + ' líneas, sha256 ' + scan.sha256.slice(0, 16) + '…, modo ' + report.input.mode + ')\n');
    for (const g of gates) process.stdout.write(line(g) + '\n');
    if (g4.status === 'PASS' && g4.measurements.length) {
      for (const m of g4.measurements) {
        process.stdout.write('  audio medido: ' + m.audio.codec_rfc6381 + ' ' + m.audio.sample_rate + ' Hz ' +
          m.audio.channels + ' ch ' + (m.audio.bit_rate || 'br n/d') + ' ' + (m.audio.duration_s || '?') + ' s  [' + m.target + ']\n');
      }
    }
    process.stdout.write('  JSON: ' + opt.json + '\n');
  }
  process.exit(exit);
}

main();
