/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE MULTI-PARSER v1.0 — Multiparseador y renderizador de dialectos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * QUÉ HACE
 *   - Lee CUALQUIER M3U/M3U8 (lista plana IPTV, HLS master, HLS media,
 *     Xtream M3U) sin perder líneas, tags ni atributos.
 *   - Construye un modelo de documento canónico y reversible.
 *   - Renderiza la MISMA lista en el dialecto que cada player entiende:
 *     VLC, Kodi, TiviMate, OTT Navigator, IPTV Smarters/XCIPTV, ExoPlayer,
 *     Apple/AVPlayer, ffmpeg/streamlink, mpv, hls.js y universal.
 *   - Conserva los tags desconocidos y los documenta; no los borra en silencio.
 *   - Sanea cabeceras tóxicas (Range, If-None-Match, If-Modified-Since, TE,
 *     Priority, Upgrade-Insecure-Requests) en TODOS los dialectos.
 *   - Empaqueta un ZIP con todos los dialectos, sidecars de cabeceras,
 *     manifiesto, reporte y README.
 *
 * QUÉ NO HACE
 *   - No modifica URLs, tokens ni credenciales.
 *   - No promete que un player reproduzca un codec que no soporta.
 *   - No sustituye al generador: se alimenta de él o de una lista existente.
 *
 * DOCTRINA
 *   MAX IMAGE FIRST · COVERAGE ALWAYS · NO CHANNEL LOSS
 *   ZERO TOXIC HEADERS · UNKNOWN TAGS PRESERVED · REVERSIBLE
 *
 * @version 1.0.0
 * @license Apache-2.0
 */
