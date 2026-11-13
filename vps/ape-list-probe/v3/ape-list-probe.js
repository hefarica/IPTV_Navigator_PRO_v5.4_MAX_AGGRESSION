#!/usr/bin/env node
'use strict';
/**
 * ape-list-probe 3.0.0 — auditor de listas M3U, sin dependencias externas.
 * GET /health · GET /probe?url=...&force=1
 * Solo lee listas y muestras. La única escritura es su caché opcional.
 * sha256 = cuerpo M3U después de Content-Encoding/gzip; conserva BOM y encoding.
 * sha256_http = cuerpo HTTP recibido, sin cabeceras ni framing de transferencia.
 * Un HTTP 304 reutiliza una medición anterior: nunca se presenta como hash nuevo.
 * Las muestras HTTP NO certifican reproducción, calidad ni ejecución del harness.
 */
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { Readable, Transform, Writable, PassThrough } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const VERSION = '3.0.0';
const SCHEMA = 'ape.list.identity.v3';
const GiB = 1024 ** 3;
const USER_AGENT = 'VLC/3.0.20 LibVLC/3.0.20';
const nowISO = () => new Date().toISOString();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value);
const hostName = value => String(value).toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

class ProbeError extends Error {
    constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
function loadConfig(env = process.env) {
    const n = (key, fallback, min, max) => {
        const value = env[key] === undefined || env[key] === '' ? fallback : Number(env[key]);
        if (!Number.isSafeInteger(value) || value < min || value > max) {
            throw new ProbeError(`CONFIG_INVALIDA_${key}`);
        }
        return value;
    };
    const list = key => (env[key] || '').split(',').map(x => hostName(x.trim())).filter(Boolean);
    const c = {
        port: n('APE_PROBE_PORT', 8787, 1, 65535),
        bind: env.APE_PROBE_BIND || '127.0.0.1',
        defaultList: env.APE_PROBE_LIST || '',
        token: env.APE_PROBE_TOKEN || '',
        maxBytes: n('APE_MAX_BYTES', 3 * GiB, 1, 64 * GiB),
        maxHttpBytes: n('APE_MAX_HTTP_BYTES', 3 * GiB, 1, 64 * GiB),
        maxLineBytes: n('APE_MAX_LINE_BYTES', 1024 * 1024, 64, 16 * 1024 * 1024),
        maxUrlBytes: n('APE_MAX_URL_BYTES', 16384, 256, 65536),
        maxPatterns: n('APE_MAX_PATTERNS', 128, 1, 1024),
        fetchTimeoutMs: n('APE_FETCH_TIMEOUT_MS', 180000, 10, 3600000),
        totalTimeoutMs: n('APE_TOTAL_TIMEOUT_MS', 240000, 10, 7200000),
        idleTimeoutMs: n('APE_IDLE_TIMEOUT_MS', 15000, 10, 300000),
        dnsTimeoutMs: n('APE_DNS_TIMEOUT_MS', 5000, 10, 60000),
        maxRedirects: n('APE_MAX_REDIRECTS', 5, 0, 10),
        sampleUrls: n('APE_SAMPLE_URLS', 3, 0, 10),
        sampleBudget: n('APE_SAMPLE_BUDGET', 24, 0, 256),
        sampleConcurrency: n('APE_SAMPLE_CONCURRENCY', 4, 1, 16),
        sampleTimeoutMs: n('APE_SAMPLE_TIMEOUT_MS', 15000, 10, 120000),
        sampleBytes: n('APE_SAMPLE_BYTES', 2048, 64, 65536),
        maxConcurrent: n('APE_MAX_CONCURRENT', 2, 1, 16),
        ratePerMin: n('APE_RATE_PER_MIN', 12, 1, 6000),
        maxRateIps: n('APE_MAX_RATE_IPS', 2048, 1, 100000),
        cacheFile: env.APE_PROBE_CACHE || path.join(__dirname, 'state', 'cache-v3.json'),
        cacheTtlMs: n('APE_CACHE_TTL_MS', 900000, 1, 86400000),
        cacheMaxEntries: n('APE_CACHE_MAX_ENTRIES', 16, 1, 128),
        cacheMaxFileBytes: n('APE_CACHE_MAX_FILE_BYTES', 16 * 1024 * 1024, 1024, 64 * 1024 * 1024),
        allowPrivateHosts: list('APE_ALLOW_PRIVATE_HOSTS'),
        allowedHosts: list('APE_ALLOWED_HOSTS'),
        shutdownTimeoutMs: n('APE_SHUTDOWN_TIMEOUT_MS', 10000, 100, 60000)
    };
    if (!['127.0.0.1', '::1', 'localhost'].includes(c.bind) && c.token.length < 24) {
        throw new ProbeError('BIND_EXTERNO_REQUIERE_APE_PROBE_TOKEN_DE_24_CARACTERES');
    }
    return c;
}

// Clasificación conservadora: ni usuario/clave en la ruta ni valores de query.
const ROUTE_WORDS = new Set(['pulse', 'live', 'movie', 'series', 'resolver', 'resolve',
    'hls', 'stream', 'streams', 'play', 'channel', 'channels', 'lists', 'get.php', 'player_api.php']);
function routeClass(input) {
    try {
        const u = new URL(input);
        const parts = u.pathname.split('/').filter(Boolean);
        const family = ROUTE_WORDS.has((parts[0] || '').toLowerCase()) ? parts[0].toLowerCase() : '{ruta}';
        const ext = (u.pathname.match(/\.(m3u8|m3u|ts|m4s|mp4|gz|aac|mpd)$/i) || [])[1];
        return `${u.protocol}//${u.host}/${family}${parts.length > 1 ? '/{segmentos}' : ''}${ext ? `.{${ext.toLowerCase()}}` : ''}`;
    } catch { return 'INVALIDA'; }
}
function redactUrl(input) {
    try { const u = new URL(input); return routeClass(u.href) + (u.search ? '?{parametros_ocultos}' : ''); }
    catch { return '[URL_INVALIDA]'; }
}
function parseUrl(input, cfg) {
    if (typeof input !== 'string' || Buffer.byteLength(input) > cfg.maxUrlBytes) {
        throw new ProbeError('URL_EXCEDE_LIMITE');
    }
    let u;
    try { u = new URL(input); } catch { throw new ProbeError('URL_INVALIDA'); }
    if (!['http:', 'https:'].includes(u.protocol)) throw new ProbeError('PROTOCOLO_NO_PERMITIDO');
    if (u.username || u.password) throw new ProbeError('USERINFO_NO_PERMITIDO_USE_RUTA_O_QUERY');
    if (!u.hostname) throw new ProbeError('HOST_INVALIDO');
    u.hash = '';
    const host = hostName(u.hostname);
    if (cfg.allowedHosts.length && !cfg.allowedHosts.includes(host)) throw new ProbeError('HOST_NO_AUTORIZADO');
    return u;
}

const blocked4 = new net.BlockList();
for (const [address, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blocked4.addSubnet(address, prefix, 'ipv4');
const global6 = new net.BlockList();
global6.addSubnet('2000::', 3, 'ipv6');
const blocked6 = new net.BlockList();
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) {
    blocked6.addSubnet(address, prefix, 'ipv6');
}
function isPublicAddress(address) {
    address = hostName(address);
    const family = net.isIP(address);
    if (family === 4) return !blocked4.check(address, 'ipv4');
    if (family === 6) return global6.check(address, 'ipv6') && !blocked6.check(address, 'ipv6');
    return false;
}
function deadline(parent, ms, code) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new ProbeError(code, 504)), ms);
    timer.unref();
    const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
    return { signal, stop: () => clearTimeout(timer) };
}
function abortable(promise, signal) {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const aborted = () => reject(signal.reason);
        signal.addEventListener('abort', aborted, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
    });
}
function safeError(error, signal) {
    if (signal?.aborted) error = signal.reason;
    if (error instanceof ProbeError) return error.code;
    const code = String(error?.code || 'ERROR_DE_RED_O_LECTURA');
    return /^[A-Z][A-Z0-9_]{0,80}$/.test(code) ? code : 'ERROR_DE_RED_O_LECTURA';
}
async function resolveTarget(u, cfg, signal) {
    const host = hostName(u.hostname);
    const allowPrivate = cfg.allowPrivateHosts.includes(host);
    let addresses;
    if (net.isIP(host)) addresses = [{ address: host, family: net.isIP(host) }];
    else {
        const limit = deadline(signal, cfg.dnsTimeoutMs, 'DNS_TIMEOUT');
        try { addresses = await abortable(dns.lookup(host, { all: true, verbatim: true }), limit.signal); }
        finally { limit.stop(); }
    }
    if (!addresses.length) throw new ProbeError('DNS_SIN_DIRECCIONES', 502);
    if (!allowPrivate && addresses.some(x => !isPublicAddress(x.address))) {
        throw new ProbeError('DESTINO_PRIVADO_O_RESERVADO_BLOQUEADO');
    }
    return addresses;
}
async function requestOnce(u, cfg, signal, headers) {
    signal.throwIfAborted();
    const addresses = await resolveTarget(u, cfg, signal);
    let lastError;
    // Se prueban solo IPs ya verificadas; cada conexión queda fijada a una IP.
    for (const selected of addresses.slice(0, 4)) {
        signal.throwIfAborted();
        try {
            return await new Promise((resolve, reject) => {
                const request = (u.protocol === 'https:' ? https : http).request(u, {
                    method: 'GET', agent: false, signal,
                    family: selected.family, autoSelectFamily: false,
                    lookup: (_host, options, callback) => options.all
                        ? callback(null, [selected]) : callback(null, selected.address, selected.family),
                    maxHeaderSize: 32768,
                    headers: { 'user-agent': USER_AGENT, accept: '*/*',
                        'accept-encoding': 'identity', connection: 'close', ...headers }
                });
                request.setTimeout(cfg.idleTimeoutMs, () => request.destroy(new ProbeError('CONEXION_INACTIVA', 504)));
                request.once('error', reject);
                request.once('response', response => {
                    // Evita errores sin listener en retornos anticipados; pipeline también los observa.
                    response.on('error', () => {});
                    resolve(response);
                });
                request.end();
            });
        } catch (error) { lastError = error; }
    }
    throw lastError;
}
async function openUrl(input, cfg, signal, headers = {}) {
    let u = parseUrl(input, cfg);
    const seen = new Set();
    let extra = { ...headers };
    for (let hops = 0; ; hops++) {
        if (seen.has(u.href)) throw new ProbeError('BUCLE_DE_REDIRECCIONES', 502);
        seen.add(u.href);
        const response = await requestOnce(u, cfg, signal, extra);
        if (![301, 302, 303, 307, 308].includes(response.statusCode)) {
            return { response, finalUrl: u.href, redirects: hops };
        }
        const location = response.headers.location;
        response.destroy();
        if (!location) throw new ProbeError('REDIRECCION_SIN_LOCATION', 502);
        if (hops >= cfg.maxRedirects) throw new ProbeError('LIMITE_DE_REDIRECCIONES', 502);
        let next;
        try { next = new URL(location, u); } catch { throw new ProbeError('LOCATION_INVALIDA', 502); }
        next = parseUrl(next.href, cfg);
        if (u.protocol === 'https:' && next.protocol === 'http:') throw new ProbeError('REDIRECCION_HTTPS_A_HTTP_BLOQUEADA');
        // Un validador pertenece al recurso original; no se propaga a otro URL.
        delete extra['if-none-match'];
        u = next;
    }
}

