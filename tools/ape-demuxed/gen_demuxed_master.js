#!/usr/bin/env node
/**
 * gen_demuxed_master.js — Master HLS demuxed real: #EXT-X-MEDIA de audio + CERO caps de vídeo
 * ============================================================================================
 *
 * Node >= 18, CERO dependencias.
 *
 * QUÉ HACE
 *   1. Emite #EXT-X-MEDIA:TYPE=AUDIO por cada rendition de audio REAL (con URI verificable).
 *   2. Añade AUDIO="<gid>" a cada #EXT-X-STREAM-INF y reescribe CODECS= con el códec de vídeo
 *      REAL del origen + los códecs del grupo de audio.
 *   3. Elimina los caps de VÍDEO del master emitido (la ley del operador prohíbe capar vídeo;
 *      bajar audio sí está permitido).
 *   4. Falla cerrado (exit != 0) si hay una variante por debajo de la fuente declarada, o si
 *      el audio no se puede establecer sin inventar.
 *
 * ---------------------------------------------------------------------------------------------
 * POR QUÉ CADA REGLA — cada una cita el hecho MEDIDO que la obliga
 * ---------------------------------------------------------------------------------------------
 *
 * [R1] NO inventar renditions de audio.
 *      Hecho: `#EXT-X-MEDIA` = 0 en los 10.573 canales de la lista de referencia
 *      (docs/cartography/APE_LISTA_523d52a6/01_STRUCTURE.md, 03_HEADERS_MAP.md §7).
 *      El origen es MUXED legacy. Un generador que emitiera
 *      `#EXT-X-MEDIA:TYPE=AUDIO,...,URI=<algo>` sin una rendition real detrás produciría un
 *      manifiesto que promete un recurso inexistente: el player pediría esa URI y recibiría 404.
 *      Por eso este script SOLO emite audio demuxed si hay una fuente de verdad:
 *        (a) el propio master de entrada ya declara #EXT-X-MEDIA TYPE=AUDIO con URI=, o
 *        (b) el operador entrega --audio <json> con renditions MEDIDAS (evidence: probed|in_source).
 *      Si no hay ninguna → AUDIO_RENDITIONS = NO_COMPUTADO, exit 2, y NO se emite nada inventado.
 *      Con --allow-muxed-passthrough se emite el master con el audio tal como venía (muxed) y el
 *      reporte lo declara; el script nunca "simula" que hay demuxed.
 *
 * [R2] El respaldo estéreo `aud_st` también exige URI real.
 *      La ley permite bajar canales/bitrate en AUDIO, y el script emite ese respaldo SIEMPRE QUE
 *      exista una rendition estéreo real aportada con channels="2". Producir esa rendition exige
 *      un transcodificador de audio (permitido), no un generador de playlists. Sin ella, se
 *      declara NO_COMPUTADO en vez de escribir una URI que no existe.
 *
 * [R3] Caps de vídeo fuera.
 *      Hechos: `inputstream.adaptive.max_resolution=1920x1080` en 10.573 canales;
 *      `#EXTVLCOPT:adaptive-maxbitrate=8000000` en 9.765;
 *      `#EXTVLCOPT:video-width=1280/video-height=720` en 7.457 y `1920x1080` en 2.308
 *      (docs/cartography/APE_LISTA_523d52a6/03_HEADERS_MAP.md §8, C1/C12).
 *      La ley del operador prohíbe capar VÍDEO (resolución/bitrate/fps). Estos valores piden una
 *      salida PEOR que la fuente declarada. Se eliminan del master emitido.
 *
 * [R4] — la verdad incómoda: dos de esas familias NO capan nada en VLC.
 *      Hecho medido: de 138 nombres de opción #EXTVLCOPT distintos, **80 (58 %) no existen en
 *      ningún binario de VLC**; entre ellas TODA la familia `adaptive-*` (36), `video-width`,
 *      `video-height`, `video-fps`, `video-hdr*` (tools/ape-image-recipes/VLC_OPT_AUDIT.md;
 *      04_LANE_CAPABILITY_MATRIX.md §7.4.5). VLC las descarta EN SILENCIO: no dejan línea de log.
 *      Consecuencia honesta: quitar `adaptive-maxbitrate` / `video-width` / `video-height` NO
 *      levanta ningún techo real en VLC — levanta un techo DECLARADO. Se quitan por verdad
 *      (no prometer lo que no se aplica) y por ley, no porque VLC estuviera capando.
 *      En cambio `inputstream.adaptive.max_resolution|max_bitrate|max_framerate` son claves del
 *      addon de Kodi: ahí el cap es REAL. Este script marca cada línea con su `effect` medido.
 *
 * [R5] Fail-closed por variante degradada.
 *      La ley prohíbe resolver un fallo bajando resolución/bitrate (ANTI_DEGRADATION_LAW). Un
 *      master con una escalera ABR que baja vídeo la viola. Se compara cada variante contra la
 *      fuente declarada del canal (la de mayor área × bandwidth) y se RECHAZA (exit 3) si alguna
 *      queda por debajo. La lista de referencia cumple: 1 sola variante por canal.
 *
 * [R6] No se inventa el códec de vídeo.
 *      Hecho: `CODECS="hvc1.2.4.L153.B0,mp4a.40.2"` presente en el 100 % de los STREAM-INF
 *      (03_HEADERS_MAP.md §7). El códec de vídeo se toma VERBATIM del origen. Si el origen no
 *      declara CODECS, el reporte dice VIDEO_CODEC=NO_COMPUTADO y no se escribe un códec inventado.
 *      Esto respeta la GOLDEN RULE hvc1/hev1: el script no añade jamás un `hev1.` a STREAM-INF.
 *
 * [R7] El bloque NO se delimita por un número fijo de líneas.
 *      Hecho: en la lista el URI **no** es la última línea del bloque; le siguen
 *      `#EXTVLCOPT:clock-jitter=0` y `#EXT-X-APE-CRYSTAL-UHD` (lines_after_uri=3 en 10.572
 *      canales, 7 en el último). Delimitar por tramo fijo pierde tags.
 *      Este script delimita por el marcador real: `#EXTINF` (modo catálogo) o el inicio del
 *      fichero (modo master).
 *
 * [R8] Los tags desconocidos se preservan y NO se presentan como aplicados.
 *      RFC 8216 §6.3.1: un cliente conforme ignora los tags que no conoce. Los ~615-618
 *      `#EXT-X-APE-*`, 25 `#EXT-X-CMAF-*`, 20 VNOVA y 18 PHANTOM por canal son metadata INERTE
 *      (04_LANE_CAPABILITY_MATRIX.md §7.5). Este script los copia verbatim: no los borra (podrían
 *      ser plano de control de un daemon) y no afirma que hagan nada.
 *
 * [R9] `Access-Control-Allow-Origin: *` no es un tag.
 *      Es una cabecera de RESPUESTA HTTP. Ningún generador de playlists puede emitirla; se
 *      configura en el servidor. Este script no la toca y el README lo dice.
 *
 * [R10] Group-ID único por canal en modo catálogo.
 *      La lista es un catálogo de 10.573 canales, cada uno con su propio STREAM-INF. Un
 *      GROUP-ID="aud" global haría que todos los canales compartieran grupo de audio: el player
 *      elegiría una rendition de OTRO canal. Por eso en modo catálogo el grupo es
 *      `aud_<channelKey>`. En modo master (un solo flujo) sí se usa `aud`.
 *
 * ---------------------------------------------------------------------------------------------
 * USO
 * ---------------------------------------------------------------------------------------------
 *   node gen_demuxed_master.js --in <master.m3u8> [opciones]
 *
 *   --in <path>                 Master o catálogo de entrada. Obligatorio.
 *   --out <path|->              Salida. '-' = stdout. Sin --out y sin --report-only => error.
 *   --audio <json>              Renditions de audio REALES (ver esquema en README).
 *   --report <path>             Reporte JSON machine-readable.
 *   --report-only               Analiza y reporta; no escribe playlist (para listas enormes).
 *   --allow-muxed-passthrough   Permite salir 0 dejando el audio MUXED, declarándolo.
 *   --audio-group-id <id>       GROUP-ID en modo master (default: "aud").
 *   --declared-source WxH@bps   Sube el listón del fail-closed (la fuente real declarada).
 *   --caps limiting|all         Qué caps quitar (default: all — ver [R3]/[R4]).
 *   --mask-credentials          Enmascara usuario/password en las URIs emitidas.
 *   --quiet                     Sin salida humana por stderr.
 *
 * CÓDIGOS DE SALIDA
 *   0  OK                          — demuxed emitido, o muxed con --allow-muxed-passthrough
 *   2  AUDIO_NO_COMPUTADO          — no hay audio real y no se autorizó passthrough
 *   3  VIDEO_DOWNSCALE_VIOLATION   — una variante queda por debajo de la fuente declarada
 *   4  BAD_INPUT                   — fichero ilegible, vacío, o sin #EXT-X-STREAM-INF
 *   5  AUDIO_URI_NO_VERIFICABLE    — la rendition aportada no tiene evidencia válida (anti-invención)
 *
 * ESTADOS DE EVIDENCIA (skill ape-image-pipeline-truth §13)
 *   declarado · observado · resuelto · aplicado · verificado
 *   Todo lo que este script escribe es **declarado**. Nada de lo que emite está "aplicado".
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/* ==========================================================================================
 * 1. Tablas de verdad
 * ========================================================================================== */

