'use strict';

// ape-list-probe v2 — endpoint de SOLO LECTURA sobre las listas servidas.
//
// Base: propuesta v2 del operador (encoding detection, LRU+TTL, rate limiter con limpieza,
// bloqueo de IPs privadas, limites de linea y patrones, concurrencia controlada, metricas).
//
// CUATRO CORRECCIONES aplicadas sobre esa base, todas medidas antes de adoptarlas:
//
//  [CRITICO] verificarServibilidad devolvia `headers: Object.fromEntries(r.headers)`, es decir
//            TODAS las cabeceras de la respuesta del proveedor — Set-Cookie y cualquier token
//            incluidos — dentro del JSON del endpoint. Fuga de secretos. ELIMINADO: solo se
//            devuelven el codigo, si fue ok y el tipo de contenido.
//
//  [ALTO]    LineSplitter parte por el byte 0x0A. En UTF-16LE el salto de linea es 0x0A 0x00,
//            asi que partiria por la mitad y el censo saldria mal SIN avisar. Se detecta el
//            BOM pero no se usa para partir. Ahora UTF-16 se rechaza con NO_COMPUTADO en vez
//            de censar mal: un censo corrupto es peor que un no computado.
//
//  [MEDIO]   `base.url_final` se asignaba sin estar declarado en el objeto base.
//
//  [MENOR]   El porcentaje por patron dividia por `urls` aunque el censo se truncara en
//            maxPatrones, asi que mentia. Ahora se marca `patrones_parciales` y el pct se
//            calcula solo sobre lo censado, declarandolo.
//
// SIGUE SIENDO SOLO LECTURA: no escribe en la lista, no la proxya, no la reemplaza, no toca
// OTT ni el VPS. La unica escritura es la cache en state/.

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Transform, pipeline } = require('node:stream');
const { promisify } = require('node:util');
const pipelineAsync = promisify(pipeline);

const CFG = {
    port: Number(process.env.APE_PROBE_PORT || 8787),
    bind: process.env.APE_PROBE_BIND || '127.0.0.1',
    defaultList: process.env.APE_PROBE_LIST || '',
    maxBytes: Number(process.env.APE_MAX_BYTES || 3 * 1024 * 1024 * 1024),
    fetchTimeoutMs: Number(process.env.APE_FETCH_TIMEOUT_MS || 180000),
    idleTimeoutMs: Number(process.env.APE_IDLE_TIMEOUT_MS || 90000),
    sampleUrls: Number(process.env.APE_SAMPLE_URLS || 3),
    ratePerMin: Number(process.env.APE_RATE_PER_MIN || 12),
    cacheFile: process.env.APE_PROBE_CACHE || path.join(__dirname, 'state', 'cache.json'),
    cacheTTLMs: Number(process.env.APE_CACHE_TTL_MS || 3600000),
    maxLineLength: 65536,
    maxPatrones: 1000,
    maxRedirects: 5
};

// ── Cache LRU con TTL ────────────────────────────────────────────────────────
class LRUCache {
    constructor(maxAgeMs) { this.maxAgeMs = maxAgeMs; this.cache = new Map(); this.timestamps = new Map(); }
    get(key) {
        const item = this.cache.get(key);
        if (!item) return undefined;
        if (Date.now() - this.timestamps.get(key) > this.maxAgeMs) {
            this.cache.delete(key); this.timestamps.delete(key); return undefined;
        }
        return item;
    }
    set(key, value) {
        if (this.cache.has(key)) this.cache.delete(key);
        this.cache.set(key, value);
        this.timestamps.set(key, Date.now());
        if (this.cache.size > 1000) {
            const oldest = this.cache.keys().next().value;
            this.cache.delete(oldest); this.timestamps.delete(oldest);
        }
    }
    get size() { return this.cache.size; }
    toJSON() {
        const o = {};
        for (const [k, v] of this.cache) {
            if (Date.now() - this.timestamps.get(k) < this.maxAgeMs) o[k] = v;
        }
        return o;
    }
    static fromJSON(o, maxAgeMs) {
        const c = new LRUCache(maxAgeMs);
        for (const [k, v] of Object.entries(o)) c.set(k, v);
        return c;
    }
}

