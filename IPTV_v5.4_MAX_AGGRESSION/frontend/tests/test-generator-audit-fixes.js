#!/usr/bin/env node
/**
 * Suite de regresión — AUDITORÍA DE GENERADORES M3U8 (IPTV Navigator PRO v5.4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un alcance por suite:
 *   A1. El HUD deja de inventar métricas: sin medición muestra "—" y con medición
 *       usa los números reales que le pasa el generador (nunca current × 63/38/29/133).
 *   A2. La resolución de perfiles NO se sustituye: la matriz sigue siendo tolerante
 *       con los ids "*.5" (P0.5 … P5.5) y no se les fuerza la base dentro del
 *       generador por canal. (Se midió: forzarlos rompía el contrato LAB en 2 suites.)
 *   A3. El master playlist no emite #EXT-X-KEY (sólo válido en media playlists);
 *       la etiqueta propia es #EXT-X-APE-KEY y #EXT-X-SESSION-KEY se conserva.
 *   A4. Ciclo de vida de IndexedDB (ANLE y db-manager): single-flight, detección de
 *       conexión muerta y reapertura; el refresh de ANLE no deja promesas rechazadas.
 *   A5. El arranque (index-v4.html) sigue compilando y sus scripts inline son válidos.
 *   A6. Orden RFC 8216 §4.3.4.2: ningún tag (#EXTSHIMOTT incluido) se cuela entre
 *       #EXT-X-STREAM-INF y la URI de su variante (era la violación nº1 de la lista
 *       de 22.721 canales: 0 STREAM-INF seguidos de URI, 22.721 seguidos de tag).
 *   A7. Contador por servidor: getFilteredChannels() (de donde salen la tabla, las
 *       exportaciones y los generadores) respeta el servidor elegido. Antes partía
 *       siempre de channelsMaster, así que con dos servidores salía el mismo total
 *       para los dos. Sin selección el resultado sigue siendo el de siempre.
 *
 * No usa red, no abre IndexedDB real, no imprime URLs ni listas privadas.
 * Uso:  node tests/test-generator-audit-fixes.js
 * Salida: PASS/FAIL por comprobación + resumen; exit code 1 si hay FAIL.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FE = path.join(__dirname, '..');
const F_HUD = path.join(FE, 'js', 'ape-v9', 'hud-typed-arrays.js');
const F_GEN = path.join(FE, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const F_ANLE = path.join(FE, 'js', 'ape-anle', 'anle-dictionary.js');
const F_DBM = path.join(FE, 'core', 'db-manager.js');
const F_HTML = path.join(FE, 'index-v4.html');

const read = (p) => fs.readFileSync(p, 'utf8');
const count = (hay, needle) => hay.split(needle).length - 1;

const rows = [];
let pass = 0;
let fail = 0;

function check(name, fn) {
  try {
    const r = fn();
    if (r === true || r === undefined) {
      pass++;
      rows.push(['PASS', name, '']);
    } else {
      fail++;
      rows.push(['FAIL', name, String(r)]);
    }
  } catch (e) {
    fail++;
    rows.push(['FAIL', name, (e && e.message) || String(e)]);
  }
}

/** Devuelve el cuerpo entre llaves que empieza en la primera "{" tras startIdx. */
function sliceBody(src, startIdx) {
  const i = src.indexOf('{', startIdx);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(i + 1, j);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────── A1 · HUD medido
const hudSrc = read(F_HUD);

check('A1.1 hud: sin multiplicaciones inventadas (×133/63/38/29)', () => {
  // Se busca la ASIGNACIÓN (stats.x = current * N); el comentario que cita la
  // fórmula antigua no cuenta como defecto.
  const bad = ['this.stats.extvlcopt = current *', 'this.stats.kodiprop = current *',
    'this.stats.extxape = current *', 'this.stats.linesTotal = current *']
    .filter((s) => hudSrc.indexOf(s) !== -1);
  if (bad.length) return 'encontrado: ' + bad.join(', ');
  return hudSrc.indexOf('= current * ') === -1 || 'queda una asignación = current * N';
});

check('A1.2 hud: updateChannel acepta la medición del generador', () => {
  return hudSrc.indexOf("updateChannel(current, channelName = '', profile = 'P3', measured = null)") !== -1
    || 'firma sin parámetro measured';
});

check('A1.3 hud: etiquetas ya no fijan cifras por canal', () => {
  const bad = ['63 líneas/canal', '38 líneas/canal', '29 líneas/canal', '133 líneas/canal', '133 LÍNEAS/CANAL']
    .filter((s) => hudSrc.indexOf(s) !== -1);
  return bad.length === 0 || 'encontrado: ' + bad.join(', ');
});

check('A1.4 hud: cabecera declara métricas medidas', () => {
  return hudSrc.indexOf('MÉTRICAS MEDIDAS') !== -1 || 'cabecera sin declaración de medición';
});

const hudEl = () => ({ textContent: '', innerHTML: '', style: {} });
function hudStub() {
  return {
    currentChannel: 0,
    totalChannels: 10,
    startTime: Date.now() - 1000,
    stats: {},
    elements: {
      bar: hudEl(), barText: hudEl(), counter: hudEl(),
      extvlcopt: hudEl(), kodiprop: hudEl(), extxape: hudEl(), lines: hudEl(),
      speed: hudEl(), time: hudEl()
    }
  };
}
const updateChannelBody = (() => {
  const at = hudSrc.indexOf('updateChannel(current, channelName');
  if (at < 0) throw new Error('updateChannel no encontrada');
  return sliceBody(hudSrc, at);
})();

check('A1.5 hud (funcional): sin medición muestra "—" y no inventa líneas', () => {
  const fn = new Function('current', 'channelName', 'profile', 'measured', updateChannelBody);
  const stub = hudStub();
  fn.call(stub, 3, 'canal-x', 'P3');
  const got = [stub.elements.extvlcopt.textContent, stub.elements.kodiprop.textContent,
    stub.elements.extxape.textContent, stub.elements.lines.textContent].join('|');
  if (got !== '—|—|—|—') return 'esperado — en los 4 contadores, obtenido: ' + got;
  if (stub.stats.linesTotal !== null) return 'linesTotal debería ser null sin medición, es ' + stub.stats.linesTotal;
  return true;
});

check('A1.6 hud (funcional): con medición usa exactamente los números medidos', () => {
  const fn = new Function('current', 'channelName', 'profile', 'measured', updateChannelBody);
  const stub = hudStub();
  fn.call(stub, 3, 'canal-x', 'P0', { lines: 10, extvlcopt: 2, kodiprop: 3, extxape: 4 });
  if (stub.stats.linesTotal !== 10) return 'linesTotal esperado 10 (no 1330), obtenido ' + stub.stats.linesTotal;
  if (stub.elements.lines.textContent !== (10).toLocaleString()) return 'texto de líneas: ' + stub.elements.lines.textContent;
  if (stub.elements.extvlcopt.textContent !== '2') return 'extvlcopt: ' + stub.elements.extvlcopt.textContent;
  if (stub.elements.kodiprop.textContent !== '3') return 'kodiprop: ' + stub.elements.kodiprop.textContent;
  if (stub.elements.extxape.textContent !== '4') return 'extxape: ' + stub.elements.extxape.textContent;
  return true;
});

check('A1.7 generador: alimenta el HUD con el acumulador medido', () => {
  const genSrc = read(F_GEN);
  if (count(genSrc, '_hudAcc') < 6) return '_hudAcc aparece ' + count(genSrc, '_hudAcc') + ' veces (esperado >= 6)';
  if (genSrc.indexOf('updateChannel(index + 1, channel.name, profile, _hudAcc)') === -1) {
    return 'la llamada al HUD no pasa la medición';
  }
  return true;
});

// ───────────────────────────────── A2 · perfiles: NO se sustituye la resolución
const genSrc = read(F_GEN);

check('A2.1 generador: la matriz de perfiles sigue siendo la única autoridad', () => {
  // Medido en este HEAD: añadir un resolutor propio que colapse P0.5→P0 rompía el
  // contrato LAB (ape-exthttp-critical-headers y ape-upscale-emission pasaban de
  // verde a rojo). Esta comprobación impide reintroducirlo sin volver a medir.
  const n = count(genSrc, '_resolveApeProfileId(');
  return n === 0 || 'aparece un resolutor local de perfiles (' + n + ' usos)';
});

check('A2.2 generador: las consultas a la matriz siguen siendo tolerantes', () => {
  if (genSrc.indexOf("typeof APE_PROFILE_MATRIX !== 'undefined'") === -1) {
    return 'se perdió la guarda tolerante de la matriz';
  }
  // El ladder sale vacío con un perfil desconocido en vez de lanzar.
  if (genSrc.indexOf('if (!p) return [];') === -1) return 'el ladder perdió su salida vacía';
  return true;
});

// ─────────────────────────────────────────────── A3 · tags de master playlist
check('A3.1 master: no se emite #EXT-X-KEY (solo válido en media playlists)', () => {
  const n = count(genSrc, '#EXT-X-KEY:METHOD=NONE');
  return n === 0 || 'quedan ' + n + ' ocurrencias de #EXT-X-KEY:METHOD=NONE';
});

check('A3.2 master: se emite #EXT-X-APE-KEY (etiqueta propia) 3 veces', () => {
  const n = count(genSrc, '#EXT-X-APE-KEY:METHOD=NONE');
  return n === 3 || 'ocurrencias=' + n + ' (esperado 3)';
});

check('A3.3 master: #EXT-X-SESSION-KEY sigue presente (etiqueta válida)', () => {
  return count(genSrc, '#EXT-X-SESSION-KEY:METHOD=NONE') >= 1 || 'se perdió la sesión de clave';
});

// ─────────────────────────────────── A4 · ciclo de vida ANLE / IndexedDB
const anleSrc = read(F_ANLE);
const dbmSrc = read(F_DBM);

check('A4.1 ANLE: detección de conexión muerta (_isAlive con transacción de prueba)', () => {
  if (anleSrc.indexOf('_isAlive()') === -1) return 'falta _isAlive';
  if (anleSrc.indexOf("this._db.transaction('aliases', 'readonly')") === -1) return 'la prueba de vida no abre transacción';
  return true;
});

check('A4.2 ANLE: open() es single-flight y reabre tras cierre', () => {
  if (anleSrc.indexOf('if (this._opening) return this._opening;') === -1) return 'sin single-flight';
  if (anleSrc.indexOf('if (this._isAlive()) return this._db;') === -1) return 'open() no comprueba vida';
  return true;
});

check('A4.3 ANLE: suelta la conexión en versionchange/close', () => {
  if (anleSrc.indexOf('onversionchange') === -1) return 'sin onversionchange';
  if (anleSrc.indexOf('_attachLifecycle') === -1) return 'sin _attachLifecycle';
  return true;
});

check('A4.4 db-manager: reabre en ready() si la conexión murió', () => {
  const at = dbmSrc.indexOf('async ready()');
  if (at < 0) return 'ready() no encontrada';
  const body = sliceBody(dbmSrc, at);
  if (!body) return 'no se pudo leer ready()';
  if (body.indexOf('_isAlive()') === -1) return 'ready() no comprueba vida';
  if (body.indexOf('this.openDB()') === -1) return 'ready() no reabre';
  return true;
});

check('A4.5 db-manager: libera _opening si la apertura falla o termina', () => {
  const n = count(dbmSrc, 'this._opening = null;');
  return n >= 3 || '_opening = null aparece ' + n + ' veces (esperado >= 3: constructor, error, éxito)';
});

// ───────────────────────────────────────────── A5 · arranque (index-v4.html)
const htmlSrc = read(F_HTML);

check('A5.1 arranque: Anti-Freeze comprueba app y app.state antes de escribir', () => {
  return htmlSrc.indexOf('window.app && window.app.state') !== -1 || 'guarda incompleta en el selector anti-freeze';
});

check('A5.2 arranque: el refresh de ANLE captura el rechazo (sin Uncaught in promise)', () => {
  if (htmlSrc.indexOf('ANLE.core.getStats()') === -1) return 'no se encontró el refresh de ANLE';
  if (htmlSrc.indexOf('}).catch(function(e) {') === -1) return 'el then() no tiene catch';
  if (htmlSrc.indexOf("act.textContent = '⏸️ reintentando'") === -1) return 'sin estado visible de reintento';
  return true;
});

check('A5.3 arranque: todos los scripts inline compilan (new Function)', () => {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  let errors = 0;
  while ((m = re.exec(htmlSrc)) !== null) {
    const code = m[1];
    if (!code.trim()) continue;
    i++;
    try {
      new Function(code); // compila, no ejecuta
    } catch (e) {
      errors++;
      if (errors === 1) rows.push(['INFO', 'A5.3 primer error de compilación', (e.message || '').slice(0, 200)]);
    }
  }
  if (i === 0) return 'no se encontró ningún script inline';
  return errors === 0 || errors + ' script(s) inline no compilan de ' + i;
});

check('A5.4 sintaxis: los 4 módulos tocados pasan `node --check`', () => {
  const bad = [];
  for (const f of [F_HUD, F_GEN, F_ANLE, F_DBM]) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
      bad.push(path.basename(f));
    }
  }
  return bad.length === 0 || 'no compilan: ' + bad.join(', ');
});