/**
 * Caps de VÍDEO que el master emitido NO puede llevar (ley del operador: el vídeo nunca se capa).
 * `effect` documenta el EFECTO MEDIDO de la línea, no su intención:
 *   - 'kodi-addon-key'  : clave del addon inputstream.adaptive => el cap es real en Kodi.
 *   - 'inert-vlc'       : nombre AUSENTE en los binarios de VLC (VLC_OPT_AUDIT.md) => inerte.
 * `kind` decide cómo se compara contra la fuente: 'resolution' | 'bitrate' | 'fps'.
 */
const VIDEO_CAP_RULES = [
  // --- KODIPROP: claves del addon de Kodi. Cap REAL.
  { tag: '#KODIPROP', key: 'inputstream.adaptive.max_resolution', kind: 'resolution', effect: 'kodi-addon-key' },
  { tag: '#KODIPROP', key: 'inputstream.adaptive.max_bitrate', kind: 'bitrate', effect: 'kodi-addon-key' },
  { tag: '#KODIPROP', key: 'inputstream.adaptive.max_framerate', kind: 'fps', effect: 'kodi-addon-key' },
  // --- EXTVLCOPT: nombres que VLC NO conoce. Inerte en VLC; cap DECLARADO.
  { tag: '#EXTVLCOPT', key: 'adaptive-maxbitrate', kind: 'bitrate', effect: 'inert-vlc' },
  { tag: '#EXTVLCOPT', key: 'adaptive-maxwidth', kind: 'resolution', effect: 'inert-vlc' },
  { tag: '#EXTVLCOPT', key: 'adaptive-maxheight', kind: 'resolution', effect: 'inert-vlc' },
  { tag: '#EXTVLCOPT', key: 'video-width', kind: 'resolution', effect: 'inert-vlc' },
  { tag: '#EXTVLCOPT', key: 'video-height', kind: 'resolution', effect: 'inert-vlc' },
];

/**
 * Caps detectados que NO se quitan automáticamente (fuera del mandato explícito de esta tarea).
 * Se reportan para que el operador decida. No se tocan: cambiar comportamiento no pedido es riesgo.
 */
const VIDEO_CAP_CANDIDATES = [
  { tag: '#KODIPROP', key: 'inputstream.adaptive.chooser_bandwidth_max', kind: 'bitrate' },
  { tag: '#KODIPROP', key: 'inputstream.adaptive.preferred_video_resolution', kind: 'resolution' },
  { tag: '#KODIPROP', key: 'inputstream.adaptive.max_buffer_duration', kind: 'other' },
  { tag: '#EXTVLCOPT', key: 'adaptive-maxbw', kind: 'bitrate' },
  { tag: '#EXTVLCOPT', key: 'adaptive-bandwidth-factor', kind: 'other' },
  { tag: '#EXTVLCOPT', key: 'video-fps', kind: 'fps' },
  { tag: '#EXTVLCOPT', key: 'video-display-fps', kind: 'fps' },
  { tag: '#EXTVLCOPT', key: 'adaptive-maxbitrate-exact', kind: 'other' }, // placeholder defensivo
];

/** Códecs de audio reconocibles en una cadena RFC 6381 de CODECS=. */
const AUDIO_CODEC_RE = /^(mp4a\.|ac-3$|ec-3$|opus$|flac$|fLaC$|alac$|dtsc$|dtse$|dtsx$|mp3$|ac-4$)/i;

