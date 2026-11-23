/**
 * frontend/js/ape-v9/muestra-12p-import.js
 * ---------------------------------------------------------------------------
 * Lector PURO de los dos artefactos que el operador entregó (ronda 15):
 *
 *   1. contracts/muestra-12p/            ← el ZIP "MUESTRA_12P_MASTERLIST"
 *      (44 ficheros de texto: metadata, matriz de perfiles, 12 masters, 12
 *       playlists, sidecar, validaciones y manifest de hashes)
 *   2. contracts/lab/…_v9.3.json         ← el JSON "…LAB_CALIBRATED_BULLETPROOF(3)"
 *
 * Qué hace: convierte los tres formatos que hablan de los mismos doce perfiles
 * (METADATA_12P.json, PROFILE_MATRIX_12P.csv y zip_calibration del JSON v9.3)
 * a UNA sola fila canónica, y ofrece la comparación celda a celda entre ellos.
 * Así la app puede comprobar que las tres fuentes dicen lo mismo en vez de
 * confiar en ninguna.
 *
 * Qué NO hace (límite honesto):
 *   - No lee ficheros: recibe el texto o el objeto ya cargado. Sin red, sin
 *     disco, sin DOM.
 *   - No inventa números: un campo que falta queda `null`, nunca 0.
 *   - No decide política: el techo de buffer lo sigue aplicando
 *     lab-12p-conformance.js y la demanda buffer-input-demand.js.
 *   - No reproduce ni un canal de vídeo: nada de esto se ha visto en un player.
 *
 * UMD: `module.exports` en node, `window.APE_MUESTRA_12P` en el navegador.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.APE_MUESTRA_12P = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var VERSION = '1.0.0';

    /* Los doce perfiles en el orden del contrato: seis reales y sus .5. */
    var ORDER = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5',
        'P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'];

    /* Los nueve campos que las TRES fuentes declaran del mismo perfil. */
    var PROFILE_FIELDS = ['resolution', 'bitrate_mbps', 'max_kbps', 'avg_kbps',
        'fps', 'codec_string', 'video_range', 'declared_target_s',
        'effective_target_s'];

    /* Las once etiquetas globales de cabecera del master de la muestra. */
    var MASTER_TAGS = ['#EXT-X-APE-CATALOG', '#EXT-X-APE-CATALOG-TYPE',
        '#EXT-X-APE-PROFILE-COUNT', '#EXT-X-APE-CHANNEL',
        '#EXT-X-APE-SOURCE-TRUTH', '#EXT-X-APE-EXECUTION',
        '#EXT-X-APE-NOTICE'];

    /* Los seis atributos que cada #EXT-X-STREAM-INF de la muestra declara. */
    var STREAM_INF_ATTRS = ['BANDWIDTH', 'AVERAGE-BANDWIDTH', 'CODECS',
        'RESOLUTION', 'FRAME-RATE', 'VIDEO-RANGE'];

    /* ── utilidades numéricas: nunca inventar ─────────────────────────────── */

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function txt(v) {
        return (v === null || v === undefined) ? null : String(v);
    }

    function isObj(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    }

    /* Acepta objeto ya parseado o el texto JSON tal cual. */
    function asObject(input, what) {
        if (isObj(input)) return input;
        if (typeof input !== 'string') {
            throw new TypeError(what + ': se esperaba objeto o texto JSON');
        }
        return JSON.parse(input);
    }

    /* ── CSV: RFC 4180 mínimo (comillas, comas y saltos dentro de comillas) ─
     * Hace falta de verdad: el codec_string de la muestra es "dvh1.08.06,ac-3"
     * y una coma a pelo desplaza las dieciocho columnas.                      */

    function parseCsv(text) {
        var s = String(text);
        var rows = [], row = [], field = '', inQ = false, i = 0;
        while (i < s.length) {
            var c = s.charAt(i);
            if (inQ) {
                if (c === '"') {
                    if (s.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
                    inQ = false; i++; continue;
                }
                field += c; i++; continue;
            }
            if (c === '"') { inQ = true; i++; continue; }
            if (c === ',') { row.push(field); field = ''; i++; continue; }
            if (c === '\r') { i++; continue; }
            if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
            field += c; i++;
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        return rows.filter(function (r) {
            return r.length > 1 || (r.length === 1 && String(r[0]).trim() !== '');
        });
    }

    /* ── las tres fuentes, a la misma fila canónica ──────────────────────── */

    function rowFromMatrix(o) {
        return {
            id: txt(o.id),
            name: txt(o.name),
            resolution: txt(o.resolution),
            bitrate_mbps: num(o.bitrate_mbps),
            max_kbps: num(o.max_kbps),
            avg_kbps: num(o.avg_kbps),
            fps: num(o.fps),
            codec_string: txt(o.codec_string),
            video_range: txt(o.video_range),
            declared_target_s: num(o.declared_target_s),
            effective_target_s: num(o.effective_target_s),
            min_ms: num(o.min_ms),
            max_ms: num(o.max_ms),
            exo_min_ms: num(o.exo_min_ms),
            exo_max_ms: num(o.exo_max_ms),
            startup_ms: num(o.startup_ms),
            resume_ms: num(o.resume_ms),
            source: 'PROFILE_MATRIX_12P.csv'
        };
    }

    function rowFromMetadata(p) {
        var st = isObj(p.settings) ? p.settings : {};
        var de = isObj(p.declared) ? p.declared : {};
        var ef = isObj(p.effective) ? p.effective : {};
        var hl = isObj(p.hls) ? p.hls : {};
        var pf = isObj(hl.prefetch) ? hl.prefetch : {};
        var ex = isObj(p.execution) ? p.execution : {};
        return {
            id: txt(p.id),
            name: txt(p.name),
            resolution: txt(st.resolution || p.resolution),
            bitrate_mbps: num(st.bitrate),
            max_kbps: num(st.maxBitrateKbps),
            avg_kbps: num(st.avgBitrateKbps),
            fps: num(st.fps),
            codec_string: txt(st.codec_string),
            video_range: txt(st.video_range),
            declared_target_s: num(de.buffer_target_s),
            effective_target_s: num(ef.target_s),
            min_ms: num(ef.min_ms),
            max_ms: num(ef.max_ms),
            exo_min_ms: num(ef.exo_min_ms),
            exo_max_ms: num(ef.exo_max_ms),
            startup_ms: num(ef.startup_ms),
            resume_ms: num(ef.resume_ms),
            segment_s: num(st.segment_duration_s),
            is_emulated: p.is_emulated === undefined ? null : !!p.is_emulated,
            base_profile: txt(p.base_profile),
            master_uri: txt(hl.master_uri),
            media_uri: txt(hl.media_uri),
            target_duration: num(hl.target_duration),
            segment_count: num(hl.segment_count),
            prefetch_segments: num(pf.segments !== undefined ? pf.segments : ef.prefetch_segments),
            parallel_downloads: num(pf.parallel !== undefined ? pf.parallel : ef.parallel_downloads),
            low_latency_mode: ef.low_latency_mode === undefined ? null : !!ef.low_latency_mode,
            policy_cap_s: num(ef.policy_cap_s),
            source_truth: txt(p.source_truth),
            execution_status: txt(ex.status),
            source: 'METADATA_12P.json'
        };
    }

    function rowFromLab(p) {
        var st = isObj(p.settings) ? p.settings : {};
        var zc = isObj(p.zip_calibration) ? p.zip_calibration : {};
        var mm = isObj(zc.profile_matrix_match) ? zc.profile_matrix_match : {};
        return {
            id: txt(p.id),
            name: txt(p.name),
            resolution: txt(mm.resolution || st.resolution),
            bitrate_mbps: num(mm.bitrate_mbps !== undefined ? mm.bitrate_mbps : st.bitrate),
            max_kbps: num(mm.max_kbps !== undefined ? mm.max_kbps : st.maxBitrateKbps),
            avg_kbps: num(mm.avg_kbps !== undefined ? mm.avg_kbps : st.avgBitrateKbps),
            fps: num(mm.fps !== undefined ? mm.fps : st.fps),
            codec_string: txt(mm.codec_string || st.codec_string),
            video_range: txt(mm.video_range || st.video_range),
            declared_target_s: num(mm.declared_target_s !== undefined ? mm.declared_target_s : st.bufferTargetSec),
            effective_target_s: num(mm.effective_target_s !== undefined ? mm.effective_target_s : st.bufferEffectiveSec),
            declared_raw: st.bufferTargetSec === undefined ? null : String(st.bufferTargetSec),
            is_emulated: p.is_emulated === undefined ? null : !!p.is_emulated,
            base_profile: txt(p.base_profile),
            source: 'zip_calibration (LAB v9.3)'
        };
    }

    /* ── lectores ─────────────────────────────────────────────────────────── */

    function readMetadata(input) {
        var o = asObject(input, 'METADATA_12P');
        var byId = {}, rows = [];
        var src = isObj(o.profiles) ? o.profiles : {};
        for (var k in src) {
            if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
            var row = rowFromMetadata(src[k]);
            if (!row.id) row.id = k;
            byId[row.id] = row; rows.push(row);
        }
        return {
            channel: isObj(o.channel) ? o.channel : null,
            meta: isObj(o._meta) ? o._meta : {},
            order: orderOf(byId),
            byId: byId,
            rows: rows,
            count: rows.length
        };
    }

    function readLab(input) {
        var o = asObject(input, 'LAB v9.3');
        var byId = {}, rows = [];
        var src = isObj(o.profiles) ? o.profiles : {};
        for (var k in src) {
            if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
            var row = rowFromLab(src[k]);
            if (!row.id) row.id = k;
            byId[row.id] = row; rows.push(row);
        }
        return {
            meta: isObj(o._meta) ? o._meta : {},
            order: orderOf(byId),
            byId: byId,
            rows: rows,
            count: rows.length
        };
    }

    function readMatrix(input) {
        var text = typeof input === 'string' ? input : String(input);
        var grid = parseCsv(text);
        if (!grid.length) return { header: [], rows: [], byId: {}, count: 0 };
        var header = grid[0].map(function (h) { return String(h).trim(); });
        var rows = [], byId = {};
        for (var i = 1; i < grid.length; i++) {
            var o = {};
            for (var c = 0; c < header.length; c++) o[header[c]] = grid[i][c];
            var row = rowFromMatrix(o);
            rows.push(row); byId[row.id] = row;
        }
        return { header: header, rows: rows, byId: byId, count: rows.length };
    }

    function orderOf(byId) {
        var out = ORDER.filter(function (id) { return !!byId[id]; });
        Object.keys(byId).forEach(function (id) {
            if (out.indexOf(id) === -1) out.push(id);
        });
        return out;
    }

    /* ── comparación celda a celda ───────────────────────────────────────── */

    function sameCell(a, b) {
        if (a === null && b === null) return true;
        if (a === null || b === null) return false;
        if (typeof a === 'number' || typeof b === 'number') {
            return Number(a) === Number(b);
        }
        return String(a) === String(b);
    }

    /**
     * Compara dos juegos de filas (a y b) en los nueve campos del perfil.
     * Devuelve cuántas celdas se compararon, cuántas coinciden y la lista de
     * diferencias. Nunca lanza: una fila ausente cuenta como diferencia.
     */
    function agree(a, b, fields) {
        var f = fields || PROFILE_FIELDS;
        var ids = ORDER.slice();
        Object.keys(a.byId).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
        Object.keys(b.byId).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
        var cells = 0, matched = 0, diffs = [];
        ids.forEach(function (id) {
            var ra = a.byId[id], rb = b.byId[id];
            if (!ra || !rb) {
                diffs.push({ id: id, field: '(perfil)', a: !!ra, b: !!rb });
                cells += f.length;
                return;
            }
            f.forEach(function (k) {
                cells++;
                var va = ra[k] === undefined ? null : ra[k];
                var vb = rb[k] === undefined ? null : rb[k];
                if (sameCell(va, vb)) matched++;
                else diffs.push({ id: id, field: k, a: va, b: vb });
            });
        });
        return {
            fields: f.slice(),
            profiles: ids.length,
            cells: cells,
            matched: matched,
            same: diffs.length === 0,
            diffs: diffs
        };
    }

    /* ── demanda de entrada por perfil (usa el módulo de la ronda 14) ────── */

    function bufferModule(dep) {
        if (dep) return dep;
        if (typeof module === 'object' && module.exports) {
            try { return require('./buffer-input-demand.js'); } catch (e) { return null; }
        }
        var g = typeof self !== 'undefined' ? self : null;
        return (g && g.APE_BUF_DEMAND) || null;
    }

    /**
     * output_bps sale del bitrate DECLARADO del perfil (Mbps → bps), nunca de
     * un valor inventado; required_bps = la regla exacta del módulo de la
     * ronda 14. Si no hay bitrate, devuelve null y lo dice.
     */
    function demand(row, deltaPct, dep) {
        var mod = bufferModule(dep);
        if (!mod || typeof mod.requiredBps !== 'function') {
            return { id: row.id, computed: false, why: 'modulo buffer-input-demand no disponible' };
        }
        if (row.bitrate_mbps === null || row.bitrate_mbps === undefined) {
            return { id: row.id, computed: false, why: 'el perfil no declara bitrate' };
        }
        var out = Math.round(row.bitrate_mbps * 1000000);
        var d = mod.deltaPct(deltaPct === undefined ? 10 : deltaPct);
        var req = mod.requiredBps(out, d);
        return {
            id: row.id,
            computed: true,
            output_bps: out,
            delta_pct: d,
            required_bps: req,
            extra_bps: req - out,
            rule: 'input_bps >= output_bps + ceil(output_bps*delta_pct/100)'
        };
    }

    function demandRows(rows, deltaPct, dep) {
        return rows.map(function (r) { return demand(r, deltaPct, dep); });
    }

    /* ── estructura de un master HLS ─────────────────────────────────────── */

    function attrsOf(line) {
        var out = {}, s = line.slice(line.indexOf(':') + 1), buf = '', inQ = false, parts = [];
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            if (c === '"') { inQ = !inQ; buf += c; continue; }
            if (c === ',' && !inQ) { parts.push(buf); buf = ''; continue; }
            buf += c;
        }
        if (buf) parts.push(buf);
        parts.forEach(function (p) {
            var eq = p.indexOf('=');
            if (eq < 0) return;
            var k = p.slice(0, eq).trim();
            var v = p.slice(eq + 1).trim();
            if (v.length > 1 && v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') {
                v = v.slice(1, -1);
            }
            out[k] = v;
        });
        return out;
    }

    /**
     * Lee un master HLS y dice si cumplen la regla que el propio ZIP declara:
     * cada #EXT-X-STREAM-INF va seguido INMEDIATAMENTE de la URI de su
     * variante. Devuelve las variantes, las etiquetas globales y las
     * violaciones con su número de línea.
     */
    function masterReport(text) {
        var lines = String(text).split(/\r?\n/);
        var globals = [], variants = [], violations = [], profileTags = 0, lastProfile = null;
        for (var i = 0; i < lines.length; i++) {
            var l = lines[i];
            if (!l) continue;
            if (l.indexOf('#EXT-X-STREAM-INF:') === 0) {
                var nxt = lines[i + 1];
                var uri = (nxt && nxt.charAt(0) !== '#' && nxt.trim() !== '') ? nxt.trim() : null;
                if (!uri) violations.push(i + 1);
                variants.push({
                    line: i + 1,
                    profile: lastProfile,
                    uri: uri,
                    attrs: attrsOf(l),
                    adjacent: !!uri
                });
                continue;
            }
            if (l.indexOf('#EXT-X-APE-PROFILE:') === 0) {
                profileTags++; lastProfile = l.slice('#EXT-X-APE-PROFILE:'.length).trim();
                continue;
            }
            for (var t = 0; t < MASTER_TAGS.length; t++) {
                if (l.indexOf(MASTER_TAGS[t] + ':') === 0) globals.push(MASTER_TAGS[t]);
            }
        }
        return {
            lines: lines.length,
            globals: globals,
            variants: variants,
            violations: violations,
            profile_tags: profileTags,
            manifests: (lines[0] || '').trim() === '#EXTM3U'
        };
    }

    /* ── invariantes propias (sin mirar datos del operador) ──────────────── */

    function validate() {
        var v = [];
        v.push({ id: 'V1', ok: ORDER.length === 12, detail: 'doce perfiles en ORDER' });
        v.push({
            id: 'V2',
            ok: ORDER.filter(function (x, i) { return ORDER.indexOf(x) === i; }).length === 12,
            detail: 'sin identificadores repetidos'
        });
        var g = parseCsv('a,"b,c",d\r\n1,2,3\n');
        v.push({
            id: 'V3',
            ok: g.length === 2 && g[0].length === 3 && g[0][1] === 'b,c',
            detail: 'el CSV respeta las comillas y el CRLF'
        });
        v.push({ id: 'V4', ok: num('63') === 63 && num('') === null && num('x') === null, detail: 'num() no inventa' });
        v.push({
            id: 'V5',
            ok: PROFILE_FIELDS.length === 9 && MASTER_TAGS.length === 7 && STREAM_INF_ATTRS.length === 6,
            detail: 'las listas de campos son las declaradas'
        });
        var a = attrsOf('#EXT-X-STREAM-INF:BANDWIDTH=1,CODECS="dvh1.08.06,ac-3",RESOLUTION=7680x4320');
        v.push({
            id: 'V6',
            ok: a.BANDWIDTH === '1' && a.CODECS === 'dvh1.08.06,ac-3' && a.RESOLUTION === '7680x4320',
            detail: 'las comillas protegen las comas de CODECS'
        });
        return { version: VERSION, checks: v, ok: v.every(function (x) { return x.ok; }) };
    }

    return {
        VERSION: VERSION,
        ORDER: ORDER,
        PROFILE_FIELDS: PROFILE_FIELDS,
        MASTER_TAGS: MASTER_TAGS,
        STREAM_INF_ATTRS: STREAM_INF_ATTRS,
        parseCsv: parseCsv,
        attrsOf: attrsOf,
        readMetadata: readMetadata,
        readLab: readLab,
        readMatrix: readMatrix,
        rowFromMetadata: rowFromMetadata,
        rowFromLab: rowFromLab,
        rowFromMatrix: rowFromMatrix,
        agree: agree,
        demand: demand,
        demandRows: demandRows,
        masterReport: masterReport,
        validate: validate
    };
}));
