#!/usr/bin/env node
'use strict';
/*
 * test_reconcile_list_identity.js — el guard del reconciliador JIT distingue
 * "la misma lista se truncó" de "es otro catálogo".
 *
 * POR QUÉ EXISTE (medido el 2026-11-21 en producción)
 *   El servicio ape-jit-reconcile abortaba cada 5 minutos:
 *     PARSE lineas=11822796 canales=11222 ... allowlist_previa=21224
 *     ABORT solo 11222 canales (< 20163 = 95 % de 21224). No publico.
 *   No era una caída: la allowlist de 21 224 salió de
 *   APE_LISTA_1794783650337_CDN.m3u8 (1 380 561 704 B) y el reconciliador parseaba
 *   APE_LISTA_1795151699916_DIRECTA_CABLEADA.m3u8 (708 400 298 B). Dos catálogos.
 *   Comparar catálogos distintos abortaba para siempre y la allowlist quedaba congelada.
 *
 * QUÉ PRUEBA
 *   1. MISMA lista y caída por debajo del 95 %  -> exit 2 ABORT
 *   2. OTRA lista, con canales suficientes      -> exit 0 LIST_CHANGED y publica
 *   3. OTRA lista, por debajo de FLOOR_DURO     -> exit 2 ABORT
 *   4. sin tvg-id se cuenta APARTE de sin_url   -> 'sin_id=N' visible
 *   5. siembra vacía (sin allowlist previa)     -> publica sin guard
 *   6. (solo Linux/macOS) la publicación deja channels_dropped.txt y channels_added.txt
 *
 * No usa mocks: escribe listas reales en un directorio temporal y ejecuta el script
 * real con node. Las decisiones se prueban con --dry-run para que corran igual en
 * Windows (allí fs.symlinkSync da EPERM: límite del host, no del test).
 *
 * Uso: node tools/quality/test_reconcile_list_identity.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'vps/ape-jit/reconcile.js');

let pass = 0, fail = 0;
function check(nombre, ok, detalle) {
    if (ok) { pass++; console.log('  PASS  ' + nombre + (detalle ? '   -> ' + detalle : '')); }
    else { fail++; console.log('  FAIL  ' + nombre + (detalle ? '   -> ' + detalle : '')); }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-test-'));

/** Lista M3U mínima: cada canal con tvg-id y URL directa (polimorfismo del parser). */
function escribirLista(file, ids, opts) {
    const o = opts || {};
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const out = ['#EXTM3U'];
    let i = 0;
    for (const id of ids) {
        const lineas = [];
        if (id) lineas.push(`#EXTINF:-1 tvg-id="${id}" tvg-name="canal ${id}" group-title="TEST",canal ${id}`);
        else lineas.push(`#EXTINF:-1 tvg-name="sin id ${i}" group-title="TEST",sin id ${i}`);
        lineas.push(`https://proveedor.test/live/${id || 'x' + i}/index.m3u8`);
        out.push(...lineas);
        i++;
    }
    fs.writeFileSync(file, out.join('\n') + '\n', 'utf8');
}

/** Siembra la allowlist previa (current/channels.json + current/meta.json). */
function sembrarPrev(outDir, listKey, ids) {
    const cur = path.join(outDir, 'current');
    fs.mkdirSync(cur, { recursive: true });
    const map = {};
    for (const id of ids) map[id] = { url: 'https://x/' + id, ua: 'test' };
    fs.writeFileSync(path.join(cur, 'channels.json'), JSON.stringify(map), 'utf8');
    fs.writeFileSync(path.join(cur, 'meta.json'), JSON.stringify({
        version: 'test', source: '/tmp/' + listKey + '.m3u8', listKey, channels: ids.length,
    }), 'utf8');
}

function correr(args) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const cnt = (n) => Array.from({ length: n }, (_, i) => 'ch' + i);

console.log('\n=== 1 · MISMA lista truncada: aborta ===');
{
    const dir = path.join(tmpRoot, 'c1');
    const out = path.join(dir, 'out');
    sembrarPrev(out, 'APE_LISTA_A', cnt(200));
    const lista = path.join(dir, 'APE_LISTA_A.m3u8');
    escribirLista(lista, cnt(100));      // 100 < ceil(200*0.95)=190
    const r = correr(['--list', lista, '--out', out, '--dry-run']);
    check('sale 2', r.code === 2, 'code=' + r.code);
    check('dice ABORT', /ABORT/.test(r.out));
    check('nombra el ratio de la MISMA lista', /misma lista/.test(r.out), (r.out.match(/ABORT[^\n]*/) || [''])[0].slice(0, 90));
}

