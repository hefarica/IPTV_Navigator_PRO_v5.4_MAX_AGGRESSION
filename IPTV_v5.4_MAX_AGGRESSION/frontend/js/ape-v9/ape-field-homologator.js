/**
 * APE FIELD HOMOLOGATOR — MOTOR 1 (dual-link realtime architecture)
 * ------------------------------------------------------------------
 * Lee CUALQUIER campo de CUALQUIER lista como ARRAYS de celdas, los homologa a
 * un record canónico (buckets B/C/D/E) e indexa idempotentemente por
 * FNV-1a(provider_url VERBATIM) ⊕ schemaFingerprint.
 *
 * DOCTRINA (council /iptv-freezeless-visual-master-council):
 *  - ESQUEMA ABIERTO: un campo nuevo/desconocido NUNCA se pierde → bucket E verbatim
 *    (OMEGA-NO-DELETE + "metadata = VPS SSOT, NO DELETE").
 *  - NO-FAKE: solo RECORDA evidencia; jamás fabrica codec/HDR/CMAF.
 *  - NO-CLAMP: coerce() parsea representación, nunca reescribe magnitud (iptv-lab-ssot-no-clamp).
 *  - VERBATIM URL: la URL de reproducción se conserva byte-idéntica (SHIELDED 5 + anti-509).
 *  - AUTOPISTA: transform puro en memoria del lado generador/LAB; CERO costo en el path VPS.
 *  - IDEMPOTENTE: mismo input → misma key → cache hit (no reprocesa lo ya visto).
 *
 * Reusa, si están cargados: APEM3ULexer, APEIptvFlatParser, APEExtHttpParser,
 * APECustomTagsParser. Si no, degrada con parseo mínimo inline (sigue funcionando).
 * Node-safe + browser-safe.
 */