/** Evidencia aceptable para una rendition de audio. Sin esto, no se emite (anti-invención [R1]). */
const ACCEPTED_AUDIO_EVIDENCE = new Set(['probed', 'in_source']);

/** Marcadores de URI falsa/placeholder. Si aparecen, se rechaza (fail-closed). */
const PLACEHOLDER_MARKERS = ['<', '>', 'REAL_', 'PLACEHOLDER', 'TODO', 'CHANGEME', 'example.com', 'xxx', 'AAAA', '1234567890'];

/* ==========================================================================================
 * 2. Utilidades
 * ========================================================================================== */

const EXIT = {
  OK: 0,
  AUDIO_NO_COMPUTADO: 2,
  VIDEO_DOWNSCALE_VIOLATION: 3,
  BAD_INPUT: 4,
  AUDIO_URI_NO_VERIFICABLE: 5,
};

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) { a._.push(t); continue; }
    const k = t.slice(2);
    const next = argv[i + 1];
    const isFlag = next === undefined || next.startsWith('--');
    if (isFlag) { a[k] = true; } else { a[k] = next; i++; }
  }
  return a;
}

/** '1920x1080' -> {w,h,area} ; null si no parsea. NO adivina. */
function parseResolution(s) {
  if (typeof s !== 'string') return null;
  const m = /^\s*(\d{2,5})\s*[xX]\s*(\d{2,5})\s*$/.exec(s);
  if (!m) return null;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (!w || !h) return null;
  return { w, h, area: w * h, txt: `${w}x${h}` };
}

/** '9000000' | '8000000' | '8M' -> bps entero ; null si no parsea. NO adivina. */
function parseBitrate(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  let m = /^(\d+)$/.exec(t);
  if (m) return parseInt(m[1], 10);
  m = /^(\d+(?:\.\d+)?)\s*([kKmM])(?:bps)?$/.exec(t);
  if (m) {
    const n = parseFloat(m[1]);
    const mult = m[2].toLowerCase() === 'k' ? 1e3 : 1e6;
    return Math.round(n * mult);
  }
  return null;
}

/** Extrae atributos NAME=VALUE de una línea de tag HLS, respetando comillas. */
function parseAttrList(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && (body[i] === ',' || body[i] === ' ')) i++;
    const eq = body.indexOf('=', i);
    if (eq < 0) break;
    const name = body.slice(i, eq).trim();
    let j = eq + 1;
    let value = '';
    let quoted = false;
    if (body[j] === '"') {
      quoted = true;
      j++;
      let buf = '';
      while (j < body.length) {
        if (body[j] === '"') { j++; break; }
        buf += body[j++];
      }
      value = buf;
    } else {
      let buf = '';
      while (j < body.length && body[j] !== ',') buf += body[j++];
      value = buf.trim();
    }
    if (name) out.push({ name, value, quoted, raw: `${name}=${quoted ? `"${value}"` : value}` });
    i = j;
    while (i < body.length && body[i] !== ',') i++;
    if (i < body.length) i++;
  }
  return out;
}

/** Serializa una lista de atributos, citando lo que lo estaba. */
function serializeAttrList(list) {
  return list.map((a) => (a.quoted ? `${a.name}="${a.value}"` : `${a.name}=${a.value}`)).join(',');
}

