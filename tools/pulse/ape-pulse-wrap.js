#!/usr/bin/env node
/**
 * ape-pulse-wrap.js — conecta CUALQUIER lista M3U8 con /pulse, idempotente,
 * isomórfica y polimórfica.
 *
 * QUÉ HACE
 *   Recorre la lista línea a línea (streaming: sirve para 600 MB) y sustituye
 *   CADA URL de canal por una URL de /pulse construida con ApeUrlBuilder:
 *
 *     #EXTINF:-1 …,Canal            #EXTINF:-1 …,Canal
 *     #EXTVLCOPT:…            →     #EXTVLCOPT:…          (intactas)
 *     http://prov/ch5.m3u8          https://…/pulse/7.m3u8?u=…&d=…&p=P3&fp=…
 *
 *   El player no sabe que hay un VPS en medio: pide la URL, /pulse registra el
 *   pulso y responde 302 (vídeo directo al proveedor) o el cartucho (200).
 *
 * [EXTSHIMOTT] Además, por canal, emite UNA línea `#EXTSHIMOTT:{json}` (contrato
 *   ape.extshimott.v1) como última línea de tag, inmediatamente ANTES de la URI.
 *   Es aditiva: no sustituye ninguna capa existente (EXTHTTP / EXTVLCOPT /
 *   KODIPROP / EXT-X-APE-*) y no toca CODECS=/RESOLUTION= del STREAM-INF. Un
 *   parser RFC 8216 ignora el tag; lo lee el shim de la APK. Si la lista YA trae
 *   el tag en el bloque, NO se añade otro (una ocurrencia por canal).
 *
 * GARANTÍAS (las tres que pidió el operador)
 *   IDEMPOTENTE   misma entrada + misma versión/política ⇒ salida byte a byte
 *                 idéntica. El seed del builder NO depende del reloj. Si la lista
 *                 ya viene envuelta (/pulse/ o /url2/) NO se envuelve dos veces.
 *   ISOMÓRFICA    la estructura se conserva 1:1: mismo número de bloques #EXTINF,
 *                 mismas directivas, una sola URL por canal. Sólo cambia la URL.
 *   POLIMÓRFICA   el perfil se elige por CLASE DE CANAL (8K→P0, 4K→P1, FHD→P3,
 *                 HD→P4, SD→P5, premium +1) y el endpoint admite varios modos
 *                 (cartridge/redirect) sin romper el contrato de la URL.
 *
 * USO
 *   node ape-pulse-wrap.js --in <src[.gz]> --out <dst.m3u8> [--mode cartridge|redirect]
 *        [--base https://iptv-ape.duckdns.org/pulse] [--policy 1] [--state <json>] [--quiet]
 *
 * Salida: exit 0 ok · 1 error · 3 saltado (sin cambios, ya al día)
 * Imprime un JSON de una línea con los contadores y el sha256 de la salida.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { StringDecoder } = require('string_decoder');
const { ApeUrlBuilder } = require(process.env.APE_URL_BUILDER || '/opt/ape-pulse/ape-url-builder.js');
// [HÍBRIDO APE CRYSTAL v9.4] Contrato + módulo del propietario. El JSON es la
// fuente de rutas/cartuchos; `ape-crystal-hybrid-owner.cjs` aplica el override
// del propietario (upscaling de TODAS las resoluciones, no gate por verificación).
const HYBRID_CONFIG = JSON.parse(fs.readFileSync(
    process.env.APE_HYBRID_CONFIG || path.join(__dirname, 'APE_FUSION_HIBRIDO_OPTIMO_12P.json'), 'utf8'));
const { seleccionarHibridoOwner } = require('./ape-crystal-hybrid-owner.cjs');

const POLICY_VERSION = '1';
// 1.5.0 -> 1.6.0: emite #EXTSHIMOTT por canal (cambio de comportamiento de la salida).
// NOTA DE DESPLIEGUE: ape-pulse-sync.sh cachea por SU PROPIA constante WRAPPER_VERSION
// + tamaño/mtime del origen; las dos constantes van EN PAR (hoy 1.7.0 y 1.7.0).
// Si esta sube y la del .sh no, las listas ya envueltas no se re-envuelven (el .state
// guarda wrapper_version y da need=0) y no reciben los tags nuevos: al subir esta,
// subir también la del .sh, o correr `ape-pulse-sync.sh --force` una vez.
const WRAPPER_VERSION = '1.7.0';
const PULSE_BASE_DEFAULT = 'https://iptv-ape.duckdns.org/pulse';
const ALREADY = /\/(pulse|url2)\//i;
// [HÍBRIDO APE CRYSTAL] default ON. Rollback sin editar código:
//   APE_HYBRID_PULSE=0 node tools/pulse/ape-pulse-wrap.js --in ... --out ...
const APE_HYBRID_PULSE = process.env.APE_HYBRID_PULSE !== '0';

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const name = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { a[name] = true; continue; }
    a[name] = next; i++;
  }
  return a;
}

const args = parseArgs(process.argv);
const inPath = args.in;
const outPath = args.out;
if (!inPath || !outPath) { console.error('uso: --in <src> --out <dst>'); process.exit(2); }
const mode = (args.mode === 'redirect') ? 'redirect' : 'cartridge';
const pulseBase = String(args.base || PULSE_BASE_DEFAULT).replace(/\/+$/, '');
const policy = String(args.policy || POLICY_VERSION);
const statePath = args.state || '';
/* [RFC 8216 §4.3.4.2] `#EXT-X-STREAM-INF` sólo puede ir seguido de SU URI.
 * Medido: hoy el envoltorio mete entre los dos las 9 declaraciones del
 * propietario + el tag #EXTSHIMOTT (0 de 2 pares adyacentes en la fixture de
 * prueba). Con esta bandera las etiquetas que AÑADE este fichero se emiten
 * ANTES del STREAM-INF y el par queda adyacente.
 * Por defecto APAGADA porque el contrato EXTSHIMOTT ver:1 exige que el tag sea
 * la ÚLTIMA línea antes de la URI (tools/quality/validate_extshimott.js →
 * E_TAG_NOT_LAST): con la bandera encendida ese validador devuelve ERROR. Son
 * dos reglas incompatibles en un bloque que trae STREAM-INF: se elige una.
 */
