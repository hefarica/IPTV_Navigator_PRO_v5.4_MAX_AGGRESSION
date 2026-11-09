#!/usr/bin/env node
'use strict';
/*
 * jit_quality_catalog.js — el catalogo CORTO "TV calidad" (JIT bajo demanda)
 *
 * POR QUE EXISTE
 *   El JIT es single-active-channel (medido: un zap hace STOP del canal en curso)
 *   y arranca en ~20 s. Si TODO el catalogo apunta al JIT, zapear corta al que
 *   esta viendo. La solucion no es un flag global: es un catalogo APARTE con los
 *   canales que de verdad se quieren ver en calidad, para abrirlo a proposito.
 *
 *   Catalogo normal (rapido, proveedor directo)  -> uso diario, zapping instantaneo
 *   Este catalogo     (calidad, JIT bajo demanda) -> cuando se quiere ver BIEN
 *
 * CONTRATO (el mismo del catalogo idempotente)
 *   IDEMPOTENTE  salida identificada por sha256 del contenido normalizado; si no
 *                cambia, no se reescribe. Dos corridas dan el mismo fichero.
 *   POLIMORFICO  cada entrada apunta al resolver, que decide master vs media por
 *                el User-Agent del cliente en el momento del zap.
 *   ISOMORFICO   el perfil viaja en la URL y en la entrada; el estado se
 *                reconstruye leyendo una sola linea.
 *
 * SELECCION (que canales entran)
 *   --profile P1         por perfil derivado del nombre (por defecto P1 = 4K/UHD)
 *   --group  <subcadena> filtra por group-title
 *   --name   <subcadena> filtra por nombre
 *   --ids    1,2,3       ids exactos
 *   --max    N           tope de canales (por defecto 250)
 *   Sin filtros: P1 (los 4K/UHD declarados), hasta --max.
 *
 * Uso:
 *   node jit_quality_catalog.js [--list <m3u8>] [--out <dir>] [--check]
 *                               [--profile P1] [--group "DEPORTES"] [--ids 1,2]
 *                               [--max 250] [--name calidad]
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTRACT_VERSION = '1.0.0';
const BASE = process.env.APE_JIT_PUBLIC_BASE || 'https://iptv-ape.duckdns.org';

const ESCALERA = [
  { re: /\b(8k|4320p?|7680)\b/i,             perfil: 'P0' },
  { re: /\b(4k|uhd|2160p?|3840)\b/i,         perfil: 'P1' },
  { re: /\b(1440p?|2k|qhd)\b/i,              perfil: 'P3' },
  { re: /\bfhd\b|\b1080p?|\bfull\s*hd\b/i,   perfil: 'P3' },
  { re: /\bhd\b|\b720p?/i,                   perfil: 'P4' },
  { re: /\b(sd|480p?|576p?|360p?|240p?)\b/i, perfil: 'P5' },
];
const PERFIL_POR_DEFECTO = 'P3';

function perfilPara(nombre, grupo) {
  const t = String(nombre || '') + ' ' + String(grupo || '');
  for (const e of ESCALERA) if (e.re.test(t)) return e.perfil;
  return PERFIL_POR_DEFECTO;
}

function parseLista(texto) {
  const canales = [];
  let pend = null;
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.startsWith('#EXTINF')) {
      pend = {
        id: (linea.match(/tvg-id="([^"]*)"/) || [])[1] || '',
        name: (linea.match(/tvg-name="([^"]*)"/) || [])[1] || (linea.split(',').pop() || '').trim(),
        logo: (linea.match(/tvg-logo="([^"]*)"/) || [])[1] || '',
        group: (linea.match(/group-title="([^"]*)"/) || [])[1] || '',
      };
      continue;
    }
    if (pend && linea && !linea.startsWith('#')) {
      pend.url = linea.trim();
      canales.push(pend);
      pend = null;
    }
  }
  return canales.filter((c) => c.id);
}

function arg(n, d) {
  const i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
}

function huella(norm) {
  const h = crypto.createHash('sha256');
  h.update('ape-jit-quality|v' + CONTRACT_VERSION + '|');
  for (const c of norm) h.update(c.id + '\u0001' + c.name + '\u0001' + c.group + '\u0002');
  return h.digest('hex');
}

function sello(id, perfil) {
  return crypto.createHash('sha256')
    .update('ape-jit|' + CONTRACT_VERSION + '|' + id + '|' + perfil)
    .digest('hex').slice(0, 12);
}

/* --auto: busca la lista MAS RECIENTE servida que tenga rutas /jit/live/ (es
 * decir, la que el operador genero con el check "JIT" activo) y construye el
 * catalogo de calidad con TODOS sus canales. Asi no hay paso manual: se genera
 * y el catalogo se rehace solo con lo que el marco. */
