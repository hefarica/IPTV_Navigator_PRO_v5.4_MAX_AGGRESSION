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

// ───────────────────────────── A8 · Identidad de servidor (host + usuario)
// Defecto medido el 2026-11-24: la app decidía "es el mismo servidor" mirando
// SÓLO la URL base. Dos cuentas del mismo panel (mismo host, otro usuario)
// caían en un único id, así que sus canales se mezclaban y las dos acababan
// enseñando el mismo total. Aquí se prueba con las funciones REALES de app.js.
const appSrcA8 = read(path.join(FE, 'app.js'));

function methodBody(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('no existe ' + sig.trim());
  const body = sliceBody(src, i);
  if (!body) throw new Error('cuerpo no delimitado: ' + sig.trim());
  return body;
}

function serverIdentityFns() {
  return new Function(
    'return {' +
    '_serverHostKey(srvOrUrl){' + methodBody(appSrcA8, '    _serverHostKey(srvOrUrl) {') + '},' +
    '_serverUserKey(srvOrUrl){' + methodBody(appSrcA8, '    _serverUserKey(srvOrUrl) {') + '},' +
    '_isSameServer(a,b){' + methodBody(appSrcA8, '    _isSameServer(a, b) {') + '},' +
    '_findActiveServerByHost(host,user){' + methodBody(appSrcA8, '    _findActiveServerByHost(host, user) {') + '}' +
    '};'
  )();
}

check('A8.1 app: mismo host + distinto usuario NO son el mismo servidor', () => {
  const f = serverIdentityFns();
  const a = { baseUrl: 'http://panel.example:8080', username: 'cuentaA' };
  const b = { baseUrl: 'http://panel.example:8080', username: 'cuentaB' };
  if (f._isSameServer(a, b) !== false) return 'los confunde (era el defecto)';
  return true;
});

check('A8.2 app: mismo host + mismo usuario SÍ es el mismo (reconexión)', () => {
  const f = serverIdentityFns();
  const a = { baseUrl: 'http://panel.example:8080', username: 'cuentaA' };
  const b = { baseUrl: 'http://panel.example:8080/player_api.php', username: 'CuentaA ' };
  return f._isSameServer(a, b) === true || 'no reconoce la reconexión';
});

check('A8.3 app: distinto host no son el mismo; sin usuario se compara sólo el host (compatibilidad)', () => {
  const f = serverIdentityFns();
  if (f._isSameServer({ baseUrl: 'http://a.example', username: 'u' }, { baseUrl: 'http://b.example', username: 'u' }) !== false) {
    return 'mezcla hosts distintos';
  }
  return f._isSameServer({ baseUrl: 'http://a.example' }, { baseUrl: 'http://a.example' }) === true
    || 'rompe la compatibilidad cuando no hay usuario guardado';
});

check('A8.4 app: entre dos cuentas del mismo panel elige la del usuario pedido', () => {
  const f = serverIdentityFns();
  const active = [
    { id: 'srv_u1', baseUrl: 'http://panel.example:8080', username: 'cuentaA', channelCount: 3 },
    { id: 'srv_u2', baseUrl: 'http://panel.example:8080', username: 'cuentaB', channelCount: 2 }
  ];
  const ctx = Object.assign({ state: { activeServers: active } }, f);
  const hitA = ctx._findActiveServerByHost('http://panel.example:8080', 'cuentaA');
  const hitB = ctx._findActiveServerByHost('http://panel.example:8080', 'cuentaB');
  if (!hitA || hitA.id !== 'srv_u1') return 'la cuenta A no encuentra su servidor';
  if (!hitB || hitB.id !== 'srv_u2') return 'la cuenta B cae en el servidor de A (era el defecto)';
  return true;
});

check('A8.5 app: dos cuentas del mismo panel dan 3 y 2 canales, no el mismo total', () => {
  const fn = extractGetFilteredChannels();
  const mk = (sid, n) => Array.from({ length: n }, (_, i) => ({ serverId: sid, name: sid + '-' + i, group: 'G', codec: 'H264', language: 'ES', bitrateTierCode: 'FHD' }));
  const app = fakeApp(null);
  app.state.channelsMaster = [...mk('srv_u1', 3), ...mk('srv_u2', 2)];
  app.state.filterServer = 'srv_u1';
  const a = fn.call(app).length;
  app.state.filterServer = 'srv_u2';
  const b = fn.call(app).length;
  if (a !== 3 || b !== 2) return `A=${a} B=${b} (deberían ser 3 y 2)`;
  return true;
});

check('A8.6 app: ya no queda la comparación por host sola en ningún sitio', () => {
  const n = (appSrcA8.match(/srvHost === normalizedHost/g) || []).length;
  return n === 0 || 'quedan ' + n + ' comparaciones sólo por host';
});