(function (global) {
    'use strict';

    // ── FNV-1a EXACTO 32-bit (Math.imul) — DEBE ser byte-idéntico al PHP (&0xffffffff)
    //    para que el seam ch→_key funcione (JS produce _key, PHP lo deriva de la URL). ────────
    var FNV_OFFSET = 0x811c9dc5, FNV_PRIME = 0x01000193;
    function fnv1a(str, seed) {
        var h = (seed === undefined) ? FNV_OFFSET : (seed >>> 0), s = String(str == null ? '' : str);
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, FNV_PRIME) >>> 0; }
        return h >>> 0;
    }
    // 16-hex = dos FNV del MISMO string con dos SEEDS distintos (sin salt-string -> sin ambiguedad
    // de caracteres; cero concatenacion). Exacto, sin overflow, byte-identico al PHP.
    var SEED_A = 0x811c9dc5, SEED_B = 0x12345678;
    function key16(str) {
        var a = fnv1a(str, SEED_A), b = fnv1a(str, SEED_B);
        return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
    }
    function fnv1aHex(str) { return key16(str); }
    // _key estable = key16(provider_url VERBATIM) — derivada SOLO de la URL para que el wake
    // (que observa la URL por GET) mapee ch→_key directamente. (ch→_key fix 2026-06-11)
    function stableKey(providerUrl, schemaFingerprint) { return key16(providerUrl); }

    // ── Tabla de alias: rawKey(lower) → {field canónico, bucket, type} ─────────
    //  B = identidad de canal · C = codec/visual · D = delivery/headers/QoE · E = abierto
    var ALIAS = {
        // B — identidad
        'tvg-id': { field: 'channel.tvg_id', bucket: 'B', type: 'string' },
        'tvg-name': { field: 'channel.name', bucket: 'B', type: 'string' },
        'name': { field: 'channel.name', bucket: 'B', type: 'string' },
        'title': { field: 'channel.name', bucket: 'B', type: 'string' },
        'tvg-logo': { field: 'channel.logo', bucket: 'B', type: 'string' },
        'tvg-chno': { field: 'channel.number', bucket: 'B', type: 'int' },
        'group-title': { field: 'channel.group', bucket: 'B', type: 'string' },
        'tvg-shift': { field: 'channel.shift', bucket: 'B', type: 'int' },
        'ape-region': { field: 'channel.region', bucket: 'B', type: 'string' },
        'ape-country': { field: 'channel.country', bucket: 'B', type: 'string' },
        'ape-lang': { field: 'channel.lang', bucket: 'B', type: 'string' },
        'ape-content-type': { field: 'channel.content_type', bucket: 'B', type: 'string' },
        'ape-profile': { field: 'channel.profile', bucket: 'B', type: 'string' },
        // C — codec / visual
        'codecs': { field: 'video.codecs', bucket: 'C', type: 'csv' },
        'codec': { field: 'video.codecs', bucket: 'C', type: 'csv' },
        'ape-codec-family': { field: 'video.codec_family', bucket: 'C', type: 'string' },
        'x-ape-codec-video': { field: 'video.codec', bucket: 'C', type: 'codec' },
        'x-codec-full': { field: 'video.codec', bucket: 'C', type: 'codec' },
        'x-ape-codec-chain': { field: 'video.codec_chain', bucket: 'C', type: 'csv' },
        'resolution': { field: 'video.resolution', bucket: 'C', type: 'resWxH' },
        'x-resolution': { field: 'video.resolution', bucket: 'C', type: 'resWxH' },
        'x-ape-resolution-q': { field: 'video.resolution_real', bucket: 'C', type: 'resWxH' },
        'ape-fps': { field: 'video.framerate', bucket: 'C', type: 'int' },
        'x-framerate': { field: 'video.framerate', bucket: 'C', type: 'int' },
        'frame-rate': { field: 'video.framerate', bucket: 'C', type: 'float' },
        'x-ape-bit-depth': { field: 'video.bit_depth', bucket: 'C', type: 'int' },
        'x-ape-hdr-mode': { field: 'video.hdr_mode', bucket: 'C', type: 'string' },
        'x-video-range': { field: 'video.range', bucket: 'C', type: 'string' },
        'video-range': { field: 'video.range', bucket: 'C', type: 'string' },
        'x-ape-codec-audio': { field: 'audio.codec', bucket: 'C', type: 'string' },
        // D — delivery / headers / QoE / transport
        'ape-transport': { field: 'delivery.transport', bucket: 'D', type: 'string' },
        'bandwidth': { field: 'delivery.bandwidth', bucket: 'D', type: 'int' },
        'x-ape-bandwidth': { field: 'delivery.bandwidth', bucket: 'D', type: 'int' },
        'average-bandwidth': { field: 'delivery.avg_bandwidth', bucket: 'D', type: 'int' },
        'user-agent': { field: 'headers.user_agent', bucket: 'D', type: 'string' },
        'http-user-agent': { field: 'headers.user_agent', bucket: 'D', type: 'string' },
        'referer': { field: 'headers.referer', bucket: 'D', type: 'string' },
        'http-referrer': { field: 'headers.referer', bucket: 'D', type: 'string' },
        'origin': { field: 'headers.origin', bucket: 'D', type: 'string' },
        'x-ape-profile': { field: 'delivery.profile', bucket: 'D', type: 'string' },
        'x-ape-tier': { field: 'delivery.tier', bucket: 'D', type: 'string' },
        'x-ape-channel-id': { field: 'delivery.channel_id', bucket: 'D', type: 'string' },
        'x-qoe-target-mos': { field: 'qoe.target_mos', bucket: 'D', type: 'float' },
        'x-buffer-target': { field: 'qoe.buffer_target_ms', bucket: 'D', type: 'int' }
    };

    // headers tóxicos que NUNCA deben homologarse como funcionales (EXTHTTP traps).
    // Lista CANÓNICA, idéntica en homologator/selector/resolve (council S5 2026-06-11).
    var TOXIC = { 'range': 1, 'if-none-match': 1, 'if-modified-since': 1, 'te': 1, 'priority': 1, 'upgrade-insecure-requests': 1, 'dnt': 1 };

    function bucketOf(field) {
        if (field.indexOf('channel.') === 0) return 'B';
        if (field.indexOf('video.') === 0 || field.indexOf('audio.') === 0) return 'C';
        if (field.indexOf('headers.') === 0 || field.indexOf('delivery.') === 0 || field.indexOf('qoe.') === 0) return 'D';
        return 'E';
    }

    // ── coerce: parsea representación, NUNCA clampa magnitud ───────────────────
    function coerce(value, type) {
        if (value == null) return value;
        var v = String(value).trim();
        switch (type) {
            case 'int': { var n = parseInt(v, 10); return isNaN(n) ? v : n; }
            case 'float': { var f = parseFloat(v); return isNaN(f) ? v : f; }
            case 'bool': {
                var lv = v.toLowerCase();
                if (lv === 'true' || lv === 'yes' || lv === '1' || lv === 'enabled') return true;
                if (lv === 'false' || lv === 'no' || lv === '0' || lv === 'disabled') return false;
                return v;
            }
            case 'csv': return v.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            case 'resWxH': { var m = v.match(/(\d{2,5})\s*[xX]\s*(\d{2,5})/); return m ? (m[1] + 'x' + m[2]) : v; }
            case 'codec': return v;
            case 'json': try { return JSON.parse(v); } catch (e) { return v; }
            default: return v;
        }
    }

    // ── parseo de body genérico (degrada si no hay parser dedicado) ────────────
    function parseKeyEqVal(body) { // "key=value"
        var i = String(body).indexOf('=');
        if (i < 0) return null;
        return { key: body.slice(0, i).trim(), value: body.slice(i + 1).trim() };
    }
    function safeJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }

    // ── extracción de celdas por canal (todas las familias como arrays) ────────
    function extractCells(tokens) {
        // tokens del canal (mismo channelIx). Devuelve { cells:[], providerUrl }
        var cells = [], providerUrl = null;
        var FlatP = global.APEIptvFlatParser, ExtHttpP = global.APEExtHttpParser, CustomP = global.APECustomTagsParser;
        var TT = (global.APEM3ULexer && global.APEM3ULexer.TOKEN) || {};

        for (var t = 0; t < tokens.length; t++) {
            var tok = tokens[t];
            var fam = tok.type, body = tok.tagBody, name = tok.tagName, line = tok.lineNo, raw = tok.trimmed || tok.raw;

            if (fam === TT.URL || (raw && /^https?:\/\//i.test(raw) && !name)) { providerUrl = raw; continue; }

            if (fam === TT.EXTINF || (name === '#EXTINF')) {
                var attrs = (FlatP && FlatP.parseExtinfAttrs) ? FlatP.parseExtinfAttrs(raw) : inlineExtinfAttrs(raw);
                for (var k in attrs) if (attrs.hasOwnProperty(k)) cells.push({ family: 'extinf-attr', rawKey: k, rawValue: attrs[k], lineNo: line });
                var ci = raw.lastIndexOf(',');
                if (ci >= 0) cells.push({ family: 'extinf-name', rawKey: 'name', rawValue: raw.slice(ci + 1).trim(), lineNo: line });
                continue;
            }
            if (fam === TT.EXTHTTP || name === '#EXTHTTP') {
                var obj = null;
                if (ExtHttpP && ExtHttpP.parseExtHttp) { var p = ExtHttpP.parseExtHttp(raw); obj = p && p.parsedObject; }
                if (!obj) obj = safeJson(body);
                if (obj && typeof obj === 'object') for (var hk in obj) if (obj.hasOwnProperty(hk)) cells.push({ family: 'exthttp', rawKey: hk, rawValue: obj[hk], lineNo: line });
                continue;
            }
            if (fam === TT.EXTVLCOPT || name === '#EXTVLCOPT') {
                var kv1 = parseKeyEqVal(body); if (kv1) cells.push({ family: 'vlcopt', rawKey: kv1.key, rawValue: kv1.value, lineNo: line });
                continue;
            }
            if (fam === TT.KODIPROP || name === '#KODIPROP') {
                var kv2 = parseKeyEqVal(body); if (kv2) cells.push({ family: 'kodiprop', rawKey: kv2.key, rawValue: kv2.value, lineNo: line });
                continue;
            }
            // #EXT-X-APE-* / #EXTATTRFROMURL / #EXT-X-* genéricos
            if (name && (name.indexOf('#EXT') === 0)) {
                var kv3 = parseKeyEqVal(body);
                if (kv3) cells.push({ family: 'ape', rawKey: kv3.key, rawValue: kv3.value, lineNo: line });
                else if (body) cells.push({ family: 'ape', rawKey: name.replace(/^#/, ''), rawValue: body, lineNo: line });
            }
        }
        return { cells: cells, providerUrl: providerUrl };
    }

    function inlineExtinfAttrs(line) {
        var attrs = {}, re = /([A-Za-z0-9_-]+)="([^"]*)"/g, m;
        while ((m = re.exec(line)) !== null) attrs[m[1]] = m[2];
        return attrs;
    }

    // ── homologa las celdas de un canal → record canónico ─────────────────────
    function homologateCells(cells, providerUrl) {
        var rec = { _provider_url: providerUrl || '', B: {}, C: {}, D: {}, E: {}, _provenance: [], _cells_count: cells.length };
        var seen = {}; // dedup por (field|normValue)

        for (var i = 0; i < cells.length; i++) {
            var c = cells[i];
            var rk = String(c.rawKey == null ? '' : c.rawKey).toLowerCase().trim();
            // header tóxico: registrar en E como bloqueado, jamás como funcional
            if (c.family === 'exthttp' && TOXIC[rk]) {
                rec.E['_toxic.' + rk] = { value: c.rawValue, blocked: true, lineNo: c.lineNo };
                rec._provenance.push({ canonicalField: '_toxic.' + rk, fromRawKey: c.rawKey, fromFamily: c.family, lineNo: c.lineNo, blocked: true });
                continue;
            }
            var a = ALIAS[rk];
            var field, bucket, type;
            if (a) { field = a.field; bucket = a.bucket; type = a.type; }
            else { field = c.family + '.' + c.rawKey; bucket = 'E'; type = 'string'; } // ESQUEMA ABIERTO: nunca se pierde

            var val = coerce(c.rawValue, type);
            var dedupKey = field + '|' + (Array.isArray(val) ? val.join(',') : String(val));
            var leaf = field.indexOf('.') >= 0 ? field.split('.').slice(1).join('.') : field;
            var target = rec[bucket];

            if (type === 'csv' && Array.isArray(val)) {
                var prev = target[leaf];
                if (!prev) target[leaf] = val.slice();
                else { var set = {}; prev.concat(val).forEach(function (x) { set[x] = 1; }); target[leaf] = Object.keys(set); } // set-union
            } else {
                if (seen[dedupKey]) continue;       // dedup escalar
                target[leaf] = val;                 // last-non-empty-wins
            }
            seen[dedupKey] = 1;
            rec._provenance.push({ canonicalField: field, fromRawKey: c.rawKey, fromFamily: c.family, lineNo: c.lineNo });
        }

        // fingerprint del esquema = campos canónicos ordenados (idempotencia)
        var fields = rec._provenance.map(function (p) { return p.canonicalField; }).filter(function (v, ix, arr) { return arr.indexOf(v) === ix; }).sort();
        rec._schemaFingerprint = fields.join('|');
        rec._key = stableKey(rec._provider_url, rec._schemaFingerprint);
        return rec;
    }

    // ── cache idempotente (LRU simple) ────────────────────────────────────────
    var CACHE = new Map(), CACHE_CAP = 50000;
    function cacheGet(k) { if (CACHE.has(k)) { var v = CACHE.get(k); CACHE.delete(k); CACHE.set(k, v); return v; } return null; }
    function cacheSet(k, v) { if (CACHE.size >= CACHE_CAP) { CACHE.delete(CACHE.keys().next().value); } CACHE.set(k, v); }

    // ── API pública ───────────────────────────────────────────────────────────
    function homologateList(text, opts) {
        opts = opts || {};
        var Lex = global.APEM3ULexer;
        var tokens = Lex ? Lex.tokenize(text).tokens : inlineTokens(text);
        // agrupar por channelIx (canales con channelIx != null)
        var groups = {};
        for (var i = 0; i < tokens.length; i++) {
            var ch = tokens[i].channelIx;
            if (ch == null) continue;
            (groups[ch] || (groups[ch] = [])).push(tokens[i]);
        }
        var channels = [], hits = 0, misses = 0;
        Object.keys(groups).forEach(function (g) {
            var ext = extractCells(groups[g]);
            // idempotencia: pre-key tentativa por url; el fingerprint final confirma
            var ex = homologateCells(ext.cells, ext.providerUrl);
            var cached = cacheGet(ex._key);
            if (cached && cached._schemaFingerprint === ex._schemaFingerprint) { hits++; channels.push(cached); }
            else { misses++; cacheSet(ex._key, ex); channels.push(ex); }
        });
        return { channels: channels, stats: { channels: channels.length, cacheHits: hits, cacheMisses: misses, tokens: tokens.length } };
    }

    // fallback tokenizer mínimo (si APEM3ULexer no está cargado)
    function inlineTokens(text) {
        if (text == null) return [];
        var lines = String(text).replace(/^﻿/, '').split(/\r?\n/), out = [], ch = null;
        for (var i = 0; i < lines.length; i++) {
            var raw = lines[i], tr = raw.trim();
            if (!tr) continue;
            var tok = { lineNo: i + 1, raw: raw, trimmed: tr, channelIx: ch, tagName: null, tagBody: null };
            if (tr.indexOf('#EXTINF') === 0) { ch = (ch == null) ? 0 : ch + 1; tok.channelIx = ch; tok.type = 'EXTINF'; tok.tagName = '#EXTINF'; tok.tagBody = tr.slice(tr.indexOf(':') + 1); }
            else if (/^https?:\/\//i.test(tr)) { tok.type = 'URL'; }
            else if (tr.indexOf('#') === 0) { var ci = tr.indexOf(':'); tok.type = 'EXT'; tok.tagName = ci > 0 ? tr.slice(0, ci) : tr; tok.tagBody = ci > 0 ? tr.slice(ci + 1) : ''; }
            else continue;
            out.push(tok);
        }
        return out;
    }

    var APEFieldHomologator = {
        VERSION: '1.0.0-motor1',
        homologateList: homologateList,
        homologateCells: homologateCells,
        extractCells: extractCells,
        fnv1aHex: fnv1aHex,
        stableKey: stableKey,
        coerce: coerce,
        ALIAS: ALIAS,
        _clearCache: function () { CACHE.clear(); }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = APEFieldHomologator;
    global.APEFieldHomologator = APEFieldHomologator;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