function listaAuto() {
  /* PRIORIDAD: las listas que el operador genero viven en /var/www/lists. Las de
   * /opt/ape-jit/current son DERIVADAS por mi (EXTATTR, IDEMPOTENTE, CALIDAD...)
   * y nunca deben ganar a la del operador, o el catalogo se morderia la cola.
   * Se recorre en orden y se corta en el primer directorio que aporte candidata. */
  const DIRS = ['/var/www/lists', '/opt/ape-jit/current'];
  let mejor = null;
  for (const d of DIRS) {
    const antes = mejor;
    let fs2;
    try { fs2 = fs.readdirSync(d); } catch (_) { continue; }
    for (const f of fs2) {
      if (!f.endsWith('.m3u8')) continue;
      const p = path.join(d, f);
      let st, head;
      try { st = fs.statSync(p); } catch (_) { continue; }
      if (!st.isFile() || st.size < 2000) continue;
      try { head = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
      if (!head.includes('/jit/live/')) continue;      // solo listas generadas con JIT
      if (!head.includes('#EXTINF')) continue;
      if (!mejor || st.mtimeMs > mejor.mtimeMs) mejor = { p, mtimeMs: st.mtimeMs };
    }
    if (mejor !== antes) break;   // este directorio aporto: no se mira el siguiente
  }
  return mejor ? mejor.p : null;
}

function main() {
  const auto = process.argv.includes('--auto');
  let lista = arg('--list', '');
  if (auto && !lista) {
    const hallada = listaAuto();
    if (!hallada) {
      console.error('  ERROR: --auto no encontro ninguna lista servida con rutas /jit/live/');
      console.error('         genera la lista en la UI con el check "JIT" activo y reintenta,');
      console.error('         o pasa --list <ruta> explicitamente.');
      return 2;
    }
    lista = hallada;
    console.log('  --auto: lista detectada -> ' + hallada);
  }
  if (!lista) lista = '/opt/ape-jit/current/APE_JIT_LIST.m3u8';
  const outDir = arg('--out', '/opt/ape-jit/current');
  const check = process.argv.includes('--check');
  const version = arg('--version', 'max');
  /* Con --all/--auto el tope por defecto es alto: el operador dijo "van TODOS los
   * que se generen con el checklist". Poner 250 por defecto recortaba en silencio. */
  const maxArg = arg('--max', '');
  const max = maxArg ? Number(maxArg)
    : ((process.argv.includes('--all') || process.argv.includes('--auto')) ? 100000 : 250);
  const fPerfil = arg('--profile', 'P1');
  const fGroup = arg('--group', '');
  const fName = arg('--name', '');
  const fIds = arg('--ids', '');
  /* --all: NO filtra. Toma TODOS los canales de la lista de entrada.
   * Es el modo que usa el operador cuando marca el check "JIT" en el generador y
   * produce una lista con las rutas /jit/live/: esa lista ES la seleccion. Aqui no
   * se adivina por perfil ni por nombre — manda lo que el operador marco. */
  const tomarTodo = process.argv.includes('--all') || auto;
  const destino = path.join(outDir, 'APE_JIT_LIST_CALIDAD_' + version + '.m3u8');
  const estado = path.join(outDir, 'APE_JIT_LIST_CALIDAD_' + version + '.json');

  if (!fs.existsSync(lista)) { console.error('  ERROR: no existe ' + lista); return 2; }

  let canales = parseLista(fs.readFileSync(lista, 'utf8'));
  const total = canales.length;

  // ── seleccion ──
  if (fIds) {
    const set = new Set(fIds.split(',').map((x) => x.trim()).filter(Boolean));
    canales = canales.filter((c) => set.has(c.id));
  }
  if (fGroup) canales = canales.filter((c) => c.group.toLowerCase().includes(fGroup.toLowerCase()));
  if (fName) canales = canales.filter((c) => c.name.toLowerCase().includes(fName.toLowerCase()));
  if (!fIds && !tomarTodo && fPerfil) {
    canales = canales.filter((c) => perfilPara(c.name, c.group) === fPerfil);
  }

  // normalizacion determinista: por perfil desc (P0 primero) y luego por id
  const ORDEN = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
  canales = canales
    .map((c) => ({ ...c, perfil: perfilPara(c.name, c.group) }))
    .sort((a, b) => {
      const d = (ORDEN[a.perfil] ?? 9) - (ORDEN[b.perfil] ?? 9);
      if (d !== 0) return d;
      const na = Number(a.id), nb = Number(b.id);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, max);

  if (!canales.length) {
    console.error('  ERROR: la seleccion no dejo canales (revisa --profile/--group/--ids)');
    return 2;
  }

  const norm = canales.map((c) => ({ id: String(c.id), name: String(c.name).replace(/[\r\n,]/g, ' ').trim(), logo: c.logo, group: c.group, perfil: c.perfil }));
  const h = huella(norm);

  const out = [];
  out.push('#EXTM3U');
  out.push('#EXT-X-APE-CONTRACT:ape-jit-quality/' + CONTRACT_VERSION);
  out.push('#EXT-X-APE-MODE:jit-on-demand');
  out.push('#EXT-X-APE-SELECTION:' + (tomarTodo ? 'ALL(checklist)' : ('profile=' + (fPerfil || 'any'))) +
    (fGroup ? ';group=' + fGroup : '') + (fName ? ';name=' + fName : '') +
    (fIds ? ';ids=' + fIds : '') + ';max=' + max);
  out.push('#EXT-X-APE-NOTE:' + canales.length + ' de ' + total +
    ' canales · el JIT arranca al abrir uno de estos y solo uno a la vez');
  out.push('#EXT-X-APE-RESOLVER:' + BASE + '/jit/resolve');
  for (const c of norm) {
    const k = sello(c.id, c.perfil);
    const q = '/jit/resolve?channel=' + encodeURIComponent(c.id) +
              '&p=' + encodeURIComponent(c.perfil) + '&k=' + k;
    const logo = c.logo ? ' tvg-logo="' + c.logo.replace(/"/g, '') + '"' : '';
    out.push('#EXTINF:-1 tvg-id="' + c.id + '" tvg-name="' + c.name + '"' + logo +
             ' group-title="' + c.group + '" ape-profile="' + c.perfil + '",' + c.name);
    out.push('#EXT-X-APE-PROFILE:' + c.perfil);
    out.push(BASE + q);
  }
  const salida = out.join('\n') + '\n';
  const salidaHash = crypto.createHash('sha256').update(salida).digest('hex');
  const conteo = norm.reduce((a, c) => (a[c.perfil] = (a[c.perfil] || 0) + 1, a), {});

  console.log('  origen    : ' + lista + '  (' + total + ' canales)');
  console.log('  seleccion : ' + (tomarTodo ? 'ALL (todos los de la lista)' : ('perfil=' + (fPerfil || 'any'))) +
    (fGroup ? ' group~"' + fGroup + '"' : '') + (fName ? ' name~"' + fName + '"' : '') +
    (fIds ? ' ids=' + fIds : '') + ' max=' + max);
  console.log('  elegidos  : ' + norm.length + '  ' +
    Object.entries(conteo).sort().map(([k, v]) => k + '=' + v).join(' '));
  console.log('  huella    : ' + h.slice(0, 24));
  console.log('  salida    : ' + salidaHash.slice(0, 24) + '  ' + Buffer.byteLength(salida) + ' B');

  if (check) {
    if (fs.existsSync(estado)) {
      const prev = JSON.parse(fs.readFileSync(estado, 'utf8'));
      console.log('  ' + (prev.salidaHash === salidaHash
        ? 'IDEMPOTENTE: salida identica, no se escribiria'
        : 'CAMBIARIA: la seleccion produce otra salida'));
    } else {
      console.log('  sin estado previo: primera construccion');
    }
    return 0;
  }

  if (fs.existsSync(estado)) {
    const prev = JSON.parse(fs.readFileSync(estado, 'utf8'));
    if (prev.salidaHash === salidaHash && fs.existsSync(destino)) {
      console.log('  SKIP: salida identica, no se toca disco');
      return 0;
    }
  }
  const tmp = destino + '.tmp';
  fs.writeFileSync(tmp, salida);
  fs.renameSync(tmp, destino);
  fs.writeFileSync(estado, JSON.stringify({
    contract: CONTRACT_VERSION, mode: 'jit-on-demand', source: path.basename(lista),
    selection: { all: tomarTodo, profile: fPerfil, group: fGroup, name: fName, ids: fIds, max },
    channels: norm.length, total, huella: h, salidaHash,
    bytes: Buffer.byteLength(salida), perfiles: conteo, at: new Date().toISOString(),
  }, null, 2));
  console.log('  escrito   : ' + destino);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { parseLista, perfilPara, huella, CONTRACT_VERSION };
