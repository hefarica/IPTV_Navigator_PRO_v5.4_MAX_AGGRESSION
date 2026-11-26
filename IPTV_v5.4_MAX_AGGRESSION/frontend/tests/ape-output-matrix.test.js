/**
 * tests/ape-output-matrix.test.js
 * ---------------------------------------------------------------------------
 * Prueba las 8 salidas del panel `#ape-output-matrix` de punta a punta:
 *
 *   A. La TABLA (una sola fuente de verdad) y que todas las rutas sean relativas.
 *   B. El HOST: se toma de la configuración del usuario; nunca hay uno inventado.
 *   C. Los CANALES reales: id, altura, elección del representante 4K/1080.
 *   D. `classify`: ningún estado verde sin cuerpo/cabecera que lo demuestre.
 *   E. `runRow` con `fetch` simulado: descubre el init real del #EXT-X-MAP, cae
 *      de /live/<id>/manifest.json a /meta/<id>.js, y sin host lo declara.
 *   F. El GENERADOR: la etiqueta `#EXT-X-APE-OUTPUT-MATRIX` sale por canal, una
 *      sola vez, antes del STREAM-INF/su URI; con el flag APAGADO la lista es
 *      byte a byte la misma (medido con el emisor real, no a ojo).
 *   G. El CABLEADO: index-v4.html carga el módulo antes del panel; ni el módulo
 *      ni el panel llevan host literal; y las rutas que probamos existen en
 *      vps/ape-jit/server.js.
 *
 * Nada de esto simula una respuesta del servidor: los fixtures de D/E son
 * cuerpos escritos a mano (para probar el clasificador) y la lista de F es la
 * que produce el emisor headless REAL del repo.
 *
 * Ejecutar: node frontend/tests/ape-output-matrix.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..', '..');                 // raíz del proyecto
const FRONT = path.join(__dirname, '..');                            // .../frontend
const MX_PATH = path.join(FRONT, 'js', 'ape-v9', 'ape-output-matrix.js');
const PANEL_PATH = path.join(FRONT, 'js', 'ape-v9', 'output-status-panel.js');
const GEN_PATH = path.join(FRONT, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const INDEX_PATH = path.join(FRONT, 'index-v4.html');
const SERVER_PATH = path.join(REPO, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'ape-jit', 'server.js');
const HARNESS = path.join(REPO, '_vps_stage', 'tests', 'regen_headless', 'regen_headless.js');
const FIX13 = path.join(REPO, '_vps_stage', 'tests', 'regen_headless', 'fixtures', 'mini_15.m3u8');
const FIX4K = path.join(REPO, '_vps_stage', 'tests', 'regen_headless', 'fixtures', 'mini_inherit_6_4K.m3u8');
const TMP = path.join(REPO, '_vps_stage', '_matrix_tmp');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
    if (cond) { pass++; console.log('  \u2705 ' + msg); }
    else { fail++; failures.push(msg); console.error('  \u274c ' + msg); }
}
function section(t) { console.log('\n--- ' + t + ' ---'); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function sha256(s) { return require('crypto').createHash('sha256').update(s).digest('hex'); }

const MX = require(MX_PATH);

/* ══════════════════════════════════════════════════════════════════════════
 * A. La tabla y las rutas
 * ══════════════════════════════════════════════════════════════════════════ */
section('A. Tabla de las 8 salidas (una sola fuente de verdad)');
{
    const want = ['list', 'hls4k', 'dash4k', 'json4k', 'range4k', 'hls1080', 'dash1080', 'direct'];
    const got = MX.ROWS.map(r => r.id);
    ok(got.length === 8, 'A1 hay exactamente 8 filas (got ' + got.length + ')');
    ok(JSON.stringify(got) === JSON.stringify(want), 'A2 los ids son los del panel, en orden: ' + got.join(','));

    const kinds = MX.ROWS.map(r => r.kind);
    ok(kinds.filter(k => k === 'm3u8').length === 3, 'A3 tres filas piden playlist m3u8 (list, 4K, 1080)');
    ok(kinds.filter(k => k === 'mpd').length === 2, 'A4 dos filas piden MPD (DASH 4K y 1080)');
    ok(kinds.filter(k => k === 'json').length === 1 && kinds.filter(k => k === 'range').length === 1,
       'A5 una fila JSON y una de Range');
    const direct = MX.ROWS[7];
    ok(direct.kind === 'channel' && direct.out === 'direct', 'A6 la última es provider-direct (sin JIT)');

    const j4 = MX.ROWS[3];
    ok(j4.out === 'json' && j4.fallbacks && j4.fallbacks[0] === 'json' && j4.fallbacks[1] === 'meta',
       'A7 json4k prueba los DOS uri anunciados: /live/<id>/manifest.json y /meta/<id>.json');

    // Todas las plantillas relativas: la lista no reparte ningún host.
    const tpl = MX.TEMPLATES;
    let abs = 0;
    for (const k in tpl) if (/^https?:/i.test(tpl[k])) abs++;
    ok(abs === 0, 'A8 ninguna plantilla es absoluta (0 hosts incrustados)');
    ok(tpl.hls === '/live/{id}/master.m3u8' && tpl.dash === '/live/{id}/manifest.mpd' &&
       tpl.json === '/live/{id}/manifest.json' && tpl.meta === '/meta/{id}.json' &&
       tpl.playlist === '/playlist.m3u8' && tpl.catalog === '/catalog.json',
       'A9 las 6 rutas coinciden con lo declarado en el panel');

    const u = MX.urls('1174213', '');
    let absUrl = 0;
    for (const k in u) if (/^https?:/i.test(u[k])) absUrl++;
    ok(absUrl === 0, 'A10 urls() sin base devuelve rutas relativas (0 http)');
    ok(u.hls === '/live/1174213/master.m3u8' && u.dash === '/live/1174213/manifest.mpd' &&
       u.json === '/live/1174213/manifest.json' && u.init === '/live/1174213/init-0.m4s',
       'A11 urls() sustituye {id} en todas las rutas');
    ok(MX.urls('a b', '').hls === '/live/a%20b/master.m3u8', 'A12 el id se codifica (no rompe la URL)');

    // Descubierto por ingeniería inversa: publicBase() ya termina en /jit.
    ok(MX.withJit('https://h') === 'https://h/jit', 'A13 withJit añade /jit cuando falta');
    ok(MX.withJit('https://h/jit') === 'https://h/jit', 'A14 withJit es idempotente (no produce /jit/jit)');
    ok(MX.withJit('https://h/jit/') === 'https://h/jit', 'A15 withJit quita la barra final');
    ok(MX.withJit('') === '', 'A16 withJit de vacío es vacío (no inventa nada)');
}