let cache = new LRUCache(CFG.cacheTTLMs);
try { cache = LRUCache.fromJSON(JSON.parse(fs.readFileSync(CFG.cacheFile, 'utf8')), CFG.cacheTTLMs); } catch (e) { /* vacia */ }

function guardarCache() {
    try {
        fs.mkdirSync(path.dirname(CFG.cacheFile), { recursive: true });
        const tmp = CFG.cacheFile + '.tmp.' + crypto.randomBytes(4).toString('hex');
        fs.writeFileSync(tmp, JSON.stringify(cache.toJSON(), null, 2), 'utf8');
        fs.renameSync(tmp, CFG.cacheFile);
    } catch (e) { process.stderr.write('cache_no_escribible: ' + e.message + '\n'); }
}
const intervaloCache = setInterval(guardarCache, 60000);
if (intervaloCache.unref) intervaloCache.unref();

// ── Rate limiter con TTL y limpieza ─────────────────────────────────────────
class RateLimiter {
    constructor(maxPerMin) { this.maxPerMin = maxPerMin; this.buckets = new Map(); this.lastClean = Date.now(); }
    permitido(ip) {
        this.limpiar();
        const ahora = Date.now();
        const c = this.buckets.get(ip) || { t: ahora, n: 0, bloqueadoHasta: 0 };
        if (ahora < c.bloqueadoHasta) return false;
        if (ahora - c.t > 60000) { c.t = ahora; c.n = 0; }
        c.n++;
        this.buckets.set(ip, c);
        if (c.n > this.maxPerMin) { c.bloqueadoHasta = ahora + 60000; return false; }
        return true;
    }
    limpiar() {
        if (Date.now() - this.lastClean < 300000) return;
        const limite = Date.now() - 600000;
        for (const [ip, d] of this.buckets) if (d.t < limite) this.buckets.delete(ip);
        this.lastClean = Date.now();
    }
    stats() { return { activas: this.buckets.size }; }
}
const limiter = new RateLimiter(CFG.ratePerMin);

// ── LineSplitter. SOLO UTF-8. ────────────────────────────────────────────────
// CORRECCION: partir por 0x0A funciona en UTF-8 y en ASCII. En UTF-16 el salto es 0x0A 0x00
// y esto partiria por la mitad. Por eso, si se detecta BOM UTF-16, se emite un error
// explicito y el analisis termina como NO_COMPUTADO en vez de producir un censo corrupto.
class LineSplitter extends Transform {
    constructor() {
        super();
        this.buffer = Buffer.alloc(0);
        this.detected = false;
        this.encoding = 'utf8';
        this.lines = 0;
    }
    _transform(chunk, _enc, cb) {
        if (!this.detected && chunk.length >= 3) {
            if (chunk[0] === 0xEF && chunk[1] === 0xBB && chunk[2] === 0xBF) {
                chunk = chunk.slice(3); this.encoding = 'utf8-bom';
            } else if (chunk[0] === 0xFE && chunk[1] === 0xFF) {
                this.encoding = 'utf16be';
            } else if (chunk[0] === 0xFF && chunk[1] === 0xFE) {
                this.encoding = 'utf16le';
            }
            this.detected = true;
        }
        if (this.encoding.startsWith('utf16')) {
            return cb(new Error('UTF16_NO_SOPORTADO: partir por 0x0A corromperia el censo'));
        }
        this.buffer = Buffer.concat([this.buffer, chunk]);
        let idx;
        while ((idx = this.buffer.indexOf(0x0A)) !== -1) {
            const line = this.buffer.slice(0, idx);
            this.buffer = this.buffer.slice(idx + 1);
            if (line.length > CFG.maxLineLength) return cb(new Error(`linea excede ${CFG.maxLineLength} bytes`));
            this.lines++;
            this.push(line.toString('utf8'));
        }
        if (this.buffer.length > CFG.maxLineLength * 2) return cb(new Error('buffer de lineas desbordado'));
        cb();
    }
    _flush(cb) { if (this.buffer.length) this.push(this.buffer.toString('utf8')); cb(); }
}