/** Máscara de credenciales: user:pass@, rutas Xtream /user/pass/, query tokens. */
function maskCredentials(s) {
  if (typeof s !== 'string') return s;
  let v = s;
  v = v.replace(/\b([a-zA-Z][a-zA-Z0-9+.\-]*:\/\/)[^\s\/@:]+:[^\s\/@]*@/g, '$1***:***@');
  // Xtream: scheme://host[:port]/<user>/<pass>/<rest>
  v = v.replace(/\b([a-zA-Z][a-zA-Z0-9+.\-]*:\/\/[^\s\/:]+(?::\d+)?\/)[^\s\/?#]+\/[^\s\/?#]+(?=[\/?#])/g, '$1***/***');
  v = v.replace(/\b(token|password|pass|pwd|secret|apikey|api_key|username|user)=([^\s&,;"']+)/gi, '$1=***');
  return v;
}

function looksLikePlaceholder(uri) {
  if (typeof uri !== 'string' || !uri) return true;
  if (!/^https?:\/\//i.test(uri)) return true;
  const up = uri.toUpperCase();
  for (const marker of PLACEHOLDER_MARKERS) {
    if (up.includes(marker.toUpperCase())) return true;
  }
  return false;
}

const inc = (map, k) => map.set(k, (map.get(k) || 0) + 1);
const sortedObj = (map) => {
  const o = {};
  for (const [k, v] of [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) o[k] = v;
  return o;
};

/* ==========================================================================================
 * 3. Modelo de entrada
 * ========================================================================================== */

/**
 * Un "bloque" es la unidad mínima que se puede transformar:
 *   - modo catalogue: desde un #EXTINF hasta el siguiente #EXTINF (exclusive) [R7]
 *   - modo master:    todo el fichero
 * Cada bloque se analiza sin cargar el fichero en memoria (streaming).
 */
function newBlock(index, mode) {
  return {
    index,
    mode,
    extinf: null,
    uri: null,
    streamInfLines: [],   // [{ lineIndex, attrs, body }]
    streamInfWritten: 0,
    capLines: [],         // { lineIndex, rule, valueText, parsed, limits }
    candidateLines: [],   // { lineIndex, rule, valueText }
    emittableMedia: [],   // #EXT-X-MEDIA ya declaradas con URI real en el origen
    mediaLineIndexes: [], // índices de esas líneas (se reemplazan, no se duplican)
    otherMediaNoUri: 0,
    exthttpChannelId: null,
    tvgId: null,
    stableVariantId: null,
    apeCodecFamily: null,
  };
}

/* ==========================================================================================
 * 4. Carga de renditions de audio (fuente de verdad)
 * ========================================================================================== */

/**
 * Valida el JSON de renditions. Fail-closed: cualquier rendition sin evidencia aceptable o con
 * URI placeholder aborta con exit 5. Es el guardián de [R1].
 */
function loadAudioRenditions(file, report) {
  const raw = fs.readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw Object.assign(new Error(`--audio no es JSON válido: ${e.message}`), { exitCode: EXIT.BAD_INPUT });
  }
  const list = Array.isArray(parsed) ? parsed : parsed.renditions;
  if (!Array.isArray(list) || list.length === 0) {
    throw Object.assign(new Error('--audio no contiene un array "renditions" no vacío'), { exitCode: EXIT.BAD_INPUT });
  }

  const accepted = [];
  const rejected = [];
  for (const r of list) {
    const problems = [];
    if (!r || typeof r !== 'object') { rejected.push({ rendition: r, problems: ['no es objeto'] }); continue; }
    if (!r.uri || typeof r.uri !== 'string') problems.push('falta "uri"');
    else if (looksLikePlaceholder(r.uri)) problems.push('URI parece placeholder o no es http(s)');
    if (!r.codec || typeof r.codec !== 'string') problems.push('falta "codec" (RFC 6381)');
    if (!r.channels || typeof r.channels !== 'string') problems.push('falta "channels" (p.ej. "2" o "6")');
    if (!r.evidence || !ACCEPTED_AUDIO_EVIDENCE.has(String(r.evidence))) {
      problems.push(`"evidence" debe ser uno de: ${[...ACCEPTED_AUDIO_EVIDENCE].join('|')}`);
    }
    if (problems.length) rejected.push({ rendition: maskRendition(r), problems });
    else accepted.push({
      uri: r.uri,
      codec: r.codec,
      channels: String(r.channels),
      language: typeof r.language === 'string' ? r.language : '',
      name: typeof r.name === 'string' ? r.name : (r.language ? `audio-${r.language}-${r.channels}ch` : `audio-${r.channels}ch`),
      default: r.default === true,
      autoselect: r.autoselect !== false,
      evidence: r.evidence,
      isStereoFallback: String(r.channels) === '2' && r.role === 'fallback',
    });
  }

  report.audio_input = {
    file,
    renditions_declared: list.length,
    accepted: accepted.length,
    rejected: rejected.length,
    rejected_detail: rejected,
  };
  if (rejected.length) {
    // Rechazo duro: emitir una rendition sin evidencia es exactamente inventar [R1].
    throw Object.assign(
      new Error(`${rejected.length} rendition(s) de audio no verificables; no se emite ninguna (anti-invención)`),
      { exitCode: EXIT.AUDIO_URI_NO_VERIFICABLE, rejected }
    );
  }
  return accepted;
}

function maskRendition(r) {
  if (!r || typeof r !== 'object') return r;
  const c = { ...r };
  if (c.uri) c.uri = maskCredentials(c.uri);
  return c;
}

/* ==========================================================================================
 * 5. Análisis de una línea
 * ========================================================================================== */

const STREAM_INF = '#EXT-X-STREAM-INF:';
const IFRAME_INF = '#EXT-X-I-FRAME-STREAM-INF:';
const MEDIA = '#EXT-X-MEDIA:';
const EXTINF = '#EXTINF:';

function analyseLine(line, lineIndex, block, counters) {
  if (!line.startsWith('#')) {
    if (block.uri === null) block.uri = line;
    return null;
  }

  // --- #EXT-X-STREAM-INF: variante real
  if (line.startsWith(STREAM_INF)) {
    const body = line.slice(STREAM_INF.length);
    const attrs = parseAttrList(body);
    const get = (n) => { const a = attrs.find((x) => x.name.toUpperCase() === n); return a ? a.value : null; };
    block.streamInfLines.push({
      lineIndex,
      attrs,
      resolution: parseResolution(get('RESOLUTION')),
      bandwidth: parseBitrate(get('BANDWIDTH')),
      avgBandwidth: parseBitrate(get('AVERAGE-BANDWIDTH')),
      codecs: get('CODECS'),
      audioAttr: get('AUDIO'),
      stableVariantId: get('STABLE-VARIANT-ID'),
      rawResolution: get('RESOLUTION'),
      rawBandwidth: get('BANDWIDTH'),
    });
    inc(counters.streamInf, 'total');
    return null;
  }

  // --- #EXT-X-I-FRAME-STREAM-INF: trick-play, NO es una variante de reproducción.
  if (line.startsWith(IFRAME_INF)) { inc(counters.iframeInf, 'total'); return null; }

  // --- #EXT-X-MEDIA: ¿ya hay audio demuxed declarado en el origen?
  if (line.startsWith(MEDIA)) {
    const attrs = parseAttrList(line.slice(MEDIA.length));
    const get = (n) => { const a = attrs.find((x) => x.name.toUpperCase() === n); return a ? a.value : null; };
    const type = (get('TYPE') || '').toUpperCase();
    const uri = get('URI');
    if (type === 'AUDIO' && uri) {
      block.emittableMedia.push({
        uri,
        codec: get('CODECS') || '',
        channels: get('CHANNELS') || '',
        language: get('LANGUAGE') || '',
        name: get('NAME') || '',
        default: /^YES$/i.test(get('DEFAULT') || ''),
        autoselect: !/^NO$/i.test(get('AUTOSELECT') || 'YES'),
        evidence: 'in_source',
        groupIdInSource: get('GROUP-ID') || '',
        isStereoFallback: String(get('CHANNELS') || '') === '2',
      });
      // La línea original se REEMPLAZA (se reescribe con el GROUP-ID correcto), nunca se duplica.
      block.mediaLineIndexes.push(lineIndex);
      inc(counters.mediaWithUri, 'total');
    } else {
      block.otherMediaNoUri++;
      inc(counters.mediaWithoutUri, 'total');
    }
    return null;
  }

  // --- caps de vídeo (KODIPROP / EXTVLCOPT)
  if (line.startsWith('#KODIPROP:')) {
    const body = line.slice('#KODIPROP:'.length);
    const eq = body.indexOf('=');
    const key = (eq >= 0 ? body.slice(0, eq) : body).trim();
    const val = eq >= 0 ? body.slice(eq + 1).trim() : '';
    const rule = VIDEO_CAP_RULES.find((r) => r.tag === '#KODIPROP' && r.key === key);
    if (rule) {
      block.capLines.push({ lineIndex, rule, valueText: val });
      inc(counters.capsFound, rule.key);
      return null;
    }
    const cand = VIDEO_CAP_CANDIDATES.find((r) => r.tag === '#KODIPROP' && r.key === key);
    if (cand) { block.candidateLines.push({ lineIndex, rule: cand, valueText: val }); inc(counters.candidatesFound, key); }
    return null;
  }

  if (line.startsWith('#EXTVLCOPT:')) {
    const body = line.slice('#EXTVLCOPT:'.length);
    const eq = body.indexOf('=');
    const key = (eq >= 0 ? body.slice(0, eq) : body).trim();
    const val = eq >= 0 ? body.slice(eq + 1).trim() : '';
    const rule = VIDEO_CAP_RULES.find((r) => r.tag === '#EXTVLCOPT' && r.key === key);
    if (rule) {
      block.capLines.push({ lineIndex, rule, valueText: val });
      inc(counters.capsFound, rule.key);
      return null;
    }
    const cand = VIDEO_CAP_CANDIDATES.find((r) => r.tag === '#EXTVLCOPT' && r.key === key);
    if (cand) { block.candidateLines.push({ lineIndex, rule: cand, valueText: val }); inc(counters.candidatesFound, key); }
    return null;
  }

  // --- identidad del canal (para GROUP-ID único en modo catálogo [R10])
  if (line.startsWith('#EXTINF:')) {
    block.extinf = line;
    const idm = /\btvg-id="([^"]*)"/.exec(line);
    if (idm) block.tvgId = idm[1];
    return null;
  }
  if (line.startsWith('#EXTHTTP:')) {
    const m = /"X-APE-Channel-Id"\s*:\s*"([^"]*)"/.exec(line);
    if (m) block.exthttpChannelId = m[1];
    return null;
  }
  if (line.startsWith('#EXT-X-APE-CODEC-FAMILY')) {
    const m = /^#EXT-X-APE-CODEC-FAMILY:?(.*)$/.exec(line);
    if (m) block.apeCodecFamily = m[1].trim();
    return null;
  }
  return null;
}

/* ==========================================================================================
 * 6. Evaluación de caps contra la fuente declarada
 * ========================================================================================== */

/**
 * Decide si un cap LIMITA respecto de la fuente declarada del canal.
 * Devuelve true | false | null (null = NO COMPUTADO, no se puede saber).
 * Fail-honest: la ausencia de fuente NO se interpreta como "no limita" ni como "limita".
 */
function capLimits(rule, valueText, source) {
  if (!source) return null;
  if (rule.kind === 'resolution') {
    const cap = parseResolution(valueText);
    if (!cap || !source.resolution) return null;
    if (rule.key === 'adaptive-maxwidth' || rule.key === 'video-width') {
      return cap.w < source.resolution.w;
    }
    if (rule.key === 'adaptive-maxheight' || rule.key === 'video-height') {
      return cap.h < source.resolution.h;
    }
    return cap.area < source.resolution.area;
  }
  if (rule.kind === 'bitrate') {
    const cap = parseBitrate(valueText);
    if (cap === null || source.bandwidth === null) return null;
    return cap < source.bandwidth;
  }
  if (rule.kind === 'fps') {
    const cap = parseFps(valueText);
    if (cap === null || source.fps === null || source.fps === undefined) return null;
    return cap < source.fps;
  }
  return null;
}

/** FRAME-RATE es decimal ("30.000"), no entero. Parser propio para no confundir unidades. */
function parseFps(s) {
  if (typeof s !== 'string') return null;
  const v = Number.parseFloat(s.trim());
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** La fuente declarada de un canal = su variante de mayor área y, a igualdad, mayor BANDWIDTH. */
function declaredSource(block) {
  if (block.streamInfLines.length === 0) return null;
  const scored = block.streamInfLines.map((v, i) => ({
    v,
    i,
    area: v.resolution ? v.resolution.area : -1,
    bw: v.bandwidth === null || v.bandwidth === undefined ? -1 : v.bandwidth,
  }));
  scored.sort((a, b) => (b.area - a.area) || (b.bw - a.bw) || (a.i - b.i));
  const top = scored[0].v;
  const fpsAttr = (() => {
    const a = top.attrs.find((x) => x.name.toUpperCase() === 'FRAME-RATE');
    return a ? parseFps(a.value) : null;
  })();
  return {
    resolution: top.resolution,
    bandwidth: top.bandwidth,
    fps: fpsAttr,
    rawResolution: top.rawResolution,
    rawBandwidth: top.rawBandwidth,
    codecs: top.codecs,
    stableVariantId: top.stableVariantId,
    variantCount: block.streamInfLines.length,
    topLineIndex: top.lineIndex,
  };
}

/** Sobrescribe la fuente con --declared-source WxH@bps si el operador la conoce mejor. */
function overrideSource(source, declaredSourceArg) {
  if (!declaredSourceArg) return source;
  const m = /^(\d{2,5})x(\d{2,5})(?:@(\d+))?$/i.exec(String(declaredSourceArg).trim());
  if (!m) return source;
  const res = parseResolution(`${m[1]}x${m[2]}`);
  const bps = m[3] ? parseInt(m[3], 10) : null;
  return {
    ...(source || {}),
    resolution: res || (source ? source.resolution : null),
    bandwidth: bps !== null ? bps : (source ? source.bandwidth : null),
    overridden: true,
  };
}

/* ==========================================================================================
 * 7. Group-ID
 * ========================================================================================== */

/**
 * Clave estable del canal para el GROUP-ID. Prioriza identificadores medidos en la lista:
 * X-APE-Channel-Id (en #EXTHTTP) > tvg-id > índice del bloque. Nunca inventa: si no hay
 * identificador, usa el índice (estable y trazable).
 */
function channelKey(block) {
  if (block.exthttpChannelId) return String(block.exthttpChannelId);
  if (block.tvgId) return String(block.tvgId);
  return String(block.index);
}

/* ==========================================================================================
 * 8. Emisión
 * ========================================================================================== */

/** Construye la línea #EXT-X-MEDIA de una rendition. Solo se llama con audio verificado [R1]. */
function buildMediaLine(gid, r, isDefault, maskFlag) {
  const parts = [
    'TYPE=AUDIO',
    `GROUP-ID="${gid}"`,
    `NAME="${escapeQuoted(r.name)}"`,
  ];
  if (r.language) parts.push(`LANGUAGE="${escapeQuoted(r.language)}"`);
  parts.push(`CHANNELS="${escapeQuoted(r.channels)}"`);
  parts.push(`DEFAULT=${isDefault ? 'YES' : 'NO'}`);
  parts.push(`AUTOSELECT=${r.autoselect ? 'YES' : 'NO'}`);
  if (r.codec) parts.push(`CODECS="${escapeQuoted(r.codec)}"`);
  const uri = maskFlag ? maskCredentials(r.uri) : r.uri;
  parts.push(`URI="${escapeQuoted(uri)}"`);
  return `#EXT-X-MEDIA:${parts.join(',')}`;
}

function escapeQuoted(s) {
  return String(s).replace(/"/g, "'");
}

/**
 * Reescribe un #EXT-X-STREAM-INF:
 *   - añade AUDIO="<gid>" (solo si hay grupo de audio emitido)
 *   - reescribe CODECS con el códec de VÍDEO real del origen + códecs del grupo [R6]
 *   - NO toca RESOLUTION / BANDWIDTH / VIDEO-RANGE / STABLE-VARIANT-ID
 */
function rewriteStreamInf(attrs, gid, audioCodecs, counters) {
  const out = attrs.map((a) => ({ ...a }));
  const find = (n) => out.findIndex((x) => x.name.toUpperCase() === n);

  if (gid) {
    const i = find('AUDIO');
    if (i >= 0) out[i] = { name: 'AUDIO', value: gid, quoted: true };
    else out.push({ name: 'AUDIO', value: gid, quoted: true });
  }

  if (audioCodecs.length) {
    const i = find('CODECS');
    if (i >= 0) {
      const existing = out[i].value.split(',').map((s) => s.trim()).filter(Boolean);
      const video = existing.filter((c) => !AUDIO_CODEC_RE.test(c));
      if (video.length === 0) {
        // Sin códec de vídeo en el origen no se inventa uno [R6].
        inc(counters.codecsNoVideoCodec, 'total');
        out[i] = { name: 'CODECS', value: audioCodecs.join(','), quoted: true };
      } else {
        const merged = [...video];
        for (const ac of audioCodecs) if (!merged.includes(ac)) merged.push(ac);
        out[i] = { name: 'CODECS', value: merged.join(','), quoted: true };
        inc(counters.codecsRewritten, 'total');
      }
    } else {
      inc(counters.codecsAbsent, 'total');
      // No se crea CODECS desde cero: sin códec de vídeo medido sería inventar [R6].
    }
  }
  return serializeAttrList(out);
}

/* ==========================================================================================
 * 9. Núcleo: pase de análisis + emisión en streaming
 * ========================================================================================== */

async function run(opts) {
  const report = {
    tool: 'gen_demuxed_master.js',
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    input: { path: opts.in },
    options: {
      mode: null,
      caps: opts.caps || 'all',
      mask_credentials: !!opts['mask-credentials'],
      allow_muxed_passthrough: !!opts['allow-muxed-passthrough'],
      declared_source_override: opts['declared-source'] || null,
      report_only: !!opts['report-only'],
    },
    // Estado del audio: la pieza que decide si este master es realmente demuxed.
    audio: {
      source: null,               // 'operator_json' | 'in_source' | 'none'
      renditions: 0,
      stereo_fallback_present: false,
      demuxed: false,
      status: null,               // 'OK' | 'NO_COMPUTADO'
      reason: null,
    },
    video: {
      caps_removed: {},
      caps_by_effect: {},
      caps_not_limiting: 0,
      caps_limiting: 0,
      caps_undetermined: 0,
      candidates_not_removed: {},
      downscale_violations: [],
      source_resolution_missing: 0,
    },
    structure: {
      blocks: 0,
      stream_inf: 0,
      stream_inf_per_channel: {},
      iframe_stream_inf: 0,
      media_with_uri: 0,
      media_without_uri: 0,
      extinf: 0,
    },
    codecs: {
      video_codecs_observed: {},
      audio_codecs_used: {},
      codecs_rewritten: 0,
      codecs_absent: 0,
      codecs_no_video_codec: 0,
    },
    emission: { playlist_written: false, path: null, bytes_written: 0, lines_written: 0 },
    exit: { code: 0, reason: null },
  };

  const counters = {
    streamInf: new Map(),
    iframeInf: new Map(),
    mediaWithUri: new Map(),
    mediaWithoutUri: new Map(),
    capsFound: new Map(),
    candidatesFound: new Map(),
    codecsRewritten: new Map(),
    codecsAbsent: new Map(),
    codecsNoVideoCodec: new Map(),
  };

  // --- 1. ¿De dónde sale el audio? (anti-invención [R1])
  let operatorRenditions = null;
  if (opts.audio) {
    operatorRenditions = loadAudioRenditions(opts.audio, report); // puede lanzar exit 5
    report.audio.source = 'operator_json';
  }

  // --- 2. Abrir entrada
  if (!opts.in || opts.in === true) {
    throw Object.assign(new Error('falta --in <master.m3u8>'), { exitCode: EXIT.BAD_INPUT });
  }
  const stat = fs.statSync(opts.in);
  if (!stat.isFile() || stat.size === 0) {
    throw Object.assign(new Error(`entrada vacía o no es fichero: ${opts.in}`), { exitCode: EXIT.BAD_INPUT });
  }
  report.input.size_bytes = stat.size;

  // --- 3. Detectar modo ANTES del pase completo: catálogo si hay #EXTINF
  const hasExtinf = await detectExtinf(opts.in);
  const mode = hasExtinf ? 'catalogue' : 'master';
  report.options.mode = mode;

  // --- 4. Fuente de audio efectiva (se resuelve tras ver si el origen ya trae EXT-X-MEDIA)
  //        En modo master basta con mirar el primer bloque. En catálogo, cada bloque declara.
  const wantPlaylist = !opts['report-only'];
  const outStream = wantPlaylist && opts.out ? fs.createWriteStream(opts.out, { encoding: 'utf8' }) : null;

  let pendingMediaForMaster = null; // en modo master, se emiten una vez tras la cabecera
  let headerEmitted = false;
  let currentBlock = null;
  const blocks = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(opts.in, { encoding: 'utf8', highWaterMark: 1 << 20 }),
    crlfDelay: Infinity,
  });

  const write = (line) => {
    if (!outStream) return;
    outStream.write(line + '\n');
    report.emission.lines_written++;
    report.emission.bytes_written += Buffer.byteLength(line, 'utf8') + 1;
  };

  /**
   * Cierra un bloque: evalúa caps, variantes degradadas y decide la emisión.
   * Devuelve las líneas a emitir (o null si no se emite playlist).
   */
  const finalizeBlock = (block) => {
    report.structure.blocks++;
    const source = overrideSource(declaredSource(block), opts['declared-source']);

    if (!source) {
      // Bloque sin STREAM-INF: se preserva verbatim (metadata inerte [R8]).
      return { source: null, emitMedia: [], rewrite: new Map(), dropLines: new Set() };
    }
    if (!source.resolution) report.video.source_resolution_missing++;
    report.structure.stream_inf_per_channel[block.streamInfLines.length] =
      (report.structure.stream_inf_per_channel[block.streamInfLines.length] || 0) + 1;

    if (source.codecs) {
      for (const c of source.codecs.split(',').map((s) => s.trim())) {
        inc(report._videoCodecs || (report._videoCodecs = new Map()), c);
      }
    }

    // --- Fail-closed [R5]: ¿alguna variante por debajo de la fuente declarada?
    const gid = mode === 'master' ? (opts['audio-group-id'] || 'aud') : `aud_${channelKey(block)}`;
    const violations = [];
    for (const v of block.streamInfLines) {
      if (v.lineIndex === source.topLineIndex) continue;
      const belowRes = source.resolution && v.resolution && v.resolution.area < source.resolution.area;
      const belowBw = source.bandwidth !== null && source.bandwidth !== undefined
        && v.bandwidth !== null && v.bandwidth !== undefined && v.bandwidth < source.bandwidth;
      if (belowRes || belowBw) {
        violations.push({
          channel: channelKey(block),
          resolution: v.rawResolution || null,
          bandwidth: v.rawBandwidth || null,
          source_resolution: source.rawResolution || null,
          source_bandwidth: source.rawBandwidth || null,
          reason: belowRes ? 'RESOLUTION_BELOW_SOURCE' : 'BANDWIDTH_BELOW_SOURCE',
        });
      }
    }
    if (violations.length) {
      for (const v of violations.slice(0, 50)) report.video.downscale_violations.push(v);
    }

    // --- Caps: decidir borrado
    const dropLines = new Set();
    for (const c of block.capLines) {
      const lim = capLimits(c.rule, c.valueText, source);
      if (lim === true) report.video.caps_limiting++;
      else if (lim === false) report.video.caps_not_limiting++;
      else report.video.caps_undetermined++;

      const removeIt = (opts.caps === 'limiting') ? (lim !== false) : true; // 'all' por defecto
      if (removeIt) {
        dropLines.add(c.lineIndex);
        inc(report._capsRemoved || (report._capsRemoved = new Map()), `${c.rule.tag}:${c.rule.key}`);
        inc(report._capsEffect || (report._capsEffect = new Map()), c.rule.effect);
      }
    }
    for (const c of block.candidateLines) {
      inc(report._candidates || (report._candidates = new Map()), `${c.rule.tag}:${c.rule.key}`);
    }

    // --- Audio: renditions disponibles para ESTE bloque
    let renditions = null;
    let renditionsFromSource = false;
    if (operatorRenditions) renditions = operatorRenditions;
    else if (block.emittableMedia.length) { renditions = block.emittableMedia; renditionsFromSource = true; }

    const emitMedia = [];
    if (renditions && renditions.length) {
      // Si venían del propio master, sus líneas se reemplazan por las regeneradas (GROUP-ID nuevo).
      if (renditionsFromSource) for (const li of block.mediaLineIndexes) dropLines.add(li);
      const stereo = renditions.find((r) => String(r.channels) === '2');
      let anyDefault = false;
      for (const r of renditions) {
        const isDefault = !anyDefault && (r.default === true || (!renditions.some((x) => x.default) && renditions.indexOf(r) === 0));
        if (isDefault) anyDefault = true;
        emitMedia.push(buildMediaLine(gid, r, isDefault, !!opts['mask-credentials']));
        inc(report._audioCodecs || (report._audioCodecs = new Map()), r.codec || '(sin codec)');
      }
      if (stereo) report.audio.stereo_fallback_present = true;
      report.audio.demuxed = true;
    }

    const audioCodecs = renditions ? [...new Set(renditions.map((r) => r.codec).filter(Boolean))] : [];

    // --- Reescribir STREAM-INF
    const rewrite = new Map();
    for (const si of block.streamInfLines) {
      rewrite.set(si.lineIndex, rewriteStreamInf(si.attrs, renditions ? gid : null, audioCodecs, counters));
    }

    inc(counters.streamInf, 'done');
    return { source, emitMedia, rewrite, dropLines, gid, violations };
  };

  // Buffer del bloque en curso SOLO con las líneas necesarias para emitir en orden.
  let blockLines = []; // { line, lineIndex }

  const flushBlock = (block) => {
    const decision = finalizeBlock(block);
    if (!outStream) return decision;
    // Insertar EXT-X-MEDIA al inicio del bloque (tras su #EXTINF si lo hay) [R7]
    if (decision.emitMedia.length) {
      for (const m of decision.emitMedia) write(m);
    }
    for (const { line, lineIndex } of blockLines) {
      if (decision.dropLines.has(lineIndex)) continue;
      if (decision.rewrite.has(lineIndex)) {
        write(STREAM_INF + decision.rewrite.get(lineIndex));
        continue;
      }
      write(line);
    }
    return decision;
  };

  let lineIndex = 0;
  let headerBuffer = []; // líneas antes del primer bloque (modo catálogo) o todo (modo master)

  for await (const raw of rl) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const thisIndex = lineIndex++;

    if (mode === 'catalogue') {
      if (line.startsWith(EXTINF)) {
        if (currentBlock) {
          flushBlock(currentBlock);
          blockLines = [];
        }
        // Emitir cabecera una sola vez, antes del primer bloque
        if (!headerEmitted && outStream) {
          for (const h of headerBuffer) write(h);
          headerBuffer = [];
          headerEmitted = true;
        }
        currentBlock = newBlock(currentBlock ? currentBlock.index + 1 : 0, 'catalogue');
        currentBlock.extinf = line;
        blockLines.push({ line, lineIndex: thisIndex });
        analyseLine(line, thisIndex, currentBlock, counters);
        continue;
      }
      if (!currentBlock) { headerBuffer.push(line); continue; }
      analyseLine(line, thisIndex, currentBlock, counters);
      blockLines.push({ line, lineIndex: thisIndex });
      continue;
    }

    // ---- modo master: un único bloque
    if (!currentBlock) currentBlock = newBlock(0, 'master');
    analyseLine(line, thisIndex, currentBlock, counters);
    blockLines.push({ line, lineIndex: thisIndex });
  }

  if (currentBlock) { const d = flushBlock(currentBlock); blocks.push(d); }
  if (outStream) {
    if (mode === 'catalogue' && !headerEmitted) { for (const h of headerBuffer) write(h); }
    outStream.end();
    await new Promise((res, rej) => outStream.on('finish', res).on('error', rej));
    report.emission.playlist_written = true;
    report.emission.path = opts.out;
  }

  /* ---------------- cierre del reporte ---------------- */

  report.structure.stream_inf = counters.streamInf.get('done') || 0;
  report.structure.iframe_stream_inf = counters.iframeInf.get('total') || 0;
  report.structure.media_with_uri = counters.mediaWithUri.get('total') || 0;
  report.structure.media_without_uri = counters.mediaWithoutUri.get('total') || 0;

  report.video.caps_removed = sortedObj(report._capsRemoved || new Map());
  report.video.caps_by_effect = sortedObj(report._capsEffect || new Map());
  report.video.candidates_not_removed = sortedObj(report._candidates || new Map());
  report.codecs.video_codecs_observed = sortedObj(report._videoCodecs || new Map());
  report.codecs.audio_codecs_used = sortedObj(report._audioCodecs || new Map());
  report.codecs.codecs_rewritten = counters.codecsRewritten.get('total') || 0;
  report.codecs.codecs_absent = counters.codecsAbsent.get('total') || 0;
  report.codecs.codecs_no_video_codec = counters.codecsNoVideoCodec.get('total') || 0;
  delete report._capsRemoved; delete report._capsEffect; delete report._candidates;
  delete report._videoCodecs; delete report._audioCodecs;

  // --- Veredicto del audio [R1]
  if (report.audio.demuxed) {
    report.audio.status = 'OK';
    report.audio.reason = report.audio.source === 'operator_json'
      ? 'renditions aportadas por el operador con evidencia válida'
      : 'el master de entrada ya declaraba #EXT-X-MEDIA TYPE=AUDIO con URI=';
  } else {
    report.audio.status = 'NO_COMPUTADO';
    report.audio.renditions = 0;
    report.audio.reason =
      '#EXT-X-MEDIA TYPE=AUDIO con URI= = 0 en la entrada y no se aportó --audio; ' +
      'el origen es MUXED. No se inventa ninguna URI (anti-invención). ' +
      'Para audio demuxed real hay que aportar --audio con renditions medidas.';
  }

  // --- Veredicto de vídeo [R5] (gana sobre el de audio: es la ley dura)
  if (report.video.downscale_violations.length) {
    report.exit.code = EXIT.VIDEO_DOWNSCALE_VIOLATION;
    report.exit.reason = 'variante(s) por debajo de la fuente declarada';
  } else if (!report.audio.demuxed && !opts['allow-muxed-passthrough']) {
    report.exit.code = EXIT.AUDIO_NO_COMPUTADO;
    report.exit.reason = 'audio no computado y sin --allow-muxed-passthrough';
  } else {
    report.exit.code = EXIT.OK;
    report.exit.reason = report.audio.demuxed
      ? 'demuxed emitido'
      : 'muxed preservado con --allow-muxed-passthrough (declarado, no simulado)';
  }

  return report;
}

/** ¿El fichero tiene al menos un #EXTINF? Se lee solo hasta encontrarlo. */
async function detectExtinf(file) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 }),
    crlfDelay: Infinity,
  });
  for await (const raw of rl) {
    if (raw.startsWith('#EXTINF')) { rl.close(); return true; }
    // En un master HLS puro, el primer tag relevante llega muy pronto; no hace falta más.
    if (raw.startsWith('#EXT-X-STREAM-INF')) { rl.close(); return false; }
  }
  return false;
}