// ───────────────────────────── A6 · orden RFC 8216 (STREAM-INF pegado a su URI)
const genSrcA6 = read(F_GEN);

/** Extrae _apeAppendExtshimottTag del generador real y la devuelve invocable. */
function extractorTag() {
  const idx = genSrcA6.indexOf('function _apeAppendExtshimottTag(');
  if (idx < 0) throw new Error('no existe _apeAppendExtshimottTag en el generador');
  const body = sliceBody(genSrcA6, idx);
  if (!body) throw new Error('cuerpo de _apeAppendExtshimottTag no delimitado');
  const factory = new Function('_apeShimottFromExthttp', '_apeShimottPayload', 'window',
    'return function _apeAppendExtshimottTag(text, channel, profile, probe, cfg, index, ua, rf) {'
    + body + '};');
  return factory(function () { return null; }, function () { return { ver: 1 }; }, undefined);
}

check('A6.1 generador: #EXTSHIMOTT no se cuela entre STREAM-INF y su URI', () => {
  const fn = extractorTag();
  const bloque = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="a" tvg-name="A",Canal',
    '#EXTVLCOPT:http-user-agent=VLC',
    '#EXT-X-APE-4K-PREMIUM:DECLARED_ONLY;EXECUTED=0',
    '#EXT-X-STREAM-INF:BANDWIDTH=25000000,RESOLUTION=5760x3240',
    'https://example.invalid/ejemplo/1.m3u8?u=a'
  ].join('\n');
  const out = fn(bloque, {}, 'P3', null, {}, 0, 'UA', 'https://example.invalid/').split('\n');
  const si = out.findIndex((l) => l.indexOf('#EXT-X-STREAM-INF:') === 0);
  if (si < 0) return 'la salida perdió el #EXT-X-STREAM-INF';
  if (out[si + 1].charAt(0) === '#') return 'tras STREAM-INF viene un tag: ' + out[si + 1].slice(0, 48);
  if (out[si - 1] !== undefined && /^#EXTSHIMOTT:/.test(out[si - 1]) === false) {
    return 'EXTSHIMOTT no quedó antes del STREAM-INF';
  }
  return out.filter((l) => l && l.charAt(0) !== '#').length === 1 || 'la salida no tiene exactamente 1 URI';
});

