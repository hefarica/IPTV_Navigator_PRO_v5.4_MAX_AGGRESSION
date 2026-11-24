/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧭 APE OUTPUT MATRIX · v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * UNA sola tabla para las 8 salidas del motor, compartida por dos consumidores:
 *
 *   1. EL PANEL (`output-status-panel.js`) → qué URL probar, cómo clasificar la
 *      respuesta y por qué un estado NO es verde.
 *   2. EL GENERADOR (`m3u8-typed-arrays-ultimate.js`) → la etiqueta
 *      `#EXT-X-APE-OUTPUT-MATRIX` que declara en cada canal esas mismas rutas,
 *      de modo que lo que la lista promete y lo que el panel prueba sea
 *      exactamente lo mismo (una sola fuente de verdad).
 *
 * DE DÓNDE SALE CADA RUTA (ingeniería inversa sobre vps/ape-jit/server.js, no
 * supuestos):
 *   · `/playlist.m3u8`              → router de la lista maestra del catálogo.
 *   · `/catalog.json`              → línea 6675 (`=== '/catalog.json'`).
 *   · `/live/<id>/master.m3u8`     → línea 9841: el nombre servido se resuelve
 *                                    contra el directorio de la sesión.
 *   · `/live/<id>/manifest.mpd`    → misma ruta, MIME por extensión.
 *   · `/live/<id>/manifest.json`   → ANUNCIADO en `#EXT-X-SESSION-DATA`
 *                                    (línea 5301) y en el catálogo; ningún
 *                                    handler lo escribe ni lo enruta: se sirve
 *                                    sólo si existe el fichero en la sesión.
 *   · `/meta/<id>.json`            → ANUNCIADO en `#EXT-X-SESSION-DATA`
 *                                    (línea 5300) y en la cabecera `Link`
 *                                    (línea 9866); tampoco tiene router.
 *   · `init-*.m4s` con Range       → `sendStatic` (línea 5475) responde 206.
 *                                    El nombre real es por sesión
 *                                    (`init-<run>-<track>.m4s`), y reutilizar
 *                                    `init-0.m4s` entre sesiones está prohibido
 *                                    por docs/policies/STREAMING_CONTINUITY_LAW.md:28
 *                                    → la sonda DESCUBRE el nombre en el
 *                                    `#EXT-X-MAP:URI="…"` de la playlist real.
 *
 * REGLAS DE HONESTIDAD (no negociables):
 *   · Ningún host literal: la base sale de la configuración del usuario.
 *   · Ningún estado verde sin cuerpo/cabecera que lo demuestre.
 *   · Si falta el canal o el host, se DECLARA; no se inventa ni se simula.
 *
 * Sin DOM, sin red propia (recibe `fetch`), determinista: se puede probar en node.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
    var api = factory();
    if (root) root.APE_OUTPUT_MATRIX = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    var VERSION = '1.0.0';

    /* La base convenida ya termina en `/jit`: server.js:6874 deja escrito que
     * `publicBase()` ya lo trae y añadirlo otra vez produce `/jit/jit/...` (404).
     * Por eso las plantillas empiezan en `/`. */
    var TEMPLATES = {
        playlist: '/playlist.m3u8',
        catalog: '/catalog.json',
        hls: '/live/{id}/master.m3u8',
        dash: '/live/{id}/manifest.mpd',
        json: '/live/{id}/manifest.json',
        meta: '/meta/{id}.json',
        init: '/live/{id}/init-0.m4s'
    };

    /* Las 8 salidas que el panel dibuja, en el orden en que se leen.
     * `need`: 'none' (lista global) | '4k' | 'hd' | 'any' (un canal cualquiera). */
    var ROWS = [
        { id: 'list', title: 'HLS · Lista JIT', sub: 'catálogo completo · HLS',
          out: 'playlist', need: 'none', kind: 'm3u8' },
        { id: 'hls4k', title: '4K · HLS', sub: '3840x2160 · HDR10 · passthrough',
          out: 'hls', need: '4k', kind: 'm3u8' },
        { id: 'dash4k', title: '4K · DASH', sub: 'CMAF/fMP4 · CICP PQ',
          out: 'dash', need: '4k', kind: 'mpd' },
        { id: 'json4k', title: '4K · Manifest JSON', sub: 'salida y metadatos',
          out: 'json', need: '4k', kind: 'json', fallbacks: ['json', 'meta'] },
        { id: 'range4k', title: '4K · Range 206', sub: 'init de la sesión · bytes 0-1023',
          out: 'init', need: '4k', kind: 'range' },
        { id: 'hls1080', title: '1080 · HLS', sub: '1920x1080 · HDR10 · zscale',
          out: 'hls', need: 'hd', kind: 'm3u8' },
        { id: 'dash1080', title: '1080 · DASH', sub: 'CMAF/fMP4 · CICP PQ',
          out: 'dash', need: 'hd', kind: 'mpd' },
        { id: 'direct', title: 'Provider-direct · siempre sirve', sub: 'tu URL de canal · sin JIT',
          out: 'direct', need: 'any', kind: 'channel' }
    ];

    var VERDICT = {
        listo:     { color: '#22c55e', label: 'listo' },
        range_ok:  { color: '#06b6d4', label: '206 OK' },
        ocupado:   { color: '#f59e0b', label: 'slot ocupado' },
        pendiente: { color: '#94a3b8', label: 'declarada sin salida' },
        no_listo:  { color: '#94a3b8', label: 'no lista' },
        sin_host:  { color: '#f59e0b', label: 'sin host JIT' },
        sin_canal: { color: '#f59e0b', label: 'sin canal' },
        timeout:   { color: '#94a3b8', label: 'timeout' },
        error:     { color: '#ef4444', label: 'error' },
        /* [2026-11-24 · MEDIDO en la consola del operador] Estado propio para
         * "el navegador no me deja leer esto". La sonda iba con una cabecera
         * propia (x-playback-session-id) y el navegador abortaba con
         * "TypeError: Failed to fetch" sin decir por qué. Antes eso caía en
         * 'error' con el texto pelado del navegador; ahora se nombra la causa
         * probable y nunca se pinta verde. */
        bloqueado: { color: '#f43f5e', label: 'no se puede leer' }
    };

    /* ── base ──────────────────────────────────────────────────────────────── */

    function withJit(b) {
        var s = String(b == null ? '' : b).trim().replace(/\/+$/, '');
        if (!s) return '';
        return /\/jit$/i.test(s) ? s : s + '/jit';
    }

    /* De dónde sale el host, en orden. Nunca hay un valor por defecto inventado:
     * si no hay ninguno, `ok:false` y el panel lo dice con la instrucción. */
    function resolveBase(win) {
        var w = win || (typeof window !== 'undefined' ? window : {}) || {};
        var raw = null, source = '';
        try {
            if (w.APE_JIT_BASE) { raw = w.APE_JIT_BASE; source = 'window.APE_JIT_BASE'; }
        } catch (e) { }
        if (!raw) {
            try {
                var ls = w.localStorage;
                if (ls) { var v = ls.getItem('ape_jit_base'); if (v) { raw = v; source = "localStorage['ape_jit_base']"; } }
            } catch (e) { }
        }
        if (!raw) {
            try {
                var el = w.document && w.document.querySelector && w.document.querySelector('#ape-out-base');
                if (el && el.value) { raw = el.value; source = 'campo del panel'; }
            } catch (e) { }
        }
        if (!raw) {
            try {
                var loc = w.location || {};
                var host = loc.hostname, proto = loc.protocol, port = loc.port;
                if (host && /^https?:$/i.test(String(proto || '')) &&
                    !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(host)) {
                    raw = String(proto) + '//' + host + (port ? ':' + port : '');
                    source = 'el mismo host que sirve el panel';
                }
            } catch (e) { }
        }
        if (!raw) {
            return {
                base: '', source: '', ok: false,
                reason: 'sin host JIT configurado: define window.APE_JIT_BASE, ' +
                        'guarda localStorage[\'ape_jit_base\'] o escribe el host en el campo del panel'
            };
        }
        return { base: withJit(raw), source: source, ok: true, reason: '' };
    }

    function join(base, path) {
        var b = String(base == null ? '' : base).replace(/\/+$/, '');
        var p = String(path == null ? '' : path);
        if (!b) return p;
        return b + (p.charAt(0) === '/' ? p : '/' + p);
    }

    function urls(id, base) {
        var cid = id == null ? '' : String(id);
        var out = {};
        for (var k in TEMPLATES) {
            if (!Object.prototype.hasOwnProperty.call(TEMPLATES, k)) continue;
            out[k] = join(base, TEMPLATES[k].split('{id}').join(encodeURIComponent(cid)));
        }
        return out;
    }

    /* ── canales ───────────────────────────────────────────────────────────── */

    function channelId(ch) {
        if (!ch) return '';
        var c = ch.id;
        if (c == null || c === '') c = ch.tvg_id;
        if (c == null || c === '') c = ch.tvgId;
        if (c == null || c === '') c = ch.tvgid;
        if (c == null || c === '') c = ch.channelId;
        if (c == null || c === '') c = (ch._probeData && ch._probeData.id);
        if (c == null) return '';
        return String(c).trim();
    }

    function channelUrl(ch) {
        if (!ch) return '';
        return String(ch.url || ch.stream_url || ch.streamUrl || ch.link || '').trim();
    }

    function heightOf(ch) {
        if (!ch) return 0;
        var blob = [ch._probeData && ch._probeData.resolution, ch.resolution, ch.res,
                    ch.videoResolution, ch.quality, ch.name, ch.title];
        for (var i = 0; i < blob.length; i++) {
            var v = blob[i];
            if (v == null) continue;
            if (typeof v === 'number' && v > 0 && v <= 4320) return v;
            var m = String(v).match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/);
            if (m) return parseInt(m[2], 10) || 0;
            if (/(^|\b)(4k|uhd|2160)/i.test(String(v))) return 2160;
            if (/(^|\b)(1080|fhd)/i.test(String(v))) return 1080;
        }
        return 0;
    }

    function channelList(state) {
        var st = state || {};
        var arr = st.channelsMaster || st.channels || st.allChannels || [];
        return Array.isArray(arr) ? arr : [];
    }

    /* Elige, de los canales REALES cargados, el representante 4K y el 1080.
     * Devuelve también el motivo, para que la tarjeta no mienta con su etiqueta. */
    function pick(state) {
        var chs = channelList(state);
        var best = null, fourk = null, hd = null, total = 0;
        for (var i = 0; i < chs.length; i++) {
            var ch = chs[i];
            if (!ch) continue;
            if (!channelId(ch) && !channelUrl(ch)) continue;
            total++;
            var h = heightOf(ch);
            if (h >= 2160 && !fourk) fourk = ch;
            if (h >= 1000 && h < 2160 && !hd) hd = ch;
            if (!best || h > heightOf(best)) best = ch;
        }
        return {
            total: total,
            fourk: fourk,
            hd: hd,
            any: best,
            fourk_declared: !!fourk,
            hd_declared: !!hd
        };
    }

    /* Canal para una fila, con el porqué. `null` cuando no hay ninguno. */
    function channelFor(row, picked) {
        var p = picked || {};
        if (row.need === 'none') return null;
        if (row.need === 'any') {
            return p.any ? { ch: p.any, why: 'primer canal cargado' } : null;
        }
        if (row.need === '4k') {
            if (p.fourk) return { ch: p.fourk, why: 'canal con 2160 declarado' };
            if (p.any) return { ch: p.any, why: 'no hay 2160 declarado · se prueba el de más resolución (' + (heightOf(p.any) || '?') + 'p)' };
            return null;
        }
        if (row.need === 'hd') {
            if (p.hd) return { ch: p.hd, why: 'canal con 1080 declarado' };
            if (p.any) return { ch: p.any, why: 'no hay 1080 declarado · se prueba el de más resolución (' + (heightOf(p.any) || '?') + 'p)' };
            return null;
        }
        return p.any ? { ch: p.any, why: 'canal cualquiera' } : null;
    }

    /* ── etiqueta para la lista ────────────────────────────────────────────── */

    /* Rutas RELATIVAS a propósito: el host lo pone la configuración del cliente,
     * así la lista no reparte ningún host y sirve para cualquier despliegue. */
    function tagFor(ch, opts) {
        var id = channelId(ch);
        if (!id) return null;
        var u = urls(id, '');
        var payload = {
            ver: 1,
            id: id,
            hls: u.hls,
            dash: u.dash,
            json: u.json,
            meta: u.meta,
            init: u.init
        };
        var tag = '#EXT-X-APE-OUTPUT-MATRIX:' + JSON.stringify(payload);
        return { id: id, tag: tag, payload: payload, urls: u };
    }

    /* ── clasificación ─────────────────────────────────────────────────────── */

    function trim(s, n) {
        var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
        return t.length > (n || 90) ? t.slice(0, n || 90) + '…' : t;
    }

    /* `r` = {status, body, ctype, contentRange, networkError}.
     * Un 2xx NO basta: se mira el cuerpo de la salida declarada. */
    /* Un CORS/preflight bloqueado y una red caída llegan al JS IGUAL: el
     * navegador lanza TypeError y no cuenta el motivo (por seguridad). Así que
     * no se inventa un motivo: se dice que no se pudo leer y se nombran las dos
     * causas posibles, que es todo lo que el navegador permite saber. */
    function netFail(prefix, res) {
        var razon = trim(res && res.networkError);
        if (res && res.netKind === 'cors_or_network') {
            return {
                verdict: 'bloqueado',
                reason: (prefix || '') + 'no se pudo leer la respuesta (CORS/preflight o red): ' + razon
            };
        }
        return { verdict: 'error', reason: (prefix || '') + razon };
    }

    function classify(row, r) {
        var res = r || {};
        var kind = (row && row.kind) || 'm3u8';
        var body = String(res.body == null ? '' : res.body);
        var b = body.trim();
        var status = Number(res.status);
        var ctype = String(res.ctype || '');

        if (res.networkError) {
            var nf = netFail('', res);
            return { verdict: nf.verdict, reason: nf.reason, detail: ctype };
        }
        if (!isFinite(status)) {
            return { verdict: 'error', reason: 'respuesta sin código HTTP', detail: ctype };
        }
        if (status === 0) {
            return { verdict: 'no_listo', reason: 'opaque/redirect (CORS)', detail: ctype };
        }
        if (status === 503) {
            var slot = /PROVIDER_SLOT_BUSY/i.test(b);
            return {
                verdict: 'ocupado',
                reason: slot ? 'PROVIDER_SLOT_BUSY: el proveedor admite 1 conexión' : trim(b) || 'servicio no disponible',
                detail: ctype
            };
        }
        if (status === 404) {
            return { verdict: 'no_listo', reason: trim(b) || '404', detail: ctype };
        }
        if (status >= 400) {
            return { verdict: 'error', reason: trim(b) || ('HTTP ' + status), detail: ctype };
        }

        /* 206: el servidor atendió un Range. Sólo es 'range_ok' si además lo
         * declara con Content-Range, y si se pidió por rango. */
        if (status === 206) {
            var cr = String(res.contentRange || '');
            if (kind === 'range' || res.askedRange) {
                return /^bytes\s+\d+-\d+\/\d+/i.test(cr)
                    ? { verdict: 'range_ok', reason: '206 · ' + trim(cr, 60), detail: ctype }
                    : { verdict: 'no_listo', reason: '206 sin Content-Range válido', detail: ctype };
            }
            return { verdict: 'listo', reason: '206 parcial · ' + trim(cr, 60), detail: ctype };
        }
        if (!(status >= 200 && status < 300)) {
            return { verdict: 'no_listo', reason: 'HTTP ' + status, detail: ctype };
        }

        if (kind === 'm3u8') {
            if (b.indexOf('#EXTM3U') !== 0) {
                return { verdict: 'pendiente', reason: 'el cuerpo no empieza por #EXTM3U (' + trim(b, 40) + ')', detail: ctype };
            }
            var variantes = (b.match(/#EXT-X-STREAM-INF/g) || []).length;
            var mapas = (b.match(/#EXT-X-MAP:URI="/g) || []).length;
            var segs = (b.match(/\.m4s|\.ts/g) || []).length;
            return {
                verdict: 'listo',
                reason: '200 · #EXTM3U' +
                        (variantes ? ' · ' + variantes + ' variante(s)' : '') +
                        (mapas ? ' · ' + mapas + ' EXT-X-MAP' : '') +
                        (segs ? ' · ' + segs + ' segmento(s)' : ''),
                detail: ctype
            };
        }
        if (kind === 'mpd') {
            if (!/<MPD[\s>]/i.test(b)) {
                return { verdict: 'pendiente', reason: 'el cuerpo no es un MPD (' + trim(b, 40) + ')', detail: ctype };
            }
            var reps = (b.match(/<Representation\b/g) || []).length;
            var pq = /urn:mpeg:mpegB:cicp:TransferCharacteristics[^>]*value="16"/i.test(b) || /PQ/i.test(b);
            return {
                verdict: 'listo',
                reason: '200 · MPD · ' + reps + ' Representation(s)' + (pq ? ' · PQ' : ''),
                detail: ctype
            };
        }
        if (kind === 'json') {
            var j = null;
            try { j = JSON.parse(b); } catch (e) { j = null; }
            if (j == null || typeof j !== 'object') {
                return { verdict: 'pendiente', reason: 'el cuerpo no es JSON válido (' + trim(b, 40) + ')', detail: ctype };
            }
            var keys = Object.keys(j).length;
            var inactive = j.active === false || j.enabled === false ||
                           /inactive/i.test(String(j.status || '')) ||
                           /inactive/i.test(String(j.output_status || ''));
            if (inactive) {
                return { verdict: 'pendiente', reason: 'JSON válido (' + keys + ' claves) pero el canal está inactivo', detail: ctype };
            }
            return { verdict: 'listo', reason: '200 · JSON · ' + keys + ' claves', detail: ctype };
        }
        if (kind === 'range') {
            return { verdict: 'no_listo', reason: '200 completo: el servidor ignoró el Range', detail: ctype };
        }
        if (kind === 'channel') {
            if (!b) return { verdict: 'listo', reason: '200 · sin cuerpo (cabeceras del proveedor)', detail: ctype };
            if (b.indexOf('#EXTM3U') === 0) return { verdict: 'listo', reason: '200 · playlist del proveedor', detail: ctype };
            return { verdict: 'listo', reason: '200 · ' + trim(b, 40), detail: ctype };
        }
        return { verdict: 'listo', reason: '200', detail: ctype };
    }

    /* ── la sonda ──────────────────────────────────────────────────────────── */

    function absolutize(ref, against) {
        var s = String(ref == null ? '' : ref).trim();
        if (!s) return '';
        if (/^https?:\/\//i.test(s)) return s;
        var a = String(against || '');
        var m = a.match(/^(https?:\/\/[^\/]+)(\/.*)?$/i);
        if (!m) return s;
        if (s.charAt(0) === '/') return m[1] + s;
        var dir = (m[2] || '/').replace(/[^\/]*$/, '');
        return m[1] + dir + s;
    }

    function firstMapUri(playlistText) {
        var m = String(playlistText || '').match(/#EXT-X-MAP:[^\n]*URI="([^"]+)"/);
        return m ? m[1] : '';
    }

    function firstVariantUri(playlistText, baseUrl) {
        var lines = String(playlistText || '').split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var l = lines[i].trim();
            if (!l || l.charAt(0) === '#') continue;
            return absolutize(l, baseUrl);
        }
        return '';
    }

    /* Lee `n` como máximo del cuerpo: la lista JIT pesa MB y aquí sólo se mira
     * la cabecera y las primeras etiquetas. */
    async function getText(ctx, url, headers) {
        var r;
        try {
            r = await ctx.fetch(url, {
                method: 'GET',
                headers: headers || {},
                redirect: 'manual',
                cache: 'no-store'
            });
        } catch (e) {
            /* En el navegador, CORS y red caída dan lo mismo: TypeError. Se
             * etiqueta para que la tarjeta lo diga en vez de escupir el texto
             * crudo del navegador como si fuera un error del servidor. */
            var netKind = (e && e.name === 'TypeError') ? 'cors_or_network' : 'other';
            return { ok: false, networkError: (e && e.message) || 'fetch error', netKind: netKind, url: url };
        }
        var body = '';
        try { body = (await r.text()) || ''; } catch (e) { body = ''; }
        if (body.length > (ctx.maxBody || 200000)) body = body.slice(0, ctx.maxBody || 200000);
        var cr = '';
        try { cr = r.headers && r.headers.get ? (r.headers.get('content-range') || '') : ''; } catch (e) { cr = ''; }
        var ct = '';
        try { ct = r.headers && r.headers.get ? (r.headers.get('content-type') || '') : ''; } catch (e) { ct = ''; }
        return { ok: true, status: r.status, body: body, ctype: ct, contentRange: cr, url: url };
    }

    function needChannel(row, picked) {
        if (row.need === 'none') return null;
        var n = channelFor(row, picked);
        return n;
    }

    /* Ejecuta UNA fila. Devuelve siempre un objeto con `verdict` y `reason`,
     * más `tested` (la URL realmente pedida) y `chain` (lo recorrido). */
    async function runRow(row, ctx) {
        var c = ctx || {};
        var picked = c.picked || pick(c.state);
        var chain = [];
        var baseInfo = c.baseInfo || { base: '', ok: false, reason: 'sin host' };
        var base = baseInfo.base || '';

        var asCanal = needChannel(row, picked);
        if (row.need !== 'none' && !asCanal) {
            return { verdict: 'sin_canal', reason: 'sin canales cargados: carga una lista primero', tested: '', chain: chain };
        }
        var ch = asCanal ? asCanal.ch : null;
        var why = asCanal ? asCanal.why : '';
        var id = channelId(ch);

        /* Provider-direct: no depende del JIT ni del host, sólo del canal. */
        if (row.kind === 'channel') {
            var uDirect = channelUrl(ch);
            if (!uDirect) {
                return { verdict: 'sin_canal', reason: 'el canal no trae URL de proveedor', tested: '', chain: chain };
            }
            chain.push(uDirect);
            var r0 = await getText(c, uDirect, c.rangeHeaders !== false ? { Range: 'bytes=0-1023' } : {});
            if (r0.networkError) {
                var f0 = netFail('directo: ', r0);
                return { verdict: f0.verdict, reason: f0.reason, tested: uDirect, chain: chain, channel: id, why: why };
            }
            var v0 = classify({ kind: 'channel' }, r0);
            return { verdict: v0.verdict, reason: 'directo · ' + v0.reason, tested: uDirect, chain: chain, channel: id, why: why };
        }

        if (!base) {
            return {
                verdict: 'sin_host',
                reason: baseInfo.reason || 'sin host JIT configurado',
                tested: '', chain: chain, channel: id, why: why
            };
        }

        var U = urls(id, base);

        /* JSON: se prueban los dos URI que el propio servidor anuncia. */
        if (row.kind === 'json') {
            var cands = [];
            var fb = row.fallbacks || ['json'];
            for (var i = 0; i < fb.length; i++) cands.push(U[fb[i]]);
            var last = null;
            for (var j = 0; j < cands.length; j++) {
                if (!cands[j]) continue;
                chain.push(cands[j]);
                var rj = await getText(c, cands[j], {});
                if (rj.networkError) { last = netFail('', rj); continue; }
                var vj = classify({ kind: 'json' }, rj);
                last = vj;
                if (vj.verdict === 'listo' || vj.verdict === 'pendiente') {
                    return {
                        verdict: vj.verdict,
                        reason: vj.reason + ' · ' + cands[j].replace(base, '/jit'),
                        tested: cands[j], chain: chain, channel: id, why: why
                    };
                }
            }
            return {
                verdict: (last && last.verdict) || 'no_listo',
                reason: 'ni /live/<id>/manifest.json ni /meta/<id>.json responden JSON: ' +
                        ((last && last.reason) || '404') +
                        ' (el servidor los anuncia en #EXT-X-SESSION-DATA pero no los enruta)',
                tested: cands[0] || '', chain: chain, channel: id, why: why
            };
        }

        /* Range: descubrir el init REAL de la sesión en el #EXT-X-MAP. */
        if (row.kind === 'range') {
            var initUrl = '';
            var master = U.hls;
            chain.push(master);
            var rM = await getText(c, master, {});
            if (rM.networkError) {
                var fM = netFail('master: ', rM);
                return { verdict: fM.verdict, reason: fM.reason, tested: master, chain: chain, channel: id, why: why };
            }
            var vM = classify({ kind: 'm3u8' }, rM);
            if (vM.verdict !== 'listo') {
                return { verdict: vM.verdict, reason: 'master: ' + vM.reason, tested: master, chain: chain, channel: id, why: why };
            }
            var map = firstMapUri(rM.body);
            var variant = firstVariantUri(rM.body, master);
            if (!map && variant) {
                var rV = await getText(c, variant, {});
                chain.push(variant);
                if (!rV.networkError && Number(rV.status) >= 200 && Number(rV.status) < 300) {
                    map = firstMapUri(rV.body);
                }
                if (!map) {
                    return {
                        verdict: 'pendiente',
                        reason: 'la playlist del canal no declara #EXT-X-MAP (sin pipeline activo)',
                        tested: variant, chain: chain, channel: id, why: why
                    };
                }
                initUrl = absolutize(map, variant);
            } else if (map) {
                initUrl = absolutize(map, master);
            } else {
                initUrl = U.init;
            }
            chain.push(initUrl);
            var rI = await getText(c, initUrl, { Range: 'bytes=0-1023' });
            if (rI.networkError) {
                var fI = netFail('init: ', rI);
                return { verdict: fI.verdict, reason: fI.reason, tested: initUrl, chain: chain, channel: id, why: why };
            }
            var vI = classify({ kind: 'range', askedRange: true }, rI);
            var nombre = String(initUrl).replace(/^.*\//, '');
            return {
                verdict: vI.verdict,
                reason: vI.reason + ' · ' + nombre,
                tested: initUrl, chain: chain, channel: id, why: why
            };
        }

        /* Playlist / DASH: una sola petición, clasificada por contenido. */
        var target = U[row.out] || U.hls;
        chain.push(target);
        var r = await getText(c, target, {});
        if (r.networkError) {
            var fT = netFail('', r);
            return { verdict: fT.verdict, reason: fT.reason, tested: target, chain: chain, channel: id, why: why };
        }
        var v = classify({ kind: row.kind }, r);
        return { verdict: v.verdict, reason: v.reason, tested: target, chain: chain, channel: id, why: why };
    }

    return {
        VERSION: VERSION,
        TEMPLATES: TEMPLATES,
        ROWS: ROWS,
        VERDICT: VERDICT,
        withJit: withJit,
        resolveBase: resolveBase,
        join: join,
        urls: urls,
        channelId: channelId,
        channelUrl: channelUrl,
        heightOf: heightOf,
        pick: pick,
        channelFor: channelFor,
        tagFor: tagFor,
        classify: classify,
        runRow: runRow,
        firstMapUri: firstMapUri,
        firstVariantUri: firstVariantUri,
        absolutize: absolutize
    };
});
