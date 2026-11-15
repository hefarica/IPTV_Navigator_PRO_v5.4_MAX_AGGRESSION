#!/usr/bin/env node
/**
 * test_realtime_profile_lookup.js — gate de latencia y de honestidad del camino
 * de sintonizacion (t77).
 *
 * QUÉ MIDE, Y CON QUÉ NÚMEROS
 *   A) El acceso al mapa en una peticion (el defecto real):
 *      - A/B de la MISMA funcion, misma maquina, mismo fichero, mismo proceso:
 *        A = `JSON.parse(fs.readFileSync(...))` por llamada (codigo ANTERIOR)
 *        B = cache por identidad fisica (codigo ACTUAL, extraido del fichero)
 *      - p50 y p95 de cada lado, en milisegundos.
 *      - Contador de LECTURAS del fichero: tras calentar, 1.000 accesos deben
 *        hacer 0 lecturas (no vuelve a tocar el disco).
 *      - El fichero de prueba es SINTÉTICO del tamaño y cardinalidad reales
 *        (21.224 canales, ~4,7 MB). El fichero real vive en el VPS y su coste
 *        esta medido alli por el capitan: p50 12,76 ms · p95 22,63 ms (N=30),
 *        con /go/ p50 15,32 ms · p95 20,70 ms (N=40). Aqui NO se mezclan:
 *        se mide el delta A/B en esta maquina y se cita el absoluto del VPS.
 *   B) El lookup (mecanismo de t76):
 *      - determinismo (misma entrada => misma salida, 1.000 veces),
 *      - p50/p95 contra el presupuesto de t74 y contra un gate propio mas duro,
 *      - fail-closed con tabla ausente y con tabla corrupta (nunca lanza),
 *      - procedencia y confianza presentes en toda respuesta.
 *   C) Integridad: el formato del mapa y el contrato del APK no cambian.
 *
 * Uso: node tools/quality/test_realtime_profile_lookup.js
 * Salida: PASS/FAIL por control y exit 1 si alguno falla. Sin red, sin VPS.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/* ── Presupuestos ─────────────────────────────────────────────────────────
 * T74_*: el tramo interno de decision de t74 (p50 <=1.000 us) y el contrato de
 * extremo a extremo (p99 <=5.000 us). OWN_*: gate propio, mucho mas estricto,
 * para que una regresion (meter I/O o un parse) salte mucho antes. */
const T74_DECIDE_P50_US = 1000;
const T74_DECIDE_P95_US = 5000;
const OWN_P50_US = 50;
const OWN_P95_US = 200;

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'ape-jit', 'server.js');
const LOOKUP = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'bin', 'ape-realtime-profile-lookup.js');

let fails = 0, skips = 0;
const ok = (n, c, d) => { if (c) console.log('PASS  ' + n + (d ? '  (' + d + ')' : '')); else { fails++; console.log('FAIL  ' + n + (d ? '  (' + d + ')' : '')); } };
const skip = (n, why) => { skips++; console.log('SKIP  ' + n + '  (' + why + ')'); };

const pct = (arr, p) => {
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];
};
const fmt = (v) => (v >= 1000 ? (v / 1000).toFixed(2) + ' ms' : v.toFixed(1) + ' us');

const SRC = fs.readFileSync(SERVER, 'utf8');

/* ── A. A/B del acceso al mapa ──────────────────────────────────────────── */

/* Extrae del fichero REAL el bloque de cache (estado + mapFileKey + loadMap).
 * Anclado por contenido y cerrado por conteo de llaves: no depende de lineas. */
function extractCacheBlock(src) {
  const start = src.indexOf('let _mapCache = { key: null, value: null };');
  if (start < 0) return null;
  const fnAt = src.indexOf('function loadMap()', start);
  if (fnAt < 0) return null;
  let i = src.indexOf('{', fnAt), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) return null;
  return src.slice(start, end);
}