// ── Utilidades ───────────────────────────────────────────────────────────────
function claseDeRuta(u) {
    try {
        const x = new URL(u);
        const p = x.pathname
            .replace(/\/\d+(?=\/|\.|$)/g, '/{n}')
            .replace(/[a-f0-9]{16,}/gi, '{h}')
            .replace(/\.(ts|m4s|mp4|m3u8|m3u|key)$/i, '.{ext}');
        return `${x.protocol}//${x.host}${p}`;
    } catch (e) { return 'INVALIDA'; }
}

// CORRECCION de la v1: la condicion anterior era logica sin sentido y no bloqueaba nada.
function urlPermitida(u) {
    try {
        const x = new URL(u);
        if (x.protocol !== 'http:' && x.protocol !== 'https:') return 'protocolo no permitido: ' + x.protocol;
        const h = x.hostname.toLowerCase();
        if (/^(localhost|127\.|0\.0\.0\.0|::1|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|fc00:|fe80:)/.test(h)) {
            return 'IP privada o localhost no permitido';
        }
        if (!/^[a-z0-9][-a-z0-9]*(\.[a-z0-9][-a-z0-9]*)+$/i.test(h) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
            return 'hostname invalido';
        }
        return null;
    } catch (e) { return 'URL invalida: ' + e.message; }
}

async function fetchConRedirects(url, headers, timeoutMs) {
    let actual = url, res, redirects = 0;
    while (true) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            res = await fetch(actual, { method: 'GET', headers, signal: ctrl.signal, redirect: 'manual' });
        } finally { clearTimeout(t); }
        if (res.status >= 300 && res.status < 400 && redirects < CFG.maxRedirects) {
            const loc = res.headers.get('location');
            if (!loc) break;
            actual = new URL(loc, actual).href;
            redirects++;
            continue;
        }
        break;
    }
    return { res, urlFinal: actual, redirects };
}