const tagBeforeStreamInf = args['tag-before-stream-inf'] === true;
// [LISTA] Nombre de la lista que se envuelve: viaja en l= para que el pulso diga
// QUE LISTA se esta reproduciendo (antes solo habia canal, no lista).
const listName = path.basename(inPath).replace(/\.gz$/i, '').replace(/\.(m3u8|m3u)$/i, '');

function profileForChannel(name, group) {
  const s = (String(name || '') + ' ' + String(group || '')).toUpperCase();
  const premium = /(DAZN|ESPN|SKY|HBO|MAX|PPV|UFC|F1|CHAMPIONS|NBA|NETFLIX|DISNEY|PREMIUM|EVENTO)/.test(s);
  let p = 'P3';
  if (/\b8K\b|4320/.test(s)) p = 'P0';
  else if (/\b4K\b|UHD|2160/.test(s)) p = 'P1';
  else if (/FHD|1080|FULL\s*HD/.test(s)) p = 'P3';
  else if (/\bHD\b|720/.test(s)) p = 'P4';
  else if (/\bSD\b|480|360|240/.test(s)) p = 'P5';
  if (premium) {
    const order = ['P5', 'P4', 'P3', 'P2', 'P1', 'P0'];
    const i = order.indexOf(p);
    if (i >= 0 && i < order.length - 1) p = order[i + 1];
  }
  return p;
}

/* Perfil EXPLICITO declarado en el bloque del canal.
 *
 * El informe de arquitectura (pag. 9 y 12) senala que este wrapper RECALCULABA el
 * perfil por heuristicas de nombre/grupo y perdia el que la lista ya traia. Eso
 * rompe el recorrido "APK solicita -> JIT filtra": el canal declara P3 y el
 * wrapper pide P1 (o al reves) y la etiqueta deja de corresponder al video.
 *
 * Se reconocen las formas en que el perfil viaja de verdad en estas listas:
 *   #EXT-X-APE-CRYSTAL-UHD:PROFILE=P3;VPP_INTENSITY=55;SCOPE=DISPLAY;PIXELS=0
 *   #EXT-X-APE-PROFILE:P3
 *   #EXT-X-APE-LAB-PROFILE:P3
 *   ... y en el propio EXTINF como atributo ape-profile="P3" / profile="P3"
 *
 * Devuelve null si no hay declaracion explicita: en ese caso SI se usa la
 * heuristica, que es el comportamiento correcto cuando la lista no declara nada. */
const PROFILE_TOKEN = /\bP([0-5])(?:\.5)?\b/;

function normProfile(tok) {
  if (!tok) return null;
  const m = String(tok).toUpperCase().match(/\bP([0-5](\.5)?)\b/);
  return m ? ('P' + m[1]) : null;
}