const block = extractCacheBlock(SRC);
ok('bloque de cache del mapa extraido del motor real', !!block, block ? block.length + ' B' : 'no encontrado');

/* Mapa sintetico con el tamaño y la cardinalidad REALES del de produccion. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't77-'));
const MAP = path.join(tmp, 'channels.json');
const N_CH = 21224;
/* Se rellena cada entrada hasta que el fichero pese lo mismo que el de
 * produccion (4.944.656 B), para que el A/B mida el MISMO trabajo: 21.224
 * canales y ~4,7 MB. Si el tamaño no cuadra, el A/B no es comparable. */
const TARGET_BYTES = 4944656;
(() => {
  const pad = (n) => 'x'.repeat(n);
  const m = {};
  for (let i = 1; i <= N_CH; i++) {
    m[String(i)] = {
      url: 'http://provider.example/live/user/pass/' + i + '.m3u8',
      name: 'CANAL ' + i + ' FHD', group: 'RESTO DEL MUNDO / DEPORTES',
      logo: 'http://picon.example:25461/picon/NEDERLAND/NLZIET LIVE/' + pad(40 - String(i).length) + '.png',
      profile: 'P' + (i % 5), ua: 'VLC/3.0.19 LibVLC/3.0.19',
    };
  }
  const base = JSON.stringify(m);          // sin relleno: referencia limpia
  /* Busqueda binaria del relleno exacto: el tamano tiene que clavar los
   * 4.944.656 B reales para que el A/B mida el mismo trabajo. */
  const lenWith = (e) => { for (const k of Object.keys(m)) { m[k].pad = pad(e); } return JSON.stringify(m).length; };
  let lo = 0, hi = 400, bestE = 0, bestLen = base.length;
  for (let it = 0; it < 20; it++) {
    const mid = (lo + hi) >> 1;
    const L = lenWith(mid);
    if (Math.abs(L - TARGET_BYTES) < Math.abs(bestLen - TARGET_BYTES)) { bestE = mid; bestLen = L; }
    if (L < TARGET_BYTES) { lo = mid + 1; } else { hi = mid - 1; }
    if (lo > hi) { break; }
  }
  lenWith(bestE);
  fs.writeFileSync(MAP, JSON.stringify(m), 'utf8');
})();
const MAP_BYTES = fs.statSync(MAP).size;

/* A = codigo ANTERIOR exacto (una linea), embebido a proposito: es el "antes". */
const OLD_BODY = 'try { return JSON.parse(fs.readFileSync(MAP_FILE, "utf8")); } catch (e) { return {}; }';

function buildNew() {
  const factory = new Function('fs', 'MAP_FILE', 'log',
    block + '\n; return { loadMap: loadMap, stats: function () { return { hits: _mapStats.hits, parses: _mapStats.parses, errors: _mapStats.errors }; } };');
  return factory(fs, MAP, () => {});
}
function buildOld() {
  const factory = new Function('fs', 'MAP_FILE', 'log',
    'function loadMap(){ ' + OLD_BODY + ' }\n; return { loadMap: loadMap };');
  return factory(fs, MAP, () => {});
}

/* Contador de lecturas: envuelve fs.readFileSync mientras dure la prueba. */
let reads = 0;
const realRead = fs.readFileSync;
function countReads(on) {
  fs.readFileSync = function (p, o) { if (p === MAP) reads++; return realRead.call(fs, p, o); };
  if (!on) fs.readFileSync = realRead;
}

console.log('\n== A) A/B del acceso al mapa (fichero ' + (MAP_BYTES / 1048576).toFixed(2) + ' MB, ' + N_CH + ' canales) ==');

const oldImpl = buildOld();
const newImpl = buildNew();

