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
 * FAIL-CLOSED, PERO POR IDENTIDAD DE LISTA (2026-11-21)
 *   Antes: si el parseo daba menos del 95 % de los canales de la allowlist, NO publicaba.
 *   Correcto para LA MISMA lista (firma de truncado o parseo roto), pero el catalogo
 *   servido cambia de lista: medido en produccion, la allowlist de 21 224 salio de
 *   APE_LISTA_1794783650337_CDN.m3u8 y el reconciliador parseaba
 *   APE_LISTA_1795151699916_DIRECTA_CABLEADA.m3u8. Comparar dos catalogos distintos
 *   abortaba cada 5 minutos para siempre y congelaba la allowlist.
 *   Ahora: MISMA lista -> guard estricto del 95 % (sin cambios). OTRA lista -> publica
 *   diciendo LIST_CHANGED con los dos counts, con FLOOR_DURO (100) para no publicar
 *   un catalogo absurdo, y deja traza nominal (channels_dropped.txt / channels_added.txt)
 *   para que ningun canal desaparezca sin nombre.
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
const LIST_DIR = arg('dir', '/var/www/lists/pulse');   // --dir existe para poder probarlo
const BASE = 'https://iptv-ape.duckdns.org';
const SELF_HOST = (() => { try { return new URL(BASE).host; } catch (_) { return 'iptv-ape.duckdns.org'; } })();
const DEFAULT_UA = 'VLC/3.0.19 LibVLC/3.0.19';
const MIN_RATIO = 0.95;

