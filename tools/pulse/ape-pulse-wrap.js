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
const { ApeUrlBuilder } = require(process.env.APE_URL_BUILDER || '/opt/ape-pulse/ape-url-builder.js');

const POLICY_VERSION = '1';
const WRAPPER_VERSION = '1.4.0';
const PULSE_BASE_DEFAULT = 'https://iptv-ape.duckdns.org/pulse';
const ALREADY = /\/(pulse|url2)\//i;

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

function attr(line, key) {
  const m = line.match(new RegExp(key + '="([^"]*)"'));
  return m ? m[1] : '';
}

function channelName(line) {
  const m = line.match(/,(.*)$/);
  if (!m) return '';
  return String(m[1]).trim();
}

const counters = {
  lines: 0, extinf: 0, urls: 0, wrapped: 0, already: 0, skipped_no_inf: 0,
  profiles: {}, errors: 0,
};

const sha = crypto.createHash('sha256');
let seq = 0;
let cur = { name: '', group: '', id: '', logo: '' };

const tmp = outPath + '.tmp';
const out = fs.createWriteStream(tmp, { flags: 'w' });

function write(line) {
  sha.update(line, 'utf8');
  out.write(line);
}

function transformUrl(url) {
  if (ALREADY.test(url)) { counters.already++; return url; }
  if (!/^https?:\/\//i.test(url)) return url;
  seq++;
  const prof = profileForChannel(cur.name, cur.group);
  counters.profiles[prof] = (counters.profiles[prof] || 0) + 1;
  let idNum = parseInt(String(cur.id || '').replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(idNum) || idNum <= 0) idNum = seq;
  let built;
  try {
    built = ApeUrlBuilder.build({
      url,
      channelName: cur.name || ('Canal ' + idNum),
      channelId: idNum,
      logo: cur.logo || '',
      deviceType: 'generic',
      profile: prof,
      forceProfile: true,
      endpoint: pulseBase + '/{id}.m3u8',
    }).url;
  } catch (e) {
    counters.errors++;
    return url;
  }
  counters.wrapped++;
  // [MODO] Se pide cartridge, pero /pulse lo sirve SOLO a clientes capaces
  // (VLC/Kodi/ExoPlayer/OTT/TiviMate/Smarters). Al resto le da 302 a la URL del
  // proveedor: medido 2026-11-05 en Fire TV (UA Xtream-Codes/Dalvik), recibe el
  // master y aborta con "Loaded playlist has unexpected type.".
  return built + '&m=cartridge&l=' + encodeURIComponent(listName);
}

let pending = '';
function onLine(line) {
  counters.lines++;
  if (line.startsWith('#EXTINF')) {
    counters.extinf++; seq += 0;
    cur = {
      name: channelName(line),
      group: attr(line, 'group-title'),
      id: attr(line, 'tvg-chno') || attr(line, 'tvg-id'),
      logo: attr(line, 'tvg-logo'),
    };
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
    write(transformUrl(clean));
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

stream.on('data', (d) => {
  try { flushChunk(d.toString('utf8')); }
  catch (e) { counters.errors++; console.error('wrap-error:', e.message); }
});
stream.on('error', (e) => { console.error('read-error:', e.message); try { out.end(); } catch (_) { } process.exit(1); });
stream.on('end', () => {
  if (pending.length) onLine(pending);
  out.end(() => {
    try { fs.renameSync(tmp, outPath); } catch (e) { console.error('rename-error:', e.message); process.exit(1); }
    const result = {
      in: inPath, out: outPath, mode, policy, wrapper: WRAPPER_VERSION,
      builder: ApeUrlBuilder.VERSION,
      sha256: sha.digest('hex'),
      bytes: fs.statSync(outPath).size,
      channels: counters.extinf, urls: counters.urls,
      wrapped: counters.wrapped, already: counters.already, sanitized: counters.sanitized || 0,
      dropped_iframe: counters.dropped_iframe || 0,
      profiles: counters.profiles, errors: counters.errors,
    };
    if (statePath) {
      try { fs.writeFileSync(statePath, JSON.stringify(result, null, 1)); } catch (_) { }
    }
    if (!args.quiet) console.log(JSON.stringify(result));
    process.exit(counters.errors ? 1 : 0);
  });
});