check('A6.2 generador: sin STREAM-INF el tag sigue justo antes de la URI', () => {
  const fn = extractorTag();
  const bloque = '#EXTM3U\n#EXTINF:-1,Canal\nhttps://example.invalid/ejemplo/2.m3u8?u=b';
  const out = fn(bloque, {}, 'P3', null, {}, 0, 'UA', '').split('\n');
  return (out.length === 4 && /^#EXTSHIMOTT:/.test(out[2]) && out[3].charAt(0) !== '#')
    || 'orden inesperado: ' + JSON.stringify(out.slice(1).map((l) => l.slice(0, 24)));
});

check('A6.3 generador: la inserción ya no apunta al hueco STREAM-INF→URI (uriIdx)', () => {
  if (genSrcA6.indexOf('lines.splice(uriIdx, 0, tag)') !== -1) return 'vuelve a insertar en uriIdx';
  return genSrcA6.indexOf('lines.splice(atTag, 0, tag)') !== -1 || 'no se encuentra la inserción corregida';
});

// ─────────────────────────────────────────── A7 · Contador por servidor
const F_APP = path.join(FE, 'app.js');
const appSrcA7 = read(F_APP);

function extractGetFilteredChannels() {
  const idx = appSrcA7.indexOf('    getFilteredChannels()');
  if (idx < 0) throw new Error('no existe getFilteredChannels en app.js');
  const body = sliceBody(appSrcA7, idx);
  if (!body) throw new Error('cuerpo de getFilteredChannels no delimitado');
  return new Function('console', 'return function getFilteredChannels() {' + body + '};')(console);
}

function fakeApp(filterServer) {
  const mk = (sid, n) => Array.from({ length: n }, (_, i) => ({
    serverId: sid,
    name: sid + '-' + i,
    group: 'G' + i,
    codec: 'H264',
    language: 'ES',
    bitrateTierCode: 'FHD'
  }));
  return {
    state: {
      channelsMaster: [...mk('srv_A', 3), ...mk('srv_B', 2)],
      searchQuery: '',
      filterTier: 'ALL',
      filterCodec: 'ALL',
      filterLanguage: 'ALL',
      filterServer: filterServer,
      activeFilter: null,
      advancedFilters: null
    },
    filterEngine: null
  };
}

check('A7.1 app: con servidor elegido sólo salen sus canales (A=3, B=2)', () => {
  const fn = extractGetFilteredChannels();
  const a = fn.call(fakeApp('srv_A')).length;
  const b = fn.call(fakeApp('srv_B')).length;
  if (a !== 3 || b !== 2) return `A=${a} B=${b} (deberían ser 3 y 2)`;
  return true;
});

check('A7.2 app: sin selección el resultado no cambia (5 canales, compatibilidad)', () => {
  const fn = extractGetFilteredChannels();
  const total = fn.call(fakeApp(null)).length;
  return total === 5 || 'devuelve ' + total + ' en vez de 5';
});

check('A7.3 app: el clic en el servidor guarda la selección en el estado', () => {
  const i = appSrcA7.indexOf('    filterByServerAndQuality(serverId, quality) {');
  if (i < 0) throw new Error('no existe filterByServerAndQuality');
  const body = sliceBody(appSrcA7, i) || '';
  if (body.indexOf('this.state.filterServer = serverId') === -1) return 'no se guarda filterServer';
  return body.indexOf("quality === 'ALL' && this.state.filterServer === serverId") !== -1
    || 'no hay forma de volver a "todos los servidores"';
});

check('A7.4 app: borrar el servidor filtrado suelta el filtro', () => {
  const i = appSrcA7.indexOf('    async removeServer(serverId) {');
  if (i < 0) throw new Error('no existe removeServer');
  const body = sliceBody(appSrcA7, i) || '';
  return body.indexOf('this.state.filterServer === serverId') !== -1
    || 'removeServer no limpia filterServer (la vista se quedaría en 0 canales)';
});

// ──────────────────────────────────────────────────────────────── Salida
for (const row of rows) {
  console.log(row[0] + '  ' + row[1] + (row[2] ? '  → ' + row[2] : ''));
}
console.log('');
console.log('RESUMEN  PASS=' + pass + '  FAIL=' + fail + '  TOTAL=' + (pass + fail));
if (fail > 0) {
  console.log('RESULTADO: FAIL');
  process.exit(1);
}
console.log('RESULTADO: PASS');