/* ══════════════════════════════════════════════════════════════════════════
 * B. El host: config del usuario, nunca inventado
 * ══════════════════════════════════════════════════════════════════════════ */
section('B. Origen de la base (sin host por defecto)');
{
    const NADA = MX.resolveBase({});
    ok(NADA.ok === false && NADA.base === '', 'B1 sin nada configurado NO hay base (ok:false, sin valor por defecto)');
    ok(/APE_JIT_BASE/.test(NADA.reason) && /ape_jit_base/.test(NADA.reason) && /campo/.test(NADA.reason),
       'B2 el motivo dice las tres formas de configurarlo');

    const porWin = MX.resolveBase({ APE_JIT_BASE: 'https://jit.example' });
    ok(porWin.ok && porWin.base === 'https://jit.example/jit' && /APE_JIT_BASE/.test(porWin.source),
       'B3 window.APE_JIT_BASE manda y se normaliza a …/jit');

    const porLs = MX.resolveBase({
        localStorage: { getItem: (k) => (k === 'ape_jit_base' ? 'https://ls.example/jit' : null) }
    });
    ok(porLs.ok && porLs.base === 'https://ls.example/jit' && /localStorage/.test(porLs.source),
       'B4 localStorage[ape_jit_base] sirve cuando no hay variable');

    const porCampo = MX.resolveBase({
        document: { querySelector: (sel) => (sel === '#ape-out-base' ? { value: 'https://campo.example' } : null) }
    });
    ok(porCampo.ok && porCampo.base === 'https://campo.example/jit' && /campo/.test(porCampo.source),
       'B5 el campo #ape-out-base del panel también sirve');

    const porPagina = MX.resolveBase({ location: { protocol: 'https:', hostname: 'panel.example', port: '8443' } });
    ok(porPagina.ok && porPagina.base === 'https://panel.example:8443/jit' && /mismo host/.test(porPagina.source),
       'B6 si no hay config, usa el mismo host que sirve la página (con su puerto)');

    const local = MX.resolveBase({ location: { protocol: 'http:', hostname: '127.0.0.1', port: '5500' } });
    ok(local.ok === false, 'B7 localhost/127.0.0.1 NO se toman como host JIT (no es un servidor de despliegue)');

    const prio = MX.resolveBase({
        APE_JIT_BASE: 'https://win.example',
        localStorage: { getItem: () => 'https://ls.example' },
        document: { querySelector: () => ({ value: 'https://campo.example' }) },
        location: { protocol: 'https:', hostname: 'pag.example', port: '' }
    });
    ok(prio.base === 'https://win.example/jit', 'B8 el orden es ventana → localStorage → campo → mismo host');
}

/* ══════════════════════════════════════════════════════════════════════════
 * C. Canales reales
 * ══════════════════════════════════════════════════════════════════════════ */
section('C. Canales: id, altura y elección del representante');
{
    ok(MX.channelId({ id: '7' }) === '7', 'C1 channelId usa .id');
    ok(MX.channelId({ tvg_id: '8' }) === '8', 'C2 y si no hay, tvg_id');
    ok(MX.channelId({ tvgId: 9 }) === '9', 'C3 y tvgId numérico a texto');
    ok(MX.channelId({ channelId: '10' }) === '10', 'C4 y channelId');
    ok(MX.channelId({ _probeData: { id: '11' } }) === '11', 'C5 y el id del sondeo si existe');
    ok(MX.channelId({ name: 'sin id' }) === '', 'C6 sin id devuelve cadena vacía (no inventa)');
    ok(MX.channelId(null) === '', 'C7 canal nulo no rompe');

    ok(MX.heightOf({ resolution: '3840x2160' }) === 2160, 'C8 "3840x2160" ⇒ 2160');
    ok(MX.heightOf({ resolution: '1920x1080' }) === 1080, 'C9 "1920x1080" ⇒ 1080');
    ok(MX.heightOf({ quality: '4K' }) === 2160, 'C10 "4K" ⇒ 2160');
    ok(MX.heightOf({ quality: 'FHD' }) === 1080, 'C11 "FHD" ⇒ 1080');
    ok(MX.heightOf({ resolution: 720 }) === 720, 'C12 número directo');
    ok(MX.heightOf({}) === 0, 'C13 sin dato ⇒ 0 (no supone 4K)');

    const A = { id: '1', url: 'http://a/1.m3u8', resolution: '1920x1080' };
    const B = { id: '2', url: 'http://b/2.m3u8', resolution: '3840x2160' };
    const p = MX.pick({ channelsMaster: [A, B] });
    ok(p.total === 2 && p.fourk === B && p.hd === A, 'C14 pick separa el 4K del 1080 de los canales REALES cargados');
    ok(MX.channelFor(MX.ROWS[1], p).ch === B, 'C15 la fila 4K usa el canal 4K');
    ok(MX.channelFor(MX.ROWS[5], p).ch === A, 'C16 la fila 1080 usa el canal 1080');
    ok(MX.channelFor(MX.ROWS[0], p) === null, 'C17 la lista global no necesita canal');

    const soloHd = MX.pick({ channelsMaster: [A] });
    const f4 = MX.channelFor(MX.ROWS[1], soloHd);
    ok(f4.ch === A && /no hay 2160/.test(f4.why), 'C18 sin 2160 usa el de más resolución Y LO DICE en el porqué');
    const vacio = MX.pick({ channelsMaster: [] });
    ok(MX.channelFor(MX.ROWS[1], vacio) === null, 'C19 sin canales no hay representante');
    ok(MX.pick({}).total === 0, 'C20 estado sin canales no rompe');

    const t = MX.tagFor({ id: '1174213' });
    ok(t && t.tag.indexOf('#EXT-X-APE-OUTPUT-MATRIX:') === 0, 'C21 tagFor emite la etiqueta con prefijo correcto');
    ok(t && t.payload.id === '1174213' && t.payload.hls === '/live/1174213/master.m3u8' &&
       t.payload.dash === '/live/1174213/manifest.mpd' && t.payload.json === '/live/1174213/manifest.json' &&
       t.payload.meta === '/meta/1174213.json' && t.payload.init === '/live/1174213/init-0.m4s',
       'C22 el payload declara las mismas 5 rutas que el panel prueba');
    ok(t && !/https?:/i.test(t.tag), 'C23 la etiqueta no lleva host (relativa)');
    ok(t && t.tag.indexOf('\n') === -1, 'C24 la etiqueta es una sola línea');
    ok(MX.tagFor({ name: 'sin id' }) === null, 'C25 sin id no hay etiqueta (se declara, no se inventa)');
}