function profileFromDirective(line) {
  // solo directivas APE que transportan perfil
  if (!/^#EXT-X-APE-(CRYSTAL-UHD|PROFILE|LAB-PROFILE)\b/i.test(line)) return null;
  const m = line.match(/PROFILE\s*=\s*\"?P([0-5](?:\.5)?)\"?/i);
  if (m) return 'P' + m[1];
  const t = line.match(PROFILE_TOKEN);
  return t ? normProfile(t[0]) : null;
}

function profileFromExtinf(line) {
  const m = line.match(/(?:ape-profile|profile)\s*=\s*\"?P([0-5](?:\.5)?)\"?/i);
  return m ? ('P' + m[1]) : null;
}

function attr(line, key) {
  const m = line.match(new RegExp(key + '="([^"]*)"'));
  return m ? m[1] : '';
}

function channelName(line) {
  const m = line.match(/,(.*)$/);
  if (!m) return '';
  return String(m[1]).trim();
}

/* ══════════════════════════════════════════════════════════════════════════
 * [EXTSHIMOTT] Payload del sidecar por canal (contrato ape.extshimott.v1).
 *
 * QUÉ SE EMITE Y DE QUÉ DATO REAL SALE:
 *   ver, id, tgt  identidad + routing. `id` = tvg-id (el contrato ancla ahí la
 *                 identidad y el validador compara contra el tvg-id del EXTINF);
 *                 si no existe, tvg-chno; si tampoco, el ordinal del canal (`chN`),
 *                 que es la MISMA identidad que el envoltorio usa para /pulse.
 *                 `tgt` = "ott" siempre (el shim de la APK —ottshim— es el
 *                 consumidor lado-player del sidecar) + "vlc" si el bloque trae
 *                 #EXTVLCOPT: + "kod" si trae #KODIPROP:. Esas dos capas son
 *                 evidencia real de que VLC/Kodi leen el canal; no se declaran
 *                 por gusto.
 *   v.*           SOLO desde `#EXT-X-APE-STREAM-TRUTH` (la línea de verdad del
 *                 generador): familia de codec y fps crudo. `w`/`h` SOLO si esa
 *                 línea certifica fuente no-fake (`src` sin "fake"): escribir
 *                 3840x2160 sobre un upscale es la mentira que prohíben el
 *                 contrato y la Ley Anti-Degradación. NUNCA `v.hdr` desde `pq=1`:
 *                 el generador emite PQ incondicional (decisión 2026-06-16), así
 *                 que `pq=1` NO es evidencia de HDR.
 *   hdr.ua/rf     del `#EXTHTTP:` del PROPIO canal, verbatim: es exactamente lo
 *                 que el shim necesita para pedir el upstream con el mismo
 *                 UA/Referer. Si el valor viola el contrato (%20, CR/LF, Referer
 *                 al VPS propio, longitud fuera de rango) se OMITE y se cuenta;
 *                 no se reescribe ni se completa.
 *   NO se emite   a.*, cad, dev, ott, vlc, kod, flt. Este envoltorio no los
 *                 conoce. `flt` en particular NO se copia de la cadena de filtros
 *                 de la lista: sería una orden de ejecución que nadie validó aquí.
 *
 * REGLA DURA: campo desconocido ⇒ se omite. No hay centinelas (null, -1, "unknown").
 * ══════════════════════════════════════════════════════════════════════════ */
const SHIMOTT_PREFIX = '#EXTSHIMOTT:';
const SHIMOTT_VER = 1;
const SHIMOTT_MAX_LINE = 4096;   // techo duro del contrato: línea completa, sin LF
const SHIMOTT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const SHIMOTT_CODEC = {
  hevc: 'hevc', h265: 'hevc', 'h.265': 'hevc', hvc1: 'hevc', hev1: 'hevc',
  av1: 'av1', av01: 'av1',
  vvc: 'vvc', h266: 'vvc', 'h.266': 'vvc',
  h264: 'h264', 'h.264': 'h264', avc: 'h264', avc1: 'h264',
  vp9: 'vp9', vp09: 'vp9',
};

/** `k=v,k=v` de una línea del generador -> objeto (primera clave gana). */
function truthKv(line) {
  const body = line.slice(line.indexOf(':') + 1);
  const out = {};
  for (const part of body.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    if (!k || k in out) continue;
    out[k] = part.slice(i + 1).trim();
  }
  return out;
}

/** Busca una cabecera por nombre (case-insensitive) en el JSON de #EXTHTTP. */
function headerOf(obj, names) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of Object.keys(obj)) {
    if (names.indexOf(k.toLowerCase()) >= 0) {
      const v = obj[k];
      return typeof v === 'string' ? v : '';
    }
  }
  return '';
}

/** Valor admisible según el contrato; '' = no se emite (y se cuenta el motivo). */
function shimottHeader(kind, value) {
  const s = String(value == null ? '' : value);
  if (kind === 'ua') {
    if (!s || s.length > 512) return '';
    if (/%20/.test(s) || /[\r\n]/.test(s)) {
      counters.shimottUaDropped = (counters.shimottUaDropped || 0) + 1;
      return '';
    }
    return s;
  }
  if (s.length < 8 || s.length > 512) return '';
  if (!/^https?:\/\/[^\s]+$/.test(s)) return '';
  if (/iptv-ape|duckdns|178\.156|hetzner/i.test(s)) {
    counters.shimottRfDropped = (counters.shimottRfDropped || 0) + 1;
    return '';
  }
  return s;
}

function shimottId() {
  // Precedencia: tvg-id (ancla del contrato) -> tvg-chno -> saneado -> ordinal.
  const exact = [cur.tvgId, cur.tvgChno];
  for (const c of exact) {
    const s = String(c || '').trim();
    if (s && SHIMOTT_ID_RE.test(s)) return s;
  }
  const raw = String(cur.tvgId || cur.tvgChno || '').trim();
  let s = raw.replace(/[^A-Za-z0-9_.:-]/g, '_').replace(/^[^A-Za-z0-9]+/, '');
  if (s.length > 64) s = s.slice(0, 64);
  if (s && SHIMOTT_ID_RE.test(s)) {
    counters.shimottIdSanitized = (counters.shimottIdSanitized || 0) + 1;
    return s;
  }
  counters.shimottIdFallback = (counters.shimottIdFallback || 0) + 1;
  return 'ch' + channelOrd;
}

function shimottTargets() {
  const t = ['ott'];
  if (cur.hasVlcOpt) t.push('vlc');
  if (cur.hasKodiProp) t.push('kod');
  return t.join('|');
}

function shimottPayload() {
  const payload = { ver: SHIMOTT_VER, id: shimottId() };

  if (cur.truth) {
    const v = {};
    const codec = SHIMOTT_CODEC[String(cur.truth.family || '').toLowerCase()];
    if (codec) v.c = codec;
    const fps = Number(cur.truth.rawfps || cur.truth.fps);
    if (Number.isFinite(fps) && fps > 0 && fps <= 240) v.f = fps;
    if (cur.truth.src && !/fake/i.test(cur.truth.src)) {
      const w = parseInt(cur.truth.w, 10);
      const h = parseInt(cur.truth.h, 10);
      if (Number.isInteger(w) && w >= 2 && w <= 7680) v.w = w;
      if (Number.isInteger(h) && h >= 2 && h <= 4320) v.h = h;
    }
    if (Object.keys(v).length) payload.v = v;
  }

  const ua = shimottHeader('ua', cur.exthttp ? headerOf(cur.exthttp, ['user-agent']) : '');
  const rf = shimottHeader('rf', cur.exthttp ? headerOf(cur.exthttp, ['referer', 'referrer']) : '');
  if (ua || rf) {
    const hdr = {};
    if (ua) hdr.ua = ua;
    if (rf) hdr.rf = rf;
    payload.hdr = hdr;
  }

  payload.tgt = shimottTargets();
  return payload;
}

const counters = {
  lines: 0, extinf: 0, urls: 0, wrapped: 0, already: 0, skipped_no_inf: 0,
  profiles: {}, errors: 0,
};

const sha = crypto.createHash('sha256');
let seq = 0;
let channelOrd = 0;                 // ordinal de bloque #EXTINF (identidad de ultimo recurso)
let curHasShimott = false;          // el bloque ya trae #EXTSHIMOTT (no se duplica)
let cur = { name: '', group: '', id: '', logo: '' };

const tmp = outPath + '.tmp';
const out = fs.createWriteStream(tmp, { flags: 'w' });

function raw(line) {
  sha.update(line, 'utf8');
  out.write(line);
}

/* [RFC 8216 §4.3.4.2] Con `--tag-before-stream-inf` la línea `#EXT-X-STREAM-INF`
 * se RETIENE hasta ver la siguiente, para poder soltar delante las etiquetas
 * que añade este envoltorio (`insertTag`) en vez de en medio del par
 * STREAM-INF→URI. Con la bandera apagada `held` y `preUri` nunca se llenan:
 * cada línea pasa por `raw()` en el mismo orden que antes (salida idéntica).
 */
let held = null;      // { text, nl } — línea STREAM-INF retenida
let preUri = [];      // etiquetas a emitir ANTES del STREAM-INF retenido
function flushHeld() {
  if (!held) return;
  const h = held; held = null;
  raw(h.text);
  if (h.nl) raw('\n');
}
function write(line) {
  if (!tagBeforeStreamInf) { raw(line); return; }
  if (held && line === '\n') { held.nl = true; return; }   // el salto del STREAM-INF se aplica al soltarlo
  if (preUri.length) { const b = preUri; preUri = []; for (const l of b) raw(l); }
  if (line.startsWith('#EXT-X-STREAM-INF:')) { flushHeld(); held = { text: line, nl: false }; return; }
  flushHeld();
  raw(line);
}
/* Línea que AÑADE el envoltorio (declaraciones del propietario, #EXTSHIMOTT). */
function insertTag(line) {
  if (tagBeforeStreamInf && held) { preUri.push(line); return; }
  raw(line);
}
/* Fin de fichero: no dejar nada retenido (si no, se perdería una línea). */
function flushTail() {
  if (preUri.length) { const b = preUri; preUri = []; for (const l of b) raw(l); }
  flushHeld();
}

/**
 * [NORMALIZACIÓN 2026-11-05] Listas CDN: las URLs vienen autoreferentes
 *   https://iptv-ape.duckdns.org/cdn/<proveedor>/<ruta>
 * y el proveedor responde 513/461 a la ruta SIN extensión (y 200 a `.m3u8`).
 * Se normaliza ANTES de envolver para que el `u=` del pulso apunte directo al
 * proveedor y con extensión. El pulso también normaliza en tiempo de petición
 * (defensa en profundidad), pero así la lista nace limpia.
 */
function normalizeUpstream(u) {
  try {
    const m = /^https?:\/\/iptv-ape\.duckdns\.org\/cdn\/([^/]+)\/(.*)$/i.exec(u);
    if (!m) return u;
    let p = m[2].replace(/^\/+/, '');
    if (!/\.[A-Za-z0-9]{1,5}$/.test(p)) p += '.m3u8';
    counters.normalized = (counters.normalized || 0) + 1;
    return 'http://' + m[1] + '/' + p;
  } catch (e) {
    return u;
  }
}

/**
 * [ORDEN DEL OPERADOR 2026-11-20 · "preserve el d= original byte a byte"]
 * El `d=` que el canal YA trae NO se reescribe.
 *
 * MEDIDO antes del arreglo, sobre APE_LISTA_1795151699916_DIRECTA_CABLEADA:
 *   origen    d={"t":"generic","s":"unknown","r":2048,"w":1920,"h":1080,"f":30,"hdr":"sdr","p":"P3"}
 *   entregado d={"t":"generic","s":"unknown","r":2048,"w":1920,"h":1080,"f":60}
 * se perdian `hdr` y `p` y cambiaba f 30->60 en los 11.222 canales (321.517 B
 * de diferencia entre el fichero del worker y el servido). Cambiar un valor que
 * el generador ya escribio no es un fix, es una mutacion silenciosa.
 *
 * Ahora: si la URL trae un `d=` que decodifica a un objeto, se conserva VERBATIM.
 * Solo se reconstruye cuando falta o viene corrupto, que es el caso para el que
 * se escribio rebuildDeviceData (d= constante e identico en todos los canales,
 * m3u8-typed-arrays-ultimate.js:13213).
 */
function deviceTokenUsable(url) {
  const m = url.match(/[?&]d=([^&]*)/);
  if (!m || !m[1]) { return false; }
  try {
    let s = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) { s += '='; }
    const o = JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
    return o !== null && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length > 0;
  } catch (e) { return false; }
}

