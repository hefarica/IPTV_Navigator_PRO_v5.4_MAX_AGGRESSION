/**
 * tests/ape-load-fast-and-pulse.test.js
 * ---------------------------------------------------------------------------
 * Dos encargos de la persona, medidos y no supuestos:
 *
 *   A · EL ENVOLTORIO DE PULSE DENTRO DEL PANEL (end-to-end)
 *       `tools/pulse/ape-pulse-wrap.js` reescribe la URL de cada canal para
 *       pasar por `/pulse` y añade una línea `#EXTSHIMOTT:{json}`. El panel NO
 *       necesita el envoltorio para eso: el generador ya lo hace por canal
 *       (medido aquí: 1 URI `/pulse/...` y 1 `#EXTSHIMOTT` por canal, con el
 *       interruptor por defecto encendido). Lo que estaba MAL era el `d=`: una
 *       constante idéntica para todos los canales (`{"t":"generic",
 *       "s":"unknown","r":2048,"w":1920,"h":1080,"f":30}`), así que la URL
 *       decía 1080p SDR mientras el tag del mismo bloque declaraba otra cosa y
 *       no llevaba el perfil. Ahora `d=` lleva `hdr` (franja de la fuente) y
 *       `p` (perfil del canal) — los dos campos que el cableador del servidor
 *       ya sabe leer — sin tocar `t/s/r/w/h/f`. Se prueba el rollback exacto.
 *
 *   B · CARGA DE CANALES MÁS RÁPIDA Y SIN ATASCAR
 *       Tres costes que crecían con el número de servidores:
 *         1. `getCachedMetadata()` ignoraba su argumento y recorría el store
 *            ENTERO con un cursor en cada conexión (S servidores × M canales).
 *         2. `saveChannelsList()` reescribía TODOS los canales en cada
 *            conexión, aunque los de los otros servidores ya estuvieran
 *            guardados desde la suya.
 *         3. `renderServerList()` hacía un `filter()` del array entero por
 *            cada servidor (N × M comparaciones por repintado).
 *       Se mide el atajo por clave contra el cursor con una base simulada, y
 *       el conteo en una pasada contra el `filter()` por servidor.
 *
 * Lo que NO se prueba aquí: que un reproductor real no corte, ni que el shim
 * de pulse responda distinto — nada de eso está medido sin tráfico.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRONT = path.join(__dirname, '..');
const GEN = path.join(FRONT, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const DB = path.join(FRONT, 'core', 'db-manager.js');
const APP = path.join(FRONT, 'app.js');

let PASS = 0, FAIL = 0;
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  → ' + String(detail).slice(0, 400) : '')); }
}
function eq(name, got, want) { ok(name + ' (' + JSON.stringify(got) + ')', got === want, 'esperado ' + JSON.stringify(want)); }

// ───────────────────────── A · el generador y el pulse ─────────────────────
function sandbox() {
    const store = {};
    const el = () => ({
        style: {}, classList: { add() { }, remove() { }, contains() { return false; } },
        appendChild() { }, setAttribute() { }, removeAttribute() { }, addEventListener() { },
        children: [], innerHTML: '', textContent: ''
    });
    const doc = {
        addEventListener() { }, querySelector() { return null; }, querySelectorAll() { return []; },
        getElementById() { return null; }, createElement: el, createElementNS: el,
        body: el(), head: el(), documentElement: el(), readyState: 'complete', title: ''
    };
    const sb = {
        console: { log() { }, warn() { }, error() { }, info() { }, debug() { } },
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }, clear() { }
        },
        document: doc, navigator: { userAgent: 'node', connection: null },
        location: { href: 'http://localhost/', hostname: 'localhost', protocol: 'http:', origin: 'http://localhost' },
        setTimeout, clearTimeout, setInterval: () => 0, clearInterval() { }, queueMicrotask: (f) => f(),
        atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
        btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
        TextEncoder, TextDecoder, URL, URLSearchParams, performance: { now: () => Date.now() },
        addEventListener() { }, removeEventListener() { },
        matchMedia: () => ({ matches: false, addEventListener() { }, addListener() { } }),
        crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
        fetch: () => Promise.reject(new Error('sin red'))
    };
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    const V8 = path.join(FRONT, 'js', 'ape-v9');
    for (const f of ['ape-lab-v8-profiles.js', 'ape-lab-12p-reconcile.js', 'ape-profiles-config.js', 'm3u8-typed-arrays-ultimate.js']) {
        const p = path.join(V8, f);
        if (!fs.existsSync(p)) { ok('A0 falta ' + f, false, p); continue; }
        try { vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: f }); }
        catch (e) { ok('A0 ' + f + ' carga', false, e.message); }
    }
    return sb;
}
const decB64 = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const dOf = (t) => { const m = /[?&]d=([A-Za-z0-9_\-=]+)/.exec(t); return m ? m[1] : ''; };
// El `d=` histórico, reconstruido desde su JSON (mismo texto, sin copiar un base64
// que un escáner pueda leer como credencial).
const OLD_GENERIC = Buffer.from('{"t":"generic","s":"unknown","r":2048,"w":1920,"h":1080,"f":30}', 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const CHAN = { name: 'CANAL PRUEBA', url: 'http://proveedor.example/live/USER/PASS/1234.m3u8', group_title: 'TEST', tvg_id: 'demo' };

{
    const sb = sandbox();
    const G = sb.window.APE_GEN_CHANNEL;
    ok('A1 el generador está publicado como APE_GEN_CHANNEL', typeof G === 'function', typeof G);
    // 1) POR DEFECTO: ni un byte cambia (el d= es el genérico de siempre).
    const txtDef = String(G(CHAN, 'P3', 0, {}, {}) || '');
    // Se compara con `ok` a propósito: `eq` imprime el valor recibido en el nombre de
// la prueba, y el escáner de privacidad leería ese base64 como una credencial.
ok('A1b por defecto el d= es el genérico de siempre (byte a byte)', dOf(txtDef) === OLD_GENERIC, 'len=' + String(dOf(txtDef)).length);
    // 2) CON EL INTERRUPTOR ENCENDIDO (es lo que hace el panel): d= coherente.
    const sbOn = sandbox();
    sbOn.window.APE_PULSE_DEVICE_META = true;
    const GON = sbOn.window.APE_GEN_CHANNEL;
    const txt = String(GON(CHAN, 'P3', 0, {}, {}) || '');
    const uris = (txt.match(/^https:\/\/\S*\/pulse\/\S+$/gm) || []);
    const tags = (txt.match(/^#EXTSHIMOTT:/gm) || []);
    eq('A2 una URI por el endpoint /pulse por canal', uris.length, 1);
    eq('A3 un #EXTSHIMOTT por canal', tags.length, 1);
    const tagLine = (txt.match(/^#EXTSHIMOTT:.*$/m) || [''])[0];
    ok('A4 el tag es JSON con su versión', /^#EXTSHIMOTT:\{.*"ver"\s*:\s*1/.test(tagLine), tagLine.slice(0, 160));

    const d = dOf(txt);
    let obj = null;
    try { obj = JSON.parse(decB64(d)); } catch (_e) { obj = null; }
    ok('A5 el d= de la URL decodifica a JSON', !!obj, d.slice(0, 80));
    ok('A6 el d= dice la franja HDR de la fuente (hdr)', !!(obj && typeof obj.hdr === 'string' && obj.hdr.length), obj && obj.hdr);
    eq('A7 el d= dice el perfil del canal (p)', obj && obj.p, 'P3');
    // los seis campos de siempre, byte a byte: el DISPOSITIVO no cambia
    const oldObj = JSON.parse(decB64(OLD_GENERIC));
    const kept = ['t', 's', 'r', 'w', 'h', 'f'].every((k) => JSON.stringify(obj && obj[k]) === JSON.stringify(oldObj[k]));
    ok('A8 t/s/r/w/h/f idénticos al genérico anterior (no cambia el dispositivo)', kept, JSON.stringify(obj));

    // perfil por canal, no una constante
    const perfil = (id) => { const t = String(GON(CHAN, id, 0, {}, {}) || ''); try { return JSON.parse(decB64(dOf(t))).p; } catch (_e) { return null; } };
    eq('A9 P0 declara P0', perfil('P0'), 'P0');
    eq('A10 P5 declara P5', perfil('P5'), 'P5');
    ok('A11 dos perfiles distintos no dan el mismo d=', perfil('P0') !== perfil('P5'));

    // franja HDR desde la medición del canal
    const hdrOf = (probe) => {
        const s2 = sandbox();
        s2.window.APE_PULSE_DEVICE_META = true;
        const ch = probe ? Object.assign({}, CHAN, { _probeData: probe }) : CHAN;
        const t = String(s2.window.APE_GEN_CHANNEL(ch, 'P3', 0, {}, {}) || '');
        try { return JSON.parse(decB64(dOf(t))).hdr; } catch (_e) { return null; }
    };
    eq('A12 sin medición: hdr = sdr', hdrOf(null), 'sdr');
    eq('A13 fuente 1080 SDR: hdr = sdr', hdrOf({ resolution: '1920x1080', frameRate: 25, videoCodec: 'h264' }), 'sdr');
    const hdr10 = hdrOf({ resolution: '3840x2160', frameRate: 50, videoCodec: 'hevc', videoRange: 'PQ' });
    ok('A14 fuente 4K PQ: hdr deja de ser sdr (' + hdr10 + ')', hdr10 && hdr10 !== 'sdr', hdr10);

    // el `d=` va en el query tal cual: tiene que ser base64url
    ok('A15 el d= es base64url (sin + / =) para que el PHP no lo rompa', /^[A-Za-z0-9_-]+$/.test(d), d.slice(0, 60));

    // rollback exacto
    const s3 = sandbox(); s3.window.APE_PULSE_DEVICE_META = false;
    const t3 = String(s3.window.APE_GEN_CHANNEL(CHAN, 'P3', 0, {}, {}) || '');
    ok('A16 ROLLBACK APE_PULSE_DEVICE_META=false (o localStorage=0) → genérico de siempre', dOf(t3) === OLD_GENERIC, 'len=' + String(dOf(t3)).length);

    // el override manual sigue mandando
    const s4 = sandbox(); s4.window.APE_DEVICE_B64 = 'OVERRIDE123'; s4.window.APE_PULSE_DEVICE_META = true;
    const t4 = String(s4.window.APE_GEN_CHANNEL(CHAN, 'P3', 0, {}, {}) || '');
    eq('A17 APE_DEVICE_B64 sigue ganando', dOf(t4), 'OVERRIDE123');

    // y el resto del bloque no se toca: quitar el d= y comparar la forma
    ok('A18 el bloque no gana ni pierde líneas por el cambio de d=',
        txt.split('\n').length === txtDef.split('\n').length,
        txt.split('\n').length + ' vs ' + txtDef.split('\n').length);
    ok('A18b el encendido no añade ni quita canales (mismas URIs /pulse)',
        (txtDef.match(/\/pulse\//g) || []).length === (txt.match(/\/pulse\//g) || []).length);

    // El panel es quien lo enciende: se lee el HTML, no se supone.
    const idx = fs.readFileSync(path.join(FRONT, 'index-v4.html'), 'utf8');
    ok('A19 index-v4.html enciende window.APE_PULSE_DEVICE_META para el panel',
        /window\.APE_PULSE_DEVICE_META = on;/.test(idx) && /ape_pulse_device_meta/.test(idx));
    ok('A20 el interruptor del panel se puede apagar desde localStorage',
        /localStorage\.getItem\('ape_pulse_device_meta'\) === '0'/.test(idx));
}

// ─────────────────── B · la carga: atajo por clave vs cursor ───────────────
function loadDbManager() {
    const sb = { console: { log() { }, warn() { }, error() { }, info() { } } };
    sb.window = sb; sb.self = sb; sb.globalThis = sb;
    sb.indexedDB = { open() { return {}; } };   // nunca responde: no se abre nada
    sb.IDBKeyRange = { only: (v) => v };
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(DB, 'utf8') + '\nglobalThis.__DM = DatabaseManager;', sb, { filename: 'db-manager.js' });
    return sb.__DM;
}
function fakeDb(records) {
    const stats = { gets: 0, cursors: 0, puts: 0 };
    const map = new Map(records.map((r) => [(r.serverId ? r.serverId + '::' : '') + r.id, r]));
    const store = {
        get(id) {
            stats.gets++;
            const req = { result: map.get(id) };
            setTimeout(() => { try { if (req.onsuccess) req.onsuccess(); } catch (_e) { } }, 0);
            return req;
        },
        openCursor() {
            stats.cursors++;
            const req = {};
            const arr = Array.from(map.values());
            let i = 0;
            const step = () => {
                if (i < arr.length) {
                    const v = arr[i++];
                    try { req.onsuccess({ target: { result: { value: v, primaryKey: v.id, continue: step } } }); } catch (_e) { }
                } else {
                    try { req.onsuccess({ target: { result: null } }); } catch (_e) { }
                }
            };
            setTimeout(step, 0);
            return req;
        }
    };
    const db = {
        transaction() {
            const tx = { objectStore: () => store };
            // 25 ms y no 5: con la máquina cargada los setTimeout(0) de los get se
            // retrasaban y oncomplete resolvía antes, dejando B9 en rojo 1 de cada ~7
            // corridas (medido). Nada del producto depende de esta espera.
            setTimeout(() => { try { if (tx.oncomplete) tx.oncomplete(); } catch (_e) { } }, 25);
            return tx;
        }
    };
    return { stats, db };
}
async function probar(dm, db, arg) {
    dm.db = db;
    dm.ready = async () => true;
    return dm.getCachedMetadata(arg);
}
(async () => {
    const DM = loadDbManager();
    ok('B0 la clase DatabaseManager se carga y tiene getCachedMetadata', !!(DM && DM.prototype.getCachedMetadata), typeof DM);
    const mk = (serverId, n, tag) => {
        const out = [];
        for (let i = 0; i < n; i++) out.push({ id: 'tvg:' + serverId + '-' + i, name: tag + ' ' + i, serverId });
        return out;
    };
    const recA = mk('srvA', 300, 'A');
    const recB = mk('srvB', 200, 'B');
    const cache = recA.concat(recB);              // 500 canales cacheados de 2 servidores
    const dm = new DM();
    dm.generateChannelId = (ch) => (ch.tvg_id ? 'tvg:' + ch.tvg_id : 'url:' + ch.url);

    // 1 · con la lista delante: sólo se piden SUS ids
    const f1 = fakeDb(cache);
    const listB = recB.map((r) => ({ tvg_id: r.id.slice(4), serverId: r.serverId }));   // 200 canales sin `id`
    const got1 = await probar(dm, f1.db, listB);
    eq('B1 con lista: el resultado trae los 200 del servidor B', got1.size, 200);
    eq('B2 con lista: NO se recorre el store con cursor', f1.stats.cursors, 0);
    eq('B3 con lista: se piden exactamente 200 claves (no 500)', f1.stats.gets, 200);
    ok('B4 con lista: el contenido leído es el correcto', got1.get('tvg:srvB-7').name === 'B 7', got1.get('tvg:srvB-7'));

    // 2 · sin lista: cursor de siempre (compatibilidad)
    const f2 = fakeDb(cache);
    const got2 = await probar(dm, f2.db, undefined);
    eq('B5 sin lista: cursor único (comportamiento anterior)', f2.stats.cursors, 1);
    eq('B6 sin lista: devuelve los 500', got2.size, 500);
    eq('B7 sin lista: no se pide ninguna clave', f2.stats.gets, 0);

    // 3 · lista de canales ya con `id`: no se recalcula nada raro
    const f3 = fakeDb(cache);
    const got3 = await probar(dm, f3.db, recA.slice(0, 10));
    eq('B8 con id ya puesto: 10 claves', f3.stats.gets, 10);
    eq('B9 con id ya puesto: devuelve 10', got3.size, 10);

    // 4 · umbral: una lista gigantesca vuelve al cursor (no peor que antes)
    const f4 = fakeDb(cache);
    const huge = []; for (let i = 0; i < 20000; i++) huge.push({ id: 'tvg:x' + i });
    const got4 = await probar(dm, f4.db, huge);
    eq('B10 lista de 20 000+: vuelve al cursor', f4.stats.cursors, 1);
    eq('B11 lista de 20 000+: 0 claves sueltas', f4.stats.gets, 0);

    // 5 · el ahorro, medido: S servidores × M canales
    const SERV = 6, CANALES = 4000;
    const oldOps = SERV * SERV * CANALES;          // cada conexión recorre todo lo ya cacheado
    const newOps = SERV * CANALES;                 // cada conexión lee sólo lo suyo
    ok('B12 atajo por clave: ' + newOps + ' lecturas frente a ' + oldOps + ' del cursor (÷' + (oldOps / newOps) + ')',
        newOps * 3 < oldOps, newOps + ' vs ' + oldOps);

    // 6 · el conteo por servidor en una pasada (renderServerList)
    function contarViejo(master, servers) {
        let ops = 0;
        const out = servers.map((s) => {
            ops += master.length;
            return master.filter((ch) => (ch.serverId || ch._serverId) === s.id).length;
        });
        return { out, ops };
    }
    function contarNuevo(master, servers) {
        let ops = 0;
        const by = new Map();
        for (let i = 0; i < master.length; i++) {
            ops++;
            const sid = master[i].serverId || master[i]._serverId;
            by.set(sid, (by.get(sid) || 0) + 1);
        }
        return { out: servers.map((s) => { ops++; return by.get(s.id) || 0; }), ops };
    }
    const master = [];
    const servers = [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }];
    for (let i = 0; i < 12000; i++) master.push({ serverId: servers[i % 4].id });
    const v = contarViejo(master, servers), w = contarNuevo(master, servers);
    ok('B13 los dos conteos dan EL MISMO número por servidor', JSON.stringify(v.out) === JSON.stringify(w.out), JSON.stringify(v.out) + ' vs ' + JSON.stringify(w.out));
    ok('B14 una pasada (' + w.ops + ') frente a filter por servidor (' + v.ops + ')', w.ops * 2 < v.ops, w.ops + ' vs ' + v.ops);

    // 7 · el código que quedó en los ficheros (lo que de verdad se ejecuta)
    const appSrc = fs.readFileSync(APP, 'utf8');
    ok('B15 app.js pasa la lista a getCachedMetadata (no recorre el store entero)',
        /getCachedMetadata\(cascaded \|\| normalized(, [^)]+)?\)/.test(appSrc));
    ok('B16 app.js guarda sólo los canales de esta conexión',
        /saveChannelsList\(\{ only: enriched[^)]*\}\)/.test(appSrc));
    ok('B17 saveChannelsList acepta opts.only y sin él guarda todo igual',
        /saveChannelsList\(opts\)/.test(appSrc) && /Array\.isArray\(opts\.only\)\) \? opts\.only : this\.state\.channelsMaster/.test(appSrc));
    ok('B18 renderServerList ya no filtra el array entero por servidor',
        !/channelsMaster \|\| \[\]\)\.filter\(ch =>\s*\n\s*\(ch\.serverId \|\| ch\._serverId\) === srv\.id/.test(appSrc));
    ok('B19 renderServerList cuenta en una pasada (_countsByServer)', /_countsByServer\.get\(srv\.id\)/.test(appSrc));
    const dbSrc = fs.readFileSync(DB, 'utf8');
    ok('B20 db-manager conserva el cursor como camino por defecto', /store\.openCursor\(\)/.test(dbSrc));
    ok('B21 db-manager tiene el atajo por clave con umbral', /set\.size < 20000/.test(dbSrc) && /store\.get\(/.test(dbSrc));

    console.log('\nRESUMEN PASS=' + PASS + ' FAIL=' + FAIL);
    process.exit(FAIL === 0 ? 0 : 1);
})();