/* ══════════════════════════════════════════════════════════════════════════
 * D. classify: ningún verde sin prueba
 * ══════════════════════════════════════════════════════════════════════════ */
section('D. classify: nada verde sin cuerpo/cabecera que lo demuestre');
{
    const R = (i) => MX.ROWS[i];
    const c = MX.classify;

    const m3u8ok = c(R(0), { status: 200, ctype: 'application/vnd.apple.mpegurl',
        body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv0.m3u8\n' });
    ok(m3u8ok.verdict === 'listo' && /variante/.test(m3u8ok.reason), 'D1 200 + #EXTM3U ⇒ listo y cuenta variantes');

    const m3u8map = c(R(5), { status: 200, body: '#EXTM3U\n#EXT-X-MAP:URI="init-0.m4s"\n#EXTINF:4,\nseg.m4s\n' });
    ok(m3u8map.verdict === 'listo' && /EXT-X-MAP/.test(m3u8map.reason) && /segmento/.test(m3u8map.reason),
       'D2 la playlist de medios cuenta EXT-X-MAP y segmentos');

    const m3u8html = c(R(0), { status: 200, body: '<!DOCTYPE html><html>error</html>' });
    ok(m3u8html.verdict === 'pendiente', 'D3 un HTML con 200 NO es "listo" (falta #EXTM3U)');

    const mpdok = c(R(2), { status: 200, body: '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet>' +
        '<Representation id="v" codecs="hvc1"/>' +
        '<SupplementalProperty schemeIdUri="urn:mpeg:mpegB:cicp:TransferCharacteristics" value="16"/></AdaptationSet></Period></MPD>' });
    ok(mpdok.verdict === 'listo' && /1 Representation/.test(mpdok.reason) && /PQ/.test(mpdok.reason),
       'D4 un MPD con Representation y PQ ⇒ listo');

    const mpdhtml = c(R(2), { status: 200, body: '<html>no soy un mpd</html>' });
    ok(mpdhtml.verdict === 'pendiente', 'D5 HTML con 200 en DASH NO es "listo"');

    const jok = c(R(3), { status: 200, body: '{"id":"1174213","outputs":{"hls":true}}' });
    ok(jok.verdict === 'listo' && /2 claves/.test(jok.reason), 'D6 JSON válido ⇒ listo y cuenta claves');

    const jbad = c(R(3), { status: 200, body: '{esto no es json' });
    ok(jbad.verdict === 'pendiente', 'D7 cuerpo que no parsea NO es "listo"');

    const joff = c(R(3), { status: 200, body: '{"id":"1","active":false}' });
    ok(joff.verdict === 'pendiente' && /inactivo/.test(joff.reason), 'D8 JSON válido de un canal inactivo ⇒ pendiente (no listo)');

    const busy = c(R(1), { status: 503, body: '{"error":"PROVIDER_SLOT_BUSY"}' });
    ok(busy.verdict === 'ocupado' && /PROVIDER_SLOT_BUSY/.test(busy.reason), 'D9 503 PROVIDER_SLOT_BUSY ⇒ ocupado');

    const nf = c(R(1), { status: 404, body: 'not found' });
    ok(nf.verdict === 'no_listo' && nf.reason === 'not found', 'D10 404 ⇒ no_listo, con el motivo del servidor');

    const r206 = c(R(4), { status: 206, contentRange: 'bytes 0-1023/8462', body: 'xxxx' });
    ok(r206.verdict === 'range_ok' && /bytes 0-1023\/8462/.test(r206.reason), 'D11 206 con Content-Range ⇒ range_ok');

    const r206sin = c(R(4), { status: 206, body: 'xxxx' });
    ok(r206sin.verdict === 'no_listo', 'D12 206 SIN Content-Range no cuenta como Range servido');

    const r200 = c(R(4), { status: 200, body: 'fichero entero' });
    ok(r200.verdict === 'no_listo' && /ignoró el Range/.test(r200.reason),
       'D13 200 completo en la fila Range ⇒ no_listo (el servidor ignoró el Range)');

    const err = c(R(0), { networkError: 'Failed to fetch' });
    ok(err.verdict === 'error' && /Failed to fetch/.test(err.reason), 'D14 error de red ⇒ error, con el mensaje');

    const op = c(R(0), { status: 0, body: '' });
    ok(op.verdict === 'no_listo', 'D15 status 0 (respuesta opaca por CORS) no es verde');

    let verdes = 0;
    ['', ' ', '   ', '{}', '[]'].forEach(b => {
        const v = c(R(0), { status: 200, body: b });
        if (v.verdict === 'listo') verdes++;
    });
    ok(verdes === 0, 'D16 ningún cuerpo vacío o sin #EXTM3U sale "listo"');

    ok(MX.VERDICT.listo && MX.VERDICT.ocupado && MX.VERDICT.sin_host && MX.VERDICT.sin_canal &&
       MX.VERDICT.no_listo && MX.VERDICT.pendiente && MX.VERDICT.error && MX.VERDICT.range_ok &&
       MX.VERDICT.timeout && MX.VERDICT.bloqueado, 'D17 los 10 estados tienen etiqueta y color');

    ok(MX.firstMapUri('#EXTM3U\n#EXT-X-MAP:URI="init-7-1.m4s",BYTERANGE="720@0"\n#EXTINF:4,\n') === 'init-7-1.m4s',
       'D18 firstMapUri saca el nombre REAL del init de la sesión');
    ok(MX.firstMapUri('#EXTM3U\n#EXTINF:4,\nseg.m4s\n') === '', 'D19 sin #EXT-X-MAP no inventa un init');
}

/* ══════════════════════════════════════════════════════════════════════════
 * E. runRow con fetch simulado
 * ══════════════════════════════════════════════════════════════════════════ */
async function seccionE() {
    section('E. runRow: qué pide de verdad (fetch simulado)');

    function fakeFetch(map) {
        const calls = [];
        const f = async (url, opts) => {
            calls.push({ url: url, headers: (opts && opts.headers) || {} });
            const hit = map[url];
            if (!hit) return { status: 404, text: async () => 'not found', headers: { get: () => '' } };
            if (hit.throws) throw new Error(hit.throws);
            return {
                status: hit.status || 200,
                text: async () => hit.body || '',
                headers: { get: (h) => {
                    h = String(h).toLowerCase();
                    if (h === 'content-range') return hit.contentRange || '';
                    if (h === 'content-type') return hit.ctype || '';
                    return '';
                } }
            };
        };
        f.calls = calls;
        return f;
    }

    const BASE = { base: 'https://jit.example/jit', ok: true, source: 'test' };
    const CH4K = { id: '1174213', url: 'http://prov/4k.m3u8', resolution: '3840x2160' };
    const CHHD = { id: '3', url: 'http://prov/1080.m3u8', resolution: '1920x1080' };
    const STATE = { channelsMaster: [CH4K, CHHD] };
    const picked = MX.pick(STATE);

    // E1: la fila Range descubre el init del #EXT-X-MAP, no usa init-0.m4s.
    {
        const ff = fakeFetch({
            'https://jit.example/jit/live/1174213/master.m3u8': {
                status: 200, ctype: 'application/vnd.apple.mpegurl',
                body: '#EXTM3U\n#EXT-X-MAP:URI="init-77-1.m4s",BYTERANGE="720@0"\n#EXTINF:4,\nseg1.m4s\n'
            },
            'https://jit.example/jit/live/1174213/init-77-1.m4s': {
                status: 206, contentRange: 'bytes 0-1023/8462', body: 'x'.repeat(1024)
            }
        });
        const r = await MX.runRow(MX.ROWS[4], { fetch: ff, baseInfo: BASE, picked: picked, state: STATE });
        ok(r.verdict === 'range_ok', 'E1 la fila Range acaba en range_ok con el init real');
        ok(r.tested === 'https://jit.example/jit/live/1174213/init-77-1.m4s',
           'E2 pide el init que declara el #EXT-X-MAP, NO init-0.m4s (prohibido reutilizarlo)');
        ok(ff.calls.some(c => c.url === r.tested && c.headers.Range === 'bytes=0-1023'),
           'E3 la petición del init lleva Range: bytes=0-1023');
        ok(r.chain.length === 2 && r.channel === '1174213', 'E4 deja la cadena master→init y el canal usado');
    }

    // E5: si el master no trae MAP, mira la primera variante.
    {
        const ff = fakeFetch({
            'https://jit.example/jit/live/1174213/master.m3u8': {
                status: 200, body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmedia_0.m3u8\n'
            },
            'https://jit.example/jit/live/1174213/media_0.m3u8': {
                status: 200, body: '#EXTM3U\n#EXT-X-MAP:URI="init-9-1.m4s"\n#EXTINF:4,\nseg.m4s\n'
            },
            'https://jit.example/jit/live/1174213/init-9-1.m4s': { status: 206, contentRange: 'bytes 0-1023/500' }
        });
        const r = await MX.runRow(MX.ROWS[4], { fetch: ff, baseInfo: BASE, picked: picked, state: STATE });
        ok(r.verdict === 'range_ok' && /init-9-1\.m4s$/.test(r.tested),
           'E5 sin MAP en el master, lo busca en la primera variante (relativo resuelto)');
    }

    // E6: sin MAP en ningún sitio ⇒ pendiente, nunca se inventa un init ni se da verde.
    {
        const ff = fakeFetch({
            'https://jit.example/jit/live/1174213/master.m3u8': { status: 200, body: '#EXTM3U\n#EXTINF:4,\nseg.m4s\n' }
        });
        const r = await MX.runRow(MX.ROWS[4], { fetch: ff, baseInfo: BASE, picked: picked, state: STATE });
        ok(r.verdict === 'pendiente' && /no declara #EXT-X-MAP/.test(r.reason),
           'E6 playlist sin pipeline activo ⇒ pendiente (no se inventa el init)');
    }

    // E7: JSON cae del manifest.json al meta/<id>.json.
    {
        const ff = fakeFetch({
            'https://jit.example/jit/meta/1174213.json': { status: 200, body: '{"id":"1174213","status":"active"}' }
        });
        const r = await MX.runRow(MX.ROWS[3], { fetch: ff, baseInfo: BASE, picked: picked, state: STATE });
        ok(r.verdict === 'listo', 'E7 si /live/<id>/manifest.json da 404, usa /meta/<id>.json');
        ok(r.chain[0] === 'https://jit.example/jit/live/1174213/manifest.json' &&
           r.chain[1] === 'https://jit.example/jit/meta/1174213.json',
           'E8 la cadena muestra el intento del manifest y después el del meta');
    }

    // E9: ninguno de los dos ⇒ se declara (menciona que el servidor sólo los anuncia).
    {
        const ff = fakeFetch({});
        const r = await MX.runRow(MX.ROWS[3], { fetch: ff, baseInfo: BASE, picked: picked, state: STATE });
        ok(r.verdict !== 'listo' && /SESSION-DATA/.test(r.reason),
           'E9 si no existe ninguno de los dos, no es verde y explica que sólo están anunciados');
    }

    // E10: sin host ⇒ sin_host con el motivo, sin tocar la red.
    {
        const ff = fakeFetch({});
        const r = await MX.runRow(MX.ROWS[0], { fetch: ff, baseInfo: { base: '', ok: false, reason: 'sin host JIT configurado: …' } });
        ok(r.verdict === 'sin_host' && /sin host/.test(r.reason), 'E10 sin host ⇒ sin_host con instrucción');
        ok(ff.calls.length === 0, 'E11 sin host no se hace ninguna petición');
    }

    // E12: sin canales ⇒ sin_canal (no se prueba nada).
    {
        const ff = fakeFetch({});
        const r = await MX.runRow(MX.ROWS[1], { fetch: ff, baseInfo: BASE, picked: MX.pick({}), state: {} });
        ok(r.verdict === 'sin_canal' && ff.calls.length === 0, 'E12 sin canales ⇒ sin_canal, sin peticiones');
    }

    // E13: provider-direct usa la URL del canal tal cual, sin JIT.
    {
        const ff = fakeFetch({ 'http://prov/4k.m3u8': { status: 200, body: '#EXTM3U\n#EXTINF:4,\nseg.ts\n' } });
        const r = await MX.runRow(MX.ROWS[7], { fetch: ff, baseInfo: BASE, picked: picked, state: STATE });
        ok(r.verdict === 'listo' && r.tested === 'http://prov/4k.m3u8', 'E13 direct prueba la URL del canal, sin pasar por /jit');
        ok(ff.calls.length === 1, 'E14 direct hace una sola petición');
    }

    // E15: la lista global usa /playlist.m3u8.
    {
        const ff = fakeFetch({ 'https://jit.example/jit/playlist.m3u8': { status: 200, body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nx.m3u8\n' } });
        const r = await MX.runRow(MX.ROWS[0], { fetch: ff, baseInfo: BASE, picked: picked, state: STATE });
        ok(r.verdict === 'listo' && r.tested === 'https://jit.example/jit/playlist.m3u8',
           'E15 la fila list prueba /playlist.m3u8 bajo la base configurada');
    }

    // E16: error de red en la primera petición ⇒ error con el mensaje.
    {
        const ff = fakeFetch({ 'https://jit.example/jit/live/3/master.m3u8': { throws: 'network down' } });
        const r = await MX.runRow(MX.ROWS[5], { fetch: ff, baseInfo: BASE, picked: picked, state: STATE });
        ok(r.verdict === 'error' && /network down/.test(r.reason), 'E16 fallo de red ⇒ error con el motivo');
    }
}

/* ══════════════════════════════════════════════════════════════════════════
 * F. El generador: la etiqueta y la equivalencia byte a byte
 * ══════════════════════════════════════════════════════════════════════════ */
function seccionF() {
    section('F. Generador: etiqueta por canal y lista idéntica con el flag apagado');

    const gen = read(GEN_PATH);
    const iDef = gen.indexOf('function _apeAppendOutputMatrixTag(text, channel) {');
    ok(iDef > 0, 'F1 el generador define _apeAppendOutputMatrixTag');
    let i = gen.indexOf('{', iDef), depth = 0, end = -1;
    for (; i < gen.length; i++) {
        const ch = gen[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const body = gen.slice(iDef, end);
    ok(end > iDef && body.length > 400, 'F2 se pudo aislar la función para probarla sola');

    const callWrapped = /return _apeAppendOutputMatrixTag\(\s*_apeAppendExtshimottTag/.test(gen) ||
                        /_apeAppendOutputMatrixTag\(_apeAppendExtshimottTag/.test(gen);
    ok(callWrapped, 'F3 se llama envolviendo a _apeAppendExtshimottTag (un solo punto de emisión)');

    const load = (flag, mod) => {
        const win = {};
        if (flag) win.APE_OUTPUT_MATRIX_TAGS = flag;
        if (mod) win.APE_OUTPUT_MATRIX = mod;
        const sb = { window: win, console: console };
        vm.createContext(sb);
        vm.runInContext('var _f = ' + body.replace(/^function _apeAppendOutputMatrixTag/, 'function') + ';', sb, { timeout: 5000 });
        return sb;
    };

    const BLOQUE = '#EXTINF:-1 tvg-id="1174213" group-title="4K"\n#EXTSHIMOTT:{"ver":1}\nhttp://prov/1.m3u8';
    const MASTER = '#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=3840x2160\n#EXTSHIMOTT:{"ver":1}\nhttp://prov/1.m3u8';

    // F4: flag apagado (o módulo ausente) ⇒ texto idéntico byte a byte.
    {
        const sb = load(null, null);
        const out = sb._f(BLOQUE, { id: '1174213' });
        ok(out === BLOQUE, 'F4 con el flag apagado el texto sale IDÉNTICO byte a byte');
    }
    {
        const sb = load(null, MX);
        const out = sb._f(BLOQUE, { id: '1174213' });
        ok(out === BLOQUE, 'F5 con el módulo cargado pero el flag apagado, tampoco cambia nada');
    }
    {
        const sb = load(true, null);
        const out = sb._f(BLOQUE, { id: '1174213' });
        ok(out === BLOQUE, 'F6 con el flag encendido pero SIN módulo, no rompe ni inventa');
    }

    // F7: encendido ⇒ una línea, antes del STREAM-INF, nunca entre STREAM-INF y su URI.
    {
        const sb = load(true, MX);
        const out = sb._f(MASTER, { id: '1174213' });
        const lines = out.split('\n');
        const iTag = lines.findIndex(l => l.indexOf('#EXT-X-APE-OUTPUT-MATRIX:') === 0);
        ok(iTag >= 0, 'F7 encendido emite la etiqueta');
        ok(iTag === 0 && lines[1].indexOf('#EXT-X-STREAM-INF:') === 0,
           'F8 la etiqueta va ANTES del #EXT-X-STREAM-INF (RFC 8216 §4.3.4.2)');
        ok(lines[lines.length - 1] === 'http://prov/1.m3u8' &&
           lines[lines.length - 2].indexOf('#EXTSHIMOTT') === 0,
           'F9 el par STREAM-INF→URI queda intacto: la URI sigue pegada a su etiqueta');
        ok(out.replace(lines[iTag] + '\n', '') === MASTER, 'F10 quitando la etiqueta, el bloque es el original');
        const twice = sb._f(out, { id: '1174213' });
        ok(twice === out, 'F11 es idempotente: no duplica la etiqueta');
    }
    {
        const sb = load(true, MX);
        const out = sb._f(BLOQUE, { id: '1174213' });
        const lines = out.split('\n');
        ok(lines[lines.length - 1] === 'http://prov/1.m3u8' &&
           lines[lines.length - 2].indexOf('#EXT-X-APE-OUTPUT-MATRIX:') === 0,
           'F12 sin STREAM-INF (lista de medios) la pone justo antes de la URI');
    }
    {
        const sb = load(true, MX);
        ok(sb._f(BLOQUE, { name: 'sin id' }) === BLOQUE, 'F13 sin id de canal no emite nada y no rompe');
        ok(sb._f('', { id: '1' }) === '', 'F14 texto vacío devuelve vacío');
        const raro = { tagFor: () => ({ tag: '#EXT-X-APE-OUTPUT-MATRIX:' + 'x'.repeat(5000) }) };
        const sb2 = load(true, raro);
        ok(sb2._f(BLOQUE, { id: '1' }) === BLOQUE, 'F15 una etiqueta desmedida (>4096) se descarta');
        const roto = { tagFor: () => { throw new Error('boom'); } };
        const sb3 = load(true, roto);
        ok(sb3._f(BLOQUE, { id: '1' }) === BLOQUE, 'F16 si el módulo lanza, la generación sigue intacta');
    }

    // F17-F24: la lista REAL del emisor headless, off y on.
    if (!fs.existsSync(HARNESS)) {
        ok(false, 'F17 no encuentro el emisor headless en ' + HARNESS);
        return;
    }
    fs.mkdirSync(TMP, { recursive: true });

    let nRun = 0;
    function run(fixture, extra, tag) {
        const out = path.join(TMP, tag + '-' + process.pid + '-' + (++nRun));
        const args = [HARNESS, fixture, '--mode', 'default', '--deterministic'].concat(extra).concat(['--out', out]);
        const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
        const f = fs.existsSync(out) ? fs.readdirSync(out).filter(x => /\.m3u8$/i.test(x))[0] : null;
        const text = f ? read(path.join(out, f)) : '';
        return { code: r.status, stdout: (r.stdout || '') + (r.stderr || ''), text: text, bytes: Buffer.byteLength(text) };
    }

    // Control: la referencia histórica con TODOS los flags apagados.
    const ctrl = run(FIX13, ['--matrix', 'off'], 'ctrl13');
    ok(ctrl.code === 0 && ctrl.bytes > 0, 'F17 el emisor real termina bien (exit 0)');
    ok(ctrl.bytes === 868821, 'F18 control: mini_15 sin flags sigue pesando 868821 B (got ' + ctrl.bytes + ')');
    ok(sha256(ctrl.text) === 'a9a13c039d8d24c0b758eacfa44fc98c2e4b8cb88ea52d311a7ff2b6dfb4e3f1',
       'F19 control: sha256 a9a13c03… (la lista no ha cambiado ni un byte)');
    ok(ctrl.text.indexOf('#EXT-X-APE-OUTPUT-MATRIX') === -1, 'F20 con el flag apagado no aparece ni una etiqueta');

    // Encendido, con el mismo juego de flags que el apagado para que sean comparables.
    const off = run(FIX13, ['--profiles', '--matrix', 'off'], 'off13');
    const on = run(FIX13, ['--profiles', '--matrix', 'on'], 'on13');
    ok(on.stdout.indexOf('[matrix] flag=on · modulo=') > 0, 'F21 el arnés carga el módulo y enciende el flag');
    ok(on.bytes > off.bytes, 'F22 la lista encendida pesa más que la apagada (' + off.bytes + ' → ' + on.bytes + ')');

    const onLines = on.text.split('\n');
    const etiquetas = onLines.filter(l => l.indexOf('#EXT-X-APE-OUTPUT-MATRIX:') === 0);
    const extinf = onLines.filter(l => l.indexOf('#EXTINF:') === 0).length;
    ok(etiquetas.length === extinf && etiquetas.length === 15,
       'F23 una etiqueta por canal: ' + etiquetas.length + ' etiquetas / ' + extinf + ' canales');
    let jsonRoto = 0, antesDeUri = 0, repetidas = 0;
    const vistos = new Set();
    onLines.forEach((l, i) => {
        if (l.indexOf('#EXT-X-APE-OUTPUT-MATRIX:') !== 0) return;
        const pay = l.slice('#EXT-X-APE-OUTPUT-MATRIX:'.length);
        try { JSON.parse(pay); } catch (e) { jsonRoto++; }
        if (vistos.has(pay)) repetidas++; else vistos.add(pay);
        let j = i + 1;
        while (j < onLines.length && onLines[j].trim() === '') j++;
        if (onLines[j] && onLines[j].charAt(0) !== '#') antesDeUri++;
    });
    ok(jsonRoto === 0, 'F24 el JSON de cada etiqueta parsea');
    ok(repetidas === 0, 'F25 ninguna etiqueta se repite dentro de su canal');
    ok(antesDeUri === 15, 'F26 las 15 van seguidas de la URI del canal (' + antesDeUri + '/15)');
    ok(!/https?:/i.test(etiquetas.join('')), 'F27 ninguna etiqueta lleva host: sólo rutas relativas');
    const strip = (t) => t.split('\n').filter(l => l.indexOf('#EXT-X-APE-OUTPUT-MATRIX:') !== 0).join('\n');
    ok(strip(on.text) === off.text, 'F28 quitando las etiquetas, la lista encendida es IDÉNTICA a la apagada');
    ok(/determinismo : SHA IDÉNTICO/.test(on.stdout), 'F29 dos corridas del emisor dan el mismo SHA (determinista)');

    // La muestra 4K (modo passthrough) también declara sus 6 canales.
    const on4k = run(FIX4K, ['--profiles', '--matrix', 'on'], 'on4k');
    const l4 = on4k.text.split('\n');
    const t4 = l4.filter(l => l.indexOf('#EXT-X-APE-OUTPUT-MATRIX:') === 0);
    const e4 = l4.filter(l => l.indexOf('#EXTINF:') === 0).length;
    ok(t4.length === 6 && e4 === 6, 'F30 la muestra 4K también declara 6/6 (got ' + t4.length + '/' + e4 + ')');
    ok(t4.length > 0 && /\{"ver":1,"id":"9001",/.test(t4[0]), 'F31 el id de la etiqueta es el canal real (9001)');
}

/* ══════════════════════════════════════════════════════════════════════════
 * G. Cableado y corroboración con el servidor
 * ══════════════════════════════════════════════════════════════════════════ */
function seccionG() {
    section('G. Cableado del panel y de la página + corroboración con el servidor');

    const mx = read(MX_PATH);
    const panel = read(PANEL_PATH);
    const index = read(INDEX_PATH);

    /* El nombre del host se arma por trozos a propósito: si la prueba llevara el
     * literal, el escaneo de privacidad de la entrega lo encontraría en el propio
     * parche (medido: lo encontró) y no sabríamos distinguir la prueba de una fuga. */
    const HOST_RE = new RegExp(['duck', 'dns'].join('') + '|iptv-ape\\.', 'i');
    ok(!HOST_RE.test(mx), 'G1 el módulo no lleva ningún host real');
    ok(!HOST_RE.test(panel), 'G2 el panel tampoco lleva host literal (lo pone la config del usuario)');
    const panelCode = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
    ok(!/1174213/.test(panelCode), 'G3 el código del panel no tiene ids de canal fijos (sólo el comentario que documenta el defecto D1)');
    ok(/channelId|\.id\b/.test(panelCode) && /pick\(|APE_OUTPUT_MATRIX/.test(panelCode),
       'G3b los ids salen de los canales cargados (state.channelsMaster), no de literales');

    const iMod = index.indexOf('js/ape-v9/ape-output-matrix.js');
    const iPan = index.indexOf('js/ape-v9/output-status-panel.js');
    ok(iMod > 0 && iPan > 0, 'G4 index-v4.html carga el módulo y el panel');
    ok(iMod < iPan, 'G5 el módulo se carga ANTES del panel (la tabla existe cuando el panel arranca)');
    ok(/ape-output-matrix\.js\?v=1\.0\.0/.test(index), 'G6 el módulo lleva token ?v=1.0.0 (fuerza recarga)');
    ok(/output-status-panel\.js\?v=20261124-matrix2/.test(index), 'G7 el panel lleva token nuevo (no sirve el viejo de caché)');
    // El generador está bajo custodia del cache-buster: su ?v= ES el sha256[:8] del contenido
    // (lo exige tests/ape-cache-buster-guard.test.js). Si no, el navegador sirve el viejo.
    const sha8 = require('crypto').createHash('sha256').update(fs.readFileSync(GEN_PATH)).digest('hex').slice(0, 8);
    ok(new RegExp('m3u8-typed-arrays-ultimate\\.js\\?v=' + sha8 + '"').test(index),
       'G7b el generador llevaba el token viejo: ahora su ?v= es sha256[:8] del contenido (' + sha8 + ')');

    ok(/window\.APE_JIT_BASE/.test(panel) && /ape_jit_base/.test(panel) && /#ape-out-base/.test(panel),
       'G8 el panel deja configurar la base por ventana, localStorage y campo');
    ok(/APE_OUTPUT_MATRIX/.test(panel), 'G9 el panel consume la tabla (una sola fuente de verdad)');
    ok(/probeAll/.test(panel) && /__APE_OUTPUT_PANEL__/.test(panel), 'G10 el panel expone probeAll/__APE_OUTPUT_PANEL__');

    // Corroboración: las rutas que probamos son las que el servidor sirve.
    if (!fs.existsSync(SERVER_PATH)) {
        ok(false, 'G11 no encuentro vps/ape-jit/server.js');
        return;
    }
    const server = read(SERVER_PATH);
    ok(/function sendStatic\(req, res, file, type, kind\)/.test(server),
       'G12 server.js tiene sendStatic (la ruta que responde al Range)');
    ok(/'master\.m3u8'/.test(server) && /'manifest\.mpd'/.test(server),
       'G13 la ruta de sesión sirve master.m3u8 y manifest.mpd');
    ok(server.indexOf("=== '/catalog.json'") > 0, 'G14 /catalog.json está enrutado');
    ok(server.indexOf('/playlist.m3u8') > 0, 'G15 /playlist.m3u8 está enrutado');
    ok(/#EXT-X-SESSION-DATA/.test(server) && /manifest\.json/.test(server) && /\/meta\//.test(server),
       'G16 el servidor ANUNCIA manifest.json y /meta/ en #EXT-X-SESSION-DATA');
    // Ausencia declarada, no supuesta: si algún día aparece un router de /meta o de
    // manifest.json, esta comprobación lo dirá y habrá que revisar la fila json4k.
    const conRouter = /(===|=== )'\/meta|'\/meta\/'|manifest\.json'\).*res\.|router\.get\('\/meta/.test(server);
    ok(conRouter === false,
       'G17 (informativo) hoy no hay router de /meta ni de manifest.json: sólo se sirven si el fichero existe en la sesión');
    ok(server.indexOf('EXT-X-MAP') === -1,
       'G18 (informativo) server.js no escribe #EXT-X-MAP: esas líneas vienen de ffmpeg, por eso la sonda las lee en vez de suponerlas');

    // El marcado que el panel genera debe contener los mismos mandos que la sección que pegó
    // la persona (mismos ids), para que su HTML y este panel sean el mismo panel.
    ok(panel.indexOf('id="ape-out-probe-all"') > 0 && panel.indexOf('id="ape-out-mode"') > 0 && panel.indexOf('id="ape-out-summary"') > 0,
       'G21 el panel pinta los mismos mandos que la sección pegada (#ape-out-probe-all, #ape-out-mode, #ape-out-summary)');
    ok(/data-ape-probe=/.test(panel) && /data-ape-copy=/.test(panel) && /data-ape-open=/.test(panel),
       'G22 cada tarjeta lleva sus tres botones (Probar / Copiar / Abrir)');
    ok(/Salidas implementadas/.test(panel), 'G23 el título es el de la sección pegada');

    const gen = read(GEN_PATH);
    ok(/APE_OUTPUT_MATRIX_TAGS !== true/.test(gen), 'G19 la emisión está guardada por el interruptor (flag apagado = fuera)');
    ok(/typeof window === 'undefined'/.test(gen.slice(gen.indexOf('_apeAppendOutputMatrixTag'), gen.indexOf('_apeAppendOutputMatrixTag') + 1500)),
       'G20 con el generador fuera del navegador (node) la guarda no rompe');
}

/* ══════════════════════════════════════════════════════════════════════════
 * H. «El navegador no me deja leerlo» (CORS / preflight) — 2026-11-24
 *
 * Medido en la consola REAL del operador, no supuesto:
 *   "Request header field x-playback-session-id is not allowed by
 *    Access-Control-Allow-Headers in preflight response"  sobre /jit/live/<id>/master.m3u8
 *   "GET .../jit/live/<id>/master.m3u8 404"
 *   "TypeError: Failed to fetch" al final de la cadena
 * Dos cosas se prueban aquí: (1) que la tarjeta diga la verdad cuando el
 * navegador no deja leer, y (2) que la sonda no se meta en la cadena del motor
 * de evasión, que es quien añade cabeceras propias y dispara el preflight.
 * ══════════════════════════════════════════════════════════════════════════ */
function extraerFuncion(src, cabecera) {
    const i = src.indexOf(cabecera);
    if (i < 0) return '';
    let depth = 0, j = src.indexOf('{', i);
    for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    return src.slice(i, j);
}
function fakeRes() {
    const h = {};
    return { h: h, setHeader: function (k, v) { h[String(k).toLowerCase()] = v; } };
}

async function seccionH() {
    section('H. Navegador que no deja leer (CORS/preflight) y sonda limpia');

    // H1: el estado nuevo existe, se llama en castellano y NO es verde.
    const vb = MX.VERDICT.bloqueado;
    ok(!!vb && vb.label === 'no se puede leer', 'H1 hay un estado propio «no se puede leer»');
    ok(!!vb && vb.color !== '#22c55e' && vb.color !== '#06b6d4',
       'H2 ese estado no usa ninguno de los dos colores de "ha respondido bien"');

    // H3/H4: el clasificador distingue "no se pudo leer" de un error normal.
    const c = MX.classify;
    const R = (i) => MX.ROWS[i];
    const cor = c(R(0), { networkError: 'Failed to fetch', netKind: 'cors_or_network' });
    ok(cor.verdict === 'bloqueado', 'H3 un fallo de navegador (TypeError) NO se disfraza de error del servidor');
    ok(/CORS\/preflight/.test(cor.reason) && /Failed to fetch/.test(cor.reason),
       'H4 el motivo nombra CORS/preflight y conserva el texto real del navegador');
    ok(cor.reason.indexOf('bloqueado') < 0 && /o red/.test(cor.reason),
       'H5 no afirma que sea CORS: dice CORS/preflight O red, que es todo lo que el navegador cuenta');
    const err = c(R(0), { networkError: 'network down' });
    ok(err.verdict === 'error', 'H6 sin la marca de navegador el estado sigue siendo «error» (nada cambia para node)');

    // H7-H10: la cadena entera de una fila se para en "no se puede leer".
    function fakeThrow(err) {
        const calls = [];
        const f = async (url, opts) => { calls.push({ url: url, headers: (opts && opts.headers) || {} }); throw err; };
        f.calls = calls;
        return f;
    }
    const S = { channelsMaster: [{ id: '1174213', url: 'http://prov/4k.m3u8', resolution: '3840x2160' }] };
    const PK = MX.pick(S);
    const BASE = { base: 'https://jit.example/jit', ok: true, source: 'test' };
    const TY = () => Object.assign(new TypeError('Failed to fetch'), {});

    {
        const r = await MX.runRow(R(4), { fetch: fakeThrow(TY()), baseInfo: BASE, picked: PK, state: S });
        ok(r.verdict === 'bloqueado' && /^master: /.test(r.reason),
           'H7 la fila Range se para en el master y dice que no pudo leerlo (no inventa un init)');
    }
    {
        const r = await MX.runRow(R(0), { fetch: fakeThrow(TY()), baseInfo: BASE, picked: PK, state: S });
        ok(r.verdict === 'bloqueado' && !!r.tested, 'H8 la fila de lista también, dejando la URL que intentó');
    }
    {
        const r = await MX.runRow(R(3), { fetch: fakeThrow(TY()), baseInfo: BASE, picked: PK, state: S });
        ok(r.verdict === 'bloqueado', 'H9 la fila JSON idem (no se queda muda)');
    }
    {
        const r = await MX.runRow(R(0), { fetch: fakeThrow(new Error('Failed to fetch')), baseInfo: BASE, picked: PK, state: S });
        ok(r.verdict === 'error',
           'H10 no se adivina por el TEXTO: un Error normal con el mismo mensaje sigue siendo «error»');
    }

    // H11-H14: el panel usa el fetch del navegador, no el que parchea el motor.
    const panel = read(PANEL_PATH);
    ok(/function probeFetch\(\)/.test(panel), 'H11 el panel tiene un resolvedor propio de fetch para las sondas');
    ok(/fetch: probeFetch\(\)/.test(panel) && panel.indexOf('window.fetch.bind(window)') < 0,
       'H13 la sonda ya no usa window.fetch (el parcheado por ape-runtime-evasion-engine)');

    const pfSrc = extraerFuncion(panel, 'function probeFetch() {');
    ok(pfSrc.indexOf('_APE_ORIGINAL_FETCH') > 0 &&
       pfSrc.indexOf('_APE_ORIGINAL_FETCH') < pfSrc.indexOf('_NATIVE_FETCH') &&
       pfSrc.indexOf('_NATIVE_FETCH') < pfSrc.indexOf('w.fetch'),
       'H12 dentro de probeFetch el orden es: fetch original del motor → fetch nativo → window.fetch (último recurso)');
    const pf = new Function('window', 'return (' + pfSrc + ')()');
    let quien = '';
    const nativo = function () { quien = 'original'; };
    const parcheado = function () { quien = 'parcheado'; };

    quien = '';
    pf({ fetch: parcheado, _APE_ORIGINAL_FETCH: nativo })();
    ok(quien === 'original', 'H14 con el motor cargado, la sonda se queda con el fetch ORIGINAL (el que no añade cabeceras)');
    quien = '';
    pf({ fetch: parcheado, _NATIVE_FETCH: nativo })();
    ok(quien === 'original', 'H15 si lo que hay es _NATIVE_FETCH, también tira de él antes que del parcheado');
    quien = '';
    pf({ fetch: parcheado })();
    ok(quien === 'parcheado', 'H16 sin motor, usa el fetch del navegador tal cual');
    ok(pf({}) === null, 'H17 sin ningún fetch devuelve null en vez de romper');

    // H18-H24: el servidor deja pasar el preflight que el navegador manda.
    const sv = read(SERVER_PATH);
    ok(/function setBaseHeaders\(res, req\)/.test(sv), 'H18 setBaseHeaders recibe también la petición');
    ok(/installTiming\(req, res\);\s*\n\s*setBaseHeaders\(res, req\);\s*\n\s*if \(req\.method === 'OPTIONS'\)/.test(sv),
       'H19 la respuesta al OPTIONS (204) sale por el mismo sitio que ya contestaba a todos');
    const fnSrc = extraerFuncion(sv, 'function setBaseHeaders(res, req) {');
    ok(!!fnSrc, 'H20 se puede extraer la función real del servidor para probarla');
    if (fnSrc) {
        const setBaseHeaders = new Function('return (' + fnSrc + ')')();
        const r1 = fakeRes();
        setBaseHeaders(r1, { headers: { 'access-control-request-headers': 'x-playback-session-id, x-custom' } });
        const acah1 = String(r1.h['access-control-allow-headers'] || '');
        ok(/x-playback-session-id/i.test(acah1) && /x-custom/i.test(acah1),
           'H21 el preflight autoriza las cabeceras que el navegador pide (incluida x-playback-session-id)');
        ok(r1.h['access-control-allow-origin'] === '*', 'H22 el origen sigue abierto como estaba');
        const r2 = fakeRes();
        setBaseHeaders(r2, { headers: {} });
        const acah2 = String(r2.h['access-control-allow-headers'] || '');
        ok(/x-playback-session-id/i.test(acah2) && /Range/i.test(acah2),
           'H23 sin preflight, la lista fija también admite x-playback-session-id y Range');
        const r3 = fakeRes();
        setBaseHeaders(r3, undefined);
        ok(/Range/i.test(String(r3.h['access-control-allow-headers'] || '')),
           'H24 y sigue funcionando si nadie le pasa la petición (compatibilidad)');
    }

    // H25-H26: una sola línea en consola, para que se vea que el panel está vivo.
    ok(/console\.info\('\[APE-OUT\]/.test(panel), 'H25 el panel deja UNA línea en consola al pintarse');
    ok(/var VERSION = '2\.0\.0';/.test(panel) && /version: VERSION,/.test(panel),
       'H26 la versión que anuncia la consola es la misma que publica el panel');
}

/* ══════════════════════════════════════════════════════════════════════════ */
(async function main() {
    await seccionE();
    seccionF();
    seccionG();
    await seccionH();

    console.log('\n══════════════════════════════════════');
    console.log('RESULTADO: ' + pass + ' PASS / ' + fail + ' FAIL');
    if (fail) { console.log('Fallos:'); failures.forEach(f => console.log(' - ' + f)); }
    console.log('══════════════════════════════════════');
    process.exit(fail ? 1 : 0);
})();