/**
 * [FIX 2026-11-15] Reescribe el `d=` de una URL de /pulse con la resolucion REAL del canal
 * — SOLO cuando el `d=` falta o no decodifica (ver deviceTokenUsable arriba).
 *
 * El `d=` lo ponia el generador como constante (m3u8-typed-arrays-ultimate.js:13213) y
 * equivale a {t:generic,s:unknown,r:2048,w:1920,h:1080,f:30} — el perfil 'generic' de
 * ape-url-builder.js:77. Todos los canales llevaban lo mismo, un 4K real incluido.
 *
 * El VPS no sabe que televisor tienes al generar la lista, pero SI sabe que resolucion
 * tiene CADA canal: es el `#EXT-X-APE-STREAM-TRUTH` que el generador ya mide. Eso es lo
 * que va en el d=.
 *
 * NO se toca el `hdr`: el fichero documenta mas arriba que no se declara HDR desde pq=1.
 * Solo w/h/f, que es observacion directa del STREAM-TRUTH.
 *
 * Se aplica ANTES del early-return de ALREADY: las listas cableadas ya traen URLs
 * /pulse/ y sin esto el fix no llegaba nunca (medido: wrapped=0, d_rebuilt=None).
 */
function rebuildDeviceData(url) {
  if (deviceTokenUsable(url)) { counters.dKept = (counters.dKept || 0) + 1; return url; }
  if (!cur || !cur.truth) { return url; }
  const w = parseInt(cur.truth.w, 10);
  const h = parseInt(cur.truth.h, 10);
  const fps = Number(cur.truth.rawfps || cur.truth.fps);
  if (!Number.isInteger(w) && !Number.isInteger(h) && !Number.isFinite(fps)) { return url; }
  const dd = { t: 'generic', s: 'unknown', r: 2048 };
  if (Number.isInteger(w) && w >= 2 && w <= 7680) dd.w = w;
  if (Number.isInteger(h) && h >= 2 && h <= 4320) dd.h = h;
  if (Number.isFinite(fps) && fps > 0 && fps <= 240) dd.f = Math.round(fps);
  let b64;
  try { b64 = Buffer.from(JSON.stringify(dd), 'utf8').toString('base64').replace(/=+$/, ''); }
  catch (e) { counters.dRebuiltError = (counters.dRebuiltError || 0) + 1; return url; }
  if (!/[?&]d=/.test(url)) { counters.dRebuiltMiss = (counters.dRebuiltMiss || 0) + 1; return url; }
  const out = url.replace(/([?&])d=[^&]*/, '$1d=' + b64);
  if (out !== url) { counters.dRebuilt = (counters.dRebuilt || 0) + 1; }
  return out;
}