check('A8.7 app: los dos merges de biblioteca distinguen por usuario', () => {
  const n = (appSrcA8.match(/this\._isSameServer\(s, libraryEntry\)/g) || []).length;
  return n === 2 || 'encontradas ' + n + ' (deberían ser 2: guardar servidor y guardar todos)';
});

check('A8.8 app: la lista de servidores no filtra la segunda cuenta como duplicada', () => {
  return appSrcA8.indexOf("this._serverHostKey(srv) + '|' + this._serverUserKey(srv)") !== -1
    || 'el dedup de chips sigue mirando sólo la URL';
});

check('A8.9 app: las tres comprobaciones de conexión usan la identidad nueva', () => {
  const n = (appSrcA8.match(/this\._findActiveServerByHost\(baseHost, user\)/g) || []).length;
  return n === 3 || 'encontradas ' + n + ' (conectar, reconectar y no-duplicar)';
});

// ─────────────────────── A9 · El pipeline no copia ni repite el catálogo
// Medido el 2026-11-24 con el catálogo real de la persona (28 655 canales):
// normalizado pesa ~50 MiB; copiarlo por postMessage cuesta ~210 ms (435 ms
// con 57 310). El enriquecimiento interno se lanza 3 veces por arranque, así
// que antes se pagaban 3 idas + 3 vueltas del catálogo entero, más una pasada
// del clasificador sobre TODOS los canales en cada "done", más una pasada de
// ANLE de 1 606 ms sobre canales ya procesados… para no cambiar nada.
const appSrcA9 = read(path.join(FE, 'app.js'));
const F_WORKER = path.join(FE, 'enrichment.worker.js');
const F_ANLE_CORE = path.join(FE, 'js', 'ape-anle', 'ape-anle-core.js');
const workerSrc = read(F_WORKER);

