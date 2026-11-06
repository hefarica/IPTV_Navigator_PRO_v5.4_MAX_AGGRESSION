/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE SERVER PROFILE — modulo multiservidor IDEMPOTENTE · POLIMORFICO · ISOMORFICO
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POR QUE EXISTE
 *   Cada servidor IPTV nuevo obligaba a repetir a mano el mismo trabajo: averiguar
 *   su forma de URL, sus credenciales, si el CDN exige un User-Agent de player, si
 *   tolera Referer, y si honra Range (206). Este modulo hace ese trabajo una vez,
 *   lo guarda como PERFIL por host, y lo reusa. Un servidor nuevo entra por el
 *   mismo camino sin tocar codigo.
 *
 * TRES PROPIEDADES, MEDIDAS NO PROMETIDAS
 *
 *   IDEMPOTENTE  La identidad de un perfil es `profileKey` (scheme://host:port) +
 *                `inputHash` (las entradas que afectan la medicion). Re-ejecutar con
 *                las mismas entradas NO incrementa `revision` ni re-mide dentro del
 *                TTL. El store se serializa con claves ordenadas, asi el JSON es
 *                byte-identico entre corridas equivalentes.
 *
 *   POLIMORFICO  `detectShape()` acepta la forma que venga: string de URL completa,
 *                string de base, u objeto con `url` / `base_url` / `baseUrl` / `host`
 *                / `server`. `classify()` devuelve uno de los 5 tipos del adaptador
 *                USA (XTREAM_HTTP, XTREAM_HTTPS, FRONTCDN, STALKER, CUSTOM_AUTO) y
 *                la directiva que corresponda. Nada esta hardcodeado por dominio.
 *
 *   ISOMORFICO   No importa http/https ni fetch: el transporte se INYECTA o se
 *                autodetecta. El mismo fichero corre en el navegador (fetch) y en
 *                Node (http/https) sin ramas de entorno en la logica.
 *
 * FAIL-HONEST
 *   Sin transporte, o sin medicion, el estado es UNMEASURED — nunca se inventa un
 *   `honors_206`, ni un `authOk`, ni un `uaSensitive`. Y `EMIT_BYTERANGE` solo es
 *   true con `honors206 === true` medido.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    // isomorfico: CommonJS en Node, global en navegador
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (root && typeof root === 'object') { root.APE_SERVER_PROFILE = api; }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
    'use strict';

    const VERSION = '1.0.0';
    const PROBE_VERSION = 1;

    // TTL por defecto de una medicion: 6 h. Una capacidad de protocolo no cambia
    // cada minuto; re-medir en cada generacion es desperdicio y ruido.
    const TTL_MS = 6 * 60 * 60 * 1000;

    // User-Agent de player para sondear. Un CDN que bloquea curl devuelve codigos
    // falsos (medido: line devolvia 461 y MEGA reset con UA curl, 302 con UA player).
    const UA_PLAYER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
    const UA_PROBE = 'curl/8.5.0';

    // ── hash determinista (FNV-1a 32 bits) — sin crypto, isomorfico ───────────
    function hash32(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('00000000' + h.toString(16)).slice(-8);
    }

    // ── 1. DETECCION DE FORMA (polimorfica) ──────────────────────────────────

    /**
     * Acepta cualquier forma y devuelve una forma canonica.
     * Formas soportadas:
     *   'http://host:8080/live/u/p/1.m3u8'      URL completa
     *   'http://host:8080'                       base
     *   { url: '...' } | { base_url } | { baseUrl } | { host } | { server }
     */
    function detectShape(input) {
        let raw = '';
        if (typeof input === 'string') raw = input;
        else if (input && typeof input === 'object') {
            raw = input.url || input.base_url || input.baseUrl || input.baseURL ||
                  input.server || input.host || '';
            if (!raw && typeof input.origin === 'string') raw = input.origin;
        }
        raw = String(raw || '').trim();
        if (!raw) return null;

        // sin esquema: asumir http (el protocolo del proveedor es sagrado, pero
        // no podemos adivinarlo si no viene; se marca inferido)
        let schemeInferred = false;
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) { raw = 'http://' + raw; schemeInferred = true; }

        let u;
        try { u = new URL(raw); } catch { return null; }
        if (!/^https?:$/.test(u.protocol)) return null;

        const segs = u.pathname.split('/').filter(Boolean);
        const last = segs.length ? segs[segs.length - 1] : '';
        const extM = last.match(/\.([A-Za-z0-9]{1,6})$/);
        const ext = extM ? '.' + extM[1].toLowerCase() : '';

        // plantilla estructural: live/ALNUM/ALNUM/NUM
        const tmpl = segs.map(s => {
            if (/^\d+(\.\w+)?$/.test(s)) return 'NUM';
            if (/^live$/i.test(s)) return 'live';
            if (/^movie$/i.test(s)) return 'movie';
            if (/^series$/i.test(s)) return 'series';
            if (/^play$/i.test(s)) return 'play';
            if (/^hls$/i.test(s)) return 'hls';
            if (/^hlsr$/i.test(s)) return 'hlsr';
            if (/^portal\.php$/i.test(s)) return 'portal.php';
            if (/^get\.php$/i.test(s)) return 'get.php';
            if (/^player_api\.php$/i.test(s)) return 'player_api.php';
            if (/^[A-Za-z0-9_-]{1,32}$/.test(s)) return 'ALNUM';
            return 'LIT';
        }).join('/');

        // credenciales presentes en el path: .../user/pass/id.ext
        const nums = segs.map((s, i) => (/^\d+(\.\w+)?$/.test(s) ? i : -1)).filter(i => i >= 0);
        let user = null, pass = null, streamId = null;
        if (nums.length) {
            const idIdx = nums[nums.length - 1];
            streamId = segs[idIdx].replace(/\.\w+$/, '');
            if (idIdx >= 2) { user = segs[idIdx - 2]; pass = segs[idIdx - 1]; }
        }

        const queryKeys = [];
        for (const k of u.searchParams.keys()) queryKeys.push(k);

        return {
            raw,
            scheme: u.protocol.replace(':', ''),
            host: u.hostname,
            port: u.port || (u.protocol === 'https:' ? '443' : '80'),
            portExplicit: u.port !== '',
            origin: u.protocol + '//' + u.host,
            baseUrl: u.protocol + '//' + u.host,
            pathname: u.pathname,
            segments: segs.length,
            template: tmpl,
            ext,
            user, pass, streamId,
            queryKeys: queryKeys.sort(),
            schemeInferred
        };
    }

    // ── 2. CLASIFICACION (tabla del adaptador USA) ───────────────────────────

    function classify(shape) {
        if (!shape) return { type: 'UNKNOWN', reason: 'sin forma' };
        const t = shape.template || '';
        const p = shape.pathname || '';

        if (/portal\.php|\/c\/|stalker/i.test(p) || /\bMAC\b/i.test(p)) {
            return { type: 'STALKER', reason: 'portal.php / /c/ / MAC' };
        }
        if (shape.queryKeys.some(k => /^(token|auth|sig|signature|expires)$/i.test(k))) {
            return { type: 'FRONTCDN', reason: 'token en query' };
        }
        if (/(^|\/)(live|movie|series)\//i.test(t) && shape.user && shape.streamId) {
            return { type: shape.scheme === 'https' ? 'XTREAM_HTTPS' : 'XTREAM_HTTP', reason: 'path /live|movie|series/ user/pass/id' };
        }
        // passthrough: un manifest HLS directo sin credenciales en el path
        if (/\.m3u8$/i.test(shape.ext)) {
            return { type: shape.scheme === 'https' ? 'XTREAM_HTTPS' : 'XTREAM_HTTP', reason: 'manifest .m3u8 directo' };
        }
        return { type: 'CUSTOM_AUTO', reason: 'passthrough' };
    }

    // ── 3. IDENTIDAD (idempotencia) ──────────────────────────────────────────

    /** Identidad estable de un servidor: SIN credenciales, SIN stream id. */
    function profileKey(shapeOrInput) {
        const s = typeof shapeOrInput === 'string' || (shapeOrInput && !shapeOrInput.template)
            ? detectShape(shapeOrInput) : shapeOrInput;
        if (!s) return null;
        return s.scheme + '://' + s.host + ':' + s.port;
    }

    function sortedStringify(o) {
        if (o === null || typeof o !== 'object') return JSON.stringify(o);
        if (Array.isArray(o)) return '[' + o.map(sortedStringify).join(',') + ']';
        const keys = Object.keys(o).sort();
        return '{' + keys.map(k => JSON.stringify(k) + ':' + sortedStringify(o[k])).join(',') + '}';
    }

    /** Hash de las ENTRADAS que afectan la medicion. Cambia si cambia el server. */
    function inputHash(shape, creds) {
        return hash32(sortedStringify({
            key: profileKey(shape),
            user: (creds && creds.user) || null,
            pass: (creds && creds.pass) || null,
            probeVersion: PROBE_VERSION
        }));
    }

    // ── 4. TRANSPORTE (isomorfico) ───────────────────────────────────────────

    /**
     * Devuelve { request(url, opts) } o null si no hay transporte disponible.
     * opts: { headers, timeoutMs, method }
     * request resuelve { status, headers, body, bytes, ms } o { err }.
     */
    function resolveTransport(env) {
        const e = env || root || {};
        if (typeof e.fetch === 'function') {
            return {
                name: 'fetch',
                request(url, opts) {
                    const o = opts || {};
                    const t0 = Date.now();
                    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
                    const timer = ctl ? setTimeout(() => ctl.abort(), o.timeoutMs || 15000) : null;
                    return e.fetch(url, {
                        method: o.method || 'GET',
                        headers: o.headers || {},
                        redirect: 'manual',
                        signal: ctl ? ctl.signal : undefined
                    }).then(async (res) => {
                        let body = '';
                        try { body = await res.text(); } catch (_) { body = ''; }
                        if (timer) clearTimeout(timer);
                        const h = {};
                        try { res.headers.forEach((v, k) => { h[k.toLowerCase()] = v; }); } catch (_) {}
                        return { status: res.status, headers: h, body, bytes: body.length, ms: Date.now() - t0 };
                    }).catch((err) => {
                        if (timer) clearTimeout(timer);
                        return { err: (err && (err.name === 'AbortError' ? 'TIMEOUT' : err.message)) || 'FETCH_FAIL' };
                    });
                }
            };
        }
        // Node
        if (typeof e.require === 'function') {
            let http, https, URLc;
            try { http = e.require('http'); https = e.require('https'); URLc = e.require('url').URL; }
            catch (_) { return null; }
            return {
                name: 'node-http',
                request(urlStr, opts) {
                    const o = opts || {};
                    return new Promise((resolve) => {
                        let u; try { u = new URLc(urlStr); } catch { return resolve({ err: 'BADURL' }); }
                        const mod = u.protocol === 'https:' ? https : http;
                        const t0 = Date.now();
                        let done = false;
                        const fin = (x) => { if (!done) { done = true; resolve(x); } };
                        const r = mod.request({
                            method: o.method || 'GET',
                            hostname: u.hostname,
                            port: u.port || (u.protocol === 'https:' ? 443 : 80),
                            path: u.pathname + (u.search || ''),
                            headers: o.headers || {},
                            rejectUnauthorized: false,
                            timeout: o.timeoutMs || 15000
                        }, (res) => {
                            let n = 0, buf = '';
                            res.on('data', (c) => { n += c.length; if (buf.length < 4096) buf += c; if (n > 65536) res.destroy(); });
                            const out = () => {
                                const h = {};
                                for (const [k, v] of Object.entries(res.headers || {})) h[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v;
                                fin({ status: res.statusCode, headers: h, body: buf, bytes: n, ms: Date.now() - t0 });
                            };
                            res.on('end', out); res.on('close', out);
                        });
                        r.on('timeout', () => { r.destroy(); fin({ err: 'TIMEOUT' }); });
                        r.on('error', (err) => fin({ err: err.code || err.message }));
                        r.end();
                    });
                }
            };
        }
        return null;
    }

    // ── 5. MEDICION ──────────────────────────────────────────────────────────

    /**
     * Mide un servidor. Todo lo que no se pueda medir queda en null (no en false).
     *
     * baseUrl       : 'http://host:port'
     * creds         : { user, pass } | null
     * sampleUrl     : una URL representativa CON path (para clasificar el tipo)
     * segmentUrl    : URL de un segmento real (opcional; sin esto honors206 = null)
     * transport     : de resolveTransport(), o se autodetecta
     * timeoutMs     : por request
     */
    async function measure(baseUrl, opts) {
        const o = opts || {};
        const shape = detectShape(baseUrl);
        if (!shape) return { state: 'UNMEASURED', reason: 'forma invalida' };
        const tr = o.transport || resolveTransport(o.env);
        if (!tr) return { state: 'UNMEASURED', reason: 'sin transporte (ni fetch ni http)' };

        const timeoutMs = o.timeoutMs || 12000;
        // Clasificar con una URL REPRESENTATIVA (con path), no con la base: la base
        // de un Xtream es 'http://host' y no lleva /live/user/pass/id, asi que
        // clasificarla da CUSTOM_AUTO. Si el llamador no pasa sampleUrl se usa la
        // base, que es lo unico que hay.
        const sampleShape = (o.sampleUrl ? detectShape(o.sampleUrl) : null) || shape;
        const cls = classify(sampleShape);
        const m = {
            state: 'MEASURED',
            measuredAt: new Date().toISOString(),
            probeVersion: PROBE_VERSION,
            transport: tr.name,
            host: shape.host,
            scheme: shape.scheme,
            port: shape.port,
            type: cls.type,
            typeReason: cls.reason,

            reachable: null,
            status: null,
            latencyMs: null,
            authOk: null,
            accountStatus: null,
            maxConnections: null,
            uaSensitive: null,
            refererTolerant: null,
            acceptRanges: null,
            honors206: null,
            notes: []
        };

        const hdr = (ua, extra) => Object.assign({ 'User-Agent': ua, 'Accept': '*/*', 'Accept-Encoding': 'identity' }, extra || {});

        // 5a · ¿responde? con UA de player, porque un CDN puede bloquear curl
        const playerUa = await tr.request(shape.baseUrl + '/', { headers: hdr(UA_PLAYER), timeoutMs });
        if (playerUa.err) {
            m.reachable = false;
            m.status = playerUa.err;
            m.notes.push('con UA de player: ' + playerUa.err);
            m.state = 'UNMEASURED';
            m.reason = 'el host no responde desde esta ruta (' + playerUa.err + ')';
            return m;
        }
        m.reachable = true;
        m.status = playerUa.status;
        m.latencyMs = playerUa.ms;

        // 5b · ¿depende del User-Agent? (curl vs player)
        const curlUa = await tr.request(shape.baseUrl + '/', { headers: hdr(UA_PROBE), timeoutMs });
        if (!curlUa.err) {
            m.uaSensitive = curlUa.status !== playerUa.status;
            if (m.uaSensitive) m.notes.push('UA cambia la respuesta: player=' + playerUa.status + ' curl=' + curlUa.status);
        } else {
            m.uaSensitive = true;
            m.notes.push('con UA curl falla: ' + curlUa.err);
        }

        // 5c · ¿tolera Referer?
        const withRef = await tr.request(shape.baseUrl + '/', {
            headers: hdr(UA_PLAYER, { 'Referer': shape.baseUrl + '/' }), timeoutMs
        });
        if (!withRef.err) {
            m.refererTolerant = withRef.status === playerUa.status;
            if (!m.refererTolerant) m.notes.push('Referer cambia la respuesta: ' + playerUa.status + ' -> ' + withRef.status);
        } else {
            m.refererTolerant = false;
            m.notes.push('con Referer falla: ' + withRef.err);
        }

        // 5d · auth (player_api) si hay credenciales
        if (o.creds && o.creds.user && o.creds.pass) {
            const api = shape.baseUrl + '/player_api.php?username=' + encodeURIComponent(o.creds.user) +
                        '&password=' + encodeURIComponent(o.creds.pass);
            const r = await tr.request(api, { headers: hdr(UA_PLAYER), timeoutMs });
            if (!r.err) {
                m.authStatus = r.status;
                try {
                    const j = JSON.parse(r.body || '{}');
                    if (j.user_info) {
                        m.authOk = j.user_info.auth === 1 || j.user_info.auth === '1';
                        m.accountStatus = j.user_info.status || null;
                        m.maxConnections = j.user_info.max_connections != null ? String(j.user_info.max_connections) : null;
                    } else {
                        m.authOk = false;
                        m.notes.push('player_api sin user_info (status ' + r.status + ')');
                    }
                } catch {
                    m.authOk = null;
                    m.notes.push('player_api no devolvio JSON (status ' + r.status + ')');
                }
            } else {
                m.notes.push('player_api: ' + r.err);
            }
        }

        // 5e · byte-range (206) sobre un SEGMENTO real. Sin segmento no se mide.
        if (o.segmentUrl) {
            const base = await tr.request(o.segmentUrl, { headers: hdr(UA_PLAYER), timeoutMs });
            if (!base.err) {
                m.acceptRanges = (base.headers && base.headers['accept-ranges']) || null;
                const rng = await tr.request(o.segmentUrl, { headers: hdr(UA_PLAYER, { 'Range': 'bytes=0-1023' }), timeoutMs });
                if (!rng.err) {
                    m.honors206 = rng.status === 206;
                    m.rangeStatus = rng.status;
                    m.rangeContentRange = (rng.headers && rng.headers['content-range']) || null;
                    m.rangeBytes = rng.bytes;
                    m.segmentBytes = base.bytes;
                    if (!m.honors206) {
                        m.notes.push('Range ignorado: pidio 1024 B y devolvio ' + rng.bytes + ' B con status ' + rng.status);
                    }
                } else {
                    m.notes.push('probe de Range fallo: ' + rng.err);
                }
            } else {
                m.notes.push('segmento no alcanzable: ' + base.err);
            }
        } else if (o.segmentUrl === undefined) {
            m.notes.push('sin segmentUrl: honors206 NO medido');
        }

        return m;
    }

    // ── 6. STORE IDEMPOTENTE ─────────────────────────────────────────────────

    function emptyStore() {
        return { moduleVersion: VERSION, probeVersion: PROBE_VERSION, ttlMs: TTL_MS, servers: {} };
    }

    function ageMs(profile, now) {
        if (!profile || !profile.measuredAt) return Infinity;
        const t = Date.parse(profile.measuredAt);
        if (isNaN(t)) return Infinity;
        return (now || Date.now()) - t;
    }

    /**
     * ¿hay que (re)medir? SI:
     *   - no hay perfil
     *   - cambio el inputHash (otras credenciales / otro server)
     *   - expiro el TTL
     */
    function needsMeasure(store, key, iHash, ttlMs) {
        const p = store && store.servers && store.servers[key];
        if (!p) return { need: true, why: 'sin perfil' };
        if (p.inputHash !== iHash) return { need: true, why: 'cambio el inputHash' };
        if (p.state !== 'MEASURED') return { need: true, why: 'perfil en estado ' + p.state };
        const ttl = ttlMs != null ? ttlMs : (store.ttlMs || TTL_MS);
        if (ageMs(p) > ttl) return { need: true, why: 'TTL expirado' };
        return { need: false, why: 'fresco' };
    }

    /**
     * Fusiona una medicion en el store. IDEMPOTENTE:
     *   - mismo inputHash y ya MEASURED -> no cambia revision ni measuredAt
     *   - inputHash nuevo -> revision++
     * Devuelve un store NUEVO (no muta el de entrada).
     */
    function upsert(store, measurement, opts) {
        const o = opts || {};
        const base = store && store.servers ? store : emptyStore();
        const next = {
            moduleVersion: VERSION,
            probeVersion: PROBE_VERSION,
            ttlMs: base.ttlMs || TTL_MS,
            servers: Object.assign({}, base.servers)
        };
        const key = profileKey(measurement.host || measurement.baseUrl);
        if (!key) return next;

        const prev = next.servers[key];
        const iHash = measurement.inputHash || inputHash(detectShape(measurement.host || measurement.baseUrl), o.creds);

        if (prev && prev.inputHash === iHash && prev.state === 'MEASURED' && measurement.state === 'MEASURED') {
            // idempotente: mismas entradas, misma medicion -> no se toca nada
            return next;
        }
        next.servers[key] = Object.assign({}, measurement, {
            key,
            inputHash: iHash,
            revision: prev ? (prev.revision || 1) + 1 : 1
        });
        return sortStore(next);
    }

    /** Serializacion determinista: claves ordenadas, JSON estable. */
    function sortStore(store) {
        const keys = Object.keys(store.servers || {}).sort();
        const servers = {};
        for (const k of keys) servers[k] = store.servers[k];
        return Object.assign({}, store, { servers });
    }

    function toJSON(store) { return JSON.stringify(sortStore(store)); }

    function fromJSON(str) {
        try {
            const j = typeof str === 'string' ? JSON.parse(str) : str;
            if (!j || typeof j !== 'object' || !j.servers) return emptyStore();
            return sortStore({
                moduleVersion: j.moduleVersion || VERSION,
                probeVersion: j.probeVersion || PROBE_VERSION,
                ttlMs: j.ttlMs || TTL_MS,
                servers: j.servers
            });
        } catch { return emptyStore(); }
    }

    // ── 6b. PERSISTENCIA (isomorfica: localStorage en navegador, sin-op en Node) ──

    const STORAGE_KEY = 'ape_server_profiles';

    /** Guarda el store. En Node no hay localStorage: devuelve null sin fallar. */
    function saveToStorage(store, key) {
        const ls = (typeof localStorage !== 'undefined') ? localStorage : null;
        if (!ls) return null;
        const k = key || STORAGE_KEY;
        try { ls.setItem(k, toJSON(store)); return k; } catch (_) { return null; }
    }

    /** Carga el store. Sin dato o corrupto devuelve un store vacio (fail-safe). */
    function loadFromStorage(key) {
        const ls = (typeof localStorage !== 'undefined') ? localStorage : null;
        if (!ls) return emptyStore();
        const k = key || STORAGE_KEY;
        try {
            const raw = ls.getItem(k);
            return raw ? fromJSON(raw) : emptyStore();
        } catch (_) { return emptyStore(); }
    }

    function clearStorage(key) {
        const ls = (typeof localStorage !== 'undefined') ? localStorage : null;
        if (!ls) return false;
        try { ls.removeItem(key || STORAGE_KEY); return true; } catch (_) { return false; }
    }

    // ── 7. DESCUBRIMIENTO (multifuente, dedup, determinista) ─────────────────

    /**
     * Fusiona servidores de varias fuentes sin duplicar.
     * Acepta cualquier forma por elemento (string u objeto).
     * Devuelve [{ key, shape, type, creds, sources[] }] ordenado por key.
     */
    function discover(sources) {
        const map = new Map();
        const add = (input, sourceName) => {
            const shape = detectShape(input);
            if (!shape) return;
            const key = profileKey(shape);
            if (!key) return;
            let rec = map.get(key);
            if (!rec) {
                rec = { key, shape, type: classify(shape).type, creds: null, sources: [] };
                map.set(key, rec);
            }
            if (!rec.sources.includes(sourceName)) rec.sources.push(sourceName);
            // credenciales: gana la primera que aparezca, determinista por sourceName
            if (!rec.creds && shape.user && shape.pass) rec.creds = { user: shape.user, pass: shape.pass };
            else if (!rec.creds && input && typeof input === 'object' && (input.username || input.user) && (input.password || input.pass)) {
                rec.creds = { user: input.username || input.user, pass: input.password || input.pass };
            }
        };

        const list = Array.isArray(sources) ? sources : [sources];
        for (const src of list) {
            if (!src) continue;
            const name = (src.name || 'source');
            const items = Array.isArray(src.items) ? src.items : [];
            for (const it of items) add(it, name);
        }
        const out = [...map.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
        for (const r of out) r.sources.sort();
        return out;
    }

    // ── 8. EMISION (consumo por el generador) ────────────────────────────────

    function getProfile(store, hostOrUrl) {
        const key = profileKey(hostOrUrl);
        return key && store && store.servers ? (store.servers[key] || null) : null;
    }

    /** ¿se puede emitir #EXT-X-BYTERANGE? Solo con 206 medido. */
    function shouldEmitByterange(profile) {
        return !!(profile && profile.state === 'MEASURED' && profile.honors206 === true);
    }

    /** Tag de capacidad por canal. Nunca miente: sin dato -> UNMEASURED. */
    function capabilityTag(profile, host) {
        const p = profile || null;
        const state = !p ? 'UNMEASURED' : (p.state === 'MEASURED' ? (p.honors206 === true ? 'VERIFIED-206' : (p.honors206 === false ? 'MEASURED-NO-206' : 'MEASURED-RANGE-UNKNOWN')) : 'UNMEASURED');
        const honors = p ? p.honors206 : null;
        const accepts = p ? (p.acceptRanges || null) : null;
        const emit = shouldEmitByterange(p);
        return '#EXT-X-APE-RANGE-CAPABILITY:HOST=' + (p && p.host ? p.host : (host || 'unknown')) +
            ',ACCEPT_RANGES=' + (accepts === null ? 'unknown' : String(!!accepts)) +
            ',HONORS_206=' + (honors === null || honors === undefined ? 'unknown' : String(!!honors)) +
            ',EMIT_BYTERANGE=' + String(emit) +
            ',STATE=' + state +
            ',POLICY=EMIT-X-BYTERANGE-SOLO-CON-HONORS-206' +
            ',MODULE=APE_SERVER_PROFILE@' + VERSION;
    }

    function modeTag(profile) {
        return '#EXT-X-APE-RANGE-MODE:' + (shouldEmitByterange(profile) ? 'BYTERANGE-ELIGIBLE' : 'FULL-OBJECT');
    }

    /** Directivas extra por tipo de servidor (tabla USA). */
    function directiveOverrides(type) {
        switch (type) {
            case 'XTREAM_HTTP':  return { extvlcopt: [], kodiprop: [] };
            case 'XTREAM_HTTPS': return { extvlcopt: [], kodiprop: [] };
            case 'FRONTCDN':     return { extvlcopt: ['http-forward=true'], kodiprop: ['inputstream.adaptive.live_caching=60000'] };
            case 'STALKER':      return { extvlcopt: [], kodiprop: ['inputstream.adaptive.manifest_type=mpd'] };
            default:             return { extvlcopt: ['http-reconnect=true'], kodiprop: [] };
        }
    }

    // ── API ──────────────────────────────────────────────────────────────────
    return Object.freeze({
        VERSION, PROBE_VERSION, TTL_MS, UA_PLAYER, UA_PROBE,
        detectShape, classify, profileKey, inputHash, hash32, sortedStringify,
        resolveTransport, measure,
        emptyStore, needsMeasure, upsert, sortStore, toJSON, fromJSON, ageMs,
        saveToStorage, loadFromStorage, clearStorage, STORAGE_KEY,
        discover, getProfile, shouldEmitByterange, capabilityTag, modeTag, directiveOverrides
    });
});
