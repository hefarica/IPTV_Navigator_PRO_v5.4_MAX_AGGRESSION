#!/usr/bin/env node
'use strict';
/*
 * reconcile.js — espejo ATÓMICO lista servida → allowlist JIT + lista JIT
 *
 * PROBLEMA QUE CIERRA
 *   `channels.json` y `APE_JIT_LIST.m3u8` se mantenían a mano. La lista servida
 *   se regenera (10.573 canales hoy) y esos dos ficheros se quedan viejos: un canal
 *   nuevo en la lista da 404 "unknown channel" en /jit/live/<id>/… sin que nadie
 *   se entere.
 *
 * QUÉ HACE
 *   1. Lee la lista SERVIDA (/var/www/lists/pulse/APE_LISTA_*.m3u8) en streaming.
 *   2. De cada bloque saca: id, nombre, logo, grupo, UA (de #EXTHTTP) y la URL del
 *      proveedor desde `?u=` de la línea /pulse/ → la reescribe como /cdn/<host><ruta>
 *      (el mismo formato que ya usa channels.json).
 *   3. Escribe una RELEASE completa en `releases/<version>/` (channels.json +
 *      APE_JIT_LIST.m3u8 + meta.json) y la publica con UN SOLO rename() del symlink
 *      `current`. Dos rename() seguidos NO serían atómicos como conjunto: un lector
 *      podría ver el mapa nuevo con la lista vieja. Con el flip del symlink ambos
 *      cambian a la vez, o ninguno. server.js lee vía `current/`, así que el cambio
 *      entra SIN reiniciar y sin cortar la reproducción.
 *   4. Las 5 releases anteriores se conservan: rollback = reapuntar `current`.
 *
 * FAIL-CLOSED
 *   Si el parseo da menos del 95 % de los canales que ya tenía la allowlist, NO
 *   publica: es la firma de una lista truncada o de un parseo roto. Deja el mapa
 *   anterior intacto y sale con código 2. Un espejo que se puede quedar vacío no
 *   es un espejo.
 *
 * USO
 *   node reconcile.js [--list <ruta>] [--out <dir>] [--dry-run] [--verbose]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);

const OUT_DIR = arg('out', '/opt/ape-jit');
const CURRENT = path.join(OUT_DIR, 'current');            // symlink -> releases/<v>
const RELEASES = path.join(OUT_DIR, 'releases');
const MAP_FILE = path.join(CURRENT, 'channels.json');     // se lee vía el symlink
const JIT_LIST = path.join(CURRENT, 'APE_JIT_LIST.m3u8');
const MISSES = path.join(OUT_DIR, 'misses.log');          // ruta fija: sobrevive a los flips
const STAMP = path.join(OUT_DIR, '.reconciled');          // ruta fija
const LIST_DIR = '/var/www/lists/pulse';
const BASE = 'https://iptv-ape.duckdns.org';
const DEFAULT_UA = 'VLC/3.0.19 LibVLC/3.0.19';
const MIN_RATIO = 0.95;

const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Lista servida: la indicada, o la más reciente de lists/pulse. */
function pickList() {
  const explicit = arg('list', '');
  if (explicit) return explicit;
  const files = fs.readdirSync(LIST_DIR)
    .filter(f => f.endsWith('.m3u8') && !f.endsWith('.gz'))
    .map(f => ({ f, p: path.join(LIST_DIR, f), m: fs.statSync(path.join(LIST_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files.length) throw new Error('no hay listas en ' + LIST_DIR);
  return files[0].p;
}

/** http://host/ruta/x.m3u8  ->  https://iptv-ape.duckdns.org/cdn/host/ruta/x.m3u8 */
function toCdn(providerUrl) {
  try {
    const u = new URL(providerUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const rest = (u.pathname || '/').replace(/^\/+/, '') + (u.search || '');
    return BASE + '/cdn/' + u.host + '/' + rest;
  } catch (_) { return ''; }
}

function attr(extinf, name) {
  const m = extinf.match(new RegExp(name + '="([^"]*)"', 'i'));
  return m ? m[1] : '';
}

async function parseList(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const map = Object.create(null);
  const rows = [];
  let cur = null, ua = '', pulseUrl = '', n = 0, skipped = 0, noUrl = 0;

  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    n++;

    if (t.startsWith('#EXTINF')) {
      if (cur && cur.url) { map[cur.id] = { url: cur.url, ua: cur.ua }; rows.push(cur); }
      else if (cur) noUrl++;
      const te = t.match(/,(.*)$/);
      cur = {
        id: attr(t, 'tvg-id') || attr(t, 'tvg-chno'),
        name: attr(t, 'tvg-name') || (te ? te[1].trim() : ''),
        logo: attr(t, 'tvg-logo'),
        group: attr(t, 'group-title'),
        url: '', ua: DEFAULT_UA,
      };
      ua = '';
      continue;
    }
    if (!cur) continue;

    if (t.startsWith('#EXTHTTP:')) {
      // regex barata: el JSON tiene ~7,7 KB por canal y no necesitamos el resto
      const m = t.match(/"User-Agent":"([^"]+)"/);
      if (m && m[1]) ua = m[1];
      continue;
    }
    if (t.startsWith('#')) continue;

    // línea de URL del bloque — POLIMÓRFICO: entiende el envoltorio /pulse/?u= de APE
    // y también una URL directa, que es como vienen las listas ajenas. Sin esto el
    // espejo solo sabría leer las listas de este generador.
    let resolved = '';
    if (t.includes('/pulse/')) {
      const u = t.match(/[?&]u=([^&\s]+)/);
      if (u) { try { resolved = toCdn(decodeURIComponent(u[1])); } catch (_) { resolved = ''; } }
    } else if (/^https?:\/\//i.test(t)) {
      resolved = t;                         // lista ajena: se usa su URL tal cual
    }
    if (resolved && cur.id) { cur.url = resolved; cur.ua = ua || DEFAULT_UA; }
    else if (cur.id) skipped++;
  }
  if (cur && cur.url) { map[cur.id] = { url: cur.url, ua: cur.ua }; rows.push(cur); }
  else if (cur) noUrl++;

  return { map, rows, lines: n, skipped, noUrl };
}

function buildJitList(rows) {
  const out = ['#EXTM3U'];
  for (const r of rows) {
    const name = r.name || ('canal ' + r.id);
    out.push(
      `#EXTINF:-1 tvg-id="${r.id}" tvg-name="${name}" tvg-logo="${r.logo}" ` +
      `group-title="${r.group}" x-json-metadata="${BASE}/jit/live/${r.id}/manifest.json",${name}`
    );
    out.push(`${BASE}/jit/live/${r.id}/master.m3u8`);
  }
  return out.join('\n') + '\n';
}

function atomicWrite(file, content) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);   // atómico en el mismo filesystem
}

(async () => {
  const list = pickList();
  const st = fs.statSync(list);
  log('LIST', list, Math.round(st.size / 1048576) + ' MB');

  // Idempotencia barata: si la lista no cambió desde el último reconcile y las
  // salidas existen, NO se re-parsean 596 MB. Así esto puede correr por timer
  // cada pocos minutos sin coste. --force lo salta.
  if (!flag('force')) {
    try {
      const s = JSON.parse(fs.readFileSync(STAMP, 'utf8'));
      if (s.path === list && s.size === st.size && s.mtimeMs === st.mtimeMs
          && fs.existsSync(MAP_FILE) && fs.existsSync(JIT_LIST)) {
        log('SKIP', 'la lista no cambió (size+mtime iguales) · canales=' + Object.keys(
          JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))).length);
        return;
      }
    } catch (_) { /* sin sello legible: se reconcilia */ }
  }

  const prevMap = (() => { try { return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); } catch (_) { return {}; } })();
  const prevCount = Object.keys(prevMap).length;

  const { map, rows, lines, skipped, noUrl } = await parseList(list);
  const ids = Object.keys(map);
  log('PARSE', 'lineas=' + lines, 'canales=' + ids.length, 'sin_url=' + (skipped + noUrl), 'allowlist_previa=' + prevCount);

  const floor = Math.floor(prevCount * MIN_RATIO);
  if (prevCount > 0 && ids.length < floor) {
    log('ABORT', `solo ${ids.length} canales (< ${floor} = 95 % de ${prevCount}). No publico: el mapa actual queda intacto.`);
    process.exit(2);
  }
  const bad = ids.filter(id => !/^[A-Za-z0-9_.-]{1,80}$/.test(id));
  if (bad.length) { log('ABORT', 'ids invalidos: ' + bad.slice(0, 5).join(',')); process.exit(2); }

  const jitList = buildJitList(rows);
  if (flag('dry-run')) {
    log('DRY-RUN', 'no escribo nada', 'channels=' + ids.length, 'jitlist_bytes=' + jitList.length);
    const sample = rows.slice(0, 2);
    sample.forEach(r => log('  muestra', r.id, r.name, '->', r.url));
    return;
  }

  // ── PUBLICACIÓN ATÓMICA COMO UNIDAD ──────────────────────────────────────────
  // Dos rename() seguidos NO son atómicos como conjunto: un lector podía ver el
  // channels.json nuevo con el APE_JIT_LIST.m3u8 viejo. Aquí se escribe una release
  // completa en su propio directorio y se publica con UN solo rename() de symlink:
  // `current` apunta a la release nueva y los DOS ficheros cambian a la vez.
  const version = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) +
    '-' + Math.random().toString(36).slice(2, 6);
  const vdir = path.join(RELEASES, version);
  fs.mkdirSync(vdir, { recursive: true });
  atomicWrite(path.join(vdir, 'channels.json'), JSON.stringify(map));
  atomicWrite(path.join(vdir, 'APE_JIT_LIST.m3u8'), jitList);
  atomicWrite(path.join(vdir, 'meta.json'), JSON.stringify({
    version, source: list, size: st.size, mtimeMs: st.mtimeMs,
    channels: ids.length, at: Date.now(),
  }));

  // flip atómico: symlink temporal + rename()
  const linkTmp = path.join(OUT_DIR, '.current.tmp');
  try { fs.unlinkSync(linkTmp); } catch (_) {}
  fs.symlinkSync(path.relative(OUT_DIR, vdir), linkTmp);
  fs.renameSync(linkTmp, CURRENT);

  atomicWrite(STAMP, JSON.stringify({
    path: list, size: st.size, mtimeMs: st.mtimeMs, at: Date.now(), release: version,
  }));

  // verificación post-flip: lo publicado se lee vía `current/` y cuadra
  const check = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  const checkList = fs.readFileSync(JIT_LIST, 'utf8');
  const nCheck = Object.keys(check).length;
  const nList = (checkList.match(/^#EXTINF/gm) || []).length;
  if (nCheck !== ids.length || nList !== ids.length) {
    log('FATAL', 'verificacion post-flip: mapa=' + nCheck + ' lista=' + nList + ' esperado=' + ids.length);
    process.exit(3);
  }

  // purga: se conservan las 5 releases más recientes (las demás son rollback)
  try {
    const all = fs.readdirSync(RELEASES).sort();
    while (all.length > 5) {
      const old = all.shift();
      fs.rmSync(path.join(RELEASES, old), { recursive: true, force: true });
      log('  release purgada', old);
    }
  } catch (_) {}

  let missCount = 0;
  try { missCount = fs.readFileSync(MISSES, 'utf8').split('\n').filter(Boolean).length; } catch (_) {}

  log('PUBLISH', 'release=' + version, 'channels=' + ids.length, 'jit_list_bytes=' + jitList.length,
    'verificado=' + nCheck + '/' + nList, 'misses_pendientes=' + missCount);
  log('  flip atómico: current -> releases/' + version + ' (1 solo rename)');
})().catch(e => { log('FATAL', e && e.message); process.exit(1); });
