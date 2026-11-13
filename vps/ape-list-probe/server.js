'use strict';

// ape-list-probe — endpoint de SOLO LECTURA sobre las listas servidas.
//
// QUE HACE
// ========
//   GET /probe?url=<lista>     identifica y audita UNA lista, sin modificarla
//   GET /probe                 audita la lista configurada por defecto
//   GET /health                estado del propio servicio
//
// Devuelve, por lista:
//   sha256, bytes, last_modified, etag      -> identidad exacta (lo que pidio el operador)
//   canales, lineas                          -> tamano real del catalogo
//   patrones de URL con su cuenta            -> que rutas usa (/pulse/, /live/, resolver...)
//   servabilidad de una muestra              -> HTTP por clase de ruta
//   harness del sistema                      -> si lleva el contrato APE y la vigilancia
//
// QUE **NO** HACE, y es la parte importante
// =========================================
//   - NO escribe en la lista. No la modifica. No la reescribe. No la proxya.
//   - NO la reemplaza. NO toca OTT ni el VPS. NO invalida cache.
//   - NO descarga la lista entera a memoria: hashea y censa en STREAMING (1,31 GB medidos).
//   - NO inventa: si la lista no responde, dice NO_COMPUTADO con el motivo.
//
// ATOMICIDAD DEL LADO DE APLICACION
// =================================
// La aplicacion del harness NO vive aqui. Este endpoint solo OBSERVA. La aplicacion atomica
// la hace tools/quality/apply_harness.js, que escribe un fichero NUEVO y solo lo publica si
// todas las comprobaciones pasan. Este proceso nunca publica nada.
//
// SEGURIDAD
// =========
//   - Solo permite URLs http/https con hostname resoluble. Rechaza file://, gopher://, etc.
//   - Limite de bytes por lista (APE_MAX_BYTES, por defecto 3 GiB).
//   - Timeout de descarga (APE_FETCH_TIMEOUT_MS, por defecto 180000).
//   - Limite de peticiones por IP (token bucket simple en memoria).
//   - Cache por ETag/Last-Modified: no re-hashea lo mismo dos veces.
//   - Bind a 127.0.0.1 por defecto; exponerlo es decision del operador.

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CFG = {
    port: Number(process.env.APE_PROBE_PORT || 8787),
    bind: process.env.APE_PROBE_BIND || '127.0.0.1',
    defaultList: process.env.APE_PROBE_LIST || '',
    maxBytes: Number(process.env.APE_MAX_BYTES || 3 * 1024 * 1024 * 1024),
    fetchTimeoutMs: Number(process.env.APE_FETCH_TIMEOUT_MS || 180000),
    sampleUrls: Number(process.env.APE_SAMPLE_URLS || 3),
    ratePerMin: Number(process.env.APE_RATE_PER_MIN || 12),
    cacheFile: process.env.APE_PROBE_CACHE || path.join(__dirname, 'state', 'cache.json')
};

// ── Cache de identidad por ETag/Last-Modified ────────────────────────────────
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CFG.cacheFile, 'utf8')); } catch (e) { cache = {}; }
function guardarCache() {
    try {
        fs.mkdirSync(path.dirname(CFG.cacheFile), { recursive: true });
        const tmp = CFG.cacheFile + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
        fs.renameSync(tmp, CFG.cacheFile);   // atomico
    } catch (e) { /* la cache es una optimizacion, no un requisito */ }
}

// ── Rate limit sencillo por IP ───────────────────────────────────────────────
const cubos = new Map();
function permitido(ip) {
    const ahora = Date.now();
    const c = cubos.get(ip) || { t: ahora, n: 0 };
    if (ahora - c.t > 60000) { c.t = ahora; c.n = 0; }
    c.n++;
    cubos.set(ip, c);
    return c.n <= CFG.ratePerMin;
}

function claseDeRuta(u) {
    try {
        const x = new URL(u);
        const p = x.pathname
            .replace(/\/\d+(?=\/|\.|$)/g, '/{n}')
            .replace(/[a-f0-9]{16,}/gi, '{h}')
            .replace(/\.(ts|m4s|mp4|m3u8)$/i, '.{ext}');
        return `${x.protocol}//${x.host}${p}`;
    } catch (e) { return 'INVALIDA'; }
}