/**
 * [HÍBRIDO APE CRYSTAL · 2026-11-24]
 * `p=` de /pulse = perfil del CARTUCHO, no el perfil de metadata del canal.
 * Se integra el contrato `ape.crystal.hybrid/1` (JSON + módulo), pero con el
 * override del propietario: TODAS las resoluciones <8K se upscalan por video
 * filters -> max (P1.5, p=P1). 8K se conserva en P0 (no se degrada).
 * El `d=` existente NO se toca y las URLs firmadas (fp/sig/token) NO se reescriben.
 */
function hybridDecision() {
    const t = (cur && cur.truth) || {};
    const w = parseInt(t.w, 10);
    const h = parseInt(t.h, 10);
    const src = String(t.src || '').toLowerCase();
    const verified = src === 'real' && Number.isInteger(w) && w > 0 && Number.isInteger(h) && h > 0;
    const request4K = process.env.APE_HYBRID_REQUEST_4K !== '0';
    const upscaleAll = process.env.APE_HYBRID_UPSCALE_ALL !== '0';
    return seleccionarHibridoOwner(HYBRID_CONFIG, {
        fuenteVerificada: verified, ancho: w, alto: h,
        solicitar4K: request4K, upscaleAll,
    });
}

function hybridTag(decision) {
    const route = decision.ruta;
    const cart = decision.cartucho || 'NATIVE';
    const p = (decision.parametrosPulse || {}).p || 'NONE';
    const src = decision.fuenteMedidaPx
        ? decision.fuenteMedidaPx[0] + 'x' + decision.fuenteMedidaPx[1] : 'unknown';
    const target = decision.lienzoObjetivoPx
        ? decision.lienzoObjetivoPx[0] + 'x' + decision.lienzoObjetivoPx[1] : 'native';
    const mode = (route === 'max8k' || route === 'native') ? 'NATIVE' : 'SIMULATED';
    return '#EXT-X-APE-HYBRID-PULSE:ROUTE=' + route +
        ';CARTRIDGE=' + cart + ';P=' + p + ';SOURCE_PX=' + src +
        ';TARGET=' + target + ';MODE=' + mode + ';EXECUTED=0' +
        ';POLICY=ape.crystal.hybrid/1;OWNER=ALL_RESOLUTIONS_UPSCALE';
}