const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Lista servida: la indicada, o la más reciente de lists/pulse. */
function pickList() {
    // Preferencia 1: exactamente la lista que el wrapper esta sirviendo.
    try {
      const servida = listaServidaPorWrapper();
      if (servida) {
        const nombre = servida + '.m3u8';
        const ruta   = require('path').join(LIST_DIR, nombre);
        if (require('fs').existsSync(ruta)) {
          const st = require('fs').statSync(ruta);
          if (st.size > 0) {
            log(`LIST ${ruta} ${(st.size / 1048576).toFixed(0)} MB (servida por wrapper)`);
            return ruta;
          }
        }
      }
    } catch (e) { log('WARN listaServida: ' + e.message); }


  // [2026-11-14] La lista VIVA es la que el wrapper sirve en `l=APE_LISTA_<id>`,
  // NO la de mtime mas nuevo: el sync descomprime .gz viejos -> .m3u8 con mtime
  // fresco y ganaban el sort por mtime. Variable correcta: LIST_DIR.
  function listaServidaPorWrapper() {
    try {
      const fsl = require('fs');
      const log = '/var/log/nginx/playlist_access.log';
      const fd  = fsl.openSync(log, 'r');
      const st  = fsl.fstatSync(fd);
      /* [2026-11-19] OOM MEDIDO (status=6/ABRT, RegExpImpl::IrregexpExec ->
       * String::SlowFlatten): aqui se leian 4 MB del access log, se convertian a
       * un unico string y se les pasaba matchAll con regex global, generando un
       * array de TODAS las coincidencias. Eso aborta el proceso en esta VPS y el
       * servicio ape-jit-reconcile queda failed: la allowlist del JIT nunca se
       * actualiza. Ahora se busca el ULTIMO '?l=' con Buffer.lastIndexOf (nativo,
       * sin string global y sin array), que es justo lo que el codigo queria:
       * la ULTIMA lista servida. */
      const len = Math.min(st.size, 1024 * 1024);
      const buf = Buffer.alloc(len);
      fsl.readSync(fd, buf, 0, len, Math.max(0, st.size - len));
      fsl.closeSync(fd);
      const MARK = Buffer.from('l=APE_LISTA_');
      let at = buf.lastIndexOf(MARK);
      while (at >= 0) {
        let end = at + MARK.length;
        while (end < len) {
          const c = buf[end];
          const ok = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 46 || c === 95 || c === 45;
          if (!ok) break;
          end++;
        }
        const id = buf.toString('utf8', at + 2, end);
        if (id && id.indexOf('APE_LISTA_') === 0) return id;
        at = buf.lastIndexOf(MARK, at - 1);
      }
      return null;
    } catch (e) { return null; }
  }


  const explicit = arg('list', '');
  if (explicit) return explicit;
  const files = fs.readdirSync(LIST_DIR)
    // [2026-11-13] El comentario de cabecera (linea 13) dice que se lee
    // APE_LISTA_*, pero el filtro aceptaba CUALQUIER .m3u8. Con 5 listas en el
    // directorio y el mismo mtime tras un sync, ganaba APE_PRUEBA_PERFILES
    // (3 canales) y el guard fail-closed abortaba: "solo 3 canales (< 20163)".
    // El guard hacia bien; el que miraba el fichero equivocado era esto.
    .filter(f => f.endsWith('.m3u8') && !f.endsWith('.gz')
                 && f.startsWith('APE_LISTA_'))
    .map(f => ({ f, p: path.join(LIST_DIR, f), m: fs.statSync(path.join(LIST_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files.length) throw new Error('no hay listas en ' + LIST_DIR);

  /* [2026-11-21] FUENTE vs SALIDA. Medido en produccion: la lista mas reciente por
   * mtime era APE_LISTA_1795151699916_DIRECTA_CABLEADA y sus `?u=` apuntaban a
   * https://iptv-ape.duckdns.org/jit/live/<id>/master.m3u8 — es decir, a NOSOTROS.
   * Es una SALIDA ya envuelta: alimentar el espejo con ella crea el bucle
   * /jit/live/1 -> /cdn/iptv-ape.duckdns.org/jit/live/1 -> ... Las crudas del mismo
   * lote (APE_LISTA_*_CDN) apuntaban a 0/3 propias. El criterio no puede ser solo
   * "la mas nueva": se descarta la que ya esta envuelta y se dice cual y por que. */
  const envuelta = (p) => {
    /* Muestreo por TRAMOS: un bloque de canal de estas listas ocupa ~1 MB, asi que leer
     * solo los primeros 512 KB puede no encontrar ni un `?u=` y responder "no envuelta"
     * (falso negativo medido). Se acumulan aciertos hasta 5 o hasta 16 MB. */
    try {
      const fd = fs.openSync(p, 'r');
      const size = fs.fstatSync(fd).size;
      let offset = 0, acc = '', hits = 0, propias = 0, vueltas = 0;
      while (offset < size && hits < 5 && vueltas < 16) {
        const len = Math.min(1024 * 1024, size - offset);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, offset);
        offset += len; vueltas++;
        acc += buf.toString('utf8');
        const found = acc.match(/u=[^&\s]*/g) || [];
        if (found.length) {
          for (const h of found) {
            hits++;
            try { if (decodeURIComponent(h.slice(2)).indexOf(SELF_HOST) >= 0) propias++; } catch (_) { /* noop */ }
          }
          acc = '';
        } else {
          acc = acc.slice(-4096);      // conserva un solape por si el token cruza el tramo
        }
      }
      fs.closeSync(fd);
      if (!hits) return false;
      return propias > 0 && propias >= hits / 2;
    } catch (_) { return false; }
  };
  const crudas = files.filter((x) => {
    if (envuelta(x.p)) { log('CANDIDATA descartada (ya envuelta, apunta al propio JIT):', x.f); return false; }
    return true;
  });
  if (!crudas.length) {
    log('WARN', 'todas las listas de ' + LIST_DIR + ' parecen ya envueltas; uso la mas reciente y el guard decidira');
    return files[0].p;
  }
  return crudas[0].p;
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
  // [2026-11-21] sinId se cuenta APARTE de skipped. Antes, un bloque con URL pero sin
  // tvg-id caia en el `else if (cur.id)` como falso y NO se contaba en ningun sitio:
  // desaparecia del mapa sin dejar traza. Medido: el log solo decia sin_url=0 cuando
  // en realidad el agujero podia ser de ids ausentes.
  let cur = null, ua = '', n = 0, noUrl = 0, sinId = 0, loop = 0;

  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    n++;

    if (t.startsWith('#EXTINF')) {
      // [2026-11-21] La clasificación de cada bloque se hace AQUÍ, una sola vez: con id
      // y url -> al mapa; sin id -> sinId; con id y sin url -> noUrl. Antes se contaba
      // también en la línea de URL y un bloque sin id acababa sumando en sin_id Y en
      // sin_url (medido por el test: sin_url=3 sin_id=3 para 3 bloques sin id).
      if (cur) {
        if (cur.id && cur.url) { map[cur.id] = { url: cur.url, ua: cur.ua }; rows.push(cur); }
        else if (!cur.id) sinId++;
        else if (!cur.loop) noUrl++;   // si era bucle ya esta contado en loop
      }
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
    let payload = '';        // URL DE ORIGEN, antes de envolverla: es la que dice si hay bucle
    if (t.includes('/pulse/')) {
      const u = t.match(/[?&]u=([^&\s]+)/);
      if (u) {
        try {
          payload = decodeURIComponent(u[1]);
          resolved = toCdn(payload);
        } catch (_) { resolved = ''; }
      }
    } else if (/^https?:\/\//i.test(t)) {
      payload = t;                          // lista ajena: se usa su URL tal cual
      resolved = t;
    }
    if (resolved && cur.id) {
      /* [2026-11-21] BUCLE. El host que hay que mirar es el del PAYLOAD, no el de la URL
       * ya envuelta: toCdn() SIEMPRE devuelve https://iptv-ape.duckdns.org/cdn/…, asi que
       * comparar el host del resultado marcaba TODO como bucle (bug medido: 11222 de 11222
       * tambien en listas crudas, y ese guard habria bloqueado para siempre). Se compara
       * el origen real: si el `u=` ya es nuestro /jit/live/…, el canal NO entra al mapa
       * y se cuenta como loop; si el `u=` es del proveedor, se envuelve como siempre. */
      let propio = false;
      try { propio = !!payload && new URL(payload).host === SELF_HOST; } catch (_) { propio = false; }
      if (propio) { cur.loop = true; loop++; }
      else { cur.url = resolved; cur.ua = ua || DEFAULT_UA; }
    }
  }
  if (cur) {
    if (cur.id && cur.url) { map[cur.id] = { url: cur.url, ua: cur.ua }; rows.push(cur); }
    else if (!cur.id) sinId++;
    else if (!cur.loop) noUrl++;
  }

  return { map, rows, lines: n, noUrl, sinId, loop };
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

  /* [2026-11-21] IDENTIDAD DE LA LISTA — el defecto que dejaba el servicio en abort
   * permanente. Medido en produccion: la allowlist publicada (21 224 canales) salio de
   * APE_LISTA_1794783650337_CDN.m3u8 (1 380 561 704 B) y el reconciliador estaba
   * parseando APE_LISTA_1795151699916_DIRECTA_CABLEADA.m3u8 (708 400 298 B): OTRO
   * catalogo. Comparar 11 222 canales de una lista contra 21 224 de otra no mide una
   * caida, mide dos catalogos distintos -> y el guard fail-closed abortaba cada 5 min
   * para siempre, dejando la allowlist congelada.
   *   - MISMA lista  -> se mantiene el guard estricto del 95 % (una caida ahi SI es
   *     truncado o parseo roto).
   *   - OTRA lista   -> se publica, pero se dice en voz alta (LIST_CHANGED) y se deja
   *     traza nominal de quien entra y quien sale. Nunca en silencio.
   * FLOOR_DURO impide publicar un catalogo vacio o absurdo en el camino de otra lista. */
  const FLOOR_DURO = 100;
  const listKey = path.basename(list).replace(/\.m3u8$/i, '');
  let prevMeta = {};
  try { prevMeta = JSON.parse(fs.readFileSync(path.join(CURRENT, 'meta.json'), 'utf8')); } catch (_) { prevMeta = {}; }
  const prevKey = prevMeta.listKey
    || (prevMeta.source ? path.basename(String(prevMeta.source)).replace(/\.m3u8$/i, '') : '');
  const mismaLista = prevCount === 0 || prevKey === listKey;

  const { map, rows, lines, noUrl, sinId, loop } = await parseList(list);
  const ids = Object.keys(map);
  log('PARSE', 'lineas=' + lines, 'canales=' + ids.length, 'sin_url=' + noUrl,
    'sin_id=' + sinId, 'bucle=' + loop, 'allowlist_previa=' + prevCount, 'lista=' + listKey);

  /* [2026-11-21] Una lista YA ENVUELTA no es una fuente: si la mitad o mas de sus
   * canales apuntan a nuestro propio host, publicarla deja el espejo apuntandose a
   * si mismo (bucle /jit/live/1 -> /cdn/iptv-ape.../jit/live/1). Se aborta con nombre
   * propio para no confundirlo con un truncado ni con un cambio de catalogo. */
  if (loop > 0 && loop >= Math.max(1, Math.floor((ids.length + loop) * 0.5))) {
    log('ABORT', 'LISTA_ENVUELTA: ' + loop + ' de ' + (ids.length + loop) +
      ' canales apuntan al propio JIT (' + SELF_HOST + '). No publico: seria un bucle. Usa la lista CRUDA del lote.');
    process.exit(2);
  }

  // ceil, no floor: con floor una lista de 2 canales dejaba pasar 1 (floor(1.9)=1),
// es decir un 50 % de caida. Con ceil el minimo es el 95 % real redondeado ARRIBA.
  const floor = Math.ceil(prevCount * MIN_RATIO);
  if (prevCount > 0 && !mismaLista) {
    log('LIST_CHANGED', 'allowlist de ' + (prevKey || '(identidad desconocida)') + ' (' + prevCount +
      ') -> lista ' + listKey + ' (' + ids.length + '): catalogos distintos, el ratio 95 % no aplica');
    if (ids.length < FLOOR_DURO) {
      log('ABORT', `catalogo nuevo con solo ${ids.length} canales (< FLOOR_DURO ${FLOOR_DURO}). No publico.`);
      process.exit(2);
    }
  } else if (prevCount > 0 && ids.length < floor) {
    log('ABORT', `solo ${ids.length} canales (< ${floor} = 95 % de ${prevCount}, misma lista). No publico: el mapa actual queda intacto.`);
    process.exit(2);
  }
  const bad = ids.filter(id => !/^[A-Za-z0-9_.-]{1,80}$/.test(id));
  if (bad.length) { log('ABORT', 'ids invalidos: ' + bad.slice(0, 5).join(',')); process.exit(2); }

  // Traza nominal: que id sale y cual entra. Sin esto un canal puede desaparecer sin
  // nombre, que es justo lo que el guard nunca pudo explicar.
  const prevIds = Object.keys(prevMap);
  const nuevoSet = new Set(ids);
  const dropped = prevIds.filter(id => !nuevoSet.has(id));
  const prevSet = new Set(prevIds);
  const added = ids.filter(id => !prevSet.has(id));
  log('TRAZA', 'salen=' + dropped.length, 'entran=' + added.length,
    dropped.length ? ('ej. salen: ' + dropped.slice(0, 5).join(',')) : '');

  const jitList = buildJitList(rows);
  if (flag('dry-run')) {
    log('DRY-RUN', 'no escribo nada', 'channels=' + ids.length, 'jitlist_bytes=' + jitList.length,
      'salen=' + dropped.length, 'entran=' + added.length);
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
  // Traza en la propia release: quien salio y quien entro, por id. Se conserva junto al
  // mapa para que el rollback (reapuntar `current`) tambien conserve la explicacion.
  atomicWrite(path.join(vdir, 'channels_dropped.txt'), dropped.join('\n') + (dropped.length ? '\n' : ''));
  atomicWrite(path.join(vdir, 'channels_added.txt'), added.join('\n') + (added.length ? '\n' : ''));
  atomicWrite(path.join(vdir, 'meta.json'), JSON.stringify({
    version, source: list, listKey, prevKey, size: st.size, mtimeMs: st.mtimeMs,
    channels: ids.length, prev_channels: prevCount, dropped: dropped.length, added: added.length,
    sin_id: sinId, misma_lista: mismaLista, at: Date.now(),
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
  /* [2026-11-19] OOM MEDIDO: aqui se hacia fs.readFileSync(JIT_LIST) (7,5 MB) y
   * luego checkList.match(/^#EXTINF/gm): un string enorme + el array de matches.
   * En esta VPS eso ABORTA el proceso (status=6/ABRT en NewRawTwoByteString /
   * StringDecoder::DecodeData) y el servicio ape-jit-reconcile queda failed, con
   * lo que la allowlist del JIT nunca se actualiza. Se cuenta en STREAMING: no
   * se materializa el fichero ni se crea el array. */
  const nList = await new Promise((res, rej) => {
    let n = 0;
    const _rl = readline.createInterface({ input: fs.createReadStream(JIT_LIST), crlfDelay: Infinity });
    _rl.on('line', (l) => { if (l.startsWith('#EXTINF')) n++; });
    _rl.on('close', () => res(n));
    _rl.on('error', rej);
  });
  const nCheck = Object.keys(check).length;
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