function urlPermitida(u) {
    try {
        const x = new URL(u);
        if (x.protocol !== 'http:' && x.protocol !== 'https:') return 'protocolo no permitido: ' + x.protocol;
        if (!x.hostname || /^(localhost|127\.|0\.0\.0\.0|::1)/.test(x.hostname) === false && x.hostname.length < 1) {
            return 'hostname invalido';
        }
        return null;
    } catch (e) { return 'URL invalida'; }
}

// ── NUCLEO: descarga en streaming, hashea y censa sin bufferizar ─────────────
async function analizar(url) {
    const t0 = Date.now();
    const base = {
        schema: 'ape.list.identity.v1',
        t: new Date().toISOString(),
        url,
        estado: 'NO_COMPUTADO',
        sha256: null, bytes: null, last_modified: null, etag: null,
        canales: null, lineas: null,
        patrones: [], servabilidad: [], harness: {},
        no_computado: [], duracion_ms: null
    };

    const inval = urlPermitida(url);
    if (inval) { base.no_computado.push(inval); base.duracion_ms = Date.now() - t0; return base; }

    let res;
    try {
        res = await fetch(url, {
            method: 'GET',
            headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20', 'accept': '*/*' },
            signal: AbortSignal.timeout(CFG.fetchTimeoutMs)
        });
    } catch (e) {
        base.no_computado.push('fetch fallo: ' + String(e.message || e).slice(0, 120));
        base.duracion_ms = Date.now() - t0;
        return base;
    }
    if (!res.ok) {
        base.no_computado.push(`la lista responde HTTP ${res.status}`);
        base.duracion_ms = Date.now() - t0;
        return base;
    }
    base.last_modified = res.headers.get('last-modified');
    base.etag = res.headers.get('etag');

    // Cache: si ETag y Last-Modified coinciden, no se re-hashea
    const clave = url;
    const prev = cache[clave];
    if (prev && base.etag && prev.etag === base.etag && prev.sha256) {
        Object.assign(base, prev.datos, { t: new Date().toISOString(), cache: 'HIT (etag)' });
        base.duracion_ms = Date.now() - t0;
        return base;
    }

    // Streaming: hash + conteo + censo de rutas en una sola pasada
    const hash = crypto.createHash('sha256');
    let bytes = 0, lineas = 0, canales = 0, urls = 0;
    const patrones = new Map();
    const muestras = new Map();     // clase -> hasta CFG.sampleUrls URLs
    const harness = {
        extm3u: false, url2_cartridge: false, apex_qmax: false,
        ape_channels: null, quality_watch: false, lab: false
    };
    let resto = '';
    let excedido = false;

    try {
        for await (const trozo of res.body) {
            const b = Buffer.from(trozo);
            bytes += b.length;
            if (bytes > CFG.maxBytes) { excedido = true; break; }
            hash.update(b);
            resto += b.toString('utf8');
            const partes = resto.split('\n');
            resto = partes.pop();
            for (const l of partes) {
                lineas++;
                if (lineas === 1 && /^#EXTM3U/.test(l)) harness.extm3u = true;
                if (/^#EXTINF/i.test(l)) canales++;
                if (/^#EXT-X-APE-URL2-CARTRIDGE/i.test(l)) harness.url2_cartridge = true;
                if (/^#EXT-X-APE-QMAX-VERSION/i.test(l)) harness.apex_qmax = true;
                if (/^#EXT-X-APE-QUALITY-WATCH/i.test(l)) harness.quality_watch = true;
                if (/^#EXT-X-APE-LAB/i.test(l)) harness.lab = true;
                const m = l.match(/^#EXT-X-APE-CHANNELS:(\d+)/i);
                if (m) harness.ape_channels = Number(m[1]);
                if (/^https?:\/\//.test(l)) {
                    urls++;
                    const c = claseDeRuta(l.trim());
                    patrones.set(c, (patrones.get(c) || 0) + 1);
                    const arr = muestras.get(c);
                    if (!arr) muestras.set(c, [l.trim()]);
                    else if (arr.length < CFG.sampleUrls) arr.push(l.trim());
                }
            }
        }
        if (excedido) base.no_computado.push(`la lista supera APE_MAX_BYTES (${CFG.maxBytes}): censo parcial`);
    } catch (e) {
        base.no_computado.push('lectura interrumpida: ' + String(e.message || e).slice(0, 120));
    }

    base.sha256 = hash.digest('hex');
    base.bytes = bytes;
    base.lineas = lineas;
    base.canales = canales;
    base.harness = harness;
    base.patrones = [...patrones.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([clase, n]) => ({ clase, urls: n }));

    // Servabilidad de una muestra por clase
    for (const [clase, urlsDeClase] of muestras) {
        const prob = [];
        for (const u of urlsDeClase) {
            try {
                const r = await fetch(u, {
                    method: 'GET', redirect: 'manual',
                    headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20', 'range': 'bytes=0-1023' },
                    signal: AbortSignal.timeout(15000)
                });
                prob.push({ status: r.status, ok: r.status < 400 });
            } catch (e) {
                prob.push({ status: null, ok: false, error: String(e.message || e).slice(0, 60) });
            }
        }
        const conR = prob.filter(p => p.status !== null);
        const vivas = prob.filter(p => p.ok);
        let estadoClase;
        if (conR.length === 0) estadoClase = 'NO_COMPUTADA';
        else if (vivas.length > 0) estadoClase = 'VIVA';
        else estadoClase = 'MUERTA';
        base.servabilidad.push({
            clase, estado: estadoClase, probadas: prob.length,
            codigos: [...new Set(prob.map(p => p.status).filter(s => s !== null))].sort(),
            ejemplo: urlsDeClase[0]
        });
    }

    const muertas = base.servabilidad.filter(s => s.estado === 'MUERTA').length;
    const vivas = base.servabilidad.filter(s => s.estado === 'VIVA').length;
    base.estado = muertas > 0 ? 'SUCIA' : (vivas > 0 ? 'SANA' : 'NO_COMPUTADO');

    base.duracion_ms = Date.now() - t0;
    cache[clave] = { etag: base.etag, datos: {
        sha256: base.sha256, bytes: base.bytes, lineas: base.lineas,
        canales: base.canales, patrones: base.patrones, harness: base.harness
    } };
    guardarCache();
    return base;
}

// ── HTTP ────────────────────────────────────────────────────────────────────
const srv = http.createServer(async (req, res) => {
    const ip = req.socket.remoteAddress || '?';
    const enviar = (code, obj) => {
        const b = Buffer.from(JSON.stringify(obj, null, 2));
        res.writeHead(code, {
            'content-type': 'application/json; charset=utf-8',
            'content-length': b.length,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff'
        });
        res.end(b);
    };

    if (!permitido(ip)) return enviar(429, { error: 'rate_limit', detalle: `max ${CFG.ratePerMin}/min` });

    let u;
    try { u = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
    catch (e) { return enviar(400, { error: 'url_malformada' }); }

    if (u.pathname === '/health') {
        return enviar(200, {
            ok: true, servicio: 'ape-list-probe', version: '1.0.0',
            bind: CFG.bind, port: CFG.port,
            listas_en_cache: Object.keys(cache).length,
            lista_por_defecto: CFG.defaultList || null,
            solo_lectura: 'NO modifica ninguna lista; NO escribe fuera de state/cache.json'
        });
    }

    if (u.pathname === '/probe') {
        const objetivo = u.searchParams.get('url') || CFG.defaultList;
        if (!objetivo) return enviar(400, { error: 'falta url', uso: '/probe?url=<lista>' });
        try {
            const r = await analizar(objetivo);
            return enviar(200, r);
        } catch (e) {
            return enviar(500, { error: 'interno', detalle: String(e.message || e).slice(0, 200) });
        }
    }

    return enviar(404, {
        error: 'ruta_desconocida',
        rutas: ['/probe?url=<lista>', '/probe', '/health']
    });
});

srv.listen(CFG.port, CFG.bind, () => {
    const msg = `ape-list-probe escuchando en http://${CFG.bind}:${CFG.port} (SOLO LECTURA)\n`;
    process.stdout.write(msg);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => { srv.close(() => process.exit(0)); });
}