/* ==========================================================================================
 * 10. main
 * ========================================================================================== */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const quiet = !!opts.quiet;

  if (opts.help || opts.h) {
    process.stdout.write(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*?/, '') + '\n');
    return 0;
  }

  if (!opts.in) {
    process.stderr.write('ERROR: falta --in <master.m3u8>. Usa --help.\n');
    return EXIT.BAD_INPUT;
  }
  if (!opts.out && !opts['report-only']) {
    process.stderr.write('ERROR: sin --out ni --report-only no hay nada que hacer.\n');
    return EXIT.BAD_INPUT;
  }

  let report;
  try {
    report = await run(opts);
  } catch (e) {
    const code = e.exitCode || EXIT.BAD_INPUT;
    const errReport = {
      tool: 'gen_demuxed_master.js',
      generated_at: new Date().toISOString(),
      input: { path: opts.in || null },
      exit: { code, reason: e.message },
      rejected_audio_renditions: e.rejected || undefined,
    };
    if (opts.report) fs.writeFileSync(opts.report, JSON.stringify(errReport, null, 2), 'utf8');
    if (!quiet) process.stderr.write(`ERROR [exit ${code}]: ${e.message}\n`);
    return code;
  }

  if (opts.report) {
    fs.writeFileSync(opts.report, JSON.stringify(report, null, 2), 'utf8');
  }

  if (!quiet) {
    const r = report;
    process.stderr.write(
      `modo=${r.options.mode}  bloques=${r.structure.blocks}  STREAM-INF=${r.structure.stream_inf}\n` +
      `audio: ${r.audio.status} (${r.audio.source || 'sin fuente'}, ${r.audio.renditions} rendition(s))\n` +
      `caps de vídeo quitados: ${Object.values(r.video.caps_removed).reduce((a, b) => a + b, 0)}` +
      `  limitaban=${r.video.caps_limiting} no_limitaban=${r.video.caps_not_limiting} indeterminado=${r.video.caps_undetermined}\n` +
      `violaciones de downscale: ${r.video.downscale_violations.length}\n` +
      `exit=${r.exit.code} ${r.exit.reason}\n`
    );
  }
  return report.exit.code;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((e) => {
    process.stderr.write(`FATAL: ${e && e.stack ? e.stack : e}\n`);
    process.exit(EXIT.BAD_INPUT);
  });
}

module.exports = { parseAttrList, serializeAttrList, parseResolution, parseBitrate, maskCredentials, capLimits, VIDEO_CAP_RULES, EXIT };