class CatalogParser {
    constructor(cfg, baseUrl, contentType = '') {
        this.cfg = cfg; this.baseUrl = baseUrl; this.contentType = contentType;
        this.prefix = Buffer.alloc(0); this.decoder = null; this.rest = '';
        this.encoding = null; this.encodingSource = null;
        this.lines = 0; this.extinf = 0; this.urls = 0; this.httpUrls = 0;
        this.invalidUrls = 0; this.unsupportedUrls = 0; this.orphanUrls = 0;
        this.missingUrls = 0; this.paired = 0; this.pending = false; this.firstContent = true;
        this.patterns = new Map(); this.unclassified = 0; this.patternLimit = false;
        this.media = false; this.master = false;
        this.directives = { extvlcopt: 0, kodiprop: 0, exthttp: 0, exthttp_invalidos: 0 };
        this.declaredConflict = false;
        this.harness = { extm3u: false, url2_cartridge: false, apex_qmax: false,
            ape_channels: null, quality_watch: false, lab: false, x_tvg_url: false,
            x_m3u_url: false, ejecucion_verificada: false };
    }
    initDecoder(final = false) {
        if (this.decoder || (!final && this.prefix.length < 3)) return;
        const b = this.prefix;
        if (b[0] === 0xff && b[1] === 0xfe) { this.encoding = 'utf-16le'; this.encodingSource = 'BOM'; }
        else if (b[0] === 0xfe && b[1] === 0xff) { this.encoding = 'utf-16be'; this.encodingSource = 'BOM'; }
        else if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { this.encoding = 'utf-8'; this.encodingSource = 'BOM'; }
        else {
            const label = this.contentType.match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1]?.toLowerCase();
            const encodings = { utf8: 'utf-8', 'utf-8': 'utf-8', 'utf-16': 'utf-16le',
                'utf-16le': 'utf-16le', 'utf-16be': 'utf-16be', 'iso-8859-1': 'windows-1252', 'windows-1252': 'windows-1252' };
            if (label && !encodings[label]) throw new ProbeError('CHARSET_NO_SOPORTADO');
            this.encoding = encodings[label] || 'utf-8'; this.encodingSource = label ? 'HTTP' : 'POR_DEFECTO';
        }
        this.decoder = new TextDecoder(this.encoding, { fatal: true });
        this.text(this.decoder.decode(b, { stream: true }));
        this.prefix = Buffer.alloc(0);
    }
    push(chunk) {
        if (!this.decoder) { this.prefix = Buffer.concat([this.prefix, chunk]); this.initDecoder(); }
        else this.text(this.decoder.decode(chunk, { stream: true }));
    }
    lineSize(text) {
        return this.encoding.startsWith('utf-16') ? text.length * 2
            : this.encoding === 'windows-1252' ? text.length : Buffer.byteLength(text);
    }
    text(value) {
        this.rest += value;
        let offset = 0, end;
        while ((end = this.rest.indexOf('\n', offset)) !== -1) {
            const line = this.rest.slice(offset, end);
            if (this.lineSize(line) > this.cfg.maxLineBytes) throw new ProbeError('LINEA_EXCEDE_LIMITE');
            this.line(line.replace(/\r$/, '')); offset = end + 1;
        }
        this.rest = this.rest.slice(offset);
        if (this.lineSize(this.rest) > this.cfg.maxLineBytes) throw new ProbeError('LINEA_EXCEDE_LIMITE');
    }
    line(raw) {
        this.lines++;
        const value = raw.trim();
        if (!value) return;
        if (this.firstContent) {
            this.harness.extm3u = /^#EXTM3U(?:\s|$)/i.test(value);
            this.firstContent = false;
        }
        if (value[0] === '#') {
            const tag = (value.match(/^#[^:\s]+/)?.[0] || '').toUpperCase();
            switch (tag) {
            case '#EXTINF':
                if (this.pending) this.missingUrls++;
                this.pending = true; this.extinf++; break;
            case '#EXT-X-APE-URL2-CARTRIDGE': this.harness.url2_cartridge = true; break;
            case '#EXT-X-APE-QMAX-VERSION': this.harness.apex_qmax = true; break;
            case '#EXT-X-APE-QUALITY-WATCH': this.harness.quality_watch = true; break;
            case '#EXT-X-APE-LAB': this.harness.lab = true; break;
            case '#EXT-X-TVG-URL': this.harness.x_tvg_url = true; break;
            case '#EXT-X-M3U-URL': this.harness.x_m3u_url = true; break;
            case '#EXT-X-APE-CHANNELS': {
                const match = value.match(/^#EXT-X-APE-CHANNELS:\s*(\d+)\s*$/i);
                if (!match || !Number.isSafeInteger(Number(match[1]))) this.declaredConflict = true;
                else {
                    const declared = Number(match[1]);
                    if (this.harness.ape_channels !== null && this.harness.ape_channels !== declared) this.declaredConflict = true;
                    this.harness.ape_channels = declared;
                }
                break;
            }
            case '#EXTVLCOPT': this.directives.extvlcopt++; break;
            case '#KODIPROP': this.directives.kodiprop++; break;
            case '#EXTHTTP':
                this.directives.exthttp++;
                try {
                    const obj = JSON.parse(value.slice(value.indexOf(':') + 1));
                    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error();
                } catch { this.directives.exthttp_invalidos++; }
                break;
            case '#EXT-X-STREAM-INF': case '#EXT-X-I-FRAME-STREAM-INF': this.master = true; break;
            case '#EXT-X-TARGETDURATION': case '#EXT-X-MEDIA-SEQUENCE': case '#EXT-X-PART':
            case '#EXT-X-MAP': case '#EXT-X-ENDLIST': this.media = true; break;
            }
            return;
        }
        this.urls++;
        if (this.pending) { this.pending = false; this.paired++; } else this.orphanUrls++;
        if (Buffer.byteLength(value) > this.cfg.maxUrlBytes || /[\u0000-\u001f\u007f]/.test(value)) { this.invalidUrls++; return; }
        let u;
        try { u = new URL(value, this.baseUrl); } catch { this.invalidUrls++; return; }
        if (!['http:', 'https:'].includes(u.protocol)) { this.unsupportedUrls++; return; }
        if (u.username || u.password) { this.invalidUrls++; return; }
        u.hash = ''; this.httpUrls++;
        const key = routeClass(u.href);
        let item = this.patterns.get(key);
        if (!item) {
            if (this.patterns.size >= this.cfg.maxPatterns) { this.unclassified++; this.patternLimit = true; return; }
            item = { clase: key, urls: 0, samples: [] }; this.patterns.set(key, item);
        }
        item.urls++;
        // Reservoir por clase: las últimas entradas también pueden ser seleccionadas.
        const k = this.cfg.sampleBudget ? this.cfg.sampleUrls : 0;
        if (k && item.samples.length < k) item.samples.push(u.href);
        else if (k) { const slot = crypto.randomInt(item.urls); if (slot < k) item.samples[slot] = u.href; }
    }
    finish() {
        this.initDecoder(true);
        this.text(this.decoder.decode());
        if (this.rest.length) { this.line(this.rest.replace(/\r$/, '')); this.rest = ''; }
        if (this.pending) { this.missingUrls++; this.pending = false; }
    }
    snapshot() {
        const type = !this.harness.extm3u ? 'INVALIDA' : this.master ? 'HLS_MASTER' : this.media ? 'HLS_MEDIA' : 'CATALOGO';
        const issues = [];
        if (!this.harness.extm3u) issues.push('FALTA_CABECERA_EXTM3U');
        if (type === 'CATALOGO' && !this.extinf) issues.push('SIN_ENTRADAS_EXTINF');
        if (type === 'CATALOGO' && this.missingUrls) issues.push('ENTRADAS_EXTINF_SIN_URL');
        if (type === 'CATALOGO' && this.orphanUrls) issues.push('URLS_SIN_EXTINF');
        if (this.invalidUrls) issues.push('URLS_INVALIDAS');
        if (this.unsupportedUrls) issues.push('URLS_NO_HTTP_NO_MUESTREADAS');
        if (this.directives.exthttp_invalidos) issues.push('EXTHTTP_JSON_INVALIDO');
        if (this.declaredConflict) issues.push('DECLARACIONES_APE_CHANNELS_INVALIDAS_O_CONFLICTIVAS');
        if (type === 'CATALOGO' && this.harness.ape_channels !== null && this.harness.ape_channels !== this.extinf) {
            issues.push('APE_CHANNELS_NO_COINCIDE_CON_CENSO');
        }
        if (this.patternLimit) issues.push('CLASIFICACION_LIMITADA_POR_MAX_PATTERNS');
        return {
            tipo_lista: type, lineas: this.lines, canales: type === 'CATALOGO' ? this.extinf : 0,
            urls: this.urls, urls_http: this.httpUrls, encoding_detected: this.encoding,
            encoding_origen: this.encodingSource,
            harness: { ...this.harness }, directivas: { ...this.directives },
            estructura: { valida: this.harness.extm3u && (type !== 'CATALOGO' || this.extinf > 0),
                extinf: this.extinf, entradas_con_url: this.paired,
                extinf_sin_url: this.missingUrls, urls_sin_extinf: this.orphanUrls,
                urls_invalidas: this.invalidUrls, urls_no_http: this.unsupportedUrls, hallazgos: issues },
            patrones: [...this.patterns.values()].sort((a, b) => b.urls - a.urls)
                .map(x => ({ clase: x.clase, urls: x.urls, pct: this.httpUrls ? Number((100 * x.urls / this.httpUrls).toFixed(3)) : 0 })),
            clasificacion: { completa: !this.patternLimit, urls_sin_clasificar: this.unclassified,
                max_patrones: this.cfg.maxPatterns }
        };
    }
    sampleMap() { return new Map([...this.patterns].map(([k, v]) => [k, [...v.samples]])); }
}

async function readList(response, finalUrl, cfg, signal) {
    const contentType = String(response.headers['content-type'] || '');
    const parser = new CatalogParser(cfg, finalUrl, contentType);
    const hash = crypto.createHash('sha256'), rawHash = crypto.createHash('sha256');
    let bytes = 0, httpBytes = 0, encoding = 'identity';
    try {
        const declaredLength = Number(response.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > cfg.maxHttpBytes) {
            throw new ProbeError('HTTP_BYTES_EXCEDEN_LIMITE');
        }
        const iterator = response[Symbol.asyncIterator]();
        const prefix = [];
        let prefixBytes = 0, finished = false;
        while (prefixBytes < 2 && !finished) {
            const item = await iterator.next();
            finished = item.done;
            if (!finished) { prefix.push(item.value); prefixBytes += item.value.length; }
        }
        const magic = prefixBytes >= 2 ? Buffer.concat(prefix, prefixBytes).subarray(0, 2) : Buffer.alloc(0);
        encoding = String(response.headers['content-encoding'] || 'identity').trim().toLowerCase();
        if (encoding === 'identity' && magic[0] === 0x1f && magic[1] === 0x8b) encoding = 'gzip';
        let decoder;
        if (encoding === 'gzip' || encoding === 'x-gzip') decoder = zlib.createGunzip();
        else if (encoding === 'deflate') decoder = zlib.createInflate();
        else if (encoding === 'br') decoder = zlib.createBrotliDecompress();
        else if (encoding === 'identity') decoder = new PassThrough();
        else throw new ProbeError('CONTENT_ENCODING_NO_SOPORTADO');
        async function* source() {
            try {
                yield* prefix;
                if (!finished) {
                    for (;;) { const item = await iterator.next(); if (item.done) break; yield item.value; }
                }
            } finally { response.destroy(); }
        }
        const rawMeter = new Transform({
            transform(chunk, _enc, callback) {
                if (httpBytes + chunk.length > cfg.maxHttpBytes) return callback(new ProbeError('HTTP_BYTES_EXCEDEN_LIMITE'));
                httpBytes += chunk.length; rawHash.update(chunk); callback(null, chunk);
            }
        });
        const sink = new Writable({
            write(chunk, _enc, callback) {
                if (bytes + chunk.length > cfg.maxBytes) return callback(new ProbeError('M3U_BYTES_EXCEDEN_LIMITE'));
                bytes += chunk.length; hash.update(chunk);
                try { parser.push(chunk); callback(); } catch (error) { callback(error); }
            }
        });
        await pipeline(Readable.from(source()), rawMeter, decoder, sink, { signal });
        if (!response.complete) throw new ProbeError('HTTP_CUERPO_INCOMPLETO', 502);
        if (Number.isFinite(declaredLength) && declaredLength !== httpBytes) throw new ProbeError('CONTENT_LENGTH_NO_COINCIDE', 502);
        parser.finish();
        return {
            complete: true, samples: parser.sampleMap(),
            data: { ...parser.snapshot(), sha256: hash.digest('hex'), sha256_http: rawHash.digest('hex'),
                bytes, bytes_http: httpBytes, content_encoding: encoding,
                content_type: contentType.split(';')[0].toLowerCase().slice(0, 128),
                identidad: { origen: 'DESCARGA_COMPLETA', calculada_en: nowISO(),
                    alcance_sha256: 'CUERPO_M3U_DESCOMPRIMIDO_SIN_CONVERTIR_CHARSET',
                    alcance_sha256_http: 'CUERPO_HTTP_SIN_CABECERAS_NI_FRAMING' },
                integridad: { completa: true, censo_completo: true }, no_computado: [] }
        };
    } catch (error) {
        return {
            complete: false, samples: new Map(),
            data: { ...parser.snapshot(), sha256: null, sha256_http: null, bytes, bytes_http: httpBytes,
                content_encoding: encoding, identidad: { origen: 'NO_COMPUTADA', calculada_en: null },
                integridad: { completa: false, censo_completo: false,
                    contadores: 'PARCIALES; bytes cuenta bloques aceptados, no tamaño total' },
                no_computado: [safeError(error, signal)] }
        };
    } finally { response.destroy(); }
}

// La caché persistida contiene únicamente datos de identidad y URLs redactadas.
// Las URLs reales para nuevas muestras permanecen solo en memoria, con límites.
class IdentityCache {
    constructor(cfg) {
        this.cfg = cfg; this.items = new Map(); this.writeErrors = 0;
        this.chain = Promise.resolve();
        this.fingerprint = digest(JSON.stringify({ version: VERSION, maxBytes: cfg.maxBytes,
            maxHttpBytes: cfg.maxHttpBytes, maxLineBytes: cfg.maxLineBytes, maxUrlBytes: cfg.maxUrlBytes,
            maxPatterns: cfg.maxPatterns, sampleUrls: cfg.sampleUrls, sampleBudget: cfg.sampleBudget }));
    }
    async init() {
        if (this.cfg.cacheFile === 'off') return;
        try {
            const stat = await fs.stat(this.cfg.cacheFile);
            if (!stat.isFile() || stat.size > this.cfg.cacheMaxFileBytes) return;
            const data = JSON.parse(await fs.readFile(this.cfg.cacheFile, 'utf8'));
            if (data.schema !== SCHEMA || data.fingerprint !== this.fingerprint || !Array.isArray(data.entries)) return;
            for (const [key, entry] of data.entries.slice(-this.cfg.cacheMaxEntries)) {
                if (!/^[a-f0-9]{64}$/.test(key) || !entry || !Number.isFinite(entry.expiresAt)) continue;
                if (entry.expiresAt <= Date.now() || entry.expiresAt > Date.now() + this.cfg.cacheTtlMs) continue;
                if (!/^[a-f0-9]{64}$/.test(entry.data?.sha256) || !entry.data?.integridad?.completa) continue;
                // No se reconstruyen URLs de muestras ni se confía en su disponibilidad previa.
                delete entry.samples;
                this.items.set(key, entry);
            }
        } catch { /* Una caché ausente/corrupta produce una descarga completa. */ }
    }
    prune() { for (const [key, entry] of this.items) if (entry.expiresAt <= Date.now()) this.items.delete(key); }
    get(key) {
        this.prune();
        const entry = this.items.get(key);
        if (entry) { this.items.delete(key); this.items.set(key, entry); }
        return entry;
    }
    set(key, entry) {
        this.prune(); this.items.delete(key);
        this.items.set(key, { ...entry, expiresAt: Date.now() + this.cfg.cacheTtlMs });
        while (this.items.size > this.cfg.cacheMaxEntries) this.items.delete(this.items.keys().next().value);
        this.persist();
    }
    persist() {
        if (this.cfg.cacheFile === 'off') return;
        this.chain = this.chain.then(async () => {
            this.prune();
            const entries = [...this.items].map(([key, { samples: _secretSamples, ...entry }]) => [key, entry]);
            const value = JSON.stringify({ schema: SCHEMA, fingerprint: this.fingerprint, entries });
            if (Buffer.byteLength(value) > this.cfg.cacheMaxFileBytes) { this.writeErrors++; return; }
            const directory = path.dirname(this.cfg.cacheFile);
            const temporary = `${this.cfg.cacheFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
            await fs.mkdir(directory, { recursive: true, mode: 0o700 });
            try {
                await fs.writeFile(temporary, value, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
                await fs.rename(temporary, this.cfg.cacheFile);
            } finally { await fs.unlink(temporary).catch(() => {}); }
        }).catch(() => { this.writeErrors++; });
    }
    async close() { await this.chain; }
}
function strongEtag(value) { return typeof value === 'string' && /^"[^"\r\n]*"$/.test(value) && value.length <= 1024; }

async function sampleOne(url, cfg, parent) {
    const limit = deadline(parent, cfg.sampleTimeoutMs, 'MUESTRA_TIMEOUT');
    let response, status = null;
    try {
        const opened = await openUrl(url, cfg, limit.signal, { range: `bytes=0-${cfg.sampleBytes - 1}` });
        response = opened.response; status = response.statusCode;
        const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (![200, 206].includes(status)) return { status, resultado: 'HTTP_NO_UTIL', ok: false, redirecciones: opened.redirects };
        const encoding = String(response.headers['content-encoding'] || 'identity').toLowerCase();
        const chunks = []; let length = 0;
        for await (const chunk of response) {
            const take = Math.min(chunk.length, cfg.sampleBytes - length);
            if (take) { chunks.push(chunk.subarray(0, take)); length += take; }
            if (length >= cfg.sampleBytes) break;
        }
        const prefix = Buffer.concat(chunks, length);
        const text = prefix.toString('utf8').replace(/^\uFEFF/, '').trimStart();
        let result;
        if (!length) result = 'CUERPO_VACIO';
        else if (/^(?:text\/html|application\/xhtml\+xml|application\/json|application\/problem\+json)$/.test(type)
            || /^(?:<!doctype\s+html|<html\b|<\?xml|\{\s*"|\[\s*\{)/i.test(text)) result = 'RESPUESTA_NO_MULTIMEDIA';
        else if (encoding !== 'identity') result = 'CONTENIDO_COMPRIMIDO_NO_INSPECCIONADO';
        else if (/^#EXTM3U(?:\s|$)/i.test(text)) result = 'MANIFIESTO_RECIBIDO';
        else if ((prefix[0] === 0x47 && (prefix.length < 189 || prefix[188] === 0x47))
            || (prefix.length > 8 && ['ftyp', 'styp', 'moof', 'sidx'].includes(prefix.toString('ascii', 4, 8)))
            || /^(?:video|audio)\//.test(type)) result = 'DATOS_MULTIMEDIA_RECIBIDOS';
        else result = 'CONTENIDO_NO_IDENTIFICADO';
        return { status, resultado: result,
            ok: ['MANIFIESTO_RECIBIDO', 'DATOS_MULTIMEDIA_RECIBIDOS'].includes(result),
            content_type: type.slice(0, 128), bytes_inspeccionados: length, redirecciones: opened.redirects };
    } catch (error) {
        return { status, ok: false, resultado: 'NO_VERIFICADA', error: safeError(error, limit.signal) };
    } finally {
        response?.destroy(); limit.stop();
    }
}
async function sampleAll(samples, patterns, cfg, signal) {
    const groups = patterns.map(p => ({ clase: p.clase, urls_clase: p.urls, resultados: [], probadas: 0 }));
    const byClass = new Map(groups.map(g => [g.clase, g]));
    const jobs = [];
    // Una por clase primero, después segunda/tercera; límite de solicitudes global.
    for (let index = 0; index < cfg.sampleUrls && jobs.length < cfg.sampleBudget; index++) {
        for (const group of groups) {
            const url = samples?.get(group.clase)?.[index];
            if (url && jobs.length < cfg.sampleBudget) jobs.push({ clase: group.clase, url });
        }
    }
    let cursor = 0;
    async function worker() {
        while (!signal.aborted && cursor < jobs.length) {
            const job = jobs[cursor++], started = performance.now();
            const result = await sampleOne(job.url, cfg, signal);
            result.latencia_ms = Math.round(performance.now() - started);
            const group = byClass.get(job.clase);
            group.resultados.push(result); group.probadas++;
        }
    }
    await Promise.all(Array.from({ length: Math.min(cfg.sampleConcurrency, jobs.length) }, worker));
    let tested = 0, good = 0, unverified = 0, failed = 0;
    for (const group of groups) {
        const yes = group.resultados.filter(r => r.ok).length;
        const unknown = group.resultados.filter(r => ['NO_VERIFICADA', 'CONTENIDO_NO_IDENTIFICADO', 'CONTENIDO_COMPRIMIDO_NO_INSPECCIONADO'].includes(r.resultado)).length;
        const bad = group.probadas - yes - unknown;
        tested += group.probadas; good += yes; failed += bad; unverified += unknown;
        group.estado = !group.probadas ? 'NO_MUESTREADA' : bad ? (yes ? 'MIXTA' : 'CON_FALLOS')
            : unknown ? 'INCONCLUSA' : 'SIN_FALLOS_EN_MUESTRA';
        group.exitos = yes; group.fallos = bad; group.no_verificadas = unknown;
        group.codigos = [...new Set(group.resultados.map(r => r.status).filter(x => x !== null))].sort((a, b) => a - b);
    }
    return { servabilidad: groups, muestreo: {
        metodo: 'RESERVOIR_POR_CLASE_CON_PRESUPUESTO_GLOBAL', presupuesto: cfg.sampleBudget,
        planificadas: jobs.length, probadas: tested, exitos: good, fallos: failed, no_verificadas: unverified,
        clases_totales: groups.length, clases_probadas: groups.filter(g => g.probadas).length,
        agotado_por_tiempo: signal.aborted, reproduccion_verificada: false,
        alcance: 'PREFIJO_HTTP; no valida segmentos, decodificación, DRM, fluidez ni calidad visual' } };
}

function createProbe(config) {
    const cfg = { ...loadConfig({}), ...config };
    const cache = new IdentityCache(cfg), ready = cache.init();
    const shutdown = new AbortController();
    const jobs = new Set();
    let active = 0, audits = 0, cacheHits = 0;
    async function execute(input, { force = false, signal } = {}) {
        if (shutdown.signal.aborted) throw new ProbeError('SERVICIO_CERRANDO', 503);
        if (active >= cfg.maxConcurrent) throw new ProbeError('AUDITORIAS_SIMULTANEAS_AGOTADAS', 503);
        active++; audits++;
        const start = performance.now();
        const parent = signal ? AbortSignal.any([signal, shutdown.signal]) : shutdown.signal;
        const total = deadline(parent, cfg.totalTimeoutMs, 'AUDITORIA_TIMEOUT');
        let response, phase;
        const report = { schema: SCHEMA, version: VERSION, t: nowISO(), url: redactUrl(input),
            url_id: digest(String(input)), estado: 'NO_COMPUTADO', sha256: null, sha256_http: null,
            bytes: null, bytes_http: null, last_modified: null, etag: null, canales: null, lineas: null,
            patrones: [], servabilidad: [], harness: {}, no_computado: [], warnings: [],
            identidad: { origen: 'NO_COMPUTADA', calculada_en: null },
            integridad: { completa: false, censo_completo: false }, cache: { hit: false } };
        try {
            await abortable(ready, total.signal);
            const url = parseUrl(input, cfg).href, key = digest(url);
            report.url_id = key;
            const previous = force ? null : cache.get(key);
            const needSamples = cfg.sampleUrls > 0 && cfg.sampleBudget > 0;
            const reusable = previous && strongEtag(previous.etag) && previous.finalUrlId === key
                && (!needSamples || previous.samples instanceof Map);
            phase = deadline(total.signal, cfg.fetchTimeoutMs, 'DESCARGA_TIMEOUT');
            let opened = await openUrl(url, cfg, phase.signal, reusable ? { 'if-none-match': previous.etag } : {});
            response = opened.response;
            let data, samples;
            if (response.statusCode === 304 && reusable && response.headers.etag === previous.etag
                && digest(opened.finalUrl) === previous.finalUrlId) {
                response.destroy();
                data = copy(previous.data); samples = previous.samples || new Map();
                data.identidad.origen = 'CACHE_REVALIDADA';
                report.cache = { hit: true, revalidada_en: nowISO(), criterio: '304_ETAG_FUERTE',
                    advertencia: 'Hash medido en calculada_en; el 304 confía en el validador del servidor' };
                cacheHits++;
            } else {
                if (response.statusCode === 304) {
                    response.destroy();
                    opened = await openUrl(url, cfg, phase.signal); response = opened.response;
                }
                if (response.statusCode !== 200) throw new ProbeError(`HTTP_LISTA_${response.statusCode}`, 502);
                const read = await readList(response, opened.finalUrl, cfg, phase.signal);
                data = read.data; samples = read.samples;
                if (!read.complete) {
                    Object.assign(report, data, { estado: 'INCOMPLETA' });
                    return report;
                }
                data.etag = typeof response.headers.etag === 'string' ? response.headers.etag.slice(0, 1024) : null;
                data.last_modified = typeof response.headers['last-modified'] === 'string' ? response.headers['last-modified'].slice(0, 128) : null;
                data.url_final = redactUrl(opened.finalUrl); data.redirecciones = opened.redirects;
                if (data.estructura.valida && !/\bno-store\b/i.test(String(response.headers['cache-control'] || ''))) {
                    cache.set(key, { etag: data.etag, finalUrlId: digest(opened.finalUrl), data: copy(data), samples });
                }
            }
            phase.stop(); phase = null;
            Object.assign(report, data);
            if (!data.estructura.valida) { report.estado = 'INVALIDA'; return report; }
            if (data.tipo_lista !== 'CATALOGO') {
                report.estado = 'HLS_DETECTADO';
                report.warnings.push('Es una lista HLS de reproducción; EXTINF no se cuenta como canales y no se descargan segmentos.');
                return report;
            }
            Object.assign(report, await sampleAll(samples, data.patrones, cfg, total.signal));
            if (report.estructura.hallazgos.length || report.muestreo.fallos) report.estado = 'CON_HALLAZGOS';
            else if (!report.muestreo.probadas || report.muestreo.no_verificadas || total.signal.aborted) report.estado = 'NO_VERIFICADA';
            else report.estado = 'SIN_FALLOS_EN_MUESTRA';
            if (total.signal.aborted) report.no_computado.push(safeError(null, total.signal));
            if (!needSamples) report.warnings.push('Muestreo HTTP desactivado por configuración.');
            return report;
        } catch (error) {
            report.no_computado.push(safeError(error, phase?.signal.aborted ? phase.signal : total.signal));
            return report;
        } finally {
            response?.destroy(); phase?.stop(); total.stop(); active--;
            report.duracion_ms = Math.round(performance.now() - start);
        }
    }
    function analyze(url, options) {
        const job = execute(url, options);
        jobs.add(job);
        job.then(() => jobs.delete(job), () => jobs.delete(job));
        return job;
    }
    return {
        analyze,
        stats: () => { cache.prune(); return { auditorias_activas: active, auditorias_total: audits,
            cache_hits: cacheHits, listas_en_cache: cache.items.size, errores_escritura_cache: cache.writeErrors }; },
        close: async () => { shutdown.abort(new ProbeError('SERVICIO_CERRANDO', 503));
            await Promise.allSettled([...jobs]); await cache.close(); }
    };
}

class RateLimiter {
    constructor(cfg) { this.cfg = cfg; this.buckets = new Map(); }
    take(ip) {
        const now = performance.now();
        let bucket = this.buckets.get(ip);
        if (!bucket) {
            if (this.buckets.size >= this.cfg.maxRateIps) {
                for (const [key, value] of this.buckets) if (now - value.t > 600000) this.buckets.delete(key);
            }
            // No se evicta una IP activa para dar nuevas ráfagas ilimitadas.
            if (this.buckets.size >= this.cfg.maxRateIps) return { ok: false, retry: 60 };
            bucket = { t: now, tokens: this.cfg.ratePerMin };
        }
        bucket.tokens = Math.min(this.cfg.ratePerMin, bucket.tokens + (now - bucket.t) * this.cfg.ratePerMin / 60000);
        bucket.t = now; this.buckets.set(ip, bucket);
        if (bucket.tokens < 1) return { ok: false, retry: Math.max(1, Math.ceil((1 - bucket.tokens) * 60 / this.cfg.ratePerMin)) };
        bucket.tokens--; return { ok: true, retry: 0 };
    }
}
function authorized(req, token) {
    if (!token) return true;
    const supplied = String(req.headers.authorization || '');
    return crypto.timingSafeEqual(Buffer.from(digest(supplied), 'hex'), Buffer.from(digest(`Bearer ${token}`), 'hex'));
}
function createService(config) {
    const cfg = { ...loadConfig({}), ...config };
    if (!['127.0.0.1', '::1', 'localhost'].includes(cfg.bind) && cfg.token.length < 24) {
        throw new ProbeError('BIND_EXTERNO_REQUIERE_APE_PROBE_TOKEN_DE_24_CARACTERES');
    }
    const probe = createProbe(cfg), limiter = new RateLimiter(cfg);
    const sockets = new Set();
    const server = http.createServer({ maxHeaderSize: 32768, requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
        const started = performance.now();
        function send(code, obj, headers = {}) {
            if (res.destroyed || res.writableEnded) return;
            const body = Buffer.from(JSON.stringify(obj, null, 2));
            res.writeHead(code, { 'content-type': 'application/json; charset=utf-8',
                'content-length': body.length, 'cache-control': 'no-store',
                'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
                'x-response-time': `${Math.round(performance.now() - started)}ms`, ...headers });
            res.end(body);
        }
        try {
            if (req.method !== 'GET') { req.resume(); return send(405, { error: 'METODO_NO_PERMITIDO' }, { allow: 'GET' }); }
            if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'ORIGEN_CRUZADO_NO_PERMITIDO' });
            if (!authorized(req, cfg.token)) return send(401, { error: 'NO_AUTORIZADO' }, { 'www-authenticate': 'Bearer' });
            if (!req.url || req.url.length > cfg.maxUrlBytes * 3 + 256 || !req.url.startsWith('/')) {
                return send(400, { error: 'PETICION_INVALIDA' });
            }
            // URL base fija: no se confía en Host para construir el recurso solicitado.
            const endpoint = new URL(req.url, 'http://probe.local');
            if (['127.0.0.1', '::1', 'localhost'].includes(cfg.bind) && req.headers.host) {
                let incomingHost;
                try { incomingHost = hostName(new URL(`http://${req.headers.host}`).hostname); } catch { incomingHost = ''; }
                if (!['127.0.0.1', '::1', 'localhost'].includes(incomingHost)) return send(403, { error: 'HOST_LOCAL_REQUERIDO' });
            }
            if (endpoint.pathname === '/health') return send(200, { ok: true, servicio: 'ape-list-probe', version: VERSION,
                solo_lectura: true, escritura_local: cfg.cacheFile === 'off' ? 'DESACTIVADA' : 'SOLO_CACHE_PROPIA',
                lista_por_defecto: cfg.defaultList ? redactUrl(cfg.defaultList) : null,
                uptime_s: Math.floor(process.uptime()), memoria: process.memoryUsage(), ...probe.stats() });
            if (endpoint.pathname !== '/probe') return send(404, { error: 'RUTA_DESCONOCIDA', rutas: ['/health', '/probe?url=...&force=1'] });
            const rate = limiter.take(req.socket.remoteAddress || '?');
            if (!rate.ok) return send(429, { error: 'RATE_LIMIT', retry_after: rate.retry }, { 'retry-after': String(rate.retry) });
            if (endpoint.searchParams.getAll('url').length > 1 || endpoint.searchParams.getAll('force').length > 1) {
                return send(400, { error: 'PARAMETROS_DUPLICADOS' });
            }
            const url = endpoint.searchParams.get('url') || cfg.defaultList;
            const force = endpoint.searchParams.get('force');
            if (!url) return send(400, { error: 'FALTA_URL', uso: '/probe?url=<lista>&force=1' });
            if (force !== null && !['0', '1'].includes(force)) return send(400, { error: 'FORCE_DEBE_SER_0_O_1' });
            try { parseUrl(url, cfg); } catch (error) { return send(400, { error: safeError(error) }); }
            const controller = new AbortController();
            const disconnected = () => { if (!res.writableEnded) controller.abort(new ProbeError('CLIENTE_DESCONECTADO')); };
            res.once('close', disconnected);
            try {
                const result = await probe.analyze(url, { force: force === '1', signal: controller.signal });
                // 200 significa informe emitido; estado/integridad expresan su resultado.
                send(200, result);
            } finally { res.removeListener('close', disconnected); }
        } catch (error) {
            const status = error instanceof ProbeError ? error.status : 500;
            send(status, { error: error instanceof ProbeError ? error.code : 'ERROR_INTERNO' }, status === 503 ? { 'retry-after': '2' } : {});
        }
    });
    server.keepAliveTimeout = 5000;
    server.maxRequestsPerSocket = 100;
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    server.on('clientError', (_error, socket) => { if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
    let closing;
    async function close() {
        if (closing) return closing;
        closing = (async () => {
            const timer = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, cfg.shutdownTimeoutMs);
            timer.unref();
            try {
                await Promise.all([
                    new Promise(resolve => { server.close(() => resolve()); server.closeIdleConnections(); }),
                    probe.close()
                ]);
            } finally { clearTimeout(timer); }
        })();
        return closing;
    }
    return { server, probe, close };
}

module.exports = { loadConfig, createProbe, createService, isPublicAddress, redactUrl, routeClass, VERSION };
if (require.main === module) {
    let service;
    try {
        const cfg = loadConfig();
        service = createService(cfg);
        service.server.on('error', async error => {
            process.stderr.write(`ape-list-probe: ${safeError(error)}\n`);
            process.exitCode = 1; await service.close();
        });
        service.server.listen(cfg.port, cfg.bind, () => {
            process.stdout.write(`ape-list-probe ${VERSION} — ${cfg.bind}:${cfg.port} — solo lectura\n`);
        });
        let stopping = false;
        for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => {
            if (stopping) return;
            stopping = true;
            const forceExit = setTimeout(() => process.exit(1), cfg.shutdownTimeoutMs + 500);
            forceExit.unref();
            await service.close(); clearTimeout(forceExit);
            // dns.lookup() nativo puede seguir activo tras cancelar su espera.
            // Los trabajos y la escritura de caché ya finalizaron.
            process.exit(0);
        });
    } catch (error) {
        process.stderr.write(`ape-list-probe: ${safeError(error)}\n`); process.exitCode = 1;
    }
}