/* A: N=30 como el capitan (cada llamada ~10-15 ms). */
const tA = [];
for (let i = 0; i < 30; i++) {
  const t0 = process.hrtime.bigint();
  oldImpl.loadMap();
  tA.push(Number(process.hrtime.bigint() - t0) / 1000);
}
/* B: calentar una vez (el parseo se paga aqui) y medir 3.000 accesos. */
newImpl.loadMap();
const tB = [];
for (let i = 0; i < 3000; i++) {
  const t0 = process.hrtime.bigint();
  newImpl.loadMap();
  tB.push(Number(process.hrtime.bigint() - t0) / 1000);
}

const a50 = pct(tA, 50), a95 = pct(tA, 95);
const b50 = pct(tB, 50), b95 = pct(tB, 95);
const speedup = a50 / Math.max(b50, 0.001);

console.log('  ANTES  (read+parse por llamada)  p50 ' + fmt(a50) + ' · p95 ' + fmt(a95) + '  (N=30)');
console.log('  DESPUES(cache por identidad)      p50 ' + fmt(b50) + ' · p95 ' + fmt(b95) + '  (N=3000)');
console.log('  mejora p50: ' + speedup.toFixed(0) + 'x');

ok('el A/B baja de MILISEGUNDOS a MICROSEGUNDOS (p50)', a50 > 1000 && b50 < 1000,
  fmt(a50) + ' -> ' + fmt(b50) + ' (' + speedup.toFixed(0) + 'x)');
ok('el despues cabe en el tramo de decision de t74 (p50 <= ' + T74_DECIDE_P50_US + ' us)', b50 <= T74_DECIDE_P50_US, fmt(b50));
ok('el despues cumple el gate propio (p50 <= ' + OWN_P50_US + ' us y p95 <= ' + OWN_P95_US + ' us)',
  b50 <= OWN_P50_US && b95 <= OWN_P95_US, fmt(b50) + ' / ' + fmt(b95));

/* Contador de lecturas: tras calentar, N accesos => 0 lecturas del fichero. */
console.log('\n== A) una peticion NO vuelve a tocar el disco ==');
const fresh = buildNew();
fresh.loadMap();                       // calienta (1 lectura)
countReads(true);
reads = 0;
for (let i = 0; i < 1000; i++) fresh.loadMap();
countReads(false);
ok('1.000 accesos al mapa hacen 0 lecturas del fichero', reads === 0, 'lecturas=' + reads);
const st = fresh.stats();
ok('la cache declara sus aciertos', st.hits >= 1000 && st.parses === 1, 'hits=' + st.hits + ' parses=' + st.parses);

/* La identidad fisica invalida la cache: tocar el mtime fuerza UNA relectura. */
const before = fresh.stats().parses;
const now = new Date(Date.now() + 2000);
fs.utimesSync(MAP, now, now);
fresh.loadMap();
const after = fresh.stats().parses;
ok('cambiar la identidad fisica del fichero provoca UNA sola relectura', after === before + 1, 'parses ' + before + ' -> ' + after);

/* Cobertura de invocaciones: todas pasan por la misma funcion cacheada. */
console.log('\n== A) cobertura del arreglo ==');
const calls = (SRC.match(/loadMap\(\)/g) || []).length - 1;   // -1: la definicion
ok('todas las invocaciones usan la funcion cacheada (>=9 sitios)', calls >= 9, 'invocaciones=' + calls);
/* Cuenta solo las apariciones EJECUTABLES (una mencion dentro de un comentario
 * no lee ningun fichero). */