function isSignedPulse(url) {
    // generator_contract.do_not_rewrite_existing_signed_urls
    return /\/pulse\//i.test(String(url || '')) &&
        /[?&](fp|sig|signature|token)=/i.test(String(url || ''));
}

function transformUrl(url) {
    // La URL firmada se devuelve BYTE A BYTE antes de normalizar/rebuild/`p`.
    if (isSignedPulse(url)) {
        counters.hybridSkippedSigned = (counters.hybridSkippedSigned || 0) + 1;
        counters.already++;
        return url;
    }
    url = normalizeUpstream(url);
    url = rebuildDeviceData(url);
    const decision = hybridDecision();
    if (ALREADY.test(url)) {
        if (!APE_HYBRID_PULSE) { counters.already++; return url; }
        if (isSignedPulse(url)) {
            counters.hybridSkippedSigned = (counters.hybridSkippedSigned || 0) + 1;
            counters.already++;
            return url;
        }
        const p = (decision.parametrosPulse || {}).p || '';
        const upgraded = p ? ApeUrlBuilder.setPulseProfile(url, p) : url;
        if (upgraded !== url) counters.hybridUpgraded = (counters.hybridUpgraded || 0) + 1;
        counters.already++;
        return upgraded;
    }
    if (!/^https?:\/\//i.test(url)) return url;
    seq++;
    // EXPLICITO manda; heuristica solo cuando la lista no declara perfil.
    const explicit = cur.profile || null;
    const heuristic = profileForChannel(cur.name, cur.group);
    const prof = explicit || heuristic;
    counters.profiles[prof] = (counters.profiles[prof] || 0) + 1;
    if (explicit) {
        counters.profileExplicit = (counters.profileExplicit || 0) + 1;
        if (explicit !== heuristic) {
            counters.profileOverrides = (counters.profileOverrides || 0) + 1;
            if (!counters.profileOverrideSample || counters.profileOverrideSample.length < 8) {
                counters.profileOverrideSample = counters.profileOverrideSample || [];
                counters.profileOverrideSample.push(cur.name + ': heuristica=' + heuristic + ' declarado=' + explicit);
            }
        }
    } else {
        counters.profileHeuristic = (counters.profileHeuristic || 0) + 1;
    }
    let idNum = parseInt(String(cur.id || '').replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(idNum) || idNum <= 0) idNum = seq;
    let built;
    try {
        const pulseP = APE_HYBRID_PULSE ? ((decision.parametrosPulse || {}).p || '') : '';
        built = ApeUrlBuilder.build({
            url,
            channelName: cur.name || ('Canal ' + idNum),
            channelId: idNum,
            logo: cur.logo || '',
            deviceType: 'generic',
            // [HÍBRIDO] p del cartucho: P1 (max, <8K) o P0 (8K). El perfil de
            // metadata `prof` se conserva en contadores/bloque.
            profile: pulseP || prof,
            omitProfile: !pulseP,
            forceProfile: true,
            endpoint: pulseBase + '/{id}.m3u8',
        }).url;
    } catch (e) {
        counters.errors++;
        return url;
    }
    counters.wrapped++;
    counters.hybrid = (counters.hybrid || 0) + 1;
    counters.hybridRoutes = counters.hybridRoutes || {};
    counters.hybridRoutes[decision.ruta] = (counters.hybridRoutes[decision.ruta] || 0) + 1;
    // [MODO] Se pide cartridge, pero /pulse lo sirve SOLO a clientes capaces
    // (VLC/Kodi/ExoPlayer/OTT/TiviMate/Smarters). Al resto le da 302 a la URL del
    // proveedor: medido 2026-11-05 en Fire TV (UA Xtream-Codes/Dalvik), recibe el
    // master y aborta con "Loaded playlist has unexpected type.".
    return built + '&m=cartridge&l=' + encodeURIComponent(listName);
}

/**
 * [OWNER OVERRIDE 2026-11-05] Bloque de DECLARACIÓN de mejora extrema.
 *
 * Autorizado expresamente por el propietario ("el santo grial de una excepcional
 * imagen"). Se emite como METADATA del manifiesto, una vez por canal, para que
 * TODOS los reproductores (VLC, Kodi, OTT, TiviMate, Exo, Fire TV) la vean en la
 * lista — no sólo el cartucho. Son declaraciones: NO cambian STREAM-INF,
 * CODECS ni RESOLUTION, y NO declaran SUPPLEMENTAL-CODECS (eso sí rompería el
 * decoder). Una sola etiqueta dice el estado honesto: DECLARED.
 */
const OWNER_DECLARATIONS = [
  '#EXT-X-APE-LCEVC-PHASE:4',
  '#EXT-X-APE-LCEVC-ENABLED:true',
  '#EXT-X-APE-HDR10-PLUS:ENABLED;MAX_NITS=5000;MIN_NITS=0.0005;L1=per-scene',
  '#EXT-X-APE-DOLBY-VISION:ENABLED=true,PROFILE=8.1,RPU=DECLARED,CROSS_COMPATIBLE=true',
  '#EXT-X-APE-HDR-DV:MODE=PQ,NITS=5000,BT2020=true',
  '#EXT-X-APE-AI-SR:MODEL=realesrgan,SCALE=4,ENABLED=true',
  '#EXT-X-APE-MINTERPOLATE:FPS=120;ME=epzs;MI_MODE=mci',
  '#EXT-X-APE-ENHANCE-STATE:DECLARED;OWNER=1;AUTHORIZED=2026-11-05;EXECUTION=engine_dependent',
];

let pending = '';
let curHasDecl = false;
let curHasHybridTag = false;
function onLine(line) {
  counters.lines++;
  // [HÍBRIDO] Idempotencia del tag: si la lista ya lo trae, no se duplica
  // al re-envolver. El tag se cuenta como declaración, no como URI.
  if (line.startsWith('#EXT-X-APE-HYBRID-PULSE')) { curHasHybridTag = true; }
  if (line.startsWith('#EXTINF')) {
    counters.extinf++; seq += 0; channelOrd++;
    cur = {
      name: channelName(line),
      group: attr(line, 'group-title'),
      id: attr(line, 'tvg-chno') || attr(line, 'tvg-id'),
      logo: attr(line, 'tvg-logo'),
      // [EXTSHIMOTT] tvg-id crudo: el contrato ancla ahi la identidad del canal
      tvgId: attr(line, 'tvg-id'),
      tvgChno: attr(line, 'tvg-chno'),
      // declaracion explicita en el propio EXTINF (si la hay, manda)
      profile: profileFromExtinf(line),
      profileSource: profileFromExtinf(line) ? 'extinf' : null,
      // [EXTSHIMOTT] evidencia real del bloque para el payload del canal
      exthttp: null, truth: null, hasVlcOpt: false, hasKodiProp: false,
    };
    curHasShimott = false;
    curHasHybridTag = false;
    write(line);
    return;
  }
  // [STRICT-PARSER] `#EXT-X-I-FRAME-STREAM-INF` sin URI= rompe players estrictos
  // (medido: "Couldn't match URI=\"(.+?)\"" en Fire Stick). Se descarta del listado
  // servido; es metadata inútil aquí (una sola URL por canal, sin trick-play).
  if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
    counters.dropped_iframe = (counters.dropped_iframe || 0) + 1;
    return;
  }
  if (line.startsWith('#EXT-X-APE-ENHANCE-STATE')) { curHasDecl = true; write(line); return; }
  // [EXTSHIMOTT] Estado del bloque para el payload del canal. NO altera la línea:
  // sólo observa lo que la lista YA declara (EXTHTTP, capas de player, verdad del
  // generador) y si el tag ya está puesto (para no duplicarlo).
  if (cur) {
    if (line.startsWith('#EXTHTTP:')) {
      if (!cur.exthttp) {
        try {
          const o = JSON.parse(line.slice('#EXTHTTP:'.length));
          if (o && typeof o === 'object' && !Array.isArray(o)) cur.exthttp = o;
        } catch (_) { counters.shimottExthttpInvalid = (counters.shimottExthttpInvalid || 0) + 1; }
      }
    } else if (line.startsWith('#EXTVLCOPT:')) {
      cur.hasVlcOpt = true;
    } else if (line.startsWith('#KODIPROP:')) {
      cur.hasKodiProp = true;
    } else if (line.startsWith('#EXT-X-APE-STREAM-TRUTH:')) {
      if (!cur.truth) cur.truth = truthKv(line);
    } else if (line.startsWith(SHIMOTT_PREFIX)) {
      curHasShimott = true;
      counters.shimottPresent = (counters.shimottPresent || 0) + 1;
    }
  }
  // [PERFIL EXPLICITO] una directiva APE con PROFILE= fija el perfil del canal y
  // GANA sobre la heuristica. Se conserva el primer valor declarado del bloque.
  {
    const pf = profileFromDirective(line);
    if (pf && cur && !cur.profile) { cur.profile = pf; cur.profileSource = 'directive'; }
  }
  if (line && !line.startsWith('#') && /^https?:\/\//i.test(line.trim())) {
    counters.urls++;
    if (!cur.name && !cur.id) counters.skipped_no_inf++;
    // [SANITIZE] Algunas listas usan `URL|Header=valor&Header2=valor` (cabeceras inline).
    // El token URL termina en el primer espacio, pipe, comilla o barra invertida. Si se
    // toma la linea entera, /pulse la rechaza con 400 ("u con caracteres invalidos") y el
    // canal queda muerto. Aqui se aisla la URL real y se cuenta el saneo.
    const m = line.match(/^(\s*)(https?:\/\/[^\s|"'<>\\]+)([\s\S]*)$/i);
    const clean = m ? m[2] : line.trim();
    if (m && m[3] && m[3].trim() !== '') { counters.sanitized = (counters.sanitized || 0) + 1; }
    // [OWNER OVERRIDE] declaraciones de mejora extrema, una vez por canal
    if (!curHasDecl) { for (const _d of OWNER_DECLARATIONS) insertTag(_d + '\n'); counters.declared = (counters.declared || 0) + 1; }
    // [HÍBRIDO APE CRYSTAL] metadata honesta del perfil de cartucho pedido:
    // P1 = 4K simulado para fuentes <=4K; P0 = 8K real. Inerte para el APK.
    if (APE_HYBRID_PULSE && !curHasHybridTag && counters.extinf > 0) {
      const hy = hybridDecision();
      insertTag(hybridTag(hy) + '\n');
      curHasHybridTag = true;
      counters.hybridTag = (counters.hybridTag || 0) + 1;
    }
    const wrapped = transformUrl(clean);
    // [EXTSHIMOTT] UNA línea por canal, DESPUES de las APE/EXTHTTP y ANTES de la URI
    // (posición del contrato: última línea de tag, 0 líneas en blanco por medio).
    // `counters.extinf > 0`: una URL suelta en la cabecera NO es un canal y no
    // recibe tag (si lo recibiera, el tag quedaría fuera de bloque: E_TAG_OUTSIDE).
    if (!curHasShimott && counters.extinf > 0) {
      const tag = SHIMOTT_PREFIX + JSON.stringify(shimottPayload());
      if (tag.length <= SHIMOTT_MAX_LINE) {
        insertTag(tag + '\n');
        counters.shimott = (counters.shimott || 0) + 1;
        curHasShimott = true;
      } else {
        counters.shimottSkippedLong = (counters.shimottSkippedLong || 0) + 1;
      }
    }
    write(wrapped);
    return;
  }
  write(line);
}

function flushChunk(chunk) {
  pending += chunk;
  let idx;
  while ((idx = pending.indexOf('\n')) >= 0) {
    const line = pending.slice(0, idx);
    pending = pending.slice(idx + 1);
    onLine(line);
    write('\n');
  }
}

const src = fs.createReadStream(inPath);
const stream = inPath.endsWith('.gz') ? src.pipe(zlib.createGunzip()) : src;

/* [BUG MEDIDO 2026-11-20] `d.toString('utf8')` decodifica CADA TROZO por separado.
 * Si una secuencia UTF-8 multibyte cae partida entre dos trozos, las dos mitades
 * no son UTF-8 valido y Node las sustituye por U+FFFD. Efecto real medido sobre
 * APE_LISTA_1795151699916_DIRECTA_CABLEADA (linea 8.450.535, canal 125649):
 *   entrada  tvg-name="✦●✦ GENERAL HD✦●✦ [MEGA]"
 *   salida   tvg-name="���●✦ GENERAL HD✦●✦ [MEGA]"
 * 0xE2 0x9C 0xA6 (3 B) -> 3x U+FFFD (9 B): +6 B en el fichero, un nombre de canal
 * mutado. StringDecoder arrastra los bytes incompletos al trozo siguiente, que es
 * exactamente lo que hace falta; el corte por lineas ya lo maneja `pending`.
 */
const decoder = new StringDecoder('utf8');

stream.on('data', (d) => {
  try { flushChunk(decoder.write(d)); }
  catch (e) { counters.errors++; console.error('wrap-error:', e.message); }
});
stream.on('error', (e) => { console.error('read-error:', e.message); try { out.end(); } catch (_) { } process.exit(1); });
stream.on('end', () => {
  try { flushChunk(decoder.end()); } catch (e) { counters.errors++; }
  if (pending.length) onLine(pending);
  flushTail();
  out.end(() => {
    try { fs.renameSync(tmp, outPath); } catch (e) { console.error('rename-error:', e.message); process.exit(1); }
    const result = {
      in: inPath, out: outPath, mode, policy, wrapper: WRAPPER_VERSION,
      builder: ApeUrlBuilder.VERSION,
      sha256: sha.digest('hex'),
      bytes: fs.statSync(outPath).size,
      channels: counters.extinf, urls: counters.urls,
      wrapped: counters.wrapped, already: counters.already, sanitized: counters.sanitized || 0,
      hybrid: counters.hybrid || 0,
      hybrid_upgraded: counters.hybridUpgraded || 0,
      hybrid_tag: counters.hybridTag || 0,
      hybrid_skipped_signed: counters.hybridSkippedSigned || 0,
      hybrid_routes: counters.hybridRoutes || {},
      hybrid_enabled: APE_HYBRID_PULSE,
      hybrid_policy: 'ape.crystal.hybrid/1+OWNER_ALL_RESOLUTIONS_UPSCALE',
      hybrid_config_version: HYBRID_CONFIG && HYBRID_CONFIG._meta ? HYBRID_CONFIG._meta.version : null,
      dropped_iframe: counters.dropped_iframe || 0,
      shimott: counters.shimott || 0,
      shimott_present: counters.shimottPresent || 0,
      shimott_skipped_long: counters.shimottSkippedLong || 0,
      shimott_id_fallback: counters.shimottIdFallback || 0,
      shimott_id_sanitized: counters.shimottIdSanitized || 0,
      shimott_ua_dropped: counters.shimottUaDropped || 0,
      shimott_rf_dropped: counters.shimottRfDropped || 0,
      shimott_exthttp_invalid: counters.shimottExthttpInvalid || 0,
      profiles: counters.profiles, errors: counters.errors,
    };
    if (statePath) {
      try { fs.writeFileSync(statePath, JSON.stringify(result, null, 1)); } catch (_) { }
    }
    if (!args.quiet) console.log(JSON.stringify(result));
    process.exit(counters.errors ? 1 : 0);
  });
});








