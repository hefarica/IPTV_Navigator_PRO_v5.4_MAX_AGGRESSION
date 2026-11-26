#!/usr/bin/env node
'use strict';
/**
 * tests/catalog-persistence.test.js — EL CATÁLOGO NO PUEDE VOLVER A CERO AL REFRESCAR.
 *
 * DEFECTO MEDIDO (log del operador, 2026-11-24):
 *   1. El navegador ejecutaba un `core/db-manager.js` viejo porque el
 *      `<script src="core/db-manager.js?v=9aff69b4">` no coincidía con el
 *      archivo corregido en disco. Ese db-manager viejo guardaba un resumen
 *      sin `url`/`serverId` y BORRABA el store (`🗑️ Canales limpiados`).
 *   2. A la recarga siguiente: «No hay canales guardados en IndexedDB»,
 *      `stats {total: 0}` y el servidor apareciendo conectado: la app quedaba
 *      «esperando un servidor» y volvía a descargar 28.655 canales.
 *   3. Aunque la base estuviera bien, `saveChannelsBulk` guardaba por `id`
 *      (stream_id, NO único entre servidores) y `getCachedMetadata` buscaba
 *      por `generateChannelId` (tvg:/hash:): dos servidores se pisaban las
 *      filas y la caché no acertaba nunca → re-enriquecimiento completo en
 *      cada conexión.
 *
 * ESTE TEST FIJA, sin navegador:
 *   A. La clave física de IndexedDB es `serverId::id`: dos servidores con el
 *      mismo stream_id producen dos filas y ambas restorean su id original.
 *   B. Las filas antiguas (id a secas) se siguen leyendo.
 *   C. El HTML pide EXACTAMENTE el db-manager.js y el app.js que están en
 *      disco (sha256[:8]). Este chequeo habría evitado la pérdida de datos.
 *   D. El flujo de arranque no llama a `clearChannels()` y conserva huérfanos
 *      en disco; la recuperación automática exige credenciales, inyecta el
 *      servidor en la biblioteca y tiene cooldown (un F5 en bucle no puede
 *      re-descargar el catálogo cada vez).
 *   E. El enriquecimiento no reenvía al Worker los canales restaurados que ya
 *      traen `meta.enriched = true`.
 *
 * Lo que NO prueba: que un reproductor real reproduzca, ni que el proveedor
 * responda. Eso exige tráfico y no está medido aquí.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const FE = path.join(__dirname, '..');
const APP = path.join(FE, 'app.js');
const DB = path.join(FE, 'core', 'db-manager.js');
const HTML = path.join(FE, 'index-v4.html');

let PASS = 0;
let FAIL = 0;
const check = (cond, name, extra) => {
    if (cond) { PASS++; console.log('PASS  ' + name); }
    else { FAIL++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); }
};

const read = (p) => fs.readFileSync(p, 'utf8');
const sha8 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 8);
const count = (src, needle) => src.split(needle).length - 1;

const dbSrc = read(DB);
const appSrc = read(APP);
const htmlSrc = read(HTML);
const dbHash = sha8(DB);
const appHash = sha8(APP);

/* ─────────────────────────────────────────────────────────────────────────
 * A+B. Claves físicas: cargar SOLO la clase con un indexedDB inerte.
 * ───────────────────────────────────────────────────────────────────────── */