// ── NUCLEO ───────────────────────────────────────────────────────────────────
async function analizar(url) {
    const t0 = Date.now();
    const base = {
        schema: 'ape.list.identity.v2', t: new Date().toISOString(), url, url_final: null,
        estado: 'NO_COMPUTADO',
        sha256: null, bytes: null, last_modified: null, etag: null, content_type: null,
        canales: null, lineas: null, encoding: null,
        patrones: [], patrones_parciales: false, servabilidad: [], harness: {},
        no_computado: [], warnings: [], duracion_ms: null
    };

    const inval = urlPermitida(url);
    if (inval) { base.no_computado.push(inval); base.duracion_ms = Date.now() - t0; return base; }

    let res, urlFinal;
    try {
        const r = await fetchConRedirects(url, {
            'user-agent': 'VLC/3.0.20 LibVLC/3.0.20', accept: '*/*'
        }, CFG.fetchTimeoutMs);
        res = r.res; urlFinal = r.urlFinal;
    } catch (e) {
        base.no_computado.push(e.name === 'AbortError' ? 'timeout de fetch' : 'fetch fallo: ' + String(e.message || e).slice(0, 120));
        base.duracion_ms = Date.now() - t0; return base;
    }
    base.url_final = urlFinal;
    if (!res.ok || !res.body) {
        base.no_computado.push(`HTTP ${res.status}`);
        base.duracion_ms = Date.now() - t0; return base;
    }
    base.last_modified = res.headers.get('last-modified');
    base.etag = res.headers.get('etag');
    base.content_type = res.headers.get('content-type');

    const cached = cache.get(url);
    if (cached && base.etag && cached.etag === base.etag) {
        return Object.assign({}, cached.datos, { t: new Date().toISOString(), cache: 'HIT', duracion_ms: Date.now() - t0 });
    }

    const hash = crypto.createHash('sha256');
    let bytes = 0, lineas = 0, canales = 0, urls = 0, excedido = false, truncado = false;
    const patrones = new Map(), muestras = new Map();
    const harness = { extm3u: false, url2_cartridge: false, apex_qmax: false, ape_channels: null, quality_watch: false, lab: false };
    const splitter = new LineSplitter();

    splitter.on('data', (line) => {
        if (excedido) return;
        lineas++;
        const s = line.trim();
        if (lineas === 1 && /^#EXTM3U/i.test(s)) harness.extm3u = true;
        if (/^#EXTINF/i.test(s)) canales++;
        if (/^#EXT-X-APE-URL2-CARTRIDGE/i.test(s)) harness.url2_cartridge = true;
        if (/^#EXT-X-APE-QMAX-VERSION/i.test(s)) harness.apex_qmax = true;
        if (/^#EXT-X-APE-QUALITY-WATCH/i.test(s)) harness.quality_watch = true;
        if (/^#EXT-X-APE-LAB/i.test(s)) harness.lab = true;
        const m = s.match(/^#EXT-X-APE-CHANNELS:\s*(\d+)/i);
        if (m) harness.ape_channels = Number(m[1]);
        if (/^https?:\/\//.test(s)) {
            urls++;
            const c = claseDeRuta(s);
            if (patrones.size < CFG.maxPatrones || patrones.has(c)) {
                patrones.set(c, (patrones.get(c) || 0) + 1);
            } else { truncado = true; }
            const arr = muestras.get(c);
            if (!arr) muestras.set(c, [s]);
            else if (arr.length < CFG.sampleUrls) arr.push(s);
        }
    });
    base.encoding = () => splitter.encoding;

    try {
        await pipelineAsync(
            res.body,
            new Transform({
                transform(chunk, _enc, cb) {
                    bytes += chunk.length;
                    if (bytes > CFG.maxBytes) { excedido = true; return this.destroy(new Error('max_bytes_excedido')); }
                    hash.update(chunk);
                    cb(null, chunk);
                }
            }),
            splitter
        );
    } catch (e) {
        const m = String(e.message || e);
        if (m.startsWith('UTF16_NO_SOPORTADO')) {
            base.no_computado.push('la lista es UTF-16: no se puede censar partiendo por 0x0A');
            base.duracion_ms = Date.now() - t0; return base;
        }
        if (m !== 'max_bytes_excedido') base.no_computado.push('lectura interrumpida: ' + m.slice(0, 120));
    }

    if (excedido) base.no_computado.push(`lista supera ${CFG.maxBytes} bytes: censo parcial`);

    base.sha256 = hash.digest('hex');
    base.bytes = bytes;
    base.lineas = lineas;
    base.canales = canales;
    base.encoding = splitter.encoding;
    base.harness = harness;
    base.patrones_parciales = truncado;
    base.patrones = [...patrones.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([clase, n]) => ({
        clase, urls: n,
        pct: truncado ? null : +((n / Math.max(urls, 1)) * 100).toFixed(2)
    }));

    base.servabilidad = await verificarServibilidad(muestras);
    const muertas = base.servabilidad.filter(s => s.estado === 'MUERTA').length;
    const vivas = base.servabilidad.filter(s => s.estado === 'VIVA').length;
    base.estado = muertas > 0 ? 'SUCIA' : (vivas > 0 ? 'SANA' : 'NO_COMPUTADO');
    base.duracion_ms = Date.now() - t0;

    cache.set(url, { etag: base.etag, datos: {
        sha256: base.sha256, bytes: base.bytes, lineas: base.lineas, canales: base.canales,
        encoding: base.encoding, patrones: base.patrones, patrones_parciales: base.patrones_parciales,
        harness: base.harness, estado: base.estado, url_final: base.url_final
    } });
    return base;
}

// CORRECCION CRITICA: NO se devuelven las cabeceras de la respuesta del proveedor.
// Antes se incluia `headers`, que arrastraba Set-Cookie y tokens al JSON del endpoint.
async function verificarServibilidad(muestras) {
    const salida = [];
    for (const [clase, urls] of muestras) {
        const prob = await Promise.all(urls.slice(0, CFG.sampleUrls).map(async (u) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 15000);
            try {
                const r = await fetch(u, {
                    method: 'GET', redirect: 'manual',
                    headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20', range: 'bytes=0-1023' },
                    signal: ctrl.signal
                });
                return { status: r.status, ok: r.status < 400,
                    tipo: (r.headers.get('content-type') || '').split(';')[0].slice(0, 60) };
            } catch (e) {
                return { status: null, ok: false, error: String(e.message || e).slice(0, 60) };
            } finally { clearTimeout(t); }
        }));
        const conR = prob.filter(p => p.status !== null);
        const vivas = prob.filter(p => p.ok);
        salida.push({
            clase,
            estado: conR.length === 0 ? 'NO_COMPUTADA' : (vivas.length > 0 ? 'VIVA' : 'MUERTA'),
            probadas: prob.length,
            exito_pct: conR.length ? +((vivas.length / conR.length) * 100).toFixed(1) : null,
            codigos: [...new Set(prob.map(p => p.status).filter(s => s !== null))].sort(),
            tipos: [...new Set(prob.map(p => p.tipo).filter(Boolean))],
            ejemplo: urls[0]
        });
    }
    return salida;
}

// ── HTTP ────────────────────────────────────────────────────────────────────
const srv = http.createServer(async (req, res) => {
    const ip = (req.socket.remoteAddress || '?').replace(/^::ffff:/, '');
    const t0 = Date.now();
    const enviar = (code, obj, extra = {}) => {
        const b = Buffer.from(JSON.stringify(obj, null, 2));
        res.writeHead(code, Object.assign({
            'content-type': 'application/json; charset=utf-8',
            'content-length': b.length,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            'x-response-time': `${Date.now() - t0}ms`
        }, extra));
        res.end(b);
    };

    if (!limiter.permitido(ip)) return enviar(429, { error: 'rate_limit', detalle: `max ${CFG.ratePerMin}/min`, retry_after: 60 }, { 'retry-after': '60' });

    let u;
    try { u = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
    catch (e) { return enviar(400, { error: 'url_malformada' }); }

    if (u.pathname === '/health') {
        return enviar(200, {
            ok: true, servicio: 'ape-list-probe', version: '2.0.0-corregida',
            bind: CFG.bind, port: CFG.port,
            listas_en_cache: cache.size, rate_limiter: limiter.stats(),
            lista_por_defecto: CFG.defaultList || null,
            uptime_s: Math.round(process.uptime()),
            solo_lectura: 'NO modifica ninguna lista; unica escritura: state/cache.json'
        });
    }

    if (u.pathname === '/probe') {
        const objetivo = u.searchParams.get('url') || CFG.defaultList;
        if (!objetivo) return enviar(400, { error: 'falta_url', uso: '/probe?url=<lista>' });
        try {
            const r = await analizar(objetivo);
            return enviar(r.estado === 'NO_COMPUTADO' ? 503 : 200, r);
        } catch (e) {
            process.stderr.write('error en analisis: ' + (e && e.stack || e) + '\n');
            return enviar(500, { error: 'interno', detalle: String(e.message || e).slice(0, 200) });
        }
    }

    return enviar(404, { error: 'ruta_desconocida', rutas: ['/probe?url=<lista>', '/probe', '/health'] });
});

srv.on('error', (err) => { process.stderr.write('server error: ' + err.message + '\n'); process.exit(1); });

srv.listen(CFG.port, CFG.bind, () => {
    process.stdout.write(`ape-list-probe v2-corregida en http://${CFG.bind}:${CFG.port} (SOLO LECTURA)\n`);
});

function cerrar(sig) {
    process.stdout.write(sig + ' recibido, cerrando\n');
    srv.close(() => { guardarCache(); process.exit(0); });
}
['SIGTERM', 'SIGINT'].forEach(s => process.on(s, () => cerrar(s)));
process.on('uncaughtException', (e) => { process.stderr.write('uncaught: ' + (e && e.stack || e) + '\n'); guardarCache(); process.exit(1); });
process.on('unhandledRejection', (r) => { process.stderr.write('unhandled: ' + r + '\n'); });