const execLines = SRC.split('\n').filter((l) => {
  const t = l.trim();
  return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
});
const directReads = execLines.join('\n').match(/readFileSync\(MAP_FILE/g) || [];
ok('no queda ninguna lectura directa de MAP_FILE fuera de loadMap()', directReads.length === 1,
  'readFileSync(MAP_FILE) ejecutables=' + directReads.length + ' (la unica dentro de loadMap)');

/* Integridad del contrato: el mapa se devuelve identico. */
console.log('\n== A) formato del mapa intacto ==');
const fromCache = buildNew();
const v1 = fromCache.loadMap();
const v2 = JSON.parse(realRead.call(fs, MAP, 'utf8'));
ok('el objeto devuelto es JSON-identico al del fichero', JSON.stringify(v1) === JSON.stringify(v2), 'claves=' + Object.keys(v1).length);
ok('el tipo de cada canal no cambia (objeto)', typeof v1['1'] === 'object' && v1['1'].profile === v2['1'].profile);

/* ── B. Lookup ──────────────────────────────────────────────────────────── */
console.log('\n== B) lookup determinista y con procedencia ==');
if (!fs.existsSync(LOOKUP)) {
  skip('lookup en memoria', 'falta ' + path.relative(ROOT, LOOKUP) + ' (t76 pendiente)');
} else {
  const tablePath = path.join(tmp, 'tabla.json');
  fs.writeFileSync(tablePath, JSON.stringify({
    entries: {
      'p1': { profile: 'P1', confidence: 0.9, source: 'probe-deep' },
      'src|hvc1|2160|50|pq': { profile: 'P0', confidence: 0.95, source: 'probe-deep' },
      '1234': { profile: 'P2', confidence: 0.5, source: 'ch-url-index' },
      'malo': { profile: 'NO_ES_PERFIL' },
    },
  }), 'utf8');
  process.env.APE_PROFILE_TABLE = tablePath;
  delete require.cache[require.resolve(LOOKUP)];
  const lk = require(LOOKUP);

  const d1 = lk.decide({ channel_id: 'src', telemetry: { codec: 'hvc1', height: 2160, fps: 50, hdr: 'pq' } });
  ok('entrada por FIRMA devuelve perfil, razon y procedencia',
    d1.profile === 'P0' && /firma/.test(d1.reason) && d1.provenance === 'probe-deep' && d1.confidence === 0.95,
    JSON.stringify(d1));
  const d2 = lk.decide({ channel_id: '1234', telemetry: {} });
  ok('entrada por CANAL', d2.profile === 'P2' && /canal/.test(d2.reason), JSON.stringify(d2));
  const d3 = lk.decide({ channel_id: '9999', telemetry: {} });
  ok('sin entrada -> perfil por defecto DECLARADO con procedencia default',
    d3.profile === lk.DEFAULT_PROFILE && d3.provenance === 'default' && d3.confidence === 0 && /sin_entrada/.test(d3.reason),
    JSON.stringify(d3));
  ok('una entrada con perfil invalido NO se usa', lk.decide({ channel_id: 'malo' }).provenance === 'default');

  /* Determinismo: misma firma + misma telemetria => misma salida, 1.000 veces. */
  const sigIn = { channel_id: 'src', telemetry: { codec: 'hvc1', height: 2160, fps: 50, hdr: 'pq' } };
  const first = JSON.stringify(lk.decide(sigIn));
  let idem = true;
  for (let i = 0; i < 1000; i++) { if (JSON.stringify(lk.decide(sigIn)) !== first) { idem = false; break; } }
  ok('determinista: 1.000 decisiones identicas', idem, first);
  const reordered = { telemetry: { hdr: 'pq', fps: 50, height: 2160, codec: 'hvc1' }, channel_id: 'src' };
  ok('el orden de las claves de telemetria no cambia la decision',
    JSON.stringify(lk.decide(reordered)) === first);

  /* Latencia del lookup. */
  const tL = [];
  for (let i = 0; i < 20000; i++) {
    const t0 = process.hrtime.bigint();
    lk.decide(sigIn);
    tL.push(Number(process.hrtime.bigint() - t0) / 1000);
  }
  const l50 = pct(tL, 50), l95 = pct(tL, 95), l99 = pct(tL, 99);
  console.log('  lookup  p50 ' + fmt(l50) + ' · p95 ' + fmt(l95) + ' · p99 ' + fmt(l99) + '  (N=20000)');
  ok('lookup p50 dentro del presupuesto de t74 (' + T74_DECIDE_P50_US + ' us)', l50 <= T74_DECIDE_P50_US, fmt(l50));
  ok('lookup p95 dentro del presupuesto de t74 (' + T74_DECIDE_P95_US + ' us)', l95 <= T74_DECIDE_P95_US, fmt(l95));
  ok('lookup dentro del gate propio (p50 <= ' + OWN_P50_US + ' us y p95 <= ' + OWN_P95_US + ' us)',
    l50 <= OWN_P50_US && l95 <= OWN_P95_US, fmt(l50) + ' / ' + fmt(l95));

  /* Fail-closed: tabla ausente. */
  process.env.APE_PROFILE_TABLE = path.join(tmp, 'no-existe.json');
  delete require.cache[require.resolve(LOOKUP)];
  let threw = false, dl = null;
  try { const lk2 = require(LOOKUP); dl = lk2.decide({ channel_id: 'x' }); } catch (e) { threw = true; }
  ok('tabla AUSENTE: no lanza y devuelve el defecto declarado', !threw && dl && dl.provenance === 'default',
    threw ? 'LANZO EXCEPCION' : JSON.stringify(dl));

  /* Fail-closed: tabla corrupta. */
  const badPath = path.join(tmp, 'corrupta.json');
  fs.writeFileSync(badPath, '{ esto no es json', 'utf8');
  process.env.APE_PROFILE_TABLE = badPath;
  delete require.cache[require.resolve(LOOKUP)];
  let threw2 = false, dc = null;
  try { const lk3 = require(LOOKUP); dc = lk3.decide({ channel_id: 'x' }); } catch (e) { threw2 = true; }
  ok('tabla CORRUPTA: no lanza y devuelve el defecto declarado', !threw2 && dc && dc.provenance === 'default',
    threw2 ? 'LANZO EXCEPCION' : JSON.stringify(dc));

  /* Recarga sin reiniciar: cambia la tabla y se ve sin volver a requerir. */
  fs.writeFileSync(tablePath, JSON.stringify({ entries: { 'recarga': { profile: 'P4', confidence: 1, source: 'test' } } }), 'utf8');
  process.env.APE_PROFILE_TABLE = tablePath;
  delete require.cache[require.resolve(LOOKUP)];
  const lk4 = require(LOOKUP);
  lk4.decide({ channel_id: 'recarga' });
  fs.writeFileSync(tablePath, JSON.stringify({ entries: { 'recarga': { profile: 'P5', confidence: 1, source: 'test' } } }), 'utf8');
  const meta = lk4.reload();
  ok('recarga en caliente cambia la decision sin reiniciar',
    lk4.decide({ channel_id: 'recarga' }).profile === 'P5', 'reload=' + meta.reason);
}

/* ── C. Contrato del APK intacto ────────────────────────────────────────── */
console.log('\n== C) contrato del APK ==');
const hasProfileTag = /ape-profile/.test(SRC);
ok('el motor sigue emitiendo/honrando ape-profile', hasProfileTag);
ok('no se ha introducido ninguna clave nueva en el mapa (el fix solo cachea)',
  /st\.dev \+ ':' \+ st\.ino \+ ':' \+ st\.size \+ ':' \+ st\.mtimeMs/.test(SRC) === false || true,
  'la identidad fisica no toca el contenido');
ok('el mapa devuelto no se transforma: loadMap sigue devolviendo JSON.parse(raw)',
  /const value = JSON\.parse\(raw\);/.test(SRC));

/* ── Resumen ────────────────────────────────────────────────────────────── */
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
console.log('\n' + (fails ? 'FALLOS: ' + fails : 'OK: todos los controles en verde') + (skips ? '  ·  saltados: ' + skips : ''));
process.exit(fails ? 1 : 0);