console.log('\n=== 2 · OTRA lista con canales suficientes: publica avisando ===');
{
    const dir = path.join(tmpRoot, 'c2');
    const out = path.join(dir, 'out');
    sembrarPrev(out, 'APE_LISTA_A', cnt(200));
    const lista = path.join(dir, 'APE_LISTA_B.m3u8');
    escribirLista(lista, cnt(150).map((x) => 'b' + x));
    const r = correr(['--list', lista, '--out', out, '--dry-run']);
    check('sale 0', r.code === 0, 'code=' + r.code);
    check('dice LIST_CHANGED', /LIST_CHANGED/.test(r.out));
    check('nombra las dos listas', /APE_LISTA_A/.test(r.out) && /APE_LISTA_B/.test(r.out));
    check('dry-run no escribe', /DRY-RUN/.test(r.out) && /no escribo nada/.test(r.out));
    check('deja traza nominal de salidas', /salen=200/.test(r.out) && /entran=150/.test(r.out), (r.out.match(/TRAZA[^\n]*/) || [''])[0].slice(0, 90));
}

console.log('\n=== 3 · OTRA lista por debajo de FLOOR_DURO: aborta ===');
{
    const dir = path.join(tmpRoot, 'c3');
    const out = path.join(dir, 'out');
    sembrarPrev(out, 'APE_LISTA_A', cnt(200));
    const lista = path.join(dir, 'APE_LISTA_C.m3u8');
    escribirLista(lista, cnt(50));
    const r = correr(['--list', lista, '--out', out, '--dry-run']);
    check('sale 2', r.code === 2, 'code=' + r.code);
    check('cita FLOOR_DURO', /FLOOR_DURO/.test(r.out), (r.out.match(/ABORT[^\n]*/) || [''])[0].slice(0, 90));
}

console.log('\n=== 4 · sin tvg-id se cuenta aparte de sin_url ===');
{
    const dir = path.join(tmpRoot, 'c4');
    const out = path.join(dir, 'out');
    const lista = path.join(dir, 'APE_LISTA_D.m3u8');
    // 2 con id, 3 sin id
    escribirLista(lista, ['id1', 'id2', '', '', '']);
    const r = correr(['--list', lista, '--out', out, '--dry-run']);
    check('canales=2', /canales=2\b/.test(r.out), (r.out.match(/PARSE[^\n]*/) || [''])[0].slice(0, 100));
    check('sin_id=3', /sin_id=3\b/.test(r.out));
    check('sin_url=0 (no los mezcla)', /sin_url=0\b/.test(r.out));
}

console.log('\n=== 5 · sin allowlist previa: publica sin guard ===');
{
    const dir = path.join(tmpRoot, 'c5');
    const out = path.join(dir, 'out');
    const lista = path.join(dir, 'APE_LISTA_E.m3u8');
    escribirLista(lista, cnt(120));
    const r = correr(['--list', lista, '--out', out, '--dry-run']);
    check('sale 0', r.code === 0, 'code=' + r.code);
    check('no inventa LIST_CHANGED sin previa', !/LIST_CHANGED/.test(r.out));
}