let manager = null;
try {
    const inertRequest = {};
    const sandbox = {
        console: { log() { }, warn() { }, error() { } },
        indexedDB: { open: () => inertRequest },
        setTimeout, clearTimeout, Date, Map, Set, Object, String, Number, Array, JSON, Promise
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(dbSrc, sandbox, { filename: 'db-manager.js' });
    manager = sandbox.window.dbManager;
} catch (e) {
    check(false, 'db-manager.js se puede cargar en un contexto aislado', e.message);
}
check(!!manager, 'db-manager.js expone window.dbManager');
check(!!manager && typeof manager._persistRow === 'function',
    'db-manager.js tiene _persistRow (clave física serverId::id)');
check(!!manager && typeof manager._restoreRow === 'function',
    'db-manager.js tiene _restoreRow (id original al leer)');

if (manager && typeof manager._persistRow === 'function') {
    const chA = { id: '123', serverId: 'srv_A', url: 'http://a/live/u1/p1/123.ts', name: 'A' };
    const chB = { id: '123', serverId: 'srv_B', url: 'http://b/live/u2/p2/123.ts', name: 'B' };
    const rowA = manager._persistRow(chA, 'http://a');
    const rowB = manager._persistRow(chB, 'http://b');
    const store = new Map();
    store.set(rowA.id, rowA);
    store.set(rowB.id, rowB);

    check(store.size === 2,
        'A · dos servidores con el MISMO stream_id producen DOS filas (antes se pisaban)',
        'filas=' + store.size + ' claves=' + [...store.keys()].join(' | '));
    check(rowA.id === 'srv_A::123' && rowB.id === 'srv_B::123',
        'A · la clave física es serverId::id',
        rowA.id + ' / ' + rowB.id);
    check(rowA._channelId === '123' && rowB._channelId === '123',
        'A · el id original se conserva en _channelId');
    check(manager._restoreRow(rowA).id === '123' && manager._restoreRow(rowB).id === '123',
        'A · _restoreRow devuelve el id canónico del canal (la app ve el mismo id)');
    const freshRow = manager._persistRow({ id: '123', serverId: 'srv_A', url: 'http://a/live/u1/p1/123.ts', name: 'A' }, 'http://a');
    check(!('_channelId' in manager._restoreRow(freshRow)),
        'A · _channelId no se filtra al canal que consume la app');

    const legacy = { id: '123', url: 'http://a/1.ts', name: 'legacy' };
    const restoredLegacy = manager._restoreRow(Object.assign({}, legacy));
    check(restoredLegacy.id === '123' && restoredLegacy.url === 'http://a/1.ts',
        'B · una fila antigua (sin _channelId) se sigue leyendo igual');

    const noId = manager._persistRow({ serverId: 'srv_C', tvg_id: 'tv:1', name: 'x' }, 'http://c');
    check(!!noId && /^srv_C::/.test(noId.id),
        'A · un canal sin id recibe id derivado y también va bajo su servidor');
}

/* ─────────────────────────────────────────────────────────────────────────
 * C. El HTML debe pedir exactamente los archivos que hay en disco.
 * ───────────────────────────────────────────────────────────────────────── */
const tokenFor = (rel) => {
    const m = htmlSrc.match(new RegExp('<script\\s+src="' + rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([^"]*)"'));
    return m ? m[1] : null;
};
check(tokenFor('core/db-manager.js') === dbHash,
    'C · index-v4.html pide core/db-manager.js?v=' + dbHash + ' (el corregido, no el destructivo cacheado)',
    'declarado=' + tokenFor('core/db-manager.js'));
check(tokenFor('app.js') === appHash,
    'C · index-v4.html pide app.js?v=' + appHash + ' (el que tiene la autoreparación)',
    'declarado=' + tokenFor('app.js'));

/* ─────────────────────────────────────────────────────────────────────────
 * D. Arranque: sin purga, con huérfanos en disco y recuperación segura.
 * ───────────────────────────────────────────────────────────────────────── */
const loadStart = appSrc.indexOf('async loadChannelsList()');
const loadEnd = appSrc.indexOf('async _ensureCatalogAvailable()');
const loadSrc = (loadStart >= 0 && loadEnd > loadStart) ? appSrc.slice(loadStart, loadEnd) : '';
check(loadSrc.length > 0, 'D · loadChannelsList localizado');
check(!/clearChannels\s*\(/.test(loadSrc),
    'D · loadChannelsList NO llama a clearChannels() (no puede vaciar la base al arrancar)');
check(/HUÉRFANOS OCULTOS/.test(loadSrc) && /se conservan en disco/.test(loadSrc),
    'D · los huérfanos se ocultan pero se conservan en disco');
check(/_migrateChannelKeysOnce\s*\(/.test(loadSrc),
    'D · loadChannelsList dispara la migración única de claves');

const recStart = appSrc.indexOf('async _ensureCatalogAvailable()');
const recEnd = appSrc.indexOf('_ensureServerInLibrary(server)', recStart);
const recSrc = recStart >= 0 ? appSrc.slice(recStart, recEnd > recStart ? recEnd : recStart + 8000) : '';
check(recSrc.length > 0, 'D · _ensureCatalogAvailable localizado');
check(/_ensureServerInLibrary/.test(recSrc),
    'D · la recuperación inyecta el servidor en la biblioteca si falta (antes: «Servidor no encontrado»)');
check(/conCredenciales|_lockedUsername/.test(recSrc),
    'D · sólo reconecta servidores con credenciales completas');
check(/iptv_catalog_recovery_v1/.test(recSrc) && /RECOVERY_COOLDOWN/.test(recSrc),
    'D · cooldown persistido: un refresco en bucle no re-descarga el catálogo');
check(!/\balert\s*\(/.test(recSrc) && !/\bconfirm\s*\(/.test(recSrc),
    'D · la recuperación automática no abre diálogos bloqueantes');

/* ─────────────────────────────────────────────────────────────────────────
 * E. Enriquecimiento: respetar lo ya enriquecido en disco.
 * ───────────────────────────────────────────────────────────────────────── */
const launcher = appSrc.slice(appSrc.indexOf('_launchInternalEnrichment(source'),
    appSrc.indexOf('_launchInternalEnrichment(source') + 2500);
check(/meta\.enriched === true/.test(launcher) && /source !== 'after_server_load'/.test(launcher),
    'E · no se reenvía al Worker lo que ya viene enriquecido de IndexedDB/snapshot',
    'guarda meta.enriched ausente');

/* ─────────────────────────────────────────────────────────────────────────
 * F. La caché y el guardado usan la MISMA clave lógica (id), no generateChannelId.
 * ───────────────────────────────────────────────────────────────────────── */
check(/getCachedMetadata\(cascaded \|\| normalized, serverObj && serverObj\.id\)/.test(appSrc),
    'F · processChannels pasa el serverId a getCachedMetadata');
const lookupStart = appSrc.indexOf('for (const ch of cascaded)', appSrc.indexOf('processChannels(rawChannels'));
const lookupSrc = lookupStart >= 0 ? appSrc.slice(lookupStart, lookupStart + 1600) : '';
check(/String\(ch\.id\)/.test(lookupSrc) && /cachedMap\.get\(String\(id\)\)/.test(lookupSrc),
    'F · la caché se consulta por el id canónico del canal (antes: generateChannelId → nunca acertaba)');
check(/_persistRow/.test(dbSrc) && /store\.put\(row\)/.test(dbSrc) && count(dbSrc, '_persistRow(') >= 4,
    'F · saveChannels/saveChannelsBulk/replaceChannels escriben con la clave física',
    'usos _persistRow=' + count(dbSrc, '_persistRow('));
check(/_restoreRow/.test(dbSrc) && /\.map\(\(row\) => this\._restoreRow\(row\)\)/.test(dbSrc),
    'F · loadChannels restaura el id original de cada fila');

console.log('\n{"passed":' + PASS + ',"failed":' + FAIL + ',"suite":"catalog-persistence"}');
process.exit(FAIL === 0 ? 0 : 1);