(function (global) {
    'use strict';

    const VERSION = '1.0.0';

    // ───────────────────────────────────────────────────────────────────────
    // UTILIDADES BÁSICAS
    // ───────────────────────────────────────────────────────────────────────

    function hasOwn(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key);
    }

    function isObj(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function toStr(v) {
        return v == null ? '' : String(v);
    }

    function splitLines(text) {
        return String(text == null ? '' : text).split(/\r\n|\r|\n/);
    }

    function findUnquoted(s, ch) {
        let quoted = false;
        for (let i = 0; i < s.length; i++) {
            const c = s.charAt(i);
            if (quoted) {
                if (c === '\\') { i++; continue; }
                if (c === '"') quoted = false;
            } else {
                if (c === '"') quoted = true;
                else if (c === ch) return i;
            }
        }
        return -1;
    }

    function hash32(str) {
        let h = 0x811c9dc5;
        const s = String(str == null ? '' : str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('00000000' + h.toString(16)).slice(-8);
    }

    function utf8Bytes(str) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(str));
        if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(str), 'utf8'));
        const s = unescape(encodeURIComponent(String(str)));
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
        return out;
    }

    function byteLength(str) {
        return utf8Bytes(str).length;
    }

    // ───────────────────────────────────────────────────────────────────────
    // PARSER DE ATRIBUTOS (RFC 8216 + tolerancia IPTV)
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Parsea KEY=VALUE,KEY2="QUOTED, COMMAS",KEY3=123.
     * Devuelve attrs (claves originales), attrsLower, order y warnings.
     */
    function parseAttrList(input) {
        const raw = toStr(input);
        const attrs = Object.create(null);
        const attrsLower = Object.create(null);
        const order = [];
        const warnings = [];
        let i = 0;

        while (i < raw.length) {
            while (i < raw.length && /[\s,]/.test(raw.charAt(i))) i++;
            if (i >= raw.length) break;

            const keyStart = i;
            while (i < raw.length) {
                const c = raw.charAt(i);
                if (c === '=' || c === ',' || /\s/.test(c)) break;
                i++;
            }
            const key = raw.slice(keyStart, i).trim();

            while (i < raw.length && /\s/.test(raw.charAt(i))) i++;

            if (raw.charAt(i) !== '=') {
                while (i < raw.length && raw.charAt(i) !== ',') i++;
                if (key) warnings.push('attribute without "=": ' + key);
                continue;
            }

            i++; // =
            while (i < raw.length && /\s/.test(raw.charAt(i))) i++;

            let value = '';
            let quoted = false;

            if (raw.charAt(i) === '"') {
                quoted = true;
                i++;
                let buf = '';
                while (i < raw.length) {
                    const c = raw.charAt(i);
                    if (c === '\\' && i + 1 < raw.length) {
                        buf += raw.charAt(i + 1);
                        i += 2;
                        continue;
                    }
                    if (c === '"') { i++; break; }
                    buf += c;
                    i++;
                }
                value = buf;
            } else {
                const valStart = i;
                while (i < raw.length && raw.charAt(i) !== ',') i++;
                value = raw.slice(valStart, i).trim();
            }

            if (!key) continue;

            const lower = key.toLowerCase();
            if (hasOwn(attrsLower, lower)) warnings.push('duplicate attribute: ' + key);
            attrs[key] = value;
            attrsLower[lower] = value;
            order.push({ key: key, value: value, quoted: quoted });
        }

        return { attrs: attrs, attrsLower: attrsLower, order: order, raw: raw, warnings: warnings };
    }

    // ───────────────────────────────────────────────────────────────────────
    // EXTINF
    // ───────────────────────────────────────────────────────────────────────

    function parseExtinf(rawLine) {
        const line = toStr(rawLine).trim();
        const body = line.indexOf('#EXTINF:') === 0 ? line.slice(8) : line;
        const comma = findUnquoted(body, ',');

        let left = comma >= 0 ? body.slice(0, comma) : body;
        const title = comma >= 0 ? body.slice(comma + 1).trim() : '';

        const m = /^\s*(-?\d+(?:\.\d+)?)\s*/.exec(left);
        const duration = m ? parseFloat(m[1]) : -1;
        const attrsPart = m ? left.slice(m[0].length) : left;
        const parsed = parseAttrList(attrsPart);

        return {
            raw: line,
            duration: Number.isFinite(duration) ? duration : -1,
            title: title,
            attrs: parsed.attrs,
            attrsLower: parsed.attrsLower,
            order: parsed.order,
            warnings: parsed.warnings
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // CLASIFICACIÓN DE TAGS
    // ───────────────────────────────────────────────────────────────────────

    const LAYER = {
        HEADER: 'header',
        EXTINF: 'extinf',
        EXTGRP: 'extgrp',
        HTTP: 'http',
        VLC: 'vlc',
        KODI: 'kodi',
        APE: 'ape',
        HLS: 'hls',
        UNKNOWN: 'unknown'
    };

    function classifyTag(tag) {
        const t = toStr(tag).toUpperCase();
        if (t === '#EXTM3U') return LAYER.HEADER;
        if (t === '#EXTINF') return LAYER.EXTINF;
        if (t === '#EXTGRP') return LAYER.EXTGRP;
        if (t === '#EXTHTTP') return LAYER.HTTP;
        if (t === '#EXTVLCOPT') return LAYER.VLC;
        if (t === '#KODIPROP') return LAYER.KODI;
        if (t.indexOf('#EXT-X-APE-') === 0 || t.indexOf('#APE-') === 0 || t.indexOf('#EXT-APE-') === 0) return LAYER.APE;
        if (t.indexOf('#EXT-X-') === 0) return LAYER.HLS;
        return LAYER.UNKNOWN;
    }

    function parseTagLine(rawLine) {
        const raw = toStr(rawLine);
        const trimmed = raw.trim();
        if (!trimmed) return { type: 'blank', raw: raw, lineNo: 0 };

        if (trimmed.charAt(0) !== '#') {
            return { type: 'uri', raw: raw, uri: trimmed, lineNo: 0 };
        }

        // #EXTM3U puede traer atributos con URL (dos puntos). No partir por el
        // primer ':' o el tag se corrompe: #EXTM3U X-TVG-URL="HTTP...
        let tag;
        let body;
        if (/^#EXTM3U(?:\s|$)/i.test(trimmed)) {
            const hm = /^#EXTM3U\s*(.*)$/i.exec(trimmed);
            tag = '#EXTM3U';
            body = hm ? hm[1] : '';
        } else {
            const colon = trimmed.indexOf(':');
            tag = colon >= 0 ? trimmed.slice(0, colon) : trimmed;
            body = colon >= 0 ? trimmed.slice(colon + 1) : '';
        }
        const layer = classifyTag(tag);

        let attrs = null;
        let attrsLower = null;
        let order = null;
        let warnings = [];

        if (layer === LAYER.EXTINF) {
            // El EXTINF se parsea completo en parseExtinf.
            attrs = null;
        } else if (body && body.charAt(0) !== '{' && body.indexOf('=') !== -1) {
            const p = parseAttrList(body);
            attrs = p.attrs;
            attrsLower = p.attrsLower;
            order = p.order;
            warnings = p.warnings;
        }

        return {
            type: 'tag',
            raw: raw,
            trimmed: trimmed,
            tag: tag,
            tagUpper: tag.toUpperCase(),
            body: body,
            layer: layer,
            attrs: attrs,
            attrsLower: attrsLower,
            order: order,
            warnings: warnings,
            lineNo: 0
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // PARSERS DE CABECERAS
    // ───────────────────────────────────────────────────────────────────────

    function safeDecode(v) {
        const s = toStr(v).replace(/\+/g, ' ');
        try { return decodeURIComponent(s); } catch (e) { return s; }
    }

    function parseHeaderPairs(body) {
        const out = Object.create(null);
        const parts = toStr(body).split('&');
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (!p) continue;
            const eq = p.indexOf('=');
            if (eq < 0) continue;
            const k = safeDecode(p.slice(0, eq)).trim();
            const v = safeDecode(p.slice(eq + 1)).trim();
            if (k) out[k] = v;
        }
        return out;
    }

    function parseExtHttp(body) {
        const raw = toStr(body).trim();
        const result = { headers: Object.create(null), raw: raw, format: 'unknown', warnings: [] };
        if (!raw) return result;

        if (raw.charAt(0) === '{') {
            try {
                const parsed = JSON.parse(raw);
                if (isObj(parsed)) {
                    if (isObj(parsed.headers)) {
                        Object.keys(parsed.headers).forEach(function (k) {
                            result.headers[k] = toStr(parsed.headers[k]);
                        });
                        result.format = 'json.headers';
                    } else {
                        Object.keys(parsed).forEach(function (k) {
                            if (isObj(parsed[k]) || Array.isArray(parsed[k])) return;
                            result.headers[k] = toStr(parsed[k]);
                        });
                        result.format = 'json.flat';
                    }
                    return result;
                }
            } catch (e) {
                result.warnings.push('EXTHTTP JSON inválido; se intenta clave=valor');
            }
        }

        // F-01: "Range: bytes=0-" lleva "=" pero es formato colon, no urlencoded.
        // Si no hay "&" y el ":" va antes del primer "=", la rama correcta es colon.
        const _cColon = raw.indexOf(':');
        const _cEq = raw.indexOf('=');
        const _colonFirst = _cColon > 0 && (_cEq === -1 || _cColon < _cEq);

        if (!_colonFirst && (raw.indexOf('&') !== -1 || raw.indexOf('=') !== -1)) {
            const pairs = parseHeaderPairs(raw);
            const keys = Object.keys(pairs);
            if (keys.length) {
                keys.forEach(function (k) { result.headers[k] = pairs[k]; });
                result.format = 'urlencoded';
                return result;
            }
        }

        const colon = raw.indexOf(':');
        if (colon > 0) {
            result.headers[raw.slice(0, colon).trim()] = raw.slice(colon + 1).trim();
            result.format = 'colon';
            return result;
        }

        result.warnings.push('EXTHTTP sin formato reconocible');
        return result;
    }

    function parseVlcOpt(body) {
        const raw = toStr(body).trim();
        const eq = raw.indexOf('=');
        const key = eq >= 0 ? raw.slice(0, eq).trim() : raw;
        const value = eq >= 0 ? raw.slice(eq + 1).trim() : '';
        const out = { key: key, value: value, header: null, raw: raw };

        const lk = key.toLowerCase();
        if (lk === 'http-header') {
            const colon = value.indexOf(':');
            if (colon > 0) {
                out.header = {
                    name: value.slice(0, colon).trim(),
                    value: value.slice(colon + 1).trim()
                };
            }
        } else if (lk === 'http-user-agent') {
            out.header = { name: 'User-Agent', value: value };
        } else if (lk === 'http-referrer' || lk === 'http-referer') {
            out.header = { name: 'Referer', value: value };
        } else if (lk === 'http-cookie') {
            out.header = { name: 'Cookie', value: value };
        } else if (lk === 'http-origin') {
            out.header = { name: 'Origin', value: value };
        }

        return out;
    }

    function parseKodiProp(body) {
        const raw = toStr(body).trim();
        const eq = raw.indexOf('=');
        const key = eq >= 0 ? raw.slice(0, eq).trim() : raw;
        const value = eq >= 0 ? raw.slice(eq + 1).trim() : '';
        const out = { key: key, value: value, headers: Object.create(null), raw: raw };

        const lk = key.toLowerCase();
        if (lk.indexOf('stream_headers') !== -1 || lk.indexOf('manifest_headers') !== -1) {
            const pairs = parseHeaderPairs(value);
            Object.keys(pairs).forEach(function (k) { out.headers[k] = pairs[k]; });
        }

        return out;
    }

    function decodeBase64Utf8(input) {
        const s = toStr(input).trim().replace(/-/g, '+').replace(/_/g, '/');
        if (!s) return '';
        let binary = '';
        try {
            if (typeof atob === 'function') binary = atob(s);
            else if (typeof Buffer !== 'undefined') binary = Buffer.from(s, 'base64').toString('binary');
            else return '';
        } catch (e) {
            return '';
        }
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xFF;
        try {
            if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
            return decodeURIComponent(escape(binary));
        } catch (e) {
            return '';
        }
    }

    function parseApeOverflow(body) {
        const json = decodeBase64Utf8(body);
        if (!json) return Object.create(null);
        try {
            const parsed = JSON.parse(json);
            const headers = Object.create(null);
            if (isObj(parsed)) {
                if (isObj(parsed.headers)) {
                    Object.keys(parsed.headers).forEach(function (k) { headers[k] = toStr(parsed.headers[k]); });
                } else {
                    Object.keys(parsed).forEach(function (k) {
                        if (isObj(parsed[k]) || Array.isArray(parsed[k])) return;
                        headers[k] = toStr(parsed[k]);
                    });
                }
            }
            return headers;
        } catch (e) {
            return Object.create(null);
        }
    }

    // ───────────────────────────────────────────────────────────────────────
    // SANEAMIENTO DE CABECERAS
    // ───────────────────────────────────────────────────────────────────────

    const TOXIC_HEADER_RE = /^(range|if-none-match|if-modified-since|te|priority|upgrade-insecure-requests|connection|proxy-connection|transfer-encoding|content-length|host)$/i;

    function isToxicHeader(name) {
        // F-01: un nombre decorado ("Range: bytes") no debe sobrevivir. Se normaliza
        // cortando en el primer ":" y en el primer separador antes de comparar.
        const _raw = toStr(name);
        const _cut = _raw.split(':')[0].split('=')[0];
        return TOXIC_HEADER_RE.test(_raw.trim()) || TOXIC_HEADER_RE.test(_cut.trim());
    }

    function sanitizeHeaders(headers) {
        const out = Object.create(null);
        const removed = [];
        if (!isObj(headers)) return { headers: out, removed: removed };

        Object.keys(headers).forEach(function (k) {
            const name = toStr(k).trim();
            const value = toStr(headers[k]).trim();
            if (!name) return;
            if (!value) return;
            if (isToxicHeader(name)) { removed.push(name); return; }
            out[name] = value;
        });

        return { headers: out, removed: removed };
    }

    function mergeHeaders(target, source) {
        if (!isObj(source)) return target;
        Object.keys(source).forEach(function (k) {
            const name = toStr(k).trim();
            const value = toStr(source[k]).trim();
            if (name && value) target[name] = value;
        });
        return target;
    }

    function extractHeadersFromDirectives(directives) {
        const headers = Object.create(null);
        for (let i = 0; i < directives.length; i++) {
            const d = directives[i];
            if (!d || d.type !== 'tag') continue;
            if (d.tagUpper === '#EXTHTTP') {
                mergeHeaders(headers, parseExtHttp(d.body).headers);
            } else if (d.tagUpper === '#EXT-X-APE-HTTP-HEADERS') {
                mergeHeaders(headers, parseExtHttp(d.body).headers);
            } else if (d.tagUpper === '#EXT-X-APE-OVERFLOW-HEADERS') {
                mergeHeaders(headers, parseApeOverflow(d.body));
            } else if (d.tagUpper === '#EXTVLCOPT') {
                const p = parseVlcOpt(d.body);
                if (p.header) mergeHeaders(headers, { [p.header.name]: p.header.value });
            } else if (d.tagUpper === '#KODIPROP') {
                mergeHeaders(headers, parseKodiProp(d.body).headers);
            }
        }
        return headers;
    }

    // ───────────────────────────────────────────────────────────────────────
    // MODELO
    // ───────────────────────────────────────────────────────────────────────

    function emptyModel(kind) {
        return {
            version: VERSION,
            kind: kind || 'unknown',
            header: { raw: '#EXTM3U', body: '', attrs: Object.create(null), attrsLower: Object.create(null) },
            items: [],
            blocks: [],
            channels: [],
            hls: {
                type: null,
                version: null,
                targetDuration: null,
                mediaSequence: null,
                discontinuitySequence: null,
                independentSegments: false,
                endList: false,
                playlistType: null,
                lowLatency: false,
                container: 'UNKNOWN',
                variants: [],
                media: [],
                segments: [],
                keys: [],
                maps: [],
                dateRanges: [],
                sessionData: [],
                sessionKeys: [],
                start: null,
                defines: [],
                serverControl: null,
                partInf: null,
                parts: [],
                preloadHints: [],
                renditionReports: [],
                skip: null,
                contentSteering: null
            },
            quarantine: [],
            trailing: [],
            warnings: [],
            stats: {
                lines: 0,
                nonEmptyLines: 0,
                items: 0,
                blocks: 0,
                channels: 0,
                variants: 0,
                segments: 0,
                tags: { header: 0, extinf: 0, extgrp: 0, http: 0, vlc: 0, kodi: 0, ape: 0, hls: 0, unknown: 0 },
                unknownTags: [],
                headers: 0,
                quarantined: 0,
                warnings: 0,
                parseTimeMs: 0
            },
            sourceName: ''
        };
    }

    function makeChannel(block, index) {
        const directives = (block.leading || []).concat(block.directives || []);
        const headers = extractHeadersFromDirectives(directives);
        const safe = sanitizeHeaders(headers);
        const ext = block.extinf || { attrs: {}, attrsLower: {}, order: [], title: '', duration: -1, warnings: [] };
        const a = ext.attrsLower || {};

        let group = a['group-title'] || a['group'] || a['groupname'] || '';
        if (!group) {
            for (let i = 0; i < directives.length; i++) {
                if (directives[i].tagUpper === '#EXTGRP') { group = toStr(directives[i].body).trim(); break; }
            }
        }

        return {
            index: index,
            extinf: ext,
            leading: block.leading || [],
            directives: block.directives || [],
            url: block.uri,
            urlLineNo: block.uriLineNo || block.lineNo,
            headers: headers,
            safeHeaders: safe.headers,
            removedHeaders: safe.removed,
            meta: {
                id: a['tvg-id'] || a['channel-id'] || a['tvg-id'] || '',
                name: a['tvg-name'] || ext.title || '',
                group: group,
                logo: a['tvg-logo'] || a['logo'] || a['tvg-logo-small'] || '',
                tvgShift: a['tvg-shift'] || '',
                chno: a['tvg-chno'] || a['channel-number'] || '',
                catchup: a['catchup'] || a['catchup-type'] || '',
                catchupDays: a['catchup-days'] || a['catchup-days'] || '',
                radio: a['radio'] === 'true'
            },
            warnings: (ext.warnings || []).slice(),
            lineNo: block.lineNo || 0
        };
    }

    function analyzeHls(model) {
        const h = model.hls;
        const tagCount = Object.create(null);

        for (let i = 0; i < model.items.length; i++) {
            const item = model.items[i];
            if (!item || item.type !== 'tag') continue;
            const tag = item.tagUpper;
            tagCount[tag] = (tagCount[tag] || 0) + 1;

            switch (tag) {
                case '#EXT-X-VERSION':
                    h.version = parseInt(item.body, 10) || h.version;
                    break;
                case '#EXT-X-TARGETDURATION':
                    h.targetDuration = parseFloat(item.body) || h.targetDuration;
                    break;
                case '#EXT-X-MEDIA-SEQUENCE':
                    h.mediaSequence = parseInt(item.body, 10);
                    break;
                case '#EXT-X-DISCONTINUITY-SEQUENCE':
                    h.discontinuitySequence = parseInt(item.body, 10);
                    break;
                case '#EXT-X-INDEPENDENT-SEGMENTS':
                    h.independentSegments = true;
                    break;
                case '#EXT-X-ENDLIST':
                    h.endList = true;
                    break;
                case '#EXT-X-PLAYLIST-TYPE':
                    h.playlistType = toStr(item.body).trim();
                    break;
                case '#EXT-X-MEDIA':
                    h.media.push(item);
                    break;
                case '#EXT-X-STREAM-INF':
                case '#EXT-X-I-FRAME-STREAM-INF':
                    // Las variantes ya se construyen desde model.blocks en parse().
                    break;
                case '#EXT-X-KEY':
                    h.keys.push(item);
                    break;
                case '#EXT-X-MAP':
                    h.maps.push(item);
                    break;
                case '#EXT-X-DATERANGE':
                    h.dateRanges.push(item);
                    break;
                case '#EXT-X-SESSION-DATA':
                    h.sessionData.push(item);
                    break;
                case '#EXT-X-SESSION-KEY':
                    h.sessionKeys.push(item);
                    break;
                case '#EXT-X-START':
                    h.start = item;
                    break;
                case '#EXT-X-DEFINE':
                    h.defines.push(item);
                    break;
                case '#EXT-X-SERVER-CONTROL':
                    h.serverControl = item;
                    break;
                case '#EXT-X-PART-INF':
                    h.partInf = item;
                    break;
                case '#EXT-X-PART':
                    h.parts.push(item);
                    break;
                case '#EXT-X-PRELOAD-HINT':
                    h.preloadHints.push(item);
                    break;
                case '#EXT-X-RENDITION-REPORT':
                    h.renditionReports.push(item);
                    break;
                case '#EXT-X-SKIP':
                    h.skip = item;
                    break;
                case '#EXT-X-CONTENT-STEERING':
                    h.contentSteering = item;
                    break;
                default:
                    break;
            }
        }

        h.lowLatency = !!(h.serverControl || h.partInf || h.parts.length || h.preloadHints.length);

        const hasM4s = model.items.some(function (it) {
            return it.type === 'uri' && /\.(m4s|mp4|cmfv|cmfa)(\?|#|$)/i.test(it.uri || '');
        });
        const hasTs = model.items.some(function (it) {
            return it.type === 'uri' && /\.(ts|mts|m2ts)(\?|#|$)/i.test(it.uri || '');
        });

        if (h.maps.length || hasM4s) h.container = 'FMP4_CMAF';
        else if (hasTs) h.container = 'MPEG_TS';
        else if (h.media.length && !h.variants.length && !hasTs && !hasM4s) h.container = 'AUDIO_ONLY';

        h.type = model.kind === 'hls_master' ? 'master' : (model.kind === 'hls_media' ? 'media' : h.type);
        return tagCount;
    }

    /**
     * Parsea una lista M3U/M3U8 completa sin pérdida de líneas.
     * @param {string} text
     * @param {Object} [opts]
     * @returns {Object} modelo canónico
     */
    function parse(text, opts) {
        opts = opts || {};
        const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const model = emptyModel('unknown');
        model.sourceName = toStr(opts.sourceName || '');

        if (text == null) return model;

        let src = String(text);
        if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);

        const lines = splitLines(src);
        model.stats.lines = lines.length;

        let current = null;
        let pending = [];
        const tagCount = Object.create(null);
        const unknownTags = Object.create(null);

        function closeCurrent(reason) {
            if (!current) return;
            if (current.uri) {
                model.blocks.push(current);
            } else {
                model.quarantine.push({
                    type: current.type,
                    lineNo: current.lineNo,
                    reason: reason || 'sin URI',
                    extinfTitle: current.extinf ? current.extinf.title : '',
                    tags: (current.directives || []).map(function (d) { return d.tag; })
                });
            }
            current = null;
        }

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const trimmed = rawLine.trim();
            if (!trimmed) {
                if (opts.keepBlank) model.items.push({ type: 'blank', raw: rawLine, lineNo: i + 1 });
                continue;
            }

            model.stats.nonEmptyLines++;
            const item = parseTagLine(rawLine);
            item.lineNo = i + 1;
            model.items.push(item);

            if (item.type === 'uri') {
                if (current) {
                    current.uri = item.uri;
                    current.uriLineNo = item.lineNo;
                    closeCurrent();
                } else {
                    model.quarantine.push({ type: 'uri', lineNo: item.lineNo, reason: 'URI sin EXTINF/STREAM-INF' });
                }
                continue;
            }

            if (item.type !== 'tag') continue;

            const tag = item.tagUpper;
            tagCount[item.layer] = (tagCount[item.layer] || 0) + 1;

            if (tag === '#EXTM3U') {
                const hp = parseAttrList(item.body);
                model.header = {
                    raw: trimmed,
                    body: item.body,
                    attrs: hp.attrs,
                    attrsLower: hp.attrsLower
                };
                continue;
            }

            if (tag === '#EXTINF') {
                closeCurrent('EXTINF anterior sin URI');
                current = {
                    type: 'extinf',
                    lineNo: item.lineNo,
                    extinf: parseExtinf(rawLine),
                    leading: pending,
                    directives: [],
                    uri: null
                };
                pending = [];
                continue;
            }

            if (tag === '#EXT-X-STREAM-INF') {
                /* FORMA DE CATÁLOGO REAL (medida en t9/t12 sobre la emisión de los 12 perfiles):
                 * el canal se declara con un #EXTINF y sus ~950 directivas, y MÁS ABAJO aparece el
                 * #EXT-X-STREAM-INF de su variante. Ese #EXTINF no se cierra ni se encuarentena:
                 * se PROMOCIONA a variante conservando extinf, leading y directivas. La URI que
                 * sigue al STREAM-INF es la URL del canal. Antes de este arreglo cada canal real
                 * iba a cuarentena ("STREAM-INF anterior sin URI") y la variante quedaba sin
                 * nombre, sin metadatos y sin una sola directiva: 12 canales -> 0 canales. */
                if (current && current.type === 'extinf' && !current.uri) {
                    current.type = 'variant';
                    current.attrs = item.attrs || Object.create(null);
                    current.promoted = true;
                } else {
                    closeCurrent('STREAM-INF anterior sin URI');
                    current = {
                        type: 'variant',
                        lineNo: item.lineNo,
                        attrs: item.attrs || Object.create(null),
                        leading: pending,
                        directives: [],
                        uri: null
                    };
                }
                pending = [];
                continue;
            }

            if (tag === '#EXT-X-I-FRAME-STREAM-INF') {
                closeCurrent('I-FRAME-STREAM-INF anterior sin URI');
                const uri = item.attrsLower && (item.attrsLower.uri || item.attrsLower['uri']);
                model.blocks.push({
                    type: 'variant',
                    lineNo: item.lineNo,
                    attrs: item.attrs || Object.create(null),
                    leading: pending,
                    directives: [],
                    uri: uri || null,
                    iFrame: true
                });
                pending = [];
                continue;
            }

            if (tag === '#EXT-X-MEDIA') {
                if (current) current.directives.push(item);
                else pending.push(item);
                continue;
            }

            if (current) current.directives.push(item);
            else pending.push(item);
        }

        closeCurrent('EXTINF/STREAM-INF al final sin URI');
        model.trailing = pending;

        // Determinación de tipo
        const variantBlocks = model.blocks.filter(function (b) { return b.type === 'variant'; });
        const extinfBlocks = model.blocks.filter(function (b) { return b.type === 'extinf'; });
        const hasTarget = !!tagCount.hls && model.items.some(function (it) {
            return it.type === 'tag' && it.tagUpper === '#EXT-X-TARGETDURATION';
        });
        const hasMediaTag = model.items.some(function (it) {
            return it.type === 'tag' && it.tagUpper === '#EXT-X-MEDIA';
        });

        /* ¿Catálogo de canales o media playlist? Un catálogo IPTV apunta cada entrada a un
         * MANIFIESTO (.m3u8/.m3u) o lleva ape-profile; una media playlist apunta a SEGMENTOS.
         * La distinción importa porque el catálogo APE arrastra metadata de media playlist
         * (#EXT-X-TARGETDURATION, SERVER-CONTROL, PART-INF, START — medido en t8) que NO lo
         * convierte en media: sin este discriminante, 12 canales se contaban como 12 "segmentos"
         * y channels quedaba en 0. */
        const looksChannelCatalog = extinfBlocks.length > 0 && extinfBlocks.every(function (b) {
            const u = b.uri || '';
            if (/\.(m3u8?|m3u)(\?|#|$)/i.test(u)) return true;
            const a = (b.extinf && b.extinf.attrsLower) || {};
            return !!(a['ape-profile'] || a['me-profile']);
        });

        if (variantBlocks.length) {
            model.kind = 'hls_master';
        } else if (looksChannelCatalog) {
            model.kind = 'flat';
        } else if (hasMediaTag) {
            model.kind = 'hls_master';
        } else if (hasTarget || (extinfBlocks.length && model.items.some(function (it) {
            return it.type === 'uri' && /\.(ts|m4s|mp4|aac|vtt|key)(\?|#|$)/i.test(it.uri || '');
        }))) {
            model.kind = 'hls_media';
        } else if (extinfBlocks.length) {
            model.kind = 'flat';
        } else {
            model.kind = 'unknown';
        }

        model.blocks = model.blocks.filter(function (b) { return !!b.uri; });

        /* Construcción de canales con un único tope, para todos los tipos. */
        const maxChannels = opts.maxChannels && opts.maxChannels > 0 ? opts.maxChannels : Infinity;
        function buildChannels(chBlocks) {
            for (let i = 0; i < chBlocks.length && i < maxChannels; i++) {
                model.channels.push(makeChannel(chBlocks[i], i));
            }
            if (chBlocks.length > maxChannels) {
                model.warnings.push('maxChannels alcanzado: ' + maxChannels + ' de ' + chBlocks.length);
            }
        }

        if (model.kind === 'flat') {
            buildChannels(model.blocks.filter(function (b) { return b.type === 'extinf'; }));
        } else if (model.kind === 'hls_media') {
            model.hls.segments = model.blocks.filter(function (b) { return b.type === 'extinf'; });
        } else if (model.kind === 'hls_master') {
            model.hls.variants = variantBlocks;
            /* Cada variante PROMOCIONADA (nació de un #EXTINF) ES un canal: url = URI que sigue
             * al #EXT-X-STREAM-INF, directivas = las ~950 intermedias, nombre/metadatos = EXTINF.
             * Un master HLS puro no tiene EXTINF y sigue con channels = 0 (correcto). */
            buildChannels(variantBlocks.filter(function (b) { return !!b.extinf; }));
        }

        analyzeHls(model);

        model.stats.items = model.items.length;
        model.stats.blocks = model.blocks.length;
        model.stats.channels = model.channels.length;
        model.stats.variants = variantBlocks.length;
        model.stats.segments = model.hls.segments.length;
        model.stats.tags = {
            header: tagCount.header || 0,
            extinf: tagCount.extinf || 0,
            extgrp: tagCount.extgrp || 0,
            http: tagCount.http || 0,
            vlc: tagCount.vlc || 0,
            kodi: tagCount.kodi || 0,
            ape: tagCount.ape || 0,
            hls: tagCount.hls || 0,
            unknown: tagCount.unknown || 0
        };

        model.items.forEach(function (it) {
            if (it.type === 'tag' && it.layer === LAYER.UNKNOWN) {
                unknownTags[it.tagUpper] = (unknownTags[it.tagUpper] || 0) + 1;
            }
        });
        model.stats.unknownTags = Object.keys(unknownTags).slice(0, 100);
        model.stats.headers = model.channels.filter(function (ch) {
            return Object.keys(ch.safeHeaders).length > 0;
        }).length;
        model.stats.quarantined = model.quarantine.length;
        model.stats.warnings = model.warnings.length;
        model.stats.parseTimeMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);

        model.warnings = model.warnings.concat(model.quarantine.map(function (q) {
            return 'cuarentena línea ' + q.lineNo + ': ' + q.reason;
        }));

        return model;
    }

    // ───────────────────────────────────────────────────────────────────────
    // DIALECTOS
    // ───────────────────────────────────────────────────────────────────────

    const ALL_LAYERS = [LAYER.HEADER, LAYER.EXTINF, LAYER.EXTGRP, LAYER.HTTP, LAYER.VLC, LAYER.KODI, LAYER.APE, LAYER.HLS, LAYER.UNKNOWN];

    const DIALECT_DEFS = {
        universal: {
            id: 'universal',
            /* H-5: NO se llama "sin pérdida". Conserva todo el contenido, pero declara
             * sus transformaciones (duplicados colapsados, KODIPROP re-codificado) en
             * model.renderAudit y en report.limits. */
            label: 'Universal (diagnóstico, transformaciones declaradas)',
            file: 'universal.m3u8',
            description: 'Conserva todos los tags y atributos; declara en renderAudit/limits lo que transforma. Para diagnóstico y players tolerantes.',
            layers: ALL_LAYERS,
            flat: { header: 'all', attrs: 'all', headerMode: 'preserve', keepExtGrp: true, keepVlc: true, keepKodi: true, keepApe: true, keepUnknown: true },
            hls: { layers: ALL_LAYERS }
        },
        vlc: {
            id: 'vlc',
            label: 'VLC / libVLC',
            file: 'vlc.m3u8',
            description: 'Tags EXTVLCOPT nativos; cabeceras traducidas a http-header/http-user-agent/http-referrer.',
            layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.EXTGRP, LAYER.VLC],
            flat: { header: 'safe', attrs: 'all', headerMode: 'vlc', keepExtGrp: true, keepVlc: true, keepKodi: false, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HLS, LAYER.VLC] }
        },
        kodi: {
            id: 'kodi',
            label: 'Kodi / PVR IPTV Simple',
            file: 'kodi.m3u8',
            description: 'Tags KODIPROP inputstream.adaptive; cabeceras en stream_headers.',
            layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.EXTGRP, LAYER.KODI],
            flat: { header: 'safe', attrs: 'all', headerMode: 'kodi', keepExtGrp: true, keepVlc: false, keepKodi: true, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HLS, LAYER.KODI] }
        },
        tivimate: {
            id: 'tivimate',
            label: 'TiviMate',
            file: 'tivimate.m3u8',
            description: 'EXTINF + EXTVLCOPT + EXTHTTP; sin KODIPROP ni tags APE.',
            layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.EXTGRP, LAYER.HTTP, LAYER.VLC],
            flat: { header: 'safe', attrs: 'all', headerMode: 'mixed', keepExtGrp: true, keepVlc: true, keepKodi: false, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HTTP, LAYER.HLS] }
        },
        ott: {
            id: 'ott',
            label: 'OTT Navigator',
            file: 'ott-navigator.m3u8',
            description: 'EXTHTTP JSON + EXTVLCOPT de cabeceras; sin KODIPROP.',
            layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.EXTGRP, LAYER.HTTP, LAYER.VLC],
            flat: { header: 'safe', attrs: 'all', headerMode: 'mixed', keepExtGrp: true, keepVlc: true, keepKodi: false, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HTTP, LAYER.HLS] }
        },
        smarters: {
            id: 'smarters',
            label: 'IPTV Smarters / XCIPTV',
            file: 'smarters.m3u8',
            description: 'EXTINF + EXTVLCOPT + EXTHTTP; formato clásico de apps Android.',
            layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.EXTGRP, LAYER.HTTP, LAYER.VLC],
            flat: { header: 'safe', attrs: 'all', headerMode: 'mixed', keepExtGrp: true, keepVlc: true, keepKodi: false, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HTTP, LAYER.HLS] }
        },
        exoplayer: {
            id: 'exoplayer',
            label: 'ExoPlayer / Android TV',
            file: 'exoplayer.m3u8',
            description: 'HLS estándar + EXTHTTP; sin EXTVLCOPT, KODIPROP ni APE.',
            layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HTTP],
            flat: { header: 'safe', attrs: 'exoplayer', headerMode: 'http', keepExtGrp: false, keepVlc: false, keepKodi: false, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HTTP, LAYER.HLS] }
        },
        apple: {
            id: 'apple',
            label: 'Apple / AVPlayer',
            file: 'apple.m3u8',
            description: 'Solo RFC 8216: EXTINF + URI. Cabeceras en sidecar porque AVPlayer no las lee del M3U.',
            layers: [LAYER.HEADER, LAYER.EXTINF],
            flat: { header: 'minimal', attrs: 'none', headerMode: 'none', keepExtGrp: false, keepVlc: false, keepKodi: false, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HLS] }
        },
        ffmpeg: {
            id: 'ffmpeg',
            label: 'ffmpeg / streamlink',
            file: 'ffmpeg.m3u8',
            description: 'Solo EXTINF + URI; cabeceras en sidecar para -headers.',
            layers: [LAYER.HEADER, LAYER.EXTINF],
            flat: { header: 'minimal', attrs: 'none', headerMode: 'none', keepExtGrp: false, keepVlc: false, keepKodi: false, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HLS] }
        },
        mpv: {
            id: 'mpv',
            label: 'mpv',
            file: 'mpv.m3u8',
            description: 'EXTVLCOPT de cabeceras; mpv las interpreta como opciones de playlist.',
            layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.EXTGRP, LAYER.HTTP, LAYER.VLC],
            flat: { header: 'safe', attrs: 'all', headerMode: 'vlc', keepExtGrp: true, keepVlc: true, keepKodi: false, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HLS, LAYER.VLC] }
        },
        hlsjs: {
            id: 'hlsjs',
            label: 'hls.js / Web',
            file: 'hlsjs.m3u8',
            description: 'HLS estándar; cabeceras y configuración en sidecar hlsjs-config.json.',
            layers: [LAYER.HEADER, LAYER.EXTINF],
            flat: { header: 'safe', attrs: 'tvg', headerMode: 'none', keepExtGrp: false, keepVlc: false, keepKodi: false, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HLS] }
        },
        generic: {
            id: 'generic',
            label: 'M3U genérico',
            file: 'generic.m3u8',
            description: 'EXTINF + EXTVLCOPT + EXTHTTP; el mínimo que casi cualquier app acepta.',
            layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.EXTGRP, LAYER.HTTP, LAYER.VLC],
            flat: { header: 'safe', attrs: 'all', headerMode: 'mixed', keepExtGrp: true, keepVlc: true, keepKodi: false, keepApe: false, keepUnknown: false },
            hls: { layers: [LAYER.HEADER, LAYER.EXTINF, LAYER.HTTP, LAYER.HLS] }
        }
    };

    const DIALECT_ALIASES = {
        full: 'universal',
        all: 'universal',
        'vlc-enhanced': 'vlc',
        libvlc: 'vlc',
        'kodi-pvr': 'kodi',
        pvr: 'kodi',
        'ott-navigator': 'ott',
        ottnavigator: 'ott',
        'iptv-smarters': 'smarters',
        xciptv: 'smarters',
        android: 'exoplayer',
        'android-tv': 'exoplayer',
        mxplayer: 'exoplayer',
        'mx-player': 'exoplayer',
        avplayer: 'apple',
        ios: 'apple',
        'apple-hls': 'apple',
        streamlink: 'ffmpeg',
        web: 'hlsjs',
        m3u: 'generic',
        potplayer: 'vlc',
        'pot-player': 'vlc',
        perfectplayer: 'generic',
        'perfect-player': 'generic',
        lazyiptv: 'generic',
        'lazy-iptv': 'generic',
        ssiptv: 'generic',
        'ss-iptv': 'generic',
        xteve: 'generic',
        threadfin: 'generic',
        jellyfin: 'generic',
        emby: 'generic',
        plex: 'generic'
    };

    const DEFAULT_BUNDLE_DIALECTS = ['universal', 'vlc', 'kodi', 'tivimate', 'ott', 'smarters', 'exoplayer', 'apple', 'ffmpeg', 'mpv', 'hlsjs', 'generic'];

    function getDialect(id) {
        const key = toStr(id || 'universal').toLowerCase();
        return DIALECT_DEFS[DIALECT_ALIASES[key] || key] || DIALECT_DEFS.universal;
    }

    function getDialectList() {
        return Object.keys(DIALECT_DEFS).map(function (id) {
            const d = DIALECT_DEFS[id];
            return {
                id: d.id,
                label: d.label,
                file: d.file,
                description: d.description,
                layers: d.layers.slice()
            };
        });
    }

    function getCapabilities() {
        const out = { version: VERSION, dialects: [] };
        Object.keys(DIALECT_DEFS).forEach(function (id) {
            const d = DIALECT_DEFS[id];
            out.dialects.push({
                id: d.id,
                label: d.label,
                file: d.file,
                description: d.description,
                flat: {
                    extinf: true,
                    extgrp: !!d.flat.keepExtGrp,
                    exthttp: d.flat.headerMode === 'http' || d.flat.headerMode === 'mixed' || d.flat.headerMode === 'preserve',
                    extvlcopt: !!d.flat.keepVlc,
                    kodiprop: !!d.flat.keepKodi,
                    ape: !!d.flat.keepApe,
                    unknown: !!d.flat.keepUnknown,
                    attrs: d.flat.attrs,
                    headers: d.flat.headerMode
                },
                hls: {
                    standard: true,
                    /* Misma verdad que el lado flat: es lo que renderHls emite de verdad. */
                    exthttp: d.flat.headerMode === 'http' || d.flat.headerMode === 'mixed' || d.flat.headerMode === 'preserve',
                    extvlcopt: d.hls.layers.indexOf(LAYER.VLC) !== -1,
                    kodiprop: d.hls.layers.indexOf(LAYER.KODI) !== -1,
                    ape: d.hls.layers.indexOf(LAYER.APE) !== -1,
                    unknown: d.hls.layers.indexOf(LAYER.UNKNOWN) !== -1
                }
            });
        });
        return out;
    }

    // ───────────────────────────────────────────────────────────────────────
    // RENDER
    // ───────────────────────────────────────────────────────────────────────

    function escapeAttr(v) {
        return toStr(v)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/[\r\n]+/g, ' ')
            .trim();
    }

    function attrAllowed(dialect, key) {
        const mode = dialect.flat.attrs;
        if (mode === 'none') return false;
        if (mode === 'all') return true;

        const k = toStr(key).toLowerCase();
        if (mode === 'exoplayer') {
            return /^(tvg-id|tvg-name|tvg-logo|group-title|catchup|catchup-days|catchup-source|tvg-shift|tvg-chno|radio)$/.test(k);
        }
        if (mode === 'tvg') {
            return /^(tvg-id|tvg-name|tvg-logo|group-title)$/.test(k);
        }
        return true;
    }

    function coreAttrs(channel, dialect) {
        const out = [];
        if (dialect.flat.attrs === 'none') return out;
        const meta = channel.meta || {};
        const add = function (k, v) {
            if (v == null || v === '') return;
            if (!attrAllowed(dialect, k)) return;
            out.push({ key: k, value: toStr(v) });
        };
        add('tvg-id', meta.id);
        add('tvg-name', meta.name);
        add('tvg-logo', meta.logo);
        add('group-title', meta.group);
        return out;
    }

    function renderExtinf(channel, dialect) {
        const attrs = [];
        const seen = Object.create(null);
        const order = (channel.extinf && channel.extinf.order) || [];

        for (let i = 0; i < order.length; i++) {
            const rec = order[i];
            const key = toStr(rec.key);
            const lower = key.toLowerCase();
            if (!key || seen[lower]) continue;
            if (!attrAllowed(dialect, key)) continue;
            seen[lower] = true;
            attrs.push(key + '="' + escapeAttr(rec.value) + '"');
        }

        const extra = coreAttrs(channel, dialect);
        for (let i = 0; i < extra.length; i++) {
            const lower = extra[i].key.toLowerCase();
            if (seen[lower]) continue;
            seen[lower] = true;
            attrs.push(extra[i].key + '="' + escapeAttr(extra[i].value) + '"');
        }

        const duration = channel.extinf && Number.isFinite(channel.extinf.duration) ? channel.extinf.duration : -1;
        const title = toStr((channel.extinf && channel.extinf.title) || (channel.meta && channel.meta.name) || ('Channel ' + ((channel.index || 0) + 1)))
            .replace(/[\r\n]+/g, ' ')
            .trim();

        return '#EXTINF:' + duration + (attrs.length ? ' ' + attrs.join(' ') : '') + ',' + title;
    }

    function renderHeader(model, dialect, opts) {
        opts = opts || {};
        const raw = model.header && model.header.raw ? model.header.raw : '#EXTM3U';
        if (dialect.flat.header === 'all' || dialect.flat.header === 'preserve') return raw;
        if (dialect.flat.header === 'minimal') return '#EXTM3U';

        const attrs = model.header && (model.header.attrsLower || model.header.attrs)
            ? (model.header.attrsLower || model.header.attrs)
            : {};
        const safeKeys = ['x-tvg-url', 'url-tvg', 'tvg-shift', 'catchup-correction'];
        const parts = ['#EXTM3U'];
        safeKeys.forEach(function (k) {
            if (attrs[k]) parts.push(k + '="' + escapeAttr(attrs[k]) + '"');
        });
        return parts.join(' ');
    }

    function renderVlcHeader(header) {
        const name = toStr(header.name).trim();
        const value = toStr(header.value).trim();
        if (!name || !value) return '';
        if (isToxicHeader(name)) return '';
        const lower = name.toLowerCase();
        if (lower === 'user-agent') return '#EXTVLCOPT:http-user-agent=' + value;
        if (lower === 'referer' || lower === 'referrer') return '#EXTVLCOPT:http-referrer=' + value;
        if (lower === 'origin') return '#EXTVLCOPT:http-origin=' + value;
        if (lower === 'cookie') return '#EXTVLCOPT:http-cookie=' + value;
        return '#EXTVLCOPT:http-header=' + name + ': ' + value;
    }

    /* ═══════════════════════════════════════════════════════════════════════
     * H-7 · PRESUPUESTO REAL DE #EXTHTTP
     * Techo doctrinal: 8.192 B de cuerpo y 200 cabeceras (nginx
     * large_client_header_buffers=8K). El #EXTHTTP real del catálogo LAB ocupa
     * 7.526 B: 666 B por debajo del techo. El módulo lo re-emitía sin comprobarlo
     * (medido en t9: 9.012 B de entrada -> 9.017 B de salida, sin warning).
     * La prioridad NO se inventa aquí: es la del generador,
     * m3u8-typed-arrays-ultimate.js -> EXTHTTP_PRIORITY_KEYS (31 claves).
     * ═══════════════════════════════════════════════════════════════════════ */
    const EXTHTTP_MAX_BYTES = 8192;
    const EXTHTTP_MAX_KEYS = 200;
    const EXTHTTP_PRIORITY_KEYS = [
        'User-Agent', 'Accept', 'Accept-Language', 'Accept-Encoding',
        'Cache-Control', 'Pragma', 'Origin', 'Referer',
        'X-APE-Profile', 'X-APE-Tier',
        'X-Prefetch-Enabled', 'X-Prefetch-Adaptive', 'X-Prefetch-Segments',
        'X-Parallel-Segments', 'X-Concurrent-Downloads',
        'X-Expected-Bitrate', 'X-Max-Bitrate', 'X-Min-Bitrate', 'X-Buffer-Target',
        'X-APE-BITRATE-FLOOR', 'X-Low-Latency-Mode', 'X-Segment-Duration',
        'X-Segment-Duration-S', 'X-Live-Sync-Duration-Count', 'X-Live-Max-Latency-Count',
        'X-Fragment-TTFB-Max-Ms', 'X-Fragment-Retry-Max', 'X-Stall-Detection-Ms',
        'X-Nudge-Max-Retry', 'X-APE-BUFFER-STRATEGY', 'CMCD-Request'
    ];

    function exthttpPriorityIndex(name) {
        const lower = toStr(name).toLowerCase();
        for (let i = 0; i < EXTHTTP_PRIORITY_KEYS.length; i++) {
            if (EXTHTTP_PRIORITY_KEYS[i].toLowerCase() === lower) return i;
        }
        return EXTHTTP_PRIORITY_KEYS.length;
    }

    /* Recorta un set de cabeceras al presupuesto por prioridad declarada.
     * Si YA cabe, devuelve el MISMO objeto (sin reordenar ni re-serializar). */
    function fitExtHttpBudget(headers) {
        const src = isObj(headers) ? headers : Object.create(null);
        const names = Object.keys(src);
        const bytesIn = byteLength(JSON.stringify(src));
        if (names.length <= EXTHTTP_MAX_KEYS && bytesIn <= EXTHTTP_MAX_BYTES) {
            return {
                headers: src, bytesIn: bytesIn, bytesOut: bytesIn,
                keysIn: names.length, keysOut: names.length, dropped: [], trimmed: false
            };
        }
        const ordered = names.map(function (n, i) { return { n: n, i: i, p: exthttpPriorityIndex(n) }; })
            .sort(function (a, b) { return (a.p - b.p) || (a.i - b.i); });
        const keep = Object.create(null);
        let keysOut = 0;
        let bytesOut = 2; // '{}'
        for (let i = 0; i < ordered.length && keysOut < EXTHTTP_MAX_KEYS; i++) {
            const rec = ordered[i];
            const v = toStr(src[rec.n]);
            const cost = byteLength(JSON.stringify(rec.n) + ':' + JSON.stringify(v)) + (keysOut ? 1 : 0);
            if (bytesOut + cost > EXTHTTP_MAX_BYTES) continue; // deja hueco a una cabecera más corta
            keep[rec.n] = v;
            keysOut++;
            bytesOut += cost;
        }
        const dropped = names.filter(function (n) { return !(n in keep); });
        return {
            headers: keep, bytesIn: bytesIn, bytesOut: bytesOut,
            keysIn: names.length, keysOut: keysOut, dropped: dropped, trimmed: dropped.length > 0
        };
    }

    /* ── H-5 · auditoría del render en curso ────────────────────────────────
     * El render es síncrono y de un solo hilo: `render()` abre esta auditoría y la
     * cierra en un try/finally, así que no hay concurrencia que la pise. Sirve para
     * DECLARAR con números lo que el render transforma (duplicados colapsados,
     * claves re-codificadas) en vez de llamarlo "sin pérdida" sin decirlo. */
    let RENDER_AUDIT = null;

    function auditNew(model, dialectId) {
        RENDER_AUDIT = {
            model: model,
            dialect: dialectId,
            duplicateLinesCollapsed: 0,
            kodipropReserialized: 0,
            headersPercentEncoded: 0,
            exthttpReserialized: 0,
            extHttp: { blocks: 0, bytesIn: 0, bytesOut: 0, keysIn: 0, keysOut: 0, dropped: 0 }
        };
        return RENDER_AUDIT;
    }

    function auditBump(key, n) { if (RENDER_AUDIT) RENDER_AUDIT[key] += (n == null ? 1 : n); }

    function auditWarn(msg) {
        const a = RENDER_AUDIT;
        if (!a || !a.model) return;
        if (!Array.isArray(a.model.warnings)) a.model.warnings = [];
        if (a.model.warnings.indexOf(msg) === -1) a.model.warnings.push(msg);
    }

    function auditExtHttpTrim(fit) {
        if (!RENDER_AUDIT) return;
        const e = RENDER_AUDIT.extHttp;
        e.blocks++;
        e.bytesIn = Math.max(e.bytesIn, fit.bytesIn);
        e.bytesOut = Math.max(e.bytesOut, fit.bytesOut);
        e.keysIn = Math.max(e.keysIn, fit.keysIn);
        e.keysOut = Math.max(e.keysOut, fit.keysOut);
        e.dropped += fit.dropped.length;
        auditWarn('EXTHTTP recortado por presupuesto (H-7): ' + fit.bytesIn + ' B / ' + fit.keysIn +
            ' cabeceras -> ' + fit.bytesOut + ' B / ' + fit.keysOut + ' cabeceras; ' +
            fit.dropped.length + ' descartada(s) por prioridad declarada (límite ' +
            EXTHTTP_MAX_BYTES + ' B / ' + EXTHTTP_MAX_KEYS + ' cabeceras)');
    }

    function renderKodiHeaders(headers, sourceRaw) {
        const pairs = [];
        Object.keys(headers).forEach(function (k) {
            if (isToxicHeader(k)) return;
            const v = toStr(headers[k]).trim();
            if (!v) return;
            pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
        });
        if (!pairs.length) return '';
        const line = '#KODIPROP:inputstream.adaptive.stream_headers=' + pairs.join('&');
        /* H-5: sólo cuenta como transformación si difiere de la línea original. */
        if (sourceRaw == null || toStr(sourceRaw).trim() !== line) {
            auditBump('kodipropReserialized');
            auditBump('headersPercentEncoded', pairs.length);
        }
        return line;
    }

    /* Serializa un set de cabeceras aplicando el presupuesto H-7 y contando la
     * transformación sólo cuando el resultado DIFIERE del original (H-5). */
    function serializeHeaderPayload(headers, tagName, sourceRaw) {
        const safe = sanitizeHeaders(headers).headers;
        if (!Object.keys(safe).length) return '';
        const fit = fitExtHttpBudget(safe);
        if (fit.trimmed) auditExtHttpTrim(fit);
        if (!fit.keysOut) {
            auditWarn('EXTHTTP descartado por presupuesto (H-7): ' + fit.bytesIn + ' B / ' + fit.keysIn +
                ' cabeceras no caben en ' + EXTHTTP_MAX_BYTES + ' B / ' + EXTHTTP_MAX_KEYS + ' cabeceras');
            return '';
        }
        const line = tagName + JSON.stringify(fit.headers);
        if (!fit.trimmed && sourceRaw != null && toStr(sourceRaw).trim() === line) {
            return line; // byte a byte igual al original: NO es una transformación
        }
        auditBump('exthttpReserialized');
        return line;
    }

    function renderHttpHeaders(headers, sourceRaw) {
        // El generador emite EXTHTTP con JSON plano; el parser acepta también
        // la variante {"headers":{...}}. Emitimos plano para máxima compatibilidad.
        return serializeHeaderPayload(headers, '#EXTHTTP:', sourceRaw);
    }

    function pushUnique(arr, line) {
        if (!line) return false;
        if (arr.indexOf(line) === -1) { arr.push(line); return true; }
        auditBump('duplicateLinesCollapsed');
        return false;
    }

    function renderUniversalDirective(item) {
        if (!item || item.type !== 'tag') return '';
        const tag = item.tagUpper;

        if (tag === '#EXTHTTP') {
            const p = parseExtHttp(item.body);
            const safe = sanitizeHeaders(p.headers);
            /* H-7: el camino "verbatim" no puede saltarse el presupuesto. */
            const overBudget = byteLength(toStr(item.body).trim()) > EXTHTTP_MAX_BYTES ||
                Object.keys(p.headers).length > EXTHTTP_MAX_KEYS;
            if (safe.removed.length || p.format === 'urlencoded' || p.format === 'colon' || overBudget) {
                return renderHttpHeaders(safe.headers, item.raw);
            }
            return item.raw.trim();
        }

        if (tag === '#EXT-X-APE-HTTP-HEADERS') {
            const p = parseExtHttp(item.body);
            const safe = sanitizeHeaders(p.headers);
            const overBudget = byteLength(toStr(item.body).trim()) > EXTHTTP_MAX_BYTES ||
                Object.keys(p.headers).length > EXTHTTP_MAX_KEYS;
            if (safe.removed.length || overBudget) {
                return serializeHeaderPayload(p.headers, '#EXT-X-APE-HTTP-HEADERS:', item.raw);
            }
            return item.raw.trim();
        }

        if (tag === '#EXT-X-APE-OVERFLOW-HEADERS') {
            const p = parseApeOverflow(item.body);
            const safe = sanitizeHeaders(p);
            if (safe.removed.length) {
                return '#EXT-X-APE-HTTP-HEADERS:' + JSON.stringify(safe.headers);
            }
            return item.raw.trim();
        }

        if (tag === '#EXTVLCOPT') {
            const p = parseVlcOpt(item.body);
            if (p.header && isToxicHeader(p.header.name)) return '';
            return item.raw.trim();
        }

        if (tag === '#KODIPROP') {
            const p = parseKodiProp(item.body);
            const safe = sanitizeHeaders(p.headers);
            if (safe.removed.length) {
                const line = '#KODIPROP:' + p.key + '=' + Object.keys(safe.headers).map(function (k) {
                    return encodeURIComponent(k) + '=' + encodeURIComponent(safe.headers[k]);
                }).join('&');
                if (line !== item.raw.trim()) {
                    auditBump('kodipropReserialized');
                    auditBump('headersPercentEncoded', Object.keys(safe.headers).length);
                }
                return line;
            }
            return item.raw.trim();
        }

        return item.raw.trim();
    }

    function hasHeaderDirective(channel) {
        const all = (channel.leading || []).concat(channel.directives || []);
        for (let i = 0; i < all.length; i++) {
            const d = all[i];
            if (d.tagUpper === '#EXTHTTP') return true;
            if (d.tagUpper === '#EXT-X-APE-HTTP-HEADERS') return true;
            if (d.tagUpper === '#EXT-X-APE-OVERFLOW-HEADERS') return true;
            if (d.tagUpper === '#EXTVLCOPT') {
                if (parseVlcOpt(d.body).header) return true;
            }
            if (d.tagUpper === '#KODIPROP') {
                if (Object.keys(parseKodiProp(d.body).headers).length) return true;
            }
        }
        return false;
    }

    function renderChannelDirectives(channel, dialect) {
        const out = [];
        const headers = channel.safeHeaders || Object.create(null);
        /* Línea original del canal, para poder afirmar "salió idéntico" en vez de contarlo
         * como transformación por defecto (H-5). */
        const allDirs = (channel.leading || []).concat(channel.directives || []);
        let httpSourceRaw = null;
        let kodiSourceRaw = null;
        for (let i = 0; i < allDirs.length; i++) {
            if (httpSourceRaw == null && allDirs[i].tagUpper === '#EXTHTTP') httpSourceRaw = allDirs[i].raw;
            if (kodiSourceRaw == null && allDirs[i].tagUpper === '#KODIPROP' &&
                Object.keys(parseKodiProp(allDirs[i].body).headers).length) kodiSourceRaw = allDirs[i].raw;
        }

        if (dialect.id === 'universal') {
            const all = (channel.leading || []).concat(channel.directives || []);
            for (let i = 0; i < all.length; i++) pushUnique(out, renderUniversalDirective(all[i]));
            if (Object.keys(headers).length && !hasHeaderDirective(channel)) {
                pushUnique(out, renderHttpHeaders(headers));
            }
            return out;
        }

        if (dialect.flat.keepExtGrp && channel.meta && channel.meta.group) {
            pushUnique(out, '#EXTGRP:' + channel.meta.group);
        }

        if (dialect.flat.keepVlc) {
            const dirs = channel.directives || [];
            for (let i = 0; i < dirs.length; i++) {
                if (dirs[i].tagUpper !== '#EXTVLCOPT') continue;
                const p = parseVlcOpt(dirs[i].body);
                if (p.header && isToxicHeader(p.header.name)) continue;
                if (p.header) pushUnique(out, renderVlcHeader(p.header));
                else pushUnique(out, dirs[i].raw.trim());
            }
        }

        if (dialect.flat.keepKodi) {
            const dirs = channel.directives || [];
            for (let i = 0; i < dirs.length; i++) {
                if (dirs[i].tagUpper !== '#KODIPROP') continue;
                const p = parseKodiProp(dirs[i].body);
                const safe = sanitizeHeaders(p.headers);
                if (safe.removed.length) {
                    if (Object.keys(safe.headers).length) {
                        pushUnique(out, '#KODIPROP:' + p.key + '=' + Object.keys(safe.headers).map(function (k) {
                            return encodeURIComponent(k) + '=' + encodeURIComponent(safe.headers[k]);
                        }).join('&'));
                        auditBump('kodipropReserialized');
                        auditBump('headersPercentEncoded', Object.keys(safe.headers).length);
                    }
                } else {
                    pushUnique(out, dirs[i].raw.trim());
                }
            }
        }

        if (dialect.flat.headerMode === 'vlc') {
            Object.keys(headers).forEach(function (k) {
                pushUnique(out, renderVlcHeader({ name: k, value: headers[k] }));
            });
        } else if (dialect.flat.headerMode === 'kodi') {
            pushUnique(out, renderKodiHeaders(headers, kodiSourceRaw));
        } else if (dialect.flat.headerMode === 'http') {
            pushUnique(out, renderHttpHeaders(headers, httpSourceRaw));
        } else if (dialect.flat.headerMode === 'mixed') {
            pushUnique(out, renderHttpHeaders(headers, httpSourceRaw));
            const ua = headers['User-Agent'] || headers['user-agent'];
            const ref = headers['Referer'] || headers['referer'];
            if (ua) pushUnique(out, renderVlcHeader({ name: 'User-Agent', value: ua }));
            if (ref) pushUnique(out, renderVlcHeader({ name: 'Referer', value: ref }));
        }

        return out;
    }

    function renderFlat(model, dialect, opts) {
        const out = [];
        out.push(renderHeader(model, dialect, opts));

        for (let i = 0; i < model.channels.length; i++) {
            const ch = model.channels[i];
            if (!ch.url) continue;
            out.push(renderExtinf(ch, dialect));
            const dirs = renderChannelDirectives(ch, dialect);
            for (let j = 0; j < dirs.length; j++) out.push(dirs[j]);
            out.push(ch.url);
        }

        if (dialect.id === 'universal' && Array.isArray(model.trailing)) {
            for (let i = 0; i < model.trailing.length; i++) {
                pushUnique(out, renderUniversalDirective(model.trailing[i]));
            }
        }

        return out.join('\n') + '\n';
    }

    function hlsLayerAllowed(dialect, layer) {
        return dialect.hls.layers.indexOf(layer) !== -1;
    }

    function renderHls(model, dialect, opts) {
        // #EXTM3U debe ser siempre la primera línea, incluso si el input traía
        // comentarios antes. Los comentarios se emiten después de la cabecera.
        const out = [renderHeader(model, dialect, opts)];

        for (let i = 0; i < model.items.length; i++) {
            const item = model.items[i];
            if (!item || item.type === 'blank') continue;

            if (item.type === 'uri') {
                out.push(item.uri);
                continue;
            }

            if (item.type !== 'tag') continue;

            if (item.tagUpper === '#EXTM3U') continue;

            if (!hlsLayerAllowed(dialect, item.layer)) continue;

            if (item.layer === LAYER.EXTGRP && dialect.id !== 'universal') continue;

            if (item.layer === LAYER.HTTP) {
                /* H-2: un dialecto que declara `exthttp:true` (headerMode http/mixed/preserve)
                 * DEBE emitir el bloque también en el render HLS. Antes sólo lo emitía `universal`
                 * y en producción eso significaba 0 de 236 cabeceras para tivimate/ott/smarters/
                 * exoplayer mientras capabilities.json declaraba exthttp:true. Los dialectos con
                 * headerMode 'none'/'vlc'/'kodi' siguen sin emitirlo, y ahora capabilities.json lo
                 * declara también en el lado HLS (getCapabilities). */
                const carriesHttp = dialect.id === 'universal' ||
                    dialect.flat.headerMode === 'http' ||
                    dialect.flat.headerMode === 'mixed' ||
                    dialect.flat.headerMode === 'preserve';
                if (!carriesHttp) continue;
                const hline = renderHttpHeaders(parseExtHttp(item.body).headers, item.raw);
                if (hline) out.push(hline);
                continue;
            }

            if (item.layer === LAYER.VLC) {
                const p = parseVlcOpt(item.body);
                if (p.header && isToxicHeader(p.header.name)) continue;
                out.push(item.raw.trim());
                continue;
            }

            if (item.layer === LAYER.KODI) {
                const p = parseKodiProp(item.body);
                const safe = sanitizeHeaders(p.headers);
                if (safe.removed.length) {
                    if (Object.keys(safe.headers).length) {
                        const kline = '#KODIPROP:' + p.key + '=' + Object.keys(safe.headers).map(function (k) {
                            return encodeURIComponent(k) + '=' + encodeURIComponent(safe.headers[k]);
                        }).join('&');
                        if (kline !== item.raw.trim()) {
                            auditBump('kodipropReserialized');
                            auditBump('headersPercentEncoded', Object.keys(safe.headers).length);
                        }
                        out.push(kline);
                    }
                } else {
                    out.push(item.raw.trim());
                }
                continue;
            }

            if (item.layer === LAYER.APE) {
                if (dialect.id === 'universal') {
                    out.push(renderUniversalDirective(item));
                }
                continue;
            }

            out.push(item.raw.trim());
        }

        return out.join('\n') + '\n';
    }

    /**
     * Renderiza el modelo en un dialecto.
     * @param {Object} model
     * @param {string} dialectId
     * @param {Object} [opts]
     * @returns {string}
     */
    function render(model, dialectId, opts) {
        opts = opts || {};
        const dialect = getDialect(dialectId);
        if (!model) return '';
        const audit = auditNew(model, dialect.id);
        let text;
        try {
            text = (model.kind === 'flat' || (model.channels && model.channels.length && model.kind !== 'hls_media' && model.kind !== 'hls_master'))
                ? renderFlat(model, dialect, opts)
                : renderHls(model, dialect, opts);

            /* H-5: si el render transformó algo, DECLARARLO con números. Prohibido
             * llamar "sin pérdida" a un render que colapsa líneas o re-codifica claves. */
            const transforms = audit.duplicateLinesCollapsed + audit.kodipropReserialized + audit.exthttpReserialized;
            if (transforms > 0) {
                auditWarn('[' + dialect.id + '] render transforma (H-5 declarado): ' +
                    audit.duplicateLinesCollapsed + ' línea(s) duplicada(s) colapsada(s), ' +
                    audit.kodipropReserialized + ' bloque(s) KODIPROP re-serializado(s), ' +
                    audit.headersPercentEncoded + ' valor(es) re-codificado(s) en percent-encoding, ' +
                    audit.exthttpReserialized + ' bloque(s) EXTHTTP re-serializado(s)');
            }
        } finally {
            /* Auditoría verificable en el modelo (campo aditivo, por dialecto). */
            if (!isObj(model.renderAudit)) model.renderAudit = { byDialect: {} };
            if (!isObj(model.renderAudit.byDialect)) model.renderAudit.byDialect = {};
            model.renderAudit.byDialect[dialect.id] = {
                duplicateLinesCollapsed: audit.duplicateLinesCollapsed,
                kodipropReserialized: audit.kodipropReserialized,
                headersPercentEncoded: audit.headersPercentEncoded,
                exthttpReserialized: audit.exthttpReserialized,
                extHttp: {
                    blocks: audit.extHttp.blocks,
                    bytesIn: audit.extHttp.bytesIn,
                    bytesOut: audit.extHttp.bytesOut,
                    keysIn: audit.extHttp.keysIn,
                    keysOut: audit.extHttp.keysOut,
                    dropped: audit.extHttp.dropped
                }
            };
            if (dialect.id === 'universal') model.renderAudit.universal = model.renderAudit.byDialect.universal;
            RENDER_AUDIT = null;
        }
        return text;
    }

    // ───────────────────────────────────────────────────────────────────────
    // MODELO DESDE CANALES DE LA APP
    // ───────────────────────────────────────────────────────────────────────

    function makeDirective(raw) {
        const item = parseTagLine(raw);
        if (item.type === 'tag') return item;
        return null;
    }

    function modelFromChannels(channels, opts) {
        opts = opts || {};
        const model = emptyModel('flat');
        model.sourceName = toStr(opts.sourceName || 'app-channels');
        model.header = { raw: '#EXTM3U', body: '', attrs: Object.create(null), attrsLower: Object.create(null) };

        const list = Array.isArray(channels) ? channels : [];
        for (let i = 0; i < list.length; i++) {
            const ch = list[i] || {};
            const name = toStr(ch.name || ch.title || ch.stream_display_name || ('Channel ' + (i + 1)));
            const id = toStr(ch.tvg_id || ch.tvgId || ch.stream_id || ch.id || '');
            const logo = toStr(ch.tvg_logo || ch.tvgLogo || ch.logo || ch.stream_icon || '');
            const group = toStr(ch.group_title || ch.groupTitle || ch.group || ch.category_name || 'General');
            const url = toStr(ch.url || ch.stream_url || ch.link || (ch.base && ch.base.url) || '');

            const attrs = Object.create(null);
            const attrsLower = Object.create(null);
            const order = [];
            const add = function (k, v) {
                if (v == null || v === '') return;
                const value = toStr(v);
                if (hasOwn(attrsLower, k.toLowerCase())) return;
                attrs[k] = value;
                attrsLower[k.toLowerCase()] = value;
                order.push({ key: k, value: value, quoted: true });
            };

            add('tvg-id', id);
            add('tvg-name', name);
            add('tvg-logo', logo);
            add('group-title', group);
            add('tvg-shift', ch.tvg_shift || ch.tvgShift);
            add('tvg-chno', ch.tvg_chno || ch.chno);
            add('catchup', ch.catchup);
            add('catchup-days', ch.catchup_days || ch.catchupDays);
            if (ch.radio === true) add('radio', 'true');

            const extinf = {
                raw: '#EXTINF:-1,' + name,
                duration: -1,
                title: name,
                attrs: attrs,
                attrsLower: attrsLower,
                order: order,
                warnings: []
            };

            const directives = [];
            const side = ch._flatSidecars || {};
            const pushRaw = function (raw) {
                const d = makeDirective(raw);
                if (d) directives.push(d);
            };

            if (Array.isArray(side.extgrp)) side.extgrp.forEach(pushRaw);
            else if (side.extgrp) pushRaw('#EXTGRP:' + side.extgrp);
            if (Array.isArray(side.extvlcopt)) side.extvlcopt.forEach(pushRaw);
            if (Array.isArray(side.kodiprop)) side.kodiprop.forEach(pushRaw);
            if (Array.isArray(side.exthttp)) side.exthttp.forEach(pushRaw);

            const rawHeaders = ch._apeHeadersClean || ch.exthttp || ch.http_headers || ch.headers || ch._exthttp || null;
            if (isObj(rawHeaders) && Object.keys(rawHeaders).length) {
                pushRaw('#EXTHTTP:' + JSON.stringify({ headers: rawHeaders }));
            }

            const headers = extractHeadersFromDirectives(directives);
            const safe = sanitizeHeaders(headers);

            const channel = {
                index: i,
                extinf: extinf,
                leading: [],
                directives: directives,
                url: url,
                urlLineNo: 0,
                headers: headers,
                safeHeaders: safe.headers,
                removedHeaders: safe.removed,
                meta: {
                    id: id,
                    name: name,
                    group: group,
                    logo: logo,
                    tvgShift: toStr(ch.tvg_shift || ''),
                    chno: toStr(ch.tvg_chno || ''),
                    catchup: toStr(ch.catchup || ''),
                    catchupDays: toStr(ch.catchup_days || ''),
                    radio: ch.radio === true
                },
                warnings: [],
                lineNo: 0
            };

            model.channels.push(channel);
            model.items.push({ type: 'tag', tag: '#EXTINF', tagUpper: '#EXTINF', layer: LAYER.EXTINF, raw: extinf.raw, body: '', lineNo: 0 });
            directives.forEach(function (d) { model.items.push(d); });
            if (url) model.items.push({ type: 'uri', uri: url, raw: url, lineNo: 0 });
        }

        model.stats.lines = model.items.length;
        model.stats.nonEmptyLines = model.items.length;
        model.stats.items = model.items.length;
        model.stats.blocks = model.channels.length;
        model.stats.channels = model.channels.length;
        model.stats.headers = model.channels.filter(function (ch) { return Object.keys(ch.safeHeaders).length > 0; }).length;
        model.stats.tags.extinf = model.channels.length;
        model.stats.tags.http = model.channels.filter(function (ch) {
            return ch.directives.some(function (d) { return d.tagUpper === '#EXTHTTP'; });
        }).length;
        model.stats.tags.vlc = model.channels.filter(function (ch) {
            return ch.directives.some(function (d) { return d.tagUpper === '#EXTVLCOPT'; });
        }).length;
        model.stats.tags.kodi = model.channels.filter(function (ch) {
            return ch.directives.some(function (d) { return d.tagUpper === '#KODIPROP'; });
        }).length;

        return model;
    }

    // ───────────────────────────────────────────────────────────────────────
    // ZIP (STORE, SIN COMPRESIÓN)
    // ───────────────────────────────────────────────────────────────────────

    const CRC_TABLE = (function () {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function toBytes(v) {
        if (v instanceof Uint8Array) return v;
        if (v instanceof ArrayBuffer) return new Uint8Array(v);
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return new Uint8Array(v);
        return utf8Bytes(v == null ? '' : String(v));
    }

    function writeU16(arr, off, val) {
        arr[off] = val & 0xFF;
        arr[off + 1] = (val >>> 8) & 0xFF;
    }

    function writeU32(arr, off, val) {
        arr[off] = val & 0xFF;
        arr[off + 1] = (val >>> 8) & 0xFF;
        arr[off + 2] = (val >>> 16) & 0xFF;
        arr[off + 3] = (val >>> 24) & 0xFF;
    }

    function concatBytes(arrays) {
        let total = 0;
        for (let i = 0; i < arrays.length; i++) total += arrays[i].length;
        const out = new Uint8Array(total);
        let off = 0;
        for (let i = 0; i < arrays.length; i++) {
            out.set(arrays[i], off);
            off += arrays[i].length;
        }
        return out;
    }

    /* ── H-8 · DETERMINISMO: instante EXPLÍCITO ─────────────────────────────
     * El bundle embebía `new Date()` en 5 sitios (4 sidecars/report/manifest) más
     * `model.stats.parseTimeMs` y las fechas DOS del ZIP: dos generaciones del MISMO
     * input daban sha256 distinto. Con `opts.generatedAt` (ISO/Date) o `opts.clock`
     * (función que devuelve Date|ISO|epoch) el llamador fija el instante y la salida
     * es byte-idéntica. Sin opción se conserva el comportamiento actual (reloj del
     * sistema) y el reporte lo DECLARA en `limits`.
     */
    function resolveInstant(opts) {
        const o = opts || {};
        if (o.generatedAt !== undefined && o.generatedAt !== null) {
            const d = (o.generatedAt instanceof Date) ? o.generatedAt : new Date(o.generatedAt);
            if (isNaN(d.getTime())) throw new Error('generatedAt inválido: ' + String(o.generatedAt));
            return d;
        }
        if (typeof o.clock === 'function') {
            const v = o.clock();
            const d = (v instanceof Date) ? v : new Date(v);
            if (isNaN(d.getTime())) throw new Error('clock() devolvió un instante inválido: ' + String(v));
            return d;
        }
        return new Date();
    }

    function isDeterministic(opts) {
        const o = opts || {};
        /* `_explicitInstant` lo fija renderBundle: distingue "el llamador pidió instante"
           de "hemos rellenado con el reloj". Sin ese flag, el hijo vería generatedAt
           siempre presente y declararía reproducible un bundle que no lo es. */
        if (o._explicitInstant === true) return true;
        if (o._explicitInstant === false) return false;
        return (o.generatedAt !== undefined && o.generatedAt !== null) || typeof o.clock === 'function';
    }

    function dosDateTime(date) {
        const d = date || new Date();
        const year = Math.max(1980, d.getFullYear());
        const dosTime = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1F);
        const dosDate = (((year - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F);
        return { time: dosTime, date: dosDate };
    }

    /**
     * Construye un ZIP mínimo (método store) a partir de { nombre: string|Uint8Array }.
     * @param {Object} files
     * @param {Date} [date]
     * @returns {Uint8Array}
     */
    function buildZip(files, date) {
        const names = Object.keys(files || {});
        const dt = dosDateTime(date);
        const localParts = [];
        const centralParts = [];
        let offset = 0;

        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const nameBytes = utf8Bytes(name);
            const data = toBytes(files[name]);
            const crc = crc32(data);

            const local = new Uint8Array(30 + nameBytes.length);
            writeU32(local, 0, 0x04034b50);
            writeU16(local, 4, 20);
            writeU16(local, 6, 0x0800); // UTF-8
            writeU16(local, 8, 0);      // store
            writeU16(local, 10, dt.time);
            writeU16(local, 12, dt.date);
            writeU32(local, 14, crc);
            writeU32(local, 18, data.length);
            writeU32(local, 22, data.length);
            writeU16(local, 26, nameBytes.length);
            writeU16(local, 28, 0);
            local.set(nameBytes, 30);

            localParts.push(local, data);

            const central = new Uint8Array(46 + nameBytes.length);
            writeU32(central, 0, 0x02014b50);
            writeU16(central, 4, 20);
            writeU16(central, 6, 20);
            writeU16(central, 8, 0x0800);
            writeU16(central, 10, 0);
            writeU16(central, 12, dt.time);
            writeU16(central, 14, dt.date);
            writeU32(central, 16, crc);
            writeU32(central, 20, data.length);
            writeU32(central, 24, data.length);
            writeU16(central, 28, nameBytes.length);
            writeU16(central, 30, 0);
            writeU16(central, 32, 0);
            writeU16(central, 34, 0);
            writeU16(central, 36, 0);
            writeU32(central, 38, 0);
            writeU32(central, 42, offset);
            central.set(nameBytes, 46);

            centralParts.push(central);
            offset += local.length + data.length;
        }

        const centralStart = offset;
        const centralBlob = concatBytes(centralParts);
        const eocd = new Uint8Array(22);
        writeU32(eocd, 0, 0x06054b50);
        writeU16(eocd, 4, 0);
        writeU16(eocd, 6, 0);
        writeU16(eocd, 8, names.length);
        writeU16(eocd, 10, names.length);
        writeU32(eocd, 12, centralBlob.length);
        writeU32(eocd, 16, centralStart);
        writeU16(eocd, 20, 0);

        return concatBytes(localParts.concat([centralBlob, eocd]));
    }

    // ───────────────────────────────────────────────────────────────────────
    // BUNDLE, MANIFIESTO, REPORTE, README
    // ───────────────────────────────────────────────────────────────────────

    function buildHeaderSidecar(model, dialectId, opts) {
        const dialect = getDialect(dialectId);
        const rows = [];
        for (let i = 0; i < model.channels.length; i++) {
            const ch = model.channels[i];
            const headers = sanitizeHeaders(ch.safeHeaders || {}).headers;
            if (!Object.keys(headers).length) continue;
            rows.push({
                index: i,
                name: ch.meta && ch.meta.name ? ch.meta.name : ('Channel ' + (i + 1)),
                url: ch.url || '',
                headers: headers
            });
        }
        return {
            generator: 'APE MultiParser',
            version: VERSION,
            dialect: dialect.id,
            label: dialect.label,
            generatedAt: resolveInstant(opts).toISOString(),
            note: 'Cabeceras saneadas. Este sidecar existe porque el player de este dialecto no lee cabeceras desde el M3U. No incluye Range, If-None-Match, If-Modified-Since, TE, Priority ni Upgrade-Insecure-Requests. PRIVACIDAD: contiene URLs y cabeceras de tu lista; trátalo como privado.',
            channels: rows
        };
    }

    function buildReadme(model, bundle) {
        const d = getDialectList();
        const lines = [];
        lines.push('APE MULTIPARSER v' + VERSION);
        lines.push('===============================');
        lines.push('');
        lines.push('Este ZIP contiene la misma lista traducida al dialecto de cada player.');
        lines.push('No se ha modificado la lista original ni sus URLs.');
        lines.push('PRIVACIDAD: este ZIP contiene URLs y cabeceras de tu lista. No lo compartas.');
        lines.push('');
        lines.push('Contenido:');
        lines.push('  universal.m3u8      -> todos los tags; transformaciones declaradas (renderAudit/limits)');
        lines.push('  vlc.m3u8            -> VLC / libVLC');
        lines.push('  kodi.m3u8           -> Kodi / PVR IPTV Simple');
        lines.push('  tivimate.m3u8       -> TiviMate');
        lines.push('  ott-navigator.m3u8  -> OTT Navigator');
        lines.push('  smarters.m3u8       -> IPTV Smarters / XCIPTV');
        lines.push('  exoplayer.m3u8      -> ExoPlayer / Android TV');
        lines.push('  apple.m3u8          -> Apple / AVPlayer');
        lines.push('  ffmpeg.m3u8         -> ffmpeg / streamlink');
        lines.push('  mpv.m3u8            -> mpv');
        lines.push('  hlsjs.m3u8          -> hls.js / Web');
        lines.push('  generic.m3u8        -> M3U genérico');
        lines.push('');
        lines.push('Sidecars:');
        lines.push('  sidecars/*.json     -> cabeceras saneadas para players que no las leen del M3U');
        lines.push('');
        lines.push('Cómo usar:');
        lines.push('  VLC: abre vlc.m3u8 como lista.');
        lines.push('  Kodi: PVR IPTV Simple Client -> ruta o URL de kodi.m3u8.');
        lines.push('  TiviMate: Agregar lista -> tivimate.m3u8.');
        lines.push('  OTT Navigator: Agregar lista -> ott-navigator.m3u8.');
        lines.push('  IPTV Smarters / XCIPTV: Agregar lista -> smarters.m3u8.');
        lines.push('  ExoPlayer: usa exoplayer.m3u8 y aplica sidecars/exoplayer-headers.json.');
        lines.push('  Apple/AVPlayer: usa apple.m3u8; AVPlayer no lee cabeceras del M3U,');
        lines.push('    aplica sidecars/apple-headers.json en tu capa de red.');
        lines.push('  ffmpeg: usa ffmpeg.m3u8 y -headers de sidecars/ffmpeg-headers.json.');
        lines.push('  mpv: abre mpv.m3u8.');
        lines.push('  hls.js: usa hlsjs.m3u8 y la configuración de sidecars/hlsjs-config.json.');
        lines.push('');
        lines.push('Límites declarados:');
        lines.push('  - El ZIP no transcodifica ni cambia codecs.');
        lines.push('  - Un player que no soporta HEVC seguirá sin soportarlo.');
        lines.push('  - Las cabeceras tóxicas se eliminan por diseño.');
        lines.push('  - Los tags desconocidos se conservan en universal.m3u8 y se reportan.');
        lines.push('');
        lines.push('Canales: ' + model.channels.length + ' | Tipo: ' + model.kind);
        lines.push('Dialectos: ' + d.length);
        lines.push('');
        return lines.join('\n');
    }

    /* F-03 (verificado, NO es defecto): un manifiesto no puede declarar el hash de sí mismo —
     * el CRC32 del manifiesto dependería de su propio contenido (dependencia circular).
     * `renderBundle` escribe `manifest.json` DESPUÉS de evaluar `buildManifest(model, files)`,
     * así que el manifiesto ve todos los demás archivos del bundle y ninguno más se pierde
     * (medido: 21 archivos, 20 listados, el único ausente es manifest.json).
     * Para que la ausencia sea explícita y no parezca una pérdida, se declara en `excluded`. */
    const MANIFEST_SELF = 'manifest.json';

    function buildManifest(model, files, report, opts) {
        const src = isObj(files) ? files : {};
        const list = Object.keys(src).filter(function (name) {
            return name !== MANIFEST_SELF;
        }).map(function (name) {
            const bytes = toBytes(src[name]);
            return { name: name, bytes: bytes.length, crc32: ('00000000' + crc32(bytes).toString(16)).slice(-8) };
        });
        return {
            generator: 'APE MultiParser',
            version: VERSION,
            generatedAt: resolveInstant(opts).toISOString(),
            kind: model.kind,
            channels: model.channels.length,
            variants: model.hls ? model.hls.variants.length : 0,
            segments: model.hls ? model.hls.segments.length : 0,
            privacy: 'contains-user-urls-and-headers',
            files: list,
            fileCount: list.length,
            excluded: [{
                name: MANIFEST_SELF,
                reason: 'self-reference: el manifiesto no declara su propio CRC32/hash (dependencia circular); si el bundle lo incluye, es este mismo archivo'
            }],
            report: report ? 'reports/multiparser-report.json' : null
        };
    }

    /* H-7 / H-5 publicados en buildReport.limits con las CIFRAS medidas, no como promesa. */
    function limitExtHttp(model) {
        const w = (model && Array.isArray(model.warnings) ? model.warnings : []).filter(function (l) {
            return l.indexOf('EXTHTTP recortado') === 0 || l.indexOf('EXTHTTP descartado') === 0;
        });
        if (!w.length) {
            return 'H-7: ningún #EXTHTTP emitido superó el presupuesto de ' + EXTHTTP_MAX_BYTES +
                ' B / ' + EXTHTTP_MAX_KEYS + ' cabeceras en este bundle.';
        }
        return 'H-7: ' + w.length + ' aviso(s) de presupuesto EXTHTTP en este bundle — ' + w[0];
    }

    function limitUniversal(model) {
        const u = (model && isObj(model.renderAudit)) ? model.renderAudit.universal : null;
        if (!u) return 'H-5: universal no se renderizó en este bundle; no hay transformaciones que declarar.';
        const transforms = u.duplicateLinesCollapsed + u.kodipropReserialized + u.exthttpReserialized;
        if (!transforms) {
            return 'H-5: universal no transformó nada (0 líneas colapsadas, 0 claves re-codificadas, 0 bloques re-serializados).';
        }
        return 'H-5: universal declara sus transformaciones — ' + u.duplicateLinesCollapsed +
            ' línea(s) duplicada(s) colapsada(s), ' + u.kodipropReserialized + ' bloque(s) KODIPROP re-serializado(s), ' +
            u.headersPercentEncoded + ' valor(es) percent-encoded, ' + u.exthttpReserialized + ' bloque(s) EXTHTTP re-serializado(s).';
    }

    function buildReport(model, bundle, opts) {
        const d = getDialectList();
        const tagInventory = model.stats ? model.stats.tags : {};
        const anomalies = diagnose(model);
        const dialects = (bundle && bundle.dialects) ? bundle.dialects : d.map(function (x) {
            return { id: x.id, label: x.label, file: x.file, bytes: 0, channels: model.channels.length };
        });

        return {
            generator: 'APE MultiParser',
            version: VERSION,
            generatedAt: resolveInstant(opts).toISOString(),
            sourceHash: hash32(model.sourceName || 'input'),
            kind: model.kind,
            stats: {
                lines: model.stats.lines,
                nonEmptyLines: model.stats.nonEmptyLines,
                channels: model.channels.length,
                variants: model.hls ? model.hls.variants.length : 0,
                segments: model.hls ? model.hls.segments.length : 0,
                headers: model.stats.headers,
                quarantined: model.quarantine.length,
                warnings: model.warnings.length,
                parseTimeMs: isDeterministic(opts) ? null : model.stats.parseTimeMs
            },
            tagInventory: tagInventory,
            unknownTags: model.stats.unknownTags || [],
            anomalies: {
                c2aCount: anomalies.c2a.length,
                /* t15: metadata APE que menciona c2.a. Se publica al lado de c2aCount para no
                 * perder el dato, pero NO se suma a c2aCount ni a las anomalías. */
                metadataC2aCount: anomalies.metadataC2A.length,
                http403Count: anomalies.http403.length,
                /* F-05: metadata APE que menciona 403 (política de evasión). Se publica para no
                 * perder el dato, pero NO se suma a http403Count ni a las anomalías. */
                metadata403Count: anomalies.metadata403.length,
                extXErrorCount: anomalies.extXError.length,
                malformedUrlCount: anomalies.malformedUrls.length,
                missingUrlCount: anomalies.missingUrl
            },
            quarantine: model.quarantine.map(function (q) {
                return { lineNo: q.lineNo, reason: q.reason, type: q.type, tags: q.tags || [] };
            }),
            dialects: dialects.map(function (x) {
                return {
                    id: x.id,
                    label: x.label,
                    file: x.file,
                    bytes: x.bytes,
                    channels: x.channels,
                    unsupportedTags: x.unsupportedTags || []
                };
            }),
            limits: [
                'No transcodifica ni cambia codecs.',
                'No garantiza que un player soporte un codec que no implementa.',
                'Las cabeceras tóxicas se eliminan por diseño.',
                'Los tags desconocidos se conservan en universal.m3u8 y se listan aquí.',
                'Apple/AVPlayer y ffmpeg reciben cabeceras por sidecar, no por M3U.',
                'http403Count y c2aCount cuentan sólo señales en contexto de reproducción (URI, nombre visible o tags que NO son #EXT-X-APE-*); las que aparecen dentro de metadata APE se publican aparte en metadata403Count y metadataC2aCount y no son eventos de reproducción.',
                'El manifiesto no se lista a sí mismo (manifest.json): un hash no puede depender de su propio contenido; la exclusión se declara en manifest.excluded.',
                limitExtHttp(model),
                limitUniversal(model)
            ].concat(isDeterministic(opts)
                ? ['Bundle REPRODUCIBLE: instante explícito ' + resolveInstant(opts).toISOString() + ' (options.generatedAt/clock); parseTimeMs se publica null porque es una medición de reloj.']
                : ['Sin instante explícito el bundle NO es reproducible: generatedAt y parseTimeMs usan el reloj del sistema. Pasa options.generatedAt (ISO) o options.clock para obtener bytes idénticos.'])
        };
    }

    function renderBundle(model, opts) {
        opts = opts || {};
        /* H-8: UN solo instante por bundle; si no, dos generaciones del mismo input difieren. */
        const explicitInstant = (opts.generatedAt !== undefined && opts.generatedAt !== null) || typeof opts.clock === 'function';
        const instant = resolveInstant(opts);
        const stampOpts = Object.assign({}, opts, { generatedAt: instant.toISOString(), _explicitInstant: explicitInstant });
        const ids = opts.dialects || DEFAULT_BUNDLE_DIALECTS;
        const files = Object.create(null);
        const dialects = [];
        const unsupportedByDialect = Object.create(null);

        for (let i = 0; i < ids.length; i++) {
            const dialect = getDialect(ids[i]);
            const text = render(model, dialect.id, opts);
            const bytes = byteLength(text);
            files[dialect.file] = text;

            const unsupported = [];
            if (!dialect.flat.keepKodi && model.stats.tags.kodi) unsupported.push('#KODIPROP');
            if (!dialect.flat.keepVlc && model.stats.tags.vlc) unsupported.push('#EXTVLCOPT');
            if (dialect.flat.headerMode === 'none' && model.stats.headers) unsupported.push('headers');
            if (!dialect.flat.keepApe && model.stats.tags.ape) unsupported.push('#EXT-X-APE-*');
            if (!dialect.flat.keepUnknown && model.stats.tags.unknown) unsupported.push('#UNKNOWN');
            unsupportedByDialect[dialect.id] = unsupported;

            dialects.push({
                id: dialect.id,
                label: dialect.label,
                file: dialect.file,
                bytes: bytes,
                channels: model.channels.length,
                unsupportedTags: unsupported
            });
        }

        if (opts.includeSidecars !== false) {
            const sidecarDialects = opts.sidecarDialects || ['apple', 'ffmpeg', 'exoplayer', 'hlsjs'];
            sidecarDialects.forEach(function (id) {
                const dialect = getDialect(id);
                const sidecar = buildHeaderSidecar(model, dialect.id, stampOpts);
                if (sidecar.channels.length) {
                    files['sidecars/' + dialect.id + '-headers.json'] = JSON.stringify(sidecar, null, 2);
                }
            });
            const config = {
                generator: 'APE MultiParser',
                version: VERSION,
                generatedAt: resolveInstant(stampOpts).toISOString(),
                note: 'hls.js no lee cabeceras desde el M3U. Aplica xhrSetup/fetchSetup por canal.',
                channels: model.channels.filter(function (ch) {
                    return Object.keys(ch.safeHeaders || {}).length > 0;
                }).map(function (ch, i) {
                    return {
                        index: ch.index,
                        name: ch.meta && ch.meta.name ? ch.meta.name : ('Channel ' + (ch.index + 1)),
                        url: ch.url || '',
                        headers: sanitizeHeaders(ch.safeHeaders || {}).headers
                    };
                })
            };
            if (config.channels.length) files['sidecars/hlsjs-config.json'] = JSON.stringify(config, null, 2);
        }

        const report = buildReport(model, { dialects: dialects }, stampOpts);
        files['reports/multiparser-report.json'] = JSON.stringify(report, null, 2);
        files['capabilities.json'] = JSON.stringify(getCapabilities(), null, 2);
        files['README.txt'] = buildReadme(model, { dialects: dialects });
        files['manifest.json'] = JSON.stringify(buildManifest(model, files, report, stampOpts), null, 2);

        return {
            files: files,
            dialects: dialects,
            report: report,
            generatedAt: instant.toISOString(),
            manifest: JSON.parse(files['manifest.json'])
        };
    }

    function buildBundleZip(model, opts) {
        const bundle = renderBundle(model, opts);
        /* H-8: con instante explícito, las fechas DOS del ZIP salen del MISMO instante. */
        const zipDate = (opts && opts.date) || (bundle.generatedAt ? new Date(bundle.generatedAt) : undefined);
        const zip = buildZip(bundle.files, zipDate);
        return {
            zip: zip,
            files: bundle.files,
            dialects: bundle.dialects,
            report: bundle.report,
            manifest: bundle.manifest
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // VALIDACIÓN / COMPARACIÓN
    // ───────────────────────────────────────────────────────────────────────

    function validateModel(model) {
        const errors = [];
        const warnings = [];
        if (!model) {
            errors.push('modelo vacío');
            return { valid: false, errors: errors, warnings: warnings };
        }
        if (!model.header || !model.header.raw) warnings.push('sin cabecera #EXTM3U');
        if (model.kind === 'flat') {
            if (!model.channels.length) errors.push('lista plana sin canales');
            model.channels.forEach(function (ch, i) {
                if (!ch.url) errors.push('canal ' + i + ' sin URL');
                if (!ch.meta || !ch.meta.name) warnings.push('canal ' + i + ' sin nombre');
            });
        }
        if (model.kind === 'hls_master' && !model.hls.variants.length) warnings.push('master sin variantes');
        if (model.kind === 'hls_media' && !model.hls.segments.length) warnings.push('media sin segmentos');
        if (model.quarantine.length) warnings.push(model.quarantine.length + ' bloque(s) en cuarentena');
        return { valid: errors.length === 0, errors: errors, warnings: warnings };
    }

    function compareModels(a, b) {
        const diffs = [];
        if (!a || !b) return { equal: false, differences: ['modelo ausente'] };
        if (a.kind !== b.kind) diffs.push('kind: ' + a.kind + ' != ' + b.kind);
        if (a.channels.length !== b.channels.length) diffs.push('channels: ' + a.channels.length + ' != ' + b.channels.length);
        const max = Math.min(a.channels.length, b.channels.length);
        for (let i = 0; i < max; i++) {
            if (a.channels[i].url !== b.channels[i].url) {
                diffs.push('url[' + i + '] distinta');
                break;
            }
            const ha = JSON.stringify(sanitizeHeaders(a.channels[i].safeHeaders || {}).headers);
            const hb = JSON.stringify(sanitizeHeaders(b.channels[i].safeHeaders || {}).headers);
            if (ha !== hb) {
                diffs.push('headers[' + i + '] distintos');
                break;
            }
        }
        return { equal: diffs.length === 0, differences: diffs };
    }

    /**
     * Diagnóstico de anomalías temporales sin exponer URLs ni credenciales.
     * Detecta `c2.a`, `403`, `#EXT-X-ERROR`, URIs malformadas y bloques sin URL.
     * No afirma que `c2.a` sea un bug del parser: solo lo localiza.
     *
     * F-05 — un `403` dentro de un tag `#EXT-X-APE-*` es METADATA, no una respuesta HTTP
     * (`#EXT-X-APE-CORTEX-ERROR-403:EVASION=true` es la POLÍTICA de evasión de 403 del
     * generador). Contarlo como `http403` daba 12 falsos positivos sobre el catálogo real y
     * enmascaraba un 403 de verdad.
     *
     * t15 — `c2.a` sufre la MISMA clase de error y se corrige con el mismo discriminante:
     * un `c2.a` dentro de metadata APE no es una señal de reproducción rota del player.
     *
     * Regla única para ambas señales (`recordFinding`):
     *   · contexto de REPRODUCCIÓN (URI, nombre visible de canal = línea #EXTINF, o tag que
     *     NO es de la capa APE) → lista de reproducción (`http403` / `c2a`).
     *   · capa APE (layer === APE o prefijo `#(EXT-X-)?APE-` / `#EXT-APE-`) → lista aparte
     *     (`metadata403` / `metadataC2A`) con `kind: 'metadata'`. NO suma en `total`.
     */
    function diagnose(model) {
        const out = {
            c2a: [],
            metadataC2A: [],
            http403: [],
            metadata403: [],
            extXError: [],
            malformedUrls: [],
            missingUrl: 0,
            total: 0
        };
        if (!model || !Array.isArray(model.items)) return out;

        /* Nombre además de capa: cubre ítems construidos fuera de parseTagLine. */
        const APE_TAG_RE = /^#(?:EXT-X-)?APE-|^#EXT-APE-/;
        function isApeMetadata(item) {
            return item.type === 'tag' && (item.layer === LAYER.APE || APE_TAG_RE.test(item.tagUpper || ''));
        }

        /* Discriminante ÚNICO compartido por las dos señales (no duplicar la lógica).
         * Devuelve true si el hallazgo se archivó como metadata. */
        function recordFinding(playback, metadata, item, lineNo, apeMeta) {
            const entry = { lineNo: lineNo, type: item.type || 'unknown', tag: item.tagUpper || '' };
            if (apeMeta) {
                entry.kind = 'metadata';
                metadata.push(entry);
                return true;
            }
            if (item.type === 'uri') {
                entry.kind = 'uri';
                playback.push(entry);
                return false;
            }
            if (item.type === 'tag') {
                entry.kind = 'tag';
                playback.push(entry);
                return false;
            }
            return false;
        }

        for (let i = 0; i < model.items.length; i++) {
            const it = model.items[i];
            const raw = toStr(it.raw);
            const lineNo = it.lineNo || (i + 1);
            const apeMeta = isApeMetadata(it);

            if (/c2\.a/i.test(raw)) {
                recordFinding(out.c2a, out.metadataC2A, it, lineNo, apeMeta);
            }
            if (/\b403\b/.test(raw)) {
                recordFinding(out.http403, out.metadata403, it, lineNo, apeMeta);
            }
            if (it.type === 'tag' && /EXT-X-ERROR/i.test(it.tagUpper || '')) {
                out.extXError.push({ lineNo: lineNo, tag: it.tagUpper || '' });
            }
            if (it.type === 'uri') {
                const u = toStr(it.uri);
                if (u && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && !/^[./]/.test(u)) {
                    out.malformedUrls.push({ lineNo: lineNo });
                }
            }
        }

        out.missingUrl = (model.quarantine || []).filter(function (q) {
            return q && q.reason && q.reason.indexOf('sin URI') !== -1;
        }).length;
        out.total = out.c2a.length + out.http403.length + out.extXError.length + out.malformedUrls.length + out.missingUrl;
        return out;
    }

    // ───────────────────────────────────────────────────────────────────────
    // H-3 · SEMÁNTICAS POR FAMILIA DE PLAYER
    //   understands → lo que la familia PARSEA de verdad
    //   ignored     → lo que NO conoce y RFC 8216 §6.3.1 manda IGNORAR (legal, no defecto)
    //   rejects     → lo que ROMPE: atributo mal formado, tag en el tipo de playlist
    //                 equivocado, gramática incumplida. Con línea y motivo.
    // La evidencia se declara por familia y por regla:
    //   'measured'      → el repo lo EJECUTÓ (t8 hls.js real; t7 VLC/ISA real)
    //   'repo-doctrine' → doctrina/checklists del repo, NO ejecutada aquí
    //   'rfc'           → gramática RFC 8216 (conformidad, no comportamiento observado)
    // ───────────────────────────────────────────────────────────────────────

    const HLS_STANDARD_TAGS = [
        '#EXTM3U', '#EXT-X-VERSION', '#EXT-X-STREAM-INF', '#EXT-X-I-FRAME-STREAM-INF',
        '#EXT-X-MEDIA', '#EXTINF', '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE',
        '#EXT-X-DISCONTINUITY-SEQUENCE', '#EXT-X-DISCONTINUITY', '#EXT-X-ENDLIST',
        '#EXT-X-PLAYLIST-TYPE', '#EXT-X-KEY', '#EXT-X-SESSION-KEY', '#EXT-X-MAP',
        '#EXT-X-PROGRAM-DATE-TIME', '#EXT-X-BYTERANGE', '#EXT-X-GAP', '#EXT-X-DATERANGE',
        '#EXT-X-START', '#EXT-X-SERVER-CONTROL', '#EXT-X-PART-INF', '#EXT-X-PART',
        '#EXT-X-PRELOAD-HINT', '#EXT-X-RENDITION-REPORT', '#EXT-X-SKIP',
        '#EXT-X-INDEPENDENT-SEGMENTS', '#EXT-X-SESSION-DATA', '#EXT-X-DEFINE',
        '#EXT-X-CONTENT-STEERING'
    ];
    /* Tags que SOLO pertenecen a una Media Playlist. En un catálogo son ruido de tipo:
     * para hls.js basta UNO de los de enrutado para cambiar de parser (medido t8). */
    const MEDIA_ROUTING_TAGS = {
        '#EXT-X-TARGETDURATION': 1, '#EXT-X-MEDIA-SEQUENCE': 1, '#EXT-X-DISCONTINUITY-SEQUENCE': 1,
        '#EXT-X-PLAYLIST-TYPE': 1, '#EXT-X-ENDLIST': 1
    };
    const MEDIA_ONLY_TAGS = {
        '#EXT-X-SERVER-CONTROL': 1, '#EXT-X-PART-INF': 1, '#EXT-X-PART': 1, '#EXT-X-PRELOAD-HINT': 1,
        '#EXT-X-SKIP': 1, '#EXT-X-RENDITION-REPORT': 1, '#EXT-X-START': 1, '#EXT-X-MAP': 1, '#EXT-X-BYTERANGE': 1
    };
    /* t7 · medido sobre los binarios de VLC: estos módulos de video-filter existen. */
    const VLC_FILTER_MODULES_MEASURED = { gradfun: 1, scale: 1, hqdn3d: 1 };
    /* t7 · VLC rechaza estas opciones desde playlist por política de seguridad ("unsafe option"). */
    const VLC_UNSAFE_OPTIONS = { 'video-filter': 1, 'avcodec-hw': 1 };
    /* t7 · registro ISA medido (kodiprop_key_audit.js + wiki ISA Integration). */
    const KODIPROP_VIGENTES = {
        'inputstream': 1, 'inputstream.adaptive.manifest_config': 1, 'inputstream.adaptive.manifest_headers': 1,
        'inputstream.adaptive.stream_headers': 1, 'inputstream.adaptive.stream_selection_type': 1
    };
    const KODIPROP_DEPRECADAS = {
        'inputstream.adaptive.live_delay': 1, 'inputstream.adaptive.manifest_type': 1,
        'inputstream.adaptive.manifest_update_parameter': 1, 'inputstream.adaptive.max_bandwidth': 1
    };
    const KODIPROP_NO_VERIFICADAS = { 'inputstream.adaptive.chooser_bandwidth_max': 1 };

    const RS = function (sev, why, ev) { return { sev: sev, why: why, ev: ev || null }; };

    const PLAYER_SEMANTICS = {
        hlsjs: {
            id: 'hlsjs',
            label: 'hls.js 1.5.17',
            evidence: 'measured',
            source: 't8 — parser real vendorizado EJECUTADO (artifacts/parsers/conformidad_rfc_hlsjs.md, _hlsjs_real_parse.json)',
            understands: HLS_STANDARD_TAGS.concat(['#EXT-X-ERROR']),
            tolerates: [
                'CODECS sin comillas: no rechaza, pero pierde audioCodec y FRAME-RATE',
                'RESOLUTION no WxH: no rechaza, deja width/height=null',
                'BANDWIDTH ausente: no rechaza, bitrate=null y la variante sobrevive',
                'FRAME-RATE en fracción y coma final de atributos: toleradas (medido t8)'
            ],
            rules: {
                media_routing_tag: RS('fatal', 'una sola línea hace isMediaPlaylist()=true: hls.js usa el parser de MEDIA y los STREAM-INF quedan INERTES (medido t8: 39/39 artefactos)'),
                media_only_tag_in_catalog: RS('error', 'tag de Media Playlist dentro del catálogo; refuerza el enrutado al parser de media (medido t8 L53/L54/L56)'),
                extinf_negative: RS('error', 'su regex es \\d*(?:\\.\\d+)?: -1 no casa, duration=0 y el resto de la línea se captura como URI falso (medido t8)'),
                extinf_non_numeric: RS('error', 'duración no numérica: duration=0 y el resto de la línea como URI (medido t8)'),
                session_key_none: RS('warning', 'hls.js lo rechaza con su propio warning [Keys] Ignoring invalid EXT-X-SESSION-KEY: "METHOD=NONE" (medido t8)'),
                uri_without_owner: RS('error', 'URI sin EXTINF/STREAM-INF: se consume como nivel o fragmento sin atributos'),
                extinf_without_uri: RS('error', 'EXTINF sin URI: el canal no tiene destino'),
                codecs_unquoted: RS('warning', 'no rechaza, pero pierde audioCodec y FRAME-RATE (corrupción silenciosa, t8/t9)'),
                resolution_not_wxh: RS('warning', 'no rechaza, pero deja width/height=null (t9)'),
                bandwidth_missing: RS('warning', 'no rechaza: bitrate=null y la variante sobrevive (medido t8)'),
                missing_extm3u: RS('error', 'RFC 8216 §4.3.1.1: la lista debe empezar por #EXTM3U', 'rfc')
            }
        },
        exoplayer: {
            id: 'exoplayer',
            label: 'ExoPlayer / Media3',
            evidence: 'repo-doctrine',
            source: 'doctrina del repo (HLS tolerante + traps EXTHTTP); NO ejecutado aquí',
            understands: HLS_STANDARD_TAGS.concat(['#EXT-X-ERROR']),
            tolerates: [
                'tags no-RFC (#EXT-X-APE-*, #EXTVLCOPT, #KODIPROP): desconocidos, ignorados por §6.3.1',
                'coma final de atributos y FRAME-RATE en fracción: toleradas por doctrina'
            ],
            rules: {
                missing_extm3u: RS('error', 'la lista debe empezar por #EXTM3U', 'rfc'),
                extinf_negative: RS('error', 'duración negativa: el parser HLS no la acepta como decimal', 'rfc'),
                extinf_non_numeric: RS('error', 'duración no numérica: EXTINF exige decimal', 'rfc'),
                codecs_unquoted: RS('error', 'CODECS es quoted-string en RFC 8216 §4.3.4.2', 'rfc'),
                resolution_not_wxh: RS('warning', 'RESOLUTION exige <width>x<height> en decimal', 'rfc'),
                bandwidth_missing: RS('error', 'BANDWIDTH es OBLIGATORIO en EXT-X-STREAM-INF (§4.3.4.2)', 'rfc'),
                uri_without_owner: RS('error', 'URI sin dueño: se pierde el canal o se duplica la entrada'),
                extinf_without_uri: RS('error', 'EXTINF sin URI: el canal no tiene destino'),
                exthttp_not_parsed: RS('error', 'OkHttp descarta TODAS las cabeceras si el EXTHTTP no es JSON válido'),
                multi_value_single_header: RS('warning', 'cabecera de valor único con coma: OkHttp puede rechazarla'),
                session_key_none: RS('warning', 'METHOD=NONE no define clave; se ignora'),
                media_routing_tag: RS('warning', 'no hay medición de que cambie el enrutado fuera de hls.js; se declara como ruido de tipo'),
                media_only_tag_in_catalog: RS('warning', 'tag de Media Playlist dentro de un catálogo', 'rfc')
            }
        },
        tivimate: {
            id: 'tivimate',
            label: 'TiviMate',
            evidence: 'repo-doctrine',
            source: 'doctrina del repo (tivimate-single-value-headers-enforcer, iptv-exthttp-traps-checklist); NO ejecutado aquí',
            understands: ['#EXTM3U', '#EXTINF', '#EXTGRP', '#EXTVLCOPT', '#EXTHTTP', '#EXT-X-STREAM-INF', '#EXT-X-MEDIA', '#EXT-X-KEY', '#EXT-X-MAP', '#EXT-X-VERSION', '#EXT-X-ENDLIST'],
            tolerates: ['#KODIPROP y #EXT-X-APE-*: desconocidos, ignorados por §6.3.1', '#EXTINF:-1: convención M3U Plus para listas de canales'],
            rules: {
                missing_extm3u: RS('error', 'la lista debe empezar por #EXTM3U', 'rfc'),
                extinf_missing_comma: RS('error', 'sin la coma de nombre el canal queda sin título visible'),
                multi_value_single_header: RS('error', 'TiviMate parsea sólo el PRIMER valor: una cabecera con coma se trunca (doctrina del repo)'),
                exthttp_not_parsed: RS('error', 'si el EXTHTTP no es JSON válido, pierde todas las cabeceras'),
                uri_without_owner: RS('error', 'URI sin dueño: entrada fantasma duplicada'),
                extinf_without_uri: RS('error', 'EXTINF sin URI: canal sin destino'),
                attr_with_space_unquoted: RS('warning', 'atributo sin comillas con espacio: el parser ingenuo corta el valor'),
                bandwidth_missing: RS('warning', 'BANDWIDTH ausente: no hay bitrate declarado para ABR'),
                codecs_unquoted: RS('warning', 'CODECS sin comillas: se pierde el códec declarado', 'rfc')
            }
        },
        ott: {
            id: 'ott',
            label: 'OTT Navigator',
            evidence: 'repo-doctrine',
            source: 'doctrina del repo; NO ejecutado aquí',
            understands: ['#EXTM3U', '#EXTINF', '#EXTGRP', '#EXTVLCOPT', '#EXTHTTP', '#EXT-X-STREAM-INF', '#EXT-X-MEDIA', '#EXT-X-KEY', '#EXT-X-MAP', '#EXT-X-VERSION', '#EXT-X-ENDLIST'],
            tolerates: ['#KODIPROP y #EXT-X-APE-*: ignorados por §6.3.1', '#EXTINF:-1: convención M3U Plus'],
            rules: {
                missing_extm3u: RS('error', 'la lista debe empezar por #EXTM3U', 'rfc'),
                extinf_missing_comma: RS('error', 'sin la coma de nombre el canal queda sin título visible'),
                exthttp_not_parsed: RS('error', 'si el EXTHTTP no es JSON válido, pierde todas las cabeceras'),
                uri_without_owner: RS('error', 'URI sin dueño: entrada fantasma duplicada'),
                extinf_without_uri: RS('error', 'EXTINF sin URI: canal sin destino'),
                attr_with_space_unquoted: RS('warning', 'atributo sin comillas con espacio: el valor se corta'),
                multi_value_single_header: RS('warning', 'cabecera de valor único con coma: puede truncarse'),
                codecs_unquoted: RS('warning', 'CODECS sin comillas: se pierde el códec declarado', 'rfc')
            }
        },
        smarters: {
            id: 'smarters',
            label: 'IPTV Smarters / XCIPTV',
            evidence: 'repo-doctrine',
            source: 'doctrina del repo; NO ejecutado aquí',
            understands: ['#EXTM3U', '#EXTINF', '#EXTGRP', '#EXTVLCOPT', '#EXTHTTP', '#EXT-X-STREAM-INF', '#EXT-X-MEDIA', '#EXT-X-KEY', '#EXT-X-MAP', '#EXT-X-VERSION', '#EXT-X-ENDLIST'],
            tolerates: ['#KODIPROP y #EXT-X-APE-*: ignorados por §6.3.1', '#EXTINF:-1: convención M3U Plus'],
            rules: {
                missing_extm3u: RS('error', 'la lista debe empezar por #EXTM3U', 'rfc'),
                extinf_missing_comma: RS('error', 'sin la coma de nombre el canal queda sin título visible'),
                exthttp_not_parsed: RS('error', 'si el EXTHTTP no es JSON válido, pierde todas las cabeceras'),
                uri_without_owner: RS('error', 'URI sin dueño: entrada fantasma duplicada'),
                extinf_without_uri: RS('error', 'EXTINF sin URI: canal sin destino'),
                attr_with_space_unquoted: RS('warning', 'atributo sin comillas con espacio: el valor se corta'),
                codecs_unquoted: RS('warning', 'CODECS sin comillas: se pierde el códec declarado', 'rfc')
            }
        },
        vlc: {
            id: 'vlc',
            label: 'VLC / libVLC',
            evidence: 'measured-partial',
            source: 't7 — registro real de opciones (vlc_token_scan.json, 365 binarios) + doctrina; el resto NO ejecutado',
            understands: HLS_STANDARD_TAGS.concat(['#EXTGRP', '#EXTVLCOPT']),
            tolerates: ['#KODIPROP, #EXTHTTP y #EXT-X-APE-*: desconocidos, ignorados por §6.3.1', '#EXTINF:-1: convención M3U Plus'],
            rules: {
                vlc_unsafe_option: RS('warning', 'VLC la ignora desde playlist por política de seguridad: "unsafe option … ignored for security reasons" (medido t7)'),
                vlc_module_missing: RS('warning', 'módulo de video-filter que NO existe en los binarios: "no video filter modules matched" + "Failed to create video filter"; el canal reproduce (medido t7)'),
                missing_extm3u: RS('error', 'la lista debe empezar por #EXTM3U', 'rfc'),
                extinf_without_uri: RS('error', 'EXTINF sin URI: canal sin destino'),
                uri_without_owner: RS('warning', 'URI sin dueño: VLC la intenta abrir como elemento'),
                media_routing_tag: RS('warning', 'no cambia el enrutado en VLC; ruido de tipo heredado', 'repo-doctrine')
            }
        },
        kodi: {
            id: 'kodi',
            label: 'Kodi / inputstream.adaptive',
            evidence: 'measured-partial',
            source: 't7 — registro ISA (kodiprop_key_audit.js: 10 vigentes / 5 deprecadas) + doctrina',
            understands: HLS_STANDARD_TAGS.concat(['#EXTGRP', '#KODIPROP']),
            tolerates: ['#EXTVLCOPT, #EXTHTTP y #EXT-X-APE-*: desconocidos, ignorados por §6.3.1', '#EXTINF:-1: convención M3U Plus'],
            rules: {
                kodiprop_deprecated: RS('warning', 'clave ISA deprecada: funciona según la versión y Kodi 22 ya no la lee (medido t7)'),
                kodiprop_non_namespace: RS('warning', 'clave fuera del registro ISA: ISA no la lee (medido t7)'),
                kodiprop_unverified: RS('warning', 'familia chooser_* no verificada contra la wiki de ISA (t7)'),
                missing_extm3u: RS('error', 'la lista debe empezar por #EXTM3U', 'rfc'),
                extinf_without_uri: RS('error', 'EXTINF sin URI: canal sin destino'),
                uri_without_owner: RS('warning', 'URI sin dueño: PVR IPTV Simple la descarta'),
                media_routing_tag: RS('warning', 'no cambia el enrutado en Kodi; ruido de tipo heredado', 'repo-doctrine')
            }
        },
        apple: {
            id: 'apple',
            label: 'Apple AVPlayer',
            evidence: 'rfc',
            source: 'RFC 8216 estricto (la rigurosidad de AVPlayer NO se ejecutó aquí)',
            understands: HLS_STANDARD_TAGS,
            tolerates: ['#EXTVLCOPT, #KODIPROP, #EXTHTTP y #EXT-X-APE-*: desconocidos, ignorados por §6.3.1 (las cabeceras van por sidecar)'],
            rules: {
                missing_extm3u: RS('error', 'la lista debe empezar por #EXTM3U (§4.3.1.1)'),
                extinf_negative: RS('error', 'EXTINF exige decimal no negativo (§4.3.2.1)'),
                extinf_non_numeric: RS('error', 'EXTINF exige decimal (§4.3.2.1)'),
                codecs_unquoted: RS('error', 'CODECS es quoted-string (§4.3.4.2)'),
                resolution_not_wxh: RS('error', 'RESOLUTION exige <width>x<height> (§4.3.4.2)'),
                bandwidth_missing: RS('error', 'BANDWIDTH es OBLIGATORIO (§4.3.4.2)'),
                media_routing_tag: RS('error', 'un catálogo no puede llevar tags de Media Playlist: mezcla de tipos'),
                media_only_tag_in_catalog: RS('error', 'tag exclusivo de Media Playlist dentro de un catálogo'),
                uri_without_owner: RS('error', 'URI sin EXTINF/STREAM-INF: rompe la secuencia'),
                extinf_without_uri: RS('error', 'EXTINF sin URI: rompe la secuencia'),
                trailing_comma_attrlist: RS('error', 'el ABNF del RFC no admite coma final en la lista de atributos')
            }
        }
    };

    const PLAYER_FAMILY_ALIASES = {
        'hls.js': 'hlsjs', hls: 'hlsjs', libvlc: 'vlc', avplayer: 'apple', ios: 'apple',
        'kodi-pvr': 'kodi', pvr: 'kodi', ottnavigator: 'ott', 'ott-navigator': 'ott',
        xciptv: 'smarters', 'iptv-smarters': 'smarters', android: 'exoplayer', 'android-tv': 'exoplayer'
    };

    function getPlayerSemantics(familyId) {
        const key = toStr(familyId || 'hlsjs').toLowerCase();
        return PLAYER_SEMANTICS[PLAYER_FAMILY_ALIASES[key] || key] || PLAYER_SEMANTICS.hlsjs;
    }

    function listPlayerFamilies() {
        return Object.keys(PLAYER_SEMANTICS).map(function (id) {
            const f = PLAYER_SEMANTICS[id];
            return {
                id: f.id, label: f.label, evidence: f.evidence, source: f.source,
                understands: f.understands.length,
                ruleKinds: Object.keys(f.rules).length
            };
        });
    }

    /* Detectores. Se ejecutan UNA vez por modelo y devuelven hallazgos por tipo:
     * cada familia decide DESPUÉS cuáles le duelen y con qué severidad. */
    function collectAuditFindings(model) {
        const F = Object.create(null);
        function add(kind, line, detail) {
            (F[kind] = F[kind] || []).push({ line: line || 0, detail: toStr(detail).slice(0, 120) });
        }
        if (!model || !Array.isArray(model.items)) return F;

        const isHls = model.kind === 'hls_master' || model.kind === 'hls_media';
        const isCatalog = model.kind === 'hls_master' || (model.channels && model.channels.length > 0);

        const firstItem = model.items.filter(function (it) { return it.type !== 'blank'; })[0];
        if (!firstItem || firstItem.tagUpper !== '#EXTM3U') {
            add('missing_extm3u', firstItem ? firstItem.lineNo : 1, firstItem ? toStr(firstItem.raw).slice(0, 60) : 'lista vacía');
        }

        const headRe = /(?:^|\s)([\w-]+)=([^",]*?)(?=\s+[\w-]+=|\s*$)/g;

        for (let i = 0; i < model.items.length; i++) {
            const it = model.items[i];
            if (it.type !== 'tag') continue;
            const tag = it.tagUpper || '';
            const ln = it.lineNo || (i + 1);
            const raw = toStr(it.raw);
            const body = toStr(it.body);

            if (isCatalog && MEDIA_ROUTING_TAGS[tag]) add('media_routing_tag', ln, tag);
            if (isCatalog && MEDIA_ONLY_TAGS[tag]) add('media_only_tag_in_catalog', ln, tag);

            if (tag === '#EXTINF') {
                const dm = /^\s*(-?\d+(?:\.\d+)?)\s*/.exec(body);
                /* #EXTINF:-1 es CONVENCIÓN M3U Plus en listas de canales; sólo es defecto
                 * cuando el documento se va a parsear como playlist HLS. */
                if (isHls) {
                    if (!dm) add('extinf_non_numeric', ln, body.slice(0, 60));
                    else if (parseFloat(dm[1]) < 0) add('extinf_negative', ln, dm[1]);
                }
                const comma = findUnquoted(body, ',');
                if (comma < 0) add('extinf_missing_comma', ln, body.slice(0, 60));
                const head = comma >= 0 ? body.slice(0, comma) : '';
                let hm;
                headRe.lastIndex = 0;
                while ((hm = headRe.exec(head)) !== null) {
                    if (/\s/.test(toStr(hm[2]).trim())) add('attr_with_space_unquoted', ln, hm[1] + '=' + hm[2]);
                }
            }

            if (tag === '#EXT-X-STREAM-INF') {
                const cm = /(^|,)\s*CODECS=([^,]*)/.exec(body);
                if (cm && toStr(cm[2]).trim().charAt(0) !== '"') add('codecs_unquoted', ln, cm[2]);
                const rm = /(^|,)\s*RESOLUTION=([^,]*)/.exec(body);
                if (rm && !/^\d+x\d+$/.test(toStr(rm[2]).trim())) add('resolution_not_wxh', ln, rm[2]);
                if (!/(^|,)\s*BANDWIDTH=\d+/.test(body)) add('bandwidth_missing', ln, body.slice(0, 60));
            }

            if (tag === '#EXT-X-SESSION-KEY' && /METHOD\s*=\s*NONE/i.test(body)) add('session_key_none', ln, 'METHOD=NONE');

            if (tag === '#EXTVLCOPT') {
                const p = parseVlcOpt(it.body);
                const key = toStr(p.key).toLowerCase();
                if (VLC_UNSAFE_OPTIONS[key]) add('vlc_unsafe_option', ln, p.key);
                if (key === 'video-filter') {
                    const missing = [];
                    toStr(p.value).split(',').forEach(function (seg) {
                        const name = toStr(seg).split('=')[0].trim().toLowerCase();
                        if (name && !VLC_FILTER_MODULES_MEASURED[name]) missing.push(name);
                    });
                    if (missing.length) add('vlc_module_missing', ln, missing.join(','));
                }
            }

            if (tag === '#KODIPROP') {
                const key = toStr(parseKodiProp(it.body).key);
                if (KODIPROP_DEPRECADAS[key]) add('kodiprop_deprecated', ln, key);
                else if (KODIPROP_NO_VERIFICADAS[key]) add('kodiprop_unverified', ln, key);
                else if (!KODIPROP_VIGENTES[key]) add('kodiprop_non_namespace', ln, key);
            }

            if (tag === '#EXTHTTP' || tag === '#EXT-X-APE-HTTP-HEADERS') {
                const p = parseExtHttp(it.body);
                if (!Object.keys(p.headers).length) add('exthttp_not_parsed', ln, p.format);
                Object.keys(p.headers).forEach(function (k) {
                    if (/^(user-agent|referer|origin)$/i.test(k) && toStr(p.headers[k]).indexOf(',') !== -1) {
                        add('multi_value_single_header', ln, k);
                    }
                });
            }

            if (/^#EXT-X-[A-Z0-9-]+:/.test(raw.trim()) && /,$/.test(raw.trim())) add('trailing_comma_attrlist', ln, tag);
        }

        (model.quarantine || []).forEach(function (q) {
            if (!q) return;
            if (q.type === 'uri') add('uri_without_owner', q.lineNo || 0, q.reason || 'URI sin EXTINF/STREAM-INF');
            else if (toStr(q.reason).indexOf('sin URI') !== -1) add('extinf_without_uri', q.lineNo || 0, q.reason || '');
        });

        return F;
    }

    /**
     * Audita un modelo contra la semántica de UNA familia de player.
     * No usa coincidencias de texto: resuelve pertenencia contra `understands` y aplica
     * la tabla de reglas de la familia sobre los hallazgos de los detectores.
     * @param {Object} model
     * @param {string} familyId  hlsjs|exoplayer|tivimate|ott|smarters|vlc|kodi|apple
     * @returns {{family,label,evidence,source,kind,understood:Array,ignored:Array,rejected:Array,counts:Object,verdict:string}}
     */
    function auditFor(model, familyId) {
        const fam = getPlayerSemantics(familyId);
        const res = {
            family: fam.id,
            label: fam.label,
            evidence: fam.evidence,
            source: fam.source,
            kind: model ? model.kind : 'unknown',
            understood: [],
            ignored: [],
            rejected: [],
            counts: { understoodTags: 0, understoodLines: 0, ignoredTags: 0, ignoredLines: 0, uriLines: 0, rejected: 0, fatal: 0, error: 0, warning: 0 },
            verdict: 'FAIL'
        };
        if (!model || !Array.isArray(model.items)) return res;

        const understands = Object.create(null);
        fam.understands.forEach(function (t) { understands[String(t).toUpperCase()] = 1; });

        const uMap = Object.create(null);
        const iMap = Object.create(null);
        let uriLines = 0;

        for (let i = 0; i < model.items.length; i++) {
            const it = model.items[i];
            if (!it) continue;
            if (it.type === 'uri') { uriLines++; continue; }
            if (it.type !== 'tag') continue;
            const tag = it.tagUpper || '';
            const bucket = understands[tag] ? uMap : iMap;
            const rec = bucket[tag] || (bucket[tag] = { tag: tag, count: 0, line: it.lineNo || 0 });
            rec.count++;
            if (!rec.line) rec.line = it.lineNo || 0;
        }

        function toSortedList(map) {
            return Object.keys(map).map(function (k) { return map[k]; })
                .sort(function (a, b) { return (b.count - a.count) || (a.tag < b.tag ? -1 : 1); });
        }
        res.understood = toSortedList(uMap);
        res.ignored = toSortedList(iMap).map(function (r) {
            return { tag: r.tag, count: r.count, line: r.line, basis: 'RFC 8216 §6.3.1: tag desconocido → ignorar (legal, no es defecto)' };
        });

        const findings = collectAuditFindings(model);
        Object.keys(fam.rules).forEach(function (kind) {
            const rule = fam.rules[kind];
            const hits = findings[kind] || [];
            for (let i = 0; i < hits.length; i++) {
                res.rejected.push({
                    line: hits[i].line,
                    reason: rule.why,
                    detail: hits[i].detail,
                    kind: kind,
                    severity: rule.sev,
                    evidence: rule.ev || fam.evidence
                });
            }
        });
        res.rejected.sort(function (a, b) { return a.line - b.line; });

        res.counts.understoodTags = res.understood.length;
        res.counts.understoodLines = res.understood.reduce(function (a, r) { return a + r.count; }, 0) + uriLines;
        res.counts.ignoredTags = res.ignored.length;
        res.counts.ignoredLines = res.ignored.reduce(function (a, r) { return a + r.count; }, 0);
        res.counts.uriLines = uriLines;
        res.counts.rejected = res.rejected.length;
        res.rejected.forEach(function (r) {
            if (r.severity === 'fatal') res.counts.fatal++;
            else if (r.severity === 'error') res.counts.error++;
            else res.counts.warning++;
        });
        res.verdict = (res.counts.fatal + res.counts.error) > 0 ? 'FAIL' : 'PASS';
        return res;
    }

    /** Audita el modelo contra TODAS las familias. Devuelve {families, summary}. */
    function auditAll(model) {
        const families = {};
        const summary = {};
        Object.keys(PLAYER_SEMANTICS).forEach(function (id) {
            const r = auditFor(model, id);
            families[id] = r;
            summary[id] = {
                verdict: r.verdict,
                fatal: r.counts.fatal,
                error: r.counts.error,
                warning: r.counts.warning,
                understoodLines: r.counts.understoodLines,
                ignoredLines: r.counts.ignoredLines
            };
        });
        return { families: families, summary: summary };
    }

    // ───────────────────────────────────────────────────────────────────────
    // API PÚBLICA
    // ───────────────────────────────────────────────────────────────────────

    const APEMultiParser = {
        VERSION: VERSION,
        LAYER: LAYER,
        DIALECTS: DIALECT_DEFS,
        ALIASES: DIALECT_ALIASES,
        DEFAULT_BUNDLE_DIALECTS: DEFAULT_BUNDLE_DIALECTS.slice(),
        parseAttrList: parseAttrList,
        parseExtinf: parseExtinf,
        parseTagLine: parseTagLine,
        classifyTag: classifyTag,
        parseExtHttp: parseExtHttp,
        parseVlcOpt: parseVlcOpt,
        parseKodiProp: parseKodiProp,
        sanitizeHeaders: sanitizeHeaders,
        isToxicHeader: isToxicHeader,
        detect: function (text, opts) {
            const model = parse(text, opts);
            return {
                kind: model.kind,
                channels: model.channels.length,
                variants: model.hls.variants.length,
                segments: model.hls.segments.length,
                hasVlc: model.stats.tags.vlc > 0,
                hasKodi: model.stats.tags.kodi > 0,
                hasHttp: model.stats.tags.http > 0,
                hasApe: model.stats.tags.ape > 0,
                unknownTags: model.stats.unknownTags,
                warnings: model.warnings.slice()
            };
        },
        parse: parse,
        parseAny: parse,
        modelFromChannels: modelFromChannels,
        getDialect: getDialect,
        getDialectList: getDialectList,
        getCapabilities: getCapabilities,
        render: render,
        renderForPlayer: render,
        renderBundle: renderBundle,
        buildBundleZip: buildBundleZip,
        exportAllDialects: buildBundleZip,
        buildZip: buildZip,
        buildReport: buildReport,
        buildManifest: buildManifest,
        validateModel: validateModel,
        compareModels: compareModels,
        diagnose: diagnose,
        /* H-3 · semánticas por familia de player (understood / ignored §6.3.1 / rejected) */
        PLAYER_SEMANTICS: PLAYER_SEMANTICS,
        getPlayerSemantics: getPlayerSemantics,
        listPlayerFamilies: listPlayerFamilies,
        auditFor: auditFor,
        auditAll: auditAll,
        hash32: hash32
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEMultiParser;
    } else {
        global.APEMultiParser = APEMultiParser;
        // Compatibilidad con el stack existente: no lo sustituye, le añade
        // la capa de documento completo y el renderizador de dialectos.
        if (global.APEUniversalParserStack && typeof global.APEUniversalParserStack === 'object') {
            if (!global.APEUniversalParserStack.parseDocument) {
                global.APEUniversalParserStack.parseDocument = parse;
            }
            if (!global.APEUniversalParserStack.renderDialect) {
                global.APEUniversalParserStack.renderDialect = render;
            }
            if (!global.APEUniversalParserStack.exportAllDialects) {
                global.APEUniversalParserStack.exportAllDialects = buildBundleZip;
            }
        }
    }

})(typeof window !== 'undefined' ? window : globalThis);