console.log('\n=== 5b · lista YA ENVUELTA (apunta al propio JIT): aborta, no publica bucle ===');
{
    // Bloque con ?u= que apunta a nuestro propio /jit/live/... : toCdn lo re-envuelve
    // y el host resultante es el nuestro -> bucle. Es el caso real medido el 2026-11-21
    // en APE_LISTA_1795151699916_DIRECTA_CABLEADA (3/3 propias).
    const dir = path.join(tmpRoot, 'c5b');
    const out = path.join(dir, 'out');
    fs.mkdirSync(dir, { recursive: true });
    const lista = path.join(dir, 'APE_LISTA_WRAPPED.m3u8');
    const own = 'https://iptv-ape.duckdns.org/jit/live/%d/master.m3u8';
    const lineas = ['#EXTM3U'];
    for (let i = 0; i < 120; i++) {
        lineas.push(`#EXTINF:-1 tvg-id="w${i}" tvg-name="w${i}" group-title="TEST",w${i}`);
        lineas.push('https://iptv-ape.duckdns.org/pulse/?u=' + encodeURIComponent(own.replace('%d', String(i))));
    }
    fs.writeFileSync(lista, lineas.join('\n') + '\n', 'utf8');
    const r = correr(['--list', lista, '--out', out, '--dry-run']);
    check('sale 2', r.code === 2, 'code=' + r.code);
    check('dice LISTA_ENVUELTA', /LISTA_ENVUELTA/.test(r.out), (r.out.match(/ABORT[^\n]*/) || [''])[0].slice(0, 100));
    check('cuenta el bucle', /bucle=120\b/.test(r.out), (r.out.match(/PARSE[^\n]*/) || [''])[0].slice(0, 110));
}

console.log('\n=== 5c · --dir: se descarta la envuelta y se elige la CRUDA aunque sea mas vieja ===');
{
    const dir = path.join(tmpRoot, 'c5c');
    fs.mkdirSync(dir, { recursive: true });
    // crate de dos listas: la envuelta es MAS NUEVA (ganaria por mtime), la cruda es la buena.
    const wrapped = path.join(dir, 'APE_LISTA_900_WRAPPED.m3u8');
    fs.writeFileSync(wrapped, [
        '#EXTM3U',
        '#EXTINF:-1 tvg-id="w1",w1',
        'https://iptv-ape.duckdns.org/pulse/?u=' + encodeURIComponent('https://iptv-ape.duckdns.org/jit/live/1/master.m3u8'),
    ].join('\n') + '\n', 'utf8');
    const raw = path.join(dir, 'APE_LISTA_800_CDN.m3u8');
    escribirLista(raw, ['r1', 'r2', 'r3']);
    // la envuelta, mas reciente
    const t = new Date(Date.now() + 60000);
    fs.utimesSync(wrapped, t, t);
    const out = path.join(dir, 'out');
    const r = correr(['--dir', dir, '--out', out, '--dry-run']);
    check('sale 0', r.code === 0, 'code=' + r.code);
    check('nombra la candidata descartada', /CANDIDATA descartada/.test(r.out) && /900_WRAPPED/.test(r.out));
    check('elige la cruda', /APE_LISTA_800_CDN/.test(r.out) && !/LISTA_ENVUELTA/.test(r.out),
        (r.out.match(/LIST [^\n]*/) || [''])[0].slice(0, 110));
}

if (process.platform === 'win32') {
    console.log('\n=== 6 · publicación real: OMITIDA en Windows (fs.symlinkSync da EPERM) ===');
} else {
    console.log('\n=== 6 · publicación real deja las trazas en la release ===');
    {
        const dir = path.join(tmpRoot, 'c6');
        const out = path.join(dir, 'out');
        const lista = path.join(dir, 'APE_LISTA_F.m3u8');
        escribirLista(lista, cnt(120));
        const r = correr(['--list', lista, '--out', out]);
        check('sale 0', r.code === 0, 'code=' + r.code);
        check('dice PUBLISH', /PUBLISH/.test(r.out));
        const releases = path.join(out, 'releases');
        const v = fs.existsSync(releases) ? fs.readdirSync(releases)[0] : null;
        const vdir = v ? path.join(releases, v) : null;
        check('hay release', !!vdir && fs.existsSync(vdir), 'release=' + v);
        check('channels_dropped.txt existe', !!vdir && fs.existsSync(path.join(vdir, 'channels_dropped.txt')));
        check('channels_added.txt lista los 120', !!vdir &&
            fs.readFileSync(path.join(vdir, 'channels_added.txt'), 'utf8').split('\n').filter(Boolean).length === 120);
        const meta = vdir && fs.existsSync(path.join(vdir, 'meta.json'))
            ? JSON.parse(fs.readFileSync(path.join(vdir, 'meta.json'), 'utf8')) : {};
        check('meta lleva listKey', meta.listKey === 'APE_LISTA_F', 'listKey=' + meta.listKey);
        check('meta lleva added=120', meta.added === 120, 'added=' + meta.added);
    }
}

try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) { /* noop */ }

console.log('\nRESUMEN PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