/** Ejecuta el Worker REAL en un proceso hijo y devuelve los mensajes que emitió. */
let _workerRuns = 0;
function workerMessages(sample) {
  const code = [
    "const fs=require('fs');",
    "const src=fs.readFileSync(" + JSON.stringify(F_WORKER) + ",'utf8');",
    'const sent=[];',
    'const fakeSelf={postMessage:(m)=>sent.push(m)};',
    "const quiet={log(){},warn(){},error(){},info(){},table(){}};",
    "new Function('self','setTimeout','clearTimeout','console',src)(fakeSelf,setTimeout,clearTimeout,quiet);",
    'const ch=' + JSON.stringify(sample) + ';',
    '(async()=>{',
    "  await fakeSelf.onmessage({data:{type:'enrich_quality',channels:ch,source:{id:'suite'}}});",
    '  process.stdout.write(JSON.stringify(sent));',
    '})().catch(e=>{process.stderr.write(String(e&&e.stack||e));process.exit(1);});'
  ].join('\n');
  // A un fichero temporal: con 5 000 canales la muestra no cabe en la línea de comandos.
  const tmp = path.join(require('os').tmpdir(), 'ape-suite-worker-' + process.pid + '-' + (_workerRuns++) + '.js');
  fs.writeFileSync(tmp, code, 'utf8');
  try {
    const out = execFileSync(process.execPath, [tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) { /* nada */ }
  }
}

function launchEnrichmentFns() {
  return new Function(
    'return {' +
    "launch(source){" + methodBody(appSrcA9, "    _launchInternalEnrichment(source = 'unknown') {") + '},' +
    'classify(){' + methodBody(appSrcA9, '    _classifyMasterHierarchy() {') + '}' +
    '};'
  )();
}

const mkCh = (extra) => Object.assign({ serverId: 'srv_a', stream_id: '1', name: 'Canal', group: 'G' }, extra || {});

check('A9.1 worker: el mensaje "done" ya no devuelve el catálogo', () => {
  const sent = workerMessages([1, 2, 3, 4, 5].map((i) => mkCh({ stream_id: String(i) })));
  const done = sent.filter((m) => m && m.type === 'done');
  if (done.length !== 1) return 'mensajes "done": ' + done.length;
  if (done[0].channels !== undefined) return 'sigue devolviendo ' + done[0].channels.length + ' canales (copia de vuelta pagada)';
  if (done[0].enriched !== 5) return 'enriched=' + done[0].enriched;
  return JSON.stringify(done[0]).length < 400 || 'el mensaje sigue pesando ' + JSON.stringify(done[0]).length + ' B';
});

check('A9.2 worker: con 5 000 canales el mensaje final sigue siendo diminuto', () => {
  const big = Array.from({ length: 5000 }, (_, i) => mkCh({ stream_id: String(i), url: 'http://panel.example/' + i + '.m3u8' }));
  const sent = workerMessages(big);
  const done = sent.filter((m) => m && m.type === 'done')[0];
  if (!done) return 'no llegó el "done"';
  if (done.channels !== undefined) return 'devuelve ' + done.channels.length + ' canales';
  return JSON.stringify(done).length < 400 || 'pesa ' + JSON.stringify(done).length + ' B';
});

check('A9.3 app: si no hay nada pendiente NO se copia el catálogo al Worker', () => {
  const f = launchEnrichmentFns();
  let posts = 0;
  let finished = 0;
  const app = {
    state: { channelsMaster: Array.from({ length: 5 }, () => mkCh({ __enriched: true })) },
    worker: { postMessage: () => { posts++; } },
    _finishInternalEnrichment: () => { finished++; }
  };
  f.launch.call(app, 'suite');
  if (posts !== 0) return 'sigue copiando el catálogo (' + posts + ' postMessage)';
  return finished === 1 || 'no cierra el ciclo (la UI se quedaría en "Conectando…")';
});

check('A9.4 app: sólo se envían los pendientes y quedan marcados', () => {
  const f = launchEnrichmentFns();
  const master = [
    mkCh({ __enriched: true }), mkCh({}), mkCh({ __enriched: true }), mkCh({}), mkCh({})
  ];
  let payload = null;
  const app = {
    state: { channelsMaster: master },
    worker: { postMessage: (m) => { payload = m; } },
    _finishInternalEnrichment: () => {}
  };
  f.launch.call(app, 'suite');
  if (!payload) return 'no se lanzó nada con 3 pendientes';
  if (payload.channels === master) return 'manda la referencia del catálogo entero';
  if (payload.channels.length !== 3) return 'envió ' + payload.channels.length + ' (esperado 3)';
  return master.every((c) => c.__enriched === true) || 'quedan canales sin marcar (se reenviarían siempre)';
});

check('A9.5 app: la clasificación no se repite si el canal ya la trae', () => {
  const f = launchEnrichmentFns();
  let calls = 0;
  const resultado = {
    region: { group: 'LATAM', emoji: '🌎' },
    language: { language: 'Español', emoji: '🗣️' },
    category: { category: 'Deportes', emoji: '📂' },
    quality: { quality: 'FHD', icon: 'q' }
  };
  const mkCanal = (extra) => Object.assign({ name: 'Canal' }, extra);
  const yaClasificados = [1, 2, 3].map(() => mkCanal({ _classification: resultado }));
  const nuevos = [mkCanal({}), mkCanal({})];
  const app = {
    state: { channelsMaster: [...yaClasificados, ...nuevos], channels: [] },
    _updateClassificationUI: () => {},
    _ensureClassificationFields: () => {}
  };
  const prevWin = global.window;
  global.window = { APEChannelClassifier: { classify: () => { calls++; return resultado; } } };
  try {
    const r1 = f.classify.call(app);
    if (calls !== 2) return 'clasificó ' + calls + ' (esperado 2: sólo los nuevos)';
    if (r1.classified !== 2) return 'informa ' + r1.classified + ' nuevas';
    const total = Object.keys(r1.stats.by_region).reduce((a, k) => a + r1.stats.by_region[k], 0);
    if (total !== 5) return 'las estadísticas cuentan ' + total + ' de 5 canales';
    const antes = calls;
    f.classify.call(app);
    return calls === antes || 'la segunda pasada vuelve a clasificar ' + (calls - antes);
  } finally {
    global.window = prevWin;
  }
});

check('A9.6 app: el "done" ya no clasifica en línea ni manda el catálogo en el postMessage', () => {
  const i = appSrcA9.indexOf('case "done":');
  if (i < 0) return 'no existe el caso "done"';
  const j = appSrcA9.indexOf('case "error":', i);
  const doneBlock = appSrcA9.slice(i, j > i ? j : i + 4000);
  if (doneBlock.indexOf('APEChannelClassifier') !== -1) return 'la clasificación sigue en línea dentro del "done"';
  if (doneBlock.indexOf('this._classifyMasterHierarchy();') === -1) return 'el "done" no llama a la clasificación';
  const enviado = count(appSrcA9, 'channels: this.state.channelsMaster');
  if (enviado !== 0) return 'sigue mandando el catálogo entero (' + enviado + ')';
  return count(appSrcA9, 'this._classifyMasterHierarchy();') >= 2
    || 'el cierre sin pendientes no llama a la clasificación';
});

check('A9.7 ANLE: el sondeo ya no manda el catálogo entero al lote', () => {
  const src = read(F_ANLE_CORE);
  if (src.indexOf('processChannelBatch(master)') !== -1) return 'sigue mandando el catálogo entero (1 606 ms medidos con 28 655)';
  return src.indexOf('const pendientes = master.filter(ch => ch && ch._anleProcessed !== true)') !== -1
    || 'no filtra los canales ya procesados';
});

check('A9.8 ANLE: filtrar 57 310 canales cuesta milisegundos (no es el cuello de botella)', () => {
  const master = Array.from({ length: 57310 }, (_, i) => ({ name: 'c' + i, _anleProcessed: i < 57300 }));
  const t0 = process.hrtime.bigint();
  const pendientes = master.filter((ch) => ch && ch._anleProcessed !== true);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (pendientes.length !== 10) return 'filtro incorrecto: ' + pendientes.length;
  return ms < 50 || 'filtro demasiado lento: ' + ms.toFixed(1) + ' ms';
});

check('A9.9 index-v4.html: el token de app.js es su hash real (la caché no puede servir el viejo)', () => {
  const html = read(F_HTML);
  const m = html.match(/app\.js\?v=([A-Za-z0-9._-]+)/);
  if (!m) return 'la etiqueta de app.js no lleva token';
  // Con los saltos de línea normalizados: `git apply` en una copia limpia
  // reescribe el fichero con LF y el token tiene que valer también allí.
  const real = require('crypto').createHash('sha256')
    .update(fs.readFileSync(path.join(FE, 'app.js'), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);
  return m[1] === real || 'token ' + m[1] + ' ≠ hash ' + real + ' (app.js cambió sin tocar el token: el navegador sirve el viejo)';
});

check('A9.10 app: el Worker se pide con token de versión', () => {
  const m = appSrcA9.match(/enrichment\.worker\.js\?v=([A-Za-z0-9]+)/);
  if (!m) return 'el Worker se carga sin token: el navegador puede seguir usando el de la caché';
  const real = require('crypto').createHash('sha256')
    .update(fs.readFileSync(F_WORKER, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);
  return m[1] === real || 'token ' + m[1] + ' ≠ hash ' + real;
});

// ─────────────── A10 · canales sin serverId, purga de huérfanos y guardado atómico
// Medido con las funciones REALES de app.js y del db-manager (IndexedDB de mentira:
// no se abre ninguna base de datos).
const A10_SIGS = [
  ['_deduplicateChannels', '(channels)', '    _deduplicateChannels(channels) {'],
  ['_userFromStreamUrl', '(url)', '    _userFromStreamUrl(url) {'],
  ['_serverIdFromStreamUrl', '(url)', '    _serverIdFromStreamUrl(url) {'],
  ['_serverKeyFromStreamUrl', '(url)', '    _serverKeyFromStreamUrl(url) {'],
  ['_simpleHash', '(str)', '    _simpleHash(str) {'],
  ['_serverHostKey', '(srvOrUrl)', '    _serverHostKey(srvOrUrl) {'],
  ['_serverUserKey', '(srvOrUrl)', '    _serverUserKey(srvOrUrl) {'],
  ['_isSameServer', '(a, b)', '    _isSameServer(a, b) {'],
  ['_findActiveServerByHost', '(host, user)', '    _findActiveServerByHost(host, user) {']
];

function makeAppA10(servers) {
  const app = { state: { activeServers: servers } };
  for (const [name, params, sig] of A10_SIGS) {
    const b = methodBody(appSrcA9, sig);
    if (!b) throw new Error('no se pudo leer ' + name + '() de app.js');
    app[name] = new Function('return function ' + name + params + '{' + b + '};')();
  }
  return app;
}

const HOST_A10 = 'http://panel.example:8080';
function chanA10(i, tagged, host) {
  const c = {
    id: 'tvg:' + i,
    stream_id: String(1000 + i),
    name: 'CANAL ' + i,
    group: 'DEPORTES',
    url: (host || HOST_A10) + '/live/cuentaA/secreto/' + (1000 + i) + '.ts'
  };
  if (tagged) c.serverId = 'srv_A';
  return c;
}

check('A10.1 app: el catálogo guardado dos veces se colapsa en vez de contar doble (sin ids inventados)', () => {
  const app = makeAppA10([{ id: 'srv_A', baseUrl: HOST_A10, username: 'cuentaA' }]);
  const all = [];
  for (let i = 0; i < 3000; i++) all.push(chanA10(i, true));
  for (let i = 0; i < 2990; i++) all.push(chanA10(i, false)); // las copias viejas, sin serverId
  const out = app._deduplicateChannels(all);
  if (out.length !== 3000) return 'la tabla se queda con ' + out.length + ' canales (esperado 3000: 5 990 copias)';
  const inventados = out.filter((c) => String(c.serverId || '') .indexOf('unknown_') === 0).length;
  if (inventados !== 0) return inventados + ' canales con un serverId inventado "unknown_…" (por eso luego se purgaban como huérfanos)';
  const sinId = out.filter((c) => !(c.serverId || c._serverId)).length;
  return sinId === 0 || sinId + ' canales siguen sin serverId aunque su servidor está conectado';
});

check('A10.2 app: la purga de huérfanos ya no borra canales que no puede atribuir', () => {
  const app = makeAppA10([{ id: 'srv_A', baseUrl: HOST_A10, username: 'cuentaA' }]);
  const all = [chanA10(1, true), chanA10(2, false, 'http://otro-panel.example:2095')];
  const out = app._deduplicateChannels(all);
  if (out.length !== 2) return 'se perdieron canales al deduplicar: ' + out.length + ' de 2';
  // réplica del filtro que aplica loadChannelsList: sólo oculta, nunca borra
  const activos = new Set(['srv_A']);
  const visibles = out.filter((ch) => {
    const sId = ch.serverId || ch._serverId;
    if (!sId) return true;
    return activos.has(sId);
  });
  return visibles.length === 2 || 'el filtro de huérfanos oculta ' + (2 - visibles.length) + ' de 2 canales';
});

check('A10.3 app: la purga de huérfanos ya no escribe en IndexedDB', () => {
  const i = appSrcA9.indexOf('let deduplicatedChannels = this._deduplicateChannels(channels);');
  if (i < 0) return 'no se encontró la carga del catálogo guardado';
  const j = appSrcA9.indexOf('// ✅ V4.6.2', i);
  if (j < 0) return 'no se encontró el final del bloque de carga';
  const block = appSrcA9.slice(i, j);
  if (block.indexOf('clearChannels') !== -1) return 'la purga sigue llamando a clearChannels()';
  if (block.indexOf('saveChannels') !== -1) return 'la purga sigue llamando a saveChannels()';
  if (block.indexOf('HUÉRFANOS OCULTOS') === -1) return 'la purga no avisa de que sólo oculta';
  return block.indexOf('_replacePersistedChannels') !== -1 || 'la deduplicación no guarda por la vía atómica';
});

check('A10.4 app: ya no queda ninguna pareja "borrar todo y luego escribir"', () => {
  const n = count(appSrcA9, 'await this.db.clearChannels();');
  return n <= 1 || 'quedan ' + n + ' llamadas sueltas a clearChannels() (sólo debe quedar el recambio dentro de _replacePersistedChannels)';
});

check('A10.5 db-manager: replaceChannels existe y es una sola transacción (no borra antes)', () => {
  const b = methodBody(dbmSrc, '    async replaceChannels(list) {');
  if (!b) return 'no existe replaceChannels()';
  if (count(b, 'transaction(') !== 1) return 'abre ' + count(b, 'transaction(') + ' transacciones (debe ser 1)';
  if (b.indexOf('openCursor') === -1) return 'no borra los canales que ya no están (openCursor)';
  return count(b, '.put(') >= 1 || 'no escribe ningún canal';
});

check('A10.6 db-manager: saveChannels ya no aborta por una ficha sin clave', () => {
  const b = methodBody(dbmSrc, '    async saveChannels(list, serverUrl) {');
  if (!b) return 'no se pudo leer saveChannels()';
  if (b.indexOf('this._persistRow(') === -1) return 'no recompone la clave que falta (debería delegar en _persistRow)';
  return b.indexOf('skipped') !== -1 || 'no cuenta las fichas que descarta';
});

check('A10.7 db-manager: un aborto de transacción no pasa en silencio', () => {
  if (dbmSrc.indexOf('tx.onabort') === -1) return 'no hay tx.onabort: un aborto dejaría el catálogo a medias sin avisar';
  return true;
});

// ── pruebas con espera (el guardado real es asíncrono) ──────────────────────
async function checkAsync(name, fn) {
  try {
    const r = await fn();
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

/** IndexedDB de mentira: 'channels' con clave id; abort simula una transacción rota. */
function fakeIdb(initial, opts) {
  const options = opts || {};
  const map = new Map(initial.map((r) => [r.id, r]));
  const stats = { puts: 0, deletes: 0, clears: 0 };
  function makeTx() {
    const ops = [];
    const store = {
      put(obj) { stats.puts++; ops.push(() => map.set(obj.id, obj)); return {}; },
      delete(k) { stats.deletes++; ops.push(() => map.delete(k)); return {}; },
      clear() { stats.clears++; ops.push(() => map.clear()); return {}; },
      openCursor() {
        const req = {};
        const keys = Array.from(map.keys());
        let i = 0;
        const step = () => {
          if (i < keys.length) {
            const k = keys[i++];
            req.onsuccess({ target: { result: { primaryKey: k, continue: step } } });
          } else {
            req.onsuccess({ target: { result: null } });
          }
        };
        setTimeout(step, 0);
        return req;
      }
    };
    const tx = { objectStore: () => store };
    setTimeout(() => {
      if (options.abort) { if (tx.onabort) tx.onabort(); return; }
      ops.forEach((fn2) => fn2());
      if (tx.oncomplete) tx.oncomplete();
    }, 5);
    return tx;
  }
  return { db: { transaction: makeTx }, map, stats };
}

function loadDbManager() {
  const vm = require('vm');
  const sb = { console: { log() { }, warn() { }, error() { }, info() { } } };
  sb.window = sb; sb.self = sb;
  sb.indexedDB = { open() { return {}; } };
  sb.IDBKeyRange = { only: (v) => v };
  vm.createContext(sb);
  vm.runInContext(dbmSrc + '\nglobalThis.__DM = DatabaseManager;', sb, { filename: 'db-manager.js' });
  return sb.__DM;
}

check('A10.8 db-manager: _replacePersistedChannels no deja la base vacía si falla', () => {
  const b = methodBody(appSrcA9, '    async _replacePersistedChannels(list) {');
  if (!b) return 'no existe _replacePersistedChannels()';
  if (b.indexOf('replaceChannels') === -1) return 'no usa la transacción única';
  if (b.indexOf('catch') === -1) return 'sin catch: un fallo de disco tumba la carga';
  return b.indexOf('return false') !== -1 || 'no devuelve false al fallar';
});

async function lateChecks() {
  const DM = loadDbManager();

  await checkAsync('A10.9 IndexedDB: replaceChannels deja el catálogo exacto sin vaciarlo antes', async () => {
    const ix = fakeIdb([
      { id: 'tvg:1', name: 'A' }, { id: 'tvg:2', name: 'B' }, { id: 'tvg:viejo', name: 'Z' }
    ]);
    const dm = Object.assign(Object.create(DM.prototype), { db: ix.db, ready: async () => true });
    const n = await dm.replaceChannels([
      { id: 'tvg:1', name: 'A' }, { id: 'tvg:2', name: 'B' }, { id: 'tvg:3', name: 'C' },
      { name: 'SIN CLAVE', url: HOST_A10 + '/live/u/p/9.ts' }
    ]);
    if (n !== 4) return 'guardó ' + n + ' canales (esperado 4: una ficha sin clave no puede tumbar el guardado)';
    if (ix.map.size !== 4) return 'quedan ' + ix.map.size + ' canales en la base (esperado 4)';
    if (ix.map.has('tvg:viejo')) return 'no se borró el canal que ya no está';
    return ix.stats.clears === 0 || 'llamó a clear() (' + ix.stats.clears + ' veces): la base pudo quedarse vacía a medias';
  });

  await checkAsync('A10.10 IndexedDB: si la transacción se aborta, el catálogo anterior sigue entero', async () => {
    const ix = fakeIdb([{ id: 'tvg:1', name: 'A' }, { id: 'tvg:2', name: 'B' }], { abort: true });
    const dm = Object.assign(Object.create(DM.prototype), { db: ix.db, ready: async () => true });
    let aviso = false;
    try { await dm.replaceChannels([{ id: 'tvg:9', name: 'NUEVO' }]); } catch (e) { aviso = true; }
    if (!aviso) return 'el aborto no se comunicó';
    return (ix.map.size === 2 && ix.map.has('tvg:1')) || 'el catálogo anterior se perdió: ' + ix.map.size + ' canales';
  });

  await checkAsync('A10.11 el arranque no espera a las fechas de vencimiento de terceros', async () => {
    // init() espera loadChannelsList (los canales, que es lo que pinta la tabla) pero
    // renderSavedServersTable() lanza refreshLibraryExpDates() sin await: son 3
    // player_api.php de servidores ajenos y no deben retrasar el arranque.
    if (/await\s+this\.refreshLibraryExpDates\s*\(/.test(appSrcA9)) return 'init vuelve a esperar refreshLibraryExpDates (await)';
    if (!/await\s+this\.loadChannelsList\s*\(\s*\)/.test(appSrcA9)) return 'init ya no espera loadChannelsList: los canales podrían no estar listos';
    const hits = (appSrcA9.match(/refreshLibraryExpDates\s*\(/g) || []).length;
    return hits === 2 || 'esperaba 2 apariciones (la llamada y la definición), hay ' + hits;
  });
  await checkAsync('A10.12 IndexedDB: el guardado en bloque deja UNA ficha COMPLETA por canal', async () => {
    const ix = fakeIdb([]);
    const dm = Object.assign(Object.create(DM.prototype), { db: ix.db, ready: async () => true });
    const ch = {
      id: 'tvg:1', stream_id: '1000', serverId: 'srv_A', name: 'CANAL 1',
      url: HOST_A10 + '/live/cuentaA/secreto/1000.ts'
    };
    await dm.saveChannels([ch]);
    await dm.saveChannelsBulk([ch], HOST_A10);
    if (ix.map.size !== 1) return 'la misma ficha ocupa ' + ix.map.size + ' filas (antes 2: una completa y otra sin datos)';
    const got = ix.map.get('srv_A::tvg:1');
    if (!got || !got.url) return 'la ficha guardada no lleva url: al recargar no se puede ni reproducir';
    if (got.serverId !== 'srv_A') return 'la ficha guardada pierde serverId: al recargar cuenta como huérfana';
    if (got._channelId !== 'tvg:1') return 'la fila no conserva el id original en _channelId: no se puede devolver al leer';
    await dm.saveChannelsBulk([{ name: 'SIN ID', url: HOST_A10 + '/live/u/p/7.ts' }], HOST_A10);
    return ix.map.size === 2 || 'una ficha sin id no se guardó (debería componer la clave)';
  });

  await checkAsync('A10.13 db-manager: el guardado en bloque ya no guarda un resumen sin url', async () => {
    const b = methodBody(dbmSrc, '    async saveChannelsBulk(channels, serverUrl) {');
    if (!b) return 'no se pudo leer saveChannelsBulk()';
    if (b.indexOf('const entry = {') !== -1) return 'sigue montando un resumen aparte, sin url ni serverId (era el origen de las 28.640 fichas mudas)';
    if (b.indexOf('this._persistRow(ch') === -1) return 'no guarda el canal entero (debería delegar en _persistRow)';
    const p = methodBody(dbmSrc, '    _persistRow(channel, serverUrl, now) {');
    if (!p) return 'no se pudo leer _persistRow()';
    if (p.indexOf('Object.assign({}, channel)') === -1) return '_persistRow no copia el canal entero';
    if (p.indexOf('row._channelId = id') === -1) return '_persistRow no conserva el id original';
    return p.indexOf('this.generateChannelId(channel)') !== -1 || 'no compone la clave cuando el canal no la trae';
  });

  await checkAsync('A10.14 app: las fichas sin dirección se descartan ANTES de deduplicar', async () => {
    const i = appSrcA9.indexOf('_conDireccion = channels.filter');
    if (i < 0) return 'no existe el filtro de fichas sin dirección al cargar el catálogo';
    const j = appSrcA9.indexOf('let deduplicatedChannels = this._deduplicateChannels(channels);');
    if (j < 0) return 'no se encontró la deduplicación al cargar';
    if (i > j) return 'el filtro va DESPUÉS de deduplicar: las fichas mudas seguirían contando como canales';
    return appSrcA9.indexOf('deduplicatedChannels.length < _rawCount') !== -1
      || 'al quitar fichas mudas no se dispara el guardado que las borra del disco';
  });

  await checkAsync('A10.15 app: ningún guardado se lanza sin esperar (un refresco no debe pillar la base a medias)', async () => {
    const all = (appSrcA9.match(/this\.db\.saveChannelsBulk\s*\(/g) || []).length;
    const aw = (appSrcA9.match(/await\s+this\.db\.saveChannelsBulk\s*\(/g) || []).length;
    if (all === 0) return 'no se encontró el guardado en bloque';
    return all === aw || (all - aw) + ' de ' + all + ' guardados se lanzan sin esperar: un refresco justo entonces pierde el catálogo';
  });

  await checkAsync('A10.16 app: la recuperación automática no pregunta nada', async () => {
    if (!/async connectFromLibrary\(serverId, opts\)/.test(appSrcA9)) return 'connectFromLibrary no acepta el modo automático';
    if (appSrcA9.indexOf('const confirmReconnect = auto ? true : confirm(') === -1) {
      return 'la reconexión automática seguiría pidiendo confirmación (se quedaría esperando a una persona que no está)';
    }
    return /await this\.connectFromLibrary\((targetId|target\.id), \{ auto: true \}\)/.test(appSrcA9)
      || 'nadie llama a connectFromLibrary en modo automático';
  });

  await checkAsync('A10.17 app: con canales no se recupera nada, y sin ellos se intenta el snapshot', async () => {
    const b = methodBody(appSrcA9, '    async _ensureCatalogAvailable() {');
    if (!b) return 'no existe _ensureCatalogAvailable()';
    if (!/await\s+this\._ensureCatalogAvailable\s*\(\s*\)/.test(appSrcA9)) return 'init no la espera: el arranque seguiría en 0 canales';
    const fn = new Function('return async function(){' + b + '};')();
    const mk = (over) => Object.assign({
      state: { channelsMaster: [], activeServers: [] },
      snapShots: 0, connects: [],
      _ensureServerInLibrary: function () { return true; },
      loadGeneratorSnapshot: async function () { this.snapShots++; },
      connectFromLibrary: async function (id, o) { this.connects.push([id, o]); this.state.channelsMaster = [chanA10(1, true)]; },
      showNotification: function () { }
    }, over || {});
    const lleno = mk({ state: { channelsMaster: [chanA10(1, true)], activeServers: [{ id: 'srv_A', baseUrl: 'http://a', username: 'u', password: 'p' }] } });
    if ((await fn.call(lleno)) !== true) return 'con canales no devolvió true';
    if (lleno.snapShots !== 0 || lleno.connects.length !== 0) return 'con canales ya guardados hace trabajo de más (snapshot o reconexión)';
    const conSnap = mk({
      loadGeneratorSnapshot: async function () { this.snapShots++; this.state.channelsMaster = [chanA10(1, true), chanA10(2, true)]; }
    });
    if ((await fn.call(conSnap)) !== true) return 'no restauró desde el snapshot';
    return conSnap.connects.length === 0 || 'teniendo snapshot se puso a reconectar sin necesidad';
  });

  await checkAsync('A10.18 app: sin canales y sin snapshot reconecta SOLO, una vez, al último servidor', async () => {
    const b = methodBody(appSrcA9, '    async _ensureCatalogAvailable() {');
    if (!b) return 'no existe _ensureCatalogAvailable()';
    const fn = new Function('return async function(){' + b + '};')();
    const mk = (over) => Object.assign({
      state: { channelsMaster: [], activeServers: [] },
      snapShots: 0, connects: [],
      _ensureServerInLibrary: function () { return true; },
      loadGeneratorSnapshot: async function () { this.snapShots++; },
      connectFromLibrary: async function (id, o) { this.connects.push([id, o]); this.state.channelsMaster = [chanA10(1, true)]; },
      showNotification: function () { }
    }, over || {});
    const srv = (id) => ({ id: id, baseUrl: 'http://' + id, username: 'u', password: 'p' });
    const conServidor = mk({ state: { channelsMaster: [], activeServers: [srv('srv_A'), srv('srv_B')] } });
    if ((await fn.call(conServidor)) !== true) return 'no recuperó el catálogo reconectando';
    if (conServidor.connects.length !== 1) return 'reconectó ' + conServidor.connects.length + ' veces (debe ser exactamente 1)';
    const [id, opts] = conServidor.connects[0];
    if (id !== 'srv_B') return 'reconectó a ' + id + ' en vez del último servidor usado (srv_B)';
    if (!opts || opts.auto !== true) return 'no pidió el modo automático: se quedaría en un confirm() sin nadie delante';
    const vacio = mk();
    const r = await fn.call(vacio);
    if (r !== false) return 'sin canales y sin servidores no devolvió false';
    return vacio.connects.length === 0 || 'se puso a reconectar sin ningún servidor guardado';
  });
  await checkAsync('A11 el motor de tiempo real entiende los 12 perfiles LAB (P4.5 no cae a P3)', async () => {
    const src = read(F_GEN);
    const a = src.indexOf('const _APE_RT_ALIAS_SEEN');
    const b = src.indexOf('// SECCIÓN 3: API PÚBLICA');
    if (a < 0 || b < 0 || b < a) return 'no existe el resolvedor _apeRealtimeResolveProfile';
    const snippet = src.slice(a, b);
    const matrix = { P0: {}, P1: {}, P2: {}, P3: {}, P4: {}, P5: {} };
    const logs = { warn: [], log: [] };
    const fakeConsole = {
      warn: (m) => logs.warn.push(String(m)),
      log: (m) => logs.log.push(String(m))
    };
    const resolve = new Function('APE_PROFILE_MATRIX', 'console', snippet + '\nreturn _apeRealtimeResolveProfile;')(matrix, fakeConsole);
    // las 6 variantes premium que LAB y el Gestor de Perfiles sí ofrecen
    for (const base of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
        const got = resolve(base + '.5');
        if (got !== base) return base + '.5 se resolvió como ' + got + ' (debería usar su tier base ' + base + ')';
        if (resolve(base + ',5') !== base) return base + ',5 (coma) no se reconoce';
        if (resolve(base) !== base) return base + ' dejó de resolverse';
    }
    if (logs.warn.length !== 0) return 'los 12 perfiles siguen generando avisos de "desconocido": ' + logs.warn.length;
    if (resolve('P4.5') !== 'P4') return 'la segunda llamada a P4.5 ya no resuelve';
    // un id que no existe sí cae a P3, pero avisa UNA vez, no 3.349
    if (resolve('PX9') !== 'P3') return 'un perfil inexistente debe caer a P3';
    resolve('PX9'); resolve('PX9');
    if (logs.warn.length !== 1) return 'el fallback a P3 avisa ' + logs.warn.length + ' veces (debe ser 1 por id)';
    // el resolvedor se usa en todos los puntos de entrada del motor
    const uses = count(src, '_apeRealtimeResolveProfile(');
    if (uses < 5) return 'sólo ' + uses + ' usos: quedan entradas del motor sin resolver (volverían a caer a P3)';
    // pero getProfile() NO debe servir la base para un .5: es la tabla que
    // sobrescribe el network-caching calibrado del LAB en los 12 perfiles.
    const gp = src.indexOf('getProfile(profileId) {');
    const gpBody = gp >= 0 ? src.slice(gp, gp + 600) : '';
    return gpBody.indexOf('return APE_PROFILE_MATRIX[profileId] || null;') !== -1
        || 'getProfile() resuelve el .5 a su base: pisaría el network-caching calibrado del LAB';
  });
}

// ──────────────────────────────────────────────────────────────── Salida
(async () => {
  await lateChecks();
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
})();
